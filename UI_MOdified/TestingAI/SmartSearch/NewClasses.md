# NewClasses — Military-Doctrine Mirror of the Old Health Schemas

> **Status (2026-04-23, §C21):** *Reference-only*, per scoping §C13.  Real
> Pydantic schemas live in **one consolidated file**:
> [`graph/generation/schema/schemas.py`](graph/generation/schema/schemas.py).
> The four legacy per-document modules (`time_analysis.py`,
> `initial_planning_guidance.py`, `opord.py`, `staff_estimate.py`) are
> now thin re-export shims pointing at that single file.  Arabic labels
> live in [`graph/generation/schema/field_catalog.py`](graph/generation/schema/field_catalog.py);
> drafting prompts live in [`graph/generation/prompts_ar.py`](graph/generation/prompts_ar.py).
> This file continues to preserve the 1-to-1 field layout from the user's
> old health `prompt.txt` so the rename-only port can be diffed at review
> time.  Do not "improve" the idioms here.
>
> **v1 scope (§C21, 2026-04-23) ships FOUR documents**:
> 1. **Time Analysis** (تحليل الوقت) — uses `MISSION_TIMELINE` +
>    `CURRENT_TIME_REFERENCE`.
> 2. **Initial Planning Guidance** (دليل التخطيط الأولي) — uses
>    `INITIAL_PLAN_TIMELINE` + `CURRENT_TIME_REFERENCE_2` +
>    `PLANNING_DIRECTIVES` + `OPERATIONAL_SAFETY_STANDARDS`.
> 3. **Warning Order** (الأمر الإنذاري) — NEW; mapped-only (zero LLM
>    calls); reuses a subset of the OPORD classes below: `HeaderSection`
>    + `MetadataSection` + `OperationalSituation` + `MissionAndExecution`
>    + `Annexes`.  Template: `templates/warning_order.yaml`.
> 4. **Staff Brief** (إيجاز هيئة الركن) — NEW; Step-1 running-estimate
>    brief; reuses `INTELLIGENCE_ESTIMATE` + `OPERATIONS_ESTIMATE` +
>    `PERSONNEL_ESTIMATE` + `LOGISTICS_ESTIMATE`.  Template:
>    `templates/staff_brief.yaml`.  Fields not knowable at Step 1 (e.g.
>    personnel / logistics estimates, enemy tactics phases) are marked
>    `static: "يُصدر لاحقاً"` in the YAML; Step-1-supportable fields
>    (enemy composition / disposition / strength / MLCOA / main-effort
>    tasks / combat effectiveness / running-estimate conclusions) are
>    `retrieved` against doctrine.
>
> The full OPORD and the full Steps 2–6 Staff Estimate still carry
> `v1_scope: false` on their YAMLs and stay deferred to v2 (§C17).
>
> **Zero net-new Pydantic classes or fields were introduced by §C21.**
> The two new v1 documents reuse the class sets below verbatim.
>
> **Purpose.** These Pydantic class signatures intentionally mirror the old
> `prompt.txt` (health-emergency) schemas one-for-one, but the names,
> descriptions, and examples are re-anchored to the **US Army MDMP doctrine
> corpus that Phase 1 has already ingested**.  Under §C17 + §C19 the corpus
> is four MDMP-focused manuals — **FM 6-0 (Commander and Staff Organization
> and Operations), FM 5-0 (Planning and Orders Production), ADP 5-0 (The
> Operations Process), ADP 2-0 (Intelligence)** — ingested as a single flat
> corpus into the collection `ingest__doctrine__bgem3` under
> `inputs/doctrine/`.  Qdrant state after the §C19 OCR-retry rescue of
> ADP 2-0: 2 398 total points (FM-5-0 = 1 145, FM-6-0 = 678, ADP-5-0 = 342,
> ADP-2-0 = 233).  The earlier 21-manual tactics corpus (FM 3-0, FM 3-90,
> ADP 3-0, ATP 3-21-8, etc.) is archived at
> `/Users/hextechkraken/Desktop/NatoDocs/` outside the repo — see §C17.
>
> **Collection-scope design note.** Phase 3 queries exactly one
> doctrine collection (`ingest__doctrine__bgem3`). Per-manual narrowing
> is expressed at retrieval time via a `source_doc` filter allowlist
> inside that single collection, never by splitting doctrine into one
> collection per FM. Domain isolation (a future medical-emergency
> corpus, a future policy corpus, etc.) is expressed by creating a
> separate collection at ingest time — one collection per DOMAIN, not
> per manual.
>
> **v1 scope reminder (§C17 + §C21).** v1 now ships FOUR documents (see
> the §C21 block above): Time Analysis, Initial Planning Guidance,
> Warning Order, Staff Brief. OPORD and the full Staff Estimate sit in
> this file as a full reference (and in `templates/*.yaml` +
> `graph/generation/schema/schemas.py`) but carry `v1_scope: false` at
> the template level and are deferred to v2. Do not delete the OPORD /
> Staff-Estimate sections below; they are the v2 starting point AND
> the shared class source for the two new v1 documents.
>
> **Why this mirror exists.** The four documents being generated are
> structurally identical across domains — an Operation Order, a Staff
> Estimate, a Time-Analysis product, and an Initial Planning Guidance /
> WARNO. The health version was the same MDMP skeleton in civilian clothes.
> This file keeps the **exact same field layout as the old file** so the
> Phase 3 generator can be validated against the military corpus first,
> then the user can swap class/field descriptions back to health terminology
> and the pipeline keeps working unchanged.
>
> **Format is deliberately identical** to the old `prompt.txt`:
> Python BaseModel classes with Arabic field `description`s and `examples`,
> separated by `#### SECOND DOCUMENT ####` markers. Do not "improve" the
> Pydantic idioms here — the whole point is drop-in shape-compatibility.
> The Phase 3 scoping doc will decide how these classes are actually
> consumed (kind-taxonomy, YAML template, retrieval groups, renderer).

