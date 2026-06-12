# LOCAL-IMPORT-DISCOVERY-1 — Current Wargame Output Folders Inside RMOOZ

**Date:** 2026-06-05 · **Branch:** main · **Mode:** discovery only (no implementation, no file moves/deletes)
**Scope:** Inventory the folders/files that already exist for WarGamingGEN / Wargame GeoJSON outputs, and
recommend a *local* in-app import folder contract so the operator can copy a folder into RMOOZ and import it
without depending on external TestingAI paths, `runs/latest`, or stale export folders.

> This document does **not** change code. It is the ground truth that a future LOCAL-IMPORT-2 (implementation)
> will build against. Cross-checked against `APP_INVENTORY.md` and the FAST-INT-2 / FAST-DOC-1 / FAST-DOC-2 work.

---

## 1. What folders currently exist

### 1a. Project root (`C:\Users\EngCoder\Desktop\Map\`)
Planning markdown (`OBJ-*`, `DOCTRINE-*`, `READINESS-*`, `WS-*`, session summaries), `CLAUDE.md`,
`APP_INVENTORY.md`, ~150 `test-*.js` / `verify-*.js` files, `scripts/`, `docs/`, `node_modules/`,
and the app under `UI_MOdified/`. No root-level wargame/geojson/import folder.

### 1b. `UI_MOdified/data/` — RMOOZ's own data root (`RMOOZ_DATA_DIR`)
```
data/db/  data/dem-tiles/  data/feedback/  data/journal/  data/logs/
data/mc-runs/  data/scenarios/  data/users/
```
**There is NO `data/imports/`, NO `data/samples/`, NO `data/external/`.** None of the candidate import
folders exist yet.

### 1c. `UI_MOdified/data/scenarios/` — where RMOOZ reads/writes scenarios
```
wargame3.json                                  ← canonical / DEFAULT_NAME, tracked
dp-test-001.json  dp-test-002.json  dp-test-003.json   ← test fixtures, tracked
coastal-shield-training-v1.json                ← tracked
step00.json                                    ← ⚠ NEW, untracked (generated)
gulf_of_sidra_2026_amphibious_assault.json     ← ⚠ NEW, untracked (generated, currently ACTIVE)
_active.json   → { "name": "gulf_of_sidra_2026_amphibious_assault" }
```
`scenario-loader.js`: `SCENARIOS_DIR = data/scenarios`, `DEFAULT_NAME = wargame3`, active pointer is
`_active.json` (written on every import, read on every list).

### 1d. `UI_MOdified/TestingAI/` — the external pipeline, now copied **inside** the repo (git-ignored)
`git ls-files UI_MOdified/TestingAI` = **0 tracked files** (the whole tree is ignored). Contents:
```
SmartSearch/   "Step 0"/   WarGamingGEN/   _archive/
export_to_rmooz/   import_from_rmooz/   .venv/
+ FUTUREWORKS.md  HANDOVER.md  SESSION_WARGAMINGGEN_REVIEW_HANDOFF.md
```

### 1e. `UI_MOdified/TestingAI/export_to_rmooz/` — the current export drop (the wargame outputs)
```
latest.json                          → { latest: "2026-06-05_20-14-15_marker_test", all_phases: "…/geojson/all_phases.geojson" }
manifest.json                        ← schema "testingai-export" v1 (2026-06-05 09:49)
wargame_report.md                    ← May 21 (large, 140 KB)
wargameschedule.csv                  ← May 21 (89 KB)
geojson/                             ← ⚠ FLAT, May 21 (NO run_id) — step00..step16 + all_phases.geojson (2.8 MB)
2026-06-05_20-14-15_marker_test/     ← dated run folder (the contract FAST-DOC-2 introduced)
    manifest.json   (schema "testingai-export" v2, run_id stamped)
    wargame_report.md   wargameschedule.csv
    geojson/  → all_phases.geojson + step00.geojson
```

### 1f. `UI_MOdified/TestingAI/import_from_rmooz/` — DOCX upload slots (FAST-DOC-1)
```
red_team.docx   blue_team.docx
```

### 1g. `UI_MOdified/TestingAI/WarGamingGEN/`
`inputs/  runs/  src/  tests/  viewer/  .env  README.md` — the real generator. `runs/<ts>/outputs/geojson/…`
is the producer side; the bridge publishes a chosen run into `export_to_rmooz/<run_id>/`.

