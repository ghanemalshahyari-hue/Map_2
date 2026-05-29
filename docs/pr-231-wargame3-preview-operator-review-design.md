# PR-231 — Wargame 3 Preview Operator Review Design

**Date:** 2026-05-26  
**Status:** Delivered  
**Type:** Documentation-only — no runtime changes  
**Scope:** `docs/` only

---

## 1. What the Operator Is Reviewing

The Wargame 3 (W3) dry-run preview panel (`#sw-drp-section`) presents a read-only,
step-by-step view of the W3 reference scenario. The operator is reviewing a safe copy
of the loaded scenario — produced by `buildW3PreviewFromLoadedScenario()` and rendered
through `paintWargame3Preview()` — to assess whether the W3 data is coherent and
complete before any downstream use.

Specifically, the operator is reviewing:

| What | Where in UI | Source field |
|------|-------------|--------------|
| Step identity | `#sw-drp-step` | `scenario.steps[i].index` / step ID `W3-STEP-NN` |
| Phase label | `#sw-drp-phase` | `scenario.steps[i].phase` |
| Time label | `#sw-drp-time` | `scenario.steps[i].time_label` |
| Narrative (EN) | `#sw-drp-narrative` | `scenario.steps[i].narrative_en_fallback` |
| Objective status | `#sw-drp-obj-status` | `scenario.steps[i].objective_status_baseline` |
| Effects | `#sw-drp-effects` | `actors`, `affected`, `engagement_arcs` arrays |
| Warnings | `#sw-drp-warnings` | Warning codes from adapter and fixture builder |
| Navigation position | `#sw-drp-nav-step-info` | `_drpPreviewStepRef` / `_drpPreviewSource.steps.length` |

The operator is **not** deciding anything, approving anything, or advancing the live
scenario. The review is informational. No operator action during preview has any effect
on the running simulation.

The W3 scenario has **17 steps** spanning five phases:

| Steps | Phase label | Objective status | Duration span |
|-------|-------------|-----------------|---------------|
| 0–4 | PRE-H | DORMANT | P0 – P4 |
| 5–7 | PHASE 1 | THREATENED | D-H – D+6h |
| 8 | PHASE 2A | THREATENED | D+12h |
| 9–10 | PHASE 2A | CONTESTED | D+24h – D+36h |
| 11–12 | PHASE 2B | CONTESTED | D+48h – D+72h |
| 13–15 | PHASE 3 | CONTESTED | D+96h – D+132h |
| 16 | RESOLUTION | DENIED | D+144h |

Total unit pool: **83 blue units**, **70 red units**, **153 combined**.

---

## 2. What the Preview Does Not Do

This section exists to prevent scope creep in future PRs. The preview is intentionally
inert. Operators and developers must not assume any of the following occur during preview:

| Item | Status |
|------|--------|
| Advance `window.RmoozScenario.stepIndex` | **Never** — stays at live value throughout |
| Mutate `window.RmoozScenario.scenario` | **Never** — preview reads a deep copy |
| Place Leaflet markers or arrows on the map | **Never** — paint calls are text-only |
| Move units (`window.units` / `window.lines`) | **Never** |
| Write to `localStorage`, `sessionStorage`, or `IndexedDB` | **Never** |
| Call `/api/sim/*` or any backend endpoint | **Never** |
| Set `selectedDecision` on any step | **Never** — remains `null` on all 17 steps |
| Set `expectedResult` on any step | **Never** — remains `null` on all 17 steps |
| Set `previewComplete` to `true` | **Never** — remains `false` on all 17 steps |
| Trigger Gate 7 logic | **Never** |
| Apply effects to any simulation state | **Never** |
| Confirm, commit, or adjudicate any step | **Never** |

The navigation buttons (`#sw-drp-prev-btn`, `#sw-drp-next-btn`) move only the preview
cursor (`_drpPreviewStepRef`). They have no effect on the live scenario or map.

---

## 3. Required Review Checklist Per Step

