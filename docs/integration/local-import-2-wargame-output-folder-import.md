# LOCAL-IMPORT-2 — Local Wargame Output Folder Import

**Date:** 2026-06-05 · **Branch:** main · **Status:** ✅ implemented + tested (unit 13/13, live smoke pass)
**Builds on:** [LOCAL-IMPORT-DISCOVERY-1](local-import-discovery-current-folders.md) (decision: import from
`UI_MOdified/data/imports/wargame_outputs/<run_id>/`, not flat bundles, not `runs/latest`, not external TestingAI).

## What this adds

An in-app importer for WarGamingGEN / Wargame GeoJSON outputs the operator **copies into RMOOZ's own data
tree**. The operator drops a run folder, opens RMOOZ, picks the run, reviews a read-only summary, clicks
Import — and RMOOZ runs it through the **existing porter** (`scripts/port-wargame.js`). No dependency on the
external `TestingAI` tree, `WarGamingGEN/runs/latest`, or the stale flat `export_to_rmooz/geojson/` bundle.

## Drop contract

```
UI_MOdified/data/imports/wargame_outputs/
├── README.md                  (tracked)
├── .gitkeep                   (tracked)
├── latest.json                (optional) → { "latest": "<run_id>" }
└── <run_id>/
    ├── all_phases.geojson     REQUIRED (porter's primary input; geojson/all_phases.geojson also tolerated)
    ├── manifest.json          optional
    ├── geojson/stepNN.geojson optional (counted for display)
    ├── wargame_report.md      optional (display-only)
    ├── wargameschedule.csv    optional (display-only)
    ├── checkpoints/           optional (display-only)
    └── source_docs/*.docx     optional (display-only — NEVER parsed by RMOOZ)
```

A flat `all_phases.geojson` sitting directly in `wargame_outputs/` (no `<run_id>/` wrapper) is **ignored** —
it is reported under `ignored[]` in status, never treated as a run (the discovery §5.1 stale-flat failure mode).

## Files

| File | Role |
|---|---|
| `UI_MOdified/server/wargame-local-bridge.js` | **new** — routes + run discovery + stale guard + porter call |
| `UI_MOdified/server/web-server.js` | +2 lines — `require` + `handle()` wire (next to the FAST-DOC sim bridge) |
| `UI_MOdified/client/shell/wargame-local-import.js` | **new** — "Import Local Wargame Output" card |
| `UI_MOdified/client/app.html` | +1 `<script>` include (after `wargame-geojson-import.js`) |
| `UI_MOdified/data/imports/wargame_outputs/{README.md,.gitkeep}` | **new** — tracked scaffold |
| `.gitignore` | ignore run folders, keep README/.gitkeep |
| `test-local-import-2-wargame-output-folder.js` | **new** — 13-assertion verifier |

## Routes

| Route | Behavior |
|---|---|
| `GET /api/wargame-local/status[?run=<id>&summary=1]` | List runs (run_id, all_phases present/size/mtime/sha256, manifest/report/schedule flags, step count), `latest_run_id` + `latest_source` (`pointer`/`mtime`), `ignored[]`, `freshness`. With `?run&summary=1`, also a server-side `summary` (phases/red/blue/objective). **Read-only.** |
| `GET /api/wargame-local/file?run=<id>` | Serve that run's `all_phases.geojson` (`application/geo+json`, `no-store`) so the client can run its read-only pre-flight summary. **Read-only.** |
| `POST /api/wargame-local/import?run=<id>&name=<n>&confirm=1` | Resolve run (explicit `run`, else `latest.json`, else newest-by-mtime) → porter → `data/scenarios/<name>.json` → set active. Stale → 409 unless `confirm=1`. |

## Provenance stamped on import

```jsonc
{
  "source": "WarGamingGEN-local",
  "source_run": "<run_id>",
  "imported_from_geojson": true,
  "source_file": "all_phases.geojson",
  "local_import_path": "<run_id>/all_phases.geojson"   // relative to the imports root; never absolute
}
```

## Guardrails

1. **`<run_id>/` required** — a flat dump is ignored, never imported.
2. **Path-traversal safe** — `run` is validated against `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and resolved
   strictly inside the imports dir (rejects `..`, slashes, absolute escapes).
3. **`all_phases.geojson` required** — 404 if missing; never silently picks a stray file.
4. **Stale guard (FAST-DOC-2 parity)** — importing a run older (by `all_phases` mtime, >1 s) than the newest
   local run → **409** with a warning; override only with explicit `?confirm=1` (`imported_stale: true`).
5. **Never auto-imports** — `status`/`file` are read-only; the active scenario changes only on an explicit
   `POST …/import`.
6. **Single source of import logic** — reuses `scripts/port-wargame.js`; no second parser, no rebuild.
7. **No DOCX parsing, no WarGamingGEN run, no LLM, no SmartSearch, no external-path reads** — verified by a
   static scan of the bridge's executable code (assertions 10–11).

## Client UX

"Import Local Wargame Output" card mounts beside the existing GeoJSON-import card. It lists run folders,
shows per-run metadata (all_phases size/mtime/sha, step/manifest/report/schedule flags), and on selection
fetches the run's `all_phases.geojson` and summarizes it **reusing
`AppWargameGeoJsonImport.summarizeGeoJson`** (with a tiny inline fallback). A stale selection shows a warning
and the Import click auto-sends `confirm=1`. Import button enables only when a valid run with `all_phases` is
selected. On success it loads the generated scenario via the sanctioned
`AppShellScenarioWorkspace.loadLiveScenarioFromJson` path and dispatches `rmooz:wg-import-loaded`.

## Verification

**Unit** — `node test-local-import-2-wargame-output-folder.js` → **13/13 pass**, covering: missing folder
handled safely; valid run detected (+sha256); flat dump ignored; `latest.json` respected; newest-by-mtime
fallback; stale → 409; `confirm=1` imports stale with provenance flag; status performs no import; porter is
used (porter-shaped output + correct counts); no DOCX parsing; no WarGamingGEN/SmartSearch/external coupling;
status+file read-only before import; run folders git-ignored while README/.gitkeep stay tracked.

**Live smoke** (server restarted to load the route):
- `GET /api/wargame-local/status?run=live_smoke_run&summary=1` → `dir: data/imports/wargame_outputs`,
  run detected, summary `{phases:5, red:2, blue:2, objective:true}`, freshness clean.
- `POST /api/wargame-local/import?run=live_smoke_run` → `200`, `source:"WarGamingGEN-local"`,
  `local_import_path:"live_smoke_run/all_phases.geojson"`, `steps:5, red:2, blue:2, objective:true`.
- Generated scenario fetched via `GET /api/ai/scenario/<name>` (sanctioned load path) with provenance intact.
- Browser: `#wg-local-import-card` mounted, `window.AppWargameLocalImport` present, dropdown populated, **no
  console errors**.
- All live artifacts (test run folder, generated scenario) removed and `_active.json` restored afterward.

## What did NOT change

`scripts/port-wargame.js`, `server/ai/scenario-loader.js`, `POST /api/scenario/import`, `POST /api/scenarios`,
the AI/sim boundary commit path, SmartSearch, and WarGamingGEN. No scenarios were mutated (the live test
scenario was created and deleted; `_active.json` restored).

## Try it

1. Copy a run into `UI_MOdified/data/imports/wargame_outputs/<run_id>/` (with `all_phases.geojson`).
2. Open `http://localhost:8000/app.html` → Scenario Workspace import area → **Import Local Wargame Output**.
3. Pick the run, review the summary, click **Import**.
