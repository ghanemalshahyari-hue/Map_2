# Scenario Workspace — Current State Audit

**Date:** 2026-05-28  
**Scope:** Read-only audit only. No code changes.  
**Files examined:** scenario-workspace.js, app.html, adjudicator-hud.js, adjudicator-map.js, scenario-dry-run-fixtures.js, wargame3.json, app.js  

---

## 1. What Scenario Is Active by Default?

### Active Scenario in the Step Navigator and Live Cards

| Field | Value |
|---|---|
| **Scenario name shown** | `"Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)"` |
| **`scenario_id`** | `wargame3` |
| **`scenario_label`** | `"Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)"` |
| **`name`** | `wargame3` |
| **Source file** | `data/scenarios/wargame3.json` |
| **Loaded by** | `adjudicator-hud.js → ensureScenarioLoaded()` fetches `/api/scenario/<name>` |
| **Default constant** | `SCENARIO_DEFAULT = 'wargame3'` (adjudicator-hud.js:20) |
| **Published via** | `publishRmoozScenario()` (adjudicator-hud.js:43) — writes `window.RmoozScenario = { scenario: scenarioCache, stepIndex: trial.stepIndex }` |
| **Consumed by** | All live cards in scenario-workspace.js via `getScenario()` and `getActiveStepIndex()` |

### Is there an "AMBER RIDGE" default?

**Yes, but only in the Dry-Run Preview panel** (`#sw-drp-section`), not in the Step Navigator.

- AMBER RIDGE is the **default** for the `paintDryRunPreview()` function (scenario-workspace.js:9435–9462)
- It is a **static 4-step fictional training fixture** from `scenario-dry-run-fixtures.js`
- It has `fixtureId: 'fixture-amber-ridge-v1'`, `fixtureName: 'Exercise AMBER RIDGE'`
- It is read from `window.RmoozDryRunFixtures.AMBER_RIDGE`
- It is loaded once at init via `paintDryRunPreview()` (init, line 8093)
- It does NOT appear in the Step Navigator

### Answer to "Is it Scenario 3?"

There is NO scenario labeled "Scenario 3" anywhere in the code. The user's observation likely refers to one of:

1. **The `wargame3` scenario** — which is the live scenario loaded by the adjudicator. The scenario dropdown (`#wg-adj-scenario`) lists available scenarios and defaults to `wargame3`. It is "Wargame 3," not "Scenario 3."
2. **The W3-STEP naming in the Dry-Run Preview** — steps are labeled `W3-STEP-00` through `W3-STEP-16`, which may appear as "Step 3" when viewing step index 3 in the nav bar.
3. **The Decision Package fixture `dp03`** — labeled "Urban Evacuation" in the Select fixture dropdown, but it has no "Scenario 3" visible label.

The confusion likely comes from: the Step Navigator shows `"3 / 17"` when on step index 2 (1-based display), which combined with the `wargame3` scenario name makes it look like "Scenario 3 step 3." No code creates a label "Scenario 3."

---

## 2. Step Navigator Audit

The **Step Navigator** (`#sw-nav-card`) is the visible card titled "Step Navigator." There is also a **Walkthrough Preview** navigator (`#sw-wt-card`) inside the Live Walkthrough card.

### Step Navigator (`#sw-nav-card`)

| Property | Value |
|---|---|
| **DOM ID** | `#sw-nav-card` |
| **Title shown** | `"Step Navigator"` |
| **Counter element** | `#sw-nav-counter` (shows `"N / Total"`) |
| **Step info element** | `#sw-nav-step-info` (shows `step.time_label`) |
| **Phase badge** | `#sw-nav-phase-badge` (shows `step.phase`) |
| **Phase-of label** | `#sw-nav-phase-of` (shows "Step N of M in PHASE") |
| **Paint function** | `paintStepNavigator()` (scenario-workspace.js:724) |
| **Nav handler function** | `initStepNavigator()` (wired at init, line 8087) |
| **Previous/Next handler** | `goToStep(newIdx)` (scenario-workspace.js:699) |
| **Scenario data read** | `window.RmoozScenario.scenario.steps[]` via `getScenario()` / `getActiveStepIndex()` |
| **Step ref system** | Numeric index (0-based), stored as `window.RmoozScenario.stepIndex` |
| **Writes to** | `window.RmoozScenario.stepIndex` (the **only** allowed write, line 705) |
| **Does it mutate scenario object?** | **No** — only `stepIndex` integer is updated |
| **Does it change the map?** | **Yes** — calls `paintScenarioOverlay()` which rebuilds `_swScenarioOverlay` L.layerGroup with unit dots |
| **Does it change Wargame 3 preview?** | **No** — Dry-Run Preview panel is separate |
| **Does it change external scenario preview?** | **No** — external catalog panel is separate |
| **Mode** | **Live-state navigation** — controls the active step shown across all live cards |
| **Scenario connected to** | **`wargame3`** — whatever is in `window.RmoozScenario`, i.e., the scenario loaded by adjudicator-hud.js |

#### Step Navigator Controls

