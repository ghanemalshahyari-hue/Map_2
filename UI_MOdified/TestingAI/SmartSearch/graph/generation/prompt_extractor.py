"""graph/generation/prompt_extractor.py — free-form prompt → Phase3Inputs.

One upstream LLM call turns a user-written operation brief (Arabic or
English free prose) into a validated :class:`Phase3Inputs` pydantic
instance. The rest of the Phase 3 pipeline consumes that instance
exactly as if it had been loaded from a hand-authored
``inputs.json`` — the revision locked as §18 C16 of the scoping doc
("free-form prompt input surface", 2026-04-22).

Design constraints from §18 C16:

- The prompt is an OPERATIONAL BRIEF only: facts, scenario, scope.
  Drafting instructions (tone, style, emphasis) still live in the
  YAML ``prompt_ar`` per group — they are not the user's concern.
- Persist the extraction output (the caller writes
  ``extracted_inputs.json``; this module does not touch disk).
- Extract ONCE at the top of a run, never per drafting call. Cache
  at the group / doc layer is keyed on the prompt hash (via
  :mod:`graph.generation.cache`).

Module surface is deliberately tight: one public function,
:func:`extract_inputs`, plus a diagnostic ``__main__`` and a
lightweight self-test.

Standalone verification::

    python -m graph.generation.prompt_extractor data/phase3_prompt.example.txt
    python -m graph.generation.prompt_extractor --selftest
"""

from __future__ import annotations

import hashlib

from graph.generation.llm import DEFAULT_EXTRACTOR_MODEL, DEFAULT_EXTRACTOR_TEMPERATURE
from graph.generation.schema.inputs import Phase3Inputs
from graph.shared.responses_client import (
    ResponsesInvocationError,
    invoke_structured,
)

__all__ = [
    "ExtractionError",
    "compose_three_prompts",
    "extract_inputs",
    "extract_inputs_from_three",
    "prompt_sha256",
]


class ExtractionError(Exception):
    """Raised when the extractor can't produce a valid Phase3Inputs.

    Wraps the underlying cause (empty prompt, LLM call failure,
    schema validation failure) with enough context for the CLI to
    emit an actionable message.
    """


# --------------------------------------------------------------- system prompt

