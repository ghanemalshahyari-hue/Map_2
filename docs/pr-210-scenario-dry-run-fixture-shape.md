# PR-210 — Scenario Dry-Run Fixture Shape

**Type:** Documentation + pure fixture file  
**Status:** Proposed  
**Depends on:** PR-209 (Scenario Playback Preview Contract)  
**Blocks:** PR-211 (Scenario Step Preview Builder)

> **This document is documentation only. The accompanying fixture file (`scenario-dry-run-fixtures.js`) contains static data only — no functions, no DOM access, no map access, no runtime wiring. Neither file introduces runtime changes, UI, mutation, storage, or any apply path.**

---

## 1. Fixture Purpose

The controlled dry-run fixture is a tiny, fully self-contained fictional training scenario used exclusively to test whether RMOOZ can correctly parse, normalise, and preview scenario steps.

It is not a real scenario. It is not operationally significant. It is not connected to any live simulation, backend, or stored state.

### What the fixture enables

| Goal | How the fixture enables it |
|---|---|
| Test step parsing | Each step has a fully defined shape that the PR-211 builder can consume. |
| Test missing-data warnings | Intentional gaps in specific steps trigger warning paths without guessing. |
| Test unit resolution | Unit UIDs are pre-defined; resolution is checked against the fixture's own unit list, not `window.units`. |
| Test objective handling | Objectives are pre-defined; ambiguous references produce warnings, not auto-fills. |
| Test read-only enforcement | Every field carries `readOnly: true` and `liveMutationAllowed: false`. |
| Test preview completeness | Some steps are preview-complete; others are intentionally incomplete for warning coverage. |

### What the fixture is not

- It is not a production scenario.
- It is not connected to `window.units`, `window.lines`, or `window.RmoozScenario`.
- It is not stored, exported, or transmitted.
- It is not a staging state.
- It is not an apply instruction.

---

## 2. Fixture Constraints

| Constraint | Value |
|---|---|
| Steps | 4 (within the 3–5 maximum) |
| Friendly units | 4 |
| Enemy units | 3 |
| Objectives | 2 |
| Starting situation | Known — fictional recon-force movement to contact |
| Selected decision per step | Known for Steps 1, 3, 4; intentionally absent in Step 2 (warning test) |
| Expected result per step | Defined for Steps 1, 3, 4; intentionally incomplete in Step 2 (warning test) |
| Missing-data fields | Intentionally included: one unit with null coordinate; Step 2 missing decision; Step 3 ambiguous objective reference; Step 3 incomplete counter-action |
| Live mutation | None |
| Map writes | None |
| Backend calls | None |
| `window.units` access | None |
| `window.RmoozScenario` access | None |

---

## 3. Top-Level Fixture Shape

A fixture object has the following top-level fields:

```js
{
  fixtureId:              string,   // unique identifier for this fixture
  fixtureName:            string,   // human-readable display name
  description:            string,   // short description of the fixture's purpose
  sourceType:             string,   // always "dry_run_fixture"
  readOnly:               true,     // hard-locked
  liveMutationAllowed:    false,    // hard-locked
  packageId:              string,   // package_id used when adapting via the importer
  packageName:            string,   // display name for the preview header
  units:                  object[],  // array of unit objects (§4)
  objectives:             object[],  // array of objective objects (§5)
  steps:                  object[],  // array of step objects (§6)
  expectedWarnings:       object[],  // array of { stepId, field, warningType } — test expectations
  expectedPreviewResults: object[],  // array of { stepId, previewComplete: boolean, notes } — test expectations
  safety:                 object    // fixture-level safety flags (§7)
}
```

### Field rules

| Field | Rule |
|---|---|
| `fixtureId` | Non-empty string. Must be unique. Must not be `'auto'` or `'temp'`. |
| `sourceType` | Must be exactly `"dry_run_fixture"`. Must not be `"live"`, `"production"`, or any simulation source. |
| `readOnly` | Must be exactly `true`. |
| `liveMutationAllowed` | Must be exactly `false`. |
| `units` | Non-empty array. All entries must conform to the unit shape (§4). |
| `objectives` | Non-empty array. All entries must conform to the objective shape (§5). |
| `steps` | Non-empty array. All entries must conform to the step shape (§6). Length must be 3–5. |
| `expectedWarnings` | Array. May be empty if no warnings are expected, but the first fixture must include at least 3 expected warning entries. |
| `expectedPreviewResults` | Array. Must have one entry per step. |
| `safety` | Must conform to the safety shape (§7). All flags must be set. |

