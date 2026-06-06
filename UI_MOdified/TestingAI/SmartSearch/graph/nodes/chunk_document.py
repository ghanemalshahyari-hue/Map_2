"""
graph/nodes/chunk_document.py
==============================
LangGraph node that splits each parsed document into small "chunks"
and saves them to a JSONL file.

WHAT IS A CHUNK?
  A chunk is a small piece of a document — typically a paragraph, a table,
  or a section of a few hundred words.  We break documents into chunks
  because AI embedding models (the ones that convert text into vectors for
  search) work best on short pieces of text, not entire documents.

WHAT IS JSONL?
  JSONL (JSON Lines) is a file format where each line is a separate JSON
  object.  It's ideal here because we can write one chunk per line as we
  go, without ever holding the entire document's worth of chunks in memory.
  Example:
      {"text": "The mission is...", "source_doc": "ATP-3-01-8.pdf", ...}
      {"text": "Enemy forces...",   "source_doc": "ATP-3-01-8.pdf", ...}

WHAT IS THE HYBRIDCHUNKER?
  HybridChunker is a Docling tool that splits a document intelligently.
  Unlike simple text splitters that just cut at a fixed number of characters,
  HybridChunker:
  - Understands document structure (headings, paragraphs, tables)
  - Keeps related content together (a heading stays with its paragraph)
  - Respects token limits (max_tokens=512 means each chunk has at most
    512 tokens — roughly 380 words)
  - Merges tiny adjacent chunks that share the same heading (merge_peers=True)

WHAT IS contextualized_text?
  When we store a chunk for embedding (converting to a search vector), we
  use a slightly enriched version of the text that includes the heading
  above it.  For example, if a paragraph is under "Chapter 3 - Tactics",
  the contextualized text would start with that heading.  This makes the
  search more accurate because the vector "knows" the context.
  The raw text (without the heading prefix) is stored separately for display.

MEMORY RULE:
  We never build a list of all chunks for the whole folder at once.
  Instead we stream: load one document → write its chunks line by line →
  free the document → load the next document.  This keeps RAM usage constant
  no matter how large the folder is.

CACHE GATE (sha256-based):
  Before chunking, the node checks output/<stem>/.stage_fingerprints.json.
  If chunks.jsonl exists AND its fingerprint matches the source sha256,
  the chunker is skipped and the existing file is reused.  Set
  FORCE_REPARSE=1 in .env to bypass this gate.

HOW TO RUN IN ISOLATION (for testing):
  python -m graph.nodes.chunk_document doctrine
  (Requires convert_document to have already run for this folder.)
"""
from __future__ import annotations

import json         # for writing each chunk as a JSON line
import sys          # for reading command-line arguments
import traceback    # for capturing full error messages
from datetime import datetime, timezone   # for timestamping errors
from pathlib import Path                  # cleaner path handling
from typing import Any

# Docling chunking imports
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
# HybridChunker is the smart splitter — it understands document structure

from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
# HuggingFaceTokenizer wraps a tokenizer model so HybridChunker knows how
# to count tokens (each model has its own token counting rules)

from docling_core.types.doc.document import DoclingDocument
# DoclingDocument is the structured document object — we load this from
# the JSON files written by convert_document

# Our own project files
from graph.config import FILE_CHUNKS_JSONL, doc_output_dir, get_config
from graph.fingerprints import is_artefact_fresh, write_fingerprint
from graph.state import IngestionState


# =============================================================================
# CHUNK TYPE MAPPING
# =============================================================================
#
# Each piece of content in a document has a "label" that Docling assigned
# during parsing (e.g. "table", "picture", "caption", "paragraph").
# We simplify these into four types that make sense for our use case:
#
#   "body"           — normal text: paragraphs, headings, list items, etc.
#   "table"          — a data table
#   "figure"         — an image or chart
#   "figure_caption" — the caption text that describes an image or chart
#
# Note: "glossary_entry" is a fifth type, but it is set later by the
# glossary_splitter post-processor (step 9), not here.
#
_LABEL_TO_CHUNK_TYPE: dict[str, str] = {
    "table":    "table",
    "picture":  "figure",
    "chart":    "figure",
    "caption":  "figure_caption",
    "footnote": "figure_caption",
    # Everything else (paragraph, text, title, list_item, etc.) → "body"
}


