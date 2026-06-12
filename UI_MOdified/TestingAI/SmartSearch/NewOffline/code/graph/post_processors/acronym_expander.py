"""
graph/post_processors/acronym_expander.py
=========================================
Post-processor #5 of 5 — appends acronym expansions to each chunk's
metadata so both dense and sparse embeddings capture the expanded forms.

WHAT PROBLEM DOES THIS SOLVE?
  Dense embedding models under-weight rare tokens like acronyms.
  A query "course of action" may not retrieve a chunk that only uses
  "COA", and vice versa.  BM25 has a similar gap — if the document
  uses "COA" and the query says "course of action", there is no term
  overlap to score.

  This processor bridges that gap: it finds every acronym that
  appears in a chunk's text and appends the full expansion to a
  field called expansion_hints.  The embed_chunks node later
  concatenates expansion_hints with the text before embedding, so
  both the dense and sparse vectors cover both forms.

WHERE DOES THE ACRONYM TABLE COME FROM?
  Two sources, merged with a strict precedence rule (MERGE policy):

    1. Per-document glossary — the glossary_entry chunks produced by
       glossary_splitter earlier in this same buffer.  We parse
       "TERM — expansion" lines out of them.  THIS WINS on conflicts
       within this document because a publication can legitimately
       redefine a term in its own glossary.

    2. External termbase — data/doctrine/acronyms.csv, loaded via
       graph/doctrine_vocab.load_acronyms_dict().  Fills every gap
       the in-document glossary did not cover.  Curated, editable,
       version-controlled.

  Net effect: a doc with its own glossary keeps its in-document
  definitions AND gains the external ones for acronyms the doc did
  not define.  Docs without a glossary still benefit from the
  external list.

WHAT IS expansion_hints?
  A plain string such as:
    "COA: course of action | C2: command and control"
  Added to every chunk where at least one known acronym appears in
  the text.  Empty string "" for chunks with no acronym hits.  Never
  shown to end users; used only during embedding.

SIDECAR FILE (output/<stem>/acronyms.json):
  A human-readable dump of the merged acronym dict for THIS
  document.  Useful for debugging and for the retrieval-side
  glossary expander, which unions every per-doc acronyms.json plus
  the external CSV at query time (see
  graph/retrieval/glossary.py).

SIGNATURE:
  acronym_expander(chunks, *, output_dir=None) -> list[dict]

  output_dir — optional path.  If provided AND the merged glossary
               is non-empty, the {acronym: expansion} dict is saved
               to output_dir/acronyms.json.  This is for human
               inspection AND retrieval-time glossary merging.

MUST RUN AFTER: glossary_splitter  (needs chunk_type="glossary_entry" chunks)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from graph.doctrine_vocab import load_acronyms_dict


def acronym_expander(
    chunks: list[dict],
    *,
    output_dir: str | None = None,
) -> list[dict]:
    """
    Append acronym expansion hints to each chunk.

    Steps:
      1. Scan the buffer for chunk_type="glossary_entry" chunks and
         build {ACRONYM: expansion} from their text fields.
      2. Union with data/doctrine/acronyms.csv — per-doc definitions
         WIN on conflict, external CSV fills gaps.
      3. Optionally save the merged dict to
         output_dir/acronyms.json (inspection + retrieval-time use).
      4. For each chunk, find known acronyms in its text and build
         expansion_hints.

    Args:
        chunks:     Full per-doc chunk buffer.  Must include any
                    glossary_entry chunks produced by
                    glossary_splitter (they are one source of the
                    acronym table).
        output_dir: Directory for .json sidecar (inspection +
                    retrieval-time glossary merging).

    Returns:
        Same list with "expansion_hints" (str) added to every chunk.
    """
    # ------------------------------------------------------------------
    # STEP 1: Build {acronym: expansion} from this doc's glossary_entry
    # chunks.  glossary_splitter formatted them as "TERM — expansion";
    # we just parse that known shape.
    # ------------------------------------------------------------------
    per_doc_glossary: dict[str, str] = {}

    for chunk in chunks:
        if chunk.get("chunk_type") != "glossary_entry":
            continue

        text = chunk.get("text", "").strip()

        # Parse "C2 — command and control" (any dash variant as separator).
        match = re.match(
            r"^([A-Z][A-Z0-9 &/\-]+?)\s*[—–\-]\s+(.+)$",
            text,
        )
        if match:
            acronym = match.group(1).strip()
            expansion = match.group(2).strip()
            # First occurrence wins if the same acronym appears twice in
            # the glossary (shouldn't happen in a well-formed glossary,
            # but we want deterministic behaviour rather than silent
            # overwrite).
            if acronym not in per_doc_glossary:
                per_doc_glossary[acronym] = expansion

    # ------------------------------------------------------------------
    # STEP 2: Merge with the external termbase.  Per-doc wins on
    # conflicts; external fills gaps.  The external dict load is
    # stderr-logged on first call only if the CSV has ambiguities —
    # no spam during a full corpus run.
    # ------------------------------------------------------------------
    external = load_acronyms_dict()
    glossary: dict[str, str] = dict(external)      # start from external
    glossary.update(per_doc_glossary)               # per-doc overrides

    # ------------------------------------------------------------------
    # STEP 3: Optionally dump the merged glossary to disk.  The sidecar
    # is both a human debugging artefact AND the data the retrieval-
    # side glossary expander reads at query time — so we write it even
    # if the doc itself had no in-document glossary (as long as the
    # external dict has something to offer).
    # ------------------------------------------------------------------
    if output_dir and glossary:
        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "acronyms.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(glossary, fh, indent=2, ensure_ascii=False)

    # If the merged glossary is empty, return chunks with empty
    # expansion_hints (field still added so downstream code never
    # hits a KeyError).
    if not glossary:
        return [{**c, "expansion_hints": c.get("expansion_hints", "")} for c in chunks]

    # ------------------------------------------------------------------
    # STEP 4: Build a regex that matches any known acronym as a whole
    # word.  Sort longer acronyms first so "METT-TC" is tried before
    # "METT".  re.escape() handles special characters in acronyms
    # (hyphens, &, etc.).
    # ------------------------------------------------------------------
    acronyms_sorted = sorted(glossary.keys(), key=len, reverse=True)
    acronym_pattern = re.compile(
        r"\b(" + "|".join(re.escape(a) for a in acronyms_sorted) + r")\b"
    )

    # ------------------------------------------------------------------
    # STEP 5: For each chunk, find matched acronyms and build
    # expansion_hints.  We do NOT modify chunk["text"] — the raw text
    # stays clean for display.  expansion_hints is a separate field
    # that embed_chunks appends to the text-to-embed so vectors cover
    # both short and long forms.
    # ------------------------------------------------------------------
    result: list[dict] = []

    for chunk in chunks:
        # findall() returns the captured group (the matched acronym
        # string) for each occurrence.  With a single capture group,
        # the result is a flat list of strings, e.g.
        # ["COA", "C2", "COA"].
        found: list[str] = acronym_pattern.findall(chunk.get("text", ""))

        if found:
            # Deduplicate while preserving first-occurrence order.
            unique_found: list[str] = list(dict.fromkeys(found))
            # Build "COA: course of action | C2: command and control"
            expansion_hints = " | ".join(
                f"{a}: {glossary[a]}" for a in unique_found
            )
        else:
            expansion_hints = ""

        result.append({**chunk, "expansion_hints": expansion_hints})

    return result
