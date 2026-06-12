# PR-258 — Wargame 3 Decision / Result Schema Contract

**Date:** 2026-05-27
**Type:** Schema / design contract — no runtime code changes, no data changes
**Depends on:** PR-214 (adapter contract), PR-231 (operator review design), PR-257 (source audit)
**Status:** Contract. Not yet implemented. No `wargame3.json` changes in this PR.

---

## 1. Executive Summary

Wargame 3 is **ready for read-only operator walkthrough** (confirmed PR-256).
Wargame 3 is **not ready for controlled execution.**

The two blocking gaps are:

| Field | Current state | Root cause |
|---|---|---|
| `selectedDecision` | `null` on all 17 steps | Source-level gap — not present in `wargame3.json` |
| `expectedResult` | `null` on all 17 steps | Source-level gap — not present in `wargame3.json` |

PR-257 confirmed these are **not adapter bugs**. The adapter (`adaptWargame3ToFixture`) correctly reflects the source: Rules S5 and S10 from PR-214 explicitly set both fields to `null`, and Contract §10 pre-declares `previewComplete: false` for all 17 steps.

This document defines:
1. Who owns each field and where it comes from.
2. What shape each field must have to pass future validation.
3. What `previewComplete` requires.
4. What the future decision options (COA) array looks like.
5. What validation helpers are needed.
6. How this relates to the broader controlled-execution gate sequence.
7. The safe migration path for future PRs.

**No fake values will be created. No `previewComplete` will be set to true. No production code is changed in this PR.**

---

## 2. Current State (verified, PR-257)

| Property | Value | Correct? |
|---|---|---|
| `selectedDecision` in all 17 W3 steps | `null` | ✅ Correctly absent |
| `expectedResult` in all 17 W3 steps | `null` | ✅ Correctly absent |
| `previewComplete` in all 17 W3 steps | `false` | ✅ Correct |
| MISSING_FIELD warnings emitted | 2 per step (34 total) | ✅ Accurate |
| `objective_status_baseline` used as `expectedResult` | Never | ✅ Correctly rejected |
| `actors[].action_what` used as `selectedDecision` | Never | ✅ Correctly rejected |
| Adapter sets both to null explicitly | Yes (S5, S10) | ✅ Intentional |
| `_w3pfc_copyStep` forces both null | Yes | ✅ Belt-and-suspenders |

### Why `objective_status_baseline` must not become `expectedResult`

`objective_status_baseline` (DORMANT/THREATENED/CONTESTED/DENIED) is a **historical simulation-author-defined baseline** — the state the simulation author predicts the objective will be in at that step. It is not:
- An operator's expectation of what the adjudication should produce.
- A result that any operator has chosen or verified.
- A value that should suppress the MISSING_FIELD warning.

Mapping it would create a silent false positive: `previewComplete` would become `true` even though no human operator has reviewed, chosen, or confirmed anything. This violates the operator review principle established in PR-175 and PR-190.

---

## 3. Field Ownership Decision

Three possible ownership models are considered. **Model C (hybrid) is recommended.**

### Model A — Source-authored (static JSON)

`selectedDecision` and `expectedResult` are written directly into each W3 step in `wargame3.json` by the scenario author before the scenario is loaded into RMOOZ.

```json
{
  "step_id": "W3-STEP-08",
  "selectedDecision": "Option A — Direct amphibious assault on BLS-1 with fire support",
  "expectedResult": "RED secures beachhead with ≥60% strength; BLS-1 operational by D+18h"
}
```

**Advantages:**
- No runtime operator interaction required.
- Works for static scenario packs and replay scenarios.
- Simplest path to `previewComplete: true`.

**Disadvantages:**
- Values are authored by the scenario designer, not chosen by the operator.
- Becomes stale if the scenario is edited.
- Does not reflect actual operator intent during a live wargame.
- Cannot distinguish "scenario designer said this" from "operator chose this."

**When to use:** Static read-only scenario replay packs where the designer also provides the canonical decision/result narrative. Not appropriate for interactive RMOOZ execution where a real operator makes COA choices.

---

### Model B — Runtime operator/adjudication-authored (dynamic)

`selectedDecision` is chosen by an operator during walkthrough via a selection UI.
`expectedResult` is provided by an adjudication engine or instructor-in-the-loop after the decision is applied.

