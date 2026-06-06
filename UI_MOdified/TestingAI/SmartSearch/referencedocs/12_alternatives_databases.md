# 12 — Alternative Vector Databases (Not Chosen)

> Active DB: Qdrant (see `04_qdrant_hybrid_search.md`).

---

## Weaviate

**What it is**: Open-source vector DB with GraphQL API, native hybrid (BM25 + dense).

**Strengths**:
- Hybrid search first-class.
- Module system for built-in embedders (auto-embed on upsert if desired).
- Can scale to production clusters.

**Weaknesses**:
- GraphQL API adds cognitive overhead vs Qdrant's REST/gRPC.
- Dashboard less polished than Qdrant's.
- Heavier resource footprint.

**When to swap**: if you want server-side embedding pipelines (upload raw text, let Weaviate embed). Not a strong reason for us — we control embedding explicitly.

---

## Milvus

**What it is**: High-scale open-source vector DB used in enterprise.

**Strengths**:
- Proven at billion-vector scale.
- Multi-vector hybrid supported.
- Strong community, IBM Cloud Research backing.

**Weaknesses**:
- More services to operate (etcd, MinIO, pulsar on some configs).
- Docker Compose rather than one container.
- Overkill for our scale (at most millions of vectors).

**When to swap**: if we ever cross 100M vectors or need enterprise HA features. Not in sight.

---

## pgvector (+ Postgres full-text search)

**What it is**: pgvector extension for Postgres + Postgres's `tsvector` / BM25 variant for sparse.

**Strengths**:
- Single database for everything (structured metadata + vectors + text search).
- Familiar SQL for querying.
- Runs anywhere Postgres runs.

**Weaknesses**:
- Hybrid fusion is DIY — no built-in RRF; you write the SQL to union dense and sparse results and rank manually.
- Sparse support is via Postgres FTS which isn't BM25 by default (you can install `pg_bm25` or `paradedb` but that's another dependency).
- Scaling vector index config requires tuning.

**When to swap**: if you already run Postgres and want to consolidate. A real choice for production apps; less appealing for a greenfield research project.

**Minimum install** if we went this way:
```
pg_ivfflat or pg_hnsw index on embedding column
tsvector column with GIN index on full-text
manual RRF query
```

---

## Chroma

**What it is**: Simple vector DB, "get started in 5 minutes" ethos.

**Strengths**:
- Easiest setup. `pip install chromadb`, done.
- Fine for small-scale dev.

**Weaknesses**:
- Hybrid support is limited; no first-class sparse vectors with RRF.
- Not designed for the scale we're heading to.

**When to swap**: never for this project. Chroma is good for prototyping a chatbot over a few docs; we're past that.

---

## Elasticsearch / OpenSearch

**What it is**: Search engines that added dense vector support.

**Strengths**:
- Mature BM25 implementation (actually the reference BM25).
- Hybrid via RRF supported in ES 8.9+ and OpenSearch 2.10+.
- Battle-tested at huge scale.

**Weaknesses**:
- JVM-based — heavier memory footprint.
- Operational complexity. Overkill for our needs.
- Dashboard (Kibana) is not as vector-native as Qdrant's.

**When to swap**: if the broader org already uses ES/OpenSearch and consolidation matters. Not our situation.

---

## LanceDB

**What it is**: Embedded vector DB built on Lance format, designed for local-first.

**Strengths**:
- No server — purely embedded in the app.
- Good performance.
- Hybrid support recently added.

**Weaknesses**:
- Hybrid story less mature than Qdrant.
- No dashboard — inspection means writing CLI scripts.
- Smaller community.

**When to swap**: if you want zero-ops — literally no Docker, no server. Gives up the dashboard. Our stated requirement to "see the vectors" makes this a no.

---

## Decision tree (if swapping)

```
Is Qdrant causing pain?
├── Dashboard / UX issues → unlikely, Qdrant's is excellent
├── Scale pressure (> 50M vectors) → Milvus
├── Ops simplification wanted → pgvector if Postgres is in the stack
├── Need purely embedded, no server → LanceDB (sacrifice dashboard)
└── Want managed + GraphQL → Weaviate cloud
```

For our usage profile (100k–10M vectors, local dev, dashboard-heavy inspection), Qdrant is the clear choice and unlikely to be swapped.
