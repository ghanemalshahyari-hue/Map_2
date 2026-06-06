# 11 — Alternative Chunkers (Not Chosen)

> Active chunker: Docling HybridChunker (see `03_docling_hybrid_chunker.md`).
> This doc covers swap candidates.

---

## Chonkie

**What it is**: Purpose-built chunking library for RAG. Multiple strategies: Token, Sentence, Recursive, Semantic, SDPM (Semantic Double-Pass Merging), Late.

**Strengths**:
- Modern, actively developed.
- **SDPM** handles documents where related content appears in multiple places (useful when cross-section references matter).
- **Late chunking** preserves long-range context across a whole doc.
- Light dependency footprint.
- Plays well with any upstream parser.

**Weaknesses**:
- Takes plain text input — you lose Docling's structural metadata unless you re-attach it manually.
- No native table-atomic guarantee (would need post-processing).

**When to swap**:
- If retrieval quality is weak on cross-section queries and HybridChunker's section boundaries are the bottleneck.
- If you add a doc type that HybridChunker splits poorly.

**Install**: `pip install chonkie[semantic]`

**Entry point**:
```python
from chonkie import SemanticChunker
chunker = SemanticChunker(embedding_model="minishlab/potion-base-8M")
chunks = chunker.chunk(text)
```

**Integration cost**: medium. You parse with Docling → export to text → chunk with Chonkie → re-attach heading metadata manually (by tracking char offsets).

---

## LangChain Text Splitters

### `RecursiveCharacterTextSplitter`
Classic recursive split on separator hierarchy (`\n\n`, `\n`, ` `, char). Dumb but predictable.

**When**: baseline for plain text when you don't want ML.

### `MarkdownHeaderTextSplitter`
Splits on markdown headers, preserves header metadata per chunk.

**When**: if you convert Docling output to markdown first and want simple header-aware splits. Combines well with RecursiveCharacterTextSplitter inside each header section.

### `TokenTextSplitter`
Token-count splits without respect to structure.

**When**: never for us. Loses structure.

### `SemanticChunker` (langchain-experimental)
Embedding-based semantic splitting.

**When**: if you're already in the LangChain ecosystem and want a semantic pass. Marked experimental.

**Install**: `pip install langchain-text-splitters`

---

## LlamaIndex node parsers

### `SentenceSplitter`
Splits text on sentence boundaries with character-count targets. Solid baseline.

### `HierarchicalNodeParser`
Produces parent/child hierarchy — parent covers sections, children cover paragraphs. Designed for the "retrieve small, return big" pattern.

**When**: if you want true parent/child retrieval for long docs. This is the strongest reason to consider LlamaIndex — HybridChunker can approximate parent/child via `merge_peers` but LlamaIndex does it natively.

### `SemanticSplitterNodeParser`
Embedding-based semantic boundaries.

**Install**: `pip install llama-index-core llama-index-readers-file`

**Caveat**: pulls the LlamaIndex ecosystem. Some conceptual overlap with LangGraph. Keep isolated to the `chunk` node.

---

## semantic-text-splitter (Rust, via Python binding)

**What it is**: Rust-backed, tokenizer-aware character/token splitter.

**Strengths**:
- Fast (Rust).
- Exact tokenizer alignment.

**Weaknesses**:
- Not actually semantic despite the name — it just respects token boundaries.
- No structure awareness.

**When**: performance-critical pure-text chunking. Not our use case.

**Install**: `pip install semantic-text-splitter`

---

## Custom: "HybridChunker + Chonkie second pass"

A viable upgrade path without replacing HybridChunker:

1. HybridChunker produces structural chunks (section-aware, table-atomic).
2. For chunks that are large but topically diverse (detectable via embedding variance inside the chunk), split them further with Chonkie's `SemanticChunker`.

This gives you structural guarantees AND semantic refinement. Recommended if we ever hit quality issues on long sections.

---

## Decision tree (if swapping)

```
Is HybridChunker the bottleneck?
├── Section boundaries wrong → configure HybridChunker merge_peers / max_tokens first
├── Queries fail because related content is scattered → Chonkie SDPM
├── Queries fail because chunks are context-free → LlamaIndex hierarchical
├── Docs aren't Docling-parseable → LangChain splitters on raw text
└── Just need faster chunking → semantic-text-splitter
```

Remember: chunking is rarely the weakest link. Usually retrieval weakness comes from the sparse/dense encoder, the fusion strategy, or the query phrasing — not the chunker. Measure before swapping.
