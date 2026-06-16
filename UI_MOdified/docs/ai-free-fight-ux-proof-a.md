# RMOOZ-AI-FREE-FIGHT-UX-PROOF-A — operator-clarity proof report

**Date:** 2026-06-16 · **Scope:** UI/diagnostics only (no planner/COA/DB-Lite/terrain/readiness/Staff-Safe logic change; model selector / `RMOOZ_ALLOW_SIM_RUN` / candidate pre-filter / local-only guardrails untouched).

Goal: an operator/demo can understand what the AI did **without reading server logs** — which model, whether AI is allowed, the local model availability, how many units the AI saw vs the full force, why the selected units moved, proof the movement came from `plan_source="llm"`, and the EXECUTED lines.

The card now leads with four consolidated, clearly-labelled blocks (reusing data RMOOZ already produces), then the existing detail (planning trace, COA cards, movement-execution debug).

## Evidence — rendered card (in-process render of the real `renderCoaPlanHtml`)

> Note on screenshots: the `preview_screenshot` (JPEG) MCP tool times out in this environment (documented across prior tasks), so proof is captured as the **exact text the real render functions emit** (DOM evidence) — this is the authoritative render output, not a mock. The same Free Fight card was previously visually verified in a real browser under RMOOZ-AI-COMMANDER-TRACE-VERIFY-B.

### A) Full card — real LLM plan (`plan_source=llm`), Qatar objective, hundreds of units

```
Plan source: llm · depth normal

🛰 AI Readiness
  ✅ Free Fight AI is ready
  Execution gate (RMOOZ_ALLOW_SIM_RUN): enabled
  Provider (llm-runtime-config): ollama — local
  Model available: yes (qwen2.5:7b)
  Local-only policy: enforced
  Selected model: qwen2.5:7b
  Plan source (after generation): llm
  LLM status: ok
  ✅ Movement came from the local LLM (plan_source=llm).

🎯 AI Candidate Filter
  Candidate units sent to AI: 18 / total 340 · Excluded units: 322
  Top exclusion reasons:
    200 — out of reach
    80  — different country
    42  — far from objective
  Proof: the AI reasoned over only 18 of 340 units (the rest were pre-filtered
  as far / out-of-reach / different-country / low-relevance).

✅ AI Selected Units (1)
  Qatari F-16 Squadron (R-1) · Qatar · 25.300,51.200
  flank · flank_offaxis_target
  why: covers the open coastal flank
  target 25.310,51.220 → final (apply to see)

⊘ AI Non-Selected Units (1)            ← collapsed <details> by default
  Why the AI held these candidates back:
  • Coastal Frigate (R-2): held to screen the rear — too far from the objective

  … then the existing detail: AI Commander Mode planning trace (Input understood /
  AI reasoning / Validation), movement-execution debug, COA cards, Commander Decision.
```

### B) AI Selected Units — after Apply (final coordinate filled from the animated move)

```
✅ AI Selected Units (1)
  Qatari F-16 Squadron (R-1) · Qatar · 25.300,51.200
  flank · flank_offaxis_target
  why: covers the open coastal flank
  target 25.310,51.220 → final 25.315,51.225
```

### C) AI Readiness — deterministic fallback (honest "not AI")

```
🛰 AI Readiness
  ✅ Free Fight AI is ready (gate/provider/model all OK)
  Selected model: qwen2.5:7b
  Plan source (after generation): deterministic_coa_fallback
  LLM status: invalid_json · llm_invalid_json_or_no_coas_array
  ⚠ Deterministic plan — the LLM did not produce this (not "AI").
```

### D) Event-log proof (unchanged, kept)

```
AI COA Applied: COA-1 Flank — 1 units moved, 1 maneuver [llm]
EXECUTED: R-1 flank from 25.300,51.200 to 25.315,51.225 via flank_offaxis_target
```

## Acceptance mapping

| Acceptance | Where |
|---|---|
| Understand what happened without server logs | the four leading blocks |
| "AI saw only X of Y units" | AI Candidate Filter (18/340 + proof line) |
| Movement came from the LLM, not fallback | AI Readiness verdict (`✅ … plan_source=llm` vs `⚠ not "AI"`) |
| Why selected units moved / why others did not | AI Selected Units (`why_unit`) + AI Non-Selected Units (reason) |
| Proof report saved under docs | this file |

## Tests

`scripts/test-free-fight-ux-proof-a.js` — **7/7**:
candidate count appears · selected model appears · `plan_source=llm` proof only for a real LLM result · deterministic NOT labelled as AI · selected units render with `why_unit`+`execution_mode`(+target/final) · `non_selected_units` render collapsed · "before generation" explainer.

Regression suites green: candidate-prefilter 7 · repair-loop 7 · pacing-c 5 · gate-card-d 7 · free-fight-ai 9 · card-visibility 7 · commander-narrative 45 · ai-free-fight-ai-only 7.

Pre-existing failures (confirmed identical at HEAD via `git stash` baseline — NOT introduced here): `test-ai-attack-plan-ai-only-a` 6/5 and `test-freefight-ai-coa-ui-a §15` (drift from the repair-loop-A "show Staff-Safe COAs badged" relaxation + commits since the last `APP_INVENTORY` audit).
