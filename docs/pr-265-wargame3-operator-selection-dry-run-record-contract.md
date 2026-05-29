# PR-265 — Wargame 3 Operator Selection Dry-Run Record Contract

**Date:** 2026-05-27
**Type:** Contract / design document — no runtime code changes, no data changes
**Depends on:** PR-258 (schema contract), PR-259 (type guards), PR-260 (source contract),
               PR-261 (preview display contract), PR-262 (fixture), PR-263 (adapter helper),
               PR-264 (read-only decision options display UI)
**Status:** Contract. Not yet implemented. No production file changes in this PR.
**Next PR:** PR-266 — Wargame 3 Expected Result Adjudication Source Contract

---

## 1. Executive Summary

Wargame 3 (W3) can now display `decisionOptions[]` in read-only mode (PR-264). Three COA
option cards are rendered, each carrying a "Read-only COA option" badge and metadata fields
(intent, affected units count, effects count, risks count, priority). No operator selection
controls exist yet.

This PR defines the **next safety contract**: how a future operator selection of one of those
displayed options may produce a structured in-memory **dry-run selection record**.

### What this contract defines

| Topic | Definition |
|---|---|
| What a dry-run selection record is | A pure in-memory object created when an operator explicitly selects a COA option |
| Who may create it | Explicit human operator action only |
| Where it lives | In memory only — no persistence, no backend, no storage |
| What it contains | `selectedDecision` sub-object + pointer to source option + status + safety flags |
| What it does NOT do | Execute, apply, commit, adjudicate, mutate map, mutate units, unlock Gate 7 |
| When `expectedResult` is created | Never by this record — only by adjudication/instructor in a later gate |
| When `previewComplete` may change | Never by selection alone — requires SD + ER + ECA + validator |

### What this contract does NOT define

- Selection UI controls (buttons, dropdowns, confirmation dialogs) — deferred to PR-269
- `expectedResult` generation — deferred to PR-266/270+
- Adjudication engine — outside RMOOZ scope until Gate 6
- Live execution, apply, or commit of any kind
- Gate 7 unlock conditions
- Backend communication of any kind

**No production code is changed in this PR. No wargame3.json changes. No selectedDecision is
created anywhere. No expectedResult is created. previewComplete remains false for all W3 steps.**

---

## 2. Current State (as of PR-264)

### 2.1 What PR-264 Delivered

PR-264 added the read-only Decision Options display panel (`#sw-drp-decision-options`).

| Component | State |
|---|---|
| `<section id="sw-drp-decision-options">` | Added to `app.html`, hidden by default |
| `_paintW3DecisionOptions(p)` | Added to `scenario-workspace.js`; W3-only painter |
| `buildWargame3DecisionOptionsPreviewData(step)` | PR-263 pure adapter; called by painter |
| 9 EN i18n keys | Added (`sw-drp-decision-options-title`, etc.) |
| 9 AR i18n keys | Added (Arabic translations) |
| CSS classes | Added (`.sw-drp-do-card`, `.sw-drp-do-readonly-badge`, etc.) |

### 2.2 Current State Variables

| Variable | Current Value | Source |
|---|---|---|
| `step.selectedDecision` | `null` (all W3 steps) | Adapter Rule S5 (`_w3pfc_copyStep`) |
| `step.expectedResult` | `null` (all W3 steps) | Adapter Rule S10 (`_w3pfc_copyStep`) |
| `step.decisionOptions` | Absent in `wargame3.json` | Not yet authored in source |
| `previewComplete` | `false` (all W3 steps) | `decisionOk && resultOk && counterOk` all fail |
| MISSING_FIELD warnings | 2 per step | `buildScenarioStepPreview` |
| Operator selection record | Does not exist | Not yet implemented |

### 2.3 What Is Visible in the Browser (with Fixture Injection)

Using the PR-264 console test snippet (`_paintW3DecisionOptions({decisionOptions: [...]})`), an
operator can see three read-only COA cards for W3-STEP-08. Each card shows:

- `READ-ONLY COA OPTION` badge (blue-tinted, uppercase)
- Display label: `COA 1 of 3 — Strike North`
- Description text
- Intent: row
- Affected units: count
- Anticipated effects: count
- Risks: count
- Priority: value (if present)

**No selection controls exist. There is no "Select this option" button. There is no confirm
dialog. Clicking anywhere on the card does nothing.** This is correct and expected per
PR-261 §7 (FORBIDDEN: Apply, Execute, Commit, selection controls).