Neither field exists in source JSON. Both are provided at runtime and held in memory only.

**Advantages:**
- Reflects genuine operator intent.
- `previewComplete: true` means an operator actually selected a decision.
- Aligns with the four-gate operator review sequence (PR-175, PR-190).

**Disadvantages:**
- Requires a future controlled state layer (selection UI, adjudication engine, in-memory decision journal).
- W3 source data provides no COA options for operators to choose from.
- Cannot work until PR-231+ (operator review UI) and adjudication layer are implemented.

**When to use:** Full interactive RMOOZ execution. Future state, not current.

---

### Model C — Hybrid (recommended)

Source JSON provides **decision options** (COA array) authored by the scenario designer.
The operator **selects one option** at runtime → sets `selectedDecision`.
`expectedResult` is generated by an adjudication engine or instructor **after** the decision is selected and applied.

```json
{
  "step_id": "W3-STEP-08",
  "decisionOptions": [
    {
      "id": "W3-S08-OPT-A",
      "label": "Direct Amphibious Assault",
      "description": "Push RED naval gunfire + attack helicopters into beachhead with mine clearance.",
      "intent": "Secure BLS-1 within D+18h with acceptable attrition.",
      "expectedEffects": ["Beachhead secured", "Phase line +8.5km"],
      "risks": ["Corvette interdiction", "Blue fighter intercept"],
      "source": "source_json"
    },
    {
      "id": "W3-S08-OPT-B",
      "label": "Delay and Consolidate",
      "description": "Hold beachhead, reinforce logistics before inland advance.",
      "intent": "Reduce attrition, maintain BLS-1 at cost of tempo.",
      "expectedEffects": ["Reduced RED losses", "Phase line held at D+6h depth"],
      "risks": ["Blue repositioning", "Time cost to RED"],
      "source": "source_json"
    }
  ],
  "selectedDecision": null,
  "expectedResult": null
}
```

Operator selects OPT-A → `selectedDecision` = reference to `W3-S08-OPT-A`.
After adjudication → `expectedResult` is set by the adjudication engine or instructor.

**Advantages:**
- Source data is richer and more useful for walkthrough.
- Operators see structured choices, not a blank field.
- `selectedDecision` reflects a real human choice, not an inferred value.
- `expectedResult` is a genuine adjudication output.

**Disadvantages:**
- Requires authoring `decisionOptions` in W3 source for all 17 steps.
- Still requires future runtime selection UI and adjudication layer.
- More complex than Model A.

**Recommendation:** Model C. The `decisionOptions` array can be added to `wargame3.json` in a future data augmentation PR (not this one). In the interim, `selectedDecision` and `expectedResult` remain null, warnings remain, and `previewComplete` remains false.

---

## 4. `selectedDecision` Contract

### 4.1 Minimum shape (string — current validator compatible)

The current `buildScenarioStepPreview` validator requires:
```javascript
typeof step.selectedDecision === 'string' && step.selectedDecision !== ''
```

For `previewComplete: true` under the current validator, `selectedDecision` must be a **non-empty string**.

**Minimum viable value for static Model A:**
```javascript
selectedDecision: "Option A — Direct Amphibious Assault on BLS-1"
```

### 4.2 Full structured shape (future — requires updated validator)

For Model C (hybrid) with operator selection, the richer shape is:

```javascript
selectedDecision: {
  id:          string,          // references a decisionOptions entry by id
  label:       string,          // short display label (e.g. "Option A — Direct Assault")
  description: string,          // full decision narrative
  source:      "operator"       // operator explicitly selected this at runtime
              | "source_option" // scenario author pre-selected this (Model A)
              | "instructor",   // instructor provided this outside normal selection
  selectedAt:  string | null,   // ISO 8601 timestamp or null
  selectedBy:  string | null,   // operator identifier or null
  optionRef:   string | null,   // id of the decisionOptions entry selected
  confidence:  "explicit"       // operator deliberately chose this
              | "instructor_defined", // instructor provided without normal UI
  readOnly:    true             // always true in RMOOZ preview
}
```

**Note:** Adopting the structured shape requires updating `buildScenarioStepPreview`'s validator from a string check to an object shape check. That update belongs in PR-259 (type guards), not this PR.

### 4.3 Rules (always apply)

1. `selectedDecision` must be **explicit** — not inferred, not auto-filled, not AI-generated without human review.
2. `selectedDecision` must not be copied from `actors[].action_what`. Unit-level task descriptions are not COA selections.
3. `selectedDecision` must not be derived from `objective_status_baseline`.
4. `selectedDecision` must not be derived from `proposedVisualEffects` / `engagement_arcs`.
5. `selectedDecision` must not auto-unlock live apply or Gate 7.
6. `selectedDecision` is read-only in all preview and staging contexts.
7. A non-null `selectedDecision` does not mean the decision has been adjudicated or applied.
8. `selectedDecision` appearing in source JSON (`source: "source_option"`) does not imply operator approval.
9. The AI boundary rule (locked after PR-12) forbids AI from auto-setting `selectedDecision` without explicit human interaction.

### 4.4 Forbidden patterns

```javascript
// FORBIDDEN — inference from unit action
selectedDecision = actors[0].action_what;

// FORBIDDEN — inference from objective status
selectedDecision = step.objective_status_baseline;

// FORBIDDEN — AI auto-fill
selectedDecision = ai.suggest(step.narrative_en_fallback);

// FORBIDDEN — default value that looks real
selectedDecision = "No decision selected";  // suppresses the warning falsely

// FORBIDDEN — copy from effects
selectedDecision = step.engagement_arcs[0].cause_what;
```

---

## 5. `expectedResult` Contract

### 5.1 Minimum shape (string — current validator compatible)

The current `buildScenarioStepPreview` validator requires:
```javascript
typeof step.expectedResult === 'string' && step.expectedResult !== ''
```

**Minimum viable value for static Model A:**
```javascript
expectedResult: "RED secures beachhead with ≥60% strength. BLS-1 operational by D+18h. Objective THREATENED status holds pending inland advance."
```

### 5.2 Full structured shape (future — requires updated validator)

```javascript
expectedResult: {
  id:                string,             // unique within the scenario step
  label:             string,             // short label (≤80 chars)
  description:       string,             // full expected outcome narrative
  source:            "adjudication"      // produced by adjudication engine after apply
                   | "instructor"        // instructor provided outside normal flow
                   | "source_expected",  // scenario author pre-wrote this (Model A)
  resultType:        "expected"          // what the operator expected before apply
                   | "observed"          // what was actually observed after apply
                   | "adjudicated",      // what the adjudication engine computed
  linkedDecisionId:  string | null,      // id of the selectedDecision this result corresponds to
  confidence:        "explicit"          // result was deliberately authored or adjudicated
                   | "adjudicated"       // result produced by simulation engine
                   | "instructor_defined", // instructor provided narrative
  readOnly:          true                // always true in preview
}
```

### 5.3 Rules (always apply)

1. `expectedResult` must be **explicit** — not inferred, not auto-filled.
2. `expectedResult` must not be copied from `objective_status_baseline` (DORMANT/THREATENED/CONTESTED/DENIED). These are per-step historical baselines, not operator-expected results.
3. `expectedResult` must not be derived from `proposedVisualEffects`.
4. `expectedResult` must not be derived from movement trails.
5. `expectedResult` must not be invented from map state or unit strength ratios.
6. `expectedResult` with `resultType: "adjudicated"` must only be set by a genuine adjudication engine, not approximated.
7. `expectedResult` with `source: "source_expected"` indicates the scenario author's authored expectation — it does not confirm the decision was applied or adjudicated.
8. A non-null `expectedResult` does not imply the scenario step was executed or applied.
9. `expectedResult` must not appear in live apply or Gate 7 as proof of completion unless `resultType === "adjudicated"` and `source === "adjudication"`.

### 5.4 Forbidden patterns

```javascript
// FORBIDDEN — copy from objective status
expectedResult = step.objective_status_baseline;  // "THREATENED" is not a result

// FORBIDDEN — infer from engagement arcs
expectedResult = engagement_arcs.map(a => a.cause_what).join('; ');

// FORBIDDEN — infer from movement trails
expectedResult = "Units moved " + trailCount + " transitions";

// FORBIDDEN — placeholder that suppresses warning
expectedResult = "Result pending";  // must be a real authored string

// FORBIDDEN — AI-generated without adjudication engine
expectedResult = ai.generate(situation + actors);
```

---

## 6. Decision Options / COA Contract

