# Sub 20 Challenge: claude.ai artifact

Sub 20 Challenge runs as a claude.ai artifact: https://claude.ai/artifact/Xop3BfXWRpjjTonRwffbZ7

`sub20-challenge.html` is the page source. Publishing it gives the page three runtime capabilities:

- **Garmin connector** (`mcp`): `list_activities`, `get_activity_performance` and `get_athlete_zones`, read with the viewer's own Garmin connection.
- **Claude** (`sample`): run analysis, on the viewer's Claude account. Weekly plans are made in a Claude chat, not on the page.
- **Storage** (`db`): `weeks/<monday>` holds each week's plan, written by Claude from chat with the ArtifactData tool. `analyses/<runId>` holds run analyses, written by the page. `logs/<runId>` holds your confirmation, comment and effort for each run; challenge runs count only once logged. `coach/insights` holds the coaching rules from `COACHING_NOTES.md`, which the in-app coach always applies.

The views are **Week** (this week's plan, or the runs done so far), **Calendar** (2 Nov to 10 Dec) , **Stats** (fitness and prediction, training load, form and efficiency, recovery readiness) and **Records** (Garmin PRs and best efforts since 2 Nov).

The earlier standalone web app (Vite/React) is still in `src/` on `main`. The unfinished v2 of it is on the `wip-external-app-v2` branch.
