# Known pre-existing test failures (tracked separately from feature work)

**Created:** 2026-06-21 · **Owner ruling:** document these, do NOT conflate them with
`RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK` (`ef22317`) or any single feature commit.

## Why this file exists

The AK verification ran a **broader** test grep than the canonical "FF suite" that prior tasks
(AF/AH/AI) counted as `47/47`. That broader sweep also matched a few tests **outside** the FF
suite, and surfaced **3 failing tests**. They were confirmed **pre-existing** — they fail at AK's
**parent commit `1760cb8`** (verified by stashing the AK changes and re-running). **AK did not
introduce or touch any of them.** They are recorded here so the suite's "X passed / 3 failed"
reads honestly and these are not mistaken for an AK regression.

## Proof of pre-existence

```
# with AK changes stashed (working tree == 1760cb8, AK's parent):
git stash push UI_MOdified/client/shell/free-fight-demo.js \
  UI_MOdified/client/shell/scenario-control-center.js \
  UI_MOdified/client/shell/unit-taskability.js \
  test-free-fight-step1-coa-preparation-gate-ae.js

node test-commander-brief-ui-a.js          # FAIL (same 3 §3 assertions)
node test-doc-review-step1-proposed-units.js   # FAIL (enemy force structure section)
node test-step1-unified-bases-map-anchors.js   # FAIL (RED base count renders)

git stash pop
```

All three fail **identically** with AK stashed → not caused by AK.

## The 3 failures

| Test | Result | Failing assertion(s) | Likely area (needs triage) |
|---|---|---|---|
| `test-commander-brief-ui-a.js` | 16 pass / **3 fail** / 19 total | §3 "copyable textarea present", §3 "textarea contains AI Commander Decision text", §3 "Copy button present when expanded" | The commander-brief UI no longer renders the expandable copyable textarea + Copy button the test expects (UI drifted, likely during the AF/AG operator-window replacement / dead-UI cleanup). Engine path is fine (plan-coas runs). |
| `test-doc-review-step1-proposed-units.js` | throws on first fail | `Error: enemy force structure section` | The Step-1 doc-review proposed-units view does not expose the "enemy force structure section" the test asserts (renamed or removed). |
| `test-step1-unified-bases-map-anchors.js` | 5 pass / **1 fail** | "Review UI shows RED/BLUE proposed counts and base counts: **RED base count renders**" | The unified-bases Review UI no longer renders the RED base count in the form the test checks. |

## Status / next step

- **Not regressions of AK** — pre-existing UI/test drift, outside the canonical FF suite.
- **Not yet triaged or fixed.** Each is a test-vs-UI drift: either the test asserts a surface that
  was intentionally removed/renamed (update the test) or the surface regressed (fix the UI). That
  decision needs a per-test look and is **out of scope for AK**.
- When triaged, fix or retire each in its **own** change and remove its row here.