def _get_chunk_type(doc_items: list) -> str:
    """
    Look at the first content item in a chunk and return its type string.

    doc_items is the list of document elements that make up this chunk.
    We look at the label of the first element to decide the chunk type.

    Examples:
      doc_items[0].label = "table"   → returns "table"
      doc_items[0].label = "picture" → returns "figure"
      doc_items[0].label = "text"    → returns "body"
      doc_items is empty             → returns "body"
    """
    if not doc_items:
        return "body"

    # Get the label from the first item.  The label might be a string
    # or an enum object — we handle both with the .value check.
    first_label = getattr(doc_items[0], "label", None)
    if hasattr(first_label, "value"):
        first_label = first_label.value   # convert enum to string, e.g. DocItemLabel.TABLE → "table"

    return _LABEL_TO_CHUNK_TYPE.get(str(first_label).lower(), "body")


def _get_page_numbers(doc_items: list) -> list[int]:
    """
    Collect all page numbers referenced by the items in a chunk.

    Each doc_item has a "prov" (provenance) list that records where in the
    document each piece of content came from — including the page number.
    A single chunk might span multiple pages (e.g. a table that starts on
    page 4 and ends on page 5), so we collect all unique page numbers.

    Returns a sorted list of unique page numbers, e.g. [4, 5].
    """
    page_set: set[int] = set()

    for item in doc_items:
        # prov is the list of provenance records for this item.
        for prov in getattr(item, "prov", []):
            page_no = getattr(prov, "page_no", None)
            if page_no is not None:
                page_set.add(int(page_no))

    return sorted(page_set)   # sorted so output is deterministic


# =============================================================================
# THE CHUNKER — loaded once and reused for every document in the process
# =============================================================================
#
# WHY A SINGLETON (one shared instance):
#   Loading HybridChunker involves downloading and initialising the BAAI/bge-m3
#   tokenizer model.  This takes a few seconds on the first call.  We create
#   it once and reuse it for every document, rather than reloading it each time.
#
_chunker: HybridChunker | None = None


def _get_chunker() -> HybridChunker:
    """
    Return the shared HybridChunker, creating it if this is the first call.

    Locked settings (from memory.md):
      max_tokens=512   — each chunk has at most 512 tokens (~380 words)
      merge_peers=True — merge tiny adjacent chunks that share the same heading
      tokenizer        — BAAI/bge-m3, the same model used for embedding later
                         (important: chunker and embedder must use the same
                          tokenizer so "512 tokens" means the same thing)
    """
    global _chunker   # we need to modify the module-level variable

    if _chunker is None:
        # Load the BAAI/bge-m3 tokenizer.  max_tokens=512 tells it the limit.
        # On first run this downloads the tokenizer files from HuggingFace.
        tokenizer = HuggingFaceTokenizer.from_pretrained(
            model_name="BAAI/bge-m3",
            max_tokens=512,
        )

        _chunker = HybridChunker(
            tokenizer=tokenizer,
            max_tokens=512,    # maximum tokens per chunk
            merge_peers=True,  # merge small adjacent chunks with the same heading
        )

    return _chunker


# =============================================================================
# THE NODE FUNCTION — called by LangGraph
# =============================================================================

