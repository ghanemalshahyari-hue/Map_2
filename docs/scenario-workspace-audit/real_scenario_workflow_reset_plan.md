# Real Scenario Workflow Reset Plan

**Date:** 2026-05-28
**Status:** PLAN ONLY — no code changes, no UI changes, no demotion executed
**Scope:** `/Users/engcode/Desktop/Map_2/UI_MOdified/`
**Reason:** Refocus RMOOZ on the real/live scenario workflow. Stop expanding dry-run features.

---

## 1. The Imbalance — Numbers First

| Surface | Live | Dry-run / Preview / Catalog |
|---|---|---|
| Public exports on `window.AppShellScenarioWorkspace` | **1** (`refresh`) | **~75** |
| HTML IDs inside `#scenario-workspace-panel` | ~60 | **~174** |
| `scenario-workspace.js` line apportionment (15,455 total) | ~5,000 (32%) | **~10,400 (67%)** |
| Dedicated CSS rules (`.sw-drp-*`, `.sw-w3-*`, `.sw-dpkg-*`, `.sw-ext-*`, `.sw-evl-*`, `.sw-src-*`) | n/a | **~233** |
| W3/AMBER state variables | n/a | **7** (`_drpPreviewSource`, `_drpPreviewStepRef`, `_drpPreviewMode`, `_w3CoaReviewRecord`, `_w3ScenarioReviewSession`, `_w3ScenarioWorkflowState`, `_w3PreviewLayer`) |
| Live state mutation functions | **1** (`goToStep`) | n/a |

**~94% of the public API and ~67% of the main source file are dedicated to dry-run, preview, catalog, or staging surfaces that never touch `window.RmoozScenario`.**

---

## 2. Current Live Workflow Map

### 2.1 Live State

```
adjudicator-hud.js                 scenario-workspace.js
─────────────                      ──────────────────
loadScenarios()         ─writes─→  window.RmoozScenario = {
ensureScenarioLoaded()                scenario: {...},
publishRmoozScenario()                stepIndex: 0
                                   }
                       ─calls──→   AppShellScenarioWorkspace.refresh()
```

- **Writer:** `adjudicator-hud.js` `publishRmoozScenario()` (line 43). Triggered by `ensureScenarioLoaded`, every `adjudicateNext`, `runOneTrial`, and `scenario-changed` SSE.
- **Reader:** `scenario-workspace.js` — `getScenario()` (line 26), `getActiveStepIndex()` (line 31), `getActiveStep()` (line 36), `resolveLiveValue()` (line 42).
- **Mutator:** `goToStep()` (line 699) — **the only function that writes `stepIndex`**. Internal triggers: nav buttons, playback timer, walkthrough.

### 2.2 Live Refresh Cycle

`AppShellScenarioWorkspace.refresh()` (line 14768) paints, in order:

1. `paintSafety`, `paintService`, `paintLastDecision` (mirrors of other modules — NOT live scenario)
2. `paintScenarioOverview`, `paintPhaseTimeline`
3. `paintIntentCard`, `paintProposalCard`, `paintProposalActions`, `paintDecisionSummary` (**mostly mock/placeholder**)
4. `paintMetaCard`, `paintObjectiveCard`, `paintBlsCard`
5. `paintForceSummaryStrip`, `paintBlueForceCard`, `paintRedForceCard`
6. `paintWalkthroughCard`, `paintBriefingCard`
7. `paintStepNavigator`, `paintActionsCard`, `paintPlayButton`
8. `paintOverlayToggleButton`, `paintDecisionPackageCards`

### 2.3 Live Painters That Actually Read `window.RmoozScenario`

