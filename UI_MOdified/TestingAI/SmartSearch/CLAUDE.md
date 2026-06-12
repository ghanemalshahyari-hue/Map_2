# ⚠️ READ `memory.md` BEFORE DOING ANYTHING ⚠️

**Every new Claude chat working in this project must start by reading
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

Multiple offline hardenings applied for the airgapped i9 transfer (full
audit trail in `changesonS4.md`):

- **SSL bypass for self-signed HTTPS LLM**: `_get_client_for` in
  [graph/shared/responses_client.py](graph/shared/responses_client.py)
  builds `OpenAI(http_client=httpx.Client(verify=False))` so internal-CA
  HTTPS endpoints work without cert mounting. **Do not deploy this image
  on an internet-facing host.**
- **HF / Transformers / Datasets offline at runtime**: Dockerfile sets
  `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_DATASETS_OFFLINE=1`
  in the post-warmup ENV block. Build-time warmup downloads still work
  because these flags are NOT in the pre-warmup block.
- **tiktoken pre-cached**: `TIKTOKEN_CACHE_DIR=/app/.cache/tiktoken` +
  `warm_tiktoken()` in the warmup. Without this, the openai SDK hangs on
  first call trying to fetch encoding files.
- **Slim warmup**: bge-m3 dense + reranker were REMOVED from warmup —
  the offline target uses HTTP-served embedder + reranker
  (`EMBED_PROVIDER=http`, `RERANK_PROVIDER=http`). Saves ~3.4 GB. No
  local fallback if the HTTP server is unreachable.
- **Docling + RapidOCR critical**: warmup aborts the build if these
  weights can't be downloaded (modelscope.cn flakiness). Better to fail
  loud than to ship an incomplete image.
- **`.dockerignore`**: excludes `.env`, `venv/`, `output/`, `*.tar`, etc.
  from the build context.
- **Source volume mounts** in `docker-compose.yml`: `./graph`,
  `./scripts`, `./ui`, `./main.py` mount in so `.py` edits on the host
  take effect without rebuild. **Do NOT mount `./:/app`** — that would
  shadow `/app/.cache` and break offline operation.
- **Qdrant `check_compatibility=False`** at all 3 client-construction
  sites — cosmetic warning suppressor.

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
the CUDA code path and cannot auto-upgrade. The GPU wheels run fine on
a CPU-only host (transparent fallback at session-create time).

---

# DecisionMakingSteps

**LOCKED DECISION — provider-based model routing (2026-04-24, user
override).** Supersedes the earlier LM-Studio-only / LLM-only locked text.
The repo now supports swapping LLM, dense embedder, and reranker between
in-process FastEmbed and any OpenAI-compatible HTTP server (LM Studio,
Infinity, TEI, llama.cpp server, offline Linux box) by editing `.env`
only.

- **LLM** — [`graph/shared/llm_factory.py`](graph/shared/llm_factory.py)
  resolves `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` + per-role overrides
  (`PHASE1_GATE_MODEL`, `QUERY_EXPAND_LLM_MODEL`, `PHASE3_EXTRACTOR_MODEL`,
  `PHASE3_DRAFT_MODEL`, `PHASE3_CRITIQUE_MODEL`). Every `ChatOpenAI` uses
  `use_responses_api=resolve_use_responses_api()` (default ON) so the
  wire call is `POST /v1/responses`, NOT `POST /v1/chat/completions`.
  Verified: `langchain-openai==1.1.14` routes via
  `self.root_client.responses.create(...)` when the flag is True.
  `LLM_USE_RESPONSES_API=0` is an escape hatch for a local model that
  cannot serve the Responses API — not a silent-fallback knob.
- **Dense embedder** — [`graph/shared/embedders.py`](graph/shared/embedders.py)
  branches on `EMBED_PROVIDER` (`fastembed` default / `http` alias
  `lm_studio`). HTTP path = `HttpDenseEmbedder` (urllib, `POST /v1/embeddings`,
  L2-normalises every row defensively). FastEmbed path unchanged and fully
  wired as fallback.
- **Reranker** — [`graph/retrieval/rerank.py`](graph/retrieval/rerank.py)
  branches on `RERANK_PROVIDER` (`fastembed` default / `http`). HTTP path =
  `HttpReranker` (Cohere/Jina/Infinity/TEI shape, accepts `score` as alias
  for `relevance_score`). Raises `RerankUnavailable` on failure.
  [`graph/retrieval/search.py`](graph/retrieval/search.py) catches and
  degrades to RRF-only — retrieval never hard-fails on rerank outage.
- **BM25 sparse** — untouched. Not a model; runs in-process always.

Cache provenance ([`graph/generation/cache.py`](graph/generation/cache.py))
folds `llm_endpoint_tag`, `llm_use_responses_api`, `embed_provider`,
`embed_endpoint_tag`, `rerank_provider`, `rerank_endpoint_tag` into every
per-group key. Provider or URL flips invalidate drafts automatically.

Re-ingest warning: flipping `EMBED_PROVIDER=http` on a corpus ingested under
`fastembed` is vector-parity-sensitive (bge-m3 GGUF over HTTP is not
guaranteed bit-identical to the FastEmbed ONNX path). Probe parity before
the swap or re-ingest after. Reranker cutover is lower-risk — no stored
vectors change.

Do NOT add new construction paths that bypass `build_chat_llm()`, hardcode
`use_responses_api=False`, or instantiate `TextEmbedding`/`TextCrossEncoder`
directly outside `graph/shared/embedders.py` / `graph/retrieval/rerank.py`.

