"""ui/tiered_search_tab.py
============================
Streamlit tab for tiered-retrieval search (§C34, 2026-04-28).

DEV TOOL ONLY.  Drives ``graph.generation.retrieval_group::retrieve_group()``
directly with a free-form query so a tester can observe the production
tiered-retrieval code path in isolation:

  - coverage verdict on the operationalfiles tier (strong / weak / empty)
  - whether the doctrine fallback fires under the chosen policy
  - operationalfiles vs doctrine hits side by side, with [O:] / [D:] tags
  - all six policy enum values and (τ, k, m) threshold overrides

This is NOT a production search surface — read-only retrieval, no
caching, every search fresh.  See ``tiered_search_ui_plan.md``.
"""
from __future__ import annotations

import json
import re
import time
import traceback
from pathlib import Path

import streamlit as st


_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_INPUTS_PATH = _REPO_ROOT / "data" / "phase3_inputs.example.json"

# Default tier collections.  These names match the ones populated by
# the Phase 1 ingest under §C28 (operationalfiles) and §C32 (doctrine
# reference library).  Kept as constants here — Phase 5 will let the
# user override per-search.
_DEFAULT_OF_COLLECTIONS = ("ingest__operationalfiles__bgem3",)
_DEFAULT_DOCTRINE_COLLECTIONS = ("ingest__doctrine__bgem3",)
_DEFAULT_POLICY = "operationalfiles_then_doctrine"

# Six locked policy enum values from §C31 Phase 7.  Order picked for
# the dropdown — most-used first.
_POLICY_CHOICES = (
    "operationalfiles_then_doctrine",
    "operationalfiles_only",
    "operationalfiles_and_doctrine",
    "all_channels",
    "doctrine_only",
    "source_files_only",
)

# Sample queries seeded into a "Try one of these" expander — picked
# from tiered_search_ui_plan.md §"Sample query menu".
_SAMPLE_QUERIES = (
    ("إنتاج التقارير في مرحلة التخطيط",     "expected: strong (op), no fallback"),
    ("MDMP staff coordination",                 "expected: strong (op), no fallback"),
    ("air defense suppression doctrine",        "expected: weak (op), fallback to FM-3-01"),
    ("signal support troop leading",            "expected: weak (op), fallback to FM-6-02"),
    ("gibberish xyz123",                         "expected: empty / no hits"),
)


# ---------------------------------------------------------------- helpers

@st.cache_resource(show_spinner=False)
def _load_inputs():
    """Load ``data/phase3_inputs.example.json`` once per Streamlit
    session.  ``Phase3Inputs`` is only consumed by ``resolve_seeds``
    inside ``retrieve_group`` to interpolate ``{a.b}`` placeholders;
    free-form UI queries have no placeholders, so any valid instance
    works.  Cached as a resource (not data) because Pydantic models
    aren't hashable in the way ``@st.cache_data`` expects.
    """
    from graph.generation.schema.inputs import load_inputs as _load
    raw = json.loads(_DEFAULT_INPUTS_PATH.read_text(encoding="utf-8"))
    return _load(raw)


def _build_spec(
    query: str,
    *,
    policy: str,
    of_collections: tuple[str, ...],
    doctrine_collections: tuple[str, ...],
    rerank_query: str | None = None,
    top_k_per_query: int | None = None,
    merge_pool_size: int | None = None,
    merged_top_k: int | None = None,
    coverage_thresholds: dict | None = None,
):
    """Build a synthetic :class:`GroupSpec` from one free-form query.

    The spec mirrors what :func:`collect_group_specs` would build for
    a one-field, one-seed YAML group — except ``field_specs`` is left
    empty because no consumer in this UI hits the cache-key path.
    """
    from graph.generation.retrieval_group import (
        GroupSpec,
        _DEFAULT_MERGE_POOL_SIZE,
        _DEFAULT_MERGED_TOP_K,
        _DEFAULT_TOP_K_PER_QUERY,
    )

    # Legacy ``collections`` field is the operationalfiles set so the
    # policy=``operationalfiles_only`` fast-path also works without
    # any change to the spec.
    return GroupSpec(
        group_name="ui_tiered_search",
        schema_name="UiQuery",
        field_names=("ui_query",),
        field_specs=(),
        query_seeds=(query,),
        collections=tuple(of_collections),
        filters={},
        top_k_per_query=top_k_per_query or _DEFAULT_TOP_K_PER_QUERY,
        merge_pool_size=merge_pool_size or _DEFAULT_MERGE_POOL_SIZE,
        merged_top_k=merged_top_k or _DEFAULT_MERGED_TOP_K,
        rerank_query_ar=rerank_query or None,
        tier_policy=policy,
        operationalfiles_collections=tuple(of_collections),
        doctrine_collections=tuple(doctrine_collections),
        source_files_field_map={},
        coverage_thresholds=coverage_thresholds or {},
    )


