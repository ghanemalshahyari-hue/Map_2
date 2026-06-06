# 05 — OpenAI Embeddings (Dense Vectors)

> **STATUS: INACTIVE (historical reference only).** Dense embedder was swapped to `BAAI/bge-m3` (local, via FastEmbed) on 2026-04-17. See [`14_alternatives_dense_local.md`](14_alternatives_dense_local.md) for the active embedder. The `openai` package stays installed because the LLM used by `check_documents` (and future QA) still uses the OpenAI API.
>
> Library: `openai` (pinned in `memory.md`).
> Source: `libs/openai/` if we dumped it; otherwise via installed package.
> Upstream docs when online is acceptable: https://platform.openai.com/docs/guides/embeddings

---

## What we use it for

Producing **dense vectors** for every chunk. Dense vectors capture *semantic* meaning so retrieval can match paraphrases and concepts, not just exact tokens.

## Locked choice

**Model: `text-embedding-3-large`** — 3072-dim. Chosen for technical vocabulary quality (doctrine corpus). Cost per full corpus embed is ~$0.65, trivial.

Why not `text-embedding-3-small` (1536-dim, cheaper)?
- Similar price at our scale; quality difference on technical text is real.
- We can dimensionality-reduce `-large` output if we ever need smaller vectors (via `dimensions` parameter).

## Install

Already in venv:
```
pip install openai
```
Also pulled in by `langchain-openai` which we keep.

## Authentication

Reads `OPENAI_API_KEY` from the environment. `main.py` calls `load_dotenv()` first so `.env` is loaded before any graph import touches the client. See `CLAUDE.md` design rule #3.

## The minimal API we commit to

### Simple single-text embed
```python
from openai import OpenAI

client = OpenAI()   # reads OPENAI_API_KEY from env
response = client.embeddings.create(
    model="text-embedding-3-large",
    input="Chapter 3 — The Operations Process\n\n3-12. ...",
)
vec = response.data[0].embedding   # list[float] length 3072
```

### Batched embed (what we actually do)
```python
BATCH_SIZE = 100   # OpenAI allows up to 2048, but 100 keeps requests quick

def embed_chunks_batched(texts: list[str]) -> list[list[float]]:
    out = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        resp = client.embeddings.create(
            model="text-embedding-3-large",
            input=batch,
        )
        out.extend(item.embedding for item in resp.data)
    return out
```

### With explicit dimension (if you want smaller vectors)
```python
resp = client.embeddings.create(
    model="text-embedding-3-large",
    input=texts,
    dimensions=1024,   # force to 1024-dim
)
```
**We don't use this by default.** Full 3072 at OpenAI pricing is negligible. Only reach for this if we later quantise in Qdrant or ship smaller artefacts.

## Instantiation rule (inherited from existing project)

**Do NOT create `OpenAI()` at module level in `nodes.py`.** It reads the env on construction; if created at import time, `load_dotenv()` in `main.py` hasn't run yet. Use the `_get_client()` pattern:
```python
_client = None
def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client
```

## Limits and batching

| Limit | Value |
|---|---|
| Max input tokens per item | 8191 |
| Max items per request | 2048 |
| Our chunk size | ~512 tokens (set in HybridChunker) |
| Our batch size | 100 |
| Our typical request size | 100 × 512 = 51.2k tokens |

At 2048 inputs × 8191 tokens each, the API request ceiling is ~16.8M tokens. Nowhere close. Batching at 100 is about request latency, not hitting limits.

## Cost math (for calibration)

Pricing (pinned — if it changes, update here):
- `text-embedding-3-large`: $0.13 per 1M input tokens

| Corpus | Est. tokens | Cost |
|---|---|---|
| Your 7 `test_data` folders | ~15k | ~$0.002 |
| One doctrine PDF (e.g. ADP-3-0) | ~250k | ~$0.033 |
| Full 21-doc doctrine corpus | ~5M | ~$0.65 |

Re-embedding on every config change is fine. Don't over-optimise.

## What text to embed

**Use HybridChunker's `contextualize()` output, not raw `chunk.text`.** Reason: the chunk text alone can be ambiguous ("The unit deploys forward..." — which unit?). Contextualised text prefixes the heading path so the embedding captures the section context.

```python
text_for_embedding = chunker.contextualize(chunk=c)   # heading path + body
dense = embed([text_for_embedding])[0]

# But store raw text in payload for display:
payload["text"] = c.text
```

## Error handling

Common failures:
- `RateLimitError` — backoff + retry. Use `tenacity` if we see this in practice (not expected at our scale).
- `AuthenticationError` — bad / missing API key. Check `.env` loaded before client construction.
- `BadRequestError` — usually oversized input (token overflow). HybridChunker sizing prevents this.
- Network errors — retry once; if persistent, flag the batch in `embed_errors`.

Per our Q5 lock: errors are captured per doc/batch with full traceback, pipeline continues.

## Inspection

Dense vectors are opaque 3072-float arrays. To verify behaviour:
- **Norm**: `numpy.linalg.norm(vec)` — should be close to 1.0 (OpenAI normalises by default).
- **Cosine sanity check**: embed two paraphrases of the same fact → cosine should be > 0.9.
- Qdrant dashboard shows the full array per point; useful for spot-checks.

Debug script (build later): `scripts/dense_sanity.py` — embeds "Chapter 1 intro" from two different docs in the same corpus, prints cosine similarity.

## Known gotchas

- **Cost confusion**: `-large` is ~6× pricier than `-small` per token but still cheap overall. Don't pre-optimise to `-small` unless you hit a scale we haven't imagined.
- **Unicode normalisation**: chunks with weird whitespace / BOMs produce subtly different vectors. Docling cleans this up; don't add your own normalisation layer.
- **Truncation silent**: if a chunk somehow exceeds 8191 tokens, OpenAI truncates silently. Should not happen with HybridChunker's 512-token target, but worth a guard.
- **Empty string input crashes**. Filter out zero-length chunks before sending.

## Source pointers

- `libs/openai/openai/resources/embeddings.py` — the `.create()` method
- Python SDK repo: https://github.com/openai/openai-python (accept when online)
