# syntax=docker/dockerfile:1.6
# DecisionMakingSteps — fully offline-capable image for Ubuntu/Linux x86_64.
#
# Build context expects:
#   - requirements.txt
#   - main.py, graph/, scripts/, ui/, prompts/, templates/, data/, libs/
#   - scripts/warmup_models.py (downloads HF + FastEmbed + Docling + RapidOCR caches into image layers)
#
# After build, all model weights are baked into /app/.cache so the image
# runs with zero network access on the target machine.

FROM python:3.12-slim-bookworm AS runtime

# ── apt deps ──────────────────────────────────────────────────────────────
# tesseract-ocr-ara is the Arabic language pack (per customization_guide.md §5)
# libreoffice is required for legacy .doc/.ppt/.xls/.rtf via the LibreOffice
# normalization path (see referencedocs/17_phase2_retrieval.md §10.5)
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        build-essential \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-ara \
        tesseract-ocr-osd \
        libreoffice-core \
        libreoffice-writer \
        libreoffice-calc \
        libreoffice-impress \
        poppler-utils \
        ghostscript \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ── env: pin model cache locations inside /app so they live in image layers.
#         IMPORTANT: HF_HUB_OFFLINE / TRANSFORMERS_OFFLINE are intentionally
#         NOT set here — the warmup `RUN` below needs to download models.
#         They are set in the second ENV block after warmup completes.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/app/.cache/huggingface \
    HUGGINGFACE_HUB_CACHE=/app/.cache/huggingface/hub \
    TRANSFORMERS_CACHE=/app/.cache/huggingface \
    FASTEMBED_CACHE_PATH=/app/.cache/fastembed \
    DOCLING_CACHE_PATH=/app/.cache/docling \
    TIKTOKEN_CACHE_DIR=/app/.cache/tiktoken \
    OMP_NUM_THREADS=24 \
    MKL_NUM_THREADS=24

WORKDIR /app

# ── pip deps (layered before code copy so code edits don't bust the dep cache)
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && \
    python -m pip install -r /app/requirements.txt

# ── copy project source ──────────────────────────────────────────────────
COPY . /app

# ── pre-download models so the runtime container has zero network calls ──
# This populates HF + FastEmbed + Docling caches inside the image layer.
# See scripts/warmup_models.py for what gets fetched.
RUN python scripts/warmup_models.py

# ── runtime defaults ─────────────────────────────────────────────────────
# Offline-mode flags applied AFTER warmup so HF/transformers refuse any
# runtime network calls.  Streamlit telemetry pings (gather usage stats)
# are also disabled — they fail silently on airgap, but on a partial-
# network host they'd hit streamlit.io.
EXPOSE 8501
ENV STREAMLIT_SERVER_HEADLESS=true \
    STREAMLIT_SERVER_PORT=8501 \
    STREAMLIT_SERVER_ADDRESS=0.0.0.0 \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1

# Default command = ingest. Override via `docker compose run --rm app <cmd>`.
CMD ["python", "main.py"]
