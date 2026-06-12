"""prompts/ — per-document editable surface.

Each v1 document owns one subfolder under ``prompts/``:

    prompts/
        time_analysis/              — تحليل الوقت
        initial_planning_guidance/  — دليل التخطيط الأولي
        staff_brief/                — إيجاز هيئة الركن

Every subfolder contains exactly four files::

    schema.py      — one flat Pydantic class with the Y-folder keys
    template.yaml  — YAML template with field-kind annotations
    labels_ar.py   — {field_name: Arabic label} for the renderer
    prompts_ar.py  — {field_name: Arabic drafting / extraction prompt}

Legacy schemas, YAMLs and catalogs under ``graph/generation/schema/``,
``graph/generation/prompts_ar.py``, ``graph/generation/schema/field_catalog.py``
and ``templates/*.yaml`` remain untouched — the new per-doc layout is
additive so Warning Order + the v2-deferred OPORD/Staff-Estimate paths
continue to work unchanged until the user provides Y-approved schemas
for them.
"""
