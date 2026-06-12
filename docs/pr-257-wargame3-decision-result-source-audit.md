# PR-257 — Wargame 3 Selected Decision / Expected Result Source Audit

**Date:** 2026-05-27
**Type:** Audit / findings report — no production code changes
**Test file:** `test-pr-257.js` (51/51 PASS)
**Depends on:** PR-256 (walkthrough findings, gap identified)

---

## 1. Executive Summary

Both `selectedDecision` and `expectedResult` are **source-level gaps** in Wargame 3.

Neither field exists in `wargame3.json` at any step level under any canonical name. The adapter (`adaptWargame3ToFixture`) **correctly** sets both to `null` — this is not an adapter bug; it is an accurate reflection of the source data.

`previewComplete` must remain `false` for all 17 W3 steps. The MISSING_FIELD warnings are correct and should not be suppressed.

**No production code change is needed.** No fields should be synthesized or inferred.

The gap is a **deliberate data design boundary**: Wargame 3 was ported from a simulation model that does not carry commander-level decision selections or operator-authored expected results as step fields. Those concepts belong to a future adjudication or operator-review layer that does not yet exist in RMOOZ.

---

## 2. Raw Source Findings

### Step-level key inventory

All 17 `wargame3.json` steps share exactly the same 33-key schema:

| Key | Present | All non-null? | Notes |
|---|---|---|---|
| `index` | 17/17 | ✓ | Step index 0–16 |
| `time_label` | 17/17 | ✓ | P0–P4, D-H, D+2h…D+144h |
| `elapsed_hours` | 17/17 | ✓ | -30 to +144 |
| `phase` | 17/17 | ✓ | PRE-H / PHASE 1 / PHASE 2A / PHASE 2B / PHASE 3 / RESOLUTION |
| `objective_status_baseline` | 17/17 | ✓ | DORMANT/THREATENED/CONTESTED/DENIED |
| `narrative_en_fallback` | 17/17 | ✓ | Engagement-level narrative text |
| `actors` | 17/17 | ✓ | Array of unit-level action objects |
| `affected` | 17/17 | ✓ | Array of damage/effect objects |
| `engagement_arcs` | 17/17 | ✓ | Actor→target engagement records |
| `bls_status_baseline` | 17/17 | ✓ | Beach landing site status map |
| `red_strength_baseline` | 17/17 | ✓ | Unit strength map |
| `decision_point_baseline` | 17/17 | **null** on all | Declared but empty |
| `step_advantage` | 17/17 | **null** on all | Declared but empty |
| `combined_effect` | 17/17 | **null** on all | Declared but empty |
| `force_ratio_baseline` | 17/17 | **null** on all | Declared but empty |
| `force_ratio_local` | 17/17 | **null** on all | Declared but empty |
| `force_ratio_operational` | 17/17 | **null** on all | Declared but empty |
| `ew_effect_baseline` | 17/17 | **null** on all | Declared but empty |
| `mobility_state_baseline` | 17/17 | **null** on all | Declared but empty |
| `logistics_state_baseline` | 17/17 | **null** on all | Declared but empty |

**No step has a field named:**
`selectedDecision`, `selected_decision`, `decision`, `chosenDecision`, `selectedOption`, `COA`, `courseOfAction`, `commanderDecision`, `playerDecision`, `expectedResult`, `expected_result`, `result`, `outcome`, `expectedOutcome`, `adjudication`, or `consequence`.

---

## 3. Candidate Field Search

### selectedDecision — direct-name search

**Result: 0/17 steps have any direct-name match.**

All canonical selectedDecision field names were scanned across all 17 steps. None were present.

Semantic candidates checked:

| Field | Values | Safe to map? |
|---|---|---|
| `decision_point_baseline` | null on all 17 steps | No (null everywhere) |
| `step_advantage` | null on all 17 steps | No (null everywhere) |
| `combined_effect` | null on all 17 steps | No (null everywhere) |
| `actors[*].action_what` | Present (209 entries) | **No** — these are unit-level action descriptions, not commander-level decision selections. Example: "Mechanized infantry to consolidate and expand the beachhead, preparing for further inland operations." This is a unit task, not a COA selection. |
| `actors[*].action_why` | Present (209 entries) | **No** — unit-level tactical rationale, not a commander decision. |

