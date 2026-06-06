"""prompts/warning_order/labels_ar.py — Arabic labels for the renderer.

Keyed by ``(class_name, field_name)`` — see
``prompts/time_analysis/labels_ar.py`` for the overlay mechanic.
"""

from __future__ import annotations

FIELD_LABELS_AR: dict[tuple[str, str], str] = {
    # higher-command mission & intent
    ("WarningOrder", "friendly_forces"):                "القوات الصديقة",
    ("WarningOrder", "join_op_mission"):                "مهمة العملية المشتركة",
    ("WarningOrder", "join_op_purp"):                   "غاية العملية المشتركة",
    ("WarningOrder", "joint_ops_how"):                  "نسق تنفيذ العملية المشتركة",
    ("WarningOrder", "joint_ops_desired_end"):          "الحالة النهائية المرغوبة",
    ("WarningOrder", "mission_of_supporting_unit"):     "مهمة الوحدات المساندة",
    # civilian / external coordination
    ("WarningOrder", "CIVILIAN_CONSIDERATIONS"):        "الاعتبارات المدنية",
    ("WarningOrder", "gov_and_nongov_org"):             "المنظمات الحكومية وغير الحكومية",
    ("WarningOrder", "local_authorities"):              "السلطات المحلية",
    ("WarningOrder", "red_crescent"):                   "الهلال الأحمر",
    # task organization / assumptions
    ("WarningOrder", "Attached_and_Detached_units"):    "الوحدات المرتبطة والمنفصلة",
    ("WarningOrder", "Operational_Assumptions"):        "الافتراضات العملياتية",
    # ground component mission & execution
    ("WarningOrder", "GROUND_COMPONENT_MISSION"):       "مهمة المكون البري",
    ("WarningOrder", "Exc_command_purp"):               "غاية القيادة التنفيذية",
    ("WarningOrder", "Concept_of_operations"):          "مفهوم العمليات",
    ("WarningOrder", "Units_Duty"):                     "واجبات الوحدات",
    ("WarningOrder", "Duties_of_Other_Combat_Units_and_Combat_Support_Units"):
                                                        "واجبات وحدات القتال والإسناد الأخرى",
    ("WarningOrder", "Timings"):                        "التوقيتات",
    ("WarningOrder", "Commanders_Crtitical_Information_Requirements"):
                                                        "متطلبات القائد الحرجة من المعلومات (CCIR)",
    # document headers
    ("WarningOrder", "header"):                         "الترويسة الرئيسية",
    ("WarningOrder", "header2"):                        "الترويسة الثانية — القوة المشتركة",
    ("WarningOrder", "header3"):                        "الترويسة الثالثة — قيادة المكون البري",
    ("WarningOrder", "header4"):                        "الترويسة الرابعة — شعبة الأركان",
    # admin metadata
    ("WarningOrder", "Assembly_Area"):                  "منطقة التجمع",
    ("WarningOrder", "date_time"):                      "التاريخ والوقت",
    ("WarningOrder", "letter_ref_number"):              "رقم المرجع",
    ("WarningOrder", "letter_ref_number2"):             "رقم المرجع الثانوي",
    ("WarningOrder", "References"):                     "المراجع",
    ("WarningOrder", "Maps"):                           "الخرائط",
    ("WarningOrder", "task_assembly"):                  "تجميع المهام",
    ("WarningOrder", "time_zone"):                      "المنطقة الزمنية",
    ("WarningOrder", "Appendices"):                     "الملاحق",
    ("WarningOrder", "Viewports"):                      "المنظورات العملياتية",
    # situation / environment
    ("WarningOrder", "situation"):                      "الموقف العام",
    ("WarningOrder", "area_interest"):                  "منطقة الاهتمام",
    ("WarningOrder", "operations_area"):                "منطقة العمليات",
    ("WarningOrder", "terrain"):                        "الأرض",
    ("WarningOrder", "weather"):                        "الطقس",
    ("WarningOrder", "civil_considerations"):           "الاعتبارات المدنية في منطقة العمليات",
    ("WarningOrder", "enemy_forces"):                   "قوات العدو",
    # coordination instructions
    ("WarningOrder", "Fire_support_coordination"):      "تنسيق الإسناد الناري",
    ("WarningOrder", "Air_support_coordination"):       "تنسيق الإسناد الجوي",
    ("WarningOrder", "Risk_assy"):                      "تقدير المخاطر",
    ("WarningOrder", "ROE"):                            "قواعد الاشتباك (ROE)",
    ("WarningOrder", "Other_coordination_media"):       "تنسيق الإعلام والمعلومات العامة",
    ("WarningOrder", "Other_coordination_meeting"):     "اجتماعات التنسيق",
    ("WarningOrder", "Other_coordination_Excu"):        "تعليمات التنفيذ الفورية",
    ("WarningOrder", "Other_coordination_movm"):        "تنسيق الحركة",
    # sustainment / command & control
    ("WarningOrder", "Sustainment"):                    "الإدامة",
    ("WarningOrder", "ACCS"):                           "منظومة التحكم والسيطرة الجوية (ACCS)",
}
