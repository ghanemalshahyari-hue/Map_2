# PR-194 — Controlled Apply Implementation Discussion

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-185 through PR-193 (full diagnostics preview chain).  
**Date:** 2026-05-26

---

## 1. Purpose

This document is a readiness review and discussion only. It does not approve any
implementation. It does not create apply behavior. It does not permit live mutation
of any kind.

The purpose is to honestly assess what has been built, what still needs to be built,
what risks a future implementation would carry, and what the safest path forward looks
like — so that if and when a future PR proposes controlled live apply, there is a clear
written record of every risk that was considered and every precondition that was
required.

**No code change in this PR.** No file outside `docs/` is modified.

---

## 2. Current Safe State

### What has been built (PRs 168–193)

The full diagnostics-only preview chain is complete and running inside the collapsed
Import Diagnostics section of the Scenario Workspace panel. Every step in the chain
is a pure read-only function or display row.

| Step | Function | Status |
|---|---|---|
| Gate 1 — Staging validation | `validateStagingCandidate(step)` | Implemented — PR-168/169 |
| Staging proposal | `buildStagingProposal(step, opts)` | Implemented — PR-173/174 |
| Gate 2 — Proposal safety | `isStagingProposalSafe(proposal)` | Implemented — PR-172 |
| Gate 3 — Review record safety | `isOperatorReviewRecordSafe(record)` | Implemented — PR-177 |
| Gate 4 — Dry-run confirmation safety | `isDryRunConfirmationSafe(confirmation)` | Implemented — PR-179 |
| Dry-run confirmation | `buildDryRunConfirmation(proposal, record)` | Implemented — PR-180/181 |
| Gate 5 — UID reconciliation | `reconcileUidReferences(step, snapshot)` | Implemented — PR-183/184 |
| Gate 6 — Apply candidate safety | `isApplyCandidateSafe(candidate)` | Implemented — PR-186 |
| Apply candidate | `buildApplyCandidate(proposal, record, drc, rr)` | Implemented — PR-187/188 |
| Gate 7 (partial) — Confirmation safety | `isApplyConfirmationSafe(confirmation)` | Implemented — PR-191 |
| Apply confirmation | `buildApplyConfirmation(candidate, opCtx)` | Implemented — PR-192/193 |

### Current hard limits — all confirmed in place

- **No stored objects.** No `_swStagingProposal`, `_swApplyCandidate`, or
  `_swApplyConfirmation` exists anywhere on `window` or in module scope. Every object
  is a local variable in the paint function, discarded on each repaint.
- **No apply controls.** No apply button, commit button, confirm button, or Gate 7 UI
  exists anywhere in the codebase.
- **No apply path.** No function in the codebase can cause a live mutation through a
  call chain that starts from the UI.
- **No backend.** No `/api/sim/commit`, `/api/sim/apply`, or equivalent is called or
  referenced in any runtime file.
- **No mutation.** `window.units`, `window.lines`, `window.RmoozScenario.stepIndex`,
  and all Leaflet map layers are unchanged by the entire PR-168–193 chain.
- **Diagnostics collapsed by default.** The `#sw-dpkg-diagnostics-body` is hidden
  unless the operator explicitly toggles it open.
- **Preview chain is read-only.** The five preview sections (proposal, DRC, apply
  candidate, final confirmation) are display-only rows. No interaction is possible.
- **`committed`, `operatorConfirmed`, `liveMutationPlanned`, `backendCommitPlanned`
  and `step2Complete` are all `false` everywhere in the codebase.**

### Current limitation: apply candidate is never ready

The apply candidate preview currently always shows "Not ready — UID reconciliation
pending." This is correct and expected. `reconcileUidReferences` is called with an
empty `[]` snapshot because `window.units` must not be read directly. Until a safe
caller-supplied live units snapshot is available (PR-195+), the apply candidate will
never reach a `passed: true` state, and the confirmation preview will always show
"Not ready — apply candidate not ready."

This is a safety feature, not a bug.

---

## 3. Minimum Requirements Before Implementation Can Be Considered

Controlled live apply must not be proposed, designed, or prototyped until every item
on this list is satisfied. Each item must exist as accepted code or accepted
documentation before the controlled apply PR is written — not concurrently.

| Requirement | Depends on | Current state |
|---|---|---|
| UID reconciliation can run from a safe copied live-units snapshot | PR-195 snapshot contract; PR-196 type guard; PR-197 builder | Not started |
| Apply candidate actually reaches `passed: true` in diagnostics | Requires safe snapshot from PR-197 | Not started |
| Operator identity is available at Gate 7 time | PR-199 operator identity contract | Not started |
| Final checklist (PR-190) is fully visible and verified | UI for Category H checklist rows | Not started |
| Rollback/rewind plan is visible to operator before Step 2 | Defined in PR-190 §6; not yet surfaced in UI | Not started |
| Event Log boundary preserved for apply actions | PR-190 §5; not yet verified in apply context | Not started |
| Gate 7 second operator confirmation design accepted | PR-189 accepted | Done |
| Controlled staging state reviewed | PR-200+ discussion | Not started |
| Explicit human sign-off for implementation given | Out-of-band sign-off from responsible reviewer | Not given |
| Full security review completed | Separate process | Not started |

None of these requirements has an exception. The implementation PR may not begin
while any item remains outstanding.

---

## 4. Implementation Risks

The following risks are documented here so that a future security reviewer has a
complete list of what must be addressed. Each risk has a description, the specific
code paths or data sources involved, and the current mitigation.

### R1 — Accidental mutation of `window.units`

**Risk:** A future implementation that reads `window.units` by live reference inside
the reconciliation or apply function could accidentally mutate live unit records
through a shared object reference, even without an explicit assignment.

**Affected code path:** `reconcileUidReferences`, `buildApplyCandidate`, any future
apply handler that reads reconciliation output.

**Current mitigation:** `reconcileUidReferences` accepts a caller-supplied snapshot
and must not close over `window.units`. No path to live apply exists.

**Required before apply:** Every function in the apply chain must be verified to
hold no live reference to `window.units`. Snapshot isolation must be confirmed by
code review.

---

### R2 — Accidental mutation of `window.lines`

**Risk:** A future map overlay apply step could accidentally mutate `window.lines`
entries through a shared reference if the apply function receives the live array
rather than a cloned copy.

**Current mitigation:** No apply function exists. `window.lines` is not touched by
any function in the PR-168–193 chain.

**Required before apply:** The apply function must receive a deep-copied snapshot of
`window.lines` (or the relevant subset). It must not accept a live reference.

---

### R3 — Accidental map layer mutation

**Risk:** Any Leaflet map layer update (marker move, overlay draw, layer remove) that
is triggered inside the apply chain without an explicit Gate 7 Step 2 completion check
would cause a silent live mutation that the operator did not explicitly confirm.

**Current mitigation:** No Leaflet calls exist in the apply chain. The diagnostics
preview does not touch the map.

**Required before apply:** Map layer writes must be gated behind a verified
`candidate.operatorConfirmed === true` check that can only be set by the Step 2
handler.

---

### R4 — Accidental scenario step advance

**Risk:** If `window.RmoozScenario.stepIndex` is incremented as part of a package
import or preview repaint rather than as an explicit apply action, the live scenario
advances without operator confirmation.

**Current mitigation:** `window.RmoozScenario.stepIndex` is not modified by any
function in the PR-168–193 chain. No import triggers a step advance.

**Required before apply:** Step index increment must be the last write in the apply
sequence, after all unit and map writes are confirmed complete, and only if step
advance is declared in the apply scope.

---

### R5 — Stale imported package data

**Risk:** The imported decision package may have been loaded at a different point in
the scenario than the current live state. If reconciliation ran against a snapshot
taken earlier, the `proposedEffects` would describe changes relative to an outdated
state.

**Current mitigation:** Reconciliation is called during each repaint with the current
step. No snapshot is cached between repaints.

**Required before apply:** The live units snapshot passed to `reconcileUidReferences`
must be taken at Gate 7 time (immediately before Step 2), not at Gate 5 time, to
ensure it reflects the current live state.

