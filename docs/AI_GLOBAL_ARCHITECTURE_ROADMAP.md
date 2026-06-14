# AI Global Architecture Roadmap — RMOOZ / CMO
**Task:** `AI-GLOBAL-ARCHITECTURE-ROADMAP-A`  
**Status:** Planning — no code changed.  
**Basis:** Full inspection of all AI-related files as of `f2e9644` (2026-06-14).

---

## A. Current AI Inventory

### Server-side AI modules (`UI_MOdified/server/ai/`)

| File | Purpose | Provider path | Model config source | Deterministic? | Problems |
|---|---|---|---|---|---|
| `ai-config.js` (246 ln) | Single config source — url, model, apiKey, timeouts for all three providers | — | Defaults → `ai-secrets.local.js` overlay → env vars (`RMOOZ_OLLAMA_MODEL`, `ANTHROPIC_API_KEY`, `OPENCODE_ZEN_API_KEY`, etc.) | Yes (pure config) | `defaultModel` is Ollama-only name; Claude/Zen models live in separate nested blocks — callers must know which block to read |
| `ai-provider.js` (184 ln) | **Global router** — resolves `'auto'`/`'claude'`/`'zen'`/`'ollama'` → correct backend, auto-fallback chain | ollama → claude → zen | `ai-config.js` | Yes (routing logic only) | ✅ Mostly right, but not used by `step1-llm-fill.js` or `free-fight-llm-plan.js`'s inner timeout logic |
| `ollama-client.js` (367 ln) | Direct Ollama REST client (`/api/generate`, `/api/chat`); also supports OpenAI-style dialect | Ollama / OpenAI-compat | `ai-config.js` | Yes | Still named "ollama" despite speaking two dialects; `step1-llm-fill.js` bypasses `ai-provider` and calls this directly |
| `claude-client.js` (263 ln) | Anthropic API client (XML prompt structure, cache_control) | Claude | `ai-config.claude.*` | Yes | Separate prompt structure vs Ollama path; not exposed to `step1-llm-fill.js` |
| `zen-client.js` (260 ln) | opencode.ai Zen gateway (OpenAI-compatible proxy for Claude) | Zen/Claude via proxy | `ai-config.zen.*` | Yes | Third provider path; same gap as Claude re: `step1-llm-fill.js` |
| `adjudicator-agent.js` (1180 ln) | **Core wargame adjudicator.** Per-step: build prompt → call LLM → validate → fallback to baseline. 8 trial hints; mock mode; Monte Carlo seeding. | via `ai-provider.js` ✅ | `ai-config.js` | No (LLM) | `extractJson` imported from `red-team-agent.js` (shared) but does NOT strip `<think>` blocks — breaks with qwen3-coder/DeepSeek-R1 |
| `adjudicator-schema.js` (557 ln) | Schema definitions + baseline state constructor for wargame steps | — | — | Yes (pure) | — |
| `adjudicator-validator.js` | 3-layer validation (structural / monotonicity / plausibility) | — | — | Yes (pure) | — |
| `red-team-agent.js` (640 ln) | Red/Blue per-turn action proposer. Builds battlefield text → call LLM → validate actions. Exports `extractJson` (brace-counter approach; no think-stripping). | via `ai-provider.js` ✅ | Caller passes `model` | No (LLM) | `extractJson` lacks `<think>` stripping; `shouldRequestJsonFormat` partially works around this for `gpt-oss` but not qwen3-coder |
| `coa-agent.js` (390 ln) | Course-of-Action generator. Produces 3-5 COA cards from scenario + commander intent. | via `ai-provider.js` ✅ | `ai-config.js` + caller `model` arg | No (LLM) | Reuses `extractJson` from `red-team-agent.js` — same `<think>` gap |
| `coa-schema.js` (207 ln) | COA plan JSON schema validation | — | — | Yes (pure) | — |
| `free-fight-llm-plan.js` (231 ln) | Free Fight demo AI. Produces advisory attack/reaction plans for the map demo. Has its own `parseJsonResponse` (find-first-`{}`). Enabled only via `RMOOZ_FREE_FIGHT_LLM=1`. | via `ai-provider.js` ✅ | env vars: `RMOOZ_FREE_FIGHT_LLM_PROVIDER`, `RMOOZ_FREE_FIGHT_LLM_MODEL`, `RMOOZ_AI_PROVIDER` | No (LLM) | Has its OWN `parseJsonResponse` (4th JSON extraction function); uses multi-level env var cascade that partially duplicates `ai-config.js`; no `<think>` stripping |
| `monte-carlo-runner.js` (447 ln) | Drives N independent adjudicator trials across all steps; semaphore concurrency; SSE streaming | via `adjudicator-agent.js` | — | No (LLM via delegate) | — |
| `step1-llm-fill.js` (295 ln) | **NEW (f2e9644).** LLM enrichment for weak Step 1 doc extracts. Has its own `extractJson` (strips `<think>` blocks ✅), own `providerAvailable()`, own prompt builder. | **Bypasses `ai-provider.js` — calls `ollama-client.js` directly** | `ai-config.js` (`cfg.aiProvider`, `cfg.defaultModel`) | No (LLM) | **The problem this roadmap addresses:** step-specific, disconnected from the router, can't fall back to Claude/Zen, duplicates JSON extraction, duplicates guardrail patterns |
| `operational-brief.js` (759 ln) | Step 1 document analysis — fully deterministic. Extracts mission, units, phases from DOCX text. | None (no LLM) | — | **Yes** | Should stay deterministic; `llm_fill` is an enrichment layer on top, never inside |
| `planning-model.js` (643 ln) | Deterministic planning-model unification. `source_type='llm_candidate'` is the lowest-priority source but no actual LLM calls here. | None (no LLM) | — | **Yes** | Good design — `llm_candidate` as a source type without wiring LLM in the core model |
| `location-intelligence.js` (581 ln) | Deterministic location resolver (gazetteer, incident log, explicit coords). Accepts `llm_candidate` placeholder from caller — never calls LLM directly. | None (no LLM) | — | **Yes** | Good design; LLM candidates are passed in, not generated here |
| `brief-to-scenario.js` | Deterministic scenario generation from a reviewed brief. `placement_source: 'reviewed_base_anchor'` logic. | None | — | **Yes** | Should stay deterministic |

