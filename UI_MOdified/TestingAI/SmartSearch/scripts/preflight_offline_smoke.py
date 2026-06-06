"""Pre-flight smoke for the offline code machine.

Run this AFTER unpacking the transfer and editing .env, BEFORE running
`python main.py` or `scripts/generate_documents.py`.  It surfaces every
common transfer-failure mode in a single command with pass/fail per
check.  No state is mutated, no Qdrant collections written.

Usage:
    python scripts/preflight_offline_smoke.py

Exit code: 0 if every check passes, 1 if any failed.

Checks (in order):
  1. Required env vars present and non-empty
  2. Tesseract binary installed + languages we need (eng / ara if OCR_LANGS asks)
  3. Local Qdrant reachable at QDRANT_URL
  4. Offline server reachable at LLM_BASE_URL / EMBED_BASE_URL / RERANK_BASE_URL
  5. LLM probe — POST /v1/responses round-trip with a tiny prompt
  6. Embedder probe — POST /v1/embeddings, 1024-dim L2-normalised vector
  7. Reranker probe — POST /v1/rerank, returns ranked hits

The script tolerates HTTP and HTTPS endpoints (SSL verification is bypassed
to match graph/shared/responses_client.py + graph/shared/embedders.py +
graph/retrieval/rerank.py).
"""
from __future__ import annotations

import os
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Make the project importable when running from the project root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from dotenv import load_dotenv

load_dotenv(_REPO_ROOT / ".env")


# ---------------------------------------------------------------------------
# tiny test runner — prints PASS / FAIL with a short reason and tracks fails
# ---------------------------------------------------------------------------

_FAILS: list[tuple[str, str]] = []


def _hr() -> None:
    print("─" * 70)