For each of the 17 steps, the operator must verify all items in the following checklist
before considering that step reviewed. A step is **not reviewed** until all items are
confirmed.

### 3.1 Structural integrity

- [ ] Step ID matches expected sequence: `W3-STEP-00` through `W3-STEP-16`
- [ ] Step counter (`#sw-drp-nav-step-info`) shows `Step N / 17` — denominator is 17
- [ ] Phase label (`#sw-drp-phase`) is non-empty and matches expected phase for this step
  (see table in §1)
- [ ] Time label (`#sw-drp-time`) is non-empty and shows a recognizable time reference
  (`P0`–`P4` for PRE-H; `D-H`, `D+Nh` for operational phases)
- [ ] Narrative (`#sw-drp-narrative`) is non-empty in at least one language

### 3.2 Objective status

- [ ] `#sw-drp-obj-status` shows a known status: `DORMANT`, `THREATENED`, `CONTESTED`,
  or `DENIED`
- [ ] Status matches expected value for this step (see table in §1)
- [ ] Badge color reflects the escalation ladder (see §4)

### 3.3 Effects

- [ ] At least one entry is visible in the effects area (`#sw-drp-effects`)
- [ ] No actor UID appears as `[unknown]` or triggers an `UNKNOWN_UNIT` warning
- [ ] No affected UID appears as `[unknown]` or triggers an `UNKNOWN_UNIT` warning
- [ ] Engagement arcs (if present) reference recognizable actor/target UIDs

### 3.4 Warnings

- [ ] Warning class on `#sw-drp-warnings` is `sw-drp-warn-expected` (muted blue-gray)
  — indicating only `MISSING_FIELD` warnings, which are expected in W3 mode
- [ ] Warning class is **not** `sw-drp-warn-text` (orange) — orange indicates unexpected
  warning types that require investigation
- [ ] Warning count: exactly **2 per step** (`MISSING_FIELD` for `selectedDecision`
  and `expectedResult`)

### 3.5 Navigation isolation

- [ ] Nav hint (`#sw-drp-nav-hint`) is visible and reads "Preview only — live step unchanged"
- [ ] After navigating, confirm `window.RmoozScenario.stepIndex` has not changed
  (console: `window.RmoozScenario.stepIndex`)

---

## 4. How to Interpret Objective Status

Objective status (`objective_status_baseline`) describes the state of the primary
objective at the baseline of that step — before any decision or result is applied.
In the W3 preview, no decision or result is ever applied; the baseline is the only
available signal.

### 4.1 Status meanings

| Status | Color (dark) | Color (light) | Meaning |
|--------|-------------|---------------|---------|
| `DORMANT` | `#9e9e9e` gray | `#757575` gray | Objective not yet under threat. Preparatory activity only. |
| `THREATENED` | `#ffb300` amber | `#ef6c00` orange | Threat has materialized. Objective is at risk. Active monitoring required. |
| `CONTESTED` | `#ef5350` red-orange | `#c62828` red | Active engagement is underway. Objective is under direct pressure. |
| `DENIED` | `#b71c1c` deep red + *italic* | `#7f0000` darkest red + *italic* | Objective lost. Terminal state for this objective in this scenario. |

### 4.2 Expected escalation direction

In a valid W3 scenario, objective status must be **monotonically non-decreasing** through
the step sequence (it may hold steady across steps, but must never regress):

```
DORMANT → DORMANT → … → THREATENED → … → CONTESTED → … → DENIED
```

A regression (e.g., step N shows `CONTESTED`, step N+1 shows `THREATENED`) indicates a
data error in the source and must block any downstream use of that step range.

### 4.3 What status does NOT mean in preview

- A `DORMANT` step is **not** safe to skip — it may contain critical PRE-H unit
  positioning data in actors/affected/arcs.
- A `DENIED` status does **not** trigger any simulation state change. It is a source
  annotation only.
- Status being `CONTESTED` or `DENIED` does **not** mean `previewComplete` is `true`.
  `previewComplete` remains `false` on all 17 steps regardless of status.

---

