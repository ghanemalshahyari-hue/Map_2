# Wargame 3 (W3-Rich) Scenario Schema

This document describes the W3-rich extension to the base scenario schema (`docs/scenario-schema.md`). When a scenario carries `schema_variant: "w3-rich"`, every field documented here is available — both in the ported `data/scenarios/<name>.json` and in the runtime `state` object the renderer consumes per step.

W3-rich scenarios are produced by the `Wargame3` source folder (RFC-7946 GeoJSON, 173-unit OOB, 17 phases, 6 feature kinds) and ported via `UI_MOdified/scripts/port-wargame.js`. The base schema covers anything also valid for W1/W2; this document covers the deltas.

If a future producer wants to drop into the same pipeline, this is the contract they target — match the fields below and the existing porter / renderer will consume the data without code changes.

---

## Source → ported field map

### FeatureCollection-level (top of each `stepNN.geojson`)

| W3 source field                  | Ported into `scenario.steps[i].<field>`     | Type    | Notes                                                                       |
|----------------------------------|---------------------------------------------|---------|-----------------------------------------------------------------------------|
| `properties.version`             | (not preserved per-step; assumed 2)         | int     |                                                                             |
| `properties.phase`               | `index`                                     | int     | 0..N-1                                                                      |
| `properties.time_label`          | `time_label`                                | string  | `D-7`, `D-5`, `D-H`, `D+12h`, …                                              |
| `properties.phase_name_ar`       | `phase_name_ar` (also `narrative_ar_fallback`) | string | Arabic narrative for the phase                                              |
| `properties.kind`                | `kind_native` (legacy `phase` is derived via mapping) | string | `shaping`, `h_hour_strike`, …                                  |
| `properties.phase_line_km`       | `phase_line_km_baseline`                    | number  | Red's depth from coast at end of phase                                      |
| `properties.combined_effect`     | `combined_effect` (also folded into `narrative_en_fallback`) | string  | Paragraph summarising the phase's outcomes                  |
| `properties.step_advantage`      | `step_advantage` (also legacy `ew_effect_baseline`) | enum  | `RED_ADV` / `BLUE_ADV`                                                        |
| `properties.force_ratio_local`   | `force_ratio_local` (also legacy `force_ratio_baseline`) | number | Close-fight ratio at the assault                                |
| `properties.force_ratio_operational` | `force_ratio_operational`                 | number  | Theater-level ratio                                                          |
| `properties.n_units`             | `n_units`                                   | int     | Source's count of `kind: "unit"` features (typically 173)                    |
| `properties.n_actors`            | `n_actors`                                  | int     | Count of units with `is_actor === true`                                      |
| `properties.n_affected`          | `n_affected`                                | int     | Count of units with `is_affected === true`                                   |
| `properties.n_engagement_arcs`   | `n_engagement_arcs`                         | int     | Count of `kind: "engagement_arc"` features                                   |

The legacy `phase` enum (`PRE-H`/`PHASE 1`/`PHASE 2A`/`PHASE 2B`/`PHASE 3`/`RESOLUTION`) is **derived** from `kind` via `W3_PHASE_TO_LEGACY` in `port-wargame.js` so legacy HUD switches keep working.

### Feature kinds

Every feature has `properties.kind` ∈ `{objective, phase_line, off_map_marker, unit, engagement_arc}`.

#### `objective` (1 per step)

| Field                       | Ported to                          | Notes                                                  |
|-----------------------------|------------------------------------|--------------------------------------------------------|
| `properties.id`             | `scenario.obj.id` (implicit)       |                                                        |
| `properties.name_en`        | `scenario.obj.name`                |                                                        |
| `properties.name_ar`        | (not preserved at top level)       |                                                        |
| `properties.depth_km_from_coast` | `scenario.obj.target_depth_km` |                                                        |
| `geometry.coordinates`      | `scenario.obj.coord`               | `[lon, lat]`                                           |

#### `phase_line` (0..1 per step)

