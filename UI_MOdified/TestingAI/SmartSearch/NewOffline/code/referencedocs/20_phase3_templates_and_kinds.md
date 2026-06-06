# 20 — Phase 3 Template Spec + Field-Kind Taxonomy

> **Status.** SCOPED (pre-code) as of 2026-04-22. Companion doc to
> [`18_phase3_generation.md`](18_phase3_generation.md) §4, §5, §6.
>
> **Purpose.** Spell out (a) exactly how the YAML templates are
> shaped — the one data surface that drives generation — and (b)
> the full field-kind dispatch rules with concrete examples drawn
> from the Pydantic classes in [`NewClasses.md`](../NewClasses.md).
> A fresh session should be able to read this doc and know what
> every field in every class will do at generation time, without
> inspecting code.
>
> Locked directive (user Q3, 2026-04-22): **"yes keep both as to
> not face issues integrating back to another code with similar
> schemas."** The YAML carries **both** the *structural* template
> (what sections, in what order, with what formatting) **and** the
> *instructional* template (what the LLM should write into each
> retrieved field). Separating them would force two-file edits
> when porting to the user's health codebase; keeping them paired
> preserves the rename-only migration target.
>
> **Revised 2026-04-22** (post second review — tracked in
> [`18_phase3_generation.md`](18_phase3_generation.md) §18 C8–C15):
> - **Retrieval merge** is RRF-across-seeds + a single final rerank.
>   See §5.3 below and `18_phase3_generation.md` §6.2.
> - **Optional `rerank_query_ar`** per retrieved group lets a
>   template author pin a canonical rerank query; falls back to
>   `" | ".join(resolved_seeds)` when absent.
> - **`paragraph_number` is not assumed present** — citation tag
>   locator has a fallback chain; see `18_phase3_generation.md` §6.6.
> - **`NewClasses.md` is a reference, not code** — real schema
>   modules are clean Pydantic v2 (types only); `Field("…")`,
>   `description=…`, `examples=…` all migrate into this doc's YAML.
>
> **Revised 2026-04-22 (collection-scope decision).** Phase 3
> queries **exactly one collection** for the doctrine domain:
> `ingest__doctrine__bgem3`. Per-manual narrowing is expressed via a
> `filters.source_doc` allowlist inside that one collection, not by
> splitting doctrine into per-FM collections. Collection isolation
> is for **corpus/domain isolation** (doctrine vs. a future medical
> corpus vs. a future policy corpus), not for per-manual splitting.
> See [`18_phase3_generation.md`](18_phase3_generation.md) §6.4 for
> the full rationale, including the missing-manual elision rule that
> lets templates be authored against the *ideal* allowlist and still
> run against *whatever manuals the corpus actually contains today*.

---

## 1. Top-level YAML shape

One YAML file per document type, under `templates/`:

```
templates/
  operation_order.yaml            # Doc 1
  staff_estimate.yaml             # Doc 2
  time_analysis.yaml              # Doc 3
  initial_planning_guidance.yaml  # Doc 4
```

A template has three top-level keys:

```yaml
meta:
  template_id: operation_order
  template_version: 1
  title_arabic: "أمر العمليات"
  document_slug: operation_order          # drives output filename
  output_filename: "{document_slug}.docx"
  default_collections:                    # one entry per domain the template touches
    - ingest__doctrine__bgem3             # the entire doctrine corpus lives here

schemas:                                  # one entry per Pydantic class
  HeaderSection:
    fields: { ... }
  MetadataSection:
    fields: { ... }
  # etc.

structure:                                # ordered document layout
  - kind: title
    text: "أمر العمليات"
    underline: true
    alignment: center
  - kind: section
    schema: HeaderSection
    heading: null
    layout: header_block
  - kind: section
    schema: OperationalSituation
    heading:
      text: "الموقف"
      underline: true
      space_before_cm: 1.0
    layout: numbered_fields
    citation_collection: true
  # etc.
```

The `meta` block is loaded once; the `schemas` block feeds the
dispatcher; the `structure` block feeds the renderer. All three
live in one file so porting to the health codebase is a single-file
swap.

---

## 2. Field-kind reference

Every field under `schemas.<ClassName>.fields.<field_name>`
declares a `kind` plus the attributes relevant to that kind.