## 5. How to Interpret Effects

Each step's effects consist of three arrays read from the W3 source:

### 5.1 `actors` array

Records which units took action and what they did. Each entry has:

| Field | Meaning |
|-------|---------|
| `uid` | Unit UID — must exist in the combined unit pool (83 blue + 70 red = 153) |
| `side` | `BLUE` or `RED` |
| `action_component` | Capability domain of the action (e.g., `ew`, `fires`, `maneuver`) |
| `action_what` | Plain-language description of the action taken |
| `action_why` | Doctrinal rationale |
| `action_intended_effect` | Stated goal of the action |
| `action_doctrine_cited` | Source doctrine reference(s) |

**Operator check:** Does each `uid` correspond to a unit you expect to be active in
this phase? Does the action type (`action_component`) match that unit's role and domain?

### 5.2 `affected` array

Records which units were affected by actions in this step. Each entry has:

| Field | Meaning |
|-------|---------|
| `uid` | Affected unit UID — must exist in the combined unit pool |
| `side` | `BLUE` or `RED` |
| `status_change` | Effect result (e.g., `suppressed`, `damaged_partial`, `destroyed`) |
| `damage_pct` | Fractional damage estimate (`0.0` – `1.0`) |
| `cause_actor` | UID of the actor that caused this effect |
| `cause_what` | Description of the cause |
| `cause_doctrine` | Doctrine reference for the cause |

**Operator check:** Does the `damage_pct` seem proportionate to the `status_change`?
Is the `cause_actor` UID one of the actors in the same step? Does the `status_change`
make tactical sense for this phase?

### 5.3 `engagement_arcs` array

Records directed engagements between specific unit pairs, with coordinates. Each entry has:

| Field | Meaning |
|-------|---------|
| `actor_uid` / `actor_side` | Engaging unit and its side |
| `target_uid` / `target_side` | Target unit and its side |
| `status_change` | Effect on target |
| `damage_pct` | Fractional damage estimate |
| `cause_what` | Description of the engagement |
| `cause_doctrine` | Doctrine reference |
| `coordinates` | `[[actor_lon, actor_lat], [target_lon, target_lat]]` — display reference only |

**Important:** The `coordinates` field in engagement arcs is a source annotation for
spatial reference. In the preview, these coordinates are **not** used to place any
markers, draw any lines, or trigger any map updates. They are data only.

**Operator check:** Do the actor/target UID pair make tactical sense (e.g., an EW unit
engaging a C2 node)? Do the coordinates place the engagement in the expected operational
area?

### 5.4 Effects counts as a sanity signal

Step-level effects counts from the current W3 source (post-PR-228):

| Step | Actors | Affected | Arcs | Total effects items |
|------|--------|----------|------|---------------------|
| W3-STEP-00 | 14 | 7 | 12 | 33 |
| W3-STEP-01 | 4 | 1 | 3 | 8 |
| W3-STEP-02 | 5 | 4 | 4 | 13 |
| W3-STEP-03 | 14 | 10 | 10 | 34 |
| W3-STEP-04 | 9 | 4 | 5 | 18 |
| W3-STEP-05 | 14 | 8 | 8 | 30 |
| W3-STEP-06 | 16 | 9 | 10 | 35 |
| W3-STEP-07 | 16 | 10 | 10 | 36 |
| W3-STEP-08 | 14 | 8 | 8 | 30 |
| W3-STEP-09 | 12 | 7 | 8 | 27 |
| W3-STEP-10 | 12 | 5 | 6 | 23 |
| W3-STEP-11 | 14 | 9 | 9 | 32 |
| W3-STEP-12 | 12 | 4 | 8 | 24 |
| W3-STEP-13 | 13 | 10 | 10 | 33 |
| W3-STEP-14 | 14 | 11 | 11 | 36 |
| W3-STEP-15 | 14 | 11 | 12 | 37 |
| W3-STEP-16 | 12 | 10 | 10 | 32 |

A step that renders **zero effects** across all three arrays is a data gap and must
block downstream use of that step.

