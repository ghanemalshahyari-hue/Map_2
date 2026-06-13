# FREE-FIGHT-AI — LiteLLM / Qwen upgrade design (DESIGN ONLY — not implemented)

**Status:** design + checklist. **No code in this slice.** The shipped planner is the
deterministic `free-fight-ai.js` ("AI-lite"); this document specifies how an **optional,
advisory** LLM (Qwen via LiteLLM / Ollama) could enrich it later **without replacing it**.

> Scope guard (owner rules, DOC-UNDERSTANDING-1 / Free Fight): everything stays
> `demo_only` / `review_only` / `needs_review` / `requires_commander_approval`,
> `exact_unit_position:false`. No weapons, damage, kill-probability, real adjudication,
> taxi/runway/takeoff, or world-state mutation. An LLM may only *propose* and *explain*;
> it may never become the source of truth, and the deterministic planner remains the
> fallback and the validator.

Related: [`symbol-db-integration-design.md`](symbol-db-integration-design.md),
[`document-ingestion-pipeline-design.md`](document-ingestion-pipeline-design.md),
[`gis-terrain-integration-design.md`](gis-terrain-integration-design.md).
Planner source: `UI_MOdified/client/shell/free-fight-ai.js`.
Consumer: `UI_MOdified/client/shell/free-fight-demo.js`.
AI gateway (single source of truth): `UI_MOdified/server/ai/ai-config.js`.

---

## 1. What exists today (verified 2026-06-13, live)

`free-fight-ai.js` → `RmoozFreeFightAI.buildPlan(groups, objective, opts)` is a pure,
synchronous, Node-requireable **deterministic heuristic**:

- picks ≤3 RED attackers (nearest anchors + platform-category attack-suitability),
- picks ≤3 BLUE reactors with a `reaction_type` (`intercept` / `defend_objective` /
  `screen` / `hold`) derived from platform category, and an intercept/defend point via
  `lerp(objective, anchor, ring)`,
- scores routes with injected terrain (`opts.terrain` from the browser's `/api/terrain`
  probe) or falls back to straight-line geometry **with a warning**,
- emits `red_attack_plan[]` / `blue_reaction_plan[]` / `warnings[]` /
  `missing_information[]`, each entry `needs_review` + `requires_commander_approval`,
  `confidence` low/medium, `planner: "free-fight-ai-lite (deterministic heuristic; no LLM)"`.

Live end-to-end check (LITE GCC-vs-Iran fixture, RED 1 / BLUE 6, 12 anchors): RED 3 /
BLUE 3 plan, terrain unavailable on this box → geometric routes + the standard warning,
AI reasoning panel populated, movement glides anchor→target, Reset/Clear clean. **This is
the baseline the LLM path must never regress below.**

---

## 2. Upgrade principle — LLM is *advisory*, deterministic is *authoritative*

```
groups + objective + terrain
        │
        ├─►  deterministic planner  ──►  basePlan         (ALWAYS runs, ALWAYS valid)
        │                                   │
        │                                   ▼
        └─►  (optional) LLM enrich  ──►  llmPlan  ──►  VALIDATE+CLAMP against basePlan
                                                          │
                                                          ▼
                                            mergedPlan  (annotated llm_advisory:true)
```

- The deterministic planner runs **first and always**. Its output is a complete, valid plan.
- The LLM, **only if explicitly enabled**, is asked to *re-rank / re-explain / suggest
  reaction_type* over the **same candidate groups** the deterministic planner already
  selected. It may not introduce groups, coordinates, or counts that aren't in the input.
- Every LLM-touched field is validated against deterministic invariants (below). Anything
  that fails validation is **dropped back to the deterministic value**, and a warning is
  recorded. The LLM cannot widen scope, only annotate within it.
- If the LLM is unreachable, times out, returns invalid JSON, or fails validation →
  **silent fallback to the deterministic plan** (plus a `warnings[]` note). No user-visible
  failure, no blocking.

---

## 3. Required JSON contract (LLM response schema)

The LLM is prompted to return **only** this object (no prose). Field names mirror the
deterministic plan so merge/validation is 1:1.

```jsonc
{
  "red_attack_plan": [
    {
      "demo_group_id": "DEMOGRP-RED-iran-0",   // MUST exist in the input groups
      "country": "Iran",
      "source_base": "Bandar Abbas AB",
      "reason": "string — why this group attacks Objective X (review-only rationale)",
      "route_summary": "string — human-readable vector note",
      "confidence": "low" | "medium"            // "high" is NOT allowed for demo output
    }
  ],
  "blue_reaction_plan": [
    {
      "demo_group_id": "DEMOGRP-BLUE-uae-4",   // MUST exist in the input groups
      "country": "UAE",
      "reaction_type": "intercept" | "defend_objective" | "screen" | "hold",
      "reason": "string",
      "route_summary": "string",
      "confidence": "low" | "medium"
    }
  ],
  "warnings": ["string"],                       // anything the model is unsure about
  "missing_information": ["string"],            // fields it would need to do better
  "confidence": "low" | "medium"                // overall plan confidence
}
```

**Hard validation (deterministic checks, server- or client-side before display):**