---

## Document 1 — أمر العمليات (Operation Order / OPORD)

```python
class HeaderSection(BaseModel):  # قسم الرأس العام للأمر
    header: str = Field(description="السطر الأول لرأس الأمر مكتوباً بالعربية", examples=["نسخة رقم () إلى ()"])
    organization: str = Field(description="السطر الثاني — القيادة المُصدِرة بالعربية", examples=["القوات البرية"])
    department: str = Field(description="السطر الثالث — التشكيل الرئيسي بالعربية", examples=["الفرقة المدرعة الأولى"])
    unit: str = Field(description="السطر الرابع — الوحدة المنفذة بالعربية", examples=["اللواء الأول - المشاة الميكانيكية"])
    assembly_area: str = Field(description="موقع مركز العمليات (TOC) مكتوباً بالعربية", examples=["إحداثي (Q T 12345 67890)"])


class MetadataSection(BaseModel):  # البيانات الوصفية والمرجعية
    date_time: str = Field(description="التاريخ والوقت لبدء تنفيذ الأمر", examples=["تتحرك الوحدات اعتباراً من الساعة 0600 يوم ي"])
    letter_ref_number: str = Field(description="الرقم المرجعي للأمر (مثال: أ.ع/1/2/2026)", examples=["رقم المُصدِر أ.ع/2/1"])
    warning_order_ref_number: str = Field(description="رقم أمر التحذير الأصلي", examples=["أمر تحذير رقم (أضف الرقم)"])
    references: str = Field("FM 3-0 Operations، FM 3-90 Tactics، ADP 6-0 Mission Command، ADP 3-0 Operations")
    maps: str = Field(description="الخرائط المستخدمة", examples=["مثال: خريطة استراتيجية (مقياس 1:50,000) وخريطة تكتيكية (مقياس 1:100,000)"])
    task_organization: str = Field(description="التنظيم للمهمة (Task Organization)", examples=["يُصدر لاحقاً في الملحق (أ)"])
    time_zone: str = Field(description="التوقيت المحلي للعملية (مثال: UTC+3 الرياض)")


class OperationalSituation(BaseModel):  # الفقرة (1) الموقف
    situation_summary: str = Field(description="الموقف العام والسياق التشغيلي", examples="تواصل قوات العدو الضغط في المحور الشمالي وتحاول الاستيلاء على الأرض الحاكمة")
    area_of_interest: str = Field(description="منطقة الاهتمام (Area of Interest)", examples="")
    area_of_operations: str = "كما في شفاف العمليات — الملحق (م)."
    terrain: str = Field(description="طبيعة الأرض (OAKOC / OCOKA)", examples="كما في تقدير الاستخبارات — الملحق (أ).")
    weather: str = Field(description="الطقس وتأثيره على العمليات", examples="كما في تقدير الاستخبارات — الملحق (أ).")
    civil_considerations: str = ()
    enemy_profile: str = Field(description="تشكيل قوات العدو، توزيعه وقوته", examples="كما في تقدير الاستخبارات — الملحق (أ).")


class MissionAndExecution(BaseModel):  # الفقرتان (2) المهمة و (3) التنفيذ
    task_units: str = Field(description="", examples="")
    mission: str = Field(description="بيان المهمة كما ورد تحت مهمة وقصد القائد", examples="اكتب التالي: ستتولى قيادة اللواء الهجوم الساعة 0700 يوم 27/10/2026 للاستيلاء على المحور الشمالي")
    objective: str = Field("الغرض فقط", examples="اكتب التالي: حرمان العدو من حرية الحركة في المحور الشمالي")
    method: str = Field("الطريقة فقط", examples="اكتب التالي: ستنفذ الوحدة هجوماً متفوقاً عبر الجهد الرئيسي مع إسناد ناري مركّز")
    desired_end_state: str = Field("النهاية المرغوبة فقط", examples="اكتب التالي: . تم تدمير قوات العدو في منطقة الهدف وتأمين الأرض الحاكمة")
    higher_unit_mission: str = Field("")
    civil_military_operations: str = Field("")
    interagency_coordination: str = Field("")
    host_nation_coordination: str = Field("")
    ngo_io_coordination: str = Field("")
    attached_detached_units: str = Field("")
    planning_assumptions: str = Field("")
    ground_component_mission: str = Field("")
    execution_purpose: str = Field("")
    concept_of_operations: str = Field("")
    subordinate_unit_tasks: str = Field("")
    combat_support_tasks: str = Field()
    execution_timeline: str = Field()
    commanders_critical_information_requirements: str = Field()


class SustainmentAndCoordination(BaseModel):  # الفقرتان (4) الإسناد و (5) القيادة والإشارة
    fire_support_coordination: str = Field("")
    air_support_coordination: str = Field("")
    risk_assessment: str = Field("")
    rules_of_engagement: str = Field("")
    media_and_information_operations: str = Field("")
    coordination_meetings: str = Field("")
    execution_priorities: str = Field("")
    movement_order: str = Field("")
    sustainment_paragraph: str = Field("")
    command_and_signal: str = Field("")


class Annexes(BaseModel):  # الملاحق والشفافيات
    appendices: str = Field("")
    overlays: str = Field("")
```