| Function | Live data read | DOM target |
|---|---|---|
| `paintScenarioOverview` | sc, active step | `#sw-name`, `#sw-status`, `#sw-phase` |
| `paintMetaCard` | sc.scenario_label, steps.length, phase_table, map_bbox, schema_variant | `#sw-meta-*` |
| `paintBriefingCard` | sc.purpose_en/_ar, end_state, constraints, assumptions | `#sw-brfg-*` |
| `paintStepNavigator` | sc.steps, curIdx | `#sw-nav-counter`, `#sw-nav-step-info`, `#sw-nav-phase-badge`, prev/next/first/last |
| `paintScenarioOverlay` | sc.blue_unit_step_coords, red_unit_step_coords, sides, step.unit_state | `_swScenarioOverlay` layer group on map |
| `paintActionsCard` | step.actors, step.affected | `#sw-act-actors-list`, `#sw-act-affected-list` |
| `paintObjectiveCard` | sc.obj | `#sw-obj-*` |
| `paintBlsCard` | sc.bls_template | `#sw-bls-list` |
| `paintForceSummaryStrip` / Blue/Red Force | blue_units_initial, red_units | `#sw-fs-*`, `#sw-bf-*`, `#sw-rf-*` |
| `paintStepSummaryCard`, `paintNarrativeCard`, `paintDecisionPointCard`, `paintForceRatioCard`, `paintWalkthroughCard` | active step | `#sw-ss-*`, `#sw-narr-*`, `#sw-dp-*` (live), `#sw-fr-*`, `#sw-wt-*` |

### 2.4 Mock / Placeholder Live Cards (UI exists, no real semantics)

These look live but are not yet wired to live scenario state:

- **`#spt-card`** Scenario Phase Timeline — `paintPhaseTimeline` (line 233) iterates a hard-coded `PHASES` array (line 224: briefing → planning → proposal-review → decision → dryrun-preview → aar). `sc.phase_table` is shown only as a count in `paintMetaCard`.
- **`#oid-card`** Operator Intent Draft — `paintIntentCard` (line 305) marked "In-memory placeholder fields — no backend, no mutation, no persistence." Uses `resolveLiveValue` for `phase` only; everything else falls back to `'—'`.
- **`#apc-card`** AI Proposal Card — `paintProposalCard` (line 367) marked "Mock/in-memory preview only." Only `apc-value-linked-intent` is wired (to phase string).
- **`#pra-card`** Proposal Review Actions — `paintProposalActions` (line 424) — `praSelection` (line 422) is a module-private string `'approve' | 'reject' | 'hold' | null`. **"No event log. No decision record. No API call."** (source comment line 492).
- **`#dps-card`** Decision Preview Summary — explicit disclaimer "Preview only. No decision is recorded and the scenario is unchanged." (line 562).

### 2.5 Map

`paintScenarioOverlay` is the **only** live map painter. It draws unit dots from per-step coordinate arrays on private layer `_swScenarioOverlay`. **No objective marker. No boundary. No engagement arcs. No phase line.** (Those exist in adjudicator-map.js for the wargame panel, but the scenario workspace does not own them.)

---

## 3. Missing Production Features

Listed in priority order for the live operator workflow:

### 3.1 Critical — needed for any real operator action

| # | Feature | Today | Gap |
|---|---|---|---|
| 1 | **Real decision selection on live step** | `praSelection` toggles a string in memory; never writes anywhere | No `liveDecision` state, no per-step write, no decision options sourced from `sc.steps[idx].decision_options` |
| 2 | **Real operator decision record** | `recordDecision()` in `ai-proposal-panel.js` writes only to in-memory `AppShellDecisionJournal`. **Never touches `window.RmoozScenario`** | Need a journal entry that is keyed to the live `scenarioId + stepIndex` and survives `refresh()` |
| 3 | **Live step status update** | `goToStep` only changes `stepIndex`; no notion of "this step is decided/skipped/blocked" | No `stepStatus` field, no UI badge, no transition |
| 4 | **Live outcome / result display** | No live "result of operator's decision" card | Mock fields exist in `#apc-card` but nothing is computed |
| 5 | **Controlled live mutation guard** | All mutation code paths are explicitly blocked (`liveMutationAllowed:false`, `backendCommitAllowed:false`) | Need a single audited entry point that flips mutation ON for a specific narrow operation (e.g., recording a decision) |

### 3.2 High — needed for usable workflow

| # | Feature | Today | Gap |
|---|---|---|---|
| 6 | **Operator identity in UI** | `isOperatorIdentitySafe` (line 2922) exists as console-only type guard | No UI control, no display, no association of decisions with an operator |
| 7 | **Real next-step progression** | `goToStep(idx+1)` works but with no guard ("did the operator complete this step?") | No "step completion" concept |
| 8 | **Audit log of live actions** | `AppShellEventLog` exists but not wired to live scenario actions | Decision recorded → log entry → visible in scenario workspace |
| 9 | **Undo / revert last live action** | No undo state at all | Need at minimum a single-level revert of the last live decision |
| 10 | **Scenario load/select inside workspace** | Selection happens only via `#wg-adj-scenario` in the wargame panel | No inline scenario picker in `#scenario-workspace-panel` |

