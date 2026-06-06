# Phase 3 Walkthrough — Document Generation (v1 = FOUR STEP-1 DOCUMENTS, §C21 2026-04-23)

> **Read this first if a fresh session needs to understand Phase 3.**
> It is the orientation / project-level view. The authoritative
> design and all locked decisions live in
> [`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md).
>
> **Status as of 2026-04-23:** Phase 1 (ingestion) and Phase 2
> (retrieval) are implemented and committed on `main`. Phase 3 (document
> generation) has M0–M6 code landed under `graph/generation/` +
> `ui/phase3_tab.py`.
>
> **§C21 (2026-04-23) expanded v1 scope from 2 → 4 documents** and
> collapsed the schema / Arabic-label / drafting-prompt surfaces into
> three single-edit catalogs. v1 now ships: `time_analysis`,
> `initial_planning_guidance`, `warning_order` (NEW, mapped-only),
> `staff_brief` (NEW, Step-1 running-estimate brief). OPORD
> (`operation_order.yaml`) and the full Steps 2–6 Staff Estimate
> (`staff_estimate.yaml`) stay `v1_scope: false` (v2-deferred).
>
> **Design was revised 2026-04-22 after a second review.** The
> revisions are bound into §18 C8–C15 of the scoping doc and
> summarised under §6 of this file. Key ones to know:
> - retrieval merge is **RRF-across-seeds + one final rerank**
>   (not "sort by `rerank_score` across seeds");
> - Phase 3 uses its own `graph/generation/llm.py`, not the shared
>   `_get_llm()` singleton (which is hardcoded `gpt-4o-mini` / 0.0);
> - `.docx` bytes are not deterministic — cache is at the pydantic
>   layer, not the rendered file;
> - citation-locator fallback is pre-resolved by the generation
>   layer before the LLM sees any chunk;
> - `NewClasses.md` is a reference, not an implementation source;
> - inputs JSON-Schema is auto-generated from a Pydantic model.

---

## 1. What Phase 3 does

Given a free-form operation brief (warning-order info + intel-analysis
report), Phase 3 **v1 produces four Arabic `.docx` files per run**
(§C21). The full OPORD and the full Steps 2–6 Staff Estimate stay
**deferred to v2** (§18 C17) because they belong to later MDMP steps
and would encode the wrong step's assumptions if bundled into a Step 1
package.

| # | Template id | Arabic title | v1? | Primary role |
|---|---|---|---|---|
| 1 | `time_analysis` | تحليل الوقت | **v1 ✓** | 1:3 rule + planning-time breakdown. All computed, zero LLM. |
| 2 | `initial_planning_guidance` | دليل التخطيط الأولي | **v1 ✓** | Initial planning directives (7 LLM-drafted paragraphs against MDMP doctrine). |
| 3 | `warning_order` | الأمر الإنذاري | **v1 ✓ NEW** | Structured WARNO from brief facts. Mapped-only — zero LLM, zero retrieval. |
| 4 | `staff_brief` | إيجاز هيئة الركن | **v1 ✓ NEW** | Step-1 running-estimate brief. 9 LLM-drafted enemy / operations fields against ADP-2-0 + FM-6-0 + FM-5-0 + ADP-5-0; personnel + logistics rows static "يُصدر لاحقاً". |
| — | `operation_order` | أمر العمليات | **v2 (deferred)** | Full 5-paragraph order (MDMP Step 7 output). |
| — | `staff_estimate` | تقديرات هيئة الركن | **v2 (deferred)** | Full Intel / Ops / Personnel / Logistics assessments (MDMP Steps 2–6). |

Both new v1 documents reuse the **existing** Pydantic class set — zero
net-new classes or fields were introduced under §C21. The entire
schema catalog now lives in one file
[`graph/generation/schema/schemas.py`](../graph/generation/schema/schemas.py);
the legacy per-doc schema modules are thin re-export shims.

The content of every document comes from two sources: the user's
JSON input (operation-specific facts) and the **Phase 2 retrieval
stack** (doctrinal grounding from the FM/ADP/ATP corpus already
ingested in Phase 1).

**Output language:** Arabic. **Corpus language:** English (US Army
doctrine). The multilingual `bge-m3` embedder + a single
grounded-translation LLM pass bridge the gap. Citations back to
English `source_doc §paragraph_number` appear as inline tags in the
Arabic prose and are collected into an endnote section at the end
of each document.

---

## 2. The one architectural idea

> **Treat each schema field as one of five kinds and dispatch
> accordingly. Only `retrieved` fields reach the LLM.**

Five kinds:

| Kind | Source | LLM? |
|---|---|---|
| `static` | YAML literal | No |
| `computed` | Pure Python formula | No |
| `input` | User JSON | No |
| `derived` | Reference to another field | No |
| `retrieved` | Phase 2 `search()` + grounded LLM draft | **Yes** |

Of ~70 schema fields across the four documents, roughly 25–30 are
`retrieved`. The rest never touch an LLM. LLM calls are then
further consolidated: **one draft call per Pydantic class** (all
retrieved fields in that class share the same retrieval context),
with a narrow critique / re-draft pass per failed field.

Net result for a full 4-document run: **8–12 LLM calls, grounded,
cited, cacheable** — compared to the user's prior approach that
sent one megaprompt per Pydantic class.

---

## 3. Where the pieces live

### 3.1 Already on disk

```
NewClasses.md                           # Pydantic schemas (doctrine mirror)
referencedocs/
  18_phase3_generation.md               # authoritative design doc
  19_phase3_arabic_renderer.md          # renderer port guide
  20_phase3_templates_and_kinds.md      # YAML template + field-kind spec
docs/
  phase3_walkthrough.md                 # this file
```

### 3.2 Planned (per `18_phase3_generation.md` §12)

```
graph/generation/
  schema/{opord, staff_estimate, time_analysis, initial_planning_guidance}.py
  template_loader.py                    # YAML → Template objects + validation
  field_dispatcher.py                   # 5-kind walker
  time_math.py                          # pure computations (replaces old cal())
  retrieval_group.py                    # fan-out over Phase 2 search()
  section_drafter.py                    # one structured LLM call per group
  critique.py                           # faithfulness pass
  assembler.py                          # derived refs + GeneratedDocument
  cache.py                              # per-group + per-doc fingerprinting
  renderers/
    arabic_docx.py                      # ported primitives from old code (preserved)

templates/
  operation_order.yaml
  staff_estimate.yaml
  time_analysis.yaml
  initial_planning_guidance.yaml

scripts/
  generate_documents.py                 # CLI entry point

data/
  phase3_inputs.example.json            # sample input — already committed
```

**Nothing in `graph/nodes/`, `graph/retrieval/`, `graph/shared/`,
`graph/state.py`, `graph/builder.py`, or `main.py` changes** — with
the one exception of the pre-work prompt edit in
`graph/prompts.py` (§19.1 of the scoping doc).

---

## 4. End-to-end flow (REVISED 2026-04-22 — C16 input surface)

```
prompt.txt  ── free-form Arabic/English operation brief
    │
    ▼
prompt_extractor — ONE upstream LLM call (temperature 0.0)
    │                                       │
    │   .with_structured_output(Phase3Inputs)
    │                                       │
    ▼                                       ▼
Phase3Inputs  ───────────►  output/generated/<run_id>/extracted_inputs.json
    │                        (audit trail; reviewer diffs vs. prompt.txt)
    ▼
template_loader (reads templates/<doc>.yaml, validates shape)
    │
    ▼
field_dispatcher — walks every schema field
    │
    ├─ static     → YAML literal
    ├─ computed   → time_math pure function
    ├─ input      → path lookup into the EXTRACTED Phase3Inputs instance
    │               (no inputs.json file consulted at run time)
    ├─ derived    → deferred until all retrieved fields resolve
    └─ retrieved  → grouped by Pydantic class, each group does:
                   ├─ fan-out: 2–3 seeds × 1 doctrine collection →
                   │     Phase 2 search(..., use_reranker=False) per call
                   │     (per-manual narrowing inside the one collection
                   │      via filters.source_doc allowlist — see §6.4
                   │      of the scoping doc)
                   ├─ wrap every SearchHit in SourcedHit(hit, collection)
                   │     so originating collection is preserved
                   ├─ dedupe by point_id; collect (seed_index, rank)
                   │     tuples across seeds
                   ├─ RRF-across-seeds: rrf = Σ 1/(60 + rank_in_seed)
                   │     sort desc, keep top 25 (merge_pool_size)
                   ├─ ONE final rerank() pass on the 25-pool against
                   │     canonical rerank query (rerank_query_ar OR
                   │     " | ".join(seeds)); keep top 15 (merged_top_k)
                   ├─ pre-resolve citation tag per §6.6 fallback chain
                   │     (paragraph_number → paragraph_numbers[0] →
                   │      deepest heading → p. page → "—")
                   ├─ one LLM draft call via graph.generation.llm.
                   │     get_draft_llm().with_structured_output(...)
                   │     — chunks arrive pre-prefixed with their tag
                   ├─ one LLM critique call via
                   │     graph.generation.llm.get_critique_llm();
                   │     re-draft failures only
                   └─ cache keyed on YAML hash + group hash + models +
                        temps + toggles + reranker_model_tag +
                        collection_content_hashes + input_subset_hash
                        + user_prompt_sha256 + extractor_model +
                        extractor_temperature  (C16 additions)
    │
    ▼
assembler — resolves derived refs, builds GeneratedDocument (pydantic)
    │                                                              │
    │                                                              ▼
    │                                            per-document cache layer:
    │                                            stores GeneratedDocument
    │                                            (NOT the .docx bytes —
    │                                             those are not byte-stable)
    ▼
arabic_docx renderer — ports old code's Arabic typography (preserved)
    │
    ▼
output/generated/<run_id>/
  ├─ extracted_inputs.json            # audit trail (C16)
  ├─ operation_order.docx
  ├─ staff_estimate.docx
  ├─ time_analysis.docx
  ├─ initial_planning_guidance.docx
  └─ .group_cache/*.json              # per-group result cache
```

**Escape hatch.** Debugging / regression workflows can bypass the
extractor by running the CLI with ``--inputs-json <file>`` instead
of ``--prompt <file>``. On that path, no ``extracted_inputs.json``
is written (the ``inputs.json`` IS the artefact); the cache key's
``user_prompt_sha256`` component is the empty string, and the
``extractor_model`` / ``extractor_temperature`` components are
empty and 0.0 respectively. Cache entries from the two paths
therefore do not collide even when they resolve to the same
``Phase3Inputs`` — audit fidelity beats a one-time cache miss.

---

## 5. Integration contract with Phases 1 & 2

Phase 3 reads exactly these three Phase 2 surfaces (all read-only):

1. `graph.retrieval.search.search(SearchRequest) → SearchResponse`
2. `graph.retrieval.registry.list_registry_entries()`
3. `graph.retrieval.schema.{SearchRequest, SearchResponse, SearchHit}`

Plus these shared utilities:
- `graph.shared.llm._get_llm()` — singleton LLM client
- `graph.prompts` — Phase 3 adds new prompt constants alongside
  `SUFFICIENCY_CHECK_PROMPT` (additive only)

No schema changes, no new Qdrant collections, no embedder changes,
no new payload indexes. Phase 3 is purely a consumer of Phases 1
and 2.

---

## 6. Key locked decisions (abbreviated — see §16 + §18 C8–C15 of scoping doc)

1. **Four fixed templates** in v1 (no custom user templates).
2. **Port the old Arabic renderer verbatim** — no simplification
   per user directive.
3. **One LLM call per Pydantic class**, critique is narrow.
4. **Single doctrine collection** (`ingest__doctrine__bgem3`) per
   §6.4 of the scoping doc; per-manual narrowing via
   `filters.source_doc` allowlist inside that collection. Collection
   isolation exists for corpus/domain isolation (future medical
   corpus goes into its own collection), not per-manual splitting.
   Multi-collection client-side union is still the pattern for
   future multi-domain templates; v1 templates stay single-domain.
5. **English queries / English corpus / Arabic output** via `bge-m3`
   + grounded-translation LLM pass.
6. **Draft model `gpt-4o-mini` temp 0.2 / critique temp 0.0**,
   upgradable via `.env`. Phase 3 uses its **own**
   `graph/generation/llm.py`, NOT the shared `_get_llm()`
   singleton — that singleton is hardcoded at temp 0.0 (§18 C9).
7. **Citations = inline `[DOC §PARA]` tags → endnotes** at document
   end. Locator has an explicit fallback chain (§18 C12): the
   generation layer pre-resolves the tag before the LLM sees the
   chunk, so `paragraph_number=None` can never produce
   `[source_doc §None]`.
8. **No PDF. No TXT.** Only `.docx` in v1 (user directive
   2026-04-22).
9. **Rename-only port to the user's health codebase** — no
   feature-flag abstractions. `NewClasses.md` is a reference, not
   implementation source (§18 C13).
10. **One consolidated scoping doc** (Phase 2 precedent), with
    narrow companion docs for the renderer port and the template
    spec. §18 C8–C15 track the 2026-04-22 second-review revisions.

**Second-review revisions (must not revert — §18 C8–C15):**
- Retrieval merge: **RRF-across-seeds + one final rerank** on the
  merged pool. `rerank_score` is per-call and NOT cross-seed-
  comparable (C8).
- Phase-3-local LLM helper replaces shared `_get_llm()` for Phase 3
  use (C9).
- `.docx` bytes are NOT deterministic; cache is the assembled
  `GeneratedDocument` pydantic instance (C10).
- Expanded cache key covers every output-affecting knob (C11).
- Explicit citation-locator fallback chain (C12).
- `NewClasses.md` as reference only (C13).
- Pydantic-first inputs schema; JSON-Schema file is auto-generated
  (C14).
- `SourcedHit` wrapper carries originating `collection` (C15).

---

## 7. **OPERATIONAL NOTE — model hosting migration**

> **Current (2026-04-22):** `bge-m3` dense, BM25 sparse, and
> `bge-reranker-v2-m3` cross-encoder run locally on the M4. LLM
> is already on OpenAI's API.
>
> **After Phase 3 v1 acceptance (user-directed 2026-04-22):** **all
> models migrate to API endpoints** — embedder, reranker, LLM all
> remote. Phase 3 code must not hardcode local-runtime assumptions;
> the migration surface is `.env` + the existing `_get_*()`
> singletons, not Phase 3 source.

Replicated verbatim in
[`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)
§7.4 and [`memory.md`](memory.md) locked-decisions block.

---

## 8. Pre-work before any `graph/generation/` code

Per [`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md) §19:

### 8.1 Relax the ingestion gate

`graph/prompts.py::SUFFICIENCY_CHECK_PROMPT` currently rejects
non-maneuver doctrine (sustainment, fires, signal, aviation, CBRN,
engineer, MP, EW). Phase 3 needs these for the sustainment /
logistics / safety sections. The prompt gets rewritten to a pure
junk filter (empty / blank / placeholder / obviously off-topic) —
any substantive doctrine passes. Scope = one prompt constant in one
file.

### 8.2 Write the four YAML templates

Following the spec in
[`../referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md).
These encode each document's structure, per-field kind, per-retrieved-field
query seeds, and per-group Arabic drafting prompts. Reviewable in
isolation before any code lands.

---

## 9. Rollout milestones

Revised 2026-04-22 under §18 C17: v1 ships Docs 3 + 4 only. M3 and
M4 are deferred to v2. The M3 retrieval / drafting / critique /
cache code already written (commit `5e2aaf0`) stays on disk — it
is correct under C17 and will drive Docs 1 + 2 when v2 re-enables
them by flipping each template's `v1_scope: false` back to `true`.

| M | Deliverable | v1? | LLM calls? | Why this order |
|---|---|---|---|---|
| **M0** | Relax the sufficiency prompt; write the four YAMLs | ✓ | No | Gate M2+ |
| **M1** | `template_loader.py` + schema modules (no renderer, no dispatcher) | ✓ | No | Lock structure contract |
| **M2** | **Doc 3 (Time Analysis) end-to-end** | ✓ | No | Smallest surface, fastest feedback on Arabic typography |
| **M3** | ~~Doc 2 (Staff Estimates) end-to-end~~ | **v2 (deferred — C17)** | Yes (4 groups) | Retrieval / drafter / critique / cache plumbing landed at `5e2aaf0` but not exercised in v1 |
| **M4** | ~~Doc 1 (OPORD) end-to-end~~ | **v2 (deferred — C17)** | Yes (5 groups) | Biggest doc; deferred with M3 |
| **M5** | **Doc 4 (Initial Planning Guidance) end-to-end** | ✓ | Yes (2 groups) + timeline math reuse | Second of the two v1 docs; primary WARNO drafter |
| **M6** | Streamlit tab; final memory.md lock-in | ✓ | No | Dev-ergonomics |

---

## 10. What a fresh session should read, in order

1. This file — [`phase3_walkthrough.md`](phase3_walkthrough.md).
2. [`memory.md`](memory.md) — skim the locked decisions table and
   the **Session Handoff** block at the bottom.
3. [`../referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md)
   — the authoritative design; every Phase 3 decision is here.
4. [`../referencedocs/20_phase3_templates_and_kinds.md`](../referencedocs/20_phase3_templates_and_kinds.md)
   — the YAML template contract.
5. [`../referencedocs/19_phase3_arabic_renderer.md`](../referencedocs/19_phase3_arabic_renderer.md)
   — the renderer port guide (read before touching the old code).
6. [`../NewClasses.md`](../NewClasses.md) — the Pydantic schemas
   with field mapping to the user's separate health codebase.
7. [`../data/phase3_inputs.example.json`](../data/phase3_inputs.example.json)
   — the input JSON shape.
8. [`../referencedocs/17_phase2_retrieval.md`](../referencedocs/17_phase2_retrieval.md)
   — Phase 2 contract that Phase 3 consumes (read §3
   `SearchRequest`/`SearchResponse` at minimum).

---

## 11. What NOT to do (Phase 3 edition, REVISED 2026-04-22)

- Do not change any file under `graph/nodes/`,
  `graph/post_processors/`, `graph/retrieval/`, `graph/shared/`,
  `graph/state.py`, `graph/builder.py`, or `main.py` — Phase 1 and
  Phase 2 are locked. The sole pre-code exception is the prompt
  loosening in `graph/prompts.py` (§19.1 of the scoping doc).
- Do not simplify or rewrite the old Arabic renderer. The old
  code's kashida / bidi / numbering logic is behaviour-locked per
  user directive. Cosmetic cleanup (imports, docstrings) is OK;
  behaviour changes are not.
- Do not put drafting instructions inside Pydantic field
  descriptions. Descriptions are terse; instructions live in the
  YAML `prompt_ar` field per group.
- Do not introduce feature flags for the health-domain swap. The
  swap is rename-only — field names in `schema/<doc>.py` +
  template entries.
- Do not instantiate a new Qdrant client, embedder, or reranker in
  `graph/generation/`. Reuse Phase 2's via `graph.retrieval.search`
  (and `graph.retrieval.rerank.rerank` for the single final pass).
- Do not add PDF or TXT renderers. Removed from v1 per user
  directive. (If the directive flips later, that's a future
  scoping decision.)
- Do not send filenames to the LLM. `memory.md` Rule 1 still
  applies. Retrieved chunks use `source_doc` slugs, not filesystem
  paths.

**Added by the 2026-04-22 second-review revisions (§18 C8–C15 of the
scoping doc):**
- **Do not sort across seed queries by `rerank_score`.** Per-call
  rerank scores are query-specific; cross-seed comparison is
  incorrect. Use RRF-across-seeds + one final rerank on the merged
  pool. See §18 C8.
- **Do not import `graph.shared.llm._get_llm` inside
  `graph/generation/`.** It's hardcoded `gpt-4o-mini` / temp 0.0.
  Use `graph.generation.llm.{get_draft_llm, get_critique_llm}`.
  See §18 C9.
- **Do not claim `.docx` byte-determinism.** python-docx XML
  ordering is not stable. Cache the assembled
  `GeneratedDocument` pydantic instance, not the rendered file.
  See §18 C10.
- **Do not shrink the per-group cache key.** YAML file hash, YAML
  group block hash, every retrieval toggle, both model names, both
  temperatures, `prompt_ar` hash, and reranker model tag are all
  load-bearing. See §18 C11.
- **Do not emit `[source_doc §None]`.** The generation layer must
  pre-resolve the citation tag using the §6.6 fallback chain
  before the LLM sees any chunk. See §18 C12.
- **Do not copy `NewClasses.md` mechanically** into
  `graph/generation/schema/*.py`. That file mirrors the user's old
  health `prompt.txt` quirks for port-shape reasons; real modules
  use clean Pydantic v2 (types only). See §18 C13.
- **Do not hand-edit `data/phase3_inputs.schema.json`.** It is
  auto-generated from `graph/generation/schema/inputs.py::Phase3Inputs`
  by `scripts/export_phase3_input_schema.py`. See §18 C14.
- **Do not drop `SourcedHit` in favour of bare `SearchHit`.**
  `SearchHit` does not carry `collection`; the generation layer
  wraps every hit so provenance, debug logs, and the cache key
  have the originating collection available. See §18 C15.
