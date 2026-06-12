"""
graph/nodes/enrich_chunks.py
============================
LangGraph node #4 of 6 — runs the 5 doctrine post-processors on raw chunks.

WHAT THIS NODE DOES:
  chunk_document wrote every chunk to all_chunks.jsonl using HybridChunker.
  HybridChunker is topic-agnostic — it knows nothing about military doctrine.
  enrich_chunks adds doctrine-specific metadata by running 5 post-processors
  in a locked order (from memory.md):

    1. classification_stripper   — strip "UNCLASSIFIED" / "FOUO" / etc. from text
    2. paragraph_number_extractor — detect "3-12" style paragraph IDs as metadata
    3. cross_ref_extractor        — detect "ADP 5-0" style references as metadata
    4. glossary_splitter          — split whole glossary sections into one chunk/entry
    5. acronym_expander           — build acronym table from glossary entries;
                                    append expansions to each chunk's expansion_hints

  Output: output/chunks/<slug>/enriched_chunks.jsonl
  Each line is an enriched chunk dict, ready for embed_chunks.

MEMORY DISCIPLINE (locked in memory.md "Memory hardening" row):
  We stream all_chunks.jsonl line-by-line.  Chunks for ONE source document
  are collected into a "per-doc buffer" list.  When the source_doc changes,
  the buffer is passed through all 5 processors, written to the output file,
  then freed before the next document's buffer starts accumulating.

  This ensures we hold at most ONE document's chunks in RAM at any time —
  a few thousand lines at most, never the whole folder.

WHAT FIELDS ARE ADDED BY POST-PROCESSORS?
  paragraph_number  : str | None      — first para ID in the chunk, or None
  paragraph_numbers : list[str]       — all unique para IDs in the chunk
  cross_refs        : list[str]       — doctrine doc references (e.g. "FM 3-0")
  expansion_hints   : str             — "COA: course of action | C2: ..."
  chunk_type may change to "glossary_entry" for split glossary lines.

ERROR HANDLING:
  Each post-processor is wrapped in try/except.  A failure in one processor
  is logged to ingestion_errors and the chunks continue to the next processor
  unchanged.  The whole folder is never aborted for one bad document.

CACHE GATE (sha256-based):
  Before running any post-processors on a doc's chunks, the node checks
  output/<stem>/.stage_fingerprints.json.  If enriched_chunks.jsonl
  exists AND its fingerprint matches the source sha256, all five
  post-processors are skipped and the existing file is reused.  The
  per-doc sha256 is read from state["documents"] — if the upstream
  chunker re-ran, it already refreshed the fingerprint of its own output
  and this stage will cache-hit against that same sha256.  Set
  FORCE_REPARSE=1 in .env to bypass the gate.

HOW TO RUN IN ISOLATION:
  python -m graph.nodes.enrich_chunks doctrine
  (Requires chunk_document to have already run for this folder.)
"""
from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from graph.config import FILE_ENRICHED_CHUNKS_JSONL, doc_output_dir, get_config
from graph.doctrine_vocab import compose_enrich_fingerprint
from graph.fingerprints import is_artefact_fresh, write_fingerprint
from graph.state import IngestionState

# Post-processors — in locked run order (from memory.md).
from graph.post_processors.classification_stripper import classification_stripper
from graph.post_processors.paragraph_number_extractor import paragraph_number_extractor
from graph.post_processors.cross_ref_extractor import cross_ref_extractor
from graph.post_processors.glossary_splitter import glossary_splitter
from graph.post_processors.acronym_expander import acronym_expander

# The first 4 processors share the same (list[dict]) -> list[dict] signature.
# acronym_expander takes an extra keyword argument (output_dir) and is called
# separately at the end of _run_buffer.
_PROCESSORS = [
    ("classification_stripper",    classification_stripper),
    ("paragraph_number_extractor", paragraph_number_extractor),
    ("cross_ref_extractor",        cross_ref_extractor),
    ("glossary_splitter",          glossary_splitter),
]

# Default values for enrichment fields that every output chunk must have,
# regardless of whether a processor succeeded or was even relevant.
# Using a factory-style approach (new dict each call) avoids shared mutable lists.
def _default_enrich_fields() -> dict[str, Any]:
    return {
        "paragraph_number":  None,
        "paragraph_numbers": [],
        "cross_refs":        [],
        "expansion_hints":   "",
    }


def _run_buffer(
    buffer: list[dict],
    errors: list[dict],
    doc_output: str,
) -> list[dict]:
    """
    Pass one document's chunk buffer through all 5 post-processors in order.

    Each processor is wrapped in its own try/except so a failure in one
    does not prevent the others from running.  Failed processors are logged
    and the chunks pass through to the next step unchanged.

    After all processors, every output chunk is guaranteed to have the four
    enrichment fields (paragraph_number, paragraph_numbers, cross_refs,
    expansion_hints) — even if the relevant processor failed.

    Args:
        buffer:     list of chunk dicts for one source_doc.
        errors:     shared error list, mutated in place (entries appended).
        doc_output: this doc's per-doc output folder (acronyms.json sidecar
                    lands inside it).

    Returns:
        list of enriched chunk dicts for this document.
    """
    source_doc = buffer[0].get("source_doc", "?") if buffer else "?"
    current = buffer  # we pass the list forward through each processor

    # --- Processors 1–4 ---
    for proc_name, proc_func in _PROCESSORS:
        try:
            current = proc_func(current)
        except Exception:
            errors.append({
                "stage": f"enrich:{proc_name}",
                "file":  source_doc,
                "traceback": traceback.format_exc(),
                "ts":    datetime.now(timezone.utc).isoformat(),
            })
            # current stays as-is; chunks flow through to the next processor.

    # --- Processor 5: acronym_expander (needs extra arg) ---
    try:
        current = acronym_expander(current, output_dir=doc_output)
    except Exception:
        errors.append({
            "stage": "enrich:acronym_expander",
            "file":  source_doc,
            "traceback": traceback.format_exc(),
            "ts":    datetime.now(timezone.utc).isoformat(),
        })
        # Manually ensure expansion_hints exists on every chunk since the
        # processor didn't run.
        current = [{**c, "expansion_hints": c.get("expansion_hints", "")}
                   for c in current]

    # --- Guarantee all enrichment fields exist on every output chunk ---
    # If any processor was skipped due to a failure, its fields may be absent.
    # This final pass ensures embed_chunks and upsert_to_qdrant never hit KeyError.
    final: list[dict] = []
    for chunk in current:
        defaults = _default_enrich_fields()
        defaults.update(chunk)   # actual chunk values override defaults
        final.append(defaults)

    return final


