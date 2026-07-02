# RMOOZ CMO Evidence Demo Handoff

## Baseline

Current stable demo and audit baseline:

```text
03c9113e feat(scenario): add evidence repair planner
cmo-evidence-v14 -> 6f310c00 feat(cmo): add evidence actionability commander pack
cmo-evidence-v13 -> 9dc07bdb feat(cmo): add printable evidence report layout
cmo-evidence-rc1 -> 4314f16c test(cmo): lock evidence release candidate
```

Prior UX baseline:

```text
cmo-evidence-v12 -> abdbe4a7 style(cmo): polish evidence workflow UX
```

Meaning:

```text
Full CMO evidence workflow + force report + workflow/demo gates + UX polish + print layout + actionability + recommendations + Scenario-QA completeness/review/repair planning.
```

## Capability Stack

```text
CMO-1   Engagement Evidence
CMO-2   Contact Detection Evidence
CMO-3   Sensor-to-Shooter Decision Chain
CMO-4   Map Evidence Overlays
CMO-5   Selected-Unit Evidence Timeline
CMO-6   Selected-Unit Evidence Export
CMO-7   Force Readiness Matrix
CMO-8   Matrix Filters + Drilldown
CMO-9   Evidence Alert Badges
CMO-10  Force Evidence Event Feed
CMO-11  Force Evidence Report
CMO-12  Evidence Quality Gate
CMO-13  Quality Gate Drilldown
CMO-14  Evidence UX Polish Pass
CMO-15  Printable Evidence Report Layout
CMO-16  Evidence Recommendations
CMO Actionability Batch
        Evidence coverage, blocker remediation, alternative shooters, commander brief
Scenario Evidence QA
        Completeness validation, normalizer, review queue, repair planner
```

The system is intentionally read-only. It explains existing evidence and renders commander-facing workflow surfaces; it does not add firing logic or change doctrine.

## Demo Flow

Recommended live demo path:

```text
Generate/open scenario
-> Evidence Quality
-> click a quality warning
-> readiness matrix filters affected units
-> click a unit row
-> selected-unit Contact / Engagement / Decision Chain evidence appears
-> map overlay shows range/target/reason
-> timeline shows deduped evidence changes
-> copy/download selected-unit Evidence Snapshot
-> copy/download Force Evidence Report
-> review Recommended Checks
-> review repair planner if Scenario-QA flags gaps
```

Polished panel order:

```text
1. Evidence Quality
2. Evidence Alerts
3. Evidence Readiness Matrix
4. Force Evidence Feed
5. Contact Evidence
6. Engagement Evidence
7. Decision Chain
8. Recommended Checks
9. Evidence Timeline
10. Evidence Snapshot
11. Force Evidence Report
```

If no unit is selected, the unit panel now points the user to the readiness matrix:

```text
No selected unit.
Select a row from the readiness matrix to inspect evidence.
```

## Verification Commands

Run the complete evidence and offline verification stack:

```bash
node test-cmo-evidence-ux-polish-ui-1.js
node test-cmo-demo-flow-gate-1.js
node test-cmo-evidence-quality-drilldown-ui-1.js
node test-cmo-evidence-quality-gate-ui-1.js
node test-cmo-evidence-workflow-gate-1.js
node test-cmo-force-evidence-report-ui-1.js
node test-cmo-force-evidence-feed-ui-1.js
node test-cmo-evidence-alerts-ui-1.js
node test-cmo-evidence-readiness-drilldown-ui-1.js
node test-cmo-evidence-readiness-matrix-ui-1.js
node test-cmo-evidence-export-ui-1.js
node test-cmo-evidence-timeline-ui-1.js
node test-cmo-evidence-consistency-1.js
node test-evidence-map-overlays-ui-1.js
node test-decision-chain-evidence-ui-1.js
node test-contact-evidence-ui-1.js
node test-engagement-evidence-ui-1.js
node UI_MOdified/test-offline-gen-run-fix-1.js
node UI_MOdified/test-offline-operational-scenario-ai-1.js
node UI_MOdified/test-offline-scenario-autogen-1.js
git diff --check
```

Runtime smoke:

```bash
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml up -d
curl -sS http://localhost:8640/api/offline/map-config
curl -sS http://localhost:8640/api/ai/generation-health
curl -sS http://172.16.29.157:8640/api/offline/map-config
```

Browser smoke target:

```text
http://172.16.29.157:8640
-> sign in/register
-> open app shell
-> run/open scenario
-> click Evidence Quality warning
-> confirm matrix filter and selected-unit evidence path
```

## Read-Only Boundaries

Do not mix the CMO evidence layer with:

```text
backend routes
scenario contract changes
combat mutation
auto-fire
doctrine mutation
AI decision overrides
PDF generation
database writes
```

The CMO evidence layer reuses existing world state, contact evidence, engagement evidence, decision-chain evidence, readiness aggregation, timeline, overlays, and local JSON/text exports.

## Local Runtime Notes

Known-good local runtime checks at the time of this handoff:

```text
localhost:8640/api/offline/map-config -> healthy
localhost:8640/api/ai/generation-health -> healthy
172.16.29.157:8640/api/offline/map-config -> healthy on LAN
rmooz-offline container -> healthy
```

Use the env-file compose command for runtime/package checks:

```bash
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml up -d
```

When validating browser changes without rebuilding the image, copy changed static client files into the running container for a smoke test only. Rebuild the offline image before packaging/release validation.

## Remote Access Note

Remote access to:

```text
http://155.140.70.51:8640
```

has previously timed out while `localhost:8640` was healthy. Treat that as a separate network/firewall/public binding issue:

```text
NET-8640-REMOTE-1 - Restore remote access to published offline runtime
```

Do not block local CMO evidence work on the remote timeout unless the next demo must be run from another machine.

## Recommended Next Move

Before adding more CMO features, handle whichever demo need is immediate:

```text
If demoing from another machine:
NET-8640-REMOTE-1 - Restore remote access to published offline runtime

If improving reports:
RMOOZ-CMO-15 - Evidence Report Print/PDF Layout
```