---

### R6 — UID mismatch between package and live scenario

**Risk:** If an imported package was generated against an older version of the
scenario (different UIDs, renamed units, reorganised OOB), the reconciliation result
could assign position or status changes to the wrong live unit.

**Current mitigation:** The reconciliation result's `confidence` and `matchMethod`
fields surface this risk. Low confidence or `name_type_match` / `location_proximity_match`
results must be shown as warnings. Gate 5 blocks `passed: true` if confidence is
`"low"` or `"blocked"`.

**Required before apply:** The operator must see and explicitly acknowledge all
`name_type_match` and `location_proximity_match` warnings before Step 2.

---

### R7 — Side / faction mismatch

**Risk:** If a unit in the imported package has a different `side` value from the
best-matching live unit, the reconciliation could assign Blue-force effects to a
Red-force unit, or vice versa.

**Current mitigation:** `reconcileUidReferences` treats a side/faction mismatch as
a hard block on the affected unit. A mismatch produces a `conflict` entry, not a
warning.

**Required before apply:** No change needed to the hard-block logic. The apply
function must re-verify that `conflicts.length === 0` before proceeding.

---

### R8 — Unsafe flags in `proposedEffects`

**Risk:** If a future function populates `proposedEffects` with items that carry
mutation markers (`applyNow: true`, `mutateUnits: true`, etc.), the apply handler
might execute those mutations without a Gate 7 check.

**Current mitigation:** `isApplyCandidateSafe` checks every item in all four
`proposedEffects` arrays for known unsafe flags and blocks if any are found.

**Required before apply:** The apply handler must re-run `isApplyCandidateSafe`
immediately before executing any write, not rely on the result from candidate
construction time.

---

### R9 — Hidden persistence

**Risk:** A future implementation might write apply-related data to `localStorage`,
`sessionStorage`, `IndexedDB`, or a backend API as a side effect of the apply flow,
without the operator knowing.

**Current mitigation:** No storage write exists in the PR-168–193 chain. Every
object is a local variable.

**Required before apply:** Any storage write must be declared explicitly in the
apply scope, reviewed separately, and shown to the operator in the apply summary
before Step 2.

---

### R10 — Backend commit leakage

**Risk:** If `/api/sim/commit` or `/api/sim/apply` is called before Gate 7 Step 2
completes — for example, as part of a "staging" API that is misused as a commit
endpoint — the backend state changes without full operator confirmation.

**Current mitigation:** No backend API is called in the PR-168–193 chain.
`candidate.backendCommitPlanned` is hard-locked `false` at construction.

**Required before apply:** Backend commit, if ever in scope, must be the last action
in the apply sequence, gated behind `candidate.operatorConfirmed === true` and a
separate `backendCommitPlanned` flag that is set only by Gate 7 Step 2.

---

### R11 — Ambiguous copy

**Risk:** If UI labels such as "Save", "OK", "Submit", or "Confirm" appear near the
diagnostics section or in any PR before Gate 7 is implemented, operators may mistake
a preview action for a live apply action.

**Current mitigation:** PR-176 and PR-189 define approved and forbidden label lists.
No apply, commit, or ambiguous label appears anywhere in the current codebase.

**Required before apply:** Every new label added in any PR from now until the
controlled apply implementation must be reviewed against the PR-176 and PR-189
forbidden label lists.

---

### R12 — Event log category drift

**Risk:** A future apply implementation might introduce new event log categories
(`AI`, `SIM`, `SCENARIO`) that violate the boundary defined in PR-190.

**Current mitigation:** The event log accepts only `UI`, `OPERATOR`, and `SYSTEM`.
No apply log entries are written in the current codebase.

**Required before apply:** Any log entry written by the apply handler must use only
the three permitted categories. The log entry validator must reject unknown categories.

---

### R13 — No rollback / rewind path

**Risk:** If live apply proceeds without a defined and operator-visible rewind method,
the operator has no way to recover from an incorrect apply without direct database
or backend access.

