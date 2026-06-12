# PDF ingestion failure — diagnosis + proposed fallback plan

**Status:** draft for second-opinion review (2026-04-22).
**Scope:** Phase 1 ingestion (`initialpages_convert` → `check_documents` →
`convert_document`). Applies to any PDF/DOCX dropped into `inputs/<folder>/`.
**Trigger case:** `inputs/doctrine/ADP-2-0-Intelligence.pdf` rejected by the
per-doc LLM gate with remark "significant amount of garbled text …
corrupted … unreadable and lacking coherent content." Full ingest audit:
3 of 4 manuals accepted (2165 chunks), ADP 2-0 dropped, no ADP-2-0 coverage
at retrieval time (elided by `retrieval_group.missing_manual_elision`).

---

## 1 · What went wrong

### 1.1 The encoded text

`output/ADP-2-0-Intelligence/initial_pages.md` contains exactly 88 pages of
Docling markdown. Its first non-image line is `## $'3 ,17(//,*(1&(`. The
correct title is `## ADP 2-0 INTELLIGENCE`.

Every printable ASCII character in the extracted text is Caesar-shifted
by **-29** relative to its true value — equivalently, decoding means
`chr(ord(c) + 29)`:

| encoded | ord | +29 | decoded |
|---|---|---|---|
| `$` | 36 | 65 | `A` |
| `'` | 39 | 68 | `D` |
| `3` | 51 | 80 | `P` |
| `,` | 44 | 73 | `I` |
| `\x13` | 19 | 48 | `0` |
| `\x10` | 16 | 45 | `-` |
| `\x11` | 17 | 46 | `.` |
| `\x1d` | 29 | 58 | `:` |

Digits and punctuation land on control-range bytes (`\x10`–`\x1f`) in the
encoded form; that's why `pypdfium2.get_textpage().get_text_range()` returns
strings peppered with control characters and why Docling's markdown export
still reads like a ROT cipher.

### 1.2 Root cause

PDF metadata:
```
Creator  : Adobe InDesign CC 2015 (Windows)
Producer : Acrobat Distiller 15.0 (Windows)
CreationDate : 2019-07-16
```

The body-text font was embedded with a **custom glyph-index encoding but
no (or broken) `ToUnicode` CMap**. Text extractors that rely on the PDF's
text layer pull the raw glyph codes and interpret them as ASCII. The PDF
still renders visually correctly because the glyph shapes themselves are
intact — the issue is strictly at the text-layer CMap level. Adobe
InDesign CC 2015 → Acrobat Distiller 15.0 is a known offender for this on
pre-2020 Army pubs.

### 1.3 Why a blanket "de-ROT" post-processor is unsafe

Temptation: just add `chr((ord(c) + 29) & 0x7f)` to every extracted char
and move on. I scanned all 88 pages and classified them:

| class | definition | count |
|---|---|---|
| pure-Caesar | `decoded_alpha > 1.2 × encoded_alpha` | 4 |
| pure-plain  | `encoded_alpha > 1.2 × decoded_alpha` | 0 |
| **mixed**   | both classes live on the same page | 74 |

Inspecting p30 confirms the mixing happens **within a single page**:
headers and marginal boxes extract as plain English (`"Which enemy
actions are expected?"`) while the surrounding body paragraph is Caesar
(`"3URYLGHLQWHOOLJHQFHVXSSRUW…"`). A blanket shift would corrupt the
already-correct spans into nonsense. Span-level detection is heuristic
and fragile; I do not recommend it.

### 1.4 Why this is not a one-off

Any PDF produced by a non-standards-compliant pipeline — older Army pubs,
OCR'd photocopies with mis-embedded fonts, scanned-then-converted docs,
PowerPoint exports with non-ASCII ligatures — can hit the same failure
mode, sometimes silently (text extracts cleanly but the CMap is wrong,
and only a human notices the output is gibberish). The gate catches
*obvious* gibberish via the LLM remark; it does **not** catch subtle
partial-encoding damage.

---

## 2 · Current behavior when a PDF fails

The pipeline already has **three** graceful-degradation mechanisms. The
gap is at one specific layer:

