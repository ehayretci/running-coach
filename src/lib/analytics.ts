import type { AppState, PlannedSession, Run, SessionType, WeekPlan } from './types'
import { addDays, daysBetween, fmtDate, mondayOf, todayISO, weekday, DAY_NAMES } from './dates'
import { fmtPace, fmtTime, predictTime, runPace, trainingPaces, vdotFromRace } from './pace'
import { CHALLENGE_START, GOAL_5K_S, RACE_DATE, SHOES, matchShoe } from './challenge'

export const HARD: SessionType[] = ['intervals', 'tempo', 'goalpace', 'timetrial', 'race']
export const isHard = (t: SessionType) => HARD.includes(t)

export const challengeRuns = (runs: Run[]) => runs.filter((r) => r.date >= CHALLENGE_START)

/* ---------------- Fitness & prediction ---------------- */

const LONG_EFFORTS: Record<string, number> = { '2 mile': 3218.69, '5K': 5000, '10K': 10000 }
const SHORT_EFFORTS: Record<string, number> = { '1K': 1000, '1 mile': 1609.34 }

export interface Evidence {
  date: string
  label: string
  distanceM: number
  timeS: number
  vdot: number
  runId: string
}

/** Every race-like effort hidden in your runs, as VDOT evidence */
export function evidence(runs: Run[]): { long: Evidence[]; short: Evidence[] } {
  const long: Evidence[] = [], short: Evidence[] = []
  for (const r of runs) {
    for (const [name, d] of Object.entries(LONG_EFFORTS)) {
      const t = r.bestEfforts?.[name]
      if (t) long.push({ date: r.date, label: `${name} in “${r.name}”`, distanceM: d, timeS: t, vdot: vdotFromRace(d, t), runId: r.id })
    }
    for (const [name, d] of Object.entries(SHORT_EFFORTS)) {
      const t = r.bestEfforts?.[name]
      if (t) short.push({ date: r.date, label: `${name} in “${r.name}”`, distanceM: d, timeS: t, vdot: vdotFromRace(d, t), runId: r.id })
    }
    if (r.distanceM >= 3000 && r.movingTimeS > 0 && !r.bestEfforts?.['5K']) {
      long.push({ date: r.date, label: `whole run “${r.name}”`, distanceM: r.distanceM, timeS: r.movingTimeS, vdot: vdotFromRace(r.distanceM, r.movingTimeS), runId: r.id })
    }
  }
  return { long, short }
}

export interface Prediction {
  vdot: number
  predicted: number // 5K seconds, from efforts ≥ 2 miles
  basis?: Evidence
  ceiling?: number // what your best short effort implies
  ceilingBasis?: Evidence
  baseline?: { run: Run; timeS: number }
  trend?: { perWeek: number; projected: number; points: number }
}

/** Baseline = the 5K run on the challenge start date */
export function baseline(runs: Run[]): { run: Run; timeS: number } | undefined {
  const day = runs.filter((r) => r.date === CHALLENGE_START).sort((a, b) => b.distanceM - a.distanceM)
  for (const r of day) {
    const t = r.bestEfforts?.['5K'] ?? (r.distanceM >= 4900 ? r.movingTimeS * (5000 / r.distanceM) : undefined)
    if (t) return { run: r, timeS: t }
  }
}

/**
 * Data-only 5K prediction: the best ≥2-mile effort of the last 28 days decides it.
 * Shorter efforts are reported separately as a ceiling, never blended in.
 */
