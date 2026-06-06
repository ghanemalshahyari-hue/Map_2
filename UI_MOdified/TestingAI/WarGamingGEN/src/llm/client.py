"""
client.py — OpenAI Responses API wrapper with Pydantic structured output.

Matches DecisionMakingSteps's LLM_USE_RESPONSES_API=1 default, so the same
endpoint config works against OpenAI cloud (now) and any compatible
self-hosted endpoint (later — litellm, LM Studio, vLLM).

Single class: LLMClient. One method: call_with_schema(messages, schema, ...).
"""
from __future__ import annotations
import json
import os
import time
from pathlib import Path
from typing import Type, TypeVar
from openai import OpenAI
from openai import APIError, APITimeoutError, RateLimitError
from pydantic import BaseModel, ValidationError
from ..config import load_llm_config

T = TypeVar("T", bound=BaseModel)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class LLMClient:
    """Thin wrapper around OpenAI's Responses API with structured-output validation."""

    def __init__(self, *, audit_dir: Path | None = None) -> None:
        cfg = load_llm_config()
        self.cfg = cfg
        kwargs: dict = {"api_key": cfg.api_key, "timeout": 90.0}
        if cfg.base_url:
            kwargs["base_url"] = cfg.base_url
        self.client = OpenAI(**kwargs)
        self.audit_dir = audit_dir
        if audit_dir:
            audit_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Plain call (no schema validation) — for the scene setter, debug, etc.
    # ------------------------------------------------------------------
    def call_text(
        self,
        *,
        system: str,
        user: str,
        model: str | None = None,
        temperature: float = 0.2,
        max_output_tokens: int = 2000,
        tag: str = "unknown",
    ) -> str:
        model = model or self.cfg.model
        try:
            text = self._call_model_text(
                system=system, user=user, model=model,
                temperature=temperature, max_output_tokens=max_output_tokens,
            )
            self._audit(tag=tag, model=model, system=system, user=user,
                        response_text=text, schema=None, parsed=None,
                        attempts=1, error=None)
            return text
        except Exception as e:
            self._audit(tag=tag, model=model, system=system, user=user,
                        response_text=None, schema=None, parsed=None,
                        attempts=1, error=repr(e))
            raise

    # ------------------------------------------------------------------
    # Structured-output call with schema validation + retry
    # ------------------------------------------------------------------
    def call_with_schema(
        self,
        *,
        schema: Type[T],
        system: str,
        user: str,
        model: str | None = None,
        temperature: float = 0.2,
        max_output_tokens: int = 4000,
        max_retries: int = 2,
        tag: str = "unknown",
        validation_context: dict | None = None,
    ) -> T:
        """Call LLM, parse JSON, validate against `schema`, retry on failure.

        `validation_context` is forwarded to Pydantic's model_validate(...)
        so schema validators can do reality checks against external data
        (e.g. UID membership in the OOB).
        """
        model = model or self.cfg.model
        last_err: str | None = None
        last_text: str | None = None
        if not self.cfg.use_responses_api and _env_bool("LLM_LOCAL_FORCE_FALLBACK", False):
            fallback = self._fallback_for_schema(
                schema,
                validation_context or {},
                "LLM_LOCAL_FORCE_FALLBACK=1",
            )
            self._audit(tag=f"{tag}_fallback", model=model, system=system, user=user,
                        response_text=None, schema=schema.__name__,
                        parsed=fallback.model_dump(), attempts=0,
                        error="forced local structured fallback")
            return fallback

        for attempt in range(max_retries + 1):
            # On retry, tell the LLM what went wrong.
            retry_user = user
            if attempt > 0 and last_err:
                retry_user = (
                    f"{user}\n\n"
                    f"⚠️ Your previous response failed schema validation:\n{last_err}\n"
                    f"Return ONLY a JSON object matching the schema. No prose, no markdown fences."
                )
            try:
                text = self._call_model_text(
                    system=system, user=retry_user, model=model,
                    temperature=temperature, max_output_tokens=max_output_tokens,
                    json_mode=True,
                )
                last_text = text
                parsed = self._parse_and_validate(text, schema, context=validation_context)
                self._audit(tag=tag, model=model, system=system, user=retry_user,
                            response_text=text, schema=schema.__name__,
                            parsed=parsed.model_dump(),
                            attempts=attempt + 1, error=None)
                return parsed
            except (APITimeoutError, RateLimitError) as e:
                last_err = f"OpenAI {type(e).__name__}: {e}"
                if attempt < max_retries:
                    time.sleep(2 ** attempt)  # 1s, 2s, 4s
                    continue
                if not self.cfg.use_responses_api:
                    return self._fallback_for_schema(schema, validation_context or {}, last_err)
                raise
            except (ValidationError, json.JSONDecodeError) as e:
                last_err = f"{type(e).__name__}: {e}"
                if attempt < max_retries:
                    continue
                self._audit(tag=tag, model=model, system=system, user=retry_user,
                            response_text=last_text, schema=schema.__name__,
                            parsed=None, attempts=attempt + 1, error=last_err)
                if not self.cfg.use_responses_api:
                    fallback = self._fallback_for_schema(schema, validation_context or {}, last_err)
                    self._audit(tag=f"{tag}_fallback", model=model, system=system, user=retry_user,
                                response_text=last_text, schema=schema.__name__,
                                parsed=fallback.model_dump(), attempts=attempt + 1,
                                error=f"fallback used after {last_err}")
                    return fallback
                raise RuntimeError(
                    f"LLM output failed schema validation after {max_retries + 1} attempts. "
                    f"Last error: {last_err}\nLast response: {last_text[:500]}"
                )
        raise RuntimeError("unreachable")

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _call_model_text(
        self,
        *,
        system: str,
        user: str,
        model: str,
        temperature: float,
        max_output_tokens: int,
        json_mode: bool = False,
    ) -> str:
        """Call either Responses API or chat completions and return text."""
        if self.cfg.use_responses_api:
            resp = self._call_responses(
                system=system,
                user=user,
                model=model,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
                json_mode=json_mode,
            )
            return resp.output_text or ""

        resp = self._call_chat_completions(
            system=system,
            user=user,
            model=model,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            json_mode=json_mode,
        )
        return resp.choices[0].message.content or ""

    def _call_responses(
        self,
        *,
        system: str,
        user: str,
        model: str,
        temperature: float,
        max_output_tokens: int,
        json_mode: bool = False,
    ):
        """Single Responses-API call."""
        kwargs: dict = {
            "model": model,
            "input": [
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }
        if json_mode:
            # Force the model to return parseable JSON.
            kwargs["text"] = {"format": {"type": "json_object"}}
        return self.client.responses.create(**kwargs)

    def _call_chat_completions(
        self,
        *,
        system: str,
        user: str,
        model: str,
        temperature: float,
        max_output_tokens: int,
        json_mode: bool = False,
    ):
        """Single OpenAI-compatible chat-completions call for local endpoints."""
        kwargs: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.0 if json_mode else temperature,
            "max_tokens": min(max_output_tokens, 1200 if json_mode else 350),
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        return self.client.chat.completions.create(**kwargs)

    def _parse_and_validate(self, text: str, schema: Type[T],
                              context: dict | None = None) -> T:
        """Strip optional markdown fences, parse JSON, validate against schema.

        `context` is forwarded to schema.model_validate so model_validator
        functions can read external reality checks (e.g. valid OOB UIDs).
        """
        s = text.strip()
        if s.startswith("```"):
            # ```json\n{...}\n```
            s = s.split("\n", 1)[1] if "\n" in s else s[3:]
            s = s.rsplit("```", 1)[0] if s.endswith("```") else s
            s = s.strip()
            if s.startswith("json"):
                s = s[4:].strip()
        data = json.loads(s)
        data = self._normalize_structured_output(data, schema, context=context)
        return schema.model_validate(data, context=context)

    def _normalize_structured_output(self, data, schema: Type[T],
                                     context: dict | None = None):
        """Repair common local-model JSON shape mistakes before validation."""
        if not isinstance(data, dict):
            return data
        if schema.__name__ == "TurnAction":
            return self._normalize_turn_action(data, context or {})
        if schema.__name__ == "PhaseResolution":
            return self._normalize_phase_resolution(data, context or {})
        return data

    def _normalize_turn_action(self, data: dict, context: dict) -> dict:
        hints = context.get("component_uid_hints") or {}
        side_uids = sorted(context.get("side_uids") or [])
        for comp in ("strategic", "maritime", "air", "mines", "usv_uav", "sof", "land", "ew"):
            value = data.get(comp)
            if value in ("", [], False):
                data[comp] = None
                continue
            if not isinstance(value, dict):
                continue

            cited = value.get("doctrine_cited")
            if cited is None:
                value["doctrine_cited"] = []
            elif isinstance(cited, str):
                value["doctrine_cited"] = [cited]
            elif not isinstance(cited, list):
                value["doctrine_cited"] = [str(cited)]

            what = value.get("what")
            actor = value.get("actor")
            if (actor is None or actor == "") and what:
                candidates = hints.get(comp) or side_uids
                if candidates:
                    value["actor"] = candidates[0]
            if value.get("actor") is None and not value.get("what"):
                data[comp] = None
                continue
            for field in ("what", "why", "intended_effect"):
                if value.get(field) is None:
                    value[field] = ""
        if not data.get("overall_intent"):
            data["overall_intent"] = "No stated intent."
        return data

    def _normalize_phase_resolution(self, data: dict, context: dict) -> dict:
        all_uids = sorted(context.get("all_uids") or [])
        if not isinstance(data.get("unit_outcomes"), list):
            data["unit_outcomes"] = []
        for outcome in data["unit_outcomes"]:
            if not isinstance(outcome, dict):
                continue
            if not outcome.get("unit_uid") and all_uids:
                outcome["unit_uid"] = all_uids[0]
            if not outcome.get("cause_actor") and all_uids:
                outcome["cause_actor"] = all_uids[0]
            if not outcome.get("status_change"):
                outcome["status_change"] = "unchanged"
            if outcome.get("damage_pct") is None:
                outcome["damage_pct"] = 0.0
            for field in ("cause_what", "cause_doctrine"):
                if outcome.get(field) is None:
                    outcome[field] = ""
        return data

    def _fallback_for_schema(self, schema: Type[T], context: dict, error: str) -> T:
        if schema.__name__ == "TurnAction":
            return self._fallback_turn_action(schema, context, error)
        if schema.__name__ == "PhaseResolution":
            return self._fallback_phase_resolution(schema, context, error)
        raise RuntimeError(f"Local LLM failed and no fallback exists for {schema.__name__}: {error}")

    def _fallback_turn_action(self, schema: Type[T], context: dict, error: str) -> T:
        hints = context.get("component_uid_hints") or {}
        side_uids = sorted(context.get("side_uids") or [])
        actor = None
        component = "land"
        for name in ("land", "strategic", "maritime", "air", "ew", "sof", "mines", "usv_uav"):
            candidates = hints.get(name) or []
            if candidates:
                actor = candidates[0]
                component = name
                break
        actor = actor or (side_uids[0] if side_uids else "UNKNOWN-UNIT")
        data = {
            "overall_intent": (
                "No kinetic engagement - local model fallback used after schema failure; "
                "forces hold position pending a valid commander decision."
            ),
            component: {
                "actor": actor,
                "what": "Held position - local model fallback after invalid structured output.",
                "why": f"Fallback preserves run continuity; original error: {error[:180]}",
                "intended_effect": "Maintain state without inventing combat effects.",
                "doctrine_cited": ["local-model-fallback"],
            },
        }
        return schema.model_validate(data, context=context)

    def _fallback_phase_resolution(self, schema: Type[T], context: dict, error: str) -> T:
        metrics = context.get("metrics") or {}
        data = {
            "phase": int(context.get("phase", metrics.get("phase", 0))),
            "combined_effect": (
                "Local model fallback used after invalid adjudicator output. "
                "No additional combat effects were applied this phase."
            ),
            "unit_outcomes": [],
            "step_advantage": metrics.get("advantage_label", "CONTESTED"),
            "advantage_reason": f"Engine metrics preserved; local fallback after: {error[:180]}",
            "force_ratio_local": float(metrics.get("force_ratio_local", 1.0)),
            "force_ratio_operational": float(metrics.get("force_ratio_operational", 1.0)),
            "mines_remaining": int(metrics.get("blue_mines_remaining", 0)),
            "ew_strength_red": float(metrics.get("ew_strength_red", 0.0)),
            "ew_strength_blue": float(metrics.get("ew_strength_blue", 0.0)),
        }
        return schema.model_validate(data, context=context)

    def _audit(self, **kwargs):
        if not self.audit_dir:
            return
        tag = kwargs.get("tag", "unknown")
        ts = time.strftime("%Y%m%d_%H%M%S")
        path = self.audit_dir / f"{ts}_{tag}.json"
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(kwargs, f, indent=2, ensure_ascii=False, default=str)
        except Exception as e:
            print(f"[audit] WARN: failed to write {path}: {e}")


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    from pydantic import BaseModel

    class TestOut(BaseModel):
        answer: str
        confidence: float

    c = LLMClient()
    print(f"Config: model={c.cfg.model}, base_url={c.cfg.base_url or '(default)'}, key={'set' if c.cfg.api_key else 'MISSING'}")

    # Plain text call
    print("\n=== Plain text call ===")
    out = c.call_text(
        system="You are a terse military operations analyst.",
        user="In one sentence: what doctrinal threshold defines a 'decisive' attack against a prepared defense?",
        temperature=0.0, max_output_tokens=200, tag="smoke_text",
    )
    print(out)

    # Structured call
    print("\n=== Structured call (Pydantic) ===")
    out2 = c.call_with_schema(
        schema=TestOut,
        system="You are a terse military operations analyst. Return strict JSON only.",
        user='What is FM 3-90\'s attacker-to-defender ratio for decisive offense against prepared defense? Return JSON with {"answer": "<text>", "confidence": <float 0-1>}',
        temperature=0.0, max_output_tokens=200, tag="smoke_struct",
    )
    print(f"answer: {out2.answer}")
    print(f"confidence: {out2.confidence}")
