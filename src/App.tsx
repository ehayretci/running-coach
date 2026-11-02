import { useCallback, useEffect, useRef, useState } from 'react'
import type { Profile } from './lib/types'
import { useAppState } from './lib/store'
import { exchangeCode, syncRuns } from './lib/strava'
import { checkMilestones, defaultGoal, estimateFitness, linkRuns } from './lib/coach'
import { generatePlan } from './lib/plan'
import { todayISO } from './lib/dates'
import { vdotFromRace } from './lib/pace'
import { Onboarding } from './components/Onboarding'
import { Dashboard } from './components/Dashboard'
import { PlanView } from './components/PlanView'
import { Runs } from './components/Runs'
import { Goals } from './components/Goals'
import { Stats } from './components/Stats'
import { Settings } from './components/Settings'

const TABS = [
  { id: 'today', label: 'Today', icon: '●' },
  { id: 'plan', label: 'Plan', icon: '▦' },
  { id: 'runs', label: 'Runs', icon: '↗' },
  { id: 'goals', label: 'Goals', icon: '★' },
  { id: 'stats', label: 'Stats', icon: '▤' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const tabFromHash = () => {
  const h = window.location.hash.replace('#/', '').replace('#', '')
  return TABS.some((t) => t.id === h) ? h : 'today'
}

export default function App() {
  const [state, update] = useAppState()
  const [tab, setTab] = useState(tabFromHash)
  const [syncing, setSyncing] = useState('')
  const [error, setError] = useState('')
  const stateRef = useRef(state)
  stateRef.current = state
  const handledCode = useRef(false)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const goTo = (t: string) => { window.location.hash = `/${t}`; setTab(t); window.scrollTo(0, 0) }

  const sync = useCallback(async () => {
    const s = stateRef.current
    if (!s.strava.refreshToken) return
    setError('')
    setSyncing('Syncing…')
    try {
      const res = await syncRuns(s.strava, s.runs, setSyncing)
      update((st) => ({ ...st, strava: res.strava, runs: res.runs }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing('')
    }
  }, [update])

  // Strava redirects back here with ?code=... after you authorise
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const err = params.get('error')
    if ((!code && !err) || handledCode.current) return
    handledCode.current = true
    window.history.replaceState(null, '', window.location.pathname + '#/settings')
    if (err) { setError(`Strava authorisation was cancelled (${err}).`); return }
    if (!params.get('scope')?.includes('activity:read')) {
      setError('Please allow Efecan to “View data about your activities” when connecting.')
    }
    setSyncing('Connecting to Strava…')
    exchangeCode(stateRef.current.strava, code!)
      .then((strava) => { update((s) => ({ ...s, strava })); stateRef.current = { ...stateRef.current, strava }; return sync() })
      .then(() => goTo('today'))
      .catch((e) => { setError(e instanceof Error ? e.message : String(e)); setSyncing('') })
  }, [sync, update])

  // Auto-sync when the app opens (at most hourly)
  useEffect(() => {
    const s = stateRef.current.strava
    if (s.refreshToken && (!s.lastSync || Date.now() / 1000 - s.lastSync > 3600)) sync()
  }, [sync])

  // Keep the plan and milestones in step with recorded runs
  useEffect(() => {
    update((s) => {
      if (!s.profile) return s
      const sessions = linkRuns(s.sessions, s.runs)
      const goals = checkMilestones(s.goals, s.runs)
      const changed = JSON.stringify(sessions) !== JSON.stringify(s.sessions) || JSON.stringify(goals) !== JSON.stringify(s.goals)
      return changed ? { ...s, sessions, goals } : s
    })
  }, [state.runs, update])

  const onProfile = (p: Profile, regenerate: boolean) => {
    update((s) => {
      if (!s.profile) {
        const vdot = vdotFromRace(5000, p.current5kS)
        return { ...s, profile: p, planVdot: vdot, sessions: linkRuns(generatePlan(p, vdot), s.runs), goals: [defaultGoal(p), ...s.goals],
          coachLog: [{ date: todayISO(), message: 'Plan created. Let’s go!' }] }
      }
      if (!regenerate) return { ...s, profile: p }
      const today = todayISO()
      const vdot = estimateFitness(s.runs, p).vdot
      const keep = s.sessions.filter((x) => x.date < today || (x.date === today && x.status === 'done'))
      const fresh = generatePlan(p, vdot, today).filter((x) => !keep.some((k) => k.date === x.date))
      return { ...s, profile: p, planVdot: vdot, sessions: linkRuns([...keep, ...fresh].sort((a, b) => a.date.localeCompare(b.date)), s.runs),
        coachLog: [{ date: today, message: 'Plan rebuilt from today with your updated profile.' }, ...s.coachLog] }
    })
    if (stateRef.current.profile) goTo('plan')
  }

  if (!state.profile) return <div className="app"><Onboarding onDone={(p) => onProfile(p, true)} /></div>

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">EFECAN</span>
        <nav className="tabs-top">
          {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => goTo(t.id)}>{t.label}</button>)}
        </nav>
      </header>
      {error && <div className="banner error" onClick={() => setError('')}>{error} <small>(tap to dismiss)</small></div>}
      {syncing && <div className="banner">{syncing}</div>}
      <main>
        {tab === 'today' && <Dashboard state={state} update={update} onSync={sync} syncing={syncing} goTo={goTo} />}
        {tab === 'plan' && <PlanView state={state} update={update} />}
        {tab === 'runs' && <Runs state={state} update={update} onSync={sync} syncing={syncing} />}
        {tab === 'goals' && <Goals state={state} update={update} />}
        {tab === 'stats' && <Stats state={state} />}
        {tab === 'settings' && <Settings state={state} update={update} onProfile={onProfile} />}
      </main>
      <nav className="tabs-bottom">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => goTo(t.id)}>
            <span aria-hidden>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