**Current mitigation:** PR-190 §6 defines the rollback contract and the
`UnitChangeRecord` shape including `previousValue` and `rewindMethod`. No rewind
UI exists yet.

**Required before apply:** The rollback path must be defined, documented, and shown
to the operator in the Step 2 modal before the confirm button is enabled. A future
PR must implement the `previousValue` capture at Gate 5 time.

---

## 5. Implementation Options

The following three options are presented for discussion only. No option is chosen
or approved here. Any option that leads to live mutation requires a separate
implementation PR with full security review.

### Option A — Continue diagnostics-only previews *(safest)*

Continue extending the diagnostics-only chain. Add the live units snapshot contract
(PR-195), snapshot type guard (PR-196), and snapshot builder (PR-197) so that
`reconcileUidReferences` can run against a real — but still read-only — live snapshot.
This would make the apply candidate reach `passed: true` in the diagnostics for the
first time, enabling meaningful end-to-end verification of the full chain.

**What this does:** Makes the preview chain accurate. Does not add any write path.
Every function remains read-only.

**What this does not do:** Does not apply any changes. Does not set `operatorConfirmed`
or `step2Complete` to `true`. Does not add any controls.

**Risk:** Very low. No mutation path exists.

**Recommendation:** This is the correct next path. PR-195 through PR-198 are the
natural continuation.

---

### Option B — Controlled staging state only *(medium risk)*

After Option A is complete and the snapshot chain is verified, introduce an in-memory
staging state that holds the apply candidate and confirmation in module scope — not
in `window`, not in `localStorage`. This would allow the operator review surface
(Gate 7 UI) to be built and tested without any live write path.

**What this does:** Enables the Gate 7 two-step UI to be built and operator-tested.
The confirmation flow can be exercised. The operator sees the full apply summary with
real reconciliation data.

**What this does not do:** Does not mutate `window.units`, `window.lines`, the map,
or `stepIndex`. Does not write to backend. Does not write to storage. `committed`
and `step2Complete` remain `false`.

**Risk:** Medium. The in-memory staging state must be carefully bounded. No external
reference to the staged candidate must exist. The Gate 7 UI must be clearly labelled
as a dry-run preview.

**Prerequisite:** PR-195–198 (snapshot chain), PR-199 (operator identity), PR-200
discussion approved.

---

### Option C — Controlled live apply *(highest risk)*

After Options A and B are complete and reviewed, a full controlled live apply
implementation could be proposed. This is the only option that would set
`committed: true`, `step2Complete: true`, `operatorConfirmed: true`, and write
to `window.units`, the map, and optionally the backend.

**What this does:** Writes live changes. Irreversible without a manual rollback.

**What this requires:**
- All items from §3 satisfied.
- All risks from §4 addressed and reviewed.
- Full separate security review.
- Explicit written sign-off from the responsible reviewer.
- A separate implementation proposal PR (docs-only) reviewed and accepted first.
- No implementation until that proposal PR is merged.

**Risk:** High. This is the highest-risk change in the entire system.

**Recommendation:** Do not begin Option C until PR-199 is accepted and Option B has
been fully exercised and reviewed. No earlier.

---

## 6. Recommended Next PRs

The following PRs are recommended in order. No PR may skip ahead. Each must be
accepted before the next begins.

| PR | Title | Type | Prerequisite |
|---|---|---|---|
| **PR-195** | Live Units Snapshot Contract | Docs-only | PR-194 |
| **PR-196** | Snapshot Type Guard | Pure JS, no UI | PR-195 |
| **PR-197** | Snapshot Builder | Pure function, no storage, caller-triggered | PR-196 |
| **PR-198** | UID Reconciliation Diagnostics with Real Snapshot | Read-only display only | PR-197 |
| **PR-199** | Operator Identity Contract | Docs-only | PR-198 |
| **PR-200+** | Controlled Staging State Discussion | Docs-only | PR-199 |
| **Later** | Gate 7 UI (Option B) | UI, no mutation | PR-200 accepted |
| **Much later** | Controlled Apply Implementation | Full security review required | PR-200 accepted + sign-off |

