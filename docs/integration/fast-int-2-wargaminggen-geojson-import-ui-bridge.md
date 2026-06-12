# FAST-INT-2 — WarGamingGEN GeoJSON Import UI Bridge

**Date:** 2026-06-05
**Status:** ✅ IMPLEMENTED + verified (Node test 21/21, browser-checked)
**Builds on:** [testingai-to-rmooz-pipeline-audit.md](testingai-to-rmooz-pipeline-audit.md) (discovery)

## Goal
Expose and verify the **already-working** WarGamingGEN→RMOOZ import path (`scripts/port-wargame.js` + `POST /api/scenario/import`) through a clear UI/dev surface, with a before/after summary and **no hardcoded scenario data**. The importer was **not** rebuilt and **no** second parser was added.

---

## What was added (3 small, additive changes + 1 test)

### 1. Server provenance stamp — `UI_MOdified/server/web-server.js`
In the existing `POST /api/scenario/import` handler, after the porter builds the scenario and before write — **additive metadata only**, does not touch the porter's unit/coord/phase logic:
```js
scenario.source = 'WarGamingGEN';
scenario.source_file = (url.searchParams.get('source_file') || '').trim() || 'all_phases.geojson';
scenario.generated_from_external_pipeline = true;
```
The response now also reports `source`, `source_file`, `generated_from_external_pipeline`, and `objective` (presence), alongside the existing `steps / red_units / blue_units`.

### 2. Client bridge module — `UI_MOdified/client/shell/wargame-geojson-import.js`
`window.AppWargameGeoJsonImport`. Self-mounts a **clearly-labeled** card ("Import WarGamingGEN GeoJSON — read-only generated scenario") next to the existing Live Scenario Import card. Flow:
1. Operator picks a `.geojson` file.
2. **Read-only pre-flight summary** (`summarizeGeoJson`) — counts distinct unit uids per side, distinct phases, objective presence, source filename. **No conversion, no mutation.** The Import button stays disabled until a valid file is read.
3. On **explicit** "Import + load generated scenario" click → `POST /api/scenario/import?name=…&source_file=…` (server runs the porter) → shows the **after** summary from the response → `GET /api/ai/scenario/<name>` → `AppShellScenarioWorkspace.loadLiveScenarioFromJson(json)` (the sanctioned load path).

The module performs **no** GeoJSON→scenario conversion itself — the porter remains the single source of import logic.

### 3. Script wiring — `UI_MOdified/client/app.html`
`<script src="shell/wargame-geojson-import.js?v=1">` after `scenario-workspace.js` (so the mount anchor exists).

### 4. Test — `test-fast-int-2-wargame-geojson-import.js`
Self-contained, synthetic fixture (5 phases, 2 Red + 2 Blue units repeated per phase, 1 objective — **not** Wargame 1/2 data). **21/21 PASS.**
- **Part A (porter, no I/O):** phase/Red/Blue counts match source (deduped by uid); objective imported; SIDC present on every unit (porter-generated); every unit coord traces to a source feature (no invented coords); every output id exists in the source (no invented units); no hardcoded W1/W2 strings.
- **Part B (HTTP route):** spawns `web-server.js` on a temp data dir + random port; `POST /api/scenario/import` returns 200 with matching counts + `objective:true`; provenance (`source=WarGamingGEN`, `source_file`, `generated_from_external_pipeline=true`) in both response and on-disk file; the written scenario **passes the loader validator** (proves display works after import). Cleans up the one written file in teardown.

---

## Before / after summary shown to the operator
- **Before (read-only, from the picked file):** `phases · Red · Blue · objective · src`
- **After (from the server response):** `phases · Red · Blue · objective · src · provenance=WarGamingGEN`

Verified live against the real `all_phases.geojson`: **70 Red, 80 Blue, 17 phases, objective present, SIDC preserved** (audit §6).

---

## Guardrails honored
- ❌ did not rebuild the importer · ❌ no new parser · ❌ no DOCX parsing in RMOOZ · ❌ no LLM · ❌ no simulation
- ❌ no SmartSearch / WarGamingGEN changes · ❌ no invented units/coordinates · ❌ no hardcoded W1/W2 data
- ✅ goes through the existing `port-wargame.js` · ✅ does **not** mutate the live scenario until the operator explicitly clicks Import (button disabled until then; summary is read-only) · ✅ uses the existing Node backend (no new dependency)

## Notes / observations
- `porter.writeScenario()` writes to the **fixed** repo path `UI_MOdified/data/scenarios/<name>.json` (it does **not** honor `RMOOZ_DATA_DIR`); only `_active.json` uses the data dir. So an import lands a durable scenario file in the repo's scenarios dir — expected for the demo, but worth knowing.
- The verify-stub server (port 8002) serves static files only; the actual `POST /api/scenario/import` is exercised against the **real** `web-server.js` by the Node test. The browser check confirmed card mount + the read-only summarizer.

## How to use (demo)
1. TestingAI regenerates outputs (`python -m src.tools.regenerate_outputs`, $0).
2. In RMOOZ → Scenario Workspace → **Import WarGamingGEN GeoJSON** → pick `runs/latest/outputs/geojson/all_phases.geojson`.
3. Review the read-only pre-flight summary → click **Import + load generated scenario**.
4. The generated scenario loads in the workspace; re-running steps 1–3 after editing the DOCX shows the new result. No hardcoding anywhere.

## Acceptance
✅ RMOOZ uses the existing WarGamingGEN GeoJSON importer through a clear, labeled UI/dev flow, with before/after import summary and **no hardcoded scenario data**. Verified: Node test **21/21 PASS**; browser confirms the card mounts and the read-only summary works.
