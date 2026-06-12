# Known Issues

Pre-existing defects in the RMOOZ codebase. Each entry includes the symptom,
how to reproduce, the confirmed scope, and whether it blocks production use.
Open items are tracked here so reviewers can distinguish *new* regressions
introduced by a PR from *pre-existing* failures inherited from the baseline.

---

## KI-1 — `wargame1` baseline violates BLS-4 never-SECURE invariant

**Status:** Open. Pre-existing on `main` before any AI/Sim boundary work
or Operational Shell work. **Not fixed in PR-1.**

**Symptom**

```
$ node UI_MOdified/scripts/test-scenarios.js
[FAIL] wargame1            BLS-4 was SECURE on at least one step
                           (item #11 invariant)
[PASS] wargame2            DENIED, PL=84, blue_destroyed=21
```

**Affected files**

- `UI_MOdified/data/scenarios/wargame1.json` — the baked-in step rows for
  this scenario contain at least one step where `bls_status['BLS-4']`
  evaluates to `SECURE`.
- `UI_MOdified/scripts/test-scenarios.js` — the regression harness that
  detects the violation (the `blsSecureSeenForBls4` flag at lines ~70–73).

**The invariant being violated**

`BLS-4` is flagged `permanently_limited: true` in every scenario's
`bls_template`. Item #11 of the project's doctrinal checklist (the
"never-SECURE" rule, encoded in `UI_MOdified/server/ai/adjudicator-validator.js`
around the BLS doctrine block) states that a permanently-limited beach
landing site must never reach `SECURE` status. The validator soft-clamps
such violations at runtime when the LLM emits them, but the *baked-in*
step baselines for `wargame1` ship with the violation already present,
so the regression harness reads them back unchanged and flags the failure.

**Why this is not fixed in PR-1 / PR-1.5**

- PR-1 (Operational Shell Foundation) is presentation-only: classification
  bars, clock, coord readout, side picker, `sides[]` + `postures[][]`
  default-fill. None of those changes touch the scenario engine.
- The AI/Sim boundary PR (Step 1) is structural: it adds the
  propose/commit contract and the journal. It explicitly preserves the
  validator's current silent-clamp behavior inside the legacy shim
  (per user decision), so no scenario semantics changed.
- A fix requires either re-running the W1 port script with a corrected
  source, or hand-editing the baked baselines — either way, scenario-
  content work that belongs to a separate PR.

**Workaround for CI**

Treat `wargame1` as `expected_fail` in any gating script. `wargame2` and
`wargame3` are clean and should pass; `wargame2` is the load-bearing
regression for boundary work.

**Verification that this is pre-existing**

```
$ git stash && node UI_MOdified/scripts/test-scenarios.js && git stash pop
[FAIL] wargame1            BLS-4 was SECURE on at least one step
[PASS] wargame2            DENIED, PL=84, blue_destroyed=21
```

The failure reproduces with all PR-1 / boundary changes stashed away.

---

## KI-2 — Scenario markers do not emit `rmooz:unit-selected`

**Status:** Open. Deferred — do not fix in isolation.

**Symptom**

Scenario markers rendered by `adjudicator-map.js` do not emit the
`rmooz:unit-selected` event when clicked. As a result, the PR-3
selected-unit panel reacts to ORBAT-placed units only; selecting a
scenario-rendered unit on the map does not populate the panel.

**Why this is deferred**

Three parallel unit representations currently coexist:

- scenario units (rendered by `adjudicator-map.js`)
- ORBAT-placed units (the path that currently drives the selected-unit panel)
- simulation units

Wiring `rmooz:unit-selected` emission into `adjudicator-map.js` alone
would entrench three independent selection paths. The correct fix is
to unify scenario units, ORBAT units, and simulation units under a
single selection/event model, and then emit `rmooz:unit-selected` from
one place that covers all three.

**Action**

Do not patch this opportunistically. Revisit when the unified
selection/event model lands.

---

## KI-3 — RTL mode: `context-panel` mostly covered by `unit-panel`

**Status:** Open. Deferred — do not fix in isolation.

**Symptom**

In RTL mode, `unit-panel` now remains visible and `tool-rail` remains
usable, but `context-panel` is still mostly covered by `unit-panel`.
Content in `context-panel` is therefore largely inaccessible while a
unit is selected in RTL.

**Why this is deferred**

A targeted z-index, offset, or width tweak would paper over a broader
RTL layout problem. The correct fix is a full RTL layout refinement
pass that re-examines panel stacking order, mirroring, and sizing
across `unit-panel`, `context-panel`, and `tool-rail` together, rather
than patching one overlap in isolation.

**Action**

Do not spot-fix the overlap. Revisit during the full RTL layout
refinement.

---

## KI-4 — `oid-value-phase` / `apc-value-linked-intent` show hardcoded "Briefing" mock values

**Status:** Open. Deferred — do not fix until scenario data display
is approved.

**Symptom**

Two fields in the operator-intent and proposal cards render static
"Briefing" placeholder text instead of reflecting the active phase.

**Current hardcoded mock values (in `i18n.js`)**

- `oid-value-phase` → `"Briefing"` / `"الإحاطة"`
- `apc-value-linked-intent` → `"Operator Intent Draft (Briefing phase)"` /
  `"مسودة نية المشغّل (مرحلة الإحاطة)"`

**Current render path**

- `paintIntentCard()` reads `OID_FIELDS` → `oid-value-phase` → `tx()`
- `paintProposalCard()` reads `APC_FIELDS` → `apc-value-linked-intent` → `tx()`

**Future fix**

When safe scenario display data is introduced, replace these static
i18n values with dynamic reads using the following mapping:

- `PHASES[currentPhase]` → `oid-value-phase`
- `activeProposal.linkedIntent` → `apc-value-linked-intent`

The data sources (`PHASES` + `currentPhase`, `activeProposal`) come
from whichever safe scenario display surface gets approved — likely
the `PHASES` array, a read-only scenario state object, or a future
display-only `loadScenario(data)` method. Both elements should
resolve from the same scenario state so the OID phase value and the
APC linked-intent stay consistent with the live scenario.

**Action**

Do not swap these to dynamic reads opportunistically. The surrounding
wiring isn't there yet; a partial read would replace mock text with
empty / undefined values in the UI. Wait for scenario data display to
be approved (Wargame 1/2/3). If a task touches either element,
`paintIntentCard()`, `paintProposalCard()`, `OID_FIELDS`, `APC_FIELDS`,
or the i18n keys above, surface this dependency rather than spot-fixing.

**PR-48 scope rule**

In PR-48, leave `oid-value-phase` and `apc-value-linked-intent`
unchanged. The only exception is if the Decision Preview Summary work
directly requires touching them — and even then, do not convert them
to dynamic phase reads as part of PR-48. The dynamic-phase change
belongs to the later Wargame scenario-display PR.

---
