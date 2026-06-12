#!/usr/bin/env node
/**
 * DOC-UNDERSTANDING-1 / Phase B — per-side unit limit tests.
 *
 * Proves the schema validator now accepts up to 500 units per side
 * (red_units / blue_units_initial / optional neutral_units) and still
 * REJECTS 501 — i.e. the limit was raised, not removed.
 *
 * Pure static test — no server, no Ollama. Run:
 *   node UI_MOdified/scripts/test-unit-limits-500-1.js
 * Exit code 0 = all pass, 1 = any failure.
 */
'use strict';

const path = require('path');
const validator = require(path.join('..', 'server', 'ai', 'scenario-validator'));
const spec      = require(path.join('..', 'server', 'ai', 'scenario-schema-spec'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── A fully-valid baseline scenario generator ───────────────────────
// Every required top-level field is present and every cross-field
// invariant holds, so the ONLY thing that can flip ok=false is a count
// that exceeds a COUNT_BOUNDS ceiling. That isolates the limit behavior.
const BOX  = [34.0, 32.0, 36.0, 34.0];     // [lonMin, latMin, lonMax, latMax]
const PT   = [35.0, 33.0];                 // a point inside BOX
const STEPS = 4;

function mkSteps() {
    return Array.from({ length: STEPS }, (_, i) => ({
        index: i, time_label: `H${i * 24}`, elapsed_hours: i * 24, phase: `PHASE ${i + 1}`,
    }));
}
function redUnits(n) {
    return Array.from({ length: n }, (_, i) => ({
        uid: `R-${i}`, label: `red ${i}`, bls: 'BLS-1', appear: 1, role: 'inf', coord: PT.slice(),
    }));
}
function blueUnits(n) {
    return Array.from({ length: n }, (_, i) => ({
        unit_uid: `B-${i}`, base_id: `b${i}`, coord: PT.slice(),
    }));
}
function neutralUnits(n) {
    return Array.from({ length: n }, (_, i) => ({
        uid: `N-${i}`, label: `civ ${i}`, kind: 'civilian', coord: PT.slice(),
    }));
}
function baseScenario(red, blue, neutral) {
    const s = {
        name: 'limit_test', scenario_label: 'Limit test',
        map_bbox: BOX.slice(),
        obj: { name: 'OBJ TEST', coord: PT.slice(), target_depth_km: 10, carver: 5 },
        pipeline: [[34.5, 32.5], [34.8, 32.8], [35.0, 33.0]],
        red_units: redUnits(red),
        blue_units_initial: blueUnits(blue),
        blue_units_base_ids: blueUnits(blue).map(b => b.base_id),
        bls_template: [{ name: 'BLS-1', coord: [34.6, 32.6] }],
        phase_table: mkSteps(),
        steps: mkSteps(),
    };
    if (neutral != null) s.neutral_units = neutralUnits(neutral);
    return s;
}
const hasCountErr = (res, field) =>
    res.errors.some(e => e.path === field && /out of allowed range/.test(e.msg));

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DOC-UNDERSTANDING-1 / Phase B — per-side unit limits (max 500)');
console.log('══════════════════════════════════════════════════════════════════\n');

// ── Limits are exactly 500 in the single source of truth ────────────
test('COUNT_BOUNDS: red/blue/neutral max === 500', () => {
    assert(spec.COUNT_BOUNDS.red_units.max === 500, `red max is ${spec.COUNT_BOUNDS.red_units.max}`);
    assert(spec.COUNT_BOUNDS.blue_units_initial.max === 500, `blue max is ${spec.COUNT_BOUNDS.blue_units_initial.max}`);
    assert(spec.COUNT_BOUNDS.neutral_units && spec.COUNT_BOUNDS.neutral_units.max === 500,
        'neutral_units bound missing or != 500');
});

// ── 500 per side PASSES (full validation, ok=true) ──────────────────
test('500 red + 500 blue → ok=true (valid)', () => {
    const res = validator.validateScenario(baseScenario(500, 500));
    assert(res.ok === true, 'expected ok=true; errors: ' + validator.formatErrors(res.errors));
    assert(res.summary.redCount === 500 && res.summary.blueCount === 500, 'summary counts wrong');
});

// ── 501 per side FAILS (validation not removed) ─────────────────────
test('501 red → ok=false with red_units range error', () => {
    const res = validator.validateScenario(baseScenario(501, 39));
    assert(res.ok === false, 'expected ok=false at 501 red');
    assert(hasCountErr(res, 'red_units'), 'expected red_units out-of-range error');
});
test('501 blue → ok=false with blue_units_initial range error', () => {
    const res = validator.validateScenario(baseScenario(11, 501));
    assert(res.ok === false, 'expected ok=false at 501 blue');
    assert(hasCountErr(res, 'blue_units_initial'), 'expected blue_units_initial out-of-range error');
});

// ── Neutral side: optional, capped at 500 only when present ─────────
test('neutral absent → no neutral error, scenario valid', () => {
    const res = validator.validateScenario(baseScenario(11, 39));            // no neutral arg
    assert(res.ok === true, 'baseline without neutral should be valid');
    assert(!hasCountErr(res, 'neutral_units'), 'absent neutral must not error');
    assert(res.summary.neutralCount === 0, 'neutralCount should be 0 when absent');
});
test('500 neutral present → ok=true', () => {
    const res = validator.validateScenario(baseScenario(11, 39, 500));
    assert(res.ok === true, 'expected ok=true with 500 neutral; errors: ' + validator.formatErrors(res.errors));
    assert(res.summary.neutralCount === 500, 'neutralCount should be 500');
});
test('501 neutral present → ok=false with neutral_units range error', () => {
    const res = validator.validateScenario(baseScenario(11, 39, 501));
    assert(res.ok === false, 'expected ok=false at 501 neutral');
    assert(hasCountErr(res, 'neutral_units'), 'expected neutral_units out-of-range error');
});

// ── Regression: the retired W3 200-red cap no longer bites ──────────
test('250 red on a w3-rich scenario → no range error (old cap was 200)', () => {
    const s = baseScenario(250, 39);
    s.schema_variant = 'w3-rich';
    const res = validator.validateScenario(s);
    assert(!hasCountErr(res, 'red_units'), '250 red must be allowed now (was capped at 200 for W3)');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
