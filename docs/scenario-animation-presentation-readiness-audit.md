# Scenario Animation & Presentation Readiness Audit (P0B)

**Type:** audit / design only. No code changes, no new UI, no combat simulation, no scenario mutation.
**Method:** verified against real files — scenario data (`wargame3.json`), render code (`adjudicator-map.js`, `scenario-workspace.js`), and arrow/units layers — not assumptions. Re-runnable fact check: `node test-p0b-animation-readiness.js`.
**Goal it serves:** make any imported scenario show a clear, CMO-style operational animation on the map + timeline.

---

## TL;DR (honest headline)

RMOOZ is **closer to CMO-style operational animation than it looks — for Wargame 3 specifically.** The scenario data is rich and the render layer already does sophisticated, *honest* work: symbols move per step, a single red advance arrow tracks the main effort's current position, a salient polygon dims/dashes/**retracts** by objective status, and per-step engagement arcs are color-coded by outcome and weight-scaled by damage. A re-litigation pass even overrides an incoherent AI "CAPTURED" against the evidence.

**The three real problems:**
1. **Coverage:** all of that rich animation is gated on `schema_variant === "w3-rich"`. Converted Decision Packages and CSP51 scenarios that aren't w3-rich get **markers + movement only** — no arcs, no salient. So "*any* imported scenario animates" is **not yet true.**
2. **Per-unit fidelity:** the data says which units took damage each step (`affected[].damage_pct`/`status_change`), but **individual unit symbols don't visibly degrade or die** during playback — only the aggregate salient/SITREP reflect it. Also missing: movement trails, on-map event pins, on-map phase label, timeline event ticks, before/after compare.
3. **Static units:** imported units **cannot be selected-to-edit, moved, removed, or added** — there is no authoring/edit path and no canonical-JSON export.

None of (1)–(2) requires a combat simulation: the outcomes are **pre-baked in the scenario**. They are render/wiring work. Only true detection/contact modeling is genuinely simulation territory (out of scope).

---

## Q1 — What the scenario currently gives us

Verified on Wargame 3 (17/17 steps populated). Converted Decision Packages carry a subset (see coverage note).

| Data | Present (WG3) | Notes |
|---|---|---|
| Unit initial positions | ✅ | `red_units`, `blue_units_initial` |
| Per-step movement coords | ✅ | `red/blue_unit_step_coords` |
| Movement **trail** coords | ✅ | `red/blue_unit_step_prev` (prev position per step) |
| **Engagement arcs** (attack lines) | ✅ | per step: `actor_uid→target_uid`, `actor_side`, `status_change`, `damage_pct`, **`coordinates [[lon,lat],[lon,lat]]`**, `cause_what`, `cause_doctrine` |
| **Affected units** (damage) | ✅ | per step: `uid`, `status_change`, `damage_pct`, `cause_actor`, `cause_what`, `cause_doctrine` |
| **Actors** (intent) | ✅ | per step: `action_component`, `action_what`, `action_why`, `action_intended_effect`, `action_doctrine_cited[]` |
| Objective status timeline | ✅ | `objective_status_baseline` (DORMANT→THREATENED→CONTESTED→CAPTURED/DENIED) |
| BLS status timeline | ✅ | `bls_status_baseline` |
| Force ratio / red strength / attrition | ✅ | `force_ratio_baseline` (+local/operational), `red_strength_baseline`, `red_degraded_baseline`, `red_losses_cumulative_baseline`, `blue_destroyed_baseline` |
| EW effect | ✅ | `ew_effect_baseline` — a **proxy** for contact/detection, not a true model |
| Phase / time | ✅ | `phase`, `phase_name_ar`, `time_label`, `elapsed_hours`, `kind_native` + top-level `phase_table` |
| Per-step narrative | ✅ | `narrative_en_fallback`, `narrative_ar_fallback` |
| Objective / BLS / pipeline / AO geometry | ✅ | `obj`, `bls_template`, `pipeline`, `ao_boundaries`, `map_bbox` |
| Proposed/effect fields | ✅ | `combined_effect`, `step_advantage`, `decision_point_baseline` |
| ORBAT fields | ✅ | derived from `*_units` uid prefixes (BLUE/RED FORCE tree) |
| Unit roles / domains / echelons | 🟡 | partial on units; `action_component` (land/air/sea) per actor |
| Explicit **detection/contact** model | ❌ | only EW proxy — no sensor/contact state |

