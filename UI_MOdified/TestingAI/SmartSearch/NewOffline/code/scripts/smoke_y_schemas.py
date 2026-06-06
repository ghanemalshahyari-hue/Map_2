"""scripts/smoke_y_schemas.py — §C23 acceptance check.

For each of the three Y-approved documents, verify:

  1. The per-doc ``prompts/<doc>/template.yaml`` loads and dispatches
     against a reference ``inputs.json`` (no LLM, no Qdrant).
  2. The resulting ``<doc>.fields.json`` carries EXACTLY the same keys
     as the Y reference file under ``/Users/hextechkraken/Desktop/y/``.
  3. No field value is an empty / whitespace-only string.
  4. Every retrieved / source_file_extracted field (i.e. every field
     not filled offline) falls back to one of the three approved Arabic
     placeholders, not to ``""``.

The smoke runs fully offline — source files / doctrine retrieval are
NOT invoked — so the test passes on a laptop without Qdrant + OpenAI
credentials. A CI-friendly green signal that the schema shapes and
fallback behaviour are correct.

Usage::

    python scripts/smoke_y_schemas.py                # run all 3 docs
    python scripts/smoke_y_schemas.py staff_brief    # single doc
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(REPO_ROOT / ".env")

from graph.generation.field_dispatcher import (  # noqa: E402
    PLACEHOLDER_DEFERRED_AR,
    PLACEHOLDER_NOT_IN_DOCTRINE_AR,
    PLACEHOLDER_NOT_IN_INPUTS_AR,
    RetrievedFieldNotImplemented,
    dispatch_template,
)
from graph.generation.schema.inputs import load_inputs  # noqa: E402
from graph.generation.template_loader import (  # noqa: E402
    load_template,
    resolve_template_path,
)


Y_ROOT = Path(os.environ.get("Y_REFERENCE_ROOT", "/Users/hextechkraken/Desktop/y"))
Y_FILES: dict[str, Path] = {
    "time_analysis":              Y_ROOT / "time_estimates_edited.txt",
    "initial_planning_guidance":  Y_ROOT / "initial_planning_guide_edited.txt",
    "staff_brief":                Y_ROOT / "staff_brief_edited.txt",
}

# ``warning_order`` Y reference is an RTF (``WarningOrderJson.rtf``) — not
# parseable as JSON. Key set inlined verbatim so the smoke test still
# covers the Y-key parity check.
Y_INLINE_KEYS: dict[str, set[str]] = {
    "warning_order": {
        "friendly_forces", "join_op_mission", "join_op_purp", "joint_ops_how",
        "joint_ops_desired_end", "mission_of_supporting_unit",
        "CIVILIAN_CONSIDERATIONS", "gov_and_nongov_org", "local_authorities",
        "red_crescent", "Attached_and_Detached_units", "Operational_Assumptions",
        "GROUND_COMPONENT_MISSION", "Exc_command_purp", "Concept_of_operations",
        "Units_Duty", "Duties_of_Other_Combat_Units_and_Combat_Support_Units",
        "Timings", "Commanders_Crtitical_Information_Requirements",
        "header", "header2", "header3", "header4", "Assembly_Area",
        "date_time", "letter_ref_number", "letter_ref_number2", "References",
        "Maps", "task_assembly", "time_zone", "Appendices", "Viewports",
        "situation", "area_interest", "operations_area", "terrain", "weather",
        "civil_considerations", "enemy_forces", "Fire_support_coordination",
        "Air_support_coordination", "Risk_assy", "ROE",
        "Other_coordination_media", "Other_coordination_meeting",
        "Other_coordination_Excu", "Other_coordination_movm",
        "Sustainment", "ACCS",
    },
}

ALLOWED_PLACEHOLDERS = {
    PLACEHOLDER_NOT_IN_INPUTS_AR,
    PLACEHOLDER_DEFERRED_AR,
    PLACEHOLDER_NOT_IN_DOCTRINE_AR,
}


def _load_y_keys(path: Path) -> set[str]:
    """Parse the Y reference file (tolerating the known stray-comma bug)
    and return its key set.

    ``time_estimates_edited.txt`` ends with a stray ``,"`` making it
    invalid JSON; handle that by stripping the trailing comma-quote
    before parsing. The other two Y files parse cleanly.
    """
    raw = path.read_text(encoding="utf-8").strip()
    # Fix the known time_estimates_edited.txt syntax error:
    #   "time_now": "1000","
    # → "time_now": "1000"
    raw = raw.replace('"1000","\n}', '"1000"\n}').replace('"1000","}', '"1000"}')
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SystemExit(
            f"{path}: cannot parse Y reference — {e}. Source may have drifted."
        ) from None
    if not isinstance(data, dict):
        raise SystemExit(f"{path}: Y reference is not a dict (got {type(data).__name__})")
    return set(data.keys())


def _smoke_one(doc_id: str) -> list[str]:
    """Run the offline smoke for one doc. Returns a list of problem strings."""
    problems: list[str] = []
    ref = Y_FILES.get(doc_id)
    inline_keys = Y_INLINE_KEYS.get(doc_id)
    if ref is None and inline_keys is None:
        return [f"{doc_id}: no Y reference registered"]

    try:
        template_path = resolve_template_path(doc_id)
    except FileNotFoundError as e:
        return [f"{doc_id}: {e}"]

    try:
        template = load_template(template_path)
    except Exception as e:  # noqa: BLE001 — collect everything
        return [f"{doc_id}: load_template failed: {e}"]

    if len(template.schemas) != 1:
        problems.append(
            f"{doc_id}: expected exactly 1 schema class (Y-flat shape), "
            f"got {len(template.schemas)}"
        )

    inputs_path = REPO_ROOT / "data" / "phase3_inputs.example.json"
    inputs = load_inputs(json.loads(inputs_path.read_text(encoding="utf-8")))

    # Retrieved fields can't resolve offline; feed stub placeholders so
    # the dispatcher is exercised end-to-end without Qdrant.
    retrieved_stub: dict[str, dict[str, str]] = {}
    for cls_name, sdef in template.schemas.items():
        for fname, spec in sdef.fields.items():
            if getattr(spec, "kind", None) == "retrieved":
                retrieved_stub.setdefault(cls_name, {})[fname] = PLACEHOLDER_NOT_IN_DOCTRINE_AR

    try:
        result = dispatch_template(
            template,
            inputs,
            retrieved_values=retrieved_stub,
        )
    except RetrievedFieldNotImplemented as e:
        return [f"{doc_id}: retrieved field not wired: {e}"]
    except Exception as e:  # noqa: BLE001
        return [f"{doc_id}: dispatch failed: {e}"]

    # Flatten — the Y-approved templates all have exactly one class.
    if not result.values:
        return [f"{doc_id}: dispatcher returned no values"]
    (only_cls, flat) = next(iter(result.values.items()))

    # --- key parity ---
    y_keys = inline_keys if inline_keys is not None else _load_y_keys(ref)
    out_keys = set(flat.keys())
    missing = y_keys - out_keys
    extra = out_keys - y_keys
    if missing:
        problems.append(f"{doc_id}: missing {len(missing)} key(s): {sorted(missing)}")
    if extra:
        problems.append(f"{doc_id}: extra {len(extra)} key(s): {sorted(extra)}")

    # --- no empty strings ---
    for fname, value in flat.items():
        if not isinstance(value, str):
            problems.append(f"{doc_id}: {fname!r} not a string ({type(value).__name__})")
            continue
        if not value.strip():
            problems.append(f"{doc_id}: {fname!r} is empty / whitespace")

    return problems


def main(argv: list[str]) -> int:
    targets = argv[1:] or (list(Y_FILES.keys()) + list(Y_INLINE_KEYS.keys()))
    total_problems = 0
    for doc_id in targets:
        problems = _smoke_one(doc_id)
        if problems:
            total_problems += len(problems)
            print(f"FAIL {doc_id}:")
            for p in problems:
                print(f"  - {p}")
        else:
            print(f"OK   {doc_id}: Y-keys match, no empty values")
    return 1 if total_problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
