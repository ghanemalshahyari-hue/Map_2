# PR-171 — Preview-to-Staging Contract Design

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-166 (normalised passthrough fields), PR-167 (staging readiness plan),
PR-168 (`validateStagingCandidate`), PR-169 (diagnostics row), PR-170 (message clarity).  
**Date:** 2026-05-25

---

## 1. Purpose

A **staging proposal** is a temporary, in-memory object generated from a validated
imported decision-package step. It represents a candidate for a future operator-approved
action — nothing more.

A staging proposal is **not** a live scenario change. It does not advance the scenario,
move units, alter the map, or write to any backend. It exists only in memory for the
duration of an operator review session and is discarded when rejected, cleared, or when
the page reloads.

The Preview-to-Staging path is the controlled channel through which a read-only imported
step may eventually inform a live adjudication decision. Every step on this path requires
explicit operator action and a passing gate check. No step may be skipped.

---

## 2. Inputs

A staging proposal may only be constructed from the following sources, all of which must
already be in memory at proposal time:

| Input | Source | Required |
|---|---|---|
| Active normalised step | `getActiveImportedDecisionStep()` output | Yes |
| Validation result | `validateStagingCandidate(normalisedStep)` output | Yes |
| Package manifest | `_swDecisionPackage.manifest` | Yes |
| `source_trace` | `normalisedStep.source_trace` | Recommended (warn if absent) |
| Operator identity | Future — from session/auth context | Optional placeholder |

No other source may be used. In particular:
- The proposal may not be constructed from `window.units` or `window.lines`
- The proposal may not be constructed from `window.RmoozScenario` directly
- The proposal may not import from disk, network, or any storage API

---

## 3. Required Preconditions

A staging proposal may only be created if **all** of the following are true:

1. `validateStagingCandidate(step).passed === true`  
   (zero `blockedReasons` — all hard checks have passed)

2. The step's `safety` object does not permit auto-apply:  
   `safety.auto_apply !== true`  
   `safety.allow_commit !== true`  
   `safety.read_only !== false`  
   `safety.no_auto_adjudication !== false`

3. The proposal is created with `dryRun: true` and `committed: false` — both are
   hard-locked and may never be overridden at construction time.

4. The operator has not bypassed the diagnostics gate. The staging readiness card
   in Import Diagnostics must have been shown (the panel opened) before a proposal
   may be considered. This is a UX gate, not a runtime enforcement — it ensures the
   operator has seen the check results.

5. No existing uncommitted proposal for the same `stepId` is in memory. One active
   proposal per step at a time.

If any precondition is not met, proposal construction is blocked and the reason is
surfaced to the operator. There is no force-create path.

---

## 4. Future `StagingProposal` Shape

The object is defined here as a documentation contract only. It is **not created in
this PR**. No JS file defines or instantiates this object yet.

```
StagingProposal {

  // Identity
  id:            string       // UUID minted at proposal creation time
  packageId:     string       // manifest.name or manifest.package_id
  packageName:   string       // human-readable manifest name
  stepId:        string       // normalised step.step_id
  stepIndex:     number       // normalised step.step_index
  createdAt:     string       // Zulu DTG at proposal creation time
  createdBy:     string|null  // operator identifier; null until auth is wired

  // Lifecycle status
  status: "draft"
        | "ready_for_review"
        | "blocked"
        | "approved_dry_run"
        | "rejected"

  // Validation result — copied from validateStagingCandidate() at creation time
  validation: {
    passed:         boolean,
    checks:         object,    // { hasStepIdentity, hasSituationContext, ... }
    blockedReasons: string[],
    warnings:       string[]
  },

  // Safety invariants — all hard-locked at construction; never mutated after
  safety: {
    dryRun:                true,   // HARD-LOCKED — never false before PR-185+
    committed:             false,  // HARD-LOCKED — never true without Gate 4
    autoApplyAllowed:      false,  // HARD-LOCKED
    liveMutationAllowed:   false,  // HARD-LOCKED — no window.units/lines/map
    backendCommitAllowed:  false   // HARD-LOCKED — no /api/sim/* before PR-185+
  },

  // Provenance
  source: {
    sourceFile:   string|null,  // source_trace.source_file
    sourceTrace:  object|null   // full source_trace passthrough (read-only copy)
  },

  // Read-only snapshot of the normalised step at proposal creation time.
  // Always a deep copy — never a live reference to the normalised step.
  snapshot: {
    situation:        object|null,          // { summary_ar, summary_en }
    objective:        object|null,          // { coord, name_ar, name_en, status, id }
    selectedDecision: object|string|null,   // resolved option object preferred; raw ID fallback
    units:            array,                // normalised units[]
    affectedUnits:    array,                // normalised affected_units[]
    actions:          array,                // normalised actions[]
    counterActions:   array,                // normalised counter_actions[]
    result:           object|null           // { summary_ar, summary_en }
  },

  // Proposed effects — dry-run preview of what staging would do.
  // Computed from snapshot at proposal time; never applied until Gate 4.
  proposedEffects: {
    unitStatusChanges:   array,   // [{ uid, from, to }]
    unitPositionChanges: array,   // [{ uid, from: [lng,lat], to: [lng,lat] }] — empty until UID reconciliation
    mapOverlays:         array,   // [] — empty until map mutation is designed
    timelineNotes:       array    // [{ stepIndex, note }] — for future audit display
  },

  // Operator review state — populated only when Gate 2 is reached
  operatorReview: {
    reviewedBy:  string|null,                                          // operator identifier
    reviewedAt:  string|null,                                          // Zulu DTG of review action
    decision:    "pending" | "approve_dry_run" | "reject" | "hold",
    notes:       string|null                                           // operator freetext (future)
  }
}
```

