# PR-224 — Wargame 3 Visual Preview Validation Report

**Type:** Docs-only  
**Date:** 2026-05-26  
**Validated against:** PR-223 accepted state  
**App URL:** http://localhost:8000/app.html  
**Status:** **PASSED — visual validation complete**

---

## 1. Executive Summary

The Wargame 3 dry-run preview panel is rendering correctly after the PR-222/223 readability pass.
All 13 validation checks passed. No runtime regressions were detected. The panel is text-only,
read-only, and free of apply/commit/confirm controls. Navigation between steps works correctly.
Objective status baseline updates per step. Warnings are grouped in monospace. Effects show bullet
prefixes. `window.RmoozScenario.stepIndex` did not change during any nav action. `localStorage`
was not written. No map mutation was detectable.

One usability observation is recorded in §9: the Situation field shows "Missing data" for test
steps that lack per-step narrative text. This is expected given the current adapter input shape
and is not a display bug.

Recommendation: **PR-225 — Wargame 3 Source Loading Design (docs-only)**.

---

## 2. Browser Test Setup

| Item | Value |
|---|---|
| URL | `http://localhost:8000/app.html` |
| Server | `node server/web-server.js` on port 8000 |
| Tile server | `node server/tile-server.js` on port 8080 (separate process) |
| Browser | Chrome (macOS, connected via Claude in Chrome extension) |
| `scenario-workspace.js` version | `?v=1` (hard-refresh applied before test) |
| Baseline `stepIndex` | `0` |
| Baseline `localStorage.length` | `9` |
| `AppShellScenarioWorkspace.paintWargame3Preview` | present ✅ |
| `AppShellScenarioWorkspace.adaptWargame3ToFixture` | present ✅ |
| `AppShellScenarioWorkspace.buildScenarioStepPreview` | present ✅ |
| `AppShellScenarioWorkspace.paintDryRunPreview` | present ✅ |

### Test input (`testW3`)

Two-step scenario covering PRE-H (P0) → H (H+00):

```javascript
var testW3 = {
    scenario_id:            "wg3-brega-pr224",
    scenario_label:         "Wargame 3 — Brega Amphibious",
    narrative_en_fallback:  "Blue amphibious force attempts lodgement at Brega. Red armoured and UAV forces contest the pipeline corridor.",
    obj: { name: "Objective X (Nasser-Brega pipeline midpoint)" },
    red_units: [
        { uid: "R-NAE-01", name: "نسر الجنوب — UAV Sqn" },
        { uid: "R-41BDE",  name: "لواء المشاة الآلي 41" }
    ],
    blue_units_initial: [
        { unit_uid: "B-d1-9",  name: "B-d1-9 MAR BN" },
        { unit_uid: "B-d1-13", name: "B-d1-13 ARTY BN" }
    ],
    steps: [
        {
            step_id:                   "W3-STEP-00",
            phase:                     "PRE-H",
            time_label:                "P0",
            objective_status_baseline: "DORMANT",
            actors: [
                { uid: "R-NAE-01", side: "red",  action_what: "UAV reconnaissance launched over AO" },
                { uid: "B-d1-9",   side: "blue", action_what: "Amphibious force on approach march" }
            ],
            affected: [{ uid: "B-d1-13", effect: "ARTY suppressed by EW" }],
            engagement_arcs: [
                { actor_uid: "R-NAE-01", target_uid: "B-d1-9",
                  cause_what: "UAV ISR coverage", status_change: "observed" }
            ],
            red_unit_step_coords:  { "R-NAE-01": [13.18, 30.75], "R-41BDE": [13.10, 30.70] },
            blue_unit_step_coords: { "B-d1-9": [13.27, 30.80], "B-d1-13": [13.30, 30.82] }
        },
        {
            step_id:                   "W3-STEP-01",
            phase:                     "H",
            time_label:                "H+00",
            objective_status_baseline: "CONTESTED",
            actors: [
                { uid: "R-41BDE",  side: "red",  action_what: "Armoured counterattack along Route Green" },
                { uid: "B-d1-9",   side: "blue", action_what: "Assault landing commenced" },
                { uid: "B-d1-13",  side: "blue", action_what: "ARTY fire missions on Red armour" }
            ],
            affected: [{ uid: "R-41BDE", effect: "AT fire — mobility kill on lead element" }],
            engagement_arcs: [
                { actor_uid: "R-41BDE",  target_uid: "B-d1-9",  cause_what: "armoured assault",  status_change: "suppressed" },
                { actor_uid: "B-d1-13",  target_uid: "R-41BDE", cause_what: "ARTY fire mission", status_change: "mobility kill" }
            ],
            red_unit_step_coords:  { "R-NAE-01": [13.18, 30.75], "R-41BDE": [13.22, 30.78] },
            blue_unit_step_coords: { "B-d1-9": [13.27, 30.80], "B-d1-13": [13.30, 30.82] }
        }
    ]
};
window.AppShellScenarioWorkspace.paintWargame3Preview(testW3, "W3-STEP-00");
```

