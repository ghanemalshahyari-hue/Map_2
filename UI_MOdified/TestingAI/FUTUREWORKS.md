# WarGame Project — Future Works

**Last updated:** 2026-06-03
**Audience:** whoever continues the project (read `HANDOVER.md` first).

This document is the implementation plan for three planned enhancements:

1. **Incremental (delta-only) GeoJSON** — emit only units that *changed*, not all 173 every phase.
2. **Per-agent permission model** — Blue moves only Blue, Red moves only Red, White (adjudicator) only changes state / destroys.
3. **A 4th "Analyst" agent** — produces the final result + lessons learned at end of run.

Each section is self-contained: motivation → design → exact files to touch → schema changes → risks → effort. They can be built independently, but a suggested sequence is in §4.

All paths below are relative to `WarGamingGEN/` unless noted.

---

## 1. Incremental (delta-only) GeoJSON

### 1.1 Motivation
Today `src/output/geojson_writer.py` (v2) writes **all 173 units + markers + arcs every phase** (~194–198 features × 17 files). A unit sitting still at its base appears identically in all 17 files. For animation and for the external viz app, we only need to transmit what *changed* between phases. Benefits: ~5–10× smaller per-phase payloads, cleaner "what happened this turn" semantics, easier diffing.

### 1.2 Design — "baseline + deltas" (schema v3)
Keep a full **baseline** and emit **deltas** thereafter:

```
outputs/geojson/
├── step00.geojson            ← FULL baseline (all 173 units, exactly as v2)  [unchanged]
├── step01.delta.geojson      ← ONLY features that changed vs step00
├── step02.delta.geojson      ← ONLY features that changed vs step01
│   …
├── step16.delta.geojson
├── all_phases.geojson        ← keep full (overview / external app)            [unchanged]
└── manifest.json             ← NEW: lists baseline + ordered delta files + schema version
```

A feature goes into `stepNN.delta.geojson` if **any** of these is true vs the previous phase:
- **Moved**: `distance(prev_pos, curr_pos) > MOVE_EPSILON_M` (e.g. 250 m)
- **State changed**: `status_change`, `current_strength`, `destroyed`, `suppressed_pct`, `delayed_pct` differ
- **Activity flags changed**: became (or stopped being) `is_actor` / `is_affected`
- **New engagement arc** this phase (arcs are inherently per-phase; always included)

Each delta feature carries a `delta_op` property:
- `"move"` — position changed (viewer animates prev→curr)
- `"update"` — state changed but position didn't
- `"move+update"` — both
- `"remove"` — unit destroyed this phase (viewer can fade it out; it then stops appearing in future deltas)

Units **not** present in a delta file are unchanged — the viewer keeps their last-known state.

