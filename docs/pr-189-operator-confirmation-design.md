# PR-189 — Operator Confirmation Design

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-185 (controlled live apply boundary), PR-186 (`isApplyCandidateSafe`),
PR-187 (`buildApplyCandidate`), PR-188 (diagnostics-only apply candidate preview).  
**Date:** 2026-05-26

---

## 1. Purpose

Gate 7 is the second and final explicit operator confirmation required before any future
controlled live apply action may proceed. It is defined here as a design contract only.

**Gate 7 is not implemented now.** No confirmation UI exists. No confirmation button
exists. No apply path exists. No code in this PR enables, approximates, or prepares
Gate 7 beyond this documentation.

When Gate 7 is eventually implemented in a later explicitly approved PR, it must satisfy
every requirement in this document without exception. No requirement may be waived,
shortened, or substituted.

### Why Gate 7 exists

Every gate up to and including Gate 6 (`isApplyCandidateSafe`) is a read-only
verification step. None of them cause any change to the live scenario. Gate 7 is
the boundary between read-only verification and the first moment at which a future
controlled apply could write to the live scenario.

Gate 7 is therefore the last and most important safety point. It must:

- Be a deliberate, two-step human action — never a single click.
- Be impossible to trigger by any automated process, AI system, or timeout.
- Be impossible to pre-confirm, pre-fill, or bypass.
- Be visually and logically separate from all preceding review steps.
- Be the only path that may set `operatorConfirmed: true` on an `ApplyCandidate`.

---

## 2. Required Preconditions Before Gate 7 May Appear

A future PR that adds Gate 7 UI must verify all of the following before presenting
any confirmation UI to the operator. All checks must be re-run at Gate 7 time, not
relied upon from a cached result.

| Precondition | Guard | Required state |
|---|---|---|
| Staging candidate is valid | `validateStagingCandidate(step)` | `passed === true` |
| Staging proposal is safe | `isStagingProposalSafe(proposal)` | `passed === true` |
| Operator review record is safe | `isOperatorReviewRecordSafe(record)` | `passed === true` AND `record.decision === "approve_dry_run"` |
| Dry-run confirmation is safe | `isDryRunConfirmationSafe(confirmation)` | `passed === true` |
| UID reconciliation passed | `reconcileUidReferences(step, snapshot)` | `passed === true`, confidence `"high"` or `"medium"`, `conflicts.length === 0` |
| Apply candidate is safe | `isApplyCandidateSafe(candidate)` | `passed === true` |
| Apply candidate ready | `candidate.blockedReasons` | `[]` — empty at presentation time |
| No unresolved required units | Reconciliation result | `unresolvedUnits.length === 0` |
| No conflicts | Reconciliation result | `conflicts.length === 0` |
| No backend commit planned | `candidate.backendCommitPlanned` | `false` — hard-locked |
| Live mutation not yet authorised | `candidate.liveMutationPlanned` | `false` — remains false until Gate 7 Step 2 only |
| Operator confirmed not yet set | `candidate.operatorConfirmed` | `false` — hard-locked until Gate 7 Step 2 only |

Any single precondition that is not met is a hard stop. Gate 7 UI must not be shown,
and the operator must be shown the reason the candidate is not ready.

---

## 3. Two-Step Operator Model

Gate 7 consists of exactly two explicit operator actions. These two steps are
sequential and cannot be merged, abbreviated, or substituted. No action may be
pre-selected, timed out, or completed by any automated process.

### Step 1 — Approve dry-run preview

The operator explicitly reviews the complete dry-run summary and confirms that the
preview is accurate and complete before proceeding. This step:

- Is presented first, before any mention of applying changes.
- Displays the full `effectsPreview` from the `DryRunConfirmation`:
  all four arrays (`unitStatusChanges`, `unitPositionChanges`, `mapOverlays`,
  `timelineNotes`), even if empty — empty arrays must be labelled "no changes."
