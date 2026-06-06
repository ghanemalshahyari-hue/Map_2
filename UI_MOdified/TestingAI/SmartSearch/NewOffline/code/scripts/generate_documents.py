"""scripts/generate_documents.py — Phase 3 CLI entry point.

Primary flow — THREE per-doc prompts (§18 C22, 2026-04-23)::

    python scripts/generate_documents.py \\
        --prompt-1 data/phase3_prompt_1.example.txt \\
        --prompt-2 data/phase3_prompt_2.example.txt \\
        --prompt-3 data/phase3_prompt_3.example.txt \\
        [--out output/generated/<run_id>] \\
        [--run-id <id>] \\
        [--docs time_analysis ...] \\
        [--templates-dir templates]

Backwards-compatible — one combined free-form prompt (pre-§C22)::

    python scripts/generate_documents.py \\
        --prompt data/phase3_prompt.example.txt \\
        [...same options...]

Escape hatch — hand-authored ``inputs.json`` for debugging or
regression testing. Skips the extractor LLM call entirely::

    python scripts/generate_documents.py \\
        --inputs-json data/phase3_inputs.example.json \\
        [...same options...]

The primary flow:
  1. Read the prompt file.
  2. ``prompt_extractor.extract_inputs(prompt_text)`` — one LLM call
     at temperature 0.0 that produces a validated :class:`Phase3Inputs`.
  3. Resolve ``run_id`` (either ``--run-id`` override, the extractor's
     synthesized value, or a hash-of-prompt fallback).
  4. Persist the extracted Phase3Inputs to
     ``<out_root>/extracted_inputs.json`` — the audit trail a
     reviewer diffs against the original prompt.
  5. For each selected doc, ``load_template → assemble_document →
     render_to_docx``.

Errors from any stage are reported per-doc; the others still run.
Exit code 0 iff every selected doc succeeded.

**v1 scope gate (scoping §18 C17).** v1 ships only the two MDMP
Step 1 outputs: ``time_analysis`` and ``initial_planning_guidance``.
Any request for ``staff_estimate`` (Steps 2–6) or ``operation_order``
(Step 7) is dropped with a stderr log line and does not count as a
failure — those templates have ``v1_scope: false`` at the YAML top
level and are deferred to v2. The gate reads each template's
``v1_scope`` directly, so flipping the flag re-enables a document
without touching this file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Load .env BEFORE any graph.* import — Phase 2's retrieval stack
# requires OPENAI_API_KEY and other vars resolved at import time
# (graph.config._build_config runs on first call). Matches the
# "load_dotenv() before any graph/ import" rule from the Phase 1
# three-critical-rules block in docs/memory.md.
from dotenv import load_dotenv  # noqa: E402
load_dotenv(REPO_ROOT / ".env")

from pydantic import ValidationError  # noqa: E402

from graph.generation.assembler import (  # noqa: E402
    AssemblyError,
    assemble_document,
    render_to_docx,
)
from graph.generation.field_dispatcher import (  # noqa: E402
    DispatchError,
    RetrievedFieldNotImplemented,
)
from graph.generation.prompt_extractor import (  # noqa: E402
    ExtractionError,
    compose_three_prompts,
    extract_inputs,
    extract_inputs_from_three,
    prompt_sha256,
)
import yaml  # noqa: E402

from graph.generation.schema.inputs import Phase3Inputs, load_inputs  # noqa: E402
from graph.generation.source_file_reader import (  # noqa: E402
    ReadFile,
    SourceFileReadError,
    read_source_file,
    read_source_files,
)
from graph.generation.template_loader import (  # noqa: E402
    TemplateValidationError,
    load_template,
    resolve_template_path,
)

ALL_DOC_IDS = (
    # §C23 (2026-04-23) — v1 scope narrowed to the three Y-approved docs.
    "time_analysis",
    "initial_planning_guidance",
    "staff_brief",
    # Placeholder (§C23 — kept until a Y schema lands).
    "warning_order",
    # v2-deferred — gated off at the YAML ``v1_scope: false`` level.
    "operation_order",
    "staff_estimate",
)


def _dump_fields_json(generated, out_path: Path) -> Path:
    """Emit a verification JSON alongside the rendered ``.docx``.

    §C23 (2026-04-23) — Y-approved flat shape for the three migrated
    documents. When the template has exactly ONE schema class AND that
    class lives under ``prompts.<doc>.schema``, the JSON is a flat
    ``{field: value}`` object whose keys match the Y reference files
    verbatim. Filename ``<stem>.fields.json``.

    Legacy templates (warning_order / operation_order / staff_estimate)
    keep the pre-§C23 nested shape so their existing consumers don't
    break::

        {
          "template_id": "warning_order",
          "title_arabic": "...",
          "sections": { "HeaderSection": { ... }, ... }
        }

    A final post-condition assertion rejects any ``""`` / whitespace-only
    value — blanks must surface as one of the three Arabic placeholders
    from ``field_dispatcher.py``, not as empty strings.
    """
    sections = generated.sections
    template_id = generated.template.meta.template_id

    # One-class Y-schema path → flat dump.
    if len(sections) == 1:
        (only_cls, only_instance) = next(iter(sections.items()))
        payload = only_instance.model_dump(mode="json")
    else:
        payload = {
            "template_id": template_id,
            "title_arabic": generated.template.meta.title_arabic,
            "sections": {
                name: instance.model_dump(mode="json")
                for name, instance in sections.items()
            },
        }

    # §C23 post-condition: no empty strings make it to disk.
    _assert_no_empty_values(payload, template_id=template_id)

    fields_path = out_path.with_name(out_path.stem + ".fields.json")
    fields_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return fields_path


def _assert_no_empty_values(obj, *, template_id: str, path: str = "") -> None:
    """Depth-first walk over a JSON-ready dict / list / scalar; raise if
    any str value is empty or whitespace-only.

    Called right before ``_dump_fields_json`` writes to disk so smoke
    tests + downstream consumers can trust every field carries a real
    Arabic value (or one of the three approved placeholders).
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            _assert_no_empty_values(v, template_id=template_id, path=f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _assert_no_empty_values(v, template_id=template_id, path=f"{path}[{i}]")
    elif isinstance(obj, str):
        if not obj.strip():
            raise ValueError(
                f"[{template_id}] empty string at {path!r} — dispatcher should "
                f"have substituted one of the Arabic placeholders."
            )


def _render_output_filename(template) -> str:
    """Resolve ``meta.output_filename`` with the ``{document_slug}`` placeholder.

    Pre-§18 C21 the CLI emitted every document as ``<doc_id>.docx``,
    ignoring the YAML's ``meta.output_filename`` entirely. Under C21
    the YAML is authoritative so two templates can map to the same
    schema module but still produce distinct files (warning_order.docx
    + operation_order.docx; staff_brief.docx + staff_estimate.docx).

    Falls back to ``<document_slug>.docx`` if the meta entry is blank
    or lacks the placeholder.
    """
    meta = template.meta
    pattern = (meta.output_filename or "").strip()
    slug = meta.document_slug
    if not pattern:
        return f"{slug}.docx"
    return pattern.replace("{document_slug}", slug)


# ---------------------------------------------------------- helpers

def _selected_doc_ids(inputs: Phase3Inputs, override: list[str] | None) -> list[str]:
    if override:
        return list(override)
    sel = inputs.document_selection
    return [doc_id for doc_id in ALL_DOC_IDS if getattr(sel, doc_id)]


def _template_is_v1_scope(templates_dir: Path, doc_id: str) -> bool:
    """Peek at the YAML's top-level ``v1_scope`` without full loader parse.

    Returns True when the key is absent (backwards-compatible default)
    or set to true. Returns False only when the key is explicitly
    ``false``. Broken / missing files return True so the main run
    surfaces the real error (TEMPLATE-FAIL) — we don't want the scope
    gate to swallow a genuine problem.
    """
    path = templates_dir / f"{doc_id}.yaml"
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return True
    if not isinstance(data, dict):
        return True
    return bool(data.get("v1_scope", True))


def _apply_v1_scope_gate(doc_ids: list[str], templates_dir: Path) -> list[str]:
    """Drop v2-deferred templates; emit one stderr line per skip (§18 C17)."""
    kept: list[str] = []
    for doc_id in doc_ids:
        if _template_is_v1_scope(templates_dir, doc_id):
            kept.append(doc_id)
        else:
            print(
                f"[v1-scope] skipping {doc_id} — deferred to v2 (see §18 C17)",
                file=sys.stderr,
            )
    return kept


def _resolve_output_root(inputs: Phase3Inputs, out_override: Path | None) -> Path:
    if out_override is not None:
        return out_override
    root_override = inputs.output.output_root_override
    root = Path(root_override) if root_override else REPO_ROOT / "output" / "generated"
    return root / inputs.output.run_id


def _override_run_id(inputs: Phase3Inputs, new_id: str) -> Phase3Inputs:
    """Return a copy of ``inputs`` with ``output.run_id`` replaced.

    Used when ``--run-id`` is passed or when the extractor's
    synthesized id is empty / the literal sentinel "unnamed_run".
    Phase3Inputs is frozen for-all-intents (no ``model_config``
    mutation-prevention but we treat it as immutable). We rebuild
    via ``model_copy(deep=True)`` so downstream code sees a single
    consistent instance.
    """
    return inputs.model_copy(
        deep=True,
        update={"output": inputs.output.model_copy(update={"run_id": new_id})},
    )


def _fallback_run_id_from_prompt(prompt_text: str) -> str:
    """Generate a deterministic run_id from a prompt when neither
    ``--run-id`` nor the extractor produced a usable one.

    Shape: ``prompt_<16-hex-sha-prefix>`` — ASCII, underscore-safe,
    stable across identical prompts (same run_id → same cache dir
    → cache hits across reruns).
    """
    return f"prompt_{prompt_sha256(prompt_text)}"


def _persist_extracted_inputs(inputs: Phase3Inputs, out_root: Path, prompt_text: str) -> Path:
    """Write the extraction audit trail into the run's output root.

    File name: ``extracted_inputs.json``. Contents: the full
    Phase3Inputs as JSON plus a ``_source`` block with the prompt
    sha256 and length. The ``_source`` field uses an underscore
    prefix so ``load_inputs(...)`` would drop it on round-trip —
    it's documentation, not schema.
    """
    out_root.mkdir(parents=True, exist_ok=True)
    payload = inputs.model_dump(mode="json")
    payload["_source"] = {
        "prompt_sha256": prompt_sha256(prompt_text),
        "prompt_length_chars": len(prompt_text),
        "note": (
            "This file was produced by graph.generation.prompt_extractor from a "
            "free-form operation brief. Do not hand-edit. To reproduce, re-run "
            "the CLI against the same prompt.txt."
        ),
    }
    path = out_root / "extracted_inputs.json"
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def _inputs_raw_for_cache(inputs: Phase3Inputs) -> dict:
    """Re-serialize Phase3Inputs to a dict for the per-group cache key.

    ``cache.py::_input_subset_hash`` hashes the whole inputs payload
    today; converting via ``model_dump(mode="json")`` gives us
    JSON-safe types that compare stably across runs.
    """
    return inputs.model_dump(mode="json")


# ---------------------------------------------------------- per-doc runner

def _run_one(
    doc_id: str,
    templates_dir: Path,
    inputs: Phase3Inputs,
    inputs_raw: dict,
    out_root: Path,
    *,
    user_prompt_sha256: str,
    extractor_model: str,
    extractor_temperature: float,
    source_files: list[ReadFile] | None = None,
) -> tuple[bool, str]:
    """Render one document; return (success, status_line).

    §C23 — ``templates_dir`` is kept as the *legacy* location hint for
    back-compat; actual resolution uses
    :func:`graph.generation.template_loader.resolve_template_path` which
    prefers ``prompts/<doc>/template.yaml``. The legacy arg is threaded
    only so callers that pass ``--templates-dir`` still work without a
    code change.
    """
    try:
        template_path = resolve_template_path(doc_id)
    except FileNotFoundError:
        # Try the explicit legacy dir as a second fallback.
        legacy_path = templates_dir / f"{doc_id}.yaml"
        if legacy_path.is_file():
            template_path = legacy_path
        else:
            return False, f"TEMPLATE-FAIL {doc_id}: no template.yaml located (checked prompts/ and templates/)"
    try:
        template = load_template(template_path)
    except (TemplateValidationError, ValidationError) as e:
        return False, f"TEMPLATE-FAIL {doc_id}: {e}"

    # Per-group cache dir lives inside the run's output root so it's
    # automatically gitignored and naturally scoped to one run_id.
    from graph.generation.cache import cache_dir_for_run
    cache_dir = cache_dir_for_run(out_root)

    try:
        generated = assemble_document(
            template,
            inputs,
            inputs_raw=inputs_raw,
            template_path=template_path,
            cache_dir=cache_dir,
            user_prompt_sha256=user_prompt_sha256,
            extractor_model=extractor_model,
            extractor_temperature=extractor_temperature,
            source_files=source_files,
        )
    except RetrievedFieldNotImplemented as e:
        return False, f"SKIP {doc_id}: {e}"
    except (DispatchError, AssemblyError) as e:
        return False, f"DISPATCH-FAIL {doc_id}: {e}"

    out_path = out_root / _render_output_filename(template)
    try:
        render_to_docx(generated, out_path)
    except Exception as e:  # renderer can raise docx internals
        return False, f"RENDER-FAIL {doc_id}: {type(e).__name__}: {e}"

    # §C22 — emit the verification JSON next to the .docx. A dump
    # failure should not mask a successful render, so wrap it; the
    # caller will still see the OK status for the document itself.
    try:
        _dump_fields_json(generated, out_path)
    except Exception as e:
        print(f"WARN {doc_id}: field-json dump failed: {e}", file=sys.stderr)

    size = out_path.stat().st_size if out_path.exists() else 0
    rel_path = (
        out_path.relative_to(REPO_ROOT)
        if out_path.is_relative_to(REPO_ROOT)
        else out_path
    )
    return True, f"OK   {doc_id}: {rel_path} ({size} bytes)"


# ---------------------------------------------------------- input surfaces

def _load_from_prompt(prompt_path: Path, run_id_override: str | None) -> tuple[Phase3Inputs, str]:
    """Legacy single-prompt path: read prompt, run extractor, return (inputs, prompt_text)."""
    try:
        prompt_text = prompt_path.read_text(encoding="utf-8")
    except OSError as e:
        raise SystemExit(f"cannot read --prompt file: {e}")
    try:
        inputs = extract_inputs(prompt_text)
    except ExtractionError as e:
        raise SystemExit(f"extraction failed: {e}")

    # run_id resolution: explicit override > extractor's synthesis
    # > hash-of-prompt fallback. The extractor is instructed to
    # emit "unnamed_run" when it can't synthesize one; the fallback
    # catches that too.
    candidate = inputs.output.run_id
    if run_id_override:
        inputs = _override_run_id(inputs, run_id_override)
    elif not candidate or candidate == "unnamed_run":
        inputs = _override_run_id(inputs, _fallback_run_id_from_prompt(prompt_text))
    return inputs, prompt_text


def _load_from_three_prompts(
    p1_path: Path,
    p2_path: Path,
    p3_path: Path,
    run_id_override: str | None,
) -> tuple[Phase3Inputs, str]:
    """Primary §C22 path: read three per-doc prompt files, compose, extract.

    Returns ``(inputs, composed_text)`` — the composed text is what the
    extractor actually saw and is what gets stamped into the cache key.
    """
    paths = {"--prompt-1": p1_path, "--prompt-2": p2_path, "--prompt-3": p3_path}
    texts: dict[str, str] = {}
    for flag, path in paths.items():
        try:
            texts[flag] = path.read_text(encoding="utf-8")
        except OSError as e:
            raise SystemExit(f"cannot read {flag} file: {e}")
    try:
        inputs, composed = extract_inputs_from_three(
            texts["--prompt-1"], texts["--prompt-2"], texts["--prompt-3"],
        )
    except ExtractionError as e:
        raise SystemExit(f"extraction failed: {e}")

    candidate = inputs.output.run_id
    if run_id_override:
        inputs = _override_run_id(inputs, run_id_override)
    elif not candidate or candidate == "unnamed_run":
        inputs = _override_run_id(inputs, _fallback_run_id_from_prompt(composed))
    return inputs, composed


def _parse_source_file_spec(spec: str) -> tuple[str, Path]:
    """Parse a ``--source-file`` argument of the form ``kind=path``.

    ``kind`` must be one of ``warning_order`` / ``intel_report`` / ``other``.
    """
    if "=" not in spec:
        raise SystemExit(
            f"--source-file {spec!r}: expected 'kind=path' (kind is "
            f"warning_order | intel_report | other)"
        )
    kind, _, path_str = spec.partition("=")
    kind = kind.strip().lower()
    if kind not in {"warning_order", "intel_report", "other"}:
        raise SystemExit(
            f"--source-file {spec!r}: unknown kind {kind!r}"
        )
    return kind, Path(path_str.strip()).expanduser()


def _load_from_source_files(
    warning_order: Path | None,
    intel_report: Path | None,
    extra_specs: list[str],
    run_id_override: str | None,
) -> tuple[Phase3Inputs, str, list[ReadFile]]:
    """§C23 primary surface — read user source files, synthesise Phase3Inputs.

    Returns ``(inputs, composed_text, source_files)``:
      * ``inputs`` — Phase3Inputs extracted from the concatenated file
        text via the existing ``prompt_extractor.extract_inputs``. The
        extractor sees the Warning Order + Intel Report + extras as
        one input block and fills ``timing`` / ``operation`` / etc.
      * ``composed_text`` — the exact text handed to the extractor
        (used for the cache key + ``run_prompts.json`` audit).
      * ``source_files`` — the read files, later handed to
        ``assemble_document(source_files=...)`` so the per-doc
        ``source_file_extractor`` can be invoked.
    """
    extras: list[tuple[Path, str]] = []
    for spec in extra_specs:
        kind, path = _parse_source_file_spec(spec)
        extras.append((path, kind))
    try:
        files = read_source_files(
            warning_order=warning_order,
            intel_report=intel_report,
            extra=extras or None,
        )
    except (FileNotFoundError, SourceFileReadError) as e:
        raise SystemExit(f"source-file read failed: {e}")

    # Build the composed text fed to the Phase3Inputs extractor. Keep it
    # simple — one labelled section per file, same shape the three-prompt
    # path uses so the extractor's existing system prompt still steers.
    parts: list[str] = []
    for rf in files:
        if rf.kind == "warning_order":
            parts.append(f"[PROMPT 2 — PLANNING (WARNING ORDER)]\n{rf.text}")
        elif rf.kind == "intel_report":
            parts.append(f"[PROMPT 3 — INTEL & READINESS]\n{rf.text}")
        else:
            parts.append(f"[ADDITIONAL SOURCE — {rf.path.name}]\n{rf.text}")
    # Timing block is the extractor's own [PROMPT 1 — TIME ...] heading;
    # if neither WARNO nor Intel Report carries the timing paragraph
    # explicitly, the extractor will have to infer from context. A later
    # pass can add a dedicated --timing-file arg if this becomes weak.
    if not any("PROMPT 1" in p for p in parts):
        parts.insert(
            0,
            "[PROMPT 1 — TIME / التحليل الزمني]\n"
            "(timing facts should be inferred from the Warning Order)",
        )
    composed = "\n\n".join(parts)

    try:
        inputs = extract_inputs(composed)
    except ExtractionError as e:
        raise SystemExit(f"extraction failed: {e}")

    candidate = inputs.output.run_id
    if run_id_override:
        inputs = _override_run_id(inputs, run_id_override)
    elif not candidate or candidate == "unnamed_run":
        inputs = _override_run_id(inputs, _fallback_run_id_from_prompt(composed))

    return inputs, composed, files


def _load_from_inputs_json(inputs_path: Path, run_id_override: str | None) -> Phase3Inputs:
    """Escape hatch: load hand-authored inputs.json, skip the extractor."""
    try:
        raw = json.loads(inputs_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"cannot read --inputs-json: {e}")
    try:
        inputs = load_inputs(raw)
    except ValidationError as e:
        raise SystemExit(f"inputs validation failed:\n{e}")
    if run_id_override:
        inputs = _override_run_id(inputs, run_id_override)
    return inputs


# ---------------------------------------------------------- main

def main(argv: list[str] | None = None) -> int:
    from graph.shared.device_banner import print_device_banner
    print_device_banner()

    parser = argparse.ArgumentParser(
        prog="generate_documents",
        description=(
            "Phase 3 document generator. Primary input is a free-form "
            "prompt (extractor produces Phase3Inputs); --inputs-json is "
            "the escape hatch for debugging / regression."
        ),
    )
    # §C23 — the primary surface is now two (or more) source files.
    # --warning-order + --intel-report replace the three-prompt flow
    # for the Y-approved documents. Legacy --prompt-1 / -2 / -3 and
    # --prompt stay for back-compat with regression fixtures.
    # --inputs-json is the debug escape hatch.
    parser.add_argument(
        "--warning-order",
        type=Path,
        help="Path to the user's Warning Order file (.docx / .pdf / .txt). "
             "Primary source of scenario facts (mission, task organization, "
             "timing, references, commander's intent). §C23.",
    )
    parser.add_argument(
        "--intel-report",
        type=Path,
        help="Path to the user's Intel Report file (.docx / .pdf / .txt). "
             "Primary source of environment / enemy / friendly-readiness / "
             "logistics facts. §C23.",
    )
    parser.add_argument(
        "--source-file",
        action="append",
        default=[],
        help="Additional source file in the form ``kind=path`` where kind "
             "is 'warning_order' | 'intel_report' | 'other'. May be "
             "repeated to pass more than two files. §C23.",
    )
    parser.add_argument(
        "--prompt-1",
        type=Path,
        help="LEGACY (pre-§C23) PROMPT 1 — timing facts.",
    )
    parser.add_argument(
        "--prompt-2",
        type=Path,
        help="LEGACY PROMPT 2 — planning context / commander's intent.",
    )
    parser.add_argument(
        "--prompt-3",
        type=Path,
        help="LEGACY PROMPT 3 — intel / readiness context.",
    )
    parser.add_argument(
        "--prompt",
        type=Path,
        help="LEGACY single-file combined prompt.",
    )
    parser.add_argument(
        "--inputs-json",
        type=Path,
        help="Path to a hand-authored Phase3Inputs JSON file. Skips the "
             "extractor — intended for debugging / regression only.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Override output dir (default: output/generated/<run_id>).",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Override output.run_id (takes precedence over extractor "
             "output and inputs.json).",
    )
    parser.add_argument(
        "--docs",
        nargs="*",
        default=None,
        help="Restrict to these template_ids (default: all selected in inputs).",
    )
    parser.add_argument(
        "--templates-dir",
        type=Path,
        default=REPO_ROOT / "templates",
        help="Directory containing <doc_id>.yaml files.",
    )
    args = parser.parse_args(argv)

    # Exactly-one-surface gate. §C23 adds the two-file surface:
    #   (--warning-order + --intel-report) OR (legacy three-prompt set)
    #   OR --prompt OR --inputs-json
    three = [args.prompt_1, args.prompt_2, args.prompt_3]
    three_any = any(p is not None for p in three)
    three_all = all(p is not None for p in three)
    files_any = (
        args.warning_order is not None
        or args.intel_report is not None
        or bool(args.source_file)
    )
    surfaces = (
        files_any,
        three_any,
        args.prompt is not None,
        args.inputs_json is not None,
    )
    if sum(1 for s in surfaces if s) != 1:
        parser.error(
            "pick exactly one input surface: (--warning-order + --intel-report "
            "[+ --source-file ...]) OR (--prompt-1 + --prompt-2 + --prompt-3) "
            "OR --prompt OR --inputs-json"
        )
    if three_any and not three_all:
        parser.error(
            "--prompt-1, --prompt-2 and --prompt-3 must be provided together"
        )

    # Resolve input surface.
    prompt_text: str | None = None
    source_files_loaded: list[ReadFile] = []
    if files_any:
        inputs, prompt_text, source_files_loaded = _load_from_source_files(
            args.warning_order, args.intel_report, args.source_file, args.run_id,
        )
    elif three_all:
        inputs, prompt_text = _load_from_three_prompts(
            args.prompt_1, args.prompt_2, args.prompt_3, args.run_id,
        )
    elif args.prompt is not None:
        inputs, prompt_text = _load_from_prompt(args.prompt, args.run_id)
    else:
        inputs = _load_from_inputs_json(args.inputs_json, args.run_id)

    doc_ids = _selected_doc_ids(inputs, args.docs)
    doc_ids = _apply_v1_scope_gate(doc_ids, args.templates_dir)
    out_root = _resolve_output_root(inputs, args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    # Audit trail: persist the extracted Phase3Inputs alongside the
    # rendered docs. Skipped on the --inputs-json path because the
    # inputs.json itself is the artefact.
    if prompt_text is not None:
        extracted_path = _persist_extracted_inputs(inputs, out_root, prompt_text)
        rel_extracted = (
            extracted_path.relative_to(REPO_ROOT)
            if extracted_path.is_relative_to(REPO_ROOT)
            else extracted_path
        )
        print(f"extracted: {rel_extracted}")

        # §C23 — if the two-file surface was used, dump per-file audit.
        if files_any and source_files_loaded:
            out_root.mkdir(parents=True, exist_ok=True)
            sources_path = out_root / "run_sources.json"
            sources_path.write_text(
                json.dumps(
                    {
                        "surface": "source_files",
                        "composed_sha256": prompt_sha256(prompt_text),
                        "files": [
                            {
                                "path": str(rf.path),
                                "kind": rf.kind,
                                "sha256": rf.sha256,
                                "original_chars": rf.original_chars,
                                "char_count_after_cap": len(rf.text),
                                "truncated": rf.truncated,
                            }
                            for rf in source_files_loaded
                        ],
                    },
                    indent=2,
                    ensure_ascii=False,
                ) + "\n",
                encoding="utf-8",
            )

        # §C22 — if the three-prompt surface was used, dump the three
        # raw prompt texts alongside the composed version so a reviewer
        # can diff the originals against extracted_inputs.json.
        if three_all:
            out_root.mkdir(parents=True, exist_ok=True)
            prompts_path = out_root / "run_prompts.json"
            prompts_path.write_text(
                json.dumps(
                    {
                        "surface": "three_prompts",
                        "prompt_1": args.prompt_1.read_text(encoding="utf-8"),
                        "prompt_2": args.prompt_2.read_text(encoding="utf-8"),
                        "prompt_3": args.prompt_3.read_text(encoding="utf-8"),
                        "composed_sha256": prompt_sha256(prompt_text),
                    },
                    indent=2,
                    ensure_ascii=False,
                ) + "\n",
                encoding="utf-8",
            )

    print(f"run_id : {inputs.output.run_id}")
    rel_out = (
        out_root.relative_to(REPO_ROOT)
        if out_root.is_relative_to(REPO_ROOT)
        else out_root
    )
    print(f"out    : {rel_out}")
    print(f"docs   : {doc_ids}")

    inputs_raw = _inputs_raw_for_cache(inputs)

    # Extraction provenance feeds the cache key (scoping §18 C16).
    # Defaults describe the --inputs-json path (no extractor ran).
    if prompt_text is not None:
        from graph.generation.llm import extractor_config
        extractor_model, extractor_temperature = extractor_config()
        user_prompt_sha256 = prompt_sha256(prompt_text)
    else:
        extractor_model = ""
        extractor_temperature = 0.0
        user_prompt_sha256 = ""

    failures = 0
    for doc_id in doc_ids:
        ok, status = _run_one(
            doc_id,
            args.templates_dir,
            inputs,
            inputs_raw,
            out_root,
            user_prompt_sha256=user_prompt_sha256,
            extractor_model=extractor_model,
            extractor_temperature=extractor_temperature,
            source_files=source_files_loaded or None,
        )
        print(status)
        if not ok:
            failures += 1
    return 1 if failures > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
