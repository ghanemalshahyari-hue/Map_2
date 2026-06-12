# Full Local-Model Migration — LLM + Embedder + Reranker

**Status update 2026-04-24 — superseded architecturally, retained as a
reference for server choices.**

The active architecture is no longer Ollama-only + Infinity-only. See
[`docs/memory.md`](memory.md), [`CLAUDE.md`](../CLAUDE.md), and
[`docs/lm_studio_migration_plan.md`](lm_studio_migration_plan.md) for
the current locked decision: **provider-based routing via `LLM_*` /
`EMBED_*` / `RERANK_*` env vars** built around
`graph/shared/llm_factory.py`, `graph/shared/embedders.py`, and
`graph/retrieval/rerank.py`. The HTTP paths are backend-agnostic
(OpenAI-compatible); Ollama, LM Studio, Infinity, TEI, and
llama.cpp server are all valid targets. FastEmbed stays as a
first-class fallback for embedder + reranker — it is NOT deprecated.

What is still useful below:
- the server-selection rationale (Ollama vs LM Studio, Infinity vs TEI)
- the Ollama structured-output quirks for Gemma
- the parity concerns around bge-m3 ONNX vs bge-m3 GGUF

What is stale below and has been replaced:
- the "single-server" assumption (the abstraction is generic now)
- the fixed `http://localhost:6767` / `11434` endpoints (now in `.env`)
- the "FastEmbed is legacy that will be removed" framing
  (FastEmbed is a first-class fallback; both paths are supported)

---

**Original status:** planned, not executed. Written 2026-04-23. Next session executes this doc cold.

**Goal:** swap all three cloud/ONNX-local model touchpoints to HTTP-served local endpoints so the Mac dev box mirrors the offline Ubuntu deployment:

| role | from | to | endpoint |
|---|---|---|---|
| **LLM** (Phase 3 draft/critique/extractor + Phase 1 gate + Phase 2 HyDE) | OpenAI `gpt-4o-mini` | **Ollama → Gemma 4 31B Q4_K_M** | `http://localhost:11434/v1` |
| **Dense embedder** (BAAI/bge-m3, ingest + retrieval) | FastEmbed ONNX (in-process) | **Infinity → BAAI/bge-m3** | `http://localhost:6767/v1` |
| **Reranker** (BAAI/bge-reranker-v2-m3, retrieval) | FastEmbed ONNX (in-process) | **Infinity → BAAI/bge-reranker-v2-m3** | `http://localhost:6767/rerank` |
| Sparse (BM25) | FastEmbed `Qdrant/bm25` (pure Python) | **unchanged — stays in-process** | — |

Same pattern as the offline PC: each service behind its own OpenAI-compatible HTTP endpoint, selected via `.env` base-URL vars. Python call sites unchanged; factories gain shims.

**Why Ollama for LLM:**
- LM Studio's speed advantage on Apple Silicon (MLX) is broken for Gemma 4 as of early April 2026 (`mlx-community` 4-bit load fails, LM Studio MLX backend unsupported).
- Ollama is first-class headless, has an official Docker image, and its OpenAI-compatible `/v1` endpoint drops directly into `langchain-openai`'s `ChatOpenAI(base_url=..., api_key=...)`.
- Offline / air-gap story is well-documented for Ollama (Docker volume export/import).

