"""graph/generation/prompts_ar.py — Arabic drafting-prompt catalog.

Introduced under §18 C21 (2026-04-23). **Single place** to edit the
Arabic drafting instructions for every retrieved group across the four
Phase 3 documents.

Key shape: ``(template_id, class_name, field_name) → Arabic prompt``.
The template loader resolves a missing ``prompt_ar`` in a YAML
RetrievedField from this catalog at load time. Inline YAML
``prompt_ar`` still wins when present (back-compat).

Editing rules:

* Keep the "citation-verbatim" clause in every prompt — the generation
  layer pre-resolves each locator tag (§18 C12), so the drafter must
  copy them verbatim from the retrieved chunks, never invent them.
* Keep the "غير متوفر في العقيدة المتاحة" fallback clause — the
  renderer reads it verbatim and users read it as the trustworthy
  no-coverage signal.
* Acronyms in parens (CCIR, PIR, FFIR, BMNT, EENT) are the only
  English tokens allowed in user-facing output — matches §C20.
* Do not name specific manuals (FM 6-0, FM 5-0, …) in the prompt
  text. Doctrine allowlists live in the YAML's per-field
  ``filters.source_doc`` so the prompt file stays corpus-agnostic
  (mirrors the §C20 rule for ``data/phase3_prompt.example.txt``).

The time-based documents (``time_analysis``) have no retrieved groups
and therefore no entries here.
"""

from __future__ import annotations

_PromptKey = tuple[str, str, str]


# Shared fragments kept as module-level constants so every prompt stays
# consistent on the citation + fallback rules. Concatenated into each
# prompt body below.
_CITE_CLAUSE = (
    "استشهد بعد كل جملة أساسية بالوسم الموجود بجانب المقطع المصدر "
    "حرفياً — لا تُعدِّل الوسم ولا تخترع واحداً."
)
_FALLBACK_CLAUSE = (
    "إذا لم تدعم المقاطع الحقل، اكتب \"غير متوفر في العقيدة المتاحة\"."
)


