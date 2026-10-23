# RCA + Fix Plan — AR finder spots misrender, map lags while the phone moves

**Reported:** On `/explore`, opening the AR finder (camera button) shows spots in the wrong place, jumping or missing, and the map lags while the phone is moving.
**Scope:** `src/pages/ARView.jsx`, `src/pages/ARView.css`, `src/pages/MapView.jsx`, `src/components/map/GemMarkerOverlay.jsx`, `src/components/ui/SpotMarker.css`
**Status:** Phases 1–3 implemented, with grid clustering that adds no dependency (`src/lib/mapClustering.js`). Unit and component tests pass. The on-device checks in Phase 4 are still pending.

**Implementation notes (where the build differs from the plan below):**
- *Screen orientation:* the heading comes from the rear camera's direction vector (device −Z), which doesn't change when the screen rotates. So no `screen.orientation.angle` correction is needed. Orientation only selects the field of view.
- *App pause:* the camera is released on `visibilitychange`, which Android WebView also fires when Capacitor pauses the app. No separate `App` `pause` listener was added.
- *Visible-set re-render:* React re-renders only when the candidate list changes (location or spots). The rAF loop shows and hides markers directly, so no 4 Hz throttle was needed.
- *New files:* `src/lib/arMath.js`, `src/hooks/useDeviceHeading.js`, `src/hooks/useLiveLocation.js`, `src/lib/mapClustering.js`. Tests are in `src/lib/__tests__/arMath.test.js`, `src/lib/__tests__/mapClustering.test.js` and `src/pages/__tests__/ARView.test.jsx`.

---

## 1. Summary

The AR view has two kinds of problems: the compass math is wrong, and the view re-renders far too often. The heading is computed wrongly on both Android and iOS, so labels sit at the wrong bearing and jump around. The view also re-renders the whole overlay 60 times a second, even when nothing has changed. For every spot in the database it recomputes distance and bearing, then repaints blurred glass cards over a live camera feed. The user's GPS position is read once and never updated, so walking makes every bearing and distance go stale.

On the map, the `center` prop gets a new object on every render. Each time `MapView` re-renders, the map snaps back to that center, which looks like rubber-banding while panning. Every pin is also a separate DOM `OverlayView`, with no culling or clustering. On top of that, blurred glass chrome sits over the moving tiles. Together this costs more GPU time per frame than mid-range Android WebViews can handle. The map also keeps running underneath the AR overlay.

---

## 2. Root causes — AR finder

| # | Root cause | Where | Effect seen by the user |
|---|---|---|---|
| A1 | **Wrong heading inversion on iOS.** `webkitCompassHeading` already counts clockwise from north, but the code still applies `360 - value` to it. | `ARView.jsx:63-69` | On iPhone, spots appear mirrored: turning right moves them the wrong way. |
| A2 | **Relative and absolute orientation are mixed.** The code listens to both `deviceorientation` (on Android its `alpha` is relative to an arbitrary zero) and `deviceorientationabsolute`, and both write to the same `targetHeading`. | `ARView.jsx:73-74` | Heading jumps back and forth between two reference frames, so labels jitter or teleport. |
| A3 | **No tilt compensation.** Raw `alpha` is only correct when the phone lies flat. In AR the phone is held upright, so `alpha`/`beta`/`gamma` must be combined into a real compass heading. Screen orientation (portrait or landscape) is also ignored. | `ARView.jsx:61-71` | Heading drifts by tens of degrees as the user tilts the phone, so spots slide off their real direction. |
| A4 | **The iOS motion permission is never requested.** iOS 13+ needs `DeviceOrientationEvent.requestPermission()` to be called from a user gesture. | (missing) | On iOS Safari or PWA, no events arrive, the heading stays at 0°, and spots never move. |
| A5 | **The user's location is a one-off snapshot.** `MapView.locate()` calls `getCurrentPosition` once, with `maximumAge: 60000`. AR receives that value and nothing ever updates it. If it is `null`, AR silently falls back to Delhi. | `MapView.jsx:88-101`, `ARView.jsx:123` | While walking, distances and bearings go stale. With no GPS fix, spots are placed relative to Delhi. |
| A6 | **Re-render storm.** The rAF loop calls `setHeading()` every frame, even when the change is under 0.1°. Each render maps over **all** `displaySpots`: every spot in the DB, with no distance limit and no memoisation. | `ARView.jsx:85-92`, `125-155` | 60 full React renders per second plus N haversine and bearing calls each, which is CPU-bound on mid-range phones. |
| A7 | **Layout-thrashing marker styling.** Markers are positioned with `left`/`top` (layout properties) and have a `transition` on them, which fights the rAF updates. Each card also has `backdrop-filter: blur(12px)` (`.glass-panel` and `.ar-marker-card`) over a live `<video>`, plus `transition: all`. | `ARView.jsx:224-230`, `ARView.css:125-145` | The GPU re-blurs every card every frame, causing dropped frames and "swimming" labels. |
| A8 | **Unusable vertical layout.** `top = 150 + distance*80 px` is clamped to `innerHeight - 200`, so every spot further than about 6–7 km lands on the same line and they all overlap. `zIndex` goes negative beyond 10 km. Pitch (`beta`) is not used, so labels don't stay anchored when the phone tilts up or down. | `ARView.jsx:207-228` | Spots pile on top of each other, hide behind the video, or float in the wrong place. |
| A9 | **Camera is never released.** The cleanup function captures the initial `stream` value (`null`), because of a stale closure. | `ARView.jsx:52-56` | The camera stays on after AR is closed, draining battery. Re-opening AR can fail with "Could not start video source" on Android WebView. |
| A10 | **Touch-drag is always added to the sensor heading.** Any accidental swipe on mobile adds a permanent `dragOffset` that is never reset. | `ARView.jsx:107-112`, `163-165` | After touching the screen, labels are permanently offset from their real bearings. |
| A11 | **Hard-coded 60° horizontal FOV.** Rear cameras in portrait are usually about 40–50° wide horizontally. | `ARView.jsx:32` | Spots near the screen edges are drawn closer to the centre than they really are. |

