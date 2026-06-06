# 04 — Qdrant (Vector DB) — Hybrid Search

> Source of truth: `libs/qdrant-client/` + running Qdrant server.
> Official docs acceptable when online: https://qdrant.tech/documentation/
> Pinned versions live in `memory.md`.

---

## What it is

Qdrant is an open-source vector search engine written in Rust, with a Python client. We use it as the single store for all chunks. Each chunk becomes a **Point** with two named vectors (dense + sparse) and a metadata payload.

## Why we chose it

- **Native hybrid search**: multiple vectors per point + built-in fusion (RRF, DBSF) in one query.
- **Dashboard**: `http://localhost:6333/dashboard` — browse collections, click points, see vectors + payloads.
- **Single Docker container** to run locally; no ops.
- **Payload filtering** is first-class — essential for per-folder, per-doc, per-section narrowing.
- **Storage efficient** — quantisation available if we ever need it.

## When to NOT use it (swap triggers)

- Need to run inside an existing Postgres → pgvector + PG FTS.
- Need managed cloud + GraphQL → Weaviate.
- Billion+ scale with specialised ops → Milvus.
- See `12_alternatives_databases.md` for full comparison.

## Running Qdrant locally

We use Docker via colima on Mac. See `transferOS.md` for Linux/Windows.

### Start the server
```bash
docker run -d \
  --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  -v qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest
```
- `6333` = REST + dashboard
- `6334` = gRPC
- Named volume `qdrant_storage` persists data across restarts.

### Dashboard
Open `http://localhost:6333/dashboard` in a browser. See collections, points, vectors, payloads.

### Stop / start later
```bash
docker stop qdrant      # preserves data in the volume
docker start qdrant     # resumes
docker logs qdrant      # inspect server logs
```

### Fully reset (wipe all data)
```bash
docker rm -f qdrant
docker volume rm qdrant_storage
```

## The minimal API we commit to

### Client setup
```python
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, SparseVectorParams,
    PointStruct, SparseVector,
    Prefetch, FusionQuery, Fusion, Filter, FieldCondition, MatchValue,
)

client = QdrantClient(url="http://localhost:6333")
```

### Create a collection with hybrid (named) vectors
```python
from qdrant_client.models import (
    Distance, VectorParams, SparseVectorParams, Modifier, PayloadSchemaType,
)

client.create_collection(
    collection_name="ingest__doctrine__bgem3",
    vectors_config={
        "dense": VectorParams(size=1024, distance=Distance.COSINE),
    },
    sparse_vectors_config={
        "sparse": SparseVectorParams(modifier=Modifier.IDF),
    },
    on_disk_payload=True,
)
```
- `dense` size=1024 matches bge-m3 (locked in `memory.md` — supersedes
  the earlier OpenAI `text-embedding-3-large` plan that used 3072).
- `sparse` needs no dimension, **but must set `modifier=Modifier.IDF`**.
  FastEmbed `Qdrant/bm25` sets `requires_idf=True`
  (`libs/fastembed-0.8.0/fastembed/sparse/bm25.py:55`) and the model
  docstring states it is *"expected to be used with `modifier=\"idf\"`
  in the sparse vector index of Qdrant"* (line 65), with IDF *"computed
  on Qdrant's side"* (line 71). The embedder emits raw term-frequency
  counts; without the modifier, Qdrant scores them as TF-only and BM25
  collapses. This is a correctness bug, not a performance one — RRF
  hybrid fusion starts favouring common words.
- `on_disk_payload=True` keeps payload text on disk. Indexes (dense HNSW,
  sparse inverted, payload keyword) stay in RAM where search uses them.
  Fits our disk-backed state policy and scales without thought to a full
  doctrine corpus (~50k–100k chunks).

### Three index layers, three jobs — what each does
The pipeline relies on three distinct indexes that Qdrant maintains
independently. Understanding the split is the difference between
"retrieval is slow" and knowing exactly which layer to tune.

