# PR-175 — Operator Review Boundary Design

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-171 (preview-to-staging contract), PR-172 (`STAGING_PROPOSAL_SAFETY` / `isStagingProposalSafe`), PR-173 (`buildStagingProposal`), PR-174 (diagnostics-only proposal preview).  
**Date:** 2026-05-26

---

## 1. Purpose

Operator review is the human decision gate that sits between:

- the **read-only staging proposal preview** (PR-174 — display inside collapsed diagnostics, no storage), and  
- any future **dry-run confirmation** (Gate 3, planned PR-179+).

An operator review decision is a statement of human intent. It is not an apply action. It is not a commit action. It does not mutate live scenario state, map layers, unit records, or any backend resource.

The sole effect of an operator review decision is to advance `operatorReview.decision` from `"pending"` to `"approve_dry_run"`, `"reject"`, or `"hold"` — on an in-memory-only object, never persisted, never exported.

No review decision may trigger a live apply. No review decision may set `committed: true`. No review decision may bypass the remaining gates (Gate 3 dry-run confirmation, Gate 4 commit authorization). The operator review gate is Gate 2 in the four-gate sequence defined in PR-171.

---

## 2. Inputs

Future operator review logic may read the following sources. All are in-memory only and already available at review time with no new I/O.

| Input | Source | Notes |
|---|---|---|
| Staging proposal | Return value of `buildStagingProposal()` | Not stored; must be rebuilt if needed |
| Validation result | `validateStagingCandidate(step)` output | Must still pass at review time |
| Safety check | `isStagingProposalSafe(proposal)` output | Must still pass at review time |
| Active imported step | `getActiveImportedDecisionStep()` | Read-only |
| Source trace | `normalisedStep.source_trace` | Read-only passthrough |
| Package manifest | `_swDecisionPackage.manifest` | Read-only |
| Operator note | Future freetext input field | Optional; in-memory only |
| Operator identity | Future session/auth context | `null` until auth is wired |

No other source may inform a review decision. The operator may not review a proposal derived from `window.units`, `window.lines`, `window.RmoozScenario`, or any storage/network source.

---

## 3. Review Decision Enum

The operator review decision is a single-valued enumeration. Only one decision may be active at a time per proposal. The default is always the safe state (`"pending"`).

```
operatorReview.decision:
  "pending"         — no operator decision yet; initial state; safe default
  "approve_dry_run" — operator approves proceeding to Gate 3 dry-run only
  "reject"          — operator rejects the proposal; no further action
  "hold"            — operator pauses decision pending additional review
```

### Decision semantics

**`"pending"`** — The operator has not yet acted. This is the state in which a newly built proposal arrives. It does not mean the proposal is approved. It does not mean it will be approved. Nothing may advance past Gate 2 while the decision is `"pending"`.

**`"approve_dry_run"`** — The operator has explicitly confirmed that a dry-run summary (Gate 3) may be computed and shown. This is approval for a read-only preview of effects, not for applying those effects. The word "Apply" must never be used for this action anywhere in the UI. `committed` remains `false`. `liveMutationAllowed` remains `false`. The proposal does not advance to a live scenario change at this step.

**`"reject"`** — The operator has explicitly rejected this proposal. The review record is finalized with this decision. No further gate may be reached. The in-memory record is discarded on panel close or page reload.

**`"hold"`** — The operator is not ready to decide. The decision remains paused. No gate advances. The proposal remains in its current state until the operator acts or the session ends.

---

## 4. Required Safety Rules

These rules apply at every point during and after operator review. No review decision, no operator input, and no future PR may relax them before PR-185+ (see §7).

| Safety flag | Required value | Enforced by |
|---|---|---|
| `safety.dryRun` | `true` | `STAGING_PROPOSAL_SAFETY` + `isStagingProposalSafe()` |
| `safety.committed` | `false` | `STAGING_PROPOSAL_SAFETY` + `isStagingProposalSafe()` |
| `safety.liveMutationAllowed` | `false` | `STAGING_PROPOSAL_SAFETY` + `isStagingProposalSafe()` |
| `safety.backendCommitAllowed` | `false` | `STAGING_PROPOSAL_SAFETY` + `isStagingProposalSafe()` |
| `safety.autoApplyAllowed` | `false` | `STAGING_PROPOSAL_SAFETY` + `isStagingProposalSafe()` |

These flags are hard-locked at proposal construction time (PR-172 / PR-173). Operator review does not touch them. No review UI may expose controls that would change these values. The review panel must not even display them as editable.