The `decisionOptions` array is an **optional new step field** that provides structured COA choices for the operator to select from. It does not exist in current `wargame3.json`. It is not required by any current validator. It is defined here for future implementation.

### 6.1 Shape

```javascript
decisionOptions: [
  {
    id:              string,           // unique within the step, e.g. "W3-S08-OPT-A"
    label:           string,           // short display label (≤60 chars)
    description:     string,           // full COA description narrative
    intent:          string,           // commander's intent for this option
    affectedUnits:   string[],         // UIDs of units primarily involved
    expectedEffects: string[],         // text-only expected effect descriptions
    risks:           string[],         // text-only risk descriptions
    source:          "source_json"     // authored in W3 source data
                   | "instructor",     // provided by instructor at runtime
    readOnly:        true              // always true
  }
]
```

### 6.2 Rules

1. `decisionOptions` can be non-empty before `selectedDecision` is set.
2. `selectedDecision.optionRef` must reference a valid `decisionOptions[].id` when using the structured shape.
3. Decision options are not execution commands. They do not mutate units, map, or scenario state.
4. Decision options do not auto-create `expectedResult`.
5. An operator selecting a decision option does not auto-apply the scenario step.
6. Options authored in source JSON (`source: "source_json"`) represent the scenario designer's view of available choices — they do not represent operator approval.
7. `expectedEffects` and `risks` in a decision option are the **designer's anticipated** effects and risks — they are not the same as `expectedResult`, which reflects the operator's expectation of adjudication output.

### 6.3 Relationship to preview

When `decisionOptions` is present in a step, the read-only walkthrough may display options but must not allow selection until a future controlled-selection UI is implemented. The ops ledger must not show decision options as if they were operator decisions.

---

## 7. `previewComplete` Rule

`previewComplete` is computed in `buildScenarioStepPreview`. The current logic:

```javascript
var decisionOk = (typeof step.selectedDecision === 'string' && step.selectedDecision !== '');
var resultOk   = (typeof step.expectedResult   === 'string' && step.expectedResult   !== '');
var counterOk  = (Array.isArray(step.enemyCounterActions) && step.enemyCounterActions.length > 0);
var previewComplete = decisionOk && resultOk && counterOk;
```

### 7.1 Rules for `previewComplete`

**For read-only walkthrough (current state):**
- `previewComplete: false` is correct. The walkthrough is `ready_for_walkthrough` even with `previewComplete: false` on all steps.
- `ready_for_walkthrough` and `previewComplete` are independent concepts. Do not conflate them.

**For decision-complete preview (future):**
- `previewComplete: true` requires ALL of:
  1. `selectedDecision` is a non-empty string (current minimum) or passes a future `isWargame3SelectedDecisionSafe` guard (structured shape).
  2. `expectedResult` is a non-empty string (current minimum) or passes a future `isWargame3ExpectedResultSafe` guard.
  3. `enemyCounterActions` is non-empty.
  4. No hard safety warnings remain (no BLOCKED or MISSING_FIELD on required fields).

**`previewComplete: true` must never be reached by:**
- Copying `objective_status_baseline` into `expectedResult`.
- Providing any default string like `"No decision"` or `"Pending result"`.
- Marking complete based on `proposedVisualEffects` count.
- Any non-string or non-explicit value.

### 7.2 Relationship to `ready_for_walkthrough`

`buildWargame3MapPreviewReadinessReport` returns `ready_for_walkthrough` independently of `previewComplete`. The readiness report checks for:
- Step count, coordinate coverage, objective coordinate, trail coverage.
- It does NOT check `previewComplete`.

This distinction is intentional and must be preserved. A scenario can be `ready_for_walkthrough` with all 17 steps rendering correctly while `previewComplete` is false on every step. The warnings explain what is missing; they do not block the walkthrough.

---

## 8. Validation Helpers (future — defined but not implemented here)

The following validator function names are reserved for PR-259. They must not be implemented in this PR.

### 8.1 `isWargame3SelectedDecisionSafe(value)`

Validates a `selectedDecision` candidate value. Must block:
- `null`
- Empty string `''`
- Any string containing `applyNow`, `commitNow`, `liveApply`, `mutateUnits`, `forceExecute`
- Any object without `id`, `label`, `source`, `readOnly: true`
- Any object with `readOnly: false`
- Any object with `source` not in `["operator", "source_option", "instructor"]`
- Any object with `confidence` not in `["explicit", "instructor_defined"]`
- Values produced by AI inference without explicit human confirmation

