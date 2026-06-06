# UNIFIED-IMPORT-1 — Unified Scenario Import Wizard: Audit & Design

**Date:** 2026-06-05 · **Branch:** main · **Mode:** audit/design only (no implementation)
**Goal:** Collapse the three confusing import buttons into one operator-facing **"Import Scenario"** flow:
upload red/blue DOCX → Start → live progress → (auto publish + auto import) → scenario opens on the map.
The three existing cards move under **Advanced Tools** (kept, not deleted).

**Amended 2026-06-05** with a **partial-scenario** requirement: if a run stops/fails after N of 17 phases,
RMOOZ must still let the operator import those N phases as a clearly-stamped *partial* scenario, continue
generation from the checkpoint, or restart — without losing work. See **Part 5 (Partial generation)**.

**Builds on:** [LOCAL-IMPORT-DISCOVERY-1](local-import-discovery-current-folders.md),
[LOCAL-IMPORT-2](local-import-2-wargame-output-folder-import.md),
[FAST-DOC-2](fast-doc-2-publish-before-import-clarity.md),
[DEBUG-DOCX-1](debug-docx-1-change-propagation-diagnosis.md).

---

## TL;DR verdict

- **The unified flow is ~80% already built.** The `wargame-sim-import.js` card already does
  stage → run → publish → import → load. What it lacks for a clean "one button + progress bar" UX is:
  (1) **real progress** (the bridge doesn't expose phases-completed yet), (2) **Resume wiring**
  (the engine supports `--resume`; the bridge hardcodes `--all` with a fresh run dir), and
  (3) a **single wizard UI** that hides the plumbing.
- **Progress can be REAL, not estimated** — WarGamingGEN writes one checkpoint per phase
  (`runs/<run>/checkpoints/phaseNN.json`) incrementally, and the phase total is known from the scenario
  (17). Counting checkpoints / total = a true per-phase progress signal. (It's a step function; can be
  smoothed with time, but the honest number is checkpoint count.)
- **Resume is TRULY supported by the engine** (`--resume` auto-detects the latest run dir, replays
  checkpoints, skips completed phases, continues). It is **NOT yet wired** into `/api/wargame-sim/run`
  (one ~3-line change).
- **No new parser, no DOCX parsing in RMOOZ, no porter bypass** — the unified flow is pure orchestration
  over existing endpoints + two tiny bridge additions.
- **Partial import is feasible but has ONE structural catch:** WarGamingGEN writes geojson **only at the very
  end of a run**, so a stopped run has **checkpoints but no geojson**. To import N partial phases, RMOOZ must
  first replay the checkpoints into outputs with **`regenerate_outputs.py` ($0, no LLM, only the N phases
  actually generated)** — then publish → import. This needs **one more bridge route** (`/regenerate`).
- **Hard floor: the loader validator requires `steps` ∈ [4..20]** (`scenario-schema-spec.js:27`). A partial
  with **< 4 generated phases cannot load** as-is — so "Import partial" is offered only at **N ≥ 4**
  (below that: Continue or Restart). The "3/17" example is exactly at this boundary.

---

## Part 1 — Audit answers (evidence-backed)

### Q1. Does `/api/wargame-sim/run` actually run WarGamingGEN end-to-end?
**Yes — but only when explicitly enabled.** `server/wargame-sim-bridge.js:282-315` spawns:
```js
child = spawn(c.python, ['tests/test_full_run.py', '--all'], { cwd: c.wgen, env });
```
only if `RMOOZ_ALLOW_SIM_RUN === '1'` (else it returns `{manual:true, commands}`). It forces a working
local config (`LLM_LOCAL_FORCE_FALLBACK=0`, `LLM_MODEL=<RMOOZ_SIM_MODEL|qwen2.5:7b>`). `test_full_run.py --all`
runs every phase via the Orchestrator and writes `outputs/geojson/all_phases.geojson` at the end.
**On exit code 0 the bridge AUTO-publishes** (`publishRunToExport`, `:300-309`).

### Q2. Does the run support `--max-phases` / `--all` / `--resume` / run-name?
**The engine (`tests/test_full_run.py`) supports ALL of them** (argparse, `test_full_run.py:338-358`):
`--all`, `--max-phases N` (default 3), `--resume`, `--start-phase N`, `--run-name <suffix>`, `--run-dir <path>`.
**The bridge currently passes only `--all`** — `--resume` / `--run-name` / `--max-phases` are **not wired**.

### Q3. Does `/run` stream, poll, or block?
**Poll.** `/run` spawns the child and returns immediately (`started: true`). The operator polls
`GET /api/wargame-sim/status`, which reports in-memory `simState` (`bridge:236-252`):
`sim: { running, run_name, started_at, finished_at, exit_code, error }`. No SSE/streaming today.

### Q4. Where can progress be read from?
| Source | Real-time? | Verdict |
|---|---|---|
| **`runs/<run>/checkpoints/phaseNN.json`** | ✅ written immediately after each phase | **Best signal** — count files = phases done |
| `outputs/geojson/stepNN.geojson` | ❌ written once at the very end | not usable mid-run |
| `outputs/geojson/all_phases.geojson` | ❌ written once at the very end | only signals "done" |
| `run_index.json` | ❌ written once at the very end | only signals "done" |
| `llm_audit/*_phase_NN_*.json` | ✅ per phase per LLM attempt | finer but noisier than checkpoints |
| stdout `--- Phase N (label) — kind ---` | ✅ printed per phase | the bridge doesn't capture stdout (only a 1 KB stderr tail) |
| `runs/latest.txt` | written at completion | identifies the run dir, not progress |

**Conclusion:** count `checkpoints/phase*.json` in the in-flight run dir.

### Q5. Can RMOOZ safely estimate progress by phases completed?
**Yes, and it's REAL not estimated.** `phases_done = #checkpoints`, `phases_total = scenario.phases.length`
(=17, readable from `WarGamingGEN/inputs/scenario.json`, or from `run_index.json` once present). Map to the
20–80% band. Between checkpoints (~60 s/phase) it holds steady; optional time-based smoothing only.

### Q6. Does WarGamingGEN checkpoint per phase?
**Yes.** `src/orchestrator.py:255-261` `_persist_checkpoint()` writes `checkpoints/phase{NN}.json`
immediately after each phase (`:141`). JSON, full `PhaseRecord` (metrics, actions, resolution, snapshot).

### Q7. Can resume continue from the last checkpoint?
**Yes (engine).** `test_full_run.py:197-218` + `_restore_checkpoints():44-93`: `--resume` finds the latest
run dir, replays each `phaseNN.json` into the world, computes `next_phase = last+1`, and the Orchestrator
continues from there (skips completed phases). `regenerate_outputs.py` can also rebuild outputs from
checkpoints **with $0 / no LLM** if only the publish/output step failed.
**Not yet wired in the bridge** — `/run` always starts a fresh auto-versioned run.

### Q8. Does `/api/wargame-sim/publish` publish the newest run automatically?
**Yes.** `bridge:317-322` → `publishRunToExport(latestRunDir(c), …)` copies `runs/<newest>/outputs` →
`export_to_rmooz/<run_id>/` + writes `latest.json`. Also called automatically by `/run` on exit 0
(`:303`). A **manual CLI** run does not self-publish (hence the manual Publish button).

### Q9. Does `/api/wargame-sim/import` import the latest published run + return enough to open it?
**Yes.** `bridge:325-374`: resolves `export_to_rmooz/latest.json` → `<run_id>/geojson/all_phases.geojson`
→ `PORTER.buildScenarioFromGeoJson` → `writeScenario` → sets active. Returns
`{ name, file, source, source_run, red_units, blue_units, steps, objective, report_present, schedule_present, imported_stale }`.
**Keeps the FAST-DOC-2 stale guard** (409 unless `?confirm=1`). Enough for RMOOZ to open directly.

### Q10. What exact client function opens the imported scenario?
All three cards use the same sanctioned path:
```js
fetch('/api/ai/scenario/<name>')   // returns { ok, scenario }
  .then(json => window.AppShellScenarioWorkspace.loadLiveScenarioFromJson(json));
document.dispatchEvent(new CustomEvent('rmooz:wg-import-loaded'));  // closes the launch popup → reveals map
```
(`wargame-sim-import.js:179-187`.) `loadLiveScenarioFromJson` accepts the wrapped `{ok, scenario}` object.

### Q11. Can the three cards be hidden under Advanced without deleting them?
**Yes, trivially.** All three mount relative to `#sw-live-scenario-import-card` (chained anchors):
`wg-geojson-import-card`, `wg-sim-import-card`, `wg-local-import-card`. Wrap that region in a
`<details class="sw-advanced-import">` (collapsed by default). No JS changes needed — the cards keep
mounting to the same anchors; they just live inside a collapsed `<details>`. Their `window.App*` APIs
remain intact.

### Q12. What is the safest single user-facing flow?
A thin **wizard** that orchestrates the EXISTING endpoints in order, never bypassing the porter, never
auto-importing before run success, and reusing the FAST-DOC-2 freshness guard. See Part 2.

---

## Part 2 — Design

### A. Normal user flow (happy path)

```
[Import Scenario]  (single primary button)
   │
   ▼  modal/wizard opens
1. Upload red_team.docx + blue_team.docx
   → POST /api/wargame-sim/stage-doc?slot=red   (raw body)     ┐ 0% validate → 10% staged
   → POST /api/wargame-sim/stage-doc?slot=blue  (raw body)     ┘
2. [Start Scenario Generation]
   → POST /api/wargame-sim/run                                  20% run started
3. Poll GET /api/wargame-sim/status every ~4 s
   → progress = 20 + 60 * (sim.phases_done / sim.phases_total)  20–80% phases
   (needs bridge: expose sim.phases_done + sim.phases_total)
4. sim.running == false && sim.exit_code == 0
   → run AUTO-published by /run on success; verify export.all_phases == true   85% publish
5. → POST /api/wargame-sim/import                                95% import
   (FAST-DOC-2 guard active; happy-path export is newest → not stale)
6. → GET /api/ai/scenario/<name> → loadLiveScenarioFromJson     100% scenario opened
   → dispatch rmooz:wg-import-loaded (reveal map)
```

The user never sees GeoJSON, latest.txt, publish, export_to_rmooz, local folders, or TestingAI paths.

### B. Failure / resume flow

```
Poll shows sim.running == false && (exit_code != 0 || error)
   → show "Stopped after phase <phases_done>/<phases_total>"
   → [Continue from last checkpoint]
       → POST /api/wargame-sim/run?resume=1        (needs bridge: append --resume)
       → engine replays checkpoints, continues from next phase
       → resume polling (progress continues from phases_done)
   → on success → auto-publish → import → open (same as A from step 4)

Edge case: all phases done but publish/import failed (rare)
   → [Continue] detects phases_done == phases_total → skip re-run,
     just POST /api/wargame-sim/publish then /import
     (or call regenerate_outputs via a guarded route — optional, not required for v1)
```

**Resume guarantees:** `--resume` resumes the **latest** run dir; the bridge's auto-publish fires on the
resumed run's exit 0. Idempotent: re-running `--resume` after completion is a no-op + republish.

### C. Advanced Tools (collapsed `<details>`, unchanged behavior)

```
▸ Advanced import tools
    • WarGamingGEN DOCX Simulation Import   (wg-sim-import-card)      — the full manual stage/run/publish/import
    • Import WarGamingGEN GeoJSON            (wg-geojson-import-card)  — manual single all_phases.geojson file
    • Import Local Wargame Output            (wg-local-import-card)    — local data/imports/wargame_outputs/<run_id>/
    • Publish Outputs manually               (button → POST /api/wargame-sim/publish)
    • Import published output manually        (button → POST /api/wargame-sim/import)
```
All existing routes and `window.App*` APIs stay live. The wizard is additive.

### D. Progress model (REAL where possible)

| % | Stage | Source of truth |
|---|---|---|
| 0% | validation | client: both files end in `.docx` + PK/ZIP magic (server re-checks in stage-doc) |
| 10% | staging | both `POST /stage-doc` returned 200 (`placed_in_forces`) |
| 20% | run started | `POST /run` → `{started:true}` (or `already_running`) |
| 20–80% | phase progress | `20 + 60*(phases_done/phases_total)` from **checkpoint count** ← **bridge addition** |
| 85% | publish | `sim.exit_code==0` + `export.all_phases==true` (auto-published by /run) |
| 95% | import | `POST /import` → 200 (FAST-DOC-2 guard honored) |
| 100% | scenario opened | `loadLiveScenarioFromJson` done + `rmooz:wg-import-loaded` |

`phases_total` from `WarGamingGEN/inputs/scenario.json` (`phases.length`, =17) or `run_index.json` once present.

### E. Safety invariants (all preserved)

- ✅ **No auto-import before run success** — import only fires after `exit_code==0` + `export.all_phases`.
- ✅ **No scenario mutation before explicit Start** — staging copies DOCX only; `setActiveName` happens
  solely inside `/import` after a successful porter write.
- ✅ **No DOCX parsing in RMOOZ** — DOCX is staged as bytes (ext + PK magic); WarGamingGEN parses it.
- ✅ **No SmartSearch modification.** ✅ **No hardcoded data.** ✅ **No invented units/coords/phases**
  (porter derives everything from the geojson).
- ✅ **No porter bypass** — import always goes through `scripts/port-wargame.js`.
- ✅ **No stale import** — FAST-DOC-2 freshness guard kept (409 + confirm); the wizard surfaces it as a
  "newer run available" prompt instead of raw jargon.
- ✅ **Existing advanced/manual routes still work** — wizard is orchestration only; nothing removed.

---

## Part 3 — What's already there vs. what's missing

### Already works (reuse as-is)
- `POST /api/wargame-sim/stage-doc?slot=red|blue` — DOCX staging into `inputs/forces` (+ `.bak`).
- `POST /api/wargame-sim/run` — real end-to-end run (when `RMOOZ_ALLOW_SIM_RUN=1`), auto-publish on success.
- `POST /api/wargame-sim/publish` — publish newest run → dated export + `latest.json`.
- `POST /api/wargame-sim/import` — porter import of latest published export, stale-guarded, sets active.
- `GET /api/wargame-sim/status` — run state + freshness audit.
- WarGamingGEN engine: per-phase checkpoints, `--resume`, `regenerate_outputs.py`.
- Client load path: `loadLiveScenarioFromJson` + `rmooz:wg-import-loaded`.
- The 3 cards (manual fallbacks) and their `window.App*` APIs.

### Missing (minimal changes for the unified flow)
1. **Bridge `/status`: expose real progress** — add to the `sim` block:
   `phases_done` (count `checkpoints/phase*.json` in the in-flight/newest run dir) and
   `phases_total` (read `inputs/scenario.json` `phases.length`, fallback 17). ~15 lines, read-only.
2. **Bridge `/run`: wire resume** — accept `?resume=1` → spawn `['tests/test_full_run.py','--all','--resume']`.
   Optional: `?run_name=` → append `--run-name`. ~3 lines.
3. **Bridge `/regenerate` (NEW, for partial)** — `POST /api/wargame-sim/regenerate[?run=<id>]` spawns
   `python -m src.tools.regenerate_outputs` (replays checkpoints → partial/complete geojson, **no LLM**).
   Required to publish+import a stopped run. Gate behind `RMOOZ_ALLOW_SIM_RUN` (same execute capability).
4. **Bridge `/status`: partial detection** — add `phases_done`, `phases_total`, `partial_available`,
   `can_resume`, `outputs_present` to the `sim` block (read-only, Part 5.5).
5. **Bridge `/import`: anti-clobber + partial stamps** — refuse to overwrite a file whose `generation_status`
   or `source_run` differs (409 unless `?replace=1`); stamp partial metadata when `?partial=1` (Part 5.4).
6. **New wizard UI** — one "Import Scenario" entry that opens a modal and drives Part 2A/2B **and the partial
   branch (Part 5.2/5.3)**: progress bar + Continue + Import-partial + Restart. Reuses `AppWargameSimImport`.
7. **Collapse the 3 cards** under a `<details>` Advanced section in `app.html` (no JS change).
8. **Deployment prerequisites doc** (call out, not code): `RMOOZ_ALLOW_SIM_RUN=1`,
   `RMOOZ_TESTINGAI_DIR` pointed at the real WarGamingGEN tree (the `resolveTestingAiDir()` default is
   `<USERPROFILE>/Desktop/TestingAI`, **not** the in-repo `UI_MOdified/TestingAI` — set the env on the
   server), and a reachable LLM (`LLM_BASE_URL` + `LLM_MODEL`, or it stalls per phase). Without these the
   wizard must fail gracefully and point the operator to Advanced/manual.

### Can progress be real or estimated?
**REAL** — per-phase checkpoint count is an exact "phases completed" signal (step function, ~60 s
granularity). No fabricated %.

### Is resume truly supported?
**Engine: yes** (replays checkpoints, skips completed phases). **Bridge: not yet** (one small change to
pass `--resume`). After that, Continue-from-checkpoint is fully real.

---

## Part 4 — Exact route sequence for the unified flow

**Normal:**
`stage-doc(red)` → `stage-doc(blue)` → `run` → poll `status` (until `running==false`) →
[`run` auto-published] → `import` → `GET /api/ai/scenario/<name>` → `loadLiveScenarioFromJson`.

**Resume:** on a stopped/failed poll → `run?resume=1` → poll `status` → `import` → load.

**Partial import (run stopped at N≥4):**
`regenerate` → `publish` → `import?partial=1&name=<base>__partial-<N>` (→ 409 unless `?replace=1` if it would
clobber a different generation) → `GET /api/ai/scenario/<name>` → `loadLiveScenarioFromJson` (badge: N/17).

**Advanced/manual:** the three existing cards + `publish`/`import` buttons, unchanged.

---

## Part 5 — Partial / interrupted generation (NEW requirement)

> "If generation reaches phase 3 of 17 and then stops, the app must not lose the result." The operator should
> see **Partial scenario available · Generated phases: N / 17** with **Continue / Import partial / Restart**.

### 5.1 Audit answers

**Q1. Does WarGamingGEN write partial GeoJSON during a run, or only at the end?**
**Only at the end.** `stepNN.geojson` and `all_phases.geojson` are written in one batch pass *after* the
orchestrator finishes all phases (`src/output/geojson_writer.py`). Mid-run there is **no geojson**.

**Q2. If a run stops at phase N, where are the partial outputs?**
Only as **checkpoints**: `runs/<run_id>/checkpoints/phase00.json … phase{N-1}.json` (one JSON `PhaseRecord`
per completed phase, written immediately after each phase — `orchestrator.py:255-261`). Plus `llm_audit/`
traces. **`outputs/geojson/` does not exist yet, and there is no `all_phases.geojson`.**

**Q3. Can RMOOZ publish a partial run?**
**Not directly.** `publishRunToExport` (`bridge:100-138`) hard-fails with *"run has no
outputs/geojson/all_phases.geojson yet"* when geojson is absent — which is exactly the partial case. Partial
outputs must be **materialized first** (Q below).

**The linchpin — `regenerate_outputs.py`.** `src/tools/regenerate_outputs.py` replays the **checkpoints that
exist** into a fresh world and writes `outputs/{wargameschedule.csv, wargame_report.md, geojson/stepNN.geojson,
geojson/all_phases.geojson}` — **with $0 / no LLM calls**, covering **exactly the N phases that were
generated** (no fabrication). This is the only way to turn a stopped run's checkpoints into porter-readable
geojson. → RMOOZ needs a guarded route `POST /api/wargame-sim/regenerate` to invoke it.

**Q4. Can `port-wargame.js` import a partial `all_phases.geojson` / `step00..stepNN`?**
**Yes** — `buildScenarioFromGeoJson` splits by per-feature `phase` tags, so N tagged phases → N steps. **But**
the loader validator requires `steps ∈ [4..20]` (`scenario-schema-spec.js:27`), so **N must be ≥ 4** to load.
For N < 4: don't offer Import partial (offer Continue/Restart), *or* relax the validator for partial scenarios
(see 5.5 option B).

**Q5. What metadata should a partial import stamp?** See 5.4.

**Q6. How should the Scenario DB store it?** As a normal `data/scenarios/<name>.json` (same store, same
loader) — partial-ness is **metadata**, not a separate store. A distinct name keeps it from clobbering the
eventual complete version (5.3).

**Q7. Mark partial with…?** Yes — exactly:
`generation_status:"partial"`, `generated_phase_count:N`, `expected_phase_count:17`, `source_run:<run_id>`,
`can_resume_generation:true|false` (true when checkpoints exist for that run). Plus the existing
`source`, `imported_from_geojson`, `partial_import:true`.

**Q8. If generation continues later, new version / replace / keep both?**
**Default = keep both / new version; replace only with explicit confirmation.** Rationale: the porter's
`writeScenario` overwrites silently by filename, which would *lose* the partial. So the wizard assigns
**distinct names per generation** and never overwrites a scenario with a different `generation_status` or
`source_run` unless the operator confirms (see 5.3).

**Q9. How does the UI warn it's partial?** A persistent **badge "Partial Scenario — N/17 phases"** in the
workspace header + a chip in the scenario list; the import summary says *"incomplete — N of 17 phases
generated."* Never labeled complete.

**Q10. How does the map/workspace behave?** It already drives off `scenario.steps`, so it naturally shows
**only the N generated steps** on the timeline. The final generated step's `objective_status` is whatever was
reached (typically not a terminal CAPTURED/DENIED). **No remaining phases are invented.** The badge makes the
truncation explicit.

### 5.2 Partial import flow

```
Poll status: sim.running==false && 0 < phases_done < phases_total   (run stopped/failed mid-way)
   → wizard shows: "Partial scenario available · Generated phases: N / 17"
       [Continue generation]  [Import partial scenario]  [Restart generation]
   Import partial (enabled only when N ≥ 4):
     1. POST /api/wargame-sim/regenerate            ← NEW route: replay N checkpoints → partial geojson ($0, no LLM)
     2. POST /api/wargame-sim/publish               ← now succeeds (partial all_phases.geojson exists)
     3. POST /api/wargame-sim/import?partial=1&name=<base>__partial-<N>     ← porter; stamps partial metadata
        (anti-clobber: 409 if a DIFFERENT generation for that name exists, unless ?replace=1)
     4. GET /api/ai/scenario/<name> → loadLiveScenarioFromJson + rmooz:wg-import-loaded
   → workspace opens with badge "Partial Scenario — N/17 phases"
```

### 5.3 Continue flow (resume the same run)

```
[Continue generation]
   → POST /api/wargame-sim/run?resume=1     (engine --resume: replays checkpoints, continues from phase N)
   → poll status; progress resumes from N/17
   → on exit 0: auto-publish → import the COMPLETE output (5.4 complete naming)
```

### 5.4 Scenario DB metadata + versioning

**Partial import stamps:**
```jsonc
{
  "source": "WarGamingGEN",
  "imported_from_geojson": true,
  "partial_import": true,
  "generation_status": "partial",
  "generated_phase_count": N,
  "expected_phase_count": 17,
  "source_run": "<run_id>",
  "can_resume_generation": true
}
```
**Complete import (later) stamps:** `generation_status:"complete"`, `generated_phase_count == expected_phase_count`,
`partial_import:false`, same `source_run` if it's the resumed run.

**Naming / versioning (Q8 resolution — default A, support C, guard B):**
- Partial → `"<base>__partial-<N>"` (e.g. `gulf_of_sidra__partial-04`). Multiple partials coexist by N.
- Complete → `"<base>"` (or `"<base>__complete"`).
- **Anti-clobber:** the bridge `/import` must refuse to overwrite an existing file whose `generation_status`
  **or** `source_run` differs from the incoming one — return **409** unless `?replace=1`. (Today `writeScenario`
  overwrites silently; this is a required guard.) **Default keeps both; replace needs explicit confirm.** This
  guarantees *"never silently overwrite a partial with a later complete run."*

### 5.5 Bridge detection additions (read-only, for `/status`)

Extend the `sim` block with: `phases_done` (checkpoint count in the in-flight/newest run dir),
`phases_total` (from `inputs/scenario.json`), `partial_available` (`!running && 0 < phases_done < phases_total`),
`can_resume` (checkpoints exist), and `outputs_present` (geojson materialized yet?). These let the wizard pick
Continue / Import-partial / Restart with no guesswork.

**Validator-floor handling (the N<4 case):**
- **Option A (default, no risk):** gate "Import partial" on `phases_done ≥ 4`; for N<4 show only Continue/Restart
  with *"need at least 4 phases to import a partial — continue generation."*
- **Option B (optional):** teach the validator/loader to accept `generation_status:"partial"` scenarios with
  `steps ≥ 1`. More flexible but touches the validator — defer unless the owner wants 1–3-phase partials.

### 5.6 Safety (partial-specific)

- ✅ **Never silently overwrite a partial with a later complete run** — 409 unless `?replace=1` (5.4).
- ✅ **Default creates a new version** when the name/generation differs; replace requires confirmation.
- ✅ **No invented phases** — `regenerate_outputs` emits only the N generated phases; porter derives the rest.
- ✅ **Only import phases actually generated** — checkpoint count is the single source of N.
- ✅ **Clearly partial in UI** — badge + chip + summary wording; **never** stamped/labeled complete.
- ✅ **No LLM, no DOCX parse** in the partial path (`regenerate_outputs` is parsers+writers only).
- ✅ **No porter bypass** — partial still imports through `port-wargame.js`.

---

## Part 6 — Recommended next implementation phase

**UNIFIED-IMPORT-2 — Import Scenario Wizard (build).** Scope, in order:
1. **Bridge progress + partial detection** (`/status` → `phases_done`, `phases_total`, `partial_available`,
   `can_resume`, `outputs_present`) — read-only, test with a fixture run dir (full + partial).
2. **Bridge resume** (`/run?resume=1` → `--resume`) — test args appended; fresh-vs-resume dir chosen right.
3. **Bridge regenerate** (`POST /api/wargame-sim/regenerate` → `python -m src.tools.regenerate_outputs`,
   no LLM) — materializes partial/complete geojson from checkpoints; gated by `RMOOZ_ALLOW_SIM_RUN`.
4. **Bridge import guard** (`/import?partial=1` stamps partial metadata; anti-clobber 409 unless `?replace=1`
   when `generation_status`/`source_run` differ) — Part 5.4.
5. **Wizard client** (`client/shell/scenario-import-wizard.js`): one "Import Scenario" button → modal →
   progress bar (Part 2D) → **Continue / Import partial / Restart** (Part 5.2/5.3) → open on map with a
   **partial badge**. Graceful failure when `RMOOZ_ALLOW_SIM_RUN!=1` or the LLM is unreachable (→ Advanced).
6. **Partial badge + scenario-list chip** — read `generation_status`/`generated_phase_count` to render
   "Partial Scenario — N/17 phases."
7. **Advanced `<details>`** wrapping the three existing cards in `app.html`.
8. **Test** `test-unified-import-2-wizard.js`: staging order, progress math from checkpoint counts (full +
   partial), resume + regenerate arg wiring, **partial import only at N≥4**, partial metadata stamped,
   **anti-clobber 409 / replace=1**, no-import-before-success, stale guard preserved, advanced routes mount.
9. **Docs** `docs/integration/unified-import-2-wizard.md` + flip the APP_INVENTORY row.

**Do NOT** add SSE, a second parser, DOCX parsing, or a new scenario writer. Keep the porter as the single
import path, keep the FAST-DOC-2 guard, and **never invent phases** (regenerate emits only generated phases).

---

## Acceptance (this audit)

- ✅ **What already works:** stage/run(+auto-publish)/publish/import/load + engine checkpoints/resume — Part 3.
- ✅ **What is missing:** real-progress exposure, resume wiring, **partial-output regenerate route**, **partial
  detection + import guard**, the wizard UI, the Advanced collapse, deploy prerequisites — Part 3.
- ✅ **Progress real or estimated:** REAL (per-phase checkpoint count) — Q5/Q6/Part 2D.
- ✅ **Resume truly supported:** engine yes, bridge needs ~3 lines — Q7/Part 3.
- ✅ **Exact route sequence:** normal, resume, **partial** — Part 4.
- ✅ **Exact UI changes:** one "Import Scenario" wizard (+ Continue/Import-partial/Restart) + collapse 3 cards
  under Advanced — Part 2/3/5.
- ✅ **Old buttons hidden under Advanced:** all three, kept not deleted — Q11/Part 2C.
- ✅ **Next phase:** UNIFIED-IMPORT-2 — Part 6.

### Partial-requirement acceptance (added 2026-06-05)

- ✅ **Full successful generation:** Part 2A (normal flow).
- ✅ **Failed/stopped partial generation:** Part 5.1 (audit) — stopped run = checkpoints only, no geojson;
  geojson materialized via `regenerate_outputs` ($0/no-LLM); importable at **N≥4** (validator floor).
- ✅ **Partial import into Scenario DB:** Part 5.2 + 5.4 — normal `data/scenarios/<name>.json` stamped
  `generation_status:"partial"`, `generated_phase_count`, `expected_phase_count`, `source_run`,
  `partial_import:true`, `can_resume_generation`; badge "Partial Scenario — N/17."
- ✅ **Resume/continue:** Part 5.3 — `/run?resume=1` continues from checkpoint; completes → complete import.
- ✅ **Complete re-import / versioning:** Part 5.4 — default keeps both / new version; **never silently
  overwrites** a partial with a complete run; replace only with `?replace=1` (explicit confirm).
