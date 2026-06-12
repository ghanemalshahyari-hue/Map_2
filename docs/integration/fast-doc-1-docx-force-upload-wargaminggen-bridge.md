# FAST-DOC-1 — DOCX Force Upload → WarGamingGEN → GeoJSON Import Bridge

**Date:** 2026-06-05
**Status:** ✅ IMPLEMENTED + verified (Node test **29/29 PASS**, browser-checked)
**Builds on:** [fast-int-2-wargaminggen-geojson-import-ui-bridge.md](fast-int-2-wargaminggen-geojson-import-ui-bridge.md)

## Goal
Let RMOOZ accept `red_team.docx` + `blue_team.docx`, stage them for the existing WarGamingGEN pipeline, run/stage generation, then import the generated `all_phases.geojson` back through the **existing** porter (`scripts/port-wargame.js`) and display it — with **no hardcoded units, no invented data, and no DOCX parsing or LLM calls inside RMOOZ**.

---

## Key decision — staged handoff (not direct execution)

Discovery of `web-server.js` found **zero** `child_process`/`exec` usage, and a real WarGamingGEN run needs a Python + Qdrant + embedder + LLM stack that is not safely runnable from this Node server. Per the task's own guidance, the bridge is a **staged handoff**:

```
RMOOZ panel ──upload──▶ TestingAI/import_from_rmooz/{red,blue}_team.docx
                        (also copied into WarGamingGEN/inputs/forces/, .bak backup)
                                    │
                operator runs WarGamingGEN MANUALLY (command shown in the UI)
                   full sim (reflects new DOCX)  OR  regenerate ($0, no LLM)
                                    │  then publish:
                        TestingAI/export_to_rmooz/{manifest.json, geojson/all_phases.geojson, report, schedule}
                                    │
RMOOZ "Import" ──reads──▶ export_to_rmooz/geojson/all_phases.geojson
              ──porter──▶ scripts/port-wargame.js (UNCHANGED) → RMOOZ scenario
              ──load────▶ loadLiveScenarioFromJson → map
```

An **optional**, off-by-default, **allowlisted, no-LLM** runner exists (`RMOOZ_ALLOW_SIM_RUN=1`) that runs only `python -m src.tools.regenerate_outputs` then copies outputs into `export_to_rmooz/`. RMOOZ **never** triggers the LLM full run — that is always a manual command shown in the panel.

> **Honest nuance:** `regenerate_outputs` rebuilds GeoJSON from existing checkpoints — it does **not** re-read the DOCX. To reflect **new** DOCX content the operator must run the **full sim** (`python tests/test_full_run.py --all`), shown in the panel. The bridge stages docs + imports outputs regardless of which command was run.

---

## What was added

### Server — `UI_MOdified/server/wargame-sim-bridge.js` (new module)
Wired into `web-server.js` with one dispatch line (`if (wargameSimBridge.handle(...)) return;`) + one `require`. Endpoints (all under `/api/wargame-sim/`):

| Endpoint | Method | Purpose |
|---|---|---|
| `/status` | GET | docs staged? export ready (manifest/all_phases/report/schedule)? runner enabled? + the exact manual commands + resolved paths |
| `/stage-doc?slot=red\|blue` | POST | raw `.docx` body → validate **ZIP/PK magic + slot name** → write to `import_from_rmooz/` and (if present) `WarGamingGEN/inputs/forces/` with a `.bak` backup |
| `/run` | POST | **manual mode by default** — returns the documented commands, runs nothing. If `RMOOZ_ALLOW_SIM_RUN=1`: runs only the allowlisted no-LLM `regenerate_outputs`, then publishes to `export_to_rmooz/` |
| `/publish` | POST | copy `runs/latest/outputs/*` → `export_to_rmooz/` + write `manifest.json` (no sim, no LLM) |
| `/import` | POST | read `export_to_rmooz/geojson/all_phases.geojson` → **existing** `port-wargame.js` → stamp provenance → write scenario + set active → return summary |

Paths are env-configurable: `RMOOZ_TESTINGAI_DIR` (default `C:/Users/ADMIN/Desktop/TestingAI`), `RMOOZ_WARGAMEGEN_DIR`, `RMOOZ_ALLOW_SIM_RUN`.

### Client — `UI_MOdified/client/shell/wargame-sim-import.js` (new module)
Self-mounting panel **"WarGamingGEN DOCX Simulation Import"** (next to the FAST-INT-2 card). Two file inputs (auto-stage on select), **Run / Stage Simulation** (shows the manual command when the runner is off), **Check outputs**, and **Import + load on map** (disabled until an export exists). Wired in `app.html`.

### Status machine (UI)
`waiting_for_docs → docs_uploaded → simulation_running → outputs_found → import_complete | import_failed`

### Import summary shown
Red count · Blue count · phase count · objective present · GeoJSON source file · report present · schedule present · provenance.

---

## Provenance (stamped on the imported scenario)
```json
{ "source": "WarGamingGEN",
  "input_docs": ["red_team.docx", "blue_team.docx"],
  "generated_from_docs": true,
  "imported_from_geojson": true,
  "source_file": "all_phases.geojson" }
```

## Safety / guardrails honored
- **No arbitrary command execution** — the only runnable command is the allowlisted, no-LLM `regenerate_outputs`, and only when `RMOOZ_ALLOW_SIM_RUN=1`; otherwise commands are *shown*, not run.
- `.docx` only (extension + **ZIP/PK signature** check); fixed slot names `red|blue`; 20 MB cap.
- ❌ no DOCX parsing in RMOOZ · ❌ no LLM from RMOOZ · ❌ no SmartSearch/doctrine changes · ❌ no invented units/coords · ❌ no hardcoded W1/W2 forces · ❌ no Step0 / planning-context (out of scope this PR).
- ✅ import goes through `port-wargame.js` (no rebuild, no second parser).
- ✅ does **not** create/replace the live scenario until the operator explicitly clicks **Import**.
- Force-doc placement into `inputs/forces/` backs up the prior file (`.bak`) — reversible.

