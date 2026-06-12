"""graph/shared/embedders.py
============================
Dense + sparse embedder singletons.

DENSE EMBEDDER — HTTP only.
  Backend: any OpenAI-compatible ``POST /v1/embeddings`` server (LM Studio,
  Infinity, TEI, llama.cpp server, vLLM in pooling mode).  Wire-shape is
  ``{"model": "...", "input": [...]}`` in, ``{"data": [{"embedding": [...]}, ...]}``
  out.  Switch backends by editing ``EMBED_BASE_URL`` / ``EMBED_API_KEY`` /
  ``EMBED_MODEL`` in ``.env`` — no code edits.

  L2-normalised on the client side as defence-in-depth: bge-m3 retrieval
  assumes unit vectors and not every server returns pre-normalised
  embeddings (some llama.cpp builds return raw pooled vectors).
  Double-normalising a unit vector is a no-op, so this is safe.

BM25 (sparse) is unchanged.  It is a pure-Python scoring algorithm, not a
neural model, and runs in-process via ``fastembed.SparseTextEmbedding``.
It never routes over HTTP.

Interface
---------
Both call sites use the same two methods that ``fastembed.TextEmbedding``
exposed historically:

    .embed(texts, batch_size=None, parallel=None) -> Iterator[np.ndarray]
    .query_embed(text) -> Iterator[np.ndarray]

The shim returns real ``numpy.ndarray`` rows so downstream code that
calls ``.tolist()`` or NumPy ops keeps working.
"""
from __future__ import annotations

import os
import time
from typing import Iterable, Iterator

import numpy as np
from fastembed import SparseTextEmbedding


__all__ = [
    "_get_dense_embedder",
    "_get_sparse_embedder",
    "resolve_embed_endpoint_tag",
    "HttpDenseEmbedder",
]


# =============================================================================
# IDENTITY / CACHE-KEY TAG
# =============================================================================

def resolve_embed_endpoint_tag() -> str:
    """Stable identity string for cache keys.

    Combines base URL + model so a swap of either invalidates Phase 3
    per-group draft caches.
    """
    base = (os.environ.get("EMBED_BASE_URL") or "").strip()
    model = (os.environ.get("EMBED_MODEL") or "").strip()
    return f"http:{base}:{model}" if base else "http-no-base-url"


# =============================================================================
# HTTP DENSE EMBEDDER — OpenAI-compatible /v1/embeddings shim
# =============================================================================

