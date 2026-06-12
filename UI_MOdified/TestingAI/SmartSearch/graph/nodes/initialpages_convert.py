"""
graph/nodes/initialpages_convert.py
====================================
LangGraph node #1 of 7 — CHEAP first-10-pages probe run BEFORE check_documents.

WHY THIS NODE EXISTS:
  The `check_documents` gate is an LLM that decides whether a folder is worth
  the full ingestion cost.  Previously it only saw the placeholder string
  "[Binary document — content to be extracted by the parser (<N> KB)]" for
  every PDF / DOCX, because the LangChain `ChatOpenAI` call only accepts text
  — it cannot decode binary formats itself.  That meant the LLM had no way to
  distinguish, say, an infantry-tactics manual from a signal-support doctrine
  PDF: they all looked identical from the gate's seat.

  This node fixes that by running Docling on ONLY the first 10 pages of each
  document (page_range=(1, 10)) and writing a markdown preview to disk.
  `check_documents` then reads that markdown instead of the placeholder, so
  the LLM gate can make content-aware decisions.

COST vs BENEFIT:
  First-10-pages is a cheap probe compared to the full parse:
    - Army doctrine PDFs we ingest are 50–500 pages.  10-page sample ≈ 2–10%
      of the full parse time (seconds, not minutes).
    - Docling still runs its layout-detection + TableFormer models, but on
      1/10th to 1/50th the surface area.
    - Produces plain markdown via `result.document.export_to_markdown()` —
      small files (<100 KB typically) that the LLM can read.
  The full `convert_document` node still runs later, once the gate passes.
  That is where the authoritative parsed JSON + OCR escalation lives.

RELATION TO convert_document:
  Both nodes share the same text-layer DocumentConverter via
  `graph.docling_converters.get_textlayer_converter()` — a single lazy
  singleton per process.  Loading a second converter would waste ~seconds of
  init time and duplicate layout/TableFormer weights in RAM.

OCR-RETRY HELPER (plan B for broken-CMap PDFs):
  `ocr_retry_preview(doc)` re-renders one doc's first-10-pages preview
  using full-page Tesseract OCR, writing to `initial_pages_ocr.md` so
  the original text-layer preview stays available.  Called by
  `check_documents` when the gate rejects a doc with a "garbled /
  corrupt / unreadable" remark.  See docs/pdf_failure_fallback_plan.md
  for the full design.

MEMORY DISCIPLINE (locked memory.md "Memory hardening" row):
  One document at a time.  After writing the markdown file, `del result;
  gc.collect()` so a 10-page Docling result does not accumulate.

HOW TO RUN IN ISOLATION:
    python -m graph.nodes.initialpages_convert <folder_path_or_name>

  Writes to output/initial_parsed/<slug>/<doc_stem>.md.  Safe to re-run;
  overwrites existing markdown files.

STATE FIELDS:
    Reads  : documents, source_folder_slug
    Writes : initial_parsed_paths {source_path -> markdown_path}, ingestion_errors

CACHE GATE (sha256-based):
    Before running Docling on a doc's first 10 pages, we check the doc's
    output/<stem>/.stage_fingerprints.json.  If `initial_pages.md` exists
    on disk AND its recorded fingerprint matches the doc's current sha256,
    we skip the Docling call entirely, populate the state path from the
    existing file, and log a stage="initialpages_convert:cached" audit
    entry (treated as a non-failure, same as `:skipped`).  Set
    FORCE_REPARSE=1 in .env to bypass this gate.
"""
from __future__ import annotations

import gc
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# The two Docling converter builders (text-layer singleton + fresh
# full-page-OCR builder) live in graph/docling_converters.py so they
# stay in sync across this node, convert_document, and the OCR retry
# path invoked from check_documents.
from graph.docling_converters import build_ocr_converter, get_textlayer_converter

from docling.datamodel.base_models import ConversionStatus

from graph.config import (
    FILE_INITIAL_PAGES,
    FILE_INITIAL_PAGES_OCR,
    doc_output_dir,
    get_config,
)
from graph.fingerprints import is_artefact_fresh, write_fingerprint
from graph.state import IngestionState
from utils.file_normalizer import (
    ConversionFailedError,
    LibreOfficeUnavailableError,
    NormalizationError,
    normalize_document,
)


