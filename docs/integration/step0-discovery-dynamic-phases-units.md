# STEP0-DISCOVERY-1 — Step 0 JSON sources, dynamic phases & unit counts

**Date:** 2026-06-06 · **Mode:** discovery only (no code/file changes) · **Branch:** main

**Headline:** Phases and unit counts are **already derived from source data**, not hardcoded into the run
loop. WarGamingGEN iterates `scenario.json.phases[]` (currently 17) and parses units from the DOCX into an
OOB JSON. The **only functional `17`** in the whole pipeline is a *fallback default* in one RMOOZ helper
(`wargame-sim-bridge.js:182`) used when `scenario.json` can't be read. The `17` you see in the wizard
("phase 5 / 17") is the **real count read from `scenario.json`** — if that file had 12 phases it would show
`/12`. So the system is ~90% dynamic today; the work is removing a couple of cosmetic/fallback `17`s and
surfacing source counts in the UI — **not** a rebuild. **Step 0 is planning context, not the phase/unit
contract.**

---

## 1. Step 0 folder inventory

`UI_MOdified/TestingAI/Step 0/` and `C:/Users/EngCoder/Desktop/TestingAI/Step 0/` are **identical**:

| File | Size | Nature |
|---|---|---|
| `Staff_Brief.json` | 19 KB | MDMP staff estimate (logistics, terrain, weather, enemy composition/deployment/morale) |
| `warning_order.json` | 24.8 KB | Warning order (mission, friendly forces, CONOPS, timings, AO, CCIRs) |
| `initial_planning_guide.json` | 4.2 KB | Planning timeline (1/3–2/3 rule, time allocations) |
| `time_estimates.json` | 358 B | Subset of the planning timeline |
| `New Text Document*.txt` | small | scratch notes |

**These are human-planning products (MDMP), not a machine-readable phase plan or structured ORBAT.** None
contains a `phases[]` array, a step list, or per-unit records keyed for the run loop. They are *context*
(the kind of material that feeds LLM/SmartSearch reasoning), **not** the source that drives phase count or
unit count today.

## 2. JSON file summaries

**`Staff_Brief.json`** — keys: `Logistical_Rations, Fuel, ammunition, Spare_parts, Transportation,
Maintenance, Field_Hospitals, Supply_Conclusions, Terrain, Weather, First_light, Last_light, Moon,
Composition, Deployments, Force_Coverage, Morale, Training, Enemy_Tactics_in_Exposure_Operations_PhaseN…`.
Prose/estimates. No structured unit list, no phase array.

**`warning_order.json`** — keys: `friendly_forces, join_op_mission, joint_ops_*, Attached_and_Detached_units,
Operational_Assumptions, GROUND_COMPONENT_MISSION, Concept_of_operations, Units_Duty, Timings, situation,
area_interest, operations_area, Viewports, Appendices…`. Mission/CONOPS text + some force prose. No
enumerable ORBAT, no `phases[]`.

**`initial_planning_guide.json` / `time_estimates.json`** — planning clock only (`total_available_time`,
`allocated_planning_time`, `time_for_mission_analysis`, …). No phases, no units.

**The real machine-readable sources (in `WarGamingGEN/inputs/`):**

- **`scenario.json`** (5.97 KB) — **the phase driver.** Top keys: `operation_name, bbox_wgs84,
  coast_lat_approx, objective, d_day_iso, phases, off_map_markers, attack_ratio_*`. `phases` is an **array of
  17** objects `{step, time_label, phase_name_ar, kind, phase_line_km}`. **There is NO `phase_count` field —
  the count is `phases.length`.** It carries **no force/unit roster** (only `objective` + ratios).
- **`inputs/forces/current_oob_from_docx.json`** (84 KB) — **the unit source of truth.**
  `{ source_note, red:{side,source_file,units[]}, blue:{side,source_file,units[]} }`.
  `source_note`: *"Generated directly from WarGamingGEN/inputs/forces/*.docx using
  src.parsers.docx_parser.parse_docx_oob."* **RED = 84 units, BLUE = 89 units**, each
  `{uid, side, name_ar, echelon, domain, type, parent_uid, …}`. (Present in the Desktop tree only — it's a
  by-product of a DOCX parse run.)
- **`inputs/forces/oob_docx_comparison.json`** (35 KB) — `{date_note, current:{red,blue}, matched_previous_docx[7]}`
  — diff of the current vs prior DOCX OOB.

## 3. Current source of `phases_total`