export function predict(runs: Run[], today = todayISO()): Prediction | undefined {
  const recent = runs.filter((r) => r.date >= addDays(today, -27) && r.date <= today)
  const ev = evidence(recent)
  const base = baseline(runs)
  const best = [...ev.long].sort((a, b) => b.vdot - a.vdot)[0]
  if (!best && !base) return undefined
  const vdot = best?.vdot ?? vdotFromRace(5000, base!.timeS)
  const shortBest = [...ev.short].sort((a, b) => b.vdot - a.vdot)[0]

  // Trend: weekly best long-effort VDOT since the challenge started (≥3 weeks needed)
  const byWeek = new Map<string, number>()
  for (const e of evidence(challengeRuns(runs)).long) {
    const w = mondayOf(e.date)
    byWeek.set(w, Math.max(byWeek.get(w) ?? 0, e.vdot))
  }
  const pts = [...byWeek.entries()].sort()
  let trend: Prediction['trend']
  if (pts.length >= 3) {
    const xs = pts.map(([w]) => daysBetween(CHALLENGE_START, w) / 7), ys = pts.map(([, v]) => v)
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0)
    const atRace = my + slope * (daysBetween(CHALLENGE_START, RACE_DATE) / 7 - mx)
    trend = { perWeek: slope, projected: predictTime(atRace, 5000), points: pts.length }
  }

  return {
    vdot,
    predicted: predictTime(vdot, 5000),
    basis: best,
    ceiling: shortBest && shortBest.vdot > vdot ? predictTime(shortBest.vdot, 5000) : undefined,
    ceilingBasis: shortBest && shortBest.vdot > vdot ? shortBest : undefined,
    baseline: base,
    trend,
  }
}

/* ---------------- Heart rate ---------------- */

export function maxHr(state: AppState): { value?: number; source: string } {
  if (state.prefs.maxHr) return { value: state.prefs.maxHr, source: 'set by you' }
  const observed = Math.max(0, ...state.runs.map((r) => r.maxHr ?? 0))
  if (observed >= 160) return { value: Math.round(observed), source: 'highest recorded on Strava' }
  return { source: 'no heart-rate data yet' }
}

export const HR_ZONES: Partial<Record<SessionType, [number, number]>> = {
  recovery: [0.6, 0.7], easy: [0.65, 0.78], long: [0.68, 0.8], shakeout: [0.6, 0.72],
  tempo: [0.85, 0.9], intervals: [0.9, 0.96], goalpace: [0.9, 0.95], timetrial: [0.92, 1], race: [0.92, 1],
}

/** Aerobic efficiency: metres per heartbeat on easy-ish runs (higher = fitter) */
export function efficiency(r: Run): number | undefined {
  if (!r.avgHr || r.movingTimeS <= 0) return
  return r.distanceM / r.movingTimeS * 60 / r.avgHr
}

/* ---------------- Sessions ↔ runs ---------------- */

export const weekPlanFor = (state: AppState, date: string): WeekPlan | undefined => state.weeks[mondayOf(date)]

export function sessionOn(state: AppState, date: string): PlannedSession | undefined {
  return weekPlanFor(state, date)?.sessions.find((s) => s.date === date)
}

export function runsOn(state: AppState, date: string): Run[] {
  return state.runs.filter((r) => r.date === date).sort((a, b) => b.distanceM - a.distanceM)
}

export type Status = 'done' | 'missed' | 'planned' | 'rest' | 'extra'
export function statusOf(state: AppState, s: PlannedSession, today = todayISO()): Status {
  if (runsOn(state, s.date).length) return s.type === 'rest' ? 'extra' : 'done'
  if (s.type === 'rest' || s.type === 'cross') return 'rest'
  return s.date < today ? 'missed' : 'planned'
}

/** Pace of the work portion of a run (laps faster than the midpoint between easy and target) */
export function workPace(run: Run, s?: PlannedSession, vdot?: number): number | undefined {
  if (!s || !isHard(s.type) || !s.paceMax) return
  if ((s.type === 'timetrial' || s.type === 'race') && run.bestEfforts?.['5K']) return run.bestEfforts['5K'] / 5
  if (!run.laps || run.laps.length < 3) return
  const easy = vdot ? (trainingPaces(vdot).easy[0] + trainingPaces(vdot).easy[1]) / 2 : s.paceMax * 1.3
  const target = (s.paceMin + s.paceMax) / 2
  const cutoff = target + (easy - target) * 0.5
  const work = run.laps.filter((l) => l.distanceM >= 200 && (runPace(l.distanceM, l.movingTimeS) ?? 1e9) <= cutoff)
  const d = work.reduce((a, l) => a + l.distanceM, 0), t = work.reduce((a, l) => a + l.movingTimeS, 0)
  return d > 0 ? runPace(d, t) : undefined
}