**Key insight:** the per-step data already encodes the *entire engagement story* — who hit whom, where (coordinates), how hard (damage_pct), why (doctrine), and the resulting status. The animation problem is mostly **rendering data we already have.**

---

## Q2 — What RMOOZ can already animate

| Capability | Status | Evidence |
|---|---|---|
| Unit movement (symbols step to new coords) | ✅ DONE | `applyStepProgress()` |
| Step playback (play/pause/speed/next/prev) | ✅ DONE | timeline transport → `goToStep()` (P4) |
| Time / phase updates | ✅ DONE | timeline + SITREP banner |
| **Red advance arrow** (directional, tracks main effort) | ✅ DONE | tail=landing BLS, head=main unit's *current* position; tracks step by step |
| **Objective-status salient** (dims/dashes/retracts) | ✅ DONE | `outcomeAccent()`: CAPTURED bold → CONTESTED → THREATENED → DENIED faded-dashed-retracted; `reachFactor` pulls the tip short of OBJ |
| **Honest outcome re-litigation** | ✅ DONE | `deriveDisplayOutcome()` overrides an incoherent AI "CAPTURED" vs evidence (force ratio, blue intact, red spent) |
| **Engagement arcs** (per-step attacks) | ✅ DONE (w3-rich) | `renderEngagementArcs()`: animated dashed LineStrings, color by `status_change`, weight by `damage_pct`, declutter dense phases, fade-out |
| Objective marker + security ring | ✅ DONE | |
| BLS markers + status | ✅ DONE | |
| APP-6 / SIDC symbols (milsymbol) | ✅ DONE | |
| Pipeline / AO geometry | ✅ DONE | |
| ORBAT dock (BLUE/RED tree) | ✅ DONE | P2; cross-scenario refresh |
| Selected unit panel (identity + role/composition) | ✅ DONE | P5a/P5b |
| Live event log | ✅ DONE | tabular ops ledger |
| Force balance / attrition / tempo cards | ✅ DONE | per-step baselines |
| Legend + SITREP banner | ✅ DONE | |
| Map layer control (basemap) + live-overlay toggle | 🟡 PARTIAL | `layerControl` + overlay toggle exist; no per-animation-layer toggles |

**Reusable arrow/animation assets not yet wired to scenario data:** `AppArrowAnim` (animated arrows), `ManeuverArrow` (operator maneuver-arrow tool), `free_draw_signature` (flank arrows), `L.polyline`.

---

## Q3 — What is missing to tell the story clearly (classified)

