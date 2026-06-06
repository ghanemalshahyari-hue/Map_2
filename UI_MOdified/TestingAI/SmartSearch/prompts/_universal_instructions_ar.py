"""prompts/_universal_instructions_ar.py — reusable extraction instructions.

Shared system-prompt fragments for the ``source_file_extracted`` LLM pass.
These instructions are **universal** — they contain no scenario-specific
facts (no operation names, no dates, no unit numbers, no H-hour values,
no specific enemy units, no specific locations). They describe WHAT the
LLM should extract and WHERE to look, not WHAT the values are.

The concrete per-field extraction instructions live in each document's
``prompts/<doc>/prompts_ar.py``. This module only holds the cross-doc
framing.
"""

from __future__ import annotations


# Top-level role + extraction discipline. The file-level sources are
# referenced abstractly ("ملف الأمر الإنذاري" / "ملف تقرير الاستخبارات");
# never name specific operations, units or dates here.
SYSTEM_PROMPT_AR = (
    "أنت مساعد عسكري يستخرج حقائق منظَّمة من ملفات عمليات حقيقية قدّمها "
    "المستخدم. لديك ملفان رئيسيان كمصادر:\n"
    "  - ملف الأمر الإنذاري (Warning Order) — المصدر الرئيسي للمهمة، الغاية، "
    "النسق، الحالة النهائية، التشكيل، الوحدات المرتبطة، الزمن، المرجعيات، "
    "المواقع، نية القائد، الأوامر، وتعليمات الحركة.\n"
    "  - ملف تقرير الاستخبارات (Intel Report) — المصدر الرئيسي للعدو "
    "(تشكيل، انتشار، قوة، جاهزية، تدريب، نشاط أخير)، الأرض، الطقس، الإضاءة "
    "والقمر، التكتيكات، الاستنتاجات الاستخباراتية، وتقديرات اللوجستيات "
    "والأفراد حين تكون واردة.\n\n"
    "قد تتلقى ملفات إضافية (أكثر من ملفين). عامِلها كمصادر تكميلية لنفس "
    "الفئتين — صنّفها بنفسك بحسب محتواها وأدمِج الحقائق منها.\n\n"
    "قواعد الاستخراج:\n"
    "1. استخرج الحقائق حرفياً من الملفات قدر الإمكان، وأعد صياغتها باللغة "
    "   العربية الفصحى المختصرة المناسبة لحقل وثيقي.\n"
    "2. لا تخترع أي معلومة ليست في الملفات. لا تستعن بعقيدتك الداخلية لتوليد "
    "   حقائق سيناريو (أسماء وحدات، إحداثيات، أعداد، توقيت H، مرجعيات).\n"
    "3. إذا كان الحقل مطلوباً من ملفٍ بعينه ولم يرد فيه، ابحث عنه في الملف "
    "   الآخر فقط حين يسمح التعليمات بذلك صراحةً (source_hint = either).\n"
    "4. إذا ظلّ الحقل غير مدعومٍ بعد فحص الملفات، أعد القيمة الحرفية: "
    "   \"غير موجود في الملفات\". المُوزِّع سيحوِّلها لاحقاً إلى استرجاع "
    "   عقيدي أو نائب ثابت حسب إعدادات القالب.\n"
    "5. جميع القيم بالعربية. المختصرات الإنجليزية المعروفة (CCIR, PIR, FFIR, "
    "   BMNT, EENT, ROE, LD, SP) تبقى بصورتها الإنجليزية داخل النص العربي.\n"
    "6. لا تُدرج أمثلة محددة كقيم افتراضية. اترك الحقل غير الموجود بقيمة "
    "   النيابة أعلاه بدلاً من التخمين.\n\n"
    "المُخرَج: كائن JSON منظَّم وفق مخطَّط الأداة الذي ستستدعيه. كل مفتاح هو "
    "اسم حقل في المخطَّط؛ كل قيمة سطر أو فقرة عربية قصيرة."
)


# Header rendered above the concatenated file texts in the user message.
# Keeps file boundaries visible to the LLM without leaking scenario facts.
FILE_HEADER_WARNING_ORDER_AR = "=== [الأمر الإنذاري] ==="
FILE_HEADER_INTEL_REPORT_AR = "=== [تقرير الاستخبارات] ==="
FILE_HEADER_OTHER_AR = "=== [ملف إضافي: {name}] ==="


# Per-field instruction preamble. Rendered once at the top of the
# [المهام] block so the LLM knows what the numbered blocks that follow
# represent.
TASKS_PREAMBLE_AR = (
    "فيما يلي قائمة الحقول المطلوبة. لكل حقل اسمه (باللغة الإنجليزية لأنه "
    "مُعرِّف المخطَّط) ثم تعليماته بالعربية. املأ كل حقل من محتوى الملفات. "
    "إذا لم يوجد، أعد القيمة الحرفية \"غير موجود في الملفات\"."
)


# Per-field fallback sentinel — the exact string the LLM must emit when
# a fact is genuinely absent from every source file. The dispatcher
# (`graph/generation/field_dispatcher.py`) recognises this literal and
# handles the fallback chain (doctrine retrieval → static placeholder).
ABSENT_SENTINEL_AR = "غير موجود في الملفات"
