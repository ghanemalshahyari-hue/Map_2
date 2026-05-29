# PR-232 — Wargame 3 Preview Review Checklist UI Contract

**Date:** 2026-05-26  
**Status:** Delivered  
**Type:** Documentation-only — no runtime changes  
**Scope:** `docs/` only

---

## 1. Executive Summary

This document defines the UI contract for a future **read-only operator review
checklist** to be embedded inside the Wargame 3 (`#sw-drp-section`) dry-run preview
panel.

The checklist is a display surface only. It does not implement checkboxes, approval
controls, confirmation flows, or any mutation of simulation state. Its sole purpose is
to present a structured, per-step validation summary so an operator can verify that the
W3 preview data is sound before any downstream use.

**What this PR delivers:**

- Full catalog of 31 checklist items across 8 groups, each with a formal item model
- Element placement contract (`#sw-drp-checklist` container, positioning rules)
- Status display rules for all four states: `pass`, `warning`, `blocked`, `pending`
- Warning display rules and threshold logic
- Operator review state definitions (session-local only, never persisted)
- Hard blocker list — items that, when `blocked`, must stop all downstream use
- Non-blocking expected gaps list — items that are always `pending` or `warning` in W3
- Accessibility and Arabic/English bilingual layout requirements
- Safety boundary invariants that no implementation may violate

**What this PR does not deliver:** working UI, interactive checkboxes, operator
approval, persistence, or any change to runtime files.

---

## 2. Why a Checklist Is Needed

The W3 dry-run preview panel (`#sw-drp-section`) currently renders step content but
provides no structured mechanism for an operator to verify that:

- all 17 steps are structurally intact
- the objective status sequence is coherent
- all unit UIDs are resolved
- warning states are within expected bounds
- the safety boundary (no live mutation) is demonstrably intact

PR-231 defined the operator review process as prose. This PR converts that prose into
a formal data contract that a future component can render and, eventually, allow an
operator to mark step-by-step.

**The checklist does not replace judgment.** It provides a consistent, auditable
scaffold so operators do not miss structural checks when reviewing 17 steps under time
pressure.

---

## 3. Where the Checklist Would Appear

### 3.1 Container element

The checklist lives in a new container placed **inside `#sw-drp-section`**,
immediately after `<p id="sw-drp-nav-hint">` and before the closing tag of
`#sw-drp-section`:

```html
<!-- PR-232 / PR-233+: W3 Review Checklist — display-only.
     Hidden by default; shown when W3 mode is active.
     No interactive checkboxes in first implementation.
     No apply / commit / confirm. No storage. No mutation. -->
<div id="sw-drp-checklist" class="sw-drp-checklist" hidden
     aria-label="W3 preview review checklist — read only"
     data-live-mutation-allowed="false"
     data-read-only="true">
</div>
```

The `data-live-mutation-allowed="false"` and `data-read-only="true"` attributes are
declarative annotations for future tooling and audit — they carry no runtime logic.

### 3.2 Visibility

`#sw-drp-checklist` follows the same show/hide trigger as `#sw-drp-nav`:

- **Hidden** when `_drpPreviewMode !== 'wargame3'` (AMBER RIDGE default)
- **Visible** when `paintWargame3Preview()` is called and W3 mode is active

The existing `_updateDrpNavButtons()` function would be extended in a future PR to
also manage `checklist.hidden`.

### 3.3 Layout within the panel

```
#sw-drp-section
  ├─ .sw-drp-badge                    (label: "Scenario Dry-Run Preview")
  ├─ #sw-drp-w3-context               (W3 context bar)
  ├─ dl.sw-kv (readiness grid)        (fixture, step, title, situation, …)
  ├─ #sw-drp-nav                      (prev/next buttons)
  ├─ #sw-drp-nav-hint                 (isolation hint)
  └─ #sw-drp-checklist        ← NEW   (this contract; future component)
       ├─ .sw-drp-chk-summary         (collapsed summary bar)
       └─ .sw-drp-chk-groups          (expandable group list)
            ├─ .sw-drp-chk-group[data-group="source-integrity"]
            ├─ .sw-drp-chk-group[data-group="step-structure"]
            ├─ .sw-drp-chk-group[data-group="objective-status"]
            ├─ .sw-drp-chk-group[data-group="units-and-effects"]
            ├─ .sw-drp-chk-group[data-group="warnings"]
            ├─ .sw-drp-chk-group[data-group="decision-result"]
            ├─ .sw-drp-chk-group[data-group="navigation-isolation"]
            └─ .sw-drp-chk-group[data-group="safety-boundary"]
```

### 3.4 Summary bar

The summary bar (`.sw-drp-chk-summary`) shows a single-line status across all groups:

```
W3 Review  [N blocked]  [N warning]  [N pass]  [N pending]
```

Color of the summary bar's left border and status icon follows the highest-severity
item in the current step (see §8.4).

In the **first (display-only) implementation**, the group list is expanded by default
and no toggle mechanism is required. A collapse/expand control is a later enhancement.

---

## 4. What the Checklist Displays

The checklist renders **per-step** — it re-evaluates and re-renders on every call to
`paintWargame3Preview()` (i.e., on every prev/next navigation).

For each item it displays:

| UI element | Description |
|------------|-------------|
| Status icon | Visual indicator: ✕ (blocked), ⚠ (warning), ✓ (pass), · (pending) |
| Item label | Human-readable description of the check (EN or AR based on active locale) |
| Evidence text | Short auto-generated string explaining the current value (e.g., `"34 MISSING_FIELD warnings — expected"`) |
| Group header | Label for the group this item belongs to |

Items with `blocking: true` and `status: "blocked"` are visually emphasized (bold
label, red icon) to ensure they are not overlooked.

Items with `source: "operator_visual_review"` display a `·` (pending) icon in the
first read-only implementation and are labeled with a locale key that includes the
word "review" — e.g., `"Narrative is readable (operator review)"`. They are not
auto-resolved.

---

## 5. What the Checklist Must Not Do

These are **immutable constraints** for any implementation of `#sw-drp-checklist`.

| Prohibited action | Reason |
|-------------------|--------|
| Mutate `window.RmoozScenario.stepIndex` | Preview is read-only; nav isolation is a safety invariant |
| Mutate `window.RmoozScenario.scenario` | Source is read-only throughout |
| Mutate `window.units` or `window.lines` | Map state is outside preview scope |
| Place Leaflet markers, overlays, or arrows | No map interaction from the checklist |
| Write to `localStorage`, `sessionStorage`, or `IndexedDB` | Review state is session-local and ephemeral |
| Call any `/api/sim/*` endpoint | No backend state change from preview |
| Set `selectedDecision` on any step | Decision requires operator deliberation, not auto-fill |
| Set `expectedResult` on any step | Same reason |
| Set `previewComplete` to `true` | Completion is a deliberate adjudication event, not a checklist side effect |
| Show an "approve" or "confirm" or "apply" button | Checklist is display-only |
| Auto-pass items based on a previous step's result | Each step re-evaluates independently |
| Carry review state between sessions | No persistence; review state is reset on page load |
| Generate or infer `selectedDecision` from effects data | Inference is not adjudication |
| Trigger Gate 7 or any commit flow | Gate 7 is outside checklist scope |
| Modify `app.js` or `adjudicator-map.js` behaviour | Those files are out of scope |

---

## 6. Read-Only Checklist Item Model

Every checklist item conforms to the following shape. All fields are required. No
field may be `undefined`.

```javascript
{
    id:                   string,    // unique identifier, e.g. "src-01"
    labelKey:             string,    // i18n key, e.g. "sw-drp-chk-src-01"
    group:                string,    // one of the 8 group IDs (see §7)
    status:               string,    // "pass" | "warning" | "blocked" | "pending"
    source:               string,    // "preview" | "system_validation" | "operator_visual_review"
    readOnly:             true,      // always literal true — never mutable from UI
    liveMutationAllowed:  false,     // always literal false — never mutable from UI
    blocking:             boolean,   // true if status:"blocked" must stop downstream use
    evidence:             string | null  // auto-generated explanation, null if pending
}
```

### 6.1 Field definitions

**`id`**  
Unique, stable, human-readable identifier. Format: `{group-prefix}-{NN}` where prefix
is two-to-three lowercase letters matching the group and `NN` is a two-digit sequence.
Must not change between implementations once assigned.

**`labelKey`**  
i18n lookup key. Format: `sw-drp-chk-{id}`. The key must exist in both EN and AR
locales before any implementation may render the item.

**`group`**  
String matching one of the 8 group IDs defined in §7. Used for grouping in the UI.

**`status`**  
One of four values:
- `"pass"` — condition met; no action needed
- `"warning"` — condition partially met or advisory; review recommended but not blocking
- `"blocked"` — condition failed; item is a hard blocker if `blocking: true`
- `"pending"` — condition not yet evaluated (used for `operator_visual_review` items
  in the display-only first implementation, and for any item where data is unavailable)

**`source`**  
Origin of the status value:
- `"preview"` — derived from data already painted to the DRP panel (step content,
  warning class, objective status value, nav state)
- `"system_validation"` — requires running a validation function not already performed
  during paint (e.g., unit pool membership check, adapter re-run, stepIndex snapshot
  comparison)
- `"operator_visual_review"` — requires a human to assess content quality; cannot be
  auto-resolved; always `"pending"` in the display-only implementation

**`blocking`**  
If `true` and `status === "blocked"`, the session review summary must show an
overall state of BLOCKED, and downstream use (copy, report, progression) must be
suspended. If `false`, a `"blocked"` status is advisory only and does not prevent
downstream use.

**`evidence`**  
Short auto-generated string explaining the current evaluated value. Examples:
- `"passed: true — 17 steps copied"` 
- `"34 MISSING_FIELD warnings — expected in W3 mode"`
- `"UNKNOWN_UNIT: B-d0-99-000 on step 0 — UID not in unit pool"`
- `null` when `status === "pending"` and no evaluation has run

### 6.2 Item array and scope

Items are held in a transient array — never serialized, never written to any storage.
The array is reconstructed fresh on each `paintWargame3Preview()` call.

Two scopes exist within the array:

| Scope | Evaluated | Items |
|-------|-----------|-------|
| **Session** | Once at `buildW3PreviewFromLoadedScenario()` call time | Group 1 (source integrity) |
| **Per-step** | On every `paintWargame3Preview()` call | Groups 2–8 |

