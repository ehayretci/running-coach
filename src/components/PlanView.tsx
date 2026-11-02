import { useState } from 'react'
import type { AppState, Session, SessionType } from '../lib/types'
import { addDays, daysBetween, fmtDate, mondayOf, todayISO, uid } from '../lib/dates'
import { estimateFitness } from '../lib/coach'
import { paceFor } from '../lib/plan'
import { SessionCard, TYPE_LABEL } from './SessionCard'

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void }

export function PlanView({ state, update }: Props) {
  const today = todayISO()
  const first = state.sessions[0]?.date ?? today
  const last = state.sessions[state.sessions.length - 1]?.date ?? today
  const [week, setWeek] = useState(mondayOf(today < first ? first : today))
  const [editing, setEditing] = useState<Session | null>(null)
  const vdot = state.planVdot ?? estimateFitness(state.runs, state.profile!).vdot
  const runById = new Map(state.runs.map((r) => [r.id, r]))
  const end = addDays(week, 6)
  const sessions = state.sessions.filter((s) => s.date >= week && s.date <= end)
  const km = sessions.reduce((a, s) => a + s.distanceKm, 0)
  const raceWeek = mondayOf(state.profile!.raceDate)
  const weekNo = daysBetween(mondayOf(first), week) / 7 + 1

  const save = (s: Session) => {
    update((st) => {
      const exists = st.sessions.some((x) => x.id === s.id)
      const sessions = exists ? st.sessions.map((x) => (x.id === s.id ? s : x)) : [...st.sessions, s]
      return { ...st, sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)) }
    })
    setEditing(null)
  }

  return (
    <div className="stack">
      <div className="week-nav">
        <button className="ghost" onClick={() => setWeek(addDays(week, -7))} disabled={week <= mondayOf(first)}>←</button>
        <div className="week-title">
          <b>{week === raceWeek ? 'Race week' : `Week ${weekNo}`}</b>
          <span className="muted">{fmtDate(week, { day: 'numeric', month: 'short' })} – {fmtDate(end, { day: 'numeric', month: 'short' })} · {km.toFixed(0)} km</span>
        </div>
        <button className="ghost" onClick={() => setWeek(addDays(week, 7))} disabled={week >= mondayOf(last)}>→</button>
      </div>
      {sessions.map((s) => (
        <div key={s.id} className={s.date === today ? 'is-today' : ''}>
          <SessionCard session={s} run={s.runId ? runById.get(s.runId) : undefined} vdot={vdot} showDate
            onEdit={() => setEditing(s)}
            onStatus={(status) => update((st) => ({ ...st, sessions: st.sessions.map((x) => (x.id === s.id ? { ...x, status } : x)) }))} />
          {s.type === 'rest' && <button className="ghost small add" onClick={() => setEditing({ ...s, id: uid(), type: 'easy', title: 'Easy run', distanceKm: 5, paceKey: 'easy' })}>+ add run</button>}
        </div>
      ))}
      {sessions.length === 0 && <p className="muted">No sessions this week.</p>}
      {editing && <EditSession session={editing} vdot={vdot} state={state} onCancel={() => setEditing(null)} onSave={save}
        onDelete={() => { update((st) => ({ ...st, sessions: st.sessions.filter((x) => x.id !== editing.id) })); setEditing(null) }} />}
    </div>
  )
}

function EditSession({ session, vdot, state, onSave, onCancel, onDelete }: {
  session: Session; vdot: number; state: AppState; onSave: (s: Session) => void; onCancel: () => void; onDelete: () => void
}) {
  const [s, setS] = useState(session)
  const set = <K extends keyof Session>(k: K, v: Session[K]) => setS((x) => ({ ...x, [k]: v }))
  const changeType = (type: SessionType) => {
    const paceKey = type === 'easy' || type === 'long' || type === 'shakeout' ? 'easy'
      : type === 'tempo' ? 'threshold' : type === 'intervals' ? 'interval' : type === 'rest' ? undefined : 'goal'
    setS((x) => ({
      ...x, type, paceKey,
      targetPace: paceKey && paceKey !== 'easy' ? paceFor(paceKey, vdot, state.profile!) : undefined,
      title: x.title === TYPE_LABEL[x.type] || x.title.startsWith('Easy') || x.title === 'Rest' ? (type === 'easy' ? 'Easy run' : TYPE_LABEL[type]) : x.title,
      distanceKm: type === 'rest' ? 0 : x.distanceKm,
    }))
  }
  return (
    <div className="modal" onClick={onCancel}>
      <div className="card modal-body" onClick={(e) => e.stopPropagation()}>
        <h3>Edit session</h3>
        <div className="form">
          <div className="row2">
            <label>Date<input type="date" value={s.date} onChange={(e) => set('date', e.target.value)} /></label>
            <label>Type
              <select value={s.type} onChange={(e) => changeType(e.target.value as SessionType)}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label>Title<input value={s.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label>Distance (km)<input type="number" step="0.5" value={s.distanceKm} onChange={(e) => set('distanceKm', Number(e.target.value))} /></label>
          <label>Notes<textarea rows={3} value={s.description} onChange={(e) => set('description', e.target.value)} /></label>
          <div className="row-actions">
            <button className="primary" onClick={() => onSave(s)}>Save</button>
            <button className="ghost" onClick={onCancel}>Cancel</button>
            <button className="danger" onClick={onDelete}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  )
}