def _now() -> str:
    """ISO-8601 UTC timestamp for error log entries."""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# OCR RETRY PREVIEW — used by check_documents.py when a doc was rejected as
# "garbled / corrupt / unreadable".  Runs Docling with full-page Tesseract
# OCR on pages 1..10 so the LLM gate can re-score the doc on OCR'd content.
# See docs/pdf_failure_fallback_plan.md §3.
# ---------------------------------------------------------------------------

def ocr_retry_preview(
    doc: dict,
    cfg=None,
) -> tuple[Path | None, str | None]:
    """Re-render a doc's first-10-pages preview via full-page Tesseract OCR.

    Called by `check_documents` for the single doc that needs a retry.
    Bypasses LibreOffice normalization (that path is for legacy Office
    formats, not broken-CMap PDFs) and writes the OCR markdown to
    `output/<stem>/initial_pages_ocr.md`, independent of the original
    `initial_pages.md` so both previews remain available for audit.

    Returns (ocr_md_path, error_text):
        ocr_md_path  — Path to the written OCR markdown (None on failure).
        error_text   — None on success; a short string on any failure
                       (so the caller can record it in the reject bundle).
    """
    if cfg is None:
        cfg = get_config()
    file_path = Path(doc["path"])
    filename = doc["filename"]
    sha256 = doc.get("sha256", "")

    out_dir = doc_output_dir(filename, cfg)
    out_md = out_dir / FILE_INITIAL_PAGES_OCR

    # Cache hit: same sha256 already has an OCR preview on disk.  Re-use.
    if (
        not cfg.force_reparse
        and is_artefact_fresh(out_dir, FILE_INITIAL_PAGES_OCR, sha256, out_md)
    ):
        return out_md, None

    try:
        converter = build_ocr_converter()
        result = converter.convert(file_path, page_range=(1, 10))
        if result.status == ConversionStatus.FAILURE:
            return None, (
                "Docling OCR retry reported FAILURE. "
                f"Docling errors: {[str(e) for e in result.errors]}"
            )
        md_text = result.document.export_to_markdown()
        out_md.write_text(md_text, encoding="utf-8")
        if sha256:
            write_fingerprint(out_dir, FILE_INITIAL_PAGES_OCR, sha256)
        return out_md, None
    except Exception:
        return None, traceback.format_exc()
    finally:
        try:
            del result
        except NameError:
            pass
        gc.collect()


