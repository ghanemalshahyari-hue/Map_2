# 15 — OCR Options (Accuracy-First Two-Pass Architecture)

> **Status (2026-04-19):** OCR is now **enabled** and is a load-bearing part of
> the parser design. This doc supersedes the earlier "OCR disabled" posture.
> Authoritative record: `memory.md` rows **OCR**, **OCR escalation**,
> **Parse diagnostics**.
>
> **Design principle: accuracy first.** Cost and speed are explicitly secondary.
> A silent miss on a scanned page renders the downstream retrieval useless, so
> the parser must never skip content without logging it.

---

## What the user requirement is

> "Make sure not to miss anything or break any document, accuracy is all that
> matters, not cost, not speed."

Translated to parser config:

- We cannot rely on `do_ocr=False` because the corpus will include non-digital
  (scanned) docs.
- We cannot blindly use `force_full_page_ocr=True` either, because it drops the
  programmatic PDF text layer entirely on clean pages (see below) — that
  *reduces* accuracy on digital pages.
- We need an architecture that preserves the text layer where it is good AND
  guarantees OCR coverage where it is not, with an auditable trail of every
  escalation decision.

---

## How Docling actually handles OCR (verified in `libs/docling-2.89.0/`)

**File:** `docling/models/base_ocr_model.py::BaseOcrModel.get_ocr_rects`
(lines 40–113 at the time of writing).

For each PDF page, Docling:

1. Asks the backend for `bitmap_rects` — the image regions drawn on the page.
2. Computes `coverage = bitmap_area / page_area` (after dilation to merge
   neighbouring bitmaps).
3. Picks the OCR strategy for the page:

   | Condition | Strategy |
   |---|---|
   | `force_full_page_ocr=True` **OR** `coverage > max(0.75, bitmap_area_threshold)` | **Full-page OCR** — whole page rendered and OCR'd |
   | `coverage > bitmap_area_threshold` (but below 0.75) | **Selective OCR** — only the bitmap regions are OCR'd |
   | Otherwise | **Skip OCR** — bitmap is too small to matter |

4. After OCR, `_filter_ocr_cells` **drops OCR cells that overlap programmatic
   cells**, so the PDF text layer always wins on regions where both exist.
5. `_combine_cells` merges the surviving OCR cells into the page's textline
   cells. If `force_full_page_ocr=True`, programmatic word/char cells are
   **replaced** with OCR cells entirely (lines 163–171).

**Consequence that shapes our design:** `force_full_page_ocr=True` is *less*
accurate on digital pages than the default selective mode, because it throws
away the high-fidelity text layer in favour of OCR. It is the right choice for
genuinely scanned pages and the wrong choice for clean ones.

---

## Our two-pass architecture

### Pass 1 — primary parse (runs on every document)

```
do_ocr = True
force_full_page_ocr = False
ocr_options = OcrAutoOptions()
# bitmap_area_threshold defaults; revisit only if page diagnostics show drift
```

`OcrAutoOptions` (see `libs/docling-2.89.0/docling/models/stages/ocr/auto_ocr_model.py`)
auto-selects:

1. **OcrMac** on macOS — native Apple Vision framework. No model download, no
   GPU tuning, hardware-accelerated. Default on the M4 dev machine.
2. **RapidOCR (onnxruntime)** elsewhere if `onnxruntime` + `rapidocr` are
   installed.
3. **EasyOCR** if installed.
4. **RapidOCR (torch)** as a last resort.

Pass 1 gives us: programmatic text where the PDF has a text layer, plus OCR
text for bitmap regions above `bitmap_area_threshold`, merged into a single
`DoclingDocument`. On a clean digital PDF this costs almost nothing
(bitmap coverage is zero → OCR never fires).

### Diagnostics — always written, always inspectable

For each page Docling produces we compute:

- `char_count` — total characters in merged textline cells.
- `programmatic_cell_count` / `ocr_cell_count` — how many cells came from where.
- `bitmap_coverage` — fraction of the page area covered by bitmaps (the same
  metric Docling itself used for the OCR decision).
- `ocr_triggered` — did selective OCR fire on this page?

Dumped to `output/parsed/<source_folder>/<doc_name>.diagnostics.json`. This is
the human spot-check surface. If retrieval ever returns garbage, the
diagnostics file tells you whether the parse was the problem.

### Escalation heuristic — per page, not per document

A page is "suspect" if **all** of:

- `char_count < CHAR_FLOOR` (tunable; sensible starting point: 50 chars).
- `bitmap_coverage > BITMAP_FLOOR` (tunable; starting point: 0.3).
- `ocr_cell_count == 0` (selective OCR did not fire or produced nothing).

Rationale: a genuinely empty page (blank page, cover page) would be flagged by
the first condition but cleared by the second. A clean digital page passes the
third. Only pages that look like un-OCR'd scans trigger escalation.

### Pass 2 — escalation (runs only for suspect pages)

```
do_ocr = True
force_full_page_ocr = True
ocr_options = TesseractCliOcrOptions(lang=["auto"])
```

Why this config:

- `force_full_page_ocr=True` — we *want* OCR to replace the (empty or wrong)
  text layer on this specific page.
- `TesseractCliOcrOptions(lang=["auto"])` — Tesseract's OSD (Orientation-Script
  Detection) runs per region and picks a per-script Tesseract reader on the
  fly (`libs/docling-2.89.0/docling/models/stages/ocr/tesseract_ocr_model.py`
  lines 178–203). This handles multilingual and rotated scans — the scenarios
  `OcrAutoOptions` (via Vision/RapidOCR) can silently miss.
