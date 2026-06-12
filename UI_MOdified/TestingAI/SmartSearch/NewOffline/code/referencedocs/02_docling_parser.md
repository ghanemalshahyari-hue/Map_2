# 02 — Docling (Document Parser)

> Source of truth: `libs/docling/` + `libs/docling-core/`.
> Official site when online is acceptable: https://docling-project.github.io/docling/
> This doc captures the pinned API we commit to. If the local `libs/` differs
> from anything here, **the local source wins** — update this doc.

---

## What it is

Docling is IBM's document-to-structure converter. Takes a file (PDF, DOCX, PPTX, HTML, images, XLSX, MD) and produces a **`DoclingDocument`** — a typed tree containing sections, tables, figures, pages, bounding boxes, and plain text.

We use it as the **single parser** for the ingestion pipeline regardless of input format.

## Why we chose it

- **Layout-aware**: uses ML models for page layout and table structure (TableFormer).
- **One schema across formats**: PDF, DOCX, PPTX all output the same `DoclingDocument` shape. Downstream code doesn't branch per format.
- **Pairs natively with HybridChunker** (our chunker) — see `03_docling_hybrid_chunker.md`.
- **Local, offline-capable**: models cached on disk, no API calls during parse.
- **Active IBM maintenance.**

## When to NOT use it (swap triggers)

- Heavy equation-rich academic PDFs → consider Marker. See `10_alternatives_parsers.md`.
- Handwriting / unusual scanned layouts → specialist OCR pipeline. See `15_ocr_options.md`.
- Simple `.txt` only, performance-critical → direct file read is faster.

## Install

In this project's venv:
```
pip install docling
```
Pulls Docling itself plus `docling-core`, `docling-parse`, PyTorch, and the layout/TableFormer models on first run.

First-run behaviour: models (~1–2 GB) download to `~/.cache/docling/` and are reused thereafter. The first `convert()` call is slow; subsequent calls are fast.

## The minimal API we commit to

### Convert one file
```python
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("path/to/doc.pdf")
doc = result.document          # a DoclingDocument
```

### Inspect the document
```python
# Export to markdown (lossy — for preview only)
md_text = doc.export_to_markdown()

# Export to JSON (full structure, what we dump to output/parsed/)
json_dict = doc.export_to_dict()

# Iterate sections/items with hierarchy
for item, level in doc.iterate_items():
    # item can be: TextItem, SectionHeaderItem, TableItem, PictureItem, ListItem
    # level = nesting depth
    ...

# Access tables specifically
for table in doc.tables:
    df = table.export_to_dataframe()   # pandas DataFrame for inspection
```

### Configure for our needs
```python
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions

from docling.datamodel.pipeline_options import OcrAutoOptions

pipeline_options = PdfPipelineOptions()
# Accuracy-first OCR — see referencedocs/15_ocr_options.md for the full design.
pipeline_options.do_ocr = True
pipeline_options.force_full_page_ocr = False    # keep PDF text layer on clean pages
pipeline_options.ocr_options = OcrAutoOptions() # auto-selects OcrMac on macOS
pipeline_options.do_table_structure = True      # TableFormer on
pipeline_options.table_structure_options.do_cell_matching = True

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
    }
)
```

## Accelerator selection (M4 — see also `08_apple_silicon_mps_setup.md`)

```python
from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice

pipeline_options.accelerator_options = AcceleratorOptions(
    num_threads=4,
    device=AcceleratorDevice.MPS,    # Apple Metal on M1–M4
)
```
On Linux/NVIDIA change to `AcceleratorDevice.CUDA`. On systems with no GPU, `AcceleratorDevice.CPU`. See `transferOS.md` for the full platform matrix.

## Expected outputs per input type

| Input | Parser behaviour | What survives |
|---|---|---|
| `.txt` | Treated as plain markdown-ish text | Text only — no structure to preserve |
| `.md` | Parsed as markdown | Headings, lists, code blocks |
| `.docx` | Full structure | Headings, paragraphs, tables, lists, images (with captions) |
| `.pdf` (digital-born) | Layout + TableFormer | Section headings, paragraphs, tables, figures, page numbers |
| `.pdf` (scanned) | Requires `do_ocr=True` | Text from OCR; layout quality depends on scan |
| `.pptx` | Per-slide | Slide titles, text boxes, tables |
| `.xlsx` | Sheet-by-sheet | Tables per sheet |

## Known gotchas

- **First parse is slow.** Model load + warm-up ~20–60 s. Warm parses are much faster.
- **Memory on long PDFs.** A 500-page PDF can use 2–4 GB during parse. Close other apps if low RAM.
- **Table quality varies.** TableFormer is strong but not perfect on multi-page tables or merged cells.
- **Figures / images aren't OCR'd by default.** Captions are captured; content inside the image is not.
- **Classification markings** (e.g. "UNCLASSIFIED" headers/footers) are usually classified as page-level chrome and excluded from body text — but verify per doc family.

## What we do with the output

1. Dump the `DoclingDocument` to `output/parsed/<source_folder>/<doc>.json` via `doc.export_to_dict()`.
2. Pass the `DoclingDocument` (NOT the markdown export) to `HybridChunker`. Reason: preserves structural metadata.

## Error taxonomy (what we catch)

Per-doc errors surface in `parse_errors` (state field). Common classes:
- `ConversionError` — generic failure during convert()
- `FileNotFoundError` — upstream file missing
- Model-loading errors on first run (usually transient — retry)

See `nodes.py` parse node when implemented: wraps `convert()` in try/except, records `{file, stage: "parse", error_type, message, traceback, timestamp}` in state and continues.

## Source pointers (after `libs/` populated)

- `libs/docling/docling/document_converter.py` — `DocumentConverter`, format options
- `libs/docling/docling/datamodel/pipeline_options.py` — `PdfPipelineOptions`
- `libs/docling-core/docling_core/types/doc/document.py` — `DoclingDocument`, items, iteration
