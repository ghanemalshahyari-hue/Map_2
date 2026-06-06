"""graph/generation/template_loader.py — YAML → Template objects.

One entry point: :func:`load_template` takes a path to one of the
four `templates/<doc>.yaml` files and returns a frozen, fully
validated :class:`Template` object the dispatcher can walk.

Validation happens in two phases:

1.  **Shape validation** via pydantic discriminated union. Each
    field under `schemas.<X>.fields.<Y>` is parsed into one of the
    five `*Field` subclasses (`StaticField`, `ComputedField`,
    `InputField`, `DerivedField`, `RetrievedField`) based on its
    ``kind`` value. Malformed YAML raises
    ``pydantic.ValidationError`` with a field-level location trace.

2.  **Cross-field validation** (:func:`_validate`, implementing the
    §9 rules of `referencedocs/20_phase3_templates_and_kinds.md`).
    Collects every problem into a list and raises
    :class:`TemplateValidationError` with the full list. Checked:

    - ``meta.template_id`` / ``meta.document_slug`` non-empty, slug-safe
    - ``computed.function`` starts with ``time_math.`` (the dotted
      path is not import-resolved at M1 because `time_math.py`
      lands in M2; a TODO in-file tracks the upgrade)
    - ``derived.reference`` has shape ``<Schema>.<field>`` and both
      halves resolve within the template
    - no cycles in the derived-reference graph (iterative DFS)
    - ``retrieved`` group has ≥1 query seed, a ``prompt_ar``, and
      every filter key is in Phase 2's ``ALLOWED_FILTER_KEYS``
    - ``retrieved.filters.source_doc`` is ``str`` or ``list[str]``
      (scalar vs OR-match allowlist — see referencedoc 18 §6.4)
    - ``retrieved.rerank_query_ar`` is consistent across all fields
      sharing the same group label
    - ``structure[i].schema`` (for section entries) maps to an
      entry in ``schemas``
    - schema-module parity: every class in ``schemas`` has a
      matching Pydantic class in the `graph.generation.schema.*`
      module for this ``template_id``, and every field declared in
      YAML exists on that Pydantic class (and vice versa)

Not validated at load time (runtime concerns):

- ``input.path`` existence in the actual `inputs.json` — depends on
  which fields are marked ``required=True`` at template-authoring
  time AND whether the user provides them at run time.
- ``filters.source_doc`` value presence in the live Qdrant
  collection — scoping doc §6.4 "missing-manual elision" is a
  runtime concern so templates stay valid offline.
- ``function`` callable existence — import-resolved by M2
  (`time_math.py`).

This module is runnable standalone and validates every committed
template when invoked with no args::

    $ python -m graph.generation.template_loader
    OK time_analysis.yaml: template_id=time_analysis schemas=2 ...
    OK initial_planning_guidance.yaml: ...
    OK staff_estimate.yaml: ...
    OK operation_order.yaml: ...

Or point it at specific files::

    $ python -m graph.generation.template_loader templates/*.yaml
"""

from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path
from typing import Annotated, Any, Literal, Union

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError


# Phase 2's set of payload keys `search()` is allowed to filter on.
# Re-stated here (not imported) because Phase 3 M1 is offline — we
# don't want to pull the retrieval stack into a template parse.
# Must stay in lock-step with graph.retrieval.schema.ALLOWED_FILTER_KEYS.
ALLOWED_FILTER_KEYS: frozenset[str] = frozenset(
    {"source_doc", "chunk_type", "paragraph_number", "paragraph_numbers", "cross_refs"}
)