### 2.1 `kind: static`

A fixed literal. No LLM call, no retrieval, no computation.

```yaml
references:
  kind: static
  value: "FM 3-0 Operations, FM 3-90 Tactics, ADP 6-0 Mission Command, ADP 3-0 Operations"
```

**Use cases in the 4 documents.** `MetadataSection.references`,
every `"يُصدر لاحقاً"` field in `LOGISTICS_ESTIMATE`, every
`"حسب الإجراءات العملياتية الثابتة"` field in `PERSONNEL_ESTIMATE`,
boilerplate `"كما في الملحق (أ)"` references, and section-heading
text.

### 2.2 `kind: computed`

Pure Python formula over other fields. No LLM call, no retrieval.

```yaml
allocated_planning_time:
  kind: computed
  function: time_math.compute_allocation
  arguments:
    total_minutes: "{{input: timing.total_available_minutes}}"
  output_field: allocated_minutes_display    # path into the function's return

time_for_mission_receipt_analysis:
  kind: computed
  function: time_math.compute_allocation
  arguments:
    total_minutes: "{{input: timing.total_available_minutes}}"
  output_field: step_1_display
```

Functions live in `graph/generation/time_math.py`. The YAML only
references them by dotted path; signatures are fixed at code-time.

**Use cases.** Every field of `MISSION_TIMELINE` and
`INITIAL_PLAN_TIMELINE`. Also `CURRENT_TIME_REFERENCE.time_now`
(computed from `inputs.timing.reporting_time` via a formatter
helper).

### 2.3 `kind: input`

Pulled from the user's `inputs.json` at run time. No LLM call.

```yaml
letter_ref_number:
  kind: input
  path: references.letter_ref_number        # JSON-pointer-style
  required: true

assembly_area:
  kind: input
  path: locations.assembly_area
  required: true
```

**Use cases.** Operation-specific identifiers (`letter_ref_number`,
`warning_order_ref_number`), coordinates (`assembly_area`), maps
field, time zone, and any user-supplied context string.

### 2.4 `kind: derived`

Reference to another field's value, resolved **after** all
`retrieved` groups have drafted.

```yaml
own_unit_end_state:
  kind: derived
  reference: MissionAndExecution.desired_end_state
  # Optional: post-transform applied after resolution
  transform: null                           # or "truncate:200", "prefix:...", etc.
```

**Use cases.** The "same as above" patterns in `NewClasses.md`:
`OPERATIONS_ESTIMATE.own_unit_end_state` (from
`MissionAndExecution.desired_end_state`), doc-4 timeline fields
referencing doc-3 equivalents when both are generated in the same
run.

### 2.5 `kind: retrieved`

The only kind that calls the LLM. Declares query seeds, target
collections, filters, and a per-group drafting prompt.

```yaml
situation_summary:
  kind: retrieved
  group: OperationalSituation               # all retrieved fields with the same group value share one LLM call
  query_seeds:
    - "operational situation enemy disposition"
    - "area of operations {axis} axis enemy"
  collections:                              # empty = fall back to meta.default_collections
    - ingest__doctrine__bgem3               # single doctrine collection; narrow by source_doc below
  filters:
    chunk_type: body
    source_doc:                             # OR-match allowlist inside the one collection
      - "FM-3-0-Operations.pdf"
      - "FM-3-98-Reconnaissance-and-Security-Ops.pdf"
      - "ADP-3-0-Operations.pdf"
  top_k_per_query: 8
  merge_pool_size: 25                       # §6.2 step 3 K_merge (post-RRF, pre-rerank)
  merged_top_k: 15                          # kept after the single final rerank
  # Drafting instructions for this field (inline-Arabic; passed as
  # part of the group's structured-output prompt). The generation
  # layer will pre-resolve every chunk's citation tag per
  # 18_phase3_generation.md §6.6 BEFORE this prompt runs; the LLM
  # copies the tag it sees verbatim.
  prompt_ar: >
    اكتب ملخصاً تشغيلياً في فقرتين قصيرتين يصف الموقف العام ونوايا
    العدو بناءً على المقاطع المقدَّمة. استشهد بعد كل جملة أساسية
    بالوسم الموجود بجانب المقطع المصدر حرفياً — لا تُعدِّل الوسم ولا
    تخترع واحداً. لا تُدخل حقائق غير موجودة في المقاطع.
  examples_ar: []                           # few-shots; almost always empty
  max_tokens: 400
```

