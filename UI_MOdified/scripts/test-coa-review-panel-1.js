#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / G-3 — COA Review Panel tests.
 *
 * Loads the REAL client module (client/shell/coa-review-panel.js) under node
 * with a window stub and drives its DOM-free state machine using a payload
 * produced by the REAL G-2 adapter — so the gating rules are tested against
 * the production data contract, not a hand mock:
 *
 *   • render model groups BLUE first, Enemy Most Likely, MD placeholder flag
 *   • NO auto-selection from coa_recommendation (D9)
 *   • Generate blocked while no BLUE COA selected (exact BLOCK_MESSAGE)
 *   • Generate allowed after selecting a BLUE COA
 *   • RED COAs cannot be selected
 *   • rejected COA cannot be selected until un-rejected
 *   • single-selection invariant; edits keep needs_review + identity
 *   • wiring: review renderer mounts the panel + gates generate; app.html
 *     loads the panel before the renderer
 *
 * Pure static test — no server, no browser. Run:
 *   node UI_MOdified/scripts/test-coa-review-panel-1.js
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const ADAPTER = require(path.join('..', 'server', 'ai', 'mdmp-external-adapter'));
const B = require(path.join('..', 'server', 'ai', 'operational-brief'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── load the real client module under node ──────────────────────────
const PANEL_SRC = fs.readFileSync(path.join(__dirname, '..', 'client', 'shell', 'coa-review-panel.js'), 'utf8');
global.window = {};
new Function('window', PANEL_SRC)(global.window);
const PANEL = global.window.RmoozCoaPanel;

// ── real payload from the real adapter ──────────────────────────────
const STEP3 = {
    task: 'تدمير قوة الإبرار المعادية.', commander_intent: 'كسر زخم الهجوم.',
    phose_one: 'م1: إشغال بالنيران.', phose_two: 'م2: دفاع ثابت.', phose_three: 'م3: هجوم مضاد.',
    Boot_operations: 'تمهيد: استطلاع.', Acceptance_of_packaging_risk: 'قبول كشف الجناح مؤقتاً.',
    phose_one2: 'م1 (ع2): دفاع متحرك.', phose_two2: 'م2 (ع2): استنزاف.', phose_three2: 'م3 (ع2): هجوم عام.',
};
const STEP4 = {
    Most_likely_enemy_action: 'الأرجح إبرار على الشاطئ الغربي.',
    crossing_LD_and_breaching_mines_acting: 'فتح ثغرتين.',
    crossing_LD_and_breaching_mines_reaction: 'إغلاق بالنيران.',
    crossing_LD_and_breaching_mines_counter_action: 'ثغرة ثالثة بدخان.',
};
const STEP5 = {
    strengths_attacking_cog: 'يضرب مركز الثقل.', weaknesses_attacking_cog: 'يتطلب تفوقاً نارياً.',
    conclusions_c1: 'أسرع وأخطر.', conclusions_c2: 'أبطأ وأأمن.',
    overall_comparison_conclusion: 'يُرجَّح الأول مع الإسناد الجوي.',
};
function freshPayload() {
    const out = ADAPTER.adaptMdmpBundle([
        { filename: 'step3.json', data: STEP3 },
        { filename: 'step4_out.json', data: STEP4 },
        { filename: 'step5.json', data: STEP5 },
    ]);
    return {
        document_set_id: out.brief.document_set_id,
        brief: out.brief,
        understanding: B.understandingFromBrief(out.brief),
    };
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DOC-UNDERSTANDING-1 / G-3 — COA Review Panel');
console.log('══════════════════════════════════════════════════════════════════\n');

test('panel module loads; hasCoas true on adapter payload, false without COAs', () => {
    assert(PANEL && typeof PANEL.createState === 'function', 'module shape');
    assert(PANEL.hasCoas(freshPayload()) === true, 'hasCoas true');
    assert(PANEL.hasCoas({ brief: { operational_brief: { courses_of_action: [] } } }) === false, 'empty false');
    assert(PANEL.hasCoas({}) === false, 'missing false');
});

test('grouping: BLUE first, Enemy Most Likely present, MD placeholder flagged', () => {
    const st = PANEL.createState(freshPayload());
    const g = PANEL.groupModel(st);
    assert(g.blue.length === 2, `blue count ${g.blue.length}`);
    assert(g.red_most_likely && g.red_most_likely.id === 'coa-red-ml', 'red ML present');
    assert(g.red_most_dangerous === null && g.md_missing === true, 'MD missing → placeholder flag');
});

test('D9: recommendation exists but NOTHING is auto-selected', () => {
    const st = PANEL.createState(freshPayload());
    assert(st.recommendation && st.recommendation.rationale, 'recommendation present in state');
    assert(st.selectedId === null, 'selectedId must start null');
    assert(PANEL.getSelectedBlueOf(st) === null, 'no selected blue');
});

test('gate: blocked with no selection (exact message), allowed after BLUE select', () => {
    const st = PANEL.createState(freshPayload());
    let gate = PANEL.canGenerate(st);
    assert(gate.ok === false, 'must block with no selection');
    assert(gate.reason === PANEL.BLOCK_MESSAGE, 'exact block message');
    assert(/Select and approve a BLUE COA before generation/.test(PANEL.BLOCK_MESSAGE), 'message text');
    const r = PANEL.select(st, 'coa-blue-1');
    assert(r.ok === true, 'select blue ok');
    gate = PANEL.canGenerate(st);
    assert(gate.ok === true, 'allowed after blue selection');
    assert(PANEL.getSelectedBlueOf(st).id === 'coa-blue-1', 'selected blue resolvable');
});

test('RED COA cannot be selected', () => {
    const st = PANEL.createState(freshPayload());
    const r = PANEL.select(st, 'coa-red-ml');
    assert(r.ok === false && /BLUE/.test(r.error), 'red select refused');
    assert(PANEL.canGenerate(st).ok === false, 'still blocked');
});

test('rejected COA cannot be selected until un-rejected; rejecting selected clears it', () => {
    const st = PANEL.createState(freshPayload());
    PANEL.reject(st, 'coa-blue-1');
    let r = PANEL.select(st, 'coa-blue-1');
    assert(r.ok === false && /rejected/i.test(r.error), 'rejected blocks select');
    PANEL.unreject(st, 'coa-blue-1');
    r = PANEL.select(st, 'coa-blue-1');
    assert(r.ok === true, 'select ok after un-reject');
    PANEL.reject(st, 'coa-blue-1');                       // rejecting the selected one
    assert(st.selectedId === null, 'rejecting the selected COA clears the selection');
    assert(PANEL.canGenerate(st).ok === false, 'gate re-blocks');
});

test('single selection: selecting another BLUE replaces the first', () => {
    const st = PANEL.createState(freshPayload());
    PANEL.select(st, 'coa-blue-1');
    PANEL.select(st, 'coa-blue-2');
    assert(st.selectedId === 'coa-blue-2', 'second selection wins');
});

test('applyEdit: keeps id/side, forces needs_review, invalid JSON refused', () => {
    const st = PANEL.createState(freshPayload());
    const bad = PANEL.applyEdit(st, 'coa-blue-1', '{not json');
    assert(bad.ok === false && /invalid JSON/.test(bad.error), 'bad json refused');
    const ok = PANEL.applyEdit(st, 'coa-blue-1',
        JSON.stringify({ id: 'HACKED', side: 'RED', intent: 'معدل من القائد', needs_review: false }));
    assert(ok.ok === true, 'edit applied');
    const c = PANEL.coaById(st, 'coa-blue-1');
    assert(c.id === 'coa-blue-1' && c.side === 'BLUE', 'identity/side not editable');
    assert(c.needs_review === true, 'L6: edit never clears needs_review');
    assert(c.intent === 'معدل من القائد', 'edited content visible');
});

test('no COAs in brief → gate stays open (legacy flow unchanged)', () => {
    const st = PANEL.createState({ document_set_id: 'x', brief: { operational_brief: { courses_of_action: [] } } });
    assert(PANEL.canGenerate(st).ok === true, 'no COAs → no gate');
});

// ── wiring assertions (renderer + app.html) ─────────────────────────
test('doc-understanding-review.js mounts the panel and gates generate', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'shell', 'doc-understanding-review.js'), 'utf8');
    assert(src.indexOf('data-el="coa-panel"') !== -1, 'mount div missing');
    assert(src.indexOf('RmoozCoaPanel.render') !== -1, 'panel render call missing');
    assert(src.indexOf('canGenerateNow') !== -1, 'generate gate missing');
    assert(src.indexOf('coa-block-warn') !== -1, 'block warning element missing');
    assert(src.indexOf('approved_coa_id') !== -1, 'approved metadata stamping missing');
});

test('app.html loads coa-review-panel.js before doc-understanding-review.js', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'app.html'), 'utf8');
    const a = html.indexOf('shell/coa-review-panel.js');
    const b = html.indexOf('shell/doc-understanding-review.js');
    assert(a !== -1, 'panel script missing from app.html');
    assert(b !== -1, 'review script missing from app.html');
    assert(a < b, 'panel must load BEFORE the review renderer');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
