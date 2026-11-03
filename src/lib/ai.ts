import Anthropic from '@anthropic-ai/sdk'
import type { AppState, ChatMessage, PlannedSession, Run, RunAnalysis, WeekPlan } from './types'
import { athleteContext, maxHr, sessionOn, validateWeek, workPace, predict } from './analytics'
import { addDays, mondayOf, uid } from './dates'
import { fmtPace, fmtTime, runPace } from './pace'

const MODEL = 'claude-opus-5-5'

const COACH = `You are Efecan, a personal running coach inside an app. Your one athlete is training for "Road to Sub 20": a 5K under 20:00 on 10 December 2026.

How you coach:
- Be strictly data-driven and honest. Never flatter or inflate. If the numbers say the goal is unlikely, say so plainly with the numbers, and still give the best plan to get as close as possible.
- Base paces on CURRENT fitness from the data, not on the goal — except dedicated goal-pace sessions, which use goal pace (about 4:00/km).
- Respect training principles: hard days (intervals, tempo, goal pace, time trial) never on back-to-back days; at most 2 hard sessions in a normal week (3 only if the athlete is clearly coping); a long run is not the day before a hard session; volume rises gradually (roughly ≤10–15% over recent weeks); at least one rest day; taper in the final 10 days; nothing hard within 2 days of race day.
- Heart rate: give a bpm window for each run when max HR is known (easy ≈65–78% HRmax, tempo ≈85–90%, intervals ≈90–96%). Say when HR should override pace (easy days) and when it shouldn't (short reps — HR lags).
- Shoes: choose one per run from the athlete's three pairs:
  • vomero — Nike Vomero Plus, max-cushion daily trainer, ~1 year old: easy, recovery and most long runs.
  • cloudmonster — On Cloudmonster 3 Hyper, brand new: break it in on 2–3 easy/steady runs first, then use for tempo, longer intervals and long runs with faster finishes.
  • vaporfly — Nike Vaporfly 4, carbon-plated racer, ~1 year old: race day, the time trial and at most one goal-pace session a week, so legs are used to it without wearing the foam out further. Mention its mileage if known.
  Use "none" for rest days.
- Tips should be practical and specific to the session: warm-up drills, strides, pacing strategy, fuelling/hydration, surface (track vs road), recovery, form cues. 2–4 short tips per run.
- Write in clear, friendly, concise English. No fluff.`

const SESSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'type', 'title', 'distanceKm', 'details', 'paceMin', 'paceMax', 'hrMin', 'hrMax', 'shoe', 'why', 'tips'],
  properties: {
    date: { type: 'string', description: 'YYYY-MM-DD' },
    type: { type: 'string', enum: ['easy', 'recovery', 'long', 'intervals', 'tempo', 'goalpace', 'timetrial', 'race', 'rest', 'shakeout', 'cross'] },
    title: { type: 'string' },
    distanceKm: { type: 'number', description: 'Total distance incl. warm-up/cool-down; 0 for rest' },
    details: { type: 'string', description: 'Exact structure, e.g. "2 km easy warm-up + 4 strides · 5 × 1 km @ 3:58–4:02/km, 90 s jog · 1.5 km cool-down"' },
    paceMin: { type: 'integer', description: 'Faster end of main-set pace window, seconds per km; 0 if n/a' },
    paceMax: { type: 'integer', description: 'Slower end of main-set pace window, seconds per km; 0 if n/a' },
    hrMin: { type: 'integer', description: 'bpm; 0 if n/a or max HR unknown' },
    hrMax: { type: 'integer', description: 'bpm; 0 if n/a or max HR unknown' },
    shoe: { type: 'string', enum: ['vomero', 'vaporfly', 'cloudmonster', 'none'] },
    why: { type: 'string', description: 'One or two sentences: purpose of the session and why this shoe' },
    tips: { type: 'array', items: { type: 'string' } },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'sessions'],
  properties: {
    summary: { type: 'string', description: 'Short coach note for the week: focus, how it builds on last week, honest read of where the athlete stands' },
    sessions: { type: 'array', items: SESSION_SCHEMA, description: 'One entry per remaining day of the week (today through Sunday), including rest days' },
  },
}

