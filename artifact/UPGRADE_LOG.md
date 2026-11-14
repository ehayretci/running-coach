# Garmin upgrade: progress log

The goal is to replace Strava with the Garmin connector (Venu 3S), add a running-focused data pipeline, and turn **Progress** into **Stats**. All existing data and Week 2's plan must stay intact.

## Status (update after each step)
- [x] 1. **Backup** (14 Nov): every database document copied to `artifact/backup-2026-11-14/`. That covers weeks 2026-11-02 and 2026-11-09, 8 logs, 7 analyses and coach/insights. Restore with ArtifactData `set` from these files if anything breaks.
- [ ] 2. Explore the Garmin connector: tools, data shapes, and how its activity IDs map to the Strava IDs used by logs and analyses.
- [ ] 3. Questions for Erim: which stats he wants and whether Strava stays as a fallback.
- [ ] 4. Data pipeline in the page (Garmin → normalised runs + running metrics).
- [ ] 5. Migrate logs and analyses keyed by Strava IDs (keep the originals; add a mapping).
- [ ] 6. Build the Stats page.
- [ ] 7. Test with a mock in the browser, then publish to the same artifact URL.
- [ ] 8. Verify the live data is untouched.

## Notes
