"""
graph/nodes/convert_document.py
==============================
LangGraph node that reads each document file and converts it into a
structured JSON representation using the Docling library.

WHAT THIS NODE DOES (plain English):
  For every document in the folder (PDF, DOCX, TXT), this node:
    1. Opens the file and parses it with Docling — extracting text,
       tables, headings, and layout information.
    2. For PDFs: also runs OCR (Optical Character Recognition) on any
       images or scanned pages that contain text as pictures rather than
       selectable text.
    3. Saves the result as a JSON file so the next step can read it back
       without having to re-parse the original file.
    4. Also saves a "diagnostics" file that records how much text was
       found on each page — useful for debugging and spot-checking.

WHY WE PARSE TO JSON FIRST:
  Parsing is the slowest and most memory-intensive step.  By saving the
  result to disk immediately, every subsequent step (chunking, embedding,
  etc.) can simply load the lightweight JSON instead of re-running Docling.
  This also means if a later step fails, we can re-run just that step
  without starting over from scratch.

MEMORY RULE (very important):
  A parsed doctrine PDF can use between 100 MB and 1 GB of RAM while
  it's loaded.  To prevent running out of memory, this node processes
  one document at a time, saves it to disk, then explicitly frees the
  memory before moving on to the next document.

CACHE GATE (sha256-based):
  Before parsing, we check output/<stem>/.stage_fingerprints.json.  If
  BOTH parsed.json and diagnostics.json exist on disk AND both have
  fingerprints matching the doc's current sha256, we skip the Docling
  call entirely and just re-publish the existing paths.  Any missing
  artefact or mismatched fingerprint triggers a full re-parse (including
  OCR escalation) so diagnostics stay consistent with the parsed JSON.
  Set FORCE_REPARSE=1 in .env to bypass this gate.

HOW TO RUN THIS NODE IN ISOLATION (for testing):
  python -m graph.nodes.convert_document doctrine
  python -m graph.nodes.convert_document /absolute/path/to/folder
"""
from __future__ import annotations

import gc           # Python garbage collector — used to free memory manually
import json         # for writing the parsed result to a .json file
import sys          # for reading command-line arguments
import traceback    # for capturing the full error message when something fails
from datetime import datetime, timezone   # for timestamping error entries
from pathlib import Path                  # cleaner file path handling than strings
from typing import Any

# Docling imports — Docling is the library that does the actual parsing
from docling.datamodel.base_models import ConversionStatus
# ConversionStatus tells us whether parsing succeeded or failed

from docling.document_converter import DocumentConverter
# DocumentConverter is the main Docling object that actually parses files

# Our own project files
from graph.config import (          # reads settings from the .env file
    FILE_DIAGNOSTICS_JSON,
    FILE_PARSED_JSON,
    doc_output_dir,
    get_config,
)
from graph.docling_converters import build_ocr_converter, get_textlayer_converter
from graph.fingerprints import all_fresh, write_fingerprint
from graph.state import IngestionState   # the shared data structure passed between nodes
from utils.file_normalizer import (
    ConversionFailedError,
    LibreOfficeUnavailableError,
    NormalizationError,
    normalize_document,
)


# =============================================================================
# THE PARSER — both converters now live in graph/docling_converters.py so
# initialpages_convert and check_documents can reuse the same builders.
# `_get_parser` and `_make_escalation_converter` are kept as thin aliases to
# preserve the existing import surface (and the beginner-friendly docstrings
# for each path live in the shared module).
# =============================================================================

def _get_parser() -> DocumentConverter:
    """Return the shared text-layer DocumentConverter (see docling_converters)."""
    return get_textlayer_converter()


def _make_escalation_converter() -> DocumentConverter:
    """Build a fresh full-page-OCR DocumentConverter (see docling_converters)."""
    return build_ocr_converter()


# =============================================================================
# PER-PAGE DIAGNOSTIC HELPERS
# =============================================================================

