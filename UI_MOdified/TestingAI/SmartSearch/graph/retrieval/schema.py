"""graph/retrieval/schema.py
============================
Immutable dataclasses defining the `search()` contract.

One definition per type — consumed by the CLI smoke tests, the
Streamlit UI, and any future Phase 3 consumer. Fields mirror
referencedocs/17_phase2_retrieval.md §3 exactly.

Design notes that bit us in earlier drafts (keep in mind when
reading this file):
  - `heading_path` is a joined string ("A > B > C"), NOT a list —
    Phase 1 serialises it that way in
    `graph/nodes/chunk_document.py`.
  - `dense_rank` / `sparse_rank` are NOT returned by a fused
    query_points call. They are populated ONLY when
    `SearchRequest.debug=True`, which triggers the two extra
    dense-only / sparse-only queries described in §5 of the
    design doc.
  - Every dataclass is `frozen=True`; a SearchResponse is a
    snapshot, not a mutable buffer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SearchRequest:
    """Input to `search()`.

    `filters` keys MUST be one of the five KEYWORD-indexed payload
    fields built in Phase 1: source_doc, chunk_type,
    paragraph_number, paragraph_numbers, cross_refs. Any other key
    is rejected at call time (in `search.py`) rather than silently
    doing a full-collection scan.
    """
    query: str
    collection: str

    filters: dict[str, str | list[str]] = field(default_factory=dict)

    top_n_in: int = 50
    top_k_out: int = 8

    use_reranker: bool = True
    use_glossary: bool = True       # cheap, lossless
    use_hyde: bool = False          # experimental; see §6.2

    debug: bool = False             # unlocks Stage B' — extra queries


@dataclass(frozen=True)
class SearchHit:
    """One ranked result returned by `search()`."""
    point_id: str
    text: str
    heading_path: str               # joined string, not list[str]
    source_doc: str
    page_numbers: list[int]
    chunk_type: str
    chunk_index: int
    paragraph_number: str | None
    paragraph_numbers: list[str]
    cross_refs: list[str]

    rrf_score: float
    rerank_score: float | None = None

    # Populated only when SearchRequest.debug=True.
    dense_rank: int | None = None
    sparse_rank: int | None = None

    final_rank: int = 0             # 1-based position in SearchResponse.hits


@dataclass(frozen=True)
class SearchResponse:
    """Output of `search()`.

    Debug telemetry (`timings_ms`, `expanded_query`, `hyde_document`,
    `qdrant_request_json`) is populated iff `request.debug=True`.
    """
    request: SearchRequest
    hits: list[SearchHit]

    timings_ms: dict[str, float] | None = None
    expanded_query: str | None = None
    hyde_document: str | None = None
    qdrant_request_json: dict[str, Any] | None = None


# The set of payload keys `search()` is allowed to filter on. Any
# filter key not in this set raises before any Qdrant call.
ALLOWED_FILTER_KEYS: frozenset[str] = frozenset(
    {"source_doc", "chunk_type", "paragraph_number", "paragraph_numbers", "cross_refs"}
)