def initialpages_convert(state: IngestionState) -> dict[str, Any]:
    """
    LangGraph node: cheap first-10-pages Docling probe that writes markdown
    previews for `check_documents` to read.

    For every document in state["documents"]:
      1. Run Docling on pages 1..10 (Docling handles short docs gracefully —
         a 4-page PDF just returns 4 pages, no error).
      2. Export the parsed document to markdown.
      3. Write markdown to output/initial_parsed/<slug>/<doc_stem>.md.
      4. On any failure, append a detailed entry to state["ingestion_errors"]
         and move on (skip-and-log policy, per memory.md Graph Q5).
      5. Free the Docling result between files (memory-hardening rule).

    Returns a dict that LangGraph merges into state:
        initial_parsed_paths : dict mapping source path → markdown path
                               (missing entries mean initial-parse failed
                               for that doc; check_documents falls back to
                               the "[Binary document — ...]" placeholder)
        ingestion_errors     : carried-forward + new error entries
    """
    cfg = get_config()

    # `documents` is the per-folder file list produced by
    # utils.file_reader.list_documents — each entry has path/filename/sha256/size.
    documents = state.get("documents", [])

    # Per-doc output directories pre-created by main.py (filename -> absolute
    # output/<safe_stem>/ path).  Fall back to computing them here if a caller
    # (e.g. the standalone runner below) skipped that seed.
    doc_output_dirs: dict[str, str] = dict(state.get("doc_output_dirs") or {})

    # Output of this node: path mapping used by check_documents.  We key on
    # the SOURCE path (absolute) because the doc dicts downstream do the
    # same — keeping joins simple.
    initial_parsed_paths: dict[str, str] = {}

    # Carry forward any errors that earlier nodes recorded.  (There are none
    # today — this is the first node — but the contract is preserved so the
    # node stays robust if the graph is rewired later.)
    errors: list[dict] = list(state.get("ingestion_errors") or [])

    # Shared text-layer DocumentConverter singleton (loaded once per process).
    converter = get_textlayer_converter()

    # Process one document at a time — see module docstring for the rationale.
    for doc_meta in documents:
        file_path = Path(doc_meta["path"])
        filename = doc_meta["filename"]
        sha256 = doc_meta.get("sha256", "")

        # Resolve the per-doc output directory.  Main.py normally seeds this,
        # but the standalone runner does not — fall back to computing it.
        out_dir_str = doc_output_dirs.get(filename)
        out_dir = Path(out_dir_str) if out_dir_str else doc_output_dir(filename, cfg)
        out_md = out_dir / FILE_INITIAL_PAGES

        # ------------------------------------------------------------------
        # CACHE GATE — skip Docling entirely when the preview on disk was
        # produced by the exact same source bytes.  FORCE_REPARSE=1 in .env
        # disables this.
        # ------------------------------------------------------------------
        if (
            not cfg.force_reparse
            and is_artefact_fresh(out_dir, FILE_INITIAL_PAGES, sha256, out_md)
        ):
            initial_parsed_paths[str(file_path)] = str(out_md)
            errors.append({
                "stage":     "initialpages_convert:cached",
                "file":      filename,
                "traceback": f"cache hit ({sha256[:12]}…) — reused {out_md.name}",
                "ts":        _now(),
            })
            continue

        # ------------------------------------------------------------------
        # STEP 0: Pre-parse normalization (see convert_document.py for the
        # full rationale).  Legacy .doc/.ppt/.xls etc. get converted to
        # OOXML via LibreOffice headless; modern formats pass through.
        # Temp dirs are cleaned up in the finally below.
        # ------------------------------------------------------------------
        normalized = None
        try:
            try:
                normalized = normalize_document(file_path)
            except LibreOfficeUnavailableError:
                errors.append({
                    "stage":     "initialpages_convert:normalize",
                    "file":      str(file_path),
                    "traceback": traceback.format_exc(),
                    "ts":        _now(),
                })
                continue
            except (ConversionFailedError, NormalizationError):
                errors.append({
                    "stage":     "initialpages_convert:normalize",
                    "file":      str(file_path),
                    "traceback": traceback.format_exc(),
                    "ts":        _now(),
                })
                continue

            if normalized.conversion_note:
                errors.append({
                    "stage":     "initialpages_convert:normalize:note",
                    "file":      str(file_path),
                    "traceback": normalized.conversion_note,
                    "ts":        _now(),
                })

            parse_path = normalized.parse_path

            # --------------------------------------------------------------
            # STEP 1: Docling on the first 10 pages only.
            #
            # `page_range` is a (start, end) tuple, both 1-indexed and
            # inclusive.  Docling gracefully handles docs with fewer than
            # 10 pages — no pre-check needed.  Non-PDF formats (DOCX, TXT)
            # have no concept of "pages" and ignore the parameter.
            # --------------------------------------------------------------
            result = converter.convert(parse_path, page_range=(1, 10))

            # Docling reports FAILURE only when nothing could be extracted.
            # PARTIAL_SUCCESS means some pages failed but the rest are fine
            # — good enough for a gate preview.
            if result.status == ConversionStatus.FAILURE:
                errors.append({
                    "stage":     "initialpages_convert",
                    "file":      str(file_path),
                    "traceback": (
                        "Docling reported FAILURE for first-10-pages probe. "
                        f"Docling errors: {[str(e) for e in result.errors]}"
                    ),
                    "ts":        _now(),
                })
                continue  # no markdown for this doc — gate will use placeholder

            # --------------------------------------------------------------
            # STEP 2 + 3: Export to markdown and write to disk.
            #
            # `export_to_markdown()` produces a compact, LLM-friendly
            # rendering: headings, lists, tables.  Much cheaper for the
            # gate to read than the full JSON.
            # --------------------------------------------------------------
            md_text = result.document.export_to_markdown()
            out_md.write_text(md_text, encoding="utf-8")
            initial_parsed_paths[str(file_path)] = str(out_md)

            # Stamp the artefact with the source sha256 so the next run can
            # skip this stage when the file has not changed.
            if sha256:
                write_fingerprint(out_dir, FILE_INITIAL_PAGES, sha256)

        except Exception:
            # Any uncaught exception (corrupt file, OCR crash, out-of-memory,
            # network error on a font download) lands here.  Log the full
            # traceback for post-hoc debugging and move on — we never let a
            # bad file abort the whole folder's ingestion (memory.md Graph Q5).
            errors.append({
                "stage":     "initialpages_convert",
                "file":      str(file_path),
                "traceback": traceback.format_exc(),
                "ts":        _now(),
            })

        finally:
            # --------------------------------------------------------------
            # STEP 4: Free the Docling result immediately AND clean up any
            # LibreOffice temp directory.
            #
            # Even a 10-page parse can leave 20–100 MB resident (layout
            # tensors, table cells, bitmap caches).  Waiting for Python's
            # normal garbage-collection means the peak can climb doc-by-doc.
            # `del + gc.collect()` keeps per-process memory bounded.
            # `normalized.cleanup()` removes the temp dir for any legacy
            # Office file that was converted to OOXML on the way in (no-op
            # for native formats, and guarded for the case where
            # normalization itself raised before assignment).
            # --------------------------------------------------------------
            try:
                del result  # may not exist if convert() raised
            except NameError:
                pass
            gc.collect()
            if normalized is not None:
                normalized.cleanup()

    return {
        "initial_parsed_paths": initial_parsed_paths,
        "ingestion_errors":     errors,
    }