Session-scope items display the same value on every step navigation. Per-step items
re-evaluate on each step.

---

## 7. Per-Step Checklist Groups

### Group 1 — Source integrity  
`data-group="source-integrity"`  
Scope: session. Evaluates the `buildW3PreviewFromLoadedScenario()` result.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `src-01` | `sw-drp-chk-src-01` | `system_validation` | **true** | `buildW3PreviewFromLoadedScenario().passed === true` |
| `src-02` | `sw-drp-chk-src-02` | `system_validation` | **true** | `w3json.steps.length === 17` |
| `src-03` | `sw-drp-chk-src-03` | `system_validation` | false | `w3json.scenario_id` is non-empty |
| `src-04` | `sw-drp-chk-src-04` | `system_validation` | **true** | No `W3PFC_STEP_SKIP` warning in result |
| `src-05` | `sw-drp-chk-src-05` | `system_validation` | **true** | No `W3PFC_ADAPTER_BLOCKED` warning in result |
| `src-06` | `sw-drp-chk-src-06` | `system_validation` | **true** | No `W3PFC_ADAPTER_EXCEPTION` warning in result |

Status mapping for `src-01`: `pass` if `passed:true`; `blocked` if `passed:false`.  
Status mapping for `src-02`: `pass` if count = 17; `blocked` if count ≠ 17.  
Status mapping for `src-03`: `pass` if non-empty; `warning` if empty (advisory).  
Status mapping for `src-04` / `src-05` / `src-06`: `pass` if count = 0; `blocked` if count > 0.

---

### Group 2 — Step structure  
`data-group="step-structure"`  
Scope: per-step. Evaluates the active step's structural fields.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `str-01` | `sw-drp-chk-str-01` | `preview` | false | Step ID matches `W3-STEP-\d{2}` pattern |
| `str-02` | `sw-drp-chk-str-02` | `preview` | **true** | Phase label is non-empty |
| `str-03` | `sw-drp-chk-str-03` | `preview` | **true** | Time label is non-empty |
| `str-04` | `sw-drp-chk-str-04` | `preview` | **true** | Narrative non-empty in at least one language |
| `str-05` | `sw-drp-chk-str-05` | `operator_visual_review` | false | Narrative is readable and relevant to phase (operator review) |

Status mapping for `str-01`: `pass` if matches; `warning` if not (ID format advisory).  
Status mapping for `str-02` / `str-03` / `str-04`: `pass` if non-empty; `blocked` if empty.  
Status mapping for `str-05`: always `pending` in display-only implementation.

---

### Group 3 — Objective status  
`data-group="objective-status"`  
Scope: per-step. Evaluates `objective_status_baseline` for the active step.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `obj-01` | `sw-drp-chk-obj-01` | `preview` | **true** | Status is one of `DORMANT`, `THREATENED`, `CONTESTED`, `DENIED` |
| `obj-02` | `sw-drp-chk-obj-02` | `system_validation` | false | Status matches expected value for this step index (per PR-231 §1 table) |
| `obj-03` | `sw-drp-chk-obj-03` | `system_validation` | **true** | Status does not regress from previous step |

Status mapping for `obj-01`: `pass` if known value; `blocked` if unknown.  
Status mapping for `obj-02`: `pass` if matches expected; `warning` if differs (data could be intentionally changed).  
Status mapping for `obj-03`: `pass` if non-regressing; `blocked` if regression detected.

**Expected W3 status sequence (reference):**

| Steps | Expected status |
|-------|----------------|
| 0–4 | `DORMANT` |
| 5–8 | `THREATENED` |
| 9–15 | `CONTESTED` |
| 16 | `DENIED` |

---

### Group 4 — Units and effects  
`data-group="units-and-effects"`  
Scope: per-step. Evaluates actors, affected, and engagement_arcs arrays.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `eff-01` | `sw-drp-chk-eff-01` | `preview` | **true** | At least one entry in `actors` array |
| `eff-02` | `sw-drp-chk-eff-02` | `preview` | **true** | At least one entry in `affected` array |
| `eff-03` | `sw-drp-chk-eff-03` | `system_validation` | **true** | All actor UIDs found in the combined unit pool (83 blue + 70 red) |
| `eff-04` | `sw-drp-chk-eff-04` | `system_validation` | **true** | All affected UIDs found in the combined unit pool |

Status mapping for `eff-01` / `eff-02`: `pass` if length > 0; `blocked` if length = 0.  
Status mapping for `eff-03` / `eff-04`: `pass` if all UIDs resolved; `blocked` if any UID produces `UNKNOWN_UNIT`.

Evidence string example for `eff-03` when blocked:
`"UNKNOWN_UNIT: R-d3-999-001 not in unit pool (step 4, actor)"`

---

### Group 5 — Warnings  
`data-group="warnings"`  
Scope: per-step. Evaluates the rendered warning state.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `wrn-01` | `sw-drp-chk-wrn-01` | `preview` | **true** | `#sw-drp-warnings` has class `sw-drp-warn-expected`, not `sw-drp-warn-text` |
| `wrn-02` | `sw-drp-chk-wrn-02` | `system_validation` | false | Warning count is exactly 2 (two `MISSING_FIELD` entries) |
| `wrn-03` | `sw-drp-chk-wrn-03` | `system_validation` | **true** | Zero `UNKNOWN_UNIT` warning codes on this step |

