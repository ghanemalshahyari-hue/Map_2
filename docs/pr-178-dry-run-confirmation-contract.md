# PR-178 — Dry-Run Confirmation Contract

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-171 (preview-to-staging contract), PR-175 (operator review boundary),
PR-176 (copy hardening), PR-177 (`isOperatorReviewRecordSafe`).  
**Date:** 2026-05-26

---

## 1. Purpose

Gate 3 — Dry-Run Confirmation — is the step that converts an operator-reviewed staging
proposal into a **preview-only effects summary**. It computes what *would* change if the
proposal were applied to the live scenario, and presents that summary to the operator
for inspection before any live action is considered.

Gate 3 is not live apply. Gate 3 is not commit.

The output of Gate 3 is a `DryRunConfirmation` object whose `liveScenarioChanged` field
is hard-locked to `false`. Nothing in the real scenario, map, unit list, or line list
is touched. The operator sees a read-only preview of hypothetical effects — nothing more.

Gate 3 may only be entered after Gate 2 (operator review) has completed with
`operatorReview.decision === "approve_dry_run"`. It may not be skipped. It may not
be triggered automatically. The operator must explicitly confirm the dry-run summary
before Gate 4 (controlled live apply, PR-185+) can be considered.

Gate 3 position in the four-gate sequence (PR-171 §6):

```
Gate 1  Validation          validateStagingCandidate() passes        exists (PR-168/169)
Gate 2  Operator review     operatorReview.decision = approve_dry_run documented (PR-175/177)
Gate 3  Dry-run confirm     DryRunConfirmation computed, shown        this document (PR-178)
Gate 4  Commit auth         committed: true, live apply              PR-185+ only
```

---

## 2. Preconditions

A `DryRunConfirmation` may only be computed if **all** of the following are simultaneously
true at computation time. Any failing precondition is a hard block — there is no override.

| # | Precondition | Enforced by |
|---|---|---|
| 1 | `isStagingProposalSafe(proposal).passed === true` | PR-172 guard |
| 2 | `isOperatorReviewRecordSafe(reviewRecord).passed === true` | PR-177 guard |
| 3 | `reviewRecord.decision === "approve_dry_run"` | explicit check |
| 4 | `proposal.safety.dryRun === true` | `STAGING_PROPOSAL_SAFETY` |
| 5 | `proposal.safety.committed === false` | `STAGING_PROPOSAL_SAFETY` |
| 6 | `proposal.safety.liveMutationAllowed === false` | `STAGING_PROPOSAL_SAFETY` |
| 7 | `proposal.safety.backendCommitAllowed === false` | `STAGING_PROPOSAL_SAFETY` |
| 8 | `validateStagingCandidate(step).passed === true` at computation time | PR-168 |
| 9 | No existing uncommitted `DryRunConfirmation` for the same `proposalId` in memory | uniqueness check |

Precondition 3 is particularly strict: `"pending"`, `"reject"`, and `"hold"` are all
explicitly blocked. Only `"approve_dry_run"` may pass Gate 3. Precondition 8 re-runs
the validation live — a step that was valid at Gate 1 but whose loaded package has since
changed must not silently pass Gate 3.

---

## 3. Future `DryRunConfirmation` Shape

The object is defined here as a documentation contract only. It is **not created in
this PR**. No JS file defines or instantiates this object yet.

```
DryRunConfirmation {

  // Identity
  proposalId:   string       // matches StagingProposal.id
  confirmedBy:  string|null  // operator identifier; null until auth is wired
  confirmedAt:  string       // Zulu DTG at confirmation time

  // Mode — hard-locked at construction; never "live" before Gate 4
  mode:                 "dry_run_only"   // HARD-LOCKED — no other value permitted
  liveScenarioChanged:  false            // HARD-LOCKED — never true at Gate 3
  committed:            false            // HARD-LOCKED — never true before Gate 4

  // Effects preview — computed from proposal.snapshot only
  // All arrays are populated only when UID reconciliation is solved (PR-167 §5a)
  // Until then they remain empty — empty is the correct, safe default
  effectsPreview: {
    unitStatusChanges:   array,  // [{ uid, from, to }]  — empty until UID reconciliation
    unitPositionChanges: array,  // [{ uid, from: [lng,lat], to: [lng,lat] }]  — empty until UID reconciliation
    mapOverlays:         array,  // []  — empty until map mutation is designed
    timelineNotes:       array   // [{ stepIndex, note }]  — for future audit display
  },

  // Hard safety flag — signals to any downstream consumer that Gate 4 is
  // the only path to live apply, and that no auto-apply may occur here
  blockedFromLiveApply: true     // HARD-LOCKED — never false at Gate 3

  // Operator note (future)
  notes:        string|null  // operator freetext added during dry-run review; null for now
}
```

