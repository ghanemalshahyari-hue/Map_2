"""
main.py — Entry point for the ingestion pipeline.

Run this to ingest every sub-folder of inputs/ into Qdrant.

Usage:
    python main.py

WHAT THIS FILE DOES:
  1. Loads environment variables from .env (OPENAI_API_KEY or LM Studio's
     LLM_BASE_URL + LLM_API_KEY, QDRANT_URL, etc.)
  2. Builds and compiles the 7-node LangGraph ingestion graph (once).
  3. Walks every sub-folder in inputs/ (the source-of-truth corpus folder).
  4. For each folder: lists its documents, seeds the initial state, invokes
     the graph, and prints a compact result summary.

IMPORTANT: load_dotenv() MUST be called before any graph/ import.
  The graph nodes use a lazy-singleton pattern (_get_llm(), _get_client(), etc.)
  which reads environment variables on first call.  load_dotenv() fills those
  variables from .env.  If load_dotenv() ran AFTER the imports, the singletons
  might initialise before the keys are available and crash.

  This is why load_dotenv() is the very first non-comment statement here —
  before even the graph/ imports below it.

FOLDER REQUIREMENTS:
  - inputs/<folder_name>/ must exist and contain at least one .txt, .pdf,
    or .docx file.  Each sub-folder of inputs/ becomes one Qdrant collection
    named ingest__<folder_slug>__bgem3.
  - Qdrant must be running: colima start && docker start qdrant
  - OPENAI_API_KEY must be set in .env (use a placeholder like "lm-studio" when
    pointing LLM_BASE_URL at a local OpenAI-compatible server such as LM Studio)

WHAT GETS WRITTEN TO DISK per folder (after a successful run):
  output/initial_parsed/<slug>/   — first-10-pages markdown preview per binary doc
                                    (produced by initialpages_convert; read by
                                    check_documents so the LLM gate sees content)
  output/parsed/<slug>/           — Docling JSON + diagnostics per doc
  output/chunks/<slug>/           — all_chunks.jsonl + enriched_chunks.jsonl
  output/embeddings/<slug>/       — per-doc <doc>.npz (dense + sparse vectors)
  output/acronyms/                — per-doc acronym table (if doc has glossary)
  output/errors/<slug>.jsonl      — any per-doc failures (empty = all OK)
  Qdrant collection               — ingest__<slug>__bgem3
  Qdrant _registry                — one manifest point per collection
"""

# MUST be first — loads .env into os.environ before any graph/ code runs.
from dotenv import load_dotenv
load_dotenv()

import json
import re
import sys
from pathlib import Path

from graph.builder import build_graph
from graph.config import (
    FILE_ERRORS_JSONL,
    collection_name as make_collection_name,
    doc_output_dir,
    get_config,
)
from utils.file_reader import list_documents


def _dump_errors_per_doc(
    errors: list[dict],
    documents: list[dict],
    doc_output_dirs: dict[str, str],
    output_root: Path,
) -> None:
    """
    Write per-doc errors.jsonl into each document's output folder.

    Errors whose `file` field matches a source filename (or its absolute path)
    are routed to that doc's folder.  Anything else (registry / collection
    failures) lands in output/_folder_errors.jsonl so nothing is dropped.
    """
    if not errors:
        return

    # Build lookups: filename and absolute path both point at the doc's folder.
    path_to_filename: dict[str, str] = {d["path"]: d["filename"] for d in documents}
    filenames = {d["filename"] for d in documents}

    per_doc: dict[str, list[dict]] = {}
    folder_level: list[dict] = []

    for err in errors:
        file_field = err.get("file") or ""
        # Try absolute path first, then bare filename.
        filename = path_to_filename.get(file_field)
        if filename is None and file_field in filenames:
            filename = file_field
        if filename is None:
            folder_level.append(err)
        else:
            per_doc.setdefault(filename, []).append(err)

    for filename, doc_errors in per_doc.items():
        out_dir = Path(doc_output_dirs.get(filename, "")) if filename in doc_output_dirs else None
        if out_dir is None or not str(out_dir):
            folder_level.extend(doc_errors)
            continue
        out_path = out_dir / FILE_ERRORS_JSONL
        with open(out_path, "w", encoding="utf-8") as fh:
            for e in doc_errors:
                fh.write(json.dumps(e, ensure_ascii=False) + "\n")

    if folder_level:
        output_root.mkdir(parents=True, exist_ok=True)
        with open(output_root / "_folder_errors.jsonl", "a", encoding="utf-8") as fh:
            for e in folder_level:
                fh.write(json.dumps(e, ensure_ascii=False) + "\n")