`proposedEffects` arrays remain empty throughout Gate 2. Unit position changes require UID reconciliation (see PR-167 §5a / PR-171 §4), which is not resolved yet. An empty array is the correct and expected state — it means "no position change can be proposed yet," not "this step has no position changes."

If `isStagingProposalSafe()` returns `passed: false` at any point during review, the review must be blocked immediately. There is no override path.

---

## 5. Future UI Boundary

These requirements govern how operator review must be designed when implemented (planned PR-175+ / PR-179+). They are non-negotiable constraints, not preferences.

### Where review lives

- The review section must live inside the existing Import Diagnostics collapsed panel (`#sw-dpkg-diagnostics`) or a clearly labelled review area that is visually part of the diagnostics workflow.
- Review must not appear as a persistent top-level card outside diagnostics.
- Review must not be visible until the operator has actively opened the diagnostics panel (UX gate from PR-171 §3 precondition 4).

### What the operator must see before acting

The review panel must display all of the following before any decision button is enabled:

1. Read-only proposal snapshot: `situation` summary, `objective`, `selectedDecision` (resolved label), `units`, `affectedUnits`, `actions`, `counterActions`.
2. Validation result: all six check states from `validateStagingCandidate()`. `blockedReasons` must be shown (must be zero). `warnings` must be shown.
3. Safety flags from `isStagingProposalSafe()`.
4. `source_trace` provenance (file name, if available).
5. `proposedEffects` summary (all-zero until UID reconciliation).

No decision control may be presented before these fields are rendered. This is not enforced at runtime in this PR — it is a design constraint for the implementing PR.

### Button labelling rules

- The `"approve_dry_run"` action button must not be labelled "Apply", "Execute", "Commit", "Stage", "Submit", "Send", or any word implying live action.
- Acceptable labels: "Allow dry run", "Proceed to preview", "Confirm review", or equivalent.
- The `"reject"` button must be clearly labelled and must not be a dismissal (×) icon only.
- The `"hold"` button is optional in initial implementation; if present, it must not be the default action.

### Automation prohibition

- No automatic approval. No timeout-based approval. No API-triggered approval.
- AI-generated suggestions must never auto-set `decision` to any non-`"pending"` value without explicit operator interaction.
- The review panel must not pre-select any decision or apply any decision on load.

### Default state on render

- `operatorReview.decision` is always `"pending"` when a proposal is freshly built.
- All decision controls are unchecked / unpressed on initial render.
- Closing the review panel without acting leaves the decision at `"pending"` — no implicit rejection.

---

## 6. Audit Trail Shape

The following in-memory-only record captures what the operator decided and the state of the proposal at review time. This is a future shape definition — it is **not implemented in this PR**. No JS file defines or instantiates this object yet.

```
OperatorReviewRecord {

  // Identity
  proposalId:   string       // matches StagingProposal.id
  reviewedBy:   string|null  // operator identifier; null until auth is wired
  reviewedAt:   string       // Zulu DTG at moment of decision

  // Decision
  decision:     "approve_dry_run" | "reject" | "hold"

  // Freetext (future)
  notes:        string|null  // operator-typed note; null until freetext input exists

  // Snapshots at review time — copies, never live references
  safetySnapshot: {
    dryRun:                boolean,  // must be true
    committed:             boolean,  // must be false
    autoApplyAllowed:      boolean,  // must be false
    liveMutationAllowed:   boolean,  // must be false
    backendCommitAllowed:  boolean   // must be false
  },

  validationSnapshot: {
    passed:         boolean,
    checks:         object,    // { hasStepIdentity, hasSituationContext, ... }
    blockedReasons: string[],  // must be [] at review time
    warnings:       string[]
  }
}
```

### Key design decisions

**`decision` cannot be `"pending"` in a finalized record.** An `OperatorReviewRecord` is only written when the operator takes an explicit action. A proposal in `"pending"` state has no review record yet.

**`safetySnapshot` and `validationSnapshot` are deep copies.** They capture the safety state at the moment of review, not a live reference. If the proposal is somehow mutated after review (a defensive measure), the record still accurately reflects what the operator saw.

**`OperatorReviewRecord` is not a `StagingProposal`.** It is a separate, smaller object. The `StagingProposal.operatorReview` field (defined in PR-171 §4) is populated from this record. They are not the same object.

**Persistence is out of scope.** The record lives in memory only for the duration of the review session. It is not written to `localStorage`, `sessionStorage`, `IndexedDB`, the journal file, any `/api/` endpoint, or any exported download. Journal persistence is planned for PR-185+.

---

