# 03 — Docling HybridChunker

> Source of truth: `libs/docling-core/docling_core/transforms/chunker/hybrid_chunker.py`.
> If local source diverges from this doc, local wins — update here.

---

## What it is

`HybridChunker` is Docling's native chunker. Given a `DoclingDocument`, it emits a sequence of chunks where each chunk:
- has its text content
- is bounded by section hierarchy (does not cross `Section 3 → Section 4`)
- keeps tables atomic (a table becomes one chunk, never split mid-row)
- is sized to a target tokenizer window
- merges undersized neighbours (avoids one-line chunks)
- carries metadata: heading path, page numbers, source doc

## Why we chose it

- **Knows `DoclingDocument` natively** — zero adapter code.
- **Tokenizer-aware** — chunks come out exactly within your embedder's window.
- **Structure-preserving** — doctrine's numbered sections and tables survive as first-class.
- **Metadata comes free** — no custom code to attach heading paths, pages, cross-refs.

## When to NOT use it (swap triggers)

- Upstream parser isn't Docling → needs plain text chunker. See `11_alternatives_chunkers.md`.
- Need specific semantic/SDPM/late-chunking strategy → Chonkie.
- Need parent/child hierarchical chunks → HybridChunker can approximate via `merge_peers`; for true parent-child use LlamaIndex `HierarchicalNodeParser`.

## Install

Comes with `docling-core`, already installed with `pip install docling`.

## The minimal API we commit to

### Basic usage
```python
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker

chunker = HybridChunker()
chunks = list(chunker.chunk(doc))    # where doc is a DoclingDocument

for c in chunks:
    text = c.text                     # chunk content
    meta = c.meta                     # headings, page numbers, origin
```

### Tokenizer-aware configuration (what we use)
```python
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling_core.transforms.chunker.tokenizer.openai import OpenAITokenizer
import tiktoken

tokenizer = OpenAITokenizer(
    tokenizer=tiktoken.encoding_for_model("text-embedding-3-large"),
    max_tokens=8191,   # model context
)

chunker = HybridChunker(
    tokenizer=tokenizer,
    max_tokens=512,       # target chunk size — see "sizing" below
    merge_peers=True,     # merge undersized neighbouring chunks
)
```

### Extract serialised text with heading context
When embedding, you want chunks that carry their heading context so the embedding captures "this is under Chapter 3 → Plan" not just the paragraph. HybridChunker has a serialiser for this:

```python
for c in chunker.chunk(doc):
    text_for_embedding = chunker.contextualize(chunk=c)
    # text_for_embedding = "Chapter 3 — The Operations Process / 3-2 Plan\n\n<body text>"
```
Use `contextualize()` output for embedding; keep raw `c.text` for display / storage in payload.

## Sizing — what we picked

- **`max_tokens=512`** — middle-of-the-road. Fits OpenAI's 8K window 16× over, large enough to hold a coherent paragraph, small enough for precise retrieval.
- **`merge_peers=True`** — prevents 20-word orphan chunks from tiny paragraphs.
- We do NOT set `min_tokens` explicitly; merge_peers handles it.

Tune later with eval. For doctrine's numbered paragraphs (often short), 512 + merge works well.

## Output shape — `DocChunk`

```python
class DocChunk(BaseChunk):
    text: str                    # the chunk content
    meta: DocMeta
        headings: list[str]      # ["Chapter 3", "3-2 Plan"]
        captions: list[str]      # figure/table captions in chunk
        origin: DocItemGroup
            pages: list[int]     # page numbers the chunk spans
            bbox: ...            # bounding box (for provenance)
        doc_items: list[...]     # references back into the source DoclingDocument
```

We flatten this into our payload as:
```python
{
    "text": chunk.text,
    "heading_path": chunk.meta.headings,
    "page_numbers": [p for p in chunk.meta.origin.pages],
    "source_doc": <filename>,
    "source_folder": <folder name>,
    "chunk_index": <position in sequence>,
    "chunk_type": "body" | "table" | "figure_caption",
}
```

## Doctrine-specific post-processing (see also `09_doctrine_post_processors.md`)

HybridChunker's defaults work but need post-processors for doctrine-specific concerns:
- Glossary entries → split into one chunk per definition
- Paragraph numbers (`3-12`) → extract into `paragraph_number` field
- Acronyms → build sidecar index, attach expansions
- Classification markings → strip if they sneak through
- Cross-refs (`see ADP 5-0`) → extract into `cross_refs` list

All of these run **after** HybridChunker emits chunks, not instead of it.

## Expected chunk counts

Rough calibration for planning:
- 1-page doc: 2–5 chunks
- 30-page doc: 60–150 chunks
- 100-page ADP/FM: 200–600 chunks
- Full 21-doc doctrine corpus: 50k–100k chunks

## Known gotchas

- **`contextualize()` is not the same as `chunk.text`.** Store `text`, embed `contextualize()` output. Mixing them breaks retrieval citations.
- **Table-only chunks can exceed `max_tokens`.** HybridChunker won't split tables. If a table is 600 tokens and your max is 512, the chunk is 600. Plan for this downstream (OpenAI's 8K window absorbs it fine).
- **Images / figures may appear as near-empty chunks** with just a caption. Useful for retrieval ("see Figure 3-1") but noisy if you expect text volume.
- **`merge_peers` can sometimes cross section boundaries** in edge cases. Verify on a sample.

## Source pointers

- `libs/docling-core/docling_core/transforms/chunker/hybrid_chunker.py` — main class, logic
- `libs/docling-core/docling_core/transforms/chunker/base.py` — `BaseChunk` / `DocChunk`
- `libs/docling-core/docling_core/transforms/chunker/tokenizer/` — `OpenAITokenizer`, `HuggingFaceTokenizer`
