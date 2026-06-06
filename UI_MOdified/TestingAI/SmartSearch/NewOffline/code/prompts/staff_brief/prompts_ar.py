"""prompts/staff_brief/prompts_ar.py — per-field instructions.

``EXTRACTION_PROMPTS_AR`` — facts drawn from the user files.
``DRAFTING_PROMPTS_AR`` — doctrine-retrieval fallbacks for conclusion /
framing fields (run only when the extractor returns the ABSENT_SENTINEL).
"""

from __future__ import annotations


# ---------------------------------------------------------- source-file extraction

# Every field in Y is attempted from the source files first.  source_hint
# on the YAML controls which file to prefer; wording here mirrors that.
_E: dict[tuple[str, str], str] = {}

# environment — Intel Report
_E[("StaffBrief", "Terrain")] = (
    "استخرج وصف الأرض في منطقة العمليات من تقرير الاستخبارات (تضاريس، "
    "مسالك، نقاط هيمنة). أعد جملتين بالعربية."
)
_E[("StaffBrief", "Weather")] = (
    "استخرج حالة الطقس المتوقَّعة خلال نافذة العملية من تقرير الاستخبارات "
    "(درجة حرارة، رياح، رؤية، هطول). جملة أو جملتان."
)
_E[("StaffBrief", "First_light")] = (
    "استخرج وقت أول ضوء (BMNT) من تقرير الاستخبارات أو الأمر الإنذاري."
)
_E[("StaffBrief", "Last_light")] = (
    "استخرج وقت آخر ضوء (EENT) من تقرير الاستخبارات أو الأمر الإنذاري."
)
_E[("StaffBrief", "Moon")] = (
    "استخرج طور القمر ونسبة إضاءته من تقرير الاستخبارات أو الأمر الإنذاري."
)
_E[("StaffBrief", "Effect_of_Weather_and_Terrain_on_Operations")] = (
    "استخرج تأثير الأرض والطقس على العمليات (تنقُّل، إخفاء، رماية، رؤية، "
    "إمداد) إن كان الأثر مذكوراً في تقرير الاستخبارات. إن لم يُذكر، أعد "
    "\"غير موجود في الملفات\" ليتولَّى المُوزِّع الاسترجاع العقيدي."
)

# enemy — Intel Report
_E[("StaffBrief", "Composition")] = "استخرج تشكيل العدو وقواته الرئيسية من تقرير الاستخبارات."
_E[("StaffBrief", "Deployments")] = "استخرج انتشار العدو ومواقعه من تقرير الاستخبارات."
_E[("StaffBrief", "Force_Coverage")] = (
    "استخرج تغطية قوات العدو للمحاور والعمق من تقرير الاستخبارات."
)
_E[("StaffBrief", "Morale")] = "استخرج تقدير معنويات قوات العدو من تقرير الاستخبارات."
_E[("StaffBrief", "Training")] = "استخرج تقدير مستوى تدريب قوات العدو من تقرير الاستخبارات."
_E[("StaffBrief", "Recent_and_Ongoing_Activities")] = (
    "استخرج النشاطات الأخيرة والجارية للعدو كما وردت في تقرير الاستخبارات."
)
_E[("StaffBrief", "Enemy_Tactics_in_Exposure_Operations_Phase1_Preparation")] = (
    "استخرج تكتيكات العدو المتوقَّعة في مرحلة التحضير من تقرير الاستخبارات."
)
_E[("StaffBrief", "Enemy_Tactics_in_Exposure_Operations_Phase2_Preparation")] = (
    "استخرج تكتيكات العدو المتوقَّعة في مرحلة التشكيل / التمهيد من تقرير "
    "الاستخبارات."
)
_E[("StaffBrief", "Enemy_Tactics_in_Exposure_Operations_Phase3_Main_Attack")] = (
    "استخرج تكتيكات العدو المتوقَّعة في مرحلة الهجوم الرئيسي من تقرير "
    "الاستخبارات."
)
_E[("StaffBrief", "Intentions_and_Objectives")] = (
    "استخرج نوايا العدو وأهدافه المحتملة من تقرير الاستخبارات."
)
_E[("StaffBrief", "Counter_Intelligence_Observations")] = (
    "استخرج ملاحظات الاستخبارات المضادة وقدرات استطلاع العدو من تقرير "
    "الاستخبارات."
)

