# SPOTA 2.0 — Redesign notes (Oct 2026)

What changed, what was preserved, and what still needs backend work. Written alongside the code change; keep it current.

## 1. Audit findings (before)

- The map was the de facto home screen. Nothing answered "why explore today?".
- Six crowded nav tabs (Map, Vibes, +, Trips, Chat, Profile). Adventures/Expeditions had no tab.
- The light "zen" sage palette was generic, emoji-heavy and hard to read outdoors. Fonts loaded from Google Fonts, so they broke offline.
- **Bugs found and fixed:**
  - Global `@keyframes` name collisions (`slideUp` ×3, `fadeIn` ×2): whichever CSS loaded last won. This pushed the guest Chat card off-centre.
  - `.animate-fade-in` was defined three times. The page-level version animated `transform`, which trapped Spot Details under the bottom nav.
  - The Leaderboard showed raw `TypeError: Failed to fetch` to users.
  - `.submit-auth-btn` (the guest gates on Trips and Creator Analytics) was referenced but never defined.
  - The drop celebration claimed "+25 reputation" while Profile computes 10 per drop.
  - The auth splash injected a global `@keyframes pulse` that overrode app-wide styles while it was mounted.

## 2. Design system — "Night Topo"

- **Tokens** (`src/index.css`): ink surfaces `--bg-canvas/raised/overlay`, bone text `--text-strong/body/muted/faint`, lines, one accent `--accent` (#D4FF3A) with `--accent-ink`, semantic `--danger` (ember), `--warning` (amber), `--info` (glacier). Legacy `--color-*` names are aliased, so existing screens adopted the theme automatically. 213 hard-coded light-theme colours were swept.
- **Type:** Archivo (variable width; wide cut for display) + IBM Plex Mono for coordinates, distances and stats. Both are **self-hosted** via `@fontsource`, so they work offline and in Capacitor.
- **Primitives:** `.sp-btn`, `.sp-chip`, `.sp-icon-btn`, `.sp-eyebrow`, `.sp-display`, `.sp-section-head`, `.sp-rail`, `.sp-sheet`, `.sp-state`, `.sp-skeleton`, plus a contour texture `--topo-texture`.
- **Components:** `ui/Wordmark` (the O is drawn as a survey marker), `ui/CategoryGlyph` (lucide icon per category, tinted tile), `ui/SpotMarker` (survey-marker map pin with selected / trending / pending states).
- **Maps:** a dark Google Maps style shared by every map, and dark InfoWindows (`components/map/mapChrome.css`).
- **Motion:** spring/ease-out tokens; global `prefers-reduced-motion` support.

## 3. Screens

| Screen | Status |
|---|---|
| **Home** (new, `/`) | Greeting, live coordinates, an honest count of SPOTAs within 50 km, and a hero of the nearest outdoor photographed spot. Explore / Drop CTAs. Location ask with context (never on first paint). Category entry points. Near-you rail, trek "tickets" from the real adventure catalog with AP estimates and an altitude strip, most-loved rail, Explorer record (real tier/AP), toolkit, fresh drops. Loading, error and empty states. |
| **Explore** (`/explore`) | New markers, a bottom-sheet preview with Directions in place of InfoWindows, a search pill with AI match, category chips, a distance filter sheet, a map/list toggle, locate/AR/offline FABs, a location-denied hint, and an empty state on the map. **Auto-falls back to the list when Google Maps can't load** (offline / blocked key). Deep links from Home. |
| **Drop a SPOTA** | Focus mode (no top bar / nav), segmented progress, new **Review** step (preview card, plain-language public-visibility notice, required "publicly accessible & safe" acknowledgement), inline error instead of `alert()`, "Publish SPOTA" CTA. "See it on the map" now deep-links to the new pin. |
| **Profile** | Rebuilt as an explorer record: identity, stats strip, progress to Verified, live Safe Trek banner, guest upgrade card, existing Expedition card and badges, tools menu, Dropped/Saved grid with in-review tags. Bottom-sheet confirmations replace `confirm()`/`alert()`. |
| **Shell** | Top bar: wordmark, Daily Drop, Messages, Notifications. Nav: Home · Explore · Drop · Adventures · Profile. |
| **Auth / Landing** | Re-tokened to the new palette; wordmark; copy aligned to "The world is your playground". |
| **Everything else** | Spot Details, Expeditions, Leaderboard, Trips, Trip boards, Safe Trek, Vibes, Chat, Notifications, Daily Drop, Admin, Agency: adopted the theme via tokens. Spot Details actions and the Leaderboard filter hierarchy were refined. |

## 4. Preserved

All routes, Supabase queries, RLS-dependent flows, offline queue (`spota_pending_gems`), offline zones, AR, AI vibe matcher, Daily Drop, chat, trips, Safe Trek, expeditions/AP, badges, agency and admin. No schema changes. The wizard keeps the CLAUDE.md agent rules (GPS on Step 2 entry, emoji vibe selectors, unchanged columns).

## 5. Backend dependencies (not built — needs your decision)

### Hidden SPOTAs / clue trails

The brief's "Hidden SPOTA" discovery experience **does not exist in the schema**. Building it client-side would be fake: the `spots` select returns exact coordinates to every client, so a "hidden" pin would be one network-tab away. It needs:

1. Columns on `spots`: `visibility text check (visibility in ('public','hidden')) default 'public'`, `clue text`, `hints text[]`, `reveal_radius_m int default 75`.
2. A view or RLS policy that returns hidden spots with **coarsened** coordinates (e.g. rounded to ~500 m) and no `image_url`/`title` until found.
3. An RPC `claim_discovery(spot_id, lat, lng, accuracy_m)` that checks distance server-side, records `spot_discoveries(user_id, spot_id, found_at)`, and only then returns the full row.
4. Moderation rules: no hidden SPOTAs on private land, closed areas or hazardous terrain. Reuse the verification scorer in AdminView.

Once those exist, the frontend slots are clear. The wizard's Review step already renders a visibility block, the map has a pending-style marker variant to adapt for "hidden", and the preview sheet can show a clue plus proximity instead of the title.

### Other

- **XP / explorer levels beyond Expedition tiers:** reputation is still computed client-side in ProfileView (`drops×10 + saves×5`). It should move server-side before it is used for anything that matters.
- **Rejected spots on the map:** MapView still shows every status except deleted/flagged (unchanged behaviour). Consider hiding `rejected` server-side. Home already excludes pending/rejected from featured rails.
- **Bundle size:** 1.07 MB main chunk (was 1.04 MB). Route-level `lazy()` for Agency/Admin/Landing would cut it substantially.

## 6. QA run

- `npm run lint`: 0 errors (the same 3 pre-existing hook-dependency warnings).
- `vitest`: 16 files, 115 tests passed.
- `npm run build`: OK.
- Playwright landing e2e: 2/2 (spec updated for the new hero headline).
- Visual check at 360, 390 and 1280 px with stubbed Supabase data. The Google Maps tiles themselves could not be rendered in the sandbox; markers and the preview sheet were verified in isolation.
