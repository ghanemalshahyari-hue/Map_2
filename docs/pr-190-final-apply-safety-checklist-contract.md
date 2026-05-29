# PR-190 — Final Apply Safety Checklist Contract

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-185 (controlled live apply boundary), PR-186 (`isApplyCandidateSafe`),
PR-187 (`buildApplyCandidate`), PR-188 (diagnostics-only preview),
PR-189 (operator confirmation design).  
**Date:** 2026-05-26

---

## 1. Purpose

The final apply safety checklist is a mandatory contract that any future controlled
live apply implementation must satisfy in full, immediately before the Step 2 handler
(Gate 7) is permitted to run. It is ordered, exhaustive, and non-negotiable.

**This document is not an implementation.** No checklist object, checklist UI, or
checklist runner is created in this PR. No apply path is opened. No commit is
permitted.

The checklist contract exists so that:

1. A future implementation PR has an unambiguous pass/fail standard to write against.
2. A security reviewer has a complete enumeration of what must be verified.
3. No gate, warning, or boundary can be silently omitted by a future implementer.

Every row in §3 is a hard requirement. A future implementation that omits any row
is non-compliant and must not be merged.

---

## 2. Checklist Categories

The checklist is organised into ten mandatory categories. They must be evaluated
in the order listed. A failure in any earlier category is a hard stop — later
categories must not be evaluated if an earlier one has a failure.

| # | Category | What it verifies |
|---|---|---|
| A | Gate verification | All six type guards pass when re-run at Gate 7 time |
| B | Operator confirmation | Both Gate 7 steps completed by a real human operator |
| C | UID reconciliation | Confidence, conflicts, and unresolved unit state |
| D | Proposed effects | Scope of what would change, and absence of unsafe markers |
| E | Map / unit / line mutation scope | Exactly what will be touched and what will not |
| F | Backend commit status | `backendCommitPlanned` and related flags are hard-locked |
| G | Persistence / export status | No record is written, exported, or downloaded |
| H | Rollback / rewind plan | Operator has seen and acknowledged the rewind path |
| I | Event log requirements | Any log entry uses only the permitted categories |
| J | Final blocked reasons | `blockedReasons` is empty and no late-arriving failure exists |

---

## 3. Required Checklist Rows

Each row lists: the item, its source, the required value, and whether a failure
is a hard block or a warning. Every hard-block failure stops the checklist
immediately — no subsequent rows may be evaluated.

### Category A — Gate Verification

All guards are re-run at Gate 7 time with the current in-memory objects. Cached
results from earlier in the session are not acceptable.

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| A1 | Staging candidate valid | `validateStagingCandidate(step)` | `passed === true` | Hard block |
| A2 | Staging proposal safe | `isStagingProposalSafe(proposal)` | `passed === true` | Hard block |
| A3 | Operator review record safe | `isOperatorReviewRecordSafe(record)` | `passed === true` | Hard block |
| A4 | Review decision is approve_dry_run | `record.decision` | `=== "approve_dry_run"` | Hard block |
| A5 | Dry-run confirmation safe | `isDryRunConfirmationSafe(confirmation)` | `passed === true` | Hard block |
| A6 | UID reconciliation safe | `isReconciliationResultSafe(result)` | `passed === true` | Hard block |
| A7 | Apply candidate safe | `isApplyCandidateSafe(candidate)` | `passed === true` | Hard block |
| A8 | Future apply confirmation safe | `isApplyConfirmationSafe(confirmation)` | `passed === true` — future PR-191 | Hard block |

### Category B — Operator Confirmation

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| B1 | Gate 7 Step 1 complete | `applyConfirmation.step1Complete` | `=== true` | Hard block |
| B2 | Gate 7 Step 2 complete | `applyConfirmation.step2Complete` | `=== true` (set only by Step 2 handler) | Hard block |
| B3 | Operator identity present | `applyConfirmation.operatorId` | Non-empty string, not null | Hard block |
| B4 | Confirmation timestamp present | `applyConfirmation.confirmedAt` | Non-empty ISO string | Hard block |
| B5 | Operator confirmed flag set | `candidate.operatorConfirmed` | `=== true` (set only by Step 2 handler) | Hard block |
| B6 | Confirmation was not AI-generated | Internal check | Step 2 handler must verify human action | Hard block |

