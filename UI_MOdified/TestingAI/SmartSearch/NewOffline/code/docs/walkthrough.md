# Pipeline Walkthrough

> Full pipeline design doc covering **Phase 1 ingestion** (§1–§7) and
> **Phase 2 retrieval** (§8). Read this before editing `main.py`,
> `ui/app.py`, or anything under `graph/`. For the locked decisions and
> version pins, see [`memory.md`](memory.md). For the file layout, state
> fields, and collection map, see [`structure.md`](structure.md). For the
> locked Phase 2 design rationale and R1–R7 spike evidence, see
> [`../referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md).
>
> **Phase 3 (template-driven document generation)** is scoped but
> not yet implemented — start at
> [`phase3_walkthrough.md`](phase3_walkthrough.md) and
> [`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md).
> This walkthrough covers Phases 1 and 2 only.

---

## 1. What We Are Building

A pipeline that:

1. Takes a folder of documents (`.txt`, `.pdf`, `.docx` — anything Docling can parse).
2. **Parses** each document into a structured form — preserving sections, tables, page numbers.
3. **Chunks** the parsed content into semantically self-contained pieces sized for the embedding model.
4. **Embeds** each chunk twice:
   - **Dense vector** (meaning) — local `BAAI/bge-m3` (1024-dim, multilingual, 8k context) via FastEmbed.
   - **Sparse vector** (exact tokens) — FastEmbed `Qdrant/bm25`.
5. **Stores** every chunk in Qdrant with both vectors + metadata (source doc, heading path, page numbers, etc.).
6. Lets you **inspect** everything — parsed output on disk, chunks on disk, stored vectors in the Qdrant dashboard.

One folder under `inputs/` becomes one Qdrant collection named
`ingest__<slug>__bgem3`.

