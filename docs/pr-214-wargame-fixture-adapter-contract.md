# PR-214 — Wargame Fixture Adapter Contract

**Type:** Documentation only — adapter contract  
**Status:** Proposed  
**Depends on:** PR-213 (Wargame Scenario Readiness Audit), PR-211 (`buildScenarioStepPreview`), PR-210 (Fixture Shape)  
**Blocks:** PR-215 (`adaptWargame3ToFixture` implementation)

> **This document is documentation only. No runtime code is introduced or modified. No files are parsed into RMOOZ. No map, unit, scenario, or global state is touched. The contract defined here is a specification for a future pure JS function. All examples shown are pseudocode — they are not executable and do not exist in any RMOOZ source file.**

---

## 1. Purpose

PR-213 confirmed that Wargame 3 (`wargame3.json`) is the strongest candidate for the first real wargame dry-run preview test. It has per-step actor arrays, per-step affected arrays, per-step engagement arcs, full narrative text, and per-step coordinates for all 150+ units. Its critical gap is that `decision_point_baseline` is `null` for all 17 steps — but the preview builder already handles this correctly by generating `MISSING_FIELD` warnings.

This PR defines the formal contract for a pure adapter function:

```
adaptWargame3ToFixture(w3json)
```

The adapter takes a full parsed Wargame 3 JSON object and returns a fixture object conforming to the AMBER RIDGE fixture shape (PR-210 §3). The returned fixture can be passed directly to `buildScenarioStepPreview` without modification.

### What this contract enables

| Goal | How this contract enables it |
|---|---|
| First real wargame dry-run preview | Converts W3's rich per-step data into the fixture shape `buildScenarioStepPreview` already consumes |
| No schema changes to the builder | The adapter absorbs all W3-specific field mappings; the builder remains unmodified |
| Clear audit trail | All mapping rules are documented here before any code is written |
| Predictable warning output | The contract pre-declares all 17 steps will produce at least 2 `MISSING_FIELD` warnings |
| Safety by design | Adapter hard-locks all safety flags; consuming code cannot bypass them |

### What this contract is not

- It is not an implementation. No code is written in this PR.
- It is not a live import path. The adapter produces an in-memory fixture object — no file I/O, no fetch, no storage.
- It is not a staging state. The output fixture may only be passed to `buildScenarioStepPreview` for read-only preview.
- It is not a batch importer. The contract covers one W3 JSON object → one fixture object.
- It does not touch `window.units`, `window.lines`, `window.RmoozScenario`, or the map.

---

## 2. Input Shape

The adapter accepts a single argument: `w3json`, the full parsed Wargame 3 JSON object.

### Required top-level fields

| Field | Type | Description | Required |
|---|---|---|---|
| `w3json.red_units` | `object[]` | Array of RED unit identity objects | Yes |
| `w3json.blue_units_initial` | `object[]` | Array of BLUE unit identity objects | Yes |
| `w3json.red_unit_step_coords` | `object` | Map of `uid → [lat, lng][]` (per-step positions, RED) | Yes |
| `w3json.blue_unit_step_coords` | `object` | Map of `uid → [lat, lng][]` (per-step positions, BLUE) | Yes |
| `w3json.steps` | `object[]` | Array of 17 step objects | Yes |
| `w3json.obj` | `object` | Top-level primary objective | Yes |
| `w3json.scenario_label` | `string` | Human-readable scenario name | Yes |
| `w3json.ported_from` | `string` | Source identifier | Yes |
| `w3json.name` | `string` | Internal scenario name | Yes |

### `w3json.red_units[]` item shape (from wargame3-schema.md)

| Field | Type | Notes |
|---|---|---|
| `uid` | `string` | Stable unique identifier across all phases |
| `echelon` | `string` | `div`/`bde`/`bn`/`coy`/`sqn`/`flot` → adapter maps to canonical values |
| `sidc` | `string` | 20-char NATO SIDC |
| `coord` | `[lon, lat]` | Unit's home/start position (GeoJSON convention: longitude first) |
| `name_ar` | `string` | Arabic unit name — no `name_en` in W3 JSON |
| `label` | `string` | Truncated short label derived from `name_ar` |
| `domain` | `string` | `strategic`/`naval`/`air`/`ground`/`sof` |

> **Note:** BLUE units in `w3json.blue_units_initial[]` use `unit_uid` (not `uid`) as their identifier field. The adapter must handle both. All other fields have the same names.

### `w3json.red_unit_step_coords` shape

```
{
  "<uid>": [
    [lat_step0, lng_step0],   // stepIndex 0
    [lat_step1, lng_step1],   // stepIndex 1
    ...                        // 17 entries total
  ],
  ...
}
```

