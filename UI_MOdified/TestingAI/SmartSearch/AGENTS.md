# ⚠️ READ `memory.md` BEFORE DOING ANYTHING ⚠️

**Every new Codex chat working in this project must start by reading
[`memory.md`](docs/memory.md).** It is the master index: locked decisions, pinned
versions, design rules, and pointers into `referencedocs/` and `libs/`.

The quickest instruction: **"Read `memory.md` and follow its instructions."**

---

## ⏱️ Session handoff (2026-05-01)

Bundle was built, saved, and moved off this dev box.  The three transfer
artefacts (`dms_app.tar` ~4.4 GB, `qdrant.tar` ~190 MB,
`DecisionMakingSteps_TRANSFER.tar.gz` ~34 MB) live on the operator's USB
/ external drive — they are no longer in this repo.

**Verified before transfer:** full offline simulation with ethernet
physically pulled produced 4/4 `.docx` end-to-end against LM Studio
(Qwen 2.5 32B Q4_K_M) + Infinity-served bge-m3 + bge-reranker-v2-m3.

**LLM recommended for the offline box:** Qwen 2.5 32B Instruct
(`lmstudio-community/Qwen2.5-32B-Instruct-GGUF`, Q4_K_M).  Non-reasoning
instruct model — sidesteps the §C32 Gemma compliance failure AND the
§C34 reasoning-model token-cap gotcha.

**Embedder swap (mxbai-embed-large-v1) is supported by configuration
only.**  See [OFFLINE_RUNBOOK.md](OFFLINE_RUNBOOK.md) §3.6 for the two
swap options (Option A: just `EMBED_MODEL=`; Option B: also
`EMBEDDER_TAG=` + sed two YAML files).  Either way, full re-ingest is
required — the vector space is not bit-compatible across embedders.

**Do NOT** re-apply the `changesonS4.md` hardenings; they are already
baked into the image AND the source tree on disk.

---

## ⚙️ Offline-readiness pass — locked decisions (2026-04-30)

Offline hardening applied for the airgapped i9 transfer (full trail in
`changesonS4.md`):

- **SSL bypass** in [graph/shared/responses_client.py](graph/shared/responses_client.py)
  via `httpx.Client(verify=False)` for self-signed HTTPS LLMs.
- **Offline mode** at runtime via `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`,
  `HF_DATASETS_OFFLINE=1` in the Dockerfile's post-warmup ENV block.
- **tiktoken pre-cached** via `TIKTOKEN_CACHE_DIR` + `warm_tiktoken()`.
- **Slim warmup**: bge-m3 dense + reranker dropped (HTTP-served on offline target).
- **Docling + RapidOCR critical** so build fails if modelscope.cn is unreachable.
- **`.dockerignore`** keeps secrets / venv / output out of image layers.
- **Source volume mounts** in `docker-compose.yml` for hot-reload `.py` edits.
- **Qdrant `check_compatibility=False`** (cosmetic).

---

## ⚙️ GPU/CPU auto-detect — locked decision (2026-04-30)

The project ships GPU-capable wheels (`fastembed-gpu==0.8.0`,
`onnxruntime-gpu==1.25.1`, `torch+cu130`) and uses runtime auto-detect
for both Docling and FastEmbed. The same `.env` works on a GPU host
and a CPU-only host. Knobs:

```ini
DOCLING_DEVICE=auto
EMBEDDER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
RERANKER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
```

Implementation: [graph/shared/device_banner.py](graph/shared/device_banner.py)
prints a `[device] …` banner at the top of every `main.py` /
`scripts/generate_documents.py` run showing what was actually resolved.

**Do NOT** revert to CPU-only `fastembed` / `onnxruntime` wheels except
for a deliberate "CPU-only slim build" — those wheels physically lack
the CUDA code path and cannot auto-upgrade.

---

# DecisionMakingSteps

**LOCKED DECISION — provider-based model routing (2026-04-24, user
override).** Supersedes the earlier LM-Studio-only / LLM-only locked text.
LLM, dense embedder, and reranker can each be swapped between in-process
FastEmbed and any OpenAI-compatible HTTP server (LM Studio, Infinity, TEI,
llama.cpp server, offline Linux box) by editing `.env` only.

- **LLM** via `graph/shared/llm_factory.py` — `LLM_BASE_URL` / `LLM_API_KEY` /
  `LLM_MODEL` + per-role overrides. `use_responses_api=True` default ON,
  so the wire path is `POST /v1/responses` (NOT chat completions).
  `LLM_USE_RESPONSES_API=0` is an escape hatch only. Verified on
  `langchain-openai==1.1.14`.
- **Dense embedder** via `graph/shared/embedders.py` — branches on
  `EMBED_PROVIDER` (`fastembed` default / `http` alias `lm_studio`).
  HTTP path = `HttpDenseEmbedder` (urllib, `POST /v1/embeddings`,
  L2-normalises rows). FastEmbed fully wired as fallback.
