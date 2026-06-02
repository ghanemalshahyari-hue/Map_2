#!/usr/bin/env node
/**
 * test-edit-mode-slice2d.js
 *
 * Static (no server) verifier for Edit Mode Slice 2D-1 — Forces (OOB)
 * tree + detail-pane + search + role free-text + map-pick.
 *
 * Sibling to test-edit-mode-slice2{a,b,c}.js. Run:
 *   node test-edit-mode-slice2d.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');
const WG3_PATH       = path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json');
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

// ── Load IIFE into sandbox (same pattern as 2A/2B/2C tests) ───────────────
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
ok(typeof T.groupByEchelon === 'function', 'groupByEchelon exposed');
ok(typeof T.unitMatchesFilter === 'function', 'unitMatchesFilter exposed');
ok(Array.isArray(T.RED_UNIT_ROLES) && T.RED_UNIT_ROLES.length === 7, 'RED_UNIT_ROLES present (used as datalist suggestions, NOT a strict select)');

// ── 1. groupByEchelon — bucketed in insertion order, "(no echelon)" fallback ──
console.log('\n[1] groupByEchelon');
{
    const units = [
        { uid: 'A1', echelon: 'division' },
        { uid: 'B1', echelon: 'brigade'  },
        { uid: 'A2', echelon: 'division' },
        { uid: 'X',                       },   // no echelon
        { uid: 'B2', echelon: 'brigade'  }
    ];
    const g = T.groupByEchelon(units);
    deepEq(g.order, ['division', 'brigade', '(no echelon)'], 'order is insertion-order of first-seen echelon');
    eq(g.groups.division.length, 2, 'division has 2 units');
    eq(g.groups.brigade.length,  2, 'brigade has 2 units');
    eq(g.groups['(no echelon)'].length, 1, 'no-echelon fallback bucket');
    eq(g.groups.division[0].uid, 'A1', 'order within bucket preserved');
    eq(g.groups.division[1].uid, 'A2', 'order within bucket preserved');
}

// ── 2. unitMatchesFilter — case-insensitive substring across many fields ──
console.log('\n[2] unitMatchesFilter');
{
    const u = { uid: 'RED-007', label: 'Mech Bn', role: 'mech_inf_div',
                bls: 'BLS-CENTER', echelon: 'battalion' };
    eq(T.unitMatchesFilter(u, ''),        true,  'empty filter matches everything');
    eq(T.unitMatchesFilter(u, 'red-007'), true,  'matches uid (case-insensitive)');
    eq(T.unitMatchesFilter(u, 'MECH'),    true,  'matches role substring');
    eq(T.unitMatchesFilter(u, 'CENTER'),  true,  'matches bls');
    eq(T.unitMatchesFilter(u, 'battalion'), true, 'matches echelon');
    eq(T.unitMatchesFilter(u, 'Mech Bn'), true,  'matches label exact');
    eq(T.unitMatchesFilter(u, 'corvette'),false, 'non-matching substring rejected');

    // Blue-shape unit (unit_uid + base_id)
    const b = { unit_uid: 'BLUE-HQ', base_id: 'HQ', echelon: 'brigade' };
    eq(T.unitMatchesFilter(b, 'hq'),      true,  'matches blue unit_uid + base_id');
    eq(T.unitMatchesFilter(b, 'BRIGADE'), true,  'matches blue echelon');
}

// ── 3. Role free-text accepts arbitrary values (data-corruption fix) ──────
console.log('\n[3] Role enum bug fix — free-text suggestions, not strict select');
{
    // RED_UNIT_ROLES has only 7 entries. Verify the contract: it's a *suggestions*
    // list, not an enforced enum. The renderer uses <input list=…> + <datalist>,
    // so an arbitrary role like wargame3's "mech_inf_div" survives a round-trip.
    const cmoRoles = T.RED_UNIT_ROLES;
    ok(cmoRoles.indexOf('Main effort') !== -1, 'Main effort is a suggestion');
    ok(cmoRoles.indexOf('mech_inf_div') === -1, 'mech_inf_div NOT in suggestions (intentionally — datalist is non-binding)');
    // Build a mock unit with a non-canonical role; the validator should accept it.
    const validator = require(VALIDATOR_PATH);
    const sahil = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
    const u = sahil.red_units[0];
    u.role = 'mech_inf_div';     // wargame3-style role
    const r = validator.validateScenario(sahil);
    eq(r.ok, true, 'validator accepts non-canonical role (no enum coercion)');
}

// ── 4. wargame3 echelon variety — confirms why a strict enum would break ──
console.log('\n[4] wargame3 scale data — echelon + role variety');
if (fs.existsSync(WG3_PATH)) {
    const wg3 = JSON.parse(fs.readFileSync(WG3_PATH, 'utf8'));
    const distinctRoles    = new Set(wg3.red_units.map(u => u.role));
    const distinctEchelons = new Set(wg3.red_units.map(u => u.echelon));
    ok(distinctRoles.size    >= 20,  'wargame3 red_units have ≥20 distinct roles (got ' + distinctRoles.size + ')');
    ok(distinctEchelons.size >= 3,   'wargame3 red_units have ≥3 distinct echelons (got ' + distinctEchelons.size + ')');
    // Confirm canonical-role overlap with our suggestion list is tiny — proves
    // that a strict <select> of RED_UNIT_ROLES would corrupt the vast majority.
    const overlap = [...distinctRoles].filter(r => T.RED_UNIT_ROLES.indexOf(r) !== -1);
    ok(overlap.length <= 2, 'wargame3 roles overlap with the 7 CMO suggestions in ≤ 2 entries (got ' + overlap.length + ' — a strict select would corrupt the rest)');

    // groupByEchelon over wargame3.red_units yields a manageable group count.
    const g = T.groupByEchelon(wg3.red_units);
    ok(g.order.length <= 10, 'wargame3 echelon-group count is ≤ 10 (got ' + g.order.length + ' — manageable tree)');
} else {
    ok(false, 'wargame3 scenario not on disk at ' + WG3_PATH);
}

// ── 5. Regression: 2A/2B/2C helpers still exposed (no broken contracts) ───
console.log('\n[5] 2A/2B/2C _testing helpers still present');
{
    [
        'defaultSides', 'defaultPostures', 'fillGeographyDefaults',
        'validateDraftHardRules', 'makeMapBboxAoPolygon',
        'fillForcesDefaults', 'syncBlueBaseIds', 'validateForcesHardRules',
        'validateAllHardRules', 'nextFreeUid',
        'STEPS', 'stepIsComplete', 'synthesizeDefaultPhaseTable',
        'ensureStepsMatchPhaseTable', 'PHASES_ENUM'
    ].forEach(k => ok(typeof T[k] !== 'undefined', '_testing.' + k + ' still exposed'));
}

// ── 6. Real validator on Sahil after a wargame3-style role override ───────
console.log('\n[6] Sahil + wargame3-style role + groupByEchelon → still ok:true');
{
    const validator = require(VALIDATOR_PATH);
    const sahil = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
    sahil.red_units.forEach((u, i) => {
        u.role = ['mech_inf_div','sam_s300','submarine','awacs','uav_isr','manpads'][i % 6];
        u.echelon = ['division','brigade','battalion','squadron','unit'][i % 5];
    });
    eq(validator.validateScenario(sahil).ok, true, 'validator still ok:true after non-canonical roles + echelons');
    const g = T.groupByEchelon(sahil.red_units);
    eq(g.order.length, 5, 'groupByEchelon over the 5 echelons assigned');
}

// ── Result ────────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
