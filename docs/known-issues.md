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
