# TestingAI → RMOOZ Pipeline Audit (Discovery)

**Date:** 2026-06-05
**Status:** DISCOVERY ONLY — no features implemented. No hardcoded data proposed.
**Scope:** how data flows from the decision-making app (Hermes) → TestingAI/WarGamingGEN → RMOOZ, and the fastest no-hardcoding path to display regenerated outputs in RMOOZ.

> **Headline finding:** RMOOZ **already** ships `UI_MOdified/scripts/port-wargame.js` (wired to `POST /api/scenario/import`). Run empirically against the **live** WarGamingGEN v2 `all_phases.geojson`, it produced a valid RMOOZ scenario — **70 Red + 80 Blue units, 17 phases, objective, SIDC symbols, real coordinates — all derived, nothing invented.** Option C (import GeoJSON outputs) is therefore ~90% built today.

---

## 1. Current pipeline diagram

```
┌──────────────────────────────┐   produces                         ┌──────────────────────────────┐
│  Hermes / MODE_PROJECT        │ ── Step 0/1 JSON ────────────────▶ │  (Planning context — Arabic   │
│  (decision-making / MDMP)     │    warning_order / Staff_Brief /   │   MDMP package; NOT consumed  │
│                               │    planning_guide / time_estimates │   by WarGamingGEN)            │
│  source .docx ─▶ 16 chains    │                                    └──────────────────────────────┘
│                               │ ── red_team.docx / blue_team.docx ─┐
└──────────────────────────────┘    (Arabic ORBAT outlines)         │
                                                                     ▼
                              ┌────────────────────────────────────────────────────────┐
   inputs/scenario.json ────▶ │  TestingAI / WarGamingGEN  (deterministic engine + 3   │
   inputs/gis/* ────────────▶ │  LLM agents: Red / Blue / White)                       │
   SmartSearch (doctrine RAG)─▶│  parsers ▸ world_state ▸ force_model ▸ orchestrator    │
   (read-only)                └───────────────────────────┬────────────────────────────┘
                                                          │ writes runs/<ts>/outputs/
                                                          ▼
                          ┌───────────────────────────────────────────────┐
                          │  wargameschedule.csv                          │
                          │  wargame_report.md                            │
                          │  geojson/step00..step16.geojson               │
                          │  geojson/all_phases.geojson  (3301 features)  │
                          │  checkpoints/phaseNN.json · llm_audit/        │
                          └───────────────────────────┬───────────────────┘
                                                       │  (GeoJSON is the clean handoff)
                                                       ▼
                          ┌───────────────────────────────────────────────┐
                          │  RMOOZ                                         │
                          │  EXISTING: scripts/port-wargame.js            │
                          │  via POST /api/scenario/import                │
                          │  → red/blue units + phases + obj + arcs       │
                          └───────────────────────────────────────────────┘
```

Two **independent** Hermes outputs:
- **red_team.docx / blue_team.docx** → feed WarGamingGEN (force structure).
- **Step 0/1 JSON** (warning_order etc.) → *planning context*; **not** consumed by WarGamingGEN, **not** in the GeoJSON. If RMOOZ wants to show planning context, it imports those JSONs directly (see [step0-planning-import-plan.md](../step0-planning-import-plan.md)).

---

## 2. Input files WarGamingGEN consumes (verified on disk)

| Input | Path | Role |
|---|---|---|
| **scenario.json** | `WarGamingGEN/inputs/scenario.json` | `operation_name`, `bbox_wgs84` `[19.12,29.5,20.02,30.56]`, `objective{id,name_ar,name_en,lon,lat,depth_km_from_coast,carver_total:48}`, `d_day_iso`, `phases[17]` (`step,time_label,phase_name_ar,kind,phase_line_km`), `off_map_markers[]` |
| **red force doc** | `inputs/forces/red_team.docx` | Arabic hierarchical ORBAT (Corps → div → bde → bn → coy). Parsed deterministically. |
| **blue force doc** | `inputs/forces/blue_team.docx` | Same, Blue side. |
| **GIS — DEM** | `inputs/gis/elevation/libya_dem.tif` | terrain/elevation |
| **GIS — boundaries** | `inputs/gis/boundaries/nato-map-layers.geojson` | map layers |
| **GIS — terrain** | `inputs/gis/terrain/{aerodromes,inland_water,landuse,populated_places,roads,water_way}.geojson` | feature layers |
| **GIS — imagery** | `inputs/gis/imagery/satellite_base.jpeg` + `.bbox.json` | basemap |
| **QA mask** | `inputs/qa/sea_mask.npy` | land/sea mask for positioning |
| **Doctrine (SmartSearch)** | external RAG via `src/retrieval/smart_search_client.py` | read-only doctrine retrieval. **DO NOT MODIFY SmartSearch.** |
| **planning JSON (Step 0)** | — | **NOT consumed.** Hermes Step0 JSON is a separate artifact. |

