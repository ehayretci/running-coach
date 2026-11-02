import type { AppState, Goal, Profile, Run, Session } from './types'
import { addDays, daysBetween, fmtDate, mondayOf, todayISO, uid } from './dates'
import { fmtPace, fmtTime, predictTime, runPace, trainingPaces, vdotFromRace } from './pace'
import { isQuality, recalcPaces } from './plan'

const EFFORTS: Record<string, number> = { '1 mile': 1609.34, '2 mile': 3218.69, '5K': 5000, '10K': 10000 }

/** Best VDOT a single run demonstrates (from Strava best efforts or the whole run) */
export function runVdot(r: Run): number | undefined {
  let best: number | undefined
  for (const [name, dist] of Object.entries(EFFORTS)) {
    const t = r.bestEfforts?.[name]
    if (t) best = Math.max(best ?? 0, vdotFromRace(dist, t))
  }
  if (r.distanceM >= 3000 && r.movingTimeS > 0) best = Math.max(best ?? 0, vdotFromRace(r.distanceM, r.movingTimeS))
  return best
}

export interface Fitness {
  vdot: number
  source: string
  predicted5k: number
}

/** Current fitness = best of your stated 5K and anything you've shown in the last 6 weeks */
export function estimateFitness(runs: Run[], profile: Profile, today = todayISO()): Fitness {
  let vdot = vdotFromRace(5000, profile.current5kS)
  let source = `your stated 5K (${fmtTime(profile.current5kS)})`
  const from = addDays(today, -42)
  for (const r of runs) {
    if (r.date < from || r.date > today) continue
    const v = runVdot(r)
    if (v && v > vdot + 0.05) { vdot = v; source = `“${r.name}” on ${fmtDate(r.date)}` }
  }
  return { vdot, source, predicted5k: predictTime(vdot, 5000) }
}

/** Weekly best VDOT, for the fitness trend chart */
export function fitnessHistory(runs: Run[]): { week: string; vdot: number }[] {
  const byWeek = new Map<string, number>()
  for (const r of runs) {
    const v = runVdot(r)
    if (!v) continue
    const w = mondayOf(r.date)
    byWeek.set(w, Math.max(byWeek.get(w) ?? 0, v))
  }
  return [...byWeek.entries()].sort().map(([week, vdot]) => ({ week, vdot }))
}

/** Link runs to planned sessions on the same day; mark past unrun sessions as missed */
export function linkRuns(sessions: Session[], runs: Run[], today = todayISO()): Session[] {
  const runIds = new Set(runs.map((r) => r.id))
  const used = new Set(sessions.filter((s) => s.runId && runIds.has(s.runId)).map((s) => s.runId!))
  return sessions.map((s) => {
    if (s.runId && runIds.has(s.runId)) return s.status === 'done' ? s : { ...s, status: 'done' }
    if (s.type === 'rest' || s.status === 'skipped') return { ...s, runId: undefined }
    const candidates = runs.filter((r) => r.date === s.date && !used.has(r.id)).sort((a, b) => b.distanceM - a.distanceM)
    if (candidates[0]) {
      used.add(candidates[0].id)
      return { ...s, status: 'done', runId: candidates[0].id }
    }
    if (s.date < today) return { ...s, status: 'missed', runId: undefined }
    return { ...s, status: s.status === 'done' ? 'planned' : s.status, runId: undefined }
  })
}

export interface Execution {
  actualPace: number
  deviation: number // +0.03 = 3% slower than target
}

/** How well a quality session hit its target pace (uses Strava laps when available) */
export function execution(s: Session, run: Run | undefined, vdot: number): Execution | undefined {
  if (!run || !s.targetPace || !isQuality(s)) return undefined
  let actual: number | undefined
  if ((s.type === 'timetrial' || s.type === 'race') && run.bestEfforts?.['5K']) {
    actual = run.bestEfforts['5K'] / 5
  } else if (run.laps && run.laps.length >= 3) {
    const easyMid = (trainingPaces(vdot).easy[0] + trainingPaces(vdot).easy[1]) / 2
    const cutoff = s.targetPace + (easyMid - s.targetPace) * 0.5
    const work = run.laps.filter((l) => l.distanceM >= 200 && (runPace(l.distanceM, l.movingTimeS) ?? 1e9) <= cutoff)
    const d = work.reduce((a, l) => a + l.distanceM, 0)
    const t = work.reduce((a, l) => a + l.movingTimeS, 0)
    if (d > 0) actual = runPace(d, t)
  }
  if (!actual) return undefined
  return { actualPace: actual, deviation: (actual - s.targetPace) / s.targetPace }
}

