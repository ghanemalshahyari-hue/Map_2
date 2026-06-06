"""
graph/nodes/upsert_to_qdrant.py
================================
LangGraph node #6 of 6 — stores enriched, embedded chunks into Qdrant.

WHAT IS QDRANT?
  Qdrant is a vector database: a specialised storage system that lets you
  store chunks of text alongside their vector embeddings, and later retrieve
  the closest matches to a query vector.  We run it locally in Docker.

  This node creates (or reuses) one Qdrant "collection" per source folder.
  A collection is like a database table: it holds a fixed set of fields per
  row (called a "point"), with two special fields that hold vectors.

NAMED VECTORS (two per point):
  "dense"  — 1024 float numbers from BAAI/bge-m3, written by embed_chunks.
             Used for semantic search: finds conceptually similar text even if
             no words overlap.  COSINE distance compares the angle between
             two vectors — bge-m3 outputs unit-length vectors so COSINE works
             perfectly.
  "sparse" — a short list of (token_id, weight) pairs from FastEmbed BM25,
             also written by embed_chunks.  Used for keyword search: exact or
             near-exact word matches, especially good for doctrine codes like
             "ADP 5-0".

  WHY BOTH?  At query time Qdrant fuses the ranked results from both vectors
  using RRF (Reciprocal Rank Fusion) — the hybrid query gives you both semantic
  AND keyword relevance in one round-trip.

MODIFIER=IDF (REQUIRED for sparse vector):
  FastEmbed's Qdrant/bm25 stores raw term-frequency (TF) weights.  BM25 needs
  IDF (inverse document frequency) to penalise common words.  We tell Qdrant
  to compute IDF on its side by setting modifier=Modifier.IDF on the sparse
  vector index.  Without it, common words like "the" or "section" get the same
  weight as rare doctrine codes — BM25 degenerates to TF-only scoring.

HASH-GATED RE-INGEST:
  Every chunk payload carries doc_content_hash = sha256 of the original file.
  Before re-ingesting a document we compare the new hash against the one stored
  in Qdrant from the last run.
    - Hash UNCHANGED → skip the doc entirely (no delete, no upsert).
    - Hash CHANGED   → delete old points for this doc, then upsert fresh ones.
    - Not in Qdrant  → upsert fresh points.
  This makes the pipeline idempotent: re-running it is safe and cheap.

PAYLOAD INDEXES (5 fields):
  KEYWORD indexes are built BEFORE the first upsert so Qdrant never needs to
  rebuild them over existing data.  create_payload_index() is idempotent —
  calling it on an already-indexed field is a harmless no-op, so we call it
  every run to guard against a partially-failed first run.

_REGISTRY COLLECTION:
  A separate "_registry" collection holds one manifest point per managed
  collection.  It records: slug, folder path, embedder version, chunk count,
  created_at timestamp, and a folder-level content hash.  This lets you inspect
  "what's in Qdrant" without scrolling individual collections.  The registry
  has no payload indexes — its row count stays in the dozens, so Qdrant's
  full-scan is fast enough.

MEMORY DISCIPLINE (locked in memory.md "Memory hardening" row):
  - Stream enriched_chunks.jsonl line-by-line, grouped by source_doc.
  - For each doc: load its <doc>.npz, hash-gate, build PointStructs.
  - Upsert in batches of UPSERT_BATCH_SIZE (default 64).
  - After each doc's batch is flushed, the numpy arrays go out of scope.
  - Never hold the entire folder's PointStructs in RAM at once.

HOW TO RUN IN ISOLATION:
  python -m graph.nodes.upsert_to_qdrant doctrine
  (Requires enrich_chunks and embed_chunks to have already run for this folder.)
"""
from __future__ import annotations

import hashlib
import json
import sys
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    Modifier,
    PayloadSchemaType,
    PointStruct,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

