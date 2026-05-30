<!-- AUDIT_SHA: 1d4fa64f39bb6979d0b29f8d53612478456893e9 -->
# APP_INVENTORY — RMOOZ / CMO feature map

> **The single map of what this app has, what it doesn't, and what's drifting.**
> Read this before building anything. If you'd add a module/card/endpoint, find it here first.
> Refresh with `/audit-app` (see `.claude/skills/audit-app/`). The freshness check at session
> start reads the `AUDIT_SHA` marker on line 1 to tell you how stale this is.

**Last audited:** `1d4fa64` · 2026-05-30 · initial deep-dig (5 parallel Explore passes) + same-day reconcile (D1/D2 resolved, ORBAT toggle/HUD-rebuild folded in).
**Branch at audit:** `pr-241a-import-path-labels`.

### Legend
| Icon | Meaning |
|---|---|
| ✅ | done & wired — initialized in `app.js`/server and used with live data |
| 🟡 | partial — works but has deferred/incomplete parts or mock data |
| 🔴 | stub/missing — placeholder, drafted-but-not-loaded, or dead |
| ⏸️ | deferred — intentionally parked (links to a memory note for the "why") |
| ♻️ | has duplication — logic/DOM repeated elsewhere; cleanup candidate |
| ⚠️ | **drift** — code disagrees with a documented decision/memory; needs owner confirmation |

---

## ⚠️ DRIFT — code vs. documented decisions (confirm before relying on memory)

These were found during the 2026-05-30 deep-dig. The memory notes were true when written but the code has moved. **Do not silently "fix" either side — confirm with the owner which is now correct.**

