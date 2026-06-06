# 2. Setup — Python, Qdrant, Embedder, LLM, .env

Follow these in order. Each block ends with a verification command — don't proceed until it passes.

## 2.1 System prerequisites (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y \
  python3.12 python3.12-venv python3-pip \
  build-essential cmake \
  git curl wget \
  docker.io docker-compose-plugin \
  libxml2-dev libxslt-dev          # needed by python-docx etc.

# Add yourself to the docker group so you don't need sudo every time:
sudo usermod -aG docker $USER
newgrp docker      # apply immediately without logout

# Verify
python3.12 --version          # should print 3.12.x
docker version                # should print client + server versions
```

If `python3.12` isn't in apt for your distro (e.g. older Ubuntu): use `python3.11` or install via the deadsnakes PPA. The code works on 3.10+.

## 2.2 Python virtual environment

```bash
cd ~/wargame/DecisionMakingSteps_TRANSFER

python3.12 -m venv venv_linux
source venv_linux/bin/activate

pip install --upgrade pip wheel setuptools
pip install -r requirements.txt
```

This takes 5-10 min the first time. The `requirements.txt` includes Qdrant client, LangGraph, pydantic, openai, and a handful of ML libs.

**Verify**:
```bash
python -c "import qdrant_client, langgraph, openai, pydantic; print('imports OK')"
```

Both projects share this venv (WarGameGenerator imports from DecisionMakingSteps_TRANSFER via sys.path).

## 2.3 Qdrant via Docker

```bash
cd ~/wargame/DecisionMakingSteps_TRANSFER
docker compose up -d            # starts Qdrant on port 6333

# Verify
docker ps                       # should show qdrant container running
curl http://localhost:6333/collections    # should return JSON (empty collections list is fine)
```

If `docker compose` says "no such command", you have the older v1 — use `docker-compose up -d` instead.

If port 6333 is taken, edit `docker-compose.yml` to change the host port mapping (the container side stays 6333).

## 2.4 Embedder — pick ONE

The smart-search system expects an OpenAI-compatible `/v1/embeddings` endpoint serving the **bge-m3** model. Three Linux-friendly options. **Recommended: Ollama** (simplest, headless-friendly).

### Option A — Ollama (recommended for headless servers)

```bash
# Install
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama        # start as a service

# Pull bge-m3 (you'll need internet for this one-time download — ~1.2 GB)
ollama pull bge-m3

# Verify it's serving on port 11434
curl http://localhost:11434/api/tags      # should list bge-m3

# Verify OpenAI-compatible endpoint
curl -X POST http://localhost:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "bge-m3", "input": "test"}' | head -50
```

You should see a JSON response with a 1024-dim vector. Note the port: **11434** (Ollama default), not 1234 (LM Studio).

### Option B — LM Studio Linux (matches the Mac workflow)

LM Studio has a Linux build, but it's GUI-only on first run. Reasonable if you have a desktop session:

1. Download from https://lmstudio.ai/snapshots (pick the Linux .AppImage)
2. `chmod +x LM-Studio-*.AppImage && ./LM-Studio-*.AppImage`
3. In the GUI: Discover → search **bge-m3** → download the **GGUF Q4_K_M** variant
4. Local Server tab → load bge-m3 → start the server (default port 1234)

This is heavier than Ollama but matches the Mac config exactly (port 1234, same model name).

### Option C — Hugging Face Text Embeddings Inference (TEI)

Fastest and most production-grade but heavier setup:

```bash
docker run -d --name tei \
  -p 8080:80 \
  -v ~/wargame/tei-data:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-m3

# Verify
curl -X POST http://localhost:8080/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "bge-m3", "input": "test"}'
```

For GPU acceleration replace `cpu-latest` with `1.5` or similar (CUDA tag). Check Docker Hub for current tags.

### Whichever you picked — note the port

You'll plug this into `.env` next:
- Ollama → `http://localhost:11434/v1`
- LM Studio → `http://localhost:1234/v1`
- TEI → `http://localhost:8080/v1`

## 2.5 LLM endpoint — pick ONE

### Option A — OpenAI cloud (matches the Mac default; ~$2.40 per full 17-phase run)

You need an OpenAI API key. If you copied `apik.rtf` from Mac, extract the key:

```bash
cat ~/wargame/apik.rtf
# Look for the line starting with sk-proj-... and copy that string
```

### Option B — Local LLM via Ollama (free, slower)

