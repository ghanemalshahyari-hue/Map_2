#!/usr/bin/env node
/**
 * End-to-end test runner for the AI adjudicator (server side).
 *
 * Sections:
 *   1. Scenario JSON loads and matches W2 ground truth.
 *   2. Validator passes the W2 trajectory cleanly.
 *   3. Validator passes the W1 trajectory cleanly.
 *   4. Adjudicator-agent mock mode resolves step 1 → 11 deterministically.
 *   5. Monte Carlo runner: 3 trials, mock mode, end-to-end.
 *
 * Live Ollama tests (single step + small batch) are at the bottom as
 * curl commands you copy into a shell — they need your web-server running
 * and Ollama listening on :11434.
 *
 * Usage:
 *   node scripts/test-adjudicator.js
 *   node scripts/test-adjudicator.js --verbose
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const W1_DIR = path.join(ROOT, 'Wargame1');
const W2_DIR = path.join(ROOT, 'Wargame2');

const verbose = process.argv.includes('--verbose');

const loader     = require(path.join(ROOT, 'server', 'ai', 'scenario-loader'));
const schema     = require(path.join(ROOT, 'server', 'ai', 'adjudicator-schema'));
const validator  = require(path.join(ROOT, 'server', 'ai', 'adjudicator-validator'));
const adj        = require(path.join(ROOT, 'server', 'ai', 'adjudicator-agent'));
const mc         = require(path.join(ROOT, 'server', 'ai', 'monte-carlo-runner'));

let passed = 0, failed = 0;
function ok(msg) { passed++; console.log('  ok  ', msg); }
function fail(msg, detail) { failed++; console.log('  FAIL', msg); if (detail) console.log('       ', detail); }
function section(title) { console.log('\n──', title); }

// ── Section 1 ────────────────────────────────────────────────────────
section('1. Scenario JSON load');
const scenario = loader.getDefaultScenario();
if (scenario.name === 'wargame2-brega') ok('default scenario name matches');
else fail('default scenario name mismatch', scenario.name);

if (scenario.steps.length === 12) ok('12 steps');
else fail('expected 12 steps', `got ${scenario.steps.length}`);

if (scenario.red_units.length === 11) ok('11 Red units');
else fail('expected 11 Red units', `got ${scenario.red_units.length}`);

if (scenario.blue_units_base_ids.length === 39) ok('39 Blue units');
else fail('expected 39 Blue units', `got ${scenario.blue_units_base_ids.length}`);

if (scenario.bls_template.length === 4) ok('4 BLS');
else fail('expected 4 BLS', `got ${scenario.bls_template.length}`);

if (scenario.steps[11].phase_line_km_baseline === 84
    && scenario.steps[11].objective_status_baseline === 'DENIED') ok('step 11 baseline matches W2 (DENIED @ 84 km)');
else fail('step 11 baseline mismatch');

// ── Section 2 ────────────────────────────────────────────────────────
section('2. Validator against W2 ground truth (11 transitions)');
{
    let prev = schema.freshState(scenario);
    let allOk = true, warnTotal = 0;
    for (let i = 1; i < 12; i++) {
        const stepFile = path.join(W2_DIR, `step${String(i).padStart(2, '0')}.geojson`);
        const j = JSON.parse(fs.readFileSync(stepFile, 'utf8'));
        const md = j.metadata;
        const baseline = scenario.steps[i];
        const cumBlue = baseline.blue_destroyed_baseline;
        const newBlue = cumBlue.filter(u => !prev.blue_destroyed_cumulative.includes(u));
        const delta = {
            step_index: i,
            time_label: md.time_label,
            elapsed_hours: md.elapsed_hours,
            phase: md.phase,
            phase_line_km: md.phase_line_km,
            objective_status: md.objective_status,
            force_ratio: md.force_ratio,
            ew_effect: md.ew_effect,
            logistics_state: md.logistics_state,
            decision_point: md.decision_point,
            narrative_ar: 'وضع تجريبي بحروف عربية ' + 'كلمة '.repeat(95),
            narrative_en: 'synthetic test narrative ' + 'word '.repeat(70),
            bls_status: md.bls_status,
            losses_step: { blue: newBlue.length, red_company_equivalent_cumulative: baseline.red_losses_cumulative_baseline },
            losses_cumulative: {
                blue_destroyed: cumBlue.length,
                blue_total: 39,
                red_company_equivalent: baseline.red_losses_cumulative_baseline,
                red_aggregate_markers: 11,
            },
            red_active_markers: 11,
            per_unit_deltas: {
                blue_destroyed: newBlue,
                red_degraded: (baseline.red_degraded_baseline || []).map(uid => ({ unit_uid: uid, strength_current: 0.7, status: 'DEGRADED' })),
            },
            confidence_per_field: { phase_line_km:'high', force_ratio:'high', objective_status:'high', ew_effect:'high', bls_status:'high', per_unit_deltas:'high' },
            notes: '',
        };
        const r = validator.validateStateDelta(delta, prev, scenario, i);
        if (!r.ok) { allOk = false; fail(`step ${i}`, JSON.stringify(r.schema_errors)); break; }
        warnTotal += r.doctrinal_warnings.length;
        prev = r.repaired;
        if (verbose) console.log(`     step ${i}: PL=${prev.phase_line_km} obj=${prev.objective_status} blue_dead=${prev.blue_destroyed_cumulative.length}`);
    }
    if (allOk) ok(`all 11 W2 transitions validate (${warnTotal} doctrinal warnings, ok to ignore)`);
    if (prev.phase_line_km === 84 && prev.objective_status === 'DENIED'
        && prev.losses_cumulative.blue_destroyed === 21) ok('final state matches W2 (84 km, DENIED, 21 Blue dead)');
    else fail('final state mismatch', `pl=${prev.phase_line_km} obj=${prev.objective_status} blue=${prev.losses_cumulative.blue_destroyed}`);
}

// ── Section 3 ────────────────────────────────────────────────────────
section('3. Validator against W1 ground truth (CAPTURED path)');
{
    // Use W1's step files but feed through the same validator. This proves
    // the validator accepts both the conservative (W2) and aggressive (W1)
    // trajectories — Monte Carlo must be able to span the full range.
    let prev = schema.freshState(scenario);
    let allOk = true, warnTotal = 0;
    const w1BlueGroups = [
        [], [], [],
        ['c111','c112','c113'],
        ['c121','c122','c211'],
        ['c212','c131','c213'],
        ['c132','c133','c221','c222'],
        ['c223','c231','c232'],
        ['c233','c311','c312','c313'],
        ['c321','c322','c323'],
        ['c331','c332','c333','p11c'],
        ['p12c','p13c','p21c','p22c'],
    ];
    let cumW1 = [];
    for (let i = 1; i < 12; i++) {
        const stepFile = path.join(W1_DIR, `step${String(i).padStart(2, '0')}.geojson`);
        const j = JSON.parse(fs.readFileSync(stepFile, 'utf8'));
        const md = j.metadata;
        const newGroup = w1BlueGroups[i].filter(id => !cumW1.includes(id));
        // c223 doesn't exist in W2 — skip it for the validator (since the
        // validator uses W2's OOB). This section is about validator behaviour
        // against another data path, not about W1 fidelity.
        const newBlueUids = newGroup.map(id => 'BLUE_' + id).filter(u => scenario.blue_units_base_ids.includes(u.slice(5)));
        cumW1 = cumW1.concat(newGroup);
        const cumUids = cumW1.map(id => 'BLUE_' + id).filter(u => scenario.blue_units_base_ids.includes(u.slice(5)));
        const delta = {
            step_index: i,
            time_label: md.time_label,
            elapsed_hours: md.elapsed_hours,
            phase: md.phase,
            phase_line_km: md.phase_line_km,
            objective_status: md.objective_status,
            force_ratio: md.force_ratio,
            ew_effect: md.ew_effect,
            logistics_state: md.logistics_state || 'Building',
            decision_point: md.decision_point,
            narrative_ar: 'محاكاة عربية ' + 'كلمة '.repeat(95),
            narrative_en: 'synthetic w1 narrative ' + 'word '.repeat(70),
            bls_status: md.bls_status,
            losses_step: { blue: newBlueUids.length, red_company_equivalent_cumulative: (md.losses_cumulative && md.losses_cumulative.red_company_equivalent) || 0 },
            losses_cumulative: {
                blue_destroyed: cumUids.length,
                blue_total: 39,
                red_company_equivalent: (md.losses_cumulative && md.losses_cumulative.red_company_equivalent) || 0,
                red_aggregate_markers: 11,
            },
            red_active_markers: 11,
            per_unit_deltas: { blue_destroyed: newBlueUids, red_degraded: [] },
            confidence_per_field: { phase_line_km:'high', force_ratio:'high', objective_status:'high', ew_effect:'high', bls_status:'high', per_unit_deltas:'high' },
            notes: '',
        };
        const r = validator.validateStateDelta(delta, prev, scenario, i);
        if (!r.ok) { allOk = false; fail(`W1 step ${i}`, JSON.stringify(r.schema_errors)); break; }
        warnTotal += r.doctrinal_warnings.length;
        prev = r.repaired;
        if (verbose) console.log(`     step ${i}: PL=${prev.phase_line_km} obj=${prev.objective_status}`);
    }
    if (allOk) ok(`all 11 W1 transitions validate (${warnTotal} doctrinal warnings — these include the SECURE→CONTESTED transitions doctrinal allowance)`);
    if (prev.objective_status === 'CAPTURED') ok('W1 ends CAPTURED (validator accepted aggressive trajectory)');
    else fail(`W1 final objective_status: ${prev.objective_status} (expected CAPTURED)`);
}

// ── Section 4 ────────────────────────────────────────────────────────
section('4. Adjudicator-agent mock mode (12-step trial)');
(async () => {
    let prev = schema.freshState(scenario);
    let badStep = null;
    for (let i = 1; i < 12; i++) {
        const r = await adj.adjudicateStep({
            scenario, stepIndex: i, prevState: prev,
            trialId: 'mock-test', trialSeed: 'mock-test:t0',
            mockMode: true,
        });
        if (!r.ok || r.state.step_index !== i) { badStep = { i, r }; break; }
        prev = r.state;
        if (verbose) console.log(`     step ${i}: ${prev.time_label} PL=${prev.phase_line_km} obj=${prev.objective_status}`);
    }
    if (badStep) fail(`adjudicator step ${badStep.i}`, JSON.stringify(badStep.r.validation));
    else ok('all 12 mock-mode adjudications return ok');

    if (prev.phase_line_km === 84 && prev.objective_status === 'DENIED'
        && prev.losses_cumulative.blue_destroyed === 21
        && prev.losses_cumulative.red_company_equivalent === 6) {
        ok('final state matches W2 baseline (84 km, DENIED, 21 Blue, 6 Red)');
    } else {
        fail('final state mismatch', `pl=${prev.phase_line_km} obj=${prev.objective_status} blue=${prev.losses_cumulative.blue_destroyed} red=${prev.losses_cumulative.red_company_equivalent}`);
    }
    if (typeof prev.narrative_ar === 'string' && /[؀-ۿ]/.test(prev.narrative_ar)) ok('narrative_ar contains Arabic codepoints');
    else fail('narrative_ar missing or non-Arabic');

    // ── Section 5 ────────────────────────────────────────────────────
    section('5. Monte Carlo runner (3 trials, mock mode)');
    const start = Date.now();
    const { runId, dir } = mc.startBatch({
        scenarioName: 'wargame2-brega',
        trials: 3,
        parallelism: 2,
        mockMode: true,
    });
    console.log(`     runId: ${runId}`);

    let progressCount = 0;
    const summaryPromise = new Promise((resolve) => {
        mc.subscribe(runId, (evt, data) => {
            if (evt === 'progress') progressCount++;
            else if (evt === 'done') resolve(data);
        });
    });
    const summary = await summaryPromise;
    const wall = Date.now() - start;

    if (summary.trialsCompleted === 3) ok('3 trials completed');
    else fail(`completed: ${summary.trialsCompleted}/3`);

    if (summary.outcomeCounts.DENIED === 3) ok('all 3 trials end DENIED (deterministic mock)');
    else fail('outcome mismatch', JSON.stringify(summary.outcomeCounts));

    if (progressCount === 33) ok(`33 progress events streamed (11 steps × 3 trials)`);
    else fail(`expected 33 progress events, saw ${progressCount}`);

    if (fs.existsSync(path.join(dir, 'summary.json'))) ok('summary.json written to disk');
    else fail('summary.json missing');

    const trial0 = path.join(dir, 'trial-000.jsonl');
    if (fs.existsSync(trial0)) {
        const lines = fs.readFileSync(trial0, 'utf8').trim().split('\n');
        // 1 meta + 1 step-0 seed state + 11 step states + 1 done
        if (lines.length === 14) ok(`trial-000.jsonl has 14 lines (meta + 12 states + done)`);
        else fail(`trial-000.jsonl has ${lines.length} lines (expected 14)`);
    } else fail('trial-000.jsonl missing');

    console.log(`     wall clock: ${wall} ms (mock mode is near-instant)`);

    // ── Final summary ────────────────────────────────────────────────
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PASSED: ${passed}    FAILED: ${failed}`);
    console.log('='.repeat(60));
    if (failed > 0) process.exit(1);
})();
