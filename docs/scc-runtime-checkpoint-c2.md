# SCC Runtime Checkpoint — post-C2 (Option C / Slice C2)

> Focused checkpoint, **not** a full `/audit-app`. Written to keep `APP_INVENTORY.md`
> from misleading C3 work — the whole SCC-REAL-STATE runtime series (Option A/B/B1/C/C1/C2)
> landed *after* the last audit stamp (`b37f5a83`, 73 commits back) and is **not yet in the
> inventory**. Fold this into `APP_INVENTORY.md` at the next `/audit-app` (do **not** bump the
> `AUDIT_SHA` outside a real audit). The "why" is already in memory
> (`project_ws3_wired_scc_real_state`, `project_time_based_runtime_target`).

**Date:** 2026-07-05 · **HEAD:** `4e41827f` (feat(runtime): runtime clock drives the displayed snapshot — Option C / Slice C2)

## 1. Repo / remote state — CLEAN
- `HEAD` = `4e41827f`; branch `main` tracks `map2/main`.
- After a real `git fetch` of both remotes: **`origin/main`, `origin/master`, `map2/main` all = `4e41827f`, 0/0 ahead-behind.** Fully in sync.
- Working tree: **only untracked (`??`) data artifacts — zero modifications to any tracked file** (see §2).

## 2. Uncommitted files (8) — classification
All 8 are untracked; none are `.gitignore`d. None overwrite a tracked file.

| File | Kind | Recommendation |
|---|---|---|
| `data/scenarios/iran-strike-2022-rmooz.json` | **New authored scenario** — complete `w4-strike` (obj/pipeline/red+blue units/phase_table/steps), `pilot-handauthored-v1` | **Commit** (authored content) — owner confirm |
| `data/scenarios/celtic-sea-asw-1987-rmooz.json` | **New authored scenario** — complete `w4-naval` ASW | **Commit** (authored content) — owner confirm |
| `data/journal/legacy-shim-iran-strike-2022-rmooz.jsonl` | Run journal of the new iran-strike scenario | Keep untracked *or* commit-with-scenario |
| `data/feedback/iran-strike-2022-rmooz.jsonl` | Feedback artifact of the new scenario | Keep untracked *or* commit-with-scenario |
| `data/journal/legacy-shim-attack_objective_draft.jsonl` | Regenerated run of an **existing** scenario | Runtime artifact — keep untracked / discard |
| `data/journal/legacy-shim-attack_objective_draft-10.jsonl` | Regenerated run of an **existing** scenario | Runtime artifact — keep untracked / discard |
| `data/journal/legacy-shim-attack_objective_draft-15.jsonl` | Regenerated run of an **existing** scenario | Runtime artifact — keep untracked / discard |
| `data/journal/legacy-shim-beirut-llm-test.jsonl` | Regenerated run of an **existing** scenario | Runtime artifact — keep untracked / discard |

Notes:
- Journals are app-written runtime state (`operator_id: system:legacy-shim`, `source: llm-narrator`). This aligns
  with the **RUNTIME-OVERRIDES-CLEANUP-1** owner ruling ("keep runtime state untracked"), even though many
  historical `legacy-shim-*` journals are tracked as evidence fixtures.
- **Protected journal draft — UNTOUCHED.** `git status` shows zero modifications to tracked files, so every tracked
  `attack_objective_draft` journal (`-5/-19/-95/-112`) is byte-identical to HEAD. The new untracked
  `attack_objective_draft.jsonl` / `-10` / `-15` are **separate new files**, not overwrites.
- **Offline mirror — UNTOUCHED** by this session (no edits made; no `offline/` tree in this repo — the offline shell
  is a separate machine-local path per inventory Drift **D6**). Its internal state can't be inspected from here.

## 3. Core gates
| Gate | Result |
|---|---|
| C1 `test-scc-runtime-clock-1.js` | **39/39** ✅ |
| C2 `test-scc-runtime-clock-2.js` | **25/25** ✅ |
| B1 ownership `test-scc-run-position-ownership-1.js` | **23/23** ✅ |
| Journal bridge `test-scc-run-journal-bridge-1.js` | **19/19** ✅ |
| Commit journal `test-scc-commit-journal-bridge-1.js` | **17/17** ✅ |
| WS3 world-state bridge `test-scc-run-world-state-bridge-1.js` | **23/23** ✅ |
| DB referential-integrity `test-db-lite-referential-integrity-1.js` | **24/24** ✅ |
| DET1 `test-det1-detection.js` | **15/15** ✅ |
| ENG1 `test-eng1-engagement.js` | **17/17** ✅ |
| DB1 `test-db1-capabilities.js` | **15/15** ✅ |
| WS3 transition `test-ws3-transition.js` | **14/15** ⚠️ (1 pre-existing fail) |

### Known-fail — `test-ws3-transition.js` T: "SET_EMCON active → contacts appear"
- **Not the runtime clock, not a DB range gap, pre-existing.** C1/C2 touched only `free-fight-demo.js`,
  `world-state.js`, `adjudicator-map.js` (display/clock layer); they did **not** touch `world-state-transition.js`
  or `detection.js` (last changed by `69a2d09a`, before C1/C2).
- **Root cause locus:** flipping EMCON active via a `SET_EMCON` *decision* does not surface the contact that a
  **natively-active** radar sees. Proof it's not ranges: a `long_range_3d` radar (ref 200nm) vs a `medium`-RCS
  `air` target at 40nm computes a `firm` contact (horizon ≈222nm), and the **ENGAGE-with-active-radar assertion in
  the same test passes** (target detected at 40nm). So the defect is the `SET_EMCON` → contacts-recompute
  interaction in `world-state-transition.js`, likely introduced by the WS-ENG1-A transition refactor (`092ba808`).
- **Impact on C3:** none. C3 is absolute-time/schema work on a different axis. Track/fix separately.

## 4. Verdict — clean enough for C3 (design)?
**Yes**, with two non-blocking housekeeping items:
1. Decide the 8 files (§2): commit the two authored scenarios; keep/discard the regenerated journals. (Owner call — commit pushes to the shared `map2` remote.)
2. This checkpoint doc covers the inventory-staleness gap for now; a full `/audit-app` should fold the runtime series in and re-stamp `AUDIT_SHA`.

The `test-ws3-transition` known-fail is flagged, off the C3 axis, and does not block a **design-only** C3 plan.