### Prompt files (`server/ai/prompts/`)

| File | Used by | Notes |
|---|---|---|
| `adjudicator-system.txt` (139 ln) | `adjudicator-agent.js` | Ollama path |
| `adjudicator-system-claude.txt` (151 ln) | `adjudicator-agent.js` | Claude path (XML tags + cache_control) |
| `coa-system.txt` (151 ln) | `coa-agent.js` | |
| `red-team-system.txt` (58 ln) | `red-team-agent.js` | |
| `blue-team-system.txt` (59 ln) | `red-team-agent.js` | |

Prompts for `step1-llm-fill.js` and `free-fight-llm-plan.js` are **hardcoded inline** in those modules — not in `prompts/`.

### HTTP AI endpoints (`web-server.js`)

| Route | Method | Agent/module | Notes |
|---|---|---|---|
| `GET /api/ai/health` | GET | `ollama-client.js` ping | Legacy; predates `ai-provider.js` |
| `GET /api/ai/provider/status` | GET | `ai-provider.js` getStatus() | ✅ Full multi-provider health |
| `POST /api/ai/coa` | POST | `coa-agent.js` | Provider + model override from body |
| `POST /api/ai/generate` | POST | `ollama-client.js` directly | **Bypasses `ai-provider.js`** |
| `POST /api/ai/chat` | POST | `ollama-client.js` directly | **Bypasses `ai-provider.js`** |
| `POST /api/ai/red-team/propose` | POST | `red-team-agent.js` | |
| `POST /api/ai/blue-team/propose` | POST | `red-team-agent.js` (side=blue) | |
| `POST /api/ai/adjudicate` | POST | `adjudicator-agent.js` | |
| `POST /api/ai/mc/start` | POST | `monte-carlo-runner.js` | |
| `GET /api/ai/mc/:id/events` | GET SSE | `monte-carlo-runner.js` | |
| `POST /api/wargame-sim/analyze` | POST | `operational-brief.js` → `step1-llm-fill.js` | New (f2e9644) |
| `POST /api/wargame-sim/generate` | POST | `brief-to-scenario.js` | Deterministic |
| `POST /api/sim/decide` | POST | `world-state-engine.js` | Deterministic (WS3) |
| `POST /api/ai/feedback` | POST | `feedback-store.js` | |
| `GET /api/ai/report.html` | GET | `report-builder.js` | |