########################################################
SECOND DOCUMENT — تقديرات هيئة الركن (Staff Estimates)
########################################################

```python
class INTELLIGENCE_ESTIMATE(BaseModel):  # تقدير الاستخبارات (G2/S2)
    terrain: str = Field(description="تحليل الأرض (OAKOC/OCOKA)", examples=[""])
    weather: str = Field(description="أثر الطقس على العمليات", examples=[""])
    first_light: str = Field(description="أول ضوء (BMNT)", examples=[""])
    last_light: str = Field(description="آخر ضوء (EENT)", examples=[""])
    moon_phase: str = Field(description="طور القمر والإضاءة", examples=[""])
    effect_of_environment_on_operations: str = Field(description="ابدأ هذا الحقل بقول 'لا يوجد أي تأثير كبير على العمليات من البيئة.' ثم أضف جميع القيود التشغيلية.")
    enemy_composition: str = Field(description="تشكيل قوات العدو (Composition)", examples=[""])
    enemy_disposition: str = Field(description="توزيع قوات العدو جغرافياً (Disposition)", examples=[""])
    enemy_strength: str = Field(description="قوة العدو (Strength)", examples=[""])
    enemy_readiness: str = Field(description="جاهزية قوات العدو", examples=[""])
    enemy_training: str = Field(description="مستوى تدريب العدو", examples=[""])
    recent_and_ongoing_activities: str = Field(description="النشاطات الأخيرة والجارية للعدو", examples=[""])
    enemy_tactics_phase1_preparation: str = Field(description="تكتيكات العدو في مرحلة التحضير (Shape/Prepare)", examples=[""])
    enemy_tactics_phase2_shaping: str = Field(description="تكتيكات العدو في مرحلة التشكيل (Shaping)", examples=[""])
    enemy_tactics_phase3_decisive: str = Field(description="تكتيكات العدو في المرحلة الحاسمة (Decisive)", examples=[""])
    enemy_most_likely_coa: str = Field(description="أكثر مسارات عمل العدو احتمالاً (Most Likely COA)", examples=[""])
    counter_intel_observations: str = Field(description="ملاحظات الاستخبارات المضادة وقدرات العدو", examples=[""])


class OPERATIONS_ESTIMATE(BaseModel):  # تقدير العمليات (G3/S3)
    higher_unit_mission: str = Field(description="مهمة القيادة الأعلى كما وردت تحت مهمة وقصد القائد", examples="اكتب التالي: ستتولى قيادة الفرقة الهجوم الساعة 0700 يوم 27/10/2026 في المحور الشمالي")
    higher_unit_purpose: str = Field("الغرض فقط", examples="اكتب التالي: حرمان العدو من حرية الحركة في المحور الشمالي")
    higher_unit_method: str = Field("الطريقة فقط", examples="اكتب التالي: ستنفذ الفرقة هجوماً مزدوج المحاور مع إسناد ناري مركّز")
    higher_unit_end_state: str = Field("النتيجة المرجوة فقط", examples="اكتب التالي: . تم تدمير قوات العدو في منطقة الهدف وتأمين الأرض الحاكمة")
    own_unit_mission: str = Field("")
    own_unit_purpose: str = Field("")
    main_effort_tasks: str = Field("", examples="اكتب التالي: (أ) و (ب)")
    own_unit_end_state: str = Field("اكتب الحقل desired_end_state في هذا الحقل")
    ground_component_force: str = Field("")
    attached_supporting_units: str = Field("")
    force_composition: str = Field("")
    training_readiness_level: str = Field("")
    combat_effectiveness: str = Field("")
    operations_conclusions: str = Field("")


class PERSONNEL_ESTIMATE(BaseModel):  # تقدير الموارد البشرية (G1/S1)
    force_coverage: str = Field("")
    # force_coverage: str = Field(description="اذكر تغطية القوات من فقرة متطلبات المعلومات عن الوحدات", examples=[""]),
    morale: str = Field("اذكر معنويات القوات")
    reinforcements: str = Field("يُصدر لاحقاً.")
    projected_casualties: str = Field("يُصدر لاحقاً.")
    control_and_coordination: str = Field("حسب الإجراءات العملياتية الثابتة (SOP).")
    pows_detainees: str = Field("تتبع التعليمات الصادرة في بروتوكولات التعامل مع أسرى الحرب والمحتجزين.")
    civilian_refugees: str = Field("يتم التعامل مع المدنيين النازحين وفقاً للإرشادات الصادرة بذلك.")
    civilian_detainees: str = Field("يتم التنسيق مع الجهات المختصة للتعامل مع المحتجزين المدنيين.")
    personnel_conclusions: str = Field(description="", examples=["يُتوقع وجود حركة نازحين كبيرة باتجاه المدينة وتحتاج إلى تنسيق مع القوات الأمنية للسيطرة على حركتهم وتوفير المأوى لهم، ولا يوجد أي تأثير من وجهة نظر الموارد البشرية على العمليات"])


class LOGISTICS_ESTIMATE(BaseModel):  # تقدير الإسناد اللوجستي (G4/S4)
    subsistence_class_i: str = Field("يُصدر لاحقاً")
    general_sustainment: str = Field("يُصدر لاحقاً")
    pol_class_iii: str = Field("يُصدر لاحقاً")
    ammunition_class_v: str = Field("يُصدر لاحقاً")
    repair_parts_class_ix: str = Field("يُصدر لاحقاً")
    equipment_and_engineer_materiel: str = Field("يُصدر لاحقاً")
    transportation: str = Field("يُصدر لاحقاً")
    maintenance: str = Field("يُصدر لاحقاً")
    medical_support_class_viii: str = Field("يُصدر لاحقاً")
    logistics_conclusions: str = Field("يُصدر لاحقاً")
```

