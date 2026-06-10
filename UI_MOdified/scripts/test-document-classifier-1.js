#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / Phase D — document classifier tests.
 *
 * Proves the deterministic, offline classifier labels Arabic and English
 * military documents correctly — especially الأمر الإنذاري (Phase G #2) —
 * including diacritics-insensitive matching and Mixed Operational Document
 * detection when one order spans both sides.
 *
 * Pure static test — no server, no LLM. Run:
 *   node UI_MOdified/scripts/test-document-classifier-1.js
 */
'use strict';

const path = require('path');
const C = require(path.join('..', 'server', 'ai', 'document-classifier'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── fixtures ────────────────────────────────────────────────────────
const WARNO_AR = [
    'الأمر الإنذاري رقم 3',
    'الموقف:',
    'أ. قوات العدو: لواء مشاة ميكانيكي معزز.',
    'المهمة: الاستعداد لتنفيذ هجوم على المحور الساحلي.',
    'التوقيتات: ساعة الصفر غير محددة.',
].join('\n');

// Same title carrying full harakat — must still classify after normalization.
const WARNO_AR_DIACRITICS = 'الأَمْرُ الإِنْذَارِيُّ\nالمُهِمَّةُ: الاستعداد للهجوم.';

const OPORD_EN = 'OPERATION ORDER (OPORD) No. 5\n1. SITUATION\n2. MISSION\n3. EXECUTION';
const FRAGO_EN = 'FRAGMENTARY ORDER NUMBER 2\nChanges to the base order follow.';
const INTSUM_EN = 'INTELLIGENCE SUMMARY (INTSUM)\nEnemy disposition as of 0600.';

// A full order spanning BOTH sides but with no explicit order title.
const MIXED_AR = [
    'الموقف',
    'أ. قوات العدو: كتيبة دبابات في منطقة التجمع.',
    'ب. قواتنا: لواء مشاة مدعوم بالمدفعية.',
    'المهمة: تأمين منطقة العمليات.',
    'التنفيذ: على ثلاث مراحل.',
].join('\n');

// A warning order that ALSO contains both sides (the real "one doc, both
// slots" case). Type stays warning order; both-sides flag must be true.
const WARNO_BOTH_SIDES = [
    'الأمر الإنذاري',
    'الموقف',
    'قوات العدو: لواء مدرع.',
    'قواتنا: كتيبتا مشاة.',
    'المهمة: الدفاع عن المحور الشمالي.',
].join('\n');

const GIBBERISH = 'lorem ipsum dolor sit amet consectetur adipiscing elit';

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DOC-UNDERSTANDING-1 / Phase D — document classifier');
console.log('══════════════════════════════════════════════════════════════════\n');

test('Arabic الأمر الإنذاري → warning_order (Phase G #2)', () => {
    const r = C.classifyDocument(WARNO_AR);
    assert(r.type === C.TYPES.WARNING_ORDER, `type was ${r.type}`);
    assert(r.type_label_ar === 'أمر إنذاري', `label_ar was ${r.type_label_ar}`);
    assert(r.language === 'ar', `language was ${r.language}`);
    assert(r.confidence >= 0.7, `confidence too low: ${r.confidence}`);
});

test('الأمر الإنذاري with harakat still classifies (normalization)', () => {
    const r = C.classifyDocument(WARNO_AR_DIACRITICS);
    assert(r.type === C.TYPES.WARNING_ORDER, `type was ${r.type}`);
});

test('English OPERATION ORDER (OPORD) → opord', () => {
    const r = C.classifyDocument(OPORD_EN);
    assert(r.type === C.TYPES.OPORD, `type was ${r.type}`);
    assert(r.language === 'en', `language was ${r.language}`);
});

test('FRAGMENTARY ORDER → frago', () => {
    assert(C.classifyDocument(FRAGO_EN).type === C.TYPES.FRAGO);
});

test('INTELLIGENCE SUMMARY (INTSUM) → intel_summary', () => {
    assert(C.classifyDocument(INTSUM_EN).type === C.TYPES.INTEL_SUMMARY);
});

test('untitled order spanning both sides → mixed_operational', () => {
    const r = C.classifyDocument(MIXED_AR);
    assert(r.type === C.TYPES.MIXED, `type was ${r.type}`);
    assert(r.contains_both_sides === true, 'should detect both sides');
});

test('warning order that contains both sides → warning_order + both-sides flag', () => {
    const r = C.classifyDocument(WARNO_BOTH_SIDES);
    assert(r.type === C.TYPES.WARNING_ORDER, `type was ${r.type}`);
    assert(r.contains_both_sides === true, 'both-sides flag must be set');
    assert(r.sides_present.friendly && r.sides_present.enemy, 'both side markers expected');
});

test('gibberish → unknown, low confidence, no sides', () => {
    const r = C.classifyDocument(GIBBERISH);
    assert(r.type === C.TYPES.UNKNOWN, `type was ${r.type}`);
    assert(r.confidence <= 0.3, `confidence should be low: ${r.confidence}`);
    assert(!r.sides_present.friendly && !r.sides_present.enemy, 'no sides expected');
});

test('empty / non-string input is safe', () => {
    assert(C.classifyDocument('').type === C.TYPES.UNKNOWN);
    assert(C.classifyDocument(null).type === C.TYPES.UNKNOWN);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
