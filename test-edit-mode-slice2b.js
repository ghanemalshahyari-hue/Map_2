#!/usr/bin/env node
/**
 * test-edit-mode-slice2b.js
 *
 * Static (no server) verifier for Edit Mode Slice 2B — Forces.
 *
 * Loads UI_MOdified/client/shell/scenario-edit-mode.js into a minimal DOM
 * sandbox, exercises the Slice 2B helpers exposed under
 * window.AppEditMode._testing, then confirms the resulting draft validates
 * green against the real server-side validator at
 * UI_MOdified/server/ai/scenario-validator.js.
 *
 * Mirrors the convention of test-edit-mode-slice2a.js. Run:
 *   node test-edit-mode-slice2b.js
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

// ── Load the IIFE into a sandbox (same pattern as slice 2A test) ──────────
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
ok(typeof T.fillForcesDefaults      === 'function', 'fillForcesDefaults exposed');
ok(typeof T.syncBlueBaseIds         === 'function', 'syncBlueBaseIds exposed');
ok(typeof T.validateForcesHardRules === 'function', 'validateForcesHardRules exposed');
ok(typeof T.validateAllHardRules    === 'function', 'validateAllHardRules exposed');
ok(Array.isArray(T.RED_UNIT_ROLES) && T.RED_UNIT_ROLES.length === 7, 'RED_UNIT_ROLES has 7 entries');

// ── 1. fillForcesDefaults ────────────────────────────────────────────────
console.log('\n[1] fillForcesDefaults — empty arrays + no clobber');
{
    const d = {};
    T.fillForcesDefaults(d);
    deepEq(d.red_units,           [], 'red_units default []');
    deepEq(d.blue_units_initial,  [], 'blue_units_initial default []');
    deepEq(d.blue_units_base_ids, [], 'blue_units_base_ids default []');

    const seeded = {
        red_units:           [{ uid: 'R1', label: 'Bde', bls: 'X', appear: 0, role: 'Main effort', coord: [1, 1] }],
        blue_units_initial:  [{ unit_uid: 'B1', base_id: 'b1', coord: [2, 2] }],
        blue_units_base_ids: ['b1']
    };
    T.fillForcesDefaults(seeded);
    eq(seeded.red_units.length,           1, 'authored red_units preserved');
    eq(seeded.blue_units_initial.length,  1, 'authored blue_units_initial preserved');
    eq(seeded.blue_units_base_ids.length, 1, 'authored blue_units_base_ids preserved');
}

// ── 2. syncBlueBaseIds — derive from blue_units_initial[].base_id ────────
console.log('\n[2] syncBlueBaseIds');
{
    const d = {
        blue_units_initial: [
            { unit_uid: 'BLUE-HQ', base_id: 'HQ',   coord: [0, 0] },
            { unit_uid: 'BLUE-1',  base_id: 'B1',   coord: [0, 0] },
            { unit_uid: 'BLUE-2',  base_id: 'B2',   coord: [0, 0] }
        ],
        blue_units_base_ids: ['stale', 'data']
    };
    T.syncBlueBaseIds(d);
    deepEq(d.blue_units_base_ids, ['HQ', 'B1', 'B2'], 'base_ids match blue_units_initial order');

    d.blue_units_initial.splice(1, 1); // remove the middle one
    T.syncBlueBaseIds(d);
    deepEq(d.blue_units_base_ids, ['HQ', 'B2'], 'removal mirrored');

    T.syncBlueBaseIds({}); // missing blue_units_initial — no throw
    const empty = {};
    T.syncBlueBaseIds(empty);
    deepEq(empty.blue_units_base_ids, [], 'empty draft yields []');
}

// ── 3. validateForcesHardRules ───────────────────────────────────────────
console.log('\n[3] validateForcesHardRules');
{
    const baseValid = {
        bls_template: [{ name: 'BLS-A', coord: [0, 0] }, { name: 'BLS-B', coord: [1, 1] }],
        steps:        [{ index: 0 }, { index: 1 }, { index: 2 }],
        red_units:    [
            { uid: 'R1', label: 'a', bls: 'BLS-A', appear: 0, role: 'Main effort', coord: [0, 0] },
            { uid: 'R2', label: 'b', bls: 'BLS-B', appear: 2, role: 'Recon',       coord: [1, 1] }
        ],
        blue_units_initial: [
            { unit_uid: 'B1', base_id: 'b1', coord: [0, 0] },
            { unit_uid: 'B2', base_id: 'b2', coord: [1, 1] }
        ]
    };
    eq(T.validateForcesHardRules(baseValid).ok, true, 'valid draft accepted');

    const badBls = JSON.parse(JSON.stringify(baseValid));
    badBls.red_units[0].bls = 'BLS-NOPE';
    const r1 = T.validateForcesHardRules(badBls);
    eq(r1.ok, false, 'unknown bls rejected');
    ok(/BLS-NOPE/.test(r1.why), 'reason names the bad BLS', r1.why);

    const badAppear = JSON.parse(JSON.stringify(baseValid));
    badAppear.red_units[0].appear = 99;
    const r2 = T.validateForcesHardRules(badAppear);
    eq(r2.ok, false, 'appear out of range rejected');
    ok(/99/.test(r2.why), 'reason names the bad appear', r2.why);

    const badNeg = JSON.parse(JSON.stringify(baseValid));
    badNeg.red_units[0].appear = -1;
    eq(T.validateForcesHardRules(badNeg).ok, false, 'negative appear rejected');

    const dupUid = JSON.parse(JSON.stringify(baseValid));
    dupUid.red_units[1].uid = 'R1';
    const r3 = T.validateForcesHardRules(dupUid);
    eq(r3.ok, false, 'duplicate red uid rejected');
    ok(/duplicates "R1"/.test(r3.why), 'reason names the duplicate uid', r3.why);

    const emptyUid = JSON.parse(JSON.stringify(baseValid));
    emptyUid.red_units[0].uid = '';
    eq(T.validateForcesHardRules(emptyUid).ok, false, 'empty red uid rejected');

    const emptyBlueUid = JSON.parse(JSON.stringify(baseValid));
    emptyBlueUid.blue_units_initial[0].unit_uid = '';
    eq(T.validateForcesHardRules(emptyBlueUid).ok, false, 'empty blue unit_uid rejected');

    const dupBlueUid = JSON.parse(JSON.stringify(baseValid));
    dupBlueUid.blue_units_initial[1].unit_uid = 'B1';
    eq(T.validateForcesHardRules(dupBlueUid).ok, false, 'duplicate blue unit_uid rejected');

    // missing arrays → vacuously ok
    eq(T.validateForcesHardRules({}).ok, true, 'empty draft is vacuously ok');
}

// ── 4. validateAllHardRules — composition of 2A + 2B ─────────────────────
console.log('\n[4] validateAllHardRules');
{
    // 2A failure surfaces
    const carverBad = { obj: { carver: 75 } };
    const r1 = T.validateAllHardRules(carverBad);
    eq(r1.ok, false, 'carver violation surfaces through combined rule');
    ok(/carver/.test(r1.why), 'why mentions carver', r1.why);

    // 2B failure surfaces
    const blsBad = {
        bls_template: [{ name: 'X' }],
        red_units:    [{ uid: 'R1', bls: 'Y', appear: 0 }]
    };
    const r2 = T.validateAllHardRules(blsBad);
    eq(r2.ok, false, '2B violation surfaces through combined rule');
    ok(/bls/.test(r2.why), 'why mentions bls', r2.why);

    // Both clean
    eq(T.validateAllHardRules({ obj: { carver: 6 } }).ok, true, 'clean draft accepted');
}

// ── 5. Real validator on Sahil sample after 2B edits ─────────────────────
console.log('\n[5] real scenario-validator — Sahil sample with Slice 2B edits');
{
    const validator = require(VALIDATOR_PATH);
    const sample    = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
    eq(validator.validateScenario(sample).ok, true, 'baseline sample validates');

    const edited = JSON.parse(JSON.stringify(sample));
    T.fillForcesDefaults(edited);

    // Add a new Red unit (must reference an existing bls and a valid step).
    const newUid = T.nextFreeUid('RED', edited.red_units, 'uid');
    edited.red_units.push({
        uid: newUid, label: 'Added Mech Coy', bls: 'BLS-CENTER',
        appear: 1, role: 'Support', coord: [18.86, 30.23], strength: 1.0,
        sidc: '10061000001211000000'
    });

    // Remove a Blue unit (the reserves) and re-derive base_ids.
    const beforeBlueLen = edited.blue_units_initial.length;
    edited.blue_units_initial = edited.blue_units_initial.filter(u => u.unit_uid !== 'BLUE-RES');
    T.syncBlueBaseIds(edited);
    eq(edited.blue_units_initial.length, beforeBlueLen - 1, 'Blue list shrank by 1');
    eq(edited.blue_units_base_ids.length, edited.blue_units_initial.length,
       'base_ids length matches blue_units_initial.length after remove');
    ok(edited.blue_units_base_ids.indexOf('RES') === -1, 'removed unit no longer in base_ids');

    // Validate
    eq(T.validateAllHardRules(edited).ok, true, 'edited draft passes Slice 2B hard rules');
    const r = validator.validateScenario(edited);
    eq(r.ok, true, 'edited sample still validates ok:true against server validator');
    if (!r.ok) console.log('   errors:', r.errors);
}

// ── 6. Invalid edits caught by validateAllHardRules + server validator ───
console.log('\n[6] real scenario-validator catches what 2B blocks');
{
    const validator = require(VALIDATOR_PATH);
    const sample    = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));

    // 6a: unknown BLS
    const bad1 = JSON.parse(JSON.stringify(sample));
    bad1.red_units[0].bls = 'BLS-NOPE';
    eq(T.validateAllHardRules(bad1).ok, false, '2B blocks unknown bls client-side');
    eq(validator.validateScenario(bad1).ok, false, 'server validator also rejects unknown bls');

    // 6b: appear out of range
    const bad2 = JSON.parse(JSON.stringify(sample));
    bad2.red_units[0].appear = 999;
    eq(T.validateAllHardRules(bad2).ok, false, '2B blocks appear out of range client-side');
    eq(validator.validateScenario(bad2).ok, false, 'server validator also rejects appear out of range');
}

// ── 7. nextFreeUid avoids collisions ─────────────────────────────────────
console.log('\n[7] nextFreeUid');
{
    eq(T.nextFreeUid('RED', [], 'uid'), 'RED-1', 'first uid is RED-1');
    eq(T.nextFreeUid('RED', [{ uid: 'RED-1' }], 'uid'), 'RED-2', 'skips RED-1');
    eq(T.nextFreeUid('RED',
        [{ uid: 'RED-1' }, { uid: 'RED-2' }, { uid: 'RED-4' }], 'uid'),
        'RED-3', 'fills the gap');
    eq(T.nextFreeUid('BLUE', [{ unit_uid: 'BLUE-1' }], 'unit_uid'),
       'BLUE-2', 'uses configurable key');
}

// ── Result ───────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
