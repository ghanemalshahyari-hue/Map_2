# Project Structure Reference

> Live reference for the current ingestion + retrieval pipeline layout.
> Update this file whenever files are added, removed, moved, or renamed.
>
> Last updated: 2026-04-22 (Phase 3 scoped in four md files:
> `referencedocs/18_phase3_generation.md`,
> `referencedocs/19_phase3_arabic_renderer.md`,
> `referencedocs/20_phase3_templates_and_kinds.md`,
> `docs/phase3_walkthrough.md`; `NewClasses.md` at repo root;
> `data/phase3_inputs.example.json` sample input. **No
> `graph/generation/` code exists yet** — the "Planned Phase 3
> layout" section below is aspirational until M1 lands. Prior:
> 2026-04-22 Phase 2 retrieval implemented).

---

## File Tree

```
DecisionMakingSteps/
│
├── main.py                           ← Ingestion entry point.
│                                        Loops inputs/ folders, seeds state,
│                                        invokes the graph, prints summaries.
│
├── start.sh                          ← One-command cold-boot:
│                                        preflight → colima/qdrant → python main.py
│                                        → streamlit run ui/app.py.
│                                        Env flags: SKIP_INGEST=1, NO_UI=1,
│                                        UI_PORT=..., BOOTSTRAP=1.
│
├── graph/                            ← Ingestion LangGraph app + Phase 2 retrieval.
│   ├── __init__.py                     (empty package marker)
│   ├── state.py                      ← IngestionState TypedDict (disk-backed).
│   │                                    UNCHANGED by Phase 2 (retrieval is stateless).
│   ├── config.py                     ← .env-driven settings loader for Phase 1. Single
│   │                                    source of truth for QDRANT_URL, DOCLING_DEVICE,
│   │                                    EMBEDDER_PROVIDERS, collection prefix, etc.
│   ├── builder.py                    ← StateGraph wiring (7-node ingestion graph).
│   ├── prompts.py                    ← All LLM prompts in one module
│   │                                    (SUFFICIENCY_CHECK_PROMPT + HyDE prompt).
│   ├── fingerprints.py               ← sha256 cache-gate helpers
│   │                                   (read/write .stage_fingerprints.json).
│   │                                    Doctrine-aware invalidation folds
│   │                                    data/doctrine/ fingerprint into
│   │                                    enrich/embed/upsert stages.
│   ├── doctrine_vocab.py             ← Loader for the external termbase under
│   │                                    data/doctrine/. Consumed by ingest
│   │                                    post-processors, retrieval glossary, and
│   │                                    the UI cross-ref chips.
│   │
│   ├── nodes/                        ← Phase 1 ingestion nodes.
│   │   ├── __init__.py
│   │   ├── initialpages_convert.py   ← Docling first-10-pages probe → markdown preview.
│   │   ├── check_documents.py        ← LLM sufficiency gate; reads initialpages markdown.
│   │   │                                Imports _get_llm from graph.shared.llm
│   │   │                                (Option B shared-helper swap).
│   │   ├── convert_document.py       ← Docling 2.89 full parser + OCR escalation.
│   │   ├── chunk_document.py         ← HybridChunker, max_tokens=512.
│   │   ├── enrich_chunks.py          ← Runs 5 post-processors in order.
│   │   ├── embed_chunks.py           ← bge-m3 dense + BM25 sparse. Imports
│   │   │                                _register_bge_m3_if_needed / _get_dense_embedder
│   │   │                                / _get_sparse_embedder from graph.shared.embedders
│   │   │                                (Option B shared-helper swap).
│   │   └── upsert_to_qdrant.py       ← Hash-gated upsert + _registry.
│   │
│   ├── post_processors/              ← Pure (list[chunk]) → list[chunk] functions.
│   │   ├── __init__.py
│   │   ├── classification_stripper.py       ← Strip UNCLASSIFIED/U//FOUO markers
│   │   │                                       (markings from data/doctrine/classification_markings.txt).
│   │   ├── paragraph_number_extractor.py    ← Regex-extract 3-12, 3-12-a patterns.
│   │   ├── cross_ref_extractor.py           ← Regex-extract cross-references
│   │   │                                       (prefix list from data/doctrine/cross_ref_prefixes.txt).
│   │   ├── glossary_splitter.py             ← Split glossary into per-definition chunks.
│   │   └── acronym_expander.py              ← Append expansions to sparse-indexed field.
│   │                                           Merges per-doc glossary + external acronyms.csv;
│   │                                           writes output/<doc_stem>/acronyms.json sidecar.
│   │
│   ├── shared/                       ← Phase 2 §10.5 Option B shared helpers.
│   │   ├── __init__.py
│   │   ├── llm.py                    ← _get_llm() ChatOpenAI singleton. Used by
│   │   │                                graph/nodes/check_documents.py (ingest gate)
│   │   │                                AND graph/retrieval/hyde.py.
│   │   └── embedders.py              ← _register_bge_m3_if_needed() +
│   │                                    _get_dense_embedder() + _get_sparse_embedder().
│   │                                    Used by graph/nodes/embed_chunks.py
│   │                                    AND graph/retrieval/embed_query.py / rerank.py.
│   │
│   └── retrieval/                    ← Phase 2 retrieval package.
│       ├── __init__.py
│       ├── schema.py                 ← SearchRequest / SearchHit / SearchResponse
│       │                                dataclasses (frozen=True); ALLOWED_FILTER_KEYS.
│       ├── config.py                 ← .env loader for Phase 2-only keys:
│       │                                RERANK_*, HYBRID_*_PREFETCH, QUERY_EXPAND_*,
│       │                                HYDE_*, EVAL_FEEDBACK_PATH.
│       ├── embed_query.py            ← Stage A — dense + sparse query vectors
│       │                                via .query_embed() (not .embed()).
│       ├── glossary.py               ← Acronym expansion. Merges
│       │                                data/doctrine/acronyms.csv + per-doc
│       │                                output/<stem>/acronyms.json sidecars.
│       ├── hyde.py                   ← Optional LLM hypothetical-document
│       │                                generation (default OFF).
│       ├── hybrid_search.py          ← Stage B — Qdrant query_points with
│       │                                prefetch=[dense, sparse] + FusionQuery(RRF)
│       │                                + top-level query_filter.
│       │                                Stage B' (two extra per-retriever queries)
│       │                                runs only when debug=True.
│       ├── rerank.py                 ← Stage C — BAAI/bge-reranker-v2-m3 via
│       │                                TextCrossEncoder.add_custom_model +
│       │                                mogolloni/bge-reranker-v2-m3-onnx.
│       ├── mmr.py                    ← Stage D — identity stub (deferred).
│       ├── registry.py               ← Read-only view over the _registry
│       │                                collection; manifest + live points_count.
│       │                                Parallel Qdrant _get_client() singleton
│       │                                (NOT shared with upsert_to_qdrant, per §10.5).
│       └── search.py                 ← Top-level search(SearchRequest) → SearchResponse.
│                                       CLI: python -m graph.retrieval.search
│                                       <collection> "<query>"
│                                       [--debug | --no-reranker | --no-glossary |
│                                        --hyde | --top-n-in N | --top-k-out K |
│                                        --filter k=v].
│
├── ui/                               ← Phase 2 dev UI (local-only).
│   └── app.py                        ← Streamlit single-file.
│                                        Run: streamlit run ui/app.py.
│                                        Debug mode ON by default.
│
├── scripts/
│   ├── __init__.py
│   ├── peek_qdrant.py                ← CLI inspection tool — prints N random points
│   │                                    with payload, top sparse tokens, dense vector norm.
│   └── retrieval_smoke_test.py      ← Read-only 8-check smoke test over a live
│                                       collection. Safe to run any time.
│                                       USAGE: python scripts/retrieval_smoke_test.py
│                                       [--collection <name>] [--max-glossary N]
│                                       [--max-cross-refs N].
│
├── utils/
│   ├── __init__.py
│   └── file_reader.py                ← list_documents() — enumerates supported
│                                        extensions (.txt/.pdf/.docx +
│                                        LibreOffice-normalized .doc/.rtf/.xls/
│                                        .xlsx/.ppt/.pptx/.odt) returning
│                                        {path, filename, sha256, size}.
│
├── inputs/                           ← Source-of-truth document folders to ingest.
│   └── <folder>/                     ← One sub-folder = one Qdrant collection.
│                                        main.py walks this directory.
│
├── data/                             ← Committed code-review-visible data assets.
│   ├── doctrine/                     ← Hand-editable doctrine termbase
│   │   │                                (Phase 2 external termbase — see
│   │   │                                 graph/doctrine_vocab.py).
│   │   ├── acronyms.csv              ← term,expansion,status,source,notes,updated_at.
│   │   ├── classification_markings.txt ← One classification marking per line.
│   │   └── cross_ref_prefixes.txt    ← One cross-ref prefix per line;
│   │                                    unified source (a9d1ed9).
│   └── eval/                         ← Eval seed assets.
│       ├── cross_ref_prefixes_unseen.txt ← Committed placeholder; auto-appended
│       │                                   by ui/app.py when a new prefix is
│       │                                   observed. Dev promotes good ones into
│       │                                   data/doctrine/cross_ref_prefixes.txt.
│       └── gold_queries.jsonl        ← NOT YET AUTHORED. Planned home for 20–50
│                                       hand-labeled queries with expected
│                                       paragraph references. Consumed by the
│                                       future scripts/eval_retrieval.py.
│
├── output/                           ← Runtime artefacts (gitignored).
│   ├── <doc_stem>/                   ← One folder per source doc. All of that
│   │   ├── initial_pages.md          ←   doc's stage outputs land here. Stems
│   │   ├── parsed.json               ←   are derived from the source filename
│   │   ├── diagnostics.json          ←   (spaces / punctuation collapsed to _).
│   │   ├── chunks.jsonl              ←   Rejected docs have ONLY
│   │   ├── enriched_chunks.jsonl     ←   initial_pages.md here — the gate
│   │   ├── embeddings.npz            ←   stops them before convert_document.
│   │   ├── acronyms.json             ←   (only if doc has a glossary) —
│   │   │                                  read at QUERY time too by
│   │   │                                  graph/retrieval/glossary.py.
│   │   ├── errors.jsonl              ←   (only if any stage failed for this doc)
│   │   └── .stage_fingerprints.json  ←   Flat {artefact → sha256} sidecar
│   │                                      consumed by the upstream cache gate
│   │                                      (see graph/fingerprints.py;
│   │                                      doctrine-vocab fingerprint folded
│   │                                      into enrich/embed/upsert stages).
│   ├── not_enough/<folder_slug>/     ← Review bundle for docs the per-doc gate
│   │   └── <doc_stem>/                 rejected. One folder per rejected doc.
│   │       ├── check_decision.json   ← source path, filename, slug, decision,
│   │       │                           remarks, timestamp, preview path.
│   │       └── initial_pages.md      ← copied from the doc's main output
│   │                                   folder (when the preview exists) so you
│   │                                   can see exactly what the gate read.
│   ├── _folder_errors.jsonl          ← Failures not tied to a specific doc
│   │                                     (registry / collection creation).
│   └── _eval/
│       └── feedback.jsonl            ← Phase 2 harvested 👍/👎 feedback from
│                                       ui/app.py. One line per click:
│                                       {ts, query, collection, point_id,
│                                        source_doc, paragraph_number,
│                                        final_rank, verdict, request_snapshot}.
│                                       Gitignored. Judged pool — usable for
│                                       precision@k A/B; NOT true Recall@k.
│
├── venv/                             ← Python 3.12 virtualenv (gitignored).
├── libs/                             ← Vendored library source for reference —
│   ├── docling-2.89.0/                 read here before searching online.
│   ├── docling_core-2.74.0/
│   ├── fastembed-0.8.0/
│   ├── qdrant_client-1.17.1/
│   └── sources/                      ← Original .tar.gz files (gitignored).
├── referencedocs/                    ← Per-topic research docs.
│
├── .env                              ← All runtime configuration; commented inline
│                                        (Phase 1: OPENAI_API_KEY, QDRANT_URL,
│                                        DOCLING_DEVICE, EMBEDDER_PROVIDERS,
│                                        HF_TOKEN, batch sizes, FORCE_REPARSE;
│                                        Phase 2: RERANK_*, HYBRID_*_PREFETCH,
│                                        QUERY_EXPAND_*, HYDE_*, STREAMLIT_PORT,
│                                        EVAL_FEEDBACK_PATH). Gitignored.
├── .gitignore                        ← .env, venv/, __pycache__/, output/ runtime dirs,
│                                        libs/sources/*.tar.gz, OS/IDE junk.
├── requirements.txt                  ← Pinned runtime deps (matches venv + memory.md).
│
├── CLAUDE.md                         ← Claude entry point → points at docs/memory.md.
├── AGENTS.md                         ← Codex / other agents entry point.
└── docs/
    ├── memory.md                     ← Master index. Status banner, all locked decisions,
    │                                    version pins, critical rules, Session Handoff.
    ├── walkthrough.md                ← Full pipeline design doc (§1–§7 ingestion,
    │                                    §8 retrieval) with flow diagrams.
    ├── structure.md                  ← THIS FILE — layout, state fields, collection map.
    ├── ubuntu_deploy_shadow.md       ← Ubuntu 22.04 LTS deployment shadow table
    │                                    (covers Phase 1 + Phase 2).
    ├── transferOS.md                 ← Broader OS-portability notes.
    └── langgraphtopics.md            ← Beginner LangGraph explainer (general;
                                         Phase 2 retrieval is NOT a LangGraph node).
```

