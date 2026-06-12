# Plan — Importing Step 0 (MDMP) Planning Data into RMOOZ

**Date:** 2026-06-05
**Status:** DRAFT for review — no code written yet
**Source data:** `TestingAI/Step 0/` (4 JSON + 2 explainer txt)

---

## 1. Context — the pipeline you're describing

Three systems, one chain:

```
┌─────────────────────┐   Step 0 JSON     ┌─────────────────────┐   scenario+data   ┌──────────────────────┐
│  Hermes / MODE_PROJ │  (warning_order,  │      RMOOZ / CMO    │   (our scenario   │    WarGamingGEN      │
│  (MDMP planner —    │ ─ Staff_Brief,  ─▶│  (author + play     │ ─ + map + forces)▶│  (AI Red/Blue/White  │
│   the "other app")  │   planning_guide, │   the scenario)     │                   │   sim → GeoJSON)     │
└─────────────────────┘   time_estimates) └─────────────────────┘                   └──────────┬───────────┘
                                                     ▲                                          │
                                                     └───────────── results (GeoJSON) ──────────┘
```

- **Hermes** turns Arabic `.docx` (Warning Order + Intel Summary) into the **Step 0 planning package** via 16 LangChain chains. *(per `Step 0/New Text Document*.txt`)*
- **RMOOZ** (this app) is where the operator turns that package into a **playable scenario** on a map.
- **WarGamingGEN** (`TestingAI/`) is the downstream AI simulator. Its scenario input shape is known (`WarGamingGEN/inputs/scenario.json`): `operation_name`, `bbox_wgs84`, `objective{lon,lat,carver}`, `d_day_iso`, `phases[]`, `off_map_markers[]`.

---

## 2. What Step 0 actually contains

The 4 JSON files are a complete Arabic **MDMP "Receipt of Mission"** package — rich in *intent and context*, defensive ground operation (المكون البري defending the western strategic direction against an enemy amphibious + ground attack):

| File | Key content |
|---|---|
| `warning_order.json` | mission, situation, **enemy_forces**, **friendly_forces**, tasks per brigade (`Units_Duty`), **CCIR**, **ROE**, sustainment, assembly-area MGRS `40RCN596875`, timing, references |
| `Staff_Brief.json` | enemy composition / deployments / **capabilities** (EW, chemical/Sarin, artillery 2S1+BM-21), force composition, readiness (>95%), conclusions |
| `initial_planning_guide.json` | coordination duties, authorized movements, CCIR, planning times |
| `time_estimates.json` | the 1/3–2/3 planning clock: 600 min total, 200 planning / 400 subordinate, H-hour, D-day |

---

## 3. Field mapping — Step 0 → RMOOZ scenario

RMOOZ scenario schema (per `docs/scenario-schema.md`, `scenario-validator.js`, `scenario-authoring-schema.js`):

| RMOOZ field | Source in Step 0 | Status |
|---|---|---|
| `sides[]` (id, name_en, **name_ar**, role, color) | `friendly_forces`, `enemy_forces`, `header2/3` | ✅ **HAVE** — Arabic names map directly |
| `postures{}` | defaults + relationship implied (RED hostile to BLUE) | ✅ **HAVE** |
| `ROE` / doctrine evidence | `ROE` field (Arabic, 3 clauses) | ✅ **HAVE** |
| per-step `narrative_ar_baseline` | `situation`, `Enemy_Tactics_*_Phase1/2/3` | ✅ **HAVE** (rich) |
| `phase_table[]` | enemy phases (Prep/Prep/Main Attack) + `time_estimates` | 🟡 **PARTIAL** — needs step alignment |
| `provenance{}` (source, producer, generated_by_ai) | tag as "Hermes MDMP" | ✅ **HAVE** — authoring schema already has this block |
| scenario `metadata` (label, period, language) | `join_op_mission`, `date_time`, `time_zone` | ✅ **HAVE** |
| CCIR / sustainment / intel (extra context) | `Commanders_Critical_Information_Requirements`, `Sustainment`, `Enemy_Capabilities` | ✅ **HAVE** (no schema slot yet — see §5 panel) |
| `map_bbox` | — only text ("western direction", redacted city `----`) | ❌ **MISSING** |
| `obj.coord` / `obj.carver` | assembly-area MGRS exists, but objective coord does not | ❌ **MISSING** |
| `red_units[]` / `blue_units_initial[]` (structured, with coords) | Arabic **prose** OOB only | ❌ **MISSING** (not structured) |
| `bls_template[]`, `pipeline[]` | not present (this is a defensive land op) | ❌ **MISSING** |

### The core realization
**Step 0 fills the *soft* half of a scenario (intent, sides, enemy picture, ROE, timing, narratives) completely — but carries no map geometry (bbox, coords, structured units).** RMOOZ already owns the tool for the *hard* half: **Edit Mode** + map-as-editor (`scenario-edit-mode.js`). So the two halves compose.