---

## 3. Output files WarGamingGEN produces (verified in `runs/latest/outputs/`)

| Output | Path | Content |
|---|---|---|
| **CSV schedule** | `wargameschedule.csv` | one row per `phase × component`: `red_action, red_why, blue_action, blue_why, combined_effect, red_inventory, red_cum_losses, blue_inventory, blue_cum_losses, red_ammo, blue_ammo` |
| **Markdown report** | `wargame_report.md` | narrative + force-ratio progression table (per-phase FR local/op, advantage, cumulative losses) |
| **Per-phase GeoJSON** | `geojson/step00.geojson … step16.geojson` | RFC 7946 FeatureCollection per phase (~194–197 features each) |
| **Combined GeoJSON** | `geojson/all_phases.geojson` | all phases in one FC (**3301 features**, each tagged `properties.phase`) |
| **Checkpoints** | `runs/<ts>/checkpoints/phaseNN.json` | resumable per-phase records (enables `$0` regen) |
| **LLM audit** | `runs/<ts>/llm_audit/` | every prompt+response |
| **Parsed ORBAT tree** | _(in-memory only — NOT persisted)_ | `docx_parser.ForceUnit` tree (`parent_uid`, `depth`, `counts`). Reflected *flat* in GeoJSON unit features, but the **hierarchy is not written to disk**. |

### GeoJSON feature schemas (the import gold — exact fields)
**FC.properties:** `version, phase, time_label, phase_name_ar, kind, phase_line_km, combined_effect, step_advantage, force_ratio_local, force_ratio_operational, n_units, n_actors, n_affected, n_engagement_arcs`

| `kind` | geometry | properties |
|---|---|---|
| `unit` | Point | `uid, side, domain, type, name_ar, echelon, phase, current_strength, initial_strength, destroyed, suppressed_pct, delayed_pct, magazine, airframes, hulls_remaining, prev_lon, prev_lat, is_actor, is_affected` |
| `engagement_arc` | LineString | `phase, cause_actor, target_uid, status_change, damage_pct, cause_what, cause_doctrine, actor_side, target_side` |
| `objective` | Point | `id, name_ar, name_en, phase, depth_km_from_coast` |
| `off_map_marker` | Point | `id, name_ar, side, type, phase` |
| `phase_line` | LineString | `phase, phase_line_km, time_label` |

### DOCX parser output (`src/parsers/docx_parser.py` → `ForceUnit`)
`uid, side, name_ar, name_en, echelon (div|bde|bn|coy|sqn|flot|unit), domain (ground|air|naval|sof|strategic), type (rich classifier: mech_brigade|destroyer|sam_s300|ssm_brigade|…), parent_uid, depth, counts{}, raw_line` — deterministic, no LLM. **Tree only in memory.**

---

## 4. Mapping table — TestingAI fields → RMOOZ scenario fields

RMOOZ target schema: `name, scenario_label, map_bbox, obj{coord,target_depth_km,carver}, pipeline[], red_units[], blue_units_initial[], blue_units_base_ids[], bls_template[], phase_table[], steps[], sides[], postures{}`.

