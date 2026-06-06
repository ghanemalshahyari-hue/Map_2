# LM Studio Migration Plan

**Status:** IMPLEMENTED 2026-04-24 (§6.1–§6.8). Scope = LLM call sites only;
embedder + reranker deferred.
**Prepared:** 2026-04-24.
**Purpose:** give Claude IDE an exact, repo-specific plan for routing this project's model calls through LM Studio via `.env`.

## LOCKED POST-IMPLEMENTATION ADDENDUM — Responses API (2026-04-24)

After the first migration pass the user directed: **every `ChatOpenAI` call in
this project MUST route through `POST /v1/responses` — NOT
`POST /v1/chat/completions`.** This is now load-bearing, not advisory.

- Enforced in `graph/shared/llm_factory.build_chat_llm()` via
  `use_responses_api=resolve_use_responses_api()`, default `True`.
- New env var `LLM_USE_RESPONSES_API` (default `1`) is a per-deployment escape
  hatch for a local model that genuinely cannot serve the Responses API. It is
  NOT a silent-fallback knob; flipping it requires a new user directive.
- The flag is folded into the Phase 3 cache key (`llm_use_responses_api`) so
  toggling between Responses and Chat Completions invalidates prior drafts
  instead of silently returning them.
- Recorded in `CLAUDE.md`, `AGENTS.md`, `docs/memory.md`. Do not remove.

## LOCKED SECOND POST-IMPLEMENTATION ADDENDUM — provider-based routing (2026-04-24)

The original plan scoped LLM-only migration and explicitly deferred embedder
+ reranker. The user subsequently directed a full provider-based abstraction
for LLM + dense embedder + reranker. This addendum supersedes the §4
"two-step migration" and §8 "reranker deferral" paragraphs in the main plan.
The plan text below is kept for historical reference but is no longer the
active architecture.

**New architecture (active truth):**

| role | env surface | FastEmbed fallback |
|---|---|---|
| LLM | `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` + per-role overrides, `LLM_USE_RESPONSES_API=1` default | n/a — LLM is HTTP-only |
| Dense embedder | `EMBED_PROVIDER` (`fastembed` / `http`) + `EMBED_BASE_URL` / `EMBED_API_KEY` / `EMBED_MODEL` | yes — in-process ONNX `BAAI/bge-m3` via `aapot/bge-m3-onnx` |
| Reranker | `RERANK_PROVIDER` (`fastembed` / `http`) + `RERANK_BASE_URL` / `RERANK_API_KEY` / `RERANK_MODEL` | yes — in-process ONNX `BAAI/bge-reranker-v2-m3` |
| BM25 sparse | not user-configurable | n/a — always in-process |

Cache provenance: `graph/generation/cache.py` folds `embed_provider`,
`embed_endpoint_tag`, `rerank_provider`, `rerank_endpoint_tag`,
`llm_endpoint_tag`, `llm_use_responses_api` into every per-group key.

Reranker failure policy: `graph/retrieval/rerank.py` raises
`RerankUnavailable`; `graph/retrieval/search.py` catches and degrades to
RRF-only. Retrieval does not hard-fail on rerank outage.

Re-ingest risk: flipping `EMBED_PROVIDER=http` on an existing corpus is
vector-parity-sensitive. bge-m3 GGUF over llama.cpp / LM Studio is not
guaranteed bit-identical to FastEmbed's ONNX path. Probe parity first
(cosine > 0.9999 on normalised vectors) or re-ingest after the swap.

## 1. Goal

Move the project's **LLM call sites** to **LM Studio's OpenAI-compatible API** so model names and endpoint settings live in `.env`, not in Python literals.

Desired result:

- one LM Studio server address in `.env`
- one API key/token in `.env`
- one global default model in `.env`
- optional per-role model overrides in `.env`
- no hardcoded `"gpt-4o-mini"` left in active model factories

## 2. Important constraint

