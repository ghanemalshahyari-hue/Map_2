"""graph/generation/schema/inputs.py — Phase 3 input shape.

Pydantic v2 model `Phase3Inputs` is the **single source of truth**
for `inputs.json`. Runtime loads it via
`Phase3Inputs.model_validate_json(...)`, failing fast on shape
errors with field-level context.

The external JSON-Schema file `data/phase3_inputs.schema.json` is
generated from this model by `scripts/export_phase3_input_schema.py`
(§18 C14 of the scoping doc). Never hand-edit that file —
regenerate it when this model changes.

Every field group corresponds to one top-level key in the sample
at `data/phase3_inputs.example.json`:

    operation                 Who / what / where (name, echelon, axis, ...)
    references                Letter / WARNO numbers, map sheets
    locations                 Assembly area, AO, CGO
    timing                    H-Hour, reporting time, total minutes available
    retrieval                 Collections the generator may query (v1 = one)
    mission_intent_free_text  Short Arabic / English free text (seed input)
    document_selection        Which of the four documents to generate
    output                    Run ID + optional override for output root

Strict-shape (`extra="forbid"`) on every sub-model — unknown keys
raise. Keys whose names start with underscore are dropped by the
loader before validation so the example file can carry `_comment*`
annotations (documentation aid).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    """Shared config — strict shape, no coercion surprises."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Operation(_Strict):
    name: str
    echelon: str
    axis: str
    operation_type: str
    organization: str | None = None
    department: str | None = None
    unit: str | None = None
    task_units: str | None = None
    higher_unit_mission: str | None = None
    attached_detached_units: str | None = None
    movement_order: str | None = None
    own_training_readiness: str | None = None


class References(_Strict):
    letter_ref_number: str
    warning_order_ref_number: str
    maps: str
    header_line: str | None = None


class Locations(_Strict):
    assembly_area: str
    area_of_interest: str | None = None
    area_of_operations: str | None = None
    civil_considerations: str | None = None


class Timing(_Strict):
    reporting_date_gregorian: datetime
    h_hour_gregorian: datetime
    total_available_minutes: int
    time_zone: str
    first_light: str | None = None
    last_light: str | None = None
    moon_phase: str | None = None


class Retrieval(_Strict):
    collections: list[str]


class DocumentSelection(_Strict):
    # §18 C17 kept OPORD + Staff Estimates gated off (v2 only).
    # §18 C21 (2026-04-23) adds two net-new v1 documents —
    # ``warning_order`` (mapped-only, Arabic الأمر الإنذاري) and
    # ``staff_brief`` (Step-1-focused running-estimate brief, Arabic
    # إيجاز هيئة الركن). Both default True so the standard run now
    # produces four .docx files. ``operation_order`` and
    # ``staff_estimate`` remain False by default and gated off at
    # the YAML level.
    operation_order: bool = False
    staff_estimate: bool = False
    time_analysis: bool = True
    initial_planning_guidance: bool = True
    warning_order: bool = True
    staff_brief: bool = True


class Output(_Strict):
    run_id: str
    output_root_override: str | None = None


class Phase3Inputs(_Strict):
    operation: Operation
    references: References
    locations: Locations
    timing: Timing
    retrieval: Retrieval
    mission_intent_free_text: str
    document_selection: DocumentSelection = DocumentSelection()
    output: Output


def strip_underscore_keys(obj):
    """Recursively drop dict keys whose name starts with ``_``.

    Used by the loader so `data/phase3_inputs.example.json` (and
    any production inputs.json) can carry `_comment*` annotations
    without tripping `extra="forbid"`. Pure, non-mutating.
    """
    if isinstance(obj, dict):
        return {k: strip_underscore_keys(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [strip_underscore_keys(v) for v in obj]
    return obj


def load_inputs(raw: dict) -> Phase3Inputs:
    """Validate a raw dict (already JSON-parsed) as Phase3Inputs.

    Strips underscore-prefixed documentation keys first, then runs
    Pydantic's strict validation. Raises `pydantic.ValidationError`
    on shape mismatch.
    """
    return Phase3Inputs.model_validate(strip_underscore_keys(raw))


if __name__ == "__main__":
    # Standalone smoke: point at any inputs.json and see it validate.
    import json
    import sys
    from pathlib import Path

    if len(sys.argv) != 2:
        print("usage: python -m graph.generation.schema.inputs <path-to-inputs.json>")
        sys.exit(2)
    raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    inputs = load_inputs(raw)
    print(f"OK {sys.argv[1]}")
    print(f"  operation     = {inputs.operation.name} ({inputs.operation.echelon} / {inputs.operation.axis})")
    print(f"  h_hour        = {inputs.timing.h_hour_gregorian.isoformat()}")
    print(f"  total_minutes = {inputs.timing.total_available_minutes}")
    print(f"  collections   = {inputs.retrieval.collections}")
    print(f"  docs selected = "
          f"{'OPORD ' if inputs.document_selection.operation_order else ''}"
          f"{'Staff ' if inputs.document_selection.staff_estimate else ''}"
          f"{'Time ' if inputs.document_selection.time_analysis else ''}"
          f"{'IPG ' if inputs.document_selection.initial_planning_guidance else ''}"
          f"{'WARNO ' if inputs.document_selection.warning_order else ''}"
          f"{'Brief ' if inputs.document_selection.staff_brief else ''}")
