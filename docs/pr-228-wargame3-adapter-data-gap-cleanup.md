# PR-228 — Wargame 3 Adapter Data Gap Cleanup

**Date:** 2026-05-26  
**Status:** Delivered  
**Type:** Data fix — `data/scenarios/wargame3.json` only  
**Scope:** No runtime changes. No UI changes. No adapter changes.

---

## 1. Summary

Three unit UIDs referenced in `actors`/`affected` entries of `wargame3.json` steps
were absent from `blue_units_initial`, causing `UNKNOWN_UNIT` warnings in
`previewWargame3Fixture()`. All three units existed in the GIS layer
(`Wargame3/all_phases.geojson`) with full `name_ar`, `type`, and coordinates — the
data gap was strictly a missing entry in the scenario JSON unit table.

A fourth gap — absent `scenario_id` — was also corrected by adding
`"scenario_id": "wargame3"` to the top-level JSON object.

**UNKNOWN_UNIT warnings: 6 before → 0 after.**  
**MISSING_FIELD warnings: 34 before → 34 after (unchanged).**  
**Total fixture units: 150 before → 153 after.**  
**All 17 steps still pass. All safety boundaries intact.**

---

## 2. Files Changed

| File | Change |
|------|--------|
| `UI_MOdified/data/scenarios/wargame3.json` | Added `scenario_id` field; added 3 unit entries to `blue_units_initial` |

No other file changed.

---

## 3. Root Cause Analysis

### 3.1 Investigation method

Each orphan UID was traced through:
1. `data/scenarios/wargame3.json` → `blue_units_initial` (unit table used by adapter)
2. `data/scenarios/wargame3.json` → `steps[].actors[]` + `steps[].affected[]` (references)
3. `UI_MOdified/Wargame3/all_phases.geojson` → `features[].properties` (GIS source)

The adapter's `_buildUnit()` function reads `unit_uid` from `blue_units_initial` entries
and stores them in `fixture.units` by `uid`. `buildScenarioStepPreview()` then resolves
`step.unitsReferenced[]` against `uidIndex`. Any UID not found in the index triggers
`UNKNOWN_UNIT`.

### 3.2 Per-UID root cause

| UID | name_ar (from geojson) | Steps affected | Root cause |
|-----|------------------------|----------------|------------|
| `B-d0-99-000` | المكون البري 99. يتألف من : | 0, 4, 6, 7 | Unit defined in GIS layer but not copied to `blue_units_initial` |
| `B-d0-المكون-030` | المكون البحري . ويتألف من: | 3 | Unit defined in GIS layer but not copied to `blue_units_initial` |
| `B-d1-400-045` | (400) لغم بحري | 7 | Unit defined in GIS layer but not copied to `blue_units_initial` |

All three are legitimate BLUE units with tactical roles:
- `B-d0-99-000` — strategic ground reserve component; action: "held position — preserving strategic assets" (steps 0, 4, 6, 7)
- `B-d0-المكون-030` — naval SSM component; action: "held position — preserving SSM magazine" (step 3)
- `B-d1-400-045` — naval sea mine unit; action: "monitor and adjust minefields" (step 7)

### 3.3 scenario_id

`wargame3.json` had no `scenario_id` field. `buildW3PreviewFromLoadedScenario()` was
defaulting to `"wg3-live"`. Since the scenario file is named `wargame3`, the correct
stable ID is `"wargame3"`.

---

## 4. Correction Approach

**Option A chosen** — add missing unit definitions directly to `blue_units_initial`
in the source JSON. Data sourced from the GIS layer (`all_phases.geojson`) which
already carried `name_ar`, unit type, and geospatial coordinates for all three units.

No tactical meaning was invented. No adapter logic was changed. No warnings were
silently suppressed.

---

## 5. Changes Made to `wargame3.json`

### 5.1 Added `scenario_id` (after `"name"` field)

```json
"name": "wargame3",
"scenario_id": "wargame3",
"model_version": "wargame3-v1.0",
```

### 5.2 Added 3 units to `blue_units_initial`

**Unit 1 — B-d0-99-000** (Ground Component 99 — strategic reserve)

