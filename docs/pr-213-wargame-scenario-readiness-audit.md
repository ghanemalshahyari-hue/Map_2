# PR-213 — Wargame Scenario Readiness Audit

**Type:** Documentation only — readiness audit  
**Status:** Proposed  
**Depends on:** PR-212 (Scenario Dry-Run Preview UI), PR-211 (`buildScenarioStepPreview`)  
**Blocks:** PR-214 (Wargame Fixture Adapter Contract)

> **This document is documentation only. No files were parsed into RMOOZ. No runtime code was changed. No units were moved. No scenario state was mutated. All findings are read-only observations from static file inspection.**

---

## 1. Executive Summary

RMOOZ has three wargame scenario sources — Wargame 1, Wargame 2, and Wargame 3 — plus their corresponding GeoJSON step files, porter/adapter scripts, and one built-in synthetic sample (PR-143). A thorough file audit reveals:

- **Wargame 3 is the strongest candidate for the first real dry-run preview test.** Its 17-step JSON contains per-step actor arrays (BLUE/RED actions with doctrine citations), per-step affected arrays (damage/status changes), per-step engagement arcs, and per-step narrative text in English and Arabic. Step GeoJSON files supply coordinates for all 150+ units per step.

- **Wargame 1 and Wargame 2 are partially ready.** Their JSON files contain per-step narrative text and decision point labels, but lack explicit decision options, per-step actor arrays, counter-action arrays, and expected results. Per-step unit positions are in GeoJSON files but not consolidated in the JSON.

- **The built-in sample (PR-143)** is structurally closest to the `buildScenarioStepPreview` input shape. It has `selected_decision`, `options[]`, `actions[]`, `counter_actions[]`, and `objective` with coordinates. It is embedded in code, not a separate file.

- **The critical gap across all three wargames** is the absence of an explicit `selected_decision` (formal operator choice). Wargame 3 has zero `decision_point_baseline` values set. Wargame 1 and 2 have a label string per step but no option list. None supply a per-step `expectedResult`.

- **Recommended PR-214:** Define a Wargame Fixture Adapter Contract for Wargame 3 — the richest data source. The adapter maps W3's `actors[]`, `affected[]`, `engagement_arcs[]`, `narrative_en_fallback`, and step coordinates to the AMBER RIDGE fixture shape. Missing `selectedDecision` and `expectedResult` fields would be flagged as warnings (the preview builder already handles these correctly).

---

## 2. Files Audited

| File | Path | Size | Type |
|---|---|---|---|
| `wargame1.json` | `UI_MOdified/data/scenarios/` | 38 KB | Scenario JSON — 12 steps |
| `wargame2.json` | `UI_MOdified/data/scenarios/` | 37 KB | Scenario JSON — 12 steps |
| `wargame3.json` | `UI_MOdified/data/scenarios/` | 1.7 MB | Scenario JSON W3-rich — 17 steps, 150 units |
| `scenario-template.json` | `UI_MOdified/data/scenarios/` | 5.5 KB | Schema template — no step data |
| `step00–step11.geojson` (×12) | `UI_MOdified/Wargame1/` | ~45 KB each | Per-step GeoJSON — unit positions |
| `step00–step11.geojson` (×12) | `UI_MOdified/Wargame2/` | ~532 KB each | Per-step GeoJSON — unit positions + terrain |
| `step00–step16.geojson` (×17) | `UI_MOdified/Wargame3/` | ~151–168 KB each | Per-step GeoJSON — units, objectives, arcs |
| `all_phases.geojson` | `UI_MOdified/Wargame3/` | 2.7 MB | All-phase overlay GeoJSON |
| `Wargame1_Report_AR.docx` | `UI_MOdified/Wargame1/` | 1.9 MB | Arabic operational report — binary |
| `Wargame2_Report_AR.docx` | `UI_MOdified/Wargame2/` | 9.0 MB | Arabic operational report — binary |
| `scenario-schema.md` | `docs/` | 8.8 KB | Schema specification |
| `wargame3-schema.md` | `docs/` | 28 KB | W3-rich schema documentation |
| `scenario-schema-spec.js` | `UI_MOdified/server/ai/` | 9.1 KB | Formal schema spec (server) |
| `port-wargame.js` | `UI_MOdified/scripts/` | 89 KB | Generic GeoJSON→JSON porter |
| `port-wargame1.js` | `UI_MOdified/scripts/` | 12 KB | Wargame1-specific porter |
| `port-wargame2.js` | `UI_MOdified/scripts/` | 14 KB | Wargame2-specific porter |
| Built-in sample (PR-143) | `scenario-workspace.js` | — | Embedded 3-step synthetic package |
| `scenario-dry-run-fixtures.js` | `UI_MOdified/client/shell/` | 22 KB | AMBER RIDGE dry-run fixture (PR-210) |

