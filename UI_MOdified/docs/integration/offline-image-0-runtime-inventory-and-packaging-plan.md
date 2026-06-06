# OFFLINE-IMAGE-0 — Runtime Inventory and Docker Image Packaging Plan

**Status:** Audit complete — no implementation yet  
**Date:** 2026-06-06  
**Scope:** Everything RMOOZ needs to run fully offline: Node app, WarGamingGEN, Python, LLM, Qdrant, tiles, LDAP, data volumes.

---

## Executive Summary

RMOOZ offline deployment has **three distinct layers** that must all be addressed:

| Layer | Offline-ready today? | Blocking issue |
|-------|---------------------|----------------|
| Node app + LDAP auth | **Yes** | Port still defaults to 8000 (change to 5006 via env) |
| Map tiles (MBTiles) | **Yes** | No .mbtiles files included; operator must supply |
| Google Fonts (app.html) | **No** | Hard-coded CDN links in `client/app.html` |
| WarGamingGEN (generation) | **Conditional** | Needs Python 3.11 + local LLM; disabled by default |
| LLM inference (Ollama) | **Conditional** | Runs on host or sidecar; not in Node image |
| SmartSearch / Qdrant | **Conditional** | Optional retrieval; Markdown fallback exists |

**Recommended phased approach:**
1. **OFFLINE-IMAGE-1** — Fix Google Fonts blocker; Dockerfile for Node app only; LDAP + tiles work; WarGamingGEN disabled.
2. **OFFLINE-IMAGE-2** — Add Ollama sidecar to docker-compose; enable WarGamingGEN when LLM is available.
3. **OFFLINE-IMAGE-3** — Optional SmartSearch / Qdrant sidecar for doctrine retrieval.

---

## §1 — Node App Dependency Inventory

### 1.1 Production dependencies (`package.json`)

| Package | Version | Native? | Offline notes |
|---------|---------|---------|---------------|
| `better-sqlite3` | ^12.10.0 | **Yes** — node-gyp C++ binding | Must compile inside Docker; requires `python3 make g++` in build layer |
| `ldapjs` | ^3.0.7 | No — pure JS | Installs cleanly; no compilation |
| `@anthropic-ai/sdk` | ^0.30.1 | No | Used by Claude AI features; needs internet or must be disabled |
| `express` | ^4.18.2 | No | Used only by tile-server.js; no compilation |

**Total packages (lockfileVersion 3):** ~72 direct + transitive packages.

### 1.2 Dev dependencies (excluded from production image)

`electron`, `electron-builder`, `jimp`, `png-to-ico`, `concurrently` — all excluded via `npm ci --omit=dev`.

### 1.3 Native build requirements for Docker

```dockerfile
RUN apt-get install -y --no-install-recommends python3 make g++
```

`better-sqlite3` triggers `node-gyp` during `npm ci`. No other package requires compilation.

### 1.4 npm offline strategy

**Option A — Standard `npm ci` at build time (recommended for image builds):**
- Internet required only at Docker build time (on the build machine).
- Once the image is built and saved as `.tar`, no npm traffic at runtime.
- `npm ci` reads `package-lock.json` exactly — deterministic, reproducible.

**Option B — Vendored npm cache (for fully air-gapped build machine):**
- Run `npm install` on an online machine → commit `node_modules/` or package cache.
- Not recommended; large and brittle.

**Option C — Pre-built base image:**
- Build an intermediate `rmooz-deps:latest` image with `node_modules/` already compiled.
- Ship that image to the offline machine instead of rebuilding.
- Best for sites with no Docker build capability.

**Recommendation: Option A** for standard deployments; Option C for true air-gap where the build machine cannot reach npm registry.

### 1.5 Environment variables (all process.env reads)