### Client-side AI consumers

| File | What it does |
|---|---|
| `client/shell/ai-proposal-bridge.js` | Bridges adjudicator proposals to UI. Sends `mockMode:true` to skip live AI during tests. |
| `client/shell/free-fight-ai.js` | Calls `POST /api/wargame-sim/analyze` and Free Fight plan endpoint |
| `client/shell/free-fight-demo.js` | Demo mode hooks |
| `client/wargame/adjudicator-client.js` | Calls `/api/ai/adjudicate` |
| `client/wargame/adjudicator-hud.js` | Renders adjudicator proposals |
| `client/wargame/red-team-controller.js` | Calls `/api/ai/red-team/propose` |
| `client/shell/coa-review-panel.js` | Renders COA cards |
| `client/shell/doc-understanding-review.js` | Renders Step 1 analysis + `[AI]` badge |
| `client/shell/scenario-runner.js` | Wires world-state + adjudicator step loop |
| `client/shell/world-state.js` | Tracks applied world state |

---

## B. Proposed Global Architecture

```
UI_MOdified/server/ai/
│
├── ai-service.js            ← NEW: single call surface for all LLM work
│                              AiService.run(task) → standardized output envelope
│
├── ai-task-router.js        ← NEW: maps task_type → { provider policy, model
│                              policy, prompt builder, schema, guardrails }
│                              replaces per-module provider selection
│
├── ai-prompts.js            ← NEW: all prompt builders in one module
│                              (replaces inline prompt strings in each agent)
│
├── ai-schemas.js            ← NEW: all output JSON schemas in one module
│                              (replaces per-agent output_schema inline)
│
├── ai-guardrails.js         ← NEW: shared normalization + safety enforcement
│                              exact_unit_position:false, null coords, etc.
│                              replaces normalizeUnit/normalizeBase/validateAndSanitize
│
├── ai-json.js               ← NEW: single extractJson with <think> stripping,
│                              fence removal, brace-counter, tolerant-parse
│                              (replaces 4 separate implementations)
│
├── ai-observability.js      ← NEW: trace ID generation, structured logging,
│                              raw_sample capture, parse_status, provider used
│
├── providers/               ← RENAME existing provider clients
│   ├── ollama-provider.js   ← (was ollama-client.js — rename only, same API)
│   ├── anthropic-provider.js← (was claude-client.js — rename only, same API)
│   └── litellm-provider.js  ← (was zen-client.js, or future LiteLLM gateway)
│
│   KEEP (unchanged):
├── ai-config.js             ← stays; config is already well designed
├── ai-provider.js           ← keep as the routing layer; ai-service.js wraps it
├── adjudicator-agent.js     ← keep; migrate to ai-service.run() internally
├── adjudicator-schema.js    ← keep (pure)
├── adjudicator-validator.js ← keep (pure)
├── red-team-agent.js        ← keep; migrate extractJson to ai-json.js
├── coa-agent.js             ← keep; migrate extractJson to ai-json.js
├── coa-schema.js            ← keep (pure)
├── free-fight-llm-plan.js   ← keep (DO NOT TOUCH — separate scope)
├── monte-carlo-runner.js    ← keep (drives adjudicator, no direct AI calls)
├── step1-llm-fill.js        ← keep working; mark as Phase 1 migration source
├── operational-brief.js     ← keep fully deterministic
├── planning-model.js        ← keep fully deterministic
├── location-intelligence.js ← keep fully deterministic
├── brief-to-scenario.js     ← keep fully deterministic
└── prompts/                 ← keep existing .txt files; ai-prompts.js wraps them
```

---

## C. Global AI Task Types

These are the named operations the AI layer should know about. Each maps to a prompt, schema, guardrail set, and model policy.