**Dynamic, with a fallback.** Chain:
1. **WarGamingGEN** iterates `scenario.phases` — `orchestrator.py:121-128` (`phases = sorted(scenario.phases…)`,
   sliced by `max_phases`); `test_full_run.py:260` asserts `len(records) == (max_phases or len(scenario.phases))`.
   **No hardcoded 17 in the loop** — the only `17` in WarGamingGEN is a doc comment (`test_full_run.py:5`).
2. **RMOOZ bridge** `phasesTotal(c)` (`wargame-sim-bridge.js:176-183`) reads `scenario.json` →
   `phases.length`; **`return 17` is the fallback** only when the file is missing/unreadable.
3. **Wizard** uses `sim.phases_total` from `/status` (no literal `17` in `scenario-import-wizard.js`). The
   displayed "/17" is the live value read from `scenario.json`.

So `phases_total` is **already source-driven**; 17 is a coincidence of the current `scenario.json` plus one
fallback constant.

## 4. Current source of unit counts

**Derived, not hardcoded.** Two stages:
- **Generation:** units originate from the **DOCX → OOB parse** (`docx_parser.parse_docx_oob` →
  `current_oob_from_docx.json`, RED 84 / BLUE 89) and WarGamingGEN writes them into the per-phase
  GeoJSON features.
- **RMOOZ import:** `port-wargame.js` **counts features** — `extractRedUnits` unions all RED point features
  across steps; `extractBlueInitial` reads BLUE step-00 features. `red_units` / `blue_units` in the import
  response are `scenario.red_units.length` / `scenario.blue_units_initial.length`. **No unit count is hardcoded
  and the porter applies no unit cap.** (The 70/80 seen in the partial test was the 5-phase subset; a full run
  reflects the full roster.)
- **Caps live only in validation:** `scenario-schema-spec.js:29-30` — `red_units {min:1, max:200}`,
  `blue_units_initial {min:1, max:100}` (W3 raises red to 200 via `W3_RED_MAX`). These are **ceilings that
  reject** an over-count scenario; they don't fabricate or trim counts.

## 5. Hardcoded phase/unit assumptions (the actual list)

| Location | What | Severity |
|---|---|---|
| `wargame-sim-bridge.js:182` | `return 17` fallback when `scenario.json` unreadable | **functional** — replace with a safer signal (see §7) |
| `scenario-schema-spec.js:29-30` | `red_units` max **200**, `blue_units_initial` max **100** | **functional cap** — a >200 red or >100 blue OOB would fail validation |
| `scenario-schema-spec.js:27` | `steps` ∈ **[4..20]** (validator floor/ceiling) | **functional** — partial import floor (4) + ceiling (20) derive from this, good but fixed |
| `port-wargame.js:1517,1539` | default `scenario_label` / `terrain_note` strings say "173-unit OOB, 17 phases" | cosmetic — only used when meta doesn't override; misleading text, not logic |
| `port-wargame.js:473-485` | `w4PhaseLabel` comment cites "17-phase strike model" | cosmetic — the math is **relative** (`stepIndex/(stepCount-1)`), already scales to any count |
| `test_full_run.py:5` | "(run all 17)" doc comment | cosmetic |