| Variable | Default | Purpose | Mutable offline? |
|----------|---------|---------|-----------------|
| `PORT` | `8000` | Web server port | Yes — set `5006` |
| `RMOOZ_ROOT_DIR` | parent of `server/` | Project root | Yes |
| `RMOOZ_CLIENT_DIR` | `<ROOT>/client` | Static client dir | Yes |
| `RMOOZ_DATA_DIR` | `<ROOT>/data` | SQLite + scenarios | Yes — mount as volume |
| `RMOOZ_UPLOADS_DIR` | `<ROOT>/uploads` | DOCX uploads | Yes — mount as volume |
| `RMOOZ_MAPS_DIR` | `<ROOT>/maps` | MBTiles files | Yes — mount as volume |
| `RMOOZ_APP_DB_FILE` | `<DATA>/app.db` | Auth + plans DB | Yes |
| `RMOOZ_UNITS_DB_FILE` | `<DATA>/units.db` | Units DB (legacy) | Yes |
| `RMOOZ_BOOTSTRAP_PASSWORD` | (generates file) | First-run admin password | Yes — set to suppress file |
| `RMOOZ_AUTH_BACKEND` | `local` | `ldap` or `local` | Yes |
| `LDAP_SERVER` | — | LDAP server IP/host | Yes — site-specific |
| `LDAP_PORT` | `389` | LDAP port | Yes |
| `LDAP_DOMAIN` | `sss.dir` | AD UPN suffix | Yes |
| `LDAP_TIMEOUT` | `5` | LDAP timeout seconds | Yes |
| `LDAP_USE_SSL` | `0` | LDAPS flag | Yes |
| `RMOOZ_ALLOW_SIM_RUN` | disabled | Enable WarGamingGEN | Yes |
| `RMOOZ_TESTINGAI_DIR` | `<user Desktop>/TestingAI` | TestingAI root | Yes — mount path |
| `RMOOZ_PYTHON` | `python` | Python executable | Yes — container path |
| `RMOOZ_SIM_MODEL` | `qwen2.5:3b` | Local LLM model name | Yes |
| `RMOOZ_WARGAMEGEN_DIR` | `<TESTINGAI>/WarGamingGEN` | WarGamingGEN root | Yes |
| `ANTHROPIC_API_KEY` | — | Claude AI (optional) | Disable if not needed |

---

## §2 — WarGamingGEN / TestingAI Dependency Inventory

### 2.1 Python version

- **Python 3.11.9** (CPython) — managed by `uv` v0.9.4
- Virtual environment: `TestingAI/.venv/` (already created, tied to `C:\Users\EngCoder\AppData\Local\Programs\Python\Python311`)
- **Docker requirement:** Build Python 3.11 into the image or mount the `.venv` directory

### 2.2 WarGamingGEN Python packages (`WarGamingGEN/requirements.txt`)

| Package | Version | Purpose | Offline notes |
|---------|---------|---------|---------------|
| `openai` | ==2.32.0 | LLM API client (cloud or local endpoint) | Offline when `LLM_BASE_URL` points to Ollama |
| `python-dotenv` | >=1.0.0 | .env loading | No network |
| `pydantic` | ==2.13.1 | Schema validation for LLM structured output | No network |
| `python-docx` | >=1.1.0 | OOB DOCX input parser | No network |
| `numpy` | >=1.26.0 | GIS / force-ratio math | Binary wheel; needs pip |
| `Pillow` | >=10.0.0 | Image processing / GIS | Binary wheel; needs pip |
| `scipy` | >=1.11.0 | Sea-mask morphology | Binary wheel; needs pip |
| `arabic-reshaper` | >=3.0 | Arabic text reshaping for output | No network |
| `python-bidi` | >=0.4.2 | BiDi algorithm for Arabic | No network |
| `qdrant-client` | ==1.17.1 | SmartSearch retrieval client (optional) | No network after install |

**No PyTorch / CUDA / transformers** in WarGamingGEN itself — those live in SmartSearch only.

**Binary wheels requiring compilation or pre-built wheels:**
- `numpy`, `Pillow`, `scipy` — available as pre-built wheels on PyPI for Python 3.11 Linux x86_64; no compilation needed if downloaded as wheels.

### 2.3 SmartSearch Python packages (`SmartSearch/requirements.txt`)

SmartSearch is a heavier dependency used **only** for the Qdrant retrieval path. WarGamingGEN has a **Markdown fallback** (`inputs/doctrine/*.md`) if SmartSearch is unavailable.

| Package | Version | Purpose | Online-only risk? |
|---------|---------|---------|------------------|
| `langgraph` | ==1.1.6 | Orchestration graph | No (once installed) |
| `langchain-openai` | ==1.1.14 | LangChain + OpenAI | API key needed for ingestion |
| `openai` | ==2.32.0 | LLM client | API key needed for ingestion |
| `docling` | ==2.89.0 | Document parsing | Downloads models at first use |
| `fastembed-gpu` | ==0.8.0 | Dense + sparse embeddings | Downloads ONNX models at first use |
| `onnxruntime-gpu` | ==1.25.1 | ONNX inference runtime | Binary wheel |
| `qdrant-client` | ==1.17.1 | Vector DB client | Needs Qdrant server |
| `transformers` | ==5.5.4 | HuggingFace tokenizer | Downloads `BAAI/bge-m3` at first use |
| `torch` | ==2.11.0 | Docling layout models | Large binary (~2 GB) |
| `torchvision` | ==0.26.0 | Docling vision models | Large binary |
| `streamlit` | ==1.56.0 | Dev/test UI | Dev only |
| `python-docx` | ==1.2.0 | Output DOCX generation | No network |
| `arabic_reshaper` | ==3.0.0 | Arabic text | No network |
| `Pillow` | ==12.2.0 | Image processing | Binary wheel |
| `PyYAML` | ==6.0.3 | Template parsing | No network |