Status mapping for `wrn-01`: `pass` if class is `sw-drp-warn-expected`; `blocked` if class is `sw-drp-warn-text`.  
Status mapping for `wrn-02`: `pass` if count = 2; `warning` if count ≠ 2 (deviation from expected W3 baseline).  
Status mapping for `wrn-03`: `pass` if count = 0; `blocked` if count > 0.

---

### Group 6 — Missing decision / result  
`data-group="decision-result"`  
Scope: per-step. Evaluates null decision/result fields as expected source gaps.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `dec-01` | `sw-drp-chk-dec-01` | `preview` | false | `selectedDecision` is `null` — expected W3 source gap |
| `dec-02` | `sw-drp-chk-dec-02` | `preview` | false | `expectedResult` is `null` — expected W3 source gap |
| `dec-03` | `sw-drp-chk-dec-03` | `operator_visual_review` | false | Operator has noted that null fields are source gaps, not adjudication approvals |

Status mapping for `dec-01` / `dec-02`:
- `pass` (informational) if value is `null` — this is the expected W3 state
- `warning` if value is unexpectedly non-null (W3 source has been modified)

The `pass` state for `dec-01` / `dec-02` must be visually distinguished from
a structural pass (e.g., labeled "Expected gap — no action needed" rather than a
plain green checkmark). Use a muted-blue `pass-expected` visual variant.

Status mapping for `dec-03`: always `pending` in display-only implementation.

---

### Group 7 — Navigation isolation  
`data-group="navigation-isolation"`  
Scope: per-step. Evaluates that preview navigation has not affected live state.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `nav-01` | `sw-drp-chk-nav-01` | `preview` | false | Nav hint (`#sw-drp-nav-hint`) is visible |
| `nav-02` | `sw-drp-chk-nav-02` | `system_validation` | **true** | `window.RmoozScenario.stepIndex` value is unchanged from initial snapshot |
| `nav-03` | `sw-drp-chk-nav-03` | `system_validation` | **true** | `previewComplete` is `false` on all steps checked so far |

Status mapping for `nav-01`: `pass` if `hint.hidden === false`; `warning` if hidden (nav panel not active).  
Status mapping for `nav-02`: `pass` if `stepIndex` matches snapshot; `blocked` if it has changed.  
Status mapping for `nav-03`: `pass` if all checked steps have `previewComplete: false`; `blocked` if any is `true`.

**Implementation note for `nav-02`:** A snapshot of `window.RmoozScenario.stepIndex`
must be captured immediately before the first `paintWargame3Preview()` call. This
snapshot is session-scope and must not be updated on subsequent nav steps. If the
current value ever differs from the snapshot, item `nav-02` transitions to `blocked`.

---

### Group 8 — Safety boundary  
`data-group="safety-boundary"`  
Scope: per-step. Confirms that no simulation state mutation has occurred.

| ID | Label key | Source | Blocking | What it checks |
|----|-----------|--------|----------|----------------|
| `saf-01` | `sw-drp-chk-saf-01` | `system_validation` | **true** | `localStorage.length` unchanged from pre-preview snapshot |
| `saf-02` | `sw-drp-chk-saf-02` | `system_validation` | **true** | No `/api/sim/*` fetch calls recorded since preview start |
| `saf-03` | `sw-drp-chk-saf-03` | `system_validation` | **true** | `window.RmoozScenario.scenario.name` unchanged from pre-preview snapshot |
| `saf-04` | `sw-drp-chk-saf-04` | `operator_visual_review` | false | No apply/commit/confirm controls are visible or enabled in the panel |

Status mapping for `saf-01`: `pass` if `localStorage.length` matches snapshot; `blocked` if changed.  
Status mapping for `saf-02`: `pass` if no `/api/sim/*` network events detected; `blocked` if any detected.  
Status mapping for `saf-03`: `pass` if `scenario.name` matches snapshot; `blocked` if changed.  
Status mapping for `saf-04`: always `pending` in display-only implementation.

**Implementation note for `saf-01` / `saf-03`:** Pre-preview snapshots must be
captured at the same time as the `nav-02` snapshot (before first `paintWargame3Preview()`
call) and held in a session-local, non-persisted variable.

---

## 8. Status Display Rules

### 8.1 Per-item status indicators

| Status | Icon | Color token | Text color |
|--------|------|-------------|------------|
| `pass` | `✓` | `--status-pass` | `#4caf50` (green-500) |
| `pass-expected` (dec-01, dec-02) | `·` | `--status-expected` | `rgb(148, 163, 184)` (muted blue-gray) |
| `warning` | `⚠` | `--status-warning` | `#ffb300` (amber-600) |
| `blocked` | `✕` | `--status-blocked` | `#ef5350` (red-400) |
| `pending` | `·` | `--status-pending` | `#9e9e9e` (gray-600) |

Light theme overrides:

| Status | Light color |
|--------|------------|
| `pass` | `#2e7d32` (green-800) |
| `pass-expected` | `#78909c` (blue-gray-400) |
| `warning` | `#ef6c00` (orange-700) |
| `blocked` | `#c62828` (red-800) |
| `pending` | `#757575` (gray-600) |

### 8.2 Item label typography

| Status | Font weight | Font style |
|--------|-------------|------------|
| `pass` | normal | normal |
| `pass-expected` | normal | normal |
| `warning` | 500 | normal |
| `blocked` | **600** | normal |
| `pending` | normal | italic |

### 8.3 Group header badge

Each group header shows a compact status summary: the count of items at each status
level in that group, using color-coded pills. Format:

```
[Group label]   ✕2  ⚠1  ✓3  ·1
```

If all items in a group are `pass`, the header shows a single `✓` in green.  
If all items are `pending`, no badge is shown (group is unevaluated).

### 8.4 Summary bar overall status

The summary bar's overall status is determined by the highest-severity item in the
current step's checklist:

| Condition | Overall status | Summary bar color |
|-----------|---------------|-------------------|
| Any `blocking: true` item has `status: "blocked"` | **BLOCKED** | `--status-blocked` red |
| No blocking items blocked; any item has `status: "warning"` | **REVIEW** | `--status-warning` amber |
| Any item has `status: "blocked"` (non-blocking) | **REVIEW** | `--status-warning` amber |
| All resolved items are `pass` or `pass-expected`; no `pending` items | **CLEAR** | `--status-pass` green |
| One or more items are `pending`; no blocked items | **PENDING** | `--status-pending` gray |

---

## 9. Warning Display Rules

Warning-related items in the checklist (`wrn-01`, `wrn-02`, `wrn-03`) interface with
the existing `#sw-drp-warnings` element. The following rules govern how warning state
maps to checklist item status.

### 9.1 Normal W3 warning state (post-PR-228)

Expected per-step warning profile:

```
Warning count:  2
Warning codes:  [ MISSING_FIELD, MISSING_FIELD ]
Warning class:  sw-drp-warn-expected
```

Under this profile:
- `wrn-01` → `pass` (class is `sw-drp-warn-expected`)
- `wrn-02` → `pass` (count = 2, evidence: `"2 MISSING_FIELD — expected in W3 mode"`)
- `wrn-03` → `pass` (zero UNKNOWN_UNIT)

### 9.2 Degraded state — unexpected warning code

If `#sw-drp-warnings` renders with class `sw-drp-warn-text` (orange):

- `wrn-01` → `blocked` (unexpected warning type present)
- `wrn-02` → re-evaluate (count may be > 2 or include non-MISSING_FIELD codes)
- `wrn-03` → re-evaluate (check for UNKNOWN_UNIT specifically)

### 9.3 Warning deviation — count ≠ 2

If warning count on a step is not exactly 2:

| Count | `wrn-02` status | Evidence |
|-------|----------------|----------|
| 0 | `warning` | `"0 warnings — expectedResult and selectedDecision may not be null?"` |
| 1 | `warning` | `"1 MISSING_FIELD — expected 2 (selectedDecision or expectedResult)"` |
| 2 | `pass` | `"2 MISSING_FIELD — expected in W3 mode"` |
| > 2 | `warning` | `"N warnings — expected 2; {N-2} extra warning(s) present"` |

A non-2 count does not by itself trigger `blocked` unless one of the extra codes is
`UNKNOWN_UNIT`, `W3PFC_STEP_SKIP`, `W3PFC_ADAPTER_BLOCKED`, or `W3PFC_ADAPTER_EXCEPTION`.

---

## 10. Operator Review States

These states are transient. They are computed from item statuses for display only.
They are never persisted, never written to any storage, and never used as a trigger
for any simulation action.

### 10.1 Per-step review states

| State | Condition | Display |
|-------|-----------|---------|
| `STEP_PENDING` | Step has not been navigated to; no items evaluated | Gray pill: "Not reviewed" |
| `STEP_IN_REVIEW` | Operator is currently on this step (preview cursor is here) | Blue pill: "In review" |
| `STEP_BLOCKED` | One or more `blocking: true` items have `status: "blocked"` | Red pill: "Blocked" |
| `STEP_REVIEW` | No blocking items blocked; one or more warnings or non-blocking blockeds | Amber pill: "Review" |
| `STEP_CLEAR` | All items resolved with `pass` or `pass-expected`; no `pending` system items | Green pill: "Clear" |
| `STEP_INCOMPLETE` | All navigated items evaluated; some `operator_visual_review` items still `pending` | Gray pill: "Incomplete" |

In the **display-only first implementation**, no step reaches `STEP_CLEAR` because
all `operator_visual_review` items remain `pending`. The highest reachable state is
`STEP_INCOMPLETE` (if no blockers or warnings) or `STEP_BLOCKED` / `STEP_REVIEW`.

### 10.2 Session review state

The session review state summarises all 17 steps:

| State | Condition |
|-------|-----------|
| `SESSION_BLOCKED` | Any step is `STEP_BLOCKED` |
| `SESSION_REVIEW` | No step blocked; any step is `STEP_REVIEW` |
| `SESSION_INCOMPLETE` | All navigated steps clear or incomplete; some `pending` items remain |
| `SESSION_NOT_STARTED` | No steps have been navigated to |
| `SESSION_CLEAR` | All 17 steps are `STEP_CLEAR` (requires interactive implementation) |

