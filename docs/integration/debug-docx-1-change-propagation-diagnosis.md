# DEBUG-DOCX-1 — WarGamingGEN DOCX Change-Propagation Diagnosis

**Date:** 2026-06-05 · **Box:** `C:\Users\EngCoder` (Windows 11) · **Scope:** diagnosis + minimal fix only.
**Symptom reported:** "When I change `red_team.docx`/`blue_team.docx` and run the pipeline, RMOOZ keeps
showing the same result every time."

> **Path note:** every `C:\Users\ADMIN\...` path in the original task spec is **`C:\Users\EngCoder\...`**
> on this machine. WarGamingGEN lives at `C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN`. This user
> mismatch is itself one of the root causes (RC-2).

---

## TL;DR — verdict: **multi-cause, PROVEN**

Changed DOCX **do** propagate into a *fresh* WarGamingGEN run (proven by a marker test below). The "same
result" is produced **after** generation, by stale path/pointer resolution on three independent surfaces:

| # | Root cause | Surface | Status |
|---|---|---|---|
| **RC-1** | `runs/latest` is a **stale real directory** (Windows can't make the symlink), frozen at the 2026-05-21 gpt4o run. Anything reading `runs\latest\outputs\...` gets the same May-21 file forever. | WarGamingGEN (manual/CLI/viewer consumers + the task spec's own "Expected outputs" path) | **PROVEN.** Fix *recommended* (WGEN-side). |
| **RC-2** | RMOOZ bridge default path was hardcoded `C:/Users/ADMIN/Desktop/TestingAI` → dead on this box → staged DOCX, run, and import all targeted a non-existent tree; copy-into-`inputs/forces` silently skipped. | RMOOZ (`server/wargame-sim-bridge.js`) | **FIXED + verified.** |
| **RC-3** | Publish gap: RMOOZ Import reads `export_to_rmooz/<dated>/geojson/all_phases.geojson`, **not** `runs/`. A manual CLI run never publishes there, so Import reads a stale/empty export. | RMOOZ ⇄ WGEN handoff | **PROVEN.** Workflow fix documented. |
| **RC-4** | Model quality: `qwen2.5:7b` partially **falls back to deterministic placeholders** (BLUE agent + Adjudicator schema failures), so resolution-driven output is largely DOCX-invariant even on a fresh run. | WGEN LLM layer | **PROVEN, secondary.** Not the "same file" cause; flagged. |

The failure-point classification (task §10) is **A + D + E** as the dominant chain, with **F** (partial,
RC-4) and the **C** caveat (regenerate_outputs) documented.

---

## 1. Exact DOCX paths read

WarGamingGEN re-parses the DOCX **fresh on every run** — there is no parse cache:

- `tests/test_full_run.py:172-176`
  - `apply_docx_objective_override(scenario, project/"inputs/forces/red_team.docx")`
  - `parse_docx_oob(project/"inputs/forces/red_team.docx", "RED")`
  - `parse_docx_oob(project/"inputs/forces/blue_team.docx", "BLUE")`
- `project = <WarGamingGEN root>` → absolute paths:
  - `C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN\inputs\forces\red_team.docx`
  - `C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN\inputs\forces\blue_team.docx`
