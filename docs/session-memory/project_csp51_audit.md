---
name: project-csp51-audit
description: CommunityScenarioPack51 deep audit completed 2026-05-28; key structural and data findings for RMOOZ external catalog planning
metadata: 
  node_type: memory
  type: project
  originSessionId: 11200880-7603-4ae4-ac65-56950469bb4e
---

Audit of `/Users/engcode/Downloads/CommunityScenarioPack51` completed 2026-05-28. 9 report files written to `/Users/engcode/Desktop/Map_2/docs/scenario-pack-audit/`.

**Why:** Pre-requisite discovery pass before building PR-280A External Scenario Manifest Builder.

**How to apply:** All import planning must reference these findings rather than re-running the audit.

## Key facts

- **1,327 files, 12 directories, ~462 MB**
- **630 .scen** (binary, opaque) + **632 .ini** + 20 PDF + 16 HTML + 8 Lua + 8 DOCX + 4 CSS + 4 TXT + 3 RTF + 1 XLSX + 1 JPG

## Critical discovery: .ini files are NOT metadata
All 630 companion .ini files are CMO `<ScenarioUnits>` XML weapon-patch documents (unit GUIDs + weapon DB IDs). They contain NO title, author, description, or date. Do not treat them as metadata sources.

## Only external metadata source: XLSX
`Documents/Command Community Pack Scenario List.xlsx` has columns: `#`, `SCENARIO TITLE`, `YEAR`, `Package`, `AUTHOR`, `NOTES`. This is the only non-binary author/package attribution source.

## Lua scripts: all belong to Gulf of Sidra 1981 only
8 scripts in `Lua/GulfofSidra1981/`. 6 of 8 mutate CMO game state (posture, score, unit state, loadouts). All must be blocked from auto-execution. Flag: `has_lua: true, lua_execution_blocked: true`.

## Campaign series identified: 28 groups
Including: BALTAP (9), The War That Never Was (12+), Khrushchev's War (6), Black Tiger (I–V), SC Andes/Egypt/Mauritania, Red Episodes, Iran Strike, Putin's War, Battle Ocean 64, Indonesian War, Seawolf, Rollback, NFZ, Sumatra Crisis, 688 Attack Sub, Northern Fury, Korean scenarios, Curacao Crisis.

## HTML briefing packages: 3 scenarios
Iran Strike 2025, Operation Ghost Rider 1985, Gulf of Sidra 1981 — full HTML+CSS briefing packages in `Assets/`. Safe to display as-is.

## Import tiers
1. **ZERO risk:** Filename parsing (title + year + size + campaign group from 630 filenames)
2. **LOW risk:** XLSX author data
3. **LOW risk:** HTML briefings (3 scenarios)
4. **MEDIUM risk:** DOCX/RTF text extraction (~10 scenarios)
5. **NOT SAFE:** .scen binary, .ini XML weapon patches, Lua execution, PDF without tool

## PR-280A Status: COMPLETE (2026-05-28)
Outputs:
- `docs/scenario-pack-audit/external_scenario_source_manifest.json` — 1.1 MB, 630 scenarios
- `docs/scenario-pack-audit/external_scenario_source_manifest.md` — 9 KB summary
- `test-pr-280A.js` — 79 tests, 79/79 pass

Key numbers: 512 XLSX-matched, 118 filename-fallback, 509 high-confidence, 120 medium, 1 low.
626 have .ini weapon patch. 3 have HTML briefings. 1 has Lua (Gulf of Sidra 1981). 13 have doc briefings.

## PR-280B Status: COMPLETE (2026-05-28)
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+304 lines)
New exports: `buildSingleExternalScenarioCatalogEntry`, `summarizeSingleExternalScenarioCatalogEntry`
New files: `test-pr-280B.js` (83 tests, 83/83 pass), `docs/scenario-pack-audit/external_scenario_single_smoke_fixture.json`
No UI. No .scen parsing. No .ini metadata. No Lua executed. No Gate 7. No storage/backend.
Smoke-tested against real PR-280A manifest — Iran Strike 2025 selector works with real 630-scenario data.

