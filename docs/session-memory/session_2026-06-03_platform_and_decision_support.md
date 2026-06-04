---
name: session_2026-06-03_platform_and_decision_support
description: Session 2026-06-03 — DOCTRINE-A → L3 Why-Not ladder → L3.5-A → platform shell (entry hub, native scenario loader, de-W3 gate, workspace polish, scenario-entry consolidation). All on main, pushed to map2/main. Cross-device handoff.
metadata:
  node_type: memory
  type: project
---

**Session 2026-06-03 — branch `main`, fully pushed to `map2/main` (HEAD `f4a85bf`).**
Cross-device handoff: pull `map2/main` on the other device to continue. `origin/main` is ~92 commits
behind (not synced this session — push there only if you want the primary repo updated).

## What shipped (in order, each its own commit + tests + browser-verify)
1. **DOCTRINE-A** — `computeDoctrineEvidence()` in `world-state.js` (NOT a `doctrine-engine.js`; owner ruling:
   evidence, not behavior). 9 doctrine evidence types into the OBJ-A ledger → OBJ-C panel. Resolved Drift D4
   (widened `test-obj-a` whitelist). `test-doctrine-evidence.js` 78/78. See [[project_doctrine_a_evidence_source]].
2. **L3-A-1 / L3-A-2** — `shell/action-feasibility.js` `evaluateAction(ws, action)` Why-Not evaluator.
   ENGAGE (1:1 with ENG1 reasons) + ATTACK_OBJECTIVE (conservative blockers + risks from existing state).
   No new thresholds/sim/scoring. `test-l3a-why-not.js` 80/80. Contract: `L3-A-SPECIFICATION.md`.
3. **L3-B-1** — read-only Why-Not display panel in the Scenario Workspace (`shell/why-not-panel.js`).
   Fixed two real OBJ-C bugs en route (stepIdx crash on objective-marker click; missing close button/Esc).
4. **L3.5-A** — `generateFeasibleAlternatives()` (same module): inverts each blocker/risk → a read-only
   feasible-alternative OPTION. Lookup-table, no simulation/ranking/recommendation wording.
   `test-l35a-alternatives.js` 29/29. NOT wired to UI yet (L3.5-B is the display slice).
5. **Platform PR 1** — `home.html` launch hub (login → hub → workspace), `home.js`, login defaults to hub.
6. **Platform PR 2** — `samples/rmooz-native-01.json` + `shell/native-scenario-loader.js`; `?launch=demo`
   loads the native scenario through the EXISTING global path (`AppShellScenarioWorkspace.loadLiveScenarioFromJson`).
7. **de-W3 gate** — `deriveWorldState` `degraded` is now CAPABILITY-based (`w3 || (objective && units)`),
   not `schema_variant==='w3-rich'`. Non-W3 scenarios now get full decision support. W3 byte-for-byte
   unchanged. (Removed the deepest W3 coupling.)
8. **Platform PR 3** — workspace polish: objective legend label scenario-derived (was hardcoded "OBJ NASSER");
   AO rendering tolerant of GeoJSON + bare `coords` (was throwing `poly is not iterable`).
9. **Scenario Entry Consolidation** — app.html top bar gains "← Main Window" + "Export Scenario JSON"
   (safe local export, no backend); all scenario import/demo loaders hidden behind one collapsed
   "Developer / Import" toggle (`shell/workspace-consolidation.js`). HUD scenario picker kept.

## Strategy locked (read these before building more)
- **Decision-support ladder** + the **L3.5 "alternative generation, not prediction"** thesis, the
  three-question entry script, the naming guardrail ("Feasible Alternatives" not "AI Recommendations") —
  all in [[project_next_operator_question_gap]].
- **PARKED (do not build):** Team/Operator assignment ([[project_team_operator_assignment_parked]]);
  CMO-style Command Actions Bar ([[project_command_actions_bar_parked]] — review/assess read-only first,
  after authoring; never execution; no Auto/Manual Engage).
- World State direction still central ([[project_world_state_connection_central]]); explainability before
  execution (the through-line of the whole session).

## Tech debt flagged (not blocking)
- **`APP_INVENTORY.md` is STALE** — this whole session (~13 commits) isn't reflected. Run `/audit-app` to
  resync before substantial new work.
- Map legend other W3-isms; `sample-sahil-corridor.json` uses bare `coords` (now tolerated).
- L3.5-A is logic-only (needs L3.5-B to surface alternatives in the Why-Not panel).
- `docs/cmo-model-reference.md` added (companion to the exhaustive CMO rules; grounds chosen items 4/6/7/8/9).

## Architecture now
`index.html` = login · `home.html` = scenario launch center · `app.html` = operations only.
Global pipeline proven non-W3: `scenario JSON → loadLiveScenarioFromJson → world state → map → evidence → Why-Not`.

## Suggested next (owner gates apply)
Either **L3.5-B** (display feasible alternatives under each Why-Not blocker/risk) OR finish wiring the
home-hub intents (Load / New / Editor / Resume → real scenario flows). Start the next session with an
`/audit-app` to refresh the map.
