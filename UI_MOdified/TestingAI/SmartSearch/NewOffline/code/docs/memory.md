# memory.md — Master Index for Future Chats

> **SESSION HANDOFF (2026-05-01).** Bundle was built, saved, and moved off
> this dev box.  The three transfer artefacts (`dms_app.tar` ~4.4 GB,
> `qdrant.tar` ~190 MB, `DecisionMakingSteps_TRANSFER.tar.gz` ~34 MB) are
> no longer in the repo — they live on the operator's USB / external
> drive.  The image was verified end-to-end with ethernet physically
> disconnected: 4/4 `.docx` generated successfully against LM Studio
> Qwen 2.5 32B Q4_K_M + Infinity-served bge-m3 + bge-reranker-v2-m3.
>
> **LLM choice on the offline box:** the operator picked
> `lmstudio-community/Qwen2.5-32B-Instruct-GGUF` (Q4_K_M).  This is the
> recommended default for this deployment — explicitly chosen to avoid
> the §C32 Gemma compliance failure modes (`Draft_planning_directives` /
> `Draft_conclusions` schema-mismatch under Responses=1 + `extra="forbid"`).
> Qwen 2.5 32B is a non-reasoning instruct model so the §C34 reasoning-
> model token-cap gotcha does NOT apply — token caps in `.env` can stay
> at their defaults.
>
> **Embedder choice on the offline box:** the operator asked about
> swapping to `mixedbread-ai/mxbai-embed-large-v1`.  Supported by
> configuration only.  Swap procedure (recommended Option A — minimal
> edits; the existing collection-name suffix `bgem3` becomes a misnomer
> but stays functional):
> ```bash
> sed -i 's/^EMBED_MODEL=.*/EMBED_MODEL=mxbai-embed-large-v1/' .env
> # then re-ingest:
> docker compose run --rm app python main.py
> ```
> Option B (clean — also rename the Qdrant collection suffix from
> `bgem3` to `mxbai`) requires editing two YAML files alongside `.env`:
> ```bash
> sed -i 's/^EMBEDDER_TAG=.*/EMBEDDER_TAG=mxbai/' .env
> sed -i 's/ingest__operationalfiles__bgem3/ingest__operationalfiles__mxbai/g' \
>     prompts/staff_brief/template.yaml \
>     prompts/initial_planning_guidance/template.yaml
> sed -i 's/ingest__doctrine__bgem3/ingest__doctrine__mxbai/g' \
>     prompts/initial_planning_guidance/template.yaml
> ```
> Either way a full re-ingest is required because mxbai-embed-large-v1
> produces a different vector space than bge-m3 (both 1024-dim but not
> bit-compatible — semantic distance is not preserved across the swap).
> The chunker tokenizer is intentionally NOT changed: `chunk_document.py`
> uses `BAAI/bge-m3` purely as a token-counting helper for the
> `max_tokens=512` chunking budget, independent of the embedder choice.
>
> **State of disk on this dev box (2026-05-01):**
> - `output/` cleaned for the offline simulation; rebuilds on next ingest.
> - The three transfer tarballs are gone (moved to USB by the operator).
> - Qdrant container is not currently running on this dev box; the
>   offline box has its own.  `docker compose up -d qdrant` brings it
>   back here if needed.
> - `.env` on disk is the post-offline-simulation state.  Backups:
>   `.env.bak.cloud`, `.env.bak.fastembed`.
>
> **What a fresh chat should do first:** read this handoff block, then
> `OFFLINE_RUNBOOK.md` §A (build) and §1 (offline first-run).  All
> hardenings from `changesonS4.md` are applied; do not re-apply.
>
> ---
>
> **LOCKED DECISION — Offline-readiness pass (2026-04-30).**  Bundle has
> been hardened for the airgapped i9 transfer.  Concrete changes (full
> trail in `changesonS4.md`):
> - **SSL bypass** in `graph/shared/responses_client.py::_get_client_for`
>   via `httpx.Client(verify=False)` so self-signed / internal-CA HTTPS
>   LLM endpoints work without cert mounting.  **Do not deploy on an
>   internet-facing host.**
> - **HF / Transformers / Datasets offline at runtime** via Dockerfile
>   post-warmup ENV block (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`,
>   `HF_DATASETS_OFFLINE=1`).  Warmup still downloads at build-time
>   because the flags are NOT in the pre-warmup block.
> - **tiktoken pre-cached** via `TIKTOKEN_CACHE_DIR=/app/.cache/tiktoken`
>   + new `warm_tiktoken()` function.  Required so the openai SDK doesn't
>   try to fetch `o200k_base` from openaipublic.blob.core.windows.net on
>   the first LLM call.
> - **Slim warmup**: bge-m3 dense + reranker REMOVED from
>   `scripts/warmup_models.py`.  Offline target uses HTTP-served embedder
>   + reranker (`EMBED_PROVIDER=http`, `RERANK_PROVIDER=http`); local
>   FastEmbed fallback no longer available without re-adding to warmup.
>   Saves ~3.4 GB on the image.
> - **Docling + RapidOCR critical**: both warmup steps moved from
>   "optional" to "critical" so a build that can't reach modelscope.cn
>   aborts loudly instead of silently producing an image that hangs on
>   first PDF parse.
> - **`.dockerignore`** added: excludes `.env`, `venv/`, `output/`,
>   `*.tar`, `.git/`, etc. — prevents secret leakage and shrinks build
>   context.
> - **Streamlit telemetry off**: `STREAMLIT_BROWSER_GATHER_USAGE_STATS=false`.
> - **Source volume mounts** in `docker-compose.yml`: `./graph`,
>   `./scripts`, `./ui`, `./main.py` — `.py` edits hot-reload without
>   rebuild.  **Do NOT mount `./:/app`** — shadows `/app/.cache`.
> - **Qdrant `check_compatibility=False`** at all 3 sites
>   (`graph/retrieval/registry.py`, `graph/nodes/check_documents.py`,
>   `graph/nodes/upsert_to_qdrant.py`).
> - **`.env.example`** restructured with explicit triples for LLM,
>   embedder, reranker (URL + key + model each).  Operator on offline
>   box copies `.env.example` → `.env` and fills in 9 fields.
>
> **LOCKED DECISION — GPU/CPU auto-detect (2026-04-30, user override).**
> The project ships GPU-capable wheels (`fastembed-gpu==0.8.0`,
> `onnxruntime-gpu==1.25.1`, `torch+cu130`) and uses runtime auto-detect
> for both Docling and FastEmbed.  Single `.env` runs on a GPU host and
> a CPU-only host with no edits.  Knobs:
> ```ini
> DOCLING_DEVICE=auto
> EMBEDDER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
> RERANKER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
> ```
> Implementation: `graph/shared/device_banner.py` prints `[device] …`
> diagnostics at the top of every `main.py` / `scripts/generate_documents.py`
> run.  GPU wheels physically contain BOTH CUDA and CPU code paths; on a
> CPU-only host ORT silently falls back at session-create time.  The
> CPU-only `fastembed` / `onnxruntime` wheels lack CUDA code entirely
> and were therefore unsuitable for "auto" — they were removed.  See
> §C26 + the new GPU-auto-detect section in `TRANSFER_NOTES.md` §0 and
> `OFFLINE_RUNBOOK.md` §6 for the slim CPU-only-build recipe (uninstall
> -gpu wheels, reinstall plain ones, keep `.env` unchanged).
>
> **LOCKED DECISION — provider-based model routing (2026-04-24, user
> override supersedes the earlier "LM-Studio-only, LLM-only" text).** The
> repo now supports swapping LLM, dense embedder, and reranker between
> in-process FastEmbed and any OpenAI-compatible HTTP server (LM Studio,
> Infinity, TEI, llama.cpp server, offline Linux box) by editing `.env`
> only.  Architecture:
> - **LLM**: `graph/shared/llm_factory.py` resolves base URL + API key +
>   model from `.env`.  Every `ChatOpenAI` the project builds uses
>   `use_responses_api=resolve_use_responses_api()` (default ON) so it
>   hits `POST /v1/responses`, NOT `/v1/chat/completions`.
>   `LLM_USE_RESPONSES_API=0` is a per-deployment escape hatch ONLY for a
>   local model that cannot serve `/v1/responses`; not a silent-fallback
>   knob.  Verified: `langchain-openai==1.1.14` routes `use_responses_api=True`
>   through `self.root_client.responses.create(...)` (base.py:1485), which
>   genuinely hits `/v1/responses`.  No chat-completions fallback exists at
>   the primary call sites.
> - **Dense embedder**: `graph/shared/embedders.py` branches on
>   `EMBED_PROVIDER` (`fastembed` default / `http` alias `lm_studio`).
>   The HTTP path is `HttpDenseEmbedder` — pure `urllib`, calls
>   `POST /v1/embeddings` on `EMBED_BASE_URL` with L2-normalisation
>   applied defensively to every row.  FastEmbed path unchanged.
> - **Reranker**: `graph/retrieval/rerank.py` branches on `RERANK_PROVIDER`
>   (`fastembed` default / `http`).  The HTTP path is `HttpReranker`,
>   accepting the Cohere/Jina/Infinity/TEI shape (`POST /rerank` with
>   `{model, query, documents, top_n}` → `{results: [{index, relevance_score}]}`),
>   accepts `score` as an alias for `relevance_score` for llama.cpp
>   builds.  Raises `RerankUnavailable` on any failure.  Caller
>   `graph/retrieval/search.py` catches it and degrades to RRF-only —
>   retrieval never hard-fails on rerank outage.
> - **Sparse (BM25)**: untouched.  Not a model; stays in-process via
>   FastEmbed `Qdrant/bm25`.  User directive carves BM25 out of the
>   provider routing.
>
> **Env surface (all in `.env.example`):** `LLM_BASE_URL`, `LLM_API_KEY`,
> `LLM_MODEL`, `LLM_USE_RESPONSES_API`, per-role `PHASE1_GATE_MODEL` /
> `QUERY_EXPAND_LLM_MODEL` / `PHASE3_EXTRACTOR_MODEL` /
> `PHASE3_DRAFT_MODEL` / `PHASE3_CRITIQUE_MODEL`, `EMBED_PROVIDER` /
> `EMBED_BASE_URL` / `EMBED_API_KEY` / `EMBED_MODEL`, `RERANK_PROVIDER` /
> `RERANK_BASE_URL` / `RERANK_API_KEY` / `RERANK_MODEL`.  Precedence for
> model vars: role-specific → global (`LLM_MODEL`) → code default.
>
> **Cache provenance (`graph/generation/cache.py`):** folds
> `llm_endpoint_tag`, `llm_use_responses_api`, `embed_provider`,
> `embed_endpoint_tag`, `rerank_provider`, `rerank_endpoint_tag` into
> every per-group cache key.  Provider / URL / Responses-API flips
> invalidate drafts automatically.
>
> **Re-ingest warning (embedder only):** bge-m3 served as GGUF over HTTP
> is NOT guaranteed to produce vectors bit-identical to the FastEmbed
> ONNX path.  Flipping `EMBED_PROVIDER=http` on a corpus ingested under
> `fastembed` requires either verified parity (cosine > 0.9999 on
> normalised vectors) or a full re-ingest.  Reranker cutover is
> lower-risk: no stored vectors change.  Suggested migration order:
> reranker → embedder (with re-ingest).
>
> **Supersedes** the earlier "LM-Studio-only, LLM-only" locked notes and
> the FastEmbed-only text in `docs/local_llm_migration.md`.  Both are
> updated to match.  Do NOT add new construction paths that bypass
> `build_chat_llm()`, hardcode `use_responses_api=False`, or instantiate
> `TextEmbedding`/`TextCrossEncoder` directly outside the shared
> modules.
>
> **PROJECT STATUS: PHASE 1 + PHASE 2 IMPLEMENTED; PHASE 3 v1 FULLY Y-MIGRATED (§C25, 2026-04-23); PROVIDER-BASED MODEL ROUTING LIVE (§C26, 2026-04-24); TIERED RETRIEVAL ARCHITECTURE COMPLETE (§C28→§C31, 2026-04-27) — Phase 0 freed the `doctrine` slug (operational corpus renamed to `inputs/operationalfiles/` → `ingest__operationalfiles__bgem3`); Phases 1–7 landed `EvidenceBundle` (three named channels: source_files / operationalfiles / doctrine), tier-aware drafter system prompt + typed-evidence drafting rules (§C30), typed-evidence faithfulness critique (§C30), canonical-sha256 cache-key fragments for source-files provenance + tier policy + coverage thresholds (§C31 Phase 5), tier-prefixed `[S/O/D: ...]` citation-tag emission (gated; §C31 Phase 6), three-Arabic-sub-heading citation endnote layout (§C31 Phase 6), six tier-policy enum values (§C31 Phase 7), pure-arithmetic coverage gate (`graph/generation/coverage.py`; §C31 Phase 7), and `PHASE3_TIERED_RETRIEVAL` kill-switch.  No template opts in yet; all four v1 docs run the legacy `operationalfiles_only` fast-path so behaviour is byte-equal to §C25 (verified 2/2 fields.json IDENTICAL across every Phase boundary 0→7).  When a group's YAML adds `policy:` + tier-aware keys, the dispatcher routes that group through the tiered fan-out, coverage gate, doctrine fallback, typed-evidence prompts, and prefixed citation endnote.  Doctrine reference library is empty until the user ingests it via the existing Phase 1 pipeline (`inputs/doctrine/` → `ingest__doctrine__bgem3`); `doctrine_collections: [...]` declarations on groups produce zero hits with no hard error until then.  Parked: Gemma drafter Pydantic schema-compliance issue (see [`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md)) — user-controlled.  3/4 v1 .docx still produce cleanly (`time_analysis`, `initial_planning_guidance`, `warning_order`); `staff_brief` blocked by Gemma issue.  Phase 1 ingestion + Phase 2 retrieval stack untouched. — LLM + dense embedder + reranker all swappable between FastEmbed and any OpenAI-compatible HTTP server (LM Studio, Infinity, TEI, llama.cpp server, offline Linux) via `.env` alone. LLM hard-locked to `POST /v1/responses` (`use_responses_api=True` default). FastEmbed remains first-class fallback for embedder + reranker. BM25 stays in-process forever. Rerank failure → RRF-only degradation (not hard-fail). Cache provenance folds six new fields (`llm_endpoint_tag`, `llm_use_responses_api`, `embed_provider`, `embed_endpoint_tag`, `rerank_provider`, `rerank_endpoint_tag`). ALL FOUR v1 docs still live under `prompts/<doc>/` (time_analysis, initial_planning_guidance, staff_brief, warning_order). §C25 brought warning_order across: flat 50-field Pydantic schema whose keys + per-field `Field(description=...)` bodies come from `/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf`; all 50 fields `source_file_extracted`; new `y_warning_order` renderer mirrors OLD generator doc 1 (lines 939–1152 of `/Desktop/ToTransfer/New Text Document.txt`) — bism + `add_arabic_header` with today's Hijri/Gregorian + letter_ref_number2 + References/Maps/time_zone + level-1/2/3 الموقف/مهمة المكون البري/التنفيذ/الإدامة/القيادة والسيطرة + SPLITTER on 6 numbered-text fields + أقرّوا approval + Appendices via `add_level_one_ML` + Viewports via `add_level_one_SHFAF`. Y typos preserved verbatim (`Crtitical`, `movm`). §C23 TWO-FILE INPUT SURFACE (`--warning-order` + `--intel-report` + `--source-file kind=path` extras) unchanged; legacy paths preserved. `source_file_extracted` field kind drives per-doc structured-LLM extraction from user uploads (`graph/generation/source_file_extractor.py` + `source_file_reader.py`); retrieval stack (Qdrant / section_drafter / critique / cache) untouched and still handles `kind: retrieved`. §C24 NESTED RENDERER LAYOUTS `y_time_analysis` / `y_initial_planning_guidance` / `y_staff_brief` mirror OLD docs 3/4 + doc 2. `.fields.json` emitted FLAT (keys match `/Users/hextechkraken/Desktop/y/*.{txt,rtf}` verbatim); dispatcher guarantees no empty strings — every blank surfaces as one of the three approved Arabic placeholders. Live verified at `/Users/hextechkraken/Desktop/NewOutputs/` (**4/4** `.docx` + 4 `*.fields.json`). PRIOR BINDING REVISIONS (all still in force): §C21 catalog consolidation still drives remaining legacy operation_order / staff_estimate; §C22 three-prompt + single-prompt input surfaces preserved; §C19 OCR-retry plan-B live; §C18 MDMP-topical gate live.**
> Phase 1 ingestion pipeline (7 nodes) and Phase 2 retrieval stack
> (`graph/retrieval/` package + `ui/app.py` Streamlit UI + `start.sh`
> bring-up + `scripts/retrieval_smoke_test.py` read-only harness)
> are both implemented, committed on `main`, and end-to-end
> exercised. Phase 2 design locked in
> [`referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md)
> — all R1–R7 spikes resolved; §7 reranker locked to
> `BAAI/bge-reranker-v2-m3`; §10.5 locked to Option B (shared helpers
> extracted under `graph/shared/`).
>
> **Phase 3 (template-driven document generation) — M0–M3 code landed
> (commit `5e2aaf0`). v1 scope is MDMP Step 1: two documents (Time
> Analysis + Initial Planning Guidance / WARNO) per §18 C17.** OPORD
> and Staff Estimates deferred to v2 via `v1_scope: false` on their
> templates + a CLI gate. Doctrine corpus swapped from 21 tactics
> manuals to the 4-manual MDMP Step 1 set (FM-6-0, FM-5-0, ADP-5-0,
> ADP-2-0); tactics archive at `/Users/hextechkraken/Desktop/NatoDocs/`.
> Authoritative scoping doc:
> [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md).
> Companion docs: [`referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md)
> (renderer port guide, preserves old Arabic typography verbatim per
> user directive), [`referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md)
> (YAML template + 5-kind field taxonomy), project-level overview at
> [`phase3_walkthrough.md`](phase3_walkthrough.md). Pydantic
> schemas in [`NewClasses.md`](../NewClasses.md) at repo root. Sample
> input at [`data/phase3_inputs.example.json`](../data/phase3_inputs.example.json).
> **Two pre-code gates (§19 of the scoping doc) are LANDED
> 2026-04-22:** (M0.1) `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT`
> relaxed from the topical "maneuver/combat only" filter to a
> topic-agnostic junk filter — the gate node, schema, and wiring are
> unchanged. (M0.2) the four YAML templates
> (`templates/time_analysis.yaml`,
> `templates/initial_planning_guidance.yaml`,
> `templates/staff_estimate.yaml`,
> `templates/operation_order.yaml`) are authored. All four resolve
> to the single doctrine collection `ingest__doctrine__bgem3` with
> per-manual narrowing via `filters.source_doc` allowlists — one
> collection per DOMAIN, not per FM (see §6.4 of the scoping doc,
> revised 2026-04-22). Phase 3 v1 ships ONLY `.docx` — PDF/TXT
> removed by user directive.
>
> **→ NEW SESSION STARTING?** Read the "Session Handoff" block at the
> bottom of this file, then:
> - If resuming Phase 2 / retrieval work: [`walkthrough.md`](walkthrough.md)
>   §8 + [`referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md).
> - If starting Phase 3 / generation work:
>   [`phase3_walkthrough.md`](phase3_walkthrough.md) first, then
>   [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md).
>
> **READ THIS FIRST** before doing anything in this project. It captures every
> locked decision, pinned version, and rule that applies. For depth, follow the
> pointers into `referencedocs/`. For library source, read `libs/`.
>
> **Do not pull information from the public internet or training data that
> conflicts with what is pinned here.** If new online info is needed, verify it
> is compatible with the versions below before acting on it; then update this
> file and the relevant referencedoc.
>
> Decisions below are load-bearing. Changing any row requires a documented
> override with rationale.
>
> Last updated: 2026-04-22 (Phase 3 scoping revised post-second-review
> — §18 C8–C15 in the scoping doc track every revision: RRF-across-seeds
> + single final rerank for retrieval merge, Phase-3-local LLM helper
> replacing `graph.shared.llm._get_llm` inside `graph/generation/`,
> expanded cache key, retraction of the "byte-for-byte .docx" claim,
> explicit citation-locator fallback chain, NewClasses.md as reference-
> only, Pydantic-first inputs schema with JSON-Schema auto-export,
> and a new `SourcedHit` wrapper preserving originating collection.
> Prior: 2026-04-22 Phase 3 initial scoping — four md files
> (`referencedocs/18_phase3_generation.md`, `19_phase3_arabic_renderer.md`,
> `20_phase3_templates_and_kinds.md`, `docs/phase3_walkthrough.md`),
> Pydantic schema mirror at repo-root `NewClasses.md`, sample input
> at `data/phase3_inputs.example.json`. No `graph/generation/` code
> exists yet — two pre-code gates in §19 of the scoping doc.
> 2026-04-22 Phase 2 retrieval implemented — `graph/retrieval/`
> package, `graph/shared/` helpers, `ui/app.py` Streamlit UI,
> `scripts/retrieval_smoke_test.py`, `start.sh` one-command bring-up,
> `data/doctrine/` external termbase + vocab loader, LibreOffice
> intake normalization for legacy Office formats).

---

## Project Summary

**Target**: Three-phase system built on LangGraph + Qdrant.
- **Phase 1 — ingestion**: a 7-node LangGraph pipeline that ingests
  documents (`.txt`, `.pdf`, `.docx`, plus legacy Office formats
  `.doc`/`.rtf`/`.xls`/`.xlsx`/`.ppt`/`.pptx`/`.odt` via LibreOffice
  normalization) into a hybrid-search vector DB.
- **Phase 2 — retrieval**: a synchronous `search(SearchRequest) →
  SearchResponse` function (NOT a LangGraph node) over one ingested
  collection, plus a local Streamlit dev UI.
- **Phase 3 — document generation** (SCOPED, PRE-CODE): a
  template-driven generator that walks a YAML spec per document,
  dispatches each schema field by one of five kinds
  (`static`/`computed`/`input`/`derived`/`retrieved`), calls Phase 2
  `search()` only for `retrieved` fields (grouped one LLM call per
  Pydantic class), and renders four Arabic `.docx` files per run
  (OPORD, Staff Estimates, Time Analysis, Initial Planning
  Guidance) using the Arabic typography primitives ported verbatim
  from the user's prior generator. Design locked in
  [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md).

**Phase 1 pipeline (7 nodes, LOCKED):**
`initialpages_convert` → `check_documents` → `convert_document` →
`chunk_document` → `enrich_chunks` (5 doctrine post-processors) →
`embed_chunks` → `upsert_to_qdrant`.

All nodes disk-backed (state holds paths, not objects). `initialpages_convert`
runs Docling on pages 1–10 of each binary doc and writes a markdown preview
so `check_documents` (LangChain `ChatOpenAI`, text-only) has real content to
judge rather than a binary placeholder.

