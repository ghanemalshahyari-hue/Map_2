#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / G-3 — regenerate sample-coa.json for the COA-panel
 * verify harness (verify-coa.html).
 *
 * Runs the REAL G-2 adapter over realistic filled step3/4/5 samples (same
 * shapes as scripts/test-mdmp-adapter-1.js) and writes the payload in the
 * exact shape POST /api/wargame-sim/analyze returns for a bundle — so the
 * harness renders production data, not hand-written mock JSON.
 *
 *   node UI_MOdified/devtools/fixtures/doc-understanding/make-sample-coa.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ADAPTER = require(path.join(__dirname, '..', '..', '..', 'server', 'ai', 'mdmp-external-adapter'));
const BRIEF = require(path.join(__dirname, '..', '..', '..', 'server', 'ai', 'operational-brief'));

const STEP3_FILLED = {
    Our_available_forces: 'لواء مشاة آلي معزز بكتيبة دبابات وكتيبتي مدفعية ميدان.',
    Enemy_forces_available: 'لواء مشاة بحري معزز بسرية دبابات خفيفة.',
    Infantry_Battalion_total_our:   { count: 3, unit_type: 'كتائب', weight: 1.0 },
    Infantry_Battalion_total_enemy: { count: 2, unit_type: 'كتائب', weight: 0.8 },
    Units_of_Tanks_armor_total_our:   { count: 1, unit_type: 'كتائب', weight: 1.0 },
    Units_of_Tanks_armor_total_enemy: { count: 0, unit_type: 'كتائب', weight: 0 },
    The_combat_doctrine_of_our_forces: 'دفاعية',
    The_combat_doctrine_of_enemy_forces: 'هجومية',
    task: 'تدمير قوة الإبرار المعادية ومنع توسيع رأس الشاطئ.',
    commander_intent: 'كسر زخم الهجوم على الشاطئ ثم هجوم مضاد محدود.',
    main_duties: 'الدفاع الأمامي، تأمين المحور الساحلي، الاحتفاظ بالاحتياط.',
    desired_end_state: 'العدو مدمَّر أو منسحب ورأس الشاطئ غير صالح للإمداد.',
    critical_operations: 'منع فتح مخارج الشاطئ.',
    Reserve: 'كتيبة دبابات في العمق كاحتياط.',
    phose_one: 'المرحلة الأولى: إشغال العدو بالنيران بعيدة المدى.',
    phose_two: 'المرحلة الثانية: الدفاع الثابت على المخارج.',
    phose_three: 'المرحلة الثالثة: هجوم مضاد على الجناح الغربي.',
    Boot_operations: 'أعمال تمهيدية: استطلاع ومراقبة الشواطئ.',
    Artillery: 'مهمة المدفعية: عزل منطقة الإنزال.',
    Artillery_fires_phose_one: 'نيران المرحلة الأولى على زوارق الإنزال.',
    Acceptance_of_packaging_risk: 'قبول مخاطرة كشف الجناح الشرقي مؤقتاً.',
    Operations_and_maintenance: 'إدامة عبر محور الإمداد الجنوبي.',
    phose_one2: 'المرحلة الأولى (ع2): دفاع متحرك بالقطعات الآلية.',
    phose_two2: 'المرحلة الثانية (ع2): استنزاف العدو في العمق.',
    phose_three2: 'المرحلة الثالثة (ع2): هجوم مضاد عام.',
    Boot_operations2: 'أعمال تمهيدية (ع2): إخلاء الشريط الساحلي.',
    Artillery2: 'مهمة المدفعية (ع2): نيران متحركة مع القطعات.',
    Acceptance_of_packaging_risk2: 'قبول التخلي المؤقت عن الشريط الساحلي.',
};
const STEP4_FILLED = {
    possible_operation_phase1: 'العملية الممكنة 1 - المرحلة 1: تمهيد ناري.',
    Most_likely_enemy_action: 'الأرجح أن يركز العدو إبراره على الشاطئ الغربي فجراً.',
    our_forces: 'تسلسل أعمال قواتنا: استطلاع، إشغال، دفاع، هجوم مضاد.',
    task_organization: 'التجميع للواجب: لواء 51 (+) مع كتيبة دبابات 721.',
    exposure_in_acting_assembly_area: 'انكشاف محدود في منطقة التجمع أثناء التحرك الليلي.',
    exposure_in_reaction_assembly_area: 'يرد العدو بنيران مدفعية بحرية على منطقة التجمع.',
    exposure_in_counter_action_assembly_area: 'نغير مواقع التجمع ونفعّل التمويه والإخفاء.',
    crossing_LD_and_breaching_mines_acting: 'عبور خط الانطلاق وفتح ثغرتين في حقل الألغام.',
    crossing_LD_and_breaching_mines_reaction: 'يحاول العدو إغلاق الثغرات بالنيران المركزة.',
    crossing_LD_and_breaching_mines_counter_action: 'ندفع كتيبة الهندسة لفتح ثغرة ثالثة مع دخان.',
    combat_on_objectives_acting_phase1: 'القتال على الهدف الأول بكتيبتي مشاة.',
    combat_on_objectives_reaction_phase1: 'هجوم مضاد معادٍ بسرية دبابات.',
    combat_on_objectives_counter_action_phase1: 'صد الهجوم بصواريخ م/د من الأجناب.',
    transition_to_defense_acting: 'التحول إلى الدفاع بعد تأمين الهدف.',
    Most_likely_enemy_action_2: 'الأرجح (ع2) أن يوسع العدو رأس الشاطئ شرقاً.',
    exposure_in_acting_assembly_area_2: 'انكشاف (ع2) أقل بسبب التجمع المشتت.',
    exposure_in_reaction_assembly_area_2: 'رد العدو (ع2) بطائرات مسيرة مسلحة.',
    exposure_in_counter_action_assembly_area_2: 'مضاد (ع2): دفاع جوي قصير المدى مرافق.',
};
const STEP5_FILLED = {
    possible_operation_1: 'العمل الممكن الأول كاملاً عبر مراحله الثلاث.',
    strengths_attacking_cog: 'يهاجم مركز ثقل العدو (ممر الإمداد البحري) مباشرة.',
    weaknesses_attacking_cog: 'يتطلب تفوقاً نارياً مستمراً.',
    strengths_fire_support: 'نيران ممركزة على المخارج.',
    weaknesses_fire_support: 'استهلاك ذخيرة عالٍ.',
    conclusions_c1: 'العمل الأول أسرع حسماً وأعلى مخاطرة.',
    possible_operation_2: 'العمل الممكن الثاني كاملاً عبر مراحله الثلاث.',
    strengths_attacking_cog_c2: 'يستنزف العدو قبل الحسم (ع2).',
    weaknesses_attacking_cog_c2: 'يمنح العدو وقتاً لتثبيت رأس الشاطئ (ع2).',
    conclusions_c2: 'العمل الثاني أبطأ وأكثر أماناً.',
    overall_comparison_conclusion: 'يُرجَّح العمل الأول إذا توفر الإسناد الجوي، وإلا فالثاني.',
};

const out = ADAPTER.adaptMdmpBundle([
    { filename: 'step3.json', data: STEP3_FILLED },
    { filename: 'step4_out.json', data: STEP4_FILLED },
    { filename: 'step5.json', data: STEP5_FILLED },
]);

// Exact bundle-response shape of POST /api/wargame-sim/analyze.
const payload = {
    ok: true, kind: 'mdmp_external', bundle: true,
    steps_present: out.report.steps_present,
    requires_review: true, confidence: 'low',
    adapter: 'mdmp-external-adapter@1',
    brief: out.brief, report: out.report,
    document_set_id: out.brief.document_set_id,
    documents: out.brief.documents,
    understanding: BRIEF.understandingFromBrief(out.brief),
    llm_fill: { available: false, reason: 'External MDMP bundle adapted deterministically; LLM enrichment runs on deployment' },
};

const dest = path.join(__dirname, 'sample-coa.json');
fs.writeFileSync(dest, JSON.stringify(payload, null, 2));
console.log('wrote', dest, '· coas=' + payload.understanding.coas.length,
    '· turns(coa1)=' + payload.understanding.coas[0].turns,
    '· recommendation=' + !!payload.understanding.coa_recommendation);
