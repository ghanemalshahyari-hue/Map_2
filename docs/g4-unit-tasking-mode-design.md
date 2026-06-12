# G-4-A Unit Tasking Mode Overlay Design Gate

**Status:** Design gate only. No UI implementation, runtime overlay store, world-state
mutation, scenario mutation, or source-file mutation is introduced by this document.

**Date:** 2026-06-12

**Decision:** G-4 Unit Tasking Mode is a tasking overlay, not live scenario
mutation.

Core rule:

> G-4 may edit tasking intent only, in an auditable overlay, after dry-run diff
> review, with a reversible change log. Step 1/imported evidence remains
> read-only.

## 1. Purpose

G-4 gives the operator a controlled way to refine unit tasking intent after the
document-understanding review, without converting review artifacts into live
scenario state. It is intentionally narrower than Gate 7 controlled live apply in
`docs/pr-189-operator-confirmation-design.md`.

G-4 does not create units, place units, move units, change readiness, change
posture, execute a COA, or write to imported source JSON. It creates approved
tasking overlay entries attached to the current scenario draft/session. World
State may read those entries to render a preview, but the overlay is never part
of the immutable baseline.

## 2. Overlay Source Of Truth

The source of truth for G-4 edits is a separate tasking overlay attached to the
scenario draft/session.

The overlay may be stored in memory first and later persisted as draft/session
metadata, but it must remain separate from:

- imported source JSON
- `brief.operational_brief.proposed_units`
- placement candidates / map anchors
- live scenario units
- world-state baseline objects
- final COA execution state

Suggested top-level shape:

```json
{
  "schema": "rmooz.g4.tasking_overlay.v1",
  "scenario_draft_id": "draft-or-session-id",
  "source_scenario_id": "optional-loaded-scenario-id",
  "created_at": "iso8601",
  "updated_at": "iso8601",
  "status": "draft",
  "entries": [],
  "change_log": []
}
```

The timestamps are overlay metadata only. They must not be used to adjudicate,
simulate, or reorder scenario baseline events.

## 3. Tasking Entry Data Model

Each approved tasking overlay entry represents a per-unit tasking-intent edit.
It does not represent a movement order, assigned objective, readiness delta, or
placement.

```json
{
  "entry_id": "g4-tasking-entry-id",
  "unit_uid": "BLUE-1",
  "side": "BLUE",
  "step_index": 2,
  "phase": "assault",
  "tasking": {
    "action_component": "air",
    "action_what": "Suppress enemy radar coverage",
    "action_why": "Protect the assault force during approach",
    "action_intended_effect": "Reduce enemy detection and engagement windows",
    "action_doctrine_cited": ["uploaded-doctrine-ref-1"]
  },
  "approval": {
    "approved": true,
    "approved_by": "operator",
    "approved_label": "Approve tasking overlay",
    "approved_at": "iso8601"
  },
  "source": {
    "kind": "g4_tasking_overlay",
    "basis": "operator_review",
    "confidence": "operator_approved"
  },
  "supersedes_entry_id": null,
  "reverted_by_change_id": null
}
```

`unit_uid` identifies an existing scenario or draft unit. G-4 must not create a
new unit if the UID cannot be reconciled. An unresolved UID blocks approval for
that entry and remains in the dry-run diff as an error.

## 4. Allowed Mutable Fields

G-4 may write only these fields inside the overlay entry:

| Field | Scope | Notes |
|---|---|---|
| `action_component` | tasking intent | Must map to the existing component vocabulary where possible. Unknown custom labels may display as raw strings, but stay review-marked. |
| `action_what` | tasking intent | Operator-authored or operator-approved text only. |
| `action_why` | tasking intent | Operator-authored or operator-approved text only. |
| `action_intended_effect` | tasking intent | Describes desired effect; does not execute that effect. |
| `action_doctrine_cited` | evidence reference list | References doctrine evidence; does not edit doctrine evidence. |
| `step_index` | tasking record reference | Chooses the step context for this tasking entry only. |
| `phase` | tasking record reference | Mirrors or labels the step context for this tasking entry only. |

The allowed fields match the existing read-only unit-tasking projection in
`UI_MOdified/client/shell/world-state.js`, where `computeUnitTasking()` derives
`ws.derived.unit_tasking` from step actor records without touching engagement,
detection, objective, readiness, supply, or DB fields.