### 3.3 Medium — needed for production polish

| # | Feature | Today | Gap |
|---|---|---|---|
| 11 | **Live phase timeline from `sc.phase_table`** | Hard-coded `PHASES` array | Read scenario's real phase_table; reflect actual phase per step |
| 12 | **Live scenario save / export** | No save anywhere | Operator records → export as JSON |
| 13 | **Role-based UI gating** | None | At minimum, "viewer vs operator" mode |

---

## 4. Dry-Run Features to Demote

The plan does NOT remove these. It demotes them — hides, collapses, or relabels — once the live workflow is functional.

### 4.1 Demote to "Developer / Testing Tools" (collapsed)

| Surface | What it is | Lines | Action |
|---|---|---|---|
| **`#sw-drp-section`** | W3 dry-run preview panel (53 IDs, the entire AMBER/W3 preview surface) | app.html 992–1290 | Move below live cards. Collapse by default. Label "Developer Preview". |
| **`#sw-w3-load-bar`** | Manual W3 load button | app.html 973 | Move into collapsed Developer Preview. |
| **AMBER RIDGE fixture** | Default-loaded training fixture | scenario-dry-run-fixtures.js | Stop auto-painting on init. Only paint when explicitly opened. |
| **COA Dry-Run Review (PR-266-273)** | `_w3CoaReviewRecord` flow | scenario-workspace.js 4193, 7428, 8864-9063 | Stays inside Developer Preview. Not exposed in main workflow. |
| **W3 audits (PR-244, 246, 249, 252)** | Coordinate/trail/objective coverage audits | 11260, 11485, 11858, 12676 | Console-only already. No UI change needed. Just don't add UI for them. |
| **W3 walkthroughs (PR-278/279)** | `runWargame3ScenarioWorkflowWalkthrough`, `checkWargame3ScenarioWorkflowAcceptance` | 12851, 13163 | Console-only already. Keep there. |
| **`#sw-drp-unit-scope`** | PR-285A scope label | app.html 1085 | Stays — it's the *correct* labelling for what dry-run actually shows. |

### 4.2 Demote to "Source Catalog / Import Staging" (separate area)

| Surface | What it is | Action |
|---|---|---|
| **`#sw-scenario-source-section`** (PR-283) | Local JSON + external catalog selector + preview + trace | Move to a separate collapsible "Scenario Source" area at the **bottom** of the panel. |
| External catalog exports (15 PR-280+ functions) | Pure builders, no live path involvement | No change in functionality, just visual demotion. |
| **`#sw-dp-loader-row`** and DPKG cards | Decision Package fixture loader + manifest/step/units/source cards (62 IDs) | Move into a "Decision Package Inspector" sub-area inside Developer Preview. |
| **PR-284 Source Trace** | `#sw-ext-trace-section` | Stays as a child of the External Catalog subcard. |

### 4.3 Hide Diagnostics by Default

| Surface | Action |
|---|---|
| **`#sw-dpkg-diagnostics`** (validation, readiness, step warning, source review) | Already collapsed-by-default. Confirm and keep. |
| **`#sw-diag-staging-card` + `#sw-fcl-section`** (11 Gate 1-7 rows) | Move into collapsed Developer Preview. |
| **Staging/Gate-7 pure validators** (23 exports) | Stay in console. No UI promotion. |

### 4.4 Replace, Don't Demote — Mock Cards That Look Live

These four cards appear in the live workflow but contain mock data. They should NOT be demoted — they should be **rebuilt** to read live state:

- `#spt-card` Scenario Phase Timeline → read `sc.phase_table`
- `#oid-card` Operator Intent Draft → wire to live operator action draft
- `#apc-card` AI Proposal Card → mark as future feature, hide until real bridge exists
- `#pra-card` Proposal Review Actions → become the real **live decision action** card (this is the target of PR-286L)
- `#dps-card` Decision Preview Summary → become the real **live decision summary**

---

## 5. Recommended Production-First Scenario Workspace Structure

