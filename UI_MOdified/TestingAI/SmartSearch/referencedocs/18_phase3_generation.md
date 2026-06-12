# 18 — Phase 3 Document Generation Design

> **Status.** SCOPED (pre-code) as of 2026-04-22. No Phase 3 source
> files exist yet. This document is the **single consolidated design
> doc** for Phase 3 — same discipline as
> [`17_phase2_retrieval.md`](17_phase2_retrieval.md). Two companion
> docs expand specific sections without duplicating decisions:
> [`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md)
> (renderer port guide) and
> [`20_phase3_templates_and_kinds.md`](20_phase3_templates_and_kinds.md)
> (YAML template spec + field-kind taxonomy deep-dive).
>
> **Project-level overview (read first in a fresh session):**
> [`docs/phase3_walkthrough.md`](../docs/phase3_walkthrough.md).
>
> **Pre-code gate.** Phase 2 shipped behind seven R1–R7 validation
> spikes (§11 of doc 17). Phase 3 has **two pre-work items** (§19)
> that must land before any `graph/generation/` code is written:
> relaxing the ingestion gate prompt (so all doctrine collections
> needed for generation are accepted) and writing the four YAML
> templates. Nothing else gates the code phase.
>
> Last updated: 2026-04-22 (post second-review revisions — see §18
> corrections C8–C15). Initial scoping landed earlier the same day.
>
> **Second-review revisions at a glance** (all reflected in body
> text below; §18 keeps the before/after audit trail):
> - **§6.2 retrieval merge** is now RRF-across-seeds + **one**
>   final reranker pass on the merged pool. The previous "sort by
>   rerank_score across seeds, keep top 15" was wrong: `rerank_score`
>   is per-call, not cross-seed-comparable.
> - **New §6.6** specifies citation locator fallback — the
>   generation layer computes the tag before the LLM sees any
>   chunk; no more `[source_doc §None]` hazard.
> - **§7.3 + §11 + §12 LLM seam** — Phase 3 has its own
>   `graph/generation/llm.py`; `graph.shared.llm._get_llm()` is
>   removed from Phase 3's integration surface. The shared
>   singleton is hardcoded to `gpt-4o-mini` temp 0 and cannot
>   honour per-call temperature overrides.
> - **§10 cache** — expanded key (YAML hash, prompt hash, model,
>   temp, retrieval toggles, reranker model tag); the
>   "byte-for-byte identical `.docx`" claim is retracted — we
>   cache the assembled `GeneratedDocument` pydantic instance,
>   not the `.docx` bytes (python-docx XML ordering is not
>   stable — see [`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md) §3.3).
> - **§12 inputs** — the `inputs.json` JSON-Schema file is
>   generated from a Pydantic `Phase3Inputs` model by a one-shot
>   script, not hand-maintained.
> - **§18 C4b** — `NewClasses.md` is a design reference, **not**
>   an implementation source. Real schema modules use clean
>   Pydantic v2 (types only); descriptions, examples, and defaults
>   migrate to YAML.
> - **New `SourcedHit` wrapper** in `graph/generation/retrieval_group.py`
>   carries the originating `collection` alongside every
>   `SearchHit` (for provenance, debugging, future multi-collection
>   behaviour, and citation traceability). Zero Phase 2 schema change.

---

## 1. Scope / Non-Scope

**In scope.**
- A template-driven generator that walks a YAML spec and produces
  four Arabic `.docx` documents per run: Operation Order (OPORD),
  Staff Estimates, Time Analysis, Initial Planning Guidance (WARNO).
- **Field-kind dispatcher** that treats each schema field as one of
  five kinds (`static`, `computed`, `input`, `derived`, `retrieved`)
  and invokes the LLM **only** for `retrieved` fields.
- **Retrieval-grounded drafting.** Only call is to Phase 2's
  `search(SearchRequest) → SearchResponse`. No new retrieval paths,
  no Phase 2 source edits.
- **Arabic typography renderer** ported from the user's old code
  (`New Text Document.txt`), preserved as-is per §16 D2.
- **Inline citations** from every retrieved field back to
  `source_doc §paragraph_number`, rendered as endnotes per document.
- Deterministic caching keyed by template version + input hash +
  collection content hash, following Phase 1's `.stage_fingerprints.json`
  pattern.
- CLI entry point (`scripts/generate_documents.py --inputs
  inputs.json --out <dir>`). Streamlit tab deferred to M6.

**Out of scope.**
- PDF / TXT renderers — **removed per user directive 2026-04-22.**
  See §18 C1.
- Custom user-authored templates. Exactly the four fixed templates
  in v1.
- Editor UI, template authoring UI, live re-generation.
- Multi-operation batching, multi-collection merge strategies
  beyond simple client-side union (§6.4).
- Any modification to Phase 1 (`graph/nodes/*`,
  `graph/post_processors/*`, `graph/state.py`, `graph/builder.py`,
  `main.py`) or Phase 2 (`graph/retrieval/*`, `graph/shared/*`).
- Health-domain schemas. The user's separate health code is a **port
  target**, not a build target. [`NewClasses.md`](../NewClasses.md)
  documents the rename-only symmetry.

---

## 2. Design Goals

1. **One integration seam with Phase 2** — `search(SearchRequest)
   → SearchResponse`. No other Phase 2 internals touched.
2. **LLM calls are rare and grounded.** Of ~70 total schema fields
   across the four documents, roughly 25–30 are `retrieved` and
   reach the LLM. The rest never do. One LLM call per **Pydantic
   class** (group-level), not per field.
3. **Zero in-place modifications to Phase 1 or Phase 2 source.**
   The only pre-code edit is a `graph/prompts.py` prompt rewrite
   (the ingestion gate, §19 pre-work task), which is isolated to
   the LLM instruction string.
