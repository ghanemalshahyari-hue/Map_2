# OFFLINE RUNBOOK — what to do on the i9 / Ubuntu VM

This is the ONE document you need to read on the offline machine. It walks
you from "USB just plugged in" to "generating Arabic .docx documents" with
no internet access required.

> **STATUS (2026-05-01):** bundle has been built, saved, and transferred.
> The three artefacts (`dms_app.tar` ~4.4 GB, `qdrant.tar` ~190 MB,
> `DecisionMakingSteps_TRANSFER.tar.gz` ~34 MB) live on the operator's
> external drive — they are no longer in this repo.  Image was verified
> with ethernet physically disconnected: 4/4 `.docx` generated against
> LM Studio (Qwen 2.5 32B Q4_K_M) + Infinity (bge-m3 + bge-reranker-v2-m3).
> Skip §A unless you need to rebuild.

---

## A. Build side (this dev box, internet required) — packaging the bundle

Run these on the machine with internet access (the dev box where this
repo lives) **before** transferring to the airgapped i9.  Skip to §0 if
you already have the three transfer files.

```bash
cd ~/Desktop/omar/DecisionMakingSteps_TRANSFER

# A.1 — build the application image (~10-20 min; downloads model weights via warmup)
docker compose build app

# A.2 — save both images to portable .tar files
docker save dms_app:latest        -o dms_app.tar       # ~9-11 GB
docker save qdrant/qdrant:latest  -o qdrant.tar        # ~190 MB

# A.3 — package the source tree (.dockerignore content + a few extras excluded)
tar czf DecisionMakingSteps_TRANSFER.tar.gz \
    --exclude='venv' \
    --exclude='output' \
    --exclude='output_docs' \
    --exclude='.env' \
    --exclude='.env.bak.*' \
    --exclude='*.tar' \
    --exclude='*.tar.gz' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    .

# A.4 — verify
ls -lah dms_app.tar qdrant.tar DecisionMakingSteps_TRANSFER.tar.gz
```

**Copy these three files to a USB / external drive.**  That's everything
the airgapped machine needs.  Do NOT include `.env` — it's deliberately
excluded so live secrets don't leak; the operator creates their own
`.env` on the airgapped box from `.env.example`.

---

## 0. What you should have on a USB / external drive

After running the build on the source machine, you transfer **3 files** to
the offline VM:

| file | size | content |
|---|---|---|
| `DecisionMakingSteps_TRANSFER.tar.gz` | ~3 MB | source code + Dockerfile + docker-compose.yml + docs |
| `dms_app.tar` | ~12 GB | the application Docker image with all models baked in |
| `qdrant.tar` | ~190 MB | the Qdrant database Docker image |

Total: **~12 GB on the USB.**

---

## 1. One-time setup (only first time on this VM)

### 1.1. Install Docker (the ONLY thing you need to install)

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in (so the docker group takes effect), then verify:

```bash
docker --version            # should print Docker version 2x.x.x
docker compose version      # should print Docker Compose version v2.x.x
docker run --rm hello-world # optional sanity — but needs internet, skip if offline
```

### 1.2. Untar the transfer bundle

```bash
mkdir -p ~/projects && cd ~/projects
tar -xzf /path/to/DecisionMakingSteps_TRANSFER.tar.gz
cd DecisionMakingSteps_TRANSFER
ls
# Expected: Dockerfile, docker-compose.yml, .env.example, main.py,
#           graph/, scripts/, prompts/, templates/, data/, docs/, …
```

### 1.3. Load the Docker images

```bash
docker load -i /path/to/dms_app.tar       # ~30-90 sec depending on disk speed
docker load -i /path/to/qdrant.tar        # ~5 sec

docker images
# Expected:
#   dms_app          latest    ...   12.4GB
#   qdrant/qdrant    latest    ...   196MB
```

### 1.4. Create your `.env` file

```bash
cp .env.example .env
nano .env       # or vi, or any editor
```

The offline machine talks to **three external services** over HTTP — LLM,
embedder, and reranker.  Each is a (URL + API key + model id) triple.
Fill in nine values; everything else has a sensible default.