As of **2026-04-24**, LM Studio's official docs clearly document:

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/embeddings`
- `GET /v1/models`
- model load/list endpoints under `/api/v1/*`

Relevant docs:

- [OpenAI Compatibility Endpoints](https://lmstudio.ai/docs/developer/openai-compat)
- [Embeddings](https://lmstudio.ai/docs/developer/openai-compat/embeddings)
- [Structured Output](https://lmstudio.ai/docs/advanced/structured-output)
- [Load a model](https://lmstudio.ai/docs/developer/rest/load)

I did **not** find an official LM Studio rerank endpoint in the current docs.

That means:

- **LLMs**: good fit for LM Studio now
- **Embeddings**: possible through LM Studio now
- **Reranker**: not a clean LM Studio swap from the current code path, based on documented APIs
- **BM25 sparse retrieval**: stays local; it is not an API-served model in this repo

LM Studio also documents **structured output via JSON schema**, which matters here because this repo relies on structured output heavily. That said, model capability still matters, so structured-output paths must be smoke-tested explicitly after the endpoint swap.

## 3. Current model touchpoints in this repo

### LLMs

- [`graph/shared/llm.py`](../graph/shared/llm.py)
  - Phase 1 `check_documents` gate
  - shared default for Phase 2 HyDE when model matches
- [`graph/retrieval/hyde.py`](../graph/retrieval/hyde.py)
  - optional HyDE LLM
- [`graph/generation/llm.py`](../graph/generation/llm.py)
  - Phase 3 extractor
  - Phase 3 drafter
  - Phase 3 critique

### Structured-output call sites to smoke-test

- [`graph/nodes/check_documents.py`](../graph/nodes/check_documents.py)
- [`graph/generation/prompt_extractor.py`](../graph/generation/prompt_extractor.py)
- [`graph/generation/source_file_extractor.py`](../graph/generation/source_file_extractor.py)
- [`graph/generation/section_drafter.py`](../graph/generation/section_drafter.py)
- [`graph/generation/critique.py`](../graph/generation/critique.py)

### Embeddings

- [`graph/shared/embedders.py`](../graph/shared/embedders.py)
  - dense embedder: FastEmbed `BAAI/bge-m3`
  - sparse embedder: FastEmbed `Qdrant/bm25`

### Reranker

- [`graph/retrieval/rerank.py`](../graph/retrieval/rerank.py)
  - FastEmbed cross-encoder `BAAI/bge-reranker-v2-m3`

### Config/docs/startup surfaces

- [`.env.example`](../.env.example)
- [`graph/config.py`](../graph/config.py)
- [`graph/retrieval/config.py`](../graph/retrieval/config.py)
- [`start.sh`](../start.sh)
- [`ui/phase3_tab.py`](../ui/phase3_tab.py)
- [`graph/generation/cache.py`](../graph/generation/cache.py)

## 4. Recommended rollout

Use a **two-step migration**.

### Step A: LM Studio for all LLMs

Implement this first. It is low-risk and directly aligned with LM Studio's documented APIs.

### Step B: optional embedding abstraction

Only do this after Step A is green.

This means adding an HTTP embedding provider branch for the dense embedder. If you change the embedding model or embedding runtime, assume you may need to **re-ingest** Qdrant collections.

### Do not make Step C part of the first pass

Do **not** try to force the current reranker into LM Studio unless you have a verified API shape for it. Keep reranking on FastEmbed for now, or add a provider abstraction with `fastembed` as the working backend and `lm_studio` reserved for later.

## 5. Recommended `.env` surface

Add these variables to [`.env.example`](../.env.example) and your live `.env`.

### 5.1 Shared LLM connection

```ini
# ============================================================================
# Shared OpenAI-compatible LLM endpoint
# ============================================================================
# LM Studio example:
#   LLM_BASE_URL=http://localhost:1234/v1
#   LLM_API_KEY=lm-studio
# If unset, langchain-openai falls back to the default OpenAI endpoint.
LLM_BASE_URL=
LLM_API_KEY=

# Global fallback model used when a per-role model is not set.
LLM_MODEL=
```

### 5.2 Per-role model mapping

```ini
# Phase 1 gate
PHASE1_GATE_MODEL=

# Phase 2 HyDE
QUERY_EXPAND_LLM_MODEL=

# Phase 3
PHASE3_EXTRACTOR_MODEL=
PHASE3_DRAFT_MODEL=
PHASE3_CRITIQUE_MODEL=
```

### 5.3 Optional embedding provider branch

```ini
# Dense embedder provider
# fastembed | lm_studio
EMBED_PROVIDER=fastembed
EMBED_BASE_URL=
EMBED_API_KEY=
EMBED_MODEL=
```

### 5.4 Reranker provider branch

```ini
# Reranker provider
# fastembed only for now; add lm_studio only when a real endpoint is verified
RERANK_PROVIDER=fastembed
```

## 6. Required code changes

## 6.1 Create one shared ChatOpenAI builder

Add a new helper module:

- `graph/shared/llm_factory.py`

It should centralize:

- endpoint/base URL resolution
- API key resolution
- model precedence
- creation of `ChatOpenAI`

Suggested functions:

```python
def resolve_llm_base_url() -> str | None: ...
def resolve_llm_api_key() -> str | None: ...
def resolve_model(*, role_env: str, default: str) -> str: ...
def build_chat_llm(*, role_env: str, default_model: str, temperature: float) -> ChatOpenAI: ...
```

Recommended model precedence:

1. role-specific env var, e.g. `PHASE3_DRAFT_MODEL`
2. global `LLM_MODEL`
3. code default

Recommended connection precedence:

1. `LLM_BASE_URL`
2. otherwise provider default

Recommended key precedence:

1. `LLM_API_KEY`
2. otherwise `OPENAI_API_KEY`

This keeps rollback simple.

## 6.2 Refactor `graph/shared/llm.py`

Replace direct `ChatOpenAI(...)` construction with the shared factory.

Current hardcoded model:

- `_LLM_MODEL = "gpt-4o-mini"`

New behavior:

- default stays `"gpt-4o-mini"`
- env override via `PHASE1_GATE_MODEL`
- global fallback via `LLM_MODEL`
- endpoint from `LLM_BASE_URL`

## 6.3 Refactor `graph/generation/llm.py`

Replace raw `ChatOpenAI(...)` construction with the shared factory.

Keep the current per-role temperature split:

- extractor: `0.0`
- critique: `0.0`
- draft: `0.2`

But remove hard dependency on hardcoded model names.

This file should still expose:

- `draft_config()`
- `critique_config()`
- `extractor_config()`
- `get_draft_llm()`
- `get_critique_llm()`
- `get_extractor_llm()`

Those config functions must reflect the new env precedence so cache keys remain honest.

## 6.4 Refactor `graph/retrieval/hyde.py`

Keep HyDE behavior the same, but make its model/env handling consistent.

Required behavior:

- if `QUERY_EXPAND_LLM_MODEL` resolves to the same model as the shared Phase 1 gate model, reuse the shared singleton
- if not, build a separate `ChatOpenAI` using the same `LLM_BASE_URL` and `LLM_API_KEY`

## 6.5 Update `.env.example`

Document:

- LM Studio base URL example: `http://localhost:1234/v1`
- placeholder API key like `lm-studio`
- per-role model mapping
- note that `OPENAI_API_KEY` may still need a non-empty placeholder unless config loading is relaxed

## 6.6 Update `graph/config.py`

Current code requires `OPENAI_API_KEY`.

Recommended first pass:

- keep it required
- when using LM Studio, set:

```ini
OPENAI_API_KEY=lm-studio
LLM_API_KEY=lm-studio
```

This is the safest low-risk option because it avoids reopening config plumbing everywhere.

Optional cleanup later:

- make `OPENAI_API_KEY` optional when `LLM_BASE_URL` is set

Do that only after the first LM Studio migration is working.

## 6.7 Update `start.sh`, docs, and labels

Adjust wording so startup help no longer says the project is specifically tied to OpenAI.

Files:

- [`start.sh`](../start.sh)
- [`main.py`](../main.py) comments
- [`ui/phase3_tab.py`](../ui/phase3_tab.py) active-model display fallback

The wording should become "OpenAI-compatible endpoint" rather than "OpenAI only".

## 6.8 Cache safety

The Phase 3 cache already includes model names and temperatures, but once LLM endpoint routing changes, cache provenance should also include the endpoint identity.

Add the resolved LLM base URL, or a stable marker such as:

- `openai-default`
- `http://localhost:1234/v1`

to the Phase 3 cache key inputs in [`graph/generation/cache.py`](../graph/generation/cache.py).

This avoids stale cache hits after switching from cloud OpenAI to LM Studio.

## 6.9 Structured-output caution

After the endpoint swap, explicitly smoke-test the structured-output flows listed above.

If a local LM Studio-backed model connects successfully but fails schema-constrained tasks, investigate those call sites first before changing broader logic.

Do not preemptively rewrite all structured-output usage. First pass should:

- keep existing `with_structured_output(...)` logic
- switch endpoint/model routing
- run smoke tests
- only then adjust structured-output method details if a real failure appears

## 7. Optional embedding migration

Only do this after LLM migration passes.

### 7.1 Add provider branching in `graph/shared/embedders.py`

Current dense embedder:

- FastEmbed local `BAAI/bge-m3`

Add:

- `EMBED_PROVIDER=fastembed|lm_studio`

When `EMBED_PROVIDER=lm_studio`, create a small HTTP/OpenAI-compatible embeddings shim that exposes the methods the repo actually uses.

Do **not** touch BM25 sparse retrieval.

### 7.2 Re-ingest warning

If you switch dense embeddings to LM Studio:

- assume vector parity is **not guaranteed**
- assume Qdrant collections may need full re-ingestion

That is especially true if the model changes from current `BAAI/bge-m3`.

## 8. Reranker recommendation

Do not promise full LM Studio reranker migration in the first implementation brief.

Recommended handling:

- keep current FastEmbed reranker
- optionally add `RERANK_PROVIDER=fastembed`
- reserve `lm_studio` as future work only if a verified rerank endpoint exists

This keeps the first migration honest and shippable.

## 9. LM Studio connection steps for the user

These are the operator steps, not code changes.

### 9.1 Start LM Studio server

Use the Developer page in LM Studio, or CLI:

```bash
lms server start
```

Default server address is documented as:

```text
http://localhost:1234
```

### 9.2 Load or download models

You can:

- load from the LM Studio UI, or
- use CLI:

```bash
lms ls
lms load <model-key> --identifier my-llm
```

For embeddings, LM Studio docs also support embedding models and `/v1/embeddings`.

### 9.3 Point this repo to LM Studio

Put this in `.env`:

```ini
OPENAI_API_KEY=lm-studio
LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=lm-studio
LLM_MODEL=my-llm

PHASE1_GATE_MODEL=my-llm
QUERY_EXPAND_LLM_MODEL=my-llm
PHASE3_EXTRACTOR_MODEL=my-llm
PHASE3_DRAFT_MODEL=my-llm
PHASE3_CRITIQUE_MODEL=my-llm
```

You can start with only:

```ini
LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=lm-studio
LLM_MODEL=my-llm
```

if the code implements the global fallback precedence correctly.

### 9.4 Quick connectivity test

Before running the repo, verify the model is visible:

```bash
curl http://localhost:1234/v1/models
```

Then verify chat:

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer lm-studio" \
  -d '{
    "model": "my-llm",
    "messages": [{"role": "user", "content": "respond with pong"}]
  }'
```

Then verify embeddings if you implement embedding routing:

```bash
curl http://localhost:1234/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer lm-studio" \
  -d '{
    "model": "my-embedding-model",
    "input": ["warning order"]
  }'
```

## 10. Verification checklist for Claude IDE

- [ ] `.env.example` documents LM Studio env vars
- [ ] all active `ChatOpenAI(...)` construction flows route through one shared factory
- [ ] no active model factory hardcodes `"gpt-4o-mini"` without env override support
- [ ] `graph/shared/llm.py` uses `PHASE1_GATE_MODEL` or `LLM_MODEL`
- [ ] `graph/generation/llm.py` uses role-specific env vars with `LLM_MODEL` fallback
- [ ] `graph/retrieval/hyde.py` respects `LLM_BASE_URL` and `LLM_API_KEY`
- [ ] Phase 3 cache key includes endpoint provenance
- [ ] startup/docs wording no longer implies OpenAI is the only supported endpoint
- [ ] `python -m graph.generation.llm` shows the expected resolved model names
- [ ] `python scripts/smoke_y_schemas.py` still passes
- [ ] `python scripts/generate_documents.py ...` still works with LM Studio-backed LLMs

## 11. Recommended implementation order for Claude IDE

1. Add `.env.example` entries.
2. Add `graph/shared/llm_factory.py`.
3. Refactor `graph/shared/llm.py`.
4. Refactor `graph/generation/llm.py`.
5. Refactor `graph/retrieval/hyde.py`.
6. Update `graph/generation/cache.py`.
7. Update `ui/phase3_tab.py`, `start.sh`, and comments/docs.
8. Test LM Studio chat routing.
9. Run Phase 3 smoke.
10. Only then consider dense embedding abstraction.

## 12. Copy-paste brief for Claude IDE

Use this exact prompt:

```text
Read docs/memory.md first and follow its instructions.

Then implement the plan in docs/lm_studio_migration_plan.md.

Scope for this pass:
- LM Studio migration for all ChatOpenAI-based call sites only
- centralize endpoint/model resolution in one shared helper
- add env-driven model mapping in .env.example
- keep current temperatures and behavior otherwise
- keep FastEmbed dense embeddings, BM25 sparse retrieval, and FastEmbed reranker unchanged for now
- make cache provenance safe when switching endpoints
- update any startup/docs text that incorrectly implies OpenAI is the only supported endpoint

Do not widen scope to a reranker rewrite.
Do not remove existing fallbacks.
Do not break standalone module entrypoints.

After changes, run the smallest available verification commands and report what passed and what was not run.
```