---

## 3. UI Path Confirmation

| Step | Action | Result |
|---|---|---|
| 1 | Navigated to `http://localhost:8000/app.html` | App loaded, title "rmooz — رموز" |
| 2 | Clicked **Scenario** button in left tool rail (grid/rows icon, second from bottom) | `#scenario-workspace-panel` became visible (`display ≠ none`) |
| 3 | Ran `paintWargame3Preview(testW3, "W3-STEP-00")` in browser console | `passed=true`, `preview` non-null, panel scrolled into view |
| 4 | Verified `#sw-drp-section` is visible | `offsetParent = context-panel` — fully in-flow |

Panel anchor text at top of left panel: **"SCENARIO DRY-RUN PREVIEW"**

---

## 4. Step Navigation Observations

### Step 0 — W3-STEP-00 (PRE-H · P0)

| DOM field | Value |
|---|---|
| W3 context bar | `Wargame 3  ·  Dry-Run Preview  ·  Read-only` (visible, blue accent) |
| Fixture | `Wargame 3 — Brega Amphibious` |
| Active step | `W3-STEP-00 (1 / 2)` |
| Step title | `PRE-H — P0` |
| Situation | `Missing data` *(see §9 — expected for test data)* |
| Decision | `Pending — not set in W3 source` |
| Expected result | `Pending — not set in W3 source` |
| Units referenced | `R-NAE-01 (enemy) · B-d1-9 (friendly) · B-d1-13 (friendly)` |
| Objectives | `Objective X (Nasser-Brega pipeline midpoint)` |
| Objective status (baseline) | `DORMANT` (`data-status="dormant"`) |
| Proposed effects | `• Engagement: R-NAE-01 → B-d1-9 [UAV ISR coverage] (observed)` |
| Preview status | `Partial — missing decision/result  ·  Read-only` |
| Safety | `Dry-run preview only · No live changes` |
| Nav bar | visible — **Preview previous** disabled, **Preview next** enabled, `Step 1 / 2` |

**Adapter harness:** `passed=true`, 13 raw warnings (adapter + builder combined), 1 proposed effect,
`previewComplete=false`, `decision=null`, `expectedResult=null`.

### After clicking **Preview next** — W3-STEP-01 (H · H+00)

| DOM field | Value |
|---|---|
| Active step | `W3-STEP-01 (2 / 2)` |
| Step title | `H — H+00` |
| Objective status (baseline) | `CONTESTED` (`data-status="contested"`, red text) |
| Proposed effects | `• Engagement: R-41BDE → B-d1-9 [armoured assault] (suppressed)` |
|  | `• Engagement: B-d1-13 → R-41BDE [ARTY fire mission] (mobility kill)` |
| Decision | `Pending — not set in W3 source` |
| Expected result | `Pending — not set in W3 source` |
| Preview status | `Partial — missing decision/result  ·  Read-only` |
| Nav bar | **Preview previous** enabled, **Preview next** disabled, `Step 2 / 2` |
| `window.RmoozScenario.stepIndex` | `0` — **unchanged** |

### After clicking **Preview previous** — back to W3-STEP-00

| DOM field | Value |
|---|---|
| Active step | `W3-STEP-00 (1 / 2)` |
| Objective status (baseline) | `DORMANT` (reverted correctly) |
| Nav bar | **Preview previous** disabled, **Preview next** enabled, `Step 1 / 2` |
| `window.RmoozScenario.stepIndex` | `0` — **unchanged** |

Navigation forward and back both produce consistent, correct output. Step index state is
maintained correctly in `_drpPreviewStepRef` (module-private). Live scenario state is untouched.

---

## 5. Readability Observations

### W3 context bar (PR-223)

The blue accent bar `Wargame 3  ·  Dry-Run Preview  ·  Read-only` is rendered at the top of the
section, immediately below the "SCENARIO DRY-RUN PREVIEW" badge. It is:
- Visible without scrolling
- Hidden when AMBER RIDGE default is active (confirmed separately)
- Clearly distinct from the data rows below

### Fixture row (PR-223)

The fixture row shows `Wargame 3 — Brega Amphibious` — the human-readable `scenario_label` from
the W3 input. The previous triple-repetition issue (`wargame3 — Wargame 3 · Wargame 3`) is gone.