> **Note on coordinate convention:** Per-step coord arrays in `wargame3.json` are stored as `[lat, lng]` (latitude first), which differs from GeoJSON's `[lon, lat]`. The adapter must read these as `[lat, lng]` — no swap required for these arrays. The unit's home `coord` in `red_units[].coord` follows GeoJSON convention `[lon, lat]` and does require swapping.

### `w3json.steps[]` item shape (relevant fields)

| Field | Type | Notes |
|---|---|---|
| `index` | `number` | 0-based step index (0–16) |
| `phase` | `string` | Legacy phase enum: `PRE-H`, `PHASE 1`, `PHASE 2A`, `PHASE 2B`, `PHASE 3`, `RESOLUTION` |
| `time_label` | `string` | e.g. `D-7`, `D-H`, `D+12h` |
| `phase_name_ar` | `string` | Arabic phase name |
| `narrative_en_fallback` | `string` | English situation narrative (present all 17 steps) |
| `narrative_ar_fallback` | `string` | Arabic situation narrative |
| `decision_point_baseline` | `null` | **Null for all 17 W3 steps — confirmed in PR-213 audit** |
| `actors[]` | `object[]` | Per-step actor narratives (4–16 per step) |
| `affected[]` | `object[]` | Per-step affected unit records (1–11 per step) |
| `engagement_arcs[]` | `object[]` | Per-step engagement arc records (3–12 per step) |
| `objective_status_baseline` | `object` | Map of `objectiveId → status` (e.g. `"DORMANT"`, `"ACTIVE"`) |
| `step_advantage` | `string` | `RED_ADV` or `BLUE_ADV` |

### `w3json.steps[n].actors[]` item shape

| Field | Type | Notes |
|---|---|---|
| `uid` | `string` | Unit UID (matches `red_units[].uid` or `blue_units_initial[].unit_uid`) |
| `side` | `string` | `BLUE` or `RED` |
| `action_component` | `string` | Domain/arm: `strategic`/`maritime`/`air`/`mines`/`usv_uav`/`sof`/`land`/`ew` |
| `action_what` | `string` | 1–2 sentence action description — maps to `friendlyActions[].action` or `enemyCounterActions[].counterAction` |
| `action_why` | `string` | Doctrinal reasoning |
| `action_intended_effect` | `string` | Operational effect intended |
| `action_doctrine_cited` | `string[]` | Doctrine references — used for source_trace |

### `w3json.obj` shape

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Objective identifier (e.g. `"OBJ-COAST"`) |
| `name` | `string` | English display name |
| `coord` | `[lon, lat]` | GeoJSON convention — lon first |
| `target_depth_km` | `number` | Depth from coast |

---

## 3. Output Shape

The adapter must return a fixture object that fully conforms to the AMBER RIDGE fixture shape (PR-210 §3). The output must be passable directly to `buildScenarioStepPreview(fixture, stepRef, options)` without modification.

### Required output fields

```js
{
  fixtureId:              string,    // "wargame3-fixture-v1"
  fixtureName:            string,    // from w3json.name
  description:            string,    // "Adapted from Wargame 3 — dry-run preview only"
  sourceType:             string,    // "wargame3_adapted"
  readOnly:               true,      // hard-locked by adapter
  liveMutationAllowed:    false,     // hard-locked by adapter
  packageId:              string,    // from w3json.ported_from
  packageName:            string,    // from w3json.scenario_label
  units:                  object[],  // 17 entries — see §4
  objectives:             object[],  // 1+ entries — see §5
  steps:                  object[],  // 17 entries — see §6
  expectedWarnings:       object[],  // pre-declared warnings — see §8
  expectedPreviewResults: object[],  // 17 entries — see §9
  safety:                 object     // hard-locked safety block — see §7
}
```

> **`sourceType` value:** The AMBER RIDGE fixture uses `"dry_run_fixture"`. The W3 adapter output uses `"wargame3_adapted"` to distinguish its origin. The builder accepts any non-empty `sourceType` string — it does not gate on this field.

---

## 4. Unit Mapping Rules

The adapter must build a flat `fixture.units[]` array from both `w3json.red_units[]` and `w3json.blue_units_initial[]`.

### Rule U1 — Process red units first, then blue units

Iterate `w3json.red_units[]` first (side assignment: `"enemy"`), then `w3json.blue_units_initial[]` (side assignment: `"friendly"`). Preserve source order within each array.

### Rule U2 — UID field name differs between RED and BLUE

- RED unit identifier: `unit.uid`
- BLUE unit identifier: `unit.unit_uid`
- The adapter must use `unit.uid || unit.unit_uid` to extract the canonical UID for both arrays.
- The extracted UID is stored in `fixture.units[i].uid`.

### Rule U3 — Unit display name: use `label` then fall back to `uid`

