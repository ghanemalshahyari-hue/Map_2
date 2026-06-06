# 06 — FastEmbed BM25 (Sparse Vectors)

> Library: `fastembed` (pinned in `memory.md`).
> Source: `libs/fastembed-*/` (tarball extracted).
> Upstream: https://qdrant.github.io/fastembed/ (accept when online).

---

## What we use it for

Producing **sparse vectors** for every chunk. Sparse vectors = exact-token matching with term weights. Essential for doctrine: acronyms (`COA`, `MDO`), doctrine IDs (`ADP 3-0`), weapon names (`M109A7`), paragraph numbers (`3-12`) — things dense embeddings blur.

## Locked choice

**`Qdrant/bm25` via FastEmbed** — classic BM25 (Okapi-weighted term frequency / inverse document frequency), implemented as a sparse encoder. No neural model, no download, deterministic.

### Why FastEmbed rather than custom BM25
- Single install, same library handles potential upgrades to BM42 / SPLADE later.
- Sparse vector format is the exact shape Qdrant expects.
- Integrated with `qdrant-client`'s `SparseVector` type.

### Why BM25 rather than BM42 / SPLADE at the start
- **Zero model download** — BM25 is a formula, not a trained model.
- **Interpretable** — you can literally print token-weight pairs.
- **Well-understood baseline** — if results disappoint, we KNOW we need to upgrade, rather than wondering if the setup is wrong.
- Upgrade to BM42 / SPLADE is a one-line swap — see `13_alternatives_sparse.md`.

## Install

Already in venv:
```
pip install fastembed
```

## The minimal API we commit to

### Set up the encoder
```python
from fastembed import SparseTextEmbedding

sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")
```

### Encode chunks
```python
texts = [c.text for c in chunks]
sparse_embeddings = list(sparse_model.embed(texts))

for se in sparse_embeddings:
    # se is a SparseEmbedding object with:
    indices = se.indices       # numpy array of token hash indices
    values  = se.values        # numpy array of BM25 weights
```

### Convert to Qdrant's SparseVector for upsert
```python
from qdrant_client.models import SparseVector

def to_qdrant_sparse(se) -> SparseVector:
    return SparseVector(
        indices=se.indices.tolist(),
        values=se.values.tolist(),
    )
```

### Encode a query (same model, query-flag on)
```python
# For query time, BM25 encoding is symmetric — same `.embed()`.
query = "course of action for movement to contact"
query_sparse = list(sparse_model.embed([query]))[0]
```

### Full end-to-end with Qdrant
```python
from qdrant_client.models import PointStruct, SparseVector

points = []
for i, c in enumerate(chunks):
    dense  = dense_vectors[i]              # from OpenAI
    sparse = sparse_embeddings[i]          # from FastEmbed

    points.append(PointStruct(
        id=chunk_id(source_doc, i),
        vector={
            "dense":  dense,
            "sparse": SparseVector(
                indices=sparse.indices.tolist(),
                values=sparse.values.tolist(),
            ),
        },
        payload={...},
    ))

client.upsert(collection_name=..., points=points)
```

## Inspection — sparse vectors are readable!

Unlike dense vectors (opaque 3072 floats), sparse vectors are **interpretable**:

```python
se = sparse_embeddings[0]
# Get top-5 tokens by weight
import numpy as np
top_k_idx = np.argsort(se.values)[-5:][::-1]
for i in top_k_idx:
    print(f"  token_idx={se.indices[i]}  weight={se.values[i]:.4f}")
```

FastEmbed's BM25 implementation hashes tokens into integer indices. You can't trivially inverse-map indices back to the original token text, but:
- Relative weights tell you which tokens dominate.
- Comparing sparse vectors of two related chunks shows which rare terms drive similarity.

Future enhancement: custom wrapper that keeps a `{index: token}` reverse map for full readability. Not needed now.

## BM25 behaviour in one paragraph

Token frequency matters but with diminishing returns (saturation parameter `k1`). Longer chunks get penalised to avoid dominating retrieval (length normalisation `b`). Rare tokens carry more weight (IDF). Stopwords effectively get low weight naturally.

FastEmbed's `Qdrant/bm25` uses default `k1=1.2`, `b=0.75` — Elasticsearch defaults.

## Sparse vector format (Qdrant's view)

```
SparseVector(
    indices = [15, 423, 1082, 19283, ...],      # which "tokens"
    values  = [2.11, 0.87, 1.54, 3.02, ...],    # their BM25 weights
)
```
Length is variable — only non-zero token weights are stored. Very efficient.

## Known gotchas

- **Model cache**: first call to `SparseTextEmbedding("Qdrant/bm25")` may download a small tokenizer model into `~/.cache/fastembed/`. Subsequent calls are instant.
- **Encoding is fast** — no GPU, all CPU. BM25 is just tokenising + counting.
- **Empty text → empty sparse vector**. Filter zero-length chunks.
- **Query text for sparse search should use same model call**. We don't train sparse encoders for asymmetric query/doc behaviour (that's where SPLADE differs).
- **Don't mix models**. If we ever switch to BM42, we must re-index the entire corpus. Don't partially upgrade.

## Upgrade path (noted, not active)

If recall proves weak (evaluated in Phase 4):
1. **BM42** (`Qdrant/bm42-all-minilm-l6-v2-attentions`): attention-weighted sparse, mild-cost upgrade.
2. **SPLADE** (`prithivida/Splade_PP_en_v1`): learned sparse, bigger quality jump, higher compute.

Swap point: change `model_name=` argument. Re-ingest the corpus. See `13_alternatives_sparse.md`.

## Source pointers

- `libs/fastembed-0.8.0/fastembed/sparse/` — SparseTextEmbedding, BM25 implementation
- `libs/fastembed-0.8.0/fastembed/sparse/bm25.py` — BM25 scoring
- `libs/qdrant_client-1.17.1/qdrant_client/models.py` — `SparseVector` dataclass
