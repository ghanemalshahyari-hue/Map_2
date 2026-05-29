# PR-205 — Controlled Staging State Discussion

**Type:** Documentation only  
**Status:** Proposed — discussion only  
**Depends on:** PR-204 (Final Checklist Preview with Identity Status)  
**Blocks:** PR-206 (Staging State Type Guard Contract), PR-207 (Staging State Type Guard)

> **This document is a discussion only. No staging state is implemented here. No runtime changes are introduced. Explicit approval is required before any staging state PR proceeds beyond PR-207.**

---

## 1. Purpose

Controlled staging state is a possible future in-memory-only layer that would hold the assembled pipeline objects — proposal, review record, dry-run confirmation, reconciliation result, apply candidate, apply confirmation, identity, and final checklist — together as a single unit for operator review.

It is explicitly **not**:
- Live apply
- Scenario mutation
- Persistence of any kind
- An automatic or AI-driven action

It is not approved in this PR. This document defines what it would need to be, what it must never become, and what must be true before any implementation PR is accepted.

---

## 2. Current Read-Only Baseline

As of PR-204, the full diagnostics chain is assembled and displayed as read-only previews inside the collapsed diagnostics card. No object is stored. No apply path exists.

### Preview sections in place

| Section | Source | Stored? |
|---|---|---|
| Imported package preview | `_swDecisionPackage` (manifest + steps) | Module scope — loaded by operator action, not auto-stored |
| Staging proposal preview | `buildStagingProposal(step, opts)` | No — local variable in `paintStagingReadinessCard` |
| Dry-run confirmation preview | `buildDryRunConfirmation(proposal, reviewRecord)` | No — local variable |
| Apply candidate preview | `buildApplyCandidate(proposal, record, drc, rrResult)` | No — local variable |
| Final confirmation preview | `buildApplyConfirmation(candidate, operatorCtx, opts)` | No — local variable |
| Operator identity preview | `context.operatorIdentity` | No — passed through context, not stored |
| Final checklist preview | Derived from local gate booleans | No — no checklist object created |

### Confirmed properties

- All previews are read-only — no field is written after construction.
- All objects are local to `paintStagingReadinessCard()` or are pure function returns — they go out of scope at each paint cycle.
- `step2Complete` is hard-locked `false` everywhere.
- No apply path exists. No Gate 7 UI exists.
- No `_swApplyCandidate`, `_swApplyConfirmation`, `_swFinalChecklist`, `_swOperatorIdentity`, or `_swStagingProposal` variables exist in module scope.

---

## 3. Why Staging State Might Be Needed Later

The current paint-flow model re-builds every object from scratch on every paint call. This is correct and safe for diagnostics, but it has limits:

| Scenario | Current gap |
|---|---|
| Preserve operator review decision temporarily across UI refreshes | Not possible — `syntheticRecord` is re-built every paint call |
| Compare apply candidate before/after snapshot update | Not possible — no stable reference between calls |
| Support multi-step operator review (review, pause, resume) | Not possible — review state lives only in the paint cycle |
| Show final checklist consistently as operator navigates the UI | Not possible — checklist is re-computed on every paint |
| Test Gate 7 flow without live mutation | Not possible without a stable candidate reference |

These are valid future needs. They do not justify bypassing safety requirements. A controlled staging state object would need to meet all of the minimum requirements in §4 before any implementation PR is accepted.

---

## 4. Minimum Safety Requirements Before Staging State

**Explicit approval is required before any PR that introduces a module-scope or `window`-scope staging state object proceeds past PR-207.**

The following requirements must all be satisfied:

| Requirement | Detail |
|---|---|
| **In-memory only** | The staging state object must never be written to `localStorage`, `sessionStorage`, `IndexedDB`, any cookie, any file, any network endpoint, or any other persistent location. |
| **No file writes** | No download, export, ZIP, or file-picker interaction. |
| **No backend** | No fetch, XHR, WebSocket, or any other network call. `/api/sim/*` remains forbidden. |
| **No mutation** | The staging state object must not modify `window.units`, `window.lines`, `window.RmoozScenario`, the map, or any scenario object. |
| **No auto-apply** | The staging state object must never trigger any apply or commit action automatically. Gate 7 Step 2 remains locked. |
| **No hidden AI approval** | AI must not set any field that advances the staging state toward live apply without explicit operator confirmation. |
| **Bounded lifecycle** | The staging state must have a clear creation point and a clear clear/reset point. It must not persist indefinitely. |
| **Explicit type guards** | Every sub-object in the staging state must pass its corresponding type guard before the state is considered valid. |
| **Clear/reset behavior** | A `clearStagingState()` pure function must be defined before any staging state is introduced. |
| **Event Log boundary** | Event Log categories remain `UI`, `OPERATOR`, and `SYSTEM` only. No new category for staging state events without explicit approval. |
| **Explicit approval** | A written approval comment or PR sign-off is required before the first staging state builder PR (PR-209+) proceeds. |

---

## 5. Future StagingState Shape (Discussion Only)

The following is a suggested shape for a future `StagingState` object. **This is discussion only. It is not implemented here and is not approved.**

