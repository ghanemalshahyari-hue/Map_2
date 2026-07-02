# Known Issues

## NET-8640-REMOTE-1 public endpoint exposure (network/admin-side)

The offline runtime is healthy locally and on the LAN, but the public endpoint is not confirmed reachable from outside the network.

Known state:

```text
localhost:8640 -> healthy
172.16.29.157:8640 -> healthy on LAN
155.140.70.51:8640 -> previously timed out externally
```

Use the LAN demo URL unless public NAT/firewall has been fixed:

```text
http://172.16.29.157:8640
```

Canonical startup command:

```bash
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml up -d
```

This is not a CMO/Scenario-QA code issue. Public access requires an admin-side inbound firewall/NAT mapping to the RMOOZ host.

## Legacy Red/Blue DOCX staging flow removed from active operator path

The old Red/Blue DOCX staging route and upload-first operator UI were removed by the cleanup milestone. Current scenario review should use Objective X / scenario setup, generated/opened scenarios, Scenario Evidence QA, and CMO evidence surfaces.

Historical integration docs and old bridge tests may still mention `red_team.docx`, `blue_team.docx`, or `stage-doc` as archived context, but active client/offline/server app code must not restore that workflow.

## wargame1 BLS-4 regression test failure (pre-existing)

`scripts/test-scenarios.js` currently reports a FAIL for **wargame1** due to a
pre-existing BLS-4 doctrine issue (item #11 invariant: BLS-4 must never end up
SECURE). This failure exists on `main` prior to PR-1 and is **not** introduced
by PR-1.

### Status of the wargame regression suite

| Scenario  | Status | Notes                                                                 |
|-----------|--------|-----------------------------------------------------------------------|
| wargame1  | FAIL   | Pre-existing BLS-4 issue. Not caused by PR-1. To be fixed separately. |
| wargame2  | PASS   | Terrain + reserves deny Red as expected (DENIED, PL ~84).             |
| wargame3  | PASS   | Scenario loading + default side-posture enrichment works.             |

### Why this is deferred

PR-1's scope does not touch the BLS-4 adjudication logic. Folding the BLS-4 fix
into this PR would expand the diff and mix unrelated concerns. A follow-up PR
will address the BLS-4 invariant on its own.

### Reproduction

```
node UI_MOdified/scripts/test-scenarios.js
```

Expect: `[FAIL] wargame1 ... BLS-4 was SECURE on at least one step (item #11 invariant)`,
`[PASS] wargame2`.
Goal
Build the first usable RMOOZ AI Free Fight operating version, not a demo movement layer.

The operator must be able to import one scenario/JSON package, resolve units/objectives/locations, choose AI or non-AI scenario mode, and run a believable RED/BLUE/WHITE/GREEN agent-based wargame on the real map.

User direction captured
Remove the old Stage 1 red_team.docx / blue_team.docx import workflow from the operator path. That was demo-era and is no longer the main workflow.
Do not remove the useful scenario/placement/location-intelligence pieces.
Keep the ability to use scenario information without AI later.
Add a clear choice: Scenario without AI vs Scenario with AI.
The working version must use real AI movement/COA logic, not geometric demo movement.
Missing coordinates must be resolved using an LLM/search-like resolver, similar to asking ChatGPT for a known place such as Bandar Abbas Naval Base.
Movement must be reality-based: aircraft fly routes/patrol/return to base, defenders guard or intercept, attackers approach objectives, not all units move at once.
Test the movement in an actual scenario and inspect the result, not only by static/unit tests.
Required product flow
Operator imports a single scenario/JSON package.
RMOOZ extracts and canonicalizes:
RED units
BLUE units
objectives
infrastructure
area of interest / AOI
named locations
existing coordinates
missing coordinates
Location resolver processes all missing/weak coordinates:
exact coordinates if present
known internal gazetteer
fuzzy/near-name match
LLM/search resolver when allowed
candidate coordinate with confidence/provenance
unresolved items remain blocked/review-needed
Operator sees candidates on map and can accept/change.
Operator chooses:
Scenario without AI: load reviewed scenario only; no free-fight execution yet.
Scenario with AI: use agent-based Free Fight.
AI Free Fight uses four agents:
RED agent: adversary commander, attack/penetration/strike/defense COA
BLUE agent: friendly commander, defense/intercept/retake/reinforce COA
WHITE agent: adjudicator, movement legality, timing, contact, outcome, rules
GREEN agent: civilian/infrastructure/terrain/political/collateral constraints
COA generation must be multi-unit, multi-phase, and role-based.
Execution must move only units assigned by the committed AI COA.
Runtime triggers must support re-plan:
enemy enters warning zone
enemy contests objective
objective lost
retake/reinforce required
Scenario Control Center must clearly show agent outputs, committed plan, and executed movement.
Important existing code paths to keep/use
UI_MOdified/server/wargame-sim-bridge.js
Keep /api/wargame-sim/analyze for JSON/scenario analysis.
Keep /api/wargame-sim/placement as the location/placement support route, but upgrade it into the new resolver pipeline.
Keep /api/wargame-sim/generate for reviewed scenario save/load.
Keep /api/wargame-sim/free-fight/plan-coas as the COA generation route.
UI_MOdified/server/ai/location-intelligence.js
Upgrade to named-place/objective/unit coordinate resolver.
UI_MOdified/server/ai/free-fight-coa-planner.js
Add COA depth/realism quality gate.
Reject shallow one-unit/one-action plans when more taskable units exist.
UI_MOdified/server/ai/green-world.js
Promote into GREEN agent output.
Existing WHITE/adjudication logic if present must be wrapped as WHITE agent output.
UI_MOdified/client/shell/scenario-control-center.js
Replace old DOCX/demo-first flow with scenario import → resolver review → AI/non-AI choice → agent Free Fight.
Remove/deprecate from operator path
Completed by RMOOZ-CLEANUP-1: the legacy red/blue DOCX staging route, upload gate, and operator labels were removed from the live app path. Keep the Objective X / scenario setup path as the canonical source.

