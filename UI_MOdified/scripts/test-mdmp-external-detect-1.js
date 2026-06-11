#!/usr/bin/env node
/**
 * MDMP-EXTERNAL-1 / G-1 — JSONC parsing + external MDMP-stage detection.
 *
 * Pins against the sanitized fixtures in devtools/fixtures/mdmp-external/
 * (captured verbatim from the other app's output, incl. its JSONC quirks):
 *   • parseJsonc handles // and block comments, trailing inline comments
 *     (step5 — the case regex stripping failed on), and string contents
 *     are never corrupted.
 *   • classifyJsonInput routes them to 'mdmp_external' with the right
 *     mdmp_step — and does NOT disturb rmooz_scenario / operational_brief /
 *     unknown classification (regression).
 *
 * Pure static test — no server, no LLM. Run:
 *   node UI_MOdified/scripts/test-mdmp-external-detect-1.js
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const { parseJsonc, stripJsonc } = require(path.join('..', 'server', 'ai', 'jsonc'));
const B = require(path.join('..', 'server', 'ai', 'operational-brief'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const FIX = path.join(__dirname, '..', 'devtools', 'fixtures', 'mdmp-external');
const FILES = ['step1.json', 'step3.json', 'step4_out.json', 'step5.json', 'warning_order.json'];
function fixture(name) { return fs.readFileSync(path.join(FIX, name), 'utf8'); }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  MDMP-EXTERNAL-1 / G-1 — JSONC parsing + MDMP detection');
console.log('══════════════════════════════════════════════════════════════════\n');

// ── JSONC parsing ───────────────────────────────────────────────────
test('all 5 fixtures parse via parseJsonc', () => {
    for (const f of FILES) {
        const r = parseJsonc(fixture(f));
        assert(r.ok, `${f} failed: ${r.error}`);
        assert(r.value && typeof r.value === 'object', `${f} did not yield an object`);
    }
});

test('step5.json (trailing inline comments) parses with all 25 keys', () => {
    const r = parseJsonc(fixture('step5.json'));
    assert(r.ok && r.mode === 'jsonc', 'expected jsonc mode');
    assert(Object.keys(r.value).length === 25, `expected 25 keys, got ${Object.keys(r.value).length}`);
    assert('overall_comparison_conclusion' in r.value, 'last key must survive the trailing comment');
});

test('warning_order.json is strict JSON (mode strict)', () => {
    const r = parseJsonc(fixture('warning_order.json'));
    assert(r.ok && r.mode === 'strict', `expected strict, got ${r.mode}`);
});

test('string contents with // and , } are NOT corrupted', () => {
    const tricky = '{ "a": "url http://x/y // not a comment", "b": "نص عربي , } /* ليس تعليقاً */", } // tail';
    const r = parseJsonc(tricky);
    assert(r.ok, 'tricky should parse: ' + (r.error || ''));
    assert(r.value.a === 'url http://x/y // not a comment', 'a corrupted');
    assert(r.value.b === 'نص عربي , } /* ليس تعليقاً */', 'b corrupted');
});

test('trailing commas in objects/arrays are tolerated', () => {
    const r = parseJsonc('{ "x": [1, 2, /* c */ 3, ], "y": { "z": 1, }, }');
    assert(r.ok, r.error);
    assert(r.value.x.length === 3 && r.value.y.z === 1, 'values wrong');
});

test('garbage input → ok:false (never throws)', () => {
    assert(parseJsonc('not json {').ok === false, 'garbage must fail');
    assert(parseJsonc('').ok === false, 'empty must fail');
    assert(parseJsonc(null).ok === false, 'null must fail');
});

// ── MDMP detection ──────────────────────────────────────────────────
const EXPECTED_STEP = {
    'step1.json':         'planning_guidance',
    'step3.json':         'coa_development',
    'step4_out.json':     'coa_analysis',
    'step5.json':         'coa_comparison',
    'warning_order.json': 'planning_guidance',   // field dictionary shares the WARNO key family
};

test('each fixture classifies as mdmp_external with the right step', () => {
    for (const f of FILES) {
        const obj = parseJsonc(fixture(f)).value;
        const kind = B.classifyJsonInput(obj);
        assert(kind === 'mdmp_external', `${f}: kind was ${kind}`);
        const det = B.detectMdmp(obj);
        assert(det.is && det.step === EXPECTED_STEP[f],
            `${f}: step was ${det.step}, expected ${EXPECTED_STEP[f]}`);
        assert(det.matched.length > 0, `${f}: no matched fingerprint keys reported`);
    }
});

// ── classification regressions ──────────────────────────────────────
test('rmooz_scenario / operational_brief / unknown still classify correctly', () => {
    assert(B.classifyJsonInput({ red_units: [], blue_units_initial: [] }) === 'rmooz_scenario', 'scenario');
    assert(B.classifyJsonInput({ operational_brief: { mission: 'x' } }) === 'operational_brief', 'brief');
    assert(B.classifyJsonInput({ foo: 'bar', n: 3 }) === 'unknown', 'unknown');
    assert(B.classifyJsonInput(null) === 'unknown', 'null');
    assert(B.classifyJsonInput([1, 2]) === 'unknown', 'array');
});

test('bridge module still loads (analyze/generate handlers intact)', () => {
    const bridge = require(path.join('..', 'server', 'wargame-sim-bridge'));
    assert(typeof bridge.handle === 'function', 'bridge.handle missing');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
