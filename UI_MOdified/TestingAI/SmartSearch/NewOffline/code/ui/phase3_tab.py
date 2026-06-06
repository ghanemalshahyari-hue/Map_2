"""ui/phase3_tab.py
=====================
Streamlit tab for Phase 3 — v1 generation (§18 C21, 2026-04-23):

    time_analysis              —  تحليل الوقت
    initial_planning_guidance  —  دليل التخطيط الأولي
    warning_order              —  الأمر الإنذاري
    staff_brief                —  إيجاز هيئة الركن

Single entry point: ``render()`` — call it from inside a Streamlit tab
context.  The tab wraps the same pipeline that ``scripts/generate_documents.py``
drives on the CLI so the UI and the script cannot drift out of sync:

  1. User pastes (or edits) a free-form Arabic operation brief.
  2. Hit **Generate** →
       - ``prompt_extractor.extract_inputs(prompt_text)`` at temperature 0.0
       - persist ``extracted_inputs.json`` as the audit trail
       - for each selected doc id:
             ``assemble_document(template, inputs, …)`` → ``render_to_docx()``
  3. Rendered .docx files + extracted_inputs.json are offered as download
     buttons; the run directory is also echoed so the user can open it
     in Finder.

Out of v1 scope (hidden): ``staff_estimate`` (full Steps 2–6 estimate) and
``operation_order`` (Step 7 OPORD) — both gated by ``v1_scope: false``
at the YAML level (§18 C17).  Toggle at the template to promote.
"""
from __future__ import annotations

import json
import time
import traceback
from pathlib import Path

import streamlit as st

from graph.generation.assembler import (
    AssemblyError,
    assemble_document,
    render_to_docx,
)
from graph.generation.cache import cache_dir_for_run
from graph.generation.field_dispatcher import (
    DispatchError,
    RetrievedFieldNotImplemented,
)
from graph.generation.prompt_extractor import (
    ExtractionError,
    extract_inputs_from_three,
    prompt_sha256,
)
from graph.generation.schema.inputs import Phase3Inputs
from graph.generation.template_loader import (
    TemplateValidationError,
    load_template,
)
from pydantic import ValidationError


_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_PROMPT_1_PATH = _REPO_ROOT / "data" / "phase3_prompt_1.example.txt"
_DEFAULT_PROMPT_2_PATH = _REPO_ROOT / "data" / "phase3_prompt_2.example.txt"
_DEFAULT_PROMPT_3_PATH = _REPO_ROOT / "data" / "phase3_prompt_3.example.txt"
_DEFAULT_TEMPLATES_DIR = _REPO_ROOT / "templates"

# v1 scope (§18 C21 2026-04-23) — four documents.
V1_DOC_IDS = (
    "time_analysis",
    "initial_planning_guidance",
    "warning_order",
    "staff_brief",
)
V1_DOC_LABELS = {
    "time_analysis":             "Time Analysis — تحليل الوقت",
    "initial_planning_guidance": "Initial Planning Guidance — دليل التخطيط الأولي",
    "warning_order":             "Warning Order — الأمر الإنذاري",
    "staff_brief":               "Staff Brief — إيجاز هيئة الركن",
}


def _load_default_prompt(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _dump_fields_json(generated, out_path: Path) -> Path:
    """Emit verification JSON alongside the rendered .docx (mirror of the CLI)."""
    payload = {
        "template_id": generated.template.meta.template_id,
        "title_arabic": generated.template.meta.title_arabic,
        "sections": {
            name: instance.model_dump(mode="json")
            for name, instance in generated.sections.items()
        },
    }
    fields_path = out_path.with_name(out_path.stem + ".fields.json")
    fields_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return fields_path


def _override_run_id(inputs: Phase3Inputs, new_id: str) -> Phase3Inputs:
    """Return a copy of inputs with output.run_id replaced (matches scripts/)."""
    return inputs.model_copy(
        deep=True,
        update={"output": inputs.output.model_copy(update={"run_id": new_id})},
    )


def _persist_extracted_inputs(
    inputs: Phase3Inputs, out_root: Path, prompt_text: str
) -> Path:
    out_root.mkdir(parents=True, exist_ok=True)
    payload = inputs.model_dump(mode="json")
    payload["_source"] = {
        "prompt_sha256":       prompt_sha256(prompt_text),
        "prompt_length_chars": len(prompt_text),
        "note": (
            "Produced by graph.generation.prompt_extractor from a free-form "
            "operation brief via the Streamlit Phase 3 tab. Do not hand-edit."
        ),
    }
    path = out_root / "extracted_inputs.json"
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


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
) -> tuple[bool, str, Path | None]:
    """Assemble + render one doc.  Returns (success, status_line, out_path)."""
    template_path = templates_dir / f"{doc_id}.yaml"
    try:
        template = load_template(template_path)
    except (TemplateValidationError, ValidationError) as e:
        return False, f"TEMPLATE-FAIL {doc_id}: {e}", None
    except FileNotFoundError:
        return False, f"TEMPLATE-FAIL {doc_id}: {template_path} not found", None

    try:
        generated = assemble_document(
            template,
            inputs,
            inputs_raw=inputs_raw,
            template_path=template_path,
            cache_dir=cache_dir_for_run(out_root),
            user_prompt_sha256=user_prompt_sha256,
            extractor_model=extractor_model,
            extractor_temperature=extractor_temperature,
        )
    except RetrievedFieldNotImplemented as e:
        return False, f"SKIP {doc_id}: {e}", None
    except (DispatchError, AssemblyError) as e:
        return False, f"DISPATCH-FAIL {doc_id}: {e}", None

    # §18 C21 — honour meta.output_filename so warning_order /
    # staff_brief etc. land on disk with their own filename even when
    # multiple template_ids share a single schema module.
    pattern = (template.meta.output_filename or "").strip()
    slug = template.meta.document_slug
    fname = pattern.replace("{document_slug}", slug) if pattern else f"{slug}.docx"
    out_path = out_root / fname
    try:
        render_to_docx(generated, out_path)
    except Exception as e:
        return False, f"RENDER-FAIL {doc_id}: {type(e).__name__}: {e}", None

    # §C22 — write the verification JSON next to the .docx. Best-effort:
    # never demote an OK render to a failure because of JSON dump trouble.
    try:
        _dump_fields_json(generated, out_path)
    except Exception as e:
        st.warning(f"field-json dump failed for {doc_id}: {e}")

    size = out_path.stat().st_size if out_path.exists() else 0
    return True, f"OK   {doc_id}: {out_path.name} ({size} bytes)", out_path


