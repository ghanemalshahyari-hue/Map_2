# 17 — Phase 2 Retrieval Design

> **Status.** Design locked for Phase 2 v1. R1–R5 spikes executed
> 2026-04-21 (§11.1) — all passed. §7 reranker choice is locked:
> `BAAI/bge-reranker-v2-m3` via FastEmbed `TextCrossEncoder.add_custom_model()`
> pointing at `mogolloni/bge-reranker-v2-m3-onnx`. §10.5 shared-helper
> choice is locked: Option B — minimal additive extraction of
> `graph/shared/llm.py` and `graph/shared/embedders.py`, with
> narrow additive edits to `graph/nodes/check_documents.py` and
> `graph/nodes/embed_chunks.py` so they import from the shared
> module. R7 (glossary `acronyms.json` inspection) remains a
> lightweight pre-check to run at the top of the
> `graph/retrieval/glossary.py` implementation step.
>
> **Scope.** Ingested collections already exist (Phase 1). This doc
> specifies how to query them and how to test retrieval.
>
> Last updated: 2026-04-21 (design locked — §7 bge-reranker-v2-m3,
> §10.5 Option B; see §11.1 for R1–R5 spike evidence)

---

## 1. Scope / Non-Scope

**In scope**
- A synchronous `search()` function that returns ranked chunks for a
  query against one existing Qdrant collection.
- Hybrid retrieval (dense + sparse + RRF fusion) already architecturally
  enabled by Phase 1.
- A cross-encoder reranker stage.
- An optional, explicitly-toggled query expansion policy.
- A minimal Streamlit testing/debug UI (local-only).
- A two-pronged evaluation strategy (harvested thumbs + deferred
  hand-labeled gold set).

**Out of scope for Phase 2**
- Answer generation or LLM summarization over hits (Phase 3).
- Cross-collection search (single-collection v1; multi-collection is
  reachable through `_registry` later without schema change).
- MMR diversification (stub only; wire when duplicates justify it).
- DBSF fusion, quantization, new payload indexes, or new state fields.
- Any production HTTP surface. The Streamlit UI is a dev tool.

---

## 2. Design Goals

1. **Honest reuse of Phase 1 assets.** Every touchpoint is something
   Phase 1 already built — `bge-m3` dense vectors, BM25 sparse with
   `modifier=IDF`, the five KEYWORD payload indexes, the `_registry`
   manifest, per-doc `acronyms.json`.
2. **Keep retrieval self-contained under `graph/retrieval/`.** Shared
   changes outside that package must be small, enumerable, and
   justified — not smuggled in.
3. **Fast hot path.** The production-shaped `search()` call returns
   final hits without performing extra queries for debug metadata.
4. **Deep debug mode.** When the UI asks for it, additional work
   (per-retriever ranks, expanded query text, timings) is computed —
   and the cost is paid only then.
5. **Configurable by `.env`.** No hardcoded model names, hosts,
   providers, or knobs in Python source — same rule as Phase 1.
6. **Standalone-rerun invariant.** Each retrieval module is runnable
   via `python -m graph.retrieval.<name> …`, mirroring Phase 1.
7. **No Phase 1 source edits if avoidable.** Where unavoidable, listed
   explicitly in §10.5.

---

## 3. Proposed `search()` Contract

Three small dataclasses. Defined once in `graph/retrieval/schema.py`
and consumed everywhere (CLI, Streamlit, future Phase 3).

```python
from dataclasses import dataclass, field

@dataclass(frozen=True)
class SearchRequest:
    query: str
    collection: str                         # full Qdrant collection name, e.g. ingest__doctrine__bgem3

    # Filters — keys MUST be one of the five indexed payload fields
    # (source_doc, chunk_type, paragraph_number, paragraph_numbers,
    # cross_refs). Other keys are rejected at call time rather than
    # silently doing a full-collection scan.
    filters: dict[str, str | list[str]] = field(default_factory=dict)

    # Retrieval sizing
    top_n_in: int = 50          # candidates fetched by hybrid stage
    top_k_out: int = 8          # final hits returned

    # Stage toggles (all default ON for v1 EXCEPT use_hyde)
    use_reranker: bool = True
    use_glossary: bool = True   # cheap, lossless acronym expansion
    use_hyde: bool = False      # experimental; see §6

    # Debug mode — costs extra queries, see §5
    debug: bool = False

@dataclass(frozen=True)
class SearchHit:
    point_id: str
    text: str
    heading_path: str           # repo stores this as a joined string ("A > B > C"), not a list
    source_doc: str
    page_numbers: list[int]
    chunk_type: str
    chunk_index: int
    paragraph_number: str | None
    paragraph_numbers: list[str]
    cross_refs: list[str]

    # Scores produced by the hot path
    rrf_score: float                    # score Qdrant returns after RRF
    rerank_score: float | None          # None if use_reranker=False

    # Optional per-retriever ranks (only populated when debug=True; see §5)
    dense_rank: int | None = None
    sparse_rank: int | None = None

    final_rank: int = 0                 # 1-based position in SearchResponse.hits

@dataclass(frozen=True)
class SearchResponse:
    request: SearchRequest
    hits: list[SearchHit]

    # Debug telemetry (populated iff request.debug=True)
    timings_ms: dict[str, float] | None = None          # {"embed": …, "hybrid": …, "rerank": …, "hyde": …}
    expanded_query: str | None = None                   # lexically-expanded query
    hyde_document: str | None = None                    # HyDE doc that was embedded (if use_hyde)
    qdrant_request_json: dict | None = None             # sanitized query_points payload
```