Ingestion code lives in `graph/` + `main.py` + `scripts/`. Input folders
live under `inputs/` — one sub-folder = one Qdrant collection.

**Phase 2 pipeline (4 stages, implemented):**
Stage A `embed_query` (glossary acronym expansion default-ON + optional
HyDE default-OFF; shared bge-m3 + BM25 singletons from `graph/shared/`) →
Stage B `hybrid_search` (Qdrant `query_points` with `prefetch=[dense,
sparse]` + `FusionQuery(Fusion.RRF)` + `query_filter`) → Stage B′
(debug-only: two extra dense-only/sparse-only queries to recover
per-retriever ranks — they are NOT in the fused response) → Stage C
`rerank` (BGE `bge-reranker-v2-m3` via `TextCrossEncoder.add_custom_model`
+ `mogolloni/bge-reranker-v2-m3-onnx`) → Stage D `apply_mmr` (identity
stub; deferred). Retrieval code lives in `graph/retrieval/`, shared
singletons in `graph/shared/`, UI in `ui/app.py`, eval seed data in
`data/`, smoke harness in `scripts/retrieval_smoke_test.py`. One-command
bring-up: `./start.sh`.

Full pipeline explanation: [`walkthrough.md`](walkthrough.md) (§1–§7
ingestion, §8 retrieval).
Current layout, state fields, collection map: [`structure.md`](structure.md).
Phase 2 design rationale (locked): [`../referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md).

---

## Locked Design Decisions

| # | Decision | Rationale |
|---|---|---|
| Parser | **Docling** (all formats) | Structure + tables + multi-format |
| Chunker | **Docling HybridChunker** | Native structure awareness, tokenizer-aware |
| Chunker config | **`max_tokens=512`, `merge_peers=True`, no sliding-window overlap** — tokenizer = `HuggingFaceTokenizer(AutoTokenizer.from_pretrained("BAAI/bge-m3"))` (locked 2026-04-19) | 256–512 is the RAG-eval sweet spot; HybridChunker's structural `merge_peers` replaces sliding overlap. See [`referencedocs/03_docling_hybrid_chunker.md`](../referencedocs/03_docling_hybrid_chunker.md) |
| Embedding text | Use `chunker.contextualize(chunk=c)` for what gets embedded; raw `chunk.text` goes in Qdrant payload for display | Heading-aware context in vector; unmodified text in payload |
| Vector DB | **Qdrant** (Docker, dashboard) | Hybrid first-class, inspection via dashboard |
| Dense embed | **BAAI/bge-m3** (1024-dim, local, multilingual, 8k ctx) via FastEmbed. **Loaded via `TextEmbedding.add_custom_model()`** (FastEmbed 0.8.0 does not ship bge-m3 in its built-in registry — verified via `TextEmbedding.list_supported_models()`, 2026-04-20). Custom-model source: `aapot/bge-m3-onnx` on HuggingFace (`model.onnx` + `model.onnx.data` external-weights format, plus tokenizer files). Config: `pooling=PoolingType.DISABLED`, `normalization=True`. **`DISABLED` is load-bearing** — aapot's `dense_vecs` output is already pooled to shape `(batch, 1024)`; re-pooling with CLS crashes the 2-D→1-D reduction in `_normalize`. Registration lives in `graph/nodes/embed_chunks.py::_register_bge_m3_if_needed()` (idempotent). Optional `HF_TOKEN` in `.env` skips HF rate limits on first download (~2.3 GB). | Local, no cloud dep except LLM. |
| Sparse embed | **FastEmbed `Qdrant/bm25`** | Interpretable, upgrade path to SPLADE/BM42 |
| Fusion | **RRF** (Qdrant default) | Rank-based, robust |
| OCR | **Selective via `OcrAutoOptions`** (`do_ocr=True`, `force_full_page_ocr=False`) — Docling extracts text layer first, OCRs bitmap regions only, merges | Accuracy-first; ~90% of docs are digital-born but we never silently skip a scanned region |
| OCR escalation | **Per-page fallback** to `force_full_page_ocr=True` + `TesseractCliOcrOptions(lang=["auto"])` when a page's diagnostics look thin (low char count or high bitmap coverage with zero OCR cells). Logged into `ingestion_errors` with `stage=ocr_escalation` | Worst-case accuracy rescue — never fail silently |
| Parse diagnostics | **Always dumped** to `output/<doc_stem>/diagnostics.json` — per-page char count, cell counts, bitmap coverage | Human spot-check surface; drives escalation heuristic |
| LLM (API key) | **OpenAI** via `OPENAI_API_KEY` — used by `check_documents` now, future QA later | **Only cloud dependency in the stack.** Self-host first policy: embeddings, parsing, chunking, OCR are all local; if self-host later breaks on a component, API models are the fallback (not the default) |
| Graph Q1 | **`check_documents` is a PER-DOCUMENT LLM gate** (overridden 2026-04-21). Makes one LLM call per doc using `SUFFICIENCY_CHECK_PROMPT` (in `graph/prompts.py`) and records a verdict per doc. Folder-level `state["decision"]` is `"enough"` iff at least one doc was accepted; downstream nodes iterate `state["eligible_documents"]` only, so rejected docs are never parsed, chunked, embedded, or upserted. Rejected-doc review bundles land in `output/not_enough/<folder_slug>/<safe_stem>/` (check_decision.json + copied initial_pages.md). The gate also best-effort deletes stale Qdrant points for any doc rejected this run but previously ingested. Prompt content (topical vs. junk filter) can change independently of this routing. **Prior behaviour (kept for history):** a single LLM call judged the whole folder and produced one binary decision, so rejected docs still flowed downstream whenever ≥1 doc in the folder was accepted. That was the routing bug fixed on 2026-04-21. | One LLM call per doc is a small cost (≈ seconds × n docs) next to full parse + embed, and makes per-doc filtering possible without prompt tricks. Centralising prompts still applies. |
| Graph Q2 | **Seven-node pipeline**: `initialpages_convert → check_documents → convert_document → chunk_document → enrich_chunks → embed_chunks → upsert_to_qdrant`. `initialpages_convert` runs Docling on pages 1..10 of each binary doc and writes a markdown preview as `output/<doc_stem>/initial_pages.md`; `check_documents` reads that preview so the LLM gate judges real content instead of a "[Binary document — ...]" placeholder. `enrich_chunks` runs the 5 doctrine post-processors as a single node. `convert_document` is the full parse. | Max debuggability; separate `enrich_chunks` keeps post-processor failures visible in LangSmith traces. `initialpages_convert` exists because LangChain `ChatOpenAI` accepts text only — the gate cannot peek at a raw PDF. The node reuses `_get_parser()` from `convert_document` so there is still exactly one `DocumentConverter` resident per process. |
| Graph Q3 | **One collection per folder**, name format `ingest__<slug>__bgem3` (slug = lowercase folder basename, `[^a-z0-9_-]`→`_`, 48-char max); a dedicated `_registry` Qdrant collection holds one point per managed collection with payload `{slug, source_folder_abs, embedder, docling_version, created_at, content_hash, doc_count, chunk_count, status}`. | Hard isolation; embedder tag prevents silent model-swap corruption; registry is queryable manifest |
| Graph Q4 | **Hash-gated delete-then-upsert.** Each point payload carries `doc_content_hash = sha256(file_bytes)`. Before re-ingesting a doc: query one existing point with `source_doc == X`; if its hash matches, **skip the doc entirely** (no re-parse, no re-embed, no delete). If it differs, `client.delete(collection, filter=Filter(must=[FieldCondition(key="source_doc", match=MatchValue(value=X))]))` then upsert fresh chunks with UUID5 IDs. | Idempotent, skips unchanged docs, zero orphan chunks |
| Graph Q5 | **Skip-and-log on ALL ingestion failures** (parse, embed, upsert) with **detailed logging** — full traceback, file path, stage, timestamp into `ingestion_errors`; `ingestion_status` = `ok` / `partial` / `failed`. | Better to finish what we can and inspect failures than hard-fail a folder. |
| State storage | **Always disk-backed.** `IngestionState` holds only paths (e.g. `parsed_paths: dict[str, str]`, `chunks_paths: dict[str, str]`, `embeddings_paths: dict[str, str]` — each maps source filename → `output/<stem>/<stage_file>`); actual `DoclingDocument` trees, chunks, and vectors live as files on disk. The per-doc gate fields (`document_decisions`, `document_remarks`, `eligible_documents`, `rejected_documents`, `rejected_review_dir`) added 2026-04-21 are also small metadata — filenames, short verdict strings, and path strings — so the disk-backed invariant still holds. No hybrid threshold, no in-memory mode. Applies on both M4 dev and H200 prod. | Bounded memory, dev/prod parity (M4 64GB ↔ H200 1TB+), readable LangSmith traces, checkpointer-friendly, zero extra I/O (disk dumps happen anyway as inspection artefacts). |
| State schema | **Single active TypedDict** — `graph/state.py::IngestionState`. | Avoids ambiguity about which state is in use. |
| Doctrine post-processors | **All 5 built up front**: classification stripper, paragraph number extractor, cross-ref extractor, glossary splitter, acronym expander. Run in that order inside a dedicated `enrich_chunks` node between `chunk_document` and `embed_chunks`. Per `referencedocs/09_doctrine_post_processors.md`. Each is a pure `(list[chunk]) -> list[chunk]` function wrapped in try/except. Called by `enrich_chunks` on per-doc buffers (one `source_doc`'s chunks at a time), not on the whole folder at once — keeps the locked memory-discipline. The acronym-expander's glossary dict is built in memory from `glossary_splitter`'s output on that same per-doc buffer; `output/<doc_stem>/acronyms.json` is a disk dump for inspection only, not the expander's data source. | Doctrine-shaped docs benefit from enrichment from day one. Glossary splitter + acronym expander are no-ops on docs without a glossary — safe for any input. |
| Config | **All configuration in a single `.env` file** — no hardcoded hosts, ports, paths, device flags, or EP names in Python source. Moving between environments is a `.env` swap only. The template lives inline as comments inside `.env` itself. | Required for clean Ubuntu 22.04 deployment shadow |
| `libs/` | Inside `DecisionMakingSteps/` (project-scoped) | Project-local reference copies |
| Platform (dev) | macOS on Apple Silicon M4 | User hardware |
| Platform (prod) | **Ubuntu Linux 22.04 LTS — FINAL DEPLOYMENT TARGET.** Every macOS decision must "shadow" into an Ubuntu equivalent. Full shadow table: [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md) | Prevents surprise rewrites at deployment |
| macOS accel | Docling parser: `AcceleratorDevice.MPS` (layout + TableFormer). FastEmbed embedder: **CPU ONNX EP only** (CoreML EP not viable for bge-m3 XLM-RoBERTa under FastEmbed 0.8) | MPS accelerates the PyTorch parser path; embedder stays on CPU in dev. See `ubuntu_deploy_shadow.md` §4 |
| Ubuntu accel | Docling parser: `AcceleratorDevice.CUDA` (or CPU). FastEmbed embedder: **`fastembed-gpu==0.8.0` with `providers=["CUDAExecutionProvider","CPUExecutionProvider"]`**, requires CUDA 12.x + cuDNN 9.x. NOT TensorRT EP | State-of-the-art EP for bge-m3 under FastEmbed 0.8; TRT EP has dynamic-shape issues with this model |
| Memory hardening | Graph shape is *not* the memory lever — LangGraph state holds only paths (a few KB of dict-of-strings). What *does* control memory is per-node implementation discipline:<br>• **Per-doc streaming is the default** in every stage. No node builds a whole-folder list of `DoclingDocument` / chunks / vectors / points before writing. Parse → write `output/<stem>/parsed.json` → drop → next doc. Same pattern in chunk, enrich, embed, upsert.<br>• **Per-doc JSONL hand-off in enrich and embed.** `chunk_document` writes one `chunks.jsonl` per source doc inside that doc's `output/<stem>/` folder. `enrich_chunks` reads each doc's `chunks.jsonl`, runs the post-processors on the per-doc buffer, writes `output/<stem>/enriched_chunks.jsonl`. `embed_chunks` reads each `enriched_chunks.jsonl` the same way. Neither holds more than one doc's chunk list in RAM.<br>• **Batching (tunable via `.env`):** `EMBED_BATCH_SIZE=32` for `TextEmbedding.embed()` / `SparseTextEmbedding.embed()`; `UPSERT_BATCH_SIZE=64` for `client.upsert()`. Both flush to disk / Qdrant per batch.<br>• **Lazy-singleton pattern for heavy objects.** Docling `DocumentConverter` and FastEmbed `TextEmbedding`/`SparseTextEmbedding` are instantiated once per process via `_get_parser()` / `_get_embedder()` (same convention as `_get_llm()` / `_get_client()`). Not per-doc, not at module import.<br>• **Explicit free-points** between documents in `convert_document` and `initialpages_convert`: `del result; gc.collect()` after each parsed DoclingDocument is written to disk. Cheap elsewhere; worth it there because a parsed doctrine PDF is 100 MB–1 GB resident even at 10 pages.<br>• **Per-doc `embeddings.npz`.** `output/<doc_stem>/embeddings.npz` (one file per source doc) instead of a single per-folder `vectors.npz`. Matches the per-doc streaming discipline end-to-end; the upsert stage looks up each doc's .npz via `state["embeddings_paths"]`. State field: `embeddings_paths: dict[str, str]`.<br>• **Preserve stage-level rerun invariant.** Each node's disk output must be fully reconstitutable from upstream disk output so `python -m graph.nodes.<name> <folder>` stays meaningful. | Live memory = local vars within a running node. Real peak RAM comes from: DoclingDocument size, accidental whole-folder chunk lists, embedder weights (~3–5 GB), batch sizes. Per-doc streaming + JSONL + batching + singleton loads addresses each directly. |
| Upstream cache | **sha256-gated skip for every upstream stage** (added 2026-04-21). Every per-doc artefact (`initial_pages.md`, `parsed.json`, `diagnostics.json`, `chunks.jsonl`, `enriched_chunks.jsonl`, `embeddings.npz`) is fingerprinted with the source doc's sha256 in `output/<stem>/.stage_fingerprints.json`. Before doing its work, each of `initialpages_convert`, `convert_document`, `chunk_document`, `enrich_chunks`, `embed_chunks` compares the fingerprint to the current source sha256 and skips the heavy call when they match (no Docling, no chunker, no embedder). Gating is all-or-nothing: for stages that produce more than one artefact (e.g. `convert_document` writes parsed.json + diagnostics.json), every artefact must be fresh or the stage re-runs in full. A cache hit appends a `stage:cached` audit entry — treated as a non-failure alongside the existing `:skipped` convention so `ingestion_status` stays `ok`. Missing / malformed sidecar = cache miss (fail-safe). `FORCE_REPARSE=1` in `.env` (→ `cfg.force_reparse`) bypasses the gate end-to-end. Helpers live in `graph/fingerprints.py`. `upsert_to_qdrant` keeps its existing `doc_content_hash` gate against Qdrant payload — both gates are complementary (disk freshness vs. DB freshness). | Reason: reruns used to re-parse, re-chunk, and re-embed byte-identical documents end-to-end, turning a "nothing changed" rerun into a 20+ minute job. sha256 is the only correct freshness signal — we never trust mtime. Override rationale ("why not rely on mtime?"): editors can rewrite a file without changing its bytes, and `git checkout` can touch mtimes without changing content; only sha256 is reliable. |
| Indexing | Five concerns:<br>• **Dense vector index:** Qdrant HNSW, defaults only (`m=16`, `ef_construct=100`, RAM-resident). No tuning, no quantization in Phase 1.<br>• **Sparse vector index:** Qdrant inverted index with `modifier=Modifier.IDF` on the sparse vector config — **required**. FastEmbed `Qdrant/bm25` sets `requires_idf=True` (`libs/fastembed-0.8.0/fastembed/sparse/bm25.py:55`) and the model's own docstring states it is *"expected to be used with `modifier=\"idf\"` in the sparse vector index of Qdrant"* (`bm25.py:65`) with IDF *"computed on Qdrant's side"* (line 71). Without the modifier, scoring collapses from BM25 to TF-only.<br>• **Payload indexes (ingest collections, built immediately after `create_collection` and before the first upsert):** `source_doc` (KEYWORD), `chunk_type` (KEYWORD), `paragraph_number` (KEYWORD), `paragraph_numbers` (KEYWORD, list), `cross_refs` (KEYWORD, list). Five fields total.<br>• **Payload storage:** `on_disk_payload=True` at the collection level. Payload text stays on disk; vectors + indexes stay in RAM where search needs them.<br>• **Explicitly NOT doing in Phase 1:** no full-text index on `text` (sparse BM25 vector already covers lexical retrieval); no quantization (requires retrieval eval to validate recall trade-off); no tenant indexing (one-collection-per-folder makes `is_tenant` moot); no payload indexes on `heading_path`, `source_folder`, `doc_content_hash`, `page_numbers`, `chunk_index`, `expansion_hints`; no payload indexes on `_registry` yet. | Hot ingest path (`source_doc` query + delete-by-filter on every re-ingest cycle) plus the three doctrine lookup fields populated by `enrich_chunks` that we are already confident will be queried. `chunk_type` included because cardinality is tiny (body / table / figure_caption / glossary_entry) and the index is effectively free. Everything else deferred on the principle "index what we are confident will be queried, not what we might filter on later" — Phase 2 retrieval eval is the trigger for adding more. Creating indexes *before* first upsert avoids a full-collection rebuild pass. |
| Phase 2 retrieval (implemented 2026-04-22) | **Hybrid retrieval + cross-encoder rerank + layered query expansion, implemented end-to-end per [`referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md).** Synchronous `search(SearchRequest) -> SearchResponse` function under the new `graph/retrieval/` package — NOT a LangGraph node (retrieval is stateless, no `IngestionState` change). Stage A `embed_query` (dense via shared bge-m3 singleton; sparse via shared BM25 singleton — both call `query_embed()`, not `embed()`, so sparse query gets 1.0 weights and IDF is applied server-side) with glossary acronym expansion ON by default (lossless: rewrites `ACRO` → `ACRO (expansion)` so both surface forms land in BM25 + dense) and HyDE OFF by default (experimental; UI A/B toggle). Stage B `hybrid_search` uses Qdrant `query_points(collection, prefetch=[Prefetch(using="dense"), Prefetch(using="sparse")], query=FusionQuery(fusion=Fusion.RRF), query_filter=..., limit=top_n_in)`. Stage B′ (debug-only) issues two extra dense-only / sparse-only queries to recover per-retriever ranks — they are **not** in the fused response; `ScoredPoint` carries `score` only. Stage C reranks with **LOCKED** `BAAI/bge-reranker-v2-m3` via `TextCrossEncoder.add_custom_model()` pointing at `mogolloni/bge-reranker-v2-m3-onnx` (import `from fastembed.rerank.cross_encoder import TextCrossEncoder` — NOT top-level-exported; `.rerank()` returns a generator, caller must `list(...)`; fallback contingency = native `BAAI/bge-reranker-base` 1.04 GB, not wired by default). Stage D `apply_mmr` is an identity stub (deferred). Single-collection v1 (`_registry` enables multi-collection later). Testing UI: Streamlit single-file `ui/app.py`, local-only, debug mode ON by default; filters map 1-to-1 to the five Phase 1 payload indexes; collection picker reads `_registry` and shows **manifest count + live `points_count`** side-by-side with a warning badge on mismatch (R5 found the manifest can be stale). Qdrant facets (`client.facet(..., exact=False)`) for `source_doc` / `chunk_type` dropdowns (one RPC, server-side aggregation — NOT a full-collection scroll); bounded scroll for `cross_refs` prefix chips on collection change only. Cross-ref chip seed comes from `data/doctrine/cross_ref_prefixes.txt` (unified source since commit `a9d1ed9`), with newly-observed prefixes auto-appended to `data/eval/cross_ref_prefixes_unseen.txt` for dev review. Eval strategy is split: harvested 👍/👎 thumbs → `output/_eval/feedback.jsonl` (judged pool — usable for precision@k A/B only, NOT true Recall@k); curated hand-labeled `data/eval/gold_queries.jsonl` → future `scripts/eval_retrieval.py` for real MRR / Recall metrics (not yet authored). Payload schema alignment verified against Phase 1 source: `heading_path` is a joined **string**, not `list[str]`; `page_numbers` is `list[int]`. Qwen3 rerankers deferred entirely — NOT a ready `.env` swap. Shared-helper extraction: §10.5 Option B LOCKED — `_get_llm()` moved to `graph/shared/llm.py`; `_register_bge_m3_if_needed()` + `_get_dense_embedder()` + `_get_sparse_embedder()` moved to `graph/shared/embedders.py`; `graph/nodes/check_documents.py` and `graph/nodes/embed_chunks.py` updated to import from shared modules (strictly additive, behaviour-preserving). Qdrant `_get_client()` intentionally NOT extracted — parallel singleton in `graph/retrieval/registry.py` + `graph/retrieval/hybrid_search.py`. Spike R1/R2 confirmed reranker path, R3 confirmed `query_points` signature, R4 confirmed facet API, R5 confirmed `_registry` keys with manifest-vs-live caveat, R6 locked Option B, R7 resolved at top of `graph/retrieval/glossary.py` implementation. Additional Phase 2 surface not in the original design doc: `graph/doctrine_vocab.py` loader + external termbase under `data/doctrine/` (`acronyms.csv`, `classification_markings.txt`, `cross_ref_prefixes.txt`); LibreOffice intake normalization for legacy Office formats; `scripts/retrieval_smoke_test.py` read-only 8-check harness; `start.sh` one-command bring-up (colima → qdrant → `main.py` → Streamlit). | Two-stage hybrid-then-rerank is the 2026 RAG baseline, reuses every Phase 1 asset, preserves dev/prod parity on `bge-reranker-v2-m3` (CPU on M4, CUDA on Ubuntu), and stays honest about what's verified vs inferred. Consolidated into one design doc (not four) so review and iteration stayed coherent through the implementation phase. No Phase 1 decision reopened; Option B's two narrow additive edits (`check_documents.py`, `embed_chunks.py` shared-helper imports) are behaviour-preserving and every Phase 1 smoke test still passes. |
| Doctrine vocabulary (external termbase) | **Hand-editable doctrine vocab lives under `data/doctrine/`; loaded once per process by `graph/doctrine_vocab.py`.** Three files: `acronyms.csv` (UTF-8, schema `term,expansion,status,source,notes,updated_at` — `status` ∈ {approved, draft, deprecated}; deprecated rows ignored, empty status treated as approved; duplicate `term` keys = first-occurrence wins with one stderr warning); `classification_markings.txt` (one marking per line; `#` comments allowed; case-insensitive word-boundary match inside `classification_stripper`); `cross_ref_prefixes.txt` (one prefix per line; `#` comments allowed; consumed by `graph/post_processors/cross_ref_extractor.py` to build the dynamic regex AND by `ui/app.py` to seed the cross-ref filter chips — unified single source since commit `a9d1ed9`). **Merge precedence for acronyms at ingest + query time:** per-doc glossary definitions discovered by `graph/post_processors/glossary_splitter.py` WIN for that doc's own chunks / queries against that collection; the external CSV is authoritative for everything else. **Retrieval-side CSV edits take effect on the next query** — no re-ingest needed for the `graph/retrieval/glossary.py` expander, since it re-reads the external termbase via the doctrine-vocab fingerprint. Doctrine-aware cache invalidation: `enrich_chunks` / `embed_chunks` / `upsert_to_qdrant` stage fingerprints fold in the doctrine-vocab fingerprint so a `data/doctrine/*` edit invalidates just those three stages, not the upstream Docling parse (commit `81317d7`). | One editable surface for every downstream consumer. Keeps the doctrine knowledge in git-visible CSV/TXT (diffable, reviewable) instead of burying it in Python. The "per-doc glossary wins for that doc" rule preserves local publication intent without forking the global termbase. |
| Intake normalization (LibreOffice) | **Legacy Office formats (`.doc`, `.rtf`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.odt`) are normalized to Docling-readable formats via LibreOffice headless BEFORE the ingestion graph runs** (commits `ec33cbc`, `948bd87`). The supported-extensions list is centralized so `main.py`, `utils/file_reader.py`, and the smoke test stay in agreement. On macOS the converter binary is `/Applications/LibreOffice.app/Contents/MacOS/soffice`; on Ubuntu `apt install libreoffice`. Normalized output lands alongside the original in a temp path the graph then picks up. Failures are skip-and-log into `ingestion_errors` with `stage=intake_normalization`. | Docling's native format coverage is PDF / DOCX / TXT. Without this layer, a folder of legacy `.doc` files silently falls out of ingest. LibreOffice is the pragmatic converter: free, scriptable, reliable on the exact formats that hurt us. |
| Phase 2 runtime bring-up | **`start.sh` is the canonical one-command bring-up on macOS dev.** Preflight (`.env`, venv, streamlit, docker) → runtime (colima start, qdrant container start, wait for `/readyz`) → ingestion (`python main.py` — idempotent via the upstream sha256 cache) → UI (`streamlit run ui/app.py` on `UI_PORT=${UI_PORT:-8501}`). Flags: `SKIP_INGEST=1` (UI only), `NO_UI=1` (ingest only), `BOOTSTRAP=1` (first-time setup: create venv + `pip install -r requirements.txt`), `UI_PORT=...`. Safe to re-run: every step short-circuits if its target is already up. The script documents in-header that the per-doc LLM gate's prompt lives in `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT` so editing the gate is a one-file change followed by re-running `start.sh`. | Closing the laptop and re-running one command should bring the whole stack back — colima, qdrant, ingestion, UI. This is the shape of the daily dev loop. |
| Phase 3 generation (scoped 2026-04-22, pre-code; revisions 2026-04-22 post second review) | **Template-driven document generator under a NEW `graph/generation/` package (not yet written), consuming Phase 2 via `search()` only.** Produces four Arabic `.docx` per run: OPORD, Staff Estimates, Time Analysis, Initial Planning Guidance. Core idea: every schema field is classified into one of five kinds (`static`, `computed`, `input`, `derived`, `retrieved`); only `retrieved` fields invoke the LLM, and they are grouped **one LLM call per Pydantic class** (all retrieved fields in a class share one retrieval fan-out + one structured-output call + one narrow critique/re-draft). Expected ~8–12 LLM calls per 4-document run vs the old approach's ~15 megaprompts. Templates are YAML files (one per document) carrying BOTH structure (section order, headings, formatting) AND drafting instructions (per-group `prompt_ar`, query seeds, collections, filters) so porting to the user's separate health codebase is **rename-only** (field names + YAML entries). Locked decisions (D1–D10, §16 of [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)): 4 fixed templates; port the old Arabic renderer verbatim per user Q2; **single doctrine collection (`ingest__doctrine__bgem3`) with per-manual narrowing via `filters.source_doc` allowlists** — collection isolation is for corpus/domain isolation, not per-manual splitting (§6.4 of scoping doc, revised 2026-04-22); client-side union retained as the pattern for future multi-domain templates (no Phase 2 changes); English queries / English corpus / Arabic output via `bge-m3` + grounded-translation pass; `gpt-4o-mini` draft temp 0.2 + critique temp 0.0, upgradable via `.env`; citations as inline `[DOC §PARA]` tags → endnotes at document end; **.docx ONLY in v1 — PDF/TXT removed by user directive 2026-04-22**; rename-only port to health codebase (no feature flags); single consolidated scoping doc + narrow companion docs. **Second-review revisions (2026-04-22, §18 C8–C15 of scoping doc):** (1) retrieval merge is RRF-across-seeds + ONE final rerank on the merged pool, NOT "sort by rerank_score across seeds" — per-call rerank scores are not cross-seed-comparable; (2) Phase 3 has its own `graph/generation/llm.py` with `get_draft_llm()` and `get_critique_llm()`; `graph.shared.llm._get_llm()` is NOT used by Phase 3 because it is hardcoded `gpt-4o-mini` temp 0.0 and cannot honour per-call temperature overrides; (3) cache retracts the "byte-for-byte identical .docx" claim — `.docx` bytes are not deterministic (python-docx XML element ordering), so the cache layer is the assembled `GeneratedDocument` pydantic instance, not the rendered bytes; (4) expanded per-group cache key includes YAML file hash, YAML group block hash, model names, temperatures, retrieval toggles, and reranker model tag — every knob that can change output; (5) explicit citation-locator fallback chain (paragraph_number → paragraph_numbers[0] → deepest heading_path segment → "p. page_numbers[0]" → em-dash) — generation layer pre-resolves the tag BEFORE the LLM sees the chunk; (6) NewClasses.md is a REFERENCE, not an implementation source — real schema modules are clean Pydantic v2 (types only); (7) inputs.json shape authority is a Pydantic `Phase3Inputs` model; JSON-Schema is an auto-generated artefact written by `scripts/export_phase3_input_schema.py`; (8) new `SourcedHit` wrapper in `graph/generation/retrieval_group.py` carries originating `collection` on every hit (Phase 2 `SearchHit` does not). Two pre-code gates (§19): relax `SUFFICIENCY_CHECK_PROMPT` to topic-agnostic junk filter + author the four YAML templates. Post-acceptance migration directive (§7.4 of scoping doc, also reflected in §15 CLAUDE.md): **after v1 is accepted, all models (embedder, reranker, LLM) migrate to API endpoints over the internet** — current local hosting for bge-m3 + BM25 + `bge-reranker-v2-m3` is transitional. Phase 3 code must not hardcode local-runtime assumptions; migration surface is `.env` + existing `_get_*()` singletons. Four md files scope Phase 3: `referencedocs/18_phase3_generation.md` (authoritative — includes §18 C8–C15 audit trail for the second-review revisions), `referencedocs/19_phase3_arabic_renderer.md` (port guide), `referencedocs/20_phase3_templates_and_kinds.md` (YAML template spec + 5-kind taxonomy + worked examples — also revised 2026-04-22 with the RRF-across-seeds flow and optional `rerank_query_ar`), `docs/phase3_walkthrough.md` (project-level orientation). Pydantic schema mirror at repo-root `NewClasses.md`. Sample input at `data/phase3_inputs.example.json`. | Reuses Phase 2's `search()` seam cleanly; 5-kind dispatcher collapses old megaprompt pattern to ~8–12 grounded calls; YAML-as-data keeps structure + instruction paired for cross-domain port parity; renderer verbatim port respects user's hard-won Arabic typography. Second-review revisions close the merge / LLM-seam / cache / citation-fallback / inputs-schema / NewClasses-handling gaps surfaced before implementation. No Phase 1/2 source edits except one prompt constant in `graph/prompts.py` (§19.1). |

---

## Build State

**Phase 1 (ingestion).** All 7 ingestion nodes plus
`scripts/peek_qdrant.py` are committed on `main`. Per-stage disk
outputs are produced under `output/<doc_stem>/` and one Qdrant
collection per ingested folder is created as `ingest__<slug>__bgem3`
alongside the `_registry` manifest collection.

**Phase 2 (retrieval).** The full retrieval stack is committed on
`main`:
- `graph/retrieval/` — `schema.py`, `config.py`, `embed_query.py`,
  `glossary.py`, `hyde.py`, `hybrid_search.py`, `rerank.py`,
  `mmr.py`, `registry.py`, `search.py` (11 files including
  `__init__.py`). Each is runnable standalone:
  `python -m graph.retrieval.<name> [<collection>] "<query>"`.
- `graph/shared/` — `llm.py` (ChatOpenAI singleton, extracted from
  `graph/nodes/check_documents.py`), `embedders.py` (bge-m3
  registration + dense/sparse singletons, extracted from
  `graph/nodes/embed_chunks.py`). Option B per §10.5.
- `graph/doctrine_vocab.py` — external termbase loader (see
  "Doctrine vocabulary" row).
- `ui/app.py` — Streamlit dev UI (single file).
- `scripts/retrieval_smoke_test.py` — read-only, 8-check smoke
  test over a live collection (collection discovery, legacy-file
  coverage, acronym retrieval, cross-ref retrieval, natural-language
  retrieval, filter integrity, reranker impact, glossary impact).
- `data/doctrine/` — `acronyms.csv` + `classification_markings.txt`
  + `cross_ref_prefixes.txt`.
- `data/eval/cross_ref_prefixes_unseen.txt` — auto-appended by the
  UI when a new prefix is observed; dev promotes good ones into
  `data/doctrine/cross_ref_prefixes.txt`.
- `output/_eval/feedback.jsonl` — runtime-harvested 👍/👎 feedback
  (gitignored; see "Where Things Go" below).
- `start.sh` — one-command cold-boot (see row above).

Conventions preserved from Phase 1 into Phase 2:

- **Every module stays runnable standalone** —
  `python -m graph.nodes.<name> <folder>` for ingestion nodes and
  `python -m graph.retrieval.<name> <collection> "<query>"` for
  retrieval modules. This is the single biggest debugging-pain
  reducer; do not break it.
- **Inspect after every stage**: every artefact for a given
  ingested doc lives in `output/<doc_stem>/` (initial_pages.md,
  parsed.json, diagnostics.json, chunks.jsonl,
  enriched_chunks.jsonl, embeddings.npz, acronyms.json,
  errors.jsonl), plus the Qdrant dashboard at
  `localhost:6333/dashboard` and `python scripts/peek_qdrant.py`.
  For retrieval: the Streamlit UI's debug drawer surfaces
  per-retriever ranks, timings, expanded query, HyDE doc, and
  sanitized Qdrant request JSON; `python scripts/retrieval_smoke_test.py`
  gives an end-to-end health check.

---

## Pinned Versions (locked to what's in `venv/` now)

| Package | Version |
|---|---|
| Python | 3.12.13 |
| docling | 2.89.0 |
| docling-core | 2.74.0 |
| docling-ibm-models | 3.13.0 |
| docling-parse | 5.9.0 |
| fastembed | 0.8.0 |
| openai | 2.32.0 |
| qdrant-client | 1.17.1 |
| langgraph | 1.1.6 |
| langchain-openai | 1.1.14 |
| python-dotenv | (from existing requirements) |
| torch | 2.11.0 |
| torchvision | 0.26.0 |
| Qdrant server (Docker) | 1.17.1 (`qdrant/qdrant:latest`) |
| Docker runtime | colima 0.10.1 + docker CLI 29.4.0 |

Any upgrade requires: verifying compatibility, re-running end-to-end, updating this table.

---

## Infrastructure State

| Component | Status / How to check |
|---|---|
| Homebrew | `/opt/homebrew/bin/brew --version` |
| Python 3.12 | `/opt/homebrew/bin/python3.12 --version` |
| Project venv | `DecisionMakingSteps/venv/` — Python 3.12 |
| colima VM | `colima status` (start/stop with `colima start`/`colima stop`) |
| Qdrant container | `docker ps` — name `qdrant`, ports 6333/6334 |
| Qdrant dashboard | http://localhost:6333/dashboard |

---

## Three Critical Rules (Do Not Violate)

1. **Never pass filenames to the LLM.** Content-only decisions. `utils/file_reader.py` stores filenames for bookkeeping; callers must not forward them into an LLM call.
2. **Never instantiate LLM or OpenAI client at module level.** Use `_get_llm()` / `_get_client()` inside node functions so `load_dotenv()` runs first.
3. **`load_dotenv()` before any `graph/` imports.** Defensive practice even with `_get_*` pattern.

---

## Pre-deployment checklist — reasoning-model token caps

**WHEN GOING TO PRODUCTION WITH A REASONING MODEL** (Gemma 3 / Gemma 4 of any
size, GPT-o1, DeepSeek-R1, any "thinks before speaking" model), audit every
`max_output_tokens` cap in the code/env before turning the relevant path on.
Reasoning models burn ~1000+ tokens of hidden chain-of-thought BEFORE emitting
the visible answer; tight caps that work fine on non-reasoning models silently
produce zero text. The server returns `{"reasoning_only": true,
"reasoning_tokens": NNNN, "text_length": 0}` and `responses_client` raises
`produced no final text`.

**Audit command:** `grep -rn max_output_tokens --include="*.py" --include=".env*"`

**Known cap sites today (2026-04-28) and their reasoning-model status:**

| location | cap | safe with reasoning model? | action if turning ON with reasoning model |
|---|---|---|---|
| `graph/generation/*.py` (drafter, critique, extractor) | None (uncapped) | ✅ yes | nothing |
| `graph/retrieval/hyde.py` (`QUERY_EXPAND_HYDE_MAX_TOKENS`) | 256 | ❌ no | bump env var to ≥ 2048 |
| `graph/shared/responses_client.py:963,994` (internal smoke probes only) | 64 / 256 | n/a (dev paths) | nothing |
| `ui/tiered_search_tab.py` (dev tool only, never runs in prod) | 2048 | ✅ yes | nothing |

**Rule:** every time you swap to a reasoning model, run the `grep` above and
verify each cap leaves room for ~1500–2000 tokens of hidden reasoning PLUS
the visible answer. If not, bump it (recommended floor: 2048). The annotated
warning in `.env.example` next to `QUERY_EXPAND_HYDE_MAX_TOKENS` carries the
same guidance.

---

## Doc Index

### Active architecture (read in order)

**Phase 1 — ingestion (implemented, locked):**
- [`walkthrough.md`](walkthrough.md) — full pipeline walkthrough + ASCII flow diagram (§1–§7 ingestion, §8 retrieval)
- [`structure.md`](structure.md) — current layout, state fields, collection map
- [`referencedocs/01_architecture_overview.md`](../referencedocs/01_architecture_overview.md) — summary + design principles
- [`referencedocs/02_docling_parser.md`](../referencedocs/02_docling_parser.md) — parser API
- [`referencedocs/03_docling_hybrid_chunker.md`](../referencedocs/03_docling_hybrid_chunker.md) — chunker API
- [`referencedocs/04_qdrant_hybrid_search.md`](../referencedocs/04_qdrant_hybrid_search.md) — DB + hybrid query
- [`referencedocs/05_openai_embeddings.md`](../referencedocs/05_openai_embeddings.md) — dense (historical — current stack uses bge-m3 local)
- [`referencedocs/06_fastembed_bm25.md`](../referencedocs/06_fastembed_bm25.md) — sparse
- [`referencedocs/07_hybrid_search_theory.md`](../referencedocs/07_hybrid_search_theory.md) — why + how fusion works
- [`referencedocs/08_apple_silicon_mps_setup.md`](../referencedocs/08_apple_silicon_mps_setup.md) — MPS for M4
- [`referencedocs/09_doctrine_post_processors.md`](../referencedocs/09_doctrine_post_processors.md) — doctrine enrichment spec
- [`referencedocs/16_inspection_and_debugging.md`](../referencedocs/16_inspection_and_debugging.md) — how to see / debug stored data

**Phase 2 — retrieval (implemented, locked):**
- [`referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md) — **Phase 2 retrieval design (locked, implemented)** — single consolidated plan that drove implementation: `search()` contract, 4-stage pipeline, reranker decision (§7 locked to `BAAI/bge-reranker-v2-m3`), query expansion (§6 glossary ON / HyDE OFF), Streamlit UI (§9), eval strategy (§8), R1–R7 spike results (§11.1 — all resolved), §10.5 shared helpers (Option B locked)

**Phase 3 — generation (M0–M3 landed; v1 = MDMP Step 1):**
- [`phase3_walkthrough.md`](phase3_walkthrough.md) — **project-level overview** (read first in a fresh chat starting Phase 3 work)
- [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md) — **authoritative scoping doc** (locked decisions D1–D10, rollout milestones M0–M6, integration surface, `.env` additions, pre-code gates §19, explicit corrections §18)
- [`referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md) — renderer port guide (verbatim-preserved primitives from the user's old code per D2 + Q2 directive; `LEVEL_COUNTERS`-to-`ArabicDocumentContext` isolation refactor is the one allowed behaviour-preserving scope change)
- [`referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md) — YAML template spec + 5-kind taxonomy + worked examples per document + collection routing table + validation rules
- [`../NewClasses.md`](../NewClasses.md) — Pydantic schemas (doctrine-domain; 1-to-1 field mapping to the user's health-domain `prompt.txt` for rename-only cross-domain port)
- [`../data/phase3_inputs.example.json`](../data/phase3_inputs.example.json) — sample input JSON

### Alternatives / research (not active but available)
- [`referencedocs/10_alternatives_parsers.md`](../referencedocs/10_alternatives_parsers.md) — Marker, Unstructured, Nougat, LayoutParser, pymupdf
- [`referencedocs/11_alternatives_chunkers.md`](../referencedocs/11_alternatives_chunkers.md) — Chonkie, LangChain splitters, LlamaIndex
- [`referencedocs/12_alternatives_databases.md`](../referencedocs/12_alternatives_databases.md) — Weaviate, Milvus, pgvector, Chroma, LanceDB
- [`referencedocs/13_alternatives_sparse.md`](../referencedocs/13_alternatives_sparse.md) — SPLADE, BM42, miniCOIL upgrade path
- [`referencedocs/14_alternatives_dense_local.md`](../referencedocs/14_alternatives_dense_local.md) — BGE, E5, Jina, Nomic
- [`referencedocs/15_ocr_options.md`](../referencedocs/15_ocr_options.md) — EasyOCR, Tesseract, RapidOCR

### Portability
- [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md) — **PRIMARY** Ubuntu 22.04 LTS deployment shadow (prod target)
- [`transferOS.md`](transferOS.md) — broader portability notes (Windows / Linux / DGX Spark)

### Project orientation
- [`CLAUDE.md`](../CLAUDE.md) — entry point for Claude chats
- [`AGENTS.md`](../AGENTS.md) — entry point for Codex / other agents
- [`langgraphtopics.md`](langgraphtopics.md) — beginner LangGraph explainer

---

## Local Library Source (read instead of guessing)

- `libs/docling-2.89.0/` — Docling source
- `libs/qdrant_client-1.17.1/` — Qdrant client source
- `libs/fastembed-0.8.0/` — FastEmbed source
- `libs/sources/` — original .tar.gz files

**When answering questions about library behavior, read these before searching online.**

---

## Where Things Go

| Artefact | Path |
|---|---|
| Input documents | `inputs/<folder_name>/<doc>.{txt,pdf,docx}` — one sub-folder per Qdrant collection |
| Per-doc output folder | `output/<doc_stem>/` — contains every stage's artefact for that doc |
| Initial-pages markdown | `output/<doc_stem>/initial_pages.md` |
| Parsed Docling JSON | `output/<doc_stem>/parsed.json` + `output/<doc_stem>/diagnostics.json` |
| Chunks JSONL | `output/<doc_stem>/chunks.jsonl` (raw) + `output/<doc_stem>/enriched_chunks.jsonl` (post-processed) |
| Embeddings | `output/<doc_stem>/embeddings.npz` |
| Glossary sidecar | `output/<doc_stem>/acronyms.json` (only when doc has a glossary) |
| Per-doc errors | `output/<doc_stem>/errors.jsonl` (only when that doc hit any failure) |
| Folder-level errors | `output/_folder_errors.jsonl` (failures not tied to a specific doc) |
| Rejected-doc review | `output/not_enough/<folder_slug>/<safe_stem>/` — `check_decision.json` + copied `initial_pages.md` for docs the per-doc gate rejected; overwritten on every run |
| Stage fingerprint sidecar | `output/<doc_stem>/.stage_fingerprints.json` — flat `{artefact → sha256}` dict, consumed by every upstream stage's cache gate (see "Upstream cache" row) |
| Qdrant data | Docker volume `qdrant_storage` |
| Inspection script | `scripts/peek_qdrant.py` |
| Environment variables | `.env` (gitignored — Phase 1: `OPENAI_API_KEY`, `HF_TOKEN`, batch sizes, device flags, `COLLECTION_PREFIX`, `EMBEDDER_TAG`, `EMBEDDER_PROVIDERS`, `FORCE_REPARSE`; Phase 2 adds: `RERANK_MODEL=BAAI/bge-reranker-v2-m3`, `RERANK_MODEL_SOURCE=mogolloni/bge-reranker-v2-m3-onnx`, `RERANKER_PROVIDERS`, `RERANK_TOP_N_IN=50`, `RERANK_TOP_K_OUT=8`, `RERANK_BATCH_SIZE=64`, `HYBRID_DENSE_PREFETCH=50`, `HYBRID_SPARSE_PREFETCH=50`, `QUERY_EXPAND_ACRONYMS=on`, `QUERY_EXPAND_HYDE=off`, `QUERY_EXPAND_LLM_MODEL=gpt-4o-mini`, `QUERY_EXPAND_HYDE_MAX_TOKENS=256`, `HYDE_DOMAIN="military doctrine"`, `STREAMLIT_PORT=8501`, `EVAL_FEEDBACK_PATH=output/_eval/feedback.jsonl`) |
| Phase 2 design doc | [`referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md) — single consolidated plan (locked, drove implementation) |
| Phase 3 scoping docs | [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md) (authoritative), [`referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md), [`referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md), [`phase3_walkthrough.md`](phase3_walkthrough.md) — all scoped 2026-04-22, pre-code |
| Phase 3 Pydantic schemas (pre-code, source-of-truth) | [`../NewClasses.md`](../NewClasses.md) at repo root — doctrine-domain mirror of the user's health `prompt.txt`, with 1-to-1 field mapping table for rename-only port |
| Phase 3 sample input | [`../data/phase3_inputs.example.json`](../data/phase3_inputs.example.json) — one-operation JSON template; shape drives the `graph/generation/field_dispatcher.py` input-kind resolution |
| Phase 3 generation code | `graph/generation/` — M0–M3 landed (commit `5e2aaf0`); §C21 catalog consolidation 2026-04-23; **§C23 + §C24 Y-schema migration + nested layouts 2026-04-23**. Active modules: `template_loader.py`, `time_math.py`, `field_dispatcher.py`, `assembler.py`, `renderers/arabic_docx.py` (now with `_layout_y_time_analysis` / `_layout_y_initial_planning_guidance` / `_layout_y_staff_brief`), `retrieval_group.py`, `section_drafter.py`, `critique.py`, `cache.py`, `llm.py`, `prompt_extractor.py`, plus **`source_file_reader.py`** + **`source_file_extractor.py`** (§C23 new, two-file input path). Y-migrated docs own `prompts/<doc>/{schema,labels_ar,prompts_ar}.py` + `template.yaml`; legacy docs still use `graph/generation/schema/schemas.py` + `graph/generation/schema/field_catalog.py` + `graph/generation/prompts_ar.py` (§C21 surfaces). v1 active scope: **3 Y-migrated docs** (time_analysis, initial_planning_guidance, staff_brief) + warning_order on the legacy path pending Y schema. operation_order + staff_estimate still `v1_scope: false`. |
| Phase 3 YAML templates | `templates/{operation_order,staff_estimate,time_analysis,initial_planning_guidance}.yaml` — authored 2026-04-22 (M0.2). All four resolve to the single `ingest__doctrine__bgem3` collection with `filters.source_doc` allowlists per group. Manuals not yet ingested (ADP 4-0, ADP 5-0/FM 5-0, FM 3-09, FM 3-01, FM 6-02, FM 3-34, FM 3-39, ADP 6-0) appear in the allowlists but are elided at runtime per scoping-doc §6.4 until ingested. Spec in [`referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md) |
| Phase 3 output | `output/generated/<run_id>/<doc>.docx` — NEW parallel root to Phase 1's `output/<doc_stem>/`. Also `output/generated/<run_id>/.group_cache/*.json` for per-group LLM/retrieval caching |
| Phase 2 retrieval code | `graph/retrieval/` (11 modules), `graph/shared/` (2 modules), `graph/doctrine_vocab.py` |
| Streamlit dev UI | `ui/app.py` — local-only; launched by `start.sh` or `streamlit run ui/app.py` on `STREAMLIT_PORT` |
| Retrieval smoke test | `scripts/retrieval_smoke_test.py` — read-only, 8 orthogonal checks over a live collection |
| One-command bring-up | `./start.sh` — colima + qdrant + `main.py` ingest + Streamlit UI |
| Doctrine termbase | `data/doctrine/acronyms.csv`, `data/doctrine/classification_markings.txt`, `data/doctrine/cross_ref_prefixes.txt` (all committed — hand-editable) |
| Eval seed data | `data/eval/cross_ref_prefixes_unseen.txt` (committed placeholder, auto-appended by UI); `data/eval/gold_queries.jsonl` (not yet authored) |
| Harvested feedback | `output/_eval/feedback.jsonl` — one `{ts, query, collection, point_id, source_doc, paragraph_number, final_rank, verdict, request_snapshot}` line per 👍/👎 click; gitignored |

---

## Session Handoff — 2026-04-28 (§C34 — tiered retrieval search dev UI + reasoning-model cap note)

**Fresh chat: read this block first.**  Layered on top of §C33 — no
production code changed.  Adds a dev harness that drives the
production tiered-retrieval code path (`retrieve_group()`) with
arbitrary free-form queries plus a project-wide pre-deployment
checklist for reasoning-model token caps.

### What is true after this session

1. **`Phase 2 — Tiered Retrieval` tab is live.** Run
   `streamlit run ui/app.py` → click the new third tab.  Type any
   query, pick a policy, see verdict banner + per-tier hit tables
   with `[O:]` / `[D:]` tags.  Same `retrieve_group()` call as
   document generation — by design, no parallel implementation.
2. **Two opt-in extras inside the new tab:** deterministic shared-
   anchor view (no LLM) and one-click LLM synthesis (one Responses-
   API round-trip per click; `max_output_tokens=2048`).
3. **Reasoning-model token-cap audit checklist landed.**
   `.env.example` near `QUERY_EXPAND_HYDE_MAX_TOKENS=256` carries
   the inline warning; the master checklist lives above this block
   under "Pre-deployment checklist — reasoning-model token caps".
   Before swapping production to Gemma 3 / Gemma 4 / GPT-o1 /
   DeepSeek-R1 / any reasoning model, run
   `grep -rn max_output_tokens` and verify each cap leaves room for
   ~1500–2000 tokens of hidden reasoning + visible answer.  Floor:
   2048.
4. **Production unchanged.** No edits to `graph/`, no edits to
   YAML, no edits to `.env`.  Document generation behaves
   identically to the §C33 state.

### Acceptance — verified live

| query | policy | observed |
|---|---|---|
| `MDMP staff coordination` | `operationalfiles_then_doctrine` | strong verdict, no fallback, 8 `[O:]` / 0 `[D:]` |
| `إنتاج التقارير في مرحلة التخطيط` | `operationalfiles_then_doctrine` | weak verdict (1 distinct OF source), fallback fired, 8 `[O:]` / 8 `[D:]` |
| `mission command philosophy` | `all_channels` | both tiers populated, 3 shared-anchor groups (ADP-6-0 direct citation + shared xref, JP-1 shared xref) |
| `air defense coordination` | `all_channels` | both tiers populated, anchor view honestly says "no overlap" |

LLM synthesis smoke: 985-char prose with 5 inline `[O:]`/`[D:]`
citations plus AGREE / COMPLEMENT framing.  ~26 s wall-clock on
Gemma 4-e4b.

Offline architecture smokes unchanged: 45/45 PASS, 6/6 OK.

### Gotcha caught + fixed during smoke

Gemma 4-e4b is a reasoning model.  Initial `max_output_tokens=512`
on the synth call returned `{reasoning_only: true, reasoning_tokens:
1018, text_length: 0}` — visible answer starved.  Fix: bumped to
`2048`.  Same class of bug will hit any production cap that's not
generous enough for hidden chain-of-thought.  Pre-deployment
checklist above documents every cap site.

### Open items (incremental, not architecture)

- Fold the `PHASE3_TIERED_RETRIEVAL=0` kill-switch into the UI so a
  tester can compare tier-aware vs. legacy fast-path without
  editing `.env`.
- Calibrate the locked `(τ, k, m)` defaults (0.30 / 8 / 2) using
  the dev UI's threshold sweep against representative queries; the
  defaults may be conservative now that we have live rerank-score
  distribution data.
- Add a `source_files` channel exerciser to the UI — today
  `source_files_field_map={}` is hard-wired in `_build_spec`.
  Future: let the tester upload a small file and see `[S:]` tags.

### What to do first

```bash
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate
colima start ; docker start qdrant     # if not already up

# Launch the dev UI:
streamlit run ui/app.py
# → click the "Phase 2 — Tiered Retrieval" tab
# → try the sample queries in the "Try one of these" expander
# → tick the synthesis checkbox if you want prose summaries

# Re-run the offline architecture smoke any time:
python scripts/tiered_retrieval_smoke.py    # 45/45 PASS
```

If/when going to production with Gemma 3 / Gemma 4 / o1 / R1: read
"Pre-deployment checklist — reasoning-model token caps" above first
and bump `QUERY_EXPAND_HYDE_MAX_TOKENS` from 256 → 2048 in the
prod `.env` IF HyDE is enabled.

---

## Session Handoff — 2026-04-28 (§C33 — all three evidence channels live)

**Fresh chat: read this block first.**  Closes the §C32 open item
"Source-files channel has no live opt-in yet."  Tiered retrieval is
now feature-complete: every architectural channel has a live
end-to-end opt-in.

### What is true after this session

1. **`source_files` channel is live.**
   `prompts/initial_planning_guidance/template.yaml`'s
   `planning_directives` group declares `source_files_field_map:` on
   all 5 retrieved fields.  Live e2e produced **1 × `[S:]` + 9 ×
   `[O:]` + 1 × `[D:]`** citations with all three Arabic sub-headings
   in the rendered endnote (`ملفات مرفوعة من المستخدم` /
   `المصادر التشغيلية` / `المرجع العقيدي`) in canonical order.
2. **Placeholder filter in `build_evidence_bundle`.**
   `graph/generation/evidence.py` skips four pinned
   placeholder strings (extractor absent sentinel + 3 dispatcher
   placeholders) before constructing FactSnippets.  Whitespace-stripped
   match.  Prevents the drafter from seeing "غير متوفر في المدخلات"
   as a `[S:]`-citable fact when the per-doc extractor couldn't find
   a value in the uploaded source file.
3. **Architectural completeness.**  Every code path the tiered-retrieval
   plan introduced (Phase 0 through Phase 7, §C28→§C31, §C32, §C33) is
   now exercised end-to-end with real LLM + real Qdrant + real
   rendered `.docx` artefacts.  Subsequent work is breadth (other
   templates) and tuning (coverage thresholds), not architecture.

### Live run that validated everything

```bash
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs initial_planning_guidance \
    --out /Users/hextechkraken/Desktop/NewOutputs_tiered_v3

# initial_planning_guidance.docx — 43,955 B with all three sub-headings.
```

### Open items (incremental work, not architecture)

- **Other templates remain on two channels (operationalfiles + doctrine).**
  Adding `source_files_field_map:` keys to other groups is mechanical
  YAML work; smoke harness already covers the architecture.
- **Per-field source kind** — FactSnippet's `source_file_kind` defaults
  to empty; tag falls back to `[S: <field_name> §extracted]`.  Future
  extension noted in `evidence.py`.
- **Coverage threshold calibration** still pending per §C32 open
  items.

### What to do first

```bash
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate
colima start ; docker start qdrant

# Confirm everything still passes:
python scripts/tiered_retrieval_smoke.py        # 45/45 PASS
python -m graph.generation.evidence             # 4/4 OK
python -m graph.generation.template_loader     # 6/6 OK

# Open the latest output to see all three tiers:
open /Users/hextechkraken/Desktop/NewOutputs_tiered_v3/initial_planning_guidance.docx
```

---

## Session Handoff — 2026-04-28 (§C32 — tiered retrieval LIVE end-to-end)

**Fresh chat: read this block first.**  Below are the previous
handoff blocks (§C31 → §C28) which describe the architecture that
landed.  This block describes the moment tiered retrieval went live
in production for the first time.

### What is true after this session

1. **Doctrine reference library is ingested.**  21 PDFs from
   `inputs/doctrine/` produced `ingest__doctrine__bgem3` with
   **11,207 chunks** (`_registry` status `ok`).  15 of 21 docs
   cache-hit on prior fingerprints (Apr-21 sha256 unchanged); 6 new
   docs full-processed.  The §C28 deferred cleanup (step 0.10 + 0.11)
   ran in this session: stale `ingest__doctrine__bgem3` (2398 pts,
   duplicate-of-operationalfiles content) deleted, stale `_registry`
   entry deleted.
2. **First tier-aware YAML opt-in is live.**
   `prompts/initial_planning_guidance/template.yaml`'s
   `planning_directives` group declares
   `policy: operationalfiles_then_doctrine` +
   `doctrine_collections: [ingest__doctrine__bgem3]` on all 5
   retrieved fields.  Loader's per-group consistency invariant
   satisfied; `_is_tier_aware = True`; cache key reflects the new
   policy + doctrine collections.
3. **The Gemma drafter compliance issue is resolved.**
   `graph/shared/responses_client.py::_try_repair` rewritten with a
   two-step recovery: (a) a deterministic structural-lift heuristic
   (`_lift_nested_keys`) that handles Gemma's wrapper-key failure
   mode (`Draft_planning_directives` placing schema fields under
   `planning_guidebook` key) without an extra LLM round-trip; (b) a
   schema-as-text repair via strict json_schema with the
   `model_json_schema()` text inlined into the user prompt.  Both
   previously-parked failure cases (`Draft_planning_directives`
   under Responses=1 + `Draft_conclusions` under both modes) now
   complete cleanly.
4. **Renderer single-tier flat layout is enforced.**
   `arabic_docx.py::render_citations_section` line ~1909 now
   triggers sub-headings only when 2+ named tiers carry entries
   (`len(populated_tiers) > 1`).  Without this, the §C29 default
   `tier="operationalfiles"` on `SourcedHit` would leak a single
   `المصادر التشغيلية` sub-heading into pure-legacy templates —
   cosmetic regression vs the byte-equal pre-§C31 goal.
5. **Tiered-retrieval offline smoke harness exists.**
   `scripts/tiered_retrieval_smoke.py` — 45/45 PASS.  Pure offline
   (no Qdrant, no LLM); covers coverage gate, citation tags
   (emit + parse), `EvidenceBundle` assembly, `GroupCacheKey`
   invalidation, renderer endnote layout, and `retrieve_group`'s
   six-policy decision tree (mocking `_fan_out_search`).

### Live end-to-end run that validated everything

```bash
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/NewOutputs_tiered

# 4/4 .docx clean under LLM_USE_RESPONSES_API=1
#   time_analysis.docx                 41,569 B
#   initial_planning_guidance.docx     44,238 B   (tier-aware)
#   staff_brief.docx                   45,158 B   (legacy, flat citations)
#   warning_order.docx                 43,820 B
```

`initial_planning_guidance.fields.json` shows **11 × `[O:]` + 4 ×
`[D:]`** citations.  The doctrine fallback fired in-paragraph in
several seeds (operationalfiles fan-out gave the primary FM-5-0 hits
→ coverage gate said weak → doctrine fan-out picked up FM-3-98 +
FM-6-02 + FM-3-39 + ATP-3-21-8 + FM-3-90 + FM-3-34 + ATP-3-20-15 →
drafter blended both tiers into Arabic prose with tier-prefixed
citations).

`initial_planning_guidance.docx` rendered citation block:
- `الاستشهادات` → `المصادر التشغيلية` (15 entries from 4 MDMP
  manuals) → `المرجع العقيدي` (13 entries from the 21-doc doctrine
  library).
- No source-files sub-heading (none declared); no `مصادر` catch-all
  (every entry has a tier label).

`staff_brief.docx` rendered citation block:
- `الاستشهادات` → flat list of 14 entries.  Byte-equal pre-§C31
  layout (preserved by the renderer fix in (4) above).

### Open items (continue at any time)

- **Source-files channel (`[S:]` tags) has no live opt-in yet.**
  Author a group with `source_files_field_map: {drafter_field: extracted_key}`
  to exercise the third tier live.  Architecture supports it; only
  offline-tested via the smoke harness today.
- **Coverage thresholds are placeholders.**  `(τ=0.30, k=8, m=2)`
  picked as conservative-on-purpose defaults.  The doctrine fallback
  fired multiple times in this run (sensible behaviour); a formal
  calibration sweep against weak vs strong operationalfiles seeds
  would validate the tunings.
- **Other templates remain legacy.**  Only
  `initial_planning_guidance.planning_directives` opted in.
  `staff_brief.conclusions`, `operation_order.*`, `staff_estimate.*`
  still untouched.  Mechanical YAML edits when needed.
- **Streamlit Phase 3 tab not retested live this session.**  Uses
  the same dispatcher so should "just work," but unverified.
- **`docs/gemma_drafter_followup.md` is now stale.**  Its
  recommended action when fixed was "delete this file."  Not
  deleted by this session; user can decide.

### What to do first

```bash
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate
colima start ; docker start qdrant
curl -s http://localhost:6333/readyz   # all shards ready
curl -s http://localhost:1234/v1/models   # gemma + bge-m3 visible

# Confirm everything still passes:
python scripts/tiered_retrieval_smoke.py   # 45/45 PASS
python -m graph.generation.template_loader  # 6/6 OK
python scripts/smoke_y_schemas.py            # 4/4 OK

# Outputs from this session live at:
#   /Users/hextechkraken/Desktop/NewOutputs_tiered/      (initial run)
#   /Users/hextechkraken/Desktop/NewOutputs_tiered_v2/   (post renderer fix)
```

The four `.docx` plus `.fields.json` siblings are at both paths.
The `_v2` set has the renderer fix applied (legacy templates render
flat lists; tier-aware templates render three sub-headings).
Open `initial_planning_guidance.docx` to see the live tier-aware
endnote.

---

## Session Handoff — 2026-04-27 (§C31 — tiered retrieval Phases 5 + 6 + 7)

**Fresh chat: read this block first, then fall through to §C30 / §C29
/ §C28 below for the preceding tiered-retrieval cuts, then
[`tiered_retrieval_discussion.md`](../tiered_retrieval_discussion.md)
for the locked plan.**

### Status

Tiered retrieval architecture is **complete on disk**.  Phases 5+6+7
landed together this cut:
- **Phase 5** — `GroupCacheKey` extended with 8 fields capturing
  source-files provenance, tier policy, per-tier collection sets,
  field-map sha, coverage thresholds, and the kill-switch state.
  New `_canonical_sha256()` helper pins the canonicalization rule
  (sort_keys + NFC + stable JSON).
- **Phase 6** — renderer parses both `[<slug> §<locator>]` (legacy)
  and `[S/O/D: ...]` (tier-aware) citation shapes; conditional
  three-Arabic-sub-heading endnote layout; flat fallback when every
  entry is `tier="legacy"`.  `build_citation_tag()` gains
  `tier=`/`emit_prefixed=` kwargs (default off → legacy shape).
  `GeneratedDocument` gains `evidence_bundles: tuple[Any, ...] = ()`
  so the renderer can include FactSnippets in the citation endnote.
- **Phase 7** — `RetrievedField` accepts 5 optional YAML keys
  (`policy:` / `operationalfiles_collections:` /
  `doctrine_collections:` / `source_files_field_map:` /
  `coverage_thresholds:`); legacy YAML keeps producing today's
  resolved fields.  New `graph/generation/coverage.py` (pure
  arithmetic, three signals).  `retrieve_group` has a legacy
  fast-path (byte-equal output guaranteed) and a tiered path
  (six policies, conditional doctrine fan-out, prefixed citation
  tags).  Kill-switch `PHASE3_TIERED_RETRIEVAL=0` forces the legacy
  path for every group regardless of YAML opt-in.

### What changed at the user-visible level

**Nothing**, until a template author opts in via YAML.  Today every
shipped group resolves to `tier_policy="operationalfiles_only"`
(legacy fast-path) → identical retrieval, drafter, critique, and
renderer behaviour.  Verified in this session: 2/2 `.fields.json`
IDENTICAL across every Phase boundary (4 → 5, 5 → 6, 6 → 7).

### Acceptance run in this session

| check | result |
|---|---|
| `python -m graph.generation.template_loader` | 6/6 OK |
| `python scripts/smoke_y_schemas.py` | 4/4 OK |
| `python -m graph.generation.evidence` | 4/4 OK |
| `python -m graph.generation.cache` | 7/7 OK (canonicalization, env resolvers) |
| `python -m graph.generation.coverage` | 6/6 OK (verdict arithmetic + threshold resolver) |
| `python -m graph.generation.section_drafter` | 3/3 OK |
| `python -m graph.generation.critique` | 2/2 OK |
| Phase 4→5 e2e diff (time_analysis + warning_order) | 2/2 IDENTICAL |
| Phase 5→6 e2e diff | 2/2 IDENTICAL |
| Phase 6→7 e2e diff | 2/2 IDENTICAL |

The drafter / critique behaviour for retrieval templates was NOT
re-tested live this session because the parked Gemma+Pydantic
schema-compliance issue (see
[`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md))
still blocks `initial_planning_guidance.planning_directives` (under
Responses=1) and `staff_brief.conclusions` (under both modes).  The
`.fields.json` diff scope therefore covers the two source-extraction-
only docs that exercise the assembler / dispatcher / renderer end-
to-end without depending on the drafter LLM.

### How to turn tiered retrieval ON for a group

1. Pick a template's group YAML.  Add:
   ```yaml
   policy: operationalfiles_then_doctrine
   operationalfiles_collections: [ingest__operationalfiles__bgem3]
   doctrine_collections: [ingest__doctrine__bgem3]   # see "doctrine library" note below
   source_files_field_map:                             # optional
     enemy_axis_text: enemy_axis
   ```
2. Re-run `python -m graph.generation.template_loader` — should
   still report 6/6 OK.
3. Run end-to-end gen.  Cache invalidates only for the opted-in
   group (the new YAML keys flow into `GroupCacheKey`).  Other
   groups in the same template keep their legacy cache entries.
4. Inspect the rendered `.docx` — the citation endnote now has
   three Arabic sub-headings under `الاستشهادات` (`ملفات مرفوعة من
   المستخدم` / `المصادر التشغيلية` / `المرجع العقيدي`); empty
   channels are omitted.

### Doctrine library — what's needed

Phase 0 (§C28) freed the `doctrine` slug.  The future doctrine
reference corpus ingests through the existing Phase 1 pipeline:
1. `mkdir inputs/doctrine/`
2. Drop reference-library PDFs / docx / txt into it.
3. `python main.py` — Phase 1 produces
   `ingest__doctrine__bgem3` from the new folder.
4. List that collection under any group's `doctrine_collections:`
   key in YAML.

No code changes required.  Until the corpus is ingested,
`doctrine_collections: [...]` produces zero doctrine hits — the
operationalfiles tier still feeds the drafter, so output is
unaffected.

### Pending follow-ups (not part of tiered retrieval)

- **Gemma drafter Pydantic schema-compliance** — see
  [`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md).
  User parked: "leave the gemma error i will tell you when to fix
  it."
- **First live tier-aware template** — none exist yet.  Authoring
  one is the natural next step to exercise the doctrine fallback /
  coverage gate end-to-end.
- **Doctrine reference library content** — user-owned.  Code is
  ready; corpus is the dependency.

---

## Session Handoff — 2026-04-27 (§C30 — tiered retrieval Phases 3 + 4)

**Fresh chat: read this block first, then §C29 / §C28 below for the
preceding tiered-retrieval cuts, then
[`tiered_retrieval_discussion.md`](../tiered_retrieval_discussion.md)
for the locked plan.**

### Status

Phases 3 + 4 of the tiered-retrieval plan landed together (locked-plan
rule).  Drafter ([`graph/generation/section_drafter.py`](../graph/generation/section_drafter.py))
and critique ([`graph/generation/critique.py`](../graph/generation/critique.py))
now consume `EvidenceBundle`; the dispatcher
([`graph/generation/field_dispatcher.py`](../graph/generation/field_dispatcher.py))
builds the bundle once per group and passes the same instance to
both LLM calls.

Behavior-preserving for every legacy template by construction:
when the bundle is operationalfiles-only (`source_files_evidence ==
() and doctrine_evidence == ()`), both modules take a fast-path
that emits the pre-§C30 system prompt and pre-§C30 user prompt
verbatim.  Cache keys do not change; cached drafts from §C29 still
hit on the next run.

When the bundle has any non-operationalfiles channel populated
(Phase 7+), drafter switches to the tiered system prompt with the
typed-evidence drafting rules, and critique switches to the typed-
evidence faithfulness rule (mission-specific entities require
`source_files` OR `operationalfiles` support; doctrine alone vouches
only for definitions / standards / procedures / conceptual framing).

### Acceptance run in this session

| check | result |
|---|---|
| `python -m graph.generation.template_loader` | 6/6 OK |
| `python scripts/smoke_y_schemas.py` | 4/4 OK |
| `python -m graph.generation.evidence` | 4/4 smoke OK |
| `python -m graph.generation.section_drafter` | 3/3 format smoke OK |
| `python -m graph.generation.critique` | 2/2 format smoke OK |
| Byte-equal legacy chunk block (drafter + critique) | confirmed offline |
| `time_analysis.fields.json` vs Phase 1+2 baseline | IDENTICAL |
| `warning_order.fields.json` vs Phase 1+2 baseline | IDENTICAL |
| `extracted_inputs.json` vs Phase 1+2 baseline | IDENTICAL |

The drafter / critique behaviour for retrieval templates was NOT
re-tested live this session because the parked Gemma+Pydantic
schema-compliance issue (see
[`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md))
still blocks `initial_planning_guidance.planning_directives` (under
Responses=1) and `staff_brief.conclusions` (under both modes).  The
byte-equal legacy-prompt evidence is the strongest offline guarantee
of behavior preservation for retrieval templates.

### What's left in tiered retrieval

- **Phase 5** — extend `GroupCacheKey` with `source_evidence_sha256`,
  `source_files_sha256_pairs`, plus the v5-listed tier-policy /
  collections / coverage-threshold tags.  Document canonicalization
  (sorted keys, NFC, stable JSON) in `cache.py`'s docstring.  Pure
  cache-layer work; no LLM, no Qdrant, no YAML.
- **Phase 6** — renderer learns both untagged and `[S/O/D: ...]`
  citation shapes; conditional three-sub-heading endnote layout.
  `retrieval_group.py::build_citation_tag` gains tier-aware emission
  gated on tier-aware YAML keys (still needs Phase 7 to flip it on).
- **Phase 7** — YAML tier policies go live: `policy:` /
  `operationalfiles_collections:` / `doctrine_collections:` /
  `source_files_field_map:` / `coverage_thresholds:`; loader infers
  `policy=operationalfiles_only` for legacy templates; coverage gate
  fires conditional doctrine fallback.  `_template_has_source_evidence_consumers()`
  flips to inspect groups for tier-aware keys (currently returns
  `False` unconditionally per §C29).  This is the ONLY phase that
  turns user-visible behaviour on.

### Pending follow-ups (not part of tiered retrieval)

- **Gemma drafter Pydantic schema-compliance** — see
  [`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md).
  User parked: "leave the gemma error i will tell you when to fix
  it."  Phase 5+ work is independent and can land first.

---

## Session Handoff — 2026-04-27 (§C29 — tiered retrieval Phases 1 + 2)

**Fresh chat: read this block first, then the §C28 block below for
Phase 0 context, then [`tiered_retrieval_discussion.md`](../tiered_retrieval_discussion.md)
for the locked plan.**

### Status

Phases 1 + 2 of the tiered-retrieval plan landed as a behavior-
preserving refactor:
- `SourcedHit` gained `tier: Literal["operationalfiles", "doctrine"]
  = "operationalfiles"` (additive).
- `run_retrieval_phase` accepts a new `extracted_values` kwarg (forward-
  compat plumbing; unused pre-Phase-7).
- The assembler now runs `extract_for_document()` BEFORE
  `run_retrieval_phase()` when the template needs source-files
  evidence.  New helper `_template_has_source_evidence_consumers()`
  returns `False` until Phase 7 introduces tier-aware YAML keys.
- New module [`graph/generation/evidence.py`](../graph/generation/evidence.py)
  defines `FactSnippet`, `EvidenceBundle`, and a pure-function
  `build_evidence_bundle()` builder.  Nothing consumes the new types
  until Phase 3+4 (drafter + critique migrate together).

### Acceptance run in this session

| check | result |
|---|---|
| `python -m graph.generation.template_loader` | 6/6 OK |
| `python scripts/smoke_y_schemas.py` | 4/4 OK |
| `python -m graph.generation.evidence` | 4/4 smoke OK |
| `time_analysis.fields.json` vs Phase 0 baseline | IDENTICAL |
| `warning_order.fields.json` vs Phase 0 baseline | IDENTICAL |
| `extracted_inputs.json` vs Phase 0 baseline | IDENTICAL |

The diff scope was deliberately the two source-extraction-only docs
(no drafter LLM call); together they exercise the full assembler
reorder through `extract_for_document()` and prove the LLM-call
order flip is invisible at the resolved-fields level.  The parked
Gemma+Pydantic drafter issue (see
[`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md)) was
not retested — it's orthogonal to Phases 1+2.

### What's left in tiered retrieval

- **Phase 3 + 4 (must ship together)** — drafter consumes
  `EvidenceBundle` with three labelled prompt blocks; critique gains
  the typed-evidence faithfulness rule.  Until Phase 7 toggles tier
  policies on, `source_files_evidence` and `doctrine_evidence` stay
  empty for legacy templates so the prompt + critique reduce to
  today's behaviour.  Pure
  `graph/generation/{section_drafter,critique}.py` work.
- **Phase 5** — extend `GroupCacheKey` with source-files provenance
  (`source_evidence_sha256`, `source_files_sha256_pairs`, plus the
  v5-listed tier-policy / collections / coverage-threshold tags).
- **Phase 6** — renderer learns both untagged and `[S/O/D: ...]`
  citation shapes; conditional three-sub-heading endnote layout.
- **Phase 7** — YAML tier policies go live: `policy:` /
  `operationalfiles_collections:` / `doctrine_collections:` /
  `source_files_field_map:` / `coverage_thresholds:`; loader infers
  `policy=operationalfiles_only` for legacy templates; coverage gate
  fires conditional doctrine fallback.  `_template_has_source_evidence_consumers()`
  flips to inspect groups for tier-aware keys.

### Pending follow-ups (not part of tiered retrieval)

- **Gemma drafter Pydantic schema-compliance** — see
  [`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md).
  User parked: "leave the gemma error i will tell you when to fix it."
  Phase 3+4 work is independent and can land first.
- **Phase 0 close-out steps** still optional — old `ingest__doctrine__bgem3`
  Qdrant collection retained as safety net per user; project status
  line at top of this file already updated to flag the rename as
  plumbing-verified.

---

## Session Handoff — 2026-04-27 (§C28 — tiered retrieval Phase 0)

**Fresh chat: read this block FIRST.  Then read
[`tiered_retrieval_discussion.md`](../tiered_retrieval_discussion.md)
(locked plan v5) and
[`tiered_retrieval_implementation.md`](../tiered_retrieval_implementation.md)
(execution handoff) before touching anything in `graph/generation/`.**

### Status

Phase 0 of the tiered-retrieval plan is **plumbing-verified end-to-end**
in this session:
- Folder renamed (`inputs/doctrine/` → `inputs/operationalfiles/`).
- 4 active YAMLs updated (61 occurrences) + 6/6 templates validate.
- Re-ingested with all 5 cacheable stages on cache (only Qdrant
  upsert did work); new collection `ingest__operationalfiles__bgem3`
  has **2398 points**, identical per-source breakdown to the old
  collection (FM-5-0=1145, FM-6-0=678, ADP-5-0=342, ADP-2-0=233).
- Retrieval smoke **20 PASS / 0 FAIL** against the new collection.
- End-to-end Phase 3 generation produced **3/4 .docx** cleanly:
  `time_analysis.docx`, `initial_planning_guidance.docx`,
  `warning_order.docx`.  `staff_brief.docx` blocked by a separate
  Gemma+Pydantic schema-compliance issue (out of Phase 0 scope —
  see "Out-of-scope follow-up" below).

**Still pending** for Phase 0 to be marked fully complete:
- Step 0.10: drop old `ingest__doctrine__bgem3` (2398 points
  retained as rollback path).
- Step 0.11: clean `_registry` of the stale entry (currently 2
  points: old + new).
- Project status line at the top of this file + the §C28 note in
  CLAUDE.md to drop the qualifier.

These last three are deferred to explicit user OK because the old
collection is destructive to remove.

### What changed on disk this session

| change | detail |
|---|---|
| folder rename | `inputs/doctrine/` → `inputs/operationalfiles/` (contents untouched: FM-6-0, FM-5-0, ADP-5-0, ADP-2-0) |
| YAML refs (4 files, 61 occurrences) | `ingest__doctrine__bgem3` → `ingest__operationalfiles__bgem3` in [`prompts/initial_planning_guidance/template.yaml`](../prompts/initial_planning_guidance/template.yaml), [`prompts/staff_brief/template.yaml`](../prompts/staff_brief/template.yaml), [`templates/operation_order.yaml`](../templates/operation_order.yaml), [`templates/staff_estimate.yaml`](../templates/staff_estimate.yaml) |
| no edits | `prompts/time_analysis/template.yaml` + `prompts/warning_order/template.yaml` (zero retrieval refs — all `computed` / `source_file_extracted`) |
| no edits | legacy shadowed `templates/initial_planning_guidance.yaml` + `templates/staff_brief.yaml` (per §C23 `resolve_template_path()` precedence — the locked Phase 0 list intentionally omits them) |
| no edits | `graph/generation/` (Phase 0 is pure rename + YAML, by locked-plan rule) |
| docs | this Session Handoff block + a §C28 changelog block at the top of [`CLAUDE.md`](../CLAUDE.md) |

### What the next session must do (Phase 0 acceptance)

```bash
# Pre-flight
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate
colima start && docker start qdrant
curl -s http://localhost:6333/readyz       # all shards are ready
curl -s http://localhost:1234/v1/models    # gemma-4-e4b + bge-m3 + bge-reranker-v2-m3

# Re-ingest — caches should hit on every per-doc stage; only upsert does real work
python main.py
# Expected log: "stage:cached" lines for initialpages_convert / convert_document /
#               chunk_document / enrich_chunks / embed_chunks per doc.
# Expected new collection: ingest__operationalfiles__bgem3
# Expected old collection: ingest__doctrine__bgem3 (still present, deletion deferred)

# Parity (counts must match)
python scripts/peek_qdrant.py ingest__operationalfiles__bgem3
python scripts/peek_qdrant.py ingest__doctrine__bgem3
# Expected total per collection: 2398 points
#   FM-5-0  = 1145, FM-6-0  = 678, ADP-5-0 = 342, ADP-2-0 = 233 (forced-OCR per §C19)

# Retrieval smoke against the new collection (auto-discovered via _registry)
python scripts/retrieval_smoke_test.py
# All 8 checks must pass.

# End-to-end generation (cache miss expected — operationalfiles_collections_tag changed)
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/phase0_post_rename
# Expected: 4/4 .docx + 4 *.fields.json + extracted_inputs.json + run_sources.json
# source_file_extracted fields should be deterministic (extractor temp 0.0).
# Retrieved-paragraph drafts may drift from the Apr-23 NewOutputs/ baseline because
# the LLM endpoint changed (LM Studio) AND the cache is invalidated by the rename.
# That is acceptable per the locked plan — what matters is no missing-collection errors.

# Once verified — destructive, do AFTER the smoke passes:
python -c "from qdrant_client import QdrantClient; QdrantClient('localhost', port=6333).delete_collection('ingest__doctrine__bgem3'); print('deleted')"
# Then clean _registry of the stale entry (optional — _registry skips missing collections)
python -c "from qdrant_client import QdrantClient; c = QdrantClient('localhost', port=6333); print([p.payload for p in c.scroll('_registry', limit=20)[0]])"

# Then update CLAUDE.md project status line + this Session Handoff to drop the
# "partially landed" qualifier and mark Phase 0 complete.
```

### Out-of-scope follow-up flagged in this session

**`staff_brief.conclusions` drafter fails Pydantic validation under Gemma.**
The `with_structured_output` call for `Draft_conclusions` returns a
shape Gemma chose (correct fields scattered between top-level and a
nested wrapper key) that does not match `extra="forbid"`.  Reproduces
under BOTH `LLM_USE_RESPONSES_API=1` (Responses path) AND
`LLM_USE_RESPONSES_API=0` (chat-completions path) — so it is a
schema-compliance issue with the Gemma model on this LM Studio build,
not a Responses-API issue and not a Phase 0 regression.
`initial_planning_guidance.planning_directives` has the same root
cause but only fires under `=1`; under `=0` it works (verified this
session).  Both groups retrieve correctly against the renamed
collection — the drafter receives chunks before the validation dies
— so the rename is verified for the retrieval path independently of
the drafter compliance issue.

`.env` `LLM_USE_RESPONSES_API` reverted to `1` (the locked default
per §C26); the `=0` flip was a diagnostic, not a new default.

**Possible mitigations** (decide before Phase 1 lands; Phase 1 is
purely additive `graph/generation/` work and can land without this
fix):
- Loosen `extra="forbid"` on the drafter draft classes (and
  post-filter) so Gemma's "wrong-but-adjacent" shape is salvageable.
- Add a Gemma-specific repair prompt in `responses_client.py` that
  includes the schema explicitly + the prior failed output.
- Use the per-role override `PHASE3_DRAFT_MODEL` to swap drafter
  to a more compliant model (the env wiring already exists).
- Pin OpenAI key for the drafter role only and keep LM Studio for
  embedder + extractor.

### Known cautions

- **Cache invalidation is one-time and expected.**  The rename flips
  `operationalfiles_collections_tag` (the YAML group hash) so every
  retrieved group rebuilds.  Don't read the cache miss as a regression
  — flag it in the commit message instead.
- **`source_file_extracted` fields are byte-stable across the rename**
  (verified: `time_analysis.docx` 41569 B unchanged; extractor
  temperature = 0.0).  Drift there in a future run is a real bug;
  investigate before proceeding.
- **Retrieved-paragraph drift is acceptable.**  LLM nondeterminism +
  cache miss + LLM endpoint change since Apr 23 = expected variation.
  Eyeball for sense, not for byte-equality.  `initial_planning_guidance.docx`
  43576 B (this session) vs 43226 B (Apr-23 baseline) is in this band.
- **The old collection is the rollback path** until step 0.10 fires.
  Keep it around through smoke.
- **The Apr-23 `/Users/hextechkraken/Desktop/NewOutputs/` baseline is
  not LLM-comparable** — it was generated against the pre-§C26 LLM
  endpoint.  Useful only for spot-checking field shape and Arabic
  formatting; not for diff parity.

### Why this matters for the rest of tiered retrieval

After Phase 0 lands cleanly, the `doctrine` slug is free.  The future
doctrine reference library will ingest into `inputs/doctrine/` →
`ingest__doctrine__bgem3`, leaving the operational corpus at
`ingest__operationalfiles__bgem3`.  Both names then describe what the
collection actually holds — eliminates the inversion that motivated
the rename.  Phases 1–7 (the actual tiered-retrieval feature build)
are all `graph/generation/`-only edits and don't require another
re-ingest.

### Commit landed before this session

`b9ec94e docs: tiered retrieval — locked plan v5 + implementation handoff`
brought [`tiered_retrieval_discussion.md`](../tiered_retrieval_discussion.md)
and [`tiered_retrieval_implementation.md`](../tiered_retrieval_implementation.md)
under version control.  The two files are the source of truth for
naming, flow, phase order, drafter/critique typed-evidence rules, and
the 8 don'ts.  Read them before opening `graph/generation/` in a
future session — and before relitigating any of the locked decisions.

---

## Session Handoff — 2026-04-24 (late — env configured for live LM Studio)

**Fresh chat: read this block FIRST, then the §C26 block below.**  No code
changed in this pass; only `.env` + `.env.example` were updated.  The repo
is now live-configured for the current dev box and documents the offline
deployment as a commented reference.

### Current working configuration (active in `.env`)

LM Studio running on `http://localhost:1234` is the LLM + dense-embedder
provider.  The reranker stays on FastEmbed (in-process ONNX) because this
host's LM Studio build has NOT been confirmed to expose `/v1/rerank`.

```ini
OPENAI_API_KEY=lm-studio

LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=lm-studio
LLM_MODEL=google/gemma-4-e4b
LLM_USE_RESPONSES_API=1

EMBED_PROVIDER=http
EMBED_BASE_URL=http://localhost:1234/v1
EMBED_API_KEY=lm-studio
EMBED_MODEL=text-embedding-bge-m3

RERANK_PROVIDER=fastembed
```

All per-role LLM overrides (`PHASE1_GATE_MODEL`, `QUERY_EXPAND_LLM_MODEL`,
`PHASE3_EXTRACTOR_MODEL`, `PHASE3_DRAFT_MODEL`, `PHASE3_CRITIQUE_MODEL`)
are blank — they inherit `LLM_MODEL=google/gemma-4-e4b` via the factory
fallback chain.  Everything else (Qdrant, Docling device, FastEmbed ONNX
EPs, batch sizes, OUTPUT_DIR, collection naming, FORCE_REPARSE, OCR,
HF_TOKEN) is unchanged from the 2026-04-22 ingest state.

### What a fresh session should test first

The user's intent after this handoff is to verify the live setup end-to-end
from a new chat.  Recommended order:

1. **LM Studio discovery**
   `curl -sS http://localhost:1234/v1/models | jq '.data[].id'`
   Expect `google/gemma-4-e4b` and `text-embedding-bge-m3` (or whatever
   two ids LM Studio currently serves).  If the ids differ, update
   `LLM_MODEL` / `EMBED_MODEL` in `.env` to match.
2. **Factory wiring**
   `python -m graph.shared.llm_factory` → "Responses API: True",
   `LLM_BASE_URL=http://localhost:1234/v1`, resolved endpoint tag.
   `python -m graph.shared.embedders` → `provider=http`, endpoint tag.
3. **Live embedder probe** (new this session, was not run under §C26)
   `python -m graph.shared.embedders probe "sample"` against LM Studio.
   Expect a 1024-dim L2-normalised vector.  No network timeouts.
4. **Retrieval smoke** (against the existing Qdrant corpus ingested under
   FastEmbed)
   `colima start && docker start qdrant && ./scripts/retrieval_smoke_test.py --max-glossary 3 --max-cross-refs 3`
   Watch for a cosine-parity warning between the dev query embedder (now
   HTTP bge-m3 GGUF) and the stored vectors (FastEmbed ONNX).  If score
   rankings diverge noticeably, follow the §C26 migration order:
   parity-probe → re-ingest before continuing.
5. **Phase 3 generation** (cache will miss on `llm_endpoint_tag` flip)
   `python scripts/generate_documents.py --warning-order data/phase3_prompt_2.example.txt --intel-report data/phase3_prompt_3.example.txt --source-file other=data/phase3_prompt_1.example.txt --docs time_analysis initial_planning_guidance staff_brief warning_order --out /Users/hextechkraken/Desktop/NewOutputs_lmstudio`
   Expect 4/4 `.docx` + 4 `*.fields.json` as under §C25, now sourced from
   Gemma via LM Studio Responses API.

### Known-risk checklist (carry forward)

- **LM Studio `/v1/rerank` not confirmed.**  Reranker stays FastEmbed.
  Flip to `RERANK_PROVIDER=http` only after a `curl` POST to
  `http://localhost:1234/v1/rerank` returns the standard results shape.
- **bge-m3 GGUF vs ONNX parity unverified.**  The Qdrant corpus was
  ingested under FastEmbed ONNX.  HTTP bge-m3 may drift — probe parity
  or re-ingest per §C26 before trusting retrieval scores.
- **Gemma Responses-API compliance varies.**  If
  `with_structured_output` fails on extraction, the escape hatch is
  `LLM_USE_RESPONSES_API=0` in `.env` — do NOT commit that flip; it's a
  diagnostic, not a new default.

### Offline-machine configuration (documented, not active)

The offline Linux box may serve LLM, embedder, and reranker from
different IPs, ports, and API keys.  Supported by configuration only —
no code changes.  The canonical reference block (concrete IP example)
now lives at the bottom of `.env` and in the "WORKED EXAMPLES (B)"
section of `.env.example`:

```ini
# Offline machine example — reranker on separate server/IP
RERANK_PROVIDER=http
RERANK_BASE_URL=http://192.168.1.50:7997/v1
RERANK_API_KEY=<token>
RERANK_MODEL=<exact model id returned by GET http://192.168.1.50:7997/v1/models>

# If the server exposes /rerank at the root instead of /v1/rerank, use:
# RERANK_BASE_URL=http://192.168.1.50:7997
```

Rules documented inline in `.env.example`:
1. `GET /v1/models` is discovery-only — it does not rerank.
2. Rerank inference must exist at `/v1/rerank` OR `/rerank` on the
   target server — one must actually respond to POST.
3. `RERANK_BASE_URL` is the parent URL.  The app appends `"/rerank"`
   literally (so the `/v1` suffix matters).
4. `RERANK_MODEL` must be the exact id that server's `/v1/models`
   returns.  No fuzzy matching.

### Files touched this pass

| file | change |
|---|---|
| [`.env`](../.env) | Rewritten to the LM Studio live config above.  `OPENAI_API_KEY` replaced from a real `sk-proj-…` key to the `lm-studio` placeholder.  Added the offline commented reference block with `192.168.1.50:7997` example. |
| [`.env.example`](../.env.example) | Reranker comment rewritten with 4-rule simple-wording explanation (`/v1/models` discovery vs `/rerank` inference).  WORKED EXAMPLE (B) now uses the concrete `192.168.1.50:7997` IP instead of placeholders. |
| [`CLAUDE.md`](../CLAUDE.md), [`AGENTS.md`](../AGENTS.md) | Matching env-pass changelog note. |
| [`docs/memory.md`](memory.md) | This block. |

No Python / YAML / Streamlit / scripts touched.  All §C26 invariants hold.

### Security note

The previous `.env` had a live `OPENAI_API_KEY=sk-proj-…` committed to
the local file (not git — `.env` is gitignored).  It was replaced with
the `lm-studio` placeholder per user directive.  If that key has been
pasted anywhere outside the working directory, rotate it at
`platform.openai.com`.  `HF_TOKEN` remains live — rotate if similarly
exposed.

---

## Session Handoff — 2026-04-24 (§C26 — provider-based model routing)

**Fresh chat: read this block first, then fall through to the 2026-04-22
block below for prior Phase 1 / Phase 2 / Phase 3 context.**

### What changed in this session

Provider-based model routing implemented end-to-end. LLM, dense embedder,
and reranker can each be swapped between in-process FastEmbed and any
OpenAI-compatible HTTP server (LM Studio, Infinity, TEI, llama.cpp
server, offline Linux box) by editing `.env` only. BM25 stays
in-process forever (it's an algorithm, not a model).

### Locked decisions (copied to top of this file — source of truth there)

- Every `ChatOpenAI` routes through `POST /v1/responses` via
  `use_responses_api=resolve_use_responses_api()` (default ON).
  `LLM_USE_RESPONSES_API=0` is an escape hatch for a local model that
  cannot serve Responses — NOT a silent-fallback knob.
- Verified: `langchain-openai==1.1.14` routes
  `self.root_client.responses.create(...)` at base.py:1485 when the
  flag is True. No chat-completions path at primary call sites.
- Dense embedder branches on `EMBED_PROVIDER` (fastembed / http).
  HTTP path = `HttpDenseEmbedder` (urllib, `POST /v1/embeddings`,
  defensive L2-normalisation).
- Reranker branches on `RERANK_PROVIDER` (fastembed / http).
  HTTP path = `HttpReranker` (Cohere/Jina/Infinity/TEI shape, accepts
  `score` as alias for `relevance_score`). Raises `RerankUnavailable`
  on failure; `graph/retrieval/search.py` catches it and degrades to
  RRF-only — retrieval never hard-fails on rerank outage.
- Cache provenance: `llm_endpoint_tag`, `llm_use_responses_api`,
  `embed_provider`, `embed_endpoint_tag`, `rerank_provider`,
  `rerank_endpoint_tag` all folded into `GroupCacheKey`.

### Files touched this session

| file | change |
|---|---|
| [`graph/shared/llm_factory.py`](../graph/shared/llm_factory.py) | NEW — central resolver (base URL / API key / model / Responses-API flag / endpoint tag). `build_chat_llm()` passes `use_responses_api=True` by default. |
| [`graph/shared/llm.py`](../graph/shared/llm.py) | Rebuilt on top of factory. `_LLM_MODEL` alias preserved for HyDE compatibility. |
| [`graph/generation/llm.py`](../graph/generation/llm.py) | `draft_config`/`critique_config`/`extractor_config` route through factory. `_get_configured_llm` keyed on `(model, temp, endpoint_tag)`. |
| [`graph/retrieval/hyde.py`](../graph/retrieval/hyde.py) | `_resolve_hyde_model()` goes through shared fallback chain; reuses Phase 1 singleton when models match, else builds via factory. |
| [`graph/shared/embedders.py`](../graph/shared/embedders.py) | Provider branch + `HttpDenseEmbedder` class + standalone `probe` diagnostic. |
| [`graph/retrieval/rerank.py`](../graph/retrieval/rerank.py) | Provider branch + `HttpReranker` class + `RerankUnavailable` exception. |
| [`graph/retrieval/search.py`](../graph/retrieval/search.py) | Catches `RerankUnavailable`, logs, continues with RRF-only ordering. |
| [`graph/generation/cache.py`](../graph/generation/cache.py) | Added six new fields to `GroupCacheKey`. |
| [`.env.example`](../.env.example) | Full provider surface — `LLM_*`, `EMBED_*`, `RERANK_*`, `LLM_USE_RESPONSES_API`. Re-ingest warning documented inline. |
| [`main.py`](../main.py), [`start.sh`](../start.sh), [`ui/phase3_tab.py`](../ui/phase3_tab.py) | Wording + routing updates so nothing implies OpenAI-only or chat-completions-only. |

### Env surface (definitive list)

```ini
# LLM
LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_USE_RESPONSES_API=1
# Per-role LLM overrides (precedence: role → LLM_MODEL → code default)
PHASE1_GATE_MODEL
QUERY_EXPAND_LLM_MODEL
PHASE3_EXTRACTOR_MODEL, PHASE3_DRAFT_MODEL, PHASE3_CRITIQUE_MODEL

# Dense embedder
EMBED_PROVIDER=fastembed|http   # alias: lm_studio = http
EMBED_BASE_URL, EMBED_API_KEY, EMBED_MODEL

# Reranker
RERANK_PROVIDER=fastembed|http  # alias: lm_studio = http
RERANK_BASE_URL, RERANK_API_KEY, RERANK_MODEL

# Unchanged (still required):
OPENAI_API_KEY  # placeholder like "lm-studio" is fine when using LM Studio
```

### Verification run this session (what passed / what was not run)

Passed:
- `python -m graph.generation.template_loader` → 6/6 OK
- `python scripts/smoke_y_schemas.py` → 4/4 OK
- `python -m graph.shared.llm_factory` → Responses API ON, endpoint tag resolved
- `python -m graph.generation.llm` → all three config triples resolve
- `python -m graph.shared.embedders` → provider + endpoint tag resolved
- Standalone `python -m graph.retrieval.rerank` / `hyde` → usage line
- Simulated `LLM_BASE_URL=http://localhost:1234/v1 + EMBED_PROVIDER=http + RERANK_PROVIDER=http` → factory yields `HttpDenseEmbedder` + ChatOpenAI instance carrying `base_url + use_responses_api=True`
- Rerank HTTP failure → `RerankUnavailable` raised (verified by pointing `RERANK_BASE_URL` at a dead port)
- langchain-openai source check: `use_responses_api=True` → `ChatOpenAI._use_responses_api({}) == True` → routes via `root_client.responses.create(...)` at base.py:1485

Not run (require live services not available in this session):
- Actual `POST /v1/embeddings` probe against LM Studio
- Actual `POST /v1/rerank` probe
- `scripts/retrieval_smoke_test.py` (needs Qdrant + ingested corpus)
- End-to-end `scripts/generate_documents.py` against LM Studio

### Remaining risks (surface early in next session if user flips provider)

1. **LM Studio `/v1/rerank` may not exist** on older builds. Safe fallback is `RERANK_PROVIDER=fastembed` (no code change) or an Infinity sidecar (still uses the HTTP abstraction). The `HttpReranker` class is backend-agnostic by design.
2. **bge-m3 GGUF vs ONNX parity is unverified.** Flipping `EMBED_PROVIDER=http` on a corpus that was ingested under `fastembed` requires either parity verification (cosine > 0.9999 on normalised vectors) or a full re-ingest. Migration order: reranker (no re-ingest) before embedder (re-ingest-sensitive).
3. **Gemma Responses API compliance** varies across LM Studio builds. If structured-output fails, temporarily set `LLM_USE_RESPONSES_API=0` to isolate protocol-vs-model.
4. **Some users already downloaded** `gpustack/bge-m3-GGUF` and `gpustack/bge-reranker-v2-m3-GGUF` in LM Studio. Those are the right models; whether LM Studio exposes `/v1/embeddings` (yes) and `/v1/rerank` (build-dependent) determines whether they're reachable today.

### What to do first in the next session

1. Read the "LOCKED DECISION — provider-based model routing" block at the very top of this file.
2. Skim [CLAUDE.md](../CLAUDE.md) §C26 changelog.
3. If the user wants to go live on LM Studio: confirm LM Studio is running (`curl http://localhost:1234/v1/models`); set `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` in `.env`; run `python -m graph.shared.llm_factory` to confirm endpoint routing; then regenerate a Phase 3 doc through the CLI (cache will miss because `llm_endpoint_tag` changes).
4. If the user wants to flip the embedder/reranker: set `EMBED_PROVIDER=http` / `RERANK_PROVIDER=http` with the corresponding `_BASE_URL` / `_API_KEY` / `_MODEL`. Probe parity for embedder BEFORE running retrieval against an existing corpus.
5. Only touch BM25 / Qdrant / Phase 1–2–3 core logic if the user explicitly asks — none of it changed this session.

---

## Session Handoff — 2026-04-22

**This section exists so a fresh chat can pick up exactly where the
previous session stopped.** Read it in full before touching anything.

### Where we are

- **Phase 1 is complete and locked.** Don't reopen its decisions.
- **Phase 2 retrieval is IMPLEMENTED and committed on `main`.**
  The full stack — `graph/retrieval/` (11 modules),
  `graph/shared/{llm, embedders}.py`, `ui/app.py`,
  `scripts/retrieval_smoke_test.py`, `start.sh`,
  `data/doctrine/` termbase + `graph/doctrine_vocab.py` loader,
  LibreOffice intake normalization — all landed. The last
  committed Phase 2 work is `1f5d0dd` (`feat: add start.sh`).
- **All seven R1–R7 spikes resolved.** R1–R5 in §11.1; R6
  locked to Option B (shared helpers under `graph/shared/`);
  R7 resolved at the top of `graph/retrieval/glossary.py`.
- **§7 reranker LOCKED** to `BAAI/bge-reranker-v2-m3` via
  `TextCrossEncoder.add_custom_model()` pointing at
  `mogolloni/bge-reranker-v2-m3-onnx`. `BAAI/bge-reranker-base`
  is the documented fallback (not wired).
- **§10.5 LOCKED** to Option B. `check_documents.py` and
  `embed_chunks.py` import from `graph/shared/` — strictly
  additive, behaviour-preserving.
- **Phase 3 (template-driven document generation) is SCOPED
  (pre-code) + REVISED 2026-04-22 post-second-review.** Four md
  files scope it:
  [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)
  (authoritative; §18 C8–C15 holds the second-review audit trail),
  [`referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md),
  [`referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md)
  (revised §5.3 merge walkthrough + optional `rerank_query_ar`),
  [`phase3_walkthrough.md`](phase3_walkthrough.md). Pydantic
  schemas in [`../NewClasses.md`](../NewClasses.md) (reference
  only — see §18 C13). Sample input at
  [`../data/phase3_inputs.example.json`](../data/phase3_inputs.example.json).
  Decisions D1–D10 locked in §16 of the scoping doc; §18
  explicit corrections C1–C15 (C8–C15 are the second-review
  revisions — do not revert). Two pre-code gates (§19):
  (1) relax `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT` from
  topical filter to pure junk filter; (2) author the four YAML
  templates. Post-acceptance directive (§7.4): all models
  migrate to API endpoints after v1 acceptance.
- **Second-review revision summary (binding):**
  (a) retrieval merge is **RRF-across-seeds + ONE final rerank**
  on the merged pool (per-call `rerank_score` is NOT cross-seed-
  comparable; this is the single most important design fix);
  (b) Phase 3 uses its own `graph/generation/llm.py`, NOT the
  shared `_get_llm()` (hardcoded at `gpt-4o-mini`/temp 0.0);
  (c) `.docx` bytes are NOT deterministic — cache the assembled
  `GeneratedDocument` pydantic instance, not the rendered file;
  (d) expanded cache key includes YAML/prompt/model/temp/toggles/
  reranker-model-tag;
  (e) citation-locator fallback is pre-resolved by the generation
  layer (`paragraph_number` → `paragraph_numbers[0]` → deepest
  `heading_path` segment → `"p. " + page_numbers[0]` → `"—"`);
  (f) `NewClasses.md` is a reference, not code — real schema
  modules are clean Pydantic v2 (types only);
  (g) inputs JSON-Schema is generated from a Pydantic
  `Phase3Inputs` model, not hand-maintained;
  (h) new `SourcedHit` wrapper carries originating `collection`
  on every hit for provenance, debug, and citation traceability.
- **Third-review revision C16 (binding, 2026-04-22 post-M2):**
  **Input surface is now a free-form prompt, not `inputs.json`.**
  User authors `prompt.txt`; an upstream extractor LLM call
  (`graph/generation/prompt_extractor.extract_inputs`) with
  temperature 0.0 produces a validated `Phase3Inputs` via
  `.with_structured_output(Phase3Inputs)`. The rest of Phase 3
  runs unchanged — `Phase3Inputs`'s shape is preserved; only its
  source moved. A `--inputs-json` escape hatch preserves the old
  shape for debugging / regression. CLI persists the extracted
  instance to `output/generated/<run_id>/extracted_inputs.json`
  as the audit trail. Cache key gains three components
  (`user_prompt_sha256`, `extractor_model`,
  `extractor_temperature`); runs on the two CLI paths do not
  cache-collide. The new `PHASE3_EXTRACTOR_MODEL` /
  `PHASE3_EXTRACTOR_TEMPERATURE` env vars default to
  `gpt-4o-mini` / `0.0`. See §18 C16 of the scoping doc.
- **Tenth-review revision C23 (binding, 2026-04-23): Y-schema migration +
  two-file input surface.** Three Phase 3 documents (time_analysis,
  initial_planning_guidance, staff_brief) migrated to flat Y-approved
  Pydantic schemas under `prompts/<doc>/`; warning_order left as-is pending
  Y schema. New `source_file_extracted` field kind reads the user's Warning
  Order + Intel Report + optional extras via
  `graph/generation/source_file_extractor.py` (one structured-LLM call per
  doc) + `source_file_reader.py` (Docling `.docx/.pdf/.txt` reader). New
  `static_placeholder` kind. Three approved Arabic placeholders guarantee
  no empty strings in `.fields.json` — dispatcher enforces the invariant.
  `.fields.json` now flat for single-class templates (matches Y). Two-file
  CLI surface: `--warning-order` + `--intel-report` + repeatable
  `--source-file kind=path`. Legacy `--prompt-*` / `--prompt` / `--inputs-json`
  preserved. Per-doc catalog overlays (`labels_ar.py` + `prompts_ar.py`)
  take precedence over the legacy project-wide catalogs. `TEMPLATE_ID_TO_SCHEMA_MODULE`
  intentionally routes Y-migrated docs to `prompts.<doc>.schema` and legacy
  docs to `graph.generation.schema.schemas` — don't collapse. Smoke:
  `python scripts/smoke_y_schemas.py` → 3/3 OK.
- **Tenth-review revision C24 (binding, 2026-04-23): Y-structured nested
  renderer layouts.** Three new layouts — `y_time_analysis`,
  `y_initial_planning_guidance`, `y_staff_brief` — replicate the OLD
  generator's level-1/2/3/4 hierarchy + 5-column timeline table from
  `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt §6`. The
  `y_time_analysis` + `y_initial_planning_guidance` layouts share
  `_render_y_time_allocation_block()` so the 5-col table definition stays
  single-source; table rows come from existing
  `PlanningAllocation.table_rows_ar`. `y_staff_brief` emits five underlined
  section-headers (A. تقدير الاستخبارات والبيئة, B. تقدير العمليات, C.
  تقدير الأفراد, D. التقدير اللوجستي, E. الاستنتاجات العملياتية) each
  resetting the level-1 counter. Each migrated YAML declares `layout:
  y_<doc>` and drops its per-section `heading:` block.
- **Sixth-review revision C19 (binding, 2026-04-22 post-C17): OCR
  retry plan-B landed; ADP 2-0 rescued.** The failure on the 2019 ADP
  2-0 PDF (Adobe InDesign CC 2015 → Distiller 15.0 produced a font
  with a broken ToUnicode CMap; text layer extracts as Caesar-29-
  shifted garbage) triggered a new two-pass gate.  When
  `check_documents` rejects a doc with a remark matching `\b(garbled|
  garbage|corrupt(ed)?|unreadable|gibberish|encoded|cipher|nonsense|
  unintelligible|illegible|mojibake)\b` — OR the preview has <40 %
  ASCII-letter ratio on ≥500 chars — the pipeline retries the
  first-10-pages probe with `TesseractCliOcrOptions(force_full_page_ocr
  =True)`, writes `initial_pages_ocr.md` (independent of the original
  preview), and re-scores the LLM gate.  On accept, the doc is tagged
  `needs_full_ocr=True` so `convert_document` goes STRAIGHT to the
  Tesseract full-page-OCR converter for the full parse — the
  thin-page escalation cannot catch broken text layers because no
  bitmap is present.  Per-folder budget capped by
  `OCR_RETRY_MAX_PER_FOLDER` (default 5).  OCR language controlled by
  `OCR_LANGS` (default `eng`; future Arabic corpus: `eng+ara`).
  Requires Tesseract on PATH — Homebrew installed at
  `/opt/homebrew/bin/tesseract`.  New shared module
  `graph/docling_converters.py` holds both converter builders so
  `initialpages_convert`, `check_documents` (via
  `ocr_retry_preview`), and `convert_document` share one definition.
  **Post-fix ingest state:** 4/4 accepted, 2398 points total, ADP 2-0
  = 233 chunks via forced OCR.  Full design in
  [`docs/pdf_failure_fallback_plan.md`](pdf_failure_fallback_plan.md).
- **Fifth-review revision C18 (binding, 2026-04-22 post-C17): gate
  re-tightened from topic-agnostic to MDMP-topical.** Under C17 the
  corpus is deliberately MDMP-focused (FM 6-0 / FM 5-0 / ADP 5-0 /
  ADP 2-0) and v1 only targets Step 1 outputs, so the M0.1 loosening
  (which was designed to let sustainment / signal / aviation / CBRN
  manuals pass when the corpus spanned 21 tactics manuals) was no
  longer the right shape.  The gate now accepts: MDMP itself, staff
  organization, orders and plans (OPORD / WARNO / FRAGO), commander
  activities (intent, CCIR / PIR / FFIR / EEFI), operations process,
  IPB / IPOE, Army tactical manuals whose procedures feed planning,
  and joint doctrine that parallels any of the above.  It rejects:
  clearly non-military material (cookbooks, marketing, social media),
  non-doctrinal military ephemera (uniform regs, ceremony scripts),
  empty / placeholder pages, and non-military-operations technical
  material.  Rejection remarks for unreadable content are required
  to include a keyword from the C19 classifier list so the OCR-retry
  loop fires reliably.  See `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT`
  (HISTORY block lists M0.1 and C18 explicitly).
- **Fourth-review revision C17 (binding, 2026-04-22 post-M3-code):**
  **v1 scope cut from 4 documents to 2 — MDMP Step 1 only.** v1
  ships Time Analysis + Initial Planning Guidance (WARNO) only.
  OPORD (Step 7 output) and Staff Estimates (Steps 2–6) are
  deferred to v2 because bundling them into a Step 1 package
  would encode the wrong step's assumptions. The M3 retrieval /
  drafting / critique / cache code (commit `5e2aaf0`) stays on
  disk — correct under C17, just not exercised by the v1 CLI.
  `templates/staff_estimate.yaml` and `templates/operation_order.yaml`
  gain a top-level `v1_scope: false` flag; `scripts/generate_documents.py`
  filters `--docs` against the v1 set (out-of-scope templates log
  and skip). **Doctrine corpus swapped in the same revision:** the
  21 tactics manuals previously in `inputs/doctrine/` (FM 3-0,
  FM 3-90, ATP 3-21-8, etc.) archived to
  `/Users/hextechkraken/Desktop/NatoDocs/` (user-chosen, outside
  the repo); replaced with MDMP-focused manuals (FM 6-0, FM 5-0,
  ADP 5-0, ADP 2-0). **User runs the Qdrant rebuild manually**
  after the swap (the ingest pipeline's hash gate does not
  reconcile removed docs, so a drop + re-ingest is required):
  `docker exec qdrant curl -X DELETE http://localhost:6333/collections/ingest__doctrine__bgem3`
  then `python main.py`. See §18 C17 of the scoping doc.
- The Phase 2 design doc
  [`referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md)
  is the locked rationale and history. §12 "Explicit Corrections
  vs Earlier Drafts" still applies — rejected ideas (17/18/19/20
  split, glossary-only eval, "free" dense/sparse ranks from a
  fused query, `.env`-swap Qwen3 path, HyDE as locked default)
  must not be resurrected.

### 2026-04-23 — §C25 (Warning Order Y migration + doc-1-mirror layout)

**Latest binding revision — read this first if picking up a fresh session.**

User directive: close the remaining Y-migration gap — render the Warning Order
to a Y-approved flat schema backed by `/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf`
(50 fields, each with an inline English explanation) AND match the OLD
generator's doc-1 hierarchy from `/Desktop/ToTransfer/New Text Document.txt`
lines 939–1152 (the field-count match: old doc 1 uses ~40 of the 50 Y keys).

#### What changed — sources of truth

- **Fourth Y-migrated document now live under `prompts/warning_order/`** with
  the same four-file layout as the other three (`schema.py` / `template.yaml`
  / `labels_ar.py` / `prompts_ar.py`). No shared edits to the universal
  instructions module.
- `warning_order` — flat `WarningOrder` with **50 Y keys** (header / header2..4,
  Assembly_Area, letter_ref_number*, References, Maps, time_zone, task_assembly,
  Appendices, Viewports, situation, area_interest, operations_area, terrain,
  weather, civil_considerations, CIVILIAN_CONSIDERATIONS, enemy_forces,
  friendly_forces, gov_and_nongov_org, local_authorities, red_crescent,
  Attached_and_Detached_units, Operational_Assumptions, GROUND_COMPONENT_MISSION,
  Exc_command_purp, Concept_of_operations, Units_Duty, Duties_of_Other_*,
  Timings, Commanders_Crtitical_Information_Requirements, Fire_support_coordination,
  Air_support_coordination, Risk_assy, ROE, Other_coordination_{media,meeting,
  Excu,movm}, Sustainment, ACCS, date_time, mission_of_supporting_unit,
  join_op_{mission,purp,how,ops_desired_end}). **All 50 are
  `source_file_extracted`** — the WARNO is a scenario-fact directive, no
  doctrine retrieval wired in.
- **Per-field Pydantic `Field(description=...)` bodies are lifted verbatim
  from the RTF** so `with_structured_output` surfaces the user's own
  field-explanations to the extractor LLM even independent of the prompt catalog.
- **New `y_warning_order` renderer layout** (`graph/generation/renderers/arabic_docx.py`)
  mirrors old doc 1: bism → `add_arabic_header` (today Hijri+Gregorian) →
  `letter_ref_number2` centred underlined → scenario `date_time` paragraph →
  References / Maps / time_zone / task_assembly as plain paragraphs →
  5 LEVEL-1 blocks (الموقف / مهمة المكون البري / التنفيذ / الإدامة /
  القيادة والسيطرة) with nested LEVEL-2/3 for sub-items → 6 SPLITTER call
  sites (friendly_forces, Attached_and_Detached_units, Operational_Assumptions,
  Units_Duty, Duties_of_Other_*, ROE, Other_coordination_Excu,
  Commanders_Crtitical_Information_Requirements, Sustainment) → "أقرّوا:"
  approval block (3 military signature lines) → `add_level_one_ML` for
  Appendices → `add_level_one_SHFAF` for Viewports.
- **Typos preserved verbatim** from Y: `Commanders_Crtitical_Information_Requirements`
  (Crtitical) and `Other_coordination_movm` (movm). Smoke test's inline key
  set asserts them.

#### Template loader changes

- `TEMPLATE_ID_TO_SCHEMA_MODULE["warning_order"]` → `prompts.warning_order.schema`.
- `TEMPLATE_ID_TO_CATALOG_MODULES["warning_order"]` →
  `("prompts.warning_order.labels_ar", "prompts.warning_order.prompts_ar")`.
- `resolve_template_path("warning_order")` now prefers
  `prompts/warning_order/template.yaml` over `templates/warning_order.yaml`
  (legacy file kept on disk but superseded).

#### Smoke

- `python -m graph.generation.template_loader` → 6/6 templates OK.
- `python scripts/smoke_y_schemas.py` → **4/4** docs pass Y-key parity + no
  empty values. `warning_order` uses `Y_INLINE_KEYS` (the RTF source isn't
  JSON-parseable; inline set mirrors the RTF's 50 keys).
- End-to-end against Qdrant + OpenAI — 4/4 `.docx` + 4 `*.fields.json` at
  `/Users/hextechkraken/Desktop/NewOutputs/`. WARNO = 43 213 B.

#### Do NOT (§C25)

- Don't collapse `y_warning_order` away from the old-doc-1 hierarchy. Section
  order + SPLITTER call sites are load-bearing.
- Don't "fix" the Y typos `Crtitical` / `movm` — they're part of the Y
  contract.
- Don't strip the RTF-sourced `Field(description=...)` bodies from
  `prompts/warning_order/schema.py`.
- Don't add doctrine retrieval to WARNO without an explicit user ask. Today:
  extractor → ABSENT_SENTINEL → `PLACEHOLDER_NOT_IN_INPUTS_AR`.

---

### 2026-04-23 — §C23 + §C24 (Y-schema migration + two-file surface + nested layouts)

Earlier in the same session — preserved for context.

User directive: `/Users/hextechkraken/Desktop/y/*.txt` are the *canonical*
output shapes for three documents. Migrate Phase 3 to match Y exactly; keep
retrieval; replace the manually-written three-prompt surface with a two-file
upload workflow (Warning Order + Intel Report + optional extras); guarantee no
empty strings in final output; match the OLD generator's paragraph / level /
table hierarchy from `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt §6`.

#### What changed — source of truth

- **Three Y-migrated documents live under `prompts/<doc>/`** with four files
  each (`schema.py` / `template.yaml` / `labels_ar.py` / `prompts_ar.py`) plus
  a shared `prompts/_universal_instructions_ar.py` (reusable extraction
  discipline, no scenario-specific facts).
- `time_analysis` — flat `TimeAnalysis` with **10 Y keys** (`time_Y`,
  `mission_start`, `total_available_time`, `allocated_planning_time`,
  `available_time_for_subordinate_units`, `time_for_mission_receipt`,
  `time_for_development`, `time_for_mission_analysis`, `time_for_plan`,
  `time_now`). 9 fields are `computed` via `time_math.*`; `time_now` is
  `source_file_extracted` from the Warning Order.
- `initial_planning_guidance` — flat `InitialPlanningGuidance` with **18 Y
  keys** (same 10 timing fields + 8 planning directives). Directives split
  between `source_file_extracted` (CCIR/PIR, FFIR, ROE) and `retrieved`
  (doctrine — `report_production`, `coordination_duties`,
  `authorized_movements`, `staff_duties`, `times_locations_planning`).
- `staff_brief` — flat `StaffBrief` with **53 Y keys**. Dominant kind is
  `source_file_extracted` (49 of 53 fields pull from Intel Report / Warning
  Order); 4 conclusion fields (`Effect_of_Weather_and_Terrain_on_Operations`,
  `Human_Force_Conclusions`, `Supply_Conclusions`, `Operational_Conclusions`)
  are `retrieved` from doctrine so framing stays grounded.
- **`warning_order` left unchanged** pending a Y schema from the user. Its
  existing `templates/warning_order.yaml` + `graph/generation/schema/schemas.py`
  classes still load and generate correctly via the legacy path.

#### New field kinds

Added to the `FieldSpec` discriminated union in `template_loader.py`:

| kind | resolver | notes |
|---|---|---|
| `source_file_extracted` | `graph/generation/source_file_extractor.py` | One LLM call per doc. `YAML.source_hint: warning_order \| intel_report \| either` steers the extractor. Returns `"غير موجود في الملفات"` literal when absent — dispatcher substitutes one of the three approved placeholders. |
| `static_placeholder` | YAML literal value | Only for fields where neither source file nor doctrine retrieval can legitimately supply content. |

Existing kinds untouched: `static` / `computed` / `input` / `derived` /
`retrieved` all still work.

#### New input surface

```bash
python scripts/generate_documents.py \
    --warning-order /path/to/warning_order.docx \
    --intel-report  /path/to/intel_report.pdf \
    --source-file   other=/path/to/extra.txt \     # repeatable
    --out /Users/hextechkraken/Desktop/NewOutputs
```

Supports `.docx` / `.pdf` / `.txt` / `.md` via `graph/docling_converters.py`
(the existing Phase 1 singleton). Length cap `PHASE3_SOURCE_FILE_MAX_CHARS`
(default 48 000) with an Arabic audit-notice appended when a file is
truncated. Legacy `--prompt-1/-2/-3` / `--prompt` / `--inputs-json` paths all
still work; surface-gate enforces exactly one per run.

#### Y-flat `.fields.json` + no-empty-string invariant

For single-class templates (all three Y-migrated docs) the
`scripts/generate_documents.py::_dump_fields_json` helper emits a flat
`{field: value}` object matching Y's shape. Multi-class templates
(warning_order / operation_order / staff_estimate) keep the pre-§C23 nested
shape (`{template_id, title_arabic, sections: {...}}`) for back-compat. A
final depth-first walk (`_assert_no_empty_values`) raises if any value is
empty or whitespace-only — blanks MUST surface as one of:
- `غير متوفر في المدخلات` — optional input / source-file fact genuinely absent
- `يُصدر لاحقاً` — doctrine-deferred (used by `static_placeholder`)
- `غير متوفر في العقيدة المتاحة` — retrieval returned no hits

#### Three new renderer layouts (§C24)

Registered in `_LAYOUT_RENDERERS` inside `graph/generation/renderers/arabic_docx.py`:

| layout | Y doc | structure |
|---|---|---|
| `y_time_analysis` | `time_analysis` | `1. الإطار الزمني للمهمة` → 5× level-2 time rows → level-2 `توزيع وقت التخطيط` → **5-col table** (النشاط / النسبة / المدة / البدء / الانتهاء) with 4 step rows + الإجمالي summary row |
| `y_initial_planning_guidance` | `initial_planning_guidance` | Same time block + table, then 8× level-1 directive headings with retrieved/extracted value inlined |
| `y_staff_brief` | `staff_brief` | 5 underlined section-headers (each resets the level-1 counter): A. تقدير الاستخبارات والبيئة → B. تقدير العمليات → C. تقدير الأفراد → D. التقدير اللوجستي → E. الاستنتاجات العملياتية. Nested level-3/level-4 for phased-tactics + higher-command blocks, exactly as old doc 2 did. |

Shared helper `_render_y_time_allocation_block()` renders the time section
for both Doc 3 + Doc 4; table rows come from
`generated.allocation.table_rows_ar` (existing `PlanningAllocation`).

#### Loader + dispatcher plumbing

- `TEMPLATE_ID_TO_SCHEMA_MODULE` splits: Y-migrated docs point at
  `prompts.<doc>.schema`; legacy docs still point at
  `graph.generation.schema.schemas`. Don't collapse.
- New `TEMPLATE_ID_TO_CATALOG_MODULES` routes per-doc `labels_ar` +
  `prompts_ar` overlays. Per-doc catalog wins over the legacy project-wide
  catalogs for its template_id.
- New `resolve_template_path(template_id)` — `prompts/<doc>/template.yaml`
  first, `templates/<doc>.yaml` second.
- Standalone `template_loader __main__` deduplicates by template_id so the
  legacy YAMLs for migrated docs stay on disk but don't falsely fail
  validation.
- Three `""` fallback sites in `field_dispatcher.py` now emit Arabic
  placeholders: optional-input-miss → `غير متوفر في المدخلات`,
  cross-doc-derived-miss → `غير متوفر في المدخلات`, empty `StaticField.value`
  → `يُصدر لاحقاً`.
- `assemble_document(source_files=..., extracted_values=...)` — when the
  template declares `source_file_extracted` fields AND source files are
  supplied, `extract_for_document` runs before dispatch.

#### Smoke — reproducible from a fresh shell

```bash
# 1. Stack up
colima start && docker start qdrant
source venv/bin/activate

# 2. Template loader parity
python -m graph.generation.template_loader
# → 6/6 templates OK

# 3. Offline Y-schema smoke (no LLM / Qdrant)
python scripts/smoke_y_schemas.py
# → 3/3 OK   Y-keys match, no empty values

# 4. Live end-to-end against Qdrant + OpenAI
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief \
    --out /Users/hextechkraken/Desktop/NewOutputs
# → 3/3 .docx + 3 *.fields.json + extracted_inputs.json + run_sources.json
```

#### Do NOT (new rules under §C23 + §C24)

- **Don't delete the legacy `templates/*.yaml`, `graph/generation/schema/*.py`,
  `graph/generation/prompts_ar.py`, `graph/generation/schema/field_catalog.py`.**
  They still drive warning_order / operation_order / staff_estimate until Y
  schemas arrive. `TEMPLATE_ID_TO_SCHEMA_MODULE` intentionally routes
  different template_ids to different modules; don't re-collapse.
- **Don't rename or rekey the Y schemas.** `time_Y` (capital Y), `ammunition`
  (lowercase), `Join_op_purp` (capital J lowercase purp), etc. are verbatim
  from Y. Smoke test will fail loudly if they drift.
- **Don't let doctrine retrieval invent scenario facts.** `kind: retrieved`
  is reserved for doctrinal framing. Unit names, H-hour, enemy positions,
  map references — all `source_file_extracted`. Doctrine cannot fabricate
  facts absent from the user's source files.
- **Don't emit empty strings.** `_assert_no_empty_values` raises. If a blank
  escapes the dispatcher, add a placeholder path — don't bypass.
- **Don't skip the universal prompt file.** `prompts/_universal_instructions_ar.py`
  stays portable across corpora — no example H-hour, no operation names,
  no unit numbers hardcoded. Per-field specificity lives in each doc's
  `prompts_ar.py`.
- **Don't silently add doctrine-fallback chains to `source_file_extracted`
  fields.** For v1 the `"غير موجود في الملفات"` sentinel drops to the Arabic
  placeholder. A real fallback path is a future extension; don't pretend it
  exists in the dispatcher.
- **Don't rewrite the `y_*` layouts' level hierarchy in YAML `structure`.**
  The nesting is hardcoded to match
  `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt §6`. If a
  different shape is ever needed, add a new layout name and keep `y_*`
  immutable.

#### Current artefacts

Live `.docx` + `.fields.json` rendered to `/Users/hextechkraken/Desktop/NewOutputs/`:

```
time_analysis.docx                41 571 B    (level-1 + 5× level-2 + 5-col table)
time_analysis.fields.json          618 B
initial_planning_guidance.docx    43 264 B    (time block + table + 8 directives)
initial_planning_guidance.fields.json 3.8 KB
staff_brief.docx                  44 750 B    (5 sections, level-1..4 hierarchy)
staff_brief.fields.json            8.0 KB
extracted_inputs.json              3.2 KB     (Phase3Inputs audit)
run_sources.json                   1.1 KB     (per-file sha256 + length)
.group_cache/                                 (retrieval cache, gitignored)
```

---

### 2026-04-23 — §C21 (four-doc v1 + schema/label/prompt catalog consolidation)

**v1 scope expanded from 2 → 4 documents, and the schema /
Arabic-label / drafting-prompt surfaces collapsed into three
single-file catalogs.** User directive: input = warning-order info +
intel-analysis report; output = four Arabic `.docx`.

The four v1 documents are now:

1. `time_analysis` — **تحليل الوقت** (unchanged).
2. `initial_planning_guidance` — **دليل التخطيط الأولي** (unchanged
   shape; labels + prompts now overlaid from catalogs).
3. `warning_order` — **الأمر الإنذاري** (NEW; mapped-only,
   zero LLM, zero retrieval). Reuses `HeaderSection` +
   `MetadataSection` + `OperationalSituation` + `MissionAndExecution`
   + `Annexes` from the shared schema module. Template:
   `templates/warning_order.yaml`.
4. `staff_brief` — **إيجاز هيئة الركن** (NEW; mixed kinds). Step-1
   running-estimate brief — NOT the full Steps 2–6 Staff Estimate
   (that stays v2-deferred). Reuses all four Staff-Estimate classes.
   Intel-analysis fields that the commander can reasonably support at
   Receipt of Mission (enemy composition / disposition / strength /
   recent activity / MLCOA / counter-intel observations / main-effort
   tasks / combat effectiveness / operations conclusions) are
   `retrieved` against `ingest__doctrine__bgem3` with per-field
   `source_doc` narrowing to ADP-2-0 + FM-6-0 + FM-5-0 + ADP-5-0.
   Personnel + Logistics rows stay `static "يُصدر لاحقاً"` by
   doctrine — those estimates mature after COA analysis (Steps 3–5).
   Template: `templates/staff_brief.yaml`.

**Zero net-new Pydantic classes or fields were introduced.** Both new
documents reuse the existing class set from `NewClasses.md`
(§C13 preservation rule still binds). The full Steps 2–6 Staff Estimate
(`staff_estimate.yaml`) and the Step-7 OPORD (`operation_order.yaml`)
stay `v1_scope: false` and deferred to v2 (§C17 still binds).

**Three new "single editable surface" files introduced under §C21:**

| file | purpose | precedence |
|---|---|---|
| `graph/generation/schema/schemas.py` | All 16 Pydantic schema classes in one file (was four per-document modules). `DOCUMENT_CLASSES` tuple exposes them for the loader's parity + cross-doc-ref passes. | Authoritative — legacy modules are thin re-export shims. |
| `graph/generation/schema/field_catalog.py` | `FIELD_LABELS_AR[(class_name, field_name)]` → Arabic label string. | **Catalog wins** over YAML inline `label_ar`. |
| `graph/generation/prompts_ar.py` | `PROMPTS_AR[(template_id, class_name, field_name)]` → Arabic drafting-prompt string (retrieved fields only). | **Catalog wins** over YAML inline `prompt_ar`. |

Template loader applies both catalogs as an overlay pass on the raw
YAML dict before Pydantic validation (`template_loader._apply_catalogs`).
Rename a label = edit one file (`field_catalog.py`). Rewrite a
drafting prompt = edit one file (`prompts_ar.py`). Rename a Pydantic
field key = edit `schemas.py` + the two catalogs + the YAML(s) +
`NewClasses.md` (loader's parity pass surfaces any drift).

**Other §C21 code edits:**

* `TEMPLATE_ID_TO_SCHEMA_MODULE` — every template_id now points at
  `graph.generation.schema.schemas`. Multiple template_ids legitimately
  sharing a schema module is supported (warning_order + operation_order
  share the OPORD classes; staff_brief + staff_estimate share the
  Staff-Estimate classes). The parity pass only cross-checks classes
  YAML actually declares, so each template sees the subset it cares
  about.
* `DocumentSelection` gained `warning_order: bool = True` +
  `staff_brief: bool = True`. Default-true on both — the standard run
  produces four `.docx` files from a single brief.
* `ALL_DOC_IDS` in `scripts/generate_documents.py` and `V1_DOC_IDS` in
  `ui/phase3_tab.py` cover the four v1 documents.
* The CLI + UI now honour `template.meta.output_filename` with
  `{document_slug}` substitution (previously hard-coded
  `f"{doc_id}.docx"`). Each template picks its own filename so
  `warning_order.yaml` → `warning_order.docx` without ambiguity.
* `graph/generation/prompt_extractor.py`'s `DOCUMENT SELECTION` system-prompt
  block lists all six flags and defaults the four v1 documents to true.
* `data/phase3_inputs.example.json::document_selection` gained the two
  new keys.

**Smoke** (2026-04-23): all six templates load clean
(`python -m graph.generation.template_loader`). A four-doc run via
`--inputs-json data/phase3_inputs.example.json` rendered
`time_analysis.docx` (41 536 B), `initial_planning_guidance.docx`
(44 647 B), `warning_order.docx` (42 327 B), and `staff_brief.docx`
(44 821 B) into `/tmp/c21_smoke_full/`. The prompt path
(`--prompt …`) works the same way — the extractor emits the
four-doc selection by default.

**How to edit going forward:**

1. Rename a Pydantic class / field → `graph/generation/schema/schemas.py`
   (+ `field_catalog.py`, `prompts_ar.py`, YAML keys, `NewClasses.md`).
2. Rename an Arabic label → `graph/generation/schema/field_catalog.py`
   only.
3. Rewrite a drafting prompt → `graph/generation/prompts_ar.py`
   only.
4. Change the generated filename → `meta.output_filename` in the YAML.
5. Add a new v1 document → new YAML in `templates/`, add template_id
   to `TEMPLATE_ID_TO_SCHEMA_MODULE` + `ALL_DOC_IDS` + `V1_DOC_IDS` +
   `DocumentSelection`; add field labels to `field_catalog.py`; add
   group prompts to `prompts_ar.py`.

**New "Do NOT" rules under §C21:**

- **Do not reintroduce per-document schema modules** (`opord.py`,
  `staff_estimate.py`, etc. as authoritative). They are thin re-export
  shims now for backwards-compat with any external import path; the
  single source of truth is
  `graph/generation/schema/schemas.py` per user directive.
- **Do not put Arabic labels or drafting prompts back into YAML
  inline** as the authoritative surface. The two catalogs are the
  single editable surface; catalog wins overlay is deliberate.
- **Do not add new Pydantic classes or fields to satisfy a new
  document.** §C13 + §C21 both bind — reuse the existing class set.
  Changing field counts drifts us away from `NewClasses.md`, which
  breaks the rename-only cross-domain port guarantee.
- **Do not promote `warning_order` or `staff_brief` into
  cross-document derived chains** until the assembler's
  cross-doc-reference resolution is explicitly tested. The §C21
  smoke relied on static/input/computed/retrieved kinds; cross-doc
  derived is deferred.
- **Do not drop `meta.output_filename`** from a new template. The CLI
  + UI both read it. Omitting it falls back to
  `<document_slug>.docx` safely, but the explicit value is clearer.

### Late-day follow-on 2026-04-22 — §C20 (prompt universalization + label_ar backfill)

Small docs-and-YAML-only follow-on after the user inspected one of the
WARNO .docx outputs and saw `7. report_production: <Arabic paragraph>` —
an English field key leaking into a finished Arabic document — plus a
request to make `data/phase3_prompt.example.txt` portable across future
corpora (no hardcoded doctrine PDFs or collection strings):

1. **`data/phase3_prompt.example.txt` rewritten to be universal.**
   Removed the doctrine-PDF allowlist line (FM 6-0 / FM 5-0 / ADP 5-0 /
   ADP 2-0) and the `ingest__doctrine__bgem3` collection name; removed
   the "OPORD / Staff Estimates deferred" sentence (implementation
   detail, not extractor input). Added a broad "extract these fact
   categories" block (operation / locations / timing / references /
   intent). The Saqr-Shamal mission brief below is preserved as a
   concrete smoke case. Guiding principle: the prompt tells the
   extractor **what kinds of facts to extract and what each doc broadly
   contains**, never **which manuals to consult or which collection to
   query** — those live in the YAML templates and the CLI gate.
2. **`templates/initial_planning_guidance.yaml`: `label_ar` added to
   all 7 retrieved fields** in `PLANNING_DIRECTIVES` (report_production,
   coordination_duties, authorized_movements, staff_duties,
   collaborative_planning_times_locations,
   commanders_critical_information_requirements) and the single field
   of `OPERATIONAL_SAFETY_STANDARDS` (force_protection_protocols).
   Python/Pydantic field keys stay ASCII; only the rendered Arabic
   label changed. The `_layout_numbered_fields` renderer already reads
   `label_ar` — no code edit needed. Acronyms kept as English inside
   parens (e.g. CCIR) per user rule "no English in docs except
   acronyms." Both edits invalidate existing cache entries (prompt
   sha → user_prompt_sha256; YAML edit → yaml_group_hash).

Full session notes in
[`phase3_handoff_notes.md`](phase3_handoff_notes.md) under
"Session N+3 — 2026-04-22 (late, §C20)".

### What to do first in the new session

**If picking up from 2026-04-23 (§C23 + §C24 — LATEST):** three docs migrated
to Y-approved flat schemas under `prompts/<doc>/`; warning_order kept as
placeholder pending a Y schema; two-file input surface live; nested `y_*`
renderer layouts match the OLD generator §6 hierarchy. Reproduce:

```
colima start && docker start qdrant
source venv/bin/activate

# Loader parity
python -m graph.generation.template_loader        # → 6/6 OK

# Offline Y-schema smoke (no LLM / Qdrant)
python scripts/smoke_y_schemas.py                  # → 4/4 OK  (§C25)

# Live end-to-end against Qdrant + OpenAI
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/NewOutputs
# → 4/4 .docx + 4 *.fields.json + extracted_inputs.json + run_sources.json
```

**Edit surface for the four Y-migrated docs (§C23 + §C25):**

- Rename an Arabic label → `prompts/<doc>/labels_ar.py::FIELD_LABELS_AR`
- Rewrite an extraction prompt → `prompts/<doc>/prompts_ar.py::EXTRACTION_PROMPTS_AR`
- Rewrite a doctrine drafting prompt → `prompts/<doc>/prompts_ar.py::DRAFTING_PROMPTS_AR`
- Rename a schema field → `prompts/<doc>/schema.py` (+ update the Y
  reference files if Y changes first; smoke test will fail loudly)
- Change field-kind for a field → `prompts/<doc>/template.yaml`
- Change nested rendering hierarchy → `graph/generation/renderers/arabic_docx.py`
  (`_layout_y_<doc>` function)

**Edit surface for the remaining legacy docs (operation_order,
staff_estimate — still on §C21 catalogs; warning_order migrated under §C25):**

- Rename an Arabic label → `graph/generation/schema/field_catalog.py`
- Rewrite a drafting prompt → `graph/generation/prompts_ar.py`
- Rename a Pydantic class / field → `graph/generation/schema/schemas.py`
  (+ the two catalogs + the YAML + `NewClasses.md`; the loader's parity
  pass surfaces any drift on the next run)
- Change a generated filename → the YAML's `meta.output_filename`

**Adding a new Y document (example — landed warning_order in §C25):**

1. Write `prompts/<doc>/{schema,labels_ar,prompts_ar,template}.py|yaml`.
2. Flip `TEMPLATE_ID_TO_SCHEMA_MODULE["<doc>"]` to `"prompts.<doc>.schema"`.
3. Add `"<doc>"` to `TEMPLATE_ID_TO_CATALOG_MODULES`.
4. Add to `Y_FILES` (JSON-parseable ref) or `Y_INLINE_KEYS` (non-JSON ref
   like an RTF) in `scripts/smoke_y_schemas.py`.
5. Write `_layout_y_<doc>` in `arabic_docx.py` + register in `_LAYOUT_RENDERERS`.
6. If a legacy `templates/<doc>.yaml` + schema classes still linger in
   `graph/generation/schema/schemas.py`, the per-doc `prompts/<doc>/template.yaml`
   takes precedence via `resolve_template_path` — the legacy files can be
   deleted once all downstream references point at the new layout.

The two `warning_order` + `staff_brief` templates and the three
catalog files are committed on `main`; the pre-§C21 Desktop docs
(`/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/`) are stale.
Re-render if you need a fresh Desktop copy.

**If picking up the Phase 3 C18 + C19 work from 2026-04-22:** the
OCR-retry plan-B is live, the MDMP-topical gate re-tightened, ADP 2-0
now lands in Qdrant via forced-OCR (233 chunks; collection total
2398), and the **two Step-1 `.docx` files are on the user's Desktop**:

- `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/time_analysis.docx` (41 536 B)
- `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/initial_planning_guidance.docx` (44 558 B)
- `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/extracted_inputs.json` — audit trail

Immediate next task is the **human review** of both docx files:
(a) citations reference FM 6-0 / FM 5-0 / ADP 5-0 / ADP 2-0
(ADP 2-0 is now reachable for CCIR / PIR / IPB-heavy fields —
WARNO grew by +274 B over the last run because those fields now
have grounding); (b) Arabic prose reads coherently; (c) "غير متوفر
في العقيدة المتاحة" appears only where the Step 1 corpus legitimately
lacks coverage. Tell the agent what needs fixing.

Note — the two `.docx` on Desktop were rendered BEFORE the C20 edits.
Re-run to see the new Arabic labels (`إصدار التقارير ونشرها` etc. in
place of `report_production`) and to exercise the universalized prompt.
Both edits invalidate the relevant cache entries automatically.

Also available on the tooling side:
- **Streamlit Phase 3 tab** — `streamlit run ui/app.py`, click the
  "Phase 3 — MDMP Step 1" tab. Paste the brief → pick docs → Generate
  → download .docx.  Implementation in `ui/phase3_tab.py`.
- **Plan-B for future broken PDFs** is documented in
  [`docs/pdf_failure_fallback_plan.md`](pdf_failure_fallback_plan.md)
  (was the design doc; now reflects what was built).

Open issues listed at the end of
[`docs/phase3_handoff_notes.md`](phase3_handoff_notes.md) Session N+2
(cont.).

**Otherwise:**

1. Re-read this file (`docs/memory.md`) end-to-end — you are
   reading it.
2. Skim [`walkthrough.md`](walkthrough.md) §8 for the retrieval
   pipeline walkthrough.
3. For Phase 2 design rationale (why this shape was chosen, R1–R7
   evidence, §12 corrections) read
   [`referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md).
4. **If the user's task is Phase 3 / generation:** read
   [`phase3_walkthrough.md`](phase3_walkthrough.md) first for
   orientation, then
   [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)
   for the authoritative design. Before any `graph/generation/`
   code: verify the two §19 pre-code gates are addressed (junk-filter
   prompt rewrite + four YAML templates authored). Do NOT skip those.
5. If the user's task is retrieval-related: run
   `python scripts/retrieval_smoke_test.py` against the default
   collection first to confirm the stack is live before changing
   anything.
6. If the task touches ingestion: preserve the
   `python -m graph.nodes.<name>` and
   `python -m graph.retrieval.<name>` standalone-run invariants.
7. If the task is Phase 3 and requires adding new doctrine manuals:
   drop the PDFs into `inputs/doctrine/` (the one doctrine folder)
   and re-run ingest. They land as new `source_doc` entries inside
   `ingest__doctrine__bgem3` — do NOT create per-FM sub-folders
   (that would produce per-FM collections, against the §6.4
   single-collection-per-domain decision). The M0.1 prompt loosening
   (committed 2026-04-22) means specialty/support manuals
   (sustainment, fires, signal, aviation, CBRN, engineer, MP, EW)
   now pass the per-doc gate. If a folder was rejected BEFORE M0.1
   and its content is unchanged, use `FORCE_REPARSE=1` to bypass the
   upstream sha256 cache and let the gate re-judge under the new
   prompt.
8. If the task is Phase 3 generation: the input surface is a
   **free-form `prompt.txt`**, not a hand-authored `inputs.json`
   (§18 C16). Invoke via
   `python scripts/generate_documents.py --prompt <path>`. An
   `--inputs-json <path>` escape hatch exists for debugging /
   regression — do not promote it to the paved path. The CLI
   persists `extracted_inputs.json` into the run output dir as the
   audit trail; reviewers diff it against the prompt file.

### What NOT to do

- Do not change any Phase 1 source file without explicit
  confirmation (`graph/nodes/*`, `graph/post_processors/*`,
  `graph/state.py`, `graph/builder.py`, `main.py`) — with the one
  exception that Option B already landed its behaviour-preserving
  import swaps in `check_documents.py` and `embed_chunks.py`.
- Do not extract `_get_client()` into `graph/shared/`. The
  parallel singleton between `graph/nodes/upsert_to_qdrant.py`
  and `graph/retrieval/{registry,hybrid_search}.py` is
  deliberate (§10.5); revisit only if a third consumer appears.
- Do not split the consolidated Phase 2 design back into multiple
  docs.
- Do not claim `dense_rank` / `sparse_rank` are free from
  `query_points`. They require Stage B′ (two extra dense-only /
  sparse-only queries) and are populated only when
  `SearchRequest.debug=True`.
- Do not introduce Qwen3 rerankers into `.env` or code.
- Do not present HyDE as a locked default — it is default OFF.
- Do not silently convert `acronyms.csv` edits into code edits —
  the external termbase is the edit surface; code reads it via
  `graph/doctrine_vocab.py`.
- Do not call `.embed()` at query time on the BM25 sparse
  channel. Use `.query_embed()` — `graph/retrieval/embed_query.py`
  documents why (IDF is applied server-side by Qdrant because
  the sparse index carries `modifier=Modifier.IDF`).
- Do not import `TextCrossEncoder` from top-level `fastembed`;
  use `from fastembed.rerank.cross_encoder import TextCrossEncoder`.
  `.rerank()` returns a generator — `list(...)` it before zipping.
- Inside a `Prefetch(...)` the filter kwarg is `filter=`, NOT
  `query_filter=` (only the top-level `query_points(...)` takes
  `query_filter`). Current code uses the top-level filter and
  lets Qdrant propagate; don't copy the top-level name into a
  future per-prefetch filter change.
- **Do not add PDF or TXT renderers to Phase 3.** Removed from v1
  scope by user directive 2026-04-22. See §18 C1 of
  [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md).
  If the directive later flips, it's a new scoping decision, not a
  code change.
- **Do not simplify or rewrite the old Arabic renderer** when
  porting into `graph/generation/renderers/arabic_docx.py`. User
  directive (Q2, 2026-04-22) — prior simplification broke
  formatting. Cosmetic cleanup (imports, docstrings) is OK;
  behaviour changes to kashida / bidi / numbering cycles / table
  styling are NOT. See
  [`referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md)
  §3 for the exact keep/discard matrix.
- **Do not put drafting instructions inside Pydantic field
  descriptions** in Phase 3 schema modules. That was the old
  code's anti-pattern. Descriptions stay terse; per-group
  Arabic drafting prompts live in the YAML templates'
  `prompt_ar` field.
- **Do not introduce feature flags / abstractions for the
  health-domain swap.** The swap is rename-only (field names +
  YAML entries). `NewClasses.md` has the 1-to-1 mapping.
- **Do not instantiate a new Qdrant client, embedder, or reranker
  inside `graph/generation/`.** Reuse Phase 2 via
  `graph.retrieval.search`. Parallel singletons would violate
  §10.5 discipline.
- **Do not send filenames to the LLM** in Phase 3 retrieved-field
  drafting. Rule 1 applies unchanged — `source_doc` slugs (which
  are public doctrine identifiers) are OK; filesystem paths are not.
- **Do not sort across seeds by `rerank_score`** when merging
  multi-seed retrieval results. Phase 2's `rerank_score` is scored
  against the single query passed to THAT `search()` call; using
  it as a cross-seed merge signal is incorrect. Use
  **RRF-across-seeds + one single final rerank pass** on the
  merged pool. See §18 C8 of the Phase 3 scoping doc.
- **Do not use `graph.shared.llm._get_llm()` inside
  `graph/generation/`**. That singleton is hardcoded to
  `gpt-4o-mini` and `temperature=0.0` and cannot honour the
  Phase 3 per-call draft/critique temperature overrides. Use
  `graph.generation.llm.{get_draft_llm, get_critique_llm}`
  instead. See §18 C9 of the scoping doc.
- **Do not claim `.docx` byte-determinism** in any Phase 3 doc or
  commit message. python-docx's XML element ordering is not
  deterministic (see
  [`referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md)
  §3.3). Phase 3 caches the assembled `GeneratedDocument` pydantic
  instance, not the rendered file. See §18 C10.
- **Do not shrink the per-group cache key.** The full key — YAML
  file hash, YAML group block hash, all retrieval toggles, both
  model names, both temperatures, `prompt_ar` hash, reranker model
  tag, etc. — is load-bearing. Dropping any of these silently
  returns stale drafts on prompt/model edits. See §18 C11.
- **Do not emit `[source_doc §None]` in citations.** Use the §6.6
  locator fallback chain (`paragraph_number` → `paragraph_numbers[0]`
  → deepest `heading_path` → `"p. <page>"` → `"—"`). The
  generation layer pre-resolves the tag so the LLM never decides
  the locator; it copies the tag verbatim. See §18 C12.
- **Do not copy `NewClasses.md` mechanically into schema modules.**
  It is a design reference that mirrors the user's old health
  `prompt.txt` quirks for rename-only port shape. Real modules use
  clean Pydantic v2 (types only); `Field("...")`, `description=`,
  `examples=` migrate to YAML. See §18 C13.
- **Do not hand-edit `data/phase3_inputs.schema.json`.** It is
  generated from `graph/generation/schema/inputs.py::Phase3Inputs`
  by `scripts/export_phase3_input_schema.py`. Edit the Pydantic
  model and regenerate. See §18 C14.
- **Do not drop `SourcedHit` in favour of bare `SearchHit`** inside
  `graph/generation/`. Every hit needs its originating `collection`
  attached for provenance, debug logs, cache keys, and citation
  endnotes. Phase 2's `SearchHit` does not carry `collection` —
  that is the generation layer's responsibility. See §18 C15.
- **Do not reintroduce `inputs.json` as the primary input
  surface.** §18 C16 (post-M2, 2026-04-22) flipped Phase 3's input
  surface from user-authored JSON to a free-form operation brief
  extracted via `graph/generation/prompt_extractor.py`. The
  `--inputs-json` CLI flag is a debugging / regression escape
  hatch; any new tooling (Streamlit tab, automation) consumes
  `--prompt`. Do not raise the extractor's default
  `PHASE3_EXTRACTOR_TEMPERATURE` above 0.0 — determinism is
  load-bearing for cache invalidation and audit fidelity. Do not
  feed drafting style / tone instructions through the user prompt
  — those still live in the YAML `prompt_ar` per group (§C4).
  Do not skip persisting `extracted_inputs.json`; it is the run's
  audit trail.
- **Do not add a blanket de-ROT / shift-decode post-processor for
  garbage-text-layer PDFs.** ADP 2-0's per-page mixed encoding (74
  of 88 pages carry both Caesar-shifted body text AND plain-English
  headers on the same page) makes span-level detection fragile.
  `docs/pdf_failure_fallback_plan.md` §1.3 holds the forensic evidence.
  The correct fix is Tesseract full-page OCR (C19), not a custom
  decoder.  See §C19.
- **Do not call `_get_parser()` / `_make_escalation_converter()`
  directly from new code.** Those are thin aliases in
  `graph/nodes/convert_document.py` kept only for import
  backwards-compat.  New code calls
  `graph.docling_converters.{get_textlayer_converter, build_ocr_converter}`
  — the shared module is the source of truth for OCR language, accelerator
  device, and lang-pack selection.  Duplicating converter construction
  elsewhere will drift `OCR_LANGS` out of sync.
- **Do not loosen the MDMP-topical gate back to topic-agnostic without
  a new scoping revision.** §C18 re-tightened the sufficiency filter
  because the corpus under C17 is deliberately MDMP-only.  A mixed-
  corpus v2 would re-open this decision; v1 stays tight.  If a future
  non-MDMP domain ships (medical, maintenance, etc.), it goes into its
  OWN collection per §6.4 and gets its OWN gate prompt — do not mix
  topics into `ingest__doctrine__bgem3`.
- **Do not raise `OCR_RETRY_MAX_PER_FOLDER` casually.** The budget
  exists so a folder of unreadable PDFs cannot burn unbounded OCR time.
  Default 5 is calibrated for a single stray bad doc per folder.  If a
  real folder has >5 broken PDFs, surface it as a data-quality problem
  and fix the sources, don't raise the cap.
- **Do not feed drafting style / tone instructions through
  `data/phase3_prompt.example.txt`.** The C18 rewrite explicitly calls
  out Arabic output + per-doc scope because the extractor needs that
  meta-information to build `Phase3Inputs` correctly, but drafting
  voice still lives in each YAML's `prompt_ar` per group (§C4 + §C16).
  Adding "write it formally" or "use bullets not prose" to the prompt
  file bypasses the template contract and is a bug, not a feature.
- **Do not hardcode doctrine-PDF names, collection strings, or
  implementation-scope decisions into `data/phase3_prompt.example.txt`.**
  §C20 (late 2026-04-22) universalized that file so it's portable
  across future corpora. It tells the extractor WHAT TO EXTRACT, not
  WHICH MANUALS TO CONSULT. Doctrine-PDF allowlists live in each
  YAML's per-field `filters.source_doc`; collection names live in
  `filters.collections` and `meta.default_collections`; v1-vs-v2 scope
  lives in the `v1_scope` flag on `operation_order.yaml` /
  `staff_estimate.yaml` + the CLI gate. The prompt file must stay
  corpus-agnostic; if you catch yourself typing "FM 6-0" or
  "ingest__…" into it, you're editing the wrong surface.
- **Do not ship a `kind: retrieved` or `kind: input` YAML field
  without a `label_ar`.** The renderer's `_layout_numbered_fields`
  falls back to the ASCII Python key when `label_ar` is missing
  ([`arabic_docx.py:1054`](../graph/generation/renderers/arabic_docx.py#L1054));
  that fallback is a last-resort guard, not a paved path. §C20
  backfilled the 7 missing labels in `initial_planning_guidance.yaml`.
  If you later flip `v1_scope: true` on `operation_order.yaml` or
  `staff_estimate.yaml`, audit every field there first — each `kind:
  retrieved` block needs a `label_ar` before it renders. Acronyms
  inside parens (CCIR, PIR, FFIR, BMNT, EENT) are the only permitted
  English in user-facing Arabic output.
- **Do not rename the Phase 3 Pydantic / YAML field keys to Arabic
  identifiers** to "fix" English leakage. Python 3 accepts unicode
  identifiers, but the key flows through `retrieval_group.py`,
  `section_drafter.py`, `assembler.py`, `cache.py`, and every
  `extracted_inputs.json` key on disk. The `label_ar` mechanism exists
  so ASCII keys and Arabic labels coexist — use it.
- **Do not hard-code `gpt-4o-mini` / `gpt-4o` in the Phase 3 Streamlit
  tab.** `ui/phase3_tab.py` reads `PHASE3_EXTRACTOR_MODEL` /
  `PHASE3_EXTRACTOR_TEMPERATURE` lazily via `os.getenv` so the tab
  inherits the same env surface the CLI uses (`scripts/generate_documents.py`).
  Adding a model-picker widget would desynchronize the cache keys
  across UI and CLI; keep the env var as the one knob.
- **Do not resurrect OPORD or Staff Estimates into v1.** §18 C17
  (post-M3-code, 2026-04-22) cut v1 scope to the two MDMP Step 1
  outputs (Time Analysis + Initial Planning Guidance). OPORD is a
  Step 7 output; Staff Estimates span Steps 2–6. Bundling either
  into a Step 1 run produces doctrinally wrong artifacts. Their
  templates and schema modules stay on disk with `v1_scope: false`
  and are deferred to v2. Do not delete
  `templates/staff_estimate.yaml`, `templates/operation_order.yaml`,
  `graph/generation/schema/staff_estimate.py`, or
  `graph/generation/schema/opord.py` — they are the v2 starting
  point. Do not delete the M3 retrieval / drafting / critique /
  cache code (`graph/generation/{retrieval_group, section_drafter,
  critique, cache}.py`) — it is correct under C17 and v2 re-enables
  it by flipping the two templates' `v1_scope` flag. Do not
  promote the v1-scope gate into a feature-flag / registry / plugin
  system — one boolean per template is the whole mechanism (§C5
  still binds). Do not add doctrine PDFs to `inputs/doctrine/`
  beyond the FM 6-0 / FM 5-0 / ADP 5-0 / ADP 2-0 set without an
  explicit revision; the 21 tactics manuals previously there live
  at `/Users/hextechkraken/Desktop/NatoDocs/` and were removed to
  prevent tactical-prose contamination of WARNO retrieval.

### Open items (Phase 3 and beyond)

- **Gemma drafter Pydantic schema-compliance** — `Draft_planning_directives`
  + `Draft_conclusions` fail `with_structured_output` against
  `google/gemma-4-e4b` on LM Studio (under both
  `LLM_USE_RESPONSES_API=1` and `=0`). 3/4 v1 .docx still produce
  cleanly; `staff_brief.docx` is the casualty. NOT a Phase 0 / tiered-
  retrieval regression. Full write-up + mitigation options in
  [`docs/gemma_drafter_followup.md`](gemma_drafter_followup.md).
  Decide before any user-facing claim of 4/4 clean against Gemma.


- **Phase 3 code** — M0–M3 LANDED (commit `5e2aaf0`, 2026-04-22).
  Design locked in [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md).
  v1 scope is MDMP Step 1 (Time Analysis + Initial Planning
  Guidance only — §18 C17). The M3 retrieval / drafter / critique /
  cache code exists on disk and is correct; OPORD (M4) and Staff
  Estimates (M3 target doc) are deferred to v2 via a `v1_scope: false`
  flag on their YAMLs and a CLI gate in `scripts/generate_documents.py`.
  Doctrine corpus in `inputs/doctrine/` swapped from 21 tactics
  manuals to the 4-manual Step 1 set (FM-6-0, FM-5-0, ADP-5-0,
  ADP-2-0); archive of the tactics PDFs at
  `/Users/hextechkraken/Desktop/NatoDocs/`.
  **Qdrant rebuild executed 2026-04-22 (old 7573 points → new
  2165 points across 3 manuals).** `ADP-2-0-Intelligence.pdf`
  rejected at the per-doc gate due to a broken ToUnicode CMap in
  the 2012-edition PDF that produces ROT-coded preview text
  (symptom: `$'3 ,17(//,*(1&` instead of `ADP INTELLIGENCE`).
  The missing-manual elision rule in `retrieval_group.py` handles
  the gap at retrieval time. Fix: download a newer ADP 2-0 edition
  (2018+ ARN) or substitute `ARN39259-FM_2-0-000-WEB-2.pdf` — see
  `docs/phase3_handoff_notes.md` "Session N+1 (cont.)" for full
  analysis + ranked options.
  **Both smokes passed post-rebuild:** `step1_rebuild_smoke` (JSON
  path, no LLM) rendered Time Analysis 41536 B (byte-ident) + WARNO
  44387 B; `step1_prompt_smoke` (prompt path, real extractor +
  drafter) rendered WARNO 44284 B with a correctly-populated
  `extracted_inputs.json`. Open work: human review of WARNO prose +
  citations; ADP 2-0 source swap; update
  `scripts/retrieval_smoke_test.py` to new `source_doc` set. Next
  milestones: M5 (WARNO drafter refinement if needed) + M6
  (Streamlit tab) + final lock-in.
- **Post-acceptance model migration** — after Phase 3 v1 is
  accepted, all models (embedder, reranker, LLM) migrate from
  local FastEmbed ONNX runtimes to API endpoints over the
  internet. User directive 2026-04-22. Migration surface is
  `.env` + existing `_get_*()` singletons; no Phase 3 source
  edits expected. See §7.4 of the Phase 3 scoping doc.
- **ADP 5-0 / FM 5-0 ingestion** — canonical source for MDMP and
  the 1:3 rule, used by Docs 3 and 4. Ingest if/when available;
  template YAMLs will list both paths and skip whichever is
  absent. Gated on the §19.1 prompt loosening (the current gate
  would reject ADP 5-0 as "not maneuver/combat operations").
- **Arabic doctrine corpus (future)** — user Q4 notes future
  deployments will contain Arabic doctrine with English acronyms.
  The Phase 3 YAML templates will gain an optional
  `query_language` hint per group when that corpus ships. No
  schema change needed; `bge-m3` is multilingual at query time.
- **Gold set** (`data/eval/gold_queries.jsonl`) — not yet
  authored. Recommended cadence: after ~2 weeks of UI use
  reveals real query families.
- **`scripts/eval_retrieval.py`** — not yet written. Will
  consume the gold set + call `search()` + emit MRR@10,
  Recall@{1,5,10}, Precision@5.
- **Reranker EP shadow rows** in
  [`ubuntu_deploy_shadow.md`](ubuntu_deploy_shadow.md) —
  Phase 2 row added 2026-04-22; revisit during prod cut-over.
  Arabic-font shadow row (Phase 3 renderer) to be added at M1.
- **FastAPI prod wrapper around `search()`** and a `/healthz`
  endpoint — not yet built. Streamlit is local dev only.
- **MMR activation** — `graph/retrieval/mmr.py` is the
  identity stub; wire when observed duplicates dominate Top-k.
- **Cross-collection search** — single-collection v1. The
  `_registry` makes multi-collection reachable without a schema
  change; the merge strategy (RRF-of-RRF vs rerank-across-pools)
  is an experiment, not a decision. **Phase 3 v1 queries exactly
  one doctrine collection (`ingest__doctrine__bgem3`)** with
  per-manual narrowing via `filters.source_doc` allowlists (§6.4
  of the scoping doc, revised 2026-04-22). Collection isolation
  is for corpus/domain isolation (future medical corpus → its own
  collection), not per-manual splitting inside one domain. The
  client-side union pattern remains the mechanism for future
  multi-domain templates — zero Phase 2 changes required then
  either.

### Pre-existing WIP on `main` (commit `1419b25`) — historical note

Commit `1419b25` ("wip: root working state before Phase 2 docs
merge") landed on `main` during the Phase 2 scoping pass with
user WIP that predated the Phase 2 doc work (the `fingerprints.py`
module, edits to all 7 `graph/nodes/*.py`, `graph/config.py`,
`graph/state.py`, `main.py`, `docs/transferOS.md`, and
`docs/walkthrough.md`). All of that work has since been superseded
by the Phase 2 implementation commits (see `git log`) — it's no
longer a separate concern. Mentioned here for continuity only.
