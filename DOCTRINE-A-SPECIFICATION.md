# DOCTRINE-A — Specification (Contract)

**Date:** 2026-06-03
**Status:** SPEC — the binding contract for the DOCTRINE-A implementation
**Pattern:** Evidence Architecture (source → ledger → visibility → operator), proven by OBJ-A/B/C + READINESS-A
**Supersedes for implementation:** `DOCTRINE-EVIDENCE-PLANNING.md` (kept for design rationale; this file is the contract the code + tests must satisfy)

> **One sentence:** DOCTRINE-A makes the doctrine *currently governing the force* **visible as evidence** — it
> does **not** make doctrine *do* anything. It is a SOURCE layer, never a behavior engine.

---

## 1. Purpose

The operator can today see *combat*, *readiness*, *control*, and *contacts* evidence behind an objective's
status (OBJ-C panel). They **cannot** see the doctrine environment — what ROE / weapons-control / EMCON
state and unit doctrine classification are in force right now. DOCTRINE-A closes that gap by adding a
**doctrine evidence contributor** to the existing `objective_evidence` ledger and surfacing it in the
already-reserved **Doctrine** group of the OBJ-C panel.

**Success in one question (the value audit):**
*"Can the operator explain what doctrine is governing the force right now?"* If yes → DOCTRINE-A is complete.

---

## 2. Scope

### In scope (this PR)
- A pure function `computeDoctrineEvidence(ws, objId, step)` in `client/shell/world-state.js`.
- It is **called from inside** `computeObjectiveEvidence(ws)` — its records are pushed into the same flat
  ledger array. It does **not** get its own `DERIVATIONS` row and does **not** create a new module.
- Two **minimal, pure projection additions** to `deriveWorldState` so doctrine has a real read path
  (see §4): `unit.posture` and a top-level `ws.doctrine`. These are read-only echoes of the scenario;
  they add no behavior and no mutation.
- Extend the OBJ-C panel: fill the reserved `EVIDENCE_GROUPS.doctrine.types`, add `EVIDENCE_LABELS`, and
  add an array-formatting branch for `doctrine_tags`.
- `test-doctrine-evidence.js` (see §9).

### Explicitly NOT a module
We use `computeDoctrineEvidence()` inside the proven evidence pipeline — **not** `shell/doctrine-engine.js`.
The name "engine" invites ROE/WRA/targeting/engagement-modifier logic to accrete, which would violate the
locked AI/sim boundary. Keeping it a *contributor function* structurally enforces "evidence, not behavior."

### Out of scope (later phases — do NOT build here)
`applyDoctrine()` / `evaluateDoctrine()` / `doctrineDecision()`; `engagementModifier` / `targetPriority` /
`WRASelection`; salvo sizing, proficiency modifiers, OODA timing, identification logic; any change to
`objective_status_display`, engagement outcomes, readiness, or contacts. These belong to DOCTRINE-B
(consumer refactor), DOCTRINE-C (interpretation: WRA/targeting), DOCTRINE-D (AI), and MTH1.

---

## 3. Evidence Types (9)

