# PR-206 — Staging State Type Guard Contract

**Type:** Documentation only  
**Status:** Proposed  
**Depends on:** PR-205 (Controlled Staging State Discussion)  
**Blocks:** PR-207 (`isStagingStateSafe` Type Guard), PR-208 (Clear/Reset Staging State Design)

> **This document defines the contract for a future type guard only. It does not approve staging state implementation. It does not create state. It does not permit live apply. Explicit written approval is required before PR-209+.**

---

## 1. Purpose

The future type guard `isStagingStateSafe` will validate a temporary in-memory staging state object assembled from the pipeline sub-objects defined in PRs 172–204. Its role is defensive: it ensures that any staging state object that enters the UI layer cannot contain unsafe flags, stale status values, persistence references, or live mutation instructions.

This contract document:
- Defines the guard's signature, return shape, and validation rules.
- Lists all required sub-guard calls.
- Defines the unsafe field list.
- States the storage boundary.
- States the clear/reset requirement.

This document does **not**:
- Approve staging state implementation.
- Define when staging state will be created.
- Introduce any runtime code.
- Permit any apply, commit, or mutation path.

---

## 2. Future Guard Name and Return Shape

The future function name and return shape are defined here for reference in PR-207 and later PRs.

**Function name:** `isStagingStateSafe(state)`

**Return shape:**

```js
{
  passed:         boolean,
  blockedReasons: string[],
  warnings:       string[]
}
```

- `passed` is `true` only when all validation rules in §4–§8 are satisfied.
- `blockedReasons` accumulates all failure messages. It is never modified externally.
- `warnings` accumulates non-blocking notes (e.g. sub-object not yet populated, sub-guard returned warnings).
- The function is pure: no side effects, no storage, no network calls.

---

## 3. Required StagingState Shape

A valid `StagingState` object has the following fields. All fields marked **required** must be present and of the correct type. Fields marked **optional** may be `null` when the corresponding pipeline stage has not yet been completed.

```js
{
  id:                    string,        // required — non-empty; unique per build
  createdAt:             string,        // required — ISO 8601; non-empty
  sourcePackageId:       string,        // required — non-empty; from loaded package
  activeStepId:          string,        // required — non-empty; from current step
  proposal:              object|null,   // optional — output of buildStagingProposal
  reviewRecord:          object|null,   // optional — output of future review builder
  dryRunConfirmation:    object|null,   // optional — output of buildDryRunConfirmation
  reconciliationResult:  object|null,   // optional — output of reconcileUidReferences
  applyCandidate:        object|null,   // optional — output of buildApplyCandidate
  applyConfirmation:     object|null,   // optional — output of buildApplyConfirmation
  finalChecklist:        object|null,   // optional — output of future checklist builder
  operatorIdentity:      object|null,   // optional — passed isOperatorIdentitySafe
  status:                string,        // required — one of the allowed values (§4)
  readOnly:              true,          // required — must be exactly true; hard-locked
  liveMutationAllowed:   false,         // required — must be exactly false; hard-locked
  backendCommitAllowed:  false,         // required — must be exactly false; hard-locked
  blockedReasons:        string[],      // required — array; empty when state is valid
  warnings:              string[]       // required — array; may be non-empty
}
```

### Field rules

| Field | Rule |
|---|---|
| `id` | Non-empty string. Must not be `'auto'`, `'temp'`, or any reserved diagnostics label. |
| `createdAt` | Non-empty string. Must be set at construction time. |
| `sourcePackageId` | Non-empty string. Must match the loaded package. |
| `activeStepId` | Non-empty string. Must match the current step. |
| `status` | Must be one of the allowed values defined in §4. |
| `readOnly` | Must be exactly `true`. Never `false`, `null`, or absent. |
| `liveMutationAllowed` | Must be exactly `false`. Never `true`, `null`, or absent. |
| `backendCommitAllowed` | Must be exactly `false`. Never `true`, `null`, or absent. |
| `blockedReasons` | Must be an array. Must be empty when `status` is not `"blocked"`. |
| `warnings` | Must be an array. |

---

## 4. Allowed Status Values

The `status` field must be one of the following:

| Value | Meaning |
|---|---|
| `"draft"` | State is under construction; not all sub-objects are populated. |
| `"reviewing"` | Operator is actively reviewing the assembled state. |
| `"ready_for_final_review"` | All prerequisite gates have passed in diagnostics; awaiting Gate 7. |
| `"blocked"` | One or more gates have failed; `blockedReasons` is non-empty. |
| `"cleared"` | State has been explicitly reset; sub-objects are null; no longer active. |

### Forbidden status values

The following values must **never** appear in a valid `StagingState`. Their presence is a hard block:

| Forbidden value | Reason |
|---|---|
| `"applied"` | Implies live mutation has occurred. Forbidden until explicit approval. |
| `"committed"` | Implies backend commit. Forbidden unconditionally. |
| `"live"` | Implies live scenario state has been reached. Forbidden. |
| `"executed"` | Implies execution of a live action. Forbidden. |
| `"auto_applied"` | Implies AI-driven or automatic apply. Forbidden unconditionally. |

---

## 5. Required Sub-Guard Checks

The future `isStagingStateSafe` implementation must call or require the equivalent of each of the following sub-guards when the corresponding sub-object is non-null. A sub-guard failure is a hard block.

| Sub-object | Required guard call | PR |
|---|---|---|
| `proposal` | `isStagingProposalSafe(state.proposal)` | PR-172 |
| `reviewRecord` | `isOperatorReviewRecordSafe(state.reviewRecord)` | PR-177 |
| `dryRunConfirmation` | `isDryRunConfirmationSafe(state.dryRunConfirmation)` | PR-179 |
| `reconciliationResult` | `isReconciliationResultSafe(state.reconciliationResult)` | PR-184 |
| `applyCandidate` | `isApplyCandidateSafe(state.applyCandidate)` | PR-186 |
| `applyConfirmation` | `isApplyConfirmationSafe(state.applyConfirmation)` | PR-191 |
| `operatorIdentity` | `isOperatorIdentitySafe(state.operatorIdentity, { mode })` | PR-202 |

The `mode` for `isOperatorIdentitySafe` must be `"diagnostics"` in all diagnostic contexts and `"live"` only when an explicit Gate 7 implementation is approved (which does not exist yet). In the absence of an explicit mode, `"diagnostics"` must be used.

### Sub-object null handling

When a sub-object is `null`, the guard must:
- Not call the corresponding sub-guard (no error on null input).
- Add a warning: `'<fieldName> is not yet populated'`.
- Not add a blocked reason (null sub-objects are permitted for `"draft"` and `"reviewing"` states).

Exception: if `status === "ready_for_final_review"`, all sub-objects must be non-null. Any null sub-object in this status is a hard block.

---

## 6. Hard Locks

The following conditions must cause `isStagingStateSafe` to return `passed: false` regardless of any other field:

| Condition | Blocked reason text (suggested) |
|---|---|
| `readOnly !== true` | `'readOnly must be true'` |
| `liveMutationAllowed !== false` | `'liveMutationAllowed must be false'` |
| `backendCommitAllowed !== false` | `'backendCommitAllowed must be false'` |
| `status` is a forbidden value (§4) | `'status "X" is not a permitted staging state value'` |
| `blockedReasons` is not an array | `'blockedReasons must be an array'` |
| `warnings` is not an array | `'warnings must be an array'` |
| Any sub-guard call returns `passed: false` | `'<fieldName> failed safety check: <reason>'` |
| Any unsafe field present on the top-level state (§7) | `'unsafe field present: <fieldName>'` |
| `step2Complete === true` on any `applyConfirmation` | `'applyConfirmation.step2Complete must be false — Gate 7 not yet implemented'` |
| State is `"cleared"` but any sub-object is non-null | `'cleared state must have all sub-objects set to null'` |
| Persistence fields present (`_localStorage`, `_persist`, `_journal`, etc.) | `'persistence field present: <fieldName>'` |

---

## 7. Unsafe Fields

`isStagingStateSafe` must block if any of the following fields are present with a truthy value on the top-level state object **or** on any non-null sub-object:

```
applyNow
commitNow
executeNow
runLive
liveApply
mutateMap
mutateUnits
mutateLines
mutateScenario
backendCommit
persist
save
exportNow
downloadNow
autoApprove
autoConfirm
skipGate
skipReview
forceApply
```

Sub-object unsafe fields are already covered by each sub-guard's own unsafe field check. The top-level guard must additionally scan the top-level state object for these fields before calling sub-guards, so that a poisoned state is rejected even if the sub-guard list is incomplete.

---

## 8. Storage Boundary

A future `StagingState` object, if ever approved, must operate entirely within the following boundaries:

| Boundary | Rule |
|---|---|
| **In-memory only** | The state must exist only as a JavaScript object in the current call frame or in a named module-scope variable. |
| **No `localStorage`** | State must not be serialised to or read from `localStorage`. |
| **No `sessionStorage`** | State must not be serialised to or read from `sessionStorage`. |
| **No `IndexedDB`** | State must not be persisted to any browser database. |
| **No backend** | No fetch, XHR, WebSocket, or any other network call may carry state data. `/api/sim/*` remains forbidden. |
| **No file writes** | No download, export, ZIP, or file-picker interaction. |
| **No journal persistence** | The decision journal (if introduced in a future PR) must not automatically persist staging state. |
| **No cross-tab sharing** | `BroadcastChannel`, `SharedWorker`, and similar APIs must not carry staging state. |

These boundaries apply to the state object itself and to any builder or helper that creates it.

---

## 9. Clear/Reset Requirement

Before any staging state implementation PR is accepted (PR-209+), a `clearStagingState()` design must exist in `docs/pr-208-clear-reset-staging-state-design.md`.

The future guard must enforce the following clear/reset rules:

1. A state with `status: "cleared"` must have all sub-objects set to `null`.
2. A cleared state must not be treated as an active state by any paint function.
3. The guard must return `passed: false` for a cleared state used in a Gate 7 context.
4. The guard must return `passed: true` (with a warning) for a cleared state used only in a reset verification context.
5. Cleared state must not be stored, exported, or transmitted.

Until PR-208 is accepted, no staging state builder PR may proceed.

---

## 10. Recommended Next PRs

| PR | Type | Description |
|---|---|---|
| **PR-207** | Pure JS | `isStagingStateSafe(state)` — pure type guard, no storage, no UI, no staging state creation. Validates all rules defined in this document. |
| **PR-208** | Documentation | Clear/Reset Staging State Design — defines `clearStagingState()` behavior, lifecycle boundaries, and cleared-state semantics. Required before PR-209+. |
| **PR-209+** | **Requires explicit written approval** | In-memory staging state builder — `buildStagingState(...)` pure function. Only after PR-207 and PR-208 are accepted and written approval is documented. |
| **Gate 7 UI discussion** | Design + security review | Only after the full staging pipeline has been validated with real identity in diagnostics. |

---

## 11. Safety Checklist

- [ ] Purpose stated: type guard contract only, no approval, no runtime code (§1)
- [ ] Future guard name and return shape defined (§2)
- [ ] All `StagingState` fields documented with types and rules (§3)
- [ ] Allowed status values listed (§4)
- [ ] Forbidden status values listed with reasons (§4)
- [ ] All 7 required sub-guard calls listed with PR references (§5)
- [ ] Sub-object null handling rules stated (§5)
- [ ] `ready_for_final_review` requires all sub-objects non-null (§5)
- [ ] All hard lock conditions listed with blocked reason text (§6)
- [ ] `step2Complete: true` is a hard block (§6)
- [ ] All 19 unsafe fields listed (§7)
- [ ] Top-level + sub-object unsafe field scan rule stated (§7)
- [ ] Storage boundary table complete (§8)
- [ ] No-journal, no-cross-tab rules stated (§8)
- [ ] Clear/reset pre-requirement stated (§9)
- [ ] 5 clear/reset guard rules stated (§9)
- [ ] Recommended next PRs listed (§10)
- [ ] No runtime code introduced
- [ ] No UI introduced
- [ ] No staging state created
- [ ] No storage used
- [ ] No mutation
- [ ] No fetch or backend
- [ ] No apply path
- [ ] `app.js` / `adjudicator-map.js` untouched
