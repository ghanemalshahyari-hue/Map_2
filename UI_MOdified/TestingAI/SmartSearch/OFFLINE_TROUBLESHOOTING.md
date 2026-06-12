# OFFLINE_TROUBLESHOOTING — what to do when something breaks

> Quick-reference for failures the offline operator may hit.
> Each entry: **symptom → root cause → exact fix**.
> Derived from the LiteLLM+vLLM simulation run on 2026-05-07.

---

## Stack you're operating

```
Offline server (somewhere on your intranet)
  └─ LiteLLM :4000  → vLLM-llm   :8000  Qwen-class (LLM)
                    → vLLM-embed :8001  bge-m3 (embeddings)
                    → vLLM-rerank:8002  bge-reranker-v2-m3 (rerank)

Code machine (the one running this project)
  ├─ Qdrant :6333
  └─ DMS app — ingests Arabic PDFs/DOCX, generates 4 .docx
```

The code machine talks to the offline server's LiteLLM at one URL,
with one bearer token. All three model channels share that endpoint.

---

## Quick health check (run this FIRST when anything fails)

```bash
cd <project root>
source venv/bin/activate

# 1. Stack reachable?
curl -m 3 http://localhost:6333/readyz                        # qdrant
curl -m 3 http://<OFFLINE-SERVER-IP>:4000/v1/models \
     -H "Authorization: Bearer <YOUR-LITELLM-KEY>"            # LiteLLM (3 model entries expected)

# 2. Per-channel probes
python -m graph.shared.responses_client probe                 # LLM (text + structured)
python -m graph.shared.embedders probe "test"                 # Embedder (1024-dim, norm 1.0)
python -m graph.retrieval.rerank "q" "doc one" "doc two"      # Reranker (returns ranked hits)
```

If any of those fails, jump to the matching section below.

---

## Section 1 — LLM channel failures

### 1A. Probe says `endpoint: openai-default` and `key set: False`

**Cause.** `.env` not loaded (the `__main__` block in `llm_factory.py`
reads `os.environ` directly without `load_dotenv()`).

**Fix.** This is just a diagnostic-only artifact. The actual project code
loads `.env` correctly — verify with:
```bash
python -c "from dotenv import load_dotenv; load_dotenv(); from graph.shared.llm_factory import resolved_endpoint_tag, resolve_llm_api_key; print('endpoint:', resolved_endpoint_tag()); print('key set:', bool(resolve_llm_api_key()))"
```
If THIS shows the right endpoint and `key set: True`, you're fine.

### 1B. `responses_client probe` errors with `produced no final text` or `reasoning_only`

**Cause.** The server burned its `max_output_tokens` budget on hidden reasoning
before producing visible output. Common with reasoning-mode models (Qwen3
in thinking mode, Gemma 3, etc.).

**Fix.**
- For Qwen3 instruction-tuned (e.g. `Qwen3-4B-Instruct-2507-FP8`): non-reasoning
  by default, this should not happen. If it does, audit `max_output_tokens`
  cap sites — see `.env.example` near `QUERY_EXPAND_HYDE_MAX_TOKENS`.
- For genuine reasoning models: bump every `max_output_tokens` cap to ≥ 2048.

### 1C. `RuntimeError: Engine core initialization failed` from vLLM

**Cause.** Usually KV cache exceeds available GPU memory. Common with long
context-window models (Qwen3 = 256K context → ~36 GB KV cache by default).

**Fix.** Add `--max-model-len 32768` (or lower) to the vLLM serve command on
the offline server. 32K is plenty for the longest input we've seen.

### 1D. LiteLLM returns `"Unsupported provider: openai"` for rerank

**Cause.** The model entry in `litellm_config.yaml` uses `openai/<model>`
prefix, which doesn't have rerank support in LiteLLM v1.83+.

**Fix.** Change the prefix to `hosted_vllm/<model>` for ALL three routes
(LLM, embedder, reranker). LiteLLM has a dedicated `hosted_vllm` provider
with proper handlers for each endpoint type. Then restart LiteLLM:
```bash
docker restart middleware-litellm-1
```

### 1E. LiteLLM embedder error mentions `encoding_format` or `messages required`

**Cause.** Same as 1D — `openai/...` prefix sends a chat-completions-shaped
request; vLLM's strict Pydantic validator rejects it.

**Fix.** Same as 1D — switch to `hosted_vllm/...`.

### 1F. LiteLLM `/v1/responses` returns 404 or 502

**Cause.** LiteLLM v1.83 Responses passthrough is newer than chat-completions
support; some upstream/version combinations break.

