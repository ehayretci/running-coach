export type SessionType =
  | 'easy' | 'recovery' | 'long' | 'intervals' | 'tempo' | 'goalpace'
  | 'timetrial' | 'race' | 'rest' | 'shakeout' | 'cross'

export type ShoeId = 'vomero' | 'vaporfly' | 'cloudmonster' | 'none'

export interface PlannedSession {
  id: string
  date: string // YYYY-MM-DD
  type: SessionType
  title: string
  distanceKm: number
  /** Step-by-step workout, e.g. "2 km warm-up · 5 × 1 km @ 3:58 (90 s jog) · 1.5 km cool-down" */
  details: string
  /** Main-set pace window, sec/km (0 = not applicable) */
  paceMin: number
  paceMax: number
  /** Heart-rate window for the main set, bpm (0 = not applicable) */
  hrMin: number
  hrMax: number
  shoe: ShoeId
  /** Why this session, why this shoe */
  why: string
  /** Warm-up, fuelling, form cues, surface, etc. */
  tips: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  at: number
}

export interface WeekPlan {
  weekStart: string // Monday
  notes: string
  runDays: number[]
  summary: string
  sessions: PlannedSession[]
  chat: ChatMessage[]
  source: 'ai' | 'rules'
  generatedAt: number
}

export interface Lap {
  distanceM: number
  movingTimeS: number
  avgHr?: number
  maxHr?: number
  cadence?: number
}

export interface Split {
  distanceM: number
  movingTimeS: number
  avgHr?: number
  elevDiff?: number
}

export interface Run {
  id: string
  source: 'strava' | 'manual'
  date: string // YYYY-MM-DD (local)
  startLocal: string
  name: string
  distanceM: number
  movingTimeS: number
  elapsedTimeS: number
  avgHr?: number
  maxHr?: number
  elevGainM?: number
  cadence?: number
  sufferScore?: number
  calories?: number
  gearId?: string
  laps?: Lap[]
  splits?: Split[]
  /** Strava best efforts, name -> seconds (e.g. '5K': 1230) */
  bestEfforts?: Record<string, number>
  detailFetched?: boolean
}

export interface RunAnalysis {
  runId: string
  verdict: 'nailed' | 'good' | 'off-target' | 'unplanned'
  headline: string
  vsTarget: string
  heartRate: string
  analysis: string
  nextTime: string[]
  generatedAt: number
}

export interface StravaShoe {
  id: string
  name: string
  distanceKm: number
}

export interface StravaState {
  clientId: string
  clientSecret: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  scope?: string
  athlete?: { id: number; firstname: string; lastname: string }
  shoes?: StravaShoe[]
  lastSync?: number // epoch seconds
}

export interface AppState {
  version: 2
  runs: Run[]
  weeks: Record<string, WeekPlan>
  analyses: Record<string, RunAnalysis>
  strava: StravaState
  anthropicKey: string
  prefs: { runDays: number[]; maxHr?: number }
}