- Both confirmed under `WarGamingGEN\inputs\forces`. ✅
- Parser style: `src/parsers/docx_parser.py:272` iterates body `w:t` text and detects numbered Arabic
  unit lines into a flat `ForceOOB`. **Live parse counts:** RED = **84 units**, BLUE = **89 units**
  (matches the run's `red_alive=84 / blue_alive=89`).

## 2. Hash comparison table (pre-test originals)

| File | SHA-256 (first 16) | Size |
|---|---|---|
| `import_from_rmooz/red_team.docx` (RMOOZ staged) | `3ae01465d0b004e2` | 19 706 |
| `WarGamingGEN/inputs/forces/red_team.docx` | `3ae01465d0b004e2` | 19 706 |
| `import_from_rmooz/blue_team.docx` (RMOOZ staged) | `1baa61816226e2c8` | 20 198 |
| `WarGamingGEN/inputs/forces/blue_team.docx` | `1baa61816226e2c8` | 20 198 |

**Finding:** staged copies and `inputs/forces` copies are **byte-identical right now** → the copy step
*does* work **when the paths resolve correctly**. The bug was never the copy logic; it was the path the
copy targeted (RC-2).

## 3. Do RMOOZ staged uploads reach WarGamingGEN inputs?

- RMOOZ stages raw uploads to `<TestingAI>/import_from_rmooz/<slot>.docx`
  (`wargame-sim-bridge.js` `stage-doc`, line ~183).
- It then copies staged → `inputs/forces` **only if `inputs/forces` exists** (line 185-188), backing up
  the previous file as `.bak`.
- **Before fix:** `<TestingAI>` defaulted to `C:/Users/ADMIN/Desktop/TestingAI` (no such tree here) →
  `exists(forcesDir)` was **false** → the copy was **silently skipped** (`placed_in_forces:false`, no
  error surfaced). WarGamingGEN then ran against whatever old DOCX already sat in its real
  `inputs/forces`. **This is task failure-point A.**
- **After fix:** `/api/wargame-sim/status` reports
  `forces: C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN\inputs\forces` and `docs:{red:true,blue:true}`.

## 4. Does a fresh run create new outputs? (marker test — task §7)

Procedure: injected `RMOOZ_TEST_MARKER_RED_001` into a real RED unit line and
`RMOOZ_TEST_MARKER_BLUE_001` into a real BLUE unit line (DOCX hashes changed
`3ae0146…→882f8852…` / `1baa618…→82843c19…`; confirmed both captured in the parsed OOB), then ran
`python tests/test_full_run.py --max-phases 1 --run-name marker_test`.

| Check | Result |
|---|---|
| New run dir created | ✅ `runs/2026-06-05_20-14-15_marker_test/` (each run = fresh `runs/<ts>`; no overwrite) |
| `runs/latest.txt` updated | ✅ → `2026-06-05_20-14-15_marker_test` |
| Markers in **new** run `outputs/geojson/all_phases.geojson` | ✅ **present (2 hits)** |
| Markers in **stale** `runs/latest/outputs/geojson/all_phases.geojson` | ❌ **0 hits** |
| `--resume` / checkpoint reuse on a default run | ❌ not used — fresh parse every time (`test_full_run.py:205-207`, resume is opt-in at `:217`) |

**Conclusion:** DOCX → parse → world → GeoJSON propagation **works**. A fresh run reflects DOCX changes.
The stale `runs/latest` does not — which is exactly the "same result" the user saw.

**GeoJSON freshness (task §8):**

| Path | Size | Modified | Markers |
|---|---|---|---|
| `runs/latest/outputs/geojson/all_phases.geojson` (stale dir) | 2 821 491 B | **2026-05-21 15:19** | none |
| `runs/2026-06-05_20-14-15_marker_test/.../all_phases.geojson` (fresh) | 155 966 B | **2026-06-05 20:16** | RED+BLUE |

## 5. Is `regenerate_outputs` the cause? (task §5)

`src/tools/regenerate_outputs.py` **replays existing checkpoints** (line 59, 103-105) and re-writes
CSV/MD/GeoJSON. It *does* re-parse the DOCX for the OOB/objective (line 87-92), **but the per-phase
LLM decisions/resolutions come from the frozen checkpoints**, not from a new model pass.

> ⚠️ **`regenerate_outputs` must NOT be used to test changed DOCX** unless the checkpoints were produced
> from the changed DOCX. If a user edits the DOCX and runs `regenerate_outputs`, the LLM-driven phase
> behavior will not change (only OOB-derived geometry could shift) → "same result." If this is the
> user's actual workflow, it is **task failure-point C**.

## 6. Parser output changes (task §6)

- RED parsed units: **84**; BLUE parsed units: **89** (live, current DOCX).
- First RED names: `قيادة المنطقة الجنوبية…`, `القوة البرمائية (البحر)…`, …
- First BLUE names: `المكون البري 99…`, `لواء المشاة الآلي 51`, `كتيبة المشاة الآلية 511…`, …
- Marker injection confirmed captured: a marker appended to a **recognized unit line** appears in
  `name_ar` and flows to GeoJSON. A marker on a **header/non-unit line does NOT propagate** (the parser
  only extracts numbered unit lines) — this is the **F** extraction-limitation caveat: not every DOCX
  edit propagates, only edits to recognized unit lines + the objective override.

## 7. Which `all_phases.geojson` does RMOOZ import? (task §9)

- RMOOZ Import (`wargame-sim-bridge.js` `/import`) resolves via `latestExport()` →
  `export_to_rmooz/latest.json` → else newest `YYYY-MM-DD_…` subdir →
  `export_to_rmooz/<dated>/geojson/all_phases.geojson`. The porter (`scripts/port-wargame.js`)
  reads that FeatureCollection and writes `UI_MOdified/data/scenarios/<name>.json`.
- It does **NOT** read `runs/latest` or `runs/<ts>` directly.
- **Current `export_to_rmooz` state on this box:** no `latest.json`, **no dated run folder** — only stale
  loose files (`wargame_report.md`/`wargameschedule.csv` @ 2026-05-21, `manifest.json` @ 13:49). So
  `latestExport()` returns null → **Import currently 404s ("no published export found")**, or, if any
  stale dated folder existed, would import that. **This is task failure-point E** and depends on the
  **publish gap (RC-3)**: only RMOOZ's `/run` completion (line 216-217) or an explicit `/publish`
  (line 232) copies `runs/<ts>` → `export_to_rmooz/<dated>`. A manual CLI run never publishes.

## 8. Minimal fix — applied + recommended

**APPLIED (RMOOZ, in-repo, safe, reversible) — RC-2:**
`UI_MOdified/server/wargame-sim-bridge.js` — replaced the dead hardcoded default with
`resolveTestingAiDir()`: honor `RMOOZ_TESTINGAI_DIR`, else auto-detect `%USERPROFILE%\Desktop\TestingAI`,
else fall back to the legacy ADMIN path. No sim logic added, no DOCX parsing, no importer rebuild.
**Verified:** `/api/wargame-sim/status` now resolves the real EngCoder tree and reports `docs:{red:true,blue:true}`.

**APPLIED (RMOOZ client, safe, reversible) — RC-3 publish-before-import made explicit:**
`UI_MOdified/client/shell/wargame-sim-import.js` (bumped to `?v=2` in `app.html:5112`) now exposes an
explicit **"Publish latest run"** button (`POST /api/wargame-sim/publish`) between Run and Check, an
ordered **1→5 flow** subtitle, and a manual-CLI note that spells out the publish step + the "RMOOZ imports
the published dated export, NOT `runs/latest`" caveat. **Browser-verified:** stage → Publish → Check →
Import enables; publish returned `ok:true run_id=2026-06-05_20-14-15_marker_test` → `export.all_phases:true`,
Import button unlocked, status `[outputs_found] export ready +report +schedule`. No mutation until the
operator clicks Import; publish is a server-side file copy (no sim, no LLM).

**RECOMMENDED (not applied — WGEN-side / destructive):**
- **RC-1 (`runs/latest` stale):** see the **Safe Cleanup Plan** below. *No auto-delete.*
- **RC-4 (`qwen2.5:7b` fallback):** the BLUE agent + Adjudicator currently fail schema and fall back to
  deterministic placeholders (observed: `Blue 1/8 components`, `Resolution: 0 outcomes`,
  "local model fallback used after schema failure"). For DOCX changes to fully drive *behavior* (not just
  OOB geometry), use a model that reliably returns valid structured JSON. Per owner ruling, stay on local
  Ollama — recommend testing a stronger local structured-output model; do not silently accept the
  fallback as "generation."

## 9. Retest checklist

1. Edit a **recognized unit line** in `inputs/forces/red_team.docx` (e.g. append a marker to a unit name).
2. `cd C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN` and run a **fresh** run (no `--resume`, no
   `regenerate_outputs`): `python tests\test_full_run.py --max-phases 1 --run-name retest`.
3. Confirm a **new** `runs\<ts>_retest\` dir and that `runs\latest.txt` points to it.
4. `grep` the new run's `outputs\geojson\all_phases.geojson` for your marker → **should be present**.
   (Do **not** read `runs\latest\...` — it is stale.)
5. For RMOOZ import: with the server running, `POST /api/wargame-sim/publish`, confirm
   `export_to_rmooz\latest.json` now points to the new dated folder, then `POST /api/wargame-sim/import`
   and confirm the imported `data/scenarios/<name>.json` reflects the marker / new unit counts.
6. Negative control: re-import **without** publishing → confirms the old behavior (stale import) so the
   publish step's necessity is demonstrable.

**Acceptance:** met — we proved *why* changed DOCX produced the same RMOOZ result (RC-1 stale
`runs/latest` + RC-2 dead bridge path + RC-3 publish gap), and proved that the corrected path (fresh
`runs/<ts>` via `latest.txt`, real EngCoder tree, published export) makes the output **change** (marker
present in the fresh GeoJSON, absent in the stale one).

---

## 10. RC-1 — Safe Cleanup Plan (PLAN ONLY — do **not** auto-delete)

`WarGamingGEN/runs/latest` is a **stale real directory** on Windows (the symlink can't be created without
privilege). Every consumer that reads the literal `runs/latest/...` path gets a frozen old run. The fix is
to stop trusting `runs/latest` and rely on `runs/latest.txt`. This is **WGEN-side and destructive**, so it
is intentionally **not executed** by this task. Procedure for a human to run, in order:

**Step 1 — Detect (read-only).** Determine whether `runs/latest` is a real directory (the bug) or a
symlink (fine):
```powershell
# PowerShell
$rl = "C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN\runs\latest"
$item = Get-Item $rl -Force
"is reparse/symlink : " + [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
"latest.txt says    : " + (Get-Content "$(Split-Path $rl)\latest.txt" -ErrorAction SilentlyContinue)
```
```bash
# Git Bash equivalent
RL=/c/Users/EngCoder/Desktop/TestingAI/WarGamingGEN/runs/latest
test -L "$RL" && echo "symlink (OK)" || echo "REAL DIR (stale-bug)"
echo "latest.txt -> $(cat "$(dirname "$RL")/latest.txt" 2>/dev/null)"
```

**Step 2 — Warn if stale.** If Step 1 reports a **real dir** (not a symlink) AND its
`outputs/geojson/all_phases.geojson` mtime is older than the run named in `latest.txt`, treat `runs/latest`
as **STALE** and do not read from it. (Confirmed stale here: `runs/latest` = 2026-05-21, `latest.txt` =
2026-06-05.)

**Step 3 — Prefer `latest.txt` everywhere.** Resolve the current run as
`runs/<contents-of-latest.txt>/outputs/...`, never `runs/latest/outputs/...`. WGEN's own
`_find_latest_run_dir` already honors `latest.txt` first; RMOOZ's bridge already picks newest-by-timestamp
and ignores the `latest` name — so **RMOOZ is unaffected** and needs no change for RC-1.

**Step 4 — Manual cleanup (operator-run, opt-in, only after confirming Step 1 = real dir).** Removing the
stale dir makes a later privileged/symlink-aware run recreate it correctly; nothing in RMOOZ depends on it:
```powershell
# PowerShell — review first, then run manually
Remove-Item -Recurse -Force "C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN\runs\latest"
```
```bash
# Git Bash equivalent
rm -rf "/c/Users/EngCoder/Desktop/TestingAI/WarGamingGEN/runs/latest"
```
> ⚠️ **Guardrails:** (a) only delete if Step 1 confirms it is a **real directory**, never a symlink;
> (b) it is pre-existing data not created by this task — **confirm with the owner first**;
> (c) do **not** wire this into any automated path; (d) `latest.txt` must remain the source of truth.

**Optional future enhancement (not done):** add a *read-only* staleness warning to
`/api/wargame-sim/status` (compare `runs/latest` mtime vs `latest.txt` target) so the UI can surface
"runs/latest is stale — using latest.txt". Non-destructive; deferred pending owner go-ahead.

---

### Artifacts
- Backups used for the marker test were restored; DOCX hashes verified back to originals
  (`red 3ae01465…`, `blue 1baa6181…`). Test run dir `runs/2026-06-05_20-14-15_marker_test` left in place
  as evidence; it was also published to `export_to_rmooz/2026-06-05_20-14-15_marker_test/` during UI
  verification.
- Code changes (RMOOZ repo):
  - `UI_MOdified/server/wargame-sim-bridge.js` — `resolveTestingAiDir()` (RC-2).
  - `UI_MOdified/client/shell/wargame-sim-import.js` + `app.html` (`?v=2`) — explicit **Publish latest run**
    button, ordered 1→5 flow, manual-CLI/`runs/latest` note (RC-3). Browser-verified.
