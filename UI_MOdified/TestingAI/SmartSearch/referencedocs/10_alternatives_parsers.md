# 10 — Alternative Document Parsers (Not Chosen)

> Reference for when we hit a Docling limitation and need to swap.
> Active parser: Docling (see `02_docling_parser.md`).

---

## Why read this doc

You're only here if Docling failed on a specific document class. Swap parsers at the `parse` node boundary — output must still be convertible to what HybridChunker expects. That means either keeping Docling as a "decorator" around another parser's output, or re-implementing chunking with a different structure-aware chunker.

---

## Marker

**What it is**: PDF → Markdown converter. Uses a stack of ML models: layout, OCR, table detection, equation detection.

**Strengths**:
- Best-in-class PDF-to-markdown quality for academic / technical PDFs.
- Handles equations cleanly (LaTeX output).
- Strong on complex multi-column layouts.

**Weaknesses**:
- **PDF only** (recent versions add a few more, but DOCX/PPTX aren't native).
- **Heavy**: 5–10 GB of models, GPU strongly recommended.
- **Markdown output only**: no structural metadata tree. You lose the heading/section/page references that HybridChunker uses.
- **Newer, less stable maturity** than Docling for enterprise-style docs.

**When to swap**: if your corpus becomes heavily equation-based (e.g. artillery fires manuals with ballistics formulas, engineering designs) and Docling's table model struggles with the page layout.

**Install**: `pip install marker-pdf`
**Entry point**: `marker.convert.convert_single_pdf(...)`

---

## Unstructured.io

**What it is**: Multi-format document parser with format-specific strategies.

**Strengths**:
- Huge format coverage (email, HTML, PPTX, eml, msg, PDF, DOCX, XLSX, etc.).
- Partition API is simple; one function per format.
- Built-in chunking strategies.

**Weaknesses**:
- Heavy dependency tree (OpenCV, Tesseract optional).
- Table extraction is weaker than Docling's TableFormer.
- Output is a flat `list[Element]` rather than a hierarchy tree.

**When to swap**: if the corpus expands to weird formats (emails, legacy formats) that Docling doesn't handle well.

**Install**: `pip install "unstructured[local-inference]"`
**Entry point**: `unstructured.partition.auto.partition(filename=...)`

---

## Nougat (Meta)

**What it is**: Transformer-based PDF-to-markdown, trained on academic papers.

**Strengths**:
- Very strong on scientific/academic layouts.
- Good equation extraction.

**Weaknesses**:
- Essentially academic-only.
- Slow inference, requires GPU for reasonable throughput.
- Not maintained actively.

**When to swap**: never for doctrine. Useful only if you're parsing papers.

**Install**: `pip install nougat-ocr`

---

## GROBID

**What it is**: Java service that parses scholarly PDFs into TEI XML.

**Strengths**:
- Best-in-class citation / reference extraction.
- Good section hierarchy for academic papers.

**Weaknesses**:
- Java / Docker only, not a Python library.
- Academic-specific.

**When to swap**: same as Nougat — academic papers specifically. Not doctrine.

---

## LayoutParser

**What it is**: Library of layout-analysis models (Detectron2, PaddlePaddle-based).

**Strengths**:
- Flexible — you compose your own pipeline.

**Weaknesses**:
- Low-level. You implement everything on top.
- High cost to build "what Docling already built".

**When to swap**: only if you need to build a custom layout pipeline for a very unusual doc family (forms, diagrams, CAD-heavy manuals). Significant engineering effort.

---

## pymupdf (fitz) + pdfplumber

**What they are**: lightweight PDF text extractors without ML.

**Strengths**:
- Fast, minimal dependencies.
- Great for plain text extraction from simple PDFs.

**Weaknesses**:
- No layout model. Multi-column PDFs come out jumbled.
- Tables flatten to space-separated text, destroying structure.
- No figure handling.

**When to swap**: never as primary. Useful as a **fallback** if Docling crashes on a specific doc — grab raw text and move on, at the cost of structural metadata.

**Install**: `pip install pymupdf pdfplumber`
**Entry point**: `fitz.open(path).get_text()`

---

## Cloud services (excluded)

**LlamaParse, Adobe Extract, AWS Textract, Azure Document AI** — excellent quality, especially on hard PDFs. Excluded because they violate the local-only principle for this project. Keep in mind if you ever need industrial-grade parsing and accept cloud dependency.

---

## Decision tree (if swapping)

```
Does Docling fail completely?
├── Yes — try pymupdf as raw-text fallback
└── No, but output quality is poor
    ├── Docs are heavy on equations → Marker
    ├── Docs are emails / eml / msg → Unstructured
    ├── Docs are academic papers → Nougat or GROBID
    └── Docs are forms / CAD / highly unusual → LayoutParser (custom pipeline)
```

Before swapping, try adjusting Docling config first:
- `do_table_structure = True` is already on
- `do_ocr = True` if source has scanned pages
- Different `TableStructureOptions` (cell matching, cell content mode)
