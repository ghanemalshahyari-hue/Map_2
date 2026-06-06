"""graph/generation/schema/field_catalog.py — editable Arabic-label catalog.

Introduced under §18 C21 (2026-04-23). **Single place** to rename the
Arabic display labels the renderer prints next to each field. ASCII
Python keys on the Pydantic classes are load-bearing (they flow through
retrieval, caching, serialization); only the rendered `label_ar` is
meant to be human-editable.

Lookup key is ``(class_name, field_name)`` → Arabic label string. The
template loader overlays this catalog onto each YAML field at load
time: if the YAML declares an inline ``label_ar`` it wins (back-compat
for existing templates); otherwise this catalog is consulted; if both
are missing, the renderer falls back to the ASCII key.

Editing this file:
  * Rename the string value to change what the renderer prints.
  * Do **not** change the keys — those match ``schemas.py`` field
    names and the loader's parity check will fail if they drift.
  * Acronyms inside parens (CCIR, PIR, FFIR, BMNT, EENT) are the
    only English permitted in user-facing Arabic output — per the
    user directive recorded in memory.md under §C20.

Entries are grouped by schema class, in the same reading order as
``schemas.py`` and ``NewClasses.md`` so drift is easy to spot.
"""

from __future__ import annotations

FIELD_LABELS_AR: dict[tuple[str, str], str] = {
    # ------------------------------------------------------------------
    # HeaderSection — used by warning_order.yaml + operation_order.yaml
    # ------------------------------------------------------------------
    ("HeaderSection", "header"):        "رأس الأمر",
    ("HeaderSection", "organization"):  "القيادة المُصدِرة",
    ("HeaderSection", "department"):    "التشكيل الرئيسي",
    ("HeaderSection", "unit"):          "الوحدة المنفذة",
    ("HeaderSection", "assembly_area"): "موقع مركز العمليات (TOC)",

    # ------------------------------------------------------------------
    # MetadataSection — warning_order + operation_order
    # ------------------------------------------------------------------
    ("MetadataSection", "date_time"):                 "التاريخ والوقت",
    ("MetadataSection", "letter_ref_number"):         "الرقم المرجعي للأمر",
    ("MetadataSection", "warning_order_ref_number"):  "رقم الأمر الإنذاري",
    ("MetadataSection", "references"):                "المراجع",
    ("MetadataSection", "maps"):                      "الخرائط",
    ("MetadataSection", "task_organization"):         "التنظيم للمهمة",
    ("MetadataSection", "time_zone"):                 "المنطقة الزمنية",

    # ------------------------------------------------------------------
    # OperationalSituation — warning_order + operation_order
    # ------------------------------------------------------------------
    ("OperationalSituation", "situation_summary"):    "ملخص الموقف",
    ("OperationalSituation", "area_of_interest"):     "منطقة الاهتمام",
    ("OperationalSituation", "area_of_operations"):   "منطقة العمليات",
    ("OperationalSituation", "terrain"):              "طبيعة الأرض",
    ("OperationalSituation", "weather"):              "الطقس",
    ("OperationalSituation", "civil_considerations"): "الاعتبارات المدنية",
    ("OperationalSituation", "enemy_profile"):        "تشكيل العدو",

    # ------------------------------------------------------------------
    # MissionAndExecution — warning_order + operation_order
    # ------------------------------------------------------------------
    ("MissionAndExecution", "task_units"):              "الوحدات المكلفة",
    ("MissionAndExecution", "mission"):                 "المهمة",
    ("MissionAndExecution", "objective"):               "الغرض",
    ("MissionAndExecution", "method"):                  "الطريقة",
    ("MissionAndExecution", "desired_end_state"):       "النهاية المرغوبة",
    ("MissionAndExecution", "higher_unit_mission"):     "مهمة القيادة الأعلى",
    ("MissionAndExecution", "civil_military_operations"):  "العمليات المدنية العسكرية",
    ("MissionAndExecution", "interagency_coordination"):   "التنسيق بين الأجهزة",
    ("MissionAndExecution", "host_nation_coordination"):   "التنسيق مع الدولة المضيفة",
    ("MissionAndExecution", "ngo_io_coordination"):        "التنسيق مع المنظمات غير الحكومية والدولية",
    ("MissionAndExecution", "attached_detached_units"):    "الوحدات المُلحقة والمُنفصلة",
    ("MissionAndExecution", "planning_assumptions"):       "افتراضات التخطيط",
    ("MissionAndExecution", "ground_component_mission"):   "مهمة المكون الأرضي",
    ("MissionAndExecution", "execution_purpose"):          "غرض التنفيذ",
    ("MissionAndExecution", "concept_of_operations"):      "مفهوم العمليات",
    ("MissionAndExecution", "subordinate_unit_tasks"):     "مهام الوحدات الفرعية",
    ("MissionAndExecution", "combat_support_tasks"):       "مهام الإسناد القتالي",
    ("MissionAndExecution", "execution_timeline"):         "الجدول الزمني للتنفيذ",
    ("MissionAndExecution", "commanders_critical_information_requirements"):
        "متطلبات المعلومات الحرجة للقائد (CCIR)",

    # ------------------------------------------------------------------
    # SustainmentAndCoordination — operation_order only (v2)
    # ------------------------------------------------------------------
    ("SustainmentAndCoordination", "fire_support_coordination"):        "تنسيق الإسناد الناري",
    ("SustainmentAndCoordination", "air_support_coordination"):         "تنسيق الإسناد الجوي",
    ("SustainmentAndCoordination", "risk_assessment"):                  "تقييم المخاطر",
    ("SustainmentAndCoordination", "rules_of_engagement"):              "قواعد الاشتباك",
    ("SustainmentAndCoordination", "media_and_information_operations"): "العمليات الإعلامية والمعلوماتية",
    ("SustainmentAndCoordination", "coordination_meetings"):            "اجتماعات التنسيق",
    ("SustainmentAndCoordination", "execution_priorities"):             "أولويات التنفيذ",
    ("SustainmentAndCoordination", "movement_order"):                   "أمر التحرك",
    ("SustainmentAndCoordination", "sustainment_paragraph"):            "فقرة الإسناد",
    ("SustainmentAndCoordination", "command_and_signal"):               "القيادة والإشارة",

    # ------------------------------------------------------------------
    # Annexes — warning_order + operation_order
    # ------------------------------------------------------------------
    ("Annexes", "appendices"): "الملاحق",
    ("Annexes", "overlays"):   "الشفافيات",

    # ------------------------------------------------------------------
    # INTELLIGENCE_ESTIMATE — staff_brief + staff_estimate
    # ------------------------------------------------------------------
    ("INTELLIGENCE_ESTIMATE", "terrain"):                           "تحليل الأرض (OAKOC)",
    ("INTELLIGENCE_ESTIMATE", "weather"):                           "أثر الطقس على العمليات",
    ("INTELLIGENCE_ESTIMATE", "first_light"):                       "أول ضوء (BMNT)",
    ("INTELLIGENCE_ESTIMATE", "last_light"):                        "آخر ضوء (EENT)",
    ("INTELLIGENCE_ESTIMATE", "moon_phase"):                        "طور القمر والإضاءة",
    ("INTELLIGENCE_ESTIMATE", "effect_of_environment_on_operations"): "أثر البيئة على العمليات",
    ("INTELLIGENCE_ESTIMATE", "enemy_composition"):                 "تشكيل العدو",
    ("INTELLIGENCE_ESTIMATE", "enemy_disposition"):                 "توزيع العدو",
    ("INTELLIGENCE_ESTIMATE", "enemy_strength"):                    "قوة العدو",
    ("INTELLIGENCE_ESTIMATE", "enemy_readiness"):                   "جاهزية العدو",
    ("INTELLIGENCE_ESTIMATE", "enemy_training"):                    "تدريب العدو",
    ("INTELLIGENCE_ESTIMATE", "recent_and_ongoing_activities"):     "النشاطات الأخيرة والجارية",
    ("INTELLIGENCE_ESTIMATE", "enemy_tactics_phase1_preparation"):  "تكتيكات العدو — مرحلة التحضير",
    ("INTELLIGENCE_ESTIMATE", "enemy_tactics_phase2_shaping"):      "تكتيكات العدو — مرحلة التشكيل",
    ("INTELLIGENCE_ESTIMATE", "enemy_tactics_phase3_decisive"):     "تكتيكات العدو — المرحلة الحاسمة",
    ("INTELLIGENCE_ESTIMATE", "enemy_most_likely_coa"):             "أكثر مسارات عمل العدو احتمالاً",
    ("INTELLIGENCE_ESTIMATE", "counter_intel_observations"):        "ملاحظات الاستخبارات المضادة",

    # ------------------------------------------------------------------
    # OPERATIONS_ESTIMATE — staff_brief + staff_estimate
    # ------------------------------------------------------------------
    ("OPERATIONS_ESTIMATE", "higher_unit_mission"):       "مهمة القيادة الأعلى",
    ("OPERATIONS_ESTIMATE", "higher_unit_purpose"):       "غرض القيادة الأعلى",
    ("OPERATIONS_ESTIMATE", "higher_unit_method"):        "طريقة القيادة الأعلى",
    ("OPERATIONS_ESTIMATE", "higher_unit_end_state"):     "النهاية المرغوبة للقيادة الأعلى",
    ("OPERATIONS_ESTIMATE", "own_unit_mission"):          "مهمة الوحدة",
    ("OPERATIONS_ESTIMATE", "own_unit_purpose"):          "غرض الوحدة",
    ("OPERATIONS_ESTIMATE", "main_effort_tasks"):         "مهام الجهد الرئيسي",
    ("OPERATIONS_ESTIMATE", "own_unit_end_state"):        "النهاية المرغوبة للوحدة",
    ("OPERATIONS_ESTIMATE", "ground_component_force"):    "قوة المكون الأرضي",
    ("OPERATIONS_ESTIMATE", "attached_supporting_units"): "الوحدات المُلحقة والمُسانِدة",
    ("OPERATIONS_ESTIMATE", "force_composition"):         "تشكيل القوة",
    ("OPERATIONS_ESTIMATE", "training_readiness_level"):  "مستوى التدريب والجاهزية",
    ("OPERATIONS_ESTIMATE", "combat_effectiveness"):      "الفاعلية القتالية",
    ("OPERATIONS_ESTIMATE", "operations_conclusions"):    "استنتاجات العمليات",

    # ------------------------------------------------------------------
    # PERSONNEL_ESTIMATE — staff_brief + staff_estimate
    # ------------------------------------------------------------------
    ("PERSONNEL_ESTIMATE", "force_coverage"):           "تغطية القوات",
    ("PERSONNEL_ESTIMATE", "morale"):                   "المعنويات",
    ("PERSONNEL_ESTIMATE", "reinforcements"):           "التعزيزات",
    ("PERSONNEL_ESTIMATE", "projected_casualties"):     "الإصابات المتوقعة",
    ("PERSONNEL_ESTIMATE", "control_and_coordination"): "السيطرة والتنسيق",
    ("PERSONNEL_ESTIMATE", "pows_detainees"):           "أسرى الحرب والمحتجزون",
    ("PERSONNEL_ESTIMATE", "civilian_refugees"):        "المدنيون النازحون",
    ("PERSONNEL_ESTIMATE", "civilian_detainees"):       "المحتجزون المدنيون",
    ("PERSONNEL_ESTIMATE", "personnel_conclusions"):    "استنتاجات الموارد البشرية",

    # ------------------------------------------------------------------
    # LOGISTICS_ESTIMATE — staff_brief + staff_estimate
    # ------------------------------------------------------------------
    ("LOGISTICS_ESTIMATE", "subsistence_class_i"):             "الإعاشة (الفئة الأولى)",
    ("LOGISTICS_ESTIMATE", "general_sustainment"):             "الإسناد اللوجستي العام",
    ("LOGISTICS_ESTIMATE", "pol_class_iii"):                   "المحروقات والزيوت (الفئة الثالثة)",
    ("LOGISTICS_ESTIMATE", "ammunition_class_v"):              "الذخائر (الفئة الخامسة)",
    ("LOGISTICS_ESTIMATE", "repair_parts_class_ix"):           "قطع الغيار (الفئة التاسعة)",
    ("LOGISTICS_ESTIMATE", "equipment_and_engineer_materiel"): "المعدات والتجهيزات الهندسية",
    ("LOGISTICS_ESTIMATE", "transportation"):                  "النقل",
    ("LOGISTICS_ESTIMATE", "maintenance"):                     "الصيانة",
    ("LOGISTICS_ESTIMATE", "medical_support_class_viii"):      "الإسناد الطبي (الفئة الثامنة)",
    ("LOGISTICS_ESTIMATE", "logistics_conclusions"):           "استنتاجات الإسناد اللوجستي",

    # ------------------------------------------------------------------
    # MISSION_TIMELINE — time_analysis
    # ------------------------------------------------------------------
    ("MISSION_TIMELINE", "current_date"):                        "التاريخ الحالي (ميلادي / هجري)",
    ("MISSION_TIMELINE", "mission_start_time"):                  "وقت بدء المهمة (T₀ / H-Hour)",
    ("MISSION_TIMELINE", "total_available_time"):                "إجمالي الوقت المتاح قبل بدء المهمة",
    ("MISSION_TIMELINE", "allocated_planning_time"):             "الوقت المخصص للتخطيط (الإجمالي ÷ 3)",
    ("MISSION_TIMELINE", "available_time_for_subordinate_units"): "الوقت المتاح للوحدات الفرعية (الإجمالي × 2/3)",
    ("MISSION_TIMELINE", "time_for_mission_receipt_analysis"):   "استلام المهمة وتحليلها (30%)",
    ("MISSION_TIMELINE", "time_for_coa_development"):            "تطوير مسار العمل (20%)",
    ("MISSION_TIMELINE", "time_for_coa_analysis_comparison"):    "تحليل ومقارنة مسارات العمل (30%)",
    ("MISSION_TIMELINE", "time_for_plan_order_production"):      "إعداد الخطة والأمر (20%)",

    # ------------------------------------------------------------------
    # CURRENT_TIME_REFERENCE — time_analysis
    # ------------------------------------------------------------------
    ("CURRENT_TIME_REFERENCE", "time_now"): "الوقت الحالي",

    # ------------------------------------------------------------------
    # INITIAL_PLAN_TIMELINE — initial_planning_guidance
    # ------------------------------------------------------------------
    ("INITIAL_PLAN_TIMELINE", "current_date"):                        "التاريخ الحالي (ميلادي / هجري)",
    ("INITIAL_PLAN_TIMELINE", "mission_start_time"):                  "وقت بدء المهمة (T₀)",
    ("INITIAL_PLAN_TIMELINE", "total_available_time"):                "إجمالي الوقت المتاح قبل بدء المهمة",
    ("INITIAL_PLAN_TIMELINE", "allocated_planning_time"):             "الوقت المخصص للتخطيط (الإجمالي ÷ 3)",
    ("INITIAL_PLAN_TIMELINE", "available_time_for_subordinate_units"): "الوقت المتاح للوحدات الفرعية (الإجمالي × 2/3)",
    ("INITIAL_PLAN_TIMELINE", "time_for_mission_receipt_analysis"):   "استلام المهمة وتحليلها (30%)",
    ("INITIAL_PLAN_TIMELINE", "time_for_coa_development"):            "تطوير مسار العمل (20%)",
    ("INITIAL_PLAN_TIMELINE", "time_for_coa_analysis_comparison"):    "تحليل ومقارنة مسارات العمل (30%)",
    ("INITIAL_PLAN_TIMELINE", "time_for_plan_order_production"):      "إعداد الخطة والأمر (20%)",

    # ------------------------------------------------------------------
    # CURRENT_TIME_REFERENCE_2 — initial_planning_guidance
    # ------------------------------------------------------------------
    ("CURRENT_TIME_REFERENCE_2", "time_now"): "الوقت الحالي",

    # ------------------------------------------------------------------
    # PLANNING_DIRECTIVES — initial_planning_guidance
    # ------------------------------------------------------------------
    ("PLANNING_DIRECTIVES", "report_production"):                           "إصدار التقارير ونشرها",
    ("PLANNING_DIRECTIVES", "coordination_duties"):                         "واجبات التنسيق",
    ("PLANNING_DIRECTIVES", "authorized_movements"):                        "التحركات المأذون بها",
    ("PLANNING_DIRECTIVES", "staff_duties"):                                "واجبات هيئة الركن",
    ("PLANNING_DIRECTIVES", "collaborative_planning_times_locations"):      "أوقات ومواقع التخطيط المشترك",
    ("PLANNING_DIRECTIVES", "commanders_critical_information_requirements"): "متطلبات المعلومات الحرجة للقائد (CCIR)",
    ("PLANNING_DIRECTIVES", "additional_information"):                      "معلومات إضافية",

    # ------------------------------------------------------------------
    # OPERATIONAL_SAFETY_STANDARDS — initial_planning_guidance
    # ------------------------------------------------------------------
    ("OPERATIONAL_SAFETY_STANDARDS", "force_protection_protocols"): "بروتوكولات حماية القوة",
}


def label_ar_for(class_name: str, field_name: str) -> str | None:
    """Return the Arabic label for one field, or ``None`` if unlisted."""
    return FIELD_LABELS_AR.get((class_name, field_name))
