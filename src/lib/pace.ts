// Jack Daniels' VDOT model — used to turn race results into training paces.

/** VO2 cost (ml/kg/min) of running at velocity v (m/min) */
const vo2AtVelocity = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v

/** Fraction of VO2max sustainable for a race lasting t minutes */
const fractionForDuration = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)

export function vdotFromRace(distanceM: number, timeS: number): number {
  const t = timeS / 60
  const v = distanceM / t
  return vo2AtVelocity(v) / fractionForDuration(t)
}

/** Velocity (m/min) that costs the given VO2 */
function velocityForVo2(vo2: number): number {
  const a = 0.000104, b = 0.182258, c = -4.6 - vo2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Pace (sec/km) at a fraction of VDOT */
export function paceAt(vdot: number, fraction: number): number {
  return 60000 / velocityForVo2(vdot * fraction)
}

/** Predicted race time (s) for a distance at a given VDOT */
export function predictTime(vdot: number, distanceM: number): number {
  let lo = 60, hi = 60 * 60 * 10
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (vdotFromRace(distanceM, mid) > vdot) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface TrainingPaces {
  easy: [number, number]
  marathon: number
  threshold: number
  interval: number
  repetition: number
}

export function trainingPaces(vdot: number): TrainingPaces {
  return {
    easy: [paceAt(vdot, 0.74), paceAt(vdot, 0.65)],
    marathon: paceAt(vdot, 0.82),
    threshold: paceAt(vdot, 0.88),
    interval: paceAt(vdot, 0.98),
    repetition: paceAt(vdot, 1.07),
  }
}

export function fmtPace(secPerKm?: number): string {
  if (!secPerKm || !isFinite(secPerKm)) return '–'
  const s = Math.round(secPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`
}

export function fmtTime(totalS?: number): string {
  if (totalS == null || !isFinite(totalS)) return '–'
  const s = Math.round(totalS)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

/** Parse "19:59", "1:05:30" or "1199" into seconds */
export function parseTime(input: string): number | undefined {
  const parts = input.trim().split(':').map(Number)
  if (!parts.length || parts.some((p) => isNaN(p))) return undefined
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export const runPace = (distanceM: number, timeS: number) =>
  distanceM > 0 ? timeS / (distanceM / 1000) : undefined
