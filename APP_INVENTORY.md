<!-- AUDIT_SHA: 0efdf17a6ef24d1790248fc2cfb99f53ee12ee35 -->
# APP_INVENTORY — RMOOZ / CMO feature map

> **The single map of what this app has, what it doesn't, and what's drifting.**
> Read this before building anything. If you'd add a module/card/endpoint, find it here first.
> Refresh with `/audit-app` (see `.claude/skills/audit-app/`). The freshness check at session
> start reads the `AUDIT_SHA` marker on line 1 to tell you how stale this is.

**Last audited:** `e75ff65` · 2026-05-31 · two same-day delta refreshes over the `1d4fa64` deep-dig (+16 commits, audited during an active parallel coding session). **Wave 1** (`f31548c`): AN1 attrition visuals, P0 authoring foundation, animation-readiness audit, stray-`wargame 5/` cleanup. **Wave 2** (`11e17b1`→`22d576e`, +9 commits): the **W3 presentation suite** — echelon roll-up, event pins, movement trails, engagement legend, symbol scaling + formation hover-peek, SIDC family-symbol resolver (SYM2), selected-unit operational readout (P5b), and engagement **mission graphics** (MG1). Code audited at `22d576e`; `855301c`+`e75ff65` on top are docs-only (this inventory + CMO docs) with no code drift. Drift D1/D2/D3 re-verified, line refs refreshed. ⚠️ Working tree has active uncommitted code WIP (`app.js`, `adjudicator-map.js`) — re-audit when it lands.
**Wave 3** (`22d576e`→`e0cf324`, +41 commits, audited 2026-06-02 by /audit-app): the **structural CMO backbone landed and is wired.** (1) **World State Engine** — WS1 projection (`shell/world-state.js`), WS3 transition (`shell/world-state-transition.js`), DB-Lite catalog DB1 (`shell/world-state-db.js`), detection DET1 (`shell/detection.js`), engagement ENG1 (`shell/engagement.js`), + server seam `sim/world-state-engine.js`; all pure/framework-free, tests **WS1 25 / DB1 15 / DET1 15 / ENG1 17 / WS3 15, all green**. (2) **MOVE1** continuous movement + playback clock (`wargame/movement-playback.js` — units glide, no teleport). (3) **3D Cesium globe** (`wargame/cesium-view.js`, lazy-loaded) + **Libya DEM terrain** (`client/dem-layer.js` 2D + Cesium 3D provider; server `dem-service.js`, `/api/dem/*`). (4) **Edit Mode slice 1** (`shell/scenario-edit-mode.js` — metadata/sides/posture editable, in-memory working copy; P0 authoring schema now consumed). (5) **Live read-only overlays** wiring the engines onto the map (4b79cf0): coverage/threat rings (41/41), DET1 detection contacts (30/30), ENG1 firing solutions (28/28), 3D parity. (6) **D3 unlocked** — `/api/sim/commit` LIVE + journals; new `/api/sim/decide` (WS3) and `/api/units/:id/place` endpoints. Smoke test 2026-06-02: server boots, `/api/ai/scenarios`+scenario load+`/api/dem/info` all 200.
**Wave 4 (continued 2026-06-03)** — **First reactive World State chain stable**: WS2 (objective status), WS2.5 (DERIVATIONS registry), WS4 (balance computed), WS-BLS-A/A2/B (ownership inversions). **207 tests all green**. BLS-B adds control-based rule (STAGED/SECURED/DENIED/CONTESTED) as temporary, explainable model (may be replaced by MTH1 richer formula). Map/HUD agreement confirmed via fallback pattern `ws.derived.X || state.X`. No mutation, no side effects. **Ready for next phase** (DOC1 doctrine or further roadmap).
**Wave 4** (`e0cf324`→`0efdf17`, +18 commits, audited 2026-06-02 by /audit-app): **Edit Mode Slice 2 completed + polished.** Slices 2A–2E (Geography / Forces / Stepped layout + New Scenario / Forces-at-scale tree / Map-as-editor) were already captured in the gap entry below; this wave adds the **UI-polish slices 2D-1J/K/M/N/O**: an **"Editing: {name}" indicator chip** + **saved-state badge** (unsaved / in-memory / on-disk / on-server), a **"Start from existing" scenario picker** in the New-Scenario form, the editor now renders as a **fixed-position overlay panel** that **expands over the map** when Edit Mode is ON, and **collapses to a banner during Pick-on-map**. No new boundary surface: still in-memory working-copy + `POST /api/scenarios` (durable scenario-file write, separate from the journal); **no `window.units`/`map`/`lines` mutation** (verified). Most of the +18 commits are docs (full 284-caption CMO set + exhaustive functional-rule consolidation) — **no app-code drift**. Smoke test 2026-06-02 (server already up on :8000): `/api/ai/scenarios` 200 (active=wargame3; dp-test-001/2/3 + wargame3), `/api/ai/scenario/wargame3` 200 (1.0 MB), `/api/dem/info` 200, `app.html` 200 (405 KB via verify stub). D1/D2/D3 unchanged (D3 stays resolved-unlocked); no new drift.
**Branch at audit:** `main` (HEAD `0efdf17`). Prior audit branch was `claude/magical-lewin-e1ab3a`.

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
> **D3 RESOLVED 2026-06-01 — owner ruling "full unlock — UI mutates" (minimal-coherent scope).** Operator commit path is now LIVE: `ai-proposal-commit-bridge.js` POSTs `/api/sim/commit` (ACCEPT/REJECT; Hold defers) → durable `data/journal/<run>.jsonl` with `operator_id`. `journal-contract.js` `ALLOWED_MODES` now includes REAL; `boundary-audit-panel.js` re-pointed to the open posture (self-test + violation harness green). Still closed: client scenario mutation, export/download guards, the **separate** `scenario-workspace` live-decision flow. Verified E2E in-browser. `[[feedback_ai_sim_boundary_rules]]`.

