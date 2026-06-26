# Free Fight / SCC — Real-AI movement pipeline verification

**Tag:** RMOOZ-FF-EVIDENCE-BUILD-MARKER-A
**Date:** 2026-06-26
**Baseline commit at start of session:** `41ccc166` (`HEAD == origin/main`, clean tree)

This document records the live + static verification of the Free Fight / Scenario Control
Center (SCC) movement pipeline after the dual-map-layer / behavior-contract chain
(`8a0051c3` → `41ccc166`), plus the runtime build/evidence marker added this session.

---

## 1. What was verified

### Static / unit (no server)
All run with `node <file>` from the repo root (Windows, Node v20):

| Suite | Result |
|---|---|
| `test-free-fight-dual-map-layer-conflict-a.js` | 8/8 PASS |
| `test-free-fight-real-ai-behavior-contract-a.js` | 15/15 PASS |
| `test-free-fight-ai-coa-behavior-required-a.js` | 10/10 PASS |
| `test-free-fight-behavior-e2e-a.js` | 8/8 PASS |
| `test-free-fight-movement-intelligence-a.js` | 20/20 PASS |
| `test-free-fight-aircraft-behavior-a.js` | 15/15 PASS |
| `test-free-fight-movement-debug-a.js` | 22/22 PASS |
| `test-movement-truth-a.js` | 18/18 PASS |
| `test-free-fight-wargaminggen-movement-a.js` | 15/15 PASS |
| **`test-free-fight-evidence-diagnostics-a.js`** (NEW) | 8/8 PASS |
| **`test-scc-evidence-diagnostics-render-a.js`** (NEW) | 5/5 PASS |

### Live browser (real `app.html`)
Driven through the auth-stub proxy against the real web-server:

```
# terminal 1 — real server
cd UI_MOdified && PORT=8002 RMOOZ_ALLOW_SIM_RUN=1 node server/web-server.js
# terminal 2 — auth-stub proxy (stubs GET /api/auth/me, forwards everything else)
PORT=8003 TARGET=http://127.0.0.1:8002 node scripts/verify-proxy-server.js
# browser → http://localhost:8003/app.html   (or the preview launch config "rmooz-ff-app-verify")
```

**Scripts loaded (cache-bust confirmed via the proxy + `document.scripts`):**

| Script | Loaded version |
|---|---|
| `free-fight-ai.js` | `?v=dual-layer-conflict-a` ✓ |
| `free-fight-movement-engine.js` | `?v=movement-intelligence-b` ✓ |
| `free-fight-demo.js` | `?v=behavior-path-required-a` ✓ |
| `scenario-control-center.js` | `?v=dual-layer-conflict-a` ✓ |

**Globals present:** `RmoozFreeFightDemo`, `RmoozMovementEngine`, `RmoozMapLayerMode`,
`RmoozCoaRealismGate`, and the new `RmoozFreeFightDemo.engine.diagnostics()`.

**Map-layer ownership (live `preview_eval`):**

| | before COA op | after real COA op (`_clearAiLiteStagedGroups`) |
|---|---|---|
| `map_layer_mode` | `ai_lite_preview` | `free_fight` |
| `ai_lite_layer_visible` | `true` | `false` |

`RmoozMapLayerMode.mode()` / `.isAiLiteVisible()` agree with `diagnostics()`.
No console errors on load.

---

## 2. Pass criteria — status

| Criterion | Status | Note |
|---|---|---|
| No AI-lite **preview** labels during execution | ✅ | AI-lite preview marker text is `… · REVIEW PREVIEW` only (free-fight-demo.js:750); it renders on the separate `_aiLiteLayer`, which is cleared on Generate / loading-complete / Commit / Replan-reset. |
| AI-lite layer not visible during execution | ✅ | `ai_lite_layer_visible === false` after any real COA op (proven live + unit). |
| Evidence shows `source = ai_behavior` / `degraded_behavior_repaired` | ✅ | `movementDebug()` rows carry `source`; SCC table + diagnostics `movement_source_summary` bucket them. Behavior contract suites prove repaired actions carry `_source = degraded_behavior_repaired`. |
| Movement records show behavior / domain / movement_mode / waypoint_policy | ✅ | Returned by `movementDebug()` and now rendered as columns in the SCC Debug/Evidence table. |
| Aircraft do not direct-step into Objective X | ✅ | `test-free-fight-aircraft-behavior-a` (patrol_loop / orbit, domain-separated waypoints) 15/15. |
| Blocked/held reasons visible | ✅ | `blocked_reason` column (UNIT NOT FOUND / HOLD REVIEW / DOMAIN BLOCKED / HELD IN PLACE / NOT TASKABLE). |

