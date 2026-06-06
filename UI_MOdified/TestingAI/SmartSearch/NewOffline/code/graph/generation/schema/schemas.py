"""graph/generation/schema/schemas.py — single-file Pydantic catalog.

Introduced under §18 C21 (2026-04-23) as the **one editable surface**
for every Pydantic class Phase 3 generates against. Previously each of
the four documents had its own module (``time_analysis.py``,
``initial_planning_guidance.py``, ``opord.py``, ``staff_estimate.py``);
those modules now re-export from this file so existing imports keep
working, but new code should import from ``graph.generation.schema.schemas``.

Why one file? The user asked for a single place to rename classes or
fields ("schema names which i can change if i want"). Keeping the four
document blocks side-by-side also makes it trivial to audit
field-count parity against ``NewClasses.md`` — the master reference
for the rename-only cross-domain port.

Scope of this module:
  * Pydantic v2 type shells only. **NO** ``Field("default")``,
    ``description=``, or ``examples=`` — per §18 C13, defaults and
    labels live in ``templates/*.yaml`` + ``field_catalog.py``, and
    drafting instructions live in ``prompts_ar.py``.
  * Field names are character-identical to ``NewClasses.md``. Changing
    a field name here requires a matching YAML rename and a
    ``field_catalog.py`` rename — the template loader's parity pass
    enforces this.
  * Every class is listed in the ``DOCUMENT_CLASSES`` tuple. The
    loader's ``_all_phase3_schema_names()`` reads that tuple to
    validate cross-document ``derived.reference`` edges.

Template → classes-used mapping (loader ``TEMPLATE_ID_TO_SCHEMA_MODULE``
all point here):

    time_analysis              MISSION_TIMELINE, CURRENT_TIME_REFERENCE
    initial_planning_guidance  INITIAL_PLAN_TIMELINE, CURRENT_TIME_REFERENCE_2,
                               PLANNING_DIRECTIVES, OPERATIONAL_SAFETY_STANDARDS
    warning_order              HeaderSection, MetadataSection, OperationalSituation,
                               MissionAndExecution, Annexes
    staff_brief                INTELLIGENCE_ESTIMATE, OPERATIONS_ESTIMATE,
                               PERSONNEL_ESTIMATE, LOGISTICS_ESTIMATE
    operation_order  (v2)      HeaderSection, MetadataSection, OperationalSituation,
                               MissionAndExecution, SustainmentAndCoordination, Annexes
    staff_estimate   (v2)      INTELLIGENCE_ESTIMATE, OPERATIONS_ESTIMATE,
                               PERSONNEL_ESTIMATE, LOGISTICS_ESTIMATE

Two template_ids can legitimately share the same classes (``warning_order``
and ``operation_order`` both source from the OPORD classes; ``staff_brief``
and ``staff_estimate`` both source from the Staff Estimate classes). The
loader's schema-module parity pass only cross-checks classes declared in
the YAML — unreferenced classes in this module are fine.
"""

from __future__ import annotations

from pydantic import BaseModel


# =============================================================================
# DOCUMENT 1 — أمر العمليات / الأمر الإنذاري
#   Classes shared by `operation_order.yaml` (v2) and `warning_order.yaml` (v1).
#   Field names are the doctrine mirror of the old health prompt.txt; do not
#   rename without updating NewClasses.md + the catalogs.
# =============================================================================

class HeaderSection(BaseModel):
    header: str
    organization: str
    department: str
    unit: str
    assembly_area: str


class MetadataSection(BaseModel):
    date_time: str
    letter_ref_number: str
    warning_order_ref_number: str
    references: str
    maps: str
    task_organization: str
    time_zone: str


class OperationalSituation(BaseModel):
    situation_summary: str
    area_of_interest: str
    area_of_operations: str
    terrain: str
    weather: str
    civil_considerations: str
    enemy_profile: str


class MissionAndExecution(BaseModel):
    task_units: str
    mission: str
    objective: str
    method: str
    desired_end_state: str
    higher_unit_mission: str
    civil_military_operations: str
    interagency_coordination: str
    host_nation_coordination: str
    ngo_io_coordination: str
    attached_detached_units: str
    planning_assumptions: str
    ground_component_mission: str
    execution_purpose: str
    concept_of_operations: str
    subordinate_unit_tasks: str
    combat_support_tasks: str
    execution_timeline: str
    commanders_critical_information_requirements: str


class SustainmentAndCoordination(BaseModel):
    fire_support_coordination: str
    air_support_coordination: str
    risk_assessment: str
    rules_of_engagement: str
    media_and_information_operations: str
    coordination_meetings: str
    execution_priorities: str
    movement_order: str
    sustainment_paragraph: str
    command_and_signal: str


