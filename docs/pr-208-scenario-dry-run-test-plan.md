# PR-208 — Scenario Dry-Run Test Plan

**Type:** Documentation only  
**Status:** Proposed  
**Depends on:** PR-207 (`isStagingStateSafe` Type Guard)  
**Blocks:** PR-209 (Scenario Playback Preview Contract)

> **This document is documentation only. No runtime changes are introduced. No scenario is executed. No unit is moved. No map is mutated. No staging state is created. No apply path exists.**

---

## 1. Purpose

Through PR-196–207 we built a complete chain of pure type guards and safety contracts covering snapshots, operator identity, and staging state. All of that work is read-only; it validates structure but does not exercise real scenario content.

We are now moving from abstract safety guards to **practical scenario understanding**. The goal of this PR sequence is to take one controlled scenario package and test it as a read-only dry-run preview — to find out whether RMOOZ correctly reads, parses, and displays scenario steps, decisions, units, and objectives before any apply path exists.

This document defines:

- What "dry-run scenario" means and does not mean.
- The first safe scenario test flow.
- The test object (controlled package shape).
- What the dry-run must answer.
- A scenario readiness checklist.
- The visual preview concept for future display.
- Hard boundaries that the dry-run must never cross.
- The recommended future PR sequence.
- The explicit pause on staging-state expansion.

This document does **not**:

- Implement scenario playback.
- Implement a dry-run engine.
- Move any unit.
- Add any map overlay.
- Add any button, card, or UI.
- Create staging state.
- Approve any apply path.

---

## 2. What "Dry-Run Scenario" Means

### Dry-run IS

| Action | Description |
|---|---|
| **Read** | Read scenario data from an imported decision package or a controlled fixture. |
| **Parse** | Normalize step structure — identify step ID, situation, decision, units, objectives, action, counter-action, safety flags. |
| **Display** | Show what RMOOZ thinks will happen at each step, as a read-only preview only. |
| **Step preview** | Show step-by-step preview — current step, next step, expected outcome — without advancing state. |
| **Effect preview** | Show proposed unit movement and decision effects as preview annotations only. |
| **Compare** | Allow the operator to compare the expected preview against their intended scenario design. |
| **Report gaps** | Show warnings for missing fields, unresolvable UIDs, unclear objectives, ambiguous decisions. |

### Dry-run IS NOT

| Forbidden action | Reason |
|---|---|
| Moving real units | `window.units` must not be mutated. |
| Changing map state | Map must not be mutated. |
| Advancing `window.RmoozScenario.stepIndex` | Scenario state must not change. |
| Applying decisions | No apply path exists. Gate 7 is forbidden. |
| Committing changes | No commit path. `/api/sim/*` is forbidden. |
| Saving changes | No storage. No `localStorage`, `sessionStorage`, `IndexedDB`. |
| Calling backend simulation APIs | No fetch, XHR, or WebSocket to `/api/sim/*`. |
| Auto-approving AI output | No automatic advancement of any state. |
| Converting preview to apply | Preview and apply are strictly separated. |

---

## 3. First Scenario Test Flow

The following flow defines how the first dry-run scenario test proceeds. Every step in this flow is **read-only and display-only**.

### Step A — Choose test package

Select one scenario package or one imported decision package as the test object. Use the controlled fixture defined in §4. Do not use a live or production scenario for the first test.

### Step B — Read and normalise steps

Load the package. Read its `steps` array. For each step, extract:

- `step_id` — unique identifier
- `situation` — current tactical situation description
- `selected_decision` — the decision selected for this step
- `units` — referenced unit UIDs or unit descriptions
- `objectives` — what the step is trying to achieve
- `action` — the proposed friendly action
- `counter_action` — the expected adversary response
- `safety_flags` — any flags that gate the step
- `expected_result` — what a successful step looks like
- `source_trace` — where this step data came from (package field, fixture, or operator input)

Flag any field that is missing, empty, or ambiguous. Do not guess values — record gaps as warnings.

### Step C — Show Step 1 as preview

Display Step 1's full parsed content as a read-only card or preview panel. Show:

- Step identifier and label
- Situation summary
- Selected decision
- Units involved (by UID or name)
- Objectives
- Proposed action
- Expected counter-action
- Safety flags
- Expected result

