# SCC Runtime Checkpoint - C3c Timeline/Workspace Normalization

> Focused checkpoint, not a full `/audit-app`. Do not bump `AUDIT_SHA` from
> this file. This records the C3c decision and the read-only CMO wiring added
> after the recovered C3a/C3b-equivalent runtime baseline.

**Date:** 2026-07-06

## Baseline

- Exact requested SHA `f7b96034` was not present on local remotes during this
  session.
- The equivalent local baseline is `c26d2ef9`:
  `feat(runtime): make scenario play advance continuous time`.
- That baseline includes continuous runtime play/pause/stop/reset behavior,
  runtime schema fields, and the C3b/C3 clock tests.

## C3c Decision

- Primary scenario Play remains the Scenario Control Center runtime clock.
- The bottom timeline strip is not wired to that C3b runtime clock in this
  slice. Existing consumers are fixed-step/review playback engines, so wiring it
  directly to runtime time would be broader than a safe label-only C3c change.
- The timeline strip is therefore explicitly labelled as review/preview:
  Review Timeline, Preview playback, Pause preview, snapshot stepping,
  Playback speed, Review Time, Review Phase.
- Default timeline visual state is paused preview, not active Play.

## Scenario Workspace

- Workspace step navigator copy now says step review/playback and snapshot
  navigation.
- `sw-nav-play` remains the same DOM id for compatibility, but visible text is
  `Preview`, with `Pause preview` while active.
- Snapshot/inspection controls keep their existing ids and step-index behavior;
  they do not claim ownership of runtime scenario Play.

## CMO Wiring

- `cmo-wargame-review-board.js` and `cmo-wargame-decision-ledger.js` are loaded
  in the main app after the CMO evidence package and before `unit-status-panel`.
- The modules are read-only: no backend calls, no database/storage writes, no
  doctrine/combat mutation, and no protected runtime artifacts.
- `decision-ledger` now accepts the current review-board API name
  `buildReview`, while retaining compatibility with `buildReviewBoard`.

## Guard Tests Added

- `test-timeline-runtime-contract-1.js`
- `test-workspace-runtime-label-contract-1.js`
- `test-cmo-wargame-module-wiring-1.js`

## Not Touched

- Offline mirror / offline app.
- DB-Lite.
- Tracked scenario files and protected journal files.