W3 JSON has no `name_en` field. The adapter must use:
1. `unit.label` if present and non-empty
2. `unit.uid` as fallback

The unit's Arabic name (`unit.name_ar`) must not be used as the display name for the `name` field (it is for AR display only). A separate `nameAr` field may optionally be preserved but is not part of the fixture unit shape.

### Rule U4 — Side assignment

| Source array | `fixture.units[i].side` |
|---|---|
| `w3json.red_units[]` | `"enemy"` |
| `w3json.blue_units_initial[]` | `"friendly"` |

### Rule U5 — Unit type from `sidc` or `domain`

The adapter must not call any SIDC decoder. Set `fixture.units[i].type` to `unit.domain` if present (e.g. `"ground"`, `"air"`, `"naval"`), or `"unknown"` if absent.

### Rule U6 — Echelon normalisation

W3 echelon values use abbreviated forms. The adapter must normalise:

| W3 value | Fixture value |
|---|---|
| `div` | `"division"` |
| `bde` | `"brigade"` |
| `bn` | `"battalion"` |
| `coy` | `"company"` |
| `sqn` | `"squadron"` |
| `flot` | `"flotilla"` |
| `plt` or `plat` | `"platoon"` |
| `tm` or `team` | `"team"` |
| (other / absent) | `"unknown"` |

### Rule U7 — `role` field: use `"unknown"` (W3 JSON has no per-unit role)

W3 JSON does not have a per-unit doctrinal role. Set `fixture.units[i].role = "unknown"` for all units. A future annotation can override this.

### Rule U8 — `startLocation` from Step 0 coordinates

The unit's start location is its position at `stepIndex = 0`:

1. For RED units: look up `w3json.red_unit_step_coords[uid]` — if present and `[0]` is a `[lat, lng]` pair, set `startLocation = { description: uid + " — step 0", lat: coords[0], lng: coords[1] }`.
2. For BLUE units: look up `w3json.blue_unit_step_coords[uid]` — same logic.
3. If the coord array for the unit is absent, or if `coords[0]` is `null` or `undefined`, set `startLocation = null`.
4. A `null` startLocation will cause the builder to generate a `MISSING_COORDINATE` warning for any step that references that unit.

> **Coordinate array convention reminder:** `red_unit_step_coords[uid][0]` is `[lat, lng]` (latitude first). Assign `lat = coords[0]`, `lng = coords[1]`.

### Rule U9 — `aliases`: empty array for all units

W3 JSON provides no unit aliases. Set `fixture.units[i].aliases = []`. The preview builder will resolve unit references by UID only.

### Rule U10 — `readOnly`: hard-locked to `true` for all units

Every unit output by the adapter must carry `readOnly: true`. This is the adapter's unconditional responsibility.

### Rule U11 — Unit count assertion (informational)

After mapping, the fixture should contain approximately 150 units (70 RED + 80 BLUE based on PR-213 audit). If the count is outside the range [100, 200], the adapter should include a warning in the top-level `expectedWarnings` noting the count anomaly. This is not a hard failure.

---

## 5. Objective Mapping Rules

### Rule OBJ1 — Build from `w3json.obj` first

The W3 JSON `obj` object represents the scenario's primary objective. The adapter must create one fixture objective from it:

```
{
  objectiveId:   w3json.obj.id,
  name:          w3json.obj.name,
  type:          "seize",         // default — W3 does not specify objective type
  location:      {
    description: w3json.obj.name,
    lat:         w3json.obj.coord[1],   // GeoJSON: lon at [0], lat at [1]
    lng:         w3json.obj.coord[0]
  },
  desiredEffect: "Seize primary objective — derived from W3 scenario",
  readOnly:      true
}
```

> **GeoJSON coordinate swap:** `w3json.obj.coord` is `[lon, lat]` (GeoJSON convention). The adapter must assign `lat = coord[1]` and `lng = coord[0]`.

### Rule OBJ2 — Additional objectives from `step.objective_status_baseline`

Some W3 steps reference additional objective IDs in `step.objective_status_baseline`. The adapter must collect all unique objective IDs across all 17 steps and create a minimal fixture objective for any ID not already covered by Rule OBJ1:

```
{
  objectiveId:   "<id from objective_status_baseline key>",
  name:          "<id>",          // ID used as name — no display name available in JSON
  type:          "seize",         // default
  location:      null,            // no coordinates available from JSON alone
  desiredEffect: "Derived from W3 step objective status — no effect text available",
  readOnly:      true
}
```

A `null` location means the builder will generate a `MISSING_COORDINATE` warning for any step that references this objective. This is expected and correct.

### Rule OBJ3 — No GeoJSON objective join required for contract compliance

The W3 GeoJSON step files (`Wargame3/step00.geojson` etc.) contain richer objective data. However, those files are server-side assets not loaded into the browser client. The adapter must not attempt to join them. The above minimal objectives are sufficient for dry-run preview.

