# Phase 3 Handoff Notes — mid-M3, 2026-04-22

> Written at user request before a plan revision (free-form-prompt
> input surface, see §18 C16 of the scoping doc once authored).
> Designed to be self-contained so a fresh session can continue
> without re-deriving state.
>
> **Repo tip on `main`:** `0eec693` (Phase 3 M2). Branch is 4 ahead
> of `origin/main`. No push yet.

---

## Files created / modified

### Committed on `main` since M2 started

All absolute-from-repo-root.

| Path | Purpose | State |
|---|---|---|
| `graph/prompts.py` | M0.1 prompt loosening | complete, committed `4d59912` |
| `templates/time_analysis.yaml` | Doc 3 YAML | complete, committed |
| `templates/initial_planning_guidance.yaml` | Doc 4 YAML | complete, committed |
| `templates/staff_estimate.yaml` | Doc 2 YAML | complete, committed |
| `templates/operation_order.yaml` | Doc 1 YAML | complete, committed |
| `NewClasses.md` | fixed "21 collections" claim | complete, committed `7814726` |
| `docs/memory.md` | Phase 3 row + session handoff + "Where things go" | complete, committed |
| `docs/phase3_walkthrough.md` | §4 flow + §6 locked decisions updated for single-collection | complete, committed |
| `referencedocs/18_phase3_generation.md` | §5 table, §6.4 multi-collection handling, §19.1 verification | complete, committed |
| `referencedocs/20_phase3_templates_and_kinds.md` | §1/§2.5/§3/§5/§9 updated for single-collection + source_doc allowlists | complete, committed |
| `data/phase3_inputs.example.json` | corrected timing + single-collection retrieval | complete, committed |
| `data/phase3_inputs.schema.json` | auto-generated from `Phase3Inputs` | complete, committed |
| `graph/generation/__init__.py` | package docstring | complete, committed `abc09d5` |
| `graph/generation/schema/__init__.py` | schema subpackage docstring | complete, committed |
| `graph/generation/schema/inputs.py` | `Phase3Inputs` + `load_inputs` + `strip_underscore_keys` | complete, committed |
| `graph/generation/schema/time_analysis.py` | `MISSION_TIMELINE`, `CURRENT_TIME_REFERENCE` | complete, committed |
| `graph/generation/schema/initial_planning_guidance.py` | 4 classes | complete, committed |
| `graph/generation/schema/staff_estimate.py` | 4 classes | complete, committed |
| `graph/generation/schema/opord.py` | 6 classes | complete, committed |
| `graph/generation/template_loader.py` | shape+cross-field validator, standalone runnable | complete, committed |
| `scripts/export_phase3_input_schema.py` | auto-generates `data/phase3_inputs.schema.json` | complete, committed |
| `graph/generation/time_math.py` | M2 — `compute_allocation`, 6 formatters, Hijri/Gregorian | complete, committed `0eec693` |
| `graph/generation/renderers/__init__.py` | renderers subpackage | complete, committed |
| `graph/generation/renderers/arabic_docx.py` | verbatim port + `ArabicDocumentContext` + `render_document` orchestrator | complete, committed |
| `requirements.txt` | added python-docx / arabic_reshaper / Pillow / PyYAML | complete, committed |

### Modified since M2, NOT yet committed

| Path | Nature of change | State |
|---|---|---|
| `graph/generation/assembler.py` | added `_template_has_retrieved_fields` helper + `assemble_document` now accepts `inputs_raw`/`template_path`/`cache_dir`; runs `run_retrieval_phase` when template has retrieved fields | **partial — M3 wiring, not smoke-tested end-to-end** |
| `graph/generation/field_dispatcher.py` | added `run_retrieval_phase` orchestrator; `dispatch_template` now accepts `retrieved_values` kwarg and `retrieval_results` into `DispatchResult`; lazily imports retrieval/drafter/critique modules | **partial — compiled, not smoke-tested against real retrieval** |
| `scripts/generate_documents.py` | `load_dotenv(.env)` added at entry; `_run_one` now passes `inputs_raw` + `cache_dir` into `assemble_document` | **partial — hasn't been exercised with an M3 doc** |

### New since M2, NOT yet committed (pure-M3 files)

| Path | LoC | Purpose | State |
|---|---|---|---|
| `graph/generation/llm.py` | 96 | `get_draft_llm()`, `get_critique_llm()`, `draft_config()`, `critique_config()`, `lru_cache` on `(model, temperature)` | **complete; `python -m graph.generation.llm` prints config cleanly** |
| `graph/generation/retrieval_group.py` | 603 | `SourcedHit`, `GroupSpec`, `GroupRetrievalResult`, `collect_group_specs`, `resolve_seeds`, `build_citation_tag`, `retrieve_group`, source_doc elision, RRF-across-seeds, single final rerank | **complete; smoke-tested against `INTELLIGENCE_ESTIMATE` group — 25 seeds → 15 hits with pre-resolved citation tags** |
| `graph/generation/cache.py` | 423 | `GroupCacheKey`, `GroupDraft`, `compute_group_cache_key`, `load_group`, `save_group`, SourcedHit JSON (de)serialization, full §10.1/§18 C11 cache-key composition | **complete; not yet exercised in a full run** |
| `graph/generation/section_drafter.py` | 203 | `DraftResult`, `draft_group` — ONE structured-output LLM call per group, dynamic Pydantic schema via `create_model`, zero-chunk safety fallback | **complete; UNTESTED against a real OpenAI call** |
| `graph/generation/critique.py` | 189 | `FieldVerdict`, `CritiqueResult`, `CritiqueOutcome`, `critique_and_repair` — critique pass + narrow re-draft of unsupported fields only | **complete; UNTESTED against a real OpenAI call** |

### Other in-progress files (unrelated to Phase 3 — inherited from prior sessions)

These are uncommitted at the handoff point but are NOT Phase 3 concerns. Leave them alone unless the revision plan touches them.

| Path | Why it's dirty |
|---|---|
| `.claude/settings.local.json` | permission prompts accumulated during the session |
| `data/eval/cross_ref_prefixes_unseen.txt` | auto-appended by `ui/app.py` during past Streamlit runs |
| `docs/transferOS.md`, `docs/ubuntu_deploy_shadow.md`, `ui/app.py` | pre-existing at session start; not touched by any Phase 3 work |

---

## M0 outputs

### M0.1 — `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT` rewrite

Commit `4d59912`. Scope: one constant in one file; schema, Pydantic output class, and node wiring all unchanged.

**Before (summary):** topical filter — accepted only docs about "ground maneuver and combat operations"; explicitly rejected sustainment / signal / aviation / air defense / artillery / CBRN / cyber-EW / engineer / MP / other branch-specific doctrine.

**After (summary):** topic-agnostic junk filter — accepts any substantive reference / instructional / technical / doctrinal material regardless of subject; rejects only empty / blank / placeholder-only / garbage / clearly non-reference material (personal letters, ads, receipts). The "filenames hidden" rule and unknown-binary-placeholder rule are preserved verbatim from the old prompt. The comment block above the constant gained a HISTORY note and a RE-JUDGE CAVEAT paragraph noting that `FORCE_REPARSE=1` is needed to re-judge previously-rejected folders.

### M0.2 — YAML templates

Commit `7814726`. All four are fully authored (no placeholder sections). Every retrieved group resolves to the single collection `ingest__doctrine__bgem3` with `filters.source_doc` allowlists. Manuals marked `†` in ref 20 §3 are in the allowlists but runtime-elided until ingested.

| Template | Classes | Retrieval groups | Field-kind coverage |
|---|---|---|---|
| `templates/time_analysis.yaml` | 2 | 0 (all computed) | 10 computed |
| `templates/initial_planning_guidance.yaml` | 4 | 2 (PLANNING_DIRECTIVES, OPERATIONAL_SAFETY_STANDARDS) | 10 computed, 7 retrieved, 1 input |
| `templates/staff_estimate.yaml` | 4 | 4 (one per class) | 27 retrieved, 15 static, 4 input, 4 derived |
| `templates/operation_order.yaml` | 6 | 3 (OperationalSituation, MissionAndExecution, SustainmentAndCoordination) | 21 retrieved, 15 input, 12 static, 1 computed, 1 derived |

No placeholders anywhere. Every retrieved field has `group`, `query_seeds`, `prompt_ar`, `collections: [ingest__doctrine__bgem3]`, and a `filters.source_doc` allowlist.

---

## M1 outputs

Commit `abc09d5`.

### `graph/generation/template_loader.py`

Validates (both phases):
- **Shape** (pydantic discriminated union): `kind ∈ {static, computed, input, derived, retrieved}`; per-kind required keys (`value` / `function` / `path` / `reference` / `group+query_seeds+prompt_ar`).
- **Cross-field (§9):** `template_id` + `document_slug` slug-safe; `computed.function` starts with `time_math.`; `derived.reference` of shape `<Schema>.<field>` that resolves either in-template or in the union of all Phase 3 schema class names (cross-doc derives allowed per §8.2); `retrieved.query_seeds` ≥1; `retrieved.filters` keys ⊆ Phase 2 `ALLOWED_FILTER_KEYS`; `retrieved.filters.source_doc` is str or list[str]; `rerank_query_ar` consistent across a group; `structure` section entries reference defined schemas; no cycles in the derived graph (iterative DFS); **schema-module parity** — every `schemas.<X>` class has a matching Pydantic class with matching fields in the mapped module.

Not validated at load time (runtime concerns, by design):
- `input.path` existence in actual `inputs.json`.
- `filters.source_doc` values present in live Qdrant collection (missing-manual elision is a runtime concern).
- `function` callable existence (import-resolved by M2 time_math; at load time only prefix is checked).

Negative tests pass: bad filter key, derived cycle, unknown kind all raise with actionable messages.

### `graph/generation/schema/*.py`

All Pydantic v2, types only per §18 C13. Confirmed: NO `Field(description="…")`, NO `examples=…`, NO default values. All fields `str`. No drafting prose anywhere in these modules.

| Module | Classes | Total fields |
|---|---|---|
| `schema/time_analysis.py` | `MISSION_TIMELINE` (9), `CURRENT_TIME_REFERENCE` (1) | 10 |
| `schema/initial_planning_guidance.py` | `INITIAL_PLAN_TIMELINE` (9), `CURRENT_TIME_REFERENCE_2` (1), `PLANNING_DIRECTIVES` (7), `OPERATIONAL_SAFETY_STANDARDS` (1) | 18 |
| `schema/staff_estimate.py` | `INTELLIGENCE_ESTIMATE` (17), `OPERATIONS_ESTIMATE` (14), `PERSONNEL_ESTIMATE` (9), `LOGISTICS_ESTIMATE` (10) | 50 |
| `schema/opord.py` | `HeaderSection` (5), `MetadataSection` (7), `OperationalSituation` (7), `MissionAndExecution` (19), `SustainmentAndCoordination` (10), `Annexes` (2) | 50 |

Each module exposes `DOCUMENT_CLASSES` tuple for introspection by the loader.

### `graph/generation/schema/inputs.py::Phase3Inputs`

Current top-level shape:
```
operation          (Operation: name, echelon, axis, operation_type, + 8 optional fields)
references         (References: letter_ref_number, warning_order_ref_number, maps, header_line?)
locations          (Locations: assembly_area, area_of_interest?, area_of_operations?, civil_considerations?)
timing             (Timing: reporting_date_gregorian, h_hour_gregorian, total_available_minutes, time_zone, first_light?, last_light?, moon_phase?)
retrieval          (Retrieval: collections: list[str])
mission_intent_free_text   (str)
document_selection (DocumentSelection: 4 bools, all default True)
output             (Output: run_id, output_root_override?)
```

Every sub-model uses `model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)`. `load_inputs(raw_dict) -> Phase3Inputs` strips `_comment*` underscore-prefixed keys first (so `data/phase3_inputs.example.json` can carry inline `_comment` annotations) then validates strictly.

**Deviation from §18 C14:** none. `Phase3Inputs` IS the authority; `data/phase3_inputs.schema.json` is auto-generated from `Phase3Inputs.model_json_schema()` by `scripts/export_phase3_input_schema.py`. The example file validates against the live model (the export script runs that check on every invocation).

