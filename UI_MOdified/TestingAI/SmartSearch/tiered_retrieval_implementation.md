# Tiered Retrieval — Implementation Handoff

> Pick this up in a fresh Claude session and start coding directly.
> Architecture is locked; this file walks you through execution phase by phase.

---

## Read order for a fresh session (do this first, in order)

1. **`CLAUDE.md`** — top-level project context. The "READ memory.md FIRST" pointer is real.
2. **`docs/memory.md`** — locked decisions, pinned versions, Session Handoff block at the end. Read the **2026-04-24 §C26 provider-routing block** especially — every LLM/embedder/reranker construction must go through `build_chat_llm()` / `graph/shared/embedders.py` / `graph/retrieval/rerank.py`.
3. **`tiered_retrieval_discussion.md`** — **the locked plan for this feature**. Naming, flow, policies, drafter rules, critique rules, citation gating, phase order. Don't relitigate.
4. **This file (`tiered_retrieval_implementation.md`)** — execution steps, pre-flight checks, per-phase deliverables, acceptance commands.

After those four, you'll know enough to execute. The relevant code surface is ~10 files in `graph/generation/` plus 6 YAML templates plus `.env`.

---

## Locked summary (no need to re-read the whole plan to remember the gist)

**Three evidence channels:**
- `source_files` — uploaded WARNO + intel report (existing extractor path; unchanged)
- `operationalfiles` — current Qdrant collection (renamed in Phase 0 from `ingest__doctrine__bgem3` → `ingest__operationalfiles__bgem3`)
- `doctrine` — future backend reference library (no-op until ingested)

**Default flow:** operationalfiles searched first → coverage check (rerank score, pool size, source diversity) → if weak/empty, doctrine fans out as fallback. `source_files` channel is independent, populated whenever YAML maps it in.

**Default policy:** `operationalfiles_then_doctrine`. Six total: `source_files_only`, `operationalfiles_only`, `doctrine_only`, `operationalfiles_then_doctrine`, `operationalfiles_and_doctrine`, `all_channels`.

**Citation tags:** new `[S:]/[O:]/[D:]` format gated by YAML opt-in. Legacy `collections:` key keeps emitting today's untagged tags. Both shapes coexist during transition.

**Critique rule (typed evidence):** mission-specific entities require source_files OR operationalfiles support; doctrine vouches for definitions/procedures/concepts. Sentence fails when claim type doesn't match available evidence channel.

**8 phases total: Phase 0 (physical rename) + Phases 1–7 (feature build).** Each independently mergeable. Tiering "turns on" only at Phase 7.

---

## Pre-flight checklist (run before Phase 0 or any later phase)

```bash
# 1. Working directory + venv
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate

# 2. Qdrant up
colima start
docker start qdrant
curl -s http://localhost:6333/readyz   # expect: "all shards are ready"

# 3. LM Studio up (per locked .env)
curl -s http://localhost:1234/v1/models | head   # expect: gemma + bge-m3 model ids

# 4. Confirm env resolves
python -m graph.shared.llm_factory          # expect: Responses API ON, LM Studio endpoint
python -m graph.shared.embedders probe "test"  # expect: 1024-dim vector

# 5. Confirm current state of templates
python -m graph.generation.template_loader   # expect: 6/6 templates OK
python scripts/smoke_y_schemas.py           # expect: 4/4 OK

# 6. Confirm current generation works
ls /Users/hextechkraken/Desktop/NewOutputs/  # last successful run lives here
```

If any of those fail, stop and fix the environment before touching code. Don't try to debug provider-routing issues inside the tiered-retrieval code path — they'll mask everything else.

---

## Phase 0 — physical rename of operationalfiles corpus

**Purpose:** Free up the `doctrine` slug for the future reference library. Align YAML/code/citation tier names with the physical Qdrant collection name.

### Step-by-step

