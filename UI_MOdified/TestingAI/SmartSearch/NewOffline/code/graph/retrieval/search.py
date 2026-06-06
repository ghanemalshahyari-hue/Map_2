"""graph/retrieval/search.py
============================
Top-level `search(SearchRequest) -> SearchResponse`.

ORCHESTRATES THE FULL PIPELINE (§4 of the design doc):
    Stage A  embed_query           (optional glossary + optional HyDE)
    Stage B  hybrid_search         (one fused query_points + RRF)
    Stage B' per-retriever ranks   (when request.debug=True)
    Stage C  rerank                (bge-reranker-v2-m3)
    Stage D  apply_mmr             (stub; deferred)

HOT PATH vs DEBUG PATH:
  - debug=False: one query_points + one reranker call. No extra
    LLM round-trips, no per-retriever rank queries.
  - debug=True : three query_points calls (fused + dense-only +
    sparse-only), reranker call, plus timings, expanded query,
    HyDE doc, and sanitized Qdrant request JSON.

STANDALONE RUN:
  python -m graph.retrieval.search <collection> "<query>"
  Optional flags: --debug, --no-reranker, --no-glossary, --hyde,
                  --top-n-in N, --top-k-out K, --filter k=v.
"""
from __future__ import annotations

import json
import sys
import time
from typing import Any

from graph.retrieval.config import get_retrieval_config
from graph.retrieval.embed_query import embed_query
from graph.retrieval.hybrid_search import hybrid_search
from graph.retrieval.hyde import generate_hyde_document
from graph.retrieval.mmr import apply_mmr
from graph.retrieval.rerank import RerankUnavailable, rerank
from graph.retrieval.schema import (
    ALLOWED_FILTER_KEYS,
    SearchHit,
    SearchRequest,
    SearchResponse,
)


def search(request: SearchRequest) -> SearchResponse:
    """Run the full retrieval pipeline for one SearchRequest."""
    _validate_request(request)

    cfg = get_retrieval_config()
    timings: dict[str, float] = {} if request.debug else None  # type: ignore[assignment]

    # ------------------------------------------------------------------
    # Stage A — embed query (with optional HyDE + glossary)
    # ------------------------------------------------------------------
    hyde_document: str | None = None
    dense_text_override: str | None = None

    if request.use_hyde:
        t0 = time.perf_counter()
        hyde_document = generate_hyde_document(request.query)
        if request.debug:
            timings["hyde"] = (time.perf_counter() - t0) * 1000.0
        # Empty HyDE output should fall back to the user query — better
        # to return the normal dense hit than to embed an empty string.
        if hyde_document:
            dense_text_override = hyde_document

    t0 = time.perf_counter()
    qv = embed_query(
        request.query,
        collection=request.collection,
        use_glossary=request.use_glossary,
        dense_text_override=dense_text_override,
    )
    if request.debug:
        timings["embed"] = (time.perf_counter() - t0) * 1000.0

    # ------------------------------------------------------------------
    # Stage B (+ B' when debug) — hybrid search
    # ------------------------------------------------------------------
    t0 = time.perf_counter()
    hb = hybrid_search(
        collection=request.collection,
        qv=qv,
        top_n_in=request.top_n_in,
        dense_prefetch_limit=cfg.hybrid_dense_prefetch,
        sparse_prefetch_limit=cfg.hybrid_sparse_prefetch,
        filters=dict(request.filters) if request.filters else None,
        debug=request.debug,
    )
    if request.debug:
        timings["hybrid"] = (time.perf_counter() - t0) * 1000.0

    # ------------------------------------------------------------------
    # Stage C — rerank
    # ------------------------------------------------------------------
    fused = hb.fused
    rerank_scores: dict[int, float] = {}
    if request.use_reranker and fused:
        docs = [(p.payload or {}).get("text", "") or "" for p in fused]
        t0 = time.perf_counter()
        try:
            ranked = rerank(request.query, docs)
        except RerankUnavailable as exc:
            # User directive 2026-04-24: rerank failure must NOT hard-fail
            # retrieval.  Degrade to RRF-only ordering and surface the
            # reason in the debug timings so the caller can spot it.
            print(
                f"[search] reranker unavailable; falling back to RRF-only "
                f"({exc})",
                file=sys.stderr,
            )
            ranked = None
            if request.debug:
                timings["rerank_fallback_reason"] = 0.0  # presence flags the event
        if request.debug:
            timings["rerank"] = (time.perf_counter() - t0) * 1000.0
        if ranked is not None:
            for r in ranked:
                rerank_scores[r.original_index] = r.score
            # Reorder fused according to rerank output.
            order = [r.original_index for r in ranked]
            fused = [fused[i] for i in order]

    # ------------------------------------------------------------------
    # Stage D — diversify (stub) + truncate
    # ------------------------------------------------------------------
    fused = apply_mmr(fused, enabled=False)
    final_pool = fused[: request.top_k_out]

    # ------------------------------------------------------------------
    # Build SearchHits
    # ------------------------------------------------------------------
    hits: list[SearchHit] = []
    for i, point in enumerate(final_pool, start=1):
        payload = point.payload or {}
        pid = str(point.id)
        # When Stage C reordered the list, the original fused index is
        # lost on `point`. The rerank_scores dict keys are original
        # fused positions — which no longer map to `i-1`. We recover
        # the rerank score via the point_id -> score mapping we built
        # alongside the reorder.
        rr_score: float | None = None
        if request.use_reranker:
            # After the reorder, position `i-1` in `fused` corresponds
            # to the top-reranked hit. Scores are in `rerank_scores`
            # keyed by the pre-reorder index. We look them up via the
            # index within the original fused list using the point id.
            idx = _first_index_by_id(hb.fused, pid)
            if idx is not None:
                rr_score = rerank_scores.get(idx)

        dense_rank = hb.dense_rank_by_id.get(pid) if hb.dense_rank_by_id else None
        sparse_rank = hb.sparse_rank_by_id.get(pid) if hb.sparse_rank_by_id else None

        hits.append(
            SearchHit(
                point_id=pid,
                text=str(payload.get("text", "") or ""),
                heading_path=str(payload.get("heading_path", "") or ""),
                source_doc=str(payload.get("source_doc", "") or ""),
                page_numbers=list(payload.get("page_numbers") or []),
                chunk_type=str(payload.get("chunk_type", "") or ""),
                chunk_index=int(payload.get("chunk_index", 0) or 0),
                paragraph_number=payload.get("paragraph_number"),
                paragraph_numbers=list(payload.get("paragraph_numbers") or []),
                cross_refs=list(payload.get("cross_refs") or []),
                rrf_score=float(point.score),
                rerank_score=rr_score,
                dense_rank=dense_rank,
                sparse_rank=sparse_rank,
                final_rank=i,
            )
        )

    return SearchResponse(
        request=request,
        hits=hits,
        timings_ms=timings,
        expanded_query=qv.expanded_query if request.debug else None,
        hyde_document=hyde_document if request.debug else None,
        qdrant_request_json=hb.sanitized_request_json,
    )