# One mapping of template_id → dotted path of its schema module.
# Used for schema-module parity checks. Templates authored against a
# template_id not in this map get flagged.
#
# §18 C21 (2026-04-23) — every template_id now points at the single
# consolidated ``schema.schemas`` module. Multiple template_ids sharing
# the same module is supported: the parity pass only cross-checks
# classes that actually appear in each YAML, so ``warning_order`` can
# use a subset of the OPORD classes and ``staff_brief`` can use the
# full Staff-Estimate class set without conflict.
TEMPLATE_ID_TO_SCHEMA_MODULE: dict[str, str] = {
    # §C23 (2026-04-23) — the three Y-approved v1 documents now live
    # under ``prompts/<doc>/`` with a one-file-per-concern layout
    # (schema.py + template.yaml + labels_ar.py + prompts_ar.py). Their
    # schemas are FLAT (one Pydantic class per doc, fields keyed
    # exactly like folder Y's reference JSONs). The legacy warning_order /
    # operation_order / staff_estimate entries stay on the old nested
    # ``graph.generation.schema.schemas`` module until Y-approved
    # schemas land for them.
    "time_analysis":             "prompts.time_analysis.schema",
    "initial_planning_guidance": "prompts.initial_planning_guidance.schema",
    "staff_brief":               "prompts.staff_brief.schema",
    "warning_order":             "prompts.warning_order.schema",
    # Legacy (Y-schema pending).
    "operation_order":           "graph.generation.schema.schemas",
    "staff_estimate":            "graph.generation.schema.schemas",
}


# §C23 — per-doc label + prompt catalogs live under ``prompts/<doc>/``
# for the three migrated templates. The legacy templates fall back to
# the project-wide catalogs at ``graph.generation.schema.field_catalog``
# + ``graph.generation.prompts_ar``. ``_apply_catalogs`` uses this map
# so catalog overlays stay per-doc isolated.
TEMPLATE_ID_TO_CATALOG_MODULES: dict[str, tuple[str, str]] = {
    "time_analysis": (
        "prompts.time_analysis.labels_ar",
        "prompts.time_analysis.prompts_ar",
    ),
    "initial_planning_guidance": (
        "prompts.initial_planning_guidance.labels_ar",
        "prompts.initial_planning_guidance.prompts_ar",
    ),
    "staff_brief": (
        "prompts.staff_brief.labels_ar",
        "prompts.staff_brief.prompts_ar",
    ),
    "warning_order": (
        "prompts.warning_order.labels_ar",
        "prompts.warning_order.prompts_ar",
    ),
}


# §C23 — when discovering templates by ``template_id``, prefer the
# per-doc folder under ``prompts/<doc>/template.yaml``; fall back to the
# legacy ``templates/<doc>.yaml`` location if not present. The CLI
# helper ``resolve_template_path`` enforces this precedence so
# ``scripts/generate_documents.py`` stays source-of-truth-agnostic.
TEMPLATES_DIR_LEGACY_NAME = "templates"
PROMPTS_DIR_NAME = "prompts"


def _all_phase3_schema_names() -> set[str]:
    """Union of every class name exposed by the four Phase 3 schema modules.

    Used to validate **cross-document** derived references — scoping
    doc §8.2 explicitly supports patterns like
    `OPERATIONS_ESTIMATE.own_unit_end_state` deriving from
    `MissionAndExecution.desired_end_state` (across Doc 1 / Doc 2).
    Import failures are swallowed and logged into the problems list
    by the caller — a missing module is a different class of bug.
    """
    names: set[str] = set()
    for mod_name in TEMPLATE_ID_TO_SCHEMA_MODULE.values():
        try:
            mod = importlib.import_module(mod_name)
        except ImportError:
            continue
        for cls in getattr(mod, "DOCUMENT_CLASSES", ()):
            names.add(cls.__name__)
    return names


_SLUG_RE = re.compile(r"^[a-z0-9_]+$")


class _Frozen(BaseModel):
    """Strict-shape, frozen base for every loader model."""
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)


class StaticField(_Frozen):
    kind: Literal["static"]
    value: Any
    label_ar: str | None = None


class ComputedField(_Frozen):
    kind: Literal["computed"]
    function: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    output_field: str | None = None
    label_ar: str | None = None


class InputField(_Frozen):
    kind: Literal["input"]
    path: str
    required: bool = False
    default: Any = None
    label_ar: str | None = None


class DerivedField(_Frozen):
    kind: Literal["derived"]
    reference: str
    transform: str | None = None
    label_ar: str | None = None