### Key design decisions

**`mode: "dry_run_only"` is the only permitted value before PR-185+.** A future
implementation must reject any attempt to set `mode` to anything else. If `mode` is
absent or is a different string, the confirmation is invalid and must not proceed.

**`liveScenarioChanged: false` is a hard-locked invariant, not a default.** Any
implementation that produces a `DryRunConfirmation` with `liveScenarioChanged: true`
has introduced a bug. The type guard planned in PR-179 will enforce this.

**`effectsPreview` arrays remain empty until UID reconciliation is solved.** The
`proposedEffects` in the staging proposal are already empty (PR-173) because package
UIDs cannot yet be mapped to live RMOOZ unit UIDs. `DryRunConfirmation.effectsPreview`
inherits the same limitation. An empty array means "cannot compute yet" — not "no
effects exist." This must be surfaced to the operator as an explicit note, not silently
suppressed.

**`DryRunConfirmation` is computed from `proposal.snapshot` only.** It must never
read `window.units`, `window.lines`, `window.RmoozScenario`, or any Leaflet map layer
to compute its `effectsPreview`. Reading live scenario state during a dry run would
introduce a side-channel dependency that could mask the fact that live state was not
mutated.

**`DryRunConfirmation` is in-memory only.** Like `StagingProposal` and
`OperatorReviewRecord`, it is not written to any storage. It exists for the duration
of the operator's confirmation session and is discarded on rejection, page reload, or
session end. Journal persistence is planned for PR-185+.

---

## 4. Forbidden Behavior at Gate 3

The following are permanently blocked during and after dry-run confirmation, before
PR-185+ and Gate 4.

| Blocked action | Blocked until |
|---|---|
| Mutate `window.units` | PR-185+ Gate 4 |
| Mutate `window.lines` | PR-185+ Gate 4 |
| Mutate `window.RmoozScenario.stepIndex` | PR-185+ Gate 4 |
| Mutate any Leaflet map layer | PR-185+ Gate 4 |
| Mutate real scenario state | PR-185+ Gate 4 |
| Call any `/api/sim/*` endpoint | PR-185+ after commit bridge is production-ready |
| Set `liveScenarioChanged: true` | Never at Gate 3 |
| Set `committed: true` | Never before Gate 4 |
| Set `mode` to anything other than `"dry_run_only"` | Never before PR-185+ |
| Set `blockedFromLiveApply: false` | Never at Gate 3 |
| Auto-advance scenario step | Never without Gate 4 two-step confirmation |
| Auto-confirm dry run without operator action | Never |
| Populate `effectsPreview` from live scenario state | Never — snapshot only |
| Persist `DryRunConfirmation` to localStorage/sessionStorage/IndexedDB | Not in scope |
| Export or download `DryRunConfirmation` | Not in scope |
| Persist to journal file | PR-185+ journal path only |
| Skip Gate 2 (`approve_dry_run`) and enter Gate 3 directly | Never |
| Re-enter Gate 3 after Gate 2 `reject` or `hold` | Never without a new Gate 2 cycle |

---

## 5. Future UI Copy Rules

These rules extend PR-176 (copy hardening) specifically for the Gate 3 confirmation
step. Any future PR implementing Gate 3 UI must comply with all of the following.

### Required label for the primary confirmation action

```
"Confirm dry-run preview"
```

Acceptable alternatives (space-constrained contexts only):

```
"Confirm preview"
"Proceed to dry-run"
"Accept dry-run summary"
```

### Forbidden labels at Gate 3

These must never appear on any Gate 3 button, tooltip, badge, confirmation message,
status field, or i18n key value:

```
Apply               Commit              Execute
Run live            Save                OK
Yes                 Confirm and apply   Accept and apply
Stage               Push                Submit
Update scenario     Go live
```

### Required contextual disclosure (must be visible without hover)

> "This confirms a dry-run preview only. No changes are made to the live scenario,
> map, or units. The committed flag remains false."

### Required status display

When a `DryRunConfirmation` is shown to the operator, the following read-only fields
must be visible:

- `mode` — displayed as "Dry-run only"
- `liveScenarioChanged` — displayed as "No"
- `committed` — displayed as "No"
- `blockedFromLiveApply` — displayed as "Yes" (blocked)
- `effectsPreview` counts — each array length; must note "UID reconciliation pending"
  if all arrays are empty

### i18n key naming convention (future)