## PR-280C Status: COMPLETE (2026-05-28)
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~200 lines)
New exports: `buildExternalScenarioCatalogFromManifest`, `summarizeExternalScenarioCatalogSubset`
New files: `test-pr-280C.js` (104 tests, 104/104 pass), `docs/scenario-pack-audit/external_scenario_catalog_subset_fixture.json`
Hard cap: 25 entries max (LIMIT_CLAMPED warning when exceeded). Full filter/sort/pagination support.
No UI. No .scen parsing. No .ini metadata. No Lua executed. No Gate 7. No storage/backend.
Real-manifest counts confirmed: 629 matched (avoidLua default), 509 high-conf, 511 xlsx-matched, 7 BALTAP, 2 HTML-briefing (no Lua), 13 doc-briefing.

## PR-281 Status: COMPLETE (2026-05-28) — Browser verified 27/27
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~110 lines)
New exports: `paintExternalScenarioPreviewEntry`, `setExternalScenarioPreviewEntry`
Section injected by JS: `#sw-ext-preview-section` (appended to #scenario-workspace-panel)
Browser verified: compact (62px), empty state, 13-field render, no forbidden buttons, zero console errors.

## PR-282 Status: COMPLETE (2026-05-28) — Browser verified 17/17
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~230 lines), `UI_MOdified/client/app.html` (+37 lines), `UI_MOdified/client/i18n.js` (+18 keys EN+AR), `UI_MOdified/client/style.css` (+12 lines)
New exports: `setExternalScenarioCatalogSubset`, `getExternalScenarioCatalogSubset`, `clearExternalScenarioCatalogSubset`, `paintExternalScenarioCatalogSelector`, `previewExternalScenarioCatalogSubsetFromManifest`
Static HTML: `#sw-ext-select-section` with `#sw-ext-select-control` (disabled until manifest loaded)
Tests: `test-pr-282.js` — 112/112 pass
Browser: selector compact (99px), disabled before manifest, 10 options after load, preview updates on change, 0 forbidden buttons, 0 console errors.
Default subset: 10 scenarios, avoidLua:true. autoPreviewFirst:true auto-selects first entry.

## PR-284 Status: COMPLETE (2026-05-28) — Browser verified 27/27
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~160 lines)
New exports: `buildExternalScenarioSourceTrace`, `paintExternalScenarioSourceTrace`
New files: `test-pr-284.js` (197 tests, 197/197 pass), `verify-pr-284.js`, `docs/pr-284-verify/`
HTML: `#sw-ext-trace-section` with 12 data IDs added to `app.html`
i18n: 17 EN + 17 AR keys added to `i18n.js`
CSS: `.sw-ext-trace-section`, `.sw-ext-trace-body`, `.sw-ext-trace-empty`, colour rules added
Cascade: `paintExternalScenarioPreviewEntry` auto-calls `paintExternalScenarioSourceTrace` on entry change/clear
Browser: trace compact (240px), empty state before load, all 12 fields populated after load, selection change updates trace, 0 forbidden buttons, 0 console errors.

## PR-283 Status: COMPLETE (2026-05-28) — Browser verified 29/29
Files changed: `UI_MOdified/client/app.html` (+~90 lines restructured), `UI_MOdified/client/shell/scenario-workspace.js` (~10 lines changed in _initExtPreviewSection), `UI_MOdified/client/i18n.js` (+12 keys EN+AR), `UI_MOdified/client/style.css` (+9 lines)
New files: `test-pr-283.js` (96 tests, 96/96 pass), `verify-pr-283.js`, `docs/pr-283-verify/`
Key structural changes:
  - `#sw-scenario-source-section` wraps both source workflows
  - `#sw-local-json-source-card` contains local JSON import controls (moved from `#sw-dp-loader-row`)
  - `#sw-external-catalog-source-card` contains selector + preview + trace
  - `_initExtPreviewSection` now injects into `#sw-external-catalog-source-card` before `#sw-ext-trace-section`
  - DOM order confirmed: selector → preview → trace (index 1→2→3)
Browser: one clear "Scenario Source" section, two subcards visible, local import controls intact, selector/preview/trace inside external card, 0 forbidden buttons, 0 console errors.

