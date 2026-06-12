# PR-182 — UID Reconciliation Contract Design

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-167 (staging readiness plan §5a — UID reconciliation risk),
PR-171 (preview-to-staging contract — `proposedEffects` empty note),
PR-178 (dry-run confirmation contract — `effectsPreview` empty note),
PR-181 (dry-run confirmation diagnostics preview — effects remain 0).  
**Date:** 2026-05-26

---

## 1. Purpose

UID reconciliation is the process of matching **imported package unit/action references**
to **live scenario unit references** so that a future dry-run preview can compute
meaningful `proposedEffects` — what unit statuses and positions *would* change if the
package step were applied.

Reconciliation is **not** apply. Reconciliation is **not** commit. It is a read-only
analysis that produces a `ReconciliationResult` object describing how much confidence
the system has that imported references can be mapped to live references. No live unit,
line, map layer, or scenario field is modified at any point during reconciliation.

Until reconciliation is solved, `proposedEffects.unitPositionChanges` and
`effectsPreview.unitPositionChanges` remain empty arrays. This is the correct and
expected state — an empty array means "cannot compute yet," not "no changes exist."
Every display layer that shows effects counts must surface this distinction explicitly
(currently done via the "UID reconciliation pending" note in PR-181).

Reconciliation position in the gate sequence:

```
Gate 1  Validation             validateStagingCandidate()              exists (PR-168/169)
Gate 2  Operator review        isOperatorReviewRecordSafe()            documented (PR-175/177)
Gate 3  Dry-run confirm        isDryRunConfirmationSafe()              documented (PR-178/179)
  ↑
  ├─ UID Reconciliation        ReconciliationResult                    THIS DOCUMENT (PR-182)
  │  (feeds proposedEffects    computed read-only before Gate 3 or
  │   once confidence ≥ medium) displayed as part of dry-run summary
  │
Gate 4  Commit auth            committed: true                         PR-185+ only
```

Reconciliation feeds Gate 3, not Gate 4. A passing reconciliation result allows
`proposedEffects.unitPositionChanges` to be non-empty. It does not permit any live
mutation — that remains exclusively Gate 4.

---

## 2. Inputs

Future reconciliation logic may read the following sources. All are **read-only**.
No input may be mutated, and no result may be written back to any of these sources.

### From the imported package (already in memory)

| Input | Source | Notes |
|---|---|---|
| Step units | `normalisedStep.units[]` | Imported unit references with imported UIDs |
| Affected units | `normalisedStep.affected_units[]` | Units expected to change state/position |
| Actions | `normalisedStep.actions[]` | Action references, may carry actor UID |
| Counter-actions | `normalisedStep.counter_actions[]` | Counter-action references |
| Source trace | `normalisedStep.source_trace` | Package origin metadata |
| Package manifest | `_swDecisionPackage.manifest` | `package_id`, `wargame`, team, classification |

### From the live scenario (read-only snapshot only)

| Input | Source | Notes |
|---|---|---|
| Live units snapshot | `window.units` — **read-only copy only** | Never mutated, never written to |
| Live scenario metadata | `window.RmoozScenario` — **read-only fields only** | `stepIndex`, `name`; never mutated |

**Critical constraint:** Live scenario state must be read into a snapshot at
reconciliation time and never referenced live again. The reconciliation function
must accept a pre-copied units array, not a live reference to `window.units`, so
that:

1. The function remains pure and testable without a live scenario.
2. No accidental mutation of `window.units` can occur through the reconciliation
   function's closure.
3. Stale references do not corrupt a reconciliation result if live state changes
   while a dry-run confirmation is being reviewed.

---

## 3. Match Confidence Levels

Reconciliation assigns one of six confidence values to each imported unit reference.
The overall `ReconciliationResult.confidence` is the lowest per-unit confidence
across all matched units. One `"blocked"` unit blocks the entire result.

| Level | Meaning | May populate `proposedEffects` |
|---|---|---|
| `exact_uid_match` | Imported UID found verbatim in live units | Yes |
| `alias_match` | Imported UID matches a known alias or alternate ID field | Yes |
| `name_type_match` | No UID match; matched by unit name + type + side | Yes, with warning |
| `location_proximity_match` | No UID/name match; matched by position proximity + side | Yes, with warning |
| `unresolved` | No match found; imported unit cannot be associated with a live unit | No — blocks `unitPositionChanges` for that unit |
| `conflict` | Multiple live units match the imported reference (ambiguous) | No — hard block |

### Minimum confidence to populate `proposedEffects`

- `exact_uid_match` or `alias_match` → full population permitted
- `name_type_match` or `location_proximity_match` → population permitted with
  mandatory operator-visible warning in the dry-run summary
- `unresolved` or `conflict` → `unitPositionChanges` for affected unit is omitted;
  `blockedReasons` entry added

The overall `ReconciliationResult.confidence` rating:

| Condition | Overall confidence |
|---|---|
| All units `exact_uid_match` or `alias_match` | `"high"` |
| All units resolved, some via name/proximity | `"medium"` |
| One or more `unresolved`, none `conflict` | `"low"` |
| One or more `conflict`, or hard block condition | `"blocked"` |

---

## 4. Future `ReconciliationResult` Shape

The object is defined here as a documentation contract only. It is **not created in
this PR**. No JS file defines or instantiates this object yet.

```
ReconciliationResult {

  // Overall outcome
  passed:      boolean    // true only if confidence is "high" or "medium"; no conflicts
  confidence:  "high" | "medium" | "low" | "blocked"

  // Per-unit outcomes
  matchedUnits:    MatchedUnit[]   // units with a resolved live counterpart
  unresolvedUnits: array           // imported unit refs with no live match found
  conflicts:       array           // imported unit refs with multiple ambiguous live matches

  // Review information
  warnings:        string[]        // non-blocking issues the operator must see
  blockedReasons:  string[]        // hard blocks; passed === false if any present

  // Hard-locked safety flags — never mutable
  readOnly:             true       // HARD-LOCKED
  liveMutationAllowed:  false      // HARD-LOCKED
}
```

### Key design decisions

**`passed: true` requires zero conflicts and confidence ≥ `"medium"`.**
A `"low"` confidence result has `passed: false` — it may be shown to the operator
but may not automatically advance the dry-run summary to a populated effects list.

**`readOnly: true` and `liveMutationAllowed: false` are hard-locked.** No consuming
function may set these to other values. The type guard (PR-183) will enforce this.

**`unresolvedUnits` and `conflicts` are separate arrays.** Unresolved means "nothing
matched." Conflict means "too many things matched." Both block `proposedEffects` for
the affected unit, but they have different operator messages and recovery paths.

---

## 5. `MatchedUnit` Shape

A `MatchedUnit` describes a single successfully resolved mapping between one imported
unit reference and one live unit reference.

```
MatchedUnit {

  // Imported side (from the package step)
  importedId:    string       // UID as it appears in the package step
  importedName:  string|null  // name_en or name_ar from the imported unit, if present

  // Live side (from the read-only scenario snapshot)
  liveUid:   string       // UID as it appears in the live unit record
  liveName:  string|null  // display name from the live unit record

  // Match metadata
  matchMethod:  "exact_uid_match"
              | "alias_match"
              | "name_type_match"
              | "location_proximity_match"
  confidence:   "high" | "medium"  // per-unit; "low" and "blocked" units are not in matchedUnits

  // Diagnostic note for operator display (optional)
  notes:  string|null
}
```

### Notes on `matchMethod`

**`exact_uid_match`:** The imported `unit.uid` string is found verbatim in the live
units array. This is the only method that requires no operator warning. It is the
target state for all packages that reference units by their RMOOZ UID directly.

**`alias_match`:** The live unit record carries an `aliases` array or `external_id`
field that matches the imported UID. Requires the live unit schema to support alias
fields (not yet confirmed). Yields `confidence: "high"` only if the alias is
authoritative (from the same package source).

**`name_type_match`:** No UID or alias match found. Matching is done by comparing
`name_en`/`name_ar` + unit type + side. Yields `confidence: "medium"`. An operator
warning must be shown: "Matched by name — verify this is the correct unit."

**`location_proximity_match`:** No UID, alias, or name match found. Position in the
imported step is compared against live unit positions within a configurable radius.
Yields `confidence: "medium"` only if the match is unambiguous (exactly one live unit
within the proximity radius with the same side). Always requires an operator warning.

---

## 6. Blocked Cases

The following conditions cause a hard block on the affected unit or on the entire
`ReconciliationResult`. A hard-blocked result has `confidence: "blocked"` and
`passed: false`. There is no override.

| Condition | Block scope |
|---|---|
| Multiple live units match one imported UID (conflict) | Per-unit + overall if any conflict |
| Imported unit has no stable identifier (no UID, no name, no position) | Per-unit hard block |
| Action references a UID that is not in `matchedUnits` or `unresolvedUnits` | Hard block on the action |
| Imported unit coordinates are missing or out of valid range | Per-unit — blocks `location_proximity_match`; may leave unit `unresolved` |
| Unit side/faction mismatch between imported and best live candidate | Per-unit block — side mismatch is not a fuzzy warning, it is a hard block |
| Package `source_trace` is absent | Soft warning (not hard block); recorded in `warnings[]` |
| Matching would require guessing beyond the four defined methods | Hard block — no guessing permitted |
| `confidence` would be `"low"` and the operator has not explicitly confirmed | Not a construction block; `passed: false` prevents auto-advance |

---

## 7. Safety Boundaries

UID reconciliation produces a `ReconciliationResult` that may later be used to
populate `proposedEffects` in a `DryRunConfirmation`. At no point does reconciliation
itself cause any of the following. These rules apply before PR-185+ without exception.