---

## Graph Flow (7 nodes)

```
START
  │
  ▼
initialpages_convert               ← Node 1
  │   Reads:  documents (paths), doc_output_dirs
  │   Writes: initial_parsed_paths, ingestion_errors (on probe failure)
  │   Side:   output/<doc_stem>/initial_pages.md (first-10-pages markdown)
  │
  ▼
check_documents                    ← Node 2 (PER-DOC LLM calls)
  │   Reads:  documents, initial_parsed_paths, source_folder_slug
  │   Writes: decision (folder-level), remarks (folder-level),
  │           document_decisions, document_remarks,
  │           eligible_documents, rejected_documents, rejected_review_dir
  │   Side:   output/not_enough/<slug>/<stem>/check_decision.json (+
  │           copied initial_pages.md) for every rejected doc; best-effort
  │           deletion of any stale points in ingest__<slug>__bgem3 whose
  │           source_doc matches a newly-rejected filename.
  │
  ├── "not enough" (every doc rejected) ─────────────────► END
  │
  └── "enough"  (≥1 doc accepted; downstream nodes iterate
                 eligible_documents only — rejected docs stop here)
          │
          ▼
    convert_document               ← Node 3
          │   Reads:  eligible_documents (falls back to documents in
          │           standalone mode), doc_output_dirs
          │   Writes: parsed_paths, diagnostics_paths,
          │           ingestion_errors (on parse fail/escalation)
          │
          ▼
    chunk_document                 ← Node 4
          │   Reads:  parsed_paths, documents, doc_output_dirs
          │   Writes: chunks_paths (per-doc chunks.jsonl)
          │
          ▼
    enrich_chunks                  ← Node 5 — runs 5 post-processors:
          │                          1. classification_stripper
          │                          2. paragraph_number_extractor
          │                          3. cross_ref_extractor
          │                          4. glossary_splitter
          │                          5. acronym_expander
          │   Reads:  chunks_paths, doc_output_dirs
          │   Writes: enriched_chunks_paths (per-doc), ingestion_errors
          │
          ▼
    embed_chunks                   ← Node 6
          │   Reads:  enriched_chunks_paths, doc_output_dirs
          │   Writes: embeddings_paths (per-doc embeddings.npz)
          │
          ▼
    upsert_to_qdrant               ← Node 7
          │   Reads:  enriched_chunks_paths, embeddings_paths, documents
          │   Writes: collection_name, point_ids, chunk_count,
          │           ingestion_status
          │
          ▼
         END
```