---

## 3. Readiness Table

| Source | Steps | Units | Situation | Decision | Actions | Counter-actions | Coordinates | Expected result | Readiness |
|---|---|---|---|---|---|---|---|---|---|
| `wargame1.json` | 12 | 49 (global) | ✅ narrative_en | ⚠️ label only | ❌ none in JSON | ❌ none | ⚠️ start positions only | ❌ none | **Partially ready** |
| `wargame2.json` | 12 | 49 (global) | ✅ narrative_en | ⚠️ label only | ❌ none in JSON | ❌ none | ⚠️ start positions only | ❌ none | **Partially ready** |
| `wargame3.json` | 17 | 150 (per-step arrays) | ✅ narrative_en | ❌ null all steps | ✅ actors[] per step | ✅ engagement_arcs[] | ✅ per-step coords | ❌ none | **Partially ready — best candidate** |
| Wargame3 GeoJSON | 17 | 173 per step | ⚠️ in JSON only | ❌ none | ✅ action_what per unit | ✅ engagement_arcs | ✅ full lat/lng | ❌ none | **Needs adapter** |
| Wargame1/2 GeoJSON | 12 | varies | ❌ none | ❌ none | ❌ none | ❌ none | ✅ full lat/lng | ❌ none | **Metadata only** |
| Built-in sample (PR-143) | 3 | 4 (per step) | ✅ summary_en | ✅ selected_decision | ✅ actions[] | ✅ counter_actions[] | ✅ coord per objective | ❌ none | **Ready now** (embedded) |
| AMBER RIDGE fixture | 4 | 7 (per step) | ✅ | ✅ / null (Step 2) | ✅ | ✅ / [] (Step 3) | ⚠️ null lat/lng | ✅ / null (Step 2) | **Ready now** (dry-run) |
| `.docx` reports | — | — | — | — | — | — | — | — | **Not usable yet** |
| `scenario-template.json` | 0 | 0 | — | — | — | — | — | — | **Metadata only** |

---

## 4. Best Candidate for First Real Wargame Dry-Run

### Wargame 3 (combined JSON + GeoJSON)

Wargame 3 is the richest data source and the strongest candidate for the first real wargame dry-run preview test. It contains:

| Data element | Source | Detail |
|---|---|---|
| **17 steps** | `wargame3.json` `.steps[]` | Indexed 0–16; time labels D-P0 through D+144h |
| **Situation text** | `.steps[n].narrative_en_fallback` | Present for all 17 steps; EN + AR |
| **Per-step actors** | `.steps[n].actors[]` | 4–16 entries per step; each has `uid`, `side`, `action_component`, `action_what`, `action_why`, `action_intended_effect`, `action_doctrine_cited` |
| **Per-step affected** | `.steps[n].affected[]` | 1–11 entries per step; each has `uid`, `side`, `status_change`, `damage_pct`, `cause_actor`, `cause_what`, `cause_doctrine` |
| **Engagement arcs** | `.steps[n].engagement_arcs[]` | 3–12 per step; actor→target with cause_what and status_change |
| **Unit coordinates** | `.red_unit_step_coords[uid][stepIndex]`, `.blue_unit_step_coords[uid][stepIndex]` | Per-step lat/lng for all 150 units |
| **150 named units** | `.red_units[]` (70) + `.blue_units_initial[]` (80) | Each has `uid`, `echelon`, `sidc`, `coord` |
| **Objective** | `.obj` (top-level) + GeoJSON `kind=objective` | Lat/lng + name_en/ar |
| **Phase labels** | `.steps[n].phase` | PRE-H, PHASE 1, PHASE 2A, PHASE 2B, PHASE 3, RESOLUTION |
| **Force ratios** | `.steps[n].force_ratio_baseline`, `force_ratio_local`, `force_ratio_operational` | Numeric per step |
| **Doctrine citations** | `.actors[n].action_doctrine_cited[]` | Array of doctrine strings — strongest source trace in any file |