/* ---------------- Plan sanity checks ---------------- */

export interface Issue { level: 'block' | 'warn'; text: string }

export function weekKm(runs: Run[], monday: string) {
  const end = addDays(monday, 6)
  return runs.filter((r) => r.date >= monday && r.date <= end).reduce((a, r) => a + r.distanceM / 1000, 0)
}

/** Coaching rules every plan must respect. 'block' issues are sent back to the coach to fix or explain. */
export function validateWeek(sessions: PlannedSession[], state: AppState, weekStart: string): Issue[] {
  const issues: Issue[] = []
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  const byDate = new Map(sorted.map((s) => [s.date, s]))
  // Past days count with what was actually run
  const hardOn = (d: string) => {
    const s = byDate.get(d)
    return !!s && isHard(s.type)
  }
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    if (hardOn(d) && hardOn(addDays(d, 1))) issues.push({ level: 'block', text: `Hard sessions on back-to-back days (${fmtDate(d)} and ${fmtDate(addDays(d, 1))}).` })
    const s = byDate.get(d)
    if (s?.type === 'long' && hardOn(addDays(d, 1))) issues.push({ level: 'warn', text: `Long run on ${fmtDate(d)} right before a hard session.` })
  }
  const hard = sorted.filter((s) => isHard(s.type) && s.type !== 'race')
  if (hard.length > 3) issues.push({ level: 'block', text: `${hard.length} hard sessions in one week — max 3.` })
  const raceIn = sorted.find((s) => s.type === 'race')
  if (raceIn) {
    for (const s of hard) if (daysBetween(s.date, raceIn.date) > 0 && daysBetween(s.date, raceIn.date) <= 2) issues.push({ level: 'block', text: `Hard session ${fmtDate(s.date)} is within 2 days of the race.` })
  }
  const prev = [1, 2, 3].map((k) => weekKm(state.runs, addDays(weekStart, -7 * k)))
  const avg = prev.reduce((a, b) => a + b, 0) / 3
  const planned = sorted.reduce((a, s) => a + s.distanceKm, 0)
  if (avg > 10 && planned > avg * 1.25) issues.push({ level: 'warn', text: `Planned ${planned.toFixed(0)} km vs ${avg.toFixed(0)} km/week recently (+${Math.round((planned / avg - 1) * 100)}%).` })
  if (!sorted.some((s) => s.type === 'rest' || s.type === 'cross') && sorted.length >= 7) issues.push({ level: 'warn', text: 'No rest day this week.' })
  return issues
}

/* ---------------- Context for the AI coach ---------------- */