| RMOOZ field | TestingAI source | Via | Status |
|---|---|---|---|
| `name` / `scenario_label` | `scenario.json.operation_name` / FC `name` | porter `{name}` opt | ✅ structured |
| `map_bbox` | `scenario.json.bbox_wgs84` **or** GeoJSON feature extents | porter derives | ✅ structured |
| `obj.coord` | objective feature `coordinates` | porter | ✅ structured |
| `obj.target_depth_km` | objective `depth_km_from_coast` (90.1) | porter | ✅ structured |
| `obj.carver` | `scenario.json.objective.carver_total` (48) | **defaulted to 30** in porter (geojson objective omits carver) | 🟡 default |
| `pipeline[]` | `phase_line` features per phase | porter synthesizes | ✅ derived |
| `red_units[]` `{uid,label,echelon,role,domain,bls,sidc,coord,appear}` | `unit` features `side=RED` (`uid,name_ar→label,echelon,type→role,domain,coord`) | porter (**verified: 70 units**) | ✅ structured |
| `blue_units_initial[]` | `unit` features `side=BLUE` (**verified: 80 units**) | porter | ✅ structured |
| `*.sidc` | porter-generated milsymbol SIDC from domain/type | porter | ✅ derived |
| `*.appear` | first phase index where unit is live | porter | ✅ derived |
| `*.bls` | — (amphibious GeoJSON carries no explicit BLS) | porter assigns `BLS-1` | 🟡 synthesized |
| `bls_template[]` | — | porter synthesizes **1 placeholder** | 🟡 synthesized |
| `phase_table[]` (17) | FC `properties` per phase (`phase,time_label,phase_name_ar,kind,phase_line_km`) | porter (**verified: 17**) | ✅ structured |
| `steps[]` baselines | per-phase `phase_line_km`, `objective_status`, `bls_status`, `red_degraded` (from `destroyed`/`status_change`), `blue_destroyed` | porter | ✅ derived |
| `steps[].narrative_*` | FC `combined_effect`, `wargame_report.md` | not yet wired | 🟡 available |
| `sides[]` / `postures{}` | RED/BLUE implied | porter/defaults | ✅ derived |
| **ORBAT hierarchy** (`parent_uid`,`depth`) | DOCX parser tree | **not in GeoJSON** | ❌ gap (flat only) |
| **readiness/supply enums** | `current_strength,suppressed_pct,delayed_pct,magazine,airframes,hulls` | numeric, not RMOOZ enums | 🟡 different shape |
| **engagement arcs** | `engagement_arc` features | RMOOZ already renders arcs | ✅ structured |
| **planning context** | Hermes Step0 JSON | separate import | ⛔ not in this pipeline |

---

## 5. Data gaps

**For DISPLAY (the demo): essentially none** — the porter already yields units, coords, phases, objective, arcs, SIDC from the regenerated GeoJSON with no invention.

Residual gaps (matter for a *full editable scenario*, not for display):
1. **ORBAT hierarchy not persisted** — GeoJSON units are flat (`echelon`, `domain` present; no `parent_uid`). A *tree* ORBAT viewer needs the parser's tree → requires TestingAI to export it (proposed below).
2. **BLS / pipeline** — amphibious-specific RMOOZ fields are synthesized (1 placeholder BLS); fine for display, thin for adjudication.
3. **`carver`** — defaulted (geojson objective omits it; `scenario.json` has `carver_total:48`).
4. **readiness/supply** — GeoJSON has strength/suppression/magazine numerics, not RMOOZ readiness/supply enums.
5. **Planning context** — Hermes Step0 JSON is outside this pipeline; import separately, read-only.
6. **No standalone manifest** — nothing currently lists "what this run produced" for a consumer to discover (proposed below).

**No coordinates, units, objectives, or phases need to be invented** — all come from regenerated artifacts.

---

## 6. Recommended fastest demo path (no hardcoding)

**Use the porter that already exists.** Verified end-to-end today:

```
1. TestingAI regenerates outputs from checkpoints ($0, no LLM):
     python -m src.tools.regenerate_outputs       # → runs/latest/outputs/geojson/all_phases.geojson
2. RMOOZ imports that GeoJSON through the EXISTING path:
     POST /api/scenario/import   (body = all_phases.geojson)  → scripts/port-wargame.js
   → produces a RMOOZ scenario: 70 red + 80 blue units, 17 phases, objective, SIDC, coords.
3. RMOOZ displays it (map + ORBAT list + phase timeline + per-phase replay).
```

