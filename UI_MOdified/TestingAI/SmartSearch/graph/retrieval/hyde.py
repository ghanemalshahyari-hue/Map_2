"""graph/retrieval/hyde.py
==========================
Optional HyDE (Hypothetical Document Embeddings) query expansion.

HOW IT WORKS (§6.2 of the design doc):
  An LLM writes a short hypothetical document that would *answer*
  the user's query, as if it were a paragraph excerpted from the
  target corpus. That hypothetical is then embedded on the DENSE
  channel instead of the original query. The SPARSE channel keeps
  the user's own (lexically-expanded) query so BM25 still scores
  the user's terminology verbatim.

DEFAULT OFF (§6.2):
  HyDE is experimental in v1. `QUERY_EXPAND_HYDE=off` by default.
  Turning it on adds one LLM round-trip per query.  Whether it
  actually improves doctrine retrieval is an eval question, not a
  locked design decision.  The UI exposes an A/B toggle; eval (§8)
  decides.

WHAT THIS MODULE RETURNS:
  ``generate_hyde_document(query) -> str`` — a short paragraph,
  capped at ``QUERY_EXPAND_HYDE_MAX_TOKENS``.  Domain framing via
  ``HYDE_DOMAIN`` (default ``"military doctrine"``) steers the LLM
  toward corpus-appropriate style.

LLM INVOCATION (§C27, 2026-04-24):
  Routes through :func:`graph.shared.responses_client.invoke_text` so
  the wire call is the same ``POST /v1/responses`` path every other
  Phase 3 call site uses.  No more ``ChatOpenAI`` / ``with_structured_output``
  — LangChain is not in the invocation path for any critical LLM call.
  The finalize-follow-up inside the adapter means reasoning-only
  models (Gemma, Qwen) still return a visible paragraph instead of
  an empty string.

STANDALONE RUN:
  python -m graph.retrieval.hyde "<query>"
"""
from __future__ import annotations

import sys

from graph.retrieval.config import get_retrieval_config
from graph.shared.responses_client import (
    ResponsesInvocationError,
    invoke_text,
)


# Prompt — terse, one-shot.  The domain placeholder is filled from
# RetrievalConfig.hyde_domain.  Length cap is enforced via
# ``max_output_tokens`` on the Responses call, not the prompt.
_HYDE_SYSTEM = (
    "You write concise, technically correct excerpts as if copied from a "
    "{domain} reference document. You do not answer in first person, and "
    "you do not preface the excerpt with 'The answer is' or 'According to'. "
    "You produce one short paragraph in the same factual, declarative tone "
    "the reference corpus uses."
)

_HYDE_USER = (
    "Write one paragraph (no more than {max_tokens} tokens) that would "
    "appear in a {domain} reference document and would directly address "
    "the following query. Use the vocabulary of the domain. Do not repeat "
    "the query. Do not add meta-commentary.\n\n"
    "Query: {query}"
)


def generate_hyde_document(query: str) -> str:
    """Generate a hypothetical domain document for ``query``.

    Deterministic (``temperature=0``).  Output is capped at
    ``QUERY_EXPAND_HYDE_MAX_TOKENS`` via the Responses adapter's
    ``max_output_tokens``.  Returns the raw text — the caller is
    responsible for deciding whether to embed it (see ``search.py``).

    Returns an empty string when the query itself is empty or when the
    LLM could not produce a visible paragraph even after the adapter's
    finalize follow-up; retrieval degrades to dense-on-original-query
    in that case rather than hard-failing.
    """
    if not query.strip():
        return ""
    cfg = get_retrieval_config()

    system_msg = _HYDE_SYSTEM.format(domain=cfg.hyde_domain)
    user_msg = _HYDE_USER.format(
        domain=cfg.hyde_domain,
        max_tokens=cfg.hyde_max_tokens,
        query=query,
    )

    try:
        result = invoke_text(
            role_env="QUERY_EXPAND_LLM_MODEL",
            default_model=cfg.hyde_llm_model,
            temperature=0.0,
            system=system_msg,
            user=user_msg,
            max_output_tokens=cfg.hyde_max_tokens,
        )
    except ResponsesInvocationError as e:
        # HyDE is optional — never let it take down retrieval.  A future
        # caller reading stderr will see the failure payload logged by
        # the adapter; here we just degrade to "no HyDE expansion".
        print(
            f"[hyde] invoke_text failed on {e.diagnostics.model}@{e.diagnostics.endpoint}; "
            f"degrading to dense-on-original-query",
            file=sys.stderr,
        )
        return ""
    return result.text.strip()


# =============================================================================
# STANDALONE MODE
# =============================================================================
# Usage:
#   python -m graph.retrieval.hyde "<query>"

if __name__ == "__main__":
    from dotenv import load_dotenv
    from graph.shared.llm_factory import resolve_model

    load_dotenv()

    if len(sys.argv) < 2:
        print('Usage: python -m graph.retrieval.hyde "<query>"')
        sys.exit(1)

    query = sys.argv[1]
    cfg = get_retrieval_config()
    resolved = resolve_model(
        role_env="QUERY_EXPAND_LLM_MODEL",
        default=cfg.hyde_llm_model,
    )
    print(f"Model     : {resolved}")
    print(f"Domain    : {cfg.hyde_domain}")
    print(f"MaxTokens : {cfg.hyde_max_tokens}")
    print(f"Query     : {query!r}")
    print()
    doc = generate_hyde_document(query)
    print("--- HyDE document ---")
    print(doc)
    print("--- end ---")