| Button | DOM ID | Handler | Effect |
|---|---|---|---|
| `◀◀` Jump to start | `#sw-nav-first` | `goToStep(0)` | Sets `stepIndex = 0`, repaints all live cards + map overlay |
| `◀` Previous | `#sw-nav-prev` | `goToStep(curIdx - 1)` | Steps back one |
| `▶` Next | `#sw-nav-next` | `goToStep(curIdx + 1)` | Steps forward one |
| `▶▶` Jump to end | `#sw-nav-last` | `goToStep(steps.length - 1)` | Sets to last step |
| `▶ Play` | `#sw-nav-play` | `startPlayback()` / `stopPlayback()` | Timed auto-advance |
| Speed select | `#sw-nav-speed` | Sets `_swPlayInterval` delay | 300 / 800 / 2000 / 4000 ms |
| Show/Hide unit overlay | `#sw-nav-overlay-toggle` | Toggles `_swOverlayEnabled`, calls `paintScenarioOverlay()` | Shows/hides L.layerGroup unit dots on map |

#### Live Walkthrough Preview Navigator (`#sw-wt-card` inside #sw-wt-controls)

This is a **second, separate** navigator inside the Walkthrough card. It controls a **preview-only step offset** (`previewStepIndex`) separate from the live `RmoozScenario.stepIndex`.

| Button | DOM ID | Effect |
|---|---|---|
| `◀` | `#sw-wt-ctrl-prev` | Decrements `previewStepIndex` (in-memory only, does not write to `window.RmoozScenario`) |
| `▶` | `#sw-wt-ctrl-next` | Increments `previewStepIndex` (in-memory only) |
| Reset to live | `#sw-wt-ctrl-reset` | Clears `previewStepIndex = null`, reverts display to live step |

This walkthrough preview navigator **does not change `window.RmoozScenario.stepIndex`** and does not affect the Step Navigator counter.

---

## 3. Full Scenario Workspace Section Map

The page `#scenario-workspace-panel` contains the following sections in order from top to bottom:

### GROUP A — Current Workflow / Wargame 3 Dry-Run Preview

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? | Mutates State? | Affects Map? |
|---|---|---|---|---|---|---|---|---|
| A1 | "Current Workflow — Wargame 3 Preview" (section header) | `.sw-w3-section-hdr` | Labels the W3 dry-run block | Static label | B. Wargame 3 dry-run | Yes | No | No |
| A2 | "Load Wargame 3 Preview" (button bar) | `#sw-w3-load-bar` | Button to build W3 fixture from loaded scenario and render preview step 0 | `window.RmoozScenario.scenario` (read-only copy) | B. Wargame 3 dry-run | Yes | No | Yes (via `paintWargame3PreviewMapOverlayFromPreview`) |
| A3 | "Dry-run preview navigation" (nav label) | `.sw-drp-nav-section-label` | Static label for the DRP nav bar above the preview content | Static | B. Wargame 3 dry-run | Yes | No | No |
| A4 | Dry-Run Preview Nav Bar (Prev/Next/Info) | `#sw-drp-nav` | Step navigation for Wargame 3 dry-run preview only | `_drpPreviewSource.steps[]`, `_drpPreviewStepRef` | B. Wargame 3 dry-run | Yes | No — updates `_drpPreviewStepRef` in-memory only | Yes (W3 preview overlay) |
| A5 | Jump selector | `#sw-drp-jump-row` / `#sw-drp-jump-select` | Jump to any W3 step in preview | Same as above | B. Wargame 3 dry-run | Yes | No | Yes |
| A6 | W3 Context Badge | `#sw-drp-w3-context` | Shows "Wargame 3 · Dry-Run Preview · Read-only" when W3 is active | Static | B. Wargame 3 dry-run | Yes | No | No |
| A7 | Step Summary chips | `#sw-drp-step-summary` | W3-only compact step summary (focus, obj chip, effects chip, COA chip) | Preview object | B. Wargame 3 dry-run | Yes | No | No |
| A8 | Preview Event Log | `#sw-drp-event-log` | W3-only derived event rows from preview + warnings | Preview object | B. Wargame 3 dry-run | Yes | No | No |
| A9 | Read-only COA Options | `#sw-drp-decision-options` | W3-only read-only COA cards (hidden unless fixture injects them) | Preview.decisionOptions | B. Wargame 3 dry-run | Yes | No | No |
| A10 | Operator Selection Review | `#sw-drp-selection-review` | W3-only dry-run COA selection with "approve_dry_run / reject / hold" buttons | `_w3CoaReviewRecord` (in-memory) | B. Wargame 3 dry-run | Yes (display) | In-memory `_w3CoaReviewRecord` only | No |
| A11 | Dry-Run Preview content fields | `#sw-drp-section` (scroll body) | Shows fixture, step, situation, decision, result, units, objectives, effects, warnings, status, safety | AMBER RIDGE or W3 preview object | A+B (AMBER RIDGE default / W3 override) | Yes | No | Yes (W3 overlay) |
| A12 | Bottom Nav Mirror | `#sw-drp-bottom-nav` | Duplicate of top nav bar — W3 only | Same as A4 | B. Wargame 3 dry-run | Yes | No | No |

---

