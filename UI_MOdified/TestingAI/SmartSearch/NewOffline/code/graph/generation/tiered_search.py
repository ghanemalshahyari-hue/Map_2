"""graph/generation/tiered_search.py
=====================================
Shared entry point for interactive tiered-retrieval testing.

Wraps :func:`graph.generation.retrieval_group.retrieve_group` with a
synthetic :class:`GroupSpec` so a free-form query (Arabic or English)
flows through the **same code path that document generation uses** —
operationalfiles fan-out → coverage gate → conditional doctrine
fan-out → tier-tagged hits.  No YAML, no schema, no Phase3Inputs
required from the caller.

Used by:
  * ``scripts/tiered_search.py``  — CLI for fast terminal testing
  * ``ui/tiered_search_tab.py``   — Streamlit interactive tab

Why this exists
---------------
Phase 2's :func:`graph.retrieval.search.search` is single-collection
and tier-agnostic.  The tiered logic (six policies + coverage gate +
doctrine fallback) lives in :func:`retrieve_group`, which is
otherwise consumed only by the dispatcher in
:mod:`graph.generation.field_dispatcher`.  Without a thin wrapper,
exercising tier-aware retrieval requires a full document-generation
run — slow (12 min) and obscures the gate decision behind drafter +
renderer noise.  This module exposes the same call with one query
string in, one structured verdict + ranked hits out.

Public surface
--------------
:func:`run_tiered_search` — one call per query.  Returns a
:class:`TieredSearchResult` carrying the operationalfiles hits, the
doctrine hits, the coverage verdict, whether fallback fired, and
provenance (resolved seeds, canonical rerank query).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from graph.generation.coverage import (
    coverage_verdict as _coverage_verdict,
    resolve_thresholds_for_group,
)
from graph.generation.retrieval_group import (
    GroupRetrievalResult,
    GroupSpec,
    SourcedHit,
    retrieve_group,
)
from graph.generation.schema.inputs import Phase3Inputs, load_inputs


__all__ = [
    "TieredSearchResult",
    "run_tiered_search",
    "POLICIES",
]


# Six locked policy enum values from tiered_retrieval_discussion.md.
# ``source_files_only`` is omitted because this UI is for retrieval
# testing — source_files lives in extracted text, not in Qdrant, and
# can't be exercised through ``retrieve_group`` against a live query.
POLICIES = (
    "operationalfiles_only",
    "operationalfiles_then_doctrine",
    "operationalfiles_and_doctrine",
    "doctrine_only",
    "all_channels",
)


@dataclass(frozen=True)
class TieredSearchResult:
    """Structured result of one tiered search.

    Carries enough state for both CLI and UI presentation:
      * The operationalfiles + doctrine hit pools, separately, so the
        renderer can group them under their respective tiers.
      * The coverage verdict computed against the operationalfiles
        pool only — even when the policy fanned out doctrine
        unconditionally, the verdict still reflects how well the
        operationalfiles tier covered the query.
      * ``fallback_fired`` is True iff the doctrine fan-out was
        triggered specifically because the operationalfiles coverage
        was weak (policy = ``operationalfiles_then_doctrine``).  For
        policies that fan out doctrine unconditionally (``and``,
        ``all_channels``, ``doctrine_only``) this is False even if
        doctrine hits exist.
      * ``thresholds`` is the resolved ``(τ_strong, k_strong, m_docs)``
        triple actually applied — useful for the UI to show next to
        the verdict so the user can map the verdict back to the gate.
    """

    query: str
    policy: str
    operationalfiles_hits: tuple[SourcedHit, ...]
    doctrine_hits: tuple[SourcedHit, ...]
    coverage_verdict: Literal["strong", "weak", "empty", "n/a"]
    fallback_fired: bool
    thresholds: tuple[float, int, int]  # (τ_strong, k_strong, m_docs)
    canonical_rerank_query: str
    resolved_seeds: tuple[str, ...]
    raw: GroupRetrievalResult  # full retrieve_group output, for debugging


def _load_dummy_inputs(repo_root: Path) -> Phase3Inputs:
    """Load a valid :class:`Phase3Inputs` for placeholder-free seeds.

    ``retrieve_group`` interpolates ``{a.b}`` placeholders against
    Phase3Inputs before fan-out.  A free-form UI query has no
    placeholders, so ``inputs`` is unused for seed resolution — but
    the type contract requires a valid instance.  We use the
    committed example file, which always validates.
    """
    path = repo_root / "data" / "phase3_inputs.example.json"
    return load_inputs(json.loads(path.read_text(encoding="utf-8")))


def run_tiered_search(
    query: str,
    *,
    operationalfiles_collections: tuple[str, ...] = (),
    doctrine_collections: tuple[str, ...] = (),
    policy: str = "operationalfiles_then_doctrine",
    rerank_query_ar: str | None = None,
    top_k_per_query: int = 8,
    merge_pool_size: int = 25,
    merged_top_k: int = 15,
    tau_strong: float | None = None,
    k_strong: int | None = None,
    m_docs: int | None = None,
    use_glossary: bool = True,
    repo_root: Path | None = None,
) -> TieredSearchResult:
    """Run one tiered search and return a structured verdict + hits.

    The query is wrapped in a synthetic single-seed :class:`GroupSpec`
    so the tier-aware path in :func:`retrieve_group` runs end-to-end:
    operationalfiles fan-out, coverage gate, conditional doctrine
    fan-out, tier-tagged citation tags.  Coverage thresholds default
    to the env-resolved locked defaults; CLI/UI callers can override
    individual values for "what if" tuning sweeps.

    Args:
        query:                          Arabic or English search string.
        operationalfiles_collections:   Collection names for the
                                        operationalfiles tier.  Required
                                        unless policy is ``doctrine_only``.
        doctrine_collections:           Collection names for the
                                        doctrine tier.  Required when
                                        policy involves doctrine.
        policy:                         One of :data:`POLICIES`.
        rerank_query_ar:                Optional override for the
                                        canonical rerank query
                                        (defaults to the resolved seed).
        top_k_per_query / merge_pool_size / merged_top_k:
                                        Standard ``GroupSpec`` knobs;
                                        passed straight through.
        tau_strong / k_strong / m_docs: Optional coverage threshold
                                        overrides.  When ``None`` the
                                        env defaults
                                        (``PHASE3_COVERAGE_TAU_STRONG``
                                        etc.) apply.
        use_glossary:                   Forwarded to :func:`retrieve_group`.
        repo_root:                      Resolved automatically when
                                        ``None``.

    Raises:
        ValueError: when the policy + collection set is incoherent
                    (e.g. ``doctrine_only`` with no doctrine
                    collections), or when ``retrieve_group`` rejects
                    the seed.
    """
    if not query.strip():
        raise ValueError("query cannot be empty")
    if policy not in POLICIES:
        raise ValueError(f"unknown policy {policy!r}; choose from {POLICIES}")

    # Validate the collection set against the policy.
    needs_of = policy in (
        "operationalfiles_only",
        "operationalfiles_then_doctrine",
        "operationalfiles_and_doctrine",
        "all_channels",
    )
    needs_doctrine = policy in (
        "doctrine_only",
        "operationalfiles_then_doctrine",
        "operationalfiles_and_doctrine",
        "all_channels",
    )
    if needs_of and not operationalfiles_collections:
        raise ValueError(
            f"policy={policy!r} requires at least one operationalfiles collection"
        )
    if needs_doctrine and not doctrine_collections:
        # Not fatal for ``operationalfiles_then_doctrine`` (the
        # fallback simply has nothing to fall back to), but for the
        # unconditional policies it's clearly wrong.  Raise.
        if policy in ("doctrine_only", "operationalfiles_and_doctrine", "all_channels"):
            raise ValueError(
                f"policy={policy!r} requires at least one doctrine collection"
            )

    repo_root = repo_root or Path(__file__).resolve().parent.parent.parent
    inputs = _load_dummy_inputs(repo_root)

    # Resolve coverage thresholds — env defaults overlaid with caller
    # overrides.
    env_tau, env_k, env_m = resolve_thresholds_for_group()
    tau_resolved = float(tau_strong) if tau_strong is not None else env_tau
    k_resolved = int(k_strong) if k_strong is not None else env_k
    m_resolved = int(m_docs) if m_docs is not None else env_m

    # Build the synthetic GroupSpec.  ``collections`` is a legacy alias
    # for the operationalfiles target — we pass the same tuple so the
    # GroupSpec is internally consistent regardless of which retrieval
    # branch reads it.
    of_cols = tuple(operationalfiles_collections)
    spec = GroupSpec(
        group_name="ui_tiered_search",
        schema_name="UITieredSearch",
        field_names=("query",),
        field_specs=tuple(),
        query_seeds=(query.strip(),),
        collections=of_cols,
        filters={},
        top_k_per_query=int(top_k_per_query),
        merge_pool_size=int(merge_pool_size),
        merged_top_k=int(merged_top_k),
        rerank_query_ar=(rerank_query_ar.strip() if rerank_query_ar else None) or None,
        tier_policy=policy,
        operationalfiles_collections=of_cols,
        doctrine_collections=tuple(doctrine_collections),
        coverage_thresholds={
            "tau_strong": tau_resolved,
            "k_strong": k_resolved,
            "m_docs": m_resolved,
        },
    )

    # Run the full tier-aware retrieval pipeline.
    result = retrieve_group(spec, inputs, use_glossary=use_glossary)

    # Split hits by tier for presentation.  The retrieve_group output
    # already stamps each SourcedHit with its tier, so this is a
    # straight partition.
    of_hits = tuple(h for h in result.hits if h.tier == "operationalfiles")
    doc_hits = tuple(h for h in result.hits if h.tier == "doctrine")

    # Compute the verdict over the operationalfiles tier.  Even for
    # unconditional-doctrine policies the verdict tells us whether the
    # operationalfiles tier alone would have covered the query — useful
    # signal for tuning.
    verdict = _coverage_verdict(
        of_hits,
        tau_strong=tau_resolved,
        k_strong=k_resolved,
        m_docs=m_resolved,
    )

    # Fallback semantics: only true when the policy was
    # ``operationalfiles_then_doctrine`` and the gate said weak/empty.
    # For unconditional policies, doctrine fanned out by design, not
    # because of the gate.
    fallback_fired = (
        policy == "operationalfiles_then_doctrine"
        and verdict in ("weak", "empty")
        and len(doc_hits) > 0
    )

    return TieredSearchResult(
        query=query.strip(),
        policy=policy,
        operationalfiles_hits=of_hits,
        doctrine_hits=doc_hits,
        coverage_verdict=verdict,
        fallback_fired=fallback_fired,
        thresholds=(tau_resolved, k_resolved, m_resolved),
        canonical_rerank_query=result.canonical_rerank_query,
        resolved_seeds=result.resolved_seeds,
        raw=result,
    )


# --------------------------------------------------------------- self-smoke
if __name__ == "__main__":
    # Smoke against synthetic types (no live services) — verifies the
    # validator flags incoherent policy + collection combinations.
    import sys

    try:
        run_tiered_search("test", operationalfiles_collections=(), policy="operationalfiles_only")
    except ValueError as e:
        print(f"OK validation: {e}")

    try:
        run_tiered_search("test", policy="doctrine_only", doctrine_collections=())
    except ValueError as e:
        print(f"OK validation: {e}")

    try:
        run_tiered_search("", operationalfiles_collections=("x",), policy="operationalfiles_only")
    except ValueError as e:
        print(f"OK validation: {e}")

    try:
        run_tiered_search("test", operationalfiles_collections=("x",), policy="not-a-policy")
    except ValueError as e:
        print(f"OK validation: {e}")

    print("\ntiered_search.py validator smoke OK — live testing requires Qdrant + LM Studio.")