## 3. Root causes — map lag while moving

| # | Root cause | Where | Effect |
|---|---|---|---|
| M1 | **Controlled `center` with a fresh object each render.** `<GoogleMap center={{lat, lng}}>`: `@react-google-maps/api` calls `map.setCenter()` whenever the prop reference changes, which here is every render. There is also a separate `panTo` effect for the same state. | `MapView.jsx:287`, `124-128` | Any re-render (typing, selecting a pin, a reaction event, a GPS answer) snaps the map back to `center`, so panning rubber-bands and stutters. |
| M2 | **One DOM `OverlayView` per spot, with no culling or clustering.** Each pin is its own `google.maps.OverlayView`. On every pan or zoom frame, each one runs its own `draw()` (a projection plus a style write) and lives in its own React portal. With range "Any", hundreds can be mounted off-screen. | `MapView.jsx:314-332`, `GemMarkerOverlay.jsx` | Per-frame cost grows linearly with spot count, so pins trail behind the tiles during pans. |
| M3 | **Unstable props on every overlay.** New `position` objects, `getPixelPositionOffset` and `onClick` closures are created for every pin on every render. | `MapView.jsx:315-322`, `GemMarkerOverlay.jsx:9-15` | Every `MapView` render re-positions every overlay. |
| M4 | **`backdrop-filter` glass over moving tiles.** The search bar, chips, FABs, the results bar and the preview sheet all use `sp-glass`. Every map frame forces the compositor to re-blur those regions. | `MapView.jsx:345, 388, 418-427, 476` | This is expensive on Android WebView GPUs, which are what Capacitor uses. |
| M5 | **Heavy per-pin paint.** Each pin has a large blurred `box-shadow`, and there are infinite `sp-ping` and `markerFloat` animations. | `SpotMarker.css:21,51,95`, `mapChrome.css:75` | Continuous repaint, even when the map is idle. |
| M6 | **The map keeps running under AR.** `MapView` stays mounted with all its overlays and animations while the full-screen AR view is open. | `MapView.jsx:533-543` | AR and the map compete for the same GPU and main thread. |
| M7 | **No live location while moving.** There is no `watchPosition`, so the "you are here" dot only updates when the user taps recenter. | `MapView.jsx:88-101` | Feels like the map is lagging behind the user's real position. |

---

## 4. Fix plan

### Phase 1 — AR correctness (P0)
1. **New hook `src/hooks/useDeviceHeading.js`**
   - Prefer `deviceorientationabsolute`. Fall back to `deviceorientation` only when `event.absolute === true`, or when `webkitCompassHeading` is present. Never mix the two frames.
   - iOS: use `webkitCompassHeading` as-is, with no inversion.
   - Android: compute a **tilt-compensated** heading from `alpha`, `beta` and `gamma` (the standard rotation-matrix formula), then add `screen.orientation.angle`.
   - Expose `{ heading, pitch, accuracy, needsPermission, requestPermission }`. `requestPermission()` calls `DeviceOrientationEvent.requestPermission()` and is triggered by the AR button tap.
   - Apply a low-pass filter on the shortest angular path, inside the hook.
