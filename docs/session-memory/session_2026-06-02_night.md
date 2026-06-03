---
name: session_2026-06-02_night
description: Session 02/06/2026 (night) — RMOOZ current-state audit + World State connection (WS2 → WS2.5 → WS4-Balance) wired, tested, browser-verified, pushed to map2/main; WS-BLS planned (not built).
metadata:
  node_type: memory
  type: project
---

**Session 02/06/2026 (night) — branch `main`, pushed to `map2/main`.** The night World State
became the live source of truth for objective status. Summary so "show me my last session" surfaces it.

## 1. Current-state audit (brutally honest, evidence-based)
Full RMOOZ audit vs. direction. Headline finding: **the engines existed but World State was ORPHANED**
— `world-state.js` (WS1) + `world-state-transition.js` (WS3) were NOT loaded in `app.html`;
`adjudicator-map.js` read `window.RmoozScenario` + pre-baked per-step baselines, never `deriveWorldState`.
The app was a **replay viewer with optional AI narration**, not a simulator. Personnel/readiness/supply
= dead fields or roadmap-only. Doctrine/ROE = prompt-prose + validator code, not data.

## 2. Direction codified (authoritative, owner)
World State must become the **single live source of truth**; no new subsystem until that path is proven.
Gate every feature with the **4 connection questions** (connects/updates/reads/alive?). Target pipeline:
Scenario → World State → Detection → Engagement → Decision → State Transition → Visualization → Operator
Review. See [[project-world-state-connection-central]]. Math-realism rules (no hidden/magical math; every
formula simple/documented/explainable/editable/connected to WS) recorded in [[project-math-realism-rules]].

## 3. Ownership-migration design (owner-approved)
Two state objects only (`state`, World State); never a third. WS2 = `state` owns, WS mirrors (read seam
built once, never moves). WS4 = invert the fill direction field-by-field. Final = World State owns,
`state` = projection. The read site + WS1 snapshot are permanent; only the fill direction inverts.

## 4. Built, verified, pushed (3 commits on `main`)
- **WS2** `848e029` — WS1 loaded in `app.html`; live snapshot per step in `applyState`; objective status
  read from World State via `deriveDisplayOutcome`; `getWorldState()` exposed. test-ws2 18/18.
- **WS2.5** `903e72d` — objective-status evidence rule RELOCATED into World State as a **generic
  `DERIVATIONS` registry** `{ field -> pure (ws)->value }` + `applyDerivations` runner;
  `objective_status_display` is the first rule (verbatim, no new formula). Renderer reads the WS-computed
  value (inline rule kept only as WS-absent fallback). test-ws2_5 20/20 (incl. 300-cell equivalence).
- **WS4-Balance** `f85ed51` — force ratio + losses now **COMPUTED from World State units**
  (`computeBalanceSummary` → `derived.balance_summary`, registered BEFORE the objective rule); objective
  rule consumes computed evidence with the `state` mirror as parity fallback. Echelon weights live behind
  **`getUnitOperationalWeight(unit)`** so **DB2 swaps the source without touching balance math (owner
  ruling — do NOT inline weights)**. Chain now **Units → Balance → Objective Status → Visualization** =
  the first real WS simulation pipeline. test-ws4 24/24. **Parity is STRUCTURAL** (rule uses FR/losses
  only in the CAPTURED branch; W3 has 0 CAPTURED baseline steps → no-op for replay).
- All browser-verified on the `rmooz-web-verify` server (port 8001), zero console errors. Regressions
  green throughout (WS1 25, coverage-rings 41, PR-288M).
- Also committed + pushed: pending Wave-4 `APP_INVENTORY.md` audit refresh (`53e705e`) and runtime data
  artifacts (`c2a18a5`).

## 5. Planned, NOT built (awaiting approval)
**WS-BLS** — first ownership inversion that produces *visible reactive behavior*: derive BLS status from a
per-beach **local balance** (reuse `computeBalanceSummary` scoped via nearest-beach assignment) through
the DERIVATIONS pattern. Parity via **authored-wins** gate (W3 authors per-BLS status every step → display
== authored → byte-identical); derived value shown as shadow (tooltip + off-by-default "Model BLS" toggle),
and drives color fully on unauthored/built scenarios. Open decision: tooltip model-read always vs. toggle-gated.

## Next candidates (ranked by simulation value, owner gates apply)
1. **WS-BLS** (planned above) — highest-value reactive inversion achievable now.
2. **Contact confidence** (P2) — living sensor picture; needs WS units enriched (DB1 exists; no DB2).
3. Cosmetic cluster (FR/losses SITREP display, ew/logistics/decision_point/clock) — low value.
**Do NOT yet:** AI · doctrine · personnel/maintenance/reliability/fatigue/supply · threat/control formulas
· DB2. Keep moving toward **World State = single source of truth** before more realism layers.
Inventory still overstates WS connectivity — correct in a later inventory pass (parked by owner).
