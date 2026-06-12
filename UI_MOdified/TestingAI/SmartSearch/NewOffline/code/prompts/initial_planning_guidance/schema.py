"""prompts/initial_planning_guidance/schema.py — flat Pydantic schema.

One class, 18 str fields — first ten mirror ``TimeAnalysis`` so the YAML
can reuse the computed/time-math machinery; last eight are planning
directives sourced from the Warning Order or doctrine fallback.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class InitialPlanningGuidance(BaseModel):
    """Y-approved flat shape for ``initial_planning_guidance`` output."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # --- timing (shared with TimeAnalysis) ---
    time_Y: str = Field(description="اليوم المرجعي للعملية بالصيغة العربية.")
    mission_start: str = Field(description="وقت وتاريخ بدء المهمة (H-Hour).")
    total_available_time: str = Field(description="مجموع الوقت المتاح حتى H-Hour.")
    allocated_planning_time: str = Field(description="ثلث الوقت المخصَّص للتخطيط.")
    available_time_for_subordinate_units: str = Field(
        description="ثلثا الوقت المخصَّصان للوحدات التابعة."
    )
    time_for_mission_receipt: str = Field(description="حصة استلام وتحليل المهمة.")
    time_for_development: str = Field(description="حصة تطوير الأعمال الممكنة.")
    time_for_mission_analysis: str = Field(description="حصة تحليل ومقارنة الأعمال.")
    time_for_plan: str = Field(description="حصة إعداد الخطة والأوامر.")
    time_now: str = Field(description="الوقت الحالي / زمن الإبلاغ.")

    # --- planning directives ---
    report_production: str = Field(
        description=(
            "توجيهات إنتاج التقارير — تواتر، القنوات، نماذج التقارير. "
            "يُستخرج من الأمر الإنذاري إن وُجد، وإلا من العقيدة."
        )
    )
    coordination_duties: str = Field(
        description=(
            "واجبات التنسيق بين الأركان والوحدات المُساندة والجهات الخارجية."
        )
    )
    authorized_movements: str = Field(
        description="الحركات المأذون بها قبل الأمر، ومحاورها، وقيودها."
    )
    staff_duties: str = Field(
        description="واجبات الأركان لكل شعبة خلال مرحلة التخطيط."
    )
    times_locations_planning: str = Field(
        description=(
            "أوقات ومواقع التخطيط التشاركي وجلسات المراجعة مع القائد."
        )
    )
    commander_intel_req: str = Field(
        description=(
            "متطلبات القائد الحرجة من المعلومات (CCIR / PIR) الخاصة بالعدو "
            "والأرض والسكان. تُستخرج من الأمر الإنذاري إن حددها القائد."
        )
    )
    commander_intel_req2: str = Field(
        description=(
            "متطلبات معلومات القوات الصديقة (FFIR) — حالة الوحدات، "
            "الجاهزية، المواصلات، الإمداد، والخسائر."
        )
    )
    ROE: str = Field(
        description=(
            "قواعد الاشتباك المعتمدة للعملية. تُستخرج من الأمر الإنذاري إن "
            "وردت حرفياً؛ وإلا يُستعان بالعقيدة لصياغة إطار عام."
        )
    )


DOCUMENT_CLASSES = (InitialPlanningGuidance,)