- **Reranker** via `graph/retrieval/rerank.py` — branches on
  `RERANK_PROVIDER`. HTTP path = `HttpReranker` (Cohere/Jina/Infinity/TEI
  shape). Raises `RerankUnavailable` on failure; `graph/retrieval/search.py`
  catches it and degrades to RRF-only — retrieval never hard-fails.
- **BM25 sparse** untouched.

Cache provenance (`graph/generation/cache.py`) folds `llm_endpoint_tag`,
`llm_use_responses_api`, `embed_provider`, `embed_endpoint_tag`,
`rerank_provider`, `rerank_endpoint_tag`. Re-ingest warning:
`EMBED_PROVIDER=http` on an existing corpus is vector-parity-sensitive —
probe or re-ingest. Do NOT bypass `build_chat_llm()`, hardcode
`use_responses_api=False`, or instantiate `TextEmbedding` /
`TextCrossEncoder` outside the shared modules.

**Project status: PHASE 1 + PHASE 2 IMPLEMENTED; PHASE 3 v1 FULLY Y-MIGRATED (§C25, 2026-04-23); PROVIDER-BASED MODEL ROUTING LIVE (§C26, 2026-04-24); TIERED RETRIEVAL ARCHITECTURE COMPLETE + LIVE (§C28→§C33, 2026-04-27..28 — see CLAUDE.md for full audit trail; all three evidence channels live, doctrine ref library 21 manuals/11k chunks ingested); TIERED RETRIEVAL DEV UI LIVE (§C34, 2026-04-28 — new `Phase 2 — Tiered Retrieval` Streamlit tab in `ui/app.py` calls `retrieve_group()` directly with a free-form query, dev tool only — never call from production code; pre-deployment reasoning-model token-cap audit checklist landed in `.env.example` near `QUERY_EXPAND_HYDE_MAX_TOKENS=256` and in `docs/memory.md`) — LLM / dense embedder / reranker all provider-abstracted via `.env`; LLM locked to `/v1/responses`; FastEmbed first-class fallback; BM25 in-process; rerank failure → RRF-only. ALL FOUR v1 documents under per-doc `prompts/<doc>/` layout: `time_analysis`, `initial_planning_guidance`, `staff_brief`, `warning_order`. §C25 added the fourth: `warning_order` flat schema = 50 str fields keyed to `/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf` (per-field RTF explanations hoisted into Pydantic `Field(description=...)`), all `source_file_extracted` kinds, new `y_warning_order` renderer layout mirrors OLD generator doc 1 from `/Desktop/ToTransfer/New Text Document.txt` lines 939–1152 (bism + `add_arabic_header` + letter_ref_number2 + References/Maps/time_zone + level-1/2/3 الموقف/مهمة المكون البري/التنفيذ/الإدامة/القيادة والسيطرة + SPLITTER on 6 numbered-text fields + أقرّوا approval + Appendices via `add_level_one_ML` + Viewports via `add_level_one_SHFAF`). §C23 two-file input surface (`--warning-order` + `--intel-report` + `--source-file kind=path` extras) unchanged. Field kind `source_file_extracted` (per-doc structured LLM call via `graph/generation/source_file_extractor.py`). Retrieval stack (Qdrant) untouched — still handles `kind: retrieved`. §C24 nested layouts (`y_time_analysis`, `y_initial_planning_guidance`, `y_staff_brief`) mirror OLD docs 3/4 + doc 2. `.fields.json` flat, keys match `/Users/hextechkraken/Desktop/y/*.{txt,rtf}` verbatim. NO empty strings — every blank surfaces as one of three approved Arabic placeholders. Live verified at `/Users/hextechkraken/Desktop/NewOutputs/` (**4/4** `.docx` + 4 `*.fields.json`). Prior state preserved: §C18 MDMP-topical gate; §C19 OCR-retry plan-B; §C21 catalogs still drive remaining legacy `operation_order` / `staff_estimate`.**
Phase 1 ingestion pipeline (7 nodes) and Phase 2 retrieval stack are
both implemented and committed on `main`. Phase 2 design locked in
[`referencedocs/17_phase2_retrieval.md`](referencedocs/17_phase2_retrieval.md).