### Key design decisions

**`snapshot` is a deep copy, not a reference.** The normalised step may be replaced
if the operator loads a different package. The proposal must remain stable regardless.

**`proposedEffects.unitPositionChanges` is empty until UID reconciliation is solved.**
Position changes require mapping package UIDs to live RMOOZ unit UIDs (see PR-167 §5a).
An empty array is the correct default — it signals "no position change can be proposed
yet," not "this step has no position changes."

**`status` drives the UI lifecycle.** Only `"approved_dry_run"` may proceed to Gate 3.
Only Gate 4 may set `committed: true`, and only in PR-185+. `"draft"` and
`"ready_for_review"` are pre-approval states. `"blocked"` means `validation.passed`
is false and the proposal cannot advance.

**`operatorReview.decision = "pending"` is the initial state** — not "approved."
The default is the safe state. Approval requires an explicit operator action.

---

## 5. Explicitly Blocked Behavior

The following actions are **permanently blocked before PR-185+**. No exception,
no force flag, no operator override:

| Action | Blocked until |
|---|---|
| Mutate `window.units` | PR-185+ with Gate 4 passed |
| Mutate `window.lines` | PR-185+ with Gate 4 passed |
| Mutate `window.RmoozScenario.stepIndex` | PR-185+ with Gate 4 passed |
| Mutate any Leaflet map layer | PR-185+ with Gate 4 passed |
| Mutate the real scenario state | PR-185+ with Gate 4 passed |
| Call any `/api/sim/*` endpoint | PR-185+ after commit bridge is production-ready |
| Auto-advance a scenario step | Never without two-step operator confirmation |
| Set `dryRun: false` | Never before PR-185+ |
| Set `committed: true` | Never before Gate 4 |
| Auto-apply if `safety === null` | Never — null safety = block |
| Export or download a staging proposal | Not in scope |
| Persist a staging proposal to localStorage/IndexedDB | Not in scope |
| Persist a staging proposal to the journal file | Only in PR-185+ journal path |

---

## 6. Future Operator Gates

The staging path requires four gates in sequence. No gate may be skipped.
Currently only Gate 1 has partial infrastructure.

### Gate 1 — Validation (exists: PR-168 + PR-169)

`validateStagingCandidate(normalisedStep).passed === true`

All six checks pass. `blockedReasons` is empty. The operator has seen the
Import Diagnostics staging readiness row (UX gate). Hard-blocked steps cannot
proceed past Gate 1. No UI to override.

**Current state:** Validation function exists (PR-168). Readiness display exists (PR-169).
No proposal object is created yet.

### Gate 2 — Operator Review (future: PR-175)

A named operator explicitly views the `StagingProposal.snapshot` fields and sets
`operatorReview.decision` to `"approve_dry_run"` or `"reject"`.

The review is a deliberate read-then-act, not an auto-accept. The operator must see:
- Step identity and situation summary
- Safety flags
- Selected decision (resolved label, not raw ID)
- Affected units and proposed actions
- Blocked reasons (must be zero) and review warnings

