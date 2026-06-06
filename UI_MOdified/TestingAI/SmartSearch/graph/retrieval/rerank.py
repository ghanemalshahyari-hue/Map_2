"""graph/retrieval/rerank.py
============================
Stage C — cross-encoder reranker over HTTP only.

Backend: any server that accepts

    POST <RERANK_BASE_URL>/rerank
    { "model": "...", "query": "...", "documents": [...], "top_n": N }

and returns

    { "results": [ { "index": 0, "relevance_score": 0.92 }, ... ] }

This is the de-facto shape used by Cohere, Jina, Infinity, TEI, and
llama.cpp server (with --reranking).  Some builds use ``score`` instead
of ``relevance_score`` — accepted as an alias.

Switch backends by editing ``RERANK_BASE_URL`` / ``RERANK_API_KEY`` /
``RERANK_MODEL`` in ``.env`` — no code edits.

GRACEFUL DEGRADATION
  On HTTP failure (timeout, 500, wrong shape) this module raises
  :class:`RerankUnavailable`.  The retrieval orchestrator in
  :mod:`graph.retrieval.search` catches it, emits a visible warning,
  and **returns RRF-only results** for the query — it does NOT
  hard-fail the search.

STANDALONE RUN
  python -m graph.retrieval.rerank "<query>" "<doc1>" "<doc2>" ...
"""
from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass


__all__ = [
    "RerankedHit",
    "RerankUnavailable",
    "rerank",
    "resolve_rerank_endpoint_tag",
    "HttpReranker",
]


@dataclass(frozen=True)
class RerankedHit:
    """Index-preserving reranker output."""
    original_index: int    # position in the input list before reranking
    score: float


class RerankUnavailable(RuntimeError):
    """Signals the caller should degrade to RRF-only retrieval."""


# =============================================================================
# IDENTITY / CACHE-KEY TAG
# =============================================================================

def resolve_rerank_endpoint_tag() -> str:
    """Stable identity string for cache keys."""
    base = (os.environ.get("RERANK_BASE_URL") or "").strip()
    model = (os.environ.get("RERANK_MODEL") or "").strip()
    return f"http:{base}:{model}" if base else "http-no-base-url"


# =============================================================================
# HTTP RERANKER
# =============================================================================

class HttpReranker:
    """Minimal OpenAI-compatible HTTP reranker client.

    Lazy connection — no request is sent until :meth:`score` is called.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        model: str,
        timeout_seconds: float = 30.0,
        max_retries: int = 1,
    ) -> None:
        if not base_url:
            raise RuntimeError(
                "HttpReranker requires RERANK_BASE_URL "
                "(e.g. http://infinity:7997)."
            )
        if not model:
            raise RuntimeError(
                "HttpReranker requires RERANK_MODEL (the id the "
                "rerank server lists at /v1/models)."
            )
        self._rerank_url = base_url.rstrip("/") + "/rerank"
        self._api_key = api_key or ""
        self._model = model
        self._timeout = float(timeout_seconds)
        self._max_retries = int(max_retries)

    def score(self, query: str, documents: list[str]) -> list[float]:
        """Return one relevance score per document, in input order."""
        import json
        import ssl
        import urllib.error
        import urllib.request

        payload = json.dumps({
            "model": self._model,
            "query": query,
            "documents": documents,
            "top_n": len(documents),  # we want every score back
        }).encode("utf-8")
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
                    self._rerank_url,
                    data=payload,
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self._timeout, context=ssl_ctx) as resp:
                    body = resp.read()
                parsed = json.loads(body)
                results = parsed.get("results")
                if not isinstance(results, list):
                    raise RuntimeError(
                        "rerank HTTP response missing 'results' list "
                        f"(got keys={sorted(parsed)})"
                    )
                scores = [0.0] * len(documents)
                for row in results:
                    idx = row.get("index")
                    if not isinstance(idx, int) or idx < 0 or idx >= len(documents):
                        raise RuntimeError(f"rerank row has invalid index: {row!r}")
                    raw_score = row.get("relevance_score")
                    if raw_score is None:
                        raw_score = row.get("score")
                    if raw_score is None:
                        raise RuntimeError(f"rerank row missing 'relevance_score'/'score': {row!r}")
                    scores[idx] = float(raw_score)
                return scores
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ConnectionError, RuntimeError, json.JSONDecodeError) as exc:
                last_exc = exc
                if attempt >= self._max_retries:
                    break
                time.sleep(0.5 * (attempt + 1))
        raise RerankUnavailable(
            f"rerank HTTP request to {self._rerank_url} failed: {last_exc}"
        ) from last_exc


# =============================================================================
# SINGLETON
# =============================================================================

_http_reranker: HttpReranker | None = None


def _get_http_reranker() -> HttpReranker:
    """Return the process-level HTTP reranker singleton."""
    global _http_reranker
    if _http_reranker is None:
        _http_reranker = HttpReranker(
            base_url=(os.environ.get("RERANK_BASE_URL") or "").strip(),
            api_key=(os.environ.get("RERANK_API_KEY") or "").strip() or None,
            model=(os.environ.get("RERANK_MODEL") or "").strip(),
        )
    return _http_reranker


# =============================================================================
# PUBLIC API
# =============================================================================

def rerank(query: str, documents: list[str]) -> list[RerankedHit]:
    """Score every (query, document) pair; return hits sorted by score desc.

    Raises :class:`RerankUnavailable` on any HTTP / shape failure.
    Callers in :mod:`graph.retrieval.search` catch this and degrade to
    RRF-only retrieval.
    """
    if not documents:
        return []

    scores = _get_http_reranker().score(query, documents)

    if len(scores) != len(documents):
        raise RerankUnavailable(
            f"reranker returned {len(scores)} scores for {len(documents)} documents"
        )
    hits = [RerankedHit(original_index=i, score=float(s)) for i, s in enumerate(scores)]
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits


# =============================================================================
# STANDALONE MODE
# =============================================================================

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    if len(sys.argv) < 3:
        print('Usage: python -m graph.retrieval.rerank "<query>" "<doc1>" "<doc2>" ...')
        sys.exit(1)

    query = sys.argv[1]
    docs = sys.argv[2:]

    print(f"RERANK_BASE_URL : {os.environ.get('RERANK_BASE_URL', '')}")
    print(f"RERANK_API_KEY  : {'set' if os.environ.get('RERANK_API_KEY') else 'MISSING'}")
    print(f"RERANK_MODEL    : {os.environ.get('RERANK_MODEL', '')}")
    print(f"endpoint tag    : {resolve_rerank_endpoint_tag()}")
    print(f"Query           : {query!r}")
    print(f"Docs            : {len(docs)}")
    print()

    try:
        hits = rerank(query, docs)
    except RerankUnavailable as exc:
        print("RERANK UNAVAILABLE — retrieval would degrade to RRF-only.")
        print(f"  reason: {exc}")
        sys.exit(2)

    for rank_i, h in enumerate(hits, start=1):
        print(f"  rank {rank_i}  score={h.score:+.4f}  "
              f"orig_idx={h.original_index}  {docs[h.original_index][:80]!r}")
