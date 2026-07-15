---
name: project-batch-c-runtime-fidelity-closure
description: "Batch C (Scenario Playability & Runtime Fidelity) closed and published: C1-C10 scope, the post-phase-exhaustion runtime-continuation fix, and the quarantine-baseline duplicate-key regression guard."
metadata:
  node_type: memory
  type: project
  originSessionId: 8d781df4-10e7-43c2-956b-d9565691893a
---

Batch C — Scenario Playability & Runtime Fidelity — **CLOSED and PUBLISHED** at commit `28040882` on `origin/main` and `map2/main` (fast-forward from `80d8bc9e`). Follows [[project_batch_b_command_authority_slices_1-3|Batch B]]: the Builder could already author mission tasks, routes, runtime events, decision points, and victory conditions; Batch C makes the runtime actually act on them.

## Slices C1–C10 (final scope)

- **C1/C2 — mission/group routes:** authored `mission_tasks[]` (single-unit and group, via `unit_ids[]`) drive real movement through the existing `runtime-movement.js` engine — no new movement engine.
- **C3 — mission-task runtime status:** a read-only overlay reports `waiting|active|complete|blocked` + reason per task, surfaced in the SCC.
- **C4 — geo-trigger zones:** `runtime_events[]` gained `trigger_type: time|geo|both`; geo/both events evaluate live unit position against an authored polygon (`turf.booleanPointInPolygon`).
- **C5 — approved safe effects apply for real:** operator-approved safe effects (`add_notification`, `set_runtime_flag`, `clear_runtime_flag`, `open_decision_point`, `close_decision_point`, `update_mission_task_status`) now actually mutate state once approved, not just journal a relabel. `weapon_release` stays inert regardless of approval.
- **C6 — runtime events/decision-points status panel:** per-event fired/pending/blocked board; decision-point history (previously only open points were shown).
- **C7 — victory/failure/timeout/scenario-end conditions:** real force-ratio and objective-hold-duration victory checks, plus a runtime-clock timeout path, feed the single existing `_scenarioEndCondition` chokepoint.
- **C8 — runtime-play AAR:** a distinct outcome-narration AAR (`runtime-replay.js`), separate from the CMO release-grading AAR, reconstructed from the journal.
- **C9 — dangerous-effect safety regression lock:** no product change; a test formalizes that hard-blocked effect kinds (including `weapon_release`) never reach an execution-plan candidate list, including after C5's reconnection.
- **C10 — deep end-to-end pass**, corrected (below).

## Runtime continuation after COA-phase exhaustion (owner-caught defect, fixed)

C10's first pass proved the dangerous-effect gate by injecting the effect while COA-phase tick budget remained — which avoided the real defect instead of proving the contract. Root cause: scenario-clock advance, mission-task movement, and runtime-event firing all lived only inside `_coaExecTick()`'s tail; once committed-COA phases exhausted, control fell to `_scenarioTransition()`, which never touched the clock or fired events. An event scheduled after the last phase was silently never evaluated again.

**Fix:** the tick logic was extracted into a shared `free-fight-demo.js::_tickScenarioClockAndRuntimeEvents()`, called from both `_coaExecTick()` (unchanged while phases run) and `_scenarioTransition()` (new — runs once phases exhaust, respecting pause). A related bug in `_runScenario()`'s resume logic (it only cleared `.paused` when phases were still executing) was fixed at the same time. Proven directly by `test-runtime-post-phase-continuity-1.js` (event-after-final-phase fires; a safe approved effect applies exactly once; a dangerous late effect stays blocked; victory/timeout can occur post-exhaustion; pause freezes evaluation; resume continues it; stop/reset doesn't carry stale fired-state into a new run) and end-to-end by the restored `verify-batch-c-runtime-fidelity-journey-1.js`.

## Dangerous-effect boundary

Confirmed solid before, during, and after C5's safe-effect reconnection: every `DANGEROUS_RUNTIME_EFFECT_REASONS` kind (including `weapon_release`) is rejected before the doctrine gate runs and never reaches any execution-plan candidate list. Locked in by C9's regression test; unaffected by the C10 correction.

## Duplicate-baseline-key regression guard

A separate accounting error surfaced while quarantining two genuinely pre-existing failures during the C10 correction: two new JSON entries were hand-added to `scripts/test-baseline-known-failures.json` for filenames that were **already** in the baseline under normalized (digit-to-`#`) signatures — `JSON.parse`'s last-duplicate-key-wins behavior silently shadowed the mistake, so the reported quarantine count stayed numerically correct despite the error. Fixed by removing the dead duplicates (baseline is now byte-identical to `origin/main`) and by closing the underlying hole: `scripts/baseline-duplicate-key-check.js` scans the raw baseline text for repeated filename keys *before* `JSON.parse` runs; `run-all-tests.js::loadBaseline()` now fails loud (`[FATAL]`, exit 1, no test children spawned) on any duplicate. Proven by `test-baseline-duplicate-key-guard-1.js` (9/9), including a spawn-based integration check via a new `RMOOZ_TEST_BASELINE_PATH` override.

## SCC status and final evidence

Mission-task/group movement, geo-trigger firing, decision-point history, and victory/timeout outcomes are all live in the Scenario Control Center's Run panel, reusing the existing status+reason idiom (no new vocabulary). Published as commit **`28040882`** (one cohesive commit for the whole batch, per the batch's heavy slice overlap).

**Final totals, all gates, after the correction and the duplicate-key fix:** `npm test` (fast+main) — **281 passing / 93 quarantined / 0 new failures**. `test:browser` — 3 passing / 0 quarantined / 0 new. Quarantine baseline: exactly 93 entries, no duplicates, byte-identical to `origin/main`. **Quarantine review due 2026-08-13.**

## Deferred (unchanged by this batch)

Full offline-tree synchronization and unit/function-scoped operational authorization remain deferred — both pre-date Batch C and are out of scope for it.