**Critical gap:** `decision_point_baseline` is `null` for all 17 W3 steps. There is no `selected_decision` or options list. The preview builder will correctly generate `MISSING_FIELD` warnings for each step and set `previewComplete: false`. This is expected and correct — the preview will show everything it knows and flag what is missing.

**Second-best candidate for a simpler first test:** The built-in PR-143 sample — it already has `selected_decision`, `actions[]`, and `counter_actions[]` and its manifest structure is close to `buildScenarioStepPreview` input. However it is embedded in code and its 3 steps are synthetic training data.

---

## 5. Missing Data Table

### Wargame 1 and Wargame 2

| Field (AMBER RIDGE shape) | W1/W2 status | Gap type |
|---|---|---|
| `step_id` | Derivable from `step.index` | None — adapter needed |
| `title` | Derivable from `step.phase + step.time_label` | None — adapter needed |
| `situation` | ✅ `narrative_en_fallback` present all 12 steps | None |
| `selectedDecision` | ⚠️ `decision_point_baseline` is a label string (e.g. "Red staging", "Recon lodgement") — not a formal option | Needs decision options list |
| `friendlyActions[]` | ❌ Not in JSON — would need GeoJSON actor extraction | Missing in JSON |
| `enemyCounterActions[]` | ❌ Not in JSON | Missing |
| `unitsReferenced[]` | ⚠️ Global unit lists only (`red_units[]`, `blue_units_initial[]`) — not per-step | No per-step resolution |
| `objectivesReferenced[]` | ⚠️ Single top-level `obj` object — no step-level objective mapping | Single objective only |
| `expectedResult` | ❌ Not present | Missing |
| `source_trace` | ❌ Not present per field | Missing |
| Coordinates | ⚠️ Start positions in `red_units[].coord` and `blue_units_initial[].coord`; per-step positions in GeoJSON only | Requires GeoJSON join |

### Wargame 3

| Field (AMBER RIDGE shape) | W3 status | Gap type |
|---|---|---|
| `step_id` | Derivable from `step.index` | None — adapter needed |
| `title` | ✅ `step.phase + step.time_label` + `step.phase_name_ar` | None |
| `situation` | ✅ `narrative_en_fallback` + `narrative_ar_fallback` — all 17 steps | None |
| `selectedDecision` | ❌ `decision_point_baseline` is `null` for all 17 steps | **Critical gap** |
| `friendlyActions[]` | ✅ `actors[].action_what` where `actors[].side === 'BLUE'` — 4–16 per step | Needs adapter mapping |
| `enemyCounterActions[]` | ✅ `actors[].action_what` where `actors[].side === 'RED'` + `engagement_arcs[]` | Needs adapter mapping |
| `unitsReferenced[]` | ✅ All actor + affected UIDs — per step | Needs extraction |
| `objectivesReferenced[]` | ✅ GeoJSON `kind=objective` features per step | Needs GeoJSON join |
| `expectedResult` | ❌ Not present per step | **Missing** |
| `source_trace` | ⚠️ `action_doctrine_cited[]` present on actors — partial | Best trace of any source |
| Coordinates per step | ✅ `red_unit_step_coords[uid][stepIndex]` + `blue_unit_step_coords[uid][stepIndex]` | Excellent — all units |

---

## 6. Mapping to `ScenarioPlaybackPreview`

The `buildScenarioStepPreview` function returns a `ScenarioPlaybackPreview` object (PR-209 contract). The following table shows how each wargame source maps to its fields.