| stage | mechanism today | handles ADP 2-0? |
|---|---|---|
| `initialpages_convert` | Docling first-10-pages probe. Exception → log to `ingestion_errors` and skip doc. No OCR escalation at this layer. | No — Docling "succeeds" with garbage text, no exception. |
| `check_documents` | LLM reads `initial_pages.md` and returns `{decision: accept/reject, remarks}`. Rejected docs stop here, review bundle at `output/not_enough/<slug>/<stem>/`. | Yes — but with a false diagnosis ("corrupted"). |
| `convert_document` | Runs Docling with `OcrAutoOptions`. If any page comes out "thin" (bitmaps with zero/<50 chars), re-parses the **whole doc** with `TesseractCliOcrOptions(force_full_page_ocr=True)`. | Not reached — gate already rejected. |
| `retrieval_group` | Missing-manual elision — drops dead `source_doc` filters at query time. | Yes — downstream. |

**The gap:** the OCR-escalation path lives in `convert_document`, *after*
the gate. A doc killed by the gate never gets a chance to be OCR'd. For
ADP 2-0 the gate correctly saw garbage in `initial_pages.md`, and that
was the end of the line.

---

## 3 · Proposed plan B

### 3.1 Shape of the fix

**Make the gate OCR-aware.** When `check_documents` is about to REJECT a
doc with a remark that pattern-matches "garbled / corrupt / unreadable /
encoded / cipher / nonsense", retry `initialpages_convert` on that doc
**once** with `force_full_page_ocr=True`, overwrite
`initial_pages.md`, and let the gate re-score it.

Flow:

```
initialpages_convert (OcrAutoOptions)
        │
        ▼
check_documents  ────────►  accept ──► continue pipeline
        │
        │  reject + remark matches garbage-pattern
        ▼
initialpages_convert (force_full_page_ocr=True)   ← NEW
        │
        ▼
check_documents (2nd pass, flag attempt=ocr)      ← NEW
        │
        ├── accept ──► continue pipeline (convert_document already handles full OCR)
        │
        └── reject ──► final reject, bundle under output/not_enough/<slug>/<stem>/
                       with both previews (preview_textlayer.md + preview_ocr.md)
                       and both decisions for audit
```

Behaviour on the ADP 2-0 case:
1. First pass: Docling text-layer → Caesar-encoded markdown → LLM rejects.
2. Retry: `TesseractCliOcrOptions(force_full_page_ocr=True)` → Tesseract
   reads the rendered glyphs via OCR, not the broken CMap → produces
   clean English markdown → LLM accepts.
3. `convert_document` then runs with its existing page-level escalation;
   the doc flows through the rest of the pipeline normally.

### 3.2 What we already have and can reuse

- `graph/nodes/convert_document.py::_make_escalation_converter()` already
  builds a `DocumentConverter` configured with
  `TesseractCliOcrOptions(lang=["auto"], force_full_page_ocr=True)`.
  Promote it to a shared module (e.g. `graph/docling_converters.py`) and
  import it from both nodes. No new engine dependency.
- `graph/fingerprints.py` already keys artefacts by
  `(source_sha256, stage_name)`. Add a new stage tag
  (`initialpages_convert:ocr`) so the OCR preview caches independently
  of the text-layer preview. Re-runs skip both if neither source nor
  code changed.
- `output/not_enough/<slug>/<stem>/check_decision.json` already stores
  decision + remarks. Extend it with an `attempts: [{mode: textlayer,
  decision, remark}, {mode: ocr, decision, remark}]` list so a reviewer
  can see both rounds.

### 3.3 What is new code

Four small additions, all additive:

1. **`graph/nodes/initialpages_convert.py`** — parameterize on
   `mode: Literal["textlayer", "ocr"]`. `textlayer` is the current
   behaviour; `ocr` uses the shared escalation converter and writes to
   `initial_pages_ocr.md`.
2. **`graph/nodes/check_documents.py`** — after a REJECT, classify the
   remark with a cheap regex (or a short follow-up LLM call with
   `response_format={"type": "json_object"}` and fields
   `{retry_with_ocr: bool, reason: str}`). If the retry flag is set,
   invoke `initialpages_convert(mode="ocr")` for just that doc and
   re-score once.
3. **`graph/config.py`** — new env var `OCR_RETRY_ON_GARBAGE=1` (default
   on) to let operators disable the retry if it proves too expensive,
   and `OCR_RETRY_MAX_DOCS_PER_RUN` (default `5`) as a cost guard.
4. **`docs/memory.md` + `docs/walkthrough.md`** — document the new
   two-pass gate. Add a "Do NOT add a blanket de-ROT decoder" entry
   (per §1.3 above).

### 3.4 Cost / risk profile

