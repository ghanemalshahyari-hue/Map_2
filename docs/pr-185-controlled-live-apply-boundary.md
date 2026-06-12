# PR-185 — Controlled Live Apply Boundary Design

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-171 (preview-to-staging contract), PR-175 (operator review boundary),
PR-178 (dry-run confirmation contract), PR-182 (UID reconciliation contract),
PR-184 (`reconcileUidReferences` builder), PR-186 (`isApplyCandidateSafe` type guard).  
**Date:** 2026-05-26

---

## 1. Purpose

Live apply is a future controlled operator-gated action that would cause changes to
the live scenario state — unit positions, unit statuses, scenario step index, map
overlays, or backend records.

**Live apply is not available now.** No path to live apply exists in the codebase at
this PR. No function, no button, no API endpoint, no background job, and no automatic
process can cause live apply to occur. `committed` is `false` everywhere, always.

When live apply is eventually designed and implemented in a later explicitly approved PR,
it must only happen after all seven gates listed in §2 have passed in sequence. No gate
may be skipped. No gate may be substituted. No exception exists for any input,
any scenario state, or any operator identity.

The purpose of this document is to lock the boundary so that future implementation PRs
have an unambiguous contract to work from and cannot silently expand scope.

---

## 2. Required Gates Before Future Live Apply

Seven gates must all pass before any future live apply action may begin. They must be
satisfied in order. Passing an earlier gate does not grant permission to skip a later one.

| Gate | Requirement | Enforced by |
|---|---|---|
| **Gate 1** | `validateStagingCandidate(step).passed === true` | PR-168 |
| **Gate 2** | `isStagingProposalSafe(proposal).passed === true` | PR-172 |
| **Gate 3** | `isOperatorReviewRecordSafe(record).passed === true` AND `record.decision === "approve_dry_run"` | PR-177 |
| **Gate 4** | `isDryRunConfirmationSafe(confirmation).passed === true` | PR-179 |
| **Gate 5** | `reconcileUidReferences(step, snapshot).passed === true` AND `result.confidence` is `"high"` or `"medium"` AND `result.conflicts.length === 0` | PR-183/184 |
| **Gate 6** | `isApplyCandidateSafe(candidate).passed === true` — candidate built from all five preceding gate outputs | PR-186 |
| **Gate 7** | Explicit two-click operator confirmation — first click approves the dry-run preview; second click confirms controlled apply; no defaults, no timeouts | Future PR-189+ |

Any single gate failure is a hard stop. There is no `forceApply`, no `skipGate`, no
admin override, no API parameter, and no flag that bypasses a gate.

### Gate chain diagram

```
importedStep
    │
    ▼
Gate 1 — validateStagingCandidate()      passed: true
    │
    ▼
Gate 2 — isStagingProposalSafe()         passed: true
    │
    ▼
Gate 3 — isOperatorReviewRecordSafe()    passed: true, decision: "approve_dry_run"
    │
    ▼
Gate 4 — isDryRunConfirmationSafe()      passed: true
    │
    ▼
Gate 5 — reconcileUidReferences()        passed: true, confidence: high|medium
    │
    ▼
Gate 6 — isApplyCandidateSafe()          passed: true  [PR-186 — implemented]
    │
    ▼
Gate 7 — Two-click operator confirm      explicit, no defaults, no auto  [future PR-189+]
    │
    ▼
Live apply — committed: true             FUTURE ONLY — not implemented
```

No arrow in this chain may be reversed, skipped, or short-circuited.

---

## 3. `ApplyCandidate` Shape

The type guard for `ApplyCandidate` is implemented in PR-186 (`isApplyCandidateSafe`).
The builder (`buildApplyCandidate`) is the subject of PR-187 and does not exist yet.
No JS file instantiates an `ApplyCandidate` object at this PR.