4. **Port, don't rewrite, the old Arabic renderer** — its kashida /
   bidi / Arabic numbering / hijri logic is hard-won and the user
   has explicitly locked its formatting (§16 D2 and
   [`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md)).
5. **Templates are data, not code.** A YAML file per document
   declares structure, formatting rules, field kinds, query seeds,
   and drafting instructions. Python walks the YAML.
6. **Schema rename is the only cross-domain surface.** Porting the
   same generator to the user's health-emergency codebase is a
   rename of Pydantic fields + YAML entries, nothing else.
7. **Configurable by `.env`.** Same rule as Phase 1 + Phase 2.
8. **Deterministic reruns.** Same inputs + unchanged corpus ⇒
   identical output bytes, via per-group caching.

---

## 3. Architecture at a Glance

```
inputs.json  ─┐
              │
              ▼
  ┌──────────────────────┐
  │ template_loader.py   │  reads templates/<doc>.yaml
  │  (schema + structure │  (spec = structure + formatting
  │   + drafting prompts)│   rules + query seeds + prompts)
  └──────────┬───────────┘
             ▼
  ┌──────────────────────┐
  │ field_dispatcher.py  │  walks every field by `kind`
  └──────────┬───────────┘
             │
   ┌─────────┼──────────┬──────────┬────────────┬─────────────┐
   │static   │computed  │input     │derived     │retrieved    │
   ▼         ▼          ▼          ▼            ▼             │
 literal   time_math   user JSON  ref resolver  retrieval_group ──┐
                                                                   │
                                                                   ▼
                                                         Phase 2 search() ×N
                                                         (one call per seed)
                                                                   │
                                                                   ▼
                                                         merge + rerank-dedupe
                                                                   │
                                                                   ▼
                                                         section_drafter.py
                                                         (structured output LLM)
                                                                   │
                                                                   ▼
                                                         critique.py (faithfulness)
                                                                   │
                                                                   ▼
                                                         cached per group
   ▼         ▼          ▼          ▼            ▼
  ┌──────────────────────────────────────────────┐
  │ assembler.py → GeneratedDocument (pydantic)  │
  └──────────┬───────────────────────────────────┘
             ▼
  ┌──────────────────────┐
  │ arabic_docx renderer │  (ported old primitives, preserved)
  └──────────┬───────────┘
             ▼
     output/generated/<run_id>/<doc>.docx   (×4)
```

LLM calls only in the `retrieved` branch. Everything else is
pure data flow.

---

## 4. Field-Kind Taxonomy (the core idea)

Every field in every Pydantic class across the four documents is
classified into exactly one of five kinds. **Only `retrieved`
fields invoke the LLM.**

| Kind | Source | LLM call? | Share of fields |
|---|---|---|---|
| `static` | YAML literal (text constant) | No | ~20 |
| `computed` | Pure Python formula over other fields | No | ~10 |
| `input` | User-supplied `inputs.json` at run time | No | ~10–15 |
| `derived` | Reference to another field's value | No | ~3–5 |
| `retrieved` | Phase 2 `search()` + LLM draft + critique | Yes | ~25–30 |

Full worked examples per field and per document are in
[`20_phase3_templates_and_kinds.md`](20_phase3_templates_and_kinds.md).

**Consequence.** The old code's "one megaprompt per Pydantic class ×
~15 classes = 15 huge prompts per run" collapses to roughly **8–12
small, grounded LLM calls** for an entire 4-document run. See §6 for
grouping rationale.

---

## 5. Four Document Specifications (summary)

The full Pydantic schemas live in [`NewClasses.md`](../NewClasses.md)
at repo root. **That file is a design reference, not an
implementation source** — see §18 C13. Each schema is re-authored
as clean Pydantic v2 under `graph/generation/schema/<doc>.py` with
**types only** (every `Field("…")` default, `description=…`, and
`examples=…` migrates to YAML per-field). The field names, however,
are kept character-identical to `NewClasses.md` so the rename-only
port to the user's separate health codebase is mechanical.

**Collection-scope design (locked 2026-04-22).** Phase 3 queries
**exactly one collection** — the single doctrine corpus
`ingest__doctrine__bgem3`. Per-manual narrowing is expressed via a
`source_doc` filter allowlist inside that one collection. Domain
isolation (future: a medical-emergency corpus, a policy corpus) is
expressed by ingesting each domain into its **own** collection, not
by splitting doctrine into one collection per FM. See §6.4.

| Document | Arabic title | Primary classes | `source_doc` allowlist (applied as filter inside `ingest__doctrine__bgem3`) |
|---|---|---|---|
| Doc 1 — OPORD | أمر العمليات | `HeaderSection`, `MetadataSection`, `OperationalSituation`, `MissionAndExecution`, `SustainmentAndCoordination`, `Annexes` | Maneuver-heavy per group: FM 3-0, FM 3-90, FM 3-90-1, ADP 3-0, ADP 3-90, FM 3-98, ATP 3-21-8/18, ATP 3-20-15 (sustainment / fires / signal manuals added to allowlist if/when ingested) |
| Doc 2 — Staff Estimates | تقديرات هيئة الركن | `INTELLIGENCE_ESTIMATE`, `OPERATIONS_ESTIMATE`, `PERSONNEL_ESTIMATE`, `LOGISTICS_ESTIMATE` | Per group: INTEL ⇒ FM 3-0, FM 3-98, FM 3-90-2; OPS ⇒ ADP 3-0, FM 3-0, ATP 3-21-8/18, ATP 3-20-15; PERS & LOG ⇒ corpus-wide fallback until the relevant manuals are ingested |
| Doc 3 — Time Analysis | تحليل الوقت | `MISSION_TIMELINE`, `CURRENT_TIME_REFERENCE` | **none** — pure math, zero retrieval |
| Doc 4 — Initial Planning Guidance | دليل التخطيط الأولي | `INITIAL_PLAN_TIMELINE`, `CURRENT_TIME_REFERENCE_2`, `PLANNING_DIRECTIVES`, `OPERATIONAL_SAFETY_STANDARDS` | ADP 3-0 (fallback until ADP 5-0 / FM 5-0 are ingested); FM 3-11 for safety (FM 3-34 once ingested) |

**Allowlist-with-missing-manuals rule.** If an allowlisted
`source_doc` value isn't present in the collection's actual
inventory, the generator elides it from the filter at runtime and
proceeds with the remaining matched values. If the intersection is
empty, the generator drops the `source_doc` filter for that group
entirely (logs a warning) and falls back to corpus-wide retrieval;
the drafter's "write 'غير متوفر في العقيدة المتاحة' if not supported"
rule (§7.1) handles the "nothing useful retrieved" case downstream.
This keeps templates **authored against the ideal manual list** and
runnable against **whatever the corpus actually contains today**,
with no YAML edits needed when new manuals land.

The complete per-group allowlist table lives in
[`20_phase3_templates_and_kinds.md`](20_phase3_templates_and_kinds.md)
§3.

---

## 6. Retrieval Strategy per Group

### 6.1 Grouping

**One LLM draft call per Pydantic class** (= one "group"). All fields
of the class share retrieval context, so they share retrieved
chunks. This is the single most important efficiency decision in
Phase 3.

### 6.2 Per-group flow (REVISED 2026-04-22 — RRF-across-seeds)

```
for each retrieved-kind group in the document:
    1. Query synthesis
       - Template YAML declares 2–3 English query seeds.
       - Interpolate user-input fields (operation_name, axis, echelon).
       - Run through Phase 2's glossary expansion (existing code).
       - Drop empty seeds (unresolved placeholders → seed dropped,
         not passed as literal "{axis}").
    2. Fan-out search (NO per-seed reranker)
       - For each seed × each declared collection:
           search(SearchRequest(query=..., collection=..., filters=...,
                                top_n_in=50, top_k_out=8,
                                use_reranker=False))
       - Wrap every SearchHit in a SourcedHit(hit, collection) so
         origin is preserved for citations + debug.
       - Deduplicate by point_id across the union of all seed × coll
         result lists. First occurrence wins for hit contents;
         the dedup dict also collects every (seed_index, rank_in_seed)
         tuple where that point_id appeared.
    3. Merge by RRF-across-seeds (replaces the old "sort by rerank_score")
       - For each deduped SourcedHit with occurrences
         [(s_1, r_1), (s_2, r_2), ...]:
             rrf_merge = Σ_i 1 / (60 + r_i)
         (k=60 is the standard RRF constant.)
       - Sort by rrf_merge descending. Keep top K_merge
         (default PHASE3_MERGE_POOL_SIZE=25).
       - Rationale: Phase 2's per-call rerank_score is scored
         against THAT call's single query — comparing rerank_score
         across different seed queries is not meaningful. RRF on
         rank positions is the standard multi-query fusion signal.
    4. Single final rerank (ONE call per group, not N)
       - canonical_rerank_query = YAML's group.rerank_query_ar
         if present, else " | ".join(resolved_seeds).
       - rerank(canonical_rerank_query, [sh.hit.text for sh in pool])
         once on the merged pool.
       - Keep top merged_top_k (default 15). Every kept SourcedHit
         gets its `rerank_score` field populated from this single
         authoritative pass (one unit scale, cross-field-comparable).
    5. Locator pre-resolution (§6.6)
       - For each kept hit, compute the citation tag
         "[source_doc §locator]" per the fallback rules in §6.6.
       - Attach as sh.citation_tag so the drafter prompt carries
         the pre-resolved tag; LLM copies verbatim, never guesses.
    6. Structured draft — ONE call per group
       - call graph.generation.llm.get_draft_llm().with_structured_output(<GroupSchema>)
         (see §7.3 and §11 for why NOT graph.shared.llm._get_llm)
       - Prompt in Arabic; chunks passed as English context, each
         prefixed with its pre-resolved citation_tag; instruction:
         "use only the retrieved context; cite each retrieved
         sentence with the exact tag you see next to its chunk;
         produce classical Arabic prose".
    7. Critique pass — ONE narrow call
       - call graph.generation.llm.get_critique_llm()
       - input = draft + chunks; output = per-field
         (supported: bool, suggested_fix: str | None).
       - Re-draft ONLY unsupported fields (second tiny call).
    8. Cache (§10, expanded key)
       - Key hashes every knob that can change output, including
         the YAML group block, prompt_ar, model names, temperatures,
         retrieval toggles, and reranker model tag.
       - Stored at output/generated/<run_id>/.group_cache/<hash>.json.
       - Cache hit = skip both fan-out and both LLM calls.
```

### 6.3 Query construction language

**English queries against English corpus, Arabic output.** Every
ingested collection under `inputs/doctrine/` is US Army English
doctrine (FM / ADP / ATP). `bge-m3` is multilingual and handles
English queries retrieving English chunks cleanly. The LLM does
grounding-plus-translation in one pass at draft time.

**Future Arabic corpus note.** Per user Q4, future deployments will
ingest Arabic doctrine possibly containing English acronyms. The
generator is language-agnostic at the `search()` layer (bge-m3 is
multilingual); template YAMLs will expose a `query_language` hint
per group when that corpus lands. No schema change needed.

### 6.4 Collection scope — one collection per DOMAIN (locked 2026-04-22)

**Phase 3 queries exactly one collection: `ingest__doctrine__bgem3`.**
Every retrieved group in every template resolves to this single
collection. Per-manual narrowing is expressed with a
`filters.source_doc` allowlist inside the one collection — NOT by
splitting doctrine across multiple collections.

**Why one collection for doctrine.** Doctrine is one corpus. The
manuals cross-reference each other, share a vocabulary, and are
sought together — a reader evaluating an OPORD's
`SustainmentAndCoordination` may land on FM 3-0, FM 3-90, or ADP 4-0
equally, and the retriever should be free to surface the best chunk
regardless of the manual it came from. Splitting the corpus into
one-collection-per-FM would force the generator to guess up-front
which manual is relevant per group, a guess the reranker is better
positioned to make given the chunk text.

**Why separate collections for separate domains.** When a future
medical-emergency corpus, a policy corpus, or a vendor-docs corpus
is ingested, it goes into its **own** collection (e.g.
`ingest__medical__bgem3`). Phase 3 templates that target that
domain declare the new collection in their `meta.default_collections`.
Cross-domain leakage is prevented at the collection boundary, not
inside the template. Collection isolation is for **corpus/domain
isolation**, not per-manual splitting.

**Fan-out shape with one collection.** Fan-out becomes
`N_seeds × 1 collection = N_seeds` `search()` calls per group —
still the same client-side union pattern described in §6.2, still
zero Phase 2 change. `SourcedHit.collection` remains load-bearing
(§6.6 uses it for citation endnote grouping; multi-domain templates
in future corpora will exercise it), even though every hit in v1
Phase 3 has the same collection.

**`source_doc` filter shape.** The template declares
`filters.source_doc` as either a single string (scalar match) or a
list of strings (OR-match). Phase 2's
`graph.retrieval.schema.SearchRequest.filters` already types this as
`dict[str, str | list[str]]` ([`graph/retrieval/schema.py:41`](../graph/retrieval/schema.py))
and Qdrant's KEYWORD index on `source_doc` already handles it —
no Phase 2 change required.

**Missing-manual elision.** When an allowlisted `source_doc` value
isn't present in the collection's live inventory (pulled via
`_registry` or a lightweight facet call against the collection),
the generator quietly drops that value from the filter. If the
elided set is non-empty, fan-out continues with the intersection.
If the elided set is empty (all allowlisted manuals are absent),
the generator drops the `source_doc` filter entirely for that
group and falls back to corpus-wide retrieval, with a log warning.
The drafter's fallback (§7.1: `"غير متوفر في العقيدة المتاحة"`)
catches the "nothing useful retrieved" case downstream.

**Cross-collection retrieval merge strategies** (RRF-of-RRF,
cross-collection reranker pool, multi-collection fan-out within
one group) are explicitly deferred to a future multi-domain setup
where one template targets two distinct corpora in one group. Per
[`memory.md`](../docs/memory.md) "Cross-collection search" open item,
this needs a Phase 2 API-shape review before any template exercises
it. v1 Phase 3 does not cross domains per group.

### 6.5 What Phase 2 gives us free

Every `SearchHit` already carries `source_doc`, `paragraph_number`,
`paragraph_numbers`, `cross_refs`, `heading_path`, `page_numbers`,
`rerank_score`, `rrf_score`, `text`, `point_id`. The renderer uses
these directly for citation endnotes; the generation layer uses them
in the citation tag per §6.6.

**Acronym expansion is automatic** — Phase 2's glossary layer already
runs on every query. Phase 3 does not re-implement this.

**What Phase 2 does NOT give** (and what we add in the generation
layer):
- A `collection` field on `SearchHit`. `SearchHit` is defined in
  [`graph/retrieval/schema.py`](../graph/retrieval/schema.py) with no
  such field. The generation layer wraps every hit in a
  `SourcedHit(hit: SearchHit, collection: str)` so origin is
  preserved across multi-collection fan-out. See §11 and §12.
- A cross-seed-comparable ranking signal. `rerank_score` is scored
  against the single query passed to a specific `search()` call;
  it is NOT meaningful across seeds. Handled by §6.2 steps 3 and 4
  (RRF-across-seeds + single final rerank).

### 6.6 Citation tag construction — locator fallback (NEW)

**Why this section exists.** Phase 2's payload carries
`paragraph_number: str | None` and a separate `paragraph_numbers:
list[str]` (see [`graph/retrieval/schema.py`](../graph/retrieval/schema.py)).
A chunk with `paragraph_number=None` would otherwise produce the
literal tag `[source_doc §None]` in the final Arabic prose. This
section defines deterministic fallback so the generation layer
always emits a valid locator.

**Tag format.** Inline in the drafted Arabic text:
`[source_doc §locator]` (ASCII brackets, ASCII `§`, Latin source_doc
slug, locator as below).

**Locator resolution order** (first non-empty value wins):

| Priority | Source | Example locator |
|---|---|---|
| 1 | `hit.paragraph_number` if not `None` | `3-14` |
| 2 | `hit.paragraph_numbers[0]` if the list is non-empty | `3-14` |
| 3 | Deepest segment of `hit.heading_path` (split on `" > "`) | `Command and control` |
| 4 | `"p. " + str(hit.page_numbers[0])` if list is non-empty | `p. 42` |
| 5 | `"—"` (em dash) — indicates no locator available | `—` |

**Rule — LLM never decides the locator.** The generation layer
computes the tag BEFORE the chunk reaches the drafting prompt
(§6.2 step 5). Each chunk is passed to the drafter already prefixed
with its pre-resolved tag, and the drafting instruction reads:
*"cite each retrieved sentence with the exact tag you see next to
its chunk; do not modify or invent tags."* This removes the LLM as
a point of citation-correctness failure.

**Rule — collection provenance stays internal.** `SourcedHit.collection`
is used for debugging, cache key derivation (§10), and disambiguation
if two collections legitimately produce the same `source_doc` slug
(edge case: same filename under two ingest folders). The `collection`
does **not** appear in the rendered citation tag — citations remain
`[source_doc §locator]`. Collection provenance surfaces in:
- Debug logs (always).
- The citation endnote section rendered by `arabic_docx.py`, if the
  template's `citation_endnote_include_collection: true` toggle is
  set (off by default for compactness).

---

## 7. Generation Strategy

### 7.1 Prompt shape per group

```
[SYSTEM — Arabic]
أنت مساعد عسكري يكتب فقرات وثيقة {doc_title_arabic} باللغة العربية
الفصحى استناداً إلى العقيدة العسكرية المقدَّمة. استخدم فقط المقاطع
المعطاة. استشهد بعد كل جملة أساسية بالوسم الموجود بجانب المقطع
المصدر حرفياً — لا تُعدِّل الوسم ولا تخترع واحداً. إذا كان الحقل
غير مدعوم بالمقاطع، اكتب "غير متوفر في العقيدة المتاحة".

[CONTEXT — English doctrine chunks, each prefixed with its
 pre-resolved citation tag per §6.6]
[fm-3-0-operations §3-14]  <chunk text>
[adp-6-0-mission-command §Command and control]  <chunk text>
[fm-3-98-reconnaissance-and-security-ops §p. 42]  <chunk text>
...

[MISSION INPUT — user-supplied]
<subset of input-kind fields relevant to this group>

[SCHEMA]
<Pydantic JSON schema of the group, field descriptions in Arabic>
```

The drafter does NOT see `paragraph_number=None` raw. The
generation layer applies §6.6 locator resolution before building
the `[CONTEXT]` block; the LLM copies whatever tag it sees.

### 7.2 Critique prompt

```
[SYSTEM]
Verify each field of the draft below is supported by the provided
chunks. For each field, return {field_name, supported: bool,
suggested_fix: str|null}. "supported" means the cited paragraph
substantively backs the field text; paraphrasing is OK, invention
is not.

[INPUT]
<draft + same chunks>
```

Only unsupported fields get a re-draft, in a second narrow LLM call
that sees the critique's `suggested_fix` notes plus the chunks.

### 7.3 Model selection (REVISED 2026-04-22 — local helper)

**Default (locked v1):** `gpt-4o-mini` for both draft and critique.
Temperature **0.2 for drafts** (prose naturalness), **0.0 for
critique** (determinism).

**Upgradable via `.env`** without code changes:
```
PHASE3_DRAFT_MODEL=gpt-4o-mini
PHASE3_CRITIQUE_MODEL=gpt-4o-mini
PHASE3_DRAFT_TEMPERATURE=0.2
PHASE3_CRITIQUE_TEMPERATURE=0.0
```

**Implementation — new `graph/generation/llm.py`, NOT the shared
`graph/shared/llm.py`.** The shared singleton is
hardcoded at `gpt-4o-mini` / `temperature=0.0` (see
[`graph/shared/llm.py`](../graph/shared/llm.py) lines 40–41) and
its docstring explicitly says: *"Any Phase 2 change (e.g. a
different HyDE model) should happen in graph/retrieval/hyde.py,
not here."* The same precedent applies to Phase 3 — a separate
configuration means a separate helper.

Shape of the new module:

```python
# graph/generation/llm.py  (NEW — planned)
from functools import lru_cache
from langchain_openai import ChatOpenAI

@lru_cache(maxsize=8)
def _get_configured_llm(model: str, temperature: float) -> ChatOpenAI:
    return ChatOpenAI(model=model, temperature=temperature)

def get_draft_llm() -> ChatOpenAI:
    return _get_configured_llm(
        os.getenv("PHASE3_DRAFT_MODEL", "gpt-4o-mini"),
        float(os.getenv("PHASE3_DRAFT_TEMPERATURE", "0.2")),
    )

def get_critique_llm() -> ChatOpenAI:
    return _get_configured_llm(
        os.getenv("PHASE3_CRITIQUE_MODEL", "gpt-4o-mini"),
        float(os.getenv("PHASE3_CRITIQUE_TEMPERATURE", "0.0")),
    )
```

`lru_cache` keyed on `(model, temperature)` collapses identical
configurations to a single `ChatOpenAI` instance (so when draft and
critique happen to share settings, they share the object — same
"one heavy client per config" discipline as the other
`_get_*()` singletons). When the settings differ, we get exactly two
clients, one per config. No global mutation, no cross-contamination
with Phase 1 / Phase 2.

`graph.shared.llm._get_llm()` is **not** used by Phase 3 code. See
§11 integration surface and §18 C9.

### 7.4 Model hosting posture — **IMPORTANT OPERATIONAL NOTE**

> **Current state (2026-04-22):** bge-m3 dense embedder, BM25 sparse
> embedder, and `bge-reranker-v2-m3` cross-encoder all run **locally
> on the user's M4 machine** via FastEmbed ONNX runtimes. The LLM
> (OpenAI API) is already remote.
>
> **Post-acceptance migration (user-specified 2026-04-22):** once
> Phase 3 v1 is accepted by the user, **all models will migrate to
> API endpoints over the internet** — embedder, reranker, and LLM.
> This is a stated operational directive, not a request for
> optional future work.
>
> Phase 3 code must not hardcode local-runtime assumptions. Every
> model call goes through the existing `_get_*()` singletons, each
> of which reads its provider / endpoint / model name from `.env`.
> When the migration lands, the change surface is `.env` + the
> singleton factories — no Phase 3 source edits expected.

This note is replicated verbatim in
[`docs/memory.md`](../docs/memory.md) locked-decisions block and
in [`docs/phase3_walkthrough.md`](../docs/phase3_walkthrough.md).

---

## 8. Non-LLM Computation

### 8.1 `time_math.py`

A pure, unit-tested replacement for the old code's `cal()` (lines
174–208 of `New Text Document.txt`). Inputs come from the user JSON
as datetimes; outputs are all fields of `MISSION_TIMELINE` /
`INITIAL_PLAN_TIMELINE`.

Key functions (signatures — implementation is trivial and stays
in code):
- `compute_allocation(total_minutes: int) → PlanningAllocation` —
  returns the 1/3 planning slice, the 30/20/30/20 sub-splits, and
  the per-step start/end datetimes with proper day-wraparound.
- `format_hijri_gregorian_pair(dt: datetime) → tuple[str, str]` —
  ported from the old code's `format_hijri_date` /
  `format_gregorian_date`; acknowledged approximation (~0.03-day
  drift per Hijri year due to the 354.36667 constant), acceptable
  for display.

### 8.2 Derived-reference resolution

A tiny post-drafting pass. Template YAML uses `{{ref: GroupName.field_name}}`
tokens; the assembler substitutes the resolved value from the
assembled `GeneratedDocument` pydantic instance before rendering.

Handles the "same as above" patterns in `NewClasses.md` (e.g.
`OPERATIONS_ESTIMATE.own_unit_end_state` may derive from
`MissionAndExecution.desired_end_state`).

---

## 9. Renderer

**Locked decision per §16 D2 + user Q2:** port the old code's
Arabic typography primitives **without changes to their behaviour**.
The old layout faced issues when earlier simplification was
attempted; preserving it is a hard requirement.

Full port guide — what to keep, what to discard, what to clean up
only structurally — is in
[`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md).

Short summary:
- **Keep (port verbatim, cosmetic cleanup only):** `add_paragraph`,
  `correct_indentation`, `force_rtl_paragraph`, `fix_cs_formatting_run`,
  `add_level_one`…`add_level_five`, `add_level_one_ML`,
  `add_level_one_SHFAF`, `get_arabic_letter*`, `add_table`,
  `add_arabic_header` (including kashida stretcher),
  `format_hijri_date`, `format_gregorian_date`, `SPLITTER`,
  `configure_document`, `configure_last_page_section`,
  margins / font / tab-size / line-spacing constants.
- **Discard (replaced by dispatcher + YAML):** the 800-line
  monolithic `generate_document(data, data1, data2, data3)` function,
  the four `sample_data*` dicts, `AttributeHolder`/`ParsedFixed` hacks,
  broken `if data:` indentation, the class-is-prompt pattern.

Output location: `output/generated/<run_id>/<doc_slug>.docx` ×4.

---

## 10. Caching / Determinism (REVISED 2026-04-22)

Two cache layers, both following Phase 1's `.stage_fingerprints.json`
discipline.

### 10.1 Per-group cache

Stores the draft + critique result (the Pydantic sub-schema instance)
plus the merged chunk list used to produce it. A cache hit skips the
whole §6.2 flow (fan-out searches, both LLM calls).

**Cache key — expanded (was: five fields; now: every knob that can
change output):**

```
sha256_of_concat(
  template_id,
  template_file_sha256,             # full YAML file bytes
  group_name,
  group_yaml_block_sha256,          # the group's YAML subtree only
  resolved_query_seeds_sorted,      # after {…} interpolation
  filters_items_sorted,
  tuple(sorted(collection_content_hashes)),
                                    # from _registry per collection
  use_glossary,
  use_reranker_final,               # whether §6.2 step 4 ran
  use_hyde,
  top_k_per_query,
  merge_pool_size,                  # K_merge from §6.2 step 3
  merged_top_k,                     # K kept after final rerank
  draft_model,
  draft_temperature,
  critique_model,
  critique_temperature,
  prompt_ar_sha256,                 # the group's drafting prompt
  input_subset_sha256,              # user inputs used by seeds
  reranker_model_tag,               # from .env; locks reranker swap
)
```

Location: `output/generated/<run_id>/.group_cache/<hash>.json`.

**Why every field matters:** editing `prompt_ar` in the YAML must
invalidate the cache even if no other field changed — dropping it
from the key would make prompt iteration silently cache-hit on the
old draft. Same logic for `draft_temperature`, `reranker_model_tag`,
the retrieval toggles, and so on.

### 10.2 Per-document cache

Stores the **assembled `GeneratedDocument` pydantic instance** for
each document slug, keyed by
`sha256(doc_slug, all_its_group_cache_keys, template_structure_hash,
render_layout_version)`. Hit = skip assembly + re-render.

> **IMPORTANT — retraction of earlier claim.** An earlier draft of
> this section said *"a rerun with unchanged inputs + corpus returns
> the previous `.docx` byte-for-byte."* That claim was wrong.
> [`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md) §3.3
> states that python-docx does not order XML elements
> deterministically, so `.docx` bytes can differ across runs even
> when input state is identical. What IS deterministic on unchanged
> inputs is the assembled `GeneratedDocument` pydantic instance.
> **We therefore cache at the pydantic layer, not the docx layer.**
> Re-rendering from a cached `GeneratedDocument` produces visually
> identical output; byte-identity of the `.docx` is not promised.

### 10.3 Bypass

`PHASE3_FORCE_REGENERATE=1` in `.env` skips both cache layers.
Behaviourally equivalent to deleting `.group_cache/` before running.

### 10.4 Collection content hash

Read from the `_registry` payload's `content_hash` for each
collection used by the group. Already maintained by Phase 1
`upsert_to_qdrant`. No new infrastructure.

### 10.5 Reranker model tag

`reranker_model_tag` in the key locks the reranker model name +
source HF repo. Rationale: a future swap (e.g. to a different BGE
reranker checkpoint) must invalidate the Phase 3 cache because
rerank scores are no longer comparable. Tag derived from
`RERANK_MODEL` + `RERANK_MODEL_SOURCE` in `.env`.

---

## 11. Phase-1 / Phase-2 Integration Surface (REVISED 2026-04-22)

| Phase 3 uses | From | Modification? |
|---|---|---|
| `graph.retrieval.search.search` | `graph/retrieval/search.py` | Read-only |
| `graph.retrieval.registry.list_registry_entries` | `graph/retrieval/registry.py` | Read-only |
| `graph.retrieval.schema.{SearchRequest,SearchResponse,SearchHit}` | `graph/retrieval/schema.py` | Read-only |
| `graph.retrieval.rerank.rerank` | `graph/retrieval/rerank.py` | Read-only (direct call for §6.2 step 4 single-final-rerank) |
| `graph.prompts.*` | `graph/prompts.py` | **Additive only** (new prompt constants for Phase 3 alongside `SUFFICIENCY_CHECK_PROMPT`) |
| Output layout convention | `output/<doc_stem>/` pattern | New parallel root `output/generated/<run_id>/` |
| Fingerprint pattern | `graph/fingerprints.py` | Read-only (reused by analogy, not imported) |
| `_registry` `content_hash` | Qdrant `_registry` collection | Read-only |

**Removed from Phase 3's integration surface** (was listed in the
initial scoping pass, now retracted):

| No longer used | Why removed |
|---|---|
| `graph.shared.llm._get_llm` | Hardcoded `gpt-4o-mini` / `temperature=0.0` ([`graph/shared/llm.py:40-41`](../graph/shared/llm.py)). Its docstring explicitly defers per-config changes to module-local helpers. Phase 3 uses its own `graph/generation/llm.py` (§7.3). See §18 C9. |

**Why keep `graph.retrieval.rerank` direct in Phase 3:** §6.2 step 4
runs the reranker once on the merged seed pool using a canonical
rerank query, which `search()` can't express (it takes a single
query and runs per-call). Calling `rerank()` directly is cleaner
than bending `search()` into a multi-query shape.

**Pre-code exception (§19):** `graph/prompts.py` gets ONE edit —
the `SUFFICIENCY_CHECK_PROMPT` becomes topic-agnostic so Phase 3
can ingest any doctrine collection (sustainment, artillery,
aviation, etc.) without being rejected by the gate. This is the
only Phase 1 / Phase 2 source file Phase 3 work touches.

---

## 12. Module Layout (REVISED 2026-04-22)

```
graph/generation/
  __init__.py
  llm.py                         # NEW (§7.3) — get_draft_llm() + get_critique_llm();
                                   lru_cache on (model, temperature)
  schema/
    __init__.py
    inputs.py                    # NEW — Pydantic Phase3Inputs model;
                                   source of truth for inputs.json shape.
                                   Drives JSON-Schema export (§14).
    opord.py                     # Pydantic classes; see NewClasses.md (REFERENCE only,
                                   NOT copied mechanically — see §18 C4b)
    staff_estimate.py
    time_analysis.py
    initial_planning_guidance.py
  template_loader.py             # YAML → Template/Section objects + validation
  field_dispatcher.py            # kind-based walker
  time_math.py                   # pure functions, unit-tested
  retrieval_group.py             # fan-out + RRF-across-seeds + single final rerank
                                   (§6.2); owns the SourcedHit wrapper (§11, §18 C15)
  section_drafter.py             # structured LLM call per group; uses llm.get_draft_llm()
  critique.py                    # faithfulness pass; uses llm.get_critique_llm()
  assembler.py                   # derived-ref resolution, build GeneratedDocument
  cache.py                       # group + doc-level fingerprinting (§10)
  renderers/
    __init__.py
    arabic_docx.py               # ported primitives from old code, preserved
templates/
  operation_order.yaml
  staff_estimate.yaml
  time_analysis.yaml
  initial_planning_guidance.yaml
scripts/
  generate_documents.py          # CLI entry point
  export_phase3_input_schema.py  # NEW — writes data/phase3_inputs.schema.json
                                   from graph.generation.schema.inputs.Phase3Inputs
  validate_schema_parity.py      # optional — asserts every NewClasses.md field
                                   name appears in the corresponding schema module
                                   (rename-only port parity check)
data/
  phase3_inputs.example.json     # sample input for smoke testing
  phase3_inputs.schema.json      # GENERATED from Phase3Inputs; do NOT hand-edit
                                   (regenerate via scripts/export_phase3_input_schema.py)
```

All new files. Nothing existing is modified **except** the
pre-code prompt loosening in `graph/prompts.py` (§19).

**`SourcedHit` wrapper** lives in `retrieval_group.py` and is the
load-bearing type across §6.2 steps 2–5, §6.6 citation construction,
and §10.5 reranker-tag-scoped caching:

```python
# graph/generation/retrieval_group.py  (NEW — planned)
@dataclass(frozen=True)
class SourcedHit:
    hit: SearchHit                   # read-only, from graph.retrieval.schema
    collection: str                  # originating Qdrant collection
    occurrences: tuple[tuple[int, int], ...] = ()
                                     # (seed_index, rank_in_seed) pairs across
                                     # the fan-out — drives RRF-across-seeds.
    rerank_score: float | None = None
                                     # populated by the single final rerank pass;
                                     # this is the ONLY rerank_score Phase 3 trusts.
    citation_tag: str = ""           # pre-resolved per §6.6; drafter copies verbatim.
```

---

## 13. `.env` Additions

Phase 3 adds the following variables. All have defaults in code so
a fresh `.env` still works; `.env.example` will be updated with the
same block.

```
# --- Phase 3 generation ---
PHASE3_DRAFT_MODEL=gpt-4o-mini
PHASE3_CRITIQUE_MODEL=gpt-4o-mini
PHASE3_DRAFT_TEMPERATURE=0.2
PHASE3_CRITIQUE_TEMPERATURE=0.0
PHASE3_TOP_K_PER_QUERY=8
PHASE3_MERGED_TOP_K=15
PHASE3_OUTPUT_ROOT=output/generated
PHASE3_TEMPLATES_DIR=templates
PHASE3_FORCE_REGENERATE=0
PHASE3_MERGE_POOL_SIZE=25        # §6.2 step 3 K_merge

# Post-acceptance migration placeholders (unused until user flips to
# API-hosted embedders/reranker — see §7.4 operational note).
# When that migration happens, the existing FastEmbed envs stay but
# point at remote endpoints; these two become the switch surface.
PHASE3_EMBEDDER_MODE=local      # local | api
PHASE3_RERANKER_MODE=local      # local | api
```

---

## 14. Input Surface (`inputs.json`) (REVISED 2026-04-22)

The user supplies one JSON file per generation run.

**Shape authority — Pydantic, not hand-maintained JSON-Schema.**
The canonical shape is defined in `graph/generation/schema/inputs.py`
as a Pydantic v2 model `Phase3Inputs`. Runtime loading calls
`Phase3Inputs.model_validate_json(...)` → fails fast on shape
errors with line/field context.

**JSON-Schema is a derived artefact.** `scripts/export_phase3_input_schema.py`
calls `Phase3Inputs.model_json_schema()` and writes
`data/phase3_inputs.schema.json`. This file is generated and lives
in the repo so external tooling (editor completions, a future
Streamlit form, doc tooling) has a stable JSON-Schema to consume.
**Never hand-edit it.** Regenerate via the script whenever
`inputs.py` changes.

Sample input: [`data/phase3_inputs.example.json`](../data/phase3_inputs.example.json).

Field groups:

- `operation` — identification (name, echelon, axis).
- `references` — letter/warno numbers, maps.
- `locations` — assembly area, AO.
- `timing` — H-Hour, reporting time, total available minutes, time zone.
- `retrieval` — list of Qdrant collections the generator may query.
- `mission_intent_free_text` — short Arabic/English sentence; feeds
  query-seed interpolation when a group's seeds reference
  `{mission_intent}`.

**Why a JSON file and not a form in v1.** Per user Q5: this makes
porting the generator into the user's separate health codebase a
matter of plugging a differently-shaped JSON in. A Streamlit tab
is planned in M6, but the JSON is the load-bearing surface — the
Streamlit tab just writes it.

---

## 15. Rollout Milestones

Each milestone produces committable, independently reviewable
artefacts. No milestone is merged until the previous one is accepted.

| M | Deliverable | Why this order |
|---|---|---|
| **M0** | Pre-work: loosen `SUFFICIENCY_CHECK_PROMPT` to topic-agnostic junk filter; re-ingest any doctrine folders blocked by the old prompt | §19 — gates M2+ |
| **M1** | Four YAML templates + `template_loader.py` + schema modules (no generator code, no renderer) | Locks the structure contract; reviewable in isolation |
| **M2** | **Doc 3 (Time Analysis) end-to-end.** Exercises `time_math.py`, `field_dispatcher.py`, `arabic_docx.py` renderer, CLI. **Zero LLM calls.** | Smallest surface; fastest typography feedback |
| **M3** | **Doc 2 (Staff Estimates) end-to-end.** Introduces `retrieval_group.py`, `section_drafter.py`, `critique.py`, cache. Four retrieval groups. | Validates Phase-2 integration + citations + cache |
| **M4** | **Doc 1 (OPORD) end-to-end.** Biggest doc. Five retrieval groups. Pipeline is now proven. | Largest content surface last |
| **M5** | **Doc 4 (Initial Planning Guidance) end-to-end.** Mostly reuses M2's timeline math + one retrieval group. | Quick wrap-up |
| **M6** | Streamlit tab in `ui/app.py` that writes `inputs.json` + triggers generation; memory.md lock-in update for Phase 3; `data/phase3_inputs.example.json` finalized | Dev-ergonomics; not load-bearing |

---

## 16. Locked Decisions (D1–D10)

| # | Decision | Rationale |
|---|---|---|
| **D1** | v1 supports exactly four fixed templates (OPORD, Staff Estimates, Time Analysis, Initial Planning Guidance). Custom user templates are deferred. | Scope discipline; fixed templates are enough to prove the architecture |
| **D2** | Port the old Arabic renderer primitives verbatim (behaviour-preserving), do NOT simplify or rewrite. | User Q2 — prior simplification attempts broke formatting |
| **D3** | One LLM call per Pydantic class (group-level), not per field. Critique pass is a second narrow call on failed fields only. | Token efficiency; grounded critique proven by Phase 2 reranker discipline |
| **D4** | Multi-collection retrieval is client-side union in v1. No Phase 2 code changes. | Zero Phase 2 blast radius; revisit when measured latency bites |
| **D5** | English queries against English corpus, Arabic output from the LLM in one grounded-translation pass. | `bge-m3` is multilingual; corpus is English; output language is Arabic |
| **D6** | Draft + critique model = `gpt-4o-mini`. Temp 0.2 / 0.0. Upgradable via `.env`. User Q6 — operational note §7.4 flags post-acceptance migration to fully-API models for embedder, reranker, and LLM. | Cost-effective default; migration switch is `.env`-only |
| **D7** | Citations as inline `[source_doc §paragraph_number]` tags, collected into endnotes at the end of each document. Style is not load-bearing — can be swapped without design change. | User Q7 — form factor undecided, decoupled from architecture |
| **D8** | **PDF / TXT renderers REMOVED from v1** (was originally D8 "PDF via LibreOffice headless"). | User directive 2026-04-22 — see §18 C1 |
| **D9** | No feature flags or health-domain swap-back abstractions in v1 code. The swap path is rename-only: change Pydantic field names + swap YAML templates. `NewClasses.md` documents the 1-to-1 field mapping. | User Q9 — debugging parity with the separate health codebase |
| **D10** | Phase 3 follows the same scoping-doc discipline as Phase 2 (single consolidated authoritative doc). Companion docs (renderer port, template spec) expand specific sections without re-deciding anything. | Phase 2 precedent works; keep it |

---

## 17. Open Items (non-blocking)

- **Gold eval set.** Phase 3 uses human acceptance (user Q8). If an
  eval harness is added later, it belongs next to Phase 2's deferred
  `scripts/eval_retrieval.py` and consumes the same gold shape.
- **ADP 5-0 / FM 5-0 (Operations Process / MDMP).** The
  authoritative source for the 1:3 rule and planning directives
  used in Docs 3 and 4. Ingest if available. If not ingested, the
  generator falls back to FM 3-0 / ADP 3-0 for these sections.
  Resolution is on user — the template YAMLs will list both paths
  and skip whichever collection is absent.
- **Streamlit tab.** M6 deliverable; gated by M2–M5 acceptance.
- **Cross-collection retrieval merge strategies.** Deferred per
  [`memory.md`](../docs/memory.md) open item. v1 client-side union
  is sufficient.
- **Arabic doctrine corpus.** User Q4 notes future deployments will
  contain Arabic doctrine with possible English acronyms. The
  template YAMLs will gain a `query_language` hint per group when
  that corpus ships; no schema change needed.

---

## 18. Explicit Corrections vs Earlier Drafts

Rejected ideas that must not be resurrected (following the Phase 2
§12 convention):

| # | Correction | Why |
|---|---|---|
| **C1** | **No PDF renderer. No TXT renderer.** Originally D8 in the plan; removed 2026-04-22 by user. Only `.docx` ships in v1. | User directive |
| **C2** | **Do not rewrite or simplify the old Arabic renderer.** User Q2 — prior simplification broke formatting | User directive |
| **C3** | **Do not make the field-kind taxonomy implicit** (e.g. "LLM decides which fields to fill"). Taxonomy is declared in YAML and dispatched deterministically. | Grounds the token-efficiency argument; otherwise every field risks an LLM call |
| **C4** | **Do not put drafting instructions inside Pydantic field descriptions.** That is the old code's anti-pattern. Descriptions are terse; instructions live in the YAML's `prompt` field per group. | User Q3 — clean separation of schema vs instruction |
| **C5** | **Do not add feature-flag abstractions for the health-domain swap.** Rename-only migration (Q9). | Minimizes debugging across the user's two codebases |
| **C6** | **Do not introduce a second Qdrant client singleton inside `graph/generation/`.** Reuse via `graph.retrieval.search` (which already carries it). Matches Phase 2 §10.5 discipline. | No parallel state |
| **C7** | **Do not send filenames to the LLM.** `memory.md` Rule 1 applies unchanged. Retrieved chunks use `source_doc` slugs, which are public references, not filesystem paths. | Phase 1 locked rule |

### Second-review revisions — C8–C15 (added 2026-04-22)

Each entry below lists the earlier-draft position, the revised
position, and the reason. These are binding; a future chat must not
revert to the earlier draft.

| # | Earlier draft | Revised position | Why |
|---|---|---|---|
| **C8** | §6.2 step 2: *"Fan-out search → dedupe by `point_id` → sort by `rerank_score`, keep top 15."* | **RRF-across-seeds + single final rerank.** Per-seed calls run with `use_reranker=False`; merge candidates by `Σ 1/(60+rank_in_seed)` across seeds; keep top `PHASE3_MERGE_POOL_SIZE` (default 25); run the reranker **once** on the merged pool against a canonical rerank query (§6.2 step 4). | `rerank_score` in [`graph/retrieval/schema.py`](../graph/retrieval/schema.py) is scored against the single query passed to each `search()` call. Using it to compare hits across different seed queries mixes incompatible scales — it would silently favour seeds whose best-match doctrine is easy, and depress narrow or exact-match seeds. RRF on rank positions is the standard multi-query fusion signal; a single final rerank restores a unit-scale comparable score. |
| **C9** | §11 and §7.3 both listed `graph.shared.llm._get_llm` as the LLM source and also promised `PHASE3_DRAFT_TEMPERATURE=0.2` + `PHASE3_CRITIQUE_TEMPERATURE=0.0`. | **Phase 3 has its own `graph/generation/llm.py`** with `get_draft_llm()` and `get_critique_llm()`. `graph.shared.llm._get_llm` is **removed** from Phase 3's integration surface. | The shared singleton is hardcoded `gpt-4o-mini` / `temperature=0.0` at [`graph/shared/llm.py:40-41`](../graph/shared/llm.py). It cannot honour per-call temperature overrides. The module's own docstring already says per-config changes belong in a module-local helper (Phase 2 HyDE precedent). |
| **C10** | §10: *"A rerun with unchanged inputs + corpus returns the previous `.docx` byte-for-byte."* | **Retracted.** The assembled `GeneratedDocument` pydantic instance is deterministic. `.docx` bytes are not — [`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md) §3.3 states python-docx XML element ordering is not stable. Cache at the pydantic layer; re-render on cache hit. Visual identity, not byte identity, is the guarantee. | Internal doc contradiction in the first draft (§10 vs 19 §3.3); the fix is to align §10 with the renderer's actual behaviour. |
| **C11** | §10 per-group cache key listed only `template_version, group_name, input_subset, collection_content_hash_list, query_seeds`. | **Expanded cache key** includes YAML file hash, YAML group block hash, resolved seeds (sorted), filter items (sorted), collection content hashes (sorted), `use_glossary`, `use_reranker_final`, `use_hyde`, `top_k_per_query`, `merge_pool_size`, `merged_top_k`, `draft_model`, `draft_temperature`, `critique_model`, `critique_temperature`, `prompt_ar` hash, input-subset hash, **and `reranker_model_tag`**. | The earlier key would cache-hit after a prompt edit, a temperature change, a reranker swap, or a toggle flip — silently returning stale drafts. Every knob that can change the output must enter the key. |
| **C12** | §7.1 prompt snippet: *"cite each field with `[DOC §PARA]`"* with no rule for `paragraph_number=None`. | **New §6.6 — locator fallback.** Order: `paragraph_number` → `paragraph_numbers[0]` → deepest segment of `heading_path` → `"p. " + page_numbers[0]` → `"—"`. The generation layer pre-resolves the tag BEFORE the LLM sees the chunk; the drafter copies the tag verbatim. | `paragraph_number` is `str \| None` in [`graph/retrieval/schema.py:63`](../graph/retrieval/schema.py). Without fallback, the first chunk missing a paragraph number would produce `[source_doc §None]` in rendered output. Pre-resolving in code removes the LLM as a point of citation-correctness failure. |
| **C13** | §5 implied `NewClasses.md` would be "mirrored 1-to-1" into schema modules. | **C4b — `NewClasses.md` is a REFERENCE, not an implementation source.** Real schema modules in `graph/generation/schema/` are clean Pydantic v2 (type annotations only). `Field("…")` defaults, `description=…`, and `examples=…` migrate to YAML per-field (`static.value`, `label_ar`, `examples_ar`, `prompt_ar`). Shape-compatibility for the health-codebase port is preserved by matching FIELD NAMES, not by copying the file's quirks (`str = Field()` with no args, empty-string tuple defaults, mixed `examples` shapes). | Mechanical copy would import Pydantic-v2-invalid constructs. The file intentionally mirrors the user's old health `prompt.txt` for rename-only port shape, but that old file has quirks that must not land in real modules. |
| **C14** | §14: *"Shape is fixed by a JSON-Schema file shipped with the code."* (Implied a hand-maintained JSON-Schema file.) | **Pydantic `Phase3Inputs` in `graph/generation/schema/inputs.py` is the authority.** `scripts/export_phase3_input_schema.py` calls `Phase3Inputs.model_json_schema()` and writes `data/phase3_inputs.schema.json`. The JSON-Schema file lives in the repo for external tooling consumption but **must never be hand-edited** — regenerate from the script. | Pydantic native schema export means exactly one edit point (the model), eliminates shape drift between runtime validation and the external JSON-Schema. |
| **C15** | Hits from multi-collection fan-out were anonymous w.r.t. their source collection. | **`SourcedHit` wrapper** in `graph/generation/retrieval_group.py` preserves the originating `collection` on every hit, plus `occurrences: tuple[(seed_index, rank), …]` for RRF, `rerank_score` from the single final rerank pass, and `citation_tag` pre-resolved per §6.6. Zero Phase 2 schema change. | Collision risk across collections is narrow (same `source_doc` in two folders) but **provenance, debugging, future multi-collection behaviour, and citation traceability** all benefit from carrying `collection` alongside every hit. Cheap insurance, zero cost to Phase 2. |

