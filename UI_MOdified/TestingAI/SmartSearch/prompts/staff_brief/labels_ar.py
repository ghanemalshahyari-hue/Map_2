"""prompts/staff_brief/labels_ar.py — Arabic labels for the renderer."""

from __future__ import annotations

FIELD_LABELS_AR: dict[tuple[str, str], str] = {
    # environment
    ("StaffBrief", "Terrain"):                                                "الأرض",
    ("StaffBrief", "Weather"):                                                "الطقس",
    ("StaffBrief", "First_light"):                                            "أول ضوء (BMNT)",
    ("StaffBrief", "Last_light"):                                             "آخر ضوء (EENT)",
    ("StaffBrief", "Moon"):                                                   "القمر",
    ("StaffBrief", "Effect_of_Weather_and_Terrain_on_Operations"):            "تأثير الأرض والطقس على العمليات",
    # enemy
    ("StaffBrief", "Composition"):                                            "تشكيل العدو",
    ("StaffBrief", "Deployments"):                                            "انتشار العدو",
    ("StaffBrief", "Force_Coverage"):                                         "تغطية قوات العدو",
    ("StaffBrief", "Morale"):                                                 "معنويات العدو",
    ("StaffBrief", "Training"):                                               "تدريب العدو",
    ("StaffBrief", "Recent_and_Ongoing_Activities"):                          "النشاطات الأخيرة والجارية",
    ("StaffBrief", "Enemy_Tactics_in_Exposure_Operations_Phase1_Preparation"):"تكتيكات العدو — مرحلة التحضير",
    ("StaffBrief", "Enemy_Tactics_in_Exposure_Operations_Phase2_Preparation"):"تكتيكات العدو — مرحلة التشكيل",
    ("StaffBrief", "Enemy_Tactics_in_Exposure_Operations_Phase3_Main_Attack"):"تكتيكات العدو — الهجوم الرئيسي",
    ("StaffBrief", "Intentions_and_Objectives"):                              "نوايا العدو وأهدافه",
    ("StaffBrief", "Counter_Intelligence_Observations"):                      "ملاحظات الاستخبارات المضادة",
    # personnel
    ("StaffBrief", "Force_Cover"):                                            "تغطية القوات الصديقة",
    ("StaffBrief", "Combat_Morale"):                                          "المعنويات القتالية",
    ("StaffBrief", "Reinforcements"):                                         "التعزيزات",
    ("StaffBrief", "Projected_Casualties"):                                   "الخسائر المتوقَّعة",
    ("StaffBrief", "Control_and_Coordination"):                               "التحكم والتنسيق",
    ("StaffBrief", "Prisoners_of_War"):                                       "أسرى الحرب",
    ("StaffBrief", "Civilian_Users"):                                         "المدنيون المستخدمون",
    ("StaffBrief", "Civilian_Prisoners_and_Detainees"):                       "المحتجزون المدنيون",
    ("StaffBrief", "Human_Force_Conclusions"):                                "استنتاجات تقدير الأفراد",
    # logistics
    ("StaffBrief", "Logistical_Rations"):                                     "الإعاشة",
    ("StaffBrief", "Logistical_sustainment"):                                 "الإدامة",
    ("StaffBrief", "Fuel"):                                                   "الوقود",
    ("StaffBrief", "ammunition"):                                             "الذخيرة",
    ("StaffBrief", "Spare_parts"):                                            "قطع الغيار",
    ("StaffBrief", "Engineering_materiel"):                                   "العتاد الهندسي",
    ("StaffBrief", "Transportation"):                                         "النقل",
    ("StaffBrief", "Maintenance"):                                            "الصيانة",
    ("StaffBrief", "Field_Hospitals"):                                        "المستشفيات الميدانية",
    ("StaffBrief", "Supply_Conclusions"):                                     "استنتاجات التقدير اللوجستي",
    # intel conclusions
    ("StaffBrief", "Enemy_Capabilities"):                                     "قدرات العدو",
    ("StaffBrief", "Conclusions"):                                            "الاستنتاجات الاستخباراتية",
    # joint ops
    ("StaffBrief", "join_op_mission"):                                        "مهمة العملية المشتركة",
    ("StaffBrief", "Join_op_purp"):                                           "غاية العملية المشتركة",
    ("StaffBrief", "joint_ops_how"):                                          "نسق العملية المشتركة",
    ("StaffBrief", "joint_ops_desired_end"):                                  "الحالة النهائية للعملية المشتركة",
    # executive command
    ("StaffBrief", "Exc_command_mission"):                                    "مهمة القيادة التنفيذية",
    ("StaffBrief", "Exc_command_purp"):                                       "غاية القيادة التنفيذية",
    ("StaffBrief", "Exc_command_main_mission"):                               "المهمة الرئيسية للقيادة التنفيذية",
    ("StaffBrief", "joint_ops_desired_end2"):                                 "الحالة النهائية للقيادة التنفيذية",
    # own force
    ("StaffBrief", "Land_component_force"):                                   "القوة البرية",
    ("StaffBrief", "Attached_units"):                                         "الوحدات المرتبطة",
    ("StaffBrief", "Force_Composition"):                                      "تشكيل القوة",
    ("StaffBrief", "Training_Readiness_Level"):                               "مستوى الجاهزية التدريبية",
    ("StaffBrief", "Combat_Effectiveness"):                                   "الفاعلية القتالية",
    ("StaffBrief", "Operational_Conclusions"):                                "الاستنتاجات العملياتية",
}