| Field                            | Ported to                                       | Notes                                                                  |
|----------------------------------|-------------------------------------------------|------------------------------------------------------------------------|
| `properties.phase_line_km`       | `scenario.steps[i].phase_line_km_baseline`      | Same as the FC's `phase_line_km`                                       |
| `geometry.coordinates`           | concatenated into `scenario.pipeline`           | Each phase_line contributes its 2 endpoints; capped at 64 total points |

#### `off_map_marker` (~11, phase-independent)

Strategic-level installations outside the AO — naval bases, air bases, SSM brigades, logistics nodes. Ported once (de-duplicated by `id`) into `scenario.off_map_markers[]`.

| Field                       | Ported to (`scenario.off_map_markers[k].<field>`) | Type    |
|-----------------------------|---------------------------------------------------|---------|
| `properties.id`             | `id`                                              | string  |
| `properties.side`           | `side`                                            | `RED`/`BLUE`/`NEUTRAL` |
| `properties.type`           | `type`                                            | `naval_base`/`air_base`/`ssm_brigade`/`logistics_node` |
| `properties.name_ar`        | `name_ar`                                         | string  |
| `properties.name_en`        | `name_en`                                         | string  |
| `geometry.coordinates`      | `coord`                                           | `[lon, lat]` |
| (derived)                   | `sidc`                                            | 20-char MIL-STD-2525D SIDC, symbol set 20 |

#### `unit` (always 173, same uids across phases)

Three buckets of fields:

**Identity (immutable across phases) — read from step00 once into `scenario.red_units[]` / `scenario.blue_units_initial[]`:**

| W3 field                    | Ported as                                  | Notes                                          |
|-----------------------------|--------------------------------------------|------------------------------------------------|
| `properties.uid`            | `uid` (red) / `unit_uid` (blue)            | stable across all phases                       |
| `properties.side`           | (encoded in array assignment)              | `RED` → `red_units`, `BLUE` → `blue_units_initial` |
| `properties.domain`         | `domain`                                   | `strategic`/`naval`/`air`/`ground`/`sof`       |
| `properties.type`           | `role` (porter-internal alias)             | e.g. `armored_brigade`, `strike`, `fighter_ad`, `landing_ship` |
| `properties.name_ar`        | `name_ar` + `label` (truncated)            | preserved verbatim plus a short label          |
| `properties.echelon`        | `echelon` (W3 `div`/`bde`/`bn`/`coy`/`sqn`/`flot` → `division`/`brigade`/…) | |
| (derived)                   | `sidc`                                     | 20-char SIDC built from name_ar + role + domain (see "SIDC translator") |

**Per-step position arrays (one array per uid, one entry per phase) — `scenario.red_unit_step_coords` / `_prev`, `scenario.blue_unit_step_coords` / `_prev`:**

| W3 field                    | Ported as                                                            |
|-----------------------------|----------------------------------------------------------------------|
| `geometry.coordinates`      | `red_unit_step_coords[uid][i]` / `blue_unit_step_coords[uid][i]`      |
| `properties.prev_lon`/`prev_lat` | `red_unit_step_prev[uid][i]` / `blue_unit_step_prev[uid][i]`      |

Source placeholder coords (`[18, 32]`, `[18.3, 32.5]`, etc., lat > 31) are replaced with `[<unit's eventual lon>, <stagingLat>]` where `stagingLat = pipeline.maxLat + 0.5°` (≈ 55 km offshore). Renderer reads these to drive marker movement; `prev_*` enables mid-step lerp.

**Per-step live state — `scenario.steps[i].unit_state[uid]`:**

| W3 field                    | Ported to (`unit_state[uid].<field>`)      | Type    | Default if missing       |
|-----------------------------|--------------------------------------------|---------|--------------------------|
| `current_strength`          | `current_strength`                         | number  | `null`                   |
| `initial_strength`          | `initial_strength`                         | number  | `null`                   |
| `destroyed`                 | `destroyed`                                | bool    | `false`                  |
| `suppressed_pct`            | `suppressed_pct`                           | 0..0.85 | `0`                      |
| `delayed_pct`               | `delayed_pct`                              | 0..0.85 | `0`                      |
| `magazine`                  | `magazine`                                 | number? | `null` (when N/A)        |
| `airframes`                 | `airframes`                                | number? | `null` (when N/A)        |
| `hulls_remaining`           | `hulls_remaining`                          | number? | `null` (when N/A)        |
| `is_actor`                  | `is_actor`                                 | bool    | `false`                  |
| `is_affected`               | `is_affected`                              | bool    | `false`                  |