**Group-level knob (optional).** A `retrieved` group may set a
group-scoped `rerank_query_ar` (declared on any one of the group's
fields, or at a future `groups:` top-level block):

```yaml
  rerank_query_ar: "الموقف التشغيلي ونوايا العدو في منطقة العمليات"
```

The §6.2 step 4 single final rerank uses this as the canonical
query. When absent, the generator falls back to
`" | ".join(resolved_seeds)`. Explicit is better when one of the
seeds is clearly the "primary" query and the others are variants.

**Group-level aggregation.** When the dispatcher encounters the
first `retrieved` field with `group: OperationalSituation`, it
collects **all** retrieved fields with that same group value,
merges their `query_seeds`, unions their `collections`, and runs
**one** retrieval pipeline (see §5.3 and [18 §6.2](18_phase3_generation.md))
+ **one** structured-output LLM call against a Pydantic sub-schema
built from exactly those fields. This is the core of the "one LLM
call per Pydantic class" rule in §6 of the scoping doc.

---

## 3. `source_doc` allowlist routing table (v1 defaults)

Per scoping doc §5, every retrieved group resolves to the single
doctrine collection `ingest__doctrine__bgem3`. Per-manual narrowing
is via `filters.source_doc` (OR-match allowlist). The allowlist is
authored against the **ideal** manual list; the generator elides
missing manuals at runtime per §6.4 of the scoping doc.

| Document | Group | `source_doc` allowlist (collection: `ingest__doctrine__bgem3`) |
|---|---|---|
| Doc 1 | `OperationalSituation` | `FM-3-0-Operations.pdf`, `FM-3-98-Reconnaissance-and-Security-Ops.pdf`, `FM-3-90-2-Reconnaissance-Security.pdf`, `ADP-3-0-Operations.pdf` |
| Doc 1 | `MissionAndExecution` | `FM-3-0-Operations.pdf`, `ADP-3-0-Operations.pdf`, `FM-3-90-Tactics.pdf`, `FM-3-90-1-Offense-and-Defense-Vol-1.pdf`, `ADP-3-90-Offense-and-Defense.pdf`, `ATP-3-21-8-Infantry-Rifle-Platoon-and-Squad-2024.pdf`, `ATP-3-21-18-Stryker-Rifle-Company.pdf`, `ATP-3-20-15-Tank-Platoon.pdf` |
| Doc 1 | `SustainmentAndCoordination` | `ADP-4-0-Sustainment.pdf`†, `FM-3-09-Field-Artillery.pdf`†, `FM-3-01-Air-Defense.pdf`†, `FM-6-02-Signal-Support.pdf`†, `FM-3-0-Operations.pdf` (fallback) |
| Doc 2 | `INTELLIGENCE_ESTIMATE` | `FM-3-0-Operations.pdf`, `FM-3-98-Reconnaissance-and-Security-Ops.pdf`, `FM-3-90-2-Reconnaissance-Security.pdf`, `FM-3-90-Tactics.pdf` |
| Doc 2 | `OPERATIONS_ESTIMATE` | `ADP-3-0-Operations.pdf`, `FM-3-0-Operations.pdf`, `ATP-3-21-8-Infantry-Rifle-Platoon-and-Squad-2024.pdf`, `ATP-3-21-18-Stryker-Rifle-Company.pdf`, `ATP-3-20-15-Tank-Platoon.pdf`, `FM-3-90-Tactics.pdf` |
| Doc 2 | `PERSONNEL_ESTIMATE` | `ADP-6-0-Mission-Command.pdf`†, `FM-3-39-Military-Police.pdf`†, `ADP-3-0-Operations.pdf` (fallback) |
| Doc 2 | `LOGISTICS_ESTIMATE` | `ADP-4-0-Sustainment.pdf`† (allowlist empties to corpus-wide fallback until ingested) |
| Doc 3 | *(none — pure math)* | — |
| Doc 4 | `PLANNING_DIRECTIVES` | `ADP-5-0-Operations-Process.pdf`†, `FM-5-0-Planning.pdf`†, `ADP-3-0-Operations.pdf` (fallback), `FM-3-0-Operations.pdf` (fallback) |
| Doc 4 | `OPERATIONAL_SAFETY_STANDARDS` | `FM-3-11-CBRN-Operations.pdf`, `FM-3-34-Engineer-Operations.pdf`† |