# =============================================================================
# STANDALONE MODE — run this node directly for isolated testing.
# =============================================================================
# Usage:
#   python -m graph.nodes.initialpages_convert <folder_path_or_name>
#
# Accepts either a short name under inputs/ (e.g. "doctrine") or an absolute
# path to a folder.  Writes markdown previews to
# output/initial_parsed/<slug>/<doc_stem>.md and prints the mapping so you
# can spot-check the output.

if __name__ == "__main__":
    import re
    from dotenv import load_dotenv
    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python -m graph.nodes.initialpages_convert <folder_path_or_name>")
        sys.exit(1)

    # Resolve the folder argument.  Try it as an absolute path first; if it
    # is not, look for it under inputs/ (the source-of-truth corpus folder).
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

    slug = re.sub(r"[^a-z0-9_-]", "_", folder.name.lower())[:48]

    docs = list_documents(str(folder))
    if not docs:
        print(f"No supported documents found in {folder} "
              "(see utils/file_normalizer.SUPPORTED_EXTENSIONS for the list).")
        sys.exit(1)

    _cfg = get_config()
    _doc_output_dirs = {
        d["filename"]: str(doc_output_dir(d["filename"], _cfg)) for d in docs
    }
    dummy_state: IngestionState = {
        "source_folder":      str(folder),
        "source_folder_slug": slug,
        "documents":          docs,
        "doc_output_dirs":    _doc_output_dirs,
        "ingestion_errors":   [],
    }

    out = initialpages_convert(dummy_state)

    print(f"\nResults:")
    print(f"  Parsed previews   : {len(out['initial_parsed_paths'])} file(s)")
    print(f"  Skipped / failed  : {len(docs) - len(out['initial_parsed_paths'])} file(s)")
    print(f"  Errors logged     : {len(out['ingestion_errors'])}")
    for src, md in out["initial_parsed_paths"].items():
        print(f"  {Path(src).name} → {md}")
    for e in out["ingestion_errors"]:
        short_tb = e["traceback"][:200].replace("\n", " ")
        print(f"  [{e['stage']}] {e['file']}: {short_tb}")
