#!/usr/bin/env node
/**
 * Regression test for the wargame scenarios (item #10).
 *
 * Walks both wargame1-brega and wargame2-brega through 11 mock-mode
 * adjudicator steps and asserts the doctrinal contrast:
 *   - wargame1-brega: aggressive Red captures OBJ NASSER (CAPTURED, PL 100)
 *   - wargame2-brega: terrain + reserves deny Red (DENIED, PL ~84)
 *
 * Mock mode replays scenario *_baseline fields without calling Ollama,
 * so this test is deterministic and runs in a few hundred ms. It catches
 * three classes of regression:
 *   1. Schema breakage (a baseline state that the validator rejects).
 *   2. BLS doctrine drift (item #11 — BLS-4 never SECURE).
 *   3. Outcome trajectory drift (someone edits a scenario JSON and the
 *      terminal objective_status changes unexpectedly).
 *
 * Exit code: 0 on all pass, 1 on any failure. Designed to be wired into
 * an npm script: `node UI_MOdified/scripts/test-scenarios.js`.
 */

'use strict';

const path = require('path');

const loader      = require(path.join('..', 'server', 'ai', 'scenario-loader'));
const adjudicator = require(path.join('..', 'server', 'ai', 'adjudicator-agent'));

// Per-scenario expectations. Pulled from scenario.regression_expect when
// the JSON carries it (wargame1 does); otherwise hard-coded from the
// original Wargame2 baseline (final PL 84, blue destroyed 21, DENIED).
const EXPECTATIONS = {
    'wargame1-brega': null, // read from scenario.regression_expect
    'wargame2-brega': {
        final_objective_status: 'DENIED',
        final_phase_line_km:    84,
        final_blue_destroyed:   21,
    },
};

function expectFor(name, scenario) {
    return (EXPECTATIONS[name] != null)
        ? EXPECTATIONS[name]
        : (scenario.regression_expect || null);
}

async function runScenario(name) {
    const scenario = loader.loadScenario(name);
    let prev = null;
    let lastState = null;
    let blsContestedSeen = { 'BLS-4': false };
    let blsSecureSeenForBls4 = false;

    for (let i = 1; i <= 11; i++) {
        const r = await adjudicator.adjudicateStep({
            scenario,
            stepIndex: i,
            prevState: prev,
            trialId:   `regress-${name}`,
            trialSeed: `regress-${name}`,
            mockMode:  true,
        });
        if (!r || !r.state) {
            return { name, ok: false, reason: `step ${i}: no state returned` };
        }
        const v = r.validation || {};
        if (Array.isArray(v.schema_errors) && v.schema_errors.length > 0) {
            return { name, ok: false, reason: `step ${i}: schema errors: ${v.schema_errors.map(e => e.path).join(',')}` };
        }
        // Item #11 invariant — BLS-4 must never end up SECURE on any step.
        if (r.state.bls_status && r.state.bls_status['BLS-4'] === 'SECURE') {
            blsSecureSeenForBls4 = true;
        }
        prev = r.state;
        lastState = r.state;
    }

    const exp = expectFor(name, scenario);
    const final_objective_status = lastState && lastState.objective_status;
    const final_phase_line_km    = lastState && lastState.phase_line_km;
    const final_blue_destroyed   = lastState && lastState.losses_cumulative && lastState.losses_cumulative.blue_destroyed;

    const issues = [];
    if (exp) {
        if (exp.final_objective_status && exp.final_objective_status !== final_objective_status) {
            issues.push(`objective_status: expected ${exp.final_objective_status}, got ${final_objective_status}`);
        }
        if (Number.isFinite(exp.final_phase_line_km) && exp.final_phase_line_km !== final_phase_line_km) {
            issues.push(`phase_line_km: expected ${exp.final_phase_line_km}, got ${final_phase_line_km}`);
        }
        if (Number.isFinite(exp.final_blue_destroyed) && exp.final_blue_destroyed !== final_blue_destroyed) {
            issues.push(`blue_destroyed: expected ${exp.final_blue_destroyed}, got ${final_blue_destroyed}`);
        }
    }
    if (blsSecureSeenForBls4) {
        issues.push(`BLS-4 was SECURE on at least one step (item #11 invariant)`);
    }

    return {
        name,
        ok: issues.length === 0,
        reason: issues.length ? issues.join('; ') : null,
        final_objective_status,
        final_phase_line_km,
        final_blue_destroyed,
    };
}

async function main() {
    const names = ['wargame1-brega', 'wargame2-brega'];
    const results = [];
    for (const n of names) {
        try { results.push(await runScenario(n)); }
        catch (e) { results.push({ name: n, ok: false, reason: e && e.message }); }
    }

    let anyFail = false;
    console.log('Wargame scenario regression test');
    console.log('================================');
    for (const r of results) {
        const tag = r.ok ? 'PASS' : 'FAIL';
        const detail = r.ok
            ? `${r.final_objective_status}, PL=${r.final_phase_line_km}, blue_destroyed=${r.final_blue_destroyed}`
            : r.reason;
        console.log(`  [${tag}] ${r.name.padEnd(18)}  ${detail}`);
        if (!r.ok) anyFail = true;
    }
    console.log('');
    if (anyFail) {
        console.log('FAIL — see issues above.');
        process.exit(1);
    } else {
        console.log('OK — both scenarios match expected outcomes.');
        process.exit(0);
    }
}

if (require.main === module) {
    main().catch(e => { console.error('ERROR:', e); process.exit(1); });
}

module.exports = { runScenario };