† = not currently in the ingested corpus (as of 2026-04-22). The
generator elides these from the filter at runtime and falls back
to the remaining matched `source_doc`s; if all allowlisted manuals
are missing, it drops the filter and runs corpus-wide (logged as a
warning). The drafter's "`غير متوفر في العقيدة المتاحة`" rule
(§7.1 of scoping doc) catches the "nothing useful retrieved" case.

**Source-doc naming convention.** The `source_doc` payload is the
**original PDF filename as it landed in `inputs/doctrine/`** (Phase
1 does not slugify it — see `graph/nodes/upsert_to_qdrant.py`).
That's why the allowlist uses `FM-3-0-Operations.pdf`, not
`fm-3-0-operations`. If a future re-ingest renames a file (e.g.
strips the extension), the YAML allowlists need a corresponding
update — flag it in the commit that changes the filename convention.

**Future multi-domain templates.** When a separate corpus is
ingested as its own collection (e.g. `ingest__medical__bgem3`), a
template targeting that domain declares that collection in
`meta.default_collections` (and optionally lists it per-group).
v1 Phase 3 templates stay inside `ingest__doctrine__bgem3`.

Additional specialty manuals (`ATP 3-01-8 SHORAD`,
`ATP 3-04-13 Aviation`, `FM 3-12 Cyberspace/EW`) become additional
`source_doc` entries inside the same doctrine collection once
ingested — templates pick them up by adding the filename to the
relevant group's allowlist. The dispatcher reads this from the
YAML — no routing code.

---

## 4. Query-seed interpolation

Query seeds can reference user inputs via `{…}` placeholders:

```yaml
query_seeds:
  - "enemy disposition {operation.axis} axis"
  - "{operation.echelon} attack concept"
  - "{mission_intent}"
```

Resolution rules:

- `{operation.axis}` → `inputs.json :: operation.axis`
- `{mission_intent}` → `inputs.json :: mission_intent_free_text`
- `{input_field}` → equivalent dotted path into `inputs.json`
- If a placeholder's target is empty, that seed is **dropped**
  before fan-out (not passed as a literal `{axis}` to `search()`).
- The fan-out takes the deduped set of non-empty seeds.

---

## 5. Worked example — Doc 1 `OperationalSituation` group

Drawn directly from [`NewClasses.md`](../NewClasses.md).

### 5.1 Field kinds for this class

| Field | Kind | Reason |
|---|---|---|
| `situation_summary` | `retrieved` | Needs doctrine context on enemy analysis |
| `area_of_interest` | `input` | User declares per operation |
| `area_of_operations` | `static` | Always `"كما في شفاف العمليات — الملحق (م)."` |
| `terrain` | `static` | Always `"كما في تقدير الاستخبارات — الملحق (أ)."` |
| `weather` | `static` | Same as terrain |
| `civil_considerations` | `input` or `retrieved` | Per-operation; default `input`, flip to `retrieved` if user wants doctrinal framing |
| `enemy_profile` | `retrieved` | Needs doctrine context on enemy composition/disposition/strength |

### 5.2 YAML excerpt

