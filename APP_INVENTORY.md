<!-- AUDIT_SHA: e75ff6524c4cfd2fd3dc46fd42114190c1e19dab -->
# APP_INVENTORY — RMOOZ / CMO feature map

> **The single map of what this app has, what it doesn't, and what's drifting.**
> Read this before building anything. If you'd add a module/card/endpoint, find it here first.
> Refresh with `/audit-app` (see `.claude/skills/audit-app/`). The freshness check at session
> start reads the `AUDIT_SHA` marker on line 1 to tell you how stale this is.

**Last audited:** `e75ff65` · 2026-05-31 · two same-day delta refreshes over the `1d4fa64` deep-dig (+16 commits, audited during an active parallel coding session). **Wave 1** (`f31548c`): AN1 attrition visuals, P0 authoring foundation, animation-readiness audit, stray-`wargame 5/` cleanup. **Wave 2** (`11e17b1`→`22d576e`, +9 commits): the **W3 presentation suite** — echelon roll-up, event pins, movement trails, engagement legend, symbol scaling + formation hover-peek, SIDC family-symbol resolver (SYM2), selected-unit operational readout (P5b), and engagement **mission graphics** (MG1). Code audited at `22d576e`; `855301c`+`e75ff65` on top are docs-only (this inventory + CMO docs) with no code drift. Drift D1/D2/D3 re-verified, line refs refreshed. ⚠️ Working tree has active uncommitted code WIP (`app.js`, `adjudicator-map.js`) — re-audit when it lands.
**Branch at audit:** `chore/remove-stray-wargame5-dir` (cleanup branch off `pr-241a-import-path-labels`).

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
> **Re-verified `11e17b1` 2026-05-31:** D1/D2 still wired (line refs refreshed below); **D3 unchanged — still OPEN**. The P0 authoring foundation (`aec386a`) and the entire Wave-2 W3 presentation suite are client-side render/data only — they stay *inside* the locked boundary and do not touch D3.

| # | Topic | Memory says | Code now does | Where | Action |
|---|---|---|---|---|---|
| D1 | Scenario marker selection | markers **don't** emit `rmooz:unit-selected` (deferred until unified selection model) — `[[project_scenario_marker_selection_deferred]]` | Red & Blue markers **do** dispatch `rmooz:unit-selected` on click | `wargame/adjudicator-map.js:1937` (Red), `:2006` (Blue) | ✅ **RECONCILED 2026-05-30** — confirmed wired (consumed by `unit-panel.js:408`); memory updated to RESOLVED. |
| D2 | BLS drawn on map | per-step `applyState` on step nav still **deferred** (only load half wired in PR-288M) — `[[project_bls_not_drawn_on_map_deferred]]` | per-step `applyState` **fully wired**: `bls_status` colors semicircles + breach badge on STAGED→contested; blue-destroyed choreography; red-degraded updates | `wargame/adjudicator-map.js` `applyState()` `bls_status` loop ~`:4608` | ✅ **RECONCILED 2026-05-30** — load (PR-288M) + per-step (`goToStep`→`applyStepProgress`, P4 `5f0b272`) both wired; memory updated to RESOLVED. |
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
| Unit Panel (selected unit) | ✅ | `shell/unit-panel.js` | Reads `rmooz:unit-selected`; shows MGRS/echelon/side. **P5b** adds marker-derived readouts — symbol profile, current-step status, capability (`:182`/`:369`; tests 19/19, `test-p5b-selected-unit-readout.js`, `11e17b1`). Combat/C2 sim sections still placeholders pending a sim-data feed. |
| Side Picker (BLUE/RED/GOD) | ✅ | `shell/side-picker.js` | Persists to localStorage; broadcasts `rmooz:view-side-changed`. |
| Classification Bar | ✅ | `shell/classification-bar.js` | i18n text into top/bottom bars. |
| Clock (Zulu DTG + local) | ✅ | `shell/clock.js` | `AppShellClock.formatZuluDtg()` reused by 7+ modules. |
| Coordinate Readout | ✅ | `shell/coord-readout.js` | Cursor MGRS + bearing/range in footer; degrades if MGRS absent. |
| Scenario Catalog Contract | 🔴 | `shell/scen-catalog-contract.js` | Parses CMO `.scen` wrappers (10 safe fields) but **not loaded in app.html** — drafted, unwired. Deferred — `[[project_external_scenario_catalog_deferred]]`. |
| Scenario Authoring Schema (P0) | 🔴 | `shell/scenario-authoring-schema.js` | Pure data/schema foundation for a future **Authoring Mode**: standard template + gap-fill (on copies) + diagnostics + draft-safety guard. NO DOM/fetch/storage/mutation; respects the locked boundary (`liveMutationAllowed`/`aiCommitAllowed=false`). **Not loaded in app.html** — Node-testable via `window.AppScenarioAuthoring` (33/33). Roadmap P0→P4 — `[[project_scenario_authoring_foundation]]`, `docs/rmooz-authoring-foundation.md`. (`aec386a`) |

---

## B. Wargame / adjudicator visualization (`UI_MOdified/client/wargame/`)

| Module / Feature | Status | Key file | Notes |
|---|---|---|---|
| Adjudicator Map | ✅ | `wargame/adjudicator-map.js` (~5.3k L) | Leaflet renderer: 4 BLS semicircles, OBJ target, Red units, pipeline route, Blue destruction choreography, breach badges. **Now also hosts the W3 presentation suite** (rows below): attrition, echelon roll-up, event pins, movement trails, legend, symbol scaling/resolver. |
| `drawScenario()` | ✅ | same | Builds overlay; caches bls_template + objCoord; registers units. Markers emit selection (see **D1**). |
| `applyState()` per-step | ✅ | same (`bls_status` loop ~`:4608`) | Full per-step wiring: bls_status colors, breach badge, blue-destroyed fade/stagger, red-degraded updates, forward-merge/rewind-replace. See **D2**. |
| Adjudicator HUD | ✅ | `wargame/adjudicator-hud.js` (~2k L) | `renderStep()` → `applyState`; timeline scrubber re-walks history. |
| Contact halo | 🟡 | `wargame/adjudicator-map.js` (`updateContactHalo`) | Wired into applyState but implementation minimal/placeholder. |
| AOR phase line | 🟡 | `wargame/adjudicator-map.js` (`updateAorPhaseLine`) | W3-rich only; plumbing intact, not fully verified. |
| Per-step attrition visuals (AN1) | ✅ | same (`computeStepAttrition` :3825, `applyStepAttrition` :3876) | Maps the scenario's OWN per-step `affected[]`/`engagement_arcs[]` `status_change` → DESTROYED/DEGRADED marker treatment (reuses `renderMarkerByStatus`, same as the live HUD); cumulative + reversible; wired into `applyStepProgress`. No scenario mutation, no fabricated combat fields; no-op for non-W3. Tests 26/26 (`test-an1-attrition-visuals.js`). Implements problem #2 of the P0B animation-readiness audit. (`244cc39`) |
| Echelon roll-up | ✅ | same (`buildEchelonDivisionGroups` :742, `renderEchelonRollup` :794, `buildAggregateIcon` :774) | CMO-style division↔units aggregation: at wide zoom a division's units collapse to one aggregate icon, expanding on zoom-in. Toggle `setEchelonRollup`; wired into draw (:2028), `applyStepProgress` (:5019), and zoom. Additive/reversible (hides via CSS class, no marker-pipeline mutation); no-op for non-W3. Tests 20/20 (`test-an-echelon-rollup.js`). (`4d0d463`) |
| Event pins (AN2) | ✅ | same (`renderEventPins` :975) | Per-step on-map event pins with provenance (actor / intended effect / doctrine) from the scenario's own step data. Wired into `applyStepProgress` (:5021). No mutation. Tests 25/25 (`test-an2-event-pins.js`). (`7c7cfb7`) |
| Movement trails (AN4) | ✅ | same (`renderMovementTrails` :1026) | Per-step movement-trail polylines from `*_unit_step_prev`/`_coords`; seeded at step 0 (:2030), updated on step change (:5024) and zoom (:1622, hide/show by roll-up). Tests 18/18 (`test-an4-movement-trails.js`). Closes a P0B gap. (`d7f7b72`) |
| Engagement legend + formation guide | ✅ | same | On-map legend for engagement-arc colors/arrowheads + a formation guide overlay. Test `test-an3-arrowheads-legend.js` (⚠️ committed but has uncommitted edits in the working tree). (`7f36574`) |
| Symbol scaling + formation hover-peek | ✅ | same (`setFormationPeek` :862) | Echelon-scaled unit symbols + hover to "peek" (temporarily expand) a rolled-up formation. Tests 18/18 (`test-unit-scaling-hover.js`). (`4da9a41`) |
| SIDC family-symbol resolver (SYM2) | ✅ | same | Remaps the 36 W3 units whose specific child SIDC entity codes milsymbol 2.0.0 rejects → their canonical parent family symbol (naval / air-defense / etc.), so they render a proper glyph instead of a generic diamond/square. Honest category-level only. Tests 21/21 (`test-sym2-unit-symbol-resolver.js`); root-cause audit `docs/unit-symbol-fidelity-audit.md` (SYM1, 13/13). (`bc0e861`) |
| Engagement mission graphics (MG1) | ✅ | same (`renderEngagementMissionGraphics` :3309) | Renders each step's `engagement_arcs` as proper APP-6 tactical **mission graphics** (Attack / Counter-attack chevrons, side-coloured) in place of plain arc lines. Wired into `applyState` (:4629), `applyStepProgress` (:5063), and a zoomend re-render (:1637, pixel-sized icons). **Reuses the operator's TMG icon builder** (`getTmgIconOptions`, app.js) — shared graphics, *not* a second renderer; `#mission-graphic-assist` panel in app.js. Tests 27/27 (`test-mg1-mission-graphics.js`). (`22d576e`) |

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

