# Import units / base placement audit (IMPORT-UNITS-BASE-PLACEMENT-A)

**Audit/proof only — no code changed, nothing committed/pushed.** Method: direct code reading +
**live proof** in the real app.html (auth-stub proxy) on the LITE GCC-vs-Iran Step 1 file, plus
the `graphify-out` topology. Continues `docs/import-ui-cleanup-audit.md` /
`docs/import-to-scenario-map-flow.md`.

## Executive summary

The markers the user sees "around Objective X" are **demo-overlay markers (`demo_only:true`,
`review_only:true`, `exact_unit_position:false`)** — **not** actual imported units, **not** final
scenario units. The **actual/proposed units are never drawn as individual map markers** in the
Review flow; they stay **grouped under the real base anchors** (the 12 `placement_candidates`) and
in the **Base Status proposed-unit rows**. So the user's expectation ("units stay grouped under
real bases/anchors") **is already true for the real data** — the confusion is a separate,
intentional review-only animation layer.

Two distinct demo overlays exist and can run **at the same time**:
- **OLD `demo-movement.js`** ("Demo Movement" button) — glides every group from its anchor toward
  `centroid(allGroups)` (a point in the *middle of the forces*), with **no domain awareness**.
  Live: objective = `{26.50, 52.25}` (the centroid), 5 markers converge there.
- **NEW `free-fight-demo.js`** ("Free Fight Demo" button) — domain-aware (naval→coast,
  support→hold, air→objective), the one `domain-movement.js` + `symbol-identity` patched.

The "units around Objective X" are the **OLD Demo Movement centroid glide** (unaffected by the
domain-aware fix), and/or the two overlays stacked (duplicate markers).

## Root cause

1. The review screen renders **two** demo buttons (`doc-understanding-review.js:884-991`):
   `data-act="demo-movement"` → `RmoozDemoMovement.mount` (OLD) and `data-act="free-fight"` →
   `RmoozFreeFightDemo.mount` (NEW).
2. `demo-movement.js` sets `_objective = centroid(_allGroups)` and moves **every** group
   `lerp(anchor → centroid)` — no domain awareness, no naval-to-coast, no support-hold. All
   groups (incl. naval) converge on a central point ≈ "around the objective".
3. `domain-movement.js` and `symbol-identity.js` were wired into **`free-fight-demo.js` only**,
   **never** into `demo-movement.js`. So the OLD Demo Movement is **unchanged** by the fixes.
4. Each demo module owns its **own** `L.layerGroup` (`demo-movement.js:147`,
   `free-fight-demo.js:426`) and **does not clear the other** → **duplicate demo overlays** when
   both buttons are used.
5. **No code draws `proposed_units` as individual map markers** — so real units cannot "scatter"
   to the objective; only the demo overlays move.

## Exact file / function

| Concern | File:function |
|---|---|
| Old centroid-glide demo | `client/shell/demo-movement.js` → `centroid()` (L47), `_objective=centroid(_allGroups)` (L77), `g.current=lerp(g.anchor,_objective,_progress)` (L99), `_layer` (L147), marker `rmooz-demo-move-marker` (L~160) |
| New domain-aware demo | `client/shell/free-fight-demo.js` → `selectSample`/`applyPlanToGroups`/`domainize`, `_layer` (L426), marker `rmooz-ff-group` (L440), objective `rmooz-ff-objective` (L430) |
| Both buttons | `client/shell/doc-understanding-review.js:884` (`demo-movement`), `:885/:987` (`free-fight`) |
| Base anchors (real placement) | `client/shell/placement-candidates-panel.js` → `renderMapAnchors` (L104), `render` (L287), class `step1-review-placement-anchor` |
| Proposed-unit → base join | `client/shell/demo-units.js:151 buildGroupsFromAnchors` (joins by `assigned_base_id`/`base_id`/base name) |
| Real scenario units (legacy only) | `server/wargame-sim-bridge.js:1565` / `wargame-local-bridge.js:333` → `PORTER.buildScenarioFromGeoJson`/`writeScenario` → `units-map.js` + milsymbol |

## Marker / layer classification table

| Layer (class) | Source file | What it is | demo_only | Moves? | Domain-aware? |
|---|---|---|---|---|---|
| `step1-review-placement-anchor` | placement-candidates-panel.js | **Real base anchors** (placement_candidates) | n/a (anchor) | no (static) | n/a |
| `rmooz-demo-move-marker` | **demo-movement.js (OLD)** | demo groups gliding to **centroid** | **true** | yes → centroid | **NO** |
| `rmooz-ff-group` | **free-fight-demo.js (NEW)** | demo groups, RED-attack/BLUE-react | **true** | yes → domain target | **YES** |
| `rmooz-ff-objective` | free-fight-demo.js | Objective X marker | n/a | no | n/a |
| (milsymbol unit icons) | units-map.js | **Real scenario units** — only after **legacy** generate/import | false (real) | timeline | n/a |
| Base Status proposed-unit rows | base-status-panel.js | proposed_units **listed under each base** (not map markers) | review_only | no | n/a |

## Before Free Fight table (live: LITE file, after Review render, no demo started)

| Layer | Count |
|---|---|
| base anchors (`step1-review-placement-anchor`) | **12** |
| Base Status proposed-unit rows | per base (opened from an anchor) |
| actual scenario unit markers | **0** (review creates none) |
| demo group markers (`rmooz-demo-move-marker` + `rmooz-ff-group`) | **0** |
| Objective X (`rmooz-ff-objective`) | **0** |