export interface Recommendation {
  key: string
  level: 'good' | 'info' | 'warn'
  title: string
  detail: string
  actionLabel?: string
  apply?: (s: AppState) => AppState
}

const kmIn = (runs: Run[], from: string, to: string) =>
  runs.filter((r) => r.date >= from && r.date <= to).reduce((a, r) => a + r.distanceM / 1000, 0)

const log = (s: AppState, message: string): AppState => ({ ...s, coachLog: [{ date: todayISO(), message }, ...s.coachLog].slice(0, 100) })

/** Efecan's brain: look at what happened and suggest plan changes */
export function analyse(state: AppState, today = todayISO()): Recommendation[] {
  const { profile, sessions, runs } = state
  if (!profile) return []
  const recs: Recommendation[] = []
  const fit = estimateFitness(runs, profile, today)
  const planVdot = state.planVdot ?? fit.vdot
  const runById = new Map(runs.map((r) => [r.id, r]))

  // 1. Fitness has moved on since the paces were set
  if (fit.vdot - planVdot >= 0.7) {
    const v = fit.vdot
    recs.push({
      key: `fitness-up-${v.toFixed(1)}`, level: 'good',
      title: 'You’re fitter than your plan thinks',
      detail: `Based on ${fit.source}, your 5K prediction is now ${fmtTime(fit.predicted5k)}. I’ll speed up your training paces to match.`,
      actionLabel: 'Update paces',
      apply: (s) => log({ ...s, planVdot: v, sessions: recalcPaces(s.sessions, v, s.profile!) }, `Paces updated to fitness ${v.toFixed(1)} (predicted 5K ${fmtTime(predictTime(v, 5000))}).`),
    })
  }

  // 2. Workout execution trend (last two quality sessions with lap data)
  const executed = sessions
    .filter((s) => s.status === 'done' && s.date <= today && isQuality(s) && s.type !== 'race')
    .map((s) => ({ s, ex: execution(s, runById.get(s.runId!), planVdot) }))
    .filter((x) => x.ex)
    .slice(-2)
  if (executed.length === 2) {
    const devs = executed.map((x) => x.ex!.deviation)
    const lastId = executed[1].s.id
    if (devs.every((d) => d > 0.03)) {
      const v = planVdot - 1
      recs.push({
        key: `too-hard-${lastId}`, level: 'warn',
        title: 'Your last two workouts were slower than target',
        detail: `You averaged ${devs.map((d) => `${(d * 100).toFixed(0)}%`).join(' and ')} off pace. Training too hard backfires — I’ll ease interval and tempo paces a notch so you hit them cleanly. Goal-pace sessions stay at goal pace.`,
        actionLabel: 'Ease paces',
        apply: (s) => log({ ...s, planVdot: v, sessions: recalcPaces(s.sessions, v, s.profile!) }, `Eased paces after two slow workouts (fitness ${v.toFixed(1)}).`),
      })
    } else if (devs.every((d) => d < -0.03)) {
      const v = planVdot + 0.7
      recs.push({
        key: `too-easy-${lastId}`, level: 'good',
        title: 'You’re crushing your workouts',
        detail: `Your last two sessions were ${devs.map((d) => `${Math.abs(d * 100).toFixed(0)}%`).join(' and ')} faster than target. Time to raise the bar slightly.`,
        actionLabel: 'Raise paces',
        apply: (s) => log({ ...s, planVdot: v, sessions: recalcPaces(s.sessions, v, s.profile!) }, `Raised paces after strong workouts (fitness ${v.toFixed(1)}).`),
      })
    }
  }

  // 3. Missed a key workout recently → move it to a free easy day
  const missedKey = sessions.filter((s) => s.status === 'missed' && isQuality(s) && s.type !== 'race' && daysBetween(s.date, today) <= 3)
  for (const m of missedKey) {
    const sameWeek = mondayOf(m.date)
    const target = sessions.find((s) => {
      if (s.type !== 'easy' || s.status !== 'planned' || s.date < today || mondayOf(s.date) !== sameWeek) return false
      const near = sessions.filter((o) => Math.abs(daysBetween(o.date, s.date)) === 1)
      return !near.some((o) => isQuality(o) || o.type === 'long')
    })
    if (target) {
      recs.push({
        key: `move-${m.id}`, level: 'info',
        title: `Missed “${m.title}” — let’s move it`,
        detail: `${fmtDate(target.date)} is an easy day with recovery either side, so it’s a safe slot for this workout.`,
        actionLabel: `Move to ${fmtDate(target.date, { weekday: 'long' })}`,
        apply: (s) => log({
          ...s,
          sessions: s.sessions.map((x) => {
            if (x.id === target.id) return { ...m, id: x.id, date: x.date, status: 'planned', runId: undefined, note: `Moved from ${fmtDate(m.date)}` }
            if (x.id === m.id) return { ...x, status: 'skipped', note: `Moved to ${fmtDate(target.date)}` }
            return x
          }),
        }, `Moved “${m.title}” from ${fmtDate(m.date)} to ${fmtDate(target.date)}.`),
      })
    } else {
      recs.push({
        key: `drop-${m.id}`, level: 'info',
        title: `Missed “${m.title}”`,
        detail: 'No safe slot to move it this week — don’t cram it in. Just carry on with the plan; one missed session won’t cost you the goal.',
      })
    }
  }

  // 4. Several sessions missed in the last week → lighten the next few days
  const missed7 = sessions.filter((s) => s.status === 'missed' && daysBetween(s.date, today) <= 7)
  if (missed7.length >= 2) {
    recs.push({
      key: `missed-many-${mondayOf(today)}`, level: 'warn',
      title: `${missed7.length} sessions missed this past week`,
      detail: 'Jumping straight back to full volume is how injuries happen. I’ll trim easy and long runs over the next 7 days by 15% to ease you back in.',
      actionLabel: 'Lighten next 7 days',
      apply: (s) => log({
        ...s,
        sessions: s.sessions.map((x) =>
          x.date >= today && x.date <= addDays(today, 7) && x.status === 'planned' && (x.type === 'easy' || x.type === 'long')
            ? { ...x, distanceKm: Math.max(3, Math.round(x.distanceKm * 0.85 * 2) / 2), note: 'Trimmed after missed sessions' }
            : x),
      }, 'Trimmed next 7 days by 15% after missed sessions.'),
    })
  }

  // 5. Mileage spike
  const last7 = kmIn(runs, addDays(today, -6), today)
  const prev = kmIn(runs, addDays(today, -27), addDays(today, -7)) / 3
  if (prev > 8 && last7 > prev * 1.3) {
    recs.push({
      key: `spike-${today}`, level: 'warn',
      title: 'Big jump in mileage',
      detail: `${last7.toFixed(1)} km in the last 7 days vs ${prev.toFixed(1)} km/week before. I’ll cut your next 3 days of easy running by 25%.`,
      actionLabel: 'Cut back',
      apply: (s) => log({
        ...s,
        sessions: s.sessions.map((x) =>
          x.date >= today && x.date <= addDays(today, 3) && x.status === 'planned' && x.type === 'easy'
            ? { ...x, distanceKm: Math.max(3, Math.round(x.distanceKm * 0.75 * 2) / 2), note: 'Reduced after mileage spike' }
            : x),
      }, `Reduced easy runs after a mileage spike (${last7.toFixed(1)} km in 7 days).`),
    })
  }

  // 6. Easy runs too fast
  const easyFast = trainingPaces(planVdot).easy[0]
  const easyDone = sessions
    .filter((s) => s.status === 'done' && (s.type === 'easy' || s.type === 'long') && s.runId)
    .slice(-4)
    .map((s) => runById.get(s.runId!))
    .filter((r): r is Run => !!r)
  const tooFast = easyDone.filter((r) => (runPace(r.distanceM, r.movingTimeS) ?? 1e9) < easyFast * 0.96)
  if (tooFast.length >= 2) {
    recs.push({
      key: `easy-fast-${tooFast[tooFast.length - 1].id}`, level: 'info',
      title: 'Slow down your easy runs',
      detail: `${tooFast.length} of your last ${easyDone.length} easy runs were quicker than ${fmtPace(easyFast)}. Easy days build your engine and let you nail the hard days — keep them conversational.`,
    })
  }

  return recs.filter((r) => !state.dismissed.includes(r.key))
}