**Project status: PHASE 1 + PHASE 2 IMPLEMENTED; PHASE 3 v1 FULLY Y-MIGRATED (§C25, 2026-04-23); PROVIDER-BASED MODEL ROUTING LIVE (§C26, 2026-04-24); TIERED RETRIEVAL ARCHITECTURE COMPLETE (§C28→§C31, 2026-04-27); TIERED RETRIEVAL LIVE END-TO-END (§C32, 2026-04-28); ALL THREE EVIDENCE CHANNELS LIVE (§C33, 2026-04-28); TIERED RETRIEVAL DEV UI LIVE (§C34, 2026-04-28 — new `Phase 2 — Tiered Retrieval` Streamlit tab in `ui/app.py` calls `retrieve_group()` directly with a free-form query; surfaces 🟢/🟡/🔴 verdict banner + per-tier hit tables with `[O:]`/`[D:]` tags + deterministic shared-anchor view + opt-in one-LLM-call synthesis with inline `[O:]`/`[D:]` citations; dev-only tuning harness, NOT a production search surface; pre-deployment reasoning-model token-cap audit note added to `.env.example` near `QUERY_EXPAND_HYDE_MAX_TOKENS=256` and to `docs/memory.md` "Pre-deployment checklist — reasoning-model token caps" — first `source_files_field_map` opt-in on `initial_planning_guidance.planning_directives`; live e2e produced 1×`[S:]` + 9×`[O:]` + 1×`[D:]` tags with the three-Arabic-sub-heading endnote rendering all three populated tiers in canonical order) — doctrine reference library ingested into `ingest__doctrine__bgem3` (21 manuals from `inputs/doctrine/` → 11,207 chunks; ADP-3-0/ADP-3-90/ADP-4-0/ADP-6-0/ATP-3-01-8/ATP-3-04-13/ATP-3-20-15/ATP-3-21-18/ATP-3-21-8/FM-3-0/FM-3-01/FM-3-09/FM-3-11/FM-3-12/FM-3-34/FM-3-39/FM-3-90/FM-3-90-1/FM-3-90-2/FM-3-98/FM-6-02). First tier-aware YAML opt-in landed on `initial_planning_guidance.planning_directives` (5 fields, `policy: operationalfiles_then_doctrine`, both tier collections). Live e2e against LM Studio Gemma + Qdrant: **4/4 .docx clean** under locked `LLM_USE_RESPONSES_API=1`, including both previously-parked Gemma drafter failures (`Draft_planning_directives` + `Draft_conclusions`) — resolved by the new `_try_repair` two-step recovery in `graph/shared/responses_client.py` (deterministic `_lift_nested_keys` heuristic + schema-as-text strict json_schema repair). `initial_planning_guidance` produces 11 × `[O:]` + 4 × `[D:]` citation tags with the three-Arabic-sub-heading endnote (15 operationalfiles + 13 doctrine entries). `staff_brief` (legacy, no opt-in) produces flat citation list — byte-equal pre-§C31 layout preserved by a one-line renderer fix at `arabic_docx.py` line ~1909 (`has_tiered = len(populated_tiers) > 1`, sub-headings only when 2+ named tiers populated). New `scripts/tiered_retrieval_smoke.py` Phase-7 deliverable: 45/45 PASS coverage offline (no Qdrant or LLM dependency). Earlier locked text: operational corpus renamed `inputs/doctrine/` → `inputs/operationalfiles/` in §C28; `EvidenceBundle` + tier-aware drafter prompts + typed-evidence critique + canonical-sha256 cache key + tier-prefixed citation tags + three-Arabic-sub-heading endnote layout + six policy enum + coverage gate + kill-switch all landed §C29→§C31. `PHASE3_TIERED_RETRIEVAL=0` is the operator override bypassing the tiered path. Source-files channel (`[S:]` tags) is offline-tested only — no live opt-in yet. Phase 1 ingestion + Phase 2 retrieval stack untouched. — LLM / dense embedder / reranker all swappable between FastEmbed and any OpenAI-compatible HTTP server via `.env` alone. LLM locked to `POST /v1/responses`. FastEmbed is a first-class fallback for embedder + reranker, not deprecated. BM25 stays in-process. Rerank failure degrades to RRF-only, not hard-fail. ALL FOUR v1 documents still own a `prompts/<doc>/` subfolder each (`time_analysis`, `initial_planning_guidance`, `staff_brief`, `warning_order`). §C25 brought `warning_order` across the last mile: a Y-flat 50-field schema built from `/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf` (per-field explanations hoisted into Pydantic `Field(description=...)` so `with_structured_output` sees the user's own guidance), per-doc catalogs (`labels_ar.py` + `prompts_ar.py`), and a new `y_warning_order` renderer layout that mirrors old generator **doc 1** from `/Desktop/ToTransfer/New Text Document.txt` lines 939–1152 (bism line + `add_arabic_header` block + letter_ref_number2 centred + References/Maps/time_zone/task_assembly paragraphs + level-1/2/3 hierarchy for الموقف/مهمة المكون البري/التنفيذ/الإدامة/القيادة والسيطرة + SPLITTER on the 6 numbered-text fields + approval block + Appendices via `add_level_one_ML` + Viewports via `add_level_one_SHFAF`). §C23 two-file input surface (`--warning-order` + `--intel-report` + `--source-file kind=path` extras) unchanged; legacy `--prompt-*` / `--inputs-json` paths preserved for regression. Field kind `source_file_extracted` drives per-doc LLM extraction via `graph/generation/source_file_extractor.py`; retrieval stack (Qdrant / section_drafter / critique / cache) untouched and still handles `kind: retrieved` doctrine-retrieved fields. NESTED RENDERER LAYOUTS (§C24, 2026-04-23) `y_time_analysis` / `y_initial_planning_guidance` / `y_staff_brief` mirror the OLD generator's docs 3/4 and doc 2 hierarchy + 5-column timeline table. `.fields.json` emitted in the Y-flat shape (keys match `/Users/hextechkraken/Desktop/y/*.{txt,rtf}` verbatim); dispatcher guarantees no empty strings — every blank surfaces as one of three approved Arabic placeholders (`غير متوفر في المدخلات`, `يُصدر لاحقاً`, `غير متوفر في العقيدة المتاحة`). Live end-to-end verified against Qdrant + OpenAI — **4/4** `.docx` + 4 `*.fields.json` rendered at `/Users/hextechkraken/Desktop/NewOutputs/`. Prior session state (§C17–§C22) preserved: OCR-RETRY PLAN-B LIVE (§C19); MDMP-TOPICAL GATE LIVE (§C18); schemas-labels-prompts consolidation (§C21) still drives the two remaining legacy templates (`operation_order`, `staff_estimate`). Three-prompt / single-prompt input surfaces (§C22) still work.**
Phase 1 ingestion pipeline (7 nodes) and Phase 2 retrieval stack
(`graph/retrieval/` package + `ui/app.py` Streamlit UI + `start.sh`
bring-up + `scripts/retrieval_smoke_test.py` smoke harness) are both
implemented and committed on `main`. Phase 2 design locked in
[`referencedocs/17_phase2_retrieval.md`](referencedocs/17_phase2_retrieval.md).

**Phase 3 (template-driven document generation)** is scoped across four
md files; M0–M3 code has landed under `graph/generation/` (commit
`5e2aaf0`). **v1 ships FOUR Step-1 documents, all Y-migrated under
`prompts/<doc>/` (§C25, 2026-04-23):** `time_analysis` (تحليل الوقت),
`initial_planning_guidance` (دليل التخطيط الأولي), `staff_brief`
(إيجاز هيئة الركن), and `warning_order` (الأمر الإنذاري — 50 flat
fields from `/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf`,
`source_file_extracted` for every field, renderer layout mirrors old
doc 1). The full OPORD and full Steps 2–6 Staff Estimate stay
deferred to v2 via `v1_scope: false` on their YAMLs (§18 C17).
- [`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md) — **authoritative scoping doc** (decisions D1–D10, rollout M0–M6, pre-code gates §19, §C8–§C21 audit trail)
- [`referencedocs/19_phase3_arabic_renderer.md`](referencedocs/19_phase3_arabic_renderer.md) — renderer port guide (preserves old Arabic typography verbatim)
- [`referencedocs/20_phase3_templates_and_kinds.md`](referencedocs/20_phase3_templates_and_kinds.md) — YAML template + 5-kind field taxonomy
- [`docs/phase3_walkthrough.md`](docs/phase3_walkthrough.md) — project-level overview (read first in a fresh chat doing Phase 3 work)

Pydantic schemas at [`NewClasses.md`](NewClasses.md) (doctrine mirror
of the user's separate health `prompt.txt`, with field-mapping table
for rename-only port). **Input surface (§C22) is THREE per-doc
free-form briefs** — one feeds each LLM-driven document, and the
Warning Order has no prompt of its own (it reuses fields extracted
from `prompt_1` + `prompt_2`):

| prompt | feeds | sample file |
|---|---|---|
| `prompt_1` | Time Analysis — all `timing.*` fields (reporting time, H-hour, total minutes, time zone, BMNT/EENT, moon phase) | [`data/phase3_prompt_1.example.txt`](data/phase3_prompt_1.example.txt) |
| `prompt_2` | Initial Planning Guidance + Warning Order — `operation.*`, `references.*`, `locations.*`, `mission_intent_free_text` | [`data/phase3_prompt_2.example.txt`](data/phase3_prompt_2.example.txt) |
| `prompt_3` | Staff Brief — `operation.own_training_readiness`, `operation.movement_order`, free-form intel context (NOTE: enemy-field drafting still retrieves from doctrine; the free-form intel here is context only) | [`data/phase3_prompt_3.example.txt`](data/phase3_prompt_3.example.txt) |

The three prompts are concatenated with labelled section headers
(`[PROMPT 1 — TIME ...]` / `[PROMPT 2 — PLANNING ...]` /
`[PROMPT 3 — INTEL & READINESS ...]`) and passed to ONE extractor
LLM call. The extractor system prompt
([`graph/generation/prompt_extractor.py`](graph/generation/prompt_extractor.py))
treats each section as authoritative for its own field slice. The
validated `Phase3Inputs` remains the internal contract between
extractor and renderer — its target shape is still documented in
[`data/phase3_inputs.example.json`](data/phase3_inputs.example.json).
A legacy single-file `--prompt` surface and a debug-only
`--inputs-json` escape hatch both still work; exactly one surface
must be chosen per run (enforced by `scripts/generate_documents.py`).
**Phase 3 v1 ships .docx only** — PDF/TXT removed by user directive.
Each `.docx` now ships a sibling `<doc>.fields.json` carrying the
Pydantic `.model_dump()` of every resolved section, so a reviewer
can verify every field value without opening Word.
**Post-acceptance directive:** all models (embedder, reranker, LLM)
migrate to API endpoints after v1 acceptance — migration surface is
`.env` + existing `_get_*()` singletons, not Phase 3 source (see §7.4
of the scoping doc).

**Second-review revisions (2026-04-22; §18 C8–C15 of the scoping doc
hold the full audit trail):** retrieval merge is RRF-across-seeds +
**one** final rerank on the merged pool (per-call `rerank_score` is
not cross-seed-comparable); Phase 3 uses its own
`graph/generation/llm.py` (NOT the shared `_get_llm()` which is
hardcoded at temp 0.0); `.docx` bytes are NOT deterministic — cache
is the assembled `GeneratedDocument` pydantic instance;
citation-locator fallback is pre-resolved by the generation layer;
`NewClasses.md` is a reference only; inputs JSON-Schema is
auto-generated from a Pydantic model; a new `SourcedHit` wrapper
carries the originating collection on every hit.

**Third-review revision (C16, post-M2 2026-04-22):** input surface
flipped from user-authored `inputs.json` to a free-form operation
brief processed by an upstream extractor LLM. `Phase3Inputs` shape
preserved; only its source moved. Cache key folds in
`user_prompt_sha256 + extractor_model + extractor_temperature` so
extraction-provenance changes invalidate cache entries. See §18 C16.

**Fourth-review revision (C17, post-M3-code 2026-04-22): v1 scope
cut to MDMP Step 1 only — two documents (Time Analysis + Initial
Planning Guidance / WARNO).** OPORD and Staff Estimates deferred to
v2; their templates and schema modules stay on disk behind a
`v1_scope: false` flag, and the M3 retrieval / drafting / critique /
cache code (commit `5e2aaf0`) is preserved — correct under C17,
just not exercised by the v1 CLI. Doctrine corpus under
`inputs/doctrine/` swapped from 21 tactics manuals (archived at
`/Users/hextechkraken/Desktop/NatoDocs/`, outside the repo) to an
MDMP-focused set (FM 6-0, FM 5-0, ADP 5-0, ADP 2-0). Qdrant
collection rebuild is user-owned. See §18 C17.

**Fifth-review revision (C18, post-C17 2026-04-22): gate re-tightened
from topic-agnostic to MDMP-topical.** Under C17 the corpus is
deliberately MDMP-focused and v1 only targets Step 1, so the M0.1
loosening (designed for a 21-tactics-manual corpus) no longer fits.
The gate now accepts MDMP doctrine — MDMP itself, staff organization,
orders / plans (OPORD / WARNO / FRAGO), commander activities, operations
process, IPB, tactical manuals whose procedures feed planning, joint
doctrine — and rejects non-military material, non-doctrinal military
ephemera, garbage text, and non-MDMP technical content. The input
prompt ([`data/phase3_prompt.example.txt`](data/phase3_prompt.example.txt))
was also rewritten with an explicit Arabic-output header + per-doc
scope for Doc 1 (Time Analysis) and Doc 2 (WARNO). See §18 C18.

**Sixth-review revision (C19, post-C17 2026-04-22): OCR-retry plan-B
landed; ADP 2-0 rescued.** The 2019 ADP 2-0 PDF was produced with a
broken ToUnicode CMap (InDesign CC 2015 → Distiller 15.0) that makes
text-layer extraction return Caesar-29-shifted garbage. A blanket
de-ROT decoder was ruled unsafe (per-page mixed encoding — 74 of 88
pages have both shifted and clean spans). Instead: when
`check_documents` rejects a doc with a garbage-keyword remark, the
pipeline retries the first-10-pages probe with Tesseract
`force_full_page_ocr=True`, writes `initial_pages_ocr.md`, re-scores
the gate, and — on accept — tags the doc `needs_full_ocr=True` so
`convert_document` forces full-page OCR on the full parse. New shared
module [`graph/docling_converters.py`](graph/docling_converters.py)
holds both converter builders. New env vars `OCR_RETRY_ON_GARBAGE`,
`OCR_RETRY_MAX_PER_FOLDER`, `OCR_LANGS` (see [`.env.example`](.env.example)).
Tesseract prerequisite — macOS: `brew install tesseract`. Post-fix
ingest: 4/4 accepted, 2398 points, ADP 2-0 = 233 chunks via forced
OCR. Full design + forensic evidence in
[`docs/pdf_failure_fallback_plan.md`](docs/pdf_failure_fallback_plan.md).
See §18 C19.

**Seventh-review revision (C20, late 2026-04-22): prompt universalized
+ `label_ar` backfill.** Two docs-and-YAML-only edits after the user
opened one of the WARNO `.docx` files and saw `7. report_production:
<Arabic paragraph>` — an English field key leaking into finished
Arabic output — plus a directive to make
[`data/phase3_prompt.example.txt`](data/phase3_prompt.example.txt)
portable across future corpora:
(1) the prompt file no longer names specific doctrine PDFs (FM 6-0 /
FM 5-0 / ADP 5-0 / ADP 2-0) or the `ingest__doctrine__bgem3` collection
string; it tells the extractor WHAT facts to extract and what each of
the two docs broadly contains, without hardcoding which manuals the
retriever consults (those live in YAML `filters.source_doc`);
(2) `label_ar` added to all 7 retrieved fields in
`PLANNING_DIRECTIVES` / `OPERATIONAL_SAFETY_STANDARDS` of
[`templates/initial_planning_guidance.yaml`](templates/initial_planning_guidance.yaml)
so the Arabic labels render instead of the renderer's ASCII-key
fallback at
[`arabic_docx.py:1054`](graph/generation/renderers/arabic_docx.py#L1054);
Python/Pydantic keys stay ASCII. Acronyms inside parens (CCIR, PIR,
FFIR, BMNT, EENT) remain English — user rule: "no English in docs
**except acronyms**." Both edits invalidate existing cache entries
(prompt sha → `user_prompt_sha256`; YAML edit → `yaml_group_hash`),
so the next run rebuilds from scratch. See `docs/phase3_handoff_notes.md`
"Session N+3 — 2026-04-22 (late, §C20)".

**Streamlit Phase 3 tab** — `streamlit run ui/app.py` → "Phase 3 —
MDMP Step 1" tab. Paste brief → pick docs → Generate → download .docx.
Implementation in [`ui/phase3_tab.py`](ui/phase3_tab.py); all four v1
documents appear as checkboxes.

**Eighth-review revision (C21, 2026-04-23): v1 scope expanded from two
documents to four, and the schema/label/prompt surfaces consolidated
into three editable files.** User's Step-1 workflow is "input =
warning-order info + intel-analysis report; output = four Arabic
.docx." The four documents in v1 are now:

1. `time_analysis` — **تحليل الوقت** (unchanged; all computed)
2. `initial_planning_guidance` — **دليل التخطيط الأولي** (unchanged shape; labels + prompts now live in catalogs)
3. `warning_order` — **الأمر الإنذاري** (NEW, mapped-only, zero LLM — uses `HeaderSection` + `MetadataSection` + `OperationalSituation` + `MissionAndExecution` + `Annexes` from the shared schema module with all values resolved via `static` / `input` / `computed` kinds)
4. `staff_brief` — **إيجاز هيئة الركن** (NEW, mixed kinds — Step-1 running-estimate brief; INTELLIGENCE_ESTIMATE + OPERATIONS_ESTIMATE fields the commander can reasonably support at Receipt of Mission are `retrieved` against ADP-2-0 + FM-6-0 + FM-5-0 + ADP-5-0; PERSONNEL + LOGISTICS rows stay static `"يُصدر لاحقاً"` by doctrine)

Zero net-new Pydantic classes or fields were introduced — both new
documents reuse existing schema classes from `NewClasses.md`. The full
OPORD and full Steps 2–6 Staff Estimate remain deferred to v2
(`v1_scope: false`).

Three new "single editable surface" files introduced under §C21:

| file | purpose |
|---|---|
| [`graph/generation/schema/schemas.py`](graph/generation/schema/schemas.py) | **ALL** Pydantic schema classes in one file — HeaderSection, MetadataSection, OperationalSituation, MissionAndExecution, SustainmentAndCoordination, Annexes, INTELLIGENCE_ESTIMATE, OPERATIONS_ESTIMATE, PERSONNEL_ESTIMATE, LOGISTICS_ESTIMATE, MISSION_TIMELINE, CURRENT_TIME_REFERENCE, INITIAL_PLAN_TIMELINE, CURRENT_TIME_REFERENCE_2, PLANNING_DIRECTIVES, OPERATIONAL_SAFETY_STANDARDS. Rename a class here to rename its schema everywhere. The four legacy modules (`time_analysis.py`, `initial_planning_guidance.py`, `opord.py`, `staff_estimate.py`) are now thin re-export shims for backwards-compat. |
| [`graph/generation/schema/field_catalog.py`](graph/generation/schema/field_catalog.py) | `FIELD_LABELS_AR[(class_name, field_name)] → Arabic label`. One file to rename every Arabic label the renderer prints. Template loader overlays these onto YAML field specs at load time; **catalog wins** over inline YAML `label_ar`. |
| [`graph/generation/prompts_ar.py`](graph/generation/prompts_ar.py) | `PROMPTS_AR[(template_id, class_name, field_name)] → Arabic drafting prompt`. Same overlay mechanic — catalog wins over YAML inline `prompt_ar`. Edit once, every retrieved field picks it up. |

Other §C21 code edits (complete list in the changelog below): template
loader's `TEMPLATE_ID_TO_SCHEMA_MODULE` points every template_id at
`graph.generation.schema.schemas`; `DocumentSelection` gained
`warning_order: bool = True` + `staff_brief: bool = True`;
`ALL_DOC_IDS` in `scripts/generate_documents.py` + `V1_DOC_IDS` in
`ui/phase3_tab.py` cover the four v1 documents; the CLI + UI now honour
`template.meta.output_filename` with `{document_slug}` substitution so
`warning_order.yaml` produces `warning_order.docx` etc.

See [`memory.md`](docs/memory.md) for the authoritative locked
decisions and the **Session Handoff** block at its end before
resuming work.

---

## Changelog — Session 2026-04-28 (§C34 — tiered retrieval search dev UI + reasoning-model deployment note)

**Status: dev harness for the tiered-retrieval code path landed.**
New `Phase 2 — Tiered Retrieval` Streamlit tab in `ui/app.py` calls
`graph.generation.retrieval_group::retrieve_group()` directly with a
free-form query so a tester can observe the production tiered-retrieval
behaviour in isolation: coverage verdict, doctrine-fallback decision,
hits grouped by tier with `[O:]` / `[D:]` citation tags, and all six
policy enum values.  Read-only, no caching, every search fresh —
explicitly NOT a production search surface (locked in
[`tiered_search_ui_plan.md`](tiered_search_ui_plan.md)).  Two opt-in
extras added late in the session: a deterministic shared-anchor view
(no LLM, surfaces real cross-tier relationships from existing
payload metadata) and a one-click LLM synthesis view (one
Responses-API round-trip, prose summary with inline `[O:]` / `[D:]`
citations).  A reasoning-model token-cap audit checklist landed in
`.env.example` and `docs/memory.md` so the same gotcha won't bite
production when the user swaps to Gemma 3/4, GPT-o1, DeepSeek-R1, or
any future "thinks before speaks" model.

### Why this cut

The user asked for a dev harness to drive the tiered-retrieval code
path with arbitrary free-form queries — same `retrieve_group()`
call as document generation but interactive — for testing, tuning,
and explaining tier behaviour without running full document
generation each time.  The locked plan is
[`tiered_search_ui_plan.md`](tiered_search_ui_plan.md) (committed
alongside).  Six phases per plan plus two opt-in extras the user
requested mid-session.

### What changed on disk

| change | file | detail |
|---|---|---|
| **New tab module** | [`ui/tiered_search_tab.py`](ui/tiered_search_tab.py) (NEW, ~900 lines) | `render()` exposes the tab.  `_build_spec()` synthesises a one-field `GroupSpec` from one free-form query (`field_specs=()` is fine because no caller in this UI hits the cache-key path).  `_run_search()` calls `retrieve_group(spec, inputs)` against `data/phase3_inputs.example.json` (only used by `resolve_seeds` for `{a.b}` placeholder interpolation; free-form queries have none, so any valid `Phase3Inputs` works).  Per-search fresh — no caching, no destructive ops. |
| **Tab registration** | [`ui/app.py`](ui/app.py) | `_tab_retrieval, _tab_tiered, _tab_phase3 = st.tabs([...])` — third tab between the existing two.  New tab gets its collections from in-tab text inputs (the existing sidebar belongs to the original retrieval tab; one sidebar per Streamlit page). |
| **Reasoning-model env warning** | [`.env.example`](.env.example) | New annotated warning block above `QUERY_EXPAND_HYDE_MAX_TOKENS=256` documenting the reasoning-model token-cap footgun: reasoning models burn ~1000+ tokens of hidden chain-of-thought BEFORE producing visible output, so a tight cap (256) leaves zero budget for the visible answer → silent failure (`responses_client` raises `produced no final text`).  Recommended values: 256 for non-reasoning models, 2048 for any reasoning model.  Audit command (`grep -rn max_output_tokens`) included. |
| **Master-index pre-deployment checklist** | [`docs/memory.md`](docs/memory.md) | New "**Pre-deployment checklist — reasoning-model token caps**" section right after Three Critical Rules.  Audit command + table of all 4 cap sites today (drafter uncapped, HyDE 256, internal smoke probes 64/256, dev-tab 2048) and what to do for each when going to a reasoning model.  Recommended floor: 2048. |

### What `Phase 2 — Tiered Retrieval` does

Six phases per [tiered_search_ui_plan.md](tiered_search_ui_plan.md):

1. **Skeleton** — query input + Run search button.
2. **Wire-up** — `_build_spec()` synthesises a one-field `GroupSpec`; `_run_search()` calls `retrieve_group()`.
3. **Verdict banner** — colour-coded 🟢 strong / 🟡 weak / 🔴 empty over the operationalfiles tier; says whether doctrine fallback fired.  Computed from operationalfiles-tagged hits via `coverage_verdict()`; exactly mirrors the production gate.
4. **Tier-grouped tables** — separate expanders for `[O:]` and `[D:]` hits with rank / source_doc / locator / rerank / tag / preview columns.
5. **Controls** — six-policy dropdown (`operationalfiles_only`, `doctrine_only`, `operationalfiles_then_doctrine`, `operationalfiles_and_doctrine`, `all_channels`, `source_files_only`), OF/doctrine collection lists, rerank-query override, top-k/pool/merged/use_glossary, τ/k/m threshold overrides, sample-query expander.
6. **Compare with single-collection** — optional expander runs `graph.retrieval.search.search()` against the first OF collection only, same code path as the existing Phase 2 tab; useful for sanity-checking the tiered path matches the baseline.

Plus two opt-in extras (added late in the session):

- **Shared-anchor view** — `_collect_shared_anchors()` groups OF and doctrine hits when they share an anchor: `📌 direct citation` (OF cites doctrine `source_doc` or vice versa), `🔗 shared cross-ref` (both tiers cite the same upstream doc), `§ shared paragraph` (same `paragraph_number` — weakest signal).  Pure payload arithmetic, no LLM call.  Sparse signal — empty when the tiers don't reference each other in the chunks returned.  `_normalize_doc_id()` reduces `FM-3-01-Air-and-Missile-Defense.pdf` and `FM 3-01` to the canonical key `fm-3-01` (9/9 normalize cases pass).
- **LLM synthesis view (opt-in)** — checkbox `🧪 Synthesise answer with one LLM call (~3-5 s extra)` next to the Run search button.  When ticked, after retrieval completes, sends combined hits to the configured Responses-API endpoint with a system prompt locking: cite every claim inline with the `[O:]` / `[D:]` tag, call out where the tiers AGREE / COMPLEMENT / where DOCTRINE FILLS A GAP, no invented facts.  Uses `invoke_text(...)` from `graph.shared.responses_client`.  `max_output_tokens=2048` (see reasoning-model gotcha below).  Per-hit preview clipped at 600 chars to keep the prompt under Gemma's context window.

### Reasoning-model token-cap gotcha (caught + fixed during smoke)

Initial draft used `max_output_tokens=512`.  Smoke against LM Studio
Gemma 4-e4b returned `{"reasoning_only": true, "reasoning_tokens":
1018, "text_length": 0}` — the model burned 1018 tokens of hidden
chain-of-thought before any visible output, exceeding the 512 budget.
Fix: bumped to `2048` to leave room for ~1000-token reasoning +
~500-token answer + slack.  Defensive ceiling preserved (other code
paths cap output too).

This is a class of bug worth flagging for production — pre-deployment
notes added to `.env.example` and `docs/memory.md` so anyone deploying
with a reasoning model audits every `max_output_tokens` cap before
swapping.

### Acceptance — verified live

| query | policy | observed |
|---|---|---|
| `MDMP staff coordination` | `operationalfiles_then_doctrine` | strong verdict, fallback skipped, 8 `[O:]` / 0 `[D:]` |
| `إنتاج التقارير في مرحلة التخطيط` | `operationalfiles_then_doctrine` | weak verdict (1 distinct OF source), fallback fired, 8 `[O:]` / 8 `[D:]` |
| `mission command philosophy` | `all_channels` | both tiers populated, shared-anchor view found 3 groups (ADP-6-0 direct citation + shared xref, JP-1 shared xref) |
| `air defense coordination` | `all_channels` | both tiers populated, shared-anchor view honestly says "no overlap" — staff manuals & FM-3-01 don't cross-ref each other in payload |

LLM synthesis smoke (`mission command philosophy`, all_channels,
~10 KB prompt): 985-char prose with 5 inline `[O:]`/`[D:]`
citations plus explicit AGREE / COMPLEMENT calls.  ~26 s wall-clock
on Gemma 4-e4b (slow because reasoning model + LM Studio).

Offline architecture smokes unchanged: `python scripts/tiered_retrieval_smoke.py`
45/45 PASS, `python -m graph.generation.template_loader` 6/6 OK.

### Do NOT (§C34 additions)

- **Don't promote this tab into a production search UI.**  Locked in
  `tiered_search_ui_plan.md` — it's a dev harness for tuning the
  tiered logic, not an end-user surface.  Production search is the
  existing single-collection Phase 2 tab; production document
  generation is `scripts/generate_documents.py` / Phase 3 tab.
- **Don't bypass `retrieve_group` with a hand-rolled tiered search
  inside the UI.**  The whole point is to verify the production code
  path.  Re-implementing the logic in the UI defeats the purpose
  and would drift over time.
- **Don't merge OF and doctrine hits by raw rerank score.**
  Cross-tier scores aren't directly comparable (different content
  distributions).  The deliberate architecture is operationalfiles-
  first-then-doctrine in the prompt the drafter sees, with tier
  labels preserved.  The dev tool's split view enforces this.
- **Don't make the synthesis call run on every search.**  It's
  opt-in via checkbox — costs an LLM round-trip every click.
  Fanning it out implicitly would slow normal tuning to a crawl.
- **Don't drop the `2048` cap on the synth call** without bumping it
  to a still-defensive ceiling.  The cap protects against runaway
  generation if someone swaps to a cloud-billed endpoint.  `None`
  (no cap) would silently uncap a billed call.
- **Don't tighten `QUERY_EXPAND_HYDE_MAX_TOKENS` below 2048 when
  HyDE is enabled against a reasoning model.**  Same gotcha as the
  synth path — the visible HyDE hypothesis would silently fail.
  HyDE is off by default (`QUERY_EXPAND_HYDE=0`), so this only bites
  if/when someone turns it on with Gemma 3/4, o1, or R1.
- **Don't commit the runtime artefacts** the new tab's sidebar peer
  produces (e.g. `data/eval/cross_ref_prefixes_unseen.txt` or
  `output/_eval/feedback.jsonl`) as part of UI-development commits.
  They're discovery sinks / feedback logs, not session work.

### Starting point for next session

The dev UI is feature-complete and verified.  Possible next moves:

1. **Fold the `PHASE3_TIERED_RETRIEVAL=0` kill-switch into the UI**
   so a tester can compare tier-aware vs. legacy fast-path behaviour
   without editing `.env`.
2. **Calibrate the locked `(τ, k, m)` defaults** with the dev UI's
   threshold sweep against representative queries; today's defaults
   (0.30 / 8 / 2) may be conservative now that the dev tool produces
   live data on rerank-score distribution.
3. **Add a `source_files` channel exerciser** to the UI — today
   `source_files_field_map={}` is hard-wired in `_build_spec`; a
   future expansion could let the tester upload a small file and see
   `[S:]` tags surface.

---

## Changelog — Session 2026-04-28 (§C33 — source_files channel live: first `source_files_field_map` opt-in + placeholder filter)

**Status: all three evidence channels are now exercised live in
production.**  §C32 brought the operationalfiles + doctrine tiers
online; §C33 closes the architectural loop with the first live
`source_files_field_map:` opt-in.  `initial_planning_guidance.planning_directives`
now declares per-field source-file mappings on all 5 retrieved
fields, and a placeholder-text filter in `build_evidence_bundle`
prevents extractor-absent sentinels from being passed to the
drafter as evidence.  Live e2e produced **1 × `[S:]` + 9 × `[O:]` +
1 × `[D:]`** citation tags with the three-Arabic-sub-heading endnote
rendering all three populated tiers in canonical order
(source_files → operationalfiles → doctrine).

### Why this cut

§C32 left the third evidence channel offline-tested only — the
smoke harness covered the FactSnippet path, but no template had a
live `source_files_field_map:` opt-in.  Closing the loop is a
small, well-scoped diff: a YAML edit to declare the per-field
mapping plus a tiny filter in `build_evidence_bundle` to skip
placeholder strings that the per-doc extractor returns when the
uploaded source file doesn't contain the requested fact.  Without
the filter the drafter would see "غير متوفر في المدخلات" as a
"fact" and could cite it as a `[S:]` source — junk in, junk out.

### What changed on disk

| change | file | detail |
|---|---|---|
| **Placeholder filter in `build_evidence_bundle`** | [`graph/generation/evidence.py`](graph/generation/evidence.py) | Internal `_PLACEHOLDER_TEXTS` tuple (4 entries — extractor absent sentinel + 3 dispatcher placeholders) gates `extracted_values[extracted_key]` before constructing a FactSnippet.  Whitespace-stripped match.  Empty / placeholder values are silently skipped so the drafter only sees real scenario facts.  Kept inline (not imported from the prompts module) to avoid a generation→prompts dependency that the rest of `evidence.py` doesn't carry. |
| **First `source_files_field_map:` opt-in** | [`prompts/initial_planning_guidance/template.yaml`](prompts/initial_planning_guidance/template.yaml) | All 5 retrieved fields in `planning_directives` group declare `source_files_field_map: {<drafter_field>: <extracted_key>}`. Mappings: `report_production`/`coordination_duties`/`staff_duties` → `commander_intel_req`; `authorized_movements` → `ROE`; `times_locations_planning` → `time_now`.  Loader merges all 5 into one per-group dict (existing behaviour); only the mappings whose extracted value is non-placeholder fire and produce a FactSnippet at runtime. |

### Acceptance — live e2e

```bash
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs initial_planning_guidance \
    --out /Users/hextechkraken/Desktop/NewOutputs_tiered_v3

# initial_planning_guidance.docx — 43,955 B
# Tag distribution in fields.json:
#   [S:] × 1   (times_locations_planning ← time_now — only mapping with real content)
#   [O:] × 9   (FM-5-0, FM-6-0, ADP-5-0)
#   [D:] × 1   (FM-3-98 — doctrine fallback fired)
```

**Rendered citation block in `initial_planning_guidance.docx`:**

```
الاستشهادات
  ملفات مرفوعة من المستخدم    ← source_files sub-heading (NEW — was empty)
    [1] times_locations_planning — فقرة extracted
  المصادر التشغيلية
    [2..16] 15 entries from FM-5-0 / FM-6-0 / ADP-5-0
  المرجع العقيدي
    [17..29] 13 entries from FM-3-98 / FM-6-02 / FM-3-39 / ATP-3-21-8 / FM-3-90 / FM-3-34 / ATP-3-20-15
```

Canonical sub-heading order is enforced by the renderer
(`source_files` → `operationalfiles` → `doctrine`), matching the
locked tier order in `tiered_retrieval_discussion.md`.

### Why only 1 `[S:]` tag

The example WARNO/intel prompts do not contain CCIR/ROE content;
the per-doc extractor returns the absent sentinel for
`commander_intel_req`, `commander_intel_req2`, and `ROE`.  The §C33
placeholder filter correctly suppresses those 4 mappings (no
FactSnippet emitted), and the drafter sees one real
`[S: times_locations_planning §extracted]` snippet derived from
`time_now`.  When the user authors a richer warning order with
explicit CCIR + ROE content, the additional 4 mappings will fire
automatically — the YAML opt-in is content-driven, not run-driven.

### Offline validation

```bash
python scripts/tiered_retrieval_smoke.py        # 45/45 PASS (unchanged)
python -m graph.generation.evidence             # 4/4 OK (unchanged)
python -m graph.generation.template_loader     # 6/6 OK
python scripts/smoke_y_schemas.py               # 4/4 OK
```

The smoke harness already covered the source_files path via
`single_tier_flat_layout` (a single-tier output renders flat) and
`three_sub_heading_layout` (all three tiers populated → all three
sub-headings).  No new smoke test added — the live e2e plus
§C33-specific placeholder-filter unit tests inline cover the
gap.

### What's gated until later

- **Other templates** (`staff_brief.conclusions`, `operation_order.*`, `staff_estimate.*`) still don't declare `source_files_field_map:` and continue to use only the operationalfiles + doctrine channels.  Mechanical YAML extension when needed.
- **Per-field source kind** — the FactSnippet's `source_file_kind` defaults to empty so the citation tag falls back to `[S: <field_name> §extracted]` instead of `[S: <kind> §extracted]`.  Phase 7's stub comment in `build_evidence_bundle` notes a future extension to `{drafter_field: (extracted_key, kind)}` that would surface the source-file kind explicitly.  Out of scope here.
- **Coverage threshold tuning** still pending per §C32 open items.

### Do NOT (§C33 additions)

- **Don't remove the `_PLACEHOLDER_TEXTS` filter from `build_evidence_bundle`.**  It is the load-bearing guard between the per-doc extractor's "absent" output and the drafter's prompt context.  Removing it lets the drafter see "غير متوفر في المدخلات" as a `[S:]`-citable fact, which silently produces hallucinated provenance.
- **Don't expand the placeholder list to "anything that looks Arabic."**  The four entries are the pinned dispatcher / extractor sentinels — every other Arabic string is real content.  Adding heuristic matchers (e.g. "starts with غير") would suppress legitimate facts.
- **Don't drop the `source_files_field_map:` keys from a YAML when the extracted value is currently a placeholder.**  The placeholder filter does the right thing at runtime; YAML opt-in is content-agnostic by design.  Removing the YAML key would mean re-adding it later when the user authors a richer source file — wasted churn.
- **Don't claim the source_files tier requires a separate Qdrant collection.**  It is a verbatim-extraction channel.  Source-file content flows through the per-doc `extract_for_document` LLM call, NOT through retrieval.  No Qdrant collection is involved on this tier.

### Starting point for next session

All three evidence channels are now exercised live in production.
Tiered retrieval is feature-complete.  Remaining work is incremental
breadth (other templates) and tuning (coverage thresholds) — no
architecture changes outstanding.

---

## Changelog — Session 2026-04-28 (§C32 — tiered retrieval LIVE: doctrine library ingested + first YAML opt-in + Gemma drafter compliance fix)

**Status: tiered retrieval is live in production for the first time.**
Doctrine reference library ingested into `ingest__doctrine__bgem3`
(21 manuals, 11,207 chunks).  `initial_planning_guidance.planning_directives`
became the first tier-aware YAML opt-in (policy
`operationalfiles_then_doctrine`, both tier collections declared).
End-to-end run produced 4/4 `.docx` clean under the locked
`LLM_USE_RESPONSES_API=1`, including both previously-parked Gemma
drafter failures (`Draft_planning_directives` and `Draft_conclusions`).
Live citation tag distribution in the tier-aware document: **11 ×
`[O:]` + 4 × `[D:]`** with three-Arabic-sub-heading endnote layout
(15 operationalfiles entries + 13 doctrine entries; the doctrine
fallback fired in-paragraph for several seeds).

### Why this cut

Three independent moves bundled because each is small and they
share an acceptance contract — "all four v1 docs render cleanly with
tier-aware retrieval validated end-to-end against both tiers."  The
parked Gemma drafter compliance issue (see
[`docs/gemma_drafter_followup.md`](docs/gemma_drafter_followup.md))
was the load-bearing prerequisite for live validation: without the
fix the two retrieval-driven docs fail at `with_structured_output`
under `LLM_USE_RESPONSES_API=1`, blocking any tier-aware retrieval
proof from running on a real Qdrant fan-out.

### What changed on disk

| change | file(s) | detail |
|---|---|---|
| **Doctrine library ingested** | `inputs/doctrine/` (NEW) | 21 PDFs copied from `/Users/hextechkraken/Desktop/docs`: ADP-3-0, ADP-3-90, ADP-4-0, ADP-6-0, ATP-3-01-8, ATP-3-04-13, ATP-3-20-15, ATP-3-21-18, ATP-3-21-8, FM-3-0, FM-3-01, FM-3-09, FM-3-11, FM-3-12, FM-3-34, FM-3-39, FM-3-90, FM-3-90-1, FM-3-90-2, FM-3-98, FM-6-02.  Run via existing Phase 1 pipeline.  15 of 21 cache-hit on prior fingerprints (Apr-21 session — sha256 unchanged); 6 new docs full-processed.  Final: `ingest__doctrine__bgem3` = 21 docs / 11,207 chunks; `_registry` = `status: ok`. |
| **§C28 step 0.10 + 0.11 deferred cleanup** | Qdrant + `_registry` | Stale `ingest__doctrine__bgem3` (2398 pts, duplicate-of-operationalfiles content per §C28 verified by `content_hash_of_folder == 1f5be930b597b668`) deleted; corresponding stale `_registry` entry (`7eb10ab3-…`) deleted. Frees the slug for the new doctrine library. |
| **Gemma drafter compliance fix** | [`graph/shared/responses_client.py`](graph/shared/responses_client.py) | `_try_repair` rewritten (lines ~813–905) with two-step recovery: (1) **structural lift heuristic** (pure-deterministic, no LLM call) — when every required schema key is missing at top level but a single nested dict carries them, lift that nested dict to top level.  Targets the exact `Draft_planning_directives` / `Draft_conclusions` failure mode from the followup doc where Gemma puts schema fields under a `planning_guidebook` wrapper key while leaking prompt-context fields top-level.  (2) **Schema-as-text repair** — when the lift heuristic doesn't match, re-call the model with strict json_schema format AND `model_json_schema()` text inlined into the user prompt + prior failed output + validation errors.  Strict format gives Gemma server-side enforcement; the inlined schema text gives prompt-side guidance.  Falls back to prose-shape repair if the strict format itself is rejected.  New helper `_lift_nested_keys()` exported alongside. |
| **First tier-aware YAML opt-in** | [`prompts/initial_planning_guidance/template.yaml`](prompts/initial_planning_guidance/template.yaml) | All 5 retrieved fields in the `planning_directives` group (`report_production`, `coordination_duties`, `authorized_movements`, `staff_duties`, `times_locations_planning`) declare `policy: operationalfiles_then_doctrine` + `doctrine_collections: [ingest__doctrine__bgem3]`.  Loader's per-group consistency invariant satisfied (every field in a group must declare the same policy or none).  Legacy `collections: [ingest__operationalfiles__bgem3]` retained as the operationalfiles target (loader uses it as default for `operationalfiles_collections`). |
| **Renderer single-tier flat layout** | [`graph/generation/renderers/arabic_docx.py`](graph/generation/renderers/arabic_docx.py) | `render_citations_section()` trigger heuristic at line ~1909 changed from `has_tiered = any(entry.tier in _TIER_SUB_HEADINGS_AR for entry in entries)` to `populated_tiers = {e.tier for e in entries if e.tier in _TIER_SUB_HEADINGS_AR}; has_tiered = len(populated_tiers) > 1`.  Sub-headings are an ambiguity-resolution device; with one populated channel there is nothing to disambiguate so the flat layout is the right answer.  Without this fix, the §C29 default `tier="operationalfiles"` on `SourcedHit` leaks through to legacy templates and renders a single `المصادر التشغيلية` sub-heading even when no opt-in happened (cosmetic regression vs pre-§C31 byte-equal goal).  Live verified: `staff_brief.docx` (legacy) → flat list; `initial_planning_guidance.docx` (tier-aware) → three sub-headings. |
| **Tiered-retrieval offline smoke harness** | [`scripts/tiered_retrieval_smoke.py`](scripts/tiered_retrieval_smoke.py) (NEW) | Phase-7 deliverable per `tiered_retrieval_implementation.md` "When you finish Phase 7" §2.  45/45 PASS coverage: coverage gate verdicts (7), citation tag emission (8), citation tag parsing (5), `EvidenceBundle` assembly (5), `GroupCacheKey` invalidation triggers (7), renderer endnote layout (5), `retrieve_group` policy routing (8).  No live Qdrant or LLM dependency; runs in seconds.  Exercises the six-policy decision tree by mocking `_fan_out_search`, the lift heuristic by direct unit-test, and the renderer endnote by writing fixture `.docx` artefacts under `/tmp/tiered_retrieval_smoke/`. |

### Acceptance — live end-to-end against Qdrant + LM Studio Gemma

```bash
# 1. Doctrine collection populated (Phase 1 ingest):
ingest__doctrine__bgem3:        21 docs / 11,207 chunks (status: ok)
ingest__operationalfiles__bgem3:  4 docs /  2,398 chunks (unchanged)

# 2. Tiered architecture offline (no live services):
python scripts/tiered_retrieval_smoke.py
# → 45/45 PASS (coverage + tags + bundle + cache + renderer + routing)
python -m graph.generation.template_loader   # 6/6 OK
python scripts/smoke_y_schemas.py             # 4/4 OK

# 3. End-to-end against both tiers (LLM_USE_RESPONSES_API=1):
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/NewOutputs_tiered

# → 4/4 .docx clean:
#   time_analysis.docx                 41,569 B
#   initial_planning_guidance.docx     44,238 B   (tier-aware: 11 [O:] + 4 [D:] tags)
#   staff_brief.docx                   45,158 B   (legacy: flat citation list)
#   warning_order.docx                 43,820 B
```

**Citation distribution in `initial_planning_guidance.fields.json`:**
- `[O:` × 11 (FM-5-0, FM-6-0, ADP-5-0 — operationalfiles tier)
- `[D:` × 4 (FM-3-98, FM-6-02 — doctrine fallback fired)

**Rendered endnote in `initial_planning_guidance.docx`:**
- Heading `الاستشهادات`
- Sub-heading `المصادر التشغيلية` → 15 entries from the 4 MDMP manuals
- Sub-heading `المرجع العقيدي` → 13 entries from the 21-doc doctrine library
- No source_files sub-heading (none declared in YAML); no مصادر catch-all (every entry has a tier label).

**Rendered endnote in `staff_brief.docx`** (legacy template, did not opt in):
- Heading `الاستشهادات`
- Flat list of 14 entries (no sub-headings) — byte-equal pre-§C31 layout, confirmed by the renderer fix above.

### Gemma drafter fix — what now works

| group | template | previously fails | now |
|---|---|---|---|
| `Draft_planning_directives` | `initial_planning_guidance` | YES under Responses=1 | **PASS** under Responses=1 |
| `Draft_conclusions` | `staff_brief` | YES under both modes | **PASS** under Responses=1 |

The lift heuristic catches Gemma's specific failure mode without
spending an extra LLM round-trip; the schema-as-text repair is the
fallback when the wrapper-key shape doesn't match.  Both code paths
have offline unit tests in the smoke harness.

### What's gated until later work

- **`source_files` channel** — no group has declared `source_files_field_map:` yet, so no `[S:]` tags appear in any output.  Authoring a group that maps drafter fields to extracted source-file values exercises the third tier; not done in this session.
- **Coverage threshold tuning** — defaults `(τ=0.30, k=8, m=2)` are the locked v1 placeholder.  The doctrine fallback fired multiple times in this run (suggests reasonable sensitivity), but no formal calibration sweep ran.  Worth doing once we have user feedback on whether the doctrine tier over-fires.
- **Other templates** — only `initial_planning_guidance.planning_directives` opts in.  `staff_brief.conclusions`, `operation_order.*`, `staff_estimate.*` are still legacy.  Adding `policy:` keys to those YAMLs is mechanical YAML work; deferred until needed.
- **Phase 3 Streamlit UI** — tier-aware mode works through the CLI surface; the Streamlit tab uses the same dispatcher so it should "just work," but not retested live this session.

### Do NOT (§C32 additions)

- **Don't drop the structural-lift heuristic in a future "looks redundant" cleanup.**  It's the deterministic recovery path for the most common Gemma compliance failure mode and saves an LLM round-trip.  Removing it forces the schema-as-text repair to handle every wrapper-key shape, which is slower and probabilistically less reliable.
- **Don't change `_lift_nested_keys` to lift even when some required keys are at top level.**  Today: lifts only when ALL required keys are missing at top level but a nested dict has them.  A "partial lift" would silently overwrite top-level values and is unsafe.  When some required keys are at top level, the LLM repair pass with the explicit schema is the safer path.
- **Don't move tier-aware policy declarations out of YAML and into env or code.**  YAML opt-in per group is the locked surface — operators decide which groups go tier-aware by editing template files.  Promoting a global default flip via env (e.g. `PHASE3_DEFAULT_TIER_POLICY=all_channels`) is a footgun: it would make every group fan out doctrine even when the template author didn't ask for it.
- **Don't trigger sub-headings on single-tier output.**  The renderer fix at line ~1909 enforces the rule "sub-headings exist to disambiguate channels; one channel = nothing to disambiguate = flat layout."  Reverting that means legacy templates regress from byte-equal pre-§C31 behaviour.
- **Don't loosen `extra="forbid"` on the dynamic Draft_<group> classes** in `section_drafter.py` as a "quick fix" for compliance issues.  Loosening hides genuine schema mismatches.  The §C32 repair fix solves the compliance problem at the protocol layer (lift + schema-as-text) without weakening the schema contract.
- **Don't ingest more PDFs into `inputs/doctrine/` without re-running `python main.py`.**  The `_registry` content_hash_of_folder will mismatch on the next run if files are added/removed without re-ingesting; cache provenance for tier-aware groups will silently diverge until the next ingest run.
- **Don't claim the v1 documents now require tier-aware retrieval to function.**  Three of four (`time_analysis`, `staff_brief`, `warning_order`) remain legacy.  Only `initial_planning_guidance.planning_directives` is tier-aware.  Mixing claims invites bug reports against the wrong code path.

### Starting point for next session

Tiered retrieval is live and working.  Natural next moves:

1. **Author a `source_files_field_map:` opt-in** on a tier-aware group to exercise the third evidence channel (FactSnippets from uploaded WARNO + intel report).  Today every `[S:]` tag path is offline-tested only; the live path has no opt-in yet.
2. **Calibrate coverage thresholds** with a few synthetic and live runs against weak vs strong operationalfiles seeds; tune `(τ_strong, k_strong, m_docs)` toward the false-positive-fallback side per the locked plan's "conservative on purpose" rule.
3. **Promote `staff_brief.conclusions` to tier-aware** if the user wants the same treatment on their second LLM-driven document.  Mechanical YAML edit; smoke harness already covers the architecture.
4. **Migrate the deferred v2 templates** (`operation_order`, `staff_estimate`) to Y-flat schema + tier-aware retrieval, on the user's schedule.

---

## Changelog — Session 2026-04-27 (§C31 — tiered retrieval Phases 5 + 6 + 7)

**Status: tiered retrieval architecture complete.  Behaviour-preserving
for every legacy template; tier-aware policies turn on per group via
new optional YAML keys.**  Today no template opts in, so all four v1
docs continue to behave exactly as under §C30 — verified by 2/2
identical fields.json diffs across each phase boundary.  When a
template author adds `policy:` + `operationalfiles_collections:` +
`doctrine_collections:` to a group's YAML, the dispatcher routes
that group through the tiered fan-out, the coverage gate, and the
typed-evidence drafter / critique prompts that landed in §C29 and
§C30.

### Why this cut

Phases 5, 6, and 7 of `tiered_retrieval_discussion.md` (locked plan
v5) were bundled at user request because each is small and they
share an acceptance contract — "legacy templates produce same
resolved fields, same citations, same rendered behaviour."  Phase 5
is cache-only.  Phase 6 is renderer + citation-tag emitter (gated).
Phase 7 is the ONLY phase that could change user-visible behaviour
— it's gated by both YAML opt-in AND the `PHASE3_TIERED_RETRIEVAL`
kill-switch, so today's behaviour is unchanged on disk.

### What changed on disk

| change | file | detail |
|---|---|---|
| **Phase 5** — cache-key extension | [`graph/generation/cache.py`](graph/generation/cache.py) | `GroupCacheKey` gains 8 new fields: `source_evidence_sha256` (canonical sha of `source_files_field_map ∩ extracted_values`), `source_files_sha256_pairs` (per-upload `(kind, sha256)`), `tier_policy` (one of 6 policy enum values; `"operationalfiles_only"` for legacy), `tiered_retrieval_enabled` (kill-switch state), `operationalfiles_collections_sorted` + `doctrine_collections_sorted` (per-tier collection sets), `source_files_field_map_sha256`, `coverage_thresholds_tag`.  New `_canonical_sha256(obj)` helper pins the canonicalization rule (sort_keys + NFC + stable JSON) in one place; module docstring documents the four-step rule.  New env resolvers `resolve_default_tier_policy()`, `resolve_coverage_thresholds()`, `resolve_tiered_retrieval_enabled()`.  `compute_group_cache_key()` accepts 6 new optional kwargs (legacy callers don't have to thread anything new). |
| **Phase 6** — renderer + citation-tag emitter | [`graph/generation/renderers/arabic_docx.py`](graph/generation/renderers/arabic_docx.py), [`graph/generation/retrieval_group.py`](graph/generation/retrieval_group.py) | `_parse_citation_tag()` now returns `(slug, locator, tier)` and recognises both legacy `[<slug> §<locator>]` and tier-prefixed `[S/O/D: <slug> §<locator>]` shapes.  `CitationEntry` gains a `tier` field.  `collect_citations()` walks `evidence_bundles` when present (so FactSnippets appear in the endnote) and falls back to `retrieval_results`.  `render_citations_section()` emits a flat list when every entry is `tier="legacy"` (byte-equal to pre-§C31), and a three-Arabic-sub-heading layout (`ملفات مرفوعة من المستخدم` / `المصادر التشغيلية` / `المرجع العقيدي`) when any entry carries a tier label; mixed templates also emit a `مصادر` catch-all for any legacy entries.  `build_citation_tag()` gains `tier=` and `emit_prefixed=` kwargs (default `False` → legacy shape). |
| **Phase 6** — bundle thread-through | [`graph/generation/assembler.py`](graph/generation/assembler.py), [`graph/generation/field_dispatcher.py`](graph/generation/field_dispatcher.py) | `GeneratedDocument` gains `evidence_bundles: tuple[Any, ...] = ()` (additive).  `run_retrieval_phase()` now returns `(resolved_by_group, retrieval_results, evidence_bundles)`; the assembler threads the third element into `GeneratedDocument`.  `evidence_bundles` is `()` for templates with no retrieved fields (Doc 3) and for the dispatch_result-supplied test path. |
| **Phase 7** — YAML tier policies | [`graph/generation/template_loader.py`](graph/generation/template_loader.py) | `RetrievedField` gains 5 optional keys: `policy` (the locked-6 enum), `operationalfiles_collections`, `doctrine_collections`, `source_files_field_map`, `coverage_thresholds`.  All default to `None` / `[]` / `{}` so legacy YAML keeps producing today's resolved fields. |
| **Phase 7** — coverage gate | [`graph/generation/coverage.py`](graph/generation/coverage.py) (NEW) | Pure-arithmetic `coverage_verdict(hits, *, tau_strong, k_strong, m_docs) -> Literal["strong","weak","empty"]`.  Three signals (top rerank score, pool size, source diversity).  `resolve_thresholds_for_group(per_field_override)` merges YAML override onto env / locked defaults with `(tau, k, m)` fallback on garbage input.  Standalone `__main__` smoke covers all four verdicts + threshold resolver. |
| **Phase 7** — tiered retrieve | [`graph/generation/retrieval_group.py`](graph/generation/retrieval_group.py) | `GroupSpec` gains `tier_policy`, `operationalfiles_collections`, `doctrine_collections`, `source_files_field_map`, `coverage_thresholds` (all with legacy defaults).  `collect_group_specs()` propagates them.  `_fan_out_search()` accepts an optional `collections=` kwarg (defaults to `group.collections` for legacy callers).  `retrieve_group()` gains a kill-switch + tier-aware path: when `PHASE3_TIERED_RETRIEVAL=0` OR the group's policy is `"operationalfiles_only"`, the legacy fast-path runs verbatim; otherwise the tiered path runs operationalfiles fan-out, coverage gate (Phase 7), conditional doctrine fan-out, and tags hits + emits prefixed citation tags.  Six policy enum values supported. |
| **Phase 7** — assembler gate | [`graph/generation/assembler.py`](graph/generation/assembler.py) | `_template_has_source_evidence_consumers()` flips to inspect every `RetrievedField` for tier-aware keys; returns `True` only when at least one is set.  Pre-Phase-7 still returns `False` for every shipped template, keeping the assembler's hoisted-extraction path off when not needed. |
| **Phase 7** — env knobs | [`.env.example`](.env.example) | New `PHASE3_DEFAULT_TIER_POLICY` (default `"operationalfiles_only"`), `PHASE3_COVERAGE_TAU_STRONG=0.30`, `PHASE3_COVERAGE_K_STRONG=8`, `PHASE3_COVERAGE_M_DOCS=2`, `PHASE3_TIERED_RETRIEVAL=1` (kill-switch). |

### How tier-aware retrieval works (when a group opts in)

1. **YAML opt-in**: a retrieved field declares a tier policy.
   ```yaml
   field_x:
     kind: retrieved
     group: example
     query_seeds: [...]
     policy: operationalfiles_then_doctrine
     operationalfiles_collections: [ingest__operationalfiles__bgem3]
     doctrine_collections: [ingest__doctrine__bgem3]
     source_files_field_map:
       enemy_axis_text: enemy_axis    # drafter field ← extracted_values key
   ```
2. **Operationalfiles fan-out** runs first (RRF-across-seeds + final
   rerank, exactly as today).
3. **Coverage gate** (`graph/generation/coverage.py`) inspects the
   ranked operationalfiles pool against `(τ_strong, k_strong, m_docs)`
   thresholds.  Verdict: `"strong"` / `"weak"` / `"empty"`.
4. **Doctrine fan-out** fires when:
   - policy is `operationalfiles_then_doctrine` AND verdict is
     `"weak"` or `"empty"` (fallback flow), OR
   - policy is `operationalfiles_and_doctrine` / `doctrine_only` /
     `all_channels` (unconditional).
5. Hits get `tier="operationalfiles"` or `tier="doctrine"` stamped
   on each `SourcedHit`; citation tags become `[O: <slug> §<locator>]`
   or `[D: <slug> §<locator>]`.
6. **EvidenceBundle assembly** (in dispatcher) maps `extracted_values`
   subset (per `source_files_field_map`) into FactSnippets for the
   `source_files` channel.
7. **Drafter** (§C30) sees three labelled prompt blocks and locks
   the typed-evidence drafting rules.
8. **Critique** (§C30) applies the typed-evidence faithfulness rule
   — mission-specific entities require source_files OR
   operationalfiles support; doctrine alone validates only
   definitions / standards / procedures / framing.
9. **Renderer** (§C31 Phase 6) emits the citation endnote with three
   Arabic sub-headings, hidden when their channel is empty.

### Acceptance run in this session

```bash
# Offline smokes — every Phase-3 module:
python -m graph.generation.template_loader       # 6/6 OK
python scripts/smoke_y_schemas.py                # 4/4 OK
python -m graph.generation.evidence              # 4/4 OK
python -m graph.generation.cache                 # 7/7 OK
python -m graph.generation.coverage              # 6/6 OK
python -m graph.generation.section_drafter       # 3/3 OK
python -m graph.generation.critique              # 2/2 OK

# Per-phase end-to-end (time_analysis + warning_order — non-drafter
# docs that exercise the full assembler / dispatcher / renderer flow):
diff -q /tmp/phase34_smoke/*.fields.json /tmp/phase5_smoke/*.fields.json   # IDENTICAL
diff -q /tmp/phase5_smoke/*.fields.json  /tmp/phase6_smoke/*.fields.json   # IDENTICAL
diff -q /tmp/phase6_smoke/*.fields.json  /tmp/phase7_smoke/*.fields.json   # IDENTICAL
```

The drafter / critique behaviour for retrieval templates was NOT
re-tested live this session because the parked Gemma+Pydantic
schema-compliance issue (see
[`docs/gemma_drafter_followup.md`](docs/gemma_drafter_followup.md))
still blocks `initial_planning_guidance.planning_directives` (under
Responses=1) and `staff_brief.conclusions` (under both modes).
Behaviour-preservation evidence for these phases is the offline
smokes + the e2e diffs on docs that don't depend on the drafter.

### What turning tiered retrieval ON looks like

- **Today (no YAML opt-in)**: every group resolves to
  `tier_policy="operationalfiles_only"`.  `_is_tier_aware()` returns
  False.  `retrieve_group` runs the legacy fast-path verbatim.
  Citation tags stay legacy-shape.  `EvidenceBundle.tiers_consulted ==
  ("operationalfiles",)`.  Drafter + critique take their byte-equal
  legacy prompt path.  Renderer emits the flat citation list.
- **Tomorrow (one group opts in)**: the loader parses the new keys.
  `collect_group_specs` propagates them.  `_template_has_source_evidence_consumers`
  flips to True for that template, hoisting source-files extraction
  above retrieval.  `retrieve_group` runs the tiered path for the
  opted-in group only — every other group in the same template
  keeps its legacy fast-path.  Cache invalidates only for the
  affected groups (the new fields hash differently).
- **Rollback at any time**: `PHASE3_TIERED_RETRIEVAL=0` in `.env`
  forces the legacy fast-path even for tier-aware groups.  Doesn't
  require touching YAML.

### What's gated until the doctrine library is ingested

- `doctrine_collections: [...]` declarations work in YAML, but the
  doctrine fan-out hits an empty Qdrant collection until someone
  actually ingests that corpus.  Phase 0 freed the `doctrine` slug
  (collection name `ingest__doctrine__bgem3` is no longer in use);
  the existing Phase 1 pipeline takes care of ingesting `inputs/doctrine/`
  → that collection name when content shows up.
- Until then, declaring a `policy:` other than `"operationalfiles_only"`
  on a group whose `doctrine_collections` is unreachable produces
  zero doctrine hits — the operationalfiles tier still feeds the
  drafter.  No hard error.

### Do NOT (Phases 5 + 6 + 7 additions)

- **Don't drop any of the 8 new cache-key fields** from
  `GroupCacheKey` in a future "looks unused" cleanup.  They exist so
  flipping the relevant env var, YAML key, or uploaded source file
  invalidates affected groups.  Removing one silently caches stale
  drafts across the relevant change.
- **Don't bypass `_canonical_sha256()` for any new cache-key field
  that hashes user-authored Arabic content.**  The four-step
  canonicalization (sort_keys + NFC + stable JSON + UTF-8 → sha256)
  is pinned in the module docstring and the smoke test.  Hashing
  Arabic with `json.dumps(..., ensure_ascii=True)` will produce
  unstable digests across kashida + presentation-form variants.
- **Don't have the renderer emit prefixed citation tags directly.**
  Tag generation is upstream of the renderer (in
  `retrieval_group.py::build_citation_tag`); the renderer's
  `_parse_citation_tag` only reads what was emitted.  Adding tag
  emission to the renderer breaks the gating contract — prefixed
  tags should appear ONLY when a group's resolved policy is tier-
  aware.
- **Don't put coverage-check arithmetic anywhere but
  `graph/generation/coverage.py`.**  Phase 7's locked plan says the
  coverage gate is pure arithmetic with a clear interface so an
  LLM-based coverage extension can drop in at the same return type.
  Inlining the thresholds anywhere else makes that swap painful.
- **Don't make `retrieve_group`'s legacy fast-path read tier-aware
  state.**  The fast-path is byte-equal-output guaranteed for legacy
  YAML — adding a single tier-aware branch inside it would make
  the guarantee hand-wavy.  All tier-aware logic lives below the
  `if not tier_aware:` branch.
- **Don't promote the kill-switch into a YAML-level toggle.**  It's
  an env-only escape hatch by design.  YAML opt-in is the user
  interface; the kill-switch is the operator override.  Mixing them
  invites two-step regressions.
- **Don't ingest the doctrine library and silently flip
  `PHASE3_DEFAULT_TIER_POLICY`** to a non-legacy value globally.
  YAML opt-in per group is the contract.  A global default flip
  would make every group fan out doctrine even when the template
  author didn't ask for it.
- **Don't claim byte-identical .docx output across phase boundaries.**
  Use "same resolved fields, same citations, same rendered behaviour"
  in commit messages and tests.  The acceptance scope of every phase
  in this session was the `.fields.json` diff plus offline smokes,
  not literal .docx byte equality.

### Starting point for next session

Tiered retrieval architecture is complete.  Next-step options:

1. **Fix the parked Gemma drafter compliance issue** (see
   [`docs/gemma_drafter_followup.md`](docs/gemma_drafter_followup.md)).
   Independent of tiered retrieval; closes the 4/4 .docx gap.
2. **Ingest the doctrine reference library** into
   `inputs/doctrine/` → `ingest__doctrine__bgem3` via the existing
   Phase 1 pipeline.  No code changes needed.  Once content is
   indexed, edit one or more group YAMLs to declare a tier policy.
3. **Author the first tier-aware group** in YAML to exercise the
   doctrine fallback live.  The locked plan's acceptance criterion
   ("doctrine collection unreachable still produces output") is
   already satisfied because the operationalfiles fan-out runs
   independently.

---

## Changelog — Session 2026-04-27 (§C30 — tiered retrieval Phases 3 + 4)

**Status: drafter + critique migrated to `EvidenceBundle` together.
Behavior-preserving for every legacy template: byte-equal system
prompt, byte-equal user prompt, byte-equal LLM call, byte-equal
output.**  Locked plan rule says Phases 3 + 4 must ship in the same
commit so the drafter and critique can never disagree about which
evidence shape is in play — this cut respects that.

### Why this cut

Phases 3 + 4 of the locked tiered-retrieval plan
(`tiered_retrieval_discussion.md`) wire the drafter and critique
through `EvidenceBundle`.  Until Phase 7 toggles tier policies on,
every group's bundle has only `operationalfiles_evidence` populated
(no FactSnippets, no doctrine hits) — both modules detect this and
take a legacy fast-path that emits the pre-§C30 system prompt and
the pre-§C30 user prompt verbatim.  Cache keys do not change; cached
drafts from §C29 still hit on next run.

A dispatcher-side adapter builds the bundle once per group (in
`run_retrieval_phase`) so drafter and critique always see the same
instance — eliminates the most dangerous Phase-3-without-Phase-4
ordering hazard.

### What changed on disk

| change | file | detail |
|---|---|---|
| Phase 3 — drafter consumes bundle | [`graph/generation/section_drafter.py`](graph/generation/section_drafter.py) | `draft_group()` gains `evidence: EvidenceBundle \| None = None`.  When `None`, builds an operationalfiles-only bundle from `retrieval` (boundary adapter).  New `_format_evidence(bundle)` replaces `_format_chunks(retrieval)`; legacy bundles return byte-equal text, tiered bundles emit three labelled blocks (`[FACTS FROM UPLOADED SOURCE FILES]` → `[OPERATIONAL FILES]` → `[DOCTRINE REFERENCE LIBRARY]`).  Two system prompts: `_SYSTEM_PROMPT_AR` (legacy, unchanged) and `_SYSTEM_PROMPT_TIERED_AR` (typed-evidence drafting rules — mission-specific facts must be sourced from `source_files` OR `operationalfiles`; doctrine vouches only for definitions/standards/procedures/conceptual framing). |
| Phase 4 — critique consumes bundle | [`graph/generation/critique.py`](graph/generation/critique.py) | `critique_and_repair()` gains `evidence: EvidenceBundle \| None = None` (same boundary adapter pattern).  `_format_chunks(retrieval)` replaced with `_format_evidence(evidence)`; identical to drafter's so the two passes never see divergent evidence shapes.  Two system prompts: `_CRITIQUE_SYSTEM_AR` (legacy, unchanged) and `_CRITIQUE_SYSTEM_TIERED_AR` (typed-evidence faithfulness rule — mission-specific entities require `source_files` OR `operationalfiles` support; doctrine alone validates definitions / standards / procedures, NOT scenario facts; uncited sentences fail). |
| Phase 3+4 wiring | [`graph/generation/field_dispatcher.py`](graph/generation/field_dispatcher.py) | `run_retrieval_phase` builds the `EvidenceBundle` once per group (after `retrieve_group`) and passes the same instance to both `draft_group` and `critique_and_repair`.  `field_map={}` is hard-wired today; Phase 7 fills it from each group's `source_files_field_map` YAML. |
| smoke embedded | section_drafter + critique `__main__` | Synthetic 3-channel smoke for both modules: legacy bundle yields header-free byte-equal output; tiered bundle yields three labelled headers in canonical order; FactSnippet text is contained to the source_files block; tiered critique prompt embeds the typed-evidence rule. |

### The acceptance contract (from the locked plan)

The implementation file's stated acceptance criterion for Phase 3
("synthetic bundle with all three channels populated produces a
prompt with exactly the three labelled headers; FactSnippet text
never appears inside the operationalfiles or doctrine blocks") is
exercised by the embedded `__main__` smoke in
`section_drafter.py`.  The Phase 4 behavioral acceptance ("entity
supported only by doctrine → fails") requires the live critique
LLM and is exercised by end-to-end gen against tier-aware templates
(no such templates exist yet — landing in Phase 7).

### Acceptance run in this session

```bash
python -m graph.generation.template_loader      # 6/6 OK
python scripts/smoke_y_schemas.py               # 4/4 OK
python -m graph.generation.evidence             # 4/4 smoke OK
python -m graph.generation.section_drafter      # 3/3 format smoke OK
python -m graph.generation.critique             # 2/2 format smoke OK

# Byte-equal legacy chunk-block confirmation (drafter + critique):
python -c "...both formatters return identical text for legacy bundle..."
# OK both formatters produce byte-equal legacy chunk blocks for operationalfiles-only bundles

# End-to-end (non-drafter docs only — drafter-fragile docs blocked by parked Gemma issue):
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis warning_order \
    --out /tmp/phase34_smoke

diff -q /tmp/phase12_smoke/time_analysis.fields.json    /tmp/phase34_smoke/time_analysis.fields.json    # IDENTICAL
diff -q /tmp/phase12_smoke/warning_order.fields.json    /tmp/phase34_smoke/warning_order.fields.json    # IDENTICAL
diff -q /tmp/phase12_smoke/extracted_inputs.json        /tmp/phase34_smoke/extracted_inputs.json        # IDENTICAL
```

The drafter / critique behaviour for retrieval templates was NOT
re-tested live in this session because the parked Gemma+Pydantic
schema-compliance issue still blocks `initial_planning_guidance`
(under Responses=1) and `staff_brief` (under both modes).  The
byte-equal legacy-prompt evidence above is the strongest offline
guarantee that retrieval templates produce identical output post-
§C30: same system prompt, same user prompt, same LLM call.

### What's gated until later phases

- **`field_map` is empty** for every group.  Phase 7 will source it
  from each group's `source_files_field_map` YAML and from doctrine
  fan-out results.  Today no group declares the YAML key, so no
  FactSnippet ever lands in a bundle.
- **`source_file_records` is not threaded into the bundle yet.**
  Phase 7 will read the raw uploads (the Phase 0 reader's `ReadFile`
  list) at the dispatcher boundary and pass them in so FactSnippet
  carries `source_file_kind` + `source_file_sha256`.  Today both
  fall back to the empty string.
- **Coverage check is a no-op.**  `coverage_verdict` stays `"n/a"`
  until Phase 7 inspects pool size + top rerank score + source
  diversity to fire the doctrine fallback.
- **Citation tags stay legacy.**  The `[<source_doc> §<locator>]`
  shape is unchanged in this cut; the new `[O: ...]` / `[D: ...]`
  prefixed shape ships in Phase 6.  The drafter copies whatever
  `SourcedHit.citation_tag` carries — Phase 6 changes the upstream
  generator.

### Do NOT (Phases 3 + 4 additions)

- **Don't make any module skip the legacy fast-path.**  Removing the
  `_bundle_is_tiered(evidence)` branch and always emitting tiered
  prompts would change the user prompt for every legacy template,
  break cache parity, and re-call the drafter/critique LLM for
  groups that previously hit cache.  The fast-path is load-bearing
  for the "behavior-preserving until Phase 7" invariant.
- **Don't migrate one of drafter/critique without the other.**  The
  most dangerous error is a drafter that sees three-channel evidence
  while the critique only sees one channel, or vice versa — silently
  weakens faithfulness checking.  Phases 3 + 4 are bound together
  on purpose.
- **Don't have drafter and critique build separate bundles.**  The
  dispatcher builds one and passes the same instance to both so
  there is no risk of channel content disagreement.
- **Don't read tier policy from the YAML in `_bundle_is_tiered`.**
  The detector inspects only the bundle's content, not the YAML.
  When Phase 7 lands, the dispatcher decides which channels to
  populate by reading the YAML; the bundle then carries the verdict
  forward without a second YAML read in the drafter / critique
  modules.
- **Don't emit prefixed citation tags from the drafter.**  Citation
  tag generation is upstream of the drafter (Phase 6 work in
  `retrieval_group.py::build_citation_tag`); the drafter only
  copies whatever `SourcedHit.citation_tag` carries.

### Starting point for next session

Phase 5 (cache-key extension) is next.  Add
`source_evidence_sha256` + `source_files_sha256_pairs` + the
v5-listed tier-policy / collections / coverage-threshold tags to
`GroupCacheKey`.  Pin canonicalization (sorted keys, NFC, stable
JSON) in `cache.py`'s docstring.  Acceptance: edit one byte in
`data/phase3_prompt_2.example.txt`, re-run, observe affected groups
rebuild and unaffected hit cache; toggle `LLM_BASE_URL` in `.env`,
re-run, observe full cache rebuild.

After Phase 5, Phase 6 (renderer learns both tag formats and the
conditional three-sub-heading endnote layout) and Phase 7 (YAML tier
policies go live, coverage check fires, doctrine fan-out) finish
the architecture.  Phase 7 is the ONLY phase that turns user-visible
behaviour on.

---

## Changelog — Session 2026-04-27 (§C29 — tiered retrieval Phases 1 + 2)

**Status: behavior-preserving refactor.  Acceptance: 3/3 fields.json
identical against the Phase 0 baseline; template loader 6/6; Y-schema
smoke 4/4; new `evidence.py` self-smoke 4/4.**  Lays the type surface
and the call-order plumbing for Phases 3+4 (drafter + critique
migrate to `EvidenceBundle` together).  No user-visible behavior
change.

### Why this cut

Phases 1 and 2 of the locked tiered-retrieval plan (`tiered_retrieval_discussion.md`)
are quiet refactors with no behavior change.  Bundling them keeps
the diff coherent — Phase 1 reorders the assembler so source-files
extraction precedes retrieval; Phase 2 adds the type that retrieval
will eventually feed into the drafter.  Splitting them into separate
commits would have meant Phase 2 ships pure dead code for one extra
session.  Phases 3+4 (drafter + critique) MUST ship together per
the locked plan and are NOT in this cut.

### What changed on disk

| change | file | detail |
|---|---|---|
| Phase 2 — `tier` on `SourcedHit` | [`graph/generation/retrieval_group.py`](graph/generation/retrieval_group.py) | New field `tier: Literal["operationalfiles", "doctrine"] = "operationalfiles"`. Additive — every existing call site keeps its current semantics; the Phase 7 tiered fan-out will stamp the alternative `"doctrine"` value. |
| Phase 1 — `extracted_values` kwarg | [`graph/generation/field_dispatcher.py`](graph/generation/field_dispatcher.py) | `run_retrieval_phase(..., extracted_values=None)` accepts the per-doc resolved-source-files dict.  Forward-compat plumbing only — retrieval does not read it pre-Phase-7. |
| Phase 1 — assembler reorder | [`graph/generation/assembler.py`](graph/generation/assembler.py) | Source-files extraction now runs BEFORE `run_retrieval_phase()` when needed.  Threads `extracted_values` through to the retrieval phase.  New helper `_template_has_source_evidence_consumers(template)` returns `False` until Phase 7 introduces tier-aware YAML keys; reorder is gated on `_template_has_source_file_extracted_fields(template) OR _template_has_source_evidence_consumers(template)`.  Behaviour identical for legacy templates because retrieval never read `extracted_values` and extraction never read retrieval results — only the relative LLM-call order changes. |
| Phase 2 — new type module | [`graph/generation/evidence.py`](graph/generation/evidence.py) (NEW) | `FactSnippet` (uploaded-file fact), `EvidenceBundle` (three named channels: `source_files_evidence` / `operationalfiles_evidence` / `doctrine_evidence`, plus `coverage_verdict` / `tiers_consulted` / `provenance`), and a pure-function `build_evidence_bundle(group_result, extracted_values, field_map, ...)` builder.  No callers yet — Phase 3 (drafter) and Phase 4 (critique) consume it in the next cut.  Standalone `__main__` smoke covers empty / source-files-only / sparse-field_map / mixed-tier cases. |

### Acceptance run in this session

```bash
python -m graph.generation.template_loader   # 6/6 OK
python scripts/smoke_y_schemas.py             # 4/4 OK
python -m graph.generation.evidence          # 4/4 smoke OK

python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis warning_order \
    --out /tmp/phase12_smoke

# Diff against Phase 0 baseline:
diff -q /tmp/phase0_post_rename/time_analysis.fields.json    /tmp/phase12_smoke/time_analysis.fields.json    # IDENTICAL
diff -q /tmp/phase0_post_rename/warning_order.fields.json    /tmp/phase12_smoke/warning_order.fields.json    # IDENTICAL
diff -q /tmp/phase0_post_rename/extracted_inputs.json        /tmp/phase12_smoke/extracted_inputs.json        # IDENTICAL
```

`time_analysis` and `warning_order` are the two docs that complete
cleanly under the current `.env` (`LLM_USE_RESPONSES_API=1`); the
parked Gemma+Pydantic schema-compliance issue still blocks
`initial_planning_guidance` (under `=1`) and `staff_brief` (always)
— see [`docs/gemma_drafter_followup.md`](docs/gemma_drafter_followup.md).
The diff scope is therefore the two docs that don't depend on the
drafter LLM at all (both are pure `source_file_extracted` +
`computed`).  Together they exercise the full assembler reorder
through `extract_for_document()` — the LLM extractor call order
flipped relative to Phase 0, and the resolved fields are still
byte-stable.

### What's gated until later phases

- **Drafter / critique migration** to `EvidenceBundle` is Phase 3+4
  (must ship together).  Today drafter still consumes
  `GroupRetrievalResult` directly; Phase 3 wires the bundle in.
- **`build_evidence_bundle` is unused.**  Until Phase 3+4 land, the
  function exists only for the type smoke and as the contract that
  Phase 7's coverage check + fan-out will call.
- **`SourcedHit.tier` defaults to `"operationalfiles"`** for every
  hit returned by today's `retrieve_group`.  Phase 7's tiered fan-out
  will stamp `"doctrine"` on the doctrine-tier sub-pool.
- **`_template_has_source_evidence_consumers(template)` returns `False`**
  unconditionally.  Phase 7 inspects YAML for `policy:` /
  `source_files_field_map:` / `operationalfiles_collections:` /
  `doctrine_collections:` and flips the helper to return `True`.

### Do NOT (Phases 1 + 2 additions)

- **Don't add tier-aware logic to `retrieve_group`.**  Phase 7 owns
  that; today every hit gets `tier="operationalfiles"` by default.
  Adding doctrine-collection fan-out here without the coverage check
  + critique typed-evidence rule that lands in Phases 3+4 + 7 weakens
  faithfulness checking silently.
- **Don't have anything consume `EvidenceBundle` before Phase 3+4
  ship together.**  A drafter that reads from the bundle without a
  matching critique migration breaks faithfulness for non-operationalfiles
  evidence — the locked plan flags this as the most dangerous
  ordering hazard.
- **Don't move the assembler's source-files extraction back below
  retrieval.**  Phase 7's `source_files_field_map` per-group needs
  the extracted dict at retrieve time; the reorder is a precondition
  for that.
- **Don't drop the `extracted_values=` kwarg from `run_retrieval_phase`
  in a future "looks unused" cleanup.**  Phase 7 wires it into the
  per-group bundle assembly; removing it now means re-threading the
  same kwarg through the same call sites later.
- **Don't promote tiered retrieval to "live" in the project status
  line until Phase 7 ships.**  The architecture is still
  `operationalfiles_only` for every group; advertising tiered behaviour
  before Phase 7 misleads anyone reading the status.

### Starting point for next session

Phase 3 + 4 together: drafter consumes `EvidenceBundle`, critique
gains the typed-evidence faithfulness rule.  Pure
`graph/generation/{section_drafter,critique}.py` work; no YAML, no
`.env`.  Until tiered YAML keys exist (Phase 7), the drafter prompt
sees only the operationalfiles block and the critique rule reduces
to today's behaviour.

---

## Changelog — Session 2026-04-27 (§C28 — tiered retrieval Phase 0)

**Status: Phase 0 plumbing verified end-to-end against LM Studio Gemma.
Step 0.10 (delete old `ingest__doctrine__bgem3` collection) + step 0.11
(`_registry` cleanup) still pending — destructive, deferred to explicit
user OK.**  After acceptance, the rename frees the `doctrine` slug for
the future reference library.  Phase 1+ of tiered retrieval (the
actual feature build — `EvidenceBundle`, drafter / critique typed
evidence, coverage check, fallback flow) is NOT touched in this
session and lives entirely in `graph/generation/`; pick up there in
the next session.

### Why

Free up the `doctrine` collection slug for the future doctrine
reference library (the second tier in the tiered-retrieval plan).
After this rename, the existing operational corpus lives at
`ingest__operationalfiles__bgem3` and the `doctrine` slug is reserved
for the as-yet-uningested reference library.  Locked plan in
[`tiered_retrieval_discussion.md`](tiered_retrieval_discussion.md);
execution handoff in
[`tiered_retrieval_implementation.md`](tiered_retrieval_implementation.md).

### What changed on disk

| change | file(s) | detail |
|---|---|---|
| folder rename | `inputs/doctrine/` → `inputs/operationalfiles/` | contents untouched (FM-6-0, FM-5-0, ADP-5-0, ADP-2-0) |
| YAML collection refs | [`prompts/initial_planning_guidance/template.yaml`](prompts/initial_planning_guidance/template.yaml), [`prompts/staff_brief/template.yaml`](prompts/staff_brief/template.yaml), [`templates/operation_order.yaml`](templates/operation_order.yaml), [`templates/staff_estimate.yaml`](templates/staff_estimate.yaml) | `ingest__doctrine__bgem3` → `ingest__operationalfiles__bgem3`; 61 occurrences across 4 files |

`prompts/time_analysis/template.yaml` and
`prompts/warning_order/template.yaml` were on the locked-6 list but
contain zero retrieval refs (`default_collections: []`; all fields
are `computed` / `source_file_extracted`) — no edits needed.

### What was deliberately NOT touched

- **Legacy shadowed YAMLs** at `templates/initial_planning_guidance.yaml`
  (8 occurrences) and `templates/staff_brief.yaml` (10 occurrences).
  Per §C23 `resolve_template_path()` precedence (`prompts/<doc>/template.yaml`
  → `templates/<doc>.yaml`), those files are not loaded for the
  migrated docs.  The locked Phase 0 list explicitly omits them.
  If they are ever un-shadowed, retrieval will silently target a
  collection that no longer exists — flagged here so the next session
  knows.
- **Auxiliary references** in `data/phase3_inputs.example.json`,
  `scripts/peek_qdrant.py` (docstring example), `scripts/retrieval_smoke_test.py`
  (`--help` text + default), and `scripts/smoke_step1.sh` (`COLLECTION` default).
  Cosmetic — none affect runtime against the renamed collection because
  the live YAMLs override the defaults.  Update opportunistically.
- **`graph/generation/`** — Phase 0 is pure file-rename + YAML; no Python
  edits per the locked plan.
- **`data/doctrine/`** termbase + **`graph/doctrine_vocab.py`** — they're
  doctrinal-vocabulary tooling (acronyms, classification markings),
  not tier-specific.  Names kept per the locked plan.

### Verification done in this session

| check | result |
|---|---|
| `python -m graph.generation.template_loader` | 6/6 templates OK after YAML edits |
| `grep -rn "ingest__doctrine__bgem3" prompts/ templates/` | 0 hits in the 4 active files; 18 hits remain only in the two legacy shadowed files (intentional, see above) |
| `python -m graph.shared.embedders probe "test"` | 1024-dim L2-normalised vector against LM Studio |
| `python main.py` (re-ingest) | 5/5 cacheable stages: 4 cached, 0 executed; only `upsert_to_qdrant` did work |
| Qdrant `ingest__operationalfiles__bgem3` | **2398 points** (matches old collection) |
| Per-source breakdown parity | identical: FM-5-0 = 1145, FM-6-0 = 678, ADP-5-0 = 342, **ADP-2-0 = 233** (forced-OCR per §C19) |
| `python scripts/retrieval_smoke_test.py` | **20 PASS / 0 FAIL** / 1 INFO; reranker live, glossary expansion live, cross-refs match |
| End-to-end gen against new collection (LM Studio Gemma) | **3/4 .docx** clean: `time_analysis.docx` 41569 B (matches baseline byte-for-byte; deterministic), `initial_planning_guidance.docx` 43576 B (drafter via Responses=0 chat-completions path), `warning_order.docx` 43820 B (source-extraction only) |

`_registry` now has 2 points (old + new collections); old `ingest__doctrine__bgem3`
still present at 2398 points as the rollback path until step 0.10
fires.

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
cause but only fires under `=1`; under `=0` it works.  Both groups
retrieve correctly against the renamed collection — the drafter
receives chunks before the validation dies — so the rename is
verified for the retrieval path independently of the drafter
compliance issue.

**Possible mitigations (not implemented in this session, listed as
options for a future drafter-fix pass):**
- Loosen `extra="forbid"` on the drafter draft classes to `"allow"`
  or `"ignore"` and post-filter, so Gemma's "wrong but adjacent"
  shape is salvageable.
- Add a Gemma-specific repair prompt in `responses_client.py`
  that includes the schema explicitly + the prior failed output.
- Swap to a more compliant drafter model via `PHASE3_DRAFT_MODEL`
  (per-role override exists; only `LLM_MODEL` was used in this
  session).
- Pin the existing OpenAI key path for the drafter role only and
  keep LM Studio for embedder/extractor.

Out of Phase 0 scope.  Decide before Phase 1 of tiered retrieval lands.

### What the user must do next (for Phase 0 to be marked complete)

1. **Drop the old collection** once the 3/4 result is acceptable:
   ```
   python -c "from qdrant_client import QdrantClient; QdrantClient('localhost', port=6333).delete_collection('ingest__doctrine__bgem3'); print('deleted')"
   ```
2. **Clean `_registry` of the stale entry** (optional — `_registry`
   tolerates missing collections, but tidying keeps things honest).
3. **Update the project status line** at the top of this file to
   reflect Phase 0 complete + tiered-retrieval Phase 1 next.
4. **Decide on the `staff_brief.conclusions` Gemma issue** before
   starting Phase 1 — see the mitigation list above.  Phase 1 is
   purely additive in `graph/generation/` and can be implemented
   independently of the drafter compliance fix.

### Do NOT (Phase 0 additions)

- **Don't delete `ingest__doctrine__bgem3` before the user verifies the
  new collection.**  The old collection is the rollback path.  Step
  0.10 only fires after end-to-end resolved-field parity is acceptable.
- **Don't touch the legacy `templates/initial_planning_guidance.yaml` /
  `templates/staff_brief.yaml`** in this rename pass.  They're
  shadowed; editing them adds churn the locked plan rejected.  If a
  future change un-shadows them, do the rename then.
- **Don't promote Phase 0 to "complete" in the project status line
  until the user's re-ingest + smoke + delete sequence has run.**  Mid-
  phase doc updates lie about the state of disk.

---

## Changelog — Session 2026-04-24 (late — env configured for live LM Studio)

**No code changes.  Only `.env` + `.env.example` edited.**  The repo is now
live-configured for the dev box and documents the offline deployment by
configuration only.  Full rationale + test checklist in the Session
Handoff block at the top of [`docs/memory.md`](docs/memory.md).

Active configuration in [`.env`](.env):

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

Rationale for each choice:
- **LLM + embedder over HTTP** → LM Studio exposes `/v1/responses` and
  `/v1/embeddings` on this host and is the user's chosen local provider.
  Responses API is LOCKED ON (§C26) so `LLM_USE_RESPONSES_API=1` stays.
- **Reranker stays on FastEmbed** → LM Studio on this host has NOT been
  confirmed to expose a working `/v1/rerank` endpoint.  The code default
  `BAAI/bge-reranker-v2-m3` is used via `RERANK_PROVIDER=fastembed`; no
  `RERANK_MODEL` override needed.  Flip to `RERANK_PROVIDER=http` only
  after `curl -X POST http://localhost:1234/v1/rerank` returns the
  Cohere/Jina results shape.
- **`OPENAI_API_KEY=lm-studio`** → non-empty placeholder; `graph/config.py`
  gate passes.  Actual bearer header sent on the wire is `LLM_API_KEY`.
  The previous live `sk-proj-…` key was replaced per user directive —
  rotate upstream if exposed.

[`.env.example`](.env.example) updates:
- Reranker section rewritten with simple 4-rule guidance: `/v1/models`
  is discovery-only; inference must exist at `/v1/rerank` OR `/rerank`;
  `RERANK_BASE_URL` is the parent URL (app appends `/rerank` literally);
  `RERANK_MODEL` must be the exact id returned by `/v1/models` on the
  target server.
- WORKED EXAMPLE (A) documents the current LM Studio + FastEmbed setup
  verbatim.
- WORKED EXAMPLE (B) documents the offline-machine case with a concrete
  IP (`192.168.1.50:7997`) showing LLM / embedder / reranker each on
  their own host, port, token, and model id — supported by configuration
  only, no code changes.

Next-session test order (see memory.md handoff for the full commands):
1. `curl http://localhost:1234/v1/models` — confirm LM Studio serves the
   two model ids in `.env`.
2. `python -m graph.shared.llm_factory` — confirm Responses API + LM
   Studio endpoint resolution.
3. `python -m graph.shared.embedders probe "sample"` — confirm live
   `POST /v1/embeddings` returns a 1024-dim vector.
4. `./scripts/retrieval_smoke_test.py` — watch for cosine-parity drift
   between the HTTP bge-m3 GGUF query embedder and the stored FastEmbed
   ONNX vectors.  Re-ingest if scores drift materially.
5. `python scripts/generate_documents.py …` (full 4-doc run) — expect
   cache miss on `llm_endpoint_tag` flip and 4/4 `.docx` + 4
   `*.fields.json` under `/Users/hextechkraken/Desktop/NewOutputs_lmstudio`.

### Do NOT (this pass)

- Don't flip `RERANK_PROVIDER=http` locally without verifying
  `/v1/rerank` is live on this LM Studio build first.
- Don't remove the FastEmbed reranker code path — it's the load-bearing
  fallback for this dev box and for offline deployments that don't ship
  a rerank server.
- Don't hand the offline user a different env shape.  The documented
  `RERANK_PROVIDER=http` + URL + key + exact-model-id triple is the
  entire integration surface; code doesn't need to know anything else.

---

## Changelog — Session 2026-04-24 (§C26 — provider-based model routing + Responses API lock)

### §C26 — LLM + embedder + reranker provider abstraction

**User directive:** migrate all models (LLM, dense embedder, reranker) to a
provider abstraction so the same app can talk to LM Studio on the Mac dev box
now and the offline Linux model-server stack later by editing `.env` only —
no code changes. LLM must use `POST /v1/responses`, NOT
`POST /v1/chat/completions`. FastEmbed fallback for embedder + reranker must
remain a first-class working path, not dead code. BM25 stays in-process
forever. Rerank failure must degrade to RRF-only, not hard-fail retrieval.

Supersedes two earlier locked decisions from the same date:
- The "LM-Studio-only, LLM-only" migration (plan doc §4 + §8).
- The "FastEmbed-only future" framing in `docs/local_llm_migration.md`.

Both docs still exist (flagged as superseded with pointers to the new
architecture) so the decision history stays auditable.

### New files

| file | purpose |
|---|---|
| [`graph/shared/llm_factory.py`](graph/shared/llm_factory.py) | Central resolver. `resolve_llm_base_url()` / `resolve_llm_api_key()` / `resolve_model()` / `resolved_endpoint_tag()` / `resolve_use_responses_api()` / `build_chat_llm()`. Every `ChatOpenAI` the project builds goes through `build_chat_llm()`, which passes `use_responses_api=True` by default. |

### Modified files

| file | change |
|---|---|
| [`graph/shared/llm.py`](graph/shared/llm.py) | Rebuilt on top of factory. Code-side default model preserved as `gpt-4o-mini`. `_LLM_MODEL` alias kept for HyDE. New `_resolve_phase1_model()` exposed. |
| [`graph/generation/llm.py`](graph/generation/llm.py) | `draft_config` / `critique_config` / `extractor_config` use `resolve_model()`. `_get_configured_llm` keyed on `(model, temp, endpoint_tag)`. Temperatures unchanged. |
| [`graph/retrieval/hyde.py`](graph/retrieval/hyde.py) | `_resolve_hyde_model()` rides the shared fallback chain. Reuses Phase 1 singleton when resolved models match; otherwise builds via factory (inherits LM Studio endpoint). |
| [`graph/shared/embedders.py`](graph/shared/embedders.py) | **Provider branch** on `EMBED_PROVIDER` (`fastembed` default / `http` alias `lm_studio`). New `HttpDenseEmbedder` class — pure urllib, `POST /v1/embeddings`, defensive L2-normalisation on every row, FastEmbed-compatible `.embed()` / `.query_embed()` interface so call sites don't branch. FastEmbed path unchanged. New `resolve_embed_provider()` + `resolve_embed_endpoint_tag()` for cache provenance. Standalone `python -m graph.shared.embedders probe "text"` diagnostic. |
| [`graph/retrieval/rerank.py`](graph/retrieval/rerank.py) | **Provider branch** on `RERANK_PROVIDER` (`fastembed` default / `http`). New `HttpReranker` class — Cohere/Jina/Infinity/TEI `POST /rerank` shape, accepts `score` as alias for `relevance_score` for llama.cpp builds. New `RerankUnavailable` exception. New `resolve_rerank_provider()` + `resolve_rerank_endpoint_tag()`. |
| [`graph/retrieval/search.py`](graph/retrieval/search.py) | Catches `RerankUnavailable`, logs to stderr, continues with RRF-only ordering. Retrieval never hard-fails on rerank outage. |
| [`graph/generation/cache.py`](graph/generation/cache.py) | Six new fields on `GroupCacheKey`: `llm_endpoint_tag`, `llm_use_responses_api`, `embed_provider`, `embed_endpoint_tag`, `rerank_provider`, `rerank_endpoint_tag`. Hashed in the digest. Dropping any of them would silently return stale drafts across a provider swap. |
| [`.env.example`](.env.example) | Full provider env surface. Re-ingest warning documented inline for `EMBED_PROVIDER=http`. |
| [`main.py`](main.py), [`start.sh`](start.sh), [`ui/phase3_tab.py`](ui/phase3_tab.py) | Text rewording so nothing implies OpenAI-only or chat-completions-only. UI extractor config routes through `extractor_config()` so cache keys match the CLI. |

### Docs updated

| file | change |
|---|---|
| [`docs/memory.md`](docs/memory.md) | Top-of-file LOCKED DECISION block rewritten to describe the full provider architecture. New Session Handoff block for 2026-04-24 placed above the 2026-04-22 one. |
| [`CLAUDE.md`](CLAUDE.md) | LOCKED DECISION block at the top rewritten. This §C26 changelog added. |
| [`AGENTS.md`](AGENTS.md) | Same rewrite as CLAUDE.md. |
| [`docs/lm_studio_migration_plan.md`](docs/lm_studio_migration_plan.md) | Second post-implementation addendum added superseding §4 two-step migration and §8 reranker deferral. |
| [`docs/local_llm_migration.md`](docs/local_llm_migration.md) | Header flagged as architecturally superseded; useful-vs-stale bullets surfaced. |

### Env surface (definitive)

```ini
# LLM
LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_USE_RESPONSES_API=1
PHASE1_GATE_MODEL
QUERY_EXPAND_LLM_MODEL
PHASE3_EXTRACTOR_MODEL, PHASE3_DRAFT_MODEL, PHASE3_CRITIQUE_MODEL

# Dense embedder
EMBED_PROVIDER=fastembed|http
EMBED_BASE_URL, EMBED_API_KEY, EMBED_MODEL

# Reranker
RERANK_PROVIDER=fastembed|http
RERANK_BASE_URL, RERANK_API_KEY, RERANK_MODEL

# Unchanged
OPENAI_API_KEY  # placeholder e.g. "lm-studio" is acceptable
```

Model precedence: role-specific env var → `LLM_MODEL` → code-side default.

### Verification (what passed in the session; what was not run)

Passed:
- `python -m graph.generation.template_loader` — 6/6 OK
- `python scripts/smoke_y_schemas.py` — 4/4 OK
- `python -m graph.shared.llm_factory` — Responses API ON, endpoint resolved
- `python -m graph.generation.llm` — three config triples resolve
- `python -m graph.shared.embedders` — provider tag resolves
- Standalone `rerank` / `hyde` — usage still prints
- Factory test with `EMBED_PROVIDER=http + RERANK_PROVIDER=http + LLM_BASE_URL=...`: yields `HttpDenseEmbedder`; `ChatOpenAI.use_responses_api == True`; `base_url` + `model` set from env
- Dead-port `RERANK_BASE_URL` — raises `RerankUnavailable` as designed
- langchain-openai source inspection confirmed `/v1/responses` routing at `base.py:1485` when `use_responses_api=True`

Not run (live-service-dependent):
- `POST /v1/embeddings` probe against LM Studio
- `POST /v1/rerank` probe (build-dependent on LM Studio)
- `scripts/retrieval_smoke_test.py` (needs live Qdrant + corpus)
- End-to-end `scripts/generate_documents.py` against LM Studio

### Do NOT (§C26 additions)

- **Do not bypass `build_chat_llm()`.** All `ChatOpenAI` construction goes through the factory. Hardcoding `use_responses_api=False` or `model=...` on a new code path breaks the locked Responses-API decision and the cache provenance.
- **Do not instantiate `TextEmbedding` / `TextCrossEncoder` directly** outside `graph/shared/embedders.py` / `graph/retrieval/rerank.py`. The provider branch lives inside those modules; a direct instantiation skips the HTTP path entirely.
- **Do not flip `EMBED_PROVIDER=http` silently on an ingested corpus.** bge-m3 GGUF over HTTP is not guaranteed bit-identical to FastEmbed ONNX output. Probe parity (cosine > 0.9999 on normalised vectors) or re-ingest. The `graph.shared.embedders probe` diagnostic exists for this check.
- **Do not route BM25 through a provider.** BM25 is an algorithm, not a model. `Qdrant/bm25` runs in-process via FastEmbed's pure-Python implementation. User directive carves it out explicitly.
- **Do not hard-fail retrieval on rerank outage.** The `RerankUnavailable`-catch in `graph/retrieval/search.py` is load-bearing — removing it regresses to "one dead rerank endpoint kills all search".
- **Do not remove the FastEmbed branches.** Both `EMBED_PROVIDER=fastembed` and `RERANK_PROVIDER=fastembed` are first-class, working paths. FastEmbed is the working fallback for offline / no-HTTP deployments.
- **Do not drop `LLM_USE_RESPONSES_API` from env surface** without a user directive. The flag's job is the escape hatch; if it disappears, the project loses the only recovery path when a local model genuinely cannot serve `/v1/responses`.

### Starting point for next session

- Fresh chat reads `docs/memory.md` first → sees the 2026-04-24 Session Handoff block at the top, which lists everything above in condensed form.
- Live LM Studio exercise is a three-step `.env` edit (LLM_BASE_URL + LLM_API_KEY + LLM_MODEL) plus a cache-miss regenerate. The cache automatically invalidates stale drafts on the endpoint flip because `llm_endpoint_tag` is in the digest.
- If / when the user is ready to move embedder + reranker to HTTP: flip `RERANK_PROVIDER=http` first (no re-ingest), then `EMBED_PROVIDER=http` (re-ingest-sensitive — probe parity first).

---

## Changelog — Session 2026-04-23 (§C25 — Warning Order Y migration + doc-1-mirror layout)

### §C25 — Fourth Y-schema document (Warning Order)

**User directive:** "we want to generate a fourth file which is 'warning order'
now instead since we left it as placeholder before. i want it to follow the
structure in the following path `Desktop/y/WarningOrderJson`. the json has text
besides the fields to explain what each field is about, these descriptions
should be in the description field of the pydantic model." Follow-up: "it does
not follow the format of the formatting in New Text Document.txt like the
other three ... find the one that matches the number of fields as the warning
order. and then follow its same structure with paragraphs, tables etc."

Field count match: **OLD doc 1 (Main Public Health Response Plan)** — lines
939–1152 of `/Desktop/ToTransfer/New Text Document.txt`. Uses ~40 of the 50
Y-warning-order fields; the remaining 10 (`header4`, `situation`,
`mission_of_supporting_unit`, `join_op_{mission,purp,how,ops_desired_end}`,
`date_time`, `local_authorities`, `red_crescent`) inserted at the nearest
doctrinally-sensible anchor so the no-empty-strings post-condition still holds
and no Y field is silently dropped.

### New files

| file | purpose |
|---|---|
| [`prompts/warning_order/__init__.py`](prompts/warning_order/__init__.py) | Anchor for the per-doc editable surface. |
| [`prompts/warning_order/schema.py`](prompts/warning_order/schema.py) | Flat `WarningOrder` Pydantic class — 50 str fields. Per-field explanations from the user's reference RTF are hoisted verbatim into `Field(description=...)` so `with_structured_output` surfaces them to the extractor LLM. `extra="forbid"`, `DOCUMENT_CLASSES = (WarningOrder,)`. |
| [`prompts/warning_order/template.yaml`](prompts/warning_order/template.yaml) | All 50 fields `kind: source_file_extracted` with per-field `source_hint` (mostly `warning_order`; `intel_report` for terrain/weather/enemy_forces; `either` for CIVILIAN_CONSIDERATIONS / situation / area_interest / civil_considerations). Layout `y_warning_order`. |
| [`prompts/warning_order/labels_ar.py`](prompts/warning_order/labels_ar.py) | Arabic label per `("WarningOrder", <field>)`. Military wording (no health-themed cover text). |
| [`prompts/warning_order/prompts_ar.py`](prompts/warning_order/prompts_ar.py) | `EXTRACTION_PROMPTS_AR` — per-field Arabic extraction instructions. `DRAFTING_PROMPTS_AR = {}` (no doctrine fallback on WARNO; the ABSENT_SENTINEL path surfaces `PLACEHOLDER_NOT_IN_INPUTS_AR`). |

### Modified files

| file | change |
|---|---|
| [`graph/generation/template_loader.py`](graph/generation/template_loader.py) | `TEMPLATE_ID_TO_SCHEMA_MODULE["warning_order"]` routed to `prompts.warning_order.schema` (was `graph.generation.schema.schemas`). New entry in `TEMPLATE_ID_TO_CATALOG_MODULES` so per-doc labels+prompts overlay onto the YAML. |
| [`graph/generation/renderers/arabic_docx.py`](graph/generation/renderers/arabic_docx.py) | `_layout_y_warning_order` rewritten end-to-end to mirror old doc 1: bism → `add_arabic_header` block (today's Hijri + Gregorian dates from `time_math.format_hijri_date`/`format_gregorian_date`) → letter_ref_number2 centred underlined → scenario `date_time` as a dedicated paragraph → References / Maps / time_zone / task_assembly → LEVEL-1 الموقف with nested level-2/3 for terrain/weather/civil + friendly_forces via SPLITTER + gov/NGO with local_authorities & red_crescent as level-3 children + CIVILIAN + Attached/Detached (SPLITTER) + Operational_Assumptions (SPLITTER) → LEVEL-1 مهمة المكون البري + join-op sub-block + mission_of_supporting_unit → LEVEL-1 التنفيذ with level-2 Exc_command_purp / Concept_of_operations / Units_Duty (SPLITTER) / Duties_of_Other (SPLITTER) / تعليمات التنسيق with level-3 Timings / CCIR (SPLITTER) / Fire / Air / Risk / ROE (SPLITTER) / Media / Meeting / Excu (SPLITTER) / Movm → LEVEL-1 الإدامة (SPLITTER) → LEVEL-1 القيادة والسيطرة + ACCS → approval block "أقرّوا:" with three military signature lines → "الملاحق:" via `add_level_one_ML` → "الشفافات:" via `add_level_one_SHFAF`. Layout registered in `_LAYOUT_RENDERERS`. |
| [`scripts/smoke_y_schemas.py`](scripts/smoke_y_schemas.py) | `warning_order` registered with inline `Y_INLINE_KEYS` (reference source is RTF — not JSON-parseable). Smoke now covers 4/4 docs offline. |

### Smoke — offline + end-to-end

```bash
python -m graph.generation.template_loader
# → 6/6 templates OK (4 Y-migrated + operation_order + staff_estimate)

python scripts/smoke_y_schemas.py
# → 4/4 OK   Y-keys match, no empty values

# End-to-end against Qdrant + OpenAI
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/NewOutputs

# → 4/4 .docx + 4 *.fields.json + extracted_inputs.json + run_sources.json
#   time_analysis.docx                 41 585 B
#   initial_planning_guidance.docx     43 226 B
#   staff_brief.docx                   44 962 B
#   warning_order.docx                 43 213 B  (new §C25 layout)
```

### Do NOT (§C25 additions)

- **Don't rewrite the `y_warning_order` layout away from the old-doc-1
  hierarchy.** The 5-section level-1 structure (الموقف / مهمة المكون البري /
  التنفيذ / الإدامة / القيادة والسيطرة), the `add_arabic_header` block with
  today's dates, the 6 SPLITTER call sites, and the `add_level_one_ML` +
  `add_level_one_SHFAF` closers are load-bearing — changing them drifts from
  the user's reference output.
- **Don't rename `Commanders_Crtitical_Information_Requirements` or
  `Other_coordination_movm`.** The Y reference carries the original typos
  (`Crtitical`, `movm`) and the smoke test's inline key set asserts them
  verbatim. Renaming to the "correct" spelling will fail smoke.
- **Don't drop per-field `Field(description=...)`** from
  `prompts/warning_order/schema.py`. The text bodies come directly from the
  user's reference RTF and feed `with_structured_output` even when the prompt
  catalog is unavailable.
- **Don't add doctrine fallback to WARNO** without an explicit user ask. The
  Warning Order is a scenario-fact directive, not a doctrinally-grounded
  essay. Today's path: extractor → ABSENT_SENTINEL → `PLACEHOLDER_NOT_IN_INPUTS_AR`.

### Next session starting point

- **Four v1 documents active?** Yes — all four (`time_analysis`,
  `initial_planning_guidance`, `staff_brief`, `warning_order`) live under
  `prompts/<doc>/`. Legacy `templates/warning_order.yaml` stays on disk but
  is no longer resolved (per-doc `prompts/warning_order/template.yaml`
  takes precedence via `resolve_template_path`).
- **Reproducing the Desktop output:** same command as §C23/§C24, now with
  `warning_order` in the `--docs` list. Qdrant up (`docker start qdrant`),
  OpenAI key in `.env`, venv active.

---

## Changelog — Session 2026-04-23 (§C23 + §C24 — Y-schema migration + nested layouts)

### §C23 — Y-approved flat schemas + per-doc `prompts/` layout + two-file input surface

**User directive:** treat `/Users/hextechkraken/Desktop/y/*.txt` as the canonical
output-shape source of truth for three documents; migrate Phase 3 schemas to
match Y exactly; keep retrieval + smart-search; replace the manually-written
`--prompt-*` surface with a two-file upload workflow (Warning Order + Intel
Report + optional extras); guarantee no empty strings in final output.

**Per-doc layout under `prompts/`** — four files per doc, one source of truth
each:

| file | path |
|---|---|
| schema (one flat Pydantic class) | `prompts/<doc>/schema.py` |
| template with field kinds | `prompts/<doc>/template.yaml` |
| Arabic labels per field | `prompts/<doc>/labels_ar.py` |
| Arabic extraction/drafting prompts | `prompts/<doc>/prompts_ar.py` |

Plus `prompts/_universal_instructions_ar.py` (reusable extraction discipline —
no scenario-specific facts).

**Four field kinds** (two new, two existing):

| kind | resolver | where values come from |
|---|---|---|
| `computed` | `graph/generation/time_math.*` (unchanged) | dates / H-hour / 1:3-rule splits |
| `source_file_extracted` | **NEW** `graph/generation/source_file_extractor.py` | Warning Order + Intel Report (+ extras) via structured LLM call |
| `retrieved` | existing `retrieval_group` → `section_drafter` → `critique` (unchanged) | Qdrant `ingest__doctrine__bgem3` |
| `static_placeholder` | **NEW** — YAML literal (last resort) | one of three approved Arabic placeholders |

**Fallback chain for `source_file_extracted`**: extractor returns the literal
`"غير موجود في الملفات"` sentinel when a fact is genuinely absent; the
dispatcher substitutes one of the three approved placeholders — no empty
strings make it to disk. The `scripts/generate_documents.py::_dump_fields_json`
call now asserts this as a post-condition.

### New files

| file | purpose |
|---|---|
| [`prompts/__init__.py`](prompts/__init__.py) | Per-doc editable surface anchor. |
| [`prompts/_universal_instructions_ar.py`](prompts/_universal_instructions_ar.py) | Reusable Arabic extraction instructions + `ABSENT_SENTINEL_AR`. |
| [`prompts/time_analysis/{__init__,schema,labels_ar,prompts_ar}.py`](prompts/time_analysis/) + `template.yaml` | `TimeAnalysis` (10 Y fields). |
| [`prompts/initial_planning_guidance/`](prompts/initial_planning_guidance/) | `InitialPlanningGuidance` (18 Y fields). |
| [`prompts/staff_brief/`](prompts/staff_brief/) | `StaffBrief` (53 Y fields). |
| [`graph/generation/source_file_reader.py`](graph/generation/source_file_reader.py) | Docling `.docx`/`.pdf`/`.txt` reader → `ReadFile` records with sha256 + audit-friendly length cap (`PHASE3_SOURCE_FILE_MAX_CHARS`, default 48 000). |
| [`graph/generation/source_file_extractor.py`](graph/generation/source_file_extractor.py) | Per-doc structured LLM call (`llm.with_structured_output(DynamicModel)` — one `str` field per `source_file_extracted` YAML field). |
| [`scripts/smoke_y_schemas.py`](scripts/smoke_y_schemas.py) | Offline acceptance check: Y-key parity + no-empty-string rule for all three migrated docs. |

### Modified files

| file | change |
|---|---|
| [`graph/generation/template_loader.py`](graph/generation/template_loader.py) | Added `SourceFileExtractedField` + `StaticPlaceholderField` to the discriminated union. New `resolve_template_path()` helper with `prompts/<doc>/template.yaml` → `templates/<doc>.yaml` precedence. Added `TEMPLATE_ID_TO_CATALOG_MODULES` — per-doc overlay takes precedence over the legacy project-wide catalogs. `RetrievedField.prompt_ar` now defaults to empty string (catalog wins). Standalone `__main__` deduplicates by template_id so legacy YAMLs for migrated docs are skipped. |
| [`graph/generation/field_dispatcher.py`](graph/generation/field_dispatcher.py) | Three `""` fallback sites replaced with Arabic placeholders. `SourceFileExtractedField` branch added. `StaticPlaceholderField` branch added. New `extracted_values=` kwarg on `dispatch_template`. `StaticField` with empty-string value now coerces to `يُصدر لاحقاً`. |
| [`graph/generation/assembler.py`](graph/generation/assembler.py) | `assemble_document` accepts `source_files=` + `extracted_values=`. When the template declares `source_file_extracted` fields AND source files are supplied, `extract_for_document` runs before dispatch and the resulting dict is threaded through. |
| [`scripts/generate_documents.py`](scripts/generate_documents.py) | New `--warning-order` / `--intel-report` / `--source-file kind=path` surface (surface-gate enforces exactly one input surface per run). New `_load_from_source_files()` composes file text, runs `extract_inputs()`, returns `(inputs, composed_text, source_files)`. `_dump_fields_json` emits **flat** JSON for single-class templates + asserts no empty strings. `run_sources.json` audit written when the two-file surface is used. |
| [`.env.example`](.env.example) | New `PHASE3_SOURCE_FILE_MAX_CHARS` knob (default 48 000). |

### §C24 — Y-structured nested renderer layouts (matching old generator §6)

**User directive:** "there are 4 documents with the same amount of fields.
follow the paragraph and levels and tables for each. match the level 1, level
2 etc and table formatting, then produce the new documents."

Source of truth: `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt`
lines 917–1625 (the `generate_document` function, its four `document*` blocks,
and the 5-column `add_table(...)` call). The old generator used health-themed
cover Arabic but the field names match our Y schemas byte-for-byte, so the
hierarchy ports directly.

**Three new renderer layouts** registered in `_LAYOUT_RENDERERS`:

| layout | Y doc | mirrors | structure |
|---|---|---|---|
| `y_time_analysis` | `time_analysis` | old doc 3 | `1. الإطار الزمني للمهمة` (level-1) → 5× level-2 time rows → level-2 "توزيع وقت التخطيط" → **5-col timeline table** (النشاط / النسبة / المدة / البدء / الانتهاء) with 4 step rows + `الإجمالي` summary row |
| `y_initial_planning_guidance` | `initial_planning_guidance` | old doc 3 + doc 4 | Same time block + table as above, then 8 × level-1 planning-directive headings with the retrieved / extracted Arabic paragraph inlined |
| `y_staff_brief` | `staff_brief` | old doc 2 | 5 underlined section-headers (each resets level-1 counter): **A. تقدير الاستخبارات والبيئة**, **B. تقدير العمليات**, **C. تقدير الأفراد**, **D. التقدير اللوجستي**, **E. الاستنتاجات العملياتية** — uses level-3 / level-4 nesting for the phased-tactics + higher-command blocks exactly as old doc 2 did |

Shared helper `_render_y_time_allocation_block()` renders the common time
section (used by both `y_time_analysis` and `y_initial_planning_guidance`) so
the 5-col table definition stays single-source. Table rows come from
`generated.allocation.table_rows_ar` (the existing
`time_math.PlanningAllocation`), not re-derived.

Each migrated `template.yaml` dropped its per-section `heading:` block (the
layouts emit their own section breaks).

### Smoke — end-to-end against Qdrant + OpenAI

```bash
# §C23 two-file surface (the primary path)
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief \
    --out /Users/hextechkraken/Desktop/NewOutputs

# → 3/3 .docx + 3 *.fields.json + extracted_inputs.json + run_sources.json
#   time_analysis.docx                 41 571 B   (nested + 5-col table)
#   initial_planning_guidance.docx     43 264 B   (nested + table + 8 directives)
#   staff_brief.docx                   44 750 B   (5 sections, level-1..4 hierarchy)

# §C23 smoke (offline, no LLM / Qdrant — CI-friendly)
python scripts/smoke_y_schemas.py
# → 3/3 OK   Y-keys match, no empty values

# All templates still validate
python -m graph.generation.template_loader
# → 6/6 templates OK (3 Y-migrated + warning_order + operation_order + staff_estimate)
```

### Do NOT

- **Don't delete the legacy `templates/*.yaml`, `graph/generation/schema/*.py`,
  `graph/generation/prompts_ar.py`, or `graph/generation/schema/field_catalog.py`.**
  They still drive `warning_order` / `operation_order` / `staff_estimate` until
  the user ships Y schemas for those documents. The `TEMPLATE_ID_TO_SCHEMA_MODULE`
  map in the loader routes each template_id to its own module; don't collapse.
- **Don't rename or rekey the Y schemas.** The three flat `prompts/<doc>/schema.py`
  classes MUST keep the exact field names from
  `/Users/hextechkraken/Desktop/y/*.txt` (e.g. `time_Y` — capital Y, `ammunition`
  — lowercase, `Join_op_purp` — capital J lowercase purp). Smoke test
  (`scripts/smoke_y_schemas.py`) will fail loudly if they drift.
- **Don't let doctrine retrieval invent scenario facts.** `kind: retrieved` is
  for doctrinal framing / conclusions only. Unit names, H-hour, enemy
  positions, references — all `source_file_extracted`. Doctrine cannot
  fabricate what isn't in the source files.
- **Don't emit empty strings.** `_dump_fields_json` raises if any value is
  whitespace-only. If you see the assertion fire, trace to the dispatcher and
  add a placeholder path — don't bypass the check.
- **Don't skip the universal prompt.** `prompts/_universal_instructions_ar.py`
  is reusable — no scenario facts, no example H-hour values, no operation
  names. If you need to add extraction discipline, add a rule that applies to
  every future corpus, not one hardcoded example.
- **Don't add fallback chains silently.** For v1 a `source_file_extracted`
  field with the `"غير موجود في الملفات"` sentinel drops to the Arabic
  placeholder. A future doctrine-fallback pass is possible but hasn't been
  implemented — don't pretend it exists in the dispatcher.
- **Don't rewrite the old generator's level hierarchy in the YAML `structure`
  array.** The three `y_*` layouts hard-code the level-1/2/3/4 nesting from
  `/Desktop/ToTransfer/New Text Document.txt §6`. Changing headings or order
  drifts from the user's reference output. If you need a different shape, add
  a new layout name and keep `y_*` immutable.

### Next session starting point

- **Four v1 documents active?** No — still three (`time_analysis`,
  `initial_planning_guidance`, `staff_brief`). The fourth document will come
  back online when the user provides a Y schema for Warning Order. Until then,
  `warning_order.yaml` under `templates/` keeps working in isolation via the
  legacy stack.
- **Reproducing the Desktop output:** the command is above. Qdrant must be up
  (`docker start qdrant`), OpenAI key in `.env`, venv active. The `.group_cache`
  under the output dir is gitignored; first run hits OpenAI + Qdrant, subsequent
  runs with unchanged inputs + YAML hit the cache.
- **Adding a new Y document:** write `prompts/<doc>/schema.py`, `labels_ar.py`,
  `prompts_ar.py`, `template.yaml`; add entries to
  `TEMPLATE_ID_TO_SCHEMA_MODULE` + `TEMPLATE_ID_TO_CATALOG_MODULES` in
  `template_loader.py`; add `<doc>` to `ALL_DOC_IDS` in `scripts/generate_documents.py`;
  add the Y-reference to `Y_FILES` in `scripts/smoke_y_schemas.py`; write a
  `y_<doc>` layout in `arabic_docx.py` and register it in `_LAYOUT_RENDERERS`.
- **Current outputs** at `/Users/hextechkraken/Desktop/NewOutputs/`. Delete
  `/Users/hextechkraken/Desktop/NewOutputs/.group_cache/` if you want a clean
  retrieval rerun.

---

## Changelog — Session 2026-04-23 (§C22 — three-prompt input surface + per-doc fields JSON)

Input surface split: one free-form brief → three per-doc briefs. `Phase3Inputs`
stays unchanged (it's still the internal contract). Rationale: each of the
four v1 documents has a distinct content scope, so a writer can compose
the timing block independently of the planning block independently of the
intel block. The Warning Order has **no prompt of its own** — its fields
are drawn from whatever prompts 1 & 2 carried.

### New files

| file | purpose |
|---|---|
| [`data/phase3_prompt_1.example.txt`](data/phase3_prompt_1.example.txt) | Sample `prompt_1` — timing facts only (H-hour, reporting time, total minutes, time zone, BMNT/EENT, moon phase). Feeds Time Analysis. |
| [`data/phase3_prompt_2.example.txt`](data/phase3_prompt_2.example.txt) | Sample `prompt_2` — operation identity, task org, references, locations, commander's intent. Feeds Initial Planning Guidance + Warning Order. |
| [`data/phase3_prompt_3.example.txt`](data/phase3_prompt_3.example.txt) | Sample `prompt_3` — friendly-unit readiness + free-form intel picture. Feeds Staff Brief. |

### Modified

| file | change |
|---|---|
| [`graph/generation/prompt_extractor.py`](graph/generation/prompt_extractor.py) | System prompt gains a "THE USER MESSAGE CARRIES UP TO THREE LABELLED INPUT SECTIONS" block mapping each labelled section to its authoritative `Phase3Inputs` field slice. New public helpers `compose_three_prompts(p1, p2, p3)` and `extract_inputs_from_three(p1, p2, p3, *, llm=None)` — the latter returns `(Phase3Inputs, composed_text)` so the caller can stamp `user_prompt_sha256(composed_text)` into the cache key. Single-prompt `extract_inputs()` is unchanged — legacy callers keep working. |
| [`scripts/generate_documents.py`](scripts/generate_documents.py) | New flags `--prompt-1 --prompt-2 --prompt-3` (all three required together). Single-file `--prompt` kept for back-compat; `--inputs-json` kept as the debug escape hatch. A gate enforces exactly one surface per run. New `_load_from_three_prompts()` reads the three files, calls `extract_inputs_from_three`, and routes through the same `run_id` resolution as the single-prompt path. New `_dump_fields_json(generated, out_path)` helper writes `<doc>.fields.json` (Pydantic `.model_dump()` per schema class) next to every rendered `.docx`. When the three-prompt surface is used, `run_prompts.json` records the three raw prompts + composed sha-256. |
| [`ui/phase3_tab.py`](ui/phase3_tab.py) | Three `st.text_area` widgets replace the single one (seeded from the three example files). Generate button disabled until all three prompts have non-whitespace content. `_run_one` now dumps `<doc>.fields.json` alongside the `.docx`; the results panel adds a second download button + an expander showing the fields JSON inline for verification. `ExtractionError` now surfaces the specific prompt (`prompt_1` / `prompt_2` / `prompt_3`) if one was left blank. |

### Smoke (end-to-end, hits OpenAI + Qdrant)

```bash
python scripts/generate_documents.py \
    --prompt-1 data/phase3_prompt_1.example.txt \
    --prompt-2 data/phase3_prompt_2.example.txt \
    --prompt-3 data/phase3_prompt_3.example.txt \
    --docs time_analysis initial_planning_guidance warning_order staff_brief \
    --out /tmp/c22_smoke_three
# → 4/4 .docx + 4 *.fields.json + extracted_inputs.json + run_prompts.json
```

Offline smoke (no OpenAI call, uses the pre-canned `Phase3Inputs`):

```bash
python scripts/generate_documents.py \
    --inputs-json data/phase3_inputs.example.json \
    --docs time_analysis warning_order \
    --out /tmp/c22_smoke_offline
# → 2/2 .docx + 2 *.fields.json (the --inputs-json surface skips run_prompts.json by design)
```

### Do NOT

- Don't merge the three prompts back into one at the UI/CLI layer — the
  split is the contract the user asked for.  The extractor still sees
  ONE composed message, but the writer edits three.
- Don't rename `<doc>.fields.json` to `<doc>.json` — the `.fields.`
  infix flags it as a verification artefact, not an input.
- Don't let a single missing prompt fall back to empty-string
  extraction; raise `ExtractionError` with the specific prompt name
  (already enforced in `extract_inputs_from_three`).

---

## Changelog — Session 2026-04-23 (§C21 — four-doc v1 + catalog consolidation)

### New files

| file | purpose |
|---|---|
| [`graph/generation/schema/schemas.py`](graph/generation/schema/schemas.py) | Single-file Pydantic catalog (see §C21 narrative). All 16 schema classes; DOCUMENT_CLASSES tuple used by the loader's parity + cross-doc-ref passes. |
| [`graph/generation/schema/field_catalog.py`](graph/generation/schema/field_catalog.py) | `FIELD_LABELS_AR` dict — Arabic label per `(class, field)`. |
| [`graph/generation/prompts_ar.py`](graph/generation/prompts_ar.py) | `PROMPTS_AR` dict — Arabic drafting prompt per `(template_id, class, field)`. |
| [`templates/warning_order.yaml`](templates/warning_order.yaml) | New v1 document (mapped-only). |
| [`templates/staff_brief.yaml`](templates/staff_brief.yaml) | New v1 document (mixed kinds; 9 retrieved fields, 2 groups). |

### Modified

| file | change |
|---|---|
| [`graph/generation/schema/schemas.py`](graph/generation/schema/schemas.py) | NEW — see above. |
| [`graph/generation/schema/{time_analysis,initial_planning_guidance,opord,staff_estimate}.py`](graph/generation/schema/) | Collapsed to thin re-export shims pointing at `schemas.py`. `DOCUMENT_CLASSES` preserved. |
| [`graph/generation/schema/inputs.py`](graph/generation/schema/inputs.py) | `DocumentSelection` gained `warning_order: bool = True` + `staff_brief: bool = True`. The standalone-run `print()` echoes the six-flag set. |
| [`graph/generation/template_loader.py`](graph/generation/template_loader.py) | `TEMPLATE_ID_TO_SCHEMA_MODULE` remapped — all six template_ids (time_analysis, initial_planning_guidance, warning_order, staff_brief, operation_order, staff_estimate) now point at `graph.generation.schema.schemas`. New `_apply_catalogs()` pre-validation pass that overlays `label_ar` + `prompt_ar` from the two catalogs onto the raw YAML dict (catalog wins over YAML inline). |
| [`graph/generation/prompt_extractor.py`](graph/generation/prompt_extractor.py) | `DOCUMENT SELECTION` block in the system prompt lists all six flags with four defaulted true (the §C21 quartet) + two defaulted false (the v2 deferrals). |
| [`scripts/generate_documents.py`](scripts/generate_documents.py) | `ALL_DOC_IDS` extended with `warning_order` + `staff_brief`. New `_render_output_filename(template)` helper — CLI now reads `template.meta.output_filename` and substitutes `{document_slug}`; `warning_order` / `staff_brief` write their own filenames even though they share schema modules with the v2-deferred templates. |
| [`ui/phase3_tab.py`](ui/phase3_tab.py) | `V1_DOC_IDS` and `V1_DOC_LABELS` extended to four documents. `_run_one` honours `meta.output_filename` like the CLI. Header caption rewritten. |
| [`data/phase3_inputs.example.json`](data/phase3_inputs.example.json) | `document_selection` gained `warning_order: true` + `staff_brief: true`. Scope comment rewritten to cite §C17 + §C21. |
| [`templates/staff_brief.yaml`](templates/staff_brief.yaml) | (after initial authoring) dropped per-field `rerank_query_ar` conflicts so all fields within one group match verbatim (loader invariant). |

### Smoke

```bash
python -m graph.generation.template_loader
# → 6/6 templates OK

python scripts/generate_documents.py \
    --inputs-json data/phase3_inputs.example.json \
    --docs time_analysis initial_planning_guidance warning_order staff_brief \
    --out /tmp/c21_smoke_full
# → 4/4 .docx rendered
#   time_analysis.docx             41 536 B
#   initial_planning_guidance.docx 44 647 B
#   warning_order.docx             42 327 B
#   staff_brief.docx               44 821 B
```

`warning_order` renders with zero LLM calls and zero retrieval.
`staff_brief` hits the 9 retrieved fields through Phase 2 against
`ingest__doctrine__bgem3`.

### How to edit a label or a drafting prompt going forward

1. **Rename a Pydantic class or field** — edit `graph/generation/schema/schemas.py`. The loader's parity pass will flag any YAML that still names the old key. (Don't forget `NewClasses.md` + `field_catalog.py` + `prompts_ar.py` if you rename.)
2. **Rename an Arabic label** — edit `graph/generation/schema/field_catalog.py` only. No code or YAML changes.
3. **Rewrite a drafting prompt** — edit `graph/generation/prompts_ar.py` only. The YAMLs don't need to touch.
4. **Add a new v1 document** — author a YAML under `templates/`, add its template_id to `TEMPLATE_ID_TO_SCHEMA_MODULE` + `ALL_DOC_IDS` + `V1_DOC_IDS` + `DocumentSelection`, add its field labels to `field_catalog.py`, add its group prompts to `prompts_ar.py`.

---

## Historical changelog — Session 2026-04-22 (late, §C18 + §C19 code + §C20 docs)

Quick reference for what concretely changed in this session.  Narrative
rationale is in the §C17–§C20 blocks above; this list is for scanning
files.

### New files

| file | purpose |
|---|---|
| [`graph/docling_converters.py`](graph/docling_converters.py) | Shared `get_textlayer_converter()` (singleton) + `build_ocr_converter()` (fresh per call) so `initialpages_convert`, `check_documents` (OCR retry), and `convert_document` all read one converter definition and one `OCR_LANGS` setting |
| [`ui/phase3_tab.py`](ui/phase3_tab.py) | Streamlit M6 tab — paste Arabic brief → pick docs → Generate → download `.docx`; reuses the same extractor + assembler + renderer code path as `scripts/generate_documents.py` |
| [`.env.example`](.env.example) | Committed template (Phase 1 + Phase 2 + `OCR_*` + every `PHASE3_*` knob).  Copy to `.env` on a fresh clone |
| [`docs/pdf_failure_fallback_plan.md`](docs/pdf_failure_fallback_plan.md) | §C19 design + forensic evidence (Caesar-29 per-span mixing; why Tesseract > de-ROT decoder) |

### Modified Python / YAML / config

| file | change |
|---|---|
| [`graph/config.py`](graph/config.py) | New fields `ocr_retry_on_garbage`, `ocr_retry_max_per_folder`, `ocr_langs`; new constant `FILE_INITIAL_PAGES_OCR = "initial_pages_ocr.md"` |
| [`graph/nodes/initialpages_convert.py`](graph/nodes/initialpages_convert.py) | Now imports from `graph/docling_converters.py`; new exported helper `ocr_retry_preview(doc, cfg=None)` that writes `initial_pages_ocr.md` via force-full-page Tesseract OCR |
| [`graph/nodes/check_documents.py`](graph/nodes/check_documents.py) | New classifier (`_should_retry_with_ocr`) — regex on remark + ASCII-letter-ratio fallback; per-folder budget; OCR retry loop; tags rescued docs with `needs_full_ocr=True`; `_write_rejected_review` extended with `attempts[]` + `ocr_preview_path` audit trail |
| [`graph/nodes/convert_document.py`](graph/nodes/convert_document.py) | `_get_parser` / `_make_escalation_converter` now thin aliases to `docling_converters`; honours `needs_full_ocr=True` by routing the full parse straight to `build_ocr_converter()` (skips text-layer path and thin-page escalation) |
| [`graph/prompts.py`](graph/prompts.py) | `SUFFICIENCY_CHECK_PROMPT` retopicalised from topic-agnostic junk filter to MDMP-topical filter (§C18).  HISTORY block records M0.1 and C18.  Rejection remarks for unreadable content are now required to use a keyword from the §C19 classifier list |
| [`data/phase3_prompt.example.txt`](data/phase3_prompt.example.txt) | Rewritten with explicit Arabic-output header + per-doc scope for Doc 1 (Time Analysis) and Doc 2 (WARNO).  Under §C20 the file is also universal — no hardcoded doctrine-PDF names or collection strings; retriever targets live in YAML `filters.source_doc`.  Includes explicit "extraction instructions" section enumerating what fields the extractor should populate from the brief |
| [`scripts/generate_documents.py`](scripts/generate_documents.py) | Two `.relative_to(REPO_ROOT)` call sites guarded with `is_relative_to()` so `--out` can point outside the repo (e.g. the user's Desktop) without throwing `ValueError` |
| [`ui/app.py`](ui/app.py) | Wraps the existing retrieval dev-UI inside `st.tabs(["Phase 2 — Retrieval", "Phase 3 — MDMP Step 1"])`; Phase 3 tab delegates to `ui.phase3_tab.render()` |
| [`.env`](.env) *(local, gitignored)* | Added the three `OCR_*` vars so the live config matches `.env.example` |

### Documentation updated

| file | change |
|---|---|
| [`docs/memory.md`](docs/memory.md) | Status line bumped to include §C18 / §C19 / §C20.  Binding-revisions list gained §C18 (MDMP-topical gate) and §C19 (OCR-retry plan B) entries.  Six new "Do NOT" rules (no blanket de-ROT decoder; no calling `_get_parser` / `_make_escalation_converter` from new code; no loosening MDMP-topical gate; no raising `OCR_RETRY_MAX_PER_FOLDER` casually; no drafting instructions in the input prompt; no hard-coded models in `ui/phase3_tab.py`).  "What to do first" block rewritten to point at the Desktop `.docx` |
| [`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md) | New §C18 and §C19 sections with full rationale tables + What-changes / What-NOT-to-do lists.  §19.1 annotated with a "superseded by C18" historical note |
| [`docs/phase3_handoff_notes.md`](docs/phase3_handoff_notes.md) | Session N+2 block appended: commands executed, post-fix Qdrant state (2398 points, ADP 2-0 = 233 chunks), punch list, reading-order for a fresh chat |
| [`CLAUDE.md`](CLAUDE.md) *(this file)* | Status line + pipeline diagram (check_documents + convert_document annotations) + §C18 + §C19 + §C20 narrative + this changelog + pointer list |
| [`AGENTS.md`](AGENTS.md) | Mirror of CLAUDE.md updates — status line, pipeline annotations, revisions summary, Tesseract prereq |

### Infrastructure / runtime state

- **Tesseract 5.5.2** installed at `/opt/homebrew/bin/tesseract` via `brew install tesseract`.  Add `brew install tesseract-lang` when a non-English corpus (e.g. Arabic doctrine) ships and flip `OCR_LANGS=eng+ara`.
- **Full re-ingest executed** (`python main.py`).  4/4 docs accepted; ADP 2-0 rescued via the new OCR retry path.  Qdrant state: 2398 total points — FM-5-0 = 1145, FM-6-0 = 678, ADP-5-0 = 342, **ADP-2-0 = 233** (via forced OCR).
- **Two Step-1 `.docx` rendered to user Desktop:**
  - `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/time_analysis.docx` (41 536 B)
  - `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/initial_planning_guidance.docx` (44 558 B)
  - `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/extracted_inputs.json` — audit trail
  - **Note:** these were rendered before the late §C20 prompt/YAML edits; a re-render after §C20 will invalidate the group cache (new `user_prompt_sha256`, new `yaml_group_hash`) and produce slightly different output.

### New env vars (all three documented in `.env.example` + `.env`)

| var | default | what it does |
|---|---|---|
| `OCR_RETRY_ON_GARBAGE` | `1` | Enable the two-pass gate.  `0` disables the retry; rejects stay rejected |
| `OCR_RETRY_MAX_PER_FOLDER` | `5` | Max OCR retries per ingest folder.  Stops a folder of unreadable PDFs from burning unbounded OCR time |
| `OCR_LANGS` | `eng` | Tesseract language pack(s).  Comma- or plus-separated (e.g. `eng+ara`) |

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

**LangGraph ingestion pipeline (7 nodes):**

```
.txt / .pdf / .docx
      │
      ▼
initialpages_convert  (Docling first-10-pages probe → markdown preview on disk;
                       gives the gate real content to read instead of a placeholder)
      │
      ▼
check_documents       (PER-DOC LLM gate — one call per doc; prompt in graph/prompts.py;
                       MDMP-topical filter per §C18; on reject with "garbled/corrupt/
                       unreadable" remark (or low ASCII-letter ratio) fires OCR retry
                       via ocr_retry_preview → writes initial_pages_ocr.md → re-calls
                       the LLM gate; on accept tags doc needs_full_ocr=True for
                       convert_document; rejected docs stop here, review bundle at
                       output/not_enough/<slug>/<stem>/ with attempts[] audit;
                       downstream nodes iterate state["eligible_documents"] only)
      │
      ▼
convert_document      (Docling full parse — selective OCR via OcrAutoOptions, per-page
                       escalation; when needs_full_ocr=True, skips text-layer path and
                       goes straight to build_ocr_converter() for broken-CMap PDFs)
      │
      ▼
chunk_document        (Docling HybridChunker — max_tokens=512, merge_peers=True,
                       tokenizer = HuggingFaceTokenizer(AutoTokenizer("BAAI/bge-m3")))
      │
      ▼
enrich_chunks         (5 doctrine post-processors, in order: classification stripper →
                       paragraph number extractor → cross-ref extractor →
                       glossary splitter → acronym expander)
      │
      ▼
embed_chunks          (bge-m3 via FastEmbed add_custom_model ← aapot/bge-m3-onnx;
                       1024-dim dense + Qdrant/bm25 sparse)
      │
      ▼
upsert_to_qdrant      (named vectors: dense + sparse with modifier=IDF, RRF hybrid ready,
                       5 payload indexes (source_doc, chunk_type, paragraph_number,
                       paragraph_numbers, cross_refs) built before first upsert,
                       on_disk_payload=True, hash-gated delete-then-upsert, _registry)
```

All state **disk-backed** (state holds paths; DoclingDocuments, chunks, vectors
live as files on disk). One collection per folder named `ingest__<slug>__bgem3`.
Retrieval is Phase 2 (not yet built). This phase builds the knowledge base.

**Full pipeline walkthrough (Phase 1 + Phase 2)**: [`walkthrough.md`](docs/walkthrough.md)
**Layout + state fields**: [`structure.md`](docs/structure.md)
**Ubuntu 22.04 LTS deployment shadow**: [`ubuntu_deploy_shadow.md`](docs/ubuntu_deploy_shadow.md)
**Phase 2 retrieval design (implemented, locked)**: [`referencedocs/17_phase2_retrieval.md`](referencedocs/17_phase2_retrieval.md)
**Phase 3 overview (M0–M6 landed; v1 = MDMP Step 1)**: [`docs/phase3_walkthrough.md`](docs/phase3_walkthrough.md)
**Phase 3 authoritative design (incl. §18 C17–C19)**: [`referencedocs/18_phase3_generation.md`](referencedocs/18_phase3_generation.md)
**Phase 3 renderer port guide**: [`referencedocs/19_phase3_arabic_renderer.md`](referencedocs/19_phase3_arabic_renderer.md)
**Phase 3 YAML template + field-kind spec**: [`referencedocs/20_phase3_templates_and_kinds.md`](referencedocs/20_phase3_templates_and_kinds.md)
**Phase 3 Pydantic schemas**: [`NewClasses.md`](NewClasses.md)
**PDF-failure fallback plan (§C19 design + forensic evidence)**: [`docs/pdf_failure_fallback_plan.md`](docs/pdf_failure_fallback_plan.md)
**Everything else**: [`memory.md`](docs/memory.md) (see the **Session Handoff** block at its end)

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
├── main.py                       ← ingestion entry point
├── graph/                        ← ingestion graph
│   ├── state.py                  ← IngestionState TypedDict (disk-backed)
│   ├── config.py                 ← .env-driven settings loader (incl. FORCE_REPARSE)
│   ├── prompts.py                ← all LLM prompts in one module
│   ├── fingerprints.py           ← sha256 cache-gate helpers (.stage_fingerprints.json)
│   ├── builder.py                ← 7-node graph wiring
│   ├── nodes/
│   │   ├── initialpages_convert.py ← Docling first-10-pages probe → markdown preview
│   │   ├── check_documents.py    ← LLM sufficiency gate (uses graph/prompts.py)
│   │   ├── convert_document.py   ← Docling full parser + OCR escalation
│   │   ├── chunk_document.py     ← HybridChunker @ max_tokens=512
│   │   ├── enrich_chunks.py      ← Runs the 5 post-processors in order
│   │   ├── embed_chunks.py       ← bge-m3 (add_custom_model) + BM25 sparse
│   │   └── upsert_to_qdrant.py   ← Hash-gated upsert + _registry manifest
│   └── post_processors/          ← Pure functions (list[chunk]) → list[chunk]
│       ├── classification_stripper.py
│       ├── paragraph_number_extractor.py
│       ├── cross_ref_extractor.py
│       ├── glossary_splitter.py
│       └── acronym_expander.py
├── scripts/
│   ├── __init__.py
│   └── peek_qdrant.py            ← CLI inspection tool
├── utils/
│   └── file_reader.py            ← list_documents() → {path, filename, sha256, size}
├── inputs/                       ← Source-of-truth document folders to ingest
│   └── <folder_name>/*.pdf       ← One sub-folder = one Qdrant collection
├── prompts/                      ← §C23 per-doc editable surface (Y-schema docs)
│   ├── __init__.py
│   ├── _universal_instructions_ar.py   ← shared Arabic extraction discipline
│   ├── time_analysis/            ← schema.py, template.yaml, labels_ar.py, prompts_ar.py
│   ├── initial_planning_guidance/
│   └── staff_brief/
├── templates/                    ← LEGACY YAMLs (warning_order, operation_order,
│                                      staff_estimate — still live)
├── docs/
│   ├── memory.md                 ← Master index (read this first)
│   ├── walkthrough.md            ← Full pipeline design doc
│   ├── structure.md              ← Layout, state fields, collection map
│   ├── ubuntu_deploy_shadow.md   ← Ubuntu 22.04 LTS deployment shadow
│   ├── transferOS.md             ← OS-portability notes
│   └── langgraphtopics.md        ← Beginner LangGraph explainer
├── referencedocs/                ← Per-topic research docs
├── libs/                         ← Vendored: docling 2.89, fastembed 0.8, qdrant-client 1.17
├── output/                       ← Runtime artefacts (gitignored)
│   ├── <doc_stem>/               ← One folder per source doc. Contents:
│   │   ├── initial_pages.md      ← first-10-pages markdown preview
│   │   ├── parsed.json           ← Docling JSON
│   │   ├── diagnostics.json      ← per-page OCR diagnostics
│   │   ├── chunks.jsonl          ← raw chunks (this doc only)
│   │   ├── enriched_chunks.jsonl ← + doctrine metadata
│   │   ├── embeddings.npz        ← dense + sparse vectors
│   │   ├── acronyms.json         ← glossary table (if doc has one)
│   │   ├── errors.jsonl          ← per-doc failures (if any)
│   │   └── .stage_fingerprints.json ← {artefact → sha256} — drives sha256 cache
│   └── not_enough/<slug>/<stem>/ ← rejected-doc review bundle: check_decision.json
│                                   (source path, filename, slug, decision, remarks,
│                                   timestamp, preview path) + copied initial_pages.md
├── venv/                         ← Python 3.12 virtualenv (gitignored)
├── .env                          ← local secrets + config (gitignored; commented)
├── .gitignore
├── requirements.txt              ← pinned runtime deps (matches venv + memory.md)
├── CLAUDE.md                     ← THIS FILE — points at docs/memory.md
└── AGENTS.md                     ← Codex/agent convention file (points at docs/memory.md)
```

---

## Conventions

- Code heavily commented for beginner readability
- Type hints everywhere
- Pydantic models enforce structured LLM output
- **Filenames are never sent to the LLM** — content-only decisions
- `_get_llm()` / `_get_client()` / `_get_parser()` / `_get_chunker()` / `_get_dense_embedder()` / `_get_sparse_embedder()` — no module-level heavy objects; lazy-singleton per process (memory-hardening requirement)
- `load_dotenv()` before any `graph/` import in `main.py`
- All configuration in `.env` — no hardcoded hosts, ports, paths, device flags, or EP names in Python source
- One collection per folder (`ingest__<slug>__bgem3`); deterministic UUID5 chunk IDs
- Hash-gated re-ingest: `doc_content_hash` in payload; skip unchanged docs, delete-by-filter then upsert when hash mismatches
- Skip-and-log on ALL ingestion failures with detailed logging (stage, file, traceback, ts) into `ingestion_errors`
- State is disk-backed — `IngestionState` holds paths, not objects
- Memory-hardening: every node processes one doc at a time; enrich/embed stream JSONL line-by-line; embeddings written as per-doc `<doc>.npz`; embed/upsert use batched calls (32/64 defaults from `.env`); both `initialpages_convert` and `convert_document` run `del doc; gc.collect()` between files
- **Per-doc LLM gate (2026-04-21):** `check_documents` makes one LLM call per doc. Downstream nodes iterate `state["eligible_documents"]` — rejected docs never reach `convert_document` onward. Rejected-doc review bundles live under `output/not_enough/<slug>/<stem>/`.
- **Upstream sha256 cache (2026-04-21):** every upstream stage (`initialpages_convert`, `convert_document`, `chunk_document`, `enrich_chunks`, `embed_chunks`) stamps its artefact with the source sha256 in `output/<stem>/.stage_fingerprints.json` and cache-hits on reruns with unchanged content. Cache hit logs `stage:cached` (audit, non-failure). Bypass via `FORCE_REPARSE=1` in `.env`. `upsert_to_qdrant` keeps its existing `doc_content_hash` gate against Qdrant payload.

See [`memory.md`](docs/memory.md) for the full list of locked decisions and rules.

---

## Environment

- Python 3.12.13 (Homebrew)
- Node + colima + Docker for Qdrant server
- API key in `.env` as `OPENAI_API_KEY`
- Optional `HF_TOKEN` in `.env` to skip HuggingFace rate limits when
  fastembed first downloads the bge-m3 ONNX model (~2.3 GB from
  `aapot/bge-m3-onnx`). Downloads work without it, just slower.
- Optional `FORCE_REPARSE=1` in `.env` bypasses the upstream sha256
  cache gate (every stage re-runs its heavy work). Default `0`.
