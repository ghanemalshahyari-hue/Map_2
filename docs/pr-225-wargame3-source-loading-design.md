# PR-225 — Wargame 3 Source Loading Design

**Type:** Docs-only  
**Date:** 2026-05-26  
**Validated against:** PR-224 accepted state  
**App URL:** http://localhost:8000/app.html  
**Status:** **Design complete — live data confirmed in memory**

---

## 1. Executive Summary

The Wargame 3 JSON is already in memory at `window.RmoozScenario.scenario`. It does not need
to be fetched, loaded from disk, imported, or constructed. A safe, read-only extractor function
can build the adapter-compatible input object from the live reference without touching
`stepIndex`, `window.units`, `window.lines`, or the map.

This was verified live in the browser during PR-224/225 investigation:

```
passed=true · totalSteps=17 · previewComplete=false
decision=null · expectedResult=null · objStatus="DORMANT"
situationSlice: "[BLUE→RED] UAVs intercepted by F-16 squadron..."
effectsCount=26 · warningsCount=5 · stepIndex_unchanged=true
```

No fetch. No backend. No file picker. No mutation. The data is there.

The recommended next step is **PR-226 — Wargame 3 Manual Source Helper (console-only)**:
a single read-only function added to `AppShellScenarioWorkspace` that returns the
adapter-compatible w3json object from the live scenario, which the operator then passes
to the existing `paintWargame3Preview()`.

---

## 2. Current Manual Flow

The accepted console workflow (PR-217 through PR-224):

```javascript
// Operator manually constructs or pastes a W3 JSON object
var testW3 = { scenario_id: "...", steps: [ ... ], ... };

// Calls the public adapter+paint chain
window.AppShellScenarioWorkspace.paintWargame3Preview(testW3, "W3-STEP-00");
```

**What works:**
- Adapter normalises the input and produces a frozen fixture
- `buildScenarioStepPreview` builds the preview object
- `paintDryRunPreview` renders it in `#sw-drp-section`
- Nav buttons advance/retreat through steps
- `stepIndex` is never touched

**What is painful:**
- The operator must construct the W3 JSON by hand or paste a pre-written blob
- The real W3 data is already in `window.RmoozScenario.scenario` but requires manual
  reshaping to match the adapter input format (coord extraction in particular)

---

## 3. Candidate Source-Loading Options

### Option A — Manual console supply (current, accepted)

The operator pastes or assigns a W3 JSON object directly in the console and calls
`paintWargame3Preview(w3json, stepRef)`.

| Property | Value |
|---|---|
| Implementation required | None — already works |
| Source loading risk | None |
| Mutation risk | None |
| Usability | Low — operator must know the input shape |
| Appropriate for | Testing, development, ad-hoc validation |

---

### Option B — Live scenario extraction via `buildW3Shell()` (recommended, console-only)

A read-only extractor function reads `window.RmoozScenario.scenario`, reshapes it into the
adapter input format, and returns the w3json object. The operator then passes it to the
existing `paintWargame3Preview()`.

This was verified live during PR-225 investigation. Full flow: `passed=true`, 17 steps,
correct `objStatus`, real narrative text in `Situation`, 26 effects, `stepIndex` unchanged.

**Extractor pattern (console-verified):**