1. **Dense vector index (HNSW)** — approximate k-nearest-neighbour over
   the 1024-dim bge-m3 space. Handles *semantic* similarity. Built
   automatically from the `vectors_config`. Speed/recall knobs: `m`,
   `ef_construct`, `ef` (search-time). We keep defaults in Phase 1 — no
   tuning without a retrieval eval to show recall@k is actually
   suffering. Premature tuning is guaranteed to cost memory and may cost
   recall.
2. **Sparse vector index (inverted)** — BM25 over FastEmbed-tokenised
   terms. Handles *lexical* retrieval: exact doctrine phrases,
   acronyms, numbered paragraph refs. Built automatically from the
   `sparse_vectors_config`. The `modifier=Modifier.IDF` setting is what
   turns the raw TF counts into real BM25 scores at query time.
3. **Payload indexes (per-field)** — structured-metadata filters
   (`source_doc == "ADP-3-0.pdf"`, `chunk_type == "table"`). These are
   *not* built automatically. Without an index, a filter is a full
   collection scan, and it also limits the query planner's ability to
   combine filter+vector-search efficiently. An index turns the filter
   into a keyword lookup and lets Qdrant prune the HNSW search space.

A fourth "non-index" decision — `on_disk_payload=True` — is about where
payload *data* lives (disk, lazy-loaded on hit), not about how it's
searched.

### Payload indexes — what we build now (Phase 1 scope)
Phase 1 indexes exactly five fields, chosen on the principle *"index
what we are confident will be queried, not what we might filter on
later."*

```python
# Build immediately after create_collection, before the first upsert.
# On an empty collection this is effectively free; post-upsert it forces
# a collection-wide rebuild.
for field, schema in [
    ("source_doc",        PayloadSchemaType.KEYWORD),  # hottest — every hash-gated re-ingest
    ("chunk_type",        PayloadSchemaType.KEYWORD),  # tiny cardinality, index effectively free
    ("paragraph_number",  PayloadSchemaType.KEYWORD),  # doctrine lookup
    ("paragraph_numbers", PayloadSchemaType.KEYWORD),  # list field — KEYWORD indexes each element
    ("cross_refs",        PayloadSchemaType.KEYWORD),  # list field
]:
    client.create_payload_index(
        collection_name="ingest__doctrine__bgem3",
        field_name=field,
        field_schema=schema,
    )
```

`source_doc` is the single most important index in the whole pipeline:
every hash-gated re-ingest cycle issues a *query-by-source_doc* plus a
*delete-by-filter-on-source_doc* for each document. Unindexed, that's
two full collection scans per re-ingested doc — at 50k–100k chunks this
is the dominant cost.

### Payload indexes — what we are NOT building in Phase 1
Documenting these so a future chat does not quietly re-add them:

| Field | Why deferred |
|---|---|
| `text` | The sparse BM25 vector already handles lexical retrieval; a full-text payload index would duplicate that work for extra storage. |
| `heading_path` | Retrieval-time filter ("everything under Chapter 3"). Phase 2 eval decides if it actually matters. |
| `source_folder` | One-collection-per-folder means `source_folder` is constant within a collection — no discriminatory power. |
| `doc_content_hash` | Read back from the payload *after* filtering on `source_doc`; never the filter key. |
| `page_numbers` | Rarely filtered. |
| `chunk_index` | Added when retrieval starts using neighbour-context expansion (±N around a hit). |
| `expansion_hints` | Audit-only, never filtered. |

Also deferred at the collection level: **no quantization** (scalar or
binary) until retrieval eval shows the recall trade-off is acceptable;
**no tenant indexing** (`is_tenant=True` on keyword indexes is for
multi-tenant *within* one collection — we have one collection per
folder, so tenancy is moot); **no full-text index** on any string field.

See the **Indexing** row in `memory.md` for the locked policy.

### Upsert a chunk (with deterministic ID — Q4 locked)
```python
import hashlib, uuid

def chunk_id(source_doc: str, chunk_index: int) -> str:
    # Deterministic UUID5 from a stable string → re-ingesting overwrites.
    ns = uuid.UUID("00000000-0000-0000-0000-000000000000")
    return str(uuid.uuid5(ns, f"{source_doc}::{chunk_index}"))

client.upsert(
    collection_name="folder_2a_both_relevant",
    points=[
        PointStruct(
            id=chunk_id(source_doc, chunk_index),
            vector={
                "dense": dense_vec,                       # list[float] length 1024 (bge-m3)
                "sparse": SparseVector(indices=si, values=sv),
            },
            payload={
                "text": chunk.text,
                "heading_path": chunk.meta.headings,
                "page_numbers": [...],
                "source_doc": source_doc,
                "source_folder": source_folder,
                "chunk_index": chunk_index,
                "chunk_type": "body",
            },
        ),
    ],
)
```