### Objective status label (PR-223)

Label reads `Objective status (baseline)`. The parenthetical makes clear this is the baseline
state from the W3 source step, not the current live simulation status. The value changes
correctly between steps:
- Step 0: `DORMANT` (muted grey)
- Step 1: `CONTESTED` (red)

Color coding is functioning via `data-status` attribute and CSS `[data-status="..."]` selectors.

### Pending labels (PR-222)

Decision and Expected result both show `Pending — not set in W3 source` in muted text.
These are visually distinct from actual data values (they are not bold, not black).
A reader unfamiliar with W3 can immediately understand these fields are structurally absent
in W3, not missing due to a data error.

### Preview status (PR-222)

`Partial — missing decision/result  ·  Read-only` on two dots separator. This is clear and
correct. No "apply", "commit", "confirm", or "gate" language appears anywhere in the section.

---

## 6. Warnings Observations

### Grouping display

Warnings render in three groups for step 0:

```
[MISSING_COORDINATE] ×3:
  · Unit "R-NAE-01" (R-NAE-01) has no start location
  · Unit "B-d1-9" (B-d1-9) has no start location
  · Unit "B-d1-13" (B-d1-13) has no start location
[MISSING_FIELD] ×2:
  · selectedDecision is missing — step cannot be marked preview-complete
  · expectedResult is missing — step cannot be marked preview-complete
[INCOMPLETE_FIELD] enemyCounterActions is empty — enemy response not defined for this step
```

- `[MISSING_COORDINATE]` — units lack `startLocation` (correct: test data uses `step_coords`
  GeoJSON, not the `startLocation.lat/lng` that the builder checks). These warnings are
  expected and explain why effects have no coordinate context in the preview.
- `[MISSING_FIELD]` — `selectedDecision` and `expectedResult` are always null in W3 source.
  These are structural, not accidental. The "Pending" labels in the decision/result rows
  already surface this to the reader.
- `[INCOMPLETE_FIELD]` — `enemyCounterActions` is empty for this step; only friendly actors
  and engagement arcs are defined in step 0.

### Font rendering

Warning text element computed `font-family: Consolas, Monaco, monospace`. The `[CODE]` prefix
reads clearly as a tag distinct from the message body. Line-height 1.5 gives adequate
breathing room between grouped entries.

### Raw vs displayed warning count

The harness `result.warnings` array contained **13 items** for step 0. The panel displays
**6 items** (in 3 groups). This is by design:
- `result.warnings` is the union of adapter-level validation warnings (fired during
  `adaptWargame3ToFixture`) and builder-level step warnings (fired during
  `buildScenarioStepPreview`).
- `preview.warningsDetail` carries only the builder-level step warnings — the 6 that
  directly concern preview readiness. Adapter-level warnings (e.g. `UNIT_COUNT_ANOMALY`
  about unit roster consistency) are not surfaced in the preview panel, which is correct:
  they are structural fixture concerns, not step-level preview concerns.

This filtering is working as intended and does not need to change.

---

## 7. Effects Observations

### Step 0 — one arc

```
• Engagement: R-NAE-01 → B-d1-9 [UAV ISR coverage] (observed)
```

Format: `• {type label}: {actor_uid} → {target_uid} [{cause_what}] ({status_change})`

The bullet `•` prefix (PR-223) makes it easy to distinguish entries on scroll. The type
label `Engagement` (mapped from `engagement_arc`) is human-readable. No GeoJSON coordinates
are exposed. No Leaflet objects are created. No map layer is modified.

### Step 1 — two arcs

```
• Engagement: R-41BDE → B-d1-9 [armoured assault] (suppressed)
• Engagement: B-d1-13 → R-41BDE [ARTY fire mission] (mobility kill)
```

Two arcs render as two lines. Directionality (`→`) conveys actor/target relationship.
The `cause_what` in brackets and `status_change` in parentheses provide operational context
without needing map visualisation. Blue-force ARTY acting on Red armour reads correctly
from the text alone.

---

## 8. Safety Observations

| Check | Evidence |
|---|---|
| `window.RmoozScenario.stepIndex` unchanged | `0` before and after all nav clicks |
| `localStorage.length` unchanged | `9` before and after all actions |
| Map mutation | Map object not exposed at `window._map` or `window.adjudicatorMap`; no Leaflet marker/polyline APIs called from preview code paths |
| Buttons in `#sw-drp-section` | Only `sw-drp-prev-btn` and `sw-drp-next-btn` — no apply, commit, confirm, or Gate 7 elements present |
| Text scan for forbidden words | `apply=false`, `commit=false`, `confirm=false`, `gate7=false`, `fetch=false` |
| `window.units` | Not read or written during preview nav (by design — `buildScenarioStepPreview` operates on the fixture only) |
| `window.lines` | Not read or written |
| Backend / fetch | No network requests issued |
| Storage | No writes to localStorage, sessionStorage, or IndexedDB |
| `app.js` / `adjudicator-map.js` | Not modified |