### 2.4 The Gap This Contract Addresses

The PR-261 contract explicitly deferred operator selection to future PRs:

> "Apply, Execute, Commit, selection controls are FORBIDDEN until future PR (PR-265+)."

This document is that future PR — the **contract** for what operator selection must produce,
how it must be constrained, and what it must never do.

---

## 3. Operator Selection Ownership

### 3.1 Model C (Hybrid) — Confirmed

PR-258 and PR-260 established **Model C (Hybrid)** as the correct ownership model for W3:

```
Source JSON             Runtime (this contract's scope)      Post-Apply (future)
────────────────────    ────────────────────────────────    ────────────────────────
decisionOptions[]     → operator explicit click             → adjudication/instructor
                           ↓                                    ↓
                      selectedDecision (in-memory)          expectedResult (future)
                      dry-run record only
```

### 3.2 Who May Set selectedDecision

`selectedDecision` may only be set by **explicit operator action** — a deliberate, conscious
selection from the displayed `decisionOptions[]` list.

| Source | Permitted? | Reason |
|---|---|---|
| Explicit operator click on a displayed COA option | ✅ Yes | Model C intent |
| Auto-selection of first option on page load | ❌ FORBIDDEN | Would misrepresent intent |
| AI inference from narrative or situation | ❌ FORBIDDEN | AI/sim boundary locked after PR-12 |
| Inference from `objective_status_baseline` | ❌ FORBIDDEN | Not a COA selection (PR-258 §4.4) |
| Inference from `actors[].action_what` | ❌ FORBIDDEN | Unit action ≠ commander COA |
| Inference from `proposedVisualEffects` | ❌ FORBIDDEN | Effects summary ≠ decision narrative |
| Inference from map state or movement trails | ❌ FORBIDDEN | Operational data ≠ decision intent |
| Copy from `engagement_arcs[].cause_what` | ❌ FORBIDDEN | Engagement data ≠ COA selection |
| Default placeholder string | ❌ FORBIDDEN | Would suppress MISSING_FIELD falsely |
| Backend or server injection | ❌ FORBIDDEN | Storage/backend boundary |

### 3.3 optionRef Requirement

Every operator selection record **must** include an `optionRef` that matches the `id` of the
selected `decisionOptions[]` entry exactly. This requirement:

- Ensures the selection is traceable back to a validated source option
- Prevents fabricated selections that reference non-existent options
- Enables `validateWargame3DecisionResultPair` to cross-reference option and decision
- Provides an audit trail within the in-memory record (no external storage needed)

If no matching `decisionOptions` entry exists for the given `optionRef`, the record must be
rejected by the future builder function. This validation rule belongs in **PR-267**
(Operator Selection Dry-Run Type Guard).

---

## 4. Dry-Run Selection Record Shape

The following defines the complete in-memory dry-run selection record produced when an
operator selects a COA option. This shape is **forward specification** — no builder function
exists yet (deferred to PR-268).

### 4.1 Top-Level Record

```javascript
{
  // ── Identity ─────────────────────────────────────────────────────
  id:         string,    // unique record ID, e.g. "W3-SEL-08-001"
                         // format: "W3-SEL-{stepIndex}-{sequence}"
                         // generated at selection time; in-memory only
  stepRef:    string,    // references active step, e.g. "W3-STEP-08"
  optionRef:  string,    // references decisionOptions[].id selected

  // ── Decision sub-object ──────────────────────────────────────────
  // Must pass isWargame3SelectedDecisionSafe (PR-259)
  selectedDecision: {
    id:          string,          // same as record.id or derived from it
    label:       string,          // copy of decisionOptions[optionRef].label
    description: string,          // copy of decisionOptions[optionRef].description
    source:      "operator",      // always "operator" for this path
    selectedAt:  string | null,   // ISO 8601 timestamp or null if not available
    selectedBy:  string | null,   // operator identifier string or null
    optionRef:   string,          // must match record.optionRef exactly
    confidence:  "explicit",      // always "explicit" — operator clicked
    readOnly:    true             // always true — selection is not execution
  },

  // ── Source option snapshot ───────────────────────────────────────
  // Read-only copy of the source option at time of selection.
  // Provides context without referencing the live decisionOptions array.
  sourceOption: {
    id:          string,                      // decisionOptions[].id
    label:       string,                      // decisionOptions[].label
    description: string,                      // decisionOptions[].description
    intent:      string,                      // decisionOptions[].intent
    source:      "source_json" | "instructor", // from original option
    readOnly:    true                          // always true
  },

  // ── Status ───────────────────────────────────────────────────────
  status:  "draft"               // just created; not yet reviewed
         | "selected_for_review" // operator has indicated readiness for instructor review
         | "cancelled",          // operator cancelled the selection

  // ── Safety flags ─────────────────────────────────────────────────
  // All must be present and set to these exact values.
  dryRunOnly:           true,   // REQUIRED — this is never live execution
  liveMutationAllowed:  false,  // REQUIRED — never mutate live scenario
  backendCommitAllowed: false,  // REQUIRED — never send to backend

  // ── Timestamps ───────────────────────────────────────────────────
  createdAt:  string | null,    // ISO 8601 timestamp or null
  createdBy:  string | null,    // operator identifier or null

  // ── Lifecycle ────────────────────────────────────────────────────
  // These fields must NOT be present on the record (their absence is the constraint):
  //   applyNow, commitNow, executeNow, liveApply, mutateUnits, mutateMap,
  //   mutateScenario, backendCommit, autoApply, aiGenerated,
  //   simulationCommitted, gate7Approved
  //
  // Their presence causes isWargame3SelectedDecisionSafe to reject the record.
}
```