### GROUP B — Current Scenario (Live Cards)

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? | Mutates State? | Affects Map? |
|---|---|---|---|---|---|---|---|---|
| B1 | "Current Scenario" (card) | Inside `.sw-card` | Shows name, status, phase, blue force, red force, terrain | `window.RmoozScenario` | A. Live/current scenario | Yes | No | No |
| B2 | "Scenario Metadata" | `#sw-meta-card` | Shows scenario_label, step count, phase count, bbox, schema variant | `window.RmoozScenario.scenario` | A. Live/current scenario | Yes | No | No |
| B3 | "Scenario Briefing" | `#sw-brfg-card` | Shows purpose, end_state, constraints, assumptions, source | `window.RmoozScenario.scenario` | A. Live/current scenario | Yes | No | No |
| B4 | "Live scenario navigation" (section header) | `.sw-live-nav-hdr` | Label strip warning "These controls may change the live scenario step." | Static | A. Live navigation label | Yes | No | No |
| B5 | **"Step Navigator"** | `#sw-nav-card` | **THE live step navigator** — navigates `window.RmoozScenario.stepIndex` | `window.RmoozScenario` | A. Live/current scenario | No — changes stepIndex | `window.RmoozScenario.stepIndex` | Yes (unit overlay) |

---

### GROUP C — Scenario Timeline (Live)

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? | Mutates State? | Affects Map? |
|---|---|---|---|---|---|---|---|---|
| C1 | "Scenario Timeline" (section header) | `.sw-timeline-hdr` | Label strip: "Read-only walkthrough of the loaded scenario steps." | Static | A. Live | Yes | No | No |
| C2 | **"Live Walkthrough"** | `#sw-wt-card` | Step-by-step display of live/preview step data. Contains its own Prev/Next preview controls, comparison strip, data health badge, and walkthrough fields | `window.RmoozScenario` | A. Live/current scenario | Mostly yes. Preview controls use in-memory `previewStepIndex` only | `previewStepIndex` (in-memory, not persisted) | No |
| C3 | "Step Summary Card" | `#sw-sps-card` | Compact step summary (step, time, phase, decision point, objective) | `window.RmoozScenario` (active step) | A. Live | Yes | No | No |
| C4 | "Narrative" | `#sw-sn-card` | Narrative / situation text for active step | `window.RmoozScenario` step.narrative | A. Live | Yes | No | No |
| C5 | "Force Ratio" | `#sw-fr-card` | Force ratio, early warning, phase line, objective for active step | `window.RmoozScenario` step | A. Live | Yes | No | No |
| C6 | "Decision Point" | `#sw-dp-card` | Decision point question for active step | `window.RmoozScenario` step | A. Live | Yes | No | No |

---

### GROUP D — Objective, BLS, Force Snapshots (Live)

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? |
|---|---|---|---|---|---|---|
| D1 | "Objective Snapshot" | `#sw-obj-card` | Objective name, depth, CARVER score, coordinate | `window.RmoozScenario` scenario.obj | A. Live | Yes |
| D2 | "BLS Snapshot" | `#sw-bls-card` | Beach Landing Site entries | `window.RmoozScenario` scenario | A. Live | Yes |
| D3 | "Force Balance" | `#sw-fs-card` | Blue/Red unit counts + ratio | `window.RmoozScenario` scenario | A. Live | Yes |
| D4 | "Blue Force Snapshot" | `#sw-bf-card` | Blue unit list (first N, +more) | `window.RmoozScenario` scenario | A. Live | Yes |
| D5 | "Red Force Snapshot" | `#sw-rf-card` | Red unit list (first N, +more) | `window.RmoozScenario` scenario | A. Live | Yes |

---

### GROUP E — Operator State (Live Status Mirrors)

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? |
|---|---|---|---|---|---|---|
| E1 | "Operator State" (card) | Inline `.sw-card` | Last operator decision, Safety state chip, Proposal Service chip | `AppShellAIProposalDecisionJournal`, event listeners | A. Live status mirrors | Yes |
| E2 | "Scenario Phase Timeline" | `#spt-card` | In-memory hardcoded PHASES list (Briefing→Planning→Proposal Review→Decision→Dryrun Preview→AAR) | **Hardcoded `PHASES` array in JS** — NOT from live scenario | F. Old/unclear — static placeholder | Yes |

---

### GROUP F — Proposal Workflow (Preview-Only Mock Cards)

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? | Mutates State? |
|---|---|---|---|---|---|---|---|
| F1 | "Operator Intent Draft" | `#oid-card` | Draft fields wired to live scenario step when available; i18n fallbacks otherwise | `window.RmoozScenario` (live keys) + i18n fallbacks | A+Mock hybrid | Yes | No |
| F2 | "AI Proposal Preview" | `#apc-card` | Mock proposal card — all values are i18n static strings except "linked-intent" which reads live phase | i18n fallbacks + live phase | F. Mock preview placeholder | Yes | No |
| F3 | "Proposal Review" | `#pra-card` | Approve/Reject/Hold buttons — UI-only, sets in-memory `praSelection` only | None (UI-only) | F. Mock preview placeholder | No actual effect — display only | In-memory `praSelection` only |
| F4 | "Decision Preview Summary" | `#dps-card` | Mirrors `praSelection` into a summary card | `praSelection` (in-memory) | F. Mock preview placeholder | Yes | No |

---

### GROUP G — Map Diagnostics

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? | Affects Map? |
|---|---|---|---|---|---|---|---|
| G1 | "Unit Layout Diagnostics" | `#uild-card` | Measures unit overlap at current zoom — button-triggered, result cleared on reload | `window.units` / `window.map` (read-only scan) | E. Diagnostics | Yes | No — reads only |

---