```
sw-dryrun-confirm               → "Confirm dry-run preview"
sw-dryrun-proceed               → "Proceed to dry-run"
sw-dryrun-badge-mode            → "Dry-run only"
sw-dryrun-badge-no-live         → "Live changes: No"
sw-dryrun-badge-committed       → "Committed: No"
sw-dryrun-badge-blocked         → "Live apply: Blocked"
sw-dryrun-effects-pending       → "UID reconciliation pending — effects not yet computed"
sw-dryrun-disclosure            → "This confirms a dry-run preview only. No changes are made to the live scenario, map, or units."
sw-dryrun-status-confirmed      → "Dry-run confirmed"
sw-dryrun-status-pending        → "Awaiting dry-run confirmation"
```

Keys must not contain the strings `apply`, `commit`, `execute`, `live-change`, or `run`
in a context that implies live action.

---

## 6. AR (Arabic) Required Equivalents

| EN label | AR equivalent |
|---|---|
| `Confirm dry-run preview` | `تأكيد معاينة التشغيل التجريبي` |
| `Proceed to dry-run` | `المتابعة إلى التشغيل التجريبي` |
| `Dry-run only` | `تشغيل تجريبي فقط` |
| `Live changes: No` | `التغييرات الحية: لا` |
| `Committed: No` | `مُلتزم به: لا` |
| `Live apply: Blocked` | `التطبيق الحي: محجوب` |
| `UID reconciliation pending` | `تسوية المعرّفات معلّقة` |

**Arabic disclosure (required):**
> `يؤكد هذا الإجراء معاينة التشغيل التجريبي فقط. لا يتم إجراء أي تغييرات على السيناريو الحي أو الخريطة أو الوحدات.`

---

## 7. Relationship to Other Gates and Objects

```
StagingProposal (PR-173)
    │  buildStagingProposal() → status: "draft"
    │  isStagingProposalSafe() must pass
    ▼
OperatorReviewRecord (PR-175/177)
    │  isOperatorReviewRecordSafe() must pass
    │  decision must be "approve_dry_run"
    ▼
DryRunConfirmation  ◄─── THIS DOCUMENT
    │  mode: "dry_run_only"
    │  liveScenarioChanged: false  (HARD-LOCKED)
    │  committed: false            (HARD-LOCKED)
    │  blockedFromLiveApply: true  (HARD-LOCKED)
    │  effectsPreview: all arrays  (empty until UID reconciliation)
    ▼
Gate 4 — Commit Authorization  (PR-185+ only)
    committed: true — only here, never before
```

No object in this chain may skip a predecessor. Each object is in-memory only until
PR-185+ defines the journal persistence path.

---

## 8. Recommended Next PRs

### PR-179 — Dry-Run Confirmation Type Guard
*(pure JS only, no UI, no storage)*

- Define `DRY_RUN_CONFIRMATION_MODE` constant: `'dry_run_only'` (frozen string).
- Implement `isDryRunConfirmationSafe(confirmation)` type guard.
  Returns `{ passed, blockedReasons }`.
- Checks: `mode === 'dry_run_only'`, `liveScenarioChanged === false`,
  `committed === false`, `blockedFromLiveApply === true`, no unsafe fields,
  `effectsPreview` arrays are arrays (not objects with live refs).
- No object creation, no UI, no apply path.
- Exposed on `window.AppShellScenarioWorkspace` for console/test access only.
- File: `scenario-workspace.js` only.

### PR-180 — Dry-Run Confirmation Builder
*(pure function, not wired to UI)*

- Implement `buildDryRunConfirmation(proposal, reviewRecord, options)`.
- Verifies all preconditions (§2) before building.
- Returns `{ passed, confirmation|null, blockedReasons }`.
- Calls `isDryRunConfirmationSafe()` self-check before returning.
- `effectsPreview` arrays remain empty (UID reconciliation not yet solved).
- Exposed on public API for console/test access only.

### PR-181+ — Diagnostics-Only Dry-Run Summary Display
*(extends existing Import Diagnostics; no new card outside diagnostics)*

- Wire `buildDryRunConfirmation()` output into `#sw-dpkg-diagnostics`.
- Show `mode`, `liveScenarioChanged`, `committed`, `blockedFromLiveApply`, and
  `effectsPreview` counts as additional read-only rows.
- No confirmation button, no approval UI.
- Requires PR-180 builder.

### PR-185+ — Controlled Live Apply
*(only if all earlier gates are accepted; full PR proposal required at that time)*

- Gate 4 UI: two-click minimum.
- `committed` first becomes `true` here — nowhere else.
- UID reconciliation must be solved before position changes can be applied.
- Separate security review required before merge.

---

## 9. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-178-dry-run-confirmation-contract.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no `DryRunConfirmation` object creation
- [x] Adds no review controls or confirmation buttons
- [x] Adds no staging storage or review record storage
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

---

## 10. Files Changed in This PR

**One file only:**

- `docs/pr-178-dry-run-confirmation-contract.md` — this file (new)

All runtime files are unchanged.
