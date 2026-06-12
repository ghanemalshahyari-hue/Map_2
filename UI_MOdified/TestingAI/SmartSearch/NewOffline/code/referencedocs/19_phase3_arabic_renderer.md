# 19 — Phase 3 Arabic `.docx` Renderer — Port Guide

> **Status.** SCOPED (pre-code) as of 2026-04-22. Companion doc to
> [`18_phase3_generation.md`](18_phase3_generation.md) §9 and §16 D2.
>
> **Purpose of this doc.** The user's old generator
> (`/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt`,
> 1,815 lines) contains hard-won Arabic typography primitives that
> must be preserved exactly. Prior simplification attempts broke
> formatting. This doc enumerates which primitives port verbatim,
> which are dropped, and where they land in the new module layout.
>
> Locked directive (user Q2, 2026-04-22): **"yes the old code
> formatting must be kept as is. do not edit, simplify or change
> anything since we faced issues before changing things."** That
> applies to *behaviour* — cosmetic tidying (lint, imports,
> docstrings, removing unused `AttributeHolder`) is allowed where
> it does not change rendered output. Anything that changes what
> Word sees is **not** allowed.

---

## 1. What the old renderer produces

Four A4 Arabic `.docx` files, heavy RTL / complex-script formatting:

- **Page setup.** A4 (21 cm × 29.7 cm), 2.5 cm margins, one body column.
- **Font.** Arial 14 pt (complex-script size locked to 14 pt via
  `rPr/sz/szCs` overrides so Word's CS-font engine respects it).
- **Line spacing.** Exact 0.75 cm (non-multiple, so Arabic glyph
  ascenders don't cause auto-expansion).
- **Tabs.** Fixed at 1.5 cm per indent level; indent-per-level is
  `tab_size × level_count`.
- **Bidi.** Every paragraph gets a forced `w:bidi` element in its
  `pPr` in addition to the `paragraph_format.right_to_left = True`
  python-docx flag — belt-and-suspenders, because python-docx alone
  occasionally drops the bidi marker.
- **Complex-script run properties.** Every run receives
  `w:rFonts` with `ascii`, `hAnsi`, `cs` all set to `Arial`; `w:lang`
  with `w:bidi="ar-SA"`; `cs_size` equal to the Latin size.
- **Arabic numbering system (load-bearing).** Five levels of nested
  Arabic-script ordinals:

  | Level | Prefix shape | Example sequence |
  |---|---|---|
  | 1 | decimal digit + `.` | `1.`, `2.`, `3.` … |
  | 2 | Arabic letter + `.` | `أ.`, `ب.`, `جـ.`, `د.`, `هـ.`, `و.`, `ز.`, `حـ.`, `ط.` … (28-letter cycle) |
  | 3 | parenthesized digit | `(1)`, `(2)`, `(3)` … |
  | 4 | parenthesized Arabic letter | `(أ)`, `(ب)`, `(جـ)` … |
  | 5 | doubled parenthesized letter | `(أ أ)`, `(ب ب)`, `(جـ جـ)` … |

  Two bespoke letter cycles exist alongside the base 28-letter one:
  `ARABIC_LETTERS_ML` (the first 12) used for appendix sub-lists and
  `ARABIC_LETTERS_SHFAF` (letters 13–28) used for overlay sub-lists.
  Both must be preserved byte-for-byte — they encode which letters
  appear in which doctrine section.

- **Tables.** RTL tables with forced `w:bidiVisual`, shaded header
  row (`DDEBF7` light-blue), centered cells, table indent of 1.5 cm
  from the right margin, optional custom column widths.
- **Kashida header stretcher.** The first header row targets ~8 cm
  rendered width. If the raw text is shorter, kashida glyphs (`ـ`)
  are inserted one at a time at Arabic-letter boundaries until the
  rendered width (PIL `ImageFont.getlength`) exceeds the target. The
  selection logic excludes letters that cannot carry kashida
  (`اأإآدذرزوىؤء` and terminators like `ء`). Preserve exactly.
- **Hijri / Gregorian dual-date line.** `format_hijri_date` uses a
  simple Julian-day conversion with month-name Arabicization; an
  `~0.03-day-per-year` drift is acknowledged and acceptable for
  display (never for operational time math).

---

## 2. Target module: `graph/generation/renderers/arabic_docx.py`

All primitives below land in this one module. Keep it procedural —
the old code is procedural and mixing classes in would require
testing paths that already work.

Module preamble (non-negotiable):

```python
"""
graph/generation/renderers/arabic_docx.py

Arabic .docx renderer for Phase 3. Ported from the user's prior
generator. Behaviour-preserving: constants, margins, kashida logic,
bidi handling, numbering cycles, and table styling match the old
code's rendered output byte-for-byte. Do NOT simplify. Prior
simplification attempts broke formatting (see
referencedocs/19_phase3_arabic_renderer.md §1).
"""
```

---

## 3. Port matrix — what moves where

### 3.1 KEEP (verbatim behaviour, minimal cosmetic cleanup)

| Old symbol | New location | Notes |
|---|---|---|
| `MARGIN_CM`, `LINE_SPACING_CM`, `TAB_SIZE_CM`, `FONT_NAME`, `FONT_SIZE_PT`, `A4_WIDTH`, `A4_HEIGHT` | `arabic_docx.py` module constants | Keep values exactly |
| `ARABIC_LETTERS`, `ARABIC_LETTERS_ML`, `ARABIC_LETTERS_SHFAF` | module constants | Preserve ordering |
| `get_arabic_letter`, `get_arabic_letter_ML`, `get_arabic_letter_SHFAF` | module functions | Index-based, 1-offset |
| `normalize_text`, `add_full_stop` | module functions | Small string utils |
| `fix_cs_formatting_run` | module function | **Critical** — complex-script run properties; do not "simplify" |
| `force_rtl_paragraph` | module function | **Critical** — bidi marker belt-and-suspenders |
| `add_paragraph`, `correct_indentation`, `append_to_paragraph` | module functions | Core body paragraph primitives |
| `add_level_one`…`add_level_five` | module functions | Arabic-letter numbering cycle |
| `add_level_one_ML`, `add_level_one_SHFAF` | module functions | Annex / overlay number cycles |
| `SPLITTER` | module function | Text-with-embedded-numbering → nested levels |
| `add_table` | module function | RTL, shaded header, autofit or custom widths |
| `add_arabic_header` (including the PIL-based kashida stretcher, `calculate_kashida`, `stretch_first_line`, `rendered_width_px`, `_is_arabic_letter`) | module function + nested helpers | Kashida target width + exclusion set preserved |
| `format_hijri_date`, `format_gregorian_date`, `gregorian_to_hijri`, `_gregorian_to_julian_day`, `_julian_day_to_hijri`, `get_today_dates_arabic` | module functions | Display-only; acknowledged drift |
| `configure_document`, `configure_last_page_section` | module functions | Page setup |
| `reset_lower_counters` + the `LEVEL_COUNTERS` dict | **Instance on `ArabicDocumentContext`**, NOT a module-level global (see §4) | Behaviour preserved; scope changed |

### 3.2 DISCARD (dead, broken, or replaced by Phase 3 architecture)

| Old symbol | Reason |
|---|---|
| `AttributeHolder`, `ParsedFixed`, `parse_raw_text_fixed` | Python-attribute-access hack used by the old monolithic `generate_document`. Phase 3 dispatcher + pydantic assembler replace this entire path. |
| `cal()` (lines 174–208) | Brittle hand-rolled time math with day/hour modulo bugs. Replaced by `graph/generation/time_math.py` (pure, unit-tested). |
| `generate_document(data, data1, data2, data3)` (lines ~900–1625) | ~800-line monolith with broken `if data:` indentation and hard-coded per-document control flow. Replaced by `field_dispatcher.py` walking YAML templates. |
| The four `sample_data*` dicts in `__main__` | Hand-filled test data; the new equivalent is `data/phase3_inputs.example.json` + the dispatcher's kind resolution. |
| Top-level module prints (`print("level1")`, etc.) | Debug noise. |
| Module-level `LEVEL_COUNTERS` global mutation | Replaced by per-document `ArabicDocumentContext` (see §4). |

### 3.3 CLEAN UP (cosmetic only — behaviour identical)

| Concern | Action |
|---|---|
| `from docx.enum.text import WD_ALIGN_PARAGRAPH` appears twice (lines 11 and 15) | Remove the duplicate import |
| Broad `except Exception: pass` blocks (table shading, bidiVisual) | Keep the `try` — python-docx OOXML paths can raise — but narrow to `except (KeyError, AttributeError, ValueError):` where possible; leave a comment noting the OOXML failure modes |
| `try: from docx import Document ... except ImportError: print(...); exit(1)` | Replace with a proper `ImportError` re-raise at the first call site; module-level `exit(1)` is hostile to test harnesses |
| Missing type hints on the port targets | Add them; the old code already has some, just inconsistent |

**What "behaviour-identical" means for this section.** The Word
binary produced by `doc.save()` may differ byte-for-byte because
python-docx ordering of XML elements isn't deterministic, but the
**rendered output** (opened in Word or LibreOffice) must match.
Spot-check M2 by diffing rendered pages visually between the old
code's output and the new renderer's output on the same input.

---

## 4. Scope change: `LEVEL_COUNTERS` → `ArabicDocumentContext`

The **only** non-cosmetic design change. Rationale: the old code
mutates a module-level `LEVEL_COUNTERS` dict across four documents
in a single process. This is a cross-document contamination risk —
generating Doc 2 after Doc 1 inherits Doc 1's counters unless the
caller manually calls `reset_lower_counters(1)`. In Phase 3, any of
the four documents can be regenerated independently, in any order,
possibly in parallel.

**Replacement.** Introduce a small dataclass:

```python
@dataclass
class ArabicDocumentContext:
    document: Document                   # python-docx Document
    counters: dict[str, int]             # per-instance level counters
    # optional: per-doc overrides for font/margins/tabs
```

`add_level_*` functions take `ctx: ArabicDocumentContext` instead
of `document: Document`. The ten constants move inside
`ArabicDocumentContext.__post_init__` as the initial counter values.
`reset_lower_counters` operates on `ctx.counters`.

**This is a pure refactor** — the behaviour of any single document's
rendering is identical to the old code, because `reset_lower_counters`
was already called at the top of each document in `generate_document`.
Moving the state off module-level eliminates the cross-document leak
without touching any rendering path.

**If this feels like "changing things" per the user directive:** the
rendered output of any single call sequence is provably identical
because the counters start at the same values and update with the
same rules. The difference is isolation, not behaviour. Flag this
to the user during M2 if they want to keep the global instead —
it is a cheap revert.

---

## 5. Where the renderer gets driven from

The renderer does **not** know about Pydantic schemas, YAML templates,
retrieval, or the LLM. It receives two things from
`graph/generation/assembler.py`:

1. A `GeneratedDocument` pydantic instance — all fields already
   resolved (`static` literals applied, `computed` math done, `input`
   values plugged in, `derived` refs resolved, `retrieved` drafts
   verified).
2. The document's format spec — a small dict loaded from the YAML
   declaring per-section heading text, indent level, citation flag,
   and whether to use `SPLITTER` (for pre-numbered text fields) or
   direct `append_to_paragraph`.

The renderer walks these two inputs once, emits the `.docx`, done.
No LLM calls, no retrieval, no Phase 2 imports.

---

## 6. Citation endnotes

Per §16 D7 of [`18_phase3_generation.md`](18_phase3_generation.md),
inline citations appear as `[source_doc §paragraph_number]` tags in
the retrieved field text. The renderer collects every such tag in
document order, emits an endnote section at the end of the
document titled **الاستشهادات** (Citations), and each entry reads
`[N] <source_doc> — فقرة <paragraph_number>`.

Two renderer helpers support this:

- `CitationCollector` — walks `GeneratedDocument`, extracts tags,
  assigns sequential numbers, returns a list of `CitationEntry`.
- `render_citations_section(ctx, entries)` — appends the endnote
  section using `add_level_one` for the title and a level-2 Arabic
  list for each entry. Right-aligned, same Arial 14 pt, same line
  spacing.

This adds no dependency and no architecture surface — it's output
formatting.

---

## 7. Tests

Minimal set — all green before M2 is accepted:

- **Byte-stable table rendering.** Given a fixed `rows` list, the
  generated table XML (relevant nodes: `w:tbl`, `w:tr`, `w:tc`,
  `w:tblBorders`, `w:shd`) matches a checked-in fixture.
- **Kashida width target.** Given a known short header string, the
  emitted first-line run text length is within ±2 characters of the
  old code's output on the same input.
- **Hijri drift bound.** For a curated set of 10 Gregorian dates
  spanning 2020–2030, `format_hijri_date` output matches the old
  code's output exactly (same algorithm ⇒ same result).
- **Level counter isolation.** Instantiate two
  `ArabicDocumentContext`s, interleave `add_level_one` calls, verify
  each counter progresses independently.
- **Round-trip open.** Every produced `.docx` opens without errors
  in `python -m docx path.docx` (python-docx's own parser) — canary
  for OOXML corruption.

No test exercises the LLM or `search()` — those are covered in M3
and later.

---

## 8. Font asset management

The old code imports `arial.ttf` at runtime via PIL
(`ImageFont.truetype(_ARIAL_TTF, px_size)`) for the kashida width
computation. On macOS this resolves via system fonts; on the Ubuntu
shadow deploy, ensure one of these is installed:

- `fonts-liberation` (Liberation Sans) — open, ships with Ubuntu
- `fonts-noto-sans` with Arabic subset — covers kashida
- `ttf-mscorefonts-installer` (EULA-gated) — actual Arial

The renderer **must** gracefully degrade if the font lookup fails:
the old code falls back to `ImageFont.load_default()`, which produces
imprecise kashida widths but does not crash. Preserve that fallback
path exactly.

A shadow row will be added to
[`docs/ubuntu_deploy_shadow.md`](../docs/ubuntu_deploy_shadow.md)
when Phase 3 lands.

---

## 9. Out of scope for this renderer

- PDF export — removed from v1 per §18 C1 of the scoping doc.
- TXT export — removed from v1 per §18 C1.
- HTML preview — not requested.
- Live-editing / re-rendering on input change — not v1.
- Accessibility metadata — the old code emits none; Phase 3 matches
  the old behaviour exactly.

---

## 10. Cross-references

- Scoping doc: [`18_phase3_generation.md`](18_phase3_generation.md).
- Template + field-kind spec:
  [`20_phase3_templates_and_kinds.md`](20_phase3_templates_and_kinds.md).
- Ubuntu shadow: [`../docs/ubuntu_deploy_shadow.md`](../docs/ubuntu_deploy_shadow.md)
  (Phase 3 font shadow row to be added at M1 time).
- Old code: `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt`
  (outside the repo — the user's transfer staging area, not
  version-controlled here).