---

## 4. Unit Shape

Each unit in `fixture.units` must have the following shape:

```js
{
  uid:           string,         // unique unit ID within this fixture
  name:          string,         // display name
  side:          string,         // "friendly" | "enemy" | "neutral"
  type:          string,         // unit type description (e.g. "infantry", "recon", "fire_support")
  echelon:       string,         // e.g. "platoon", "company", "team"
  role:          string,         // tactical role in this scenario (e.g. "main_effort", "supporting_effort")
  startLocation: object|null,    // { description: string, lat: number|null, lng: number|null }
  aliases:       string[],       // alternative names or UIDs that might appear in step text
  readOnly:      true            // hard-locked
}
```

### Unit field rules

| Field | Rule |
|---|---|
| `uid` | Non-empty string. Must be unique within the fixture. Must not match any `window.units[i].id` — fixture UIDs are deliberately namespaced. |
| `side` | Must be one of `"friendly"`, `"enemy"`, `"neutral"`. |
| `startLocation` | May be `null`. If `null`, the preview builder must generate a missing-coordinate warning. If present, `lat` and `lng` may individually be `null` if the location is only descriptive. |
| `aliases` | Array. May be empty. Used during step text normalisation to resolve informal unit names to UIDs. |
| `readOnly` | Must be exactly `true`. |

---

## 5. Objective Shape

Each objective in `fixture.objectives` must have the following shape:

```js
{
  objectiveId:   string,       // unique objective ID within this fixture
  name:          string,       // display name (e.g. "OBJ RIDGE")
  type:          string,       // "seize" | "secure" | "suppress" | "bypass" | "observe"
  location:      object|null,  // { description: string, lat: number|null, lng: number|null }
  desiredEffect: string,       // what achieving this objective accomplishes
  readOnly:      true          // hard-locked
}
```

### Objective field rules

| Field | Rule |
|---|---|
| `objectiveId` | Non-empty string. Must be unique within the fixture. |
| `type` | Must be one of the defined types above. |
| `location` | May be `null`. If `null`, the preview builder must generate a missing-location warning on any step that references this objective. |
| `desiredEffect` | Non-empty string. Must describe the operational result of achieving this objective. |
| `readOnly` | Must be exactly `true`. |

---

## 6. Step Shape

Each step in `fixture.steps` must have the following shape:

```js
{
  step_id:             string,       // unique step identifier
  stepIndex:           number,       // 0-based index in the steps array
  title:               string,       // short human-readable step title
  situation:           string|null,  // current tactical situation description
  selectedDecision:    string|null,  // the decision chosen for this step (null = missing data test)
  friendlyActions:     object[],     // array of { uid, action: string }
  enemyCounterActions: object[],     // array of { uid, counterAction: string }
  unitsReferenced:     string[],     // array of unit UIDs from fixture.units
  objectivesReferenced:string[],     // array of objectiveIds from fixture.objectives
  expectedResult:      string|null,  // what a successful step looks like (null = missing data test)
  missingDataExpected: string[],     // list of field names expected to produce warnings
  safety:              object        // step-level safety flags (§7)
}
```

### Step field rules

| Field | Rule |
|---|---|
| `step_id` | Non-empty string. Must be unique within the fixture. |
| `stepIndex` | Must be a valid 0-based integer. Must match the step's position in the `steps` array. |
| `situation` | Non-empty string for most steps. May be `null` only if listed in `missingDataExpected`. |
| `selectedDecision` | Non-empty string for most steps. May be `null` only if listed in `missingDataExpected`. |
| `friendlyActions` | Array. Each entry references a `uid` from `fixture.units`. The `action` field is a text description. Must not reference `window.units`. |
| `enemyCounterActions` | Array. Each entry references a `uid` from `fixture.units`. The `counterAction` field is a text description. May be empty for missing-data tests. |
| `unitsReferenced` | Array of UIDs. All UIDs must be present in `fixture.units`. |
| `objectivesReferenced` | Array of `objectiveId` values. All IDs must be present in `fixture.objectives` — an ID not found in `fixture.objectives` is an ambiguous reference and must produce a warning. |
| `expectedResult` | Non-empty string for most steps. May be `null` only if listed in `missingDataExpected`. |
| `missingDataExpected` | Array of field names. Documents which fields are intentionally absent in this step, so test assertions can verify warnings were generated. |
| `safety` | Must conform to the safety shape (§7). |

---

## 7. Safety Shape

Every fixture, step, and — for future builders — every preview output must carry a safety block:

```js
{
  dryRunOnly:              true,   // this object exists only for dry-run preview
  previewOnly:             true,   // this object must never trigger a live action
  liveMutationAllowed:     false,  // no live unit or scenario write
  backendCommitAllowed:    false,  // no /api/sim/* or any backend call
  mapMutationAllowed:      false,  // no write to live map layers
  unitMutationAllowed:     false,  // no write to window.units
  scenarioMutationAllowed: false   // no write to window.RmoozScenario
}
```

All 7 fields must be present. All booleans must be exactly the values shown. A safety block with any `true` in the "allowed: false" fields is a hard failure.

---

## 8. Sample Scenario Concept — Exercise AMBER RIDGE

The first controlled fixture uses a fictional, non-sensitive, generic training scenario called **Exercise AMBER RIDGE**.

### Scenario premise

Blue force (Alpha Company) is conducting a movement-to-contact reconnaissance toward a suspected enemy blocking position at a high-ground feature designated RIDGE. Blue must identify the enemy position, then choose between three courses of action: hold and observe, probe for a gap, or bypass east via a stream crossing designated FORD.

This scenario is entirely fictional. It contains no real-world sensitive tactics, no classified doctrine, and no operationally actionable detail. It is designed to test RMOOZ's ability to parse steps, resolve units, and display decisions — not to represent any real operation.

### Units

**Friendly (Blue):**

| UID | Name | Type | Echelon | Role | Start location |
|---|---|---|---|---|---|
| `BLU-RECON-01` | 1st Recon Platoon | recon | platoon | main_effort | Grid AMBER-A (approx.) |
| `BLU-INF-01` | Alpha Company 1st Platoon | infantry | platoon | supporting_effort | Grid AMBER-B (approx.) |
| `BLU-FST-01` | Mortar Section | fire_support | team | fire_support | Grid AMBER-B (co-located with 1 Pl) |
| `BLU-HQ-01` | Alpha Company HQ | command | company | command | **null — intentional missing coordinate** |

**Enemy (Red):**

| UID | Name | Type | Echelon | Role | Start location |
|---|---|---|---|---|---|
| `RED-DEF-01` | Enemy Blocking Force | infantry | platoon | defend | Vicinity OBJ RIDGE |
| `RED-OBS-01` | Enemy Forward Observer | observer | team | observe | High ground north of RIDGE |
| `RED-MOB-01` | Enemy Mobile Reserve | motorised | platoon | counter-attack | **null — intentional missing coordinate** |

### Objectives

| ID | Name | Type | Desired effect |
|---|---|---|---|
| `OBJ-RIDGE` | RIDGE | seize | Neutralise enemy blocking force; secure high-ground feature |
| `OBJ-FORD` | FORD | secure | Secure eastern stream crossing for bypass route |

---

## 9. Expected Warning Cases

The following warnings must be generated by the PR-211 preview builder when processing this fixture. These entries populate `fixture.expectedWarnings` and define the test assertions for PR-213.

| Step | Field | Warning type | Reason |
|---|---|---|---|
| Any step referencing `BLU-HQ-01` | `startLocation` | `MISSING_COORDINATE` | `BLU-HQ-01.startLocation` is `null` |
| Any step referencing `RED-MOB-01` | `startLocation` | `MISSING_COORDINATE` | `RED-MOB-01.startLocation` is `null` |
| Step 2 | `selectedDecision` | `MISSING_FIELD` | `selectedDecision` is `null` in Step 2 |
| Step 2 | `expectedResult` | `MISSING_FIELD` | `expectedResult` is `null` in Step 2 |
| Step 3 | `objectivesReferenced` | `AMBIGUOUS_OBJECTIVE` | Step 3 references `OBJ-FORD` which is not the primary objective for that phase — ambiguous reference requires operator review |
| Step 3 | `enemyCounterActions` | `INCOMPLETE_FIELD` | `enemyCounterActions` is an empty array in Step 3 |

---

## 10. Expected Preview Outputs

The following defines what RMOOZ should produce when running each step through the PR-211 builder. These entries populate `fixture.expectedPreviewResults`.

