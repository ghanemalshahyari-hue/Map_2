"""graph/generation/assembler.py — turn dispatch output into a
:class:`GeneratedDocument` the renderer can consume.

At M2 the assembler does three things:

1.  Instantiate each Pydantic class declared by the template's
    schema module from the dispatcher's resolved
    ``{class: {field: value}}`` dict. A failure here is a genuine
    bug — the loader's schema-module-parity check should have
    caught missing / extra fields at load time — but we surface
    the Pydantic validation error verbatim so regressions are
    loud.
2.  Bundle the resulting instances into a frozen
    :class:`GeneratedDocument` that carries the template, the
    inputs, and the optional :class:`PlanningAllocation` captured
    by the dispatcher (so the renderer's ``timeline_table`` layout
    can read structured rows without re-deriving them).
3.  Offer :func:`render_to_docx` — a thin orchestrator that lets
    ``scripts/generate_documents.py`` stay free of renderer
    knowledge. The assembler already owns the Template → pydantic
    mapping, so it's the natural seat for this.

M3+ will extend the assembler with cross-document derived-field
resolution (OPORD ↔ Staff Estimates) — the hook is already there
via the :attr:`GeneratedDocument.sections` dict keyed by schema
name.
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from graph.generation.field_dispatcher import (
    DispatchResult,
    dispatch_template,
    run_retrieval_phase,
)
from graph.generation.schema.inputs import Phase3Inputs
from graph.generation.template_loader import (
    TEMPLATE_ID_TO_SCHEMA_MODULE,
    RetrievedField,
    SourceFileExtractedField,
    Template,
)
from graph.generation import time_math as _time_math_module

__all__ = [
    "AssemblyError",
    "GeneratedDocument",
    "assemble_document",
    "render_to_docx",
]


def _template_has_source_file_extracted_fields(template: Template) -> bool:
    for sdef in template.schemas.values():
        for spec in sdef.fields.values():
            if isinstance(spec, SourceFileExtractedField):
                return True
    return False


def _template_has_source_evidence_consumers(template: Template) -> bool:
    """Return ``True`` when any retrieval group consumes source-files
    evidence via tiered-retrieval YAML keys.

    Phase 7 of the tiered-retrieval plan (§C31): inspects each
    :class:`RetrievedField` for any of the tier-aware keys. When any
    is present, the assembler must hoist source-files extraction
    above retrieval so the per-group ``source_files_field_map`` can
    feed FactSnippets into the bundle at retrieve time.

    Pre-Phase-7 (legacy YAML) every retrieved field has
    ``policy=None`` / empty ``source_files_field_map`` / empty
    ``operationalfiles_collections`` / empty ``doctrine_collections``
    so this returns ``False`` and the assembler keeps its previous
    extract-only-on-source_file_extracted gate.
    """
    for sdef in template.schemas.values():
        for spec in sdef.fields.values():
            if not isinstance(spec, RetrievedField):
                continue
            if (
                getattr(spec, "policy", None) is not None
                or (getattr(spec, "operationalfiles_collections", None) or [])
                or (getattr(spec, "doctrine_collections", None) or [])
                or (getattr(spec, "source_files_field_map", None) or {})
            ):
                return True
    return False


class AssemblyError(Exception):
    """Raised when dispatch output can't be instantiated into the
    template's Pydantic classes. Typically means the schema module
    drifted from the YAML — regenerate the JSON Schema and/or
    re-check the loader's parity pass."""


@dataclass(frozen=True)
class GeneratedDocument:
    """Fully assembled document ready for rendering.

    Attributes:
        template: The :class:`Template` this document was generated from.
        inputs:   The :class:`Phase3Inputs` that drove the dispatch.
        sections: Schema-name → Pydantic instance (every class in
                  ``template.schemas`` has an entry here).
        allocation: The :class:`PlanningAllocation` captured during
                  dispatch if any ``compute_allocation`` call ran
                  in this template. ``None`` for templates that
                  don't touch planning math (OPORD, Staff Estimates).
        retrieval_results: One entry per retrieval group in the
                  template (ordered). Empty tuple for Doc 3. The
                  renderer walks this for the citation-endnotes
                  section ("الاستشهادات").
    """

    template: Template
    inputs: Phase3Inputs
    sections: dict[str, BaseModel]
    allocation: _time_math_module.PlanningAllocation | None = None
    retrieval_results: tuple[Any, ...] = ()
    # §C31 — tiered-retrieval Phase 6.  One :class:`EvidenceBundle`
    # per retrieval group, in the same order as ``retrieval_results``.
    # Empty tuple for templates with no retrieved fields.  The
    # renderer prefers this when present (so source_files FactSnippets
    # appear in the citation endnote alongside doctrine/operationalfiles
    # hits) and falls back to ``retrieval_results`` for paths that
    # haven't been migrated.
    evidence_bundles: tuple[Any, ...] = ()


def _resolve_schema_module(template: Template):
    """Import the schema module declared for this template_id."""
    mod_name = TEMPLATE_ID_TO_SCHEMA_MODULE[template.meta.template_id]
    return importlib.import_module(mod_name)


def _template_has_retrieved_fields(template: Template) -> bool:
    for sdef in template.schemas.values():
        for spec in sdef.fields.values():
            if isinstance(spec, RetrievedField):
                return True
    return False


def assemble_document(
    template: Template,
    inputs: Phase3Inputs,
    dispatch_result: DispatchResult | None = None,
    *,
    inputs_raw: dict | None = None,
    template_path: Path | None = None,
    cache_dir: Path | None = None,
    user_prompt_sha256: str = "",
    extractor_model: str = "",
    extractor_temperature: float = 0.0,
    source_files: list[Any] | None = None,
    extracted_values: dict[str, str] | None = None,
) -> GeneratedDocument:
    """Run the retrieval phase (if needed) + dispatcher, instantiate
    the Pydantic classes, return a frozen :class:`GeneratedDocument`.

    For templates with retrieved fields (OPORD / Staff / WARNO), the
    caller should pass ``inputs_raw`` (for the cache key's
    ``input_subset_sha256``), ``template_path`` (for the YAML hash),
    and ``cache_dir`` (where to read/write per-group cache entries).
    Missing any of those silently disables caching without blocking
    generation.

    The ``user_prompt_sha256`` / ``extractor_model`` /
    ``extractor_temperature`` kwargs capture extraction provenance
    for the cache key (scoping §18 C16); default values describe
    the ``--inputs-json`` path.

    Doc 3 has no retrieved fields — the retrieval phase is skipped
    entirely and behaviour matches M2.
    """
    # §C31 — evidence_bundles defaults to () so it is well-defined on
    # the dispatch_result-supplied path (test fixtures, debug paths).
    evidence_bundles: tuple[Any, ...] = ()
    if dispatch_result is None:
        # Phase 1 of tiered retrieval (§C29): hoist source-files
        # extraction above retrieval so Phase 7's tier-aware groups
        # can feed their ``source_files_field_map`` from
        # ``extracted_values`` at retrieve time. The reorder is
        # behaviour-preserving for legacy templates because retrieval
        # never read ``extracted_values`` and extraction never read
        # retrieval results — only the relative order of the LLM
        # extractor call changes.
        resolved_extracted: dict[str, str] = dict(extracted_values or {})
        needs_source_evidence = (
            _template_has_source_file_extracted_fields(template)
            or _template_has_source_evidence_consumers(template)
        )
        if (
            not resolved_extracted
            and source_files
            and needs_source_evidence
        ):
            # Lazy import — avoid pulling the LLM client into paths
            # that don't need it.
            from graph.generation.source_file_extractor import extract_for_document
            extraction = extract_for_document(template, source_files)
            resolved_extracted = dict(extraction.field_values)
        # When the template wants source-file extraction but no files
        # were supplied (and no pre-extracted dict was passed), the
        # dispatcher falls back to the Arabic placeholder downstream —
        # audit-friendly behaviour so smoke tests / the --inputs-json
        # debug path still work without source files.

        retrieved_values: dict[str, dict[str, str]] = {}
        retrieval_results: tuple[Any, ...] = ()
        if _template_has_retrieved_fields(template):
            if inputs_raw is None:
                raise AssemblyError(
                    f"{template.meta.template_id}: template contains retrieved "
                    f"fields but inputs_raw was not provided to assemble_document; "
                    f"the cache key cannot be computed."
                )
            retrieved_values, retrieval_results, evidence_bundles = run_retrieval_phase(
                template,
                inputs,
                inputs_raw,
                template_path=template_path,
                cache_dir=cache_dir,
                doc_title_ar=template.meta.title_arabic,
                user_prompt_sha256=user_prompt_sha256,
                extractor_model=extractor_model,
                extractor_temperature=extractor_temperature,
                extracted_values=resolved_extracted,
            )

        dispatch_result = dispatch_template(
            template,
            inputs,
            retrieved_values=retrieved_values,
            retrieval_results=retrieval_results,
            extracted_values=resolved_extracted,
        )

    mod = _resolve_schema_module(template)
    sections: dict[str, BaseModel] = {}

    for cls_name, field_values in dispatch_result.values.items():
        py_cls = getattr(mod, cls_name, None)
        if py_cls is None:
            raise AssemblyError(
                f"template {template.meta.template_id!r} declares schemas.{cls_name} "
                f"but {mod.__name__}.{cls_name} does not exist. "
                f"Run `python -m graph.generation.template_loader` to re-validate."
            )
        try:
            sections[cls_name] = py_cls(**field_values)
        except ValidationError as e:
            raise AssemblyError(
                f"{template.meta.template_id}: instantiating "
                f"{mod.__name__}.{cls_name} from resolved values failed:\n{e}"
            ) from None

    return GeneratedDocument(
        template=template,
        inputs=inputs,
        sections=sections,
        allocation=dispatch_result.allocation,
        retrieval_results=dispatch_result.retrieval_results,
        evidence_bundles=evidence_bundles,
    )


def render_to_docx(generated: GeneratedDocument, output_path: Path | str) -> Path:
    """Render an assembled document to a ``.docx`` file.

    Defers to :func:`graph.generation.renderers.arabic_docx.render_document`
    so the renderer can be unit-tested in isolation. The indirection
    here keeps ``scripts/generate_documents.py`` clean — the CLI
    only talks to the assembler.
    """
    from graph.generation.renderers.arabic_docx import render_document

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    render_document(generated, out)
    return out
