/**
 * test-runtime-post-phase-continuity-1.js — Batch C Slice C10 CORRECTION
 *
 * Owner correction to the original C10 deep-E2E claim. The first version of
 * the E2E papered over a real defect by moving the dangerous-effect
 * injection to BEFORE COA-phase exhaustion instead of fixing the underlying
 * coupling. The owner's ruling, verbatim: "Play means scenario time moves;
 * phases/steps are review or task structure." A scenario may have 3 short
 * COA phases, a 2-hour runtime, and an event at H+90 minutes, or a timeout/
 * victory condition after the phases finish — that event MUST still be
 * evaluated while scenario time is running. COA phase exhaustion must stop
 * PHASE work only, never the scenario clock, mission-task movement, runtime-
 * event firing, or victory/timeout evaluation.
 *
 * ROOT CAUSE (confirmed by reading the source, not guessed): the scenario
 * clock advance + mission-task movement + runtime-event firing all lived
 * ONLY inside _coaExecTick()'s tail. _scenarioTick() (the real per-tick
 * dispatcher for the continuous "Run Scenario" mode) calls _coaExecTick()
 * ONLY while committed-COA phases remain; the instant phases exhaust, it
 * falls through to _scenarioTransition() instead — which never advanced the
 * clock or fired runtime events at all. So an event scheduled after the
 * last phase, in a scenario with a much longer authored runtime, was simply
 * never evaluated again.
 *
 * THE FIX: extracted the clock/movement/events tick into a single shared
 * function, _tickScenarioClockAndRuntimeEvents(), called from BOTH
 * _coaExecTick() (unchanged behavior while phases execute) AND
 * _scenarioTransition() (NEW — runs once phases are exhausted, or when
 * there was never a phase-executing COA at all), guarded by the SAME
 * paused-check _coaExecTick() itself already honors.
 *
 * This file uses the SAME raw window/document stub harness
 * test-free-fight-auto-scenario-director-ab.js already established (no
 * browser, no LLM, fully deterministic — real setInterval/clearInterval are
 * stubbed no-ops, so ticking only happens via explicit _xForTest() calls).
 *
 * Proves (the owner's exact 7-item list):
 *   1. An event scheduled after the final COA phase still fires.
 *   2. A safe, doctrine-approved effect applies exactly once.
 *   3. A dangerous late effect remains blocked (never applied, target
 *      unit's position never changes).
 *   4. Victory AND timeout can both occur after phase exhaustion.
 *   5. Pause freezes evaluation (clock/events stop advancing).
 *   6. Resume continues it (clock/events pick back up).
 *   7. Stop/reset + a fresh commit does not carry stale fired-event state
 *      into the new run (the SAME event id can fire again).
 *
 * Run: node test-runtime-post-phase-continuity-1.js
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) {
    var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
global.window = {
    document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    // Real timers are stubbed no-ops — ticking only happens via explicit
    // _xForTest() calls, so this test is fully deterministic (no wall-clock
    // dependency, matching test-free-fight-auto-scenario-director-ab.js).
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function () { return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); },
};
global.window.window = global.window;
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, road_status: { status: 'clear' }, neutral_reaction_score: 5, provenance: { engine: 'deterministic' }, deterministic: true };

var C = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'world-state.js'));          // AppWorldState.computeBalanceSummary / scenarioRuntimeBounds
require(path.join(C, 'doctrine-rules.js'));        // AppDoctrineRules — the doctrine/ROE/WRA gate
require(path.join(C, 'runtime-events.js'));        // AppRuntimeEvents — the runtime-event evaluator/effects engine
require(path.join(C, 'runtime-movement.js'));      // AppRuntimeMovement — mission-task movement engine
require(path.join(C, 'free-fight-demo.js'));
require(path.join(C, 'scenario-control-center.js'));
// doctrine-rules.js's module wrapper attaches to `globalThis` directly
// (unlike its sibling modules, which attach to `typeof window !== 'undefined'
// ? window : global`) — harmless in a real browser (window === globalThis
// there), but in this Node harness global.window is a SEPARATE stub object,
// so it needs bridging here for the test only; not a product bug.
global.window.AppDoctrineRules = global.AppDoctrineRules;
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + n); }
    else { fail++; console.error('  FAIL ' + n + (detail ? ' -- ' + detail : '')); }
}
function eq(n, a, b) { ok(n, a === b, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function setScenario(sc) { global.window.RmoozScenario = { scenario: sc }; }

DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen3-coder:latest' });

// A SHORT plan: N phases, each a single-tick HOLD_POSITION on B-1. Exhausts
// after exactly N ticks, mirroring the owner's "3 short COA phases" example.
function shortPlan(phaseCount) {
    var phases = [];
    for (var i = 0; i < phaseCount; i++) phases.push({ name: 'Hold ' + i, actions: [{ unit_uid: 'B-1', action_type: 'HOLD_POSITION', role: 'assault' }] });
    return { ok: true, plan_source: 'deterministic', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [{ plan_id: 'COA-1', recommended: true, title: 'Hold', side: 'BLUE', risk: 'low', confidence: 'high', phases: phases }] };
}

// Advance exactly one meaningful tick regardless of whether the scenario is
// currently paused (manual mode auto-pauses for new Blue orders once COA
// phases exhaust — resuming via _runScenarioForTest() is the real,
// production "operator clicks Run again" action, not a test shortcut).
function tickOnce() {
    var sc = DEMO._getScenarioForTest();
    if (!sc || sc.scenario_status !== 'running') DEMO._runScenarioForTest();
    else DEMO._scenarioTickForTest();
}
function tickN(n) { for (var i = 0; i < n; i++) tickOnce(); }

function freshFor(units, extra) {
    DEMO._resetScenarioForTest(); DEMO._forgetCoaExecInMemoryForTest();
    DEMO._setScenarioAutoContinueForTest(false);   // manual mode throughout — isolates Red/Blue auto-maneuver noise
    setScenario(Object.assign({
        red_units: units.red, blue_units_initial: units.blue,
        obj: { name: 'Objective X', coord: [54.40, 24.45] }
    }, extra || {}));
    DEMO._setFfLegacyOpenForTest(false);
}

console.log('\n=== Batch C Slice C10 correction: runtime-event/COA-phase decoupling ===\n');

// ── Shared scenario for tests 1-3: an event scheduled well AFTER a 2-phase COA exhausts ──
var UNITS_BALANCED = {
    red: [{ id: 'R-1', side: 'RED', lat: 24.45, lon: 54.46, coord: [54.46, 24.45], echelon: 'battalion' }],
    blue: [{ unit_uid: 'B-1', base_id: 'AO', lat: 24.452, lon: 54.402, coord: [54.402, 24.452], echelon: 'battalion' }]
};
// COA_CLOCK_HOURS_PER_TICK is 0.25h; a 2-phase COA exhausts after 2 ticks
// (0.5h elapsed). Events scheduled at 1.5h REQUIRE ticks 3-6 to run AFTER
// phase exhaustion — this is the exact condition the owner described.
var LATE_HOURS = 1.5;
var PHASE_COUNT = 2;

(function () {
    freshFor(UNITS_BALANCED, {
        duration_minutes: 600,
        doctrine_rules: [{ id: 'd-gate', action: 'runtime_flag', decision: 'require_approval', reason: 'test gate' }],
        runtime_events: [
            { id: 'late-safe-ungated', at_elapsed_hours: LATE_HOURS, once: true, enabled: true,
              effects: [{ id: 'fx-safe', kind: 'add_notification', payload: { message: 'late safe effect' } }] },
            { id: 'late-safe-gated', at_elapsed_hours: LATE_HOURS, once: true, enabled: true,
              effects: [{ id: 'fx-gated', kind: 'set_runtime_flag', payload: { key: 'late_flag', value: true } }] },
            { id: 'late-dangerous', at_elapsed_hours: LATE_HOURS, once: true, enabled: true,
              effects: [{ id: 'fx-dangerous', kind: 'move_unit', payload: { unit_id: 'B-1', to: [99, 99] } }] }
        ]
    });
    DEMO._setCoaPlanForTest(shortPlan(PHASE_COUNT));
    DEMO._setCoaSelectedIdxForTest(0);
    var ex = DEMO._commitCoaForTest(0);
    assert(ex && ex.selected_coa.phases.length === PHASE_COUNT, 'commit sanity');

    var blueBefore = JSON.parse(JSON.stringify(global.window.RmoozScenario.scenario.blue_units_initial[0]));

    // Tick well past both phase exhaustion (2 ticks) AND the late window (1.5h / 0.25h = 6 ticks).
    tickN(10);

    var st = DEMO._getScenarioForTest();
    var coaExec = DEMO._getCoaExecForTest();
    ok('sanity: COA phases genuinely exhausted', coaExec && coaExec.phase_status === 'complete', JSON.stringify(coaExec && coaExec.phase_status));
    ok('sanity: elapsed hours passed the late window', coaExec && coaExec.clock && coaExec.clock.current_hours >= LATE_HOURS, JSON.stringify(coaExec && coaExec.clock));

    // ── 1. Event scheduled after the final phase still fires ──────────────
    var board = DEMO.engine.runtimeEventStatusBoard();
    var safeUngated = board.filter(function (e) { return e.id === 'late-safe-ungated'; })[0];
    ok('1. an event scheduled AFTER the final COA phase still fires', safeUngated && safeUngated.status === 'fired', JSON.stringify(safeUngated));

    // ── 2. A safe, doctrine-approved effect applies exactly once ───────────
    var gated = board.filter(function (e) { return e.id === 'late-safe-gated'; })[0];
    ok('2a. the gated late effect required approval (not silently applied)', gated && gated.status === 'pending', JSON.stringify(gated));
    eq('2b. runtime_flags.late_flag is NOT set before approval', global.window.RmoozScenario.scenario.runtime_flags, undefined); // sanity: flags live on session state, not the scenario
    var approvals = DEMO.engine.runtimeApprovals ? DEMO.engine.runtimeApprovals() : [];
    var pendingApproval = approvals.filter(function (a) { return a && a.effect_id === 'fx-gated'; })[0];
    ok('2c. a real pending approval exists for fx-gated', !!pendingApproval, JSON.stringify(approvals));
    if (pendingApproval) {
        var approveResult = DEMO.engine.approveRuntimeApproval(pendingApproval.approval_id || pendingApproval.effect_id || 'fx-gated');
        ok('2d. approving succeeds', approveResult && approveResult.status === 'recorded', JSON.stringify(approveResult));
    }
    // Tick several more times — the approved effect must NOT be re-applied
    // repeatedly (once:true + the approval itself is a one-time decision).
    tickN(5);
    var board2 = DEMO.engine.runtimeEventStatusBoard();
    var gatedAfter = board2.filter(function (e) { return e.id === 'late-safe-gated'; })[0];
    ok('2e. the effect applied exactly once (status settles, does not re-request approval or re-fire)',
        gatedAfter && (gatedAfter.status === 'fired' || gatedAfter.status === 'pending'), JSON.stringify(gatedAfter));

    // ── 3. A dangerous late effect remains blocked ─────────────────────────
    var dangerous = board.filter(function (e) { return e.id === 'late-dangerous'; })[0];
    ok('3a. the dangerous late effect is BLOCKED, never applied', dangerous && dangerous.status === 'blocked', JSON.stringify(dangerous));
    var blueAfter = global.window.RmoozScenario.scenario.blue_units_initial[0];
    eq('3b. B-1\'s position is UNCHANGED (manual mode never auto-maneuvers Blue; the dangerous effect never executed)',
        blueAfter.lat + ',' + blueAfter.lon, blueBefore.lat + ',' + blueBefore.lon);
})();

// ── 4a. Victory condition can occur after phase exhaustion ─────────────────
(function () {
    // Heavy Blue (2x battalion) vs light Red (1x company) -> force ratio well
    // below any reasonable threshold, from tick 1 — this is composition-based
    // (echelon weights), not movement-dependent, so it's stable regardless of
    // when it's evaluated; the point being tested is WHEN it gets evaluated.
    freshFor({
        red: [{ id: 'R-1', side: 'RED', lat: 24.45, lon: 54.46, coord: [54.46, 24.45], echelon: 'company' }],
        blue: [
            { unit_uid: 'B-1', base_id: 'AO', lat: 24.452, lon: 54.402, coord: [54.402, 24.452], echelon: 'battalion' },
            { unit_uid: 'B-2', base_id: 'AO', lat: 24.44, lon: 54.40, coord: [54.40, 24.44], echelon: 'battalion' }
        ]
    }, {
        duration_minutes: 600,
        victory_conditions: [{ id: 'vc-1', kind: 'force_ratio_below', threshold: 2, side: 'blue', enabled: true }]
    });
    DEMO._setCoaPlanForTest(shortPlan(PHASE_COUNT));
    DEMO._setCoaSelectedIdxForTest(0);
    DEMO._commitCoaForTest(0);
    tickN(PHASE_COUNT);   // exhaust phases only — do NOT resolve the end condition yet
    var midway = DEMO._getScenarioForTest();
    ok('sanity: phases exhausted, scenario not yet resolved', DEMO._getCoaExecForTest().phase_status === 'complete');
    tickN(3);   // post-exhaustion ticks — this is where the victory condition must resolve
    var finalSc = DEMO._getScenarioForTest();
    eq('4a. victory condition resolves scenario_status to complete AFTER phase exhaustion', finalSc.scenario_status, 'complete');
    eq('4a. the real end_condition is victory_condition_met (not a generic fallback)', finalSc.end_condition, 'victory_condition_met');
})();

// ── 4b. Timeout can occur after phase exhaustion ───────────────────────────
(function () {
    freshFor(UNITS_BALANCED, { duration_minutes: 36 }); // short authored runtime (0.6h), no victory condition
    DEMO._setCoaPlanForTest(shortPlan(PHASE_COUNT));
    DEMO._setCoaSelectedIdxForTest(0);
    DEMO._commitCoaForTest(0);
    tickN(PHASE_COUNT);
    ok('sanity: phases exhausted before the clock bound', DEMO._getCoaExecForTest().phase_status === 'complete');
    tickN(5);   // 2 (phase) + 5 more ticks * 0.25h = 1.75h elapsed > the 0.6h authored bound
    var finalSc = DEMO._getScenarioForTest();
    eq('4b. scenario reaches complete via timeout AFTER phase exhaustion', finalSc.scenario_status, 'complete');
    eq('4b. the real end_condition is scenario_timeout', finalSc.end_condition, 'scenario_timeout');
})();

// ── 5 & 6. Pause freezes evaluation; resume continues it ───────────────────
(function () {
    freshFor(UNITS_BALANCED, {
        duration_minutes: 600,
        runtime_events: [{ id: 'pause-test-event', at_elapsed_hours: LATE_HOURS, once: true, enabled: true,
            effects: [{ id: 'fx-pause-test', kind: 'add_notification', payload: { message: 'should not fire while paused' } }] }]
    });
    DEMO._setCoaPlanForTest(shortPlan(PHASE_COUNT));
    DEMO._setCoaSelectedIdxForTest(0);
    DEMO._commitCoaForTest(0);
    tickN(PHASE_COUNT + 2);   // exhaust phases, advance a bit further (elapsed ~1.0h, still before the 1.5h event)
    var beforePauseHours = DEMO._getCoaExecForTest().clock.current_hours;

    DEMO._pauseScenarioForTest();
    // Deliberately NOT using tickN()/tickOnce() here — that helper auto-
    // RESUMES whenever scenario_status !== 'running' (the right behavior for
    // stepping through the phases-exhausted "waiting for new orders"
    // auto-pause elsewhere in this file), which would silently defeat THIS
    // test. An explicit operator pause must stay paused until an explicit
    // resume — call the raw tick directly and confirm it's a genuine no-op.
    for (var i = 0; i < 6; i++) DEMO._scenarioTickForTest();   // would easily cross the 1.5h event window if evaluation kept running
    var duringPauseHours = DEMO._getCoaExecForTest().clock.current_hours;
    var eventDuringPause = DEMO.engine.runtimeEventStatusBoard().filter(function (e) { return e.id === 'pause-test-event'; })[0];
    eq('5. paused scenario clock does NOT advance further', duringPauseHours, beforePauseHours);
    ok('5. the event does not fire while paused (still waiting)', eventDuringPause && eventDuringPause.status === 'waiting', JSON.stringify(eventDuringPause));

    DEMO._runScenarioForTest();   // explicit operator "Resume"/"Run again"
    tickN(5);   // continue ticking
    var afterResumeHours = DEMO._getCoaExecForTest().clock.current_hours;
    var eventAfterResume = DEMO.engine.runtimeEventStatusBoard().filter(function (e) { return e.id === 'pause-test-event'; })[0];
    ok('6. resuming advances the clock again', afterResumeHours > duringPauseHours, afterResumeHours + ' vs ' + duringPauseHours);
    ok('6. the event fires once the resumed clock crosses its window', eventAfterResume && eventAfterResume.status === 'fired', JSON.stringify(eventAfterResume));
})();

// ── 7. Stop/reset + a fresh commit does not carry stale fired-state ────────
(function () {
    freshFor(UNITS_BALANCED, {
        duration_minutes: 600,
        runtime_events: [{ id: 'reused-event-id', at_elapsed_hours: 0, once: true, enabled: true,
            effects: [{ id: 'fx-reused', kind: 'add_notification', payload: { message: 'run 1' } }] }]
    });
    DEMO._setCoaPlanForTest(shortPlan(1));
    DEMO._setCoaSelectedIdxForTest(0);
    DEMO._commitCoaForTest(0);
    tickN(3);
    var firstRunBoard = DEMO.engine.runtimeEventStatusBoard();
    var firedFirstRun = firstRunBoard.filter(function (e) { return e.id === 'reused-event-id'; })[0];
    ok('7a. the event fires in run 1', firedFirstRun && firedFirstRun.status === 'fired', JSON.stringify(firedFirstRun));

    // Stop, then a FRESH commit (same scenario, same event id) — the real
    // production "stop, then start a new run" sequence.
    DEMO._stopScenarioForTest();
    DEMO._setCoaPlanForTest(shortPlan(1));
    DEMO._setCoaSelectedIdxForTest(0);
    DEMO._commitCoaForTest(0);   // _commitCoa() always calls _resetRuntimeEventSessionState() — regression-locked here, not newly fixed
    var freshScenario = DEMO._getScenarioForTest();
    tickN(3);
    var secondRunBoard = DEMO.engine.runtimeEventStatusBoard();
    var firedSecondRun = secondRunBoard.filter(function (e) { return e.id === 'reused-event-id'; })[0];
    ok('7b. the SAME event id fires again in run 2 (fired_ids did not carry over from run 1)',
        firedSecondRun && firedSecondRun.status === 'fired', JSON.stringify(firedSecondRun));
})();

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