**SmartSearch is NOT required for WarGamingGEN generation.** Doctrine retrieval falls back to local Markdown files when SmartSearch is unreachable.

### 2.4 Python packages offline strategy

**Option A — Vendor Python wheels (recommended for strict air-gap):**
```
Offline_Deployment/vendor/python-wheels/
  wargaminggen-wheels/   (numpy, Pillow, scipy, pydantic, openai, etc.)
  # pip install --no-index --find-links vendor/python-wheels/wargaminggen-wheels -r requirements.txt
```

**Option B — Copy the existing `.venv` into Docker image:**
- Copy `TestingAI/.venv/` into the image.
- Problem: The venv is built for Windows (`C:\Users\EngCoder\...`); it will not run in Linux Docker.
- **Not viable** for Linux-based Docker deployment.

**Option C — Mount `.venv` from host (Windows Docker Desktop):**
- Works only on Windows Docker Desktop with WSL2 integration.
- Not portable; binds the image to the host machine.

**Option D — Rebuild venv from vendor wheels inside Docker:**
```dockerfile
COPY vendor/python-wheels/wargaminggen-wheels /tmp/py-wheels
RUN pip install --no-index --find-links /tmp/py-wheels -r requirements.txt
```
**Recommendation: Option A + D** — vendor wheels on the build machine, install offline inside Docker.

### 2.5 WarGamingGEN entry point for RMOOZ bridge

**Script called:** `TestingAI/WarGamingGEN/tests/test_full_run.py`

```
node server/wargame-sim-bridge.js
  → spawn: cd <WGEN> && LLM_LOCAL_FORCE_FALLBACK=1 LLM_MODEL=<model> <python> tests/test_full_run.py --all
```

**Required directories (must exist at runtime):**
```
TestingAI/
  import_from_rmooz/forces/    ← staging DOCX input (writable volume)
  export_to_rmooz/             ← RMOOZ reads results from here (writable volume)
  WarGamingGEN/
    inputs/forces/             ← red_team.docx, blue_team.docx (can be symlinked or copied from import_from_rmooz)
    inputs/scenario.json       ← wargame parameters (read-only, in image)
    inputs/gis/                ← terrain/elevation layers (read-only or volume)
    runs/                      ← per-run output with checkpoints (writable volume)
    .env                       ← LLM config (read from container env or file)
```

---

## §3 — LLM / Offline AI Dependency Inventory

### 3.1 WarGamingGEN LLM configuration

WarGamingGEN uses the **OpenAI Python SDK** with a configurable `base_url`. This means it works with any OpenAI-compatible endpoint:

| Mode | `LLM_BASE_URL` | `LLM_MODEL` | Internet required? |
|------|---------------|------------|-------------------|
| OpenAI cloud | `` (empty) | `gpt-4o` | **Yes** |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:7b` | No (after model pull) |
| LM Studio (local) | `http://localhost:1234/v1` | `qwen2.5-32b` | No (after model load) |
| LiteLLM proxy | `http://litellm:4000/v1` | any | No (if configured) |

**RMOOZ bridge sets:**
```
LLM_LOCAL_FORCE_FALLBACK=1   (forces LLM_BASE_URL usage even if OPENAI_API_KEY is set)
LLM_MODEL=<RMOOZ_SIM_MODEL>  (default: qwen2.5:3b)
```

### 3.2 RMOOZ Node server LLM usage

RMOOZ itself calls the Claude API for adjudication (`server/ai/*.js`) via `ANTHROPIC_API_KEY`. This is **separate** from WarGamingGEN's LLM.

| Feature | API used | Offline fallback |
|---------|---------|-----------------|
| Scenario adjudication | Anthropic Claude | Ollama local model (if configured) |
| WarGamingGEN generation | OpenAI-compatible | Ollama / LM Studio local |

### 3.3 Ollama deployment options

**Option A — Ollama on Docker host (recommended for Phase 1):**
- Ollama runs as a Windows service or background process on the deployment machine.
- Container connects via `host.docker.internal:11434` (Docker Desktop) or host IP.
- Pro: simplest; Ollama already has a Windows installer.
- Con: Ollama not containerized; harder to version-lock.