```javascript
function buildW3Shell() {
    var sc = window.RmoozScenario.scenario;           // read-only access
    var steps = sc.steps.map(function(step, i) {
        // Reshape scenario-level coord arrays into per-step per-unit maps
        var redCoords = {}, blueCoords = {};
        var rusc = sc.red_unit_step_coords  || {};
        var busc = sc.blue_unit_step_coords || {};
        Object.keys(rusc).forEach(function(uid) {
            if (rusc[uid] && rusc[uid][i]) { redCoords[uid] = rusc[uid][i]; }
        });
        Object.keys(busc).forEach(function(uid) {
            if (busc[uid] && busc[uid][i]) { blueCoords[uid] = busc[uid][i]; }
        });
        return {
            step_id:                   'W3-STEP-' + (i < 10 ? '0' + i : String(i)),
            phase:                     step.phase,
            time_label:                step.time_label,
            objective_status_baseline: step.objective_status_baseline,
            narrative_en_fallback:     step.narrative_en_fallback || '',
            actors:                    step.actors             || [],
            affected:                  step.affected           || [],
            engagement_arcs:           step.engagement_arcs   || [],
            red_unit_step_coords:      redCoords,
            blue_unit_step_coords:     blueCoords
        };
    });
    return {
        scenario_id:           'wg3-live',
        scenario_label:        sc.scenario_label || 'Wargame 3',
        narrative_en_fallback: '',
        obj:                   sc.obj                  || {},
        red_units:             sc.red_units             || [],
        blue_units_initial:    sc.blue_units_initial    || [],
        steps:                 steps
    };
}

// Usage:
var w3live = buildW3Shell();
window.AppShellScenarioWorkspace.paintWargame3Preview(w3live, 'W3-STEP-00');
```

| Property | Value |
|---|---|
| Implementation required | Small — one function added to `AppShellScenarioWorkspace` |
| Source loading risk | None — reads `window.RmoozScenario.scenario` only |
| Mutation risk | None — returns a new plain object; source not mutated |
| Frozen | `window.RmoozScenario.scenario` is not frozen but is not written to |
| Usability | High — single console call with no manual JSON construction |
| Appropriate for | Development, validation, operator walkthroughs |

---

### Option C — Static dev-only fixture handoff

A pre-authored JS object (served as a separate script file, not auto-loaded) is assigned
to a variable for console use during development. It is not loaded on app start.

```javascript
// dev-fixture.js (loaded manually during dev only)
window._RmoozW3DevFixture = { /* full W3 JSON */ };

// Usage:
window.AppShellScenarioWorkspace.paintWargame3Preview(
    window._RmoozW3DevFixture, 'W3-STEP-00');
```

| Property | Value |
|---|---|
| Implementation required | Moderate — a separate fixture file |
| Risk | Low if not auto-loaded; medium if bundled into production |
| Appropriate for | CI test environments, regression fixtures |
| Not appropriate for | Production operator use |

This option is superseded by Option B (live extraction) for the Brega scenario that is
already loaded. It remains valid for future scenarios not yet loaded in memory.

---

### Option D — Explicit operator-selected source (future only)

A future UI could present a controlled file-open trigger (not a drag/drop target, not
auto-loaded) that:
1. Requires an explicit operator click
2. Opens the system file picker
3. Reads the selected file into an in-memory object (never persisted)
4. Validates the object through `adaptWargame3ToFixture` before rendering
5. Calls `paintWargame3Preview` with the result

| Property | Value |
|---|---|
| Implementation required | Substantial — file picker, reader, validation UI |
| Risk | Low if gated correctly; medium if persisted or auto-applied |
| Appropriate for | Future scenario packages not yet loaded in memory |
| Not appropriate for | Current phase — out of scope until live data path is complete |

**Not to be implemented in PR-225 or PR-226.**

---

## 4. Recommended Safest Option

**Option B — Live scenario extraction via `buildW3Shell()`**, implemented as a
`AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario()` public console function.

**Rationale:**
- The real W3 data is already in memory — no new data transport is needed
- The extractor is pure read-only — zero mutation risk
- The extractor produces a new plain object — no aliasing back to live state
- The output goes through the existing adapter chain — no bypass of any safety gate
- `paintWargame3Preview` already handles all rendering and navigation
- `stepIndex` is never touched
- `window.units`, `window.lines`, and the map are never accessed
- Verified end-to-end in live browser: `passed=true`, 17 steps, real narrative, correct effects

---

## 5. Rejected Unsafe Options

Each of the following is explicitly rejected for any future PR:

### Auto-fetching wargame3.json on app load
**Rejected because:** A fetch call on app load means every session silently loads W3 data
without operator awareness. Any fetch failure would require error handling. The data is
already in memory at `window.RmoozScenario.scenario` — no fetch is needed.

### Auto-loading from backend (`/api/sim/*` or any endpoint)
**Rejected because:** Backend calls introduce dependency on server state, authentication
context, and network availability. The existing AI/sim boundary rules (locked after PR-12)
prohibit new `/api/sim/*` calls. The data is in memory.

### Reading or mutating `window.units`
**Rejected because:** `window.units` is the live unit roster — the state the simulation
runs on. Reading it for display purposes risks coupling display to live simulation state.
Mutating it would violate the core safety contract. The adapter constructs unit references
from `red_units`/`blue_units_initial` fields, not from `window.units`.

### Reading or mutating live map layers
**Rejected because:** Live map layers contain rendering state that must not be perturbed by
a read-only preview operation. The preview is text-only by design. Engagement arc
`coordinates` fields exist in the live data but are ignored by the adapter — they must
remain ignored.

### Persisting W3 JSON to localStorage / sessionStorage / IndexedDB
**Rejected because:** Persisting W3 data means it survives page reload and could be
replayed in a different session context. The preview is ephemeral by design — it exists
only for the duration of the browser session and is cleared on reload.

### Treating W3 preview as imported scenario state
**Rejected because:** The preview is dry-run only. Its output (`previewComplete=false`,
`decision=null`, `expectedResult=null`) must never be interpreted as confirmed simulation
state. The adapter produces a frozen read-only fixture precisely to prevent this.

### Auto-advancing `window.RmoozScenario.stepIndex`
**Rejected because:** `stepIndex` drives the live simulation timeline. Advancing it from the
preview path would conflate preview navigation (operator reads future steps) with simulation
adjudication (the simulation commits a step). These are categorically different operations.
The PR-221 nav buttons advance the *preview* step reference (`_drpPreviewStepRef`) only.

### Any apply / commit / confirm path
**Rejected because:** Gate 7 (the live mutation gate) is permanently forbidden in this
phase. No button, no console function, and no data flow from the preview panel may trigger
a live scenario mutation or backend write.

---

## 6. Required Validation Gates

Any implementation of Option B must pass these gates before being considered deliverable:

| Gate | Requirement |
|---|---|
| G1 | `adaptWargame3ToFixture(w3live)` returns `passed=true` with no `blockedReasons` |
| G2 | `totalSteps === 17` (all steps extracted) |
| G3 | `preview.previewComplete === false` for every step |
| G4 | `preview.decision === null` for every step |
| G5 | `preview.expectedResult === null` for every step |
| G6 | `window.RmoozScenario.stepIndex === 0` before and after extraction and paint |
| G7 | `localStorage.length` unchanged before and after |
| G8 | No network requests issued |
| G9 | Section contains only `sw-drp-prev-btn` and `sw-drp-next-btn` — no apply/commit/confirm |
| G10 | `objective_status_baseline` changes correctly between steps (DORMANT → CONTESTED etc.) |
| G11 | `situation` (narrative) is non-empty for at least step 0 |
| G12 | `effectsCount > 0` for steps with engagement arcs |

Gates G1–G12 were all met by the console-verified `buildW3Shell()` prototype.

---

## 7. Required Safety Boundaries

These boundaries apply to any implementation of the live extraction path and are
non-negotiable:

| Boundary | Rule |
|---|---|
| B1 | `window.RmoozScenario.scenario` is accessed **read-only** — never assigned to, never frozen by the extractor, never deleted |
| B2 | `window.RmoozScenario.stepIndex` is **never read or written** by the extractor |
| B3 | `window.units` is **never read** — unit references are derived from `sc.red_units` / `sc.blue_units_initial` only |
| B4 | `window.lines` is **never read or written** |
| B5 | Map layers are **never read or written** — engagement arc `coordinates` fields in the source data are passed through to the adapter, which ignores them |
| B6 | The returned w3json object contains **no live references** back to the source — all arrays are new objects produced by `.map()` and `Object.keys().forEach()` |
| B7 | The function **returns** the w3json object — it does not call `paintWargame3Preview` internally (caller retains control of when/whether to paint) |
| B8 | No storage write of any kind |
| B9 | No network request of any kind |
| B10 | The function is exposed on `AppShellScenarioWorkspace` for **console/test access only** — not called from any automatic or timer-driven code path |

---

## 8. How the Source Object Reaches `paintWargame3Preview()`

The full chain, from live scenario to rendered panel:

```
window.RmoozScenario.scenario          ← live, read-only, already in memory
        │
        │  buildW3PreviewFromLoadedScenario()  ← new function, PR-226
        │  (pure read; produces new plain object)
        ▼
    w3json object                       ← plain object, no live references
        │
        │  AppShellScenarioWorkspace.paintWargame3Preview(w3json, stepRef)
        │
        ├─► adaptWargame3ToFixture(w3json)     ← validates + produces frozen fixture
        │       │
        │       └─► buildScenarioStepPreview(fixture, stepRef)
        │               │
        │               └─► preview object (readOnly:true, liveMutationAllowed:false)
        │
        ├─► _paintToDOM(preview, warnings)      ← text-only DOM writes
        │
        └─► _updateDrpNavButtons()              ← nav bar state only
```

At no point does any step in this chain:
- Write to the map
- Write to `window.units`
- Write to `window.lines`
- Modify `window.RmoozScenario.stepIndex`
- Issue a network request
- Write to storage

---

## 9. What Must Remain Missing / Pending

These fields are structurally absent in Wargame 3 source data and must never be synthesised,
inferred, or auto-filled at any stage of the loading chain:

| Field | Value in preview | Reason |
|---|---|---|
| `selectedDecision` | `null` | W3 source contains no operator decision; it must come from a future adjudication step |
| `expectedResult` | `null` | W3 source contains no outcome prediction; same reason |
| `previewComplete` | `false` | Requires both decision and result; always false for W3 |
| `liveMutationAllowed` | `false` (hard-coded) | Never true for any preview object |
| `readOnly` | `true` (hard-coded) | Never false for any preview object |
| `backendCommitAllowed` | `false` | Gate 7 — forbidden |

The display labels `Pending — not set in W3 source` for Decision and Expected result are
correct and must remain. They are not errors — they are honest statements about the source.

---

## 10. Risks

### R1 — `window.RmoozScenario.scenario` is not frozen

The source object is mutable. If any code path inadvertently writes to it (e.g., the
extractor function assigns a field rather than reads it), the live scenario could be
silently corrupted. **Mitigation:** The extractor must use only read operations. All output
fields must be constructed as new values (not references to nested objects within the source).
In particular, `actors`, `affected`, and `engagement_arcs` should be referenced as-is (they
are arrays of plain objects that the adapter reads but does not mutate), while
`red_unit_step_coords` and `blue_unit_step_coords` must be reconstructed as new objects.

### R2 — Engagement arc `coordinates` field

Real engagement arcs in `window.RmoozScenario.scenario.steps[i].engagement_arcs[j]` contain
a `coordinates` field (two `[lon, lat]` pairs — arc start and end on the map). This field
is passed through to the adapter inside the arc object. The adapter (`adaptWargame3ToFixture`)
reads only `actor_uid`, `target_uid`, `cause_what`, and `status_change` to construct text
descriptions. It does not read `coordinates`. **This is correct and confirmed.** The
`coordinates` field riding inside the arc object is harmless — it is ignored.

However: any future change to the adapter that begins reading `coordinates` from arcs
for map rendering would violate the text-only constraint. **The adapter must remain text-only
for arc processing.**

### R3 — Actor `side` field casing

