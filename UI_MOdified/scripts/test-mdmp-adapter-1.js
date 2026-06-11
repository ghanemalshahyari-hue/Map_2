#!/usr/bin/env node
/**
 * MDMP-EXTERNAL-1 / G-2 — adapter tests (build contract: docs/coa-wargame-design.md).
 *
 *   • Placeholder TEMPLATE fixtures (devtools/fixtures/mdmp-external/) must
 *     yield a brief with ZERO narrative content — everything lands in
 *     missing_information / ambiguities (no-invention proof).
 *   • A FILLED sample (realistic Arabic values on the same keys) must map:
 *     step3 → 2 BLUE COAs + force_comparison (sides correct),
 *     step4 → wargame_turns[] action/reaction/counteraction + RED ML COA,
 *     step5 → evaluation + recommendation (decided_by OPERATOR-ONLY = null),
 *     suffix families (<k>/<k>2/<k>_2/<k>_c2) → COA 2,
 *     citations {file, keys[]} on every populated field.
 *   • D9 locked COA fields always present.
 *
 * Pure static test — no server, no LLM. Run:
 *   node UI_MOdified/scripts/test-mdmp-adapter-1.js
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const ADAPTER = require(path.join('..', 'server', 'ai', 'mdmp-external-adapter'));
const B = require(path.join('..', 'server', 'ai', 'operational-brief'));
const { parseJsonc } = require(path.join('..', 'server', 'ai', 'jsonc'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const FIX = path.join(__dirname, '..', 'devtools', 'fixtures', 'mdmp-external');
function fixture(name) { return parseJsonc(fs.readFileSync(path.join(FIX, name), 'utf8')).value; }

// ── FILLED samples (realistic values on the real external keys) ─────
const STEP3_FILLED = {
    Our_available_forces: 'لواء مشاة آلي معزز بكتيبة دبابات وكتيبتي مدفعية ميدان.',
    Enemy_forces_available: 'لواء مشاة بحري معزز بسرية دبابات خفيفة.',
    Infantry_Battalion_total_our:   { count: 3, unit_type: 'كتائب', weight: 1.0 },
    Infantry_Battalion_total_enemy: { count: 2, unit_type: 'كتائب', weight: 0.8 },
    Units_of_Tanks_armor_total_our:   { count: 1, unit_type: 'كتائب', weight: 1.0 },
    Units_of_Tanks_armor_total_enemy: { count: 0, unit_type: 'كتائب', weight: 0 },
    The_combat_doctrine_of_our_forces: 'دفاعية',
    The_combat_doctrine_of_enemy_forces: 'هجومية',
    Strengths_and_weaknesses_of_the_enemy_in_terms_of_firepower: {
        Strengths: 'مدفعية بحرية مساندة', weaknesses: 'نقص الذخيرة بعد الإبرار' },
    Strengths_and_weaknesses_of_our_forces_in_terms_of_firepower: {
        Strengths: 'مدفعية ميدان متمركزة', weaknesses: 'محدودية الإسناد الجوي' },
    // COA 1
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
    // COA 2 (suffix family <k>2)
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
    // COA 2 (suffix family <k>_2)
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
const D9_FIELDS = ['id', 'name', 'side', 'intent', 'phases', 'unit_tasking', 'wargame_turns',
    'expected_enemy_reaction', 'counteraction', 'risks', 'assumptions', 'missing_information',
    'confidence', 'needs_review', 'source_citations'];

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  MDMP-EXTERNAL-1 / G-2 — external adapter (step 3/4/5 → COAs)');
console.log('══════════════════════════════════════════════════════════════════\n');

// ── No-invention: placeholder fixtures yield ZERO content ───────────
test('placeholder fixtures → zero narrative content, gaps recorded (no-invention)', () => {
    const out = ADAPTER.adaptMdmpBundle([
        { filename: 'step3.json', data: fixture('step3.json') },
        { filename: 'step4_out.json', data: fixture('step4_out.json') },
        { filename: 'step5.json', data: fixture('step5.json') },
    ]);
    const ob = out.brief.operational_brief;
    const blue = ob.courses_of_action.filter(c => c.side === 'BLUE');
    assert(blue.length === 2, `expected 2 BLUE COAs, got ${blue.length}`);
    for (const c of blue) {
        assert(c.intent === null, c.id + ' intent must be null (placeholders)');
        assert(c.phases.length === 0, c.id + ' phases must be empty');
        assert(c.wargame_turns.length === 0, c.id + ' turns must be empty');
        assert(c.missing_information.length > 0, c.id + ' must record what is missing');
    }
    assert(!ob.courses_of_action.some(c => c.side === 'RED'), 'no RED COA from placeholder ML');
    assert(ob.coa_recommendation === null, 'no recommendation from placeholder step5');
    // No placeholder text leaked anywhere into content fields:
    const dump = JSON.stringify({ m: ob.mission, ci: ob.commander_intent, f: ob.friendly, e: ob.enemy, coas: ob.courses_of_action.map(c => ({ i: c.intent, p: c.phases, s: c.summary })) });
    assert(dump.indexOf('…') === -1 && dump.indexOf('<نص') === -1, 'placeholder glyphs leaked into content');
    assert(ob.ambiguities.length > 0, 'ambiguities roll-up expected');
});

// ── step3 → COAs + force comparison ─────────────────────────────────
test('filled step3 → 2 BLUE COAs (intent/phases/fires/risks) + force_comparison sides', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'step3.json', data: STEP3_FILLED }]);
    const ob = out.brief.operational_brief;
    const [c1, c2] = ob.courses_of_action;
    assert(c1.side === 'BLUE' && c2.side === 'BLUE', 'sides');
    assert(/تدمير قوة الإبرار/.test(c1.intent), 'COA1 intent from task');
    assert(c1.phases.length === 4 && c1.phases[0].kind === 'preparation', 'COA1 prep + 3 phases');
    assert(c2.phases.length === 4, 'COA2 phases via <k>2 suffix family');
    assert(/ع2/.test(c2.phases[1].label), 'COA2 phase text is the set-2 value');
    assert(c1.fires.length >= 2 && c1.risks.length === 1, 'COA1 fires + risk');
    const fc = ob.force_comparison;
    assert(fc && fc.categories.length === 2, 'two non-empty force categories');
    const inf = fc.categories.find(c => c.key === 'infantry_battalions');
    assert(inf.our.count === 3 && inf.enemy.count === 2, 'our/enemy counts on the right sides');
    assert(fc.qualitative.doctrine.our === 'دفاعية' && fc.qualitative.doctrine.enemy === 'هجومية', 'doctrine sides');
    assert(fc.strengths_weaknesses.firepower.our.strengths.indexOf('ميدان') !== -1, 'S/W our side');
    assert(ob.friendly.summary.indexOf('لواء مشاة آلي') !== -1, 'friendly summary from Our_available_forces');
    assert(ob.enemy.summary.indexOf('بحري') !== -1, 'enemy summary from Enemy_forces_available');
});

// ── step4 → wargame turns (D5/L9 record shape) + RED ML COA ─────────
test('filled step4 → wargame_turns with action/reaction/counteraction + RED ML COA', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'step4_out.json', data: STEP4_FILLED }]);
    const ob = out.brief.operational_brief;
    const c1 = ob.courses_of_action.find(c => c.id === 'coa-blue-1');
    assert(c1.wargame_turns.length === 4, `COA1: 4 content-bearing turns expected, got ${c1.wargame_turns.length}`);
    const breach = c1.wargame_turns.find(t => /Crossing LD/.test(t.trigger.en));
    assert(breach, 'breaching turn present');
    assert(/ثغرتين/.test(breach.action.what) && breach.action.side === 'BLUE', 'action beat');
    assert(/إغلاق الثغرات/.test(breach.reaction.what) && breach.reaction.side === 'RED', 'reaction beat');
    assert(/ثغرة ثالثة/.test(breach.counteraction.what), 'counteraction beat');
    // D2: adjudication NEVER pre-filled; D5 record fields present.
    assert(breach.white_decision.decision === null && breach.white_decision.decided_by === null, 'white_decision empty');
    assert(breach.result.state_delta === null, 'result empty');
    assert(Array.isArray(breach.affected_units) && breach.confidence === 'low' && breach.needs_review === true, 'D5 fields');
    assert(breach.source_citations[0].keys.length === 3, 'turn cites its 3 source keys');
    // RED ML COA (D3) — and most-dangerous NOT invented.
    const red = ob.courses_of_action.find(c => c.side === 'RED');
    assert(red && /الشاطئ الغربي/.test(red.intent), 'RED ML COA from Most_likely_enemy_action');
    assert(red.missing_information.some(m => /Most Dangerous/.test(m)), 'MD flagged as missing, not invented');
    assert(/الشاطئ الغربي/.test(c1.expected_enemy_reaction), 'COA1 expected_enemy_reaction');
    assert(c1.counteraction, 'COA-level counteraction summary set');
    // COA2 via <k>_2 family:
    const c2 = ob.courses_of_action.find(c => c.id === 'coa-blue-2');
    assert(c2.wargame_turns.length === 1 && /ع2/.test(c2.wargame_turns[0].action.what), 'COA2 turn via _2 family');
});

// ── step5 → evaluation + recommendation (operator-only decision) ────
test('filled step5 → evaluation criteria + recommendation; decided_by stays null', () => {
    const out = ADAPTER.adaptMdmpBundle([{ filename: 'step5.json', data: STEP5_FILLED }]);
    const ob = out.brief.operational_brief;
    const [c1, c2] = ob.courses_of_action;
    assert(c1.evaluation && c1.evaluation.criteria.attacking_cog.strengths.indexOf('مركز ثقل') !== -1, 'COA1 criteria');
    assert(c1.evaluation.conclusion.indexOf('أسرع') !== -1, 'COA1 conclusion');
    assert(c2.evaluation.criteria.attacking_cog.strengths.indexOf('ع2') !== -1, 'COA2 criteria via _c2 family');
    assert(ob.coa_recommendation && /الإسناد الجوي/.test(ob.coa_recommendation.rationale), 'recommendation rationale');
    assert(ob.coa_recommendation.decided_by === null && ob.coa_recommendation.recommended_id === null,
        'D9: decided_by/recommended_id are OPERATOR-ONLY — adapter must leave null');
});

// ── bundle: 3+4+5 → ONE brief, citations, D9 shape, understanding ───
test('bundle(step3+4+5) → ONE brief: 2 BLUE + 1 RED ML, turns attached, citations per field', () => {
    const out = ADAPTER.adaptMdmpBundle([
        { filename: 'step3.json', data: STEP3_FILLED },
        { filename: 'step4_out.json', data: STEP4_FILLED },
        { filename: 'step5.json', data: STEP5_FILLED },
    ]);
    const ob = out.brief.operational_brief;
    assert(ob.courses_of_action.length === 3, `expected 3 COAs (2 BLUE + RED ML), got ${ob.courses_of_action.length}`);
    const c1 = ob.courses_of_action[0];
    assert(c1.phases.length === 4 && c1.wargame_turns.length === 4 && c1.evaluation, 'COA1 carries all three stages');
    for (const f of D9_FIELDS) assert(f in c1, 'D9 field missing: ' + f);
    assert(Array.isArray(c1.unit_tasking) && c1.unit_tasking.length === 0, 'unit_tasking scaffold (G-4 fills)');
    const files = c1.source_citations.map(c => c.file).sort();
    assert(files.indexOf('step3.json') !== -1 && files.indexOf('step4_out.json') !== -1 && files.indexOf('step5.json') !== -1,
        'COA1 cites all three source files');
    assert(out.report.steps_present.length === 3 && out.report.recommendation_present === true, 'report');
    // understanding payload surfaces the COA summary (G-3 panel input):
    const u = B.understandingFromBrief(out.brief);
    assert(Array.isArray(u.coas) && u.coas.length === 3 && u.coas[0].turns === 4, 'understanding.coas summary');
    assert(u.coa_recommendation && u.coa_recommendation.decided_by === null, 'understanding carries recommendation');
});

// ── normalizeBrief round-trip keeps the COA layer ───────────────────
test('normalizeBrief preserves courses_of_action / force_comparison / coa_recommendation', () => {
    const out = ADAPTER.adaptMdmpBundle([
        { filename: 'step3.json', data: STEP3_FILLED },
        { filename: 'step4_out.json', data: STEP4_FILLED },
        { filename: 'step5.json', data: STEP5_FILLED },
    ]);
    const nb = B.normalizeBrief(out.brief);
    const ob = nb.operational_brief;
    assert(ob.courses_of_action.length === 3, 'COAs survive normalize');
    assert(ob.force_comparison && ob.force_comparison.categories.length === 2, 'force_comparison survives');
    assert(ob.coa_recommendation && ob.coa_recommendation.decided_by === null, 'recommendation survives');
});

// ── placeholder predicate sanity ────────────────────────────────────
test('isPlaceholder: template markers yes, real Arabic text no', () => {
    for (const p of ['<نص المرحلة>', '…generated text…', '...', '…', 'يصدر لاحقاً', '', null]) {
        assert(ADAPTER.isPlaceholder(p) === true, JSON.stringify(p) + ' should be placeholder');
    }
    for (const r of ['تدمير قوة الإبرار المعادية.', 'الدفاع عن المحور رقم 2', 'A real english sentence.']) {
        assert(ADAPTER.isPlaceholder(r) === false, JSON.stringify(r) + ' should be real content');
    }
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
