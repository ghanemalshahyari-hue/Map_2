# Tiered Retrieval Search UI — Implementation Plan

> Pick this up in a fresh Claude session and start coding directly.
> Architecture is locked; this file walks you through execution.

---

## Read order for a fresh session (do this first, in order)

1. **`CLAUDE.md`** — top-level project context. The "READ memory.md FIRST" pointer is real. Read the §C32 + §C33 changelog blocks at the top of the file — they describe the tiered-retrieval code path the UI will exercise.
2. **`docs/memory.md`** — locked decisions, Session Handoff blocks at the end (newest first: §C33 → §C32). Especially confirm the `.env` is configured for live LM Studio + Qdrant.
3. **This file (`tiered_search_ui_plan.md`)** — execution steps, file map, acceptance criteria.
4. **`tiered_retrieval_discussion.md`** §"Coverage check — how the system decides 'not detailed enough'"** — the locked plan for the coverage gate that this UI surfaces.
5. **Existing UI patterns:** [`ui/app.py`](ui/app.py) (tab dispatcher), [`ui/phase3_tab.py`](ui/phase3_tab.py) (the cleanest example of a tab module).

After those, you'll have everything you need. The new code surface is ~1 file plus 4 lines in `ui/app.py`.

---

## Goal

Add a third tab to the Streamlit dev UI that exercises the tiered-retrieval logic end-to-end — same code path as document generation — so a tester can:

- Type a free-form query and see whether the **coverage gate** classifies the operationalfiles tier as `strong` / `weak` / `empty`.
- See **whether the doctrine fallback fires**, and why.
- See **operationalfiles hits and doctrine hits separately**, with the `[O:]` / `[D:]` citation tags that document generation would emit.
- Toggle between the **6 policy enum values** to compare behaviors (`operationalfiles_only`, `doctrine_only`, `operationalfiles_then_doctrine`, `operationalfiles_and_doctrine`, `all_channels`, `source_files_only`).
- Optionally override `(τ, k, m)` coverage thresholds for tuning sweeps.

This is a **testing/tuning tool**, not a production feature. It does no caching, no cross-run state. Every search is fresh.

---

## Why a new tab (not a toggle on the existing search tab)

| option | pros | cons |
|---|---|---|
| **A. New tab** | Existing single-collection search stays clean as a baseline; no mode-switching confusion; tabs are cheap | One more tab in the UI |
| B. Toggle on existing tab | One less tab | Connection panel + filters + result rendering all need conditional logic; mode-switching bugs likely |
| C. Standalone Streamlit app | Cleanest separation | Another bring-up command; loses the shared connection panel |

**Pick A.** The user already runs `streamlit run ui/app.py` with two tabs (Phase 2 retrieval + Phase 3 generation). Adding `Phase 2 — Tiered Retrieval` as the third tab gives a clear baseline-vs-tiered comparison without code duplication.

---

## Architecture: how the UI calls the same code path as document generation

The tiered retrieval logic lives in `graph.generation.retrieval_group::retrieve_group()`. To call it from a UI tab without going through the full `assemble_document` flow:

```python
from graph.generation.retrieval_group import GroupSpec, retrieve_group
from graph.generation.schema.inputs import load_inputs

# Build a synthetic GroupSpec from the user's UI inputs.
spec = GroupSpec(
    group_name="ui_tiered_search",
    schema_name="X",
    field_names=("ui_query",),
    field_specs=(),                       # empty is fine — we don't compute cache keys
    query_seeds=(query_text,),            # the user's typed query — literal, no placeholders
    collections=of_collections,           # legacy fallback path
    filters={},
    top_k_per_query=top_k,
    merge_pool_size=pool,
    merged_top_k=keep,
    rerank_query_ar=rerank_query or None,
    tier_policy=policy_choice,
    operationalfiles_collections=of_collections,
    doctrine_collections=doctrine_collections if policy_choice != "operationalfiles_only" else (),
    source_files_field_map={},            # source_files tier not exposed in this UI
    coverage_thresholds=thresholds_dict,  # {} for env defaults, or {"tau_strong": 0.5, ...}
)

# Load any valid Phase3Inputs once — only used for placeholder resolution
# in seeds, which we don't have in free-form queries. Example file works.
inputs = load_inputs(json.loads(Path("data/phase3_inputs.example.json").read_text()))

# Run the same code path as production.
result = retrieve_group(spec, inputs, use_glossary=glossary_toggle)
```

