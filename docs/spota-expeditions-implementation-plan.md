# Spota Expeditions — Implementation Plan

| | |
|---|---|
| **BRD** | `claude/spota-expeditions-brd.md` (v1.0) |
| **Stack** | React 19 + Vite, Capacitor 8 (Android), Supabase (Postgres + Edge Functions + Storage) |
| **Status** | v1.1 — Phase 0 code complete (field test + deploy pending) |
| **Date** | 13 Oct 2026 |
| **Estimate** | 8 weeks MVP (1 FE + 1 BE/full-stack + PM/QA) |

---

## 0. Codebase baseline (audited 13 Oct 2026)

| Existing piece | Current behaviour | Gap for Expeditions |
|---|---|---|
| `safe_treks` table (`supabase_safe_trek_setup.sql`) | Destination + check-in timer + status; `id serial` | **No GPS track recorded**, no link to an adventure |
| `lib/safeTrekTimer.js` | Countdown + localStorage active trek | Needs track-recorder hooks |
| `SafeTrekView.jsx` | Start / check-in / complete UI | Needs "Expedition mode" + photo on complete |
| `lib/exifUtils.js` | Reads EXIF GPS from photos | Needs timestamp extraction (verify it returns `DateTimeOriginal`) |
| `lib/badgeEngine.js` | `BADGE_DEFS`, `checkBadges`, `triggerBadgeCelebration` | Add 4 Expedition badges + tier-up celebration |
| `profiles` | `username, avatar_url, reputation, is_verified` | Add home location, tier, public-board flag |
| `AdminView.jsx` | Spot-verification scorer + moderation | Add "Expedition Review" tab |
| Extensions | `pg_cron` only commented out; **no PostGIS** | Enable both |
| Routes (`App.jsx`) | `/safe-trek`, `/profile`, … | Add `/expeditions`, `/expeditions/:slug`, `/leaderboard` |

---

## 1. Architecture

```
 Device (Capacitor/Android)                      Supabase
 ┌────────────────────────────┐          ┌──────────────────────────────────┐
 │ SafeTrekView (Expedition)  │          │ adventures (catalog, PostGIS)    │
 │  └ trackRecorder.js ──────►│ IndexedDB│ adventure_attempts (+track)      │
 │     (bg geolocation, 30s)  │  queue   │ ap_ledger (append-only)          │
 │  └ complete + summit photo │─────────►│ Storage: expedition-photos       │
 │ expeditionService.js       │  sync    │                                  │
 │  (offline queue)           │          │ Edge Fn: verify-attempt ─► score │
 └────────────────────────────┘          │   └ award_ap() (SECURITY DEFINER)│
 ┌────────────────────────────┐          │ pg_cron (15 min) ─► refresh MVs  │
 │ LeaderboardView ◄──── RPC ─│◄─────────│ lb_* materialized views          │
 │ ProfileView (tier, ranks)  │          │ get_leaderboard() RPC            │
 └────────────────────────────┘          └──────────────────────────────────┘
```

Principle: **the client records, the server judges.** The client never writes status, score or AP.

**Phase 0 design refinements (v1.1):**
- **Submit once, not create-at-start.** Trailheads usually have no signal, so the attempt lives only on the device (IndexedDB) until completion, then is written once via `submit_attempt()`. The server `status` set is `submitted → verified | pending | rejected`, with no server-side `recording` state. Device-side states: `recording → completed_local → queued → submitted`.
- **No direct table writes.** Users have no INSERT/UPDATE policy on `adventure_attempts`. `submit_attempt()` (SECURITY DEFINER) is the only write path. It validates ownership, coordinates, time window and photo folder, and is idempotent on `client_attempt_id`. Re-submits are ignored once an attempt is judged.
- **Track storage split.** `track` is a 2D `geography(LINESTRING)` for geofence/route checks. `track_points` is JSONB `[{lat,lng,alt,acc,t,mock}]` and keeps timestamps + altitude for the Phase 1 speed and elevation checks. `mock_point_count` is precomputed.
- **`coords_verified` flag on `adventures`.** It separates dev/approximate catalog rows from curated ones.
- **Tier/AP tamper guard.** A trigger on `profiles` resets `tier`/`total_ap` on any update made by `authenticated`/`anon`. Only SECURITY DEFINER functions can change them.