**Conclusion for selectedDecision: pure source-level gap.** No non-null candidate field was found that could be safely mapped.

### expectedResult — direct-name search

**Result: 0/17 steps have any direct-name match.**

All canonical expectedResult field names were scanned. None were present.

Semantic candidates checked:

| Field | Values | Safe to map? |
|---|---|---|
| `objective_status_baseline` | Non-null on all 17 steps (DORMANT → DENIED) | **No** — this is a read-only per-step status label, not an operator-authored expected result. It describes the objective's state at that step in the historical baseline, not what the operator expects the adjudication to produce. Mapping it would suppress the MISSING_FIELD warning incorrectly and misrepresent previewComplete. |
| `combined_effect` | null on all 17 steps | No |
| `step_advantage` | null on all 17 steps | No |
| `actors[*].action_intended_effect` | Present (209 entries) | **No** — unit-level intended effect of a unit's action, not a step-level expected result for adjudication. |
| `regression_expect` | null at top level | No |

**Conclusion for expectedResult: source-level gap. `objective_status_baseline` is a near-miss but is semantically incorrect as an auto-mapping** — it would replace an authentic "expected result from operator" with a historical baseline status that was pre-determined by the simulation author, not selected by the wargame operator.

---

## 4. Adapter Path Findings

### adaptWargame3ToFixture — selectedDecision

```javascript
// In adaptWargame3ToFixture (scenario-workspace.js, ~line 3858):
selectedDecision: null,   // S5: always null for W3 — never synthesised
```

**Finding:** The adapter explicitly and intentionally sets `selectedDecision: null`. The comment `S5: always null for W3 — never synthesised` confirms this is a deliberate contract, not an oversight. No raw W3 field is being silently dropped.

### adaptWargame3ToFixture — expectedResult

```javascript
// In adaptWargame3ToFixture (scenario-workspace.js, ~line 3865):
expectedResult: null,   // S10: not present in W3
```

**Finding:** Same — explicit null, with comment `S10: not present in W3`. No raw field is being dropped.

### adaptWargame3ToFixture — contract pre-declaration

```javascript
// Contract §10: all steps → previewComplete false
expResults.push({ stepId: sId, previewComplete: false, notes: 'Missing: selectedDecision, expectedResult' });
```

The adapter **pre-declares** `previewComplete: false` for all 17 steps. This is the contract: W3 cannot achieve `previewComplete: true` without source data that does not yet exist.

### buildScenarioStepPreview — validation

```javascript
var decisionOk = (typeof step.selectedDecision === 'string' && step.selectedDecision !== '');
// → false for all W3 steps → MISSING_FIELD warning emitted

var resultOk = (typeof step.expectedResult === 'string' && step.expectedResult !== '');
// → false for all W3 steps → MISSING_FIELD warning emitted

var previewComplete = decisionOk && resultOk && counterOk;
// → false for all W3 steps
```

**Finding:** `buildScenarioStepPreview` correctly validates both fields. The MISSING_FIELD warnings it emits are accurate descriptions of the source gap.

### _w3pfc_copyStep — belt-and-suspenders null enforcement

```javascript
// Forces null even if some future path accidentally provides a value:
out.selectedDecision = null;
out.expectedResult   = null;
```

**Finding:** Even the `buildW3PreviewFromLoadedScenario` path (which reads from `window.RmoozScenario.scenario`) explicitly forces both fields to null on every step copy. This is a second line of defense ensuring no live session state can accidentally set these fields.

---

## 5. Per-Step Coverage Table

All 17 steps audited. `auditWargame3DecisionResultSources(w3json)` result:

| Step | Phase / Summary | selectedDecision | Source | expectedResult | Source | previewComplete |
|---|---|---|---|---|---|---|
| W3-STEP-00 | PRE-H — P0 | ABSENT | — | ABSENT | — | false |
| W3-STEP-01 | PRE-H — P1 | ABSENT | — | ABSENT | — | false |
| W3-STEP-02 | PRE-H — P2 | ABSENT | — | ABSENT | — | false |
| W3-STEP-03 | PRE-H — P3 | ABSENT | — | ABSENT | — | false |
| W3-STEP-04 | PRE-H — P4 | ABSENT | — | ABSENT | — | false |
| W3-STEP-05 | PHASE 1 — D-H | ABSENT | — | ABSENT | — | false |
| W3-STEP-06 | PHASE 1 — D+2h | ABSENT | — | ABSENT | — | false |
| W3-STEP-07 | PHASE 1 — D+6h | ABSENT | — | ABSENT | — | false |
| W3-STEP-08 | PHASE 2A — D+12h | ABSENT | — | ABSENT | — | false |
| W3-STEP-09 | PHASE 2A — D+24h | ABSENT | — | ABSENT | — | false |
| W3-STEP-10 | PHASE 2A — D+36h | ABSENT | — | ABSENT | — | false |
| W3-STEP-11 | PHASE 2B — D+48h | ABSENT | — | ABSENT | — | false |
| W3-STEP-12 | PHASE 2B — D+72h | ABSENT | — | ABSENT | — | false |
| W3-STEP-13 | PHASE 3 — D+96h | ABSENT | — | ABSENT | — | false |
| W3-STEP-14 | PHASE 3 — D+120h | ABSENT | — | ABSENT | — | false |
| W3-STEP-15 | PHASE 3 — D+132h | ABSENT | — | ABSENT | — | false |
| W3-STEP-16 | RESOLUTION — D+144h | ABSENT | — | ABSENT | — | false |

**Summary:**
- `selectedDecision`: 0/17 present, 17/17 absent, 0 semantic candidates with non-null values
- `expectedResult`: 0/17 present, 17/17 absent, 1 semantic candidate (`objective_status_baseline`) — NOT safe to auto-map

---

## 6. Why previewComplete Remains False

`previewComplete` is computed in `buildScenarioStepPreview`:

```javascript
var previewComplete = decisionOk && resultOk && counterOk;
```

- `decisionOk` = `typeof step.selectedDecision === 'string' && step.selectedDecision !== ''`
  → **false** for all W3 steps (null)
- `resultOk` = `typeof step.expectedResult === 'string' && step.expectedResult !== ''`
  → **false** for all W3 steps (null)
- `counterOk` = `enemyCounterActions !== null && enemyCounterActions.length > 0`
  → varies per step, but irrelevant since the first two are false

**previewComplete is false because the required fields are absent from the source data.** This is correct and expected. It should not be changed until source data (or an adjudication-layer output) provides real values.

---

## 7. Source Gap vs. Adapter Bug vs. Deferred Adjudication Gap

| Question | Answer |
|---|---|
| Do `selectedDecision` / `expectedResult` exist in raw `wargame3.json`? | **No.** Neither field exists at any step level. |
| Is the adapter dropping non-null values silently? | **No.** Both adapter assignments are explicit null with explanatory comments. No raw values are being lost. |
| Are there candidate fields that could be safely auto-mapped? | **No for selectedDecision.** For `expectedResult`, `objective_status_baseline` is non-null but semantically incorrect as an auto-mapping. |
| Is this a schema/source gap? | **Yes.** The W3 source data was created from a simulation model that does not include commander-level decision selections or operator-authored result expectations. |
| Is this a deferred adjudication gap? | **Yes — partially.** `expectedResult` is the kind of value that would be populated by an adjudication engine output or by an operator during a pre-execution review, not sourced from the static scenario file. |
| Should `previewComplete` be changed to true? | **No.** Not until source data (or an adjudication layer) provides real values for both fields. |
| Should MISSING_FIELD warnings be suppressed? | **No.** The warnings are accurate and operationally meaningful. They tell an operator that these steps cannot be marked preview-complete yet. |

---

## 8. Safe Recommendation

### Do NOT do these things

- Do not map `actors[].action_what` to `selectedDecision`. These are unit-level task descriptions, not COA selections.
- Do not map `objective_status_baseline` to `expectedResult`. It's a historical baseline status, not an operator expectation.
- Do not map `narrative_en_fallback` to `expectedResult`. It's an engagement narrative, not an adjudicated result.
- Do not infer `selectedDecision` from `actors[].action_why`. These are unit-level rationale, not commander decisions.
- Do not auto-fill either field with defaults.
- Do not suppress MISSING_FIELD warnings.
- Do not set `previewComplete: true` without real source values.

### What should happen next

There are two valid paths forward, and they are not mutually exclusive:

**Path A — Source Data Augmentation (PR-258):**
Add `selectedDecision` and `expectedResult` as per-step fields to `wargame3-schema.md`. Define what each field must contain:
- `selectedDecision`: a string describing the commander's chosen COA for this step (e.g., "Option A — Direct amphibious assault on BLS-1")
- `expectedResult`: a string describing the expected adjudication outcome (e.g., "RED secures beachhead with >60% strength retained; BLS-1 operational by D+18h")

Once defined, a future PR can populate these fields in `wargame3.json` for all 17 steps.

**Path B — Adjudication Layer Contract (PR-258 alternative):**
Define a contract by which a future adjudication engine or operator-review UI provides `selectedDecision` and `expectedResult` at runtime (post-apply), not as static source data. This would require a new `adjudicationInput` object shape that RMOOZ can receive and propagate into the preview pipeline.

Both paths require explicit design decisions that are out of scope for this audit PR.

---

## 9. Safety Boundary Confirmation

All safety invariants confirmed by `test-pr-257.js` (A10–A27, SC01–SC10):

| Invariant | Status |
|---|---|
| `w3json` not mutated (same reference) | ✅ |
| No `selectedDecision` / `expectedResult` key injected into raw steps | ✅ |
| `window.RmoozScenario.stepIndex` unchanged (still 5) | ✅ |
| `window.units` not mutated | ✅ |
| `window.lines` not mutated | ✅ |
| No map paint / no fitBounds in audit function | ✅ |
| No `localStorage` / `sessionStorage` | ✅ |
| No `fetch()` / `XMLHttpRequest` / `/api/sim/` | ✅ |
| No AI / simulation / journal calls | ✅ |
| No apply / commit / confirm / execute / Gate 7 | ✅ |
| `app.js` unchanged | ✅ |
| `adjudicator-map.js` unchanged | ✅ |
| `scenario-workspace.js` unchanged (no PR-257 marker) | ✅ |
| Existing W3 preview still builds (W3-STEP-08) | ✅ |
| Existing map overlay still builds | ✅ |
| Objective highlight still works (ohc=1) | ✅ |
| Movement trails still work (4 trails at step-08) | ✅ |
| Readiness still `ready_for_walkthrough` | ✅ |
| No invented decision / result data | ✅ |

---

## 10. Recommended Next PR

### PR-258 — Wargame 3 Decision/Result Schema Contract

**What it is:**
A schema contract document that defines the required shape of `selectedDecision` and `expectedResult` in `wargame3.json`, so that both fields can be populated in a future source data augmentation PR.

**What it must define:**
1. The exact JSON field names and types (`selectedDecision: string`, `expectedResult: string`)
2. Whether they are mandatory or optional at the step level
3. What valid values look like (free text? enum? structured object?)
4. Whether they belong in the source data file or are injected by an adjudication layer
5. Whether `previewComplete: true` should be gated on both, one, or neither
6. Whether `selectedDecision` maps to a COA option from a future `options[]` array

**What it must NOT do:**
- Do not populate `wargame3.json` steps with fake or inferred data
- Do not change the adapter's null assignments without real source data
- Do not suppress MISSING_FIELD warnings
- Do not add UI controls for decision selection (that is a later operator-review PR)

---

## Appendix: Audit Return Shape

From `auditWargame3DecisionResultSources(w3json)` (2026-05-27):

```json
{
  "passed": true,
  "scenarioId": "wargame3",
  "stepCount": 17,
  "selectedDecisionCoverage": {
    "present": 0,
    "missing": 17,
    "candidateFields": []
  },
  "expectedResultCoverage": {
    "present": 0,
    "missing": 17,
    "candidateFields": [
      { "field": "objective_status_baseline", "stepsWithValue": 17 }
    ]
  },
  "conclusion": "SOURCE_GAP: Neither selectedDecision nor expectedResult exists in raw W3 source data at any step level (no direct-name field found). Semantic candidate fields were found for expectedResult (objective_status_baseline) but are NOT safe automatic mappings — they require schema contract approval. The adapter correctly sets both to null. previewComplete must remain false for all 17 steps.",
  "recommendation": "Add selectedDecision and expectedResult to the W3 source data contract (wargame3-schema.md) or define a future adjudication-layer contract...",
  "blockedReasons": [],
  "warnings": []
}
```