**Option B — Ollama as Docker Compose sidecar (for Phase 2):**
```yaml
services:
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_models:/root/.ollama
    ports:
      - "11434:11434"
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]  # optional GPU passthrough
```
- Pro: fully contained; model persists in named volume.
- Con: GPU passthrough in Docker requires NVIDIA Container Toolkit.

**Option C — RMOOZ generation disabled (safe default for Phase 1):**
```dotenv
RMOOZ_ALLOW_SIM_RUN=0
```
- App boots fully, LDAP works, tiles work, manual scenario import works.
- WarGamingGEN "Start Generation" button shows "disabled" instead of running.
- Pro: simplest, no LLM dependency at all.

**Recommendation: Option C for OFFLINE-IMAGE-1, Option B for OFFLINE-IMAGE-2.**

### 3.4 Offline model preparation

When Ollama is used, the model must be pulled **before** transferring to the offline site:

```bash
# On internet-connected machine:
ollama pull qwen2.5:7b
# Saves model to ~/.ollama/models/

# Export Ollama model store:
tar -czf ollama-models-qwen2.5-7b.tar.gz ~/.ollama/models/manifests/ ~/.ollama/models/blobs/

# On offline machine:
# Extract to ~/.ollama/ (or Ollama volume path)
# docker volume create ollama_models
# (copy tar contents into volume)
```

Model sizes:
- `qwen2.5:3b` — ~2.0 GB (minimum quality)
- `qwen2.5:7b` — ~4.7 GB (recommended quality)
- `qwen2.5:32b` (GGUF via LM Studio) — ~19 GB (best quality, needs ~20 GB RAM)

---

## §4 — Qdrant / Vector Database

### 4.1 Usage scope

Qdrant is used **only** by SmartSearch (DecisionMakingSteps) for doctrine retrieval. WarGamingGEN accesses it via:
- **Local mode** (`SMART_SEARCH_MODE=local`): sys.path injection, no network socket.
- **HTTP mode** (`SMART_SEARCH_MODE=http`): POST to `SMART_SEARCH_HTTP_URL`.
- **Markdown fallback**: If both fail, reads `inputs/doctrine/*.md` locally.

### 4.2 Is Qdrant required for generation?

**No** — WarGamingGEN can generate a complete wargame output using only the Markdown doctrine fallback. Qdrant enhances retrieval quality but is not a hard dependency.

| Mode | Quality | Requirements |
|------|---------|-------------|
| Qdrant + SmartSearch | Best — semantic retrieval | Qdrant server + ONNX models |
| Markdown fallback | Good — keyword match | `inputs/doctrine/*.md` files only |
| No retrieval | Reduced | Agent relies on prompt alone |

### 4.3 Qdrant for offline deployment

If SmartSearch + Qdrant is needed:

```yaml
# Add to docker-compose.offline.yml
services:
  qdrant:
    image: qdrant/qdrant:v1.13.0  # pin version — do not use :latest for offline
    ports:
      - "6333:6333"
    volumes:
      - qdrant_storage:/qdrant/storage
```

**Ports:** 6333 (HTTP REST), 6334 (gRPC)

**Collection:** `ingest__doctrine__bgem3` (pre-populated before shipping)

**Recommendation:** Disable SmartSearch/Qdrant for OFFLINE-IMAGE-1. Use Markdown fallback. Add Qdrant in OFFLINE-IMAGE-3 when SmartSearch packaging is planned.

---

## §5 — Offline Tiles / Asset Inventory

### 5.1 Current tile architecture

```
maps/maps.json → { "mbtiles": [], "tileServer": "http://localhost:8080" }
tile-server.js → binds 127.0.0.1:8080, reads *.mbtiles from RMOOZ_MAPS_DIR
app.js → probes tileServer, loads L.tileLayer for each tileset
        → fallback: OpenStreetMap online (https://{s}.tile.openstreetmap.org/...)
```

### 5.2 Online risk

`app.js` lines 297–300 reference `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` as the default base map. In offline mode, this will fail silently (no tiles shown) but will not crash the app. The local tile layer `tiles/{z}/{x}/{y}.png` takes priority when `.mbtiles` files are present.

### 5.3 Tile server port in Docker

`tile-server.js` binds to `127.0.0.1:8080` — loopback only. For Docker, two options:
- **Option A:** Run tile-server.js inside the same container as web-server.js; tile requests stay internal.
- **Option B:** Change tile-server binding to `0.0.0.0` and expose port 8080 as a second port.

