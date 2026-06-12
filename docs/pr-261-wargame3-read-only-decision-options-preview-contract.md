# PR-261 — Wargame 3 Read-Only Decision Options Preview Contract

**Status:** Contract only — no production code changed, no source data changed  
**Depends on:** PR-258 (schema contract), PR-259 (type guards), PR-260 (source contract)  
**Next PR:** PR-262 — Wargame 3 Decision Options Fixture Example  
**Date:** 2026-05-27

---

## 1. Executive Summary

Wargame 3 is in **read-only walkthrough** state. The map preview pipeline, ops ledger, compact summary, movement trails, and objective highlight are all operational.

The two fields that would make a step decision-complete — `selectedDecision` and `expectedResult` — remain absent from all 17 source steps. Both display as `"Pending — not set in W3 source"` in `_paintToDOM`. Two `MISSING_FIELD` warnings are emitted per step. `previewComplete` is `false` on all steps. This is correct and expected.

`decisionOptions[]` does not yet exist anywhere in `wargame3.json`. This PR defines the **display contract** for when it does arrive in a future data PR.

Specifically, this contract defines:

| Topic | Decision |
|---|---|
| Where in the preview options should appear | After compact summary + event log; before warnings |
| Which fields to display | `label`, `description`, `intent`, `source`, `readOnly` indicator |
| Which fields are optional | `affectedUnits[]`, `expectedEffects[]`, `risks[]`, priority |
| What must not happen when options are displayed | No selection, no execution, no `selectedDecision` creation, no `previewComplete` change |
| What validation runs before display | `isWargame3DecisionOptionSafe` on every item |
| What happens if options are absent/empty | Silence — no fake option, no noisy empty panel |
| How to signal read-only state | Static label text + no interactive controls |

**This PR does not implement any UI, add any DOM elements, or change any data.**

---

## 2. Current State

As of 2026-05-27, the W3 preview display (`_paintToDOM`, `_buildW3EventLog`, `_paintW3StepSummary`) renders the following sections in order:

### 2.1 Current `_paintToDOM` Section Order

| # | DOM element | Content | W3-specific? |
|---|---|---|---|
| 1 | `sw-drp-w3-context` | "Wargame 3  ·  Dry-Run Preview  ·  Read-only" | W3 only |
| 2 | `sw-drp-fixture` | Package/fixture name | All |
| 3 | `sw-drp-step` | "W3-STEP-08 (9 / 17)" | All |
| 4 | `sw-drp-step-title` | Step summary string | All |
| 5 | `sw-drp-situation` | Narrative text from `p.situation` | All |
| 6 | `sw-drp-decision` | "Pending — not set in W3 source" | W3 (special label) |
| 7 | `sw-drp-result` | "Pending — not set in W3 source" | W3 (special label) |
| 8 | `sw-drp-units` | Unit text list from `p.unitsReferenced` | All |
| 9 | `sw-drp-objectives` | Objectives list from `p.objectivesReferenced` | All |
| 10 | `sw-drp-obj-status` | Colored status chip (`p.objectiveStatusBaseline`) | W3 only |
| 11 | `sw-drp-effects` | Proposed visual effects from `p.proposedVisualEffects` | All |
| 12 | `sw-drp-warnings` | MISSING_FIELD + other warnings | All |
| 13 | `sw-drp-status` | "Partial — missing decision/result  ·  Read-only" | W3 (special label) |
| 14 | `sw-drp-safety` | "Preview only · No live changes" | All |
| 15 | `sw-drp-step-summary` | Compact summary block (PR-238) | W3 only |
| 16 | `sw-drp-event-log` | Ops ledger (PR-240) | W3 only |
| 17 | *(map overlay)* | PR-243/245 read-only map layer | W3 only (internal) |

### 2.2 Current State Variables

| Variable | Current Value | Source |
|---|---|---|
| `step.selectedDecision` | `null` (all 17 steps) | Adapter Rule S5 |
| `step.expectedResult` | `null` (all 17 steps) | Adapter Rule S10 |
| `step.decisionOptions` | Not present anywhere | Not yet in `wargame3.json` |
| `previewComplete` | `false` (all 17 steps) | `decisionOk && resultOk && counterOk` all fail |
| `MISSING_FIELD` warnings | 2 per step (selectedDecision, expectedResult) | `buildScenarioStepPreview` |
| `decision_point_baseline` | `null` (all 17 steps) | Source JSON |

