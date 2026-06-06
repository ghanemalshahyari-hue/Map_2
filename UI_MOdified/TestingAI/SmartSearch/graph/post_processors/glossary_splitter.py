"""
graph/post_processors/glossary_splitter.py
==========================================
Post-processor #4 of 5 — splits glossary / acronym sections into one chunk
per definition entry.

WHAT PROBLEM DOES THIS SOLVE?
  A doctrine appendix often contains a glossary like:

    C2 — command and control
    COA — course of action
    METT-TC — mission, enemy, terrain and weather, troops and support
               available, time available, civil considerations

  HybridChunker may return the entire glossary as a single large chunk.
  That single chunk would produce one averaged embedding that retrieves poorly
  for any individual definition.  A query for "command and control" should
  retrieve the "C2" entry directly, not have to compete against 50 other
  definitions sharing the same vector.

HOW DOES IT DETECT A GLOSSARY CHUNK?
  Two conditions must both be true:
  1. The chunk's heading_path contains a glossary keyword:
     "glossary", "acronyms", or "abbreviations" (case-insensitive).
  2. The chunk's text has at least 2 lines that look like definitions:
       TERM — expansion text  (em-dash, en-dash, or plain hyphen all work)

HOW DOES SPLITTING WORK?
  Each matched definition line becomes its own child chunk:
  - text:           just that one definition line (e.g. "COA — course of action")
  - contextualized_text: heading + that definition line (for embedding context)
  - chunk_type:     "glossary_entry"  ← used by acronym_expander and Qdrant filters
  - chunk_index:    parent index + letter suffix, e.g. "42a", "42b", "42c"
  - Everything else (heading_path, source_doc, page_numbers, doc_content_hash,
    paragraph_number, cross_refs …) is inherited from the parent chunk.

  The parent chunk itself is REPLACED by its children — it does not appear
  in the output separately.

WHY MUST THIS RUN BEFORE acronym_expander?
  acronym_expander scans the buffer for chunk_type="glossary_entry" chunks
  to build its {acronym: expansion} dictionary.  If this processor hasn't
  run yet, there are no glossary_entry chunks and the expander is a no-op.

SIGNATURE: (list[dict]) -> list[dict]
"""
from __future__ import annotations

import re

# Detects a glossary-related heading keyword (case-insensitive).
GLOSSARY_HEADING_RE = re.compile(
    r"(?i)\b(?:glossary|acronyms|abbreviations)\b"
)

# Detects a single glossary definition line in the chunk text.
#
# Breakdown:
#   ^[ \t]*         — line start with optional spaces/tabs (not \s to avoid
#                     matching newlines, which would cause cross-line merges)
#   (               — capture group 1: the TERM
#     [A-Z]         — must start with an uppercase letter
#     [A-Z0-9 &/\-]+ — rest: uppercase letters, digits, spaces, &, /, hyphen
#   )               — end term capture
#   \s*[—–\-]\s+   — dash separator: em-dash (—), en-dash (–), or hyphen (-)
#                     surrounded by optional whitespace
#   (.+)            — capture group 2: the EXPANSION text (anything up to EOL)
#   $               — end of line
#
# re.MULTILINE makes ^ and $ match line-by-line inside the chunk text.
GLOSSARY_ENTRY_RE = re.compile(
    r"^[ \t]*([A-Z][A-Z0-9 &/\-]+)\s*[—–\-]\s+(.+)$",
    re.MULTILINE,
)

# Minimum number of definition lines required to trigger splitting.
# A chunk with only one definition probably isn't a real glossary section.
_MIN_ENTRIES = 2


def glossary_splitter(chunks: list[dict]) -> list[dict]:
    """
    Detect glossary chunks and replace each with one child chunk per entry.

    Non-glossary chunks are passed through unchanged.

    Args:
        chunks: list of chunk dicts from prior processors.

    Returns:
        Flat list of chunk dicts.  Glossary chunks are expanded in-place;
        non-glossary chunks are preserved as-is.
    """
    result: list[dict] = []

    for chunk in chunks:
        if _is_glossary_chunk(chunk):
            # Replace this chunk with N child "glossary_entry" chunks.
            result.extend(_split_into_entries(chunk))
        else:
            result.append(chunk)

    return result


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _is_glossary_chunk(chunk: dict) -> bool:
    """
    Return True if this chunk looks like a glossary or acronym section.

    Both conditions must be met:
    1. Heading mentions glossary/acronyms/abbreviations.
    2. Text has at least _MIN_ENTRIES definition-shaped lines.
    """
    heading = chunk.get("heading_path", "")
    if not GLOSSARY_HEADING_RE.search(heading):
        return False

    entries = GLOSSARY_ENTRY_RE.findall(chunk.get("text", ""))
    return len(entries) >= _MIN_ENTRIES


def _split_into_entries(chunk: dict) -> list[dict]:
    """
    Split a glossary chunk into one child chunk per definition line.

    If the regex finds no entries (shouldn't happen after _is_glossary_chunk,
    but handled defensively), returns the original chunk unchanged.

    chunk_index suffix scheme:
      First 26 entries: "42a", "42b", ..., "42z"
      Beyond 26:        "42z1", "42z2", ... (to avoid collisions)

    Args:
        chunk: a chunk dict that passed _is_glossary_chunk.

    Returns:
        list of child chunk dicts (always non-empty).
    """
    # findall() with 2 capture groups returns a list of (term, expansion) tuples.
    entries: list[tuple[str, str]] = GLOSSARY_ENTRY_RE.findall(
        chunk.get("text", "")
    )

    if not entries:
        return [chunk]  # defensive fallback

    parent_index = chunk.get("chunk_index", 0)
    heading = chunk.get("heading_path", "")
    children: list[dict] = []

    for i, (term, expansion) in enumerate(entries):
        term = term.strip()
        expansion = expansion.strip()
        definition_text = f"{term} — {expansion}"

        # Suffix: "a".."z" for first 26, then "z1", "z2", ... for overflow.
        if i < 26:
            suffix = chr(ord("a") + i)
        else:
            suffix = f"z{i - 25}"

        child = {
            **chunk,                                        # inherit all parent fields
            "text": definition_text,                        # just this one entry
            "contextualized_text": f"{heading} {definition_text}".strip(),
            "chunk_type": "glossary_entry",                 # signals acronym_expander
            "chunk_index": f"{parent_index}{suffix}",       # e.g. "42a"
        }
        children.append(child)

    return children