**Recommendation: Option A** — both servers in one container for simplicity. The `npm run app` script already runs both via `concurrently`.

### 5.4 Tile configuration for offline

No `OFFLINE_TILES` env var exists in the codebase — tile serving is controlled by `maps/maps.json` and the presence of `.mbtiles` files. The operator must:
1. Place `.mbtiles` files in the `maps/` volume.
2. Update `maps/maps.json` if needed (or leave the default pointing to localhost:8080).

### 5.5 Google Fonts — critical offline blocker

`client/app.html` lines 8–10 contain hard-coded links to Google Fonts CDN:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800
            &family=Roboto:wght@400;500;700
            &family=Alexandria:wght@400;700;800
            &family=Noto+Kufi+Arabic:wght@400;500;700&display=swap"
      rel="stylesheet">
```

**Impact:** The app will load and function offline but fonts will fall back to system defaults. The UI will still be usable but will not match the designed appearance (especially Arabic text with `Alexandria` + `Noto Kufi Arabic`).

**Fix for OFFLINE-IMAGE-1 (OFFLINE-FONTS-0):**
1. Download the font files as `.woff2` during build.
2. Place under `client/fonts/`.
3. Add a `client/fonts.css` with `@font-face` declarations.
4. Replace the Google Fonts `<link>` in `app.html` with `<link rel="stylesheet" href="fonts.css">`.

---

## §6 — Data Volume Classification

### A — Inside the Docker image (immutable at runtime)

```
/app/
  server/         ← Node.js server code
  client/         ← Static HTML/JS/CSS/assets
  lib/            ← Leaflet, milsymbol, Turf, MGRS (all vendored)
  vendor/         ← SIDC picker
  node_modules/   ← All npm dependencies (compiled)
```

If WarGamingGEN is bundled:
```
/app/TestingAI/WarGamingGEN/
  src/            ← Python source code
  inputs/scenario.json    ← Default scenario (operator can override via volume)
  inputs/gis/     ← Terrain/GIS layers (large; consider volume instead)
  inputs/forces/  ← Default OOB DOCX files (overridden by import_from_rmooz)
  .venv/          ← Python 3.11 environment (if bundled)
```

### B — Mounted as writable Docker volumes

```
/app/data/                        ← rmooz_data volume
  app.db                          ← SQLite: auth, plans, chat (persists across restarts)
  scenarios/                      ← Loaded scenario JSON files
  journal/                        ← Simulation journal (JSONL)
  imports/wargame_outputs/        ← Local import from WarGamingGEN
  users/<userId>/plans/           ← GeoJSON plan files
  BOOTSTRAP_PASSWORD.txt          ← First-run only; delete after reading

/app/maps/                        ← rmooz_maps volume
  *.mbtiles                       ← Offline map tiles (operator-supplied)
  maps.json                       ← Tile server config

/app/uploads/                     ← rmooz_uploads volume
  *.docx                          ← Uploaded scenario DOCX files

/app/TestingAI/import_from_rmooz/ ← testingai_import volume (if WarGamingGEN enabled)
  forces/
    red_team.docx                 ← Staged by RMOOZ, consumed by WarGamingGEN

/app/TestingAI/export_to_rmooz/   ← testingai_export volume
  <run-id>/                       ← Per-run output folders
  manifest.json                   ← Run catalog
  latest.json                     ← Pointer to most recent run

/app/TestingAI/WarGamingGEN/runs/ ← testingai_runs volume (if WarGamingGEN enabled)
  <YYYY-MM-DD_HH-MM-SS>/
    checkpoints/                  ← Phase-by-phase resumable state
    outputs/                      ← CSV, Markdown, GeoJSON
    llm_audit/                    ← LLM call transcripts
