"""
graph/nodes/embed_chunks.py
============================
LangGraph node #5 of 6 — generates dense + sparse vector embeddings for each chunk.

WHAT IS A VECTOR EMBEDDING?
  A vector embedding is a list of numbers (e.g. 1,024 numbers) that captures
  the "meaning" of a piece of text.  Two texts with similar meanings end up
  with similar lists of numbers — so a search system can find relevant chunks
  without needing exact word matches.

  This node produces TWO kinds of embedding for each chunk:

    1. Dense (bge-m3, 1,024 dimensions)
       - Every chunk produces exactly 1,024 float numbers.
       - Similar meanings → similar vectors → accurate semantic search.
       - "army" ≈ "military force" even though they share no words.
       - Produced by BAAI/bge-m3 via the FastEmbed ONNX runtime (local, no cloud).

    2. Sparse (BM25)
       - Each chunk produces a short list of (token_id, weight) pairs.
       - Exact word matches → higher score.  Good for doctrine codes like "ADP 5-0".
       - Qdrant fuses the two result lists via RRF (Reciprocal Rank Fusion) at
         query time to give hybrid search: semantic + keyword in one query.
       - Produced by FastEmbed's pure-Python Qdrant/bm25 model (no ONNX needed).

WHAT TEXT GETS EMBEDDED?
  contextualized_text + " " + expansion_hints

  - contextualized_text is the heading-prefixed version of the chunk, produced
    by HybridChunker in chunk_document.  It encodes "which section" the chunk
    came from, making the vector context-aware.
  - expansion_hints are the acronym expansions from enrich_chunks.  Adding them
    ensures a query for "course of action" can find a chunk that only says "COA".

  If expansion_hints is empty (no acronyms in the chunk), we just use
  contextualized_text.  If contextualized_text is missing, we fall back to
  the raw text field.

OUTPUT FORMAT — per-doc .npz files:
  output/embeddings/<slug>/<doc_stem>.npz

  Each .npz contains four parallel arrays (one entry per chunk in the doc):
    chunk_ids      (N,)        dtype=object  — UUID5 string IDs for Qdrant upsert
    dense          (N, 1024)   dtype=float32 — bge-m3 dense vectors
    sparse_indices (N,)        dtype=object  — each element is an int32 array (token IDs)
    sparse_values  (N,)        dtype=object  — each element is a float32 array (TF weights)

  One file per source document (not one per folder) so peak RAM stays bounded.
  The upsert node iterates the directory, loading one .npz at a time.

MEMORY DISCIPLINE (locked in memory.md "Memory hardening" row):
  - Stream enriched_chunks.jsonl line-by-line.
  - Accumulate one source document's chunks at a time into a per-doc buffer.
  - When the source_doc field changes (or at end-of-file), embed and write.
  - Embed in batches of EMBED_BATCH_SIZE (default 32) to bound live memory.
  - After writing <doc>.npz, local arrays go out of scope and are freed.
  - The folder's complete vector set is NEVER held in RAM at once.

EMBEDDER LIFECYCLE:
  - Both embedders are lazy singletons — loaded once per process on first call.
  - bge-m3 ONNX weights are ~2.3 GB.  Reloading per doc would be catastrophically slow.
  - First run downloads bge-m3 to ~/.cache/fastembed/ (one-time, ~2 min + ~2.3 GB).
  - Subsequent runs load from disk cache in ~5–10 s on an M4 Mac.
  - BM25 is a pure-Python model; its "download" is a tiny word-list file.

CACHE GATE (sha256-based):
  Before embedding, the node checks output/<stem>/.stage_fingerprints.json.
  If embeddings.npz exists AND its fingerprint matches the source sha256,
  both embedders are skipped and the existing .npz is reused.  Set
  FORCE_REPARSE=1 in .env to bypass this gate.

HOW TO RUN IN ISOLATION:
  python -m graph.nodes.embed_chunks doctrine
  (Requires enrich_chunks to have already run for this folder.)
"""
from __future__ import annotations

import json
import sys
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from fastembed import SparseTextEmbedding