**Update loop (no hardcoding, regeneration-driven):** edit `red_team.docx`/`blue_team.docx` or `scenario.json` → TestingAI re-runs/regenerates → new `all_phases.geojson` → RMOOZ re-imports → new result on the map. The displayed data is 100% a function of the regenerated files.

**Guardrail note:** `POST /api/scenario/import` writes a durable scenario file (this is its sanctioned job). For the *read-only discovery* phases (INT-A..D) we add a **non-mutating display layer** that reads the GeoJSON without writing a scenario or mutating `window.RmoozScenario`; the porter/import path is reserved for INT-E (scenario seed draft).

---

## 7. Proposed `export_to_rmooz/` folder contract

A stable, versioned handoff folder TestingAI writes after each run (additive — does not change existing outputs):

```
TestingAI/WarGamingGEN/runs/<ts>/export_to_rmooz/
├── manifest.json            # {schema, version, run_id, generated_from, files[], counts}
├── planning_context.json    # OPTIONAL passthrough of Hermes Step0 (warning_order/staff_brief/…)
├── red_orbat.json           # docx_parser tree → [{uid,side,name_ar,echelon,domain,type,parent_uid,depth,counts}]
├── blue_orbat.json          # same for Blue  (CLOSES the hierarchy gap #1)
├── scenario_seed.json       # scenario.json echo (bbox, objective+carver, phases, off_map_markers)
├── geojson/
│   ├── step_00.geojson … step_16.geojson
│   └── all_phases.geojson
├── report.md                # copy of wargame_report.md
└── schedule.csv             # copy of wargameschedule.csv
```

`manifest.json` (proposed):
```json
{
  "schema": "testingai-export",
  "version": 1,
  "run_id": "2026-05-20_22-59-42_gpt4o_v2",
  "generated_from": { "red_docx_sha": "…", "blue_docx_sha": "…", "scenario_sha": "…" },
  "counts": { "red_units": 70, "blue_units": 80, "phases": 17, "geojson_features": 3301 },
  "files": {
    "planning_context": "planning_context.json",
    "red_orbat": "red_orbat.json",
    "blue_orbat": "blue_orbat.json",
    "scenario_seed": "scenario_seed.json",
    "geojson_all": "geojson/all_phases.geojson",
    "geojson_steps": ["geojson/step_00.geojson", "…"],
    "report": "report.md",
    "schedule": "schedule.csv"
  }
}
```
RMOOZ reads `manifest.json` first, then loads only what it needs. Re-export on every regen so the manifest's SHAs drive RMOOZ's "is this stale?" check.

---

## 8. Proposed RMOOZ import phases

| Phase | Deliverable | Reads | Mutation |
|---|---|---|---|
| **INT-A** | **Manifest reader** — point RMOOZ at an `export_to_rmooz/` folder/URL, parse `manifest.json`, list available artifacts + counts. | `manifest.json` | none |
| **INT-B** | **Planning Context panel** (read-only) — render Hermes planning package (mission/enemy/CCIR/ROE) if `planning_context.json` present. | `planning_context.json` | none |
| **INT-C** | **ORBAT viewer** (read-only) — hierarchical Red/Blue tree from `red_orbat.json`/`blue_orbat.json` (echelon/domain/type/parent). Falls back to flat list from GeoJSON units if ORBAT files absent. | `*_orbat.json` / GeoJSON | none |
| **INT-D** | **GeoJSON replay layer** (read-only) — draw units/arcs/objective/phase_line per step on the map; phase scrubber 0→16. Non-mutating overlay (does NOT touch `window.RmoozScenario`). | `geojson/*` | none |
| **INT-E** | **Scenario seed draft** — run the existing `port-wargame.js` to produce a RMOOZ scenario draft; open in Edit Mode for operator review before any save. | `all_phases.geojson` | draft only |
| **INT-F** | **Round-trip edit/export** — operator edits in RMOOZ → export back to a shape TestingAI can re-ingest. | — | durable (gated) |

---

## 9. Risks and guardrails

