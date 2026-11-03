# Efecan: claude.ai artifact

Efecan runs as a claude.ai artifact: https://claude.ai/artifact/Xop3BfXWRpjjTonRwffbZ7

`efecan.html` is the page source. Publishing it gives the page four runtime capabilities:

- **Strava connector** (`mcp`): `list_activities`, `get_activity_performance` and `get_athlete_zones`, read with the viewer's own Strava connection.
- **Claude** (`sample`): plan generation, chat changes and run analysis, on the viewer's Claude account.
- **Storage** (`db` + `user`): weekly plans, chat history and analyses, kept privately under `data/users/<id>/`.

The views are **Week** (generate a plan, chat to change it), **Calendar** (2 Nov to 10 Dec) and **Stats** (data-only 5K prediction).

The earlier standalone web app (Vite/React) is still in `src/` on `main`. The unfinished v2 of it is on the `wip-external-app-v2` branch.