**Phase 3 (template-driven document generation)** scoped across four
md files; M0–M6 code landed under `graph/generation/` + `ui/phase3_tab.py`.
**v1 ships four documents (§C21):** `time_analysis`,
`initial_planning_guidance`, `warning_order`, `staff_brief`.
- [`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md) — **authoritative scoping doc** (C17 = v1 scope framing, C18 = MDMP-topical gate, C19 = OCR-retry plan-B, C20 = prompt universalization, C21 = four-doc v1 + catalog consolidation)
- [`referencedocs/19_phase3_arabic_renderer.md`](referencedocs/19_phase3_arabic_renderer.md) — renderer port guide (preserves old Arabic typography verbatim)
- [`referencedocs/20_phase3_templates_and_kinds.md`](referencedocs/20_phase3_templates_and_kinds.md) — YAML template + 5-kind field taxonomy
- [`docs/phase3_walkthrough.md`](docs/phase3_walkthrough.md) — project-level overview (read first in fresh Phase-3 sessions)
- [`docs/pdf_failure_fallback_plan.md`](docs/pdf_failure_fallback_plan.md) — §C19 design + forensic evidence for the OCR-retry path

Pydantic schemas at [`NewClasses.md`](NewClasses.md). Input surface (§C22)
is **three** per-doc operation briefs:

| prompt | feeds | sample |
|---|---|---|
| `prompt_1` | Time Analysis (timing.* fields) | [`data/phase3_prompt_1.example.txt`](data/phase3_prompt_1.example.txt) |
| `prompt_2` | Initial Planning Guidance + Warning Order (operation / references / locations / mission intent) | [`data/phase3_prompt_2.example.txt`](data/phase3_prompt_2.example.txt) |
| `prompt_3` | Staff Brief (operation.own_training_readiness / movement_order + intel context) | [`data/phase3_prompt_3.example.txt`](data/phase3_prompt_3.example.txt) |

The Warning Order has **no prompt of its own** — it draws its fields
from prompts 1 and 2.  The three prompts are concatenated with labelled
section headers (`[PROMPT 1 — TIME ...]` etc.) and passed to ONE
extractor LLM call; the extractor system prompt (`graph/generation/prompt_extractor.py`)
treats each section as authoritative for its own field slice.  Legacy
single-file `--prompt` and debug-only `--inputs-json` surfaces still
work.  v1 ships `.docx` only; each `.docx` now ships a sibling
`<doc>.fields.json` with the resolved field→value map for verification.

**Key revisions (all binding; see §18 of the scoping doc):**
- **C8–C15** (second review): RRF-across-seeds + ONE final rerank; Phase-3-local LLM helper; non-deterministic `.docx` → cache `GeneratedDocument`; expanded cache key; citation-locator fallback; `NewClasses.md` reference-only; Pydantic-first inputs JSON-Schema; new `SourcedHit` wrapper.
- **C16** (third review): input surface = free-form prompt; extractor LLM produces `Phase3Inputs` at temp 0.0; cache key folds in `user_prompt_sha256 + extractor_model + extractor_temperature`.
- **C17** (fourth review): v1 scope cut to MDMP Step 1 (Time Analysis + WARNO only); OPORD + Staff Estimates deferred to v2 behind `v1_scope: false` YAML flag.
- **C18** (fifth review): gate re-tightened to MDMP-topical filter (post-C17 corpus narrowing invalidated the M0.1 loosening).
- **C19** (sixth review): OCR-retry plan B — broken-CMap PDFs rescued via two-pass gate + `TesseractCliOcrOptions(force_full_page_ocr=True)`.  New shared module `graph/docling_converters.py`; new env vars `OCR_RETRY_ON_GARBAGE`, `OCR_RETRY_MAX_PER_FOLDER`, `OCR_LANGS`.  Requires Tesseract on PATH (macOS: `brew install tesseract`).
- **C20** (seventh review, late 2026-04-22, docs + YAML only, no code): (1) `data/phase3_prompt.example.txt` universalized — no hardcoded doctrine-PDF names or collection strings; (2) `label_ar` backfilled on the 7 retrieved fields of `templates/initial_planning_guidance.yaml` so the renderer stops falling back to ASCII Python keys. Both edits invalidate existing cache entries automatically.
- **C22** (ninth review, 2026-04-23): input surface SPLIT from one free-form brief into THREE per-doc briefs (`prompt_1` / `prompt_2` / `prompt_3`). `Phase3Inputs` pydantic shape unchanged — it remains the internal contract between extractor and renderer; only the user-facing input changed. `graph/generation/prompt_extractor.py` exposes `compose_three_prompts()` + `extract_inputs_from_three()`; the extractor system prompt now calls out the three labelled sections. CLI takes `--prompt-1 --prompt-2 --prompt-3`; Streamlit tab renders three text areas. Each rendered `.docx` now ships a sibling `<doc>.fields.json` (Pydantic `.model_dump()` of every resolved section) for field-by-field verification. A `run_prompts.json` audit file is written alongside `extracted_inputs.json` when the three-prompt path is used. Legacy `--prompt` (single-file) and `--inputs-json` (debug) surfaces are preserved; exactly one surface must be selected per run.
- **C21** (eighth review, 2026-04-23): v1 scope EXPANDED from 2 → 4 documents. NEW documents: `warning_order` (mapped-only, zero LLM — reuses HeaderSection/MetadataSection/OperationalSituation/MissionAndExecution/Annexes) and `staff_brief` (Step-1 running-estimate brief — reuses INTELLIGENCE_ESTIMATE/OPERATIONS_ESTIMATE/PERSONNEL_ESTIMATE/LOGISTICS_ESTIMATE). Zero net-new Pydantic classes; zero net-new fields. Three single-editable-surface files introduced: `graph/generation/schema/schemas.py` (all Pydantic classes in one file; legacy module files become re-export shims), `graph/generation/schema/field_catalog.py` (`FIELD_LABELS_AR[(class,field)]` → Arabic label), `graph/generation/prompts_ar.py` (`PROMPTS_AR[(template_id,class,field)]` → Arabic drafting prompt). Template loader overlays both catalogs onto the raw YAML dict at load time — **catalog wins** over YAML inline. CLI + UI now honour `template.meta.output_filename` (with `{document_slug}` substitution) so filenames follow the YAML. `DocumentSelection` gained `warning_order: bool = True` + `staff_brief: bool = True`. The full OPORD and full Steps 2–6 Staff Estimate stay v2-deferred (`v1_scope: false`). See [`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md) §C21 for full rationale.
- **C23** (tenth review, 2026-04-23): v1 MIGRATED TO Y-APPROVED FLAT SCHEMAS. Source of truth: `/Users/hextechkraken/Desktop/y/{time_estimates_edited,initial_planning_guide_edited,staff_brief_edited}.txt`. Three documents now own a `prompts/<doc>/` subfolder (schema.py + template.yaml + labels_ar.py + prompts_ar.py). `warning_order` kept as placeholder — its existing `templates/warning_order.yaml` + `graph/generation/schema/schemas.py` classes untouched, waiting on a Y schema. NEW TWO-FILE INPUT SURFACE replaces the three-prompt flow for the migrated docs: `--warning-order` + `--intel-report` + repeatable `--source-file kind=path` extras. Legacy `--prompt-*` / `--prompt` / `--inputs-json` paths preserved. NEW field kinds `source_file_extracted` (per-doc structured LLM call over user-uploaded files via `graph/generation/source_file_extractor.py` — returns a validated Pydantic-dict keyed by the document's Y field names, or the literal `"غير موجود في الملفات"` sentinel when absent) and `static_placeholder` (YAML literal for the three approved Arabic placeholders). Retrieval stack (Qdrant / section_drafter / critique / cache) untouched — still handles `kind: retrieved` doctrine fields. `.fields.json` now emitted in **Y-flat shape** for single-class templates; dispatcher asserts no empty strings (every blank surfaces as one of `غير متوفر في المدخلات` / `يُصدر لاحقاً` / `غير متوفر في العقيدة المتاحة`). New supporting modules: `graph/generation/source_file_reader.py` (Docling `.docx`/`.pdf`/`.txt` reader with sha256 + length cap via `PHASE3_SOURCE_FILE_MAX_CHARS`), `graph/generation/source_file_extractor.py` (per-doc `llm.with_structured_output(DynamicModel)` call), `scripts/smoke_y_schemas.py` (offline Y-key parity + no-empty-string check).
- **C24** (tenth review continuation, 2026-04-23): Y-STRUCTURED NESTED RENDERER LAYOUTS matching the old generator's §6 hierarchy. Three new layouts in `graph/generation/renderers/arabic_docx.py` — `y_time_analysis` (level-1 `الإطار الزمني للمهمة` + 5× level-2 time rows + level-2 sub-head + **5-col timeline table** with `النشاط / النسبة / المدة / البدء / الانتهاء`), `y_initial_planning_guidance` (same time block + table, then 8 × level-1 planning-directive headings), `y_staff_brief` (5 underlined section-headers: A. تقدير الاستخبارات والبيئة / B. تقدير العمليات / C. تقدير الأفراد / D. التقدير اللوجستي / E. الاستنتاجات العملياتية — level-3 / level-4 nesting for phased-tactics + higher-command blocks). Each migrated YAML now declares `layout: y_<doc>` and drops its per-section `heading:` (layouts emit their own section breaks). Reference: `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt` lines 917–1625.

See the **Session Handoff** block at the end of
[`docs/memory.md`](docs/memory.md) before resuming work.

LangGraph ingestion pipeline (7 nodes, disk-backed state):

```
.txt / .pdf / .docx
      │
      ▼
initialpages_convert (Docling first-10-pages probe → markdown preview on disk;
                       gives the gate real content to read, not a placeholder)
      │
      ▼
check_documents      (PER-DOC LLM gate — MDMP-topical filter (§C18);
                       on reject with garbage-keyword remark / low ASCII-letter ratio,
                       fires OCR retry → writes initial_pages_ocr.md → re-scores gate;
                       on accept tags doc needs_full_ocr=True for convert_document;
                       review bundle at output/not_enough/<slug>/<stem>/ with attempts[]
                       audit; downstream iterates state["eligible_documents"] only)
      │
      ▼
convert_document     (Docling full parse + OcrAutoOptions + per-page OCR escalation;
                       when needs_full_ocr=True, routes full parse to build_ocr_converter())
      │
      ▼
chunk_document       (HybridChunker @ max_tokens=512, merge_peers=True,
                       tokenizer = HuggingFaceTokenizer(AutoTokenizer("BAAI/bge-m3")))
      │
      ▼
enrich_chunks        (5 doctrine post-processors in order)
      │
      ▼
embed_chunks         (bge-m3 via FastEmbed add_custom_model ← aapot/bge-m3-onnx;
                       1024-dim dense + Qdrant/bm25 sparse)
      │
      ▼
upsert_to_qdrant     (named vectors: dense + sparse with modifier=IDF, RRF hybrid ready,
                       5 payload indexes (source_doc, chunk_type, paragraph_number,
                       paragraph_numbers, cross_refs) built before first upsert,
                       on_disk_payload=True, hash-gated delete-then-upsert, _registry)
```

One collection per folder named `ingest__<slug>__bgem3`. Retrieval is Phase 2
(not yet built). This phase builds the knowledge base.

**Full pipeline walkthrough**: [`walkthrough.md`](docs/walkthrough.md)
**Layout + state fields**: [`structure.md`](docs/structure.md)
**Ubuntu 22.04 LTS deployment shadow**: [`ubuntu_deploy_shadow.md`](docs/ubuntu_deploy_shadow.md)
**Phase 2 retrieval design (implemented, locked)**: [`referencedocs/17_phase2_retrieval.md`](referencedocs/17_phase2_retrieval.md)
**Phase 3 authoritative design (incl. §C17–§C19)**: [`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md)
**Phase 3 overview (M0–M6 landed)**: [`docs/phase3_walkthrough.md`](docs/phase3_walkthrough.md)
**PDF-failure fallback plan (§C19 design + forensic evidence)**: [`docs/pdf_failure_fallback_plan.md`](docs/pdf_failure_fallback_plan.md)
**Everything else**: [`memory.md`](docs/memory.md) (see the **Session Handoff** block at its end)

---

## Changelog — Session 2026-04-28 (§C34 — tiered retrieval search dev UI + reasoning-model deployment note)

Mirror of CLAUDE.md §C34.  See [`CLAUDE.md`](CLAUDE.md) for the full
audit trail.  Summary:

- New tab module [`ui/tiered_search_tab.py`](ui/tiered_search_tab.py) (~900 lines) registered as the third tab in [`ui/app.py`](ui/app.py).  Calls `graph.generation.retrieval_group::retrieve_group()` directly so the dev path verifies the production code path; do NOT add a parallel implementation.
- Six phases per [`tiered_search_ui_plan.md`](tiered_search_ui_plan.md): skeleton → wire-up → verdict banner (🟢/🟡/🔴) → tier-grouped tables with `[O:]` / `[D:]` tags → policy/threshold controls → optional compare-with-single-collection.
- Plus two opt-in extras: deterministic shared-anchor view (no LLM, surfaces real cross-tier relationships from existing payload metadata) and one-click LLM synthesis (one Responses-API round-trip; `max_output_tokens=2048` to leave headroom for reasoning-model chain-of-thought).
- Pre-deployment reasoning-model token-cap audit checklist landed in [`.env.example`](.env.example) above `QUERY_EXPAND_HYDE_MAX_TOKENS=256` and in [`docs/memory.md`](docs/memory.md) under "Pre-deployment checklist — reasoning-model token caps".  Before swapping production to Gemma 3 / Gemma 4 / GPT-o1 / DeepSeek-R1, run `grep -rn max_output_tokens` and verify each cap leaves room for ~1500–2000 tokens of hidden reasoning + visible answer.  Floor: 2048.
- No edits to `graph/`, no edits to YAML, no edits to production `.env` — pure UI + docs.

### Do NOT (§C34)

- Don't promote the `Phase 2 — Tiered Retrieval` tab to production.  Locked dev-only in `tiered_search_ui_plan.md`.
- Don't merge OF and doctrine hits by raw rerank score in any code path — cross-tier scores aren't directly comparable.
- Don't tighten `QUERY_EXPAND_HYDE_MAX_TOKENS` below 2048 with HyDE enabled against a reasoning model.

---

## Changelog — Session 2026-04-24 (late — env configured for live LM Studio)

**No code changes.**  Only [`.env`](.env) + [`.env.example`](.env.example)
edited so the repo reflects the current deployment and documents the
offline one by configuration.  Full test checklist is in the Session
Handoff block at the top of [`docs/memory.md`](docs/memory.md).

Active config in `.env`:

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

Why this shape:
- LLM + dense embedder → LM Studio over HTTP (it serves `/v1/responses` +
  `/v1/embeddings` on this host).  Responses API stays LOCKED ON per §C26.
- Reranker → FastEmbed ONNX (in-process).  LM Studio on this box has NOT
  been confirmed to expose `/v1/rerank`; the FastEmbed default
  `BAAI/bge-reranker-v2-m3` keeps working without code changes.
- `OPENAI_API_KEY=lm-studio` is a non-empty placeholder; the real wire
  auth is `LLM_API_KEY`.  A previous live `sk-proj-…` key was replaced
  per user directive.

`.env.example` updates (already in git-tracked template):
- Reranker comment rewritten with 4 simple rules: `/v1/models` is
  discovery-only; real inference must exist at `/v1/rerank` OR `/rerank`;
  `RERANK_BASE_URL` is the parent URL (app appends `/rerank`);
  `RERANK_MODEL` must be the exact id returned by `/v1/models` on the
  target server.
- WORKED EXAMPLE (A) = current LM Studio + FastEmbed setup.
- WORKED EXAMPLE (B) = offline machine with a concrete IP example
  (`192.168.1.50:7997`) showing LLM / embedder / reranker each on
  independent hosts, ports, tokens, and model ids.  Supported by
  configuration only — no code changes.

### Test commands for the next session (ordered)

```bash
# 1. LM Studio discovery
curl -sS http://localhost:1234/v1/models | jq '.data[].id'
#    expect: google/gemma-4-e4b, text-embedding-bge-m3 (update .env if the
#    actual LM Studio ids differ)

# 2. Factory / provider wiring
source venv/bin/activate
python -m graph.shared.llm_factory    # expect: Responses API True, base URL resolved
python -m graph.shared.embedders      # expect: provider=http, endpoint tag

# 3. Live embedder probe (NEW — was not exercised under §C26)
python -m graph.shared.embedders probe "sample text"

# 4. Retrieval smoke (needs Qdrant up)
colima start && docker start qdrant
./scripts/retrieval_smoke_test.py --max-glossary 3 --max-cross-refs 3
#    expect: 20 PASS / 0 FAIL; watch for cosine-parity drift between HTTP
#    bge-m3 GGUF (query-time) and FastEmbed ONNX (ingest-time) vectors.

# 5. Full 4-doc generation (cache will miss on llm_endpoint_tag flip)
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/NewOutputs_lmstudio
#    expect: 4/4 .docx + 4 *.fields.json, now sourced from Gemma via
#    LM Studio Responses API.
```

### Do NOT

- Don't flip `RERANK_PROVIDER=http` locally without a live POST probe
  against `http://localhost:1234/v1/rerank`.
- Don't remove the FastEmbed reranker path — it's the fallback for this
  dev box AND for offline deployments without a rerank sidecar.
- Don't commit `LLM_USE_RESPONSES_API=0`.  If Gemma's structured-output
  behaviour breaks, that flag is a temporary diagnostic only.
- Don't change the offline env shape.  `RERANK_PROVIDER=http` + URL +
  key + exact-model-id is the entire integration surface.

---

## Changelog — Session 2026-04-22 (late, §C18 + §C19 code + §C20 docs)

Quick reference for what concretely changed in this session.  Narrative
rationale is in the §C17–§C20 blocks above and in the scoping doc at
[`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md).

### New files

| file | purpose |
|---|---|
| [`graph/docling_converters.py`](graph/docling_converters.py) | Shared `get_textlayer_converter()` (singleton) + `build_ocr_converter()` (fresh per call) — one converter definition and one `OCR_LANGS` source of truth for `initialpages_convert`, `check_documents` (OCR retry), and `convert_document` |
| [`ui/phase3_tab.py`](ui/phase3_tab.py) | Streamlit M6 tab — paste Arabic brief → pick docs → Generate → download `.docx`; reuses the same extractor + assembler + renderer path as `scripts/generate_documents.py` |
| [`.env.example`](.env.example) | Committed template (Phase 1 + Phase 2 + `OCR_*` + every `PHASE3_*` knob).  Copy to `.env` on a fresh clone |
| [`docs/pdf_failure_fallback_plan.md`](docs/pdf_failure_fallback_plan.md) | §C19 design + forensic evidence (Caesar-29 per-span mixing; why Tesseract > de-ROT decoder) |

### Modified Python / YAML / config

| file | change |
|---|---|
| [`graph/config.py`](graph/config.py) | New fields `ocr_retry_on_garbage`, `ocr_retry_max_per_folder`, `ocr_langs`; new constant `FILE_INITIAL_PAGES_OCR = "initial_pages_ocr.md"` |
| [`graph/nodes/initialpages_convert.py`](graph/nodes/initialpages_convert.py) | Imports from `graph/docling_converters.py`; new exported helper `ocr_retry_preview(doc, cfg=None)` that writes `initial_pages_ocr.md` via force-full-page Tesseract OCR |
| [`graph/nodes/check_documents.py`](graph/nodes/check_documents.py) | New classifier (`_should_retry_with_ocr`) — regex on remark + ASCII-letter-ratio fallback; per-folder budget; OCR retry loop; tags rescued docs with `needs_full_ocr=True`; `_write_rejected_review` extended with `attempts[]` + `ocr_preview_path` audit trail |
| [`graph/nodes/convert_document.py`](graph/nodes/convert_document.py) | `_get_parser` / `_make_escalation_converter` now thin aliases to `docling_converters`; honours `needs_full_ocr=True` by routing the full parse straight to `build_ocr_converter()` |
| [`graph/prompts.py`](graph/prompts.py) | `SUFFICIENCY_CHECK_PROMPT` retopicalised to MDMP-topical filter (§C18).  Rejection remarks for unreadable content are required to use a keyword from the §C19 classifier list |
| [`data/phase3_prompt.example.txt`](data/phase3_prompt.example.txt) | Rewritten with explicit Arabic-output header + per-doc scope for Doc 1 (Time Analysis) and Doc 2 (WARNO); universalised (no hardcoded doctrine-PDF names or collection strings) per §C20; includes an explicit "extraction instructions" section enumerating the fields the extractor should populate |
| [`scripts/generate_documents.py`](scripts/generate_documents.py) | Two `.relative_to(REPO_ROOT)` call sites guarded with `is_relative_to()` so `--out` can point outside the repo (e.g. the user's Desktop) without throwing `ValueError` |
| [`ui/app.py`](ui/app.py) | Wraps the existing retrieval dev-UI inside `st.tabs(["Phase 2 — Retrieval", "Phase 3 — MDMP Step 1"])`; Phase 3 tab delegates to `ui.phase3_tab.render()` |
| [`.env`](.env) *(local, gitignored)* | Added the three `OCR_*` vars so the live config matches `.env.example` |

### Documentation updated

| file | change |
|---|---|
| [`docs/memory.md`](docs/memory.md) | Status line bumped to include §C18 / §C19 / §C20.  New §C18 (MDMP-topical gate) and §C19 (OCR-retry plan B) in binding-revisions list.  Six new "Do NOT" rules.  "What to do first" block rewritten to point at the Desktop `.docx` |
| [`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md) | New §C18 and §C19 sections with full rationale tables + What-changes / What-NOT-to-do lists.  §19.1 annotated with a "superseded by C18" historical note |
| [`docs/phase3_handoff_notes.md`](docs/phase3_handoff_notes.md) | Session N+2 block appended: commands executed, post-fix Qdrant state, punch list, reading-order for a fresh chat |
| [`CLAUDE.md`](CLAUDE.md) | Mirror of the updates here — status line, pipeline annotations, revisions summary, changelog |
| [`AGENTS.md`](AGENTS.md) *(this file)* | Status line, pipeline annotations, §C17–§C19 summary, Tesseract prereq, this changelog |

### Infrastructure / runtime state

- **Tesseract 5.5.2** installed at `/opt/homebrew/bin/tesseract` via `brew install tesseract`.  Add `brew install tesseract-lang` when a non-English corpus ships and flip `OCR_LANGS=eng+ara`.
- **Full re-ingest executed** (`python main.py`).  4/4 docs accepted; ADP 2-0 rescued via the new OCR retry path.  Qdrant state: 2398 total points — FM-5-0 = 1145, FM-6-0 = 678, ADP-5-0 = 342, **ADP-2-0 = 233** (via forced OCR).
- **Two Step-1 `.docx` rendered to user Desktop:**
  - `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/time_analysis.docx` (41 536 B)
  - `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/initial_planning_guidance.docx` (44 558 B)
  - `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/extracted_inputs.json` — audit trail
  - **Note:** these were rendered before the late §C20 prompt/YAML edits; a re-render after §C20 will invalidate the group cache (new `user_prompt_sha256`, new `yaml_group_hash`) and produce slightly different output.

### New env vars

| var | default | what it does |
|---|---|---|
| `OCR_RETRY_ON_GARBAGE` | `1` | Enable the two-pass gate.  `0` disables retry; rejects stay rejected |
| `OCR_RETRY_MAX_PER_FOLDER` | `5` | Max OCR retries per ingest folder.  Stops runaway OCR cost on folders of unreadable PDFs |
| `OCR_LANGS` | `eng` | Tesseract language pack(s).  Comma- or plus-separated (e.g. `eng+ara`) |

All three documented in `.env.example` + `.env`.

### How to verify in a fresh chat

```bash
# 1. Stack up
colima start ; docker start qdrant
curl -s http://localhost:6333/readyz   # expect "all shards are ready"

# 2. Retrieval smoke (expect 20 PASS / 0 FAIL — all four manuals in the index)
source venv/bin/activate
python scripts/retrieval_smoke_test.py --max-glossary 3 --max-cross-refs 3

# 3. Regenerate the two Step-1 docx under §C20 (invalidates the stale cache)
python scripts/generate_documents.py \
    --prompt data/phase3_prompt.example.txt \
    --docs time_analysis initial_planning_guidance \
    --out "/Users/hextechkraken/Desktop/mdmp_step1_post_c20"

# 4. Streamlit tab (optional)
streamlit run ui/app.py
# → click the "Phase 3 — MDMP Step 1" tab
```

---

## Setup (macOS, Apple Silicon)

One-time:
```bash
# Node + Homebrew already installed (see memory.md infrastructure state)
/opt/homebrew/bin/colima start
docker start qdrant || docker run -d --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  -v qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest
```

Daily:
```bash
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate
colima start       # if stopped
docker start qdrant   # if stopped
python main.py
```

For other operating systems, read [`transferOS.md`](docs/transferOS.md) before running.

---

## Project Structure

```
DecisionMakingSteps/
├── main.py                       ← Ingestion entry point
├── graph/
│   ├── state.py / config.py / builder.py / prompts.py
│   ├── fingerprints.py            ← sha256 cache-gate helpers (.stage_fingerprints.json)
│   ├── nodes/{initialpages_convert, check_documents, convert_document,
│   │          chunk_document, enrich_chunks, embed_chunks, upsert_to_qdrant}.py
│   └── post_processors/{classification_stripper, paragraph_number_extractor,
│                        cross_ref_extractor, glossary_splitter, acronym_expander}.py
├── scripts/{__init__, peek_qdrant}.py
├── utils/file_reader.py
├── inputs/<folder>/              ← Document folders to ingest (one folder per collection)
├── docs/
│   ├── memory.md                 ← Master index (read this first)
│   ├── walkthrough.md / structure.md
│   └── ubuntu_deploy_shadow.md / transferOS.md / langgraphtopics.md
├── referencedocs/                ← Per-topic research docs
├── libs/                         ← docling 2.89, fastembed 0.8, qdrant-client 1.17
├── output/                        ← gitignored
│   ├── <doc_stem>/                  one folder per source doc (initial_pages.md,
│   │                                parsed.json, diagnostics.json, chunks.jsonl,
│   │                                enriched_chunks.jsonl, embeddings.npz,
│   │                                acronyms.json, errors.jsonl,
│   │                                .stage_fingerprints.json — {artefact→sha256})
│   └── not_enough/<slug>/<stem>/    rejected-doc review bundles (check_decision.json
│                                     + copied initial_pages.md)
├── venv/                         ← Python 3.12 virtualenv
├── .env                          ← Config (gitignored, commented inline)
├── requirements.txt
├── AGENTS.md                     ← THIS FILE
└── CLAUDE.md                     ← Sibling convention file
```

See [`docs/structure.md`](docs/structure.md) for the full, annotated tree.

---

## Conventions

- Code heavily commented for beginner readability
- Type hints everywhere
- Pydantic models enforce structured LLM output
- **Filenames are never sent to the LLM** — content-only decisions
- `_get_llm()` / `_get_client()` / `_get_parser()` / `_get_chunker()` / `_get_dense_embedder()` / `_get_sparse_embedder()` — lazy-singleton per process, no module-level heavy objects (memory-hardening requirement)
- `load_dotenv()` before any `graph/` import in `main.py`
- All configuration in `.env` — no hardcoded hosts, ports, paths, device flags, or EP names in Python
- One collection per folder (`ingest__<slug>__bgem3`); deterministic UUID5 chunk IDs
- Hash-gated re-ingest: skip unchanged docs, delete-by-filter then upsert when `doc_content_hash` mismatches
- Skip-and-log on ALL ingestion failures (parse, embed, upsert) with detailed logging
- State is disk-backed — `IngestionState` holds paths, not objects
- Memory-hardening: every node processes one doc at a time; enrich/embed stream JSONL line-by-line; embeddings written as per-doc `<doc>.npz`; embed/upsert use batched calls (`EMBED_BATCH_SIZE=32`, `UPSERT_BATCH_SIZE=64`); both `initialpages_convert` and `convert_document` run `del doc; gc.collect()` between files
- **Per-doc LLM gate (2026-04-21):** `check_documents` makes one LLM call per doc; downstream nodes iterate `state["eligible_documents"]` so rejected docs never reach `convert_document` onward. Rejected-doc review bundles live under `output/not_enough/<slug>/<stem>/`.
- **Upstream sha256 cache (2026-04-21):** every upstream stage (`initialpages_convert`, `convert_document`, `chunk_document`, `enrich_chunks`, `embed_chunks`) stamps its artefact with the source sha256 in `output/<stem>/.stage_fingerprints.json` and skips the heavy call on reruns with unchanged content. Cache hit logs `stage:cached` (audit, non-failure). Bypass via `FORCE_REPARSE=1` in `.env`. `upsert_to_qdrant` keeps its existing `doc_content_hash` gate against Qdrant payload.

See [`memory.md`](docs/memory.md) for the full list of locked decisions and rules.

---

## Environment

- Python 3.12.13 (Homebrew)
- Node + colima + Docker for Qdrant server
- API key in `.env` as `OPENAI_API_KEY`
- Optional `HF_TOKEN` in `.env` speeds up the first bge-m3 download
  (~2.3 GB from `aapot/bge-m3-onnx` via HuggingFace).
- Optional `FORCE_REPARSE=1` in `.env` bypasses the upstream sha256
  cache gate so every stage does full work. Default `0`.
- **Tesseract required** on PATH for the OCR-retry path (§C19) — macOS:
  `brew install tesseract`.  Add `brew install tesseract-lang` when a
  non-English corpus ships and flip `OCR_LANGS` (e.g. `eng+ara`).
- Full surface in `.env.example` (committed 2026-04-22) — includes
  `OCR_*` + every `PHASE3_*` knob (extractor / draft / critique
  models + temperatures, retrieval sizing, `PHASE3_FORCE_REGENERATE`).