export function athleteContext(state: AppState, weekStart: string, today = todayISO()): string {
  const p = predict(state.runs, today)
  const hr = maxHr(state)
  const lines: string[] = []
  lines.push(`TODAY: ${today} (${DAY_NAMES[weekday(today)]}). WEEK BEING PLANNED: ${weekStart} to ${addDays(weekStart, 6)}.`)
  lines.push(`GOAL: 5K under ${fmtTime(GOAL_5K_S)} (goal pace ${fmtPace(GOAL_5K_S / 5)}) on ${RACE_DATE} — ${daysBetween(today, RACE_DATE)} days away, ${Math.ceil(daysBetween(weekStart, mondayOf(RACE_DATE)) / 7)} full weeks after this one.`)
  if (p) {
    lines.push(`BASELINE: ${p.baseline ? `${fmtTime(p.baseline.timeS)} 5K on ${CHALLENGE_START}` : 'no baseline 5K found on ' + CHALLENGE_START}.`)
    lines.push(`CURRENT FITNESS (data-only): VDOT ${p.vdot.toFixed(1)} → predicted 5K ${fmtTime(p.predicted)}${p.basis ? ` (from ${p.basis.label}, ${p.basis.date})` : ''}. Goal needs VDOT ${vdotFromRace(5000, GOAL_5K_S).toFixed(1)}.`)
    if (p.ceiling) lines.push(`Short-effort ceiling: ${fmtTime(p.ceiling)} (from ${p.ceilingBasis!.label}).`)
    if (p.trend) lines.push(`Trend: ${p.trend.perWeek >= 0 ? '+' : ''}${p.trend.perWeek.toFixed(2)} VDOT/week over ${p.trend.points} weeks → projects ${fmtTime(p.trend.projected)} on race day.`)
    const tp = trainingPaces(p.vdot)
    lines.push(`TRAINING PACES at current fitness: easy ${fmtPace(tp.easy[0])}–${fmtPace(tp.easy[1])}, threshold ${fmtPace(tp.threshold)}, interval ${fmtPace(tp.interval)}, repetition ${fmtPace(tp.repetition)}, goal ${fmtPace(GOAL_5K_S / 5)}.`)
  } else lines.push('No run data yet — ask the athlete for a recent 5K if needed and plan conservatively.')
  lines.push(`MAX HR: ${hr.value ? `${hr.value} bpm (${hr.source})` : hr.source}.`)

  const shoes = Object.entries(SHOES).filter(([k]) => k !== 'none').map(([k, s]) => {
    const g = state.strava.shoes?.find((x) => matchShoe(x.name) === k)
    return `${k}: ${s.name} — ${s.role}, ${s.age}${g ? `, ${g.distanceKm.toFixed(0)} km logged on Strava` : ''}`
  })
  lines.push('SHOES:\n' + shoes.join('\n'))

  const from = addDays(today, -35)
  const recent = state.runs.filter((r) => r.date >= from).sort((a, b) => a.date.localeCompare(b.date))
  lines.push('RUNS (last 5 weeks):')
  for (const r of recent) {
    const shoe = state.strava.shoes?.find((g) => g.id === r.gearId)
    const s = sessionOn(state, r.date)
    let line = `- ${r.date} ${(r.distanceM / 1000).toFixed(2)} km in ${fmtTime(r.movingTimeS)} (${fmtPace(runPace(r.distanceM, r.movingTimeS))})`
    if (r.avgHr) line += `, HR avg ${Math.round(r.avgHr)}/max ${Math.round(r.maxHr ?? 0)}`
    if (r.cadence) line += `, cadence ${Math.round(r.cadence)}`
    if (r.elevGainM) line += `, +${Math.round(r.elevGainM)} m`
    if (r.sufferScore) line += `, relative effort ${r.sufferScore}`
    if (shoe) line += `, shoe ${shoe.name}`
    if (s) line += ` | planned: ${s.title} (${s.distanceKm} km${s.paceMax ? ` @ ${fmtPace(s.paceMin)}–${fmtPace(s.paceMax)}` : ''})`
    if (r.laps && r.laps.length >= 3 && r.laps.length <= 30) line += `\n    laps: ${r.laps.map((l) => `${Math.round(l.distanceM)}m ${fmtPace(runPace(l.distanceM, l.movingTimeS))}${l.avgHr ? ` ${Math.round(l.avgHr)}bpm` : ''}`).join('; ')}`
    lines.push(line)
  }
  if (!recent.length) lines.push('- none')

  const weeks = [1, 2, 3, 4].map((k) => addDays(weekStart, -7 * k))
  lines.push('WEEKLY KM (most recent first): ' + weeks.map((w) => `${w}: ${weekKm(state.runs, w).toFixed(1)}`).join(', '))
  const prevPlan = state.weeks[addDays(weekStart, -7)]
  if (prevPlan) {
    const done = prevPlan.sessions.filter((s) => s.type !== 'rest' && runsOn(state, s.date).length).length
    const total = prevPlan.sessions.filter((s) => s.type !== 'rest').length
    lines.push(`LAST WEEK'S PLAN: ${done}/${total} sessions completed. Athlete notes were: "${prevPlan.notes || '—'}"`)
  }
  const thisWeekRuns = state.runs.filter((r) => r.date >= weekStart && r.date < today)
  if (thisWeekRuns.length) lines.push(`ALREADY RUN THIS WEEK: ${thisWeekRuns.map((r) => `${r.date} ${(r.distanceM / 1000).toFixed(1)} km`).join(', ')}`)
  lines.push('NOT AVAILABLE FROM DATA: sleep, HRV, resting HR, weather — rely on athlete notes for these.')
  return lines.join('\n')
}
