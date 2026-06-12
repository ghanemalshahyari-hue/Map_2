---
name: feedback-ai-sim-boundary-rules
description: The AI/sim commit boundary — UNLOCKED 2026-06-01 by owner ruling (operator UI now mutates via real /api/sim/commit). What's live, what stays closed, and why.
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0e593b81-b416-48af-99fb-e69093db82a8
---

**UNLOCKED 2026-06-01 by owner ruling (ghanem): "full unlock — UI mutates", minimal-coherent scope.** This supersedes the PR-12 "locked / dry-run only" posture (History below). The operator commit path is now LIVE and **Drift D3 is RESOLVED** (server commit + journal sanctioned and driven by the UI).

## Current state of the boundary (UNLOCKED, minimal-coherent)

1. **Commit is LIVE.** [ai-proposal-commit-bridge.js](UI_MOdified/client/shell/ai-proposal-commit-bridge.js) `commitDecision()` POSTs `/api/sim/commit`: ACCEPT→`accepted_action_ids:'ALL'`, REJECT→`[]`, HOLD→defers (no call). Carries `operator_id` from `CHAT_CONFIG.currentUser.id` (R2 intent). It still **sync-returns null** for guard failures (invalid decision/proposal) so the audit harness holds; the POST is fire-and-forget — state + Decision Records update on the server response. `getState().mode === 'live'`.
2. **Durable journal write** is server-side: `commitStep()` → `journal.appendCommit()` → `data/journal/<run>.jsonl`. Verified E2E (UI Accept → row `decision:accept`, `operator_id:op:<id>`).
3. **Decision Records** ([ai-proposal-decision-journal.js](UI_MOdified/client/shell/ai-proposal-decision-journal.js)) accept `committed:true`/`dryRun:false` + optional `journalSeq`; render "Live / Committed: Yes / #seq". Still in-memory only — the durable record is the server journal.
4. **Journal contract** ([journal-contract.js](UI_MOdified/client/shell/journal-contract.js)) `ALLOWED_MODES` includes `REAL`; validator accepts coherent REAL committed entries, still rejects malformed + DRY_RUN/committed mismatches.
5. **Boundary audit panel** ([boundary-audit-panel.js](UI_MOdified/client/shell/boundary-audit-panel.js)) re-pointed to report the OPEN posture (commit LIVE, backend connected, real journal enabled); self-test + violation harness assert the NEW invariants and pass green.
6. **Proposal service** still ships `serviceEnabled:false` (operator opts in via `setServiceEnabled(true)`) — unchanged; that's the on-ramp, not a lock.

## What STAYS closed (NOT part of this unlock)

- **Client scenario-state mutation**: `window.units` / `window.map` / `window.lines` / plan state are still never mutated by AI/sim code. The commit mutates *server* state only; the audit "Scenario Mutation" row stays `forbidden`.
- **Journal export + download guards** (PR-17 / PR-20) remain preview-only / locked.
- **The separate `scenario-workspace` live-decision flow** (`_liveOperatorWorkflowState`, tests `test-pr-286L/287L/288L`) is untouched — still `committed:false / readOnly:true`. (Owner chose *minimal*, not full teardown.)
- **Event Log closed-set** categories unchanged ([[feedback_event_log_not_chat]]).

## History (superseded)

Originally locked after PR-12: commit bridge dry-run only, the string `/api/sim/commit` absent from `client/`, no journal file, no state mutation; gated incrementally one surface per PR (PR-13 was to be the in-memory decision-journal UI — that shipped). The 2026-06-01 ruling opened the operator commit surface in one pass (minimal-coherent scope above). Files touched: the 5 modules above + `i18n.js` (EN/AR) + `app.html`/`ai-proposal-panel.js` label-honesty fixes. The earlier "even if the endpoint exists, don't touch it" posture no longer applies to *this* surface — but its spirit still governs the surfaces listed under "STAYS closed".
