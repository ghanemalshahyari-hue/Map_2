"""ui/app.py
============
Single-file Streamlit testing UI for Phase 2 retrieval.

STATUS: LOCAL DEV TOOL ONLY. Not a production HTTP surface.
  Run: streamlit run ui/app.py

WHAT THIS UI IS FOR:
  - Manually exercising search(SearchRequest) against one
    already-ingested Qdrant collection.
  - Inspecting rrf_score, rerank_score, per-retriever ranks,
    timings, expanded query text, HyDE document, and sanitized
    Qdrant request JSON (§9 of the design doc).
  - Harvesting 👍 / 👎 feedback into
    output/_eval/feedback.jsonl (§8.1) — precision@k A/B signal,
    NOT true Recall@k.

WHAT IT IS NOT FOR:
  - Gold-set evaluation — that lives in
    scripts/eval_retrieval.py (§8.2) against
    data/eval/gold_queries.jsonl, which is still to be authored.
  - Multi-collection search. v1 single-collection only; the
    picker is shaped to make multi-collection reachable without
    schema change when we're ready.

FACET SOURCING (§9 — "facet counts vs collection scans"):
  - source_doc + chunk_type dropdowns: Qdrant facet API
    (server-side aggregation, no full scan).
  - cross_refs prefix chips: bounded scroll on collection
    change, capped at a few thousand points — never per query.

DEBUG MODE:
  Default ON in this UI. Every call goes through the debug path
  (3 × query_points + rerank). Phase 3 consumers should leave
  debug off — the hot path is ~3× faster.
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# When Streamlit invokes `streamlit run ui/app.py`, it puts the
# script's parent directory (ui/) on sys.path — NOT the repo root.
# That makes `import graph` fail with ModuleNotFoundError even when
# the working directory is the repo root.  Prepending the repo root
# (parent of ui/) fixes both `streamlit run ui/app.py` and any
# `python -m ui.app` style invocation.  Matches the same idiom used
# by scripts/peek_qdrant.py and scripts/retrieval_smoke_test.py.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import streamlit as st
from dotenv import load_dotenv

# Load .env FIRST — every graph import that resolves a singleton
# assumes OPENAI_API_KEY / QDRANT_URL / etc are already in the
# environment (memory.md Rule 3).
load_dotenv()

from graph.doctrine_vocab import load_cross_ref_prefixes  # noqa: E402
from graph.retrieval.config import get_retrieval_config  # noqa: E402
from graph.retrieval.registry import (  # noqa: E402
    RegistryEntry,
    _get_client,
    list_registry_entries,
)
from graph.retrieval.schema import SearchHit, SearchRequest  # noqa: E402
from graph.retrieval.search import search  # noqa: E402


# ===========================================================================
# CONSTANTS
# ===========================================================================

CHUNK_TYPES = ["body", "table", "figure", "figure_caption", "glossary_entry"]

# Cross-ref prefix seed = data/doctrine/cross_ref_prefixes.txt — the
# SAME file the ingest-time cross_ref_extractor uses. One source of
# truth for both "what the extractor recognises" and "what chips the
# UI displays".  The "unseen-prefix" scratch file remains under
# data/eval/ because it is a runtime discovery sink, not curated
# knowledge, and lives alongside the gold-set / feedback artefacts.
DATA_EVAL_DIR = Path("data/eval")
CROSS_REF_UNSEEN_PATH = DATA_EVAL_DIR / "cross_ref_prefixes_unseen.txt"

# Observed cross-ref prefixes are discovered once per collection
# via a bounded scroll (kept small on purpose — this is a UI
# helper, not a full index).
CROSS_REF_SCROLL_LIMIT = 2000
CROSS_REF_PREFIX_LEN = 3  # e.g. ADP / ATP / FM


# ===========================================================================
# EVAL TELEMETRY
# ===========================================================================

def _append_feedback(row: dict[str, Any]) -> None:
    """Append one JSONL line to output/_eval/feedback.jsonl."""
    cfg = get_retrieval_config()
    path = Path(cfg.eval_feedback_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def _feedback_row(request: SearchRequest, hit: SearchHit, verdict: str) -> dict[str, Any]:
    """Shape matches §8.1: ts, query, collection, point_id,
    source_doc, paragraph_number, final_rank, verdict,
    request_snapshot."""
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "query": request.query,
        "collection": request.collection,
        "point_id": hit.point_id,
        "source_doc": hit.source_doc,
        "paragraph_number": hit.paragraph_number,
        "final_rank": hit.final_rank,
        "verdict": verdict,
        "request_snapshot": {
            "filters": dict(request.filters),
            "top_n_in": request.top_n_in,
            "top_k_out": request.top_k_out,
            "use_reranker": request.use_reranker,
            "use_glossary": request.use_glossary,
            "use_hyde": request.use_hyde,
        },
    }


# ===========================================================================
# FACET + SCROLL HELPERS
# ===========================================================================

@st.cache_data(ttl=300, show_spinner=False)
def _facet_values(collection: str, key: str, limit: int = 200) -> list[tuple[str, int]]:
    """Return [(value, count), ...] via the Qdrant facet API.

    Cached for 5 minutes per (collection, key). The server-side
    aggregation is cheap but the UI triggers this on every
    render; caching keeps the page fast."""
    try:
        response = _get_client().facet(
            collection_name=collection, key=key, limit=limit, exact=False
        )
    except Exception as exc:
        st.warning(f"facet({key!r}) failed on {collection!r}: {exc}")
        return []
    hits = getattr(response, "hits", None) or []
    out: list[tuple[str, int]] = []
    for h in hits:
        val = getattr(h, "value", None)
        # FacetValue can be a primitive or a typed wrapper; str() covers both.
        out.append((str(val), int(getattr(h, "count", 0))))
    return out


@st.cache_data(ttl=300, show_spinner=False)
def _cross_ref_observed_prefixes(collection: str) -> list[str]:
    """One bounded scroll per collection-change. Returns the
    sorted unique prefixes actually present in payload."""
    try:
        points, _next = _get_client().scroll(
            collection_name=collection,
            with_payload=["cross_refs"],
            with_vectors=False,
            limit=CROSS_REF_SCROLL_LIMIT,
        )
    except Exception as exc:
        st.warning(f"scroll(cross_refs) failed on {collection!r}: {exc}")
        return []
    seen: set[str] = set()
    for p in points:
        for ref in (p.payload or {}).get("cross_refs", []) or []:
            ref_str = str(ref).strip()
            if not ref_str:
                continue
            seen.add(ref_str[:CROSS_REF_PREFIX_LEN].upper())
    return sorted(seen)


def _load_seed_prefixes() -> list[str]:
    """Seed list of cross-ref prefixes = the shared doctrine file.

    Reads data/doctrine/cross_ref_prefixes.txt via
    graph.doctrine_vocab so the UI chips and the ingest-time
    extractor regex stay in lockstep.  Returns an empty list if
    the file is missing (fail-soft: the UI just shows no chips).
    """
    return load_cross_ref_prefixes()


def _append_unseen_prefixes(new_unseen: list[str]) -> None:
    if not new_unseen:
        return
    CROSS_REF_UNSEEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = set()
    if CROSS_REF_UNSEEN_PATH.is_file():
        existing = {
            line.strip()
            for line in CROSS_REF_UNSEEN_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip()
        }
    to_add = sorted(set(new_unseen) - existing)
    if not to_add:
        return
    with open(CROSS_REF_UNSEEN_PATH, "a", encoding="utf-8") as fh:
        for p in to_add:
            fh.write(p + "\n")


# ===========================================================================
# LAYOUT
# ===========================================================================

st.set_page_config(page_title="DecisionMakingSteps — dev UI", layout="wide")
st.title("DecisionMakingSteps — dev UI")

# Three tabs: (1) Phase 2 retrieval developer harness (the original UI,
# single-collection), (2) Phase 2 tiered-retrieval harness (new tab —
# exercises the production tiered code path; see ui/tiered_search_tab.py),
# (3) Phase 3 MDMP Step 1 generation (see ui/phase3_tab.py).  The sidebar
# remains the retrieval tab's collection picker / filter surface and is
# shared state across tabs (Streamlit has one sidebar per page).
_tab_retrieval, _tab_tiered, _tab_phase3 = st.tabs([
    "Phase 2 — Retrieval",
    "Phase 2 — Tiered Retrieval",
    "Phase 3 — MDMP Step 1",
])

# Render the Phase 3 tab first so its imports surface any startup errors
# before the much chattier retrieval sidebar runs.
with _tab_phase3:
    from ui.phase3_tab import render as _render_phase3_tab
    _render_phase3_tab()

with _tab_tiered:
    from ui.tiered_search_tab import render as _render_tiered_search_tab
    _render_tiered_search_tab()

# All subsequent Streamlit calls target the retrieval tab; we keep them at
# module scope (no function wrapping) so the existing layout / filter /
# feedback code stays untouched.
_tab_retrieval.__enter__()
st.caption(
    "Phase 2 retrieval dev harness.  All queries go through the debug path "
    "(3× query_points + rerank). See referencedocs/17_phase2_retrieval.md §9."
)

# -------- Sidebar: collection picker ---------------------------------------
with st.sidebar:
    st.header("Collection")
    entries: list[RegistryEntry] = list_registry_entries()
    if not entries:
        st.error(
            "No entries found in `_registry`. Either the collection has not "
            "been ingested yet, or `_registry` itself is missing. Run the "
            "Phase 1 pipeline against at least one inputs/ folder first."
        )
        st.stop()

    labels = [f"{e.slug}  ({e.collection_name})" for e in entries]
    idx = st.selectbox("Pick a collection", range(len(entries)),
                       format_func=lambda i: labels[i], index=0)
    entry = entries[idx]
    collection = entry.collection_name

    # Dual counts (§9 — manifest vs live).
    col_a, col_b = st.columns(2)
    col_a.metric("Manifest chunks", entry.manifest_chunk_count,
                 help="_registry.chunk_count — last recorded ingest metadata.")
    col_b.metric("Live points",
                 entry.live_points_count if entry.live_points_count is not None else "—",
                 help="client.get_collection(name).points_count — current reality.")
    if entry.counts_disagree:
        st.warning(
            "Manifest is behind current collection state — last ingest "
            "metadata may be stale. Search still runs against live data."
        )
    st.caption(f"Status: **{entry.status}** · embedder: `{entry.embedder_tag}` "
               f"· docling: `{entry.docling_version}`")
    st.caption(f"Source folder: `{entry.source_folder_abs}`")
    st.caption(f"Content hash: `{entry.content_hash_of_folder}`")

    # -------- Filters ------------------------------------------------------
    st.divider()
    st.header("Filters")

    source_doc_facets = _facet_values(collection, "source_doc", limit=500)
    source_doc_options = [v for v, _ in source_doc_facets]
    filter_source_doc = st.multiselect(
        "source_doc (facet)",
        options=source_doc_options,
        help="Multiselect over Qdrant facet counts (server-side).",
        format_func=lambda v: f"{v}  "
                              f"({next((c for vv, c in source_doc_facets if vv == v), 0)})",
    )

    filter_chunk_type: list[str] = []
    st.markdown("chunk_type")
    cols = st.columns(len(CHUNK_TYPES))
    for col, name in zip(cols, CHUNK_TYPES):
        if col.checkbox(name, key=f"ct_{name}"):
            filter_chunk_type.append(name)

    filter_paragraph_number = st.text_input(
        "paragraph_number (exact)",
        value="",
        help="e.g. 8-13. Leave empty to skip this filter.",
    ).strip()

    # cross_refs prefix chips (seed ∪ observed).
    seed_prefixes = _load_seed_prefixes()
    observed_prefixes = _cross_ref_observed_prefixes(collection)
    combined_prefixes = sorted(set(seed_prefixes) | set(observed_prefixes))
    _append_unseen_prefixes(sorted(set(observed_prefixes) - set(seed_prefixes)))
    st.markdown("cross_refs prefix")
    selected_prefixes = st.multiselect(
        "prefixes (seed ∪ observed)", options=combined_prefixes,
    )
    filter_cross_refs_free = st.text_input(
        "cross_refs free-text (exact)",
        value="",
        help="Exact match — e.g. 'ADP 3-0'.",
    ).strip()

    # -------- Retrieval knobs ---------------------------------------------
    st.divider()
    st.header("Retrieval")
    cfg = get_retrieval_config()
    # Default 20 (not cfg.rerank_top_n_in=50) — on CPU the cross-encoder
    # rerank is ~200ms/doc, so 50 → ~10s/query. 20 keeps quality (top-20
    # into top-8 is ample) while staying ~4× faster in the dev UI.
    top_n_in = st.slider("top_n_in", 10, 200, 20, step=5)
    top_k_out = st.slider("top_k_out", 1, 20, cfg.rerank_top_k_out, step=1)

    use_reranker = st.checkbox("use_reranker", value=True)
    use_glossary = st.checkbox("use_glossary", value=True)
    use_hyde = st.checkbox("use_hyde", value=False,
                           help="Experimental (§6.2). Adds one LLM round-trip.")
    debug = st.checkbox("debug (extra per-retriever queries + timings)",
                        value=True)

# -------- Main panel: query box --------------------------------------------
query = st.text_input("Query", value="", placeholder="What is the commander's intent?")
run = st.button("Search", type="primary")

# Pack the request.
filters: dict[str, Any] = {}
if filter_source_doc:
    filters["source_doc"] = filter_source_doc
if filter_chunk_type:
    filters["chunk_type"] = filter_chunk_type
if filter_paragraph_number:
    filters["paragraph_number"] = filter_paragraph_number
if filter_cross_refs_free:
    # Single exact cross-ref value. Prefix chips currently do not map to
    # a prefix-filter in v1 (Qdrant keyword index supports exact only);
    # they serve as UI discovery / seed-list signal. A future prefix
    # filter would need a different match type on the payload index.
    filters["cross_refs"] = filter_cross_refs_free

if run and query.strip():
    request = SearchRequest(
        query=query.strip(),
        collection=collection,
        filters=filters,
        top_n_in=top_n_in,
        top_k_out=top_k_out,
        use_reranker=use_reranker,
        use_glossary=use_glossary,
        use_hyde=use_hyde,
        debug=debug,
    )
    t0 = time.perf_counter()
    response = search(request)
    wall = (time.perf_counter() - t0) * 1000.0

    st.caption(
        f"Returned {len(response.hits)} hits in {wall:.0f} ms "
        f"(wall-clock)."
    )

    # -------- Debug drawer -----------------------------------------------
    if debug:
        with st.expander("Debug drawer", expanded=False):
            st.write("**Expanded query**")
            st.code(response.expanded_query or request.query, language="text")
            if response.hyde_document:
                st.write("**HyDE document**")
                st.code(response.hyde_document, language="text")
            if response.timings_ms:
                st.write("**Stage timings (ms)**")
                st.json(response.timings_ms)
            if response.qdrant_request_json:
                st.write("**Sanitized Qdrant request**")
                st.json(response.qdrant_request_json)
            st.write("**Request**")
            st.json({
                "query": request.query,
                "collection": request.collection,
                "filters": dict(request.filters),
                "top_n_in": request.top_n_in,
                "top_k_out": request.top_k_out,
                "use_reranker": request.use_reranker,
                "use_glossary": request.use_glossary,
                "use_hyde": request.use_hyde,
            })

    # -------- Result cards ------------------------------------------------
    for hit in response.hits:
        with st.container(border=True):
            top_row = st.columns([10, 1, 1])
            title_bits = [
                f"**#{hit.final_rank}**",
                f"`{hit.source_doc}`",
                f"page {hit.page_numbers[0]}" if hit.page_numbers else "",
                f"¶ {hit.paragraph_number}" if hit.paragraph_number else "",
                f"[{hit.chunk_type}]",
            ]
            top_row[0].markdown("  ·  ".join(b for b in title_bits if b))

            # 👍 / 👎 — reserves two narrow columns. Streamlit button keys
            # must be stable per-hit so re-renders don't clobber state.
            if top_row[1].button("👍", key=f"up_{hit.point_id}"):
                _append_feedback(_feedback_row(request, hit, "up"))
            if top_row[2].button("👎", key=f"down_{hit.point_id}"):
                _append_feedback(_feedback_row(request, hit, "down"))

            if hit.heading_path:
                st.caption(f"_{hit.heading_path}_")

            # Ranking metrics row — one st.metric per signal so the
            # scores/ranks are scannable at a glance instead of buried
            # in a thin caption. Dense/sparse rank only present when
            # debug=True (Stage B' per-retriever queries).
            m = st.columns(5)
            m[0].metric("Final", f"#{hit.final_rank}")
            m[1].metric("RRF score", f"{hit.rrf_score:.4f}")
            m[2].metric(
                "Rerank score",
                f"{hit.rerank_score:+.4f}" if hit.rerank_score is not None else "—",
            )
            m[3].metric(
                "Dense rank",
                f"#{hit.dense_rank}" if hit.dense_rank is not None else "—",
            )
            m[4].metric(
                "Sparse rank",
                f"#{hit.sparse_rank}" if hit.sparse_rank is not None else "—",
            )

            with st.expander("Text", expanded=False):
                st.write(hit.text)

            with st.expander("Raw payload", expanded=False):
                st.json({
                    "point_id": hit.point_id,
                    "source_doc": hit.source_doc,
                    "heading_path": hit.heading_path,
                    "page_numbers": hit.page_numbers,
                    "chunk_type": hit.chunk_type,
                    "chunk_index": hit.chunk_index,
                    "paragraph_number": hit.paragraph_number,
                    "paragraph_numbers": hit.paragraph_numbers,
                    "cross_refs": hit.cross_refs,
                })
elif run:
    st.warning("Enter a query first.")
else:
    st.info("Pick filters / knobs in the sidebar, enter a query, and click Search.")