---

## 2. Data model — migration `supabase_expeditions_setup.sql`

```sql
-- 2.1 Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2.2 Profiles additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_country TEXT DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS home_state   TEXT,
  ADD COLUMN IF NOT EXISTS home_region  TEXT,          -- district/city
  ADD COLUMN IF NOT EXISTS tier         TEXT DEFAULT 'wanderer',
  ADD COLUMN IF NOT EXISTS total_ap     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_on_leaderboards BOOLEAN DEFAULT TRUE;   -- D2: public by default

-- 2.3 Adventure catalog
CREATE TABLE IF NOT EXISTS public.adventures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  grade            SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 5),
  distance_km      NUMERIC(6,2) NOT NULL,
  elevation_gain_m INTEGER NOT NULL,
  max_altitude_m   INTEGER NOT NULL,
  typical_days     SMALLINT DEFAULT 1,
  start_point      GEOGRAPHY(POINT,4326),
  endpoint         GEOGRAPHY(POINT,4326) NOT NULL,
  endpoint_radius_m INTEGER DEFAULT 150,
  route            GEOGRAPHY(LINESTRING,4326),       -- optional reference route
  country          TEXT DEFAULT 'IN',
  state            TEXT NOT NULL,
  terrain_region   TEXT NOT NULL,                    -- Kullu, Garhwal, Kumaon…
  winter_start_md  TEXT,                             -- 'MM-DD'
  winter_end_md    TEXT,
  cover_url        TEXT,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 2.4 Attempts
CREATE TABLE IF NOT EXISTS public.adventure_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  adventure_id    UUID REFERENCES public.adventures(id) NOT NULL,
  safe_trek_id    INTEGER REFERENCES public.safe_treks(id),
  is_guided       BOOLEAN DEFAULT FALSE,             -- D1: stored for analytics only, no score effect
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  track           GEOGRAPHY(LINESTRING,4326),        -- 2D, for geofence/route checks
  track_points    JSONB,                             -- [{lat,lng,alt,acc,t,mock}] for speed/elevation checks
  mock_point_count INTEGER,
  track_point_count INTEGER,
  photo_paths     TEXT[] DEFAULT '{}',
  photo_meta      JSONB DEFAULT '[]',                -- [{lat,lng,taken_at}]
  checkins_on_time BOOLEAN,
  status          TEXT DEFAULT 'recording'
                  CHECK (status IN ('submitted','verified','pending','rejected')),
  verification_score SMALLINT,
  verification_breakdown JSONB,
  reviewed_by     UUID REFERENCES public.profiles(id),
  review_note     TEXT,
  appeal_used     BOOLEAN DEFAULT FALSE,
  client_attempt_id TEXT UNIQUE,                     -- idempotency for offline sync
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON public.adventure_attempts(user_id);
CREATE INDEX ON public.adventure_attempts(adventure_id, status);

-- 2.5 AP ledger (append-only)
CREATE TABLE IF NOT EXISTS public.ap_ledger (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  attempt_id     UUID REFERENCES public.adventure_attempts(id),
  points         INTEGER NOT NULL,
  formula_version TEXT NOT NULL DEFAULT 'v1',
  breakdown      JSONB NOT NULL,     -- {base, distanceF, gainF, altitudeF, seasonF, repeatF, safety}
  reason         TEXT DEFAULT 'attempt_verified',   -- or 'admin_adjustment', 'recalc'
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON public.ap_ledger(user_id);
```