**Hot path (what production will look like, Phase 3 consumer).**
`debug=False` by default. No extra queries. No HyDE unless explicitly
enabled. One `query_points()` call + one reranker call.

**Debug path (what the Streamlit UI uses).**
`debug=True`. Pays for per-retriever dense-only and sparse-only
queries to populate `dense_rank` / `sparse_rank`, records timings,
and returns the expanded query + HyDE doc + raw Qdrant JSON.

---

## 4. Retrieval Pipeline

```
SearchRequest
    │
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Stage A — embed_query                                                │
│   1. Optional glossary expansion (see §6). Applies to both channels. │
│   2. Optional HyDE generation (see §6). Applies to DENSE only.       │
│   3. dense_q   = bge_m3.embed_query(hyde_doc or expanded_query)      │
│   4. sparse_q  = bm25.embed_query(expanded_query)                    │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Stage B — hybrid_search (Qdrant query_points)                        │
│   client.query_points(                                               │
│     collection_name=req.collection,                                  │
│     prefetch=[                                                       │
│       Prefetch(query=dense_q,  using="dense",  limit=N_dense),       │
│       Prefetch(query=sparse_q, using="sparse", limit=N_sparse),      │
│     ],                                                               │
│     query=FusionQuery(fusion=Fusion.RRF),                            │
│     query_filter=<from req.filters>,      # filter propagates to     │
│                                            # BOTH prefetches         │
│     limit=req.top_n_in,                                              │
│     with_payload=True,                                               │
│   )                                                                  │
│   Returns fused top-N_in with RRF scores. Per-retriever ranks are    │
│   NOT in the response.                                               │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Stage B' — (DEBUG ONLY) per-retriever ranks                          │
│   If req.debug: run two extra query_points calls with only the       │
│   dense prefetch (no fusion) and only the sparse prefetch, then      │
│   map each fused point_id to its 1-based position in each. Costs    │
│   two additional round-trips. Not run in the hot path.               │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Stage C — rerank                                                     │
│   If req.use_reranker:                                               │
│     pairs  = [(req.query, pt.payload["text"]) for pt in fused]       │
│     scores = reranker.rerank(req.query, [pt.payload["text"]…])       │
│     Sort by score desc; keep top req.top_k_out.                      │
│   Else:                                                              │
│     Sort by rrf_score; keep top req.top_k_out.                       │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
SearchResponse (hits + optional debug fields)
```

**Notes on Qdrant behavior (verified against pinned `qdrant-client`
1.17.1 source — R3 spike, §11.1):**
- `query_filter` is the correct kwarg for the top-level
  `query_points(...)` call (verified at
  `libs/qdrant_client-1.17.1/qdrant_client/qdrant_client.py:269`).
- **Inside a `Prefetch(...)` object the kwarg is `filter`, NOT
  `query_filter`** (verified at
  `libs/qdrant_client-1.17.1/qdrant_client/http/models/models.py:2230`).
  v1 only uses the top-level `query_filter`, which the server
  propagates to every prefetch — so the implementation does not need
  to set per-prefetch filters. The naming asymmetry is noted here so
  a future implementer of per-prefetch filtering does not pass
  `query_filter=` into a `Prefetch` constructor and get a
  pydantic `extra="forbid"` error.
- Filter propagates to every prefetch in the request.
- For RRF to be well-defined, each prefetch's `limit` must be
  `>= top_n_in`. We will enforce `N_dense = N_sparse = top_n_in` by
  default, tunable via `.env`.
- The fused response (`QueryResponse.points: list[ScoredPoint]`)
  returns RRF scores per point via `ScoredPoint.score` but carries
  **no** `dense_rank` / `sparse_rank` fields. `ScoredPoint` fields
  are exactly `id, version, score, payload, vector, shard_key,
  order_value` (verified at
  `libs/qdrant_client-1.17.1/qdrant_client/http/models/models.py:2744`).
  Any per-retriever rank decomposition requires the two extra
  queries in Stage B'.

---

## 5. Per-Retriever Ranks as Debug Metadata

Qdrant's fused response carries RRF scores only — `dense_rank` and
`sparse_rank` are **not** returned by `query_points` with prefetch +
`FusionQuery`. The policy for producing them:

| Mode | Behavior | Cost |
|---|---|---|
| Hot path (`debug=False`) | `dense_rank` and `sparse_rank` are `None`. Only `rrf_score` and `rerank_score` are populated. | 1 × `query_points` + 1 × rerank |
| Debug path (`debug=True`) | Two additional `query_points` calls: one dense-only, one sparse-only, both with `query_filter` applied. Map each fused point's ID to its 1-based position in each. | 3 × `query_points` + 1 × rerank |

**Rule.** The Streamlit UI turns debug on. Phase 3 consumers
(answer generation) leave it off. This keeps production latency
clean while still enabling deep inspection when a human is testing.

