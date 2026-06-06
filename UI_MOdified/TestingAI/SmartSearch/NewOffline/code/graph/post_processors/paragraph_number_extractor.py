"""
graph/post_processors/paragraph_number_extractor.py
====================================================
Post-processor #2 of 5 — extracts doctrine paragraph numbers from chunk text.

WHAT ARE DOCTRINE PARAGRAPH NUMBERS?
  Military doctrine documents use numbered paragraphs as their primary
  citation unit.  Examples:
    "3-12"    — Chapter 3, paragraph 12
    "3-12-a"  — same paragraph, sub-section a
  When a user says "paragraph 3-12 of ADP 3-0" they mean this number, not
  a page number.  Page numbers vary between editions; paragraph numbers don't.

  This processor scans each chunk's text for these patterns and records them
  as metadata so Qdrant can filter on exact paragraph numbers at query time
  (e.g. "give me every chunk that falls within paragraph 3-12").

WHAT METADATA IS ADDED?
  paragraph_number  — the FIRST paragraph number found in the chunk, or None.
                     Useful for "retrieve paragraph 3-12 exactly".
  paragraph_numbers — ALL paragraph numbers found in the chunk (unique, in order).
                     Useful when a chunk spans multiple sub-paragraphs.

WHAT DOES THE REGEX MATCH?
  Pattern: a number like "3-12" or "3-12-a" at the START of a line,
  optionally followed by a period or whitespace.

  Examples that match:
    "3-12. The commander..."   → "3-12"
    "3-12-a. Sub-section..."   → "3-12-a"
    "  3-12  The commander..."  → "3-12"

  The "at line start" constraint (re.MULTILINE) prevents matching date
  strings like "2026-04-20" or phone numbers in the middle of a sentence.

SIGNATURE: (list[dict]) -> list[dict]
"""
from __future__ import annotations

import re

# Matches a doctrine paragraph number at the start of a text line.
#
# Breakdown:
#   ^\s*          — optional leading whitespace, at the start of a line
#   (             — start of the capture group (what findall() returns)
#     \d+         — one or more digits (chapter number, e.g. "3")
#     [-–]        — hyphen or en-dash separator (doctrine uses both)
#     \d+         — one or more digits (paragraph number, e.g. "12")
#     (?:         — optional sub-section (non-capturing group)
#       [-–]      — another separator
#       [a-z]     — exactly one lowercase letter, e.g. "a"
#     )?          — end optional sub-section
#   )             — end capture group
#   \s*[.\s]      — followed by a period OR whitespace (guards against matching
#                   "3-12abc" or a hyphenated word that happens to start with digits)
#
# re.MULTILINE makes ^ match the start of each line, not just the whole string.
PARA_NUM_RE = re.compile(
    r"^\s*(\d+[-–]\d+(?:[-–][a-z])?)\s*[.\s]",
    re.MULTILINE,
)


def paragraph_number_extractor(chunks: list[dict]) -> list[dict]:
    """
    Scan each chunk for doctrine paragraph numbers and attach them as metadata.

    Args:
        chunks: list of chunk dicts (text already cleaned by classification_stripper).

    Returns:
        Same chunks with "paragraph_number" (str | None) and
        "paragraph_numbers" (list[str]) added to every dict.
        Chunks with no matches get paragraph_number=None and paragraph_numbers=[].
    """
    result: list[dict] = []

    for chunk in chunks:
        # findall() returns a list of strings captured by the group, e.g.:
        #   ["3-12", "3-13"]  if those markers appear at line-starts.
        matches: list[str] = PARA_NUM_RE.findall(chunk["text"])

        # Deduplicate while preserving the first-occurrence order.
        # A paragraph might cite the same number twice (e.g. in a summary),
        # so we collapse duplicates without changing the order.
        seen: set[str] = set()
        unique: list[str] = []
        for m in matches:
            if m not in seen:
                seen.add(m)
                unique.append(m)

        result.append({
            **chunk,
            "paragraph_number":  unique[0] if unique else None,  # first, or None
            "paragraph_numbers": unique,                          # all unique ones
        })

    return result