### Category C — UID Reconciliation

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| C1 | Reconciliation passed | `reconciliationResult.passed` | `=== true` | Hard block |
| C2 | Confidence is high or medium | `reconciliationResult.confidence` | `"high"` or `"medium"` | Hard block |
| C3 | Conflicts count | `reconciliationResult.conflicts.length` | `=== 0` | Hard block |
| C4 | Unresolved required units | `reconciliationResult.unresolvedUnits.length` | `=== 0` | Hard block |
| C5 | readOnly flag | `reconciliationResult.readOnly` | `=== true` | Hard block |
| C6 | liveMutationAllowed flag | `reconciliationResult.liveMutationAllowed` | `=== false` | Hard block |
| C7 | Reconciliation warnings | `reconciliationResult.warnings` | Surfaced to operator; non-empty is a warning, not a block | Warning |

### Category D — Proposed Effects

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| D1 | Unit status changes count | `proposedEffects.unitStatusChanges.length` | Any value — shown to operator | Informational |
| D2 | Unit position changes count | `proposedEffects.unitPositionChanges.length` | Any value — shown to operator | Informational |
| D3 | Map overlays count | `proposedEffects.mapOverlays.length` | Any value — shown to operator | Informational |
| D4 | Timeline notes count | `proposedEffects.timelineNotes.length` | Any value — shown to operator | Informational |
| D5 | No `applyNow` in effects items | Each item in all four arrays | `applyNow` must be absent or `false` | Hard block |
| D6 | No `mutateUnits` in effects items | Each item in all four arrays | `mutateUnits` must be absent or `false` | Hard block |
| D7 | No `commitNow` in effects items | Each item in all four arrays | `commitNow` must be absent or `false` | Hard block |
| D8 | No `liveApply` in effects items | Each item in all four arrays | `liveApply` must be absent or `false` | Hard block |

### Category E — Map / Unit / Line Mutation Scope

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| E1 | `window.units` mutation planned | Explicit scope declaration | Exactly the units listed in `unitStatusChanges` and `unitPositionChanges` only | Hard block if exceeds scope |
| E2 | `window.lines` mutation planned | Explicit scope declaration | None — `window.lines` is not touched by this apply | Hard block if any lines mutation planned |
| E3 | Map layer mutation planned | Explicit scope declaration | Only overlays listed in `mapOverlays`; no unit-marker mutation outside `unitPositionChanges` | Hard block if exceeds scope |
| E4 | `window.RmoozScenario.stepIndex` mutation | Explicit scope declaration | Only incremented if step advance is part of the apply scope | Hard block if undeclared |
| E5 | No mutation outside declared scope | Implementation constraint | No other globals, closures, or state may be mutated | Hard block |

### Category F — Backend Commit Status

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| F1 | `backendCommitPlanned` flag | `candidate.backendCommitPlanned` | `=== false` unless backend commit is in scope of the apply PR | Hard block |
| F2 | No `/api/sim/commit` call | Implementation constraint | No commit API is called unless explicitly in scope | Hard block |
| F3 | No `/api/sim/apply` call | Implementation constraint | No apply API is called unless explicitly in scope | Hard block |
| F4 | Backend commit disabled display | UI requirement | Operator sees "No backend commit" before Step 2 | Hard block if hidden |

### Category G — Persistence / Export Status

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| G1 | No record persisted to storage | Implementation constraint | No `localStorage`, `IndexedDB`, or file write | Hard block |
| G2 | No record exported or downloaded | Implementation constraint | No ZIP, no file download, no clipboard write | Hard block |
| G3 | No apply-related journal entry | Until journal write is in scope | Journal write is blocked until explicitly approved | Hard block |
| G4 | No `_swApplyCandidate` stored | Global state check | `window._swApplyCandidate` must not exist | Hard block |

### Category H — Rollback / Rewind Plan

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| H1 | Rollback path described | Operator-visible text | Operator sees explicit statement of how to rewind | Hard block if absent |
| H2 | Rollback is manual | Operator-visible text | "This cannot be undone without a manual rollback" must be shown | Hard block if absent |
| H3 | Rewind scope matches apply scope | Implementation constraint | Rollback path covers exactly the same units, overlays, and notes as the apply | Hard block if incomplete |
| H4 | No auto-rewind | Implementation constraint | No automated rollback trigger; rewind requires explicit future operator action | Hard block if auto-rewind exists |

### Category I — Event Log Requirements

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| I1 | Event category is permitted | Log entry `category` field | Must be one of: `UI`, `OPERATOR`, `SYSTEM` | Hard block |
| I2 | No `AI` event category introduced | Log entry validation | `category === "AI"` is forbidden in the event log | Hard block |
| I3 | No `SIM` event category introduced | Log entry validation | `category === "SIM"` is forbidden in the event log | Hard block |
| I4 | No `SCENARIO` event category introduced | Log entry validation | `category === "SCENARIO"` is forbidden in the event log | Hard block |
| I5 | Log entry source is honest | Log entry `source` field | Must correctly name the actual triggering system | Warning |

### Category J — Final Blocked Reasons