###################################
THIRD DOCUMENT — تحليل الوقت (Time Analysis / 1:3 Rule)
###################################

```python
class MISSION_TIMELINE(BaseModel):  # الإطار الزمني للمهمة
    current_date: str = Field(description="التاريخ الحالي", examples=[""])
    mission_start_time: str = Field(description="وقت بدء المهمة (T₀ / H-Hour)", examples=[""])
    total_available_time: str = Field(description="إجمالي الوقت المتاح قبل بدء المهمة", examples=[""])
    allocated_planning_time: str = Field(description="total available time ÷ 3 (قاعدة الثلث والثلثين)", examples=["15÷3=5 ساعة"])
    available_time_for_subordinate_units: str = Field(description="الوقت المتاح للوحدات الفرعية = (الإجمالي × 2/3)", examples=[""])
    time_for_mission_receipt_analysis: str = Field(description="write the allocated_planning_time times 30%", examples=["100×30%=30 ساعة"])
    time_for_coa_development: str = Field(description="write the allocated_planning_time times 20%", examples=["100×20%=20 ساعة"])
    time_for_coa_analysis_comparison: str = Field(description="write the allocated_planning_time times 30%", examples=["100×30%=30 ساعة"])
    time_for_plan_order_production: str = Field(description="write the allocated_planning_time times 20%", examples=["100×20%=20 ساعة"])


class CURRENT_TIME_REFERENCE(BaseModel):  # الوقت الحالي
    time_now: str = Field("description, examplesساعة")
```