**Per-step actor narrative — `scenario.steps[i].actors[]` (one entry per unit with `is_actor === true`):**

| W3 field                    | Ported to (`actors[k].<field>`)            |
|-----------------------------|--------------------------------------------|
| `properties.uid`            | `uid`                                      |
| `properties.side`           | `side`                                     |
| `properties.action_component` | `action_component` (∈ `strategic`/`maritime`/`air`/`mines`/`usv_uav`/`sof`/`land`/`ew`) |
| `properties.action_what`    | `action_what` (1–2 sentence description)   |
| `properties.action_why`     | `action_why` (doctrinal reasoning)         |
| `properties.action_intended_effect` | `action_intended_effect`           |
| `properties.action_doctrine_cited` | `action_doctrine_cited` (string[])   |

**Per-step affected detail — `scenario.steps[i].affected[]` (one entry per unit with `is_affected === true && status_change !== 'unchanged'`):**

| W3 field                    | Ported to (`affected[k].<field>`)          |
|-----------------------------|--------------------------------------------|
| `properties.uid`            | `uid`                                      |
| `properties.side`           | `side`                                     |
| `properties.status_change`  | `status_change` (∈ `destroyed`/`damaged_partial`/`suppressed`/`delayed`/`expended`) |
| `properties.damage_pct`     | `damage_pct` (0..1)                        |
| `properties.cause_actor`    | `cause_actor` (uid of attacker)            |
| `properties.cause_what`     | `cause_what` (tactical description)        |
| `properties.cause_doctrine` | `cause_doctrine` (calibration reference)   |

#### `engagement_arc` (8–14 per step)

LineString with two endpoints (attacker, target). Ported into `scenario.steps[i].engagement_arcs[]`.

| W3 field                    | Ported to (`engagement_arcs[k].<field>`)   |
|-----------------------------|--------------------------------------------|
| `properties.cause_actor`    | `actor_uid`                                |
| `properties.target_uid`     | `target_uid`                               |
| `properties.actor_side`     | `actor_side`                               |
| `properties.target_side`    | `target_side`                              |
| `properties.status_change`  | `status_change`                            |
| `properties.damage_pct`     | `damage_pct`                               |
| `properties.cause_what`     | `cause_what`                               |
| `properties.cause_doctrine` | `cause_doctrine`                           |
| `geometry.coordinates`      | `coordinates` — **remapped through `red_unit_step_coords`/`blue_unit_step_coords`** so endpoints reflect the rendered (offshore-staging or on-map) positions of the actor and target, NOT the W3 source's raw placeholder coords. |

---

## SIDC translator (Arabic → APP-6D)

For every unit and off-map marker, the porter produces a 20-character MIL-STD-2525D SIDC. The selection is driven by the unit's domain + the Arabic name (`name_ar`) + the W3 `type`. Combining diacritics (shadda/fatha/kasra/etc.) are stripped from `name_ar` before pattern matching so source encoding doesn't matter.

### SIDC layout

| Position | Meaning           | Possible values                                    |
|----------|-------------------|----------------------------------------------------|
| 0–1      | Version           | `10` (2525D)                                       |
| 2        | Context           | `0` (real)                                         |
| 3        | Affiliation       | `6` hostile (RED) / `3` friend (BLUE) / `4` neutral / `1` unknown |
| 4–5      | Symbol set        | `01` Air / `10` Land Unit / `20` Installation / `30` Sea Surface / `35` Sea Subsurface |
| 6        | Status            | `0` present                                        |
| 7        | HQ/TF/Dummy       | `0`                                                |
| 8–9      | Amplifier (echelon) | `10` team / `11` squad / `12` section / `13` platoon / `15` company or squadron / `16` battalion / `17` regiment / `18` brigade / `21` division / `00` unknown |
| 10–15    | Main icon (6 digits) | see translation tables below                    |
| 16–17    | Modifier 1        | `00`                                               |
| 18–19    | Modifier 2        | `00`                                               |

