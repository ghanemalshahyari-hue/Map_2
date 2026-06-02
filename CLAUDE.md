# CLAUDE.md — RMOOZ / CMO

Read this first. It loads automatically every session. It is short on purpose; the detail lives in
**`APP_INVENTORY.md`** (what exists) and the memory dir (why decisions were made).

## What this app is
RMOOZ / CMO — a military **scenario-adjudication** web app. An operator loads a scenario, steps
through a timeline, and reviews AI-proposed outcomes on a map. Arabic-first / RTL.

- **Client:** vanilla JS modules (no framework, no build step) under `UI_MOdified/client/`.
  Composition root: `client/app.js`; layout: `client/app.html`. Modules expose `window.AppShell*` /
  `window.App*` bridges and talk over `rmooz:*` CustomEvents.
- **Server:** vanilla Node (raw `http`, no Express) — `UI_MOdified/server/web-server.js` (:8000) +
  `server/tile-server.js` (:8080). AI under `server/ai/`, sim boundary under `server/sim/`.
- **Map/symbols:** Leaflet + milsymbol + Turf + MGRS. Data in `data/` (scenarios, journal, mc-runs).

## How to run & verify
- **Run:** `npm run serve` (web only, :8000) or `npm run app` (web + tiles). App: `http://localhost:8000/app.html`.
  Real server directly: `cd UI_MOdified && node server/web-server.js`.
- **Browser verify:** the verify env stubs `GET /api/auth/me` → 200 or the client redirect-loops
  (`[[reference_browser_verify_static_server]]`; `/tmp/rmooz-verify-server.js`, launch config `rmooz-web`).
- **Tests (no unified runner — run individually):**
  - `node test-pr-<n>.js` — static checks, no server (60 files).
  - start server, then `node verify-pr-<n>.js` — Playwright, screenshots to `docs/pr-*-verify/` (16 files).
- Prefer the `preview_*` MCP tools / the `/run` skill for visual verification of client changes.

## ⚠️ GROUND-TRUTH RULE — read before you build
**Before adding any feature, card, panel, endpoint, or helper, check `APP_INVENTORY.md` for an
existing one.** This app is large (~100 modules) and has known duplication — the most common mistake
is rebuilding something that already exists. If the inventory is unclear or looks stale, **say so and
offer to run `/audit-app`** rather than guessing.

If you find duplication, a stub, or drift while working: **flag it to the user and update the relevant
`APP_INVENTORY.md` row** in the same change. Don't let the map rot.

## Hard rules (locked — confirm before deviating)
- **AI/sim boundary** (`[[feedback_ai_sim_boundary_rules]]`): **UNLOCKED 2026-06-01 by owner ruling
  (full unlock — operator UI mutates).** The operator commit path is now LIVE — Accept/Reject
  `POST /api/sim/commit` → durable `data/journal/<run>.jsonl` write (Hold defers); commits carry
  `operator_id`. **Drift D3 RESOLVED** (server commit/journal sanctioned and now driven by the UI).
  ✅ Still closed by design: client scenario-state mutation (`window.units`/`map`/`lines`), the
  journal export/download guards, and the **separate** `scenario-workspace` live-decision flow.
  `boundary-audit-panel.js` reports the open posture truthfully and its self-test/violation harness
  assert the new invariants. (Scope was "minimal coherent", not full teardown.)
- **Event Log is a ledger, not chat** (`[[feedback_event_log_not_chat]]`): keep `#event-log` tabular
  (DTG/severity/category/source/message). No avatars, bubbles, or speaker lanes.
- **Read-only surfaces stay read-only**: many panels are safety-by-design read-only mirrors. Check
  `docs/read-only-surface-audit.md` before wiring a surface to a mutation.

## Freshness protocol (auto-orient + offer when stale)
A `SessionStart` hook injects a **session brief** (branch, uncommitted count, and how many commits
have landed since `APP_INVENTORY.md` was last audited). **If the brief says the map is stale, offer
to run `/audit-app` before substantial work** — the user chose "offer when stale." `/audit-app` does
the deep dig + live smoke test and refreshes the inventory + memory.

## Update discipline (this is what makes it "self-learning")
When you finish a feature or change status:
1. Flip its row in `APP_INVENTORY.md` (status + key file + note).
2. If a *decision/rationale* changed, write/refresh a memory file (the "why") and link it `[[like-this]]`.
3. If you resolved a drift item (D1–D3), update both the inventory and the memory note it references.

## Map of the knowledge base
- `APP_INVENTORY.md` — **what exists**: per-module status, duplications, gaps, drift. Your first stop.
- memory dir (`MEMORY.md` index) — **why**: locked decisions, feedback, deferred items.
  On a machine without the local memory dir (`~/.claude/.../memory/` — it's git-ignored and
  machine-local), read the committed mirror at **`docs/session-memory/`** (its `README.md`
  shows how to rehydrate it into `~/.claude`).
- `docs/` — deep dives: `scenario-workspace-consolidation-map.md` (duplication authority),
  `read-only-surface-audit.md`, `rmooz-roadmap.html`, `scenario-schema.md`, `wargame3-schema.md`.
- `.claude/skills/audit-app/` — the refresh procedure.
