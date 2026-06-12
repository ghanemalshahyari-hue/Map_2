"""graph/retrieval/mmr.py
=========================
Stage D — Maximal Marginal Relevance diversification.

**DEFERRED IN v1.** The design doc (§1 Non-scope, §4 Notes) calls
for a stub here until observed duplicate-text problems justify the
extra complexity. Until then the identity function is the correct
behaviour; the reranker already handles the vast majority of
ordering quality.

This stub exists so `search.py` can unconditionally call
`apply_mmr(...)` without a feature flag everywhere. Wire the real
algorithm when the evaluation harness (§8) shows redundant hits
dominating Top-k.
"""
from __future__ import annotations

from typing import TypeVar

T = TypeVar("T")


def apply_mmr(candidates: list[T], *, enabled: bool = False) -> list[T]:
    """Pass-through diversifier.

    Signature kept stable for the day the real implementation
    lands: `(candidates, *, enabled, lambda_=..., n=...)`. Until
    then `enabled` is ignored and the candidates are returned in
    the order the reranker produced them.
    """
    _ = enabled
    return list(candidates)
