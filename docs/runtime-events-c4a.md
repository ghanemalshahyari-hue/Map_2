# Runtime Events C4a Contract

Date: 2026-07-06

## Rule

Clock drives runtime events. Step index does not.

Steps remain snapshots/review/AAR. The Scenario Control Center runtime clock is
the source of execution time.

## Scope

C4a adds:

- Additive schema descriptors for `runtime_events`, `mission_tasks`,
  `decision_points`, and `victory_conditions`.
- A pure evaluator at `UI_MOdified/client/shell/runtime-events.js`.
- A browser facade, `window.AppRuntimeEvents`, loaded read-only by the main app.

C4a does not:

- Execute event effects.
- Mutate units, map state, world state, or scenario JSON.
- Write journal entries.
- Call backend routes.
- Touch offline deployment.
- Touch DB-Lite.
- Change detection or engagement production logic.

## Evaluator API

- `normalizeRuntimeEvents(scenario)`
- `normalizeMissionTasks(scenario)`
- `normalizeDecisionPoints(scenario)`
- `normalizeVictoryConditions(scenario)`
- `evaluateRuntimeEvents(scenario, runtimeState)`
- `getDueRuntimeEvents(scenario, clock, firedState)`
- `markRuntimeEventsFired(firedState, dueEvents, dueDecisionPoints)`
- `resetRuntimeEventState()`

`evaluateRuntimeEvents` returns:

- `due_events`
- `due_decision_points`
- `active_mission_tasks`
- `victory_evaluations`
- `next_event_hours`
- `fired_state`

All outputs are read-only proposals for later execution layers.

## Deferred To C4b

- Event effects -> journal entries.
- UI notifications for due events.
- Controlled world-state updates.
- Mission task execution and AI support.
- Victory/end condition resolution.