##################################
FOURTH DOCUMENT — دليل التخطيط الأولي (Initial Planning Guidance / WARNO)
##################################

```python
class INITIAL_PLAN_TIMELINE(BaseModel):  # إصدار دليل التخطيط الأولي - الجدول الزمني
    current_date: str = Field(description="", examples=[""])
    mission_start_time: str = Field(description="وقت بدء المهمة (T₀)", examples=[""])
    total_available_time: str = Field(description="", examples=[""])
    allocated_planning_time: str = Field(description="total available time divided by 3", examples=["15÷3=5 ساعة"])
    available_time_for_subordinate_units: str = Field(description="", examples=[""])
    time_for_mission_receipt_analysis: str = Field(description="write the allocated_planning_time times 30%", examples=["100×30%=30 ساعة"])
    time_for_coa_development: str = Field(description="write the allocated_planning_time times 20%", examples=["100×20%=20 ساعة"])
    time_for_coa_analysis_comparison: str = Field(description="write the allocated_planning_time times 30%", examples=["100×30%=30 ساعة"])
    time_for_plan_order_production: str = Field(description="write the allocated_planning_time times 20%", examples=["100×20%=20 ساعة"])


class CURRENT_TIME_REFERENCE_2(BaseModel):  # الوقت الحالي (للتخطيط الأولي)
    time_now: str = Field("description, examplesساعة")


class PLANNING_DIRECTIVES(BaseModel):  # إجراءات التخطيط الأولي
    report_production: str = Field("")
    coordination_duties: str = ("")
    authorized_movements: str = Field("")
    staff_duties: str = Field("")
    collaborative_planning_times_locations: str = Field("")
    commanders_critical_information_requirements: str = Field("")
    additional_information: str = Field("")


class OPERATIONAL_SAFETY_STANDARDS(BaseModel):  # معايير السلامة وحماية القوة
    force_protection_protocols: str = Field("")
```

---

## Field-by-field mapping back to the old `prompt.txt`

Kept inline so the user can swap back to the health domain later without
re-deriving the correspondence.

