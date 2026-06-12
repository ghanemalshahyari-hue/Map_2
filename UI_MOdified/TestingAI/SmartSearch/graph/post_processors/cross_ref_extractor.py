"""
graph/post_processors/cross_ref_extractor.py
============================================
Post-processor #3 of 5 — extracts cross-document references from chunk
text.

WHAT ARE DOCTRINE CROSS-REFERENCES?
  Military doctrine constantly cites other doctrine publications:
    "See ADP 5-0, Chapter 2"
    "Refer to FM 3-0 for additional guidance"
    "IAW JP 3-13 ..."

  These references are valuable metadata.  At retrieval time a filter
  like "cross_refs contains 'ADP 5-0'" can find every chunk that
  references a specific publication — even chunks where the reference
  is only in passing.  This enables future multi-document retrieval
  and citation graphs.

WHAT METADATA IS ADDED?
  cross_refs — list of unique doctrine publication references found in
               the chunk.  Each entry is the matched string, e.g.
               ["ADP 5-0", "FM 3-0"].  Empty list if none found.

PREFIX SOURCE (editable):
  data/doctrine/cross_ref_prefixes.txt — one prefix per line, # comments
  allowed.  See graph/doctrine_vocab.py for the loader and the regex
  builder.  The same file is used by ui/app.py to seed the cross-ref
  filter-chip list, so the extractor and the UI agree on what counts
  as a cross-reference prefix.

PATTERN SHAPE:
    \\b(?:PREFIX1|PREFIX2|...)\\s?\\d+(?:[.\\-]\\d+)*\\b

  - \\b          : word boundary (no mid-word matches)
  - (?:...)     : non-capturing alternation.  `re.findall` returns the
                  FULL match ("ADP 5-0"), not just the captured prefix.
  - \\s?         : optional single space between prefix and number
  - \\d+         : main number (e.g. "5" in "ADP 5-0")
  - (?:[.\\-]\\d+)* : zero or more .N / -N suffixes for things like
                  "ATP 3-01.8" or "ADP 5-0".
  - \\b          : word boundary at end

SIGNATURE: (list[dict]) -> list[dict]
"""
from __future__ import annotations

from graph.doctrine_vocab import build_cross_ref_regex


def cross_ref_extractor(chunks: list[dict]) -> list[dict]:
    """
    Find military doctrine cross-references in each chunk and record them.

    Args:
        chunks: list of chunk dicts from prior processors.

    Returns:
        Same chunks with "cross_refs" (list[str]) added to every dict.
        Duplicates within a chunk are removed; first-occurrence order
        is kept.
    """
    # Build the regex once per call.  Editing data/doctrine/cross_ref_prefixes.txt
    # takes effect on the next invocation without a process restart.
    xref_re = build_cross_ref_regex()

    result: list[dict] = []

    for chunk in chunks:
        # findall() returns all non-overlapping matches as plain strings,
        # e.g. ["ADP 5-0", "FM 3-0", "JP 3-13"].
        raw_refs: list[str] = xref_re.findall(chunk.get("text", ""))

        # dict.fromkeys removes duplicates while preserving insertion order.
        # (Python 3.7+ guarantees dict insertion order.)
        unique_refs: list[str] = list(dict.fromkeys(raw_refs))

        result.append({**chunk, "cross_refs": unique_refs})

    return result