---

## 6. Query Expansion Policy

Two independent layers. Both are off-by-default **except** glossary,
which is on-by-default because it is cheap and lossless.

### 6.1 Glossary acronym expansion (default ON)

- Source: union of per-doc `acronyms.json` files produced by the
  Phase 1 `acronym_expander` post-processor. Cached per collection on
  first query; invalidated when the `_registry` manifest's
  `content_hash_of_folder` changes.
- Action: for any query token that exactly matches an acronym in the
  glossary, expand it in-place to `ACRO (expansion)` — keeping BOTH
  surface forms so sparse BM25 benefits too.
- Applies to: both dense and sparse channels.
- Cost: < 5 ms. Lossless where the glossary is unambiguous.
- Known limitation: ambiguous acronyms (e.g. `DA` = Department of the
  Army / direct action). v1 picks the first match and surfaces both in
  the UI debug panel so the dev can see the choice.

### 6.2 HyDE (default OFF in v1 — experimental)

- Definition: an LLM generates a hypothetical paragraph that would
  answer the user's query. The hypothetical doc — not the question —
  is embedded for the DENSE channel. The SPARSE channel still uses the
  user's (lexically-expanded) query so BM25 keeps the user's own
  terminology.
- Cost: one additional LLM round-trip (~1–3 s on `gpt-4o-mini`;
  ~$0.001/query). Needs `_get_llm()`.
- Current repo reality: `_get_llm()` is implemented inside
  `graph/nodes/check_documents.py` as a module-level singleton
  helper. It is not (today) a shared module. Honest consequence:
  reusing it from `graph/retrieval/hyde.py` will either (a) import
  from `graph/nodes/check_documents.py` (mildly awkward since
  retrieval would depend on an ingestion node), or (b) define a
  parallel `_get_llm()` under `graph/retrieval/`. See §10.5 for the
  recommendation.
- Status: **A/B-tested feature, not a locked default.** Published
  NDCG@10 gains of 5–15% are corpus-dependent. We do not have
  evidence yet that HyDE helps doctrine queries in *this* repo.
- Policy: ship the plumbing; default OFF; UI exposes an A/B toggle;
  decide by eval (§8).

### 6.3 What we are NOT adding in v1

- Multi-query generation (N paraphrases → N retrievals → RRF across).
- Learned query rewrites (needs labeled queries we do not yet have).
- Query routing across collections (no cross-collection search in v1).

---

## 7. Reranker Decision (Locked for v1)

### 7.1 Locked v1 choice

**`BAAI/bge-reranker-v2-m3`**, loaded via
`TextCrossEncoder.add_custom_model()` pointing at the community ONNX
export `mogolloni/bge-reranker-v2-m3-onnx`. Locked 2026-04-21 after
R1 + R2 spikes (§11.1).

**Why bge-reranker-v2-m3 is the v1 pick:**
- Same family as our dense embedder (`bge-m3`). Designed by the same
  team to rerank bge-m3's top-100.
- Multilingual; Arabic is covered via MIRACL training data.
- 568M params — measured at **102 ms for 4 pairs on M4 CPU** in the
  R2 spike, projecting to ~200–400 ms at 50 pairs. Interactive.
- Dev/prod parity: the same ONNX file runs on CPU (dev) and CUDA
  (prod).
- Consistent with the `add_custom_model` registration idiom already
  used for `bge-m3` in `graph/nodes/embed_chunks.py`, keeping the
  new-code surface small.

**Verified by spike (R1 + R2, executed 2026-04-21 — see §11.1):**
- `TextCrossEncoder.add_custom_model()` is confirmed at
  `libs/fastembed-0.8.0/fastembed/rerank/cross_encoder/text_cross_encoder.py:135`.
  Signature: `(model: str, sources: ModelSource,
  model_file: str = "onnx/model.onnx", description: str = "",
  license: str = "", size_in_gb: float = 0.0,
  additional_files: list[str] | None = None)`.
  **Narrower than `TextEmbedding.add_custom_model()`** — no
  `pooling`, `normalization`, or `dim` kwargs (cross-encoders emit
  scalar scores, so pooling and dimensionality are not concepts
  that apply). Import path: `from fastembed.rerank.cross_encoder
  import TextCrossEncoder` — the class is **not** re-exported from
  the top-level `fastembed` package; the naive `from fastembed
  import TextCrossEncoder` fails.
- `mogolloni/bge-reranker-v2-m3-onnx` is a verified drop-in under
  FastEmbed 0.8.0. HF repo manifest holds `onnx/model.onnx` +
  `onnx/model.onnx_data` (external-weights, note the single
  underscore — different from `aapot/bge-m3-onnx`'s
  `model.onnx.data` dot separator) + `tokenizer.json` /
  `tokenizer_config.json` / `sentencepiece.bpe.model` /
  `special_tokens_map.json` / `config.json`. Total download
  ~560 MB. Cold-start was ~120 s end-to-end in the R2 run.
  Ordering on a military-doctrine probe is correct: direct match
  +9.03, tangential +1.57, unrelated noise −11.03 / −11.04.
- `.rerank(query, docs)` returns a **generator**
  (`Iterable[float]`), not a list — retrieval code must materialize
  via `list(...)` before zipping with candidate payloads.