class RetrievedField(_Frozen):
    kind: Literal["retrieved"]
    group: str
    query_seeds: list[str]
    collections: list[str] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)
    top_k_per_query: int | None = None
    merge_pool_size: int | None = None
    merged_top_k: int | None = None
    # §C23 — prompt_ar is no longer required at YAML-parse time. With the
    # per-doc ``prompts/<doc>/prompts_ar.py`` catalog overlay, YAMLs only
    # need to carry retrieval metadata (seeds, filters, rerank query) and
    # the drafting prompt is stamped on at load time. Fields whose YAML
    # predates §C23 and still carry an inline ``prompt_ar`` keep working.
    prompt_ar: str = ""
    examples_ar: list[str] = Field(default_factory=list)
    max_tokens: int | None = None
    rerank_query_ar: str | None = None
    label_ar: str | None = None
    # §C31 — tiered-retrieval Phase 7.  Optional opt-in keys.  When
    # absent the loader infers ``policy="operationalfiles_only"`` and
    # treats ``collections:`` as the operationalfiles target — every
    # legacy YAML keeps producing today's resolved fields.  See
    # ``tiered_retrieval_discussion.md`` for the locked policy enum
    # and naming.
    policy: Literal[
        "source_files_only",
        "operationalfiles_only",
        "doctrine_only",
        "operationalfiles_then_doctrine",
        "operationalfiles_and_doctrine",
        "all_channels",
    ] | None = None
    operationalfiles_collections: list[str] = Field(default_factory=list)
    doctrine_collections: list[str] = Field(default_factory=list)
    # ``source_files_field_map`` — drafter-field-name → extracted_values key.
    source_files_field_map: dict[str, str] = Field(default_factory=dict)
    # ``coverage_thresholds`` — per-field override of (τ_strong, k_strong, m_docs).
    # When absent the global env defaults apply.
    coverage_thresholds: dict[str, Any] = Field(default_factory=dict)


class SourceFileExtractedField(_Frozen):
    """§C23 NEW — value comes from the user's source files (Warning Order,
    Intel Report, or additional uploads) via a per-doc structured LLM
    extractor call (``graph/generation/source_file_extractor.py``).

    YAML shape::

        field_name:
          kind: source_file_extracted
          source_hint: warning_order | intel_report | either
          label_ar: "..."   # optional — catalog wins
          prompt_ar: "..."  # optional — catalog wins

    The per-field Arabic extraction instruction lives in
    ``prompts/<doc>/prompts_ar.py::EXTRACTION_PROMPTS_AR`` keyed by
    ``(class_name, field_name)``. ``prompt_ar`` on this spec is a
    legacy hook — catalog wins.
    """
    kind: Literal["source_file_extracted"]
    source_hint: Literal["warning_order", "intel_report", "either"] = "either"
    prompt_ar: str = ""
    label_ar: str | None = None


class StaticPlaceholderField(_Frozen):
    """§C23 NEW — field whose value is an explicit Arabic placeholder
    when neither source-file extraction nor doctrine retrieval applies.

    Exists as a separate kind (distinct from ``static``) so the renderer
    and smoke test can tell the difference between "author-provided
    literal" and "doctrine-deferred placeholder".
    """
    kind: Literal["static_placeholder"]
    value: str
    label_ar: str | None = None


# Discriminated union: pydantic picks the right subclass based on
# the YAML field's `kind` value and raises on unknown kinds.
FieldSpec = Annotated[
    Union[
        StaticField,
        ComputedField,
        InputField,
        DerivedField,
        RetrievedField,
        SourceFileExtractedField,
        StaticPlaceholderField,
    ],
    Field(discriminator="kind"),
]


class SchemaDef(_Frozen):
    fields: dict[str, FieldSpec]


class Meta(_Frozen):
    template_id: str
    template_version: int
    title_arabic: str
    document_slug: str
    output_filename: str
    default_collections: list[str]


