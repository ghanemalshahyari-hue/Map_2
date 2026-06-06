# WarGameGenerator

A doctrine-driven, AI-orchestrated wargame simulator. Reads red/blue force OOB DOCX files + GIS terrain + scenario parameters, then runs a multi-phase amphibious operations simulation using three LLM agents (Red attacker, Blue defender, neutral Adjudicator) grounded in retrieved military doctrine.

Scenario-portable by design — drop in a different scenario.json + OOB DOCXs + doctrine corpus, get a different wargame.

## Architecture

```
┌─ inputs/                         (user-provided per scenario)
│   ├─ forces/    red_team.docx, blue_team.docx
│   ├─ gis/       terrain, elevation, imagery, boundaries
│   ├─ doctrine/  *.md   (corpus ingested by smart-search)
│   └─ scenario.json     (bbox, objective, D-day, phases, force-ratio thresholds)
│
└─ src/
    ├─ parsers/        deterministic, no LLM — OOB extraction, scenario JSON, GIS clipping
    ├─ state/          Python combat model — force ratios, EW/mines evolution, per-unit mutation
    ├─ retrieval/      smart_search_client wrapping DecisionMakingSteps (RAG, read-only)
    ├─ llm/            OpenAI Responses API wrapper + Pydantic schemas with strict validators
    ├─ agents/         Red, Blue, Adjudicator with persona system prompts
    ├─ output/         CSV schedule, Markdown narrative, per-phase GeoJSON
    └─ orchestrator.py — turn-by-turn loop, checkpoint persistence, resume support
```

## How a phase runs

```
ForceModel.compute(world, phase)            → engine metrics (force ratio, EW, mines)
   ↓
Adjudicator.scene_setter(phase, metrics)    → 2-sentence neutral opener
   ↓
RedAgent.act(phase, metrics, prior_blue)    → TurnAction (8 components, holds documented)
   ↓
BlueAgent.react(phase, metrics, red_action) → TurnAction (fog of war on Red's reasoning)
   ↓
Adjudicator.resolve(phase, metrics, red, blue) → PhaseResolution (unit_outcomes, narrative)
   ↓
WorldState.apply_resolution(resolution)     → mutate world (apply outcomes)
   ↓
ForceModel.evolve_state(world, kind, red, blue) → engine state deltas (mines swept, EW ramp/decay)
   ↓
Orchestrator persists PhaseRecord → checkpoints/phaseNN.json
```

## Key design rules

