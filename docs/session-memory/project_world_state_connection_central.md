---
name: project-world-state-connection-central
description: AUTHORITATIVE architecture direction — World State must become the single live source of truth; no new subsystem gets built until the World State path is proven. Every feature must pass the 4 connection questions.
metadata:
  node_type: memory
  type: project
---

**Authoritative direction (set by owner, supersedes prior "build the next CMO feature" and "wire the next orphaned engine as a read-only overlay" framing).**

RMOOZ = **Regional Operational Simulator + World State + AI Decision Support +
Operator Review + Operational Visualization.** Inspired by CMO, NOT cloning it
feature-for-feature. The CMO rules library (`docs/cmo-functional-rules/`) is a
**behavior reference / operational-knowledge source, not a feature checklist.**

**The central architecture problem (confirmed by the 2026-06-02 audit):** the
engines already exist (Scenario Authoring, Visualization, AI Adjudication, DB1,
DET1, ENG1, WS1, WS3) — the problem is **World State is not connected to the live
app.** `world-state.js` (WS1) and `world-state-transition.js` (WS3) are NOT loaded
in `app.html`; `adjudicator-map.js` never calls `deriveWorldState`/`applyDecision`;
the live renderer's source of truth is `window.RmoozScenario` + pre-baked per-step
baselines. The app is today a **replay viewer with optional AI narration**, not a
simulator. Two parallel state models coexist, unconnected.

**Target pipeline (World State = single source of truth, no parallel models, no
duplicated logic):**
Scenario → World State → Detection → Engagement → Decision → State Transition →
Visualization → Operator Review.

**Owner-approved build order (2026-06-02):** WS2 (✅ DONE, committed `848e029` —
WS1 loaded in app.html, live snapshot per step in `applyState`, objective status
read from World State via `deriveDisplayOutcome`, `getWorldState()` exposed,
test-ws2-live-integration.js 18/18, browser-verified) → **WS2.5 (✅ DONE, committed
`903e72d`)** = the production objective-status evidence rule RELOCATED into World
State as a GENERIC derived-field pattern: `world-state.js` has a `DERIVATIONS`
registry `{ field -> pure (ws)->value }` + `applyDerivations(ws)` runner;
`objective_status_display` is the first rule (relocated verbatim, no new formula).
`deriveWorldState` runs them; `applyState` projects live inputs (`balance.force_ratio`
+ `balance.losses`) then calls `applyDerivations`; renderer reads the WS-computed
value (inline rule kept only as WS-absent fallback). World State now OWNS this
derivation (read-only; `state` still owns raw inputs until WS4). **Future derived
fields (balance/threat/control/readiness/…) add ONE row to DERIVATIONS — do NOT
build one-off per-field plumbing.** test-ws2_5 20/20, browser-verified. WS3 (manual
mutation/decision) was DEFERRED in favour of this read-only derivation. → **WS4-Balance
(✅ DONE, committed `f85ed51`)** = force ratio + losses now COMPUTED from World State
units (`computeBalanceSummary` → `derived.balance_summary`, registered in DERIVATIONS
BEFORE the objective rule); objective rule consumes computed evidence with the `state`
mirror as parity fallback. **Echelon weights live behind `getUnitOperationalWeight(unit)`
(owner ruling) so DB2 swaps the source without touching balance math — do NOT inline
weights.** Chain is now **Units → Balance → Objective Status → Visualization** (first
real WS simulation pipeline). Parity is STRUCTURAL: rule uses FR/losses only in the
CAPTURED branch + W3 has 0 CAPTURED baseline steps → no-op for replay. test-ws4-balance
24/24, browser-verified. → **NEXT (planned, not built): WS-BLS** = derive BLS status
from per-beach local balance (reuse `computeBalanceSummary` scoped via nearest-beach
assignment) through DERIVATIONS; parity via **authored-wins** gate (W3 authors per-BLS
status → display==authored==byte-identical); reactive color on unauthored/toggle. First
inversion with VISIBLE reactive behavior. → **WS3 (if still wanted) = World State live
participant** (mutation/applyDecision — touches AI/sim boundary) → **DB2 = capability
data becomes AUTHORED data** → **MTH1 = Mathematical Rules Layer** ([[project-math-realism-rules]],
only on live WS) → **DOC1 = Doctrine data layer** → **Personnel / Maintenance /
Reliability / Fatigue / Supply** (last). Do NOT jump ahead; each step is plan-then-approve.

**HARD RULE — gate every proposed feature with these 4 questions. If "no," it is
probably not the next priority:**
1. Does it connect to World State?
2. Does it update World State?
3. Does it read from World State?
4. Does it make the scenario more alive?

**Do NOT build** new simulation / personnel / fatigue / maintenance / reliability /
doctrine / ROE / logistics / event / AI subsystems **until it is clear they operate
on a live World State.** No new major subsystem before the World State path is proven.

**Guiding question for "what's next":** not "which CMO feature?" but **"what is the
next thing that makes the scenario feel alive?"** — answered through the pipeline above.

**Ownership migration (owner-approved design, do not deviate):** there are exactly
TWO state objects — `state` (per-step object passed to `applyState`, today's owner)
and World State (`AppWorldState.deriveWorldState` snapshot). NEVER introduce a third
("render model"). Destination = **World State owns; `state` becomes a projection of
it**. Phases: **WS2** = `state` still owns, World State is a read-through MIRROR, and
the renderer's READ SITE moves to World State ONCE and never again. **WS4** = invert the
fill direction field by field (objective status → BLS → phase-line → balance/losses):
World State owns, `state.field` derived from it. **Final** = World State single owner;
`state` = `project(WorldState)` compatibility view, retired as legacy readers migrate.
The transitional reconciliation lines INVERT at WS4 (flipped, not rebuilt). This is why
WS2-as-mirror is NOT a throwaway: the read seam + WS1 snapshot are permanent; only the
fill direction inverts. No big-bang rewrite — `state` degrades owner → mixed → projection
so legacy readers keep working throughout.

Relates to [[project-engine-layer-wiring]] (the orphaned engines this connects),
[[project-math-realism-rules]], [[feedback_ranges_from_db_not_invented]],
[[feedback_keep_cesium_3d_in_sync]]. Session log: [[session_2026-06-02_night]].