| `ScenarioPlaybackPreview` field | W3 source | W1/W2 source | Built-in sample |
|---|---|---|---|
| `fixtureId` | Derived: `"wargame3-v1"` | Derived | Derived |
| `fixtureName` | `w3.name` | `w1.name` | Manifest name |
| `packageId` | `w3.ported_from` | `w1.ported_from` | Manifest name |
| `packageName` | `w3.scenario_label` | `w1.scenario_label` | Manifest |
| `activeStepId` | `"W3-STEP-" + step.index` | `"W1-STEP-" + step.index` | `step.step_id` |
| `activeStepIndex` | `step.index` | `step.index` | `step.stepIndex` |
| `totalSteps` | 17 | 12 | 3 |
| `stepSummary` | `step.phase + " — " + step.time_label` | Same | `step.title` |
| `situation` | `step.narrative_en_fallback` | `step.narrative_en_fallback` | `step.situation.summary_en` |
| `decision` | ❌ `null` — no options | ⚠️ label string only | ✅ `step.selected_decision` |
| `unitsReferenced` | ✅ Actor + affected UIDs resolved against `red_units + blue_units_initial` | ⚠️ Global lists only | ✅ `actions[].uid` |
| `objectivesReferenced` | ✅ GeoJSON objective features | ⚠️ Single top-level `obj` | ✅ `objective.id` |
| `proposedVisualEffects` | ✅ From `actors[].action_what` — text descriptions | ❌ Not available in JSON | ✅ `actions[].action` |
| `missingDataWarnings` | `MISSING_FIELD` for `selectedDecision` + `expectedResult` | Same + `INCOMPLETE_FIELD` for actions | None expected |
| `expectedResult` | ❌ `null` | ❌ `null` | ❌ `null` |
| `previewComplete` | ❌ `false` (missing decision and result) | ❌ `false` | ⚠️ `false` (missing result) |
| `readOnly` | `true` (adapter must set) | `true` | `true` |
| `liveMutationAllowed` | `false` (adapter must set) | `false` | `false` |

---

## 7. Mapping to AMBER RIDGE Fixture Shape

The AMBER RIDGE fixture defines the input shape for `buildScenarioStepPreview`. To use a real wargame as input, an adapter must produce an object conforming to this shape. The following identifies each required field and where it comes from in Wargame 3.

### Top-level fixture fields

| AMBER RIDGE field | W3 source | Confidence |
|---|---|---|
| `fixtureId` | `"wargame3-fixture-v1"` (assigned by adapter) | ✅ |
| `fixtureName` | `w3.name` | ✅ |
| `sourceType` | `"wargame3_imported"` (assigned by adapter) | ✅ |
| `readOnly` | `true` (hard-locked by adapter) | ✅ |
| `liveMutationAllowed` | `false` (hard-locked by adapter) | ✅ |
| `packageId` | `w3.ported_from` or `w3.scenario_label` | ✅ |
| `packageName` | `w3.scenario_label` | ✅ |
| `units[]` | Derived from `w3.red_units[]` + `w3.blue_units_initial[]` | ✅ |
| `objectives[]` | Derived from GeoJSON `kind=objective` features + `w3.obj` | ✅ |
| `steps[]` | Derived from `w3.steps[]` (17 entries) | ✅ |
| `expectedWarnings[]` | Generated by adapter based on known nulls | ✅ |
| `expectedPreviewResults[]` | All 17 steps: `previewComplete: false` (missing decision) | ✅ |
| `safety` | Hard-locked by adapter | ✅ |

### Unit shape mapping from `w3.red_units[0]`

| AMBER RIDGE unit field | W3 source field | Present? |
|---|---|---|
| `uid` | `.uid` | ✅ |
| `name` | `.label` (W1/W2) or `.name_ar` (W3 GeoJSON) | ⚠️ W3 JSON has no `name_en` — needs GeoJSON join |
| `side` | `"enemy"` (red_units) / `"friendly"` (blue_units) | ✅ Derivable |
| `type` | `.sidc` (NATO SIDC code) or `.type` (GeoJSON) | ✅ |
| `echelon` | `.echelon` | ✅ |
| `role` | ❌ Not present in W3 JSON — partial in GeoJSON `action_component` | ⚠️ Partial |
| `startLocation` | `.coord` [lon, lat] on unit + per-step coords `red_unit_step_coords[uid][0]` | ✅ |
| `aliases` | ❌ Not present | ❌ Missing |
| `readOnly` | `true` (set by adapter) | ✅ |

