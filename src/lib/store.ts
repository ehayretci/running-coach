import { useCallback, useEffect, useState } from 'react'
import type { AppState } from './types'

const KEY = 'efecan:v2'
const OLD_KEY = 'efecan:v1'

export const emptyState = (): AppState => ({
  version: 2, runs: [], weeks: {}, analyses: {}, anthropicKey: '',
  strava: { clientId: '', clientSecret: '' },
  prefs: { runDays: [1, 3, 4, 6] },
})

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...emptyState(), ...JSON.parse(raw) }
    // Carry over Strava connection and runs from the first version
    const old = localStorage.getItem(OLD_KEY)
    if (old) {
      const o = JSON.parse(old)
      return { ...emptyState(), strava: { ...emptyState().strava, ...o.strava }, runs: o.runs ?? [], prefs: { runDays: o.profile?.runDays ?? [1, 3, 4, 6], maxHr: o.profile?.maxHr } }
    }
  } catch { /* ignore */ }
  return emptyState()
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage full or blocked */ }
  }, [state])
  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), [])
  return [state, update] as const
}

export function exportState(state: AppState) {
  const safe = { ...state, anthropicKey: '', strava: { ...state.strava, clientSecret: '', accessToken: undefined, refreshToken: undefined } }
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `efecan-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
}
