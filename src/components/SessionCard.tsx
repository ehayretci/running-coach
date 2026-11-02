import type { Run, Session } from '../lib/types'
import { describeSession, isQuality } from '../lib/plan'
import { execution } from '../lib/coach'
import { fmtDate } from '../lib/dates'
import { fmtPace, fmtTime, runPace } from '../lib/pace'

export const TYPE_LABEL: Record<Session['type'], string> = {
  easy: 'Easy', long: 'Long', intervals: 'Intervals', tempo: 'Tempo', goalpace: 'Goal pace',
  timetrial: 'Time trial', race: 'Race', rest: 'Rest', shakeout: 'Shake-out',
}

interface Props {
  session: Session
  run?: Run
  vdot: number
  showDate?: boolean
  onEdit?: () => void
  onStatus?: (status: Session['status']) => void
}

export function SessionCard({ session: s, run, vdot, showDate, onEdit, onStatus }: Props) {
  const ex = execution(s, run, vdot)
  const desc = describeSession(s)
  return (
    <div className={`session type-${s.type} status-${s.status}`}>
      <div className="session-head">
        {showDate && <span className="session-date">{fmtDate(s.date)}</span>}
        <span className={`tag tag-${s.type}`}>{TYPE_LABEL[s.type]}</span>
        <span className="session-title">{s.title}</span>
        {s.distanceKm > 0 && <span className="session-km">{s.distanceKm} km</span>}
      </div>
      {desc && <p className="session-desc">{desc}</p>}
      {s.description && <p className="session-notes">{s.description}</p>}
      {s.note && <p className="session-note">↻ {s.note}</p>}
      {run && (
        <div className="session-run">
          ✓ {(run.distanceM / 1000).toFixed(2)} km in {fmtTime(run.movingTimeS)} · {fmtPace(runPace(run.distanceM, run.movingTimeS))}
          {run.avgHr ? ` · ${Math.round(run.avgHr)} bpm` : ''}
          {ex && (
            <span className={`exec ${ex.deviation > 0.03 ? 'slow' : ex.deviation < -0.03 ? 'fast' : 'ok'}`}>
              work reps {fmtPace(ex.actualPace)} ({ex.deviation > 0 ? '+' : ''}{(ex.deviation * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      )}
      {s.status === 'missed' && <div className="session-missed">Missed</div>}
      {s.status === 'skipped' && <div className="session-missed">Skipped</div>}
      {(onEdit || onStatus) && s.type !== 'rest' && (
        <div className="session-actions">
          {onEdit && <button className="ghost small" onClick={onEdit}>Edit</button>}
          {onStatus && s.status === 'planned' && !run && <button className="ghost small" onClick={() => onStatus('skipped')}>Skip</button>}
          {onStatus && (s.status === 'skipped' || s.status === 'missed') && <button className="ghost small" onClick={() => onStatus('planned')}>Restore</button>}
          {isQuality(s) && !run && s.status === 'planned' && <span className="hint">Key session</span>}
        </div>
      )}
    </div>
  )
}
