import type { AppState } from '../lib/types'
import { analyse, estimateFitness, goalStatus } from '../lib/coach'
import { addDays, fmtDate, mondayOf, todayISO } from '../lib/dates'
import { fmtTime } from '../lib/pace'
import { SessionCard } from './SessionCard'

interface Props {
  state: AppState
  update: (fn: (s: AppState) => AppState) => void
  onSync: () => void
  syncing: string
  goTo: (tab: string) => void
}

export function Dashboard({ state, update, onSync, syncing, goTo }: Props) {
  const p = state.profile!
  const today = todayISO()
  const gs = goalStatus(state)!
  const fit = estimateFitness(state.runs, p)
  const vdot = state.planVdot ?? fit.vdot
  const recs = analyse(state)
  const runById = new Map(state.runs.map((r) => [r.id, r]))
  const todays = state.sessions.filter((s) => s.date === today)
  const next = state.sessions.find((s) => s.date > today && s.type !== 'rest')
  const wk = mondayOf(today), wkEnd = addDays(wk, 6)
  const weekSessions = state.sessions.filter((s) => s.date >= wk && s.date <= wkEnd)
  const plannedKm = weekSessions.reduce((a, s) => a + s.distanceKm, 0)
  const doneKm = state.runs.filter((r) => r.date >= wk && r.date <= wkEnd).reduce((a, r) => a + r.distanceM / 1000, 0)
  const keyDone = weekSessions.filter((s) => s.status === 'done' && s.type !== 'rest').length
  const keyTotal = weekSessions.filter((s) => s.type !== 'rest').length
  const connected = !!state.strava.refreshToken
  const progress = Math.max(0, Math.min(1, (p.current5kS - gs.predicted) / Math.max(1, p.current5kS - p.goal5kS)))

  return (
    <div className="stack">
      <section className="hero card">
        <div className="hero-top">
          <div>
            <div className="eyebrow">Road to Sub 20</div>
            <div className="hero-days">{Math.max(0, gs.daysLeft)}<span> days to go</span></div>
            <div className="muted">{fmtDate(p.raceDate, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>
          <div className="hero-pred">
            <div className="eyebrow">Predicted 5K</div>
            <div className={`hero-time ${gs.gapS <= 0 ? 'good' : ''}`}>{fmtTime(gs.predicted)}</div>
            <div className="muted">goal {fmtTime(gs.goal)} · {gs.gapS > 0 ? `${Math.round(gs.gapS)} s to find` : 'goal pace reached!'}</div>
          </div>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="verdict">{gs.verdict}</p>
      </section>

      {!connected && (
        <section className="card callout">
          <span><b>Connect Strava</b> so I can track your runs automatically.</span>
          <button className="primary small" onClick={() => goTo('settings')}>Set up</button>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Today</h2>
          {connected && <button className="ghost small" onClick={onSync} disabled={!!syncing}>{syncing || '↻ Sync Strava'}</button>}
        </div>
        {todays.length ? todays.map((s) => (
          <SessionCard key={s.id} session={s} run={s.runId ? runById.get(s.runId) : undefined} vdot={vdot} />
        )) : <p className="muted">Nothing scheduled.</p>}
        {next && <div className="next">Next: <b>{next.title}</b> · {fmtDate(next.date)}</div>}
      </section>

      <section className="card">
        <div className="section-head"><h2>This week</h2><button className="ghost small" onClick={() => goTo('plan')}>Plan →</button></div>
        <div className="stats-row">
          <div><div className="stat">{doneKm.toFixed(1)}<small> / {plannedKm.toFixed(0)} km</small></div><div className="muted">distance</div></div>
          <div><div className="stat">{keyDone}<small> / {keyTotal}</small></div><div className="muted">sessions</div></div>
          <div><div className="stat">{fit.vdot.toFixed(1)}</div><div className="muted">fitness (VDOT)</div></div>
        </div>
      </section>

      <section>
        <h2>Coach</h2>
        {recs.length === 0 && <p className="muted">All good — the plan fits how you’re running. Keep going.</p>}
        {recs.map((r) => (
          <div key={r.key} className={`rec rec-${r.level}`}>
            <b>{r.title}</b>
            <p>{r.detail}</p>
            <div className="rec-actions">
              {r.apply && <button className="primary small" onClick={() => update((s) => ({ ...r.apply!(s), dismissed: [...s.dismissed, r.key] }))}>{r.actionLabel}</button>}
              <button className="ghost small" onClick={() => update((s) => ({ ...s, dismissed: [...s.dismissed, r.key] }))}>Dismiss</button>
            </div>
          </div>
        ))}
        {state.coachLog.length > 0 && (
          <details className="log">
            <summary>Adjustment history</summary>
            <ul>{state.coachLog.slice(0, 15).map((l, i) => <li key={i}><span className="muted">{fmtDate(l.date)}</span> {l.message}</li>)}</ul>
          </details>
        )}
      </section>
    </div>
  )
}