### Third-review revision — C16 (added 2026-04-22, post-M2)

User-directed design change: the Phase 3 input surface is no
longer a user-authored ``inputs.json`` file. It is now a
**free-form Arabic/English operation brief** (``prompt.txt``)
processed by an upstream extractor LLM call. ``Phase3Inputs`` is
preserved — its role shifts from "user-authored file" to
"structured-extraction target produced by one upfront LLM call".

| # | Earlier draft | Revised position | Why |
|---|---|---|---|
| **C16** | §14 + `scripts/generate_documents.py` required the user to hand-author a strict-shape `inputs.json` validated against `Phase3Inputs`. Every knob an operator cared about — H-Hour, assembly area, mission intent — was a JSON field. | **Free-form prompt input surface.** User writes ``prompt.txt`` (an operation brief in prose). A new ``graph/generation/prompt_extractor.py`` calls ``get_extractor_llm().with_structured_output(Phase3Inputs)`` once at the top of the pipeline (temperature 0.0), producing the same validated ``Phase3Inputs`` instance the rest of Phase 3 already consumes. The CLI persists that instance to ``output/generated/<run_id>/extracted_inputs.json`` as the audit trail. A ``--inputs-json`` escape hatch bypasses extraction for debugging / regression runs; its behaviour is behaviour-identical to the pre-C16 CLI. | The user's workflow conditioned them to write prose, not fill a structured form — JSON-in was a friction source. Extracting once at the top of the pipeline gives us determinism downstream (every group-drafting call sees the SAME extracted facts) without forcing structured hand-authoring. ``Phase3Inputs`` shape stays unchanged; only its source moves. |

