# 09 — Doctrine Post-Processors

> Doctrine-specific transformations applied to HybridChunker's output before
> embedding + upsert. **Not implemented yet** — this doc specifies what they
> should do when we build them. Each processor is a plain Python function
> that takes a list of chunks and returns a new list.

---

## Why these exist

HybridChunker is topic-agnostic. Military doctrine has specific patterns that benefit from targeted handling:

- Glossary sections that need splitting, not summarising
- Paragraph numbers that are primary citation units
- Acronyms that need expansion for retrieval
- Classification markings that need stripping
- Cross-document references that are load-bearing

Each post-processor runs **after** HybridChunker, **before** embedding.

## The pipeline

```
DoclingDocument
    │
    ▼
HybridChunker  ──►  list[DocChunk]
    │
    ▼
post_processors.glossary_splitter
    │
    ▼
post_processors.paragraph_number_extractor
    │
    ▼
post_processors.acronym_expander
    │
    ▼
post_processors.classification_stripper
    │
    ▼
post_processors.cross_ref_extractor
    │
    ▼
list[EnrichedChunk]  ──►  embed  ──►  upsert
```

Each step either: (a) modifies a chunk's metadata, (b) strips text, or (c) splits one chunk into many.

## 1. Glossary splitter

**Problem**: A doctrine appendix often contains a glossary like:
```
C2 — command and control
COA — course of action
METT-TC — mission, enemy, terrain and weather, troops and support available, time available, civil considerations
```
HybridChunker may emit the whole glossary as one chunk, destroying its searchability.

**Solution**: detect glossary-shaped chunks and split into one chunk per definition.

**Detection heuristic** (refine during implementation):
- Section heading contains `glossary`, `acronyms`, `abbreviations` (case-insensitive)
- Body has multiple lines matching `^\s*[A-Z][A-Z0-9\s&/-]+\s*[—–-]\s+.+$`

**Output**: each definition becomes its own chunk with:
- `text`: just that definition line
- `chunk_type`: `"glossary_entry"`
- Inherits parent chunk's `heading_path`, `source_doc`, `page_numbers`
- `chunk_index`: suffix-extended (e.g. `42a`, `42b`) to preserve ordering

## 2. Paragraph number extractor

**Problem**: Doctrine paragraphs have numeric IDs (`3-12`, `3-12-a`) that are the primary citation unit. Users cite "paragraph 3-12 of ADP 3-0", not a page.

**Solution**: regex-scan each chunk's text for the first paragraph number marker, attach to payload.

**Regex** (refine):
```python
PARA_NUM = re.compile(r"^\s*(\d+[-–]\d+(?:[-–][a-z])?)\s*[.\s]", re.MULTILINE)
```
Matches: `3-12`, `3-12-a`, `3-12. ` at line start.

**Output metadata**:
```python
chunk.metadata["paragraph_number"] = "3-12"   # or None if not found
chunk.metadata["paragraph_numbers"] = ["3-12", "3-13"]   # if multiple in one chunk
```

## 3. Acronym expander

**Problem**: Dense embeddings under-weight acronyms. A query "course of action" should match chunks that only use "COA".

**Solution**: build a sidecar acronym table from the doc's glossary. At chunk-processing time, append expansions to a hidden field that gets indexed by the sparse encoder (and optionally embedded).

**Build phase** (once per doc):
- Find glossary entries (output of processor #1)
- Build `{acronym: expansion}` dict
- Save as sidecar: `output/acronyms/<source_doc>.json`

**Apply phase** (per chunk):
- Scan chunk text for known acronyms
- Append expansions to `chunk.metadata["expansion_hints"]` (string concat for sparse indexing)
- Do NOT modify `chunk.text` shown to humans — keep the raw text intact

**Indexing**:
- Sparse vector: encode `chunk.text + " " + expansion_hints` so BM25 picks up both forms
- Dense vector: optional — if enabled, contextualised text becomes `heading_path + body + expansion_hints`

## 4. Classification stripper

**Problem**: Classification markings (`UNCLASSIFIED`, `FOR OFFICIAL USE ONLY`, `U//FOUO`) sometimes appear in body text, adding noise to both dense and sparse retrieval.

**Solution**: regex-strip known markings from chunk text.

**Pattern**:
```python
CLASSIFICATION_RE = re.compile(
    r"\b(?:UNCLASSIFIED|CONFIDENTIAL|SECRET|FOR OFFICIAL USE ONLY|U//FOUO|FOUO)\b",
    re.IGNORECASE,
)
```
Replace with empty string. Preserve chunk if text still non-empty after strip; drop chunk if it becomes empty.

Docling's layout model usually classifies these as header/footer and excludes them, but this is the belt-and-braces guarantee.

## 5. Cross-reference extractor

**Problem**: Doctrine constantly cites other doctrine (`see ADP 5-0, Chapter 2`). For multi-doc retrieval later, these references are valuable metadata.

**Solution**: regex-scan chunks for references, attach to payload.

**Regex**:
```python
XREF_RE = re.compile(r"\b(ADP|ADRP|FM|JP|ATP|AJP)\s?\d+(?:-\d+)*\b")
```

**Output metadata**:
```python
chunk.metadata["cross_refs"] = ["ADP 5-0", "FM 3-0", "JP 3-13"]
```

Payload filter at query time can then find "chunks that reference ADP 5-0".

## Dependencies between processors

- #3 (acronym expander) depends on #1 (glossary splitter) having run first — acronym table comes from glossary entries.
- Others are independent, can run in any order.

## Error handling

Post-processors are pure functions. Each wrapped in try/except at the ingestion node level:
- Failure in one processor → logged to `ingestion_errors`, chunk passes through untouched.
- No processor failure should halt the pipeline. They're enrichment, not validation.

## Testing

Each processor has a unit test (to be written) with:
- A synthetic input chunk demonstrating the expected pattern
- Expected output (exact text + metadata)

Lives in `tests/test_post_processors.py` (not yet created).

## When to build these

Post-processors target the *doctrine* corpus. On generic non-doctrine
folders all five are safe no-ops (glossary splitter + acronym expander
are active only when a glossary is detected).

The build order was:
1. Classification stripper (trivial, high payoff when doctrine enters)
2. Paragraph number extractor (needed for citations)
3. Cross-ref extractor (needed for multi-doc retrieval)
4. Glossary splitter (valuable for technical queries)
5. Acronym expander (dependent on #4, biggest quality lever for doctrine)