`SESSION_CLEAR` is **not reachable** in the display-only first implementation.

### 10.3 What `SESSION_INCOMPLETE` does not mean

`SESSION_INCOMPLETE` must not be displayed, labeled, or used as a trigger as if it
were a form of approval or completion. It means only that the automated portions of
the review have passed and the operator portions are still pending. It explicitly
does **not** mean:

- That `previewComplete` may be set to `true`
- That `selectedDecision` should be filled
- That scenario progression may be initiated
- That the W3 preview is ready for downstream use

---

## 11. Hard Blockers

The following conditions, when present on any step, transition the session to
`SESSION_BLOCKED` and must prevent all downstream use until resolved.

| Item | Condition | Resolution |
|------|-----------|------------|
| `src-01` | `buildW3PreviewFromLoadedScenario().passed === false` | Investigate `blockedReasons` array; reload scenario |
| `src-02` | `w3json.steps.length ≠ 17` | Source data has wrong step count; inspect and repair `wargame3.json` |
| `src-04` | Any `W3PFC_STEP_SKIP` warning | A step was null in source; inspect and repair `wargame3.json` |
| `src-05` | Any `W3PFC_ADAPTER_BLOCKED` warning | Adapter validation failed; review adapter `blockedReasons` |
| `src-06` | Any `W3PFC_ADAPTER_EXCEPTION` warning | Unhandled adapter error; investigate code path |
| `str-02` | Phase label empty on any step | Source data gap; repair step in `wargame3.json` |
| `str-03` | Time label empty on any step | Source data gap; repair step in `wargame3.json` |
| `str-04` | Narrative empty in both languages on any step | Source data gap; repair step in `wargame3.json` |
| `obj-01` | `objective_status_baseline` is unknown value | Source data error; valid values are DORMANT/THREATENED/CONTESTED/DENIED |
| `obj-03` | Objective status regresses between steps | Source step ordering error; repair in `wargame3.json` |
| `eff-01` | Zero actors on any step | Step has no active units; source data gap |
| `eff-02` | Zero affected on any step | Step has no affected units; source data gap |
| `eff-03` | Any actor UID not in unit pool | Run PR-228-style data gap analysis; add missing unit to `blue_units_initial` |
| `eff-04` | Any affected UID not in unit pool | Same as `eff-03` |
| `wrn-01` | `#sw-drp-warnings` has class `sw-drp-warn-text` | Non-MISSING_FIELD warning present; investigate warning codes |
| `wrn-03` | Any `UNKNOWN_UNIT` warning code on any step | Same as `eff-03` / `eff-04` |
| `nav-02` | `window.RmoozScenario.stepIndex` changed from snapshot | Critical safety violation; halt all preview activity; investigate cause |
| `nav-03` | Any step has `previewComplete: true` | Critical safety violation; `previewComplete` must never be set by preview |
| `saf-01` | `localStorage.length` changed | Storage mutation during preview; investigate cause |
| `saf-02` | Any `/api/sim/*` fetch detected | Backend call during preview; investigate cause |
| `saf-03` | `scenario.name` changed from snapshot | Scenario object mutated during preview; critical safety violation |

---

## 12. Non-Blocking Expected Gaps

The following conditions are structurally expected in W3 preview mode and must not be
displayed as errors or treated as blockers.

| Item | Expected condition | Display treatment |
|------|-------------------|-------------------|
| `dec-01` | `selectedDecision === null` | `pass-expected` (muted blue-gray) — labeled "Expected source gap" |
| `dec-02` | `expectedResult === null` | `pass-expected` (muted blue-gray) — labeled "Expected source gap" |
| `wrn-02` | Count = 2, all `MISSING_FIELD` | `pass` — labeled "Expected in W3 mode" |
| `str-05`, `dec-03`, `saf-04`, `nav-01` (advisory) | `pending` in display-only implementation | `pending` (gray) — labeled "Operator review" |

These gaps must be clearly labeled as expected in both EN and AR. They must not
display the same visual indicator as structural `pass` items, to preserve the
operator's ability to distinguish "this check passed" from "this gap is expected."

---

## 13. Accessibility and Arabic / English Layout Requirements

### 13.1 Language and locale

All checklist labels, group headers, status text, and evidence strings must be
internationalised. i18n key naming convention:

| Purpose | Key format | Example |
|---------|-----------|---------|
| Item label | `sw-drp-chk-{id}` | `sw-drp-chk-src-01` |
| Item label (AR) | same key, AR locale object | `sw-drp-chk-src-01` → AR translation |
| Group header | `sw-drp-chkgrp-{group-id}` | `sw-drp-chkgrp-source-integrity` |
| Status label | `sw-drp-chk-status-{status}` | `sw-drp-chk-status-blocked` |
| Summary label | `sw-drp-chk-summary` | "W3 Review" |
| Evidence (auto) | not i18n-keyed; generated as a formatted string | See §6.1 |

Evidence strings that contain data values (counts, UIDs, step IDs) are auto-generated
and do not require i18n keys. However, surrounding descriptive text must be drawn from
i18n keys.