### 4.2 Minimum Valid Record Example

```javascript
var selectionRecord = {
  id:        'W3-SEL-08-001',
  stepRef:   'W3-STEP-08',
  optionRef: 'COA-01',

  selectedDecision: {
    id:          'W3-SEL-08-001',
    label:       'Strike North',
    description: 'Advance along the northern axis using armoured elements.',
    source:      'operator',
    selectedAt:  null,
    selectedBy:  null,
    optionRef:   'COA-01',
    confidence:  'explicit',
    readOnly:    true
  },

  sourceOption: {
    id:          'COA-01',
    label:       'Strike North',
    description: 'Advance along the northern axis using armoured elements.',
    intent:      'Gain positional advantage; fix enemy forces in depth.',
    source:      'source_json',
    readOnly:    true
  },

  status:               'draft',
  dryRunOnly:           true,
  liveMutationAllowed:  false,
  backendCommitAllowed: false,
  createdAt:            null,
  createdBy:            null
};
```

### 4.3 Record Shape Validation Rules

The future PR-267 type guard (`isWargame3SelectionRecordSafe`) must verify:

| Rule | Check |
|---|---|
| R-01 | `record` is a non-null, non-array object |
| R-02 | `record.id` is a non-empty string |
| R-03 | `record.stepRef` is a non-empty string matching `/^W3-STEP-\d+$/i` |
| R-04 | `record.optionRef` is a non-empty string |
| R-05 | `record.selectedDecision` passes `isWargame3SelectedDecisionSafe` |
| R-06 | `record.selectedDecision.optionRef === record.optionRef` |
| R-07 | `record.selectedDecision.source === 'operator'` |
| R-08 | `record.selectedDecision.confidence === 'explicit'` |
| R-09 | `record.selectedDecision.readOnly === true` |
| R-10 | `record.dryRunOnly === true` |
| R-11 | `record.liveMutationAllowed === false` |
| R-12 | `record.backendCommitAllowed === false` |
| R-13 | None of 12 unsafe fields present in record or `selectedDecision` |
| R-14 | `record.status` ∈ `['draft', 'selected_for_review', 'cancelled']` |
| R-15 | `record.sourceOption` is a non-null object with `id`, `label`, `description` |
| R-16 | `record.sourceOption.readOnly === true` |

---

## 5. Relationship to `selectedDecision`

### 5.1 Where `selectedDecision` Lives

After this contract's implementation (PR-267/268), `selectedDecision` will exist inside the
dry-run selection record **only**. It will **not** be placed in:

- `preview.selectedDecision` (the current preview pipeline field)
- `step.selectedDecision` (the adapter output field)
- `wargame3.json` steps
- Any storage layer

The existing `preview.selectedDecision` and `step.selectedDecision` remain `null` in all
production and preview paths. The dry-run selection record is a **separate, isolated** object.

### 5.2 The Controlled Preview-State Layer

Future PRs (PR-270+) will define a **controlled preview-state layer** — a separate in-memory
channel through which an operator's dry-run selection record may be surfaced in the preview
panel. This layer:

- Is NOT built in this PR
- Is NOT built in PR-266, PR-267, or PR-268
- Will be the only permissible path for `preview.selectedDecision` to become non-null
- Must be explicitly designed to prevent the selection from triggering any live apply path

Until that layer exists, `preview.selectedDecision` **remains null** even if a dry-run
selection record exists. The existing MISSING_FIELD warnings continue to be emitted.

### 5.3 `isWargame3SelectedDecisionSafe` Compatibility

The `selectedDecision` sub-object inside the dry-run record must pass
`isWargame3SelectedDecisionSafe` (PR-259). The object shape defined in §4.1 satisfies
all current guard rules:

| Guard rule | How the record shape satisfies it |
|---|---|
| `id` non-empty string | Required field in §4.1 |
| `label` non-empty string | Copied from source option; non-empty |
| `description` string | Copied from source option |
| `source` ∈ `['operator', 'source_option', 'instructor']` | Always `'operator'` |
| `confidence` ∈ `['explicit', 'instructor_defined']` | Always `'explicit'` |
| `readOnly === true` | Required flag |
| `selectedAt` string or null | Both permitted |
| `selectedBy` string or null | Both permitted |
| `optionRef` string or null | String — the COA id |
| No unsafe fields | None of 12 forbidden field names present |

---

## 6. Relationship to `expectedResult`

### 6.1 Operator Selection Does NOT Create `expectedResult`

This is an **absolute rule** — no exception.

Selecting a COA option is a commander's **intent** declaration. It is not:
- A prediction of what will happen after the option is applied
- A simulation output
- An adjudication result
- An instructor-provided narrative

`expectedResult` will only become non-null when one of the following provides it through the
correct gate:

| Provider | Gate | PR scope |
|---|---|---|
| Adjudication engine (live sim) | Gate 6 | Post-PR-270+ |
| Instructor-in-the-loop | Gate 5 (instructor review) | Post-PR-270+ |
| Source-authored static value | PR-258 Model A path | Future data PR |

### 6.2 What Is NOT `expectedResult`

| Field | Is it `expectedResult`? | Reason |
|---|---|---|
| `decisionOptions[].expectedEffects[]` | ❌ No | List of anticipated effects, not an adjudicated result string |
| `objective_status_baseline` | ❌ No | Historical simulation-author baseline status label |
| `proposedVisualEffects` | ❌ No | Visual preview effects, not an outcome narrative |
| `actors[].action_what` | ❌ No | Unit-level task, not an expected result |
| `engagement_arcs[].effect_what` | ❌ No | Engagement description, not an expected outcome |
| `narrative_en_fallback` | ❌ No | Background narrative, not a result |

The `expectedEffects[]` inside a `decisionOptions` entry are **anticipated COA-level effects**
(a planning description) — not an adjudicated outcome. They must never be promoted to
`expectedResult` even if the option is selected.

### 6.3 `expectedResult` Remains `null` Through PR-268

After the operator makes a selection and a dry-run record exists, the following state remains
unchanged throughout PR-265 through PR-268:

```
preview.selectedDecision  → null (unchanged; preview state layer not yet built)
preview.expectedResult    → null (unchanged; adjudication not yet provided)
preview.previewComplete   → false (unchanged; all three conditions still fail)
MISSING_FIELD warnings    → still emitted (2 per step; correct)
```

---

## 7. Relationship to `previewComplete`

### 7.1 Selection Alone Does Not Make `previewComplete` True

`previewComplete` is computed as:

```javascript
var previewComplete = decisionOk && resultOk && counterOk;
```

Where:
- `decisionOk` = `typeof step.selectedDecision === 'string' && step.selectedDecision !== ''`
  (current string validator in `buildScenarioStepPreview`)
- `resultOk` = `typeof step.expectedResult === 'string' && step.expectedResult !== ''`
- `counterOk` = `Array.isArray(step.enemyCounterActions) && step.enemyCounterActions.length > 0`

An operator selection (even if a dry-run record exists) does **not** propagate to
`step.selectedDecision` through the current preview pipeline. The field remains `null`.
Therefore `decisionOk` remains `false`. Therefore `previewComplete` remains `false`.

Even in a future controlled preview-state layer, `previewComplete` requires **all three**
conditions:

| Condition | Status after operator selection |
|---|---|
| `selectedDecision` present and valid | Could become true (requires controlled layer) |
| `expectedResult` present and valid | Still false — awaits adjudication/instructor |
| `enemyCounterActions` non-empty | Still false — not in W3 source |

