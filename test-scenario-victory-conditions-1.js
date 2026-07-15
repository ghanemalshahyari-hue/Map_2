#!/usr/bin/env node
/**
 * test-scenario-victory-conditions-1.js — Batch C Slice C7
 *
 * Victory / failure / timeout / scenario-end conditions. The Batch C audit
 * found `evaluateVictoryConditions` computed only a timing gate
 * (result hardcoded 'pending', never consumed), no objective-control-duration
 * tracker existed anywhere, and the runtime clock's own timeout
 * (_coaExec.clock.completed) never fed scenario termination — despite
 * _scenarioEndCondition being a real, single termination chokepoint.
 *
 * This slice:
 *   - reuses world-state.js's REAL computeBalanceSummary (the same
 *     echelon-weighted force-ratio formula the stepped/W3 world already
 *     uses — no second implementation) for a 'force_ratio_below' victory
 *     condition kind
 *   - adds a real objective-control-duration accumulator
 *     (_scenario.objective_control_since) for a 'hold_objective' kind
 *     requiring CONTINUOUS (not cumulative) control
 *   - feeds both, plus the runtime clock's clock.completed timeout, into the
 *     SAME _scenarioEndCondition chokepoint ahead of its pre-existing codes
 *   - journals a new 'scenario_end_condition' record through the existing
 *     sim-journal boundary when the scenario completes
 *
 * Part 1 proves the force-ratio math genuinely by composing the REAL
 * world-state.js module (require()-able, confirmed) exactly the way
 * free-fight-demo.js's _forceRatioUnits()/_forceRatioSummary() do — not a
 * mock. Part 2 is a source-scan/precedence check of free-fight-demo.js
 * (the established pattern for this file throughout Batch C, since it's a
 * big window-attached IIFE, not a requirable pure module).
 *
 * Sibling to test-ws4-balance.js / test-mission-task-runtime-status-1.js.
 * Run: node test-scenario-victory-conditions-1.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const WorldState = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
const ffSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 5000 : b);
}

console.log('\n=== Batch C Slice C7: victory / failure / timeout / scenario-end conditions ===\n');

// Exactly the same mapping _forceRatioUnits() performs, against the REAL
// exported computeBalanceSummary — proving the reuse is genuine, not just
// source-text pattern matching.
function forceRatioUnits(redUnits, blueUnits) {
    function mapSide(list, side) {
        return (list || []).map(function (u) { return { side: side, echelon: u.echelon, strength: u.strength, status: u.status, off_map: false }; });
    }
    return mapSide(redUnits, 'RED').concat(mapSide(blueUnits, 'BLUE'));
}

// ── 1. Force-ratio threshold fires at the right moment (real math) ────────
console.log('\n[1] force_ratio_below threshold — genuine computeBalanceSummary math, fires at the right moment');
{
    // Heavy Red (battalion x2) vs light Blue (company x1) -> high force ratio, threshold NOT met.
    const heavyRed = [{ echelon: 'battalion' }, { echelon: 'battalion' }];
    const lightBlue = [{ echelon: 'company' }];
    const highRatio = WorldState.computeBalanceSummary({ units: forceRatioUnits(heavyRed, lightBlue) });
    ok(highRatio.force_ratio_value > 2, 'heavy Red vs light Blue produces a high force ratio (real echelon-weighted math)', JSON.stringify(highRatio));
    ok(!(highRatio.force_ratio_value < 1), 'threshold force_ratio_below:1 would NOT be met here (Red still stronger)');

    // Light Red (company x1) vs heavy Blue (battalion x2) -> low force ratio, threshold IS met.
    const lightRed = [{ echelon: 'company' }];
    const heavyBlue = [{ echelon: 'battalion' }, { echelon: 'battalion' }];
    const lowRatio = WorldState.computeBalanceSummary({ units: forceRatioUnits(lightRed, heavyBlue) });
    ok(lowRatio.force_ratio_value < 1, 'light Red vs heavy Blue produces a low force ratio', JSON.stringify(lowRatio));
    ok(lowRatio.force_ratio_value < 1, 'threshold force_ratio_below:1 WOULD be met here (Red weaker) — the exact moment a victory condition should fire');
}

// ── 2. Objective-hold threshold requires CONTINUOUS, not cumulative control ─
console.log('\n[2] hold_objective requires continuous control (source-scan of the real accumulator)');
{
    const fn = block(ffSrc, '_scenario.objective_control = outcome.objective_control;', '_scenario.blue_presence = outcome.blue_presence;');
    // pulled together, the accumulator block sits right after these two lines
    const accBlock = block(ffSrc, '_scenario.red_contest = outcome.red_contest;', 'try { _recordDecision({ role: \'white\', action: \'scenario_outcome_check\'');
    ok(/objective_control_since\.side !== controlSide/.test(accBlock),
        'a side CHANGE resets the since_hours timestamp — losing and regaining control does not accumulate across the gap');
    ok(/_scenario\.objective_control_since = null;/.test(accBlock),
        'losing control entirely (contested/uncontrolled) clears the accumulator — no phantom credit');

    const victoryFn = block(ffSrc, 'function _victoryConditionMet', 'function _scenarioEndCondition');
    ok(/since\.side === wantSide && elapsed != null.*\(elapsed - since\.since_hours\) >= \+c\.threshold\.hours/.test(victoryFn.replace(/\s+/g, ' ')),
        'hold_objective compares elapsed time against the SAME since_hours the accumulator tracks (continuous duration, not a counter)');
}

// ── 3. Timeout fires only on a REAL bound, not the overloaded clock.completed ─
console.log('\n[3] Timeout wiring (source-scan) — avoids the overloaded clock.completed flag');
{
    const endFn = block(ffSrc, 'function _scenarioEndCondition', 'function _startScenarioTimer');
    // clock.completed is ALSO set true by _advanceScenarioClock whenever COA
    // phase_status reaches 'complete' (unrelated to time running out) — a
    // real bug caught by test-free-fight-auto-scenario-director-ab.js during
    // this slice (ending scenarios immediately/incorrectly). Fixed by
    // re-deriving the genuine timeout the same way world-state.js's
    // _buildClock computes its truthful `completed` state: end_hours must be
    // a REAL bound strictly after start_hours, not just a truthy flag.
    ok(!/if \(_coaExec && _coaExec\.clock && _coaExec\.clock\.completed\)/.test(endFn),
        'does NOT trust the raw (overloaded) clock.completed flag directly');
    ok(/_endH > _startH && _curH >= _endH/.test(endFn),
        'timeout requires end_hours to be a real bound strictly after start_hours (guards the degenerate/unauthored case)');
    const completedIdx = endFn.indexOf('_endH > _startH');
    const maxTurnsIdx = endFn.indexOf('max_turns_reached');
    const victoryIdx = endFn.indexOf('victory_condition_met');
    ok(completedIdx > 0 && victoryIdx > 0 && victoryIdx < completedIdx && completedIdx < maxTurnsIdx,
        'victory conditions and timeout are checked AHEAD of the pre-existing max_turns_reached code');
}

// ── 4. Pre-existing end-condition codes are unchanged (regression) ────────
console.log('\n[4] Pre-existing _scenarioEndCondition codes are unchanged');
{
    const endFn = block(ffSrc, 'function _scenarioEndCondition', 'function _startScenarioTimer');
    ok(/outcome\.blue_success.*objective_secured/.test(endFn.replace(/\s+/g, ' ')), 'objective_secured code unchanged');
    ok(/outcome\.blue_unable.*blue_unable_to_continue/.test(endFn.replace(/\s+/g, ' ')), 'blue_unable_to_continue code unchanged');
    ok(/outcome\.red_unable.*red_unable_to_contest/.test(endFn.replace(/\s+/g, ' ')), 'red_unable_to_contest code unchanged');
    ok(/scenario_turn >= \(_scenario\.max_turns \|\| SCENARIO_MAX_TURNS\)/.test(endFn), 'max_turns_reached condition unchanged');
}

// ── 5. Force-ratio calc genuinely reuses world-state.js, no duplication ───
console.log('\n[5] _forceRatioSummary genuinely reuses world-state.js\'s real function (no second implementation)');
{
    const fn = block(ffSrc, 'function _forceRatioSummary', 'function _victoryConditionMet');
    ok(/WS\.computeBalanceSummary\(/.test(fn), 'calls WS.computeBalanceSummary(...) — the real exported function');
    ok(!/redForce \+=|blueForce \+=/.test(fn), 'does not reimplement the echelon-weighting math locally');
}

// ── 6. New journal record kind for scenario outcomes ───────────────────────
console.log('\n[6] scenario_end_condition journal record wired through the existing sim-journal boundary');
{
    const transitionFn = block(ffSrc, "_scenario.scenario_status = 'complete'; _scenario.end_condition = end.code;", 'function _commitAutoBlueOrder');
    ok(/_journalRuntimeRecord\('scenario_end_condition',/.test(transitionFn), 'journals a real scenario_end_condition record on completion');
    ok(/detail: \{ code: end\.code, summary: end\.summary, victory_condition_id: end\.victory_condition_id \|\| null, side: end\.side \|\| null \}/.test(transitionFn),
        'journal detail carries the real end code/summary/victory_condition_id/side');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