### 2.3 Current Event Log Row Types

The ops ledger (`_buildW3EventLog`) emits these row types in order:

```
STEP   — step summary (always 1 row)
OBJ    — objective status (1 row when objectiveStatusBaseline is set)
UNIT   — key units (up to 4 rows + "+N more")
EFFECT — effect count summary (1 row when proposedVisualEffects > 0)
WARN   — one row per MISSING_FIELD / source-gap warning
```

No `OPTION` row type exists yet. No `COA` row type exists yet.

---

## 3. Preview Ownership Rule

`decisionOptions[]` items are **source-authored or instructor-authored COA candidates**. The preview layer is a passive reader — it may display options as static text but must not act on them.

| Action | Status |
|---|---|
| Display options as read-only text | **Permitted** |
| Run `isWargame3DecisionOptionSafe` before display | **Required** |
| Select an option automatically | **FORBIDDEN** |
| Rank options unless `priority` is source-provided | **FORBIDDEN** |
| Recommend one option over others | **FORBIDDEN** |
| Pre-select the first option by default | **FORBIDDEN** |
| Execute any option | **FORBIDDEN** |
| Call AI to choose an option | **FORBIDDEN** |
| Mutate `window.units`, `window.lines`, `window.RmoozScenario` | **FORBIDDEN** |
| Paint new Leaflet markers based on option content | **FORBIDDEN** |
| Write option data to storage or backend | **FORBIDDEN** |
| Show option `id` as a confirmation code | **FORBIDDEN** |

The preview is a **catalogue display** — equivalent to reading a menu without ordering from it.

---

## 4. Display Placement

### 4.1 Recommended Position in the Preview Area

The decision options section should be inserted **after the event log** and **before the warnings section** in the W3 dry-run preview area. The proposed section order becomes:

| # | Section | Notes |
|---|---|---|
| 1–14 | Existing sections (unchanged) | See §2.1 table |
| 15 | Compact step summary (`sw-drp-step-summary`) | Existing — PR-238 |
| 16 | Event log / ops ledger (`sw-drp-event-log`) | Existing — PR-240 |
| **17** | **Decision Options read-only section** *(new — future PR)* | **W3 only; hidden when options absent** |
| 18 | Warnings (existing) | Already rendered inside `_paintToDOM` |

### 4.2 Visibility Rules

| Condition | Behavior |
|---|---|
| `p.decisionOptions` is absent or undefined | Section hidden — do not show empty panel |
| `p.decisionOptions` is an empty array | Section hidden — do not show empty panel |
| All items fail `isWargame3DecisionOptionSafe` | Section shows a source-warning message; no option cards rendered |
| At least one item passes the guard | Section shown with passing items only |

**Do not show an empty "No decision options available" panel in normal walkthrough mode.** The absence of options is the current normal state and should not create visual noise. An empty panel may be shown only in a dedicated diagnostics mode (out of scope for this contract).

### 4.3 Section Structure (Future Implementation Sketch)

```
[Decision Options]
  ┌──────────────────────────────────────────────────────────────┐
  │  READ-ONLY  ·  Available COAs  ·  Source: source_json        │
  ├──────────────────────────────────────────────────────────────┤
  │  COA 1 of 3  ·  W3-STEP-08-COA-01                           │
  │  Hold current defensive posture                              │
  │  Intent: Preserve blue combat power while observing RED      │
  │          repositioning before committing to action.          │
  │  Expected effects: 2  ·  Risks: 2  ·  Units affected: 0     │
  ├──────────────────────────────────────────────────────────────┤
  │  COA 2 of 3  ·  W3-STEP-08-COA-02                           │
  │  ...                                                         │
  └──────────────────────────────────────────────────────────────┘
```

This is an **illustration only** — not a design specification. The actual HTML structure is defined in the PR that implements the display (PR-264 scope).

### 4.4 Alternative: Ops Ledger OPTION Rows

A lighter alternative is to add `OPTION` rows to the event log instead of a dedicated section:

```
STEP   PRE-H    PREVIEW    Phase 0 – Naval interdiction...
OBJ    PRE-H    PREVIEW    THREATENED — Coastal Radar Network
UNIT   PRE-H    BLUE       Corvette Alpha / Naval interdiction
OPTION PRE-H    SOURCE     COA-01: Hold current defensive posture
OPTION PRE-H    SOURCE     COA-02: Reinforce coastal air/radar defense
WARN   PRE-H    PREVIEW    Decision not set in source
```

