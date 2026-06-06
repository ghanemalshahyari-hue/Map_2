#!/usr/bin/env python3
"""Smoke test — validate any wargame GeoJSON file against the bundled schema.

Usage:
  python validate.py path/to/step05.geojson
  python validate.py path/to/folder/    # validates every *.geojson in folder

Requires:  pip install jsonschema
"""
import json, sys
from pathlib import Path
try:
    from jsonschema import validate, Draft202012Validator, ValidationError
except ImportError:
    print("Install jsonschema first: pip install jsonschema"); sys.exit(2)

SCHEMA = Path(__file__).parent / "wargame_geojson.schema.json"

def validate_file(path: Path, schema: dict) -> bool:
    try:
        fc = json.loads(path.read_text())
        validate(instance=fc, schema=schema)
        n = len(fc.get("features", []))
        print(f"  ✓ {path.name}  ({n} features)")
        return True
    except ValidationError as e:
        print(f"  ✗ {path.name}: {str(e)[:300]}")
        return False
    except Exception as e:
        print(f"  ✗ {path.name}: {type(e).__name__}: {e}")
        return False

def main(target: str) -> int:
    schema = json.loads(SCHEMA.read_text())
    Draft202012Validator.check_schema(schema)   # validate the schema itself
    p = Path(target)
    files = sorted(p.glob("*.geojson")) if p.is_dir() else [p]
    if not files:
        print(f"No .geojson files found at {p}"); return 1
    fails = sum(0 if validate_file(f, schema) else 1 for f in files)
    print(f"\nResult: {len(files)-fails}/{len(files)} pass")
    return 0 if fails == 0 else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