**Why this is safe:**

- `resolve_seeds` strips seeds with unresolved `{foo}` placeholders. User free-form queries have none → seed passes through untouched.
- `field_specs=()` is OK because we don't compute cache keys here. `_prompt_ar_concat_hash` is the only thing that touches `field_specs`, and we won't go near `compute_group_cache_key`.
- The `inputs` parameter is only used by `resolve_seeds`. Any valid `Phase3Inputs` instance works.

---

## File map

```
ui/
├── app.py                    ← edit (~4 lines: register the third tab)
├── phase3_tab.py             ← read for the pattern (don't edit)
└── tiered_search_tab.py      ← NEW (~250 lines)
```

No changes to `graph/`, no changes to YAML, no changes to `.env`. Pure UI work.

---

## Implementation phases

### Phase 1 — minimal tab skeleton

**Files:**
- `ui/tiered_search_tab.py` — NEW. Exposes `render() -> None`.
- `ui/app.py` — add `from ui.tiered_search_tab import render as render_tiered_search` and the third tab in the `st.tabs([...])` call.

**UI surface:**
- Heading "Tiered Retrieval Search"
- Single text input for the query
- "Run search" button
- Empty result region

**Acceptance:** tab loads cleanly, button click triggers a stub function that prints "TODO" to the page.

### Phase 2 — wire up `retrieve_group`

**Adds to `tiered_search_tab.py`:**
- `_load_inputs()` cached via `@st.cache_resource` — loads `data/phase3_inputs.example.json` once.
- `_build_spec(query, policy, of_cols, doc_cols, ...) -> GroupSpec`
- `_run_search(spec)` — calls `retrieve_group(spec, inputs)`, returns `GroupRetrievalResult`.
- `_render_result(result)` — for v0 just `st.write(result.hits[:5])`.