# personnel — either file (Warning Order likely has friendly side, Intel Report enemy/environment side)
_E[("StaffBrief", "Force_Cover")] = (
    "استخرج وضع تغطية القوات الصديقة من الأمر الإنذاري أو تقرير الاستخبارات."
)
_E[("StaffBrief", "Combat_Morale")] = (
    "استخرج معنويات القوات الصديقة القتالية من الأمر الإنذاري."
)
_E[("StaffBrief", "Reinforcements")] = (
    "استخرج التعزيزات المخصَّصة أو المطلوبة من الأمر الإنذاري."
)
_E[("StaffBrief", "Projected_Casualties")] = (
    "استخرج تقديرات الخسائر المتوقَّعة من تقرير الاستخبارات أو الأمر الإنذاري."
)
_E[("StaffBrief", "Control_and_Coordination")] = (
    "استخرج منظومة التحكم والتنسيق بين الوحدات من الأمر الإنذاري."
)
_E[("StaffBrief", "Prisoners_of_War")] = (
    "استخرج التوجيهات المتعلقة بأسرى الحرب من الأمر الإنذاري."
)
_E[("StaffBrief", "Civilian_Users")] = (
    "استخرج وضع المدنيين في منطقة العمليات من تقرير الاستخبارات أو الأمر "
    "الإنذاري."
)
_E[("StaffBrief", "Civilian_Prisoners_and_Detainees")] = (
    "استخرج التوجيهات المتعلقة بالمحتجزين والمعتقلين المدنيين من الأمر "
    "الإنذاري."
)

# logistics — Intel Report (logistics sub-paragraph) or Warning Order
for f, hint in [
    ("Logistical_Rations",   "استخرج بيانات الإعاشة (الفئة الأولى)"),
    ("Logistical_sustainment","استخرج بيانات الإدامة العامة"),
    ("Fuel",                 "استخرج بيانات الوقود (الفئة الثالثة)"),
    ("ammunition",           "استخرج بيانات الذخيرة (الفئة الخامسة)"),
    ("Spare_parts",          "استخرج بيانات قطع الغيار (الفئة التاسعة)"),
    ("Engineering_materiel", "استخرج العتاد الهندسي"),
    ("Transportation",       "استخرج النقل وطواقم الحركة"),
    ("Maintenance",          "استخرج منظومة الصيانة وخطوط الإصلاح"),
    ("Field_Hospitals",      "استخرج الدعم الطبي والمستشفيات الميدانية"),
]:
    _E[("StaffBrief", f)] = (
        f"{hint} من تقرير الاستخبارات أو الأمر الإنذاري. إن لم ترد، أعد "
        f"\"غير موجود في الملفات\"."
    )

# joint ops — Warning Order
_E[("StaffBrief", "join_op_mission")] = (
    "استخرج مهمة العملية المشتركة (التي تدعمها وحدتنا) من الأمر الإنذاري."
)
_E[("StaffBrief", "Join_op_purp")] = (
    "استخرج غاية العملية المشتركة من الأمر الإنذاري."
)
_E[("StaffBrief", "joint_ops_how")] = (
    "استخرج نسق تنفيذ العملية المشتركة (الطريقة) من الأمر الإنذاري."
)
_E[("StaffBrief", "joint_ops_desired_end")] = (
    "استخرج الحالة النهائية المرغوبة للعملية المشتركة من الأمر الإنذاري."
)

# executive command — Warning Order
_E[("StaffBrief", "Exc_command_mission")] = (
    "استخرج مهمة القيادة التنفيذية (القيادة الأعلى المباشرة) من الأمر "
    "الإنذاري."
)
_E[("StaffBrief", "Exc_command_purp")] = (
    "استخرج غاية القيادة التنفيذية من الأمر الإنذاري."
)
_E[("StaffBrief", "Exc_command_main_mission")] = (
    "استخرج المهمة الرئيسية للقيادة التنفيذية من الأمر الإنذاري."
)
_E[("StaffBrief", "joint_ops_desired_end2")] = (
    "استخرج الحالة النهائية المرغوبة للقيادة التنفيذية من الأمر الإنذاري."
)