Every edge carries only **paths** in `IngestionState` — DoclingDocuments,
chunks, and vectors live on disk under `output/`.

---

## State Fields (IngestionState — disk-backed)

Defined in `graph/state.py`. `TypedDict(total=False)` so partial updates
from each node are valid.

| Field                      | Type                              | Set by              | Purpose                                                                                  |
|----------------------------|-----------------------------------|---------------------|------------------------------------------------------------------------------------------|
| `source_folder`            | `str`                             | main.py             | Absolute folder path                                                                     |
| `source_folder_slug`       | `str`                             | main.py             | Lowercase, `[^a-z0-9_-]→_`, 48 chars — feeds collection name                             |
| `documents`                | `list[dict]`                      | main.py             | `[{"path", "filename", "sha256", "size"}, …]` — sha256 drives hash-gated re-ingest       |
| `doc_output_dirs`          | `dict[str, str]`                  | main.py             | `filename → output/<safe_stem>/` — pre-created; every stage writes here                  |
| `decision`                 | `Literal["enough","not enough"]`  | check_documents     | Folder-level summary: `"enough"` if ≥1 doc accepted, else `"not enough"` (routes to END) |
| `remarks`                  | `str`                             | check_documents     | Folder-level summary remark (accepted/rejected counts)                                   |
| `document_decisions`       | `dict[str, str]`                  | check_documents     | `filename → "enough" / "not enough"` — per-doc verdict from one LLM call per doc         |
| `document_remarks`         | `dict[str, str]`                  | check_documents     | `filename → short LLM remark` — mirrors `document_decisions` keys                        |
| `eligible_documents`       | `list[dict]`                      | check_documents     | Subset of `documents` accepted; downstream nodes iterate THIS list, not `documents`      |
| `rejected_documents`       | `list[dict]`                      | check_documents     | Subset of `documents` rejected; kept for summaries only (no downstream work)             |
| `rejected_review_dir`      | `str`                             | check_documents     | `output/not_enough/<folder_slug>/` — review root for rejected-doc bundles                |
| `initial_parsed_paths`     | `dict[str, str]`                  | initialpages_convert| source path → `output/<stem>/initial_pages.md` (first-10-pages preview)                  |
| `parsed_paths`             | `dict[str, str]`                  | convert_document    | `filename → output/<stem>/parsed.json`                                                   |
| `diagnostics_paths`        | `dict[str, str]`                  | convert_document    | `filename → output/<stem>/diagnostics.json`                                              |
| `chunks_paths`             | `dict[str, str]`                  | chunk_document      | `filename → output/<stem>/chunks.jsonl`                                                  |
| `enriched_chunks_paths`    | `dict[str, str]`                  | enrich_chunks       | `filename → output/<stem>/enriched_chunks.jsonl`                                         |
| `embeddings_paths`         | `dict[str, str]`                  | embed_chunks        | `filename → output/<stem>/embeddings.npz`                                                |
| `collection_name`          | `str`                             | upsert_to_qdrant    | `ingest__<slug>__bgem3`                                                                  |
| `point_ids`                | `list[str]`                       | upsert_to_qdrant    | UUID5 IDs for verification                                                               |
| `chunk_count`              | `int`                             | upsert_to_qdrant    | Post-skip final count                                                                    |
| `ingestion_status`         | `Literal["ok","partial","failed"]`| cross-cutting       | End-of-run verdict                                                                       |
| `ingestion_errors`         | `list[dict]`                      | cross-cutting       | `[{stage, file, traceback, ts}, …]`; split into per-doc `errors.jsonl` at end of main.py |