**What does NOT change under C16:**

- ``graph/generation/schema/*.py`` (every Pydantic class, including
  ``Phase3Inputs`` itself).
- ``graph/generation/template_loader.py``.
- ``graph/generation/field_dispatcher.py`` (the 5-kind walker and
  ``run_retrieval_phase`` orchestrator).
- ``graph/generation/retrieval_group.py`` (RRF-across-seeds + single
  final rerank + ``SourcedHit`` + citation-tag pre-resolution).
- ``graph/generation/section_drafter.py``,
  ``graph/generation/critique.py``.
- ``graph/generation/assembler.py``,
  ``graph/generation/renderers/arabic_docx.py``.
- ``graph/generation/time_math.py``.
- ``templates/*.yaml``.
- ``data/phase3_inputs.schema.json`` (still auto-generated from
  ``Phase3Inputs`` via ``scripts/export_phase3_input_schema.py``).
- All of §18 C1–C15 remain binding; C16 adds to the set, it does
  not supersede any prior correction.

**What changes under C16:**

- **New.** ``graph/generation/prompt_extractor.py`` — one module,
  one public function ``extract_inputs(prompt_text) -> Phase3Inputs``.
  Uses ``get_extractor_llm()`` (a new factory in
  ``graph/generation/llm.py`` that reads
  ``PHASE3_EXTRACTOR_MODEL`` /
  ``PHASE3_EXTRACTOR_TEMPERATURE``, defaults
  ``gpt-4o-mini`` / ``0.0``). Raises ``ExtractionError`` with
  field-level context on empty prompts, LLM call failures, and
  adapter misbehaviour. Self-test at ``--selftest`` runs offline
  with a stub LLM.
- **New.** ``data/phase3_prompt.example.txt`` — sample Arabic
  operation brief covering the same scenario as
  ``data/phase3_inputs.example.json``. The JSON example file is
  retained: it now documents the extraction TARGET shape (and
  drives the auto-generated ``data/phase3_inputs.schema.json``),
  while the ``.txt`` documents the new INPUT shape.
- **Changed.** ``scripts/generate_documents.py`` — CLI now takes
  ``--prompt`` (primary) or ``--inputs-json`` (escape hatch) as a
  required mutually-exclusive pair. A new ``--run-id`` flag
  overrides both the extractor's synthesized id and anything in
  ``inputs.output.run_id``. When ``--prompt`` is used, the CLI
  persists ``extracted_inputs.json`` in the run's output root.
- **Changed.** ``graph/generation/cache.py`` — per-group cache
  key gains three components: ``user_prompt_sha256``,
  ``extractor_model``, ``extractor_temperature``. Defaults on the
  ``--inputs-json`` path are ``""`` / ``""`` / ``0.0`` — runs on
  the two CLI paths therefore do not cache-collide even when they
  resolve to the same ``Phase3Inputs``. Prompt / extractor config
  changes invalidate cache entries as they should.

**What NOT to do under C16 (binding):**

- **Do not make the free-form prompt the drafting-instruction
  surface.** Drafting guidance still lives in YAML ``prompt_ar``
  per group (§C4). The user prompt is an OPERATIONAL BRIEF only —
  facts, scenario, scope — not tone / style / emphasis instructions
  for the drafter.
- **Do not skip persisting ``extracted_inputs.json``.** It is the
  run's audit trail. A reviewer must be able to diff what the user
  wrote vs. what the extractor understood.
- **Do not re-extract on every drafting call.** Extract ONCE at
  the top of a run, pass the ``Phase3Inputs`` instance through.
  Cache on ``(prompt_sha256, extractor_model, extractor_temperature)``.
- **Do not reintroduce ``inputs.json`` as the primary input
  surface.** The ``--inputs-json`` flag is a debugging /
  regression escape hatch, not the paved path. Any new tooling
  (Streamlit, automation) consumes ``--prompt``.
- **Do not loosen the extractor's determinism.** Temperature
  stays 0.0 by default. Raising it would make the same brief
  produce different ``Phase3Inputs`` across reruns — defeats the
  cache, defeats the audit trail.

### Fourth-review revision — C17 (added 2026-04-22, post-M3 code landing)

User-directed scope revision: v1 no longer ships all four
documents. The target is **MDMP Step 1 (Receipt of Mission)**
only, which produces exactly two outputs — Time Analysis and
Initial Planning Guidance (WARNO). The other two documents
belong to later MDMP steps (Staff Estimates = Steps 2–6;
OPORD = Step 7) and would be doctrinally out-of-step if bundled
into a Step 1 package. Their templates, schemas, and already-
written drafting / retrieval code are **preserved on disk,
flagged out-of-v1-scope**, and deferred to a v2 that covers the
later MDMP steps.

Alongside the scope cut, the doctrine corpus is being swapped:
the 21 tactics manuals previously in ``inputs/doctrine/`` (FM 3-0,
FM 3-90, ATPs on rifle/tank/Stryker, etc.) are not the right
grounding for WARNO drafting under Step 1. They are archived
under ``/Users/hextechkraken/Desktop/NatoDocs/`` (outside the
repo) and replaced with an MDMP-focused set: FM 6-0, FM 5-0,
ADP 5-0, ADP 2-0.

| # | Earlier draft | Revised position | Why |
|---|---|---|---|
| **C17** | §1 Scope, §15 Rollout, §5 Templates, and §18 C1 all treated all four documents as v1 deliverables. ``scripts/generate_documents.py`` had no scope filter; ``--docs`` accepted any template name. | **v1 ships two documents only** — ``time_analysis`` and ``initial_planning_guidance``. Both map to MDMP Step 1 (Receipt of Mission). ``staff_estimate`` and ``operation_order`` are **deferred to v2**. Their YAML templates stay on disk with a ``v1_scope: false`` flag at the top level; their schema modules (``graph/generation/schema/{staff_estimate,opord}.py``) stay in tree. The M3 retrieval / drafting / critique / cache code (already committed at `5e2aaf0`) also stays — it is correct under the revised plan, just not exercised by the v1 CLI. ``scripts/generate_documents.py`` gains a v1-scope gate: any request for an out-of-scope template logs a single ``[v1-scope] skipping <template> — deferred to v2`` line and is dropped from the run. Doctrine corpus swapped to FM 6-0 / FM 5-0 / ADP 5-0 / ADP 2-0 under ``inputs/doctrine/``; previous tactical manuals archived under ``/Users/hextechkraken/Desktop/NatoDocs/``. User reruns ``main.py`` after dropping the Qdrant ``ingest__doctrine__bgem3`` collection (the ingest pipeline hash-gates changed docs but does not reconcile removed ones, so a drop + re-ingest is required — not a silent partial rebuild). | MDMP Step 1 is the minimum coherent deliverable for a planning package. OPORD (Step 7) assumes completed COA analysis + comparison + approval; Staff Estimates (Steps 2–6) assume mission analysis has been briefed and COAs developed. Including either in a Step 1 run would produce artifacts that look doctrinal but encode the wrong step's assumptions. Cutting scope now — **after** the retrieval / drafting / critique / cache plumbing has been built and the Time-Analysis pipeline is end-to-end green — keeps the v2 path cheap: ship the two docs that match the real target use case, leave the rest dormant but correct for later. The corpus swap is paired because FM 6-0 / FM 5-0 / ADP 5-0 / ADP 2-0 are the doctrinal sources a WARNO actually cites; the 21 tactics manuals would contaminate retrieval with tactical prose when the draft should be grounded on planning / MDMP / orders-production doctrine. |

**What does NOT change under C17:**

- ``graph/generation/`` source tree — every module landed at M1/M2/M3 stays valid. ``retrieval_group.py``, ``section_drafter.py``, ``critique.py``, ``cache.py``, ``llm.py``, ``prompt_extractor.py``, ``assembler.py``, ``field_dispatcher.py``, ``template_loader.py``, ``time_math.py``, and ``renderers/arabic_docx.py`` are all correct under the revised plan.
- ``graph/generation/schema/{staff_estimate,opord}.py`` — kept on disk. Template loader validates them at import time; schema-module parity check still runs against them.
- ``templates/staff_estimate.yaml`` and ``templates/operation_order.yaml`` — kept on disk with ``v1_scope: false`` added as a top-level key. Template loader tolerates the key (unknown top-level fields in the current loader do not fail).
- C1–C16 all remain binding. C17 adds to the set; it does not supersede any prior correction.
- Phase 1 and Phase 2 source code (still locked).
- ``NewClasses.md``, ``data/phase3_inputs.example.json``, ``data/phase3_prompt.example.txt``, the auto-generated ``data/phase3_inputs.schema.json`` — all unchanged.

**What changes under C17:**

- **Templates flagged.** ``templates/staff_estimate.yaml`` and ``templates/operation_order.yaml`` gain a ``v1_scope: false`` top-level key (authoritative signal; the CLI reads it).
- **CLI gated.** ``scripts/generate_documents.py`` filters the requested ``--docs`` list against the v1 scope set. Out-of-scope templates are dropped with a single stderr log line. The default (no ``--docs`` flag, meaning "all") resolves to the v1 set, not all four.
- **Doctrine corpus.** ``inputs/doctrine/`` now holds the four MDMP manuals listed above. The 21 tactics PDFs previously in that folder live at ``/Users/hextechkraken/Desktop/NatoDocs/`` — user-chosen archive path, outside the repo tree, preserved for a future v2.
- **Qdrant collection rebuild.** User-owned. ``ingest__doctrine__bgem3`` must be dropped and rebuilt after the corpus swap because the ingest pipeline's hash gate skips unchanged docs and does not reconcile removed ones — so the old 21 manuals' vectors would linger if we only re-ran ``main.py``. The exact commands are listed in the session-close summary; this session does **not** execute them.
- **Scoping docs.** ``docs/phase3_walkthrough.md`` §1 table marks OPORD + Staff Estimates as "v2 (deferred)". §9 rollout milestones M3 and M4 become "deferred to v2"; M5 (WARNO) stays in v1 because that's one of the two deliverables; M6 Streamlit also stays.
- **CLAUDE.md status line.** Revised to reflect "v1 = MDMP Step 1 (two docs)".
- **memory.md.** Session Handoff block appended with a dated entry capturing the scope reduction, corpus swap, and the Qdrant-rebuild responsibility. New "Do not" line: do not resurrect OPORD / Staff Estimates in v1; they are deferred.

**What NOT to do under C17 (binding):**

- **Do not delete ``templates/staff_estimate.yaml`` or ``templates/operation_order.yaml``.** They stay on disk with ``v1_scope: false``. Deletion would throw away the v2 starting point.
- **Do not delete ``graph/generation/schema/staff_estimate.py`` or ``graph/generation/schema/opord.py``.** The template loader's schema-module parity check reads them.
- **Do not delete the M3 retrieval / drafting / critique / cache code** (``retrieval_group.py``, ``section_drafter.py``, ``critique.py``, ``cache.py``). It is correct under C17 — just not exercised by the v1 CLI. v2 re-enables it by flipping the two templates' ``v1_scope`` flag and removing the CLI filter.
- **Do not promote the v1-scope gate into a "feature flag" system.** One boolean per template is the whole mechanism. No enum, no registry, no plugin surface — §18 C5 (rename-only port, no feature-flag abstractions) still binds.
- **Do not drop the Qdrant collection from this session.** That is an operator action, explicitly reserved to the user per kickoff instruction. Likewise, do not run ``python main.py`` as part of the swap — the user reruns ingest themselves.
- **Do not add more doctrine PDFs unprompted.** The four manuals listed in the C17 table are the confirmed set. ATP 5-0.1 (Army Design Methodology) was offered and declined by the user; revisit only if a WARNO draft surfaces design-methodology citations that the current set can't support.
- **Do not flip v1 scope back to four documents without a new scoping revision.** C17 is binding; adding OPORD or Staff Estimates back requires a C18.

### Fifth-review revision — C18 (added 2026-04-22, post-C17)

Under C17 the corpus was deliberately narrowed to four MDMP-focused
manuals (FM 6-0, FM 5-0, ADP 5-0, ADP 2-0) and v1 scope was cut to
MDMP Step 1 outputs only.  That invalidated the motivating premise
for the M0.1 loosening (which was designed to let specialty manuals
— sustainment, signal, aviation, CBRN, engineer, MP, EW — pass the
gate when the corpus spanned 21 tactics manuals).  Under C17, those
specialty manuals are NOT in the corpus and their content would
contaminate retrieval if accidentally dropped into
``inputs/doctrine/``.  User directive: re-tighten the gate to an
MDMP-topical filter.

| # | Earlier draft | Revised position | Why |
|---|---|---|---|
| **C18** | §19.1 and ``graph/prompts.py::SUFFICIENCY_CHECK_PROMPT`` (post-M0.1) were topic-agnostic — any substantive document was accepted, and topical filtering was deferred to an unbuilt upstream layer. | **Re-tighten to an MDMP-topical filter.** The gate now accepts: MDMP itself (steps, inputs / outputs, timelines, running estimates); staff organization and processes (G/S-1 through G/S-9, warfighting functions, commander-staff interaction); orders and plans (OPORD / WARNO / FRAGO / OPLAN / annexes); commander activities (intent, CCIR / PIR / FFIR / EEFI, guidance, decision points); operations process (plan → prepare → execute → assess), unified land operations, tempo, mission command; IPB / IPOE, targeting, information collection, enemy analysis; Army tactical manuals whose procedures feed MDMP (maneuver, fires, sustainment, protection, intelligence, IO) as long as they inform planning; and joint doctrine that parallels any of the above.  It rejects: clearly non-military material (cookbooks, marketing, social media, personal letters, consumer manuals); non-doctrinal military ephemera (uniform regulations, ceremony scripts, unit histories, awards citations, recruiting brochures); empty / blank / whitespace-only pages; placeholder / cover-page-only content; OCR / parse garbage; technical material outside the military-operations domain (civilian medical textbooks, civil engineering standards, programming language references) unless clearly referenced by a planning process.  Rejection remarks for unreadable content are required to use a keyword from the C19 classifier list. | MDMP Step 1 retrieval is the sole v1 target.  An irrelevant doc accepted into ``ingest__doctrine__bgem3`` would dilute signal for every query in every field of every group.  The M0.1 topic-agnostic filter was the right shape when the corpus spanned 21 specialty manuals; under C17 the corpus is four MDMP manuals, so "accept everything substantive" no longer matches the corpus design.  Keep rejecting non-MDMP material at the gate; avoid contamination. |

**What does NOT change under C18:**

- Schema and node wiring of ``check_documents`` — still one LLM call per doc, still ``DocumentDecision`` structured output, still one-folder-one-collection.
- Filenames-hidden rule (Rule 1) — decisions remain content-only.
- Binary-placeholder rule — unknown binaries without preview still not auto-accepted.
- C1–C17 remain binding.

**What changes under C18:**

- ``graph/prompts.py::SUFFICIENCY_CHECK_PROMPT`` — re-topicalised to MDMP scope per the accept / reject lists above.  HISTORY block in the prompt module records both M0.1 (loosening) and C18 (re-tightening).
- The rejection-remark keyword list — ``{garbled, garbage, corrupt(ed), unreadable, gibberish, encoded, cipher, nonsense, unintelligible, illegible, mojibake}`` — is now a prompt-level contract that the OCR-retry classifier (§C19) regex-matches.  Changing the keyword set is a C19 / C18 joint edit, not a drive-by tweak.

**What NOT to do under C18:**

- **Do not loosen the gate back to topic-agnostic without a new scoping revision.**  A mixed-corpus v2 would re-open this decision; v1 stays tight.
- **Do not add non-MDMP domain PDFs to ``inputs/doctrine/``.**  Per §6.4, future non-MDMP domains (medical, maintenance, legal, etc.) go into their OWN ``inputs/<domain>/`` folder → their OWN collection → their OWN gate prompt.  Do not cross-contaminate.
- **Do not drop the rejection-remark keyword requirement from the prompt.**  The C19 OCR-retry loop depends on it to fire reliably on the broken-CMap failure class.  Rewording the keywords in the prompt without updating the classifier regex is a bug.

### Sixth-review revision — C19 (added 2026-04-22, post-C17; plan-B for broken-CMap PDFs)

During C17 re-ingest, ``ADP-2-0-Intelligence.pdf`` (2019 Army
edition, produced by Adobe InDesign CC 2015 → Acrobat Distiller
15.0) was rejected at the per-doc gate with a "garbled / corrupt /
unreadable" remark.  Forensic analysis showed the PDF's body-text
font was embedded with a custom glyph-index encoding but **no or
broken ``ToUnicode`` CMap**: every printable ASCII character in the
text layer is Caesar-shifted by -29 (``A`` → ``$``, ``D`` → ``'``,
digits land on ``\x10``–``\x1f`` control bytes).  Visual rendering
is correct (glyph shapes are intact) but every text-layer extractor
produces Caesar-encoded garbage.

A blanket de-ROT post-processor was ruled out because 74 of 88
pages are mixed-encoding **within a single page** — headers extract
cleanly while body paragraphs are Caesar-shifted.  Span-level
detection is heuristic and fragile.  Full forensic evidence:
[`docs/pdf_failure_fallback_plan.md`](../docs/pdf_failure_fallback_plan.md)
§1.

| # | Earlier draft | Revised position | Why |
|---|---|---|---|
| **C19** | The pipeline had three graceful-degradation mechanisms (initialpages_convert exception-log, check_documents reject bundle, convert_document per-page thin-page escalation) but none of them covered a doc whose text layer extracts cleanly from Docling's perspective yet is interpretable garbage to the LLM gate.  ``ADP-2-0-Intelligence.pdf`` was rejected at the gate and silently dropped from retrieval; ``retrieval_group.missing_manual_elision`` hid the gap. | **Two-pass gate with force-OCR retry.**  When ``check_documents`` rejects a doc with a remark matching the C18 garbage-keyword list — OR the preview has <40 % ASCII-letter ratio on ≥500 chars — the pipeline calls ``graph.nodes.initialpages_convert.ocr_retry_preview(doc)`` which runs Docling with ``TesseractCliOcrOptions(lang=..., force_full_page_ocr=True)`` on pages 1..10 and writes ``output/<stem>/initial_pages_ocr.md`` (independent of the original ``initial_pages.md``).  The gate then re-scores the LLM on the OCR'd preview.  If the second pass accepts, the doc is tagged ``needs_full_ocr=True`` in ``eligible_documents``; ``convert_document`` reads the flag and routes the full parse straight to the full-page-OCR converter (the thin-page escalation cannot catch broken text layers because the failure mode has no bitmap signal).  Per-folder budget capped by ``OCR_RETRY_MAX_PER_FOLDER`` (default 5) so a folder of unreadable PDFs cannot burn unbounded OCR time.  OCR language driven by ``OCR_LANGS`` (default ``eng``; future Arabic doctrine: ``eng+ara``).  Both converter builders live in the new shared module ``graph/docling_converters.py`` so ``initialpages_convert``, the retry path, and ``convert_document`` all read one definition.  Reject-bundle schema extended: ``check_decision.json`` now carries ``attempts: [{mode, decision, remarks}, …]`` and an ``ocr_preview_path`` field, and the review folder copies both ``initial_pages.md`` and ``initial_pages_ocr.md`` when the retry fired. | The PDF-text-layer failure class is not one-off — any PDF from a non-standards-compliant producer (pre-2020 Army pubs, older Adobe InDesign / Distiller pipelines, OCR'd photocopies with mis-embedded fonts, PowerPoint exports with non-ASCII ligatures) can hit the same shape of failure, sometimes silently.  The gate catches obvious gibberish via the LLM remark; it does NOT catch subtle partial-encoding damage.  Tesseract full-page OCR bypasses the PDF's internal character encoding entirely — it reads the rendered glyphs visually — so it covers the whole failure class without needing a per-font detector.  Post-fix ingest state: 4/4 docs accepted (ADP 2-0 rescued via OCR retry), 2398 points in Qdrant total, ADP 2-0 contributes 233 chunks via forced-OCR parse. |

**What does NOT change under C19:**

- Phase 2 retrieval code — unaffected.  ``retrieval_group.missing_manual_elision`` remains as the last-resort safety net for manuals that simply aren't in the corpus.
- ``convert_document`` per-page thin-page escalation — unchanged.  It still fires on scanned-bitmap pages; it just isn't the only escalation path now.
- Cache behaviour — OCR preview has its own fingerprint (``initial_pages_ocr.md`` → source sha256) so re-runs on unchanged source skip both the text-layer probe AND the OCR retry.

**What changes under C19:**

- **New module.** ``graph/docling_converters.py`` — shared ``get_textlayer_converter()`` (singleton) + ``build_ocr_converter()`` (fresh per call).  ``convert_document._get_parser`` and ``_make_escalation_converter`` are kept as thin aliases for import backwards-compat.
- **New env vars.** ``OCR_RETRY_ON_GARBAGE`` (1/true/yes/on — default on), ``OCR_RETRY_MAX_PER_FOLDER`` (default 5), ``OCR_LANGS`` (comma- or plus-separated; default ``eng``).  All three in ``.env.example``.
- **New exported helper.** ``graph.nodes.initialpages_convert.ocr_retry_preview(doc, cfg=None)`` returns ``(Path | None, error_text | None)``; callers in-tree are just ``check_documents`` today.
- **New classifier in ``check_documents``.**  Regex on the gate remark plus an ASCII-letter-ratio fall-through.  Triggers the retry; per-folder budget stops runaway cost.
- **New constant.** ``FILE_INITIAL_PAGES_OCR = "initial_pages_ocr.md"`` in ``graph/config.py``.
- **Reject-bundle schema extension.** ``check_decision.json`` gains ``attempts[]`` (one entry per pass) and ``ocr_preview_path``; when the retry produced a preview, the review folder copies it alongside the original.
- **Tesseract prerequisite.** The binary must be on PATH; macOS: ``brew install tesseract`` plus ``brew install tesseract-lang`` for non-English packs.  Documented in ``.env.example`` near the OCR_* block.
- **``docs/pdf_failure_fallback_plan.md``.** Originally the design proposal; now reflects what was built.

**What NOT to do under C19:**

- **Do not write a blanket de-ROT / Caesar-shift post-processor.** Per-span mixed encoding makes it unsafe; `docs/pdf_failure_fallback_plan.md` §1.3 has the forensic evidence.  Tesseract is the right answer for the whole failure class, not a custom decoder.
- **Do not call ``_get_parser()`` / ``_make_escalation_converter()`` from new code.**  Use ``graph.docling_converters`` directly.  The aliases are import-compat only; new code that duplicates converter construction will drift ``OCR_LANGS`` out of sync with the rest of the pipeline.
- **Do not raise ``OCR_RETRY_MAX_PER_FOLDER`` casually.**  The budget exists so a folder of unreadable files cannot burn unbounded OCR time.  If a real folder has >5 broken PDFs, that is a data-quality problem — fix the sources, not the cap.
- **Do not always-force-OCR every PDF.**  Text-layer extraction is ~10× faster when the CMap is clean, and >99 % of the corpus has clean CMaps.  The two-pass gate is the right trade-off.
- **Do not set ``needs_full_ocr=True`` on docs that survived the first gate pass.**  That flag exists to route OCR-rescued docs straight through ``convert_document``'s escalation path.  Setting it on docs whose text layer is clean just wastes OCR time.

### Seventh-review revision — C20 (added late 2026-04-22, post-C19; prompt universalization + `label_ar` backfill)

Small docs-and-YAML-only follow-on after the user opened one of the
two C18 WARNO `.docx` outputs and noticed that the level-1 items in
the **توجيهات التخطيط** and **معايير السلامة التشغيلية** sections
rendered as ``7. report_production: <Arabic paragraph>`` etc. — an
English Python field key leaking into finished Arabic output — plus
a user directive that
[`data/phase3_prompt.example.txt`](../data/phase3_prompt.example.txt)
must be portable across future corpora (no hardcoded doctrine-PDF
names or Qdrant collection strings in the extractor's input). Both
issues are addressed without touching Phase 3 code.

**What does NOT change under C20:**

- C1–C19 remain binding.
- No Python source edits. No Pydantic schema edits. No renderer edits.
  The renderer's `_layout_numbered_fields` already honours `label_ar`
  ([`graph/generation/renderers/arabic_docx.py:1054`](../graph/generation/renderers/arabic_docx.py#L1054)) —
  the English leak was solely a template omission. The `directives_list`
  layout keyword falls through to `_layout_numbered_fields` today
  ([`arabic_docx.py:1138–1146`](../graph/generation/renderers/arabic_docx.py#L1138)),
  which is visually acceptable for a level-1-numbered field list and
  stays that way under C20.
- Python / Pydantic / YAML field keys stay ASCII. Renaming them to
  Arabic identifiers (Python 3 accepts unicode identifiers) was
  considered and rejected — the key flows through `retrieval_group.py`,
  `section_drafter.py`, `assembler.py`, `cache.py`, and every
  `extracted_inputs.json` key on disk. The `label_ar` mechanism exists
  so ASCII keys and Arabic labels coexist; C20 uses it.
- Per-group drafting instructions (YAML `prompt_ar`, `rerank_query_ar`)
  are unchanged. C4 + C16 still bind: drafting style lives in the YAML,
  not in the user prompt.

**What changes under C20:**

- **`data/phase3_prompt.example.txt` — de-specialized.** Removed the
  line that named the four doctrine PDFs (`FM 6-0, FM 5-0, ADP 5-0,
  ADP 2-0`) and the collection string `ingest__doctrine__bgem3`.
  Removed the "OPORD / Staff Estimates deferred" sentence —
  implementation-scope noise that the extractor shouldn't see. Added a
  broad-instructions block that tells the extractor **what fact
  categories to extract** (operation name / echelon / axis / operation
  type / formation / locations / timing / references / intent) and
  **what each of the two docs broadly contains**, without naming any
  manual or collection. The concrete Saqr-Shamal mission brief below
  stays as a working smoke case. Portable to any future corpus —
  when a non-MDMP domain ships (medical, maintenance, etc.), only the
  per-doc scope paragraphs at the top need editing; the rest is reused.
- **`templates/initial_planning_guidance.yaml` — `label_ar` backfilled
  on all 7 retrieved fields.** Labels added:
  - `report_production` → "إصدار التقارير ونشرها"
  - `coordination_duties` → "واجبات التنسيق"
  - `authorized_movements` → "التحركات المأذون بها"
  - `staff_duties` → "واجبات هيئة الركن"
  - `collaborative_planning_times_locations` → "أوقات ومواقع التخطيط المشترك"
  - `commanders_critical_information_requirements` → "متطلبات المعلومات الحرجة للقائد (CCIR)"
  - `force_protection_protocols` → "بروتوكولات حماية القوة"
  Acronyms inside parens (CCIR, PIR, FFIR, BMNT, EENT) remain English
  by user directive: "no English in the docs **except acronyms**."
- **Cache-invalidation posture.** Both edits flip load-bearing cache
  components automatically: the prompt text change flips
  `user_prompt_sha256` (see §C16); the YAML edit flips the
  `yaml_group_hash` for `PLANNING_DIRECTIVES` and
  `OPERATIONAL_SAFETY_STANDARDS` (see §C11). Next run rebuilds from
  scratch — no manual cache nuke needed.

**What NOT to do under C20:**

- **Do not hardcode doctrine-PDF names, Qdrant collection strings, or
  implementation-scope decisions** (OPORD-deferred, `v1_scope`, CLI-gate
  details) into `data/phase3_prompt.example.txt`. Those belong in YAML
  `filters.source_doc`, `filters.collections` /
  `meta.default_collections`, and the template-level `v1_scope` flag
  respectively. The prompt file is the extractor's input surface, not
  a scope-of-work document.
- **Do not feed drafting style / tone through the prompt file.** C4 +
  C16 still bind — voice lives in per-group `prompt_ar`. The C20 edit
  only adds **what-to-extract** instructions, not **how-to-write**
  instructions.
- **Do not ship a new `kind: retrieved` or `kind: input` YAML field
  without a `label_ar`.** The renderer's fallback to the ASCII Python
  key is a last-resort guard, not a paved path. When `v1_scope: true`
  is later flipped on `operation_order.yaml` and `staff_estimate.yaml`,
  audit every field there first — each retrieved / input block needs a
  `label_ar` before it renders.
- **Do not rename Python or YAML field keys to Arabic identifiers** to
  "fix" English leakage in the rendered doc. Use `label_ar`. Renaming
  the keys ripples through retrieval, drafting, caching, and on-disk
  `extracted_inputs.json` audit trails for zero user-visible benefit.

### Eighth-review revision — C21 (added 2026-04-23, post-C20; four-doc v1 + schema/label/prompt catalog consolidation)

User directive (2026-04-23): the v1 input surface is "warning-order
info + intel-analysis report," and the output surface is **four**
Arabic `.docx` files (not two).  Additionally, schema-class names,
Arabic labels, and drafting prompts should each live in a single
editable file so future edits don't require scavenging across YAMLs.

| symptom | fix | rationale |
|---|---|---|
| §C17's two-document v1 does not match the user's "input/output for our step 1" mental model.  The user wants four deliverables per run: Time Analysis + Initial Planning Guidance + Warning Order + Staff Brief. | **Expand v1 to four documents** (still MDMP Step-1 framed).  `warning_order` is a new mapped-only document; `staff_brief` is a new Step-1 running-estimate brief.  Neither is the v2-deferred OPORD or the v2-deferred full Staff Estimate (those stay `v1_scope: false`). | §C17's reasoning was "bundling Steps 2–7 deliverables into a Step-1 run produces doctrinally wrong artifacts."  §C21 respects that — it adds two NEW Step-1 documents, not the v2 deferrals.  Zero net-new Pydantic classes or fields were introduced. |
| Per-document schema files (`schema/time_analysis.py`, `schema/initial_planning_guidance.py`, `schema/opord.py`, `schema/staff_estimate.py`) scatter the authoritative class definitions across four files; renaming a class required grepping. | **Consolidate into one file**: `graph/generation/schema/schemas.py`.  All 16 Pydantic classes live there; `DOCUMENT_CLASSES` exposes them as a tuple.  The four legacy modules stay on disk as thin re-export shims so external `import graph.generation.schema.opord` paths keep resolving. | One place to rename; one place to audit field-count parity against `NewClasses.md`; template loader's `TEMPLATE_ID_TO_SCHEMA_MODULE` collapses from 4 unique modules to 1 shared module — any template_id can reuse any class. |
| Arabic labels were inline on every YAML field.  Renaming a label required finding the right YAML and touching multiple entries (the § C20 backfill touched 8 fields by hand). | **Move labels into one catalog**: `graph/generation/schema/field_catalog.py`.  `FIELD_LABELS_AR[(class_name, field_name)]` returns the Arabic label.  Template loader overlays into each YAML's field spec at load time — **catalog wins over YAML inline**.  Labels for all 16 classes pre-populated. | Single editable surface per user directive.  ASCII Python keys still flow through retrieval / cache / serialization unchanged.  YAML inline is still honoured as a last-resort fallback for templates the catalog doesn't cover. |
| Drafting prompts were inline on every retrieved YAML field.  Editing the citation-clause or the fallback-clause across 7+ fields required hand-syncing. | **Move prompts into one catalog**: `graph/generation/prompts_ar.py`.  `PROMPTS_AR[(template_id, class_name, field_name)]` returns the Arabic drafting prompt.  Shared `_CITE_CLAUSE` + `_FALLBACK_CLAUSE` module constants keep every prompt consistent on the citation + fallback rules.  Template loader overlays into retrieved-field specs — **catalog wins over YAML inline**. | Same rationale as labels.  Also avoids drift when a user directive like "no English in docs except acronyms" lands — one file to re-audit. |
| `scripts/generate_documents.py` hard-coded `out_path = out_root / f"{doc_id}.docx"`, ignoring `template.meta.output_filename`.  With §C21's shared-schema-module pattern (`warning_order` + `operation_order` both back onto `opord`'s classes), hard-coding `doc_id` worked by coincidence; shared filenames would have collided. | **Honour `meta.output_filename`** with `{document_slug}` substitution.  Each template picks its own filename — `warning_order.yaml` produces `warning_order.docx`, `staff_brief.yaml` produces `staff_brief.docx`.  UI does the same. | Explicit is better than positional.  Makes it safe for two template_ids to share a schema module without fighting over filenames. |
| `Phase3Inputs.document_selection` had four flags matching the four legacy templates.  Adding the two new v1 docs required schema evolution. | **Extend `DocumentSelection`** with `warning_order: bool = True` + `staff_brief: bool = True` (defaults True — standard runs produce all four).  `operation_order` + `staff_estimate` stay `bool = False`.  Extractor system prompt updated to list the six flags.  `data/phase3_inputs.example.json` updated.  JSON-Schema regenerates on next export. | Minimal schema delta; default-true on the new flags matches the user's "four outputs per run" directive. |

**What changes in the code**:

* New: `graph/generation/schema/schemas.py`, `schema/field_catalog.py`, `prompts_ar.py`, `templates/warning_order.yaml`, `templates/staff_brief.yaml`.
* Modified: `schema/time_analysis.py`, `schema/initial_planning_guidance.py`, `schema/opord.py`, `schema/staff_estimate.py` → thin re-export shims.
* Modified: `template_loader.py` — `TEMPLATE_ID_TO_SCHEMA_MODULE` remapped; new `_apply_catalogs()` pre-validation overlay pass (catalog wins).
* Modified: `scripts/generate_documents.py` — `ALL_DOC_IDS` extended; new `_render_output_filename()` helper.
* Modified: `ui/phase3_tab.py` — `V1_DOC_IDS` / `V1_DOC_LABELS` extended; `_run_one` honours `meta.output_filename`.
* Modified: `schema/inputs.py` — `DocumentSelection` gained two fields; standalone-run print echoes the six-flag set.
* Modified: `prompt_extractor.py` — `DOCUMENT SELECTION` block lists six flags.
* Modified: `data/phase3_inputs.example.json` — `document_selection` gained two keys.
* Modified: `NewClasses.md`, `CLAUDE.md`, `AGENTS.md`, `docs/memory.md` — status + §C21 narrative.

**Binding revisions summary**:

- C1–C20 remain binding.
- **C21 is binding.** All four v1 documents must render on a single
  run; the three catalogs are the single editable surface for
  labels / prompts; `meta.output_filename` is the CLI/UI filename
  source.

**What-NOT-to-do under C21**:

- **Do not reintroduce per-document schema modules as the authoritative
  source.** They are thin re-export shims now. Single source of truth
  is `graph/generation/schema/schemas.py` per user directive.
- **Do not write new Arabic labels or drafting prompts inline in YAML.**
  Edit the catalog. YAML inline remains as a last-resort fallback, not
  the paved path.
- **Do not add new Pydantic classes or fields to satisfy a new
  document.** §C13 + §C21 both bind — reuse the existing class set.
- **Do not promote the two new templates into cross-document derived
  chains** until the assembler's cross-doc-reference resolution is
  explicitly tested.  Current §C21 smoke covered static/input/computed/
  retrieved kinds only.
- **Do not drop `meta.output_filename`** from a new template. The CLI
  + UI both read it.

**Smoke evidence (2026-04-23)**:

```
$ python -m graph.generation.template_loader
OK initial_planning_guidance.yaml: ...
OK operation_order.yaml: ...
OK staff_brief.yaml: ...
OK staff_estimate.yaml: ...
OK time_analysis.yaml: ...
OK warning_order.yaml: ...

$ python scripts/generate_documents.py \
      --inputs-json data/phase3_inputs.example.json \
      --docs time_analysis initial_planning_guidance warning_order staff_brief \
      --out /tmp/c21_smoke_full
run_id : 2026-04-22_saqr_shamal_0400
out    : /tmp/c21_smoke_full
docs   : ['time_analysis', 'initial_planning_guidance', 'warning_order', 'staff_brief']
OK   time_analysis: /tmp/c21_smoke_full/time_analysis.docx (41536 bytes)
OK   initial_planning_guidance: /tmp/c21_smoke_full/initial_planning_guidance.docx (44647 bytes)
OK   warning_order: /tmp/c21_smoke_full/warning_order.docx (42327 bytes)
OK   staff_brief: /tmp/c21_smoke_full/staff_brief.docx (44821 bytes)
```

---

### Ninth-review revision — C22 (added 2026-04-23; three-prompt input surface + per-doc fields JSON)

**Context.** §C16 (third review) paved a free-form prompt → Phase3Inputs
path driven by one extractor LLM call.  §C21 (eighth review, same day as
C22) expanded v1 to four documents.  §C22 splits the single user-facing
free-form brief into THREE per-doc briefs.  `Phase3Inputs` stays the
internal contract; only the user-facing input is reshaped.

| Issue | Resolution | Rationale |
|---|---|---|
| A single free-form `data/phase3_prompt.example.txt` mixed timing, planning and intel facts. Writers asked for a cleaner shape where each of the four v1 documents has its own input surface. | **Split into three per-doc briefs**: `prompt_1` → Time Analysis, `prompt_2` → Initial Planning Guidance + Warning Order, `prompt_3` → Staff Brief. The Warning Order has no prompt of its own; its fields come from prompts 1 & 2. | Per-doc scope matches the user's mental model. Extraction still runs ONCE over the concatenation (labelled sections `[PROMPT 1 — ...]`, `[PROMPT 2 — ...]`, `[PROMPT 3 — ...]`) so the cache key and the Phase3Inputs contract are unchanged. |
| Reviewing a finished `.docx` made it hard to verify every resolved field value — the reviewer had to open Word. | **Each `.docx` ships a sibling `<doc>.fields.json`** carrying the Pydantic `.model_dump()` of every resolved section. Filename mirrors the `.docx` (`<stem>.fields.json`) so the pair is obvious. | Fast field-by-field diff against the Y reference files and against prior runs. The JSON is the audit trail; the `.docx` is the deliverable. |
| `scripts/generate_documents.py` hard-coded `--prompt` + `--inputs-json`. | **Added `--prompt-1 --prompt-2 --prompt-3`** (all three required together). Legacy `--prompt` and `--inputs-json` preserved. Surface-gate enforces exactly one input surface per run. | Writers compose three prompts; regression still uses `--inputs-json`; a single-prompt path stays for scripts that still rely on it. |

**New module surface.** `graph/generation/prompt_extractor.py` exposes
`compose_three_prompts(p1, p2, p3)` + `extract_inputs_from_three(p1, p2,
p3, *, llm=None) → (Phase3Inputs, composed_text)`. Cache key folds in the
composed text's sha256 so a prompt edit invalidates cache entries.

**Smoke evidence (2026-04-23):** 4/4 `.docx` + 4 `*.fields.json` +
`run_prompts.json` + `extracted_inputs.json` rendered at
`/tmp/c22_smoke_three/`.

---

### Tenth-review revision — C23 (added 2026-04-23; Y-schema migration + two-file input surface)

**Context.** User designated `/Users/hextechkraken/Desktop/y/*.txt` as the
canonical output shapes for three of the four v1 documents (time_analysis,
initial_planning_guidance, staff_brief). Warning Order has no Y schema
yet; kept on the legacy path until the user ships one. User also redirected
the input surface from hand-authored prompts to user-uploaded SOURCE FILES
(Warning Order + Intel Report + optional extras).

| Issue | Resolution | Rationale |
|---|---|---|
| The §C22 three-prompt surface requires a human to author scenario facts in plain text. The user wants to upload ACTUAL documents (Warning Order `.docx`, Intel Report `.pdf`) and have the pipeline extract facts automatically. | **New CLI surface `--warning-order <file>` + `--intel-report <file>` + repeatable `--source-file kind=path`** (kind ∈ `warning_order` / `intel_report` / `other`). Surface-gate enforces exactly one input surface per run. Legacy `--prompt-*` / `--prompt` / `--inputs-json` paths preserved. | Matches the user's actual workflow: they produce Warning Orders + Intel Reports routinely; the pipeline should consume those directly. Additional files beyond the two canonical roles are supported — the pipeline will attempt extraction from every supplied file. |
| `Phase3Inputs` + inline YAML schema classes don't match the flat Y shape. Renaming `MISSION_TIMELINE.current_date` → `time_Y`, etc. across the nested schema would break warning_order / operation_order / staff_estimate. | **Split schema routing**: the three Y-migrated documents own a `prompts/<doc>/schema.py` with a single flat Pydantic class (exact Y keys, `extra="forbid"`). Legacy documents stay on `graph.generation.schema.schemas`. `TEMPLATE_ID_TO_SCHEMA_MODULE` routes per template_id. | Nothing deleted; Y shape honoured verbatim for the migrated docs; warning_order + operation_order + staff_estimate keep working until Y schemas arrive. |
| `kind: retrieved` draws from the doctrine corpus — WRONG source for scenario facts like unit names, H-hour, enemy positions. Those MUST come from the user's source files, not doctrine. | **New `kind: source_file_extracted`** runs one structured-LLM call per doc over the concatenated source-file text. Catalog `EXTRACTION_PROMPTS_AR[(class, field)]` in each doc's `prompts_ar.py` supplies the per-field Arabic instruction. Extractor returns `"غير موجود في الملفات"` literal when a fact is absent. | Honours the user rule "doctrine cannot invent scenario facts." Retrieval-backed fields now restricted to doctrinal framing / conclusions (e.g. `Effect_of_Weather_and_Terrain_on_Operations`, `Human_Force_Conclusions`, `Supply_Conclusions`, `Operational_Conclusions`). |
| Some fields can't be supplied by either source-file extraction or doctrine retrieval (e.g. deferred staff actions). | **New `kind: static_placeholder`** emits one of the three approved Arabic placeholders as an explicit YAML literal. | Keeps the "no empty strings" invariant explicit at the template layer. |
| Empty string `""` leaked into `<doc>.fields.json` from (a) optional input miss, (b) cross-doc derived miss, (c) author-written `value: ""` static fields. | **Three fix sites in `field_dispatcher.py`** substitute `غير متوفر في المدخلات` / `يُصدر لاحقاً` / `غير متوفر في العقيدة المتاحة`. `scripts/generate_documents.py::_assert_no_empty_values` does a post-condition walk; raises on any whitespace-only value. | Blanks never reach the deliverable. Acceptance invariant for §C23. |
| `.fields.json` had a nested `{template_id, title_arabic, sections: {...}}` shape; Y wants flat `{field: value}`. | **Single-class templates** (the three Y-migrated docs) emit the **flat Y shape**; multi-class legacy templates keep the nested shape for back-compat. | Pair with `/Users/hextechkraken/Desktop/y/*.txt` for a direct key-parity diff. Smoke test `scripts/smoke_y_schemas.py` asserts this. |
| `graph/generation/schema/prompts_ar.py` + `schema/field_catalog.py` were single-file global catalogs. Per-doc edits had to touch the global dicts. | **Per-doc catalogs** under `prompts/<doc>/labels_ar.py` + `prompts/<doc>/prompts_ar.py`. Template loader's `_apply_catalogs()` looks up the per-doc catalog first; legacy global catalogs only apply to legacy templates. | One editable surface per document. Renaming an Arabic label for time_analysis doesn't risk touching labels for staff_estimate. |

**New per-doc layout (binding §C23 rule):** every Y-migrated v1 document
owns exactly four files under `prompts/<doc>/`:

| file | purpose |
|---|---|
| `schema.py` | One flat Pydantic class (exact Y keys, `extra="forbid"`). |
| `template.yaml` | Field kinds + retrieval seeds + structure. |
| `labels_ar.py` | `FIELD_LABELS_AR[(class_name, field_name)] → Arabic label`. |
| `prompts_ar.py` | `EXTRACTION_PROMPTS_AR` (for `source_file_extracted` fields) + `DRAFTING_PROMPTS_AR` (for `retrieved` fields). |

Plus one shared file: `prompts/_universal_instructions_ar.py` — the
reusable Arabic extraction discipline (no scenario-specific content,
no example H-hour values, no operation names).

**New module surface:**

- `graph/generation/source_file_reader.py` — Docling `.docx`/`.pdf`/`.txt`/`.md`
  reader → `ReadFile(path, kind, text, sha256, original_chars, truncated)`.
  Length cap `PHASE3_SOURCE_FILE_MAX_CHARS` (default 48 000) with an
  Arabic audit notice appended on truncation.
- `graph/generation/source_file_extractor.py` — `extract_for_document(template, files)
  → SourceFileExtractionResult`. Builds a dynamic Pydantic model on the
  fly from the template's `source_file_extracted` fields + per-field
  Arabic instructions; `llm.with_structured_output(DynamicModel).invoke(...)`;
  returns a validated dict.
- `scripts/smoke_y_schemas.py` — offline CI-friendly acceptance check.
  For each Y-migrated doc: load template, stub retrieved fields with
  `PLACEHOLDER_NOT_IN_DOCTRINE_AR`, dispatch, assert Y-key parity + no
  empty strings.

**What-NOT-to-do under C23:**

- Don't delete the legacy YAMLs (`templates/warning_order.yaml`,
  `templates/operation_order.yaml`, `templates/staff_estimate.yaml`)
  or their classes in `graph/generation/schema/schemas.py` — they still
  drive the three legacy docs.
- Don't collapse `TEMPLATE_ID_TO_SCHEMA_MODULE`. The split is intentional.
- Don't rename Y schema field names. `time_Y` (capital Y), `ammunition`
  (lowercase), `Join_op_purp` (capital J lowercase purp) — verbatim from
  `/Users/hextechkraken/Desktop/y/*.txt`. Smoke fails loudly on drift.
- Don't let doctrine retrieval invent scenario facts. `kind: retrieved`
  is reserved for doctrinal framing / conclusions. Scenario specifics
  (unit, H-hour, enemy position, references) are `source_file_extracted`.
- Don't emit empty strings. The dispatcher + the `_assert_no_empty_values`
  post-condition enforce this. If a blank escapes, add a placeholder path —
  don't bypass.
- Don't add scenario-specific content to `prompts/_universal_instructions_ar.py`.
  It stays portable across corpora.
- Don't silently build a doctrine fallback chain for `source_file_extracted`
  fields. The `ABSENT_SENTINEL` → placeholder behaviour is what v1 ships;
  a real fallback is a future extension.

**Smoke evidence (2026-04-23):**

```
$ python scripts/smoke_y_schemas.py
OK   time_analysis:             Y-keys match, no empty values
OK   initial_planning_guidance: Y-keys match, no empty values
OK   staff_brief:               Y-keys match, no empty values

$ python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief \
    --out /Users/hextechkraken/Desktop/NewOutputs
# → 3/3 .docx + 3 *.fields.json + extracted_inputs.json + run_sources.json
```

---

### Tenth-review revision — C24 (added 2026-04-23; Y-structured nested renderer layouts)

**Context.** User pointed at `/Users/hextechkraken/Desktop/ToTransfer/New Text
Document.txt §6` (the OLD generator's `generate_document` function, lines
917–1625) and said: "there are 4 documents with the same amount of fields.
Follow the paragraph and levels and tables for each. Match the level 1, level
2 etc and table formatting, then produce the new documents."

The old generator uses health-themed Arabic cover text but the field names
match our Y schemas byte-for-byte (document 2 → staff_brief, document 3 →
time_analysis, document 4 → initial_planning_guidance; document 1 → warning
order which we don't have a Y schema for). The level hierarchy ports 1:1.

| Issue | Resolution | Rationale |
|---|---|---|
| After §C23, the three migrated docs rendered via the generic `numbered_fields` layout. The old generator's §6 used a richer hierarchy: level-1 / level-2 / level-3 / level-4 nesting and a 5-column timeline table. The user wants the new `.docx` to match. | **Three new layouts** `y_time_analysis` / `y_initial_planning_guidance` / `y_staff_brief` registered in `_LAYOUT_RENDERERS`. Each mirrors the old generator's corresponding document exactly. | One hardcoded layout per migrated doc keeps the YAML simple (`layout: y_<doc>` — no nested `structure:` array to maintain) while preserving the Arabic typographic hierarchy the user expects. |
| Doc 3 + Doc 4 both need the same time-allocation block (5 level-2 rows + 5-col table). | **Shared helper `_render_y_time_allocation_block(ctx, instance, allocation)`**. Pulls the 4 step rows from `generated.allocation.table_rows_ar` (existing `PlanningAllocation`) and appends a summary `الإجمالي` row. | Single-source for the table definition. Changing the column headers or row order requires one edit, not two. |
| Doc 2's hierarchy has five underlined section-headers, each starting a new level-1 counter. | **Section-header helper inside `_layout_y_staff_brief`** calls `_reset_level_one_counter(ctx)` before each of: A. تقدير الاستخبارات والبيئة, B. تقدير العمليات, C. تقدير الأفراد, D. التقدير اللوجستي, E. الاستنتاجات العملياتية. | Matches old doc 2's pattern byte-for-byte. |
| Level-2 / level-3 / level-4 nesting for phased-enemy-tactics + higher-command-block is repetitive. | **Local closures `lvl1` / `lvl2` / `lvl3` / `lvl4`** inside `_layout_y_staff_brief` collapse `add_level_<n>(ctx, f"{label}.", underline=True)` + optional `append_to_paragraph(doc, f" {value}")` to a one-liner. | Readable at a glance; makes the 53-field structural map fit on two screens. |
| Each migrated `template.yaml` had a per-section `heading:` block left over from the `numbered_fields` layout. | **Dropped the `heading:` block** from all three Y-migrated YAMLs; `layout: y_<doc>` emits its own section breaks. | Single source of truth for the hierarchy (the Python layout) — the YAML shouldn't duplicate headings. |

**Layout specifications (binding):**

- `y_time_analysis` — `1. الإطار الزمني للمهمة` (level-1) → five level-2
  time rows (`الوقت الحالي` / `وقت بدء المهمة (H-Hour)` / `إجمالي الوقت
  المتاح` / `الوقت المخصص للتخطيط` / `الوقت المتاح للوحدات التابعة`) →
  level-2 `توزيع وقت التخطيط` → 5-col timeline table (النشاط / النسبة
  المخصصة / المدة (ساعة) / وقت البدء / وقت الانتهاء) with 4 step rows +
  الإجمالي summary row.
- `y_initial_planning_guidance` — same time block + table, then 8 ×
  level-1 directive headings with inlined value: `كيفية إنتاج التقارير` /
  `إجراءات التنسيق` / `الحركات المأذون بها` / `واجبات الأركان` / `أوقات
  ومواقع التخطيط التشاركي` / `متطلبات القائد الحرجة (CCIR / PIR)` /
  `متطلبات القوات الصديقة (FFIR)` / `قواعد الاشتباك (ROE)`.
- `y_staff_brief` — five underlined section headers (A–E), each resetting
  level-1 counter; nested level-3 / level-4 for phased-tactics
  (المرحلة الأولى / الثانية / الثالثة → الأسلوب) + higher-command
  (القيادة المشتركة / القيادة التنفيذية → المهمة / الرؤية → الغاية /
  النسق / الحالة النهائية المرغوبة).

**What-NOT-to-do under C24:**

- **Don't rewrite the `y_*` layouts' level hierarchy in YAML `structure`.**
  The nesting is hardcoded to match
  `/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt §6`. If a
  different shape is ever needed, add a new layout name and keep `y_*`
  immutable — the Y-approved output is the user's reference.
- **Don't skip `_reset_level_one_counter()`** between staff_brief's five
  section-headers. Numbering continuity across sections is the wrong
  model; each estimate block starts at `1.`.
- **Don't re-introduce `heading:` blocks** into the three Y-migrated YAMLs.
  The layouts own their own section breaks.
- **Don't rewire `_render_y_time_allocation_block`** per-doc. It's shared
  between `y_time_analysis` and `y_initial_planning_guidance` on purpose.

**Smoke evidence (2026-04-23):**

```
# Live end-to-end with §C23 two-file surface + §C24 layouts
$ python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief \
    --out /Users/hextechkraken/Desktop/NewOutputs

extracted: .../NewOutputs/extracted_inputs.json
run_id : 2026-04-30_saqr_shamal
docs   : ['time_analysis', 'initial_planning_guidance', 'staff_brief']
OK   time_analysis:             .../NewOutputs/time_analysis.docx             (41 571 B)
OK   initial_planning_guidance: .../NewOutputs/initial_planning_guidance.docx (43 264 B)
OK   staff_brief:               .../NewOutputs/staff_brief.docx               (44 750 B)
```

---

## 19. Pre-Work Required Before Code

Two items land before `graph/generation/` is written:

### 19.1 Loosen `SUFFICIENCY_CHECK_PROMPT`

> **HISTORICAL NOTE (2026-04-22):** This section describes the M0.1
> loosening that ran before code landed.  The loosening shipped.
> Under §18 C18 (post-C17), the gate was subsequently **re-tightened**
> to an MDMP-topical filter because the corpus was narrowed to four
> MDMP manuals and v1 only targets Step 1.  The paragraphs below are
> kept for historical continuity — see §C18 for the current prompt
> contract.

**Pre-C18 state (M0.1, superseded).**
`graph/prompts.py::SUFFICIENCY_CHECK_PROMPT` was originally
a **topical filter** gated on "ground maneuver / combat operations"
content. It explicitly marks sustainment, signal, aviation, air
defense, artillery, CBRN, cyberspace/EW, engineer, and MP content
as **IRRELEVANT** (lines 79–90 of the current prompt).

**Why this blocks Phase 3.** Phase 3 needs retrieval from
sustainment (ADP 4-0), fires (FM 3-09, FM 3-01), signal (FM 6-02),
engineer (FM 3-34), CBRN (FM 3-11), and others for the
`SustainmentAndCoordination`, `LOGISTICS_ESTIMATE`, and safety
sections. The doctrine corpus is one collection
(`ingest__doctrine__bgem3` — §6.4), so new manuals land as
additional `source_doc` entries inside that collection, not as new
collections. Under the current (pre-M0.1) prompt, adding those PDFs
to `inputs/doctrine/` and re-running ingest would get them rejected
at the per-doc gate before they ever reached `convert_document`.

**Change.** Rewrite the prompt to a **pure junk filter**:
- Accept any substantive doctrine-style content (military,
  doctrinal, instructional) as "enough".
- Reject only: empty / blank-page / placeholder-only / obviously
  corrupted / off-topic scans (ads, personal letters, etc.).
- Keep the filenames-hidden rule (line 109 of current prompt) —
  content-only decisions stay.
- Keep the binary-placeholder rule — unknown binaries without
  preview text still not automatically accepted.

**Scope.** One constant in one file. Additive prompt tuning, same
schema, same node wiring, same cache behaviour. Documented as a
behaviour-preserving prompt edit in the commit.

**Verification.** After the edit, add a mixed set of manuals (at
minimum: one sustainment-branch PDF, one fires PDF, one maneuver
PDF) to `inputs/doctrine/` and rerun `start.sh` (or
`python -m graph.nodes.check_documents inputs/doctrine`); all three
new manuals must come back `eligible` and land in
`ingest__doctrine__bgem3` as additional `source_doc` entries. The
existing 11 ingested manuals remain accepted because their sha256
fingerprints are unchanged — the upstream cache gate short-circuits
them before the LLM gate is even consulted.

### 19.2 Four YAML templates

The templates themselves (structure, formatting, query seeds,
drafting prompts). Full template spec + worked skeleton for one
document is in
[`20_phase3_templates_and_kinds.md`](20_phase3_templates_and_kinds.md).
Authoring these is part of M1.

---

## 20. Future Considerations

These are **not** Phase 3 decisions — they're flagged so a future
chat knows what landed elsewhere.

- **Migration to fully-API model hosting** (embedder, reranker,
  LLM all remote) — user directive post-acceptance. See §7.4.
  Affects `.env` and the `_get_*()` singletons, not Phase 3 source.
- **Health-domain port.** The user's health codebase receives the
  same generator with renamed schemas + different YAML templates.
  `NewClasses.md` at repo root has the 1-to-1 field map. No Phase 3
  code changes required.
- **Additional document types.** The architecture is template-driven;
  adding a fifth or tenth document is a new YAML + new schema
  module. No generator code changes.
- **Streaming generation** (progressive render during draft passes)
  — deferred; current architecture blocks on the critique pass
  before assembly.
- **Multi-user concurrency.** Single-user dev tool in v1. Qdrant
  supports concurrent reads; LLM calls are independent. If deployed
  server-side later, a simple queue around the CLI entrypoint is
  enough.

---

## §C25 — Warning Order Y-migration + doc-1-mirror layout (2026-04-23)

**Binding revision, closes the §C23 warning_order placeholder gap.**

Under §C23 the warning_order was kept on the legacy nested schema module
(`graph/generation/schema/schemas.py`) while `time_analysis`,
`initial_planning_guidance`, and `staff_brief` migrated to Y-approved flat
shapes. §C25 brings warning_order across.

### Field-count match for the renderer layout

The user request — "find the one that matches the number of fields as the
warning order. and then follow its same structure with paragraphs, tables etc."
— picks **OLD doc 1** (Main Public Health Response Plan) from
`/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt` lines 939–1152.
Old doc 1 references ~40 of the 50 Y-warning-order keys; the remaining 10
(`header4`, `situation`, `mission_of_supporting_unit`,
`join_op_{mission,purp,how,ops_desired_end}`, `date_time`, `local_authorities`,
`red_crescent`) are inserted at the nearest doctrinally-sensible anchor so the
dispatcher's no-empty-strings post-condition still holds and no Y field is
silently dropped.

### Schema — 50 flat fields with RTF descriptions

`prompts/warning_order/schema.py` exposes a single flat `WarningOrder` Pydantic
class with 50 `str` fields whose names match
`/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf` verbatim (including the
typos `Crtitical` in `Commanders_Crtitical_Information_Requirements` and `movm`
in `Other_coordination_movm` — Y is the contract).

Per user directive, each field's inline English description from the RTF is
hoisted into `Field(description=...)` so `with_structured_output` surfaces the
user's own field-explanations to the extractor LLM even when the per-doc
prompt catalog is unavailable.

### All 50 fields are `source_file_extracted`

`template.yaml` declares every field as `kind: source_file_extracted` with a
per-field `source_hint`:

- `warning_order` — 43 fields (everything scenario-specific that lives in the
  user's WARNO: headers, refs, mission, task org, coordination, sustainment).
- `intel_report` — 3 fields (`terrain`, `weather`, `enemy_forces`).
- `either` — 4 fields (`situation`, `area_interest`, `civil_considerations`,
  `CIVILIAN_CONSIDERATIONS`).

No `retrieved` / `computed` / `static` / `derived` kinds. **No doctrine
retrieval wired into WARNO** — it is a scenario-fact directive. Absent fields
fall through the dispatcher's `EXTRACTOR_ABSENT_SENTINEL_AR` path to
`PLACEHOLDER_NOT_IN_INPUTS_AR` ("غير متوفر في المدخلات").

### Renderer layout `y_warning_order`

Ported 1:1 from old doc 1's hierarchy, military wording substituted for the
health-themed labels:

1. `"بسم الله الرحمن الرحيم"` centred.
2. `add_arabic_header(...)` with today's Hijri + Gregorian dates (via
   `time_math.format_hijri_date` / `format_gregorian_date`). `copy_number_placeholder`
   reads from the Y `header` field with a fallback line so the block renders
   even when the source carried no explicit header line.
3. `letter_ref_number2` centred underlined.
4. Scenario `date_time` as a dedicated paragraph under the header (Y-specific
   — not in doc 1; kept separate so the header block's "today" dates continue
   to match old doc 1).
5. Plain paragraphs: `References`, `Maps` (with `add_full_stop`), `time_zone`,
   `task_assembly`.
6. LEVEL-1 `الموقف`: `situation` inline preamble → LEVEL-2 `area_interest`,
   `operations_area` → LEVEL-3 `terrain`, `weather`, `civil_considerations`
   → LEVEL-2 `enemy_forces` → LEVEL-2 `friendly_forces` via `SPLITTER` →
   LEVEL-2 gov/NGO with LEVEL-3 `local_authorities` + `red_crescent` →
   LEVEL-2 `CIVILIAN_CONSIDERATIONS` → LEVEL-2 `Attached_and_Detached_units`
   via `SPLITTER` → LEVEL-2 `Operational_Assumptions` via `SPLITTER`.
7. LEVEL-1 `مهمة المكون البري` + `GROUND_COMPONENT_MISSION` → LEVEL-2
   `join_op_mission` with LEVEL-3 `join_op_purp` / `joint_ops_how` /
   `joint_ops_desired_end` → LEVEL-2 `mission_of_supporting_unit`.
8. LEVEL-1 `التنفيذ` → LEVEL-2 `Exc_command_purp` / `Concept_of_operations`
   → LEVEL-2 `Units_Duty` (SPLITTER) → LEVEL-2
   `Duties_of_Other_Combat_Units_and_Combat_Support_Units` (SPLITTER) →
   LEVEL-2 `تعليمات التنسيق` with LEVEL-3 `Timings` /
   `Commanders_Crtitical_Information_Requirements` (SPLITTER) /
   `Fire_support_coordination` / `Air_support_coordination` / `Risk_assy` /
   `ROE` (SPLITTER) / `Other_coordination_media` / `Other_coordination_meeting`
   / `Other_coordination_Excu` (SPLITTER) / `Other_coordination_movm`.
9. LEVEL-1 `الإدامة` + `Sustainment` via `SPLITTER`.
10. LEVEL-1 `القيادة والسيطرة` + `ACCS` inline.
11. Approval block: `"أقرّوا:"` + 3 military signature lines.
12. `"الملاحق:"` + each non-empty line of `Appendices` via `add_level_one_ML`.
13. `"الشفافات:"` + each non-empty line of `Viewports` via `add_level_one_SHFAF`.

### New rules under §C25 (do NOT)

- **Don't rewrite the `y_warning_order` layout away from the old-doc-1
  hierarchy.** The 5-section LEVEL-1 structure, the `add_arabic_header` block
  with today's dates, the 6 `SPLITTER` call sites, and the `add_level_one_ML`
  + `add_level_one_SHFAF` closers are load-bearing — changing them drifts
  from the user's reference output.
- **Don't rename the Y typos** (`Crtitical`, `movm`). They're part of the
  Y contract; `scripts/smoke_y_schemas.py::Y_INLINE_KEYS` asserts them verbatim.
- **Don't strip `Field(description=...)`** from `prompts/warning_order/schema.py`.
  The text bodies come directly from the user's reference RTF and feed
  `with_structured_output` even when the prompt catalog is unavailable.
- **Don't add doctrine retrieval to WARNO** without an explicit user ask.
  Today: extractor → ABSENT_SENTINEL → `PLACEHOLDER_NOT_IN_INPUTS_AR`.

### Smoke

```bash
python -m graph.generation.template_loader        # → 6/6 OK
python scripts/smoke_y_schemas.py                  # → 4/4 OK

python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /Users/hextechkraken/Desktop/NewOutputs
# → 4/4 .docx + 4 *.fields.json; warning_order.docx ≈ 43 KB
```

---

## Appendix A — Cross-references

- Root project file: [`CLAUDE.md`](../CLAUDE.md) — status line
  updated 2026-04-22 to reflect Phase 3 scoped.
- Master index: [`docs/memory.md`](../docs/memory.md) — locked
  decisions, session handoff block, open items.
- Project-level Phase 3 walkthrough (read first in a fresh chat):
  [`docs/phase3_walkthrough.md`](../docs/phase3_walkthrough.md).
- Renderer port guide: [`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md).
- Template + field-kind spec: [`20_phase3_templates_and_kinds.md`](20_phase3_templates_and_kinds.md).
- Pydantic schemas (doctrine-side): [`NewClasses.md`](../NewClasses.md).
- Sample input: [`data/phase3_inputs.example.json`](../data/phase3_inputs.example.json).
- Phase 2 design precedent (same discipline):
  [`17_phase2_retrieval.md`](17_phase2_retrieval.md).