| Step | Preview complete? | Expected display | Notes |
|---|---|---|---|
| Step 1 | **Yes** | Situation, decision, friendly action, enemy counter-action, objective reference — all shown | No warnings. All fields present. |
| Step 2 | **No** | Situation shown; decision: "Missing data" label; expected result: "Missing data" label; `RED-OBS-01` action shown | 2 missing-field warnings. Step marked "Not ready". |
| Step 3 | **Partial** | Situation, decision, friendly actions shown; counter-action: "Missing data" label; `OBJ-FORD` reference shown with "Requires review" label | 2 warnings: incomplete counter-action, ambiguous objective. Step marked "Requires review". |
| Step 4 | **Yes (with coordinate warning)** | All fields shown; `BLU-HQ-01` unit shows "Missing coordinate" warning | 1 warning. Step considered preview-complete for structural fields; coordinate warning is non-blocking. |

---

## 11. Hard Boundaries

The fixture and all code that consumes it must **never**:

| Forbidden action | Boundary |
|---|---|
| Mutate `window.units` | The fixture defines its own unit list. It must not write to the global unit array. |
| Mutate the map | No `L.marker`, `L.polyline`, or map write of any kind. |
| Mutate the real scenario | `window.RmoozScenario` must not be read from or written to by the fixture or its consumer. |
| Advance `window.RmoozScenario.stepIndex` | The fixture's `stepIndex` field is a display-only index. It must not be assigned to the live scenario step index. |
| Call the backend | No fetch, XHR, or WebSocket. No `/api/sim/*`. |
| Trigger apply | No apply, commit, or execute path. |
| Create map overlays | No overlay layers until a dedicated preview overlay PR is approved. |
| Store state | No serialisation to `localStorage`, `sessionStorage`, `IndexedDB`, or any other persistent store. |

---

## 12. Future PR Sequence

| PR | Type | Description |
|---|---|---|
| **PR-211** | Pure JS | **Scenario Step Preview Builder** — `buildScenarioStepPreview(step, fixture, options)` pure function. Consumes a step from the fixture, resolves unit and objective references within the fixture's own unit/objective lists, generates missing-data warnings, and returns a `ScenarioPlaybackPreview`-shaped display object. No map access. No `window.units` access. No storage. |
| **PR-212** | Runtime (read-only) | **Scenario Dry-Run Preview UI** — display-only panel showing the output of `buildScenarioStepPreview`. All elements from PR-209 §5 and §7. No apply controls. No step-index mutation. |
| **PR-213** | Test | **Test One Scenario Package** — run the Exercise AMBER RIDGE fixture through the PR-211 builder and PR-212 display. Assert all 6 expected warnings appear. Assert preview-complete steps show without warnings. Assert no live changes. |
| **PR-214+** | Correction | **Scenario structure corrections** — based on PR-213 results. Fix fixture format, importer assumptions, or schema field mappings. Only after PR-213 is complete. |

---

## 13. Safety Checklist

- [ ] Fixture purpose stated: fictional training scenario, importer/parser testing only (§1)
- [ ] Fixture is not a production scenario and not connected to any live object (§1)
- [ ] Fixture constraints documented: 4 steps, 4 friendly + 3 enemy units, 2 objectives (§2)
- [ ] Top-level fixture shape defined with field rules (§3)
- [ ] `sourceType: "dry_run_fixture"` required — no `"live"` or `"production"` values (§3)
- [ ] Unit shape defined with field rules (§4)
- [ ] `startLocation: null` rule stated — preview must generate warning (§4)
- [ ] Fixture UIDs explicitly namespaced away from `window.units` UIDs (§4)
- [ ] Objective shape defined with field rules (§5)
- [ ] Step shape defined with field rules (§6)
- [ ] `missingDataExpected` field defined — documents intentional gaps (§6)
- [ ] Safety shape defined: 7 fields, all must be present and correct (§7)
- [ ] Sample scenario concept defined: fictional, generic, non-sensitive (§8)
- [ ] `BLU-HQ-01` and `RED-MOB-01` have null coordinates — warning test (§8)
- [ ] 6 expected warning cases defined with step, field, type, reason (§9)
- [ ] 4 expected preview output rows defined (§10)
- [ ] 8 hard boundary conditions stated (§11)
- [ ] Future PR sequence PR-211 through PR-214+ defined (§12)
- [ ] No runtime code introduced in this doc
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