```yaml
schemas:
  OperationalSituation:
    fields:
      situation_summary:
        kind: retrieved
        group: OperationalSituation
        query_seeds:
          - "operational situation enemy disposition {operation.axis}"
          - "commander situation overview doctrine"
        collections:
          - ingest__doctrine__bgem3
        filters:
          chunk_type: body
          source_doc:                           # OR-match allowlist; missing files elided at runtime
            - "FM-3-0-Operations.pdf"
            - "FM-3-98-Reconnaissance-and-Security-Ops.pdf"
            - "FM-3-90-2-Reconnaissance-Security.pdf"
            - "ADP-3-0-Operations.pdf"
        prompt_ar: >
          اكتب ملخصاً تشغيلياً مستنداً إلى المقاطع المقدَّمة...
        max_tokens: 400

      area_of_interest:
        kind: input
        path: locations.area_of_interest
        required: false
        default: ""

      area_of_operations:
        kind: static
        value: "كما في شفاف العمليات — الملحق (م)."

      terrain:
        kind: static
        value: "كما في تقدير الاستخبارات — الملحق (أ)."

      weather:
        kind: static
        value: "كما في تقدير الاستخبارات — الملحق (أ)."

      civil_considerations:
        kind: input
        path: locations.civil_considerations
        required: false
        default: ""

      enemy_profile:
        kind: retrieved
        group: OperationalSituation
        query_seeds:
          - "enemy composition disposition strength {operation.echelon}"
          - "threat assessment enemy forces doctrine"
        collections:
          - ingest__doctrine__bgem3
        filters:
          chunk_type: body
          source_doc:
            - "FM-3-0-Operations.pdf"
            - "FM-3-98-Reconnaissance-and-Security-Ops.pdf"
            - "FM-3-90-2-Reconnaissance-Security.pdf"
        prompt_ar: >
          اكتب وصفاً مفصَّلاً لتشكيل قوات العدو وتوزيعها وقوتها...
        max_tokens: 350
```

### 5.3 What happens at generation time (REVISED 2026-04-22)

1. Dispatcher walks `OperationalSituation`'s seven fields.
2. `area_of_interest`, `civil_considerations` → read from
   `inputs.json` (or default).