### PR-195 — Live Units Snapshot Contract *(docs-only)*

Define the contract for a safe, caller-triggered, read-only deep copy of the live
units array. The snapshot must:
- Be created by an explicit caller action, not by an automatic process.
- Be a deep copy — no live reference to `window.units` may persist after the copy.
- Carry a `snapshotAt` timestamp.
- Carry a `unitCount` for validation.
- Be immutable after creation (`readOnly: true`, `liveMutationAllowed: false`).
- Never be stored in module scope or `window`.
- Be passed as a parameter to `reconcileUidReferences`, not read globally.

### PR-196 — Snapshot Type Guard *(pure JS, no UI)*

- Define `isLiveUnitsSnapshotSafe(snapshot)`.
- Checks: `readOnly === true`, `liveMutationAllowed === false`, `units` is an array,
  `snapshotAt` is a non-empty string, `unitCount` matches `units.length`.
- No object creation. No UI. No storage.

### PR-197 — Snapshot Builder *(pure function, caller-triggered)*

- Define `buildLiveUnitsSnapshot(liveUnitsArray, options)`.
- Caller provides the array — function must not read `window.units` directly.
- Deep-copies the input. Sets `readOnly: true`, `liveMutationAllowed: false`.
- Calls `isLiveUnitsSnapshotSafe` self-check before returning.
- Returns `{ passed, snapshot|null, blockedReasons }`.
- No storage. No automatic trigger.

### PR-198 — UID Reconciliation Diagnostics with Real Snapshot *(read-only display)*

- Wire a safe snapshot from `buildLiveUnitsSnapshot` into the diagnostics repaint.
- Pass the snapshot to `reconcileUidReferences` so the apply candidate can reach
  `passed: true` in the diagnostics for the first time.
- Display updated UID reconciliation results and apply candidate readiness.
- No Gate 7 controls. No apply path. Read-only display only.

### PR-199 — Operator Identity Contract *(docs-only)*

- Define what "operator identity" means at Gate 7 time.
- Define where `operatorId` comes from (session, auth context, explicit input).
- Define what happens if operator identity is not available.
- No code. No UI.

---

## 7. Still Forbidden

The following actions remain permanently forbidden until the controlled apply
implementation PR is explicitly written, reviewed, and accepted with full security
review and sign-off. This list is unchanged by this document.

| Forbidden action |
|---|
| Any `applyToScenario()` or equivalent function |
| Any apply button in the UI |
| Any commit button in the UI |
| Any call to `/api/sim/commit` or `/api/sim/apply` |
| Any mutation of `window.units` entries |
| Any mutation of `window.lines` entries |
| Any mutation of any Leaflet map layer |
| Any change to `window.RmoozScenario.stepIndex` |
| Setting `committed: true` on any in-memory object |
| Setting `operatorConfirmed: true` outside the Gate 7 Step 2 handler |
| Setting `liveMutationPlanned: true` without Gate 7 Step 2 |
| Setting `backendCommitPlanned: true` without Gate 7 Step 2 |
| Setting `step2Complete: true` outside the Gate 7 Step 2 handler |
| Writing any journal entry for a live apply action |
| Persisting any apply-related record to storage |
| Exporting or downloading any apply-related record |
| Auto-advancing the scenario step on package import |
| AI-generated apply without explicit operator action |
| Single-click live apply |

---

## 8. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-194-controlled-apply-implementation-discussion.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no apply function, apply button, or apply path
- [x] Adds no commit button or commit path
- [x] Adds no Gate 7 confirmation button, checkbox, or modal
- [x] Adds no candidate storage or `_swApplyCandidate`
- [x] Adds no confirmation storage or `_swApplyConfirmation`
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
- [x] `step2Complete` remains `false` everywhere in the codebase
- [x] `_swApplyCandidate` does not exist and is not created
- [x] `_swApplyConfirmation` does not exist and is not created

---

## 9. Files Changed in This PR

**One file only:**

- `docs/pr-194-controlled-apply-implementation-discussion.md` — this file (new)

All runtime files are unchanged.
