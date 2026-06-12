# 13 — Alternative Sparse Encoders (Upgrade Path)

> Active sparse encoder: FastEmbed BM25 (see `06_fastembed_bm25.md`).
> This doc covers upgrade options if BM25 recall proves weak in evaluation.

---

## Why you'd upgrade

BM25 is strong but blind to token importance beyond classical TF-IDF / length normalisation. Learned sparse encoders (SPLADE, BM42) add attention-derived weights so:

- Important tokens get higher weight even when frequency is similar.
- Term expansion (synonyms, related forms) can happen natively.
- On technical / specialised corpora (doctrine), gains can be noticeable.

**Upgrade signal**: evaluation (Phase 4) shows BM25 recall@10 stuck below ~60% on queries that should lexically match, AND dense alone has its own failures.

---

## BM42 (Qdrant's attention-based BM25 successor)

**What it is**: Qdrant team's take on BM25 that uses attention scores from a tiny MiniLM transformer to weight tokens instead of TF. Keeps the sparse vector form; swap-in replacement.

**Strengths**:
- One-line swap in FastEmbed.
- Better on short, terminology-heavy text.
- Still fast at indexing (small model).

**Weaknesses**:
- Newer; less literature validating it vs BM25 generally.
- Results can differ in ways that are hard to debug.

**Swap**:
```python
sparse_model = SparseTextEmbedding(model_name="Qdrant/bm42-all-minilm-l6-v2-attentions")
```
Requires **re-ingesting the whole corpus** (new index values).

---

## SPLADE (SParse Lexical AnD Expansion)

**What it is**: Fine-tuned BERT that outputs expanded sparse vectors — adds related tokens to the vector at encoding time. Industry-standard learned sparse.

**Variants**:
- `prithivida/Splade_PP_en_v1` — PP variant, good default
- `naver/splade-cocondenser-selfdistil` — stronger, heavier

**Strengths**:
- Strongest learned sparse retrieval in many benchmarks.
- Term expansion catches paraphrase that BM25 misses ("vehicle" query matches docs that say "tank" etc.).

**Weaknesses**:
- Heavier: full BERT forward pass per chunk.
- Slower indexing (~5–10× slower than BM25 on CPU).
- GPU helps but increases complexity.

**Swap**:
```python
sparse_model = SparseTextEmbedding(model_name="prithivida/Splade_PP_en_v1")
```
Same interface. Re-ingest the corpus.

---

## miniCOIL

**What it is**: Recent Qdrant project. Learned sparse with aggressive compression.

**Strengths**:
- Smaller vectors (faster queries).
- Competitive quality.

**Weaknesses**:
- Newer, less battle-tested.

**When**: experiment if production query latency becomes a concern.

---

## Upgrade checklist (for when you decide to swap)

1. **Run an eval first.** Don't swap on vibes. Build the eval set in Phase 4. Measure BM25 recall as baseline.
2. **Re-ingest required.** Sparse vector index values are model-specific; cannot partially upgrade.
3. **Keep the old collection temporarily.** Upsert into a second collection with the new encoder. Measure both. Cut over only if new is clearly better.
4. **Update `memory.md`** — change the pinned sparse model name, add a note about when and why.
5. **Dashboard spot-check**: the new sparse vectors will use a different index hash space. If you see drastically different top-weighted tokens, that's expected — the encoders weight differently.

## Combining: multi-sparse (research-grade)

You can upsert TWO sparse vectors per point (`sparse_bm25`, `sparse_splade`) and fuse both into the query along with dense. Gains real but complexity triples. Only worth it if retrieval quality is the make-or-break for the whole project and you've exhausted other levers.

Qdrant supports arbitrary named vectors, so the schema becomes:
```python
vectors_config={"dense": VectorParams(size=3072, distance=Distance.COSINE)},
sparse_vectors_config={
    "sparse_bm25":   SparseVectorParams(),
    "sparse_splade": SparseVectorParams(),
},
```
And the Query API prefetches all three. Not recommended until evaluation justifies it.
