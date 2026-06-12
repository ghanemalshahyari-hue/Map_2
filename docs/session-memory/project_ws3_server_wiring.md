---
name: project-ws3-server-wiring
description: "WS3 State Transition Engine wired server-side (option A) through the unlocked commit boundary via POST /api/sim/decide. Where it is, what's done (I1–I3), what's next (I4 client UX)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 70ff79ba-b1d4-4340-a587-9bf375acfbf3
---

After the 2026-06-01 boundary unlock ([[feedback_ai_sim_boundary_rules]]), the "continue the world-state engine" step = wire WS3 (State Transition Engine) through the now-open commit path. Owner chose **option A (server-side)**, built one increment at a time.

**Done (verified):**
- **I1** — proved WS1→DB1→DET1→ENG1→WS3 run server-side on real wargame3 (164 units, 73 contacts, ENGAGE returns explainable outcome). The `client/shell/*` engine modules are UMD/framework-free; WS1's header says it's meant to "also run server-side", so server use is sanctioned, not a hack.
- **I2** — `UI_MOdified/server/sim/world-state-engine.js` seam (`project`/`transition`/`run`) + `test-ws-server-engine.js` (10/10). Cross-layer require (server → `client/shell/*`) is deliberate shared logic (flagged in APP_INVENTORY).
- **I3** — `adjudicator.commitDecisions()` + route **`POST /api/sim/decide`**: derives World State, applies operator WS3 decision(s) via the deterministic engine, writes durable journal row(s) (`source='deterministic-sim'`; R1 journal-first + R2 operator_id/headless both hold). Verified function + HTTP — MOVE → prev≠post state hash + journal row `op:<id>`; missing operator_id → 400. The LLM-proposal `commitStep` / `/api/sim/commit` is **untouched**.

**Next — I4:** client UX to submit a WS3 decision to `/api/sim/decide`. No operator control exists yet → **design decision pending**: a dev/debug decision panel vs wiring into a real operator surface. Requires the :8000 server restarted on the new code. Then E2E: operator picks a decision → new World State + journal row.

**Decision contract:** WS3 decision = `{ type: MOVE|SET_EMCON|SET_READINESS|SET_WRA|RESUPPLY|ENGAGE|NOTE, actor/shooter, target, to, value, ... }`. `committed_state` returned by `/api/sim/decide` is a **WS1 World State** (units/contacts/decisions), NOT the LLM scenario-state shape `commitStep` returns — two distinct commit modes sharing the one durable journal.

**Later — option (i):** make `propose` emit `proposed_actions` as WS3 decisions so the operator Accepts an AI-proposed WS3 decision (closes AI→operator→state via the existing proposal panel). Bigger: changes the producer (`adjudicator-agent.js`).
