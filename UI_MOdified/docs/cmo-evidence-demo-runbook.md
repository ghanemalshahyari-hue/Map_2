# RMOOZ CMO Evidence Demo Runbook

## Release Baseline

Use this runbook for the current release-candidate baseline:

```text
scenario-evidence-v12  -> feat(scenario): add release visibility and certificate
scenario-evidence-v11  -> feat(scenario): add release audit and drawer consolidation
scenario-evidence-v10  -> feat(scenario): add evidence release gate
scenario-evidence-v9   -> feat(scenario): add evidence handoff acceptance workflow
cmo-evidence-rehome-v1 -> 764d260f style(cmo): rehome scenario evidence from unit status
scenario-evidence-v8   -> 941aa275 feat(scenario): add evidence handoff package
cmo-evidence-v14 -> 6f310c00 feat(cmo): add evidence actionability commander pack
```

This baseline includes the full CMO evidence workflow, print-ready evidence reports, the release-candidate static/runtime gate, actionability guidance, recommendations, Scenario Evidence completeness/review/repair/manual-fix/closeout/audit-trail, the handoff package + Handoff Acceptance workflow, the Evidence Release Gate (final release decision + certificate), release decision audit + receipt history, the consolidated 4-group Scenario Evidence drawer, the top-level release status HUD chip + printable release certificate, and main/offline parity checks.

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
   Evidence Release Gate, Quality, Alerts, Coverage, Readiness Matrix,
   Blocker Remediation, Force Feed, Force Report)
```

Scenario Evidence drawer — consolidated into 4 collapsible groups (after Batch 11).
A sticky quick-jump bar at the top — `[Overview] [QA Review] [Handoff] [Force Evidence]`
— opens and scrolls to any group. Unit Status stays selected-unit only.

```text
1. Commander Overview     (default OPEN)
   - Commander Brief
   - Evidence Release Gate
   - Evidence Quality
   - Evidence Alerts
   - Evidence Coverage

2. Scenario QA Review      (default OPEN)
   - Scenario Completeness
   - Objective X Health
   - Review Queue
   - Repair Planner
   - Manual Evidence Fix
   - Review Closeout
   - Audit Trail

3. Handoff Workflow        (default COLLAPSED)
   - Evidence Handoff Package
   - Handoff Acceptance

4. Force Evidence          (default COLLAPSED)
   - Readiness Matrix
   - Blocker Remediation
   - Force Feed
   - Force Report
```

Clicking a group header toggles that group; the quick-jump buttons expand the
target group and scroll it into view.

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

## Evidence Release Gate (Batch 10)

The Evidence Release Gate is the final "can this evidence package be released for
demo / handoff / review?" decision. It is read-only — it does not release, mutate,
or authorize anything; it reports a deterministic verdict from state already produced
by the closeout, handoff-acceptance, and fingerprint layers.

Deterministic release statuses:

```text
Ready for Release   جاهز للاعتماد
Ready with Warnings جاهز مع تنبيهات
Not Ready           غير جاهز
Incomplete          غير مكتمل
```

Required checks (all must pass for Ready for Release):

```text
- Closeout status: Ready for Handoff
- Handoff acceptance: Accepted or Accepted with Warnings
- Scenario fingerprint: Match (and unchanged since acceptance)
- Unresolved issues: 0
- Deferred issues: all justified (have a note)
- Fixed externally: all verified (have a note)
```

Status rules:

```text
Incomplete          -> review closeout not started/complete
Not Ready           -> any required check fails (lists blockers)
Ready with Warnings -> all required checks pass, but closeout has exceptions
                       or acceptance was "Accepted with Warnings"
Ready for Release   -> all required checks pass with no warnings
```

Operator flow (Scenario Evidence drawer, after Handoff Acceptance):

```text
-> Evidence Release Gate panel
-> read Release status + the Required checklist (pass/warn/fail/na per line)
-> read Blockers (what is preventing release) and Warnings
-> Copy Release Certificate (human-readable) / Copy Release JSON / Download Release JSON
```

The release status also appears as a row in the Commander Brief and a section in the
Force Evidence Report.

## Release Decision Audit + Receipt History (Batch 11)

Release decisions are now traceable. The Evidence Release Gate observes its own
verdict and logs browser-local audit events into the existing Evidence Review Audit
Trail, and keeps a short local receipt history. Still read-only — no backend, no
database, no world-state mutation.

Logged audit event types:

```text
release_ready
release_ready_with_warnings
release_not_ready
release_incomplete
release_blockers_changed
release_certificate_exported
release_json_exported
```

Behavior:

```text
- Status transitions log a release_<status> event (logged once per change, not per render).
- A change in the blocker set (same status) logs release_blockers_changed.
- Copy/Download of a certificate or release JSON logs an export event.
- The release-gate panel shows a "Latest Release Decision" receipt
  (decision, reason, timestamp, fingerprint) with a Copy Release History button.
- The Force Evidence Report includes a "Release Decision History" section
  (latest decision + recent receipts + export markers).
