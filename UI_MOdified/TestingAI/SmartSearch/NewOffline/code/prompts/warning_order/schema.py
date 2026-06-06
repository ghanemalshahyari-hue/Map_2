"""prompts/warning_order/schema.py — flat Pydantic schema for Warning Order.

One class, 50 ``str`` fields — exact keys from
``/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf``.

Per the user directive, each field's ``description`` carries the inline
explanation that followed the empty-string value in the reference JSON.
This description is what ``with_structured_output`` surfaces to the
extractor LLM, so the WARNO extractor has per-field guidance even
before it consults ``prompts_ar.py``.

``extra="forbid"`` so neither the LLM nor the dispatcher can invent a
field. ``DOCUMENT_CLASSES`` preserves the loader-parity convention.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class WarningOrder(BaseModel):
    """Y-approved flat shape for ``warning_order`` output (50 fields)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # --- higher-command mission & intent ---
    friendly_forces: str = Field(
        description=(
            "describes friendly unit dispositions, capabilities and current "
            "op status"
        )
    )
    join_op_mission: str = Field(
        description="states the primary obj and scope of the joint op"
    )
    join_op_purp: str = Field(
        description=(
            "outlines the commanders intent and desired end state for the "
            "joint op"
        )
    )
    joint_ops_how: str = Field(
        description=(
            "explains the overarching concept and methods for executing the "
            "joint mission"
        )
    )
    joint_ops_desired_end: str = Field(
        description=(
            "lists specific end state goals such as securing territory or "
            "neutralizing threats"
        )
    )
    mission_of_supporting_unit: str = Field(
        description=(
            "defines the assigned tasks and responsibilities for supporting "
            "or enabling units"
        )
    )

    # --- civilian / external coordination ---
    CIVILIAN_CONSIDERATIONS: str = Field(
        description=(
            "addresses potential impact on civilian population and "
            "mitigation strategies"
        )
    )
    gov_and_nongov_org: str = Field(
        description=(
            "lists relevant government and non gov organization for "
            "coordination and support"
        )
    )
    local_authorities: str = Field(
        description=(
            "identifies local governance bodies to liaise with during "
            "operation"
        )
    )
    red_crescent: str = Field(
        description=(
            "specifies coordination with red crescent medical and "
            "humanitarian assets"
        )
    )

    # --- task organization / assumptions ---
    Attached_and_Detached_units: str = Field(
        description=(
            "details units temporarily assigned to or released from the "
            "command structure"
        )
    )
    Operational_Assumptions: str = Field(
        description=(
            "notes expected conditions timelines and constraints assumed "
            "during planning"
        )
    )

    # --- ground component mission & execution ---
    GROUND_COMPONENT_MISSION: str = Field(
        description=(
            "states the specific mission and tasks assigned to the ground "
            "force component"
        )
    )
    Exc_command_purp: str = Field(
        description=(
            "explains the executing commanders focus decision points and "
            "desired outcomes"
        )
    )
    Concept_of_operations: str = Field(
        description=(
            "provides the tactical and operational approach to achieve "
            "mission objectives"
        )
    )
    Units_Duty: str = Field(
        description=(
            "assigned specific tasks movement and readiness requirements "
            "to subordinate units"
        )
    )
    Duties_of_Other_Combat_Units_and_Combat_Support_Units: str = Field(
        description=(
            "details support roles for artillery air defense engineering "
            "and logistics"
        )
    )
    Timings: str = Field(
        description=(
            "specifies critical deadlines phase transitions and operational "
            "schedules"
        )
    )
    Commanders_Crtitical_Information_Requirements: str = Field(
        description=(
            "lists vital intelligence and data needed for timely decision "
            "making"
        )
    )

    # --- document headers ---
    header: str = Field(
        description="primary doc classification or official header information"
    )
    header2: str = Field(
        description=(
            "secondary header, typicaly identifying the joint task force "
            "or command"
        )
    )
    header3: str = Field(
        description="tertiary header, specifying the ground component command"
    )
    header4: str = Field(
        description=(
            "quaternary header, indicating responsible staff section "
            "(e.g., operations)"
        )
    )

    # --- admin metadata ---
    Assembly_Area: str = Field(
        description=(
            "location where forces will stage, gather, and prepare before "
            "deployment"
        )
    )
    date_time: str = Field(
        description=(
            "official date and time the order is issued or becomes effective"
        )
    )
    letter_ref_number: str = Field(
        description="internal document or message reference identifier"
    )
    letter_ref_number2: str = Field(
        description=(
            "secondary ref, often for alert or operational directives"
        )
    )
    References: str = Field(
        description="lists governing doctrines, manuals and standing op orders"
    )
    Maps: str = Field(
        description=(
            "specifies cartographic references and scales used for planning "
            "and navigation"
        )
    )
    task_assembly: str = Field(
        description=(
            "defines how and where units will assemble to execute specific "
            "tasks"
        )
    )
    time_zone: str = Field(
        description="establishes the ref time standard for all operational planning"
    )
    Appendices: str = Field(
        description=(
            "references detailed annexes or supplementary planning documents"
        )
    )
    Viewports: str = Field(
        description=(
            "points to operational overlays graphics or digital maps used "
            "in the order"
        )
    )

    # --- situation / environment ---
    situation: str = Field(
        description=(
            "provides a comprehensive overview of the current strategic and "
            "operational environment"
        )
    )
    area_interest: str = Field(
        description=(
            "defines the geographical region of operational focus or "
            "intelligence collection"
        )
    )
    operations_area: str = Field(
        description=(
            "specifies the exact boundaries and scope where combat "
            "operations will occur"
        )
    )
    terrain: str = Field(
        description=(
            "describes geographical features obstacle and movement factors "
            "affecting tactics"
        )
    )
    weather: str = Field(
        description=(
            "details metrological conditions and their impact on operation "
            "and equipment"
        )
    )
    civil_considerations: str = Field(
        description=(
            "covers civilian movements infrastructure and humanitarian "
            "concerns in the area of operations"
        )
    )
    enemy_forces: str = Field(
        description=(
            "describes enemy compositions capability, dispositions and "
            "likely courses of action"
        )
    )

    # --- coordination instructions ---
    Fire_support_coordination: str = Field(
        description=(
            "outlines rules timelines and procedures for artillery and "
            "indirect fire"
        )
    )
    Air_support_coordination: str = Field(
        description=(
            "details close air support, ISR, and airspace control measures"
        )
    )
    Risk_assy: str = Field(
        description=(
            "identifes operational hazards and mitigation strategies for "
            "personnel and equipment"
        )
    )
    ROE: str = Field(
        description=(
            "specifies rules of engagement governing use of force and "
            "engagement protocols"
        )
    )
    Other_coordination_media: str = Field(
        description=(
            "outlines methods for information dissemination and public "
            "affairs messaging"
        )
    )
    Other_coordination_meeting: str = Field(
        description=(
            "listens schedules coordination meetings, briefings, and "
            "liaison points"
        )
    )
    Other_coordination_Excu: str = Field(
        description=(
            "provides execution intruction, warnings, and immediate action "
            "items"
        )
    )
    Other_coordination_movm: str = Field(
        description=(
            "details movement control, routes, and traffic management "
            "procedures"
        )
    )

    # --- sustainment / command & control ---
    Sustainment: str = Field(
        description=(
            "covers logistic, supply chains, maintenance, medical "
            "evacuation and resupply plans"
        )
    )
    ACCS: str = Field(
        description=(
            "specifies air defense coordination or command system "
            "integration procedures"
        )
    )


DOCUMENT_CLASSES = (WarningOrder,)