export interface GoalStatus {
  daysLeft: number
  predicted: number
  goal: number
  gapS: number
  vdotNeeded: number
  verdict: string
}

export function goalStatus(state: AppState, today = todayISO()): GoalStatus | undefined {
  const p = state.profile
  if (!p) return
  const fit = estimateFitness(state.runs, p, today)
  const goalV = vdotFromRace(5000, p.goal5kS)
  const gapS = fit.predicted5k - p.goal5kS
  const daysLeft = daysBetween(today, p.raceDate)
  const weeks = Math.max(daysLeft / 7, 0.1)
  const need = goalV - fit.vdot
  // A consistent runner can typically gain ~0.3–0.5 VDOT per week over a short block
  let verdict: string
  if (need <= 0) verdict = 'You’re already in sub-20 shape. Stay healthy and execute on race day.'
  else if (need / weeks <= 0.3) verdict = 'On track. Keep stacking consistent weeks.'
  else if (need / weeks <= 0.55) verdict = 'Ambitious but possible — every key session counts.'
  else verdict = 'A big stretch in the time left — we go for it, and the checkpoint time trial will tell us if a stepping-stone target is smarter.'
  return { daysLeft, predicted: fit.predicted5k, goal: p.goal5kS, gapS, vdotNeeded: need, verdict }
}