| # | Topic | Memory says | Code now does | Where | Action |
|---|---|---|---|---|---|
| D1 | Scenario marker selection | markers **don't** emit `rmooz:unit-selected` (deferred until unified selection model) — `[[project_scenario_marker_selection_deferred]]` | Red & Blue markers **do** dispatch `rmooz:unit-selected` on click | `wargame/adjudicator-map.js:1937` (Red), `:2006` (Blue) | ✅ **RECONCILED 2026-05-30** — confirmed wired (consumed by `unit-panel.js:408`); memory updated to RESOLVED. |
| D2 | BLS drawn on map | per-step `applyState` on step nav still **deferred** (only load half wired in PR-288M) — `[[project_bls_not_drawn_on_map_deferred]]` | per-step `applyState` **fully wired**: `bls_status` colors semicircles + breach badge on STAGED→contested; blue-destroyed choreography; red-degraded updates | `wargame/adjudicator-map.js` `applyState()` `bls_status` loop ~`:4608` | ✅ **RECONCILED 2026-05-30** — load (PR-288M) + per-step (`goToStep`→`applyStepProgress`, P4 `5f0b272`) both wired; memory updated to RESOLVED. |
| D3 | AI/sim commit boundary (**was locked**) | _(history)_ "commit bridge dry-run only; no `/api/sim/commit`, no journal file" — `[[feedback_ai_sim_boundary_rules]]` | **Client commit bridge now POSTs `/api/sim/commit`** (ACCEPT/REJECT; Hold defers) → durable `data/journal/<run>.jsonl` with `operator_id`. Server path unchanged (also used by MC + legacy shim). | client `shell/ai-proposal-commit-bridge.js`; server `web-server.js:749`, `sim/journal.js:146` | ✅ **RESOLVED 2026-06-01 — owner ruling "full unlock — UI mutates"** (minimal-coherent). Verified E2E. Client scenario mutation + export/download + the separate `scenario-workspace` live flow stay closed. |

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
| AI Proposal — Commit Bridge | ✅ | `shell/ai-proposal-commit-bridge.js` | **LIVE commit** (UNLOCKED 2026-06-01): ACCEPT/REJECT → `POST /api/sim/commit` + durable journal w/ `operator_id`; HOLD defers. `getState().mode==='live'`. D3 **resolved**. |
| AI Proposal — Decision Journal | ✅ | `shell/ai-proposal-decision-journal.js` | In-memory mirror (dies on reload); now records real commits (`committed:true` / `#seq` / "Live"); durable record is the server journal. Max 100. |
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
| Scenario Edit Mode (Authoring) | ✅ | `shell/scenario-edit-mode.js` (~2k L) | **Wired** (`window.AppEditMode`, mounted in app.html, `#sw-editmode-toggle`). Edits an **in-memory working-copy draft** of the active scenario: metadata/sides/posture, geography (AO/obj+carver 0..60/pipeline/throughput/BLS), forces (red/blue OOB via tree+detail+search at wargame3 scale), time (`phase_table`), per-step briefing, New Scenario + "Start from existing" picker, stepped CMO build-order rail, **map-as-editor** (click-to-draw AO/pipeline/obj/BLS/unit coords). **Boundary-safe:** never mutates `window.units`/`map`/`lines`; "Save draft" writes only `window.RmoozScenario.scenario` for live preview; durable save = `POST /api/scenarios` (separate from the journal). Save-As-JSON = Blob download (boundary-safe). Doctrine/Weather/Missions/Events steps are 🟡 placeholder cards (engine gaps). Tests: slice2a 50/50, 2b 46/46, 2c 50/50, 2d 43/43, 2e 30/30 + server `test-api-scenarios-post.js` 17/17. Consumes the P0 authoring schema (row below) — `[[project_workspace_editable_owner_ruling]]`. ⚠️ tiny doc-drift: the file header comment still says "Export = copy-to-clipboard" though Save-As-JSON now uses Blob download. |
| Scenario Authoring Schema (P0) | ✅ | `shell/scenario-authoring-schema.js` | Pure data/schema foundation for **Authoring Mode**: standard template + gap-fill (on copies) + diagnostics + draft-safety guard. NO DOM/fetch/storage/mutation; respects the locked boundary (`liveMutationAllowed`/`aiCommitAllowed=false`). **Now loaded** (`app.html:4943`, before edit-mode) and **consumed by Scenario Edit Mode** (`buildStandardScenarioAuthoringTemplate` for New Scenario; `isScenarioAuthoringDraftSafe` gates Save). `window.AppScenarioAuthoring` (33/33). `[[project_scenario_authoring_foundation]]`, `docs/rmooz-authoring-foundation.md`. (`aec386a`) |

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
| Engagement mission graphics (MG1) | ✅ | same (`renderEngagementMissionGraphics`) | Renders each step's `engagement_arcs` as APP-6-style **mission graphics**: **ONE side-coloured axis arrow per side** (centroid of all actor→target arcs — Red "Axis of attack", Blue "Counterattack axis"), built via the shared `createManeuverArrowPolygon` (polyline + `makeArrowhead` fallback). Wired into `applyState`, `applyStepProgress`, and a zoomend re-render. **2026-06-01: made GLOBAL** — the engagement animation (mission graphics + salvo launches) is now gated on **DATA** (`scenarioHasEngagementArcs`), not the `w3-rich` tag; any scenario carrying `engagement_arcs[]` animates, and `updateAttackArrows` defers its static chevrons to the animated path on a data basis. Owner ruling: animations are global (follow CMO model). Tests reconciled to this grouped renderer: `test-pr-mg1-grouped.js` (27/27) + `test-mg1-mission-graphics.js` (27/27). *(Note: tender-noether's old TMG-bridge variant — `buildReadonlyTmgMarker`/`getTmgIconOptions` — was dropped in the merge; that app.js bridge still exists but is no longer the MG1 renderer.)* |
| Cesium 3D globe view | ✅ | `wargame/cesium-view.js` (~570 L) | Parallel 3D renderer to the 2D Leaflet map (CesiumJS 1.116, lazy-loaded from CDN on first toggle). `window.AppCesiumView` API: `drawScenario`/`applyState`/`clearScenario`/`setVisible`/`toggle`/`enterPlaceMode`/`loadCesiumAssets`/`isVisible`. Unit billboards (milsymbol SIDC), altitude-by-domain, parabolic engagement arcs + salvo animation, step-sync. Driven by `adjudicator-map.js` via `window.AppCesiumView.applyState(...)` (synced only when 3D visible, :5423) reading `_lastState`/`_lastScenario` getters (:5858). Toggled by `adjudicator-hud.js` `toggle3DGlobe()` (:824, `#wg-adj-3d-btn`). **Keep in sync with 2D map changes — `[[feedback_keep_cesium_3d_in_sync]]`.** From `claude/tender-noether-123cf0`, preserved in the 2026-06-01 consolidation. |
| DEM-backed 3D terrain | ✅ | `wargame/cesium-view.js` (`makeTerrainProvider`) | `CustomHeightmapTerrainProvider` (WebMercator tiling) fetches real Libya relief from `/api/dem/heights/{z}/{x}/{y}`; `scene.verticalExaggeration = 1.6`. **Graceful flat fallback** if DEM/network absent (zero regression — degrades to prior ellipsoid globe). Visual verification still pending (needs `libya_demx5.tif` + Cesium CDN). |
| DEM 2D overlay layer | ✅ | `client/dem-layer.js` (107 L) | 2D Leaflet hillshade overlay; `window.DemLayer` (`toggle`/`show`/`hide`/`setOpacity`/`queryElevation`/`fetchMeta`). Wired to `#dem-toggle-btn` ("Terrain") + `#dem-opacity-slider` in the adjudicator HUD overlay. |
| Coverage / threat rings (P1, CMO-style) | ✅ | `wargame/adjudicator-map.js` (`coverageRingRadiiKm`, `renderCoverageRings`) + `cesium-view.js` (`renderCoverageRings`) | **2026-06-01.** Per-unit sensor-coverage (dashed, no fill) + weapon-threat (solid, faint fill) rings. **Radii come from the SAME range model the sim uses — the RMOOZ DB-Lite**: `shell/detection.js` `sensor_class[].ref_range_nm` + `shell/engagement.js` `weapon_class[].max_range_nm`, read live off `window.AppDetection`/`window.AppEngagement` (those two modules are now loaded in `app.html` before the map; small in-sync fallback mirror for Node tests). Resolution order: explicit km on the unit (`sensor_range_km`/`weapon_range_km`/`threat_range_km`) → declared `sensors[]`/`weapons[]` components (DB by class) → **the committed DB-Lite capability catalog** (`shell/world-state-db.js` → `AppWorldStateDB.enrichUnit`, now loaded in `app.html` before the map) classifies role/domain → a `sensors[]`/`weapons[]` profile (`classifyKind`: air_defense / naval_combatant / ground_maneuver / air_unit / ew_site / generic), then the DB lookup applies (km is the DB's, nm→km ×1.852, no invented numbers). `enrichUnit` **never overwrites authored components**, so a unit's own sensors/weapons still win. This is the SAME catalog the detection/engagement engines use — **no parallel `RING_ROLE_CLASS` table in the renderer** (deleted 2026-06-01). Tooltip tags the resolved DB class (e.g. `[long_range_sam]`). `generic`/unclassifiable units draw nothing (no fabrication). **OFF by default**, toggled via `#wg-adj-rings-btn` → `window.AppAdjudicatorMap.{toggle,set,isVisible}CoverageRings`; dedicated non-interactive pane (z 415); wired into `applyStepProgress`; skips not-appeared + destroyed units. **No scenario mutation, no fabricated combat-state fields** (read-only overlay). 3D parity in `cesium-view.js` (ground-clamped ellipses) driven by the 2D toggle + 2D DB lookup as the single source of truth (`[[feedback_keep_cesium_3d_in_sync]]`). Tests 41/41 (`test-coverage-rings.js`, requires the real DB1 catalog + a guard that the fallback range mirror equals the live DB). The old hardcoded `RED_405EW` EW halo was generalized to all EW/SIGINT emitters (`findEwEmitters`). *(Two earlier drafts retired: invented domain/role/echelon estimates → DB ranges via a renderer-local role table → the committed DB1 catalog, per owner: "from the DB, not by random" + "use the work already in the repo.")* |
| Firing-solutions overlay (ENG1 live) | ✅ | `wargame/adjudicator-map.js` (`computeEngagementRecords`, `renderEngagements`, `getEngagements`) + `cesium-view.js` (`renderEngagements`) | **2026-06-01.** Wires the previously-orphaned **ENG1** engine (`shell/engagement.js` `computeEngagements`) into the live map so the operator sees **who currently has a valid shot at whom** — a detection-gated, WRA/range/magazine/fire-control-gated firing picture that shifts as units move. Reuses the SAME enriched units + contacts the DET1 overlay feeds (`AppWorldStateDB.enrichUnit` → `AppDetection.computeContacts`), then runs `AppEngagement.computeEngagements`. Draws a shooter→target dotted line per **`engaged`** candidate, coloured by the shooting side (blue/red), weight ∝ Pk; tooltip tags weapon class · Pk% · salvo · range. The full record set (incl. `blocked` + `reason`: out_of_range / weapons_hold / winchester / no_fire_control_channel) is available via `getEngagements(state)` for diagnostics/AI. **COMPUTED firing solutions — distinct from the scenario's authored `engagement_arcs`** (adjudicated kill outcomes drawn elsewhere). **OFF by default**, toggled via `#wg-adj-eng-btn` → `window.AppAdjudicatorMap.{toggle,set,isVisible,get}Engagements`; dedicated non-interactive pane `rmoozEngagementsPane` (z 425, below contacts/above rings); wired into `applyStepProgress` after the contacts. **No scenario mutation, no fabricated combat-state fields**; the engine clones magazine state and never mutates input (read-only overlay). 3D parity in `cesium-view.js` (ground-clamped dashed polylines) driven by the 2D toggle + `getEngagements(state)` as the single source of truth (`[[feedback_keep_cesium_3d_in_sync]]`). Tests 28/28 (`test-engagement-overlay.js`: real engine behaviour — in-range→engaged, far→blocked out_of_range, undetected→no record, hold→weapons_hold, own-side/weaponless→none — + read-only/off/no-fabrication source guards). |
| Detection contacts overlay (DET1 live) | ✅ | `wargame/adjudicator-map.js` (`buildDetectionUnits`, `renderDetectionContacts`, `getDetectionContacts`) + `cesium-view.js` (`renderDetectionContacts`) | **2026-06-01.** Wires the previously-orphaned **DET1** engine (`shell/detection.js` `computeContacts`) into the live map so each side's sensor picture appears/fades as units move each step — the core CMO "feel alive" behaviour. Per step it builds pseudo-units from the live markers' CURRENT positions (`getLatLng` → `[lon,lat]`), enriches each via the **SAME DB1 catalog** the rings use (`AppWorldStateDB.enrichUnit` → `sensors[]`/`rcs_class`), runs `computeContacts`, and draws a small marker on each DETECTED target coloured by the HOLDING side (blue `#3a96d2` / red `#c41e1e`; **firm** = filled solid, **tentative** = dashed hollow); tooltip tags method (radar/esm)·confidence·range·classification. Detection physics (radar-horizon, RCS scaling, EMCON, ESM passive) and ranges are 100% the engine's — nothing invented in the overlay. Skips not-appeared + destroyed units (no ghost contacts); own-side never appears (engine-gated). **OFF by default**, toggled via `#wg-adj-contacts-btn` → `window.AppAdjudicatorMap.{toggle,set,isVisible,get}DetectionContacts`; dedicated non-interactive pane `rmoozContactsPane` (z 430, above rings); wired into `applyStepProgress` after the rings. **No scenario mutation, no fabricated combat-state fields** (read-only overlay). 3D parity in `cesium-view.js` (ground-clamped points) driven by the 2D toggle + `getDetectionContacts(state)` as the single source of truth — Cesium re-runs no detection of its own (`[[feedback_keep_cesium_3d_in_sync]]`). Tests 30/30 (`test-detection-contacts.js`: real engine behaviour + read-only/off-by-default/no-fabrication source guards). First consumer of the orphaned `shell/*` engine layer on the live UI. |

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
| **World State Engine seam** (`sim/world-state-engine.js`) | `POST /api/sim/decide` | **NEW 2026-06-01.** Server seam composing WS1+DB1+DET1+ENG1+WS3; requires the framework-free `client/shell/*` engine modules (deliberate shared logic — flagged, not drift). `project`/`transition`/`run`; `adjudicator.commitDecisions()` journals the WS3 transition (`source='deterministic-sim'`). Test: `test-ws-server-engine.js` (10/10). Server-side WS3 wiring = `[[project_ws3_server_wiring]]`. |

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
- **Scenarios:** `GET /api/ai/scenarios`, `/api/ai/scenario/:name`; `POST /api/scenario/import` (GeoJSON, ≤25MB); `POST /api/scenarios` (**Edit Mode durable save** — validates via `scenario-validator`, sanitises name, **409 anti-clobber** unless `?overwrite=1`, writes `data/scenarios/{name}.json`, clears cache + sets active; `web-server.js:695`); `GET /api/scenario/events` (SSE reload).
- **Sim boundary:** `POST /api/sim/propose` (no mutation), `POST /api/sim/commit` (LLM-proposal commit — mutates + journals), `POST /api/sim/decide` (**WS3 deterministic decision commit** — derives World State, applies a WS3 decision, journals `source=deterministic-sim`). D3 unlocked 2026-06-01.
- **Legacy:** `POST /api/ai/adjudicate` (routes through propose+commit; `source='legacy-shim'`).
- **Feedback/lessons:** `POST /api/ai/feedback`, `GET /api/ai/feedback/summary`; `POST|GET /api/ai/lessons`.
- **Reports:** `GET /api/ai/report.json`, `/api/ai/report.html`.
- **Monte Carlo:** `POST /api/ai/mc/start`, `GET /:runId/events` (SSE), `POST /:runId/cancel`, `GET /:runId/aggregate`.
- **Chat:** messages (`GET|POST /api/chat/messages`), upload, groups (create/join/invite/invite-code/leave/delete + `/mine`), presence, `rooms/members`, identity (`GET|POST /api/chat/me`).
- **Units (SQLite):** `GET /api/units/tree`, `/:id/children`, `/search`, `/code-check`; `POST /api/units`, `PATCH /api/units/:id`, `POST /api/units/:id/{move,place,unplace,delete,restore}`. All writes require auth.
- **DEM (Libya terrain):** `GET /api/dem/tile/:z/:x/:y.png` (hillshade+colormap PNG), `GET /api/dem/heights/:z/:x/:y` (octet-stream Float32LE real-metre height grid for Cesium `CustomHeightmapTerrainProvider`; 204 outside coverage, 400 on bad input), `GET /api/dem/info` (coverage + pixel-scale meta), `GET /api/dem/elevation?lon=&lat=` (point elevation) — all served by `server/dem-service.js` (`readRegion` bilinear resampler over `libya_demx5.tif`). Powers both the 2D `dem-layer.js` overlay and the DEM-backed 3D terrain.
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
- **Scenario Authoring Mode — IN PROGRESS (Wave 3):** **Slices 1 + 2A + 2B + 2C + 2D-1 + 2D-2 BUILT & wired** — `shell/scenario-edit-mode.js` (`window.AppEditMode`, mounted in app.html, ~2014 LOC). **Slice 2D-2 (Map-as-editor, 2026-06-02)** replaces lon/lat textareas with **click-to-draw** affordances on the live map: **"Set objective on map"** (single click → `obj.coord`), **"Draw AO on map"** (click vertices + double-click → closed GeoJSON Polygon pushed to `ao_boundaries[]` with auto-name "AO N"), **"Draw pipeline on map"** (click waypoints + double-click → replaces `pipeline[]`), **per-BLS "Pick coord on map"** (single click → BLS coord). Uses native Leaflet — no plugin. Audit confirmed no Leaflet.Draw/Geoman exists in the codebase; pattern mirrors the existing hand-rolled vertex-collection in `app.js` geo-tools + `free_draw_signature.js`. New helpers `_beginPickOnMapPolygon` / `_beginPickOnMapPolyline` extend the Slice 2D-1E `_beginPickOnMap` single-shot pattern with live preview (`L.polygon`/`L.polyline` updates each click), double-click to finish, Enter accepts, ESC cancels. After each finish, `_maybeRepaintMap()` copies the draft into live `RmoozScenario` and calls `AppAdjudicatorMap.drawScenario` so the new shape renders immediately (preview only — Save draft is still the official commit). Static test `test-edit-mode-slice2e.js` 30/30 green covering vertex accumulation, polygon auto-close, polyline open-ended, minimum-vertex enforcement, external-cancel cleanup. Browser-verified on wargame3 at 820×900: obj coord updated, AO polygon (5-point closed ring) added, pipeline replaced (24→5 waypoints), BLS coord moved. Earlier slices: **Slice 2D-1 (Forces redesigned for scale, 2026-06-02)** replaces the Slice 2B flat list with a **tree + detail-pane + search** that handles real wargame3-scale data (70 Red + 83 Blue): grouped by **Side → Echelon → unit**, compact one-line rows (sym + uid + label + role/bls tags), click-to-select + single-unit **detail pane** below the tree so only ONE unit's full editor lives in the DOM at a time. Search/filter bar matches across uid/label/role/bls/echelon (case-insensitive); filtered tree auto-expands all matching groups. Group-collapse state persists across rerenders. **Live measurement on wargame3 → Forces step: 51,688 px → 785 px scroll (65× reduction); 1,198 inputs → 1 at rest, 10 when a unit is selected.** Also fixes a **silent data-corruption bug** introduced in Slice 2B: the `role` field is now `<input list="…">` + `<datalist>` (free-text with 7 CMO maneuver-role *suggestions*), not a strict `<select>` — wargame3's 33 distinct role values (`mech_inf_div`, `sam_s300`, `submarine`, `awacs`, …) round-trip without coercion. Add-Red/Add-Blue moved into the toolbar; "Pick coord on map" button on the detail pane reuses Leaflet's once-click handler to set the selected unit's `coord` (CMO Insert-then-click flow analog; never touches `/api/units/:id/place`). Static test `test-edit-mode-slice2d.js` 43/43 green (incl. wargame3-scale evidence: 33 distinct roles, 0 overlap with the old strict enum). Browser-verified on real wargame3 data. **Slice 2D-2 next = Map-as-editor for AO / pipeline / objective** (Leaflet draw integration, reusing existing draw-panel/shapes-panel tools — to be audited first). Earlier slices: **Slice 1** = Metadata + Sides + Posture. **Slice 2A (Geography, 2026-06-02)** = AO + Forces Geometry (`map_bbox`, `ao_boundaries`, `obj` with `carver` 0..60 hard block, `pipeline`, `throughput_ceilings_km`, `bls_template`). **Slice 2B (Forces, 2026-06-02)** = Red OOB + Blue OOB editing (`red_units[]` / `blue_units_initial[]`, writes into in-memory draft NOT the durable `/api/units` SQLite; `blue_units_base_ids` derived on Save). **Slice 2C (Layout + New Scenario, 2026-06-02)** restructures the editor into a **stepped left-rail navigator** matching CMO's 13-step build-order (Metadata → Map → Sides → Posture → Doctrine → Time → Weather → Forces Geometry → Forces → Missions → Events → Briefing → Validate & Save) — replaces a 4136-px crowded scroll with a 520-px per-step pane (≈ 8× reduction). Each step has a completion-pill indicator (green ✓ / yellow ⚠ / empty / dashed-gap); 4 engine-GAP steps (Doctrine, Weather, Missions, Events) show placeholder cards naming the future slice. Adds two trivially-missing build-order cards: **Step 6 Time & Duration** (`phase_table[]` editor + "Synthesize H-3 → H+120 (6 steps)" preset; keeps `phase_table.length === steps.length` in lockstep) and **Step 12 Briefing** (per-step EN/AR narrative textareas, RTL on AR). Adds the long-missing **"+ New scenario" affordance**: inline form (name, EN/AR label, base template) → stamps a fresh draft via `AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate()` + Slice 1/2A/2B defaults, opens Edit Mode at Step 1. Adds **"Save As JSON"** (client-side Blob download — boundary-safe; the locked guard is journal download, not arbitrary file download) and **"Save to server"** via new endpoint **`POST /api/scenarios`** (in `web-server.js`): validates with the existing `scenario-validator`, sanitises name, returns 409 anti-clobber unless `?overwrite=1`, writes to `data/scenarios/{name}.json`, clears cache + sets active (mirroring `/api/scenario/import`'s pattern). Combined static tests: `test-edit-mode-slice2a.js` 50/50 + `test-edit-mode-slice2b.js` 46/46 + `test-edit-mode-slice2c.js` 50/50 = **146 client assertions green**. End-to-end server test `test-api-scenarios-post.js` (spawns web-server on a temp data dir + random port) = **17/17 green** (POST 200 + 409 + overwrite=1 + 400 on malformed + 400 on validator-fail + name sanitisation). Pure helpers exposed at `AppEditMode._testing` (STEPS table, stepIsComplete, synthesizeDefaultPhaseTable, ensureStepsMatchPhaseTable, PHASES_ENUM). CSS for the rail/cards in `app.html`. **Next = DOC1: Doctrine/ROE/WRA** — the highest-value engine gap per the playbook (Step 5 ⚠️ GAP); makes AI proposals auditable. **Wave 4 UI-polish (2D-1J/K/M/N/O):** "Editing: {name}" indicator chip + saved-state badge (unsaved/in-memory/on-disk/on-server), "Start from existing" picker in the New-Scenario form, editor now a fixed-position overlay that expands over the map when ON and collapses to a banner during Pick-on-map. **Slice 2 is functionally complete; next = DOC1.** `[[project_workspace_editable_owner_ruling]]`.
- **WS3 client direct-decisions not yet wired:** the State Transition Engine runs server-side (`/api/sim/decide`) and is embedded client-side, but the live map doesn't yet let an operator issue direct MOVE/ENGAGE/EMCON decisions through it (future Step-2 per-unit actions).
- **`scen-catalog-contract.js` — stub/unloaded:** file exists, export incomplete, not in app.html. Leftover from the deferred external-catalog work — `[[project_external_scenario_catalog_deferred]]`.
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
| **VIS1** *(done 2026-06-01)* | Map polish. **Ground-truth before building:** on-map **phase label** already lives in the SITREP banner (`adjudicator-map.js` phasePill); **before/after step-compare** already exists (scenario-workspace live→preview strip, `#sw-wt-cmp-strip`) — neither rebuilt. **Timeline event ticks** BUILT: read-only per-step track under `#timeline-strip` — `shell/timeline-event-ticks.js` (`window.AppShellTimelineEventTicks`), one segment/step from `RmoozScenario.scenario.steps` (events = `engagement_arcs`+`affected`), marks event-steps + highlights current step, reconciles via dirty-checked poll + `rmooz:playback-tick`. Visual-only (no scenario/step mutation). Verified in-browser (17 ticks on W3, current-step highlight, no console errors). EN/AR i18n. | WS1 | S–M | ✅ |
| **WS2** *(done)* | **Live integration: objective status + objective logic.** `computeObjectiveStatusDisplay()` in `world-state.js` reads CAPTURED evidence (force ratio + losses) from computed balance; *non-CAPTURED passes through*. Wired: `adjudicator-hud.js` + `adjudicator-map.js` read `ws.derived.objective_status_display || state.objective_status` (fallback to authored). Parity-proof (WS2 + WS4 together closed the ownership inversion). Test: `test-ws2-live-integration.js` (18/18). | WS1 | S | ✅ |
| **WS2.5** *(done)* | **Derived-field rules engine** — `DERIVATIONS` registry in `world-state.js` (pure pattern; each rule is an independent function); `applyDerivations()` re-runs all computed fields when inputs change. Registry: `balance_summary` → `objective_status_display` → `bls_status`. Parity-safe fallback pattern on all reads (WS-derived || authored). Tested as part of WS-BLS-A/B suites. | WS1 | S | ✅ |
| **WS3** *(done)* | **State Transition Engine** — `client/shell/world-state-transition.js` (`window.AppWorldStateTransition.applyDecision`). Closes the loop *World State → decision → new World State → new options*. Decisions: MOVE · SET_EMCON · SET_READINESS · SET_WRA · RESUPPLY · ENGAGE. Composes DET1+ENG1 (ENGAGE is detection-gated, applies attrition + magazine decrement). **Recomputes contacts after every decision** (e.g. EMCON-on reveals contacts) and returns an explainable `effects[]` changelog (feeds DOC1/AI). Pure, Node-testable, **unwired**. 15/15 in `test-ws3-transition.js`; "my decision changed the battle" narrative verified. | WS1 (+DET1+ENG1) | M | ✅✅✅ |
| **WS4** *(done)* | **Balance computed from World State units** — `computeBalanceSummary()` derives `force_ratio_value` + losses from live unit weights (echelon-based, swappable via `getUnitOperationalWeight`). Wired: `applyDerivations` runs balance first, then objective. Parity-safe fallback (WS-computed || authored mirror). Test: `test-ws4-balance.js` (24/24). Map/HUD read `ws.derived.balance_summary || state.balance`. **First complete reactive chain WS1→WS2→WS2.5→WS4 stable (207 tests, all green).** | WS2+WS3 | M | ✅✅ |
| **WS-BLS-A** *(done)* | **Presence-only BLS rule** — `computeBlsStatus()` (STAGED if no RED nearby / CONTESTED if RED within 10nm). First ownership inversion moving authority from authored `state.bls_status` into World State. Test: `test-ws-bls-a.js` (27/27). Map/HUD fallback pattern: `ws.derived.bls_status || state.bls_status`. | WS1 | S | ✅ |
| **WS-BLS-A2** *(done)* | **HUD reads World State BLS** — wire `adjudicator-hud.js` to read BLS from `ws.derived.bls_status` (same fallback as map). Ensures map/HUD agreement. Part of WS-BLS-A suite. | WS-BLS-A | S | ✅ |
| **WS-BLS-B** *(done 2026-06-03)* | **Control-based BLS rule — TEMPORARY simple model.** `computeBlsStatusB()` upgrades ownership from presence-only to control: STAGED (empty) / SECURED (RED only) / DENIED (BLUE only) / CONTESTED (both). **Documented as TEMPORARY, explainable, replaceable by MTH1 with a richer control-score formula** (e.g., force ratio weighting, distance decay). Wired: `DERIVATIONS.bls_status = computeBlsStatusB`. Uses same 10nm radius, parity gates, no mutation. Test: `test-ws-bls-b.js` (31/31). W3 verified: step 0=STAGED, step 3=SECURED, step 5+=CONTESTED. Map/HUD agreement confirmed. | WS1+WS2.5 | S | ✅✅ |
| **DB1** *(done)* | **RMOOZ DB-Lite — role→capability catalog.** `client/shell/world-state-db.js` (`window.AppWorldStateDB`): `enrichWorldState(ws)` attaches `sensors[]`/`weapons[]`/`magazines[]` + `rcs_class`/readiness/supply/doctrine_tags to units **from role+domain** (generic `classifyKind`, data-driven `CAPABILITY_CATALOG` — extend by adding a row; authored components never overwritten). **Lights up the whole stack on real W3: raw=0 contacts → enriched=139**, ENGAGE resolves end-to-end, EMCON-silent drops contacts. Lightweight per direction (no size, no CMO data). Pure, Node-testable, **unwired**. 15/15 in `test-db1-capabilities.js`. | WS1 | M | enables |
| **DB2** | Class tables: `sensor_class` / `rcs_class` / `weapon_class` / `doctrine_tags` (small, data-driven). | DB1 | S | enables |
| **DET1** *(done)* | **Detection rule module** — `client/shell/detection.js` (`window.AppDetection.computeContacts`). Public formulas, our values: radar-horizon `1.23(√h₁+√h₂)`, RCS range `R_ref·(σ/σ_ref)^¼`, EMCON gating, ESM passive (1.5× emitter range), LOS hook (DET2). Carries a seeded **DB-Lite** (`DEFAULT_DB`: `sensor_class`/`rcs_class`/domain alt+RCS defaults) — partially satisfies DB1/DB2. Pure, Node-testable. **NOW WIRED into the live UI 2026-06-01** via the "Detection contacts overlay (DET1 live)" row above (`adjudicator-map.js` builds pseudo-units from live markers → enrich (DB1) → `computeContacts` → read-only contact markers; OFF by default, 3D parity). Also feeds the server seam (`sim/world-state-engine.js`). 15/15 in `test-det1-detection.js`; W3 units (no sensors) → 0 contacts (no fabrication). | WS1 (+ seeded DB-Lite) | M | ✅✅✅ |
| **ENG1** *(done)* | **Engagement rule** — `client/shell/engagement.js` (`window.AppEngagement.computeEngagements`). Chain: detection-gated → WRA/ROE (hold + range mode max/75%/NEZ) → ammo → fire-control channels (point-defense autonomous) → salvo Pk `1−(1−pk)^n` → magazine decrement. Every non-shot has an explainable `reason` (out_of_range / winchester / no_fire_control_channel / weapons_hold) — feeds DOC1/AI. Seeded weapon DB-Lite. Pure, Node-testable. **NOW WIRED into the live UI 2026-06-01** via the "Firing-solutions overlay (ENG1 live)" row above (`adjudicator-map.js`: enriched units + DET1 contacts → `computeEngagements` → read-only shooter→target firing-solution lines; OFF by default, 3D parity). Also feeds the server seam (`sim/world-state-engine.js`). 17/17 in `test-eng1-engagement.js`; W3 (no weapons) → 0 engagements. | DET1 | M–L | ✅✅ |
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

