import { useState } from 'react'
import type { AppState, Run } from '../lib/types'
import { fmtDate, todayISO, uid } from '../lib/dates'
import { fmtPace, fmtTime, parseTime, runPace } from '../lib/pace'
import { runVdot } from '../lib/coach'

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; onSync: () => void; syncing: string }

export function Runs({ state, update, onSync, syncing }: Props) {
  const [adding, setAdding] = useState(false)
  const sessionByRun = new Map(state.sessions.filter((s) => s.runId).map((s) => [s.runId!, s]))
  const connected = !!state.strava.refreshToken

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Runs</h2>
        <div className="row-actions">
          {connected && <button className="ghost small" onClick={onSync} disabled={!!syncing}>{syncing || '↻ Sync Strava'}</button>}
          <button className="primary small" onClick={() => setAdding(true)}>+ Log run</button>
        </div>
      </div>
      {state.strava.lastSync && <p className="muted small-text">Last synced {new Date(state.strava.lastSync * 1000).toLocaleString()}</p>}
      {adding && <ManualRun onCancel={() => setAdding(false)} onSave={(r) => { update((s) => ({ ...s, runs: [r, ...s.runs].sort((a, b) => b.startLocal.localeCompare(a.startLocal)) })); setAdding(false) }} />}
      {state.runs.length === 0 && <p className="muted">No runs yet. Sync Strava or log one manually.</p>}
      {state.runs.map((r) => {
        const s = sessionByRun.get(r.id)
        const v = runVdot(r)
        return (
          <div className="card run" key={r.id}>
            <div className="run-head">
              <div>
                <b>{r.name}</b>
                <div className="muted">{fmtDate(r.date)} {s ? `· ${s.title}` : '· unplanned'} {r.source === 'strava' && <a className="strava-link" href={`https://www.strava.com/activities/${r.id.replace('strava-', '')}`} target="_blank" rel="noreferrer">View on Strava</a>}</div>
              </div>
              {r.source === 'manual' && <button className="ghost small" onClick={() => update((st) => ({ ...st, runs: st.runs.filter((x) => x.id !== r.id) }))}>Delete</button>}
            </div>
            <div className="run-stats">
              <span><b>{(r.distanceM / 1000).toFixed(2)}</b> km</span>
              <span><b>{fmtTime(r.movingTimeS)}</b></span>
              <span><b>{fmtPace(runPace(r.distanceM, r.movingTimeS))}</b></span>
              {r.avgHr && <span><b>{Math.round(r.avgHr)}</b> bpm</span>}
              {r.cadence && <span><b>{Math.round(r.cadence)}</b> spm</span>}
              {r.elevGainM != null && <span><b>{Math.round(r.elevGainM)}</b> m ↑</span>}
            </div>
            {r.bestEfforts && Object.keys(r.bestEfforts).length > 0 && (
              <div className="efforts">
                {['400m', '1K', '1 mile', '2 mile', '5K', '10K'].filter((k) => r.bestEfforts![k]).map((k) => (
                  <span key={k} className="effort">{k} <b>{fmtTime(r.bestEfforts![k])}</b></span>
                ))}
                {v && <span className="effort">VDOT <b>{v.toFixed(1)}</b></span>}
              </div>
            )}
            {r.notes && <p className="session-notes">{r.notes}</p>}
          </div>
        )
      })}
    </div>
  )
}

function ManualRun({ onSave, onCancel }: { onSave: (r: Run) => void; onCancel: () => void }) {
  const [date, setDate] = useState(todayISO())
  const [name, setName] = useState('Run')
  const [km, setKm] = useState('')
  const [time, setTime] = useState('')
  const [hr, setHr] = useState('')
  const [rpe, setRpe] = useState('5')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const submit = () => {
    const d = Number(km), t = parseTime(time)
    if (!d || !t) return setErr('Enter distance and time (e.g. 5 and 22:10)')
    onSave({
      id: `manual-${uid()}`, source: 'manual', date, startLocal: `${date}T12:00:00`, name,
      distanceM: d * 1000, movingTimeS: t, elapsedTimeS: t, avgHr: hr ? Number(hr) : undefined,
      rpe: Number(rpe), notes,
    })
  }
  return (
    <div className="card form">
      <div className="row2">
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      </div>
      <div className="row2">
        <label>Distance (km)<input value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" /></label>
        <label>Time<input value={time} onChange={(e) => setTime(e.target.value)} placeholder="25:30" /></label>
      </div>
      <div className="row2">
        <label>Avg HR<input value={hr} onChange={(e) => setHr(e.target.value)} inputMode="numeric" /></label>
        <label>Effort (1–10)<input type="number" min={1} max={10} value={rpe} onChange={(e) => setRpe(e.target.value)} /></label>
      </div>
      <label>Notes<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <p className="error">{err}</p>}
      <div className="row-actions"><button className="primary" onClick={submit}>Save run</button><button className="ghost" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