/** Auto-tick milestones from Strava best efforts (or manual runs of the right distance) */
export function checkMilestones(goals: Goal[], runs: Run[]): Goal[] {
  return goals.map((g) => {
    const milestones = g.milestones.map((m) => {
      if (m.done || !m.auto) return m
      const { effort, distanceM, underS } = m.auto
      const hit = [...runs].sort((a, b) => a.date.localeCompare(b.date)).find((r) => {
        const be = r.bestEfforts?.[effort]
        if (be != null) return be <= underS
        return r.distanceM >= distanceM * 0.99 && r.distanceM <= distanceM * 1.05 && r.movingTimeS * (distanceM / r.distanceM) <= underS
      })
      return hit ? { ...m, done: true, doneDate: hit.date } : m
    })
    const achieved = g.achieved || (milestones.length > 0 && milestones[milestones.length - 1].done)
    return { ...g, milestones, achieved }
  })
}

export function defaultGoal(profile: Profile, today = todayISO()): Goal {
  const race = profile.raceDate
  const span = daysBetween(today, race)
  const at = (f: number) => addDays(today, Math.round(span * f))
  const goal = profile.goal5kS
  const cur = profile.current5kS
  const mid = Math.round(cur - (cur - goal) * 0.5)
  return {
    id: uid(),
    title: 'Road to Sub 20',
    description: `Run a 5K under ${fmtTime(goal)} by ${fmtDate(race, { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    targetDate: race,
    achieved: false,
    milestones: [
      { id: uid(), title: 'Complete the first full training week', targetDate: at(0.2), done: false },
      { id: uid(), title: 'Run 1 km under 3:50', targetDate: at(0.35), done: false, auto: { effort: '1K', distanceM: 1000, underS: 230 } },
      { id: uid(), title: `5K time trial under ${fmtTime(mid)}`, targetDate: at(0.5), done: false, auto: { effort: '5K', distanceM: 5000, underS: mid } },
      { id: uid(), title: 'Run 1 mile under 6:15', targetDate: at(0.7), done: false, auto: { effort: '1 mile', distanceM: 1609.34, underS: 375 } },
      { id: uid(), title: 'Run 2 miles under 12:50', targetDate: at(0.85), done: false, auto: { effort: '2 mile', distanceM: 3218.69, underS: 770 } },
      { id: uid(), title: `Sub 20 5K (${fmtTime(goal)})`, targetDate: race, done: false, auto: { effort: '5K', distanceM: 5000, underS: goal } },
    ],
  }
}