### 2.6 RLS
| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `adventures` | everyone (`is_active`) | admin only | admin only | — |
| `adventure_attempts` | owner + admin (track is never public) | none (only via `submit_attempt()` RPC) | admin (review) | none |
| `ap_ledger` | owner | service role only (via `award_ap()`) | none | none |
| `profiles` new cols | existing policy | — | owner can update `home_*`, `show_on_leaderboards`; **not** `tier`/`total_ap` (column-level grant or trigger guard) | — |

### 2.7 Functions
- `award_ap(attempt_id UUID)` — `SECURITY DEFINER`; computes the formula (BRD FR-4.1), inserts the ledger row, updates `profiles.total_ap` + `tier`. Idempotent: no-op if a ledger row exists for the attempt.
- `compute_tier(ap INT) RETURNS TEXT`.
- `get_leaderboard(lens TEXT, level TEXT, scope TEXT, window TEXT, lim INT DEFAULT 100)` → top N + caller's rank ±5.

### 2.8 Leaderboard materialized views
```sql
-- Home lens: one row per user, partition keys from profile
CREATE MATERIALIZED VIEW lb_home AS
SELECT p.id user_id, p.username, p.avatar_url, p.tier,
       p.home_country, p.home_state, p.home_region,
       SUM(l.points) ap, MAX(l.created_at) last_at
FROM ap_ledger l JOIN profiles p ON p.id = l.user_id
WHERE p.show_on_leaderboards
GROUP BY p.id;

-- Terrain lens: AP attributed to where the adventure happened
CREATE MATERIALIZED VIEW lb_terrain AS
SELECT l.user_id, p.username, p.avatar_url, p.tier,
       a.country, a.state, a.terrain_region, SUM(l.points) ap, MAX(l.created_at) last_at
FROM ap_ledger l
JOIN adventure_attempts t ON t.id = l.attempt_id
JOIN adventures a ON a.id = t.adventure_id
JOIN profiles p ON p.id = l.user_id
WHERE p.show_on_leaderboards
GROUP BY l.user_id, p.username, p.avatar_url, p.tier, a.country, a.state, a.terrain_region;

CREATE UNIQUE INDEX ON lb_home(user_id);
CREATE UNIQUE INDEX ON lb_terrain(user_id, country, state, terrain_region);

SELECT cron.schedule('refresh-leaderboards','*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY lb_home;
    REFRESH MATERIALIZED VIEW CONCURRENTLY lb_terrain;$$);
```
`get_leaderboard` aggregates `lb_terrain` up to state/country/global with `RANK() OVER (ORDER BY ap DESC, last_at ASC)`. The tie-break is "earliest to reach the AP". MVP approximates it with `last_at`; V2 can store `reached_at`. Season (V2) = same views filtered by `l.created_at` in the current quarter.

---

## 3. Server: Edge Function `verify-attempt`

**Trigger:** client calls after upload, plus a DB webhook on `status = 'submitted'` as a safety net.

```
1. Load attempt + adventure (service role)
2. Checks (BRD FR-3.2):
   geofence   35  ST_DWithin(track, endpoint, endpoint_radius_m)
   route      20  % points within 500 m of route (or start→end corridor)
   photo      20  any photo_meta within 300 m of endpoint AND taken_at ∈ [started_at, completed_at+2h]
   movement   15  no sustained >15 km/h > 2 min; no >2 km jumps between consecutive points
   elevation  10  max(Z) ≥ 0.9 × max_altitude_m   (if device altitude null → DEM lookup, else partial credit 5)
3. score ≥75 → verified → award_ap()
   40–74     → pending  (AdminView queue)
   <40       → rejected (appeal allowed once)
4. Persist verification_score + verification_breakdown
5. Return status to client → celebration / pending UI
```
- Most geometry runs in SQL (PostGIS) through an RPC `verify_attempt_geo(attempt_id)` to keep the Edge Function thin.
- Mock-location flag from Android (`isFromMockProvider`) is sent per point. Any mocked points → auto `pending`.