## PR-285A Status: COMPLETE (2026-05-28) — Browser verified 19/19
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~110 lines), `UI_MOdified/client/app.html` (+10 lines), `UI_MOdified/client/i18n.js` (+8 keys EN+AR), `UI_MOdified/client/style.css` (+8 lines)
New exports: `buildWargame3PreviewUnitScopeSummary`, `paintWargame3PreviewUnitScope`
New files: `test-pr-285A.js` (72 tests, 72/72 pass), `verify-pr-285A.js` (19/19 browser pass), `docs/pr-285A-verify/`
Key fix: `paintWargame3Preview` now sets `_drpPreviewSource` BEFORE calling `paintDryRunPreview` so `totalUnits` is available on the first W3 paint.
OOB source: `_drpPreviewSource.units.length = 153` (70 red + 83 blue from wargame3.json fixture).
Browser step counts confirmed: step-00: 14 of 153, step-04: 9 of 153, step-08: 14 of 153 (capped), step-16: 12 of 153.
No MAX_MARKERS change. No unit filtering change. No map logic change. No Step Navigator behavior change.

## PR-286L Status: COMPLETE (2026-05-28) — Browser verified 25/25
First production-oriented LIVE workflow PR. No dry-run usage.
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~340 lines), `UI_MOdified/client/app.html` (+25 lines), `UI_MOdified/client/i18n.js` (+13 keys EN+AR), `UI_MOdified/client/style.css` (+24 lines)
New module-private state: `_liveOperatorWorkflowState = { selections: {}, events: [] }`, capped at 64 events.
New exports: `getLiveScenarioIdentity`, `getActiveLiveStepContext`, `extractLiveDecisionOptions`, `recordLiveOperatorSelection`, `clearLiveOperatorSelection`, `getLiveOperatorWorkflowState`, `paintLiveDecisionActionCard`
New files: `test-pr-286L.js` (91 tests, 91/91 pass), `verify-pr-286L.js` (25 browser checks, 25/25 pass)
Card placement: after `#sw-dp-card` (live Decision Point), inside `#scenario-workspace-panel`. NOT in dry-run, NOT in Scenario Source, NOT in diagnostics.
Wired into `refresh()` cycle (PR-142 area + 1 line).
Key format: `scenarioId + "::step-" + stepIndex` (e.g. "wargame3::step-8").
wargame3.json finding: 0 of 17 steps contain live decision_options — confirmed during browser test which showed the "No decision options" message. Test scenario injected via console exercised full select/clear/step-keying flow.
Selection record: readOnly:true, liveMutationAllowed:false, backendCommitAllowed:false, committed:false, applied:false.
No dry-run state used. No scenario object mutation. No /api/sim/commit. No Gate 7. No localStorage/sessionStorage.

## PR-287L0 Status: COMPLETE (2026-05-29) — Browser verified 20/20
Removed Wargame 3 Dry-Run from the production Scenario Workspace.
Files changed: `UI_MOdified/client/app.html` (+3 hidden attributes, +comments), `UI_MOdified/client/shell/scenario-workspace.js` (-1 auto-paint call, +1 overlay-clear call, +PR-287L0 comments)
Dry-run UI hidden (NOT deleted): `<div class="sw-w3-section-hdr">` header, `#sw-w3-load-bar`, `#sw-drp-section` (was already hidden by default; no longer unhidden by auto-paint).
JS change in init: removed `paintDryRunPreview();` (no-arg = AMBER RIDGE auto-paint); added `clearWargame3ReadOnlyMapOverlay()` overlay cleanup.
Dry-run JS exports REMAIN — developer-only: `paintDryRunPreview`, `paintWargame3Preview`, `paintWargame3PreviewMapOverlayFromPreview`, all PR-238/245/284/285A W3 functions. Callable from `window.AppShellScenarioWorkspace` console for regression/dev.
New files: `test-pr-287L0.js` (42 tests, 42/42 pass), `verify-pr-287L0.js` (20 browser checks, 20/20 pass), `docs/pr-287L0-verify/`
Live confirmations: Step Navigator works (sw-nav-next click → stepIndex 0→1), live meta card present, PR-286L Live Decision Action still works (Select + Clear + per-step keying), Scenario Source subcards intact, zero console errors, zero scenario-commit network calls.
Pre-existing mock `#pra-card` (Approve/Reject/Hold buttons) NOT touched — flagged by reset plan §4.4 as separate "replace, don't demote" target.

