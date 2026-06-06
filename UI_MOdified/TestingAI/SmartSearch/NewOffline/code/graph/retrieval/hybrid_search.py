"""graph/retrieval/hybrid_search.py
====================================
Stage B of the retrieval pipeline — hybrid dense + sparse search
against one Qdrant collection, fused with RRF.

VERIFIED API (R3 spike, referencedocs/17_phase2_retrieval.md §11.1):
  - Top-level kwarg is `query_filter` on `query_points(...)`
    (qdrant_client/qdrant_client.py:269).
  - `Prefetch(...)` uses `filter=`, NOT `query_filter=`
    (qdrant_client/http/models/models.py:2230). We only use the
    top-level filter here (Qdrant propagates it to every
    prefetch), but a future per-prefetch filter must not trip on
    this naming asymmetry.
  - `FusionQuery(fusion=Fusion.RRF)` is the fused-query shape
    (qdrant_client/http/models/models.py:1058).
  - `ScoredPoint` carries `score` (the RRF score after fusion) but
    NO `dense_rank` / `sparse_rank`. Per-retriever ranks require
    extra dense-only and sparse-only queries (Stage B', §5).

PAYLOAD KEYS FOR FILTERING:
  Only the five KEYWORD-indexed fields from Phase 1 are allowed:
  source_doc, chunk_type, paragraph_number, paragraph_numbers,
  cross_refs. Anything else is rejected by `search.py` before
  hitting this module, so filters arriving here are already
  sanitised. We still check defensively.

VECTOR NAMES:
  Phase 1 ingests into named vectors "dense" (1024-dim cosine)
  and "sparse" (BM25 with modifier=IDF). The Prefetch `using=`
  fields below must match those names exactly — they are the
  Phase 1 contract.

STANDALONE RUN:
  python -m graph.retrieval.hybrid_search <collection> "<query>"
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Any, Iterable

from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    FieldCondition,
    Filter,
    Fusion,
    FusionQuery,
    MatchAny,
    MatchValue,
    Prefetch,
    ScoredPoint,
    SparseVector,
)

from graph.retrieval.embed_query import QueryVectors
from graph.retrieval.registry import _get_client  # reuse the parallel singleton
from graph.retrieval.schema import ALLOWED_FILTER_KEYS


# Named vectors (Phase 1 contract — do not change without also
# changing graph/nodes/upsert_to_qdrant.py).
DENSE_VECTOR_NAME = "dense"
SPARSE_VECTOR_NAME = "sparse"


@dataclass(frozen=True)
class HybridSearchResult:
    """Fused results plus (when debug=True) per-retriever ranks."""
    fused: list[ScoredPoint]                # top-N_in, RRF score
    dense_rank_by_id: dict[str, int] | None     # only when debug=True
    sparse_rank_by_id: dict[str, int] | None    # only when debug=True
    sanitized_request_json: dict[str, Any] | None  # debug-only


# ---------------------------------------------------------------------------
# FILTER CONSTRUCTION
# ---------------------------------------------------------------------------

def build_filter(filters: dict[str, str | list[str]]) -> Filter | None:
    """Convert the search request's filter dict into a Qdrant Filter.

    - str value  -> MatchValue (exact match; works on keyword and
                    keyword-list fields alike).
    - list[str]  -> MatchAny (OR across the values).
    - empty dict -> None (no filter).

    Unknown keys raise ValueError — callers must pre-validate
    against ALLOWED_FILTER_KEYS, but we guard defensively here in
    case this module is called directly.
    """
    if not filters:
        return None

    must: list[FieldCondition] = []
    for key, value in filters.items():
        if key not in ALLOWED_FILTER_KEYS:
            raise ValueError(
                f"Filter key {key!r} is not one of the indexed payload "
                f"fields {sorted(ALLOWED_FILTER_KEYS)}."
            )
        if isinstance(value, list):
            if not value:
                # Empty list means "no constraint for this key" — skip.
                continue
            condition = FieldCondition(key=key, match=MatchAny(any=list(value)))
        else:
            condition = FieldCondition(key=key, match=MatchValue(value=value))
        must.append(condition)

    return Filter(must=must) if must else None


# ---------------------------------------------------------------------------
# HOT PATH — one fused query_points call
# ---------------------------------------------------------------------------

def _dense_prefetch(qv: QueryVectors, limit: int) -> Prefetch:
    return Prefetch(
        query=qv.dense_vector.tolist(),
        using=DENSE_VECTOR_NAME,
        limit=limit,
    )


def _sparse_prefetch(qv: QueryVectors, limit: int) -> Prefetch:
    return Prefetch(
        query=SparseVector(
            indices=qv.sparse_indices.tolist(),
            values=qv.sparse_values.tolist(),
        ),
        using=SPARSE_VECTOR_NAME,
        limit=limit,
    )


def hybrid_search(
    collection: str,
    qv: QueryVectors,
    *,
    top_n_in: int,
    dense_prefetch_limit: int,
    sparse_prefetch_limit: int,
    filters: dict[str, str | list[str]] | None = None,
    debug: bool = False,
) -> HybridSearchResult:
    """Run the hybrid RRF search. When `debug=True`, also issue the two
    extra dense-only and sparse-only queries described in §5 / Stage B'."""
    if dense_prefetch_limit < top_n_in or sparse_prefetch_limit < top_n_in:
        raise ValueError(
            "Each prefetch limit must be >= top_n_in for RRF to be well-defined "
            f"(got dense={dense_prefetch_limit}, sparse={sparse_prefetch_limit}, "
            f"top_n_in={top_n_in})."
        )

    client = _get_client()
    qfilter = build_filter(filters or {})

    fused_response = client.query_points(
        collection_name=collection,
        prefetch=[
            _dense_prefetch(qv, dense_prefetch_limit),
            _sparse_prefetch(qv, sparse_prefetch_limit),
        ],
        query=FusionQuery(fusion=Fusion.RRF),
        query_filter=qfilter,
        limit=top_n_in,
        with_payload=True,
    )
    fused: list[ScoredPoint] = list(fused_response.points)

    dense_ranks: dict[str, int] | None = None
    sparse_ranks: dict[str, int] | None = None
    sanitized: dict[str, Any] | None = None

    if debug:
        dense_ranks = _per_retriever_ranks(
            client, collection,
            prefetch=_dense_prefetch(qv, dense_prefetch_limit),
            top_n_in=top_n_in,
            qfilter=qfilter,
        )
        sparse_ranks = _per_retriever_ranks(
            client, collection,
            prefetch=_sparse_prefetch(qv, sparse_prefetch_limit),
            top_n_in=top_n_in,
            qfilter=qfilter,
        )
        sanitized = {
            "collection_name": collection,
            "limit": top_n_in,
            "query": "FusionQuery(fusion=rrf)",
            "prefetch": [
                {"using": DENSE_VECTOR_NAME, "limit": dense_prefetch_limit,
                 "dim": int(qv.dense_vector.shape[0])},
                {"using": SPARSE_VECTOR_NAME, "limit": sparse_prefetch_limit,
                 "nnz": int(qv.sparse_indices.size)},
            ],
            "query_filter": qfilter.model_dump(exclude_none=True) if qfilter else None,
        }

    return HybridSearchResult(
        fused=fused,
        dense_rank_by_id=dense_ranks,
        sparse_rank_by_id=sparse_ranks,
        sanitized_request_json=sanitized,
    )


# ---------------------------------------------------------------------------
# DEBUG PATH — per-retriever ranks (Stage B', §5)
# ---------------------------------------------------------------------------

def _per_retriever_ranks(
    client: QdrantClient,
    collection: str,
    *,
    prefetch: Prefetch,
    top_n_in: int,
    qfilter: Filter | None,
) -> dict[str, int]:
    """Issue a single-prefetch query_points to recover the 1-based rank of
    each point for that retriever alone. Returns {point_id_str: rank}."""
    response = client.query_points(
        collection_name=collection,
        # For a single-prefetch query, we still need a `query` — Qdrant's
        # convention is to pass the same raw vector at the top level as
        # well as inside prefetch, OR omit the top-level query and let
        # prefetch act as the final source. Using the vector directly at
        # the top level is the cleanest approach for single-channel mode.
        query=prefetch.query,
        using=prefetch.using,
        query_filter=qfilter,
        limit=max(top_n_in, prefetch.limit or top_n_in),
        with_payload=False,
    )
    return {str(p.id): i + 1 for i, p in enumerate(response.points)}


def take_payload_field(points: Iterable[ScoredPoint], key: str, default: Any = None) -> list[Any]:
    """Small helper used by CLI pretty-print + tests."""
    out: list[Any] = []
    for p in points:
        payload = p.payload or {}
        out.append(payload.get(key, default))
    return out


# =============================================================================
# STANDALONE MODE
# =============================================================================
# Usage:
#   python -m graph.retrieval.hybrid_search <collection> "<query>"
# Optional extras:
#   --debug                 — include per-retriever ranks
#   --filter k=v            — may repeat

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    args = sys.argv[1:]
    if len(args) < 2:
        print('Usage: python -m graph.retrieval.hybrid_search <collection> "<query>" [--debug] [--filter k=v]...')
        sys.exit(1)

    collection, query = args[0], args[1]
    debug = "--debug" in args
    filters: dict[str, str | list[str]] = {}
    i = 2
    while i < len(args):
        if args[i] == "--filter" and i + 1 < len(args):
            k, _, v = args[i + 1].partition("=")
            filters[k.strip()] = v.strip()
            i += 2
        else:
            i += 1

    from graph.retrieval.config import get_retrieval_config
    from graph.retrieval.embed_query import embed_query

    cfg = get_retrieval_config()
    qv = embed_query(query, collection=collection, use_glossary=True)
    result = hybrid_search(
        collection=collection,
        qv=qv,
        top_n_in=cfg.rerank_top_n_in,
        dense_prefetch_limit=cfg.hybrid_dense_prefetch,
        sparse_prefetch_limit=cfg.hybrid_sparse_prefetch,
        filters=filters or None,
        debug=debug,
    )

    print(f"Collection : {collection}")
    print(f"Query      : {query!r}")
    print(f"Expanded   : {qv.expanded_query!r}")
    print(f"Filters    : {filters or '(none)'}")
    print(f"top_n_in   : {cfg.rerank_top_n_in}")
    print(f"Fused hits : {len(result.fused)}")
    print()
    print("Top 10 fused (RRF score):")
    for i, p in enumerate(result.fused[:10], start=1):
        source = (p.payload or {}).get("source_doc", "?")
        para = (p.payload or {}).get("paragraph_number", "")
        preview = ((p.payload or {}).get("text", "") or "")[:80].replace("\n", " ")
        print(f"  {i:2d}. rrf={p.score:.4f}  {source} ¶{para}  {preview!r}")
    if debug:
        print()
        print("Debug: per-retriever ranks for the fused top 10:")
        for i, p in enumerate(result.fused[:10], start=1):
            pid = str(p.id)
            d = result.dense_rank_by_id.get(pid) if result.dense_rank_by_id else None
            s = result.sparse_rank_by_id.get(pid) if result.sparse_rank_by_id else None
            print(f"  {i:2d}. dense_rank={d}  sparse_rank={s}")
