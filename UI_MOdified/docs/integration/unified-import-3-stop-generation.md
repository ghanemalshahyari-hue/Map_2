# UNIFIED-IMPORT-3: Stop Generation

UNIFIED-IMPORT-3 adds an operator-safe stop path to the unified Import Scenario wizard.

## User Flow

While WarGamingGEN is running, the wizard shows **Stop Generation** next to **Start Scenario Generation**.

When the operator clicks **Stop Generation**:

1. The client calls `POST /api/wargame-sim/cancel`.
2. The server signals the active WarGamingGEN child process tree to stop.
3. The client keeps polling `/api/wargame-sim/status` until `sim.running` is false.
4. The wizard shows the existing stopped panel:
   - Continue Generation
   - Restart Generation
   - View Logs
   - Import Partial Scenario when `partial_import_allowed` is true

If fewer than four phases exist, partial import stays hidden and the wizard shows:

`Partial import available after at least 4 generated phases.`

## Server Contract

`POST /api/wargame-sim/cancel`

Successful response:

```json
{
  "ok": true,
  "cancelled": true,
  "phases_done": 5,
  "phases_total": 17,
  "partial_available": true,
  "partial_import_allowed": true,
  "can_resume": true,
  "sim": {
    "running": false,
    "status": "stopped_partial"
  }
}
```

If no WarGamingGEN child is active, the route returns `409` with:

```json
{
  "ok": false,
  "cancelled": false,
  "error": "no active WarGamingGEN run to cancel"
}
```

## Safety Boundaries

Cancel does not:

- delete run folders
- delete checkpoints
- delete outputs
- publish exports
- import scenarios
- mutate the scenario database
- call the LLM
- parse DOCX
- modify SmartSearch

Cancel only signals the active child process and updates in-memory run state. Checkpoints remain in `WarGamingGEN/runs/<run-id>/checkpoints`, so the operator can resume with `--resume` or regenerate/publish/import a partial scenario if enough phases exist.

## Status Behavior

After cancel:

- `sim.status` is `stopped_partial` when checkpoints exist and generated outputs are not complete.
- `partial_import_allowed` is true only when `phases_done >= 4`.
- `can_resume` is true when at least one checkpoint exists.
- non-zero OS exit codes from an operator stop are not presented as run errors.

## Regression Test

Run:

```powershell
node scripts/test-unified-import-3-stop-generation.js
```

The test uses a fake WarGamingGEN child process that writes checkpoints, then verifies that cancel preserves checkpoint files, kills the child, does not publish or import, and drives the wizard into the stopped state.
