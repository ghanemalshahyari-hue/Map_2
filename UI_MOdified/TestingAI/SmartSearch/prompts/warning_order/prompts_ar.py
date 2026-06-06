"""prompts/warning_order/prompts_ar.py — per-field extraction instructions.

``EXTRACTION_PROMPTS_AR`` — facts drawn from the user files (primarily
the Warning Order source file, with Intel Report as a secondary source
for environment / enemy blocks).

No ``DRAFTING_PROMPTS_AR`` — the Warning Order has no doctrine-retrieval
fields. If an extraction comes back with the absent sentinel, the
dispatcher falls through to the Arabic "غير متوفر في المدخلات" placeholder.
"""

from __future__ import annotations


_E: dict[tuple[str, str], str] = {}

# --- higher-command mission & intent (Warning Order) ---
_E[("WarningOrder", "friendly_forces")] = (
    "استخرج وصف القوات الصديقة: تمركزها، قدراتها، وحالتها العملياتية "
    "الراهنة كما وردت في الأمر الإنذاري."
)
_E[("WarningOrder", "join_op_mission")] = (
    "استخرج مهمة العملية المشتركة ونطاقها الأساسي من الأمر الإنذاري."
)
_E[("WarningOrder", "join_op_purp")] = (
    "استخرج غاية القائد والحالة النهائية المرغوبة للعملية المشتركة من "
    "الأمر الإنذاري."
)
_E[("WarningOrder", "joint_ops_how")] = (
    "استخرج مفهوم التنفيذ العام وأسلوب تنفيذ المهمة المشتركة من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "joint_ops_desired_end")] = (
    "استخرج الأهداف النهائية المحدَّدة (تأمين أرض، تحييد تهديد، ...) من "
    "الأمر الإنذاري."
)
_E[("WarningOrder", "mission_of_supporting_unit")] = (
    "استخرج المهام والمسؤوليات المسندة للوحدات المساندة أو الممكِّنة من "
    "الأمر الإنذاري."
)

# --- civilian / external coordination ---
_E[("WarningOrder", "CIVILIAN_CONSIDERATIONS")] = (
    "استخرج الأثر المحتمل على السكان المدنيين وسبل التخفيف كما وردت في "
    "الأمر الإنذاري أو تقرير الاستخبارات."
)
_E[("WarningOrder", "gov_and_nongov_org")] = (
    "استخرج قائمة المنظمات الحكومية وغير الحكومية ذات الصلة بالتنسيق "
    "والدعم من الأمر الإنذاري."
)
_E[("WarningOrder", "local_authorities")] = (
    "استخرج هيئات الحكم المحلي التي يجب التنسيق معها خلال العملية من "
    "الأمر الإنذاري."
)
_E[("WarningOrder", "red_crescent")] = (
    "استخرج تفاصيل التنسيق مع الهلال الأحمر والأصول الطبية والإنسانية "
    "من الأمر الإنذاري."
)

# --- task organization / assumptions ---
_E[("WarningOrder", "Attached_and_Detached_units")] = (
    "استخرج الوحدات المرتبطة أو المنفصلة مؤقتاً من بنية القيادة كما وردت "
    "في الأمر الإنذاري."
)
_E[("WarningOrder", "Operational_Assumptions")] = (
    "استخرج الافتراضات التخطيطية (الظروف، المواقيت، القيود) من الأمر "
    "الإنذاري."
)