```json
{
  "unit_uid": "B-d0-99-000",
  "base_id": "B-d0-99-000",
  "label": "المكون البري 99. يتألف من :",
  "role": "unknown",
  "domain": "ground",
  "echelon": "unit",
  "sidc": "10031000001211000000",
  "coord": [19.90166170748455, 29.92519340810254],
  "posture": null,
  "name_ar": "المكون البري 99. يتألف من :",
  "appear": 0
}
```

Coord sourced from `all_phases.geojson` feature for this UID. Role `"unknown"` and
SIDC `10031000001211000000` match existing ground units of similar unclassified type
in the same file.

**Unit 2 — B-d0-المكون-030** (Naval Component — SSM reserve)

```json
{
  "unit_uid": "B-d0-المكون-030",
  "base_id": "B-d0-المكون-030",
  "label": "المكون البحري . ويتألف من:",
  "role": "naval_unit",
  "domain": "naval",
  "echelon": "unit",
  "sidc": "10033000001202000000",
  "coord": [20.4, 29.1],
  "posture": null,
  "name_ar": "المكون البحري . ويتألف من:",
  "appear": 0
}
```

Role `"naval_unit"` and SIDC `10033000001202000000` sourced from the geojson feature
type `naval_unit` and matched to existing naval units in the same file.

**Unit 3 — B-d1-400-045** (Sea Mine (400))

```json
{
  "unit_uid": "B-d1-400-045",
  "base_id": "B-d1-400-045",
  "label": "(400) لغم بحري",
  "role": "mine_layer",
  "domain": "naval",
  "echelon": "unit",
  "sidc": "10033000001206020000",
  "coord": [20.4, 29.1],
  "posture": null,
  "name_ar": "(400) لغم بحري",
  "appear": 0
}
```

Role `"mine_layer"` and SIDC `10033000001206020000` matched from existing mine layer
unit `B-d1-3-036` ("3 سفن بث ألغام بحرية") in the same file.

---

## 6. Before / After Warning Counts

### 6.1 UNKNOWN_UNIT warnings

| Step | UID | Before | After |
|------|-----|--------|-------|
| W3-STEP-00 | B-d0-99-000 | ⚠️ UNKNOWN_UNIT | ✅ resolved |
| W3-STEP-03 | B-d0-المكون-030 | ⚠️ UNKNOWN_UNIT | ✅ resolved |
| W3-STEP-04 | B-d0-99-000 | ⚠️ UNKNOWN_UNIT | ✅ resolved |
| W3-STEP-06 | B-d0-99-000 | ⚠️ UNKNOWN_UNIT | ✅ resolved |
| W3-STEP-07 | B-d0-99-000 | ⚠️ UNKNOWN_UNIT | ✅ resolved |
| W3-STEP-07 | B-d1-400-045 | ⚠️ UNKNOWN_UNIT | ✅ resolved |

**Total UNKNOWN_UNIT: 6 → 0**

### 6.2 MISSING_FIELD warnings

| Warning | Before | After |
|---------|--------|-------|
| `selectedDecision is missing` × 17 | 17 | 17 |
| `expectedResult is missing` × 17 | 17 | 17 |
| **Total** | **34** | **34** |

MISSING_FIELD warnings are unchanged — `selectedDecision` and `expectedResult` remain
absent from all steps by design. These are expected in preview mode.

### 6.3 Adapter cross-check

```javascript
var built   = AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();
var adapted = AppShellScenarioWorkspace.adaptWargame3ToFixture(built.w3json);
// → { passed: true, blockedReasons: [], warnings: [] }
// → fixture.units.length: 153
```

Adapter now returns zero warnings at the build/adapt stage.

### 6.4 Unit count

| | Before | After |
|---|--------|-------|
| `blue_units_initial` | 80 | 83 |
| `red_units` | 70 | 70 |
| Total fixture units | 150 | 153 |
| `UNIT_COUNT_ANOMALY` warning | No | No |

153 is within the expected 100–200 range. No `UNIT_COUNT_ANOMALY`.

---

## 7. Test Results

All 13 required tests executed against live app at `http://localhost:8000/app.html`.

