"""prompts/staff_brief/schema.py — flat Pydantic schema for Staff Brief.

53 str fields — exact keys from
``/Users/hextechkraken/Desktop/y/staff_brief_edited.txt``. Field-level
descriptions summarise what each cell holds so ``with_structured_output``
surfaces usable guidance to the LLM even without reading the YAML
instructions.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class StaffBrief(BaseModel):
    """Y-approved flat shape for ``staff_brief`` output (53 fields)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # --- environment (Intel Report) ---
    Terrain: str = Field(description="وصف الأرض في منطقة العمليات من تقرير الاستخبارات.")
    Weather: str = Field(description="حالة الطقس المتوقعة خلال العملية من تقرير الاستخبارات.")
    First_light: str = Field(description="وقت أول ضوء (BMNT).")
    Last_light: str = Field(description="وقت آخر ضوء (EENT).")
    Moon: str = Field(description="طور القمر خلال نافذة العملية.")
    Effect_of_Weather_and_Terrain_on_Operations: str = Field(
        description="تأثير الأرض والطقس على العمليات (تنقُّل، إخفاء، رماية، رؤية، إمداد)."
    )

    # --- enemy situation (Intel Report) ---
    Composition: str = Field(description="تشكيل العدو وقواته الرئيسية.")
    Deployments: str = Field(description="انتشار العدو ومواقعه الرئيسية.")
    Force_Coverage: str = Field(description="تغطية العدو للمحاور والعمق.")
    Morale: str = Field(description="معنويات قوات العدو.")
    Training: str = Field(description="مستوى تدريب قوات العدو.")
    Recent_and_Ongoing_Activities: str = Field(description="النشاطات الأخيرة والجارية للعدو.")
    Enemy_Tactics_in_Exposure_Operations_Phase1_Preparation: str = Field(
        description="تكتيكات العدو المتوقعة في مرحلة التحضير."
    )
    Enemy_Tactics_in_Exposure_Operations_Phase2_Preparation: str = Field(
        description="تكتيكات العدو المتوقعة في مرحلة التشكيل / التمهيد."
    )
    Enemy_Tactics_in_Exposure_Operations_Phase3_Main_Attack: str = Field(
        description="تكتيكات العدو المتوقعة في مرحلة الهجوم الرئيسي."
    )
    Intentions_and_Objectives: str = Field(description="نوايا العدو وأهدافه المحتملة.")
    Counter_Intelligence_Observations: str = Field(
        description="ملاحظات الاستخبارات المضادة وقدرات العدو على الاستطلاع."
    )

    # --- personnel / human forces ---
    Force_Cover: str = Field(description="وضع تغطية القوات الصديقة وتمركزها.")
    Combat_Morale: str = Field(description="معنويات القوات الصديقة القتالية.")
    Reinforcements: str = Field(description="التعزيزات المخصَّصة أو المطلوبة.")
    Projected_Casualties: str = Field(description="تقديرات الخسائر المتوقَّعة.")
    Control_and_Coordination: str = Field(description="التحكم والتنسيق بين الوحدات.")
    Prisoners_of_War: str = Field(description="إجراءات التعامل مع أسرى الحرب.")
    Civilian_Users: str = Field(description="المدنيون في منطقة العمليات (مستخدمو المرافق).")
    Civilian_Prisoners_and_Detainees: str = Field(
        description="المحتجزون والمعتقلون المدنيون."
    )
    Human_Force_Conclusions: str = Field(description="استنتاجات تقدير الأفراد.")

    # --- logistics ---
    Logistical_Rations: str = Field(description="الإعاشة (الفئة الأولى).")
    Logistical_sustainment: str = Field(description="الإدامة العامة.")
    Fuel: str = Field(description="الوقود (الفئة الثالثة).")
    ammunition: str = Field(description="الذخيرة (الفئة الخامسة).")
    Spare_parts: str = Field(description="قطع الغيار (الفئة التاسعة).")
    Engineering_materiel: str = Field(description="العتاد الهندسي والمواد.")
    Transportation: str = Field(description="النقل وطواقم الحركة.")
    Maintenance: str = Field(description="الصيانة وخطوط الإصلاح.")
    Field_Hospitals: str = Field(description="المستشفيات الميدانية والدعم الطبي.")
    Supply_Conclusions: str = Field(description="استنتاجات التقدير اللوجستي.")

    # --- intel conclusions ---
    Enemy_Capabilities: str = Field(description="قدرات العدو المستنتجة إجمالاً.")
    Conclusions: str = Field(description="الاستنتاجات الاستخباراتية العامة.")

    # --- joint ops (Warning Order) ---
    join_op_mission: str = Field(description="مهمة العملية المشتركة (القيادة الأعلى).")
    Join_op_purp: str = Field(description="غاية العملية المشتركة.")
    joint_ops_how: str = Field(description="نسق تنفيذ العملية المشتركة (الطريقة).")
    joint_ops_desired_end: str = Field(description="الحالة النهائية المرغوبة للعملية المشتركة.")

    # --- executive/higher command (Warning Order) ---
    Exc_command_mission: str = Field(description="مهمة القيادة التنفيذية / القيادة الأعلى مباشرة.")
    Exc_command_purp: str = Field(description="غاية القيادة التنفيذية.")
    Exc_command_main_mission: str = Field(description="المهمة الرئيسية للقيادة التنفيذية.")
    joint_ops_desired_end2: str = Field(
        description="الحالة النهائية المرغوبة للقيادة التنفيذية (تكرار مقصود لقسم مستقل)."
    )

    # --- own force (Warning Order) ---
    Land_component_force: str = Field(description="القوة البرية المنخرطة (مكونات الوحدات).")
    Attached_units: str = Field(description="الوحدات المرتبطة (Attached).")
    Force_Composition: str = Field(description="تشكيل القوة الصديقة.")
    Training_Readiness_Level: str = Field(description="مستوى جاهزية التدريب للقوات الصديقة.")
    Combat_Effectiveness: str = Field(description="الفاعلية القتالية للقوات الصديقة.")
    Operational_Conclusions: str = Field(description="استنتاجات تقدير العمليات الإجمالية.")


DOCUMENT_CLASSES = (StaffBrief,)