---

## 6. How to Interpret Missing Decision / Result

### 6.1 What the fields are

Every W3 step has two decision-tracking fields:

| Field | Purpose |
|-------|---------|
| `selectedDecision` | The adjudicator's chosen decision at this step |
| `expectedResult` | The anticipated outcome of that decision |

In W3 preview mode, both fields are `null` on every step. This is **not a bug**.

### 6.2 Why they are null

W3 was designed as a reference scenario — a pre-authored sequence of events that models
a plausible wargame progression. It was not designed as an adjudication journal. No
human adjudicator has run this scenario through the RMOOZ decision chain. There are no
recorded decisions to display because none have been made.

The adapter copies these fields as `null` by design (see `_w3pfc_copyStep` in
`scenario-workspace.js`). The warning system reports them as `MISSING_FIELD` — an
informational annotation, not an error.

### 6.3 What this means for the operator

- The operator **cannot** evaluate whether the right decision was made at any step,
  because no decision has been made.
- The operator **can** evaluate whether the step data is structurally sound (phase,
  time, narrative, status, effects) and whether it would support a future decision.
- The operator **must not** treat `null` decisions as "ready to apply." They indicate
  that the decision phase has not occurred, not that it has been approved.
- The operator **must not** infer a decision from the effects data. Effects in W3 are
  baseline scenario projections, not confirmed adjudication outcomes.

### 6.4 Correct operator stance

> "This step has no recorded decision or expected result. I am reviewing the source
> data only. I am not approving, confirming, or advancing anything."

---

## 7. How to Interpret Warnings

### 7.1 Warning display states

The `#sw-drp-warnings` element can be in one of three visual states:

| State | CSS class | Color | Meaning |
|-------|-----------|-------|---------|
| No warnings | neither class | default muted | Step passed adapter with no issues |
| Expected gaps only | `sw-drp-warn-expected` | muted blue-gray `rgb(148,163,184)` | Only `MISSING_FIELD` warnings — normal for W3 |
| Unexpected warnings | `sw-drp-warn-text` | error orange `rgb(230,81,0)` | One or more non-`MISSING_FIELD` warning codes — requires investigation |

### 7.2 Warning code reference

| Code | Severity | Meaning | Action required |
|------|----------|---------|-----------------|
| `MISSING_FIELD` | Informational | `selectedDecision` or `expectedResult` is null | None — expected in W3 mode |
| `UNKNOWN_UNIT` | **Blocking** | A `uid` in actors/affected is not in the combined unit pool | Must be resolved before downstream use |
| `W3PFC_STEP_SKIP` | **Blocking** | A step was null or non-object and was skipped during copy | Data integrity failure — source must be repaired |
| `W3PFC_ADAPTER_BLOCKED` | **Blocking** | `adaptWargame3ToFixture()` returned `passed: false` | Adapter validation failed — review `blockedReasons` array |
| `W3PFC_ADAPTER_EXCEPTION` | **Blocking** | Adapter threw an unhandled exception during validation | Code error — investigate before any further use |
| `W3PFC_NO_RED_UNITS` | Advisory | `scenario.red_units` is absent | Red force data missing — effects involving red UIDs may be unreliable |
| `W3PFC_NO_BLUE_UNITS` | Advisory | `scenario.blue_units_initial` is absent | Blue force data missing — effects involving blue UIDs may be unreliable |
| `W3PFC_NO_RED_COORDS` | Advisory | `scenario.red_unit_step_coords` is absent | Step coordinate data missing for red units |
| `W3PFC_NO_BLUE_COORDS` | Advisory | `scenario.blue_unit_step_coords` is absent | Step coordinate data missing for blue units |

### 7.3 Expected state post-PR-228

After the data gap cleanup in PR-228, the W3 source produces:

- **`MISSING_FIELD` warnings:** exactly **34** (2 per step × 17 steps) — all informational
- **`UNKNOWN_UNIT` warnings:** **0** — all UIDs are now in the unit pool
- **All other codes:** **0**
- **Warning display class:** `sw-drp-warn-expected` on every step (muted blue-gray)

