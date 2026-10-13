# Spota Expeditions — Business Requirements Document (BRD)

| | |
|---|---|
| **Feature** | Spota Expeditions — verified real-life adventures with ranked leaderboards |
| **Product** | Spota (pan-India trekking discovery + safety companion) |
| **Owner** | Rahul Gautam (Product) |
| **Status** | v1.1 — Phase 0 in build |
| **Date** | 13 Oct 2026 |
| **Companion doc** | `claude/spota-expeditions-implementation-plan.md` |

---

## 1. Problem statement

Trekkers complete hard, real-world adventures (Hampta Pass, Kedarkantha, Stok Kangri) but have **no credible, verifiable record** of it. Proof lives in scattered Instagram posts, which can't be compared, ranked or trusted. Spota already captures location, photos (with EXIF GPS) and safety check-ins, but it doesn't turn a completed adventure into lasting status.

## 2. Vision

> *"Your adventures, verified. Your rank, earned."*

Every completed adventure is **GPS-verified**, converted into **Adventure Points (AP)**, and ranked on **Global → Country → State → Region** leaderboards. That gives trekkers an identity worth returning to Spota for, and it brings them back to Spota to plan the next climb.

## 3. Business objectives

| # | Objective | How Expeditions delivers |
|---|---|---|
| O1 | Increase retention of adventure users | Seasonal leaderboards + tiers create a reason to plan the *next* trek |
| O2 | Grow verified, high-quality location data | Every attempt produces a validated GPS track for a known route |
| O3 | Drive B2B2C revenue (Agency Dashboard) | Tier unlocks (agency discounts) and sponsored challenges route users to agency packages |
| O4 | Reinforce the safety-first brand | Points only through Safe Trek Mode; safety bonus; no speed rankings |
| O5 | Organic growth | Rank/tier share cards ("#3 in Himachal this season") |

## 4. Personas

| Persona | Need | Expeditions value |
|---|---|---|
| **Rahul — Organised Explorer** (Gurugram, weekend treks in HP) | Credible proof + progress over time | Verified history, Home rank (Haryana/Gurugram), tiers |
| **Somiya — Adventure Seeker** (solo Gen Z, offline-heavy) | Recognition, safety, works with no signal | Offline track recording, Terrain rank, safety bonus |
| **Guide / Agency partner** | Visibility + leads | Guided expeditions count fully; sponsored challenges (V2) |

## 5. Scope

### 5.1 In scope — MVP
1. **Adventure Catalog**: 50 curated treks across Himachal Pradesh + Uttarakhand, each with grade, distance, elevation gain, max altitude, endpoint geofence, state, region (valley/range).
2. **Attempt recording**: start an Expedition from Safe Trek Mode; GPS track recorded on the device, **offline-first**, synced when back online.
3. **Auto-verification**: GPS track + endpoint geofence + summit photo EXIF + speed/elevation sanity checks → verification score → `verified / pending / rejected`.
4. **Adventure Points (AP)** scoring engine with an auditable ledger.
5. **Leaderboards**: Home lens + Terrain lens × Global / Country (India) / State, for **All-time** window.
6. **Tiers** (5 levels) + rank share card.
7. **Appeals**: pending/rejected attempts go to the existing AdminView moderation queue.

### 5.2 Out of scope — MVP (V2+)
- Region/valley-level boards and quarterly Season window (V2)
- Buddy/guide attestation (V2)
- User-submitted routes (V2)
- Clubs/team leaderboards, agency-sponsored challenges (V3)
- International treks outside India (V3; global board exists from day 1 but only India data)

## 6. Decisions log