---

## 4. Client implementation

### 4.1 New files
| File | Purpose |
|---|---|
| `src/lib/trackRecorder.js` | Start/stop/pause background GPS; 30 s sampling (60 s low-power); writes points to IndexedDB; resume after app kill |
| `src/lib/expeditionService.js` | `startAttempt()`, `completeAttempt()`, `syncPendingAttempts()`; offline queue key `spota_pending_attempts`; idempotent via `client_attempt_id` |
| `src/lib/apFormula.js` | Client-side **preview only** of AP (mirrors server v1) for "You'll earn ~X AP" |
| `src/lib/leaderboardService.js` | `getLeaderboard({lens, level, scope, window})`, cached in localStorage for offline viewing |
| `src/pages/ExpeditionsView.jsx/.css` | Catalog list + filters (state, region, grade) |
| `src/pages/AdventureDetailView.jsx/.css` | Adventure details, AP preview, "Start Expedition", user's attempts |
| `src/pages/LeaderboardView.jsx/.css` | Lens toggle (Home/Terrain), level tabs (Global/India/State), list + sticky "You" row |
| `src/components/TierBadge.jsx` | Tier pill + progress to next tier |
| `src/components/RankShareCard.jsx` | Canvas share card (reuse recap/share-card patterns) |
| `src/components/HomeLocationPicker.jsx` | State + district picker (onboarding + settings) |

### 4.2 Modified files
| File | Change |
|---|---|
| `SafeTrekView.jsx` | "Expedition mode" when launched with `adventureId`: shows live track stats (distance, altitude), Complete → summit photo capture |
| `lib/safeTrekTimer.js` | Expose on-time check-in history → `checkins_on_time` |
| `lib/exifUtils.js` | Return `takenAt` alongside lat/lng |
| `lib/badgeEngine.js` | Add `first_expedition`, `high_altitude`, `winter_warrior`, `state_explorer`; tier-up celebration |
| `ProfileView.jsx` | Tier, AP, ranks, verified adventure history, public-board toggle |
| `MapView.jsx` | Optional "Expeditions" layer (endpoint pins) |
| `AdminView.jsx` | New "Expedition Review" tab: pending queue, track on Leaflet map, breakdown, approve/reject with note |
| `App.jsx` | Routes `/expeditions`, `/expeditions/:slug`, `/leaderboard` |
| Bottom nav / Layout | Entry point to Expeditions/Leaderboard |

### 4.3 New dependency (**approval needed** — CLAUDE.md restricts new deps)
- `@capacitor-community/background-geolocation` for screen-off recording on Android.
  - Fallback if not approved: foreground-only recording with a wake-lock + "keep app open" banner. Expect lower verification rates.
- Android manifest: `ACCESS_BACKGROUND_LOCATION`, foreground service notification ("Spota is recording your expedition").

### 4.4 Offline behaviour (CLAUDE.md rule)
- Recording: IndexedDB store `expedition_tracks` keyed by `client_attempt_id`.
- Completion offline: attempt + photos queued in `spota_pending_attempts`; sync runs on `online` event and app resume, using `useOfflineSpots`-style detection.
- Leaderboards offline: show last cached board with a "Last updated hh:mm" label.

---

## 5. Seed data — 50 adventures
- `scratch/seed_adventures.sql` (or `.js` via existing scratch pattern).
- MVP mix: ~30 Himachal (Kullu, Kangra, Lahaul-Spiti, Kinnaur, Shimla), ~20 Uttarakhand (Garhwal, Kumaon).
- Grade spread: G1 ×10 (e.g., Triund), G2 ×15, G3 ×13 (e.g., Kedarkantha, Hampta), G4 ×9, G5 ×3 (e.g., expedition peaks).
- Each needs a validated endpoint coordinate + max altitude; route LineString optional in MVP.
- Owner: PM curates the sheet → BE converts it to SQL.