**Fallback contingency (not a co-equal v1 candidate).** FastEmbed
0.8.0 ships `BAAI/bge-reranker-base` (1.04 GB) natively. If the
custom-model registration for `bge-reranker-v2-m3` ever regresses
(for example, a FastEmbed bump that changes `add_custom_model`
semantics, or a takedown of the `mogolloni` repo), `bge-reranker-base`
is the drop-in replacement — same `.rerank(query, docs)` surface,
no `add_custom_model` call needed. This is a documented safety net,
not a choice we are evaluating. v1 is `bge-reranker-v2-m3`.

### 7.2 Qwen rerankers — future research, NOT a promised swap

Earlier drafts framed Qwen3-Reranker-{0.6B, 4B, 8B} as a clean
`.env`-swap upgrade path. That was overstated.

The honest picture:
- Qwen3 rerankers have higher published MTEB numbers, especially on
  Chinese and code tasks.
- FastEmbed 0.8.0 does **not** ship them natively. Using them would
  require a custom ONNX registration path whose signature and tokens
  are **not** verified. Community ONNX exports exist but are less
  mature than the BGE family's.
- Qwen3-Reranker-8B on M4 CPU is ~3–5 s per query — destroys the
  testing loop and breaks dev/prod parity.
- Qwen3-VL-Reranker is a different problem space (vision-language
  retrieval over page images); irrelevant to our text-chunk corpus.

**Decision for this doc:** defer Qwen entirely. Not in v1, not in
`.env`, not in the code scaffolding. Revisit *after* the BGE reranker
is proven in-repo and eval establishes a baseline we can meaningfully
measure against.

### 7.3 Execution providers

Mirrors the existing `EMBEDDER_PROVIDERS` decision verbatim.

| Platform | `RERANKER_PROVIDERS` |
|---|---|
| macOS M4 (dev) | `CPUExecutionProvider` |
| Ubuntu 22.04 (prod) | `CUDAExecutionProvider,CPUExecutionProvider` (requires `fastembed-gpu==0.8.0`, CUDA 12.x, cuDNN 9.x) |

Cold-start: ~1 GB download on first use. Same mitigation pattern as
bge-m3 (image-layer bake for prod; optional pre-warm script for dev).

---

## 8. Evaluation Strategy

Two complementary mechanisms. Together they cover early iteration and
later hard metrics; neither alone is sufficient.

### 8.1 Harvested thumbs (available from day 1)

- Streamlit UI emits a `👍` / `👎` button per hit.
- On click, append one line to `output/_eval/feedback.jsonl` with:
  `{ts, query, collection, point_id, source_doc, paragraph_number,
    final_rank, verdict, request_snapshot}`.
