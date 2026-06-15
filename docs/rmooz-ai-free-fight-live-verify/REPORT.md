# RMOOZ-AI-FREE-FIGHT-LIVE-BROWSER-VERIFY-A — Verification Report

**Date:** 2026-06-16
**Feature:** AI Commander "Free Fight" (`client/shell/free-fight-demo.js` +
`server/ai/free-fight-coa-planner.js` + `server/wargame-sim-bridge.js`)
**Method:** Live browser drive via `preview_*` against the real `web-server.js`
(not the static verify stub — the stub cannot serve the free-fight endpoints).
**Model:** local Ollama `qwen2.5:7b` (provider `ollama`, local-only policy).

## Test harness

Two launch configs in `.claude/launch.json` (real server, distinct ports so the
operator's :8000 server is untouched):

| Config | Port | `RMOOZ_ALLOW_SIM_RUN` | Model env |
|---|---|---|---|
| `rmooz-gate-off` | 8002 | (unset) | `RMOOZ_FREE_FIGHT_MODEL=qwen2.5:7b` |
| `rmooz-gate-on`  | 8003 | `1` | `RMOOZ_FREE_FIGHT_MODEL=qwen2.5:7b`, `RMOOZ_FREE_FIGHT_TIMEOUT_MS=240000` |

Auth: fresh `RMOOZ_APP_DB_FILE` + `RMOOZ_BOOTSTRAP_PASSWORD=verify1234` → log in as
`admin` to clear the `/api/auth/me` redirect-loop. Scenario: `attack_objective_draft`
(Qatar bbox `[50.66,25.12,51.86,26.32]`, objective **OBJ X @ 25.72N/51.26E**, 64 RED
units in Iran + 315 BLUE in/around Qatar). Free-fight mounted with the scenario's
`review_placement_candidates`; objective set in Qatar.

## Results vs. acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Gate off → no movement | ✅ PASS | Real "Generate AI Attack Plan" button → card shows **"No AI result generated. AI execution is disabled. Enable RMOOZ_ALLOW_SIM_RUN=1"**; `coaApplied=false`, **0 units moved, 0 EXECUTED lines**, `llm_called=false`. Health: `allow_sim_run=false`, `ai_execution_enabled=false`. |
| 2 | Gate on + model → real LLM moves units | ✅ PASS | Health: `allow_sim_run=true`, `model=qwen2.5:7b`, `model_available=true`. `plan-coas` → `plan_source="llm"`, `llm_called=true`, `model_used=qwen2.5:7b`, `provider_used=ollama`, `fallback_reason=null`, 3 LLM-authored COAs. Applying the COA moved real unit **R-034** (28.94,50.83 → 28.90,50.84). |
| 3 | Objective in Qatar → nearby/relevant units only | ✅ PASS | Planner selects the **nearest** RED group (Bushehr ~360 km) for assault/move; distant Iran units (1000+ km) get `HOLD/reserve`. Card reasoning: *"Iran · Bushehr (IRIN & IRGCN) — Nearest RED anchor (363.5 km)… toward Objective X"*; *"BLUE reaction: Qatar · intercept · Al Khor Air Base"*. |
| 4 | Event log shows `plan_source=llm` + EXECUTED lines | ✅ PASS | Ledger: `AI COA Applied: COA-1 Cautious Reconnaissance and Hold — 1 units moved … [llm]` + `EXECUTED: R-003 hold HELD at 28.94,50.83 … via hold_no_move` + `EXECUTED: R-034 recon from 28.94,50.83 to 28.90,50.84 via recon_standoff_target`. |
| 5 | No `deterministic_diverse_coa` movement in the AI card | ✅ PASS (with caveat — see findings) | Successful LLM runs show `plan_source=llm`, `fallback_reason=null`, and unit-specific COA titles ("Cautious Reconnaissance by Qods Camp", "Direct Maneuver and Flank Attack") — never the deterministic templates ("Direct Assault / Flank-Fix / Probe-Recon"). |
| 6 | Before/after screenshots | ✅ DONE | Gate-off card ("AI execution disabled"); gate-on card ("Provider: ollama · Model: qwen2.5:7b · AI execution: allowed · model available: yes") + event-log EXECUTED lines. Captured live in session. |

## Findings (important — real behavior, honestly reported)

1. **`qwen2.5:7b` structured-output reliability is the limiting factor at scale.**
   - Small unit sets (≤~6 nearby units): LLM reliably returns valid COAs →
     `plan_source=llm` (observed at 74 s / 126 s / 146 s on CPU).
   - Full scenario (379 units): the planner **falls back to
     `deterministic_coa_fallback`**, either via the **45 s default LLM timeout**
     (`RMOOZ_FREE_FIGHT_TIMEOUT_MS`) or `llm_returned_fewer_than_2_valid_coas` /
     `invalid_schema`. The gate/provider wiring is correct (`llm_called=true`,
     `provider=ollama`); the model simply can't emit valid multi-COA JSON for the
     large prompt within budget. **The fallback is safe-by-design (no invented
     combat effects), but criterion 5 only holds for tractable unit counts.**

2. **Free-fight uses a SEPARATE model resolver** from the main adjudicator:
   `RMOOZ_FREE_FIGHT_MODEL || RMOOZ_LOCAL_LLM_MODEL || RMOOZ_AI_MODEL ||
   'qwen3-coder:latest'` (`free-fight-coa-planner.js:101`). It does **not** read
   `RMOOZ_OLLAMA_MODEL`. So the earlier "use my local model" change to
   `ai-config.js` does **not** cover free-fight — without `RMOOZ_FREE_FIGHT_MODEL`
   set, free-fight defaults to the **uninstalled** `qwen3-coder:latest` and reports
   `model_available:false`. (Verification set `RMOOZ_FREE_FIGHT_MODEL=qwen2.5:7b`.)
   *Recommend: make the free-fight resolver fall back to the ai-config model, or
   document/seed `RMOOZ_FREE_FIGHT_MODEL`.*

3. **Two movement systems — don't conflate them.** "Start **Group Movement Demo**"
   (`data-act="start"`) is a review-only **geometric** overlay that animates
   regardless of the gate (`review_only/demo_only`). The **AI** paths
   ("Generate AI Attack Plan" / "Start AI Free Fight" / "Preview Unit AI Decision")
   are the gated ones. Criterion 1 concerns the AI path; the geometric demo moving
   is expected and is not AI/LLM movement.

4. **Test-seam vs. operator path.** The `_applySelectedCoaForTest` seam can
   force-apply a deterministic plan with the gate off (moved 54 units / 64 EXECUTED
   in a seam test). This is **not operator-reachable** — the real "Generate AI
   Attack Plan" button produces no applyable result when the gate is off, so the
   operator UI honors the gate. Noted for awareness only.

## Reproduce

1. `preview_start rmooz-gate-off` (8002) → log in `admin/verify1234` → `/app.html`.
2. `AppNativeScenarioLoader.loadScenarioByName('attack_objective_draft')`, then
   mount free-fight with `review_placement_candidates`, `setObjective({lat:25.72,lon:51.26})`.
3. Click `[data-act="generate-coa"]` → confirm "AI execution disabled" (criterion 1).
4. Stop; `preview_start rmooz-gate-on` (8003); repeat login + setup.
5. `POST /api/wargame-sim/free-fight/plan-coas` with the **5 nearest** RED units +
   `objectives:[{lat:25.72,lon:51.26,coord:[51.26,25.72]}]`, `opts:{useLlm:true}` →
   `plan_source=llm` (~2 min). Inject + apply → EXECUTED lines (criteria 2/4).
