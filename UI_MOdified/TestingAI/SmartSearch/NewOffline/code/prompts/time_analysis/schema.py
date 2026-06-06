"""prompts/time_analysis/schema.py — flat Pydantic schema for Time Analysis.

One class, 10 str fields — exact keys from
``/Users/hextechkraken/Desktop/y/time_estimates_edited.txt``.

``extra="forbid"`` so neither the LLM (through ``with_structured_output``)
nor the dispatcher can invent a field. ``DOCUMENT_CLASSES`` preserves the
loader-parity convention — template_loader reads it to validate
cross-document derived references.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TimeAnalysis(BaseModel):
    """Y-approved flat shape for ``time_analysis`` output."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    time_Y: str = Field(
        description=(
            "اليوم المرجعي للعملية بصيغة عربية (مثال: \"يوم ي-33\"). "
            "يُستخرج من تاريخ بدء العملية في ملف الأمر الإنذاري."
        )
    )
    mission_start: str = Field(
        description=(
            "وقت وتاريخ بدء المهمة (H-Hour) بالصيغة العربية المعتمدة "
            "مع اليوم المرجعي."
        )
    )
    total_available_time: str = Field(
        description=(
            "مجموع الوقت المتاح من زمن الإبلاغ حتى H-Hour، بالساعات "
            "أو الدقائق أو الصيغة العربية المعتمدة."
        )
    )
    allocated_planning_time: str = Field(
        description=(
            "ثلث الوقت المتاح المخصَّص للقائد والأركان للتخطيط وفق "
            "قاعدة 1:3."
        )
    )
    available_time_for_subordinate_units: str = Field(
        description="ثلثا الوقت المتاح الموزَّعان على الوحدات التابعة."
    )
    time_for_mission_receipt: str = Field(
        description="حصة خطوة استلام وتحليل المهمة (30% من الوقت التخطيطي)."
    )
    time_for_development: str = Field(
        description="حصة خطوة تطوير الأعمال الممكنة (20% من الوقت التخطيطي)."
    )
    time_for_mission_analysis: str = Field(
        description="حصة خطوة تحليل ومقارنة الأعمال (30% من الوقت التخطيطي)."
    )
    time_for_plan: str = Field(
        description="حصة خطوة إعداد الخطة والأوامر (20% من الوقت التخطيطي)."
    )
    time_now: str = Field(
        description=(
            "الوقت الحالي / زمن الإبلاغ — يُستخرج من ملف الأمر الإنذاري "
            "ويُنسَّق بالعربية."
        )
    )


DOCUMENT_CLASSES = (TimeAnalysis,)