1. **Deterministic math, narrative LLM.** Python computes force ratios, attrition coefficients, mines/EW evolution. The LLMs propose actions and narrate outcomes; they never compute numbers.
2. **Fog of war.** Red sees what Blue published in prior phases (last 5), not Blue's reasoning. Blue sees Red's current-phase actions (no `why`/`intended_effect`/`doctrine_cited`).
3. **Schema-strict.** Every LLM output is validated against Pydantic models with custom validators:
   - All UIDs must exist in the OOB (catches invented "B-72-AD" type names)
   - Active intent + zero components is rejected (forces explicit holds or actions)
   - Force-ratio + mines + EW are force-overridden from engine (LLM can't fudge numbers)
4. **Hold-as-action.** Inactivity must be documented: name a holding unit + doctrinal reason, never silent null.
5. **Pluggable LLM endpoint.** Same code runs on OpenAI cloud and any OpenAI-compatible local endpoint (LM Studio, vLLM, litellm).
6. **Smart-search system is read-only.** Our code calls into DecisionMakingSteps's `graph.retrieval.search()` but never modifies it. Only `.env` and `inputs/doctrine/` are ours to touch on the offline VM.

## Setup (one-time)

1. **Python venv** (reuse the smart-search venv):
   ```bash
   source ../SmartSearch/venv_mac/bin/activate
   ```

2. **LM Studio** running locally with `text-embedding-bge-m3` GGUF loaded (port 1234). This provides the embedder for retrieval.

3. **Qdrant** running (via colima + docker on Mac):
   ```bash
   colima start
   docker compose -f ../SmartSearch/docker-compose.yml up -d
   ```

4. **Doctrine corpus** ingested into the `ingest__doctrine__bgem3` collection:
   ```bash
   cd ../SmartSearch && python -m graph.scripts.ingest_doctrine
   ```

5. **API key** — `.env` (already populated with the key from `apik.rtf`).

## Run instructions

```bash
# 3-phase smoke (fast verification, ~3 min, ~$0.40)
python tests/test_full_run.py --max-phases 3

# Full 17-phase Libya run (~16 min, ~$2.40)
python tests/test_full_run.py --all

# Resume from latest checkpoint (recovers from a mid-run crash)
python tests/test_full_run.py --all --resume

# Run a specific phase end-to-end (for prompt/agent debugging)
python tests/test_one_phase.py     # defaults to phase 5 (D-H)
```

## Outputs

| File | Format | Purpose |
|---|---|---|
| `tests/full_run_audit/checkpoints/phaseNN.json` | JSON | Per-phase record (resumable) |
| `tests/full_run_audit/outputs/wargameschedule.csv` | CSV | Phase × component matrix (15 columns) |
| `tests/full_run_audit/outputs/wargame_report.md` | Markdown | Narrative report (exec summary, force-ratio table, per-phase sections) |
| `tests/full_run_audit/outputs/geojson/stepNN.geojson` | GeoJSON | Per-phase units affected + actors + objective + phase line |
| `tests/full_run_audit/outputs/geojson/all_phases.geojson` | GeoJSON | All features combined, tagged by phase |
| `tests/full_run_audit/llm_audit/*.json` | JSON | Every LLM call (prompt + response + parsed output) |
| `tests/full_run_audit/run_index.json` | JSON | Run summary index |

## Configuration & tweaking — offline-edit map

What to change for what you want to do. Tiers ordered by edit-surface size:

### Tier 1 — Data files (no code, no re-ingest)

| Want to change... | File |
|---|---|
| Operation, area, phases, D-day | `inputs/scenario.json` |
| Red/Blue forces (units, equipment) | `inputs/forces/{red,blue}_team.docx` |
| Force-ratio thresholds (3:1, 1.5:1) | `inputs/scenario.json` — `attack_ratio_decisive`, `attack_ratio_contested` |
| Defender's terrain advantage multiplier | `inputs/scenario.json` — `prepared_defense_mult` |
| Off-map markers (bases, SSM brigades) | `inputs/scenario.json` — `off_map_markers[]` |
| GIS layers | `inputs/gis/{terrain,boundaries,imagery,elevation}/` |

### Tier 2 — Doctrine corpus (re-ingest required)

| Want to change... | File | Then run |
|---|---|---|
| Whole doctrine library | `inputs/doctrine/*.md` | `cd DecisionMakingSteps_TRANSFER && python -m graph.scripts.ingest_doctrine` |
| Calibration coefficients (ASCM hit rate, USV survival) | `inputs/doctrine/WarReferences.md` | same |

### Tier 3 — Personas (plain Markdown, no logic)

| Want to change... | File |
|---|---|
| Red commander style / aggressiveness | `src/agents/personas/red.md` |
| Blue defender doctrine | `src/agents/personas/blue.md` |
| Adjudicator strictness | `src/agents/personas/adjudicator.md` |

### Tier 4 — Engine constants (single Python file each)

| Want to change... | File |
|---|---|
| Force-ratio math, EW degrade, mines clearance rate, EW intensity/decay | `src/state/force_model.py` (constants at top) |
| Per-unit strength weights, magazine sizes | `src/state/world_state.py` — `_strength_for()` |
| Starting mines count | `src/state/world_state.py` — `WorldState.__init__` |

### Tier 5 — Output formatting

| Want to change... | File |
|---|---|
| CSV column layout / hide force-ratio columns | `src/output/csv_schedule.py` |
| Markdown sections / hide engine metrics | `src/output/markdown_report.py` |
| GeoJSON feature properties | `src/output/geojson_writer.py` |
| Add a new writer (Word, KML, etc.) | New file in `src/output/`, call from `tests/test_full_run.py` |

### Tier 6 — Prompt logic per agent

| Want to change... | File |
|---|---|
| Per-phase doctrine queries | `src/agents/{red,blue,adjudicator}_agent.py` — `*_QUERIES_BY_PHASE_KIND` dict at top |
| Per-phase task instructions / hold-doc rules | Same files, in `act()` / `react()` / `resolve()` methods |
| New phase kind (e.g. "airborne_drop", "cyber_op") | Add to dict in all 3 agent files (~3 lines each), then add to `scenario.json` `phases[].kind` |
| Fog-of-war behavior | `src/agents/blue_agent.py` — `_build_observable_red_action()` |

### Tier 7 — Schema (most invasive; cascades downstream)

| Want to change... | File | Cascades to |
|---|---|---|
| Add component (cyber, space, …) | `src/llm/schemas.py` — `ComponentName` Literal | 3 agent prompts, 3 output writers, `force_model._comp_active`, `world_state` |
| Add status (surrendered, captured) | `src/llm/schemas.py` — `StatusChange` Literal | `world_state.apply_outcome`, adjudicator prompt |
| Add field to ComponentAction | `src/llm/schemas.py` | Output writers, adjudicator prompt |

## Scenario portability — example recipes

### Run an Indian Ocean operation with PLA doctrine, in Spanish

1. New `inputs/scenario.json` with new bbox/phases/D-day
2. New `inputs/forces/red_team.docx` (PLA OOB) and `blue_team.docx`
3. New GIS files in `inputs/gis/`
4. Replace `inputs/doctrine/*.md` with PLA / Joint Operations corpus, re-ingest
5. Rewrite `src/agents/personas/red.md` for PLA Active Defense doctrine, add "Respond in Spanish"
6. Run — zero changes to engine code, schemas, orchestrator, writers

### Russian VDV airborne doctrine

1. New `scenario.json` (add phase kind "airborne_drop" if needed → add to 3 agent dicts)
2. New OOB DOCX with VDV units
3. Rewrite persona text with VDV doctrine
4. Run

## Switching to a local LLM (cost-free testing)

```env
# .env — toggle between cloud and local
LLM_BASE_URL=http://localhost:1234/v1          # LM Studio local endpoint
LLM_MODEL=qwen2.5-32b-instruct                 # any GGUF you have loaded
LLM_USE_RESPONSES_API=0                        # local models use /chat/completions

# Or for GPT-4o (default):
LLM_BASE_URL=
LLM_MODEL=gpt-4o
LLM_USE_RESPONSES_API=1
```

Recommended local model: **Qwen 2.5 32B Instruct (Q4_K_M GGUF)** or **Qwen3.6-35B-A3B (MoE)** via LM Studio.
Expect 1.5-2× slower inference and slightly more validator retries vs GPT-4o.

## Validators in the schema layer

Strict Pydantic validators reject:
- **Invented UIDs** — every `actor` and `unit_uid` must exist in the OOB
- **Active intent + zero components** — if `overall_intent` describes activity, at least one component must be populated (active or documented hold)
- **Out-of-range EW** — `ew_strength_*` must be in [0, 1]
- **Out-of-range force ratios** — engine values are force-overridden post-validation

When a validator fires, the LLMClient retries the call (up to 2 times) with feedback in the prompt explaining what was wrong.

## Cost reference (GPT-4o)

| Run | Phases | Tokens (avg) | Cost |
|---|---:|---|---:|
| Smoke | 3 | ~93K in + 31K out | ~$0.45 |
| Full Libya | 17 | ~530K in + 175K out | ~$2.40 |
| Worst case w/ retries | 17 | ×1.3 | ~$3.10 |

Embeddings (LM Studio) and reranker (RRF fallback) are free.

## Known limitations

1. **DOCX parser bullet regex** — expects a specific Arabic outline format (depth 0/1/2/3 markers). A radically different layout needs new regex in `src/parsers/docx_parser.py`.
2. **Phase `kind` strings are typo-prone** — these join scenario.json to agent doctrine queries. A typo silently falls back to `shaping` queries. A startup `validate_scenario_kinds()` check would harden this.
3. **No movement model** — units stay at spawn positions; the model captures engagement outcomes, not maneuver geometry. Position changes would require a movement system that the engine doesn't currently have.
4. **EW saturates over long runs** — once both sides activate `ew`, intensity stays at 0.7/0.7 until one drops; modern persistent jamming behavior but lacks dynamism in late-phase narrative.

## Project status

Complete and end-to-end verified:
- [x] Project skeleton, dependency graph, .env config
- [x] Smart-search client (read-only wrapper of DecisionMakingSteps)
- [x] LLM client (Responses API + Pydantic + retry-with-feedback)
- [x] DOCX OOB parser (Arabic outline format)
- [x] Scenario JSON schema + Libya sample (17 phases)
- [x] GIS loader (terrain blockers, sea mask, OSM imports)
- [x] WorldState + ForceModel (force ratios, EW, mines, action-driven evolution)
- [x] Red/Blue/Adjudicator agents (per-phase doctrine queries, fog of war, hold-doc rules)
- [x] Orchestrator (turn loop, checkpoints, resume support)
- [x] Output writers (CSV / MD / per-phase GeoJSON)
- [x] End-to-end Libya run (17/17 phases, 11/11 quality checks)
- [x] Schema validators (UIDs against OOB, all-null component rejection)

Optional next steps:
- [ ] Local-model branch in LLMClient (chat-completions endpoint for LM Studio/Qwen)
- [ ] Phase-kind validator at scenario load
- [ ] Unit movement model
- [ ] Run a second scenario to prove portability