Top-to-bottom inside `#scenario-workspace-panel`:

```
┌────────────────────────────────────────────────────────────────┐
│  A. LIVE SCENARIO HEADER                                       │
│     • Scenario name + version + status pill                    │
│     • Operator identity badge                                  │
│     • Scenario picker (inline, mirrors #wg-adj-scenario)       │
├────────────────────────────────────────────────────────────────┤
│  B. LIVE MAP / FULL FORCE POSTURE                              │
│     • Live Scenario Step Navigator (prev/next/jump)            │
│     • Step counter + phase badge                               │
│     • Full OOB overlay toggle                                  │
│     • Engagement-aware (which units are actors/affected)       │
├────────────────────────────────────────────────────────────────┤
│  C. LIVE STEP CARDS                                            │
│     • Step Summary, Narrative, Decision Point                  │
│     • Objective Snapshot, BLS Snapshot                         │
│     • Force Ratio, Force Summary, Blue Force, Red Force        │
│     • Walkthrough card                                         │
├────────────────────────────────────────────────────────────────┤
│  D. DECISION & OPERATOR ACTION  ◀── focus of PR-286L           │
│     • Live decision options for the active step                │
│     • Operator selects one (in-memory live workflow)           │
│     • Selection is recorded against scenarioId + stepIndex     │
│     • No backend save (later PR)                               │
│     • Audit row in event log                                   │
│     • Clear / undo this step's selection                       │
├────────────────────────────────────────────────────────────────┤
│  E. SCENARIO SOURCE                                            │
│     • [collapsed by default]                                   │
│     • Local JSON package import                                │
│     • External Scenario Catalog selector + preview + trace     │
├────────────────────────────────────────────────────────────────┤
│  F. DEVELOPER / TESTING TOOLS                                  │
│     • [collapsed by default]                                   │
│     • Wargame 3 Dry-Run Preview (#sw-drp-section + #sw-w3-*)   │
│     • AMBER RIDGE training fixture                             │
│     • Decision Package Inspector (sw-dpkg-* cards)             │
│     • Diagnostics (#sw-dpkg-diagnostics, staging readiness)    │
│     • W3 audits & walkthroughs (console-only)                  │
└────────────────────────────────────────────────────────────────┘
```

### Key principles
1. **The first screen the operator sees is live**, not dry-run.
2. **Dry-run is one click away** — collapsed but available for testing.
3. **No parallel preview systems are visible at once.**
4. **All operator actions touch live state**, gated by a single audited entry point.
5. **Existing PR-280-285A code stays untouched**; only its position in the layout changes.

---

## 6. Next Implementation PR

### PR-286L — Live Scenario Decision Action Baseline

**Goal:** Add the first production-oriented live decision action layer.

**Scope (in plain English):**
- Read the active live step from `window.RmoozScenario.scenario.steps[stepIndex]`.
- If that step has a `decision_options[]` array (or compatible field), render the options as a read-only list.
- Allow the operator to select exactly one option for the current live step.
- Store the selection in a NEW module-private `_liveOperatorWorkflowState` map keyed by `scenarioId + stepIndex`.
- Display the selection in a new live decision card.
- Provide a clear / undo button for the current step's selection.
- Emit an event log row for each selection.

**Hard limits:**
- No backend save. No `/api/sim/commit`. No staging.
- No auto-advance to the next step.
- No combat / effect execution.
- No use of `#sw-drp-section`, `_drpPreviewSource`, W3 fixture data, or AMBER RIDGE.
- No reuse of `praSelection` (line 422) — `pra-card` is mock-only and stays mock-only.
- No mutation of `window.RmoozScenario.scenario` itself. Only `stepIndex` mutation is allowed (existing).
- No new dry-run preview layers.

**Files expected to change:**
- `UI_MOdified/client/shell/scenario-workspace.js` — add `_liveOperatorWorkflowState`, `buildLiveDecisionActionSnapshot`, `paintLiveDecisionActionCard`, `recordLiveOperatorSelection`, `clearLiveOperatorSelection`.
- `UI_MOdified/client/app.html` — add `#sw-live-decision-card` with `#sw-live-decision-options`, `#sw-live-decision-selected`, `#sw-live-decision-clear-btn`.
- `UI_MOdified/client/i18n.js` — EN/AR keys for the new card.
- `UI_MOdified/client/style.css` — minimal styling.