**Fix.** Two escape hatches, in order of preference:
1. Bypass LiteLLM for the LLM channel only — set in `.env`:
   ```
   LLM_BASE_URL=http://<OFFLINE-SERVER-IP>:8000/v1   # direct vLLM
   ```
   (Keep embedder + reranker through LiteLLM.)
2. Flip the locked Responses API decision:
   ```
   LLM_USE_RESPONSES_API=0
   ```
   This invalidates the Phase 3 cache, project switches to chat-completions.

---

## Section 2 — Embedder channel failures

### 2A. Probe hangs / times out

**Cause.** vLLM-embed isn't responding, OR the network between code machine
and offline server is broken.

**Fix.**
```bash
# From the code machine
curl -m 5 http://<OFFLINE-SERVER-IP>:4000/v1/models -H "Authorization: Bearer <KEY>"
ping -c 3 <OFFLINE-SERVER-IP>
# On the offline server, check vLLM-embed logs:
docker logs --tail 30 vllm-embed
```

### 2B. Vector dim is not 1024

**Cause.** A different model is being served (server is hosting a
different bge variant or a non-bge embedder).

**Fix.** On the offline server, confirm model id:
```bash
curl -s http://localhost:8001/v1/models
```
Should report `BAAI/bge-m3`. If something else, fix the vLLM-embed startup
command to point at the correct model.

### 2C. Vector norm wildly different from 1.0

**Cause.** Server returned un-normalised pooled vectors. Project's
`HttpDenseEmbedder` already re-normalises client-side, so this is non-fatal.

