# PR-226 — Wargame 3 Manual Source Helper

**Date:** 2026-05-26  
**Status:** Delivered  
**Type:** Runtime — console-only helper function  
**Scope:** `UI_MOdified/client/shell/scenario-workspace.js` only

---

## 1. Summary

Added `buildW3PreviewFromLoadedScenario(options)` to `scenario-workspace.js`.  
The function reads `window.RmoozScenario.scenario` in read-only mode, builds a safe
deep-copy `w3json` object, and returns it ready for direct use with
`paintWargame3Preview()`.

The function is exposed on `window.AppShellScenarioWorkspace` and is usable from the
browser console without any additional setup — the live scenario data is already in
memory when the app is running.

---

## 2. File Changed

| File | Lines before | Lines after | Delta |
|------|-------------|-------------|-------|
| `UI_MOdified/client/shell/scenario-workspace.js` | ~8043 | 8215 | +172 |

No other file was changed.

---

## 3. What Was Added

### 3a. Private helpers (lines 7865–7904)

| Name | Purpose |
|------|---------|
| `_w3pfc_deepCopy(val)` | JSON round-trip deep copy for plain objects/arrays. Returns `null`/`undefined` unchanged. |
| `_w3pfc_copyStep(step)` | Copies one step object with all required fields; forces `selectedDecision=null` and `expectedResult=null`. |

The `_w3pfc_` prefix is unique and does not collide with any existing private
identifiers in the module.

### 3b. Main function (lines 7906–8022)

```
buildW3PreviewFromLoadedScenario(options?)
  → { passed, w3json, blockedReasons, warnings }
```

**Parameters:**

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `options.validate` | boolean | `true` | When `true`, calls `adaptWargame3ToFixture(w3json)` after building; adapter failures appear as warnings, not blockers. |

**Return shape:**

| Field | Type | Description |
|-------|------|-------------|
| `passed` | boolean | `true` when a valid `w3json` was built |
| `w3json` | object \| null | Deep-copy of source data, ready for `paintWargame3Preview()` |
| `blockedReasons` | string[] | Non-empty only when `passed:false` |
| `warnings` | object[] | Advisory issues; `passed` may still be `true` |

### 3c. Public API entry (lines 8206–8213)

```javascript
window.AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario
```

---

## 4. Behavior Specification

### 4.1 Source guard (blocking)

| Condition | blockedReason added |
|-----------|---------------------|
| `window.RmoozScenario` is `undefined` | `'window.RmoozScenario is not defined'` |
| `.scenario` is `null` or not an object | `'window.RmoozScenario.scenario is missing or not an object'` |
| no `name` and no `scenario_label` | `'scenario has no name or scenario_label'` |
| `steps` is absent or empty array | `'scenario.steps is missing or empty'` |

Any blocker returns `{ passed:false, w3json:null, … }` immediately.

### 4.2 Field mapping (when source is valid)

| w3json field | Source | Fallback |
|---|---|---|
| `scenario_id` | `src.scenario_id` | `'wg3-live'` |
| `name` | `src.name` | `''` |
| `scenario_label` | `src.scenario_label` | `''` |
| `ported_from` | `src.ported_from` | omitted if absent |
| `obj` | `src.obj` | `null` (deep-copied) |
| `red_units` | `src.red_units` | `null` (deep-copied) |
| `blue_units_initial` | `src.blue_units_initial` | `null` (deep-copied) |
| `red_unit_step_coords` | `src.red_unit_step_coords` | `null` (deep-copied) |
| `blue_unit_step_coords` | `src.blue_unit_step_coords` | `null` (deep-copied) |
| `steps[]` | `src.steps[]` via `_w3pfc_copyStep` | skipped with `W3PFC_STEP_SKIP` warning |

Per-step fields copied: `index`, `phase`, `time_label`, `narrative_en_fallback`,
`narrative_ar_fallback` (if present), `objective_status_baseline`, `actors[]`,
`affected[]`, `engagement_arcs[]`.  
Per-step fields **forced**: `selectedDecision = null`, `expectedResult = null`.

### 4.3 Absent-optional-field warnings

| Warning code | Condition |
|---|---|
| `W3PFC_NO_RED_UNITS` | `src.red_units` absent |
| `W3PFC_NO_BLUE_UNITS` | `src.blue_units_initial` absent |
| `W3PFC_NO_RED_COORDS` | `src.red_unit_step_coords` absent |
| `W3PFC_NO_BLUE_COORDS` | `src.blue_unit_step_coords` absent |
| `W3PFC_STEP_SKIP` | a step was null or non-object |
| `W3PFC_ADAPTER_BLOCKED` | adapter blocked (validate:true, adapter !passed) |
| `W3PFC_ADAPTER_EXCEPTION` | adapter threw an exception |

### 4.4 Coordinate format preserved