| # | Decision | Outcome | Date |
|---|---|---|---|
| D1 | Do guided expeditions score the same as self-guided? | **Yes — same scoring.** No discount for guided/agency treks. | 13 Oct 2026 |
| D2 | Leaderboards public by default? | **Yes — public by default.** Guardrail: only *summary* data is public (username, tier, AP, rank, adventure names + dates). Raw GPS tracks are **private**; any shared track has the first/last 500 m trimmed to protect home/stay locations. User can opt out of public boards in Settings. | 13 Oct 2026 |
| D3 | Rank on speed/time? | **No.** Never rank time, which would encourage unsafe behaviour. | 13 Oct 2026 |
| D4 | Rank by where the user lives or where they trekked? | **Both**: Home lens (user's home location) + Terrain lens (where the adventure happened). | 13 Oct 2026 |
| D5 | "Region" definition | Home lens → district/city. Terrain lens → mountain range/valley (Kullu, Garhwal, Kumaon, Ladakh…). | 13 Oct 2026 |

## 7. Functional requirements

### FR-1 Adventure Catalog
- FR-1.1 Each adventure has: name, slug, grade (1–5), distance_km, elevation_gain_m, max_altitude_m, typical_days, endpoint geofence (polygon or point+radius, default 150 m), country, state, terrain_region, season window, cover image.
- FR-1.2 Users can browse adventures on the map (new layer) and on an Expeditions list, filtered by state/region/grade.
- FR-1.3 Only admins can create/edit catalog entries in MVP.

### FR-2 Attempt recording
- FR-2.1 User starts an Expedition from an adventure page or from Safe Trek Mode. The attempt is created on the device and linked to the `safe_treks` row. The server `adventure_attempts` row is written once on completion, so starting works with no signal.
- FR-2.2 GPS points are sampled every 30 s (configurable) on the device, stored locally (IndexedDB), and keep recording with no network.
- FR-2.3 Recording continues with the screen locked (native background location on Android).
- FR-2.4 User finishes by tapping **Complete**, attaching ≥1 summit/endpoint photo.
- FR-2.5 If offline at completion, the attempt is queued (`spota_pending_attempts`) and syncs automatically.

### FR-3 Verification
- FR-3.1 Server-side verification runs on submit (Edge Function). The client can't mark an attempt verified.
- FR-3.2 Checks and weights:

| Check | Weight | Pass condition |
|---|---|---|
| Endpoint geofence | 35 | ≥1 track point inside endpoint geofence |
| Route adherence | 20 | ≥60% of track points within 500 m of the reference route (or start→end corridor if no route) |
| Photo EXIF match | 20 | Photo GPS within 300 m of geofence and timestamp within attempt window |
| Movement sanity | 15 | No segment > 15 km/h sustained > 2 min; no teleport jumps > 2 km between consecutive points |
| Elevation sanity | 10 | Max recorded/DEM altitude ≥ 90% of adventure max_altitude |

- FR-3.3 Score ≥ 75 → `verified` (AP awarded). 40–74 → `pending` (manual review). < 40 → `rejected` (appealable once).
- FR-3.4 Admin can override status from AdminView with a reason (audited).

### FR-4 Adventure Points
- FR-4.1 Formula:
  ```
  AP = round( Base[grade] × DistanceF × GainF × AltitudeF × SeasonF × RepeatF × (1 + SafetyBonus) )
  Base     = {1:50, 2:100, 3:200, 4:400, 5:800}
  DistanceF= 1 + distance_km / 50
  GainF    = 1 + elevation_gain_m / 2000
  AltitudeF= 1.0 (<4000 m) | 1.25 (4000–4999 m) | 1.5 (≥5000 m)
  SeasonF  = 1.3 if completed inside the adventure's winter window, else 1.0
  RepeatF  = 1st completion 1.0 | 2nd 0.5 | 3rd+ 0.2 (per user per adventure)
  SafetyBonus = 0.10 if all Safe Trek check-ins were on time
  ```
- FR-4.2 Guided and self-guided completions score identically (D1).
- FR-4.3 AP is written as entries in an append-only ledger. Totals are always derived from the ledger, so a formula change can be re-run.

### FR-5 Leaderboards
- FR-5.1 Two lenses: **Home** (by user's home country/state/region) and **Terrain** (by adventure's country/state/terrain_region).
- FR-5.2 Levels: Global, Country, State (MVP); Region (V2).
- FR-5.3 Windows: All-time (MVP); Season = calendar quarter (V2).
- FR-5.4 Each board shows the Top 100 and the viewer's own position with ±5 neighbours.
- FR-5.5 Ties are broken by earliest date reaching that AP.
- FR-5.6 Users who opted out of public boards (D2) are excluded from all boards. They still see their private rank.
- FR-5.7 Data freshness ≤ 15 minutes.

### FR-6 Tiers & rewards
| Tier | AP threshold | Unlock |
|---|---|---|
| Wanderer | 0 | — |
| Trailblazer | 500 | Profile frame |
| Ridge Runner | 2,000 | Eligible to attest others' treks (V2) |
| Summiteer | 6,000 | Agency package discounts |
| Expedition Legend | 15,000 | Featured profile, early access to new routes |
- FR-6.1 Tier-up triggers the existing badge celebration (`triggerBadgeCelebration`) and a share card.
- FR-6.2 New Pioneer badges: *First Expedition*, *High Altitude* (≥5,000 m), *Winter Warrior*, *State Explorer* (5 adventures in one state).

### FR-7 Profile & sharing
- FR-7.1 Profile shows tier, total AP, ranks (Home + Terrain, top level achieved), and verified adventure history.
- FR-7.2 Share card: "#N in {State} · {Tier} · {AP} AP", rendered client-side.

### FR-8 Privacy & settings
- FR-8.1 Home location is set during onboarding or in Settings (state + district picker). It isn't inferred silently.
- FR-8.2 "Show me on public leaderboards" toggle, default ON (D2).
- FR-8.3 Raw tracks are visible only to the owner and admins. Shared tracks are trimmed by 500 m at both ends.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Offline | Full recording + completion with zero connectivity; sync on reconnect (CLAUDE.md offline rule) |
| Battery | ≤ 8% battery/hour while recording at 30 s sampling |
| Performance | Leaderboard RPC p95 < 300 ms; verification < 10 s after upload |
| Security | Verification + AP awarding server-side only; RLS on all new tables; ledger insert only via service role |
| Integrity | Every AP entry traceable to an attempt + formula version |
| Styling | Vanilla CSS, glassmorphic `glass-panel` system, HSL palette |
| Platforms | Android (Capacitor) full; Web = browse/leaderboards + foreground-only recording |

## 9. Success metrics

| Metric | Target (90 days post-launch) |
|---|---|
| Attempt → verified rate | > 70% |
| Verified completions / week | 200+ |
| % adventure users who view a leaderboard weekly | 40% |
| Leaderboard view → adventure saved/booked within 7 days | 10% |
| Manual-review queue SLA | < 48 h |
| Fraud rate (overturned verifications) | < 2% |

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| GPS spoofing / fake tracks | Leaderboard trust collapses | Server-side checks, mock-location detection on Android, EXIF match, manual review band, admin override |
| Users take risks to climb ranks | Safety + brand harm | No speed ranks; safety bonus; points only through Safe Trek; repeat decay |
| Battery drain on long treks | Incomplete tracks | 30 s sampling, low-power mode (60 s), resume-after-kill |
| Catalog data accuracy (geofences, altitudes) | False rejections | Seed from verified sources, appeal flow, admin edit tool |
| Privacy (public by default) | Location exposure | Summary-only public data, track trimming, opt-out toggle |
| Low density early (empty boards) | Weak motivation | Launch with Terrain boards for HP/UK where density is highest; seed with beta trekkers |

## 11. Dependencies
- Safe Trek Mode (`safe_treks`, `SafeTrekView.jsx`) — extended, not replaced
- EXIF parser (`lib/exifUtils.js`)
- Badge engine (`lib/badgeEngine.js`)
- AdminView moderation console
- Supabase extensions: **PostGIS**, **pg_cron** (not yet enabled)
- New native dependency: background geolocation plugin for Capacitor (**needs approval**, since CLAUDE.md limits new deps)

## 12. Release plan (summary)
| Phase | Scope | Target |
|---|---|---|
| Phase 0 | Foundations: PostGIS, track recording, catalog schema | Week 1–2 |
| Phase 1 | Verification + AP engine | Week 3–4 |
| Phase 2 | Leaderboards + tiers + profile | Week 5–6 |
| Phase 3 | Beta with 50 trekkers, tuning, launch | Week 7–8 |
| V2 | Region boards, Seasons, attestation, user-submitted routes | Post-launch +6 wks |

Details are in the implementation plan.

## 13. Change log
| Version | Date | Change |
|---|---|---|
| 1.0 | 13 Oct 2026 | Initial BRD. Decisions D1 (guided = same scoring) and D2 (public by default, with privacy guardrails) recorded. |
| 1.1 | 13 Oct 2026 | Phase 0 built. No requirement changes. Clarified FR-2.1: the server attempt record is created on completion (offline-first), not at start. |
