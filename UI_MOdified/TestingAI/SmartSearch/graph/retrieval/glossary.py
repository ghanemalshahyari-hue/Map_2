"""graph/retrieval/glossary.py
==============================
Lossless acronym expansion on the query string, powered by the
per-doc `acronyms.json` sidecars produced by Phase 1's
`graph/post_processors/acronym_expander.py`.

BEHAVIOUR (§6.1):
  For each query token that exactly matches an acronym in the
  collection's merged glossary, rewrite the token in-place as
  "ACRO (expansion)" — preserving BOTH surface forms so BM25 still
  scores the original token while the dense embedder benefits
  from the expansion. Case-sensitive match, which is the right
  default for doctrine-style acronyms (mostly uppercase) and is
  predictable. Non-matching tokens pass through untouched.

DATA SOURCES (two, merged in this order):
  1. **External termbase** — data/doctrine/acronyms.csv.  Curated,
     editable, version-controlled.  Loaded via
     graph/doctrine_vocab.load_acronyms_dict().  This is the
     retrieval-side TOP layer: editing the CSV takes effect on the
     next query, no re-ingest needed.
  2. **Per-doc sidecars** — output/<doc_stem>/acronyms.json files
     produced by Phase 1's acronym_expander.  Each sidecar is the
     merged "external CSV + that doc's own glossary_entry chunks"
     view the ingest stage wrote.  We union every sidecar for the
     collection's source folder; per-doc definitions WIN on
     conflicts with the external CSV so a publication that
     redefined a term keeps its local meaning at query time too.

CACHING:
  Glossaries are cached per collection.  Invalidated when either
  the `_registry.content_hash_of_folder` changes OR the external
  doctrine fingerprint changes (editing acronyms.csv).  The first
  expand call rebuilds from disk; subsequent calls reuse the
  cached dict.

DEPENDENCIES:
  - graph.config (for output_dir + safe-stem convention)
  - graph.doctrine_vocab (external CSV loader + fingerprint)
  - graph.retrieval.registry (to look up the collection's
    content hash and source folder)
  - utils.file_normalizer (the canonical supported-extensions set,
    so the folder walker agrees with the ingestion pipeline about
    which files count as source documents)
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from graph.config import _safe_stem, get_config
from graph.doctrine_vocab import get_doctrine_fingerprint, load_acronyms_dict
from graph.retrieval.registry import RegistryEntry, get_registry_entry
from utils.file_normalizer import SUPPORTED_EXTENSIONS


# Source-document extensions.  Imported from the normalizer so this
# walker never drifts from what the ingestion pipeline actually
# ingests — including the legacy Office formats that go through the
# LibreOffice path at ingest time.
_DOC_EXTS: frozenset[str] = SUPPORTED_EXTENSIONS


# Token boundary: a word starting with a letter, plus any
# letters / digits / underscores / apostrophes / hyphens. This
# matches acronyms like "COA", "IPB", mixed-case "HqMC", and avoids
# matching numeric-only strings that can't be acronyms.
_TOKEN_RE = re.compile(r"\b[A-Za-z][\w'-]*\b")


@dataclass(frozen=True)
class Glossary:
    """Merged acronym glossary for one collection."""
    collection: str
    content_hash_of_folder: str
    entries: dict[str, str]

    @property
    def is_empty(self) -> bool:
        return not self.entries


_glossary_cache: dict[str, Glossary] = {}


# ---------------------------------------------------------------------------
# PUBLIC API
# ---------------------------------------------------------------------------

def get_glossary_for_collection(collection_name: str) -> Glossary:
    """Return the cached glossary for a collection.

    Cache key combines:
      - the collection's `_registry.content_hash_of_folder`
        (so re-ingests of the source corpus invalidate)
      - the current doctrine-vocab fingerprint (so edits to
        data/doctrine/acronyms.csv invalidate without re-ingest)
    Both changes independently force a rebuild.
    """
    entry = get_registry_entry(collection_name)
    doctrine_fp = get_doctrine_fingerprint()

    if entry is None:
        # Unknown collection — the external CSV is still useful on
        # its own (no per-doc sidecars, but acronyms.csv entries
        # still expand).  Build a glossary from the external dict
        # alone; tag it with the doctrine fingerprint so editing
        # the CSV invalidates this shortcut too.
        external = load_acronyms_dict()
        return Glossary(
            collection=collection_name,
            content_hash_of_folder=f"(no registry)+doctrine:{doctrine_fp}",
            entries=external,
        )

    cache_key = f"{entry.content_hash_of_folder}+doctrine:{doctrine_fp}"
    cached = _glossary_cache.get(collection_name)
    if cached is not None and cached.content_hash_of_folder == cache_key:
        return cached

    merged = _build_merged_glossary(entry)
    glossary = Glossary(
        collection=collection_name,
        content_hash_of_folder=cache_key,
        entries=merged,
    )
    _glossary_cache[collection_name] = glossary
    return glossary


def expand_query(query: str, glossary: Glossary) -> str:
    """Return `query` with every glossary acronym expanded in place.

    Expansion form: `TOKEN (expansion)`. Keeping both surface forms
    is deliberate — it lets the sparse (BM25) channel score exact
    matches on the original token while the dense channel still
    gets the expanded context. Non-acronym tokens are returned
    untouched.
    """
    if glossary.is_empty or not query:
        return query

    def _sub(match: re.Match[str]) -> str:
        token = match.group(0)
        expansion = glossary.entries.get(token)
        if expansion is None:
            return token
        return f"{token} ({expansion})"

    return _TOKEN_RE.sub(_sub, query)


# ---------------------------------------------------------------------------
# INTERNALS
# ---------------------------------------------------------------------------

def _build_merged_glossary(entry: RegistryEntry) -> dict[str, str]:
    """Union the external CSV + every per-doc acronyms.json sidecar.

    Layering (later stages override earlier ones):
      1. External termbase   (data/doctrine/acronyms.csv)
      2. Per-doc sidecars    (output/<doc_stem>/acronyms.json)

    The per-doc sidecars were ALREADY written by the ingest-time
    acronym_expander as "external CSV + this doc's own glossary",
    so copying them over the external dict here is the right
    final-layer override: per-doc in-document definitions win, the
    external CSV fills every gap.

    Per-doc files that are missing or malformed are silently
    skipped (fail-open: a bad sidecar must not break search).
    """
    cfg = get_config()
    output_root = Path(cfg.output_dir)
    source_folder = Path(entry.source_folder_abs)

    # Layer 1: external CSV baseline.
    merged: dict[str, str] = dict(load_acronyms_dict())

    # Layer 2: per-doc sidecars (override the CSV on conflicts).
    if not source_folder.is_dir():
        return merged

    for file in source_folder.iterdir():
        if not file.is_file():
            continue
        if file.suffix.lower() not in _DOC_EXTS:
            continue
        stem_dir = output_root / _safe_stem(file.name)
        sidecar = stem_dir / "acronyms.json"
        if not sidecar.is_file():
            continue
        try:
            data = json.loads(sidecar.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(k, str) and isinstance(v, str):
                    merged[k] = v
    return merged


# =============================================================================
# STANDALONE MODE
# =============================================================================
# Usage:
#   python -m graph.retrieval.glossary <collection_name>
#   python -m graph.retrieval.glossary <collection_name> "<query>"

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    if len(sys.argv) < 2:
        print('Usage: python -m graph.retrieval.glossary <collection_name> ["<query>"]')
        sys.exit(1)

    coll = sys.argv[1]
    glossary = get_glossary_for_collection(coll)
    print(f"Collection : {coll}")
    print(f"Hash       : {glossary.content_hash_of_folder or '(no registry entry)'}")
    print(f"Entries    : {len(glossary.entries)}")
    if glossary.entries:
        print("Sample     :")
        for i, (k, v) in enumerate(sorted(glossary.entries.items())[:10]):
            print(f"  {k!r:20s} -> {v!r}")
        if len(glossary.entries) > 10:
            print(f"  (... {len(glossary.entries) - 10} more)")
    else:
        print("(no acronyms.json sidecars found under this collection's source "
              "folder — expansion will be a no-op for this collection)")

    if len(sys.argv) >= 3:
        query = sys.argv[2]
        expanded = expand_query(query, glossary)
        print()
        print(f"Query      : {query!r}")
        print(f"Expanded   : {expanded!r}")
        if query == expanded:
            print("(no tokens matched the glossary)")