```ini
# LLM (any OpenAI-compatible /v1/responses endpoint)
LLM_BASE_URL=https://your-llm-host.example.com/v1
LLM_API_KEY=REPLACE_ME_WITH_LLM_KEY
LLM_MODEL=gpt-4o            # whatever id your server lists

# Embedder (must be bge-m3-compatible — see EMBEDDER_TAG below if not)
EMBED_PROVIDER=http
EMBED_BASE_URL=http://your-embed-host.example.com:7997
EMBED_API_KEY=REPLACE_ME_WITH_EMBED_KEY
EMBED_MODEL=BAAI/bge-m3

# Reranker
RERANK_PROVIDER=http
RERANK_BASE_URL=http://your-rerank-host.example.com:7997
RERANK_API_KEY=REPLACE_ME_WITH_RERANK_KEY
RERANK_MODEL=BAAI/bge-reranker-v2-m3

# OpenAI SDK init placeholder — required to be non-empty (graph/config.py
# enforces this) but the actual auth header on the wire is LLM_API_KEY.
OPENAI_API_KEY=any-placeholder
```

If embedder + reranker live on the SAME server (typical for Infinity / TEI),
set both `*_BASE_URL` to the same host:port — the project appends
`/embeddings` and `/rerank` to whatever URL you give it.

If your LLM provider does NOT support OpenAI's `/v1/responses` endpoint,
also set:

```ini
LLM_USE_RESPONSES_API=0
```

(This is rare — most cloud LLMs and modern self-hosted servers support
`/v1/responses` now. Leave it as `1` unless you get a 404 from your
provider.)

> **SSL on internal HTTPS endpoints:** the docker image ships with
> `httpx.Client(verify=False)` baked into the LLM client (see
> `graph/shared/responses_client.py`). Self-signed / internal-CA HTTPS
> endpoints work without any cert mounting. If you'd prefer proper
> verification, follow `changesonS4.md` item 5 to mount your internal CA
> bundle and revert the `verify=False` line.

---

## 2. Day-to-day commands

### 2.1. Drop your Arabic source PDFs

```bash
cd ~/projects/DecisionMakingSteps_TRANSFER
cp /path/to/your/arabic_manuals/*.pdf inputs/operationalfiles/
```

`inputs/doctrine/` stays empty (the kill-switch is set in `.env`). If you
later want to add doctrine PDFs, drop them there and flip
`PHASE3_TIERED_RETRIEVAL=1` in `.env`.

### 2.2. Start Qdrant (the database)

```bash
docker compose up -d qdrant

# Verify Qdrant is alive (wait ~5 sec):
docker compose ps qdrant
# Expected: STATUS = Up
```

### 2.3. Run Phase 1 ingestion

```bash
docker compose run --rm app python main.py
```

**Realistic time on i9-14900K CPU:** 40–70 min for a 4-PDF Arabic corpus.
Most of the time is Docling layout analysis + Tesseract Arabic OCR. The
output stream will show:

```
Folder      : operationalfiles
  Slug      : operationalfiles
  Collection: ingest__operationalfiles__bgem3
  Documents : N
    - your_file_1.pdf  (... KB)
    ...
  Running pipeline…
  [check]   Total    : N
  [check]   Accepted : N
  [check]   Rejected : 0
  ...
  [result]  Status   : ok
  [result]  Chunks   : ~2000
```

### 2.4. Generate the four MDMP documents

You need three input prompt files (Warning Order draft + Intel Report +
optional extras). The bundle ships English example prompts at
`data/phase3_prompt_*.example.txt`. Author Arabic equivalents and place
them anywhere — or use the examples to test the pipeline first.

```bash
mkdir -p output_docs
docker compose run --rm app python scripts/generate_documents.py \
  --warning-order data/phase3_prompt_2.example.txt \
  --intel-report  data/phase3_prompt_3.example.txt \
  --source-file   other=data/phase3_prompt_1.example.txt \
  --docs time_analysis initial_planning_guidance staff_brief warning_order \
  --out output_docs/
```

**Realistic time:** 5–15 min total (cloud LLM round-trips). Output:

```
output_docs/
├── extracted_inputs.json          # what the LLM extracted from your prompts
├── run_sources.json                # provenance log
├── time_analysis.docx              # تحليل الوقت
├── time_analysis.fields.json       # all resolved field values
├── initial_planning_guidance.docx  # دليل التخطيط الأولي
├── initial_planning_guidance.fields.json
├── staff_brief.docx                # إيجاز هيئة الركن
├── staff_brief.fields.json
├── warning_order.docx              # الأمر الإنذاري
├── warning_order.fields.json
└── .group_cache/                    # incremental cache for Phase 3 reruns
```

Open the `.docx` files in LibreOffice Writer to verify.

### 2.5. Streamlit UI (optional)

If you want the interactive web UI:

```bash
docker compose up app
# Open http://localhost:8501 in a browser
# Three tabs: Phase 2 retrieval, Tiered retrieval dev, Phase 3 generation
# Press Ctrl+C in the terminal to stop
```

### 2.6. Stop everything

```bash
docker compose down       # stops containers; Qdrant data persists in volume
docker compose down -v    # ALSO wipes Qdrant data (only if you want a clean reset)
```

---

## 3. Common workflows

### 3.1. Replace or add PDFs

```bash
cp /path/to/new_manual.pdf inputs/operationalfiles/
docker compose run --rm app python main.py    # only the new/changed file is processed
```

The system caches per-stage by SHA256, so unchanged files cache-hit every
stage and only the new file goes through the full pipeline.

### 3.2. Generate fewer documents

```bash
docker compose run --rm app python scripts/generate_documents.py \
  --warning-order ... --intel-report ... \
  --docs time_analysis warning_order \         # only these two
  --out output_docs/
```

### 3.3. Switch to a different LLM provider

Edit `.env`, then re-run any of the commands above. The `.group_cache/`
detects the provider change automatically and re-drafts affected groups.

### 3.4. Tune retrieval quality (translate query_seeds to Arabic)

For best retrieval scores on Arabic content, translate `query_seeds:` in:

- `prompts/initial_planning_guidance/template.yaml`
- `prompts/staff_brief/template.yaml`

Each retrieved field has English seed phrases like:

```yaml
query_seeds:
  - "MDMP staff coordination"
  - "commander information requirements"
```

Replace with Arabic equivalents:

```yaml
query_seeds:
  - "تنسيق هيئة الركن في عملية صنع القرار العسكري"
  - "متطلبات معلومات القائد الحرجة"
```

Then re-run generation. Optional but recommended.

### 3.5. Enable doctrine fallback (when you ingest doctrine PDFs)

```bash
cp /path/to/doctrine/*.pdf inputs/doctrine/
# Edit .env: change PHASE3_TIERED_RETRIEVAL=0 to PHASE3_TIERED_RETRIEVAL=1
docker compose run --rm app python main.py
```

### 3.6. Swap the embedder model (e.g. to mxbai-embed-large-v1)

The pipeline supports any HTTP-served, OpenAI-compatible embedder.
The default is `BAAI/bge-m3`; swapping to e.g.
`mixedbread-ai/mxbai-embed-large-v1` is configuration-only.

**Important:** swapping the embedder REQUIRES a full re-ingest.
Different embedders produce different vector spaces — old and new
vectors are not comparable, even when their dimensionality matches.

**Option A — minimal edit (recommended).** Change `EMBED_MODEL` only.
The Qdrant collection suffix stays `bgem3` (a misnomer after the swap,
but functional):

```bash
sed -i 's/^EMBED_MODEL=.*/EMBED_MODEL=mxbai-embed-large-v1/' .env
# tell your embedder server to serve mxbai-embed-large-v1 — exact id
# must match what the server's /v1/models lists.

# Wipe Qdrant and re-ingest:
docker compose down -v
docker compose up -d qdrant
docker compose run --rm app python main.py
```

**Option B — clean rename** (also renames the Qdrant collection suffix
from `bgem3` to `mxbai`).  Add YAML edits:

```bash
sed -i 's/^EMBED_MODEL=.*/EMBED_MODEL=mxbai-embed-large-v1/' .env
sed -i 's/^EMBEDDER_TAG=.*/EMBEDDER_TAG=mxbai/' .env
sed -i 's/ingest__operationalfiles__bgem3/ingest__operationalfiles__mxbai/g' \
    prompts/staff_brief/template.yaml \
    prompts/initial_planning_guidance/template.yaml
sed -i 's/ingest__doctrine__bgem3/ingest__doctrine__mxbai/g' \
    prompts/initial_planning_guidance/template.yaml

docker compose down -v
docker compose up -d qdrant
docker compose run --rm app python main.py
```

**What you do NOT change:**
- `chunk_document.py` uses `BAAI/bge-m3` for token-counting only
  (`max_tokens=512` budget).  This is independent of the embedder.
  Leave it alone.
- The dimensionality default (1024) lives in
  `graph/nodes/upsert_to_qdrant.py` — bge-m3 and mxbai-embed-large-v1
  are both 1024-dim, so no edit needed.  If you swap to a model with
  a different dimension, the upsert call will fail loudly (Qdrant
  rejects mismatched-dim vectors), and you'd need to update that
  default.

---

## 4. Troubleshooting