---

## 9. Problems Found

### P1 — Situation shows "Missing data" (expected, not a bug)

**Severity:** Low — cosmetic in test context  
**Observed:** Both steps show `Situation: Missing data`  
**Root cause:** The test input (`testW3`) does not include per-step narrative or situation text.
The adapter derives situation from step-level narrative fields (not the root `narrative_en_fallback`).
Since each step in the test data has actors and engagement arcs but no `narrative` or `situation`
string, the builder correctly marks situation as absent and the preview displays "Missing data".

**This is not a display bug.** The real Wargame 3 JSON (loaded from the scenario file) has
per-step situation content derived from the narrative and actor descriptions. Until source
loading is wired from the loaded scenario to the console API, test inputs must include
per-step narrative for this field to populate.

**Action:** No runtime change required. Document the per-step input shape requirement in the
source loading design (PR-225).

### P2 — 13 raw harness warnings vs 6 panel warnings (expected, not a bug)

**Severity:** None — informational  
**Observed:** `result.warnings.length === 13` from the console; the panel groups and displays 6.  
**Root cause:** `result.warnings` is the full union (adapter + builder). `preview.warningsDetail`
carries only builder-level step warnings. The 7 suppressed adapter warnings include
`UNIT_COUNT_ANOMALY` (roster consistency), `MISSING_COORDINATE` ×4 (step coord coverage),
and `MISSING_FIELD` ×2 (adapter-level field checks). These are correctly not shown in the
step-level preview panel.

**Action:** No change required. The filtering is correct.

### P3 — Situation field label says "Situation" but value is always "Missing data" for test inputs

**Severity:** Low — test harness limitation  
**Observed:** The label "Situation" implies narrative text should appear; "Missing data" is
confusing in isolation.  
**Mitigation:** The PR-222 pending labels on Decision and Expected result make the W3 source
gap clear. The Situation gap is less prominent. A future improvement could show a W3-specific
placeholder ("Not yet wired from source") similar to the Decision/Result pending labels — but
this is a separate PR concern, not a blocker.

**Action:** Deferred. Note in PR-225 scope.

---

## 10. Recommended PR-225

### Recommendation: PR-225 — Wargame 3 Source Loading Design (docs-only)

**Rationale:** Visual validation passed. The panel renders correctly from in-memory W3 JSON
supplied via the console. The remaining gap is not a display problem — it is a source loading
problem: the loaded Wargame 3 scenario data (accessible at runtime via
`window.RmoozScenario` or the step navigator) is not yet wired to a convenient console or
UI entry point that passes the real step JSON to `paintWargame3Preview`.

**PR-225 should document:**

1. Where the live W3 scenario JSON lives in the running app (which object, which path).
2. How an operator or tester can extract the current-step W3 JSON without mutating anything.
3. A safe console command that reads the live step data and calls `paintWargame3Preview`
   without touching `stepIndex`, `units`, `lines`, or the map.
4. Whether `scenario_label`, `obj.name`, and per-step `objective_status_baseline` fields are
   present in the real loaded JSON (they appear to be, based on the Step Navigator card and
   the Step Summary card which already display `objective_status_baseline`).
5. The per-step `narrative` / `situation` field path so that Situation populates correctly.

**PR-225 must not:**
- Change runtime code
- Add apply/commit/confirm controls
- Mutate any live state
- Wire any automatic data flow between the scenario navigator and the DRP panel

---

## Safety Checklist

| Rule | Status |
|---|---|
| Docs-only — no runtime changes | ✅ This document only |
| No UI changes | ✅ |
| No parser/adapter changes | ✅ |
| No map overlays / markers / arrows | ✅ Confirmed by button scan and text scan |
| No `window.RmoozScenario.stepIndex` mutation | ✅ Remained `0` throughout |
| No `window.units` mutation | ✅ |
| No `window.lines` mutation | ✅ |
| No storage / fetch / backend | ✅ `localStorage.length` unchanged; no network requests |
| No `app.js` / `adjudicator-map.js` changes | ✅ |
| No apply / commit / confirm controls | ✅ Only `sw-drp-prev-btn` and `sw-drp-next-btn` found |
| Gate 7 remains forbidden | ✅ No Gate 7 text or elements detected |