→ Review draws **only the 12 base anchors**. No scattered units, no demo markers, no objective.

## After Free Fight table (live)

| Step | anchors | demo_move (OLD) | ff_group (NEW) | objective |
|---|---|---|---|---|
| A: after Review render | 12 | 0 | 0 | 0 |
| B: + **Demo Movement** (OLD, centroid) | 12 | **5** | 0 | 0 |
| C: + **Free Fight** (NEW, domain-aware) | 12 | **5 (still there)** | **6** | 1 |

→ At C, **both demo overlays coexist** = 11 moving demo markers + 1 objective + 12 anchors.
The OLD 5 converge on the centroid `{26.50, 52.25}`; the NEW 6 follow domain rules.

## Clear / Reset result (live)

- **Free Fight Reset** → `free_fight_reset_returns_to_anchor: true` (groups return to their base anchors).
- **Clear both** → `anchors:12, demo_move:0, ff_group:0, objective:0` → **demo overlays disappear; the 12 base anchors persist.** So demos are transient overlays; the real base placement is untouched by demo clear.

## Payload field mapping table (near-objective marker, live)

Inspected marker near Objective X → class `rmooz-ff-group` (Free Fight demo group):

| Field | Value |
|---|---|
| marker type | demo group (Free Fight) |
| layer | `free-fight-demo.js` `_layer` (`rmooz-ff-group`) |
| label | `▲Iran · holding` |
| id | `DEMOGRP-RED-iran-0` |
| role / country | RED / Iran |
| base_name | **Bandar Abbas AB** (real base) |
| member_ids | 2 (grouped proposed_units) |
| demo_only | **true** |
| review_only | **true** |
| exact_unit_position | **false** |
| route_type | `air_direct` |
| movement_domain | `air` |
| assigned_base_id / base_id / placement anchor | group built from a `placement_candidate` (anchor) via `buildGroupsFromAnchors` join (`assigned_base_id`/`base_id`/name) |
| country_key | from the coalition payload (`iran`) |

→ The near-objective marker is a **demo group**, anchored at a **real base**, grouping real
proposed_units, but flagged `demo_only/review_only/exact_unit_position:false`. It is the overlay,
not a relocated real unit.

## Are actual units wrong, or only the demo overlay expected?

**Only the demo overlay is the moving thing — the actual units are NOT wrong.** Real proposed_units
are never drawn as individual markers; they stay listed under each base (Base Status rows) and
grouped under the 12 base anchors. The demo overlay (whichever button) is an **intentional,
review-only animation** that *starts* from those base anchors and glides — it does not move or
duplicate the real units. So "units should stay grouped under bases" is **already satisfied for the
real data**; the visual confusion is the demo overlay (especially the OLD centroid glide) reading
as if real units moved.

## Why domain-aware / global-symbol did not change actual placement

1. **Actual placement = static base anchors** drawn by `placement-candidates-panel.js`. No demo or
   movement code moves them; `domain-movement`/`symbol-identity` were never about anchor placement.
2. The domain-aware routing + shared symbol resolver were wired into **`free-fight-demo.js` only**.
   The **OLD `demo-movement.js`** (the "Demo Movement" button, centroid glide) was **never** routed
   through `domain-movement.js` or `symbol-identity` → it still glides everything (incl. naval) to
   the centroid with its own glyphs.
3. Demos are **overlays**, separate from the real unit/anchor layers — so fixing demo movement
   could never change real placement (which was already correct).

## Recommended fix (for approval — NOT implemented)

1. **One demo layer, not two.** Either (a) **retire the OLD `demo-movement.js` "Demo Movement"
   button** and keep only the domain-aware "Free Fight Demo", or (b) make mounting one demo
   **clear the other** (`RmoozDemoMovement.clear()` before `RmoozFreeFightDemo.mount`, and vice
   versa) to eliminate duplicate overlays.
2. If "Demo Movement" must stay, **route it through `domain-movement.js`** (no centroid glide for
   naval/support) so both demos behave consistently — or relabel it "Legacy centroid demo".
3. **Visually disambiguate demo vs real:** a small legend on the demo overlay — *"Demo overlay —
   symbolic, not real unit positions; real units remain at their bases."* So operators don't read
   the overlay as relocated units.
4. **Objective X single source of truth** (from `import-ui-cleanup-audit.md`): the demo overlay and
   the review/generate objective should share one `{lat,lon,source_type,needs_review,...}` object.
5. Keep all of it `demo_only/review_only/needs_review/exact_unit_position:false`. No change to real
   placement, no world-state mutation.

**Lowest-risk first step:** option 1(b) — make each demo `mount` clear the other demo's layer
(kills duplicate overlays) — plus the legend (3). Both are presentation/cleanup, reversible.

## Tests to run before implementation

1. Review render draws **only base anchors** (0 demo markers, 0 objective) until a demo is started.
2. `proposed_units` are **never** rendered as individual map markers (guard test).
3. Demo group markers are always `demo_only:true / review_only:true / exact_unit_position:false`.
4. **Only one demo overlay at a time** — mounting Free Fight clears Demo Movement's layer (and vice versa); no duplicate markers.
5. **Clear** removes all demo markers + objective; **base anchors persist** (count stays 12).
6. **Reset** returns demo groups to their base anchors (`current==anchor`).
7. Whichever demo remains is **domain-aware** (naval→coast, support→hold, air→objective) — no centroid glide for naval/support.
8. No regression in the 6 green suites; no world-state mutation; objective is a single shared object.