## 5. Forbidden Fields And Behaviors

The following are forbidden in G-4:

- assigned objective as a committed field
- readiness changes
- posture changes
- movement orders
- coordinates or routes
- final unit creation
- final unit placement
- imported source JSON mutation
- `proposed_units` mutation
- placement anchor mutation
- world-state baseline mutation
- live scenario unit mutation
- COA execution or adjudication
- automatic AI apply
- timeout apply
- hidden accept path

The existing objective-link rule is the controlling precedent: unit-objective
relationships in `world-state.js` are inferred from single-objective context,
tasking, or route context and are explicitly never committed as an assigned
objective by this gate.

## 6. Dry-Run Diff Workflow

Every G-4 edit starts as a candidate, not an overlay entry.

Required candidate workflow:

1. Operator selects an existing unit/tasking record.
2. UI builds a `TaskingOverlayCandidate` containing proposed allowed-field edits.
3. Candidate validator rejects any forbidden field or unresolved unit UID.
4. Dry-run diff is generated from current overlay projection plus candidate.
5. Operator sees before/after values for every changed allowed field.
6. Empty changes are labelled as "no changes" and cannot be approved.
7. Diff clearly states: "Overlay preview only - baseline unchanged."

Minimum dry-run diff shape:

```json
{
  "candidate_id": "g4-tasking-candidate-id",
  "unit_uid": "BLUE-1",
  "step_index": 2,
  "phase": "assault",
  "blocked": false,
  "blocked_reasons": [],
  "before": {
    "action_component": "air",
    "action_what": "Original task",
    "action_why": null,
    "action_intended_effect": null,
    "action_doctrine_cited": []
  },
  "after": {
    "action_component": "air",
    "action_what": "Suppress enemy radar coverage",
    "action_why": "Protect the assault force during approach",
    "action_intended_effect": "Reduce enemy detection and engagement windows",
    "action_doctrine_cited": ["uploaded-doctrine-ref-1"]
  },
  "invariants": {
    "overlay_only": true,
    "baseline_mutation": false,
    "live_unit_mutation": false,
    "imported_source_mutation": false,
    "world_state_projection_only": true
  }
}
```

The diff must not include position, route, readiness, posture, objective
assignment, final placement, or final unit creation effects.

## 7. Explicit Approval Workflow

Approval is a deliberate user action after dry-run diff review.

Required approval control label:

```text
Approve tasking overlay
```

Approval requirements:

- The user must see the before/after diff before the approval control is enabled.
- The approval control must be disabled when candidate validation fails.
- The approval handler may write only an overlay entry plus a change-log record.
- The approval handler must not mutate baseline scenario objects.
- The approval handler must not call live apply, movement, placement, readiness,
  posture, COA execution, or world-state transition paths.
- No AI system may click, pre-confirm, auto-approve, or bypass this control.
- No timeout, background job, keyboard shortcut, hidden button, or route may
  approve without the same deliberate user action.

G-4 approval is not Gate 7 live apply. G-4 remains overlay-only even after
approval.

## 8. Append-Only Change Log

Every approved overlay write, single-entry revert, and revert-all action creates
an append-only change-log record.

Suggested change-log record:

```json
{
  "change_id": "g4-change-id",
  "change_type": "approve_overlay_entry",
  "entry_id": "g4-tasking-entry-id",
  "unit_uid": "BLUE-1",
  "step_index": 2,
  "phase": "assault",
  "approved_by": "operator",
  "approved_at": "iso8601",
  "before": {},
  "after": {},
  "diff": [],
  "invariants": {
    "overlay_only": true,
    "baseline_mutation": false,
    "imported_source_mutation": false
  }
}
```

The change log is the audit trail for G-4. It is append-only: existing records
must not be edited to hide prior decisions. Corrections are represented by later
records that supersede or revert earlier records.

## 9. Revert Behavior

Undo removes or supersedes overlay entries. Undo must never mutate imported
source JSON, proposed units, placement anchors, live units, or baseline world
state.

### Revert Single Change

Single-change revert creates a new change-log record:

```json
{
  "change_type": "revert_overlay_entry",
  "reverts_change_id": "g4-change-id",
  "entry_id": "g4-tasking-entry-id",
  "reverted_by": "operator",
  "reverted_at": "iso8601"
}
```