**This approach is permitted but deferred.** Adding `OPTION` rows to the existing `_buildW3EventLog` is a simpler implementation path (fewer new DOM elements), but it reduces the detail visible per option. It may be used as a stepping-stone in PR-263 before a full dedicated section.

If `OPTION` rows are added to the event log, they must:
- Be read-only text rows with no interactive controls
- Not suppress existing `WARN` rows for `selectedDecision`/`expectedResult`
- Not change the `previewComplete` computation
- Use the source-value label (e.g., `"SOURCE"`) not `"AI"` or `"SELECTED"`

### 4.5 Scope of This Contract

This contract defines **what to display and what not to do**. It does not define HTML element IDs, CSS classes, i18n keys, or component architecture. Those details belong to the implementing PR.

---

## 5. Read-Only Display Fields

### 5.1 Required Visible Fields

For each option that passes `isWargame3DecisionOptionSafe`, the future display must show at minimum:

| Field | Source | Display purpose |
|---|---|---|
| `label` | `option.label` | Primary option title |
| `description` | `option.description` | Operational description |
| `intent` | `option.intent` | Why this option would be chosen |
| `source` | `option.source` | Where this option came from (`"source_json"`, `"instructor"`) |
| `readOnly` indicator | `option.readOnly === true` | Confirm non-selectable state |
| Option index | Array position (1-based) | "COA 1 of 3" — navigation context |

> **Note on `intent`:** PR-260 requires `intent` as an authoring standard. `isWargame3DecisionOptionSafe` does not currently validate it. The display should show it if present; fall back to `description` if absent. Do not fabricate intent text.

### 5.2 Optional Visible Fields

These fields may be shown when present and non-empty:

| Field | Display format |
|---|---|
| `affectedUnits` | Count: "Units affected: N" (not unit names unless guard passes) |
| `expectedEffects` | Count: "Expected effects: N" or text list |
| `risks` | Count: "Risks: N" or text list |
| `priority` | If source-authored: "Priority: N" — do not infer priority |
| `linkedObjectiveId` | If present: "Linked objective: <id>" |
| `instructorNotes` | Visible to instructor role only (out of scope for this PR) |

### 5.3 Fields That Must Not Be Shown

| Field / UI element | Reason |
|---|---|
| Selection checkbox or radio button | No selection until PR-265 |
| "Apply this option" button | No apply until Gate 7 |
| "Execute" / "Commit" / "Confirm" button | Safety boundary violation |
| "Recommended" badge or ranking | No AI-generated recommendation |
| "Pre-selected" state | No auto-selection |
| `optionRef` as a confirmation code | Misleads operator into thinking it is active |
| Any field named `applyNow`, `commitNow`, `executeNow`, `liveApply`, `mutateUnits`, `mutateMap`, `mutateScenario`, `backendCommit`, `autoApply`, `aiGenerated`, `simulationCommitted`, `gate7Approved` | Unsafe — blocked by guard |
| `expectedEffects` items labeled as actual outcomes | They are speculative — label as "Anticipated" or "Expected (unconfirmed)" |

### 5.4 Language / Copy Rules

| Context | Acceptable | Forbidden |
|---|---|---|
| Section header | "Available COAs", "Decision Options (read-only)", "Pending decision options" | "Ready to execute", "Select now", "Recommended actions" |
| Option label | As-sourced from `option.label` | AI-generated alternative labels |
| Effect items | "Anticipated: …", "Expected (unconfirmed): …" | "Confirmed: …", "Result: …", "Outcome: …" |
| Status | "Read-only", "Source: source_json" | "Active", "Selected", "Approved", "Live" |
| Missing options | *(section hidden)* | "No options available — generate one?" |

---

## 6. Empty / Missing Options Behavior

### 6.1 When `decisionOptions` Is Absent from the Step

Current state for all 17 W3 steps. No change to any output:

| Output | Behavior |
|---|---|
| Decision options section | Hidden |
| `selectedDecision` | Still `null` |
| `expectedResult` | Still `null` |
| `previewComplete` | Still `false` |
| `MISSING_FIELD` warning for `selectedDecision` | Still emitted |
| `MISSING_FIELD` warning for `expectedResult` | Still emitted |
| Ops ledger | Unchanged — STEP/OBJ/UNIT/EFFECT/WARN rows as today |
| Compact summary gap chip | Still shows "Decision/result pending" |