- Use: A/B comparisons on knob changes ("did turning HyDE on improve
  thumbs-up rate on the same queries?").

**Important honesty caveat.** Thumbs feedback is a *judged pool*: we
only see verdicts on hits the system already surfaced. This means
harvested thumbs can estimate **precision@k** and show relative
movement between configurations, but they cannot measure true
**Recall@k** — a good chunk the system never surfaced will never get
a thumbs-up. Thumbs alone will systematically miss recall failures.

### 8.2 Hand-labeled gold set (recommended, deferred)

- A small set (target: 20–50 queries) with hand-picked expected
  paragraph references, committed to the repo at
  `data/eval/gold_queries.jsonl`.
- Each query: `{query, collection, expected_source_doc,
  expected_paragraphs: [<paragraph_number>]}`.
- A future `scripts/eval_retrieval.py` consumes this file + runs
  `search()` + computes MRR@10, Recall@{1,5,10}, Precision@5.
- Because expected paragraphs are pre-committed, Recall@k is
  measurable even when the system misses hits.

**Why both, not one:**
- Thumbs scale naturally (free side effect of testing).
- Gold set gives calibrated numbers when you want to *decide* things
  (keep HyDE? raise `top_n_in`? swap rerankers?).

Authoring the gold set is not Phase 2 critical path. Recommended
timing: after ~2 weeks of UI use has revealed which query families
actually show up. Budget: 60–90 minutes of manual authoring.

### 8.3 File layout for eval data

| Path | Nature | Rationale |
|---|---|---|
| `data/eval/gold_queries.jsonl` | Curated, version-controlled | It is source data a code reviewer must be able to see and critique. Lives with the code. |
| `data/eval/cross_ref_prefixes.txt` | Curated, version-controlled | Developer-maintained seed list for the UI's cross-ref chip widget. |
| `data/eval/cross_ref_prefixes_unseen.txt` | Committed placeholder, dev-reviewed | Auto-appended by the UI when it sees a prefix not in the seed list. Dev promotes good ones into `cross_ref_prefixes.txt`. |
| `output/_eval/feedback.jsonl` | Runtime-harvested | Grows on every thumbs click. Lives alongside other runtime artefacts (`output/_folder_errors.jsonl`, per-doc folders). Gitignored. |

This split is deliberate: `data/` is for *code-review-visible* assets
(seed data, gold sets); `output/` is for *runtime-generated*
artefacts (never committed). Do not place `feedback.jsonl` in `data/`
— it would force every session's thumbs clicks into git history.

---

## 9. Streamlit Testing UI

Single file, `ui/app.py`. One new pip dep: `streamlit`. Local-only.

**Sidebar**
- Collection picker: values come from `_registry` (`slug`,
  `collection_name`, `doc_count`, `chunk_count`, `status`). The
  picker shows **two count signals side-by-side**, labelled so the
  difference is obvious:
  - *Manifest* — `_registry.doc_count` / `_registry.chunk_count`.
    The last values recorded by `upsert_to_qdrant` at ingest time.
    Treat as "last recorded ingest metadata."
  - *Live* — `client.get_collection(name).points_count`. The
    current collection reality at query time.
  When the two disagree (observed in the R5 live spike — see §11.1),
  the picker surfaces a non-blocking **warning badge** ("manifest
  is behind current collection state — last ingest metadata may be
  stale"). This is a debug cue for the developer, not an automatic
  failure: retrieval continues against the live collection.
- Filters, each mapped to an indexed payload field:
  - `source_doc` → multiselect. Values come from Qdrant's **facet
    counts** on the indexed field (NOT a scroll over the whole
    collection) — see note below.
  - `chunk_type` → toggle chips for `body`, `table`, `figure`,
    `figure_caption`, `glossary_entry`. Fixed cardinality; no
    lookup needed.
  - `paragraph_number` → free-text input.
  - `cross_refs` → prefix chips (seed ∪ observed) + free-text input.
    Observed prefixes come from a bounded scroll (top N cross_refs
    payload values) on collection change, not every query.
- Retrieval sliders: `top_n_in` (10–200, default 50), `top_k_out`
  (1–20, default 8).
- Stage toggles: `use_reranker`, `use_glossary`, `use_hyde`,
  `debug` (on by default in this UI; off in the hot path).

**Main panel**
- Query box + Search button.
- Result cards per hit: `final_rank`, `source_doc · page · ¶ …`,
  `heading_path` (rendered as-is — it's already a joined string),
  `chunk_type`, `rrf_score`, `rerank_score`, and (when `debug=True`)
  `dense_rank`, `sparse_rank`. Expanders for full text and raw
  payload JSON. 👍 / 👎 buttons.

**Debug drawer (visible when `debug=True`)**
- Expanded query text.
- HyDE document text (if `use_hyde=True`).
- Stage timings: `{embed, hyde, hybrid, rerank, hybrid_dense_only,
  hybrid_sparse_only}` in milliseconds.
- Sanitized `query_points` request JSON.

**Facet counts vs collection scans.** Where Qdrant's facet API
supports the indexed payload field (`source_doc`, `chunk_type`), we
use it — one RPC, server-side aggregation, no full scan. For
`cross_refs` (list field), we fall back to a bounded scroll capped at
a few thousand points on collection change. This is explicit in the
implementation plan so the UI does not accidentally scan a large
collection on every render.

---

## 10. File / Layout Proposal

### 10.1 New package: `graph/retrieval/`

```
graph/retrieval/
  __init__.py
  schema.py              # SearchRequest / SearchHit / SearchResponse
  config.py              # reads Phase 2 .env keys; sibling to graph/config.py
  embed_query.py         # dense + sparse query vectors
  glossary.py            # acronym expansion using per-doc acronyms.json
  hyde.py                # optional LLM HyDE generation (default OFF)
  hybrid_search.py       # Qdrant query_points + RRF + query_filter
  rerank.py              # TextCrossEncoder lazy-singleton
  mmr.py                 # stub; deferred
  registry.py            # read _registry for the collection picker
  search.py              # top-level search(SearchRequest) → SearchResponse
```

Every module is runnable standalone:
`python -m graph.retrieval.<name> <collection> "<query>"`

### 10.2 UI

```
ui/
  app.py                 # Streamlit single-file UI
```

### 10.3 Eval data

```
data/eval/
  cross_ref_prefixes.txt            # committed seed list
  cross_ref_prefixes_unseen.txt     # committed empty placeholder
  gold_queries.jsonl                # committed when authored
output/_eval/
  feedback.jsonl                    # runtime-harvested; gitignored
```

### 10.4 `.env` additions (Phase 2)

```
RERANK_MODEL=BAAI/bge-reranker-v2-m3
RERANK_MODEL_SOURCE=mogolloni/bge-reranker-v2-m3-onnx
RERANKER_PROVIDERS=CPUExecutionProvider         # Ubuntu: CUDAExecutionProvider,CPUExecutionProvider
RERANK_TOP_N_IN=50
RERANK_TOP_K_OUT=8
HYBRID_DENSE_PREFETCH=50
HYBRID_SPARSE_PREFETCH=50

QUERY_EXPAND_ACRONYMS=on
QUERY_EXPAND_HYDE=off                           # experimental — default OFF
QUERY_EXPAND_LLM_MODEL=gpt-4o-mini              # only used if HyDE is on
QUERY_EXPAND_HYDE_MAX_TOKENS=256
HYDE_DOMAIN=military doctrine

STREAMLIT_PORT=8501
```

### 10.5 Shared-helper extraction (locked: Option B — minimal additive)

**Decision (locked 2026-04-21).** The design uses a minimal
additive shared-helper extraction to avoid duplication and
singleton drift. Phase 1 is not "untouched" — it gains two narrow
imports — but every extraction is strictly additive and preserves
Phase 1's observable behavior.

| Helper | Current location | Action taken in Phase 2 |
|---|---|---|
| `_get_llm()` (`ChatOpenAI` singleton, used by `check_documents` today and by the Phase 2 HyDE path) | `graph/nodes/check_documents.py` | **Extract** to `graph/shared/llm.py`. `check_documents.py` is edited to import `_get_llm` from the new module instead of defining it inline. `graph/retrieval/hyde.py` imports the same helper. One shared singleton per process. |
| `_register_bge_m3_if_needed()` + `_get_dense_embedder()` + `_get_sparse_embedder()` (bge-m3 custom-model registration and lazy singletons for dense + BM25 sparse) | `graph/nodes/embed_chunks.py` | **Extract** to `graph/shared/embedders.py`. `embed_chunks.py` is edited to import the three helpers from the new module. `graph/retrieval/embed_query.py` and `graph/retrieval/rerank.py` (for the reranker singleton, defined in the same shared module or a sibling, TBD during implementation) import from there. |
| `_get_client()` (Qdrant client singleton) | `graph/nodes/upsert_to_qdrant.py` | **Not extracted in v1.** The Qdrant client is a thin HTTP wrapper; a parallel `_get_client()` inside `graph/retrieval/hybrid_search.py` costs effectively nothing and keeps the shared-helper footprint tight. Revisit if a third consumer appears. |

**Why Option B is the locked choice.** Option A (parallel
singletons with zero Phase 1 edits) is functionally correct but
leaves us with two `ChatOpenAI` instances per process once HyDE is
enabled and two sets of embedder singletons if the retrieval code
imports bge-m3 registration. That is the "singleton drift" we want
to avoid — subtle divergences in provider lists, cache paths, or
warm-up behavior that are hard to catch until they misfire in
prod. Option B costs two narrow additive imports in exchange for
one authoritative definition of each singleton.

**Edits to Phase 1 files under Option B.** Strictly additive and
behavior-preserving:
- `graph/nodes/check_documents.py`: replace the inline `_get_llm`
  definition with `from graph.shared.llm import _get_llm`.
  No other change.
- `graph/nodes/embed_chunks.py`: replace the inline
  `_register_bge_m3_if_needed`, `_get_dense_embedder`, and
  `_get_sparse_embedder` definitions (plus the
  `_bge_m3_registered` flag that pairs with them) with
  `from graph.shared.embedders import ...`. No other change.
- `main.py`: untouched.
- `graph/state.py`, `graph/builder.py`, `graph/config.py`,
  `graph/post_processors/*`, all other `graph/nodes/*`:
  untouched.

Every Phase 1 smoke test is expected to pass after the extraction;
the acceptance gate for each shared-helper commit is a clean
`python -m graph.nodes.check_documents <folder>` and
`python -m graph.nodes.embed_chunks <folder>` against an existing
`inputs/` folder.

---

## 11. Risks / Validation Tasks Before Code

Short, scoped tasks — each a few minutes to a few hours. Each gates a
decision in this doc.

| # | Task | Gates |
|---|---|---|
| R1 | Read `libs/fastembed-0.8.0/fastembed/rerank/` (or wherever the `TextCrossEncoder` class lives) and verify: does `TextCrossEncoder.add_custom_model()` exist with the same kwargs as `TextEmbedding.add_custom_model()`? Exact `ModelSource` / `model_file` fields? | The whole reranker registration pattern in §7.1. |
| R2 | Download `mogolloni/bge-reranker-v2-m3-onnx` and run a 3-line FastEmbed init + score one pair. Confirm latency and correctness on M4 CPU. | Keeps bge-reranker-v2-m3 as the v1 pick; otherwise we fall back to `TextCrossEncoder.list_supported_models()` output and re-pick. |
| R3 | Verify `qdrant_client` 1.17.1 `query_points` behavior with `prefetch=[dense, sparse]` + `FusionQuery(Fusion.RRF)` + `query_filter` on a real ingested collection. Confirm per-retriever ranks are NOT in the response. | §4, §5. |
| R4 | Confirm Qdrant facet API availability (1.17.x server) for the KEYWORD-indexed payload fields and how the client exposes it in 1.17.1. | §9 (UI dropdown sourcing). |
| R5 | Inspect `_registry` collection in a real instance: confirm payload keys (`slug`, `collection_name`, `source_folder_abs`, `embedder_tag`, `docling_version`, `created_at`, `doc_count`, `chunk_count`, `content_hash_of_folder`, `status`) match what the UI plans to display. | §9, §10. |
| R6 | Decide Option A vs Option B for the shared helpers (§10.5). | Whether Phase 1 sees two narrow additive edits. |
| R7 | Pick a sample doctrine folder already ingested locally; confirm `acronyms.json` files exist and are parseable for the glossary expander. | §6.1. |

Nothing in this doc should be coded until R1–R5 pass or are
explicitly mitigated.

### 11.1 Spike results (R1–R5, executed 2026-04-21)

**Summary.** R1, R3, R4, R5 **confirm** the design as written, with
the small clarifications already folded into §4 and §7.1. R2
**confirms** `BAAI/bge-reranker-v2-m3` via `mogolloni/bge-reranker-v2-m3-onnx`
as the v1 reranker pick. R6 (shared-helper Option A vs B) and R7
(acronyms.json glossary inspection) remain open — R6 is a user
decision, R7 is a quick inspection scheduled for the code-scaffold
phase.

| # | Result | Evidence |
|---|---|---|
| R1 | **PASS with clarification.** `TextCrossEncoder.add_custom_model(model, sources, model_file="onnx/model.onnx", description="", license="", size_in_gb=0.0, additional_files=None)` exists and is correct. **Differs from `TextEmbedding.add_custom_model()`**: no `pooling`, no `normalization`, no `dim` kwargs (cross-encoders emit scalar scores). Native registry ships `BAAI/bge-reranker-base`, `jinaai/jina-reranker-v2-base-multilingual`, and four others as fallbacks. Import path is `from fastembed.rerank.cross_encoder import TextCrossEncoder` — the class is not top-level-exported. | `libs/fastembed-0.8.0/fastembed/rerank/cross_encoder/text_cross_encoder.py:135`; `…/onnx_text_cross_encoder.py:16` (native list); `venv/…/fastembed/__init__.py` (no re-export). |
| R2 | **PASS.** Custom-model registration for `BAAI/bge-reranker-v2-m3` → `mogolloni/bge-reranker-v2-m3-onnx` works. Cold download ~120 s for 7 files (~560 MB; external-weights layout is `onnx/model.onnx` + `onnx/model.onnx_data` — single underscore, distinct from aapot/bge-m3-onnx's dot separator). Rerank latency on M4 CPU: **102 ms for 4 pairs**; expected ~200–400 ms at 50 pairs. Ordering on a military-doctrine probe is correct — direct match +9.03, tangential +1.57, noise −11.0. `.rerank()` returns a **generator** (`Iterable[float]`); callers must `list(...)` it. | Throwaway script `/tmp/r2_spike/r2_smoke.py` + `output.log`. |
| R3 | **PASS.** `query_points(collection_name, ..., prefetch=..., query=FusionQuery(fusion=Fusion.RRF), query_filter=..., limit=...)` is the correct top-level signature. **Caveat**: inside a `Prefetch(...)` the filter kwarg is named `filter`, not `query_filter` — the current design only uses the top-level filter and Qdrant propagates it to prefetches, so no code change is needed, but future per-prefetch filter work must not copy the top-level name. `ScoredPoint` carries `id, version, score, payload, vector, shard_key, order_value` — **no** per-retriever rank fields. Stage B' (debug-only extra queries) remains necessary. Live collection `ingest__doctrine__bgem3` is present with 1024-dim dense + sparse/IDF, `on_disk_payload=true`, and all five expected KEYWORD payload indexes. | `libs/qdrant_client-1.17.1/qdrant_client/qdrant_client.py:269` (`query_points` signature); `…/http/models/models.py:1046` (`Fusion`), `:1058` (`FusionQuery`), `:2230` (`Prefetch` — note `filter:` kwarg), `:2379` (`QueryResponse`), `:2744` (`ScoredPoint`); `curl /collections/ingest__doctrine__bgem3`. |
| R4 | **PASS.** `client.facet(collection_name, key, facet_filter=None, limit=10, exact=False)` → `FacetResponse.hits: List[FacetValueHit{value, count}]`. Works for any indexed payload field (the five Phase 1 fields are all KEYWORD-indexed). UI can use `exact=False` by default for speed, `exact=True` on demand. | `libs/qdrant_client-1.17.1/qdrant_client/qdrant_client.py:816`; `…/http/models/models.py:922` (`FacetResponse`), `:926` (`FacetValueHit`). |
| R5 | **PASS — with one live caveat.** Live `_registry` holds exactly the ten keys listed in §9: `slug, collection_name, source_folder_abs, embedder_tag, docling_version, created_at, doc_count, chunk_count, content_hash_of_folder, status`. **However**, the single live point reports `doc_count=11` / `chunk_count=519` while the `ingest__doctrine__bgem3` collection itself reports `points_count=7573`. Either Phase 1's `upsert_to_qdrant` does not update `_registry` after re-ingests, or the current `_registry` row is stale relative to a later ingestion run. **This is not a Phase 2 blocker** — the UI's collection picker just needs to display the registry values honestly (and optionally fetch live `points_count` from `client.get_collection(...)` if discrepancy is a concern). Recommend: the Streamlit UI should show both `_registry.chunk_count` (manifest claim) and `client.get_collection(name).points_count` (ground truth) side by side so the mismatch is visible, not hidden. | Live: `curl /collections/_registry/points/scroll` → 1 point with the ten keys; `curl /collections/ingest__doctrine__bgem3` → `points_count=7573`. |

**Corrections back into the doc (already applied above):**
- §4 now spells out that `Prefetch(...)` uses `filter=`, not
  `query_filter=`, and cites source lines.
- §7.1 "Explicitly NOT yet proven" section has been replaced with
  the R1+R2 spike results, including the correction that
  `TextCrossEncoder.add_custom_model` is *not* a drop-in for the
  `TextEmbedding` signature (no pooling/normalization/dim).
- Status banner and "Last updated" updated to reflect R1–R5 outcome.

**Resolved since the initial review draft:**
- R6 — locked 2026-04-21: **Option B** (minimal additive shared
  helpers). See §10.5.
- `_registry` doc/chunk-count freshness vs live collection —
  addressed in the UI design (§9): the collection picker now shows
  both manifest and live counts side-by-side with an explicit
  warning badge on mismatch.

**Still open / deferred:**
- R7 (acronyms.json glossary inspection) — cheap, will be done at
  the top of the `graph/retrieval/glossary.py` implementation step.

---

## 12. Explicit Corrections vs Earlier Drafts

| # | Previous claim | Correction in this draft |
|---|---|---|
| 1 | `dense_rank` / `sparse_rank` come "for free" from one `query_points` call. | False. Qdrant's fused response carries RRF scores only. Per-retriever ranks require two additional dense-only and sparse-only queries; they are optional debug metadata (§5). |
| 2 | "Phase 1 source code must not change at all." | Overstated. Ideal-world true; recommended shared-helper refactors require two small, strictly-additive extractions (`graph/shared/llm.py`, `graph/shared/embedders.py`). Alternative is Option A (parallel singletons) with zero Phase 1 edits. §10.5 enumerates both paths. |
| 3 | `SearchHit.heading_path: list[str]`. | Incorrect for this repo. Phase 1 stores it as a joined string (`" > ".join(headings)`, `graph/nodes/chunk_document.py`). Schema in §3 is `heading_path: str`. |
| 4 | `_registry` payload includes `content_hash`. | Actual key is `content_hash_of_folder` and the registry also carries `collection_name`. Verified against `graph/nodes/upsert_to_qdrant.py`. §3 and §9 use the real names. |
| 5 | Qdrant kwarg described as `filter`. | Correct name is `query_filter` for `query_points(...)`. Fixed in §4. |
| 6 | `feedback.jsonl` listed in two different locations across different docs. | Single, consistent home: `output/_eval/feedback.jsonl`. Gold set and seed lists live under `data/eval/`. Rationale in §8.3. |
| 7 | Qwen3 rerankers framed as a ready `.env` swap. | Not in v1, not in `.env`, not scaffolded. Treated as future research in §7.2. |
| 8 | HyDE presented as a locked default. | Default **OFF** in v1. Experimental, A/B-tested via UI toggle. §6.2. |
| 9 | UI filter dropdowns implicitly using collection-wide scrolls. | §9 specifies Qdrant facet counts for indexed fields where available, bounded scroll for list fields on collection change only. |
| 10 | Four new reference docs proposed. | Consolidated into one doc (this file). Splitting, if desired, happens *after* the plan is validated by the R1–R5 spike tasks. |

---

## What I intentionally did NOT lock yet

Everything in this section must remain open until a spike or
experiment confirms it. No code should lock these in.

- **FastEmbed `TextCrossEncoder.add_custom_model()` signature.**
  Not verified against pinned source. R1 resolves.
- **`mogolloni/bge-reranker-v2-m3-onnx` drop-in viability under
  FastEmbed 0.8.0.** Needs R2 smoke test.
- **Whether HyDE actually helps our doctrine queries.** Needs eval
  comparison. Until then, default OFF.
- **Option A vs Option B for shared helpers** (§10.5). User
  preference + maintenance appetite decides this; both paths work.
- **Exact `top_n_in` / `top_k_out` values.** 50 / 8 are standard
  defaults; final values are an eval output, not an input.
- **Gold-set size and authoring cadence.** Recommended 20–50 queries,
  but actual count follows real testing patterns (§8.2).
- **Cross-collection search.** Single-collection v1; the `_registry`
  already makes multi-collection reachable without schema change, but
  the merge strategy (RRF-of-RRF vs rerank-across-pools) is an
  experiment, not a decision.
- **MMR activation.** Stub only. Wire when observed duplicates
  actually appear.
- **Reranker fallback.** If R1/R2 fail for bge-reranker-v2-m3 under
  FastEmbed, candidate replacements (`TextCrossEncoder.list_supported_models()`
  output, `bge-reranker-base`, or `sentence-transformers` path) will
  be chosen against the spike results — not locked here.

---

## Cross-References

- `../docs/memory.md` — master index; Phase 2 row in the locked
  decisions table points here.
- `../docs/ubuntu_deploy_shadow.md` — prod-switch table. Reranker
  rows will be added only after R1/R2 validate the FastEmbed path.
- `07_hybrid_search_theory.md` — why hybrid + fusion.
- `04_qdrant_hybrid_search.md` — Qdrant API + indexes; the Phase 1
  contract this doc consumes.
- `09_doctrine_post_processors.md` — enrichment pipeline (source of
  `acronyms.json`, `paragraph_number`, `cross_refs`).
- Phase 1 code references: `graph/nodes/embed_chunks.py`
  (bge-m3 registration + lazy singletons),
  `graph/nodes/upsert_to_qdrant.py` (_registry schema + Qdrant
  client pattern), `graph/nodes/chunk_document.py` (heading_path
  serialization).