```

### C — Site-specific environment (`.env.offline`, never in image)

| Variable | Example value | Changes per site? |
|----------|--------------|------------------|
| `PORT` | `5006` | No (fixed for offline) |
| `RMOOZ_AUTH_BACKEND` | `ldap` | Rarely |
| `LDAP_SERVER` | `10.10.10.5` | **Yes — every site** |
| `LDAP_PORT` | `389` | Per site |
| `LDAP_DOMAIN` | `sss.dir` | **Yes — every site** |
| `LDAP_TIMEOUT` | `5` | Rarely |
| `LDAP_USE_SSL` | `0` | Per site |
| `SESSION_SECRET` | `<random hex>` | **Yes — each deployment** |
| `RMOOZ_ALLOW_SIM_RUN` | `0` or `1` | Per site capability |
| `RMOOZ_SIM_MODEL` | `qwen2.5:7b` | Per site (depends on RAM) |
| `RMOOZ_PYTHON` | `/app/.venv/bin/python` | Container-fixed |
| `RMOOZ_TESTINGAI_DIR` | `/app/TestingAI` | Container-fixed |
| `ANTHROPIC_API_KEY` | (blank for offline) | Blank unless cloud available |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | Per site |

---

## §7 — Online-Only Risks

| Risk | Location | Impact | Offline mitigation |
|------|---------|--------|-------------------|
| **Google Fonts CDN** | `client/app.html:8-10` | Fonts fall back to system; Arabic UI degraded | Bundle `.woff2` files locally (OFFLINE-FONTS-0) |
| **OpenStreetMap tile fallback** | `client/app.js:297` | No satellite base map without .mbtiles | Provide `.mbtiles`; warn in UI if offline tiles absent |
| **OpenAI API (Node adjudication)** | `server/ai/ai-provider.js` | AI adjudication fails | Set `RMOOZ_AI_PROVIDER=ollama`; or leave disabled |
| **OpenAI API (WarGamingGEN)** | `WarGamingGEN/src/llm/client.py` | Generation fails | Set `LLM_BASE_URL` to local Ollama endpoint |
| **Anthropic Claude SDK** | `server/ai/` | AI features fail | Leave `ANTHROPIC_API_KEY` blank; Ollama fallback |
| **npm install at runtime** | None found | — | Node image uses `npm ci` at build time; no runtime npm |
| **pip install at runtime** | None found in bridges | — | Python deps baked into image or vendor wheels |
| **HuggingFace model downloads** (SmartSearch only) | `SmartSearch/scripts/warmup_models.py` | SmartSearch unusable | Bake models into SmartSearch image at build time |
| **Qdrant vector store** (SmartSearch only) | `WarGamingGEN/src/retrieval/` | Retrieval quality reduced | Markdown fallback exists; SMART_SEARCH_MODE=local with pre-populated collection |
| **tile.openstreetmap.org** | `client/app.js:297` | Base map blank | `.mbtiles` + `maps.json` config; remove OSM fallback in OFFLINE-FONTS-0 |
| **SmartSearch HTTP endpoint** | `WarGamingGEN/src/retrieval/smart_search_client.py:159` | Retrieval timeout | `SMART_SEARCH_MODE=local` or Markdown fallback |
| **SMART_SEARCH_REPO_PATH** references `EngCoder` desktop | `WarGamingGEN/.env` | Path not valid in container | Override via env var in Docker |

---

## §8 — Recommended Docker Architecture

### OFFLINE-IMAGE-1 (Phase 1 — Node + LDAP + Tiles only)

**Architecture: Option C** — Single RMOOZ container, WarGamingGEN disabled.

```
┌──────────────────────────────────────────────────────────────────┐
│  Docker host (offline site)                                       │
│                                                                   │
│  ┌─────────────────────────────┐    ┌─────────────────────┐      │
│  │  rmooz-app container        │    │  Offline LDAP/AD     │      │
│  │  image: rmooz-offline:1.0   │    │  server (site-owned) │      │
│  │  port: 5006:5006            │    │  port: 389 or 636    │      │
│  │                             │    └─────────────────────┘      │
│  │  Volumes:                   │                                   │
│  │    /app/data       ←───────────── rmooz_data volume            │
│  │    /app/maps       ←───────────── rmooz_maps volume (.mbtiles) │
│  │    /app/uploads    ←───────────── rmooz_uploads volume         │
│  └─────────────────────────────┘                                   │
│                                                                   │
│  No internet dependency. RMOOZ_ALLOW_SIM_RUN=0.                  │
└──────────────────────────────────────────────────────────────────┘
```

**docker-compose.offline.yml (Phase 1):**
```yaml
services:
  rmooz:
    image: rmooz-offline:latest
    ports:
      - "5006:5006"
    environment:
      PORT: "5006"
      RMOOZ_AUTH_BACKEND: "ldap"
      LDAP_SERVER: "${LDAP_SERVER}"
      LDAP_PORT: "${LDAP_PORT:-389}"
      LDAP_DOMAIN: "${LDAP_DOMAIN}"
      LDAP_TIMEOUT: "${LDAP_TIMEOUT:-5}"
      LDAP_USE_SSL: "${LDAP_USE_SSL:-0}"
      RMOOZ_ALLOW_SIM_RUN: "0"
      SESSION_SECRET: "${SESSION_SECRET}"
    volumes:
      - rmooz_data:/app/data
      - rmooz_maps:/app/maps
      - rmooz_uploads:/app/uploads
    restart: unless-stopped