### 6.2 When `decisionOptions` Is Present but Empty (`[]`)

Same behavior as §6.1. An empty array is not an error for read-only walkthrough. The section remains hidden. No warning is emitted. Empty `decisionOptions: []` is identical to absent `decisionOptions` for display purposes.

### 6.3 When `decisionOptions` Is Present with Items

| Condition | Behavior |
|---|---|
| All items pass `isWargame3DecisionOptionSafe` | Section shown with all items |
| Some items fail the guard | Section shown with only passing items; failing items replaced by a source-warning row |
| All items fail the guard | Section shows a single source-warning message; no option content rendered |

Failing items must **never** be partially displayed. A partially-valid option is not displayed at all — it is replaced by: `"[Option <id> blocked — source validation failed]"`.

### 6.4 No Fake Option Generation

Under no circumstance should the preview fabricate a COA option when `decisionOptions` is absent:

| Forbidden action | Reason |
|---|---|
| Infer a "Hold" option from `step_advantage: null` | Inference violates ownership rules |
| Infer options from `actors[].action_what` | Unit actions ≠ commander decisions |
| Copy `objective_status_baseline` as a COA description | Status token ≠ decision |
| Call AI to generate missing options | AI/sim boundary locked after PR-12 |
| Show placeholder "Add decision options here" in operator view | Leads to confusion |

The correct response to missing options is silence in the display, plus the existing `MISSING_FIELD` warnings for `selectedDecision` and `expectedResult`.

---

## 7. Validation Before Display

### 7.1 Guard Requirement

Before rendering any `decisionOptions` item, the implementation must call:

```javascript
var guardResult = isWargame3DecisionOptionSafe(option);
if (!guardResult.passed) {
    // Do not render this item as a selectable or readable option
    // Log blocked reasons as source warnings
}
```

`isWargame3DecisionOptionSafe` is available on `window.AppShellScenarioWorkspace` (PR-259).

### 7.2 What the Guard Checks

| Check | Rule |
|---|---|
| Value is a non-null, non-array object | Required |
| `id` is a non-empty string | Required |
| `label` is a non-empty string | Required |
| `affectedUnits` is an array (if present) | Required |
| `expectedEffects` is an array (if present) | Required |
| `risks` is an array (if present) | Required |
| `source` is `"source_json"` or `"instructor"` (if present) | Required |
| `readOnly === true` | Required |
| None of the 12 unsafe fields present | Required |

### 7.3 What the Guard Does Not Check (Future Additions)

These authoring requirements from PR-260 are not yet validated by the guard:

| Field | Status |
|---|---|
| `description` non-empty | Not in guard — display shows `"—"` if missing |
| `intent` non-empty | Not in guard — display omits the field if missing |
| `id` unique within array | Array-level — not per-item |

A future `isWargame3DecisionOptionsArraySafe(arr)` function (named in PR-260 §11) should add these checks. Its implementation is deferred to PR-262 or PR-263.

### 7.4 Guard Result Handling

| `guardResult.passed` | Action |
|---|---|
| `true` | Render the option as read-only text |
| `false` | Replace with source-warning message; log `blockedReasons` to console (dev only) |

Blocked reasons must not be shown directly to the operator in production — they are diagnostic information for the scenario author. A sanitized message like `"[Option blocked — invalid source data]"` is sufficient for operator view.

---

## 8. Relationship to `selectedDecision`

### 8.1 Display Does Not Create `selectedDecision`

Rendering `decisionOptions[]` read-only does not populate `selectedDecision` on the step. The adapter Rule S5 remains in effect: `selectedDecision` is always `null` when adapted from W3 source data.

```
CURRENT STATE (unchanged):
  adaptWargame3ToFixture()
    → step.selectedDecision = null   // Rule S5 — never synthesised
```

Displaying options does not change this. After the display section renders, `step.selectedDecision` is still `null`.

### 8.2 `MISSING_FIELD` Warning for `selectedDecision` Remains

Showing `decisionOptions` must not suppress the `MISSING_FIELD` warning for `selectedDecision`. The warning reflects the absence of an **actual decision** — not the absence of candidate options. Options exist; a decision has not been made.

The two states are distinct:

