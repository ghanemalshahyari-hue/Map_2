# SOURCE-INSPECTOR-1 — Scenario Source Inspector

**Date:** 2026-06-06 · **Mode:** read-only feature (no WarGamingGEN/SmartSearch/DOCX/phase/unit logic changed)
**Builds on:** [STEP0-DISCOVERY-1](step0-discovery-dynamic-phases-units.md),
[UNIFIED-IMPORT-2](unified-import-2-wizard-implementation.md).

## What it does

Adds a **read-only "Scenario Source Inspector"** to the unified Import Scenario wizard so the operator can
see exactly **which files build the scenario/GeoJSON, what each controls, whether it's editable, and how to
change it safely** — answering the recurring "where do the units/phases come from?" confusion.

It is a pure *explanation layer* over the existing pipeline: it only **stats/reads** files the pipeline
already produces. It never parses DOCX, never runs the sim, never mutates a scenario.

## Server — `GET /api/wargame-sim/sources` (new, read-only)

`server/wargame-sim-bridge.js` → `computeSources(c, ctx)`. Reuses existing helpers: `cfg()`, `statInfo()`,
`sha256File()`, `phasesTotal()`, `countCheckpoints()`, `latestRunDir()`, `latestExport()`,
`computeFreshness()`, `scenarioFilePath()`. Returns:

```jsonc
{ "ok": true, "run_id": "<latest run>", "paths": { … }, "legend": { … },
  "sources": [ { key, file, location, role, used_for, source_type, editable, editable_note?,
                 how_to_modify, regen_needed, status }, … ] }
```

The nine source rows (the chain), each with live `status`:

| key | file | source_type | editable | status highlights |
|---|---|---|---|---|
| `red_docx` | red_team.docx | source input | **true** | input/staged present, size, sha256 |
| `blue_docx` | blue_team.docx | source input | **true** | input/staged present, size, sha256 |
| `scenario_json` | scenario.json | advanced input | **true** | present + **`phases_total`** (dynamic) |
| `step0` | Step 0/*.json | planning context | false | file list + count — *"NOT the current phase source"* |
| `oob` | current_oob_from_docx.json | generated intermediate | false | **red/blue unit counts** (pre-generation) |
| `checkpoints` | checkpoints/phaseNN.json | runtime checkpoint | false | `phases_done / phases_total` + run_id |
| `all_phases` | all_phases.geojson | final output | false | present, size, mtime, sha256, **feature phases/red/blue** |
| `export` | export_to_rmooz/<run_id>/ | published output | false | run_id + FAST-DOC-2 stale/current |
| `rmooz_scenario` | data/scenarios/<scenario>.json | RMOOZ database record | false (editor only) | active name + generation_status |

**Truthfulness guardrails baked in:** Step 0 is reported as *planning context, NOT the phase source* (per
STEP0-DISCOVERY-1); GeoJSON is `final output` (not source); `phases_total` is read live from `scenario.json`
(no hardcoded 17); unit counts come from the OOB JSON / GeoJSON features (never invented).

## Client — wizard section (collapsed by default)

`client/shell/scenario-import-wizard.js` adds a `<details id="wg-wz-sources">` **"Scenario Source Inspector —
مصادر بناء السيناريو"** below Advanced Import Tools. It renders a compact table (File · Type · Edit · Used
for · Status) from `/sources`, a **Refresh Sources** button, and a fixed warnings block:

- To change **units** → edit the **DOCX** and regenerate.
- To change **phase count/names** → edit **scenario.json** and regenerate.
- **Do not edit generated files** (OOB, checkpoints, GeoJSON, export).
- Step 0 files are **planning context** unless explicitly wired as generator input.
- **GeoJSON is output, not source.**

Editable rows show **✎ yes** (green) with the how-to-modify as a tooltip; generated rows show **🔒 no**.
Loads on mount + on Refresh. Collapsed by default.

## Safety (verified)

Read-only: no writes, no DOCX parse, no `spawn`/sim run, no SmartSearch, no scenario-DB mutation, no invented
data, no hardcoded scenario values. The endpoint only reads files the pipeline already produced.

## Verification

`node test-source-inspector-1.js` → **18/18** (15 required checks + route smoke + 3 embedded regressions):
red/blue docx rows; **scenario.json phases dynamic (fixture uses 12, not 17)**; Step 0 = context not phase
source; OOB red/blue counts (84/89); checkpoints `phases_done/total` (5/12); all_phases mtime/size/sha256 +
feature counts; generated files `editable:false`; DOCX + scenario.json `editable:true`; GeoJSON = final
output; no DOCX parsing; `/sources` + `computeSources` never spawn; no SmartSearch; no DB mutation; wizard
inspector collapsed by default. Regressions: `test-unified-import-2` 25/25, `test-local-import-2` 13/13,
`test-fast-doc-2` 36/0.

## What this answers for the operator

- **What controls unit numbers?** → the DOCX (→ `current_oob_from_docx.json` → GeoJSON features).
- **What controls phase count?** → `scenario.json` `phases[]` (`phases_total` shown live).
- **What is only generated output?** → OOB, checkpoints, all_phases.geojson, export (all `🔒 no`).
- **What can I safely edit?** → DOCX (units) and scenario.json (phases); everything else regenerates.
- **What was actually used in the current run?** → the `status` column (staged DOCX, run_id, checkpoint
  count, published export, active scenario).