def _run_search(spec, *, use_glossary: bool):
    """Call the production code path; return ``(result, wall_ms)``.

    Caller is responsible for catching ``ValueError`` (every seed
    dropped) and any retrieval exception.  We don't swallow them
    here — the UI needs to render a clear error.
    """
    from graph.generation.retrieval_group import retrieve_group
    inputs = _load_inputs()
    t0 = time.perf_counter()
    result = retrieve_group(spec, inputs, use_glossary=use_glossary)
    return result, (time.perf_counter() - t0) * 1000.0


_POLICY_OF_TIERS_RUN = {
    "operationalfiles_only",
    "operationalfiles_then_doctrine",
    "operationalfiles_and_doctrine",
    "all_channels",
}
_POLICY_DOCTRINE_UNCONDITIONAL = {
    "doctrine_only",
    "operationalfiles_and_doctrine",
    "all_channels",
}


def _verdict_banner(verdict: str, policy: str, fallback_fired: bool) -> None:
    """Top-of-results banner — colour-coded by verdict."""
    if verdict == "n/a":
        st.info(
            f"Operationalfiles tier skipped by policy `{policy}`.  "
            "No coverage verdict to compute."
        )
        return
    label_by = {
        "strong": ("🟢 STRONG", st.success),
        "weak":   ("🟡 WEAK",   st.warning),
        "empty":  ("🔴 EMPTY",  st.error),
    }
    label, banner = label_by[verdict]
    bits = [
        f"Operationalfiles tier verdict: **{label}**",
        f"policy: `{policy}`",
    ]
    if policy == "operationalfiles_then_doctrine":
        bits.append(
            "doctrine fallback **fired**" if fallback_fired
            else "doctrine fallback **skipped** (operationalfiles strong)"
        )
    elif policy in _POLICY_DOCTRINE_UNCONDITIONAL:
        bits.append("doctrine fan-out **unconditional**")
    elif policy == "operationalfiles_only":
        bits.append("doctrine tier disabled by policy")
    banner(" · ".join(bits))


def _hits_to_rows(hits) -> list[dict]:
    """Common shape for the per-tier dataframes."""
    rows: list[dict] = []
    for rank, sh in enumerate(hits, start=1):
        locator = (
            sh.hit.paragraph_number
            or (str(sh.hit.page_numbers[0]) if sh.hit.page_numbers else "")
        )
        rows.append({
            "rank": rank,
            "source_doc": sh.hit.source_doc,
            "locator": locator,
            "rerank": (
                f"{sh.rerank_score:+.4f}"
                if sh.rerank_score is not None else "—"
            ),
            "tag": sh.citation_tag,
            "preview": sh.hit.text.replace("\n", " ")[:160],
        })
    return rows


def _render_tier_section(
    label: str,
    hits,
    *,
    empty_note: str,
    expanded: bool,
) -> None:
    with st.expander(f"{label} — {len(hits)} hits", expanded=expanded):
        if not hits:
            st.caption(empty_note)
            return
        st.dataframe(
            _hits_to_rows(hits),
            use_container_width=True,
            hide_index=True,
        )


# ---------------------------------------------------------------- shared-anchor view

# Doc-id prefixes the cross_ref_extractor recognises (per
# data/doctrine/cross_ref_prefixes.txt).  Used by _normalize_doc_id
# to strip trailing descriptive filename slugs.
_DOC_PREFIXES = ("fm", "adp", "atp", "jp", "ar", "da", "tc")