2. **Live position for AR:** add `src/hooks/useLiveLocation.js`, which wraps `navigator.geolocation.watchPosition` with `enableHighAccuracy: true` and `maximumAge: 5000`, and clears the watch on unmount. AR uses it directly. If there is no fix, show a "Waiting for GPS…" state instead of the Delhi fallback.
3. **Camera cleanup:** keep the stream in a `useRef` and stop its tracks in the cleanup function. Also stop them on `visibilitychange` → hidden, and on Capacitor `App` `pause`.
4. **Drag only as a fallback:** enable the drag-to-look offset only when no orientation events have arrived within about 1.5 s, which covers desktop and sensor-less devices.
5. **FOV:** default to 50° in portrait and 65° in landscape, kept as named constants.

### Phase 2 — AR performance (P0)
1. **Stop re-rendering per frame.** Keep the heading in a ref. The rAF loop writes `transform: translate3d(x, y, 0) scale(s)` and `opacity` straight to each marker's DOM node, through a `Map` of refs. React only re-renders when the *set* of visible spots changes, and that check is throttled to about 4 Hz.
2. **Precompute once per location change:** use `useMemo` over `[spots, userCoords]` to work out `distance` and `bearing` for each spot. Filter to a radius (default 5 km, matching the map range filter) and cap the list at the nearest 25.
3. **Vertical placement:** derive `y` from pitch (`beta`) and a distance band: near spots lower, far spots higher, with logarithmic spacing. Add simple declutter: when two labels overlap horizontally, stack them in 2–3 lanes.
4. **CSS:** remove the `left`/`top` and `all` transitions, and set `will-change: transform, opacity` on markers. Replace `backdrop-filter` on AR cards with an opaque `--glass-solid` surface. CLAUDE.md says not to nest glass inside glass, and a blur over live video is the costliest case. Replace the emoji with `CategoryIcon`, per the styling rules.

### Phase 3 — Map smoothness (P1)
1. **Make the map uncontrolled after mount:** pass `center` only as the initial value (`useMemo` with `[]`), or drop the prop entirely and drive it through the existing `panTo` effect (`MapView.jsx:124`). This removes M1.
2. **Stable overlay props:** in `GemMarkerOverlay`, memoise `getPixelPositionOffset` (a `useCallback` keyed on width and height) and wrap the component in `React.memo`. In `MapView`, memoise each spot's `position` object (store `{lat, lng}` on the spot inside the `filteredSpots` memo) and use one stable click handler that reads `data-id`.
3. **Viewport culling:** track `bounds` on the map's `idle` event, and render only the spots inside the padded bounds.
4. **Clustering above about 60 visible pins:** use `@googlemaps/markerclusterer`. This is a new dependency and needs approval under CLAUDE.md rule 5. A dependency-free alternative is a grid-bucket cluster computed in the `idle` handler.
5. **Glass while moving:** on `dragstart`/`zoom_changed`, add `explore--moving` to the root, switching `sp-glass` to its `--glass-solid` fallback. Remove it on `idle`. Lighten the pin shadows, and keep the pulse only on the single `nearby` pin plus the user dot.
6. **Unmount or pause the map under AR:** render AR instead of the map canvas, or set `visibility: hidden` on `.explore-map` while `showAR` is true, so the map stops compositing.
7. **Live user dot:** reuse `useLiveLocation` in `MapView` to keep the dot moving. Auto-recenter only when the user is in "follow me" mode (after tapping recenter), never while they are panning.

### Phase 4 — Verification
- **Unit tests:** heading maths (iOS passthrough, tilt-compensated alpha/beta/gamma samples, landscape offset) and bearing/projection for spots at 0°, ±30° and 180°.
- **Device test** on a mid-range Android build (Capacitor) and on iOS Safari:
  - Turn 360°: a known spot should appear within ±10° of its real bearing.
  - Walk 100 m: the distance should update.
  - Close and reopen AR 5 times: the camera should restart every time, and the indicator light should go off after closing.
  - Map pan with 200+ spots: Chrome DevTools remote Performance trace should show ≥ 50 fps, no long tasks over 50 ms, and no snap-back.
- Run `npm run lint` and `npm run build`, then `graphify update .`.

---

## 5. Priority and effort

| Phase | Priority | Est. effort | Risk |
|---|---|---|---|
| 1 — AR correctness | P0 | ~1 day | Low; isolated to the AR view and new hooks |
| 2 — AR performance | P0 | ~1 day | Low–medium; changes how the overlay is rendered |
| 3 — Map smoothness | P1 | 1–1.5 days | Medium; clustering needs a dependency decision |
| 4 — Verification | — | 0.5 day | Needs a physical Android and iOS device |

No Supabase schema changes. Offline behaviour is unchanged: AR and the map still read `displaySpots`, which comes from `useOfflineSpots` when offline.
