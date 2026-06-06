"""
graph/config.py — Centralised, env-driven settings loader.

Every node imports from here instead of calling os.getenv() directly.
This keeps all knob locations in one place and makes unit-testing easy
(swap get_config() for a fixture).

Rules:
- load_dotenv() must be called in main.py BEFORE any graph import.
  This module reads os.environ; it does not call load_dotenv() itself.
- No hardcoded hosts, ports, paths, device flags, or EP names here or
  in any node.  Change a value by editing .env — this file auto-picks
  it up on the next process start.
- get_config() is a lazy singleton: the Config object is built once per
  process (first call) and cached.  Subsequent calls return the same
  object at zero cost.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

_config: "Config | None" = None


@dataclass(frozen=True)
class Config:
    # ------------------------------------------------------------------ #
    # LLM (only cloud dependency)                                         #
    # ------------------------------------------------------------------ #
    openai_api_key: str

    # ------------------------------------------------------------------ #
    # Qdrant                                                              #
    # ------------------------------------------------------------------ #
    qdrant_url: str
    qdrant_api_key: str             # empty string for local dev

    # ------------------------------------------------------------------ #
    # Docling parser acceleration                                         #
    # ------------------------------------------------------------------ #
    docling_device: str             # "mps" | "cuda" | "cpu" | "auto"
                                    # convert_document maps this to AcceleratorDevice

    # ------------------------------------------------------------------ #
    # Memory hardening — batch sizes (locked memory.md)                  #
    # ------------------------------------------------------------------ #
    embed_batch_size: int           # chunks per dense embedder .embed() call
    upsert_batch_size: int          # PointStructs per client.upsert() call

    # ------------------------------------------------------------------ #
    # Output root.  Per-doc layout: output/<doc_stem>/<stage>.<ext>       #
    # (see .env comments + doc_output_dir() helper below).                #
    # ------------------------------------------------------------------ #
    output_dir: str

    # ------------------------------------------------------------------ #
    # Collection naming                                                   #
    # ------------------------------------------------------------------ #
    collection_prefix: str          # "ingest"
    embedder_tag: str               # "bgem3"
    registry_collection: str        # "_registry"

    # ------------------------------------------------------------------ #
    # Upstream cache gate — see graph/fingerprints.py                     #
    # ------------------------------------------------------------------ #
    # When True, every upstream stage bypasses the sha256 cache gate and
    # does the full work.  Set FORCE_REPARSE=1 in .env to force-rebuild
    # every artefact (useful when tuning a parser / chunker / embedder).
    force_reparse: bool

    # ------------------------------------------------------------------ #
    # OCR-retry on garbled text-layer rejects (plan B)                    #
    # ------------------------------------------------------------------ #
    # When the per-doc LLM gate rejects a doc with a "garbled / corrupt /
    # unreadable" remark, the pipeline retries the first-10-pages probe
    # with force_full_page_ocr=True so the LLM can re-score on OCR'd
    # content.  Covers the broken-ToUnicode-CMap failure class.  See
    # docs/pdf_failure_fallback_plan.md for the full design.
    ocr_retry_on_garbage: bool      # 1/true/yes/on = enabled.  Default: on.
    ocr_retry_max_per_folder: int   # max OCR-retry attempts per folder.
    ocr_langs: str                  # Tesseract lang(s), e.g. "eng" or "eng+ara".

    # ------------------------------------------------------------------ #
    # Phase 1 gate prompt-budget cap (§C27, 2026-04-24)                   #
    # ------------------------------------------------------------------ #
    # Maximum preview characters sent to the per-doc LLM gate.  Guards
    # against short-context local models (e.g. LM Studio's default
    # ``n_ctx=4096``) silently truncating the prompt and returning a
    # reject for a doc that was actually readable.  When truncation
    # fires, ``check_documents`` logs one stderr line with the filename
    # and original length so the operator can raise the cap (or the
    # server's ``n_ctx``) if doctrine manuals are being clipped.
    phase1_preview_max_chars: int


def get_config() -> Config:
    """Return the process-level Config singleton (built on first call)."""
    global _config
    if _config is None:
        _config = _build_config()
    return _config


def _build_config() -> Config:
    def _require(key: str) -> str:
        value = os.environ.get(key, "").strip()
        if not value:
            raise RuntimeError(
                f"Required env var '{key}' is missing or empty. "
                "Make sure .env is loaded (load_dotenv() in main.py) and the "
                "key exists in .env (commented template lives inline)."
            )
        return value

    def _get(key: str, default: str) -> str:
        return os.environ.get(key, default).strip()

    # FORCE_REPARSE accepts "1"/"true"/"yes" (case-insensitive) as truthy;
    # anything else (including empty / missing) leaves the cache gate active.
    force_reparse_raw = _get("FORCE_REPARSE", "0").lower()
    force_reparse = force_reparse_raw in {"1", "true", "yes", "on"}

    # OCR retry knobs — default on; per-folder budget; eng-only by default.
    ocr_retry_raw = _get("OCR_RETRY_ON_GARBAGE", "1").lower()
    ocr_retry_on_garbage = ocr_retry_raw in {"1", "true", "yes", "on"}
    ocr_retry_max_per_folder = int(_get("OCR_RETRY_MAX_PER_FOLDER", "5"))
    ocr_langs = _get("OCR_LANGS", "eng")

    # Phase 1 preview cap — default 6000 chars comfortably fits a 4k-ctx
    # model alongside the ~2.5k-char system prompt.  Raise when using a
    # longer-context local model and doctrine manuals actually need the
    # extra headroom (most MDMP manuals fit easily).
    phase1_preview_max_chars = int(_get("PHASE1_PREVIEW_MAX_CHARS", "6000"))

    return Config(
        openai_api_key=_require("OPENAI_API_KEY"),
        qdrant_url=_get("QDRANT_URL", "http://localhost:6333"),
        qdrant_api_key=_get("QDRANT_API_KEY", ""),
        docling_device=_get("DOCLING_DEVICE", "mps"),
        embed_batch_size=int(_get("EMBED_BATCH_SIZE", "32")),
        upsert_batch_size=int(_get("UPSERT_BATCH_SIZE", "64")),
        output_dir=_get("OUTPUT_DIR", "output"),
        collection_prefix=_get("COLLECTION_PREFIX", "ingest"),
        embedder_tag=_get("EMBEDDER_TAG", "bgem3"),
        registry_collection=_get("REGISTRY_COLLECTION", "_registry"),
        force_reparse=force_reparse,
        ocr_retry_on_garbage=ocr_retry_on_garbage,
        ocr_retry_max_per_folder=ocr_retry_max_per_folder,
        ocr_langs=ocr_langs,
        phase1_preview_max_chars=phase1_preview_max_chars,
    )


def collection_name(slug: str, cfg: Config | None = None) -> str:
    """Return the Qdrant collection name for a given folder slug.

    Format: <COLLECTION_PREFIX>__<slug>__<EMBEDDER_TAG>
    Example: ingest__doctrine__bgem3
    """
    if cfg is None:
        cfg = get_config()
    return f"{cfg.collection_prefix}__{slug}__{cfg.embedder_tag}"


# =============================================================================
# Per-doc output helpers
# =============================================================================
# Layout is flat: every stage writes to output/<doc_stem>/<stage_file>.
# We sanitise the stem to be filesystem-safe even on Windows and across
# weird filenames (spaces, punctuation, unicode).  The stem is derived from
# the source filename, so "ADP 3-0 Operations.pdf" becomes
# "ADP_3-0_Operations" and every artefact for that doc lives inside
# output/ADP_3-0_Operations/.

_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_stem(filename: str) -> str:
    """Convert a document filename into a filesystem-safe folder name.

    Strips the extension, collapses any character outside [A-Za-z0-9._-]
    to a single underscore, and trims leading/trailing underscores.
    Falls back to "doc" if the result would be empty.
    """
    stem = Path(filename).stem
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", stem).strip("_.")
    return cleaned or "doc"


def doc_output_dir(filename: str, cfg: Config | None = None) -> Path:
    """Return the absolute path of the per-doc output folder.

    Creates output/<safe_stem>/ as a side effect so callers can write
    into it immediately.  Every pipeline stage for this doc writes into
    the returned directory.
    """
    if cfg is None:
        cfg = get_config()
    path = Path(cfg.output_dir) / _safe_stem(filename)
    path.mkdir(parents=True, exist_ok=True)
    return path


# Canonical per-stage file names inside output/<doc>/.  Nodes import
# these constants to stay in sync and so that future renames are a
# one-line change.
FILE_INITIAL_PAGES = "initial_pages.md"
FILE_INITIAL_PAGES_OCR = "initial_pages_ocr.md"   # OCR-retry preview (plan B)
FILE_PARSED_JSON = "parsed.json"
FILE_DIAGNOSTICS_JSON = "diagnostics.json"
FILE_CHUNKS_JSONL = "chunks.jsonl"
FILE_ENRICHED_CHUNKS_JSONL = "enriched_chunks.jsonl"
FILE_EMBEDDINGS_NPZ = "embeddings.npz"
FILE_ACRONYMS_JSON = "acronyms.json"
FILE_ERRORS_JSONL = "errors.jsonl"

# =============================================================================
# Rejected-doc review artefacts (written by check_documents)
# =============================================================================
# When the per-doc LLM gate judges a document "not enough", its review bundle
# lands in output/<DIR_NOT_ENOUGH>/<folder_slug>/<safe_stem>/ so a human can
# inspect what the gate actually saw.  One folder per rejected doc; contents
# are overwritten on every run so the folder always reflects the latest verdict.
DIR_NOT_ENOUGH = "not_enough"
FILE_CHECK_DECISION_JSON = "check_decision.json"


def rejected_review_dir(folder_slug: str, cfg: Config | None = None) -> Path:
    """Return the per-folder root for rejected-doc review artefacts.

    Layout: <OUTPUT_DIR>/not_enough/<folder_slug>/.  Created on demand.
    """
    if cfg is None:
        cfg = get_config()
    path = Path(cfg.output_dir) / DIR_NOT_ENOUGH / folder_slug
    path.mkdir(parents=True, exist_ok=True)
    return path


def rejected_doc_dir(folder_slug: str, filename: str, cfg: Config | None = None) -> Path:
    """Return the per-doc review folder for one rejected document.

    Layout: <OUTPUT_DIR>/not_enough/<folder_slug>/<safe_stem>/.  Created on
    demand.  Safe to call from both check_documents (writing fresh artefacts)
    and main.py (summary / cleanup).
    """
    if cfg is None:
        cfg = get_config()
    path = rejected_review_dir(folder_slug, cfg) / _safe_stem(filename)
    path.mkdir(parents=True, exist_ok=True)
    return path