class StructureEntry(BaseModel):
    """One entry in the document's `structure` list.

    Permissive on extras — the renderer consumes arbitrary per-kind
    attributes (``text``/``schema``/``heading``/``layout``/``lines``/
    ``source`` depending on ``kind``). Validated for the pieces the
    dispatcher cares about in :func:`_validate`.
    """
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    kind: str


class Template(_Frozen):
    meta: Meta
    schemas: dict[str, SchemaDef]
    structure: list[StructureEntry]
    # §18 C17 — v1 scope flag. Templates without this key default to
    # True (in-scope). Out-of-v1-scope templates set it to False so
    # the CLI skips them; the loader still parses + validates them so
    # the v2 starting point stays healthy.
    v1_scope: bool = True


class TemplateValidationError(Exception):
    """Raised when a template parses but fails §9 validation."""

    def __init__(self, path: Path, problems: list[str]) -> None:
        self.path = path
        self.problems = problems
        header = f"{path.name}: {len(problems)} problem(s)"
        bullets = "\n  - ".join(problems)
        super().__init__(f"{header}\n  - {bullets}")


def _extra_get(entry: StructureEntry, key: str) -> Any:
    """Safe read of a pydantic-extra attribute on a StructureEntry."""
    extras = entry.model_extra or {}
    return extras.get(key)


def _detect_derived_cycles(template: Template) -> list[list[str]]:
    """Return all cycles found in the derived-reference graph.

    Each cycle is a list of ``Schema.field`` ids, first node repeated
    at the end. Empty list on an acyclic template.
    """
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {}
    cycles: list[list[str]] = []

    def visit(cls: str, fname: str, stack: list[str]) -> None:
        nid = f"{cls}.{fname}"
        st = color.get(nid, WHITE)
        if st == GRAY:
            # Found a cycle — trim to the cycle start.
            idx = stack.index(nid) if nid in stack else 0
            cycles.append(stack[idx:] + [nid])
            return
        if st == BLACK:
            return
        color[nid] = GRAY
        spec = template.schemas[cls].fields.get(fname)
        if isinstance(spec, DerivedField) and "." in spec.reference:
            r_cls, r_field = spec.reference.split(".", 1)
            if r_cls in template.schemas and r_field in template.schemas[r_cls].fields:
                visit(r_cls, r_field, stack + [nid])
        color[nid] = BLACK

    for cls, sdef in template.schemas.items():
        for fname in sdef.fields:
            if f"{cls}.{fname}" not in color:
                visit(cls, fname, [])
    return cycles


def _check_schema_module_parity(template: Template, problems: list[str]) -> None:
    """Cross-check YAML schemas against the Pydantic schema module."""
    mod_name = TEMPLATE_ID_TO_SCHEMA_MODULE.get(template.meta.template_id)
    if mod_name is None:
        problems.append(
            f"meta.template_id {template.meta.template_id!r} has no entry in "
            f"TEMPLATE_ID_TO_SCHEMA_MODULE — update the loader."
        )
        return
    try:
        mod = importlib.import_module(mod_name)
    except ImportError as e:
        problems.append(f"cannot import schema module {mod_name}: {e}")
        return
    for cls_name, sdef in template.schemas.items():
        py_cls = getattr(mod, cls_name, None)
        if py_cls is None:
            problems.append(
                f"schemas.{cls_name}: no matching Pydantic class in {mod_name}. "
                f"Either add it to the schema module or rename the YAML entry."
            )
            continue
        if not hasattr(py_cls, "model_fields"):
            problems.append(
                f"schemas.{cls_name}: {mod_name}.{cls_name} is not a Pydantic v2 BaseModel."
            )
            continue
        py_fields = set(py_cls.model_fields.keys())
        yaml_fields = set(sdef.fields.keys())
        for f in sorted(yaml_fields - py_fields):
            problems.append(
                f"schemas.{cls_name}.{f}: declared in YAML but not on "
                f"{mod_name}.{cls_name} — rename target or dead YAML entry."
            )
        for f in sorted(py_fields - yaml_fields):
            problems.append(
                f"schemas.{cls_name}.{f}: field on {mod_name}.{cls_name} "
                f"but not declared in YAML — missing template entry."
            )