```bash
# Pull a model — Qwen 2.5 32B is the recommended local model for our use case
# Be patient: this is ~20 GB
ollama pull qwen2.5:32b-instruct-q4_K_M

# Verify
curl -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen2.5:32b-instruct-q4_K_M", "messages": [{"role":"user","content":"reply with one word"}]}'
```

Qwen 2.5 32B at Q4_K_M needs ~20 GB free disk and 20-24 GB RAM. If your Linux box has less, use `qwen2.5:14b-instruct` instead (smaller, ~9 GB).

### Option C — Local LLM via LM Studio Linux

Same as Option B for the embedder section but load a chat model (Qwen 32B or similar). Endpoint: `http://localhost:1234/v1`.

## 2.6 Configure `.env`

The `.env` files live in **two places** — both must exist and agree:

### `~/wargame/DecisionMakingSteps_TRANSFER/.env`

DMS reads this for its internal embedder/Qdrant config. Edit:

```dotenv
# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=ingest__doctrine__bgem3

# Embedder — adapt port to your pick (Ollama=11434, LM Studio=1234, TEI=8080)
EMBED_BASE_URL=http://localhost:11434/v1
EMBED_MODEL=bge-m3
EMBED_API_KEY=ollama         # placeholder; Ollama doesn't require a real key but the SDK needs something non-empty
EMBED_DIM=1024

# Reranker — leave HTTP-based unless you have one running; we degrade to RRF-only otherwise
RERANK_BASE_URL=
RERANK_MODEL=
RERANK_API_KEY=

# LLM (used by DMS internal calls, not the wargame agents)
LLM_BASE_URL=                # empty = OpenAI cloud, OR set http://localhost:11434/v1 for local
LLM_MODEL=gpt-4o             # or qwen2.5:32b-instruct-q4_K_M etc.
LLM_API_KEY=sk-proj-...      # OpenAI key, or "ollama" placeholder for local
LLM_USE_RESPONSES_API=1      # 1 for OpenAI; 0 for local (chat/completions endpoint)
```

### `~/wargame/WarGameGenerator/.env`

WGG reads this for its own LLM config + smart-search wiring. Edit:

```dotenv
# Smart-search wiring — local Python import of DMS
SMART_SEARCH_MODE=local
SMART_SEARCH_REPO_PATH=/home/<YOUR_USER>/wargame/DecisionMakingSteps_TRANSFER
SMART_SEARCH_COLLECTION=ingest__doctrine__bgem3

# LLM for the wargame agents — matches the DMS .env or independent
LLM_BASE_URL=                # empty = OpenAI cloud
LLM_MODEL=gpt-4o             # or local model name
LLM_API_KEY=sk-proj-...
LLM_USE_RESPONSES_API=1      # 1 for OpenAI; 0 for local

# Doctrinal knobs (defaults match FM 3-90)
ATTACK_RATIO_DECISIVE=3.0
ATTACK_RATIO_CONTESTED=1.5
PREPARED_DEFENSE_MULT=1.5
```

Replace `<YOUR_USER>` with your actual Linux username (`whoami` to check).

If `.env` doesn't exist on either side, copy `.env.example` from the same dir and edit.

**Verify**:
```bash
source ~/wargame/DecisionMakingSteps_TRANSFER/venv_linux/bin/activate

cd ~/wargame/WarGameGenerator
python -c "from src.config import load_llm_config, load_smart_search_config; \
           c=load_llm_config(); s=load_smart_search_config(); \
           print(f'LLM: {c.model} @ {c.base_url or \"OpenAI\"}'); \
           print(f'Smart-search: {s.mode}, collection={s.collection}')"
```

Should print non-empty values without errors.

## 2.7 Final pre-flight check

```bash
cd ~/wargame/WarGameGenerator
source ../DecisionMakingSteps_TRANSFER/venv_linux/bin/activate

# Parse smoke test
python -m src.parsers.scenario_parser    # should print "Loaded scenario: Gulf of Sidra..."
python -m src.parsers.docx_parser         # may need module-level smoke, skip if errors
python -m src.parsers.gis_loader          # tests GIS loading
```

If all three print sensible output, proceed to `3_RUN.md`.

If you see import errors like "ModuleNotFoundError: graph.retrieval", check that:
- `SMART_SEARCH_REPO_PATH` in `.env` points to the actual DMS path
- The DMS venv has `langgraph` installed (`pip list | grep langgraph`)