Newer feature work uses **`test-p0*` / `test-an*` / `test-sym*` / `test-unit-*`** naming (authoring / animation / symbology) alongside `test-pr-*`, same standalone static-check style. **Wave 1:** `test-p0-authoring-foundation.js` (33/33), `test-an1-attrition-visuals.js` (26/26), `test-p0b-animation-readiness.js` (audit-inventory). **Wave 2** (committed, all green): `test-an-echelon-rollup.js` (20/20), `test-an2-event-pins.js` (25/25), `test-an4-movement-trails.js` (18/18), `test-p5b-selected-unit-readout.js` (19/19), `test-sym1-unit-symbol-fidelity.js` (13/13), `test-sym2-unit-symbol-resolver.js` (21/21), `test-unit-scaling-hover.js` (18/18), `test-an3-arrowheads-legend.js` (legend), and `test-mg1-mission-graphics.js` (27/27, mission graphics) — all committed and green.

---

## Known duplications & cleanup candidates ♻️

1. **Unit hierarchy rendering** — `units-orbat.js` (tidy-tree SVG modal) vs `units-orbat-dock.js` (flat docked list): two render paths for the same SIDC data.
2. **Parametric shape geometry** — circle/sector/oval builders duplicated between `io.js` (export) and `app.js` (element construction).
3. **Popup binding** — `popups.js` exports builders, but ~40 `bindPopup` calls remain inline in `app.js`.
4. **Workspace cards** — see `docs/scenario-workspace-consolidation-map.md` for the catalogued **9× duplication patterns + 3 dead fields** across ~150 DOM surfaces (authoritative; do not re-audit).
5. **Tile/basemap logic** — embedded inline in `app.js` rather than a module (monolith, not duplication, but a refactor candidate).

---

## Gaps / not-yet-built