### Step shape mapping from `w3.steps[0]`

| AMBER RIDGE step field | W3 source field | Present? |
|---|---|---|
| `step_id` | Derived: `"W3-STEP-" + step.index` | ✅ |
| `stepIndex` | `step.index` | ✅ |
| `title` | `step.phase + " " + step.time_label` | ✅ |
| `situation` | `step.narrative_en_fallback` | ✅ |
| `selectedDecision` | `step.decision_point_baseline` — **null for all W3 steps** | ❌ |
| `friendlyActions[]` | `step.actors[]` filtered `side === 'BLUE'` → `{uid, action: actor.action_what}` | ✅ |
| `enemyCounterActions[]` | `step.actors[]` filtered `side === 'RED'` → `{uid, counterAction: actor.action_what}` | ✅ |
| `unitsReferenced[]` | All UIDs from `step.actors[]` + `step.affected[]` | ✅ |
| `objectivesReferenced[]` | From `step.objective_status_baseline` keys + GeoJSON objectives | ⚠️ Needs join |
| `expectedResult` | ❌ Not present | ❌ |
| `missingDataExpected[]` | Adapter fills: `['selectedDecision', 'expectedResult']` for all steps | ✅ |
| `safety` | Hard-locked by adapter | ✅ |

---

## 8. Importer / Adapter Gaps

### Gap 1 — No `selectedDecision` in Wargame 3

**Severity: High.** All 17 W3 steps have `decision_point_baseline: null`. The scenario does not model explicit operator decision choices. Every step will produce a `MISSING_FIELD` warning for `selectedDecision` and `previewComplete: false`.

**Options:**
- Accept this gap and proceed with partial preview. The builder handles it correctly.
- Derive a synthetic `selectedDecision` from `step.step_advantage` or the dominant actor's `action_what`. This would be a soft inference, not a hard decision — must be labelled as `"Visual estimate"` not `"Confirmed decision"`.
- Manually author decision labels for W3 steps as a separate annotation file.

### Gap 2 — No `expectedResult` per step (all sources)

**Severity: Medium.** No wargame source defines a per-step expected result. The field is absent from all JSON and GeoJSON files. Every step will produce a `MISSING_FIELD` warning for `expectedResult`.

**Options:**
- Accept the gap; use `step.objective_status_baseline` as a proxy for partial result display.
- Derive a synthetic result from `step.bls_status_baseline` or `step.red_strength_baseline` delta. Must be labelled `"Derived — not confirmed"`.

### Gap 3 — Unit name_en missing from W3 JSON

**Severity: Medium.** `w3.red_units[]` units have no `name_en` field. Unit names are in Arabic in GeoJSON (`name_ar`). English unit names require joining with the GeoJSON step files.

**Options:**
- Use `uid` as display name (degraded but functional).
- Join with GeoJSON `step00.geojson` where `feature.properties.uid === unit.uid` to get `name_en`.

### Gap 4 — Objectives per step require GeoJSON join

**Severity: Medium.** W3 JSON's `objective_status_baseline` contains objective status flags (e.g. `DORMANT`, `ACTIVE`) but not objective names or coordinates. Names and coordinates are in the GeoJSON `kind=objective` feature. A full objectives array requires joining `wargame3.json` status + `step00.geojson` objective features.

### Gap 5 — Unit aliases not present

**Severity: Low.** No wargame source includes unit aliases. The adapter would create units with `aliases: []`. This means step text that references a unit by informal name will produce `UNKNOWN_UNIT` warnings rather than alias-resolved references.

### Gap 6 — GeoJSON step files not loaded into the client

**Severity: Informational.** The W3 step GeoJSON files are server-side assets. The client does not currently have access to them at runtime. The adapter would need to either: (a) pre-process them server-side into fixture JSON, or (b) use the JSON-embedded `red_unit_step_coords` / `blue_unit_step_coords` arrays (which are present in `wargame3.json`) rather than the GeoJSON directly.

### Gap 7 — `safety` block not in wargame JSON schema

**Severity: Low.** The wargame JSON files do not include `dryRunOnly`, `previewOnly`, or any of the AMBER RIDGE safety flags. The adapter must inject these for every output fixture and step. This is the adapter's responsibility, not a source file deficiency.