- Displays the reconciliation match summary: matched units, match methods used,
  warnings for any `name_type_match` or `location_proximity_match` results.
- Displays the safety invariants of the apply candidate:
  `committed: false`, `liveMutationPlanned: false`, `backendCommitPlanned: false`.
- Uses the label **"Approve dry-run preview"** — not "Apply", not "Commit",
  not "Confirm apply."
- Does not set `operatorConfirmed`, `liveMutationPlanned`, or `backendCommitPlanned`.
- Does not change any in-memory state on the `ApplyCandidate`.
- May be implemented as a checkbox or a distinct button — not a radio button
  with a pre-selected default.

Only after Step 1 is explicitly completed may Step 2 be presented. If the operator
navigates away, the page reloads, or the session resets between Step 1 and Step 2,
both steps must be repeated from the beginning.

### Step 2 — Confirm controlled apply

A visually and logically separate confirmation action. This step:

- Is presented on a new surface (modal, drawer, or distinct inline section) —
  not the same element as Step 1.
- Displays a final apply summary listing every proposed change explicitly:
  which units change status, which change position, what timeline notes are added.
- Displays the confidence level and match method for every matched unit.
- Displays all warnings from the reconciliation result, even if Step 1 already
  showed them. Warnings must not be hidden or collapsed at Step 2.
- Uses the label **"Confirm controlled apply"** or **"Apply to live scenario"**
  (the word "Apply" is permitted here and only here — at Step 2, not before,
  not in labels for any other action).
- Requires the operator to click a distinct button that is not the same element,
  not the same label, and not in the same visual position as the Step 1 control.
- Is the only action in the entire codebase that may set `operatorConfirmed: true`.
- Is the only action that may set `liveMutationPlanned: true` and
  `backendCommitPlanned: true` — and only if all preconditions from §2 are
  re-confirmed at this exact moment.

### Separation requirements

The two steps must be visually and logically separate in the following ways:

| Property | Step 1 | Step 2 |
|---|---|---|
| Label | "Approve dry-run preview" | "Confirm controlled apply" |
| Surface | First confirmation zone | Separate modal or section |
| Availability | Always shown when Gate 6 passes | Only shown after Step 1 is complete |
| Effect on candidate | None — read-only review | Sets `operatorConfirmed: true` |
| Reversibility | Operator may cancel or navigate away | Reverting requires manual rollback |

### Automation prohibition

- No timeout may trigger Step 2 if the operator has not explicitly completed Step 1.
- No AI system, background process, script, or API call may perform Step 1 or Step 2
  on behalf of the operator.
- No batch operation, scheduled task, or webhook may substitute for either step.
- No keyboard shortcut may substitute for either step unless the shortcut requires
  the same deliberate operator action as a click.
- `operatorConfirmed` must never be set by any code path other than the Step 2
  handler in the explicitly approved controlled apply PR.
- If the apply candidate object is serialised or logged at any point before Step 2,
  it must have `operatorConfirmed: false`. A serialised candidate with
  `operatorConfirmed: true` that was not created by the Step 2 handler is invalid.

---

## 4. Future Confirmation Copy

### Approved labels

The following labels are the only permitted wordings for Gate 7 UI elements.
Future implementation PRs must use one of these or obtain explicit approval for
alternative wording.

| Context | Approved label |
|---|---|
| Step 1 button | "Approve dry-run preview" |
| Step 2 button | "Confirm controlled apply" |
| Step 2 alternative | "Apply to live scenario" |
| Section heading | "Controlled apply requires operator confirmation" |
| Review sub-heading | "Review final apply summary" |
| Effects sub-section | "No backend commit" |
| Pre-Step-2 note | "Final check before live changes" |

### Forbidden labels

The following labels must never appear on any Gate 7 UI element, in any language,
at any step.

