import type { Run, StravaShoe, StravaState } from './types'
import { CHALLENGE_START } from './challenge'

const AUTH_URL = 'https://www.strava.com/oauth/authorize'
const TOKEN_URL = 'https://www.strava.com/oauth/token'
const API = 'https://www.strava.com/api/v3'
const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun']

/** The page Strava sends you back to after authorising (this app's own URL) */
export const redirectUri = () => window.location.origin + window.location.pathname

export function authorizeUrl(clientId: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    approval_prompt: 'auto',
    scope: 'read,activity:read_all,profile:read_all',
  })
  return `${AUTH_URL}?${q}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: StravaState['athlete']
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Strava token error ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function exchangeCode(s: StravaState, code: string, scope?: string): Promise<StravaState> {
  const t = await tokenRequest({
    client_id: s.clientId, client_secret: s.clientSecret, code, grant_type: 'authorization_code',
  })
  return { ...s, scope, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at, athlete: t.athlete ?? s.athlete }
}

/** Returns a state with a valid (refreshed if needed) access token */
export async function ensureToken(s: StravaState): Promise<StravaState> {
  if (!s.refreshToken) throw new Error('Not connected to Strava')
  if (s.accessToken && s.expiresAt && s.expiresAt - 120 > Date.now() / 1000) return s
  const t = await tokenRequest({
    client_id: s.clientId, client_secret: s.clientSecret, refresh_token: s.refreshToken, grant_type: 'refresh_token',
  })
  return { ...s, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at }
}

async function api<T>(s: StravaState, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${s.accessToken}` } })
  if (res.status === 429) throw new Error('Strava rate limit reached — try again in 15 minutes.')
  if (!res.ok) throw new Error(`Strava API error ${res.status}: ${await res.text()}`)
  return res.json()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapSummary(a: any): Run {
  return {
    id: `strava-${a.id}`,
    source: 'strava',
    // start_date_local is local wall-clock time (Strava marks it with a Z anyway)
    date: String(a.start_date_local).slice(0, 10),
    startLocal: String(a.start_date_local),
    name: a.name,
    distanceM: a.distance,
    movingTimeS: a.moving_time,
    elapsedTimeS: a.elapsed_time,
    avgHr: a.average_heartrate,
    maxHr: a.max_heartrate,
    elevGainM: a.total_elevation_gain,
    cadence: a.average_cadence ? a.average_cadence * 2 : undefined,
    sufferScore: a.suffer_score ?? undefined,
    gearId: a.gear_id ?? undefined,
  }
}

function mapDetail(base: Run, a: any): Run {
  const bestEfforts: Record<string, number> = {}
  for (const e of a.best_efforts ?? []) bestEfforts[e.name] = e.elapsed_time
  return {
    ...base,
    laps: (a.laps ?? []).map((l: any) => ({ distanceM: l.distance, movingTimeS: l.moving_time, avgHr: l.average_heartrate, maxHr: l.max_heartrate, cadence: l.average_cadence ? l.average_cadence * 2 : undefined })),
    splits: (a.splits_metric ?? []).map((l: any) => ({ distanceM: l.distance, movingTimeS: l.moving_time, avgHr: l.average_heartrate, elevDiff: l.elevation_difference })),
    calories: a.calories ?? undefined,
    bestEfforts,
    detailFetched: true,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SyncResult {
  strava: StravaState
  runs: Run[]
  newCount: number
}

/**
 * Pull runs from Strava. First sync looks back 8 weeks so the coach can
 * estimate your fitness; later syncs only fetch what's new.
 */
export async function syncRuns(state: StravaState, existing: Run[], onProgress?: (msg: string) => void): Promise<SyncResult> {
  let s = await ensureToken(state)
  // First sync: 4 weeks before the challenge for training-load context
  const after = s.lastSync ? s.lastSync - 3 * 86400 : Math.floor(new Date(CHALLENGE_START + 'T00:00:00').getTime() / 1000) - 28 * 86400
  const byId = new Map(existing.map((r) => [r.id, r]))
  let newCount = 0

  onProgress?.('Fetching activities…')
  for (let page = 1; page <= 5; page++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await api<any[]>(s, `/athlete/activities?after=${after}&per_page=100&page=${page}`)
    for (const a of list) {
      if (!RUN_TYPES.includes(a.sport_type ?? a.type)) continue
      const run = mapSummary(a)
      const prev = byId.get(run.id)
      if (!prev) newCount++
      byId.set(run.id, { ...prev, ...run, laps: prev?.laps, splits: prev?.splits, calories: prev?.calories, bestEfforts: prev?.bestEfforts, detailFetched: prev?.detailFetched })
    }
    if (list.length < 100) break
  }

  // Fetch details (laps + best efforts) for recent runs that don't have them yet
  const needDetail = [...byId.values()]
    .filter((r) => r.source === 'strava' && !r.detailFetched)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 25)
  let i = 0
  for (const r of needDetail) {
    onProgress?.(`Reading run details ${++i}/${needDetail.length}…`)
    try {
      s = await ensureToken(s)
      const detail = await api(s, `/activities/${r.id.replace('strava-', '')}`)
      byId.set(r.id, mapDetail(r, detail))
    } catch (e) {
      console.warn('detail fetch failed', e)
      break
    }
  }

  // Shoes and their mileage (needs profile:read_all)
  let shoes = s.shoes
  try {
    s = await ensureToken(s)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const athlete = await api<any>(s, '/athlete')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(athlete.shoes)) shoes = athlete.shoes.map((g: any): StravaShoe => ({ id: g.id, name: g.name, distanceKm: (g.distance ?? 0) / 1000 }))
  } catch (e) {
    console.warn('athlete fetch failed', e)
  }

  return {
    strava: { ...s, shoes, lastSync: Math.floor(Date.now() / 1000) },
    runs: [...byId.values()].sort((a, b) => b.startLocal.localeCompare(a.startLocal)),
    newCount,
  }
}
