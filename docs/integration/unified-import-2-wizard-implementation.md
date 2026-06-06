# UNIFIED-IMPORT-2 — Import Scenario Wizard (implementation)

**Date:** 2026-06-06 · **Branch:** main · **Status:** ✅ implemented + tested (new 25/25; regressions green)
**Implements:** [unified-import-1-wizard-audit-and-design.md](unified-import-1-wizard-audit-and-design.md)
(incl. the partial-generation amendment).

## What shipped

One primary **"Import Scenario"** flow for normal operators:

```
Upload red/blue DOCX → Start Scenario Generation → live progress (real, from checkpoints)
   → auto publish → auto import → scenario opens on the map
```

On a stopped/failed run the wizard offers **Continue** (resume from checkpoint), **Restart**, **View Logs**,
and — only when ≥ 4 phases were generated — **Import Partial Scenario** (stamped + badged
"Partial Scenario — N/total phases"). The three legacy cards are **relocated, not deleted**, into a
collapsed **Advanced Import Tools** `<details>`.

## Files

| File | Change |
|---|---|
| `UI_MOdified/server/wargame-sim-bridge.js` | +helpers (`countCheckpoints`, `phasesTotal`, `runArgs`, `regenArgs`, `partialName`, `clobberConflict`, `computeSimProgress`); `/status` progress block; `/run?resume=1`; **new** `POST /regenerate`; `/import?partial=1` (+anti-clobber, +metadata) |
| `UI_MOdified/client/shell/scenario-import-wizard.js` | **new** — the wizard card + Advanced relocation |
| `UI_MOdified/client/app.html` | +1 `<script>` (after the 3 legacy import scripts) |

The porter (`scripts/port-wargame.js`), `scenario-loader.js`, `scenario-validator.js`, and the three legacy
cards/routes are **unchanged**.

## Server API

### `GET /api/wargame-sim/status` — new `sim` fields (read-only)
`phases_done` (count of `runs/<run>/checkpoints/phaseNN.json`), `phases_total` (from
`WarGamingGEN/inputs/scenario.json` `phases.length`, default 17), `partial_available`
(`!running && 0 < done < total`), `partial_import_allowed` (`partial_available && done ≥ 4`),
`last_run_id`, `can_resume` (`done > 0`), `outputs_present`, `status`
(`running|stopped_partial|complete|error|idle`), `message`. The FAST-DOC-2 `freshness` block is unchanged.

### `POST /api/wargame-sim/run?resume=1`
Appends `--resume` to the existing `test_full_run.py --all` spawn (engine replays checkpoints, continues
from the next phase). Still gated by `RMOOZ_ALLOW_SIM_RUN=1`; full-run behavior otherwise unchanged.

### `POST /api/wargame-sim/regenerate[?run=<id>]` — NEW
Spawns `python -m src.tools.regenerate_outputs [--run-dir runs/<id>]` to replay checkpoints into
`outputs/geojson/` — **no LLM, no DOCX parse, no retrieval-index touch** — so a stopped run (checkpoints
only) becomes publishable + importable. Gated by `RMOOZ_ALLOW_SIM_RUN=1` (else returns the manual command).
404 if no run; 400 if the run has no checkpoints.

### `POST /api/wargame-sim/import?partial=1[&name=&replace=1]`
- Requires **≥ 4 generated phases** (the loader validator floor `steps ∈ [4..20]`; the validator is **not**
  relaxed in this PR) — else **400**, nothing written.
- Default name `<base>__partial-<NN>` (keeps the partial separate from a later complete run).
- **Anti-clobber:** refuses to overwrite a scenario whose `generation_status`/`source_run` differs → **409**
  unless `?replace=1`. Plain authored scenarios (no generation metadata) are not guarded.
- Stamps on disk + in the response: `generation_status:"partial"`, `generated_phase_count`,
  `expected_phase_count`, `source_run`, `source:"WarGamingGEN"`, `imported_from_geojson:true`,
  `partial_import:true`, `can_resume_generation`.
- The **full** import path (no `?partial`) is unchanged (`source:"WarGamingGEN"`, `generated_from_docs`,
  same counts) and additionally reports `generation_status:"complete"`.

## Client flow & progress model

`0% validating → 10% staging → 20% run started → 20–80% real phase progress
(`20 + 60*(phases_done/phases_total)`, capped 80) → 85% publish → 95% import → 100% opened`.

- Poll `GET /status` every 4 s; show `phases_done / phases_total` + `message`.
- **Success** (`status==='complete'` or `exit_code===0 && export.all_phases`): auto-publish if needed →
  `/import` (auto `?confirm=1` if the just-made export trips the stale guard) → `/api/ai/scenario/<name>` →
  `loadLiveScenarioFromJson` → `rmooz:wg-import-loaded` → badge "Scenario imported — N phases".
- **Stopped/failed:** panel with Continue (`/run?resume=1`), Restart, View Logs; **Import Partial** when
  `partial_import_allowed`; for `partial_available` with N<4, a note "available after at least 4 phases."
- **Import Partial:** `/regenerate` → `/publish` → `/import?partial=1` → open → badge
  "Partial Scenario — N/total phases."
