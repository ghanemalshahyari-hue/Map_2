"""graph/doctrine_vocab.py
===========================
Loader for the hand-editable doctrine vocabulary files under
`data/doctrine/`.  One module owns all three files so the ingestion
post-processors, the retrieval-side glossary, and the UI all read
from a single source of truth with a single cache-invalidation
fingerprint.

FILES
-----
  data/doctrine/acronyms.csv
      Curated acronym termbase. UTF-8 CSV, one acronym per row.
      Primary editable surface for adding / tweaking acronyms over
      time.  Used by both ingest-time enrichment (acronym_expander)
      and retrieval-time query expansion (graph/retrieval/glossary.py).

      Schema (header row required, extra columns ignored):
        term         Acronym as it appears in the corpus. Case-sensitive.
                     Blank rows or rows with an empty `term` are skipped.
        expansion    Full spelled-out form.  Blank -> row skipped.
        status       One of: approved | draft | deprecated.
                     - approved / draft -> row is active.
                     - deprecated      -> row is ignored (kept in the
                       file for audit but not applied anywhere).
                     Empty/unknown status is treated as `approved` so
                     a lazily-filled file still works.
        source       Free-form provenance tag (e.g. "FM 3-0",
                     "DoD Dictionary"). Informational only.
        notes        Free-form human notes. Informational only.
        updated_at   ISO-8601 date string. Informational only.

      Schema reference: this is the "term, translation, status,
      source, notes, updated date" shape used by mainstream
      terminology tools (memoQ termbase import/export, Microsoft
      Term Store CSV, TBX's core term-level attributes — TBX itself
      is XML and overkill for a hand-edited repo file).

      Duplicate `term` keys: first occurrence wins; subsequent rows
      are logged once to stderr via graph/config-style print so a
      human reviewer can find the conflict.

  data/doctrine/classification_markings.txt
      One marking per line.  Blank lines and lines starting with `#`
      are ignored.  Matched case-insensitively with word boundaries
      inside `classification_stripper`.

  data/doctrine/cross_ref_prefixes.txt
      One prefix per line.  Blank lines and `#` comments ignored.
      Used by:
        1. graph/post_processors/cross_ref_extractor.py — regex built
           dynamically as `\\b(?:P1|P2|...)\\s?\\d+(?:[.\\-]\\d+)*\\b`.
        2. ui/app.py — seeds the cross-ref filter chip list.

MERGE PRECEDENCE (acronyms)
---------------------------
  Per-document glossary definitions discovered inside a document
  (via the Phase 1 glossary_splitter) WIN for that document's own
  chunks.  The external CSV is the authoritative source for
  everything else:

    1. Per-doc in-document glossary (ingest-time only)
    2. External data/doctrine/acronyms.csv

  This means a publication that intentionally redefines a term in
  its own glossary keeps its local meaning, and the CSV fills every
  gap — which is the vast majority of terms.

CACHE INVALIDATION
------------------
  `get_doctrine_fingerprint()` returns a short hex digest over the
  contents of all three files.  Upstream stages that depend on
  doctrine data (enrich_chunks, embed_chunks — since enrichment
  feeds the embedded text) combine this digest with the per-doc
  sha256 in their `.stage_fingerprints.json` entries.  Editing any
  of the three files therefore invalidates those stages on the
  next run without requiring FORCE_REPARSE=1.

  Stages that do NOT depend on doctrine files (initialpages_convert,
  convert_document, chunk_document) keep their plain sha256-based
  gate unchanged.
"""
from __future__ import annotations

import csv
import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path


# ---------------------------------------------------------------------------
# FILE LOCATIONS
# ---------------------------------------------------------------------------
# Repo-root-relative paths.  Callers should invoke these helpers from
# the project root (which is the working-directory convention across
# every other script in this repo).

DOCTRINE_DIR = Path("data/doctrine")

ACRONYMS_CSV              = DOCTRINE_DIR / "acronyms.csv"
CLASSIFICATION_MARKINGS   = DOCTRINE_DIR / "classification_markings.txt"
CROSS_REF_PREFIXES        = DOCTRINE_DIR / "cross_ref_prefixes.txt"