| Task type | Description | Current module | Output safety level |
|---|---|---|---|
| `step1_review_fill` | Enrich weak Step 1 doc extraction (units, bases, mission) | `step1-llm-fill.js` | High — null coords, review-only |
| `adjudication_step` | Wargame step adjudication (state transition) | `adjudicator-agent.js` | High — validated against schema + baseline fallback |
| `red_team_proposal` | Per-turn RED action proposals | `red-team-agent.js` | High — geo-validated, no phantom units |
| `blue_team_proposal` | Per-turn BLUE action proposals (same schema) | `red-team-agent.js` | High |
| `coa_generation` | Generate 3-5 Courses of Action | `coa-agent.js` | Medium — no placement, commander review required |
| `free_fight_plan` | Demo advisory attack/reaction plan | `free-fight-llm-plan.js` | High — FORBIDDEN_TEXT enforced, `advisory_only:true` |
| `objective_interpretation` | Parse objective description → coord candidate | *(not yet wired)* | High — null coords, geocoding required |
| `scenario_generation_review` | Review proposed scenario parameters before generate | *(not yet wired)* | High — draft_only, no auto-place |
| `movement_recommendation` | Suggest movement route for a unit | *(not yet wired)* | High — qualitative only, no GPS trail |
| `engagement_recommendation` | Suggest engagement decision for a unit | *(not yet wired)* | High — advisory only, commander confirms |
| `why_not_explanation` | Explain why a unit can't do something | *(not yet wired)* | Low — read-only explanation |
| `after_action_review` | Analyze a completed MC run for lessons | *(not yet wired)* | Low — analysis only |
| `data_quality_audit` | Flag data gaps, ambiguities, schema violations | *(not yet wired)* | Low — annotation only |

---

## D. Standard Global AI Call Contract

Every call to `AiService.run()` should use this input envelope:

```js
AiService.run({
  task_type,        // string — one of the task types above (required)
  input,            // object — task-specific data (required)
  context,          // object — scenario metadata, step index, etc. (optional)
  world_state,      // object — current world state snapshot (optional)
  constraints,      // object — operator-declared constraints (optional)
  output_schema,    // object — JSON schema for the expected output (optional, default from task router)
  guardrails,       // string[] — extra guardrail keys beyond the task default (optional)
  model_policy,     // object — { provider?, model?, timeoutMs? } — override (optional)
  trace_id,         // string — caller-generated trace ID; generated if absent (optional)
})
```

The task router resolves missing fields from its per-task defaults. Callers that don't know the task type use `task_type: 'generic'` (passthrough, no guardrails).

---

## E. Standard AI Output Envelope

Every result from `AiService.run()` returns:

```js
{
  ok,               // boolean — true = usable result; false = fell back or failed
  task_type,        // string — echoed from input
  model,            // string — actual model used
  provider,         // string — 'ollama' | 'claude' | 'zen'
  confidence,       // 'high' | 'medium' | 'low' | null
  result,           // object — parsed, validated, guardrail-normalized output
  assumptions,      // string[] — AI-stated assumptions
  uncertainties,    // string[] — AI-stated uncertainties
  warnings,         // string[] — guardrail warnings triggered
  evidence,         // string[] — source_evidence quotes (where applicable)
  needs_review,     // boolean — always true for position/placement tasks
  raw_sample,       // string — first 400 chars of raw LLM response (debug)
  parse_status,     // 'ok' | 'repaired' | 'fallback' | 'failed'
  trace_id,         // string — propagated from input or generated
  duration_ms,      // number — wall clock of the LLM call
  fell_back_from,   // string | null — 'claude' | 'zen' if auto-fallback occurred
}
```

---

## F. Global Guardrails

These rules apply to ALL AI tasks. They are enforced post-parse by `ai-guardrails.js`, not by prompting alone. Prompts request the right shape; guardrails enforce it regardless.

| Rule | Enforcement | Current status |
|---|---|---|
| AI cannot produce non-null `lat`/`lon` for unit placement | `normalizeUnit` / `normalizeBase` strip any coords to `null` | ✅ Only in `step1-llm-fill.js`; missing from all other agents |
| AI cannot produce `exact_unit_position:true` | Force `false` post-parse | ✅ Only in `step1-llm-fill.js` and `free-fight-llm-plan.js` |
| AI output that places/moves units must be `needs_review:true` | Force `true` on all placement outputs | ✅ Only in `step1-llm-fill.js`; implicit in adjudicator (no direct coords) |
| AI must mark uncertainty | `uncertainties[]` array required | ✅ Only in `step1-llm-fill.js` |
| `source_type:'llm_*'` on every AI-derived item | Stamp on all AI outputs | ✅ Only in `step1-llm-fill.js` |
| No forbidden operational language (Free Fight scope) | `FORBIDDEN_TEXT` regex | ✅ Only in `free-fight-llm-plan.js` |
| AI decisions must include `reason` or `source_evidence` | Required field in schema | Partially (adjudicator has rationale; step1 has `source_evidence`) |
| Schema parse failure → safe fallback, never crash | `mergeFailure()` / baseline state | ✅ Adjudicator (baseline); ✅ step1 (deterministic fallback); partial elsewhere |
| AI must never overwrite deterministic truth | Merge strategy: AI fills gaps only | ✅ `step1-llm-fill.js` `isWeak` gate; ✅ adjudicator baseline |
| `draft:true` on all AI-generated scenario items | Stamp post-parse | ✅ Only in `step1-llm-fill.js` |
| Explicit coordinate detection in AI text fields | `assertNoForbiddenText` checks for `lat`/`lon`-like patterns in strings | ✅ Only in `free-fight-llm-plan.js` |