- If `RMOOZ_ALLOW_SIM_RUN!=1` (or manual mode), Start surfaces a clear message and opens Advanced Tools.

## Safety (verified)

No auto-import before an explicit Start (then auto on success) or an explicit Import-Partial click · no
scenario mutation before Start · no DOCX parsing in RMOOZ · no retrieval-index/SmartSearch change · no
hardcoded data · no invented phases (regenerate emits only generated phases; porter derives the rest) · no
porter bypass · FAST-DOC-2 freshness guard preserved · all legacy manual/advanced routes + cards still work.

## Verification

**`node test-unified-import-2-wizard.js` → 25/25**, covering all 15 required checks: status progress fields;
`resume=1` → `--resume`; `phases_done` from checkpoints; progress math (0→20, half→50, full→80); N<4 partial
blocked (400, no write); N≥4 partial allowed + metadata + versioned name; regenerate uses
`regenerate_outputs` with no LLM env; partial metadata persisted on disk; anti-clobber 409 + `replace=1`
override; full-success route order (publish→import→load) + full import unchanged; legacy cards kept under
Advanced; no DOCX parsing; no SmartSearch; no import on load; and the two embedded regressions.

**Regressions:** `test-fast-doc-2` 36/0 · `test-fast-doc-1` 30/0 · `test-fast-int-2` 21/0 ·
`test-local-import-2` 13/13.

**Live** (server restarted): `GET /status` returns the full `sim` progress block (observed a real
`complete` run, 17/17, `outputs_present:true`). In the browser: `#wg-wizard-card` mounted with the Start
button, **Advanced Import Tools** present + collapsed by default + positioned after the wizard, all three
legacy cards relocated inside it, `window.AppScenarioImportWizard` present, **no console errors**.

## Deployment prerequisites (REQUIRED for one-click generation)

> Verified during manual testing (2026-06-06): with these set, Start runs the real sim and progress climbs
> from checkpoints; without `RMOOZ_PYTHON` the run dies instantly (see Troubleshooting).

Set these on the **RMOOZ server process** (shell env or `.env` — see `UI_MOdified/.env.example`), then restart:

| Variable | Value (this machine) | Why |
|---|---|---|
| `RMOOZ_ALLOW_SIM_RUN` | `1` | Enables the wizard's Start to spawn the sim (else manual/Advanced only). |
| `RMOOZ_TESTINGAI_DIR` | `C:\Users\EngCoder\Desktop\TestingAI` | The WarGamingGEN/TestingAI tree (default `%USERPROFILE%\Desktop\TestingAI`). |
| `RMOOZ_PYTHON` | `C:\Users\EngCoder\Desktop\TestingAI\.venv\Scripts\python.exe` | **REQUIRED** — the venv python with WarGamingGEN's deps. The bridge does **not** auto-detect the venv; bare `python` lacks the deps. |
| `RMOOZ_SIM_MODEL` | `qwen2.5:7b` | Local model used per phase; must be served (e.g. Ollama `ollama serve` + `ollama pull qwen2.5:7b`). |

PowerShell example:
```powershell
$env:RMOOZ_ALLOW_SIM_RUN="1"
$env:RMOOZ_TESTINGAI_DIR="C:\Users\EngCoder\Desktop\TestingAI"
$env:RMOOZ_PYTHON="C:\Users\EngCoder\Desktop\TestingAI\.venv\Scripts\python.exe"
$env:RMOOZ_SIM_MODEL="qwen2.5:7b"
cd C:\Users\EngCoder\Desktop\Map\UI_MOdified ; node server\web-server.js
```

Without these, the wizard **fails gracefully** — Start reports generation is disabled and points the operator
to Advanced Tools / Continue·Restart·View Logs; nothing crashes.

### Troubleshooting — `ModuleNotFoundError: No module named 'openai'`

- **Symptom:** "Start Scenario Generation" fails within a few seconds; the run shows `status: error` and
  **View Logs** contains `ModuleNotFoundError: No module named 'openai'` (the run never creates a run dir, so
  `phases_done` stays at the previous run's count).
- **Cause:** the RMOOZ server is invoking **bare `python`** instead of the WarGamingGEN **venv** python —
  i.e. `RMOOZ_PYTHON` is unset or wrong. WarGamingGEN's dependencies (`openai`, etc.) live only in its venv.
- **Fix:** set `RMOOZ_PYTHON` to the TestingAI venv python
  (`C:\Users\EngCoder\Desktop\TestingAI\.venv\Scripts\python.exe`) and **restart the RMOOZ server**, then
  retry Start. Confirm via `GET /api/wargame-sim/status` → `commands.full_run` shows the venv python path.
- **Note:** auto-detecting the venv is intentionally **not** done yet (kept the bridge logic unchanged); this
  is a deployment/config requirement, documented here and in `.env.example`.

## Follow-ups (not in this PR)

- Optional validator relaxation for `generation_status:"partial"` to allow 1–3-phase partials (deferred by
  decision — keeps the schema strict).
- A persistent partial **chip in the scenario list** (the badge is in the wizard card today).