from graph.config import FILE_EMBEDDINGS_NPZ, doc_output_dir, get_config
from graph.doctrine_vocab import compose_enrich_fingerprint
from graph.fingerprints import is_artefact_fresh, write_fingerprint
from graph.shared.embedders import (
    _get_dense_embedder,
    _get_sparse_embedder,
)
from graph.state import IngestionState


# ---------------------------------------------------------------------------
# EMBEDDER SINGLETONS are owned by graph/shared/embedders.py so Phase 2
# retrieval reuses the same instances:
#   _get_dense_embedder()  → HttpDenseEmbedder (HTTP, OpenAI-compatible)
#   _get_sparse_embedder() → fastembed.SparseTextEmbedding (in-process BM25)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# FIXED UUID NAMESPACE for deterministic chunk IDs.
#
# uuid5(namespace, seed) = SHA-1 of (namespace_bytes + seed_string), yielding
# a stable 128-bit UUID.  Using a fixed namespace means:
#   same source_doc + same chunk_index → same UUID, every time.
# This makes Qdrant upsert idempotent: re-ingesting an unchanged doc produces
# points with identical IDs, so Qdrant simply overwrites them (no duplicates).
# ---------------------------------------------------------------------------
_CHUNK_NS = uuid.UUID("abe5c4a0-5f8e-4f79-b4a0-7e5f6c3a9d1b")


# ---------------------------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------------------------

def _build_embed_text(chunk: dict) -> str:
    """
    Build the string that gets embedded for a chunk.

    We join contextualized_text and expansion_hints with a space.
    If expansion_hints is empty (common for non-doctrinal chunks), we just
    return contextualized_text.  This keeps the empty-hints case clean and
    avoids a trailing space in the vector input.

    Falls back to raw text if contextualized_text is absent — this should
    not happen in normal flow but prevents a silent empty-string embedding.
    """
    ctx_text = (chunk.get("contextualized_text") or chunk.get("text") or "").strip()
    hints = (chunk.get("expansion_hints") or "").strip()
    if hints:
        return f"{ctx_text} {hints}"
    return ctx_text


def _make_chunk_id(source_doc: str, chunk_index: int) -> str:
    """
    Produce a deterministic UUID5 string for a (source_doc, chunk_index) pair.

    The seed string format is "source_doc:chunk_index" — the colon separator
    prevents "doc1" + "23" from colliding with "doc12" + "3".
    """
    seed = f"{source_doc}:{chunk_index}"
    return str(uuid.uuid5(_CHUNK_NS, seed))


def _embed_doc_buffer(
    buffer: list[dict],
    dense_emb: object,            # HttpDenseEmbedder (HTTP)
    sparse_emb: SparseTextEmbedding,
    batch_size: int,
) -> tuple[list[str], np.ndarray, list[np.ndarray], list[np.ndarray]]:
    """
    Embed all chunks for one source document and return the raw arrays.

    `batch_size` is passed to both embed() calls so FastEmbed processes the
    texts in groups of that size internally — keeping peak RAM bounded without
    us needing to slice the list manually.

    Returns four parallel collections (index i = chunk i):
      chunk_ids   : list[str]         — deterministic UUID5 strings
      dense_arr   : np.ndarray        — shape (N, 1024) float32
      sp_indices  : list[np.ndarray]  — int32 token-ID array per chunk
      sp_values   : list[np.ndarray]  — float32 TF-weight array per chunk

    Raises on any embedding failure — the caller wraps this in try/except
    and logs the error so the pipeline continues with other documents.
    """
    # Build the text-to-embed and a UUID for every chunk in this document.
    # These are just strings — safe to hold for one doc at a time.
    texts = [_build_embed_text(c) for c in buffer]
    chunk_ids = [
        _make_chunk_id(c.get("source_doc", ""), int(c.get("chunk_index", i)))
        for i, c in enumerate(buffer)
    ]

    # --- Dense embeddings ---
    # TextEmbedding.embed() accepts the full list and handles its own internal
    # batching via the batch_size argument.  It returns a lazy generator, so
    # we wrap it in list() to force all vectors to be computed now.
    # Each yielded item is a 1-D numpy array of shape (1024,).
    dense_list = list(dense_emb.embed(texts, batch_size=batch_size))

    # --- Sparse embeddings ---
    # SparseTextEmbedding.embed() works the same way — lazy generator, one
    # SparseEmbedding per text.  A SparseEmbedding has two parallel arrays:
    #   .indices : int32 array  — hashed token IDs (which vocabulary words appeared)
    #   .values  : float32 array — BM25 term-frequency weight for each token
    # The arrays are variable-length: a long chunk has more non-zero entries
    # than a short one.
    sp_indices_list: list[np.ndarray] = []
    sp_values_list: list[np.ndarray] = []
    for se in sparse_emb.embed(texts, batch_size=batch_size):
        sp_indices_list.append(np.asarray(se.indices, dtype=np.int32))
        sp_values_list.append(np.asarray(se.values, dtype=np.float32))

    # Stack the individual (1024,) vectors into a single 2-D matrix (N, 1024).
    # np.stack() requires every sub-array to have the same shape — bge-m3
    # always outputs exactly 1024 values, so this is always safe.
    dense_arr = np.stack(dense_list, axis=0).astype(np.float32)

    return chunk_ids, dense_arr, sp_indices_list, sp_values_list


