"""graph/shared/llm_factory.py
==============================
Env resolution for the Responses adapter.

Scope (post §C27, 2026-04-24):
  Centralises endpoint / API-key / model resolution so the project
  can be pointed at LM Studio, a cloud OpenAI endpoint, or any other
  OpenAI-compatible server by editing ``.env`` only.

Resolution rules
----------------
Endpoint (``base_url``)
    1. ``LLM_BASE_URL`` if set (e.g. ``http://localhost:1234/v1``).
    2. otherwise ``None`` → the ``openai`` SDK hits the default cloud
       OpenAI endpoint.

API key
    1. ``LLM_API_KEY`` if set.
    2. otherwise ``OPENAI_API_KEY``.
    3. otherwise ``None`` → the ``openai`` SDK raises a clear error.

Model
    1. the role-specific env var supplied by the caller
       (e.g. ``PHASE3_DRAFT_MODEL``).
    2. ``LLM_MODEL`` (global fallback).
    3. the code-side default supplied by the caller.

Endpoint identity
    :func:`resolved_endpoint_tag` returns a stable string such as
    ``"http://localhost:1234/v1"`` or ``"openai-default"``.  The Phase
    3 cache key folds this in so switching endpoints invalidates
    stale drafts automatically.

Responses API (LOCKED 2026-04-24 by user directive)
---------------------------------------------------
Every LLM call goes through :mod:`graph.shared.responses_client`,
which hits ``POST /v1/responses`` — NOT ``POST /v1/chat/completions``.
This is a project-wide decision and applies to cloud OpenAI, LM Studio,
and any other OpenAI-compatible endpoint.  The ``LLM_USE_RESPONSES_API``
env var survives as a per-deployment escape hatch only; reading it is
the caller's job (see ``resolve_use_responses_api``).

Design notes
------------
* No hardcoded defaults for base URL or API key — both must come from
  ``.env`` so there is exactly one place to change them.
* This module only RESOLVES env.  Client caching and invocation live
  in :mod:`graph.shared.responses_client`.
* Historical ``build_chat_llm`` / ``ChatOpenAI`` path was removed in
  §C27 (2026-04-24) once every call site migrated to the Responses
  adapter.  LangChain is no longer on the critical LLM path.
"""
from __future__ import annotations

import os

__all__ = [
    "resolve_llm_base_url",
    "resolve_llm_api_key",
    "resolve_model",
    "resolved_endpoint_tag",
    "resolve_use_responses_api",
]


def _strip_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def resolve_llm_base_url() -> str | None:
    """Return ``LLM_BASE_URL`` if set, else ``None``."""
    return _strip_or_none(os.environ.get("LLM_BASE_URL"))


def resolve_llm_api_key() -> str | None:
    """Return ``LLM_API_KEY`` when set, else fall back to ``OPENAI_API_KEY``."""
    key = _strip_or_none(os.environ.get("LLM_API_KEY"))
    if key is not None:
        return key
    return _strip_or_none(os.environ.get("OPENAI_API_KEY"))


def resolve_model(*, role_env: str | None, default: str) -> str:
    """Resolve the model name for a given call site.

    Precedence: role-specific env var → ``LLM_MODEL`` → ``default``.
    """
    if role_env:
        role_value = _strip_or_none(os.environ.get(role_env))
        if role_value is not None:
            return role_value
    global_value = _strip_or_none(os.environ.get("LLM_MODEL"))
    if global_value is not None:
        return global_value
    return default


def resolved_endpoint_tag() -> str:
    """Stable identifier for the active LLM endpoint.

    Used as a component in the Phase 3 cache key so drafts produced
    against different endpoints don't shadow each other.
    """
    base_url = resolve_llm_base_url()
    return base_url if base_url is not None else "openai-default"


def resolve_use_responses_api() -> bool:
    """Return True iff the project routes through ``POST /v1/responses``.

    LOCKED by user directive 2026-04-24.  Read by
    :mod:`graph.generation.cache` so a future deployment that flips the
    escape hatch ``LLM_USE_RESPONSES_API=0`` invalidates cached drafts.
    The migrated adapter (:mod:`graph.shared.responses_client`) still
    only talks to the Responses endpoint — flipping the flag does not
    silently reroute to Chat Completions, it is a correctness sentinel.
    """
    raw = os.environ.get("LLM_USE_RESPONSES_API", "1").strip().lower()
    return raw in {"1", "true", "yes", "on"}


if __name__ == "__main__":
    # Diagnostic: print the resolved endpoint without hitting anything.
    print(f"LLM_BASE_URL   : {resolve_llm_base_url() or '(default OpenAI)'}")
    print(f"LLM_API_KEY    : {'set' if resolve_llm_api_key() else 'MISSING'}")
    print(f"endpoint tag   : {resolved_endpoint_tag()}")
    print(f"Responses API  : {'ON (/v1/responses)' if resolve_use_responses_api() else 'OFF (/v1/chat/completions)'}")
    print()
    for label, role_env, default in [
        ("PHASE1 gate    ", "PHASE1_GATE_MODEL", "gpt-4o-mini"),
        ("Phase 2 HyDE   ", "QUERY_EXPAND_LLM_MODEL", "gpt-4o-mini"),
        ("Phase 3 extract", "PHASE3_EXTRACTOR_MODEL", "gpt-4o-mini"),
        ("Phase 3 draft  ", "PHASE3_DRAFT_MODEL", "gpt-4o-mini"),
        ("Phase 3 critic ", "PHASE3_CRITIQUE_MODEL", "gpt-4o-mini"),
    ]:
        print(f"{label}: {resolve_model(role_env=role_env, default=default)}")