### GROUP H — Decision Package (Local Import)

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? | Mutates State? | Affects Map? |
|---|---|---|---|---|---|---|---|---|
| H1 | Sample Loader Bar | `#sw-dp-loader-row` | Load sample package (synthetic) or select dp01/dp02/dp03 built-in fixture | Hardcoded fixtures in JS | C. Local JSON package | Yes | `_swDecisionPackage` in-memory only | No |
| H2 | "Decision Package" (manifest card) | `#sw-dp-manifest-card` | Shows loaded manifest: name, version, classification, team, date, steps | `_swDecisionPackage.manifest` | C. Local JSON package | Yes | No | No |
| H3 | "Step Decision" | `#sw-dp-step-card` | Active step: objective, decision point, selected decision, status, confidence, units count | `_swDecisionPackage.steps[activeStep]` | C. Local JSON package | Yes | No | No |
| H4 | "Step Units" | `#sw-dp-units-card` | Unit table for active imported step | `_swDecisionPackage.steps[activeStep].units[]` | C. Local JSON package | Yes | No | No |
| H5 | "Source Trace" | `#sw-dp-source-card` | Package source, validation status, warning count, active step source, source_trace state | `_swDecisionPackage` | C. Local JSON package | Yes | No | No |
| H6 | "Imported Step List" | `#sw-dpkg-step-list-card` | Table of all imported steps: index, time, phase, objective, confidence, units, source | `_swDecisionPackage.steps[]` | C. Local JSON package | Yes | No | No |
| H7 | "Import Diagnostics" (collapsible) | `#sw-dpkg-diagnostics` | Contains: Import Validation, Step Index Warning, Package Readiness, Imported Step Details, Source Trace Review, Staging Readiness | `_swDecisionImportValidation`, `_swDecisionPackage` | E. Diagnostics | Yes | No | No |

---

### GROUP I — Scenario Source Section (PR-283)

| # | Visible Title | DOM ID | Purpose | Source Data | System | Read-Only? | Mutates State? | Affects Map? |
|---|---|---|---|---|---|---|---|---|
| I1 | "Scenario Source" (section header) | `#sw-scenario-source-section` | Groups subcards A+B | Static | C+D grouping container | Yes | No | No |
| I2 | "Local JSON Package" (subcard A) | `#sw-local-json-source-card` | File picker + Import JSON locally button — reads local files into `_swDecisionPackage` | User-selected local .json files | C. Local JSON package | No (imports) | `_swDecisionPackage` in-memory only | No |
| I3 | "External Scenario Catalog" (subcard B) | `#sw-external-catalog-source-card` | External Scenario Selector (`#sw-ext-select-control`) + Source Trace Inspector + injected `#sw-ext-preview-section` | `_externalScenarioCatalogSubset` | D. External scenario catalog | Yes | `_externalScenarioCatalogSubset` in-memory only | No |

---

## 4. Button/Control Audit

### Step Navigator Controls

| Label | DOM ID | Handler | Does | Reads | Writes | Changes Live Scenario? | Changes Map? | Storage/Fetch? | Safe? |
|---|---|---|---|---|---|---|---|---|---|
| `◀◀` Jump to start | `#sw-nav-first` | `goToStep(0)` | Sets stepIndex=0, repaints all live cards | `window.RmoozScenario` | `window.RmoozScenario.stepIndex` | **Yes — changes live stepIndex** | Yes (overlay) | No | Guarded |
| `◀` Previous | `#sw-nav-prev` | `goToStep(cur-1)` | Steps back one | Same | Same | **Yes** | Yes | No | Guarded |
| `▶` Next | `#sw-nav-next` | `goToStep(cur+1)` | Steps forward one | Same | Same | **Yes** | Yes | No | Guarded |
| `▶▶` Jump to end | `#sw-nav-last` | `goToStep(len-1)` | Goes to last step | Same | Same | **Yes** | Yes | No | Guarded |
| `▶ Play` / `⏸ Pause` | `#sw-nav-play` | `startPlayback()` / `stopPlayback()` | Timed auto-advance or pause | `window.RmoozScenario`, `_swIsPlaying` | `_swIsPlaying`, then `window.RmoozScenario.stepIndex` | **Yes** | Yes | No | Guarded |
| Speed selector | `#sw-nav-speed` | Sets `_swPlayInterval` | Changes auto-advance interval | Current value | None (CSS/display) | No | No | No | Safe |
| Show/Hide unit overlay | `#sw-nav-overlay-toggle` | Toggles `_swOverlayEnabled` | Shows/removes L.layerGroup dots on map | `_swOverlayEnabled` | `_swOverlayEnabled` | No | **Yes** | No | Safe |

### Dry-Run Preview Navigation (Wargame 3 only)

| Label | DOM ID | Handler | Does | Reads | Writes | Changes Live Scenario? | Changes Map? | Storage/Fetch? |
|---|---|---|---|---|---|---|---|---|---|
| `◀` Prev (top) | `#sw-drp-prev-btn` | `doPrev()` | Decrements W3 step ref, calls `buildScenarioStepPreview` + `paintDryRunPreview` | `_drpPreviewSource`, `_drpPreviewStepRef` | `_drpPreviewStepRef` (in-memory only) | **No** | Yes (W3 preview overlay only) | No |
| `▶` Next (top) | `#sw-drp-next-btn` | `doNext()` | Increments W3 step ref | Same | Same | **No** | Yes | No |
| `◀` Prev (bottom) | `#sw-drp-prev-bottom-btn` | `doPrev()` | Same as top | Same | Same | **No** | Yes | No |
| `▶` Next (bottom) | `#sw-drp-next-bottom-btn` | `doNext()` | Same as top | Same | Same | **No** | Yes | No |
| Jump selector | `#sw-drp-jump-select` | `change` → `buildScenarioStepPreview` + `paintDryRunPreview` | Jumps to selected W3 step | `_drpPreviewSource`, selected option | `_drpPreviewStepRef` (in-memory only) | **No** | Yes | No |
| "Load Wargame 3 Preview" | `#sw-w3-load-btn` | `buildW3PreviewFromLoadedScenario()` + `paintWargame3Preview(..., 'W3-STEP-00')` | Reads live scenario, adapts to W3 fixture, paints step 0 preview | `window.RmoozScenario.scenario` (read-only copy) | `_drpPreviewSource`, `_drpPreviewStepRef`, `_drpPreviewMode` (in-memory) | **No** | Yes | No |
| "Clear review" | `#sw-drp-selection-review-clear-btn` | `_clearW3CoaReviewRecord()` | Clears in-memory COA review | `_w3CoaReviewRecord` | Clears `_w3CoaReviewRecord` | No | No | No |