```bash
# 0.1 — Establish a baseline run BEFORE anything changes (so you can diff later)
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/phase0_baseline
# Save the *.fields.json files for diffing later. Don't compare .docx bytes (not deterministic).

# 0.2 — Rename the input folder
mv inputs/doctrine inputs/operationalfiles

# 0.3 — Re-ingest. Caches should hit on every per-doc artefact (sha256 unchanged).
python main.py
# Expected wall-clock: ~5–15 minutes (mostly Qdrant upsert).
# Expected log lines: "stage:cached" for each of initialpages_convert, convert_document,
#                      chunk_document, enrich_chunks, embed_chunks per doc.
# Expected new collection: ingest__operationalfiles__bgem3
# Expected old collection: ingest__doctrine__bgem3 (still present, will delete later)

# 0.4 — Parity check
python scripts/peek_qdrant.py ingest__operationalfiles__bgem3
# Expected total: 2398 points
#   FM-5-0      = 1145
#   FM-6-0      = 678
#   ADP-5-0     = 342
#   ADP-2-0     = 233   (forced-OCR path per §C19; should match)
python scripts/peek_qdrant.py ingest__doctrine__bgem3   # same numbers from old collection
# If counts differ between old and new collections, STOP and investigate.

# 0.5 — Update YAML references. Six files:
#   prompts/time_analysis/template.yaml
#   prompts/initial_planning_guidance/template.yaml
#   prompts/staff_brief/template.yaml
#   prompts/warning_order/template.yaml
#   templates/operation_order.yaml
#   templates/staff_estimate.yaml
# Find/replace: ingest__doctrine__bgem3 → ingest__operationalfiles__bgem3
grep -rn "ingest__doctrine__bgem3" prompts/ templates/

# 0.6 — Confirm templates still validate
python -m graph.generation.template_loader   # expect: 6/6 templates OK

# 0.7 — Smoke retrieval against new collection
python scripts/retrieval_smoke_test.py
# All 8 checks must pass. The harness auto-discovers via _registry.

# 0.8 — End-to-end smoke
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/phase0_post_rename

# 0.9 — Diff resolved fields against baseline
diff -q /tmp/phase0_baseline/time_analysis.fields.json /tmp/phase0_post_rename/time_analysis.fields.json
diff -q /tmp/phase0_baseline/initial_planning_guidance.fields.json /tmp/phase0_post_rename/initial_planning_guidance.fields.json
diff -q /tmp/phase0_baseline/staff_brief.fields.json /tmp/phase0_post_rename/staff_brief.fields.json
diff -q /tmp/phase0_baseline/warning_order.fields.json /tmp/phase0_post_rename/warning_order.fields.json
# Expected: identical files. Different files = STOP, investigate.
# (LLM nondeterminism may cause tiny variation in retrieved-field paragraph drafts even with cache;
#  if you see drift only in retrieved fields and source_file_extracted fields are identical, it's
#  acceptable — but document what changed.)

# 0.10 — Delete old collection (only after 0.9 passes)
python -c "from qdrant_client import QdrantClient; c = QdrantClient('localhost', port=6333); c.delete_collection('ingest__doctrine__bgem3'); print('deleted')"

# 0.11 — Remove the old collection from _registry
# (Optional — _registry will skip stale entries, but cleaning up keeps things tidy.)
# Check what _registry contains:
python -c "from qdrant_client import QdrantClient; c = QdrantClient('localhost', port=6333); print([p.payload for p in c.scroll('_registry', limit=20)[0]])"
# If you see a stale ingest__doctrine__bgem3 entry, delete by filter.

# 0.12 — Commit
git add inputs/operationalfiles prompts/ templates/
git rm -r inputs/doctrine
git commit -m "phase0: rename inputs/doctrine → inputs/operationalfiles + update YAML

Frees the 'doctrine' slug for the future reference library (tiered retrieval plan).
Re-ingest produces ingest__operationalfiles__bgem3; old collection deleted.
Resolved fields verified identical against pre-rename baseline.

See tiered_retrieval_discussion.md for the locked plan and rationale."
```

