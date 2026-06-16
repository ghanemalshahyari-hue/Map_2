# RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A — Qatar real-LLM E2E proof

- **Date:** 2026-06-16
- **Script:** `scripts/verify-ai-free-fight-prefilter-e2e.js`
- **Command:** `RMOOZ_VERIFY_PORT=8104 node scripts/verify-ai-free-fight-prefilter-e2e.js`
- **Server:** real `server/web-server.js`, `RMOOZ_ALLOW_SIM_RUN=1`
- **Model:** `qwen2.5:3b` (local Ollama), operator-selected via `POST /api/ai/model/select`
- **Feature commit:** `4897c114310d50e41c04d55c29a1ebc4ea4d9c9b`
- **Result:** exit 0 — **PASSED**

This is the real-LLM acceptance for the candidate pre-filter (a Qatar objective + a full
scenario of hundreds of units). The pre-filter *logic* is additionally proven without any LLM by
`scripts/test-free-fight-candidate-prefilter-a.js` (7/7).

## Captured output

```
Starting RMOOZ server on :8104 (ollama/qwen2.5:3b, RMOOZ_ALLOW_SIM_RUN=1)…

[1] Select the model + confirm it is installed
  ✓ POST /api/ai/model/select ok
  ✓ selected model "qwen2.5:3b" is installed

[2] POST the FULL force (hundreds of units) + Qatar objective to plan-coas…
    · total units posted: 355
    · elapsed: 218s

[3] Acceptance — small candidate set, real LLM, only candidate units
  ✓ candidate pre-filter applied on the large force
  ✓ full pool is hundreds of units (total=345)
  ✓ AI prompt includes only 10–25 candidates (sent=20)
    · candidates sent / total / excluded: 20 / 345 / 325
    · top exclusions: 319 out_of_reach | 5 different_country_zone | 1 far_from_objective
  ✓ plan_source === "llm" (got llm)
  ✓ llm_status === "ok" (got ok)
  ✓ model_used === the selected model (qwen2.5:3b)
    · repaired: true (1 attempts)
  ✓ no excluded FAR unit appears in the plan (got 0)
  ✓ every unit in the plan is a candidate (non-candidates: 0)
  ✓ plan moves a SMALL force package, not all-country mass movement (3 actions)
    · units in plan: NEAR-0, NEAR-6, NEAR-14

✅ PREFILTER E2E PASSED — hundreds of units, only 10–25 sent to the AI, LLM plan used only candidates.
```

## Acceptance mapping

| Requirement | Evidence |
|---|---|
| full pool may be hundreds of units | `total=345` |
| AI prompt includes only 10–25 candidates | `sent=20` |
| `plan_source="llm"` | ✓ |
| `llm_status="ok"` | ✓ |
| `model_used` equals selected model | `qwen2.5:3b` |
| selected units are near/relevant | plan = `NEAR-0, NEAR-6, NEAR-14` |
| no all-country mass movement | 3 actions only |
| EXECUTED/plan shows only LLM-selected candidate units moved | 0 far units; 0 non-candidates |

Note: `repaired: true (1 attempt)` — the local 3b model's first draft was invalid; the
RMOOZ-AI-COMMANDER-REPAIR-LOOP-A repair loop fixed it, and the pre-filter kept the problem to 20
relevant units. Both features compound: a small, clean problem lets a small model succeed.