---

## 6. Phased delivery

### Phase 0 — Foundations (Week 1–2) — code complete 13 Oct 2026
- [x] Approved 13 Oct 2026: `@capacitor-community/background-geolocation@^1.2.26` installed, `npx cap update android` run (plugin registered in Gradle). The code still falls back to foreground `watchPosition` on web
- [x] Migration `supabase_expeditions_setup.sql`: PostGIS, profile cols + guard trigger, `adventures`, `adventure_attempts`, `ap_ledger`, RLS, private `expedition-photos` bucket, `compute_tier()`, `submit_attempt()` RPC
- [x] `src/lib/expeditionStore.js`: IndexedDB (`spota_expeditions_db`: attempts / points / photos)
- [x] `src/lib/trackRecorder.js`: start/stop/discard/resume-after-kill, 30 s / 60 s sampling, accuracy filter, live stats, mock-location flag
- [x] `src/lib/expeditionService.js`: summit photo (EXIF before compression), `completeAttempt`, offline queue `spota_pending_attempts`, `syncPendingAttempts`, `registerAutoSync`
- [x] `exifUtils.js`: new `extractExifMeta()` returns `{lat, lng, takenAt}` (existing `extractExifGps` untouched)
- [x] Dev seed `scratch/seed_adventures_dev.sql`: 10 HP/UK adventures + `[DEV]` Aravalli test loop (approximate coords, `coords_verified = false`)
- [x] Tests: 27 Vitest unit tests (`trackRecorder`, `expeditionService`, `exifUtils`); migration + RLS + RPC verified on Postgres 16 + PostGIS (idempotent re-run, hijack/foreign-folder/foreign-safe-trek/anon rejected, no self-promotion of tier/AP)
- [x] Android permissions: the plugin's manifest merges in FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION and POST_NOTIFICATIONS (no ACCESS_BACKGROUND_LOCATION needed, because it uses a foreground service). App manifest keeps GPS `required=false` via `tools:replace`. Gradle build not yet run
- [x] Migration + dev seed applied to Supabase project `jtyfkglqkklgmewyjpde` (13 Oct 2026). Verified: 3 tables with RLS on, 8 policies, profile cols, functions + guard trigger, private bucket, anon blocked from `submit_attempt`, pg_cron 1.6.4, 11 adventures
- [ ] Minimal dev UI hook (Expedition mode in `SafeTrekView`) to drive the field test, moved up from Phase 1
- **Exit:** a 2 h test walk (Aravalli test loop) records a track offline and syncs it to `adventure_attempts.track`

### Phase 1 — Verification + AP (Week 3–4)
- [ ] `verify_attempt_geo` RPC + `verify-attempt` Edge Function
- [ ] `award_ap()` + `compute_tier()` + ledger
- [ ] `expeditionService.js` (start/complete/sync, idempotent)
- [ ] SafeTrekView Expedition mode + summit photo
- [ ] AdminView "Expedition Review" tab
- **Exit:** a real trek gets verified with AP awarded; a spoofed track goes to pending/rejected

### Phase 2 — Leaderboards, tiers, profile (Week 5–6)
- [ ] MVs + pg_cron refresh + `get_leaderboard` RPC
- [ ] `LeaderboardView`, `ExpeditionsView`, `AdventureDetailView`
- [ ] `TierBadge`, `RankShareCard`, `HomeLocationPicker`
- [ ] ProfileView updates + public-board toggle
- [ ] New badges in `badgeEngine.js`
- [ ] Seed remaining 40 adventures
- **Exit:** Home + Terrain boards at Global/India/State render in < 300 ms

### Phase 3 — Beta & launch (Week 7–8)
- [ ] Closed beta: 50 trekkers, HP/UK routes
- [ ] Tune verification thresholds from real data (false-reject rate)
- [ ] Battery test on 3 low/mid Android devices
- [ ] Analytics events (see §8)
- [ ] Launch + share-card campaign