- **Real journal/export/download chain (client):** contract + draft-preview + export-preview all read-only; no persistence or download (by design, deferred).
- **Timeline → sim wiring:** transport bar is scaffolding; no playback dispatch beyond the adjudicator HUD's own scrubber.
- **Unit Panel sim sections:** P5b added marker-derived **operational** readouts (symbol / current-step status / capability); **Combat/C2** sections are still placeholders pending a unit sim-data feed.
- **Scenario Catalog (external CMO/CSP51):** drafted contract unwired; UI reverted — `[[project_external_scenario_catalog_deferred]]`.
- **Briefing values:** some workspace briefing fields are mock pending a real feed — `[[project_briefing_mock_values_deferred]]`.
- **Known issue KI-1:** wargame1 baseline violates the BLS-4 never-SECURE invariant (pre-existing; see `docs/known-issues.md`).
- **No unified test runner** (see §F).
- **Decision Package import:** internal + external "خطوات صنع القرار" contracts — already wired in `scenario-workspace.js` + `web-server.js` — `[[project_decision_package_import]]`.
- **Scenario Authoring Mode (P1–P4):** the P0 data foundation shipped but is **unwired** (`shell/scenario-authoring-schema.js`); the editor UI — Sides/Posture (P1), Doctrine/ROE (P2), Missions/Events (P3), Save/Export + "New from template" (P4) — is not built. `[[project_scenario_authoring_foundation]]`.
- **CMO-style animation coverage (P0B audit):** the W3 presentation suite landed — per-unit attrition (AN1), movement trails (AN4), event pins (AN2), echelon roll-up, engagement legend, symbol scaling/hover, the SIDC family resolver (SYM2), and engagement **mission graphics** (MG1, reusing the operator TMG builder). **Wave 2 closed most of P0B problems #1–#2 for W3.** Still open: on-map **phase label**, **timeline event ticks**, **before/after step compare**, and the core **coverage gap** — all the rich animation is still gated on `schema_variant === "w3-rich"`, so non-W3 imports (Decision Packages, CSP51) get markers + movement only. `docs/scenario-animation-presentation-readiness-audit.md`.

---

## 🎯 ACTIVE BUILD ROADMAP — RMOOZ Direction Reset (2026-06-01)

> **Charter:** Build RMOOZ as a **2D regional operational command-decision simulator** =
> *World State + AI Decision Support + Operator Review + Operational Visualization.*
> **Mimic CMO structurally & behaviorally, NOT by data** — composite platforms (multi-radar /
> multi-weapon / magazines), continuous movement, detection/engagement rules — using **our own
> regional, class-based, data-driven values**. No CMO DB copy · no global sim · no DB-size-first ·
> 2D only · structure-first. See memory [[project_rmooz_direction_reset]].
> **Every PR must answer:** *"Does this make the scenario feel more alive & responsive to operator
> decisions?"* and **must not break Wargame 3.**

**Build order (each PR is small, additive, Node-testable; "Follows" = hard dependency):**

| PR | What it contains | Follows | Effort | Alive? |
|---|---|---|---|---|
| **WS1** *(in progress)* | **World State projection + component platform model.** `client/shell/world-state.js` (`window.AppWorldState`): `deriveWorldState(scenario,step)` → normalized snapshot (meta/region/objectives/units/contacts/lines/balance/decisions). Units carry component slots `sensors[]`/`weapons[]`/`magazines[]` (empty for W3) + kinematics (`course`/`heading`/`speed_kn`). `applyDecision()` transition seed. Pure, **unwired** — W3 untouched. `test-ws1-world-state.js`. | — (foundation) | M | substrate |
| **MOVE1** *(done)* | **Realistic continuous movement.** `wargame/movement-playback.js` (`window.AppMovementPlayback`) tweens markers between the renderer's own integer-step positions over a wall-clock clock, wired to the transport bar (`#tl-play`/`#tl-pause`/`#tl-speed` via `rmooz:timeline-ui-action`). **NOTE:** `applyStepProgress` does *not* interpolate unit positions by fractional progress (verified — only integer-step snap), so MOVE1 snapshots step k & k+1 and lerps between them (no flicker, honors W3's computed advance). Additive, calls only public map API, W3 render unchanged. Verified: midpoint between endpoints, play/pause/seed work. **Fixes "movement not like CMO."** *(Follow-up: WS-driven per-unit speed; HUD step-sync.)* | WS1 | M | ✅✅ high |
| **VIS1** | Map polish: on-map **phase label**, timeline **event ticks**, before/after **step compare**. | WS1 | S–M | ✅ |
| **WS2** | Wire **one** renderer element (objective status) to read from World State — parity proof before migrating the rest. | WS1 | S | infra |
| **WS3** | **State transition/reducer**: `applyDecision(state,decision)→nextState` for real (decision recorded + readiness/supply/position transitions). | WS1 | M | ✅✅ |
| **WS4** | Migrate remaining renderer reads (units/BLS/balance) onto World State. | WS2+WS3 | M | infra |
| **DB1** | **RMOOZ DB-Lite — component schema + 3 seed platforms** (DDG, SAM site, air unit) in `sensors[]`/`weapons[]`/`magazines[]` shape, our class values. Structure-first, not size. | WS1 | M | enables |
| **DB2** | Class tables: `sensor_class` / `rcs_class` / `weapon_class` / `doctrine_tags` (small, data-driven). | DB1 | S | enables |
| **DET1** | **Detection rule module** (public formulas, our values): radar-horizon `1.23(√h₁+√h₂)`, RCS range `R_ref·(σ/σ_ref)^¼`, EMCON, LOS → `contacts[]`. Per-sensor. | DB1+DB2+WS3 | M–L | ✅✅✅ |
| **ENG1** | **Engagement rule**: search→fire-control (channels)→WRA→magazine decrement → engagement outcome. | DET1 | M–L | ✅✅ |
| **DOC1** | **Doctrine/ROE layer** — visible & auditable data; AI decisions **cite** doctrine/ROE. | WS3 | M | ✅ |
| **TASK1** | **Tasking/Mission layer** — structured mission objects + tasking view. | WS3+DOC1 | M | ✅ |