```

Where to look:

```text
Evidence Review Audit Trail panel (Scenario QA Review group) -> release_* events
Evidence Release Gate panel (Commander Overview group)       -> Latest Release Decision
Force Evidence Report (Force Evidence group)                 -> Release Decision History
```

## Release Visibility + Printable Certificate (Batch 12)

Release Status HUD chip — the release verdict is now visible at the workspace level
without opening the drawer. A chip in the app header shows:

```text
Evidence Release: <status>
بوابة الأدلة: <الحالة>
```

Chip states (color-dotted): Ready for Release / Ready with Warnings / Not Ready /
Incomplete. The chip appears once a scenario is active (populated from the release
gate). Clicking it:

```text
Click the release status chip
-> opens the Scenario Evidence drawer
-> scrolls to / focuses the Evidence Release Gate
```

Scenario Status Header Cluster (Batch 13) expands that header signal into four
compact read-only chips:

```text
Release: <status>     / الاعتماد
Closeout: <status>    / الإغلاق
Coverage: <percent>   / التغطية
Handoff: <status>     / التسليم
```

Click behavior:

```text
Release  -> Scenario Evidence drawer -> Evidence Release Gate
Closeout -> Scenario Evidence drawer -> Evidence Review Closeout
Coverage -> Scenario Evidence drawer -> Evidence Coverage
Handoff  -> Scenario Evidence drawer -> Handoff Acceptance
```

Header Status Details (Batch 14) makes the same four chips explain themselves
before the operator opens the drawer. Hover or keyboard-focus a chip to show a
compact details popover:

```text
Release  -> status reasons: unresolved issues, handoff acceptance, fingerprint checks
Closeout -> needs-review/deferred/fixed-externally counts and verification-note state
Coverage -> contact, engagement, and decision-chain evidence counts
Handoff  -> package fingerprint match/mismatch, decision, latest receipt availability
```

Keyboard behavior:

```text
Tab / Shift+Tab -> focus each chip and show details
Enter / Space   -> open the matching Scenario Evidence drawer section
Escape          -> dismiss the details popover
```

Header Status Actions (Batch 15) adds compact operator shortcuts inside that
same details popover:

```text
Release  -> Open Release Gate / View Release Blockers / Copy Release Summary
Closeout -> Open Closeout / View Unresolved Issues / Copy Closeout Summary
Coverage -> Open Coverage / View Review Queue / Copy Coverage Summary
Handoff  -> Open Handoff Acceptance / Open Handoff Package / Copy Handoff Summary
```

The open and view actions use the existing Scenario Evidence drawer targets.
Copy actions place a plain-text status summary on the clipboard for a quick
handoff note.

Status Header Command Palette (Batch 16) gives the same actions a fast
keyboard/search path from the main header:

```text
Ctrl+K or Scenario Actions -> Scenario command palette / أوامر السيناريو
Type release / coverage / handoff / review
Enter or click -> run the selected scenario evidence action
Escape -> close the palette
```

Searchable actions:

```text
Open Release Gate
View Release Blockers
Open Closeout
View Unresolved Issues
Open Coverage
Open Review Queue
Open Handoff Package
Open Handoff Acceptance
Copy Release Summary
Copy Coverage Summary
```

Command Palette Context + Quick Filters (Batch 17) adds scan helpers inside the
same palette:

```text
All / Release / Closeout / Coverage / Handoff / Copy -> filter the result list
Each result row -> current status context + leading reason or count
Example: Open Release Gate -> Release: Not Ready -> 2 unresolved issues
```

CMO War-Game Live Wiring adds a read-only readiness surface inside Scenario
Evidence:

```text
Scenario Evidence -> Commander Overview -> CMO War-Game Readiness
Open CMO Readiness -> drawer opens at the readiness brief
Open CMO Test Card -> drawer opens at the operator test card
Copy CMO Readiness Brief -> clipboard summary
Copy CMO Test Card -> clipboard summary
```

The readiness brief answers "can I run this war-game now?" with GO / GO with
warnings / Training preview only / NO-GO, confidence, run mode, and next actions.
The operator test card lists steps, observation focus, abort/pause criteria, and
after-action checks. Both are derived from existing scenario evidence surfaces.

CMO War-Game Run Instrumentation connects that readiness/test-card layer to the
actual Scenario Control Center run state:

```text
Open CMO Readiness
Run or pause the scenario in Scenario Control Center
Or click CMO Test Guide in Scenario Control Center
Watch CMO War-Game Live Run:
- current SCC state and run mode
- current operator step
- live observe checklist
- pause/abort warning if blocked or pending replan
- after-action checklist once complete
- evidence changes detected during the run
```

Testing value: during a CMO war-game smoke, the operator can keep the drawer open
and see whether the run is still healthy without hunting through Control Center
debug panels. If the scenario becomes blocked, the warning is visible beside the
test card instead of hidden in the run controls.

The cluster is display/navigation only. It does not add backend routes, database
state, auto-fix behavior, combat/action mutation, doctrine mutation, scenario
contract changes, or DOCX staging.

Printable Release Certificate — the Evidence Release Gate panel now has a
[Print Release Certificate] button (alongside Copy Certificate / Copy JSON /
Download JSON). It opens the browser print dialog with a formatted certificate:

```text
RMOOZ Evidence Release Certificate / شهادة اعتماد الأدلة
- Release status + releasable
- Scenario fingerprint
- Closeout status
- Handoff acceptance decision
- Fingerprint validation (Match / Mismatch)
- Required checks (pass/warn/fail/na)
- Deferred issue count
- Fixed-externally verification count
- Latest release decision timestamp
- Unresolved blockers
- Read-only disclaimer
```

The printable certificate reuses the existing CMO print layout (`cmo-print-report`).
The Force Evidence Report also links certificate metadata (type + status +
fingerprint + generated time) in its Release Certificate section. Still read-only:
printing/exporting records a review decision only — it does not release or mutate
scenario state.

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
node test-scenario-evidence-release-gate-batch-1.js
node test-scenario-evidence-release-audit-ux-batch-1.js
node test-scenario-evidence-release-visibility-batch-1.js
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
scenario-evidence-v12 - release visibility + printable certificate (this baseline)
scenario-evidence-v11 - release audit + drawer consolidation
scenario-evidence-v10 - evidence release gate
scenario-evidence-v9 - handoff acceptance workflow
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