### Symbol set selection

The symbol set is picked from `domain` + `name_ar` matches:

| Match (any)                                                                  | Symbol set |
|------------------------------------------------------------------------------|------------|
| `domain == "subsurface"` OR `name_ar` contains `غواصة`                       | `35` Sea Subsurface |
| `domain == "naval"` OR `name_ar` matches `زورق|سفينة|سفن|مدمر|فرقاط|كورفيت|إبرار|بحري|هوفر|كاسحة|قانصة` | `30` Sea Surface |
| `domain == "air"` OR `name_ar` contains `طائر|عمودي|مسير|إنذار مبكر`        | `01` Air |
| (otherwise)                                                                  | `10` Land Unit |
| (off-map markers)                                                             | `20` Installation |

### Main-icon picks (Symbol Set 01 — Air)

| Arabic match                                | Icon (6-digit) | Meaning                  |
|---------------------------------------------|----------------|--------------------------|
| `عمودي` + `هجوم`                            | `120100`       | Attack helicopter        |
| `عمودي` + `نقل`                             | `120200`       | Cargo helicopter         |
| `عمودي` (else)                              | `120300`       | Utility helicopter       |
| `مسير` + `استطلاع|مراقبة`                   | `130100`       | ISR UAV                  |
| `مسير` + `متفجر|هجوم|kamikaze`              | `130200`       | Attack/kamikaze UAV      |
| `مسير` (else)                               | `130000`       | Generic UAV              |
| `إنذار مبكر|awacs|aew`                      | `110600`       | Surveillance / AEW       |
| `نقل|سي 130|c-130|transport|cargo`          | `110400`       | Transport / cargo        |
| `ميراج|سوخوي|sukhoi|mirage|هجوم أرضي|attack|strike` | `110200` | Attack (ground attack)   |
| `ميج|mig|رافال|rafale|أف 16|f-16|دفاع جوي|fighter` | `110100` | Fighter                 |
| (else)                                       | `110000`       | Generic fixed-wing       |

### Main-icon picks (Symbol Set 30 — Sea Surface)

| Arabic / role match                          | Icon     | Meaning                  |
|----------------------------------------------|----------|--------------------------|
| `مدمر` / `destroyer`                         | `120103` | Destroyer                |
| `فرقاط` / `frigate`                          | `120104` | Frigate                  |
| `كورفيت` / `corvette`                        | `120105` | Corvette                 |
| `زورق صواريخ` / `missile_boat`               | `120106` | Missile boat / FAC       |
| `كاسحة|قانصة` / `mine_sweeper|mine_hunter`   | `120601` | Minesweeper / hunter     |
| `بث ألغام` / `mine_layer`                    | `120602` | Minelayer                |
| `سفينة إبرار` / `landing_ship`               | `120903` | Landing ship             |
| `زورق إبرار` / `landing_craft`               | `120902` | Landing craft            |
| `هوفر` / `hovercraft`                        | `120902` | LCAC                     |
| `تجاري|merchant`                             | `120201` | Merchant                 |
| `مرور|تفتيش|patrol`                          | `120200` | Patrol craft             |
| `قيادة|command`                              | `120200` | Command                  |
| `اخلاء طبي|medical_evac`                     | `120203` | Hospital ship            |
| `إمداد|صيانة|auxiliary`                      | `120300` | Auxiliary                |
| (else)                                       | `120100` | Generic surface combatant |

### Main-icon picks (Symbol Set 10 — Land Unit)