**Summary:** The guardrails exist in scattered, per-module form. They need to be extracted into a shared `ai-guardrails.js` so they can be applied consistently across all task types.

---

## G. Migration Plan

### Phase 1 — Extract shared helpers (no behaviour change)
**Goal:** stop duplication from growing further.  
**Scope:** new files only; no existing module is modified.

1. Create `server/ai/ai-json.js`
   - Export `extractJson(raw)` — the **best** version: brace-counter from `red-team-agent.js` (handles nested braces correctly) + `<think>` block stripping from `step1-llm-fill.js` + markdown fence removal + `tolerantParse` from `red-team-agent.js`.
   - Keep `step1-llm-fill.js`'s own `extractJson` temporarily; point it at `ai-json.js` in Phase 2.
   
2. Create `server/ai/ai-guardrails.js`
   - Export `normalizeUnitItem(u)`, `normalizeBaseItem(b)`, `assertNoCoords(obj)`, `stampReviewFlags(item, source_type)`.
   - Based on `step1-llm-fill.js`'s `normalizeUnit`/`normalizeBase` + `free-fight-llm-plan.js`'s `validateAndSanitize`.
   - No existing module calls this yet.

### Phase 2 — Create `ai-service.js` + route Step 1 through it
**Goal:** `step1-llm-fill.js` uses the real provider router.

1. Create `server/ai/ai-service.js`
   - Thin orchestrator: receives call envelope → calls `ai-task-router.js` for defaults → calls `ai-provider.generate()` → extracts JSON via `ai-json.js` → applies guardrails via `ai-guardrails.js` → returns output envelope.
2. Update `step1-llm-fill.js`
   - Replace `require('./ollama-client')` with `require('./ai-provider')`.
   - Replace inline `extractJson` with `require('./ai-json').extractJson`.
   - Replace `providerAvailable()` with `ai-provider.getStatus()` check.
   - Replace inline `normalizeUnit`/`normalizeBase` with `ai-guardrails.js`.

### Phase 3 — Move prompts/schemas to shared modules
**Goal:** prompts are auditable in one place.

1. Create `server/ai/ai-prompts.js`
   - Export builder functions: `buildStep1ReviewPrompt(docTexts)`, `buildAdjudicatorPrompt(...)`, etc.
   - For `.txt` file prompts: load from `prompts/` and export as named constants.
   - Inline prompts (step1, free-fight) move here.

2. Create `server/ai/ai-schemas.js`
   - Export: `STEP1_REVIEW_OUTPUT_SCHEMA`, `ADJUDICATOR_STEP_SCHEMA`, `COA_PLAN_SCHEMA`, `FREE_FIGHT_PLAN_SCHEMA`, etc.
   - These define the JSON shapes expected from the LLM; currently inline in each agent.

### Phase 4 — Add observability
**Goal:** every AI call emits a trace entry.

1. Create `server/ai/ai-observability.js`
   - Export `newTraceId()`, `logAiCall({ task_type, trace_id, model, provider, duration_ms, parse_status, ok })`.
   - Write to `data/ai-trace/` (JSONL, rotate daily, truncate to last 1000 entries).
   - `raw_sample` (first 400 chars) stored on each trace entry for debugging.

2. `ai-service.js` auto-wraps every call.

### Phase 5 — Wire future tasks through the router
**Goal:** new AI features have a clear home; no new isolated files.