---

## Qdrant Collection Layout

| Collection                               | Role                                                                                                                                     |
|------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `ingest__<slug>__bgem3`                  | One per ingested folder. Named vectors: `dense` (1024-dim cosine, bge-m3) + `sparse` (BM25, `modifier=idf`). Payload carries text, metadata, `doc_content_hash`. |
| `_registry`                              | One point per managed collection. Payload: slug, source_folder_abs, embedder, docling_version, created_at, content_hash, doc_count, chunk_count, status. |

Re-ingest behavior: hash-gated delete-then-upsert.
- Matching `doc_content_hash` → skip doc entirely.
- Mismatched → `delete(collection, filter=source_doc==X)` then upsert fresh UUID5 points.

---

## Disk Artefact Conventions

| Path                                              | Produced by            | Consumed by                    |
|---------------------------------------------------|------------------------|--------------------------------|
| `output/<doc_stem>/initial_pages.md`              | `initialpages_convert` | `check_documents`, human spot-check |
| `output/<doc_stem>/parsed.json`                   | `convert_document`     | `chunk_document`, human spot-check |
| `output/<doc_stem>/diagnostics.json`              | `convert_document`     | Human spot-check, escalation audit |
| `output/<doc_stem>/chunks.jsonl`                  | `chunk_document`       | `enrich_chunks`                |
| `output/<doc_stem>/enriched_chunks.jsonl`         | `enrich_chunks`        | `embed_chunks`, `upsert_to_qdrant` |
| `output/<doc_stem>/embeddings.npz`                | `embed_chunks`         | `upsert_to_qdrant`             |
| `output/<doc_stem>/acronyms.json`                 | `acronym_expander`     | Human inspection (not re-read) |
| `output/<doc_stem>/errors.jsonl`                  | `main.py` (post-graph) | Human review                   |
| `output/_folder_errors.jsonl`                     | `main.py` (post-graph) | Human review                   |
| `output/not_enough/<slug>/<stem>/check_decision.json` | `check_documents` | Human review (why a doc was rejected) |
| `output/not_enough/<slug>/<stem>/initial_pages.md`    | `check_documents` | Human review (what the gate actually read) |
| `output/<doc_stem>/acronyms.json`                     | `acronym_expander` | Phase 2 `graph/retrieval/glossary.py` (query-time), human inspection |
| `output/_eval/feedback.jsonl`                         | `ui/app.py` (👍/👎) | Phase 2 eval A/B; future `scripts/eval_retrieval.py` |
| `data/doctrine/acronyms.csv`                          | Human-edited | Phase 1 `acronym_expander` + Phase 2 `graph/retrieval/glossary.py` |
| `data/doctrine/classification_markings.txt`           | Human-edited | Phase 1 `classification_stripper` |
| `data/doctrine/cross_ref_prefixes.txt`                | Human-edited | Phase 1 `cross_ref_extractor` + Phase 2 `ui/app.py` chip seed |
| `data/eval/cross_ref_prefixes_unseen.txt`             | `ui/app.py` (auto-append) | Human review — promote good prefixes into `data/doctrine/cross_ref_prefixes.txt` |

