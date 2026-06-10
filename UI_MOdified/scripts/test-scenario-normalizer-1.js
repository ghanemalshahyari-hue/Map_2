#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / Phase C — scenario unit normalizer tests.
 *
 * Proves the deterministic normalizer caps each side at 500 while
 * preserving the units that matter, aggregating duplicate support units,
 * never inventing units, and producing a reconciling report — and that a
 * normalized scenario passes the (Phase B) validator, i.e. it LOADS.
 *
 * Pure static test — no server. Run:
 *   node UI_MOdified/scripts/test-scenario-normalizer-1.js
 */
'use strict';

const path = require('path');
const norm      = require(path.join('..', 'server', 'ai', 'scenario-normalizer'));
const validator = require(path.join('..', 'server', 'ai', 'scenario-validator'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── fixtures ────────────────────────────────────────────────────────
const BOX = [34.0, 32.0, 37.0, 34.0];
const PT  = [35.0, 33.0];        // objective coord
const FAR = [36.5, 33.5];        // ~140 km from PT → never "objective-linked"
const STEPS = 4;

function mkSteps() {
    return Array.from({ length: STEPS }, (_, i) => ({
        index: i, time_label: `H${i * 24}`, elapsed_hours: i * 24, phase: `PHASE ${i + 1}`,
    }));
}
// All-valid red units (schema requires `bls`), referencing the one known BLS.
function redValid(n) {
    return Array.from({ length: n }, (_, i) => ({
        uid: `R-${i}`, label: `red ${i}`, bls: 'BLS-1', appear: 1, role: 'inf', coord: FAR.slice(),
    }));
}
function bluePlain(n, prefix) {
    return Array.from({ length: n }, (_, i) => ({
        unit_uid: `${prefix}-${i}`, base_id: `${prefix.toLowerCase()}${i}`,
        role: 'support', echelon: 'CO', coord: FAR.slice(),
    }));
}
function neutralPlain(n) {
    return Array.from({ length: n }, (_, i) => ({
        uid: `N-${i}`, label: `civ ${i}`, kind: 'civilian', coord: FAR.slice(),
    }));
}
function baseScn({ red, blue, neutral }) {
    const s = {
        name: 'norm_test', scenario_label: 'Normalizer test',
        map_bbox: BOX.slice(),
        obj: { name: 'OBJ TEST', coord: PT.slice(), target_depth_km: 10, carver: 5 },
        pipeline: [[34.5, 32.5], [34.8, 32.8], [35.0, 33.0]],
        red_units: red,
        blue_units_initial: blue,
        blue_units_base_ids: blue.map(b => b.base_id),
        bls_template: [{ name: 'BLS-1', coord: [34.6, 32.6] }],
        phase_table: mkSteps(),
        steps: mkSteps(),
    };
    if (neutral) s.neutral_units = neutral;
    return s;
}
const idSet = (arr, key) => new Set(arr.map(u => String(u[key])));
function reconciles(report, side, before) {
    const after  = report.after[side];
    const dropped = report.dropped.filter(d => d.side === side).length;
    const folded = report.aggregated.filter(a => a.side === side)
        .reduce((s, a) => s + (a.merged_count - 1), 0);
    return before === after + dropped + folded;
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DOC-UNDERSTANDING-1 / Phase C — scenario unit normalizer');
console.log('══════════════════════════════════════════════════════════════════\n');

// ── 1. Under cap → no-op ────────────────────────────────────────────
test('under cap (200 red / 39 blue) → changed=false, untouched', () => {
    const s = baseScn({ red: redValid(200), blue: bluePlain(39, 'B') });
    const r = norm.normalizeScenario(s);
    assert(r.changed === false, 'should not change when under cap');
    assert(s.red_units.length === 200 && s.blue_units_initial.length === 39, 'arrays must be untouched');
    assert(r.report.dropped.length === 0 && r.report.aggregated.length === 0, 'no drops/aggregations expected');
});

// ── 2. BLUE over cap → preserve + aggregate + still validates ───────
test('600 blue → capped to 500, preserves HQ/AD/referenced, aggregates plains', () => {
    const blue = [
        { unit_uid: 'B-HQ',  base_id: 'bhq',  role: 'Command Post', echelon: 'BDE', coord: FAR.slice() },
        { unit_uid: 'B-AD',  base_id: 'bad',  role: 'Air Defense SAM', coord: FAR.slice() },
        { unit_uid: 'B-REF', base_id: 'bref', role: 'recon', coord: FAR.slice() },
        ...bluePlain(597, 'BP'),
    ];
    const s = baseScn({ red: redValid(11), blue });
    s.steps[1].actors = [{ uid: 'B-REF', side: 'BLUE', action_what: 'screen' }];   // make B-REF referenced
    const before = blue.length;
    const origIds = idSet(blue, 'unit_uid');

    const r = norm.normalizeScenario(s);
    assert(r.changed === true, 'should change');
    assert(s.blue_units_initial.length === 500, `blue should be 500, got ${s.blue_units_initial.length}`);

    const keptIds = idSet(s.blue_units_initial, 'unit_uid');
    for (const must of ['B-HQ', 'B-AD', 'B-REF']) assert(keptIds.has(must), `${must} must be preserved`);

    // aggregation happened on the one big support group
    assert(r.report.aggregated.length === 1, `expected 1 aggregate, got ${r.report.aggregated.length}`);
    assert(r.report.aggregated[0].merged_count === 101, `expected merged_count 101, got ${r.report.aggregated[0].merged_count}`);

    // no invention: every kept id + every merged id existed originally
    for (const u of s.blue_units_initial) assert(origIds.has(String(u.unit_uid)), `invented unit ${u.unit_uid}`);
    for (const m of r.report.aggregated[0].merged_uids) assert(origIds.has(m), `merged unknown uid ${m}`);

    // base_ids stay aligned with the trimmed OOB
    assert(s.blue_units_base_ids.length === s.blue_units_initial.length, 'base_ids must realign to 500');

    // report reconciles, and preserved reasons are recorded
    assert(reconciles(r.report, 'blue', before), 'blue counts must reconcile (before = after + dropped + folded)');
    const reason = uid => (r.report.preserved.find(p => p.uid === uid) || {}).reason;
    assert(reason('B-HQ')  === 'hq-command', 'B-HQ reason');
    assert(reason('B-AD')  === 'air-defense/sensor/high-value', 'B-AD reason');
    assert(reason('B-REF') === 'referenced-by-phase', 'B-REF reason');

    // and it LOADS (passes the validator)
    const v = validator.validateScenario(s);
    assert(v.ok === true, 'normalized scenario must validate; errors: ' + validator.formatErrors(v.errors));
});

// ── 3. RED all-preserved over cap → priority trim, still validates ──
test('600 red all bls-linked → trims to 500 by priority (pathological), validates', () => {
    const s = baseScn({ red: redValid(600), blue: bluePlain(20, 'B') });
    const before = 600;
    const origIds = idSet(s.red_units, 'uid');

    const r = norm.normalizeScenario(s);
    assert(r.changed === true, 'should change');
    assert(s.red_units.length === 500, `red should be 500, got ${s.red_units.length}`);
    assert(r.report.dropped.filter(d => d.side === 'red').length === 100, 'should hard-drop 100 red');
    for (const u of s.red_units) assert(origIds.has(String(u.uid)), `invented red unit ${u.uid}`);
    assert(reconciles(r.report, 'red', before), 'red counts must reconcile');
    const v = validator.validateScenario(s);
    assert(v.ok === true, 'normalized scenario must validate; errors: ' + validator.formatErrors(v.errors));
});

// ── 4. NEUTRAL optional side → aggregated + validates ───────────────
test('600 neutral → capped to 500 via aggregation, validates', () => {
    const s = baseScn({ red: redValid(11), blue: bluePlain(20, 'B'), neutral: neutralPlain(600) });
    const before = 600;
    const origIds = idSet(s.neutral_units, 'uid');

    const r = norm.normalizeScenario(s);
    assert(s.neutral_units.length === 500, `neutral should be 500, got ${s.neutral_units.length}`);
    for (const u of s.neutral_units) assert(origIds.has(String(u.uid)), `invented neutral ${u.uid}`);
    assert(reconciles(r.report, 'neutral', before), 'neutral counts must reconcile');
    const v = validator.validateScenario(s);
    assert(v.ok === true, 'normalized scenario must validate; errors: ' + validator.formatErrors(v.errors));
});

// ── 5. Does not invent / does not touch a scenario with no arrays ───
test('missing arrays / non-object → safe no-op', () => {
    assert(norm.normalizeScenario(null).changed === false, 'null is safe');
    assert(norm.normalizeScenario({}).changed === false, 'empty object is safe');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