**Phase 2 retrieval is built** (see §8). **Phase 3 (template-driven
document generation) is scoped but not yet implemented** — it consumes
Phase 2's `search(SearchRequest) → SearchResponse` as its only
integration seam, walks a YAML template per document, dispatches each
schema field by one of five kinds (`static`, `computed`, `input`,
`derived`, `retrieved`), and emits four Arabic `.docx` files per run
(OPORD, Staff Estimates, Time Analysis, Initial Planning Guidance).
Design lives in
[`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md);
orientation in [`phase3_walkthrough.md`](phase3_walkthrough.md).

---

## 2. Why This Architecture

### Why a parser layer (Docling)
Reading `.txt` is trivial. Reading a 300-page doctrine PDF is not. Tables, headings, footnotes, page numbers, classification markings — a parser has to recover all of this as structure, not flatten it to a wall of text. Docling outputs a typed `DoclingDocument` that preserves hierarchy, tables, and page references.

### Why a chunker layer (HybridChunker)
Embedding models have finite input windows (8k tokens for bge-m3). Retrieval quality collapses when chunks are too big (the vector averages everything) or too small (no context). HybridChunker splits on section boundaries, respects tables as atomic units, and is tokenizer-aware — chunks come out the right size for the embedder.

### Why hybrid search (dense + sparse)
- **Dense** catches *semantic* matches: "what's the cost?" retrieves "the total is $45k" even without the word "cost."
- **Sparse** catches *exact-token* matches: acronyms (`COA`, `MDO`), doctrine IDs (`ADP 3-0`), weapon names (`M109A7`), paragraph numbers (`3-12`) — things dense embeddings blur.
- **Hybrid** runs both, fuses the ranks with RRF (Reciprocal Rank Fusion), and returns the best of both.

For doctrine content especially, you cannot skip sparse. A dense-only system will miss every exact-term query.

### Why Qdrant
- Native hybrid search via **named vectors** (one collection, multiple vectors per point).
- Built-in RRF/DBSF fusion in a single API call.
- **Dashboard** at `localhost:6333/dashboard` lets you browse every stored point, see both vectors, and read payloads.
- Single Docker container, or embedded in-memory for tests.

### Why `BAAI/bge-m3` (local) for dense
- **Zero cloud dependency for embedding.** The only remaining cloud call is the LLM used by `check_documents` (and future QA).
- **1024-dim, multilingual**, strong on technical vocabulary, 8k-token context — handles large chunks without truncation.
- **Emitted natively by FastEmbed** — one install covers both encoders.
- Model weights (~2.3 GB) cache under `~/.cache/fastembed/` on first run.
- Loaded via `TextEmbedding.add_custom_model()` pointing at `aapot/bge-m3-onnx` (FastEmbed 0.8.0 does not ship bge-m3 in its built-in registry).

### Why BM25 via FastEmbed for sparse
- No model weights to download — BM25 is a statistical method encoded via the FastEmbed library.
- Interpretable: a sparse vector is `{token_id: weight}`. You can literally read it.
- Upgrade path to SPLADE or Qdrant's BM42 is a one-line swap if recall is weak.

### Why `initialpages_convert` runs before the gate
LangChain `ChatOpenAI` accepts text only — it cannot read a raw PDF. Without
a preview, `check_documents` would see only the placeholder
`"[Binary document — content to be extracted by the parser (<N> KB)]"` for
every PDF/DOCX and have no way to judge topic. `initialpages_convert` runs
Docling on the first 10 pages and writes a markdown preview on disk; the
gate reads that. The node reuses the same lazy-singleton
`DocumentConverter` from `convert_document` so only one Docling instance
is resident per process.

---

## 3. Graph Shape (7 nodes)

```
START
  │
  ▼
initialpages_convert     ← Docling first-10-pages probe → output/<doc_stem>/initial_pages.md
  │
  ▼
check_documents          ← PER-DOC LLM gate (one call per doc; reads the previews)
  │                         Rejected docs stop here; review bundle lands in
  │                         output/not_enough/<slug>/<stem>/
  │
  ├── "not enough" (every doc rejected) ──────► END
  │
  └── "enough"  (≥1 doc accepted; downstream work sees eligible_documents only)
          │
          ▼
    convert_document     ← Docling full parse + OcrAutoOptions + per-page OCR escalation
          │
          ▼
    chunk_document       ← HybridChunker @ max_tokens=512, merge_peers=True
          │
          ▼
    enrich_chunks        ← 5 doctrine post-processors in order
          │                (classification stripper → paragraph number extractor
          │                 → cross-ref extractor → glossary splitter → acronym expander)
          ▼
    embed_chunks         ← bge-m3 via FastEmbed add_custom_model (aapot/bge-m3-onnx)
          │                 + FastEmbed Qdrant/bm25 sparse
          ▼
    upsert_to_qdrant     ← named vectors dense+sparse (sparse modifier=IDF),
                           5 payload indexes built up front, on_disk_payload=True,
                           hash-gated re-ingest, _registry
          │
          ▼
         END
```

Every edge carries only **paths** in `IngestionState` — not DoclingDocuments
or chunks. All of a given source document's stage artefacts live together
under `output/<doc_stem>/` (one folder per doc, flat file names per stage).

---

## 4. Node Walkthrough

### 4.1 `initialpages_convert`
- **Input:** the folder's document list (same as `check_documents`).
- **Cache gate (sha256):** skipped for a doc when `initial_pages.md` is on
  disk AND the fingerprint in `.stage_fingerprints.json` matches the
  current source sha256. Cache hit reuses the markdown and appends one
  `stage="initialpages_convert:cached"` audit entry. Bypass with
  `FORCE_REPARSE=1`.
- **What it does:** runs Docling on the first 10 pages of each binary doc
  via `converter.convert(path, page_range=(1, 10))`, then
  `result.document.export_to_markdown()`. Reuses the same lazy-singleton
  `_get_parser()` from `convert_document` — only ONE `DocumentConverter`
  stays resident per process.
- **Output:** a `dict[str, str]` mapping source path → markdown path,
  stored on state as `initial_parsed_paths`.
- **Side effects:** writes `output/<doc_stem>/initial_pages.md` per
  binary doc (typically <100 KB).
- **Memory:** per-doc streaming, `del result; gc.collect()` between files.

### 4.2 `check_documents` — PER-DOC LLM gate
- **Input:** state's `documents` list + `initial_parsed_paths` dict +
  `source_folder_slug`.
- **What it does:** makes **one LLM call per document**. Each call sends
  the doc's text (`.txt` contents verbatim or the markdown preview for
  binaries, fallback placeholder otherwise) framed as `DOCUMENT 1` and
  runs it through `SUFFICIENCY_CHECK_PROMPT` with Pydantic
  `with_structured_output()` so the LLM returns a typed
  `{decision, remarks}` object. Verdicts are collected into
  `document_decisions` / `document_remarks` and the accepted subset is
  exposed as `eligible_documents` (downstream nodes iterate this list,
  never the full `documents`).
- **Prompt scope:** topical filter (see `graph/prompts.py` header for the
  current rubric). The routing fix is independent of the prompt — the
  prompt can be tuned without touching this node's wiring.
- **Filenames never reach the LLM** — enforced here by the node building
  the user message from content only (`memory.md` Rule 1).
- **Rejected-doc review artefacts:** for each rejected doc the node
  writes `output/not_enough/<folder_slug>/<safe_stem>/check_decision.json`
  (source path, filename, slug, decision, remarks, timestamp, preview
  path) and copies `initial_pages.md` into the same folder when the
  preview exists. If a doc that was rejected on a previous run is now
  accepted, its stale review folder is removed before the node returns so
  `output/not_enough/` always reflects the current verdicts.
- **Stale Qdrant points:** when a doc is rejected this run but was
  previously ingested, the node best-effort deletes its points from
  `ingest__<slug>__bgem3` via `source_doc == <filename>` filter (only if
  the collection already exists). Failures are logged as
  `check_documents:stale_qdrant` and never abort the run.
- **Outputs (state):** `decision` (folder-level summary),
  `remarks` (folder-level summary), `document_decisions`,
  `document_remarks`, `eligible_documents`, `rejected_documents`,
  `rejected_review_dir`.
- **Routing:** `decision` is `"enough"` iff at least one doc was
  accepted; the conditional edge sends `"not enough"` to END and
  `"enough"` to `convert_document`. `convert_document` then iterates
  `eligible_documents`, so rejected docs can never reach later stages.

### 4.3 `convert_document` — Docling full parse
- **Input:** each file's path (PDF / DOCX / TXT).
- **Cache gate (sha256, all-or-nothing):** when both `parsed.json` AND
  `diagnostics.json` are on disk with fingerprints matching the source
  sha256, the Docling call is skipped and paths are republished from
  disk; otherwise the full parse + OCR escalation reruns. Bypass with
  `FORCE_REPARSE=1`.
- **What it does:** runs Docling's `DocumentConverter` with accuracy-first OCR:
  - `do_ocr=True`, `force_full_page_ocr=False`, `ocr_options=OcrAutoOptions()`
    (on macOS this auto-selects native Vision via `OcrMac`; portable fallbacks on other OSes).
  - Docling extracts the PDF text layer first, OCRs only bitmap regions
    above `bitmap_area_threshold`, and merges — dropping OCR cells that
    overlap programmatic cells so digital text always wins on clean pages.
  - On M4 with MPS, layout/table models run on Apple GPU.
- **Escalation (per-page fallback):** after the primary pass, a diagnostic
  check examines each page (char count, cell count, bitmap coverage). For
  pages that look suspicious (thin text + high bitmap coverage + no OCR
  cells), the doc is re-parsed with `force_full_page_ocr=True` and
  `TesseractCliOcrOptions(lang=["auto"])`. Only the suspect pages are
  replaced in the merged `DoclingDocument`; clean pages keep their
  primary-pass output. Every escalation is logged into
  `ingestion_errors` with `stage=ocr_escalation`.
- **Output:** a `DoclingDocument` — structured object with sections,
  tables, figures, page map, heading tree.
- **Side effects:**
  - `output/<doc_stem>/parsed.json` — the parsed document (via `export_to_dict()`).
  - `output/<doc_stem>/diagnostics.json` — per-page char count, cell counts, bitmap coverage, escalation verdict. Human spot-check surface.
- **Memory:** processes one document at a time. After each
  `export_to_dict()` write, the DoclingDocument is dropped
  (`del doc; gc.collect()`) before the next file. A parsed doctrine PDF
  can be 100 MB–1 GB resident — this is the pipeline's #1 OOM risk.
  `DocumentConverter` is loaded once per process via a lazy-singleton
  `_get_parser()`.

### 4.4 `chunk_document`
- **Input:** a `DoclingDocument`.
- **Cache gate (sha256):** when `chunks.jsonl` is on disk with a matching
  fingerprint, HybridChunker is skipped and the existing file is reused.
  Bypass with `FORCE_REPARSE=1`.
- **What it does:** runs Docling's `HybridChunker`. Splits on section
  boundaries. Respects tables as atomic units. Tokenizer-aware — configured
  with the **bge-m3 XLM-RoBERTa tokenizer** (via
  `HuggingFaceTokenizer(AutoTokenizer.from_pretrained("BAAI/bge-m3"))`) so
  chunks fit the dense embedder's window. Pinned: `max_tokens=512`,
  `merge_peers=True`, no sliding-window overlap.
- **Output:** a list of chunks. Each chunk carries:
  - `text` — the chunk content
  - `heading_path` — list of nested headings leading to this chunk
  - `page_numbers` — which page(s) the chunk spans
  - `chunk_type` — `body | table | glossary_entry | figure_caption`
  - `source_doc` — original file name
  - `chunk_index` — position in the document
- **Side effect:** chunks written (append mode, one per line) to
  `output/<doc_stem>/chunks.jsonl` — one file per source doc.
- **Memory:** streams chunks out of `chunker.chunk(doc)` directly into
  the per-doc `chunks.jsonl`. Never builds a whole-doc chunk list in RAM.
  HybridChunker + tokenizer loaded once per process via `_get_chunker()`.

### 4.5 `enrich_chunks` — 5 doctrine post-processors
- **Input:** `chunks_paths` dict — one `chunks.jsonl` per source doc.
- **Cache gate (sha256):** when `enriched_chunks.jsonl` is on disk with a
  matching fingerprint, all 5 post-processors are skipped for that doc.
  Bypass with `FORCE_REPARSE=1`.
- **What it does:** runs the 5 doctrine post-processors in fixed order from
  [`referencedocs/09_doctrine_post_processors.md`](../referencedocs/09_doctrine_post_processors.md):
  1. **classification_stripper** — remove `UNCLASSIFIED`, `U//FOUO`, etc. from chunk text.
  2. **paragraph_number_extractor** — regex-extract `3-12`, `3-12-a` patterns into `paragraph_number` / `paragraph_numbers` metadata.
  3. **cross_ref_extractor** — regex-extract `ADP 5-0`, `FM 3-0`, `JP 3-13` tokens into `cross_refs` list.
  4. **glossary_splitter** — detects glossary-shaped chunks and splits each `ACRO — definition` line into its own chunk with `chunk_type="glossary_entry"`. No-op if no glossary.
  5. **acronym_expander** — builds `{acronym: expansion}` from #4's output, appends expansions to a hidden `expansion_hints` field that the sparse encoder indexes (so "course of action" matches chunks that only use "COA"). Depends on #4.
- Each processor is a pure function wrapped in try/except at the node
  level: per-processor failure is logged to `ingestion_errors`; chunks
  flow through.
- **Output:** `output/<doc_stem>/enriched_chunks.jsonl` per source doc —
  same shape as `chunks.jsonl` with added metadata fields.
- **Side effect:** `output/<doc_stem>/acronyms.json` sidecar written by
  #5 (acronym_expander) when a glossary is found; for inspection only.
- **Memory:** iterates each doc's `chunks.jsonl` line-by-line into a
  per-doc buffer, passes the buffer through all 5 post-processors in
  order, writes the enriched chunks as one `enriched_chunks.jsonl` in
  the same per-doc folder, then drops the buffer before the next doc.
  The folder's chunk list is never held in RAM.

### 4.6 `embed_chunks`
- **Input:** `enriched_chunks_paths` dict — one `enriched_chunks.jsonl` per source doc.
- **Cache gate (sha256):** when `embeddings.npz` is on disk with a
  matching fingerprint, the bge-m3 + BM25 forward pass is skipped. If
  every doc hits the cache, the ONNX embedders are never even loaded
  (deferred via `_ensure_embedders()`), saving the ~5–10 s model init.
  Bypass with `FORCE_REPARSE=1`.
- **What it does, for each chunk:**
  - Runs **bge-m3 via FastEmbed** on the contextualized text → **dense vector (1024-dim)**.
  - Runs FastEmbed `Qdrant/bm25` on the same string → **sparse vector** as `{token_index: weight}`.
- **bge-m3 registration:** `_register_bge_m3_if_needed()` calls
  `TextEmbedding.add_custom_model("BAAI/bge-m3", ..., pooling=PoolingType.DISABLED, normalization=True)` pointing at `aapot/bge-m3-onnx`.
  `DISABLED` is load-bearing: aapot's ONNX export is already pooled.
  Idempotent (guarded against `ValueError` on re-registration).
- **ONNX execution providers** are injected from `.env` (`EMBEDDER_PROVIDERS`):
  macOS dev = `CPUExecutionProvider`; Ubuntu prod = `CUDAExecutionProvider,CPUExecutionProvider`.
- **Output:** `output/<doc_stem>/embeddings.npz` — one file per source
  doc, each with parallel arrays `chunk_ids`, `dense` (N×1024),
  `sparse_indices`, `sparse_values`.
- **Memory:** iterates each doc's `enriched_chunks.jsonl` into a buffer,
  embeds in batches of `EMBED_BATCH_SIZE` (default 32, tunable via `.env`)
  for both dense and sparse, writes `embeddings.npz` in that doc's
  folder, then drops the buffer before the next doc. Both embedders are
  lazy-singletons (`_get_dense_embedder()`, `_get_sparse_embedder()`) —
  loaded once per process (~3–5 GB resident for bge-m3).

### 4.7 `upsert_to_qdrant`
- **Input:** `enriched_chunks_paths` + `embeddings_paths` — iterated one doc at a time.
- **Collection name:** `f"{COLLECTION_PREFIX}__{source_folder_slug}__{EMBEDDER_TAG}"` (default: `ingest__<slug>__bgem3`). Created with named-vector schema `"dense"` (1024-dim cosine) + `"sparse"` BM25 configured with **`modifier=Modifier.IDF`** (required — FastEmbed `Qdrant/bm25` emits raw TF; Qdrant applies IDF at query time only if the modifier is set). Collection-level `on_disk_payload=True`.
- **Indexing** (built once right after `create_collection` and before the first upsert): five payload keyword indexes only — `source_doc`, `chunk_type`, `paragraph_number`, `paragraph_numbers` (list), `cross_refs` (list). Dense HNSW is built automatically with defaults (`m=16`, `ef_construct=100`, RAM-resident); sparse inverted index is built automatically from the `sparse` config.
- **Hash-gated re-ingest:**
  - Each point payload carries `doc_content_hash = sha256(file_bytes)`.
  - Before upserting a doc's chunks: query one existing point with `source_doc == X`. If its `doc_content_hash` matches, **skip the doc entirely** (no re-embed, no delete, no upsert).
  - If the hash differs: `client.delete(collection, filter=Filter(must=[FieldCondition(key="source_doc", match=MatchValue(value=X))]))` then upsert fresh chunks with `uuid5(namespace, source_doc + chunk_index)` IDs.
- **Registry update:** one upsert to the dedicated `_registry` collection with folder manifest (slug, source_folder_abs, doc_count, chunk_count, embedder tag, docling_version, created_at, content_hash, status).
- **Memory:** iterates `embeddings_paths` one doc at a time. For each doc, loads its `embeddings.npz` + enriched chunks, runs the hash-gated flow, then builds `PointStruct`s in batches of `UPSERT_BATCH_SIZE` (default 64) and flushes each batch via `client.upsert()` before building the next.
- **Output:** collection name, point IDs, chunk count, `ingestion_status`.

---

## 5. State Policy

`IngestionState` holds **only paths and metadata**, not parsed objects.
Each node reads its upstream file from disk, does its work, writes its
output to disk, and returns the path in state. This applies identically
on M4 dev and H200 prod — no hybrid threshold, no in-memory mode.

Rationale: bounded memory on any corpus size, identical behavior on dev
and prod hardware, readable LangSmith traces (no 1 GB state blobs),
checkpointer-friendly, and the inspection artefacts on disk already
exist as design intent — there is no extra I/O cost.

See [`structure.md`](structure.md) for the full state field table.

---

## 6. Inspection — How You See What's Stored

Every stage's artefact for a given document lives under `output/<doc_stem>/`.
Look inside that one folder to inspect everything for that doc, ordered
from most raw to most processed:

1. **`output/<doc_stem>/initial_pages.md`** — first-10-pages markdown
   preview produced by `initialpages_convert`. Fastest way to sanity-check
   that Docling is reading the binary doc correctly.

2. **`output/<doc_stem>/parsed.json`** — the full `DoclingDocument`
   after parsing. Section tree, table cells, figure captions — *before*
   chunking. Plus `diagnostics.json` for per-page cell / bitmap /
   escalation info.

3. **`output/<doc_stem>/chunks.jsonl`** (raw) and
   **`output/<doc_stem>/enriched_chunks.jsonl`** (post-processed) —
   one chunk per line after the chunker and enrichment nodes run.

4. **Qdrant dashboard** (`http://localhost:6333/dashboard`):
   - Open the collection.
   - Click any point.
   - See the payload (text + metadata).
   - Expand the dense vector — a 1024-number array (bge-m3).
   - Expand the sparse vector — a `{index: weight}` map. Readable.
   - Filter by `source_doc` or `chunk_type` to zoom in.

5. **`scripts/peek_qdrant.py`** — CLI inspection. No args lists
   collections. With a collection name, prints N random points'
   payloads + dense L2 norm + top sparse tokens.

---

## 7. Memory Discipline Summary

Every node in this graph follows the same rules (from the
**Memory hardening** row in `memory.md`):

- **Per-doc streaming** — parse → write → drop → next doc. No node
  builds a whole-folder list of DoclingDocuments / chunks / vectors /
  points before writing.
- **JSONL line-by-line** in enrich and embed. Neither holds the folder's
  chunk list in RAM.
- **Batched embed/upsert** — `EMBED_BATCH_SIZE=32`,
  `UPSERT_BATCH_SIZE=64` (tunable via `.env`).
- **Lazy-singleton heavy objects** — `_get_parser()`, `_get_chunker()`,
  `_get_dense_embedder()`, `_get_sparse_embedder()`, `_get_client()`,
  `_get_llm()`. Loaded once per process.
- **Explicit `del result; gc.collect()`** between docs in both
  `initialpages_convert` and `convert_document`.
- **Per-doc `embeddings.npz`** — `output/<doc_stem>/embeddings.npz`,
  one file per source doc (no folder-level vectors.npz).
- **Standalone rerun invariant** — each node's output must be fully
  reconstitutable from upstream disk output so
  `python -m graph.nodes.<name> <folder>` works in isolation.

---

## 8. Phase 2 — Retrieval Pipeline

> **Implemented 2026-04-22.** Design locked in
> [`../referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md)
> (R1–R7 spikes all resolved; §7 reranker locked; §10.5 Option B locked).
> This section walks the runtime flow — for the why and the alternatives
> considered, read the design doc.

### 8.1 What Phase 2 Is (and Isn't)

Phase 2 is a **synchronous function**, not a LangGraph node. One call,
one ranked list of chunks:

```python
from graph.retrieval.search import search
from graph.retrieval.schema import SearchRequest

resp = search(SearchRequest(
    query="What is the commander's critical information requirement?",
    collection="ingest__doctrine__bgem3",
    top_n_in=50,
    top_k_out=8,
    use_reranker=True,
    use_glossary=True,
    use_hyde=False,
    debug=False,
))
for hit in resp.hits:
    print(hit.final_rank, hit.source_doc, hit.paragraph_number, hit.rerank_score)
```

Stateless. No `IngestionState`. No graph compile. Every retrieval
module is runnable standalone:
`python -m graph.retrieval.<name> <collection> "<query>"`.

**Out of scope for Phase 2**: answer generation (Phase 3),
cross-collection search, MMR diversification (stub only),
quantization, production HTTP surface. The Streamlit UI
(`ui/app.py`) is a local dev tool — not a prod endpoint.

### 8.2 Retrieval Graph Shape (4 stages + a debug-only sidecar)

```
SearchRequest
    │
    ▼
Stage A  embed_query           (graph/retrieval/embed_query.py)
    │  1. Optional glossary expansion (default ON, cheap, lossless) —
    │     rewrites "ACRO" → "ACRO (expansion)" so BOTH surface forms
    │     land in BM25 + dense.
    │  2. Optional HyDE generation (default OFF, experimental) — LLM
    │     writes a short hypothetical answer paragraph; that paragraph
    │     is embedded on the DENSE channel. SPARSE channel keeps the
    │     user's own (lexically-expanded) query.
    │  3. dense_q  = bge_m3.query_embed(hyde_doc or expanded_query)
    │  4. sparse_q = bm25.query_embed(expanded_query)
    │     ┌── Both channels call .query_embed(), not .embed(). Sparse
    │     │   query gets weight 1.0 per token; IDF is applied
    │     │   server-side by Qdrant because the sparse index carries
    │     │   modifier=Modifier.IDF from Phase 1.
    │     └── Both embedders come from graph.shared.embedders — the
    │         SAME process-level singleton the ingestion pipeline
    │         uses. Zero model-load overhead after the first call.
    │
    ▼
Stage B  hybrid_search         (graph/retrieval/hybrid_search.py)
    │  client.query_points(
    │    collection_name=req.collection,
    │    prefetch=[
    │      Prefetch(query=dense_q,  using="dense",  limit=N_dense),
    │      Prefetch(query=sparse_q, using="sparse", limit=N_sparse),
    │    ],
    │    query=FusionQuery(fusion=Fusion.RRF),
    │    query_filter=<translated from req.filters>,  # top-level;
    │                                                 # Qdrant
    │                                                 # propagates to
    │                                                 # both prefetches
    │    limit=req.top_n_in,
    │    with_payload=True,
    │  )
    │  Returns fused top-N_in with RRF scores. ScoredPoint carries
    │  score, id, payload — NO per-retriever ranks.
    │
    ├── (req.debug=True) ─► Stage B′ — per-retriever ranks
    │                        │  Two extra query_points calls: one
    │                        │  dense-only, one sparse-only, both
    │                        │  with the same query_filter. Each
    │                        │  fused point_id is mapped to its
    │                        │  1-based position. Cost: +2 round-trips.
    │                        │  Hot path does NOT pay this.
    │                        ▼
    │                 per-retriever ranks attached
    │
    ▼
Stage C  rerank                (graph/retrieval/rerank.py)
    │  If req.use_reranker:
    │    pairs  = [(req.query, pt.payload["text"]) for pt in fused]
    │    scores = list(reranker.rerank(req.query, [pt.payload["text"]...]))
    │    # .rerank() returns a generator — materialise with list().
    │    Sort by score desc; keep top req.top_k_out.
    │  Else:
    │    Sort by rrf_score; keep top req.top_k_out.
    │
    ▼
Stage D  apply_mmr             (graph/retrieval/mmr.py)
    │  Identity stub. Deferred per §1 / §4 of the design doc. Wire
    │  when observed duplicate-text problems justify the complexity.
    │
    ▼
SearchResponse
    hits:            list[SearchHit]
    timings_ms:      {embed, hyde, hybrid, rerank, hybrid_dense_only,
                      hybrid_sparse_only}  (debug=True only)
    expanded_query:  str                    (debug=True only)
    hyde_document:   str                    (debug=True + use_hyde)
    qdrant_request_json: dict               (debug=True only; sanitised)
```

**Hot-path cost** (`debug=False`, typical prod call): 1 × `query_points`
+ 1 × rerank. ~300–500 ms on M4 for a 50-candidate rerank.

**Debug-path cost** (`debug=True`, Streamlit UI): 3 × `query_points`
(fused + dense-only + sparse-only) + 1 × rerank + timings. ~3× hot path.

### 8.3 Stage Walkthrough

#### 8.3.1 Stage A — `embed_query`

- **Input:** `query: str`, `collection: str`, `use_glossary: bool`,
  `dense_text_override: str | None` (HyDE doc if `search.py` generated
  one).
- **What it does:**
  1. If `use_glossary`, load the collection's merged acronym
     dictionary via `graph/retrieval/glossary.py` (cached per
     collection; invalidates when `_registry`'s
     `content_hash_of_folder` or the `data/doctrine/` fingerprint
     changes). Rewrite matching tokens as `ACRO (expansion)`.
  2. Dense: `bge_m3.query_embed(dense_text_override or expanded_query)`.
  3. Sparse: `bm25.query_embed(expanded_query)`.
- **Output:** `QueryVectors(dense: list[float], sparse: SparseVector,
  expanded_query: str)`.
- **Shared singletons:** both embedders come from
  `graph.shared.embedders`. One `TextEmbedding` and one
  `SparseTextEmbedding` per process, shared with ingestion.

#### 8.3.2 Stage A sidecar — `glossary.py`

- **Two data sources, merged:**
  1. `data/doctrine/acronyms.csv` — curated termbase, loaded via
     `graph/doctrine_vocab.load_acronyms_dict()`. **Editing this
     file takes effect on the next query** — no re-ingest needed.
  2. Per-doc `output/<doc_stem>/acronyms.json` sidecars from
     Phase 1's `acronym_expander`. Unioned across every doc in the
     collection's source folder. Per-doc glossary definitions WIN
     on conflicts with the external CSV (local publication intent).
- **Case-sensitive match.** Doctrine acronyms are mostly uppercase
  and predictable; case-sensitive keeps the behaviour unambiguous.
- **Known limitation:** ambiguous acronyms (e.g. `DA` = Department of
  the Army / direct action). First-match wins; the UI debug panel
  surfaces the chosen expansion.

#### 8.3.3 Stage A sidecar — `hyde.py` (default OFF)

- **What it does:** generates a short hypothetical answer paragraph
  via `ChatOpenAI`. Domain framing via `HYDE_DOMAIN` (default
  "military doctrine"). Capped at `QUERY_EXPAND_HYDE_MAX_TOKENS`
  (default 256).
- **LLM singleton discipline:** when `QUERY_EXPAND_LLM_MODEL`
  matches the model `graph.shared.llm` uses (default `gpt-4o-mini`),
  this module reuses the shared singleton. When it differs, a local
  lazy singleton is built for the HyDE-specific model.
- **Cost:** ~1–3 s on `gpt-4o-mini`; ~$0.001/query.
- **Empty output falls back** to the user query — better to return
  a normal dense hit than embed an empty string.
- **Why default OFF:** HyDE NDCG@10 gains (published 5–15%) are
  corpus-dependent. No evidence yet that it helps doctrine queries
  here. UI exposes an A/B toggle; eval decides.

#### 8.3.4 Stage B — `hybrid_search`

- **Named vectors:** Phase 1 wrote `"dense"` (1024-dim cosine) and
  `"sparse"` (BM25 with `modifier=Modifier.IDF`). `Prefetch(using=...)`
  must match those names verbatim — this is the Phase 1 contract.
- **Prefetch sizing:** each prefetch's `limit` must be `>= top_n_in`
  for RRF to be well-defined. Default `HYBRID_DENSE_PREFETCH =
  HYBRID_SPARSE_PREFETCH = 50`. Tune via `.env`.
- **Filter translation:** `SearchRequest.filters` is a
  `dict[str, str | list[str]]`. Keys MUST be one of the five
  Phase 1 KEYWORD-indexed payload fields
  (`source_doc`, `chunk_type`, `paragraph_number`,
  `paragraph_numbers`, `cross_refs`). Any other key is rejected in
  `search.py::_validate_request()` — we'd rather fail fast than
  silently full-scan the collection. `list[str]` values translate to
  `MatchAny`; scalars to `MatchValue`.
- **Top-level vs per-prefetch filter:** only `query_points(...)`
  takes `query_filter=`. Inside a `Prefetch(...)` the kwarg is
  `filter=`. Current code uses the top-level filter; Qdrant
  propagates to both prefetches. Any future per-prefetch
  filtering must respect the naming asymmetry.
- **Output:** `HybridResult(fused: list[ScoredPoint],
  dense_only: list[ScoredPoint] | None,
  sparse_only: list[ScoredPoint] | None)`. The two per-retriever
  lists are `None` unless `debug=True`.
- **Parallel Qdrant client:** `graph/retrieval/registry.py::_get_client`
  is a local singleton. Intentionally NOT extracted into
  `graph/shared/` — see §10.5 of the design doc.

#### 8.3.5 Stage C — `rerank`

- **Model (LOCKED):** `BAAI/bge-reranker-v2-m3` via
  `TextCrossEncoder.add_custom_model()` pointing at
  `mogolloni/bge-reranker-v2-m3-onnx`.
- **Import path:** `from fastembed.rerank.cross_encoder import
  TextCrossEncoder`. **NOT** re-exported from top-level
  `fastembed` — the naive `from fastembed import TextCrossEncoder`
  fails.
- **Signature quirks** (differ from `TextEmbedding.add_custom_model`):
  no `pooling`, no `normalization`, no `dim` kwargs. Cross-encoders
  emit scalar scores; those concepts don't apply.
- **HF file layout:** `onnx/model.onnx` + `onnx/model.onnx_data`
  (external weights; **single underscore** — distinct from
  `aapot/bge-m3-onnx`'s `model.onnx.data` dot separator).
- **`.rerank()` returns a generator** — callers must materialise
  with `list(...)` before zipping scores with candidate payloads.
- **Latency:** ~102 ms for 4 pairs on M4 CPU; ~200–400 ms at 50
  pairs. Interactive for human-in-the-loop use.
- **Providers** (`RERANKER_PROVIDERS` in `.env`): macOS dev
  `CPUExecutionProvider`; Ubuntu prod
  `CUDAExecutionProvider,CPUExecutionProvider` under
  `fastembed-gpu==0.8.0`.
- **Fallback (documented, NOT wired):** `BAAI/bge-reranker-base`
  (1.04 GB) ships natively in FastEmbed 0.8.0 — drop-in if the
  custom-model registration ever regresses. Same `.rerank()`
  surface; no `add_custom_model` call needed.

#### 8.3.6 Stage D — `apply_mmr`

Identity pass-through. The signature `apply_mmr(candidates, *,
enabled=False)` is kept stable so `search.py` can call it
unconditionally without a feature flag. Wire the real algorithm
when the evaluation harness shows redundant hits dominating Top-k.

### 8.4 `SearchRequest` / `SearchHit` / `SearchResponse`

Defined once in `graph/retrieval/schema.py`, consumed everywhere
(CLI smoke test, Streamlit, future Phase 3). All dataclasses are
`frozen=True`. Key gotchas:

- `heading_path: str` (joined `" > "` string, NOT `list[str]`) —
  Phase 1 serialises it this way in `graph/nodes/chunk_document.py`.
- `page_numbers: list[int]`.
- `rrf_score: float` always populated (Stage B output).
- `rerank_score: float | None` — `None` if `use_reranker=False`.
- `dense_rank: int | None`, `sparse_rank: int | None` — populated
  ONLY when `debug=True` (Stage B′).
- `final_rank: int` — 1-based position in `SearchResponse.hits`.

### 8.5 Shared Helpers — Option B

Per §10.5 of the design doc, locked 2026-04-21, landed in commits
`f86f6b9` and `e3041e3`:

- `graph/shared/llm.py::_get_llm()` — `ChatOpenAI("gpt-4o-mini",
  temperature=0)` singleton. Used by
  `graph/nodes/check_documents.py` (Phase 1 per-doc gate) AND
  `graph/retrieval/hyde.py` (Phase 2 HyDE). Behaviour-preserving
  swap for the old inline definition.
- `graph/shared/embedders.py::{_register_bge_m3_if_needed,
  _get_dense_embedder, _get_sparse_embedder}` — dense (bge-m3) +
  sparse (BM25) singletons, with the idempotent custom-model
  registration. Used by `graph/nodes/embed_chunks.py` (Phase 1
  ingestion) AND `graph/retrieval/embed_query.py` +
  `graph/retrieval/rerank.py` (Phase 2 retrieval).
- `_get_client()` (Qdrant) — intentionally NOT extracted. Parallel
  singleton lives in `graph/retrieval/registry.py` and
  `graph/retrieval/hybrid_search.py`. HTTP clients are cheap and
  the shared-helper footprint stays tight. Revisit if a third
  consumer appears.

Every Phase 1 smoke test still passes after Option B. The
acceptance gate for each extraction was `python -m
graph.nodes.check_documents <folder>` + `python -m
graph.nodes.embed_chunks <folder>`.

### 8.6 External Doctrine Termbase (`data/doctrine/`)

Three hand-editable files loaded by `graph/doctrine_vocab.py`:

- **`acronyms.csv`** — UTF-8 CSV, schema `term, expansion, status,
  source, notes, updated_at`. Status one of `{approved, draft,
  deprecated}`; deprecated rows are ignored; empty status treated
  as `approved`. Duplicate `term` keys: first occurrence wins
  (one stderr warning). Consumed by `acronym_expander` at ingest
  time AND by `graph/retrieval/glossary.py` at query time.
- **`classification_markings.txt`** — one marking per line;
  `#` comments allowed. Matched case-insensitively with word
  boundaries inside `classification_stripper`.
- **`cross_ref_prefixes.txt`** — one prefix per line; `#` comments
  allowed. Consumed by `cross_ref_extractor` (regex built
  dynamically) AND by `ui/app.py` (cross-ref filter chips). Unified
  single source since commit `a9d1ed9`.

**Edit surface:** these are the files a human touches to adjust
doctrine knowledge. Not Python.

**Merge precedence for acronyms:** per-doc glossary definitions
discovered by `glossary_splitter` WIN for their own doc's chunks
and queries against that collection. External CSV authoritative
for everything else.

**Doctrine-aware cache invalidation** (commit `81317d7`):
`enrich_chunks`, `embed_chunks`, and `upsert_to_qdrant` fold the
doctrine-vocab fingerprint into their stage fingerprints. A
`data/doctrine/*` edit invalidates just those three stages — not
the upstream Docling parse.

### 8.7 Intake Normalization (LibreOffice)

Commits `ec33cbc` + `948bd87`. Legacy Office formats
(`.doc`, `.rtf`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.odt`) are
normalized to Docling-readable formats via LibreOffice headless
BEFORE the ingestion graph runs. Without this layer, a folder of
`.doc` files silently falls out of ingest.

- macOS: `/Applications/LibreOffice.app/Contents/MacOS/soffice`.
- Ubuntu: `apt install libreoffice`.
- Supported-extensions list is centralized so `main.py`,
  `utils/file_reader.py`, and the smoke test stay in agreement.
- Failures are skip-and-log into `ingestion_errors` with
  `stage=intake_normalization`.

### 8.8 Streamlit Dev UI (`ui/app.py`)

Single-file, local-only. One new dep: `streamlit`. Debug mode ON
by default (the hot path is for future Phase 3 consumers).

**Sidebar**
- Collection picker — reads `_registry` via
  `graph/retrieval/registry.py`. Shows TWO count signals side-by-side:
  - *Manifest*: `_registry.doc_count` / `chunk_count` (last values
    `upsert_to_qdrant` recorded at ingest time).
  - *Live*: `client.get_collection(name).points_count` (current
    collection reality at query time).
  Warning badge on mismatch (R5 confirmed the manifest can be stale
  relative to a later ingest run) — non-blocking; retrieval still
  runs against the live collection.
- Filters, each mapped to an indexed payload field:
  - `source_doc` → multiselect, values from
    `client.facet(collection, "source_doc", exact=False)` (one RPC,
    server-side aggregation).
  - `chunk_type` → toggle chips for `body | table | figure |
    figure_caption | glossary_entry`. Fixed cardinality.
  - `paragraph_number` → free-text input.
  - `cross_refs` → prefix chips (seed from
    `data/doctrine/cross_ref_prefixes.txt` ∪ observed-from-corpus)
    + free-text. Observed prefixes come from a bounded scroll on
    collection change, capped at a few thousand points — NOT per
    query. New prefixes are auto-appended to
    `data/eval/cross_ref_prefixes_unseen.txt` for dev review; dev
    promotes good ones into `data/doctrine/cross_ref_prefixes.txt`.
- Retrieval sliders: `top_n_in` (10–200, default 50),
  `top_k_out` (1–20, default 8).
- Stage toggles: `use_reranker`, `use_glossary`, `use_hyde`, `debug`.

**Main panel**
- Query box + Search button.
- Per-hit result cards: `final_rank`, `source_doc · page · ¶ ...`,
  `heading_path`, `chunk_type`, `rrf_score`, `rerank_score`, and
  (when `debug=True`) `dense_rank`, `sparse_rank`. Expanders for full
  text + raw payload JSON. 👍 / 👎 buttons.

**Debug drawer (visible when `debug=True`)**
- Expanded query text.
- HyDE document text (if `use_hyde=True`).
- Stage timings in milliseconds.
- Sanitized `query_points` request JSON.

### 8.9 Evaluation

- **Harvested thumbs** (§8.1 of design doc) — every 👍 / 👎 click
  appends a line to `output/_eval/feedback.jsonl`:
  `{ts, query, collection, point_id, source_doc, paragraph_number,
   final_rank, verdict, request_snapshot}`. **Judged pool** —
  measures precision@k and relative movement between configs. Does
  NOT measure true Recall@k.
- **Gold set** (§8.2) — `data/eval/gold_queries.jsonl` is the
  planned home for 20–50 hand-labelled queries with expected
  paragraph references. Not yet authored. Recommended timing:
  after ~2 weeks of UI use has revealed real query families.
  `scripts/eval_retrieval.py` (not yet written) will consume it and
  emit MRR@10, Recall@{1,5,10}, Precision@5.

### 8.10 Smoke Test — `scripts/retrieval_smoke_test.py`

Read-only, 8-check health harness against a live collection. No
writes. Safe to run any time:

```
python scripts/retrieval_smoke_test.py
python scripts/retrieval_smoke_test.py --collection ingest__doctrine__bgem3
```

Checks:

1. **Collection discovery** — `_registry` manifest + live
   `points_count` both resolve.
2. **Legacy-file coverage** — extension classification of
   `source_doc` values (did the LibreOffice intake path land
   `.doc` / `.rtf` / `.xls` chunks?).
3. **Acronym retrieval** — sample rows from
   `data/doctrine/acronyms.csv`; query each; confirm a relevant hit.
4. **Cross-ref retrieval** — sample observed `cross_refs`; filter
   by them; confirm every hit carries the filtered reference.
5. **Natural-language retrieval** — fixed realistic doctrine
   questions.
6. **Filter integrity** — `source_doc` + `chunk_type` filters; every
   returned hit must satisfy the filter.
7. **Reranker impact** — same query with/without reranker; report
   top-3 overlap.
8. **Glossary impact** — query containing a known acronym; verify
   `expanded_query` differs from the raw query.

### 8.11 `start.sh` — One-Command Bring-Up

Canonical daily entry point on macOS dev. Preflight → runtime →
ingestion → UI. Every step short-circuits when its target is
already up, so re-running is safe:

```
./start.sh                  # full bring-up + ingest + UI
SKIP_INGEST=1 ./start.sh    # skip ingestion, just open the UI
UI_PORT=8510 ./start.sh     # launch the UI on a different port
NO_UI=1 ./start.sh          # ingest only, do not launch the UI
BOOTSTRAP=1 ./start.sh      # first-time setup: create venv +
                            #   pip install -r requirements.txt
                            #   before anything else
```

The script documents in-header that the per-doc LLM gate prompt
lives in `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT`.

### 8.12 Phase 2 `.env` Keys

Added at §10.4 of the design doc; all consumed via
`graph/retrieval/config.py::get_retrieval_config()`:

```
RERANK_MODEL=BAAI/bge-reranker-v2-m3
RERANK_MODEL_SOURCE=mogolloni/bge-reranker-v2-m3-onnx
RERANKER_PROVIDERS=CPUExecutionProvider   # Ubuntu: CUDAExecutionProvider,CPUExecutionProvider
RERANK_TOP_N_IN=50
RERANK_TOP_K_OUT=8
RERANK_BATCH_SIZE=64
HYBRID_DENSE_PREFETCH=50
HYBRID_SPARSE_PREFETCH=50

QUERY_EXPAND_ACRONYMS=on
QUERY_EXPAND_HYDE=off                     # experimental — default OFF
QUERY_EXPAND_LLM_MODEL=gpt-4o-mini        # only used if HyDE is on
QUERY_EXPAND_HYDE_MAX_TOKENS=256
HYDE_DOMAIN=military doctrine

STREAMLIT_PORT=8501
EVAL_FEEDBACK_PATH=output/_eval/feedback.jsonl
```

Every key has a sensible default baked into `graph/retrieval/config.py`
so the system runs out of the box on a fresh clone. Override in `.env`
when a deployment needs different values.

---

## 9. Phase 3 Pointers (scoped, pre-code)

Phase 3 is template-driven document generation. Nothing in Phase 1
or Phase 2 changes when Phase 3 lands (with one prompt-loosening
exception in `graph/prompts.py`, §19.1 of the Phase 3 scoping doc).
Read these, in order, when picking up Phase 3 work:

1. [`phase3_walkthrough.md`](phase3_walkthrough.md) — orientation /
   project-level overview.
2. [`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)
   — authoritative scoping doc; every locked decision lives here
   (D1–D10 in §16, rollout in §15, pre-code gates in §19, corrections
   vs earlier drafts in §18).
3. [`../referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md)
   — the YAML template spec + the 5-kind field taxonomy + worked
   examples per document + collection routing.
4. [`../referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md)
   — renderer port guide: exactly what to keep verbatim from the
   user's old code and what to drop.
5. [`../NewClasses.md`](../NewClasses.md) — Pydantic schemas for
   the four documents with 1-to-1 field map to the user's separate
   health codebase.
6. [`../data/phase3_inputs.example.json`](../data/phase3_inputs.example.json)
   — the input JSON shape.

---

## 10. Cross-References

- Locked decisions, pinned versions, Session Handoff: [`memory.md`](memory.md)
- File layout, state fields, collection map: [`structure.md`](structure.md)
- Phase 2 design rationale + R1–R7 spike evidence:
  [`../referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md)
- Phase 3 authoritative design:
  [`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)
- Ubuntu 22.04 deployment shadow:
  [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md)
