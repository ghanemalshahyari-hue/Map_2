# 14 — Dense Embedders (Local) — ACTIVE

> **STATUS (2026-04-17): `BAAI/bge-m3` is the production dense embedder.** 1024-dim, multilingual, 8k context, run locally via FastEmbed (CPU ONNX on Apple Silicon). Replaces the original OpenAI `text-embedding-3-large` plan — see [`05_openai_embeddings.md`](05_openai_embeddings.md) (now inactive).
>
> Rest of this doc surveys alternatives (BGE, E5, Jina, Nomic) for reference.

---

## Why you'd go local

- **Offline / air-gapped requirement.** OpenAI requires internet.
- **Sensitive content.** Doctrine is usually public, but some day a corpus might not be.
- **High-volume re-embedding during experimentation.** If you re-ingest the full corpus 100 times, local cost is zero; OpenAI is ~$65.
- **Latency.** Local embedding on an M4 is ~same speed as OpenAI API for batched loads, faster for ad hoc single-item calls.

---

## BGE family (Beijing Academy of AI)

Top picks:

### `BAAI/bge-large-en-v1.5` — 1024-dim
**Strengths**: Best-in-class general-purpose English dense, competitive with OpenAI `text-embedding-3-small`.
**Weaknesses**: Slightly behind OpenAI `-large` on technical vocabulary.
**Size**: ~1.3 GB model weights. Runs well on MPS/CUDA; usable on CPU.

### `BAAI/bge-small-en-v1.5` — 384-dim
**Strengths**: Tiny (~130 MB), fast on CPU, remarkably competitive.
**Weaknesses**: Loses quality on long / complex text.
**When**: testing / dev / offline fallback.

### `BAAI/bge-m3` — multilingual, multi-vector
**Strengths**: Dense + sparse + multi-vector output from one model. Multilingual.
**Weaknesses**: Larger, heavier. Overkill unless you need multilingual.

**Install + use via FastEmbed** (same library as our sparse):
```python
from fastembed import TextEmbedding

dense_model = TextEmbedding(model_name="BAAI/bge-large-en-v1.5")
vectors = list(dense_model.embed([chunk.text for chunk in chunks]))
# vectors: list[np.ndarray] each length 1024
```

FastEmbed downloads the ONNX-optimised version of the model. Runs on CPU or MPS/CUDA.

---

## E5 family (Microsoft)

### `intfloat/e5-large-v2` — 1024-dim
**Strengths**: Strong on retrieval benchmarks. Matches BGE-large.
**Weaknesses**: Requires "query:" / "passage:" prefix tokens — asymmetric encoding.

**Usage quirk**:
```python
# For documents at index time:
doc_texts = [f"passage: {c.text}" for c in chunks]
# For queries at search time:
query_text = f"query: {user_question}"
```
Forget this prefix and retrieval quality collapses. Easy to get wrong.

---

## Jina embeddings

### `jinaai/jina-embeddings-v3` — 1024-dim, 8k context
**Strengths**: Very long context window (8k tokens). Good multilingual support.
**Weaknesses**: Slightly behind BGE/E5 on pure English retrieval in some benchmarks.
**When**: if chunks might exceed 512 tokens (long tables, dense legal text).

### `jinaai/jina-embeddings-v2-base-en` — 768-dim
**Strengths**: Solid general-purpose.

---

## Nomic embeddings

### `nomic-ai/nomic-embed-text-v1.5` — 768-dim
**Strengths**: Apache 2 licensed, small.
**Weaknesses**: Quality gap vs BGE/E5 is real but not huge.

---

## Dimensionality choices

| Dim | Representative models | Storage/search cost (relative) |
|---|---|---|
| 384 | bge-small | 1× |
| 768 | bge-base, nomic, jina-v2-base | 2× |
| 1024 | bge-large, e5-large, jina-v3 | 2.7× |
| 1536 | OpenAI text-embedding-3-small | 4× |
| 3072 | OpenAI text-embedding-3-large (ours) | 8× |

Higher dim ≠ always better. At our scale, 1024-dim is probably indistinguishable from 3072-dim in practice for most queries. But we're paying ~$0.65 one-time for OpenAI `-large` with no ops cost, so we take the quality ceiling.

---

## Swap procedure (if we go local)

```python
# BEFORE (OpenAI):
from openai import OpenAI
client = OpenAI()
vecs = [d.embedding for d in client.embeddings.create(
    model="text-embedding-3-large", input=texts).data]

# AFTER (BGE via FastEmbed):
from fastembed import TextEmbedding
dense_model = TextEmbedding(model_name="BAAI/bge-large-en-v1.5")
vecs = [v.tolist() for v in dense_model.embed(texts)]
```

Also update Qdrant collection config: `VectorParams(size=1024, ...)` instead of 3072. Must **recreate the collection** — you can't change vector dim on an existing one. Re-ingest all docs.

---

## Hybrid strategy: OpenAI online, BGE offline

A pragmatic pattern:
- Dev and prod: OpenAI `-large` for best quality.
- Offline / air-gapped fallback: BGE-large embedded in the code path.

Implemented as a config switch in `_get_dense_embedder()`:
```python
def _get_dense_embedder():
    if os.getenv("USE_LOCAL_EMBEDDER") == "1":
        return LocalBGEEmbedder()
    return OpenAIEmbedder()
```

Both must produce the same vector dim, OR you maintain two separate collections. Not recommended casually — usually cheaper to stick with one.

---

## Decision tree

```
Do you have reliable internet?
├── Yes + quality matters most → OpenAI text-embedding-3-large (current)
├── Yes but cost at scale matters → switch to bge-large-en-v1.5 (BGE/local)
├── No (air-gapped) → bge-large-en-v1.5 mandatory
└── No + tight memory → bge-small-en-v1.5 (384-dim, tiny)
```

None of these affect the chunker, Qdrant schema, or graph flow beyond the one-line swap at embed time and the dim change on collection creation.
