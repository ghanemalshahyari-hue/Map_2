#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / Phase D — analyze orchestration over REAL fixtures.
 *
 *   • Phase G #4 — the brief is built from extracted FACTS only (side
 *     summaries are verbatim substrings of the source documents, not invented).
 *   • Phase G #8 — the review payload carries document type, mission,
 *     friendly, enemy, objectives, phases, and an ambiguity list.
 *   • Same file in both slots → one Mixed Operational Document.
 *
 * Uses the committed Arabic fixtures under TestingAI/import_from_rmooz/.
 * Pure static test — no server, no LLM. Run:
 *   node UI_MOdified/scripts/test-document-understanding-1.js
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const B = require(path.join('..', 'server', 'ai', 'operational-brief'));
const { extractDocxText } = require(path.join('..', 'server', 'ai', 'docx-text'));
const C = require(path.join('..', 'server', 'ai', 'document-classifier'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const DIR = path.join(__dirname, '..', 'TestingAI', 'import_from_rmooz');
const RED = path.join(DIR, 'red_team_realistic_ar.docx');
const BLUE = path.join(DIR, 'blue_team_realistic_ar.docx');

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DOC-UNDERSTANDING-1 / Phase D — analyze over real Arabic fixtures');
console.log('══════════════════════════════════════════════════════════════════\n');

const haveFixtures = fs.existsSync(RED) && fs.existsSync(BLUE);
if (!haveFixtures) {
    console.log('  [SKIP] real fixtures not present on this checkout');
    process.exit(0);
}
const redBytes = fs.readFileSync(RED);
const blueBytes = fs.readFileSync(BLUE);
const redText = extractDocxText(redBytes);
const blueText = extractDocxText(blueBytes);

test('extractor pulled Arabic text from both fixtures', () => {
    assert(redText.length > 200 && /[؀-ۿ]/.test(redText), 'red text');
    assert(blueText.length > 200 && /[؀-ۿ]/.test(blueText), 'blue text');
});

test('analyze(distinct red+blue) → 2 docs, mixed set, both sides classified', () => {
    const a = B.analyzeDocuments([
        { slot: 'red',  filename: 'red_team.docx',  bytes: redBytes },
        { slot: 'blue', filename: 'blue_team.docx', bytes: blueBytes },
    ]);
    assert(a.documents.length === 2, `expected 2 docs, got ${a.documents.length}`);
    assert(a.set_type === C.TYPES.MIXED, `set_type ${a.set_type}`);
    const types = a.documents.map(d => d.detected_type).sort();
    assert(types.indexOf('enemy_orbat') !== -1 && types.indexOf('friendly_orbat') !== -1,
        `types ${types.join(',')}`);
});

test('Phase G #8 — review payload carries all required fields', () => {
    const a = B.analyzeDocuments([
        { slot: 'red', filename: 'red_team.docx', bytes: redBytes },
        { slot: 'blue', filename: 'blue_team.docx', bytes: blueBytes },
    ]);
    const u = a.understanding;
    for (const k of ['set_type', 'mission', 'commander_intent', 'friendly', 'enemy',
                     'objectives', 'phases', 'constraints', 'ambiguities', 'proposed_unit_counts']) {
        assert(k in u, `understanding missing ${k}`);
    }
    assert(u.friendly.summary.length > 0 && u.enemy.summary.length > 0, 'side summaries present');
    assert(u.phases.length >= 4, `expected >=4 phases, got ${u.phases.length}`);
    assert(u.objectives.some(o => /X/.test(o.name)), 'objective X expected');
    assert(u.proposed_unit_counts.red > 0 && u.proposed_unit_counts.blue > 0, 'unit estimates');
    assert(Array.isArray(u.ambiguities) && u.ambiguities.length > 0, 'ambiguity list present');
    assert(u.ambiguities.some(x => /map bounds|منطقة العمليات/i.test(x)), 'map-bounds ambiguity flagged');
});

test('Phase G #4 — side summaries are FACTS from the source (not invented)', () => {
    const a = B.analyzeDocuments([
        { slot: 'red', filename: 'red_team.docx', bytes: redBytes },
        { slot: 'blue', filename: 'blue_team.docx', bytes: blueBytes },
    ]);
    // friendly summary must be a verbatim prefix of the BLUE source text;
    // enemy summary a verbatim prefix of the RED source text.
    assert(blueText.startsWith(a.understanding.friendly.summary), 'friendly summary must come from blue doc');
    assert(redText.startsWith(a.understanding.enemy.summary), 'enemy summary must come from red doc');
    assert(a.llm_fill.available === false, 'LLM fill should be marked unavailable (degraded)');
});

test('same file in BOTH slots → one Mixed Operational Document', () => {
    const a = B.analyzeDocuments([
        { slot: 'red',  filename: 'x.docx', bytes: redBytes },
        { slot: 'blue', filename: 'x.docx', bytes: redBytes },
    ]);
    assert(a.documents.length === 1, `expected 1 doc, got ${a.documents.length}`);
    assert(a.dedupe.same_in_both_slots === true, 'same_in_both_slots');
    assert(a.set_type === C.TYPES.MIXED, `set_type ${a.set_type}`);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