volumes:
  rmooz_data:
  rmooz_maps:
  rmooz_uploads:
```

### OFFLINE-IMAGE-2 (Phase 2 — Add Ollama + WarGamingGEN)

**Architecture: Option B** — Compose stack with Ollama sidecar.

```
┌────────────────────────────────────────────────────────────────────┐
│  Docker compose stack                                               │
│                                                                     │
│  ┌──────────────────┐   ┌──────────────────┐                       │
│  │  rmooz-app       │   │  ollama           │                       │
│  │  port: 5006      │──►│  port: 11434      │                       │
│  │  RMOOZ_ALLOW_    │   │  model: qwen2.5:7b│                       │
│  │  SIM_RUN=1       │   │  volume: models   │                       │
│  └──────────────────┘   └──────────────────┘                       │
│         │                                                           │
│         │  Volumes                                                  │
│    rmooz_data, rmooz_maps, rmooz_uploads                            │
│    testingai_import, testingai_export, testingai_runs               │
│                                                                     │
│  External: Offline LDAP server                                      │
└────────────────────────────────────────────────────────────────────┘
```

**Additional env vars for Phase 2:**
```dotenv
RMOOZ_ALLOW_SIM_RUN=1
RMOOZ_SIM_MODEL=qwen2.5:7b
RMOOZ_PYTHON=/app/TestingAI/.venv/bin/python
RMOOZ_TESTINGAI_DIR=/app/TestingAI
OLLAMA_HOST=http://ollama:11434
```

### OFFLINE-IMAGE-3 (Phase 3 — Optional SmartSearch + Qdrant)

Adds `qdrant` and `smartsearch` services when doctrine retrieval quality matters. Not required for basic generation.

---

## §9 — Proposed Offline_Deployment Folder Structure

The existing `Offline_Deployment/` folder needs the following additions (Phase 1 only):

```
Offline_Deployment/
  README.md                         ← Update: add offline-image warning
  .env.offline.example              ← Already exists; update for Phase 2 vars
  Dockerfile.offline                ← Already exists; revise for two-server startup
  docker-compose.offline.yml        ← Already exists; update for Phase 1 finalization

  scripts/
    test-ldap-connectivity.ps1      ← Exists
    test-ldap-connectivity.sh       ← Exists
    test-container-network.sh       ← Exists
    build-offline-image.ps1         ← New (OFFLINE-IMAGE-1)
    build-offline-image.sh          ← New (OFFLINE-IMAGE-1)
    save-image.ps1                  ← New (OFFLINE-IMAGE-1) — docker save to .tar
    load-image.ps1                  ← New (OFFLINE-IMAGE-1) — docker load on offline machine

  docs/
    offline-deployment-checklist.md ← Exists; update
    ldap-configuration-guide.md     ← Exists; up to date
    troubleshooting.md              ← Exists; update for image issues

  vendor/                           ← New (OFFLINE-IMAGE-1)
    npm-cache/                      ← Offline npm package cache (optional)
    python-wheels/                  ← Vendor Python wheels (OFFLINE-IMAGE-2)
      wargaminggen-wheels/
    fonts/                          ← Bundled .woff2 files (OFFLINE-FONTS-0)
    ollama-models/                  ← Exported Ollama model tar (OFFLINE-IMAGE-2)

  volumes/                          ← Placeholder directories with .gitkeep
    data/
    maps/
    uploads/
    testingai-import/               ← Phase 2 only
    testingai-export/               ← Phase 2 only
    testingai-runs/                 ← Phase 2 only
```

---

## §10 — Offline Build Process

### Phase 1 — Build machine (internet-connected)

```
1.  git clone / pull the repo
2.  cd UI_MOdified
3.  npm ci                                # downloads all Node deps (including ldapjs, better-sqlite3)
4.  # Download Google Fonts .woff2 files (OFFLINE-FONTS-0)
5.  docker build \
      -f Offline_Deployment/Dockerfile.offline \
      -t rmooz-offline:1.0 .             # compiles better-sqlite3 for Linux
6.  docker save rmooz-offline:1.0 | gzip > rmooz-offline-1.0.tar.gz
7.  Copy to offline machine:
      rmooz-offline-1.0.tar.gz
      Offline_Deployment/ (entire folder)