### V2 (post-launch, ~6 weeks)
- Region/valley boards, quarterly Seasons (`reached_at` + season filter)
- Buddy/guide attestation (Ridge Runner+)
- User-submitted routes → AdminView moderation
- Agency-sponsored challenges via AgencyDashboard

---

## 7. Test plan
| Layer | Tests |
|---|---|
| Unit (`src/lib/__tests__`) | `apFormula` (all multipliers, repeat decay, guided = self-guided), `trackRecorder` buffering, `expeditionService` offline queue idempotency |
| SQL | `award_ap` idempotency; RLS: user can't update status/score/AP, can't read others' tracks; leaderboard excludes opted-out users |
| Verification fixtures | Real track (pass), car track (movement fail), teleport/spoof (fail), no-summit track (geofence fail), stale photo (EXIF fail), borderline (pending) |
| E2E (`e2e/`, Playwright) | Browse → start → complete (mock GPS) → pending → admin approve → AP + rank visible |
| Field | 3 real treks (G1, G3, G4) on Android, airplane mode throughout |

## 8. Analytics events
`expedition_started`, `expedition_completed`, `attempt_verified`, `attempt_pending`, `attempt_rejected`, `appeal_submitted`, `leaderboard_viewed {lens, level}`, `tier_up {tier}`, `rank_card_shared`, `leaderboard_opt_out`.

## 9. Open items
| # | Item | Owner |
|---|---|---|
| 1 | ~~Approve `@capacitor-community/background-geolocation`~~ Done 13 Oct | Rahul |
| 2 | Curate 50-adventure seed sheet (coords, altitude, grade) | Rahul |
| 3 | DEM source for elevation fallback (e.g., Open-Elevation / SRTM tiles) | BE |
| 4 | Confirm `exifUtils` reads `DateTimeOriginal` on Android camera output (`extractExifMeta` built + unit-tested with mocks; needs a real-device check) | FE |
| 6 | **Live DB finding (13 Oct):** `supabase_p0_security_fixes.sql` was never applied to Supabase (`profiles.is_admin` missing). The expeditions migration now adds `is_admin` itself and its guard trigger blocks self-promotion. The P0 fixes to the spots/storage policies are still unapplied | Rahul |
| 5 | Local `node_modules` were installed on Windows. Run tests from Windows (`npm test`) or reinstall in WSL/Linux | Rahul |

## 10. Change log
| Version | Date | Change |
|---|---|---|
| 1.0 | 13 Oct 2026 | Initial plan. Includes D1 (guided same scoring → `is_guided` analytics-only) and D2 (public by default → `show_on_leaderboards DEFAULT TRUE`, tracks private). |
| 1.1 | 13 Oct 2026 | Phase 0 code delivered (migration, store, recorder, service, EXIF time, dev seed, 27 tests). Design refinements: submit-once RPC, no direct table writes, `track` + `track_points` split, `coords_verified`, tier/AP guard trigger. Dev UI hook moved into Phase 0 for the field test. |
| 1.2 | 13 Oct 2026 | Background-geolocation plugin approved + installed (v1.2.26), Android synced, GPS feature kept optional. |
| 1.3 | 13 Oct 2026 | Migration hardened: adds `profiles.is_admin` if missing; guard trigger also blocks users setting `is_admin` (the existing profile UPDATE policy has no column restriction, so P0's "users can't write is_admin" assumption was false). Seed sets `search_path` for PostGIS. Migration loaded in the Supabase SQL editor; run by the owner. |
| 1.4 | 13 Oct 2026 | Migration + dev seed live on Supabase and verified (11 adventures). Remaining Phase 0 work: Expedition-mode UI in SafeTrekView, Android build, Aravalli field test. |

> The authoritative schema is `supabase_expeditions_setup.sql` in the repo. The SQL in §2 is the design sketch.