def _page_diagnostics(result: Any) -> list[dict]:
    """
    Build a list of diagnostic statistics — one dict per page.

    We record this information for every document, regardless of whether
    anything went wrong.  It lets a human open the .diagnostics.json file
    and quickly see whether each page was read properly.

    Each dict contains:
        page_no      — the page number (starts at 1)
        char_count   — how many characters were found on this page
        cell_count   — how many text boxes (lines of text) were found
        bitmap_count — how many image objects are on this page
        has_lines    — True if Docling found any text lines
        width        — page width in PDF points (1 point = 1/72 inch)
        height       — page height in PDF points
    """
    diagnostics = []

    for page in result.pages:
        # page.parsed_page holds the raw parsing output for this page.
        # It may be None if the page couldn't be processed at all.
        parsed = page.parsed_page

        # page.cells gives us the list of text line boxes ("textline cells").
        # Each cell has a .text attribute with the actual text string.
        cells = page.cells

        # Count total characters across all text boxes on this page.
        # We skip cells where .text is None or empty.
        char_count = sum(
            len(c.text) for c in cells if hasattr(c, "text") and c.text
        )

        # Count the number of text boxes (each box is roughly one line of text).
        cell_count = len(cells)

        # Count how many image/bitmap objects are on this page.
        # bitmap_resources is a list of images embedded in the PDF page.
        bitmap_count = len(parsed.bitmap_resources) if parsed is not None else 0

        # has_lines is a boolean Docling sets to True if it found any text lines.
        has_lines = bool(parsed.has_lines) if parsed is not None else False

        diagnostics.append({
            "page_no": page.page_no,
            "char_count": char_count,
            "cell_count": cell_count,
            "bitmap_count": bitmap_count,
            "has_lines": has_lines,
            "width": page.size.width if page.size else None,
            "height": page.size.height if page.size else None,
        })

    return diagnostics


def _is_thin_page(diag: dict) -> bool:
    """
    Decide whether a page looks like it needs the stronger Tesseract OCR.

    A page is considered "thin" (under-extracted) if it has images/bitmaps
    but almost no text was found.  This usually means the page is a scanned
    photograph of text — the words are an image, not selectable text.

    Two conditions trigger escalation (either one is enough):
    1. The page has images BUT zero text boxes found.
       → Classic fully-scanned page.
    2. The page has images AND fewer than 50 characters extracted.
       → Partially scanned, or OCR only caught a few stray characters.
    """
    # Condition 1: images present, but zero text cells extracted
    if diag["bitmap_count"] > 0 and diag["cell_count"] == 0:
        return True

    # Condition 2: images present, and very little text extracted
    if diag["bitmap_count"] > 0 and diag["char_count"] < 50:
        return True

    return False


# =============================================================================
# THE NODE FUNCTION — called by LangGraph
# =============================================================================

def convert_document(state: IngestionState) -> dict[str, Any]:
    """
    LangGraph node: parse every document in the folder and save the results.

    LangGraph calls this function automatically as part of the pipeline.
    It receives the current pipeline state (a dictionary of shared data)
    and returns a dictionary of new keys to add to that state.

    What this node does for each document:
      1. Parse the file with Docling (PDF/DOCX/TXT → structured data)
      2. Check each page — if any look like poorly-extracted scanned pages,
         re-parse the whole document with stronger OCR (Tesseract)
      3. Save the result as <doc>.json in output/parsed/<folder_slug>/
      4. Save per-page stats as <doc>.diagnostics.json (for human review)
      5. If parsing fails for any reason, log the error and move on
         (we never stop the whole pipeline for one bad file)

    State keys read:
        eligible_documents  — filtered allowlist from check_documents (preferred)
        documents           — full file metadata list (fallback for standalone mode)
        doc_output_dirs     — filename -> output/<safe_stem>/ (from main.py)

    State keys written:
        parsed_paths        — dict {filename -> output/<stem>/parsed.json}
        diagnostics_paths   — dict {filename -> output/<stem>/diagnostics.json}
        ingestion_errors    — any errors that occurred (appended to existing list)
    """
    cfg = get_config()

    # Prefer the per-doc allowlist built by check_documents so rejected docs
    # cannot slip through.  The key is present but empty -> nothing to parse.
    # When the key is ABSENT entirely (standalone runner, older state shape,
    # or unit tests) fall back to the full documents list — the node still
    # runs in isolation for debugging.
    if "eligible_documents" in state:
        documents = state.get("eligible_documents") or []
    else:
        documents = state.get("documents", [])

    # Per-doc output directories pre-created by main.py.  Fall back to computing
    # them if a caller (e.g. the standalone runner) skipped that seed.
    doc_output_dirs: dict[str, str] = dict(state.get("doc_output_dirs") or {})

    # These per-doc dicts will be filled as we process each document.
    parsed_paths: dict[str, str] = {}
    diagnostics_paths: dict[str, str] = {}

    # Carry forward any errors that earlier nodes already recorded.
    errors: list[dict] = list(state.get("ingestion_errors") or [])

    # Get the shared DocumentConverter (loaded once, reused for every doc).
    converter = _get_parser()

    # Process one document at a time.
    for doc_meta in documents:
        file_path = Path(doc_meta["path"])   # full path to the file on disk
        filename = doc_meta["filename"]
        sha256 = doc_meta.get("sha256", "")

        # This doc's output folder — fixed per-doc file names live inside.
        out_dir_str = doc_output_dirs.get(filename)
        out_dir = Path(out_dir_str) if out_dir_str else doc_output_dir(filename, cfg)
        out_json = out_dir / FILE_PARSED_JSON               # parsed content
        out_diag = out_dir / FILE_DIAGNOSTICS_JSON          # per-page stats

        # ------------------------------------------------------------------
        # CACHE GATE — all-or-nothing.  Both parsed.json AND diagnostics.json
        # must be on disk with fingerprints matching the current sha256.
        # Any missing / stale artefact forces a full re-parse (Docling +
        # OCR escalation both recompute so diagnostics stay trustworthy).
        # Set FORCE_REPARSE=1 in .env to bypass.
        # ------------------------------------------------------------------
        if (
            not cfg.force_reparse
            and all_fresh(
                out_dir,
                sha256,
                {
                    FILE_PARSED_JSON:      out_json,
                    FILE_DIAGNOSTICS_JSON: out_diag,
                },
            )
        ):
            parsed_paths[filename]      = str(out_json)
            diagnostics_paths[filename] = str(out_diag)
            errors.append({
                "stage":     "convert_document:cached",
                "file":      filename,
                "traceback": f"cache hit ({sha256[:12]}…) — reused parsed.json + diagnostics.json",
                "ts":        _now(),
            })
            continue

        # ------------------------------------------------------------------
        # STEP 0: Pre-parse normalization.
        # Modern OOXML / PDF / text files pass through as-is; legacy
        # Office binaries (.doc, .ppt, .xls, templates, RTF, .xlsb) get
        # converted to their OOXML equivalent by LibreOffice headless
        # before Docling sees them.  We keep `file_path` as the ORIGINAL
        # (for filename/source_doc bookkeeping) and parse from
        # `normalized.parse_path`.  Temp directories for converted files
        # are cleaned up in the finally below.
        # ------------------------------------------------------------------
        normalized = None
        try:
            try:
                normalized = normalize_document(file_path)
            except LibreOfficeUnavailableError:
                errors.append({
                    "stage":     "convert_document:normalize",
                    "file":      str(file_path),
                    "traceback": traceback.format_exc(),
                    "ts":        _now(),
                })
                continue
            except (ConversionFailedError, NormalizationError):
                errors.append({
                    "stage":     "convert_document:normalize",
                    "file":      str(file_path),
                    "traceback": traceback.format_exc(),
                    "ts":        _now(),
                })
                continue

            if normalized.conversion_note:
                errors.append({
                    "stage":     "convert_document:normalize:note",
                    "file":      str(file_path),
                    "traceback": normalized.conversion_note,
                    "ts":        _now(),
                })

            parse_path = normalized.parse_path

            # ----------------------------------------------------------------
            # STEP 1: Parse the document with Docling.
            # converter.convert() reads the file, runs layout detection,
            # table recognition, and OCR, then returns a ConversionResult.
            #
            # If `check_documents` tagged this doc with needs_full_ocr (meaning
            # it only survived the gate via the OCR retry — e.g. broken
            # ToUnicode CMap making the text layer garbage), go straight to
            # the Tesseract full-page-OCR converter and skip the text-layer
            # parse entirely.  The thin-page detector below can't catch this
            # failure mode because it's text-layer-encoded, not bitmap-scanned.
            # ----------------------------------------------------------------
            needs_full_ocr = bool(doc_meta.get("needs_full_ocr"))
            if needs_full_ocr:
                errors.append({
                    "stage": "convert_document:forced_ocr",
                    "file": str(file_path),
                    "traceback": (
                        "Doc survived check_documents via OCR retry "
                        "(broken text layer).  Forcing full-page Tesseract "
                        "OCR for the full parse."
                    ),
                    "ts": _now(),
                })
                result = _make_escalation_converter().convert(parse_path)
            else:
                result = converter.convert(parse_path)

            # Check if parsing completely failed.
            # PARTIAL_SUCCESS means some pages failed but others were OK —
            # we accept that and continue with whatever was extracted.
            if result.status == ConversionStatus.FAILURE:
                errors.append({
                    "stage": "convert_document",
                    "file": str(file_path),
                    "traceback": (
                        f"Docling reported FAILURE status. "
                        f"Docling errors: {[str(e) for e in result.errors]}"
                    ),
                    "ts": _now(),
                })
                continue   # skip this file, move on to the next one

            # ----------------------------------------------------------------
            # STEP 2: Collect per-page diagnostics (always done).
            # ----------------------------------------------------------------
            page_diags = _page_diagnostics(result)

            # ----------------------------------------------------------------
            # STEP 3: Check if any pages look under-extracted.
            # If so, re-parse the whole document with stronger OCR.
            # (Skip if we already forced OCR above — no further escalation.)
            # ----------------------------------------------------------------
            thin_pages = (
                []
                if needs_full_ocr
                else [d for d in page_diags if _is_thin_page(d)]
            )

            if thin_pages:
                # Log a note for each thin page so we can inspect it later.
                for td in thin_pages:
                    errors.append({
                        "stage": "ocr_escalation",   # not an error — just an audit note
                        "file": str(file_path),
                        "traceback": (
                            f"Page {td['page_no']} looks under-extracted "
                            f"(chars={td['char_count']}, cells={td['cell_count']}, "
                            f"bitmaps={td['bitmap_count']}). "
                            "Retrying with full-page Tesseract OCR."
                        ),
                        "ts": _now(),
                    })

                # Try re-parsing with Tesseract full-page OCR.
                try:
                    escalated = _make_escalation_converter().convert(parse_path)

                    if escalated.status in (
                        ConversionStatus.SUCCESS,
                        ConversionStatus.PARTIAL_SUCCESS,
                    ):
                        # The escalated parse worked — use it instead of the original.
                        del result           # free the original result from memory
                        result = escalated   # replace with the better result
                        page_diags = _page_diagnostics(result)   # recompute diagnostics

                except Exception:
                    # Escalation failed.  Log it and fall back to the original result.
                    errors.append({
                        "stage": "ocr_escalation_failed",
                        "file": str(file_path),
                        "traceback": traceback.format_exc(),
                        "ts": _now(),
                    })
                    # We continue below and save whatever the original parse gave us.

            # ----------------------------------------------------------------
            # STEP 4: Save the parsed document to disk as JSON.
            # export_to_dict() converts the Docling document into a plain
            # Python dictionary that can be saved with json.dumps().
            # ----------------------------------------------------------------
            doc_dict = result.document.export_to_dict()
            out_json.write_text(
                json.dumps(doc_dict, ensure_ascii=False),
                encoding="utf-8"
            )

            # ----------------------------------------------------------------
            # STEP 5: Save the per-page diagnostics as a separate JSON file.
            # indent=2 makes it human-readable (formatted with indentation).
            # ----------------------------------------------------------------
            out_diag.write_text(
                json.dumps(page_diags, ensure_ascii=False, indent=2),
                encoding="utf-8"
            )

            # Record these output paths so the next node knows where to find them.
            parsed_paths[filename] = str(out_json)
            diagnostics_paths[filename] = str(out_diag)

            # Stamp both artefacts with the source sha256 so a rerun with
            # the same file bytes can skip the Docling + OCR work entirely.
            if sha256:
                write_fingerprint(out_dir, FILE_PARSED_JSON,      sha256)
                write_fingerprint(out_dir, FILE_DIAGNOSTICS_JSON, sha256)

            # ----------------------------------------------------------------
            # STEP 6: Free the parsed document from memory RIGHT NOW.
            #
            # WHY: A parsed doctrine PDF can take 100 MB to 1 GB of RAM.
            # If we processed 10 docs before Python cleaned up, we could
            # easily run out of memory.  By calling del + gc.collect(), we
            # tell Python "free this immediately, don't wait."
            # ----------------------------------------------------------------
            del result
            gc.collect()

        except Exception:
            # Something unexpected went wrong (network error, corrupt file,
            # Docling bug, etc.).  Log the full error with a traceback so we
            # can diagnose it, then move on to the next document.
            errors.append({
                "stage": "convert_document",
                "file": str(file_path),
                "traceback": traceback.format_exc(),   # full Python error message
                "ts": _now(),
            })
        finally:
            # Always clean up any temp directory LibreOffice created, whether
            # the parse succeeded, failed, or escalated to Tesseract.  For
            # native formats `normalized.is_temp` is False and cleanup() is
            # a no-op.  Guard against the case where normalization itself
            # raised before assigning `normalized`.
            if normalized is not None:
                normalized.cleanup()

    # Return the new state keys.  LangGraph merges these into the shared state.
    return {
        "parsed_paths": parsed_paths,
        "diagnostics_paths": diagnostics_paths,
        "ingestion_errors": errors,
    }