### COA / Operator Review (W3 Dry-Run Preview, in-memory)

| Label | DOM ID | Handler | Does | Live Scenario? | Storage? |
|---|---|---|---|---|---|
| COA option click | `.sw-drp-do-card` (each) | Stores `_w3CoaReviewRecord` with `approve_dry_run` | Records in-memory dry-run COA selection | **No** | **No** |
| Approve (PRA) | `#pra-btn-approve` | Sets `praSelection = 'approve'` | In-memory only, no record, no commit | **No** | **No** |
| Reject (PRA) | `#pra-btn-reject` | Sets `praSelection = 'reject'` | Same | **No** | **No** |
| Hold (PRA) | `#pra-btn-hold` | Sets `praSelection = 'hold'` | Same | **No** | **No** |

### Decision Package Controls

| Label | DOM ID | Handler | Does | Storage/Fetch? | Live Scenario? | Map? |
|---|---|---|---|---|---|---|
| Load sample package | `#sw-dpkg-load-sample` | `loadSamplePackage()` | Loads hardcoded synthetic 3-step package into `_swDecisionPackage` | No | No | No |
| Clear sample | `#sw-dpkg-clear-sample` | Clears `_swDecisionPackage` | Resets Decision Package cards to hidden/empty | No | No | No |
| Select fixture | `#sw-dpkg-fixture-select` | Sets fixture selection (dp01/dp02/dp03) | No action until "Load fixture" | No | No | No |
| Load fixture | `#sw-dpkg-load-fixture` | `loadSelectedFixture()` | Loads selected fixture into `_swDecisionPackage` | No | No | No |
| Manifest JSON (file input) | `#sw-dpkg-manifest-input` | — | Opens file picker — no read yet | No | No | No |
| Step JSON files (file input) | `#sw-dpkg-steps-input` | — | Opens multi-file picker — no read yet | No | No | No |
| Import JSON locally | `#sw-dpkg-import-json` | `initDecisionPackageJsonImporter()` click handler | FileReader reads local .json files into memory, calls `importDecisionPackageJson()` | **FileReader only** — no upload, no fetch | No | No |
| Import Diagnostics toggle | `#sw-dpkg-diagnostics-toggle` | `initImportDiagnosticsToggle()` | Expands/collapses diagnostics body | No | No | No |
| Run diagnostics | `#uild-run-btn` | Runs unit overlap scan | Scans `window.units` + `window.map` geometry — read-only | No | No | No |

### External Scenario Catalog Controls

| Label | DOM ID | Handler | Does | Live Scenario? | Map? | Storage/Fetch? |
|---|---|---|---|---|---|---|
| External Scenario Selector | `#sw-ext-select-control` | `initExternalScenarioCatalogSelector()` change listener | On change, calls `setExternalScenarioPreviewEntry(entry)` to paint preview fields | No | No | No |

---

## 5. Scenario Systems Currently Mixed in the Page

The Scenario Workspace currently contains **five distinct scenario systems** coexisting in one panel:

### System A — Live/Current RMOOZ Scenario (wargame3)
- **Where:** Step Navigator (`#sw-nav-card`), Current Scenario card, Metadata card, Briefing card, Walkthrough card, and all live step cards (Narrative, Force Ratio, Decision Point, Objective, BLS, Force Snapshots)
- **Functions:** `goToStep()`, `paintStepNavigator()`, `paintScenarioOverview()`, `paintBriefingCard()`, `paintMetaCard()`, `paintWalkthroughCard()`, `paintActionsCard()`, `paintStepSummaryCard()`, `paintNarrativeCard()`, `paintDecisionPointCard()`, `paintForceRatioCard()`, `paintScenarioOverlay()`
- **Connected:** Yes — all read `window.RmoozScenario`
- **Should stay in Scenario Workspace:** Yes — this is the primary live view

### System B — Wargame 3 Dry-Run Preview
- **Where:** Top section with header "Current Workflow — Wargame 3 Preview", button `#sw-w3-load-btn`, dry-run preview panel `#sw-drp-section`, W3 context badge, step summary chips, event log, COA options, operator selection review, and bottom nav bar
- **Functions:** `paintWargame3Preview()`, `paintDryRunPreview()`, `buildScenarioStepPreview()`, `adaptWargame3ToFixture()`, `buildW3PreviewFromLoadedScenario()`, `_initW3LoadButton()`, `_initDrpNavButtons()`, `paintWargame3PreviewMapOverlayFromPreview()`
- **Connected:** Isolated from System A — reads `window.RmoozScenario.scenario` as a read-only source for adapter input; outputs to `_drpPreviewSource` (frozen fixture) and `_drpPreviewStepRef`
- **Should stay in Scenario Workspace:** Yes, but needs clearer "Dry-Run Preview" section label