# ---------------------------------------------------------------------------
# INTERNALS
# ---------------------------------------------------------------------------

def _validate_request(request: SearchRequest) -> None:
    """Reject malformed filter keys early (before Qdrant is touched)."""
    for key in request.filters:
        if key not in ALLOWED_FILTER_KEYS:
            raise ValueError(
                f"Filter key {key!r} is not indexed. Allowed keys: "
                f"{sorted(ALLOWED_FILTER_KEYS)}."
            )
    if request.top_n_in < request.top_k_out:
        raise ValueError(
            f"top_n_in ({request.top_n_in}) must be >= top_k_out "
            f"({request.top_k_out})."
        )


def _first_index_by_id(points: list[Any], point_id: str) -> int | None:
    for i, p in enumerate(points):
        if str(p.id) == point_id:
            return i
    return None


# =============================================================================
# STANDALONE MODE
# =============================================================================
# Usage:
#   python -m graph.retrieval.search <collection> "<query>" [flags...]
#
# Flags:
#   --debug
#   --no-reranker
#   --no-glossary
#   --hyde
#   --top-n-in N
#   --top-k-out K
#   --filter k=v   (repeatable)

def _parse_cli(argv: list[str]) -> SearchRequest:
    if len(argv) < 2:
        raise SystemExit(
            'Usage: python -m graph.retrieval.search <collection> "<query>" '
            '[--debug] [--no-reranker] [--no-glossary] [--hyde] '
            '[--top-n-in N] [--top-k-out K] [--filter k=v]...'
        )
    collection, query = argv[0], argv[1]

    filters: dict[str, str | list[str]] = {}
    use_reranker = True
    use_glossary = True
    use_hyde = False
    debug = False
    top_n_in = 50
    top_k_out = 8

    i = 2
    while i < len(argv):
        tok = argv[i]
        if tok == "--debug":
            debug = True; i += 1
        elif tok == "--no-reranker":
            use_reranker = False; i += 1
        elif tok == "--no-glossary":
            use_glossary = False; i += 1
        elif tok == "--hyde":
            use_hyde = True; i += 1
        elif tok == "--top-n-in" and i + 1 < len(argv):
            top_n_in = int(argv[i + 1]); i += 2
        elif tok == "--top-k-out" and i + 1 < len(argv):
            top_k_out = int(argv[i + 1]); i += 2
        elif tok == "--filter" and i + 1 < len(argv):
            k, _, v = argv[i + 1].partition("=")
            filters[k.strip()] = v.strip(); i += 2
        else:
            # Unknown flag — ignore rather than crash; this is a dev tool.
            i += 1

    return SearchRequest(
        query=query,
        collection=collection,
        filters=filters,
        top_n_in=top_n_in,
        top_k_out=top_k_out,
        use_reranker=use_reranker,
        use_glossary=use_glossary,
        use_hyde=use_hyde,
        debug=debug,
    )


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    request = _parse_cli(sys.argv[1:])
    response = search(request)

    print(f"Collection : {request.collection}")
    print(f"Query      : {request.query!r}")
    print(f"Filters    : {dict(request.filters) or '(none)'}")
    print(f"top_n_in   : {request.top_n_in}")
    print(f"top_k_out  : {request.top_k_out}")
    print(f"reranker   : {request.use_reranker}")
    print(f"glossary   : {request.use_glossary}")
    print(f"hyde       : {request.use_hyde}")
    print(f"debug      : {request.debug}")
    if response.expanded_query is not None:
        print(f"expanded   : {response.expanded_query!r}")
    if response.hyde_document:
        print("--- HyDE ---")
        print(response.hyde_document)
        print("--- end ---")
    if response.timings_ms is not None:
        print("timings(ms):", json.dumps(response.timings_ms, indent=None))
    print()
    print(f"Hits: {len(response.hits)}")
    for h in response.hits:
        rr = f"rerank={h.rerank_score:+.4f}  " if h.rerank_score is not None else ""
        dr = f"d={h.dense_rank}  s={h.sparse_rank}  " if h.dense_rank is not None else ""
        preview = h.text[:80].replace("\n", " ")
        print(f"  #{h.final_rank:2d} rrf={h.rrf_score:.4f}  {rr}{dr}"
              f"{h.source_doc} ¶{h.paragraph_number or '-'} — {preview!r}")