```

### Phase 1 — Offline machine

```
1.  docker load < rmooz-offline-1.0.tar.gz
2.  cd Offline_Deployment
3.  cp .env.offline.example .env.offline
4.  vim .env.offline                     # set LDAP_SERVER, LDAP_DOMAIN, SESSION_SECRET
5.  # Copy .mbtiles files into maps volume or Offline_Deployment/volumes/maps/
6.  docker compose -f docker-compose.offline.yml --env-file .env.offline up -d
7.  npm run test:ldap-bind               # verify LDAP (from UI_MOdified/ if Node is available)
8.  curl http://localhost:5006/api/auth/me  # expect 401
9.  Open browser → http://<server>:5006/   # test login
```

### Phase 2 build additions (when WarGamingGEN needed)

```
Build machine:
  4b. Create Python wheel vendor directory:
        pip download -r TestingAI/WarGamingGEN/requirements.txt \
          --dest Offline_Deployment/vendor/python-wheels/wargaminggen-wheels \
          --python-version 3.11 --platform manylinux2014_x86_64
  5b. Pull Ollama model:
        ollama pull qwen2.5:7b
        tar -czf Offline_Deployment/vendor/ollama-models/qwen2.5-7b.tar.gz ~/.ollama/models/

Offline machine:
  5c. Load Ollama model:
        # Extract tar to Ollama volume or ~/.ollama/
  6b. Use docker-compose-phase2.offline.yml (includes ollama service)
```

---

## §11 — Acceptance Tests for OFFLINE-IMAGE-1

These tests define "done" for the first deployable offline image:

| # | Test | Method |
|---|------|--------|
| 1 | App boots on port 5006 without internet | `curl http://localhost:5006/` → 200 |
| 2 | Login page loads with correct fonts | Browser visual check |
| 3 | No outbound network to `fonts.googleapis.com` | `docker run --network none rmooz-offline:latest` → static assets still load |
| 4 | `/api/auth/ldap-health` returns LDAP config | `curl http://localhost:5006/api/auth/ldap-health` |
| 5 | LDAP login works | Browser login with employee number + password |
| 6 | `/api/auth/me` returns `displayName`, `title`, `authBackend: "ldap"` | curl with session cookie |
| 7 | Offline tiles load from `.mbtiles` | Map pan/zoom with .mbtiles in volume |
| 8 | Scenario list loads | GET `/api/scenario/list` → 200 |
| 9 | No npm/pip downloads at container start | `docker logs` — no install commands in logs |
| 10 | Data persists across container restart | Create plan → restart container → plan still exists |
| 11 | `RMOOZ_ALLOW_SIM_RUN=0` — generation button disabled | UI shows disabled state |
| 12 | Logout clears LDAP session | POST `/api/auth/logout` → GET `/api/auth/me` → 401 |
| 13 | Container start time < 10s | `docker compose up -d && time curl -sf http://localhost:5006/` |
| 14 | Image size reasonable (< 800 MB) | `docker images rmooz-offline:latest` |

---

## §12 — Summary: What Each Operator Can Change Without Rebuilding

The following can be changed by the site operator in `.env.offline` and `docker compose restart` — **no image rebuild:**

- `LDAP_SERVER` — point to any LDAP server on the new site
- `LDAP_DOMAIN` — change the AD domain suffix
- `LDAP_PORT`, `LDAP_TIMEOUT`, `LDAP_USE_SSL`
- `SESSION_SECRET` — rotate session signing key
- `PORT` — change app port (though 5006 is the standard)
- `RMOOZ_ALLOW_SIM_RUN` — enable/disable WarGamingGEN without rebuilding
- `RMOOZ_SIM_MODEL` — change which LLM model WarGamingGEN uses
- `OLLAMA_HOST` — point to a different Ollama instance

The following require an **image rebuild:**

- Bundled font files (until OFFLINE-FONTS-0 is done)
- Any Node.js source code changes
- Any Python source code changes (WarGamingGEN)
- Node module version changes
- Python package version changes

The following require only **volume content changes** (no restart):

- `.mbtiles` tile files — the tile server reads them at startup only; need restart
- Scenario JSON files in `data/scenarios/`
- WarGamingGEN input DOCX files (`import_from_rmooz/forces/`)

---

## Deliverables Needed for OFFLINE-IMAGE-1

1. **OFFLINE-FONTS-0** — bundle Google Fonts locally (fix the main offline blocker)
2. **OFFLINE-IMAGE-1** — revise `Dockerfile.offline` for dual-server startup (web + tile), Phase 1 docker-compose, build/save/load scripts
3. **OFFLINE-FONTS-1** (optional) — add Arabic fonts for full RTL fidelity

*WarGamingGEN Python packaging is deferred to OFFLINE-IMAGE-2.*