class Annexes(BaseModel):
    appendices: str
    overlays: str


# =============================================================================
# DOCUMENT 2 — تقديرات هيئة الركن / إيجاز هيئة الركن
#   Classes shared by `staff_estimate.yaml` (v2, full estimate) and
#   `staff_brief.yaml` (v1, Step-1 briefing). Same type shells; the YAMLs
#   select which fields to populate via retrieval vs mark as
#   "يُصدر لاحقاً" static placeholders.
# =============================================================================

class INTELLIGENCE_ESTIMATE(BaseModel):
    terrain: str
    weather: str
    first_light: str
    last_light: str
    moon_phase: str
    effect_of_environment_on_operations: str
    enemy_composition: str
    enemy_disposition: str
    enemy_strength: str
    enemy_readiness: str
    enemy_training: str
    recent_and_ongoing_activities: str
    enemy_tactics_phase1_preparation: str
    enemy_tactics_phase2_shaping: str
    enemy_tactics_phase3_decisive: str
    enemy_most_likely_coa: str
    counter_intel_observations: str


class OPERATIONS_ESTIMATE(BaseModel):
    higher_unit_mission: str
    higher_unit_purpose: str
    higher_unit_method: str
    higher_unit_end_state: str
    own_unit_mission: str
    own_unit_purpose: str
    main_effort_tasks: str
    own_unit_end_state: str
    ground_component_force: str
    attached_supporting_units: str
    force_composition: str
    training_readiness_level: str
    combat_effectiveness: str
    operations_conclusions: str


class PERSONNEL_ESTIMATE(BaseModel):
    force_coverage: str
    morale: str
    reinforcements: str
    projected_casualties: str
    control_and_coordination: str
    pows_detainees: str
    civilian_refugees: str
    civilian_detainees: str
    personnel_conclusions: str


class LOGISTICS_ESTIMATE(BaseModel):
    subsistence_class_i: str
    general_sustainment: str
    pol_class_iii: str
    ammunition_class_v: str
    repair_parts_class_ix: str
    equipment_and_engineer_materiel: str
    transportation: str
    maintenance: str
    medical_support_class_viii: str
    logistics_conclusions: str


# =============================================================================
# DOCUMENT 3 — تحليل الوقت (Time Analysis)
# =============================================================================

class MISSION_TIMELINE(BaseModel):
    current_date: str
    mission_start_time: str
    total_available_time: str
    allocated_planning_time: str
    available_time_for_subordinate_units: str
    time_for_mission_receipt_analysis: str
    time_for_coa_development: str
    time_for_coa_analysis_comparison: str
    time_for_plan_order_production: str


class CURRENT_TIME_REFERENCE(BaseModel):
    time_now: str


# =============================================================================
# DOCUMENT 4 — دليل التخطيط الأولي (Initial Planning Guidance)
# =============================================================================

class INITIAL_PLAN_TIMELINE(BaseModel):
    current_date: str
    mission_start_time: str
    total_available_time: str
    allocated_planning_time: str
    available_time_for_subordinate_units: str
    time_for_mission_receipt_analysis: str
    time_for_coa_development: str
    time_for_coa_analysis_comparison: str
    time_for_plan_order_production: str


class CURRENT_TIME_REFERENCE_2(BaseModel):
    time_now: str


class PLANNING_DIRECTIVES(BaseModel):
    report_production: str
    coordination_duties: str
    authorized_movements: str
    staff_duties: str
    collaborative_planning_times_locations: str
    commanders_critical_information_requirements: str
    additional_information: str


class OPERATIONAL_SAFETY_STANDARDS(BaseModel):
    force_protection_protocols: str


# ---- canonical list ---------------------------------------------------------
# Every class above, in the NewClasses.md reading order. Loader's
# _all_phase3_schema_names() + schema-module parity pass read this tuple.
DOCUMENT_CLASSES = (
    # Doc 1 / warning_order / operation_order
    HeaderSection,
    MetadataSection,
    OperationalSituation,
    MissionAndExecution,
    SustainmentAndCoordination,
    Annexes,
    # Doc 2 / staff_brief / staff_estimate
    INTELLIGENCE_ESTIMATE,
    OPERATIONS_ESTIMATE,
    PERSONNEL_ESTIMATE,
    LOGISTICS_ESTIMATE,
    # Doc 3 / time_analysis
    MISSION_TIMELINE,
    CURRENT_TIME_REFERENCE,
    # Doc 4 / initial_planning_guidance
    INITIAL_PLAN_TIMELINE,
    CURRENT_TIME_REFERENCE_2,
    PLANNING_DIRECTIVES,
    OPERATIONAL_SAFETY_STANDARDS,
)
