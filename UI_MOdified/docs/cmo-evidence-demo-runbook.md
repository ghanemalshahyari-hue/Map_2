# RMOOZ CMO Evidence Demo Runbook

## Release Baseline

Use this runbook for the current release-candidate baseline:

```text
scenario-evidence-v9   -> feat(scenario): add evidence handoff acceptance workflow
cmo-evidence-rehome-v1 -> 764d260f style(cmo): rehome scenario evidence from unit status
scenario-evidence-v8   -> 941aa275 feat(scenario): add evidence handoff package
cmo-evidence-v14 -> 6f310c00 feat(cmo): add evidence actionability commander pack
cmo-evidence-rc1 -> 4314f16c test(cmo): lock evidence release candidate
```

This baseline includes the full CMO evidence workflow, print-ready evidence reports, the release-candidate static/runtime gate, actionability guidance, recommendations, Scenario Evidence completeness/review/repair/manual-fix/closeout/audit-trail, the handoff package + Handoff Acceptance workflow, and main/offline parity checks.

## UI Layout — Scenario Evidence Drawer

Since `cmo-evidence-rehome-v1`, scenario-level evidence panels are **not** inside Unit Status.
The split is:

```text
UNIT STATUS
= selected-unit evidence only

Scenario Evidence drawer / أدلة السيناريو
= scenario-level QA, commander evidence, force evidence, handoff workflow
  (Commander Brief, Completeness, Objective X Health, Review Queue, Repair Planner,
   Manual Fix, Closeout, Audit Trail, Handoff Package, Handoff Acceptance,
   Quality, Alerts, Coverage, Readiness Matrix, Blocker Remediation, Force Feed, Force Report)
```

Every step below that touches a scenario-level panel happens in the Scenario Evidence drawer, not in Unit Status.

## Start Runtime

Start the offline runtime with the env file explicitly. This is the canonical command:

```bash
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml up -d
```

Do not omit `--env-file`. Plain compose falls back to `5006`; the demo runtime uses `8640`.

Optional clean rebuild for release validation:

```bash
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml down
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml build --no-cache
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml up -d
```

## Health Checks

Confirm the container is healthy and published on `8640`:

```bash
docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml ps
curl -sS http://localhost:8640/api/offline/map-config
curl -sS http://localhost:8640/api/ai/generation-health
curl -sS http://172.16.29.157:8640/api/offline/map-config
```

Expected Docker port shape:

```text
0.0.0.0:8640->5006/tcp
```

## Demo URL

Use the LAN runtime for the local/internal demo:

```text
http://172.16.29.157:8640
```

`localhost:8640` is also valid on the host machine.

## End-to-End Demo Path

Recommended operator flow:

```text
Open RMOOZ
-> Operational Scenario
-> Generate/open scenario
-> Scenario Evidence drawer: Evidence Quality
-> Click quality warning
-> Matrix filters affected units
-> Click unit row
-> Unit Status (selected-unit only): Review Contact Evidence
-> Review Engagement Evidence
-> Review Decision Chain
-> Review Recommended Checks
-> Confirm map overlay reason matches the panel reason
-> Review timeline and confirm events do not duplicate on refresh/reselect
-> Scenario Evidence drawer: Review Queue and Repair Planner when quality gaps exist
-> Open Evidence Snapshot
-> Copy JSON or Copy Summary
-> Download JSON if needed
-> Scenario Evidence drawer: Open Force Evidence Report
-> Copy JSON or Copy Summary
-> Download JSON if needed
-> Print Unit Snapshot
-> Print Force Report
```

The commander story should read as:

```text
quality warning -> affected units -> unit explanation -> map reason -> timeline -> export/print
scenario evidence gap -> review queue -> repair plan -> affected unit
handoff package -> receiving-operator diff -> acceptance decision -> receipt
```

## Handoff Acceptance Path (Receiving Operator)

Shift-change validation flow, all in the Scenario Evidence drawer:

```text
Sending operator:
-> Evidence Handoff Package panel
-> Copy/Download Package JSON

Receiving operator:
-> Handoff Acceptance panel
-> Paste the received handoff-package JSON
-> Preview Diff
   - Same scenario? (fingerprint match)
   - What changed? (added / changed / unchanged / local-only statuses, closeout delta)
   - Recommendation: Accept / Accept with Warnings / Reject
-> Decide: Accept, Accept with Warnings, or Reject
   - Accept applies review-session UI state only; Reject imports nothing
   - The decision is recorded in the Evidence Review Audit Trail
   - Commander Brief and Force Report show the acceptance status
-> Copy/Download the acceptance receipt (JSON)
```

## Print Preview Smoke Checklist

Manual browser print-preview smoke is still required for final demo confidence.

Checklist:

```text
[ ] Open a generated/opened operational scenario.
[ ] Select a unit from the readiness matrix.
[ ] Confirm Evidence Snapshot shows the selected unit.
[ ] Click Print Unit Snapshot.
[ ] Confirm browser print preview opens.
[ ] Confirm RMOOZ title is visible.
[ ] Confirm selected unit, final status, blocking reason, Arabic reason, target, weapon, decision chain, timeline, and read-only disclaimer are readable.
[ ] Cancel or close print preview.
[ ] Open Force Evidence Report.
[ ] Click Print Force Report.
[ ] Confirm browser print preview opens.
[ ] Confirm Ready / Blocked / Unknown / No-contact counts are readable.
[ ] Confirm top blockers, readiness matrix rows, force events, selected unit, Arabic labels, and read-only disclaimer are readable.
[ ] Cancel or close print preview.
```

Do not mark this complete from static tests alone; it is a real browser preview check.

## Verification Commands

Run the release and evidence gate stack:

```bash
node test-cmo-release-gate-1.js
node test-cmo-actionability-batch-gate-1.js
node test-scenario-evidence-completeness-batch-1.js
node test-scenario-evidence-review-queue-batch-1.js
node test-scenario-evidence-repair-plan-batch-1.js
node test-scenario-evidence-review-closeout-batch-1.js
node test-scenario-evidence-review-audit-trail-batch-1.js
node test-scenario-evidence-handoff-package-batch-1.js
node test-scenario-evidence-handoff-acceptance-batch-1.js
node test-cmo-evidence-print-layout-ui-1.js
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

## Read-Only Boundaries

The CMO evidence workflow is read-only. It must not introduce:

```text
backend PDF service
new backend evidence route
database writes
combat mutation
auto-fire
doctrine mutation
scenario contract changes
AI-written decision overrides
```

The evidence UI displays existing world-state, contact, engagement, decision-chain, overlay, timeline, readiness, Scenario-QA, recommendation, repair-plan, and report data.

## Known Remote/Public Issue

Remote/public access remains separate from the CMO evidence release:

```text
NET-8640-REMOTE-1 - Restore remote access to published offline runtime
```

Known state:

```text
localhost:8640 works
172.16.29.157:8640 works on the LAN path
155.140.70.51:8640 previously timed out
```

The public fix requires admin/network work:

```text
Windows inbound TCP 8640 allow rule
public/router NAT: public-ip:8640 -> 172.16.29.157:8640
```

External `8080` is optional because tiles are proxied through `8640` in the normal offline runtime.

## Rollback Tags

Use these rollback/demo points:

```text
scenario-evidence-v9 - handoff acceptance workflow (this baseline)
scenario-evidence-v8 - handoff package export/import
cmo-evidence-rehome-v1 - Scenario Evidence drawer split from Unit Status
cmo-evidence-v13 - print-ready CMO evidence layout
cmo-evidence-rc1 - release-candidate gate for v13
cmo-evidence-v14 - actionability commander pack
cmo-evidence-readability-v1 - readability CSS baseline
```

To inspect:

```bash
git show --stat cmo-evidence-v13
git show --stat cmo-evidence-rc1
```