_EXTRACTOR_SYSTEM_PROMPT = """\
You are a strict military-intelligence information extractor. Given a user's
free-form operation brief (Arabic or English), you extract the structured facts
the Phase 3 document generator needs to run. You DO NOT invent, interpret, or
translate facts. You do not add drafting style or tone — those live elsewhere.

THE USER MESSAGE CARRIES UP TO THREE LABELLED INPUT SECTIONS (§C22)
- [PROMPT 1 — TIME / التحليل الزمني]: timing facts (reporting time, H-hour,
  total minutes, time zone, first/last light, moon phase). Authoritative for
  every field under ``timing.``.
- [PROMPT 2 — PLANNING / دليل التخطيط الأولي]: the planning context
  (operation identity, task organization, references, locations, commander's
  intent). Authoritative for ``operation.``, ``references.``, ``locations.``,
  and ``mission_intent_free_text``. These values also back the Warning Order,
  which has no prompt of its own.
- [PROMPT 3 — INTEL & READINESS / إيجاز هيئة الركن]: environment notes,
  friendly-unit readiness, and a running intel picture. Authoritative for
  ``operation.own_training_readiness`` and ``operation.movement_order``. The
  free-form enemy analysis here is CONTEXT ONLY — the downstream retriever
  still pulls enemy-composition / disposition / strength / COA paragraphs
  from doctrine, not from this section.

Single-prompt submissions (no section labels) are still valid — treat the
whole user message as one combined brief and populate whatever fields you
can. Never cross-contaminate: facts in PROMPT 1 must not overwrite operation
identity drawn from PROMPT 2, and so on.

The target schema is strict. Every required field MUST be filled with a value
lifted from or derivable from the brief; unknown or truly-absent optional
fields should be null. Follow these rules exactly:

DATES AND TIMES
- Every date/time field uses ISO 8601 with a timezone offset, e.g.
  "2026-05-01T07:00:00+03:00". Never emit a naive datetime.
- If the user gives a relative time ("tomorrow at 0700", "غداً الساعة 4 مساءً"),
  resolve it to an absolute ISO timestamp using context in the brief
  (operation date, timezone mentioned, etc.).

TIMING CONSISTENCY (load-bearing)
- total_available_minutes MUST equal the minute-count from
  reporting_date_gregorian to h_hour_gregorian exactly. If the brief gives
  only two of the three (e.g. a total of 15 hours and an H-Hour), compute the
  third. If all three are present and inconsistent, prefer reporting_time +
  total_available_minutes and set h_hour_gregorian to reporting +
  total_available. Do NOT silently accept drift.

OPERATION FIELDS (required)
- operation.name: preserve the user's original phrasing (Arabic is fine).
- operation.echelon: normalized English noun — one of
  brigade / battalion / division / regiment / company / platoon / squad / corps.
- operation.axis: preserve original phrasing (Arabic direction names OK).
- operation.operation_type: normalized English noun — one of
  attack / defense / reconnaissance / security / movement_to_contact /
  retrograde / stability.

LOCATIONS
- locations.assembly_area required. If the brief says "TOC at coordinate Q T
  12345 67890" preserve verbatim. Optional fields (area_of_interest,
  area_of_operations, civil_considerations) stay null when absent.

REFERENCES
- references.letter_ref_number, warning_order_ref_number, maps: preserve
  verbatim when present. These are usually shown in a "References:" block in
  the brief. If the brief genuinely lacks one, use a clear placeholder like
  "يُصدر لاحقاً" for letter_ref_number/warning_order_ref_number and "غير محدد"
  for maps — never leave them empty strings.

RETRIEVAL
- retrieval.collections = ["ingest__doctrine__bgem3"] ALWAYS. This is the
  only doctrine collection in the v1 system. Do not add other collections even
  if the brief mentions specific manuals.

MISSION INTENT
- mission_intent_free_text: a concise one-to-two-sentence Arabic summary of
  the operation's intent, purpose, and desired end state. If the brief is in
  Arabic, reuse its own sentences. If in English, translate to Arabic.

DOCUMENT SELECTION
- document_selection: v1 (§18 C21) ships four documents. Defaults:
    time_analysis             = true   # تحليل الوقت
    initial_planning_guidance = true   # دليل التخطيط الأولي
    warning_order             = true   # الأمر الإنذاري
    staff_brief               = true   # إيجاز هيئة الركن
    operation_order           = false  # full OPORD — v2 only
    staff_estimate            = false  # full Steps 2–6 Staff Estimate — v2 only
  The CLI enforces the same scope via a v1_scope gate on the template YAMLs,
  so requesting operation_order or staff_estimate here will be skipped anyway;
  still, keep the defaults above so the extracted inputs match what actually
  runs. Flip a v1 flag to false ONLY if the brief explicitly says something
  like "skip the time analysis" or "only generate the warning order".

OUTPUT
- output.run_id: synthesize a short identifier from operation name + reporting
  date, like "2026-04-30_saqr_shamal". ASCII only, lowercase, underscores. No
  spaces, no Arabic. If you genuinely cannot synthesize one, use the literal
  string "unnamed_run" — the CLI will override.
- output.output_root_override: null unless the brief explicitly names an
  output directory.

ERROR HANDLING
- If a required field is truly absent and cannot be reasonably synthesized,
  raise your confusion through the structured output by producing a clearly
  invalid value — the downstream validator will reject it and surface the
  problem. Do not silently hallucinate.
"""


# --------------------------------------------------------------- helpers

def prompt_sha256(prompt_text: str) -> str:
    """Deterministic short hash of a prompt, for cache keys (§18 C16).

    Returns the first 16 hex chars of the full SHA-256 — 64 bits of
    entropy, matches the width used by :mod:`graph.generation.cache`.
    """
    return hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()[:16]


# Section markers for the three-prompt surface (§C22). The extractor's
# system prompt refers to these literal strings, so keep them in sync.
_SECTION_HEADER_1 = "[PROMPT 1 — TIME / التحليل الزمني]"
_SECTION_HEADER_2 = "[PROMPT 2 — PLANNING / دليل التخطيط الأولي]"
_SECTION_HEADER_3 = "[PROMPT 3 — INTEL & READINESS / إيجاز هيئة الركن]"