def _validate(template: Template) -> list[str]:
    """Run the §9 cross-field rules; return a list of problem strings."""
    problems: list[str] = []
    _known_external_schemas = _all_phase3_schema_names() - set(template.schemas.keys())

    # --- meta ---
    if not template.meta.template_id:
        problems.append("meta.template_id is empty")
    if not template.meta.document_slug:
        problems.append("meta.document_slug is empty")
    elif not _SLUG_RE.match(template.meta.document_slug):
        problems.append(
            f"meta.document_slug {template.meta.document_slug!r} is not slug-safe "
            f"(allowed characters: lowercase letters, digits, underscore)"
        )

    # --- per-field validation ---
    for cls_name, sdef in template.schemas.items():
        for fname, spec in sdef.fields.items():
            loc = f"{cls_name}.{fname}"
            if isinstance(spec, ComputedField):
                # TODO(M2): once graph/generation/time_math.py lands,
                # import-resolve the dotted path and confirm it's callable.
                if not spec.function.startswith("time_math."):
                    problems.append(
                        f"{loc}: computed.function={spec.function!r} must start with "
                        f"'time_math.' (M2 will import-resolve it)"
                    )
            elif isinstance(spec, DerivedField):
                if "." not in spec.reference:
                    problems.append(
                        f"{loc}: derived.reference={spec.reference!r} must be of the "
                        f"form <Schema>.<field>"
                    )
                else:
                    ref_cls, ref_field = spec.reference.split(".", 1)
                    if ref_cls in template.schemas:
                        # In-template reference — validate the field exists.
                        if ref_field not in template.schemas[ref_cls].fields:
                            problems.append(
                                f"{loc}: derived.reference points at field "
                                f"{ref_cls}.{ref_field} not defined in this template"
                            )
                    elif ref_cls in _known_external_schemas:
                        # Cross-document reference (scoping §8.2). We can't
                        # validate the field at single-template load time;
                        # assembly-time resolution catches stale refs.
                        pass
                    else:
                        problems.append(
                            f"{loc}: derived.reference points at schema {ref_cls!r} "
                            f"which is not defined in this template and not a known "
                            f"Phase 3 schema class (checked {sorted(_known_external_schemas)})"
                        )
            elif isinstance(spec, RetrievedField):
                if not spec.query_seeds:
                    problems.append(f"{loc}: retrieved.query_seeds is empty (need ≥1)")
                for fk in spec.filters:
                    if fk not in ALLOWED_FILTER_KEYS:
                        problems.append(
                            f"{loc}: retrieved.filters key {fk!r} is not in "
                            f"Phase 2 ALLOWED_FILTER_KEYS ({sorted(ALLOWED_FILTER_KEYS)})"
                        )
                sd = spec.filters.get("source_doc")
                if sd is not None:
                    if isinstance(sd, list):
                        bad = [x for x in sd if not isinstance(x, str)]
                        if bad:
                            problems.append(
                                f"{loc}: retrieved.filters.source_doc list contains "
                                f"non-str elements: {bad!r}"
                            )
                    elif not isinstance(sd, str):
                        problems.append(
                            f"{loc}: retrieved.filters.source_doc must be str or "
                            f"list[str], got {type(sd).__name__}"
                        )

    # --- rerank_query_ar consistency across group ---
    group_rq: dict[str, tuple[str, str]] = {}
    for cls_name, sdef in template.schemas.items():
        for fname, spec in sdef.fields.items():
            if isinstance(spec, RetrievedField) and spec.rerank_query_ar:
                loc = f"{cls_name}.{fname}"
                prev = group_rq.get(spec.group)
                if prev is None:
                    group_rq[spec.group] = (spec.rerank_query_ar, loc)
                elif prev[0] != spec.rerank_query_ar:
                    problems.append(
                        f"{loc}: retrieved.rerank_query_ar differs from {prev[1]} for the "
                        f"same group {spec.group!r} (got {spec.rerank_query_ar!r} vs "
                        f"{prev[0]!r}) — all declarations within a group must match verbatim"
                    )

    # --- structure entries reference defined schemas ---
    for i, se in enumerate(template.structure):
        if se.kind == "section":
            sch = _extra_get(se, "schema")
            if not sch:
                problems.append(f"structure[{i}]: section missing 'schema' key")
            elif sch not in template.schemas:
                problems.append(
                    f"structure[{i}]: section references undefined schema {sch!r}"
                )

    # --- derived cycles ---
    for cycle in _detect_derived_cycles(template):
        problems.append("derived cycle: " + " -> ".join(cycle))

    # --- schema-module parity ---
    _check_schema_module_parity(template, problems)

    return problems