1. `demo_group_id` ∈ input group ids — else drop the entry.
2. `reaction_type` ∈ the 4 enum values — else fall back to deterministic reaction_type.
3. `confidence` ∈ {low, medium} — coerce anything else (incl. "high") to `medium` + warn.
4. No coordinates, counts, weapons, damage, probabilities, or timing in the response — if
   present, strip them and record a warning. (The LLM never sets positions; the
   deterministic `lerp(...)` ring math owns coordinates.)
5. RED ≤ 3, BLUE ≤ 3 (same caps as the deterministic planner) — truncate extras.
6. Output is re-stamped server-side: `demo_only:true`, `review_only:true`,
   `needs_review:true`, `requires_commander_approval:true`, `exact_unit_position:false`,
   `planner:"free-fight-ai-lite + llm-advisory (<provider>/<model>)"`, `llm_advisory:true`.

If **any** of 1–6 trips for the whole response (e.g. invalid JSON), discard the LLM plan
entirely and use the deterministic plan.

---

## 4. Where it plugs in (no new surface)

- **Gateway:** reuse `server/ai/ai-config.js`. A LiteLLM proxy is the `apiStyle:'openai'`
  path (`POST /v1/chat/completions`); Qwen on local Ollama is `apiStyle:'ollama'`. No new
  client needed — `zen-client.js` (OpenAI-style) or `ollama-client.js` already speak both.
- **New (future) server route:** `POST /api/free-fight/plan-advisory` → body
  `{ groups, objective, terrain }`, returns the schema in §3. It calls the configured
  provider, validates, and returns `{ plan, llm_advisory, fell_back }`. Read-only; writes
  nothing.
- **Client:** `free-fight-demo.js` already computes the deterministic plan in
  `selectSample()`. The advisory call would be an **opt-in async enrich** after that
  (like `probeTerrain()` is for terrain): fire-and-forget, re-render the AI panel if it
  returns a valid merged plan, otherwise leave the deterministic plan untouched.
- **AI reasoning panel:** already renders `planner`, per-entry `reason` / `route_summary` /
  `confidence` / `warnings`, and a `missing_information` line — it needs **no change** to
  show LLM-enriched text; only the `planner` label flips to note `+ llm-advisory`.

---

## 5. Env-gating + optional test (do NOT depend on Qwen today)

- **Off by default.** The advisory path activates only when an env flag is set, e.g.
  `RMOOZ_FREE_FIGHT_LLM=1` **and** a provider is configured in `ai-config.js`
  (`aiProvider` resolvable + reachable). With the flag unset (the default, and the only
  state on the air-gapped dev box today), the code path is never entered.
- **Optional test** `test-free-fight-llm-advisory-a.js` (future): skips with a clear
  `SKIP (RMOOZ_FREE_FIGHT_LLM unset / no provider)` message when disabled, so CI on a
  machine with no model stays green. When enabled, it asserts: valid JSON parse, schema
  validation drops out-of-enum / out-of-scope fields, RED/BLUE caps enforced, and that an
  unreachable provider yields the deterministic fallback (no throw).
- **Determinism for the test:** request `temperature: 0` (or low) and validate structure,
  not exact wording — the deterministic invariants are what's asserted, not model prose.

---

## 6. Offline / sovereign-machine readiness note

- **Today's dev box has neither an LLM backend nor a DEM.** Verified 2026-06-13:
  `/api/terrain/health` → `available:false, dem_exists:false`; no Ollama/LiteLLM
  configured. The Free Fight demo runs fully on the deterministic planner + geometric
  routes, with the correct degradation warnings. **This is the intended offline default.**
- **Switching on a deployment box is config-only** (per `ai-config.js` header):
  - Local Qwen via Ollama: `ollama pull qwen2.5:7b`, set `RMOOZ_OLLAMA_MODEL=qwen2.5:7b`
    (apiStyle stays `ollama`), set `RMOOZ_FREE_FIGHT_LLM=1`.
  - Qwen behind a LiteLLM proxy: set `apiStyle:'openai'`, `RMOOZ_OLLAMA_URL=<litellm base>`
    (or the zen block), `RMOOZ_OLLAMA_MODEL=<served qwen id>`, key via
    `RMOOZ_OLLAMA_API_KEY` / gitignored `ai-secrets.local.js`.
- **Security (owner rule, unchanged):** the real LiteLLM base URL / model / key live in
  the operator's `.env.offline` or `ai-secrets.local.js` **only** — never hardcoded in the
  repo, examples, image, or this doc. `.env.offline.example` ships blank placeholders.
- **Failure posture is non-blocking:** slow/absent model → timeout → deterministic plan +
  warning. The Free Fight demo never hangs waiting on an LLM (same fire-and-forget
  discipline as the terrain probe).

---

## 7. Explicitly out of scope (still, even with the LLM)

No weapons, no damage, no kill-probability, no real adjudication, no taxi/runway/takeoff,
no final tasking/COA, no world-state or journal writes. The LLM never sets coordinates or
unit counts. This remains a **review-only, commander-approval-gated demo**; the LLM only
makes the *explanation* richer and the *reaction-type choice* a little smarter, inside
guardrails the deterministic planner enforces.