### System B' — AMBER RIDGE Default (Dry-Run Preview fallback)
- **Where:** `#sw-drp-section` — shown before any W3 load button is clicked
- **Functions:** `paintDryRunPreview()` default path — loads `window.RmoozDryRunFixtures.AMBER_RIDGE` automatically on init
- **Connected:** Isolated — uses `scenario-dry-run-fixtures.js` static fixture only
- **Note:** AMBER RIDGE is currently the **default state** of the dry-run preview panel. It is a fictional 4-step training scenario with no connection to wargame3.

### System C — Local JSON Package Import (Decision Package)
- **Where:** "Scenario Source" section → "Local JSON Package" subcard (`#sw-local-json-source-card`); Decision Package cards (`#sw-dp-manifest-card`, `#sw-dp-step-card`, `#sw-dp-units-card`, `#sw-dp-source-card`); Sample loader bar (`#sw-dp-loader-row`); Import Diagnostics (`#sw-dpkg-diagnostics`)
- **Functions:** `importDecisionPackageJson()`, `normaliseDecisionPackage()`, `paintDecisionPackageCards()`, `initDecisionPackageJsonImporter()`, `initDecisionPackageSampleLoader()`
- **Connected:** Isolated — reads from local file picker only; paints to separate `#sw-dp-*` cards; does NOT affect System A
- **Should stay in Scenario Workspace:** Yes, but should be clearly labeled as "Local JSON Package / Decision Package Preview"

### System D — External Scenario Catalog
- **Where:** "Scenario Source" section → "External Scenario Catalog" subcard (`#sw-external-catalog-source-card`) with `#sw-ext-select-control`, injected `#sw-ext-preview-section`, and `#sw-ext-trace-section`
- **Functions:** `initExternalScenarioCatalogSelector()`, `setExternalScenarioCatalogSubset()`, `paintExternalScenarioCatalogSelector()`, `paintExternalScenarioPreviewEntry()`, `buildExternalScenarioCatalog()`, `buildExternalScenarioCatalogFromManifest()`
- **Connected:** Isolated — catalog is populated externally (e.g., `scen-catalog-contract.js`); selector is wired but catalog must be injected via `setExternalScenarioCatalogSubset()`; currently **disabled** (selector starts `disabled`, no catalog loaded by default)
- **Should stay in Scenario Workspace:** Yes, grouped under "Scenario Source" (already done in PR-283)

### System E — Diagnostics / Staging
- **Where:** Import Diagnostics block (`#sw-dpkg-diagnostics`) containing: Import Validation, Step Index Warning, Package Readiness, Imported Step Details, Source Trace Review, Staging Readiness; Unit Layout Diagnostics (`#uild-card`)
- **Functions:** `buildImportValidationSummary()`, `validateStagingCandidate()`, `paintStagingReadiness()`, `paintImportValidation()`, `paintReadinessChecklist()`
- **Connected:** References System C data only; Staging Readiness calls `validateStagingCandidate()` on the imported Decision Package step
- **Should stay in Scenario Workspace:** Possibly — collapse under "Import & Staging Diagnostics" heading

### System F — Mock/Placeholder Cards
- **Where:** Scenario Phase Timeline (`#spt-card` — hardcoded PHASES array), Operator Intent Draft (`#oid-card` — mix of live + i18n fallback), AI Proposal Preview (`#apc-card` — all mock), Proposal Review (`#pra-card` — in-memory only), Decision Preview Summary (`#dps-card` — mirrors praSelection)
- **Functions:** `paintPhaseTimeline()`, `paintIntentCard()`, `paintProposalCard()`, `paintProposalActions()`, `paintDecisionSummary()`
- **Connected:** `#oid-card` partially wired to System A (live phase, objective, etc.); rest are mock/in-memory
- **Should stay in Scenario Workspace:** Needs review — some are useful, some are stale placeholders

---

## 6. What Is "Scenario 3"?

**There is no control, label, variable, fixture, or data source named "Scenario 3" in the codebase.**

What likely caused the user's observation:

1. **The scenario named `wargame3`** — this is the live default scenario. Its `scenario_label` is `"Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)"`. The Step Navigator counter shows `"N / 17"`, and when on step index 2 it shows `"3 / 17"`, which reads visually as "3 / 17."

2. **The W3-STEP step refs** — Wargame 3 dry-run preview steps are labeled `W3-STEP-00` through `W3-STEP-16`. The jump select label format is `"Step N / 17 — W3-STEP-NN"`.

3. **The `dp03` fixture** — in the Select Fixture dropdown there is an option labeled "Urban Evacuation" with value `dp03`. That is the third fixture (`dp01`, `dp02`, `dp03`), not "Scenario 3."

4. **No "Scenario 3" appears anywhere in:**
   - i18n.js key names
   - scenario-workspace.js strings
   - app.html text
   - scenario-dry-run-fixtures.js
   - wargame3.json

**Conclusion:** "Scenario 3" is not a real entity. The user is likely observing the Step Navigator showing `wargame3` at step 3 (display `"3 / 17"`), or possibly seeing the W3 dry-run preview panel with a W3-STEP-03 step selected. The label confusion comes from the lack of clear section headings distinguishing the two navigators.

