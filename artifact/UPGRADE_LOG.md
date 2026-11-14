# Garmin upgrade: progress log

The goal is to replace Strava with the Garmin connector (Venu 3S), add a running-focused data pipeline, and turn **Progress** into **Stats**. All existing data and Week 2's plan must stay intact.

## Status (update after each step)
- [x] 1. **Backup** (14 Nov): every database document copied to `artifact/backup-2026-11-14/`. That covers weeks 2026-11-02 and 2026-11-09, 8 logs, 7 analyses and coach/insights. Restore with ArtifactData `set` from these files if anything breaks.
- [x] 2. Explored the Garmin connector (display name **"Garmin"**, connected).
- [x] 3. Erim's decisions (14 Nov):
  - **Garmin only.** Drop Strava from the app. Map old logs and analyses by start time.
  - **Stats tab** (replaces Progress), data-focused: (a) fitness and prediction (Garmin VO2max trend, lactate threshold, predicted 5K vs 19:59, VDOT); (b) training load (weekly km, time in HR zones per week, hard/easy balance, training effect); (c) form and efficiency (cadence, stride length, power per pace, HR at a given pace, running dynamics if available); (d) recovery readiness, running-relevant only (HRV, resting HR, sleep score, recovery time) as a "ready for a hard session?" check. No stress, hydration or steps.
  - **New Records tab** for PRs and best efforts. Stats shows data, not results.
  - Tabs become: Week · Calendar · Stats · Records.
- [ ] 4. Data pipeline in the page (Garmin → normalised runs + running metrics).
- [ ] 5. Migrate logs and analyses keyed by Strava IDs (keep the originals; add a mapping).
- [ ] 6. Build the Stats page.
- [ ] 7. Test with a mock in the browser, then publish to the same artifact URL.
- [ ] 8. Verify the live data is untouched.

## Notes
- **Garmin activity IDs differ from Strava IDs**, but Garmin `start_time` ("2026-11-12 19:28:25") equals Strava `start_local` ("2026-11-12T19:28:25"). Map old logs and analyses by start time.
- `get_activities_by_date(start_date, end_date, page_size)` returns {activities:[{id, name, type:"running", start_time, distance_meters, duration_seconds, avg_hr_bpm, max_hr_bpm, steps, elevation_gain_meters, calories}]}.
- `get_vo2max_trend(start,end ≤90d)` returns {trend:[{date, vo2_max, carried_forward?}], latest_vo2_max}. Latest is 51.1 (14 Nov), up from 48.8 on 15 Oct.
- `get_race_predictions` returns "No race predictions found." `get_training_status` returns an empty object. Neither is usable.
- Still to check: get_activity_splits (laps), get_activity (summary incl. cadence/power/TE), get_activity_hr_in_timezones, get_lactate_threshold, get_personal_record.