### Step D — Show expected units, actions, and objectives

For each referenced unit in Step 1, show:

- Whether the UID can be resolved against the current unit list
- What the unit's expected movement or role is in this step
- Whether the unit's state is consistent with the scenario's assumption

Show all of this as preview annotations. Do not move or modify any unit.

### Step E — Show what RMOOZ cannot understand

For each step field that RMOOZ cannot parse or resolve:

- Show a clearly labelled warning row.
- Name the field.
- State what was expected and what was found.
- Do not fill in missing data with guesses.

### Step F — Show warnings and missing fields

Collect all warnings from Steps B–E into a visible summary. Group by:

- **Missing required field** — field not present in package
- **Unresolvable UID** — unit UID not found in current unit list
- **Ambiguous decision** — decision field present but not matched to a known option
- **Missing objective** — objective field absent or empty
- **Missing safety flag** — safety flags array absent or empty
- **Unknown field** — field present in package but not recognised by importer

### Step G — Move to Step 2 preview only

Without advancing any state, load Step 2 and repeat Steps C–F. Step 1 preview must remain accessible and unchanged. No state is carried forward automatically.

### Step H — Compare tactical sense

At each step, enable the operator to make a manual comparison:

- Does the situation match what the scenario is supposed to describe?
- Does the selected decision match the intended tactical option?
- Do the units match what is shown on the map?
- Does the expected result make tactical sense given the situation?

Record the comparison result as operator notes (display only — not stored).

### Step I — Record structure problems

At the end of the dry-run test, produce a structured list of all problems found:

- Missing fields per step
- Unresolvable UIDs per step
- Ambiguous decisions per step
- Steps that cannot be previewed at all

This list is the input for the next round of scenario format or importer fixes.

### Step J — Fix scenario format or importer assumptions

Based on the problem list from Step I, identify which problems are:

- **Scenario format problems** — the scenario package needs to be updated.
- **Importer assumption problems** — `adaptDecisionPackageFixture` or the step normaliser is making incorrect assumptions.
- **Schema problems** — the expected field names do not match the actual package format.

Fix the lowest-cost problems first. A fix is: update the fixture, update the importer normalisation logic, or update the schema mapping. No live scenario is changed during testing.

### Step K — Repeat

Return to Step A with the corrected fixture or importer. Repeat until the dry-run of all steps in the test package produces no blocking warnings.

---

## 4. Test Object

The first dry-run scenario test must use a **controlled fixture package** — not a production scenario and not a live import. The controlled fixture must satisfy the following constraints:

| Constraint | Value |
|---|---|
| **Step count** | 3 to 5 steps maximum |
| **Units** | Known unit UIDs — pre-defined in the fixture, not sourced from live `window.units` |
| **Objectives** | Clearly stated per step — no ambiguous or absent objectives |
| **Decision options** | Known and named — at least two options per step, one marked as selected |
| **Expected outcome** | Defined per step — what a successful step looks like |
| **Map effects** | Small number — at most 2–3 unit movements or position changes per step, described as text only |
| **Live mutation** | None — the fixture does not reference or modify any live object |
| **Safety flags** | Present and non-empty — at least one flag per step |
| **Source trace** | Present on every field — every value must be traceable to a fixture key |

### Why a controlled fixture first

A controlled fixture eliminates ambiguity about whether a dry-run warning is caused by a bad scenario design or a bad importer. With a fully known package, any warning is an importer or schema problem, not a scenario problem.

Only after the controlled fixture runs clean should the dry-run be attempted on a real imported scenario package.

---

## 5. What the Dry-Run Must Answer

At the end of the dry-run test, the following questions must have clear answers:

| Question | Pass condition |
|---|---|
| Did RMOOZ read the step correctly? | All required fields parsed without error. |
| Did it identify the situation? | `situation` field extracted and displayed. |
| Did it identify the selected decision? | `selected_decision` matched to a known option. |
| Did it identify the units? | All referenced UIDs resolved or flagged with a warning. |
| Did it identify the objectives? | `objectives` field extracted and non-empty. |
| Did it understand the action and counter-action? | `action` and `counter_action` both extracted and displayed. |
| Did it show what is missing? | All missing fields listed as warnings, not silently filled. |
| Did the visual preview match the intended scenario? | Operator confirms preview is consistent with scenario design intent. |
| Did the preview remain read-only? | No mutation of `window.units`, `window.lines`, `window.RmoozScenario`, or map. |