| Arabic / role match                                                      | Icon     | Meaning                  |
|--------------------------------------------------------------------------|----------|--------------------------|
| `عمليات خاصة|sof|special_ops|special_forces`                             | `161000` | Special Operations Forces |
| `دفاع جوي|سام|hawk|هوك|اس 300|s-300|sam|air_defense`                     | `130501` | Air Defense / SAM        |
| `manpads|كتف حرارية`                                                     | `130502` | MANPADS                  |
| `صواريخ.*أرض` or `صواريخ.*\d+ كم` or `ssm`                                | `130201` | Surface-to-Surface Missile |
| `م/د|atgm|anti_tank`                                                     | `120401` | Anti-tank guided missile |
| `دبابات|مدرع|tank|armored`                                                | `121300` | Armor / tanks            |
| `مشاة الآلي|الآلية|mech_*|mechanized`                                     | `121102` | Mechanized infantry      |
| `استطلاع|recon`                                                          | `121105` | Reconnaissance           |
| `مشاة|infantry`                                                          | `121100` | Infantry                 |
| `مدفعية|artillery|field_arty`                                            | `130301` | Field artillery          |
| `رادار|radar|sensor`                                                     | `130901` | Sensor / radar           |
| `هندسة|engineer`                                                         | `140700` | Engineer                 |
| `اشارة|إشارة|signal|comm`                                                | `140900` | Signal                   |
| `كيميائي|chem|cbrn`                                                      | `141700` | CBRN defense             |
| `حرب الكترونية|electronic_warfare|ew_bn`                                 | `141400` | Electronic warfare       |
| `طبية|طبي|medical`                                                       | `141100` | Medical                  |
| `تزويد|إمداد|نقل|supply|logistics|transport`                              | `141500` | Supply / logistics       |
| `صيانة|maintenance`                                                      | `141800` | Maintenance              |
| `شرطة عسكرية|military_police|mp`                                         | `161100` | Military police          |
| (else)                                                                   | `120000` | Generic maneuver         |

### Main-icon picks (Symbol Set 20 — Installation, for off-map markers)

| Type match                  | Icon     | Meaning                  |
|-----------------------------|----------|--------------------------|
| `air_base` / `قاعدة … جوي`  | `110203` | Airfield / air base      |
| `naval_base` / `قاعدة … بحري` | `110204` | Naval port / naval base |
| `ssm_brigade` / `صواريخ أرض/أرض` | `110702` | SSM site                 |
| `logistics_node`            | `110800` | Logistics installation   |
| (else)                      | `110100` | Generic military installation |

---

## Status_change semantics

When a unit has `is_affected === true`, the `status_change` field tells the renderer how to depict the per-phase damage:

| Value             | Sticky? | Visual treatment                                | Color    |
|-------------------|---------|-------------------------------------------------|----------|
| `destroyed`       | **Yes** | Grayscale icon + diagonal X overlay (permanent) | `#b00020` red |
| `damaged_partial` | No      | NATO SIDC status digit `3` (damaged bar)        | `#d97706` orange |
| `suppressed`      | No      | NATO SIDC status digit `3` (damaged bar)        | `#ca8a04` yellow |
| `delayed`         | No      | NATO SIDC status digit `3` (damaged bar)        | `#7c3aed` purple |
| `expended`        | No      | NATO SIDC status digit `3` (damaged bar)        | `#2563eb` blue |
| `unchanged`       | No      | None                                            | `#4b5563` gray |

**Sticky** means: once set, the visual persists across all subsequent phases (the unit is permanently gone). Non-sticky damage is cleared at the start of every phase via `applyW3PerStepDamage()`; the unit appears damaged only during the phase it was hit.

Engagement arcs use the same color palette (`STATUS_COLORS` in `adjudicator-map.js`) to color the dashed line connecting attacker → target.

---

## Coordinate semantics — "off-map staging" vs "on-map"

W3 source places every unit at an off-map staging coord during phases where it hasn't entered the operational area yet — typically `[18, 32]` / `[18, 33]` / `[18.3, 32.5]` (lat > 31). The porter detects these via `isPlaceholder(c) = c[1] > 31 || (c[0] === 18 && c[1] === 32)` and replaces them with `[<unit's eventual lon>, stagingLat]`, where:

- `stagingLat = pipeline.maxLat + 0.5°` ≈ 31.04° N (≈ 55 km north of the Brega coast)
- `<unit's eventual lon>` = the unit's first non-placeholder longitude across all 17 phases

This makes the pre-D-H staging visible as a "ships at sea" formation that converges onto the coast at D-H. The unit's `appear` field is set to the first step index where the unit transitions out of placeholder state — the renderer uses this to gate the role-based spread offset (offshore staging stays tight, on-map gets dispersed by role).

---

## Renderer field consumption

