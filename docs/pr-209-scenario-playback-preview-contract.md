# PR-209 — Scenario Playback Preview Contract

**Type:** Documentation only  
**Status:** Proposed  
**Depends on:** PR-208 (Scenario Dry-Run Test Plan)  
**Blocks:** PR-210 (Scenario Dry-Run Fixture Shape), PR-211 (Scenario Step Preview Builder)

> **This document is documentation only. No runtime changes are introduced. No playback engine is implemented. No unit is moved. No map is mutated. No scenario state is changed. No apply path exists.**

---

## 1. Purpose

Scenario playback preview is a future read-only mechanism for stepping through an imported scenario or decision package visually — without advancing the live scenario, mutating any unit, or producing any live effect on the map.

It serves a single goal: to let an operator or developer see **what RMOOZ understood** from a scenario package, one step at a time, and identify gaps before any apply path is considered.

Playback preview helps answer:

| Question | Expected answer source |
|---|---|
| What did RMOOZ understand? | Parsed step summary from the imported package |
| What happens in Step 1? | Situation + decision + action extracted from step data |
| What changes are proposed in Step 2? | Proposed effects extracted from the next step — display only |
| What is missing or ambiguous? | Missing-data warnings generated per field |
| Does the visual preview match the intended scenario? | Operator comparison against design intent |

This document defines:

- What playback preview is and is not.
- The future `ScenarioPlaybackPreview` display object (concept only, not implemented here).
- Step navigation rules.
- Visual effect preview rules.
- Missing-data behaviour.
- Approved and forbidden status labels.
- Hard boundaries.
- The recommended future PR sequence.

This document does **not**:

- Implement playback.
- Add UI, buttons, or cards.
- Create the `ScenarioPlaybackPreview` object.
- Move any unit.
- Mutate the map, scenario, or step index.
- Introduce any storage, fetch, or backend call.
- Introduce any apply path.

---

## 2. Playback Preview Definition

### Playback preview IS

| Action | Description |
|---|---|
| **Step-by-step display** | Show each step's parsed content one at a time, in sequence. |
| **Current step summary** | Display the full normalised content of the currently previewed step. |
| **Preview navigation** | Future: allow the operator to move to previous, next, or selected steps within the preview. Navigation is display-only — it does not change live state. |
| **Preview-only unit actions** | Show what units are expected to do in each step, as text descriptions or ghost annotations. No unit is moved. |
| **Preview-only map effects** | Describe expected map changes as visual estimates. Future implementations may render these as a separate non-persistent overlay layer. No live map layer is written. |
| **Missing-data warnings** | Collect and display warnings for any step field that is absent, empty, or unresolvable. |
| **Read-only status** | A persistent indicator confirming no live changes have occurred. |

### Playback preview IS NOT

| Forbidden action | Reason |
|---|---|
| Running the live scenario | Playback preview is a display layer only. It has no execution engine. |
| Moving real units | `window.units` must not be mutated. |
| Changing `window.RmoozScenario.stepIndex` | The live scenario step index must not advance during preview navigation. |
| Editing `window.units` | Any write to the live unit array is forbidden. |
| Editing `window.lines` | Any write to the live line array is forbidden. |
| Writing to the map | No `L.marker`, `L.polyline`, `L.layer`, or any Leaflet write on the live map layer. |
| Committing decisions | No commit path. `/api/sim/*` is forbidden. |
| Applying actions | No apply path. Gate 7 does not exist. |
| Calling simulation APIs | No fetch, XHR, or WebSocket to any backend. |

---

## 3. Future Playback State Concept

### `ScenarioPlaybackPreview` — display object

The following is a **future concept only**. It is not implemented in this PR and is not approved for implementation until PR-211 is accepted.

This object is a **temporary, display-only, in-memory object**. It holds parsed preview data for the currently previewed step. It does not hold live references to scenario state, unit arrays, or map objects.

```js
// Future concept — not implemented — not approved
{
  packageId:              string,        // from the imported package manifest
  packageName:            string,        // display name
  activeStepId:           string,        // step_id of the currently previewed step
  activeStepIndex:        number,        // 0-based index of the current step in the steps array
  totalSteps:             number,        // total number of steps in the package
  stepSummary:            string,        // short human-readable summary of the current step
  situation:              string|null,   // situation field from the step
  decision:               string|null,   // selected_decision field from the step
  unitsReferenced:        array,         // list of { uid, resolved: boolean, displayName } entries
  objectivesReferenced:   array,         // list of { id, description, clear: boolean } entries
  proposedVisualEffects:  array,         // list of { type, description, unitUid|null } — text only
  missingDataWarnings:    string[],      // warnings for absent or unresolvable fields
  safety: {
    readOnly:             true,          // hard-locked
    liveMutationAllowed:  false,         // hard-locked
    noLiveMapWrite:       true,          // hard-locked
    noStepIndexMutation:  true           // hard-locked
  },
  readOnly:               true,          // hard-locked — top-level mirror
  liveMutationAllowed:    false          // hard-locked — top-level mirror
}
```