from graph.config import get_config, collection_name as make_collection_name
from graph.doctrine_vocab import compose_enrich_fingerprint
from graph.state import IngestionState


# ---------------------------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------------------------

# Fixed UUID namespace for deterministic _registry point IDs.
# uuid5(REGISTRY_NS, collection_name) produces the same ID every run, so
# re-running the pipeline simply overwrites the manifest row (no duplicates).
_REGISTRY_NS = uuid.UUID("f3a7c2e8-1b4d-4a0f-9c5e-8d6f2a3b7e1c")

# Docling version tag stored in the registry for provenance.
# Update this if docling is upgraded (see memory.md pinned versions).
_DOCLING_VERSION = "2.89.0"


# ---------------------------------------------------------------------------
# LAZY SINGLETON — Qdrant client
#
# Creating a QdrantClient opens an HTTP connection.  We create it once per
# process via this lazy-singleton pattern (same pattern as _get_llm() and
# _get_dense_embedder() in the other nodes).
# ---------------------------------------------------------------------------
_qdrant_client: "QdrantClient | None" = None


def _get_client() -> QdrantClient:
    """Return the process-level QdrantClient singleton."""
    global _qdrant_client
    if _qdrant_client is None:
        cfg = get_config()
        # api_key is optional — empty string means no auth (local Docker dev).
        kwargs: dict[str, Any] = {"url": cfg.qdrant_url}
        if cfg.qdrant_api_key:
            kwargs["api_key"] = cfg.qdrant_api_key
        _qdrant_client = QdrantClient(**kwargs, check_compatibility=False)
    return _qdrant_client


# ---------------------------------------------------------------------------
# COLLECTION SETUP
# ---------------------------------------------------------------------------