| Forbidden label | Reason |
|---|---|
| "OK" | Too generic — does not name what is confirmed |
| "Yes" | Does not name the action |
| "Save" | Implies file operation, not live scenario mutation |
| "Submit" | Implies form submission, not operator decision |
| "Run" | Implies automated execution |
| "Execute" | Implies automated execution |
| "Auto apply" | Contradicts the operator-gated model |
| "Commit" | Implies version control or database write |
| "Push to map" | Implies silent background write |
| "Approve" (standalone) | Too generic; must specify what is approved |
| "Confirm" (standalone) | Too generic; must specify what is confirmed |

### Required disclosure text

Before Step 2 is presented, the following disclosure must be shown verbatim or
with equivalent meaning:

> "This action will apply changes to the live scenario. The following units and
> positions will be updated. This cannot be undone without a manual rollback.
> Confirm only if you have reviewed the full dry-run summary above."

The disclosure must:
- Be visible without scrolling past the Step 2 button.
- Name the specific changes (unit count, overlay count, timeline note count).
- State that rollback is manual.
- Reference the dry-run summary.

---

## 5. Future Warning Requirements

Before Step 2 is presented, a warning summary must be displayed to the operator.
The summary must include every item in the following list, even if the value is zero.
Items with a value of zero must be shown as "0" — they must not be hidden.

| Warning item | Source | Blocked if non-zero |
|---|---|---|
| Affected units count | `proposedEffects.unitStatusChanges.length` | No — informational |
| Affected map overlays count | `proposedEffects.mapOverlays.length` | No — informational |
| Affected timeline notes count | `proposedEffects.timelineNotes.length` | No — informational |
| Confidence level | `candidate.confidence` | Yes if `"low"` or `"blocked"` |
| Unresolved units count | `reconciliationResult.unresolvedUnits.length` | Yes if `> 0` |
| Conflicts count | `reconciliationResult.conflicts.length` | Yes if `> 0` |
| Backend commit | `candidate.backendCommitPlanned` | Always shown as "Disabled" |
| Live mutation planned | `candidate.liveMutationPlanned` | Shown as "Pending explicit confirmation" before Step 2 |

### Warnings from reconciliation

Every entry in `reconciliationResult.warnings[]` must be shown to the operator at
Step 2 time. Warnings must not be truncated, collapsed, or hidden behind a toggle at
this point. This is the final review before live changes.

### Hard block conditions at Gate 7

The following conditions prevent Gate 7 from proceeding regardless of the operator's
input. The reason must be displayed explicitly.

| Condition | Display |
|---|---|
| `confidence === "low"` or `confidence === "blocked"` | "Confidence too low — apply is blocked" |
| `conflicts.length > 0` | "Unresolved conflicts — apply is blocked" |
| `unresolvedUnits.length > 0` | "Unresolved required units — apply is blocked" |
| `isApplyCandidateSafe(candidate).passed === false` | "Apply candidate failed safety check — apply is blocked" |
| `candidate.operatorConfirmed !== false` before Step 2 | "Candidate is in invalid state — apply is blocked" |
| Any guard from Gates 2–6 fails when re-run at Gate 7 time | "Preceding gate re-check failed — apply is blocked" |

---

## 6. Final Apply Is Still Forbidden

The following actions remain permanently forbidden until a future PR (no earlier
than the controlled apply implementation PR) is explicitly written, reviewed, and
accepted with a full security review and sign-off.