class HttpDenseEmbedder:
    """OpenAI-compatible dense embeddings over HTTP.

        embedder = HttpDenseEmbedder(...)
        list(embedder.embed(["hello", "world"]))            # list[np.ndarray]
        list(embedder.query_embed("a question"))            # list[np.ndarray]
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        model: str,
        timeout_seconds: float = 60.0,
        max_retries: int = 2,
    ) -> None:
        if not base_url:
            raise RuntimeError(
                "HttpDenseEmbedder requires EMBED_BASE_URL "
                "(e.g. http://host.docker.internal:1234/v1)."
            )
        if not model:
            raise RuntimeError(
                "HttpDenseEmbedder requires EMBED_MODEL (the id the "
                "server lists at /v1/models)."
            )
        # Accept both '.../v1' and '.../v1/' forms.
        self._embeddings_url = base_url.rstrip("/") + "/embeddings"
        self._api_key = api_key or ""
        self._model = model
        self._timeout = float(timeout_seconds)
        self._max_retries = int(max_retries)

    def embed(
        self,
        documents: Iterable[str],
        batch_size: int | None = None,
        parallel: int | None = None,  # ignored — server handles concurrency
        **_kwargs,
    ) -> Iterator[np.ndarray]:
        """Yield one np.ndarray per input text."""
        batch_size = int(batch_size) if batch_size else 32
        buf: list[str] = []
        for text in documents:
            buf.append(text)
            if len(buf) >= batch_size:
                yield from self._embed_batch(buf)
                buf = []
        if buf:
            yield from self._embed_batch(buf)

    def query_embed(self, query: str | list[str], **_kwargs) -> Iterator[np.ndarray]:
        """Embed one (or a handful) of query strings."""
        if isinstance(query, str):
            yield from self._embed_batch([query])
            return
        for chunk in self._chunked(list(query), 32):
            yield from self._embed_batch(chunk)

    # ----- implementation ---------------------------------------------------

    @staticmethod
    def _chunked(items: list[str], size: int) -> Iterator[list[str]]:
        for i in range(0, len(items), size):
            yield items[i : i + size]

    def _embed_batch(self, batch: list[str]) -> Iterator[np.ndarray]:
        import json
        import ssl
        import urllib.error
        import urllib.request

        payload = json.dumps({"model": self._model, "input": batch}).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        # Airgapped servers often use self-signed / internal-CA HTTPS certs.
        # Mirror the SSL bypass in graph/shared/responses_client.py so HTTP
        # and HTTPS with any cert both work.  Safe on a controlled network;
        # do not deploy this image on an internet-facing host.
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        last_exc: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                req = urllib.request.Request(
                    self._embeddings_url,
                    data=payload,
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self._timeout, context=ssl_ctx) as resp:
                    body = resp.read()
                parsed = json.loads(body)
                data = parsed.get("data")
                if not isinstance(data, list) or len(data) != len(batch):
                    raise RuntimeError(
                        f"embedder HTTP response shape mismatch: got "
                        f"{len(data) if isinstance(data, list) else 'non-list'} "
                        f"rows for {len(batch)} inputs"
                    )
                for row in data:
                    vec = row.get("embedding")
                    if not isinstance(vec, list):
                        raise RuntimeError("embedding row missing 'embedding' field")
                    arr = np.asarray(vec, dtype=np.float32)
                    norm = float(np.linalg.norm(arr))
                    if norm > 0:
                        arr = arr / norm
                    yield arr
                return
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ConnectionError, RuntimeError, json.JSONDecodeError) as exc:
                last_exc = exc
                if attempt >= self._max_retries:
                    break
                time.sleep(0.5 * (attempt + 1))
        raise RuntimeError(
            f"embedder HTTP request to {self._embeddings_url} failed "
            f"after {self._max_retries + 1} attempts: {last_exc}"
        ) from last_exc


# =============================================================================
# LAZY SINGLETONS
# =============================================================================

_dense_embedder: HttpDenseEmbedder | None = None
_sparse_embedder: SparseTextEmbedding | None = None


def _get_dense_embedder() -> HttpDenseEmbedder:
    """Return the process-level dense embedder singleton."""
    global _dense_embedder
    if _dense_embedder is not None:
        return _dense_embedder
    base_url = (os.environ.get("EMBED_BASE_URL") or "").strip()
    api_key = (os.environ.get("EMBED_API_KEY") or "").strip()
    model = (os.environ.get("EMBED_MODEL") or "").strip()
    _dense_embedder = HttpDenseEmbedder(
        base_url=base_url,
        api_key=api_key or None,
        model=model,
    )
    return _dense_embedder


def _get_sparse_embedder() -> SparseTextEmbedding:
    """Return the process-level Qdrant/bm25 sparse embedder singleton.

    BM25 is a pure-Python scoring algorithm; ``fastembed.SparseTextEmbedding``
    is just the implementation vehicle.  No model weights, no GPU, no
    HTTP — runs in-process always.
    """
    global _sparse_embedder
    if _sparse_embedder is None:
        _sparse_embedder = SparseTextEmbedding(model_name="Qdrant/bm25")
    return _sparse_embedder


# =============================================================================
# STANDALONE DIAGNOSTIC
# =============================================================================
# Usage:
#     python -m graph.shared.embedders                    # print resolved config
#     python -m graph.shared.embedders probe "sample text"

if __name__ == "__main__":
    import sys

    from dotenv import load_dotenv
    load_dotenv()

    print(f"EMBED_BASE_URL : {os.environ.get('EMBED_BASE_URL', '')}")
    print(f"EMBED_API_KEY  : {'set' if os.environ.get('EMBED_API_KEY') else 'MISSING'}")
    print(f"EMBED_MODEL    : {os.environ.get('EMBED_MODEL', '')}")
    print(f"endpoint tag   : {resolve_embed_endpoint_tag()}")

    if len(sys.argv) > 2 and sys.argv[1] == "probe":
        text = sys.argv[2]
        emb = _get_dense_embedder()
        vec = next(iter(emb.query_embed(text)))
        vec = np.asarray(vec)
        print()
        print(f"probe text         : {text!r}")
        print(f"vector dim         : {vec.shape[0]}")
        print(f"vector norm (L2)   : {float(np.linalg.norm(vec)):.6f}")
        print(f"first 4 components : {vec[:4].tolist()}")