3. `area_of_operations`, `terrain`, `weather` → literal strings emitted.
4. `situation_summary` + `enemy_profile` → both `kind: retrieved`,
   same `group: OperationalSituation` → **merged into one retrieval
   group** following [18 §6.2](18_phase3_generation.md):
   - **Union seeds, intersect filters, apply to the one doctrine
     collection.** 4 resolved seeds × 1 collection
     (`ingest__doctrine__bgem3`) = 4 `search()` calls, each with
     `use_reranker=False` (the per-call reranker would only produce
     a per-seed score, which we don't use as the merge signal).
     The `source_doc` allowlist is the union of both fields'
     allowlists, minus any entries missing from the live collection
     inventory (see [18 §6.4](18_phase3_generation.md)
     missing-manual elision).
   - **Wrap hits.** Every `SearchHit` becomes a
     `SourcedHit(hit, collection, occurrences)` so the originating
     collection is preserved through the rest of the pipeline.
   - **Dedupe by `point_id`.** For each unique `point_id`, collect
     all `(seed_index, rank_in_seed)` pairs where it appeared.
   - **RRF-across-seeds.** Score each `SourcedHit` by
     `Σ 1/(60+rank_in_seed)`. Sort descending. Keep top
     `merge_pool_size` (default 25). Rationale: per-seed
     `rerank_score` is not comparable across different queries
     ([18 §6.2 step 3](18_phase3_generation.md)).
   - **One final rerank pass.** Against a canonical rerank query =
     group's `rerank_query_ar` if declared, else
     `" | ".join(resolved_seeds)`. Exactly ONE `rerank()` call on
     the 25-candidate pool. Keep top `merged_top_k` (default 15).
     Every kept `SourcedHit` gets the authoritative `rerank_score`
     from this single pass.
   - **Pre-resolve citation tags.** For each of the 15 kept hits,
     the generation layer computes `[source_doc §locator]` using
     the fallback chain in [18 §6.6](18_phase3_generation.md).
     The tag is attached to the `SourcedHit` and will be included
     next to the chunk text in the drafter prompt.
   - **One LLM draft call** via
     `graph.generation.llm.get_draft_llm().with_structured_output(
     <sub-schema of just these two fields>)` — NOT via the shared
     `_get_llm()` (see [18 §7.3 + §11 + §18 C9](18_phase3_generation.md)).
     Returns `{situation_summary: "...", enemy_profile: "..."}` in
     Arabic with inline citation tags copied verbatim from the
     chunks.
   - **One critique call** via
     `graph.generation.llm.get_critique_llm()`. Re-draft only
     unsupported fields (second tiny call at most).
5. Assembler merges all seven field values into
   `OperationalSituation(...)` pydantic instance.
6. Renderer emits the section with the doc's numbering + formatting.

**Total LLM calls for this class: 1 draft + up to 1 critique.**
**Total rerank calls: 1 per retrieved group (not 4).**

---

## 6. Worked example — Doc 3 `MISSION_TIMELINE`

All 9 fields are `computed` or `input`. **Zero LLM calls for the
entire document.** This is why Doc 3 is M2 — fastest smoke test of
the pipeline.

```yaml
schemas:
  MISSION_TIMELINE:
    fields:
      current_date:
        kind: input
        path: timing.reporting_date_gregorian

      mission_start_time:
        kind: input
        path: timing.h_hour_gregorian

      total_available_time:
        kind: computed
        function: time_math.format_duration_hours
        arguments:
          minutes: "{{input: timing.total_available_minutes}}"

      allocated_planning_time:
        kind: computed
        function: time_math.compute_allocation
        arguments:
          total_minutes: "{{input: timing.total_available_minutes}}"
        output_field: planning_minutes_display

      available_time_for_subordinate_units:
        kind: computed
        function: time_math.compute_allocation
        arguments:
          total_minutes: "{{input: timing.total_available_minutes}}"
        output_field: subordinate_minutes_display

      time_for_mission_receipt_analysis:
        kind: computed
        function: time_math.compute_allocation
        arguments:
          total_minutes: "{{input: timing.total_available_minutes}}"
        output_field: step_1_display

      time_for_coa_development:
        kind: computed
        function: time_math.compute_allocation
        arguments:
          total_minutes: "{{input: timing.total_available_minutes}}"
        output_field: step_2_display

      time_for_coa_analysis_comparison:
        kind: computed
        function: time_math.compute_allocation
        arguments:
          total_minutes: "{{input: timing.total_available_minutes}}"
        output_field: step_3_display

      time_for_plan_order_production:
        kind: computed
        function: time_math.compute_allocation
        arguments:
          total_minutes: "{{input: timing.total_available_minutes}}"
        output_field: step_4_display
```

`time_math.compute_allocation(total_minutes)` is called once per
dispatcher run (idempotent + cached); its return is a dataclass
with all step fields. Each `output_field` picks the right attribute.

---

## 7. The `structure` block

Separate from `schemas` because the renderer walks it directly.
Each entry is one of:

```yaml
- kind: title
  text: "أمر العمليات"
  alignment: center
  underline: true

- kind: section
  schema: SchemaName          # which class this section renders
  heading:
    text: "الموقف"
    underline: true
    space_before_cm: 1.0
    space_after_cm: 0.0
  layout: numbered_fields     # see §8 for layout kinds
  citation_collection: true   # if true, pass through CitationCollector

- kind: approval_block        # renders "أقرّوا:" + signature lines
  lines:
    - "عن / قائد اللواء"
    - "رئيس الأركان"

- kind: appendices_list       # renders "الملاحق:" + annex letters cycle
  source: appendices_field    # name of the string field on Annexes schema

- kind: page_break
```

Every entry is a plain dict; renderer dispatches on `kind`.

---

## 8. Layout kinds (renderer hooks)

Each layout corresponds to a renderer function in
`arabic_docx.py`. v1 set:

| Layout | Renderer behaviour |
|---|---|
| `header_block` | `add_arabic_header` with the five header/copy/org/unit/location lines from `HeaderSection` |
| `numbered_fields` | For each field in the class, emit a level-1 heading with the field's Arabic label (from YAML `label_ar`) + the value; nested bullet points produced by `SPLITTER` if the value contains embedded numbering |
| `timeline_table` | Build a 5-column Arabic table via `add_table` from the `MISSION_TIMELINE` fields with the fixed header `["النشاط", "النسبة", "المدة", "البدء", "الانتهاء"]` |
| `staff_sections` | Doc 2 specifically: each class becomes a level-1 titled sub-section (`الاستخبارات`, `العمليات`, `الموارد البشرية`, `الإمداد`) |
| `directives_list` | Doc 4 `PLANNING_DIRECTIVES`: each field's value is split by line and emitted as level-2 bullets, one per line, each terminated with Arabic full-stop via `add_full_stop` |

New layouts are added by adding a function to `arabic_docx.py` and
a string in this table. Templates reference them by name.

---

## 9. Validation rules

`template_loader.py` validates every template against these rules
before any code runs:

- `meta.template_id` and `meta.document_slug` non-empty, slug-safe.
- Every `schemas.<X>.fields.<Y>` has a `kind` ∈
  `{static, computed, input, derived, retrieved}`.
- `static` → requires `value`.
- `computed` → requires `function` that resolves to a callable
  under `graph.generation.time_math`, and `arguments` with all
  placeholders resolvable.
- `input` → requires `path`; if `required: true`, the path must
  exist in the input JSON at runtime (validated at dispatch-time,
  not load-time).
- `derived` → requires `reference` of shape `<SchemaName>.<field>`;
  both must exist in the same template.
- `retrieved` → requires `group`, `query_seeds` (≥1),
  `prompt_ar`; `collections` may be empty (falls back to
  `meta.default_collections`); `filters` keys must be a subset of
  Phase 2's allowed filter keys (`source_doc`, `chunk_type`,
  `paragraph_number`, `paragraph_numbers`, `cross_refs`).
  `filters.source_doc` may be a scalar string or a list of strings
  (OR-match); when it is a list, the generator elides entries that
  aren't present in the collection's live inventory and drops the
  filter entirely if the intersection is empty (see
  [`18_phase3_generation.md`](18_phase3_generation.md) §6.4). Loader
  validation only checks shape and filter-key allowlisting —
  individual `source_doc` values are **not** validated against the
  live collection at load time (that is a runtime concern, so
  templates remain valid offline and across re-ingests).
  Optional `rerank_query_ar` (group-level, §2.5) — if declared on
  more than one field in the same group, all declarations must
  match verbatim (loader raises otherwise). Optional
  `merge_pool_size` (default from `PHASE3_MERGE_POOL_SIZE`) and
  `merged_top_k` (default from `PHASE3_MERGED_TOP_K`).
