# RMOOZ Document Ingestion Pipeline — Design (DOC-INGEST-A)

> **Status: DESIGN ONLY. No code in this slice.** Defines how RMOOZ turns an arbitrary uploaded
> document (JSON, Excel, DOCX, digital PDF, scanned PDF, image) into the structured inputs the rest
> of the pipeline already consumes — the **Operational Brief**, the **Planning Model**, and the
> **Review UI** — with an honest confidence/warnings envelope on every extraction.
>
> Composes with the locked global rule: **AI/extraction suggests → RMOOZ validates → commander
> reviews → … →** state changes are journaled. Extraction is a *read* step; it never writes final
> scenario state. Every extracted item stays `needs_review:true` until a commander approves it.

---

## 1. Goals & non-goals

**Goal:** one router that accepts any supported document, picks the **cheapest reliable** extractor,
and emits a normalized payload + an extraction envelope (§5) that downstream code already understands.

**Hard rules (this design honors all of them):**

- **Direct structured formats first.** JSON, XLSX, DOCX are parsed directly — never OCR'd.
- **OCR is NOT in the live path yet.** It is a designed, gated escalation (§4) — disabled by default.
- **OCR only when text extraction fails** (a digital PDF/text path returns empty/garbage), never as
  the first choice.
- **Offline-first.** Every default path runs with no network and no new npm/python runtime deps where
  an existing dependency-free reader already exists (`xlsx-text.js`, `docx-text.js`). Heavier backends
  (Docling, OCR) are **optional adapters**, absent by default; their absence degrades gracefully.
- **Docling is an optional adapter** for digital-PDF layout/table extraction — not required.
- **PaddleOCR / Tesseract are optional local OCR backends** — chosen only on the scanned/image path,
  only when enabled.
- **Cloud OCR (e.g. Azure Document Intelligence) is an optional FUTURE online mode only** — never the
  default, never offline, explicit operator opt-in, and it must respect the no-hardcoded-endpoint
  rule (operator-set in `.env.offline`/config, never in repo/image — see
  `[[project_scenario_autogen_and_litellm_endpoint]]`).

**Non-goals (this slice):** implementing OCR, implementing Docling wiring, adding SheetJS, building
the router code. This is the design those slices implement against.

---

## 2. Pipeline overview

```
upload ──▶ format detect (magic bytes + extension)
            │
            ├─ JSON / JSONC ───────────▶ [1] direct parser ───────────────┐
            ├─ XLSX ───────────────────▶ [2] xlsx reader ─────────────────┤
            ├─ DOCX ───────────────────▶ [3] docx-text.js ────────────────┤
            ├─ PDF (digital text) ─────▶ [4] PDF/Docling text+tables ─────┤
            └─ PDF (scanned) / image ──▶ [5] OCR backend (gated, opt-in) ─┤
                                                                          ▼
                                              normalized text/records + extraction envelope (§5)
                                                                          │
                                                                          ▼
                                   [6] → Operational Brief · Planning Model · Review UI
```

Format detection is by **magic bytes first**, extension second (a `.json` that is really a ZIP, or a
`.pdf` that is image-only, is classified by content). The "PDF digital vs scanned" decision is made
*after* a cheap text-extraction probe (§4), not from the extension.

---

## 3. Per-format adapters

| # | Input | Adapter | Status today | Notes |
|---|---|---|---|---|
| 1 | **JSON / JSONC** | direct parser (`server/ai/jsonc.js` → `JSON`/JSONC) | ✅ exists | Step 1 coalition JSON, RMOOZ scenario, MDMP-external, Operational Brief all flow through `operational-brief.classifyJsonInput` already. No OCR, no heuristics — structured in, structured out. |
| 2 | **XLSX** | dependency-free reader (`server/ai/xlsx-text.js`) | ✅ exists | Node `zlib` over the ZIP parts (`workbook.xml`, `sharedStrings.xml`, sheets). `multi-country-orbat.parseCountrySheets` consumes the sheet rows. **SheetJS only if explicitly approved** — the dependency-free reader is the default; SheetJS would be an optional adapter for complex workbooks (merged cells, styled tables), never required offline. |
| 3 | **DOCX** | `server/ai/docx-text.js` | ✅ exists | Dependency-free `word/document.xml` text via `zlib`. Feeds the classifier + side-segmenter. |
| 4 | **PDF (digital)** | PDF text + tables — **Docling optional adapter** | 🔵 design | First try a lightweight embedded-text probe; if it yields real text, parse directly. Docling (optional) adds **layout + table** structure (`tables_detected`) when present; its absence degrades to plain text + `layout_confidence:"low"`. No network. |
| 5 | **Scanned PDF / image** | OCR backend — **PaddleOCR / Tesseract optional, gated** | 🔵 design, OFF by default | Reached **only** when the text probe (§4) finds no usable text. Local backend chosen by config; if no backend is installed, return a structured `ocr_unavailable` result (not a crash) and `needs_review:true`. Azure Document Intelligence is a **future online** option, opt-in only. |
| 6 | **Extracted output** | normalize → Operational Brief / Planning Model / Review UI | ✅ exists | The Brief assembler (`operational-brief.js`), the coalition builder (`multi-country-orbat.js`), and the Planning Model (`planning-model.js`) already accept normalized records; this pipeline feeds them, never bypasses their validation. |

---

## 4. OCR escalation policy (gated, not live)

OCR is the **last resort**, decided per document, never globally:

```
probe digital text (cheap, offline)
   ├─ usable text found  → use it (extraction_method = pdf_text | docling, ocr_used = false)
   └─ no usable text     → IF ocr_enabled AND a backend is present:
                              run OCR (extraction_method = ocr_<backend>, ocr_used = true,
                                       extraction_confidence ≤ medium, needs_review = true)
                           ELSE:
                              return ocr_unavailable + needs_review = true + a missing_information
                              entry ("scanned document — enable OCR backend to extract")
```

- **Default state: `ocr_enabled = false`.** The live path never silently OCRs. Enabling OCR is an
  explicit config/operator action.
- "Usable text" = above a small character/word threshold and not mojibake — a deterministic check, no
  model.
- OCR output is **always** lower-confidence and `needs_review:true`; it never overrides a successful
  direct/text extraction.
- Backend selection order (when enabled): local PaddleOCR → local Tesseract → (future, online,
  opt-in) Azure Document Intelligence. Missing backend ⇒ graceful `ocr_unavailable`, not an error.

---

## 5. Extraction envelope (on every result)

Every adapter returns its payload wrapped in a uniform envelope so downstream code and the Review UI
can show honesty, not just content:

```jsonc
{
  "extraction_method":     "json | jsonc | xlsx_reader | docx_text | pdf_text | docling | ocr_paddle | ocr_tesseract | ocr_azure",
  "extraction_confidence": "high | medium | low",   // direct structured = high; OCR ≤ medium
  "layout_confidence":     "high | medium | low | n/a", // table/section structure fidelity (n/a for flat JSON)
  "ocr_used":              false,                    // true only on the scanned/image path
  "tables_detected":       0,                        // count (Docling/parser); 0 when none/unknown
  "needs_review":          true,                     // ALWAYS true for anything non-trivially derived
  "missing_information":   [],                       // human-readable gaps ("scanned — OCR disabled", "no coordinates", …)
  "warnings":              [],                       // e.g. "mojibake_suspected", "ocr_unavailable", "partial_tables"
  "source":                { "filename": "", "bytes": 0, "sha256": "", "detected_format": "" },
  "payload":               { /* normalized text / records / sheet rows / brief fields */ }
}
```

Rules:
- `extraction_confidence:"high"` is reserved for **direct structured** parses (JSON/XLSX/DOCX text).
- Anything OCR-derived is `ocr_used:true`, `extraction_confidence` ≤ `medium`, `needs_review:true`.
- `missing_information` is never hidden and never silently filled — it surfaces in the Review UI.
- A failed/empty extraction returns the envelope with an explanatory `warnings`/`missing_information`
  entry — **never a crash, never invented content** (mirrors `docx-text`/`xlsx-text` "return empty,
  never throw").

---

## 6. Output targets (step 6)

The normalized `payload` is routed exactly as the structured-JSON path is today — it does not get a
new generation path:

- **Operational Brief** — `operational-brief.js` (`analyzeDocuments` / `classifyJsonInput` /
  `buildBriefFromMultiCountry`). Side separation, dedupe, coalition detection unchanged.
- **Planning Model** — `planning-model.js` (`fromOperationalBrief` / source taxonomy L13). Each item
  keeps `source_type` + `needs_review` + `confidence` from the envelope.
- **Review UI** — `doc-understanding-review.js` shows the AI-Understanding payload + the envelope's
  confidence/warnings/missing_information so the commander reviews before any generation.

The global rule holds: **no generation from raw chunks or raw OCR text** — extraction feeds the Brief,
the commander reviews, RMOOZ validates, then RMOOZ generates.

---

## 7. Offline / online modes

| Mode | Adapters active | Network |
|---|---|---|
| **Offline (default)** | JSON, XLSX (dep-free), DOCX, PDF-text, Docling (if bundled), local OCR (if enabled + installed) | none |
| **Online (future, opt-in)** | + cloud OCR (Azure Document Intelligence) / hosted layout models | operator-configured endpoint only (`.env.offline`/config), never in repo/image |

The offline clean-image gate (`test-offline-image-*`) must stay green: optional heavy backends
(Docling, PaddleOCR, Tesseract) are **not** baked into the default image; their adapters detect
absence and degrade.

---

## 8. Build order (future slices, each gated)

1. **DOC-INGEST-B** — format router + the extraction envelope over the three existing direct adapters
   (JSON/XLSX/DOCX). No PDF, no OCR. Pure wiring + tests.
2. **DOC-INGEST-C** — digital-PDF text probe + (optional) Docling adapter; `tables_detected` /
   `layout_confidence`. Offline, no OCR.
3. **DOC-INGEST-D** — gated local OCR backend (PaddleOCR/Tesseract) on the scanned/image path; OFF by
   default; graceful `ocr_unavailable`.
4. **DOC-INGEST-E (future, online)** — optional cloud OCR mode, explicit opt-in, no hardcoded endpoint.

---

## 9. Acceptance (for the implementing slices)

- A JSON/JSONC, XLSX, and DOCX input each extract with **no network, no OCR**, `extraction_method`
  set, `extraction_confidence:"high"`, `ocr_used:false`.
- A scanned PDF / image with OCR **disabled** returns `ocr_unavailable` + `needs_review:true` + a
  `missing_information` entry — **never crashes, never invents text**.
- Every result carries the full §5 envelope; the Review UI renders confidence + warnings +
  missing_information.
- The offline image builds and runs with **none** of the optional heavy backends present.
- No extraction path writes final scenario units, tasking, COA, or world-state — output stops at the
  Brief/Planning-Model/Review surfaces.
