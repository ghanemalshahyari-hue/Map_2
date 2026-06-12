#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / Phase F — JSON input + generate-from-brief tests.
 *
 * Covers the step-10 requirements:
 *   1. DOCX analyze still passes (regression).
 *   2. JSON Operational Brief analyze passes.
 *   3. RMOOZ Scenario JSON validator path passes.
 *   4. Unknown JSON requires review.
 *   5. Generate consumes the reviewed brief only (no objective ⇒ refuse).
 *   6. 500-per-side normalizer report is visible.
 *   7. No regression to the existing AI/import bridge (module loads; DOCX path).
 *
 * Pure static test — no server, no LLM. Run:
 *   node UI_MOdified/scripts/test-phase-f-generate-1.js
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const B   = require(path.join('..', 'server', 'ai', 'operational-brief'));
const GEN = require(path.join('..', 'server', 'ai', 'brief-to-scenario'));
const TPL = require(path.join('..', 'server', 'ai', 'operation-templates'));
const V   = require(path.join('..', 'server', 'ai', 'scenario-validator'));
const N   = require(path.join('..', 'server', 'ai', 'scenario-normalizer'));
const { extractDocxText } = require(path.join('..', 'server', 'ai', 'docx-text'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// A valid RMOOZ scenario with `red`/`blue` counts (mirrors the normalizer test).
const BOX = [19.4, 31.4, 20.6, 32.6], PT = [20.0, 32.0];
function mkSteps() { return Array.from({ length: 4 }, (_, i) => ({ index: i, time_label: `H${i * 6}`, elapsed_hours: i * 6, phase: `PHASE ${i + 1}` })); }
function scn(red, blue) {
    return {
        name: 'jsonscn', scenario_label: 'JSON scenario',
        map_bbox: BOX.slice(), obj: { name: 'OBJ X', coord: PT.slice(), target_depth_km: 8, carver: 20 },
        pipeline: [[19.7, 31.7], [19.85, 31.85], [20.0, 32.0]],
        red_units: Array.from({ length: red }, (_, i) => ({ uid: `R-${i}`, label: `r${i}`, bls: 'BLS-1', appear: 1, role: 'inf', coord: PT.slice() })),
        blue_units_initial: Array.from({ length: blue }, (_, i) => ({ unit_uid: `B-${i}`, base_id: `b${i}`, coord: PT.slice() })),
        blue_units_base_ids: Array.from({ length: blue }, (_, i) => `b${i}`),
        bls_template: [{ name: 'BLS-1', coord: [19.9, 31.9] }],
        phase_table: mkSteps(), steps: mkSteps(),
    };
}
// A reviewed Operational Brief (as the analyze endpoint would emit).
function reviewedBrief(withCoords) {
    const ob = {
        mission: 'منع الإبرار المعادي وحماية الهدف X',
        commander_intent: 'الدفاع الأمامي مع احتياط للهجوم المضاد',
        friendly: { summary: 'لواء مشاة آلي مدعوم', units: [{}, {}], tasks: [] },
        enemy: { summary: 'مجموعة إبرار برمائي', units: [{}, {}, {}], assessed_capabilities: [], tasks: [] },
        neutral: { civilian: [], infrastructure: [] },
        objectives: [{ name: 'الهدف X' }],
        phases: [{ index: 1, label: 'المرحلة الأولى' }],
        constraints: [{ text: 'تجنب المناطق المدنية' }],
        assumptions: [], ambiguities: [], source_citations: [{ section: 'الموقف', doc: 'order.docx' }],
        area_of_operations: withCoords ? { center: [20.0, 32.0], name: 'البريقة' } : {},
    };
    return {
        document_set_id: 'ds_test_brief', set_type: 'mixed_operational',
        operational_brief: ob,
        understanding: { proposed_unit_counts: { red: 6, blue: 6, neutral: 0 } },
    };
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DOC-UNDERSTANDING-1 / Phase F — JSON input + generate-from-brief');
console.log('══════════════════════════════════════════════════════════════════\n');

// ── 7. No regression: bridge module loads (import handler intact) ───
test('bridge module loads (existing AI/import handler intact)', () => {
    const bridge = require(path.join('..', 'server', 'wargame-sim-bridge'));
    assert(typeof bridge.handle === 'function', 'bridge.handle must be a function');
});

// ── 1. DOCX analyze still passes ────────────────────────────────────
test('DOCX analyze still passes (regression)', () => {
    const dir = path.join(__dirname, '..', 'TestingAI', 'import_from_rmooz');
    const red = path.join(dir, 'red_team_realistic_ar.docx'), blue = path.join(dir, 'blue_team_realistic_ar.docx');
    if (!fs.existsSync(red) || !fs.existsSync(blue)) { console.log('     (fixtures absent — skipping DOCX body)'); return; }
    const a = B.analyzeDocuments([{ slot: 'red', filename: 'red.docx', bytes: fs.readFileSync(red) }, { slot: 'blue', filename: 'blue.docx', bytes: fs.readFileSync(blue) }]);
    assert(a.ok && a.documents.length === 2 && a.understanding.phases.length >= 4, 'DOCX analyze must still produce a 2-doc brief');
});

// ── 2. JSON Operational Brief analyze ───────────────────────────────
test('JSON Operational Brief: detected, valid, understanding built', () => {
    const brief = reviewedBrief(true);
    assert(B.classifyJsonInput(brief) === 'operational_brief', 'should classify as operational_brief');
    assert(B.validateBrief(brief).ok === true, 'brief should validate');
    const nb = B.normalizeBrief(brief);
    assert(nb.operational_brief && nb.operational_brief.mission, 'normalized brief keeps mission');
    const u = B.understandingFromBrief(nb);
    assert(u.proposed_unit_counts.red === 3 && u.proposed_unit_counts.blue === 2, 'counts from side units');
    assert(/الهدف X/.test(JSON.stringify(u.objectives)), 'objective carried');
});

// ── 3. RMOOZ Scenario JSON validator path ───────────────────────────
test('RMOOZ Scenario JSON: detected + validates (loadable)', () => {
    const s = scn(11, 39);
    assert(B.classifyJsonInput(s) === 'rmooz_scenario', 'should classify as rmooz_scenario');
    assert(V.validateScenario(s).ok === true, 'valid scenario should pass validator');
});

// ── 6. 500-per-side normalizer report visible (scenario JSON path) ──
test('oversized Scenario JSON → normalizer caps to 500 with before/after report', () => {
    const s = scn(600, 39);
    const nr = N.normalizeScenario(s);
    assert(nr.changed === true, 'normalizer should act');
    assert(nr.report.before.red === 600 && nr.report.after.red === 500, 'before/after report visible');
    assert(V.validateScenario(s).ok === true, 'normalized scenario validates');
});

// ── 4. Unknown JSON requires review ─────────────────────────────────
test('unknown JSON → classified unknown, mapped best-effort, requires review', () => {
    assert(B.classifyJsonInput({ foo: 'bar', count: 3 }) === 'unknown', 'random object is unknown');
    const u = B.unknownToBrief({ mission: 'seize crossing', objectives: ['الهدف Y'], random: 1 });
    assert(u.confidence === 'low', 'low confidence');
    assert(u.mapped.indexOf('mission') !== -1 && u.mapped.indexOf('objectives') !== -1, 'safe fields mapped');
    assert(u.brief.operational_brief.ambiguities.length > 0, 'ambiguities flag review');
});

// ── 5. Generate consumes the reviewed brief only ───────────────────
test('generate from reviewed brief → valid DRAFT scenario (amphibious template)', () => {
    const brief = B.normalizeBrief(reviewedBrief(true));
    brief.understanding = { proposed_unit_counts: { red: 6, blue: 6, neutral: 0 } };
    const out = GEN.generateScenarioFromBrief(brief, { objective: { lon: 20.0, lat: 32.0, name: 'الهدف X' }, template: 'amphibious_landing' });
    assert(!out.requiresObjective, 'objective present ⇒ should generate');
    const s = out.scenario;
    assert(s.generated_from_brief === true, 'flagged generated_from_brief');
    assert(s.generation.template === 'amphibious_landing' && s.generation.draft === true, 'template + draft markers');
    assert(s.steps.length === 4 && s.steps[2].phase === 'landing', 'amphibious 4-phase skeleton');
    assert(s.red_units.every(u => u.draft === true && u.placement_confidence === 'low'), 'all red units are draft/low-confidence');
    assert(Math.abs(s.obj.coord[0] - 20.0) < 1e-6 && Math.abs(s.obj.coord[1] - 32.0) < 1e-6, 'objective coord used as-is');
    // RMOOZ validates: normalize then validate must pass.
    N.normalizeScenario(s);
    const v = V.validateScenario(s);
    assert(v.ok === true, 'generated scenario must validate; errors: ' + V.formatErrors(v.errors));
});

test('generate WITHOUT objective coordinates → refuses, asks operator to set objective', () => {
    const brief = B.normalizeBrief(reviewedBrief(false));   // no AO center, objective has no coord
    const out = GEN.generateScenarioFromBrief(brief, {});
    assert(out.requiresObjective === true, 'must require an objective');
    assert(/objective/i.test(out.reason || ''), 'reason mentions objective');
});

test('generation clamps proposed counts to ≤500 (never invents beyond cap)', () => {
    const brief = B.normalizeBrief(reviewedBrief(true));
    brief.understanding = { proposed_unit_counts: { red: 700, blue: 12, neutral: 0 } };
    const out = GEN.generateScenarioFromBrief(brief, { objective: { lon: 20, lat: 32 }, template: 'attack_objective' });
    assert(out.scenario.red_units.length === 500, `red should clamp to 500, got ${out.scenario.red_units.length}`);
});

// ── template inference ──────────────────────────────────────────────
test('template inference picks amphibious for إبرار text', () => {
    assert(TPL.inferTemplateId({ operational_brief: { mission: 'تنفيذ عملية إبرار على الساحل' } }) === 'amphibious_landing');
    assert(TPL.inferTemplateId({ operational_brief: { mission: 'دفاع جوي عن القاعدة' } }) === 'air_defense');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