def _ensure_collection(client: QdrantClient, coll_name: str) -> None:
    """
    Create the ingestion collection if it does not already exist,
    then (always) ensure the five payload indexes are in place.

    We ALWAYS call _ensure_payload_indexes even when the collection already
    exists.  This guards against the edge case where a previous run created
    the collection but crashed before the indexes were built.
    create_payload_index() is idempotent so the extra calls are cheap.
    """
    if not client.collection_exists(coll_name):
        # --- Create the collection ---
        # vectors_config: named dict means each point has multiple named vectors.
        # "dense"  → standard HNSW index over 1024-dim float32 vectors.
        # "sparse" → inverted index with IDF modifier (see module docstring).
        # on_disk_payload=True: text payloads stay on disk (they are large);
        #   only the indexed payload fields and vectors stay in RAM.
        client.create_collection(
            collection_name=coll_name,
            vectors_config={
                "dense": VectorParams(size=1024, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                # modifier=Modifier.IDF is REQUIRED for correct BM25 scoring.
                # See the module docstring and memory.md "Indexing" row.
                "sparse": SparseVectorParams(modifier=Modifier.IDF),
            },
            on_disk_payload=True,
        )

    # Always ensure indexes — idempotent, safe on every run.
    _ensure_payload_indexes(client, coll_name)


def _ensure_payload_indexes(client: QdrantClient, coll_name: str) -> None:
    """
    Build the five KEYWORD payload indexes.

    WHY THESE FIVE FIELDS (from memory.md "Indexing" row):
      source_doc        — hottest: every hash-gated re-ingest check queries it.
      chunk_type        — tiny cardinality (body/table/glossary_entry/...) → free.
      paragraph_number  — doctrine lookup, e.g. "find paragraph 3-12".
      paragraph_numbers — same but a list field; KEYWORD indexes each element.
      cross_refs        — doctrine cross-reference list.

    Fields NOT indexed in Phase 1 and why (do not add without re-reading
    memory.md "Indexing" row):
      text              — covered by the sparse BM25 vector; full-text index
                          would be redundant storage.
      heading_path      — Phase-2 filter; defer until retrieval eval confirms need.
      source_folder     — constant within one collection; zero discrimination.
      doc_content_hash  — read back after filtering on source_doc, never filtered.
      page_numbers      — rarely filtered; defer.
      chunk_index       — Phase-2 neighbour-context expansion; defer.
      expansion_hints   — audit-only; never filtered.
    """
    for field in [
        "source_doc",
        "chunk_type",
        "paragraph_number",
        "paragraph_numbers",
        "cross_refs",
    ]:
        client.create_payload_index(
            collection_name=coll_name,
            field_name=field,
            field_schema=PayloadSchemaType.KEYWORD,
        )


# ---------------------------------------------------------------------------
# HASH-GATED RE-INGEST CHECK
# ---------------------------------------------------------------------------

def _get_stored_hash(
    client: QdrantClient,
    coll_name: str,
    source_doc: str,
) -> str | None:
    """
    Return the doc_content_hash stored in Qdrant for this source_doc,
    or None if no points exist for it yet.

    We fetch exactly ONE point (limit=1) — all chunks from the same doc carry
    the same hash, so one is enough.  The source_doc KEYWORD index makes this
    sub-millisecond even in large collections.
    """
    results, _ = client.scroll(
        collection_name=coll_name,
        scroll_filter=Filter(
            must=[FieldCondition(key="source_doc", match=MatchValue(value=source_doc))]
        ),
        limit=1,
        with_payload=["doc_content_hash"],  # only fetch the one field we need
        with_vectors=False,                 # vectors are large; skip them here
    )
    if not results:
        return None
    payload = results[0].payload or {}
    return payload.get("doc_content_hash")


# ---------------------------------------------------------------------------
# PER-DOC UPSERT
# ---------------------------------------------------------------------------

def _upsert_doc(
    client: QdrantClient,
    coll_name: str,
    source_folder: str,
    chunk_buffer: list[dict],
    npz_path: Path,
    upsert_batch_size: int,
    errors: list[dict],
) -> tuple[int, list[str]]:
    """
    Hash-gate one source document and (if needed) upsert its chunks to Qdrant.

    chunk_buffer : list of enriched chunk dicts for ONE source document.
    npz_path     : path to the matching <doc>.npz written by embed_chunks.

    Returns (chunks_actually_upserted, list_of_point_ids).
    Skipped docs return (0, []).  Errors are appended to the `errors` list
    and (0, []) is returned so the pipeline continues.
    """
    if not chunk_buffer:
        return 0, []

    source_doc = chunk_buffer[0].get("source_doc", "")
    # Upstream chunk_document stamps each chunk's doc_content_hash with the
    # raw source sha256.  Here we compose it with the current doctrine
    # fingerprint so a change to data/doctrine/* invalidates the stored
    # Qdrant payload too — without that composition, the skip-if-unchanged
    # check below would bypass the re-upsert even though the vectors just
    # got regenerated by enrich_chunks + embed_chunks.
    raw_sha = chunk_buffer[0].get("doc_content_hash", "")
    new_hash = compose_enrich_fingerprint(raw_sha) if raw_sha else raw_sha

    # ------------------------------------------------------------------
    # STEP 1: Check if Qdrant already has this document, and compare hashes.
    # ------------------------------------------------------------------
    try:
        stored_hash = _get_stored_hash(client, coll_name, source_doc)
    except Exception:
        errors.append({
            "stage":     "upsert_to_qdrant:hash_check",
            "file":      source_doc,
            "traceback": traceback.format_exc(),
            "ts":        datetime.now(timezone.utc).isoformat(),
        })
        return 0, []

    if stored_hash is not None:
        if stored_hash == new_hash:
            # Hash unchanged — doc is identical to what is already in Qdrant.
            # Skip entirely: no delete, no re-embed, no re-upsert.
            # Logged as an audit note (stage ends with ":skipped") so
            # it does NOT count toward the "partial" failure status.
            errors.append({
                "stage":     "upsert_to_qdrant:skipped",
                "file":      source_doc,
                "traceback": (
                    f"doc_content_hash unchanged ({new_hash[:16]}…) — "
                    "skipping re-ingest (no changes detected)"
                ),
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            return 0, []

        # Hash changed: delete all existing points for this doc before
        # upserting the fresh ones.  Without this step, old points from
        # removed or edited chunks would linger in the collection forever.
        try:
            client.delete(
                collection_name=coll_name,
                points_selector=Filter(
                    must=[FieldCondition(
                        key="source_doc",
                        match=MatchValue(value=source_doc),
                    )]
                ),
            )
        except Exception:
            errors.append({
                "stage":     "upsert_to_qdrant:delete",
                "file":      source_doc,
                "traceback": traceback.format_exc(),
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            return 0, []

    # ------------------------------------------------------------------
    # STEP 2: Load the vectors from the matching .npz file.
    #
    # The .npz stores four parallel arrays — index i in each corresponds
    # to chunk i in chunk_buffer (same order, written by embed_chunks):
    #   chunk_ids      (N,)       object array of UUID strings
    #   dense          (N, 1024)  float32 dense vectors
    #   sparse_indices (N,)       object array — each element is int32[]
    #   sparse_values  (N,)       object array — each element is float32[]
    # allow_pickle=True is required because the sparse arrays are ragged
    # (variable length per chunk) and stored as Python objects inside numpy.
    # ------------------------------------------------------------------
    try:
        npz = np.load(str(npz_path), allow_pickle=True)
        chunk_ids      = npz["chunk_ids"]
        dense_arr      = npz["dense"]
        sparse_indices = npz["sparse_indices"]
        sparse_values  = npz["sparse_values"]
    except Exception:
        errors.append({
            "stage":     "upsert_to_qdrant:load_npz",
            "file":      source_doc,
            "traceback": traceback.format_exc(),
            "ts":        datetime.now(timezone.utc).isoformat(),
        })
        return 0, []

    # Sanity check: the number of vectors must match the number of chunks.
    # A mismatch means embed_chunks ran on a DIFFERENT version of the JSONL
    # than what we are reading now — re-running embed_chunks will fix it.
    n_chunks = len(chunk_buffer)
    if len(chunk_ids) != n_chunks:
        errors.append({
            "stage":     "upsert_to_qdrant:alignment_mismatch",
            "file":      source_doc,
            "traceback": (
                f"Chunk count mismatch: enriched_chunks.jsonl has {n_chunks} "
                f"chunks for '{source_doc}' but {npz_path.name} has "
                f"{len(chunk_ids)} vectors.  Re-run embed_chunks to fix."
            ),
            "ts":        datetime.now(timezone.utc).isoformat(),
        })
        return 0, []

    # ------------------------------------------------------------------
    # STEP 3: Build PointStructs and upsert in batches of upsert_batch_size.
    #
    # WHY BATCH?  Each upsert() HTTP call has overhead.  Sending 64 points
    # at once is ~64x faster than 64 individual calls.  But we don't build
    # ALL points at once either — batching keeps peak RAM bounded.
    # ------------------------------------------------------------------
    all_point_ids: list[str] = []
    batch: list[PointStruct] = []

    def _flush_batch() -> None:
        """
        Send the current batch to Qdrant, then clear it.

        This inner function is defined here so it can access `coll_name`,
        `source_doc`, `errors`, and `batch` from the enclosing scope without
        needing them as arguments — same pattern used in embed_chunks._flush().
        If the upsert fails, the error is logged and we continue.
        """
        if not batch:
            return
        try:
            client.upsert(collection_name=coll_name, points=batch)
        except Exception:
            errors.append({
                "stage":     "upsert_to_qdrant:upsert_batch",
                "file":      source_doc,
                "traceback": traceback.format_exc(),
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
        batch.clear()

    for i, chunk in enumerate(chunk_buffer):
        point_id = str(chunk_ids[i])

        # The payload is what gets stored and displayed alongside the vector.
        # text holds the raw (display) version; contextualized_text is not
        # stored here — it was only needed for embedding.
        payload: dict[str, Any] = {
            "text":              chunk.get("text", ""),
            "heading_path":      chunk.get("heading_path", ""),
            "page_numbers":      chunk.get("page_numbers") or [],
            "chunk_type":        chunk.get("chunk_type", "body"),
            "source_doc":        source_doc,
            "chunk_index":       chunk.get("chunk_index", i),
            "paragraph_number":  chunk.get("paragraph_number"),   # None if not doctrine
            "paragraph_numbers": chunk.get("paragraph_numbers") or [],
            "cross_refs":        chunk.get("cross_refs") or [],
            "expansion_hints":   chunk.get("expansion_hints", ""),
            "doc_content_hash":  new_hash,
            "source_folder":     source_folder,
        }

        # SparseVector requires plain Python lists — numpy arrays would fail
        # Qdrant's Pydantic validation, so we call .tolist() on both fields.
        point = PointStruct(
            id=point_id,
            vector={
                "dense": dense_arr[i].tolist(),
                "sparse": SparseVector(
                    indices=sparse_indices[i].tolist(),
                    values=sparse_values[i].tolist(),
                ),
            },
            payload=payload,
        )
        batch.append(point)
        all_point_ids.append(point_id)

        # Flush when the batch reaches the configured size.
        if len(batch) >= upsert_batch_size:
            _flush_batch()

    _flush_batch()  # flush any remaining partial batch

    return len(all_point_ids), all_point_ids


# ---------------------------------------------------------------------------
# _REGISTRY UPSERT
# ---------------------------------------------------------------------------

def _ensure_registry(client: QdrantClient, registry_name: str) -> None:
    """
    Create the _registry collection if it does not already exist.

    The registry only stores payload (text metadata) — there is no meaningful
    vector search on it.  Qdrant requires at least one named vector config,
    so we use a 1-dimensional dummy vector (value=1.0) to satisfy the API.

    No payload indexes — row count stays in the dozens so full-scan is fine.
    on_disk_payload=True for consistency with the ingestion collections.
    """
    if client.collection_exists(registry_name):
        return
    client.create_collection(
        collection_name=registry_name,
        vectors_config={"_dummy": VectorParams(size=1, distance=Distance.COSINE)},
        on_disk_payload=True,
    )


def _upsert_registry(
    client: QdrantClient,
    registry_name: str,
    slug: str,
    source_folder_abs: str,
    doc_count: int,
    chunk_count: int,
    coll_name: str,
    content_hash_of_folder: str,
    cfg_embedder_tag: str,
    status: str,
) -> None:
    """
    Write one manifest row to _registry for this ingestion run.

    The point ID is a deterministic uuid5 of the collection name, so
    re-running the pipeline simply overwrites the manifest row in-place.

    `status` is passed in from the caller so the registry reflects the ACTUAL
    outcome ("ok" / "partial") rather than always recording "ok".
    """
    _ensure_registry(client, registry_name)

    point_id = str(uuid.uuid5(_REGISTRY_NS, coll_name))

    payload: dict[str, Any] = {
        "slug":                  slug,
        "collection_name":       coll_name,
        "source_folder_abs":     source_folder_abs,
        "embedder_tag":          cfg_embedder_tag,
        "docling_version":       _DOCLING_VERSION,
        "created_at":            datetime.now(timezone.utc).isoformat(),
        "doc_count":             doc_count,
        "chunk_count":           chunk_count,
        "content_hash_of_folder": content_hash_of_folder,
        "status":                status,
    }

    client.upsert(
        collection_name=registry_name,
        points=[
            PointStruct(
                id=point_id,
                vector={"_dummy": [1.0]},  # required by Qdrant API even for metadata-only collections
                payload=payload,
            )
        ],
    )


# ---------------------------------------------------------------------------
# MAIN NODE FUNCTION
# ---------------------------------------------------------------------------

def upsert_to_qdrant(state: IngestionState) -> dict[str, Any]:
    """
    LangGraph node #7: upsert enriched, embedded chunks into Qdrant.

    Reads from state:
        source_folder          — absolute path to the source folder
        source_folder_slug     — used to build the collection name
        enriched_chunks_paths  — dict {filename -> enriched_chunks.jsonl}
        embeddings_paths       — dict {filename -> embeddings.npz}
        ingestion_errors       — accumulated error list (we append, never replace)

    Writes to state:
        collection_name        — the Qdrant collection that was created/updated
        point_ids              — list of point IDs that were upserted (not skipped)
        chunk_count            — number of chunks upserted this run
        ingestion_status       — "ok" / "partial" / "failed"
        ingestion_errors       — updated list
    """
    cfg = get_config()
    slug = state["source_folder_slug"]
    source_folder = state.get("source_folder") or ""
    enriched_paths: dict[str, str] = dict(state.get("enriched_chunks_paths") or {})
    embeddings_paths: dict[str, str] = dict(state.get("embeddings_paths") or {})
    errors: list[dict] = list(state.get("ingestion_errors") or [])

    coll_name = make_collection_name(slug, cfg)

    # ------------------------------------------------------------------
    # GUARD: at least one doc must have both enriched chunks and embeddings.
    # ------------------------------------------------------------------
    if not enriched_paths:
        errors.append({
            "stage":     "upsert_to_qdrant",
            "file":      "(no enriched_chunks_paths)",
            "traceback": "enriched_chunks_paths is empty. Run enrich_chunks first.",
            "ts":        datetime.now(timezone.utc).isoformat(),
        })
        return {
            "collection_name":  coll_name,
            "point_ids":        [],
            "chunk_count":      0,
            "ingestion_status": "failed",
            "ingestion_errors": errors,
        }

    # ------------------------------------------------------------------
    # CREATE (or verify) the Qdrant collection.
    # This is the only operation where a failure should abort the whole node —
    # if we can't reach Qdrant at all, there is nothing to do.
    # ------------------------------------------------------------------
    client = _get_client()
    try:
        _ensure_collection(client, coll_name)
    except Exception:
        errors.append({
            "stage":     "upsert_to_qdrant:ensure_collection",
            "file":      coll_name,
            "traceback": traceback.format_exc(),
            "ts":        datetime.now(timezone.utc).isoformat(),
        })
        return {
            "collection_name":  coll_name,
            "point_ids":        [],
            "chunk_count":      0,
            "ingestion_status": "failed",
            "ingestion_errors": errors,
        }

    # ------------------------------------------------------------------
    # PER-DOC UPSERT LOOP
    # Each source doc has its own enriched_chunks.jsonl and embeddings.npz
    # in its per-doc output folder.  We load one doc's chunks into a
    # buffer, hand it to _upsert_doc alongside its .npz, then drop the
    # buffer before the next doc.
    # ------------------------------------------------------------------
    total_chunk_count = 0
    all_point_ids: list[str] = []
    docs_seen: set[str] = set()          # all source_docs encountered
    doc_hashes: dict[str, str] = {}      # source_doc → doc_content_hash

    for source_doc, enriched_path_str in enriched_paths.items():
        enriched_path = Path(enriched_path_str)
        if not enriched_path.exists():
            errors.append({
                "stage":     "upsert_to_qdrant:missing_enriched",
                "file":      str(enriched_path),
                "traceback": "enriched_chunks.jsonl for this doc is missing on disk.",
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            continue

        npz_path_str = embeddings_paths.get(source_doc, "")
        npz_path = Path(npz_path_str) if npz_path_str else None
        if not npz_path or not npz_path.exists():
            errors.append({
                "stage":     "upsert_to_qdrant:missing_npz",
                "file":      source_doc,
                "traceback": (
                    f"No embeddings.npz for {source_doc}. "
                    "Run embed_chunks for this folder to regenerate it."
                ),
                "ts":        datetime.now(timezone.utc).isoformat(),
            })
            continue

        # Load this doc's enriched chunks into a buffer (one doc fits in RAM
        # per the memory-hardening contract).
        chunk_buffer: list[dict] = []
        with open(enriched_path, encoding="utf-8") as in_file:
            for raw_line in in_file:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    chunk_buffer.append(json.loads(raw_line))
                except json.JSONDecodeError:
                    errors.append({
                        "stage":     "upsert_to_qdrant:json_parse",
                        "file":      str(enriched_path),
                        "traceback": f"Malformed JSON line: {raw_line[:120]}",
                        "ts":        datetime.now(timezone.utc).isoformat(),
                    })

        if not chunk_buffer:
            continue

        docs_seen.add(source_doc)
        doc_hashes[source_doc] = chunk_buffer[0].get("doc_content_hash", "")

        try:
            n, pids = _upsert_doc(
                client=client,
                coll_name=coll_name,
                source_folder=source_folder,
                chunk_buffer=chunk_buffer,
                npz_path=npz_path,
                upsert_batch_size=cfg.upsert_batch_size,
                errors=errors,
            )
            total_chunk_count += n
            all_point_ids.extend(pids)
        finally:
            del chunk_buffer

    # ------------------------------------------------------------------
    # DETERMINE FINAL STATUS
    # Must be computed BEFORE the registry upsert so the registry records
    # the actual outcome, not a hardcoded "ok".
    # Entries whose stage ends with ":skipped" (hash-gated upsert skip) or
    # ":cached" (sha256-gated upstream cache hit) are audit notes, not
    # failures.  All other entries (from this or prior nodes) count as
    # real errors.
    # ------------------------------------------------------------------
    def _is_audit_stage(stage: str) -> bool:
        return stage.endswith(":skipped") or stage.endswith(":cached")

    real_errors = [
        e for e in errors
        if not _is_audit_stage(e.get("stage", ""))
    ]
    ingestion_status: str = "partial" if real_errors else "ok"

    # ------------------------------------------------------------------
    # UPSERT REGISTRY MANIFEST
    # ------------------------------------------------------------------
    # Build a stable folder-level content hash from the sorted per-doc hashes.
    # Sorting by source_doc name ensures the hash is order-independent.
    folder_hash_input = "|".join(
        v for _, v in sorted(doc_hashes.items())
    )
    content_hash_of_folder = hashlib.sha256(
        folder_hash_input.encode()
    ).hexdigest()[:16]  # short hash — 16 hex chars is plenty for a manifest ID

    try:
        _upsert_registry(
            client=client,
            registry_name=cfg.registry_collection,
            slug=slug,
            source_folder_abs=str(Path(source_folder).resolve()),
            doc_count=len(docs_seen),
            chunk_count=total_chunk_count,
            coll_name=coll_name,
            content_hash_of_folder=content_hash_of_folder,
            cfg_embedder_tag=cfg.embedder_tag,
            status=ingestion_status,
        )
    except Exception:
        errors.append({
            "stage":     "upsert_to_qdrant:registry",
            "file":      cfg.registry_collection,
            "traceback": traceback.format_exc(),
            "ts":        datetime.now(timezone.utc).isoformat(),
        })

    return {
        "collection_name":  coll_name,
        "point_ids":        all_point_ids,
        "chunk_count":      total_chunk_count,
        "ingestion_status": ingestion_status,
        "ingestion_errors": errors,
    }


# =============================================================================
# STANDALONE MODE — run this node directly for isolated testing
# =============================================================================
# Usage:
#   python -m graph.nodes.upsert_to_qdrant doctrine
#
# What it does:
#   1. Locates enriched_chunks.jsonl and the embeddings dir for the given folder.
#   2. Calls upsert_to_qdrant() with a minimal dummy state.
#   3. Prints a summary: collection name, chunks upserted, point count, status.
#
# Requires: Qdrant running locally (colima start && docker start qdrant).

if __name__ == "__main__":
    import re as _re
    from dotenv import load_dotenv

    load_dotenv()  # read .env before get_config() accesses os.environ

    if len(sys.argv) < 2:
        print("Usage: python -m graph.nodes.upsert_to_qdrant <folder_path_or_name>")
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

    from graph.config import (
        FILE_EMBEDDINGS_NPZ,
        FILE_ENRICHED_CHUNKS_JSONL,
        doc_output_dir as _doc_output_dir,
    )
    from utils.file_reader import list_documents
    cfg = get_config()
    documents = list_documents(str(folder))
    coll_name = make_collection_name(slug, cfg)

    _doc_output_dirs = {
        d["filename"]: str(_doc_output_dir(d["filename"], cfg)) for d in documents
    }
    enriched_paths: dict[str, str] = {}
    embeddings_paths: dict[str, str] = {}
    for d in documents:
        out_dir = Path(_doc_output_dirs[d["filename"]])
        ep = out_dir / FILE_ENRICHED_CHUNKS_JSONL
        np_ = out_dir / FILE_EMBEDDINGS_NPZ
        if ep.is_file():
            enriched_paths[d["filename"]] = str(ep)
        if np_.is_file():
            embeddings_paths[d["filename"]] = str(np_)

    if not enriched_paths:
        print("No per-doc enriched_chunks.jsonl files found.")
        print("Run: python -m graph.nodes.enrich_chunks <folder>")
        sys.exit(1)

    if not embeddings_paths:
        print("No per-doc embeddings.npz files found.")
        print("Run: python -m graph.nodes.embed_chunks <folder>")
        sys.exit(1)

    dummy_state: IngestionState = {
        "source_folder":         str(folder),
        "source_folder_slug":    slug,
        "documents":             documents,
        "doc_output_dirs":       _doc_output_dirs,
        "enriched_chunks_paths": enriched_paths,
        "embeddings_paths":      embeddings_paths,
        "ingestion_errors":      [],
    }

    print(f"Target collection : {coll_name}")
    print(f"Qdrant URL        : {cfg.qdrant_url}")
    print(f"Enriched files    : {len(enriched_paths)}")
    print(f"Embedding files   : {len(embeddings_paths)}")
    print()

    out = upsert_to_qdrant(dummy_state)

    print("Results:")
    print(f"  Collection      : {out.get('collection_name')}")
    print(f"  Chunks upserted : {out.get('chunk_count', 0)}")
    print(f"  Point IDs total : {len(out.get('point_ids', []))}")
    print(f"  Status          : {out.get('ingestion_status')}")
    errs = out.get("ingestion_errors", [])
    skips = [e for e in errs if e.get("stage", "").endswith(":skipped")]
    real  = [e for e in errs if not e.get("stage", "").endswith(":skipped")]
    print(f"  Skipped (unchanged docs) : {len(skips)}")
    print(f"  Errors                   : {len(real)}")
    for e in real:
        short_tb = str(e.get("traceback", ""))[:200].replace("\n", " ")
        print(f"    [{e['stage']}] {e.get('file', '?')}: {short_tb}")

    print()
    print(f"Dashboard: {cfg.qdrant_url}/dashboard")
    print(f"  Verify collection '{coll_name}' has:")
    print(f"    - vectors['dense'].size == 1024, distance == Cosine")
    print(f"    - sparse_vectors['sparse'].modifier == idf")
    print(f"    - on_disk_payload == True")
    print(f"    - payload_schema has: source_doc, chunk_type, paragraph_number,")
    print(f"      paragraph_numbers, cross_refs  (all KEYWORD)")
    print(f"  Verify '_registry' collection has one point for '{slug}'")