- Every field referenced by a `derived` entry resolves within the
  template's schema set.
- Every `structure` entry's `schema` matches an entry in `schemas`.
- No cycle in `derived` references.
- **Schema parity check (optional).** `scripts/validate_schema_parity.py`
  asserts every field name in `NewClasses.md` for a given document
  appears in the corresponding `graph/generation/schema/<doc>.py`
  module. Keeps the rename-only port target honest without
  blocking template loads.

Validation failures abort before any LLM / retrieval call. Good
errors (`"Template operation_order.yaml: field
OperationalSituation.situation_summary declares group='Foo' but
no other field uses that group — group of size 1 is allowed only
if intentional."`).

---

## 10. Porting to the health codebase

**The one-sentence claim** of this doc and
[`18_phase3_generation.md`](18_phase3_generation.md) §16 D9: porting
the generator to the user's separate health codebase requires
only (a) renaming Pydantic field names in
`graph/generation/schema/<doc>.py`, and (b) editing
`templates/<doc>.yaml` entries to match.

No Python logic changes in `field_dispatcher.py`, `time_math.py`,
`retrieval_group.py`, `section_drafter.py`, `critique.py`,
`assembler.py`, `llm.py`, or `arabic_docx.py`.

[`NewClasses.md`](../NewClasses.md) at repo root has the 1-to-1
field mapping between the doctrine-side and health-side schemas to
make this rename mechanical — but see [18 §18 C13](18_phase3_generation.md):
**`NewClasses.md` is a reference, not an implementation source**.
When porting, rename real Pydantic field names in the clean schema
modules under `graph/generation/schema/` and mirror the changes in
the YAML templates. Do not copy `NewClasses.md`'s `Field("…")`
quirks into real modules.

---

## 11. Cross-references

- Scoping doc: [`18_phase3_generation.md`](18_phase3_generation.md)
- Renderer port guide: [`19_phase3_arabic_renderer.md`](19_phase3_arabic_renderer.md)
- Phase 3 walkthrough (orientation): [`../docs/phase3_walkthrough.md`](../docs/phase3_walkthrough.md)
- Pydantic schema mirror: [`../NewClasses.md`](../NewClasses.md)
- Sample input: [`../data/phase3_inputs.example.json`](../data/phase3_inputs.example.json)
- Phase 2 `search()` contract: [`17_phase2_retrieval.md`](17_phase2_retrieval.md) §3
