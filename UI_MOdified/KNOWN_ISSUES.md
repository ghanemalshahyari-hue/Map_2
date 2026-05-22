# Known Issues

## wargame1 BLS-4 regression test failure (pre-existing)

`scripts/test-scenarios.js` currently reports a FAIL for **wargame1** due to a
pre-existing BLS-4 doctrine issue (item #11 invariant: BLS-4 must never end up
SECURE). This failure exists on `main` prior to PR-1 and is **not** introduced
by PR-1.

### Status of the wargame regression suite

| Scenario  | Status | Notes                                                                 |
|-----------|--------|-----------------------------------------------------------------------|
| wargame1  | FAIL   | Pre-existing BLS-4 issue. Not caused by PR-1. To be fixed separately. |
| wargame2  | PASS   | Terrain + reserves deny Red as expected (DENIED, PL ~84).             |
| wargame3  | PASS   | Scenario loading + default side-posture enrichment works.             |

### Why this is deferred

PR-1's scope does not touch the BLS-4 adjudication logic. Folding the BLS-4 fix
into this PR would expand the diff and mix unrelated concerns. A follow-up PR
will address the BLS-4 invariant on its own.

### Reproduction

```
node UI_MOdified/scripts/test-scenarios.js
```

Expect: `[FAIL] wargame1 ... BLS-4 was SECURE on at least one step (item #11 invariant)`,
`[PASS] wargame2`.