## TODO — CMO→RMOOZ capability roadmap (chosen set, sourced from `docs/cmo-functional-rules/exhaustive/`)

> 🔒 **GUARDRAIL — build only what's on this chosen list.** The single source of truth for CMO behavior
> is **`docs/cmo-functional-rules/exhaustive/`** (945 caption-grounded rules, 9 buckets). The list below is
> the **explicitly chosen** subset RMOOZ will implement. **Do NOT invent functions or build CMO mechanics
> that are not on this list** — if a desired function isn't here, add it here first (citing the governing
> rule file), get it chosen, *then* build. Anything in the "Deliberately NOT building" list stays out.

Ordered by value÷effort, filtered through RMOOZ's ground-amphibious / AI-adjudication thesis. Per-rule
behavior (inputs/thresholds/formulas) lives in the exhaustive bucket specs cited per item.
**Buckets:** CORE = central to RMOOZ, ADJ = adjacent/clear value. **Note:** Wave 3 already shipped the
World-State/MOVE1/DET1/ENG1/DB1 engines + Edit Mode Slice 1; **Wave 4 completed Edit Mode Slice 2** (Geography,
Forces, stepped layout, New Scenario, map-as-editor, durable `POST /api/scenarios`) — items 1 & 3 below are now
**shipped inside Edit Mode**. The next chosen item is **DOC1: Doctrine/ROE/WRA** (item 4 below — highest-value
engine gap, makes AI proposals auditable).

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
- **`docs/cmo-functional-rules/exhaustive/`** — ⭐ **the single source of truth** for CMO behavior: 945 caption-grounded rules across 9 buckets, the chosen-function roadmap above sources from here. (Superseded + replaced the older `cmo-scenario-editor-application.md` and `cmo-vs-rmooz-capability-comparison.md`, now deleted.)
- `docs/cmo-functional-rules/5-build-playbook.md` + `sample-sahil-corridor.json` — worked "build a scenario the CMO way" example (validates `ok: true`); the target shape for the authoring editor.
- `docs/cmo-pgatcomb-playlist-inventory.md` — CMO tutorial playlist index (maps title→videoId→`cmo-captions/<id>.txt`).
- Cross-session "why" lives in the memory dir (`MEMORY.md` index) — this file is the "what", memory is the "why".