### Acceptance criteria

- New collection `ingest__operationalfiles__bgem3` exists with 2398 points (counts match the old collection per-source).
- Old collection `ingest__doctrine__bgem3` deleted.
- All 6 YAML templates updated; `template_loader` validates.
- `retrieval_smoke_test.py` passes 8/8 checks.
- End-to-end generation produces same resolved fields as pre-rename baseline.
- Commit lands cleanly.

### NOT in scope for Phase 0

- Renaming `data/doctrine/` (termbase) or `graph/doctrine_vocab.py`. They describe doctrinal-vocabulary content (acronyms, classification markings), not tier role. Keep names.
- Touching any code in `graph/generation/`. Phase 0 is YAML + folder rename + Qdrant collection rename only.

### After Phase 0 lands

- Update **`CLAUDE.md`** top-of-file status block: note that the operationalfiles tier physical name is now `ingest__operationalfiles__bgem3` (rename done in Phase 0 of tiered retrieval).
- Update **`docs/memory.md`** Session Handoff block at the end to reflect Phase 0 completion + leave a "next: Phase 1 of tiered retrieval" pointer.
- The doctrine slug is now free. Any future doctrine-library ingestion can use `inputs/doctrine/` → `ingest__doctrine__bgem3`.

---

## Phases 1–7 — feature build

**Source of truth for design:** `tiered_retrieval_discussion.md`. Don't re-derive; read.

Below is the execution checklist per phase: files to create/edit, acceptance commands, expected behavior. Phases must land in order (3+4 must ship together).

### Phase 1 — hoist source_files extraction above retrieval, conditionally

**Files to edit:**
- `graph/generation/assembler.py` — reorder so `extract_for_document()` runs before `run_retrieval_phase()` when needed; thread `extracted_values` into the retrieval phase as a new kwarg
- (Add a helper) `_template_has_source_evidence_consumers(template)` that returns False until Phase 7 introduces tier-policy YAML

**Files to create:** none

**Behavior:** unchanged. Extraction order changes for templates that need it; pure-retrieval templates skip extraction.

**Acceptance:**
```bash
python -m graph.generation.template_loader            # 6/6 OK
python scripts/smoke_y_schemas.py                    # 4/4 OK
python scripts/generate_documents.py [...] --out /tmp/phase1_smoke
diff /tmp/phase0_post_rename/*.fields.json /tmp/phase1_smoke/*.fields.json   # identical
```

Add an instrumentation test that asserts `extract_for_document` is called before the first `search()` invocation when extraction runs at all.

### Phase 2 — add `FactSnippet` and `EvidenceBundle`

**Files to create:**
- `graph/generation/evidence.py` — three frozen dataclasses + a builder function

**Files to edit:** none

**Type sketch (do not over-engineer):**
```python
@dataclass(frozen=True)
class FactSnippet:
    field_name: str
    text: str
    source_file_kind: str
    source_file_sha256: str

@dataclass(frozen=True)
class EvidenceBundle:
    source_files_evidence: tuple[FactSnippet, ...]
    operationalfiles_evidence: tuple[SourcedHit, ...]
    doctrine_evidence: tuple[SourcedHit, ...]
    coverage_verdict: Literal["strong", "weak", "empty", "n/a"]
    tiers_consulted: tuple[Literal["source_files","operationalfiles","doctrine"], ...]
    provenance: dict[str, Any]   # holds source_evidence_sha256, source_files_sha256_pairs, etc.

def build_evidence_bundle(group_result, extracted_values, field_map): ...
```

`SourcedHit.tier` becomes `Literal["operationalfiles", "doctrine"]` with default `"operationalfiles"` (additive — existing call sites keep current semantics).

**Acceptance:**
```bash
python -m graph.generation.evidence   # standalone smoke; build a bundle from synthetic inputs
```

Nothing consumes the new types yet.

