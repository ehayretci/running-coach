export type SessionType =
  | 'easy' | 'long' | 'intervals' | 'tempo' | 'goalpace'
  | 'timetrial' | 'race' | 'rest' | 'shakeout'

export type PaceKey = 'easy' | 'threshold' | 'interval' | 'goal' | 'race'

export interface Workout {
  wuKm: number
  cdKm: number
  reps: number
  repM?: number // rep distance in metres
  repMin?: number // or rep duration in minutes
  recovery?: string
}

export type SessionStatus = 'planned' | 'done' | 'missed' | 'skipped'

export interface Session {
  id: string
  date: string // YYYY-MM-DD
  type: SessionType
  title: string
  description: string // free text notes (user editable)
  distanceKm: number
  paceKey?: PaceKey
  workout?: Workout
  strides?: number
  /** Target pace for the main work of the session, sec/km */
  targetPace?: number
  /** For easy/long runs: [fast, slow] sec/km */
  paceRange?: [number, number]
  status: SessionStatus
  runId?: string
  note?: string // coach note (e.g. why it was adjusted)
}

export interface Lap {
  distanceM: number
  movingTimeS: number
  avgHr?: number
}

export interface Run {
  id: string
  source: 'strava' | 'manual'
  date: string // YYYY-MM-DD (local)
  startLocal: string
  name: string
  distanceM: number
  movingTimeS: number
  elapsedTimeS: number
  avgHr?: number
  maxHr?: number
  elevGainM?: number
  cadence?: number
  laps?: Lap[]
  /** Strava best efforts, name -> seconds (e.g. '5K': 1230) */
  bestEfforts?: Record<string, number>
  detailFetched?: boolean
  rpe?: number
  notes?: string
}

export interface Milestone {
  id: string
  title: string
  targetDate: string
  done: boolean
  doneDate?: string
  /** Auto-complete when a best effort of this name beats `underS` */
  auto?: { effort: string; distanceM: number; underS: number }
}

export interface Goal {
  id: string
  title: string
  description: string
  targetDate: string
  achieved: boolean
  milestones: Milestone[]
}

export interface Profile {
  name: string
  current5kS: number
  weeklyKm: number
  runDays: number[] // 0 = Mon ... 6 = Sun
  longRunDay: number
  raceDate: string
  goal5kS: number
  maxHr?: number
}

export interface StravaState {
  clientId: string
  clientSecret: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  athlete?: { id: number; firstname: string; lastname: string; profile?: string }
  lastSync?: number // epoch seconds
}

export interface CoachLogEntry {
  date: string
  message: string
}

export interface AppState {
  version: 1
  profile?: Profile
  sessions: Session[]
  runs: Run[]
  goals: Goal[]
  strava: StravaState
  planVdot?: number
  coachLog: CoachLogEntry[]
  dismissed: string[] // dismissed recommendation keys
}