def enrich_chunks(state: IngestionState) -> dict[str, Any]:
    """
    LangGraph node: enrich raw chunks with doctrine metadata, write per-doc
    enriched JSONL files.

    Reads:
        chunks_paths        — dict {filename -> chunks.jsonl} from chunk_document
        doc_output_dirs     — dict {filename -> output/<stem>/} from main.py
        ingestion_errors    — existing error list (appended to)

    Writes:
        enriched_chunks_paths — dict {filename -> output/<stem>/enriched_chunks.jsonl}
        ingestion_errors      — updated list

    Each source doc is processed in complete isolation: its raw chunks.jsonl is
    streamed line-by-line into a per-doc buffer (all chunks share the same
    source_doc because the upstream chunk_document writes one file per doc),
    the buffer flows through the 5 post-processors, and the enriched chunks
    are written as enriched_chunks.jsonl in the same per-doc folder.  At most
    one document's chunks live in RAM at any moment.
    """
    cfg = get_config()
    chunks_paths: dict[str, str] = dict(state.get("chunks_paths") or {})
    doc_output_dirs: dict[str, str] = dict(state.get("doc_output_dirs") or {})
    errors: list[dict] = list(state.get("ingestion_errors") or [])

    # filename → sha256 lookup so the cache gate can compare against the
    # current source bytes instead of trusting upstream paths alone.
    hash_by_filename: dict[str, str] = {
        d["filename"]: d.get("sha256", "") for d in (state.get("documents") or [])
    }

    enriched_chunks_paths: dict[str, str] = {}

    for source_doc, chunks_path_str in chunks_paths.items():
        chunks_path = Path(chunks_path_str)
        doc_content_hash = hash_by_filename.get(source_doc, "")

        # Per-doc output folder (where enriched_chunks.jsonl and acronyms.json
        # land alongside the other stage artefacts for this doc).
        out_dir_str = doc_output_dirs.get(source_doc)
        out_dir = Path(out_dir_str) if out_dir_str else doc_output_dir(source_doc, cfg)
        enriched_path = out_dir / FILE_ENRICHED_CHUNKS_JSONL

        # ------------------------------------------------------------------
        # CACHE GATE — reuse enriched_chunks.jsonl if its fingerprint
        # matches the COMPOUND (source sha256 + doctrine fingerprint)
        # key.  Editing data/doctrine/{acronyms.csv,
        # classification_markings.txt, cross_ref_prefixes.txt} changes
        # the doctrine half, so this stage re-runs automatically on
        # the next invocation.  FORCE_REPARSE=1 still bypasses.
        # ------------------------------------------------------------------
        compound_hash = compose_enrich_fingerprint(doc_content_hash)
        if (
            not cfg.force_reparse
            and is_artefact_fresh(out_dir, FILE_ENRICHED_CHUNKS_JSONL, compound_hash, enriched_path)
        ):
            enriched_chunks_paths[source_doc] = str(enriched_path)
            errors.append({
                "stage":     "enrich_chunks:cached",
                "file":      source_doc,
                "traceback": f"cache hit ({compound_hash[:24]}…) — reused {enriched_path.name}",
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            continue

        # Always start fresh so a re-run doesn't leave stale enriched output.
        enriched_path.unlink(missing_ok=True)

        if not chunks_path.exists():
            errors.append({
                "stage":     "enrich_chunks",
                "file":      str(chunks_path) if chunks_path_str else "(not set)",
                "traceback": "chunks_path is missing or does not exist on disk",
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            continue

        # Stream the per-doc chunks.jsonl into a buffer, then process it.
        buffer: list[dict] = []
        with open(chunks_path, encoding="utf-8") as in_file:
            for raw_line in in_file:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    buffer.append(json.loads(raw_line))
                except json.JSONDecodeError:
                    errors.append({
                        "stage":     "enrich_chunks:json_parse",
                        "file":      str(chunks_path),
                        "traceback": f"Malformed JSON line: {raw_line[:120]}",
                        "ts":        datetime.now(timezone.utc).isoformat(),
                    })

        enriched = _run_buffer(buffer, errors, str(out_dir))

        with open(enriched_path, "w", encoding="utf-8") as out_file:
            for ec in enriched:
                out_file.write(json.dumps(ec, ensure_ascii=False) + "\n")

        enriched_chunks_paths[source_doc] = str(enriched_path)

        # Stamp the COMPOUND fingerprint so a rerun with unchanged source
        # bytes AND unchanged doctrine files can skip the post-processors
        # entirely.  Editing any data/doctrine/* file changes the
        # doctrine half and forces a rerun next time.
        if doc_content_hash:
            write_fingerprint(out_dir, FILE_ENRICHED_CHUNKS_JSONL, compound_hash)

        # Drop the buffer before moving to the next doc.
        del buffer

    return {
        "enriched_chunks_paths": enriched_chunks_paths,
        "ingestion_errors":      errors,
    }


# =============================================================================
# STANDALONE MODE — run this node directly for isolated testing
# =============================================================================
# Usage:
#   python -m graph.nodes.enrich_chunks doctrine
#   (Requires chunk_document to have already run for this folder.)

if __name__ == "__main__":
    import re as _re
    from dotenv import load_dotenv

    load_dotenv()  # read .env before get_config() accesses os.environ

    if len(sys.argv) < 2:
        print("Usage: python -m graph.nodes.enrich_chunks <folder_path_or_name>")
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

    slug = _re.sub(r"[^a-z0-9_-]", "_", folder.name.lower())[:48]

    from graph.config import FILE_CHUNKS_JSONL
    from utils.file_reader import list_documents
    cfg = get_config()
    documents = list_documents(str(folder))

    _doc_output_dirs = {
        d["filename"]: str(doc_output_dir(d["filename"], cfg)) for d in documents
    }
    chunks_paths: dict[str, str] = {}
    for d in documents:
        p = Path(_doc_output_dirs[d["filename"]]) / FILE_CHUNKS_JSONL
        if p.is_file():
            chunks_paths[d["filename"]] = str(p)

    if not chunks_paths:
        print("No per-doc chunks.jsonl files found. Run chunk_document first:")
        print("  python -m graph.nodes.chunk_document <folder>")
        sys.exit(1)

    dummy_state: IngestionState = {
        "source_folder":      str(folder),
        "source_folder_slug": slug,
        "documents":          documents,
        "doc_output_dirs":    _doc_output_dirs,
        "chunks_paths":       chunks_paths,
        "ingestion_errors":   [],
    }

    out = enrich_chunks(dummy_state)

    enriched_paths = out.get("enriched_chunks_paths", {})
    line_count = 0
    for path in enriched_paths.values():
        if Path(path).exists():
            with open(path, encoding="utf-8") as f:
                line_count += sum(1 for _ in f)

    print(f"\nResults:")
    print(f"  Enriched chunks : {line_count} (across {len(enriched_paths)} docs)")
    for src, p in enriched_paths.items():
        print(f"    {src} -> {p}")
    print(f"  Errors          : {len(out['ingestion_errors'])}")
    for e in out["ingestion_errors"]:
        short_tb = str(e.get("traceback", ""))[:200].replace("\n", " ")
        print(f"  [{e['stage']}] {e['file']}: {short_tb}")
