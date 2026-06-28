# Spota Developer Guidelines

This document outlines the commands, style guide, and workflow for developers and AI agents working on the Spota codebase.

## Build & Run Commands

| Task | Command | Description |
| :--- | :--- | :--- |
| **Start Dev Server** | `npm run dev` | Launch the local Vite development server. |
| **Production Build** | `npm run build` | Compile the production bundles. |
| **Lint Code** | `npm run lint` | Run ESLint checks across the codebase. |
| **Preview Build** | `npm run preview` | Serve the locally built production files. |

## Development Workflow Guidelines

1.  **Think First**: Analyze changes against the product specs in `docs/Spota_PRD_Enhancement.md` and check how they impact mobile (Capacitor) vs. web users.
2.  **Implementation Plan**: For any major architectural changes or schemas, draft or update the implementation plan under `implementation_plan.md` first.
3.  **Strict Styling Constraints**:
    *   Use vanilla CSS. Avoid importing third-party UI framework utilities unless explicitly approved.
    *   Maintain the glassmorphic aesthetics (`glass-panel` classes) and the custom HSL palette defined in `src/index.css`.
4.  **Local Fallback Support**:
    *   Always write a fallback to `localStorage` or local cached states if database writes/reads to Supabase fail, so the app remains demoable offline and during mock tests.
5.  **Offline-Friendly Design**:
    *   Verify offline state using `navigator.onLine` and the `useOfflineSpots` hook.