**Minimum path to `previewComplete: true`:**

1. ✅ Operator selects a COA → dry-run record created (this contract)
2. ✅ Controlled preview-state layer propagates `selectedDecision` to preview (PR-270+)
3. ✅ Adjudication/instructor provides `expectedResult` (PR-266+ scope)
4. ✅ `enemyCounterActions` is populated in source (separate data PR)
5. ✅ `validateWargame3DecisionResultPair` passes (PR-259)
6. ✅ `previewComplete` becomes true

A selection record alone advances only step 1. Steps 2–6 are unrelated future work.

### 7.2 No Shortcut to previewComplete

The following actions must **never** set `previewComplete` to `true` outside the above sequence:

| Shortcut | Forbidden because |
|---|---|
| Setting `previewComplete = true` directly in any code | Bypasses all validation |
| Treating a dry-run record as "complete" | Record is draft; not adjudicated |
| Using `selectedDecision.confidence === 'explicit'` as gate 7 proof | confidence ≠ adjudication |
| Inferring `expectedResult` from `expectedEffects` | Not an adjudicated result |
| Setting `enemyCounterActions = []` to skip counter-check | Would break `counterOk` logic |

---

## 8. Future UI Constraints

This section defines the safety constraints that any future selection UI (PR-269) must honour.
No UI is built in this PR. These rules are design pre-conditions.

### 8.1 Required Labels and Framing

| UI Element | Required label text |
|---|---|
| Selection button / control | "Record selection for review" or "Mark for dry-run review" |
| Status indicator after selection | "Dry-run selection recorded — not applied" |
| Cancel control | "Clear selection" or "Cancel dry-run selection" |

The following label text is **FORBIDDEN** in any selection UI for W3 dry-run:

| Forbidden label | Reason |
|---|---|
| "Apply" | Implies live execution |
| "Execute" | Implies live execution |
| "Commit" | Implies persistence |
| "Confirm" | Ambiguous — could imply execution in military context |
| "Go Live" | Implies live scenario mutation |
| "Run" | Implies simulation |
| "Submit" | Implies backend submission |
| "Approve" | Implies gate 7 unlock |

### 8.2 Required Interaction Rules

| Rule | Description |
|---|---|
| Explicit click required | No auto-selection, no hover-to-select, no keyboard-shortcut-to-select without confirmation |
| One selection at a time | Only one option may be selected per step at a time |
| Cancellable | The operator must be able to clear a selection without side effects |
| No mutation on cancel | Cancelling must not write anything; the record is simply discarded |
| No confirmation gate for selection | Selection does not require a confirmation dialog; only apply/commit would |
| Read-only options remain read-only | Selected option card still shows "Read-only COA option" badge |

### 8.3 Forbidden UI Patterns

| Pattern | Reason |
|---|---|
| Selecting an option causes a map change | Map mutations are forbidden in dry-run context |
| Selecting an option causes a unit state change | Unit mutations are forbidden |
| Selecting an option triggers a backend request | Backend is forbidden |
| Selection dialog offers "Apply now" secondary action | FORBIDDEN by PR-261 §7, this contract §8.1 |
| Dropdown that defaults to first option on load | Auto-selection is forbidden (§3.2) |
| Progress bar that "completes" on selection | Would falsely imply previewComplete |

---

## 9. Validation Plan

### 9.1 PR-267 — Operator Selection Dry-Run Type Guard

A future pure JS function `isWargame3SelectionRecordSafe(record)` must validate the dry-run
selection record shape. It must:

- Check all R-01 through R-16 rules from §4.3
- Delegate `selectedDecision` sub-object validation to `isWargame3SelectedDecisionSafe` (PR-259)
- Check that none of the 12 `_W3DRS_UNSAFE_FIELDS` appear on the record or in `selectedDecision`
- Be a **pure function** — no DOM, no map, no fetch, no storage
- Be exposed on `window.AppShellScenarioWorkspace`

### 9.2 PR-268 — Operator Selection Dry-Run Builder

A future pure JS function `buildWargame3SelectionRecord(optionItem, stepRef, operatorId)` must:

- Accept a validated `decisionOptions` item (already passed through `isWargame3DecisionOptionSafe`)
- Accept a `stepRef` string (e.g. `'W3-STEP-08'`)
- Accept an optional `operatorId` string (null if not provided)
- Return the complete dry-run selection record shape from §4.1
- Set `dryRunOnly: true`, `liveMutationAllowed: false`, `backendCommitAllowed: false`
- Set `status: 'draft'`
- Set `selectedDecision.source: 'operator'`
- Set `selectedDecision.confidence: 'explicit'`
- Set `selectedDecision.readOnly: true`
- Be a **pure function** — no DOM, no map, no fetch, no storage, no `window.*` access
- Be exposed on `window.AppShellScenarioWorkspace`

### 9.3 Unsafe Field Checklist

The following 12 fields must be absent from every part of the selection record:

```
applyNow             commitNow            executeNow
liveApply            mutateUnits          mutateMap
mutateScenario       backendCommit        autoApply
aiGenerated          simulationCommitted  gate7Approved
```

Their presence in any field on the record or its `selectedDecision` sub-object causes
`isWargame3SelectedDecisionSafe` to return `passed: false`.

---

## 10. Storage and Lifecycle

### 10.1 In-Memory Only

The dry-run selection record **exists only in memory**. It is:

- Created as a plain JavaScript object in the browser tab
- Accessible only during the lifetime of the current page session
- Never serialised to any persistent store
- Never transmitted to any server or API endpoint
- Never attached to `window.RmoozScenario`, `window.units`, or any global namespace
- Accessible only through the future PR-268 builder function's return value and the future
  UI layer that displays it

### 10.2 Lifecycle Events

| Event | Effect on selection record |
|---|---|
| Operator selects an option | Record created with `status: 'draft'` |
| Operator cancels / clears selection | Record discarded (set to null or removed from state) |
| Operator navigates to a different step | Record is isolated to its `stepRef` — a new record may be created for the new step |
| Operator reloads the page | Record is permanently cleared (no persistence) |
| Operator closes the browser tab | Record is permanently cleared |
| Operator submits to instructor review | Record status changes to `'selected_for_review'` (UI deferred to PR-269) |
| Any backend call made by the application | Selection record is **never** included in any request payload |

### 10.3 No Persistence Pathways

| Storage target | Permitted? |
|---|---|
| `localStorage` | ❌ FORBIDDEN |
| `sessionStorage` | ❌ FORBIDDEN |
| `IndexedDB` | ❌ FORBIDDEN |
| `document.cookie` | ❌ FORBIDDEN |
| `window.name` | ❌ FORBIDDEN |
| `URL hash / query parameter` | ❌ FORBIDDEN |
| Server-side POST/PUT/PATCH | ❌ FORBIDDEN |
| File download (JSON export) | ❌ FORBIDDEN — deferred to post-PR-270+ design |
| Scenario journal (`/journal/*`) | ❌ FORBIDDEN — AI/sim boundary locked after PR-12 |

### 10.4 No Global State Mutation

The following global state variables must not be mutated as a result of operator selection:

| Variable | Mutation permitted? |
|---|---|
| `window.RmoozScenario.stepIndex` | ❌ FORBIDDEN |
| `window.RmoozScenario.scenario` | ❌ FORBIDDEN |
| `window.units` | ❌ FORBIDDEN |
| `window.lines` | ❌ FORBIDDEN |
| Any Leaflet map layer | ❌ FORBIDDEN |
| Any W3 overlay data | ❌ FORBIDDEN |
| `wargame3.json` | ❌ FORBIDDEN |

---

## 11. Safety Boundary Confirmation

This section is a full affirmation of all safety boundaries applicable to this PR and to all
future PRs that implement this contract.

### 11.1 Runtime Code — This PR

| Category | Status |
|---|---|
| `scenario-workspace.js` changes | None — contract only |
| `app.html` changes | None |
| `i18n.js` changes | None |
| `style.css` changes | None |
| `app.js` changes | None |
| `adjudicator-map.js` changes | None |
| Backend files changes | None |

### 11.2 Data — This PR

| Category | Status |
|---|---|
| `wargame3.json` changes | None |
| `selectedDecision` created anywhere | No |
| `expectedResult` created anywhere | No |
| `previewComplete` set to true | No |
| `decisionOptions` added to `wargame3.json` | No |

### 11.3 Runtime Boundaries — All Future PRs That Implement This Contract

