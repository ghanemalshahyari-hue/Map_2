# WarGamingGEN Review Session Handoff

Date: 2026-06-05
Workspace reviewed: `TestingAI/` (the WarGamingGEN workspace tree)

This handoff captures the discussion and findings from a review of `WarGamingGEN`, ignoring everything under `./Step 0`.

## Scope Reviewed

Primary program reviewed:

- `WarGamingGEN`

Supporting/dependency context:

- `SmartSearch` appears to be the doctrine retrieval dependency.
- `WarGameVisualization/viewer` consumes GeoJSON/viewer data.
- `Step 0` was intentionally disregarded.

Important files inspected:

- `WarGamingGEN/README.md`
- `WarGamingGEN/inputs/scenario.json`
- `WarGamingGEN/tests/test_full_run.py`
- `WarGamingGEN/tests/test_one_phase.py`
- `WarGamingGEN/src/config.py`
- `WarGamingGEN/src/orchestrator.py`
- `WarGamingGEN/src/llm/client.py`
- `WarGamingGEN/src/llm/schemas.py`
- `WarGamingGEN/src/agents/base_agent.py`
- `WarGamingGEN/src/agents/red_agent.py`
- `WarGamingGEN/src/agents/blue_agent.py`
- `WarGamingGEN/src/agents/adjudicator.py`
- `WarGamingGEN/src/agents/personas/red.md`
- `WarGamingGEN/src/agents/personas/blue.md`
- `WarGamingGEN/src/agents/personas/adjudicator.md`
- `WarGamingGEN/src/parsers/docx_parser.py`
- `WarGamingGEN/src/parsers/gis_loader.py`
- `WarGamingGEN/src/state/world_state.py`
- `WarGamingGEN/src/state/force_model.py`
- `WarGamingGEN/src/output/csv_schedule.py`
- `WarGamingGEN/src/output/markdown_report.py`
- `WarGamingGEN/src/output/geojson_writer.py`
- `WarGamingGEN/src/retrieval/smart_search_client.py`
- `WarGamingGEN/runs/2026-05-20_22-59-42_gpt4o_v2/llm_audit/20260520_225958_red_phase00.json`
- `WarGamingGEN/runs/2026-05-20_22-59-42_gpt4o_v2/checkpoints/phase00.json`

## Current System Summary

`WarGamingGEN` is a constrained, doctrine-driven wargame generator.

It currently does this:

1. Reads force OOBs from:
   - `inputs/forces/red_team.docx`
   - `inputs/forces/blue_team.docx`
2. Reads operational metadata from:
   - `inputs/scenario.json`
3. Loads GIS context from:
   - `inputs/gis/`
4. Builds a `WorldState`.
5. Runs fixed scenario phases from `scenario.json`.
6. Calls LLM agents each phase:
   - Adjudicator scene setter
   - Red action
   - Blue reaction
   - Adjudicator resolution
7. Persists checkpoints, audit logs, CSV, Markdown report, and GeoJSON outputs.

It is not currently a fully autonomous campaign planner.

## Inputs

Required runtime inputs:

- LLM API key through `.env`:
  - `OPENAI_API_KEY` or `LLM_API_KEY`
- Scenario:
  - `WarGamingGEN/inputs/scenario.json`
- Force OOBs:
  - `WarGamingGEN/inputs/forces/red_team.docx`
  - `WarGamingGEN/inputs/forces/blue_team.docx`
- Agent personas:
  - `WarGamingGEN/src/agents/personas/red.md`
  - `WarGamingGEN/src/agents/personas/blue.md`
  - `WarGamingGEN/src/agents/personas/adjudicator.md`
- Doctrine retrieval source:
  - SmartSearch local repo or HTTP service.

`scenario.json` role:

- It is not duplicate force data.
- DOCX files answer: what units exist?
- `scenario.json` answers: what operation is being simulated?
- It supplies:
  - operation name
  - AO bbox
  - coast latitude approximation
  - objective location
  - D-day
  - phase timeline
  - phase kinds
  - phase lines/depth
  - off-map markers
  - force-ratio thresholds

## GIS Role

Current finding: `inputs/gis/` is loaded, but it is not meaningfully included in GenAI prompts.

What happens now:

- `gis_loader.py` loads:
  - inland water
  - waterways
  - landuse
  - roads
  - populated places
  - aerodromes
  - AO polygons
  - satellite sea mask