---

## 9. Safety Boundaries

The following boundaries apply to any future wargame adapter PR and are confirmed as intact in the current state:

| Boundary | Status |
|---|---|
| `window.units` not read or written during dry-run preview | ✅ Confirmed — PR-211 builder never accesses `window.units` |
| `window.RmoozScenario.stepIndex` not changed during preview | ✅ Confirmed — PR-213 secondary test F passed (0 → 0) |
| Map layer not written during preview | ✅ Confirmed — PR-213 secondary test H passed (163 → 163 markers) |
| Fixture data frozen (`Object.freeze`) | ✅ Confirmed — PR-213 secondary test G passed |
| No `localStorage`, `sessionStorage`, `fetch`, `/api/sim/*` in preview path | ✅ Confirmed — PR-213 secondary test J passed |
| No apply, commit, confirm labels in `#sw-drp-section` | ✅ Confirmed — PR-213 secondary test I passed |
| `wargame3.json` and GeoJSON files not imported into client at runtime in this PR | ✅ Confirmed — no script tag, no fetch, no inline data |
| No wargame data passed to `window.RmoozDryRunFixtures` in this PR | ✅ Confirmed — only AMBER RIDGE fixture is loaded |

---

## 10. Recommended PR-214

Based on the audit findings, Wargame 3 has sufficient per-step data (actors, affected, engagement arcs, narrative, coordinates) to be adapted into the AMBER RIDGE fixture shape and tested with `buildScenarioStepPreview`.

**Recommended next PR:**

### PR-214 — Wargame Fixture Adapter Contract

**Type:** Documentation only  
**Goal:** Define the formal contract for a pure adapter function `adaptWargame3ToFixture(w3json)` that converts a Wargame 3 JSON object into an AMBER RIDGE-shaped fixture object, ready for `buildScenarioStepPreview`.

The contract must define:

| Section | Content |
|---|---|
| **Input shape** | `w3json` — the full parsed Wargame 3 JSON object |
| **Output shape** | A fixture object conforming to the AMBER RIDGE fixture shape (PR-210 §3) |
| **Unit mapping** | `w3.red_units[]` + `w3.blue_units_initial[]` → `fixture.units[]` |
| **Step mapping** | `w3.steps[]` → `fixture.steps[]` — see §7 above for per-field rules |
| **Action mapping** | `step.actors[]` (BLUE) → `friendlyActions[]`; `step.actors[]` (RED) → `enemyCounterActions[]` |
| **Coordinate mapping** | `red_unit_step_coords[uid][stepIndex]` / `blue_unit_step_coords[uid][stepIndex]` → `unit.startLocation` |
| **Decision handling** | `decision_point_baseline: null` → `selectedDecision: null` + `missingDataExpected: ['selectedDecision']` |
| **Result handling** | No source field → `expectedResult: null` + `missingDataExpected: ['expectedResult']` |
| **Safety injection** | Adapter always hard-locks `safety`, `readOnly: true`, `liveMutationAllowed: false` |
| **Hard boundaries** | Adapter must not read `window.units`, must not write any global, must not call any API |
| **Expected warnings** | All 17 steps will produce at least 2 `MISSING_FIELD` warnings (decision + result); steps 0–16 with null coordinates produce additional `MISSING_COORDINATE` warnings |

If the contract is accepted, **PR-215** would implement `adaptWargame3ToFixture` as a pure JS function (no storage, no map access, no `window` reads) and run it against the real `wargame3.json` in the browser console.

---

## 11. Safety Checklist

- [x] Docs-only — no runtime code introduced or modified
- [x] No parser or importer implemented
- [x] No UI changes
- [x] No mutation of `window.units`, `window.lines`, `window.RmoozScenario`, or map
- [x] No `localStorage`, `sessionStorage`, `IndexedDB`, `fetch`, or `/api/sim/*`
- [x] No `wargame3.json` or GeoJSON loaded into the RMOOZ client in this PR
- [x] No staging state created
- [x] No apply path
- [x] Gate 7 remains forbidden
- [x] Staging-state expansion remains paused
- [x] `app.js` / `adjudicator-map.js` untouched
- [x] All findings are static read-only observations
