"""
graph/post_processors/classification_stripper.py
=================================================
Post-processor #1 of 5 — strips military classification markings from
chunk text.

WHAT THIS DOES:
  Military doctrine documents often contain text like:
    "UNCLASSIFIED", "FOR OFFICIAL USE ONLY", "U//FOUO"
  These appear in page headers, footers, or occasionally inline in the
  body.  They are administrative markings — not content — and add
  noise to search results because they appear in many chunks but mean
  nothing for retrieval.

  This processor removes those markings from BOTH of the chunk's text
  fields:
    - text               (kept for display in Qdrant payload)
    - contextualized_text (what embed_chunks actually embeds)
  Cleaning only `text` would leave the marking in the embedded vector,
  so cosine search could still match noise from classification banners.
  Both are cleaned here.

  If a chunk's `text` becomes empty after stripping, the chunk is
  dropped entirely (an empty chunk is worthless in the search index).
  `contextualized_text` is allowed to collapse to the chunk's heading
  alone (that still carries useful retrieval signal).

WHY IS THIS FIRST?
  Other processors (paragraph number extractor, cross-ref extractor)
  read chunk text.  Cleaning the text first means they work on tidy
  input.

MARKINGS SOURCE (editable):
  data/doctrine/classification_markings.txt — one marking per line,
  # comments allowed.  See graph/doctrine_vocab.py for the loader
  and the regex builder.

NOTE ON DOCLING:
  Docling's layout model usually classifies page headers/footers
  separately and excludes them, so most chunks are unaffected.  This
  is the belt-and-braces guarantee for any that slip through.

SIGNATURE: (list[dict]) -> list[dict]
  Each dict is a chunk record produced by chunk_document.py (or a
  prior post-processor in the same pipeline run).
"""
from __future__ import annotations

from graph.doctrine_vocab import build_classification_regex


def classification_stripper(chunks: list[dict]) -> list[dict]:
    """
    Remove military classification markings from each chunk's text and
    contextualized_text fields.

    Args:
        chunks: list of chunk dicts.  Expected keys: "text" (str),
                "contextualized_text" (str; optional), plus any
                other fields produced by chunk_document.py.

    Returns:
        New list of chunk dicts.  Chunks whose `text` is empty after
        stripping are dropped.  All other fields are preserved
        unchanged.
    """
    # Compile once per call.  Editing data/doctrine/classification_markings.txt
    # takes effect on the next invocation without a process restart.
    # This is cheap: a few alternatives + re.compile on a handful of
    # literals runs in microseconds.
    pattern = build_classification_regex()

    result: list[dict] = []

    for chunk in chunks:
        # --- Clean `text` (the display-time field; also used by the
        # other post-processors downstream). ---
        stripped_text = pattern.sub("", chunk.get("text", "")).strip()

        # Drop chunks where nothing meaningful remains in `text`.
        if not stripped_text:
            continue

        # --- Clean `contextualized_text` (the field embed_chunks
        # actually feeds into bge-m3 + BM25). ---
        ctx_raw = chunk.get("contextualized_text")
        if isinstance(ctx_raw, str) and ctx_raw:
            stripped_ctx = pattern.sub("", ctx_raw).strip()
        else:
            stripped_ctx = ctx_raw  # None / missing -> leave as-is

        # Shallow-copy the chunk dict and replace only the cleaned fields.
        # Using {**chunk, "text": ..., "contextualized_text": ...} is safer
        # than mutating in-place because it leaves the caller's original
        # dict unchanged.
        new_chunk = {**chunk, "text": stripped_text}
        if isinstance(ctx_raw, str) and ctx_raw:
            new_chunk["contextualized_text"] = stripped_ctx
        result.append(new_chunk)

    return result