## PR-287L2 Status: COMPLETE (2026-05-29) — Browser verified 27/27 + 84/84 unit tests
Live Scenario Workspace + Live Map Integration Consolidation. DOM restructure + 1 behavior fix + live map status row + button relabel.
Bonus CSS fix: `.sw-w3-load-bar[hidden]` + `.sw-w3-section-hdr[hidden]` rules added so the `hidden` attribute set by PR-287L0 actually wins over the class-level `display: flex`. Without this, the W3 load bar was still visible despite the `hidden` attribute (caught by C16b).
New element: `#sw-live-map-status` inside `#sw-live-scenario-header` shows overlay state ("Overlay off"/"Overlay on"/"Overlay available") with data-state attribute and colour-coded badge.
Overlay button relabel: i18n keys `sw-nav-overlay-show`/`sw-nav-overlay-hide` → "Show Live Unit Overlay"/"Hide Live Unit Overlay" (EN) + Arabic.
`paintOverlayToggleButton` now also calls `paintLiveScenarioHeader` so the header map-status row stays in sync with the toggle.
Live Scenario Workspace Consolidation. DOM restructure + 1 behavior fix.
Files changed: `UI_MOdified/client/app.html` (~60 net line restructure: new `<section id="sw-live-workspace">` wraps 15 live cards in order header→nav→decision→meta→briefing→…→rf; new `<section id="sw-secondary-cards">` wraps 6 mock cards collapsed by default; `#sw-dp-loader-row` now hidden), `UI_MOdified/client/shell/scenario-workspace.js` (+~110 lines: `paintLiveScenarioHeader`, `initSecondaryCardsToggle`, +2 calls in `goToStep`, +1 call in `refresh`, +1 call in init), `UI_MOdified/client/i18n.js` (+8 EN + 8 AR keys), `UI_MOdified/client/style.css` (+25 lines)
New exports: `paintLiveScenarioHeader`, `initSecondaryCardsToggle`
goToStep wiring change: added `paintLiveScenarioHeader()` and `paintLiveDecisionActionCard()` calls — fixes PR-286L step-incoherence defect identified by PR-287L1 audit.
New files: `test-pr-287L2.js` (73 tests, 73/73 pass), `verify-pr-287L2.js` (23 browser checks, 23/23 pass), `docs/pr-287L2-verify/`
Live confirmations: nav→decision are now adjacent (sameParent + immediatelyAfterNav verified); header shows "PR-287L2 Test Live Scenario" + id + "Step 1 of 3" + briefing + model_version; clicking Next advances to "Step 2 of 3" AND live decision options update to step-1 options in same cycle (Alpha/Beta/Gamma); 6 mock cards collapsed by default; toggle reveals them; #pra-card Approve button now inside secondary section; W3 dry-run + AMBER still hidden; Scenario Source intact; zero backend calls; zero console errors.
DOM order verified in browser: hdr@39800 < nav@41135 < live-dec@43005 < meta@45168. All previous (PR-280–287L0) tests still pass.

