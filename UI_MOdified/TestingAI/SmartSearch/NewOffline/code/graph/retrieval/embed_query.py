"""graph/retrieval/embed_query.py
=================================
Stage A of the retrieval pipeline — produce the dense + sparse
query vectors that Stage B feeds into Qdrant's `query_points`.

BOTH CHANNELS USE `query_embed`, NOT `embed`:
  - Sparse (BM25): `query_embed()` assigns weight 1.0 to each
    query token; IDF is applied server-side by Qdrant (we set
    `modifier=Modifier.IDF` on the sparse index at ingest time).
    Calling `embed()` at query time would compute TF weights
    — technically wrong at query time and silently degrades BM25
    scoring.
  - Dense (bge-m3): `query_embed()` is identical to `embed()` for
    our custom-model registration, but calling the query-specific
    method is the right default in case a future model swap
    introduces query/passage asymmetry.

GLOSSARY EXPANSION (§6.1):
  Applied BEFORE embedding, to both channels. The dense channel
  embeds the expanded text directly; the sparse channel also
  sees the expansion (`ACRO (expansion)`) so both the acronym
  and its spelled-out form land as separate sparse tokens.

HyDE is handled by `hyde.py`, NOT here. When `use_hyde=True`,
`search.py` will substitute the HyDE document for the dense
channel's text before calling into this module.

SHARED SINGLETONS:
  Both embedders come from `graph.shared.embedders`, reusing the
  same process-level instances Phase 1 ingestion uses. See §10.5.

STANDALONE RUN:
  python -m graph.retrieval.embed_query <collection> "<query>"
"""
from __future__ import annotations

import sys
from dataclasses import dataclass

import numpy as np

from graph.retrieval.config import get_retrieval_config
from graph.retrieval.glossary import Glossary, expand_query, get_glossary_for_collection
from graph.shared.embedders import _get_dense_embedder, _get_sparse_embedder


@dataclass(frozen=True)
class QueryVectors:
    """Result of Stage A."""
    # Original user query (after any glossary expansion, before HyDE).
    # Used by the sparse channel and reported in debug output.
    expanded_query: str

    # Dense text is kept separate because HyDE substitutes it with a
    # hypothetical document while sparse keeps the expanded query.
    dense_text: str

    dense_vector: np.ndarray          # shape (1024,) float32
    sparse_indices: np.ndarray        # shape (nnz,) int32
    sparse_values: np.ndarray         # shape (nnz,) float32


def embed_query(
    query: str,
    *,
    collection: str,
    use_glossary: bool = True,
    dense_text_override: str | None = None,
) -> QueryVectors:
    """Produce the dense + sparse query vectors for one query.

    Args:
        query: The raw user query string.
        collection: Full Qdrant collection name (e.g.
            "ingest__doctrine__bgem3"). Used to look up the
            glossary when `use_glossary=True`.
        use_glossary: Apply acronym expansion if the collection
            has any entries.
        dense_text_override: If provided, this replaces
            `expanded_query` as the DENSE channel's input. Used
            by HyDE to embed a hypothetical document instead of
            the user query. The sparse channel always uses
            `expanded_query` so BM25 keeps the user's wording.
    """
    cfg = get_retrieval_config()  # currently unused here, but resolved
                                  # for parity with other modules.
    _ = cfg                       # keep singleton touched; no-op.

    expanded = query
    if use_glossary:
        glossary: Glossary = get_glossary_for_collection(collection)
        expanded = expand_query(query, glossary)

    dense_text = dense_text_override if dense_text_override is not None else expanded

    dense_vec = _dense_query_vector(dense_text)
    sparse_idx, sparse_val = _sparse_query_vector(expanded)

    return QueryVectors(
        expanded_query=expanded,
        dense_text=dense_text,
        dense_vector=dense_vec,
        sparse_indices=sparse_idx,
        sparse_values=sparse_val,
    )


# ---------------------------------------------------------------------------
# INTERNALS
# ---------------------------------------------------------------------------

def _dense_query_vector(text: str) -> np.ndarray:
    """Return a single 1024-d float32 dense query vector."""
    vecs = list(_get_dense_embedder().query_embed(text))
    if not vecs:
        raise RuntimeError("Dense embedder returned no vectors for query.")
    return np.asarray(vecs[0], dtype=np.float32)


def _sparse_query_vector(text: str) -> tuple[np.ndarray, np.ndarray]:
    """Return (indices, values) for the sparse query vector.

    query_embed() is used deliberately — see module docstring.
    BM25's query_embed sets values to 1.0, leaving IDF to Qdrant.
    """
    sparse_list = list(_get_sparse_embedder().query_embed(text))
    if not sparse_list:
        raise RuntimeError("Sparse embedder returned no vectors for query.")
    se = sparse_list[0]
    indices = np.asarray(se.indices, dtype=np.int32)
    values = np.asarray(se.values, dtype=np.float32)
    return indices, values


# =============================================================================
# STANDALONE MODE
# =============================================================================

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    if len(sys.argv) < 3:
        print('Usage: python -m graph.retrieval.embed_query <collection> "<query>"')
        sys.exit(1)

    collection = sys.argv[1]
    query = sys.argv[2]

    qv = embed_query(query, collection=collection, use_glossary=True)
    print(f"Collection     : {collection}")
    print(f"Query          : {query!r}")
    print(f"Expanded query : {qv.expanded_query!r}")
    print(f"Dense text     : {qv.dense_text!r}")
    print(f"Dense shape    : {qv.dense_vector.shape}  dtype={qv.dense_vector.dtype}")
    print(f"Dense norm     : {float(np.linalg.norm(qv.dense_vector)):.4f}")
    print(f"Sparse nnz     : {qv.sparse_indices.size}")
    if qv.sparse_indices.size:
        print(f"Sparse values  : min={qv.sparse_values.min():.3f} max={qv.sparse_values.max():.3f}")
