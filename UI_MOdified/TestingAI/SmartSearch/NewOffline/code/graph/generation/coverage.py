"""graph/generation/coverage.py — pure-arithmetic coverage check.

Phase 7 of the tiered-retrieval plan (§C31) introduces a coverage gate
that decides whether the operationalfiles fan-out's pool is *strong
enough* to draft from, or whether the doctrine tier should fan out as
fallback.

Three signals (locked in tiered_retrieval_discussion.md §"Coverage
check — how the system decides 'not detailed enough'"):

  * top rerank score          ≥ ``τ_strong`` (default 0.30)
  * pool size                  ≥ ``k_strong`` (default 8 hits)
  * source diversity           ≥ ``m_docs`` (default 2 distinct ``source_doc``)

Verdicts:

  * ``"strong"``  — all three pass; doctrine fallback NOT fired.
  * ``"weak"``    — at least one fails; doctrine fan-out fires (when
                    policy permits).
  * ``"empty"``   — pool is empty; doctrine fan-out fires.

Conservative on purpose: cheap to over-fire fallback, expensive to
under-fire it. The locked plan flags an LLM-based coverage check as a
clean future extension at the same return-type interface; out of v1
scope.

This module is callable in isolation, has no Qdrant or LLM dependency,
and is unit-testable from synthetic SourcedHit lists.
"""

from __future__ import annotations

from typing import Iterable, Literal

from graph.generation.cache import resolve_coverage_thresholds
from graph.generation.retrieval_group import SourcedHit


__all__ = [
    "CoverageVerdict",
    "coverage_verdict",
    "resolve_thresholds_for_group",
]


CoverageVerdict = Literal["strong", "weak", "empty", "n/a"]


def resolve_thresholds_for_group(
    per_field_override: dict | None = None,
) -> tuple[float, int, int]:
    """Merge a per-field YAML override onto the env / locked defaults.

    YAML override keys (each optional):
      * ``tau_strong``   — top-rerank-score threshold
      * ``k_strong``     — pool-size threshold
      * ``m_docs``       — source-diversity threshold
    """
    tau_default, k_default, m_default = resolve_coverage_thresholds()
    override = per_field_override or {}
    try:
        tau = float(override.get("tau_strong", tau_default))
    except (TypeError, ValueError):
        tau = tau_default
    try:
        k = int(override.get("k_strong", k_default))
    except (TypeError, ValueError):
        k = k_default
    try:
        m = int(override.get("m_docs", m_default))
    except (TypeError, ValueError):
        m = m_default
    return (tau, k, m)


def coverage_verdict(
    hits: Iterable[SourcedHit],
    *,
    tau_strong: float,
    k_strong: int,
    m_docs: int,
) -> CoverageVerdict:
    """Return ``"strong"`` / ``"weak"`` / ``"empty"`` for ``hits``.

    The three signals (top rerank, pool size, source diversity) all
    have to pass for ``"strong"``. ``"empty"`` short-circuits when
    no hits at all — the caller's policy decides whether to fan out
    doctrine in that case.
    """
    pool = list(hits)
    if not pool:
        return "empty"

    # Source diversity over distinct source_doc values.
    distinct = {sh.hit.source_doc for sh in pool if sh.hit.source_doc}

    # Top rerank score — ``rerank_score`` is None when reranker is
    # unavailable (RerankUnavailable degradation path); treat as 0.0
    # so a missing rerank tips the verdict toward "weak" when the
    # other signals are also weak.
    top = max((sh.rerank_score or 0.0) for sh in pool)

    if (
        top >= tau_strong
        and len(pool) >= k_strong
        and len(distinct) >= m_docs
    ):
        return "strong"
    return "weak"


# --------------------------------------------------------------- self-smoke

if __name__ == "__main__":
    from graph.retrieval.schema import SearchHit

    def _hit(src: str, score: float | None) -> SourcedHit:
        h = SearchHit(
            point_id=f"id-{src}-{score}", text="x", heading_path="",
            source_doc=src, page_numbers=[1], chunk_type="body",
            chunk_index=0, paragraph_number=None, paragraph_numbers=[],
            cross_refs=[], rrf_score=0.0, rerank_score=score,
        )
        return SourcedHit(hit=h, collection="ingest__operationalfiles__bgem3", rerank_score=score)

    # Empty pool
    v = coverage_verdict([], tau_strong=0.3, k_strong=8, m_docs=2)
    assert v == "empty", f"empty: got {v}"
    print("OK empty pool → empty")

    # All three signals strong
    pool = [_hit(f"FM-{i}", 0.5) for i in range(8)] + [_hit("FM-Other", 0.5)]
    v = coverage_verdict(pool, tau_strong=0.3, k_strong=8, m_docs=2)
    assert v == "strong", f"all-strong: got {v}"
    print("OK strong pool → strong")

    # Single source → low diversity
    pool = [_hit("FM-Z", 0.5) for _ in range(10)]
    v = coverage_verdict(pool, tau_strong=0.3, k_strong=8, m_docs=2)
    assert v == "weak", f"single-source: got {v}"
    print("OK single-source pool → weak (m_docs=1 < 2)")

    # Small pool
    pool = [_hit("FM-A", 0.5), _hit("FM-B", 0.5)]
    v = coverage_verdict(pool, tau_strong=0.3, k_strong=8, m_docs=2)
    assert v == "weak", f"tiny-pool: got {v}"
    print("OK tiny pool → weak (size=2 < k_strong=8)")

    # Low top score
    pool = [_hit(f"FM-{i}", 0.1) for i in range(10)]
    v = coverage_verdict(pool, tau_strong=0.3, k_strong=8, m_docs=2)
    assert v == "weak", f"low-top: got {v}"
    print("OK low-top pool → weak (top=0.1 < τ=0.3)")

    # No reranker scores at all (None)
    pool = [_hit(f"FM-{i}", None) for i in range(10)]
    v = coverage_verdict(pool, tau_strong=0.3, k_strong=8, m_docs=2)
    assert v == "weak", f"no-rerank: got {v}"
    print("OK no-reranker-scores pool → weak (top=0 < τ=0.3)")

    # Threshold resolver
    import os
    saved = {k: os.environ.pop(k, None) for k in ("PHASE3_COVERAGE_TAU_STRONG", "PHASE3_COVERAGE_K_STRONG", "PHASE3_COVERAGE_M_DOCS")}
    try:
        assert resolve_thresholds_for_group() == (0.30, 8, 2)
        assert resolve_thresholds_for_group({"tau_strong": 0.5, "k_strong": 12}) == (0.5, 12, 2)
        # Bogus values fall back
        assert resolve_thresholds_for_group({"tau_strong": "garbage"}) == (0.30, 8, 2)
        print("OK resolve_thresholds_for_group: env defaults + per-field override + garbage fallback")
    finally:
        for k, v_saved in saved.items():
            if v_saved is not None:
                os.environ[k] = v_saved

    print("\ncoverage.py smoke OK — Phase 7 coverage gate ready.")