Aggregated per objective (the ledger key is the first objective's id, matching the other contributors).
Unit-level aggregates are computed over **BLUE** units (the operator's force), consistent with READINESS-A.

| # | evidence_type | value shape | source | conf (authored) | conf (default) | fallback |
|---|---|---|---|---|---|---|
| 1 | `unit_doctrine_tags` | array of unique tag strings | `ws.units[].doctrine_tags` (DB1) | 0.95 | — | `[]` |
| 2 | `unit_echelon_level` | string (dominant echelon) | `ws.units[].echelon` | 0.95 | — | `null` (conf 0.5) |
| 3 | `unit_posture_state` | enum `active\|defensive\|hold\|retire` | `ws.units[].posture` | 0.85 | — | `active` (conf 0.5) |
| 4 | `side_weapons_control_status` | `{air,surface,subsurface}` of `FREE\|TIGHT\|HOLD` | `ws.doctrine.weapon_control_status` | 0.95 | 0.5 | `{air:FREE,surface:FREE,subsurface:HOLD}` |
| 5 | `side_emcon_status` | enum `active\|restricted\|emcon-silent\|enhanced` | `ws.doctrine.emcon` | 0.9 | 0.5 | `active` |
| 6 | `side_engage_ambiguous` | boolean | `ws.doctrine.engage_ambiguous` | 0.95 | 0.5 | `false` (conservative) |
| 7 | `unit_doctrine_inheritance_scope` | enum `side\|mission\|unit` | inferred (role/echelon) | 0.8 | — | `side` |
| 8 | `objective_doctrine_priority` | enum `primary\|secondary\|tertiary\|hold` | `ws.objectives[].doctrine_priority` or CMO default | 0.7 | — | `secondary` |
| 9 | `doctrine_compliance_summary` | `{compliant_unit_count,non_compliant_unit_count,doctrine_constraints_active}` | aggregate | 0.75 | — | `{...,0,[]}` |

**Default vs fallback:** for side-level doctrine (4/5/6) a *default* is used when the scenario has no
`doctrine` object (true for Wargame 3 today) — confidence drops to **0.5** and the `source` string is
suffixed `(default — no scenario doctrine)` so the operator sees it is assumed, not authored. Types 1–3, 7–9
always emit (their inputs exist on every snapshot).

---

## 4. Inputs

Read **only** from the World State snapshot — never from the raw scenario, DOM, network, or storage.

- `ws.units[]` — `doctrine_tags` (added by DB1 `enrichWorldState`), `echelon`, `posture`, `role`, `side`, `off_map`.
- `ws.doctrine` — `{ weapon_control_status, emcon, engage_ambiguous, ... }` (side/scenario doctrine).
- `ws.objectives[]` — `doctrine_priority` (optional).
- `ws.meta.step_index` — for `step_index` stamping.

**Required minimal projection additions** (read-only, in `deriveWorldState` / `projectUnit`):
1. `projectUnit` returns `posture: u.posture || null` (today W3 → `null` → fallback `active`).
2. `ws` carries `doctrine: obj(scn.doctrine)` (today W3 → `{}` → defaults for 4/5/6).

Ground-truth note: the snapshot has **no `ws.scenario` / `ws.sides`** (contrary to the older planning doc);
`ws.doctrine` is the single sanctioned read path added here. Wargame 3 carries no doctrine fields, so 4/5/6
will be defaults until the authoring editor adds a Doctrine section (Edit Mode Step 5).

---

## 5. Outputs

A flat array of evidence records appended to `ws.derived.objective_evidence`. Every record has the **exact
6-field shape** used by all existing contributors — no extra keys, no nesting beyond `value`:

```js
{ objective_id, evidence_type, value, source, confidence, step_index }
```

No record carries weights, scores, rankings, or decisions. `value` is a classification, read, or count only.

---

## 6. Fallbacks

- Missing side doctrine (`ws.doctrine` empty) → liberal/conservative defaults per §3, confidence 0.5,
  source suffixed `(default — no scenario doctrine)`.
- `posture` null/absent → `active`, confidence 0.5.
- No echelon resolvable → `null`, confidence 0.5.
- No BLUE units (degraded/empty) → unit-level aggregates (1,2,3,7,9) are **omitted** (no fabricated rows),
  side-level (4,5,6) and objective priority (8) still emit from `ws.doctrine` / defaults.
- Parity gate: `computeObjectiveEvidence` already returns `null` for `ws.degraded` — doctrine inherits this,
  so non-W3 / degraded scenarios produce no doctrine evidence (no behavior change anywhere).

---

## 7. Confidence Rules

Confidence encodes **provenance certainty, not importance** (it never weights a decision — there are no
decisions here):
- `0.95` — directly authored / DB1-classified facts (tags, echelon, WCS authored, engage_ambiguous authored).
- `0.85–0.9` — authored but mutable / partial (posture, EMCON).
- `0.7–0.8` — inferred or CMO-convention defaults (inheritance scope, objective priority, compliance summary).
- `0.5` — a hard-coded default stood in for an absent scenario field (signals "assumed, verify in authoring").

All confidences are in `[0,1]` (asserted in tests).

---

## 8. Forbidden Behaviors (locked)

- ❌ No new module / no `doctrine-engine.js`.
- ❌ No `applyDoctrine` / `evaluateDoctrine` / `doctrineDecision`.
- ❌ No `engagementModifier` / `targetPriority` / `WRASelection` / salvo sizing.
- ❌ Do NOT change `objective_status_display`, engagement outcomes, readiness, contacts, or balance.
- ❌ No mutation of `ws` inputs, the scenario, `window.units`/`map`/`lines`, DOM (beyond the read-only panel),
  fetch, or storage.
- ❌ No consumption of doctrine evidence for any behavior (that is DOCTRINE-B/C, gated separately).
- ✅ Storage + display of doctrine evidence ONLY.

---

## 9. Test Plan (`test-doctrine-evidence.js`)

Target ~96 assertions, mirroring READINESS-A's structure:
- **Core (9 types):** for each type — record present (when inputs exist), value type/enum valid, source
  correct, confidence in range + matches §3, deterministic across two runs, fallback path exercised.
- **Integration (8):** every doctrine record has `objective_id`, `step_index`, confidence ∈ [0,1]; the 6-field
  shape (no extra keys); **no weights/scoring**; `objective_status_display` byte-identical with vs without
  doctrine evidence (parity gate); engagement outcomes unchanged; no mutation of `ws`.
- **Regression (6+):** steps 0..N all emit doctrine evidence; tags/WCS/EMCON stable across steps; degraded
  scenario → no doctrine evidence; existing suites (OBJ-A widened, OBJ-B, OBJ-C, READINESS-A) still green.

Run with DB1 loaded (`require('./UI_MOdified/client/shell/world-state-db.js')`) so `doctrine_tags` enrich.

**Note on OBJ-A (Drift D4):** `test-obj-a.js` freezes an allowed-set of sources/types. DOCTRINE-A (like
READINESS-A before it) adds new ones. Resolving D4 = widen that whitelist to include the readiness + doctrine
sources/types. This spec authorizes that one-line test update as part of DOCTRINE-A.

---

## 10. Success Criteria

1. `computeDoctrineEvidence` exists as a contributor function (not a module); exported for tests.
2. All 9 types emit per the §3 contract with correct fallbacks/confidence.
3. Doctrine records appear in `ws.derived.objective_evidence` and render under the OBJ-C **Doctrine** group.
4. `objective_status_display` and engagement outcomes are **unchanged** (parity proven in tests).
5. `test-doctrine-evidence.js` green; OBJ-B / OBJ-C / READINESS-A / WS-ENG1-A still green; OBJ-A green after
   whitelist widen (D4 resolved).
6. **Value audit PASSES:** on a scenario with doctrine fields the operator can read ROE/WCS/EMCON + unit
   doctrine classification in the panel and answer *"what doctrine governs the force right now?"*. On W3
   (no doctrine authored) the panel honestly shows defaults at 0.5 confidence labelled as assumed.

---

**DOCTRINE-A is classification & storage + display. Interpretation is DOCTRINE-B/C/D — not here.**
