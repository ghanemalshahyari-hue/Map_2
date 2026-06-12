# RMOOZ Scenario Workspace — Full-Page Current State Audit

**Date:** 2026-05-29  
**Audit type:** Read-only deep inspection — no code changed  
**Source files read:**
- `UI_MOdified/client/app.html` (~378 KB)
- `UI_MOdified/client/shell/scenario-workspace.js` (~871 KB)
- `UI_MOdified/client/i18n.js` (referenced, not fully read — all key names confirmed through JS)

---

## Executive Summary

The Scenario Workspace page is **substantially complete**. It already contains a live production workflow with navigation, decision selection, step status, involved units, an operator event log, scenario metadata, a scenario brief, force snapshots, objective snapshots, BLS, and a map overlay.

A large secondary layer exists but is **hidden by default** (collapsed in `#sw-secondary-cards-body`). This secondary layer contains placeholder/mock cards (intent draft, proposal preview, decision summary, phase timeline) that duplicate concepts already handled more faithfully by the live layer.

A Wargame 3 dry-run preview section (`#sw-drp-section`) is **fully built but permanently hidden** via `hidden` attribute. It duplicates navigation, event log, decision options, and unit scope for W3 step review.

**Key finding:** Many features the team was planning to add already exist in the live workspace. The next PR should inspect and consolidate, not add.

---

## Part 1 — Complete DOM Inventory

