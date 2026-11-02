import { useState } from 'react'
import type { AppState } from '../lib/types'
import { addDays, fmtDate, mondayOf, todayISO } from '../lib/dates'
import { estimateFitness, fitnessHistory } from '../lib/coach'
import { fmtPace, fmtTime, predictTime, runPace, trainingPaces, vdotFromRace } from '../lib/pace'

const W = 360, H = 190, PAD = { l: 28, r: 8, t: 14, b: 24 }

function WeeklyChart({ weeks }: { weeks: { week: string; actual: number; planned: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(10, ...weeks.map((w) => Math.max(w.actual, w.planned))) * 1.1
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b
  const bw = iw / weeks.length
  const y = (v: number) => PAD.t + ih - (v / max) * ih
  const ticks = [0, max / 2, max].map((v) => Math.round(v / 5) * 5)
  return (
    <div className="chart">
      <div className="legend"><span className="sw sw-actual" /> Run <span className="sw sw-planned" /> Planned</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly distance">
        {ticks.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" /><text x={PAD.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{t}</text></g>)}
        {weeks.map((w, i) => {
          const x = PAD.l + i * bw
          const barW = Math.max(4, Math.min(28, bw - 6))
          const cx = x + bw / 2
          return (
            <g key={w.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <rect x={x} y={PAD.t} width={bw} height={ih} fill="transparent" />
              {w.actual > 0 && <path className="bar-actual" d={roundedTop(cx - barW / 2, y(w.actual), barW, PAD.t + ih - y(w.actual))} />}
              {w.planned > 0 && <line className="plan-mark" x1={cx - barW / 2 - 3} x2={cx + barW / 2 + 3} y1={y(w.planned)} y2={y(w.planned)} />}
              {i % Math.ceil(weeks.length / 5) === 0 && <text x={cx} y={H - 8} className="axis" textAnchor="middle">{fmtDate(w.week, { day: 'numeric', month: 'short' })}</text>}
            </g>
          )
        })}
      </svg>
      {hover != null && <div className="tooltip">{fmtDate(weeks[hover].week, { day: 'numeric', month: 'short' })} week · <b>{weeks[hover].actual.toFixed(1)} km</b> run{weeks[hover].planned ? ` / ${weeks[hover].planned.toFixed(0)} km planned` : ''}</div>}
    </div>
  )
}

function roundedTop(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

function FitnessChart({ points, goal }: { points: { week: string; vdot: number }[]; goal: number }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <p className="muted">Fitness trend appears after a couple of weeks of runs.</p>
  const vals = [...points.map((p) => p.vdot), goal]
  const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1)
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * iw
  const y = (v: number) => PAD.t + ih - ((v - min) / (max - min)) * ih
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.vdot)}`).join(' ')
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fitness trend (VDOT)">
        {[min, (min + max) / 2, max].map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" /><text x={PAD.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{t.toFixed(0)}</text></g>)}
        <line className="goal-line" x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} />
        <text className="axis goal-label" x={W - PAD.r} y={y(goal) - 6} textAnchor="end">Sub 20 ({goal.toFixed(1)})</text>
        <path d={d} className="line" />
        {points.map((p, i) => (
          <g key={p.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
            <circle cx={x(i)} cy={y(p.vdot)} r={12} fill="transparent" />
            <circle cx={x(i)} cy={y(p.vdot)} r={hover === i ? 5 : 4} className="dot" />
          </g>
        ))}
      </svg>
      {hover != null && <div className="tooltip">Week of {fmtDate(points[hover].week, { day: 'numeric', month: 'short' })} · VDOT <b>{points[hover].vdot.toFixed(1)}</b> ≈ 5K {fmtTime(predictTime(points[hover].vdot, 5000))}</div>}
    </div>
  )
}

export function Stats({ state }: { state: AppState }) {
  const p = state.profile!
  const today = todayISO()
  const fit = estimateFitness(state.runs, p)
  const paces = trainingPaces(state.planVdot ?? fit.vdot)
  const goalV = vdotFromRace(5000, p.goal5kS)

  const firstWeek = mondayOf(addDays(today, -49))
  const lastWeek = mondayOf(p.raceDate)
  const weeks: { week: string; actual: number; planned: number }[] = []
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) {
    const end = addDays(w, 6)
    weeks.push({
      week: w,
      actual: state.runs.filter((r) => r.date >= w && r.date <= end).reduce((a, r) => a + r.distanceM / 1000, 0),
      planned: state.sessions.filter((s) => s.date >= w && s.date <= end).reduce((a, s) => a + s.distanceKm, 0),
    })
  }

  const last30 = state.runs.filter((r) => r.date >= addDays(today, -29))
  const km30 = last30.reduce((a, r) => a + r.distanceM / 1000, 0)
  const t30 = last30.reduce((a, r) => a + r.movingTimeS, 0)
  const past = state.sessions.filter((s) => s.date < today && s.type !== 'rest')
  const compliance = past.length ? past.filter((s) => s.status === 'done').length / past.length : undefined

  const prs: Record<string, number> = {}
  for (const r of state.runs) for (const [k, v] of Object.entries(r.bestEfforts ?? {})) if (!prs[k] || v < prs[k]) prs[k] = v

  return (
    <div className="stack">
      <h2>Stats</h2>
      <div className="tiles">
        <div className="card tile"><div className="muted">Predicted 5K</div><div className="stat">{fmtTime(fit.predicted5k)}</div><small className="muted">from {fit.source}</small></div>
        <div className="card tile"><div className="muted">Last 30 days</div><div className="stat">{km30.toFixed(0)}<small> km</small></div><small className="muted">{last30.length} runs · {fmtPace(runPace(km30 * 1000, t30))} avg</small></div>
        <div className="card tile"><div className="muted">Plan completion</div><div className="stat">{compliance != null ? `${Math.round(compliance * 100)}%` : '–'}</div><small className="muted">of past sessions</small></div>
      </div>
      <section className="card"><h3>Weekly distance</h3><WeeklyChart weeks={weeks} /></section>
      <section className="card"><h3>Fitness trend (VDOT)</h3><FitnessChart points={fitnessHistory(state.runs)} goal={goalV} /></section>
      <section className="card">
        <h3>Your training paces</h3>
        <table className="table">
          <tbody>
            <tr><td>Easy / long</td><td>{fmtPace(paces.easy[0])} – {fmtPace(paces.easy[1])}</td></tr>
            <tr><td>Threshold (tempo)</td><td>{fmtPace(paces.threshold)}</td></tr>
            <tr><td>Interval</td><td>{fmtPace(paces.interval)}</td></tr>
            <tr><td>Sub-20 goal pace</td><td>{fmtPace(p.goal5kS / 5)}</td></tr>
          </tbody>
        </table>
      </section>
      {Object.keys(prs).length > 0 && (
        <section className="card">
          <h3>Best efforts (synced runs)</h3>
          <table className="table"><tbody>
            {['400m', '1/2 mile', '1K', '1 mile', '2 mile', '5K', '10K'].filter((k) => prs[k]).map((k) => <tr key={k}><td>{k}</td><td>{fmtTime(prs[k])}</td></tr>)}
          </tbody></table>
        </section>
      )}
    </div>
  )
}
