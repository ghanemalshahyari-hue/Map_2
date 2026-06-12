"""graph/generation/source_file_extractor.py — per-doc file extraction.

For each Phase 3 output document, this module runs ONE structured LLM
call that turns the user's source files (Warning Order + Intel Report +
optional extras) into a validated dict keyed by the document's
``source_file_extracted`` field names.

Flow per document:
  1.  Collect every field tagged ``kind: source_file_extracted`` from
      the template.
  2.  For each such field, look up the Arabic extraction instruction
      from the document's ``EXTRACTION_PROMPTS_AR`` catalog
      (``prompts/<doc>/prompts_ar.py``).
  3.  Dynamically build a flat Pydantic model (``extra="forbid"``) —
      one ``str`` field per target, each with ``Field(description=...)``.
  4.  Invoke ``llm.with_structured_output(DynamicModel)`` with:
          [system] universal instructions (Arabic)
          [user]   concatenated file texts + labelled per-field tasks
  5.  Return ``{field_name: extracted_value}``. Fields the LLM couldn't
      find come back with the literal ``ABSENT_SENTINEL`` string; the
      dispatcher is responsible for translating that to a user-facing
      Arabic placeholder (or invoking a doctrine fallback, v2).

No caching at this layer yet — the per-group cache in
``graph/generation/cache.py`` covers doctrine retrieval only. The
extractor's cost is one LLM call per doc, amortised by re-use across
a single ``scripts/generate_documents.py`` run.
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, create_model

from graph.generation.llm import DEFAULT_EXTRACTOR_MODEL, DEFAULT_EXTRACTOR_TEMPERATURE
from graph.generation.source_file_reader import ReadFile
from graph.shared.responses_client import (
    ResponsesInvocationError,
    invoke_structured,
)
from prompts._universal_instructions_ar import (
    ABSENT_SENTINEL_AR,
    FILE_HEADER_INTEL_REPORT_AR,
    FILE_HEADER_OTHER_AR,
    FILE_HEADER_WARNING_ORDER_AR,
    SYSTEM_PROMPT_AR,
    TASKS_PREAMBLE_AR,
)

__all__ = [
    "SourceFileExtractionResult",
    "SourceFileExtractionError",
    "extract_for_document",
    "ABSENT_SENTINEL_AR",
]


# Loader's TEMPLATE_ID_TO_SCHEMA_MODULE knows where each doc's schema
# lives; we re-derive the per-doc catalog module path from the same
# convention. prompts/<doc_id>/prompts_ar.py.
def _prompts_module_for(template_id: str):
    return importlib.import_module(f"prompts.{template_id}.prompts_ar")


class SourceFileExtractionError(Exception):
    """Raised when the extractor cannot produce a result for a document."""


@dataclass(frozen=True)
class SourceFileExtractionResult:
    template_id: str
    field_values: dict[str, str]
    prompt_char_count: int
    file_sha_pairs: tuple[tuple[str, str], ...]  # [(kind, sha256_prefix), ...]


# --------------------------------------------------------------- helpers

def _collect_source_file_fields(template) -> list[tuple[str, str, str]]:
    """Return ``[(class_name, field_name, source_hint), ...]`` for every
    field in the template with ``kind: source_file_extracted``.

    ``source_hint`` is echoed into the per-field instruction so the LLM
    knows which file carries the value. ``"either"`` means to check
    both. A missing / unknown hint is treated as ``"either"``.
    """
    out: list[tuple[str, str, str]] = []
    for cls_name, sdef in template.schemas.items():
        for fname, spec in sdef.fields.items():
            # Duck-type against the dispatcher's SourceFileExtractedField.
            # Running this on a template where that kind isn't present is a no-op.
            if getattr(spec, "kind", None) == "source_file_extracted":
                hint = getattr(spec, "source_hint", None) or "either"
                out.append((cls_name, fname, hint))
    return out


def _build_output_model(
    template_id: str,
    fields: list[tuple[str, str, str]],
    prompts_catalog: dict[tuple[str, str], str],
) -> type[BaseModel]:
    """Dynamically build the Pydantic model the LLM must fill.

    One str field per target with its Arabic instruction pushed into
    ``Field(description=...)``. ``extra="forbid"`` so the LLM can't
    invent keys outside the document's Y schema.
    """
    field_defs: dict[str, Any] = {}
    for cls_name, fname, hint in fields:
        instruction = prompts_catalog.get((cls_name, fname))
        if not instruction:
            # Defensive — loader's parity pass should have caught this.
            raise SourceFileExtractionError(
                f"{template_id}: no EXTRACTION_PROMPTS_AR entry for "
                f"({cls_name!r}, {fname!r}). Add one to "
                f"prompts/{template_id}/prompts_ar.py."
            )
        description = f"[source_hint={hint}] {instruction}"
        field_defs[fname] = (str, Field(description=description))
    cfg = ConfigDict(extra="forbid")
    model_name = f"Extract_{template_id}"
    return create_model(model_name, __config__=cfg, **field_defs)  # type: ignore[return-value]


def _format_sources_block(files: list[ReadFile]) -> str:
    """Concatenate every read file with an Arabic section header."""
    pieces: list[str] = []
    for rf in files:
        if rf.kind == "warning_order":
            header = FILE_HEADER_WARNING_ORDER_AR
        elif rf.kind == "intel_report":
            header = FILE_HEADER_INTEL_REPORT_AR
        else:
            header = FILE_HEADER_OTHER_AR.format(name=rf.path.name)
        pieces.append(f"{header}\n{rf.text}")
    return "\n\n".join(pieces)


def _format_tasks_block(
    fields: list[tuple[str, str, str]],
    prompts_catalog: dict[tuple[str, str], str],
) -> str:
    """Per-field instruction block (numbered, Arabic)."""
    blocks: list[str] = [TASKS_PREAMBLE_AR, ""]
    for idx, (cls_name, fname, hint) in enumerate(fields, start=1):
        instruction = prompts_catalog[(cls_name, fname)]
        blocks.append(
            f"### ({idx}) {fname}  [source_hint={hint}]\n{instruction}"
        )
    return "\n".join(blocks)


# --------------------------------------------------------------- main entry

def extract_for_document(
    template,
    files: list[ReadFile],
) -> SourceFileExtractionResult:
    """Run the per-doc source-file extractor. Returns one dict per template.

    Args:
        template:  a ``graph.generation.template_loader.Template``.
        files:     list of :class:`ReadFile` produced by the reader.

    The result's ``field_values`` maps each extracted field name to
    either the LLM's extracted string or the literal ``ABSENT_SENTINEL_AR``
    when the LLM found no support. The dispatcher translates the
    sentinel into the user-facing Arabic placeholder.

    Raises:
        SourceFileExtractionError: on misconfigured template or LLM failure.
    """
    template_id = template.meta.template_id
    fields = _collect_source_file_fields(template)
    if not fields:
        # Nothing to extract — caller should still receive a valid result.
        return SourceFileExtractionResult(
            template_id=template_id,
            field_values={},
            prompt_char_count=0,
            file_sha_pairs=tuple((rf.kind, rf.sha256[:12]) for rf in files),
        )
    if not files:
        raise SourceFileExtractionError(
            f"{template_id}: no source files supplied but the template "
            f"declares {len(fields)} source_file_extracted fields."
        )

    # Catalog lookup (once per doc).
    try:
        prompts_mod = _prompts_module_for(template_id)
    except ImportError as e:
        raise SourceFileExtractionError(
            f"{template_id}: cannot import prompts.{template_id}.prompts_ar: {e}"
        ) from e
    catalog: dict[tuple[str, str], str] = getattr(
        prompts_mod, "EXTRACTION_PROMPTS_AR", {}
    )

    OutputModel = _build_output_model(template_id, fields, catalog)

    sources_block = _format_sources_block(files)
    tasks_block = _format_tasks_block(fields, catalog)

    user_prompt = (
        f"[المصادر]\n{sources_block}\n\n"
        f"[المهام]\n{tasks_block}"
    )

    try:
        structured_result = invoke_structured(
            role_env="PHASE3_EXTRACTOR_MODEL",
            default_model=DEFAULT_EXTRACTOR_MODEL,
            temperature=DEFAULT_EXTRACTOR_TEMPERATURE,
            schema=OutputModel,
            system=SYSTEM_PROMPT_AR,
            user=user_prompt,
            schema_name=f"extract_{template_id}",
        )
    except ResponsesInvocationError as e:
        raise SourceFileExtractionError(
            f"{template_id}: extractor call failed on "
            f"{e.diagnostics.model}@{e.diagnostics.endpoint} "
            f"after {e.diagnostics.attempts} attempt(s): {e}"
        ) from e
    except Exception as e:  # pragma: no cover - defensive
        raise SourceFileExtractionError(
            f"{template_id}: extractor call failed ({type(e).__name__}: {e})"
        ) from e

    result = structured_result.value
    if not isinstance(result, BaseModel):
        raise SourceFileExtractionError(
            f"{template_id}: extractor returned non-BaseModel {type(result).__name__}"
        )

    # Normalise every field to a stripped str. Empty / whitespace-only
    # → ABSENT_SENTINEL_AR so the dispatcher's fallback rule fires.
    field_values: dict[str, str] = {}
    for _cls_name, fname, _hint in fields:
        raw = getattr(result, fname, "") or ""
        s = str(raw).strip()
        field_values[fname] = s if s else ABSENT_SENTINEL_AR

    return SourceFileExtractionResult(
        template_id=template_id,
        field_values=field_values,
        prompt_char_count=len(SYSTEM_PROMPT_AR) + len(user_prompt),
        file_sha_pairs=tuple((rf.kind, rf.sha256[:12]) for rf in files),
    )