def _apply_catalogs(data: dict) -> None:
    """Mutate raw YAML dict in place, overlaying label_ar / prompt_ar
    entries from the per-doc catalogs (§C23) OR the legacy project-wide
    catalogs (pre-§C23 templates).

    Lookup precedence:

    1. If ``meta.template_id`` has an entry in
       ``TEMPLATE_ID_TO_CATALOG_MODULES``, import that doc's
       ``labels_ar`` + ``prompts_ar`` — these replace both the inline
       YAML values and the legacy catalogs for this template. The
       per-doc ``prompts_ar`` splits its overlay into two dicts:

           EXTRACTION_PROMPTS_AR  → kind: source_file_extracted fields
           DRAFTING_PROMPTS_AR    → kind: retrieved fields

    2. Otherwise fall back to the legacy
       ``graph.generation.schema.field_catalog.FIELD_LABELS_AR`` +
       ``graph.generation.prompts_ar.PROMPTS_AR`` catalogs used by the
       warning_order / operation_order / staff_estimate templates.

    Scope: only touches ``schemas.<cls>.fields.<f>`` entries, only the
    two known label/prompt keys. Never adds new keys outside those two.
    """
    meta = data.get("meta") or {}
    template_id = meta.get("template_id") if isinstance(meta, dict) else None
    schemas = data.get("schemas") or {}
    if not isinstance(schemas, dict):
        return

    # Per-doc catalogs (§C23).
    per_doc_labels: dict[tuple[str, str], str] = {}
    per_doc_extract_prompts: dict[tuple[str, str], str] = {}
    per_doc_draft_prompts: dict[tuple[str, str], str] = {}
    if template_id in TEMPLATE_ID_TO_CATALOG_MODULES:
        labels_mod_name, prompts_mod_name = TEMPLATE_ID_TO_CATALOG_MODULES[template_id]
        try:
            labels_mod = importlib.import_module(labels_mod_name)
            per_doc_labels = getattr(labels_mod, "FIELD_LABELS_AR", {}) or {}
        except ImportError:
            pass
        try:
            prompts_mod = importlib.import_module(prompts_mod_name)
            per_doc_extract_prompts = getattr(prompts_mod, "EXTRACTION_PROMPTS_AR", {}) or {}
            per_doc_draft_prompts = getattr(prompts_mod, "DRAFTING_PROMPTS_AR", {}) or {}
        except ImportError:
            pass

    # Legacy project-wide catalogs (pre-§C23).
    legacy_labels: dict[tuple[str, str], str] = {}
    legacy_prompts: dict[tuple[str, str, str], str] = {}
    if not per_doc_labels and not per_doc_draft_prompts:
        try:
            from graph.generation.schema.field_catalog import FIELD_LABELS_AR as _L
            legacy_labels = _L
        except ImportError:
            pass
        try:
            from graph.generation.prompts_ar import PROMPTS_AR as _P
            legacy_prompts = _P
        except ImportError:
            pass

    for cls_name, sdef in schemas.items():
        if not isinstance(sdef, dict):
            continue
        fields = sdef.get("fields") or {}
        if not isinstance(fields, dict):
            continue
        for fname, spec in fields.items():
            if not isinstance(spec, dict):
                continue
            # label_ar: per-doc catalog > legacy catalog > YAML inline.
            label = per_doc_labels.get((cls_name, fname)) or legacy_labels.get((cls_name, fname))
            if label:
                spec["label_ar"] = label

            kind = spec.get("kind")
            if kind == "retrieved":
                prompt = (
                    per_doc_draft_prompts.get((cls_name, fname))
                    or (legacy_prompts.get((template_id, cls_name, fname)) if template_id else None)
                )
                if prompt:
                    spec["prompt_ar"] = prompt
            elif kind == "source_file_extracted":
                prompt = per_doc_extract_prompts.get((cls_name, fname))
                if prompt:
                    spec["prompt_ar"] = prompt