## PR-286L0 Status: COMPLETE (2026-05-29) — Browser verified 22/22 + 96/96 unit tests
Live Scenario Import Baseline. First real load path into window.RmoozScenario.
Files changed: `UI_MOdified/client/app.html` (+30 lines: new `#sw-live-scenario-import-card` as first subcard inside `#sw-scenario-source-section`, before decision package card), `UI_MOdified/client/shell/scenario-workspace.js` (+~260 lines: `_LIVE_IMPORT_UNSAFE_KEYS` blacklist, `validateLiveScenarioJson`, `loadLiveScenarioFromJson`, `getCurrentLiveScenarioSummary`, `initLiveScenarioImport`, +4 exports, +1 init call), `UI_MOdified/client/i18n.js` (relabel `sw-src-local-title`/`-subtitle` to "Decision Package Import" + clarifying subtitle, +11 EN + 11 AR new live-import keys), `UI_MOdified/client/style.css` (+25 lines green-themed import card styling)
New exports: `validateLiveScenarioJson`, `loadLiveScenarioFromJson`, `getCurrentLiveScenarioSummary`, `initLiveScenarioImport`
Validation: rejects null/non-object/missing-empty steps, rejects unsafe fields anywhere (scenario_compressed/Scenario_Compressed/compressed/compressedPayload/lua/script/scripts/execute/executeNow/applyNow/commitNow/gate7Approved/backendUrl/fetchUrl/apiUrl/urlToFetch/storageKey/localStorage/sessionStorage/indexedDB), rejects liveMutationAllowed:true / backendCommitAllowed:true, requires each step to have at least one of id/step_id/title/phase/time_label/narrative/situation/decision_point_baseline/objective_status_baseline/actors/affected.
Normalisation: deep-copies input, fills scenario_id from scenario_id||id||name||"imported-live-scenario", fills scenario_label from scenario_label||title||name||scenario_id, warns NO_COORDINATE_TABLES / NO_DECISION_OPTIONS_IN_ANY_STEP / SCENARIO_ID_FALLBACK_USED / STEPS_LACK_TITLES_AND_PHASES.
Load flow: validate → on success, clear `_liveOperatorWorkflowState.selections` (scenario-scoped reset), `window.RmoozScenario = { scenario: deep-copy, stepIndex: 0 }`, call `AppShellScenarioWorkspace.refresh()`. On failure, NEVER touches `window.RmoozScenario`.
New files: `test-pr-286L0.js` (96 tests, 96/96 pass), `verify-pr-286L0.js` (22 browser checks, 22/22 pass), `docs/pr-286L0-verify/`
Browser-verified flow: uploaded test JSON via FileReader → "Import successful" status → header shows "PR-286L0 Import Test Scenario" + "pr286L0-import-test" + "Step 1 of 3" + briefing → live decision shows step-0 options [Hold position, Advance] → Select → recorded under key `pr286L0-import-test::step-0` → Next → header "Step 2 of 3" + step-1 options [Alpha plan, Beta plan] in same cycle → window.RmoozScenario fully replaced (stepCount:3, modelVer:286L0-v1) → W3 dry-run + AMBER + W3 load bar still hidden → external catalog untouched → zero backend calls → zero console errors.
Decision Package Import clearly relabeled (was "Local JSON Package").

## PR-286L1 Status: COMPLETE (2026-05-29) — Browser verified 24/24 + 81/81 unit tests
Scenario Folder Import Intake. Operator picks a local folder, app classifies files locally, then imports one selected JSON via PR-286L0's loadLiveScenarioFromJson.
Files changed: `UI_MOdified/client/app.html` (+50 lines: folder intake controls inside `#sw-live-scenario-import-card`), `UI_MOdified/client/shell/scenario-workspace.js` (+~430 lines: `_liveScenarioFolderScanState`, 5 new helpers, +5 exports, +1 init wire), `UI_MOdified/client/i18n.js` (+17 EN + 17 AR keys), `UI_MOdified/client/style.css` (+35 lines)
New exports: `classifyScenarioFolderFile`, `scanScenarioFolderFiles`, `getLiveScenarioFolderScanState`, `importSelectedFolderScenarioJson`, `initLiveScenarioFolderImport`
Classification by extension only — NO content read during scan: .json→importable / .scen→Command binary (NOT importable) / .ini→weapon patch (NOT metadata) / .lua→BLOCKED / pdf/docx/html/htm/rtf/txt→briefing (info only) / png/jpg/jpeg/svg/webp/gif→asset (info only) / other→unsupported_unknown.
Scan summary: totalFiles, jsonCandidates, unsupportedScen, unsupportedIni, blockedLua, briefingDocs, assets, other. Warnings: NO_JSON_CANDIDATES, SCEN_FILES_DETECTED_BUT_NOT_IMPORTABLE, INI_FILES_ARE_WEAPON_PATCHES_NOT_METADATA.
Import flow: user picks folder → Scan → JSON candidates list + unsupported list rendered → user selects one JSON candidate (radio) → Import Selected → FileReader.readAsText → JSON.parse → PR-286L0's loadLiveScenarioFromJson() → live workspace updates.
New files: `test-pr-286L1.js` (81 tests, 81/81 pass), `verify-pr-286L1.js` (24 browser checks, 24/24 pass), `docs/pr-286L1-verify/`
Browser-verified flow: 7-file folder (scenario.json + battle.scen + weapons.ini + startup.lua + briefing.pdf + map-tile.png + README.xyz) → Scan → summary "Total: 7 · JSON candidates: 1 · .scen: 1 · .ini: 1 · lua: 1 · docs: 1 · assets: 1 · other: 1 — Folder scan complete." → JSON candidate listed → all 6 unsupported listed with classifications (lua blocked=true) → select JSON → Import → live header updates to "PR-286L1 Folder Import Test", "pr286L1-folder-test", "Step 1 of 2", briefing → live decision shows [Hold position, Advance] → window.RmoozScenario fully replaced → W3 dry-run + AMBER + W3 load button all still hidden → zero backend calls → zero console errors.
No .scen/.ini/Lua parsing or execution: scan only reads file.name/webkitRelativePath. Import path's `_resolveFolderCandidate` only operates on the JSON-only candidates array, so only JSON files reach `readAsText`.