| Row | Item | Source | Required | Failure |
|---|---|---|---|---|
| J1 | `candidate.blockedReasons` empty | `candidate.blockedReasons` | `=== []` (length 0) at Gate 7 time | Hard block |
| J2 | `applyConfirmation.blockedReasons` empty | Future `ApplyConfirmation` object | `=== []` at Gate 7 time | Hard block |
| J3 | No late-arriving blocked reason | Final re-check | Re-run all Category A guards after Step 1 but before Step 2 | Hard block if any new reason |
| J4 | Final warning displayed | UI requirement | Operator has seen the full warning summary from §3 Category C, D | Hard block if hidden |

---

## 4. Hard Block Rules

Any of the following conditions is a hard stop for future apply. There is no override,
no force flag, no admin bypass, and no API parameter that lifts any hard block.

| Condition | Category | Action |
|---|---|---|
| Any Category A guard fails | A | Stop; display which guard failed and why |
| `operatorConfirmed !== true` at Step 2 time | B | Stop; do not proceed |
| `applyConfirmation.step2Complete !== true` | B | Stop; do not proceed |
| Operator identity is null or empty | B | Stop; auth context required |
| `confidence === "low"` or `"blocked"` | C | Stop; display "Confidence too low — apply is blocked" |
| `conflicts.length > 0` | C | Stop; display "Unresolved conflicts — apply is blocked" |
| `unresolvedUnits.length > 0` | C | Stop; display "Unresolved required units — apply is blocked" |
| Any effect item has unsafe mutation flag | D | Stop; display which item and which flag |
| Any mutation outside declared scope in Category E | E | Stop; do not proceed |
| `backendCommitPlanned === true` outside backend scope | F | Stop; display "Backend commit not authorised" |
| Any persistence or export action in Category G | G | Stop; do not proceed |
| Rollback text is absent at Step 2 | H | Stop; display rollback information before allowing Step 2 |
| Event category outside `UI`, `OPERATOR`, `SYSTEM` | I | Stop; do not write the log entry |
| `candidate.blockedReasons.length > 0` | J | Stop; display each blocked reason |
| Any Category A guard fails on the late re-check (J3) | J | Stop; revert to Step 1 and require Step 1 to be repeated |

---

## 5. Event Log Boundary

If a future controlled apply implementation writes to the event log, the categories
used must comply with the existing event log boundary. This boundary is not relaxed
by live apply.

### Permitted categories

| Category | Meaning | Permitted in apply log entries |
|---|---|---|
| `UI` | An operator interaction with the interface | Yes — for Step 1 and Step 2 button presses |
| `OPERATOR` | A decision or action owned by the operator | Yes — for the confirmed apply action |
| `SYSTEM` | An automatic system-level event | Yes — for internal state transitions, not for AI decisions |

### Forbidden categories

| Category | Why forbidden |
|---|---|
| `AI` | Live apply is operator-gated; no AI decision is involved in the apply path |
| `SIM` | `SIM` is not a defined event log category in this system |
| `SCENARIO` | Scenario-level events are not a defined event log category in this system |

### Log entry requirements

Any event log entry written during a future controlled apply must include:

- `category`: one of `UI`, `OPERATOR`, or `SYSTEM` — never a new value
- `source`: the exact component or handler that triggered the event
- `message`: a human-readable description of what happened, naming the apply scope
- `severity`: appropriate level — `INFO` for successful steps, `WARN` for warnings,
  `ERROR` for failures
- `timestamp`: ISO 8601 timestamp at the moment of the event

Log entries must not be written for events that did not occur. A Step 2 that was
shown but not completed must not produce an `OPERATOR` log entry.

---

## 6. Rollback / Rewind Contract

Before any future controlled live apply may proceed to Step 2, the operator must
be presented with a rollback contract. This contract defines what the apply does,
what it does not do, and how its effects can be reversed.

### What the operator must see before Step 2

1. **Exact apply scope** — a complete list of every unit, overlay, and timeline note
   that will change. No omissions. No aggregated "N items will change" without detail.

2. **Rewind method** — an explicit statement of how to reverse each category of change:
   - Unit status changes: which API call, UI action, or manual edit reverts each one.
   - Unit position changes: how to restore each unit's previous position.
   - Map overlay changes: how to remove or restore each overlay.
   - Timeline note changes: whether notes can be deleted and how.

3. **Irreversibility warning** — if any change in the apply scope cannot be reversed
   without backend access or manual database intervention, that must be named
   explicitly before Step 2.

4. **No auto-rewind** — the system must not offer a "revert" button that undoes
   the apply automatically. Rewind is a separate future operator action, not part
   of the apply flow.

### What the rollback contract prohibits

