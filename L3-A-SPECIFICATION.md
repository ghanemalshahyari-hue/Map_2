# L3-A — "Why-Not" Action Feasibility Evaluator — Specification (Contract)

**Date:** 2026-06-03
**Status:** SPEC — binding contract; **no implementation yet** (review before code, per the DOCTRINE-A discipline)
**Pattern:** Evidence Architecture (expose what's already computed), proven by OBJ-C / DOCTRINE-A
**Ladder position:** L3 "Why can't I do this?" (precedes L3.5 Feasible Alternatives, L4 COA Comparison, L5 Projection)

> **One sentence:** L3-A takes a *proposed action* and returns **"feasible / blocked / risky + why"**, by
> consolidating reasons that **already exist** in the World State (ENG1 reasons, the evidence ledger, DB1
> classes). It performs **no simulation, no prediction, no new math** — it is a read/consolidation layer.

---

## 1. Purpose

RMOOZ can explain the *present state* (OBJ-C) but cannot yet take a *proposed action* and say why it is
blocked or risky. The operator must self-assemble that verdict from scattered evidence. L3-A closes that gap
with one deterministic evaluator, so the operator can answer:

- "Why should I **not attack now**?"
- "Why is this **objective not ready**?"
- "What **risk** comes from contacts / engagement / readiness / supply / doctrine?"
- "What **evidence is missing**?"

It is the prerequisite for L3.5 ("what could I do instead?") — every blocker L3-A surfaces is what L3.5 later
inverts into a feasible alternative. **L3-A only EXPOSES blockers; it does not invert them.**

**Success in one question:** *Given a proposed action, can the operator see — from one place — every reason
it is blocked or degraded, each traced to its source?*

---

## 2. Scope

### In scope
- A pure function **`evaluateAction(ws, action)`** in a new pure module **`client/shell/action-feasibility.js`**
  (`window.AppActionFeasibility`). NOT named `*-engine` (anti-creep, per DOCTRINE-A naming ruling).
- It reads existing World State only and returns a feasibility **finding** (schema §5).
- **L3-A-1 (first slice, smallest):** `action.type === 'ENGAGE'` — pure reuse of ENG1 reasons.
- **L3-A-2 (second slice):** `action.type === 'ATTACK_OBJECTIVE'` — roll-up of existing evidence at
  existing thresholds.
- `test-l3a-why-not.js`.

### Explicitly NOT in scope (later / forbidden)
- **No UI** — rendering is L3-B (separate slice).
- **No feasible-alternative generation** — that is L3.5 (the `inverse` field is reserved but left empty).
- **No simulation / projection / future state** — L3-A asks "can this proceed *right now*", never "what
  happens next" (that is L5).
- **No new thresholds or math** — reuse ENG1 reasons + the cutoffs already in `computeObjectiveStatusDisplay`.
- **No "AI recommendation" wording** — deterministic reason codes only.
- **No Team/Operator assignment, no live mutation, no DB1 rebuild.**

---

## 3. Action Types

An `action` is a plain object describing what the operator is considering. L3-A defines two:

| type | shape | meaning |
|---|---|---|
| `ENGAGE` | `{ type:'ENGAGE', actor_uid, target_uid }` | "Can unit `actor_uid` engage `target_uid` right now?" |
| `ATTACK_OBJECTIVE` | `{ type:'ATTACK_OBJECTIVE', objective_id? }` | "Should I commit to the objective now?" (defaults to first objective) |

The action vocabulary intentionally aligns with WS3 decision types (`ENGAGE`, etc.) so L3-A can later evaluate
any WS3 decision. Other WS3 types (MOVE/SET_EMCON/…) are out of scope for L3-A.

---

## 4. Inputs (existing state only)

Read from the World State snapshot; never from DOM, network, storage, or the raw scenario.

- **ENGAGE:** `AppEngagement.computeEngagements(ws, ws.derived.contacts)` — the per-pair records already carry
  the blocked reason. (Equivalent to the live map's `getEngagements`.)
- **ATTACK_OBJECTIVE:** `ws.derived.objective_evidence` (combat / control / readiness / doctrine / contacts
  records from OBJ-A, READINESS-A, DOCTRINE-A) + `ws.derived.objective_status_display`.
- **Capability classes:** DB1 (`AppWorldStateDB`) as already applied during `deriveWorldState`.

No input is recomputed with new formulas; L3-A consumes what `applyDerivations` already produced.

---

## 5. Output Schema

`evaluateAction` returns ONE finding (or `null` for a degraded/parity-gated `ws`):

```js
{
  action:  { type, actor_uid?, target_uid?, objective_id? },  // echo of the input
  verdict: 'feasible' | 'blocked' | 'feasible_with_risk',
  blockers: [ { code, explanation, source } ],   // hard stops — action cannot proceed
  risks:    [ { code, explanation, source } ],    // soft — proceeds but degraded
  evidence_gaps: [ { code, explanation, source } ] // missing / low-confidence (default 0.5) inputs
}
```

- **`verdict` rule (deterministic):** `blocked` if `blockers.length > 0`; else `feasible_with_risk` if
  `risks.length > 0`; else `feasible`. (No scoring, no weighting.)
- **`code`** is a stable enum (§6). **`explanation`** is a short factual string (no recommendation verbs).
  **`source`** matches the ledger's source vocabulary (`engagement`, `balance_summary`, `bls_status`,
  `ws.units[].readiness`, `ws.doctrine.*`, `contacts`, …).
- **L3.5 HOOK (reserved, empty in L3-A):** each blocker may later gain `inverse: [...]` (feasible
  alternatives). L3-A MUST NOT populate it.

---

## 6. Reason Taxonomy (reused, not invented)

### ENGAGE (L3-A-1) — verbatim from ENG1
| code | from ENG1 | meaning |
|---|---|---|
| `undetected` | no engagement record (detection-gated) | target not currently held by a sensor |
| `out_of_range` | `reason:'out_of_range'` | range > effective weapon range |
| `weapons_hold` | `reason:'weapons_hold'` | WRA/ROE hold |
| `winchester` | `reason:'winchester'` | magazine empty |
| `no_fire_control_channel` | `reason:'no_fire_control_channel'` | no free FC channel |
| *(engaged)* | `status:'engaged'` | → verdict `feasible`, blockers empty, `pk` available |

### ATTACK_OBJECTIVE (L3-A-2) — reuse existing evidence + existing thresholds
| code | severity | source | reused threshold |
|---|---|---|---|
| `force_ratio_below_decisive` | blocker | balance_summary | force_ratio < 2 (from `computeObjectiveStatusDisplay`) |
| `area_contested` | blocker | bls_status | `bls_contested_count > 0` |
| `roe_hold` | blocker | ws.doctrine WCS | weapons_control_status = HOLD (relevant domain) |
| `posture_hold` | risk | ws.units[].posture | majority posture = hold |
| `readiness_degraded` | risk | ws.units[].readiness | combat_readiness_state ≠ ready |
| `supply_low` | risk | ws.units[].supply | supply_sustainability < 0.5 |
| `attrition_high` | risk | balance_summary.losses | casualty_rate ≥ 0.25 (the 25% cutoff) |
| `detection_picture_incomplete` | evidence_gap | contacts | contact_confidence_summary absent / low |

> The 25%/force-ratio-2 values are the SAME ones already in the codebase. **If any ATTACK_OBJECTIVE threshold
> semantics need adjusting, that is an owner ruling — L3-A ships with the existing values, unchanged.**

---

## 7. Fallbacks

- Degraded / parity-gated `ws` (`ws.degraded`, or no evidence ledger) → `evaluateAction` returns `null`
  (no fabricated findings) — same gate as `computeObjectiveEvidence`.
- ENGAGE with unknown `actor_uid`/`target_uid` → `verdict:'blocked'`, blocker `code:'unknown_unit'`.
- Missing evidence for an ATTACK_OBJECTIVE check → that check is **omitted** (or recorded under
  `evidence_gaps`), never guessed.

---

## 8. Forbidden Behaviors (locked)

- ❌ No UI (L3-B) · ❌ no `inverse`/alternatives (L3.5) · ❌ no simulation/projection (L5).
- ❌ No new module named `*-engine`; no `applyAction`/`executeAction`/`recommendAction`.
- ❌ No new thresholds, scoring, weighting, or probability — reuse existing values only.
- ❌ No mutation of `ws`, scenario, `window.units`/`map`/`lines`; no DOM/fetch/storage.
- ❌ No Team/Operator assignment. ❌ No DB1 rebuild.
- ✅ Pure, deterministic, Node-testable read/consolidation only.

---

## 9. Test Plan (`test-l3a-why-not.js`)

- **ENGAGE (L3-A-1):** in-range+detected+ammo+channel → `feasible` (engaged, no blockers); far → blocker
  `out_of_range`; WRA hold → `weapons_hold`; empty magazine → `winchester`; undetected target → `undetected`;
  each blocker's `source==='engagement'`; verdict = `blocked` iff blockers present.
- **ATTACK_OBJECTIVE (L3-A-2):** force_ratio < 2 → `force_ratio_below_decisive` blocker; BLS contested →
  `area_contested`; WCS hold → `roe_hold`; degraded readiness/low supply/high attrition → corresponding
  risks; missing contacts → `detection_picture_incomplete` evidence_gap.
- **Integration:** finding shape exact (no stray keys); `inverse` NEVER populated; verdict rule holds;
  reason codes ⊆ §6 taxonomy; sources ⊆ ledger vocabulary.
- **Purity/parity:** no mutation of `ws` (deep-equal before/after); deterministic (two runs identical);
  degraded `ws` → `null`; ENGAGE blockers map 1:1 to ENG1 reasons (no divergence from the engine).

Run with DB1 + DET1 + ENG1 loaded so contacts/engagements resolve.

---

## 10. Success Criteria

1. `evaluateAction(ws, action)` exists as a pure exported function; new module, not an "engine".
2. L3-A-1 ENGAGE findings derive 1:1 from ENG1 reasons (zero new logic in the engage path).
3. L3-A-2 ATTACK_OBJECTIVE findings fire exactly at the existing thresholds; no new math.
4. Output matches §5; `inverse` reserved-but-empty; verdict rule deterministic.
5. `test-l3a-why-not.js` green; existing suites (ENG1, OBJ-A/B/C, READINESS-A, DOCTRINE-A) unaffected.
6. Boundary clean: no UI, no simulation, no mutation, no team assignment, no DB rebuild.
7. **Value check:** for a blocked action the operator sees a complete, sourced reason list — the input L3.5
   will later invert into alternatives.

---

**L3-A is consolidation + exposure of existing reasons. Inversion (alternatives) is L3.5; comparison is L4;
projection is L5 — not here.**