# ===========================================================================
# TAB RENDERER
# ===========================================================================

def render() -> None:
    st.header("Phase 3 — MDMP Step 1")
    st.caption(
        "Generate the four Step-1 deliverables (Time Analysis, Initial "
        "Planning Guidance, Warning Order, Staff Brief) from **three** "
        "per-doc Arabic operation briefs (§C22).  The Warning Order "
        "has no prompt of its own — its fields are drawn from prompts 1 "
        "and 2.  Full OPORD and full Staff Estimates remain gated off "
        "at the YAML level (§18 C17)."
    )

    col_input, col_controls = st.columns([3, 1], gap="large")

    with col_input:
        st.subheader("Operation briefs (three inputs)")
        prompt_1 = st.text_area(
            "PROMPT 1 — Timing facts (feeds Time Analysis)",
            value=_load_default_prompt(_DEFAULT_PROMPT_1_PATH),
            height=220,
            help=(
                "Reporting time, H-hour, total minutes, time zone, "
                "BMNT / EENT, moon phase."
            ),
            key="p3_prompt_1",
        )
        prompt_2 = st.text_area(
            "PROMPT 2 — Planning context (feeds Initial Planning Guidance + Warning Order)",
            value=_load_default_prompt(_DEFAULT_PROMPT_2_PATH),
            height=260,
            help=(
                "Operation identity, task organization, locations, "
                "references, commander's intent."
            ),
            key="p3_prompt_2",
        )
        prompt_3 = st.text_area(
            "PROMPT 3 — Intel & readiness (feeds Staff Brief)",
            value=_load_default_prompt(_DEFAULT_PROMPT_3_PATH),
            height=240,
            help=(
                "Unit readiness, environment notes, free-form intel "
                "picture (context only — enemy drafting still pulls "
                "from doctrine)."
            ),
            key="p3_prompt_3",
        )

    with col_controls:
        st.subheader("Run settings")

        selected_doc_ids = []
        for doc_id in V1_DOC_IDS:
            if st.checkbox(V1_DOC_LABELS[doc_id], value=True, key=f"p3_{doc_id}"):
                selected_doc_ids.append(doc_id)

        run_id_override = st.text_input(
            "Run id (optional)",
            value="",
            help=(
                "Overrides the extractor's synthesized run_id.  Leave blank "
                "to let the extractor pick one from the brief."
            ),
        ).strip()

        custom_out_dir = st.text_input(
            "Output directory (optional)",
            value="",
            help=(
                "Absolute path or a path under the repo root.  Leave blank "
                "to write under `output/generated/<run_id>/`."
            ),
        ).strip()

        all_prompts_present = all(
            t and t.strip() for t in (prompt_1, prompt_2, prompt_3)
        )
        generate_clicked = st.button(
            "Generate", type="primary", use_container_width=True,
            disabled=not (all_prompts_present and selected_doc_ids),
        )

    if not generate_clicked:
        return

    # -----------------------------------------------------------------------
    # EXTRACT — §C22 three-prompt surface
    # -----------------------------------------------------------------------
    with st.status("Extracting inputs from prompts…", expanded=False) as status:
        try:
            inputs, prompt_text = extract_inputs_from_three(
                prompt_1, prompt_2, prompt_3,
            )
        except ExtractionError as e:
            status.update(label="Extraction failed", state="error")
            st.error(f"Extraction failed: {e}")
            return

        synthesized_id = inputs.output.run_id
        if run_id_override:
            inputs = _override_run_id(inputs, run_id_override)
        elif not synthesized_id or synthesized_id == "unnamed_run":
            inputs = _override_run_id(
                inputs, f"prompt_{prompt_sha256(prompt_text)}"
            )

        if custom_out_dir:
            out_root = Path(custom_out_dir)
            if not out_root.is_absolute():
                out_root = _REPO_ROOT / out_root
        else:
            root_override = inputs.output.output_root_override
            base = Path(root_override) if root_override else _REPO_ROOT / "output" / "generated"
            out_root = base / inputs.output.run_id

        audit_path = _persist_extracted_inputs(inputs, out_root, prompt_text)
        status.update(label="Inputs extracted", state="complete")

    st.success(f"Extracted inputs saved to `{audit_path}`")
    with st.expander("extracted_inputs.json", expanded=False):
        st.json(inputs.model_dump(mode="json"))

    # -----------------------------------------------------------------------
    # GENERATE EACH DOC
    # -----------------------------------------------------------------------
    # Phase 3 config comes through env vars read lazily by the generation
    # layer.  We read the extractor knobs here only to stamp them into each
    # group's cache key (same values scripts/generate_documents.py uses).
    # Route through the shared resolver so a blank PHASE3_EXTRACTOR_MODEL
    # promotes to LLM_MODEL before falling back to the code-side default.
    # This keeps the Streamlit UI's cache key identical to the CLI's when
    # both run against the same LM Studio / OpenAI-compatible endpoint.
    from graph.generation.llm import extractor_config as _extractor_config
    extractor_model, extractor_temperature = _extractor_config()
    inputs_raw = inputs.model_dump(mode="json")
    user_prompt_sha = prompt_sha256(prompt_text)
    templates_dir = _DEFAULT_TEMPLATES_DIR

    progress = st.progress(0.0, text="Starting…")
    results: list[tuple[bool, str, Path | None]] = []
    t_all = time.perf_counter()

    for i, doc_id in enumerate(selected_doc_ids):
        progress.progress(
            i / len(selected_doc_ids),
            text=f"Generating {doc_id}…",
        )
        try:
            results.append(_run_one(
                doc_id,
                templates_dir,
                inputs,
                inputs_raw,
                out_root,
                user_prompt_sha256=user_prompt_sha,
                extractor_model=extractor_model,
                extractor_temperature=extractor_temperature,
            ))
        except Exception as e:
            tb = traceback.format_exc()
            results.append((False, f"UNEXPECTED {doc_id}: {type(e).__name__}: {e}", None))
            st.error(f"Unexpected error generating {doc_id}:\n```\n{tb}\n```")

    progress.progress(1.0, text="Done")
    wall = time.perf_counter() - t_all

    # -----------------------------------------------------------------------
    # REPORT
    # -----------------------------------------------------------------------
    ok_count = sum(1 for r in results if r[0])
    st.caption(
        f"Generated {ok_count}/{len(results)} document(s) in {wall:.1f}s.  "
        f"Run dir: `{out_root}`"
    )

    # Let the user reveal the run dir in Finder.  Streamlit has no "open file
    # manager" primitive, but we echo an absolute path they can click into.
    st.code(str(out_root), language="text")

    for success, status_line, out_path in results:
        if success and out_path is not None:
            with st.container(border=True):
                st.markdown(f"✅ **{out_path.name}** — {out_path.stat().st_size} bytes")
                try:
                    data = out_path.read_bytes()
                except OSError as e:
                    st.error(f"Could not read rendered file: {e}")
                    continue
                cols = st.columns(2)
                with cols[0]:
                    st.download_button(
                        label=f"Download {out_path.name}",
                        data=data,
                        file_name=out_path.name,
                        mime=(
                            "application/vnd.openxmlformats-officedocument."
                            "wordprocessingml.document"
                        ),
                        key=f"dl_{out_path.name}",
                    )
                fields_path = out_path.with_name(out_path.stem + ".fields.json")
                with cols[1]:
                    if fields_path.exists():
                        try:
                            fjson = fields_path.read_text(encoding="utf-8")
                        except OSError as e:
                            st.error(f"Could not read fields JSON: {e}")
                        else:
                            st.download_button(
                                label=f"Download {fields_path.name}",
                                data=fjson.encode("utf-8"),
                                file_name=fields_path.name,
                                mime="application/json",
                                key=f"dl_{fields_path.name}",
                            )
                    else:
                        st.caption("fields.json not written")
                if fields_path.exists():
                    with st.expander(f"Inspect {fields_path.name}", expanded=False):
                        try:
                            st.json(json.loads(fields_path.read_text(encoding="utf-8")))
                        except (OSError, json.JSONDecodeError) as e:
                            st.error(f"Could not parse fields JSON: {e}")
        else:
            st.error(status_line)
