"""prompts/time_analysis/labels_ar.py — Arabic labels for the renderer.

Keyed by (class_name, field_name) so the template loader's catalog
overlay (``graph/generation/template_loader.py::_apply_catalogs``) can
stamp the label onto each YAML field spec at load time. Catalog wins
over any inline ``label_ar`` in template.yaml.

Edit here to rename any Arabic label — no YAML edits needed.
"""

from __future__ import annotations

FIELD_LABELS_AR: dict[tuple[str, str], str] = {
    ("TimeAnalysis", "time_Y"):                              "يوم (ي)",
    ("TimeAnalysis", "mission_start"):                       "وقت بدء المهمة (H-Hour)",
    ("TimeAnalysis", "total_available_time"):                "الوقت الإجمالي المتاح",
    ("TimeAnalysis", "allocated_planning_time"):             "الوقت المخصَّص للتخطيط",
    ("TimeAnalysis", "available_time_for_subordinate_units"):"الوقت المتاح للوحدات التابعة",
    ("TimeAnalysis", "time_for_mission_receipt"):            "زمن استلام وتحليل المهمة",
    ("TimeAnalysis", "time_for_development"):                "زمن تطوير الأعمال الممكنة",
    ("TimeAnalysis", "time_for_mission_analysis"):           "زمن تحليل ومقارنة الأعمال",
    ("TimeAnalysis", "time_for_plan"):                       "زمن إعداد الخطة والأوامر",
    ("TimeAnalysis", "time_now"):                            "الوقت الحالي",
}