| Blocked action | Blocked until |
|---|---|
| Update live unit status | PR-185+ Gate 4 |
| Move units on the map | PR-185+ Gate 4 |
| Draw new map overlays | PR-185+ Gate 4 |
| Mutate `window.lines` | PR-185+ Gate 4 |
| Advance `window.RmoozScenario.stepIndex` | PR-185+ Gate 4 |
| Call any `/api/sim/*` endpoint | PR-185+ after commit bridge is production-ready |
| Persist `ReconciliationResult` to any storage | Not in scope |
| Export or download `ReconciliationResult` | Not in scope |
| Auto-approve `proposedEffects` from a reconciliation result | Never |
| Read `window.units` by live reference inside the reconciliation function | Never — snapshot only |
| Use reconciliation output to populate `effectsPreview` before Gate 2 passes | Never |

**The reconciliation function must be pure.** It must accept a units snapshot as a
parameter. It must not close over `window.units` or any other live global. Its output
is a plain data object. Calling it twice with the same inputs must return equivalent
results.

---

## 8. Relationship to Existing Objects

```
normalisedStep (from package)
    │  units[], affected_units[], actions[], counter_actions[]
    ▼
ReconciliationResult  ◄─── THIS DOCUMENT
    │  matchedUnits[], unresolvedUnits[], conflicts[]
    │  readOnly: true, liveMutationAllowed: false
    │
    ├── feeds ──▶  StagingProposal.proposedEffects.unitPositionChanges   (currently [])
    │              StagingProposal.proposedEffects.unitStatusChanges      (may come from status fields)
    │
    └── feeds ──▶  DryRunConfirmation.effectsPreview  (currently all [])
                   shown in diagnostics preview (PR-181)

live units snapshot (read-only copy of window.units)
    │  read once at reconciliation time; never written back
    ▼
ReconciliationResult (uses snapshot only — live state not touched)
```

---

## 9. Recommended Next PRs

### PR-183 — UID Reconciliation Type Guard
*(pure JS only, no UI, no storage)*

- Define `RECONCILIATION_CONFIDENCE_LEVELS` frozen constant array:
  `['high', 'medium', 'low', 'blocked']`
- Define `MATCH_METHODS` frozen constant array:
  `['exact_uid_match', 'alias_match', 'name_type_match', 'location_proximity_match']`
- Implement `isReconciliationResultSafe(result)` type guard.
  Returns `{ passed, blockedReasons }`.
- Checks: `result` is object, `readOnly === true`, `liveMutationAllowed === false`,
  `confidence` is one of four values, all three arrays are arrays, no unsafe fields.
- No object creation, no UI, no apply path.
- Exposed on `window.AppShellScenarioWorkspace` for console/test access only.

### PR-184 — UID Reconciliation Read-Only Builder
*(pure function, not wired to UI)*

- Implement `reconcilePackageUnits(normalisedStep, liveUnitsSnapshot, options)`.
- Accepts a deep-copied units snapshot — must not read `window.units` directly.
- Returns `{ passed, result: ReconciliationResult|null, blockedReasons, warnings }`.
- Calls `isReconciliationResultSafe()` self-check before returning.
- Logs unresolved and conflict cases into the result.
- Does not mutate any input.
- Exposed on `window.AppShellScenarioWorkspace` for console/test access only.

### PR-185 — Controlled Live Apply Boundary Design
*(docs-only; no implementation)*

- Define Gate 4 boundary: the only conditions under which `committed: true` may be set.
- Define the two-click Gate 4 UI requirement.
- Define what commit authorization requires from all four preceding gates.
- Define what `backendCommitAllowed: true` means and what infrastructure must exist
  before it can be set.
- No code. No UI. Full separate security review required before any Gate 4 implementation.

### PR-186+ — Operator-Gated Apply Planning
*(only if PR-185 is reviewed and accepted; full proposal required)*

- Design is not described here. Requires PR-185 acceptance first.
- Must include a separate security review and sign-off.

---

## 10. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-182-uid-reconciliation-contract.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no `ReconciliationResult` object creation
- [x] Adds no reconciliation logic
- [x] Adds no staging, review, or dry-run confirmation storage
- [x] Adds no apply path or commit path
- [x] Keeps imported package preview read-only
- [x] Does not modify `app.js` or `adjudicator-map.js`
- [x] Does not mutate `window.units`, `window.lines`, `window.RmoozScenario.stepIndex`,
      the map, or the real scenario
- [x] Makes no backend calls
- [x] Does not re-add external scenario catalog UI
- [x] Does not link `scen-catalog-contract.js`
- [x] Import Diagnostics remains collapsed by default (no change to that behavior)
- [x] `_swStagingProposal` does not exist and is not created
- [x] `proposedEffects` and `effectsPreview` arrays remain empty until a future
      reconciliation builder is accepted and wired

---

## 11. Files Changed in This PR

**One file only:**

- `docs/pr-182-uid-reconciliation-contract.md` — this file (new)

All runtime files are unchanged.
