"""
graph/docling_converters.py
============================
Shared Docling DocumentConverter builders.

TWO CONVERTER FLAVOURS:

  get_textlayer_converter()  — the default fast-path.  Uses
      OcrAutoOptions so Docling reads the PDF's text layer directly and
      only OCRs regions that look like bitmaps.  Singleton (loaded once
      per process) because every ingested doc hits it first.

  build_ocr_converter()      — the force-full-page-OCR fallback.  Uses
      TesseractCliOcrOptions(force_full_page_ocr=True) so every page is
      rasterised and OCR'd even when a text layer exists.  NOT cached —
      escalation is rare, and building a fresh converter keeps the code
      simple.

WHY THIS MODULE EXISTS:
  The text-layer converter is used by
  `graph/nodes/initialpages_convert.py` (first-10-pages probe) and
  `graph/nodes/convert_document.py` (full parse).  The OCR converter is
  used by `convert_document.py` for per-page thin-page escalation, and
  by `check_documents.py` for the garbled-text retry loop (plan B in
  docs/pdf_failure_fallback_plan.md §3).  Keeping the builders in one
  place avoids four parallel copies drifting out of sync and lets the
  OCR language(s) be driven by one env var.

LANG SETTING:
  `OCR_LANGS` in .env (e.g. "eng", "eng+ara") controls the Tesseract
  language packs used by build_ocr_converter().  Passed through as
  a list to TesseractCliOcrOptions(lang=...).  Default "eng".  Add
  more when the Arabic doctrine corpus ships (see memory.md open
  items — Arabic doctrine corpus).
"""
from __future__ import annotations

from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    OcrAutoOptions,
    PdfPipelineOptions,
    TesseractCliOcrOptions,
)
from docling.document_converter import DocumentConverter, PdfFormatOption

from graph.config import get_config


_textlayer_converter: DocumentConverter | None = None


def get_textlayer_converter() -> DocumentConverter:
    """Return the shared text-layer DocumentConverter (built lazily).

    Uses OcrAutoOptions: Docling reads the PDF text layer and only OCRs
    pixel regions that lack selectable text.  Fast and correct for
    well-formed PDFs.  Singleton because loading the layout /
    TableFormer weights is expensive.
    """
    global _textlayer_converter
    if _textlayer_converter is None:
        cfg = get_config()
        pipeline_options = PdfPipelineOptions(
            do_ocr=True,
            ocr_options=OcrAutoOptions(),
        )
        pipeline_options.accelerator_options = AcceleratorOptions(
            device=AcceleratorDevice(cfg.docling_device)
        )
        _textlayer_converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            }
        )
    return _textlayer_converter


def build_ocr_converter() -> DocumentConverter:
    """Build a fresh DocumentConverter that forces full-page Tesseract OCR.

    NOT cached — see module docstring.  Used when the text-layer path
    produced garbage (broken ToUnicode CMap, mis-embedded font, etc.)
    and we need to re-read the doc as if it were a scan.  Tesseract
    decodes the rendered glyphs visually, bypassing the PDF's internal
    character encoding.

    Respects `OCR_LANGS` in .env (comma or plus-separated, e.g.
    "eng", "eng+ara").  Passed through to TesseractCliOcrOptions.
    """
    cfg = get_config()
    # Accept both "eng,ara" and "eng+ara" — Tesseract itself uses "+".
    langs = [
        lang.strip()
        for lang in cfg.ocr_langs.replace("+", ",").split(",")
        if lang.strip()
    ] or ["eng"]

    pipeline_options = PdfPipelineOptions(
        do_ocr=True,
        ocr_options=TesseractCliOcrOptions(lang=langs, force_full_page_ocr=True),
    )
    pipeline_options.accelerator_options = AcceleratorOptions(
        device=AcceleratorDevice(cfg.docling_device)
    )
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )
