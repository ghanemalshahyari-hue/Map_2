"""graph/generation/field_dispatcher.py — the 5-kind walker.

Given a validated :class:`~graph.generation.template_loader.Template`
and a validated :class:`~graph.generation.schema.inputs.Phase3Inputs`,
this module walks every schema field and resolves its final value
according to the field's ``kind``:

    static     → YAML literal
    computed   → pure Python call under ``graph.generation.time_math``
    input      → JSON-pointer-style lookup into Phase3Inputs
    derived    → reference to another resolved field (in-template
                 at M2; cross-document at M3+)
    retrieved  → Phase 2 search() + LLM drafting

Only the first four kinds are implemented at M2. A ``retrieved``
field triggers :class:`RetrievedFieldNotImplemented`, with the
field location in the message so the CLI can report "Doc N is an
M3+ milestone".

The dispatcher runs in three passes so derived fields can reference
any non-derived field regardless of declaration order:

    1. Resolve every ``static``, ``input``, ``computed`` field.
    2. Skip ``retrieved`` (or raise, see above).
    3. Resolve ``derived`` in a topological-ish pass; a derived
       field that points at another derived field is re-queued up to
       ``MAX_DERIVED_PASSES`` times. (The loader already rejects
       cycles, so this always terminates.)

Placeholder syntax inside ``computed.arguments`` values:

    "{{input: timing.total_available_minutes}}"    → JSON lookup

Double-brace ``{{...}}`` avoids collision with normal dict/string
usage — templates can still carry plain ``{foo}`` text that isn't
an input placeholder (seed strings do this for query interpolation
at the retrieval layer, which is a separate concern).

The output is a :class:`DispatchResult`: ``{schema_name →
{field_name → resolved_value}}`` plus auxiliary metadata the
assembler needs (the ``PlanningAllocation`` used for Doc 3's
timeline table, unresolved-retrieval markers, etc.).
"""

from __future__ import annotations

import importlib
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from graph.generation.schema.inputs import Phase3Inputs
from graph.generation.template_loader import (
    ComputedField,
    DerivedField,
    InputField,
    RetrievedField,
    SourceFileExtractedField,
    StaticField,
    StaticPlaceholderField,
    Template,
)
from graph.generation import time_math as _time_math_module


# §C23 — user-facing Arabic placeholders. Used by the dispatcher when a
# source-file-extracted field came back empty or missing, when an optional
# input path resolved to None, or when a cross-doc derived reference
# can't be resolved.
PLACEHOLDER_NOT_IN_INPUTS_AR = "غير متوفر في المدخلات"
PLACEHOLDER_DEFERRED_AR = "يُصدر لاحقاً"
PLACEHOLDER_NOT_IN_DOCTRINE_AR = "غير متوفر في العقيدة المتاحة"
# Sentinel the extractor LLM writes when a fact is truly absent from every
# source file. Kept in lock-step with
# prompts/_universal_instructions_ar.py::ABSENT_SENTINEL_AR.
EXTRACTOR_ABSENT_SENTINEL_AR = "غير موجود في الملفات"

__all__ = [
    "DispatchResult",
    "RetrievedFieldNotImplemented",
    "DispatchError",
    "dispatch_template",
    "run_retrieval_phase",
]


# ``{{input: a.b.c}}`` — double-brace prevents collision with
# curly-brace query-seed interpolation (seeds use single braces).
_INPUT_PLACEHOLDER = re.compile(r"^\{\{\s*input\s*:\s*([A-Za-z0-9_.\[\]]+)\s*\}\}$")

# Maximum number of derived-resolution passes. The loader rejects
# cycles so we only ever need len(template.schemas) passes; this
# cap is a safety net for pathological templates.
_MAX_DERIVED_PASSES = 32


class DispatchError(Exception):
    """Raised when dispatch cannot resolve a field for a reason the
    template loader didn't catch (usually missing optional inputs
    or unresolved dotted paths at run time)."""


class RetrievedFieldNotImplemented(DispatchError):
    """Raised when the dispatcher hits a ``kind: retrieved`` field.

    M2 ships without the retrieval stack wired in, so any Document
    containing retrieved fields (OPORD / Staff Estimates / WARNO)
    fails fast here. M3 will implement
    :mod:`graph.generation.retrieval_group`.
    """


# A sentinel for "not yet resolved" so derived-pass loops are safe
# against ``None``-valued inputs.
_UNRESOLVED: Any = object()


@dataclass(frozen=True)
class DispatchResult:
    """Resolved values keyed by ``(schema, field)``.

    ``values`` is the flat output dict the assembler consumes.
    ``allocation`` is the :class:`PlanningAllocation` produced by
    the first ``compute_allocation`` call in this dispatch run;
    the renderer's ``timeline_table`` layout reaches for it. The
    field is ``None`` if no ``compute_allocation`` call happened
    in this template (e.g. OPORD / Staff Estimates).

    ``retrieval_results`` is one entry per retrieval group in the
    template — each carries the final :class:`SourcedHit` pool used
    to draft that group's fields. The renderer walks this to build
    the citation-endnotes section. Empty for templates with no
    retrieved fields (Doc 3).
    """

    values: dict[str, dict[str, Any]]
    allocation: _time_math_module.PlanningAllocation | None = None
    retrieval_results: tuple[Any, ...] = ()


# ------------------------------------------------------------- JSON pointer lookup

def _lookup_input_path(inputs: Phase3Inputs, path: str) -> Any:
    """Resolve a dotted path like ``"timing.total_available_minutes"``
    against a pydantic model, returning the resolved value.

    Raises :class:`DispatchError` when any segment is missing — the
    loader cannot check this because the input model has optional
    fields (see ``graph/generation/schema/inputs.py``); missing
    required paths are caught at run time.
    """
    current: Any = inputs
    consumed: list[str] = []
    for segment in path.split("."):
        if isinstance(current, BaseModel):
            if segment not in current.__class__.model_fields:
                raise DispatchError(
                    f"input path {path!r}: segment {segment!r} is not a field "
                    f"of {current.__class__.__name__}; consumed={'.'.join(consumed) or '<root>'}"
                )
            current = getattr(current, segment)
        elif isinstance(current, dict):
            if segment not in current:
                raise DispatchError(
                    f"input path {path!r}: key {segment!r} missing in dict "
                    f"at {'.'.join(consumed) or '<root>'}"
                )
            current = current[segment]
        else:
            raise DispatchError(
                f"input path {path!r}: cannot traverse into {type(current).__name__} "
                f"at {'.'.join(consumed) or '<root>'}"
            )
        consumed.append(segment)
    return current


# ------------------------------------------------------------- argument resolution

def _resolve_arguments(
    arguments: dict[str, Any], inputs: Phase3Inputs, loc: str
) -> dict[str, Any]:
    """Substitute every ``{{input: ...}}`` placeholder in an
    arguments dict; leave plain values untouched."""
    resolved: dict[str, Any] = {}
    for name, raw in arguments.items():
        if isinstance(raw, str):
            m = _INPUT_PLACEHOLDER.match(raw)
            if m is not None:
                path = m.group(1)
                try:
                    resolved[name] = _lookup_input_path(inputs, path)
                except DispatchError as e:
                    raise DispatchError(
                        f"{loc}: computed.arguments[{name!r}]: {e}"
                    ) from None
                continue
        resolved[name] = raw
    return resolved


# ------------------------------------------------------------- computed dispatch

def _call_computed(
    spec: ComputedField, inputs: Phase3Inputs, loc: str
) -> tuple[Any, _time_math_module.PlanningAllocation | None]:
    """Invoke the time_math callable declared by a ComputedField.

    Only ``time_math.*`` dotted paths are accepted (the loader
    enforces the prefix). The call happens with resolved arguments;
    ``output_field`` is applied after the call returns.

    Returns ``(value, maybe_allocation)`` — if the call returned a
    :class:`PlanningAllocation` we bubble it up so the caller can
    capture it once for the whole dispatch (see DispatchResult).
    """
    assert spec.function.startswith("time_math.")
    fn_name = spec.function.removeprefix("time_math.")
    fn = getattr(_time_math_module, fn_name, None)
    if fn is None or not callable(fn):
        raise DispatchError(
            f"{loc}: computed.function={spec.function!r} is not a callable "
            f"attribute of graph.generation.time_math"
        )
    kwargs = _resolve_arguments(spec.arguments, inputs, loc)
    try:
        result = fn(**kwargs)
    except TypeError as e:
        raise DispatchError(
            f"{loc}: computed.function={spec.function!r} call failed: {e}. "
            f"Arguments were: {kwargs!r}"
        ) from e
    except ValueError as e:
        raise DispatchError(
            f"{loc}: computed.function={spec.function!r} rejected its inputs: {e}. "
            f"Arguments were: {kwargs!r}"
        ) from e

    maybe_alloc = result if isinstance(result, _time_math_module.PlanningAllocation) else None

    if spec.output_field is None:
        value = result
    else:
        try:
            value = getattr(result, spec.output_field)
        except AttributeError as e:
            raise DispatchError(
                f"{loc}: computed.output_field={spec.output_field!r} not found on "
                f"return value of {spec.function!r} ({type(result).__name__})"
            ) from e

    # Pydantic string fields won't accept datetime/int — stringify.
    value = _stringify_for_pydantic(value)
    return value, maybe_alloc


def _stringify_for_pydantic(value: Any) -> Any:
    """Coerce non-str primitives to str so Pydantic schema instances
    (every Doc 1-4 field is ``str``) accept them without per-field
    validators.

    Pass dataclass-like objects through untouched — the caller is
    expected to have applied ``output_field`` already.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, bool):  # before int — bool is an int subclass
        return "نعم" if value else "لا"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


# ------------------------------------------------------------- main entry point

def run_retrieval_phase(
    template: Template,
    inputs: Phase3Inputs,
    inputs_raw: dict,
    *,
    template_path: Any = None,
    cache_dir: Any = None,
    doc_title_ar: str | None = None,
    user_prompt_sha256: str = "",
    extractor_model: str = "",
    extractor_temperature: float = 0.0,
    extracted_values: dict[str, str] | None = None,
) -> tuple[dict[str, dict[str, str]], tuple[Any, ...], tuple[Any, ...]]:
    """Run retrieval + draft + critique for every group in the template.

    Returns ``(resolved_by_group, retrieval_results)``:
    ``resolved_by_group[cls_name][fname]`` is the drafted Arabic
    string for each retrieved field; ``retrieval_results`` is the
    ordered tuple of :class:`GroupRetrievalResult` instances used
    (one per group — drives the citation endnotes layout).

    If ``cache_dir`` is given, every group is looked up there first
    and saved back on miss. Pass ``template_path`` so the cache key
    can hash the YAML file and group block; if not passed, caching
    is silently disabled (standalone dispatcher testing path).

    The ``user_prompt_sha256`` / ``extractor_model`` /
    ``extractor_temperature`` kwargs fold the extraction provenance
    into the cache key (scoping §18 C16). Defaults describe the
    ``--inputs-json`` path (no extractor involved); the CLI fills
    them on the ``--prompt`` path.

    ``extracted_values`` (added in tiered-retrieval Phase 1 — §C29)
    is the per-doc resolved-source-files dict produced by the
    upstream :func:`graph.generation.source_file_extractor.extract_for_document`
    call. Phase 1 threads it through unconditionally so Phases 5-7
    have it available for the per-group source_files_field_map and
    the source-files cache provenance keys. Today (pre-Phase-7) it
    is unused by retrieval — pure forward-compat plumbing.

    Imports the M3 retrieval / drafter / critique modules lazily
    so M2 code paths (templates with zero retrieved fields) don't
    pay the Phase 2 import cost.
    """
    # ``extracted_values`` is reserved for Phase 7's tier-aware groups
    # (source_files_field_map). Bind a default so downstream code can
    # rely on a dict shape even when the caller didn't supply one.
    extracted_values = dict(extracted_values or {})
    # Lazy imports — avoid pulling Phase 2 / LangChain into Doc 3's path.
    from graph.generation.retrieval_group import collect_group_specs, retrieve_group
    from graph.generation.section_drafter import draft_group
    from graph.generation.critique import critique_and_repair
    from graph.generation.llm import draft_config, critique_config
    from graph.generation.evidence import build_evidence_bundle

    group_specs = collect_group_specs(template)
    resolved: dict[str, dict[str, str]] = {}
    retrieval_results: list[Any] = []
    evidence_bundles: list[Any] = []

    for group in group_specs:
        retrieval = retrieve_group(group, inputs)
        retrieval_results.append(retrieval)

        # Phases 3+4 (§C30): assemble the EvidenceBundle once per
        # group and pass the same instance to drafter + critique so
        # both LLM calls see exactly the same evidence shape. For
        # legacy templates ``field_map`` is empty and the bundle has
        # only the operationalfiles channel populated → drafter and
        # critique each take their byte-equal legacy prompt path.
        # Phase 7 will source ``field_map`` from the group's YAML
        # ``source_files_field_map`` and the doctrine fan-out result.
        # §C31 Phase 7 — feed the per-group ``source_files_field_map``
        # from the GroupSpec.  Pre-Phase-7 every legacy group has an
        # empty map, so the bundle's source_files channel stays empty
        # and downstream prompts take the byte-equal legacy path.
        evidence = build_evidence_bundle(
            group_result=retrieval,
            extracted_values=extracted_values,
            field_map=group.source_files_field_map,
        )
        evidence_bundles.append(evidence)

        draft_model, draft_temp = draft_config()
        critique_model, critique_temp = critique_config()

        # Optional cache lookup.
        cached_values: dict[str, str] | None = None
        cache_key = None
        if template_path is not None and cache_dir is not None:
            from graph.generation.cache import (
                compute_group_cache_key,
                load_group,
                save_group,
                GroupDraft,
            )
            cache_key = compute_group_cache_key(
                template_path=template_path,
                group=group,
                retrieval=retrieval,
                draft_model=draft_model,
                draft_temperature=draft_temp,
                critique_model=critique_model,
                critique_temperature=critique_temp,
                use_glossary=True,
                use_reranker_final=True,
                use_hyde=False,
                inputs_raw=inputs_raw,
                user_prompt_sha256=user_prompt_sha256,
                extractor_model=extractor_model,
                extractor_temperature=extractor_temperature,
                # §C31 Phase 7 — source-files provenance + tier-aware
                # fragments.  ``field_map`` comes from the per-group
                # YAML; legacy groups have an empty map so the source-
                # evidence subset hashes the empty dict.  Tier policy
                # + collections come from the GroupSpec so flipping
                # any of these in YAML invalidates affected groups.
                extracted_values=extracted_values,
                field_map=group.source_files_field_map,
                source_file_records=(),
                tier_policy=group.tier_policy,
                operationalfiles_collections=group.operationalfiles_collections,
                doctrine_collections=group.doctrine_collections,
            )
            cached = load_group(cache_dir, cache_key)
            if cached is not None:
                cached_values = cached.field_values

        if cached_values is None:
            draft = draft_group(
                retrieval,
                inputs,
                doc_title_ar=doc_title_ar or template.meta.title_arabic,
                evidence=evidence,
            )
            outcome = critique_and_repair(retrieval, draft.field_values, evidence=evidence)
            field_values = outcome.final_values
            if cache_key is not None and cache_dir is not None:
                from graph.generation.cache import GroupDraft, save_group
                save_group(
                    cache_dir,
                    cache_key,
                    GroupDraft(
                        group_name=group.group_name,
                        schema_name=group.schema_name,
                        field_values=field_values,
                        hits=retrieval.hits,
                        canonical_rerank_query=retrieval.canonical_rerank_query,
                        resolved_seeds=retrieval.resolved_seeds,
                        allowlist_elided=retrieval.allowlist_elided,
                        cache_key_digest=cache_key.digest,
                    ),
                )
        else:
            field_values = cached_values

        resolved.setdefault(group.schema_name, {}).update(field_values)

    return resolved, tuple(retrieval_results), tuple(evidence_bundles)


def dispatch_template(
    template: Template,
    inputs: Phase3Inputs,
    *,
    retrieved_values: dict[str, dict[str, str]] | None = None,
    retrieval_results: tuple[Any, ...] = (),
    extracted_values: dict[str, str] | None = None,
) -> DispatchResult:
    """Walk the template and resolve every field against ``inputs``.

    If the template contains retrieved fields, the caller must pass
    ``retrieved_values`` — the output of :func:`run_retrieval_phase` —
    along with ``retrieval_results`` so citation endnotes can be
    built. Templates with no retrieved fields (Doc 3) leave both
    empty and the dispatcher behaves exactly as in M2.

    ``extracted_values`` (§C23) is the output of
    :func:`graph.generation.source_file_extractor.extract_for_document`
    — a flat ``{field_name: value_or_ABSENT_SENTINEL}`` map. Fields
    tagged ``kind: source_file_extracted`` read from here; if a field
    is missing or the value equals the absent sentinel, the dispatcher
    writes ``PLACEHOLDER_NOT_IN_INPUTS_AR``.

    Raises :class:`RetrievedFieldNotImplemented` only when a
    retrieved field is encountered and ``retrieved_values`` is ``None``
    — that signals an orchestration bug (retrieval pass never ran).
    """
    values: dict[str, dict[str, Any]] = {cls: {} for cls in template.schemas}
    allocation: _time_math_module.PlanningAllocation | None = None
    retrieved_values = retrieved_values or {}
    extracted_values = extracted_values or {}

    # Track which fields still need a value so the derived pass can
    # tell "not yet resolved" from "resolved to falsey string".
    pending: list[tuple[str, str, DerivedField]] = []

    # --- pass 1: static / input / computed / retrieved / extracted / placeholder ---
    for cls_name, sdef in template.schemas.items():
        for fname, spec in sdef.fields.items():
            loc = f"{cls_name}.{fname}"
            if isinstance(spec, StaticField):
                # An author-provided empty-string literal is treated as a
                # doctrine-deferred placeholder (§C23). True blanks never
                # reach the JSON / .docx.
                v = _stringify_for_pydantic(spec.value)
                if isinstance(v, str) and not v.strip():
                    v = PLACEHOLDER_DEFERRED_AR
                values[cls_name][fname] = v
            elif isinstance(spec, StaticPlaceholderField):
                # §C23 NEW — explicit placeholder authored in YAML.
                values[cls_name][fname] = (spec.value or "").strip() or PLACEHOLDER_DEFERRED_AR
            elif isinstance(spec, InputField):
                try:
                    raw = _lookup_input_path(inputs, spec.path)
                except DispatchError:
                    if spec.required:
                        raise
                    raw = spec.default if spec.default is not None else None
                # Optional-path-resolved-to-None is not the same as
                # "path missing"; Phase3Inputs has many Optional[str]
                # fields. Treat None as "missing" for defaulting
                # purposes so we don't hand None to a Pydantic str field.
                if raw is None:
                    if spec.required:
                        raise DispatchError(
                            f"{loc}: input.path={spec.path!r} resolved to None "
                            f"but field is marked required"
                        )
                    raw = spec.default if spec.default is not None else PLACEHOLDER_NOT_IN_INPUTS_AR
                # §C23 — empty string from default chain also becomes the placeholder.
                if isinstance(raw, str) and not raw.strip():
                    raw = PLACEHOLDER_NOT_IN_INPUTS_AR
                values[cls_name][fname] = _stringify_for_pydantic(raw)
            elif isinstance(spec, ComputedField):
                value, maybe_alloc = _call_computed(spec, inputs, loc)
                values[cls_name][fname] = value
                if allocation is None and maybe_alloc is not None:
                    allocation = maybe_alloc
            elif isinstance(spec, RetrievedField):
                if cls_name in retrieved_values and fname in retrieved_values[cls_name]:
                    values[cls_name][fname] = retrieved_values[cls_name][fname]
                else:
                    raise RetrievedFieldNotImplemented(
                        f"{loc}: retrieved field has no value. Run "
                        f"graph.generation.field_dispatcher.run_retrieval_phase "
                        f"first, or the orchestrator (scripts/generate_documents.py) "
                        f"and pass the result through `retrieved_values=`."
                    )
            elif isinstance(spec, SourceFileExtractedField):
                # §C23 NEW — pull from the per-doc extractor output.
                raw = extracted_values.get(fname, "")
                s = (raw or "").strip()
                if not s or s == EXTRACTOR_ABSENT_SENTINEL_AR:
                    s = PLACEHOLDER_NOT_IN_INPUTS_AR
                values[cls_name][fname] = s
            elif isinstance(spec, DerivedField):
                pending.append((cls_name, fname, spec))
                values[cls_name][fname] = _UNRESOLVED
            else:
                raise DispatchError(
                    f"{loc}: unknown FieldSpec subclass {type(spec).__name__}"
                )

    # --- pass 2: derived, iterated until stable ---
    for pass_i in range(_MAX_DERIVED_PASSES):
        still_pending: list[tuple[str, str, DerivedField]] = []
        made_progress = False
        for cls_name, fname, spec in pending:
            loc = f"{cls_name}.{fname}"
            if "." not in spec.reference:
                raise DispatchError(
                    f"{loc}: malformed derived.reference={spec.reference!r}"
                )
            ref_cls, ref_field = spec.reference.split(".", 1)
            if ref_cls not in values:
                # Cross-document reference (scoping §8.2). The sibling
                # document isn't in this run, so we write the user-facing
                # Arabic placeholder rather than an empty string (§C23 —
                # the final fields.json must never contain empty values).
                values[cls_name][fname] = PLACEHOLDER_NOT_IN_INPUTS_AR
                made_progress = True
                continue
            target = values[ref_cls].get(ref_field, _UNRESOLVED)
            if target is _UNRESOLVED:
                still_pending.append((cls_name, fname, spec))
                continue
            value = target
            if spec.transform:
                value = _apply_transform(value, spec.transform, loc)
            values[cls_name][fname] = _stringify_for_pydantic(value)
            made_progress = True
        pending = still_pending
        if not pending:
            break
        if not made_progress:
            unresolved = [f"{c}.{f}" for c, f, _ in pending]
            raise DispatchError(
                f"derived-pass stalled after {pass_i + 1} iterations with "
                f"{len(pending)} field(s) still unresolved: {unresolved}. "
                f"This usually means a template-loader cycle check missed "
                f"something — please file a bug."
            )

    return DispatchResult(
        values=values,
        allocation=allocation,
        retrieval_results=retrieval_results,
    )


# ------------------------------------------------------------- transforms

def _apply_transform(value: Any, transform: str, loc: str) -> Any:
    """Apply a YAML ``transform`` string to a derived value.

    Current set:

        "truncate:<N>"    → str(value)[:N] + '…' if longer
        "prefix:<s>"      → s + str(value)
        "suffix:<s>"      → str(value) + s

    Unknown transforms raise DispatchError — silently ignoring them
    would hide typos.
    """
    head, _, arg = transform.partition(":")
    if head == "truncate":
        try:
            n = int(arg)
        except ValueError:
            raise DispatchError(
                f"{loc}: derived.transform truncate takes int (got {arg!r})"
            ) from None
        s = str(value)
        return s if len(s) <= n else s[:n] + "…"
    if head == "prefix":
        return arg + str(value)
    if head == "suffix":
        return str(value) + arg
    raise DispatchError(
        f"{loc}: unknown derived.transform head {head!r}. "
        f"Supported: truncate:N, prefix:S, suffix:S."
    )


# ---------------------------------------------------------------- standalone
if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    from graph.generation.schema.inputs import load_inputs
    from graph.generation.template_loader import load_template

    repo_root = Path(__file__).resolve().parent.parent.parent

    if len(sys.argv) >= 3:
        template_path = Path(sys.argv[1])
        inputs_path = Path(sys.argv[2])
    else:
        template_path = repo_root / "templates" / "time_analysis.yaml"
        inputs_path = repo_root / "data" / "phase3_inputs.example.json"

    template = load_template(template_path)
    inputs = load_inputs(json.loads(inputs_path.read_text(encoding="utf-8")))
    try:
        result = dispatch_template(template, inputs)
    except RetrievedFieldNotImplemented as e:
        print(f"SKIP {template_path.name}: {e}")
        sys.exit(0)
    print(f"OK {template_path.name}")
    for cls_name, fields in result.values.items():
        print(f"  {cls_name}:")
        for fname, value in fields.items():
            preview = value if len(str(value)) < 80 else str(value)[:80] + "…"
            print(f"    {fname:45s} = {preview!r}")
    if result.allocation is not None:
        print(f"  (captured PlanningAllocation: {result.allocation.total_minutes} min)")