# ---------------------------------------------------------------------------
# DATA
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AcronymEntry:
    term: str
    expansion: str
    status: str
    source: str
    notes: str
    updated_at: str


# ---------------------------------------------------------------------------
# ACRONYMS CSV
# ---------------------------------------------------------------------------

_ACTIVE_STATUSES: frozenset[str] = frozenset({"approved", "draft", ""})
_SKIPPED_STATUSES: frozenset[str] = frozenset({"deprecated"})


def load_acronym_entries(path: Path | str = ACRONYMS_CSV) -> list[AcronymEntry]:
    """Return every row of the CSV as an AcronymEntry, including deprecated.

    Callers that want only the "active" acronyms should call
    `load_acronyms_dict()` — it already filters and de-duplicates.
    """
    p = Path(path)
    if not p.is_file():
        return []

    entries: list[AcronymEntry] = []
    # utf-8-sig gracefully handles a BOM that Excel sometimes writes.
    with open(p, "r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            term = (row.get("term") or "").strip()
            expansion = (row.get("expansion") or "").strip()
            if not term or not expansion:
                continue
            entries.append(AcronymEntry(
                term=term,
                expansion=expansion,
                status=(row.get("status") or "").strip().lower(),
                source=(row.get("source") or "").strip(),
                notes=(row.get("notes") or "").strip(),
                updated_at=(row.get("updated_at") or "").strip(),
            ))
    return entries


def load_acronyms_dict(path: Path | str = ACRONYMS_CSV) -> dict[str, str]:
    """Return a {term: expansion} mapping restricted to active rows.

    - status in {approved, draft, empty} -> active
    - status == deprecated                -> skipped (audit-only)
    - unknown status                       -> active (treated as approved)
      and a one-time stderr warning is printed so the user notices.
    Duplicate terms: first occurrence wins; later occurrences log
    once and are ignored.
    """
    entries = load_acronym_entries(path)
    out: dict[str, str] = {}
    seen_unknown_status: set[str] = set()

    for e in entries:
        status = e.status
        if status in _SKIPPED_STATUSES:
            continue
        if status not in _ACTIVE_STATUSES:
            if status not in seen_unknown_status:
                seen_unknown_status.add(status)
                print(
                    f"[doctrine_vocab] acronyms.csv: unknown status "
                    f"{status!r} (treating as 'approved'). Valid values: "
                    f"approved, draft, deprecated.",
                    file=sys.stderr,
                )

        if e.term in out:
            print(
                f"[doctrine_vocab] acronyms.csv: duplicate term "
                f"{e.term!r} — keeping first expansion "
                f"{out[e.term]!r}, ignoring {e.expansion!r}.",
                file=sys.stderr,
            )
            continue
        out[e.term] = e.expansion

    return out


# ---------------------------------------------------------------------------
# LINE-ORIENTED TXT FILES
# ---------------------------------------------------------------------------

def _load_line_list(path: Path | str) -> list[str]:
    """Read a text file, return non-empty, non-comment lines (stripped).

    Shared helper for classification_markings.txt and
    cross_ref_prefixes.txt — both are plain line-per-entry formats.
    """
    p = Path(path)
    if not p.is_file():
        return []
    lines: list[str] = []
    for raw in p.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        lines.append(stripped)
    # Deduplicate while preserving file order (first occurrence wins).
    seen: set[str] = set()
    unique: list[str] = []
    for entry in lines:
        if entry in seen:
            continue
        seen.add(entry)
        unique.append(entry)
    return unique


def load_classification_markings(path: Path | str = CLASSIFICATION_MARKINGS) -> list[str]:
    """Return the ordered list of classification markings from the file."""
    return _load_line_list(path)


def load_cross_ref_prefixes(path: Path | str = CROSS_REF_PREFIXES) -> list[str]:
    """Return the ordered list of cross-ref publication prefixes from the file."""
    return _load_line_list(path)


# ---------------------------------------------------------------------------
# REGEX BUILDERS — shared so the two post-processors and any retrieval
# code all build the same patterns.
# ---------------------------------------------------------------------------

def build_classification_regex(markings: list[str] | None = None) -> re.Pattern[str]:
    """Return a compiled regex that matches any marking in the list.

    Longer markings are tried first (e.g. "FOR OFFICIAL USE ONLY"
    before "FOR") so a substring marking cannot shadow a fuller
    match.  Word boundaries anchor the pattern so we never slice
    inside real words.  Case-insensitive.
    """
    markings = markings if markings is not None else load_classification_markings()
    if not markings:
        # Impossible-to-match pattern so the caller's .sub() is a no-op.
        return re.compile(r"(?!.*)")
    sorted_markings = sorted(markings, key=len, reverse=True)
    alternation = "|".join(re.escape(m) for m in sorted_markings)
    return re.compile(rf"\b(?:{alternation})\b", re.IGNORECASE)


def build_cross_ref_regex(prefixes: list[str] | None = None) -> re.Pattern[str]:
    r"""Return a compiled regex that matches `PREFIX<digits>[.-digits]*`.

    The shape matches existing Phase 1 behaviour:
        \b(?:ADP|ATP|FM|...)\s?\d+(?:[.\-]\d+)*\b
    Non-capturing alternation keeps `re.findall` returning the full
    reference ("ADP 5-0") rather than just the prefix.
    """
    prefixes = prefixes if prefixes is not None else load_cross_ref_prefixes()
    if not prefixes:
        return re.compile(r"(?!.*)")
    # Sort longest-first so "ADRP" is tried before "AD" if both are
    # ever in the file at once.
    sorted_prefixes = sorted(prefixes, key=len, reverse=True)
    alternation = "|".join(re.escape(p) for p in sorted_prefixes)
    return re.compile(rf"\b(?:{alternation})\s?\d+(?:[.\-]\d+)*\b")


# ---------------------------------------------------------------------------
# FINGERPRINT
# ---------------------------------------------------------------------------
# Combined over the three files so any edit invalidates the cached
# stages that depend on them.  12 hex chars is a plenty-unique
# shorthand for appending to a sha256 in `.stage_fingerprints.json`.

_FINGERPRINT_SOURCES: tuple[Path, ...] = (
    ACRONYMS_CSV,
    CLASSIFICATION_MARKINGS,
    CROSS_REF_PREFIXES,
)


def get_doctrine_fingerprint() -> str:
    """Return a short hex digest over the three doctrine files.

    A missing file contributes an empty string, so absence is
    distinguishable from presence-with-content.  We include each
    file's name in the digest so swapping two file contents would
    still change the digest.
    """
    h = hashlib.sha256()
    for p in _FINGERPRINT_SOURCES:
        h.update(p.name.encode("utf-8"))
        h.update(b"\0")
        try:
            h.update(p.read_bytes())
        except FileNotFoundError:
            pass
        h.update(b"\0")
    return h.hexdigest()[:12]


def compose_enrich_fingerprint(source_sha256: str) -> str:
    """Build the compound fingerprint used by enrich/embed cache gates.

    Shape: `<source_sha256>+doctrine:<12hex>`.  A missing source
    hash produces an empty string so the caller's existing
    "empty -> never cache-hit" guard in is_artefact_fresh still
    fires.
    """
    if not source_sha256:
        return ""
    return f"{source_sha256}+doctrine:{get_doctrine_fingerprint()}"


# ---------------------------------------------------------------------------
# STANDALONE MODE
# ---------------------------------------------------------------------------
# Usage:
#   python -m graph.doctrine_vocab

if __name__ == "__main__":
    print(f"DOCTRINE_DIR = {DOCTRINE_DIR.resolve()}")
    acr = load_acronyms_dict()
    markings = load_classification_markings()
    prefixes = load_cross_ref_prefixes()
    fp = get_doctrine_fingerprint()

    print(f"\nacronyms.csv active entries   : {len(acr)}")
    for k in list(acr)[:10]:
        print(f"  {k:>10s} -> {acr[k]}")
    if len(acr) > 10:
        print(f"  (... {len(acr) - 10} more)")

    print(f"\nclassification_markings.txt   : {len(markings)}")
    print(f"  {markings}")

    print(f"\ncross_ref_prefixes.txt        : {len(prefixes)}")
    print(f"  {prefixes}")

    print(f"\ndoctrine fingerprint          : {fp}")
