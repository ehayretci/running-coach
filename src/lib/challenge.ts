/** Road to Sub 20 — fixed challenge parameters */
export const CHALLENGE_START = '2026-11-02' // the baseline 5K
export const RACE_DATE = '2026-12-10'
export const GOAL_5K_S = 19 * 60 + 59
export const GOAL_PACE = GOAL_5K_S / 5 // 3:59.8 /km

export const SHOES = {
  vomero: { name: 'Nike Vomero Plus', short: 'Vomero Plus', role: 'Max-cushion daily trainer', age: '≈1 year old' },
  vaporfly: { name: 'Nike Vaporfly 4', short: 'Vaporfly 4', role: 'Carbon-plated racer', age: '≈1 year old' },
  cloudmonster: { name: 'On Cloudmonster 3 Hyper', short: 'Cloudmonster Hyper', role: 'Cushioned, responsive super-trainer', age: 'brand new' },
  none: { name: 'No run', short: '—', role: '', age: '' },
} as const

/** Find the Strava gear entry for one of the athlete's shoes by name */
export function matchShoe(name: string): keyof typeof SHOES | undefined {
  const n = name.toLowerCase()
  if (n.includes('vomero')) return 'vomero'
  if (n.includes('vaporfly')) return 'vaporfly'
  if (n.includes('cloudmonster') || n.includes('monster')) return 'cloudmonster'
}
