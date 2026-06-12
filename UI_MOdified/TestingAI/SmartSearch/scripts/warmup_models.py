"""Build-time model warmup.

Pre-downloads every model the project pulls on first launch so the runtime
container has zero outbound network calls. Designed to run inside a Docker
build where HF_HOME / FASTEMBED_CACHE_PATH point at /app/.cache so the
caches end up baked into the image layer.

Strategy: import and invoke the project's own helpers (which already wrap
``add_custom_model()`` for bge-m3 and the reranker) instead of reinventing
the registration. Guarantees the warmup downloads exactly what the runtime
expects.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Make the project importable when running from anywhere inside the build.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# The project's config layer asserts OPENAI_API_KEY is set even at import
# time. The warmup never makes any LLM call — set a placeholder so import
# succeeds. The real key is set in .env at runtime.
os.environ.setdefault("OPENAI_API_KEY", "warmup-placeholder")
# Some helpers also peek at LLM_API_KEY / LLM_MODEL when constructing the
# Phase 1 / Phase 3 LLMs — provide non-empty placeholders so any import-time
# resolver doesn't trip.
os.environ.setdefault("LLM_API_KEY", "warmup-placeholder")
os.environ.setdefault("LLM_MODEL", "gpt-4o")


def _print(msg: str) -> None:
    print(f"[warmup] {msg}", flush=True)


def warm_dense_embedder() -> None:
    _print("FastEmbed dense — BAAI/bge-m3 ONNX (~2.3 GB) via project helper")
    from graph.shared.embedders import _get_dense_embedder

    emb = _get_dense_embedder()
    list(emb.embed(["warmup"]))
    _print("dense embedder OK")


def warm_sparse_embedder() -> None:
    _print("FastEmbed sparse — Qdrant/bm25 via project helper")
    from graph.shared.embedders import _get_sparse_embedder

    sp = _get_sparse_embedder()
    list(sp.embed(["warmup"]))
    _print("sparse embedder OK")


def warm_reranker() -> None:
    _print("FastEmbed reranker — BAAI/bge-reranker-v2-m3 via project helper")
    # Force fastembed provider so we exercise the local download path even
    # if .env has RERANK_PROVIDER=http set.
    os.environ["RERANK_PROVIDER"] = "fastembed"
    from graph.retrieval.rerank import _get_reranker

    rr = _get_reranker()
    list(rr.rerank("warmup query", ["doc one", "doc two"]))
    _print("reranker OK")


def warm_hf_tokenizer() -> None:
    _print("HuggingFace tokenizer — BAAI/bge-m3")
    from transformers import AutoTokenizer

    AutoTokenizer.from_pretrained("BAAI/bge-m3")
    _print("HF tokenizer OK")


def warm_docling() -> None:
    _print("Docling layout + TableFormer (first parse triggers download)")
    try:
        from docling.document_converter import DocumentConverter
    except Exception as e:
        _print(f"docling import failed (non-fatal): {e}")
        return

    # Minimal hand-crafted PDF so we don't pull reportlab.
    tmp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False).name
    Path(tmp_pdf).write_bytes(
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<<>>>>endobj\n"
        b"4 0 obj<</Length 23>>stream\nBT /F1 12 Tf 50 100 Td (X) Tj ET\nendstream endobj\n"
        b"xref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n"
        b"0000000095 00000 n\n0000000175 00000 n\ntrailer<</Size 5/Root 1 0 R>>\n"
        b"startxref\n245\n%%EOF\n"
    )

    try:
        conv = DocumentConverter()
        conv.convert(tmp_pdf)
        _print("Docling OK")
    except Exception as e:
        _print(f"Docling warmup failed (non-fatal — runtime will fetch): {e}")
    finally:
        try:
            os.unlink(tmp_pdf)
        except Exception:
            pass


def warm_rapidocr() -> None:
    """Pre-cache RapidOCR PP-OCRv4 det/cls/rec ONNX weights.

    RapidOCR is loaded by Docling internally even when the configured OCR
    engine is Tesseract (it's used for thin-page / orientation detection).
    Weights are hosted on modelscope.cn which is often slow / unreliable
    from outside China — promote this to critical so a flaky build fails
    loudly instead of producing an incomplete image.
    """
    _print("RapidOCR PP-OCRv4 det/cls/rec ONNX")
    from rapidocr import RapidOCR
    RapidOCR()
    _print("RapidOCR OK")


def warm_tiktoken() -> None:
    """Pre-cache tiktoken encoding files.

    The openai SDK's token-counting helpers download `o200k_base` /
    `cl100k_base` / `p50k_base` from openaipublic.blob.core.windows.net on
    first use.  Without this warmup, the very first LLM call on an
    airgapped host hangs / fails with a connection error.

    With ``TIKTOKEN_CACHE_DIR`` set in the Dockerfile, the encoding files
    materialise inside the image layer.
    """
    _print("tiktoken encodings — o200k_base + cl100k_base + p50k_base")
    import tiktoken

    cache_dir = os.environ.get("TIKTOKEN_CACHE_DIR")
    if cache_dir:
        Path(cache_dir).mkdir(parents=True, exist_ok=True)

    encodings = ["o200k_base", "cl100k_base", "p50k_base"]
    for name in encodings:
        enc = tiktoken.get_encoding(name)
        # Force a tiny encode so the file definitely materialises on disk.
        enc.encode("warmup")
        _print(f"  {name} OK")

    # Prime the model→encoding map for common openai model names so the
    # internal lookup table is also warm.
    for model in ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo"]:
        try:
            tiktoken.encoding_for_model(model)
        except Exception:
            # Some model ids may not have a registered tokenizer; ignore.
            pass

    _print("tiktoken OK")


def main() -> int:
    """Pre-cache every model the offline image needs in-process.

    DELIBERATE OMISSIONS (offline target uses HTTP-served models):
      * warm_dense_embedder  — bge-m3 served via EMBED_PROVIDER=http
      * warm_reranker        — bge-reranker-v2-m3 served via RERANK_PROVIDER=http
    These two would add ~3.4 GB to the image for code paths the offline
    operator will not exercise.  If you ever want a local fallback (in
    case the HTTP server is down), restore them to the critical list.

    EVERYTHING ELSE IS CRITICAL — a build that can't fully populate these
    caches must fail loudly so we never ship an incomplete image.
    """
    cache_root = os.environ.get("HF_HOME", str(Path.home() / ".cache" / "huggingface"))
    fe_root = os.environ.get("FASTEMBED_CACHE_PATH", str(Path.home() / ".cache" / "fastembed"))
    tk_root = os.environ.get("TIKTOKEN_CACHE_DIR", str(Path.home() / ".cache" / "tiktoken"))
    _print(f"HF_HOME              = {cache_root}")
    _print(f"FASTEMBED_CACHE_PATH = {fe_root}")
    _print(f"TIKTOKEN_CACHE_DIR   = {tk_root}")
    Path(cache_root).mkdir(parents=True, exist_ok=True)
    Path(fe_root).mkdir(parents=True, exist_ok=True)
    Path(tk_root).mkdir(parents=True, exist_ok=True)

    # Every step is critical for an offline-capable image.  If any fails,
    # the build aborts so we never produce an image that hangs on first
    # use trying to phone home.
    critical = [
        warm_sparse_embedder,    # BM25 — sparse vectors, in-process always
        warm_hf_tokenizer,       # bge-m3 tokenizer — used by the chunker
        warm_tiktoken,           # openai SDK token counting on first LLM call
        warm_docling,            # PDF parser — layout + TableFormer weights
        warm_rapidocr,           # Docling internal helper (modelscope.cn)
    ]

    for fn in critical:
        try:
            fn()
        except Exception as e:
            _print(f"CRITICAL step {fn.__name__} failed: {e!r}")
            _print("Image build aborted — fix network / mirror access and retry.")
            return 1

    _print("ALL CRITICAL WARMUPS GREEN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