## PR-286L1A Status: COMPLETE (2026-05-29) — Browser verified 21/21 + 41/41 unit tests
Scenario Source Hub Simplification. DOM reorganization + 1 new toggle. NO new import capability.
Files changed: `UI_MOdified/client/app.html` (+50 lines: `#sw-scenario-source-hub` wraps existing live + decision-package cards into clear primary/advanced/rules structure), `UI_MOdified/client/shell/scenario-workspace.js` (+~30 lines: `initSourceAdvancedImportsToggle`, +1 init wire, +1 export), `UI_MOdified/client/i18n.js` (+11 EN + 11 AR keys), `UI_MOdified/client/style.css` (+25 lines)
New export: `initSourceAdvancedImportsToggle`
New hub structure inside `#sw-scenario-source-section`:
  - `#sw-scenario-source-hub` (NEW parent)
    - `#sw-source-live-primary` — wraps `#sw-live-scenario-import-card` (Live Import + Folder Intake) — VISIBLE by default
    - `#sw-source-import-rules` — 4-rule strip ("Full JSON → Live Import", "Folder → Scan then import selected", "Decision package → Decision Package Import", ".scen/.ini/Lua → detected only")
    - `#sw-source-advanced-imports` with `#sw-source-advanced-toggle` button + `#sw-source-advanced-body` (HIDDEN by default) — contains `#sw-local-json-source-card` (Decision Package Import)
  - `#sw-external-catalog-source-card` — unchanged location (outside hub)
Live Scenario Import is now visually primary; Decision Package Import is collapsed under a "Show advanced imports" toggle.
Browser-verified flow: hub visible, primary visible, Decision Package body hidden by default → toggle click reveals it (aria-expanded=true, button text → "Hide advanced imports") → single-file live import still works (loads "PR-286L1A Single-File Live Import", stepCount=2) → folder import still works (scans 1 JSON candidate, imports "PR-286L1A Folder Live Import", stepCount=3, replaces previous live state) → W3 dry-run + AMBER + W3 load bar all still hidden → External Scenario Catalog still present → zero backend calls → zero console errors.