- Any future AI feature (movement recommendation, objective interpretation, after-action review) calls `AiService.run({ task_type: 'movement_recommendation', ... })`.
- The task router provides prompt, schema, guardrails, and model policy.
- If the task has no LLM yet, the router returns `{ ok: false, reason: 'task_not_wired' }` — a stub, never a crash.

---

## H. What NOT To Do

| Anti-pattern | Rule |
|---|---|
| Add `step2-llm-fill.js`, `step3-llm-fill.js` | ❌ Any new LLM task routes through `ai-service.js` and the task router |
| Client code calling AI providers directly | ❌ Client calls HTTP routes only; providers are server-only |
| Mix AI provider calls with scenario generation | ❌ `brief-to-scenario.js`, `planning-model.js`, `location-intelligence.js` stay deterministic |
| AI output that mutates scenario state without review | ❌ All AI outputs are `needs_review:true` until operator confirms |
| Ollama-specific env vars (`RMOOZ_OLLAMA_MODEL`) spread across modules | ❌ Only `ai-config.js` reads env vars; all modules read from `ai-config.js` |
| Hardcoded model names (e.g. `'qwen2.5:7b'`) outside `ai-config.js` | ❌ Consolidate to config + task-router defaults |
| A fourth JSON extraction function | ❌ Consolidate to `ai-json.js` |
| Free Fight code changes without an explicit task | ❌ Free Fight LLM path (`free-fight-llm-plan.js`) is stable; leave it until Phase 5 |
| `<think>` block assumption baked into prompts | ❌ Strip in `ai-json.js`; don't tell models not to think |

---

## I. Immediate Recommendation for `step1-llm-fill.js`

**Recommendation: Keep it as the first migration source.**

Current status: working, tested (55 assertions), pushed (`f2e9644`). It solved the immediate problem (Beirut docs, 7 units extracted, null coords, no ring violations).

What it demonstrates (and what makes it a good migration source):
- `providerAvailable()` — needs to become `ai-provider.getStatus()` check
- `extractJson()` — the best version (think-stripping + fence-removal); promote to `ai-json.js`
- `normalizeUnit()` / `normalizeBase()` — best guardrail implementations; promote to `ai-guardrails.js`
- `mergeFailure()` / `mergeSuccess()` — good fallback pattern; generalize as output envelope
- `isWeak()` — task-specific gate logic; belongs in the task router, not the fill module
- Direct `ollama-client.js` call — the one thing to fix; replace with `ai-provider.generate()`

The module is **not** renamed. It stays as `step1-llm-fill.js` with its current behaviour throughout Phase 1. In Phase 2, it is updated to use the shared helpers. In Phase 3, its inline prompt and schema move out. After Phase 3, it becomes a thin wrapper around `AiService.run('step1_review_fill')`.

Do NOT refactor it now. The migration path is clear; the refactor happens after `ai-json.js` and `ai-guardrails.js` exist and are tested.

---

## Current Pain Points (Summary)

| Problem | Files affected | Severity |
|---|---|---|
| Four separate JSON extraction implementations | `red-team-agent.js`, `adjudicator-agent.js` (via red-team), `free-fight-llm-plan.js`, `step1-llm-fill.js` | Medium — diverge over time; `<think>` fix only in one |
| `step1-llm-fill.js` bypasses `ai-provider.js` | `step1-llm-fill.js` → `ollama-client.js` | Medium — can't fall back to Claude/Zen |
| Guardrail normalization scattered | `step1-llm-fill.js`, `free-fight-llm-plan.js`, implicit elsewhere | Medium — new tasks won't get guardrails automatically |
| `POST /api/ai/generate` and `/chat` bypass router | `web-server.js` lines 537–553 | Low — raw pass-through; no guardrails, no fallback |
| Inline prompts (not in `prompts/` dir) | `step1-llm-fill.js`, `free-fight-llm-plan.js` | Low — not auditable alongside `.txt` files |
| `<think>` block stripping missing from adjudicator/COA/red-team | All three agents | **High if qwen3-coder is used** — breaks JSON parse |
| No trace IDs or structured AI observability | All AI calls | Low (now) — will matter as usage grows |

---

*Written by AI-GLOBAL-ARCHITECTURE-ROADMAP-A inspection, 2026-06-14.*  
*No code was changed. All file line counts and behaviour descriptions verified against the live codebase at `f2e9644`.*