def check(name: str):
    """Decorator: run the function, print PASS/FAIL, capture failure reason."""
    def deco(fn):
        def wrapped():
            try:
                fn()
            except AssertionError as exc:
                _FAILS.append((name, str(exc)))
                print(f"  [FAIL] {name}")
                print(f"         {exc}")
                return
            except Exception as exc:
                _FAILS.append((name, f"{type(exc).__name__}: {exc}"))
                print(f"  [FAIL] {name}")
                print(f"         {type(exc).__name__}: {exc}")
                return
            print(f"  [PASS] {name}")
        return wrapped
    return deco


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _ssl_ctx() -> ssl.SSLContext:
    """Trust-anything SSL context — matches the runtime modules."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _http_get(url: str, *, headers: dict | None = None, timeout: float = 10.0) -> tuple[int, bytes]:
    """GET with SSL bypass.  Returns (status, body) or raises."""
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx()) as resp:
        return resp.status, resp.read()


# ---------------------------------------------------------------------------
# checks
# ---------------------------------------------------------------------------

@check("env vars present")
def env_vars():
    required = [
        "OPENAI_API_KEY",
        "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL",
        "EMBED_BASE_URL", "EMBED_API_KEY", "EMBED_MODEL",
        "RERANK_BASE_URL", "RERANK_API_KEY", "RERANK_MODEL",
        "QDRANT_URL",
    ]
    missing = [k for k in required if not (os.environ.get(k) or "").strip()]
    assert not missing, f"missing: {', '.join(missing)}"


@check("tesseract binary + languages")
def tesseract():
    assert shutil.which("tesseract"), "`tesseract` not found in PATH (install: sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara)"

    out = subprocess.run(
        ["tesseract", "--list-langs"],
        capture_output=True, text=True, timeout=10,
    )
    assert out.returncode == 0, f"tesseract --list-langs failed: {out.stderr.strip()}"
    installed = {l.strip() for l in out.stdout.splitlines() if l.strip() and not l.startswith("List of")}

    wanted = (os.environ.get("OCR_LANGS") or "eng").replace(",", "+").split("+")
    wanted = [w.strip() for w in wanted if w.strip()]
    missing = [w for w in wanted if w not in installed]
    assert not missing, (
        f"OCR_LANGS={os.environ.get('OCR_LANGS')!r} but tesseract is missing language pack(s): "
        f"{', '.join(missing)}.  Install: sudo apt install "
        + " ".join(f"tesseract-ocr-{w}" for w in missing)
    )


@check("local Qdrant reachable")
def qdrant_reachable():
    url = (os.environ.get("QDRANT_URL") or "").rstrip("/")
    assert url, "QDRANT_URL is empty"
    status, body = _http_get(f"{url}/readyz", timeout=5)
    assert status == 200, f"GET {url}/readyz returned status {status}, body={body!r}"


@check("offline server LLM endpoint reachable")
def llm_reachable():
    base = (os.environ.get("LLM_BASE_URL") or "").rstrip("/")
    key = os.environ.get("LLM_API_KEY") or ""
    status, body = _http_get(
        f"{base}/models",
        headers={"Authorization": f"Bearer {key}"},
        timeout=10,
    )
    assert status == 200, f"GET {base}/models returned status {status}, body[:200]={body[:200]!r}"

    import json as _json
    parsed = _json.loads(body)
    ids = [row.get("id") for row in parsed.get("data", [])]
    want = os.environ.get("LLM_MODEL")
    assert want in ids, f"LLM_MODEL={want!r} not in /v1/models: {ids}"


@check("LLM probe — POST /v1/responses (text)")
def llm_probe():
    from graph.shared.responses_client import invoke_text

    result = invoke_text(
        role_env=None,
        default_model=os.environ.get("LLM_MODEL") or "",
        temperature=0.0,
        system="You are a smoke test.  Reply with one word.",
        user="Reply with the single word READY.",
        max_output_tokens=2048,  # leave headroom for reasoning models (see .env.example)
    )
    text = getattr(result, "text", None) or str(result)
    assert isinstance(text, str) and text.strip(), f"empty response: {result!r}"


@check("embedder probe — 1024-dim L2-normalised vector")
def embed_probe():
    import numpy as np
    from graph.shared.embedders import _get_dense_embedder

    emb = _get_dense_embedder()
    vec = next(iter(emb.query_embed("offline preflight smoke")))
    arr = np.asarray(vec, dtype=np.float32)
    assert arr.shape == (1024,), f"expected (1024,), got {arr.shape}"
    norm = float(np.linalg.norm(arr))
    assert 0.99 <= norm <= 1.01, f"L2 norm {norm:.6f} outside [0.99, 1.01] — embedder may be returning unnormalised vectors"


@check("reranker probe — returns ranked hits")
def rerank_probe():
    from graph.retrieval.rerank import rerank

    hits = rerank(
        "mission command philosophy",
        ["doc about logistics", "doc about command philosophy", "doc about weather"],
    )
    assert hits, "rerank() returned no hits"
    assert all(0 <= h.original_index <= 2 for h in hits), f"bad indexes: {hits}"
    # Best hit should be the command-philosophy one (index 1) — but don't fail
    # on this since some rerankers compress scores; just warn.
    if hits[0].original_index != 1:
        print(f"         [warn] best rerank hit was index {hits[0].original_index}, expected 1")


@check("BM25 sparse embedder loads")
def bm25_loads():
    from graph.shared.embedders import _get_sparse_embedder

    sp = _get_sparse_embedder()
    out = list(sp.embed(["smoke test for BM25"]))
    assert out, "sparse embedder returned nothing"


@check("Docling + RapidOCR import")
def docling_loads():
    # Only import — actual PDF parse takes too long for a smoke.
    import docling  # noqa: F401
    import rapidocr  # noqa: F401
    from docling.document_converter import DocumentConverter  # noqa: F401


@check("HF tokenizer (BAAI/bge-m3) loads from local cache")
def tokenizer_loads():
    # Forces use of local cache; with HF_HUB_OFFLINE=1 a missing cache fails fast.
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained("BAAI/bge-m3")
    ids = tok.encode("preflight")
    assert ids, "tokenizer returned empty ids"


@check("tiktoken cl100k_base loads from local cache")
def tiktoken_loads():
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")
    assert enc.encode("preflight"), "tiktoken returned empty ids"


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    print()
    _hr()
    print("OFFLINE PRE-FLIGHT SMOKE")
    _hr()
    print(f"  LLM_BASE_URL    : {os.environ.get('LLM_BASE_URL', '(unset)')}")
    print(f"  EMBED_BASE_URL  : {os.environ.get('EMBED_BASE_URL', '(unset)')}")
    print(f"  RERANK_BASE_URL : {os.environ.get('RERANK_BASE_URL', '(unset)')}")
    print(f"  QDRANT_URL      : {os.environ.get('QDRANT_URL', '(unset)')}")
    print(f"  LLM_MODEL       : {os.environ.get('LLM_MODEL', '(unset)')}")
    print(f"  EMBED_MODEL     : {os.environ.get('EMBED_MODEL', '(unset)')}")
    print(f"  RERANK_MODEL    : {os.environ.get('RERANK_MODEL', '(unset)')}")
    print(f"  OCR_LANGS       : {os.environ.get('OCR_LANGS', '(unset)')}")
    _hr()

    t0 = time.time()
    print("\nLocal environment")
    env_vars()
    tesseract()
    bm25_loads()
    docling_loads()
    tokenizer_loads()
    tiktoken_loads()

    print("\nReachability")
    qdrant_reachable()
    llm_reachable()

    print("\nLive endpoint probes")
    llm_probe()
    embed_probe()
    rerank_probe()

    elapsed = time.time() - t0

    print()
    _hr()
    if not _FAILS:
        print(f"ALL CHECKS PASSED in {elapsed:.1f}s — system is ready for ingest + generation")
        _hr()
        return 0

    print(f"{len(_FAILS)} CHECK(S) FAILED in {elapsed:.1f}s — fix these before running main.py")
    _hr()
    for name, reason in _FAILS:
        print(f"  • {name}")
        print(f"      {reason}")
    print()
    print("See OFFLINE_TROUBLESHOOTING.md for the full failure-mode catalog.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
