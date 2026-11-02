import { useState } from 'react'
import type { Profile } from '../lib/types'
import { DAY_NAMES } from '../lib/dates'
import { fmtTime, parseTime } from '../lib/pace'

export function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="chips">
      {DAY_NAMES.map((d, i) => (
        <button type="button" key={d} className={`chip ${value.includes(i) ? 'on' : ''}`}
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}>
          {d}
        </button>
      ))}
    </div>
  )
}

export function ProfileForm({ initial, submitLabel, onSubmit }: { initial?: Profile; submitLabel: string; onSubmit: (p: Profile) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [current, setCurrent] = useState(initial ? fmtTime(initial.current5kS) : '')
  const [goal, setGoal] = useState(initial ? fmtTime(initial.goal5kS) : '19:59')
  const [weeklyKm, setWeeklyKm] = useState(String(initial?.weeklyKm ?? 30))
  const [runDays, setRunDays] = useState<number[]>(initial?.runDays ?? [1, 3, 4, 6])
  const [longRunDay, setLongRunDay] = useState(initial?.longRunDay ?? 6)
  const [raceDate, setRaceDate] = useState(initial?.raceDate ?? '2026-12-10')
  const [maxHr, setMaxHr] = useState(initial?.maxHr ? String(initial.maxHr) : '')
  const [err, setErr] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const c = parseTime(current), g = parseTime(goal)
    if (!c || c < 600) return setErr('Enter your current 5K time like 21:30')
    if (!g) return setErr('Enter a goal time like 19:59')
    if (runDays.length < 2) return setErr('Pick at least 2 running days')
    const long = runDays.includes(longRunDay) ? longRunDay : runDays[runDays.length - 1]
    onSubmit({
      name: name.trim() || 'Runner', current5kS: c, goal5kS: g, weeklyKm: Math.max(10, Number(weeklyKm) || 30),
      runDays, longRunDay: long, raceDate, maxHr: maxHr ? Number(maxHr) : undefined,
    })
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Erim" /></label>
      <div className="row2">
        <label>Current 5K time<input value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="21:30" inputMode="numeric" />
          <small>Recent race or honest all-out estimate</small></label>
        <label>Goal 5K time<input value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
      </div>
      <div className="row2">
        <label>Typical weekly km<input value={weeklyKm} onChange={(e) => setWeeklyKm(e.target.value)} inputMode="numeric" /></label>
        <label>Race / target date<input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} /></label>
      </div>
      <label>Days you can run</label>
      <DayPicker value={runDays} onChange={setRunDays} />
      <label>Long run day
        <select value={longRunDay} onChange={(e) => setLongRunDay(Number(e.target.value))}>
          {runDays.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
        </select>
      </label>
      <label>Max heart rate (optional)<input value={maxHr} onChange={(e) => setMaxHr(e.target.value)} inputMode="numeric" placeholder="e.g. 192" /></label>
      {err && <p className="error">{err}</p>}
      <button className="primary" type="submit">{submitLabel}</button>
    </form>
  )
}

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  return (
    <div className="onboarding">
      <h1 className="brand big">EFECAN</h1>
      <p className="lead">Your running coach. First, tell me where you are — I’ll build your <b>Road to Sub 20</b> plan.</p>
      <div className="card"><ProfileForm submitLabel="Build my plan" onSubmit={onDone} /></div>
    </div>
  )
}