---

## 6. Step Mapping Rules

The adapter must produce 17 fixture step objects from `w3json.steps[]` (indices 0–16).

### Rule S1 — `step_id`: derive from step index

```
fixture.steps[i].step_id = "W3-STEP-" + String(step.index).padStart(2, "0")
```

Examples: `"W3-STEP-00"`, `"W3-STEP-01"`, ..., `"W3-STEP-16"`.

### Rule S2 — `stepIndex`: copy from `step.index`

```
fixture.steps[i].stepIndex = step.index
```

Must be an integer 0–16. The adapter must verify this is a valid non-negative integer.

### Rule S3 — `title`: combine `phase` and `time_label`

```
fixture.steps[i].title = step.phase + " — " + step.time_label
```

Example: `"PHASE 1 — D-7"`, `"PHASE 2A — D+12h"`, `"RESOLUTION — D+144h"`.

### Rule S4 — `situation`: use `narrative_en_fallback`

```
fixture.steps[i].situation = step.narrative_en_fallback || null
```

PR-213 audit confirmed `narrative_en_fallback` is present for all 17 W3 steps. If for any reason it is absent, set `null` and add `"situation"` to `missingDataExpected`.

### Rule S5 — `selectedDecision`: always `null` for W3 (confirmed in PR-213)

```
fixture.steps[i].selectedDecision = null
```

`decision_point_baseline` is `null` for all 17 W3 steps. The adapter must not attempt to derive a synthetic decision from other fields. Set `null` and include `"selectedDecision"` in `missingDataExpected` for every step.

> **Rationale for not synthesising a decision:** Synthesising a decision from `step_advantage` or a dominant actor's `action_what` would produce a value that looks like an operator decision but is not one. The preview builder already handles null decisions correctly — it shows a "Missing data" label and sets `previewComplete: false`. This is the correct behaviour for W3 data in its current form.

### Rule S6 — `friendlyActions[]`: filter actors by `side === 'BLUE'`

```
fixture.steps[i].friendlyActions = step.actors
  .filter(actor → actor.side === 'BLUE')
  .map(actor → {
    uid:    actor.uid,
    action: actor.action_what
  })
```

The resulting array may have 2–10 entries depending on the step. An empty array means no BLUE actors are present — this is legitimate for some steps and must not be treated as an error.

### Rule S7 — `enemyCounterActions[]`: filter actors by `side === 'RED'`

```
fixture.steps[i].enemyCounterActions = step.actors
  .filter(actor → actor.side === 'RED')
  .map(actor → {
    uid:          actor.uid,
    counterAction: actor.action_what
  })
```

The builder requires `enemyCounterActions` to be non-empty for `previewComplete: true`. Since `selectedDecision` is always null (Rule S5), `previewComplete` will always be `false` for all W3 steps regardless — so an empty `enemyCounterActions` is an additional gap but does not change the overall preview status.

### Rule S8 — `unitsReferenced[]`: union of actor and affected UIDs

```
var actorUids    = step.actors.map(a → a.uid)
var affectedUids = step.affected.map(a → a.uid)
fixture.steps[i].unitsReferenced = deduplicated_union(actorUids, affectedUids)
```

All UIDs in this list must be present in `fixture.units`. If a UID is found in `step.actors[]` or `step.affected[]` that does not appear in `fixture.units`, the builder will generate an `UNKNOWN_UNIT` warning. The adapter should add such UIDs to `expectedWarnings` if they are predictable (e.g. off-map markers not in the unit arrays).

### Rule S9 — `objectivesReferenced[]`: from `step.objective_status_baseline` keys

```
fixture.steps[i].objectivesReferenced = Object.keys(step.objective_status_baseline || {})
```

This produces an array of objective IDs. The builder will attempt to resolve each against `fixture.objectives`. IDs not found will generate `UNKNOWN_OBJECTIVE` or `AMBIGUOUS_OBJECTIVE` warnings. The adapter must ensure Rule OBJ2 has pre-built objectives for all IDs that appear across all steps.

### Rule S10 — `expectedResult`: always `null` for W3

```
fixture.steps[i].expectedResult = null
```

No W3 source field provides a per-step expected result. Set `null` and include `"expectedResult"` in `missingDataExpected` for every step.

### Rule S11 — `missingDataExpected[]`: pre-declare known gaps

For every W3 step, the following fields will produce warnings. The adapter must pre-declare them:

```
fixture.steps[i].missingDataExpected = ["selectedDecision", "expectedResult"]
```

If `narrative_en_fallback` is absent for a step, additionally include `"situation"`.

### Rule S12 — `safety`: hard-lock step-level safety block

Every step must carry a safety block with all 7 flags at their required values. See §7.

