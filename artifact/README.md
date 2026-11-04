# Sub 20 Challenge: claude.ai artifact

Sub 20 Challenge runs as a claude.ai artifact: https://claude.ai/artifact/Xop3BfXWRpjjTonRwffbZ7

`sub20-challenge.html` is the page source. Publishing it gives the page three runtime capabilities:

- **Strava connector** (`mcp`): `list_activities`, `get_activity_performance` and `get_athlete_zones`, read with the viewer's own Strava connection.
- **Claude** (`sample`): run analysis, on the viewer's Claude account. Weekly plans are made in a Claude chat, not on the page.
- **Storage** (`db`): `weeks/<monday>` holds each week's plan, written by Claude from chat with the ArtifactData tool. `analyses/<runId>` holds run analyses, written by the page.

The views are **Week** (this week's plan, or the runs done so far), **Calendar** (2 Nov to 10 Dec) and **Stats** (data-only 5K prediction).

The earlier standalone web app (Vite/React) is still in `src/` on `main`. The unfinished v2 of it is on the `wip-external-app-v2` branch.
