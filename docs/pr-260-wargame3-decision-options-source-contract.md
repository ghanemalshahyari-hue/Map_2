# PR-260 — Wargame 3 Decision Options Source Contract

**Status:** Contract only — no production code changed, no source data changed  
**Depends on:** PR-258 (decision/result schema contract), PR-259 (type guards)  
**Next PR:** PR-261 — Wargame 3 Read-Only Decision Options Preview Contract  
**Date:** 2026-05-27

---

## 1. Executive Summary

Wargame 3 (W3) is ready for **read-only walkthrough**. All 17 steps render correctly, movement trails are present on 13 of 16 transitions, and the map preview pipeline is operational.

W3 is **not yet ready for decision-complete preview**. Two fields remain absent from all source steps:

| Field | Status | Reason |
|---|---|---|
| `selectedDecision` | Absent — adapter sets `null` (Rule S5) | Never synthesised; no source data |
| `expectedResult` | Absent — adapter sets `null` (Rule S10) | Not in W3 source at any step |
| `decisionOptions[]` | **Absent** — not yet defined in source | This contract defines how they should appear |

This contract defines:
- **Where** future `decisionOptions[]` should live in W3 source JSON
- **What shape** each option must have to pass `isWargame3DecisionOptionSafe`
- **What a `decisionOptions[]` block must not do** (move units, create `selectedDecision`, trigger execution)
- **How options relate to** `selectedDecision`, `expectedResult`, and `previewComplete`
- A **worked example** for W3-STEP-08 (the strongest walkthrough step)

**This PR does not change any production file.** `wargame3.json` is unchanged. No options are added in this PR. The contract is forward-specification for PR-262+ data work.

---

## 2. Why Decision Options Are Needed

### 2.1 The Current Gap

The W3 walkthrough currently shows `MISSING_FIELD` warnings for `selectedDecision` and `expectedResult` on every step. These warnings are correct: neither field exists in raw W3 source, and the adapter correctly refuses to synthesise them (PR-214 Rules S5, S10).

The gap cannot be closed by:

| Approach | Why it is forbidden |
|---|---|
| Copying `objective_status_baseline` into `expectedResult` | `objective_status_baseline` is a baseline status label (e.g., `"THREATENED"`), not an adjudicated outcome. PR-257 confirmed this as a semantic near-miss only. |
| Inferring `selectedDecision` from `actors[].action_what` | `action_what` is a unit-level action, not a commander COA. Copying it would misrepresent decision-making authority. |
| AI-generating either field | The AI/sim boundary is hard-locked after PR-12. No AI auto-fill of `selectedDecision` or `expectedResult` is permitted. |
| Setting either field to a forbidden status token | PR-259 blocks `DORMANT`, `THREATENED`, `CONTESTED`, `DENIED`, `ACTIVE`, `COMPLETE`, `SUCCESS`, `FAILURE`. |

The only correct path is for the **source author or instructor** to provide explicit data. `decisionOptions[]` is the mechanism for that.

### 2.2 What Decision Options Provide

`decisionOptions[]` are **Courses of Action (COA) candidates** that a future operator may select from at runtime. They:

- Give the operator legitimate choices to evaluate
- Provide a safe `optionRef` that `selectedDecision.optionRef` can point to after selection
- Are read-only source data — they do not execute, mutate, or apply anything
- Enable PR-261+ display of "Available COAs" in the ops ledger without selection

Without `decisionOptions[]`, the operator has no structured option to select from. With them, the Model C hybrid path (PR-258 §6) becomes actionable.

---

## 3. Ownership Model

This contract uses **PR-258 Model C — Hybrid**:

```
Source JSON          Runtime              Post-Apply
─────────────        ─────────────────    ──────────────────
decisionOptions[]  → operator selects  → selectedDecision
                                       → expectedResult (from adjudication/instructor)
```