---

## 7. Safety Injection Rules

### Rule SF1 — Top-level fixture safety block (hard-locked)

The adapter must attach the following safety block to the returned fixture object. These values are not derived from `w3json` — they are asserted unconditionally by the adapter:

```js
{
  dryRunOnly:              true,
  previewOnly:             true,
  liveMutationAllowed:     false,
  backendCommitAllowed:    false,
  mapMutationAllowed:      false,
  unitMutationAllowed:     false,
  scenarioMutationAllowed: false
}
```

### Rule SF2 — Step-level safety block (same values, every step)

Each step in `fixture.steps[]` must carry an identical safety block. The builder validates step safety independently of fixture safety.

### Rule SF3 — `readOnly: true` on fixture, all units, all objectives, all steps

Every object produced by the adapter carries `readOnly: true`. This is separate from the safety block. The builder checks `fixture.readOnly` at Rule 2.

### Rule SF4 — `liveMutationAllowed: false` on fixture

The builder checks `fixture.liveMutationAllowed` at Rule 3. The adapter must set this field at the top level regardless of what `w3json` contains.

### Rule SF5 — `Object.freeze()` in implementation

When `adaptWargame3ToFixture` is implemented in PR-215, the output fixture and all nested objects must be wrapped in `Object.freeze()` before being returned. This is a contract requirement, not an option.

---

## 8. Hard Boundaries

The following boundaries apply to the adapter function and to any code that calls it. They are permanently locked:

| Boundary | Reason |
|---|---|
| The adapter must not read `window.units` | Adapter resolves UIDs against `w3json` arrays only — never the live unit registry |
| The adapter must not write to any global | Adapter must be a pure function — input in, fixture object out |
| The adapter must not read `window.RmoozScenario` | Scenario state is independent of adapter output |
| The adapter must not mutate `w3json` | Input must be treated as read-only; adapter must copy all values, never mutate |
| The adapter must not call `/api/sim/*` or any network endpoint | Pure in-memory transformation only |
| The adapter must not access the DOM | No `document.*` calls |
| The adapter must not access `localStorage` or `sessionStorage` | No persistence |
| The adapter output must never be applied to the live scenario | The returned fixture is for `buildScenarioStepPreview` only — not for loading, committing, or staging |
| The adapter must not load `Wargame3/*.geojson` files | Per-step GeoJSON files are not available to the client; adapter uses JSON-embedded coords only |
| `window.RmoozScenario.stepIndex` must not be read or written | The preview builder's `activeStepIndex` and the live `stepIndex` are permanently independent |

---

## 9. Expected Warning Summary

The following warnings are expected across all 17 W3 steps after adaptation. These populate `fixture.expectedWarnings[]` in the output fixture.

### Per-step warnings (guaranteed)

Every step will produce:

| Warning type | Field | Reason | Steps affected |
|---|---|---|---|
| `MISSING_FIELD` | `selectedDecision` | `decision_point_baseline` is `null` for all W3 steps | All 17 (indices 0–16) |
| `MISSING_FIELD` | `expectedResult` | No per-step expected result exists in W3 JSON | All 17 (indices 0–16) |

**Minimum guaranteed warning count: 34 warnings** (2 per step × 17 steps).

### Conditional warnings (step-dependent)

| Warning type | Field | Condition | Estimated steps |
|---|---|---|---|
| `MISSING_COORDINATE` | `startLocation` | Unit appears in step's `unitsReferenced` but its Step 0 coordinate is null or a placeholder | 0–5 (depends on W3 coordinate completeness) |
| `INCOMPLETE_FIELD` | `enemyCounterActions` | Step has 0 RED actors in `actors[]` | 0–3 (rare — most steps have RED actors) |
| `UNKNOWN_UNIT` | `unitsReferenced` | A UID in `actors[]` or `affected[]` is not in `fixture.units` (e.g. off-map markers) | TBD in PR-215 test run |
| `UNKNOWN_OBJECTIVE` | `objectivesReferenced` | A key from `objective_status_baseline` was not pre-built in Rule OBJ2 | TBD — depends on key coverage |

### `expectedWarnings[]` format in output fixture

Each entry in the output `fixture.expectedWarnings[]` must follow the shape:

```js
{
  stepId:      string,   // e.g. "W3-STEP-00"
  field:       string,   // e.g. "selectedDecision"
  warningType: string    // e.g. "MISSING_FIELD"
}
```

---

## 10. Expected Preview Results Summary

The following table defines what `fixture.expectedPreviewResults[]` must contain for all 17 W3 steps.

