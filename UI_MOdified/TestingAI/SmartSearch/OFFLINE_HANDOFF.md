# OFFLINE HANDOFF — what to put on the airgapped machine

## What to transfer to the offline machine

| item | path here | size | role |
|---|---|---|---|
| dms_app image | `dockerfiles/dms_app.tar` | ~4.4 GB | the application; zero embedder/reranker/LLM weights inside |
| qdrant image | `dockerfiles/qdrant.tar` | ~190 MB | vector DB |
| source code | the rest of this repo | ~50 MB | mounted into dms_app at runtime |

**Do NOT transfer:**
- `infinity_models` docker volume — only used here as a reranker simulator. Your real machine has vLLM serving the reranker.
- `qdrant_storage` docker volume — start clean on the offline machine and re-ingest.
- `output/` and `output_docs/` — runtime artefacts.
- Host caches (`~/.cache/huggingface`, etc.) — irrelevant; the dms_app container never reads them.

## On the offline machine

1. **Load the two images:**
   ```bash
   docker load -i dms_app.tar
   docker load -i qdrant.tar
   ```

2. **Drop the source code somewhere** (e.g. `~/projects/dms`).

3. **Edit `.env`** (the one in this repo is configured for THIS dev box — replace it):
   ```ini
   OPENAI_API_KEY=any-non-empty-placeholder

   # LLM — your vLLM machine
   LLM_BASE_URL=http://<vllm-host>:<port>/v1
   LLM_API_KEY=<token-or-blank>
   LLM_MODEL=<exact-id-from-vllm-/v1/models>
   LLM_USE_RESPONSES_API=1   # set to 0 if your vLLM build doesn't support /v1/responses

   # Embedder — your vLLM machine
   EMBED_BASE_URL=http://<vllm-host>:<port>/v1
   EMBED_API_KEY=<token-or-blank>
   EMBED_MODEL=<exact-id-from-vllm-/v1/models>

   # Reranker — your vLLM machine (must serve POST /rerank with Cohere-shape body)
   RERANK_BASE_URL=http://<vllm-host>:<port>
   RERANK_API_KEY=<token-or-blank>
   RERANK_MODEL=<exact-id-from-vllm-/v1/models>

   # Qdrant — service name resolved on the compose network
   QDRANT_URL=http://qdrant:6333
   ```

4. **Edit `docker-compose.yml`** if your vLLM is NOT reachable from inside the
   dms_app container. The current config uses
   `host.docker.internal:host-gateway` (works for services on the same machine
   as docker). If your vLLM is on another host, just put its IP/hostname
   directly in `.env` URLs — drop the `extra_hosts` block.

5. **Drop your Arabic PDFs into `inputs/operationalfiles/`.**

6. **Start qdrant + ingest:**
   ```bash
   docker compose up -d qdrant
   docker compose run --rm app python main.py
   ```

7. **Generate documents:**
   ```bash
   docker compose run --rm app python scripts/generate_documents.py \
     --warning-order data/phase3_prompt_2.example.txt \
     --intel-report  data/phase3_prompt_3.example.txt \
     --source-file   other=data/phase3_prompt_1.example.txt \
     --docs time_analysis initial_planning_guidance staff_brief warning_order \
     --out output_docs/
   ```

## Sanity probes (do these BEFORE ingestion if something fails)

From inside dms_app:

```bash
docker compose run --rm --no-deps app bash -c '
python -m graph.shared.llm_factory                       # LLM endpoint resolved
python -m graph.shared.embedders probe "test"            # 1024-dim vector returned
python -m graph.retrieval.rerank "q" "doc1" "doc2"       # rerank scores returned
'
```

Each probe must produce real output. If any fails, the corresponding
`*_BASE_URL` / `*_MODEL` / `*_API_KEY` triple in `.env` is wrong, OR the
URL isn't reachable from inside the container — test that with:

```bash
docker compose run --rm --no-deps app curl -sf -o /dev/null \
  -w "%{http_code}\n" http://<vllm-host>:<port>/v1/models
```

## Cache reset between full re-tests

Want a clean-slate ingestion on the offline machine?

```bash
docker compose down -v          # wipes qdrant_storage volume
rm -rf output/* output_docs/*   # wipes per-doc artefacts
```

Then `docker compose up -d qdrant` + `docker compose run --rm app python main.py`.

## What was changed in the codebase (vs. earlier transfer)

The biggest cause of offline failures in the previous transfer was a
silent `EMBED_PROVIDER=fastembed` / `RERANK_PROVIDER=fastembed` fallback:
if any env var was missing or typo'd, the code would silently try to
download bge-m3 ONNX (~2.3 GB) + bge-reranker ONNX (~600 MB) from
HuggingFace — which can't work on an airgapped machine, AND the dms_app
image deliberately doesn't bake those weights (§C32).

After this pass:

- `graph/shared/embedders.py` — HTTP-only `_get_dense_embedder()`. No
  fastembed dense path, no `add_custom_model` registration, no provider
  branching. Missing `EMBED_BASE_URL` / `EMBED_MODEL` raises a clear
  `RuntimeError` instead of silently going to download mode.
- `graph/retrieval/rerank.py` — HTTP-only. Same story: no fastembed
  cross-encoder path, no provider branching. Missing config raises.
- `graph/config.py`, `graph/retrieval/config.py`, `graph/shared/device_banner.py`,
  `graph/generation/cache.py` — dropped `EMBEDDER_PROVIDERS` /
  `RERANKER_PROVIDERS` env vars, `embedder_providers` /
  `reranker_providers` config fields, `embed_provider` /
  `rerank_provider` cache-key fragments, `RERANK_MODEL_SOURCE`,
  `RERANK_BATCH_SIZE`. None of those have meaning anymore.
- `graph/nodes/embed_chunks.py` — dropped `_register_bge_m3_if_needed`
  call (was a no-op on the HTTP path but spammed the warmup with HF
  cache lookups under `HF_HUB_OFFLINE=1`).

BM25 sparse vectors are unchanged: `fastembed.SparseTextEmbedding(model_name="Qdrant/bm25")`
is a pure-Python BM25 algorithm, no model weights, no network. It runs
in-process always.

## File hygiene cleanup (this transfer only)

Removed from the project:
- `.env.bak.cloud`, `.env.bak.fastembed` (env backups; old key was leaked
  in plaintext — rotate `sk-proj-wNyd0HFTWU7g9...` upstream if you haven't)
- `venv/` (~6.2 GB, leftover from macOS dev box)
- `alldocs21/` (~257 MB unused PDFs)
- `dockerfiles/DecisionMakingSteps_TRANSFER.tar.gz` (35 MB, redundant — source is the live tree)
- `README_TRANSFER.md`, `TRANSFER_NOTES.md`, `changesonS4.md` (session-specific notes)
- All `__pycache__/` directories