def _normalize_doc_id(value: str) -> str:
    """Reduce a source_doc filename or a cross_ref string to a
    canonical key for cross-tier matching.

    Examples::

        "FM-3-01-Air-and-Missile-Defense.pdf"   →  "fm-3-01"
        "FM 3-01"                                →  "fm-3-01"
        "ADP_3-0_Operations.pdf"                 →  "adp-3-0"

    The cross_ref_extractor (Phase 1, ingest time) emits short forms
    like ``"FM 3-01"``; ``source_doc`` is the on-disk filename.  This
    helper makes them comparable.  Returns "" when nothing
    recognisable is found.
    """
    if not value:
        return ""
    s = value.lower().strip()
    s = re.sub(r"\.pdf$", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    parts = s.split("-")
    if not parts or parts[0] not in _DOC_PREFIXES:
        return ""
    out = [parts[0]]
    for p in parts[1:]:
        # Doc number components are digits, optionally trailed by a
        # letter (e.g. "fm-3-90-1", "atp-3-21-8").  Stop at the first
        # all-alphabetic part — that's the descriptive title slug.
        if re.match(r"^\d+[a-z]?$", p):
            out.append(p)
        else:
            break
    if len(out) < 2:  # need at least prefix + one number to be useful
        return ""
    return "-".join(out)


def _collect_shared_anchors(of_hits, doc_hits):
    """Return a dict ``{(kind, anchor): {"of": [...], "d": [...]}}``
    grouping hits across tiers that share an anchor.

    Three anchor types — strongest first:
      * ``"of_cites_d"``     — an OF hit's ``cross_refs`` includes the
                               doctrine hit's ``source_doc`` (or vice
                               versa).  Direct citation chain.
      * ``"shared_xref"``    — both hits' ``cross_refs`` lists contain
                               the same upstream doc.  Likely
                               discussing the same concept.
      * ``"shared_para"``    — both hits carry the same
                               ``paragraph_number``.  Weakest signal,
                               often coincidental, included for
                               completeness.
    """
    groups: dict[tuple[str, str], dict[str, list]] = {}

    of_norm: list[tuple[str, set[str]]] = []
    for sh in of_hits:
        of_norm.append((
            _normalize_doc_id(sh.hit.source_doc),
            {n for n in (_normalize_doc_id(x) for x in (sh.hit.cross_refs or [])) if n},
        ))
    d_norm: list[tuple[str, set[str]]] = []
    for sh in doc_hits:
        d_norm.append((
            _normalize_doc_id(sh.hit.source_doc),
            {n for n in (_normalize_doc_id(x) for x in (sh.hit.cross_refs or [])) if n},
        ))

    def _add(kind: str, anchor: str, side: str, hit) -> None:
        bucket = groups.setdefault((kind, anchor), {"of": [], "d": []})
        if hit not in bucket[side]:
            bucket[side].append(hit)

    # of_cites_d: OF hit's cross_refs includes a doctrine hit's source_doc
    for of_hit, (_, of_xrefs) in zip(of_hits, of_norm):
        for d_hit, (d_doc_id, _) in zip(doc_hits, d_norm):
            if d_doc_id and d_doc_id in of_xrefs:
                _add("of_cites_d", d_doc_id, "of", of_hit)
                _add("of_cites_d", d_doc_id, "d", d_hit)

    # d_cites_of: doctrine hit's cross_refs includes an OF hit's source_doc
    # (rolls up under the same of_cites_d kind for display simplicity)
    for of_hit, (of_doc_id, _) in zip(of_hits, of_norm):
        for d_hit, (_, d_xrefs) in zip(doc_hits, d_norm):
            if of_doc_id and of_doc_id in d_xrefs:
                _add("of_cites_d", of_doc_id, "of", of_hit)
                _add("of_cites_d", of_doc_id, "d", d_hit)

    # shared_xref: same upstream doc cited by chunks in both tiers
    for of_hit, (_, of_xrefs) in zip(of_hits, of_norm):
        for d_hit, (_, d_xrefs) in zip(doc_hits, d_norm):
            for shared in of_xrefs & d_xrefs:
                _add("shared_xref", shared, "of", of_hit)
                _add("shared_xref", shared, "d", d_hit)

    # shared_para: identical paragraph_number across tiers
    for of_hit in of_hits:
        of_para = of_hit.hit.paragraph_number
        if not of_para:
            continue
        for d_hit in doc_hits:
            if d_hit.hit.paragraph_number == of_para:
                _add("shared_para", of_para, "of", of_hit)
                _add("shared_para", of_para, "d", d_hit)

    return groups


_ANCHOR_KIND_LABEL = {
    "of_cites_d":  "📌 direct citation",
    "shared_xref": "🔗 shared cross-ref",
    "shared_para": "§ shared paragraph",
}
_ANCHOR_KIND_ORDER = ("of_cites_d", "shared_xref", "shared_para")


def _render_anchor_hit(sh, tier_label: str) -> None:
    locator = (
        sh.hit.paragraph_number
        or (str(sh.hit.page_numbers[0]) if sh.hit.page_numbers else "")
    )
    score = (
        f"{sh.rerank_score:+.4f}"
        if sh.rerank_score is not None else "—"
    )
    preview = sh.hit.text.replace("\n", " ")[:200]
    st.markdown(
        f"**{tier_label}** `{sh.hit.source_doc}` "
        f"§{locator or '—'}  ·  rerank `{score}`"
    )
    st.caption(preview)


# ---------------------------------------------------------------- LLM synthesis view

# Cap on chunk text length per hit when assembling the synthesizer
# prompt — keeps the combined prompt comfortably inside Gemma's
# context window even with 16 hits in play.
_SYNTH_PER_HIT_CHARS = 600

_SYNTH_SYSTEM = (
    "You are a doctrine analyst.  Given a free-form QUERY and a set "
    "of retrieved chunks split into two tiers — OPERATIONAL FILES "
    "(mission-specific facts and staff procedures) and DOCTRINE "
    "LIBRARY (broad tactical / operational doctrine) — write a "
    "3-5 sentence synthesis that explains how the evidence answers "
    "the query.  Strict rules:\n"
    "  * Cite every claim INLINE with its [O: ...] or [D: ...] tag, "
    "exactly as supplied below.\n"
    "  * Explicitly call out where the two tiers AGREE, where they "
    "COMPLEMENT each other, or where DOCTRINE FILLS A GAP that the "
    "operational files do not cover.\n"
    "  * If a tier is empty, say so plainly.\n"
    "  * Do NOT invent facts that are not present in the chunks.  "
    "Do NOT output JSON, markdown headings, or bullet points — just "
    "prose paragraphs.\n"
)


def _format_evidence_block(label: str, hits) -> str:
    if not hits:
        return f"[{label}]\n(no hits returned for this tier)\n"
    out = [f"[{label}]"]
    for sh in hits:
        locator = (
            sh.hit.paragraph_number
            or (str(sh.hit.page_numbers[0]) if sh.hit.page_numbers else "")
        )
        # Fall back to a synthesised tag if the hit somehow lost its
        # citation_tag — keeps the LLM able to cite every chunk.
        tag = sh.citation_tag or (
            f"[{label[0]}: {sh.hit.source_doc} §{locator or '—'}]"
        )
        text = sh.hit.text.replace("\n", " ").strip()[:_SYNTH_PER_HIT_CHARS]
        out.append(f"\n{tag}\n{text}")
    return "\n".join(out)


def _synthesize_evidence(query: str, of_hits, doc_hits) -> tuple[str, str, str]:
    """One Responses-API call summarising the combined evidence.

    Returns ``(prose, model, system_plus_user)`` so the caller can
    render the answer alongside the exact prompt the LLM saw.
    """
    from graph.shared.responses_client import (
        ResponsesInvocationError,
        invoke_text,
    )

    of_block = _format_evidence_block("OPERATIONAL FILES", of_hits)
    d_block = _format_evidence_block("DOCTRINE LIBRARY", doc_hits)
    user = (
        f"QUERY: {query}\n\n"
        f"{of_block}\n\n{d_block}\n\n"
        "Now write the 3-5 sentence synthesis."
    )

    # max_output_tokens=2048: Gemma is a reasoning model that consumed
    # ~1000 reasoning tokens in the smoke run.  A tight cap (e.g. 512)
    # starves the visible answer of budget; an absent cap loses the
    # defensive ceiling other project call sites maintain.  2048 leaves
    # Gemma comfortable headroom (~1000 reasoning + ~500 prose + slack)
    # while protecting a future cloud-OpenAI endpoint flip from a
    # runaway generation.  The "3-5 sentences" rule in the system
    # prompt is the real length governor.
    try:
        result = invoke_text(
            role_env=None,           # use global LLM_MODEL
            default_model="gpt-4o-mini",
            temperature=0.0,
            system=_SYNTH_SYSTEM,
            user=user,
            max_output_tokens=2048,
        )
    except ResponsesInvocationError as exc:
        raise RuntimeError(
            f"LLM synthesis failed: {exc}"
        ) from exc

    return result.text.strip(), result.diagnostics.model, user


def _render_synthesis_view(query: str, of_hits, doc_hits) -> None:
    """Opt-in expander — runs one LM Studio call to synthesise prose."""
    from graph.shared.llm_factory import resolved_endpoint_tag

    with st.expander("🧪 Synthesised answer (one LLM call)", expanded=True):
        st.caption(
            "Sends the combined hits to the configured LLM endpoint "
            f"(`{resolved_endpoint_tag()}`) with a prompt asking for a "
            "3-5 sentence prose summary citing `[O:]` / `[D:]` tags.  "
            "Costs one round-trip (~3-5 s on local Gemma).  Not a "
            "faithful trace of the production §C30 drafter — useful "
            "as a preview only."
        )
        if not of_hits and not doc_hits:
            st.info("No hits to synthesise.")
            return
        with st.spinner("Synthesising…"):
            try:
                t0 = time.perf_counter()
                prose, model, prompt_text = _synthesize_evidence(
                    query, of_hits, doc_hits
                )
                ms = (time.perf_counter() - t0) * 1000.0
            except Exception as exc:  # noqa: BLE001
                st.error(f"Synthesis failed: {exc}")
                with st.expander("Traceback", expanded=False):
                    st.code(traceback.format_exc(), language="text")
                return
        st.caption(f"Generated in {ms:.0f} ms · model: `{model}`")
        st.markdown(prose)
        with st.expander("Prompt sent to LLM", expanded=False):
            st.code(prompt_text, language="text")


def _render_shared_anchor_view(of_hits, doc_hits) -> None:
    """Render the deterministic cross-tier anchor expander."""
    if not of_hits or not doc_hits:
        return  # nothing to bridge — only one tier returned hits

    groups = _collect_shared_anchors(of_hits, doc_hits)
    n_groups = len(groups)
    label = (
        f"🪢 Shared anchors across tiers — "
        f"{n_groups} {'relationship' if n_groups == 1 else 'relationships'}"
        if n_groups else
        "🪢 Shared anchors across tiers — none found"
    )

    with st.expander(label, expanded=bool(n_groups)):
        st.caption(
            "Pure payload arithmetic — no LLM call.  "
            "Pairs hits across tiers when they cite the same upstream "
            "doc (`📌 direct citation`), share a cross_ref "
            "(`🔗 shared cross-ref`), or share a paragraph_number "
            "(`§ shared paragraph`).  Sparse signal — empty when the "
            "two tiers don't reference each other."
        )
        if not groups:
            st.info(
                "No anchor overlaps detected.  "
                "The two tiers returned hits but they don't cite the "
                "same doctrine, share cross-refs, or share paragraph "
                "numbers — likely discussing related-but-distinct "
                "facets of the query."
            )
            return

        # Sort by anchor kind (strongest first), then by anchor value.
        sorted_keys = sorted(
            groups.keys(),
            key=lambda k: (_ANCHOR_KIND_ORDER.index(k[0]), k[1]),
        )
        for (kind, anchor) in sorted_keys:
            bucket = groups[(kind, anchor)]
            kind_label = _ANCHOR_KIND_LABEL[kind]
            st.markdown(
                f"---\n##### {kind_label} · anchor `{anchor.upper()}`  "
                f"({len(bucket['of'])} OF · {len(bucket['d'])} doctrine)"
            )
            for sh in bucket["of"]:
                _render_anchor_hit(sh, "[O]")
            for sh in bucket["d"]:
                _render_anchor_hit(sh, "[D]")


def _render_result_v0(
    result,
    wall_ms: float,
    *,
    policy: str,
    coverage_thresholds: dict | None = None,
    query: str = "",
    synthesize: bool = False,
) -> None:
    """Render verdict banner, per-tier metrics, and tier-grouped hits."""
    from graph.generation.coverage import (
        coverage_verdict,
        resolve_thresholds_for_group,
    )

    of_hits = [sh for sh in result.hits if sh.tier == "operationalfiles"]
    doc_hits = [sh for sh in result.hits if sh.tier == "doctrine"]

    tau, k_strong, m_docs = resolve_thresholds_for_group(
        coverage_thresholds or None
    )
    if policy in _POLICY_OF_TIERS_RUN:
        verdict = coverage_verdict(
            of_hits, tau_strong=tau, k_strong=k_strong, m_docs=m_docs
        )
    else:
        verdict = "n/a"

    fallback_fired = (
        policy == "operationalfiles_then_doctrine"
        and verdict in ("weak", "empty")
    )

    _verdict_banner(verdict, policy, fallback_fired)

    cols = st.columns(4)
    cols[0].metric("Total hits", len(result.hits))
    cols[1].metric("Operationalfiles", len(of_hits))
    cols[2].metric("Doctrine", len(doc_hits))
    cols[3].metric("Wall (ms)", f"{wall_ms:.0f}")

    st.caption(
        f"Coverage thresholds: `τ={tau}` `k={k_strong}` `m_docs={m_docs}` · "
        f"top OF rerank: "
        f"`{max((h.rerank_score or 0.0) for h in of_hits):+.4f}`"
        if of_hits else
        f"Coverage thresholds: `τ={tau}` `k={k_strong}` `m_docs={m_docs}` · "
        f"no operationalfiles hits"
    )

    # Reranker degradation note — covered transparently by
    # graph/retrieval/search.py (RerankUnavailable → RRF-only).
    if result.hits and all(sh.rerank_score is None for sh in result.hits):
        st.warning(
            "Rerank scores absent on every hit — reranker may be "
            "unavailable; ranking by RRF only."
        )

    if not result.hits:
        st.info("Zero hits returned.")
    else:
        # Operationalfiles first when run; doctrine next.  Expand the
        # tier most likely to interest the tester.
        of_expanded = policy != "doctrine_only"
        doc_expanded = (
            policy in _POLICY_DOCTRINE_UNCONDITIONAL or fallback_fired
        )
        if policy != "doctrine_only":
            _render_tier_section(
                "Operationalfiles tier  [O:]",
                of_hits,
                empty_note=(
                    "No operationalfiles hits.  "
                    "(Tier was run but every fan-out came back empty.)"
                ),
                expanded=of_expanded,
            )
        else:
            st.caption("Operationalfiles tier skipped by policy `doctrine_only`.")

        _render_tier_section(
            "Doctrine tier  [D:]",
            doc_hits,
            empty_note=(
                "No doctrine hits.  "
                "(Either the tier wasn't fanned out under this policy, "
                "or the doctrine collection returned nothing.)"
            ),
            expanded=doc_expanded,
        )

        _render_shared_anchor_view(of_hits, doc_hits)

        if synthesize:
            _render_synthesis_view(query, of_hits, doc_hits)

    with st.expander("Run details", expanded=False):
        st.write("**Resolved seeds**")
        st.json(list(result.resolved_seeds))
        if result.dropped_seeds:
            st.write("**Dropped seeds (placeholders unresolved)**")
            st.json(list(result.dropped_seeds))
        st.write("**Canonical rerank query**")
        st.code(result.canonical_rerank_query, language="text")
        if result.allowlist_elided:
            st.write("**source_doc allowlist elided**")
            st.json(list(result.allowlist_elided))
        st.write("**GroupSpec (synthetic)**")
        st.json({
            "policy": result.group.tier_policy,
            "operationalfiles_collections": list(
                result.group.operationalfiles_collections
            ),
            "doctrine_collections": list(result.group.doctrine_collections),
            "top_k_per_query": result.group.top_k_per_query,
            "merge_pool_size": result.group.merge_pool_size,
            "merged_top_k": result.group.merged_top_k,
            "rerank_query_ar": result.group.rerank_query_ar,
            "coverage_thresholds": dict(result.group.coverage_thresholds),
        })


# ---------------------------------------------------------------- entry point

def _comma_split(value: str, fallback: tuple[str, ...]) -> tuple[str, ...]:
    parts = tuple(p.strip() for p in (value or "").split(",") if p.strip())
    return parts or fallback


def render() -> None:
    """Entry point — call from inside ``with st.tabs(...)[i]:``."""
    from graph.generation.coverage import resolve_thresholds_for_group
    from graph.generation.retrieval_group import (
        _DEFAULT_MERGE_POOL_SIZE,
        _DEFAULT_MERGED_TOP_K,
        _DEFAULT_TOP_K_PER_QUERY,
    )

    st.header("Tiered Retrieval Search")
    st.caption(
        "Dev harness for the tiered-retrieval code path.  Calls "
        "`graph.generation.retrieval_group.retrieve_group()` directly — "
        "same code path as document generation."
    )

    with st.expander("Try one of these queries", expanded=False):
        for q, note in _SAMPLE_QUERIES:
            st.code(q, language="text")
            st.caption(note)

    query = st.text_input(
        "Query",
        value="",
        placeholder="e.g. إنتاج التقارير في مرحلة التخطيط",
        key="tiered_query",
    )

    # ─── Knobs row 1: policy + collections ────────────────────────────
    c1, c2 = st.columns([1, 2])
    policy = c1.selectbox(
        "Policy",
        options=_POLICY_CHOICES,
        index=_POLICY_CHOICES.index(_DEFAULT_POLICY),
        help=(
            "Tier-routing policy.  `operationalfiles_then_doctrine` is "
            "the locked default — operationalfiles fans out first, "
            "doctrine fires only when the coverage gate says weak/empty."
        ),
        key="tiered_policy",
    )
    of_text = c2.text_input(
        "Operationalfiles collections (comma-separated)",
        value=",".join(_DEFAULT_OF_COLLECTIONS),
        key="tiered_of_collections",
    )

    # ─── Knobs row 2: doctrine collections + rerank query override ────
    c3, c4 = st.columns([2, 2])
    doc_text = c3.text_input(
        "Doctrine collections (comma-separated)",
        value=",".join(_DEFAULT_DOCTRINE_COLLECTIONS),
        key="tiered_doc_collections",
    )
    rerank_query = c4.text_input(
        "Rerank-query override (optional)",
        value="",
        placeholder="defaults to '|'-joined seeds",
        key="tiered_rerank_query",
    )

    # ─── Knobs row 3: top-k / pool sizes ──────────────────────────────
    tau_default, k_default, m_default = resolve_thresholds_for_group(None)
    c5, c6, c7, c8 = st.columns(4)
    top_k_per_query = c5.number_input(
        "top_k_per_query",
        min_value=1, max_value=100,
        value=_DEFAULT_TOP_K_PER_QUERY, step=1,
        key="tiered_top_k_per_query",
    )
    merge_pool_size = c6.number_input(
        "merge_pool_size",
        min_value=1, max_value=200,
        value=_DEFAULT_MERGE_POOL_SIZE, step=1,
        key="tiered_merge_pool_size",
    )
    merged_top_k = c7.number_input(
        "merged_top_k",
        min_value=1, max_value=100,
        value=_DEFAULT_MERGED_TOP_K, step=1,
        key="tiered_merged_top_k",
    )
    use_glossary = c8.checkbox(
        "use_glossary",
        value=True,
        key="tiered_use_glossary",
        help="Acronym glossary expansion before fan-out.",
    )

    # ─── Knobs row 4: coverage threshold overrides ────────────────────
    c9, c10, c11 = st.columns(3)
    tau_override = c9.text_input(
        f"τ_strong (default {tau_default})",
        value="",
        placeholder=str(tau_default),
        key="tiered_tau",
    )
    k_override = c10.text_input(
        f"k_strong (default {k_default})",
        value="",
        placeholder=str(k_default),
        key="tiered_k_strong",
    )
    m_override = c11.text_input(
        f"m_docs (default {m_default})",
        value="",
        placeholder=str(m_default),
        key="tiered_m_docs",
    )

    run_col, syn_col = st.columns([1, 3])
    run = run_col.button("Run search", type="primary", key="tiered_run")
    synthesize = syn_col.checkbox(
        "🧪 Synthesise answer with one LLM call (~3-5 s extra)",
        value=False,
        key="tiered_synthesize",
        help=(
            "After search completes, send the combined hits to the "
            "configured LLM endpoint with a prompt asking for a 3-5 "
            "sentence prose summary citing [O:] / [D:] tags.  Useful "
            "preview of how the production drafter weaves the two "
            "tiers together; not a faithful trace of the §C30 drafter."
        ),
    )

    if not run:
        st.info(
            "Type a query, optionally tweak the knobs above, then click "
            "Run search.  No caching — every search is fresh."
        )
        return

    if not query.strip():
        st.warning("Enter a query first.")
        return

    coverage_overrides: dict = {}
    if tau_override.strip():
        try:
            coverage_overrides["tau_strong"] = float(tau_override.strip())
        except ValueError:
            st.warning(f"τ_strong override `{tau_override}` not a float; using default.")
    if k_override.strip():
        try:
            coverage_overrides["k_strong"] = int(k_override.strip())
        except ValueError:
            st.warning(f"k_strong override `{k_override}` not an int; using default.")
    if m_override.strip():
        try:
            coverage_overrides["m_docs"] = int(m_override.strip())
        except ValueError:
            st.warning(f"m_docs override `{m_override}` not an int; using default.")

    of_collections = _comma_split(of_text, _DEFAULT_OF_COLLECTIONS)
    doc_collections = _comma_split(doc_text, _DEFAULT_DOCTRINE_COLLECTIONS)

    spec = _build_spec(
        query.strip(),
        policy=policy,
        of_collections=of_collections,
        doctrine_collections=doc_collections,
        rerank_query=rerank_query.strip() or None,
        top_k_per_query=int(top_k_per_query),
        merge_pool_size=int(merge_pool_size),
        merged_top_k=int(merged_top_k),
        coverage_thresholds=coverage_overrides,
    )

    try:
        result, wall_ms = _run_search(spec, use_glossary=bool(use_glossary))
    except ValueError as exc:
        # Every seed dropped — for a free-form query this should be
        # impossible, but surface it instead of swallowing.
        st.error(f"Query rejected: {exc}")
        return
    except Exception as exc:  # noqa: BLE001 — UI wants a visible trace
        st.error(f"Retrieval failed: {exc}")
        with st.expander("Traceback", expanded=False):
            st.code(traceback.format_exc(), language="text")
        return

    _render_result_v0(
        result,
        wall_ms,
        policy=policy,
        coverage_thresholds=coverage_overrides,
        query=query.strip(),
        synthesize=bool(synthesize),
    )

    # ─── Phase 6 — side-by-side compare with single-collection search ──
    with st.expander(
        "Compare with single-collection search (Phase 2 baseline)",
        expanded=False,
    ):
        st.caption(
            "Runs `graph.retrieval.search.search()` against the first "
            "operationalfiles collection only — same code path the "
            "existing `Phase 2 — Retrieval` tab uses.  Useful for "
            "confirming the tiered fast-path matches the baseline when "
            "policy is `operationalfiles_only`."
        )
        compare_collection = of_collections[0] if of_collections else None
        if not compare_collection:
            st.info("No operationalfiles collection configured for the comparison.")
        elif st.button("Run baseline search", key="tiered_compare_btn"):
            from graph.retrieval.schema import SearchRequest
            from graph.retrieval.search import search as _baseline_search

            baseline_request = SearchRequest(
                query=query.strip(),
                collection=compare_collection,
                filters={},
                top_n_in=int(merge_pool_size),
                top_k_out=int(merged_top_k),
                use_reranker=True,
                use_glossary=bool(use_glossary),
                use_hyde=False,
                debug=False,
            )
            try:
                t0 = time.perf_counter()
                baseline_response = _baseline_search(baseline_request)
                baseline_wall = (time.perf_counter() - t0) * 1000.0
            except Exception as exc:  # noqa: BLE001
                st.error(f"Baseline search failed: {exc}")
                return
            st.caption(
                f"Baseline returned {len(baseline_response.hits)} hits "
                f"in {baseline_wall:.0f} ms against `{compare_collection}`."
            )
            if not baseline_response.hits:
                st.info("Baseline returned zero hits.")
                return
            rows = []
            for hit in baseline_response.hits:
                locator = (
                    hit.paragraph_number
                    or (str(hit.page_numbers[0]) if hit.page_numbers else "")
                )
                rows.append({
                    "rank": hit.final_rank,
                    "source_doc": hit.source_doc,
                    "locator": locator,
                    "rerank": (
                        f"{hit.rerank_score:+.4f}"
                        if hit.rerank_score is not None else "—"
                    ),
                    "preview": hit.text.replace("\n", " ")[:160],
                })
            st.dataframe(rows, use_container_width=True, hide_index=True)