# --- ground component mission & execution ---
_E[("WarningOrder", "GROUND_COMPONENT_MISSION")] = (
    "استخرج المهمة والمهام المسندة تحديداً لقوة المكون البري من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "Exc_command_purp")] = (
    "استخرج تركيز القيادة التنفيذية ونقاط القرار والنتائج المرغوبة من "
    "الأمر الإنذاري."
)
_E[("WarningOrder", "Concept_of_operations")] = (
    "استخرج المقاربة التكتيكية والعملياتية لتحقيق أهداف المهمة من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "Units_Duty")] = (
    "استخرج المهام المحدَّدة ومتطلبات الحركة والجاهزية للوحدات التابعة "
    "من الأمر الإنذاري."
)
_E[("WarningOrder", "Duties_of_Other_Combat_Units_and_Combat_Support_Units")] = (
    "استخرج أدوار الإسناد للمدفعية، الدفاع الجوي، الهندسة، واللوجستيات "
    "من الأمر الإنذاري."
)
_E[("WarningOrder", "Timings")] = (
    "استخرج المواعيد النهائية الحرجة، انتقالات المراحل، والجداول "
    "العملياتية من الأمر الإنذاري."
)
_E[("WarningOrder", "Commanders_Crtitical_Information_Requirements")] = (
    "استخرج متطلبات القائد الحرجة من المعلومات (CCIR / PIR / FFIR) "
    "اللازمة لاتخاذ القرار في الوقت المناسب من الأمر الإنذاري."
)

# --- document headers ---
_E[("WarningOrder", "header")] = (
    "استخرج الترويسة الرئيسية أو تصنيف الوثيقة (مثال: \"سري\"، رقم "
    "النسخة، رقم الصفحة). من الأمر الإنذاري."
)
_E[("WarningOrder", "header2")] = (
    "استخرج الترويسة الثانية، عادةً اسم القوة المشتركة أو القيادة "
    "المشتركة، من الأمر الإنذاري."
)
_E[("WarningOrder", "header3")] = (
    "استخرج الترويسة الثالثة التي تحدِّد قيادة المكون البري من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "header4")] = (
    "استخرج الترويسة الرابعة التي تحدِّد شعبة الأركان المسؤولة (مثل: "
    "العمليات / G3) من الأمر الإنذاري."
)

# --- admin metadata ---
_E[("WarningOrder", "Assembly_Area")] = (
    "استخرج موقع تجمُّع القوات وتحضيرها قبل الانتشار من الأمر الإنذاري."
)
_E[("WarningOrder", "date_time")] = (
    "استخرج التاريخ والوقت الرسمي لإصدار الأمر أو بدء نفاذه من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "letter_ref_number")] = (
    "استخرج رقم المرجع الداخلي للوثيقة أو الرسالة من الأمر الإنذاري."
)
_E[("WarningOrder", "letter_ref_number2")] = (
    "استخرج رقم المرجع الثانوي (غالباً للتوجيهات التنبيهية أو "
    "العملياتية) من الأمر الإنذاري."
)
_E[("WarningOrder", "References")] = (
    "استخرج قائمة المراجع: العقائد الحاكمة، الأدلة، الأوامر الثابتة، "
    "من الأمر الإنذاري."
)
_E[("WarningOrder", "Maps")] = (
    "استخرج المراجع الخرائطية والمقاييس المستخدمة للتخطيط والملاحة من "
    "الأمر الإنذاري."
)
_E[("WarningOrder", "task_assembly")] = (
    "استخرج كيفية تجميع الوحدات لتنفيذ المهام ومواقع التجميع المحدَّدة "
    "من الأمر الإنذاري."
)
_E[("WarningOrder", "time_zone")] = (
    "استخرج المنطقة الزمنية المرجعية المعتمدة لكل التخطيط العملياتي من "
    "الأمر الإنذاري."
)
_E[("WarningOrder", "Appendices")] = (
    "استخرج قائمة الملاحق أو الوثائق التخطيطية الإضافية المُشار إليها "
    "في الأمر الإنذاري."
)
_E[("WarningOrder", "Viewports")] = (
    "استخرج المراجع المتعلقة بالطبقات العملياتية، الرسومات، أو الخرائط "
    "الرقمية المستخدمة في الأمر الإنذاري."
)