### 8.2 `isWargame3ExpectedResultSafe(value)`

Validates an `expectedResult` candidate value. Must block:
- `null`
- Empty string `''`
- The exact string values `"DORMANT"`, `"THREATENED"`, `"CONTESTED"`, `"DENIED"` (these are `objective_status_baseline` values, not results)
- Any string that looks like it was inferred from unit movement or objective status
- Any object without `id`, `label`, `source`, `readOnly: true`
- Any object with `readOnly: false`
- Any object with `source` not in `["adjudication", "instructor", "source_expected"]`
- Any object with `resultType: "adjudicated"` and `source !== "adjudication"`
- AI-generated values without adjudication engine provenance

### 8.3 `isWargame3DecisionOptionSafe(value)`

Validates a single entry from `decisionOptions[]`. Must block:
- Any entry without `id`, `label`, `readOnly: true`
- Any entry with `readOnly: false`
- Any entry with `source` not in `["source_json", "instructor"]`

### 8.4 `validateWargame3DecisionResultPair(step)`

Validates that `selectedDecision` and `expectedResult` are consistent with each other:
- If `selectedDecision` is structured and has an `optionRef`, check that `optionRef` references a valid `decisionOptions[].id`.
- If `expectedResult` is structured and has a `linkedDecisionId`, check it matches `selectedDecision.id`.
- If either is null, return `passed: false` with MISSING_FIELD details.

---

## 9. Relationship to Controlled Execution

This contract defines fields that appear in the preview pipeline only. It does not create a live apply path.

The following clarifications must be maintained in all future PRs:

| Statement | Must remain true |
|---|---|
| `selectedDecision` is not an execution order | ✅ A selected COA is a preview annotation, not a command. |
| `expectedResult` is not proof of adjudication | ✅ Unless `source: "adjudication"` and `resultType: "adjudicated"`. |
| `previewComplete: true` does not trigger Gate 7 | ✅ `previewComplete` is a preview quality flag, not a gate signal. |
| Controlled execution still requires all four gates | ✅ (PR-175/190): operator identity, decision selection, adjudication result, safety validation, final checklist, two-step confirmation. |
| No AI auto-sets `selectedDecision` | ✅ AI/sim boundary rule locked after PR-12. |

**Future controlled execution gate sequence (unchanged from PR-175/185/190):**

| Gate | Description | Requires |
|---|---|---|
| Gate 1 | Dry-run proposal built | Clean preview, no hard blockers |
| Gate 2 | Operator review | Human operator approves proposal |
| Gate 3 | Dry-run confirmation | `buildDryRunConfirmation` passes |
| Gate 4 | Commit authorization | Separate commit path, not yet implemented |

`selectedDecision` is relevant at Gate 2 (the operator has selected a decision to review). `expectedResult` is relevant for Gate 3 confirmation (what the operator expects the adjudication to produce). Neither unlocks Gate 4 alone.

---

## 10. Migration Path

The safe PR sequence for filling these gaps:

| PR | Type | Description | Scope |
|---|---|---|---|
| **PR-259** | Schema / JS | **Decision/Result Type Guards** — implement `isWargame3SelectedDecisionSafe`, `isWargame3ExpectedResultSafe`, `isWargame3DecisionOptionSafe`, `validateWargame3DecisionResultPair`. Pure JS only, no DOM, no map, no data changes. | Type-guard functions + tests |
| **PR-260** | Docs + data | **Decision Options Source Contract** — define `decisionOptions` shape in `wargame3-schema.md`. Optionally add a minimal example (1–2 steps) with authored options in `wargame3.json`. No `selectedDecision` or `expectedResult` filled yet. | Schema + minimal fixture |
| **PR-261** | Preview + read-only | **Read-Only Decision Options Preview** — display `decisionOptions` in the ops ledger as "Available COAs" rows. No selection UI. No apply. | Display only |
| **PR-262** | In-memory dry-run | **Operator Selection Dry-Run Record** — allow operator to select one option from `decisionOptions`. Set `selectedDecision` in memory only. No map mutation, no backend commit, no Gate 7. | In-memory selection + in-memory journal |
| **PR-263+** | Adjudication contract | **Expected Result Adjudication Source Contract** — define how an adjudication layer (future) provides `expectedResult` after a decision is applied. | Contract doc |