### Phase 3 — drafter consumes `EvidenceBundle`

**Files to edit:**
- `graph/generation/section_drafter.py` — accept `EvidenceBundle`, emit up to three labelled prompt blocks, lock typed-evidence drafting rules in the system prompt
- (Possibly) a small adapter at the boundary that builds an empty-channels bundle from today's `GroupRetrievalResult` + `extracted_values={}` so the call sites don't all need to change at once

**Phase invariant:** until Phase 7 lands, `source_files_evidence` and `doctrine_evidence` are always empty for legacy templates → drafter renders only the operationalfiles block → output unchanged.

**Acceptance:**
- Resolved fields and citations match Phase 1 baseline (`diff` the `.fields.json` files).
- Unit test: synthetic bundle with all three channels populated produces a prompt with exactly the three labelled headers; FactSnippet text never appears inside the operationalfiles or doctrine blocks.

### Phase 4 — critique consumes `EvidenceBundle` with typed-evidence rule

**MUST SHIP TOGETHER WITH PHASE 3.** Do not merge Phase 3 without Phase 4 in the same commit / PR.

**Files to edit:**
- `graph/generation/critique.py` — replace `_format_chunks(retrieval)` with `_format_evidence(bundle)`; update system prompt with typed-evidence faithfulness rule

**Acceptance:**
- Synthetic test: draft with mission entity supported only by operationalfiles → passes; entity supported only by doctrine → fails; entity supported nowhere → fails; doctrinal claim supported by doctrine → passes.

### Phase 5 — extend `GroupCacheKey` with source_files provenance

**Files to edit:**
- `graph/generation/cache.py` — add `source_evidence_sha256`, `source_files_sha256_pairs`, plus the v5-listed tier-policy/collections/coverage-threshold tags. Document canonicalization rule (sorted keys, NFC, stable JSON) in the module docstring.

**Acceptance:**
- Edit one byte in `data/phase3_prompt_2.example.txt`, re-run, observe affected groups rebuild and unaffected groups hit cache.
- Toggle `LLM_BASE_URL` in `.env`, re-run, observe full cache rebuild (matches §C26 provenance discipline).

### Phase 6 — renderer learns both tag formats and conditional sub-heading layout

**Files to edit:**
- `graph/generation/renderers/arabic_docx.py` — extend `collect_citations()` to walk `EvidenceBundle.source_files_evidence` + `operationalfiles_evidence` + `doctrine_evidence`. Parser handles both `[<source_doc> §<locator>]` and `[S/O/D: ...]` shapes. Endnote layout: three sub-headings (uploaded sources / operationalfiles / doctrine references), each hidden when its channel is empty. Mixed templates render the three-sub-heading layout; pure-legacy templates render exactly as today.
- `graph/generation/retrieval_group.py::build_citation_tag` — emit prefixed tags when the group's resolved policy comes from a tier-aware YAML key; emit untagged tags otherwise.