| axis | comment |
|---|---|
| latency | One extra Tesseract full-page OCR run per rejected-as-garbage doc. ADP 2-0 is 88 pages ≈ 60–120s. Cache is per-sha256 so re-runs are free. Capped by `OCR_RETRY_MAX_DOCS_PER_RUN`. |
| cost | One extra LLM gate call per rejected doc. At `gpt-4o-mini` temp 0.0 with a ~10-page preview: ~$0.001. |
| blast radius | Additive. Existing text-layer path, existing escalation path, existing reject bundle — all preserved. New code reads `mode` and dispatches. |
| false positives | Regex/LLM may trigger OCR retry on docs that are legitimately not English (Arabic doctrine, when it ships). Cost guard: the retry's own gate call still rejects non-doctrine, so the worst case is an extra OCR pass + an extra gate call. |
| determinism | Tesseract output is deterministic for a fixed binary + fixed glyphs. Cache stays correct. |
| failure modes not covered | Encrypted PDFs (different error class — LibreOffice normalization already rejects). Corrupt-at-byte-level PDFs (Docling raises, current exception path handles). Right-to-left languages where Tesseract lacks lang packs (future; add `lang=["eng","ara"]` when Arabic doctrine ships). |

### 3.5 Alternatives considered and rejected

- **Blanket de-ROT post-processor.** §1.3 — per-span mixing makes it
  unsafe.
- **Always force-OCR every PDF.** Kills the speed advantage of the
  text-layer path (which is ~10× faster when the CMap is clean). ~99%
  of our corpus has clean CMaps.
- **Swap ADP 2-0 source file and forget about it.** Solves the one doc,
  but leaves every future corrupt-CMap PDF broken. Good as an *also* —
  swap the source AND ship the fallback.
- **Custom-encoding detector that learns per-font shift offsets.** Too
  much code for the failure frequency. Tesseract is simpler and covers
  more failure modes.

### 3.6 Out of scope for this plan

- The existing page-level OCR escalation in `convert_document`
  (untouched — it keeps working exactly as today for the docs that
  pass the gate).
- The missing-manual elision in `retrieval_group.py` (untouched — it
  remains the last-resort safety net).
- A "fix the text extractor" approach (rewrite glyph-mapping) — not
  worth it; OCR via Tesseract is the standard industry fallback for
  broken-CMap PDFs.

---

## 4 · Minimal rollout

1. Extract the two converter constructors in `convert_document.py` into
   `graph/docling_converters.py` (pure refactor, behaviour-preserving).
2. Add `mode` parameter to `initialpages_convert`.
3. Add remark-classifier + retry loop to `check_documents`.
4. Backfill the bundle schema under `output/not_enough/`.
5. Re-run ingest on `inputs/doctrine/` with `FORCE_REPARSE=1`. Expect
   ADP 2-0 to accept on the second pass and land in Qdrant. Re-run
   both smokes (`bash scripts/smoke_step1.sh smoke-json smoke-prompt`).
6. Update `docs/memory.md` + `docs/walkthrough.md` + `docs/phase3_handoff_notes.md`
   with the new two-pass gate.

Estimated work: ~200 LOC + ~60 LOC of tests + doc updates. Single
session.

---

## 5 · Open questions for second-opinion review

1. **Gate classifier:** regex on the remark, or a dedicated tiny LLM
   call? Regex is free and deterministic; LLM is more robust to prompt
   drift. My instinct is regex with a short allow-list (`garbled |
   corrupt | unreadable | encoded | cipher | nonsense | gibberish`)
   plus a fall-through to "always retry if reject + document had
   ≥50% non-ASCII-letter chars in preview."
2. **Where the retry loop lives:** inside `check_documents` (keeps node
   boundary clean) or as a new 1.5th node between 1 and 2 (clearer
   graph topology, costs an extra state field). Leaning inside — it's
   a <10-line retry, not a new phase.
3. **Failure budget:** `OCR_RETRY_MAX_DOCS_PER_RUN=5` is a guess.
   Should this be a per-folder budget or a global one? Per-folder
   fits the one-folder-one-collection model better.
4. **Arabic doctrine (future):** add `OCR_LANGS` env var now (default
   `"eng"`) to avoid a second refactor when the Arabic corpus ships?
5. **Do we keep the text-layer preview even when OCR wins?** My plan
   keeps both (`initial_pages.md` + `initial_pages_ocr.md`) for audit,
   but downstream only reads the OCR one if it landed. That costs
   disk (~50–200 KB per doc) but makes "why did the gate change its
   mind" debuggable.
