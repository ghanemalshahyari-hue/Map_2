"""graph/retrieval/registry.py
===============================
Read-only view over the `_registry` Qdrant collection — the
manifest Phase 1 upserts after each ingest run.

USED BY:
  - The Streamlit UI's collection picker (§9 of the design doc).
  - The `search()` CLI smoke tests when a human wants to enumerate
    available collections by name.

WHAT IT RETURNS:
  Two distinct signals per collection, deliberately labelled
  separately (see §9):
    - *Manifest* — `doc_count` / `chunk_count` from `_registry`.
      What Phase 1 recorded at the end of the ingestion run.
    - *Live*     — `points_count` from `client.get_collection(name)`.
      Current collection reality.

  When the two disagree the manifest is stale relative to the
  collection. Treat it as a non-blocking warning in the UI: search
  still runs against the live collection.

PARALLEL SINGLETON:
  `_get_client()` is a local singleton, intentionally NOT shared
  with `graph/nodes/upsert_to_qdrant.py`. Per §10.5 the Qdrant
  client is the one helper not extracted in v1 — HTTP clients are
  cheap, and keeping two singletons keeps the shared-helper
  footprint tight.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Any

from qdrant_client import QdrantClient

from graph.config import get_config


@dataclass(frozen=True)
class RegistryEntry:
    """One row of the `_registry` collection, plus the live count."""
    slug: str
    collection_name: str
    source_folder_abs: str
    embedder_tag: str
    docling_version: str
    created_at: str
    status: str

    # Manifest counts — last recorded ingest metadata.
    manifest_doc_count: int
    manifest_chunk_count: int
    content_hash_of_folder: str

    # Live count — may differ from manifest (see module docstring).
    # None if the collection named in the manifest does not exist
    # (should not happen in practice, but guard anyway).
    live_points_count: int | None

    @property
    def counts_disagree(self) -> bool:
        """True when manifest chunk_count differs from live points_count."""
        return (
            self.live_points_count is not None
            and self.manifest_chunk_count != self.live_points_count
        )


# ---------------------------------------------------------------------------
# LAZY QDRANT CLIENT (local to retrieval — see §10.5)
# ---------------------------------------------------------------------------
_qdrant_client: QdrantClient | None = None


def _get_client() -> QdrantClient:
    """Return the process-level Qdrant client singleton used by retrieval."""
    global _qdrant_client
    if _qdrant_client is None:
        cfg = get_config()
        kwargs: dict[str, Any] = {"url": cfg.qdrant_url}
        if cfg.qdrant_api_key:
            kwargs["api_key"] = cfg.qdrant_api_key
        # check_compatibility=False suppresses the version-probe warning
        # that QdrantClient prints when its bundled client and the server
        # versions don't exactly match.  Cosmetic only — protocol still works.
        _qdrant_client = QdrantClient(**kwargs, check_compatibility=False)
    return _qdrant_client


# ---------------------------------------------------------------------------
# READ PATH
# ---------------------------------------------------------------------------

_REGISTRY_PAGE_LIMIT = 256  # we expect <<10 collections in practice


def list_registry_entries() -> list[RegistryEntry]:
    """Scroll the `_registry` collection and enrich each row with its live
    points_count.  Returns an empty list if `_registry` does not exist."""
    cfg = get_config()
    client = _get_client()

    if not client.collection_exists(cfg.registry_collection):
        return []

    points, _next = client.scroll(
        collection_name=cfg.registry_collection,
        with_payload=True,
        with_vectors=False,
        limit=_REGISTRY_PAGE_LIMIT,
    )

    entries: list[RegistryEntry] = []
    for p in points:
        payload = p.payload or {}
        coll = str(payload.get("collection_name", ""))
        live_count = _live_points_count(client, coll)
        entries.append(
            RegistryEntry(
                slug=str(payload.get("slug", "")),
                collection_name=coll,
                source_folder_abs=str(payload.get("source_folder_abs", "")),
                embedder_tag=str(payload.get("embedder_tag", "")),
                docling_version=str(payload.get("docling_version", "")),
                created_at=str(payload.get("created_at", "")),
                status=str(payload.get("status", "")),
                manifest_doc_count=int(payload.get("doc_count", 0) or 0),
                manifest_chunk_count=int(payload.get("chunk_count", 0) or 0),
                content_hash_of_folder=str(payload.get("content_hash_of_folder", "")),
                live_points_count=live_count,
            )
        )
    # Deterministic ordering — slug ascending — so the UI picker is stable
    # across reloads.
    entries.sort(key=lambda e: e.slug)
    return entries


def get_registry_entry(collection_name: str) -> RegistryEntry | None:
    """Look up a single registry entry by collection name."""
    for entry in list_registry_entries():
        if entry.collection_name == collection_name:
            return entry
    return None


def _live_points_count(client: QdrantClient, collection_name: str) -> int | None:
    """Fetch `points_count` for the named collection; None on miss."""
    if not collection_name:
        return None
    try:
        if not client.collection_exists(collection_name):
            return None
        info = client.get_collection(collection_name)
    except Exception:
        return None
    return getattr(info, "points_count", None)


# =============================================================================
# STANDALONE MODE
# =============================================================================
# Usage:
#   python -m graph.retrieval.registry
#   python -m graph.retrieval.registry <collection_name>

def _print_entry(e: RegistryEntry) -> None:
    warn = "  !!STALE" if e.counts_disagree else ""
    print(f"  slug            : {e.slug}")
    print(f"  collection_name : {e.collection_name}")
    print(f"  embedder_tag    : {e.embedder_tag}")
    print(f"  docling_version : {e.docling_version}")
    print(f"  status          : {e.status}")
    print(f"  created_at      : {e.created_at}")
    print(f"  content_hash    : {e.content_hash_of_folder}")
    print(f"  manifest docs   : {e.manifest_doc_count}")
    print(f"  manifest chunks : {e.manifest_chunk_count}")
    print(f"  live points     : {e.live_points_count}{warn}")
    print(f"  source_folder   : {e.source_folder_abs}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    if len(sys.argv) > 1:
        target = sys.argv[1]
        entry = get_registry_entry(target)
        if entry is None:
            print(f"No registry entry for collection '{target}'.")
            sys.exit(1)
        print(f"Registry entry for '{target}':")
        _print_entry(entry)
        sys.exit(0)

    entries = list_registry_entries()
    print(f"Registry entries: {len(entries)}")
    for i, e in enumerate(entries):
        print(f"\n[{i}]")
        _print_entry(e)
