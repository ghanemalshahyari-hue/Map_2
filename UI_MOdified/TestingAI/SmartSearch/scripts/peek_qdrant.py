"""
scripts/peek_qdrant.py — CLI inspection tool for the ingestion Qdrant store.

WHAT THIS SCRIPT DOES:
  Terminal-only way to sanity-check what actually ended up in Qdrant after a
  pipeline run, without opening the web dashboard.

  Two modes:
    1.  No positional arg  → list all ingestion collections (those whose name
        starts with COLLECTION_PREFIX, e.g. "ingest__") and the _registry
        collection, with their point counts.
    2.  With a collection name → fetch N random points from that collection
        and print, per point:
            - id
            - payload (pretty-printed, truncated)
            - dense-vector L2 norm (should be ≈ 1.0 for normalised bge-m3)
            - top-10 sparse tokens by weight (indices only; BM25 token lookup
              is not built in — index-space tokens are enough for "are any
              terms here?" sanity checks).

USAGE:
    python scripts/peek_qdrant.py
    python scripts/peek_qdrant.py ingest__doctrine__bgem3
    python scripts/peek_qdrant.py ingest__doctrine__bgem3 --n 10
    python scripts/peek_qdrant.py _registry

This script is READ-ONLY. It never writes, deletes, or upserts.
"""
from __future__ import annotations

import sys
from pathlib import Path

# When executed as `python scripts/peek_qdrant.py ...` (not `python -m`),
# the script's own directory is on sys.path but the repo root is not — so
# `from graph.config import ...` cannot resolve.  Prepending the repo root
# (parent of this file's parent) fixes both invocation styles.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# load_dotenv() must run before graph/config so QDRANT_URL is visible.
from dotenv import load_dotenv
load_dotenv()

import argparse
import json
import math
import random

from qdrant_client import QdrantClient

from graph.config import get_config


def _get_client(cfg) -> QdrantClient:
    """Build a QdrantClient from config (no lazy-singleton — short-lived CLI)."""
    return QdrantClient(
        url=cfg.qdrant_url,
        api_key=cfg.qdrant_api_key or None,
    )


def _list_collections(client: QdrantClient, cfg) -> None:
    """Print all ingestion collections and the registry, with point counts."""
    response = client.get_collections()
    all_names = sorted(c.name for c in response.collections)

    if not all_names:
        print("(no collections — Qdrant is empty)")
        return

    ingestion = [n for n in all_names if n.startswith(f"{cfg.collection_prefix}__")]
    registry  = [n for n in all_names if n == cfg.registry_collection]
    other     = [n for n in all_names if n not in ingestion and n not in registry]

    def _print_group(title: str, names: list[str]) -> None:
        if not names:
            return
        print(f"\n{title}")
        print("-" * len(title))
        for name in names:
            try:
                info = client.get_collection(name)
                count = info.points_count if info.points_count is not None else 0
                print(f"  {name}  ({count} points)")
            except Exception as exc:  # pragma: no cover — defensive
                print(f"  {name}  (count unavailable: {exc})")

    _print_group("Ingestion collections", ingestion)
    _print_group("Registry",              registry)
    _print_group("Other",                 other)
    print()


def _l2_norm(vec: list[float]) -> float:
    return math.sqrt(sum(x * x for x in vec))


def _format_payload(payload: dict, max_field_chars: int = 160) -> str:
    """Pretty-print a payload dict, truncating long string values."""
    lines = []
    for key in sorted(payload.keys()):
        val = payload[key]
        if isinstance(val, str) and len(val) > max_field_chars:
            val = val[:max_field_chars] + f"…[{len(payload[key]) - max_field_chars} more chars]"
        rendered = json.dumps(val, ensure_ascii=False, default=str)
        lines.append(f"    {key}: {rendered}")
    return "\n".join(lines)


def _peek_collection(client: QdrantClient, collection_name: str, n: int) -> None:
    """Fetch N random-ish points from a collection and print details."""
    try:
        info = client.get_collection(collection_name)
    except Exception as exc:
        print(f"ERROR: cannot fetch collection '{collection_name}': {exc}")
        sys.exit(1)

    total = info.points_count or 0
    print(f"\nCollection: {collection_name}")
    print(f"Points    : {total}")

    # Named vectors config
    vparams = getattr(info.config.params, "vectors", None)
    sparams = getattr(info.config.params, "sparse_vectors", None)
    if isinstance(vparams, dict):
        for vname, vcfg in vparams.items():
            size = getattr(vcfg, "size", "?")
            dist = getattr(vcfg, "distance", "?")
            print(f"  dense[{vname}]  size={size}  distance={dist}")
    if isinstance(sparams, dict):
        for sname, scfg in sparams.items():
            modifier = getattr(scfg, "modifier", "?")
            print(f"  sparse[{sname}]  modifier={modifier}")

    # Payload index summary
    try:
        schema = info.payload_schema or {}
        if schema:
            indexed = sorted(schema.keys())
            print(f"  payload indexes ({len(indexed)}): {', '.join(indexed)}")
        else:
            print("  payload indexes: (none)")
    except Exception:
        pass

    if total == 0:
        print("\n(collection is empty — nothing to peek)")
        return

    # Pull a batch with payloads + vectors. We over-fetch and subsample in
    # Python rather than relying on true random sampling (not worth a
    # scroll+offset dance for a quick CLI). For a smoke-test scale
    # collection (< 10k points), a scroll that returns the whole set is fine.
    # with_vectors=True returns the named-vector dict so we can reach into
    # both "dense" and "sparse".
    fetch_limit = max(n * 4, 64)
    points, _next = client.scroll(
        collection_name=collection_name,
        limit=fetch_limit,
        with_payload=True,
        with_vectors=True,
    )

    if not points:
        print("\n(scroll returned no points)")
        return

    sample = random.sample(points, k=min(n, len(points)))

    print(f"\nShowing {len(sample)} point(s):\n")
    for i, p in enumerate(sample, start=1):
        print(f"── Point {i}/{len(sample)} ── id={p.id}")
        payload = p.payload or {}
        if payload:
            print("  payload:")
            print(_format_payload(payload))
        else:
            print("  payload: (none)")

        # p.vector may be a dict (named vectors) or a list (single unnamed).
        vector = p.vector
        if isinstance(vector, dict):
            dense = vector.get("dense")
            sparse = vector.get("sparse")
            if dense is not None:
                print(f"  dense   : dim={len(dense)}  L2_norm={_l2_norm(dense):.4f}")
            if sparse is not None:
                # SparseVector has .indices and .values
                indices = getattr(sparse, "indices", None) or []
                values  = getattr(sparse, "values",  None) or []
                pairs = sorted(zip(indices, values), key=lambda t: -t[1])[:10]
                pretty = ", ".join(f"{idx}:{val:.3f}" for idx, val in pairs)
                print(f"  sparse  : nnz={len(indices)}  top10(idx:weight)=[{pretty}]")
        elif vector is not None:
            # Registry collection: no vectors configured — nothing to print.
            print(f"  vector  : (unnamed, dim={len(vector)})")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect ingestion Qdrant collections from the terminal.",
    )
    parser.add_argument(
        "collection",
        nargs="?",
        help="Collection name. Omit to list all collections.",
    )
    parser.add_argument(
        "--n",
        type=int,
        default=5,
        help="Number of random points to print (default: 5).",
    )
    args = parser.parse_args()

    cfg = get_config()
    client = _get_client(cfg)

    if args.collection is None:
        _list_collections(client, cfg)
        return

    _peek_collection(client, args.collection, args.n)


if __name__ == "__main__":
    main()