| Boundary | Rule |
|---|---|
| Storage/persistence | FORBIDDEN — selection record is in-memory only |
| Backend communication | FORBIDDEN — no fetch, XHR, WebSocket, API call |
| AI/sim auto-fill | FORBIDDEN — AI/sim boundary locked after PR-12 |
| Live scenario mutation | FORBIDDEN — `window.RmoozScenario`, units, lines untouched |
| Map mutation | FORBIDDEN — no Leaflet layer writes |
| Unit mutation | FORBIDDEN — no `window.units` writes |
| Simulation engine call | FORBIDDEN — no `/api/sim/*` calls |
| Gate 7 unlock | FORBIDDEN — selection ≠ adjudication approval |
| Apply/Execute/Commit | FORBIDDEN — dry-run only |
| expectedResult auto-generation | FORBIDDEN — awaits adjudication gate |
| Journal file write | FORBIDDEN — AI/sim boundary |
| `previewComplete` shortcut | FORBIDDEN — requires full SD + ER + ECA + validator sequence |

---

## 12. Migration Path

### 12.1 Recommended PR Sequence

The following sequence is recommended after this contract is accepted. No PR should skip
a predecessor.

| PR | Title | Scope |
|---|---|---|
| **PR-265** (this) | Operator Selection Dry-Run Record Contract | Contract only — no code |
| **PR-266** | Expected Result Adjudication Source Contract | Contract: defines `expectedResult` ownership, adjudication source shape, relationship to `selectedDecision`, and path to `previewComplete` |
| **PR-267** | Operator Selection Dry-Run Type Guard | Pure JS: `isWargame3SelectionRecordSafe(record)` added to `scenario-workspace.js`; no DOM, no map, no storage; 30+ tests |
| **PR-268** | Operator Selection Dry-Run Builder | Pure JS: `buildWargame3SelectionRecord(optionItem, stepRef, operatorId)` added; no DOM, no map, no storage; 40+ tests |
| **PR-269** | Operator Selection Read-Only Review Display | UI: read-only selection card showing `status: 'draft'` + selected option details; no apply controls; visual/manual test required; `app.html` + CSS + i18n + painter |
| **PR-270+** | Controlled Preview-State Layer Design | Architecture: defines how a dry-run selection record propagates into `preview.selectedDecision` without mutating production state; gated behind instructor review confirmation |

### 12.2 What PR-266 Must Define

PR-266 will define:

- The exact shape of `expectedResult` in the structured object form (PR-258 §5.2 outline)
- Which sources may provide `expectedResult` (adjudication engine / instructor / source-authored)
- How `expectedResult.linkedDecisionId` references `selectedDecision.id`
- The validation rules for `isWargame3ExpectedResultSafe` object path (already partially defined in PR-259)
- Why `expectedEffects[]` inside a COA option is **not** `expectedResult`
- The gate sequence before `expectedResult` may be propagated to the preview pipeline

### 12.3 Do Not Implement Live Apply

The following capabilities must **not** be implemented until after PR-270+ gate design is
complete and the four-gate operator review sequence (PR-175, PR-190) is satisfied:

| Capability | Minimum gate |
|---|---|
| `previewComplete: true` in any W3 step | Gate 4 (all three conditions pass) |
| `expectedResult` from adjudication engine | Gate 6 (live sim connected) |
| Live scenario step advance | Gate 7 (operator + adjudication approval) |
| Backend commit of decision/result | Gate 7 |
| AI-suggested `selectedDecision` | Requires explicit PR-12 AI boundary review |

---

## 13. W3-STEP-08 Worked Example

### 13.1 Scenario State Before Selection (Current Production)

```
step:        W3-STEP-08
stepSummary: "PRE-H — P0 · Decision point: COA selection"
situation:   "Red forces have achieved maritime superiority in the littoral zone.
              Ground forces staged at BLS-1 are awaiting go/no-go for amphibious push."

decisionOptions:    [not yet in wargame3.json — displayed only with fixture injection]
selectedDecision:   null   (adapter Rule S5)
expectedResult:     null   (adapter Rule S10)
previewComplete:    false
MISSING_FIELD:      [selectedDecision, expectedResult]
```

### 13.2 After Operator Selects COA-01 (Future — Post PR-267/268)

The in-memory dry-run selection record that would exist:

```javascript
// In-memory only. Never stored. Never sent to backend.
var dryRunRecord = {
  id:        'W3-SEL-08-001',
  stepRef:   'W3-STEP-08',
  optionRef: 'COA-01',

  selectedDecision: {
    id:          'W3-SEL-08-001',
    label:       'Strike North',
    description: 'Advance along the northern axis using armoured elements. ' +
                 'Seize Phase Line AMBER by H+4.',
    source:      'operator',
    selectedAt:  null,        // timestamp not available without clock service
    selectedBy:  null,        // operator ID not available without auth layer
    optionRef:   'COA-01',
    confidence:  'explicit',
    readOnly:    true
  },

  sourceOption: {
    id:          'COA-01',
    label:       'Strike North',
    description: 'Advance along the northern axis using armoured elements...',
    intent:      'Gain positional advantage; fix enemy forces in depth.',
    source:      'source_json',
    readOnly:    true
  },

  status:               'draft',
  dryRunOnly:           true,
  liveMutationAllowed:  false,
  backendCommitAllowed: false,
  createdAt:            null,
  createdBy:            null
};
```

### 13.3 Preview State After Selection (Future — Post PR-270+)

Even after the dry-run record exists:

```
preview.selectedDecision:   null  (unchanged — no controlled preview-state layer yet)
preview.expectedResult:     null  (unchanged — adjudication not provided)
preview.previewComplete:    false (unchanged — all three conditions still fail)
MISSING_FIELD warnings:     still emitted (2 per step)
map overlays:               unchanged
unit state:                 unchanged
wargame3.json:              unchanged
```

The selection record is **separate** from the preview pipeline until PR-270+ builds the
controlled layer that bridges them.

---

## Appendix A — Unsafe Field Reference

All 12 fields from `_W3DRS_UNSAFE_FIELDS` (PR-259) are forbidden in the dry-run record,
in `selectedDecision`, and in `sourceOption`:

```
'applyNow'            'commitNow'           'executeNow'
'liveApply'           'mutateUnits'         'mutateMap'
'mutateScenario'      'backendCommit'       'autoApply'
'aiGenerated'         'simulationCommitted' 'gate7Approved'
```

If any of these appear on the record or its sub-objects, `isWargame3SelectedDecisionSafe` will
return `{ passed: false, blockedReasons: ['selectedDecision contains unsafe field: ...'] }`.

---

## Appendix B — Type Guard Compatibility Matrix

| Guard function (PR-259) | Applied to dry-run record | Notes |
|---|---|---|
| `isWargame3SelectedDecisionSafe(record.selectedDecision)` | ✅ Required | Object path — must pass all object-shape rules |
| `isWargame3DecisionOptionSafe(record.sourceOption)` | ✅ Required | sourceOption must pass the full option guard |
| `isWargame3ExpectedResultSafe(record.expectedResult)` | N/A for this PR | expectedResult is null in this PR's scope |
| `validateWargame3DecisionResultPair(stepProxy)` | N/A for this PR | Requires both SD and ER non-null |
| `buildWargame3DecisionOptionsPreviewData(step)` | N/A for this PR | Used by display layer, not selection record builder |
| `isWargame3SelectionRecordSafe(record)` | ✅ Future (PR-267) | New guard to be defined; delegates to above |

---

## Appendix C — Relationship Diagram

```
wargame3.json
  └── steps[]
        └── step (W3-STEP-08)
              ├── decisionOptions[]            ← source data (not yet in JSON)
              │     ├── COA-01 (readOnly:true)  ← displayed by _paintW3DecisionOptions (PR-264)
              │     ├── COA-02 (readOnly:true)
              │     └── COA-03 (readOnly:true)
              ├── selectedDecision: null        ← stays null in production preview
              └── expectedResult: null          ← stays null until adjudication

  Operator explicit click (PR-269 future)
        ↓
  buildWargame3SelectionRecord(option, 'W3-STEP-08', null)  ← PR-268 future
        ↓
  Dry-Run Selection Record (in-memory only)
        │
        ├── id: 'W3-SEL-08-001'
        ├── stepRef: 'W3-STEP-08'
        ├── optionRef: 'COA-01'
        ├── selectedDecision { source:'operator', readOnly:true, confidence:'explicit' }
        ├── sourceOption { source:'source_json', readOnly:true }
        ├── status: 'draft'
        ├── dryRunOnly: true
        ├── liveMutationAllowed: false
        └── backendCommitAllowed: false

        ↓ (NO connection to preview pipeline until PR-270+)

  preview.selectedDecision  → null (unchanged)
  preview.expectedResult    → null (unchanged)
  preview.previewComplete   → false (unchanged)
  MISSING_FIELD warnings    → still emitted (unchanged)
  map overlays              → unchanged
  wargame3.json             → unchanged
  localStorage              → nothing written
  backend                   → no call made
  Gate 7                    → NOT unlocked
```