`red_unit_step_coords` and `blue_unit_step_coords` are deep-copied at root level
preserving the format `{ uid: [[lon, lat], …] }` — one coord array per unit,
indexed by step number. This matches what `adaptWargame3ToFixture` expects.

### 4.5 Deep-copy strategy

All objects and arrays are copied via `JSON.parse(JSON.stringify(…))`. Primitive
fields are assigned directly. The source object is **never mutated** at any point.

---

## 5. Console Usage

### Basic — build and inspect

```javascript
var r = window.AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();
console.log(r.passed, r.warnings.length, r.w3json.steps.length);
// → true  0  17
```

### Build, then paint step 0

```javascript
var r = window.AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();
if (r.passed) {
    window.AppShellScenarioWorkspace.paintWargame3Preview(r.w3json, 'W3-STEP-00');
}
```

### Build without adapter validation

```javascript
var r = window.AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario({ validate: false });
```

### Step navigation from live source

```javascript
var r = window.AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();
if (r.passed) {
    window.AppShellScenarioWorkspace.stepWargame3Preview(r.w3json, 'W3-STEP-00', 1);
}
```

---

## 6. Browser Test Results (18 tests)

All 18 tests executed against live app at `http://localhost:8000/app.html`.

| # | Test | Result |
|---|------|--------|
| T01 | `window.RmoozScenario` undefined → `passed:false`, correct reason | ✅ PASS |
| T02 | `.scenario = null` → `passed:false`, correct reason | ✅ PASS |
| T03 | Empty object `{}` → `passed:false`, two reasons (no label, no steps) | ✅ PASS |
| T04 | Has name but `steps:[]` → `passed:false`, steps reason | ✅ PASS |
| T05 | Live data → `passed:true`, 17 steps, scenario_label correct | ✅ PASS |
| T06 | Returned `w3json` is a new reference (not `=== source`) | ✅ PASS |
| T07 | Mutating `w3json` does not affect `window.RmoozScenario.scenario` | ✅ PASS |
| T08 | `scenario_id` defaults to `'wg3-live'` when absent in source | ✅ PASS |
| T09 | `adaptWargame3ToFixture(w3json)` → `passed:true` | ✅ PASS |
| T10 | `previewWargame3Fixture(w3json)` → `passed:true` | ✅ PASS |
| T11 | `preview.previewComplete === false` | ✅ PASS |
| T12 | `preview.decision === null` | ✅ PASS |
| T13 | `window.RmoozScenario.stepIndex` unchanged after call | ✅ PASS |
| T14 | All 17 steps have `selectedDecision === null` | ✅ PASS |
| T15 | All 17 steps have `expectedResult === null` | ✅ PASS |
| T16 | `window.units` unchanged after call | ✅ PASS |
| T17 | `localStorage.length` unchanged after call | ✅ PASS |
| T18 | `validate:false` produces zero adapter warnings; still `passed:true` | ✅ PASS |

**18 / 18 passed.**

### End-to-end verification

```javascript
var r = window.AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();
window.AppShellScenarioWorkspace.paintWargame3Preview(r.w3json, 'W3-STEP-00');
```

| Check | Result |
|-------|--------|
| `#sw-drp-section` visible | ✅ |
| `#sw-drp-fixture` text | `"Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)"` |
| Panel renders without errors | ✅ |

---

## 7. Safety Checklist

| Constraint | Status |
|---|---|
| No DOM reads or writes | ✅ — function touches no DOM elements |
| No map mutation | ✅ — `window.units` verified unchanged (T16) |
| No `window.RmoozScenario.stepIndex` mutation | ✅ — verified unchanged (T13) |
| No `localStorage` / `sessionStorage` writes | ✅ — verified unchanged (T17) |
| No `fetch` / XHR / network | ✅ — no network calls anywhere in function |
| No `apply`/`commit`/`confirm` controls | ✅ — console helper only |
| Source object never mutated | ✅ — JSON round-trip deep copy; T07 confirms isolation |
| No changes to `app.js` or `adjudicator-map.js` | ✅ — single file change |
| No changes to HTML or CSS | ✅ — no `app.html` or `style.css` changes |
| No changes to `i18n.js` | ✅ |
| ES5-compatible (var, no arrow functions, no import/export) | ✅ |
| No auto-invocation on app load | ✅ — console-only; not called from `init()` or any event handler |

---

## 8. Recommended Next PR

**PR-227 — Wargame 3 Full Walkthrough Test**

Now that `buildW3PreviewFromLoadedScenario()` + `stepWargame3Preview()` form a
complete source-to-navigation chain, the recommended next step is a browser-console
walkthrough of all 17 steps — verifying narrative text, objective status, actor
rendering, engagement arc display, and `atStart`/`atEnd` guards at step boundaries.
This would be docs-only (validation report) unless display defects are found.