### 13.2 Required EN i18n keys (future addition — not in this PR)

The following keys must be added to the EN locale object in `i18n.js` before any
implementation PR is accepted. They are listed here as a contract, not implemented now.

| Key | Proposed EN value |
|-----|------------------|
| `sw-drp-chkgrp-source-integrity` | `'Source integrity'` |
| `sw-drp-chkgrp-step-structure` | `'Step structure'` |
| `sw-drp-chkgrp-objective-status` | `'Objective status'` |
| `sw-drp-chkgrp-units-and-effects` | `'Units and effects'` |
| `sw-drp-chkgrp-warnings` | `'Warnings'` |
| `sw-drp-chkgrp-decision-result` | `'Decision / result'` |
| `sw-drp-chkgrp-navigation-isolation` | `'Navigation isolation'` |
| `sw-drp-chkgrp-safety-boundary` | `'Safety boundary'` |
| `sw-drp-chk-status-pass` | `'Pass'` |
| `sw-drp-chk-status-pass-expected` | `'Expected gap'` |
| `sw-drp-chk-status-warning` | `'Review'` |
| `sw-drp-chk-status-blocked` | `'Blocked'` |
| `sw-drp-chk-status-pending` | `'Pending'` |
| `sw-drp-chk-summary` | `'W3 Review'` |
| `sw-drp-chk-src-01` | `'W3 copy built successfully'` |
| `sw-drp-chk-src-02` | `'Step count is 17'` |
| `sw-drp-chk-src-03` | `'Scenario ID present'` |
| `sw-drp-chk-src-04` | `'No skipped steps'` |
| `sw-drp-chk-src-05` | `'Adapter passed validation'` |
| `sw-drp-chk-src-06` | `'No adapter exceptions'` |
| `sw-drp-chk-str-01` | `'Step ID matches W3-STEP-NN format'` |
| `sw-drp-chk-str-02` | `'Phase label present'` |
| `sw-drp-chk-str-03` | `'Time label present'` |
| `sw-drp-chk-str-04` | `'Narrative present'` |
| `sw-drp-chk-str-05` | `'Narrative readable (operator review)'` |
| `sw-drp-chk-obj-01` | `'Objective status is a known value'` |
| `sw-drp-chk-obj-02` | `'Status matches expected for step position'` |
| `sw-drp-chk-obj-03` | `'Status does not regress from previous step'` |
| `sw-drp-chk-eff-01` | `'At least one actor entry'` |
| `sw-drp-chk-eff-02` | `'At least one affected entry'` |
| `sw-drp-chk-eff-03` | `'All actor UIDs in unit pool'` |
| `sw-drp-chk-eff-04` | `'All affected UIDs in unit pool'` |
| `sw-drp-chk-wrn-01` | `'Warning display is informational (expected gaps only)'` |
| `sw-drp-chk-wrn-02` | `'Warning count is 2 (expected in W3 mode)'` |
| `sw-drp-chk-wrn-03` | `'No UNKNOWN_UNIT warnings'` |
| `sw-drp-chk-dec-01` | `'selectedDecision is null — expected W3 source gap'` |
| `sw-drp-chk-dec-02` | `'expectedResult is null — expected W3 source gap'` |
| `sw-drp-chk-dec-03` | `'Null fields acknowledged as source gaps (operator review)'` |
| `sw-drp-chk-nav-01` | `'Preview isolation hint visible'` |
| `sw-drp-chk-nav-02` | `'Live stepIndex unchanged'` |
| `sw-drp-chk-nav-03` | `'previewComplete remains false'` |
| `sw-drp-chk-saf-01` | `'No storage writes'` |
| `sw-drp-chk-saf-02` | `'No backend calls'` |
| `sw-drp-chk-saf-03` | `'Scenario object unchanged'` |
| `sw-drp-chk-saf-04` | `'No apply/commit/confirm controls visible (operator review)'` |

### 13.3 Required AR i18n keys (future addition — not in this PR)

An equivalent Arabic translation must be provided for every EN key listed in §13.2
before any implementation PR is accepted. These are not listed here to avoid
placeholder values; they must be supplied by a qualified Arabic translator or verified
against the existing AR locale pattern in `i18n.js`.

### 13.4 RTL layout requirements

When `[dir="rtl"]` or `[lang="ar"]` is active:

- Checklist group rows must reverse their inline direction
  (status icon on the right, label text on the left in logical terms)
- Status icon and evidence text must not overlap in narrow panels
- Group header badge pills must flow right-to-left
- All logical properties (`margin-inline-start`, `padding-inline-end`, etc.) must be
  used instead of physical left/right properties
- Tab order must follow visual reading order in RTL (right to left)

### 13.5 Keyboard navigation

- Each checklist item row must be focusable (`tabindex="0"`)
- Focused row must display a visible focus ring consistent with existing panel focus styles
- Group headers must be focusable and announce group name + status summary via
  `aria-label`
- `aria-live="polite"` region must wrap the summary bar to announce status changes
  when nav buttons advance the step

### 13.6 Screen reader annotations

- Each item element must have `role="listitem"` inside a `role="list"` group
- Status must be communicated via `aria-label` on the status icon, not icon text alone
  (e.g., `aria-label="Blocked"` on the `✕` icon)