## 7. Blocked Behavior Before PR-185+

The following actions are **permanently blocked** until all earlier gates are accepted and a separate full PR proposal is reviewed for PR-185+. No exception, no force flag, no operator override, no hidden escape hatch.

| Blocked action | Blocked until |
|---|---|
| Mutate `window.units` | PR-185+ with Gate 4 passed |
| Mutate `window.lines` | PR-185+ with Gate 4 passed |
| Mutate `window.RmoozScenario.stepIndex` | PR-185+ with Gate 4 passed |
| Mutate any Leaflet map layer | PR-185+ with Gate 4 passed |
| Mutate real scenario state | PR-185+ with Gate 4 passed |
| Call any `/api/sim/*` endpoint | PR-185+ after commit bridge production-ready |
| Auto-advance a scenario step | Never without two-step operator confirmation |
| Set `dryRun: false` | Never before PR-185+ |
| Set `committed: true` | Never before Gate 4 |
| Set `liveMutationAllowed: true` | Never before Gate 4 |
| AI auto-approval of `operatorReview.decision` | Never — requires explicit operator action |
| Bypass `validateStagingCandidate()` | Never |
| Bypass `isStagingProposalSafe()` | Never |
| Persist `OperatorReviewRecord` to any storage | PR-185+ journal path only |
| Export or download `OperatorReviewRecord` | Not in scope |
| Persist `StagingProposal` to any storage | Not in scope |
| Display review controls before diagnostics are open | Never |

---

## 8. Recommended Next PRs

### PR-176 — Operator Review Copy / Message Hardening
*(docs-only or i18n-only)*

- Define the exact EN and AR operator-facing strings for the future review panel.
- Harden the `"approve_dry_run"` label so no future PR accidentally calls it "Apply."
- Add i18n keys as stubs if needed for review-panel placeholders.
- No new UI, no new JS logic, no new HTML cards.

### PR-177 — In-Memory Review Record Type Guard
*(pure JS only, no UI)*

- Define `REVIEW_DECISION_VALUES` enum constant (frozen array).
- Implement `isValidReviewRecord(record)` type guard: returns `{ passed, blockedReasons }`.
- Checks: `decision` is one of the three non-pending values, `safetySnapshot` matches `STAGING_PROPOSAL_SAFETY`, `validationSnapshot.passed === true`, `blockedReasons` is empty, no unsafe fields.
- No object creation, no UI, no apply path.
- Exposed on `window.AppShellScenarioWorkspace` for console/test access only.

### PR-178 — Dry-Run Confirmation Contract
*(docs-only)*

- Define the Gate 3 dry-run confirmation design: what the dry-run computes, what it displays, what the operator must confirm.
- Define `DryRunResult` shape.
- Define what "proposed effects" means when UID reconciliation is solved.
- Define the confirmation action and the transition to Gate 4.
- No code. No UI.

### PR-179+ — Diagnostics-Only Dry-Run Summary Preview
*(extends existing Import Diagnostics only)*

- Wire `buildStagingProposal()` output into a dry-run summary display inside `#sw-dpkg-diagnostics`.
- Display computed `proposedEffects` counts once UID reconciliation is solved.
- No approval UI. No live apply. No commit path.
- Requires PR-177 (type guard) and UID reconciliation work before `unitPositionChanges` can be non-empty.

### PR-185+ — Controlled Live Apply
*(only if all earlier gates accepted; full PR proposal required at that time)*

- Extend commit bridge for staging commit path (distinct from proposal commit path).
- Gate 4 UI: two-click minimum (Stage button + confirmation modal with Apply confirm).
- UID reconciliation must be solved.
- DB / Lua dependency warnings must surface before any apply.
- Separate security review required before merge.

---

## 9. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-175-operator-review-boundary.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no review controls
- [x] Adds no staging storage
- [x] Adds no approval/reject/hold buttons
- [x] Adds no apply path
- [x] Keeps imported package preview read-only
- [x] Does not modify `app.js` or `adjudicator-map.js`
- [x] Does not mutate `window.units`, `window.lines`, `window.RmoozScenario.stepIndex`, the map, or the real scenario
- [x] Makes no backend calls
- [x] Does not re-add external scenario catalog UI
- [x] Does not link `scen-catalog-contract.js`
- [x] Import Diagnostics remains collapsed by default (no change to that behavior)
- [x] `_swStagingProposal` does not exist and is not created

---

## 10. Files Changed in This PR

**One file only:**

- `docs/pr-175-operator-review-boundary.md` — this file (new)

All runtime files are unchanged.