All consumer nodes and retrieval modules can be re-run standalone
after a producer update:
`python -m graph.nodes.<node_name> <folder_name>` for ingestion,
`python -m graph.retrieval.<module_name> <collection> "<query>"` for
retrieval.

---

## Phase 2 CLI / Entry Points

| Entry point | Command | Purpose |
|---|---|---|
| Streamlit dev UI | `streamlit run ui/app.py` (or `./start.sh`) | Interactive retrieval + 👍/👎 feedback harvest |
| Programmatic search | `python -m graph.retrieval.search <collection> "<query>" [--debug\|--no-reranker\|--no-glossary\|--hyde\|--top-n-in N\|--top-k-out K\|--filter k=v]` | One-shot search from the terminal |
| Standalone stage (any of embed_query / hybrid_search / rerank / glossary / hyde / registry) | `python -m graph.retrieval.<name> <collection> "<query>"` | Isolate a single stage for debugging |
| Read-only smoke test | `python scripts/retrieval_smoke_test.py [--collection <name>]` | 8-check health scan over a live collection (no writes) |
| Full bring-up | `./start.sh` | Preflight → colima/qdrant → `python main.py` → Streamlit |

---

## Phase 2 — Retrieval (Implemented)

- **Design doc (locked rationale + R1–R7 spike evidence):**
  [`../referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md).
- **Runtime walkthrough (4-stage pipeline, UI, smoke test, env keys):**
  [`walkthrough.md`](walkthrough.md) §8.
- **New packages / files** (all present on `main`):
  - `graph/retrieval/` — 11 modules (schema, config, embed_query,
    glossary, hyde, hybrid_search, rerank, mmr, registry, search).
  - `graph/shared/` — 2 modules (llm.py, embedders.py) per §10.5
    Option B.
  - `graph/doctrine_vocab.py` — loader for the external termbase.
  - `ui/app.py` — Streamlit dev UI.
  - `scripts/retrieval_smoke_test.py` — read-only 8-check harness.
  - `start.sh` — one-command cold-boot.
  - `data/doctrine/{acronyms.csv, classification_markings.txt,
    cross_ref_prefixes.txt}` — hand-editable doctrine termbase.
  - `data/eval/cross_ref_prefixes_unseen.txt` — auto-appended by UI.
  - `output/_eval/feedback.jsonl` — runtime-harvested 👍/👎 feedback
    (gitignored).
- **No new `IngestionState` fields.** Retrieval is stateless — it
  takes a `SearchRequest` and returns a `SearchResponse`. The
  ingestion `TypedDict` is unchanged.
- **No LangGraph wiring.** `search()` is a synchronous function,
  not a node. Compiling a graph around retrieval would add
  checkpoint/state machinery that retrieval does not need.
- **Qdrant schema unchanged.** Phase 2 queries against the exact
  collection shape Phase 1 built — named vectors (`dense`,
  `sparse` with `modifier=IDF`), the five KEYWORD payload indexes
  (`source_doc`, `chunk_type`, `paragraph_number`,
  `paragraph_numbers`, `cross_refs`), `on_disk_payload=True`, and
  the `_registry` manifest collection with its ten keys
  (`slug, collection_name, source_folder_abs, embedder_tag,
   docling_version, created_at, doc_count, chunk_count,
   content_hash_of_folder, status`).
- **Standalone-run invariant extended.** Every retrieval module is
  runnable on its own:
  `python -m graph.retrieval.<name> <collection> "<query>"`.
- **Shared-helper surface locked (§10.5 Option B).**
  `_get_llm()` → `graph/shared/llm.py` (consumed by Phase 1
  `check_documents` + Phase 2 `hyde`). `_register_bge_m3_if_needed`
  / `_get_dense_embedder` / `_get_sparse_embedder` →
  `graph/shared/embedders.py` (consumed by Phase 1 `embed_chunks`
  + Phase 2 `embed_query` / `rerank`). Qdrant `_get_client()`
  intentionally NOT shared — parallel singleton lives in
  `graph/retrieval/{registry, hybrid_search}.py` (revisit only if
  a third consumer appears).

---

## Conventions

- Filenames never sent to the LLM; content-only decisions.
- No module-level LLM/client instantiation — `_get_llm()` / `_get_client()` etc.
- `load_dotenv()` before any `graph/` import.
- All configuration in `.env`; no hardcoded values in source.
- `HybridChunker(max_tokens=512, merge_peers=True)` with bge-m3 tokenizer.
- Hash-gated re-ingest; skip-and-log on all failures; disk-backed state.
- Qdrant sparse vector always configured with `modifier=Modifier.IDF`;
  five payload keyword indexes — `source_doc`, `chunk_type`,
  `paragraph_number`, `paragraph_numbers`, `cross_refs` — built right
  after `create_collection` and before first upsert;
  `on_disk_payload=True`; HNSW defaults, no quantization in Phase 1.
- **Phase 2 filters** accept ONLY the five KEYWORD-indexed payload
  keys above; any other filter key is rejected by
  `graph/retrieval/search.py::_validate_request()` rather than
  silently full-scanning.
- **Phase 2 query-time embedding** uses `.query_embed()` on both
  channels (NOT `.embed()`). On sparse BM25 this is critical — the
  query gets weight 1.0 per token and IDF is applied server-side by
  Qdrant because the sparse index carries `modifier=Modifier.IDF`.
- **Phase 2 reranker import** is
  `from fastembed.rerank.cross_encoder import TextCrossEncoder`
  (NOT top-level-exported). `.rerank()` returns a generator;
  materialise with `list(...)` before zipping with payloads.
- **Phase 2 filter kwarg asymmetry.** `query_points(...,
  query_filter=...)` at the top level; `Prefetch(..., filter=...)`
  inside. Current code relies on top-level propagation; any
  per-prefetch filter change must honour the naming difference.
- **External doctrine termbase edits take effect at query time.**
  `data/doctrine/acronyms.csv` is re-read by
  `graph/retrieval/glossary.py` (no re-ingest required for
  retrieval-side expansion). For ingest-side enrichment, the
  doctrine-vocab fingerprint invalidates the
  `enrich_chunks` / `embed_chunks` / `upsert_to_qdrant` stage
  caches automatically.
- **Upstream sha256 cache** (locked "Upstream cache" row in `memory.md`):
  every upstream stage (`initialpages_convert`, `convert_document`,
  `chunk_document`, `enrich_chunks`, `embed_chunks`) stamps its artefact
  with the source sha256 in `output/<stem>/.stage_fingerprints.json`
  and skips the heavy call on reruns when the fingerprint matches. A
  cache hit logs a `stage:cached` audit entry (non-failure). Bypass via
  `FORCE_REPARSE=1` in `.env`.
- **Memory hardening** (locked "Memory hardening" row in `memory.md`):
  every node processes one doc at a time; enrich and embed stream JSONL
  line-by-line; embeddings are written per-doc as `<doc>.npz`;
  embed/upsert use batched calls (`EMBED_BATCH_SIZE=32`,
  `UPSERT_BATCH_SIZE=64`); heavy objects (`DocumentConverter`,
  `HybridChunker`, `TextEmbedding`, `SparseTextEmbedding`) are
  lazy-singletons per process; both `initialpages_convert` and
  `convert_document` call `del result; gc.collect()` between files
  (`initialpages_convert` reuses `convert_document._get_parser()` so
  there is still exactly one `DocumentConverter` resident per process).

---

## Planned Phase 3 Layout (SCOPED, PRE-CODE as of 2026-04-22)

> **None of the paths under `graph/generation/`, `templates/`, or
> `output/generated/` exist yet.** This section documents the
> target layout decided in
> [`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)
> §12 so a fresh chat has one place to see where each planned file
> will land. Update this section as M1–M6 files land.

