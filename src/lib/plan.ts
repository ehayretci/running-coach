import type { PaceKey, Profile, Session, SessionType, Workout } from './types'
import { addDays, daysBetween, mondayOf, todayISO, uid, weekday } from './dates'
import { fmtPace, predictTime, trainingPaces } from './pace'

const round05 = (x: number) => Math.round(x * 2) / 2

export function paceFor(key: PaceKey, vdot: number, profile: Profile): number {
  const p = trainingPaces(vdot)
  switch (key) {
    case 'easy': return (p.easy[0] + p.easy[1]) / 2
    case 'threshold': return p.threshold
    case 'interval': return p.interval
    case 'goal': return profile.goal5kS / 5
    case 'race': return profile.goal5kS / 5
  }
}

function workoutKm(w: Workout, pace: number): number {
  const work = w.repM ? (w.reps * w.repM) / 1000 : (w.reps * (w.repMin ?? 0) * 60) / pace
  const recoveries = w.reps > 1 ? (w.reps - 1) * 0.3 : 0
  return round05(w.wuKm + w.cdKm + work + recoveries)
}

export function describeSession(s: Session): string {
  const parts: string[] = []
  const pace = fmtPace(s.targetPace)
  if (s.workout) {
    const w = s.workout
    if (w.wuKm) parts.push(`${w.wuKm} km warm-up`)
    const rep = w.repM ? (w.repM >= 1000 ? `${w.repM / 1000} km` : `${w.repM} m`) : `${w.repMin} min`
    const main = w.reps > 1 ? `${w.reps} × ${rep}` : rep
    parts.push(`${main} @ ${pace}${w.recovery ? ` (${w.recovery})` : ''}`)
    if (w.cdKm) parts.push(`${w.cdKm} km cool-down`)
  } else if (s.paceRange) {
    parts.push(`${s.distanceKm} km relaxed @ ${fmtPace(s.paceRange[0])}–${fmtPace(s.paceRange[1])}`)
  }
  if (s.strides) parts.push(`${s.strides} × 20 s strides after`)
  return parts.join(' · ')
}

/** Choose quality days so hard sessions are spread out around the long run */
function assignDays(profile: Profile) {
  const runDays = [...profile.runDays].sort((a, b) => a - b)
  const long = runDays.includes(profile.longRunDay) ? profile.longRunDay : runDays[runDays.length - 1]
  const others = runDays.filter((d) => d !== long)
  const gap = (a: number, b: number) => { const g = Math.abs(a - b); return Math.min(g, 7 - g) }
  let best: { q1?: number; q2?: number; score: number } = { score: -1 }
  if (others.length >= 3) {
    for (const a of others) for (const b of others) {
      if (b <= a) continue
      const score = Math.min(gap(a, b), gap(a, long), gap(b, long)) * 10 - a
      if (score > best.score) best = { q1: a, q2: b, score }
    }
  } else if (others.length >= 1) {
    for (const a of others) {
      const score = gap(a, long) * 10 - a
      if (score > best.score) best = { q1: a, score }
    }
  }
  const easy = others.filter((d) => d !== best.q1 && d !== best.q2)
  return { long, q1: best.q1, q2: best.q2, easy }
}

type Phase = 'build' | 'checkpoint' | 'peak' | 'taper'

const Q1: Record<Phase, (i: number) => { title: string; w: Workout; key: PaceKey; type: SessionType }> = {
  build: (i) => [
    { title: 'Intervals: 6 × 800 m', w: { wuKm: 2, cdKm: 1.5, reps: 6, repM: 800, recovery: '400 m jog' }, key: 'interval' as PaceKey, type: 'intervals' as SessionType },
    { title: 'Intervals: 5 × 1 km', w: { wuKm: 2, cdKm: 1.5, reps: 5, repM: 1000, recovery: '400 m jog' }, key: 'interval' as PaceKey, type: 'intervals' as SessionType },
    { title: 'Intervals: 4 × 1.2 km', w: { wuKm: 2, cdKm: 1.5, reps: 4, repM: 1200, recovery: '400 m jog' }, key: 'interval' as PaceKey, type: 'intervals' as SessionType },
  ][Math.min(i, 2)],
  checkpoint: () => ({ title: '5K time trial (checkpoint)', w: { wuKm: 2, cdKm: 1.5, reps: 1, repM: 5000 }, key: 'race', type: 'timetrial' }),
  peak: () => ({ title: 'Goal pace: 5 × 1 km', w: { wuKm: 2, cdKm: 1.5, reps: 5, repM: 1000, recovery: '200 m jog' }, key: 'goal', type: 'goalpace' }),
  taper: () => ({ title: 'Goal pace: 4 × 1 km', w: { wuKm: 2, cdKm: 1.5, reps: 4, repM: 1000, recovery: '400 m jog' }, key: 'goal', type: 'goalpace' }),
}

const Q2: Record<Phase, (i: number) => { title: string; w: Workout } | null> = {
  build: (i) => [
    { title: 'Tempo: 20 min', w: { wuKm: 2, cdKm: 1.5, reps: 1, repMin: 20 } },
    { title: 'Tempo: 2 × 12 min', w: { wuKm: 2, cdKm: 1.5, reps: 2, repMin: 12, recovery: '2 min jog' } },
    { title: 'Tempo: 25 min', w: { wuKm: 2, cdKm: 1.5, reps: 1, repMin: 25 } },
  ][Math.min(i, 2)],
  checkpoint: () => null,
  peak: () => ({ title: 'Tempo: 3 × 10 min', w: { wuKm: 2, cdKm: 1.5, reps: 3, repMin: 10, recovery: '2 min jog' } }),
  taper: () => ({ title: 'Tempo: 15 min', w: { wuKm: 2, cdKm: 1.5, reps: 1, repMin: 15 } }),
}