| Renderer behavior                            | Source field                                     |
|----------------------------------------------|--------------------------------------------------|
| Unit position per step                       | `red_unit_step_coords[uid][i]` / `blue_unit_step_coords[uid][i]` |
| Sub-step interpolation start point           | `red_unit_step_prev[uid][i]` / `blue_unit_step_prev[uid][i]` |
| Role-based spread (post-landing fan-out)     | `red_units[k].role` → `RED_W3_SPREAD_KM` table (adjudicator-map.js) |
| Side nudge (blue defensive line offset south) | `meta.side` (RED → +0, BLUE → -2 km N)         |
| Echelon banding (pre-D-H staging rows)       | `meta.echelon` (division +2, brigade +0.5, etc.) |
| Engagement arc rendering                     | `state.engagement_arcs[]` colored by `status_change` |
| Destroyed X overlay                          | `state.blue_destroyed_cumulative[]` + `state.per_unit_deltas.red_degraded[]` |
| Per-phase damage tint                        | `state.affected[]` (non-destroyed entries)       |
| Hover tooltip — actor narrative              | `state.actors[]` keyed by uid                    |
| Hover tooltip — cause-effect                 | `state.affected[]` keyed by uid                  |
| Per-unit strength readout                    | `state.unit_state[uid].current_strength` / `.initial_strength` |
| Per-unit munitions readout (SSM, naval, air) | `state.unit_state[uid].magazine` / `.airframes` / `.hulls_remaining` |
| Off-map marker icon                          | `scenario.off_map_markers[k].sidc`               |
| SITREP banner phase + native kind            | `state.phase` + `state.kind_native`              |
| Marker CSS transition duration               | `body.wg-w3` → 1500ms (vs. 500ms default)        |

---

## Validation invariants

When `schema_variant === 'w3-rich'`:

1. `scenario.steps.length === scenario.phase_table.length` — one phase row per step
2. `scenario.steps[i].n_actors === scenario.steps[i].actors.length` — count matches array
3. `scenario.steps[i].n_affected === scenario.steps[i].affected.length`
4. `scenario.steps[i].n_engagement_arcs === scenario.steps[i].engagement_arcs.length`
5. `Object.keys(scenario.steps[i].unit_state).length === scenario.steps[i].n_units` — every unit has a state entry
6. Every uid in `engagement_arcs[].actor_uid` / `.target_uid` either appears in `red_units` / `blue_units_initial` OR `off_map_markers`
7. `scenario.red_units[k].appear` is in `[0, scenario.steps.length - 1]`
8. `pipeline.length ≥ 2` and ≤ 64
9. `obj.coord` lies within `map_bbox`
10. SIDC strings are exactly 20 characters, all ASCII digits

The validator (`UI_MOdified/server/ai/scenario-validator.js`) enforces 1, 7, 8, 9; the others are documented invariants the porter guarantees but are not yet machine-checked.

---

## Next-import contract

To re-import an updated W3 source folder:

1. Place it as `UI_MOdified/WargameN/` (folder name starts with `Wargame`).
2. Ensure step files are dense: `step00.geojson` through `stepNN.geojson` with no gaps.
3. Run `node UI_MOdified/scripts/port-wargame.js WargameN` (or omit the arg to port all wargame folders).
4. Output lands at `UI_MOdified/data/scenarios/<lowercased-folder-name>.json`.
5. Restart the dev server so it picks up the new file (no caching of scenario JSON).
6. The HUD's scenario picker shows the new entry; load it and step through.

If the producer adds new vocabulary not covered by the SIDC translator (e.g. a new aircraft type, a new ship class), the SIDC will fall back to a generic icon for that domain — milsymbol degrades gracefully. To add the specific icon, extend the regex tables in `pickMainIcon()` inside `UI_MOdified/scripts/port-wargame.js`.

If the producer adds new `status_change` values, extend `STATUS_COLORS` in `UI_MOdified/client/wargame/adjudicator-map.js`.

If the producer adds new `kind_native` values (new phase types), extend `W3_PHASE_TO_LEGACY` in `UI_MOdified/scripts/port-wargame.js` — unknown values currently fall back to a heuristic `w4PhaseLabel()` which assigns phases by step index ratio.
