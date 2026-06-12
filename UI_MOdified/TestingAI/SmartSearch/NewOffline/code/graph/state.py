"""
IngestionState — the single TypedDict that flows through the LangGraph pipeline.

Design rules (locked in memory.md "State storage" row):
- State holds PATHS only.  Actual DoclingDocuments, chunks, and vectors live
  on disk; nodes read/write files and store the file paths here.
- total=False so nodes can add their keys incrementally without every prior
  key being required.

Layout: every stage's artefact for a given source doc lives in the same
per-doc folder under `output/<safe_stem>/`.  Path fields here either hold
that folder itself or a specific file inside it, keyed by source filename
so downstream nodes can look up the right path per doc.
"""
from typing import Literal, TypedDict


class IngestionState(TypedDict, total=False):
    # ------------------------------------------------------------------ #
    # Set at graph start (by main.py before invoking the graph)           #
    # ------------------------------------------------------------------ #
    source_folder: str              # absolute path to the folder being ingested
    source_folder_slug: str         # safe collection-name component, e.g. "doctrine"
    documents: list[dict]           # [{"path": str, "filename": str, "sha256": str, "size": int}]
    doc_output_dirs: dict[str, str] # filename -> absolute path of output/<stem>/

    # ------------------------------------------------------------------ #
    # Set by initialpages_convert (node #1)                               #
    # Maps source file path -> path of its first-10-pages markdown inside #
    # that doc's output folder (output/<stem>/initial_pages.md).  Missing #
    # entries mean the initial-parse failed for that doc; check_documents #
    # falls back to the "[Binary document - ...]" placeholder.            #
    # ------------------------------------------------------------------ #
    initial_parsed_paths: dict[str, str]

    # ------------------------------------------------------------------ #
    # Set by check_documents                                              #
    #                                                                     #
    # The gate makes ONE LLM call per document.  The folder-level         #
    # `decision` is "enough" if at least one doc was accepted, else       #
    # "not enough" and the graph routes to END.                           #
    #                                                                     #
    # Per-doc fields:                                                     #
    #   document_decisions : filename -> "enough" | "not enough"          #
    #   document_remarks   : filename -> short LLM remark for that doc    #
    #   eligible_documents : subset of `documents` whose decision was     #
    #                        "enough" — downstream nodes iterate THIS     #
    #                        list instead of `documents` so rejected      #
    #                        docs cannot slip through.                    #
    #   rejected_documents : subset rejected (kept for reporting).        #
    #   rejected_review_dir: output/not_enough/<folder_slug>/ where the   #
    #                        per-rejected-doc review artefacts live.     #
    #                                                                     #
    # The ORIGINAL `documents` list is preserved unchanged so error       #
    # routing, summaries, and bookkeeping still see every input doc.      #
    # ------------------------------------------------------------------ #
    decision: Literal["enough", "not enough"]
    remarks: str
    document_decisions: dict[str, str]
    document_remarks: dict[str, str]
    eligible_documents: list[dict]
    rejected_documents: list[dict]
    rejected_review_dir: str

    # ------------------------------------------------------------------ #
    # Set by convert_document                                             #
    # Keyed by source filename so each downstream stage can find the      #
    # right artefact per doc.  convert_document iterates                  #
    # `eligible_documents` when present so rejected docs are never        #
    # parsed, chunked, embedded, or upserted.                             #
    # ------------------------------------------------------------------ #
    parsed_paths: dict[str, str]        # filename -> output/<stem>/parsed.json
    diagnostics_paths: dict[str, str]   # filename -> output/<stem>/diagnostics.json

    # ------------------------------------------------------------------ #
    # Set by chunk_document                                               #
    # One chunks.jsonl per source doc (not one folder-wide file).         #
    # ------------------------------------------------------------------ #
    chunks_paths: dict[str, str]        # filename -> output/<stem>/chunks.jsonl

    # ------------------------------------------------------------------ #
    # Set by enrich_chunks                                                #
    # ------------------------------------------------------------------ #
    enriched_chunks_paths: dict[str, str]   # filename -> output/<stem>/enriched_chunks.jsonl

    # ------------------------------------------------------------------ #
    # Set by embed_chunks                                                 #
    # ------------------------------------------------------------------ #
    embeddings_paths: dict[str, str]    # filename -> output/<stem>/embeddings.npz

    # ------------------------------------------------------------------ #
    # Set by upsert_to_qdrant                                             #
    # ------------------------------------------------------------------ #
    collection_name: str
    point_ids: list[str]
    chunk_count: int

    # ------------------------------------------------------------------ #
    # Cross-cutting (written by multiple nodes via append)                #
    # ------------------------------------------------------------------ #
    ingestion_status: Literal["ok", "partial", "failed"]
    ingestion_errors: list[dict]    # [{stage, file, traceback, ts}]