| symptom | cause | fix |
|---|---|---|
| `docker: Got permission denied` | user not in docker group | `sudo usermod -aG docker $USER` then logout/login |
| `Cannot connect to the Docker daemon` | docker service not running | `sudo systemctl start docker` |
| `Error response from daemon: pull access denied` | trying to pull instead of using local image | `docker images` — confirm `dms_app:latest` and `qdrant/qdrant:latest` are listed |
| `ConnectionError: localhost:6333` from app | Qdrant not running | `docker compose up -d qdrant` ; wait 5 sec |
| Phase 1 gate rejects all Arabic PDFs | English-tuned topic gate | broaden `graph/prompts.py::SUFFICIENCY_CHECK_SYSTEM_PROMPT` per `docs/customization_guide.md` §3 |
| `LLM_API_KEY` errors | `.env` not loaded | confirm `.env` exists in the same directory as `docker-compose.yml` |
| Reasoning model produces empty drafts | hidden chain-of-thought exceeds token cap | bump `QUERY_EXPAND_HYDE_MAX_TOKENS=2048` in `.env` (see `docs/memory.md` Pre-deployment checklist) |
| Phase 3 hard-fails on missing collection | tiered retrieval enabled but doctrine collection empty | `PHASE3_TIERED_RETRIEVAL=0` in `.env`, OR ingest doctrine PDFs first |

### Verifying the LLM endpoint is reachable

```bash
docker compose run --rm app python -m graph.shared.responses_client probe
# Expected:
#   [text probe] text: 'READY'
#   [structured probe] value: {'status': 'ok', 'answer': 42}
```

### Verifying templates are valid (after any YAML edit)

```bash
docker compose run --rm app python -m graph.generation.template_loader
# Expected: 6/6 templates OK
```

### Inspecting Qdrant manually

```bash
curl -s http://localhost:6333/collections | python3 -m json.tool
curl -s http://localhost:6333/collections/ingest__operationalfiles__bgem3 | python3 -m json.tool
```

---

## 5. Performance expectations on this i9

| operation | time |
|---|---|
| Phase 1 ingestion (4 PDFs, ~30 MB) | 40–70 min (CPU bound on Docling layout + Tesseract OCR) |
| Phase 1 incremental (1 changed PDF) | 8–15 min (only the changed file re-runs) |
| Phase 2 retrieval (single query) | <1 sec |
| Phase 3 generation (4 docs, cloud LLM) | 5–15 min (mostly LLM round-trips) |
| Phase 3 incremental (one prompt edited) | 1–3 min (cache hits unchanged groups) |

The dominant one-time cost is Phase 1 ingestion. Phase 3 generation is
fast and incremental thanks to the `.group_cache/`.

---

## 6. What's already tuned for you

The `.env.example` ships with these defaults:

```ini
DOCLING_DEVICE=auto                    # Auto-detect: cuda > mps > cpu (works on any host)
OCR_LANGS=eng+ara                      # Tesseract Arabic + English
EMBEDDER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider   # CUDA first, CPU fallback
RERANKER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider   # CUDA first, CPU fallback
EMBED_PROVIDER=fastembed       # ⚠️ FLIP TO http for HTTP-served embedder (see §1.4)
RERANK_PROVIDER=fastembed      # ⚠️ FLIP TO http for HTTP-served reranker (see §1.4)
EMBED_BATCH_SIZE=128                   # bumped from default 32 for 24-core CPU
UPSERT_BATCH_SIZE=256                  # bumped from default 64
OMP_NUM_THREADS=24                     # use all P+E cores
MKL_NUM_THREADS=24
PHASE3_TIERED_RETRIEVAL=0              # kill-switch ON — no doctrine yet
LLM_USE_RESPONSES_API=1                # enable /v1/responses (flip to 0 if your provider lacks it)
```

**For an airgapped deployment that uses HTTP-served embedder + reranker
(the recommended path):** flip `EMBED_PROVIDER` and `RERANK_PROVIDER` to
`http` and fill in their `*_BASE_URL` / `*_API_KEY` / `*_MODEL` per §1.4.
The `fastembed` defaults are only useful if you want to run the embedder
+ reranker as in-process ONNX models (which the slim image does NOT
ship — bge-m3 dense and bge-reranker-v2-m3 weights were intentionally
removed from the warmup since the airgapped target serves them via API).

