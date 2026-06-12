# FAST-DOC-2 — DOCX Import Publish/Latest Path Clarity Fix

**Date:** 2026-06-05 · **Builds on:** DEBUG-DOCX-1
(`debug-docx-1-change-propagation-diagnosis.md`). **Scope:** make the correct DOCX→RMOOZ workflow
obvious and **detect stale outputs before import**. No deletion, no WarGamingGEN-core change, no importer
rebuild, no DOCX parsing in RMOOZ.

## Goal
Operators kept seeing the same RMOOZ result after editing DOCX + running WarGamingGEN. DEBUG-DOCX-1
proved why (RC-1 stale `runs/latest`; RC-2 bridge path, fixed; RC-3 imports from `export_to_rmooz/<dated>`,
not `runs/`; RC-4 model fallback). FAST-DOC-2 closes the **operator-error surface**: it makes the
publish-before-import step explicit and **refuses (with override) to import an export that is older than
the newest run**.

## The correct workflow (now enforced by the UI)
```
1. Upload red_team.docx + blue_team.docx        (staged into WarGamingGEN/inputs/forces)
2. Run WarGamingGEN                              (one-click if RMOOZ_ALLOW_SIM_RUN=1, else the shown CLI)
3. Publish latest run                            (copies runs/<newest> → export_to_rmooz/<dated> + latest.json)
4. Check outputs                                 (freshness panel shows what will be imported)
5. Import + load on map                          (via port-wargame.js; blocked if the source is stale)
```

## What changed

### Server — `UI_MOdified/server/wargame-sim-bridge.js`
- **`computeFreshness(c)`** (read-only): resolves and reports
  - `latest_txt.target` — the WGEN `runs/latest.txt` pointer (the source of truth, **preferred over the
    `runs/latest` directory**);
  - `newest_run` — newest `runs/<ts>` by timestamp name + its `all_phases.geojson` mtime;
  - `export` — the published `export_to_rmooz/<dated>` run id + `all_phases.geojson` **mtime, size, sha256**;
  - `runs_latest` — whether `runs/latest` **exists**, is a **real directory** vs symlink, and a
    `stale_dir_warning` when its output is older than the newest run (RC-1). **It is never deleted.**
  - `stale` / `no_export` / `export_behind` verdicts + a human `reason`.
  Implemented with `statSync`/`lstatSync`/`readFileSync` only — **no writes, no deletes**.
- **`GET /api/wargame-sim/status`** now includes a `freshness` block (additive — FAST-DOC-1 fields
  unchanged) plus `paths.runs`.
- **`POST /api/wargame-sim/import` stale guard:** if `export_behind` (a newer run exists than the
  published export) and no `?confirm=1`, returns **409** `{stale:true, warning, freshness}` instead of
  importing. With `?confirm=1` (operator override) it imports and stamps `imported_stale:true`. The
  pre-existing 404 ("no published export") is unchanged. Import still goes **through
  `scripts/port-wargame.js`** — no rebuilt importer, no DOCX parsing.

### Client — `UI_MOdified/client/shell/wargame-sim-import.js` (`?v=3`)
- A **read-only freshness panel** (`#wg-sim-freshness`) shows the resolved source: latest.txt target /
  newest run / published export (mtime+size+sha) / a `runs/latest` real-dir + STALE flag / the verdict.
- An explicit **"Publish latest run"** button (added in DEBUG-DOCX-1) sits between Run and Check.
- **Two-step stale guard:** when the source is stale, the first Import click only **warns** and re-labels
  the button **"Import anyway (stale) ⚠"**; a second explicit click imports with `?confirm=1`. The server
  409 is also handled defensively (arms the override). The import summary shows `⚠ STALE-OVERRIDE` when
  used. **No auto-import** — import only ever runs from the button click.

## RC-1 (`runs/latest`) — still NOT deleted
Per the FAST-DOC-2 constraints, this PR **does not delete `runs/latest`**. It only **detects and warns**
(real-dir + stale flag in the freshness panel) and everywhere **prefers `latest.txt`**. The destructive
cleanup remains the documented, operator-run, opt-in plan in
`debug-docx-1-change-propagation-diagnosis.md` §10.

## Guardrails honored
No `runs/latest` deletion · no full-sim auto-run · no LLM calls · no DOCX parsing in RMOOZ · no invented
or hardcoded scenario data · import path stays through `export_to_rmooz` + `port-wargame.js` · no
WarGamingGEN-core or SmartSearch modification (freshness is read-only; the only writes remain the
FAST-DOC-1 `inputs/forces` staging + `export_to_rmooz` publish).

## Tests — `test-fast-doc-2-publish-before-import.js` (37/37 PASS)
- **A (unit):** `computeFreshness` flags the stale `runs/latest` real dir, prefers `latest.txt`, detects
  an export older than the newest run, provides sha/size/mtime — and **`runs/latest` still exists after**
  the audit. A current export (published after its run) is **not** stale.
- **B (integration, spawned server):** `/status` exposes freshness; a stale `/import` returns **409** with
  a warning and **writes no scenario**; `runs/latest` survives; `/import?confirm=1` proceeds via the porter
  and marks `imported_stale:true`; the scenario file appears **only** after the explicit confirmed import.
- **C (source guards):** no DOCX parsing (bridge + UI); import uses `port-wargame.js`; no code path
  deletes `runs/latest` or anything under `runs/`; no SmartSearch writes; freshness is read-only; UI
  import is bound to an explicit click (no auto-import on load/timer); Publish + stale-override
  affordances present.
- **Regression:** `test-fast-doc-1-docx-sim-bridge.js` still **30/30** (additive `freshness`; guard only
  fires when a newer run exists than the export, which FD1's fixture never creates).

## Acceptance
Met — the UI makes the workflow obvious (Upload → Run → **Publish** → Check → Import), the freshness panel
shows exactly what will be imported and from where, and **stale outputs are detected and blocked before
import** (server 409 + client two-step), all without deleting `runs/latest`.
