#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / Phase D — operational-brief assembly tests.
 *
 *   • Phase G #1 — same document in both friendly & enemy slots is
 *     deduplicated into ONE "Mixed Operational Document".
 *   • Phase G #3 — friendly and enemy sections are separated from one
 *     mixed source.
 *   • Operational Brief JSON has the required shape.
 *
 * Pure static test — no server, no LLM. Run:
 *   node UI_MOdified/scripts/test-operational-brief-1.js
 */
'use strict';

const path = require('path');
const B = require(path.join('..', 'server', 'ai', 'operational-brief'));
const C = require(path.join('..', 'server', 'ai', 'document-classifier'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const MIXED_ORDER = [
    'الأمر الإنذاري',
    'الموقف',
    'أ. قوات العدو: كتيبة دبابات في منطقة التجمع الأمامية.',
    'ب. قواتنا: لواء مشاة مدعوم بالمدفعية الميدانية.',
    'المهمة: تأمين منطقة العمليات على ثلاث مراحل.',
    'التنفيذ: الهجوم فجراً.',
].join('\n');

const OTHER_DOC = 'INTELLIGENCE SUMMARY (INTSUM)\nEnemy disposition as of 0600.';

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DOC-UNDERSTANDING-1 / Phase D — operational brief assembly');
console.log('══════════════════════════════════════════════════════════════════\n');

// ── Phase G #1 — dedupe same file in both slots ─────────────────────
test('same document in red + blue slots → ONE Mixed Operational Document', () => {
    const set = B.buildDocumentSet([
        { slot: 'red',  filename: 'order.docx', text: MIXED_ORDER },
        { slot: 'blue', filename: 'order.docx', text: MIXED_ORDER },
    ]);
    assert(set.documents.length === 1, `expected 1 deduped document, got ${set.documents.length}`);
    assert(set.dedupe.duplicates_removed === 1, `expected 1 duplicate removed, got ${set.dedupe.duplicates_removed}`);
    assert(set.dedupe.same_in_both_slots === true, 'same_in_both_slots must be true');
    assert(set.documents[0].slots.join(',') === 'blue,red', `slots were ${set.documents[0].slots}`);
    assert(set.set_type === C.TYPES.MIXED, `set_type was ${set.set_type}`);
    assert(set.set_label_en === 'Mixed Operational Document', `label was ${set.set_label_en}`);
});

test('document_set_id is deterministic (no Date.now / random)', () => {
    const a = B.buildDocumentSet([{ slot: 'red', text: MIXED_ORDER }, { slot: 'blue', text: MIXED_ORDER }]);
    const b = B.buildDocumentSet([{ slot: 'red', text: MIXED_ORDER }, { slot: 'blue', text: MIXED_ORDER }]);
    assert(a.document_set_id === b.document_set_id, 'set id must be stable for identical input');
    assert(/^ds_[0-9a-f]{16}$/.test(a.document_set_id), `set id format: ${a.document_set_id}`);
});

test('two DIFFERENT documents → kept separate (no false dedupe)', () => {
    const set = B.buildDocumentSet([
        { slot: 'red',  filename: 'order.docx', text: MIXED_ORDER },
        { slot: 'blue', filename: 'intel.docx', text: OTHER_DOC },
    ]);
    assert(set.documents.length === 2, `expected 2 documents, got ${set.documents.length}`);
    assert(set.dedupe.duplicates_removed === 0, 'no duplicates expected');
    assert(set.dedupe.same_in_both_slots === false, 'different files are not the same in both slots');
});

// ── Phase G #3 — separate friendly & enemy from one source ──────────
test('friendly and enemy sections separated from one mixed document', () => {
    const seg = B.segmentSides(MIXED_ORDER);
    assert(seg.flags.friendly && seg.flags.enemy, 'both sides should be detected');
    // enemy bucket has the enemy unit, NOT the friendly unit
    assert(seg.enemy.indexOf('دبابات') !== -1, 'enemy text should contain the enemy armor');
    assert(seg.enemy.indexOf('المدفعية') === -1, 'enemy text must NOT contain the friendly artillery');
    // friendly bucket has the friendly unit, NOT the enemy unit
    assert(seg.friendly.indexOf('المدفعية') !== -1, 'friendly text should contain the friendly artillery');
    assert(seg.friendly.indexOf('دبابات') === -1, 'friendly text must NOT contain the enemy armor');
    // the mission line is an order section, not a side
    assert(seg.unmapped.indexOf('المهمة') !== -1, 'mission heading should land in unmapped/order section');
});

// ── Brief shape ─────────────────────────────────────────────────────
test('emptyBrief() has the required Operational Brief shape', () => {
    const b = B.emptyBrief();
    const ob = b.operational_brief;
    assert('document_set_id' in b && Array.isArray(b.documents), 'top-level shape');
    for (const k of ['mission', 'commander_intent', 'area_of_operations', 'friendly', 'enemy',
                     'neutral', 'objectives', 'phases', 'timeline', 'constraints', 'assumptions',
                     'ambiguities', 'source_citations']) {
        assert(k in ob, `operational_brief missing ${k}`);
    }
    assert(Array.isArray(ob.friendly.units) && Array.isArray(ob.enemy.units), 'side unit arrays');
    assert(Array.isArray(ob.neutral.civilian) && Array.isArray(ob.neutral.infrastructure), 'neutral arrays');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