| State | Warning status |
|---|---|
| No `decisionOptions`, no `selectedDecision` | MISSING_FIELD for selectedDecision — emitted |
| `decisionOptions` present, no `selectedDecision` | MISSING_FIELD for selectedDecision — **still emitted** |
| `selectedDecision` present and passes guard | MISSING_FIELD cleared |

### 8.3 `optionRef` Future Linkage

When operator selection is implemented (PR-265), the created `selectedDecision` will carry:

```json
{
  "optionRef": "W3-STEP-08-COA-01"
}
```

The display may then visually highlight the selected option. That linkage is out of scope for this PR. Until PR-265, no option should appear selected or highlighted.

### 8.4 No Pre-Selection by Index

Reading `decisionOptions[0]` as a default `selectedDecision` is forbidden. Highest `priority` value does not mean auto-selected. No option is pre-selected by default.

---

## 9. Relationship to `expectedResult`

### 9.1 `expectedEffects` Are Not `expectedResult`

This is the most critical distinction to preserve in the display layer:

| Field | Meaning | Validated by |
|---|---|---|
| `option.expectedEffects[]` | Anticipated (speculative) effects if this COA is chosen | `isWargame3DecisionOptionSafe` (must be array) |
| `step.expectedResult` | Adjudicated or instructor-confirmed outcome after apply | `isWargame3ExpectedResultSafe` |

The display must make this distinction visible. Labeling `expectedEffects` as "Expected Result" or "Outcome" is a safety error. Use:
- ✓ `"Anticipated effects"` or `"Expected (unconfirmed)"`
- ✗ `"Result"`, `"Outcome"`, `"Confirmed effect"`, `"Adjudicated"`

Rendering `expectedEffects` in the display does not clear the `MISSING_FIELD` warning for `expectedResult`.

### 9.2 `proposedVisualEffects` Also Distinct

`p.proposedVisualEffects` in the preview object are visual-only, text-only effect annotations derived from the preview builder. They are not `expectedResult`. They are not `decisionOptions`. They are already rendered in `sw-drp-effects`. No further linkage is needed.

`validateWargame3DecisionResultPair` blocks `previewCompleteEligible` if `step.expectedResult === step.proposedVisualEffects`. The display must not create this equality.

### 9.3 `objective_status_baseline` Not `expectedResult`

The display must not use `p.objectiveStatusBaseline` (e.g., `"THREATENED"`) as a proxy for `expectedResult`. This mapping was formally rejected in PR-257 (source audit) and PR-258 (schema contract).

### 9.4 Correct `expectedResult` Sources

`expectedResult` for a W3 step must arrive via:
- `source: "adjudication"` — post-apply adjudication engine (PR-265+ scope)
- `source: "instructor"` — explicit instructor record
- `source: "source_expected"` — pre-authored in source JSON

None of these are active in W3 today. The gap is documented and the `MISSING_FIELD` warning is correct.

---

## 10. `previewComplete` Rule

Decision options display must not change `previewComplete`. The rule is immutable until PR-265+:

```
previewCompleteEligible = true
  IFF ALL of:
    (1) step.selectedDecision passes isWargame3SelectedDecisionSafe
    (2) step.expectedResult    passes isWargame3ExpectedResultSafe
    (3) step.enemyCounterActions is a non-empty array
    (4) validateWargame3DecisionResultPair(step).passed === true
```

Effect of showing `decisionOptions[]`:

| Condition | Changed? |
|---|---|
| `selectedDecision` guard passes | No — still `null` |
| `expectedResult` guard passes | No — still `null` |
| `MISSING_FIELD` warning for `selectedDecision` | No — still emitted |
| `MISSING_FIELD` warning for `expectedResult` | No — still emitted |
| `previewCompleteEligible` | No — still `false` |
| `previewComplete` (step field) | No — still `false` |
| Status text in `sw-drp-status` | No — still "Partial — missing decision/result · Read-only" |
| Gap chip in compact summary | No — still "Decision/result pending" |

Adding `decisionOptions` to a step is not a signal that the step is decision-ready. It is a signal that the step has authored COA candidates — a necessary but not sufficient condition for `previewComplete`.

---

## 11. Ops Ledger Relationship

### 11.1 Existing Row Types Unchanged

The ops ledger (`_buildW3EventLog`, PR-240) currently emits:

```
STEP → OBJ → UNIT (×N) → EFFECT → WARN (×N)
```

