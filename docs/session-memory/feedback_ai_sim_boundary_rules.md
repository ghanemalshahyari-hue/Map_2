---
name: feedback-ai-sim-boundary-rules
description: Hard rules for any PR that touches AI proposal / sim / commit / journal surfaces. The user reinforced these at end of PR-12.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0e593b81-b416-48af-99fb-e69093db82a8
---

The AI / simulation boundary is gated incrementally. Each PR opens **one** small surface; nothing else moves. These are hard rules — even if an endpoint exists, even if a code path is one line away, do not cross them without an explicit go-ahead PR.

## Current state of the boundary (locked after PR-12)

1. **Proposal service is guarded.** [client/shell/ai-proposal-bridge.js](UI_MOdified/client/shell/ai-proposal-bridge.js) ships with `state.serviceEnabled === false`. Default = no network call to `/api/sim/propose`. Honest "Proposal service not yet connected" warning logged on click.
2. **Propose can be enabled manually.** Only by `AppShellAIProposalBridge.setServiceEnabled(true)` or the PR-11 Enable button. Never auto-flipped on success/failure/load. Never persisted (no localStorage).
3. **Commit bridge exists.** [client/shell/ai-proposal-commit-bridge.js](UI_MOdified/client/shell/ai-proposal-commit-bridge.js) is the surface PR-7 buttons route through.
4. **Commit bridge is dry-run only.** Returns `{ok:true, dryRun:true, committed:false}`. The string `/api/sim/commit` does not appear in the bridge source. No `fetch` / `XMLHttpRequest` / `sendBeacon`.
5. **State mutation remains forbidden.** No PR may touch `window.units`, `window.map`, `window.lines`, scenario state, or write a journal file until an explicit "go live" PR for that specific surface is approved.

## What is NOT allowed in any future PR unless that PR explicitly opens it

- Calling `/api/sim/commit` from anywhere in `client/`.
- Adding `serviceEnabled: true` as a default to either bridge.
- Persisting `serviceEnabled` (localStorage / IndexedDB / cookie / URL param).
- Writing a real journal file (`data/journal/*.jsonl` or any other path).
- Mutating scenario / units / map / plan state through any AI/sim-related code path.
- Adding `AI`, `SIM`, `SCENARIO`, or combat-related categories to `AppShellEventLog.append()`. PR-6's closed-set gate rejects them — and producer code must not even try.
- Auto-accepting a proposal anywhere. Operator click is the only path.
- Re-enabling a guarded service on success/failure.

## Next planned step (PR-13)

**PR-13: Local Decision Journal UI — in-memory only.** When the operator clicks Accept / Reject / Hold:
- A structured "Decision Record" is added to a small in-memory store.
- Visible either as a compact panel section or as styled rows inside the existing Event Log.
- **No real journal file written.** No fetch, no localStorage row write.
- PR-13 is the *display + in-memory store* layer. A later, explicitly-approved PR will be the place to introduce real journal persistence.

If a user types "Start PR-13" without further constraints, default to: in-memory `AppShellAIProposalJournal` module with `record(record)`, `list()`, `clear()`, capped at e.g. 100 records, broadcasting `rmooz:ai-proposal-journal-changed` for UI subscribers. EN/AR labels. Wired to PR-12's commit-bridge return + the panel's Accept/Reject/Hold path. No backend, no file.

## When in doubt

Refuse the path, ship the safe default, log the warning, and surface the trade-off honestly in the PR report. The user's stated posture is "even if the endpoint exists, we don't touch it." Apply that to any new surface that comes up.
