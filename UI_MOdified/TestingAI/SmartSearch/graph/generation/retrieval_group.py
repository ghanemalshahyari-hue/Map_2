"""graph/generation/retrieval_group.py — fan-out + merge for Phase 3.

Implements the per-group retrieval flow locked in scoping §6.2
(RRF-across-seeds + single final rerank). One call per group, one
SourcedHit pool out, one canonical rerank pass. LLM lives in
:mod:`section_drafter` — this module is retrieval-only.

Pipeline per group:

    1.  Resolve query seeds against Phase3Inputs. Seeds with
        unresolved placeholders are dropped (not passed as literal
        ``{foo}``).
    2.  Intersect the YAML ``filters.source_doc`` allowlist with
        the collection's live facet; elide missing manuals
        (§6.4 missing-manual elision). Drop the filter entirely
        when the intersection is empty, logging the fallback.
    3.  Fan-out: for each resolved seed × each declared collection,
        call ``graph.retrieval.search.search`` with
        ``use_reranker=False``. The per-call rerank score would not
        be cross-seed-comparable — we want rank positions only.
    4.  Wrap every ``SearchHit`` in :class:`SourcedHit` so the
        originating collection is preserved for provenance, cache
        keying, and citation endnotes (§18 C15).
    5.  Dedupe by ``point_id``; first occurrence wins for hit
        content, but the dedup dict also collects every
        ``(seed_index, rank_in_seed)`` tuple the point appeared at.
    6.  Compute ``rrf_merge = Σ 1 / (60 + rank_in_seed)`` across
        seeds. Sort desc, keep top ``merge_pool_size`` (default 25).
    7.  Rerank the merged pool ONCE against
        ``group.rerank_query_ar`` if declared, else
        ``" | ".join(resolved_seeds)``. Keep top ``merged_top_k``.
        Every kept hit gets its authoritative ``rerank_score`` from
        this single pass.
    8.  Pre-resolve each kept hit's ``[source_doc §locator]`` tag
        per the §6.6 fallback chain. Attach to the SourcedHit so the
        drafter copies it verbatim.

Exposed entry point: :func:`retrieve_group`. Standalone runnable
for debug:

    python -m graph.generation.retrieval_group \\
        templates/operation_order.yaml OperationalSituation \\
        data/phase3_inputs.example.json
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Literal

from pydantic import BaseModel

from graph.generation.schema.inputs import Phase3Inputs
from graph.generation.template_loader import RetrievedField, Template
from graph.retrieval.rerank import rerank
from graph.retrieval.schema import SearchHit, SearchRequest, SearchResponse
from graph.retrieval.search import search

__all__ = [
    "SourcedHit",
    "GroupSpec",
    "GroupRetrievalResult",
    "collect_group_specs",
    "resolve_seeds",
    "retrieve_group",
    "build_citation_tag",
]


# ------------------------------------------------------------- defaults

_DEFAULT_TOP_K_PER_QUERY = int(os.getenv("PHASE3_TOP_K_PER_QUERY", "8"))
_DEFAULT_MERGE_POOL_SIZE = int(os.getenv("PHASE3_MERGE_POOL_SIZE", "25"))
_DEFAULT_MERGED_TOP_K = int(os.getenv("PHASE3_MERGED_TOP_K", "15"))
_RRF_K = 60  # standard RRF constant


# ------------------------------------------------------------- data types

@dataclass(frozen=True)
class SourcedHit:
    """A Phase-2 SearchHit with originating collection + Phase-3
    metadata (§18 C15).

    ``occurrences`` is the list of ``(seed_index, rank_in_seed)``
    pairs this point appeared at during fan-out — drives the RRF
    score. ``rerank_score`` is populated by the single final rerank
    pass (§6.2 step 4); per-call scores from Stage C of Phase 2
    are never stored here because they are not cross-seed-comparable.
    ``citation_tag`` is pre-resolved per §6.6 before the drafter
    sees the chunk.

    ``tier`` (added in tiered-retrieval Phase 2 — §C29) labels which
    evidence channel this hit belongs to so the drafter, critique,
    and renderer can apply tier-aware rules without re-deriving the
    tier from collection name. Default is ``"operationalfiles"`` so
    every existing call site keeps its current semantics; the tiered
    fan-out in Phase 7 stamps the alternative ``"doctrine"`` value.
    """

    hit: SearchHit
    collection: str
    occurrences: tuple[tuple[int, int], ...] = ()
    rerank_score: float | None = None
    citation_tag: str = ""
    tier: Literal["operationalfiles", "doctrine"] = "operationalfiles"

    @property
    def rrf_merge_score(self) -> float:
        """Σ 1/(k + rank_in_seed) across every occurrence."""
        return sum(1.0 / (_RRF_K + r) for _, r in self.occurrences)


@dataclass(frozen=True)
class GroupSpec:
    """Everything the dispatcher needs to know about a retrieval group.

    A group is one Pydantic class worth of retrieved fields that
    share retrieval context. The YAML allows multiple fields to
    declare the same ``group:`` label; their seeds / collections /
    filters get unioned here.
    """

    group_name: str               # the YAML group label
    schema_name: str              # Pydantic class name (Doc 1-4 schema module)
    field_names: tuple[str, ...]  # retrieved fields in this group
    field_specs: tuple[RetrievedField, ...]
    query_seeds: tuple[str, ...]           # union of all fields' seeds
    collections: tuple[str, ...]
    filters: dict[str, Any]                # merged
    top_k_per_query: int
    merge_pool_size: int
    merged_top_k: int
    rerank_query_ar: str | None
    # §C31 — tiered-retrieval Phase 7. Resolved per-group tier
    # configuration. Pre-Phase-7 every legacy group resolves to:
    #   tier_policy = "operationalfiles_only"
    #   operationalfiles_collections = self.collections
    #   doctrine_collections = ()
    #   source_files_field_map = {}
    # so the retrieve_group fast-path produces identical output.
    tier_policy: str = "operationalfiles_only"
    operationalfiles_collections: tuple[str, ...] = ()
    doctrine_collections: tuple[str, ...] = ()
    source_files_field_map: dict[str, str] = field(default_factory=dict)
    coverage_thresholds: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class GroupRetrievalResult:
    """Output of :func:`retrieve_group`.

    ``hits`` is the final ranked pool, each with ``rerank_score``
    + ``citation_tag`` populated. ``resolved_seeds`` is what
    actually went into fan-out (for logging / cache key). ``dropped_seeds``
    is seeds dropped for unresolved placeholders.
    ``allowlist_elided`` reports which allowlisted ``source_doc`` values
    weren't present in the live collection; useful for warning logs
    without blocking generation.
    """

    group: GroupSpec
    hits: tuple[SourcedHit, ...]
    resolved_seeds: tuple[str, ...]
    dropped_seeds: tuple[str, ...]
    canonical_rerank_query: str
    allowlist_elided: tuple[str, ...]


# ------------------------------------------------------------- seed interpolation

_PLACEHOLDER = re.compile(r"\{([a-zA-Z0-9_.]+)\}")


def _lookup_nested(inputs: Phase3Inputs, dotted: str) -> Any:
    """Walk ``a.b.c`` through nested Pydantic models / dicts.

    Returns the raw value (may be ``None`` / empty string), or
    raises :class:`KeyError` when a segment does not exist at all
    (i.e. a schema typo, not an optional empty field).
    """
    # Special short-hand: {mission_intent} → mission_intent_free_text.
    if dotted == "mission_intent":
        return inputs.mission_intent_free_text

    current: Any = inputs
    for segment in dotted.split("."):
        if isinstance(current, BaseModel):
            if segment not in current.__class__.model_fields:
                raise KeyError(dotted)
            current = getattr(current, segment)
        elif isinstance(current, dict):
            if segment not in current:
                raise KeyError(dotted)
            current = current[segment]
        else:
            raise KeyError(dotted)
    return current


def resolve_seeds(seeds: Iterable[str], inputs: Phase3Inputs) -> tuple[list[str], list[str]]:
    """Interpolate ``{a.b}`` placeholders in each seed.

    Returns ``(resolved, dropped)``. A seed is dropped if any of its
    placeholders resolves to ``None`` or empty string — passing
    literal ``{foo}`` to `search()` would destroy retrieval quality.
    Duplicate resolved seeds are dropped after the first (preserves
    the seed's original order for RRF rank stability).
    """
    resolved: list[str] = []
    dropped: list[str] = []
    seen: set[str] = set()
    for seed in seeds:
        interpolated = seed
        drop_this = False
        for match in _PLACEHOLDER.finditer(seed):
            key = match.group(1)
            try:
                val = _lookup_nested(inputs, key)
            except KeyError:
                # Truly unknown path — drop the seed; downstream
                # diagnostics will show which template field to fix.
                drop_this = True
                break
            if val is None or (isinstance(val, str) and not val.strip()):
                drop_this = True
                break
            interpolated = interpolated.replace(match.group(0), str(val))
        if drop_this:
            dropped.append(seed)
            continue
        key_for_dedup = interpolated.strip()
        if not key_for_dedup or key_for_dedup in seen:
            continue
        seen.add(key_for_dedup)
        resolved.append(key_for_dedup)
    return resolved, dropped


# ------------------------------------------------------------- group collection

def collect_group_specs(template: Template) -> tuple[GroupSpec, ...]:
    """Walk a template and collect one :class:`GroupSpec` per
    distinct ``group:`` label."""
    by_group: dict[str, list[tuple[str, str, RetrievedField]]] = {}
    for cls_name, sdef in template.schemas.items():
        for fname, spec in sdef.fields.items():
            if isinstance(spec, RetrievedField):
                by_group.setdefault(spec.group, []).append((cls_name, fname, spec))

    specs: list[GroupSpec] = []
    for group_name, entries in by_group.items():
        schema_names = {e[0] for e in entries}
        if len(schema_names) != 1:
            raise ValueError(
                f"group {group_name!r} spans multiple schemas {schema_names!r} — "
                f"a group must be contained within one Pydantic class."
            )
        schema_name = next(iter(schema_names))
        field_names = tuple(e[1] for e in entries)
        field_specs = tuple(e[2] for e in entries)

        # Union seeds (preserve order, dedupe).
        seen_seeds: set[str] = set()
        merged_seeds: list[str] = []
        for _, _, s in entries:
            for seed in s.query_seeds:
                if seed not in seen_seeds:
                    seen_seeds.add(seed)
                    merged_seeds.append(seed)

        # Union collections.
        seen_cols: set[str] = set()
        merged_cols: list[str] = []
        for _, _, s in entries:
            for c in s.collections:
                if c not in seen_cols:
                    seen_cols.add(c)
                    merged_cols.append(c)
        if not merged_cols:
            merged_cols = list(template.meta.default_collections)

        # Merge filters. `source_doc` is union; everything else
        # must match across all fields in the group (loader won't
        # catch conflicts — we reject here).
        merged_filters: dict[str, Any] = {}
        source_doc_union: set[str] = set()
        source_doc_any = False
        for cls_name, fname, s in entries:
            for fk, fv in s.filters.items():
                if fk == "source_doc":
                    source_doc_any = True
                    if isinstance(fv, str):
                        source_doc_union.add(fv)
                    else:
                        source_doc_union.update(fv)
                    continue
                if fk in merged_filters and merged_filters[fk] != fv:
                    raise ValueError(
                        f"group {group_name!r}: filter {fk!r} has conflicting "
                        f"values across fields (got {fv!r} on "
                        f"{cls_name}.{fname} vs {merged_filters[fk]!r} earlier). "
                        f"Either make them match or move the outlier into "
                        f"its own group."
                    )
                merged_filters[fk] = fv
        if source_doc_any:
            merged_filters["source_doc"] = sorted(source_doc_union)

        # Per-field numeric overrides — first non-None wins per key.
        def _first(attr: str, fallback: int) -> int:
            for _, _, s in entries:
                v = getattr(s, attr)
                if v is not None:
                    return v
            return fallback

        top_k_per_query = _first("top_k_per_query", _DEFAULT_TOP_K_PER_QUERY)
        merge_pool_size = _first("merge_pool_size", _DEFAULT_MERGE_POOL_SIZE)
        merged_top_k = _first("merged_top_k", _DEFAULT_MERGED_TOP_K)

        # rerank_query_ar must match across the group (loader already
        # enforced this — double-check here so local invariants hold).
        rrq_values = {s.rerank_query_ar for _, _, s in entries if s.rerank_query_ar}
        if len(rrq_values) > 1:
            raise ValueError(
                f"group {group_name!r}: inconsistent rerank_query_ar values "
                f"{rrq_values!r} — loader should have caught this."
            )
        rerank_query_ar = next(iter(rrq_values), None)

        # §C31 — tier-aware fields, resolved per group. The loader
        # accepts these as optional keys on RetrievedField (Phase 7).
        # First non-None wins per key. When every entry leaves them
        # unset the group falls back to legacy operationalfiles-only
        # behaviour.
        tier_policy_values = {
            getattr(s, "policy", None) for _, _, s in entries
            if getattr(s, "policy", None) is not None
        }
        if len(tier_policy_values) > 1:
            raise ValueError(
                f"group {group_name!r}: conflicting policy values "
                f"{tier_policy_values!r} — every retrieved field in a group "
                f"must declare the same policy (or none)."
            )
        tier_policy = next(iter(tier_policy_values), None) or "operationalfiles_only"

        of_cols_seen: set[str] = set()
        of_cols: list[str] = []
        for _, _, s in entries:
            for c in getattr(s, "operationalfiles_collections", []) or []:
                if c not in of_cols_seen:
                    of_cols_seen.add(c)
                    of_cols.append(c)
        if not of_cols:
            # Legacy default: ``collections:`` IS the operationalfiles target.
            of_cols = list(merged_cols)

        doc_cols_seen: set[str] = set()
        doc_cols: list[str] = []
        for _, _, s in entries:
            for c in getattr(s, "doctrine_collections", []) or []:
                if c not in doc_cols_seen:
                    doc_cols_seen.add(c)
                    doc_cols.append(c)

        merged_field_map: dict[str, str] = {}
        for _, _, s in entries:
            for k, v in (getattr(s, "source_files_field_map", {}) or {}).items():
                merged_field_map[k] = v

        merged_thresholds: dict[str, Any] = {}
        for _, _, s in entries:
            for k, v in (getattr(s, "coverage_thresholds", {}) or {}).items():
                merged_thresholds[k] = v

        specs.append(GroupSpec(
            group_name=group_name,
            schema_name=schema_name,
            field_names=field_names,
            field_specs=field_specs,
            query_seeds=tuple(merged_seeds),
            collections=tuple(merged_cols),
            filters=merged_filters,
            top_k_per_query=top_k_per_query,
            merge_pool_size=merge_pool_size,
            merged_top_k=merged_top_k,
            rerank_query_ar=rerank_query_ar,
            tier_policy=tier_policy,
            operationalfiles_collections=tuple(of_cols),
            doctrine_collections=tuple(doc_cols),
            source_files_field_map=merged_field_map,
            coverage_thresholds=merged_thresholds,
        ))
    return tuple(specs)


# ------------------------------------------------------------- source_doc elision

def _available_source_docs(collection: str) -> set[str]:
    """Enumerate ``source_doc`` values live in the collection.

    Uses Phase 2's ``graph.retrieval.registry`` Qdrant client and
    ``client.facet`` (already used by ``ui/app.py``). Returns empty
    set on any error so the caller can fall back to no-filter rather
    than crashing on a transient Qdrant hiccup.
    """
    try:
        from graph.retrieval.registry import _get_client  # type: ignore[attr-defined]
    except ImportError:
        return set()
    try:
        client = _get_client()
        facet = client.facet(
            collection_name=collection, key="source_doc", limit=500, exact=False
        )
        return {hit.value for hit in facet.hits}
    except Exception:
        return set()


def _elide_missing_source_docs(
    filters: dict[str, Any], collection: str
) -> tuple[dict[str, Any], list[str]]:
    """Return (filters, elided_list) with absent ``source_doc`` values
    stripped. Drops the whole key when the intersection is empty."""
    if "source_doc" not in filters:
        return filters, []
    allowlist = filters["source_doc"]
    if isinstance(allowlist, str):
        allowlist = [allowlist]
    available = _available_source_docs(collection)
    if not available:
        # Facet call failed — keep the filter as-is; Phase 2 may still return 0 hits.
        return filters, []
    kept = [s for s in allowlist if s in available]
    elided = [s for s in allowlist if s not in available]
    new_filters = dict(filters)
    if not kept:
        # Every allowlisted manual is absent — drop the filter entirely
        # so the group retrieves corpus-wide rather than against nothing.
        new_filters.pop("source_doc", None)
    else:
        new_filters["source_doc"] = kept
    return new_filters, elided


# ------------------------------------------------------------- citation locator

def build_citation_tag(
    hit: SearchHit,
    *,
    tier: Literal["operationalfiles", "doctrine"] | None = None,
    emit_prefixed: bool = False,
) -> str:
    """Render ``"[source_doc §locator]"`` per the §6.6 fallback chain.

    1. ``hit.paragraph_number``           e.g. ``§3-14``
    2. ``hit.paragraph_numbers[0]``
    3. deepest ``heading_path`` segment   e.g. ``§Command and control``
    4. ``"p. " + page_numbers[0]``        e.g. ``§p. 42``
    5. em-dash fallback                   ``§—``

    Tiered-retrieval Phase 6 (§C31): when ``emit_prefixed=True`` AND a
    tier is supplied, the tag becomes ``[O: <slug> §<locator>]`` for
    the operationalfiles tier or ``[D: <slug> §<locator>]`` for
    doctrine. When ``emit_prefixed=False`` (the default — pre-Phase-7
    callers), the legacy ``[<slug> §<locator>]`` shape is emitted so
    every existing template keeps producing today's tags.
    """
    locator: str | None = None
    if hit.paragraph_number:
        locator = hit.paragraph_number
    elif hit.paragraph_numbers:
        locator = hit.paragraph_numbers[0]
    elif hit.heading_path:
        parts = [p.strip() for p in hit.heading_path.split(" > ") if p.strip()]
        if parts:
            locator = parts[-1]
    if not locator and hit.page_numbers:
        locator = f"p. {hit.page_numbers[0]}"
    if not locator:
        locator = "—"
    # Source-doc slug: use the .pdf filename as-is (Phase 1's payload
    # convention). Strip trailing extension for readability.
    slug = hit.source_doc
    if slug.lower().endswith(".pdf"):
        slug = slug[:-4]
    if emit_prefixed and tier is not None:
        prefix = {"operationalfiles": "O", "doctrine": "D"}[tier]
        return f"[{prefix}: {slug} §{locator}]"
    return f"[{slug} §{locator}]"


# ------------------------------------------------------------- fan-out + merge

def _fan_out_search(
    group: GroupSpec,
    resolved_seeds: tuple[str, ...],
    use_glossary: bool,
    collections: tuple[str, ...] | None = None,
) -> tuple[dict[str, SourcedHit], list[tuple[str, list[str]]]]:
    """One search() call per (seed, collection). Return deduped pool
    + per-collection elision log.

    ``collections`` (added §C31, Phase 7) defaults to
    ``group.collections`` so legacy callers keep their behaviour.
    Phase 7's tiered fan-out passes either
    ``group.operationalfiles_collections`` or
    ``group.doctrine_collections`` so each tier's pool is collected
    independently before merging.
    """
    if collections is None:
        collections = group.collections
    pool: dict[str, SourcedHit] = {}
    elision_log: list[tuple[str, list[str]]] = []
    for collection in collections:
        live_filters, elided = _elide_missing_source_docs(group.filters, collection)
        if elided:
            elision_log.append((collection, elided))
        for seed_idx, seed in enumerate(resolved_seeds):
            request = SearchRequest(
                query=seed,
                collection=collection,
                filters=dict(live_filters),
                top_n_in=max(50, group.top_k_per_query * 6),
                top_k_out=group.top_k_per_query,
                use_reranker=False,  # rerank_score would not be cross-seed-comparable
                use_glossary=use_glossary,
                use_hyde=False,
                debug=False,
            )
            response: SearchResponse = search(request)
            for rank, hit in enumerate(response.hits, start=1):
                if hit.point_id in pool:
                    existing = pool[hit.point_id]
                    pool[hit.point_id] = SourcedHit(
                        hit=existing.hit,
                        collection=existing.collection,
                        occurrences=existing.occurrences + ((seed_idx, rank),),
                    )
                else:
                    pool[hit.point_id] = SourcedHit(
                        hit=hit,
                        collection=collection,
                        occurrences=((seed_idx, rank),),
                    )
    return pool, elision_log


def _rrf_merge(pool: dict[str, SourcedHit], keep: int) -> list[SourcedHit]:
    ranked = sorted(pool.values(), key=lambda sh: sh.rrf_merge_score, reverse=True)
    return ranked[:keep]


def _single_final_rerank(
    candidates: list[SourcedHit],
    canonical_query: str,
    keep: int,
) -> list[SourcedHit]:
    """Single rerank pass over the merged pool (§6.2 step 4).

    Every kept SourcedHit is returned with ``rerank_score`` populated
    from this one authoritative call. Order of returned list is
    rerank-descending.
    """
    if not candidates:
        return []
    texts = [sh.hit.text for sh in candidates]
    reranked = rerank(canonical_query, texts)
    # rerank() returns RerankedHit(original_index, score) sorted desc.
    out: list[SourcedHit] = []
    for rh in reranked[:keep]:
        src = candidates[rh.original_index]
        out.append(SourcedHit(
            hit=src.hit,
            collection=src.collection,
            occurrences=src.occurrences,
            rerank_score=rh.score,
            citation_tag=src.citation_tag,  # recomputed below
        ))
    return out


# ------------------------------------------------------------- entry point

def _is_tier_aware(group: GroupSpec) -> bool:
    """True iff the group's resolved policy is anything but the legacy
    ``operationalfiles_only`` default. Drives prefixed citation tags
    + the conditional doctrine fan-out."""
    return group.tier_policy not in ("operationalfiles_only", None)


def _tag_hits(
    hits: list[SourcedHit],
    *,
    tier: str,
    emit_prefixed: bool,
) -> list[SourcedHit]:
    """Apply citation_tag + tier to every SourcedHit in ``hits``."""
    out: list[SourcedHit] = []
    for sh in hits:
        out.append(SourcedHit(
            hit=sh.hit,
            collection=sh.collection,
            occurrences=sh.occurrences,
            rerank_score=sh.rerank_score,
            citation_tag=build_citation_tag(
                sh.hit,
                tier=tier if tier in ("operationalfiles", "doctrine") else None,
                emit_prefixed=emit_prefixed,
            ),
            tier=tier if tier in ("operationalfiles", "doctrine") else "operationalfiles",
        ))
    return out


def retrieve_group(
    group: GroupSpec,
    inputs: Phase3Inputs,
    *,
    use_glossary: bool = True,
) -> GroupRetrievalResult:
    """Full per-group retrieval pipeline (§6.2 + §C31 Phase 7).

    Raises ``ValueError`` when every seed is dropped — the caller
    (usually ``section_drafter``) uses the empty-hits result to emit
    the "غير متوفر في العقيدة المتاحة" fallback, but zero seeds is
    a template-authoring bug worth surfacing early.

    §C31 Phase 7: tier-aware policies route fan-out through up to
    two collection sets (operationalfiles + doctrine) and merge the
    results into one pool. The kill-switch ``PHASE3_TIERED_RETRIEVAL=0``
    forces the legacy operationalfiles-only path even for tier-aware
    groups — useful for rolling back without re-editing YAML.
    """
    # Lazy imports — keep cold-import cost down.
    from graph.generation.cache import resolve_tiered_retrieval_enabled
    from graph.generation.coverage import (
        coverage_verdict,
        resolve_thresholds_for_group,
    )

    resolved, dropped = resolve_seeds(group.query_seeds, inputs)
    if not resolved:
        raise ValueError(
            f"group {group.group_name!r}: every query seed dropped due to "
            f"unresolved placeholders. Inputs seem to be missing required "
            f"fields for this group's seeds. Dropped: {dropped!r}"
        )

    if group.rerank_query_ar:
        canonical_query = group.rerank_query_ar
    else:
        canonical_query = " | ".join(resolved)

    tiered_enabled = resolve_tiered_retrieval_enabled()
    tier_aware = tiered_enabled and _is_tier_aware(group)

    if not tier_aware:
        # ─── Legacy fast-path — byte-equal to pre-§C31 retrieve_group.
        # Default behaviour for every group whose YAML does not
        # declare ``policy:`` (and for any run with the kill-switch
        # off).  Builds the operationalfiles pool, ranks, tags, and
        # returns — no coverage check, no doctrine fan-out, untagged
        # citation tags.
        pool, elision_log = _fan_out_search(
            group, tuple(resolved), use_glossary=use_glossary
        )
        merged = _rrf_merge(pool, keep=group.merge_pool_size)
        ranked = _single_final_rerank(merged, canonical_query, keep=group.merged_top_k)
        tagged: list[SourcedHit] = []
        for sh in ranked:
            tagged.append(SourcedHit(
                hit=sh.hit,
                collection=sh.collection,
                occurrences=sh.occurrences,
                rerank_score=sh.rerank_score,
                citation_tag=build_citation_tag(sh.hit),
            ))
        elided_all = sorted({v for _, vs in elision_log for v in vs})
        return GroupRetrievalResult(
            group=group,
            hits=tuple(tagged),
            resolved_seeds=tuple(resolved),
            dropped_seeds=tuple(dropped),
            canonical_rerank_query=canonical_query,
            allowlist_elided=tuple(elided_all),
        )

    # ─── Tiered path — §C31 Phase 7.
    policy = group.tier_policy
    of_cols = group.operationalfiles_collections
    doc_cols = group.doctrine_collections
    tau, k_strong, m_docs = resolve_thresholds_for_group(group.coverage_thresholds)

    of_ranked: list[SourcedHit] = []
    doc_ranked: list[SourcedHit] = []
    elision_log_combined: list[tuple[str, list[str]]] = []

    want_of = policy in (
        "operationalfiles_only",
        "operationalfiles_then_doctrine",
        "operationalfiles_and_doctrine",
        "all_channels",
    )
    want_doctrine_unconditional = policy in (
        "doctrine_only",
        "operationalfiles_and_doctrine",
        "all_channels",
    )
    want_doctrine_fallback = policy == "operationalfiles_then_doctrine"

    if want_of and of_cols:
        of_pool, of_elision = _fan_out_search(
            group, tuple(resolved), use_glossary=use_glossary, collections=of_cols
        )
        elision_log_combined.extend(of_elision)
        of_merged = _rrf_merge(of_pool, keep=group.merge_pool_size)
        of_ranked = _single_final_rerank(of_merged, canonical_query, keep=group.merged_top_k)

    fire_doctrine_fallback = False
    if want_doctrine_fallback and doc_cols:
        verdict = coverage_verdict(of_ranked, tau_strong=tau, k_strong=k_strong, m_docs=m_docs)
        fire_doctrine_fallback = verdict in ("weak", "empty")

    if doc_cols and (want_doctrine_unconditional or fire_doctrine_fallback):
        doc_pool, doc_elision = _fan_out_search(
            group, tuple(resolved), use_glossary=use_glossary, collections=doc_cols
        )
        elision_log_combined.extend(doc_elision)
        doc_merged = _rrf_merge(doc_pool, keep=group.merge_pool_size)
        doc_ranked = _single_final_rerank(doc_merged, canonical_query, keep=group.merged_top_k)

    of_tagged = _tag_hits(of_ranked, tier="operationalfiles", emit_prefixed=True)
    doc_tagged = _tag_hits(doc_ranked, tier="doctrine", emit_prefixed=True)

    # Combined ranked pool — operationalfiles first (mission-specific
    # priority), doctrine after (reference framing). Both already
    # truncated to merged_top_k by the per-tier rerank step.
    all_tagged = list(of_tagged) + list(doc_tagged)

    elided_all = sorted({v for _, vs in elision_log_combined for v in vs})

    return GroupRetrievalResult(
        group=group,
        hits=tuple(all_tagged),
        resolved_seeds=tuple(resolved),
        dropped_seeds=tuple(dropped),
        canonical_rerank_query=canonical_query,
        allowlist_elided=tuple(elided_all),
    )


# ---------------------------------------------------------------- standalone
if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    # Standalone smoke hits Phase 2 search() → needs .env loaded.
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

    from graph.generation.schema.inputs import load_inputs
    from graph.generation.template_loader import load_template

    if len(sys.argv) < 3:
        print(
            "usage: python -m graph.generation.retrieval_group "
            "<template.yaml> <GroupName> [<inputs.json>]"
        )
        sys.exit(2)

    template_path = Path(sys.argv[1])
    group_name = sys.argv[2]
    inputs_path = (
        Path(sys.argv[3])
        if len(sys.argv) > 3
        else Path(__file__).resolve().parent.parent.parent / "data" / "phase3_inputs.example.json"
    )

    template = load_template(template_path)
    inputs = load_inputs(json.loads(inputs_path.read_text(encoding="utf-8")))
    specs = {g.group_name: g for g in collect_group_specs(template)}
    if group_name not in specs:
        print(f"group {group_name!r} not found; available: {sorted(specs)}")
        sys.exit(2)

    result = retrieve_group(specs[group_name], inputs)
    print(f"group             : {result.group.group_name} ({result.group.schema_name})")
    print(f"fields            : {list(result.group.field_names)}")
    print(f"resolved seeds    : {len(result.resolved_seeds)}")
    for s in result.resolved_seeds:
        print(f"  - {s}")
    if result.dropped_seeds:
        print(f"dropped seeds     : {result.dropped_seeds}")
    print(f"canonical rerank  : {result.canonical_rerank_query}")
    if result.allowlist_elided:
        print(f"source_doc elided : {result.allowlist_elided}")
    print(f"hits kept         : {len(result.hits)}")
    for sh in result.hits[:5]:
        preview = sh.hit.text.replace("\n", " ")[:90]
        print(
            f"  rerank={sh.rerank_score:+.4f}  rrf={sh.rrf_merge_score:.5f}  "
            f"{sh.citation_tag}  — {preview}…"
        )
