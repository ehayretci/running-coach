// Offline plan builder — used when no Claude API key is set.
import type { AppState, PlannedSession, SessionType, ShoeId } from './types'
import { addDays, daysBetween, mondayOf, uid, weekday } from './dates'
import { HR_ZONES, maxHr, predict, weekKm } from './analytics'
import { fmtPace, fmtTime, trainingPaces, vdotFromRace } from './pace'
import { GOAL_5K_S, GOAL_PACE, RACE_DATE } from './challenge'

const r05 = (x: number) => Math.round(x * 2) / 2

export function rulesWeek(state: AppState, weekStart: string, today: string, runDays: number[]): { summary: string; sessions: PlannedSession[] } {
  const pred = predict(state.runs, today)
  const vdot = pred?.vdot ?? vdotFromRace(5000, 21 * 60)
  const p = trainingPaces(vdot)
  const hr = maxHr(state).value
  const weeksLeft = Math.round(daysBetween(weekStart, mondayOf(RACE_DATE)) / 7)
  const recentKm = Math.max(20, ([1, 2, 3].map((k) => weekKm(state.runs, addDays(weekStart, -7 * k))).reduce((a, b) => a + b) / 3) || 25)
  const isRaceWeek = weeksLeft === 0
  const taper = weeksLeft === 1
  const target = isRaceWeek ? recentKm * 0.5 : taper ? recentKm * 0.8 : recentKm * 1.08

  const mk = (date: string, type: SessionType, title: string, km: number, details: string, pace: [number, number] | null, shoe: ShoeId, why: string, tips: string[]): PlannedSession => {
    const z = HR_ZONES[type]
    return {
      id: uid(), date, type, title, distanceKm: km, details, paceMin: pace ? Math.round(pace[0]) : 0, paceMax: pace ? Math.round(pace[1]) : 0,
      hrMin: hr && z ? Math.round(hr * z[0]) : 0, hrMax: hr && z ? Math.round(hr * z[1]) : 0, shoe, why, tips,
    }
  }
  const easy = (d: string, km: number, shoe: ShoeId = 'vomero') => mk(d, 'easy', 'Easy run', km, `${km} km conversational`, p.easy, shoe, 'Aerobic volume that lets you absorb the hard days. Cushioned shoe to protect your legs.', ['Keep it truly easy — you should be able to talk.', 'Finish with 4 × 20 s relaxed strides.'])

  const days = [...runDays].sort((a, b) => a - b)
  const out: PlannedSession[] = []
  if (isRaceWeek) {
    const r = RACE_DATE
    out.push(mk(addDays(r, -3), 'goalpace', 'Sharpener: 3 × 1 km', 6.5, `2 km warm-up · 3 × 1 km @ ${fmtPace(GOAL_PACE)} (3 min jog) · 1.5 km cool-down`, [GOAL_PACE - 3, GOAL_PACE + 2], 'vaporfly', 'Rehearse race pace and race shoes without fatigue.', ['Smooth, not strained.', 'Practise your race-morning routine.']))
    out.push(easy(addDays(r, -2), 4))
    out.push(mk(addDays(r, -1), 'shakeout', 'Shake-out', 3, '3 km very easy + 4 strides', p.easy, 'vomero', 'Loosen up, nothing more.', ['Lay out kit tonight.', 'Carb-rich dinner, normal portions.']))
    out.push(mk(r, 'race', 'RACE — Sub 20 5K', 5, `Warm-up 2 km + strides · 5 km @ ${fmtPace(GOAL_PACE)} · cool-down`, [GOAL_PACE - 4, GOAL_PACE + 1], 'vaporfly', 'This is it.', ['First km no faster than 3:58.', 'Hold on through km 3–4; empty the tank in the last km.']))
    out.push(easy(addDays(r, -4), 5))
  } else {
    const long = days.includes(6) ? 6 : days[days.length - 1]
    const others = days.filter((d) => d !== long)
    const q1 = others[0], q2 = others.find((d) => d - (q1 ?? -9) >= 2 && long - d >= 2)
    const tt = weeksLeft === 3
    if (q1 != null) {
      const date = addDays(weekStart, q1)
      if (tt) out.push(mk(date, 'timetrial', '5K time trial', 8.5, '2 km warm-up + strides · 5 km all-out, even pacing · 1.5 km cool-down', [GOAL_PACE - 5, GOAL_PACE + 15], 'vaporfly', 'Checkpoint: measures real progress. Race shoes to get a true read.', ['Start at goal pace and only push after 3 km.', 'Flat route or track.']))
      else if (weeksLeft <= 2) out.push(mk(date, 'goalpace', 'Goal pace: 5 × 1 km', 9.5, `2 km warm-up · 5 × 1 km @ ${fmtPace(GOAL_PACE)} (200 m jog) · 1.5 km cool-down`, [GOAL_PACE - 3, GOAL_PACE + 3], 'vaporfly', 'Teaches your body the exact rhythm of sub-20.', ['Track or flat loop.', 'Even splits beat a fast first rep.']))
      else out.push(mk(date, 'intervals', 'Intervals: 5 × 1 km', 9.5, `2 km warm-up · 5 × 1 km @ ${fmtPace(p.interval)} (400 m jog) · 1.5 km cool-down`, [p.interval - 3, p.interval + 3], 'cloudmonster', 'VO₂max work at your current fitness level.', ['Strides before the first rep.', 'HR lags on short reps — run by pace.']))
    }
    if (q2 != null && !tt) {
      const mins = taper ? 15 : 20
      out.push(mk(addDays(weekStart, q2), 'tempo', `Tempo: ${mins} min`, r05(3.5 + (mins * 60) / p.threshold), `2 km warm-up · ${mins} min @ ${fmtPace(p.threshold)} · 1.5 km cool-down`, [p.threshold - 4, p.threshold + 4], 'cloudmonster', 'Raises the pace you can hold before fatigue builds.', ['Comfortably hard — short phrases only.']))
    }
    const used = out.reduce((a, s) => a + s.distanceKm, 0)
    const longKm = r05(Math.min(16, Math.max(8, target * 0.3)))
    out.push(mk(addDays(weekStart, long), 'long', 'Long run', longKm, `${longKm} km easy`, p.easy, 'vomero', 'Aerobic endurance for the back half of the 5K.', ['Carry water if over 75 min.']))
    const rest = days.filter((d) => !out.some((s) => weekday(s.date) === d))
    const each = rest.length ? r05(Math.max(4, Math.min(10, (target - used - longKm) / rest.length))) : 0
    for (const d of rest) out.push(easy(addDays(weekStart, d), each))
  }
  for (let d = 0; d < 7; d++) {
    const date = addDays(weekStart, d)
    if (!out.some((s) => s.date === date) && date <= RACE_DATE) out.push(mk(date, 'rest', 'Rest', 0, 'Rest or light mobility', null, 'none', 'Adaptation happens when you recover.', []))
  }
  return {
    summary: `Offline plan (rules-based — add a Claude API key for a coach that reads your notes and data). ${weeksLeft} weeks to race day; target ≈${target.toFixed(0)} km. Goal: ${fmtTime(GOAL_5K_S)}.`,
    sessions: out.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
  }
}
