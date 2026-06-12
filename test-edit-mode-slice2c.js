#!/usr/bin/env node
/**
 * test-edit-mode-slice2c.js
 *
 * Static (no server) verifier for Edit Mode Slice 2C — stepped layout +
 * Time & Duration + Briefing + New Scenario stamping. Exercises pure
 * helpers exposed under window.AppEditMode._testing.
 *
 * Sibling to test-edit-mode-slice2{a,b}.js. Run:
 *   node test-edit-mode-slice2c.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');
const SAMPLE_PATH    = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
const VALIDATOR_PATH = path.join(ROOT, 'UI_MOdified/server/ai/scenario-validator.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function deepEq(a, b, label) {
    ok(JSON.stringify(a) === JSON.stringify(b), label,
       'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

// ── Load the IIFE into a sandbox (same pattern as 2A/2B tests) ─────────────
const sandboxWindow = { AppEditMode: null };
const stubDoc = {
    createElement: function () { return { setAttribute() {}, appendChild() {}, addEventListener() {}, style: {} }; },
    getElementById: function () { return null; },
    addEventListener: function () {}
};
const fnStub = function () {};
const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', src)(
    sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub
);

const T = sandboxWindow.AppEditMode && sandboxWindow.AppEditMode._testing;
ok(!!T, 'AppEditMode._testing exposed');
if (!T) { process.exit(1); }
ok(Array.isArray(T.STEPS) && T.STEPS.length === 13, 'STEPS has 13 entries');
ok(typeof T.stepIsComplete === 'function', 'stepIsComplete exposed');
ok(typeof T.synthesizeDefaultPhaseTable === 'function', 'synthesizeDefaultPhaseTable exposed');
ok(typeof T.ensureStepsMatchPhaseTable === 'function', 'ensureStepsMatchPhaseTable exposed');
ok(Array.isArray(T.PHASES_ENUM) && T.PHASES_ENUM.length === 6, 'PHASES_ENUM has 6 entries');

// Index the STEPS by id for predicate tests
const idIdx = {};
T.STEPS.forEach((s, i) => { idIdx[s.id] = i; });

// ── 1. STEPS table shape ─────────────────────────────────────────────────
console.log('\n[1] STEPS table — CMO build-order coverage');
{
    const ids = T.STEPS.map(s => s.id);
    deepEq(ids,
        ['meta','map','sides','posture','doctrine','time','weather','geom','forces','missions','events','briefing','save'],
        'step ids in CMO build-order');
    const gaps = T.STEPS.filter(s => s.gap).map(s => s.id);
    deepEq(gaps, ['doctrine','weather','missions','events'], 'gap steps are the engine GAPs');
    // Every non-gap step must have a render fn
    const nonGapsRender = T.STEPS.filter(s => !s.gap).every(s => typeof s.render === 'function');
    ok(nonGapsRender, 'every non-gap step has a render function');
}

// ── 2. synthesizeDefaultPhaseTable ───────────────────────────────────────
console.log('\n[2] synthesizeDefaultPhaseTable — Sahil H-3 → H+120 default');
{
    const t = T.synthesizeDefaultPhaseTable();
    eq(t.length, 6, '6 rows');
    deepEq(t.map(r => r.time_label), ['H-3','H+0','H+12','H+36','H+72','H+120'], 'time_labels');
    deepEq(t.map(r => r.phase),
        ['PRE-H','PHASE 1','PHASE 2A','PHASE 2B','PHASE 3','RESOLUTION'],
        'phase progression');
    eq(t[0].elapsed_hours, -3, 'PRE-H starts at H-3');
    eq(t[5].elapsed_hours, 120, 'RESOLUTION at H+120');
    eq(t[0].index, 0, 'index starts at 0');
}

// ── 3. ensureStepsMatchPhaseTable — lockstep invariant ───────────────────
console.log('\n[3] ensureStepsMatchPhaseTable — phase_table.length === steps.length');
{
    const d = { phase_table: T.synthesizeDefaultPhaseTable(), steps: [] };
    T.ensureStepsMatchPhaseTable(d);
    eq(d.steps.length, 6, 'steps grew to match phase_table');
    eq(d.steps[2].time_label, 'H+12', 'steps[2].time_label mirrors phase_table');

    d.phase_table.pop();
    T.ensureStepsMatchPhaseTable(d);
    eq(d.steps.length, 5, 'steps shrank to match phase_table');

    d.phase_table[1].time_label = 'H-1';
    d.phase_table[1].phase = 'PHASE 1';
    T.ensureStepsMatchPhaseTable(d);
    eq(d.steps[1].time_label, 'H-1', 'edit propagates from phase_table to steps');
    eq(d.steps[1].phase, 'PHASE 1', 'phase propagates');
}

// ── 4. stepIsComplete predicates ─────────────────────────────────────────
console.log('\n[4] stepIsComplete predicates');
{
    const empty = {};
    eq(T.stepIsComplete(empty, idIdx.meta), false, 'empty draft — Step 1 (meta) not complete');
    eq(T.stepIsComplete(empty, idIdx.map),  false, 'empty draft — Step 2 (map) not complete');
    eq(T.stepIsComplete(empty, idIdx.sides), false, 'empty draft — Step 3 (sides) not complete');
    // Gap steps return null
    eq(T.stepIsComplete(empty, idIdx.doctrine), null, 'gap step (doctrine) returns null');
    eq(T.stepIsComplete(empty, idIdx.weather),  null, 'gap step (weather) returns null');

    // Sahil sample — built scenario, should pass most non-gap predicates
    const sahil = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
    eq(T.stepIsComplete(sahil, idIdx.meta),    true, 'Sahil — meta complete');
    eq(T.stepIsComplete(sahil, idIdx.map),     true, 'Sahil — map complete (bbox + ao)');
    eq(T.stepIsComplete(sahil, idIdx.sides),   true, 'Sahil — sides complete');
    eq(T.stepIsComplete(sahil, idIdx.posture), true, 'Sahil — posture complete');
    eq(T.stepIsComplete(sahil, idIdx.time),    true, 'Sahil — phase_table+steps complete');
    eq(T.stepIsComplete(sahil, idIdx.geom),    true, 'Sahil — geom complete (bls + obj + pipeline)');
    eq(T.stepIsComplete(sahil, idIdx.forces),  true, 'Sahil — forces complete');
    eq(T.stepIsComplete(sahil, idIdx.briefing), true, 'Sahil — briefing complete (every step has narrative_en)');
    eq(T.stepIsComplete(sahil, idIdx.save),    true, 'Sahil — save predicate accepts (hard rules pass)');

    // Remove one narrative — briefing predicate flips to false
    const sahil2 = JSON.parse(JSON.stringify(sahil));
    sahil2.steps[1].narrative_en_baseline = '';
    eq(T.stepIsComplete(sahil2, idIdx.briefing), false, 'briefing false when one step missing EN narrative');
}

// ── 5. stepPillClass — gap vs ok vs empty ────────────────────────────────
console.log('\n[5] stepPillClass');
{
    const sahil = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
    eq(T.stepPillClass(sahil, idIdx.doctrine), 'gap', 'gap step → gap pill');
    eq(T.stepPillClass(sahil, idIdx.meta),     'ok',  'complete non-gap → ok pill');
    const empty = {};
    eq(T.stepPillClass(empty, idIdx.meta),     'empty', 'incomplete non-gap → empty pill');
}

// ── 6. PHASES_ENUM mirrors server enum ───────────────────────────────────
console.log('\n[6] PHASES_ENUM');
{
    deepEq(T.PHASES_ENUM,
        ['PRE-H', 'PHASE 1', 'PHASE 2A', 'PHASE 2B', 'PHASE 3', 'RESOLUTION'],
        'mirrors UI_MOdified/server/ai/adjudicator-schema.js:15');
}

// ── 7. Existing 2A + 2B helpers still available (no regression in exports)
console.log('\n[7] Slice 2A/2B helpers still on _testing (no regression)');
{
    ['fillGeographyDefaults','validateDraftHardRules','makeMapBboxAoPolygon',
     'fillForcesDefaults','syncBlueBaseIds','validateForcesHardRules',
     'validateAllHardRules','RED_UNIT_ROLES','nextFreeUid'].forEach(k => {
        ok(typeof T[k] !== 'undefined', '_testing.' + k + ' still exposed');
    });
}

// ── 8. Synthesize + validate round-trip ──────────────────────────────────
console.log('\n[8] Sahil + synth → still ok:true against real validator');
{
    const validator = require(VALIDATOR_PATH);
    const sahil = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
    // Replace phase_table with the synthesised default and re-sync steps —
    // Sahil's own phase_table happens to match the default, so this is a
    // safe round-trip.
    sahil.phase_table = T.synthesizeDefaultPhaseTable();
    T.ensureStepsMatchPhaseTable(sahil);
    eq(validator.validateScenario(sahil).ok, true, 'still ok:true after synth + sync');
    eq(sahil.steps.length, 6, 'steps remained 6 after sync');
    // Briefing predicate may flip false (synth wipes narrative on grown steps)
    // — we don't assert it here; predicate behavior covered in [4].
}

// ── Result ───────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