### Field rules

| Field | Rule |
|---|---|
| `packageId` | Must match the imported package `manifest.package_id`. Non-empty. |
| `activeStepId` | Must match a `step_id` in the steps array. Non-empty. |
| `activeStepIndex` | Must be a valid 0-based index into the steps array. |
| `totalSteps` | Must equal the number of steps in the package. |
| `unitsReferenced` | Entries must not hold live references to `window.units[i]`. UIDs are strings. Resolution is boolean only. |
| `objectivesReferenced` | Entries must not auto-fill absent objectives. `clear: false` if objective is absent or ambiguous. |
| `proposedVisualEffects` | Entries are text descriptions only. No coordinates from live objects. No live map references. |
| `missingDataWarnings` | Must be an array. Populated per missing field. Must not be empty when any required field is absent. |
| `readOnly` | Must be exactly `true`. Never `false`, `null`, or absent. |
| `liveMutationAllowed` | Must be exactly `false`. Never `true`, `null`, or absent. |
| `safety.noLiveMapWrite` | Must be exactly `true`. Confirms no map layer was written. |
| `safety.noStepIndexMutation` | Must be exactly `true`. Confirms `window.RmoozScenario.stepIndex` was not changed. |

### What this object is not

- It is not an apply instruction. None of its fields trigger any action.
- It is not a persistence object. It must not be serialised.
- It is not a network payload. It must not be sent anywhere.
- It is not a live snapshot. It must not hold references to `window.units`, `window.lines`, or any live mutable array.
- It is not a staging state. It is separate from and independent of the `StagingState` pipeline.

---

## 4. Step Navigation Rules

Future preview navigation allows an operator to move between steps within the playback preview. The following rules govern all navigation behaviour.

### Permitted navigation actions

| Action | Description |
|---|---|
| **First step** | Load step at index 0 into the preview display. Update `activeStepId` and `activeStepIndex`. |
| **Previous step** | Load step at `activeStepIndex - 1`. No-op if already at index 0. |
| **Next step** | Load step at `activeStepIndex + 1`. No-op if already at the last step. |
| **Selected step** | Load a specific step by `step_id` or index, chosen by the operator from the step timeline. |

### Navigation constraints

| Constraint | Rule |
|---|---|
| `window.RmoozScenario.stepIndex` | Must not be mutated by any navigation action. Preview navigation is entirely separate from live scenario state. |
| Imported package data | Must not be mutated. The package steps array is read-only. |
| Map layer | Must not be written during navigation. Moving to a new step does not update the live map. |
| `window.units` | Must not be mutated during navigation. |
| Live progress implied | Navigation must not display "Step 2 complete" or any language implying live execution has occurred. |
| Apply triggered | Navigation must not trigger any apply or commit action. Reaching the last step does not imply all steps have been executed. |

### Navigation and step index separation

The live scenario step index (`window.RmoozScenario.stepIndex`) represents the current state of the running simulation. The preview's `activeStepIndex` is a local display variable only. They are independent. A future implementation must ensure there is no code path that copies `activeStepIndex` into `window.RmoozScenario.stepIndex` or vice versa.

---

## 5. Visual Effect Preview Rules

Future visual preview effects allow an operator to see a non-binding, non-persistent visual estimate of what a step proposes — without those visuals being applied to the live map.

### Permitted effect types

| Effect type | Description |
|---|---|
| **Ghost unit movement** | A visual indicator (e.g. faded marker or dashed arrow) showing where a unit is expected to move. Must be visually distinct from live unit markers. |
| **Projected arrows** | Direction arrows showing expected movement vectors. Must not use live unit coordinates from `window.units`. |
| **Highlighted objectives** | Visual highlight on an objective area. Must be on a separate non-persistent overlay layer. |
| **Warning badges** | Badges or icons on step elements that have missing or unresolvable data. |
| **Proposed control areas** | Polygon or area indicators showing expected friendly or enemy control at the end of a step. |
| **Expected result markers** | Markers indicating the expected outcome location or state. |

