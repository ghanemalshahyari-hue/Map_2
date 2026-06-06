# Offline Migration Runbook — Mac dev → Ubuntu 22.04 air-gapped single box

> **Scope:** everything that needs to change when this whole project leaves
> the internet.  Single-box Linux target.  Audience: you, walking
> through staging then offline.
>
> **Sister docs (read also, don't duplicate):**
> - [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md) — OS-level shadow table; **PRIMARY** for OS prereqs, paths, services, ports.
> - [`memory.md`](memory.md) — locked decisions, pinned versions, env surface, Pre-deployment checklist for reasoning-model token caps.
> - [`local_llm_migration.md`](local_llm_migration.md) — historical context (architecturally superseded but still useful for "why" questions).
>
> This doc is the **app-level migration runbook** that sits on top of those.

---

## 0. Stage map

```
┌─────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│  Mac dev box    │───▶│  Stage 1: STAGING    │───▶│  Stage 2: OFFLINE    │───▶│  Stage 3: AIR-GAP   │
│  (current)      │    │  Ubuntu 22.04        │    │  TEST                │    │  TARGET             │
│                 │    │  with internet       │    │  (same staging box   │    │  (truly disconnected)│
│  • LM Studio    │    │                      │    │   with internet      │    │                     │
│  • Qdrant       │    │  Replicate Mac flow  │    │   physically off)    │    │  Restore from       │
│  • venv         │    │  on Linux, prove     │    │                      │    │  staging tarball,   │
│  • inputs/      │    │  4-doc generation    │    │  Re-run same smoke,  │    │  verify zero        │
│                 │    │  works.              │    │  prove zero pulls.   │    │  outbound traffic.  │
└─────────────────┘    └──────────────────────┘    └──────────────────────┘    └─────────────────────┘
```

**Why three stages, not two:**

The hidden risk is that things which "just worked" on the Mac quietly hit the
internet on first launch (HuggingFace cache, Docker pull, pip wheel
install, transformers tokenizer).  Stage 2 (drop the internet on the same
box) catches every one of these *before* you're standing in front of the
air-gapped target with no fallback.  Don't skip stage 2.

---

## 1. Definitive inventory — what hits the internet today

Audit performed against the codebase as of 2026-04-28 (§C34 commit).
Every point below has been verified by `grep` over `graph/`, `ui/`,
`scripts/`, `requirements.txt`, and `.env.example`.

### 1.1 Network calls at runtime

| who calls out | where | what it fetches | offline strategy |
|---|---|---|---|
| FastEmbed `TextEmbedding(model_name="BAAI/bge-m3")` | [`graph/shared/embedders.py:364`](../graph/shared/embedders.py) | first launch only — pulls ONNX from `aapot/bge-m3-onnx` (~2.3 GB) → `~/.cache/fastembed/` | preload the cache dir (§3 below) |
| FastEmbed `SparseTextEmbedding(model_name="Qdrant/bm25")` | [`graph/shared/embedders.py:380`](../graph/shared/embedders.py) | first launch only — pulls Qdrant/bm25 ONNX (~MB) | same cache dir, same preload |
| FastEmbed `TextCrossEncoder(model_name="BAAI/bge-reranker-v2-m3")` | [`graph/retrieval/rerank.py`](../graph/retrieval/rerank.py) | first launch only — pulls reranker ONNX from `Xenova/bge-reranker-v2-m3` (~MB) | same cache dir, same preload |
| HF `AutoTokenizer.from_pretrained("BAAI/bge-m3")` | [`graph/nodes/chunk_document.py:185`](../graph/nodes/chunk_document.py) | first launch only — pulls tokenizer files (small) → `~/.cache/huggingface/hub/` | preload (§3) |
| Docling layout/TableFormer models | docling internals | first launch only — pulls a few models on first parse | preload (§3) |
| Qdrant Docker image | `docker run qdrant/qdrant:latest` | image pull (~80 MB) | `docker save` / `docker load` (§3) |
| LM Studio model downloads | LM Studio GUI / CLI | LLM weights (4-30 GB depending on model), embedder/reranker GGUF | use the model files you already have, copied via filesystem |
| `urllib.request.urlopen(...)` in `HttpDenseEmbedder` | [`graph/shared/embedders.py:295`](../graph/shared/embedders.py) | runtime calls to whatever `EMBED_BASE_URL` points at | already local — confirm `.env` points at LAN/loopback |
| `urllib.request.urlopen(...)` in `HttpReranker` | [`graph/retrieval/rerank.py:229`](../graph/retrieval/rerank.py) | runtime calls to whatever `RERANK_BASE_URL` points at | same |
| `openai.responses.create(...)` via `responses_client` | [`graph/shared/responses_client.py`](../graph/shared/responses_client.py) | runtime calls to `LLM_BASE_URL` | same |
| Qdrant client | `QdrantClient(host=...)` | runtime calls to `QDRANT_URL` | already local |

**Critical insight:** the project has only TWO classes of internet
exposure: (a) **first-launch model downloads** (one-time, cacheable);
(b) **runtime HTTP calls to provider endpoints** (which `.env` aims at —
already local for LM Studio at `localhost:1234`).  No mid-pipeline
internet calls; no telemetry; no auto-update checks.

### 1.2 Install-time network calls

| step | hits internet? | offline strategy |
|---|---|---|
| `apt install` system packages (tesseract, python3.12, docker.io, …) | yes | `apt-get download` then transfer .deb files |
| `pip install -r requirements.txt` | yes | `pip wheel` → `pip install --no-index --find-links=wheels/` |
| Source corpus (`inputs/operationalfiles/` + `inputs/doctrine/` PDFs) | n/a (filesystem) | `tar -czf` the inputs dir |
| `.env` | n/a | author manually for the new box |

### 1.3 Code that contains user-machine-specific paths (must change)

These are hardcoded `/Users/hextechkraken/...` paths.  Most are in
docstrings/comments and don't break runtime, but the ones in `scripts/`
need updating before the equivalent script runs on Linux.

| file | purpose of path | impact |
|---|---|---|
| [`graph/generation/time_math.py:4`](../graph/generation/time_math.py) | comment header — "ported from `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt`" | cosmetic only |
| [`graph/generation/renderers/arabic_docx.py:4`](../graph/generation/renderers/arabic_docx.py) | comment header — same provenance note | cosmetic only |
| [`scripts/smoke_y_schemas.py:52`](../scripts/smoke_y_schemas.py) | `Y_ROOT = Path("/Users/hextechkraken/Desktop/y")` — Y-schema reference files | **active** — script will fail if you run it.  Rewrite to `Path(__file__).parent.parent / "data" / "y_reference"` and copy the Y files there, OR override via env var. |

You're unlikely to run `smoke_y_schemas.py` on the prod box — it's a Mac-side
authoring smoke — but flag this before tarballing.

### 1.4 Things explicitly NOT internet-touched (safe to ignore)

- `libs/{docling-2.89.0, fastembed-0.8.0, qdrant_client-1.17.1, sources}/`
  — read-only reference copies of vendored libraries for "read instead of
  guessing" (per `memory.md`).  Not pip-installable.  Don't rely on them
  at runtime; they're docs.
- BM25 sparse — runs in-process, no network.  LOCKED in CLAUDE.md.
- Phase 1 ingestion stages 1-7 — all local file I/O.
- Phase 3 renderer — all local (python-docx, arabic_reshaper, Pillow are pure-python).

---

## 2. Pre-stage: collect everything from the Mac (or any online box)

Run this on the Mac while you have internet.  Output is one directory
(~10-30 GB depending on which LLM weights you ship) that you'll tarball
and copy to staging.

```bash
# 0. Pick a staging-bundle root anywhere off the project tree.
export BUNDLE=/Users/hextechkraken/Desktop/airgap_bundle
mkdir -p "$BUNDLE"/{wheels,deb,models,docker,inputs,project,env}

# 1. Python wheels — every dep + transitive, pinned to requirements.txt.
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate
pip wheel --wheel-dir "$BUNDLE/wheels" -r requirements.txt
# (You may need --platform manylinux2014_x86_64 --python-version 3.12
#  --only-binary=:all: if the Mac wheels are arch-incompatible with Linux.
#  Easier: just rerun `pip wheel` ON the staging box itself in stage 1.)

# 2. FastEmbed cache — bge-m3 ONNX (1024-dim dense), Qdrant/bm25 sparse,
#    bge-reranker-v2-m3 cross-encoder.  These already exist locally if
#    you've run `python main.py` once.
cp -R ~/.cache/fastembed "$BUNDLE/models/fastembed"

# 3. HuggingFace cache — bge-m3 tokenizer used by HybridChunker.
cp -R ~/.cache/huggingface "$BUNDLE/models/huggingface"

# 4. Docling cache — layout + TableFormer ONNX models cached on first parse.
#    Path varies by docling version; commonly under ~/.cache/docling/ or
#    ~/Library/Caches/docling on macOS.  Check both:
[ -d ~/.cache/docling ] && cp -R ~/.cache/docling "$BUNDLE/models/docling"
[ -d ~/Library/Caches/docling ] && cp -R ~/Library/Caches/docling "$BUNDLE/models/docling-mac"

# 5. Qdrant Docker image — saved as a portable tar.
docker save qdrant/qdrant:latest -o "$BUNDLE/docker/qdrant.tar"

# 6. LLM model files — whatever you'll run on the prod box.  Two paths:
#    (a) LM Studio — copy the entire ~/.lmstudio/models tree (heavy).
[ -d ~/.lmstudio/models ] && cp -R ~/.lmstudio/models "$BUNDLE/models/lmstudio"
#    (b) llama.cpp / Infinity / TEI — just copy the .gguf or model folder
#        you intend to use.

# 7. Source corpus — both ingest folders.
cp -R inputs/operationalfiles "$BUNDLE/inputs/operationalfiles"
cp -R inputs/doctrine          "$BUNDLE/inputs/doctrine"

# 8. Project tree — exclude venv, output, .git history (optional), runtime caches.
rsync -a --exclude=venv --exclude=output --exclude=__pycache__ \
      --exclude=.DS_Store --exclude='.group_cache' \
      --exclude=.stage_fingerprints.json \
      ./ "$BUNDLE/project/"

# 9. .env stripped — copy your current .env as a starting point, redact
#    any keys, edit hosts to match prod box.  See §4.4 for the offline
#    .env skeleton.
cp .env "$BUNDLE/env/dot_env_template_FROM_MAC"
# Edit this file BEFORE copying to staging.

# 10. Bundle it up.
cd "$(dirname "$BUNDLE")"
tar -czf airgap_bundle.tar.gz "$(basename "$BUNDLE")"
ls -lh airgap_bundle.tar.gz
```

Estimated bundle size: 5-30 GB depending on LLM weights you include.

**Before tarballing**, sanity-check the contents:
- `wheels/` should have ≥ 50 .whl files
- `models/fastembed/` should contain `models--aapot--bge-m3-onnx/` and `models--Xenova--bge-reranker-v2-m3/` subdirs
- `models/huggingface/hub/` should contain `models--BAAI--bge-m3` (tokenizer)
- `docker/qdrant.tar` should be ~80-150 MB
- `models/lmstudio/` (or wherever you keep LLM weights) should contain the full model dir for the model named in your `.env`'s `LLM_MODEL`

---

## 3. Stage 1 — install on staging (Ubuntu 22.04, internet still on)

**Goal:** prove the same code that produces 4/4 .docx on the Mac produces
the same outputs on Linux *while internet is still available* — so
first-launch downloads can fall back to public if needed.

> Cross-ref `docs/ubuntu_deploy_shadow.md` for OS-level decisions
> (filesystem layout, systemd vs nohup, paths).  This section assumes you
> follow that shadow.  Below is the sequence specific to this app.

### 3.1 OS prereqs, project tree, venv, Qdrant

**See [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md) §3 "Concrete Porting Checklist"** for the canonical apt-install / venv-create / Docker-pull / Qdrant-launch sequence — those steps are identical for online staging and don't need restating here.

The only **air-gap-specific addition** at this stage:

```bash
# Untar the bundle so models can be restored before first-run.
mkdir -p /tmp/airgap_bundle
tar -xzf /path/to/airgap_bundle.tar.gz -C /tmp
```

(Mac→Ubuntu component shadow rows — Python version, FastEmbed providers, Tesseract packages, `DOCLING_DEVICE`, model cache locations — all live in [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md) §2.  This doc only adds what the shadow doc doesn't already cover.)

### 3.2 LLM provider (LM Studio or alternative)

You have three real choices on Linux for an OpenAI-compatible LLM server:

| option | install | strengths | weaknesses |
|---|---|---|---|
| **LM Studio (Linux beta)** | AppImage | familiar UI, same `/v1/responses` shape as Mac | desktop-style, weird for a server |
| **Infinity** | `pip install infinity-emb` | headless, multi-model, supports both LLM and embedder/reranker via one server | LLM hosting requires separate runtime |
| **llama.cpp server** | build from source or `pip install llama-cpp-python[server]` | proven, headless, GPU-supported | OpenAI-compat layer is best-effort, may need flag tweaks |

For a single box that needs to serve LLM + embedder + reranker over HTTP,
**Infinity** is the cleanest fit per `docs/local_llm_migration.md` and
the §C26 worked example (B) in `.env.example`.

LM Studio works on Linux but it's GUI-first; for an air-gapped server
you'd usually pick a headless option.  If you're staying on LM Studio,
`.env` shape is unchanged (`LLM_BASE_URL=http://localhost:1234/v1`).

### 3.3 Models — restore caches from the bundle

Copy the cached model dirs from the bundle into the user's home cache:

```bash
mkdir -p ~/.cache/fastembed ~/.cache/huggingface ~/.cache/docling
cp -R /tmp/airgap_bundle/models/fastembed/.    ~/.cache/fastembed/
cp -R /tmp/airgap_bundle/models/huggingface/.  ~/.cache/huggingface/
[ -d /tmp/airgap_bundle/models/docling ] && \
    cp -R /tmp/airgap_bundle/models/docling/. ~/.cache/docling/
```

Set `HF_HOME` and `FASTEMBED_CACHE_PATH` if you want to override the
default cache locations:

```bash
# Add to ~/.bashrc or systemd unit env file:
export HF_HOME=$HOME/.cache/huggingface
export FASTEMBED_CACHE_PATH=$HOME/.cache/fastembed
```

Verify the embedder loads from cache, NOT the network:

```bash
source venv/bin/activate
python -m graph.shared.embedders probe "تحليل الموقف"
# expect a 1024-dim L2-normalised vector printed.
```

### 3.4 Source corpus

```bash
mkdir -p inputs
cp -R /tmp/airgap_bundle/inputs/operationalfiles inputs/
cp -R /tmp/airgap_bundle/inputs/doctrine          inputs/
```

### 3.5 `.env` for the staging box

See §4.4 below for the full skeleton.  At minimum:

```ini
# DOCLING_DEVICE — Ubuntu has no MPS; use cuda or cpu.
DOCLING_DEVICE=cuda      # or "cpu" if no GPU
QDRANT_URL=http://localhost:6333
LLM_BASE_URL=http://localhost:1234/v1   # or whatever provider you picked
LLM_API_KEY=lm-studio                   # placeholder, anything non-empty
LLM_MODEL=google/gemma-4-e4b            # exact ID your provider serves
LLM_USE_RESPONSES_API=1
EMBED_PROVIDER=fastembed
RERANK_PROVIDER=fastembed
OPENAI_API_KEY=lm-studio                # placeholder, must be non-empty
```

### 3.6 First-run smoke (online)

```bash
source venv/bin/activate
# Phase 1 ingestion — runs against the local PDFs:
python main.py
# Expect: 4/4 docs accepted for operationalfiles, 21/21 for doctrine,
# Qdrant collections populated.

# Tiered retrieval architecture smoke (offline, no Qdrant required):
python scripts/tiered_retrieval_smoke.py
# Expect: 45/45 PASS.

# End-to-end document generation:
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/staging_smoke
# Expect: 4/4 .docx + 4 *.fields.json under /tmp/staging_smoke/.
```

If all four pass, stage 1 is done.

---

## 4. Stage 2 — drop the internet, prove nothing breaks

Same staging machine, internet physically unplugged or firewalled.  This
is the most important stage — if anything fails here, fix it now before
you're at the air-gapped target with no fallback.

### 4.1 Block outbound network (pick one)

```bash
# Option A — physical: unplug the cable / disable wifi.
nmcli device disconnect <iface>

# Option B — firewall (recommended; reversible):
sudo ufw default deny outgoing
sudo ufw default deny incoming
sudo ufw allow out on lo                    # loopback for Qdrant / LLM
sudo ufw allow in on lo
sudo ufw enable

# Verify outbound is dead but loopback works:
curl -s --max-time 3 https://huggingface.co       # should hang/fail
curl -s http://localhost:6333/readyz              # should still say "all shards are ready"
```

### 4.2 Re-run the same smokes

```bash
source venv/bin/activate

python scripts/tiered_retrieval_smoke.py
# Expect: 45/45 PASS — purely offline by design.

python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/offline_smoke
# Expect: 4/4 .docx + 4 *.fields.json.

streamlit run ui/app.py
# Expect: tabs load, retrieval works against local Qdrant, no errors.
```

### 4.3 Common offline-failure signatures

If something breaks in stage 2, the failure usually looks like one of these:

| signature | meaning | fix |
|---|---|---|
| `urllib.error.URLError: <urlopen error [Errno -2] Name or service not known>` for `huggingface.co` | first-time tokenizer / model fetch | preload the cache (you missed step §3.5) |
| `huggingface_hub.utils._errors.LocalEntryNotFoundError` | HF asked for a file not in the offline cache | inspect the file requested, copy it from the Mac's `~/.cache/huggingface/` |
| `ConnectionError: ('Connection aborted.')` against `localhost:6333` | Qdrant container died | `docker ps` then `docker logs qdrant` |
| `ResponsesInvocationError: ... no final text after finalize` | LLM server responded but with empty text — could be reasoning-model token cap | see Pre-deployment checklist in `memory.md` |
| `urllib.error.URLError` against `localhost:1234` | LLM server isn't running / wrong port | start your LLM provider, verify `curl http://localhost:1234/v1/models` |

If a smoke fails for a reason NOT on this list, treat it as a real bug —
do not paper over it before stage 3.

### 4.4 Minimum offline-safe `.env` skeleton

```ini
# ── Qdrant ──────────────────────────────────────────────────────────────
QDRANT_URL=http://localhost:6333

# ── OpenAI placeholder (the openai SDK refuses empty key — value unused
#    when LLM_BASE_URL points at a local server) ──────────────────────────
OPENAI_API_KEY=lm-studio

# ── LLM ─────────────────────────────────────────────────────────────────
LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=lm-studio
LLM_MODEL=google/gemma-4-e4b
LLM_USE_RESPONSES_API=1

# Pre-deployment audit if Gemma 3/4, GPT-o1, DeepSeek-R1, or any
# reasoning model — bump this from 256 to 2048 IF turning HyDE on.
QUERY_EXPAND_HYDE=0
QUERY_EXPAND_HYDE_MAX_TOKENS=2048

# ── Dense embedder (FastEmbed in-process is the simplest air-gapped
#    choice — no second HTTP server needed) ───────────────────────────────
EMBED_PROVIDER=fastembed

# ── Reranker ────────────────────────────────────────────────────────────
RERANK_PROVIDER=fastembed
RERANK_MODEL=BAAI/bge-reranker-v2-m3

# ── Docling device ──────────────────────────────────────────────────────
# macOS=mps, Ubuntu=cuda or cpu.  Set DOCLING_DEVICE before main.py.
DOCLING_DEVICE=cuda

# ── OCR retry (Tesseract installed via apt) ─────────────────────────────
OCR_RETRY_ON_GARBAGE=1
OCR_LANGS=eng

# ── HF/FastEmbed caches — explicit so loadtime can't accidentally probe
#    a different path and trigger a download attempt ───────────────────────
HF_HOME=/home/<user>/.cache/huggingface
FASTEMBED_CACHE_PATH=/home/<user>/.cache/fastembed
```

(The full env surface — Phase 1 ingest knobs, Phase 2 retrieval knobs,
Phase 3 generation knobs — lives in [`.env.example`](../.env.example).
Copy that as the starting point and trim/edit; the file above is just the
**critical-for-air-gap subset**.)

---

## 5. Stage 3 — air-gapped target

The actual prod box.  Truly disconnected.  Repeat stages 1+2 from the
bundle, with these differences:

### 5.1 Install differences

```bash
# 1. Wheels — install offline from the bundle:
pip install --no-index --find-links=/path/to/bundle/wheels -r requirements.txt

# 2. apt packages — if the air-gap box doesn't have them already:
sudo dpkg -i /path/to/bundle/deb/*.deb

# 3. Qdrant — load from the saved tarball:
docker load -i /path/to/bundle/docker/qdrant.tar
docker run -d --name qdrant \
    -p 6333:6333 -p 6334:6334 \
    -v qdrant_storage:/qdrant/storage \
    qdrant/qdrant:latest

# 4. Caches — copy as in §3.5.
# 5. Source corpus + project tree + .env — copy as in §3.6/§3.7.
```

### 5.2 Verify zero outbound network

Before declaring deployment complete:

```bash
# 1. Confirm the kernel sees no default route OR firewall blocks egress.
ip route show
sudo ufw status                        # if using ufw
sudo iptables -L OUTPUT -n             # if not

# 2. Spot-check from inside Python — if any of these resolve, you're not
#    actually air-gapped.
python -c "import urllib.request; urllib.request.urlopen('https://huggingface.co', timeout=3)"
# expected: socket.gaierror / Name or service not known

python -c "import urllib.request; urllib.request.urlopen('https://pypi.org', timeout=3)"
# expected: same

python -c "import urllib.request; urllib.request.urlopen('https://docker.io', timeout=3)"
# expected: same
```

### 5.3 Re-run all the smokes one more time

Identical to stage 2 §4.2.  4/4 .docx must produce identical content
hashes (modulo timestamps in the renderer header, which include today's
date).  Spot-check by `diff`'ing one `.fields.json` between staging and
air-gap runs against the same inputs — they should be byte-identical.

---

## 6. Logging plan (production)

Today's logging is **sparse and adequate for dev**, but worth tightening
in production.

### 6.1 What the project already logs

| where | what | format |
|---|---|---|
| stderr | LLM call diagnostics on failures (`responses_client.py`) | one-line JSON |
| `output/<doc>/errors.jsonl` | per-doc ingestion failures | one-line JSON |
| `output/_folder_errors.jsonl` | folder-level ingestion failures | one-line JSON |
| `output/_eval/feedback.jsonl` | 👍 / 👎 click feedback from Streamlit UI | one-line JSON |
| `output/<doc>/.stage_fingerprints.json` | sha256 cache audit per upstream stage | flat dict |
| `output/generated/<run_id>/run_sources.json` | per-document-generation-run audit | one-line JSON |

All of those are **structured JSON**, grep-friendly.  Don't introduce a
parallel logging framework.

### 6.2 Recommended additions for prod

Just three things:

```bash
# 1. Make a logs dir.
mkdir -p /var/log/decisionmakingsteps
sudo chown $USER /var/log/decisionmakingsteps

# 2. Capture stdout+stderr of long-running commands to a file.
python main.py 2>&1 | tee -a /var/log/decisionmakingsteps/ingest.log

streamlit run ui/app.py \
    >> /var/log/decisionmakingsteps/streamlit.log 2>&1 &

python scripts/generate_documents.py ... \
    2>&1 | tee -a /var/log/decisionmakingsteps/generate.log

# 3. (Optional) systemd unit if you want auto-restart on Streamlit:
#    /etc/systemd/system/decisionmakingsteps-ui.service
#       [Service]
#       ExecStart=/opt/decisionmakingsteps/venv/bin/streamlit run ui/app.py
#       StandardOutput=append:/var/log/decisionmakingsteps/streamlit.log
#       StandardError=append:/var/log/decisionmakingsteps/streamlit.log
#       Restart=on-failure
```

That's it.  No log shipping (offline box has nowhere to ship to anyway),
no JSON re-formatting, no Sentry/etc.

### 6.3 What I'm deliberately not adding (yet) — and why you might want it later

| feature | why skipped | when to add | how |
|---|---|---|---|
| **Log rotation** | logs grow ~MB/day on idle, ~10s of MB/day under heavy use; an offline single-box won't fill its disk for months | when `df -h /var/log` says < 10% free | `apt install logrotate` + `/etc/logrotate.d/decisionmakingsteps` config |
| **Backups (Qdrant volume + inputs/ + output/)** | re-ingest is feasible (~30 min for 4 ops manuals + 21 doctrine PDFs); Qdrant snapshots restore in seconds | when re-ingest cost exceeds backup cost — typically once you have user feedback in `feedback.jsonl` you don't want to lose | `tar -czf qdrant_$(date +%F).tar.gz /var/lib/docker/volumes/qdrant_storage/` to a USB stick on a cron |
| **Backup of `.env`** | one file, trivial to recreate from this doc | now if you're paranoid (it's small) | put it on a different USB than the project tarball |

If/when you want any of these, they're 30-min additions each — not deep
re-architecture.

---

## 7. Pre-deployment audits (do these before stage 3)

### 7.1 Reasoning-model token caps

See [`memory.md`](memory.md) "Pre-deployment checklist — reasoning-model
token caps" (added §C34).  TL;DR:

```bash
grep -rn max_output_tokens --include="*.py" --include=".env*" .
```

If your prod LLM is a reasoning model (Gemma 3/4, GPT-o1, DeepSeek-R1):
- Drafter / critique / extractor — already uncapped, fine.
- HyDE (`QUERY_EXPAND_HYDE_MAX_TOKENS=256` in `.env`) — bump to **2048** IF you turn HyDE on.
- Dev-tab synth call — already 2048; doesn't run in prod.

### 7.2 Hardcoded user paths

Confirm none of the production critical-path code references
`/Users/hextechkraken/`:

```bash
grep -rn "/Users/hextechkraken" --include="*.py" graph/ ui/ scripts/
# Today: 4 hits, all in docstrings / comments / one Mac-side smoke.
# None on the Phase 1 ingest or Phase 3 generation critical path.
# Safe to ignore for prod, but rewrite scripts/smoke_y_schemas.py if
# you intend to run it on Linux.
```

### 7.3 `DOCLING_DEVICE`

Mac uses `mps`.  Linux options: `cuda` (if GPU) or `cpu` (always works).
Defaults wrong on first launch — set explicitly in `.env`:

```ini
DOCLING_DEVICE=cuda    # or cpu
```

### 7.4 LLM/embedder/reranker model files actually exist

Before launching the LLM provider, confirm the model dir exists and
the model ID in `.env` matches:

```bash
# LM Studio:
ls -la ~/.lmstudio/models/<vendor>/<model_id>/

# llama.cpp / Infinity / TEI:
ls -la /path/to/your/model/dir/
```

The exact `LLM_MODEL` env var must match what `/v1/models` returns from
the running server.

---

## 8. Online vs offline checklists (the actionable summary)

### 8.1 Online (stage 1) checklist

- [ ] Ubuntu 22.04 box has `python3.12`, `docker`, `tesseract-ocr-eng` (apt).
- [ ] `/opt/decisionmakingsteps` cloned/copied; `venv` created.
- [ ] `pip install -r requirements.txt` succeeds (PyPI online).
- [ ] `docker pull qdrant/qdrant:latest` succeeds; container starts; `/readyz` says ready.
- [ ] LLM provider running (LM Studio / Infinity / llama.cpp); `/v1/models` returns the model ID matching `.env`'s `LLM_MODEL`.
- [ ] `~/.cache/fastembed/` and `~/.cache/huggingface/` populated (either restored from bundle or downloaded by first run).
- [ ] `inputs/operationalfiles/` and `inputs/doctrine/` populated.
- [ ] `.env` filled (use `.env.example` as the template; trim/edit).
- [ ] `python main.py` ingests 4 + 21 docs cleanly.
- [ ] `python scripts/tiered_retrieval_smoke.py` → 45/45 PASS.
- [ ] `python scripts/generate_documents.py ...` → 4/4 .docx written.
- [ ] `streamlit run ui/app.py` shows three tabs, all functional.

### 8.2 Offline (stage 2 — same box, internet blocked) checklist

- [ ] `curl https://huggingface.co --max-time 3` fails (no DNS or no route).
- [ ] `curl http://localhost:6333/readyz` succeeds.
- [ ] `curl http://localhost:1234/v1/models` succeeds.
- [ ] `python -m graph.shared.embedders probe "test"` returns a 1024-dim vector — proves FastEmbed loaded from cache, not network.
- [ ] `python scripts/tiered_retrieval_smoke.py` → 45/45 PASS (offline by design).
- [ ] `python scripts/generate_documents.py ...` → 4/4 .docx — same outputs as stage 1.
- [ ] `streamlit run ui/app.py` — every tab works, including the new tiered-retrieval tab.
- [ ] No new outgoing connections in `ss -tunap` while pipelines run (other than loopback).

### 8.3 Air-gapped (stage 3 — new box, no internet ever) checklist

- [ ] Bundle copied via USB / SFTP from staging.
- [ ] `pip install --no-index --find-links=wheels/ -r requirements.txt` succeeds — **no PyPI hit**.
- [ ] `docker load -i docker/qdrant.tar` succeeds — **no Docker Hub hit**.
- [ ] `~/.cache/fastembed/` and `~/.cache/huggingface/` restored from bundle.
- [ ] `inputs/`, `.env`, project tree restored from bundle.
- [ ] LLM provider's model files restored from bundle.
- [ ] `python -c "import urllib.request; urllib.request.urlopen('https://huggingface.co', timeout=3)"` raises `gaierror` — proves DNS / route blocked.
- [ ] All four smokes pass identically to stage 2.
- [ ] `diff` on a `*.fields.json` between staging and air-gap runs (same inputs) → byte-identical.

---

## 9. Things to fix in code BEFORE the air-gap (optional)

These are low-priority cosmetic cleanups.  None block deployment.  Listed
so you have one place to find them later.

| file | issue | fix |
|---|---|---|
| `scripts/smoke_y_schemas.py` | `Y_ROOT = Path("/Users/hextechkraken/Desktop/y")` | parameterise via env or make a `data/y_reference/` and ship it; only matters if you run this script on Linux. |
| `graph/generation/time_math.py` and `renderers/arabic_docx.py` (docstrings) | reference `/Users/hextechkraken/Desktop/ToTransfer/...` | cosmetic — leave or rephrase as "ported from the user's prior generator". |
| `graph/generation/tiered_search.py` (orphan, untracked) | Unused module from a prior session's partial attempt at the dev UI; not imported by anything | delete or repurpose; not part of the §C34 implementation. |
| `data/eval/cross_ref_prefixes_unseen.txt` | Auto-appended by the existing Phase 2 retrieval tab whenever it discovers a new prefix in payload | already gitignored-ish (committed as runtime sink, gets noisy); fine to leave or wipe before tarballing. |

---

## 10. Cross-references

| topic | doc |
|---|---|
| Ubuntu 22.04 OS shadow (filesystem layout, services, ports) | [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md) |
| Locked decisions, pinned versions, env surface | [`memory.md`](memory.md) |
| Reasoning-model token-cap audit checklist | [`memory.md`](memory.md) → "Pre-deployment checklist — reasoning-model token caps" |
| Provider abstraction (LLM / embedder / reranker swappable via `.env`) | [`local_llm_migration.md`](local_llm_migration.md) (historical) + `CLAUDE.md` §C26 |
| Phase 1 ingest pipeline | [`walkthrough.md`](walkthrough.md), [`structure.md`](structure.md) |
| Phase 2 retrieval design | [`../referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md) |
| Phase 3 generation | [`phase3_walkthrough.md`](phase3_walkthrough.md) |
| Tiered retrieval (architecture + live) | `CLAUDE.md` §C28 → §C33 |
| Tiered retrieval dev UI (this session) | `CLAUDE.md` §C34, [`../tiered_search_ui_plan.md`](../tiered_search_ui_plan.md) |

---

**Last updated:** 2026-04-28 (§C34 session).  Re-audit `grep -rn
max_output_tokens` and `grep -rn /Users/hextechkraken` whenever the model
or filesystem layout changes.