These rows and their order remain unchanged in this PR and in any PR that implements read-only options display.

### 11.2 Future `OPTION` Row

A future PR (PR-263 or PR-264 scope) may add `OPTION` summary rows to the ops ledger as a lightweight alternative to a dedicated display section. An `OPTION` row would look like:

```
OPTION  PRE-H  SOURCE  COA-01: Hold current defensive posture
```

Rules for future `OPTION` rows:

- Type code is `OPTION` (new, not `STEP`/`OBJ`/`UNIT`/`EFFECT`/`WARN`)
- Source column shows `"SOURCE"` (not `"AI"`, `"SELECTED"`, `"SYSTEM"`)
- Message column shows `"<id>: <label>"` — no execute language
- `WARN` rows for `selectedDecision`/`expectedResult` still appear after `OPTION` rows
- Rows are read-only text only — no interactive elements inside the row

**Do not add `OPTION` rows in this PR.** This subsection documents the future path, not the current implementation.

### 11.3 Ordering if `OPTION` Rows Are Added

If a future PR adds `OPTION` rows, they should appear between `EFFECT` and `WARN`:

```
STEP → OBJ → UNIT (×N) → EFFECT → OPTION (×N) → WARN (×N)
```

This preserves the informational-then-warning flow: operational facts first, source gaps last.

---

## 12. Map Relationship

Decision options are purely textual COA descriptions. They carry no spatial data. Their display must not trigger any map operations:

| Map action | Status |
|---|---|
| Paint new Leaflet markers | FORBIDDEN |
| Create movement trails from option data | FORBIDDEN |
| Create range circles | FORBIDDEN |
| Create weapon/sensor/detection rings | FORBIDDEN |
| Move existing markers | FORBIDDEN |
| Clear the read-only preview overlay | FORBIDDEN (unless the step itself is cleared) |
| Trigger `paintWargame3ReadOnlyMapOverlay` | FORBIDDEN — only triggered by step preview change |

`affectedUnits[]` in an option is a list of unit identifiers. Even if UIDs in `affectedUnits` happen to match markers already on the map, the display must not highlight, move, or modify those markers. The read-only preview overlay is driven solely by `buildWargame3ReadOnlyMapOverlayData` — not by `decisionOptions` content.

Any future "spatial preview" of a COA option (e.g., showing where units would move) requires a separate, fully contracted PR that goes through the existing read-only overlay pipeline with its own safety guard.

---

## 13. Future UI Safety Rules

Any future implementation of decision options display must satisfy these constraints:

### 13.1 Control Prohibition

| Control type | Status |
|---|---|
| Button labeled "Apply", "Execute", "Run", "Commit", "Confirm", "Approve", "Go Live" | FORBIDDEN |
| Radio button (implies mutually exclusive selection) | FORBIDDEN until PR-265 |
| Checkbox with "Select this option" label | FORBIDDEN until PR-265 |
| Dropdown for "Select a COA" | FORBIDDEN until PR-265 |
| Hover tooltip suggesting execution | FORBIDDEN |

### 13.2 Visual Prohibition

| Visual element | Status |
|---|---|
| Green "safe to execute" badge | FORBIDDEN |
| Recommendation badge ("Best choice") | FORBIDDEN |
| Pre-highlighted / pre-selected option | FORBIDDEN |
| Progress bar suggesting option is being processed | FORBIDDEN |
| Spinner or loading state on any option | FORBIDDEN |

### 13.3 Required Visual Indicators

| Indicator | Requirement |
|---|---|
| "Read-only" label on the section | Required |
| `readOnly: true` confirmed per option | Required (may be shown as a small tag) |
| `source` value shown | Required (e.g., "Source: source_json") |
| Option count shown | Required (e.g., "3 options available") |

### 13.4 Accessibility

- Each option should be renderable as text without interactive DOM elements
- Screen readers should not interpret options as clickable choices
- Tab order should skip options if no selection is possible

---

## 14. Minimal Future Preview Example (W3-STEP-08)

The following shows how the three COA options from PR-260 §10 would render as read-only text in the decision options section. This is a **text mock** — not HTML, not a final design.

---