### Hybrid query with RRF fusion
```python
result = client.query_points(
    collection_name="folder_2a_both_relevant",
    prefetch=[
        Prefetch(query=dense_query_vec,  using="dense",  limit=20),
        Prefetch(query=SparseVector(indices=qi, values=qv),
                 using="sparse", limit=20),
    ],
    query=FusionQuery(fusion=Fusion.RRF),
    limit=10,
    with_payload=True,
)

for point in result.points:
    print(point.id, point.score, point.payload["text"][:80])
```
- Prefetches independently retrieve top-20 from dense and sparse.
- Fusion reranks combined pool with RRF; returns top-10.

### Filter by metadata (e.g. only one doc, only tables)
```python
client.query_points(
    collection_name="folder_2a_both_relevant",
    prefetch=[
        Prefetch(query=dense_query_vec, using="dense", limit=20),
        Prefetch(query=sparse_query,    using="sparse", limit=20),
    ],
    query=FusionQuery(fusion=Fusion.RRF),
    query_filter=Filter(
        must=[
            FieldCondition(key="source_doc", match=MatchValue(value="ADP-3-0-Operations.pdf")),
            FieldCondition(key="chunk_type", match=MatchValue(value="body")),
        ]
    ),
    limit=10,
)
```

## Collection naming (Q3 locked: one per folder)

Collection name = sanitised folder name. We normalise to:
- lowercase
- spaces → underscores
- strip non-`[a-z0-9_-]`

Examples:
- `inputs/doctrine` → `doctrine`
- `/Users/hextechkraken/Desktop/docs` → `docs`

Live helper (to implement in code):
```python
import re
def collection_name_for(folder_path: str) -> str:
    base = os.path.basename(folder_path.rstrip("/"))
    return re.sub(r"[^a-z0-9_-]", "_", base.lower())
```

## Inspecting stored data

### Via dashboard
`http://localhost:6333/dashboard` → pick collection → click any point. Expand vectors. See payload. Filter by payload field.

### Via Python (quick peek)
```python
points, _ = client.scroll(
    collection_name="folder_2a_both_relevant",
    limit=5,
    with_payload=True,
    with_vectors=True,
)
for p in points:
    print(p.id, p.payload["heading_path"], len(p.vector["dense"]))
```

### CLI peek script (to build later)
`scripts/peek_qdrant.py` — prints N random points with text preview + sparse top-k tokens + dense vector norm.

## Known gotchas

- **Named vectors vs single vector.** Older Qdrant docs show `vector=` as a list (single vector). With named vectors, it's a dict `{"dense": [...], "sparse": SparseVector(...)}`. Don't mix shapes.
- **Deterministic IDs must be UUIDs or positive ints.** We use `uuid.uuid5`. Qdrant rejects arbitrary strings.
- **`query_points` vs legacy `search`.** New Query API (`query_points`) supports prefetch + fusion; old `search` doesn't. Use the new one.
- **Fusion mode choice**: RRF (default, rank-based) vs DBSF (score-distribution based). Start with RRF. DBSF can be better when score distributions are well-calibrated — not usually our case.
- **Port 6333 in use?** Check `lsof -i :6333`. Kill or change port.
- **Apple Silicon Docker (colima)**: containers run `aarch64`. Qdrant has an arm64 image — works natively, no emulation.

## Source pointers

- `libs/qdrant-client/qdrant_client/qdrant_client.py` — top-level client
- `libs/qdrant-client/qdrant_client/http/models/models.py` — `PointStruct`, `Filter`, `Prefetch`, `FusionQuery`
- `libs/qdrant-client/qdrant_client/conversions/common_types.py` — sparse vector helpers
