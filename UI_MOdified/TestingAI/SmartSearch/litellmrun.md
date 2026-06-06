# litellmrun — full LiteLLM-fronted offline simulation runbook

> **Status:** planning + tracking document. Do not skip phases. Each phase has
> an explicit "smoke" section that must pass before moving to the next.

---

## Goals

1. Stand up a **LiteLLM + vLLM** stack on this machine that mirrors the
   architecture of the user's offline server.
2. Validate that the DMS project (Phase 1 ingest + Phase 2 retrieval +
   Phase 3 generation) runs **end-to-end** against that stack with all
   four `.docx` produced clean.
3. Repeat the validation with **the network physically cut** to prove
   the offline path works.
4. Identify the smallest possible transfer payload to the airgapped
   code machine (the one connected to the offline server).

## Non-goals

- This runbook does **not** cover the offline server's setup. Per the
  user's clarification (chat 2026-05-07), the offline server already has
  LiteLLM + vLLM + the three models running. The airgapped code machine
  only needs the DMS code + Qdrant + a `.env` pointing at the offline
  server's IP.
- The litellm folder ([litellm/](litellm/)) is **simulation-only**. It
  never leaves this online machine.

---

## Architecture

### Simulation on this machine (LiteLLM + vLLM both local)

```
DMS app (Phase 1/2/3)
    │
    ▼ all three model channels point at localhost:4000/v1
LiteLLM proxy        :4000   (litellm-image.tar)
    │── llm-model    → vLLM  :8000  Qwen3-4B-Instruct-2507-FP8
    │── embed-model  → vLLM  :8001  BAAI/bge-m3            --task embed
    └── rerank-model → vLLM  :8002  BAAI/bge-reranker-v2-m3 --task classify

Postgres :5433 (LiteLLM key/spend) + Redis :6379 (LiteLLM cache)
Qdrant   :6333 (vector store, local)
```

GPUs: 2 × RTX 5090 (32 GB each). Allocation:
- GPU 0 → vLLM-llm with `--gpu-memory-utilization 0.85`
- GPU 1 → vLLM-embed (0.30) + vLLM-rerank (0.30) co-resident

### Airgap target — offline code machine connected to offline server

```
Offline code machine                         Offline server (already up)
─────────────────────                        ──────────────────────────
DMS app  ─── HTTP ───────────────────────►   LiteLLM :4000 → 3 vLLMs
Qdrant   (local on code machine)
.env points at <offline-server-ip>:4000/v1
```

**No code differences between simulation and airgap target.** Only `.env`
differs (loopback URL vs. offline-server IP).

---

## Phase A — Online prep (do all of this before pulling the cable)

### A1. Re-pull base Docker images

We deleted `dms_app:latest` and `qdrant/qdrant:latest` earlier in this session.

```bash
docker pull postgres:15
docker pull redis:7-alpine
docker pull qdrant/qdrant:latest
# vllm/vllm-openai:gemma4-cu130 already present (verified)
docker images | grep -E "postgres|redis|qdrant|vllm"
```

### A2. Pre-download HF model weights

```bash
pip install -U "huggingface_hub[cli]"
export HF_HOME="$HOME/.cache/huggingface"

huggingface-cli download Qwen/Qwen3-4B-Instruct-2507-FP8
huggingface-cli download BAAI/bge-m3
huggingface-cli download BAAI/bge-reranker-v2-m3

ls -la "$HF_HOME/hub/"
# Expect three "models--*" directories.
```

Total ~10 GB.

### A3. Pre-warm everything else the project might fetch online

The project already ships [scripts/warmup_models.py](scripts/warmup_models.py)
exactly for this purpose. It populates:

- bge-m3 tokenizer (used by HybridChunker in [graph/nodes/chunk_document.py:184](graph/nodes/chunk_document.py#L184))
- Qdrant/bm25 sparse vocabulary (used by [graph/shared/embedders.py:219](graph/shared/embedders.py#L219))
- tiktoken encodings (`o200k_base`, `cl100k_base`, `p50k_base`)
- bge-m3 ONNX (FastEmbed cache — even though runtime uses HTTP, FastEmbed
  cache existence prevents some import-time probes)
- bge-reranker ONNX (same)

```bash
cd /home/pheonix0104/Desktop/omar/DecisionMakingSteps_TRANSFER
source venv/bin/activate
python scripts/warmup_models.py
```

If the script doesn't exist or fails, manual fallback:

```bash
python -c "
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
HuggingFaceTokenizer.from_pretrained(model_name='BAAI/bge-m3', max_tokens=512)
print('bge-m3 tokenizer cached')
"

python -c "
import tiktoken
for n in ('o200k_base', 'cl100k_base', 'p50k_base'):
    tiktoken.get_encoding(n)
print('tiktoken cached')
"

python -c "
from fastembed import SparseTextEmbedding
SparseTextEmbedding(model_name='Qdrant/bm25')
print('Qdrant/bm25 cached')
"
```

### A4. Pre-warm Docling weights (run an actual ingest while online)

Docling downloads layout + TableFormer + RapidOCR weights from HF on
first parse. Run `main.py` once online with at least one input PDF
present in `inputs/<folder>/`:

```bash
docker start qdrant   # if not already up
python main.py        # populates ~/.cache/docling/ as a side effect
```

Check the cache exists:
```bash
ls -la ~/.cache/docling/ 2>/dev/null || ls -la ~/.cache/huggingface/hub/ | grep docling
```

### A5. Verify Tesseract system binary

[graph/docling_converters.py](graph/docling_converters.py) shells out to
`tesseract` for the OCR fallback (§C19).

```bash
which tesseract && tesseract --version
# Expect: /usr/bin/tesseract  (Linux) or similar
# Languages installed:
tesseract --list-langs
# Expect at least: eng
```

If missing: `sudo apt install tesseract-ocr tesseract-ocr-eng`
(add `tesseract-ocr-ara` if Arabic-language OCR needed).

### A6. Verify project venv is complete

```bash
cd /home/pheonix0104/Desktop/omar/DecisionMakingSteps_TRANSFER
source venv/bin/activate
pip check                        # no broken dependencies
python -c "import docling, fastembed, qdrant_client, openai, langchain_openai, transformers; print('imports OK')"
```

### A7. Save docker image tarballs (belt-and-suspenders for true airgap)

This is overkill for the simulation on this machine (images live in the
local docker daemon already), but if you want a verifiable airgap:

```bash
mkdir -p ~/Desktop/sim_images
docker save postgres:15           -o ~/Desktop/sim_images/postgres15.tar
docker save redis:7-alpine        -o ~/Desktop/sim_images/redis7.tar
docker save qdrant/qdrant:latest  -o ~/Desktop/sim_images/qdrant.tar
docker save vllm/vllm-openai:gemma4-cu130 -o ~/Desktop/sim_images/vllm.tar
# litellm-image.tar already exists at litellm/litellm-image.tar
```

Skip this if you trust the local docker cache to survive a `nmcli off`
(it does — daemon doesn't need internet to start a cached image).

### A8. Generate / restore LiteLLM virtual keys

Pick ONE of:

**Option A — restore the snapshot the litellm folder ships with**
(already has 21 pre-generated keys):
```bash
docker volume create middleware_postgres_data
docker run --rm \
  -v middleware_postgres_data:/d \
  -v "$(pwd)/litellm:/backup" \
  alpine tar xzf /backup/postgres_data.tar.gz -C /d

docker volume create middleware_redis_data
docker run --rm \
  -v middleware_redis_data:/d \
  -v "$(pwd)/litellm:/backup" \
  alpine tar xzf /backup/redis_data.tar.gz -C /d
```

After bringing the stack up, list the keys with
[litellm/middleware/test_db_queries.sh](litellm/middleware/test_db_queries.sh).

**Option B — start fresh and generate new keys**:
```bash
# After Phase B is up and LiteLLM is responding:
cd litellm/middleware
./setup_keys.sh       # creates 1 VIP + 20 normal keys
# Save a key to .env immediately — setup_keys.sh's output is not persisted
# anywhere except its stdout.
```

### A9. Build the simulation `.env`

Replace the project's `.env` with the simulation shape. **Back up the
existing `.env` first** if it has anything you care about:

```bash
cp .env .env.pre_litellm_backup
```

Write the new `.env`:

```ini
# -- Simulation against LiteLLM + vLLM on localhost --
OPENAI_API_KEY=sk-litellm-placeholder

LLM_BASE_URL=http://localhost:4000/v1
LLM_API_KEY=<paste vip-key from setup_keys.sh or postgres snapshot>
LLM_MODEL=llm-model
LLM_USE_RESPONSES_API=1

EMBED_PROVIDER=http
EMBED_BASE_URL=http://localhost:4000/v1
EMBED_API_KEY=<same key>
EMBED_MODEL=embed-model

RERANK_PROVIDER=http
RERANK_BASE_URL=http://localhost:4000/v1
RERANK_API_KEY=<same key>
RERANK_MODEL=rerank-model

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# -- Offline guards (block phone-home) --
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
HF_DATASETS_OFFLINE=1
HF_HUB_DISABLE_TELEMETRY=1
TIKTOKEN_CACHE_DIR=/home/pheonix0104/.cache/tiktoken

# -- Project ingestion knobs (unchanged from prior runs) --
DOCLING_DEVICE=auto
EMBEDDER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
EMBED_BATCH_SIZE=128
UPSERT_BATCH_SIZE=256
OUTPUT_DIR=output
COLLECTION_PREFIX=ingest
EMBEDDER_TAG=bgem3
OCR_RETRY_ON_GARBAGE=1
OCR_RETRY_MAX_PER_FOLDER=5
OCR_LANGS=eng

# -- Phase 1 / 2 / 3 model role pins (use the LiteLLM aliases) --
PHASE1_GATE_MODEL=llm-model
QUERY_EXPAND_LLM_MODEL=llm-model
PHASE3_EXTRACTOR_MODEL=llm-model
PHASE3_DRAFT_MODEL=llm-model
PHASE3_CRITIQUE_MODEL=llm-model
PHASE3_EXTRACTOR_TEMPERATURE=0.0
PHASE3_DRAFT_TEMPERATURE=0.2
PHASE3_CRITIQUE_TEMPERATURE=0.0

# -- Phase 3 retrieval knobs (defaults — tune later) --
PHASE3_TOP_K_PER_QUERY=20
PHASE3_MERGE_POOL_SIZE=60
PHASE3_MERGED_TOP_K=10
PHASE3_FORCE_REGENERATE=0
PHASE3_DEFAULT_TIER_POLICY=operationalfiles_only
PHASE3_TIERED_RETRIEVAL=1

# -- Reranker tuning --
RERANK_TOP_N_IN=50
RERANK_TOP_K_OUT=10
RERANK_BATCH_SIZE=16
```

### A10. Edit [litellm/middleware/litellm_config.yaml](litellm/middleware/litellm_config.yaml)

Replace its current 1-route shape with the 3-route shape:

```yaml
model_list:
  - model_name: llm-model
    litellm_params:
      model: openai/Qwen/Qwen3-4B-Instruct-2507-FP8
      api_base: http://localhost:8000/v1
      api_key: Empty
  - model_name: embed-model
    litellm_params:
      model: openai/BAAI/bge-m3
      api_base: http://localhost:8001/v1
      api_key: Empty
  - model_name: rerank-model
    litellm_params:
      model: openai/BAAI/bge-reranker-v2-m3
      api_base: http://localhost:8002/v1
      api_key: Empty

litellm_settings:
  cache: true
  database_url: "postgresql://litellm:litellm@localhost:5433/litellm"
  drop_params: true
  master_key: "sk-1234"
  routing_strategy: usage-based-routing

general_settings:
  use_redis_transaction_buffer: true

router_settings:
  redis_host: "localhost"
  redis_port: 6379
```

### A11. Acceptance smoke for Phase A

Before moving on, ALL of these must pass while still online:

- [ ] `docker images | grep -E "postgres:15|redis:7-alpine|qdrant/qdrant|vllm/vllm-openai:gemma4-cu130|litellm:latest"` — 5 lines
- [ ] `ls ~/.cache/huggingface/hub/ | grep -E "models--Qwen--|models--BAAI--bge-m3|models--BAAI--bge-reranker"` — 3 lines
- [ ] `ls ~/.cache/docling/` exists (or equivalent layout/TableFormer cache)
- [ ] `tesseract --list-langs` includes `eng`
- [ ] `python -m graph.shared.llm_factory` prints non-empty endpoint tag and key set
- [ ] `pip check` reports no broken dependencies
- [ ] `.env` is the simulation shape (Phase A9)
- [ ] [litellm/middleware/litellm_config.yaml](litellm/middleware/litellm_config.yaml) has 3 model routes (Phase A10)

---

## Phase B — Bring up the simulation stack (still online)

### B1. Start the three vLLM containers

Each one takes ~60–120 s to load. Run in three separate terminals or
background them.

```bash
# vLLM-llm on GPU 0 → :8000
docker run -d \
  --name vllm-llm \
  --gpus '"device=0"' \
  -p 8000:8000 \
  --ipc=host \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e HF_HUB_DISABLE_TELEMETRY=1 \
  vllm/vllm-openai:gemma4-cu130 \
  --model Qwen/Qwen3-4B-Instruct-2507-FP8 \
  --gpu-memory-utilization 0.85 \
  --port 8000 \
  --disable-usage-stats

# vLLM-embed on GPU 1 → :8001
docker run -d \
  --name vllm-embed \
  --gpus '"device=1"' \
  -p 8001:8001 \
  --ipc=host \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e HF_HUB_DISABLE_TELEMETRY=1 \
  vllm/vllm-openai:gemma4-cu130 \
  --model BAAI/bge-m3 \
  --task embed \
  --gpu-memory-utilization 0.30 \
  --port 8001 \
  --disable-usage-stats

# vLLM-rerank on GPU 1 (co-resident with embed) → :8002
docker run -d \
  --name vllm-rerank \
  --gpus '"device=1"' \
  -p 8002:8002 \
  --ipc=host \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 -e HF_HUB_DISABLE_TELEMETRY=1 \
  vllm/vllm-openai:gemma4-cu130 \
  --model BAAI/bge-reranker-v2-m3 \
  --task classify \
  --gpu-memory-utilization 0.30 \
  --port 8002 \
  --disable-usage-stats
```

Wait until each one's logs say `Uvicorn running on …` or `Application startup complete`.

```bash
docker logs --tail 20 vllm-llm
docker logs --tail 20 vllm-embed
docker logs --tail 20 vllm-rerank
```

### B2. Smoke each vLLM directly (bypass LiteLLM)

```bash
# LLM
curl http://localhost:8000/v1/models
curl http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen3-4B-Instruct-2507-FP8","input":"say READY"}'

# Embedder
curl http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"BAAI/bge-m3","input":"hello"}'

# Reranker (vLLM exposes /v1/score for --task classify)
curl http://localhost:8002/v1/score \
  -H "Content-Type: application/json" \
  -d '{"model":"BAAI/bge-reranker-v2-m3","text_1":"q","text_2":["doc one","doc two"]}'
```

If any of those fail, **stop and fix before bringing up LiteLLM**. The
LiteLLM passthrough cannot fix a broken upstream.

### B3. Start LiteLLM stack

```bash
cd /home/pheonix0104/Desktop/omar/DecisionMakingSteps_TRANSFER/litellm/middleware
chmod +x *.sh           # exfat may have stripped +x; safe no-op otherwise
./run-docker.sh         # postgres → redis → litellm
sleep 15

docker ps | grep -E "middleware|litellm"
docker logs --tail 50 middleware-litellm-1
```

### B4. Smoke LiteLLM aggregation

```bash
# Should list 3 models
curl -s http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-1234" | python -m json.tool

# Get a virtual key (or use sk-1234 master key for smoke; not recommended later)
cd litellm/middleware
./test_db_queries.sh    # lists existing keys from the postgres snapshot
# Or: ./setup_keys.sh   # generates a fresh batch
```

Set the chosen key in the project's `.env` (`LLM_API_KEY`,
`EMBED_API_KEY`, `RERANK_API_KEY` — same value).

### B5. Smoke each route through LiteLLM

```bash
KEY="<your virtual key here>"

# LLM via Responses API
curl http://localhost:4000/v1/responses \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llm-model","input":"reply with the single word READY"}'

# Embedder
curl http://localhost:4000/v1/embeddings \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"embed-model","input":"hello"}'

# Reranker (Cohere shape; LiteLLM translates to vLLM /v1/score)
curl http://localhost:4000/v1/rerank \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"rerank-model","query":"mission command","documents":["a doc about logistics","a doc about command philosophy","a doc about weather"]}'
```

**If LiteLLM `/v1/responses` 404s or 5xxs**, the LiteLLM v1.83.7 build
likely doesn't fully proxy the Responses API. Fallbacks:
- Set `LLM_BASE_URL=http://localhost:8000/v1` in `.env` (bypass LiteLLM
  for LLM only). Embedder and reranker stay through LiteLLM.
- OR set `LLM_USE_RESPONSES_API=0` (escape hatch — invalidates Phase 3
  cache, project switches to chat-completions shape).

### B6. Smoke through the DMS code (the real test)

```bash
cd /home/pheonix0104/Desktop/omar/DecisionMakingSteps_TRANSFER
source venv/bin/activate

python -m graph.shared.llm_factory          # endpoint resolves
python -m graph.shared.embedders probe "hello"   # 1024-dim, norm 1.0
python -m graph.shared.responses_client probe   # text + structured both pass
python -m graph.retrieval.rerank "mission command" "logistics" "command philosophy" "weather"
```

All four must pass before moving to ingestion.

### B7. Full re-ingest (vector space rebuild required)

The existing Qdrant collections were embedded with FastEmbed-ONNX.
vLLM-served bge-m3 is not bit-identical, so collections must be rebuilt.

```bash
docker start qdrant
python main.py
```

Watch the logs. Expected at the top:
```
[device] Docling : ...
[device] FastEmbed providers : ...
```
Followed by per-folder ingest output. Final state: `_registry` collection
has one entry per `inputs/<folder>/`, each ingest collection has the
right number of points.

### B8. Full Phase 3 generation

```bash
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/litellmrun_online_smoke
```

Acceptance:
- 4 × `.docx` files
- 4 × `<doc>.fields.json` next to them
- `extracted_inputs.json` + `run_sources.json`
- No empty-string fields in any `.fields.json` (the dispatcher's
  post-condition will assert this)

### B9. Phase B acceptance checklist

- [ ] All 6 containers running: `docker ps | wc -l` includes vllm-llm, vllm-embed, vllm-rerank, postgres, redis, litellm + qdrant = 7
- [ ] `curl http://localhost:4000/v1/models` lists 3 models
- [ ] `python -m graph.shared.responses_client probe` exits 0
- [ ] `python -m graph.shared.embedders probe "hello"` reports norm ≈ 1.0
- [ ] `python -m graph.retrieval.rerank …` returns ranked hits
- [ ] `python main.py` ingests all `inputs/<folder>/` content into Qdrant
- [ ] `scripts/generate_documents.py` produces 4/4 `.docx`

---

## Phase C — Cut the network and re-run (real airgap test)

### C1. Pick a network-cut method

| Method | Command | Realism | Reversal |
|---|---|---|---|
| **Physical** | unplug ethernet | highest | replug |
| **NetworkManager** | `sudo nmcli networking off` | very high | `sudo nmcli networking on` |
| **iptables** | `sudo iptables -P OUTPUT REJECT && sudo iptables -A OUTPUT -o lo -j ACCEPT && sudo iptables -A OUTPUT -d 127.0.0.0/8 -j ACCEPT && sudo iptables -A OUTPUT -d 172.17.0.0/16 -j ACCEPT && sudo iptables -A OUTPUT -d 172.18.0.0/16 -j ACCEPT` | high (allows docker bridge + loopback) | `sudo iptables -F OUTPUT && sudo iptables -P OUTPUT ACCEPT` |

**Note on iptables ranges:** docker uses `172.17.x.x` for the default
bridge and `172.18+` for additional networks. Verify with
`docker network inspect bridge` and adjust the iptables ALLOW rules.
LiteLLM uses `network_mode: host` so it talks to localhost only — but
postgres, redis, qdrant containers use the docker bridge, so loopback
alone is not enough.

### C2. Confirm the cut

```bash
ping -c 2 -W 2 8.8.8.8     # MUST FAIL
ping -c 2 -W 2 huggingface.co   # MUST FAIL
ping -c 2 -W 2 localhost   # must succeed
curl -m 3 http://localhost:6333/readyz   # qdrant must respond
curl -m 3 http://localhost:4000/health   # litellm must respond (or use /v1/models with key)
```

### C3. Re-run the smoke (full project flow)

```bash
cd /home/pheonix0104/Desktop/omar/DecisionMakingSteps_TRANSFER
source venv/bin/activate

# 1. Per-module probes
python -m graph.shared.responses_client probe
python -m graph.shared.embedders probe "airgap test"
python -m graph.retrieval.rerank "test query" "doc one" "doc two"

# 2. End-to-end Phase 3 (Phase 1 was already ingested in B7;
#    if you want to re-prove the ingest path, delete one .stage_fingerprints.json
#    or set FORCE_REPARSE=1 in .env and re-run main.py)
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/litellmrun_airgap_smoke
```

### C4. If anything fails offline that worked online, here's what to look for

| Symptom | Likely cause | Fix |
|---|---|---|
| `huggingface.co` lookup error | bge-m3 tokenizer not pre-cached | re-run Phase A3 online, restart |
| `tiktoken` connection refused | encoding not pre-cached | re-run Phase A3, set `TIKTOKEN_CACHE_DIR` |
| Docling fails on first PDF | `~/.cache/docling/` missing weights | run Phase A4 online |
| vLLM logs `OSError: model not found` | HF_HUB_OFFLINE=1 + missing local weights | re-run Phase A2; restart vLLM |
| LiteLLM 502 on `/v1/responses` | passthrough version mismatch | bypass LiteLLM for LLM only (Phase B5 fallback) |
| `RerankUnavailable` raised | vLLM `--task classify` mismatch with LiteLLM Cohere translation | check vLLM logs; LiteLLM should accept `score` alias |
| Empty Phase 3 .fields.json values | extractor LLM unreachable; check responses_client logs | confirm LiteLLM model route 'llm-model' |

### C5. Phase C acceptance checklist

- [ ] Network confirmed cut (Phase C2 pings fail)
- [ ] `python -m graph.shared.responses_client probe` exits 0
- [ ] `python -m graph.shared.embedders probe …` exits 0
- [ ] `python -m graph.retrieval.rerank …` returns hits
- [ ] `scripts/generate_documents.py` produces 4/4 `.docx` AGAIN, fully offline
- [ ] Output `.fields.json` has no empty strings
- [ ] No log line contains "huggingface.co", "openaipublic", or any external host

### C6. Restore network

Reverse whichever method you used in C1.

---

## Phase D — Transfer to the offline code machine

Per user clarification: the offline server already has LiteLLM + vLLM +
the three models running. The offline code machine connects to it over
the airgapped intranet.

### D1. Build the transfer payload

```bash
# 1. Source code + middleware folder + the new .env shape
cd /home/pheonix0104/Desktop/omar
tar --exclude='DecisionMakingSteps_TRANSFER/venv' \
    --exclude='DecisionMakingSteps_TRANSFER/output' \
    --exclude='DecisionMakingSteps_TRANSFER/.group_cache' \
    --exclude='DecisionMakingSteps_TRANSFER/litellm' \
    -czf ~/Desktop/transfer/DecisionMakingSteps_TRANSFER.tar.gz \
    DecisionMakingSteps_TRANSFER/

# 2. Qdrant image (offline server doesn't host Qdrant; the code machine does)
docker save qdrant/qdrant:latest -o ~/Desktop/transfer/qdrant.tar

# 3. DMS app image (rebuild against the new requirements / .env defaults
#    once the simulation has proved the flow). NOT done in this phase
#    until the user confirms — see open question below.
```

**Open question: do we ship a pre-built `dms_app.tar` or build on the
offline machine from source?**

Trade-offs:
- **Pre-built (~4 GB transfer)**: faster on the airgap box, but the user
  needs `docker load` + the same image arch.
- **Source-only (~40 MB transfer)**: needs `pip install` + build steps
  on the airgap box. If the airgap box has internet to a private mirror,
  this works; if not, every wheel must already be cached locally.

Decision deferred until simulation passes and we know which is more
practical for the user's airgap box.

### D2. `.env` for the offline code machine

```ini
# -- Offline code machine: connects to offline server over intranet --
OPENAI_API_KEY=sk-litellm-placeholder

LLM_BASE_URL=http://<OFFLINE-SERVER-IP>:4000/v1
LLM_API_KEY=<virtual key issued by offline server's LiteLLM>
LLM_MODEL=<model name as configured on offline server, e.g. llm-model>
LLM_USE_RESPONSES_API=1

EMBED_PROVIDER=http
EMBED_BASE_URL=http://<OFFLINE-SERVER-IP>:4000/v1
EMBED_API_KEY=<same key>
EMBED_MODEL=<embedder name on offline server>

RERANK_PROVIDER=http
RERANK_BASE_URL=http://<OFFLINE-SERVER-IP>:4000/v1
RERANK_API_KEY=<same key>
RERANK_MODEL=<reranker name on offline server>

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
HF_DATASETS_OFFLINE=1
HF_HUB_DISABLE_TELEMETRY=1
TIKTOKEN_CACHE_DIR=<resolved at deploy time>
```

The user fills `<OFFLINE-SERVER-IP>` and the three model names on
arrival. Everything else is identical to the simulation `.env`.

### D3. Difference vs. the previous (deleted) transfer

| Item | Previous (deleted) | New (post-simulation) |
|---|---|---|
| Total transfer size | ~4.6 GB | ~4.6 GB (same) |
| `dms_app.tar` | yes (built against LM Studio) | yes (rebuilt against LiteLLM `.env` defaults) |
| `qdrant.tar` | yes | yes |
| Source tarball | yes | yes (with new `.env` shape) |
| LiteLLM stack | shipped (we deleted it) | **not shipped** — already on offline server |
| HF model weights | baked into `dms_app.tar` (FastEmbed) | **not shipped** — already on offline server |
| `LLM_BASE_URL` | LM Studio external | offline server's LiteLLM IP |
| `EMBED_PROVIDER` | `fastembed` (in-process) | `http` |
| `RERANK_PROVIDER` | `fastembed` (in-process) | `http` |
| Re-ingest required on offline machine? | Conditional | **Yes** — vector space changes |

### D4. Phase D acceptance (on the offline code machine)

- [ ] `docker load -i qdrant.tar` succeeds
- [ ] `tar xzf DecisionMakingSteps_TRANSFER.tar.gz` extracts cleanly
- [ ] `docker start qdrant` and `curl localhost:6333/readyz` works
- [ ] `python -m graph.shared.responses_client probe` against the
      offline server's LiteLLM IP exits 0
- [ ] `python main.py` ingests `inputs/<folder>/` into local Qdrant
- [ ] `scripts/generate_documents.py` produces 4/4 `.docx`

---

## Code audit — what the simulation does NOT need to change

Result of the audit done 2026-05-07 (chat above):

### Already provider-agnostic, no edits needed

| File | Why it's fine |
|---|---|
| [graph/shared/embedders.py](graph/shared/embedders.py) | HTTP-only. Posts to `<EMBED_BASE_URL>/embeddings`. L2-normalises defensively. |
| [graph/retrieval/rerank.py](graph/retrieval/rerank.py) | HTTP-only. Posts to `<RERANK_BASE_URL>/rerank`. Accepts `score` as alias for `relevance_score`. Degrades gracefully on failure. |
| [graph/shared/responses_client.py](graph/shared/responses_client.py) | Talks to `POST /v1/responses` via openai SDK. Has `httpx.Client(verify=False)` for self-signed certs. |
| [graph/generation/llm.py](graph/generation/llm.py) | All env-driven via [graph/shared/llm_factory.py](graph/shared/llm_factory.py). |
| [graph/nodes/embed_chunks.py](graph/nodes/embed_chunks.py) | Pulls embedders via the lazy singletons in [graph/shared/embedders.py](graph/shared/embedders.py). |
| [graph/nodes/upsert_to_qdrant.py](graph/nodes/upsert_to_qdrant.py) | Reads `QDRANT_URL` from env. |
| [graph/generation/cache.py](graph/generation/cache.py) | `embed_endpoint_tag` + `rerank_endpoint_tag` already cover URL flips. Stale env var names in docstring (`embed_provider`, `rerank_provider`) are NOT read at runtime. |

### Stale-but-harmless documentation

The `.env.example` mentions `EMBED_PROVIDER` and `RERANK_PROVIDER`. The
runtime no longer reads these — they're cosmetic. Keep `EMBED_PROVIDER=http`
and `RERANK_PROVIDER=http` for consistency with old docs, but understand
they're no-ops.

---

## Likely failure modes (reference)

Ranked by probability based on the previous airgap attempt that "didn't run":

### #1 — bge-m3 tokenizer download
[graph/nodes/chunk_document.py:184](graph/nodes/chunk_document.py#L184)
calls `HuggingFaceTokenizer.from_pretrained("BAAI/bge-m3")`. Without
`HF_HUB_OFFLINE=1` AND a populated cache, this hangs forever waiting
for `huggingface.co`. **Mitigation:** Phase A3 + Phase A9 env vars.

### #2 — Docling layout/TableFormer weights
First PDF parse downloads ~500 MB of model weights from HF. Same hang
mode. **Mitigation:** Phase A4 (run `main.py` once online).

### #3 — tiktoken `cl100k_base` BPE
The openai SDK calls `tiktoken.get_encoding("cl100k_base")` for token
counting. Tries to fetch from `openaipublic.blob.core.windows.net`.
**Mitigation:** the LiteLLM image already bakes this; the host venv is
covered by Phase A3.

### #4 — LiteLLM `/v1/responses` passthrough mismatch
LiteLLM v1.83.7 forwards Responses API to upstream for `openai/...`
provider strings. If the forwarding shape doesn't match what vLLM
exposes, the call 502s. **Mitigation:** Phase B5 fallback options.

### #5 — Qdrant/bm25 sparse vocab
[graph/shared/embedders.py:219](graph/shared/embedders.py#L219)
instantiates `SparseTextEmbedding(model_name="Qdrant/bm25")` which
fetches a small vocab file from HF. **Mitigation:** Phase A3.

### #6 — Vector parity drift
Existing Qdrant collections were embedded with FastEmbed-ONNX. Switching
to vLLM-served bge-m3 may shift cosines slightly. **Mitigation:**
Phase B7 mandatory re-ingest.

### #7 — vLLM Blackwell SM 12.0 kernel availability
RTX 5090 needs CUDA 12.8+ and vLLM compiled against the matching
PyTorch. The chosen image `vllm/vllm-openai:gemma4-cu130` is CUDA 13.0
which supports Blackwell. **Mitigation:** verified during image
selection — but if vLLM-llm fails to start with a kernel error, fall
back to a smaller / non-FP8 LLM for the simulation only.

---

## Open questions / decisions deferred

- **`dms_app.tar` rebuild** — wait until simulation passes before
  deciding whether to ship pre-built or source-only (Phase D1).
- **Qdrant image transfer to offline machine** — assumed yes per the
  previous transfer; flip if the offline code machine already has it.
- **Postgres + Redis snapshot keys** — the litellm folder ships pre-made
  keys. We use them in the simulation. The offline server has its own
  keys; the user pastes one into the airgap `.env` (Phase D2).

---

## Tracking — phase completion

- [x] **Phase A — online prep** *(completed 2026-05-07)*
- [x] **Phase B — simulation up + project produces 4/4 `.docx`** *(completed 2026-05-07; outputs at `~/Desktop/litellm generated docs/`)*
- [x] **Phase C — re-run with network cut, 4/4 `.docx` again** *(completed 2026-05-07; outputs at `~/Desktop/litellm generated docs airgap/`)*
- [x] **Phase D build — transfer payload produced** *(2026-05-08; staged in `~/Desktop/transfer/`: `dms_app.tar.gz`, `qdrant.tar.gz`, `DecisionMakingSteps_TRANSFER.tar.gz`, `.env.offline.template`, `_transfer_docs/`)*
- [ ] Phase D bring-up — load images + fill `.env` + `preflight_offline_smoke.py` + `main.py` + `generate_documents.py` on the offline code machine

### §D execution — additions to the runbook (2026-05-08)

**SSL bypass added to embedder + reranker** so HTTP and HTTPS (any cert) both
work without `.env` toggles.  Mirrors the pattern in
[graph/shared/responses_client.py:183](graph/shared/responses_client.py#L183).
Two edits, both wrap the existing `urllib.request.urlopen()` call with a
trust-anything `ssl.SSLContext`:

- [graph/shared/embedders.py:`_embed_batch`](graph/shared/embedders.py) —
  `ssl.create_default_context()` with `check_hostname=False` and
  `verify_mode=ssl.CERT_NONE`, passed via `context=ssl_ctx` to
  `urlopen()`.
- [graph/retrieval/rerank.py:`HttpReranker.score`](graph/retrieval/rerank.py) —
  same.

The **previous transfers failed silently** because the LLM channel
(via openai SDK + `httpx.Client(verify=False)`) accepted any cert while
the embed and rerank channels (plain `urllib`) rejected self-signed
HTTPS — ingest failed at upsert and Phase 2 retrieval failed at
rerank.  This pass fixes that.  Locked decision: do NOT deploy this
image on an internet-facing host.

**Pre-flight smoke** [`scripts/preflight_offline_smoke.py`](scripts/preflight_offline_smoke.py)
— 11 checks covering env vars, Tesseract languages, local Qdrant,
offline-server reachability, live LLM/embed/rerank probes, plus
local imports of BM25 / Docling / RapidOCR / HF tokenizer / tiktoken.
Single command, ~5 s, exit code 0 = system ready for ingest.  This is
the operator's **first** action after copying `.env` on the offline
box; if any check fails, the script localises the problem to one
channel before they waste time on a full ingest run.

**Curated operator-facing doc set** at
`~/Desktop/transfer/_transfer_docs/`.  Ships exactly 5 MDs, no clutter:

| File | Purpose |
|---|---|
| `OFFLINE_SETUP.md` | NEW — single setup-to-running doc |
| `OFFLINE_TROUBLESHOOTING.md` | Deeper failure-mode catalog |
| `NewClasses.md` | Pydantic schema reference |
| `docs/pdf_failure_fallback_plan.md` | Arabic PDF / broken CMap rescue |
| `referencedocs/19_phase3_arabic_renderer.md` | RTL typography contract |

Everything else (litellmrun.md, OFFLINE_RUNBOOK.md, OFFLINE_HANDOFF.md,
docs/memory.md, internal walkthroughs, dev UI plan, tiered_retrieval
discussion) was deliberately left off the offline transfer per the
"uncluttered" directive.  These remain on the build box for future
session continuity.

### Notes from execution
- **A3 RapidOCR cache fix** — modelscope.cn unreachable; bundled wheel ONNX renamed
  from `_infer` → `_mobile` filenames in `venv/lib/.../rapidocr/models/` so RapidOCR
  finds them locally and skips download.
- **A8 `output/` path conflict** — `output/not_enough/` and `output/smoketest_mdmp/`
  were owned by `root` from a previous bind-mount run. Fix: changed `OUTPUT_DIR`
  in `.env` from `output` to `output_litellmrun`.
- **B1 vLLM flag updates** — image is vLLM 0.19.1.dev6 which uses `--runner pooling`
  + `--convert classify` instead of `--task embed` / `--task classify`. Also no
  `--disable-log-requests` flag.
- **B1 vLLM-llm KV cache** — Qwen3 has 256K context, default tries to allocate
  36 GB KV cache. Fix: `--max-model-len 32768` (32K is plenty for our docs).
- **B5 LiteLLM provider prefix** — `openai/...` doesn't support rerank or vLLM-shaped
  embeddings. Switched to `hosted_vllm/...` for all 3 routes. LiteLLM's
  `hosted_vllm` provider has dedicated `/embedding/` and `/rerank/` handlers
  that correctly translate Cohere `/rerank` → vLLM `/v1/score`.
- **B8 prefetch limits** — `top_n_in = max(50, top_k_per_query*6) = 120` exceeded
  the default `HYBRID_*_PREFETCH=50`. Fix: set both to 200 in `.env`.
- **B8 tier-aware retrieval** — `initial_planning_guidance.planning_directives`
  YAML has `policy: operationalfiles_then_doctrine` which fanned out to a
  doctrine collection that doesn't exist (we only have operationalfiles
  ingested). Fix: `PHASE3_TIERED_RETRIEVAL=0` in `.env` — operator override
  documented in CLAUDE.md.
- **C3.3 byte differences vs B8** — `initial_planning_guidance` (+43 B) and
  `staff_brief` (+92 B) differ between runs because `PHASE3_FORCE_REGENERATE=1`
  re-called Qwen3 and the LLM is not byte-deterministic. Non-LLM docs
  (`time_analysis`, `warning_order`) are byte-identical, which validates the
  Δ shows live LLM activity, not cache replay.

### Known LiteLLM/vLLM compatibility for the offline server

The offline server's LiteLLM config should use `hosted_vllm/` provider prefix
(NOT `openai/`) for the embedder and reranker routes. Otherwise the embedder
gets `encoding_format` validation errors from vLLM and the reranker gets
"Unsupported provider: openai" from LiteLLM. The LLM route works with either
prefix because `/v1/responses` is consistent across both.

---

## Arabic-input considerations (offline machine uses Arabic source docs)

The offline code machine ingests **Arabic-language PDFs / DOCX**. Most of the
stack handles Arabic transparently because the chosen models are multilingual,
but a few knobs need attention:

| Layer | Arabic readiness | Action required |
|---|---|---|
| **Tesseract OCR** (§C19 retry path) | Needs `ara.traineddata` installed | Verify `tesseract --list-langs` includes `ara`. Install with `sudo apt install tesseract-ocr-ara` if missing. |
| **`OCR_LANGS` in `.env`** | Drives Tesseract language list | Already set to `eng+ara` in the `.env` template (Phase D2). |
| **Docling text-layer parser** | Handles Arabic text-layer extraction natively | No config needed. Layout / TableFormer weights are language-agnostic. |
| **bge-m3 (embedder)** | Multilingual embedding model — Arabic + English in same vector space | No config needed. Qdrant collections store both interchangeably. |
| **bge-reranker-v2-m3** | Multilingual cross-encoder — accepts Arabic queries against Arabic chunks | No config needed. |
| **Qwen3-4B-Instruct (LLM)** | Strong Arabic capability in training | Same prompt template works for Arabic input + Arabic output. |
| **§C18 MDMP-topical gate** | Prompt is English-instructional but accepts Arabic content for assessment | Already verified — gate accepted the 4 English MDMP manuals; same logic will accept Arabic MDMP doctrine. |

### Watch-outs specific to Arabic ingestion

1. **§C19 OCR-retry false positive risk.** The "garbage" classifier in
   [graph/nodes/check_documents.py](graph/nodes/check_documents.py) uses
   *ASCII-letter ratio* as a fallback signal. Pure-Arabic PDFs have very low
   ASCII ratio by design. The retry only fires when the LLM gate **rejects**
   the doc AND the remark/ratio test triggers — so a clean Arabic doc that
   passes the LLM gate is safe. If a real Arabic doc is mis-rejected, lower
   `OCR_RETRY_MAX_PER_FOLDER` won't help; instead inspect the rejection
   review bundle at `output/not_enough/<slug>/<stem>/check_decision.json`.

2. **PDF text-layer Arabic encoding.** Some Arabic PDFs (especially older
   InDesign or government-produced ones) have broken ToUnicode CMaps that
   make text-layer extraction return mangled bytes — the same class of
   issue documented in [docs/pdf_failure_fallback_plan.md](docs/pdf_failure_fallback_plan.md)
   for ADP-2-0. The §C19 OCR-retry handles this by routing to
   Tesseract `force_full_page_ocr=True`. With `OCR_LANGS=eng+ara` Tesseract
   will visually decode the rendered glyphs.

3. **Vector parity is unaffected.** bge-m3 outputs the same 1024-dim vectors
   for Arabic and English text; mixing Arabic and English chunks in one
   Qdrant collection is supported by design. No re-ingest needed if you
   add Arabic documents to an existing English-ingested collection.

4. **Right-to-left rendering of `.docx` outputs.** The Arabic renderer
   ([graph/generation/renderers/arabic_docx.py](graph/generation/renderers/arabic_docx.py))
   already emits RTL paragraphs with proper kashida / tanwin / presentation-form
   handling. See [referencedocs/19_phase3_arabic_renderer.md](referencedocs/19_phase3_arabic_renderer.md)
   for the typography contract — that doc should be transferred to the
   offline machine for reference (see "Transfer manifest" below).

5. **The §C16 NFC normalization** in [graph/generation/cache.py](graph/generation/cache.py)
   makes the cache key stable across kashida variants, presentation-form
   letters, and tanwin glyphs. So the same Arabic prompt edited only in
   visual-equivalent codepoints won't bust the cache.

6. **Quick smoke after first Arabic ingest:**
   ```bash
   curl -s "http://localhost:6333/collections/ingest__<your_folder>__bgem3/points" \
        -X POST -H "Content-Type: application/json" \
        -d '{"limit": 1, "with_payload": true}' \
        | python3 -m json.tool | head -40
   ```
   The first chunk's `payload.text` should show Arabic characters, not `\uXXXX`
   escapes (Qdrant returns UTF-8 text, not escaped). If you see `?` or
   `\\u` literals, the parse failed silently — re-run with `OCR_RETRY_ON_GARBAGE=1`.

---

## Transfer manifest — exactly what ships to the offline code machine

After Phase D, the offline operator should receive these and **only** these
documentation files. Ship the project source + the curated docs below.

### Documentation that MUST ship (operator runs the project + reads context)

| File | Purpose | Stays at | Why ship |
|---|---|---|---|
| [litellmrun.md](litellmrun.md) | This runbook — sim and airgap proof | repo root | Operator can refer back to the proven `.env` shape, the troubleshooting tables, and the failure-mode catalog. |
| [OFFLINE_TROUBLESHOOTING.md](OFFLINE_TROUBLESHOOTING.md) | Errors operator might face + fixes | repo root | Quick-reference for failures from our session — bge-m3 tokenizer cache, RapidOCR, LiteLLM provider prefix, etc. |
| [OFFLINE_RUNBOOK.md](OFFLINE_RUNBOOK.md) | Operational runbook for daily use | repo root | Daily up/down + smoke test commands. |
| [docs/walkthrough.md](docs/walkthrough.md) | Full pipeline walkthrough | docs/ | Architecture explanation — how the 7 ingest nodes hang together. |
| [docs/structure.md](docs/structure.md) | Project layout + state fields | docs/ | Maps every directory + state field; needed when debugging. |
| [docs/phase3_walkthrough.md](docs/phase3_walkthrough.md) | Phase 3 generation overview | docs/ | Project-level overview of Phase 3 (read first by anyone new to gen). |
| [NewClasses.md](NewClasses.md) | Pydantic schema reference | repo root | Names + structure of every Pydantic class the templates resolve to. |
| [referencedocs/01_architecture_overview.md](referencedocs/01_architecture_overview.md) | High-level architecture | referencedocs/ | One-page map of every component. |
| [referencedocs/17_phase2_retrieval.md](referencedocs/17_phase2_retrieval.md) | Phase 2 retrieval design | referencedocs/ | Authoritative spec for the hybrid search + reranker pipeline. |
| [referencedocs/18_phase3_generation.md](referencedocs/18_phase3_generation.md) | Phase 3 authoritative scoping | referencedocs/ | The locked decisions D1–D10 + audit trail; needed when extending. |
| [referencedocs/19_phase3_arabic_renderer.md](referencedocs/19_phase3_arabic_renderer.md) | Arabic renderer port guide | referencedocs/ | **CRITICAL for Arabic input.** Documents the typography contract. |
| [referencedocs/20_phase3_templates_and_kinds.md](referencedocs/20_phase3_templates_and_kinds.md) | YAML template + 5-kind field taxonomy | referencedocs/ | Needed when authoring new templates. |
| [referencedocs/15_ocr_options.md](referencedocs/15_ocr_options.md) | OCR engine options | referencedocs/ | Reference when tuning Arabic OCR. |
| [referencedocs/16_inspection_and_debugging.md](referencedocs/16_inspection_and_debugging.md) | Inspection + debugging recipes | referencedocs/ | `peek_qdrant.py` etc. — useful when something looks wrong. |
| [docs/pdf_failure_fallback_plan.md](docs/pdf_failure_fallback_plan.md) | §C19 OCR retry design + forensics | docs/ | Relevant when an Arabic PDF won't parse cleanly. |
| [docs/customization_guide.md](docs/customization_guide.md) | How to extend the project | docs/ | Useful when adding new templates / Arabic doctrine corpora. |

**~16 MDs total. Combined size: ~360 KB.**

### Documentation that should NOT ship (dev / historical / superseded)

These are kept on the online box for Claude's continuing context but are
NOT useful for the offline operator and would be confusing noise:

| File | Why exclude |
|---|---|
| `CLAUDE.md` (154 KB) | Internal session changelog + locked decisions for Claude. The valuable parts are condensed into the operator-facing docs. |
| `AGENTS.md` (37 KB) | Mirror of CLAUDE.md for Codex agents — duplicate. |
| `docs/memory.md` (178 KB) | Master index of internal session work — not user-facing. |
| `docs/phase3_handoff_notes.md` | Chat handoff notes between sessions. |
| `docs/local_llm_migration.md` | Superseded by §C26 provider abstraction. |
| `docs/lm_studio_migration_plan.md` | Superseded — we're on LiteLLM+vLLM now. |
| `docs/offline_migration.md` | Superseded by `OFFLINE_RUNBOOK.md`. |
| `docs/gemma_drafter_followup.md` | Gemma-specific — not relevant for Qwen. |
| `docs/langgraphtopics.md` | Beginner LangGraph explainer — optional. |
| `docs/ubuntu_deploy_shadow.md` | Alternative deployment scenario. |
| `docs/transferOS.md` | OS-portability notes — kept for reference, not operational. |
| `tiered_retrieval_discussion.md` | Internal design discussion. |
| `tiered_retrieval_implementation.md` | Internal handoff. |
| `tiered_search_ui_plan.md` | Dev UI plan, not for production. |
| `litellm/README.md` | Not needed — offline server already has LiteLLM. |
| `NewOffline/README.md` | Old offline doc, superseded. |
| `OFFLINE_HANDOFF.md` | Older handoff, superseded by `OFFLINE_RUNBOOK.md`. |
| `referencedocs/02-14` (except 17) | Implementation references / alternatives — dev-time research. |
| `inputs/operationalfiles/smoketest_mdmp.md`, `scripts/_smoketest_doc.md` | Test fixtures, not docs. |

### One-liner to materialise the transfer-bound docs into a clean folder

When you're ready to build the transfer tarball, run this from the project
root to copy the curated MD set into `_transfer_docs/`, leaving the rest
behind:

```bash
TRANSFER_DOCS_LIST=(
  "litellmrun.md"
  "OFFLINE_TROUBLESHOOTING.md"
  "OFFLINE_RUNBOOK.md"
  "NewClasses.md"
  "docs/walkthrough.md"
  "docs/structure.md"
  "docs/phase3_walkthrough.md"
  "docs/pdf_failure_fallback_plan.md"
  "docs/customization_guide.md"
  "referencedocs/01_architecture_overview.md"
  "referencedocs/15_ocr_options.md"
  "referencedocs/16_inspection_and_debugging.md"
  "referencedocs/17_phase2_retrieval.md"
  "referencedocs/18_phase3_generation.md"
  "referencedocs/19_phase3_arabic_renderer.md"
  "referencedocs/20_phase3_templates_and_kinds.md"
)
mkdir -p _transfer_docs
for f in "${TRANSFER_DOCS_LIST[@]}"; do
  mkdir -p "_transfer_docs/$(dirname "$f")"
  cp "$f" "_transfer_docs/$f"
done
echo "Copied ${#TRANSFER_DOCS_LIST[@]} docs to _transfer_docs/"
du -sh _transfer_docs/
```

---

## Quick reference — the model channels

| Channel | Project env var | Project request | Hits LiteLLM | Hits vLLM |
|---|---|---|---|---|
| LLM | `LLM_BASE_URL` | `POST /v1/responses` | `/v1/responses` | `/v1/responses` |
| Embedder | `EMBED_BASE_URL` | `POST /embeddings` | `/v1/embeddings` | `/v1/embeddings` |
| Reranker | `RERANK_BASE_URL` | `POST /rerank` | `/v1/rerank` (Cohere shape) | `/v1/score` (translated by LiteLLM) |

All three base URLs end with `/v1` so the appended suffix lands on the
LiteLLM-exposed paths.

---

*Last updated: 2026-05-07 — Phase A planning complete. Awaiting user go-ahead to execute Phase A1.*