**Public API additions (`window.AppShellScenarioWorkspace`):**
- `getLiveOperatorWorkflowState()` — read-only copy.
- `recordLiveOperatorSelection(stepIndex, optionId, options?)` — pure record, no backend.
- `clearLiveOperatorSelection(stepIndex)` — clear one entry.
- `paintLiveDecisionActionCard()` — DOM paint.

**Why this is the right first PR:**
1. It's the **first thing on this list that writes anything against the live scenario**.
2. It uses existing live accessors (`getActiveStep`, `getActiveStepIndex`).
3. It does NOT depend on backend, auth, or any future Gate 7 work.
4. It demonstrates that the production path can be built next to the dry-run path without conflict.
5. It establishes the pattern for all subsequent live-workflow PRs (record → display → audit log → undo).

**Acceptance criteria:**
- Load a real scenario via the wargame panel.
- Navigate to a step with decision options.
- See options listed.
- Click one option → it becomes the selected option for that step.
- Navigate away and back → selection persists in the workflow state (in memory).
- Clear button removes the selection.
- Event log shows OPERATOR_SELECTION row.
- No console errors.
- Existing W3 dry-run, external catalog, all PR-280-285A features still work unchanged.

---

## 7. What This Plan Does NOT Do

- **Does not delete dry-run code.** Demotion only.
- **Does not change scenario data files.** No edits to `wargame3.json` or any backend.
- **Does not modify `app.js`, `adjudicator-map.js`, or backend files.**
- **Does not introduce backend save, Gate 7, or `/api/sim/commit`.**
- **Does not execute combat, effects, or simulation.**
- **Does not break any of the 91 existing exports.** All current public API stays.
- **Does not start coding.** This document is plan-only.

---

## 8. Sequence After PR-286L (preview only — not committed)

If PR-286L lands cleanly, the natural follow-ups in priority order:

1. **PR-286L** — Live Decision Action Baseline (this plan's target)
2. **PR-287L** — Live Operator Identity Badge (UI for `isOperatorIdentitySafe`)
3. **PR-288L** — Live Step Status Update (mark decided / skipped / blocked)
4. **PR-289L** — Live Phase Timeline from `sc.phase_table` (replace hardcoded `PHASES`)
5. **PR-290L** — Live Decision Undo / Revert
6. **PR-291L** — Scenario Source Section collapsed-by-default (visual demotion of catalog)
7. **PR-292L** — Developer Preview collapsed-by-default (visual demotion of `#sw-drp-section` + DPKG)
8. **PR-293L** — Inline scenario picker inside `#scenario-workspace-panel`
9. **PR-294L** — Live Action Audit Log row template
10. **PR-295L** — Live Scenario Export (JSON snapshot of live workflow state)

Each "L" suffix marks a live-path PR, contrasting with the existing dry-run PR numbering.

---

## 9. Risk Register

| Risk | Mitigation |
|---|---|
| Breaking the 91 existing exports | Test every PR against the existing test suites (test-pr-280A.js, 280B.js, 280C.js, 281.js, 282.js, 283.js, 284.js, 285A.js — total ~770 tests). |
| Live decision write path becomes a back-door to backend commit | Never call `fetch`, never set `liveMutationAllowed:true`, never reference Gate 7. The PR-286L spec hard-blocks these. |
| Mock cards (`#oid-card`, `#apc-card`, `#pra-card`, `#dps-card`) get confused with the new live decision card | Add a "LIVE" badge to the new card; add a "MOCK" badge to the existing four. |
| Demoting `#sw-drp-section` breaks W3 walkthrough tests | Verify PR-285A and earlier W3 tests pass after visual demotion; functionality unchanged. |
| Scope creep into Gate 7 / backend / auth | This plan explicitly defers all of those. Each PR has a single goal. |

---

## 10. Decision Required Before PR-286L Starts

Confirm:
- The recommended layout (Section 5) is acceptable in principle.
- PR-286L scope (Section 6) is the right first move.
- The "demote, don't delete" approach (Section 4) is correct.
- The `_liveOperatorWorkflowState` lives in scenario-workspace.js, not in a new file.

If yes to all four → PR-286L is ready to start.

If any need adjustment → revise this plan first.

---

**End of Plan.**