# own force — Warning Order task organization
_E[("StaffBrief", "Land_component_force")] = (
    "استخرج القوة البرية المنخرطة في العملية (مكونات الوحدات) من الأمر "
    "الإنذاري."
)
_E[("StaffBrief", "Attached_units")] = (
    "استخرج الوحدات المرتبطة (Attached) من قسم التشكيل في الأمر الإنذاري."
)
_E[("StaffBrief", "Force_Composition")] = (
    "استخرج تشكيل القوة الصديقة من الأمر الإنذاري."
)
_E[("StaffBrief", "Training_Readiness_Level")] = (
    "استخرج مستوى الجاهزية التدريبية للقوات الصديقة من الأمر الإنذاري إن ذُكر."
)
_E[("StaffBrief", "Combat_Effectiveness")] = (
    "استخرج تقدير الفاعلية القتالية للقوات الصديقة من الأمر الإنذاري أو "
    "تقرير الاستخبارات."
)

# intel capabilities + conclusions — Intel Report
_E[("StaffBrief", "Enemy_Capabilities")] = (
    "استخرج قدرات العدو المستنتجة من تقرير الاستخبارات."
)
_E[("StaffBrief", "Conclusions")] = (
    "استخرج الاستنتاجات الاستخباراتية العامة من تقرير الاستخبارات."
)
_E[("StaffBrief", "Human_Force_Conclusions")] = (
    "استخرج استنتاجات تقدير الأفراد إن وردت في الأمر الإنذاري أو تقرير "
    "الاستخبارات. إن لم ترد، أعد \"غير موجود في الملفات\" ليتولَّى المُوزِّع "
    "الاسترجاع العقيدي."
)
_E[("StaffBrief", "Supply_Conclusions")] = (
    "استخرج استنتاجات التقدير اللوجستي إن وردت. إن لم ترد، أعد "
    "\"غير موجود في الملفات\"."
)
_E[("StaffBrief", "Operational_Conclusions")] = (
    "استخرج استنتاجات تقدير العمليات الإجمالية إن وردت في الأمر الإنذاري. "
    "إن لم ترد، أعد \"غير موجود في الملفات\"."
)


EXTRACTION_PROMPTS_AR = _E


# ---------------------------------------------------------- doctrine drafting (fallback)

# Only invoked when the extractor returned ABSENT_SENTINEL for a field
# that ALSO has a doctrine_retrieved group in its YAML spec.
DRAFTING_PROMPTS_AR: dict[tuple[str, str], str] = {
    ("StaffBrief", "Effect_of_Weather_and_Terrain_on_Operations"): (
        "اكتب فقرة عربية موجزة توصِّف تأثير الأرض والطقس على العمليات "
        "التكتيكية (تنقُّل، إخفاء، رماية، رؤية، إمداد) استناداً إلى المقاطع "
        "العقيدية. لا تُدرج إحداثيات أو أرقاماً محددة."
    ),
    ("StaffBrief", "Human_Force_Conclusions"): (
        "اكتب فقرة عربية موجزة باستنتاجات تقدير الأفراد العامة استناداً إلى "
        "المقاطع العقيدية — إطار المعنويات، التعزيزات، الخسائر، "
        "التحكم، الأسرى، والمدنيين."
    ),
    ("StaffBrief", "Supply_Conclusions"): (
        "اكتب فقرة عربية موجزة باستنتاجات التقدير اللوجستي العامة استناداً "
        "إلى المقاطع العقيدية — محاور الإعاشة، الوقود، الذخيرة، النقل، "
        "الصيانة، والدعم الطبي."
    ),
    ("StaffBrief", "Operational_Conclusions"): (
        "اكتب فقرة عربية موجزة باستنتاجات تقدير العمليات الإجمالية استناداً "
        "إلى المقاطع العقيدية — إطار المهمة، الغاية، الطريقة، الحالة "
        "النهائية، وعلاقة التشكيل بالقيادات الأعلى."
    ),
}