| Section / Card ID | Visible by default? | Parent container | Purpose | Category | Main JS paint/init fn | Recommendation |
|---|---|---|---|---|---|---|
| **#sw-live-workspace** | Yes | scenario-workspace panel | Top-level section grouping the entire live workflow | live production | — (no single paint fn; child cards painted individually) | keep primary |
| **#sw-live-scenario-header** | Yes | #sw-live-workspace | Read-only banner: scenario title, ID, step counter, phase, source, map-overlay status, active step status | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-live-scenario-id** | Yes | #sw-live-scenario-header | Scenario ID chip | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-live-scenario-title** | Yes | #sw-live-scenario-header | Scenario title | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-live-scenario-step** | Yes | #sw-live-scenario-header | Step counter ("Step N of T") | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-live-scenario-phase** | Yes | #sw-live-scenario-header | Active phase chip | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-live-scenario-source** | Yes | #sw-live-scenario-header | Scenario model/source label | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-live-scenario-status** | Yes | #sw-live-scenario-header | Per-step status badge (pending/decided/skipped/blocked) | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-live-map-status** | Yes | #sw-live-scenario-header | Map overlay on/off/unavailable status | live production | `paintLiveScenarioHeader()` | keep primary |
| **#sw-nav-card** | Yes | #sw-live-workspace | Live step navigator: prev/next/first/last/play/speed/overlay toggle | live production | `paintStepNavigator()`, `paintPlayButton()`, `paintOverlayToggleButton()` | keep primary |
| **#sw-nav-counter** | Yes | #sw-nav-card | Step count display ("N / T") | live production | `paintStepNavigator()` | keep primary |
| **#sw-nav-step-info** | Yes | #sw-nav-card | Step time_label | live production | `paintStepNavigator()` | keep primary |
| **#sw-nav-phase-badge** | Yes | #sw-nav-card | Phase name badge with CSS colour | live production | `paintStepNavigator()` | keep primary |
| **#sw-nav-phase-of** | Yes | #sw-nav-card | "Step N of M in PHASE" text | live production | `paintStepNavigator()` | keep primary |
| **#sw-nav-status-badge** | Yes | #sw-nav-card | Per-step status badge mirrored from live decision card | live production | `paintStepNavigator()` | keep primary |
| **#sw-nav-play** | Yes | #sw-nav-card | Play/pause auto-advance button | live production | `paintPlayButton()` | keep primary |
| **#sw-nav-speed** | Yes | #sw-nav-card | Speed selector (Slow/Normal/Fast/Very fast) | live production | `paintPlayButton()` | keep primary |
| **#sw-nav-overlay-toggle** | Yes | #sw-nav-card | Show/Hide Live Unit Overlay button | live production | `paintOverlayToggleButton()` | keep primary |
| **#sw-live-decision-card** | Yes | #sw-live-workspace | Live Decision Action: step status buttons, decision options, selection display, clear, event label | live production | `paintLiveDecisionActionCard()`, `_initLiveDecisionActionCard()` | keep primary |
| **#sw-live-decision-title** | Yes | #sw-live-decision-card | Card title | live production | `paintLiveDecisionActionCard()` | keep primary |
| **#sw-live-step-status-badge** | Yes | #sw-live-decision-card | Step status: pending/decided/skipped/blocked | live production | `paintLiveStepStatusRow()` | keep primary |
| **#sw-live-step-status-decided-btn** | Yes | #sw-live-decision-card | "Mark Decided" button | live production | `_initLiveDecisionActionCard()` | keep primary |
| **#sw-live-step-status-skipped-btn** | Yes | #sw-live-decision-card | "Mark Skipped" button | live production | `_initLiveDecisionActionCard()` | keep primary |
| **#sw-live-step-status-blocked-btn** | Yes | #sw-live-decision-card | "Mark Blocked" button | live production | `_initLiveDecisionActionCard()` | keep primary |
| **#sw-live-step-status-clear-btn** | Yes | #sw-live-decision-card | "Clear Status" button | live production | `_initLiveDecisionActionCard()` | keep primary |
| **#sw-live-decision-options** | Yes | #sw-live-decision-card | Decision option radio buttons for the active step | live production | `paintLiveDecisionActionCard()` | keep primary |
| **#sw-live-decision-selected** | Yes (when selection active) | #sw-live-decision-card | Shows selected option label | live production | `paintLiveDecisionActionCard()` | keep primary |
| **#sw-live-decision-clear-btn** | When selection active | #sw-live-decision-card | Clear selection button | live production | `paintLiveDecisionActionCard()` | keep primary |
| **#sw-live-step-units-card** | Yes | #sw-live-workspace | Involved units — actors + affected derived from live step | live production | `paintLiveStepInvolvedUnits()`, `_initLiveStepUnitsCard()` | keep primary |
| **#sw-live-step-units-table** | Yes | #sw-live-step-units-card | Table: Unit / Side / Role / Domain / Involvement | live production | `paintLiveStepInvolvedUnits()` | keep primary |
| **#sw-live-event-log-card** | Yes | #sw-live-workspace | Live Operator Event Log — tabular ops ledger (DTG/Severity/Category/Source/Message) | live production | `paintLiveOperatorEventLog()`, `_initLiveEventLogCard()` | keep primary |
| **#sw-live-event-log-table** | Yes | #sw-live-event-log-card | Event log table | live production | `paintLiveOperatorEventLog()` | keep primary |
| **#sw-meta-card** | Yes | #sw-live-workspace | Scenario Metadata Snapshot: label, steps count, phases count, bbox, schema variant | live production | `paintMetaCard()` | keep primary |
| **#sw-brfg-card** | Yes | #sw-live-workspace | Scenario Brief: purpose, end state, constraints list, assumptions list, source | live production | `paintBriefingCard()` | keep primary |
| **Scenario Timeline header** | Yes | #sw-live-workspace | Static "Scenario Timeline" heading (no ID, no JS) | live production | — (static HTML) | keep primary |
| **#sw-wt-card** | Yes | #sw-live-workspace | Live Walkthrough: preview controls, health badge, step fields (scenario/step/time/phase/objective status/decision/narrative/force/phaseline/objective), actions & effects details, timestamp | live production | `paintWalkthroughCard()`, `initWalkthroughCard()` | keep primary |
| **#sw-wt-health-badge** | Yes | #sw-wt-card | Data health indicator (good/partial/poor/none) | live production | `paintHealthBadge()` | keep primary |
| **#sw-wt-health-popover** | Hidden (expands on ⓘ click) | #sw-wt-card | Read-only missing-fields popover | live production | `paintHealthPopover()` | keep primary |
| **#sw-wt-cmp-strip** | Hidden in live mode | #sw-wt-card | Live vs Preview comparison strip | live production | `paintWalkthroughCard()` | keep primary |
| **#sw-act-details** | Hidden (expands on toggle) | #sw-wt-card | Actions & Effects disclosure: actors list + affected list | live production | `paintActionsCard()` | keep primary |
| **#sw-sps-card** | Yes | #sw-live-workspace | Step Summary: step, time, phase, decision point, objective status | live production | `paintStepSummaryCard()` | keep primary |
| **#sw-sn-card** | Yes | #sw-live-workspace | Step Narrative: narrative text (AR/EN language-aware) | live production | `paintNarrativeCard()` | keep primary |
| **#sw-fr-card** | Yes | #sw-live-workspace | Step Effects: force ratio, EW effect, phase line km, objective status | live production | `paintForceRatioCard()` | keep primary |
| **#sw-dp-card** | Yes | #sw-live-workspace | Decision Point Snapshot: step, time, decision point, objective status | live production | `paintDecisionPointCard()` | keep primary |
| **#sw-obj-card** | Yes | #sw-live-workspace | Objective Snapshot: name, target depth, CARVER score, coordinate | live production | `paintObjectiveCard()` | keep primary |
| **#sw-bls-card** | Yes | #sw-live-workspace | BLS Snapshot: list of landing sites (populated from step data) | live production | `paintBlsCard()` | keep primary |
| **#sw-fs-card** | Yes | #sw-live-workspace | Force Balance Strip: blue count / red count / ratio | live production | `paintForceSummaryStrip()` | keep primary |
| **#sw-bf-card** | Yes | #sw-live-workspace | Blue Force Snapshot: list of blue units | live production | `paintBlueForceCard()` | keep primary |
| **#sw-rf-card** | Yes | #sw-live-workspace | Red Force Snapshot: list of red units | live production | `paintRedForceCard()` | keep primary |
| **Scenario summary card** (no ID on card) | Yes | scenario-workspace panel (outside #sw-live-workspace) | Static "Current Scenario" card: sw-name, sw-status, sw-phase, sw-blue-force, sw-red-force, sw-terrain | live production | `paintScenarioOverview()` | keep secondary — partially duplicate of header and meta-card |
| **Operator state card** (no ID on card) | Yes | scenario-workspace panel (outside #sw-live-workspace) | Shows sw-last-decision, sw-safety-chip, sw-service-chip | live production | `paintLastDecision()`, `paintSafety()`, `paintService()` | keep primary |
| **#sw-secondary-cards** | Toggle visible; body hidden | scenario-workspace panel | Secondary/placeholder tools wrapper section | mock/placeholder | `initSecondaryCardsToggle()` | keep secondary |
| **#sw-secondary-cards-toggle** | Yes | #sw-secondary-cards | "Show/Hide secondary tools" expand button | mock/placeholder | `initSecondaryCardsToggle()` | keep primary |
| **#sw-secondary-cards-body** | **Hidden by default** | #sw-secondary-cards | Container for all secondary/placeholder cards | mock/placeholder | — | keep secondary |
| **#spt-card** | **Hidden (in #sw-secondary-cards-body)** | #sw-secondary-cards-body | Scenario Phase Timeline — **HARDCODED in-memory PHASES array** (not from scenario data) | mock/placeholder | `paintPhaseTimeline()` | keep secondary — needs real data before promoting |
| **#oid-card** | **Hidden** | #sw-secondary-cards-body | Operator Intent Draft — static i18n placeholder; values "Briefing" hardcoded per memory note | mock/placeholder | `paintIntentCard()` | keep secondary — needs dynamic phase wiring before promoting |
| **#apc-card** | **Hidden** | #sw-secondary-cards-body | AI Proposal Card — **mock preview only**; no AI service wired | mock/placeholder | `paintProposalCard()` | keep secondary — depends on real AI proposal service |
| **#pra-card** | **Hidden** | #sw-secondary-cards-body | Proposal Review Action — Approve/Reject/Hold buttons update **praSelection in-memory only**; no record, no API | mock/placeholder | `paintProposalActions()`, `initProposalActions()` | keep secondary — concept already handled by #sw-live-step-status-actions |
| **#dps-card** | **Hidden** | #sw-secondary-cards-body | Decision Preview Summary — mirrors praSelection; all-static i18n values | mock/placeholder | `paintDecisionSummary()` | keep secondary — only useful if #apc-card/#pra-card go live |
| **#uild-card** | **Hidden** | #sw-secondary-cards-body | Unit Layout Diagnostics — button-triggered overlap/cluster analysis of map units at current zoom | diagnostics | `initUnitLayoutDiagnostics()` | keep secondary — developer/diagnostics only |
| **W3 section header** (hidden) | **Hidden** (`hidden` attr) | scenario-workspace panel (above #sw-live-workspace) | "Wargame 3 Dry-Run Preview" header — demoted from live | dry-run hidden | — (static) | hide — leave as-is |
| **#sw-w3-load-bar** | **Hidden** | above #sw-live-workspace | "Load Wargame 3 Preview" button + status text — developer trigger for W3 dry-run | dry-run hidden | `_initW3LoadButton()` | developer-only — leave hidden |
| **#sw-drp-section** | **Hidden** | above #sw-live-workspace | Full Scenario Dry-Run Preview section (W3/AMBER RIDGE) | dry-run hidden | `paintDryRunPreview()`, `paintWargame3Preview()` | developer-only — leave hidden |
| **#sw-drp-nav** | **Hidden** (inside #sw-drp-section) | #sw-drp-section | Preview navigation buttons (prev/next) for W3 dry-run | dry-run hidden | `_initDrpNavButtons()`, `_updateDrpNavButtons()` | developer-only |
| **#sw-drp-jump-row** | **Hidden** | #sw-drp-section | Step jump select for W3 preview | dry-run hidden | `_initDrpNavButtons()` | developer-only |
| **#sw-drp-event-log** | **Hidden** | #sw-drp-section | Preview Event Log (W3 only) — NOT connected to real journal | dry-run hidden | `_buildW3EventLog()` | developer-only — live equivalent is #sw-live-event-log-card |
| **#sw-drp-decision-options** | **Hidden** | #sw-drp-section | Read-only Decision Options for W3 preview | dry-run hidden | `_paintW3DecisionOptions()` | developer-only — live equivalent is #sw-live-decision-options |
| **#sw-drp-selection-review** | **Hidden** | #sw-drp-section | Dry-run Operator Selection Review (W3 only) | dry-run hidden | `_paintW3OperatorSelectionReview()` | developer-only |
| **#sw-drp-unit-scope** | **Hidden** | #sw-drp-section | W3 preview unit scope label (engaged units only) | dry-run hidden | `paintWargame3PreviewUnitScope()` | developer-only |
| **#sw-drp-step-summary** | **Hidden** | #sw-drp-section | Compact step summary chips for W3 | dry-run hidden | `_paintW3StepSummary()` | developer-only |
| **#sw-drp-section KV fields** (sw-drp-fixture, sw-drp-step, etc.) | **Hidden** | #sw-drp-section | Decision Package / W3 step readiness KV rows | dry-run hidden | `_paintToDOM()` | developer-only |
| **Staging diagnostics** (sw-drc-section, sw-ac-section, sw-conf-section, sw-fcl-section) | **Hidden** | Advanced section in scenario-workspace | 6-gate staging readiness checklist (Gates 1-7), dry-run confirmation, apply confirmation, operator identity | diagnostics | `paintDecisionPackageCards()` | developer-only |
| **#sw-scenario-source-section** | Yes | scenario-workspace panel | Outer wrapper for all source/import controls | live source/import | — | keep primary |
| **#sw-scenario-source-hub** | Yes | #sw-scenario-source-section | Hub grouping: live import + rules + advanced imports | live source/import | — | keep primary |
| **#sw-source-live-primary** | Yes | #sw-scenario-source-hub | Primary import area header + sub-cards | live source/import | — | keep primary |
| **#sw-live-scenario-import-card** | Yes | #sw-source-live-primary | Single-file live JSON import card | live source/import | `initLiveScenarioImport()` | keep primary |
| **#sw-live-scenario-folder-intake** | Yes | #sw-live-scenario-import-card | Folder scan + candidate radio list + import button | live source/import | `initLiveScenarioFolderImport()` | keep primary |
| **#sw-source-import-rules** | Yes | #sw-scenario-source-hub | Static import rules strip (help text) | live source/import | — (static) | keep primary |
| **#sw-source-advanced-imports** | Toggle visible; body hidden | #sw-scenario-source-hub | Advanced/developer import section header + collapse toggle | advanced/developer | `initSourceAdvancedImportsToggle()` | keep secondary |
| **#sw-source-advanced-body** | **Hidden by default** | #sw-source-advanced-imports | Container for Decision Package Import (collapses) | advanced/developer | — | keep secondary |
| **#sw-local-json-source-card** | **Hidden (in advanced body)** | #sw-source-advanced-body | Decision Package Import: manifest + steps file inputs | advanced/developer | `initDecisionPackageImport()` | developer-only |
| **#sw-external-catalog-source-card** | Yes | #sw-scenario-source-section | External Scenario Catalog: selector + source trace | catalog/browse-only | `initExternalScenarioCatalogSelector()`, `paintExternalScenarioCatalogSelector()` | catalog-only — no import path to live scenario |
| **#sw-ext-select-section** | Yes | #sw-external-catalog-source-card | Selector dropdown area | catalog/browse-only | `paintExternalScenarioCatalogSelector()` | catalog-only |
| **#sw-ext-trace-section** | Yes | #sw-external-catalog-source-card | Source Trace Inspector: confidence, title/year/author source, INI/Lua/binary policies, readiness, warnings | catalog/browse-only | `paintExternalScenarioSourceTrace()` | catalog-only |
| **Invariant footer** | Yes | scenario-workspace panel | "AI proposes only — Operator approves" / "Scenario mutation is disabled" badges | live production | — (static) | keep primary |

**Total DOM IDs audited: ~120** (IDs in table plus sub-elements like sw-drp-* fields, sw-fcl-*, sw-drc-*, sw-conf-*, sw-oi-*, sw-ac-*)

---

## Part 2 — JS Function Inventory

| Function | Purpose | Reads from | Writes to | Paints DOM IDs | Category | Recommendation |
|---|---|---|---|---|---|---|
| `getScenario()` | Returns window.RmoozScenario.scenario | window.RmoozScenario | — | — | helper/pure | keep |
| `getActiveStepIndex()` | Returns stepIndex | window.RmoozScenario | — | — | helper/pure | keep |
| `getActiveStep()` | Returns active step object | window.RmoozScenario | — | — | helper/pure | keep |
| `resolveLiveValue(key)` | Dot-path or step-first lookup on scenario | window.RmoozScenario | — | — | helper/pure | keep |
| `tx(key, fallback)` | i18n helper | window.t() | — | — | helper/pure | keep |
| `logSystem(key, fallback)` | Appends SYSTEM/info event to AppShellEventLog | window.AppShellEventLog | — | — | helper/pure | keep |
| `paintSafety(state)` | Paints safety chip | safetyChip data-state | DOM | sw-safety-chip | live production | keep |
| `paintService()` | Paints AI service chip | AppShellAIProposalBridge | DOM | sw-service-chip | live production | keep |
| `paintLastDecision()` | Paints last operator decision | AppShellAIProposalDecisionJournal | DOM | sw-last-decision | live production | keep |
| `paintScenarioOverview()` | Paints overview KV (name/status/phase) | window.RmoozScenario | DOM | sw-name, sw-status, sw-phase | live production | keep |
| `paintPhaseTimeline()` | Renders in-memory PHASES array | PHASES constant (hardcoded) | DOM | spt-phase-list | mock/placeholder | avoid until wired to real scenario phases |
| `paintIntentCard()` | Renders OID_FIELDS; uses resolveLiveValue | window.RmoozScenario | DOM | oid-kv-list, oid-disclaimer | mock/placeholder | avoid building further until dynamic phase is solved |
| `paintProposalCard()` | Renders APC_FIELDS (mock i18n values) | window.RmoozScenario (phase only) | DOM | apc-kv-list | mock | developer-only until real AI service wired |
| `initProposalActions()` | Wires approve/reject/hold buttons | praSelection | praSelection closure, DOM | pra-btn-*, pra-selection-value | mock | developer-only |
| `paintProposalActions()` | Repaints PRA button labels and selection | praSelection, i18n | DOM | pra-btn-*, pra-selection-value | mock | developer-only |
| `paintDecisionSummary()` | Mirrors praSelection into DPS fields | praSelection, i18n | DOM | dps-kv-list | mock | developer-only |
| `paintMetaCard()` | Paints metadata snapshot | window.RmoozScenario | DOM | sw-meta-label-val, sw-meta-steps-val, sw-meta-phases-val, sw-meta-bbox-val, sw-meta-schema-val | live production | keep |
| `paintBriefingCard()` | Paints briefing fields (AR/EN aware) | window.RmoozScenario | DOM | sw-brfg-purpose, sw-brfg-end-state, sw-brfg-constraints-list, sw-brfg-assumptions-list, sw-brfg-source | live production | keep |
| `goToStep(newIdx)` | **Central step-advance function** — updates stepIndex, repaints all step-aware cards + overlay | window.RmoozScenario | window.RmoozScenario.stepIndex (only) | all step-aware cards | live production | keep — do NOT call from dry-run paths |
| `paintStepNavigator()` | Paints nav card buttons + phase badge + status badge | window.RmoozScenario, _liveOperatorWorkflowState | DOM | sw-nav-counter, sw-nav-step-info, sw-nav-phase-badge, sw-nav-phase-of, sw-nav-status-badge | live production | keep |
| `paintPlayButton()` | Updates play/pause button state | window.RmoozScenario, _swIsPlaying | DOM | sw-nav-play, sw-nav-speed | live production | keep |
| `ensureScenarioOverlay()` | Creates L.layerGroup if absent | window.L, window.map | _swScenarioOverlay | map | live production | keep |
| `clearScenarioOverlay()` | Removes all markers from overlay group | _swScenarioOverlay | map | — | live production | keep |
| `stopScenarioOverlay()` | Removes overlay from map + resets state | _swScenarioOverlay, window.map | map, _swScenarioOverlay, _swOverlayEnabled | — | live production | keep |
| `buildScenarioOverlay(stepIdx)` | Renders blue/red unit dots from coord tables | window.RmoozScenario | map via L.circleMarker | map | live production | keep |
| `paintScenarioOverlay()` | Conditional build/clear of overlay | _swOverlayEnabled, window.RmoozScenario | map | — | live production | keep |
| `paintOverlayToggleButton()` | Updates overlay toggle button text/state | _swOverlayEnabled, window.RmoozScenario | DOM | sw-nav-overlay-toggle | live production | keep |
| `normaliseDecisionPackage(manifest, steps)` | Normalises a raw Decision Package | raw manifest + steps | _swDecisionPackage, _swDecisionSteps | — | decision package | keep — console/developer loading |
| `validateStagingCandidate(step)` | Pure validator: step identity/situation/safety/units/source-trace | normalised step | — | — | diagnostics | keep — developer/console only |
| `isStagingProposalSafe(candidate)` | Pure type guard for StagingProposal safety flags | proposal object | — | — | diagnostics | keep — console/developer only |
| `buildStagingProposal(normalisedStep, options)` | Pure builder for dry-run StagingProposal | normalised step | — (returns object) | — | diagnostics | keep — console/developer only |
| `isOperatorReviewRecordSafe(record)` | Pure type guard: review decision not forbidden | review record | — | — | diagnostics | keep — console/developer only |
| `isDryRunConfirmationSafe(candidate)` | Pure type guard: mode=dry_run_only, safety flags | confirmation object | — | — | diagnostics | keep — console/developer only |
| `buildDryRunConfirmation(proposal, reviewRecord)` | Pure builder for DryRunConfirmation | proposal + review record | — | — | diagnostics | keep — console/developer only |
| `isReconciliationResultSafe(candidate)` | Pure type guard: UID reconciliation result | reconciliation object | — | — | diagnostics | keep — console/developer only |
| `reconcileUidReferences(importedStep, liveUnitsSnapshot)` | Pure UID matcher (exact/alias/name/proximity) | imported step + live units snapshot | — | — | diagnostics | keep — console/developer only |
| `isApplyCandidateSafe/buildApplyCandidate` | Pure Apply candidate guard + builder | ApplyCandidate object | — | — | diagnostics | keep — console only, NOT wired to UI |
| `isApplyConfirmationSafe/buildApplyConfirmation` | Pure Apply confirmation guard + builder | confirmation object | — | — | diagnostics | keep — console only |
| `isLiveUnitsSnapshotSafe/buildLiveUnitsSnapshot` | Pure live units snapshot guard + builder | units array | — | — | diagnostics | keep — console only |
| `buildScenarioStepPreview(fixture, stepRef)` | Builds dry-run step preview from a fixture | dry-frozen fixture | — | — | dry-run | keep — console/developer only |
| `paintDryRunPreview(previewOverride?)` | Paints #sw-drp-section | fixture, window.RmoozScenario | DOM, _drpPreviewSource | sw-drp-section (hidden) | dry-run | developer-only |
| `paintWargame3Preview(w3json, stepRef?)` | Chains W3 adapter → paintDryRunPreview | w3json | DOM | sw-drp-section (hidden) | dry-run | developer-only |
| `adaptWargame3ToFixture(w3json)` | Pure adapter: W3 JSON → dry-run fixture | w3json | — | — | dry-run | developer-only |
| `previewWargame3Fixture/stepWargame3Preview` | W3 step-level preview navigation | w3json, _drpPreviewSource | _drpPreviewStepRef | sw-drp-section (hidden) | dry-run | developer-only |
| `buildW3PreviewFromLoadedScenario` | Reads window.RmoozScenario → safe W3 copy | window.RmoozScenario | — | — | dry-run | developer-only |
| `buildWargame3ReadOnlyMapOverlayData` | Converts W3 preview to map overlay data object | preview object | — | — | dry-run | developer-only |
| `focusWargame3PreviewMapBounds` | Zooms map to W3 preview overlay bounds | overlay data | window.map | — | dry-run | developer-only |
| `buildWargame3MapPreviewReadinessReport` | Audits W3 JSON for preview readiness | w3json | — | — | dry-run | developer-only |
| `auditWargame3ObjectiveCoordinateSources` | Pure audit of W3 objective coords | w3json | — | — | dry-run | developer-only |
| `runWargame3ScenarioWorkflowWalkthrough` | Full W3 workflow walkthrough generator | previewSource | — | — | dry-run | developer-only |
| `checkWargame3ScenarioWorkflowAcceptance` | Validates W3 workflow acceptance | previewSource | — | — | dry-run | developer-only |
| `buildExternalScenarioCatalog/summarizeExternalScenarioCatalog` | Build + summarise a catalog from a manifest | sourceManifest | — | — | catalog | developer/catalog — no live import path |
| `paintExternalScenarioCatalogSelector(catalog)` | Populates #sw-ext-select-control dropdown | catalog subset | DOM | sw-ext-select-control, sw-ext-select-count | catalog | catalog only |
| `initExternalScenarioCatalogSelector()` | Wires select-change handler for catalog | DOM event | _extPreviewEntry | — | catalog | catalog only |
| `previewExternalScenarioCatalogSubsetFromManifest` | Builds + displays catalog subset from raw manifest | sourceManifest | _externalScenarioCatalogSubset | sw-ext-select-control | catalog | catalog only |
| `paintExternalScenarioSourceTrace(entry)` | Paints source trace fields for selected catalog entry | _extPreviewEntry | DOM | sw-ext-trace-* | catalog | catalog only |
| **`paintLiveScenarioHeader()`** | Paints full live header strip | window.RmoozScenario, _swOverlayEnabled, getLiveStepStatus | DOM | sw-live-scenario-id/title/step/phase/source/status, sw-live-map-status | live production | keep |
| `initSecondaryCardsToggle()` | Wires secondary cards toggle button (idempotent) | DOM | DOM, _secondaryToggleWired | sw-secondary-cards-toggle, sw-secondary-cards-body | helper/init | keep |
| `validateLiveScenarioJson(json)` | Validates JSON for live import (unsafe keys, steps array, step field presence) | json object | — | — | live import | keep |
| `loadLiveScenarioFromJson(json)` | Validates + loads JSON into window.RmoozScenario; resets selections/stepStatus | json, validateLiveScenarioJson | window.RmoozScenario | all live cards (via refresh()) | live import | keep — this is the gate |
| `getCurrentLiveScenarioSummary()` | Returns current scenario identity snapshot | window.RmoozScenario | — | — | live import | keep |
| `initLiveScenarioImport()` | Wires #sw-live-scenario-import-btn (idempotent) | DOM | _liveImportWired | sw-live-scenario-import-status, sw-live-scenario-import-summary | live import | keep |
| `classifyScenarioFolderFile(file)` | Classifies a File by extension into json-candidate/scen/ini/lua/doc/asset/other | file.name | — | — | folder intake | keep |
| `scanScenarioFolderFiles(fileList)` | Scans a FileList → {candidates, unsupported, summary} | FileList | — | — | folder intake | keep |
| `getLiveScenarioFolderScanState()` | Returns deep copy of folder scan state | _liveScenarioFolderScanState | — | — | folder intake | keep |
| `importSelectedFolderScenarioJson(relPath)` | FileReader.readAsText → loadLiveScenarioFromJson | _liveScenarioFolderScanState.files | window.RmoozScenario (via loadLiveScenario) | all live cards | folder intake | keep |
| `initLiveScenarioFolderImport()` | Wires folder scan + candidate selection + import button | DOM | _liveScenarioFolderScanState | sw-live-scenario-folder-* | folder intake | keep |
| `initSourceAdvancedImportsToggle()` | Wires "Show/Hide advanced imports" toggle | DOM | _sourceAdvancedToggleWired | sw-source-advanced-toggle, sw-source-advanced-body | helper/init | keep |
| `getLiveScenarioIdentity()` | Returns scenarioId + scenarioLabel from scenario | window.RmoozScenario | — | — | helper/pure | keep |
| `getActiveLiveStepContext()` | Full context object: scenario, ids, step, stepId, stepTitle | window.RmoozScenario | — | — | helper/pure | keep |
| `extractLiveDecisionOptions(step)` | Finds options in step.decision_options / decisionOptions / options / coa_options | step object | — | — | live production | keep |
| `recordLiveOperatorSelection(optionId)` | Records live operator selection + appends event | window.RmoozScenario, extractLiveDecisionOptions | _liveOperatorWorkflowState.selections, .events | sw-live-decision-card (via paintLiveDecisionActionCard) | live production | keep |
| `clearLiveOperatorSelection()` | Clears selection for active step | _liveOperatorWorkflowState | _liveOperatorWorkflowState | sw-live-decision-card | live production | keep |
| `getLiveOperatorWorkflowState()` | Returns deep-copy of workflow state | _liveOperatorWorkflowState | — | — | live production | keep |
| `getLiveStepStatus(stepIndex)` | Returns step status record (pending default) | _liveOperatorWorkflowState.stepStatus | — | — | live production | keep |
| `setLiveStepStatus(status, options)` | Sets step status + appends event | _liveOperatorWorkflowState | stepStatus + events | sw-live-decision-card, sw-live-scenario-header, sw-nav-card | live production | keep |
| `clearLiveStepStatus(stepIndex)` | Resets step to pending | _liveOperatorWorkflowState | stepStatus | sw-live-decision-card | live production | keep |
| `getLiveScenarioStatusSummary()` | Returns counts of each status across all steps | _liveOperatorWorkflowState | — | — | live production | keep |
| `paintLiveStepStatusRow()` | Paints status badge + action buttons + summary paragraph | _liveOperatorWorkflowState, window.RmoozScenario | DOM | sw-live-step-status-badge, sw-live-step-status-reason, sw-live-step-status-summary | live production | keep |
| `getLiveOperatorEventLog()` | Returns shallow copy of events array | _liveOperatorWorkflowState | — | — | live production | keep |
| `clearLiveOperatorEventLog()` | Empties events array + repaints log | _liveOperatorWorkflowState | .events | sw-live-event-log-card | live production | keep |
| `_initLiveEventLogCard()` | Wires clear-button handler | DOM | _liveDecisionCardWired | sw-live-event-log-clear-btn | helper/init | keep |
| `paintLiveOperatorEventLog()` | Renders event log table rows (DTG/Sev/Cat/Src/Msg) | _liveOperatorWorkflowState.events | DOM | sw-live-event-log-table, sw-live-event-log-rows, sw-live-event-log-empty, sw-live-event-log-count | live production | keep |
| `buildLiveOobUnitIndex(scenario)` | Builds {uid → unit} lookup for blue+red OOB | scenario.blue_units_initial, scenario.red_units | — | — | live production | keep |
| `buildLiveStepInvolvedUnits(step, scenario)` | Derives actor/affected unit list from step.actors + step.affected vs OOB index | step, scenario | — | — | live production | keep |
| `getLiveStepInvolvedUnits(stepIndex)` | Returns involved units for a step (with caching) | _liveOperatorWorkflowState, window.RmoozScenario | — | — | live production | keep |
| `paintLiveStepInvolvedUnits()` | Renders involved units table | getLiveStepInvolvedUnits | DOM | sw-live-step-units-table, sw-live-step-units-rows, sw-live-step-units-empty, sw-live-step-units-count | live production | keep |
| `_initLiveDecisionActionCard()` | Wires step-status buttons + decision option click delegator + clear button | DOM | _liveDecisionCardWired | — | helper/init | keep |
| `paintLiveDecisionActionCard()` | Paints full decision card: step title, status row, options, selection display, event label | window.RmoozScenario, _liveOperatorWorkflowState, extractLiveDecisionOptions | DOM | sw-live-decision-title, sw-live-decision-step, sw-live-decision-options, sw-live-decision-selected, etc. | live production | keep |
| `refresh()` | Full repaint of all cards in the workspace | all state | DOM | all sw-* cards | live production | keep — single authoritative repaint entry point |
| `paintWalkthroughCard()`, `paintStepSummaryCard()`, `paintNarrativeCard()`, `paintDecisionPointCard()`, `paintForceRatioCard()`, `paintActionsCard()` | Timeline detail cards | window.RmoozScenario + previewStepIndex | DOM | sw-wt-card, sw-sps-card, sw-sn-card, sw-dp-card, sw-fr-card | live production | keep |
| `paintObjectiveCard()`, `paintBlsCard()`, `paintForceSummaryStrip()`, `paintBlueForceCard()`, `paintRedForceCard()` | Objective, BLS, force cards | window.RmoozScenario | DOM | sw-obj-card, sw-bls-card, sw-fs-card, sw-bf-card, sw-rf-card | live production | keep |
| `paintDecisionPackageCards()` | Paints decision package readiness/staging KV rows | _swDecisionPackage, _swDecisionSteps | DOM | sw-drp-section sub-fields (hidden), staging diagnostics (hidden) | decision package | developer-only |

**Total JS functions audited: ~100+** (all major public + many private helpers)

---

## Part 3 — Existing Features That Should NOT Be Rebuilt

| Planned feature | Already exists? | Location | Live or dry-run? | Visible? | Mock or real? | Can be reused? | Recommendation |
|---|---|---|---|---|---|---|---|
| Step status | **YES** | `#sw-live-step-status-badge` + `#sw-live-step-status-actions` inside `#sw-live-decision-card` | **Live** | **Visible** | **Real** (in-memory) | Already in use | Do not rebuild — it already works |
| Operator event log | **YES** | `#sw-live-event-log-card` | **Live** | **Visible** | **Real** (in-memory) | Already in use | Do not rebuild — tabular ops ledger already exists |
| Step involved units | **YES** | `#sw-live-step-units-card` | **Live** | **Visible** | **Real** (from step.actors/affected + OOB) | Already in use | Do not rebuild |
| Live warnings/readiness | **YES (partial)** | Data health badge in `#sw-wt-card` (`#sw-wt-health-badge` + popover); import status in `#sw-live-scenario-import-status` | Live | Visible | Real (health badge) | Already in use | Extend health badge if needed; do not create new warnings panel |
| Scenario summary | **YES** | "Current Scenario" card (`#sw-name`, `#sw-status`, `#sw-phase`) + `#sw-meta-card` | Live | Visible | Real | Already in use | Do not rebuild; minor consolidation possible |
| Phase timeline | **YES (mock)** | `#spt-card` in secondary section | — | **Hidden** | **Mock** (hardcoded PHASES array) | Reusable if wired to real data | Convert to real before promoting, not rebuild |
| Decision review / approval / reject / hold | **YES (two versions)** | (1) `#pra-card` — **mock, secondary, hidden**. (2) `#sw-live-step-status-actions` — **live, visible, real** | (1) hidden mock; (2) live | (1) hidden; (2) visible | (2) is real | Reuse `#sw-live-step-status-actions` (it already exists in the live card) | Do not add another approve/reject UI — use existing step-status buttons |
| Decision preview | **YES (mock only)** | `#dps-card` in secondary/hidden section | Hidden mock | Hidden | Mock (mirrors praSelection) | Not yet — depends on real AI service | Leave secondary; do not rebuild |
| Operator identity | **YES (type guard only)** | `isOperatorIdentitySafe()` in public API, `isStagingStateSafe()` | Console/developer | Not visible in UI | Type guard (pure function) | Reusable when UI is built | Do not add UI widget yet |
| Import diagnostics | **YES** | `#sw-live-scenario-import-status` + `#sw-live-scenario-import-summary` | Live | Visible | Real | Already in use | Do not rebuild |
| Source trace | **YES** | `#sw-ext-trace-section` (catalog only) + `source_trace` in decision package normaliser | Catalog (browse only) | Visible | Real (catalog metadata) | Available for catalog entries | Do not add another trace panel for live workflow yet |
| GeoJSON display | **NO** | Not found in DOM or JS functions | — | — | — | Does not exist | Can add later if needed |
| Image reference display | **NO** | Not found | — | — | — | — | Can add later |
| Unit reference display | **YES (two versions)** | (1) `#sw-live-step-units-card` for live scenario; (2) `#sw-drp-unit-scope` for W3 preview (hidden) | (1) live; (2) hidden | (1) visible | (1) real | Reuse `#sw-live-step-units-card` | Do not rebuild |
| Step navigation | **YES** | `#sw-nav-card` + play/speed/overlay controls | Live | Visible | Real | Already in use | Do not rebuild |
| Map overlay toggle | **YES** | `#sw-nav-overlay-toggle` | Live | Visible | Real | Already in use | Do not rebuild |
| Force summary | **YES** | `#sw-fs-card`, `#sw-bf-card`, `#sw-rf-card` | Live | Visible | Real (from scenario data) | Already in use | Do not rebuild |

---

## Part 4 — Duplication and Crowding

| Concept | Duplicated at | Production version | Secondary version | Action |
|---|---|---|---|---|
| **Step navigation** | `#sw-nav-card` (live, visible) + `#sw-drp-nav` (hidden, W3 dry-run) | `#sw-nav-card` | `#sw-drp-nav` (developer-only) | Do not touch; leave hidden version as-is |
| **Decision options** | `#sw-live-decision-options` (live, visible) + `#sw-drp-decision-options` (hidden, W3) | `#sw-live-decision-options` | `#sw-drp-decision-options` (developer-only) | Do not touch |
| **Event log** | `#sw-live-event-log-card` (live, visible, real) + `#sw-drp-event-log` (hidden, W3 preview) | `#sw-live-event-log-card` | `#sw-drp-event-log` (developer-only) | Do not rebuild; note memory requirement re: no chat-style |
| **Approval / review controls** | `#sw-live-step-status-actions` (live, visible) + `#pra-card` (hidden, mock) | `#sw-live-step-status-actions` | `#pra-card` (mock/secondary) | Use live version; secondary can stay or be removed later |
| **Scenario summary** | "Current Scenario" card (`#sw-name`, `#sw-status`, `#sw-phase`) + `#sw-meta-card` (more metadata) | Both serve different depths | `#sw-meta-card` is more detailed | Consider merging into one live card later; not urgent |
| **Phase info** | `#sw-phase` (summary card) + `#sw-nav-phase-badge` (nav card) + `#sw-live-scenario-phase` (header strip) | All show same data, different contexts | — | Not problematic — each is in a different functional area |
| **Objective status** | `#sw-sps-card`, `#sw-dp-card`, `#sw-fr-card`, `#sw-wt-card` (all show objective_status_baseline) | `#sw-sps-card` is canonical; `#sw-wt-card` is the richest view | — | Minor redundancy — intentional for different detail depths |
| **Scenario import** | `#sw-live-scenario-import-card` (single file) + `#sw-live-scenario-folder-intake` (folder scan) | Both serve the SAME purpose (load live scenario JSON) | — | Not true duplication — they are different entry points for the same function `loadLiveScenarioFromJson()` |
| **Import + source hub vs catalog card** | `#sw-scenario-source-hub` (live import + advanced) + `#sw-external-catalog-source-card` (catalog/browse only) | Hub is for live workflow; catalog is browse-only | — | Separate purposes; no true duplication |
| **Decision Package import** | `#sw-local-json-source-card` in advanced/hidden body | Intentionally hidden (advanced only) | — | Keep hidden by default; not for operators |
| **Unit scope display** | `#sw-live-step-units-card` (live) + `#sw-drp-unit-scope` (hidden, W3 preview) | Live card | W3 preview label (hidden) | No action needed |
| **Safety check** | `sw-safety-chip` (operator state card) + `#sw-drp-safety` (hidden staging row) | `sw-safety-chip` | `#sw-drp-safety` (developer-only) | No action |

---

## Part 5 — Live vs Dry-Run Separation Audit

### Live Production Path

**DOM IDs:**
- `#sw-live-workspace` (entire section)
- `#sw-live-scenario-header` + children
- `#sw-nav-card` + children (sw-nav-first/prev/next/last, sw-nav-play, sw-nav-speed, sw-nav-overlay-toggle)
- `#sw-live-decision-card` + children (sw-live-step-status-*, sw-live-decision-options, sw-live-decision-selected)
- `#sw-live-step-units-card` + sw-live-step-units-table
- `#sw-live-event-log-card` + sw-live-event-log-table
- `#sw-meta-card`, `#sw-brfg-card`
- `#sw-wt-card` + children
- `#sw-sps-card`, `#sw-sn-card`, `#sw-fr-card`, `#sw-dp-card`
- `#sw-obj-card`, `#sw-bls-card`, `#sw-fs-card`, `#sw-bf-card`, `#sw-rf-card`
- `#sw-name`, `#sw-status`, `#sw-phase` (scenario summary card)
- `sw-safety-chip`, `sw-service-chip`, `sw-last-decision` (operator state card)
- `#sw-live-scenario-import-card` + `#sw-live-scenario-folder-intake`
- `#sw-source-live-primary`, `#sw-source-import-rules`

**JS functions:** `refresh()`, `goToStep()`, `paintLiveScenarioHeader()`, `paintStepNavigator()`, `paintLiveDecisionActionCard()`, `paintLiveStepStatusRow()`, `paintLiveOperatorEventLog()`, `paintLiveStepInvolvedUnits()`, `paintScenarioOverlay()`, `paintOverlayToggleButton()`, `loadLiveScenarioFromJson()`, `validateLiveScenarioJson()`, `recordLiveOperatorSelection()`, `clearLiveOperatorSelection()`, `setLiveStepStatus()`, `clearLiveStepStatus()`, all `paint*Card()` functions.

**State objects:** `window.RmoozScenario` (scenario + stepIndex), `_liveOperatorWorkflowState` (selections + events + stepStatus), `_swScenarioOverlay`, `_swOverlayEnabled`, `_swIsPlaying`, `_swPlayIntervalId`, `_swPlaySpeedMs`

**Map path:** `buildScenarioOverlay()` → `window.L.circleMarker` on `_swScenarioOverlay` L.layerGroup

**Import path:** FileReader.readAsText → `validateLiveScenarioJson()` → `loadLiveScenarioFromJson()` → `window.RmoozScenario` → `refresh()`

---

### Dry-Run / Developer Path

**DOM IDs (all hidden):**
- `#sw-w3-load-bar` (hidden)
- `#sw-drp-section` (hidden) + all children: `#sw-drp-nav`, `#sw-drp-jump-row`, `#sw-drp-event-log`, `#sw-drp-decision-options`, `#sw-drp-selection-review`, `#sw-drp-unit-scope`, `#sw-drp-step-summary`, all `sw-drp-*` KV fields

**JS functions:** `paintDryRunPreview()`, `paintWargame3Preview()`, `adaptWargame3ToFixture()`, `buildScenarioStepPreview()`, `previewWargame3Fixture()`, `stepWargame3Preview()`, `buildW3PreviewFromLoadedScenario()`, `_initDrpNavButtons()`, `_updateDrpNavButtons()`, `_paintToDOM()`, `_buildW3EventLog()`, `_paintW3DecisionOptions()`, `_paintW3OperatorSelectionReview()`, `_paintW3StepSummary()`, `paintWargame3PreviewUnitScope()`, `focusWargame3PreviewMapBounds()`, `buildWargame3ReadOnlyMapOverlayData()`, `_initW3LoadButton()`

**State objects:** `_drpPreviewSource` (deep-frozen W3 fixture), `_drpPreviewStepRef`, `_drpPreviewMode` ("amber" | "wargame3"), `_w3CoaReviewRecord`, `_w3ScenarioReviewSession`, `_w3ScenarioWorkflowState`, `_w3PreviewLayer` (separate L.layerGroup)

**Map path:** `buildWargame3ReadOnlyMapOverlayData()` → `_w3PreviewLayer` L.layerGroup → separate layer from live overlay

**Note:** `_drpPreviewSource` and `_drpPreviewStepRef` DO NOT affect `window.RmoozScenario.stepIndex`. They are fully isolated.

---

### Mock / Placeholder Path

| DOM IDs | JS functions | Why mock | Should convert or remove later? |
|---|---|---|---|
| `#spt-card` (in secondary, hidden) | `paintPhaseTimeline()` | Uses hardcoded `PHASES` array, not scenario data | Convert when scenario phase_table is wired; do not rebuild |
| `#oid-card` (in secondary, hidden) | `paintIntentCard()` | `oid-value-phase` and `apc-value-linked-intent` show "Briefing" from hardcoded i18n; no live phase connection yet | Convert once real phase/scenario state is approved |
| `#apc-card` (in secondary, hidden) | `paintProposalCard()` | No AI service; all values are i18n placeholders | Convert when real AI service is wired |
| `#pra-card` (in secondary, hidden) | `paintProposalActions()`, `initProposalActions()` | praSelection is in-memory only; no decision recorded | Concept already served by `#sw-live-step-status-actions`; can later remove |
| `#dps-card` (in secondary, hidden) | `paintDecisionSummary()` | Mirrors praSelection; static i18n | Remove later (tied to mock approval flow) |

---

### Decision Package Path

**DOM IDs:** `#sw-local-json-source-card` (hidden in advanced body), all `sw-drp-*` fields in `#sw-drp-section`, staging diagnostic rows (`#sw-drc-section`, `#sw-ac-section`, `#sw-conf-section`, `#sw-fcl-section`)

**JS functions:** `normaliseDecisionPackage()`, `loadDecisionPackagePreview()`, `loadParsedDecisionPackageFixture()`, `paintDecisionPackageCards()`, `validateStagingCandidate()`, `buildStagingProposal()`, all pure type-guard and builder functions

**Data contract:** Requires `manifest.read_only === true` and `manifest.no_auto_adjudication === true`. Normalises steps to a safe shape. Never reaches `window.RmoozScenario`.

**Not live:** Decision Package data flows into `_swDecisionPackage` / `_swDecisionSteps` only. It does NOT replace the live scenario.

---

### Catalog Path

**DOM IDs:** `#sw-external-catalog-source-card`, `#sw-ext-select-section`, `#sw-ext-trace-section`, injected `#sw-ext-preview-section`

**JS functions:** `buildExternalScenarioCatalog()`, `previewExternalScenarioCatalogSubsetFromManifest()`, `paintExternalScenarioCatalogSelector()`, `initExternalScenarioCatalogSelector()`, `paintExternalScenarioPreviewEntry()`, `paintExternalScenarioSourceTrace()`, `buildExternalScenarioSourceTrace()`

**Browse-only limitations:** The catalog provides metadata preview only. No entry in the catalog has an import path to `window.RmoozScenario`. Per memory note, the external catalog UI was reverted in PR-167 and `scen-catalog-contract.js` stays unlinked.

---

## Part 6 — State Model Audit

| State object | Owner | Written by | Read by | Category | Reset on live import? |
|---|---|---|---|---|---|
| `window.RmoozScenario` | Global | `loadLiveScenarioFromJson()` (both fields), `goToStep()` (stepIndex only) | Every `get*()` accessor, all `paint*()` functions | live production | Yes — fully replaced by `loadLiveScenarioFromJson()` |
| `window.RmoozScenario.scenario` | Global | `loadLiveScenarioFromJson()` only | `getScenario()` | live production | Yes |
| `window.RmoozScenario.stepIndex` | Global | `goToStep()` + `loadLiveScenarioFromJson()` + playback timer | `getActiveStepIndex()` | live production | Reset to 0 on import |
| `previewStepIndex` | Module-private closure | `paintWalkthroughCard()` preview controls; cleared by `goToStep()` + `refresh()` | walkthrough/detail paint functions | live production (preview mode) | Yes (cleared on refresh) |
| `_liveOperatorWorkflowState.selections` | Module-private | `recordLiveOperatorSelection()`, `clearLiveOperatorSelection()` | `getLiveOperatorWorkflowState()`, `paintLiveDecisionActionCard()` | live production (in-memory) | Yes — cleared in `loadLiveScenarioFromJson()` |
| `_liveOperatorWorkflowState.events` | Module-private | `_liveOpAppendEvent()` (called by record/clear/status functions) | `getLiveOperatorEventLog()`, `paintLiveOperatorEventLog()` | live production (in-memory) | **No** — events are preserved as the audit trail |
| `_liveOperatorWorkflowState.stepStatus` | Module-private | `setLiveStepStatus()`, `clearLiveStepStatus()` | `getLiveStepStatus()`, `paintLiveStepStatusRow()`, `paintStepNavigator()`, `paintLiveScenarioHeader()` | live production (in-memory) | Yes — cleared in `loadLiveScenarioFromJson()` |
| `_liveScenarioFolderScanState` | Module-private | `initLiveScenarioFolderImport()` scan button handler | `getLiveScenarioFolderScanState()`, `importSelectedFolderScenarioJson()` | folder intake | Not reset on import — retains last folder scan |
| `_drpPreviewSource` | Module-private | `paintWargame3Preview()` / `paintDryRunPreview()` | W3 nav button handlers | dry-run | Not affected by live import |
| `_drpPreviewStepRef` | Module-private | W3 nav button handlers | `stepWargame3Preview()`, `_updateDrpNavButtons()` | dry-run | Not affected |
| `_drpPreviewMode` | Module-private | `paintWargame3Preview()` / AMBER RIDGE path | `_paintToDOM()` | dry-run | Not affected |
| `_w3CoaReviewRecord` | Module-private | `_handleW3CoaReviewClick()` | `_getW3CoaReviewRecordForStep()` | dry-run | Not affected |
| `_w3ScenarioReviewSession` | Module-private | `_updateW3ScenarioReviewSession()` | various W3 paint helpers | dry-run | Not affected |
| `_w3ScenarioWorkflowState` | Module-private | `_updateW3ScenarioWorkflowStateFromCurrentSession()` | various W3 workflow helpers | dry-run | Not affected |
| `_extPreviewEntry` | Module-private | `setExternalScenarioPreviewEntry()` | `paintExternalScenarioPreviewEntry()` | catalog | Not affected |
| `_externalScenarioCatalogSubset` | Module-private | `setExternalScenarioCatalogSubset()` | `paintExternalScenarioCatalogSelector()` | catalog | Not affected |
| `_swScenarioOverlay` | Module-private | `ensureScenarioOverlay()`, `stopScenarioOverlay()` | `buildScenarioOverlay()`, `clearScenarioOverlay()` | live production (map) | Cleared/rebuilt by `paintScenarioOverlay()` on import |
| `_swOverlayEnabled` | Module-private | `sw-nav-overlay-toggle` click handler; `stopScenarioOverlay()` | `paintScenarioOverlay()`, `paintOverlayToggleButton()`, `paintLiveScenarioHeader()` | live production (map) | Not reset — user toggle state preserved |
| `_swIsPlaying` | Module-private | playback start/stop handlers | `paintPlayButton()`, playback timer | live production | Not reset — preserved |
| `_swDecisionPackage` | Module-private | `loadDecisionPackagePreview()` | `paintDecisionPackageCards()` | decision package | Not affected by live import |
| `_swDecisionSteps` | Module-private | `loadDecisionPackagePreview()` | `paintDecisionPackageCards()` | decision package | Not affected |
| `praSelection` | Module-private | `#pra-btn-*` click handlers | `paintProposalActions()`, `paintDecisionSummary()` | mock/secondary | Not affected |
| `healthPopoverOpen` | Module-private | health button click handler | `paintHealthPopover()` | live production | Not affected |
| `lastLiveStepIndex` | Module-private | `refresh()` | `refresh()` (step-change detection) | live production | Reset to -1 concept handled on first import |
| `_secondaryToggleWired` | Module-private | `initSecondaryCardsToggle()` | `initSecondaryCardsToggle()` | helper | Not affected |
| `_liveImportWired` | Module-private | `initLiveScenarioImport()` | `initLiveScenarioImport()` | live import | Not affected |
| `_liveFolderImportWired` | Module-private | `initLiveScenarioFolderImport()` | `initLiveScenarioFolderImport()` | folder intake | Not affected |
| `_sourceAdvancedToggleWired` | Module-private | `initSourceAdvancedImportsToggle()` | `initSourceAdvancedImportsToggle()` | helper | Not affected |

---

## Part 7 — Map Overlay Audit

### Live unit overlay

- **Button:** `#sw-nav-overlay-toggle` inside `#sw-nav-card`
- **State:** `_swOverlayEnabled` (boolean toggle)
- **On-click:** Toggles `_swOverlayEnabled` → calls `paintScenarioOverlay()` → calls `buildScenarioOverlay(getActiveStepIndex())`
- **Build path:** `buildScenarioOverlay(stepIdx)` reads `sc.blue_unit_step_coords` and `sc.red_unit_step_coords`, creates `L.circleMarker` dots on `_swScenarioOverlay` L.layerGroup
- **Step advance:** `goToStep(newIdx)` calls `paintScenarioOverlay()` → rebuilds all markers for the new step index
- **Data source:** `blue_unit_step_coords` and `red_unit_step_coords` are coordinate tables in the scenario JSON (`{ uid: [[lng,lat], [lng,lat], ...] }` indexed by step)
- **Status display:** `#sw-live-map-status` in the header shows on/off/unavailable; painted by `paintLiveScenarioHeader()` → reads `_swOverlayEnabled`
- **Off-map sentinel:** Coord `[18, 32]` means "not yet deployed" — those markers are skipped

### W3 dry-run preview overlay (separate)

- **Layer:** `_w3PreviewLayer` (a **separate** L.layerGroup — never touches `_swScenarioOverlay`)
- **Paints when:** `focusWargame3PreviewMapBounds()` is called (developer only) or when `paintWargame3Preview()` runs with map enabled
- **Data source:** `buildWargame3ReadOnlyMapOverlayData()` — converts a frozen W3 preview into map markers, objective highlights, movement trails
- **Safety:** `liveMutationAllowed: false`; no window.units mutation; no engagement arcs; uses a private layer

### Coexistence

- Both overlays can exist simultaneously because they use separate L.layerGroups
- Live import does NOT clear `_w3PreviewLayer`
- `stopScenarioOverlay()` only affects `_swScenarioOverlay`
- There is no current risk of the two overlays interfering

### Safe future improvement

The only missing piece for the live overlay is: if a loaded scenario lacks `blue_unit_step_coords` / `red_unit_step_coords`, the overlay button is disabled. A converter from W3 or other formats into the coord-table shape would enable the overlay. This is a data-format problem, not a UI problem.

---

## Part 8 — Import / Source Audit

| Import path | User-facing purpose | Data shape | Reaches window.RmoozScenario? | Production? | Stay primary/secondary? | Needs converter later? |
|---|---|---|---|---|---|---|
| **Single-file Live Scenario Import** (#sw-live-scenario-import-card) | Load one scenario JSON as the active live workspace | RMOOZ scenario JSON with `steps[]` array; validated by `validateLiveScenarioJson()` | **Yes** | **Yes** | Primary | No (already works) |
| **Folder Intake** (#sw-live-scenario-folder-intake) | Scan a local folder, pick a JSON candidate, import it | Same as above — selected JSON goes through same validator + loader | **Yes** | **Yes** | Primary | No (same code path) |
| **Decision Package Import** (#sw-local-json-source-card, hidden in advanced) | Import a read-only decision package for step preview | `manifest.json` + `steps/*.json`; `read_only:true, no_auto_adjudication:true` required | **No** — loads into `_swDecisionPackage` / `_swDecisionSteps` only | **No** (developer/preview only) | Secondary/advanced (hidden by default) | No import path planned |
| **External Scenario Catalog** (#sw-external-catalog-source-card) | Browse a capped catalog subset for metadata + source trace inspection | Catalog entry objects with metadata (confidence, source fields, policies); no scenario data | **No** | **No** (browse only) | Catalog-only | N/A — browse only, no import path |
| **Wargame 3 built-in / reference** (developer console only) | Developer preview of W3 scenario as a dry-run fixture | W3 JSON (`wargame3.json`) adapted by `adaptWargame3ToFixture()` into a frozen preview fixture | **No** — into `_drpPreviewSource` / `_drpPreviewStepRef` only | **No** (developer only) | Hidden / developer-only | A converter to live format would be a separate PR |
| **Unsupported Command files** (.scen, .ini, Lua) | Detected and reported in folder scan, NOT imported | Classified by `classifyScenarioFolderFile()` as unsupported; listed in #sw-live-scenario-folder-unsupported | **No** | No — blocked by design | Listed in unsupported panel only | Converter is a separate future PR |

---

## Part 9 — Three Possible Next PRs

### Option 1 — Consolidation PR (recommended if audit finds crowding worth fixing)

**PR title:** `refactor: Remove or merge "Current Scenario" summary card duplication with #sw-meta-card`

**Why needed:** The "Current Scenario" card (sw-name, sw-status, sw-phase, sw-blue-force, sw-red-force, sw-terrain) and `#sw-meta-card` (label, steps, phases, bbox, schema) partially overlap. `#sw-live-scenario-header` already shows title, step, phase, source. Some fields are never populated in the current scenario format (sw-blue-force, sw-red-force, sw-terrain show "—" always because those fields aren't in step data).

**What it changes:** Hides or merges fields that are permanently empty; moves relevant unique fields into the live header or meta card; removes crowding above #sw-live-workspace.

**What it must NOT touch:** Any production paint function; `#sw-live-workspace` contents; `#sw-meta-card` itself; state objects.

**Risk:** Low — display-only; does not touch import, map, or decision paths.

**Browser testing required:** Yes — verify no cards disappear that are actively used.

---

### Option 2 — Live Workflow PR (only if feature genuinely doesn't exist)

**PR title:** `feat: Wire #spt-card phase timeline to real scenario phase_table data`

**Why needed:** `#spt-card` exists and is already positioned in the secondary section. Its `paintPhaseTimeline()` function uses a hardcoded in-memory `PHASES` array. The live scenario JSON can carry a `phase_table` field. Wiring `paintPhaseTimeline()` to read actual phases from `window.RmoozScenario.scenario.phase_table` would make this card real.

**What it changes:** Modifies `paintPhaseTimeline()` to read from the scenario slot when available, fall back to hardcoded array when not. Moves the card into or near `#sw-live-workspace` after conversion.

**What it must NOT touch:** Import path; state objects; map; decision card; secondary cards toggle.

**Risk:** Low-Medium — involves modifying a paint function in scenario-workspace.js.

**Browser testing required:** Yes — load a scenario with phase_table and verify the timeline shows real phases.

---

### Option 3 — Converter / Adapter PR

**PR title:** `feat: Add W3 → live RMOOZ scenario JSON converter (console-only, no UI)`

**Why needed:** `wargame3.json` is a rich scenario but uses the W3 schema (different structure from RMOOZ live format). `adaptWargame3ToFixture()` already converts W3 to a dry-run fixture. A companion converter (pure function) that converts W3 to the live RMOOZ format would allow `loadLiveScenarioFromJson()` to accept it, enabling the full live workflow (step navigation, involved units, event log, overlay) to work with W3 data.

**What it changes:** Adds one pure function `adaptWargame3ToLiveScenarioFormat(w3json)` to the public API. No UI. No DOM. No storage. No map changes. Tested via console.

**What it must NOT touch:** Live overlay (it will work automatically once coord tables are populated); any existing UI; any state objects; `validateLiveScenarioJson()` (must still pass all checks).

**Risk:** Low (pure function, console-only first).

**Browser testing required:** Partial — test in console; if wired to folder intake, test import flow.

---

## Part 10 — Final Recommendations

### 1. What should we NOT build because it already exists?

| Feature | Already in | Status |
|---|---|---|
| Step status (pending/decided/skipped/blocked) | `#sw-live-step-status-actions` + `#sw-live-step-status-badge` | Live, visible, real |
| Operator event log | `#sw-live-event-log-card` | Live, visible, tabular |
| Involved units (actors + affected) | `#sw-live-step-units-card` | Live, visible |
| Decision options + selection | `#sw-live-decision-options` + `#sw-live-decision-selected` | Live, visible |
| Map overlay toggle | `#sw-nav-overlay-toggle` | Live, visible |
| Step navigation + play/speed | `#sw-nav-card` | Live, visible |
| Force snapshots | `#sw-bf-card`, `#sw-rf-card`, `#sw-fs-card` | Live, visible |
| Scenario metadata | `#sw-meta-card` | Live, visible |
| Scenario brief | `#sw-brfg-card` | Live, visible |
| Walkthrough / step detail cards | `#sw-wt-card`, `#sw-sps-card`, `#sw-sn-card`, `#sw-fr-card`, `#sw-dp-card` | Live, visible |
| Import diagnostics | `#sw-live-scenario-import-status/summary` | Live, visible |

### 2. What should we reuse from existing dry-run / developer areas?

- **Phase Timeline (`#spt-card`):** Convert `paintPhaseTimeline()` to read from `scenario.phase_table` before promoting.
- **Operator Intent Draft (`#oid-card`):** Fix the `oid-value-phase` "Briefing" hardcode; then promote to live if needed.
- **Unit scope (`#sw-drp-unit-scope`):** Not needed in live — `#sw-live-step-units-card` is better.
- **W3 dry-run scenario:** Use via `adaptWargame3ToFixture()` or write a converter; do not create a new adapter.

### 3. What should remain hidden / developer-only?

- `#sw-drp-section` and all its children — W3 dry-run preview (entire section)
- `#sw-w3-load-bar` — W3 load trigger
- `#sw-local-json-source-card` — Decision Package Import (advanced body)
- `#spt-card`, `#oid-card`, `#apc-card`, `#pra-card`, `#dps-card` — until real data/service wired
- `#uild-card` — diagnostics, for developer use in secondary section
- All pure type-guard/builder functions (validateStagingCandidate, isStagingProposalSafe, buildStagingProposal, etc.) — console API only

### 4. What is the cleanest next PR?

**Option 3 — W3 → live RMOOZ converter (pure function, console-only)**

This is the cleanest because:
- It unblocks testing the full live workflow with real W3 data
- It is a pure function (no DOM, no state, no UI risk)
- It does not add, remove, or rearrange any UI elements
- It uses existing infrastructure (`validateLiveScenarioJson()`, `loadLiveScenarioFromJson()`)
- Once it passes console tests, it can be wired to the folder intake in a follow-up PR

Alternatively, **Option 2** (wire phase timeline to real data) is equally safe and more visible.

**Do NOT start a new feature PR** until this audit is reviewed and a specific gap is confirmed absent from the live workspace.

### 5. What should the user manually inspect in the browser before continuing?

1. **Load `wargame3.json` via the Live Scenario Import.** Check if the step navigator activates, if the overlay works, if the involved units card populates. This tells you what the live workflow already handles without any new code.

2. **Navigate several steps** after loading a scenario. Verify that `#sw-live-step-units-card`, `#sw-live-event-log-card`, and `#sw-live-decision-card` update correctly.

3. **Click "Show secondary tools"** to expand `#sw-secondary-cards-body`. Read each card (spt, oid, apc, pra, dps, uild) to confirm they are clearly labelled as mock/placeholder and not mistaken for live functionality.

4. **Expand "Show advanced imports"** to see Decision Package Import. Confirm it is clearly labelled as developer/advanced.

5. **Check the folder intake**: select a folder containing a RMOOZ JSON, scan it, select a candidate, and import. Verify the live workspace updates.

6. **Check the external catalog section**: confirm the selector is disabled (no catalog loaded) and the source trace shows "No external scenario selected."

7. **Verify that `#sw-drp-section` is not visible** anywhere on the page (it should remain hidden).

---

## Appendix — Files Verified Untouched

The following files were read but not modified:
- `UI_MOdified/client/app.html` — read-only
- `UI_MOdified/client/shell/scenario-workspace.js` — read-only
- `UI_MOdified/client/i18n.js` — not read (not needed; key names confirmed via JS source)
- `UI_MOdified/client/style.css` — not read
- `UI_MOdified/client/app.js` — not read
- `UI_MOdified/client/adjudicator-map.js` — not read
- `UI_MOdified/data/scenarios/wargame3.json` — not read
- All backend files — not read

---

*Audit complete. No files modified. 2026-05-29.*
