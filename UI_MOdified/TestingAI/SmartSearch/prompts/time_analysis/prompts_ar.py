"""prompts/time_analysis/prompts_ar.py — Arabic per-field instructions.

Two catalogs keyed by ``(class_name, field_name)``:

- ``EXTRACTION_PROMPTS_AR`` — per-field instruction sent to the
  source-file extractor LLM for fields tagged ``kind: source_file_extracted``.
  The extractor's system prompt (``prompts/_universal_instructions_ar.py``)
  already sets role + discipline; each entry here tells the LLM exactly
  what value to pull for THIS field.

- ``DRAFTING_PROMPTS_AR`` — per-field instruction sent to the doctrine
  drafter for fields tagged ``kind: doctrine_retrieved``.

Catalogs win over any inline ``prompt_ar`` in template.yaml (catalog
overlay in ``graph/generation/template_loader.py::_apply_catalogs``).

For ``time_analysis`` only ``time_now`` is extracted; everything else is
``computed`` via ``time_math.*``. No doctrine retrieval in this doc.
"""

from __future__ import annotations


EXTRACTION_PROMPTS_AR: dict[tuple[str, str], str] = {
    ("TimeAnalysis", "time_now"): (
        "استخرج الوقت الحالي (زمن الإبلاغ) من ملف الأمر الإنذاري، ويُعرَف عادةً "
        "بزمن \"الإبلاغ\" أو \"نسخت عند\" أو زمن صدور الأمر. أعِد القيمة بصيغة "
        "عربية موجزة تحتوي الساعة واليوم والتاريخ إن أمكن. إن لم يكن الوقت "
        "واضحاً في الملف، أعد القيمة الحرفية \"غير موجود في الملفات\"."
    ),
}


DRAFTING_PROMPTS_AR: dict[tuple[str, str], str] = {
    # time_analysis contains no doctrine_retrieved fields.
}