# --- situation / environment ---
_E[("WarningOrder", "situation")] = (
    "استخرج الموقف العام — لمحة شاملة عن البيئة الاستراتيجية "
    "والعملياتية الراهنة — من الأمر الإنذاري أو تقرير الاستخبارات."
)
_E[("WarningOrder", "area_interest")] = (
    "استخرج منطقة الاهتمام (المنطقة الجغرافية للتركيز العملياتي أو "
    "جمع الاستخبارات) من الأمر الإنذاري أو تقرير الاستخبارات."
)
_E[("WarningOrder", "operations_area")] = (
    "استخرج حدود منطقة العمليات ونطاقها الدقيق من الأمر الإنذاري."
)
_E[("WarningOrder", "terrain")] = (
    "استخرج وصف الأرض (المعالم الجغرافية، العوائق، عوامل الحركة) من "
    "تقرير الاستخبارات أو الأمر الإنذاري."
)
_E[("WarningOrder", "weather")] = (
    "استخرج الظروف الجوية وأثرها على العملية والمعدات من تقرير "
    "الاستخبارات أو الأمر الإنذاري."
)
_E[("WarningOrder", "civil_considerations")] = (
    "استخرج حركات المدنيين، البنية التحتية، والشؤون الإنسانية في منطقة "
    "العمليات من تقرير الاستخبارات أو الأمر الإنذاري."
)
_E[("WarningOrder", "enemy_forces")] = (
    "استخرج تشكيل العدو، قدراته، انتشاره، والأعمال المحتملة له من تقرير "
    "الاستخبارات أو الأمر الإنذاري."
)

# --- coordination instructions ---
_E[("WarningOrder", "Fire_support_coordination")] = (
    "استخرج قواعد ومواقيت وإجراءات تنسيق الإسناد الناري (المدفعية "
    "والنيران غير المباشرة) من الأمر الإنذاري."
)
_E[("WarningOrder", "Air_support_coordination")] = (
    "استخرج تفاصيل الإسناد الجوي القريب (CAS)، الاستطلاع (ISR)، "
    "وإجراءات التحكم بالمجال الجوي من الأمر الإنذاري."
)
_E[("WarningOrder", "Risk_assy")] = (
    "استخرج المخاطر العملياتية وسبل التخفيف للأفراد والمعدات من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "ROE")] = (
    "استخرج قواعد الاشتباك الحاكمة لاستخدام القوة وإجراءات التعامل من "
    "الأمر الإنذاري."
)
_E[("WarningOrder", "Other_coordination_media")] = (
    "استخرج أساليب نشر المعلومات والشؤون العامة من الأمر الإنذاري."
)
_E[("WarningOrder", "Other_coordination_meeting")] = (
    "استخرج جداول اجتماعات التنسيق، الإيجازات، ونقاط الارتباط من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "Other_coordination_Excu")] = (
    "استخرج تعليمات التنفيذ، التحذيرات، وبنود العمل الفورية من الأمر "
    "الإنذاري."
)
_E[("WarningOrder", "Other_coordination_movm")] = (
    "استخرج إجراءات التحكم بالحركة، الطرق، وإدارة السير من الأمر "
    "الإنذاري."
)

# --- sustainment / command & control ---
_E[("WarningOrder", "Sustainment")] = (
    "استخرج خطط الإدامة: اللوجستيات، سلاسل الإمداد، الصيانة، الإخلاء "
    "الطبي، وإعادة التزود، من الأمر الإنذاري."
)
_E[("WarningOrder", "ACCS")] = (
    "استخرج إجراءات تنسيق الدفاع الجوي أو تكامل منظومة التحكم والسيطرة "
    "من الأمر الإنذاري."
)


EXTRACTION_PROMPTS_AR = _E


# No doctrine-retrieval fields on the Warning Order — the dispatcher
# fallback handles absent values via PLACEHOLDER_NOT_IN_INPUTS_AR.
DRAFTING_PROMPTS_AR: dict[tuple[str, str], str] = {}
