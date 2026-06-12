# PR-167 — Decision Package Staging Readiness Plan

**Status:** Audit / planning only. No code changes in this PR.  
**Scope:** What it would take to safely transition the current read-only decision-package
preview into a staging workflow in a future PR.  
**Date:** 2026-05-25

---

## 1. Current State After PR-166

The imported decision-package preview is fully read-only. The normalizer in
`scenario-workspace.js` (`normaliseDecisionPackage`) produces a per-step object.
Every step has the following confirmed fields:

| Field | Type | Source |
|---|---|---|
| `step_id` | string | manifest step |
| `step_index` | number | manifest step |
| `situation` | `{ summary_ar, summary_en }` \| null | manifest |
| `safety` | object \| null | manifest |
| `selected_decision` | any \| null | manifest |
| `objective` | `{ coord, name_ar, name_en, id, status }` | manifest |
| `units` | `[{ uid, side, name, role, status, position }]` | steps file |
| `actions` | `[{ uid, side, action, from_step, to_step }]` | steps file |
| `counter_actions` | `[{ uid, side, action, from_step, to_step }]` | steps file |
| `affected_units` | `[{ uid, side, status_change }]` | steps file |
| `result` | `{ summary_ar, summary_en }` | steps file |
| `source_trace` | object \| null | manifest |
| `phase` | string | manifest |
| `time_label` | string | manifest |
| `confidence` | float [0,1] \| null | manifest |
| `options` | array | manifest |
| `risks` | array \| null | manifest |
| `notes` | any \| null | manifest |

All fields are available in memory after import. Nothing is written to disk,
sent to a backend, or applied to the live scenario.

The existing safety enforcement in `normaliseDecisionPackage`:
- **Rejects** any package where `safety.read_only !== true`
- **Rejects** any package where `safety.no_auto_adjudication !== true`

These two checks are the first gate that already exists.

---

## 2. What a Future Staging Proposal Object Should Contain

When staging is eventually implemented (PR-185+), each staging attempt should
produce an explicit proposal object before any mutation occurs. This object
is **never created in this PR** — it is defined here as a planning contract.

```
StagingProposal {
  id:               string       // UUID minted at proposal time
  packageId:        string       // identifier for the imported package
  stepId:           string       // step_id from the normalised step
  stepIndex:        number       // step_index from the normalised step
  proposedAt:       string       // Zulu DTG (e.g. "251918ZMAY26")
  operatorId:       string|null  // ID of the operator who triggered the proposal
  approvalStatus:   'PENDING'|'APPROVED'|'REJECTED'
  approvedBy:       string|null  // operator ID who approved
  approvedAt:       string|null  // Zulu DTG of approval

  validationResults: {
    uidMappingVerified:          bool  // every unit.uid resolves to a live RMOOZ unit
    coordinatesValid:            bool  // objective.coord in-bounds and non-null
    safetyFlagsRespected:        bool  // safety.read_only and no_auto_adjudication checked
    selectedDecisionResolved:    bool  // selected_decision is not a raw opaque ID
    actionsComplete:             bool  // actions[] entries all have enough geometry
    sourceTracePresent:          bool  // source_trace !== null
  }

  blockedReasons:   string[]     // human-readable list; non-empty means BLOCKED
  dryRun:           true         // HARD-LOCKED — never false until PR-185+
  committed:        false        // HARD-LOCKED — never true until operator confirms

  snapshot: {
    // Read-only copy of the normalised step fields at proposal time.
    // Must never be a live reference — always a deep copy.
    step_id, situation, safety, selected_decision, objective,
    units, actions, counter_actions, affected_units, result, source_trace
  }
}
```

The `snapshot` field is critical: staging must operate on a copy of the
normalised step frozen at proposal time, not a live reference that can change
while the operator is reviewing.

---

## 3. What Staging Must Never Do Yet

The following actions are **blocked** in all PRs before PR-185+:

| Action | Blocked until |
|---|---|
| Mutate `window.units` | PR-185+ with explicit operator approval gate |
| Mutate `window.lines` | PR-185+ with explicit operator approval gate |
| Mutate `window.RmoozScenario.stepIndex` | PR-185+ with explicit operator approval gate |
| Mutate the Leaflet map layer | PR-185+ with explicit operator approval gate |
| Mutate the real scenario | PR-185+ with explicit operator approval gate |
| Call any backend `/api/sim/*` endpoint | PR-185+ after commit bridge is production-ready |
| Auto-advance a scenario step | Never without two-step operator confirmation |
| Write to localStorage / IndexedDB | Not in scope for staging |
| Download or export a staged result | Not in scope for staging |
| Auto-apply if `safety === null` | Never — null safety = block |
| Auto-apply if `source_trace === null` | Warn and require explicit override |

---

## 4. Operator-Approval Gates (Future Design)

Any future staging workflow must pass through four gates in order:

**Gate 1 — Validation**  
All six `validationResults` checks pass. `blockedReasons` must be empty.
If any check fails, staging is blocked and the reasons are displayed.
No UI to override blocked validation — operator must resolve the issue.