## PR-286L2 Status: COMPLETE (2026-05-29) — 39/39 verification checks
Scenario Folder Catalog and Conversion Plan. AUDIT / DOCUMENTATION ONLY. No runtime files changed.
Files created: `docs/pr-286L2-scenario-folder-catalog-and-conversion-plan.md` (catalog + lifecycle + canonical target format + adapter priorities + 3-option next-PR recommendation), `test-pr-286L2.js` (39 checks, 39/39 pass)
Cataloged formats: A=RMOOZ Live Scenario JSON (direct import now), B=Decision Packages (DP_01/02/03, preview only), C=Wargame 3 (reference template — already close to canonical contract, only missing decision_options on any step), D=Command .scen/.ini/Lua/docs/assets (detect only, Lua permanently blocked), E=External Scenario Catalog (browsing only).
Conversion matrix has 9 rows × 8 columns. 5 lifecycle routes documented. 5 adapter priorities defined (P1=DP→Live converter, P2=W3 normalizer, P3=GeoJSON→step coords, P4=Command export adapter, P5=briefing reference ingestion).
Canonical target format RMOOZ Live Scenario JSON v1: minimum (scenario_id + scenario_label + steps[]), recommended (rich W3-aligned shape), forbidden everywhere (compressed/lua/script/applyNow/commitNow/executeNow/gate7Approved/backendUrl/liveMutationAllowed:true/backendCommitAllowed:true/selectedDecision/expectedResult/previewComplete:true).
3-option next PR: A=PR-286L3 DP→Live converter, B=PR-286L3W W3 normalizer, C=PR-287L Live Step Status. Author recommendation: Option C (live import is already functional; the live operator workflow itself is the thinnest layer to grow next).
Runtime untouched: app.html, scenario-workspace.js, i18n.js, style.css, app.js, adjudicator-map.js, wargame3.json — all verified unchanged.

## PR-287L Status: COMPLETE (2026-05-29) — Browser verified 23/23 + 92/92 unit tests
Live Step Status Baseline. Per-step operator status (pending/decided/skipped/blocked) stored in-memory only.
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~230 lines: 8 helpers + state field + paint wiring + 6 exports), `UI_MOdified/client/app.html` (+3 regions: status row inside `#sw-live-decision-card`, header chip, nav badge), `UI_MOdified/client/i18n.js` (+11 EN + 11 AR keys), `UI_MOdified/client/style.css` (+1 block, per-status colours)
New module state: `_liveOperatorWorkflowState.stepStatus = {}` (added alongside selections/events; reset on every load). Constants `_LIVE_STEP_STATUS_VALUES`/`_LIVE_STEP_STATUS_DEFAULT='pending'`.
New exports: `getLiveStepKey`, `getLiveStepStatus(stepIndex?)`, `setLiveStepStatus(status, options?)`, `clearLiveStepStatus(stepIndex?)`, `getLiveScenarioStatusSummary`, `paintLiveStepStatusRow`
Key format reuses `_liveOpKey`: `scenarioId + "::step-" + stepIndex`. Record shape: `{recordType:'live_step_status', scenarioId, scenarioLabel, stepIndex, stepId, status, reason, updatedAt, source:'operator', decisionId?, readOnly:true, liveMutationAllowed:false, backendCommitAllowed:false, committed:false, applied:false, stored:true}`.
Status semantics: default pending (synthesized, stored:false); "decided" ONLY via explicit Mark Decided click (safer — not auto-set on selection). setLiveStepStatus auto-links decisionId from any existing live decision selection on that step. clearLiveStepStatus reverts to default pending (deletes record).
UI: status row inside `#sw-live-decision-card` (`#sw-live-step-status-row/badge/actions/reason/summary`); 3 Mark buttons `data-live-step-status="decided|skipped|blocked"` + `#sw-live-step-status-clear-btn`; nav badge `#sw-nav-status-badge`; header chip `#sw-live-scenario-status`. Summary rollup "Decided N · Skipped N · Blocked N · Pending N of T".
Click delegation added to `_initLiveDecisionActionCard`; paint wired into `paintLiveDecisionActionCard` + `paintStepNavigator` + `paintLiveScenarioHeader` (so badge stays coherent on step change AND status change).
New files: `test-pr-287L.js` (92 tests, 92/92 pass), `verify-pr-287L.js` (23 browser checks, 23/23 pass), `docs/pr-287L-verify/`
Browser-verified: status row nested inside live decision card (NOT a new page); default pending; Mark Decided → card+nav+header all read decided + summary "Decided 1"; Mark Skipped/Blocked replace (not add) status; Clear → pending + no stored record; per-step scoping confirmed (step 0 decided, step 1 pending, return to 0 still decided); marking never advances stepIndex; getLiveScenarioStatusSummary counts correct; record readOnly/uncommitted/unapplied; step nav still works; zero backend calls; zero console errors.
Did NOT use Approve/Reject/Hold; did NOT move `#pra-card`. No scenario mutation (only existing in-memory operator state). No backend/storage/Gate 7/Apply/Commit.

