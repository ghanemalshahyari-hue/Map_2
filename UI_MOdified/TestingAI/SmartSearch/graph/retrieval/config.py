"""graph/retrieval/config.py
============================
Phase 2-specific `.env` loader. Sibling to `graph/config.py`
(which owns Phase 1 ingestion config) — the two are deliberately
kept separate so retrieval can evolve without touching ingestion
settings.

Follows the Phase 1 pattern: environment variables with sensible
defaults baked in as Python literals so the system works out of
the box on a fresh clone. Override in `.env` when a deployment
needs different values.

Keys consumed (all optional — defaults track
referencedocs/17_phase2_retrieval.md §10.4):

  RERANK_MODEL                 = BAAI/bge-reranker-v2-m3
  RERANK_TOP_N_IN              = 50
  RERANK_TOP_K_OUT             = 8
  HYBRID_DENSE_PREFETCH        = 50
  HYBRID_SPARSE_PREFETCH       = 50

  QUERY_EXPAND_ACRONYMS        = on
  QUERY_EXPAND_HYDE            = off
  QUERY_EXPAND_LLM_MODEL       = gpt-4o-mini
  QUERY_EXPAND_HYDE_MAX_TOKENS = 256
  HYDE_DOMAIN                  = military doctrine

  EVAL_FEEDBACK_PATH           = output/_eval/feedback.jsonl
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class RetrievalConfig:
    # Reranker (locked v1 — see §7)
    rerank_model: str
    rerank_top_n_in: int
    rerank_top_k_out: int

    # Hybrid prefetch sizing (§4, §5)
    hybrid_dense_prefetch: int
    hybrid_sparse_prefetch: int

    # Query expansion (§6)
    expand_acronyms: bool
    expand_hyde: bool
    hyde_llm_model: str
    hyde_max_tokens: int
    hyde_domain: str

    # Eval telemetry (§8)
    eval_feedback_path: str


_retrieval_config: RetrievalConfig | None = None


def get_retrieval_config() -> RetrievalConfig:
    """Return the process-level RetrievalConfig singleton."""
    global _retrieval_config
    if _retrieval_config is None:
        _retrieval_config = _build()
    return _retrieval_config


def _bool(value: str, *, default: bool) -> bool:
    raw = value.strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _get(key: str, default: str) -> str:
    return os.environ.get(key, default).strip()


def _build() -> RetrievalConfig:
    return RetrievalConfig(
        rerank_model=_get("RERANK_MODEL", "BAAI/bge-reranker-v2-m3"),
        rerank_top_n_in=int(_get("RERANK_TOP_N_IN", "50")),
        rerank_top_k_out=int(_get("RERANK_TOP_K_OUT", "8")),

        hybrid_dense_prefetch=int(_get("HYBRID_DENSE_PREFETCH", "50")),
        hybrid_sparse_prefetch=int(_get("HYBRID_SPARSE_PREFETCH", "50")),

        expand_acronyms=_bool(_get("QUERY_EXPAND_ACRONYMS", "on"), default=True),
        expand_hyde=_bool(_get("QUERY_EXPAND_HYDE", "off"), default=False),
        hyde_llm_model=_get("QUERY_EXPAND_LLM_MODEL", "gpt-4o-mini"),
        hyde_max_tokens=int(_get("QUERY_EXPAND_HYDE_MAX_TOKENS", "256")),
        hyde_domain=_get("HYDE_DOMAIN", "military doctrine"),

        eval_feedback_path=_get("EVAL_FEEDBACK_PATH", "output/_eval/feedback.jsonl"),
    )