- We re-parse the whole document with these options, then swap in only the
  suspect pages from the escalation pass into the Pass-1 `DoclingDocument`.
  Clean pages keep their Pass-1 output so we don't regress on digital text.

### Evidence trail — escalations are never silent

Every page that triggers escalation adds an entry to `ingestion_errors`:

```json
{
  "doc": "foo.pdf",
  "page": 12,
  "stage": "ocr_escalation",
  "reason": "char_count=3, bitmap_coverage=0.82, ocr_cell_count=0",
  "result": "ok",                        // or "still_thin"
  "pass2_char_count": 1874,
  "timestamp": "2026-04-19T..."
}
```

If Pass 2 also produces a thin page (`result="still_thin"`), the pipeline logs
it prominently. You review the doc manually, decide whether to use OCRmyPDF
upstream, or accept that the page is genuinely blank.

---

## What Docling supports in our pinned version (2.89.0)

Engines available via `ocr_options`:

| Engine | Options class | Install | Multilingual | `lang=["auto"]` |
|---|---|---|---|---|
| Apple Vision (macOS) | `OcrMacOptions` | `pip install ocrmac` | Yes (via locale codes like `en-US`, `fr-FR`) | No — relies on macOS language list |
| EasyOCR | `EasyOcrOptions` | `pip install easyocr` | Yes (80+ langs via ISO 639-1 codes) | No |
| Tesseract (CLI) | `TesseractCliOcrOptions` | `brew install tesseract` | Yes (via `+`-joined 639-2 codes) | **Yes** |
| Tesseract (tesserocr) | `TesseractOcrOptions` | `pip install tesserocr` (fussy to build) | Yes | **Yes** |
| RapidOCR | `RapidOcrOptions` | `pip install rapidocr-onnxruntime` | English + Chinese by default | No |
| OcrAuto | `OcrAutoOptions` | Wraps the above; picks best-available | Engine-dependent | Engine-dependent |
| KServe v2 OCR | `KserveV2OcrOptions` | Requires `enable_remote_services=True` | Deployment-dependent | Deployment-dependent |

**Surya OCR** appears in current Docling docs online but is **NOT** present in
our pinned `docling-2.89.0/docling/models/stages/ocr/` directory. Do not plan
around it without upgrading. Upgrading requires re-running everything and
updating `memory.md`.

---

## Multilingual posture

- **Default (Pass 1) on M4:** `OcrMac` via `OcrAutoOptions`. Vision handles
  English plus the languages enabled in macOS Language & Region settings.
- **Escalation (Pass 2):** `TesseractCliOcrOptions(lang=["auto"])`. Requires
  language data packs installed locally — verify with:
  ```
  tesseract --list-langs
  ```
- **Cross-script documents (e.g. Arabic + Latin on the same page):** Tesseract
  `auto` handles this via OSD per region. If quality is poor, fall back to
  explicit `lang=["eng","ara"]`.

---

## External pre-OCR (OCRmyPDF) — reserved for true worst case

If Pass 2 still produces thin pages, the manual escape hatch is:

```
ocrmypdf -l eng+fra+ara input.pdf searchable.pdf
```

Then parse `searchable.pdf` with `do_ocr=False`. OCRmyPDF embeds its own text
layer, so Docling treats the result as digital-born. This is **not** part of
the default pipeline — it is an operator-invoked rescue for specific problem
docs, not an automatic step. Adopting it into the graph would require a new
memory.md decision.

---

## Installation footprint for the locked plan

Current (via pip inside venv):
```
docling            # already installed
```

Needed beyond docling's own deps for the escalation path:
```
pip install ocrmac                 # Pass 1 on macOS
brew install tesseract             # Pass 2 language binary
brew install tesseract-lang        # all language packs (optional; large)
# OR targeted: brew install tesseract && \
#   tesseract language packs via https://github.com/tesseract-ocr/tessdata
```

Confirm with:
```
python -c "from ocrmac import ocrmac; print('ok')"
tesseract --version
tesseract --list-langs
```

---

## Performance expectations (for reference, not for optimisation)

Rough per-page overhead on the M4 dev machine:

| Config | Per page |
|---|---|
| Pass 1 (OcrMac, selective) on clean digital PDF | negligible (OCR never fires) |
| Pass 1 (OcrMac, selective) on scanned PDF | ~0.3–1.0 s |
| Pass 2 (Tesseract CLI, full-page, lang=auto) | ~1.5–4.0 s |

A 300-page mostly-digital document with 10 suspect pages: Pass 1 in a few
seconds, Pass 2 on 10 pages in ~30 s. Acceptable under the "accuracy over speed"
rule.

---

## What to re-review before implementation

- Tune `CHAR_FLOOR` and `BITMAP_FLOOR` against 2–3 known-problematic docs.
- Confirm `tesseract` + `tesseract-lang` packs are installed on the dev machine.
- Decide whether to freeze `bitmap_area_threshold` or let it stay at Docling's
  default. We have no reason to move it yet.
- Decide behaviour when Pass 2 also fails: do we mark the doc `ingestion_status
  = "partial"` and continue, or block the collection? Current memory.md rule
  is skip-and-log — continue, log, surface in diagnostics.

---

## Related docs

- `02_docling_parser.md` — parser API (needs a one-line update to point here for OCR).
- `08_apple_silicon_mps_setup.md` — MPS accelerator setup (Pass 1's OcrMac is complementary).
- `transferOS.md` — when moving off macOS, `OcrMac` is unavailable; `OcrAutoOptions` falls back to RapidOCR / EasyOCR automatically.