```
ApplyCandidate {

  // Identity
  proposalId:       string   // matches StagingProposal.id
  confirmationId:   string   // matches DryRunConfirmation identity (future field)
  reconciliationId: string   // matches ReconciliationResult identity (future field)

  // Mode — hard-locked at construction; no other value permitted
  applyMode:        "operator_controlled"   // HARD-LOCKED; enforced by PR-186

  // Gate passage flags — all must be true before construction may proceed
  dryRunReviewed:           true   // Gate 4 passed
  uidReconciliationPassed:  true   // Gate 5 passed

  // Reconciliation confidence — must be "high" or "medium"
  confidence:  "high" | "medium"

  // Operator confirmation — false at construction; only Gate 7 sets it true
  operatorConfirmed:  false   // HARD-LOCKED at construction; enforced by PR-186

  // Mutation intent flags — both false at construction; only Gate 7 may change
  liveMutationPlanned:   false   // false until Gate 7 explicitly enables
  backendCommitPlanned:  false   // false until Gate 7 explicitly enables

  // Proposed effects — populated from ReconciliationResult at candidate build time
  // Still empty if UID reconciliation could not resolve position changes
  proposedEffects: {
    unitStatusChanges:   array,  // [{ uid, from, to }]
    unitPositionChanges: array,  // [{ uid, from: [lat,lng], to: [lat,lng] }]
    mapOverlays:         array,  // [] — empty until overlay design is accepted
    timelineNotes:       array   // [{ stepIndex, note }]
  },

  // Hard blocks and review items carried forward from all preceding gates
  blockedReasons:  string[]  // must be [] at construction; enforced by PR-186
  warnings:        string[]  // surfaced to operator before Gate 7
}
```

### Key design decisions

**`operatorConfirmed: false` is the hard-locked construction default.** An
`ApplyCandidate` is always born in the unconfirmed state. Gate 7 is the only path that
may set it to `true`. No function, no option, no flag may pre-confirm it. PR-186
enforces this: `isApplyCandidateSafe` returns `passed: false` for any candidate with
`operatorConfirmed !== false`.

**`liveMutationPlanned: false` and `backendCommitPlanned: false` are both false at
construction.** These are not just defaults — they are the safe state at the point when
the candidate is built from reconciliation output. Only Gate 7 confirmation may change
them, and only if all preceding gates are confirmed still-passing at that moment.
PR-186 enforces both values.

**`applyMode: "operator_controlled"` is the only permitted value.** A candidate with
any other mode string is invalid. PR-186 (`isApplyCandidateSafe`) enforces this check.

**`proposedEffects` is populated from `ReconciliationResult` only.** No direct read
of `window.units` or `window.lines` may occur during candidate construction. The
reconciliation result already carries deep-copied data.

**`blockedReasons` must be an empty array at construction.** A candidate cannot be
built if any preceding gate has outstanding blocked reasons. If blockedReasons is
non-empty, construction must abort. PR-186 enforces this.

---

## 4. Hard Blocks

Live apply must remain permanently blocked if any of the following conditions exist.
There is no override, no force flag, and no operator bypass for any item on this list.

| Condition | Blocked until |
|---|---|
| Any of Gates 1–6 failed or not yet run | All seven gates must pass |
| `reconcileUidReferences().passed === false` | Gate 5 must pass |
| `confidence` is `"low"` or `"blocked"` | Confidence must be `"high"` or `"medium"` |
| `conflicts.length > 0` in reconciliation result | Zero conflicts required |
| Unresolved required units in reconciliation result | All required units must be resolved |
| Side/faction mismatch in any matched unit | No mismatches permitted |
| `validateStagingCandidate().blockedReasons` is non-empty | Must be empty |
| `isOperatorReviewRecordSafe().passed === false` | Gate 3 must pass |
| `reviewRecord.decision !== "approve_dry_run"` | Only `approve_dry_run` proceeds |
| `isDryRunConfirmationSafe().passed === false` | Gate 4 must pass |
| `DryRunConfirmation.liveScenarioChanged !== false` | Hard-locked false |
| `DryRunConfirmation.committed !== false` | Hard-locked false |
| `DryRunConfirmation.blockedFromLiveApply !== true` | Hard-locked true |
| `isApplyCandidateSafe(candidate).passed === false` | Gate 6 must pass (PR-186) |
| `proposedEffects` contain unsafe mutation flags (`applyNow`, `mutateUnits`, etc.) | Unsafe flags must be absent; enforced by PR-186 |
| `backendCommitPlanned` was not explicitly set via Gate 7 | Gate 7 only |
| Gate 7 two-click confirmation has not occurred | Both clicks required |
| AI generated the confirmation without human operator action | AI auto-approval is never permitted |
| Operator identity is `null` at Gate 7 time | Auth context required for Gate 7 |

---

## 5. Future Two-Click Operator Control (Gate 7)

Any future live apply implementation must require a two-step operator confirmation
sequence. Both steps must be explicit human actions. Neither step may be pre-filled,
auto-selected, timed out, or triggered by any automated process.

### Step 1 — Approve dry-run preview

The operator explicitly reviews the `DryRunConfirmation.effectsPreview` and confirms
the preview is correct and complete. This step must:

- Display `effectsPreview` in full — every non-empty array must be shown.
- Display `ReconciliationResult.matchedUnits` with match methods and warnings.
- Display any `warnings` from the reconciliation result.
- Display the locked safety flags: `dryRunReviewed: true`, `committed: false`,
  `liveMutationPlanned: false`.
- Use the label **"Approve dry-run preview"** — not "Apply", not "Commit".

Only after Step 1 is complete may Step 2 be presented.

### Step 2 — Confirm controlled apply

A separate, clearly labelled confirmation action. This step must:

- Present a modal or inline confirmation that explicitly states the scope of the
  apply action: which units change status, which change position, what notes are
  added to the timeline.
- Use a label such as **"Confirm controlled apply"** or **"Apply to live scenario"**
  (the word "Apply" is permitted here and only here — at Gate 7, not before).
- Show a final safety summary: `confidence`, `matchedUnits` count, `warnings` count.
- Require the operator to click a distinct confirm button — not the same button as Step 1.

### Automation prohibition

- No timeout may trigger Step 2 if the operator pauses after Step 1.
- No AI system may complete Step 2 on behalf of the operator.
- No batch process, script, or API call may substitute for either step.
- If the page reloads between Step 1 and Step 2, both steps must be repeated.
- `operatorConfirmed` must never be set by any code path other than the Step 2 handler.

### Required wording at Gate 7

> "This action will apply changes to the live scenario. Units will be updated.
> This cannot be undone without a manual rollback. Confirm?"

Exact wording may vary, but the message must name: what will change, that it affects
the live scenario, and that it requires a deliberate decision.

---

## 6. Forbidden Before a Later Explicitly Approved PR

The following are permanently blocked until a future PR (no earlier than PR-190+)
is explicitly written, reviewed, and accepted. That PR must include a full security
review and must not be merged without sign-off.

| Forbidden action | Blocked until |
|---|---|
| Any `applyToScenario()` or equivalent function | Later explicitly approved PR |
| Any apply button in the UI | Later explicitly approved PR |
| Any commit button in the UI | Later explicitly approved PR |
| Any call to `/api/sim/commit` or `/api/sim/apply` | Later explicitly approved PR |
| Any mutation of `window.units` entries | Later explicitly approved PR |
| Any mutation of `window.lines` entries | Later explicitly approved PR |
| Any mutation of any Leaflet map layer | Later explicitly approved PR |
| Any change to `window.RmoozScenario.stepIndex` | Later explicitly approved PR |
| Setting `committed: true` on any in-memory object | Later explicitly approved PR |
| Setting `liveMutationPlanned: true` without Gate 7 | Later explicitly approved PR |
| Setting `backendCommitPlanned: true` without Gate 7 | Later explicitly approved PR |
| Writing any journal entry for a live apply action | Later explicitly approved PR |
| Persisting any apply-related record to storage | Later explicitly approved PR |
| Exporting or downloading any apply-related record | Not in scope |
| Auto-advancing the scenario step on package import | Never |
| AI-generated apply without explicit operator action | Never |