PROMPTS_AR: dict[_PromptKey, str] = {
    # ========================================================================
    # DOCUMENT: initial_planning_guidance (WARNO planning directives)
    # Groups: PLANNING_DIRECTIVES (6 retrieved fields, 1 input field),
    #         OPERATIONAL_SAFETY_STANDARDS (1 retrieved field).
    # ========================================================================
    ("initial_planning_guidance", "PLANNING_DIRECTIVES", "report_production"): (
        "اذكر إجراءات إصدار التقارير ونشرها خلال مرحلة التخطيط الأولي "
        "اعتماداً على العقيدة المعطاة في المقاطع. "
        f"{_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("initial_planning_guidance", "PLANNING_DIRECTIVES", "coordination_duties"): (
        "حدِّد واجبات التنسيق بين عناصر هيئة الركن خلال التخطيط الأولي "
        "بناءً على المقاطع المعطاة. "
        f"{_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("initial_planning_guidance", "PLANNING_DIRECTIVES", "authorized_movements"): (
        "اذكر التحركات المأذون بها خلال مرحلة التخطيط الأولي بناءً على "
        f"المقاطع. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("initial_planning_guidance", "PLANNING_DIRECTIVES", "staff_duties"): (
        "وضِّح واجبات هيئة الركن خلال مرحلة التخطيط الأولي بناءً على "
        f"المقاطع المعطاة. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("initial_planning_guidance", "PLANNING_DIRECTIVES",
     "collaborative_planning_times_locations"): (
        "حدِّد أوقات ومواقع جلسات التخطيط المشترك بين العناصر. اعتمد "
        f"على المقاطع المعطاة. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("initial_planning_guidance", "PLANNING_DIRECTIVES",
     "commanders_critical_information_requirements"): (
        "اذكر متطلبات المعلومات الحرجة للقائد (CCIR) مقسَّمة إلى متطلبات "
        "الاستخبارات ذات الأولوية (PIR) ومتطلبات المعلومات الصديقة "
        f"(FFIR). اعتمد على المقاطع فقط. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("initial_planning_guidance", "OPERATIONAL_SAFETY_STANDARDS",
     "force_protection_protocols"): (
        "اكتب بروتوكولات حماية القوة وتوجيهات إدارة المخاطر على مستوى "
        "التخطيط الأولي استناداً إلى المقاطع المعطاة. اذكر القيود "
        f"التشغيلية ذات الأثر المباشر على التخطيط. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),

    # ========================================================================
    # DOCUMENT: staff_brief (Step-1 running-estimate brief)
    # Groups: INTELLIGENCE_ESTIMATE (select fields only),
    #         OPERATIONS_ESTIMATE  (select fields only).
    # Fields not knowable at Step 1 (LOGISTICS casualties, class-I/III/V
    # specifics, etc.) are marked `static: "يُصدر لاحقاً"` in the YAML and
    # therefore have no prompt here.
    # ========================================================================
    ("staff_brief", "INTELLIGENCE_ESTIMATE", "enemy_composition"): (
        "صِف تشكيل قوات العدو (Composition) — الوحدات، الأسلحة الرئيسة، "
        "والتنظيم — استناداً إلى المقاطع المعطاة من معلومات الاستخبارات "
        f"والعقيدة. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "INTELLIGENCE_ESTIMATE", "enemy_disposition"): (
        "صِف توزيع قوات العدو جغرافياً (Disposition) — مواقع الوحدات "
        f"ومحاور انتشارها. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "INTELLIGENCE_ESTIMATE", "enemy_strength"): (
        "صِف قوة العدو (Strength) كمّياً ونوعياً استناداً إلى المقاطع. "
        f"{_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "INTELLIGENCE_ESTIMATE", "recent_and_ongoing_activities"): (
        "لخِّص النشاطات الأخيرة والجارية للعدو ذات الأثر على التخطيط. "
        f"{_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "INTELLIGENCE_ESTIMATE", "enemy_most_likely_coa"): (
        "اذكر أكثر مسارات عمل العدو احتمالاً (Most Likely COA) بناءً على "
        f"التحليل الاستخباراتي في المقاطع. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "INTELLIGENCE_ESTIMATE", "counter_intel_observations"): (
        "اذكر أبرز ملاحظات الاستخبارات المضادة وقدرات العدو في هذا "
        f"المجال. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "OPERATIONS_ESTIMATE", "main_effort_tasks"): (
        "حدِّد مهام الجهد الرئيسي للوحدة في إطار الخطة الأولية، مع إبراز "
        "العلاقة بين كل مهمة وغرض المهمة. اعتمد على المقاطع. "
        f"{_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "OPERATIONS_ESTIMATE", "combat_effectiveness"): (
        "قدِّر الفاعلية القتالية للوحدة وأهم العوامل المؤثرة فيها على "
        f"مستوى التخطيط الأولي. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),
    ("staff_brief", "OPERATIONS_ESTIMATE", "operations_conclusions"): (
        "لخِّص استنتاجات العمليات الرئيسة لمرحلة التخطيط الأولي — ما الذي "
        "يجب أن يعرفه القائد قبل اتخاذ قرار حول مسار العمل؟ اعتمد على "
        f"المقاطع المعطاة. {_CITE_CLAUSE} {_FALLBACK_CLAUSE}"
    ),

    # ========================================================================
    # DOCUMENT: warning_order
    # Mapped-only — no retrieved fields, no prompts. Kept here as a
    # comment anchor so future warning_order retrieves land in the right
    # block.
    # ========================================================================

    # ========================================================================
    # DOCUMENT: time_analysis
    # All computed — no prompts by design.
    # ========================================================================
}


def prompt_ar_for(
    template_id: str, class_name: str, field_name: str
) -> str | None:
    """Return the Arabic drafting prompt for one field, or ``None`` if absent."""
    return PROMPTS_AR.get((template_id, class_name, field_name))