def _write_npz(
    out_path: Path,
    chunk_ids: list[str],
    dense_arr: np.ndarray,
    sp_indices_list: list[np.ndarray],
    sp_values_list: list[np.ndarray],
) -> None:
    """
    Write one document's embeddings to a compressed NumPy archive (.npz).

    WHY OBJECT ARRAYS FOR SPARSE DATA?
    Sparse vectors are "ragged" — each chunk has a different number of
    non-zero tokens.  NumPy can't store ragged arrays in a regular 2-D matrix.
    The workaround is to use a 1-D array of dtype=object, where each element
    is itself a small NumPy array of a different length.  np.load() with
    allow_pickle=True reconstructs them correctly.

    The upsert node loads this file with:
        data = np.load(path, allow_pickle=True)
        chunk_ids      = data["chunk_ids"]        # (N,) str object array
        dense          = data["dense"]             # (N, 1024) float32
        sparse_indices = data["sparse_indices"]    # (N,) object → int32 arrays
        sparse_values  = data["sparse_values"]     # (N,) object → float32 arrays
    """
    N = len(chunk_ids)

    # String IDs stored as an object array (numpy can't make a typed str array
    # with variable-length strings without dtype=object).
    chunk_ids_arr = np.array(chunk_ids, dtype=object)

    # Ragged sparse arrays — one sub-array per chunk.
    sparse_indices_arr = np.empty(N, dtype=object)
    sparse_values_arr = np.empty(N, dtype=object)
    for i in range(N):
        sparse_indices_arr[i] = sp_indices_list[i]
        sparse_values_arr[i] = sp_values_list[i]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        out_path,
        chunk_ids=chunk_ids_arr,
        dense=dense_arr,
        sparse_indices=sparse_indices_arr,
        sparse_values=sparse_values_arr,
    )


# ---------------------------------------------------------------------------
# MAIN NODE FUNCTION
# ---------------------------------------------------------------------------

def embed_chunks(state: IngestionState) -> dict[str, Any]:
    """
    LangGraph node #6: embed enriched chunks with bge-m3 (dense) and BM25 (sparse).

    Reads from state:
        enriched_chunks_paths — dict {filename -> enriched_chunks.jsonl}
        doc_output_dirs       — dict {filename -> output/<stem>/}
        ingestion_errors      — existing error list (we append to it, never replace)

    Writes to state:
        embeddings_paths      — dict {filename -> output/<stem>/embeddings.npz}
        ingestion_errors      — updated list (new errors appended)
    """
    cfg = get_config()
    enriched_paths: dict[str, str] = dict(state.get("enriched_chunks_paths") or {})
    doc_output_dirs: dict[str, str] = dict(state.get("doc_output_dirs") or {})
    errors: list[dict] = list(state.get("ingestion_errors") or [])

    # filename → sha256 lookup for the cache gate.
    hash_by_filename: dict[str, str] = {
        d["filename"]: d.get("sha256", "") for d in (state.get("documents") or [])
    }

    embeddings_paths: dict[str, str] = {}

    if not enriched_paths:
        errors.append({
            "stage":     "embed_chunks",
            "file":      "(no enriched_chunks_paths)",
            "traceback": "enriched_chunks_paths is empty — enrich_chunks produced nothing",
            "ts":        datetime.now(timezone.utc).isoformat(),
        })
        return {"embeddings_paths": embeddings_paths, "ingestion_errors": errors}

    # Defer loading the bge-m3 + BM25 embedders: if every eligible doc is a
    # cache hit we skip the ~5–10 s ONNX load entirely.  _ensure_embedders
    # pulls both via the existing lazy-singleton helpers only when the first
    # real miss happens.
    _dense_emb: Any = None
    _sparse_emb: Any = None

    def _ensure_embedders() -> tuple[Any, Any]:
        nonlocal _dense_emb, _sparse_emb
        if _dense_emb is None:
            _dense_emb = _get_dense_embedder()
        if _sparse_emb is None:
            _sparse_emb = _get_sparse_embedder()
        return _dense_emb, _sparse_emb

    for source_doc, enriched_path_str in enriched_paths.items():
        enriched_path = Path(enriched_path_str)
        doc_content_hash = hash_by_filename.get(source_doc, "")

        if not enriched_path.exists():
            errors.append({
                "stage":     "embed_chunks",
                "file":      str(enriched_path),
                "traceback": "enriched_chunks.jsonl is missing on disk",
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            continue

        # Per-doc output folder (same one enrich_chunks wrote into).
        out_dir_str = doc_output_dirs.get(source_doc)
        out_dir = Path(out_dir_str) if out_dir_str else doc_output_dir(source_doc, cfg)
        out_path = out_dir / FILE_EMBEDDINGS_NPZ

        # ------------------------------------------------------------------
        # CACHE GATE — reuse embeddings.npz if its fingerprint matches the
        # COMPOUND (source sha256 + doctrine fingerprint) key.  Mirrors
        # enrich_chunks so edits to data/doctrine/* cascade here as well:
        # enrich re-runs with new acronym / classification / cross-ref
        # rules, enriched text changes, the embedding input therefore
        # changes, so embed must re-run too.  FORCE_REPARSE=1 bypasses.
        # ------------------------------------------------------------------
        compound_hash = compose_enrich_fingerprint(doc_content_hash)
        if (
            not cfg.force_reparse
            and is_artefact_fresh(out_dir, FILE_EMBEDDINGS_NPZ, compound_hash, out_path)
        ):
            embeddings_paths[source_doc] = str(out_path)
            errors.append({
                "stage":     "embed_chunks:cached",
                "file":      source_doc,
                "traceback": f"cache hit ({compound_hash[:24]}…) — reused {out_path.name}",
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            continue

        # Load this doc's chunks into a buffer.  One doc's chunks fit in RAM
        # per the memory-hardening contract; the next doc is only loaded after
        # this one's .npz is written and the buffer is dropped.
        buffer: list[dict] = []
        with open(enriched_path, encoding="utf-8") as in_file:
            for raw_line in in_file:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    buffer.append(json.loads(raw_line))
                except json.JSONDecodeError:
                    errors.append({
                        "stage":     "embed_chunks:json_parse",
                        "file":      str(enriched_path),
                        "traceback": f"Malformed JSON line: {raw_line[:120]}",
                        "ts":        datetime.now(timezone.utc).isoformat(),
                    })

        if not buffer:
            # Empty enriched file — nothing to embed, not an error.
            continue

        try:
            dense_emb, sparse_emb = _ensure_embedders()
            ids, dense_arr, sp_idx, sp_val = _embed_doc_buffer(
                buffer, dense_emb, sparse_emb, cfg.embed_batch_size
            )
            _write_npz(out_path, ids, dense_arr, sp_idx, sp_val)
            embeddings_paths[source_doc] = str(out_path)
            # Stamp the COMPOUND fingerprint so a rerun with the same
            # source bytes AND unchanged doctrine files can skip the full
            # ONNX forward pass next time; any doctrine edit invalidates.
            if doc_content_hash:
                write_fingerprint(out_dir, FILE_EMBEDDINGS_NPZ, compound_hash)
        except Exception:
            errors.append({
                "stage":     "embed_chunks",
                "file":      source_doc,
                "traceback": traceback.format_exc(),
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            # No .npz emitted for this doc; upsert will skip it.
        finally:
            del buffer

    return {
        "embeddings_paths": embeddings_paths,
        "ingestion_errors": errors,
    }


# =============================================================================
# STANDALONE MODE — run this node directly for isolated testing
# =============================================================================
# Usage:
#   python -m graph.nodes.embed_chunks doctrine
#
# What it does:
#   1. Locates enriched_chunks.jsonl for the given folder.
#   2. Calls embed_chunks() with a minimal dummy state.
#   3. Prints a summary: how many .npz files were written, their shapes,
#      the dense norm of the first chunk (should be ~1.0 for bge-m3),
#      and the number of non-zero sparse tokens for the first chunk.
#
# First run will download bge-m3 (~2.3 GB) to ~/.cache/fastembed/ if not cached.

if __name__ == "__main__":
    import re as _re
    from dotenv import load_dotenv

    load_dotenv()  # read .env before get_config() accesses os.environ

    if len(sys.argv) < 2:
        print("Usage: python -m graph.nodes.embed_chunks <folder_path_or_name>")
        sys.exit(1)

    # Accept either a full path or a short name under inputs/
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

    from graph.config import FILE_ENRICHED_CHUNKS_JSONL
    from utils.file_reader import list_documents
    cfg = get_config()
    documents = list_documents(str(folder))

    _doc_output_dirs = {
        d["filename"]: str(doc_output_dir(d["filename"], cfg)) for d in documents
    }
    enriched_paths: dict[str, str] = {}
    for d in documents:
        p = Path(_doc_output_dirs[d["filename"]]) / FILE_ENRICHED_CHUNKS_JSONL
        if p.is_file():
            enriched_paths[d["filename"]] = str(p)

    if not enriched_paths:
        print("No per-doc enriched_chunks.jsonl files found. Run enrich_chunks first:")
        print("  python -m graph.nodes.enrich_chunks <folder>")
        sys.exit(1)

    dummy_state: IngestionState = {
        "source_folder":       str(folder),
        "source_folder_slug":  slug,
        "documents":           documents,
        "doc_output_dirs":     _doc_output_dirs,
        "enriched_chunks_paths": enriched_paths,
        "ingestion_errors":    [],
    }

    print("Loading embedders…")
    print("  (bge-m3 first load: ~5–10 s from cache, or ~2 min + 2.3 GB download if uncached)")
    out = embed_chunks(dummy_state)

    emb_paths = out.get("embeddings_paths", {})
    npz_files = [Path(p) for p in emb_paths.values() if Path(p).exists()]

    print(f"\nResults:")
    print(f"  .npz files     : {len(npz_files)}")
    for src, p in emb_paths.items():
        print(f"    {src} -> {p}")
    print(f"  Errors         : {len(out['ingestion_errors'])}")
    for e in out["ingestion_errors"]:
        short_tb = str(e.get("traceback", ""))[:200].replace("\n", " ")
        print(f"  [{e['stage']}] {e['file']}: {short_tb}")

    # Inspect up to 3 .npz files to confirm the arrays are sensible.
    for npz_path in npz_files[:3]:
        data = np.load(str(npz_path), allow_pickle=True)
        chunk_ids      = data["chunk_ids"]
        dense          = data["dense"]
        sparse_indices = data["sparse_indices"]
        sparse_values  = data["sparse_values"]

        print(f"\n  {npz_path.name}:")
        print(f"    chunks              : {len(chunk_ids)}")
        print(f"    dense shape         : {dense.shape}")

        if len(dense) > 0:
            # bge-m3 normalises its output vectors to unit length (L2 norm ≈ 1.0).
            # A norm far from 1.0 would indicate an embedding problem.
            norm0 = float(np.linalg.norm(dense[0]))
            print(f"    dense norm [0]      : {norm0:.4f}  (expect ~1.0 for bge-m3)")

        if len(sparse_indices) > 0 and sparse_indices[0] is not None:
            nnz = len(sparse_indices[0])
            print(f"    sparse nnz [0]      : {nnz} non-zero tokens")

        if len(chunk_ids) > 0:
            print(f"    chunk_ids[0]        : {chunk_ids[0]}")