No hardcoded scenario name drives logic; no place trims/caps the unit *list*; no Wargame-3-only branch in the
run/import path (the porter's W3/W4 shape detection is data-driven). The only **Wargame-3-flavored** leftovers
are the cosmetic default strings above.

## 6. Can Step 0 become the source of truth?

**For phases/units: no — and it shouldn't be forced to.** Step 0 JSONs are MDMP narrative/estimate products
without an enumerable `phases[]` or per-unit ORBAT. The **existing** sources are already correct and machine-
readable:
- **Phases →** `scenario.json.phases[]` (authoritative, dynamic).
- **Units →** `current_oob_from_docx.json` (authoritative pre-generation count) and the generated GeoJSON
  (authoritative post-generation count).

**Step 0's right role is enrichment/context**, not the phase/unit contract: it can supply objective text,
AO, timings, and planning assumptions to display alongside a scenario, but turning its prose into phases/units
would require an LLM/parser step (explicitly out of scope and risk-prone). **Recommendation: keep
`scenario.json` + OOB-JSON as the contract; treat Step 0 as optional contextual metadata.**

## 7. Recommended dynamic data model (contract)

A single, source-derived shape the bridge can expose and the wizard can consume — **no invented values**:

```jsonc
{
  "phases_total":   17,        // scenario.json phases.length  (NOT a constant)
  "phases": [ { "step": 0, "time_label": "D-7", "kind": "shaping" }, ... ],  // from scenario.json
  "units_total_red":  84,      // current_oob_from_docx.json red.units.length  (pre-generation)
  "units_total_blue": 89,      // current_oob_from_docx.json blue.units.length (pre-generation)
  "units_imported_red":  N,    // post-import: scenario.red_units.length  (from GeoJSON via porter)
  "units_imported_blue": N,    // post-import: scenario.blue_units_initial.length
  "objective": { "name": "...", "coord": [lon,lat] },  // scenario.json objective
  "ao_bbox":  [lon_min, lat_min, lon_max, lat_max],    // scenario.json bbox_wgs84
  "phase_total_source": "scenario.json | run_index.json | checkpoints | fallback"  // provenance, never silent
}
```

Resolution order for `phases_total` (each step is *source data*, fallback only last):
`scenario.json phases.length` → (post-run) `run_index.json n_phases` → live `checkpoints` count →
**only if all absent** a labeled fallback (and the UI shows "unknown total" rather than a fake 17).

Unit display:
- **Before generation:** read `current_oob_from_docx.json` (red/blue `units.length`) → "Red 84 · Blue 89
  (from documents)".
- **After import:** `scenario.red_units.length` / `blue_units_initial.length` → "Red N · Blue N (imported)".

## 8. Recommended implementation phases (later — not now)

1. **STEP0-2 (bridge):** add a `units` block to `/status` (read `current_oob_from_docx.json` if present:
   `units_total_red/blue` + `source`). Make `phasesTotal()` return `{value, source}` and have `null/unknown`
   instead of silently defaulting to 17; keep 17 only as an explicitly-labeled last resort.
2. **STEP0-3 (wizard):** show pre-generation "Red/Blue from documents: N/N" once DOCX are staged; show
   post-import "imported N/N"; progress bar already uses `phases_total` — just ensure it renders "phase X / N
   (source: scenario.json)" and tolerates `unknown`.
3. **STEP0-4 (validator, gated):** make `red_units`/`blue_units_initial`/`steps` ceilings **configurable**
   (or raise) so a larger real OOB/longer plan isn't rejected; keep the partial floor tied to
   `COUNT_BOUNDS.steps.min` (already the case) rather than a fixed scenario assumption.
4. **STEP0-5 (cosmetic):** stop emitting the "173-unit OOB / 17 phases" default label/terrain strings in
   `port-wargame.js`; derive them from actual counts.
5. **(Optional) STEP0-6:** surface Step 0 context (objective/AO/timings) read-only next to a scenario — no
   phase/unit derivation from prose.

## 9. Risks & guardrails

- **Never invent phases or units** — every count must trace to `scenario.json`, the OOB JSON, the GeoJSON, or
  the checkpoints. If a source is missing, show "unknown", don't fabricate (kills the silent-17 problem).
- **`current_oob_from_docx.json` is Desktop-tree only** and is a *parse by-product* — treat as optional;
  absence must degrade gracefully (no pre-count shown), not error.
- **Validation ceilings (200/100/20) can reject real data** — raising them is a schema change; verify the
  renderer/adjudicator handle larger N before lifting (test with a >200-unit or >20-phase fixture).
- **Partial floor stays = `COUNT_BOUNDS.steps.min` (4)** — schema-derived, not a per-scenario guess (already
  honored by UNIFIED-IMPORT-2).
- **No DOCX parsing in RMOOZ, no SmartSearch change, no WarGamingGEN behavior change** in any follow-up —
  RMOOZ only *reads* the JSON the pipeline already produces.
- **Don't make Step 0 prose authoritative** — it would require an LLM/parser and could invent structure.

---

## Acceptance

✅ We now know exactly what Step 0 contains (MDMP planning products: Staff_Brief, warning_order, planning
timeline — **no enumerable phases or ORBAT**), and that it **cannot and need not** replace the existing,
already-dynamic sources. Phases come from `scenario.json.phases[]` (WarGamingGEN iterates it; 17 is current
data + one RMOOZ fallback constant). Units come from the DOCX→OOB parse (`current_oob_from_docx.json`, RED 84
/ BLUE 89) and the generated GeoJSON (porter counts them; no cap in derivation, only validation ceilings of
200/100). The concrete hardcoded items are enumerated in §5; the dynamic contract + phased plan are in §7–§8.
**No files were changed.**