> **Update 2026-05-30:** D1 & D2 **reconciled** — verified against code, memory notes updated to RESOLVED. **D3 remains OPEN** pending an owner ruling (it's a locked rule).

| # | Topic | Memory says | Code now does | Where | Action |
|---|---|---|---|---|---|
| D1 | Scenario marker selection | markers **don't** emit `rmooz:unit-selected` (deferred until unified selection model) — `[[project_scenario_marker_selection_deferred]]` | Red & Blue markers **do** dispatch `rmooz:unit-selected` on click | `wargame/adjudicator-map.js:1490` (Red), `:1557` (Blue) | ✅ **RECONCILED 2026-05-30** — confirmed wired (consumed by `unit-panel.js:211`); memory updated to RESOLVED. |
| D2 | BLS drawn on map | per-step `applyState` on step nav still **deferred** (only load half wired in PR-288M) — `[[project_bls_not_drawn_on_map_deferred]]` | per-step `applyState` **fully wired**: `bls_status` colors semicircles + breach badge on STAGED→contested; blue-destroyed choreography; red-degraded updates | `wargame/adjudicator-map.js` `applyState()` ~`:4006–4115` | ✅ **RECONCILED 2026-05-30** — load (PR-288M) + per-step (`goToStep`→`applyStepProgress`, P4 `5f0b272`) both wired; memory updated to RESOLVED. |
| D3 | AI/sim commit boundary (**locked rule**) | "commit bridge dry-run only; **no `/api/sim/commit`**, no state mutation, **no journal file**" — `[[feedback_ai_sim_boundary_rules]]` | **Client** commit bridge is still dry-run only (`committed:false`). **Server** has a real `POST /api/sim/commit` that mutates state and appends to `data/journal/<runId>.jsonl` (used by Monte Carlo + the `/api/ai/adjudicate` legacy shim). | client `shell/ai-proposal-commit-bridge.js`; server `web-server.js:749`, `sim/journal.js:146` | **Highest priority.** Is the server commit/journal sanctioned (scoped to headless/MC sim, distinct from the operator UI boundary), or a boundary violation? This is a locked feedback rule — needs explicit owner ruling before any work leans on it. |

---

## A. Client shell — operational modules (`UI_MOdified/client/shell/`)

| Module / Feature | Status | Key file | Notes |
|---|---|---|---|
| Scenario Workspace | ✅ | `shell/scenario-workspace.js` | Large read-only operator overview; reads `window.RmoozScenario` (never writes). Paints name/status/phase, phase timeline, step-aware unit composition. Proposal service NOT_CONNECTED by design. |
| Event Log | ✅ | `shell/event-log.js` | Closed-set ops ledger (SYSTEM/OPERATOR/UI only); in-memory, max 100 rows. **Must stay tabular, not chat** — `[[feedback_event_log_not_chat]]`. 15 modules call `AppShellEventLog.append()`. |
| AI Proposal — Panel | ✅ | `shell/ai-proposal-panel.js` | Right-side review UI; Accept/Reject/Hold flip local state + OPERATOR log row. Never calls mutation APIs. |
| AI Proposal — Bridge | ✅ | `shell/ai-proposal-bridge.js` | Calls `/api/sim/propose` with `mockMode:true`; user opt-in toggle. |
| AI Proposal — Contract | ✅ | `shell/ai-proposal-contract.js` | Pure validator/normalizer; closed-set enums; strips nested objects. |
| AI Proposal — Inbox | ✅ | `shell/ai-proposal-inbox.js` | In-memory store (max 50); no persistence. |
| AI Proposal — Commit Bridge | 🟡 | `shell/ai-proposal-commit-bridge.js` | **Dry-run only** (`dryRun:true, committed:false`). Real commit deferred. See drift **D3**. |
| AI Proposal — Decision Journal | 🟡 | `shell/ai-proposal-decision-journal.js` | In-memory only (dies on reload); labelled "Decision Records"; max 100. |
| Boundary Audit Panel | ✅ | `shell/boundary-audit-panel.js` | Read-only mirror of 9 safety boundaries; reads 13 `AppShell*` bridges. Highest coupling by design. |
| Journal Contract | 🟡 | `shell/journal-contract.js` | Pure per-entry validator; `DRY_RUN` mode only (REAL rejected). No persistence. |
| Journal Draft Preview | 🟡 | `shell/journal-draft-preview.js` | Read-only render of what *would* be written. No file write. |
| Journal Export Contract | 🟡 | `shell/journal-export-contract.js` | Shape of future export package; no Blob/download/fetch. |
| Journal Export Preview | 🟡 | `shell/journal-export-preview.js` | Read-only preview of export package; download deferred. |
| Journal Download Guard | ⏸️ | `shell/journal-download-guard.js` | Declares "download forbidden"; no download fn exists. Design contract only. |
| Safety Regression Badge | 🟡 | `shell/safety-regression-badge.js` | Read-only mirror of safety summary + popover; never runs tests. |
| Scenario Dry-Run Fixtures | 🟡 | `shell/scenario-dry-run-fixtures.js` | Static data only ("AMBER RIDGE"); consumed by a builder not yet implemented. |
| Timeline / Transport | ⏸️ | `shell/timeline.js` | UI scaffolding; buttons flip local CSS only. No event dispatch / sim hook / map mutation. |
| Unit Panel (selected unit) | ✅ | `shell/unit-panel.js` | Reads `rmooz:unit-selected`; shows MGRS/echelon/side. Operational/Combat/C2 sections are placeholders (sim data deferred). |
| Side Picker (BLUE/RED/GOD) | ✅ | `shell/side-picker.js` | Persists to localStorage; broadcasts `rmooz:view-side-changed`. |
| Classification Bar | ✅ | `shell/classification-bar.js` | i18n text into top/bottom bars. |
| Clock (Zulu DTG + local) | ✅ | `shell/clock.js` | `AppShellClock.formatZuluDtg()` reused by 7+ modules. |
| Coordinate Readout | ✅ | `shell/coord-readout.js` | Cursor MGRS + bearing/range in footer; degrades if MGRS absent. |
| Scenario Catalog Contract | 🔴 | `shell/scen-catalog-contract.js` | Parses CMO `.scen` wrappers (10 safe fields) but **not loaded in app.html** — drafted, unwired. Deferred — `[[project_external_scenario_catalog_deferred]]`. |

---

## B. Wargame / adjudicator visualization (`UI_MOdified/client/wargame/`)

| Module / Feature | Status | Key file | Notes |
|---|---|---|---|
| Adjudicator Map | ✅ | `wargame/adjudicator-map.js` (~4.6k L) | Leaflet renderer: 4 BLS semicircles, OBJ target, Red units, pipeline route, Blue destruction choreography, breach badges. |
| `drawScenario()` | ✅ | same | Builds overlay; caches bls_template + objCoord; registers units. Markers emit selection (see **D1**). |
| `applyState()` per-step | ✅ | same `~:4006–4115` | Full per-step wiring: bls_status colors, breach badge, blue-destroyed fade/stagger, red-degraded updates, forward-merge/rewind-replace. See **D2**. |
| Adjudicator HUD | ✅ | `wargame/adjudicator-hud.js` (~2k L) | `renderStep()` → `applyState`; timeline scrubber re-walks history. |
| Contact halo | 🟡 | `wargame/adjudicator-map.js` (`updateContactHalo`) | Wired into applyState but implementation minimal/placeholder. |
| AOR phase line | 🟡 | `wargame/adjudicator-map.js` (`updateAorPhaseLine`) | W3-rich only; plumbing intact, not fully verified. |

---

## C. Server — AI agents + sim boundary (`UI_MOdified/server/ai/`, `server/sim/`)

All ✅ done & wired unless noted. Persistence/endpoint in Notes.

| Module | Endpoint(s) | Notes |
|---|---|---|
| Adjudicator Agent (`ai/adjudicator-agent.js`) | `/api/sim/propose`, `/api/ai/adjudicate` (legacy shim) | Per-step LLM transition; 3-layer validation; `propose` = no mutation; `commit` writes journal. |
| Red/Blue-Team Agent (`ai/red-team-agent.js`) | `/api/ai/red-team/propose`, `/api/ai/blue-team/propose` | Perspective-flipped tactical actions; rule-validated; no mutation. |
| COA Agent (`ai/coa-agent.js`) | `/api/ai/coa` | 3–5 courses of action; schema-validated. |
| Scenario Loader (`ai/scenario-loader.js`) | `/api/ai/scenarios`, `/api/ai/scenario/:name` | mtime-cached; validates on load; enriches in-memory only. |
| Scenario Validator (`ai/scenario-validator.js` + `scenario-schema-spec.js`) | `/api/scenario/import` | Parametric step/unit ranges; `{ok,errors,warnings}`. |
| AI Provider Router (`ai/ai-provider.js`) | `/api/ai/provider/status`, `/api/ai/health` | Resolves auto/ollama/claude/zen + fallback. |
| AI Config (`ai/ai-config.js`) | — | Env/secret/JSON overlay; single source of truth. |
| Ollama / Claude / Zen clients (`ai/ollama-client.js`, `claude-client.js`, `zen-client.js`) | `/api/ai/generate`, `/api/ai/chat` | Claude client uses prompt caching; Zen = OpenAI-compatible proxy. |
| Monte Carlo Runner (`ai/monte-carlo-runner.js`) | `/api/ai/mc/start`, `/:runId/events` (SSE), `/cancel`, `/aggregate` | N trials, semaphore-bounded; writes `data/mc-runs/<runId>/trial-NNN.jsonl`. |
| Feedback Store (`ai/feedback-store.js`) | `/api/ai/feedback`, `/summary` | Append-only `data/feedback/<scenario>.jsonl`. |
| Lesson Store (`ai/lesson-store.js`) | `/api/ai/lessons` | Append-only `data/lessons.jsonl`. |
| Learning Store (`ai/learning-store.js`) | — (read-side) | Computes priors from past MC runs; feeds adjudicator prompt. |
| Report Builder / Render (`ai/report-builder.js`, `report-render.js`) | `/api/ai/report.json`, `/report.html` | baseline vs live vs MC distribution. |
| Prompts (`ai/prompts/*.txt`) | — | adjudicator (Ollama + Claude variants), red/blue-team, coa; hash logged per trial. |
| Schemas/validators (`ai/adjudicator-schema.js`, `adjudicator-validator.js`, `coa-schema.js`, `parametric-baseline.js`) | — | Enums + monotonicity clamp + plausibility; baseline fallback when AI fails. |
| **Journal (sim boundary)** (`sim/journal.js`) | internal only | **Append-only `data/journal/<runId>.jsonl`, writes to disk** (`fs.appendFileSync`, `:146`). Single durable mutation path. See **D3**. |
| **Proposal Store** (`sim/proposal-store.js`) | internal only | In-memory, 15-min TTL, single-use `consume()`. Not durable. |

---

## D. Cross-cutting client (`UI_MOdified/client/`)

| Module / Feature | Status | Key file | Notes |
|---|---|---|---|
| Map engine | ✅ | `map-engine.js` | Snap/eraser/scallop/freehand; stateless, init via `AppMapEngine.init(ctx)`. |
| Popups | ✅ | `popups.js` | HTML builders for geo/symbol/TMG; ♻️ ~40 `bindPopup` calls remain inline in `app.js`. |
| Tile/basemap mgmt | ✅ | inside `app.js` (~289–410) | MBTiles + OSM fallback; tile-server probe; error banner. Monolithic in app.js. |
| Layer/folder UI | ✅ | `ui/controllers/layers-controller.js`, `ui/panels/layers-panel.js` | Search/collapse/visibility; layer state owned by app.js. |
| Measure tool | ✅ | `ui/controllers/measure-controller.js`, `ui/state/measure-state.js` | Distance / range-circle / range-sector. |
| Units core registry | ✅ | `units.js` | Hierarchy + SIDC building; modal create/edit; init `AppUnits.init()`. |
| Units ORBAT treeview | 🟡♻️ | `units-orbat.js` | Tidy-tree SVG modal, read-only (no in-modal editing). ♻️ duplicates symbol/tree render vs the dock. |
| Units ORBAT dock | ✅♻️ | `units-orbat-dock.js` | Flat tree + drag-to-place → `/api/units/:id/place`. Tool-rail "Forces/ORBAT" toggle (`#orbat-toggle-btn` in `app.html`) (re)opens it after P3 clean-view hides it; rebuilds on wargame-HUD scenario change via `AppUnitsOrbatDock.refresh()` (commits `9498932`, `b6356d5`, 2026-05-30). ♻️ second render path for same unit data. |
| Units map markers | ✅ | `units-map.js` | Echelon-scaled markers; cursor-follow placement; `__APP_UNITS_PLACING` flag. |
| i18n + language toggle | ✅ | `i18n.js` (~4.7k L) | EN/AR; `window.t()`/`setLanguage()`; applies `dir="rtl"`; syncs to server. |
| RTL layout | ⏸️ | `style.css` | Context-panel covered by unit-panel in AR; LTR-only assumptions, no logical props. Deferred — `[[project_rtl_context_panel_overlap_deferred]]`. |
| Chat (client) | ✅ | `chat.js` | Polling team chat; rooms/groups/presence/invites; role-gated writes. |
| Plan import/export | ✅♻️ | `io.js` | Extended GeoJSON v3 (`__layers`/`__folders`); ♻️ parametric-shape geometry builders duplicated with app.js. |
| Server sync & auth | ✅ | `server-sync.js` | Session cookie, prefs, plan persistence scheduling; auto-run IIFE. |

---

## E. Server REST API surface (`UI_MOdified/server/web-server.js`)

All endpoints below are ✅ wired with real handlers. Grouped; see web-server.js for handler locations.

- **Auth/session:** `POST /api/auth/login`, `/logout`, `/register`; `GET /api/auth/me` (→ `app-data.handleAuthApi`; scrypt). *Note: verify env stubs `/api/auth/me` to avoid redirect loop — `[[reference_browser_verify_static_server]]`.*
- **Prefs:** `GET|POST /api/prefs`.
- **Plans:** `GET|POST /api/plans`; `GET|PUT|DELETE /api/plans/:planId` (atomic write; legacy `.json`→`.geojson`).
- **AI provider/health:** `GET /api/ai/health`, `/api/ai/provider/status`.
- **AI generation:** `POST /api/ai/generate`, `/api/ai/chat`.
- **COA / Red / Blue:** `POST /api/ai/coa`, `/api/ai/red-team/propose`, `/api/ai/blue-team/propose`.
- **Scenarios:** `GET /api/ai/scenarios`, `/api/ai/scenario/:name`; `POST /api/scenario/import` (GeoJSON, ≤25MB); `GET /api/scenario/events` (SSE reload).
- **Sim boundary:** `POST /api/sim/propose` (no mutation), `POST /api/sim/commit` (**mutates + journals — see D3**).
- **Legacy:** `POST /api/ai/adjudicate` (routes through propose+commit; `source='legacy-shim'`).
- **Feedback/lessons:** `POST /api/ai/feedback`, `GET /api/ai/feedback/summary`; `POST|GET /api/ai/lessons`.
- **Reports:** `GET /api/ai/report.json`, `/api/ai/report.html`.
- **Monte Carlo:** `POST /api/ai/mc/start`, `GET /:runId/events` (SSE), `POST /:runId/cancel`, `GET /:runId/aggregate`.
- **Chat:** messages (`GET|POST /api/chat/messages`), upload, groups (create/join/invite/invite-code/leave/delete + `/mine`), presence, `rooms/members`, identity (`GET|POST /api/chat/me`).
- **Units (SQLite):** `GET /api/units/tree`, `/:id/children`, `/search`, `/code-check`; `POST /api/units`, `PATCH /api/units/:id`, `POST /api/units/:id/{move,place,unplace,delete,restore}`. All writes require auth.
- **Static:** `/`, `/app`, `/app.html`, `*.html|js|css`, `/uploads/*`, `/maps/*`.
- **Tile server (separate, port 8080, `server/tile-server.js`):** `GET /services/:tileset/:z/:x/:y.:fmt` (MBTiles → PNG/JPEG).

---

## F. Test / verify infrastructure (repo root)

| Pattern | Count | Validates | Run | Recent |
|---|---|---|---|---|
| `test-pr-*.js` | 60 | Static: source/regex/`new Function()` sandbox; DOM IDs, exports, i18n keys, forbidden-element absence. **No server.** | `node test-pr-<n>.js` | 289L, 288M, 288L, 287L2, 287C, 286L2 |
| `verify-pr-*.js` | 16 | Browser: Playwright vs `http://localhost:8000/app.html`; clicks, DOM, screenshots → `docs/pr-*-verify/`. **Needs server.** | start server, then `node verify-pr-<n>.js` | 288M, 288L, 287L2, 285A, 284 |

**No unified test runner / npm script / CI** — each file is standalone. Highest PR number present ≈ **289**.

---

## Known duplications & cleanup candidates ♻️

1. **Unit hierarchy rendering** — `units-orbat.js` (tidy-tree SVG modal) vs `units-orbat-dock.js` (flat docked list): two render paths for the same SIDC data.
2. **Parametric shape geometry** — circle/sector/oval builders duplicated between `io.js` (export) and `app.js` (element construction).
3. **Popup binding** — `popups.js` exports builders, but ~40 `bindPopup` calls remain inline in `app.js`.
4. **Workspace cards** — see `docs/scenario-workspace-consolidation-map.md` for the catalogued **9× duplication patterns + 3 dead fields** across ~150 DOM surfaces (authoritative; do not re-audit).
5. **Tile/basemap logic** — embedded inline in `app.js` rather than a module (monolith, not duplication, but a refactor candidate).
6. **Stray duplicate directory ♻️** — `UI_MOdified/client/wargame 5/` is a **git-tracked** copy of `wargame/` (6 files incl. a 159KB `adjudicator-map.js`, dated May 23). Looks like an accidental Finder duplicate; not referenced from `app.html`. **Cleanup candidate** — confirm it's unreferenced, then delete. (Found 2026-05-30.)

---

## Gaps / not-yet-built

- **Real journal/export/download chain (client):** contract + draft-preview + export-preview all read-only; no persistence or download (by design, deferred).
- **Timeline → sim wiring:** transport bar is scaffolding; no playback dispatch beyond the adjudicator HUD's own scrubber.
- **Unit Panel sim sections:** Operational/Combat/C2 are placeholders pending a unit sim-data feed.
- **Scenario Catalog (external CMO/CSP51):** drafted contract unwired; UI reverted — `[[project_external_scenario_catalog_deferred]]`.
- **Briefing values:** some workspace briefing fields are mock pending a real feed — `[[project_briefing_mock_values_deferred]]`.
- **Known issue KI-1:** wargame1 baseline violates the BLS-4 never-SECURE invariant (pre-existing; see `docs/known-issues.md`).
- **No unified test runner** (see §F).
- **Decision Package import:** internal + external "خطوات صنع القرار" contracts — already wired in `scenario-workspace.js` + `web-server.js` — `[[project_decision_package_import]]`.

---

## Pointers to deep docs (don't restate — link)

- `docs/scenario-workspace-consolidation-map.md` — authoritative card/duplication inventory (~150 surfaces).
- `docs/read-only-surface-audit.md` — A=safety-by-design / B=not-wired / C=production classification.
- `docs/rmooz-roadmap.html` — visual program roadmap (done/build/blocked/plan).
- `docs/scenario-schema.md`, `docs/wargame3-schema.md`, `docs/scenario-template.json` — scenario JSON contracts.
- `docs/pr-166-external-scenario-pack-audit.md` + `docs/scenario-pack-audit/` — CSP51 audit (630 scenarios; don't re-run).
- `docs/cmo-scenario-editor-application.md` — CMO→RMOOZ workflow mapping.
- Cross-session "why" lives in the memory dir (`MEMORY.md` index) — this file is the "what", memory is the "why".