| Step index | Step ID | `previewComplete` | Reason |
|---|---|---|---|
| 0 | `W3-STEP-00` | `false` | `selectedDecision` is null; `expectedResult` is null |
| 1 | `W3-STEP-01` | `false` | Same |
| 2 | `W3-STEP-02` | `false` | Same |
| 3 | `W3-STEP-03` | `false` | Same |
| 4 | `W3-STEP-04` | `false` | Same |
| 5 | `W3-STEP-05` | `false` | Same |
| 6 | `W3-STEP-06` | `false` | Same |
| 7 | `W3-STEP-07` | `false` | Same |
| 8 | `W3-STEP-08` | `false` | Same |
| 9 | `W3-STEP-09` | `false` | Same |
| 10 | `W3-STEP-10` | `false` | Same |
| 11 | `W3-STEP-11` | `false` | Same |
| 12 | `W3-STEP-12` | `false` | Same |
| 13 | `W3-STEP-13` | `false` | Same |
| 14 | `W3-STEP-14` | `false` | Same |
| 15 | `W3-STEP-15` | `false` | Same |
| 16 | `W3-STEP-16` | `false` | Same |

**All 17 steps produce `previewComplete: false`.** This is correct behaviour. The preview builder shows what it knows (situation, actions, counter-actions, units, objectives) and flags what is missing (decision, result). The preview is informative and structurally valid despite being incomplete.

Each `expectedPreviewResults[]` entry has the shape:

```js
{
  stepId:          string,    // e.g. "W3-STEP-00"
  previewComplete: false,
  notes:           string     // e.g. "Missing: selectedDecision, expectedResult"
}
```

---

## 11. Contract Pseudo-code

The following is a specification-level pseudo-code description of `adaptWargame3ToFixture`. It is **not executable code**. It defines the structure and sequencing of the implementation that PR-215 will write.