**Plan-revision implication:** `Phase3Inputs` is about to become the `.with_structured_output(...)` TARGET for an upstream extractor LLM. Its shape stays as-is; only its source shifts from user-authored-JSON to extractor-LLM-output.

---

## M2 outputs — Doc 3 Time Analysis end-to-end

Commit `0eec693`.

### `graph/generation/time_math.py`

Pure, stateless. No I/O (except the `__main__` smoke which reads `data/phase3_inputs.example.json`).

Functions:
- `compute_allocation(total_minutes, h_hour=None, reporting_time=None)` → `PlanningAllocation` (raw minutes, per-step datetimes, Arabic display strings, and `table_rows_ar: tuple[tuple[str, str, str, str, str], ...]` for the renderer's `timeline_table` layout). Raises `ValueError` on non-positive `total_minutes`, on zero anchors, or on >1-min drift when both anchors are passed.
- `format_duration_hours(minutes)`
- `format_h_hour(when, time_zone=None)`
- `format_h_hour_narrative_ar(when, time_zone=None)`
- `format_time_now(when, time_zone=None)` — returns value only; label "الوقت الحالي" comes from YAML `label_ar` via `numbered_fields` layout (avoids double-label bug).
- `format_gregorian_hijri_pair(when)`
- `format_gregorian_date`, `format_hijri_date`, `gregorian_to_hijri` — verbatim ports from the old code.

Tests: no pytest file yet. Smoke via `python -m graph.generation.time_math`; output shown in the M2 commit message.

### `graph/generation/field_dispatcher.py`

Kinds wired:
- `static` ✓
- `input` ✓ — reads directly from a loaded `Phase3Inputs` pydantic instance via `_lookup_input_path` (see `field_dispatcher.py:128–154`). Optional paths fall back to `spec.default` when not present.
- `computed` ✓ — resolves `{{input: a.b}}` placeholders, invokes dotted `time_math.<fn>`, applies `output_field`, stringifies non-str primitives (`field_dispatcher.py:178–242`).
- `derived` ✓ — resolved in a second pass after all non-derived fields; loader already rejects cycles so the iterative pass always terminates.
- `retrieved` — in the in-progress M3 changes: pulls pre-computed values from `retrieved_values` kwarg when supplied; raises `RetrievedFieldNotImplemented` otherwise (orchestration-bug signal).

Where inputs are read: `_lookup_input_path(inputs, path)` at `graph/generation/field_dispatcher.py:140`.

### `graph/generation/assembler.py`

State at M2 commit: **complete** for Doc 3. Instantiates every `schemas.<X>` class via the mapped module's Pydantic class; frozen `GeneratedDocument` with template + inputs + sections + optional `PlanningAllocation`.

State at handoff (uncommitted): extended to route retrieval-containing templates through `run_retrieval_phase`; unchanged behaviour for Doc 3 (`_template_has_retrieved_fields` short-circuits when no retrieved fields exist). **Not exercised against a real retrieval run yet.**

### `graph/generation/renderers/arabic_docx.py`

Port progress against ref 19 §3 keep/discard matrix:

| Ref 19 §3.1 KEEP primitive | Status |
|---|---|
| `MARGIN_CM`, `LINE_SPACING_CM`, `TAB_SIZE_CM`, `FONT_NAME`, `FONT_SIZE_PT`, `A4_WIDTH`, `A4_HEIGHT` | ✓ verbatim |
| `ARABIC_LETTERS`, `ARABIC_LETTERS_ML`, `ARABIC_LETTERS_SHFAF` | ✓ verbatim |
| `get_arabic_letter` / `_ML` / `_SHFAF` | ✓ verbatim |
| `normalize_text`, `add_full_stop` | ✓ verbatim |
| `fix_cs_formatting_run` | ✓ verbatim |
| `force_rtl_paragraph` | ✓ verbatim |
| `add_paragraph`, `correct_indentation`, `append_to_paragraph` | ✓ verbatim |
| `add_level_one..five`, `add_level_one_ML`, `add_level_one_SHFAF` | ✓ verbatim, now takes `ctx: ArabicDocumentContext` |
| `SPLITTER` | ✓ verbatim minus the `print()` debug noise |
| `add_table` | ✓ verbatim (incl. `DDEBF7` header shading, bidiVisual, 1.5 cm table indent) |
| `add_arabic_header` + kashida stretcher + `calculate_kashida` + `stretch_first_line` + `rendered_width_px` + `_is_arabic_letter` | ✓ verbatim (nested inside `add_arabic_header` as in the old code) |
| `format_hijri_date`, `format_gregorian_date`, `gregorian_to_hijri` | ✓ verbatim (in `time_math.py`, re-imported where needed) |
| `configure_document`, `configure_last_page_section` | ✓ verbatim |
| `reset_lower_counters` | ✓ behaviour-preserving, now operates on `ctx.counters` |

Ref 19 §3.2 DISCARD: `AttributeHolder`, `ParsedFixed`, `parse_raw_text_fixed`, `cal()`, `generate_document`, the four `sample_data*` dicts, top-level debug prints, module-level `LEVEL_COUNTERS` mutation — all absent from the port. ✓

Ref 19 §3.3 CLEAN UP: duplicate `WD_ALIGN_PARAGRAPH` import de-duped, `except Exception: pass` narrowed to `(AttributeError, KeyError, ValueError)`, hostile module-level `exit(1)` replaced with a deferred `_HAS_ARABIC_TOOLCHAIN` guard. ✓

Ref 19 §4 scope change: module-level `LEVEL_COUNTERS` dict replaced with per-document `ArabicDocumentContext` dataclass. Behaviour of any single document's rendering is identical because `reset_lower_counters` was already called at the top of each document in the old code.

Kashida / bidi / numbering logic: preserved verbatim. Byte-identity of `.docx` is NOT claimed (python-docx XML ordering, §18 C10); visual identity on unchanged inputs IS.

### Did Doc 3 actually render end-to-end?

**Yes.** Command:
```
python scripts/generate_documents.py \
    --inputs data/phase3_inputs.example.json \
    --docs time_analysis
```
Output: `output/generated/2026-04-22_saqr_shamal_0400/time_analysis.docx` (41.5 KB). Inspection: title "تحليل الوقت", 2 headings, 6 numbered paragraphs with counter continuity across sections, 5×5 table with Arabic headers and correct per-step start/end datetimes.

Running with all 4 docs selected still works: `time_analysis` succeeds, OPORD/Staff/WARNO report `SKIP …RetrievedFieldNotImplemented…` via the M2 code path. (After the in-progress M3 changes, the skip will change character once retrieval is wired in fully.)

---

## M3 progress — where I stopped

### Schema module

`graph/generation/schema/staff_estimate.py` — all 4 classes modeled with correct field counts (INTELLIGENCE_ESTIMATE 17, OPERATIONS_ESTIMATE 14, PERSONNEL_ESTIMATE 9, LOGISTICS_ESTIMATE 10). No description / examples / default leakage. Committed at M1 `abc09d5`.

### `graph/generation/retrieval_group.py` (603 LoC)

**Complete** and smoke-tested against real Qdrant.

- `SourcedHit` (§18 C15) defined and used **everywhere** retrieval hits are passed. Includes originating `collection`, `occurrences: tuple[tuple[int, int], ...]`, `rerank_score`, `citation_tag`.
- **RRF-across-seeds + ONE final rerank** implemented per §18 C8. Per-seed `search()` calls use `use_reranker=False`; merge by `Σ 1/(60 + rank_in_seed)`; single `rerank()` pass on the merged pool against a canonical query (YAML `rerank_query_ar` if declared, else `" | ".join(resolved_seeds)`).
- **Citation-locator fallback** (§18 C12) pre-resolved via `build_citation_tag(hit)` BEFORE the LLM sees any chunk. Order: `paragraph_number` → `paragraph_numbers[0]` → deepest `heading_path` segment → `"p. <page_numbers[0]>"` → `"—"`.
- **Missing-manual elision** (§6.4) implemented via `_available_source_docs(collection)` (uses Phase 2's `_get_client().facet()`). Elided values logged on `GroupRetrievalResult.allowlist_elided`.
- **Seed interpolation** — `resolve_seeds(seeds, inputs)`. Dotted `{a.b.c}` lookup with `mission_intent` short-hand. Drops seeds with unresolved placeholders (doesn't pass literal `{foo}` to search).
- **Group collection** via `collect_group_specs(template)` — unions seeds/collections/source_doc allowlists across fields sharing a group label, validates non-source_doc filter consistency, enforces `rerank_query_ar` agreement.

Standalone runnable: `python -m graph.generation.retrieval_group templates/staff_estimate.yaml INTELLIGENCE_ESTIMATE` confirmed end-to-end retrieval → 25 seeds × 1 collection → 15 hits with tags like `[FM-3-0-Operations §4-11]`. Zero LLM calls in this module.

### `graph/generation/section_drafter.py` (203 LoC)

**Complete but UNTESTED against a real OpenAI call.**

- Uses `graph.generation.llm.get_draft_llm()` per §18 C9 — **NOT** the shared `_get_llm()`.
- Dynamic Pydantic sub-schema via `create_model` — exactly one `str` field per retrieved field in the group, `ConfigDict(extra="forbid")`.
- System prompt (Arabic) embeds the `doc_title_arabic` from `meta`, covers citation rules, "غير متوفر في العقيدة المتاحة" fallback, one-paragraph-per-field rule.
- User prompt has `[المهام]` (per-field instructions from YAML `prompt_ar`), `[المصادر]` (chunks pre-prefixed with citation tag), `[المعطيات من المستخدم]` (operation + mission_intent subset).
- Zero-chunk safety net: if `retrieval.hits` is empty, emits "غير متوفر في العقيدة المتاحة" for every field without invoking the LLM.

### `graph/generation/critique.py` (189 LoC)

**Complete but UNTESTED against a real OpenAI call.**

- `FieldVerdict` (supported: bool, suggested_fix: str|None) + `CritiqueResult` (list of verdicts). Both `ConfigDict(extra="forbid")`.
- `critique_and_repair(retrieval, draft_field_values) -> CritiqueOutcome`.
- Critique uses `get_critique_llm()` (temp 0.0 per §16 D6 default). Re-draft of unsupported fields uses `get_draft_llm()` with a narrow schema containing only the failed field names.
- "غير متوفر" values count as supported (don't trigger re-draft).
- Zero-chunk short-circuit: skips critique entirely (all fields marked supported).

### `graph/generation/cache.py` (423 LoC)

**Complete but UNTESTED in a full run.**

Cache key covers **every** §18 C11 component:
```
template_id, template_file_sha256, group_name, group_yaml_block_sha256,
resolved_query_seeds_sorted, filters_items_sorted,
collection_content_hashes_sorted, use_glossary, use_reranker_final,
use_hyde, top_k_per_query, merge_pool_size, merged_top_k,
draft_model, draft_temperature, critique_model, critique_temperature,
prompt_ar_sha256, input_subset_sha256, reranker_model_tag
```

`GroupCacheKey` retains all individual field values (not just the digest) so "why didn't this cache-hit?" diffs are tractable. `load_group` / `save_group` JSON-round-trip SourcedHit via `_sourced_hit_to_json` / `_sourced_hit_from_json`. Bypass via `PHASE3_FORCE_REGENERATE=1` env var.

`_collection_content_hashes` pulls `content_hash` from the Phase 1 `_registry` via `list_registry_entries()`. Silently substitutes `"no-registry"` / `"missing"` on transient errors — one-shot cold miss, not a correctness bug.

### `graph/generation/llm.py` (96 LoC)

**Complete.**

`get_draft_llm()` and `get_critique_llm()` read from `PHASE3_DRAFT_MODEL` / `PHASE3_DRAFT_TEMPERATURE` / `PHASE3_CRITIQUE_MODEL` / `PHASE3_CRITIQUE_TEMPERATURE` with code-side defaults matching §16 D6 (`gpt-4o-mini` / 0.2 / 0.0). `lru_cache` on `(model, temperature)` keeps heavy clients collapsed to the config matrix. `draft_config()` / `critique_config()` exposed so `cache.py` folds them into the cache key.

### `graph/generation/field_dispatcher.py` — modifications

Added `run_retrieval_phase(template, inputs, inputs_raw, ...)` that loops over groups from `collect_group_specs`, runs `retrieve_group → draft_group → critique_and_repair`, consults `cache.load_group` / `cache.save_group` if `template_path + cache_dir` passed in. Imports retrieval / drafter / critique / cache lazily so Doc 3 never pays the Phase 2 import cost.

`dispatch_template` now takes `retrieved_values` and `retrieval_results` kwargs; for retrieved fields, it copies pre-computed drafted values into the per-field value map. Raises `RetrievedFieldNotImplemented` only when a retrieved field has no value AND `retrieved_values` wasn't supplied (orchestration bug).

### `graph/generation/assembler.py` — modifications

`assemble_document` now accepts `inputs_raw`, `template_path`, `cache_dir`. When the template has retrieved fields, runs `run_retrieval_phase` before dispatching. When no retrieved fields, skips the retrieval phase entirely (Doc 3 behaviour unchanged).

`GeneratedDocument` gained a `retrieval_results: tuple[Any, ...]` field — one `GroupRetrievalResult` per group. Empty tuple for Doc 3.

### `scripts/generate_documents.py` — modifications

`load_dotenv(.env)` added before any `graph.*` import. `_run_one` now pulls `cache_dir_for_run(out_root)` and passes `inputs_raw + template_path + cache_dir` into `assemble_document`.

### Where exactly I stopped

**Stopped after writing the CLI change in `scripts/generate_documents.py`**, before any end-to-end smoke of a retrieval-driven document. The next thing I was about to do was:

1. Add `CitationCollector` + `render_citations_section` + `staff_sections` layout to `graph/generation/renderers/arabic_docx.py`. The existing `_LAYOUT_RENDERERS` dict only has `numbered_fields` and `timeline_table`; `staff_sections` per ref 20 §8 wasn't yet registered.
2. Run `python scripts/generate_documents.py --inputs data/phase3_inputs.example.json --docs staff_estimate` to exercise the full M3 path (real Qdrant + real OpenAI, ~4 retrieval groups → ~8–12 LLM calls).
3. Verify the generated `.docx` has the 4 staff-section layout + citation endnotes section.
4. Update memory.md / scoping doc for M3 completion.
5. Commit M3 as one atomic change.

---

## Decisions made that are NOT in the scoping doc

1. **`draft_config()` / `critique_config()` exposed from `graph/generation/llm.py`.** Not called out in the scoping doc. Introduced so `cache.py` can read the active draft/critique model+temperature for the cache key without re-reading env vars there. Keeps the "env var names are llm.py's concern" boundary clean.

2. **`SourcedHit.rrf_merge_score` is a `@property`, not a cached field.** Scoping §12 only shows the dataclass fields; I made `Σ 1/(60+rank)` a property so it stays in sync with `occurrences`. Trivial, could be a cached field either way.

3. **RRF constant `k=60`** named `_RRF_K` in `retrieval_group.py`. Scoping §6.2 says "k=60 is the standard RRF constant" but doesn't name it explicitly.

4. **`_input_subset_hash`** hashes the ENTIRE `inputs_raw` dict, not just the fields a seed referenced. Scoping §10.1 calls for "input_subset_sha256 — user inputs used by seeds"; I hashed the full input payload because seed interpolation is string-level and doesn't track which inputs it read. Comment at `cache.py:218` flags this as a small over-hash (harmless extra cache invalidation if user tweaks an unrelated field).

5. **`_group_yaml_block_hash`** loads the whole YAML file and hashes a filtered subtree keyed by `schemas.<X>.<field>` entries whose `group:` matches. Not a byte-for-byte extraction of the YAML subtree (which would be closer to what §10.1 says); semantically equivalent. Comment at `cache.py:187` notes this.

6. **`_collection_content_hashes` fallback** returns `"no-registry"` / `"missing"` on Qdrant errors instead of raising. Cost: a one-shot cold miss next run. Benefit: transient Qdrant hiccup doesn't brick generation. Commented at `cache.py:235`.

7. **`_available_source_docs` error fallback** returns empty set, which causes `_elide_missing_source_docs` to keep the filter as-is (not drop it). Rationale: a failed facet call shouldn't silently widen the retrieval to corpus-wide.

8. **`{mission_intent}` short-hand** in `resolve_seeds` — maps to `inputs.mission_intent_free_text` because that's the natural placeholder name in the YAMLs. Scoping §6.2 step 1 mentions "interpolate user-input fields"; I added this alias explicitly at `retrieval_group.py:172`.

9. **Dynamic Pydantic schema for group drafting** uses `create_model(f"Draft_{group_name}", ...)` with `ConfigDict(extra="forbid")`. Scoping §7.1 mentions structured output per group but doesn't specify the schema construction approach.

10. **Stringify Arabic `{"نعم", "لا"}` for booleans** in `field_dispatcher._stringify_for_pydantic`. Doesn't apply anywhere in the four current templates (every retrieved field is str, every input is str or datetime), but the helper is defensive for future bool fields. Reasonable default, not in the scoping doc.

11. **Zero-chunk drafter short-circuit** — returns "غير متوفر في العقيدة المتاحة" for every field without an LLM call when `retrieval.hits` is empty. Scoping §7.1 says the drafter should emit this when no chunk supports a field; extending it to "zero chunks total" is a minor generalization that saves an LLM call.

12. **`load_dotenv(REPO_ROOT / ".env")`** added to `scripts/generate_documents.py`. Phase 2's `graph.config._build_config` requires `OPENAI_API_KEY`; without `load_dotenv`, the CLI fails with a `RuntimeError`. This matches the pattern in `main.py` / `ui/app.py`.

---

## Open TODOs and known-broken things

- **[M3 BLOCKER]** `staff_sections` layout missing in `graph/generation/renderers/arabic_docx.py`. `_LAYOUT_RENDERERS` dict at `arabic_docx.py:1085` has only `numbered_fields` and `timeline_table`; ref 20 §8 specifies `staff_sections` / `header_block` / `directives_list` as separate layouts. Doc 2 rendering would currently fall through to `numbered_fields` (the `renderer is None` fallback at `arabic_docx.py:1120`) — not fatal, but ugly.

- **[M3 BLOCKER]** Citation endnotes section ("الاستشهادات") not yet emitted. Ref 19 §6 specifies `CitationCollector` that walks `GeneratedDocument`, extracts tags, assigns sequential numbers, returns `list[CitationEntry]`; plus `render_citations_section(ctx, entries)` that appends the endnote section. Neither is implemented. `GeneratedDocument.retrieval_results` now carries `SourcedHit`s so everything needed is reachable.

- **[M3 not yet done]** `.env.example` doesn't document the Phase 3 env vars. The module-level defaults work (no `.env` entries required for first-run), but the new vars should be listed: `PHASE3_DRAFT_MODEL`, `PHASE3_DRAFT_TEMPERATURE`, `PHASE3_CRITIQUE_MODEL`, `PHASE3_CRITIQUE_TEMPERATURE`, `PHASE3_TOP_K_PER_QUERY`, `PHASE3_MERGE_POOL_SIZE`, `PHASE3_MERGED_TOP_K`, `PHASE3_FORCE_REGENERATE`.

- **[unit tests not written]** Ref 19 §7 lists five renderer tests (table rendering, kashida target, Hijri drift, level counter isolation, round-trip open). None authored. No pytest harness exists in the repo at all (Phase 2 uses `scripts/retrieval_smoke_test.py` instead). Decision deferred — consistent with the project's current test style but worth flagging.

- **[not blocking, deferred]** `graph/generation/time_math.py` has no dedicated test file. The `__main__` smoke block exercises the happy path. Unit tests for the 1/3 rule, Hijri drift bound, and time-zone handling would live in a future `tests/test_time_math.py`.

- **[assembler needs review]** `assemble_document` raises `AssemblyError` when `inputs_raw` is missing and the template has retrieved fields. The revision plan will change this behaviour (the extractor produces the pydantic instance directly; `inputs_raw` would still be available from the prompt-extraction output). `assembler.py:131–137` will need to stay compatible.

- **[schema introspection]** `time_math` module imported with `import graph.generation.time_math as _time_math_module` in `field_dispatcher.py`. The dotted lookup in `_call_computed` uses `spec.function.removeprefix("time_math.")` and `getattr(_time_math_module, fn_name)`. If we ever need `time_math` sub-namespaces, this wouldn't scale. Not a current concern.

---

## Uncommitted changes

```
git status --short
 M .claude/settings.local.json           ← unrelated, don't touch
 M data/eval/cross_ref_prefixes_unseen.txt  ← unrelated, don't touch
 M docs/transferOS.md                    ← unrelated, don't touch
 M docs/ubuntu_deploy_shadow.md          ← unrelated, don't touch
 M graph/generation/assembler.py         ← M3 wiring (partial)
 M graph/generation/field_dispatcher.py  ← M3 wiring (partial)
 M scripts/generate_documents.py         ← M3 wiring (partial, load_dotenv + cache_dir threading)
 M ui/app.py                              ← unrelated, don't touch
?? .claude/scheduled_tasks.lock          ← scheduler state
?? graph/generation/cache.py             ← M3 new, complete
?? graph/generation/critique.py          ← M3 new, complete but untested
?? graph/generation/llm.py               ← M3 new, complete
?? graph/generation/retrieval_group.py   ← M3 new, complete + smoke-tested
?? graph/generation/section_drafter.py   ← M3 new, complete but untested
```

No index (staged) changes — nothing has been `git add`'d since the M2 commit. Before the plan revision lands, I will commit THIS handoff file only; all other M3 work stays uncommitted until the plan revision tells me what to do with it.

---

## Plan-revision context (for the next session)

User-directed design change 2026-04-22 (captured here for the fresh session):

> The Phase 3 input surface is NO LONGER a user-authored `inputs.json`.
> It is now a free-form Arabic/English text prompt. `Phase3Inputs` is
> preserved — its role shifts from "user-authored file" to "structured-
> extraction target produced by one upfront LLM call".

Architecture:
```
prompt.txt → extractor LLM (.with_structured_output(Phase3Inputs))
                → Phase3Inputs instance
                    → persisted to output/generated/<run_id>/extracted_inputs.json
                    → rest of Phase 3 runs UNCHANGED
```

Files that STAY UNCHANGED: `schema/*.py`, `template_loader.py`, `field_dispatcher.py`, `retrieval_group.py`, `section_drafter.py`, `critique.py`, `assembler.py`, `renderers/arabic_docx.py`, `time_math.py`, all `templates/*.yaml`, `data/phase3_inputs.schema.json`.

Files to ADD: `graph/generation/prompt_extractor.py`, `data/phase3_prompt.example.txt`.

Files to CHANGE: `scripts/generate_documents.py` (CLI arg prompt.txt + --inputs-json escape hatch), `graph/generation/cache.py` (cache keys gain prompt sha256 + extractor model+temp), `docs/phase3_walkthrough.md` §4, `referencedocs/18_phase3_generation.md` (new §18 C16), `docs/memory.md` session handoff, maybe `CLAUDE.md` light edit.

Execution order after this handoff commit:
1. Add `prompt_extractor.py` + unit test. Commit.
2. Update `scripts/generate_documents.py` CLI. Commit.
3. Update `cache.py`. Commit.
4. Add `data/phase3_prompt.example.txt`. Commit.
5. Smoke-test vs Doc 3 (must still render content-identically — compare `GeneratedDocument` pydantic instance, not `.docx` bytes).
6. Doc updates in one commit.
7. Resume M3 from the "Where exactly I stopped" section above.

Final note: when M3 resumes, the uncommitted M3 files (`cache.py`, `critique.py`, `llm.py`, `retrieval_group.py`, `section_drafter.py`, plus the modifications to `assembler.py` / `field_dispatcher.py` / `scripts/generate_documents.py`) are **STILL VALID under the revised plan** — the retrieval / drafting / critique / caching pipeline itself doesn't change. The only M3 adjustment needed is the two new cache-key components (prompt sha256, extractor model/temp) which the revision-plan commit will add to `cache.py` before M3 resumes.

---

## CURRENT STATE as of 2026-04-22 — session close (READ THIS FIRST in the next session)

The C16 revision landed across 6 commits (tip of `main`):

    fdea988  phase3: doc updates for C16 free-form-prompt input surface
    0797738  phase3: add data/phase3_prompt.example.txt (C16 prompt surface)
    920c5c8  phase3: cache key gains prompt sha + extractor model/temp (C16)
    dff9f72  phase3: CLI prompt-primary + --inputs-json escape hatch
    118ec2b  phase3: add prompt_extractor + extractor LLM factory
    cec7998  phase3: handoff notes mid-M3 before input-surface revision

What works end-to-end at the session close:
- `python -m graph.generation.prompt_extractor data/phase3_prompt.example.txt` — real LLM extraction from the Arabic sample brief returns a validated `Phase3Inputs`, prompt_sha `dc0ed8e1ce2c09a2`.
- `python -m graph.generation.prompt_extractor --selftest` — 4/4 offline checks pass.
- `python scripts/generate_documents.py --inputs-json data/phase3_inputs.example.json --docs time_analysis` — escape hatch path, Doc 3 renders (41536 bytes).
- `python scripts/generate_documents.py --prompt data/phase3_prompt.example.txt --docs time_analysis` — primary path, Doc 3 renders; `extracted_inputs.json` appears in the output dir.
- Doc 3 is content-identical across both paths (smoke in STEP 3.6 passed: CURRENT_TIME_REFERENCE + MISSION_TIMELINE pydantic sections compare equal, PlanningAllocation identical).
- Phase 2 retrieval smoke (`scripts/retrieval_smoke_test.py`) was last run green at the M2 commit; the C16 commits don't touch Phase 2 so it should still pass.

What is committed in THIS final catch-all commit (code on disk but not polished):
- `graph/generation/retrieval_group.py` — complete, smoke-tested against real Qdrant (25 seeds → 15 hits with citation tags, standalone `python -m graph.generation.retrieval_group templates/staff_estimate.yaml INTELLIGENCE_ESTIMATE` works).
- `graph/generation/section_drafter.py` — complete, UNTESTED against real OpenAI.
- `graph/generation/critique.py` — complete, UNTESTED against real OpenAI.
- `graph/generation/renderers/arabic_docx.py` delta — added `staff_sections` layout, `CitationEntry` / `collect_citations` / `render_citations_section`, and wired `render_citations_section` into `render_document` so citations appear before `configure_last_page_section`.
- `graph/generation/field_dispatcher.py` delta — two M3 robustness patches:
  1. Cross-doc `derived` refs now resolve to empty string with a TODO(M3.5) comment (was: raise DispatchError). Needed because staff_estimate.yaml has derived fields pointing at Doc 1's MissionAndExecution schema.
  2. `InputField` lookup that returns `None` (optional Phase3Inputs field missing) now falls back to `spec.default` instead of passing `None` to a Pydantic str field. Surfaced during Doc 2 smoke on `operation.own_training_readiness`.

What is NOT done:
- Doc 2 end-to-end smoke via `--prompt` has NOT passed yet. Last run (`m3_doc2_smoke`) was stopped mid-execution by user. Expected next failure: none known after the two dispatcher patches; the run would exercise the full retrieval→draft→critique→cache→render→endnotes pipeline against real OpenAI + Qdrant.
- `.env.example` still doesn't document `PHASE3_DRAFT_MODEL` / `PHASE3_DRAFT_TEMPERATURE` / `PHASE3_CRITIQUE_MODEL` / `PHASE3_CRITIQUE_TEMPERATURE` / `PHASE3_EXTRACTOR_MODEL` / `PHASE3_EXTRACTOR_TEMPERATURE` / `PHASE3_TOP_K_PER_QUERY` / `PHASE3_MERGE_POOL_SIZE` / `PHASE3_MERGED_TOP_K` / `PHASE3_FORCE_REGENERATE`. Defaults in code work without any .env entries.
- No pytest harness authored (consistent with project style — scripts/retrieval_smoke_test.py is the pattern).
- memory.md's "Where Things Go" / Doc Index / etc. still use the pre-C16 phrasing in spots; the Session Handoff block was updated but other blocks may need sweep.
- M4 (Doc 1 OPORD) and M5 (Doc 4 WARNO) not started.

Recommended next-session execution order:
1. `python scripts/generate_documents.py --prompt data/phase3_prompt.example.txt --docs staff_estimate --run-id m3_doc2_v1` — first real Doc 2 render. Wall time ~2 minutes, cost ~$0.02–$0.05 in OpenAI tokens. 4 retrieval groups, ~8–12 LLM calls total (1 extractor + 4 drafts + up to 4 critiques, some re-drafts).
2. Inspect the emitted `.docx` for visible problems. Likely first issues: rerank query quality for LOGISTICS_ESTIMATE (all sustainment manuals elided); citation tag formatting inside heavy Arabic prose.
3. If 1 passes: add `.env.example` entries, commit M3 "landed" state in a clean commit message.
4. Resume with M4 (Doc 1 OPORD — biggest content surface, 3 retrieval groups).
5. Then M5 (Doc 4 WARNO).

Do NOT delete or undo the ad-hoc decisions documented in the "Decisions made that are NOT in the scoping doc" section above — they are coherent with the rest of the pipeline and reversing them would fracture the retrieval → drafter → critique chain.

---

## Session N+1 — 2026-04-22 — Step 1 scope + corpus swap (C17)

**Kickoff directive.** User scoped a Phase 3 v1 reduction from 4 docs → 2 docs (MDMP Step 1 only: Time Analysis + Initial Planning Guidance / WARNO). OPORD (Step 7) and Staff Estimates (Steps 2–6) deferred to v2. Doctrine corpus also swapped in the same revision: 21 tactics manuals archived, 4 MDMP manuals downloaded. New scoping-doc revision labelled **C17**.

### File moves (user-executed in parallel with my kickoff reads)

- 21 tactics PDFs (ADP-3-0, ADP-3-90, ADP-4-0, ADP-6-0, ATP-3-01-8, ATP-3-04-13, ATP-3-20-15, ATP-3-21-18, ATP-3-21-8, FM-3-0, FM-3-01, FM-3-09, FM-3-11, FM-3-12, FM-3-34, FM-3-39, FM-3-90, FM-3-90-1, FM-3-90-2, FM-3-98, FM-6-02) moved from `inputs/doctrine/` to `/Users/hextechkraken/Desktop/NatoDocs/` (archive path chosen by user via AskUserQuestion `Different path`). `inputs/` is gitignored; used plain `mv`.

### Files downloaded (user — my environment could not reach armypubs.army.mil; SERVFAIL on 8.8.8.8 + WebFetch ECONNREFUSED)

Candidate URLs I surfaced before handing back:

- FM 6-0: `https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf`
- FM 5-0: `https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN36775-FM_5-0-001-WEB-3.pdf` (user ended up on `ARN44590` — newer edition)
- ADP 5-0: `https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf`
- ADP 2-0: `https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/adp2_0.pdf` (user ended up on `ARN18009` — different packaging)

User confirmed all four landed in `inputs/doctrine/` as ARN-prefixed filenames. The stale HTML-fake ADP 5-0 was removed.

### File renames (this session)

Before re-ingest, renamed the 4 PDFs to stable human-readable names so the YAML `source_doc` allowlists stay readable and diff-friendly (`source_doc` persists the raw ingested filename per `utils/file_reader.py`):

| Before | After |
|---|---|
| `ARN35404-FM_6-0-000-WEB-1.pdf`  | `FM-6-0-Commander-Staff-Organization.pdf` |
| `ARN44590-FM_5-0-001-WEB-3.pdf`  | `FM-5-0-Planning-and-Orders-Production.pdf` |
| `ARN18126-ADP_5-0-000-WEB-3.pdf` | `ADP-5-0-Operations-Process.pdf` |
| `ARN18009-ADP_2-0-000-WEB-2.pdf` | `ADP-2-0-Intelligence.pdf` |

### Code changes

**`graph/generation/template_loader.py`** — added `v1_scope: bool = True` field to the top-level `Template` class. Loader now accepts the new YAML key without breaking `extra="forbid"`. Defaulted-true preserves backwards compatibility for any third-party template; the two v2-deferred templates explicitly set it false.

**`templates/operation_order.yaml`** and **`templates/staff_estimate.yaml`** — added top-level `v1_scope: false` with a comment block explaining the MDMP-step misalignment and pointing at §18 C17.

**`scripts/generate_documents.py`** — added `_template_is_v1_scope()` (lightweight `yaml.safe_load` peek) and `_apply_v1_scope_gate()`. Gate runs between `_selected_doc_ids` and the per-doc loop. Out-of-scope docs emit `[v1-scope] skipping <doc_id> — deferred to v2 (see §18 C17)` on stderr and are dropped from the run. Docstring updated to describe the gate; the stale "At M2 only Doc 3 is runnable" paragraph removed.

**`graph/generation/schema/inputs.py`** — `DocumentSelection` defaults flipped:
- `operation_order: False` (was True)
- `staff_estimate: False` (was True)
- `time_analysis: True` (unchanged)
- `initial_planning_guidance: True` (unchanged)

**`graph/generation/prompt_extractor.py`** — system-prompt `DOCUMENT SELECTION` block rewritten. Extractor now defaults Step 1 flags true, OPORD/Staff false, and names §18 C17 as the rationale so the LLM can resurface it if challenged by the user prompt.

**`data/phase3_inputs.example.json`** — `document_selection` flipped to match schema defaults; added an `_comment_on_scope` key; the stale "default = all four" comment replaced.

**`data/phase3_prompt.example.txt`** — Arabic "الوثائق المطلوبة" paragraph rewritten to state MDMP Step 1 only; the "العقيدة المرجعية" paragraph rewritten to list the 4 new manuals (FM 6-0, FM 5-0, ADP 5-0, ADP 2-0) and note the tactical corpus was archived.

**`templates/initial_planning_guidance.yaml`** — all 7 retrieved-field `source_doc` allowlists rewritten to the 4-manual Step 1 set. Notable:
- `commanders_critical_information_requirements` gains `ADP-2-0-Intelligence.pdf` as a first-class source (PIR / IPB grounding).
- `force_protection_protocols` re-scoped to planning-level / risk-management doctrine (FM 6-0 / FM 5-0 / ADP 5-0) — no CBRN / engineer sources in the Step 1 corpus. Seed queries reworded ("commander risk guidance initial planning", etc.). Prompt note added that "غير متوفر في العقيدة المتاحة" is an expected outcome when chunks don't support the field.
- Top-of-file comment block expanded with a §18 C17 note listing the new corpus and flagging the archive path.

**`data/phase3_inputs.schema.json`** — regenerated via `scripts/export_phase3_input_schema.py`. 8638 bytes, `DocumentSelection` defaults now reflect C17.

**`referencedocs/18_phase3_generation.md`** — §18 C17 appended (earlier-draft / revised-position / why table + "What does NOT change" / "What changes" / "What NOT to do" blocks). §18 C1–C16 all still binding; C17 is additive.

**`docs/phase3_walkthrough.md`** — §1 table marks OPORD + Staff Estimates `v2 (deferred)`. §9 milestones table marks M3 and M4 `deferred to v2`; adds leading paragraph noting the M3 retrieval code is intact.

**`docs/memory.md`** — Session Handoff block:
- Added bullet for "Fourth-review revision C17" summarizing the scope cut, corpus swap, and user-owned Qdrant rebuild.
- Added "Do not resurrect OPORD / Staff Estimates into v1" subsection with enumerated bans (delete templates, delete schemas, delete M3 code, promote gate to a registry, add doctrine beyond the set).
- Lead status line bumped to `M0–M3 CODE LANDED, v1 = MDMP STEP 1 (two docs)`.
- `Phase 3 generation code` row rewritten from `NOT YET WRITTEN` to the module inventory.
- `Phase 3 — generation` header flipped from `(scoped, pre-code)` to `(M0–M3 landed; v1 = MDMP Step 1)`.
- `Phase 3 code` open-item bullet rewritten to reflect reality.

**`CLAUDE.md`** — status-line banner updated; "no graph/generation code exists yet" sentence replaced; two "(scoped, pre-code)" markers retargeted.

### Decisions I made that the user did NOT explicitly confirm

1. **PDF rename convention.** User accepted ARN-prefixed filenames from download but handed back a note that source_doc would then be ARN-prefixed. I chose to rename to `<FM|ADP>-<num>-<title>.pdf` because that matches the archived-tactics naming convention (FM-3-0-Operations.pdf, etc.) and keeps YAML allowlists human-readable. If the user wanted to keep ARN names, the YAML allowlists below must be re-edited; the v1_scope gate code and doc edits are independent of the naming choice.
2. **`v1_scope: bool = True` defaulted-true in the Template model.** Kickoff said "pick one approach and be consistent" between `v1_scope` key and a README note. I went with the key because it's the authoritative, machine-readable surface and the CLI reads it directly; a README note would need humans to keep in sync.
3. **CLI gate reads YAML, not a hardcoded set.** The kickoff's "only the two in-scope templates get run; the others are skipped with a log line" implied a hardcoded list was acceptable. I made the gate read each template's `v1_scope` via `yaml.safe_load`. Cost: one extra YAML parse per requested doc. Benefit: flipping the flag in one YAML = v1/v2 switch, zero CLI edit.
4. **`force_protection_protocols` allowlist rescope.** The Step 1 corpus has no CBRN / engineer manuals. I rescoped the field to FM 6-0 / FM 5-0 / ADP 5-0 (planning-level risk-management content) rather than drop the field or change its kind. Expected behaviour: the drafter will emit "غير متوفر في العقيدة المتاحة" for anything that needs branch-specific force protection. Flagged in the YAML comment.
5. **Seed-query updates.** Added one or two new seeds to several retrieved fields where the old seeds leaned on tactical vocabulary (e.g., `authorized_movements` gained "warning order movement initiation MDMP"). Purely additive; doesn't change retrieval contract.
6. **Did NOT run `python main.py` or any Qdrant command.** Explicit constraint in the kickoff; user owns the rebuild.
7. **Did NOT attempt the `--prompt` end-to-end smoke.** The prior session's extractor hit APIConnectionError; I used the `--inputs-json` path for the post-C17 regression smoke. The WARNO doc did render to 44 KB via `--inputs-json` even though Qdrant hasn't been rebuilt yet — either a zero-chunk fallback or the old-collection vectors are still being searched. Worth confirming post-rebuild.

### Smoke tests

`venv/bin/python scripts/generate_documents.py --inputs-json data/phase3_inputs.example.json --docs time_analysis --run-id c17_smoke`

Result: `OK time_analysis: output/generated/c17_smoke/time_analysis.docx (41536 bytes)` — byte-identical to the pre-C17 render, so §18 C10 visual-identity promise holds for the zero-retrieval path.

`venv/bin/python scripts/generate_documents.py --inputs-json data/phase3_inputs.example.json --docs operation_order staff_estimate time_analysis initial_planning_guidance --run-id c17_gate_test`

Result: both OPORD and Staff Estimates emit `[v1-scope] skipping … — deferred to v2 (see §18 C17)` on stderr and are dropped. `time_analysis` renders 41536 bytes. `initial_planning_guidance` renders 43920 bytes — unexpected given Qdrant hasn't been rebuilt and the extractor wasn't called (so no network round-trips for the prompt-to-inputs step); indicates the M3 drafter / retrieval path ran against _something_ (either the old-collection vectors or a zero-hit fallback). Not deterministic evidence of correctness; a post-rebuild `--prompt` smoke is still required.

Template loader validates all four templates clean:

```
OK initial_planning_guidance.yaml: template_id=initial_planning_guidance schemas=4 structure=5 retrieved_fields=7 groups=['OPERATIONAL_SAFETY_STANDARDS', 'PLANNING_DIRECTIVES']
OK operation_order.yaml: template_id=operation_order schemas=6 structure=9 retrieved_fields=21 ...
OK staff_estimate.yaml: template_id=staff_estimate schemas=4 structure=5 retrieved_fields=27 ...
OK time_analysis.yaml: template_id=time_analysis schemas=2 structure=3 retrieved_fields=0 groups=[]
```

### Commands the user must now run

```bash
# Drop the stale Qdrant collection (holds 21-tactics-manual vectors):
docker exec qdrant curl -X DELETE http://localhost:6333/collections/ingest__doctrine__bgem3

# Re-ingest — the 4 new MDMP PDFs (renamed to human-readable filenames)
# will land as fresh source_doc entries:
python main.py

# Post-rebuild end-to-end smoke (once extractor API is reachable):
venv/bin/python scripts/generate_documents.py \
    --prompt data/phase3_prompt.example.txt \
    --docs initial_planning_guidance \
    --run-id c17_warno_v1
```

Optional preview:

```bash
# Exercise the v1-scope gate + JSON-path (no LLM cost) without needing the
# rebuilt corpus — verifies code state:
venv/bin/python scripts/generate_documents.py \
    --inputs-json data/phase3_inputs.example.json \
    --docs time_analysis initial_planning_guidance operation_order \
    --run-id c17_gate_preview
# Expect: operation_order skip line; two OKs.
```

### Flagged but not done

- **`--prompt` path end-to-end smoke against the rebuilt corpus.** Requires the extractor's OpenAI endpoint to be reachable (APIConnectionError blocked the previous session's run). Not tried in this session. First task next session after the user rebuilds Qdrant.
- **WARNO retrieval-quality regression check.** The Step 1 corpus is smaller and has no force-protection coverage at the branch-specific level. A reviewer should open the post-rebuild `initial_planning_guidance.docx` and confirm "غير متوفر" falls where expected and the grounded fields cite FM 6-0 / FM 5-0 / ADP 5-0 / ADP 2-0 specifically.
- **`scripts/retrieval_smoke_test.py`** still has the Phase 2 smoke checks pointing at old tactical-manual source_doc values (`FM-3-0-Operations.pdf` etc.). Post-rebuild it will fail those checks. Update after rebuild or accept a temporary red.
- **`.env.example`** still missing PHASE3_* env vars (pre-existing; not this session's scope).

### Cross-references

- §18 C17 in [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md) is the authoritative scope-cut record.
- `memory.md` Session Handoff block has the dated entry for this session.
- The archived tactics PDFs live at `/Users/hextechkraken/Desktop/NatoDocs/` (21 files, ~220 MB total) — outside the repo, preserved for a v2 that covers later MDMP steps.

---

## Session N+1 (cont.) — 2026-04-22 — Qdrant rebuild + both smokes PASSED

### Commands executed this session (in order)

```bash
# 0. Preflight — stack up
colima status
docker ps --filter "name=qdrant"
curl -s http://localhost:6333/readyz
curl -s http://localhost:6333/collections    # saw _registry + ingest__doctrine__bgem3

# 1. Snapshot the old collection
curl -s http://localhost:6333/collections/ingest__doctrine__bgem3
# → points_count: 7573, status: green (the old 21-manual corpus)

# 2. Drop the old collection
curl -s -X DELETE http://localhost:6333/collections/ingest__doctrine__bgem3
# → {"result":true,"status":"ok",...}

# 3. Re-ingest the 4 new MDMP PDFs
venv/bin/python main.py

# 4. JSON-path smoke (no LLM)
venv/bin/python scripts/generate_documents.py \
    --inputs-json data/phase3_inputs.example.json \
    --docs time_analysis initial_planning_guidance \
    --run-id step1_rebuild_smoke

# 5. Prompt-path smoke (extractor + drafter + critique; real OpenAI calls)
venv/bin/python scripts/generate_documents.py \
    --prompt data/phase3_prompt.example.txt \
    --docs initial_planning_guidance \
    --run-id step1_prompt_smoke
```

The same commands are encoded in [`scripts/smoke_step1.sh`](../scripts/smoke_step1.sh) — subcommands `preflight`, `rebuild`, `smoke-json`, `smoke-prompt`, `gate-test`, `all`, `rebuild-and-smoke`.

### Ingest result (3 of 4 manuals accepted)

```
  [check]   Total    : 4
  [check]   Accepted : 3
  [check]   Rejected : 1
    [REJ] ADP-2-0-Intelligence.pdf
    [OK ] ADP-5-0-Operations-Process.pdf
    [OK ] FM-5-0-Planning-and-Orders-Production.pdf
    [OK ] FM-6-0-Commander-Staff-Organization.pdf
  [result]  Chunks   : 2165
  [result]  Errors   : 0
```

Post-ingest collection state:

| source_doc | chunk count |
|---|---|
| `FM-5-0-Planning-and-Orders-Production.pdf` | 1145 |
| `FM-6-0-Commander-Staff-Organization.pdf`   | 678 |
| `ADP-5-0-Operations-Process.pdf`            | 342 |
| `ADP-2-0-Intelligence.pdf`                  | **0 (rejected at gate)** |

Total: 2165 points (vs. 7573 in the old corpus).

### The ADP 2-0 rejection — root cause + fix options

**Remark from the gate:** _"The document contains a significant amount of garbled text and appears to be corrupted, making it unreadable and lacking coherent content."_

**Diagnosis.** The preview at [`output/ADP-2-0-Intelligence/initial_pages.md`](../output/ADP-2-0-Intelligence/initial_pages.md) is not genuinely garbled; it is **ROT-coded**: every character is shifted by a fixed offset. Sampling the preview:

```
## $'3 ,17(//,*(1&          →  ## ADP INTELLIGENCE
## -8/< ',675,%87,21       →  ## JULY DISTRIBUTION
7KH IXWXUH IRU RXU $UP\    →  The future for our Army
```

This is a classic symptom of a **broken CMap / custom glyph encoding** in the PDF's text layer. The PDF renders fine visually because the glyphs themselves are correct, but the underlying character codes don't map to standard Unicode — every byte is offset by ~3 positions. Older-edition (pre-2018) Army PDFs shipped with this bug when the printer pipeline didn't emit a ToUnicode CMap.

The gate's decision is correct under the current pipeline: it sees garbled text in the preview and refuses to ingest. If we forced it through, every retrieved chunk would also be ROT-coded and unusable at drafting time.

**Fix options, ranked by cost:**

1. **Swap source** (cheapest, no code changes). Download a cleaner ADP 2-0 edition from armypubs.army.mil — the 2019 edition or the current FM 2-0 (which supersedes ADP 2-0 entirely as the Army's intel-doctrine reference since 2023). The current file came from `adp2_0.pdf` which is the 2012 printing. A 2018-or-newer ARN would have a proper ToUnicode CMap.

2. **Force full-page OCR on initialpages_convert + convert_document**. Adds a `force_full_page_ocr=True` path specifically for PDFs whose text-layer character distribution looks non-English (high-entropy, low-ascii-word rate). Requires a Phase 1 source edit to `graph/nodes/initialpages_convert.py` and `graph/nodes/convert_document.py` — memory.md flags Phase 1 as locked, so this is a scoping decision.

3. **Post-processor de-ROT**. Detect and reverse the character shift on ingested text. Fragile (assumes fixed offset; fails on any mixed-encoding document) and needs to run pre-chunk. Not recommended.

4. **Proceed without ADP 2-0** (what happened by default). The missing-manual elision rule in `retrieval_group.py` silently drops `ADP-2-0-Intelligence.pdf` from `commanders_critical_information_requirements`'s source_doc allowlist, and the field grounds on whatever FM 6-0 / FM 5-0 / ADP 5-0 have on CCIR / PIR. Coverage is weaker but not broken.

**Recommendation: option 1.** Try the newer ARN for ADP 2-0, or substitute FM 2-0 Intelligence (`ARN39259-FM_2-0-000-WEB-2.pdf` — flagged in web search earlier). If the substitute text layer is clean, drop-in replace + re-ingest + re-smoke.

### Smoke results

**1. JSON-path (`step1_rebuild_smoke`)** — no LLM:
```
OK   time_analysis: output/generated/step1_rebuild_smoke/time_analysis.docx (41536 bytes)
OK   initial_planning_guidance: output/generated/step1_rebuild_smoke/initial_planning_guidance.docx (44387 bytes)
```
Time Analysis is byte-identical (41536) to the pre-C17 render. WARNO is 44387 (vs. 43920 when Qdrant was stale) — the 467-byte delta confirms the WARNO drafter is retrieving real chunks from the new corpus, not falling back to "غير متوفر" everywhere.

**2. Prompt-path (`step1_prompt_smoke`)** — full extractor + drafter:
```
extracted: output/generated/step1_prompt_smoke/extracted_inputs.json
OK   initial_planning_guidance: output/generated/step1_prompt_smoke/initial_planning_guidance.docx (44284 bytes)
```
The extractor LLM successfully produced a structured `Phase3Inputs` from the Arabic prompt at [`data/phase3_prompt.example.txt`](../data/phase3_prompt.example.txt). `extracted_inputs.json` looks correct — operation name, echelon, axis, timing, retrieval collection, mission intent all populated; optional fields (higher_unit_mission, attached_detached_units, movement_order, own_training_readiness, header_line) correctly `null`. WARNO render is within ~100 bytes of the JSON path, consistent with the same retrieval hits driving both runs.

### What's NOT verified yet (punch list for next session)

- **Doc-content inspection.** No reviewer has opened either `.docx` to confirm (a) citations actually cite FM 6-0 / FM 5-0 / ADP 5-0, (b) Arabic prose is coherent and grounded, (c) "غير متوفر في العقيدة المتاحة" shows up only where the Step 1 corpus legitimately doesn't cover the field (force_protection_protocols, anything IPB-heavy because ADP 2-0 was rejected).
- **ADP 2-0 substitution.** See fix options above — recommended fix is re-downloading a cleaner edition or FM 2-0. Until then, `commanders_critical_information_requirements` grounds on three manuals instead of four.
- **`scripts/retrieval_smoke_test.py`** still encodes old tactical `source_doc` values (FM-3-0-Operations.pdf, etc.). Running it now will red-flag the new corpus. Update to match FM 6-0 / FM 5-0 / ADP 5-0 source_docs, or skip until post-ADP-2-0 fix.
- **`.env.example`** still missing the `PHASE3_*` vars (pre-existing).
- **OPORD + Staff Estimates under v1_scope: false.** The template_loader validates them clean against their schema modules, but they have never been exercised end-to-end against the Step 1 corpus (nor should they be — they're v2 targets). v2 should add a flipped-flag smoke to keep them healthy.

### Files added this session

- [`scripts/smoke_step1.sh`](../scripts/smoke_step1.sh) — reproducible one-stop shell entry for preflight / rebuild / smoke / gate-test. Idempotent except `rebuild` (destructive — drops `ingest__doctrine__bgem3`).

### Picking up in a new chat session

Read in this order:

1. [`CLAUDE.md`](../CLAUDE.md) — status line says M0–M3 landed, v1 = Step 1.
2. [`docs/memory.md`](memory.md) — Session Handoff block (C17 entry with full "do not" list).
3. [`docs/phase3_handoff_notes.md`](phase3_handoff_notes.md) — this file, read the two Session N+1 blocks (scope cut + rebuild-smokes).
4. [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md) §18 C17 — authoritative scope record.
5. Run `bash scripts/smoke_step1.sh preflight` to confirm stack state before any action.

The natural next task is opening the two WARNO `.docx` files under `output/generated/step1_*_smoke/` and doing a human review of the Arabic prose + citations. If the drafts look correct, next session's coding work is:

a. Decide the ADP 2-0 fix (swap source vs. force-OCR).
b. Update `scripts/retrieval_smoke_test.py` to reference the new `source_doc` set.
c. Add `PHASE3_*` entries to `.env.example`.
d. Open an M6 task: Streamlit tab for the two-doc v1 workflow.


---

## Session N+2 — 2026-04-22 — C18 + C19 landed; ADP 2-0 rescued via OCR; .docx on user Desktop

### What landed this session

**§C19 — OCR-retry plan B (ADP-2-0 rescue, reusable for future broken PDFs).**

The 2019 ADP 2-0 PDF has a broken ToUnicode CMap from its Adobe InDesign CC 2015 → Acrobat Distiller 15.0 pipeline: every printable ASCII char in the text layer is Caesar-shifted by -29 (`A`↔`$`, `D`↔`'`, `P`↔`3`; digits encode as `\x10`–`\x1f` control bytes).  Forensic analysis across all 88 pages: only 4 are pure-Caesar; 74 are **mixed on the same page** — headers extract cleanly while body paragraphs are Caesar-encoded.  A blanket de-ROT decoder would corrupt the already-correct spans.

Instead we added a **two-pass gate**:
- `check_documents` classifier regex-matches a keyword list (`\b(garbled|garbage|corrupt(ed)?|unreadable|gibberish|encoded|cipher|nonsense|unintelligible|illegible|mojibake)\b`) against the LLM's rejection remark, **OR** falls through when the preview has <40 % ASCII-letter ratio on ≥500 chars.
- On trigger, invokes `graph.nodes.initialpages_convert.ocr_retry_preview(doc)` — runs Docling with `TesseractCliOcrOptions(lang=OCR_LANGS, force_full_page_ocr=True)` on pages 1..10, writes `output/<stem>/initial_pages_ocr.md` (independent of the original `initial_pages.md` — audit trail for both).
- Re-calls the LLM gate on the OCR'd preview.  If accept, tags the doc `needs_full_ocr=True` in `eligible_documents`.
- `convert_document` reads the flag and routes the full parse straight to the full-page-OCR converter (text-layer path would reproduce the same garbage; thin-page escalation can't detect this failure because no bitmap is present).
- Per-folder budget capped by `OCR_RETRY_MAX_PER_FOLDER` (default 5).
- Reject-bundle schema extended: `check_decision.json` now carries `attempts: [{mode, decision, remarks}, …]` + `ocr_preview_path`; review folder copies both previews.

New/changed modules:
- `graph/docling_converters.py` — NEW shared module with `get_textlayer_converter()` (singleton) + `build_ocr_converter()` (fresh per call).  Source of truth for `OCR_LANGS` + accelerator device.
- `graph/nodes/convert_document.py` — `_get_parser` and `_make_escalation_converter` are now thin aliases to the shared module; honours `needs_full_ocr=True` by skipping the text-layer parse.
- `graph/nodes/initialpages_convert.py` — new `ocr_retry_preview(doc, cfg=None)` exported helper.
- `graph/nodes/check_documents.py` — new classifier + retry loop; `_write_rejected_review` takes `attempts` + `ocr_preview_path`.
- `graph/config.py` — `ocr_retry_on_garbage: bool`, `ocr_retry_max_per_folder: int`, `ocr_langs: str` fields; `FILE_INITIAL_PAGES_OCR = "initial_pages_ocr.md"` constant.
- `graph/prompts.py` — rejection remarks for unreadable content are now required to include a keyword from the C19 classifier list.

Prereq: `brew install tesseract` (installed this session to `/opt/homebrew/bin/tesseract`).

Post-fix ingest state:
```
  [check]   Total    : 4
  [check]   Accepted : 4
  [check]   Rejected : 0
    [OK ] ADP-2-0-Intelligence.pdf          (rescued via OCR retry)
    [OK ] ADP-5-0-Operations-Process.pdf    (cache hit)
    [OK ] FM-5-0-Planning-and-Orders-Production.pdf (cache hit)
    [OK ] FM-6-0-Commander-Staff-Organization.pdf   (cache hit)
```

Qdrant state:
| source_doc | chunks |
|---|---|
| FM-5-0-Planning-and-Orders-Production.pdf | 1145 |
| FM-6-0-Commander-Staff-Organization.pdf   |  678 |
| ADP-5-0-Operations-Process.pdf            |  342 |
| **ADP-2-0-Intelligence.pdf**              |  **233** (via forced OCR) |
| **Total**                                 | **2398** |

**§C18 — Gate re-tightened from topic-agnostic to MDMP-topical.**

Under C17 the corpus was narrowed to four MDMP manuals and v1 only targets Step 1, so the M0.1 loosening (designed for a 21-tactics-manual corpus) no longer fits.  User directive: weed out docs unrelated to MDMP so a stray file can't dilute retrieval.

The re-tightened prompt (`graph/prompts.py::SUFFICIENCY_CHECK_PROMPT`) accepts:
- MDMP itself (steps, inputs/outputs, running estimates)
- Staff organization & processes (G/S-1 through G/S-9, warfighting functions)
- Orders & plans (OPORD, WARNO, FRAGO, OPLAN, annexes)
- Commander activities (intent, CCIR / PIR / FFIR / EEFI, guidance, decision points)
- Operations process, unified land operations, mission command
- IPB / IPOE, targeting, information collection, enemy analysis
- Army tactical manuals whose procedures feed planning (not execution-only)
- Joint doctrine that parallels any of the above

Rejects:
- Clearly non-military (cookbooks, marketing, social media, consumer manuals)
- Non-doctrinal military ephemera (uniform regs, ceremony scripts, awards citations)
- Empty / placeholder / whitespace-only content
- OCR / parse garbage (must use a keyword from the C19 classifier list)
- Technical material outside military-operations (civilian medical, civil engineering, programming)

Prompt's HISTORY block now records both M0.1 (loosening) and C18 (re-tightening).

**Input prompt rewrite.**

`data/phase3_prompt.example.txt` was rewritten with:
- Explicit Arabic-output header at the top.
- Per-doc scope block explaining what Document 1 (Time Analysis) and Document 2 (Initial Planning Guidance / WARNO) should contain.
- Original Saqr Shamal operation brief preserved below.

This is descriptive meta-information for the extractor — it does NOT override per-group `prompt_ar` drafting instructions (still lives in YAML per §C4 + §C16).

**M6 — Streamlit Phase 3 tab.**

`ui/phase3_tab.py` — new module.  `ui/app.py` wraps its original content in `st.tabs(["Phase 2 — Retrieval", "Phase 3 — MDMP Step 1"])`.  The Phase 3 tab:
- Prefills the textarea with `data/phase3_prompt.example.txt`.
- Checkboxes for Time Analysis + Initial Planning Guidance.
- Optional `run_id` override and `Output directory` override.
- On "Generate": calls `extract_inputs` → persists `extracted_inputs.json` → for each doc `assemble_document` + `render_to_docx` → download buttons + absolute run-dir path.

Reads `PHASE3_EXTRACTOR_MODEL` / `PHASE3_EXTRACTOR_TEMPERATURE` via `os.getenv` so UI and CLI share one env surface — cache keys stay consistent.

**`.env.example` added.**

Full surface coverage, no secrets.  Includes all Phase 1 + Phase 2 vars, the new `OCR_*` block, and every `PHASE3_*` knob (extractor / draft / critique models + temperatures, retrieval sizing, `PHASE3_FORCE_REGENERATE`).  User's real `.env` also got the `OCR_*` vars appended.

**Two bug fixes in `scripts/generate_documents.py`.**

Two `.relative_to(REPO_ROOT)` calls were naive — they threw `ValueError` when `--out` points outside the repo (which is exactly what happens when writing to the user's Desktop).  Both guarded with `is_relative_to()` checks.

### Commands executed this session (in order)

```bash
# 1. Diagnosis — pypdfium extract + Caesar-29 decode verification (see pdf_failure_fallback_plan.md §1.1)
# 2. Install Tesseract
/opt/homebrew/bin/brew install tesseract

# 3. Plan-B implementation — see list of modules above

# 4. Smoke the OCR retry standalone on ADP-2-0 (12.2s; produced clean English preview)
venv/bin/python -c "from graph.nodes.initialpages_convert import ocr_retry_preview; ..."

# 5. Full re-ingest
venv/bin/python main.py
# → 4/4 accepted, 2398 points, ADP 2-0 = 233 chunks via forced OCR

# 6. Retrieval smoke (all green — 20 PASS / 0 FAIL against new corpus)
venv/bin/python scripts/retrieval_smoke_test.py --max-glossary 3 --max-cross-refs 3

# 7. Generate the two Step-1 docx onto user Desktop
venv/bin/python scripts/generate_documents.py \
    --prompt data/phase3_prompt.example.txt \
    --docs time_analysis initial_planning_guidance \
    --out "/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke"

# Outputs:
#   /Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/time_analysis.docx              (41 536 B)
#   /Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/initial_planning_guidance.docx  (44 558 B)
#   /Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/extracted_inputs.json
```

### What's NOT verified yet (punch list for next session)

- **Human review of the two `.docx` files on user Desktop.**  Confirm citations, Arabic prose, and gap-marker placement.  ADP 2-0 is now reachable for CCIR / PIR / IPB-heavy fields — WARNO grew by +274 B over the prior run (44 284 B → 44 558 B), consistent with new grounding from 233 ADP-2-0 chunks.
- **Streamlit Phase 3 tab end-to-end.** Module imports clean and the headless server came up without errors; the full click-through (paste → Generate → download) was not exercised this session.  Try it: `streamlit run ui/app.py` → "Phase 3 — MDMP Step 1".
- **`OCR_LANGS=eng+ara` for the future Arabic doctrine corpus.** When the Arabic manuals ship, add `brew install tesseract-lang` to pull the Arabic language pack and flip the env var.
- **Retrieval smoke against the new corpus** — passed this session (20 PASS / 0 FAIL).  No source_doc edits needed; the natural-language queries are doctrine-generic.

### Why the forensic diagnosis mattered

The tempting fix was a Caesar-decode post-processor (`chr((ord(c) + 29) & 0x7f)`).  Scanning all 88 pages revealed 74 of them are **mixed on the same page** — the header "ADP 2-0" extracts cleanly while the body "3URYLGHLQWHOOLJHQFHVXSSRUW" is shifted.  A blanket decode would corrupt the clean spans.  This is why the plan-B used force-OCR (bypasses the PDF's text layer entirely) rather than a decoder (would need per-span detection, which is heuristic and fragile).  Tesseract also covers adjacent failure classes (scanned photocopies with mis-embedded fonts, PowerPoint exports with non-ASCII ligatures) without needing per-font tuning.

### Picking up in a new chat session

Read in this order:

1. [`CLAUDE.md`](../CLAUDE.md) — status line, 7-node pipeline diagram with the new gate retry annotation.
2. [`docs/memory.md`](memory.md) — Session Handoff block; §C18 + §C19 entries in the binding-revisions list; new "Do NOT" rules.
3. [`docs/phase3_handoff_notes.md`](phase3_handoff_notes.md) — this file; read the Session N+1 + N+1 (cont.) + N+2 blocks.
4. [`referencedocs/18_phase3_generation.md`](../referencedocs/18_phase3_generation.md) §18 C17 + C18 + C19 — authoritative scoping records.
5. [`docs/pdf_failure_fallback_plan.md`](pdf_failure_fallback_plan.md) — full C19 design + forensic evidence.

The natural next task is **human review of the two .docx** at:

- `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/time_analysis.docx`
- `/Users/hextechkraken/Desktop/mdmp_step1_c18_smoke/initial_planning_guidance.docx`

If the drafts look correct, next session's coding work is:

a. Optional: tune `ui/phase3_tab.py` after end-to-end click-through.
b. Optional: add a doctrine smoke-test entry for `ADP-2-0-Intelligence.pdf` in `scripts/retrieval_smoke_test.py` (the current NL queries are doctrine-generic; adding an IPB-specific query would exercise the newly-rescued manual).
c. Follow-on: `OCR_LANGS=eng+ara` + `brew install tesseract-lang` when Arabic corpus arrives.

---

## Session N+3 — 2026-04-22 (late, Q&A follow-on, §C20)

Short follow-on session after the user opened one of the WARNO .docx files and saw `7. report_production: <Arabic paragraph>` — an English field key was leaking into the rendered Arabic document. Plus a request to de-specialize `data/phase3_prompt.example.txt` so it's portable across future corpora.

### What changed (two files only, no code)

1. **`data/phase3_prompt.example.txt` — de-specialized.**
   - Removed the line naming the four doctrine PDFs (`FM 6-0, FM 5-0, ADP 5-0, ADP 2-0`) and the collection string (`ingest__doctrine__bgem3`).
   - Removed the "OPORD / Staff Estimates deferred" sentence — implementation detail, not extractor input.
   - Added a broad-instructions block: "extract from the brief: operation name, echelon, axis, operation type, formation/attachment, locations, timing, references, commander's intent — do not invent fields."
   - Kept the concrete Saqr-Shamal mission brief below so the file still smoke-tests.
   - Guiding principle: the file now tells the extractor **what kinds of facts to extract** and **what each of the two docs broadly contains**, without naming specific doctrine manuals or Qdrant collection strings. Portable to any future corpus.

2. **`templates/initial_planning_guidance.yaml` — added `label_ar` to 7 retrieved fields.**
   - Under C18, `PLANNING_DIRECTIVES` and `OPERATIONAL_SAFETY_STANDARDS` had retrieved fields with no `label_ar`, so the renderer's fallback at [`arabic_docx.py:1054`](../graph/generation/renderers/arabic_docx.py#L1054) (`label = (getattr(spec, "label_ar", None) or fname)`) leaked the Python identifier into the .docx. Added labels:
     - `report_production` → "إصدار التقارير ونشرها"
     - `coordination_duties` → "واجبات التنسيق"
     - `authorized_movements` → "التحركات المأذون بها"
     - `staff_duties` → "واجبات هيئة الركن"
     - `collaborative_planning_times_locations` → "أوقات ومواقع التخطيط المشترك"
     - `commanders_critical_information_requirements` → "متطلبات المعلومات الحرجة للقائد (CCIR)"
     - `force_protection_protocols` → "بروتوكولات حماية القوة"
   - Acronyms in parens (CCIR) left as English per user rule: "no English in the docs **except acronyms**."

### What was deliberately NOT changed

- **Python/Pydantic field keys** in [`graph/generation/schema/initial_planning_guidance.py`](../graph/generation/schema/initial_planning_guidance.py) stayed ASCII. Renaming them to Arabic identifiers would ripple through `retrieval_group.py`, `section_drafter.py`, `assembler.py`, `cache.py`, and every extracted-inputs JSON key. The `label_ar` mechanism exists exactly so keys stay ASCII while labels are Arabic.
- **No code changes.** Renderer already reads `label_ar`; the `directives_list` layout falls through to `_layout_numbered_fields` which honours it. No dispatcher / renderer edit needed to make the labels appear — next `--docs initial_planning_guidance` run picks them up.
- **Cache invalidation.** Both edits invalidate existing cache entries: the prompt text-change flips `user_prompt_sha256`, and the YAML edit flips the per-group `yaml_group_hash`. The next run rebuilds.

### Before touching this in a new session

- Re-open one of the WARNO `.docx` files and confirm the level-1 numbered items now read "7. إصدار التقارير ونشرها: …" instead of "7. report_production: …".
- If other templates (e.g. `operation_order.yaml`, `staff_estimate.yaml`, v2 scope) are re-enabled later, audit their retrieved fields for missing `label_ar` before first render — the same leak pattern will bite.
- The prompt file is now portable. When you later wire in a non-MDMP corpus (medical, maintenance), the top block of the prompt only needs the per-doc scope paragraphs updated; the "extract these facts" block and the mission-brief shape stay the same.

### Rule added in memory.md (C20)

- "Every `kind: retrieved` or `kind: input` YAML field must carry a `label_ar`. The renderer's fallback to the ASCII key is a last-resort guard, not a paved path."
- "The user-facing `data/phase3_prompt.example.txt` must not name specific doctrine PDFs, specific collection strings, or implementation-scope decisions (OPORD-deferred, etc.). Those belong in the YAML templates, the CLI gate, or the scoping doc — not in the extractor's input."

---

## Session N+5 — 2026-04-23 (§C23 + §C24 — Y-schema migration + nested layouts)

Long session. Three beats: (1) replaced the hand-authored three-prompt input
surface with a two-file upload workflow driven by `/Users/hextechkraken/Desktop/y/*.txt`
as canonical schemas; (2) introduced a per-doc `prompts/<doc>/` layout so each
document owns one schema file, one YAML, one labels catalog, and one prompts
catalog; (3) replicated the OLD generator's paragraph/level/table hierarchy
from `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt §6` into
three new nested renderer layouts.

### What changed, in order

**1. Discovery + planning.** Read folder Y (`time_estimates_edited.txt`,
`initial_planning_guide_edited.txt`, `staff_brief_edited.txt`) — flat JSON
shapes with Arabic values. `time_estimates_edited.txt` ends with a stray
`,"` making it invalid JSON; we tolerate that in `scripts/smoke_y_schemas.py`
by pre-stripping before `json.loads`. Read old generator code `§6` —
documents 2 / 3 / 4 use the exact field names in Y, so the level hierarchy
ports one-to-one. Document 1 in the old generator maps to Warning Order
(`HeaderSection` / `MetadataSection` / ...); no Y schema for it yet, so we
left it alone.

**2. Per-doc `prompts/` layout.**

```
prompts/
├── __init__.py
├── _universal_instructions_ar.py      # reusable Arabic extraction discipline
├── time_analysis/
│   ├── schema.py                      # TimeAnalysis (10 Y fields, extra="forbid")
│   ├── template.yaml                  # field kinds + retrieval seeds
│   ├── labels_ar.py                   # FIELD_LABELS_AR[(class, field)]
│   └── prompts_ar.py                  # EXTRACTION_PROMPTS_AR + DRAFTING_PROMPTS_AR
├── initial_planning_guidance/         # (same four files, 18 Y fields)
└── staff_brief/                       # (same four files, 53 Y fields)
```

Each `schema.py` carries one flat `BaseModel` subclass with field-level
`Field(description=...)` so `with_structured_output` surfaces usable guidance
to the extractor LLM. `prompts/_universal_instructions_ar.py` holds the
cross-doc role + extraction discipline — ZERO scenario-specific content, so
the file works for any future corpus.

**3. Two new field kinds.** Added to `template_loader.FieldSpec`:

- `SourceFileExtractedField` — value comes from the user's uploaded files
  via one structured-LLM call per doc. YAML carries `source_hint:
  warning_order | intel_report | either`; Arabic extraction instruction lives
  in the per-doc `EXTRACTION_PROMPTS_AR` catalog (catalog wins over YAML
  inline).
- `StaticPlaceholderField` — explicit Arabic placeholder for fields where
  neither source file nor doctrine retrieval can supply content.

Existing `retrieved` (doctrine) mechanism left UNTOUCHED — still drives the
4 conclusion / framing fields in `staff_brief` and the 5 planning-directive
fields in `initial_planning_guidance`.

**4. New extractor stage.** `graph/generation/source_file_reader.py` reads
`.docx` / `.pdf` / `.txt` / `.md` via the existing `graph/docling_converters.py`
singleton, adds a sha256 + length cap (`PHASE3_SOURCE_FILE_MAX_CHARS`, default
48 000) with an Arabic audit notice appended when truncated.
`graph/generation/source_file_extractor.py` runs one
`llm.with_structured_output(DynamicModel)` call per doc — the model is built
on-the-fly from the template's `source_file_extracted` fields + their
per-field Arabic instructions. Returns a flat `{field: value or ABSENT_SENTINEL}`
dict.

**5. No-empty-string invariant.** `field_dispatcher.py` gained three Arabic
placeholders + three fix sites:

- Optional-input miss → `غير متوفر في المدخلات`
- Cross-doc derived miss → `غير متوفر في المدخلات`
- Empty `StaticField.value` → `يُصدر لاحقاً`
- Extractor returned `ABSENT_SENTINEL` → `غير متوفر في المدخلات`

Plus `scripts/generate_documents.py::_assert_no_empty_values` does a
depth-first post-condition walk before writing `<doc>.fields.json`. Any
blank raises.

**6. Y-flat `.fields.json`.** When a template has exactly one schema class
(all three Y-migrated docs), `_dump_fields_json` emits a flat
`{field: value}` object — keys match `/Users/hextechkraken/Desktop/y/*.txt`
verbatim. Multi-class legacy templates keep the nested
`{template_id, title_arabic, sections: {...}}` shape for back-compat.

**7. New two-file CLI surface.**

```bash
python scripts/generate_documents.py \
    --warning-order <file>       # primary mission / task-org / timing source
    --intel-report  <file>       # primary intel / environment / readiness source
    --source-file   kind=path    # repeatable, kind ∈ {warning_order, intel_report, other}
    [--out <dir>] [--run-id <id>] [--docs ...]
```

Surface-gate enforces exactly one surface per run. Legacy
`--prompt-1/-2/-3`, `--prompt`, `--inputs-json` paths preserved for
regression. `run_sources.json` audit file written alongside
`extracted_inputs.json` when the two-file surface is used.

**8. Three nested renderer layouts (§C24).** Added to
`graph/generation/renderers/arabic_docx.py`:

- `_layout_y_time_analysis` — `1. الإطار الزمني للمهمة` (level-1) → 5×
  level-2 time rows → level-2 `توزيع وقت التخطيط` → **5-col table**
  (النشاط / النسبة / المدة / البدء / الانتهاء) with 4 step rows +
  `الإجمالي` summary row.
- `_layout_y_initial_planning_guidance` — same time block + table via a
  shared `_render_y_time_allocation_block()` helper, then 8 × level-1
  planning-directive headings with the retrieved/extracted value inlined.
- `_layout_y_staff_brief` — 5 underlined section-headers (A. تقدير
  الاستخبارات والبيئة, B. تقدير العمليات, C. تقدير الأفراد, D. التقدير
  اللوجستي, E. الاستنتاجات العملياتية), each resetting the level-1
  counter. Level-3/level-4 nesting for phased-tactics + higher-command
  blocks — structurally identical to old doc 2.

All three layouts registered in `_LAYOUT_RENDERERS`. Each migrated
`template.yaml` declares `layout: y_<doc>` and drops its per-section
`heading:` (layouts emit their own section breaks).

### Delivered artefacts

Live end-to-end at `/Users/hextechkraken/Desktop/NewOutputs/`:

```
time_analysis.docx                41 571 B
time_analysis.fields.json          618 B
initial_planning_guidance.docx    43 264 B
initial_planning_guidance.fields.json 3.8 KB
staff_brief.docx                  44 750 B
staff_brief.fields.json            8.0 KB
extracted_inputs.json              3.2 KB
run_sources.json                   1.1 KB
.group_cache/                                (retrieval cache, gitignored)
```

### Verification commands

```bash
python -m graph.generation.template_loader       # → 6/6 OK
python scripts/smoke_y_schemas.py                 # → 3/3 OK  Y-keys match, no empty values

python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief \
    --out /Users/hextechkraken/Desktop/NewOutputs
```

### Open items for a fresh session

- **Warning Order Y schema** — not yet delivered. When the user ships it,
  mirror the pattern: write `prompts/warning_order/{schema,labels_ar,prompts_ar,template}.*`;
  flip `TEMPLATE_ID_TO_SCHEMA_MODULE["warning_order"]` to `prompts.warning_order.schema`;
  add to `TEMPLATE_ID_TO_CATALOG_MODULES`; write `_layout_y_warning_order`;
  add to `Y_FILES` in the smoke test. Then the legacy
  `templates/warning_order.yaml` + its classes in
  `graph/generation/schema/schemas.py` can be deleted.
- **Doctrine-fallback chain** for `source_file_extracted` fields that
  returned `ABSENT_SENTINEL` — mentioned in the scoping doc as a v2
  extension but not implemented. Don't pretend it exists in the dispatcher.
- **Streamlit UI `ui/phase3_tab.py`** — still uses the legacy three-prompt
  flow. Update to the two-file surface whenever the Streamlit tab is next
  touched.
- **Gold set + eval script** — unchanged from prior session; not blocked by
  §C23/§C24.

### Rules added (referenced under §C23 + §C24)

- "Don't delete legacy `templates/*.yaml`, `graph/generation/schema/*.py`,
  `prompts_ar.py`, or `field_catalog.py` — they drive the three legacy docs
  until Y schemas arrive."
- "Don't collapse `TEMPLATE_ID_TO_SCHEMA_MODULE` — it intentionally routes
  Y-migrated template_ids to `prompts.<doc>.schema` and legacy template_ids
  to `graph.generation.schema.schemas`."
- "Y schema field names are VERBATIM (`time_Y` capital Y, `ammunition`
  lowercase, `Join_op_purp` capital J lowercase purp, etc.). Smoke test
  fails loudly if they drift."
- "Doctrine retrieval cannot invent scenario facts. Unit names, H-hour,
  enemy positions, references — all `source_file_extracted`. `kind:
  retrieved` is for doctrinal framing ONLY."
- "No empty strings in `<doc>.fields.json`. Every blank surfaces as one of
  the three approved Arabic placeholders. `_assert_no_empty_values`
  enforces at dump time."
- "`prompts/_universal_instructions_ar.py` stays universal — no operation
  names, no H-hour values, no unit numbers. Per-field specificity belongs
  in each doc's `prompts_ar.py`."
- "The `y_*` layouts' level-1/2/3/4 hierarchy is frozen to match
  `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt §6`. If a
  different shape is ever needed, add a new layout name."

---

## Session N+6 — 2026-04-23 (§C25 — Warning Order Y migration + doc-1-mirror)

**Goal:** close the remaining Y-migration gap. Under §C23 the WARNO was left
as a placeholder; the user requested a Y-flat schema built from
`/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf` with inline descriptions
hoisted into Pydantic `Field(description=...)`, then a follow-up to match the
OLD generator's doc-1 structure from `/Desktop/ToTransfer/New Text Document.txt §6`
(paragraphs, level hierarchy, SPLITTER for numbered-text fields, approval
block, ML + SHFAF closers).

### Files created

| Path | Purpose |
|---|---|
| `prompts/warning_order/__init__.py` | Anchor for the per-doc surface. |
| `prompts/warning_order/schema.py` | Flat `WarningOrder` Pydantic class — 50 str fields. Per-field `Field(description=...)` lifted verbatim from the RTF. `extra="forbid"`, `DOCUMENT_CLASSES = (WarningOrder,)`. |
| `prompts/warning_order/template.yaml` | All 50 fields `kind: source_file_extracted`. `source_hint` mostly `warning_order`; `intel_report` for terrain/weather/enemy_forces; `either` for situation/area_interest/civil_considerations/CIVILIAN_CONSIDERATIONS. Layout `y_warning_order`. No doctrine retrieval. |
| `prompts/warning_order/labels_ar.py` | Arabic labels per `("WarningOrder", <field>)`. Military wording. |
| `prompts/warning_order/prompts_ar.py` | `EXTRACTION_PROMPTS_AR` per-field Arabic instructions. `DRAFTING_PROMPTS_AR = {}` — WARNO has no doctrine fallback. |

### Files modified

| Path | Change |
|---|---|
| `graph/generation/template_loader.py` | `TEMPLATE_ID_TO_SCHEMA_MODULE["warning_order"]` → `prompts.warning_order.schema`. `TEMPLATE_ID_TO_CATALOG_MODULES["warning_order"]` added. |
| `graph/generation/renderers/arabic_docx.py` | `_layout_y_warning_order` rewritten end-to-end to mirror old doc 1 (lines 939–1152 of the reference). Layout registered in `_LAYOUT_RENDERERS`. |
| `scripts/smoke_y_schemas.py` | `Y_INLINE_KEYS["warning_order"]` added (RTF source isn't JSON-parseable). Smoke covers 4/4 docs offline. |
| `CLAUDE.md` / `AGENTS.md` / `docs/memory.md` / this file | Status-line + changelog + "do not" rules updated for §C25. |

### Verification

```bash
$ python -m graph.generation.template_loader
OK template.yaml: template_id=initial_planning_guidance schemas=1 structure=2 retrieved_fields=5 groups=['planning_directives']
OK template.yaml: template_id=staff_brief schemas=1 structure=2 retrieved_fields=4 groups=['conclusions']
OK template.yaml: template_id=time_analysis schemas=1 structure=2 retrieved_fields=0 groups=[]
OK template.yaml: template_id=warning_order schemas=1 structure=2 retrieved_fields=0 groups=[]
OK operation_order.yaml: ...
OK staff_estimate.yaml: ...

$ python scripts/smoke_y_schemas.py
OK   time_analysis: Y-keys match, no empty values
OK   initial_planning_guidance: Y-keys match, no empty values
OK   staff_brief: Y-keys match, no empty values
OK   warning_order: Y-keys match, no empty values

$ python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/NewOutputs
OK   time_analysis             41 585 B
OK   initial_planning_guidance 43 226 B
OK   staff_brief               44 962 B
OK   warning_order             43 213 B  (NEW §C25 layout)
```

### Layout summary (`y_warning_order`)

Mirrors old doc 1 (`document = Document()` block, lines 939–1152):

1. "بسم الله الرحمن الرحيم" centred.
2. `add_arabic_header` with `copy_number_placeholder=header`,
   `organization=header2`, `main_unit=header3`, `sub_unit=header4`,
   `place=Assembly_Area`, `date_hijri` + `date_greg` from
   `time_math.format_hijri_date` / `format_gregorian_date` (today),
   `letter_ref_number=f"الرقم: {letter_ref_number}"`.
3. `letter_ref_number2` centred underlined.
4. Scenario `date_time` as a dedicated paragraph (Y-specific; not in doc 1).
5. Plain paragraphs: References / Maps (with `add_full_stop`) / time_zone /
   task_assembly.
6. LEVEL-1 "الموقف" → preamble `situation` inline → LEVEL-2 area_interest /
   operations_area with `add_full_stop` → LEVEL-3 terrain / weather /
   civil_considerations → LEVEL-2 enemy_forces → LEVEL-2 friendly_forces via
   SPLITTER → LEVEL-2 gov_and_nongov_org with LEVEL-3 local_authorities +
   red_crescent children → LEVEL-2 CIVILIAN_CONSIDERATIONS → LEVEL-2
   Attached_and_Detached_units via SPLITTER → LEVEL-2 Operational_Assumptions
   via SPLITTER.
7. LEVEL-1 "مهمة المكون البري" + `GROUND_COMPONENT_MISSION` inline → LEVEL-2
   join_op_mission → LEVEL-3 join_op_purp / joint_ops_how /
   joint_ops_desired_end → LEVEL-2 mission_of_supporting_unit.
8. LEVEL-1 "التنفيذ" → LEVEL-2 Exc_command_purp / Concept_of_operations →
   LEVEL-2 Units_Duty via SPLITTER → LEVEL-2
   Duties_of_Other_Combat_Units_and_Combat_Support_Units via SPLITTER →
   LEVEL-2 "تعليمات التنسيق" with LEVEL-3 Timings / CCIR (SPLITTER) / Fire
   (inline) / Air (inline) / Risk (inline) / ROE (SPLITTER) / Media (inline)
   / Meeting (inline) / Excu (SPLITTER) / Movm (inline).
9. LEVEL-1 "الإدامة" + Sustainment via SPLITTER.
10. LEVEL-1 "القيادة والسيطرة" + ACCS inline.
11. "أقرّوا:" + 3 military signature lines.
12. "الملاحق:" + each non-empty line of Appendices via `add_level_one_ML`.
13. "الشفافات:" + each non-empty line of Viewports via `add_level_one_SHFAF`.

### Rules added under §C25

- "Don't collapse `y_warning_order` away from the old-doc-1 hierarchy. The
  5-section level-1 structure, the `add_arabic_header` block with today's
  dates, the 6 SPLITTER call sites, and the `add_level_one_ML` +
  `add_level_one_SHFAF` closers are load-bearing."
- "Don't rename the Y typos `Crtitical` (Commanders_Crtitical_Information_Requirements)
  or `movm` (Other_coordination_movm). The smoke test's inline key set
  asserts them verbatim."
- "Don't strip the RTF-sourced `Field(description=...)` bodies from
  `prompts/warning_order/schema.py`. They're the user's own field
  explanations and feed `with_structured_output` independently of the prompt
  catalog."
- "Don't add doctrine retrieval to WARNO without an explicit user ask.
  Today's path: extractor → ABSENT_SENTINEL → `PLACEHOLDER_NOT_IN_INPUTS_AR`.
  The WARNO is a scenario-fact directive, not a doctrinally-grounded essay."