# --------------------------------------------------------------- path resolver

def resolve_template_path(template_id: str, repo_root: Path | str | None = None) -> Path:
    """Locate a template file by its ``template_id``.

    Lookup order (§C23):

      1. ``prompts/<template_id>/template.yaml`` — new per-doc layout.
      2. ``templates/<template_id>.yaml`` — legacy flat layout.

    Raises ``FileNotFoundError`` if neither is present.
    """
    root = Path(repo_root) if repo_root else Path(__file__).resolve().parent.parent.parent
    per_doc = root / PROMPTS_DIR_NAME / template_id / "template.yaml"
    if per_doc.is_file():
        return per_doc
    legacy = root / TEMPLATES_DIR_LEGACY_NAME / f"{template_id}.yaml"
    if legacy.is_file():
        return legacy
    raise FileNotFoundError(
        f"template {template_id!r}: no template.yaml found. Checked:\n"
        f"  {per_doc}\n  {legacy}"
    )


def load_template(path: Path | str) -> Template:
    """Parse and validate one YAML template file.

    Raises:
        FileNotFoundError:       no such file.
        yaml.YAMLError:          YAML is not parseable.
        pydantic.ValidationError: YAML parsed but the shape is wrong.
        TemplateValidationError:  shape OK but §9 cross-field rules failed.
    """
    path = Path(path)
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        _apply_catalogs(data)
    template = Template.model_validate(data)
    problems = _validate(template)
    if problems:
        raise TemplateValidationError(path, problems)
    return template


# ---------------------------------------------------------------- standalone
if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parent.parent.parent
    if len(sys.argv) < 2:
        # §C23 — prefer the per-doc ``prompts/<doc>/template.yaml`` over
        # any same-template_id file under ``templates/``. Legacy YAMLs
        # for Y-migrated docs stay on disk but are superseded.
        seen_ids: set[str] = set()
        paths: list[Path] = []
        for p in sorted((repo_root / PROMPTS_DIR_NAME).glob("*/template.yaml")):
            seen_ids.add(p.parent.name)
            paths.append(p)
        for p in sorted((repo_root / TEMPLATES_DIR_LEGACY_NAME).glob("*.yaml")):
            if p.stem not in seen_ids:
                paths.append(p)
        if not paths:
            print(
                "no templates found under prompts/ or templates/; "
                "pass a path explicitly.",
            )
            sys.exit(2)
    else:
        paths = [Path(p) for p in sys.argv[1:]]

    exit_code = 0
    for p in paths:
        try:
            t = load_template(p)
        except (ValidationError, TemplateValidationError) as e:
            print(f"FAIL {p.name}:")
            print("  " + str(e).replace("\n", "\n  "))
            exit_code = 1
            continue
        except FileNotFoundError:
            print(f"FAIL {p.name}: file not found")
            exit_code = 1
            continue

        retrieved = [
            (cls, f)
            for cls, sdef in t.schemas.items()
            for f, spec in sdef.fields.items()
            if isinstance(spec, RetrievedField)
        ]
        groups = sorted({
            spec.group
            for sdef in t.schemas.values()
            for spec in sdef.fields.values()
            if isinstance(spec, RetrievedField)
        })
        print(
            f"OK {p.name}: template_id={t.meta.template_id} "
            f"schemas={len(t.schemas)} structure={len(t.structure)} "
            f"retrieved_fields={len(retrieved)} groups={groups}"
        )
    sys.exit(exit_code)