---

## Manual test checklist
> Requires the **real** server (`cd UI_MOdified && node server/web-server.js`) — the verify-stub on :8002 does not implement these routes. Set `RMOOZ_TESTINGAI_DIR` to your TestingAI path if not the default.

1. Open RMOOZ → Scenario Workspace → **WarGamingGEN DOCX Simulation Import**. Status shows `waiting_for_docs`.
2. Upload `TestingAI/WarGamingGEN/inputs/forces/red_team.docx` and `blue_team.docx`. Status → `docs_uploaded`; files appear in `TestingAI/import_from_rmooz/`.
3. Click **Run / Stage Simulation**. With the runner off, the panel shows the exact commands. Run the full sim (or `regenerate_outputs`) manually in `WarGamingGEN/`, then publish to `export_to_rmooz/` (the panel's `publish` command, or `POST /api/wargame-sim/publish`). Confirm `export_to_rmooz/geojson/all_phases.geojson` exists.
4. Click **Check outputs** → status `outputs_found`; Import button enables.
5. Click **Import + load on map**. Summary shows Red/Blue/phase counts, objective, report/schedule present, provenance=WarGamingGEN. The scenario loads on the map.
6. Confirm unit counts equal the generated GeoJSON (e.g. 70 Red / 80 Blue on the real run) — **not** a fixed number.
7. Confirm phase count matches the generated output (17 on the real run).
8. Edit one DOCX in a small visible way (e.g. add a unit to `red_team.docx`).
9. Re-run the **full sim** (`python tests/test_full_run.py --all`) so the change is parsed, then publish to `export_to_rmooz/`.
10. In RMOOZ click **Check outputs** → **Import + load on map** again.
11. Confirm the displayed output changes (new unit count / positions) — proving no hardcoding.

### Automated test
`node test-fast-doc-1-docx-sim-bridge.js` → **29/29 PASS**: status, stage-doc (valid + non-docx + bad-slot rejections), manual-mode run, import-before-export 404, porter import of a synthetic export with matching counts + objective + report/schedule flags + full provenance + loader-validator pass + no W1/W2 data. Self-contained (synthetic `.docx` + synthetic 5-phase GeoJSON; temp dirs; cleans up).

## Notes
- `porter.writeScenario()` writes to the fixed repo path `UI_MOdified/data/scenarios/<name>.json` (ignores `RMOOZ_DATA_DIR`); the bridge sets it active via the scenario cache.
- The verify-stub server (:8002) serves static files only; the panel degrades gracefully there ("bridge status unavailable"). All routes are verified by the Node test against the real server.

## Acceptance
✅ RMOOZ has a clear path to use uploaded `red_team.docx` + `blue_team.docx` to **stage** (and optionally trigger, no-LLM) WarGamingGEN generation, then **import the generated GeoJSON via the existing porter**, with import summary + provenance and **no hardcoded units or invented data**. Verified: Node **29/29 PASS**; browser confirms the panel mounts with the full status flow.

---

## Addendum (FAST-DOC-2) — real run + dated export folders

**What changed:** the bridge now actually *runs* WarGamingGEN on the uploaded DOCX and versions each export, instead of only importing a pre-existing file.

- **`POST /api/wargame-sim/run`** (when `RMOOZ_ALLOW_SIM_RUN=1`): launches the **full** sim — `python tests/test_full_run.py --all` — in `WarGamingGEN/`, on the staged DOCX, forcing a working config via child env (`LLM_LOCAL_FORCE_FALLBACK=0`, `LLM_MODEL=$RMOOZ_SIM_MODEL`). Runs in the background; `GET /status` reports `sim.running`. On exit-0 it auto-publishes.
- **Dated export folders:** each generation is published to **`export_to_rmooz/<run-id>/`** (run-id = the WarGamingGEN `runs/<timestamp>` name), with its own `manifest.json`, mirroring the `runs/` versioning so every export is traceable. A top-level **`export_to_rmooz/latest.json`** points at the newest (Windows symlink-free).
- **`POST /api/wargame-sim/import`** reads the **latest dated export** and stamps `source_run: <run-id>` on the imported scenario (provenance now records *which* generation produced it).
- **Windows fix:** `runs/latest` symlink can't be created on Windows, so the bridge selects the newest run by its timestamped name.

**Root cause of "import doesn't generate":** `WarGamingGEN/.env` had **`LLM_LOCAL_FORCE_FALLBACK=1`** — a kill-switch in `src/llm/client.py:99` that makes every local run emit placeholder output *without calling the model*. The bridge now overrides it (`=0`) when it launches the run.

**Local-model reality (measured on this Windows box):**
- `llama3.2:1b` — fast, but emits invalid JSON → schema fallback (garbage).
- `qwen2.5:7b` — produces real attempts but **>10 min/phase** (≈ hours for 17 phases) — impractical.
- `gpt-oss:20b` — won't load (memory).
- **GPT-4o (cloud)** — fast + capable; this is what generated the existing good data (`runs/..._gpt4o_v2`). For usable end-to-end generation, point `.env` at OpenAI GPT-4o (or set `RMOOZ_SIM_MODEL`/`.env` to a capable+fast model). The wiring is model-agnostic.

Tests: `node test-fast-doc-1-docx-sim-bridge.js` → **30/30** (now covers dated export + `source_run` provenance).