**Current state:** Not implemented. Requires a dedicated review panel (not part of the
existing Import Diagnostics card).

### Gate 3 — Dry-Run Confirmation (future: PR-178+)

The staging engine executes a dry run (`dryRun: true`). Output is a human-readable
preview of `proposedEffects` — what unit statuses and positions *would* change.
The operator must confirm the dry-run output before Gate 4.

No live state is touched during dry run. The preview is computed from `snapshot` only.

**Current state:** Not implemented. Requires UID reconciliation (PR-167 §5a) before
`proposedEffects.unitPositionChanges` can be populated.

### Gate 4 — Commit Authorization (future: PR-185+)

A separate, explicit commit action — minimum two clicks: a "Stage" button followed
by a confirmation modal with an "Apply" confirm button. Only Gate 4 sets
`committed: true`. Only Gate 4 triggers any live state mutation.

The commit bridge (`ai-proposal-commit-bridge.js`) must be extended in a future PR
to handle the staging commit path as a distinct action from the proposal commit path.

**Current state:** Not implemented. Hard-locked out until all earlier gates are accepted
and reviewed.

---

## 7. Recommended Future PR Sequence

### PR-172 — Staging Proposal Shape Constants / Type Guard
*(pure JS, no UI, no object creation)*

- Define `STAGING_PROPOSAL_SAFETY` as a frozen constants object with all five
  safety flags hard-set: `{ dryRun: true, committed: false, autoApplyAllowed: false,
  liveMutationAllowed: false, backendCommitAllowed: false }`
- Define `STAGING_PROPOSAL_STATUS` enum: `['draft', 'ready_for_review', 'blocked',
  'approved_dry_run', 'rejected']`
- Define `isStagingProposalSafe(proposal)` type guard: returns `true` only if all
  five safety flags match their hard-locked values
- No object creation, no UI, no apply path
- File: `shell/staging-proposal-contract.js` — not linked from `app.html`

### PR-173 — Staging Proposal Builder (dry-run function only)
*(pure function, not wired to UI)*

- Implement `buildStagingProposal(normalisedStep, manifest, validationResult)`
- Returns a `StagingProposal` with `status: "draft"` and all safety flags locked
- Calls `isStagingProposalSafe()` on its own output before returning — throws if
  the invariant is broken
- `proposedEffects` returns empty arrays (UID reconciliation not yet done)
- Not called from any UI path; exposed on `window.AppShellScenarioWorkspace` for
  console/test access only
- No `app.html` changes

### PR-174 — Diagnostics-Only Staging Proposal Preview
*(extends existing Import Diagnostics; no new card outside diagnostics)*

- Wire `buildStagingProposal()` into the existing `#sw-diag-staging-card`
- Show the proposal `id`, `status`, `createdAt`, and `snapshot.situation` summary
  as additional read-only rows inside the card
- No apply button, no approval UI
- `operatorReview.decision` stays `"pending"` — display only
- Diagnostics remain collapsed by default

### PR-175+ — Operator Review Design
*(new read-only review panel; still no live apply)*

- Define the operator review panel layout
- Wire `operatorReview.decision` UI (approve/reject/hold) — but `committed` stays
  `false` and no mutation occurs
- Operator approval at this stage means "approved for dry run," not "apply to live"
- Requires auth/identity context to populate `reviewedBy`

### PR-185+ — Controlled Live Apply
*(only if all earlier gates are accepted; full PR proposal required at that time)*

- Extend commit bridge for staging commit path
- Gate 4 UI: two-click minimum
- UID reconciliation must be solved before unit position changes can be applied
- DB / Lua dependency warnings must be surfaced before any apply
- Separate security review required

---

## 8. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-171-preview-to-staging-contract.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no staging object
- [x] Adds no apply path
- [x] Keeps the imported package preview read-only
- [x] Does not modify `app.js` or `adjudicator-map.js`
- [x] Does not mutate `window.units`, `window.lines`, `window.RmoozScenario.stepIndex`,
      the map, or the real scenario
- [x] Makes no backend calls
- [x] Does not re-add external scenario catalog UI
- [x] Does not link `scen-catalog-contract.js`
- [x] Import Diagnostics remains collapsed by default (no change to that behavior)

---

## 9. Files Changed in This PR

**One file only:**

- `docs/pr-171-preview-to-staging-contract.md` — this file (new)

All runtime files are unchanged.