---

## 7. Data-Flow Diagram

### Flow A — Live Step Navigator (affects active scenario step)

```
#sw-nav-prev / #sw-nav-next / #sw-nav-first / #sw-nav-last
  → goToStep(newIdx)
    → window.RmoozScenario.stepIndex = newIdx   [only write]
    → paintStepNavigator()       → #sw-nav-card DOM
    → paintScenarioOverview()    → #sw-name, #sw-status, #sw-phase
    → paintPhaseTimeline()       → #spt-phase-list
    → paintIntentCard()          → #oid-kv-list
    → paintProposalCard()        → #apc-kv-list
    → paintStepSummaryCard()     → #sw-sps-*
    → paintNarrativeCard()       → #sw-sn-body
    → paintDecisionPointCard()   → #sw-dp-*
    → paintForceRatioCard()      → #sw-fr-*
    → paintWalkthroughCard()     → #sw-wt-*
    → paintActionsCard()         → #sw-act-*
    → paintScenarioOverlay()     → _swScenarioOverlay L.layerGroup on window.map
    → paintDecisionPackageCards() → #sw-dp-manifest-card etc. (synced to Decision Package)
```

### Flow B — Wargame 3 Dry-Run Preview (does NOT affect live scenario)

```
#sw-w3-load-btn click
  → buildW3PreviewFromLoadedScenario()
    reads window.RmoozScenario.scenario (read-only deep copy)
    → adaptWargame3ToFixture(w3json)
      → deep-frozen fixture object
    → paintWargame3Preview(w3json, 'W3-STEP-00')
      → previewWargame3Fixture(w3json, stepRef)
        → buildScenarioStepPreview(fixture, stepRef)
          → preview object (frozen)
      → paintDryRunPreview(preview)
        → _paintToDOM(preview)
          → setText('sw-drp-*', ...)   [DOM only]
          → paintWargame3PreviewMapOverlayFromPreview(preview)  [W3 map overlay]
      → _drpPreviewSource  = result.fixture   [module-private state]
      → _drpPreviewStepRef = 'W3-STEP-00'
      → _drpPreviewMode    = 'wargame3'
      → _updateDrpNavButtons()

#sw-drp-prev-btn / #sw-drp-next-btn / #sw-drp-jump-select
  → doPrev() / doNext() / jump handler
    → buildScenarioStepPreview(_drpPreviewSource, nextRef)
    → paintDryRunPreview(result.preview)
    → _drpPreviewStepRef = nextRef   [in-memory only]
    → _updateDrpNavButtons()
```

### Flow C — Local JSON Package Import

```
User selects files in #sw-dpkg-manifest-input + #sw-dpkg-steps-input
#sw-dpkg-import-json click
  → readJsonFile(manifestFile) + readJsonFiles(stepFiles)  [FileReader — no upload]
    → importDecisionPackageJson(manifestData, stepsData)
      → adaptDecisionPackageFixture(...)
      → normaliseDecisionPackage(manifest, steps)
      → _swDecisionPackage = pkg        [in-memory module state]
      → _swDecisionSteps = pkg.steps
      → buildImportValidationSummary(...)
      → paintDecisionPackageCards()     [reveals #sw-dp-manifest-card etc.]
```

### Flow D — External Scenario Catalog Selector

```
[External code calls window.AppShellScenarioWorkspace.setExternalScenarioCatalogSubset(catalog)]
  → setExternalScenarioCatalogSubset(catalog)
    → _externalScenarioCatalogSubset = catalog    [in-memory]
    → paintExternalScenarioCatalogSelector(catalog)
      → populates #sw-ext-select-control options

#sw-ext-select-control change
  → initExternalScenarioCatalogSelector() handler
    → entry = find entry in _externalScenarioCatalogSubset
    → setExternalScenarioPreviewEntry(entry)
      → paintExternalScenarioPreviewEntry(entry)   [#sw-ext-preview-section]
      → paintExternalScenarioSourceTrace(entry)    [#sw-ext-trace-body]
```

---

## 8. Safety and Mutation Audit

### Controls That Mutate Live Scenario State

| Control | What it writes | Category |
|---|---|---|
| Step Navigator buttons (◀◀ ◀ ▶ ▶▶) | `window.RmoozScenario.stepIndex` | **Live state mutation** |
| Play/Pause button | `window.RmoozScenario.stepIndex` (timed) | **Live state mutation** |

### Controls That Are Preview-Only

| Control | Scope | Notes |
|---|---|---|
| DRP Prev/Next/Jump | `_drpPreviewStepRef` (in-memory) | Preview does NOT touch `window.RmoozScenario.stepIndex` |
| W3 Load button | `_drpPreviewSource`, `_drpPreviewMode` | Read-only deep copy |
| Walkthrough Prev/Next | `previewStepIndex` (in-memory) | Does not write to `window.RmoozScenario` |
| Walkthrough Reset | Clears `previewStepIndex` | Restore to live view |
| Load sample / Load fixture | `_swDecisionPackage` (in-memory) | Completely isolated |
| Import JSON locally | `_swDecisionPackage` (in-memory) | FileReader only — no upload |
| PRA Approve/Reject/Hold | `praSelection` (in-memory) | No record, no commit |
| External Scenario Selector | `_externalScenarioCatalogSubset` (in-memory) | Isolated |

### Controls That Paint/Clear Map Overlays