const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'changed', 'sessions'],
  properties: {
    reply: { type: 'string', description: 'What you say back to the athlete' },
    changed: { type: 'boolean', description: 'true if you changed the plan' },
    sessions: { type: 'array', items: SESSION_SCHEMA, description: 'The full plan for the remaining days of the week (today through Sunday) after your changes — or unchanged' },
  },
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'headline', 'vsTarget', 'heartRate', 'analysis', 'nextTime'],
  properties: {
    verdict: { type: 'string', enum: ['nailed', 'good', 'off-target', 'unplanned'] },
    headline: { type: 'string', description: 'One sentence verdict' },
    vsTarget: { type: 'string', description: 'Actual vs planned: distance, pace of the work, splits consistency' },
    heartRate: { type: 'string', description: 'What HR says about effort and fitness; say so if no HR data' },
    analysis: { type: 'string', description: '2–4 short paragraphs: what went well, what didn’t, what it means for sub-20' },
    nextTime: { type: 'array', items: { type: 'string' }, description: '2–4 concrete suggestions for upcoming runs' },
  },
}

export class AIError extends Error {}

async function ask<T>(apiKey: string, effort: 'low' | 'medium' | 'high', messages: Anthropic.Beta.BetaMessageParam[], schema: Record<string, unknown>): Promise<T> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  let res: Anthropic.Beta.BetaMessage
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: COACH, cache_control: { type: 'ephemeral' } }],
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages,
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AIError('Your Claude API key was rejected. Check it under ⚙ Connections.')
    if (e instanceof Anthropic.RateLimitError) throw new AIError('Claude is rate-limited right now — try again in a minute.')
    if (e instanceof Anthropic.APIConnectionError) throw new AIError('Could not reach Claude. Check your connection.')
    if (e instanceof Anthropic.APIError) throw new AIError(`Claude error ${e.status}: ${e.message}`)
    throw e
  }
  if (res.stop_reason === 'refusal') throw new AIError('Claude declined this request.')
  if (res.stop_reason === 'max_tokens') throw new AIError('The response was cut off — try again.')
  const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AIError('Got an unreadable answer from Claude — try again.')
  }
}

type RawSession = Omit<PlannedSession, 'id'>
const withIds = (xs: RawSession[], from: string, weekStart: string): PlannedSession[] =>
  xs.filter((s) => s.date >= from && s.date <= addDays(weekStart, 6))
    .map((s) => ({ ...s, id: uid(), tips: s.tips ?? [] }))
    .sort((a, b) => a.date.localeCompare(b.date))

export async function generateWeek(state: AppState, weekStart: string, today: string, notes: string, runDays: number[]): Promise<Pick<WeekPlan, 'summary' | 'sessions'>> {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const prompt = `${athleteContext(state, weekStart, today)}

AVAILABLE RUNNING DAYS: ${runDays.map((d) => days[d]).join(', ')}
ATHLETE NOTES FOR THIS WEEK: ${notes.trim() || '(none)'}

Plan the remaining days of this week, from ${today} through ${addDays(weekStart, 6)} — one entry per day, rest days included. Take the notes seriously (fatigue, niggles, schedule) and the recent data. If a note asks for something unwise, adjust it and explain why in the summary.`
  let out = await ask<{ summary: string; sessions: RawSession[] }>(state.anthropicKey, 'high', [{ role: 'user', content: prompt }], PLAN_SCHEMA)
  const issues = validateWeek(withIds(out.sessions, today, weekStart), state, weekStart).filter((i) => i.level === 'block')
  if (issues.length) {
    out = await ask(state.anthropicKey, 'high', [
      { role: 'user', content: prompt },
      { role: 'assistant', content: JSON.stringify(out) },
      { role: 'user', content: `The app's safety checks flagged:\n${issues.map((i) => '- ' + i.text).join('\n')}\nFix these and return the corrected plan.` },
    ], PLAN_SCHEMA)
  }
  return { summary: out.summary, sessions: withIds(out.sessions, today, weekStart) }
}