---

## 6. Scenario Readiness Checklist

Before a step can be considered dry-run-ready, all of the following must be true:

| Field | Rule |
|---|---|
| `step_id` | Present and non-empty. Must be unique within the package. |
| `situation` | Present and non-empty. Must be a readable description, not a placeholder. |
| `selected_decision` | Present and non-empty. Must match one of the available decision options. |
| `safety_flags` | Present. Must be a non-empty array. Must not all be `false`. |
| `units` | Present. Must be a non-empty array. All UIDs must be resolvable or explicitly flagged. |
| `objectives` | Present and non-empty. Must describe what the step is trying to achieve. |
| `action` | Present and non-empty. Must describe the friendly action. |
| `counter_action` | Present or explicitly noted as unknown. Must not be silently omitted. |
| `expected_result` | Present and non-empty. Must describe a recognisable success condition. |
| `source_trace` | Present on all fields. Every value must be traceable to a package field or fixture key. |
| **Missing data** | Must be shown as a labelled warning. Must not be guessed or auto-filled. |

A step that fails any of the above checklist items is **not dry-run-ready**. It must be repaired before it can be included in a dry-run test.

---

## 7. Visual Dry-Run Preview Concept

The following describes the **future display only**. No UI is introduced in this PR. This section defines what a future Scenario Dry-Run Preview UI (PR-212) should display.

### Display elements

| Element | Description |
|---|---|
| **Step timeline** | A horizontal or vertical list of all steps, with the current step highlighted. Read-only. Clicking a step changes the preview — it does not advance scenario state. |
| **Current step card** | A card showing all parsed fields for the current step. All fields are display-only. |
| **Situation summary** | The `situation` field displayed at the top of the step card. |
| **Units involved** | A list of all referenced units with resolution status (resolved / unresolved / warning). |
| **Decision selected** | The `selected_decision` field displayed prominently. Available options shown below for comparison. |
| **Expected action** | The `action` field — what friendly forces are expected to do in this step. |
| **Counter-action** | The `counter_action` field — expected adversary response. If absent, a warning is shown. |
| **Preview-only map effect** | A text description of the expected unit movements or position changes. Not rendered on the live map. Future PR may add a separate read-only overlay canvas. |
| **Missing data warnings** | A dedicated warning section listing all missing or unresolvable fields for the current step. |
| **"No live changes" status** | A persistent status indicator confirming that the preview has not mutated any live state. |

### Display rules

- All elements are display-only. No element triggers a live action.
- The step timeline does not call `window.RmoozScenario.stepIndex = n` or any equivalent.
- Unit resolution is display-only — it does not modify `window.units`.
- The preview-only map effect section is a text description, not a map mutation.
- The "No live changes" status must remain visible at all times during the dry-run preview.

---

## 8. Hard Boundaries

The dry-run scenario preview must **never** do any of the following, regardless of the step content or operator input:

| Forbidden action | Boundary |
|---|---|
| Mutate `window.units` | Hard forbidden. Dry-run reads units; it does not write them. |
| Mutate `window.lines` | Hard forbidden. |
| Mutate the map | Hard forbidden. No `L.marker`, `L.polyline`, or any Leaflet mutation on the live map layer. |
| Mutate the real scenario | Hard forbidden. `window.RmoozScenario` must not be written. |
| Advance `window.RmoozScenario.stepIndex` | Hard forbidden. Step navigation in the dry-run preview does not change the live scenario step index. |
| Call `/api/sim/*` | Hard forbidden. No fetch, XHR, or WebSocket to any simulation API. |
| Store scenario state | Hard forbidden. No `localStorage`, `sessionStorage`, `IndexedDB`, cookie, file, or network write. |
| Auto-approve AI output | Hard forbidden. No automatic advancement, no AI-triggered step completion. |
| Convert preview to apply | Hard forbidden. The preview and the apply path are strictly separated. A preview can never become an apply without explicit Gate 7 approval, which does not exist yet. |

