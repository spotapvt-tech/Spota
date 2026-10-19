# Spota Developer Guidelines

This document outlines the commands, style guide, and workflow for developers and AI agents working on the Spota codebase.

## Build & Run Commands

| Task | Command | Description |
| :--- | :--- | :--- |
| **Start Dev Server** | `npm run dev` | Launch the local Vite development server. |
| **Production Build** | `npm run build` | Compile the production bundles. |
| **Lint Code** | `npm run lint` | Run ESLint checks across the codebase. |
| **Preview Build** | `npm run preview` | Serve the locally built production files. |

## Gem Drop Wizard — Agent Architecture (v2.1)

The gem-dropping flow is a 6-step wizard (5 input steps + Review) followed by the celebration screen. All agents must follow this file map:

### Orchestrator
- `src/pages/AddGemView.jsx` — ~200-line orchestrator. Holds all wizard state, routes steps, calls `gemService.dropGem()` on submit.

### Step Components (`src/pages/steps/`)
| File | Step | Responsibility |
| :--- | :--- | :--- |
| `StepCapture.jsx` | 1 | Photo-first camera/gallery + quick filter chips |
| `StepPin.jsx` | 2 | Auto GPS on entry + search + draggable map pin |
| `StepName.jsx` | 3 | AI name suggestion + category selection |
| `StepRate.jsx` | 4 | Emoji vibe presets + per-dimension emoji sliders |
| `StepVibe.jsx` | 5 | AI typewriter reveal + tag chip selection |
| `StepReview.jsx` | 6 | Preview card, public-visibility notice, required safety/access acknowledgement (`safetyAck`) |
| `StepCelebrate.jsx` | 7 | Canvas-confetti + gem counter + badge reveal + share card |

### Shared UI Components (`src/components/`)
- `GemWizardProgress.jsx` — segmented progress trail (6 segments)
- `GemWizardCTA.jsx` — sticky Back/Next/Submit bottom bar

### Extracted Libraries (`src/lib/`)
| File | Exports | Source |
| :--- | :--- | :--- |
| `gemWizardData.js` | `AI_SUGGESTIONS_MAP`, `RECOMMENDED_TAGS_MAP`, `VIBE_PRESETS`, `getSuggestedDescription()` | Extracted from old AddGemView |
| `imageUtils.js` | `analyzeImageColor()`, `compressImage()` | Extracted from old AddGemView |
| `geocoding.js` | `reverseGeocode()`, `searchPlaces()` | Extracted + extended from old AddGemView |
| `gemService.js` | `dropGem()` — Supabase insert + image upload + offline queue | Extracted from old AddGemView |

### Key Agent Rules
1. **Never re-introduce the old split-panel layout.** The wizard replaces `add-gem-split-layout` entirely.
2. **GPS fires on Step 2 entry** via `useEffect([], [])` — not on button click.
3. **Vibe ratings use emoji selectors** (index 0–4 → score 1–5), not `<input type="range">`.
4. **Supabase columns are unchanged** — no schema migration needed. `vibe_ratings` table still accepts `{cozy, insta_worthy, lively, zen, workspace}`.
5. **canvas-confetti** is the wizard's only extra dependency. (App-wide, SPOTA 2.0 added self-hosted, offline-safe fonts: `@fontsource-variable/sora` (display), `inter` (UI/body), `space-grotesk` (coordinates/stats).)
6. **Offline queue**: if `navigator.onLine` is false, `gemService.dropGem()` pushes to `localStorage` key `spota_pending_gems`.

## Navigation (SPOTA 2.0)

`/` Home (`HomeView`) · `/explore` map (`MapView`, accepts router state `{ focusSpotId }` or `{ category }`) · `/add` Drop wizard (TopBar + BottomNav hidden) · `/expeditions` Adventures tab (also lit for `/trips`, `/safe-trek`, `/leaderboard`) · `/profile`. Chat, Daily Drop and notifications live in the TopBar; Vibes, Trips, Safe Trek and Rankings are linked from Home's toolkit.

## Development Workflow Guidelines

1.  **Think First**: Analyze changes against the product specs in `docs/Spota_PRD_Enhancement.md` and check how they impact mobile (Capacitor) vs. web users.
2.  **Implementation Plan**: For any major architectural changes or schemas, draft or update the implementation plan under `gem_drop_implementation_plan.md`.
3.  **Strict Styling Constraints** (SPOTA 2.0 "Night Topo" system — see `docs/spota-2-redesign.md`):
    *   Use vanilla CSS. Avoid importing third-party UI framework utilities unless explicitly approved.
    *   Dark-first. Use semantic tokens from `src/index.css` (`--bg-*`, `--text-*`, `--line*`, `--accent*`, `--danger`, …); never hard-code hex colours in components. Legacy `--color-*` names are aliases and still work.
    *   One accent only: signal chartreuse `--accent`. Text/icons on it use `--accent-ink` — never white.
    *   Reuse primitives before writing new CSS: `.sp-btn(--primary|--secondary|--ghost|--danger|--sm|--block)`, `.sp-chip`, `.sp-icon-btn`, `.sp-eyebrow`, `.sp-mono`, `.sp-display`, `.sp-section-head`, `.sp-rail`, `.sp-sheet`, `.sp-state`, `.sp-skeleton`.
    *   Categories render via `components/ui/CategoryGlyph.jsx` (lucide icons), map pins via `components/ui/SpotMarker.jsx` — no emoji in new UI.
    *   Page roots must not animate `transform` (it traps fixed modals under the nav) — `.animate-fade-in` is opacity-only for this reason. Keyframe names must be unique per file.
4.  **Local Fallback Support**:
    *   Always write a fallback to `localStorage` or local cached states if database writes/reads to Supabase fail, so the app remains demoable offline and during mock tests.
5.  **Offline-Friendly Design**:
    *   Verify offline state using `navigator.onLine` and the `useOfflineSpots` hook.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Liquid Glass & Motion (SPOTA 2.0)

- Glass is for **floating chrome only** (bottom nav, map controls, previews, sheets, menus, discovery overlay): add `sp-glass` (+ `--thin`/`--thick`). Never put it on forms or long copy, and don't nest glass in glass. Blur is progressive enhancement — it falls back to opaque `--glass-solid` without `backdrop-filter` or under `prefers-reduced-transparency`.
- Motion tokens live in `src/index.css` (`--dur-micro/ui/sheet/reward`, `--stagger`, `--ease-sheet`, `--ease-settle`). Animate `transform`/`opacity` only; `prefers-reduced-motion` is handled globally.
- Bottom sheets drag-to-dismiss through `src/hooks/useSheetDrag.js` (attach `handleProps` to `.sp-sheet__grabber` only so map pan/zoom and sheet scroll are untouched).
- `components/ui/DiscoveryReveal.jsx` must only be opened after the backend confirms success (currently: server-verified expedition summit in `SafeTrekView`).
