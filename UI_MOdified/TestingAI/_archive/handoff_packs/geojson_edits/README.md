# GeoJSON Writer v2 — Apply on the Linux laptop

This folder contains everything the Linux Claude needs to upgrade the WarGameGenerator's GeoJSON output from v1 (sparse) → v2 (full force + movement + engagement arcs) on the Linux laptop.

## What's in this folder

| File | What it is | Where it goes on Linux |
|---|---|---|
| `README.md` | This file — instructions for the Linux Claude | (don't move) |
| `geojson_writer.py` | The v2 writer, replaces the existing one | `WarGameGenerator/src/output/geojson_writer.py` |
| `regenerate_outputs.py` | New script — rebuilds CSV/MD/GeoJSON from existing checkpoints with $0 LLM cost | `WarGameGenerator/src/tools/regenerate_outputs.py` |
| `__init__.py` | Empty package marker | `WarGameGenerator/src/tools/__init__.py` |
| `CHANGES_GEOJSON_V2.md` | Detailed change log — what's different from v1 and why | (read it; place wherever convenient) |
| `wargame_geojson.schema.json` | The formal JSON Schema for validating outputs | (read it; useful for verification) |

## Quick steps for the Linux Claude

### Step 1 — Place the files

Assuming the WarGameGenerator project lives at `~/wargame/WarGameGenerator/`:

```bash
# Replace the writer
cp geojson_writer.py ~/wargame/WarGameGenerator/src/output/geojson_writer.py

# Create the tools/ subpackage and drop the regenerator
mkdir -p ~/wargame/WarGameGenerator/src/tools
cp __init__.py            ~/wargame/WarGameGenerator/src/tools/__init__.py
cp regenerate_outputs.py  ~/wargame/WarGameGenerator/src/tools/regenerate_outputs.py
```

### Step 2 — If there's already a wargame run on disk, regenerate its outputs (no LLM cost)

```bash
cd ~/wargame/WarGameGenerator
source ../DecisionMakingSteps_TRANSFER/venv_linux/bin/activate  # or whatever the venv is named

python -m src.tools.regenerate_outputs
```

This will:
1. Find `runs/latest/` (the most recent run dir)
2. Read its `checkpoints/phase*.json` files
3. Replay them into a fresh world state
4. Re-emit the CSV, Markdown, and GeoJSON outputs using the new v2 writer
5. **No LLM calls. Free. Takes ~5 seconds.**

If you want a specific run dir:

```bash
python -m src.tools.regenerate_outputs --run-dir runs/2026-05-21_some_run
```

### Step 3 — Verify the v2 output

```bash
cd ~/wargame/WarGameGenerator/runs/latest/outputs/geojson

python3 -c "
import json
for p in [0, 5, 9, 16]:
    fc = json.load(open(f'step{p:02d}.geojson'))
    props = fc['properties']
    print(f'step{p:02d}: features={len(fc[\"features\"])} version={props.get(\"version\")} '
          f'units={props.get(\"n_units\")} actors={props.get(\"n_actors\")} '
          f'affected={props.get(\"n_affected\")} arcs={props.get(\"n_engagement_arcs\")}')
"
```

Expected output (numbers will vary slightly by run, but shape should match):

```
step00: features=197 version=2 units=173 actors=14 affected=12 arcs=12
step05: features=194 version=2 units=173 actors=14 affected=8 arcs=8
step09: features=194 version=2 units=173 actors=12 affected=8 arcs=8
step16: features=196 version=2 units=173 actors=12 affected=10 arcs=10
```

**Key things to verify**:
- `version` == 2
- `units` == 173 (the full OOB)
- `arcs` > 0 (engagement causality is being emitted)

### Step 4 — Optionally validate against the formal schema

```bash
pip install jsonschema

python3 -c "
import json
from jsonschema import validate
schema = json.load(open('wargame_geojson.schema.json'))   # this folder's copy
for p in range(17):
    fc = json.load(open(f'runs/latest/outputs/geojson/step{p:02d}.geojson'))
    validate(instance=fc, schema=schema)
print('All 17 step files pass the schema')
"
```

### Step 5 — Future runs

Once these files are in place, any future `python tests/test_full_run.py --all` will automatically use the v2 writer at end-of-run. No further intervention needed. The `regenerate_outputs.py` script is also there for any time you want to re-emit outputs after a writer tweak without burning LLM tokens.

## What changed at a high level

**v1** (deprecated): Emitted ~12-15 features per phase — only the units that took action or were hit. Could not show full force, movement, or causality.

**v2** (this folder): Emits **~194-198 features per phase** — every unit in the OOB at its current visualization position, plus engagement arc LineStrings connecting attackers to targets, plus the previous-phase position as a property so a 3D viewer can interpolate.

Read `CHANGES_GEOJSON_V2.md` for the full breakdown.

## Files structure after applying

```
WarGameGenerator/
├── src/
│   ├── output/
│   │   ├── geojson_writer.py            ← REPLACED
│   │   ├── csv_schedule.py              (unchanged)
│   │   └── markdown_report.py           (unchanged)
│   └── tools/                            ← NEW
│       ├── __init__.py                   ← NEW
│       └── regenerate_outputs.py         ← NEW
├── runs/
│   └── latest/
│       └── outputs/
│           └── geojson/                  ← REGENERATED v2 files land here
└── (everything else unchanged)
```

## If something goes wrong

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: src.tools` | Did you create `src/tools/__init__.py`? |
| `regenerate_outputs.py: no run_dir found` | No prior runs on disk. Run `python tests/test_full_run.py --all` first, then regenerate. |
| Output still has `version: 1` or no `version` field | The new `geojson_writer.py` didn't get copied over. Re-check Step 1. |
| Output is missing the `tools/` package | Same — re-check Step 1. |
| `KeyError` mentioning `inventory_red` or `ammo_red` | The orchestrator's `PhaseRecord` schema changed alongside this edit. Make sure the project is up-to-date with the latest WarGameGenerator code (the runs/checkpoints don't store these fields by default — the regenerator computes them from the live world state, so you should be fine). If the error persists, re-run `tests/test_full_run.py --all` to produce fresh checkpoints. |

## After applying — what to ship onward

The Linux Claude can ship the regenerated GeoJSON files to the visualization-app friend exactly as documented in `wargame_geojson.schema.json` + the `schema/` folder. The data is RFC 7946-compliant and passes the application schema.