### Effect constraints

| Constraint | Rule |
|---|---|
| **Visually distinct** | All preview effects must be visually distinguishable from live map objects (e.g. different colour, opacity, style, or layer). An operator must never confuse a preview effect with a live unit's actual position. |
| **Removable** | All preview effects must be removable by clearing the preview or navigating away. No effect persists after the preview session ends. |
| **Non-persistent** | No effect is written to `localStorage`, `sessionStorage`, `IndexedDB`, or any other store. |
| **Not stored** | No effect object is serialised or saved. |
| **Not committed** | No effect is committed to the scenario or the backend. |
| **Not treated as unit state** | A ghost marker is never a unit. A projected arrow does not represent a unit's actual position. |
| **Separate layer only** | Future map effects must be rendered on a dedicated preview overlay layer, not the live unit layer or line layer. The live map layers must remain unmodified. |
| **Text-only in early PRs** | Until a dedicated overlay layer is implemented and reviewed, all proposed visual effects must be text descriptions only (in `proposedVisualEffects`), not rendered on the map at all. |

---

## 6. Missing-Data Behaviour

When a step lacks required or expected fields, the following rules govern how the preview handles the absence.

| Rule | Behaviour |
|---|---|
| **Show a warning** | Every missing field must generate a labelled warning in `missingDataWarnings`. The warning must name the field and describe what was expected. |
| **Do not guess** | Missing values must not be filled with defaults, estimates, or AI-generated content. |
| **Do not invent units** | If `units` is empty or absent, no units are shown. The warning states that units are missing. |
| **Do not invent coordinates** | If a unit UID cannot be resolved to a position, no position is displayed or estimated. |
| **Do not auto-fill objectives** | If `objectives` is absent, the objective field shows empty with a warning. |
| **Do not auto-select a decision** | If `selected_decision` is absent or does not match any available option, no decision is shown as selected. |
| **Do not mark as ready** | A step with missing required fields must never display a "ready" or "complete" status. |
| **Show "Missing data" label** | The step must display the approved "Missing data" label (see §7) and remain in a non-ready state. |

### Required fields for a step to be preview-complete

A step is considered **preview-complete** only when all of the following are present and non-empty:

- `step_id`
- `situation`
- `selected_decision`
- `units` (at least one entry)
- `objectives` (at least one entry)
- `action`
- `expected_result`
- `safety_flags` (at least one entry)

A step missing any of the above is **preview-incomplete**. It may still be displayed, but must carry a "Missing data" or "Not ready" label and list all absent fields.

---

## 7. Read-Only Status Labels

The following labels are approved for use in the playback preview UI. Future PR-212 must use only these labels for read-only status indicators.

### Approved labels

| Label | Usage |
|---|---|
| `Preview only` | Primary read-only status indicator. Shown at all times during playback preview. |
| `Dry-run preview` | Alternative read-only label for the preview session header. |
| `No live changes` | Persistent footer or badge confirming no mutation has occurred. |
| `Missing data` | Applied to any step or field where required data is absent. |
| `Not ready` | Applied to a step that is preview-incomplete (missing one or more required fields). |
| `Read-only` | Secondary label confirming display-only mode. |
| `Visual estimate` | Applied to any effect or display element that is derived from incomplete data and may not be accurate. |
| `Requires review` | Applied to any element that needs operator attention before it could be used in a real plan. |

### Forbidden labels

The following labels must **never** appear in the playback preview UI. Their presence implies live execution or mutation and is a hard block on any future PR-212 review.

| Forbidden label | Reason |
|---|---|
| `Apply` | Implies live mutation. Forbidden until Gate 7 is approved. |
| `Commit` | Implies backend write. Forbidden unconditionally. |
| `Execute` | Implies live execution. Forbidden unconditionally. |
| `Run live` | Implies live simulation run. Forbidden unconditionally. |
| `Save` | Implies persistence. Forbidden — no storage. |
| `OK` | Ambiguous confirmation label. Forbidden in any playback context. |
| `Yes` | Ambiguous confirmation label. Forbidden in any playback context. |
| `Confirm` | Implies Gate 7 step. Forbidden until Gate 7 is approved. |
| `Deploy` | Implies live deployment. Forbidden unconditionally. |
| `Push to map` | Implies live map mutation. Forbidden unconditionally. |

---

## 8. Hard Boundaries

The playback preview must **never** do any of the following, regardless of step content, operator input, or navigation state:

| Forbidden action | Boundary |
|---|---|
| Call `/api/sim/*` | Hard forbidden. No fetch, XHR, or WebSocket to any simulation API. |
| Mutate the map | Hard forbidden. No write to any live Leaflet layer, marker, or polygon. |
| Mutate `window.units` | Hard forbidden. Any write to the live unit array is unconditionally blocked. |
| Mutate `window.lines` | Hard forbidden. Any write to the live line array is unconditionally blocked. |
| Mutate `window.RmoozScenario` | Hard forbidden. The live scenario object must not be written. |
| Advance the live scenario step | Hard forbidden. `window.RmoozScenario.stepIndex` must not change during preview. |
| Persist playback state | Hard forbidden. No serialisation to any storage API. |
| Export or download playback state | Hard forbidden. No file write, ZIP, or file-picker interaction. |
| Auto-approve AI output | Hard forbidden. No AI-driven advancement of preview state. |
| Unlock Gate 7 | Hard forbidden. Playback preview reaching the last step does not imply Gate 7 readiness. |
| Create apply controls | Hard forbidden. No apply button, commit button, confirm button, or equivalent. |

These boundaries apply to this document and to all future PRs that implement any part of the playback preview pipeline (PR-210 through PR-213 and beyond).

---

## 9. Future PR Sequence

| PR | Type | Description |
|---|---|---|
| **PR-210** | Documentation or pure fixture | **Scenario Dry-Run Fixture Shape** — defines the controlled fixture format for the first dry-run test. Either a documentation of the fixture schema or a small committed fixture file with 3–5 steps. No runtime changes. |
| **PR-211** | Pure JS | **Scenario Step Preview Builder** — `buildScenarioStepPreview(step, options)` pure function. Takes a normalised step object and returns a `ScenarioPlaybackPreview`-shaped display object. No storage, no map mutation, no `window.units` access, no network calls. |
| **PR-212** | Runtime (read-only) | **Scenario Dry-Run Preview UI** — display-only card or panel wired to the output of `buildScenarioStepPreview`. Shows all approved display elements from §5 and §7. No apply controls. No step-index mutation. Confirmed no live changes. |
| **PR-213** | Test | **Test One Scenario Package** — run the first controlled fixture (PR-210) through the PR-211 builder and the PR-212 display. Record all missing-data warnings. Confirm preview-only behaviour. Document importer gaps discovered. |
| **Later** | Correction | **Scenario format corrections** — based on PR-213 test results. Fix fixture format, importer normalisation assumptions, or schema field mappings as needed. |

No PR in this sequence may introduce an apply path, advance live scenario state, create staging state, or write to any storage or backend.

---

## 10. Safety Checklist

- [ ] Purpose stated: read-only visual playback, no playback engine, no apply path (§1)
- [ ] Playback preview IS defined with 7 allowed actions (§2)
- [ ] Playback preview IS NOT defined with 9 forbidden actions (§2)
- [ ] Future `ScenarioPlaybackPreview` shape documented with all fields and rules (§3)
- [ ] Shape is concept-only — not implemented, not approved (§3)
- [ ] Shape explicitly is NOT apply instruction, persistence object, network payload, live snapshot, or staging state (§3)
- [ ] Step navigation: 4 permitted actions defined (§4)
- [ ] Step navigation: 6 constraints defined, including `stepIndex` separation rule (§4)
- [ ] Visual effects: 6 permitted effect types defined (§5)
- [ ] Visual effects: 7 constraints defined, including text-only rule for early PRs (§5)
- [ ] Missing-data: 8 rules defined — no guessing, no inventing, no auto-filling (§6)
- [ ] Preview-complete field list stated: 8 required fields (§6)
- [ ] 8 approved read-only labels listed (§7)
- [ ] 10 forbidden labels listed with reasons (§7)
- [ ] 11 hard boundary conditions stated (§8)
- [ ] Hard boundaries apply to PR-210 through PR-213 (§8)
- [ ] Future PR sequence: PR-210 through PR-213 plus corrections (§9)
- [ ] No runtime code introduced
- [ ] No UI introduced
- [ ] No playback implemented
- [ ] No unit moved
- [ ] No map mutated
- [ ] No staging state created
- [ ] No storage used
- [ ] No fetch or backend
- [ ] No apply path
- [ ] Gate 7 remains forbidden
- [ ] Staging-state expansion remains paused
- [ ] `app.js` / `adjudicator-map.js` untouched