- **SmartSearch is untouchable** — read-only doctrine RAG; no code changes (HANDOVER hard rule).
- **No hardcoding / no invented data** — every displayed unit/coord/phase must come from a regenerated artifact. Verified the porter honors this (70/80 units derived).
- **`port-wargame.js` writes a durable scenario** — keep INT-A..D as a **non-mutating display layer**; reserve the import/porter path for INT-E. Do not mutate `window.RmoozScenario` during discovery/display.
- **Synthesized defaults are not "data"** — porter's placeholder BLS / defaulted carver must be **labelled as synthesized** in the UI, never shown as authored fact.
- **Arabic / RTL** — all `name_ar` fields are RTL; RMOOZ renders RTL natively (no flags needed).
- **Backend** — RMOOZ already runs a Node server with `POST /api/scenario/import`; no new backend dependency required. Reading an `export_to_rmooz/` folder can be a static fetch.
- **ORBAT tree gap** — until TestingAI exports `*_orbat.json`, INT-C must degrade to the flat GeoJSON unit list (echelon present, hierarchy absent). Don't fake parent links.
- **Versioning** — key off `manifest.version` + DOCX/scenario SHAs so RMOOZ shows stale-vs-fresh honestly.
- **No LLM / no full sim** during integration work — use `regenerate_outputs.py` ($0) to refresh GeoJSON.

---

## 10. Exact next implementation PR prompt

> **PR INT-A+D — Read-only TestingAI GeoJSON viewer in RMOOZ (no hardcoding, no mutation).**
>
> Build a **read-only** display path that imports a WarGamingGEN run and shows it in RMOOZ without writing a scenario or mutating `window.RmoozScenario`.
>
> **Scope:**
> 1. Add a client module `UI_MOdified/client/shell/testingai-import-panel.js` (`window.AppTestingAIImport`) that:
>    - Accepts a folder/URL or file drop of `manifest.json` **or** a raw `all_phases.geojson`.
>    - If a manifest is present, lists artifacts + counts (INT-A).
>    - Renders a **read-only ORBAT list** grouped by `side → echelon → domain` from GeoJSON `unit` features (flat; INT-C-lite). Use `red_orbat.json`/`blue_orbat.json` if present for true hierarchy.
>    - Renders a **read-only map replay layer** (INT-D): per-step units (Point), engagement arcs (LineString), objective, phase_line; a phase scrubber 0→N driven by `properties.phase`. Draw on a dedicated non-interactive Leaflet pane; **do not** call `loadLiveScenarioFromJson`, **do not** write `window.RmoozScenario`.
> 2. Reuse existing helpers: milsymbol for SIDC, the adjudicator-map pane pattern, the timeline-event-ticks pattern. Do **not** add a backend route (read the file client-side).
> 3. Label any synthesized/default value (e.g. placeholder BLS, defaulted carver) explicitly as "synthesized".
>
> **Data source:** `C:/Users/ADMIN/Desktop/TestingAI/WarGamingGEN/runs/latest/outputs/geojson/all_phases.geojson` (verified: 70 red + 80 blue units, 17 phases, objective, arcs).
>
> **Constraints:** no hardcoded units/coords/phases; no SmartSearch changes; no `window.RmoozScenario` mutation; no LLM/sim. All rendered data must come from the loaded GeoJSON.
>
> **Acceptance:** loading the real `all_phases.geojson` shows 70+80 units on the map at correct lat/lon, a 17-step phase scrubber animates unit positions + arcs, and an ORBAT list reflects the file — with zero hardcoded fallback data and no scenario written. Editing the DOCX + regenerating in TestingAI + reloading shows the new result.

---

## Acceptance check (this audit)
✅ We understand how Hermes, TestingAI/WarGamingGEN, and RMOOZ connect (diagram §1, inputs §2, outputs §3).
✅ We have a concrete field mapping (§4) and gap list (§5).
✅ We have a **no-hardcoding** path to display regenerated outputs — and verified the existing porter already produces 70+80 units from the live GeoJSON (§6).
✅ Folder contract (§7), phased plan (§8), guardrails (§9), and a ready-to-run next PR prompt (§10).