**Fix.** No fix needed — defensive normalisation in
[graph/shared/embedders.py:170-172](graph/shared/embedders.py#L170)
handles it.

---

## Section 3 — Reranker channel failures

### 3A. Probe raises `RerankUnavailable`

**Cause.** vLLM-rerank not reachable, returned wrong shape, or LiteLLM's
Cohere → vLLM translation broke.

**Fix.** Retrieval is **not hard-failing** — it logged a warning and degraded
to RRF-only. The system still works, just less precise. To restore:
```bash
# On offline server, check vLLM-rerank
docker logs --tail 30 vllm-rerank
curl http://localhost:8002/v1/rerank -H "Content-Type: application/json" \
  -d '{"model":"BAAI/bge-reranker-v2-m3","query":"q","documents":["a","b"]}'
```

### 3B. Reranker scores are all near-zero

**Cause.** Cross-encoders return raw logits before sigmoid; bge-reranker-v2-m3
typically returns scores between 0 and 0.05 unless documents are very
relevant. This is **expected**, not a bug.

**Fix.** No fix needed — RRF re-fuses the rankings, and the relative order
is what matters, not absolute score values.

---

## Section 4 — Phase 1 ingest failures

### 4A. `PermissionError: [Errno 13] Permission denied: 'output/...'`

**Cause.** Some `output/` subfolder is owned by root from a previous Docker
run with bind mounts.

**Fix.** Either:
- Change `OUTPUT_DIR` in `.env` to a fresh path (e.g. `output_litellmrun`)
- OR `sudo chown -R $USER:$USER output/`

### 4B. RapidOCR hangs trying to download from `modelscope.cn`

**Cause.** RapidOCR's default config wants to download `*_mobile.onnx` weights
from modelscope. The wheel ships `*_infer.onnx` (different filename) so the
local-file check misses them.

**Fix.** Copy bundled weights with the modelscope-expected names (one-time):
```bash
cd venv/lib/python3.12/site-packages/rapidocr/models/
cp ch_PP-OCRv4_det_infer.onnx           ch_PP-OCRv4_det_mobile.onnx
cp ch_PP-OCRv4_rec_infer.onnx           ch_PP-OCRv4_rec_mobile.onnx
cp ch_ppocr_mobile_v2.0_cls_infer.onnx  ch_ppocr_mobile_v2.0_cls_mobile.onnx
```
Verify with `python -c "from rapidocr import RapidOCR; RapidOCR(); print('OK')"`.

### 4C. `huggingface.co` connection error during chunk_document

**Cause.** HybridChunker tried to fetch the bge-m3 tokenizer from HF Hub.
Cache must be pre-populated AND offline guards set.

**Fix.** Verify the cache exists:
```bash
ls ~/.cache/huggingface/hub/models--BAAI--bge-m3/snapshots/*/tokenizer*
```
If empty, either:
- Copy `~/.cache/huggingface/hub/models--BAAI--bge-m3/` from the online box,
  OR
- Restore from the `host_caches.tar.gz` in your transfer payload.

Then ensure these are set in `.env`:
```ini
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
```

### 4D. `tiktoken` connection error to `openaipublic.blob.core.windows.net`

**Cause.** OpenAI SDK's token-counting wants `cl100k_base.tiktoken`.

**Fix.** Pre-cached on the online box. Verify:
```bash
ls ~/.cache/tiktoken/
```
If empty, set `TIKTOKEN_CACHE_DIR=/path/to/cache` in `.env` (must point at a
populated directory).

### 4E. Docling fails loading layout / TableFormer weights

**Cause.** Docling tries to fetch from HF Hub on first parse.

**Fix.** Ensure the cache is populated:
```bash
ls ~/.cache/huggingface/hub/ | grep docling
```
Should show `models--docling-project--docling-layout-heron` and
`models--docling-project--docling-models`. If missing, copy from online box.

### 4F. Arabic PDF text extracts as `?` or `\\u` escapes

**Cause.** Broken ToUnicode CMap in the source PDF — common in older
Arabic InDesign / government-produced PDFs. See [docs/pdf_failure_fallback_plan.md](docs/pdf_failure_fallback_plan.md).

**Fix.** §C19 OCR retry handles this. Confirm in `.env`:
```ini
OCR_RETRY_ON_GARBAGE=1
OCR_LANGS=eng+ara
```
And confirm Tesseract Arabic pack is installed:
```bash
tesseract --list-langs   # must include 'ara'
sudo apt install tesseract-ocr-ara   # if missing
```

### 4G. Phase 1 LLM gate rejects all docs

**Cause.** §C18 MDMP-topical gate is strict by design. Non-MDMP doctrine
will be rejected.

**Fix.** Inspect the rejection:
```bash
cat output/not_enough/<slug>/<stem>/check_decision.json
```
The `remarks` field tells you what the LLM thought. If the doc IS MDMP
doctrine and got rejected, check the LLM gate prompt at
[graph/prompts.py](graph/prompts.py). Or temporarily lower
`PHASE1_PREVIEW_MAX_CHARS` if the preview is being truncated mid-section.

---

## Section 5 — Phase 3 generation failures

### 5A. `ValueError: Each prefetch limit must be >= top_n_in for RRF`

**Cause.** `top_n_in = max(50, top_k_per_query * 6)` exceeds default
`HYBRID_*_PREFETCH=50`.

**Fix.** Raise the prefetch limits in `.env`:
```ini
HYBRID_DENSE_PREFETCH=200
HYBRID_SPARSE_PREFETCH=200
```

### 5B. `Collection 'ingest__doctrine__bgem3' doesn't exist`

**Cause.** Tier-aware retrieval is on (`PHASE3_TIERED_RETRIEVAL=1`) and tries
to fan out to a doctrine collection you haven't ingested.

**Fix.** Either:
- Ingest a doctrine corpus into `inputs/doctrine/` and re-run `python main.py`, OR
- Set `PHASE3_TIERED_RETRIEVAL=0` in `.env` (operator override; documented
  in CLAUDE.md §C32).

### 5C. Drafter `with_structured_output` fails Pydantic validation

**Cause.** The LLM emitted a wrapper-key shape (e.g. nested `planning_guidebook`).
This was the §C32 Gemma compliance failure mode.

**Fix.** [graph/shared/responses_client.py](graph/shared/responses_client.py)
already has `_try_repair` with `_lift_nested_keys` heuristic. If it triggers
repeatedly, audit the drafter prompt for the failing field — Qwen3 should
not need this. See [docs/gemma_drafter_followup.md](docs/gemma_drafter_followup.md)
for the original Gemma-specific behavior (likely won't apply on Qwen).

### 5D. Generated `.docx` has empty Arabic fields

**Cause.** Either retrieval returned zero chunks (collection not ingested),
or the per-doc extractor returned the absent sentinel (`غير موجود في الملفات`)
without dispatcher fallback.

**Fix.**
1. Verify Qdrant has chunks: `curl http://localhost:6333/collections | python3 -m json.tool`
2. Check `extracted_inputs.json` to see what the extractor pulled.
3. The `<doc>.fields.json` post-condition asserts no empty strings — if it
   fired, the assertion error message names the field.

### 5E. `.docx` rendering crashes with KeyError on Arabic label

**Cause.** A field is missing from `FIELD_LABELS_AR` in
[graph/generation/schema/field_catalog.py](graph/generation/schema/field_catalog.py)
or the per-doc `prompts/<doc>/labels_ar.py`.

**Fix.** Add the missing `(class_name, field_name) → "Arabic label"` entry
to the catalog. The renderer falls back to the ASCII key when missing — but
that produces ugly English-key-in-Arabic-doc output. Catalog wins.

---

## Section 6 — Output dir / cache pathology

### 6A. The same input produces different `.docx` byte-counts on rerun

**Cause.** LLM is non-deterministic; cache busts via `PHASE3_FORCE_REGENERATE=1`,
or any `.env` change to `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` /
`EMBED_*` / `RERANK_*` invalidates per-group cache entries.

**Fix.** This is expected. If you want byte-stable runs, leave `.env`
unchanged and don't set `PHASE3_FORCE_REGENERATE=1`. The `time_analysis.docx`
and `warning_order.docx` (no LLM drafting) WILL be byte-identical run-to-run.

### 6B. `.group_cache/` keeps growing

**Cause.** Cache entries accumulate across runs; nothing prunes them.

**Fix.** Safe to delete the entire `.group_cache/` folder under your `--out`
directory. Next run rebuilds from scratch.

---

## Section 7 — Network / Qdrant / general

### 7A. `python main.py` reports `0 cached, N executed` every time

**Cause.** Sha256 cache gates are per-stage and per-output-dir. If you
change `OUTPUT_DIR` in `.env`, every stage re-executes. If you change
`FORCE_REPARSE=1`, every stage re-executes.

**Fix.** Keep `OUTPUT_DIR` stable across runs. The cache lives in
`output/<stem>/.stage_fingerprints.json`.

### 7B. Qdrant reports 0 collections after running `python main.py`

**Cause.** Likely the LLM gate rejected all input docs. Check:
```bash
ls output/not_enough/
cat output/not_enough/*/*/check_decision.json
```

### 7C. `docker exec qdrant ...` hangs

**Cause.** Qdrant container doesn't ship a shell.

**Fix.** Don't `exec` into qdrant. Inspect via the HTTP API:
```bash
curl http://localhost:6333/collections | python3 -m json.tool
curl http://localhost:6333/collections/<NAME>/points/count -X POST -H "Content-Type: application/json" -d '{}'
```

---

## Section 8 — Arabic-specific diagnostics

### 8A. Confirm Arabic is preserved end-to-end

Pull one chunk back from Qdrant and verify it shows Arabic glyphs (not
escaped):
```bash
curl -s "http://localhost:6333/collections/<YOUR-COLLECTION>/points" \
     -X POST -H "Content-Type: application/json" \
     -d '{"limit": 1, "with_payload": true}' | python3 -m json.tool | head -40
```
The `payload.text` field should show real Arabic characters.

### 8B. Confirm bge-m3 embeds Arabic and English consistently

```bash
python -c "
from dotenv import load_dotenv; load_dotenv()
from graph.shared.embedders import _get_dense_embedder
import numpy as np
e = _get_dense_embedder()
ar = next(iter(e.query_embed('القيادة والسيطرة')))
en = next(iter(e.query_embed('mission command')))
print('cosine(ar, en) =', float(np.dot(ar, en)))
"
```
Expected: cosine in `[0.4, 0.7]` — these phrases are semantically related but
not identical, and bge-m3 should reflect that.

### 8C. Confirm Tesseract sees Arabic

```bash
tesseract --list-langs       # must include 'ara'
echo "test" | tesseract --version
```

---

## Last resort: clean rebuild

If everything is broken and you want to start fresh on the code machine:

```bash
# 1. Stop everything
docker stop qdrant
# (stack on the offline server stays up — only the code machine resets)

# 2. Wipe local state
docker rm qdrant
docker volume rm qdrant_storage   # WARNING: deletes ingested vectors
rm -rf output_litellmrun/         # or whatever your OUTPUT_DIR is
rm -rf /tmp/litellmrun_*          # any test outputs

# 3. Rebuild Qdrant
docker run -d --name qdrant -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant:latest

# 4. Re-ingest
python main.py

# 5. Re-generate
python scripts/generate_documents.py --warning-order ... --intel-report ... \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/recovery_smoke
```

---

## When to call for help

If you've worked through the relevant section above and the problem persists,
gather these artifacts before escalating:

1. **Last 50 lines of the failing command's output**
2. **Output of the quick health check** (top of this document)
3. **`.env` (redact bearer keys)**
4. **`docker ps` and `nvidia-smi` from the offline server** (if it's a server-side issue)
5. **The relevant log file under `output/<stem>/errors.jsonl`** (if it's an ingest issue)

Most failures we've seen during simulation map directly to one of the
sections above. Start by running the quick health check — it tells you
which channel to investigate.
