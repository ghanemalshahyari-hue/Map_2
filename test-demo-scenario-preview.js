/**
 * test-demo-scenario-preview.js — DEMO-ACTUAL-1
 *
 * Static unit tests for the AI Decision-Making Scenario Preview.
 * Covers: client module structure, server route, preview object invariants,
 * stepTo clamp, getStepCount, movement lines, noWrite guard, isolation.
 *
 * Run: node test-demo-scenario-preview.js (no server required)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ─────────────────────────────────────────────────────────────────────
const CLIENT_MOD  = path.join(__dirname, 'UI_MOdified/client/shell/demo-scenario-preview.js');
const BRIDGE_PATH = path.join(__dirname, 'UI_MOdified/server/wargame-sim-bridge.js');
const GEN_PATH    = path.join(__dirname, 'UI_MOdified/server/ai/brief-to-scenario.js');
const HTML_PATH   = path.join(__dirname, 'UI_MOdified/client/app.html');
const REVIEW_PATH = path.join(__dirname, 'UI_MOdified/client/shell/doc-understanding-review.js');

const clientSrc = fs.readFileSync(CLIENT_MOD,  'utf8');
const bridgeSrc = fs.readFileSync(BRIDGE_PATH, 'utf8');
const genSrc    = fs.readFileSync(GEN_PATH,    'utf8');
const htmlSrc   = fs.readFileSync(HTML_PATH,   'utf8');
const reviewSrc = fs.readFileSync(REVIEW_PATH, 'utf8');

let passed = 0, failed = 0;
function check(ok, label, detail) {
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label + (detail !== undefined ? ' — ' + detail : ''));
}

// ── Server helpers (loaded via _internals) ────────────────────────────────────
const bridge   = require('./UI_MOdified/server/wargame-sim-bridge.js');
const internals = bridge._internals;
const { buildPreviewFromScenario, PREVIEW_STEP_SEQUENCE, PREVIEW_STEP_TEXT, PREVIEW_STEP_TEXT_DEFAULT } = internals;

// ── brief-to-scenario generator (direct) ─────────────────────────────────────
const GEN = require('./UI_MOdified/server/ai/brief-to-scenario.js');

// ── Minimal fixture brief (enough for the generator to work) ─────────────────
const FIXTURE_BRIEF = {
    operational_brief: {
        mission: 'Seize and hold Objective Alpha',
        commander_intent: 'Defeat enemy at the objective and establish a defensive perimeter.',
        enemy:    { summary: 'Two mechanised battalions defending the ridge line.' },
        friendly: { summary: 'One armoured brigade reinforced with engineers.' },
        objectives: [{ name: 'OBJ-A', coord: [51.5, 24.5] }],
        proposed_units: [
            { side: 'RED',  platform: 'T-72', estimated_count: 3, lat: 51.5,  lon: 24.5 },
            { side: 'BLUE', platform: 'M1A2', estimated_count: 4, lat: 51.48, lon: 24.48 },
        ],
    },
};
const FIXTURE_OBJ = { lon: 51.5, lat: 24.5 };

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  DEMO-ACTUAL-1 — AI Decision-Making Scenario Preview\n');

// ── Section 1: Client module structure ────────────────────────────────────────
console.log('  1. Client module structure');

check(fs.existsSync(CLIENT_MOD),
    'demo-scenario-preview.js exists');

check(/window\.RmoozDemoPreview\s*=/.test(clientSrc),
    'RmoozDemoPreview defined on window');

check(/\bbuild\b/.test(clientSrc) && /\bclear\b/.test(clientSrc) &&
      /\bisActive\b/.test(clientSrc) && /\bstepTo\b/.test(clientSrc) &&
      /\bgetStepCount\b/.test(clientSrc),
    'exports build / clear / isActive / stepTo / getStepCount');

check(/\/api\/wargame-sim\/generate-preview/.test(clientSrc),
    'build posts to /api/wargame-sim/generate-preview');

check(/fetch\s*\(/.test(clientSrc),
    'build uses fetch (not XHR)');

// Strip single-line and block comments before checking code usage
var clientCode = clientSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
check(!/window\.RmoozScenario\.stepIndex\s*=/.test(clientCode),
    'never assigns window.RmoozScenario.stepIndex (code only, not comments)');

check(!/proposed_units\.(?:push|pop|splice|shift|unshift)/.test(clientCode) &&
      !/proposed_units\s*=(?!=)/.test(clientCode),
    'never mutates proposed_units (code only, not comments)');

check(/noWrite/.test(genSrc),
    'brief-to-scenario.js carries noWrite contract marker');

// ── Section 2: Script tag in app.html ─────────────────────────────────────────
console.log('\n  2. app.html wiring');

check(/shell\/demo-scenario-preview\.js/.test(htmlSrc),
    'script tag for demo-scenario-preview.js in app.html');

const placementIdx = htmlSrc.indexOf('placement-candidates-panel.js');
const previewIdx   = htmlSrc.indexOf('demo-scenario-preview.js');
check(placementIdx >= 0 && previewIdx > placementIdx,
    'demo-scenario-preview.js loads AFTER placement-candidates-panel.js');

// ── Section 3: Button in doc-understanding-review.js ─────────────────────────
console.log('\n  3. doc-understanding-review.js button');

check(/data-act="preview"/.test(reviewSrc),
    'preview button with data-act="preview" present');

check(/Preview Decision Steps/.test(reviewSrc) || /معاينة خطوات القرار/.test(reviewSrc),
    'preview button label contains expected text');

check(/RmoozDemoPreview/.test(reviewSrc),
    'review module references RmoozDemoPreview');

check(/showPreviewBtn/.test(reviewSrc),
    'preview button is conditionally shown (showPreviewBtn guard)');

// ── Section 4: Server route in wargame-sim-bridge.js ─────────────────────────
console.log('\n  4. Server route');

check(/generate-preview/.test(bridgeSrc),
    'generate-preview route present in wargame-sim-bridge.js');

check(/noWrite.*true/.test(bridgeSrc),
    'route passes noWrite:true to generator');

check(/buildPreviewFromScenario/.test(bridgeSrc),
    'buildPreviewFromScenario called in route');

check(typeof buildPreviewFromScenario === 'function',
    'buildPreviewFromScenario exported via _internals');

check(typeof PREVIEW_STEP_TEXT === 'object' && PREVIEW_STEP_TEXT !== null,
    'PREVIEW_STEP_TEXT exported via _internals');

check(Array.isArray(PREVIEW_STEP_SEQUENCE) && PREVIEW_STEP_SEQUENCE.length === 7,
    'PREVIEW_STEP_SEQUENCE exports seven operational preview steps');

// ── Section 5: Preview object invariants ─────────────────────────────────────
console.log('\n  5. Preview object structure');

var gen = GEN.generateScenarioFromBrief(FIXTURE_BRIEF, { objective: FIXTURE_OBJ, noWrite: true });
check(!gen.requiresObjective, 'generator succeeds with fixture brief + objective');

var preview = buildPreviewFromScenario(gen.scenario, gen.report, FIXTURE_BRIEF);

check(preview._isPreview === true,
    '_isPreview is true');

check(preview.preview_only === true,
    'preview_only is true');

check(preview.review_source === 'ai_decision_demo',
    'review_source is "ai_decision_demo"');

check(Array.isArray(preview.steps) && preview.steps.length >= 5 && preview.steps.length <= 8,
    'steps count in [5, 8]', preview.steps.length);

check(preview.steps.length === 7,
    'preview uses seven operational steps', preview.steps.length);

check(Array.isArray(preview.red_units) && preview.red_units.length > 0,
    'red_units present', preview.red_units.length);

check(Array.isArray(preview.blue_units) && preview.blue_units.length > 0,
    'blue_units present', preview.blue_units.length);

check(preview.red_units.every(function (u) { return u.preview_only && u._isPreview; }),
    'every red_unit carries preview_only:true and _isPreview:true');

check(preview.blue_units.every(function (u) { return u.preview_only && u._isPreview; }),
    'every blue_unit carries preview_only:true and _isPreview:true');

check(typeof preview.movement_warning === 'string' && preview.movement_warning.length > 0,
    'movement_warning present');

check(Array.isArray(preview.bases),
    'bases array present');

// ── Section 6: Step structure ─────────────────────────────────────────────────
console.log('\n  6. Step structure');

var step0 = preview.steps[0];
check(step0.index === 0,
    'step[0].index === 0');

check(typeof step0.phase_kind === 'string' && step0.phase_kind.length > 0,
    'step[0].phase_kind is a non-empty string', step0.phase_kind);

check(typeof step0.decision_en === 'string' && step0.decision_en.length > 0,
    'step[0].decision_en present');

check(typeof step0.risk_en === 'string' && step0.risk_en.length > 0,
    'step[0].risk_en present');

check(typeof step0.evidence_en === 'string' && step0.evidence_en.length > 0,
    'step[0].evidence_en present');

check(step0.unit_positions && Array.isArray(step0.unit_positions.red) && Array.isArray(step0.unit_positions.blue),
    'step[0].unit_positions has red[] and blue[]');

check(Array.isArray(step0.movement_lines),
    'step[0].movement_lines is array');

var expectedTitles = [
    'Initial posture',
    'Reconnaissance and confirmation',
    'Defensive readiness',
    'Main movement/action',
    'Contact or engagement',
    'Consolidation',
    'Decision point',
];
var actualTitles = preview.steps.map(function (s) { return s.phase_name_en; });
check(JSON.stringify(actualTitles) === JSON.stringify(expectedTitles),
    'improved operational step titles are generated', actualTitles.join(' | '));

check(preview.steps.every(function (s) {
    return typeof s.action_en === 'string' && s.action_en.length > 0 &&
           typeof s.reason_en === 'string' && s.reason_en.length > 0 &&
           typeof s.risk_en === 'string' && s.risk_en.length > 0;
}), 'every step has action/reason/risk fields');

check(preview.steps.every(function (s) {
    return Array.isArray(s.units_involved) && s.units_involved.length > 0 &&
           Array.isArray(s.related_bases) && s.related_bases.length > 0 &&
           /preview_only:true/.test(s.review_warning || '') &&
           /approximate_route:true/.test(s.review_warning || '') &&
           /requires_review:true/.test(s.review_warning || '');
}), 'every step carries units, related bases/anchors, and review warning metadata');

// ── Section 7: Movement lines only when positions change ─────────────────────
console.log('\n  7. Movement lines');

check(step0.movement_lines.length === 0,
    'step[0] (first step) has no movement lines (no previous step)');

var laterStep = preview.steps.find(function (s) { return s.index > 0; });
check(laterStep !== undefined,
    'at least one step with index > 0 exists');

if (laterStep) {
    // Movement lines should only appear when coordinates differ
    laterStep.movement_lines.forEach(function (line) {
        var dx = line.from[0] - line.to[0];
        var dy = line.from[1] - line.to[1];
        var nonZero = dx * dx + dy * dy > 1e-10;
        // just verify structure
        check(Array.isArray(line.from) && Array.isArray(line.to),
            'movement line[' + line.unit_uid + '] has from[] and to[]');
        if (nonZero) {
            check(line.approximate === true,
                'movement line[' + line.unit_uid + '] carries approximate:true');
            check(line.approximate_route === true,
                'movement line[' + line.unit_uid + '] carries approximate_route:true');
            check(line.requires_review === true,
                'movement line[' + line.unit_uid + '] carries requires_review:true');
            check(typeof line.from_label === 'string' && line.from_label.length > 0,
                'movement line[' + line.unit_uid + '] has from anchor/base label');
            check(typeof line.to_label === 'string' && line.to_label.length > 0,
                'movement line[' + line.unit_uid + '] has to objective/area label');
            check(Number.isInteger(line.step_index) && line.step_index === laterStep.index,
                'movement line[' + line.unit_uid + '] has step_index metadata');
        }
    });
    check(laterStep.movement_lines.every(function (l) {
        var dx = l.from[0] - l.to[0], dy = l.from[1] - l.to[1];
        return dx * dx + dy * dy > 1e-10;
    }), 'all movement lines have non-zero displacement (zero-length lines excluded)');
}

// ── Section 8: stepTo clamp ───────────────────────────────────────────────────
console.log('\n  8. stepTo clamp (simulated client-side)');

// Replicate the stepTo clamp logic from the client module
function clampStep(n, total) {
    var max = total - 1;
    return Math.max(0, Math.min(max, typeof n === 'number' && isFinite(n) ? Math.round(n) : 0));
}

var total = preview.steps.length;
check(clampStep(-5, total) === 0,      'stepTo(-5) clamps to 0');
check(clampStep(0, total) === 0,       'stepTo(0) stays at 0');
check(clampStep(1, total) === 1,       'stepTo(1) stays at 1');
check(clampStep(999, total) === total - 1, 'stepTo(999) clamps to stepCount-1', total - 1);
check(clampStep(total - 1, total) === total - 1, 'stepTo(stepCount-1) is valid');

// ── Section 9: getStepCount ───────────────────────────────────────────────────
console.log('\n  9. getStepCount');

check(preview.steps.length >= 5,
    'getStepCount >= 5 for normal brief', preview.steps.length);

// Empty scenario (no phases)
var emptyScenario = {
    obj: { coord: [51.5, 24.5] }, pipeline: [], red_units: [], blue_units_initial: [],
    bls_template: [], phase_table: [], scenario_label: 'empty test',
};
var emptyPreview = buildPreviewFromScenario(emptyScenario, null, {});
check(emptyPreview.steps.length >= 5,
    'getStepCount padded to minimum 5 for empty phase_table', emptyPreview.steps.length);

// ── Section 10: noWrite guard in generator ────────────────────────────────────
console.log('\n  10. noWrite guard in generator');

check(/opts\.noWrite/.test(genSrc),
    'generateScenarioFromBrief references opts.noWrite');

// Verify that calling with noWrite:true returns the same output as without
var genWithWrite    = GEN.generateScenarioFromBrief(FIXTURE_BRIEF, { objective: FIXTURE_OBJ });
var genWithNoWrite  = GEN.generateScenarioFromBrief(FIXTURE_BRIEF, { objective: FIXTURE_OBJ, noWrite: true });
check(!genWithWrite.requiresObjective && !genWithNoWrite.requiresObjective,
    'generator succeeds with and without noWrite flag');
check(JSON.stringify(genWithWrite.scenario.red_units) === JSON.stringify(genWithNoWrite.scenario.red_units),
    'noWrite flag does not change generator output');

// ── Section 11: No proposed_units / source mutation ──────────────────────────
console.log('\n  11. Isolation — no mutation');

var frozen = Object.freeze(JSON.parse(JSON.stringify(FIXTURE_BRIEF)));
var frozenGen = GEN.generateScenarioFromBrief(frozen, { objective: FIXTURE_OBJ, noWrite: true });
check(!frozenGen.requiresObjective,
    'generator succeeds with frozen (non-mutated) brief');

// buildPreviewFromScenario must not mutate the scenario or units arrays
var snapRedUnits = JSON.stringify(gen.scenario.red_units);
var snapBlueUnits = JSON.stringify(gen.scenario.blue_units_initial);
buildPreviewFromScenario(gen.scenario, gen.report, FIXTURE_BRIEF);
buildPreviewFromScenario(gen.scenario, gen.report, FIXTURE_BRIEF);
check(JSON.stringify(gen.scenario.red_units) === snapRedUnits,
    'buildPreviewFromScenario does not mutate red_units');
check(JSON.stringify(gen.scenario.blue_units_initial) === snapBlueUnits,
    'buildPreviewFromScenario does not mutate blue_units_initial');

// Preview units must NOT share references with source units
var previewRedU0 = preview.red_units[0];
var srcRedU0     = gen.scenario.red_units[0];
var notSameRef   = (previewRedU0 !== srcRedU0);
check(notSameRef,
    'preview red_units[0] is a copy, not the same reference as source');

// ── Section 12: clear removes preview layer ───────────────────────────────────
console.log('\n  12. clear() structural check');

// Verify that the clear() function removes both _baseLayer and _stepLayer
// (checked via source code presence of both clearLayers and clearPanel calls).
check(/_clearLayers\s*\(\)/.test(clientSrc),
    'clear() calls _clearLayers()');

check(/_clearPanel\s*\(\)/.test(clientSrc),
    'clear() calls _clearPanel()');

check(/_active\s*=\s*false/.test(clientSrc),
    'clear() sets _active to false');

check(/_preview\s*=\s*null/.test(clientSrc),
    'clear() sets _preview to null');
check(/Clear Preview/.test(clientSrc) && /data-act="clear"/.test(clientSrc),
    'panel exposes visible Clear Preview control');
check(/preview_only/.test(clientSrc) && /approximate_route/.test(clientSrc) && /requires_review/.test(clientSrc),
    'panel warning shows preview_only / approximate_route / requires_review tokens');

check(/Action \/ العمل/.test(clientSrc) && /Reason \/ السبب/.test(clientSrc) &&
      /Units involved \/ الوحدات المشاركة/.test(clientSrc) &&
      /Related bases\/anchors \/ القواعد والمراسي المرتبطة/.test(clientSrc),
    'panel renders action, reason, units involved, and related bases/anchors');

check(/bindPopup/.test(clientSrc) && /from anchor\/base/.test(clientSrc) &&
      /to objective\/area/.test(clientSrc) && /approximate_route:true/.test(clientSrc) &&
      /requires_review:true/.test(clientSrc),
    'movement lines render labels/popups with review metadata');

var proposedBefore = JSON.stringify(FIXTURE_BRIEF.operational_brief.proposed_units);
buildPreviewFromScenario(gen.scenario, gen.report, FIXTURE_BRIEF);
check(JSON.stringify(FIXTURE_BRIEF.operational_brief.proposed_units) === proposedBefore,
    'buildPreviewFromScenario does not mutate source proposed_units');

var builderStart = bridgeSrc.indexOf('function buildPreviewFromScenario');
var builderEnd = bridgeSrc.indexOf('// ── main router', builderStart);
var builderSrc = bridgeSrc.slice(builderStart, builderEnd);
check(!/step\s*[345]|Step\s*[345]/i.test(builderSrc),
    'preview builder has no Step 3/4/5 dependency');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  ─────────────────────────────────────────────');
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