### ⚠ Note on the literal `innerText.includes('staged')` check
The console snippet's `document.body.innerText.toLowerCase().includes('staged')` returns
**`true`**, but this is a **false positive** — it is NOT an AI-lite leak. The six matches:

- 5× hidden import-wizard text about *staged input files* (`wg-wz-*`, e.g. "No Step 1 JSON staged").
- 1× the adjudicator-map **legend** row `BLS staged` — a Battlefield-Logistics-Site **control
  status** domain value (`STAGED → CONTESTED → SECURED`), permanent legitimate vocabulary.

The AI-lite preview overlay never renders the word "staged" as a label (its label is
`REVIEW PREVIEW`); `g.phase = 'staged'` is an internal data field, not display text. A correct
check targets the AI-lite layer / `REVIEW PREVIEW` label, not the substring "staged" anywhere.

---

## 3. What changed this session

- **`UI_MOdified/client/shell/free-fight-demo.js`**
  - `_BUILD_MARKER = 'behavior-path-required-a'` — single source-of-truth build tag.
  - `engine.diagnostics()` — runtime object (build marker, `movement_engine_loaded`,
    `realism_gate_loaded`, `map_layer_mode`, `ai_lite_layer_visible`, `plan_source`,
    `llm_status`, `selected_coa_id`, `movement_source_summary` {ai_behavior /
    degraded_behavior_repaired / staff_safe_movement_engine / legacy_target / other},
    `moved_count` / `held_count` / `blocked_count` / `missing_unit_count`). Pure read.
  - `_mapLayerMode` module var — flips to `free_fight` when `_clearAiLiteStagedGroups()` runs
    (real COA op), so the mode label reflects the TRUE execution posture instead of a stuck
    default. `window.RmoozMapLayerMode` now delegates to it.
- **`UI_MOdified/client/shell/scenario-control-center.js`**
  - "Runtime build & map-layer diagnostics" block at the top of the Debug/Evidence panel,
    incl. a **stale-cache detector** that compares each loaded `<script> ?v=` against the
    expected version and prints "Browser is running THIS build" / "STALE CACHE … hard-refresh".
  - Movement-debug table extended with domain / behavior / mode / source / moved-km / rem-km
    columns (data already produced by `movementDebug()`; the table previously dropped them and
    also referenced stale field names — both fixed).
- **New tests:** `test-free-fight-evidence-diagnostics-a.js` (data, 8/8),
  `test-scc-evidence-diagnostics-render-a.js` (render + cache-detector, 5/5).

---

## 4. Remaining known limitations / blockers

- **`test-scenario-control-center-af.js` — 5 pre-existing failures** (`_coaTick is not
  defined`). Confirmed present on the clean baseline `41ccc166` via `git stash` (8 passed /
  5 failed, identical) — **NOT introduced this session.** Looks like a stale test seam
  referencing a removed `_coaTick`. Left untouched; needs a separate focused fix.
- **No production caller flips `RmoozMapLayerMode.setMode('free_fight')` directly.** The mode is
  driven instead by `_clearAiLiteStagedGroups()` (which the real COA Generate/Commit/Replan
  paths call). This is sufficient for correctness today; a future SCC mount could call
  `setMode('free_fight')` explicitly for symmetry.
- **Full end-to-end live COA run (place objective → real-AI generate → commit → 3 ticks)** was
  not driven click-by-click in the browser this session: the dev box has no local LLM model
  pulled and no tile-server, so a real-AI generate falls back and `preview_screenshot` of the
  Leaflet map times out on tile fetch. The pipeline is instead proven by the behavior-contract
  / movement suites + live `diagnostics()` reads. Re-running on a box with a pulled local model
  (e.g. `qwen2.5:7b`) + tile-server is the way to capture map screenshots.

---

## 5. Exact commands to rerun

```bash
# static — all green suites
for t in test-free-fight-dual-map-layer-conflict-a \
         test-free-fight-real-ai-behavior-contract-a \
         test-free-fight-ai-coa-behavior-required-a \
         test-free-fight-behavior-e2e-a \
         test-free-fight-movement-intelligence-a \
         test-free-fight-aircraft-behavior-a \
         test-free-fight-movement-debug-a \
         test-movement-truth-a \
         test-free-fight-wargaminggen-movement-a \
         test-free-fight-evidence-diagnostics-a \
         test-scc-evidence-diagnostics-render-a; do
  node "$t.js"; done

# live (real app.html via auth-stub proxy)
cd UI_MOdified && PORT=8002 RMOOZ_ALLOW_SIM_RUN=1 node server/web-server.js   # term 1
PORT=8003 TARGET=http://127.0.0.1:8002 node scripts/verify-proxy-server.js     # term 2
# open http://localhost:8003/app.html, then in console run the snippet in §6 of the task brief
```