| Prohibited action | Reason |
|---|---|
| Applying without showing the rewind method | Operator must know how to reverse before confirming |
| Hidden or collapsed rewind information at Step 2 | Rewind details must not be behind a toggle at confirmation time |
| Automated rollback triggered by any event | Rollback is a separate explicit future action |
| "Cancel" as a rollback | Cancel means "do not apply" — it is not a rewind of a completed apply |
| Treating a failed apply as a rollback | A failed apply may have left partial state; that is a different recovery problem |

### Minimum rollback fields in the apply scope declaration

A future apply implementation must carry or derive the following for every proposed
change, and surface them in the Step 2 display:

```
UnitChangeRecord {
  uid:          string     // live unit UID
  field:        string     // "status" | "position"
  previousValue: any       // value before apply — captured at Gate 5 (reconciliation) time
  proposedValue: any       // value that would be written
  rewindMethod: string     // human-readable description of how to undo
}
```

If `previousValue` cannot be determined at Gate 5 time, the change is not safe to
apply and must block at Category D.

---

## 7. Recommended Next PRs

### PR-191 — Apply Confirmation Type Guard
*(pure JS only, no UI, no mutation, no storage)*

- Define `APPLY_CONFIRMATION_MODE_VALUES` frozen constant: `['operator_two_step']`.
- Implement `isApplyConfirmationSafe(confirmation)`.
  Returns `{ passed, blockedReasons }`.
- Checks: `step1Complete === true`, `step2Complete === false` (at construction),
  `operatorId` is a non-empty string, `confirmedAt` is a non-empty string,
  `applyMode === "operator_controlled"`, `mode === "operator_two_step"`,
  no unsafe fields (`autoApply`, `skipStep1`, `forceConfirm`, etc.).
- No object creation, no UI, no apply path.
- Exposed on `window.AppShellScenarioWorkspace` for console/test access only.

### PR-192 — Apply Confirmation Builder
*(pure function only, not wired to UI, no storage)*

- Implement `buildApplyConfirmation(candidate, step1Record, options)`.
- Re-runs `isApplyCandidateSafe(candidate)` before building.
- `step2Complete` is always `false` at construction.
- `operatorConfirmed` remains `false` at construction.
- Calls `isApplyConfirmationSafe()` self-check before returning.
- Returns `{ passed, confirmation|null, blockedReasons, warnings }`.
- Exposed on public API for console/test only.

### PR-193 — Diagnostics-Only Final Checklist Preview
*(extends existing Import Diagnostics; no new card outside diagnostics)*

- Wire `buildApplyConfirmation()` output into `#sw-dpkg-diagnostics` as read-only rows.
- Show `step1Complete`, `step2Complete`, `operatorId` placeholder, `applyMode` as
  read-only rows with appropriate neutral/ok styling.
- No Gate 7 confirmation button. No apply path. No controls.
- Requires PR-192 builder.

### PR-194+ — Controlled Apply Implementation Discussion
*(docs-only discussion; no implementation unless explicitly approved)*

- Define the exact API surface the controlled apply implementation would use.
- Define the exact sequence of `window.units` writes, Leaflet layer updates,
  `stepIndex` increments, and journal writes.
- Submit for security review before any implementation is written.
- No code. No UI. Full separate security review and sign-off required before
  any implementation PR is permitted.

---

## 8. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-190-final-apply-safety-checklist-contract.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no checklist object, checklist runner, or checklist UI
- [x] Adds no apply function, apply button, or apply path
- [x] Adds no commit button or commit path
- [x] Adds no candidate storage or `_swApplyCandidate`
- [x] Adds no staging, review, dry-run, reconciliation, apply, or confirmation storage
- [x] Adds no backend calls or storage writes
- [x] Keeps imported package preview read-only
- [x] Does not modify `app.js` or `adjudicator-map.js`
- [x] Does not modify `scenario-workspace.js`, `app.html`, `i18n.js`, or `style.css`
- [x] Does not mutate `window.units`, `window.lines`, `window.RmoozScenario.stepIndex`,
      the map, or the real scenario
- [x] Does not re-add external scenario catalog UI
- [x] Does not link `scen-catalog-contract.js`
- [x] Import Diagnostics remains collapsed by default (no change to that behavior)
- [x] `committed` remains `false` everywhere in the codebase
- [x] `operatorConfirmed` remains `false` everywhere in the codebase
- [x] `liveMutationPlanned` remains `false` everywhere in the codebase
- [x] `_swApplyCandidate` does not exist and is not created

---

## 9. Files Changed in This PR

**One file only:**

- `docs/pr-190-final-apply-safety-checklist-contract.md` — this file (new)

All runtime files are unchanged.