**🌟 North-star loop (the demo we're driving toward):** *start app → choose side → place units →
draw their paths → place enemy → hit play → watch it unfold on its own* — for a scenario the operator
**builds in-app**, not just Wargame 3. This works **only** because every rule engine reads from the
shared World State substrate, and the AUTHOR track below **must emit the same scenario shape WS1
projects** (units with `kinematics.course`, sides, objectives, components). That contract is what makes
one engine serve both W3 and hand-built scenarios.

**AUTHOR track (build-your-own; converges with the rule engines for "watch it on its own"):**

| PR | What it contains | Follows | Effort |
|---|---|---|---|
| **AUTH1** | Place units on map for a chosen side (reuse Side Picker + ORBAT place) → writes into the working-copy scenario in WS1 shape. | WS1 + edit-mode slice-1 | M |
| **AUTH2** | **Draw a unit's path** (click waypoints) → `unit.kinematics.course`; MOVE1 then animates it. | WS1 + MOVE1 + AUTH1 | M |
| **AUTH3** | Place enemy + **Run**: hand the authored scenario to the playback clock so MOVE1/DET1/ENG1 advance it autonomously. | AUTH2 + MOVE1 + DET1 + ENG1 | M |

**📐 Realism rule (current build):** RMOOZ adds **mathematical rules** to feel as real as possible —
kinematics (MOVE1 ✅), detection (radar-horizon + RCS, DET1), engagement geometry (ENG1). Unit
class/state values feed these formulas. *"As real as possible"* is a standing goal for every rule PR.

**🔮 FUTURE (deferred — do NOT build unless requested):** **Personnel / maintenance / reliability /
controlled uncontrolled-events** — equipment can't operate by itself (crew availability, fatigue/shift,
maintenance status, reliability, supply, optional explainable malfunctions). These become **gates &
multipliers** on the math rules (reliability × Pd; crew gates firing; fatigue → +OODA; under-maintenance
= not taskable) and **citable constraints** in AI COA proposals. Controlled/explainable/optional —
never fake game randomness. Full schema + plug-in points: memory
[[project_personnel_maintenance_reliability_future]]. Targets: World State · DB-Lite · Readiness/Supply ·
Doctrine/ROE/AI-explanation.

