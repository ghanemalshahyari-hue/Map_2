"""graph/generation/llm.py — Phase 3 LLM config resolvers.

Pure env-resolution module.  Every Phase 3 call site that used to go
through ``get_draft_llm()`` / ``get_critique_llm()`` / ``get_extractor_llm()``
now calls :func:`graph.shared.responses_client.invoke_structured`
directly and passes the ``(model, temperature)`` pair returned by the
``*_config()`` helpers here.

Three role-specific configs are still exposed:

    draft_config()     temperature 0.2 (prose naturalness)
    critique_config()  temperature 0.0 (determinism)
    extractor_config() temperature 0.0 (determinism, §C16)

The cache key depends on both the model name and the temperature, so a
silent temperature change would return stale drafts.  Keep these
helpers authoritative.

Historical ``ChatOpenAI`` + ``lru_cache`` path was removed in §C27
(2026-04-24) once every call site migrated to the Responses adapter.
"""

from __future__ import annotations

import os

from graph.shared.llm_factory import resolve_model

__all__ = [
    "DEFAULT_DRAFT_MODEL",
    "DEFAULT_CRITIQUE_MODEL",
    "DEFAULT_EXTRACTOR_MODEL",
    "DEFAULT_DRAFT_TEMPERATURE",
    "DEFAULT_CRITIQUE_TEMPERATURE",
    "DEFAULT_EXTRACTOR_TEMPERATURE",
    "draft_config",
    "critique_config",
    "extractor_config",
]


# Code-side defaults — match §16 D6 of the scoping doc.
# Overridable per-run via .env without touching Phase 3 source.
DEFAULT_DRAFT_MODEL = "gpt-4o-mini"
DEFAULT_CRITIQUE_MODEL = "gpt-4o-mini"
DEFAULT_EXTRACTOR_MODEL = "gpt-4o-mini"
DEFAULT_DRAFT_TEMPERATURE = 0.2
DEFAULT_CRITIQUE_TEMPERATURE = 0.0
DEFAULT_EXTRACTOR_TEMPERATURE = 0.0  # determinism, not creativity (§18 C16)


def draft_config() -> tuple[str, float]:
    """Return ``(model, temperature)`` for the draft call site.

    Exposed separately so :mod:`graph.generation.cache` can fold the
    active config into every per-group cache key (§10.1 / §18 C11).
    """
    model = resolve_model(role_env="PHASE3_DRAFT_MODEL", default=DEFAULT_DRAFT_MODEL)
    temperature = float(os.getenv("PHASE3_DRAFT_TEMPERATURE", str(DEFAULT_DRAFT_TEMPERATURE)))
    return model, temperature


def critique_config() -> tuple[str, float]:
    """Return ``(model, temperature)`` for the critique call site."""
    model = resolve_model(role_env="PHASE3_CRITIQUE_MODEL", default=DEFAULT_CRITIQUE_MODEL)
    temperature = float(os.getenv("PHASE3_CRITIQUE_TEMPERATURE", str(DEFAULT_CRITIQUE_TEMPERATURE)))
    return model, temperature


def extractor_config() -> tuple[str, float]:
    """Return ``(model, temperature)`` for the prompt-extraction call site.

    Extraction defaults to ``temperature=0.0`` because the same prompt
    must yield the same facts every rerun.  Per §18 C16, the extractor
    has its own env surface (``PHASE3_EXTRACTOR_MODEL`` /
    ``PHASE3_EXTRACTOR_TEMPERATURE``) so it can be swapped without
    touching the draft/critique config.
    """
    model = resolve_model(role_env="PHASE3_EXTRACTOR_MODEL", default=DEFAULT_EXTRACTOR_MODEL)
    temperature = float(os.getenv("PHASE3_EXTRACTOR_TEMPERATURE", str(DEFAULT_EXTRACTOR_TEMPERATURE)))
    return model, temperature


if __name__ == "__main__":
    # Diagnostic: print the active config without invoking any API.
    from graph.shared.llm_factory import resolved_endpoint_tag

    dm, dt = draft_config()
    cm, ct = critique_config()
    em, et = extractor_config()
    tag = resolved_endpoint_tag()
    print(f"endpoint : {tag}")
    print(f"draft    : {dm} @ temperature={dt}")
    print(f"critique : {cm} @ temperature={ct}")
    print(f"extractor: {em} @ temperature={et}")
    print("(Invocation routed through graph.shared.responses_client.)")