**Acceptance:** type a query, see hits returned. Console-log the coverage verdict (we'll surface it in Phase 3).

### Phase 3 — surface the tier verdict + fallback decision

**Adds:**
- Coverage verdict computed inline (calls `coverage_verdict(operationalfiles_hits_only, τ, k, m)`).
- "Did doctrine fallback fire?" — derived from policy + verdict.
- Color-coded banner at top of result section: 🟢 strong / 🟡 weak / 🔴 empty.

**Note:** `retrieve_group` already runs the coverage gate internally, but doesn't expose the verdict on `GroupRetrievalResult`. Two options:
1. **Re-compute the verdict in the UI** from the operationalfiles-tagged hits in `result.hits` — works but is slightly redundant.
2. **Extend `GroupRetrievalResult`** to carry the verdict — cleaner but changes the public dataclass.

Recommend option 1 for the UI tool. Option 2 is a separate small refactor that document generation could also benefit from (current §C32 changelog notes "What's gated until later" but doesn't promise this).

```python
from graph.generation.coverage import coverage_verdict, resolve_thresholds_for_group

of_hits = [sh for sh in result.hits if sh.tier == "operationalfiles"]
τ, k, m = resolve_thresholds_for_group(thresholds_override or None)
verdict = coverage_verdict(of_hits, tau_strong=τ, k_strong=k, m_docs=m)
fallback_fired = (policy == "operationalfiles_then_doctrine" and verdict in ("weak", "empty"))
```

**Acceptance:** type a query that should be strong (e.g. "MDMP staff duties") → green banner, no fallback. Type a query that should be weak (e.g. "ambush ambush ambush") → yellow/red banner, fallback fired.

### Phase 4 — render hits grouped by tier

**Adds:**
- Two expandable sections: "Operationalfiles tier" and "Doctrine tier".
- Each section: a `st.dataframe` with columns `[rank, source_doc, locator, rerank_score, tier_tag, text_preview]`.
- Show `result.canonical_rerank_query` and `result.resolved_seeds` in a footer expander.

**Acceptance:** hits visually grouped, citation tags `[O: ...]` / `[D: ...]` visible, easy to scan.

### Phase 5 — controls for testing/tuning

**Adds these inputs to the form:**
- Policy dropdown — 6 enum values (default `operationalfiles_then_doctrine`).
- Optional rerank-query override (Arabic text).
- Top-k / merge-pool-size / merged-top-k number inputs (defaults from `.env`).
- Glossary toggle (use_glossary, default True).
- Coverage threshold overrides — three number inputs (τ, k, m) with placeholder hints showing env defaults.

**Acceptance:** flipping policy from `operationalfiles_then_doctrine` → `doctrine_only` removes operationalfiles hits; → `all_channels` fans out both unconditionally regardless of verdict.

### Phase 6 — bonus: side-by-side comparison

**Adds:**
- "Compare with single-collection search" expander.
- Calls Phase 2's `search()` against operationalfiles only with the same query, displays beside the tiered result.
- Useful for confirming "tiered with strong verdict ≈ single-collection operationalfiles" in shape.

**Optional.** Defer if Phases 1–5 already give enough signal.

---

## Acceptance criteria (final)

A user opening the Streamlit UI should be able to:

1. **Click `Phase 2 — Tiered Retrieval` tab.**
2. **Type a query like "إنتاج التقارير في مرحلة التخطيط"** → see operationalfiles hits with `[O:]` tags, green-banner verdict, no doctrine hits (because operationalfiles is strong for this query).
3. **Type a query like "اشتباك في كمين ليلي بمنطقة جبلية"** (something operationalfiles is weak for) → see weak/empty verdict, yellow/red banner, doctrine fan-out fired with `[D:]`-tagged hits visible.
4. **Switch policy to `doctrine_only`** → see only doctrine hits, banner says "operationalfiles tier skipped (policy)".
5. **Switch policy to `all_channels`** → see both tiers populated regardless of verdict.
6. **Tweak `τ_strong` from 0.30 → 0.05** → see verdict flip from `weak` to `strong` for a borderline query.

---

## Pitfalls / Don'ts

- **Don't bypass `retrieve_group`** with a hand-rolled tiered search inside the UI. The whole point of this tool is to verify the production code path. Re-implementing the logic in the UI defeats the purpose and will drift over time.
- **Don't pass real per-doc `extracted_values` or `field_map`** — this UI is for retrieval only, not source-files evidence. Leave `source_files_field_map={}` on the synthetic GroupSpec.
- **Don't compute or read `GroupCacheKey`** in this tab. No caching. Every query is fresh.
- **Don't add a "rebuild Qdrant" button** or any destructive operation. Read-only retrieval only.
- **Don't change `GroupSpec` to make UI work easier.** If a field needs to be optional in the dataclass, make it optional in the right way (default value with documented semantics). Don't remove fields the document-generation code path depends on.
- **Don't catch `ValueError` from `retrieve_group` silently.** When every seed gets dropped (e.g. user types a string that contains an unresolved `{...}` placeholder by accident), surface the error clearly so the user knows their query was malformed.
- **Don't promote this tab into a "production search UI."** Production search is the existing Phase 2 tab against a single collection. This tab is dev-only — useful for testing/tuning the tiered logic.

---

## Pre-flight checklist (before starting Phase 1)

```bash
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate

# 1. Services up
colima start ; docker start qdrant
curl -s http://localhost:6333/readyz   # all shards ready
curl -s http://localhost:1234/v1/models # gemma + bge-m3 visible

# 2. Both tier collections populated
python -c "
from qdrant_client import QdrantClient
c = QdrantClient('localhost', port=6333)
for col in c.get_collections().collections:
    info = c.get_collection(col.name)
    print(f'  {col.name}: {info.points_count} points')
"
# Expect: ingest__operationalfiles__bgem3 = 2398, ingest__doctrine__bgem3 = 11207

# 3. Tiered architecture passes offline
python scripts/tiered_retrieval_smoke.py   # 45/45 PASS
python -m graph.generation.template_loader  # 6/6 OK

# 4. Existing Streamlit UI works (so we know the regression baseline)
streamlit run ui/app.py
# → click Phase 2 - Retrieval tab, search "MDMP", see hits
# → click Phase 3 - MDMP Step 1 tab, see the four-doc generation form
```

If any of these fail, fix the environment before touching code.

---

## Estimated effort

- Phase 1 (skeleton): 10 min
- Phase 2 (wire-up): 20 min
- Phase 3 (verdict): 15 min
- Phase 4 (tier grouping): 20 min
- Phase 5 (controls): 30 min
- Phase 6 (compare-with-single, optional): 20 min

**Total: ~1.5–2 hours** for a clean tab including light styling. The first useful tier-aware search (verdict + tagged hits) lands at end of Phase 4 (~65 min in).

---

## After it lands

Update `CLAUDE.md` with a §C34 changelog block describing the new tab:
- New tab `Phase 2 — Tiered Retrieval` in [`ui/app.py`](ui/app.py)
- New module [`ui/tiered_search_tab.py`](ui/tiered_search_tab.py)
- Calls `graph.generation.retrieval_group::retrieve_group()` directly (same code path as document generation)
- Read-only; no caching, no destructive ops; dev-only tool for testing/tuning the tiered fallback logic

Update `docs/memory.md` Session Handoff with a §C34 block.

Commit with `phase3: §C34 — tiered retrieval search UI tab`.

---

## Things known to be tricky

- **Streamlit re-runs on every interaction.** Keep `_load_inputs()` cached via `@st.cache_resource`. Don't accidentally reload `data/phase3_inputs.example.json` on every keystroke.
- **Coverage verdict requires only operationalfiles hits.** When `policy=doctrine_only`, there are no operationalfiles hits to verdict over — the verdict is `n/a`. Display "operationalfiles tier skipped (policy)" instead of "empty" to avoid confusion.
- **`retrieve_group` raises `ValueError` when every seed is dropped** (placeholder unresolved). For free-form queries this should never happen, but a paranoid `try/except ValueError as e: st.error(...)` is good citizenship.
- **Reranker outage.** `graph/retrieval/search.py` already catches `RerankUnavailable` and degrades to RRF-only. The UI doesn't need to re-handle it, but show a small note when `result.hits[0].rerank_score is None` ("rerank unavailable; ranking by RRF only").
- **Glossary expansion** is on by default in `retrieve_group` (`use_glossary=True`). Expose the toggle so the user can compare expanded vs raw query behavior.

---

## Sample query menu (for the "Try one of these" expander, optional)

Pre-populate a list of test queries that exercise different verdicts:

| query | expected verdict | expected fallback |
|---|---|---|
| `إنتاج التقارير في مرحلة التخطيط` | strong (op) | no |
| `MDMP staff coordination` | strong (op) | no |
| `air defense suppression doctrine` | weak (op) | yes — doctrine has FM-3-01 |
| `signal support troop leading` | weak (op) | yes — doctrine has FM-6-02 |
| `gibberish xyz123` | empty | yes (or no hits at all) |

This makes the tool genuinely useful for non-developer testers.

---

**Locked plan:** `tiered_retrieval_discussion.md` (the original feature)
**Project context:** `docs/memory.md`
**Top-level rules:** `CLAUDE.md`

Good luck. The code surface is small, the test cases are clear, and you have a working `retrieve_group` to call into.
