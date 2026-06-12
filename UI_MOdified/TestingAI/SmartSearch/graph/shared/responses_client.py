"""graph/shared/responses_client.py
======================================
Repo-native adapter for the OpenAI Responses API (``POST /v1/responses``).

Why this module exists
----------------------
LangChain's ``with_structured_output(...)`` assumes the server always
fills the ``output_parsed`` slot of a Responses payload.  Local
OpenAI-compatible servers (LM Studio, llama.cpp server, Infinity, TEI,
etc.) running reasoning-capable models (Gemma, Qwen, GLM) frequently
return raw Responses shapes that LangChain cannot interpret: reasoning
items with no ``message`` item, JSON embedded in prose, ``function_call``
arguments when no tool was bound, or plain text when a schema was sent.

This module owns the normalization, retry, and repair logic instead of
trusting LangChain to do it.  Call sites move from
``chat_openai.with_structured_output(Schema).invoke([...])`` to
``invoke_structured(schema=Schema, system=..., user=...)``.

Design (§C27, 2026-04-24)
-------------------------
- The HTTP protocol stays locked to ``POST /v1/responses`` — no
  ``/v1/chat/completions`` fallback.
- Env resolution (``LLM_BASE_URL`` / ``LLM_API_KEY`` / ``LLM_MODEL`` +
  role-specific overrides) reuses ``graph/shared/llm_factory.py`` so
  there is still exactly one place to change endpoints.
- Cache-key provenance (``llm_endpoint_tag`` + ``llm_use_responses_api``
  in :mod:`graph.generation.cache`) is unchanged; drafts produced against
  a different endpoint still invalidate via the existing digest.
- Retry budget per invocation: **1 finalize + 1 repair** (at most 3 API
  calls for structured, 2 for text).  On exhaustion we raise
  :class:`ResponsesInvocationError` with full diagnostics.

Normalization precedence (``_normalize_response``)
--------------------------------------------------
For each raw response we expose five usable shapes, in this priority:

  1. ``output_parsed`` — when the server returned native json_schema
     output that the SDK auto-parsed.
  2. ``output_text`` / ``message`` items — free-form text (or
     schema-constrained text emitted as a message).
  3. JSON embedded in text — balanced-brace scan of (2) for local
     models that emit JSON inside prose or fenced code blocks.
  4. ``function_call`` / ``tool_call`` arguments — some backends route
     structured output through a function call even when no tools were
     bound.
  5. Reasoning-only — items exist but none are messages/function calls
     and none carry text.  Triggers the finalize follow-up.

Public surface
--------------
- :func:`invoke_text` — single-turn text completion with finalize
  follow-up on reasoning-only output.
- :func:`invoke_structured` — single-turn structured completion with
  strict json_schema attempt, prose-guided fallback, finalize follow-up,
  and one repair pass on validation failure.
- :class:`ResponsesInvocationError` — raised on exhaustion; carries a
  :class:`ResponseDiagnostics` with endpoint, model, attempt count,
  output item types seen, reasoning token usage, and the last
  validation error.

Diagnostics are printed to stderr only on failure paths (one-line JSON).
Success paths stay silent so normal runs don't spam the terminal.

Probe
-----
``python -m graph.shared.responses_client probe`` sends one text call
and one trivial structured call against the configured endpoint and
prints the normalization breadcrumbs.  Use this as the first sanity
check after flipping ``LLM_BASE_URL``.
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from graph.shared.llm_factory import (
    resolve_llm_api_key,
    resolve_llm_base_url,
    resolve_model,
    resolved_endpoint_tag,
)

T = TypeVar("T", bound=BaseModel)

__all__ = [
    "ResponseDiagnostics",
    "ResponsesInvocationError",
    "StructuredResult",
    "TextResult",
    "invoke_structured",
    "invoke_text",
]


# =============================================================================
# Diagnostics + result types
# =============================================================================


@dataclass
class ResponseDiagnostics:
    """Everything a postmortem needs about one invocation.

    Populated incrementally across the attempt ladder so a raised
    :class:`ResponsesInvocationError` carries the full history.
    """

    endpoint: str
    model: str
    attempts: int = 0
    had_parsed: bool = False
    had_text: bool = False
    had_tool_args: bool = False
    reasoning_only: bool = False
    reasoning_tokens: int = 0
    text_length: int = 0
    output_item_types: tuple[str, ...] = ()
    response_id: str | None = None
    validation_error: str | None = None
    notes: list[str] = field(default_factory=list)


@dataclass
class TextResult:
    text: str
    response_id: str | None
    diagnostics: ResponseDiagnostics


@dataclass
class StructuredResult:
    value: BaseModel
    response_id: str | None
    diagnostics: ResponseDiagnostics


class ResponsesInvocationError(Exception):
    """Raised when :func:`invoke_text` or :func:`invoke_structured`
    exhausts its retry budget.

    The ``diagnostics`` attribute carries every signal the adapter
    collected across attempts (endpoint, model, attempt count, output
    item types seen, reasoning token usage, validation errors).
    Callers that want to degrade gracefully can inspect it before
    surfacing a user-facing message.
    """

    def __init__(self, message: str, diagnostics: ResponseDiagnostics):
        super().__init__(message)
        self.diagnostics = diagnostics


# =============================================================================
# Client cache
# =============================================================================


@lru_cache(maxsize=4)
def _get_client_for(base_url: str | None, api_key: str | None) -> OpenAI:
    import httpx
    import urllib3

    client_kwargs: dict[str, Any] = {}
    if base_url is not None:
        client_kwargs["base_url"] = base_url
    if api_key is not None:
        client_kwargs["api_key"] = api_key

    # Airgapped LLM endpoints often use self-signed / internal-CA certs that
    # certifi's bundle doesn't trust.  Pass an httpx.Client with verify=False
    # so the SDK accepts any HTTP/HTTPS endpoint without cert checks.
    # Only safe on a controlled network; do not deploy with this enabled on
    # an internet-facing host.  See changesonS4.md item 1.
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    client_kwargs["http_client"] = httpx.Client(verify=False)

    return OpenAI(**client_kwargs)


def _get_client() -> OpenAI:
    """Return a process-cached ``openai.OpenAI`` pointed at the resolved endpoint."""
    return _get_client_for(resolve_llm_base_url(), resolve_llm_api_key())


# =============================================================================
# Response normalizer
# =============================================================================


def _item_type(item: Any) -> str:
    return getattr(item, "type", None) or type(item).__name__


def _iter_output_items(raw: Any) -> list[Any]:
    """Yield items from raw.output defensively across SDK versions."""
    out = getattr(raw, "output", None)
    if out is None:
        out = getattr(raw, "output_items", None)  # older SDK alias
    if out is None:
        return []
    return list(out)


def _extract_balanced_json(text: str) -> Any | None:
    """Parse the largest balanced JSON structure found in ``text``.

    Handles three common local-model shapes:
      - pure JSON ("{...}")
      - JSON inside markdown fences ("```json\\n{...}\\n```")
      - JSON preceded/followed by prose
    Returns ``None`` on any failure — caller decides what to do.
    """
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        # Strip a single fence pair (```json\n...\n```).
        s = re.sub(r"^```(?:[a-zA-Z0-9_-]+)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    try:
        return json.loads(s)
    except (json.JSONDecodeError, ValueError):
        pass
    # Scan for the longest balanced object or array.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = s.find(opener)
        while start >= 0:
            depth = 0
            in_string = False
            escape = False
            for i in range(start, len(s)):
                ch = s[i]
                if in_string:
                    if escape:
                        escape = False
                    elif ch == "\\":
                        escape = True
                    elif ch == '"':
                        in_string = False
                    continue
                if ch == '"':
                    in_string = True
                elif ch == opener:
                    depth += 1
                elif ch == closer:
                    depth -= 1
                    if depth == 0:
                        candidate = s[start : i + 1]
                        try:
                            return json.loads(candidate)
                        except (json.JSONDecodeError, ValueError):
                            break
            start = s.find(opener, start + 1)
    return None


@dataclass
class _NormalizedOutput:
    text: str | None
    parsed_json: Any | None
    function_args: Any | None
    reasoning_only: bool
    response_id: str | None
    output_item_types: tuple[str, ...]
    reasoning_tokens: int


def _normalize_response(raw: Any) -> _NormalizedOutput:
    """Expose every usable signal from a raw Responses payload.

    Populates the five cases documented in the module docstring.
    """
    items = _iter_output_items(raw)
    item_types = tuple(_item_type(it) for it in items)
    response_id = getattr(raw, "id", None)

    # (1) Native parsed (SDK-populated when .parse() is used).
    parsed = getattr(raw, "output_parsed", None)

    # (2) Free-form text: prefer SDK helper, else walk message items.
    text = getattr(raw, "output_text", None)
    if not text:
        pieces: list[str] = []
        for it in items:
            if _item_type(it) == "message":
                content = getattr(it, "content", None) or []
                for part in content:
                    ptype = getattr(part, "type", None)
                    if ptype in ("output_text", "text"):
                        pieces.append(getattr(part, "text", "") or "")
        text = "".join(pieces)
    text = text or ""

    # (3) JSON-in-text when no native parsed was surfaced.
    json_from_text: Any | None = None
    if parsed is None and text:
        json_from_text = _extract_balanced_json(text)

    # (4) function_call / tool_call arguments.
    function_args: Any | None = None
    for it in items:
        if _item_type(it) in ("function_call", "tool_call"):
            args = getattr(it, "arguments", None)
            if isinstance(args, str):
                try:
                    function_args = json.loads(args)
                except (json.JSONDecodeError, ValueError):
                    pass
            elif isinstance(args, (dict, list)):
                function_args = args
            if function_args is not None:
                break

    # (5) Reasoning-only detection.
    has_usable = (
        parsed is not None
        or bool(text.strip())
        or json_from_text is not None
        or function_args is not None
    )
    has_reasoning = any(_item_type(it) == "reasoning" for it in items)
    has_message = any(_item_type(it) == "message" for it in items)
    reasoning_only = (not has_usable) and (has_reasoning or not has_message)

    # Reasoning-token accounting (optional, best-effort).
    reasoning_tokens = 0
    usage = getattr(raw, "usage", None)
    if usage is not None:
        details = getattr(usage, "output_tokens_details", None)
        if details is not None:
            reasoning_tokens = int(getattr(details, "reasoning_tokens", 0) or 0)

    return _NormalizedOutput(
        text=text.strip() or None,
        parsed_json=parsed if parsed is not None else json_from_text,
        function_args=function_args,
        reasoning_only=reasoning_only,
        response_id=response_id,
        output_item_types=item_types,
        reasoning_tokens=reasoning_tokens,
    )


# =============================================================================
# Shared helpers
# =============================================================================


def _build_input(system: str, user: str) -> list[dict]:
    """Two-message ``input`` payload for the Responses API."""
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _absorb(diag: ResponseDiagnostics, norm: _NormalizedOutput) -> None:
    """Fold the latest normalization result into the running diagnostics."""
    diag.response_id = norm.response_id or diag.response_id
    diag.output_item_types = norm.output_item_types
    diag.reasoning_tokens += norm.reasoning_tokens
    if norm.parsed_json is not None:
        diag.had_parsed = True
    if norm.text is not None:
        diag.had_text = True
        diag.text_length = len(norm.text)
    if norm.function_args is not None:
        diag.had_tool_args = True


def _log_failure(diag: ResponseDiagnostics, reason: str) -> None:
    """One-line JSON stderr log — failure paths only."""
    try:
        print(
            json.dumps(
                {
                    "responses_client": "failure",
                    "reason": reason,
                    "endpoint": diag.endpoint,
                    "model": diag.model,
                    "attempts": diag.attempts,
                    "had_parsed": diag.had_parsed,
                    "had_text": diag.had_text,
                    "had_tool_args": diag.had_tool_args,
                    "reasoning_only": diag.reasoning_only,
                    "reasoning_tokens": diag.reasoning_tokens,
                    "text_length": diag.text_length,
                    "output_item_types": list(diag.output_item_types),
                    "response_id": diag.response_id,
                    "validation_error": (diag.validation_error or "")[:500],
                    "notes": diag.notes,
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
    except Exception:
        pass


# =============================================================================
# invoke_text
# =============================================================================

_FINALIZE_TEXT_USER = (
    "You produced reasoning but no visible output. Provide the final answer "
    "as plain text now. Do not include any reasoning, preamble, or explanation. "
    "Respond with only the deliverable content."
)


def invoke_text(
    *,
    role_env: str | None,
    default_model: str,
    temperature: float,
    system: str,
    user: str,
    max_output_tokens: int | None = None,
    allow_finalize_retry: bool = True,
) -> TextResult:
    """Single-turn text completion via ``POST /v1/responses``.

    Budget: up to 2 API calls (initial + one finalize follow-up when the
    first attempt produces reasoning-only output).  Raises
    :class:`ResponsesInvocationError` on exhaustion.

    Args:
        role_env:  role-specific env var (e.g. ``"QUERY_EXPAND_LLM_MODEL"``).
            Passed straight through to :func:`llm_factory.resolve_model`.
        default_model:  code-side default if env + global are both empty.
        temperature:  forwarded unchanged.
        system / user:  message contents.
        max_output_tokens:  optional cap — set this when a call site has a
            known token budget (e.g. HyDE's 256-token hypothesis).
        allow_finalize_retry:  set ``False`` for call sites that must only
            ever make one API call (rare — default ``True``).
    """
    client = _get_client()
    model = resolve_model(role_env=role_env, default=default_model)
    diag = ResponseDiagnostics(endpoint=resolved_endpoint_tag(), model=model)

    base_kwargs: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "input": _build_input(system, user),
    }
    if max_output_tokens is not None:
        base_kwargs["max_output_tokens"] = max_output_tokens

    try:
        raw = client.responses.create(**base_kwargs)
    except Exception as e:
        diag.notes.append(f"initial call raised {type(e).__name__}: {e}")
        _log_failure(diag, "initial call raised")
        raise ResponsesInvocationError(
            f"Responses text call on {model}@{diag.endpoint} raised "
            f"{type(e).__name__}: {e}",
            diagnostics=diag,
        ) from e

    diag.attempts += 1
    norm = _normalize_response(raw)
    _absorb(diag, norm)

    if norm.text:
        return TextResult(
            text=norm.text,
            response_id=norm.response_id,
            diagnostics=diag,
        )

    if not allow_finalize_retry or not norm.reasoning_only:
        diag.reasoning_only = norm.reasoning_only
        _log_failure(diag, "no text and finalize disabled or not reasoning-only")
        raise ResponsesInvocationError(
            f"Responses text call on {model}@{diag.endpoint} produced no text. "
            f"item_types={list(diag.output_item_types)}",
            diagnostics=diag,
        )

    # Finalize follow-up — reuse previous_response_id when the server provided
    # one; otherwise re-send the full context with an explicit finalize suffix.
    follow_kwargs: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
    }
    if norm.response_id is not None:
        follow_kwargs["previous_response_id"] = norm.response_id
        follow_kwargs["input"] = [{"role": "user", "content": _FINALIZE_TEXT_USER}]
    else:
        diag.notes.append("no response_id; finalize resent full context")
        follow_kwargs["input"] = _build_input(
            system,
            user + "\n\n" + _FINALIZE_TEXT_USER,
        )
    if max_output_tokens is not None:
        follow_kwargs["max_output_tokens"] = max_output_tokens

    try:
        raw2 = client.responses.create(**follow_kwargs)
    except Exception as e:
        diag.notes.append(f"finalize call raised {type(e).__name__}: {e}")
        _log_failure(diag, "finalize call raised")
        raise ResponsesInvocationError(
            f"Responses text finalize on {model}@{diag.endpoint} raised "
            f"{type(e).__name__}: {e}",
            diagnostics=diag,
        ) from e

    diag.attempts += 1
    norm2 = _normalize_response(raw2)
    _absorb(diag, norm2)

    if norm2.text:
        return TextResult(
            text=norm2.text,
            response_id=norm2.response_id,
            diagnostics=diag,
        )

    diag.reasoning_only = True
    _log_failure(diag, "no final text after finalize")
    raise ResponsesInvocationError(
        f"Responses text call on {model}@{diag.endpoint} produced no final text "
        f"after {diag.attempts} attempt(s). "
        f"item_types={list(diag.output_item_types)} "
        f"reasoning_tokens={diag.reasoning_tokens}",
        diagnostics=diag,
    )


# =============================================================================
# invoke_structured
# =============================================================================

_STRUCTURED_SYSTEM_SUFFIX = (
    "\n\nCRITICAL OUTPUT RULE: respond with ONE JSON object that matches the "
    "required schema exactly. No markdown code fences. No explanation. No prose. "
    "JSON only."
)

_FINALIZE_STRUCTURED_USER = (
    "You produced reasoning but no JSON. Emit ONLY the final JSON object now. "
    "No prose, no code fences, no explanation."
)


def _schema_format(schema: type[BaseModel], name: str) -> dict:
    """Build the ``text`` parameter for a strict json_schema Responses call."""
    return {
        "format": {
            "type": "json_schema",
            "name": name,
            "schema": schema.model_json_schema(),
            "strict": True,
        }
    }


def invoke_structured(
    *,
    role_env: str | None,
    default_model: str,
    temperature: float,
    schema: type[T],
    system: str,
    user: str,
    max_output_tokens: int | None = None,
    schema_name: str | None = None,
) -> StructuredResult:
    """Structured Responses call with a four-step ladder.

    The ladder, in order:
      1. Strict json_schema via ``text.format`` — works on cloud OpenAI
         and any server that advertises strict-schema support.
      2. Prose-guided call — adds the "JSON only" suffix to the system
         prompt and parses the response with our own normalizer.
         Fires when (1) raises OR returns nothing usable.
      3. Finalize follow-up — sent when the call produced
         reasoning-only output.  Uses ``previous_response_id`` when
         available; falls back to a full-context re-send.
      4. Repair pass — exactly one retry when ``schema.model_validate``
         rejects the extracted JSON.  The prompt includes the prior
         JSON and the validation error.

    Budget: at most 3 API calls (strict → prose → finalize OR strict →
    prose → repair; the ladder short-circuits as soon as a usable
    payload validates).  Raises :class:`ResponsesInvocationError` on
    exhaustion.
    """
    client = _get_client()
    model = resolve_model(role_env=role_env, default=default_model)
    diag = ResponseDiagnostics(endpoint=resolved_endpoint_tag(), model=model)
    effective_name = schema_name or schema.__name__

    # -- Step 1: strict json_schema -------------------------------------------
    usable_obj = _try_strict(
        client,
        diag,
        model=model,
        temperature=temperature,
        schema=schema,
        schema_name=effective_name,
        system=system,
        user=user,
        max_output_tokens=max_output_tokens,
    )

    # -- Step 2: prose-guided fallback ----------------------------------------
    last_response_id: str | None = diag.response_id
    if usable_obj is None:
        usable_obj, last_response_id = _try_prose(
            client,
            diag,
            model=model,
            temperature=temperature,
            system=system,
            user=user,
            max_output_tokens=max_output_tokens,
        )

    # -- Step 3: finalize follow-up -------------------------------------------
    if usable_obj is None and diag.reasoning_only:
        usable_obj, last_response_id = _try_finalize_structured(
            client,
            diag,
            previous_response_id=last_response_id,
            model=model,
            temperature=temperature,
            system=system,
            user=user,
            max_output_tokens=max_output_tokens,
        )

    if usable_obj is None:
        _log_failure(diag, "no JSON produced across ladder")
        raise ResponsesInvocationError(
            f"Responses structured call on {model}@{diag.endpoint} produced no JSON "
            f"after {diag.attempts} attempt(s). "
            f"item_types={list(diag.output_item_types)} "
            f"reasoning_tokens={diag.reasoning_tokens}",
            diagnostics=diag,
        )

    # -- Validate (and one repair pass) ---------------------------------------
    try:
        value = schema.model_validate(usable_obj)
        return StructuredResult(
            value=value,
            response_id=last_response_id,
            diagnostics=diag,
        )
    except ValidationError as ve:
        diag.validation_error = str(ve)
        diag.notes.append("initial validation failed; attempting repair")

    repaired = _try_repair(
        client,
        diag,
        prior_obj=usable_obj,
        validation_error=diag.validation_error or "",
        schema=schema,
        schema_name=effective_name,
        model=model,
        temperature=temperature,
        system=system,
        max_output_tokens=max_output_tokens,
    )
    if repaired is None:
        _log_failure(diag, "repair produced no JSON")
        raise ResponsesInvocationError(
            f"Responses structured repair on {model}@{diag.endpoint} produced no JSON. "
            f"Prior validation error: {diag.validation_error}",
            diagnostics=diag,
        )

    try:
        value = schema.model_validate(repaired)
        return StructuredResult(
            value=value,
            response_id=diag.response_id,
            diagnostics=diag,
        )
    except ValidationError as ve2:
        diag.validation_error = (
            f"initial: {diag.validation_error} | repair: {ve2}"
        )
        _log_failure(diag, "repair still invalid")
        raise ResponsesInvocationError(
            f"Responses structured call on {model}@{diag.endpoint} failed validation "
            f"after {diag.attempts} attempt(s). {diag.validation_error}",
            diagnostics=diag,
        ) from ve2


# =============================================================================
# Ladder steps (kept small + explicit so the control flow above is readable)
# =============================================================================


def _try_strict(
    client: OpenAI,
    diag: ResponseDiagnostics,
    *,
    model: str,
    temperature: float,
    schema: type[BaseModel],
    schema_name: str,
    system: str,
    user: str,
    max_output_tokens: int | None,
) -> Any | None:
    """Attempt native strict json_schema.  Returns extracted obj or None."""
    kwargs: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "input": _build_input(system, user),
        "text": _schema_format(schema, schema_name),
    }
    if max_output_tokens is not None:
        kwargs["max_output_tokens"] = max_output_tokens
    try:
        raw = client.responses.create(**kwargs)
    except Exception as e:
        diag.notes.append(f"strict rejected: {type(e).__name__}: {e}")
        return None
    diag.attempts += 1
    norm = _normalize_response(raw)
    _absorb(diag, norm)
    if norm.parsed_json is not None:
        return norm.parsed_json
    if norm.function_args is not None:
        return norm.function_args
    if norm.reasoning_only:
        diag.reasoning_only = True
    return None


def _try_prose(
    client: OpenAI,
    diag: ResponseDiagnostics,
    *,
    model: str,
    temperature: float,
    system: str,
    user: str,
    max_output_tokens: int | None,
) -> tuple[Any | None, str | None]:
    """Attempt prose-guided JSON call.  Returns (obj_or_none, response_id)."""
    kwargs: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "input": _build_input(system + _STRUCTURED_SYSTEM_SUFFIX, user),
    }
    if max_output_tokens is not None:
        kwargs["max_output_tokens"] = max_output_tokens
    try:
        raw = client.responses.create(**kwargs)
    except Exception as e:
        diag.notes.append(f"prose call raised: {type(e).__name__}: {e}")
        return None, None
    diag.attempts += 1
    norm = _normalize_response(raw)
    _absorb(diag, norm)
    if norm.reasoning_only:
        diag.reasoning_only = True
    if norm.parsed_json is not None:
        return norm.parsed_json, norm.response_id
    if norm.function_args is not None:
        return norm.function_args, norm.response_id
    return None, norm.response_id


def _try_finalize_structured(
    client: OpenAI,
    diag: ResponseDiagnostics,
    *,
    previous_response_id: str | None,
    model: str,
    temperature: float,
    system: str,
    user: str,
    max_output_tokens: int | None,
) -> tuple[Any | None, str | None]:
    """Finalize follow-up when the last attempt was reasoning-only."""
    kwargs: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
    }
    if previous_response_id is not None:
        kwargs["previous_response_id"] = previous_response_id
        kwargs["input"] = [{"role": "user", "content": _FINALIZE_STRUCTURED_USER}]
    else:
        diag.notes.append("finalize had no response_id; full re-send")
        kwargs["input"] = _build_input(
            system + _STRUCTURED_SYSTEM_SUFFIX,
            user + "\n\n" + _FINALIZE_STRUCTURED_USER,
        )
    if max_output_tokens is not None:
        kwargs["max_output_tokens"] = max_output_tokens
    try:
        raw = client.responses.create(**kwargs)
    except Exception as e:
        diag.notes.append(f"finalize raised: {type(e).__name__}: {e}")
        return None, previous_response_id
    diag.attempts += 1
    norm = _normalize_response(raw)
    _absorb(diag, norm)
    if norm.parsed_json is not None:
        return norm.parsed_json, norm.response_id
    if norm.function_args is not None:
        return norm.function_args, norm.response_id
    return None, norm.response_id


def _lift_nested_keys(
    obj: Any, required_keys: set[str]
) -> Any | None:
    """Pre-repair heuristic: when ``obj`` is a dict missing every required
    key at top level but a single nested dict carries them, lift that
    nested dict to top level.

    Targets the Gemma compliance failure documented in
    ``docs/gemma_drafter_followup.md`` where the model places the
    schema's required fields under a wrapper key (e.g. ``planning_guidebook``)
    while leaking prompt-context fields to the top level. Returns the
    lifted dict on a clean match, ``None`` otherwise (caller falls back
    to the LLM repair pass).
    """
    if not isinstance(obj, dict):
        return None
    if not required_keys:
        return None
    top_keys = set(obj.keys())
    if required_keys & top_keys:
        # At least one required key is at top level — don't lift; the
        # LLM repair pass with the explicit schema is safer.
        return None
    for v in obj.values():
        if isinstance(v, dict):
            nested_keys = set(v.keys())
            if required_keys.issubset(nested_keys):
                return v
    return None


def _try_repair(
    client: OpenAI,
    diag: ResponseDiagnostics,
    *,
    prior_obj: Any,
    validation_error: str,
    schema: type[BaseModel],
    schema_name: str,
    model: str,
    temperature: float,
    system: str,
    max_output_tokens: int | None,
) -> Any | None:
    """Single repair pass after a ValidationError on the extracted JSON.

    Two-step repair:
      1. **Structural lift heuristic** — when every required schema key
         is missing at top level but a nested dict contains them, lift
         the nested dict and return it without another LLM call. Cheap;
         handles the Gemma "wrapper key" failure mode (see
         ``docs/gemma_drafter_followup.md``) deterministically.
      2. **Schema-as-text repair** — re-call the model with strict
         json_schema format AND the schema's JSON-Schema text inline
         in the user prompt + the prior output + the validation
         errors. Locally-hosted Gemma needs the explicit shape
         constraint shown twice (server-side json_schema enforcement
         AND user-prompt schema text) to produce a compliant repair
         on its second try.
    """
    # ── Step 1: structural lift heuristic ──────────────────────────────
    json_schema = schema.model_json_schema()
    required_keys = set(json_schema.get("required") or [])
    lifted = _lift_nested_keys(prior_obj, required_keys)
    if lifted is not None:
        diag.notes.append("repair: lifted nested keys without LLM call")
        return lifted

    # ── Step 2: schema-as-text repair via strict json_schema ───────────
    schema_text = json.dumps(json_schema, ensure_ascii=False, indent=2)
    repair_user = (
        "Your previous JSON failed validation. Emit a CORRECTED JSON object "
        "that matches the required schema EXACTLY — every required key at the "
        "top level, no extra keys, no nesting under wrapper keys.\n\n"
        "REQUIRED SCHEMA (JSON Schema):\n"
        f"{schema_text}\n\n"
        "YOUR PREVIOUS (INVALID) JSON:\n"
        f"{json.dumps(prior_obj, ensure_ascii=False, default=str)}\n\n"
        "VALIDATION ERRORS:\n"
        f"{validation_error}\n\n"
        "Emit ONLY the corrected JSON object. No prose, no code fences, no nesting."
    )
    kwargs: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "input": _build_input(system + _STRUCTURED_SYSTEM_SUFFIX, repair_user),
        # Strict json_schema on the repair too — combined with the schema
        # text in the prompt this is the belt-and-suspenders that local
        # Gemma needs to comply.
        "text": _schema_format(schema, schema_name),
    }
    if max_output_tokens is not None:
        kwargs["max_output_tokens"] = max_output_tokens
    try:
        raw = client.responses.create(**kwargs)
    except Exception as e:
        diag.notes.append(f"repair raised: {type(e).__name__}: {e}")
        # Fall back to prose-shape repair when the strict format itself
        # is rejected by the server.
        kwargs.pop("text", None)
        try:
            raw = client.responses.create(**kwargs)
        except Exception as e2:
            diag.notes.append(f"prose repair raised: {type(e2).__name__}: {e2}")
            return None
    diag.attempts += 1
    norm = _normalize_response(raw)
    _absorb(diag, norm)
    if norm.parsed_json is not None:
        return norm.parsed_json
    if norm.function_args is not None:
        return norm.function_args
    return None


# =============================================================================
# Probe (standalone self-test)
# =============================================================================


def _probe() -> int:
    """End-to-end smoke test against the configured endpoint.

    Sends one text-only call and one trivial structured call, printing
    normalization breadcrumbs on both success and failure. Exit 0 iff
    both calls produce usable output.
    """
    from dotenv import load_dotenv

    load_dotenv()

    model = resolve_model(role_env=None, default="gpt-4o-mini")
    endpoint = resolved_endpoint_tag()
    api_key = resolve_llm_api_key()
    print(f"endpoint : {endpoint}")
    print(f"model    : {model}")
    print(f"api_key  : {'set' if api_key else 'MISSING'}")
    print()

    ok = True

    # -- Text probe --
    print("[text probe]")
    try:
        res = invoke_text(
            role_env=None,
            default_model=model,
            temperature=0.0,
            system="You are a concise assistant.",
            user="Say the single word READY and nothing else.",
            max_output_tokens=64,
        )
        print(f"  text      : {res.text!r}")
        print(f"  attempts  : {res.diagnostics.attempts}")
        print(f"  items     : {list(res.diagnostics.output_item_types)}")
        print(f"  resp_id   : {res.diagnostics.response_id}")
    except ResponsesInvocationError as e:
        print(f"  FAIL      : {e}")
        print(f"  items     : {list(e.diagnostics.output_item_types)}")
        print(f"  reasoning : {e.diagnostics.reasoning_only}")
        print(f"  notes     : {e.diagnostics.notes}")
        ok = False
    print()

    # -- Structured probe --
    from pydantic import ConfigDict

    class _Probe(BaseModel):
        model_config = ConfigDict(extra="forbid")
        status: str
        answer: int

    print("[structured probe]")
    try:
        res2 = invoke_structured(
            role_env=None,
            default_model=model,
            temperature=0.0,
            schema=_Probe,
            system="You are a strict JSON emitter. Obey the requested schema exactly.",
            user="Set status to the string 'ok' and answer to the integer 42.",
            max_output_tokens=256,
        )
        print(f"  value       : {res2.value.model_dump()}")
        print(f"  attempts    : {res2.diagnostics.attempts}")
        print(f"  had_parsed  : {res2.diagnostics.had_parsed}")
        print(f"  had_text    : {res2.diagnostics.had_text}")
        print(f"  had_tool    : {res2.diagnostics.had_tool_args}")
        print(f"  items       : {list(res2.diagnostics.output_item_types)}")
        print(f"  notes       : {res2.diagnostics.notes}")
    except ResponsesInvocationError as e:
        print(f"  FAIL        : {e}")
        print(f"  items       : {list(e.diagnostics.output_item_types)}")
        print(f"  reasoning   : {e.diagnostics.reasoning_only}")
        print(f"  val_err     : {(e.diagnostics.validation_error or '')[:200]}")
        print(f"  notes       : {e.diagnostics.notes}")
        ok = False

    return 0 if ok else 1


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "probe":
        sys.exit(_probe())
    print("usage: python -m graph.shared.responses_client probe")
    sys.exit(2)