```
FUNCTION adaptWargame3ToFixture(w3json):

  // --- Validation (fail fast) ---
  ASSERT w3json is non-null object (not array)
  ASSERT w3json.red_units is non-empty array
  ASSERT w3json.blue_units_initial is non-empty array
  ASSERT w3json.steps is non-empty array of length >= 1
  ASSERT w3json.red_unit_step_coords is object
  ASSERT w3json.blue_unit_step_coords is object
  IF any assertion fails: return { passed: false, fixture: null, blockedReasons: [...], warnings: [] }

  // --- Safety block (built once, used everywhere) ---
  DEFINE safetyBlock = {
    dryRunOnly: true, previewOnly: true,
    liveMutationAllowed: false, backendCommitAllowed: false,
    mapMutationAllowed: false, unitMutationAllowed: false,
    scenarioMutationAllowed: false
  }

  // --- Unit mapping (Rules U1–U11) ---
  DEFINE units = []
  FOR EACH u IN w3json.red_units:
    uid = u.uid
    stepCoords = w3json.red_unit_step_coords[uid]
    startCoord = (stepCoords && stepCoords[0]) ? stepCoords[0] : null
    PUSH units ← {
      uid:           uid,
      name:          u.label || uid,
      side:          "enemy",
      type:          u.domain || "unknown",
      echelon:       normaliseEchelon(u.echelon),
      role:          "unknown",
      startLocation: startCoord ? { description: uid+" — step 0", lat: startCoord[0], lng: startCoord[1] } : null,
      aliases:       [],
      readOnly:      true
    }
  FOR EACH u IN w3json.blue_units_initial:
    uid = u.unit_uid || u.uid
    stepCoords = w3json.blue_unit_step_coords[uid]
    startCoord = (stepCoords && stepCoords[0]) ? stepCoords[0] : null
    PUSH units ← {
      uid:           uid,
      name:          u.label || uid,
      side:          "friendly",
      type:          u.domain || "unknown",
      echelon:       normaliseEchelon(u.echelon),
      role:          "unknown",
      startLocation: startCoord ? { description: uid+" — step 0", lat: startCoord[0], lng: startCoord[1] } : null,
      aliases:       [],
      readOnly:      true
    }

  // Build UID set for reference validation
  DEFINE uidSet = Set of all unit.uid in units

  // --- Objective mapping (Rules OBJ1–OBJ3) ---
  DEFINE objectives = []
  DEFINE objIdSet   = new Set()

  // Primary objective from w3json.obj (Rule OBJ1)
  IF w3json.obj:
    PUSH objectives ← {
      objectiveId:   w3json.obj.id,
      name:          w3json.obj.name,
      type:          "seize",
      location:      { description: w3json.obj.name, lat: w3json.obj.coord[1], lng: w3json.obj.coord[0] },
      desiredEffect: "Seize primary objective — derived from W3 scenario",
      readOnly:      true
    }
    objIdSet.add(w3json.obj.id)

  // Additional objectives from step objective_status_baseline keys (Rule OBJ2)
  FOR EACH step IN w3json.steps:
    FOR EACH key IN Object.keys(step.objective_status_baseline || {}):
      IF NOT objIdSet.has(key):
        PUSH objectives ← {
          objectiveId:   key,
          name:          key,
          type:          "seize",
          location:      null,
          desiredEffect: "Derived from W3 step objective status — no effect text available",
          readOnly:      true
        }
        objIdSet.add(key)

  // Build objective ID set for reference validation
  DEFINE objSet = Set of all objective.objectiveId in objectives

  // --- Step mapping (Rules S1–S12) ---
  DEFINE steps         = []
  DEFINE expWarnings   = []
  DEFINE expResults    = []

  FOR EACH step IN w3json.steps:
    stepId = "W3-STEP-" + padStart(step.index, 2, "0")

    // Friendly actions (Rule S6)
    friendlyActions = step.actors
      .filter(a → a.side === 'BLUE')
      .map(a → { uid: a.uid, action: a.action_what })

    // Enemy counter-actions (Rule S7)
    enemyCounterActions = step.actors
      .filter(a → a.side === 'RED')
      .map(a → { uid: a.uid, counterAction: a.action_what })

    // Units referenced (Rule S8)
    actorUids    = step.actors.map(a → a.uid)
    affectedUids = step.affected.map(a → a.uid)
    unitsReferenced = deduplicate(actorUids + affectedUids)

    // Objectives referenced (Rule S9)
    objectivesReferenced = Object.keys(step.objective_status_baseline || {})

    // Missing data (Rules S5, S10, S11)
    missingDataExpected = ["selectedDecision", "expectedResult"]
    IF NOT step.narrative_en_fallback: missingDataExpected.push("situation")

    // Step safety (Rule S12)
    stepSafety = copy of safetyBlock

    // Build step
    PUSH steps ← {
      step_id:             stepId,
      stepIndex:           step.index,
      title:               step.phase + " — " + step.time_label,
      situation:           step.narrative_en_fallback || null,
      selectedDecision:    null,       // Rule S5 — always null for W3
      friendlyActions:     friendlyActions,
      enemyCounterActions: enemyCounterActions,
      unitsReferenced:     unitsReferenced,
      objectivesReferenced: objectivesReferenced,
      expectedResult:      null,       // Rule S10 — never present in W3
      missingDataExpected: missingDataExpected,
      safety:              stepSafety
    }

    // Pre-declare guaranteed per-step warnings (§9)
    PUSH expWarnings ← { stepId: stepId, field: "selectedDecision", warningType: "MISSING_FIELD" }
    PUSH expWarnings ← { stepId: stepId, field: "expectedResult",   warningType: "MISSING_FIELD" }

    // Pre-declare preview result (§10)
    PUSH expResults ← { stepId: stepId, previewComplete: false, notes: "Missing: selectedDecision, expectedResult" }

  // --- Top-level fixture assembly ---
  DEFINE fixture = {
    fixtureId:              "wargame3-fixture-v1",
    fixtureName:            w3json.name,
    description:            "Adapted from Wargame 3 — dry-run preview only",
    sourceType:             "wargame3_adapted",
    readOnly:               true,
    liveMutationAllowed:    false,
    packageId:              w3json.ported_from,
    packageName:            w3json.scenario_label,
    units:                  units,
    objectives:             objectives,
    steps:                  steps,
    expectedWarnings:       expWarnings,
    expectedPreviewResults: expResults,
    safety:                 safetyBlock
  }

  // Freeze all (Rule SF5 — implementation requirement)
  Object.freeze(fixture) and all nested objects

  RETURN { passed: true, fixture: fixture, blockedReasons: [], warnings: [] }

END FUNCTION
```

---

## 12. Return Shape

The adapter returns a result wrapper consistent with the `isStagingStateSafe` pattern (PR-207):

```js
{
  passed:         boolean,   // false if validation failed (see §Validation above)
  fixture:        object,    // the adapted fixture, or null if passed === false
  blockedReasons: string[],  // non-empty only if passed === false
  warnings:       object[]   // informational only — non-blocking
}
```

The `fixture` field is `null` if `passed` is `false`. The `warnings` array may be non-empty even when `passed` is `true` (e.g. unit count anomaly from Rule U11).

---

## 13. Field Coverage vs. AMBER RIDGE Shape

The following table shows the expected coverage of each AMBER RIDGE fixture field when using a W3 adapter output. Fields marked "partial" are structurally present but may carry reduced display quality (e.g. Arabic unit names used as IDs, null objective locations).