| Forbidden action | Blocked until |
|---|---|
| Any `applyToScenario()` or equivalent function | Controlled apply implementation PR |
| Any apply button outside Gate 7 | Controlled apply implementation PR |
| Any commit button | Controlled apply implementation PR |
| Any call to `/api/sim/commit` or `/api/sim/apply` | Controlled apply implementation PR |
| Any mutation of `window.units` entries | Controlled apply implementation PR |
| Any mutation of `window.lines` entries | Controlled apply implementation PR |
| Any mutation of any Leaflet map layer | Controlled apply implementation PR |
| Any change to `window.RmoozScenario.stepIndex` | Controlled apply implementation PR |
| Setting `committed: true` on any in-memory object | Controlled apply implementation PR |
| Setting `operatorConfirmed: true` outside the Step 2 handler | Never — Step 2 handler only |
| Setting `liveMutationPlanned: true` without Gate 7 Step 2 | Never — Step 2 handler only |
| Setting `backendCommitPlanned: true` without Gate 7 Step 2 | Never — Step 2 handler only |
| Writing any journal entry for a live apply action | Controlled apply implementation PR |
| Persisting any apply-related record to storage | Not in scope |
| Exporting or downloading any apply-related record | Not in scope |
| Auto-advancing the scenario step on package import | Never |
| AI-generated apply without explicit operator action | Never |
| Single-click live apply | Never |

---

## 7. Recommended Next PRs

### PR-190 — Final Apply Safety Checklist Contract
*(docs-only; no runtime changes)*

- Define the complete ordered checklist that must pass immediately before the Step 2
  handler is permitted to run.
- Include re-verification of every gate (1–6) at Gate 7 time.
- Define what happens if any item fails during final re-check.
- Define rollback contract: what must be true for a rollback to be safe.
- No code. No UI.

### PR-191 — Apply Confirmation Type Guard
*(pure JS only, no UI, no mutation, no storage)*

- Define `APPLY_CONFIRMATION_MODE_VALUES` frozen constant: `['operator_two_step']`.
- Implement `isApplyConfirmationSafe(confirmation)`.
  Returns `{ passed, blockedReasons }`.
- Checks: `step1Complete === true`, `step2Complete === false` (at construction),
  `operatorId` is a non-empty string, `confirmedAt` is a non-empty string,
  `applyMode === "operator_controlled"`, no unsafe fields.
- No object creation, no UI, no apply path.
- Exposed on `window.AppShellScenarioWorkspace` for console/test access only.

### PR-192 — Apply Confirmation Builder
*(pure function only, not wired to UI, no storage)*

- Implement `buildApplyConfirmation(candidate, step1Record, options)`.
- Re-runs `isApplyCandidateSafe(candidate)` before building.
- `step2Complete` is always `false` at construction — the Step 2 handler in the
  future controlled apply PR is the only path that may set it `true`.
- `operatorConfirmed` remains `false` at construction.
- Returns `{ passed, confirmation|null, blockedReasons, warnings }`.
- Calls `isApplyConfirmationSafe()` self-check before returning.
- Exposed on public API for console/test only.

### PR-193+ — Diagnostics-Only Final Confirmation Preview
*(extends existing Import Diagnostics; no new card outside diagnostics)*

- Wire `buildApplyConfirmation()` output into `#sw-dpkg-diagnostics` as a read-only
  preview row.
- Show `step1Complete`, `step2Complete`, `operatorId`, `applyMode` as read-only rows.
- No Gate 7 confirmation button. No apply path.
- Requires PR-192 builder.

### Later — Controlled Apply Implementation
*(only after PR-190 accepted, security review complete, and explicit sign-off)*

- Separate security review required before this PR may be written.
- Full implementation proposal must be submitted before any apply logic is added.
- Scope: Gate 7 Step 1 handler, Gate 7 Step 2 handler, `window.units` mutation,
  `window.RmoozScenario.stepIndex` increment, Leaflet map layer update,
  journal write, backend commit bridge.
- This is the only PR that may set `committed: true` and `operatorConfirmed: true`.

---

## 8. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-189-operator-confirmation-design.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no Gate 7 confirmation button, checkbox, or modal
- [x] Adds no apply function, apply button, or apply path
- [x] Adds no commit button or commit path
- [x] Adds no candidate storage or `_swApplyCandidate`
- [x] Adds no staging, review, dry-run, reconciliation, or apply storage
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

- `docs/pr-189-operator-confirmation-design.md` — this file (new)

All runtime files are unchanged.