| # | Test | Result |
|---|------|--------|
| T1 | Full 17-step preview still passes | ✅ all 17 passed |
| T2 | UNKNOWN_UNIT warnings after | ✅ 0 (was 6) |
| T3 | MISSING_FIELD warnings for selectedDecision/expectedResult | ✅ 34 (unchanged) |
| T4 | `scenario_id` present and correct | ✅ `"wargame3"` |
| T5 | `buildW3PreviewFromLoadedScenario()` still passes | ✅ `passed:true` |
| T6 | `paintWargame3Preview()` still displays | ✅ panel visible |
| T7 | Preview next/previous still work | ✅ W3-STEP-01 / W3-STEP-15 |
| T8 | `window.RmoozScenario.stepIndex` unchanged | ✅ stayed `0` |
| T9 | `window.units`/`window.lines` unchanged | ✅ |
| T10 | No map layers/markers/arrows added | ✅ |
| T11 | No storage/fetch/backend activity | ✅ localStorage unchanged |
| T12 | No app.js/adjudicator-map.js changes | ✅ |
| T13 | No apply/commit/confirm/Gate 7 labels | ✅ |

**13 / 13 passed.**

### Unit resolution verification

All 3 previously-unknown units now resolve with `resolved:true` in affected steps:

| UID | Step | resolved | displayName |
|-----|------|----------|-------------|
| `B-d0-99-000` | W3-STEP-00 | ✅ true | المكون البري 99. يتألف من : |
| `B-d0-99-000` | W3-STEP-04 | ✅ true | المكون البري 99. يتألف من : |
| `B-d0-99-000` | W3-STEP-06 | ✅ true | المكون البري 99. يتألف من : |
| `B-d0-99-000` | W3-STEP-07 | ✅ true | المكون البري 99. يتألف من : |
| `B-d0-المكون-030` | W3-STEP-03 | ✅ true | المكون البحري . ويتألف من: |
| `B-d1-400-045` | W3-STEP-07 | ✅ true | (400) لغم بحري |

---

## 8. Confirm selectedDecision / expectedResult Unchanged

```javascript
// Checked across all 17 steps after cleanup:
// preview.decision === null on all 17 steps     ✅
// preview.expectedResult === null on all 17 steps ✅
// preview.previewComplete === false on all 17 steps ✅
```

The data changes (adding unit entries) do not affect decision or result fields.
`previewComplete` remains `false` on all steps.

---

## 9. Safety Checklist

| Constraint | Status |
|---|---|
| Docs-only: No | Data fix only (one JSON data file changed) |
| No UI changes | ✅ — no app.html, style.css, or i18n.js changes |
| No runtime code changes | ✅ — scenario-workspace.js unchanged |
| No adapter changes | ✅ — adapter logic unchanged |
| No map mutation | ✅ |
| No scenario live mutation | ✅ — `window.RmoozScenario.scenario` is server data; only the source file was updated |
| No stepIndex mutation | ✅ — stayed `0` throughout |
| No window.units / window.lines mutation | ✅ |
| No storage / fetch / backend writes | ✅ |
| No app.js / adjudicator-map.js changes | ✅ |
| No apply / commit / confirm controls | ✅ |
| No Gate 7 UI | ✅ |
| selectedDecision remains null | ✅ |
| expectedResult remains null | ✅ |
| previewComplete remains false | ✅ |
| JSON still valid after edits | ✅ — `json.load()` confirms valid syntax |

---

## 10. Recommended PR-229

**PR-229 — Wargame 3 Preview Navigation Polish**  
Type: Display/UX  

Now that all data gaps are resolved and the full 17-step walkthrough is clean, the
recommended next step is visual polish of the preview navigation panel:

- Step counter alignment and button disable state at `atStart`/`atEnd` boundaries
- Objective status color-coding (DORMANT/THREATENED/CONTESTED/DENIED)
- Effects list collapsible / scroll behaviour on steps with 25+ effects
- W3 context bar — add phase and time label to the header alongside the scenario name

This PR would be UI-only (app.html, style.css, scenario-workspace.js display layer)
with no data, adapter, or safety changes.