```js
// Future shape — not implemented — not approved
{
  id:                    string,       // unique per build, e.g. ISO timestamp + step ID
  createdAt:             string,       // ISO 8601
  sourcePackageId:       string,       // from _swDecisionPackage.manifest.package_id
  activeStepId:          string,       // from current step
  proposal:              object|null,  // output of buildStagingProposal — passed its type guard
  reviewRecord:          object|null,  // output of buildOperatorReviewRecord — passed its type guard
  dryRunConfirmation:    object|null,  // output of buildDryRunConfirmation — passed its type guard
  reconciliationResult:  object|null,  // output of reconcileUidReferences — passed isReconciliationResultSafe
  applyCandidate:        object|null,  // output of buildApplyCandidate — passed isApplyCandidateSafe
  applyConfirmation:     object|null,  // output of buildApplyConfirmation — passed isApplyConfirmationSafe
  finalChecklist:        object|null,  // future checklist object — not yet designed
  operatorIdentity:      object|null,  // passed isOperatorIdentitySafe
  status:                string,       // "draft" | "reviewing" | "ready_for_final_review" | "blocked" | "cleared"
  readOnly:              true,         // hard-locked
  liveMutationAllowed:   false,        // hard-locked
  backendCommitAllowed:  false         // hard-locked
}
```

### What this shape is not

- It is not an apply instruction. None of its fields trigger any action.
- It is not a persistence object. It must not be serialized.
- It is not a network payload. It must not be sent anywhere.
- It is not a mutable scenario overlay. It does not modify any live map, unit, or line object.

---

## 6. Hard Blocks

A controlled staging state must be blocked — and must refuse to build — if any of the following is true:

| Hard block condition | Guard responsible |
|---|---|
| Any sub-object fails its corresponding type guard | Each builder's self-check |
| Any sub-object contains an unsafe field (`applyNow`, `commitNow`, `mutateUnits`, etc.) | Each type guard's unsafe field check |
| Snapshot source is unsafe or forbidden | `isLiveUnitsSnapshotSafe` |
| Identity source is unsafe or not allowed | `isOperatorIdentitySafe` |
| Any field implies Gate 7 is automatically complete | `isApplyConfirmationSafe` — `step2Complete: true` is blocked |
| State attempts persistence (any storage API called) | Architectural constraint — no write API called |
| State attempts backend commit | `backendCommitAllowed: false` hard-locked; `/api/sim/*` forbidden |
| State references live mutable objects directly (e.g. `window.units[i]`) | No live reference in any builder — deep copy required |
| State writes to map, units, lines, or scenario | Forbidden at all layers |

---

## 7. Gate 7 UI Remains Forbidden

Gate 7 UI does not exist. It must not exist until all of the following have been explicitly approved in separate PRs and reviewed:

- Controlled staging state implementation (PR-209+)
- Operator identity real source (not diagnostics placeholder)
- Final checklist real evaluation (not paint-cycle local booleans)
- Rollback plan (contract defined in PR-190)
- Security review and sign-off

Until all of the above exist:

| Forbidden element | Status |
|---|---|
| Final confirm button | **Forbidden** |
| Apply button | **Forbidden** |
| Commit button | **Forbidden** |
| Any button labelled "OK", "Submit", "Save", or "Run" | **Forbidden** |
| Single-click live apply | **Forbidden** |
| AI auto-approval of Gate 7 | **Forbidden** |
| `step2Complete: true` anywhere in the codebase | **Forbidden** — blocked by `isApplyConfirmationSafe` |

---

## 8. Recommended Next PRs

| PR | Type | Description |
|---|---|---|
| **PR-206** | Documentation | Staging State Type Guard Contract — defines the validation rules for a future `StagingState` object, including all required type guard calls and hard block conditions |
| **PR-207** | Pure JS | `isStagingStateSafe(stagingState)` — pure type guard, no storage, no UI, no staging state creation. Validates the shape defined in §5 of this document. |
| **PR-208** | Documentation | Clear/Reset Staging State Design — defines `clearStagingState()` behavior, lifecycle boundaries, and what "cleared" means for each sub-object |
| **PR-209+** | **Requires explicit approval** | In-memory staging state builder — `buildStagingState(...)` pure function; only after PR-206, PR-207, PR-208 are accepted and approval is documented |
| **Later only** | Design + security review | Gate 7 UI discussion — only after PR-209+ is accepted and the full staging pipeline has been validated in diagnostics with real identity |

---

## 9. Safety Checklist

- [ ] Purpose stated: in-memory only, not live apply, not approved (§1)
- [ ] Current read-only baseline documented with all 7 preview sections (§2)
- [ ] Confirmed: no stored objects, all local paint-flow variables (§2)
- [ ] Confirmed: `step2Complete` hard-locked false, no apply path (§2)
- [ ] Reasons staging state might be needed later listed (§3)
- [ ] 11 minimum safety requirements stated (§4)
- [ ] Explicit approval requirement stated (§4)
- [ ] Future `StagingState` shape documented with all fields (§5)
- [ ] What the shape is NOT — listed explicitly (§5)
- [ ] Hard block conditions listed with guards (§6)
- [ ] Gate 7 forbidden list stated (§7)
- [ ] Gate 7 unblock prerequisites listed (§7)
- [ ] Recommended next PRs listed (§8)
- [ ] No runtime code introduced
- [ ] No UI introduced
- [ ] No staging state implemented
- [ ] No mutation
- [ ] No storage
- [ ] No fetch or backend
- [ ] No apply path
- [ ] `app.js` / `adjudicator-map.js` untouched