---

## 2. What files are already present (wargame outputs)

| File | Location | Status |
|---|---|---|
| `all_phases.geojson` (2.8 MB) | `export_to_rmooz/geojson/` | ⚠ FLAT, May 21 — **stale / no run_id** |
| `step00..step16.geojson` | `export_to_rmooz/geojson/` | ⚠ May 21, same stale flat bundle |
| `all_phases.geojson` + `step00.geojson` | `export_to_rmooz/2026-06-05_20-14-15_marker_test/geojson/` | dated run (marker test) |
| `manifest.json` | `export_to_rmooz/` (v1) and `…/marker_test/` (v2) | written by the bridge |
| `latest.json` | `export_to_rmooz/` | pointer → marker_test run |
| `wargame_report.md`, `wargameschedule.csv` | both flat + dated levels | optional display docs |
| `red_team.docx`, `blue_team.docx` | `import_from_rmooz/` | DOCX input slots |
| `step00.json`, `gulf_…assault.json` | `data/scenarios/` | **generated scenarios** (porter output, not source) |

---

## 3. How the existing import pipeline already works (do not duplicate this)

**The porter is the single source of import logic** — `UI_MOdified/scripts/port-wargame.js`:
- `buildScenarioFromGeoJson(fc | {steps:[…]} | steps[])` → scenario object (handles the combined
  `all_phases.geojson` bundle via `splitAllPhasesIntoSteps`, plus W3/W4 shapes and folder-of-`stepNN` scans).
- `writeScenario(scenario)` → `data/scenarios/<name>.json`.
- CLI: `node scripts/port-wargame.js [folder|path]` (folder scan is **CLI-only**; HTTP takes a body).

**Server routes (`web-server.js` + `wargame-sim-bridge.js`):**
| Route | Purpose |
|---|---|
| `POST /api/scenario/import` | FAST-INT-2 — body = FC or `{steps}` → porter → `data/scenarios/<name>.json` + set active. |
| `POST /api/scenarios` | Slice 2C — full authored scenario JSON (409 anti-clobber). |
| `GET /api/ai/scenarios` / `GET /api/ai/scenario/<name>` | list / load. |
| `POST /api/scenario/active` | set `_active.json`. |
| `GET /api/wargame-sim/status` | docs present? export present? sim state? **freshness** (stale guard). |
| `POST /api/wargame-sim/stage-doc?slot=red\|blue` | place a DOCX into `import_from_rmooz` + `WarGamingGEN/inputs/forces`. |
| `POST /api/wargame-sim/run` | run WarGamingGEN (only if `RMOOZ_ALLOW_SIM_RUN=1`). |
| `POST /api/wargame-sim/publish` | copy newest `runs/<ts>` → `export_to_rmooz/<run_id>/` + update `latest.json`. |
| `POST /api/wargame-sim/import[?confirm=1]` | resolve `latest.json` → porter → scenario; **refuses stale (409) unless confirmed**. |

**Client cards:**
- `client/shell/wargame-geojson-import.js` (`AppWargameGeoJsonImport`) — file-picker for a **single**
  `all_phases.geojson`; read-only pre-flight summary (phases/red/blue/objective) then POST to `/api/scenario/import`.
- `client/shell/wargame-sim-import.js` — the FAST-DOC DOCX→run→publish→import card.

**Env vars (all optional):** `RMOOZ_TESTINGAI_DIR`, `RMOOZ_WARGAMEGEN_DIR`, `RMOOZ_ALLOW_SIM_RUN`,
`RMOOZ_SIM_MODEL`, `RMOOZ_PYTHON`, `RMOOZ_DATA_DIR`. **No local-import path var exists yet.**

---

## 4. Answers to the discovery questions

**Is there already a folder for local imports?** ❌ No. No `data/imports`, `data/samples`, or `data/external`.
No code reads `data/imports` (grep hits are unrelated SmartSearch/cache code).

**Is there already a folder for WarGamingGEN exports?** ✅ Yes — `UI_MOdified/TestingAI/export_to_rmooz/`,
with a per-run dated-folder contract (`<run_id>/geojson/all_phases.geojson` + `manifest.json` + `latest.json`).
But it lives under the **git-ignored, external-shaped** TestingAI tree, not RMOOZ's own `data/`.