def _make_slug(folder_name: str) -> str:
    """
    Convert a folder name to a safe Qdrant collection name component.

    Rules (locked in memory.md):
      - Lowercase
      - Replace any character that is not a-z, 0-9, underscore, or hyphen with _
      - Truncate to 48 characters
    """
    return re.sub(r"[^a-z0-9_-]", "_", folder_name.lower())[:48]


def main() -> None:
    """
    Walk inputs/ and run the ingestion pipeline on each sub-folder.
    """
    cfg = get_config()

    from graph.shared.device_banner import print_device_banner
    print_device_banner()

    # Build the graph once — compilation validates structure and is expensive.
    # Reused across all folders.
    print("Building graph…")
    app = build_graph()
    print("Graph compiled.\n")

    inputs_dir = Path("inputs")
    if not inputs_dir.is_dir():
        print("Error: inputs/ directory not found.")
        print("Create it and add at least one sub-folder with documents.")
        print("Example layout:")
        print("  inputs/doctrine/*.pdf      → collection ingest__doctrine__bgem3")
        sys.exit(1)

    # Collect all sub-folders, sorted alphabetically for a consistent run order.
    folders = sorted(f for f in inputs_dir.iterdir() if f.is_dir())

    if not folders:
        print("No folders found in inputs/ — nothing to do.")
        sys.exit(0)

    print("=" * 65)
    print("  INGESTION PIPELINE")
    print("=" * 65)

    for folder in folders:
        slug = _make_slug(folder.name)
        coll_name = make_collection_name(slug, cfg)
        documents = list_documents(str(folder))

        print(f"\nFolder      : {folder.name}")
        print(f"  Slug      : {slug}")
        print(f"  Collection: {coll_name}")

        if not documents:
            print("  No supported documents (.txt / .pdf / .docx) — skipping.")
            print("-" * 65)
            continue

        print(f"  Documents : {len(documents)}")
        for doc in documents:
            size_kb = doc["size"] // 1024
            print(f"    - {doc['filename']}  ({size_kb} KB)")

        # ------------------------------------------------------------------
        # SEED INITIAL STATE
        # State fields set here are read by the nodes:
        #   source_folder         — absolute path, used for logging
        #   source_folder_slug    — safe collection name component
        #   documents             — file metadata list (path, filename, sha256, size)
        #   doc_output_dirs       — filename -> output/<safe_stem>/ (one per doc).
        #                           Pre-created here so every stage just looks up
        #                           its write target instead of recomputing it.
        #   initial_parsed_paths  — populated by initialpages_convert; seeded
        #                           empty so check_documents sees an empty dict
        #                           (safe fallback) if that node ever skips.
        #   ingestion_errors      — start empty; nodes append errors to this list
        #
        # NOTE: "documents" holds metadata only.  initialpages_convert runs
        # Docling on the first 10 pages of each binary doc and writes a
        # markdown preview; check_documents reads those previews instead of a
        # placeholder.  convert_document then runs the full Docling parse.
        # ------------------------------------------------------------------
        doc_output_dirs = {
            d["filename"]: str(doc_output_dir(d["filename"], cfg))
            for d in documents
        }

        initial_state = {
            "source_folder":        str(folder.resolve()),
            "source_folder_slug":   slug,
            "documents":            documents,
            "doc_output_dirs":      doc_output_dirs,
            "initial_parsed_paths": {},
            "ingestion_errors":     [],
        }

        print(f"\n  Running pipeline…")

        result = app.invoke(initial_state)

        # ------------------------------------------------------------------
        # DUMP PER-DOC ERRORS TO DISK
        # Each error carries a `file` field (source filename or absolute path).
        # We group errors by source doc and write one errors.jsonl per-doc
        # inside that doc's output folder.  Errors that don't correspond to a
        # specific doc (rare — registry/collection errors) land in a folder-
        # level errors.jsonl at the output root.
        # ------------------------------------------------------------------
        raw_errors = result.get("ingestion_errors", []) or []
        _dump_errors_per_doc(raw_errors, documents, doc_output_dirs, Path(cfg.output_dir))

        # ------------------------------------------------------------------
        # PRINT RESULTS
        # ------------------------------------------------------------------
        decision = result.get("decision", "n/a")
        remarks  = result.get("remarks",  "")
        eligible = result.get("eligible_documents", []) or []
        rejected = result.get("rejected_documents", []) or []
        per_doc  = result.get("document_decisions", {}) or {}
        review_dir = result.get("rejected_review_dir", "") or ""

        print(f"  [check]   Total    : {len(documents)}")
        print(f"  [check]   Accepted : {len(eligible)}")
        print(f"  [check]   Rejected : {len(rejected)}")
        print(f"  [check]   Decision : {decision}")
        print(f"  [check]   Remarks  : {remarks[:160]}")

        # Per-doc verdict table (compact).  Rejected docs also list the
        # review artefact location so a human can open it immediately.
        if per_doc:
            for fn, dec in per_doc.items():
                mark = "OK " if dec == "enough" else "REJ"
                print(f"    [{mark}] {fn}")

        if rejected and review_dir:
            print(f"  [check]   Review artefacts: {review_dir}")
            print("              (one folder per rejected doc — check_decision.json + initial_pages.md)")

        if decision != "enough":
            print("  Pipeline stopped at check_documents (no eligible docs).")
            print("-" * 65)
            continue

        if rejected:
            print(f"  Pipeline continuing with {len(eligible)} accepted doc(s); "
                  f"{len(rejected)} rejected doc(s) stopped at the gate.")

        status      = result.get("ingestion_status", "n/a")
        chunk_count = result.get("chunk_count", 0)
        errors      = result.get("ingestion_errors", [])

        # Separate audit skips / cache hits from real errors.  Both
        # "stage:skipped" and "stage:cached" are non-failure audit notes.
        def _is_audit(stage: str) -> bool:
            return stage.endswith(":skipped") or stage.endswith(":cached")

        real_errors = [e for e in errors if not _is_audit(e.get("stage", ""))]
        skips       = [e for e in errors if     e.get("stage", "").endswith(":skipped")]

        # ------------------------------------------------------------------
        # CACHE SUMMARY — per upstream stage, count cached vs. executed.
        # Cached counts come from the ":cached" audit entries emitted by
        # each gated node.  Executed counts are the eligible-doc total
        # minus cached (all eligible docs flow through every stage unless
        # cache-gated).  Only upstream stages appear; upsert keeps its
        # own per-doc Qdrant hash gate and is not sha256-cache-gated here.
        # ------------------------------------------------------------------
        eligible_count = len(result.get("eligible_documents") or [])
        cache_stages = [
            ("initialpages_convert", len(documents)),  # runs on every doc, pre-gate
            ("convert_document",     eligible_count),
            ("chunk_document",       eligible_count),
            ("enrich_chunks",        eligible_count),
            ("embed_chunks",         eligible_count),
        ]
        cached_by_stage: dict[str, int] = {s: 0 for s, _ in cache_stages}
        for err in errors:
            stage = err.get("stage", "")
            if stage.endswith(":cached"):
                base = stage[: -len(":cached")]
                if base in cached_by_stage:
                    cached_by_stage[base] += 1
        for stage_name, total in cache_stages:
            cached   = cached_by_stage.get(stage_name, 0)
            executed = max(total - cached, 0)
            print(f"  [cache]   {stage_name:<22}: {cached} cached, {executed} executed")

        print(f"  [result]  Status   : {status}")
        print(f"  [result]  Chunks   : {chunk_count}")
        print(f"  [result]  Skipped  : {len(skips)} doc(s) unchanged")
        print(f"  [result]  Errors   : {len(real_errors)}")

        # Print the first 3 real errors for quick diagnosis.
        for err in real_errors[:3]:
            short_tb = str(err.get("traceback", ""))[:120].replace("\n", " ")
            print(f"    ERROR [{err.get('stage','?')}] {err.get('file','?')}: {short_tb}")

        print("-" * 65)

    print(f"\nDone! Qdrant dashboard: {cfg.qdrant_url}/dashboard")


if __name__ == "__main__":
    main()