| Field | W3 coverage | Quality |
|---|---|---|
| `fixtureId` | ✅ Assigned by adapter | Full |
| `fixtureName` | ✅ `w3json.name` | Full |
| `sourceType` | ✅ `"wargame3_adapted"` | Full |
| `readOnly` | ✅ Hard-locked | Full |
| `liveMutationAllowed` | ✅ Hard-locked | Full |
| `packageId` | ✅ `w3json.ported_from` | Full |
| `packageName` | ✅ `w3json.scenario_label` | Full |
| `units[].uid` | ✅ All 150 units | Full |
| `units[].name` | ⚠️ `label` or `uid` — no `name_en` in JSON | Partial |
| `units[].side` | ✅ Derived from source array | Full |
| `units[].type` | ⚠️ `domain` field only | Partial |
| `units[].echelon` | ✅ Normalised | Full |
| `units[].role` | ❌ `"unknown"` — not in W3 JSON | Missing |
| `units[].startLocation` | ✅ Step 0 coords (most units); null for placeholders | Mostly full |
| `units[].aliases` | ❌ Empty array | Missing |
| `objectives[].objectiveId` | ✅ From `w3json.obj.id` + status baseline keys | Full |
| `objectives[].name` | ⚠️ Primary obj has `name`; additional objs use ID as name | Partial |
| `objectives[].type` | ⚠️ Defaults to `"seize"` | Partial |
| `objectives[].location` | ✅ Primary obj has coord; additional objs have null | Partial |
| `objectives[].desiredEffect` | ⚠️ Placeholder text only | Partial |
| `steps[].step_id` | ✅ Derived | Full |
| `steps[].title` | ✅ `phase + time_label` | Full |
| `steps[].situation` | ✅ `narrative_en_fallback` — all 17 steps | Full |
| `steps[].selectedDecision` | ❌ Always null | Missing |
| `steps[].friendlyActions` | ✅ From BLUE actors | Full |
| `steps[].enemyCounterActions` | ✅ From RED actors (most steps) | Mostly full |
| `steps[].unitsReferenced` | ✅ Actor + affected UIDs | Full |
| `steps[].objectivesReferenced` | ✅ From status baseline keys | Full |
| `steps[].expectedResult` | ❌ Always null | Missing |
| `steps[].missingDataExpected` | ✅ Pre-declared | Full |
| `safety` (all levels) | ✅ Hard-locked | Full |

---

## 14. PR-215 Plan

Once this contract is accepted, PR-215 will implement `adaptWargame3ToFixture` as follows:

| Item | Detail |
|---|---|
| **File** | New file `UI_MOdified/client/shell/wargame3-fixture-adapter.js` |
| **Module pattern** | ES5 IIFE, `'use strict'`, `var` only, no arrow functions, no imports |
| **Exposure** | `window.RmoozWargame3Adapter = Object.freeze({ adaptWargame3ToFixture: adaptWargame3ToFixture })` |
| **Input** | `w3json` — the result of `JSON.parse(wargame3JsonText)` passed in from a console test |
| **DOM access** | None — pure function |
| **Map access** | None |
| **`window.units` access** | None |
| **Storage** | None |
| **API calls** | None |
| **Console test** | Pass `window.RmoozWargame3Adapter.adaptWargame3ToFixture(wargame3Data)` where `wargame3Data` has been loaded via `fetch('/data/scenarios/wargame3.json')` in a pre-test step (separate from the adapter itself) |
| **Pass condition** | `result.passed === true`, `result.fixture.steps.length === 17`, `result.fixture.units.length >= 100` |
| **Dry-run preview** | Call `window.AppShellScenarioWorkspace.buildScenarioStepPreview(result.fixture, "W3-STEP-00")` and verify `passed: true`, `preview.situation` is non-empty, `preview.previewComplete === false`, at least 2 warnings generated |

---

## 15. Safety Checklist

- [x] Docs-only — no runtime code introduced or modified in this PR
- [x] No adapter function implementation exists yet — contract only
- [x] No `window.units` access in adapter contract
- [x] No `window.RmoozScenario` access in adapter contract
- [x] No map mutation in adapter contract
- [x] No `/api/sim/*` calls in adapter contract
- [x] No `localStorage`, `sessionStorage`, `IndexedDB` in adapter contract
- [x] `w3json` is treated as read-only input — adapter copies values, never mutates input
- [x] Adapter output fixture carries `readOnly: true` and all safety flags
- [x] `Object.freeze()` mandated for PR-215 implementation (Rule SF5)
- [x] All 17 steps will produce `previewComplete: false` — documented and expected
- [x] 34 minimum guaranteed warnings pre-declared
- [x] No apply path, no staging state, no commit path
- [x] No gate 7 involvement
- [x] `app.js` / `adjudicator-map.js` untouched
- [x] `window.RmoozScenario.stepIndex` permanently independent of `activeStepIndex`
- [x] No GeoJSON step file joins required — JSON-embedded coords used only
- [x] External scenario catalog remains deferred — this contract is unrelated
- [x] AMBER RIDGE fixture remains the only loaded dry-run fixture in this PR