New architecture
Canonical scenario input contract
Create a single canonical resolved object used everywhere:

{
  "scenario_id": "...",
  "operation_name": "...",
  "area_of_interest": {...},
  "objectives": [
    {
      "id": "OBJ-001",
      "name": "...",
      "type": "air_base|port|city|infrastructure|unknown",
      "coord": [lon, lat],
      "coord_status": "exact|candidate|missing",
      "confidence": 0.0,
      "source": "json|gazetteer|llm|manual|candidate",
      "needs_review": true
    }
  ],
  "units": [
    {
      "uid": "R-034",
      "side": "RED|BLUE|NEUTRAL",
      "name": "...",
      "domain": "air|ground|naval|air_defense|fires|base|support|unknown",
      "home_base": "...",
      "coord": [lon, lat],
      "coord_status": "exact|candidate|missing",
      "taskable": true,
      "source": "json|gazetteer|llm|manual|candidate"
    }
  ],
  "infrastructure": [],
  "resolver_report": []
}
Agent contract
Each agent returns a bounded, inspectable object:

{
  "agent": "RED|BLUE|WHITE|GREEN",
  "assessment": "...",
  "recommended_actions": [],
  "constraints": [],
  "confidence": "low|medium|high",
  "evidence": []
}
COA realism/depth gate
Reject accepted AI COAs unless they meet minimum usable depth:

at least 2 phases when possible
at least 3 taskable units when available
clear main effort
support/screen/reserve where available
no all-units-at-once movement
no all-units-stack-on-objective movement
no one-action COA when multiple relevant units exist
aircraft/naval/ground movement must respect domain behavior
Movement behavior examples
Aircraft:
launch from base/carrier
fly toward patrol/intercept/strike route
loiter around objective or intercept point
return to base when task complete or low endurance
Air defense:
mostly hold/reposition only if needed
cover protected zone / objective
Ground units:
move by phase toward assembly/checkpoint/objective
do not teleport to objective center
Naval units:
patrol/interdict/blockade/approach maritime objective
Defenders:
hold objective until trigger
send nearest appropriate intercept/reinforcement only, not all units
Recapture:
if objective lost, BLUE agent proposes retake COA with main effort/support/reserve
Acceptance tests
Import one JSON scenario with RED/BLUE units and named objective missing coordinates.
Resolver proposes coordinates for named locations and stamps provenance/confidence.
User can choose Scenario without AI and load scenario without Free Fight movement.
User can choose Scenario with AI and generate agent outputs.
AI route returns plan_source: llm, llm_called: true, llm_status: ok for the actual run.
AI COA has multiple units and phases when multiple taskable units exist.
Commit/run executes exactly the selected committed AI COA, not demo/geometric movement.
Event log shows RED/BLUE/WHITE/GREEN outputs and executed actions.
A scenario with enemy near objective triggers BLUE re-plan/intercept.
Manual live-browser verification inspects visible movement on the map.
First implementation order
Inventory and hide old DOCX red/blue import UI.
Add canonical scenario input/resolver contract.
Upgrade /api/wargame-sim/placement into resolver support for scenario/AI import.
Add AI/non-AI scenario mode button/choice.
Add agent-orchestrator module for RED/BLUE/WHITE/GREEN.
Add COA realism/depth validator and repair loop.
Add AI-only committed execution gate.
Add live scenario test and browser verification report.
Non-goals for this ticket
Do not build more geometric demo movement.
Do not claim deterministic fallback is AI Free Fight.
Do not remove placement/generate/analyze functionality that is needed by the new scenario import path.
Do not allow arbitrary/unitless LLM movement without validation and committed order tracing.