Any deviation from this baseline — even a single `UNKNOWN_UNIT` — is a signal that the
source data has changed and must be re-audited before use.

---

## 8. What Must Block Future Progression

The following conditions must prevent any downstream use, handoff, or escalation of W3
preview data. "Downstream use" includes (but is not limited to) reporting, decision
logging, copy-to-journal operations, and scenario advancement.

### 8.1 Hard blockers — stop immediately

| Condition | Why it blocks |
|-----------|---------------|
| Any `UNKNOWN_UNIT` warning on any step | Data integrity failure — at least one effect references a unit not in the scenario unit pool |
| Any `W3PFC_STEP_SKIP` warning | A step was silently dropped during copy — step sequence is incomplete |
| Any `W3PFC_ADAPTER_BLOCKED` warning | Adapter validation failed — fixture is structurally invalid |
| Any `W3PFC_ADAPTER_EXCEPTION` warning | Unhandled error in adapter — state is unknown |
| Step count ≠ 17 | W3 scenario has exactly 17 steps; any deviation is a source error |
| `buildW3PreviewFromLoadedScenario()` returns `passed: false` | Copy failed at source level — `w3json` is `null` |
| `adaptWargame3ToFixture()` returns `passed: false` | Adapter rejected the copied data |

### 8.2 Step-level blockers — block that step only

| Condition | Why it blocks the step |
|-----------|------------------------|
| Phase label empty | Cannot place step in operational timeline |
| Time label empty | Cannot correlate step with event sequence |
| Narrative empty in both EN and AR | No human-readable content to review |
| Zero effects across all three arrays (actors, affected, arcs) | Step has no operational content |
| Objective status not in `{DORMANT, THREATENED, CONTESTED, DENIED}` | Unknown/invalid status value |
| Objective status regresses from previous step | Data ordering error in source |
| Warning class is `sw-drp-warn-text` (orange) | Non-`MISSING_FIELD` warning present — must investigate before use |

### 8.3 What does NOT block

The following are **not** blockers and must not be treated as such:

- `selectedDecision` being `null` — expected; W3 is a source scenario, not a decision journal
- `expectedResult` being `null` — same reason
- `previewComplete` being `false` — this field is never set in preview; its `false` value is not a signal
- `MISSING_FIELD` warning code — informational only; expected on every step
- The nav hint "Preview only — live step unchanged" being visible — this is correct behaviour, not an error

---

## 9. What Is Safe to Copy / Report Later

The following elements of the W3 preview are safe to extract, copy, or include in
operator reports, because they are read-only source data with no simulation side effects.

### 9.1 Safe to copy directly

| Element | Source | Safe because |
|---------|--------|--------------|
| Full `w3json` object from `buildW3PreviewFromLoadedScenario()` | Deep copy of source | Independent of live scenario; `previewComplete`, `selectedDecision`, `expectedResult` are null throughout |
| Per-step narrative (EN and AR) | `steps[i].narrative_en_fallback` / `narrative_ar_fallback` | Plain text; no simulation state |
| Per-step phase and time label | `steps[i].phase` / `time_label` | Timeline metadata only |
| Per-step objective status | `steps[i].objective_status_baseline` | Source annotation; no applied effect |
| Per-step effects lists (actors, affected, arcs) | `steps[i].actors` / `affected` / `engagement_arcs` | Descriptive records; not applied to map or units |
| Warning codes and counts | Adapter and builder output | Data quality metadata only |
| Step total count (17) | `w3json.steps.length` | Structural metadata |

### 9.2 What must NOT be implied by the copy

Copying or reporting W3 preview data never implies:

- That any decision was approved or confirmed
- That any step has been adjudicated
- That any effect has been applied to the simulation
- That `previewComplete` is or will be `true`
- That the live `stepIndex` has advanced
- That any operator action is pending or required

All copied data must be labeled as **W3 reference scenario — preview read-only** in any
report or downstream document.