```
[Decision Options]  (Read-only · Source: source_json · 3 options)

COA 1 of 3 — W3-STEP-08-COA-01                                     [Read-only]
  Hold current defensive posture
  Intent: Preserve blue combat power while observing RED repositioning before
          committing to action.
  Anticipated effects: 2   ·   Risks: 2   ·   Units affected: 0
  Source: source_json

──────────────────────────────────────────────────────────────────────────────

COA 2 of 3 — W3-STEP-08-COA-02                                     [Read-only]
  Reinforce coastal air and radar defense
  Intent: Reduce vulnerability of coastal radar network, which RED is actively
          targeting, to preserve blue air picture.
  Anticipated effects: 2   ·   Risks: 2   ·   Units affected: 0
  Source: source_json

──────────────────────────────────────────────────────────────────────────────

COA 3 of 3 — W3-STEP-08-COA-03                                     [Read-only]
  Contest mine clearance operations
  Intent: Slow RED operational tempo by denying mine clearance progress,
          maintaining coastal approach barriers.
  Anticipated effects: 2   ·   Risks: 2   ·   Units affected: 0
  Source: source_json

──────────────────────────────────────────────────────────────────────────────

  ⚠ Decision not set in source (MISSING_FIELD)
  ⚠ Result not set in source   (MISSING_FIELD)
```

---

This mock demonstrates:
- Options rendered **after** the event log
- **No selection controls** of any kind
- `[Read-only]` tag on every item
- `source_json` label — not `"AI"` or `"SYSTEM"`
- `"Anticipated effects"` — not `"Result"` or `"Outcome"`
- `MISSING_FIELD` warnings still appear below options
- `selectedDecision` and `expectedResult` are still absent

---

## 15. Test / Verification Plan

Future PRs implementing this display contract should verify the following:

### 15.1 Valid Options Are Displayed Read-Only (PR-264)

- All passing items rendered with label, description, intent, source
- No interactive controls present in the rendered output
- `readOnly: true` indicator visible
- Count "N options available" shown

### 15.2 Invalid Options Are Blocked (PR-263 or 264)

- Item with `applyNow: true` → not rendered; source-warning shown
- Item with missing `id` → not rendered
- Item with missing `label` → not rendered
- Blocked item count logged to console (dev only)

### 15.3 Missing Options Produce No Fake Output (PR-264)

- Step with no `decisionOptions` → section hidden
- Step with `decisionOptions: []` → section hidden
- No placeholder option generated

### 15.4 Options Do Not Affect Decision/Result Fields (PR-264)

- After rendering options, `step.selectedDecision` still `null`
- After rendering options, `step.expectedResult` still `null`
- After rendering options, `previewComplete` still `false`
- `MISSING_FIELD` warning for `selectedDecision` still emitted
- `MISSING_FIELD` warning for `expectedResult` still emitted
- Status text still "Partial — missing decision/result · Read-only"

### 15.5 Options Do Not Affect Map (PR-264)

- No new Leaflet markers added by option display
- No movement trails added
- `buildWargame3ReadOnlyMapOverlayData` output unchanged by option presence

### 15.6 Options Do Not Modify Event Log (PR-264, unless OPTION rows contracted)

- `STEP`, `OBJ`, `UNIT`, `EFFECT`, `WARN` row counts unchanged unless PR explicitly adds `OPTION` rows
- `OPTION` rows only added if a separate data-authored contract covers them

### 15.7 No Mutation (PR-264 and all future PRs)

- `window.RmoozScenario` unchanged after display
- `window.units` unchanged
- `window.lines` unchanged
- No `fetch()` / `XMLHttpRequest` triggered by option display
- No localStorage write triggered by option display
- No `/api/sim/*` calls triggered

### 15.8 Regression: PR-259 Guards Still Work (all future PRs)

- `isWargame3DecisionOptionSafe` still callable
- `isWargame3SelectedDecisionSafe` still callable
- `validateWargame3DecisionResultPair` still callable
- Adapter `selectedDecision: null` (Rule S5) still present
- Adapter `expectedResult: null` (Rule S10) still present

---

## 16. Migration Path