**Files to edit (contract):**
- `graph/generation/assembler.py` — pass `evidence_bundles` into `GeneratedDocument` (additive field; renderer falls back to `retrieval_results` for paths that haven't been migrated).

**Acceptance:**
- Render fixtures with each combination of channels populated; sub-headings appear/hide correctly.
- Both tag formats parse correctly; existing untagged citations still render.
- Pure-legacy template (no tier-aware YAML keys) produces same resolved fields, same citations, same rendered behavior as Phase 5 output.

### Phase 7 — YAML tier policies go live

**Files to edit:**
- `graph/generation/template_loader.py` — accept new optional keys: `policy`, `operationalfiles_collections`, `doctrine_collections`, `source_files_field_map`, `coverage_thresholds`. Loader infers `policy=operationalfiles_only` when no tier-aware key is declared and treats `collections:` as the operationalfiles target.
- `graph/generation/retrieval_group.py` — add `coverage_check`, conditional doctrine fan-out, three-channel evidence bundle assembly.
- (Possibly create) `graph/generation/coverage.py` — pure arithmetic coverage check returning `Literal["strong","weak","empty"]`.
- `.env.example` — document new optional knobs (defaults below).
- `_template_has_source_evidence_consumers(template)` from Phase 1 now returns True when any group has tier-aware keys → extraction gate widens to fire when needed.

**New `.env` knobs (all optional, all have defaults):**
```
PHASE3_DEFAULT_TIER_POLICY=operationalfiles_then_doctrine
PHASE3_COVERAGE_TAU_STRONG=0.30
PHASE3_COVERAGE_K_STRONG=8
PHASE3_COVERAGE_M_DOCS=2
PHASE3_TIERED_RETRIEVAL=1   # kill-switch: 0 = behave like Phase 6
```

**Acceptance:**
- Six policy fixtures, one per policy enum value; coverage gate fires doctrine fallback correctly when operationalfiles weak.
- Legacy YAML back-compat preserved — existing templates produce same resolved fields.
- Typed-evidence lint catches doctrine-only-supported entities.
- Doctrine collection unreachable still produces output (RerankUnavailable-style isolation, falls back gracefully).
- Kill-switch round-trip: `PHASE3_TIERED_RETRIEVAL=0` reproduces Phase 6 behavior byte-for-byte (functionally; not literal byte-equality on .docx).

---

## Things to NOT do (load-bearing don'ts)

- **Don't bypass `build_chat_llm()`.** Every `ChatOpenAI` construction goes through the factory (locked §C26).
- **Don't instantiate `TextEmbedding` / `TextCrossEncoder` directly** outside `graph/shared/embedders.py` / `graph/retrieval/rerank.py`.
- **Don't hard-fail retrieval on rerank outage.** The `RerankUnavailable`-catch in `graph/retrieval/search.py` is load-bearing.
- **Don't rename `data/doctrine/` or `graph/doctrine_vocab.py`.** They're doctrinal-vocabulary tooling, not tier-specific.
- **Don't change `search(SearchRequest)` or any Phase 1/2 code.** Tiered retrieval is Phase-3-only.
- **Don't touch `source_file_extracted` field-kind dispatch.** It's the right answer for verbatim extraction; the new tier is a separate path consumed only by `retrieved`-kind groups.
- **Don't rename the YAML `collections:` key.** Additive new keys only.
- **Don't ship Phase 3 without Phase 4** (or vice versa). Drafter and critique must see the same evidence.
- **Don't claim byte-identical .docx output.** Use "same resolved fields, same citations, same rendered behavior" in tests and commit messages.
- **Don't emit `[S:]/[O:]/[D:]` citation tags before tier policies are declared in YAML.** Gated by opt-in, not by phase.
- **Don't let doctrine vouch for mission-specific entities** in critique. Typed-evidence rule is locked.

---

## After each phase: docs to update

| phase | updates required |
|---|---|
| 0 | `CLAUDE.md` top status block + `docs/memory.md` Session Handoff |
| 1–7 | Append a §C-numbered changelog block to `CLAUDE.md` (matches the existing §C25 / §C26 pattern); update `docs/memory.md` Session Handoff at the bottom |
| 7 (final) | Append a "Tiered Retrieval — implemented" row to the Locked Design Decisions table in `docs/memory.md`; update the project status line on the top of `CLAUDE.md` and `docs/memory.md` to reflect tiered retrieval being live |

Don't update mid-phase. Keep the docs consistent with what's actually merged.

---

## Things known to be tricky

- **Cache canonicalization** of Arabic strings. Decide the rule once, document in `cache.py` docstring, never deviate. Recommend: `json.dumps(d, sort_keys=True, ensure_ascii=False)` → `unicodedata.normalize("NFC", s).encode("utf-8")` → `hashlib.sha256(...).hexdigest()`. Test with a string containing `ـ` (kashida), `ٌ` (tanwin damma), and a presentation-form letter to confirm normalization.
- **Coverage threshold tuning.** Defaults are guesses. Once Phase 7 lands, run a few real templates with both strong and weak operationalfiles seeds; measure how often the gate fires fallback. Tune toward false-positive fallback (over-fires) rather than false-negative (under-fires).
- **The `_template_has_source_evidence_consumers` gate.** Returns False through Phase 6 (no tier-aware YAML exists yet). Returns True in Phase 7 when any group declares `policy:` / `source_files_field_map:` / `operationalfiles_collections:` / `doctrine_collections:`. Wire this carefully; getting it wrong means extraction either always-runs (cost) or never-runs (broken source_files channel).
- **Renderer migration to `evidence_bundles`.** Today renderer walks `generated.retrieval_results`. Phase 6 adds `evidence_bundles` as a parallel field on `GeneratedDocument`. Renderer prefers `evidence_bundles` when present; falls back to `retrieval_results` otherwise. Keeps any unmigrated path working during the transition.
- **Doctrine library being a no-op.** Until that corpus is ingested, `doctrine_collections: [...]` declarations should produce a runtime warning (loader checks `_registry` for the named collection at template-load time) but not a hard error — templates can be authored before the library exists.

---

## Quick reference: file map

```
graph/generation/
├── evidence.py                ← NEW (Phase 2)
├── assembler.py               ← edit (Phase 1, Phase 6)
├── retrieval_group.py         ← edit (Phase 6 build_citation_tag, Phase 7 coverage + doctrine fan-out)
├── coverage.py                ← NEW (Phase 7, optional split from retrieval_group)
├── section_drafter.py         ← edit (Phase 3)
├── critique.py                ← edit (Phase 4)
├── cache.py                   ← edit (Phase 5)
├── template_loader.py         ← edit (Phase 7)
└── renderers/arabic_docx.py   ← edit (Phase 6)

prompts/<doc>/template.yaml    ← edit (Phase 0 only — collection rename)
                                  Phase 7 OPTIONAL — opt into tier-aware keys
templates/{operation_order,staff_estimate}.yaml
                               ← edit (Phase 0 only — collection rename)

inputs/doctrine/  →  inputs/operationalfiles/   (Phase 0)
.env / .env.example            ← edit (Phase 7 — new knobs)
```

---

## End-to-end smoke template (use after each phase)

```bash
python scripts/generate_documents.py \
    --warning-order data/phase3_prompt_2.example.txt \
    --intel-report  data/phase3_prompt_3.example.txt \
    --source-file   other=data/phase3_prompt_1.example.txt \
    --docs time_analysis initial_planning_guidance staff_brief warning_order \
    --out /tmp/phase<N>_smoke

# Compare resolved fields against the previous phase's smoke output
for f in time_analysis initial_planning_guidance staff_brief warning_order; do
    diff -q /tmp/phase<N-1>_smoke/${f}.fields.json /tmp/phase<N>_smoke/${f}.fields.json
done
# Identical = behavior preserved (good for Phases 0–6).
# Phase 7 expects diffs ONLY for templates that declared tier-aware keys.
```

---

## When you finish Phase 7

1. Run the full v1 smoke (4 docs) — passes.
2. Add a smoke test for tiered retrieval: `scripts/tiered_retrieval_smoke.py` covering the six policies + coverage gate.
3. Update `docs/memory.md` Locked Design Decisions table.
4. Update `CLAUDE.md` top status block.
5. Commit with a clear changelog block referencing this implementation file and `tiered_retrieval_discussion.md`.

Then this feature is done. Future doctrine-library ingestion is a separate, smaller piece of work (`inputs/doctrine/` is now free; ingest, register in `_registry`, list in YAML, fallback flow goes live).

---

**Locked plan:** `tiered_retrieval_discussion.md`
**Project context:** `docs/memory.md`
**Top-level rules:** `CLAUDE.md`

Good luck. The architecture is sound, the order is safe, the don'ts are real.