def _now() -> str:
    """Return the current UTC time as an ISO-8601 string, e.g. '2026-04-20T12:00:00+00:00'."""
    return datetime.now(timezone.utc).isoformat()


# =============================================================================
# STANDALONE MODE — run this node directly from the terminal for testing
# =============================================================================
# Usage:
#   python -m graph.nodes.convert_document doctrine
#   python -m graph.nodes.convert_document /absolute/path/to/folder
#
# This lets you test just the parsing step without running the full pipeline.

if __name__ == "__main__":
    import re
    from dotenv import load_dotenv

    # load_dotenv() reads the .env file and puts all its key=value pairs
    # into the environment so get_config() can read them.
    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python -m graph.nodes.convert_document <folder_path_or_name>")
        sys.exit(1)

    # Accept either a full path like /data/docs/myfolder
    # or a short name like "doctrine" (looked up inside inputs/).
    folder = Path(sys.argv[1])
    if not folder.is_absolute():
        candidate = Path("inputs") / sys.argv[1]
        if candidate.is_dir():
            folder = candidate
    folder = folder.resolve()

    if not folder.is_dir():
        print(f"Error: '{folder}' is not a valid directory.")
        sys.exit(1)

    from utils.file_reader import list_documents

    # Build the safe folder slug: lowercase, replace non-alphanumeric chars with "_",
    # limit to 48 characters.  e.g. "My Folder 2!" → "my_folder_2_"
    slug = re.sub(r"[^a-z0-9_-]", "_", folder.name.lower())[:48]

    docs = list_documents(str(folder))
    if not docs:
        print(f"No supported documents found in {folder} "
              "(see utils/file_normalizer.SUPPORTED_EXTENSIONS for the list).")
        sys.exit(1)

    # Build a minimal state dictionary — just enough to call the node function.
    _cfg = get_config()
    _doc_output_dirs = {
        d["filename"]: str(doc_output_dir(d["filename"], _cfg)) for d in docs
    }
    dummy_state: IngestionState = {
        "source_folder": str(folder),
        "source_folder_slug": slug,
        "documents": docs,
        "doc_output_dirs": _doc_output_dirs,
        "ingestion_errors": [],
    }

    out = convert_document(dummy_state)

    print(f"\nResults:")
    print(f"  Parsed successfully : {len(out['parsed_paths'])} file(s)")
    print(f"  Skipped / failed   : {len(docs) - len(out['parsed_paths'])} file(s)")
    print(f"  Errors logged      : {len(out['ingestion_errors'])}")
    for e in out["ingestion_errors"]:
        short_tb = e["traceback"][:200].replace("\n", " ")
        print(f"  [{e['stage']}] {e['file']}: {short_tb}")
    for p in out["parsed_paths"].values():
        print(f"  → Saved: {p}")