```
PR-260  (done)    Source Contract — per-step decisionOptions[] shape, placement, example
PR-261  (this)    Preview Contract — read-only display rules, field mapping, placement
PR-262  (next)    Decision Options Fixture Example
                  — create a test fixture (separate file, not wargame3.json) with
                    authored decisionOptions for W3-STEP-08
                  — verify all items pass isWargame3DecisionOptionSafe
                  — test file only; no production data change; no UI
PR-263            Read-Only Decision Options Preview Data Adapter
                  — pure JS helper (no DOM) that maps a step's decisionOptions[]
                    through isWargame3DecisionOptionSafe and returns a display-safe
                    array for the future renderer
                  — no UI; pure function only
PR-264            Read-Only Decision Options Display UI
                  — render passing options in the dry-run preview area (W3 only)
                  — no selection controls; section hidden when options absent
                  — uses PR-263 adapter output
PR-265            Operator Selection Dry-Run Record Contract
                  — define how operator selects one option in memory only
                  — selectedDecision.optionRef references decisionOptions[].id
                  — no backend commit; no Gate 7; in-memory dry-run only
PR-266            Expected Result Adjudication Source Contract
                  — define how adjudication/instructor provides expectedResult
                  — previewComplete may become eligible after PR-265 + PR-266
```

**Do not implement live apply, Gate 7, or backend commit in any of PR-261 through PR-266.**

---

## 17. Safety Boundary Confirmation

As of 2026-05-27, the following invariants hold and are unchanged by this PR:

| Invariant | Status |
|---|---|
| `scenario-workspace.js` unchanged | Confirmed |
| `wargame3.json` unchanged | Confirmed |
| `app.js` unchanged | Confirmed |
| `adjudicator-map.js` unchanged | Confirmed |
| `app.html` / `style.css` / `i18n.js` unchanged | Confirmed |
| `step.selectedDecision` still `null` on all 17 W3 steps | Confirmed — adapter Rule S5 |
| `step.expectedResult` still `null` on all 17 W3 steps | Confirmed — adapter Rule S10 |
| `decisionOptions` not added to production data | Confirmed — this PR is contract only |
| `previewComplete` still `false` on all 17 steps | Confirmed |
| `MISSING_FIELD` warnings for `selectedDecision` still emitted | Confirmed |
| `MISSING_FIELD` warnings for `expectedResult` still emitted | Confirmed |
| No storage / fetch / backend / AI / simulation / journal | Confirmed |
| No apply / commit / confirm / execute / Gate 7 | Confirmed |
| No map / unit / line / scenario mutation | Confirmed |
| AI/sim boundary locked (PR-12) | Confirmed — no change |
| `objective_status_baseline` not mapped to `expectedResult` | Confirmed |

---

## Appendix A: Current Display Path — Key Functions

For implementors who will add the decision options section in PR-264:

```
paintDryRunPreview(previewOverride?)          ← entry point
  └─ _paintToDOM(p, warnsArr)                 ← main DOM painter
       ├─ setText('sw-drp-decision', ...)      ← "Pending — not set in W3 source"
       ├─ setText('sw-drp-result', ...)        ← "Pending — not set in W3 source"
       ├─ [warnings section]                  ← existing sw-drp-warnings
       ├─ _paintW3StepSummary(p)              ← compact summary (PR-238)
       ├─ _buildW3EventLog(p, warnsArr)       ← ops ledger (PR-240)
       │    └─ addRow(time, type, src, msg)   ← STEP/OBJ/UNIT/EFFECT/WARN
       └─ paintWargame3PreviewMapOverlay...   ← map bridge (PR-243/245)
```

The decision options section (PR-264 scope) should be inserted between `_buildW3EventLog` and the map bridge call, or between the compact summary and the event log — whichever proves cleaner in the implementing PR.

---

## Appendix B: Relationship to Prior Contracts

| PR | Defines | Relation to this PR |
|---|---|---|
| PR-258 | `selectedDecision` / `expectedResult` schema, Model C, migration path | This PR implements PR-258's PR-261 step |
| PR-259 | `isWargame3DecisionOptionSafe`, `isWargame3SelectedDecisionSafe`, `validateWargame3DecisionResultPair` | This PR specifies that the guard runs before display |
| PR-260 | Source shape, placement, safety rules, W3-STEP-08 example | This PR specifies how that source data should be displayed |
| PR-240 | `_buildW3EventLog` — STEP/OBJ/UNIT/EFFECT/WARN row types | This PR specifies that row types are unchanged; future OPTION rows deferred |
| PR-238 | `_paintW3StepSummary` — compact summary with gap chip | Gap chip "Decision/result pending" unchanged by option display |
| PR-229 | W3 MISSING_FIELD expected-warning styling | Those warnings remain; not suppressed by option presence |