```
DecisionMakingSteps/
│
├── NewClasses.md                        ← EXISTS. Pydantic schema mirror of
│                                           the user's health prompt.txt,
│                                           doctrine-domain class names + Arabic
│                                           descriptions. Field-mapping table at
│                                           the bottom for rename-only port back
│                                           to the health codebase.
│
├── graph/
│   └── generation/                      ← NEW (not yet created).
│       ├── __init__.py
│       ├── schema/
│       │   ├── __init__.py
│       │   ├── opord.py                 ← Pydantic classes for Doc 1 (mirrors
│       │   │                               NewClasses.md Document 1).
│       │   ├── staff_estimate.py        ← Doc 2.
│       │   ├── time_analysis.py         ← Doc 3.
│       │   └── initial_planning_guidance.py  ← Doc 4.
│       ├── template_loader.py           ← YAML → Template/Section objects +
│       │                                   validation (spec in referencedoc 20 §9).
│       ├── field_dispatcher.py          ← Walks every schema field by `kind`:
│       │                                   static/computed/input/derived/retrieved.
│       ├── time_math.py                 ← Pure functions for the 1:3 rule and
│       │                                   30/20/30/20 sub-splits (replaces
│       │                                   the old code's cal()).
│       ├── retrieval_group.py           ← For each retrieved group: fan out
│       │                                   queries × collections through
│       │                                   graph.retrieval.search.search(),
│       │                                   dedupe by point_id, rerank top 15.
│       ├── section_drafter.py           ← One LLM call per group,
│       │                                   with_structured_output(<GroupSchema>).
│       ├── critique.py                  ← Faithfulness pass; re-drafts only
│       │                                   unsupported fields.
│       ├── assembler.py                 ← Resolves derived references, builds
│       │                                   the final GeneratedDocument pydantic
│       │                                   instance.
│       ├── cache.py                     ← Per-group + per-doc fingerprinting
│       │                                   (mirrors Phase 1's
│       │                                   .stage_fingerprints.json pattern).
│       └── renderers/
│           ├── __init__.py
│           └── arabic_docx.py           ← Ported from the user's old code.
│                                           Preserves kashida, RTL bidi, Arabic
│                                           numbering cycles, Hijri/Gregorian
│                                           formatting, table styling, complex-
│                                           script font overrides. Behaviour-
│                                           identical to the old output.
│                                           See referencedoc 19 for keep/discard.
│
├── templates/                           ← NEW (not yet created).
│   ├── operation_order.yaml             ← Doc 1.
│   ├── staff_estimate.yaml              ← Doc 2.
│   ├── time_analysis.yaml               ← Doc 3.
│   └── initial_planning_guidance.yaml   ← Doc 4.
│
├── scripts/
│   └── generate_documents.py            ← NEW (not yet created). CLI entry:
│                                           python scripts/generate_documents.py
│                                             --inputs data/inputs.json
│                                             --out output/generated/<run_id>
│
├── data/
│   └── phase3_inputs.example.json       ← EXISTS. One-operation sample input
│                                           with comments describing each field.
│
└── output/
    └── generated/<run_id>/              ← NEW (not yet created).
        ├── operation_order.docx
        ├── staff_estimate.docx
        ├── time_analysis.docx
        ├── initial_planning_guidance.docx
        ├── .group_cache/<hash>.json     ← Per-retrieval-group result cache.
        └── .stage_fingerprints.json     ← Per-doc freshness sidecar.
```

**Integration touch points** (read-only unless noted):

- `graph.retrieval.search.search` — the ONLY Phase 2 call Phase 3
  makes.
- `graph.retrieval.registry.list_registry_entries` — collection
  discovery.
- `graph.retrieval.schema.{SearchRequest, SearchResponse,
  SearchHit}` — dataclasses consumed as-is.
- `graph.shared.llm._get_llm` — LLM singleton.
- `graph.prompts` — **additive only** (new Phase 3 prompt constants
  land alongside `SUFFICIENCY_CHECK_PROMPT`).
- `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT` — **one pre-code
  edit** per §19.1 of referencedoc 18: rewrite the current
  topical-filter prompt into a pure junk filter so Phase 3 can
  ingest specialty / support doctrine (sustainment, fires, signal,
  aviation, CBRN, engineer, MP, EW) without rejection.

No other Phase 1 or Phase 2 file is touched. Phase 3 is purely a
consumer of what Phases 1 and 2 built.