**Phasing:** WS1→MOVE1→VIS1 finish presentation/movement (priority #1) on the new substrate · WS2–WS4
build the World State Engine (priority #2) · DB1–DB2 DB-Lite (#3) · DET1/ENG1 the CMO-style mechanics ·
DOC1 doctrine (#4) · TASK1 tasking (#5). Editable-workspace work ([[project_workspace_editable_owner_ruling]])
is parked. Each PR ships its own `test-*.js` and a re-verified W3 render.

---

## TODO — CMO→RMOOZ capability roadmap (from `docs/cmo-vs-rmooz-capability-comparison.md`)

Ordered by value÷effort, filtered through RMOOZ's read-only / ground-amphibious / AI-adjudication thesis. Full
rationale + per-function gap tables in the doc. **Buckets:** CORE = central to RMOOZ, ADJ = adjacent/clear value.

- [ ] **1. Surface Sides + Posture cards** — CORE, XS. `sides`/`postures` are schema-ready + loader-defaulted but discarded at load; add two read-only cards.
- [ ] **2. Consolidate 3 clock surfaces → 1 + add explicit `scenario_clock` (start_utc/duration_hours)** — CORE, S. Closes a PARTIAL gap *and* a known 3× duplication.
- [ ] **3. Wire the P0 authoring schema into a guided "scenario readiness" mode** (CMO build-order) — CORE, M. Foundation shipped (`shell/scenario-authoring-schema.js`), just unwired.
- [ ] **4. Doctrine/ROE/WRA as read-only *data* the adjudicator cites** — CORE, M. Makes AI proposals auditable (core safety story).
- [ ] **5. Structured read-only "Missions/Tasking" view synthesized from step actors** — CORE, M. ATO-like rollup, not a planning engine.
- [ ] **6. Minimal unit "capability + readiness/supply" descriptors** — ADJ, S–M. Fills Unit Panel's empty Combat/C2 sections; feeds adjudicator.
- [ ] **7. Optional per-zone `environment` (weather/sea-state) overrides** — ADJ, M. Weather without a global physics model.
- [ ] **8. "Why did the adjudicator allow/deny this?" explainer panel** — ADJ, M. Borrows CMO's "why won't it fire" UX for AI-proposal review.
- [ ] **9. IADS/SAM coverage-envelope overlay (visual only)** — ADJ, M. The one in-domain idea from the sensors engine; no detection sim.
- [ ] **10. Declarative `events[]` rule object (data, previewable, no code)** — ADJ, M. In-bounds analogue of CMO's Event Editor; never Lua.

**Deliberately NOT building** (out-of-thesis, catalogued in the doc): detection/EW/IADS *simulation*, weapons/engagement firing math, naval/subsurface mechanics, airfield component model, mission-planning engine, Lua execution.

---

## Pointers to deep docs (don't restate — link)

- `docs/scenario-workspace-consolidation-map.md` — authoritative card/duplication inventory (~150 surfaces).
- `docs/read-only-surface-audit.md` — A=safety-by-design / B=not-wired / C=production classification.
- `docs/rmooz-roadmap.html` — visual program roadmap (done/build/blocked/plan).
- `docs/scenario-schema.md`, `docs/wargame3-schema.md`, `docs/scenario-template.json` — scenario JSON contracts.
- `docs/rmooz-authoring-foundation.md` — P0 Scenario Authoring foundation (schema / template / gap-fill / diagnostics / draft-safety guard; P0→P4 roadmap). Module unwired by design.
- `docs/scenario-animation-presentation-readiness-audit.md` — P0B audit: what animates per step (W3-rich), coverage gaps (non-W3 = markers+movement only), per-unit fidelity, static-units gap. Re-runnable via `node test-p0b-animation-readiness.js`.
- `docs/unit-symbol-fidelity-audit.md` — SYM1 audit: 117/153 W3 units render proper milsymbol glyphs, 36 fall back (milsymbol 2.0.0 rejects specific child SIDC entity codes); fix = role/domain→canonical-family remap (SYM2). Re-runnable via `node test-sym1-unit-symbol-fidelity.js`.
- `docs/pr-166-external-scenario-pack-audit.md` + `docs/scenario-pack-audit/` — CSP51 audit (630 scenarios; don't re-run).
- `docs/cmo-scenario-editor-application.md` — CMO→RMOOZ workflow mapping (general concept→status).
- `docs/cmo-vs-rmooz-capability-comparison.md` — **deep** function-by-function CMO→RMOOZ comparison (mined from 245 tutorial transcripts); source of the CMO→RMOOZ TODO roadmap above.
- `docs/cmo-pgatcomb-playlist-inventory.md` — CMO tutorial playlist caption-read inventory (research/reference; `e75ff65`).
- Cross-session "why" lives in the memory dir (`MEMORY.md` index) — this file is the "what", memory is the "why".
