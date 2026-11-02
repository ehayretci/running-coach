import { useState } from 'react'
import type { AppState, Goal } from '../lib/types'
import { fmtDate, todayISO, uid } from '../lib/dates'

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void }

export function Goals({ state, update }: Props) {
  const [newGoal, setNewGoal] = useState({ title: '', date: '' })
  const today = todayISO()
  const setGoal = (id: string, fn: (g: Goal) => Goal) => update((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? fn(g) : g)) }))

  return (
    <div className="stack">
      <h2>Goals & milestones</h2>
      {state.goals.map((g) => <GoalCard key={g.id} goal={g} today={today} onChange={(fn) => setGoal(g.id, fn)}
        onDelete={() => confirm(`Delete “${g.title}”?`) && update((s) => ({ ...s, goals: s.goals.filter((x) => x.id !== g.id) }))} />)}
      <div className="card form">
        <h3>New goal</h3>
        <div className="row2">
          <label>Goal<input value={newGoal.title} onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })} placeholder="Half marathon in spring" /></label>
          <label>Target date<input type="date" value={newGoal.date} onChange={(e) => setNewGoal({ ...newGoal, date: e.target.value })} /></label>
        </div>
        <button className="primary" disabled={!newGoal.title || !newGoal.date} onClick={() => {
          update((s) => ({ ...s, goals: [...s.goals, { id: uid(), title: newGoal.title, description: '', targetDate: newGoal.date, achieved: false, milestones: [] }] }))
          setNewGoal({ title: '', date: '' })
        }}>Add goal</button>
      </div>
    </div>
  )
}

function GoalCard({ goal: g, today, onChange, onDelete }: { goal: Goal; today: string; onChange: (fn: (g: Goal) => Goal) => void; onDelete: () => void }) {
  const [m, setM] = useState({ title: '', date: '' })
  const done = g.milestones.filter((x) => x.done).length
  return (
    <div className={`card goal ${g.achieved ? 'achieved' : ''}`}>
      <div className="section-head">
        <div>
          <h3>{g.achieved ? '🏆 ' : ''}{g.title}</h3>
          <div className="muted">{g.description || `By ${fmtDate(g.targetDate)}`}</div>
        </div>
        <button className="ghost small" onClick={onDelete}>Delete</button>
      </div>
      {g.milestones.length > 0 && <div className="bar"><div style={{ width: `${(done / g.milestones.length) * 100}%` }} /></div>}
      <ul className="milestones">
        {g.milestones.map((ms) => (
          <li key={ms.id} className={ms.done ? 'done' : ms.targetDate < today ? 'late' : ''}>
            <input type="checkbox" checked={ms.done} onChange={() => onChange((x) => ({
              ...x, milestones: x.milestones.map((y) => (y.id === ms.id ? { ...y, done: !y.done, doneDate: !y.done ? today : undefined } : y)),
            }))} />
            <span className="ms-title">{ms.title}{ms.auto && <small className="auto"> auto</small>}</span>
            <span className="muted">{ms.done && ms.doneDate ? `✓ ${fmtDate(ms.doneDate)}` : fmtDate(ms.targetDate)}</span>
          </li>
        ))}
      </ul>
      <div className="add-ms">
        <input value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} placeholder="New milestone" />
        <input type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
        <button className="ghost small" disabled={!m.title} onClick={() => {
          onChange((x) => ({ ...x, milestones: [...x.milestones, { id: uid(), title: m.title, targetDate: m.date || x.targetDate, done: false }].sort((a, b) => a.targetDate.localeCompare(b.targetDate)) }))
          setM({ title: '', date: '' })
        }}>Add</button>
      </div>
    </div>
  )
}