Do not implement live apply, Gate 7, or backend commit in any of PR-259 through PR-263.

---

## 11. Safety Boundary Confirmation

This document makes no runtime code changes, no data changes, and no schema mutations.

| Invariant | Status |
|---|---|
| `wargame3.json` unchanged | ✅ |
| `scenario-workspace.js` unchanged | ✅ |
| No `selectedDecision` value created or authored | ✅ |
| No `expectedResult` value created or authored | ✅ |
| No `previewComplete` set to true | ✅ |
| No `objective_status_baseline` → `expectedResult` mapping | ✅ |
| No map / unit / line / scenario mutation | ✅ |
| No storage / fetch / backend / AI / simulation / journal | ✅ |
| No apply / commit / confirm / execute / Gate 7 | ✅ |
| `app.js` unchanged | ✅ |
| `adjudicator-map.js` unchanged | ✅ |
| MISSING_FIELD warnings preserved (not suppressed) | ✅ |
| `ready_for_walkthrough` status preserved | ✅ |

---

## Appendix A: Current `buildScenarioStepPreview` Decision/Result Check

Preserved for reference. This is the current production validator (not changed by this PR):

```javascript
// ── Rules 12-14: missing-field and empty-field warnings ──────────────
var decisionOk = (typeof step.selectedDecision === 'string' && step.selectedDecision !== '');
if (!decisionOk) {
    warnings.push({
        code:       'MISSING_FIELD',
        step_id:    step.step_id,
        targetType: 'step',
        targetId:   step.step_id,
        message:    'selectedDecision is missing — step cannot be marked preview-complete',
        severity:   'warning'
    });
}

var resultOk = (typeof step.expectedResult === 'string' && step.expectedResult !== '');
if (!resultOk) {
    warnings.push({
        code:       'MISSING_FIELD',
        step_id:    step.step_id,
        targetType: 'step',
        targetId:   step.step_id,
        message:    'expectedResult is missing — step cannot be marked preview-complete',
        severity:   'warning'
    });
}

var previewComplete = decisionOk && resultOk && counterOk;
```

**Implication:** Any non-empty string satisfies the current validator. The structured object shape (§4.2, §5.2) requires a validator update in PR-259 before it can be used.

---

## Appendix B: Field Summary

| Field | Owner | Shape (current) | Shape (future) | When set |
|---|---|---|---|---|
| `selectedDecision` | Operator (Model C) / Scenario author (Model A) | `string \| null` | Structured object (§4.2) | After operator COA selection |
| `expectedResult` | Adjudication engine / Instructor / Scenario author | `string \| null` | Structured object (§5.2) | After adjudication or source authoring |
| `decisionOptions` | Scenario author (source JSON) / Instructor | Array (§6.1) — not yet in W3 | Same | Before step execution |
| `previewComplete` | Computed | `boolean` | `boolean` | Computed in `buildScenarioStepPreview` |
| `objective_status_baseline` | Simulation author (source JSON) | `string` | Unchanged | Read-only per-step baseline |

---

## Appendix C: Relation to Existing Contracts

| Contract | Relation |
|---|---|
| PR-209 (scenario playback preview) | Defines the `ScenarioPlaybackPreview` shape that includes `decision: string\|null` and `expectedResult: string\|null`. This PR refines those to richer shapes. |
| PR-210 (dry-run fixture shape) | Defines `selectedDecision: string\|null` and `expectedResult: string\|null` at the fixture step level. This PR adds the structured option and rules without changing the current minimum. |
| PR-214 (W3 adapter contract) | Rules S5 and S10 (selectedDecision=null, expectedResult=null) remain unchanged. This PR does not relax them. |
| PR-231 (W3 operator review design) | Documents that both fields are null in W3 preview and that operators must not treat null as "ready to apply." Consistent with this PR. |
| PR-175 (operator review boundary) | Operator review gate (Gate 2) requires `selectedDecision` to be non-null and operator-approved. This PR defines what `selectedDecision` must look like to pass Gate 2. |
| PR-190 (final apply safety checklist) | Final apply checklist requires `expectedResult` with `source: "adjudication"` and `resultType: "adjudicated"` for Gate 4. This PR documents that requirement. |