## PR-288L Status: COMPLETE (2026-05-29) — Browser verified 25/25 + 83/83 unit tests
Live Operator Event Log. Tabular in-memory ops ledger of operator actions, rendered INSIDE the Scenario Workspace.
Files changed: `UI_MOdified/client/shell/scenario-workspace.js` (+~115 lines: 6 helpers/fns + 3 exports + 1 paint-chokepoint wire), `UI_MOdified/client/app.html` (+~30 lines: `#sw-live-event-log-card` after `#sw-live-decision-card`, inside `#sw-live-workspace`), `UI_MOdified/client/i18n.js` (+21 EN + 21 AR keys), `UI_MOdified/client/style.css` (+1 tabular-ledger block)
New exports: `getLiveOperatorEventLog`, `clearLiveOperatorEventLog`, `paintLiveOperatorEventLog`
Design: derive-at-read-time — `_liveOpEventToLedgerRow` maps the 4 existing `_liveOperatorWorkflowState.events` types (live_decision_selected/cleared, live_step_status_set/cleared) into ledger rows {dtg,severity,severityLabel,category,categoryLabel,source:'operator',sourceLabel,message}. NO new append sites; raw events stay lean. Severity: blocked→warning, skipped→notice, else info. Category: decision_* → decision, status_* → step-status. Message names 1-based step + option id / status label (reuses `_liveStepStatusLabel`).
Columns: DTG / Severity / Category / Source / Message (real `<table>`/`<thead>`/`<tbody id=sw-live-event-log-rows>`). Newest-first. Cap 64. Count line "N of 64 operator events (in memory)". `_liveOpFormatDtg` → "YYYY-MM-DD HH:MM:SSZ".
Clear-log button `#sw-live-event-log-clear-btn` only writes `_liveOperatorWorkflowState.events = []` — scoped to events; does NOT touch selections or stepStatus. Events are NOT reset on scenario load (audit trail); selections + stepStatus ARE reset (scenario-scoped).
Painted at the shared `paintLiveDecisionActionCard` chokepoint (repaints on refresh/goToStep/every action). Reuses [[feedback-event-log-not-chat]] constraint.
New files: `test-pr-288L.js` (83 tests, 83/83 pass), `verify-pr-288L.js` (25 browser checks, 25/25 pass), `docs/pr-288L-verify/`
MEMORY constraint honoured: tabular ledger, NO avatars/bubbles/speaker lanes; global `#event-log` (event-log.js) left fully untouched and verified distinct.
Browser-verified: card nested in #sw-live-workspace after decision card; empty state "0 of 64"; Mark Decided → step-status/info row "Marked step 1 Decided"; option select → decision/info row "Selected decision option OPT-HOLD-0 on step 1" newest-first; Mark Blocked → warning row; Mark Skipped → notice row; 5 cells/row; source "Operator"; DTG timestamp; deep-copy isolation; events survive load while step status resets; Clear-log empties ledger but leaves step status intact; step nav still works; zero backend calls; zero console errors.
No backend/fetch/XHR/storage. No Gate 7. No Apply/Commit/Execute/Go-Live. No scenario/unit/map mutation. No stepIndex advance.

## Next PR
PR-288L is COMPLETE. Next in the live-workflow sprint: PR-289L — Live Step Involved Units Card (read-only step context unit list). Source of truth: window.RmoozScenario.scenario / stepIndex + `_liveOperatorWorkflowState` (in-memory). Same hard boundaries (no backend/storage/Gate 7/Apply/Commit, no scenario/unit/map mutation, no stepIndex advance).
Then PR-290L — Live Data Quality / Readiness Warnings.
Alternatives if explicitly requested: PR-286L3 (DP converter), PR-286L3W (W3 normalizer).