**Source JSON** (this PR's scope):
- Provides `decisionOptions[]` per step or via a root library
- Each option has `readOnly: true` and `source: "source_json"` or `"instructor"`
- Options are static COA descriptions — not execution commands

**Runtime** (PR-264 scope — future):
- Operator selects one option → `selectedDecision` created in memory only
- `selectedDecision.optionRef` references `decisionOptions[].id`
- No map mutation, no backend commit, no Gate 7

**Post-Apply** (PR-265+ scope — future):
- Adjudication engine or instructor provides `expectedResult`
- `expectedResult.linkedDecisionId` references `selectedDecision.id`
- Only then may `previewComplete` become eligible (via `validateWargame3DecisionResultPair`)

---

## 4. Location in Source JSON

### 4.1 Preferred: Per-Step `decisionOptions[]`

```json
{
  "step_ref": "W3-STEP-08",
  "phase": "PHASE 2A",
  "objective_status_baseline": "THREATENED",
  "decision_point_baseline": null,
  "decisionOptions": [
    {
      "id": "W3-STEP-08-COA-01",
      "label": "Hold current defensive posture",
      "description": "...",
      "intent": "...",
      "affectedUnits": [],
      "expectedEffects": [],
      "risks": [],
      "source": "source_json",
      "readOnly": true
    }
  ]
}
```

Per-step placement is preferred because:
- Each step has a distinct operational context (`phase`, `objective_status_baseline`, `actors[]`)
- Options are naturally scoped to the situation at that step
- No cross-reference indirection needed for initial implementation
- Directly queryable by step index without a secondary lookup

### 4.2 Alternative: Root-Level Option Library

```json
{
  "scenario_id": "WARGAME3",
  "decision_option_library": [
    {
      "id": "COA-HOLD-GENERIC",
      "label": "Hold current positions",
      "description": "...",
      "source": "source_json",
      "readOnly": true
    }
  ],
  "steps": [
    {
      "step_ref": "W3-STEP-08",
      "decisionOptionRefs": ["COA-HOLD-GENERIC"]
    }
  ]
}
```

A root library is appropriate when:
- The same COA options appear on multiple steps without meaningful variation
- Deduplication becomes a maintenance concern across many steps
- A reusable option library is needed across scenarios

### 4.3 Recommendation

**Use per-step `decisionOptions[]` first.** W3 steps are contextually distinct — PHASE 2A options differ from RESOLUTION options. Per-step placement preserves that context, is easier to audit, and requires no reference resolution logic.

Adopt a root library only in a later PR if authoring burden becomes significant (e.g., 10+ steps sharing identical options verbatim).

### 4.4 `decision_point_baseline` Relationship

W3 currently has `decision_point_baseline: null` on all 17 steps. This field is a boolean sentinel that was intended to mark steps with active decision points. It is **not** the same as `decisionOptions[]`:

| Field | Type | Meaning |
|---|---|---|
| `decision_point_baseline` | `boolean\|null` | Was there a formal decision point at this step? |
| `decisionOptions[]` | `array` | The COA options available at this decision point |

When `decisionOptions[]` is added to a step, `decision_point_baseline` should remain `null` unless the data author explicitly sets it. Populating `decisionOptions[]` without setting `decision_point_baseline: true` is valid — the options are still safe and displayable.

---

## 5. Required `decisionOptions[]` Shape

Each item in `decisionOptions[]` must conform to the shape validated by `isWargame3DecisionOptionSafe` (PR-259, `scenario-workspace.js` line ~8613).

### 5.1 Canonical Shape

```json
{
  "id":              "W3-STEP-08-COA-01",
  "label":           "Hold current defensive posture",
  "description":     "Maintain current positions and continue monitoring enemy movement along the coastal axis.",
  "intent":          "Preserve blue combat power while observing RED repositioning before committing to action.",
  "affectedUnits":   [],
  "expectedEffects": [],
  "risks":           [],
  "source":          "source_json",
  "readOnly":        true
}
```

### 5.2 Required Fields

| Field | Type | Constraint |
|---|---|---|
| `id` | string | Non-empty; unique within the step; recommend `<SCENARIO>-<STEP>-COA-<NN>` pattern |
| `label` | string | Non-empty; short human-readable name (≤ 60 chars recommended) |
| `description` | string | Non-empty; operational description of the COA |
| `intent` | string | Non-empty; why this option would be chosen; not in `isWargame3DecisionOptionSafe` currently but required here for authoring quality |
| `affectedUnits` | array | May be empty; future items should be unit UIDs |
| `expectedEffects` | array | May be empty; anticipated (not adjudicated) effects |
| `risks` | array | May be empty; known risks of this COA |
| `source` | string | Must be `"source_json"` or `"instructor"` |
| `readOnly` | boolean | Must be exactly `true` |

> **Note on `intent`:** `isWargame3DecisionOptionSafe` does not currently validate `intent` as a required field. This contract requires it as an authoring standard. A future PR may add it to the guard. Its absence does not cause a guard failure today.

### 5.3 Optional Future Fields

These fields are not required now but are reserved for later PRs:

| Field | Type | Purpose |
|---|---|---|
| `phase` | string | Restrict option to a specific phase (e.g., `"PHASE 2A"`) |
| `priority` | integer | Display order within the step options list |
| `doctrinalCategory` | string | NATO/doctrinal category (e.g., `"offensive"`, `"defensive"`, `"delay"`) |
| `linkedObjectiveId` | string | Links option to a scenario objective |
| `linkedUnitIds` | array | Which units are primarily involved |
| `estimatedDuration` | string | Time estimate in ISO 8601 duration or free text |
| `constraints` | array | Limiting factors on this option |
| `assumptions` | array | Assumptions this option depends on |
| `instructorNotes` | string | Instructor-facing notes; not displayed to player |

None of these are validated by `isWargame3DecisionOptionSafe` today. They will not cause guard failures if present, but they must not include any unsafe field name (see §6).

### 5.4 ID Naming Convention

Recommended pattern: `<SCENARIO_ID>-<STEP_REF>-COA-<NN>`

| Step | Example IDs |
|---|---|
| W3-STEP-08 | `W3-STEP-08-COA-01`, `W3-STEP-08-COA-02`, `W3-STEP-08-COA-03` |
| W3-STEP-09 | `W3-STEP-09-COA-01`, `W3-STEP-09-COA-02` |

For root-library options: `W3-COA-LIB-<NN>` (no step prefix).

IDs must be **unique within the scope where they appear** (per-step or per-library). Duplicate IDs within a `decisionOptions[]` array are a validation error (to be enforced in PR-261+).

---

## 6. Hard Safety Rules

### 6.1 Forbidden Fields

The following fields must **never** appear in any `decisionOptions[]` item. Their presence causes `isWargame3DecisionOptionSafe` to return `passed: false`:

| Field | Why Forbidden |
|---|---|
| `applyNow` | Implies live application |
| `commitNow` | Implies backend commit |
| `executeNow` | Implies simulation execution |
| `liveApply` | Implies live map/unit mutation |
| `mutateUnits` | Implies unit state change |
| `mutateMap` | Implies map layer change |
| `mutateScenario` | Implies scenario state change |
| `backendCommit` | Implies server-side commit |
| `autoApply` | Implies automated application without operator confirmation |
| `aiGenerated` | Implies AI-authored content (violates PR-12 boundary) |
| `simulationCommitted` | Implies simulation already ran |
| `gate7Approved` | Implies Gate 7 has been passed |

Any option containing these fields must be **rejected at source authoring time**, not at runtime.

### 6.2 What Options Must Not Do

Decision options are static descriptive records. An option must not:

| Action | Status |
|---|---|
| Move units | FORBIDDEN |
| Modify the map | FORBIDDEN |
| Set `previewComplete: true` on any step | FORBIDDEN |
| Create or populate `selectedDecision` | FORBIDDEN |
| Create or populate `expectedResult` | FORBIDDEN |
| Auto-select themselves | FORBIDDEN |
| Trigger adjudication logic | FORBIDDEN |
| Call any backend API | FORBIDDEN |
| Call any simulation component | FORBIDDEN |
| Create a Gate 7 approval record | FORBIDDEN |
| Write to journal, storage, or filesystem | FORBIDDEN |

An option that contains an `expectedResult` sub-field is not validated as an `expectedResult` for the step — it is a data authoring error. `expectedResult` for the step must come through the adjudication path, not from within a COA option.

---

## 7. Relationship to `selectedDecision`

### 7.1 Options Do Not Create `selectedDecision`

The presence of `decisionOptions[]` in source JSON does **not** mean `selectedDecision` is populated. The adapter rule S5 (PR-214) remains in effect: `selectedDecision` is always `null` when adapted from W3 source. `decisionOptions[]` provides candidates; selection happens at runtime in a future PR.

### 7.2 `optionRef` Linkage

When an operator later selects a COA (PR-264), the resulting `selectedDecision` object should carry an `optionRef` field pointing to the chosen option's `id`:

```json
{
  "id":          "SEL-W3-STEP-08-001",
  "label":       "Hold current defensive posture",
  "description": "Operator selected COA-01 for W3-STEP-08.",
  "source":      "operator",
  "selectedAt":  null,
  "selectedBy":  null,
  "optionRef":   "W3-STEP-08-COA-01",
  "confidence":  "explicit",
  "readOnly":    true
}
```

`optionRef` validation (checking that the referenced `id` exists in `decisionOptions[]`) is deferred to PR-264.

### 7.3 Display Without Selection

`decisionOptions[]` may be displayed as "Available COAs" in the ops ledger (PR-261 scope) without operator selection having occurred. Displaying options does not create `selectedDecision`. It does not remove `MISSING_FIELD` warnings for `selectedDecision`. The display is read-only and observational.

### 7.4 No Implicit Pre-Selection

An option with `priority: 1` or any other ranking field is **not** implicitly selected. There is no auto-selection. The operator must make an explicit choice. Any logic that reads `decisionOptions[0]` as the default selected decision is a safety boundary violation.

---

## 8. Relationship to `expectedResult`

### 8.1 `expectedEffects` vs `expectedResult`

These are different concepts and must not be conflated:

| Field | Location | Meaning | Validated By |
|---|---|---|---|
| `expectedEffects` | Inside `decisionOptions[]` item | Anticipated effects if this COA is chosen; authored by scenario designer | Not validated as `expectedResult` |
| `expectedResult` | Step-level field | Adjudicated or instructor-provided outcome after a decision is applied | `isWargame3ExpectedResultSafe` |

`expectedEffects` is a list of anticipated but unconfirmed effects. It is speculative. It must never be treated as the step's `expectedResult`.

The following mapping is **forbidden**:

```
// FORBIDDEN — never do this
step.expectedResult = step.decisionOptions[0].expectedEffects[0];
```

### 8.2 `proposedVisualEffects` Also Forbidden

Similarly, any `proposedVisualEffects` field on a step or option must not be used to satisfy `expectedResult`. `validateWargame3DecisionResultPair` checks for this and will block `previewCompleteEligible` if it detects the copy.

### 8.3 Correct `expectedResult` Sources

`expectedResult` must come from one of:
- `source: "adjudication"` — post-apply adjudication engine (future)
- `source: "instructor"` — explicit instructor-provided result
- `source: "source_expected"` — pre-authored expected outcome in source JSON (distinct from `expectedEffects`)

None of these sources are active in W3 today. The gap is documented and acknowledged.

---

## 9. `previewComplete` Rule

Decision options alone **do not make `previewComplete` true**.

The complete rule (from PR-258 §9 and PR-259 `validateWargame3DecisionResultPair`) is:

```
previewCompleteEligible = true
  IFF:
    (1) step.selectedDecision passes isWargame3SelectedDecisionSafe
    (2) step.expectedResult    passes isWargame3ExpectedResultSafe
    (3) step.enemyCounterActions is a non-empty array
    (4) validateWargame3DecisionResultPair(step).passed === true
```

Adding `decisionOptions[]` to a step affects **none** of these conditions:

| Condition | Effect of adding `decisionOptions[]` |
|---|---|
| `selectedDecision` guard passes | No change — `selectedDecision` remains `null` |
| `expectedResult` guard passes | No change — `expectedResult` remains `null` |
| `MISSING_FIELD` warning for `selectedDecision` | Still emitted |
| `MISSING_FIELD` warning for `expectedResult` | Still emitted |
| `previewCompleteEligible` | Remains `false` |
| `previewComplete` on the step | Remains `false` |

This is by design. Decision options describe possible futures; `previewComplete` requires committed, validated data.

---

## 10. Minimal Example for W3-STEP-08

W3-STEP-08 is the strongest walkthrough step: PHASE 2A, `objective_status_baseline: "THREATENED"`, 14 actors, 4 movement trails, naval/air/land engagements active.

The following block is the **sample** that would be added to this step in a future data PR (PR-262). It is **not added now**.

### Step Context (from existing W3 source)

- Phase: PHASE 2A
- Objective status: THREATENED
- Narrative summary: Corvette interdiction of destroyers; fighter intercepts of attack helicopters; reinforced minefields countering mine clearance; kamikaze UAVs targeting coastal radar
- RED actions include: naval gunfire, close air support, mine clearance, UAV strikes
- BLUE actions include: corvette interdiction, fighter intercept, minefield reinforcement, UAV counterstrike

### Sample `decisionOptions[]` for W3-STEP-08

```json
"decisionOptions": [
  {
    "id":          "W3-STEP-08-COA-01",
    "label":       "Hold current defensive posture",
    "description": "Maintain current positions and continue monitoring enemy naval and air activity along the coastal axis.",
    "intent":      "Preserve blue combat power and gather additional situational awareness before committing to a course of action.",
    "affectedUnits":   [],
    "expectedEffects": [
      "Continued observation of RED naval repositioning",
      "Reduced blue attrition from premature engagement"
    ],
    "risks": [
      "RED may consolidate gains if blue does not respond",
      "Minefield clearance may progress if not actively disrupted"
    ],
    "source":   "source_json",
    "readOnly": true
  },
  {
    "id":          "W3-STEP-08-COA-02",
    "label":       "Reinforce coastal air and radar defense",
    "description": "Redirect available blue air assets and electronic warfare resources to protect coastal radar installations from UAV and air threat.",
    "intent":      "Reduce vulnerability of coastal radar network, which RED is actively targeting, to preserve blue air picture.",
    "affectedUnits":   [],
    "expectedEffects": [
      "Reduced effectiveness of RED kamikaze UAV strikes",
      "Improved blue air situational awareness"
    ],
    "risks": [
      "Resources diverted from naval interdiction",
      "RED may exploit reduced maritime coverage"
    ],
    "source":   "source_json",
    "readOnly": true
  },
  {
    "id":          "W3-STEP-08-COA-03",
    "label":       "Contest mine clearance operations",
    "description": "Increase intensity of minefield reinforcement and direct available air/naval assets to disrupt RED mine clearance activity.",
    "intent":      "Slow RED operational tempo by denying mine clearance progress, maintaining coastal approach barriers.",
    "affectedUnits":   [],
    "expectedEffects": [
      "Slowed RED mine clearance rate",
      "Coastal approach barriers preserved longer"
    ],
    "risks": [
      "Increased exposure of blue minelaying/reinforcement assets to RED naval gunfire",
      "Fighter assets committed to minefield area reduce cover elsewhere"
    ],
    "source":   "source_json",
    "readOnly": true
  }
]
```

### Language Rules for Option Authoring

All option text must follow these constraints:

| Rule | Reason |
|---|---|
| Use generic operational language | Specific weapon effects are speculative |
| Do not claim casualties or kill counts | These are expected/anticipated, not adjudicated |
| Do not claim detections | Sensor effects are scenario-dependent |
| Do not claim weapon effects | Effects depend on execution, not option description |
| Do not imply execution has occurred | Options are pre-decision; nothing has happened yet |
| `expectedEffects` items use conditional language | "Reduced effectiveness of…", "Improved…", "Slowed…" — not "destroyed", "eliminated", "captured" |

---

## 11. Validation Plan

The following validations should be implemented progressively in future PRs. None are currently blocking.

### 11.1 Per-Item Validation (PR-259 `isWargame3DecisionOptionSafe` — already available)

| Check | Guard | Status |
|---|---|---|
| `id` is non-empty string | `isWargame3DecisionOptionSafe` | Available |
| `label` is non-empty string | `isWargame3DecisionOptionSafe` | Available |
| `readOnly === true` | `isWargame3DecisionOptionSafe` | Available |
| `affectedUnits` is array (if present) | `isWargame3DecisionOptionSafe` | Available |
| `expectedEffects` is array (if present) | `isWargame3DecisionOptionSafe` | Available |
| `risks` is array (if present) | `isWargame3DecisionOptionSafe` | Available |
| `source` is `"source_json"` or `"instructor"` | `isWargame3DecisionOptionSafe` | Available |
| No unsafe mutation fields present | `isWargame3DecisionOptionSafe` | Available |

### 11.2 Array-Level Validation (future — PR-261 or PR-262)

| Check | Notes |
|---|---|
| All `id` values unique within the step array | Hash check — no duplicates |
| All items pass `isWargame3DecisionOptionSafe` | Run guard on every item |
| `description` non-empty string | Currently not in guard; add to guard or validate separately |
| `intent` non-empty string | Currently not in guard; required by authoring standard in this contract |

### 11.3 Cross-Reference Validation (future — PR-264)

| Check | Notes |
|---|---|
| `selectedDecision.optionRef` references an existing `decisionOptions[].id` | Only applicable after operator selection |
| Referenced option exists in the same step (or library) | No dangling refs |
| Referenced option still passes `isWargame3DecisionOptionSafe` | Re-validate at selection time |

### 11.4 Negative Checks (enforced by `validateWargame3DecisionResultPair` — PR-259)

| Check | Status |
|---|---|
| `step.expectedResult !== step.objective_status_baseline` | Enforced — blocks `previewCompleteEligible` |
| `step.expectedResult !== step.proposedVisualEffects` | Enforced — blocks `previewCompleteEligible` |
| `decisionOptions[]` items do not satisfy `isWargame3ExpectedResultSafe` | Not currently checked (different type) |

A future guard `isWargame3DecisionOptionsArraySafe(arr)` should run all per-item and array-level checks in one call. Naming reserved here; implementation deferred.

---

## 12. Migration Path

```
PR-259  (done)    Type Guards — isWargame3DecisionOptionSafe and siblings
PR-260  (this)    Source Contract — defines shape, placement, safety rules, example
PR-261  (next)    Read-Only Decision Options Preview Contract
                  — define how a future UI component should display decisionOptions[]
                  — ops ledger "Available COAs" section
                  — no selection UI, no apply, display-only
PR-262            Decision Options Fixture Example
                  — docs/test only or a minimal separate fixture file
                  — add 2–3 authored decisionOptions to W3-STEP-08 in a test fixture
                  — do NOT modify production wargame3.json yet
                  — verify all items pass isWargame3DecisionOptionSafe
PR-263            Read-Only Decision Options Preview UI
                  — render decisionOptions[] from the fixture in the ops ledger
                  — no selection, no apply, no Gate 7
PR-264            Operator Selection Dry-Run Record
                  — allow operator to select one option from decisionOptions[]
                  — set selectedDecision in memory only (no backend, no commit)
                  — selectedDecision.optionRef must reference a valid decisionOptions[].id
                  — MISSING_FIELD warning for selectedDecision cleared after valid selection
PR-265            Expected Result Adjudication Source Contract
                  — define how adjudication/instructor provides expectedResult
                  — previewComplete may become eligible after PR-264 + PR-265
```

**Do not implement live apply, Gate 7, or backend commit in any of PR-260 through PR-265.**

---

## 13. Safety Boundary Confirmation

This PR confirms the following safety boundary state as of 2026-05-27:

| Invariant | Status |
|---|---|
| No runtime code changes | Confirmed — `scenario-workspace.js` unchanged |
| No `wargame3.json` changes | Confirmed — no data added or removed |
| No `app.js` changes | Confirmed |
| No `adjudicator-map.js` changes | Confirmed |
| No `app.html` / `style.css` / `i18n.js` changes | Confirmed |
| `selectedDecision` still `null` on all W3 steps | Confirmed — adapter Rule S5 unchanged |
| `expectedResult` still `null` on all W3 steps | Confirmed — adapter Rule S10 unchanged |
| No `decisionOptions[]` added to production data | Confirmed — this PR is contract only |
| `previewComplete` still `false` for all W3 steps | Confirmed — conditions unchanged |
| `MISSING_FIELD` warnings for `selectedDecision` still emitted | Confirmed |
| `MISSING_FIELD` warnings for `expectedResult` still emitted | Confirmed |
| No storage / fetch / backend interaction | Confirmed |
| No AI / simulation / journal interaction | Confirmed |
| No apply / commit / confirm / execute / Gate 7 | Confirmed |
| No map / unit / line / scenario mutation | Confirmed |
| AI/sim boundary locked after PR-12 | Confirmed — no change |

---

## Appendix A: `isWargame3DecisionOptionSafe` — Current Guard (PR-259)

For reference, the current production guard as of PR-259:

```javascript
// scenario-workspace.js ~line 8613
function isWargame3DecisionOptionSafe(value, options) {
    var reasons = []; var warnings = [];

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { passed: false, blockedReasons: ['decisionOption must be a non-null object'], warnings: [] };
    }
    if (typeof value.id !== 'string' || value.id === '') {
        reasons.push('decisionOption.id must be a non-empty string');
    }
    if (typeof value.label !== 'string' || value.label === '') {
        reasons.push('decisionOption.label must be a non-empty string');
    }
    if (hasOwnProperty(value, 'affectedUnits')  && !Array.isArray(value.affectedUnits))  { ... }
    if (hasOwnProperty(value, 'expectedEffects') && !Array.isArray(value.expectedEffects)) { ... }
    if (hasOwnProperty(value, 'risks')           && !Array.isArray(value.risks))           { ... }
    if (hasOwnProperty(value, 'source')) {
        var doSources = ['source_json', 'instructor'];
        if (doSources.indexOf(value.source) === -1) { ... }
    }
    if (value.readOnly !== true) {
        reasons.push('decisionOption.readOnly must be true');
    }
    // _W3DRS_UNSAFE_FIELDS: applyNow commitNow executeNow liveApply
    //   mutateUnits mutateMap mutateScenario backendCommit
    //   autoApply aiGenerated simulationCommitted gate7Approved
    for (var doi = 0; doi < _W3DRS_UNSAFE_FIELDS.length; doi++) {
        if (hasOwnProperty(value, _W3DRS_UNSAFE_FIELDS[doi])) {
            reasons.push('decisionOption contains unsafe field: ' + _W3DRS_UNSAFE_FIELDS[doi]);
        }
    }
    return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
}
```

Fields **not currently validated** by the guard (future candidates):
- `description` (required by this contract; not yet in guard)
- `intent` (required by this contract; not yet in guard)
- `id` uniqueness within array (array-level; not per-item)

---

## Appendix B: W3 Source Shape Reference

Top-level W3 JSON keys (from `wargame3.json` as of PR-260):

```
name, scenario_id, model_version, scenario_label,
purpose_en, purpose_ar, end_state_en, end_state_ar,
constraints, assumptions, map_bbox, obj, pipeline,
red_units, red_unit_step_coords, red_unit_step_prev,
blue_units_base_ids, blue_units_initial,
blue_unit_step_coords, blue_unit_step_prev, blue_units_source,
off_map_markers, ao_boundaries, bls_template,
nominal_throughput, phase_table, throughput_ceilings_km,
terrain_note, steps, regression_expect,
schema_variant, ported_at, ported_from
```

`decisionOptions` is absent from all top-level keys and from all step objects.  
`decision_point_baseline` is present on all steps with value `null`.

Step keys (W3-STEP-08, representative):

```
index, time_label, elapsed_hours, phase, kind_native,
phase_name_ar, phase_line_km_baseline,
objective_status_baseline,   ← "THREATENED" at step-08
decision_point_baseline,     ← null on all steps
force_ratio_baseline, force_ratio_local, force_ratio_operational,
step_advantage,              ← null on all steps
ew_effect_baseline, mobility_state_baseline,
logistics_state_baseline, combined_effect,
narrative_en_fallback, narrative_ar_fallback,
bls_status_baseline,
blue_destroyed_baseline, blue_destroyed_count_baseline,
red_losses_cumulative_baseline, red_degraded_baseline,
red_strength_baseline, red_active_markers_baseline,
n_units, n_actors, n_affected, n_engagement_arcs,
actors[], affected[], engagement_arcs[], unit_state
```

`decisionOptions` is not present. It will be added to step objects when PR-262 data work begins.

---

## Appendix C: Relation to Prior PRs

| PR | Contribution | Relation to this contract |
|---|---|---|
| PR-214 | Adapter Rules S5 (`selectedDecision: null`) and S10 (`expectedResult: null`) | `decisionOptions[]` does not override S5/S10; options exist independently |
| PR-231 | W3 operator review design — null fields must not be treated as ready | `decisionOptions[]` present does not mean step is review-ready |
| PR-256 | W3 walkthrough findings — confirmed SOURCE_GAP for both fields | This contract responds to that gap |
| PR-257 | Source audit — confirmed no direct-name fields for selectedDecision/expectedResult | `decisionOptions[]` is the start of closing the gap |
| PR-258 | Schema contract — defined Model C, shapes, ownership, migration path | This contract implements the PR-258 §11 migration step for PR-260 |
| PR-259 | Type guards — `isWargame3DecisionOptionSafe` and siblings now callable | This contract defines the data that those guards will validate |