---

## 4. What we HAVE vs DON'T HAVE in RMOOZ

**HAVE (reuse, don't rebuild):**
- Scenario authoring schema with `provenance`, bilingual `name_ar`, `sides`, `posture`, `doctrine/ROE` slots — `shell/scenario-authoring-schema.js`
- Edit Mode draft + map-as-editor (draw AO/obj/pipeline/BLS, place units) — `shell/scenario-edit-mode.js`
- Scenario validation + durable save — `POST /api/scenarios`, `scenario-validator.js`
- Per-step EN/AR briefing narratives in the draft
- Load path — `loadLiveScenarioFromJson()`

**DON'T HAVE (the new work):**
1. **A Step 0 ingest/importer** — reads the 4 JSONs and maps them into a RMOOZ draft (the soft half).
2. **A Planning Context surface** — to display the rich Arabic MDMP text (mission, enemy, CCIR, ROE, sustainment) that has no scenario-schema home. RMOOZ has narrative fields but no MDMP-document viewer.
3. **Structured OOB from prose** — turning Arabic force descriptions into placeable units (deferred; manual placement covers v1).
4. **Geometry source** — no coords in Step 0; operator supplies via Edit Mode for v1.
5. **The round-trip contract** — how RMOOZ exports "our data" to WarGamingGEN and ingests results back (needs a defined JSON contract; see open questions).

---

## 5. Recommended approach — phased

### Phase A — Planning Context panel (read-only) ⟵ start here
A new read-only RMOOZ panel that **ingests the 4 Step 0 JSONs** and renders the MDMP package as a structured, RTL Arabic brief (mission · situation · friendly · enemy · capabilities · CCIR · ROE · sustainment · timing). 
- Pure display, **no scenario mutation** — respects RMOOZ's read-only-surface and AI/sim-boundary rules.
- Immediately useful: the operator sees the full planning picture beside the map.
- Reuses the Event Log / panel patterns; new module `shell/planning-context-panel.js`.
- **Effort: ~1 day.**

### Phase B — Scenario-seed importer
Map Step 0 → a RMOOZ **scenario draft** (the soft half), then open Edit Mode for the operator to complete geometry + forces (the hard half).
- New `shell/step0-scenario-seed.js`: builds a draft via `buildStandardScenarioAuthoringTemplate()`, fills `sides`/`posture`/`ROE`/`phase_table`/`narratives`/`provenance` from Step 0, leaves `map_bbox`/`obj`/`units` for Edit Mode.
- Tags `provenance.producer = "Hermes MDMP"`, `generated_by_ai = true`.
- Operator draws AO/objective and places forces (existing map-as-editor), then `POST /api/scenarios`.
- **Effort: ~1.5–2 days.**

### Phase C — Round-trip with WarGamingGEN (deferred)
Export the completed RMOOZ scenario to WarGamingGEN's `scenario.json` shape, run the sim, ingest the per-phase GeoJSON back into RMOOZ for review.
- RMOOZ already imports Wargame GeoJSON (`POST /api/scenario/import` → `port-wargame.js`), so the *return* leg largely exists.
- The *outbound* leg needs a mapping RMOOZ-scenario → `scenario.json` (bbox, objective, phases, off_map_markers).
- **Blocked on the contract** — see open questions. **Effort: ~2–3 days once contract is fixed.**

---

## 6. My default assumptions (change any of these)
- **Geometry** comes from the operator in Edit Mode (self-contained; no dependency on Hermes emitting coords).
- **Forces** are placed manually in v1; Arabic-OOB auto-extraction is a future enhancement (needs an LLM/parser).
- **Goal** is "usable in RMOOZ now, exportable to WarGamingGEN later" — so Phase A+B are independent of the round-trip contract.

---

## 7. Open questions only you can answer
1. **Round-trip contract:** when "our data goes back out and the result comes to us" — is the downstream target **WarGamingGEN** (the TestingAI sim), or back to **Hermes**, or a third app? What format do *they* expect?
2. **Will Hermes ever emit geometry?** If a future Hermes/GIS step provides bbox + coordinates + structured OOB, Phase B gets much more automated (less manual Edit Mode work). Worth knowing if that's coming.
3. **Scenario type:** the Step 0 sample is a **defensive ground** op; RMOOZ's richest animation path (`w3-rich`) is amphibious-assault-shaped (BLS/pipeline/carver). Do we want to (a) keep RMOOZ's amphibious shape and adapt, or (b) generalize the schema for defensive land ops?

---

## 8. Suggested first step
Build **Phase A (Planning Context panel)** — lowest risk, no boundary concerns, and it makes the Step 0 data visible/usable in RMOOZ immediately while we settle the contract questions for Phases B/C.