Classification: **DATA** (field absent) · **UI** (no control/view) · **ANIMATION/RENDER** (data+primitive exist, not drawn/wired) · **AUTHORING** (needs edit mode) · **SIMULATION** (needs a model RMOOZ deliberately doesn't have).

| Item | Status | Classification |
|---|---|---|
| Attack arrows | ✅ drawn (w3-rich) | **RENDER refine** — add directional arrowheads (currently dashed lines, color=side/outcome; "no chevrons" by design). Direction is inferable from data but not from a glyph. |
| Counterattack arrows | ✅ drawn (w3-rich) | same — distinguished by `actor_side` color, not a distinct graphic |
| Direction of movement (main effort) | ✅ red advance arrow | DONE for main red unit; **per-unit** direction = RENDER missing |
| **Damage / degraded visual state (per unit)** | ❌ | **ANIMATION/WIRING** — `affected[].damage_pct` + `UNIT_STATUS`/`applyState` exist; playback doesn't feed affected→icon |
| **Destroyed / disabled state (per unit)** | ❌ | **ANIMATION/WIRING** — `blue_destroyed`/`status_change:"destroyed"` in data; symbols don't disappear/cross out |
| Contact / detection state | ❌ | **DATA + SIMULATION** — only EW proxy; no sensor/contact model (out of scope) |
| Objective captured/contested/denied visual | ✅ salient reflects it | DONE via salient/colors; **objective marker icon swap** = minor RENDER refine |
| Phase annotations (on map) | ❌ | **RENDER** — timeline/SITREP show phase; map canvas has no phase banner |
| Unit trails / breadcrumbs | ❌ | **RENDER** — `*_step_prev` + `L.polyline` exist; no persistent trail drawn (prev used only as move-start) |
| **Event markers on map** | ❌ | **RENDER** — `engagement_arcs`/`affected` carry coords + `cause_*`; no persistent clickable event pins |
| Timeline event highlights | ❌ | **UI** — no event ticks on the scrubber |
| Before/after state comparison | ❌ | **UI** — no A/B step diff view |
| Map layer toggles (arcs/trails/objective on-off) | 🟡 | **UI** — layer-control infra exists; per-animation-layer toggles missing |
| Manual unit reposition / edit / remove | ❌ | **AUTHORING** — see Q6 |
| Scenario authoring controls | ❌ | **AUTHORING** — P0 data foundation done; no UI |
| **Non-W3 scenarios get arcs/salient** | ❌ | **RENDER/DATA** — gated on `w3-rich`; non-W3 imports need either producer-emitted arcs, an authoring step, or a fallback renderer |

**Almost nothing here is "simulation missing."** Outcomes are pre-baked; the work is render/wiring + authoring. Only true detection/contact is simulation territory.

---

## Q4 — Higher-command presentation assessment (Wargame 3)

**What looks strong (show with confidence):**
- A real moving operational picture: symbols advance, the red main-effort arrow tracks step by step, the salient swells/retracts with the fight.
- Honest adjudication: the display re-litigates an incoherent AI "CAPTURED" — the map shows what the *evidence* supports, which is exactly the credibility a command audience demands.
- Engagement arcs convey tempo and intensity (color by outcome, thickness by damage) without clutter.
- Solid supporting furniture: APP-6 symbology, ORBAT, SITREP, force/attrition/tempo cards, bilingual AR/EN, clickable unit panel.

**What looks confusing:**
- Arcs are dashed lines without arrowheads — a viewer can't instantly tell attacker→target direction from the glyph; arc colors aren't explained by an always-visible legend.
- Units that get hit don't change — the salient says "Red denied" while every red symbol still looks pristine. The eye expects attrition to show on the units.
- "Where did that unit come from?" — no trail.

**What looks unfinished:**
- No on-map phase label (you read phase off the timeline, not the map).
- No event pins to click ("what happened here, and per which doctrine?") even though the data carries `cause_what`/`cause_doctrine`.
- No before/after step compare; no timeline event ticks.

**What is missing for operational trust:**
- **Per-unit attrition truth** — command must see *which* units degraded/were lost, not just an aggregate.
- **Provenance on demand** — click an engagement and see actor, target, cause, doctrine cited (data exists).
- **Coverage** — a non-W3 scenario presents as bare markers; the briefer must know which scenarios get the full picture.

**Improve before calling it operational-grade:**
1. Per-unit damage/destroyed visuals (wire `affected[]` → symbol state during playback).
2. Always-on arc/symbol legend + directional arrowheads.
3. Event pins with provenance popups.
4. A non-W3 fallback (at minimum movement + a clear "limited animation — scenario lacks engagement data" notice).
5. On-map phase banner + timeline event ticks.

**Honest verdict:** **Strong, credible demo for Wargame 3** today; **not yet operational-grade across arbitrary imported scenarios.** Do not over-claim universality.

---

## Q5 — Graphics / layers audit (reuse vs new)

**Reuse as-is:** SIDC/APP-6 symbol factory · objective marker + ring · BLS markers · pipeline/AO geometry · legend + SITREP · ORBAT dock · selected-unit panel · event log · timeline transport · force/attrition/tempo cards · `L.polyline` · `layerControl`.

**Reuse but wire to scenario data (assets exist, not connected):**
- `AppArrowAnim` / `ManeuverArrow` → render `engagement_arcs` with **directional arrowheads** + a non-W3 fallback.
- `*_step_prev` + `L.polyline` → **movement trail** layer.
- `UNIT_STATUS` + `applyState` (DEGRADED/DESTROYED/DISPLACED already modeled) → drive **per-unit** state from `affected[]` during playback.
- `outcomeAccent` colors → extend to the **objective marker** itself, not just the salient.

**New layer types needed:**
1. **Movement-trail layer** (fading breadcrumb per unit).
2. **Per-unit attrition overlay** (damage ring / dimmed / crossed-out / removed).
3. **Event-marker layer** (clickable pins from `engagement_arcs`/`affected` coords → provenance popup).
4. **On-map phase banner** (corner annotation).
5. **Animation layer-toggle group** (arcs / trails / events / objective on-off), reusing the existing layer-control pattern.
6. **Timeline event-tick** decoration + optional **before/after step compare** panel.

---

## Q6 — Static-unit authoring gap (requirements + safest phased approach)

**Problem (confirmed):** imported scenario units are **display-only**. Scenario (adjudicator) markers have **no `draggable:true`**; there is **no select-to-edit, move, remove, add, save, or canonical-JSON export** path.

**Reusable foundation that already exists:**
- `AppUnitsMap` (operator units layer) has `beginPlacement`, `addOrUpdateMarker`, `removeMarker`, `nudgeAwayFromOthers` — a working **place / edit / remove** API (for operator-drawn units).
- P5a: scenario markers already emit `rmooz:unit-selected` → unit panel (selection plumbing exists).
- **P0 authoring foundation** (`scenario-authoring-schema.js`): standard template, gap-fill, diagnostics, and a **safety guard** — the data/validation backbone for save/export.

**Requirements for future Authoring Mode:**

| Capability | Requirement | Reuse |
|---|---|---|
| Select unit | click scenario symbol → editable selection | P5a selection event ✅ |
| Drag / move | drag symbol → update draft coords (snap/nudge optional) | `AppUnitsMap` drag/`nudgeAwayFromOthers` pattern |
| Edit properties | side, role, domain, echelon, label, status | unit panel (read-only today) → editable form |
| Remove | delete from draft | `removeMarker` pattern |
| Add | place new symbol with SIDC | `beginPlacement` pattern |
| Save draft | persist working copy (in-memory/local) — **never** mutate live scenario | P0 `fillScenarioAuthoringGaps` (copy-on-write) |
| Validate | block unsafe/incomplete drafts | P0 `isScenarioAuthoringDraftSafe` + `diagnose…` ✅ |
| Preview changes | render draft through existing read-only playback | reuse `drawScenario`/`applyStepProgress` |
| Undo / redo | draft history stack | **new** |
| Export / load canonical JSON | round-trip to RMOOZ Live Scenario JSON | **new** (no exporter exists today) |

**Safest phased approach (authoring track — separate from this animation track):**
- **A1** — *Edit Mode shell + selection*: explicit Authoring Mode toggle (off by default), reuse P5a selection, **no writes yet**. Make scenario markers draggable **only in edit mode**.
- **A2** — *Move + property edit*: drag→draft coords, editable unit form; writes to an **in-memory draft only** (live scenario untouched), validated by P0 guard.
- **A3** — *Add / remove + undo*: placement, deletion, draft history.
- **A4** — *Save / Export + "New from template" / "Fill standards"*: canonical-JSON exporter + P0 template/gap-fill UX.

**Hard boundary preserved:** authoring edits operator **draft data** only. It never touches the live scenario in place and never crosses the locked AI/sim no-mutation boundary (operator authoring ≠ AI commit). Validate every draft with `isScenarioAuthoringDraftSafe`.

---

## Recommended next PR sequence

Two independent tracks. Both are render/data/UI — **neither needs combat simulation.**

**Animation track (presentation polish — biggest demo payoff first):**
1. **PR-AN1 — Per-unit attrition visuals.** Wire `affected[].damage_pct`/`status_change` → unit symbol state (DEGRADED/DESTROYED) during playback. *Highest trust payoff; data + `applyState` already exist.*
2. **PR-AN2 — Event pins + provenance popups.** Clickable markers from `engagement_arcs`/`affected` → actor/target/cause/doctrine.
3. **PR-AN3 — Arc legibility.** Directional arrowheads + always-on arc/symbol legend.
4. **PR-AN4 — Movement trails** (fading breadcrumb from `*_step_prev`).
5. **PR-AN5 — On-map phase banner + timeline event ticks.**
6. **PR-AN6 — Non-W3 fallback renderer** + "limited animation" notice (closes the coverage gap so *any* import animates at least at marker/movement level honestly).
7. **PR-AN7 — Animation layer-toggle group** + optional before/after step compare.

**Authoring track (A1→A4 above)** — sequence after, or interleave A1/A2 with PR-AN1/AN2.

**Suggested order for the Monday-style demo:** PR-AN1 → PR-AN2 → PR-AN3 give the largest visible credibility gain for Wargame 3; PR-AN6 is the priority if non-W3 scenarios must also be shown.

---

## Re-running the audit

```
node test-p0b-animation-readiness.js
```
Prints the verified DATA / RENDER / WIRING / COVERAGE / CLASSIFICATION inventory this report is built from. Read-only.