**Gate 2 — Operator Review**  
A named operator (identified by `operatorId`) explicitly reviews the
`StagingProposal` snapshot fields. The review is a deliberate read, not
an automatic accept. The operator must see the step summary, affected units,
safety flags, and blocked reasons (if any) before proceeding.

**Gate 3 — Dry-Run Confirmation**  
The staging engine runs in dry-run mode (`dryRun: true`). Output is
a preview of what would change — unit positions, status changes, line
mutations — displayed for operator confirmation. No live state is touched.
The operator must confirm the dry-run output before Gate 4.

**Gate 4 — Commit Authorization**  
A separate, explicit commit action (minimum two clicks: "Stage" → confirm
modal → "Apply"). This sets `committed: true` in the proposal and triggers
the actual mutation. Only Gate 4 may set `committed: true`. The commit
bridge (`ai-proposal-commit-bridge.js`) must be extended to handle this
path in a future PR.

---

## 5. Risks Before Staging

### 5a. UID mismatch — HIGH risk

Unit UIDs in the imported package are export-time identifiers. RMOOZ live
units (`window.units`) have their own UIDs assigned at scenario load time.
There is currently **no mapping** between imported package UIDs and live
RMOOZ unit UIDs.

**Required before staging:** A UID reconciliation step that matches
`package unit.uid` to `live unit.uid` by name, side, and role (or a
declared explicit mapping in the package manifest).

### 5b. Coordinate validation — MEDIUM risk

`objective.coord` is `[lng, lat]` from the package. Before any map mutation:
- Coordinates must be non-null
- Must be in-bounds for the active scenario's map extent
- Must be validated as float pairs, not strings

No coordinate validation currently exists in the normalizer.

### 5c. `selected_decision` is opaque — MEDIUM risk

The `selected_decision` field is typed as `any | null`. In practice it may
be a raw decision-point ID string that only makes sense within the package's
own decision schema. It does not currently resolve to a live RMOOZ decision
point object. Before staging, `selected_decision` must be resolved to a
typed decision object with a known structure.

### 5d. Incomplete action geometry — MEDIUM risk

`actions[]` entries contain `uid`, `side`, `action`, `from_step`, `to_step`.
They do **not** contain movement coordinates, waypoints, or target identifiers.
An action without geometry cannot be applied to the map. Staging must
detect and block actions with missing geometry.

### 5e. Safety flag gaps — HIGH risk

If `safety === null` (source_trace missing or package is malformed),
there is no `read_only` or `no_auto_adjudication` flag to enforce.
The normalizer currently rejects packages missing these flags, which is
correct — but any future bypass path (e.g. a "force import" mode) would
silently remove this protection. Any force-import mode must be explicitly
gated and logged.

### 5f. Missing source trace — LOW–MEDIUM risk

`source_trace === null` means the package has no declared origin (no scenario
name, no simulation run ID, no timestamp of generation). Staging without
provenance means there is no audit trail connecting a staged action to a
specific simulation run. This should trigger a warning and require operator
acknowledgment, not a hard block.

---

## 6. What Is Already in Good Shape

| Concern | Status |
|---|---|
| Normalised step shape is complete | ✓ All 18 fields present |
| Safety flag enforcement | ✓ Hard-checked in normalizer |
| Package preview is read-only | ✓ No mutation path exists |
| Journal contract exists | ✓ `journal-contract.js` defines dry-run entry shape |
| Proposal contract exists | ✓ `ai-proposal-contract.js` defines proposal shape |
| Commit bridge exists (dry-run only) | ✓ `ai-proposal-commit-bridge.js` |
| Audit trail contract exists | ✓ `ai-proposal-decision-journal.js` |

The decision-journal and proposal infrastructure from PR-12 / PR-13 / PR-14
is the foundation that the future staging path should extend — not replace.

---

## 7. Recommended Next PR

**PR-168 — Staging Candidate Validator (read-only, no UI)**

Scope:
- Implement a pure JS function `validateStagingCandidate(normalisedStep)`
  in a new file `shell/staging-candidate-validator.js`
- Returns a `StagingValidationResult` object:
  ```
  {
    canStage:     bool,
    blockedReasons: string[],
    checks: {
      uidMappingVerified:       bool,
      coordinatesValid:         bool,
      safetyFlagsRespected:     bool,
      selectedDecisionResolved: bool,
      actionsComplete:          bool,
      sourceTracePresent:       bool
    }
  }
  ```
- No UI. No apply. No mutation. No new visible panel.
- The function is pure: same input always produces same output.
- Can be called from the console or a future staging UI to pre-check a step.
- Does not link to or modify `app.html` until a staging UI is explicitly approved.

Out of scope for PR-168:
- The staging proposal object itself (`StagingProposal`)
- Any apply or commit path
- Any operator-approval UI
- UID reconciliation (document it, don't solve it yet)
- Any backend connection

This keeps PR-168 purely additive, purely read-only, and directly useful for
the Gate 1 validation check defined in this plan.

---

## 8. Files Changed in This PR

**None.** This is an audit-only PR.

- `docs/pr-167-staging-readiness-plan.md` — this file (new)
- All other files are unchanged

The external scenario catalog UI added in PR-167 (prior attempt) was reverted.
`scen-catalog-contract.js` remains on disk but is not linked.