def compose_three_prompts(
    prompt_1: str,
    prompt_2: str,
    prompt_3: str,
) -> str:
    """Concatenate three per-doc prompts into one labelled brief (§C22).

    The extractor treats each section as authoritative for its own
    field slice (see the system prompt). Each prompt must be non-empty
    after strip() — the CLI and UI enforce that before calling. Blank
    lines between sections are intentional so the LLM parses the
    boundaries cleanly.
    """
    return (
        f"{_SECTION_HEADER_1}\n{prompt_1.strip()}\n\n"
        f"{_SECTION_HEADER_2}\n{prompt_2.strip()}\n\n"
        f"{_SECTION_HEADER_3}\n{prompt_3.strip()}\n"
    )


# --------------------------------------------------------------- public API

def extract_inputs(prompt_text: str) -> Phase3Inputs:
    """Extract a :class:`Phase3Inputs` from a free-form operation brief.

    Structured output is routed through
    :func:`graph.shared.responses_client.invoke_structured` (§C27,
    2026-04-24) so the wire call hits ``POST /v1/responses`` and gets
    the adapter's finalize + repair ladder for free.  Tests that
    previously injected a stub ``llm`` now monkeypatch
    ``graph.generation.prompt_extractor.invoke_structured``.

    Args:
        prompt_text: the user-authored brief. Arabic, English, or
            mixed. Must be non-empty.

    Returns:
        A validated :class:`Phase3Inputs` instance.

    Raises:
        ExtractionError: the prompt is empty, the LLM call failed,
            or the structured output didn't validate against
            :class:`Phase3Inputs`. The message carries enough
            context for the CLI to surface it.
    """
    if not isinstance(prompt_text, str) or not prompt_text.strip():
        raise ExtractionError("Prompt text is empty or whitespace-only.")

    try:
        result = invoke_structured(
            role_env="PHASE3_EXTRACTOR_MODEL",
            default_model=DEFAULT_EXTRACTOR_MODEL,
            temperature=DEFAULT_EXTRACTOR_TEMPERATURE,
            schema=Phase3Inputs,
            system=_EXTRACTOR_SYSTEM_PROMPT,
            user=prompt_text,
        )
    except ResponsesInvocationError as e:
        raise ExtractionError(
            f"Extractor call failed on {e.diagnostics.model}@{e.diagnostics.endpoint} "
            f"after {e.diagnostics.attempts} attempt(s): {e}"
        ) from e
    except Exception as e:  # pragma: no cover - defensive
        raise ExtractionError(
            f"Extractor call failed ({type(e).__name__}): {e}"
        ) from e

    if not isinstance(result.value, Phase3Inputs):
        raise ExtractionError(
            f"Extractor returned {type(result.value).__name__}, expected Phase3Inputs. "
            f"This usually means the structured-output adapter lost the schema."
        )
    return result.value


def extract_inputs_from_three(
    prompt_1: str,
    prompt_2: str,
    prompt_3: str,
) -> tuple[Phase3Inputs, str]:
    """Primary §C22 entry point — three per-doc prompts → Phase3Inputs.

    Each argument is a non-empty text block. The function composes
    them into a single labelled brief via :func:`compose_three_prompts`
    and calls :func:`extract_inputs` once; the LLM sees all three
    sections at the same time, which keeps extraction cheap and
    guarantees cross-section consistency (for instance, the H-hour
    cited in PROMPT 2's commander's intent must match the H-hour
    declared in PROMPT 1).

    Returns ``(inputs, composed_text)`` so the caller can persist the
    composed brief alongside ``extracted_inputs.json`` and stamp
    ``user_prompt_sha256(composed_text)`` into the cache key.
    """
    for label, text in (("prompt_1", prompt_1), ("prompt_2", prompt_2), ("prompt_3", prompt_3)):
        if not isinstance(text, str) or not text.strip():
            raise ExtractionError(f"{label} is empty or whitespace-only.")
    composed = compose_three_prompts(prompt_1, prompt_2, prompt_3)
    return extract_inputs(composed), composed


# --------------------------------------------------------------- self-test