The reverted overlay entry remains in the audit trail but is ignored by overlay
projection. Implementations may mark the entry with `reverted_by_change_id` or
append a superseding tombstone entry.

### Revert All For Current Session/Draft

Revert-all creates one append-only record listing the active entries it
supersedes:

```json
{
  "change_type": "revert_all_overlay_entries",
  "scenario_draft_id": "draft-or-session-id",
  "reverted_entry_ids": ["g4-tasking-entry-id"],
  "reverted_by": "operator",
  "reverted_at": "iso8601"
}
```

Revert-all is scoped to the current scenario draft/session. It must not affect
other drafts, imported sources, journal files, scenario files, or live units.

## 10. Projection And Read-Only Preview Model

World State may read/project the overlay for preview only.

Projection rules:

- Projection input = immutable baseline + active tasking overlay entries.
- Projection output may populate a preview field such as
  `ws.derived.unit_tasking_overlay_preview`.
- Projection must not write back to baseline scenario steps or units.
- Projection must not replace `ws.activity.actors` as source data.
- Projection must distinguish authored/baseline tasking from overlay tasking.
- Projection must label overlay-derived rows as `source.kind:
  "g4_tasking_overlay"`.

The existing `computeUnitTasking()` derivation reads step actor records and
produces `ws.derived.unit_tasking`. G-4 may add a future sibling projection, but
must not silently merge overlay edits into baseline-derived tasking without a
visible overlay/source label.

## 11. Read-Only Surfaces That Stay Read-Only

These remain read-only in G-4:

- proposed units
- placement anchors
- catalog enrichment
- doctrine evidence
- base/status review panels
- readiness/posture
- movement orders
- coordinates/routes
- world-state baseline/projection engine
- imported source JSON
- live scenario units

Doctrine citations may be referenced by `action_doctrine_cited`, but G-4 does
not edit doctrine evidence or satisfy doctrine-upload requirements.

## 12. Required Tests Before Implementation

Future implementation PRs must add tests before enabling G-4 in the UI.

### Schema And Validation Tests

- accepts only the allowed tasking fields
- rejects assigned objective fields
- rejects readiness/posture fields
- rejects movement orders, coordinates, routes, and placement fields
- rejects final unit creation
- rejects proposed-unit and placement-anchor mutations
- rejects imported source JSON mutation attempts
- rejects unresolved `unit_uid`
- preserves `step_index` and `phase` only as tasking-record references

### Dry-Run Diff Tests

- before/after diff includes every changed allowed field
- no-change candidate cannot be approved
- forbidden fields appear as blocked reasons, not diff effects
- diff displays overlay-only invariants
- diff never contains unit position, route, readiness, posture, final placement,
  final unit creation, or baseline mutation effects

### Approval Tests

- approval requires the explicit `Approve tasking overlay` control
- approval is blocked until the user has seen the dry-run diff
- approval writes only overlay entry plus change-log record
- no AI auto-apply path exists
- no timeout apply path exists
- no hidden accept path exists
- baseline scenario object is unchanged before and after approval

### Undo Tests

- revert single change supersedes/removes only that overlay entry from projection
- revert all clears active overlay projection for the current draft/session
- undo appends change-log records rather than editing prior audit records
- undo never mutates imported source JSON, proposed units, placement anchors,
  live units, or world-state baseline

### Projection Tests

- world-state preview can read active overlay entries
- overlay preview is labelled separately from baseline-derived tasking
- projection does not mutate `ws.activity.actors`
- projection does not mutate scenario steps or unit arrays
- `ws.derived.unit_tasking` baseline behavior remains unchanged
- objective links remain inferred and are not converted into assigned objectives

### Integration Regression Tests

- Step 1 imported evidence remains read-only
- base/status panels remain read-only
- placement-candidate panel remains read-only
- proposed-unit list remains unchanged after overlay approval
- catalog enrichment remains display-only
- doctrine evidence remains display-only
- live scenario unit count and positions remain unchanged

## 13. Non-Goals

G-4-A does not implement:

- UI editor
- runtime overlay store
- persistence endpoint
- live apply
- tasking overlay projection code
- schema module
- database table
- migration
- movement/placement/readiness/posture mutation

Those require separate implementation gates after this design contract is
accepted.