**Where does RMOOZ write imported scenarios?** `UI_MOdified/data/scenarios/<name>.json` (via
`porter.writeScenario`), and records `_active.json`.

**Where does the importer expect `all_phases.geojson`?** The bridge resolves it through
`export_to_rmooz/latest.json` → `<run_id>/geojson/all_phases.geojson`. The FAST-INT-2 client card instead
takes any single file the operator picks and POSTs its text to `/api/scenario/import` (path-agnostic).

**Does the app support `manifest.json`?** The bridge **writes** `manifest.json` (schema `testingai-export`,
v2 carries `run_id`/`input_docs`/`files`), but the importer **does not read it** — it resolves via
`latest.json` and the porter reads the geojson directly. So manifest is currently *informational only*.

**Does any code read `UI_MOdified/data/imports`?** ❌ No.

**Are there stale generated files that should not be source-truth?** ✅ Yes — see §5.

**Critical drift to flag (⚠):** `wargame-sim-bridge.js → resolveTestingAiDir()` resolves TestingAI to
`RMOOZ_TESTINGAI_DIR` → else `<USERPROFILE>/Desktop/TestingAI` (= `C:/Users/EngCoder/Desktop/TestingAI`) →
else legacy `C:/Users/ADMIN/...`. It **does not** point at the in-repo `UI_MOdified/TestingAI/`. So today the
bridge reads the *external* TestingAI unless `RMOOZ_TESTINGAI_DIR` is set to the in-repo copy. A local
importer should be **independent of TestingAI resolution** (read from RMOOZ's own `data/`).

---

## 5. Folders to IGNORE as source truth (stale / generated)

1. **`export_to_rmooz/geojson/` (flat, May 21)** — pre-dated-folder bundle, no `run_id`, oldest outputs.
   The FAST-DOC-2 freshness guard exists precisely to stop importing behind the newest run. Do not copy this.
2. **`data/scenarios/step00.json`** — a *generated* scenario misnamed after a step file (W3 "Brega" label).
   Output of a prior import, not an import source. Untracked.
3. **`data/scenarios/gulf_of_sidra_2026_amphibious_assault.json`** — generated W3 scenario, currently active.
   Also a porter *output*, not a source.
4. **`WarGamingGEN/runs/latest`** — on Windows this is a STALE real directory (symlink can't be created);
   the bridge reads `latest.txt` instead and never touches it.
5. **`TestingAI/_archive/`** — old handoff packs / schema copies. Reference only.

---

## 6. Safest folder for copied Wargame outputs — RECOMMENDATION

**Recommended contract: candidate B —**
```
UI_MOdified/data/imports/wargame_outputs/<run_id>/
    manifest.json            (optional)
    all_phases.geojson       (REQUIRED — the porter's primary input)
    geojson/
        step00.geojson … stepNN.geojson   (optional; porter can also split all_phases)
    wargame_report.md        (optional, display-only)
    wargameschedule.csv      (optional, display-only)
    checkpoints/             (optional, display-only)
    source_docs/             (optional: red_team.docx / blue_team.docx — NOT parsed by RMOOZ)
```
Plus a top-level `UI_MOdified/data/imports/wargame_outputs/latest.json` pointer (reuse the bridge's
`{ latest, all_phases, updated }` shape) so "import latest local output" works the same way as the
external path.

**Why B (over the other candidates):**
- ✅ Lives under RMOOZ's own `data/` root (`RMOOZ_DATA_DIR`), beside `scenarios/`/`journal/`/`mc-runs/` —
  RMOOZ already owns and resolves this tree. **No dependency on TestingAI path resolution** (fixes the §4 drift).
- ✅ `<run_id>` subfolder mirrors the existing `export_to_rmooz/<run_id>/` dated-folder + `manifest.json` +
  `latest.json` contract, so the FAST-DOC-2 freshness/stale logic and the porter both transfer unchanged.
- ✅ A copied folder is self-contained and traceable; no flat/ambiguous bundles.
- ❌ **A** (`…/wargame_outputs/` flat, no run_id) repeats the stale-flat-`geojson/` mistake — reject.
- ❌ **C/D** (`data/external/…`, `external/…`) invent a new top-level root with no precedent; `external`
  also signals "not ours," the opposite of the goal.
- ❌ **E** (copy `TestingAI/export_to_rmooz/` wholesale) drags in the stale May-21 flat bundle and couples
  RMOOZ back to the external tree we're trying to decouple from — reject.

**Git note:** `data/imports/` should be **git-ignored** for the bulk geojson (these are large generated
outputs, like the current TestingAI tree), but keep a tracked `data/imports/README.md` / `.gitkeep` so the
folder exists on a fresh clone. (Decision deferred to implementation.)

---

## 7. Simplest path for the user

1. **Copy** a WarGamingGEN run folder into `UI_MOdified/data/imports/wargame_outputs/<run_id>/`
   (or drop files and let the importer stamp a `run_id`).
2. Click **"Import Local Wargame Output"** in the scenario-workspace import area.
3. See a **read-only summary** (run_id, phases, Red/Blue counts, objective present?, freshness vs any newer
   local run) — reusing `AppWargameGeoJsonImport.summarizeGeoJson` + `computeFreshness`.
4. Click **Import** → porter writes `data/scenarios/<name>.json`, stamps provenance, sets active, loads it.

This mirrors the existing FAST-INT-2 / FAST-DOC-2 UX; only the *source resolution* (a local folder under
`data/imports`) is new.

---

## 8. What code changes LATER (implementation phase — NOT now)

- **New, additive local-import resolution** — either:
  (a) a small bridge route, e.g. `GET /api/wargame-local/status` + `POST /api/wargame-local/import`, that
      resolves `data/imports/wargame_outputs/latest.json` → `<run_id>/all_phases.geojson`; **or**
  (b) extend `wargame-sim-bridge.js cfg()` with a `localImportsDir` (default
      `path.join(ROOT, 'data', 'imports', 'wargame_outputs')`, override `RMOOZ_LOCAL_WARGAME_DIR`) and a
      `source=local` branch in `/api/wargame-sim/import`.
- **New client card** (or a "Local" tab on the existing import card) that lists local `run_id`s and shows the
  pre-flight summary before import.
- **Reuse, don't rebuild:** `port-wargame.js` (porter), `computeFreshness`/`latestExport`/`publishRunToExport`
  patterns, `AppWargameGeoJsonImport.summarizeGeoJson`, provenance stamping (`source`, `source_run`,
  `imported_from_geojson`).
- Update `APP_INVENTORY.md` (FAST-INT / FAST-DOC rows) once built.

## 9. What code must NOT change

- `scripts/port-wargame.js` — the single porter (one source of import logic).
- `server/ai/scenario-loader.js` — read/cache/active semantics.
- `POST /api/scenario/import`, `POST /api/scenarios` — existing import contracts.
- The **AI/sim boundary** commit path (`/api/sim/commit` → journal) — unrelated to import.
- DOCX parsing stays out of RMOOZ; SmartSearch untouched; no LLM/sim invoked by a local import.

## 10. Guardrails to prevent stale imports

1. **Require a `run_id` folder** — refuse a flat dump with no `run_id` (the §5.1 stale-bundle failure mode).
2. **Reuse the freshness/stale guard** — if a newer local `run_id` exists than the one being imported,
   return 409 with a warning; allow override only with `?confirm=1` (mirrors FAST-DOC-2 `export_behind`).
3. **Require `all_phases.geojson` present** — 404 if missing; never silently pick the flat May-21 bundle.
4. **Validate via the porter** — don't accept geojson the porter can't shape into a valid scenario.
5. **Never auto-import** — explicit operator click only; read-only summary first.
6. **Stamp provenance** — `source='WarGamingGEN'` (or `'WarGamingGEN-local'`), `source_run=<run_id>`,
   `imported_from_geojson=true`, so a local import is never mistaken for an authored scenario.
7. **Ignore `runs/latest` and the flat `export_to_rmooz/geojson/`** — local import reads only
   `data/imports/wargame_outputs/<run_id>/`.

---

## Acceptance

✅ We now know exactly which folders/files exist today (no `data/imports`/`samples`/`external`; the only
existing wargame-output store is the git-ignored `TestingAI/export_to_rmooz/` with a working dated-folder +
`latest.json` + `manifest.json` contract), which files are stale (§5), and we have a recommended local import
folder contract — **`UI_MOdified/data/imports/wargame_outputs/<run_id>/`** (candidate B) — plus the guardrails
and the (later) code touch-points. No code, files, or scenarios were changed.
