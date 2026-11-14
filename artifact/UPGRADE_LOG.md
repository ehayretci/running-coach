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
- [x] 5. **Migrated (14 Nov):** 8 logs and 7 analyses copied to their Garmin IDs in one atomic batch. The originals under the Strava IDs are untouched, so the live Strava-based page still works.
- [ ] 6. Build the Stats page.
- [ ] 7. Test with a mock in the browser, then publish to the same artifact URL.
- [ ] 8. Verify the live data is untouched.

## Notes
- **Garmin activity IDs differ from Strava IDs**, but Garmin `start_time` ("2026-11-12 19:28:25") equals Strava `start_local` ("2026-11-12T19:28:25"). Map old logs and analyses by start time.
- `get_activities_by_date(start_date, end_date, page_size)` returns {activities:[{id, name, type:"running", start_time, distance_meters, duration_seconds, avg_hr_bpm, max_hr_bpm, steps, elevation_gain_meters, calories}]}.
- `get_vo2max_trend(start,end ≤90d)` returns {trend:[{date, vo2_max, carried_forward?}], latest_vo2_max}. Latest is 51.1 (14 Nov), up from 48.8 on 15 Oct.
- `get_race_predictions` returns "No race predictions found." `get_training_status` returns an empty object. Neither is usable.
- Still to check: get_activity_splits (laps), get_activity (summary incl. cadence/power/TE), get_activity_hr_in_timezones, get_lactate_threshold, get_personal_record.
- **More shapes (14 Nov):** `get_activity` gives avg_cadence (full spm), avg_stride_length_cm, avg_ground_contact_time_ms, avg_vertical_oscillation_cm, avg_power_watts, normalized_power_watts, training_effect_label, max_hr. `get_activity_splits` gives laps[{distance_meters, moving_duration_seconds, avg_hr_bpm, avg_cadence, avg_power_watts}]. `get_activity_hr_in_timezones` gives [{zoneNumber, secsInZone, zoneLowBoundary}] using Garmin's own zones (101/121/141/161/181). `get_personal_record` gives [{record_type, raw_value, date, activity_id}]. Erim's PRs: 1K 3:43, mile 6:14, **5K 20:57 (3 Sep 2026)**, 10K 46:08, HM 1:47:41.
- **Not available on the Venu 3S feed:** sleep, HRV, training readiness, recovery time, lactate threshold, race predictions. The readiness check therefore has to be load-based (days since last hard session, acute vs chronic km).
- **Football:** Garmin type `soccer`. There's no route polyline in the summaries, so the route map needs another source (FIT records) or gets dropped.
- **ID map (Strava → Garmin)** is saved in `artifact/migration/idmap.json`. Step 5 copies the logs and analyses to the Garmin IDs and keeps the originals.

## Build spec for steps 4, 6 and 7 (enough to continue in a new session)
Edit `artifact/sub20-challenge.html`. Keep the database collections (weeks, logs, analyses, coach) exactly as they are.

**Manifest:** `mcp: {servers:[{server:"Garmin", tools:["get_activities_by_date","get_activity","get_activity_splits","get_activity_hr_in_timezones","get_vo2max_trend","get_personal_record"]}]}, sample:{}, db:{}`. Drop Strava.

**Pipeline (replace loadStrava/mapRun/mapPerf):**
- List: `get_activities_by_date({start_date: CONTEXT_FROM, end_date: today, page_size:200})`, keeping `type` in running, treadmill_running, trail_running and soccer. Map to run {id:String(id), sport: soccer→"Soccer", otherwise "Run"; date: start_time.slice(0,10); start: start_time with the space replaced by "T"; km; moving: duration_seconds; elapsed; pace; elev; effort}.
- Detail per run (cache 7 days): `get_activity` → perf {avgHr, maxHr, watts: avg_power_watts, np, cadence: avg_cadence (already spm, don't ×2), strideCm, gctMs, voCm, te: training_effect_label}, plus `get_activity_splits` → laps [{m: distance_meters, t: moving_duration_seconds, watts: avg_power_watts, cad: avg_cadence, hr: avg_hr_bpm}], plus `get_activity_hr_in_timezones` → zones [secs×5]. Note Garmin lap cadence is full spm, while the old Strava code doubled it.
- Best efforts aren't in Garmin summaries. Compute best 1K/1 mile/5K from laps where possible, and otherwise use whole-run VDOT (the existing evidence() handles that).
- Route map: drop it (Garmin summaries have no polyline). Hide the card when there's no polyline (routeMap already returns "" then).
- Old Strava-ID docs stay in the database but are ignored, since the new IDs are in place.

**Tabs:** Week · Calendar · **Stats** (renamed from Progress; hash #stats, with #progress redirecting) · **Records** (new, #records).

**Stats, data only:**
1. Fitness: Garmin VO2max trend line (get_vo2max_trend, 90 days) plus the latest value; VDOT from workouts (tempo, intervals) and from the prediction; predicted 5K vs 19:59.
2. Training load: weekly running km (bars), weekly time in HR zones (stacked: Z1–2 easy, Z3, Z4–5 hard, using Erim's 210-based zones computed from laps, or Garmin's zones secs), hard/easy session count per week, training-effect label per run.
3. Form and efficiency: per-run cadence, stride length, GCT and vertical oscillation trend (dots, with easy and quality runs separated), W per m/s (economy), HR at easy pace (aerobic efficiency) over time. Targets: cadence 175–180 at 4:00/km, step about 1.40 m.
4. Readiness (load-based): days since the last hard session (football counts), 7-day vs 28-day km ratio, and a "Ready for hard session?" verdict applying the COACHING_NOTES rules (72 h, soreness check). Note: "Wear the watch overnight for HRV/sleep" (not available on the Venu 3S feed right now).

**Records:** Garmin PRs (1K, mile, 5K, 10K, HM, longest run) with dates; best efforts since 2 Nov from laps and VDOT; the 19:59 target vs the 5K PR of 20:57.

**Test:** update the scratchpad mock (mock.js/h4.cjs) to the Garmin shapes above, check for no errors in light/dark at 390 and 1000 px, then publish to the same URL with the new capabilities. Afterwards, verify the logs show as logged (not pending) for Garmin IDs.

- 14 Nov: Step 4 done. Garmin pipeline in page (loadGarmin/mapRun/mapPerf/bestOver/loadFitness/garminMsg). Best efforts computed from laps. Route map removed (no polyline in Garmin). Form row (stride/GCT/VO/NP) in run detail. Not yet published.
- 14 Nov: Step 6 done. Stats tab (4 sections) + Records tab built; #progress redirects to #stats. Step 7 testing: Garmin-shaped mock (real list + real 12 Nov splits + backup db) — no errors, 0 pending (logs match Garmin IDs), no overflow at 390/1000 light/dark.
- 14 Nov: Published v18 to the same URL (mcp Garmin 6 tools, sample, db). Step 8 verified: weeks 2026-11-02 (v6) and 2026-11-09 (v3) identical to backup; 16 logs and 14 analyses present (Strava + Garmin IDs). UPGRADE COMPLETE.