function mk(date: string, type: SessionType, title: string, distanceKm: number, extra: Partial<Session> = {}): Session {
  return { id: uid(), date, type, title, description: '', distanceKm, status: 'planned', ...extra }
}

/** Build the full plan from `fromDate` (default today) to race day */
export function generatePlan(profile: Profile, vdot: number, fromDate = todayISO()): Session[] {
  const paces = trainingPaces(vdot)
  const start = mondayOf(fromDate)
  const raceMonday = mondayOf(profile.raceDate)
  const nWeeks = Math.max(1, daysBetween(start, raceMonday) / 7 + 1)
  const out: Session[] = []
  const baseLong = Math.min(16, Math.max(8, round05(profile.weeklyKm * 0.3)))
  const { long, q1, q2, easy } = assignDays(profile)
  let buildIdx = 0

  for (let w = 0; w < nWeeks; w++) {
    const monday = addDays(start, w * 7)
    const toRace = nWeeks - 1 - w
    const week: Session[] = []

    if (toRace === 0) {
      week.push(...raceWeek(profile, vdot))
    } else {
      const phase: Phase = toRace === 1 ? 'taper' : toRace === 2 ? 'peak' : toRace === 3 && nWeeks >= 5 ? 'checkpoint' : 'build'
      const factor = phase === 'taper' ? 0.8 : Math.min(1.2, 1 + 0.06 * w) * (phase === 'checkpoint' ? 0.9 : 1)
      const targetKm = profile.weeklyKm * factor
      let used = 0

      if (q1 != null) {
        const q = Q1[phase](buildIdx)
        const pace = paceFor(q.key, vdot, profile)
        const d = workoutKm(q.w, pace)
        used += d
        week.push(mk(addDays(monday, q1), q.type, q.title, d, {
          workout: q.w, paceKey: q.key, targetPace: pace,
          description: q.type === 'timetrial' ? 'All-out effort, even splits. Start at goal pace and only push after 3 km. This tells us exactly where you are.' : '',
        }))
      }
      if (q2 != null) {
        const q = Q2[phase](buildIdx)
        if (q) {
          const d = workoutKm(q.w, paces.threshold)
          used += d
          week.push(mk(addDays(monday, q2), 'tempo', q.title, d, { workout: q.w, paceKey: 'threshold', targetPace: paces.threshold }))
        } else {
          const d = 6
          used += d
          week.push(mk(addDays(monday, q2), 'easy', 'Easy + strides', d, { paceKey: 'easy', paceRange: paces.easy, strides: 6 }))
        }
      }
      const longKm = phase === 'taper' ? round05(baseLong * 0.8) : phase === 'checkpoint' ? baseLong : Math.min(baseLong + 3, baseLong + buildIdx)
      used += longKm
      week.push(mk(addDays(monday, long), 'long', 'Long run', longKm, { paceKey: 'easy', paceRange: paces.easy }))

      if (easy.length) {
        const each = Math.min(10, Math.max(4, round05((targetKm - used) / easy.length)))
        easy.forEach((d, i) =>
          week.push(mk(addDays(monday, d), 'easy', 'Easy run', each, {
            paceKey: 'easy', paceRange: paces.easy, strides: i === 0 && q2 == null ? 6 : undefined,
          })))
      }
      if (phase === 'build') buildIdx++
    }

    // Fill rest days so every day of the week is visible
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d)
      if (date > profile.raceDate) continue
      if (!week.some((s) => s.date === date)) week.push(mk(date, 'rest', 'Rest', 0))
    }
    out.push(...week.filter((s) => s.date >= fromDate))
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function raceWeek(profile: Profile, vdot: number): Session[] {
  const p = trainingPaces(vdot)
  const r = profile.raceDate
  const goal = profile.goal5kS / 5
  const s: Session[] = [
    mk(addDays(r, -4), 'easy', 'Easy run', 5, { paceKey: 'easy', paceRange: p.easy }),
    mk(addDays(r, -3), 'goalpace', 'Sharpener: 3 × 1 km', 6.5, {
      workout: { wuKm: 2, cdKm: 1.5, reps: 3, repM: 1000, recovery: '3 min jog' }, paceKey: 'goal', targetPace: goal,
    }),
    mk(addDays(r, -2), 'easy', 'Easy run', 4, { paceKey: 'easy', paceRange: p.easy }),
    mk(addDays(r, -1), 'shakeout', 'Shake-out', 3, { paceKey: 'easy', paceRange: p.easy, strides: 4 }),
    mk(r, 'race', 'RACE DAY — Sub 20 5K', 5, {
      paceKey: 'race', targetPace: goal,
      description: `Target ${fmtPace(goal)}. Current-fitness prediction: ${Math.floor(predictTime(vdot, 5000) / 60)}:${String(Math.round(predictTime(vdot, 5000) % 60)).padStart(2, '0')}.`,
    }),
  ]
  return s.filter((x) => weekday(x.date) <= weekday(r) && mondayOf(x.date) === mondayOf(r))
}

/** Re-target paces of future planned sessions to a new fitness level (keeps the structure & user edits) */
export function recalcPaces(sessions: Session[], vdot: number, profile: Profile, from = todayISO()): Session[] {
  const p = trainingPaces(vdot)
  return sessions.map((s) => {
    if (s.date < from || s.status !== 'planned' || !s.paceKey) return s
    if (s.paceKey === 'easy') return { ...s, paceRange: p.easy }
    return { ...s, targetPace: paceFor(s.paceKey, vdot, profile) }
  })
}

export const QUALITY: SessionType[] = ['intervals', 'tempo', 'goalpace', 'timetrial', 'race']
export const isQuality = (s: Session) => QUALITY.includes(s.type)
