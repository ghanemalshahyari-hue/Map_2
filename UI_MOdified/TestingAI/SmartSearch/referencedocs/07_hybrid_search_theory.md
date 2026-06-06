# 07 — Hybrid Search Theory (Why Dense + Sparse, and How Fusion Works)

> Theoretical background on why we store BOTH dense and sparse vectors and
> how Qdrant combines them at query time. Implementation details live in
> `04_qdrant_hybrid_search.md`. This doc answers "why are we doing it this way?"

---

## The core problem

A single-vector retrieval system fails in two distinct ways:

### Dense-only failure
Query: `"What is COA?"` → embedding encodes this semantically as "question about courses of action or similar". In doctrine chunks that *use* the abbreviation COA heavily but never define it, the dense similarity is high. In the one chunk that explicitly defines "COA — Course of Action", the dense similarity may be *lower* because the chunk is short and context-free.

**Root cause**: dense embeddings smooth out the exact-token signal. Rare technical tokens (acronyms, IDs) lose their discriminating power.

### Sparse-only failure
Query: `"How does a platoon handle a situation where contact is made while moving"` → a sparse (BM25) query matches chunks that share the exact tokens "platoon", "contact", "moving". Misses a chunk titled "3-12. Movement to Contact" which uses different phrasing entirely.

**Root cause**: sparse retrieval doesn't understand paraphrase.

### The symmetry
Neither is "better" in general. They fail on **different** queries, in **opposite** directions.

## The fix: run both, combine ranks

Hybrid retrieval runs each retriever independently, then fuses their result lists into a single ranked list. Two common fusion methods:

### Reciprocal Rank Fusion (RRF) — what we use
```
score(doc) = Σ  1 / (k + rank_r(doc))    for each retriever r
```
Where:
- `rank_r(doc)` = doc's rank in retriever r's result list (1 = best)
- `k` = smoothing constant (Qdrant defaults to 60)

Properties:
- Uses only **ranks**, not raw scores. Robust to score distribution differences between retrievers.
- Each retriever contributes positively only if it ranks the doc highly.
- Docs appearing in both top-k lists get a strong boost.

Why it works so well: the retrievers are *complementary*. A doc that's easy to find semantically and impossible lexically gets a top dense rank and no sparse rank → high dense contribution, nothing from sparse. A doc that's the opposite pattern gets the mirror. A doc that's *both* (the actual answer to a mixed query) gets boosts from both — and wins.

### Distribution-Based Score Fusion (DBSF) — alternative
Normalises each retriever's score distribution (z-score or min-max), then sums. More sensitive to score calibration between retrievers — works well when you've tuned both carefully.

We start with RRF because:
- No calibration needed
- Well-established in IR literature (Cormack et al. 2009)
- Qdrant's default, battle-tested

## How it maps to our implementation

Qdrant's Query API runs both retrievers internally and fuses:

```python
result = client.query_points(
    collection_name="folder_name",
    prefetch=[
        Prefetch(query=dense_query,  using="dense",  limit=20),   # retriever 1
        Prefetch(query=sparse_query, using="sparse", limit=20),   # retriever 2
    ],
    query=FusionQuery(fusion=Fusion.RRF),   # fuse with RRF
    limit=10,                                # final top-k after fusion
)
```

- Each prefetch fetches its own top-20.
- Fusion reranks the union (up to 40 docs) using RRF.
- Final top-10 returned.

**Rule of thumb on prefetch sizes**: fetch 2-3× your desired final top-k from each retriever. We use 20 each → 10 final. Small enough to be fast, big enough that the union is likely to contain every genuinely relevant doc.

## Why not just concatenate dense + sparse into one vector?

Tempting idea, doesn't work:
- Dense vectors are normalised continuous floats around `±0.1` each.
- Sparse vectors have concentrated weights around `1–5` on a handful of indices, zero elsewhere.
- Cosine similarity on concatenated vectors is dominated by whichever side has bigger magnitudes → one retrieval mode effectively wins.
- You also lose the ability to use different distance metrics per vector.

Named vectors + prefetch + fusion is the correct architecture. Qdrant built this feature specifically for hybrid.

## When hybrid doesn't help (honest caveat)

If your corpus has no rare technical vocabulary AND queries are always paraphrase-heavy → sparse adds noise, dense alone is fine. Not our case.

If your corpus is all IDs/codes AND queries are always exact-token → dense is a tax; sparse alone works. Not our case either.

Doctrine / technical documentation sits squarely in the "need both" zone.

## Evaluation (Phase 4, flagged for future)

We will not know the dense/sparse mix is right without a ground-truth eval set. Plan:
1. Build 20–50 queries with expected paragraph references (manual, from doctrine).
2. Measure precision@5 / recall@10 for:
   - dense alone
   - sparse alone
   - hybrid (RRF)
   - hybrid (DBSF)
3. Lock the winner; swap sparse model (BM25 → BM42 → SPLADE) if hybrid still weak.

## Sources / further reading (accept when online)

- Cormack, Clarke, Büttcher (2009) — *Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods*
- Qdrant Query API docs: https://qdrant.tech/documentation/concepts/hybrid-queries/
- Sparse vs dense comparison: https://qdrant.tech/articles/sparse-vectors/
