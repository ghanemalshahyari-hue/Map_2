# Local Wargame Outputs — drop folder (LOCAL-IMPORT-2)

This is the **local in-app import drop** for WarGamingGEN / Wargame GeoJSON outputs.
Copy a generated run folder here and import it from inside RMOOZ — **no dependency on the
external `TestingAI` tree, `runs/latest`, or the stale flat `export_to_rmooz/geojson/` bundle.**

## How to use

1. Copy one run into its own `<run_id>/` subfolder here, e.g.:

   ```
   data/imports/wargame_outputs/my_test_run_001/
   ├── all_phases.geojson        ← REQUIRED
   ├── manifest.json             ← optional
   ├── geojson/                  ← optional (step00.geojson … stepNN.geojson)
   ├── wargame_report.md         ← optional, display-only
   ├── wargameschedule.csv       ← optional, display-only
   ├── checkpoints/              ← optional, display-only
   └── source_docs/              ← optional, display-only (red_team.docx / blue_team.docx — NOT parsed)
   ```

2. (Optional) write a `latest.json` here to mark the default run:
   `{ "latest": "my_test_run_001" }`

3. Open RMOOZ → Scenario Workspace import area → **"Import Local Wargame Output"**.
4. Pick the run, review the read-only summary, click **Import**.

## Rules

- Each run **must** live in its own `<run_id>/` subfolder with an `all_phases.geojson`.
  A flat `all_phases.geojson` dropped directly in this folder (no `<run_id>/`) is **ignored**.
- Importing a run older than the newest local run warns (HTTP 409); override is explicit.
- RMOOZ imports through the existing porter (`scripts/port-wargame.js`) — it never invents
  units/coords/phases, never parses DOCX, never runs WarGamingGEN, never calls an LLM.

## Git

Run folders here are **git-ignored** (bulk generated geojson). This `README.md` and the
sibling `.gitkeep` are tracked so the folder exists on a fresh clone. See `.gitignore`.