- `WorldState` stores `gis`.
- Current LLM prompt builders mostly use `scenario.json` fields, not GIS-derived summaries.
- Output/visualization logic relies mostly on `scenario.bbox_wgs84`, `coast_lat_approx`, `phase_line_km`, objective, off-map markers, and unit state.

Therefore:

- GIS is mostly scaffolding/future capability plus visualization context.
- It is not currently a strong driver of LLM decisions.
- Missing GIS files often degrade behavior silently rather than hard-fail.

Recommended improvement:

- Add a deterministic `AOBriefBuilder` / `GISBriefBuilder`.
- Convert GIS into a compact military AO brief:
  - key terrain
  - mobility corridors
  - roads to objective
  - blockers
  - landing zones
  - airfields
  - urban areas
  - sea/inland-water constraints
- Include that AO brief in Red, Blue, Adjudicator, and campaign-planning prompts.

## AI-Generated Things

LLM calls per current phase:

1. Adjudicator scene setter
   - File: `src/agents/adjudicator.py`
   - System prompt: `src/agents/personas/adjudicator.md`
   - Output: plain text scene string
   - Not structured JSON

2. Red action
   - File: `src/agents/red_agent.py`
   - System prompt: `src/agents/personas/red.md`
   - Output schema: `TurnAction`

3. Blue reaction
   - File: `src/agents/blue_agent.py`
   - System prompt: `src/agents/personas/blue.md`
   - Output schema: `TurnAction`

4. Adjudicator resolution
   - File: `src/agents/adjudicator.py`
   - System prompt: `src/agents/personas/adjudicator.md`
   - Output schema: `PhaseResolution`

Schemas:

- `TurnAction`
- `ComponentAction`
- `PhaseResolution`
- `UnitOutcome`

Located in:

- `src/llm/schemas.py`

LLM audit output:

- `runs/<run>/llm_audit/*.json`

Each audit JSON includes:

- tag
- model
- system prompt
- user prompt
- raw response text
- schema
- parsed output
- attempts
- error

## UID Findings

UIDs are not NATO APP-6 / MIL-STD-2525 / 2525C symbols.

Current UIDs are internal IDs generated by `docx_parser.py`, such as:

- `R-d0-500-077`
- `R-d3-405-014`
- `B-d1-505-022`

Flow:

1. DOCX parser generates UIDs from side, outline depth, detected number/text, and index.
2. `WorldState` stores them.
3. Agent prompts include valid UIDs in OOB blocks.
4. The LLM selects/repeats an actor UID.
5. Validators reject unknown actor/target UIDs.

The neutral scene opener does not generate UIDs.

## Current 8 Component Actions

The current `TurnAction` schema fixes 8 optional components:

- `strategic`
- `maritime`
- `air`
- `mines`
- `usv_uav`
- `sof`
- `land`
- `ew`

The AI cannot add a first-class new component like `cyber` or `space` unless code/schema/output writers are changed.

It can mention other ideas in text fields, but downstream code will not treat those as native simulation domains.

## UnitOutcome

`UnitOutcome` is generated by the Adjudicator LLM during `Adjudicator.resolve()`.

Flow:

1. Red LLM generates Red `TurnAction`.
2. Blue LLM generates Blue `TurnAction`.
3. Adjudicator LLM generates `PhaseResolution`.
4. `PhaseResolution.unit_outcomes[]` contains `UnitOutcome`.
5. `WorldState.apply_resolution()` mutates unit state from those outcomes.

## Final Outputs

Generated under:

- `WarGamingGEN/runs/<timestamp>/`
- `WarGamingGEN/runs/latest`

Files:

- `checkpoints/phaseNN.json`
  - Mixed deterministic + AI data.
  - Contains scene, Red action, Blue reaction, resolution, metrics, snapshot.

- `run_index.json`
  - Deterministic summary of records.

- `llm_audit/*.json`
  - Mixed.
  - Prompts are code-generated.
  - Responses/parsed outputs are AI-generated.

- `outputs/wargameschedule.csv`
  - Deterministically formats AI-generated actions/resolutions into CSV.

- `outputs/wargame_report.md`
  - Deterministically renders AI-generated narratives/actions/outcomes into Markdown.

- `outputs/geojson/stepNN.geojson`
  - Mostly deterministic GeoJSON/position formatting.
  - Includes AI-chosen actors/outcomes/action text in properties.