def _selftest() -> int:
    """Lightweight self-test that doesn't hit any LLM endpoint.

    Verifies:
      (1) empty prompt raises ExtractionError with a clean message.
      (2) A stub adapter returning a valid Phase3Inputs is passed
          through unchanged.
      (3) A stub adapter returning a wrong-type value raises
          ExtractionError (defensive check against a misbehaving adapter).
      (4) prompt_sha256 is deterministic and 16 hex chars.

    Uses monkeypatching of ``invoke_structured`` instead of the old
    ``llm=`` injection — the new adapter has no exposed hook beyond
    module-level rebinding.

    Exit code 0 iff all four pass. Run via::

        python -m graph.generation.prompt_extractor --selftest
    """
    from dataclasses import dataclass as _dataclass

    # ``__main__``-gotcha-safe rebinding: use globals() directly instead of
    # ``import graph.generation.prompt_extractor as _self_module`` because
    # running ``python -m graph.generation.prompt_extractor --selftest``
    # loads this file as ``__main__`` while a sibling import loads it as
    # ``graph.generation.prompt_extractor`` — two different module objects.
    _globals = globals()
    failures: list[str] = []

    # (1) Empty-prompt guard
    for bad in ("", "   ", None):
        try:
            extract_inputs(bad)  # type: ignore[arg-type]
            failures.append(f"empty-prompt guard missed {bad!r}")
        except ExtractionError:
            pass
        except (TypeError, AttributeError):
            # None path — also acceptable; explicitly not happy path.
            pass

    # (2) Valid pass-through via monkeypatched invoke_structured.
    fixture = Phase3Inputs.model_validate({
        "operation": {
            "name": "test op",
            "echelon": "brigade",
            "axis": "north",
            "operation_type": "attack",
        },
        "references": {
            "letter_ref_number": "TEST/1",
            "warning_order_ref_number": "TEST/2",
            "maps": "test map",
        },
        "locations": {"assembly_area": "test area"},
        "timing": {
            "reporting_date_gregorian": "2026-04-30T16:00:00+03:00",
            "h_hour_gregorian": "2026-05-01T07:00:00+03:00",
            "total_available_minutes": 900,
            "time_zone": "UTC+3",
        },
        "retrieval": {"collections": ["ingest__doctrine__bgem3"]},
        "mission_intent_free_text": "test intent",
        "output": {"run_id": "test_run"},
    })

    @_dataclass
    class _StubResult:
        value: object
        response_id: str | None = None
        diagnostics: object = None

    real_invoke = _globals["invoke_structured"]

    def _good_stub(**kwargs):
        assert kwargs["schema"] is Phase3Inputs
        return _StubResult(value=fixture)

    _globals["invoke_structured"] = _good_stub
    try:
        result = extract_inputs("any prompt")
        if result is not fixture:
            failures.append("pass-through stub did not return fixture as-is")

        # (3) Wrong-type fallback
        def _bad_stub(**kwargs):
            return _StubResult(value={"not": "a Phase3Inputs"})

        _globals["invoke_structured"] = _bad_stub
        try:
            extract_inputs("any prompt")
            failures.append("wrong-type stub did not raise")
        except ExtractionError:
            pass
    finally:
        _globals["invoke_structured"] = real_invoke

    # (4) prompt_sha256 determinism + width
    digest1 = prompt_sha256("hello world")
    digest2 = prompt_sha256("hello world")
    if digest1 != digest2:
        failures.append("prompt_sha256 is not deterministic")
    if len(digest1) != 16 or not all(c in "0123456789abcdef" for c in digest1):
        failures.append(f"prompt_sha256 shape wrong: {digest1!r}")

    if failures:
        for f in failures:
            print(f"FAIL  {f}")
        return 1
    print("OK  prompt_extractor self-test (4/4)")
    return 0


# --------------------------------------------------------------- CLI

if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        sys.exit(_selftest())

    # Real-LLM smoke: read a prompt file, print the extracted Phase3Inputs.
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

    if len(sys.argv) < 2:
        print(
            "usage:\n"
            "  python -m graph.generation.prompt_extractor <prompt.txt>     # hits OpenAI\n"
            "  python -m graph.generation.prompt_extractor --selftest       # offline"
        )
        sys.exit(2)

    prompt_path = Path(sys.argv[1])
    prompt_text = prompt_path.read_text(encoding="utf-8")
    inputs = extract_inputs(prompt_text)
    print(f"OK  extracted from {prompt_path}  (prompt_sha={prompt_sha256(prompt_text)})")
    print(json.dumps(inputs.model_dump(mode="json"), indent=2, ensure_ascii=False))
