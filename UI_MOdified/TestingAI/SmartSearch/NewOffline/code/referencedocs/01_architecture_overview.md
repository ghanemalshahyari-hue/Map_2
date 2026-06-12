# 01 — Architecture Overview

> Entry point for anyone trying to understand the pipeline at a glance.
> If you're looking for library-specific details, jump to the numbered doc for
> that library (see `memory.md` for the full index).

---

## The one-sentence summary

A LangGraph pipeline that parses documents (Docling), splits them into chunks (HybridChunker), embeds each chunk as a dense + sparse vector pair (OpenAI + FastEmbed BM25), and upserts into Qdrant for hybrid retrieval.

## The pieces, bottom-up

| Layer | Component | Role |
|---|---|---|
| File I/O | `utils/file_reader.py` | Lists files in a folder |
| Orchestration | `graph/builder.py` | LangGraph StateGraph wires nodes into the pipeline |
| Validation | `check_documents` node | Lightweight folder sanity check |
| Parsing | `parse` node → Docling `DocumentConverter` | Turns any supported format (PDF/DOCX/PPTX/TXT) into a `DoclingDocument` with sections, tables, pages |
| Chunking | `chunk` node → Docling `HybridChunker` | Section-aware, tokenizer-aware splitting; preserves tables as atomic units; attaches heading path as metadata |
| Embedding | `embed` node | Dense: OpenAI `text-embedding-3-large` (3072-dim). Sparse: FastEmbed BM25 |
| Storage | `upsert` node → Qdrant | Hybrid collection with named vectors `dense` + `sparse`; rich payload |
| Inspection | `output/parsed/`, `output/chunks/`, Qdrant dashboard | Human-readable artefacts at every stage |

## Graph shape (locked)

```
START → check_documents
            │
            ├─ "not enough" ─► END
            │
            └─ "enough" ─► parse → chunk → embed → upsert → END
```

**Four separate nodes** for the ingestion path (Q2 locked as Option B). State flows through each; errors captured per stage.

## Design principles (inherited, do not violate)

1. **Content-only decisions.** Filenames never reach the LLM. Applies to `check_documents` and any future retrieval prompt.
2. **No module-level LLM instantiation.** Use `_get_llm()` inside node functions so `load_dotenv()` can run first.
3. **`load_dotenv()` before any graph imports.** See `main.py` top-of-file comment.
4. **One collection per folder** (Q3 locked). Name derived from folder name; doctrine corpus lives in one flat folder = one collection.
5. **Deterministic chunk IDs** (Q4 locked). Re-ingestion overwrites. No versioning.
6. **Skip-and-log on parse errors** (Q5 locked). Full traceback captured per failed doc in state.

## What this pipeline does NOT do

- **Retrieval.** Not yet. That's Phase 2. Ingestion first, retrieval later.
- **Summarisation.** The old `generate_analysis` / `compare_summary` nodes are gone. Their purpose (produce one report per folder) is obsolete; the new goal is a searchable knowledge base.
- **OCR.** Skipped by decision — all target docs are digital-born. See `15_ocr_options.md` for what to add if that changes.

## Future phases (for orientation only)

- **Phase 2 — Retrieval.** Question → dense + sparse query vectors → Qdrant Query API with RRF fusion → top-k chunks.
- **Phase 3 — QA with citations.** LLM answers using retrieved chunks; output includes paragraph numbers / doc IDs from payload.
- **Phase 4 — Evaluation harness.** Ground-truth query set with expected chunks; measures precision/recall when swapping encoders.