| Control | Map Effect |
|---|---|
| Step Navigator navigation | Rebuilds `_swScenarioOverlay` L.layerGroup (unit dots for live step) |
| Show/Hide unit overlay | Toggles `_swScenarioOverlay` visibility |
| W3 Load / DRP Prev/Next/Jump | Paints/clears `_w3PreviewLayer` L.layerGroup (W3 dry-run overlay) |

### Controls That Touch localStorage / sessionStorage / Backend

| Category | Answer |
|---|---|
| localStorage / sessionStorage | **None** — scenario-workspace.js has zero storage calls |
| Backend fetch | **None** in scenario-workspace.js — all content is read from `window.RmoozScenario` (pre-fetched by adjudicator-hud.js) |
| FileReader | `#sw-dpkg-import-json` — local only, no upload |

### Pure Read-Only Controls (Nothing Written Anywhere)

- All snapshot cards (Metadata, Briefing, Objective, BLS, Force Balance, Blue/Red Force)
- Unit Layout Diagnostics (`#uild-run-btn`)
- Import Diagnostics toggle
- External Catalog Source Trace Inspector

---

## 9. Recommended Reorganization

**Do not implement yet. Audit only.**

### What Should Be Combined

1. **The two navigators need distinct parent labels.** Currently the page has:
   - "Current Workflow — Wargame 3 Preview" section header → DRP nav bar → then later → "Live scenario navigation" header → Step Navigator
   - The DRP nav bar and the Step Navigator look nearly identical. The user cannot tell which is live and which is preview without reading the small header text.

2. **AMBER RIDGE default should be labeled clearly.** The dry-run preview panel shows AMBER RIDGE by default (before W3 is loaded). There is no label explaining this is a *training fixture* and not the loaded scenario. A user may assume the dry-run preview is showing the current live scenario.

3. **"Local JSON Package" and "External Scenario Catalog" are already grouped** under "Scenario Source" in PR-283. This is correct.

### What Should Stay Separate

- Step Navigator (System A — live) and DRP Nav Bar (System B — W3 preview): these must remain separate and must be clearly labeled as such.
- Decision Package cards should remain isolated from the live step cards.

### Recommended Label Clarifications

| Current Label | Recommended Label | Why |
|---|---|---|
| "Current Workflow — Wargame 3 Preview" | "Wargame 3 Dry-Run Preview" | More precise — removes "Current Workflow" which implies live state |
| "Step Navigator" | "Live Scenario Step Navigator" | Distinguish from W3 dry-run nav |
| "Dry-run preview navigation" (small label above DRP nav) | "Wargame 3 Preview Navigation (not live)" | Needs to be larger and more prominent |
| "Live scenario navigation" (header above Step Navigator) | Keep + make more prominent | Currently a small CSS strip |
| `#sw-drp-section` default state (AMBER RIDGE) | Add badge: "Training fixture — AMBER RIDGE (not the loaded scenario)" | Currently silent |
| Scenario Phase Timeline (`#spt-card`) | Consider: "Workflow Phase Tracker (Placeholder)" or remove | Contains hardcoded PHASES array unrelated to any scenario step data |

### Specific Recommendations

- **PR-283A**: Add clearer visible labels/badges to distinguish:
  1. Live Step Navigator (changes `window.RmoozScenario.stepIndex`)
  2. Wargame 3 Dry-Run Preview Navigator (preview-only, in-memory)
  3. AMBER RIDGE default state badge
- **PR-284**: Scenario Source Panel (Local + External) — already structured. May need import controls cleanup.
- **Deferred**: Scenario Phase Timeline redesign (currently uses hardcoded PHASES, not live scenario phases).

---

## 10. Summary Answers

| Question | Answer |
|---|---|
| Active/default scenario name | `wargame3` — "Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)" from `data/scenarios/wargame3.json` |
| What is the Step Navigator connected to? | `window.RmoozScenario.stepIndex` — the live active step of `wargame3` |
| Is the Step Navigator live-state or preview-only? | **Live-state** — it writes `window.RmoozScenario.stepIndex` and affects all live cards + map overlay |
| Is there a separate W3 preview navigator? | Yes — DRP nav bar (`#sw-drp-nav`, `#sw-drp-prev-btn`, `#sw-drp-next-btn`, jump select). It does NOT touch `window.RmoozScenario.stepIndex`. |
| What does the W3 preview navigator affect? | `_drpPreviewStepRef` (in-memory only) and `_w3PreviewLayer` on the map |
| Is "Scenario 3" real? | **No.** It does not exist. The confusion likely comes from `wargame3` shown as step `"3 / 17"` in the Step Navigator. |
| Where does AMBER RIDGE appear? | Default state of the Dry-Run Preview panel (`#sw-drp-section`), shown before the W3 load button is clicked |
| How many distinct scenario systems are in the page? | 5: (A) Live wargame3, (B) W3 dry-run preview + (B') AMBER RIDGE default, (C) Local JSON package, (D) External catalog, (E) Diagnostics, (F) Mock/placeholder cards |
| Which controls are safe/read-only? | All except Step Navigator nav buttons and Play button, which write `window.RmoozScenario.stepIndex` |
| Which controls touch backend/storage? | **None in scenario-workspace.js** — it is entirely client-side |
| Recommended next PR | **PR-283A** — Section label and badge clarification only (no code logic changes): label the Step Navigator as "Live," label the DRP nav as "Dry-run preview only," add AMBER RIDGE training fixture badge |
