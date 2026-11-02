import { useRef, useState } from 'react'
import type { AppState, Profile } from '../lib/types'
import { authorizeUrl, redirectUri } from '../lib/strava'
import { exportState, emptyState } from '../lib/store'
import { ProfileForm } from './Onboarding'

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; onProfile: (p: Profile, regenerate: boolean) => void }

export function Settings({ state, update, onProfile }: Props) {
  const [clientId, setClientId] = useState(state.strava.clientId)
  const [secret, setSecret] = useState(state.strava.clientSecret)
  const [regen, setRegen] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const s = state.strava
  const domain = window.location.hostname

  const connect = () => {
    update((st) => ({ ...st, strava: { ...st.strava, clientId: clientId.trim(), clientSecret: secret.trim() } }))
    window.location.href = authorizeUrl(clientId.trim())
  }

  return (
    <div className="stack">
      <h2>Settings</h2>
      <section className="card">
        <h3>Strava</h3>
        {s.refreshToken ? (
          <>
            <p>Connected as <b>{s.athlete ? `${s.athlete.firstname} ${s.athlete.lastname}` : 'athlete'}</b>.</p>
            <button className="ghost" onClick={() => update((st) => ({ ...st, strava: { clientId: st.strava.clientId, clientSecret: st.strava.clientSecret } }))}>Disconnect</button>
          </>
        ) : (
          <div className="form">
            <ol className="steps">
              <li>Go to <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">strava.com/settings/api</a> and create an app (any name, e.g. “Efecan”).</li>
              <li>Set <b>Authorization Callback Domain</b> to <code>{domain}</code></li>
              <li>Paste the <b>Client ID</b> and <b>Client Secret</b> below, then connect.</li>
            </ol>
            <label>Client ID<input value={clientId} onChange={(e) => setClientId(e.target.value)} inputMode="numeric" /></label>
            <label>Client Secret<input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
            <small className="muted">Stored only in this browser. Redirect: {redirectUri()}</small>
            <button className="primary" disabled={!clientId || !secret} onClick={connect}>Connect with Strava</button>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Profile & plan</h3>
        <ProfileForm initial={state.profile} submitLabel="Save profile" onSubmit={(p) => onProfile(p, regen)} />
        <label className="check"><input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} /> Rebuild upcoming plan from today when saving (past sessions are kept)</label>
      </section>

      <section className="card">
        <h3>Data</h3>
        <p className="muted">Everything is saved in this browser. Export a backup now and then.</p>
        <div className="row-actions">
          <button className="ghost" onClick={() => exportState(state)}>Export backup</button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>Import backup</button>
          <button className="danger" onClick={() => confirm('Erase all Efecan data in this browser?') && update(() => emptyState())}>Reset</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try {
            const data = JSON.parse(await f.text())
            update((st) => ({ ...emptyState(), ...data, strava: { ...data.strava, ...st.strava } }))
          } catch { alert('That file could not be read.') }
        }} />
      </section>
    </div>
  )
}