### 1.3 Exact changes
- **`src/output/geojson_writer.py`**
  - Add `write_phase_geojsons_incremental(records, world, scenario, out_dir)` alongside the existing full writer (don't delete the full one — `all_phases` + baseline still use it).
  - Factor the per-unit feature builder out of `_build_feature_collection` into `_build_unit_feature(uid, ...)` so both full and delta paths reuse it.
  - Add `_diff_phase(prev_positions, prev_states, curr_positions, curr_states) -> set[uid]` returning the changed UIDs.
  - Track `prev_states` dict (the 5 fields above) the same way `prev_positions` is already tracked in the writer's loop.
  - Write `manifest.json`: `{ "schema": "wargame-geojson", "version": 3, "baseline": "step00.geojson", "deltas": ["step01.delta.geojson", …], "move_epsilon_m": 250 }`.
- **`src/tools/regenerate_outputs.py`**
  - Add a `--incremental` flag that calls the new writer. Default stays full (back-compat).
- **Schema pack** (`_archive/handoff_packs/GeoJSON_Schema_Pack/`)
  - Add `wargame_geojson_delta.schema.json` describing the `delta_op` property + the manifest.
  - Update `README.md` with the **apply-delta algorithm** for consumers:
    ```
    state = load(baseline)
    for delta in manifest.deltas:
        for f in delta.features:
            if f.delta_op == "remove": state.remove(f.uid)
            else: state[f.uid] = f          # replace/insert
        render(state)                        # this is phase N
    ```

### 1.4 Consumer impact / risk
- **The external viz-app colleague built against v2 full snapshots.** Delta is a breaking change for them. Mitigation: keep emitting the full `all_phases.geojson` + `step00.geojson` baseline, ship deltas as *additional* files, and bump `version` to 3 in the manifest so consumers opt in. Their app keeps working on the full files until they choose to adopt deltas.
- **Determinism caveat:** positions today come from role-based interpolation in `_compute_unit_position()` (Red ground "jumps" from offshore to the phase line at phase 5). Those big jumps are legitimately "moves" and will appear in the delta — expected, not a bug. Once Feature 2 (real movement orders) lands, moves become smooth and the delta becomes more meaningful.
- **State must be tracked by the consumer.** Document clearly that a delta stream is stateful (unlike the current stateless full snapshots).

### 1.5 Effort
~1 day. Writer refactor (~150 LOC) + schema doc + a regen flag. No LLM cost (uses existing checkpoints via the regenerator).

---

## 2. Per-agent permission model (Red / Blue / White)

### 2.1 Motivation & what already exists
Goal: a *formal, enforced* authorization model —
- **Red agent** may only act on / move **Red** units.
- **Blue agent** may only act on / move **Blue** units.
- **White agent** (the Adjudicator) may only **change state / destroy** units (any side) — it does **not** move units.

**Partial enforcement already exists:** `src/llm/schemas.py` has a `validation_context` UID guard — `RedAgent` passes `side_uids = red UIDs`, `BlueAgent` passes blue UIDs, and `TurnAction._validate_actor_uids_against_oob` rejects any actor UID not on that side. So "Red can only name Red units" is already enforced at validation time. This feature *formalizes and extends* that into a full mutation-permission layer, and adds the movement/state separation.

### 2.2 The core architectural gap
Right now **units don't actually move by agent decision.** Positions are computed heuristically in `geojson_writer._compute_unit_position()` from phase + role. To make "Blue moves Blue" meaningful, movement must become a real, agent-issued, engine-applied mutation. So this feature has two parts: (a) a permission guard, and (b) real movement orders.

### 2.3 Design

**Permission matrix** (new `src/state/permissions.py`):
```
ROLE    │ may issue          │ may target
────────┼────────────────────┼──────────────────────────
RED     │ MOVE, POSTURE      │ side == RED only
BLUE    │ MOVE, POSTURE      │ side == BLUE only
WHITE   │ STATE, DESTROY     │ any side
```
- `MutationType = {MOVE, POSTURE, STATE, DESTROY}`
- `Mutation(type, target_uid, payload, issued_by_role)`
- `PermissionGuard.authorize(mutation) -> bool` — central chokepoint. Any unauthorized mutation is **rejected + logged** (and in dev, raises).

**Wire the guard into the one mutation path:** `src/state/world_state.py`'s `apply_outcome()` / `apply_resolution()` is already the *only* place state changes. Route every mutation through `PermissionGuard.authorize()` there. This keeps the "single source of truth, single mutation path" invariant that the project already maintains.

**Real movement orders (schema change):** add an optional movement block to each `ComponentAction` in `src/llm/schemas.py`:
```python
class MovementOrder(BaseModel):
    dest_lon: float | None      # explicit destination, OR
    dest_lat: float | None
    axis: str | None            # named axis/objective, e.g. "toward OBJ-X", "withdraw to PL-3"
    speed_kmh: float | None     # optional; engine clamps to doctrinal max for the unit type
```
- Red/Blue agents may populate `movement` on their components (within their own side — guard enforces).
- `force_model.py` (or a new `movement_model.py`) advances each ordered unit toward its destination each phase, clamped by terrain (`gis_loader.is_terrain_blocker`) and a per-domain max speed. This *replaces* the heuristic `_compute_unit_position()` for ordered units; un-ordered units hold position.
- White/Adjudicator issues **no** movement — its `PhaseResolution.unit_outcomes` are STATE/DESTROY only (already the case; the guard now enforces it).

**Personas:** tighten `src/agents/personas/{red,blue}.md` to "you order movement only for your own force" and `adjudicator.md` to "you never move units; you only adjudicate outcomes/state." (Mostly already true — make it explicit.)

### 2.4 Exact changes
- **NEW `src/state/permissions.py`** — `MutationType`, `Mutation`, `PermissionGuard` (+ unit test).
- **`src/llm/schemas.py`** — add `MovementOrder`, add `movement: Optional[MovementOrder]` to `ComponentAction`. Bump any schema version markers.
- **`src/state/world_state.py`** — add `position` mutation handling; route all mutations through the guard; tag each mutation with its issuing role.
- **NEW `src/state/movement_model.py`** (or extend `force_model.py`) — `advance_movement(world, phase, red_action, blue_reaction)` applies ordered moves with speed/terrain clamps. Call it from `orchestrator.py` right after `apply_resolution` + `evolve_state`.
- **`src/orchestrator.py`** — pass the issuing role when applying Red/Blue movement vs White outcomes; collect rejected-mutation logs into the PhaseRecord for audit.
- **`src/output/geojson_writer.py`** — `_compute_unit_position()` becomes "use the engine's real position if the unit has moved under orders, else fall back to spawn/role default." Eventually the heuristic is retired.
- **`src/agents/personas/*.md`** — explicit role boundaries.

### 2.5 Risks
- **Biggest change in this doc.** Movement is a genuinely new engine subsystem. Stage it: first land the `PermissionGuard` over the *existing* mutations (cheap, immediate value, enforces the matrix), *then* add movement orders as a second step.
- LLMs will occasionally issue cross-side or illegal mutations; the guard must **reject-and-continue with a logged warning**, not crash the run. Feed rejections back into the retry loop (same pattern as the existing schema validators).
- Movement + the delta GeoJSON (Feature 1) interact nicely (real moves → meaningful deltas) but build Feature 1's writer to read engine positions, not the heuristic.

### 2.6 Effort
- Permission guard over existing mutations: ~0.5 day.
- Movement orders + movement model + geojson integration: ~2–3 days.

---

## 3. The 4th agent — "Analyst" (after-action review)

### 3.1 Motivation
After the 17 phases resolve, no one synthesizes the whole campaign. Add a neutral **Analyst** agent that runs **once at end of run** and produces the operational verdict + lessons learned — the After-Action Review (AAR).

### 3.2 Design
- **NEW persona `src/agents/personas/analyst.md`** — neutral AAR analyst (think J-7 / lessons-learned cell). Doctrinally framed; cites the doctrine corpus.
- **NEW `src/agents/analyst_agent.py`** — subclass of `BaseAgent`. One public method `analyze(records, world, scenario) -> AgentResult`. Runs after the orchestrator's phase loop completes.
- **Input it receives** (all already on disk as PhaseRecords): every phase's combined_effect, force-ratio progression, cumulative losses by side, mine/EW timeline, the final WorldState snapshot, advantage-call history (RED_ADV/CONTESTED/BLUE_ADV counts).
- **Doctrine retrieval:** queries tilted to AAR — "operational culmination assessment", "amphibious assault success criteria", "FM 3-90 decisive vs failed offense", "lessons learned methodology".
- **NEW schema `AnalysisReport` in `src/llm/schemas.py`:**
  ```python
  class AnalysisReport(BaseModel):
      outcome: Literal["RED_DECISIVE","RED_MARGINAL","STALEMATE","BLUE_MARGINAL","BLUE_DECISIVE"]
      objective_seized: bool                  # did Red take OBJ-X?
      culmination_phase: int | None           # where Red culminated, if it did
      decisive_factors: list[str]             # 3–6 bullet causes of the outcome
      red_lessons: list[str]                  # what Red should learn
      blue_lessons: list[str]                 # what Blue should learn
      doctrinal_observations: list[str]       # cite specific doctrine + historical analogs
      summary: str                            # 1–2 paragraph executive verdict
  ```
- **Output writers:**
  - `analysis.md` (human-readable AAR) — add `write_analysis_report()` to a new `src/output/analysis_report.py`.
  - `analysis.json` (the validated `AnalysisReport`) for downstream tools.
  - Optionally append an "After-Action Review" section to the existing `wargame_report.md`.

### 3.3 Exact changes
- **NEW** `src/agents/personas/analyst.md`
- **NEW** `src/agents/analyst_agent.py`
- **`src/llm/schemas.py`** — add `AnalysisReport`.
- **NEW** `src/output/analysis_report.py` — `write_analysis_report(report, out_path)`.
- **`tests/test_full_run.py`** — after `orch.run()`, call the analyst, write `analysis.md/json`, add a quality check ("analysis produced, outcome ∈ enum, ≥3 lessons per side").
- **`src/tools/regenerate_outputs.py`** — the analyst is **one extra LLM call** (~$0.05). Add a `--with-analysis` flag so it can be produced from existing checkpoints without re-running the whole wargame.

### 3.4 Where it sits in the agent model
It's a **fourth role**, neutral like White but distinct: White adjudicates *per phase*; Analyst reviews *the whole campaign* once. It has no mutation permissions at all (read-only over the finished run) — fits cleanly under the Feature-2 permission matrix as a `READONLY` role.

### 3.5 Effort
~1 day. It's the lowest-risk of the three (additive, one call, no engine changes).

---

## 4. Suggested build sequence

Ordered by value-per-risk:

1. **Analyst agent (§3)** — additive, ~1 day, immediately improves every run's output. No engine risk.
2. **Permission guard over existing mutations (§2.3 part a)** — ~0.5 day, formalizes + enforces the Red/Blue/White matrix using mutations that already exist. Low risk, high clarity.
3. **Incremental GeoJSON (§1)** — ~1 day, no LLM cost, big payload win. Build the writer to read engine positions so it's ready for movement.
4. **Movement orders + movement model (§2.3 part b)** — ~2–3 days, the real architectural lift. Do last; it makes both the permission model and the delta GeoJSON fully meaningful (units actually maneuver, deltas become smooth tracks).

Total: ~5–6 focused days for all four.

---

## 5. Cross-cutting concerns

- **Schema versioning.** Both the GeoJSON output and `schemas.py` should carry explicit version numbers. Bump them when these land (GeoJSON → v3; add a `wargame_schema_version` constant). The external viz app keys off this.
- **Backwards compatibility.** Keep the full GeoJSON snapshots (`all_phases.geojson`, `step00` baseline) emitting so the colleague's existing app doesn't break. Deltas and the analyst are additive.
- **Everything stays testable headlessly + cheaply.** Reuse `src/tools/regenerate_outputs.py` (replays checkpoints, $0) for Features 1 & 3 so you don't pay for a full LLM run to test output/analysis changes. Only Feature 2's movement model needs fresh runs to exercise (or synthesize movement orders into a fixture checkpoint).
- **The "no fake/forced numbers" rule still holds.** Movement speeds must come from `unit_catalog.json` physical specs or doctrine, not hardcoded magic. The Analyst must cite real doctrine/metrics from the run, not invent figures.
- **The `SmartSearch/` hard rule still holds.** None of these features touch it; they all consume retrieval read-only as today.