**Why Infinity for embedder + reranker (not TEI):**
- **Single server hosts both models** ([since infinity_emb ≥ 0.0.34](https://github.com/michaelfeil/infinity)) — one port (6767), one process, one config. TEI would be two separate services.
- Pure Python + PyTorch; runs native on Apple Silicon via **MPS** and native on Linux via **CUDA** — same `pip` install on both machines, identical API.
- OpenAI-compatible `/v1/embeddings`; dedicated `/rerank` endpoint for cross-encoders. Matches the "localhost:6767/v1/..." shape requested.
- Native support for `BAAI/bge-m3` and `BAAI/bge-reranker-v2-m3` — the exact two models the project is already locked on (`graph/shared/embedders.py`, `graph/retrieval/rerank.py`).

**Why 31B Q4 not 26B A4B (LLM):** user directive ("let's gamble"). The MMMLU multilingual gap is only +2.1 pts (88.4 vs 86.3) but the RAM & speed cost is real — see §Pre-flight below. Env var is wired both ways so swapping takes one line.

**Known bugs we design around up front:**
1. Ollama with `think=false` + `format=<schema>` silently drops the schema. ([ollama#15260](https://github.com/ollama/ollama/issues/15260)) → keep `enable_thinking` on for extraction.
2. Gemma 4 31B enters repetition loops on long free-text string fields under `format=`. ([ollama#15502](https://github.com/ollama/ollama/issues/15502)) → prefer `method="function_calling"` in `with_structured_output`; batch large flat schemas (e.g. WARNO's 50 fields) into smaller groups if it bites.
3. **Qdrant collection compatibility:** the existing `ingest__doctrine__bgem3` collection was built with FastEmbed's ONNX bge-m3 (`aapot/bge-m3-onnx`, CLS-pooled + normalised). Infinity serves bge-m3 via PyTorch + HF transformers. Cosine space should be identical (same weights), but do the §8.6 similarity-parity smoke before trusting retrieval results.

---

## 0. Sources — verify before you start

If anything below looks out of date, re-read these first:

**LLM (Ollama / Gemma 4):**
- [HF: google/gemma-4-31B-it](https://huggingface.co/google/gemma-4-31B-it)
- [Gemma 4 model card (Google)](https://ai.google.dev/gemma/docs/core/model_card_4)
- [Ollama library: gemma4 tags](https://ollama.com/library/gemma3) *(gemma4 sits on the same family page at time of writing)*
- [Ollama structured outputs docs](https://docs.ollama.com/capabilities/structured-outputs)
- [ollama#15260 — think=false breaks format for gemma4](https://github.com/ollama/ollama/issues/15260)
- [ollama#15502 — gemma4:31b repetition loop under format=](https://github.com/ollama/ollama/issues/15502)
- [Gemma 4 31B on Apple Silicon deployment guide](https://cloudinsight.cc/en/blog/gemma-4-apple-silicon)

**Embedder + reranker (Infinity):**
- [michaelfeil/infinity — GitHub](https://github.com/michaelfeil/infinity)
- [Infinity docs](https://michaelfeil.github.io/infinity)
- [infinity-emb on PyPI](https://pypi.org/project/infinity-emb/)
- [michaelf34/infinity Docker image](https://hub.docker.com/r/michaelf34/infinity)
- [BAAI/bge-m3 model card](https://huggingface.co/BAAI/bge-m3)
- [BAAI/bge-reranker-v2-m3 model card](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- [BAAI/bge-reranker-v2-m3 — Infinity usage discussion](https://huggingface.co/BAAI/bge-reranker-v2-m3/discussions/36)

---

## 1. Hardware pre-flight — DO THIS FIRST ON THE MAC

The Mac has **36 GB RAM**. 31B Q4 needs ~20 GB just for weights + KV cache. macOS + stack baseline = ~5–6 GB. That leaves ~10 GB of padding **only if** the usual app stack is closed.

### Close before running inference

Current RAM audit (2026-04-23):

| app | RAM now | action |
|---|---|---|
| Safari tabs (WebKit content processes) | ~5.5 GB | **close all tabs / quit Safari** |
| Claude Desktop app | ~1.4 GB | quit (Claude Desktop, NOT Claude Code CLI) |
| Codex.app + helpers | ~1.4 GB | quit |
| Extra `claude` CLI sessions (there were ~10 running) | ~2.5 GB | keep 1, `kill` the rest — biggest easy win |
| Microsoft Word | ~450 MB | quit if not editing docs |
| Cursor (if VS Code also open) | ~300 MB | pick one editor |
| TextEdit | ~190 MB | quit |

Commands:

```bash
# Quit the GUI apps manually (Cmd-Q). Kill stale claude CLI sessions:
pgrep -fl "claude --output-format" | awk '{print $1}' | sort -u
# Review the list, then kill (leave one — the one you're migrating in):
kill <pid1> <pid2> ...

# Sanity-check free RAM after cleanup:
vm_stat | awk '/Pages (free|inactive|speculative)/ {gsub(/\./,""); sum+=$NF*16384} END {printf "Available: %.1f GB\n", sum/1024/1024/1024}'
```

**Target: ≥ 28 GB available before starting `ollama run`.** If you're below that, close more things.

### Keep running

- Terminal / zsh
- The one Claude Code CLI session doing this migration
- One editor (VS Code OR Cursor)
- `colima` + Docker (Qdrant)
- Later: `ollama` serve + `python` + Streamlit

### If 31B OOMs during inference

You'll see swap activity (`sysctl vm.swapusage` growing, beachball), then Ollama returning empty responses or the kernel killing processes. Escape hatch:

```bash
ollama pull gemma4:26b-a4b-it-q4_K_M
# then set LLM_MODEL=gemma4:26b-a4b-it-q4_K_M in .env and retry.
```

26B A4B at Q4 is ~16 GB and runs ~3–4× faster (MoE, 3.8B active params). Quality delta vs 31B is small (MMMLU 86.3 vs 88.4). See §C25 research notes in `CLAUDE.md` context.

---

## 2. Install Ollama + pull Gemma 4 31B Q4

### 2.1 Install Ollama (Mac, native — NOT in Docker)

Docker on Mac runs a Linux VM (colima) which **cannot use Metal**. Run Ollama natively on macOS so it gets GPU acceleration.

```bash
brew install ollama
# or download .dmg from https://ollama.com/download

# Start as a background service:
brew services start ollama
# (or: `ollama serve &` in a terminal if you don't want a launchd service)

# Verify:
curl -s http://localhost:11434/api/version
# Expect: {"version":"..."}
```

### 2.2 Pull the model

31B Q4_K_M is ~18–20 GB download. Check disk free first (`df -h /`). You have ~832 GB free, so no issue.

```bash
ollama pull gemma4:31b-it-q4_K_M
```

Exact tag to confirm at pull time — check `https://ollama.com/library/gemma4` and `:31b` variants. Expected tags:

- `gemma4:31b` — default (usually Q4_K_M)
- `gemma4:31b-it-q4_K_M` — explicit instruct + Q4_K_M
- `gemma4:31b-it-q8_0` — Q8, ~34 GB, likely too big for the Mac

Pull the **explicit Q4_K_M tag** to avoid surprise quant changes later.

### 2.3 Smoke test Ollama directly (no Python yet)

```bash
# Basic English:
ollama run gemma4:31b-it-q4_K_M "Respond with exactly: pong"

# Arabic:
ollama run gemma4:31b-it-q4_K_M "أعد كتابة هذه الجملة كما هي: مرحبا"

# Structured output via JSON schema (confirms function-calling path works):
curl -s http://localhost:11434/api/chat -d '{
  "model": "gemma4:31b-it-q4_K_M",
  "messages": [{"role":"user","content":"Return a JSON object with a single key \"status\" whose value is \"ok\"."}],
  "format": {"type":"object","properties":{"status":{"type":"string"}},"required":["status"]},
  "stream": false
}' | python -c "import sys,json;print(json.loads(sys.stdin.read())['message']['content'])"
# Expect: {"status":"ok"}  (or similar)
```

If the structured-output smoke fails, re-read the ollama issues linked at top — most likely `think=false` silently dropping the schema. Fix: set `think` to default/true in the request, or use `method="function_calling"` in langchain (§3.3 below).

### 2.4 OpenAI-compatible endpoint check

Ollama exposes an OpenAI-compatible endpoint at `http://localhost:11434/v1`. This is what `langchain-openai`'s `ChatOpenAI` will hit.

```bash
curl -s http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ollama" \
  -d '{
    "model": "gemma4:31b-it-q4_K_M",
    "messages": [{"role":"user","content":"Respond with: hello"}]
  }' | python -c "import sys,json;r=json.loads(sys.stdin.read());print(r['choices'][0]['message']['content'])"
```

If that works, Python migration can proceed.

---

## 3. Code changes

Strategy: **additive, reversible**. Add new `LLM_*` env vars that default to the current OpenAI behaviour if unset. Both `graph/generation/llm.py` and `graph/shared/llm.py` read the new vars and pass `base_url` + `api_key` to `ChatOpenAI`. No call sites change.

Rollback = unset the new env vars. No code rollback needed.

### 3.1 `.env.example` — add new block, don't remove old vars

Add at the bottom of the file (and copy into the live `.env`):

```ini
# =========================================================================
# Local LLM via Ollama (optional — leave unset to keep OpenAI)
# =========================================================================
# When LLM_BASE_URL is set, every ChatOpenAI() instance in this project
# routes to that endpoint instead of OpenAI's default. Ollama serves an
# OpenAI-compatible endpoint at http://localhost:11434/v1.
#
# Docs: docs/local_llm_migration.md
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama

# Single model override — if set, overrides PHASE3_*_MODEL, QUERY_EXPAND_LLM_MODEL,
# and the Phase 1 gate model. Per-role overrides still win over this one if they
# are explicitly set (see §3.2 of the migration doc for precedence).
LLM_MODEL=gemma4:31b-it-q4_K_M

# Fallback to 26B A4B if 31B OOMs / is too slow:
# LLM_MODEL=gemma4:26b-a4b-it-q4_K_M
```

**Keep** `OPENAI_API_KEY` in `.env` — graph/config.py requires it today. Can set it to any non-empty string when using Ollama (e.g. `OPENAI_API_KEY=not-used-local-llm`) OR make it optional via 3.4 below. Choose one path — see §3.4.

### 3.2 `graph/generation/llm.py` — route through LLM_BASE_URL

File: [`graph/generation/llm.py`](../graph/generation/llm.py)

Three places use `ChatOpenAI(model=..., temperature=...)` via `_get_configured_llm`. Add the two new kwargs and a new resolver that prefers `LLM_MODEL` if set:

```python
# At the top of the file, alongside the existing DEFAULT_* constants:
DEFAULT_LLM_BASE_URL: str | None = None   # e.g. "http://localhost:11434/v1"
DEFAULT_LLM_API_KEY: str | None = None    # e.g. "ollama"

def _global_model_override() -> str | None:
    """Optional top-level `LLM_MODEL` env var. Wins over PHASE3_*_MODEL if set."""
    v = os.getenv("LLM_MODEL", "").strip()
    return v or None

# Modify each *_config() helper to honour the override. Example for draft:
def draft_config() -> tuple[str, float]:
    model = _global_model_override() or os.getenv("PHASE3_DRAFT_MODEL", DEFAULT_DRAFT_MODEL)
    temperature = float(os.getenv("PHASE3_DRAFT_TEMPERATURE", str(DEFAULT_DRAFT_TEMPERATURE)))
    return model, temperature

# Same pattern for critique_config() and extractor_config().

# Modify the cached factory to pass base_url + api_key:
@lru_cache(maxsize=8)
def _get_configured_llm(model: str, temperature: float) -> ChatOpenAI:
    base_url = os.getenv("LLM_BASE_URL", "").strip() or None
    api_key = os.getenv("LLM_API_KEY", "").strip() or None
    kwargs: dict[str, Any] = {"model": model, "temperature": temperature}
    if base_url:
        kwargs["base_url"] = base_url
    if api_key:
        kwargs["api_key"] = api_key
    return ChatOpenAI(**kwargs)
```

**Precedence (document this in the docstring):**
1. `PHASE3_DRAFT_MODEL` (explicit per-role) wins if set.
2. Else `LLM_MODEL` (global) wins if set.
3. Else the hardcoded `DEFAULT_DRAFT_MODEL` (`gpt-4o-mini`).

This means a `.env` with only `LLM_MODEL=gemma4:31b-it-q4_K_M` + `LLM_BASE_URL=...` swaps everything. Setting `PHASE3_DRAFT_MODEL=gpt-4o-mini` on top of that lets you keep draft on cloud while extractor/critique go local — rare but useful for A/B.

### 3.3 Harden `with_structured_output` call sites

Two touchpoints use `with_structured_output`. Ollama's structured-output path for Gemma 4 has known bugs with JSON-mode under some conditions — the function-calling method is more reliable. Switch both to explicit `method="function_calling"`.

**File: [`graph/generation/prompt_extractor.py:232`](../graph/generation/prompt_extractor.py)**

Current:
```python
structured = client.with_structured_output(Phase3Inputs)
```

Change to:
```python
structured = client.with_structured_output(Phase3Inputs, method="function_calling")
```

**File: [`graph/generation/source_file_extractor.py:211`](../graph/generation/source_file_extractor.py)**

Current:
```python
structured = llm.with_structured_output(OutputModel)
```

Change to:
```python
structured = llm.with_structured_output(OutputModel, method="function_calling")
```

**File: [`graph/generation/critique.py`](../graph/generation/critique.py) — lines 146 and 175**

Same change — add `method="function_calling"` to both `.with_structured_output(...)` calls.

**Verify after change:** the WarningOrder extractor dynamically builds a 50-field flat model. Under Ollama + Gemma 4 31B this is the likely hot spot for issue #15502 (repetition loops). If it bites, the fix is batching inside `source_file_extractor.py::extract_for_document` — split `fields` into chunks of ~10, build a smaller `OutputModel` per chunk, merge dicts. Leave batching as a reactive fix, not a preemptive one; the smoke run will show if it's needed.

### 3.4 `graph/shared/llm.py` — also route through LLM_BASE_URL

File: [`graph/shared/llm.py`](../graph/shared/llm.py). This is the Phase 1 `check_documents` gate + optional Phase 2 HyDE. Currently hardcoded `gpt-4o-mini` / temp 0.0.

Edit `_get_llm()` to match the new pattern:

```python
import os

def _get_llm() -> ChatOpenAI:
    global _llm
    if _llm is None:
        model = (
            os.getenv("LLM_MODEL", "").strip()
            or _LLM_MODEL   # existing hardcoded default "gpt-4o-mini"
        )
        base_url = os.getenv("LLM_BASE_URL", "").strip() or None
        api_key = os.getenv("LLM_API_KEY", "").strip() or None
        kwargs = {"model": model, "temperature": _LLM_TEMPERATURE}
        if base_url:
            kwargs["base_url"] = base_url
        if api_key:
            kwargs["api_key"] = api_key
        _llm = ChatOpenAI(**kwargs)
    return _llm
```

Separately: the HyDE path still reads `QUERY_EXPAND_LLM_MODEL` — keep that behaviour, but let `LLM_MODEL` override if the HyDE var is unset. Check [`graph/retrieval/hyde.py`](../graph/retrieval/hyde.py) for the exact call site; adjust only if it instantiates its own `ChatOpenAI` (if it reuses `_get_llm()`, no change needed).

### 3.5 `graph/config.py` — OPENAI_API_KEY should stay required for now

Current code ([`graph/config.py:130`](../graph/config.py)) requires `OPENAI_API_KEY`. Two options:

**Option A (minimum-change, recommended for first pass):** keep the requirement, set `OPENAI_API_KEY=not-used-local-llm` in `.env`. Document in a comment. Nothing actually reads the key when `base_url` is set (langchain-openai uses the `api_key` kwarg we pass).

**Option B (cleaner, deferred):** make `OPENAI_API_KEY` optional when `LLM_BASE_URL` is set:

```python
# In _build_config(), replace:
openai_api_key=_require("OPENAI_API_KEY"),
# with:
openai_api_key=(
    _get("OPENAI_API_KEY", "")
    if _get("LLM_BASE_URL", "")
    else _require("OPENAI_API_KEY")
),
```

Pick one — A is safer for a session-initial migration. B can come in a cleanup PR.

### 3.6 `ui/phase3_tab.py:326` — update the default-fallback label

File: [`ui/phase3_tab.py`](../ui/phase3_tab.py) line 326:

```python
extractor_model = _os.getenv("PHASE3_EXTRACTOR_MODEL", "gpt-4o-mini")
```

This is a display-only fallback for the UI "active model" label. Update to honour `LLM_MODEL` too:

```python
extractor_model = (
    _os.getenv("PHASE3_EXTRACTOR_MODEL")
    or _os.getenv("LLM_MODEL")
    or "gpt-4o-mini"
)
```

### 3.7 Cache-key provenance — fold the new vars in

§18 C16 of the scoping doc mandates that any change to extractor provenance invalidates the per-group cache. The cache key already folds `extractor_model` + `extractor_temperature`. Verify in [`graph/generation/cache.py`](../graph/generation/cache.py) that the cache-key inputs call the updated `extractor_config()` / `draft_config()` / `critique_config()` — they should automatically pick up the new `LLM_MODEL` since those functions now route through it. No explicit cache-key change should be needed, but add `LLM_BASE_URL` to the audit dict if present (defensive):

```python
# Wherever the cache key is assembled, add:
llm_base_url = os.getenv("LLM_BASE_URL", "") or "openai-default"
# and include it in the hashed tuple alongside the existing model/temperature.
```

**If this is done, delete `output/<run>/.group_cache/` before the first local-LLM run** so stale cloud-model entries don't shadow new local-model entries.

---

## 4. End-to-end smoke test

After 2.x is green and 3.x is edited:

```bash
# 1. Load new .env
source venv/bin/activate

# 2. Qdrant up
docker start qdrant
curl -s http://localhost:6333/readyz

# 3. Ollama up with the model warm
curl -s http://localhost:11434/api/version
ollama run gemma4:31b-it-q4_K_M "warming up" >/dev/null

# 4. Phase 3 config sanity check
python -m graph.generation.llm
# Expect something like:
# draft    : gemma4:31b-it-q4_K_M @ temperature=0.2
# critique : gemma4:31b-it-q4_K_M @ temperature=0.0
# extractor: gemma4:31b-it-q4_K_M @ temperature=0.0

# 5. Template loader still OK
python -m graph.generation.template_loader
# Expect: 6/6 templates OK

# 6. Offline schema smoke (no LLM, no Qdrant)
python scripts/smoke_y_schemas.py
# Expect: 4/4 OK

# 7. Nuke the stale cache (cloud-model entries)
rm -rf /Users/hextechkraken/Desktop/NewOutputs/.group_cache

# 8. End-to-end generation (the real test — burns VRAM for ~5–15 min)
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/LocalLLMOutputs

# Expect: 4/4 .docx + 4 *.fields.json + extracted_inputs.json + run_sources.json
# Open each .docx in Word; Arabic output should match the shape of the
# reference outputs at /Users/hextechkraken/Desktop/NewOutputs/
```

### What to watch for

| symptom | likely cause | fix |
|---|---|---|
| `connection refused` | Ollama not running | `brew services start ollama` |
| Empty / truncated output | OOM, swap thrashing | close more apps; fall back to 26B A4B |
| Same Arabic phrase repeated N times inside one field | [ollama#15502](https://github.com/ollama/ollama/issues/15502) | switch `source_file_extractor` to batched extraction (§3.3 note) |
| `ValidationError` on `Phase3Inputs` or `OutputModel` | model not following the schema | confirm `method="function_calling"` is actually set; re-pull the model |
| Schema silently ignored — model returns plain text | [ollama#15260](https://github.com/ollama/ollama/issues/15260) (think=false) | don't pass `options.think=false`; use default |
| `extracted_inputs.json` has English where it should be Arabic | system prompt not enforcing Arabic output | no code change — the prompt_extractor system prompt already handles this; usually a sign of context truncation (bump `num_ctx`) |
| Inference < 2 tok/s | 31B is swapping; memory really is too tight | fall back to 26B A4B |

### Ollama context-window knob (if needed)

Ollama defaults `num_ctx` to 4096 or 8192 per model. Gemma 4 supports 256K but Ollama won't auto-enable that. For the source_file_extractor path (long WARNO + intel report + 50-field prompts), you may need a larger context. Options:

**Option 1 — Modelfile override (recommended):**

```bash
cat > /tmp/gemma4-31b-ctx.Modelfile <<EOF
FROM gemma4:31b-it-q4_K_M
PARAMETER num_ctx 16384
EOF
ollama create gemma4:31b-ctx16k -f /tmp/gemma4-31b-ctx.Modelfile
# then set LLM_MODEL=gemma4:31b-ctx16k in .env
```

16K is a good starting point — bigger ctx = more RAM. If you go higher, re-run the memory audit.

**Option 2 — per-request (more invasive, requires passing `model_kwargs={"extra_body": {"options": {"num_ctx": 16384}}}` when building `ChatOpenAI`). Skip unless Option 1 fails.

---

## 5. Rollback

Full rollback in one step: **comment out `LLM_BASE_URL` in `.env`**. Every `ChatOpenAI` call reverts to OpenAI's default endpoint, `LLM_MODEL` is ignored (because the per-role defaults kick in — `gpt-4o-mini`). Clear the local cache if desired:

```bash
rm -rf /Users/hextechkraken/Desktop/NewOutputs/.group_cache
```

Code changes in §3 are additive — they leave OpenAI behaviour unchanged when the new env vars are unset. No git revert required for rollback.

---

## 6. Next session — open questions to resolve

Not blocking for the migration, but log these before closing the session:

- [ ] Is there a `LLM_TEMPERATURE` env var wanted, or keep per-role temps hardcoded? (Currently `PHASE3_DRAFT_TEMPERATURE=0.2`, etc. Stay per-role.)
- [ ] Should `graph/config.py::openai_api_key` become optional (§3.5 Option B)? Do this as a follow-up PR.
- [ ] Does the WarningOrder 50-field path need batching? Only fix reactively — run the smoke first.
- [ ] Is the Phase 2 HyDE path (`QUERY_EXPAND_HYDE`) used in the default flow? If off (default `OFF`), no urgency. If on, verify the HyDE `ChatOpenAI` instantiation also reads `LLM_BASE_URL` / `LLM_API_KEY`.
- [ ] **Confirm what the offline PC uses for its embedder/reranker server (§8.10).** If it's Infinity, we're fully symmetric. If TEI / vLLM / something custom, the two shim classes in §8.5 need adjusting.
- [ ] Once the Mac smoke passes, start the Ubuntu-laptop dockerization track — see [`docs/ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md). Target compose includes `qdrant`, `ollama`, `infinity`, `app`. Build on Ubuntu (not Mac) to avoid arm64/amd64 mismatch. `docker save` + volume export for the air-gap bundle.

---

## 7. File-change checklist (for the next session)

Copy this into a scratchpad; tick as you go.

**LLM (Ollama) track:**

- [ ] `ollama` installed, running, `ollama pull gemma4:31b-it-q4_K_M` done
- [ ] `.env` — `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` added; `OPENAI_API_KEY` kept (placeholder ok)
- [ ] `.env.example` — same three vars documented
- [ ] [`graph/generation/llm.py`](../graph/generation/llm.py) — `_get_configured_llm` accepts `base_url`/`api_key`; `*_config()` helpers honour `LLM_MODEL` override
- [ ] [`graph/shared/llm.py`](../graph/shared/llm.py) — `_get_llm()` reads `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`
- [ ] [`graph/generation/prompt_extractor.py:232`](../graph/generation/prompt_extractor.py) — `method="function_calling"` added
- [ ] [`graph/generation/source_file_extractor.py:211`](../graph/generation/source_file_extractor.py) — `method="function_calling"` added
- [ ] [`graph/generation/critique.py:146`](../graph/generation/critique.py) & `:175` — `method="function_calling"` added
- [ ] [`ui/phase3_tab.py:326`](../ui/phase3_tab.py) — fallback label updated
- [ ] [`graph/generation/cache.py`](../graph/generation/cache.py) — cache-key audit includes `LLM_BASE_URL` (optional defensive step)

**Embedder + reranker (Infinity) track — see §8:**

- [ ] Infinity installed in its own venv; `infinity_emb v2 … --preload-only` succeeds for bge-m3 and bge-reranker-v2-m3
- [ ] launchd plist (or tmux/nohup) running; `curl http://localhost:6767/v1/models` lists both models
- [ ] `.env` — `EMBED_BASE_URL`, `EMBED_API_KEY`, `EMBED_MODEL`, `RERANK_BASE_URL`, `RERANK_API_KEY`, `RERANK_MODEL` added
- [ ] `.env.example` — same six vars documented
- [ ] [`graph/shared/embedders.py`](../graph/shared/embedders.py) — `_HttpDenseEmbedder` shim + `_get_dense_embedder()` branch on `EMBED_BASE_URL`
- [ ] [`graph/retrieval/rerank.py`](../graph/retrieval/rerank.py) — `_HttpReranker` shim + `_get_reranker()` branch on `RERANK_BASE_URL`
- [ ] `httpx` in `requirements.txt` (likely already there transitively)
- [ ] Similarity-parity smoke — `scripts/embedder_parity_check.py` shows cosine ≥ 0.9995 between FastEmbed and Infinity for a sample Arabic+English text
- [ ] Retrieval smoke still PASS — `scripts/retrieval_smoke_test.py --max-glossary 3 --max-cross-refs 3`

**Joint:**

- [ ] Template-loader smoke: `python -m graph.generation.template_loader`
- [ ] Offline schema smoke: `python scripts/smoke_y_schemas.py`
- [ ] Delete stale cache: `rm -rf /Users/hextechkraken/Desktop/NewOutputs/.group_cache`
- [ ] E2E smoke: `scripts/generate_documents.py` → 4/4 `.docx` at `/Users/hextechkraken/Desktop/LocalLLMOutputs/`
- [ ] Open each `.docx`, spot-check Arabic output vs `/Users/hextechkraken/Desktop/NewOutputs/` reference
- [ ] Document the smoke results in `docs/memory.md` Session Handoff block + §C26 in `CLAUDE.md`
- [ ] If the full stack (31B + Infinity + Qdrant + Python) thrashes (§8.8), fall back LLM to `gemma4:26b-a4b-it-q4_K_M` and re-run the E2E smoke

---

## 8. Embedder + reranker via Infinity (localhost:6767)

Goal: serve **BAAI/bge-m3** (dense embedder) and **BAAI/bge-reranker-v2-m3** (cross-encoder reranker) from one Infinity process at `http://localhost:6767`, replacing the in-process FastEmbed ONNX singletons. Sparse BM25 stays local (pure-Python, no server benefit).

### 8.1 Why Infinity is the pick

- **Single binary serves both models** (`infinity_emb v2 … --model-id BAAI/bge-m3 --model-id BAAI/bge-reranker-v2-m3 …`). TEI would need two separate daemons.
- **Pure Python + PyTorch** → runs natively on Apple Silicon via **MPS** (no Rust/Cargo build gymnastics, unlike TEI on Mac). Same `pip install infinity-emb[all]` on the Ubuntu laptop uses **CUDA**.
- **OpenAI-compatible `/v1/embeddings` + `/rerank`** — the shape the user requested (`localhost:6767/v1/models` works out of the box via `--url-prefix /v1`).
- The offline PC can run the exact same invocation — dev/prod parity.

### 8.2 Install Infinity (Mac, native — NOT in Docker)

Docker on Mac = Linux VM = no MPS. Same reason we installed Ollama native in §2.1.

```bash
# One-shot venv for the model server, kept out of the project venv to
# avoid dependency contention with FastEmbed / langchain.
python3.12 -m venv ~/.local/share/infinity-venv
source ~/.local/share/infinity-venv/bin/activate
pip install "infinity-emb[all]" torch
deactivate
```

Model-prewarm (one-time, pulls weights into the HF cache):

```bash
~/.local/share/infinity-venv/bin/infinity_emb v2 \
    --model-id BAAI/bge-m3 \
    --model-id BAAI/bge-reranker-v2-m3 \
    --engine torch \
    --device mps \
    --port 6767 \
    --url-prefix /v1 \
    --preload-only
```

`--preload-only` exits after loading — quick sanity check the weights fetch. `--device mps` on Mac; on Ubuntu use `--device cuda`. The `--url-prefix /v1` aligns paths to OpenAI's shape so `/v1/embeddings` is the live endpoint.

Weight size: bge-m3 is ~2.3 GB, bge-reranker-v2-m3 is ~2.3 GB → ~5 GB on disk + peak RAM while loaded.

### 8.3 Run Infinity as a background service

**Option A — a launchd plist (survives reboot):**

```bash
# ~/Library/LaunchAgents/local.infinity.plist
cat > ~/Library/LaunchAgents/local.infinity.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>local.infinity</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/hextechkraken/.local/share/infinity-venv/bin/infinity_emb</string>
        <string>v2</string>
        <string>--model-id</string><string>BAAI/bge-m3</string>
        <string>--model-id</string><string>BAAI/bge-reranker-v2-m3</string>
        <string>--engine</string><string>torch</string>
        <string>--device</string><string>mps</string>
        <string>--port</string><string>6767</string>
        <string>--url-prefix</string><string>/v1</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/infinity.out.log</string>
    <key>StandardErrorPath</key><string>/tmp/infinity.err.log</string>
</dict></plist>
EOF
launchctl load ~/Library/LaunchAgents/local.infinity.plist
```

**Option B — nohup / tmux (simpler, doesn't survive reboot):**

```bash
nohup ~/.local/share/infinity-venv/bin/infinity_emb v2 \
    --model-id BAAI/bge-m3 \
    --model-id BAAI/bge-reranker-v2-m3 \
    --engine torch --device mps --port 6767 --url-prefix /v1 \
    > /tmp/infinity.log 2>&1 &
```

### 8.4 Smoke test Infinity directly (no Python code yet)

```bash
# Health / model list
curl -s http://localhost:6767/v1/models | python -m json.tool
# Expect: both BAAI/bge-m3 and BAAI/bge-reranker-v2-m3 listed

# Dense embedding — Arabic + English
curl -s http://localhost:6767/v1/embeddings \
    -H "Content-Type: application/json" \
    -d '{"model":"BAAI/bge-m3","input":["أمر إنذاري","warning order"]}' \
    | python -c "import sys,json;d=json.loads(sys.stdin.read());print('vectors:',len(d['data']),'dim:',len(d['data'][0]['embedding']))"
# Expect: vectors: 2 dim: 1024

# Rerank
curl -s http://localhost:6767/rerank \
    -H "Content-Type: application/json" \
    -d '{"model":"BAAI/bge-reranker-v2-m3","query":"warning order","documents":["a warning order directs preparatory actions","weather forecast for tuesday"]}' \
    | python -m json.tool
# Expect: results array with scores; warning-order doc ranked higher
```

### 8.5 Code changes — additive shim pattern

Two touchpoints: `graph/shared/embedders.py` (dense) and `graph/retrieval/rerank.py` (reranker). Both currently return FastEmbed objects with specific method shapes. Strategy: write thin shim classes that expose the same methods the callers already use, routing to HTTP when the env var is set.

#### 8.5.1 `.env.example` additions

```ini
# =========================================================================
# Local embedder + reranker via Infinity (optional — leave unset to keep FastEmbed)
# =========================================================================
# When EMBED_BASE_URL is set, the dense embedder singleton routes to the
# HTTP server instead of loading ONNX weights in-process. Reranker follows
# the same pattern with RERANK_BASE_URL.
#
# Matches the Ubuntu offline-PC deployment shape so .env is the only knob.
# Sparse BM25 stays in-process (pure Python, no server benefit).
EMBED_BASE_URL=http://localhost:6767/v1
EMBED_API_KEY=infinity
EMBED_MODEL=BAAI/bge-m3

RERANK_BASE_URL=http://localhost:6767
RERANK_API_KEY=infinity
RERANK_MODEL=BAAI/bge-reranker-v2-m3
```

Note the reranker uses `/rerank` (not `/v1/rerank`) — that's Infinity's path. The env var holds the host; the shim appends `/rerank`.

#### 8.5.2 Dense embedder shim — `graph/shared/embedders.py`

Add a small shim class above the `_get_dense_embedder()` function:

```python
import os
from typing import Iterator
import numpy as np
import httpx

class _HttpDenseEmbedder:
    """Duck-typed stand-in for fastembed's TextEmbedding when EMBED_BASE_URL is set.

    Exposes the two methods this project actually uses:
      - .embed(texts)        : generator of np.ndarray
      - .passage_embed(texts): alias to .embed (bge-m3 uses the same encoder)
      - .query_embed(texts)  : alias to .embed

    HTTP payload shape matches OpenAI /v1/embeddings, which Infinity speaks.
    """
    def __init__(self, base_url: str, api_key: str, model: str, dim: int = 1024) -> None:
        self._client = httpx.Client(base_url=base_url.rstrip("/"), timeout=60.0,
                                    headers={"Authorization": f"Bearer {api_key}"})
        self._model = model
        self._dim = dim

    def _post(self, texts: list[str]) -> np.ndarray:
        r = self._client.post("/embeddings", json={"model": self._model, "input": texts})
        r.raise_for_status()
        rows = r.json()["data"]
        # Infinity returns rows in input order; trust that.
        return np.asarray([row["embedding"] for row in rows], dtype=np.float32)

    def embed(self, texts, batch_size: int | None = None, **_ignored) -> Iterator[np.ndarray]:
        texts = list(texts)
        bs = batch_size or 32
        for i in range(0, len(texts), bs):
            vecs = self._post(texts[i:i + bs])
            for v in vecs:
                yield v

    # Aliases — bge-m3 uses one encoder for both sides.
    def query_embed(self, texts, **kw) -> Iterator[np.ndarray]:
        return self.embed(texts, **kw)

    def passage_embed(self, texts, **kw) -> Iterator[np.ndarray]:
        return self.embed(texts, **kw)
```

Then update `_get_dense_embedder()`:

```python
def _get_dense_embedder():
    global _dense_embedder
    if _dense_embedder is None:
        base_url = os.getenv("EMBED_BASE_URL", "").strip()
        if base_url:
            _dense_embedder = _HttpDenseEmbedder(
                base_url=base_url,
                api_key=os.getenv("EMBED_API_KEY", "infinity"),
                model=os.getenv("EMBED_MODEL", "BAAI/bge-m3"),
            )
        else:
            _register_bge_m3_if_needed()
            cfg = get_config()
            _dense_embedder = TextEmbedding(
                model_name=_BGE_M3_MODEL_NAME,
                providers=cfg.embedder_providers,
            )
    return _dense_embedder
```

**Grep for `.embed(`, `.query_embed(`, `.passage_embed(`** on the dense embedder to confirm the three-method surface is exhaustive. If a call site uses a different method (e.g. `.encode`), add that alias to the shim.

```bash
grep -rn "_get_dense_embedder\|\.embed(\|\.query_embed(\|\.passage_embed(" graph/ | grep -v "sparse\|bm25"
```

#### 8.5.3 Reranker shim — `graph/retrieval/rerank.py`

FastEmbed's `TextCrossEncoder.rerank(query, docs)` returns a generator of scalar scores in **input order**. The shim must match that.

Add near the top of the file:

```python
import os
from typing import Iterator
import httpx

class _HttpReranker:
    """Duck-typed stand-in for TextCrossEncoder when RERANK_BASE_URL is set.

    Infinity's /rerank returns a list of {index, relevance_score} sorted by
    score. We re-sort back to input order to match FastEmbed's contract.
    """
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._client = httpx.Client(base_url=base_url.rstrip("/"), timeout=60.0,
                                    headers={"Authorization": f"Bearer {api_key}"})
        self._model = model

    def rerank(self, query: str, documents, **_ignored) -> Iterator[float]:
        docs = list(documents)
        if not docs:
            return iter([])
        r = self._client.post("/rerank", json={
            "model": self._model, "query": query, "documents": docs,
        })
        r.raise_for_status()
        # Infinity response shape: {"results": [{"index": int, "relevance_score": float}, ...]}
        results = r.json().get("results", [])
        by_index = {row["index"]: row["relevance_score"] for row in results}
        return iter([by_index.get(i, 0.0) for i in range(len(docs))])
```

Update `_get_reranker()`:

```python
def _get_reranker():
    global _reranker
    if _reranker is None:
        base_url = os.getenv("RERANK_BASE_URL", "").strip()
        if base_url:
            _reranker = _HttpReranker(
                base_url=base_url,
                api_key=os.getenv("RERANK_API_KEY", "infinity"),
                model=os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3"),
            )
        else:
            _register_custom_reranker_if_needed()
            cfg = get_retrieval_config()
            _reranker = TextCrossEncoder(
                model_name=cfg.rerank_model,
                providers=cfg.rerank_providers,
            )
    return _reranker
```

#### 8.5.4 `httpx` dependency

If `httpx` isn't already in `requirements.txt`, add it. `langchain-openai` usually pulls it transitively — check with `pip show httpx` before adding.

### 8.6 Similarity-parity smoke — critical before first retrieval run

The existing Qdrant collection `ingest__doctrine__bgem3` holds vectors produced by **FastEmbed's ONNX export** of bge-m3. The new endpoint serves bge-m3 via **PyTorch + HF transformers**. Same weights → should be bit-close but not guaranteed bit-identical (tokenisation edge cases, FP precision, pooling code path).

Run this before trusting any retrieval result:

```python
# scripts/embedder_parity_check.py  (create as a throwaway)
import numpy as np, os, httpx
from fastembed import TextEmbedding

# 1) FastEmbed baseline (the shape the Qdrant collection was built with)
os.environ.pop("EMBED_BASE_URL", None)  # force local path
from graph.shared.embedders import _get_dense_embedder, _register_bge_m3_if_needed
_register_bge_m3_if_needed()
local = next(TextEmbedding(model_name="BAAI/bge-m3").embed(["warning order — preparatory directive"]))

# 2) Infinity
r = httpx.post("http://localhost:6767/v1/embeddings",
               json={"model":"BAAI/bge-m3","input":["warning order — preparatory directive"]},
               timeout=60).json()
remote = np.asarray(r["data"][0]["embedding"], dtype=np.float32)

cos = float(np.dot(local, remote) / (np.linalg.norm(local) * np.linalg.norm(remote)))
print(f"cosine(local, remote) = {cos:.6f}")
# Expect: >= 0.9995 — if below 0.99, investigate pooling / normalization mismatch
# before running retrieval against the old Qdrant collection.
```

**If cosine < 0.99:** DO NOT route queries through Infinity against the old collection. Either (a) re-ingest with Infinity on the dense side, or (b) stay on FastEmbed until the mismatch is understood. Usual culprits: different pooling (Infinity default `mean` vs FastEmbed's `CLS` + normalised), a tokenisation edge case on Arabic text, or FP16 on the server vs FP32 locally.

Infinity defaults to the model's `sentence-transformers`-style pooling (for bge-m3 that's `CLS` + `L2-normalised`, matching our FastEmbed registration). If it drifts, pin explicitly at server launch: `--pooling-method cls --normalize`.

### 8.7 Ingest + retrieval smoke (after parity is green)

```bash
# Retrieval (doesn't re-ingest — only queries the existing collection)
python scripts/retrieval_smoke_test.py --max-glossary 3 --max-cross-refs 3
# Expect: same 20 PASS / 0 FAIL as the pre-migration baseline. Any
# regression vs the last recorded run is a red flag — most likely root
# cause is §8.6 parity.

# Only if you decide to re-ingest (usually not needed):
python main.py
# Deletes + rebuilds every collection per hash gate. ~30 min on this corpus.
```

### 8.8 Memory impact on the 36 GB Mac

Running 31B Q4 **and** Infinity **and** Qdrant **and** Python simultaneously tightens the envelope:

| process | RAM |
|---|---|
| macOS kernel + WindowServer + Finder | ~5 GB |
| colima VM (Qdrant) | ~1 GB |
| Ollama + Gemma 4 31B Q4 | ~20 GB |
| **Infinity + bge-m3 + bge-reranker-v2-m3** | **~5 GB** (2.3 + 2.3 + overhead) |
| Python (ingest or Streamlit) | 1–2 GB |
| One editor + this Claude Code session | ~1 GB |

**Total: ~33–34 GB.** Leaves < 2 GB headroom on a 36 GB Mac. If you want to run the full stack together, you probably need to fall back to **26B A4B Q4** for the LLM — freeing ~5 GB brings headroom to ~7 GB which is safe.

Alternative: only start Infinity when you're running retrieval; stop it for pure-LLM work. `launchctl unload ~/Library/LaunchAgents/local.infinity.plist` frees 5 GB immediately.

### 8.9 Rollback

Comment out **both** `EMBED_BASE_URL` and `RERANK_BASE_URL` in `.env`. Shims fall back to FastEmbed automatically — no code change needed. Leaving one set and one unset means only that half falls back; supported for A/B.

### 8.10 Open question — offline PC parity

The offline PC reportedly already serves embedder + reranker. **Before merging this:** confirm which server the offline PC uses:

- If **Infinity**: the plan above matches exactly — ports / model IDs / env vars are already symmetric.
- If **TEI** (HuggingFace text-embeddings-inference): swap the install step to `brew install text-embeddings-inference` on Mac (it has a native Metal build; no Rust build needed for the binary ship) and run two daemons (embeddings + rerank on different ports). The shims still work because TEI also exposes OpenAI-compatible `/v1/embeddings` and a `/rerank` endpoint at the embedding server's port when a reranker model is loaded.
- If **vLLM**: different shape — vLLM's embedding/rerank support is newer and the shim payloads may differ. Flag and re-plan this section.
- If **something else** (custom FastAPI / Ray Serve / litellm / etc.): ask for the exact request/response shape and adjust the two shim classes in §8.5.2 and §8.5.3. Everything else in this doc stays the same.

---

## 9. Gotcha reference card

- **Keep Ollama native on Mac, not in Docker.** colima VM can't use Metal; Ollama in Docker on Mac = CPU-only inference. Dockerization belongs on the Ubuntu target, not the Mac dev box.
- **Swap is death for LLMs.** If `sysctl vm.swapusage` shows swap growing during inference, abort and close more apps / drop to 26B A4B.
- **31B Q4 + macOS + Qdrant + Docker + 1 Claude Code + 1 editor** is roughly 32 GB in use. 4 GB headroom. Don't open Chrome.
- **Do NOT re-use the `.group_cache/` from a cloud-model run.** The cache key includes the extractor model, so a stale entry should miss — but double-check by deleting the cache dir before the first local-LLM run to be sure.
- **Every `ChatOpenAI()` instance needs `base_url` + `api_key` threaded through.** If you miss one, that one call routes to OpenAI's public API and (a) costs money, (b) probably 401s since the key is a placeholder. Grep before shipping: `grep -rn "ChatOpenAI(" graph/ ui/` — every hit should either be in `graph/generation/llm.py`, `graph/shared/llm.py`, or a test stub.
- **Embedder pooling must match the Qdrant collection's build-time pooling.** bge-m3 via FastEmbed ONNX = CLS + L2-normalised. Infinity defaults to the sentence-transformers config for the model (same). If Infinity is launched against a different pooling (`--pooling-method mean` by accident), every query vector will be in a different subspace than the stored vectors and retrieval quality will collapse silently — §8.6 parity smoke catches this.
- **Reranker ordering contract: input-order scores, not sorted.** FastEmbed's `TextCrossEncoder.rerank()` returns scores for docs in the **input order** you passed them. Infinity's `/rerank` returns a sorted list with explicit `index` fields. The shim re-sorts back to input order — don't "simplify" that by trusting the response order.
- **Don't run Infinity in Docker on Mac.** Same MPS-passthrough problem as Ollama: inside the colima VM, no Metal, so the whole point of GPU-served embeddings evaporates. Native launchd or nohup only on the Mac. Dockerize on Ubuntu.
- **Sparse BM25 is in-process on purpose.** Do not add a server shim for it. FastEmbed's `Qdrant/bm25` is pure Python (no ONNX), ~1 MB RAM, and network round-trips would strictly harm ingest throughput.