| Old (health)                                          | New (doctrine)                                        |
|-------------------------------------------------------|-------------------------------------------------------|
| `HeaderSection`                                       | `HeaderSection` (same)                                |
| `MetadataSection.alert_ref_number`                    | `MetadataSection.warning_order_ref_number`            |
| `EpidemiologicalSituation`                            | `OperationalSituation`                                |
| `.environmental_conditions`                           | `.terrain`                                            |
| `.disease_profile`                                    | `.enemy_profile`                                      |
| `ResponseStrategy`                                    | `MissionAndExecution`                                 |
| `.response_teams`                                     | `.task_units`                                         |
| `.community_engagement`                               | `.civil_military_operations`                          |
| `.red_crescent`                                       | `.ngo_io_coordination`                                |
| `.field_teams_duties`                                 | `.subordinate_unit_tasks`                             |
| `.support_units_duties`                               | `.combat_support_tasks`                               |
| `.critical_information_requirements`                  | `.commanders_critical_information_requirements`       |
| `ImplementationPlan.medical_supply_coordination`      | `SustainmentAndCoordination.fire_support_coordination`|
| `.air_medical_coordination`                           | `.air_support_coordination`                           |
| `.public_health_risks`                                | `.risk_assessment`                                    |
| `.response_protocols`                                 | `.rules_of_engagement`                                |
| `.media_and_messaging`                                | `.media_and_information_operations`                   |
| `.logistics_and_sustainment`                          | `.sustainment_paragraph`                              |
| `.leadership_and_coordination`                        | `.command_and_signal`                                 |
| `SupportingMaterials.viewports`                       | `Annexes.overlays`                                    |
| `EPIDEMIOLOGICAL_BRIEF`                               | `INTELLIGENCE_ESTIMATE`                               |
| `.disease_classification / geographic_distribution / spread_coverage` | `.enemy_composition / enemy_disposition / enemy_strength` |
| `.team_readiness / training_level`                    | `.enemy_readiness / enemy_training`                   |
| `.disease_transmission_phaseN`                        | `.enemy_tactics_phaseN_*`                             |
| `.future_trends_and_risks`                            | `.enemy_most_likely_coa`                              |
| `RESPONSE_STRATEGY` (staff)                           | `OPERATIONS_ESTIMATE`                                 |
| `.joint_response_*`                                   | `.higher_unit_*`                                      |
| `.execution_command_*`                                | `.own_unit_*`                                         |
| `.health_response_force / attached_support_teams`     | `.ground_component_force / attached_supporting_units` |
| `.team_composition`                                   | `.force_composition`                                  |
| `.operational_effectiveness`                          | `.combat_effectiveness`                               |
| `HUMAN_RESOURCES`                                     | `PERSONNEL_ESTIMATE`                                  |
| `.team_coverage / team_morale`                        | `.force_coverage / morale`                            |
| `.coordination_and_communication`                     | `.control_and_coordination`                           |
| `.isolated_patients`                                  | `.pows_detainees`                                     |
| `.suspected_civilians / confirmed_and_quarantined`    | `.civilian_refugees / civilian_detainees`             |
| `SUPPLY_CHAIN`                                        | `LOGISTICS_ESTIMATE`                                  |
| `.nutritional_supplies`                               | `.subsistence_class_i`                                |
| `.logistical_sustainment`                             | `.general_sustainment`                                |
| `.fuel`                                               | `.pol_class_iii`                                      |
| `.medical_supplies`                                   | `.ammunition_class_v`                                 |
| `.spare_parts`                                        | `.repair_parts_class_ix`                              |
| `.medical_equipment`                                  | `.equipment_and_engineer_materiel`                    |
| `.field_clinics`                                      | `.medical_support_class_viii`                         |
| `RESPONSE_TIMELINE / INITIAL_RESPONSE_PLAN_TIMELINE`  | `MISSION_TIMELINE / INITIAL_PLAN_TIMELINE`            |
| `.response_start_time`                                | `.mission_start_time`                                 |
| `.available_time_for_response_teams`                  | `.available_time_for_subordinate_units`               |
| `.time_for_situation_assessment`                      | `.time_for_mission_receipt_analysis`                  |
| `.time_for_response_development`                      | `.time_for_coa_development`                           |
| `.time_for_analysis_and_comparison`                   | `.time_for_coa_analysis_comparison`                   |
| `.time_for_plan_finalization`                         | `.time_for_plan_order_production`                     |
| `PLANNING_DIRECTIVES.times_locations_planning`        | `.collaborative_planning_times_locations`             |
| `.information_requirements`                           | `.commanders_critical_information_requirements`       |
| `MEDICAL_AND_SAFETY_STANDARDS.medical_safety_protocols`| `OPERATIONAL_SAFETY_STANDARDS.force_protection_protocols` |

Swap direction is symmetric: rename right-column fields to left-column
names and the same generator runs against the health corpus.
