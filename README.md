# Efecan — Running Coach

A personal running coach web app, built for the **Road to Sub 20** challenge: a sub-20:00 5K by 10 December 2026.

## What it does

- **Goals & milestones**: the Road to Sub 20 goal comes with stepping-stone milestones. Milestones tick off automatically when a Strava best effort beats them.
- **Weekly schedule**: builds a plan from today to race day (build → checkpoint time trial → goal-pace peak → taper → race week) on the days you can run. Every session is editable.
- **Strava sync**: connects with OAuth and pulls your runs, laps and best efforts, then links each run to the session planned for that day.
- **Analysis**: estimates your fitness (Jack Daniels' VDOT) and predicted 5K, compares each workout's rep paces to their targets, and charts weekly distance and your fitness trend.
- **Readjustment**: Efecan suggests changes and you choose whether to apply them:
  - speed up your paces when your fitness improves
  - ease or raise paces when two workouts in a row miss or beat their targets
  - move a missed key workout to a safe easy day
  - trim your volume after missed sessions or a jump in mileage
  - flag easy runs that are too fast

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

## Connect Strava

1. Create an API app at https://www.strava.com/settings/api.
2. Set **Authorization Callback Domain** to `ehayretci.github.io` for the hosted app, or `localhost` for local development.
3. In Efecan, open **Settings → Strava**, paste your Client ID and Client Secret, and click **Connect with Strava**.

Your credentials, tokens and data stay in your browser's localStorage. Nothing is stored on a server or committed to the repo. Use **Settings → Export backup** to save a copy.

## Deploy

Every push to `main` builds the app and deploys it to GitHub Pages through `.github/workflows/deploy.yml`.
One-time setup: in the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
The app is then live at https://ehayretci.github.io/running-coach/.

## Code map

| Path | Purpose |
|---|---|
| `src/lib/pace.ts` | VDOT model, training paces, race predictions |
| `src/lib/plan.ts` | Plan generator and pace recalculation |
| `src/lib/coach.ts` | Fitness estimate, run↔session linking, workout analysis, recommendations, milestones |
| `src/lib/strava.ts` | Strava OAuth, token refresh, activity sync |
| `src/lib/store.ts` | localStorage persistence, backup export |
| `src/components/*` | Today, Plan, Runs, Goals, Stats, Settings screens |