export async function chatWeek(state: AppState, plan: WeekPlan, today: string, message: string): Promise<{ reply: string; sessions?: PlannedSession[] }> {
  const remaining = plan.sessions.filter((s) => s.date >= today)
  const past = plan.sessions.filter((s) => s.date < today)
  const ctx = `${athleteContext(state, plan.weekStart, today)}

ATHLETE NOTES WHEN THIS WEEK WAS PLANNED: ${plan.notes || '(none)'}
CURRENT PLAN (remaining days):
${JSON.stringify(remaining.map(({ id: _id, ...s }) => s))}

You are now chatting with the athlete about this week's plan. They may ask to move, swap, shorten or change sessions. Apply sensible requests. If a request breaks training principles (e.g. two hard days in a row, a hard session before the race, a big jump in volume, running through pain), push back: explain why in plain words and offer the best alternative — do not apply the unwise version. Pain or injury notes: be cautious and suggest rest or seeing a physio. Only plan dates from ${today} to ${addDays(plan.weekStart, 6)}.`
  const history: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: ctx }, { role: 'assistant', content: 'Understood. What would you like to change?' }]
  for (const m of plan.chat.slice(-12)) history.push({ role: m.role, content: m.text })
  history.push({ role: 'user', content: message })

  let out = await ask<{ reply: string; changed: boolean; sessions: RawSession[] }>(state.anthropicKey, 'medium', history, CHAT_SCHEMA)
  if (out.changed) {
    const proposed = [...past, ...withIds(out.sessions, today, plan.weekStart)]
    const issues = validateWeek(proposed, state, plan.weekStart).filter((i) => i.level === 'block')
    if (issues.length) {
      out = await ask(state.anthropicKey, 'medium', [
        ...history,
        { role: 'assistant', content: JSON.stringify(out) },
        { role: 'user', content: `[App safety check — not from the athlete] Your proposed plan breaks rules:\n${issues.map((i) => '- ' + i.text).join('\n')}\nDo not apply it. Reply to the athlete explaining why, with a safe alternative plan.` },
      ], CHAT_SCHEMA)
    }
  }
  return { reply: out.reply, sessions: out.changed ? [...past, ...withIds(out.sessions, today, plan.weekStart)] : undefined }
}

export async function analyseRun(state: AppState, run: Run): Promise<RunAnalysis> {
  const s = sessionOn(state, run.date)
  const pred = predict(state.runs, run.date)
  const wp = workPace(run, s, pred?.vdot)
  const hr = maxHr(state)
  const detail = {
    date: run.date, name: run.name, distanceKm: +(run.distanceM / 1000).toFixed(2), movingTime: fmtTime(run.movingTimeS), elapsedTime: fmtTime(run.elapsedTimeS),
    avgPace: fmtPace(runPace(run.distanceM, run.movingTimeS)), workPace: wp ? fmtPace(wp) : undefined,
    avgHr: run.avgHr, maxHr: run.maxHr, cadence: run.cadence, elevGainM: run.elevGainM, relativeEffort: run.sufferScore, calories: run.calories,
    shoe: state.strava.shoes?.find((g) => g.id === run.gearId)?.name,
    bestEfforts: run.bestEfforts,
    laps: run.laps?.map((l) => ({ m: Math.round(l.distanceM), pace: fmtPace(runPace(l.distanceM, l.movingTimeS)), hr: l.avgHr && Math.round(l.avgHr) })),
    kmSplits: run.splits?.map((l) => ({ pace: fmtPace(runPace(l.distanceM, l.movingTimeS)), hr: l.avgHr && Math.round(l.avgHr), elev: l.elevDiff })),
  }
  const planned = s ? { type: s.type, title: s.title, distanceKm: s.distanceKm, details: s.details, pace: s.paceMax ? `${fmtPace(s.paceMin)}–${fmtPace(s.paceMax)}` : undefined, hr: s.hrMax ? `${s.hrMin}–${s.hrMax}` : undefined, shoe: s.shoe } : null
  const prompt = `${athleteContext(state, mondayOf(run.date), run.date)}

ANALYSE THIS RUN. Max HR ${hr.value ?? 'unknown'}.
PLANNED SESSION: ${planned ? JSON.stringify(planned) : 'none — this was an unplanned run'}
RUN DATA: ${JSON.stringify(detail)}

Compare what was done against the plan and the sub-20 goal. Be specific with numbers. Use verdict "unplanned" if there was no planned session.`
  const out = await ask<Omit<RunAnalysis, 'runId' | 'generatedAt'>>(state.anthropicKey, 'medium', [{ role: 'user', content: prompt }], ANALYSIS_SCHEMA)
  return { ...out, runId: run.id, generatedAt: Date.now() }
}

export const chatMsg = (role: ChatMessage['role'], text: string): ChatMessage => ({ role, text, at: Date.now() })