**GPU/CPU auto-detect (added 2026-04-30):** the bundle now ships
`fastembed-gpu` + `onnxruntime-gpu` + `torch+cu130` wheels which contain
**both** CUDA and CPU code paths. On a host with an NVIDIA GPU + CUDA
driver, both Docling and FastEmbed use CUDA; on a CPU-only host they
transparently fall back to CPU at session-create time. The same `.env`
works on either machine. To verify what was selected on this run, check
the `[device] …` startup banner printed by `main.py` and
`scripts/generate_documents.py`.

If you're certain the i9 / VM has **no** GPU and want to shave ~3 GB
off the USB / image, swap to CPU-only wheels:

```bash
pip uninstall -y fastembed-gpu onnxruntime-gpu torch torchvision
pip install fastembed==0.8.0 onnxruntime==1.25.1 torch torchvision
# Keep .env exactly the same — auto resolves to cpu.
```

You don't need to touch any of these unless your circumstances change.

---

## 6.5. Offline-readiness changes applied (2026-04-30)

Changes baked in to make the image fully airgap-ready (per `changesonS4.md`):

| change | where | why |
|---|---|---|
| `httpx.Client(verify=False)` for LLM | `graph/shared/responses_client.py` | Accepts self-signed / internal-CA HTTPS endpoints without cert mounting |
| `HF_HUB_OFFLINE=1` + `TRANSFORMERS_OFFLINE=1` + `HF_DATASETS_OFFLINE=1` at runtime | `Dockerfile` (second ENV block) | Stops HF libs from phoning home for revision checks |
| `TIKTOKEN_CACHE_DIR=/app/.cache/tiktoken` | `Dockerfile` | tiktoken encodings (`o200k_base`, `cl100k_base`) baked into image |
| `STREAMLIT_BROWSER_GATHER_USAGE_STATS=false` | `Dockerfile` | Disables Streamlit telemetry pings |
| Slim warmup — drops bge-m3 dense + reranker | `scripts/warmup_models.py` | Offline target uses HTTP-served embedder + reranker; saves ~3.4 GB |
| Docling + RapidOCR promoted to **critical** | `scripts/warmup_models.py` | Build fails loudly if modelscope.cn is unreachable, instead of silently producing an incomplete image |
| Volume-mount `./graph`, `./scripts`, `./ui`, `./main.py` | `docker-compose.yml` | `.py` edits on the host take effect inside the container without rebuild |
| `check_compatibility=False` on Qdrant clients (3 sites) | `graph/retrieval/registry.py`, `graph/nodes/check_documents.py`, `graph/nodes/upsert_to_qdrant.py` | Suppresses cosmetic version-probe warnings |
| `.dockerignore` excludes `.env`, `venv/`, `output/`, etc. | `.dockerignore` (new) | Prevents secret leakage and shrinks the build context |

**Rebuild required:** the SSL bypass, env vars, and warmup changes are
baked into image layers.  After applying, run `docker compose build app`
on a machine with internet access, then re-`docker save` and re-transfer.

The volume-mount and Qdrant cosmetic changes affect file content, so as
long as you transfer the updated source tree the running container picks
them up at next `docker compose run`.

## 7. Where to look for deeper docs

All inside `docs/` of the bundle:

- `customization_guide.md` — comprehensive playbook for adding files, changing topics, switching languages, adding new document types
- `memory.md` — locked decisions, pinned versions, full env surface, gotchas
- `walkthrough.md` — full pipeline explanation (Phase 1 + 2)
- `phase3_walkthrough.md` — document-generation pipeline
- `pdf_failure_fallback_plan.md` — explains the §C19 OCR-retry path for broken-CMap PDFs

Plus inside the bundle root:

- `TRANSFER_NOTES.md` — what was tuned in this transfer copy
- `README_TRANSFER.md` — original quick-start (this file is the longer version)
- `CLAUDE.md` / `AGENTS.md` — project conventions and history

---

## 8. Quick reference card

```bash
# Setup (one time)
docker load -i dms_app.tar && docker load -i qdrant.tar
cp .env.example .env && nano .env              # edit 4 lines

# Workflow
docker compose up -d qdrant                    # start DB
cp /path/to/arabic.pdf inputs/operationalfiles/
docker compose run --rm app python main.py    # ingest (40-70 min)
docker compose run --rm app python scripts/generate_documents.py \
  --warning-order data/phase3_prompt_2.example.txt \
  --intel-report  data/phase3_prompt_3.example.txt \
  --source-file   other=data/phase3_prompt_1.example.txt \
  --docs time_analysis initial_planning_guidance staff_brief warning_order \
  --out output_docs/                            # generate (5-15 min)

# UI
docker compose up app                           # open http://localhost:8501
```

That's it.