### 9.3 Recommended report format for a step

```
Step: W3-STEP-NN (N / 17)
Phase: <phase>  Time: <time_label>
Objective status: <status>
Narrative: <narrative_en_fallback>
Actors: <count> entries | Affected: <count> entries | Arcs: <count> entries
Warnings: <count> MISSING_FIELD (expected) | <count> other (investigate if > 0)
Decision: not recorded in source | Result: not recorded in source
Preview only — live step unchanged
```

---

## 10. What Must Never Become Automatic

The following must remain manual, explicit, and confirmed by an operator at all times.
They must never be triggered automatically by preview navigation, step rendering, or
any timer or threshold.

| Action | Why it must stay manual |
|--------|------------------------|
| Advancing `window.RmoozScenario.stepIndex` | Live scenario progression is an irreversible, high-stakes adjudication event |
| Setting `selectedDecision` on any step | Decisions require explicit operator judgment — they cannot be inferred from source data |
| Setting `expectedResult` on any step | Outcomes require context, doctrine, and adjudicator authority |
| Setting `previewComplete` to `true` | Completion is a human confirmation; `false` in source never auto-flips |
| Writing preview data to `localStorage` or any storage | Storage creates implicit state that can contaminate future sessions |
| Calling any `/api/sim/*` endpoint | Backend simulation state must only be mutated by deliberate operator action through the confirmed adjudication chain |
| Applying effects to the map | Unit positions, damage states, and engagement arcs in W3 are scenario projections — not adjudicated outcomes |
| Treating preview navigation as scenario navigation | The prev/next buttons move only a UI cursor; they must never become a proxy for `stepIndex` advancement |
| Triggering Gate 7 or any commit flow from preview | Gate 7 is the terminal safety gate before simulation commit; it must never be bypassed or pre-triggered |
| Auto-accepting W3 effects into the adjudication journal | Every journal entry requires explicit operator input |

---

## 11. Recommended PR-232

**PR-232 — Wargame 3 Preview Review Checklist UI Contract**  
Type: Documentation-only

The operator review checklist defined in §3 of this document currently exists only as
prose. A structured UI contract document would define the data shape that a future
checklist component would need to track operator review progress without touching live
simulation state.

### What PR-232 should define

1. **Per-step review record shape** — a plain object (never stored to `localStorage`
   or backend; held only in transient memory during review session) that records:
   - `stepRef`: `'W3-STEP-NN'`
   - `reviewedAt`: timestamp (session-local only)
   - `checklist`: `{ structural: bool, status: bool, effects: bool, warnings: bool, navIsolation: bool }`
   - `notes`: free-text operator annotation (optional)
   - `blockersFound`: `string[]` — any blocker conditions noted by operator

2. **Session review summary shape** — an object summarising all 17 steps:
   - `totalSteps`, `reviewedSteps`, `blockedSteps`
   - `allClear`: `boolean` — `true` only when all 17 steps reviewed with no blockers

3. **UI contract invariants** — rules any future component must follow:
   - Review records are **never** written to `localStorage`, `sessionStorage`, or any backend
   - Review records are **never** sent to `/api/sim/*`
   - `allClear: true` is **not** equivalent to, and must never trigger, `previewComplete: true`
   - Completing the checklist is **not** an apply/commit/confirm action
   - The contract must include an explicit "what this is not" section mirroring §2 of this document

4. **Rendering contract** — how a future checklist component would be positioned
   relative to `#sw-drp-section` without conflicting with the existing preview panel
   or the live scenario panel.

### Why this and not PR-232 as a Copy Summary Design

A checklist UI contract is the higher-priority next step because it defines the
**human review process** first. A copy summary format (alternative option) is
downstream of review — you cannot safely summarise what has not been reviewed and
confirmed. The checklist contract closes the loop between what the operator sees
(this document) and what a future UI could track.

---

## Safety Checklist

| Constraint | Status |
|---|---|
| Docs-only — no runtime code | ✅ |
| No UI changes | ✅ |
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