- `outputs/geojson/all_phases.geojson`
  - Combined deterministic GeoJSON output with AI-derived properties.

## Functional MVP Gaps

The current system is a useful constrained AI-assisted wargame prototype, but not yet a fully autonomous living-campaign planner.

Main gaps:

- The runner is in `tests/test_full_run.py`, not a production entry point.
- Env path config exists but main runner hardcodes paths.
- `RED_AGENT_MODE`, `BLUE_AGENT_MODE`, `ADJUDICATOR_MODE`, and fog-of-war env vars are defined but not truly wired into alternate behaviors.
- `.env.example` says local models can use `LLM_USE_RESPONSES_API=0`, but `LLMClient` currently always calls `client.responses.create()`.
- Phase kinds typo silently fall back to shaping query behavior.
- DOCX parsing depends on a specific Arabic outline format.
- Doctrine retrieval failures warn and continue, which can produce weak decisions without stopping.
- No strong preflight validation before spending LLM calls.
- No real movement model.
- Fixed 8-component schema restricts action freedom.
- Current phases are human-authored and set in `scenario.json`.

## Revised Goal From User

The desired end state is not a fixed campaign.

Desired architecture:

- Red and Blue each maintain their own living campaign plan.
- Each plan is not set in stone.
- Before each step:
  - each side reviews previous outcomes
  - revises its plan
  - then chooses the next action from that revised plan
- The campaign should branch/adapt based on outcomes.
- Humans provide forces, enemy forces, AO metadata, objective/mission, constraints.
- AI agents generate and revise decisions, not humans predefining the step sequence.

## Recommended Architecture

Current:

```text
human phases + fixed components + AI fills actions
```

Target:

```text
human mission/forces/AO + Red/Blue living plans + dynamic actions + adjudication + state updates
```

Turn loop target:

```text
Initial inputs:
  forces + enemy forces + AO/GIS + objective/mission + constraints

Before turn 0:
  Red creates RedCampaignPlan
  Blue creates BlueCampaignPlan

For each turn:
  Red reviews previous outcome + current Red plan
  Red revises RedCampaignPlan
  Red selects action(s)

  Blue reviews previous outcome + current Blue plan
  Blue revises BlueCampaignPlan
  Blue selects action(s)/reaction(s)

  Adjudicator resolves
  WorldState mutates

  Check terminal condition:
    objective seized
    defender holds
    force culminates
    time expires
    withdrawal
    negotiated/other stop condition
```

## Proposed Technical Changes And Rationale

### 1. Add Persistent Campaign Plan Schemas

Add schemas like:

```python
class CampaignPlan(BaseModel):
    side: Literal["RED", "BLUE"]
    commander_intent: str
    desired_end_state: str
    assumptions: list[str]
    main_effort: str
    branches: list[str]
    sequenced_operations: list[PlannedOperation]
    decision_points: list[DecisionPoint]
    current_assessment: str
    revision_reason: str
```

Rationale:

- Red and Blue need memory beyond one isolated turn.
- The plan must be structured for auditing and revision.
- Plan history lets users see why the AI changed course.

### 2. Add Initial Plan And Revision Methods To Each Agent

For Red:

```python
red.initial_plan(world, mission, ao_brief)
red.revise_plan(world, previous_resolution, current_plan)
red.act_from_plan(world, revised_plan)
```

For Blue:

```python
blue.initial_plan(world, mission, ao_brief)
blue.revise_plan(world, previous_resolution, current_plan, observed_red_action)
blue.act_from_plan(world, revised_plan)
```

Rationale:

- Action should be generated from evolving campaign logic.
- Each side gets its own independent intent, assumptions, branches, and decision points.

### 3. Replace Fixed `scenario.phases` Loop With Dynamic Turns

Current:

```python
for phase in scenario.phases:
    run_phase(phase)
```

Target:

```python
while not terminal:
    red_plan = red.revise_plan(...)
    red_action = red.act_from_plan(...)

    blue_plan = blue.revise_plan(...)
    blue_action = blue.act_from_plan(...)

    resolution = adjudicator.resolve(...)
    world.apply_resolution(resolution)

    terminal = adjudicator.check_terminal_state(...)
```

Rationale:

- If an early landing fails, later steps should not blindly continue.
- Campaign flow should branch from actual outcomes.

### 4. Reduce `scenario.json` To Mission/Environment, Not Step Script