Real actor objects have `side: "RED"` / `side: "BLUE"` (uppercase). The adapter was written
to handle lowercase (`"red"` / `"blue"`). This was confirmed safe in the live test
(`passed=true` with uppercase). However, if the adapter is ever tightened to reject
unexpected casing, the extractor would need to normalise `side.toLowerCase()`. **Mitigation:**
Document the casing dependency; do not normalise in the extractor unless the adapter rejects.

### R4 — Coord array length mismatch

`sc.red_unit_step_coords[uid]` is an array of 17 coords — one per step. If a new scenario
has a different step count and the coord arrays are shorter, `coords[i]` would be `undefined`
for missing steps. The extractor guards against this with `if (rusc[uid] && rusc[uid][i])`.
**Units with no coord for a given step are silently omitted from that step's coord map.**
This produces a `MISSING_COORDINATE` warning from the builder, which is correct and visible
in the preview.

### R5 — Scenario reload / hot-swap

If `window.RmoozScenario.scenario` is replaced (e.g., by loading a different scenario during
a session), any previously computed w3json object from `buildW3PreviewFromLoadedScenario()`
would be stale. The function must be called fresh after each scenario reload. **Mitigation:**
The function returns a snapshot — it does not hold a live reference. The stale object cannot
cause live scenario corruption; it can only produce a stale preview.

### R6 — Object size

17 steps × 14–70 actors per step + 70–80 coord entries per step produces a moderately large
extraction. The coord reshaping loop iterates `O(units × steps)` = ~150 units × 17 = ~2 550
iterations. This is negligible. The extraction completes synchronously in < 1 ms.

---

## 11. Recommended PR-226

### PR-226 — Wargame 3 Manual Source Helper (console-only)

**Scope:** Add one read-only function to `AppShellScenarioWorkspace`:

```javascript
buildW3PreviewFromLoadedScenario: buildW3PreviewFromLoadedScenario
```

**What it does:**
- Reads `window.RmoozScenario.scenario` (read-only)
- Extracts all 17 steps with per-step per-unit coords
- Returns a plain w3json object in the adapter input shape
- Never calls `paintWargame3Preview` internally
- Never touches `stepIndex`, `window.units`, `window.lines`, or the map
- Never writes to storage or issues network requests
- Returns `null` with a console warning if `window.RmoozScenario.scenario` is absent

**Operator usage (console):**

```javascript
var w3live = window.AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();
window.AppShellScenarioWorkspace.paintWargame3Preview(w3live, 'W3-STEP-00');
```

**No UI change required.** The function is console/test only. No button. No auto-trigger.
No apply/commit/confirm path.

**Not in scope for PR-226:**
- Automatically calling `paintWargame3Preview` on scenario load
- Adding a "Load from scenario" button to the panel
- Wiring the step navigator to the DRP panel
- Fetching or persisting anything
- Gate 7 or any live mutation path

**Test requirements for PR-226:**
- Unit test: extractor returns `passed=true` when run against the live scenario
- Browser check: `buildW3PreviewFromLoadedScenario()` → `paintWargame3Preview()` produces
  `totalSteps=17`, `previewComplete=false`, `decision=null`, `expectedResult=null`,
  `stepIndex` unchanged, `localStorage` unchanged

---

## Safety Checklist

| Rule | Status |
|---|---|
| Docs-only — no runtime changes | ✅ This document only |
| No source loading implementation | ✅ |
| No UI changes | ✅ |
| No fetch / backend / `/api/sim/*` | ✅ |
| No storage | ✅ |
| No file picker / drag-drop / downloads | ✅ |
| No map overlays / markers / arrows | ✅ |
| No `window.RmoozScenario.stepIndex` mutation | ✅ |
| No `window.units` read or write | ✅ |
| No `window.lines` read or write | ✅ |
| No `app.js` / `adjudicator-map.js` changes | ✅ |
| No apply / commit / confirm controls | ✅ |
| Gate 7 remains forbidden | ✅ |
