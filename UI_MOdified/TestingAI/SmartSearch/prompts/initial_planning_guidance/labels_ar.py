"""prompts/initial_planning_guidance/labels_ar.py — Arabic labels.

Keyed by ``(class_name, field_name)`` — see ``prompts/time_analysis/labels_ar.py``
for the overlay mechanic.
"""

from __future__ import annotations

FIELD_LABELS_AR: dict[tuple[str, str], str] = {
    # timing
    ("InitialPlanningGuidance", "time_Y"):                              "يوم (ي)",
    ("InitialPlanningGuidance", "mission_start"):                       "وقت بدء المهمة (H-Hour)",
    ("InitialPlanningGuidance", "total_available_time"):                "الوقت الإجمالي المتاح",
    ("InitialPlanningGuidance", "allocated_planning_time"):             "الوقت المخصَّص للتخطيط",
    ("InitialPlanningGuidance", "available_time_for_subordinate_units"):"الوقت المتاح للوحدات التابعة",
    ("InitialPlanningGuidance", "time_for_mission_receipt"):            "زمن استلام وتحليل المهمة",
    ("InitialPlanningGuidance", "time_for_development"):                "زمن تطوير الأعمال الممكنة",
    ("InitialPlanningGuidance", "time_for_mission_analysis"):           "زمن تحليل ومقارنة الأعمال",
    ("InitialPlanningGuidance", "time_for_plan"):                       "زمن إعداد الخطة والأوامر",
    ("InitialPlanningGuidance", "time_now"):                            "الوقت الحالي",
    # planning directives
    ("InitialPlanningGuidance", "report_production"):                   "إنتاج التقارير",
    ("InitialPlanningGuidance", "coordination_duties"):                 "واجبات التنسيق",
    ("InitialPlanningGuidance", "authorized_movements"):                "الحركات المأذون بها",
    ("InitialPlanningGuidance", "staff_duties"):                        "واجبات الأركان",
    ("InitialPlanningGuidance", "times_locations_planning"):            "أوقات ومواقع التخطيط",
    ("InitialPlanningGuidance", "commander_intel_req"):                 "متطلبات القائد الحرجة (CCIR/PIR)",
    ("InitialPlanningGuidance", "commander_intel_req2"):                "متطلبات القوات الصديقة (FFIR)",
    ("InitialPlanningGuidance", "ROE"):                                 "قواعد الاشتباك (ROE)",
}
