---
name: project_batch_d_scenario_lifecycle_closure
description: "Batch D (Scenario Immutable Revisions & Lifecycle) closed and published: D1-D10 scope, the journal-hygiene follow-up, and final gate totals."
metadata:
  node_type: memory
  type: project
  originSessionId: 8d781df4-10e7-43c2-956b-d9565691893a
---

Batch D — Scenario Immutable Revisions & Lifecycle — **CLOSED and PUBLISHED** at commit `aa212a6d` on `origin/main` and `map2/main` (fast-forward from `fe07f274`). Follows [[project_batch_c_scenario_playability|Batch C]]: scenario *authoring/play* was proven; Batch D adds long-term *management* — revision history, exact-revision approval binding, compare/restore/clone/archive, and a real Scenario Library.

## Scope (D1–D10)

- **D1** immutable `scenario_revisions` table, deterministic content hashing (reuses `sim/journal.js`'s `stableStringify`/`hashState`), no-op on byte-identical resave.
- **D2** `approved_revision`/`activated_revision` bind approval and launch to an exact revision; `command-authority.js` gained `isSelfApproval()` — a commander can no longer approve (or reject) their own scenario.
- **D3** field-level revision compare (`scenario-revision-compare.js`) — units/placement/doctrine/missions/events/objectives/victory-conditions/timing/metadata sections, not a raw JSON diff.
- **D4** restore-as-new-draft (never rewrites history).
- **D5** clone / save-as-template / archive / restore-from-archive — reachable from any lifecycle status, never destructive.
- **D6-D8** the Scenario Library UI: search/filter/status/owner/revision, a Revisions view with compare/restore/provenance, RTL/bilingual/keyboard/a11y pass.
- **D9** full role-matrix regression across every new endpoint.
- **Retrofits**: legacy-scenario revision-1 backfill on server startup; a distinct `timing` compare section.

## D10 — deep E2E, real UI only

`verify-batch-d-scenario-lifecycle-slice10.js` drives the whole journey (create → save → submit → approve → edit-via-real-map-click → re-approve → launch → run → archive → restore → clone → compare) through real UI clicks and a real Leaflet map click — no `page.evaluate()` draft injection, the one browser test in this codebase that doesn't take that shortcut. That discipline caught 4 real, pre-existing bugs no prior test had:

1. `.header-right`'s wrap could grow taller than `.app-header`, silently eating clicks on the workspace toolbar below it (fixed at the source: `.server-account-bar { flex-wrap: nowrap }` + a horizontal-scroll safety net).
2. The "Sahil Corridor" starter template's `blue_units_initial[].base_id` referenced bases that didn't exist in its own `bls_template` — blocked by the client save gate the instant a real operator picked it.
3. The Scenario Library had no reachable entry point for a normal operator (its only trigger lived inside a hidden dev-only timeline strip) — added a real tool-rail icon.
4. Clicking "Run Scenario" from the `committed` state threw an uncaught `ReferenceError` (`bind(bindFn)` calling a bare `state()` with nothing in scope) — the primary run button silently did nothing. Fixed: `state()` → the module's own `sccState(eng)`.

Also fixed a raw-JSON leak in the revision-compare renderer for object-valued fields (e.g. `obj`).

## Journal-hygiene follow-up (release-blocking, fixed before push)

A manual browser rehearsal against the real dev server (no `RMOOZ_DATA_DIR` override) left an untracked `UI_MOdified/data/journal/scenario-lifecycle.jsonl` in the repo — pure runtime state. Added an **exact-path** `.gitignore` rule (not a directory/glob — the same directory holds pre-existing tracked fixtures: `legacy-shim-*.jsonl`/`manual-*.jsonl`/`run-*.jsonl`, deliberately left untouched). New `test-scenario-lifecycle-journal-hygiene-1.js` (13/13) proves via real `git check-ignore` that the exact path is ignored and a tracked fixture isn't, that every server-spawning test already isolates via `RMOOZ_DATA_DIR`, and that the store tolerates the journal's total absence. The confirmed demo-only file was deleted. D10 was also registered in `scripts/run-all-tests.js`'s `BROWSER_FILES` (`test:browser` went 3→4).

## Final gates (all four, before push)

`test:fast` 283 passing/90 quarantined, `test:main` 9/3, `test:browser` 4/0, `npm test` 292 passing/93 quarantined — **0 new failures** across every gate. Baseline byte-identical to `origin/main` (`git diff origin/main...HEAD -- scripts/test-baseline-known-failures.json` empty).

**Pushed to `origin/main` and `map2/main`** (both fast-forward `fe07f274..aa212a6d`), per explicit owner authorization — `master`, tags, and offline work untouched. **Batch D is now fully closed and published.** Next batch: owner's call.
