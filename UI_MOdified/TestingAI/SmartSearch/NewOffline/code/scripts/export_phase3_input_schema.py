"""scripts/export_phase3_input_schema.py — regenerate `data/phase3_inputs.schema.json`.

The canonical shape of `inputs.json` is
`graph.generation.schema.inputs.Phase3Inputs` (scoping doc §14 C14).
This script exports a derived JSON Schema artefact for external
tooling consumption (editor completions, future form UIs, doc
generators). **Never hand-edit the emitted file.**

Standard invocation::

    python scripts/export_phase3_input_schema.py

Writes to `data/phase3_inputs.schema.json` relative to the repo
root. Emits a diff summary on stdout showing how the schema
changed (or reports "unchanged" when the bytes match).

Also validates the committed sample `data/phase3_inputs.example.json`
against the regenerated model — catches drift between the model
and the sample the moment it happens.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Make the repo root importable when this script is run directly.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from graph.generation.schema.inputs import Phase3Inputs, load_inputs  # noqa: E402

SCHEMA_PATH = REPO_ROOT / "data" / "phase3_inputs.schema.json"
EXAMPLE_PATH = REPO_ROOT / "data" / "phase3_inputs.example.json"


def _emit_schema() -> tuple[bool, int]:
    """Return (changed, byte_size)."""
    schema = Phase3Inputs.model_json_schema()
    # Stable ordering + two-space indent so diffs stay readable.
    rendered = json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    old = SCHEMA_PATH.read_text(encoding="utf-8") if SCHEMA_PATH.exists() else ""
    changed = rendered != old
    if changed:
        SCHEMA_PATH.write_text(rendered, encoding="utf-8")
    return changed, len(rendered.encode("utf-8"))


def _check_example() -> str:
    """Validate the committed example against the live model."""
    if not EXAMPLE_PATH.exists():
        return f"WARN: {EXAMPLE_PATH.relative_to(REPO_ROOT)} not found"
    raw = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
    try:
        load_inputs(raw)
    except Exception as e:  # pydantic.ValidationError or other
        return f"FAIL {EXAMPLE_PATH.relative_to(REPO_ROOT)}: {e}"
    return f"OK   {EXAMPLE_PATH.relative_to(REPO_ROOT)} validates against Phase3Inputs"


def main() -> int:
    changed, size = _emit_schema()
    rel = SCHEMA_PATH.relative_to(REPO_ROOT)
    status = "changed" if changed else "unchanged"
    print(f"{'WROTE' if changed else 'SKIP ':5} {rel} ({size} bytes, {status})")
    print(_check_example())
    return 0


if __name__ == "__main__":
    sys.exit(main())