---

## 7. Recommended Next PRs

### PR-186 — Apply Candidate Type Guard *(implemented)*

- `APPLY_MODE_VALUES` frozen constant: `['operator_controlled']`.
- `isApplyCandidateSafe(candidate)` — returns `{ passed, blockedReasons }`.
- Enforces: `applyMode`, `operatorConfirmed === false`, `liveMutationPlanned === false`,
  `backendCommitPlanned === false`, `dryRunReviewed === true`,
  `uidReconciliationPassed === true`, `confidence` is `"high"` or `"medium"`,
  `blockedReasons` is empty, no unsafe top-level fields,
  `proposedEffects` arrays present with no mutation markers on items.
- No object creation, no UI, no apply path.
- Exposed on `window.AppShellScenarioWorkspace`.

### PR-187 — Apply Candidate Builder
*(pure function only, not wired to UI, no storage)*

- Implement `buildApplyCandidate(proposal, reviewRecord, confirmation, reconciliationResult, options)`.
- Re-runs all six preceding guards (Gates 1–6) before building.
- `operatorConfirmed` is always `false` at construction — Gate 7 sets it true in a
  future PR.
- `liveMutationPlanned` and `backendCommitPlanned` are always `false` at construction.
- Populates `proposedEffects` from `reconciliationResult.matchedUnits` (status changes
  and position changes, if available).
- Calls `isApplyCandidateSafe()` self-check before returning.
- Returns `{ passed, candidate|null, blockedReasons, warnings }`.
- Exposed on public API for console/test only.

### PR-188 — Diagnostics-Only Apply Candidate Preview
*(extends existing Import Diagnostics; no new card outside diagnostics)*

- Wire `buildApplyCandidate()` output into `#sw-dpkg-diagnostics` as a read-only preview.
- Show `applyMode`, `confidence`, `dryRunReviewed`, `uidReconciliationPassed`,
  `proposedEffects` counts, and `warnings` as additional read-only rows.
- No confirmation button, no Gate 7 UI, no apply path.
- Requires PR-187 builder and PR-184 reconciliation.

### PR-189 — Operator Confirmation Design
*(docs-only or minimal UI stub; no live apply)*

- Define the Gate 7 two-click UX flow in detail.
- Define the confirmation modal content and required fields.
- Define how `operatorConfirmed` transitions from `false` to `true`.
- No live mutation. No backend. Gate 7 UI does not apply — it confirms readiness for apply.

### Later — Controlled Apply Implementation
*(only after PR-189 accepted and security review complete)*

- Separate security review required before this PR is written.
- Full implementation proposal must be submitted before any apply logic is added.
- Scope: Gate 7 handler, `window.units` mutation, `window.RmoozScenario.stepIndex`
  increment, Leaflet map layer update, journal write, backend commit bridge.
- This is the only PR that may set `committed: true`.

---

## 8. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-185-controlled-live-apply-boundary.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no `ApplyCandidate` object creation
- [x] Adds no apply function, apply button, or apply path
- [x] Adds no commit button or commit path
- [x] Adds no staging, review, dry-run, or reconciliation storage
- [x] Adds no backend calls or storage writes
- [x] Keeps imported package preview read-only
- [x] Does not modify `app.js` or `adjudicator-map.js`
- [x] Does not mutate `window.units`, `window.lines`, `window.RmoozScenario.stepIndex`,
      the map, or the real scenario
- [x] Does not re-add external scenario catalog UI
- [x] Does not link `scen-catalog-contract.js`
- [x] Import Diagnostics remains collapsed by default (no change to that behavior)
- [x] `committed` remains `false` everywhere in the codebase
- [x] `_swStagingProposal` does not exist and is not created
- [x] `proposedEffects` and `effectsPreview` arrays remain empty until PR-187+ wires
      reconciliation output into them

---

## 9. Files Changed in This PR

**One file only:**

- `docs/pr-185-controlled-live-apply-boundary.md` — this file (new / updated)

All runtime files are unchanged.