Current `scenario.json` has fixed `phases[]`.

Target:

```json
{
  "mission": "Red must seize OBJ-X within 7 days",
  "objective": {},
  "bbox_wgs84": [],
  "constraints": [],
  "time_limit_hours": 168,
  "initial_date": "..."
}
```

Rationale:

- Humans should define mission and constraints.
- Agents should define campaign structure and revise it.

### 5. Store Plan History In Checkpoints

Future checkpoint should include:

```json
{
  "turn": 3,
  "red_plan_before": {},
  "red_plan_after": {},
  "blue_plan_before": {},
  "blue_plan_after": {},
  "red_action": {},
  "blue_action": {},
  "resolution": {},
  "world_snapshot": {}
}
```

Rationale:

- Required for auditability.
- Makes it clear why decisions changed.

### 6. Replace Fixed 8 Components With Dynamic Action Lists

Current:

```json
{
  "strategic": {},
  "maritime": {},
  "air": {},
  "mines": {},
  "usv_uav": {},
  "sof": {},
  "land": {},
  "ew": {}
}
```

Target:

```python
class PlannedAction(BaseModel):
    domain: str
    action_type: str
    actor_uids: list[str]
    target_uids: list[str] = []
    target_area: Optional[AreaRef] = None
    purpose: str
    expected_effect: str
    relation_to_campaign_plan: str
    doctrine_cited: list[str]
```

Rationale:

- Agents can invent or select relevant domains/actions.
- Still preserves validation against real actors/targets.
- Supports cyber, deception, logistics, ISR, fires, maneuver, reserves, etc.

### 7. Add Capability Model For Units

Build capabilities from OOB parsing:

```json
{
  "uid": "R-...",
  "capabilities": ["amphibious_lift", "indirect_fire", "ew", "air_defense"],
  "range_km": 120,
  "mobility": "tracked",
  "sensors": []
}
```

Rationale:

- Agents should choose from what units can actually do.
- Validators can reject impossible actions.

### 8. Add Movement And Geography To Actions

Actions should optionally carry:

```json
{
  "start_area": "...",
  "end_area": "...",
  "route": [],
  "movement_mode": "road|offroad|sea|air",
  "duration_hours": 6
}
```

Rationale:

- Maneuver cannot be real if state lacks movement.
- GIS should constrain movement, not only draw maps.

### 9. Replace Static Doctrine Query Maps

Current:

- `phase.kind` chooses hardcoded doctrine queries.

Target:

- Let a retrieval-query generator produce doctrine queries from:
  - current plan
  - proposed action
  - unit capabilities
  - AO brief
  - recent outcomes

Rationale:

- If agents invent new action types, static phase-kind queries will retrieve the wrong doctrine.

### 10. Add Campaign-Level Adjudication

Add `TurnResolution` / `CampaignAssessment`:

```python
class TurnResolution(BaseModel):
    combined_effect: str
    unit_outcomes: list[UnitOutcome]
    operational_assessment: str
    changed_conditions: list[str]
    terminal_state: bool
    terminal_reason: str
```

Rationale:

- Red and Blue need feedback that helps plan revision, not just attrition.
- The system needs terminal/branching judgment.

### 11. Change Outputs To Dynamic Action/Plan Records

CSV should become action/outcome rows, not fixed component rows:

- turn
- side
- plan_version
- domain
- action_type
- actor_uids
- target
- area
- purpose
- expected_effect
- adjudicated_result
- outcome_refs

Rationale:

- Fixed component columns are incompatible with autonomous dynamic action domains.

## Important Design Principle

Do not give the LLM unlimited freedom.

Give it freedom inside validated reality:

- actor UIDs must exist
- units must have plausible capability
- targets/areas must exist
- coordinates must be within AO or declared off-map
- movement must be geographically/time plausible
- outcomes must mutate real state

This avoids fantasy output while still allowing adaptive planning.

## Current System Against Revised Goal

Current status:

- It generates Red/Blue decisions per phase.
- It validates UIDs.
- It audits LLM calls.
- It produces useful outputs.

But it does not yet:

- maintain Red/Blue campaign plans
- revise campaigns before each step
- dynamically choose the next step
- branch based on outcomes
- strongly use GIS in planning prompts
- support open-ended action domains

Conclusion:

- Current system is a good prototype for the LLM/action/adjudication loop.
- It is not yet the living campaign planner described by the user.