def chunk_document(state: IngestionState) -> dict[str, Any]:
    """
    LangGraph node: split every parsed document into chunks and write to JSONL.

    For each parsed JSON file (produced by convert_document):
      1. Load the DoclingDocument from disk.
      2. Run HybridChunker to split it into chunks.
      3. For each chunk, build a record dict with all the fields we need.
      4. Write the record as one line in that doc's chunks.jsonl immediately.
      5. Free the document from memory before loading the next one.

    Output file (one per source doc): output/<stem>/chunks.jsonl
      Each line is a JSON object representing one chunk.

    State keys read:
        documents           — original file list (for sha256 hash lookup)
        doc_output_dirs     — filename -> output/<safe_stem>/ (from main.py)
        parsed_paths        — dict {filename -> parsed.json path}

    State keys written:
        chunks_paths        — dict {filename -> output/<stem>/chunks.jsonl}
        ingestion_errors    — any errors appended to the existing list
    """
    cfg = get_config()
    parsed_paths: dict[str, str] = dict(state.get("parsed_paths") or {})
    documents = state.get("documents") or []
    doc_output_dirs: dict[str, str] = dict(state.get("doc_output_dirs") or {})
    errors: list[dict] = list(state.get("ingestion_errors") or [])

    # Build a lookup table: filename → sha256 hash.
    # We need the hash to tag each chunk with its source document's fingerprint.
    # This fingerprint is stored in Qdrant and used later to detect if a
    # document has changed (so we can skip re-ingesting unchanged files).
    hash_by_filename: dict[str, str] = {
        d["filename"]: d["sha256"] for d in documents
    }

    chunker = _get_chunker()

    chunks_paths: dict[str, str] = {}

    # Process one parsed document at a time.
    for source_doc, parsed_json_path in parsed_paths.items():
        parsed_json = Path(parsed_json_path)
        doc_content_hash = hash_by_filename.get(source_doc, "")

        # This doc's output folder (same one convert_document wrote into).
        out_dir_str = doc_output_dirs.get(source_doc)
        out_dir = Path(out_dir_str) if out_dir_str else doc_output_dir(source_doc, cfg)
        chunks_path = out_dir / FILE_CHUNKS_JSONL

        # ------------------------------------------------------------------
        # CACHE GATE — reuse chunks.jsonl when its fingerprint matches the
        # source sha256.  FORCE_REPARSE=1 bypasses this.
        # ------------------------------------------------------------------
        if (
            not cfg.force_reparse
            and is_artefact_fresh(out_dir, FILE_CHUNKS_JSONL, doc_content_hash, chunks_path)
        ):
            chunks_paths[source_doc] = str(chunks_path)
            errors.append({
                "stage":     "chunk_document:cached",
                "file":      source_doc,
                "traceback": f"cache hit ({doc_content_hash[:12]}…) — reused {chunks_path.name}",
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            continue

        # Clean slate for this doc — delete any JSONL from a previous run so
        # append-mode doesn't accumulate stale chunks across re-runs.
        chunks_path.unlink(missing_ok=True)

        # chunk_index counts chunks WITHIN this one document.  Re-starts per
        # doc so UUID5 IDs in the upsert stage stay stable for the same
        # (source_doc, chunk_index) pair.
        chunk_index = 0

        try:
            # ------------------------------------------------------------------
            # STEP 1: Load the parsed document from disk.
            # load_from_json() reads the .json file and rebuilds the full
            # DoclingDocument object in memory.
            # ------------------------------------------------------------------
            doc = DoclingDocument.load_from_json(parsed_json)

            # ------------------------------------------------------------------
            # STEP 2: Open the output file in append mode and write chunks.
            # Streaming write — one chunk per line, never buffers the full
            # list of chunks in RAM even for large documents.
            # ------------------------------------------------------------------
            with open(chunks_path, "a", encoding="utf-8") as output_file:

                for chunk in chunker.chunk(doc):
                    # chunker.chunk(doc) is a generator — it yields one chunk
                    # at a time without building the entire list in memory first.

                    # contextualize() returns the chunk text prefixed with its
                    # headings.  This enriched version is what we'll embed (turn
                    # into a search vector) in the next step.
                    contextualized_text = chunker.contextualize(chunk=chunk)

                    # Get the metadata attached to this chunk.
                    meta = chunk.meta
                    doc_items = list(getattr(meta, "doc_items", []))

                    # headings is a list of heading strings above this chunk,
                    # e.g. ["Chapter 3", "Section 3-1 Tactics"].
                    headings = getattr(meta, "headings", None) or []

                    # captions are figure/table caption strings, if any.
                    captions = getattr(meta, "captions", None) or []

                    # Build the record we'll save for this chunk.
                    record = {
                        # The raw text of the chunk — shown to users in search results.
                        "text": chunk.text,

                        # Heading-prefixed text used for embedding (search vectors).
                        # Stored separately so we embed the context-rich version
                        # but display the clean version to users.
                        "contextualized_text": contextualized_text,

                        # All headings above this chunk, joined with " > ".
                        # e.g. "Chapter 3 > Section 3-1 Tactics"
                        "heading_path": " > ".join(headings) if headings else "",

                        # Which page(s) this chunk came from.  A chunk that spans
                        # a page break will have two entries, e.g. [4, 5].
                        "page_numbers": _get_page_numbers(doc_items),

                        # Any figure/table captions that belong to this chunk.
                        "captions": captions,

                        # Content type: "body", "table", "figure", "figure_caption"
                        "chunk_type": _get_chunk_type(doc_items),

                        # Which file this chunk came from.
                        # e.g. "ATP-3-01-8-SHORAD.pdf"
                        "source_doc": source_doc,

                        # Position of this chunk across the whole folder (0, 1, 2, ...).
                        "chunk_index": chunk_index,

                        # SHA-256 fingerprint of the source file at the time of
                        # ingestion.  Stored in Qdrant so we can detect changes
                        # on re-ingest (if the hash matches, skip re-processing).
                        "doc_content_hash": doc_content_hash,
                    }

                    # Write this chunk as one line in the JSONL file.
                    output_file.write(json.dumps(record, ensure_ascii=False) + "\n")
                    chunk_index += 1

            # ------------------------------------------------------------------
            # STEP 3: Free the document from memory before loading the next one.
            # DoclingDocument objects can be large (100s of MB for big PDFs).
            # Freeing immediately keeps memory usage flat across a large folder.
            # ------------------------------------------------------------------
            del doc

            chunks_paths[source_doc] = str(chunks_path)

            # Fingerprint the artefact so a rerun with unchanged source bytes
            # can skip this stage.
            if doc_content_hash:
                write_fingerprint(out_dir, FILE_CHUNKS_JSONL, doc_content_hash)

        except Exception:
            # Something went wrong while loading or chunking this document.
            # Log the error with the full traceback and continue with the next file.
            errors.append({
                "stage": "chunk_document",
                "file": parsed_json_path,
                "traceback": traceback.format_exc(),
                "ts": datetime.now(timezone.utc).isoformat(),
            })

    # Return the new state keys to LangGraph.
    return {
        "chunks_paths": chunks_paths,
        "ingestion_errors": errors,
    }


# =============================================================================
# STANDALONE MODE — run this node directly from the terminal for testing
# =============================================================================
# Usage:
#   python -m graph.nodes.chunk_document doctrine
#   (Requires convert_document to have already run for this folder.)

if __name__ == "__main__":
    import re
    from dotenv import load_dotenv

    load_dotenv()   # read .env so get_config() works

    if len(sys.argv) < 2:
        print("Usage: python -m graph.nodes.chunk_document <folder_path_or_name>")
        sys.exit(1)

    # Accept a full path or a short name under inputs/
    folder = Path(sys.argv[1])
    if not folder.is_absolute():
        candidate = Path("inputs") / sys.argv[1]
        if candidate.is_dir():
            folder = candidate
    folder = folder.resolve()

    if not folder.is_dir():
        print(f"Error: '{folder}' is not a valid directory.")
        sys.exit(1)

    # Build the safe folder slug from the folder name.
    slug = re.sub(r"[^a-z0-9_-]", "_", folder.name.lower())[:48]

    # Find the parsed JSON files that convert_document saved earlier.
    from graph.config import (
        FILE_PARSED_JSON,
        doc_output_dir as _doc_output_dir,
        get_config as _get_cfg,
    )
    cfg = _get_cfg()

    from utils.file_reader import list_documents
    documents = list_documents(str(folder))

    # Reconstruct parsed_paths by looking for parsed.json in each doc's folder.
    _doc_output_dirs = {
        d["filename"]: str(_doc_output_dir(d["filename"], cfg)) for d in documents
    }
    parsed_paths: dict[str, str] = {}
    for d in documents:
        p = Path(_doc_output_dirs[d["filename"]]) / FILE_PARSED_JSON
        if p.is_file():
            parsed_paths[d["filename"]] = str(p)

    if not parsed_paths:
        print("No parsed.json files found. Run convert_document first: "
              "python -m graph.nodes.convert_document <folder>")
        sys.exit(1)

    # Build a minimal state to pass to the node function.
    dummy_state: IngestionState = {
        "source_folder": str(folder),
        "source_folder_slug": slug,
        "parsed_paths": parsed_paths,
        "documents": documents,
        "doc_output_dirs": _doc_output_dirs,
        "ingestion_errors": [],
    }

    out = chunk_document(dummy_state)

    # Count the lines across all per-doc chunks.jsonl files.
    chunks_paths = out.get("chunks_paths", {})
    line_count = 0
    for path in chunks_paths.values():
        if Path(path).exists():
            with open(path, encoding="utf-8") as f:
                line_count += sum(1 for _ in f)

    print(f"\nResults:")
    print(f"  Chunks written : {line_count}")
    print(f"  Output files   : {len(chunks_paths)} per-doc chunks.jsonl")
    for src, p in chunks_paths.items():
        print(f"    {src} -> {p}")
    print(f"  Errors         : {len(out['ingestion_errors'])}")
    for e in out["ingestion_errors"]:
        short_tb = e["traceback"][:200].replace("\n", " ")
        print(f"  [{e['stage']}] {e['file']}: {short_tb}")