These boundaries apply to all future dry-run PRs (PR-209 through PR-213) and to any test harness built for this purpose.

---

## 9. Future PR Sequence

| PR | Type | Description |
|---|---|---|
| **PR-209** | Documentation | **Scenario Playback Preview Contract** — defines the data contract for a step-by-step scenario preview, including the normalised step shape, field rules, warning generation rules, and the interface between the preview builder and the display layer. |
| **PR-210** | Documentation or pure fixture | **Scenario Dry-Run Fixture Shape** — defines the controlled fixture format for the first dry-run test. Either a pure documentation of the fixture schema or a small committed fixture file. No runtime changes. |
| **PR-211** | Pure JS | **Scenario Step Preview Builder** — `buildScenarioStepPreview(step, options)` pure function. Returns a read-only preview object for one step. No storage, no map mutation, no window writes. |
| **PR-212** | Runtime (read-only only) | **Scenario Dry-Run Preview UI** — display-only card or panel showing the preview output of `buildScenarioStepPreview`. No apply controls. No step-index mutation. No live changes. |
| **PR-213** | Test | **Test One Scenario Package** — run the first controlled fixture through the PR-211 builder and PR-212 display. Record all warnings. Confirm preview-only behaviour. Document importer gaps. |

Each PR in this sequence must pass the hard boundaries in §8. No PR in this sequence may introduce an apply path, advance scenario state, or create staging state.

---

## 10. Explicit Pause

The following work is **explicitly paused** as of this PR:

| Topic | Status |
|---|---|
| **Staging-state implementation** | Paused. `buildStagingState()` does not exist. No `_swStagingState` variable exists. PR-209 (Clear/Reset Staging State Design — previously planned) is renamed and repurposed as the Scenario Playback Preview Contract above. |
| **Clear/reset staging state design** | Deferred. The `clearStagingState()` design document is not being written at this time. It remains a pre-requirement for any future staging-state builder, but staging-state builders are not on the immediate roadmap. |
| **Gate 7 UI** | Forbidden. Gate 7 UI must not exist until controlled staging state, real operator identity, real checklist evaluation, rollback plan, and security review have all been explicitly approved in separate PRs. None of these exist yet. |
| **Apply path** | Forbidden. No apply button, commit button, confirm button, or any mechanism that converts a preview into a live change. |

**We are now focusing on scenario understanding and dry-run preview.** The goal is to exercise the full pipeline — importer → step normaliser → preview builder → display — against a real scenario package, confirm that RMOOZ reads it correctly, and discover any structural problems before any apply path is considered.

---

## 11. Safety Checklist

- [ ] Purpose stated: practical scenario dry-run testing, not staging-state expansion (§1)
- [ ] Dry-run IS defined with 7 allowed actions (§2)
- [ ] Dry-run IS NOT defined with 9 forbidden actions (§2)
- [ ] First test flow defined in 11 steps A–K (§3)
- [ ] Each flow step is read-only or display-only (§3)
- [ ] Controlled fixture constraints defined: 3–5 steps, known units, known decisions, no live mutation (§4)
- [ ] Reason for controlled fixture first stated (§4)
- [ ] 9 dry-run test questions defined with pass conditions (§5)
- [ ] Scenario readiness checklist: 11 fields with rules (§6)
- [ ] Missing data rule: warnings only, never guessed (§6)
- [ ] Visual preview concept defined: 9 display elements (§7)
- [ ] Display rules: all display-only, no stepIndex mutation, no unit write (§7)
- [ ] Hard boundaries: 9 forbidden actions stated (§8)
- [ ] Hard boundaries apply to PR-209 through PR-213 (§8)
- [ ] Future PR sequence: PR-209 through PR-213 defined with types and descriptions (§9)
- [ ] Explicit pause: staging-state implementation, clear/reset design, Gate 7 UI, apply path (§10)
- [ ] No runtime code introduced
- [ ] No UI introduced
- [ ] No scenario executed
- [ ] No unit moved
- [ ] No map mutated
- [ ] No staging state created
- [ ] No storage used
- [ ] No fetch or backend
- [ ] No apply path
- [ ] `app.js` / `adjudicator-map.js` untouched