- `#sw-drp-checklist` must have `aria-label` set from the `sw-drp-chk-summary` i18n key
- Evidence text must be associated with its item via `aria-describedby`

---

## 14. Safety Boundaries

These are invariants that no implementation of `#sw-drp-checklist` may violate,
regardless of what any checklist item status shows.

| Invariant | Rule |
|-----------|------|
| **stepIndex isolation** | The checklist component never reads or writes `window.RmoozScenario.stepIndex` except to compare it against its own pre-preview snapshot for item `nav-02` |
| **Scenario isolation** | The checklist component reads only `w3json` (the safe copy) and never reads or writes `window.RmoozScenario.scenario` directly |
| **Map isolation** | The checklist component makes no Leaflet API calls and references no map DOM elements |
| **Storage isolation** | The checklist component writes to no storage mechanism. The pre-preview snapshot variables (`localStorage.length` baseline, `stepIndex` baseline, `scenario.name` baseline) are held in transient JavaScript variables only |
| **No network** | The checklist component initiates no fetch, XHR, or WebSocket calls |
| **No apply chain** | The checklist component renders no controls that invoke `applyDecision`, `commitStep`, `confirmStep`, Gate 7, or any `/api/sim/*` endpoint |
| **`previewComplete` immutability** | The checklist component never writes to `previewComplete` on any step object |
| **`selectedDecision` immutability** | The checklist component never writes to `selectedDecision` on any step object |
| **`expectedResult` immutability** | The checklist component never writes to `expectedResult` on any step object |
| **Review state non-persistence** | All per-step and session review states are held in transient variables. They are garbage-collected when the page unloads. They are not serializable |
| **No auto-pass** | No item may transition from `pending` to `pass` based on a timer, an auto-evaluation, or any other mechanism without an explicit `source: "system_validation"` or `source: "preview"` computation |
| **No AI-generated approval** | No AI or LLM inference may set `status: "pass"` on any item without a deterministic, auditable data check |

---

## 15. Recommended PR-233

**PR-233 — Wargame 3 Review Checklist Data Builder Contract**  
Type: Documentation-only

This contract (PR-232) defines the item model and display rules, but defers the
question of *how* `source: "system_validation"` and `source: "preview"` item statuses
are computed to a future PR. PR-233 should define that computation layer.

### What PR-233 should document

1. **Data builder function contract** — the signature and return shape of a future
   `buildW3ReviewChecklist(w3json, stepRef, previewSnapshot)` function:
   - `w3json`: the safe copy from `buildW3PreviewFromLoadedScenario()`
   - `stepRef`: current `_drpPreviewStepRef` (e.g., `'W3-STEP-05'`)
   - `previewSnapshot`: session-local baseline object `{ stepIndex, localStorageLength, scenarioName }`
   - Returns: array of 31 item objects conforming to §6 of this document

2. **Per-item evaluation logic** — for every `source: "preview"` and
   `source: "system_validation"` item, the precise algorithm to derive `status` and
   `evidence`. Specifically:
   - Which DOM element or data field to read for each `preview` item
   - Which validation function to call (or which existing adapter/fixture-builder
     result to consult) for each `system_validation` item
   - How to format the `evidence` string for each item

3. **Session snapshot protocol** — exactly when and how to capture the pre-preview
   snapshot, where to store it (transient variable only), and when to invalidate it

4. **Error handling** — what the data builder returns if called before
   `buildW3PreviewFromLoadedScenario()` has run, or if `w3json` is null

5. **Integration point** — how `buildW3ReviewChecklist()` is called from the future
   `paintWargame3Preview()` extension (not implemented in PR-233 — contract only)

### Why PR-233 as data builder contract, not as UI implementation

The UI implementation must not begin until:
1. This contract (PR-232) is accepted — defines what items to render
2. The data builder contract (PR-233) is accepted — defines how to compute each item's status

Implementing the UI before the data builder contract would produce a checklist where
all items are permanently `pending` (no computation defined), which provides no value.
Implementing the UI after both contracts are accepted allows the implementation to be
tested against a clear specification.

The data builder contract is also the appropriate place to ensure that `previewSnapshot`
capture and comparison logic is fully specified before any code is written — because
items `nav-02`, `saf-01`, `saf-02`, and `saf-03` depend on pre-preview state that must
be captured at a precise moment in the page lifecycle.

---

## Safety Checklist

| Constraint | Status |
|---|---|
| Docs-only — no runtime code | ✅ |
| No UI changes | ✅ |
| No app.html changes | ✅ |
| No i18n.js changes | ✅ |
| No style.css changes | ✅ |
| No scenario-workspace.js changes | ✅ |
| No adapter changes | ✅ |
| No source data changes | ✅ |
| No map overlays / markers / arrows | ✅ |
| No live scenario navigation | ✅ |
| No mutation of `window.RmoozScenario.stepIndex` | ✅ |
| No mutation of `window.RmoozScenario.scenario` | ✅ |
| No mutation of `window.units` / `window.lines` | ✅ |
| No storage / fetch / backend | ✅ |
| No apply / commit / confirm controls | ✅ |
| No Gate 7 UI | ✅ |
| No app.js / adjudicator-map.js changes | ✅ |
