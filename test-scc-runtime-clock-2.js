/* ============================================================================
 * test-scc-runtime-clock-2.js — OPTION C / SLICE C2
 * ----------------------------------------------------------------------------
 * Gate for C2: the runtime clock DRIVES the displayed snapshot. During a committed
 * Run, as the clock crosses each authored step boundary, the map re-renders the
 * AUTHORED snapshot at the clock-derived step (instant, snapshot mode) while units
 * stay at their run (owned) positions.
 *   - free-fight-demo.js: _stateFromStep (steps[i].*_baseline -> legacy `state`),
 *     _syncDisplayStepToClock (findStepForElapsedHours + debounce on clock.display_step
 *     + rmooz:run-step-changed), _renderSnapshotAtStep (drawScenario-wrapper then
 *     applyState snapshot+skipUnitPositioning), _snapshotStepLabel (run-panel readout);
 *     clock.display_step seeded -1 at commit + reset on restore; tick hook after
 *     _advanceScenarioClock + _crossed guards the per-tick redraw; pauseCommittedRun API.
 *   - adjudicator-map.js: opts.snapshot -> isForward=false (instant, no choreography
 *     replay) + skip Cesium re-sync; ownership guard (a NON-snapshot applyState during a
 *     PLAYING run clock pauses the run so a manual/adjudicator step-nav takes over).
 * Time model + world-state.js are UNCHANGED from C1 (findStepForElapsedHours reused).
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = __dirname;
require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state-db.js'));
require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'detection.js'));
var WS = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state.js'));

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function scen() {
    return {
        name: 't-c2', scenario_label: 't-c2', map_bbox: [45, 23, 49, 27],
        obj: { name: 'O', coord: [47, 25], target_depth_km: 50, carver: 20 },
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        red_units: [{ uid: 'R1', label: 'R1', role: 'S-300 PKS', domain: 'ground', coord: [46.0, 24.0] }],
        blue_units_initial: [{ unit_uid: 'B1', role: 'fighter', domain: 'air', coord: [47.0, 25.0] }],
        steps: [
            { index: 0, time_label: 'H-30', elapsed_hours: -30, phase: 'PREP' },
            { index: 1, time_label: 'H', elapsed_hours: 0, phase: 'EXEC' },
            { index: 2, time_label: 'H+6', elapsed_hours: 6, phase: 'STRIKE' },
            { index: 3, time_label: 'H+24', elapsed_hours: 24, phase: 'CONSOL' }
        ]
    };
}

console.log('\n=== OPTION C / SLICE C2: runtime clock drives the displayed snapshot ===\n');

console.log('--- 1. world-state.js UNCHANGED (findStepForElapsedHours reused; purity preserved) ---');
(function () {
    var s = scen();
    assert('T-1  findStepForElapsedHours still exported', typeof WS.findStepForElapsedHours === 'function');
    assert('T-2  floor at exact boundary (6h -> step 2)', WS.findStepForElapsedHours(s, 6).index === 2);
    assert('T-3  floor between boundaries (5.9h -> step 1)', WS.findStepForElapsedHours(s, 5.9).index === 1);
    assert('T-4  beyond last clamps (999 -> step 3)', WS.findStepForElapsedHours(s, 999).index === 3);
    var pureBefore = JSON.stringify(WS.deriveWorldState(s, 1));
    WS.deriveWorldStateWithOwned(s, 1, null, { start_hours: -30, current_hours: 6, end_hours: 24 });
    assert('T-5  deriveWorldState byte-identical (WS still pure)', JSON.stringify(WS.deriveWorldState(s, 1)) === pureBefore);
})();

console.log('\n--- 2. free-fight-demo.js: _stateFromStep + boundary sync + snapshot render + readout ---');
(function () {
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    assert('T-1  defines the four C2 helpers', ff.indexOf('function _stateFromStep') !== -1 &&
        ff.indexOf('function _renderSnapshotAtStep') !== -1 && ff.indexOf('function _syncDisplayStepToClock') !== -1 &&
        ff.indexOf('function _snapshotStepLabel') !== -1);
    // _stateFromStep maps the *_baseline fields to the legacy state shape
    var si = ff.indexOf('function _stateFromStep');
    var sb = ff.slice(si, si + 2200);
    assert('T-2  maps objective_status/force_ratio/phase_line from *_baseline', /objective_status: st\.objective_status_baseline/.test(sb) && /force_ratio: \(typeof st\.force_ratio_baseline === 'string'\)/.test(sb) && /phase_line_km: \(typeof st\.phase_line_km_baseline === 'number'\)/.test(sb));
    assert('T-3  bls_status from bls_status_baseline (cloned map)', /bls_status: _cm\(st\.bls_status_baseline\)/.test(sb));
    assert('T-4  losses_cumulative is an OBJECT with blue_destroyed (renderStep reads .blue_destroyed)', /losses_cumulative: \{/.test(sb) && /blue_destroyed: \(typeof st\.blue_destroyed_count_baseline/.test(sb));
    assert('T-5  per_unit_deltas empty arrays (applyState overrun guard)', /per_unit_deltas: \{ blue_destroyed: \[\], red_degraded: \[\] \}/.test(sb));
    // seed + reset of display_step
    assert('T-6  clock seeded with display_step:-1 at commit', /_coaExec\.clock = \{[^}]*display_step: -1/.test(ff));
    assert('T-7  display_step reset to -1 on restore', /if \(_coaExec\.clock\) _coaExec\.clock\.display_step = -1;/.test(ff));
    // tick hook AFTER the clock advance, capturing _crossed
    var ti = ff.indexOf('function _coaExecTick() {');
    var adv = ff.indexOf('_advanceScenarioClock(); } catch (_) {}', ti);
    var crs = ff.indexOf('_crossed = _syncDisplayStepToClock()', ti);
    assert('T-8  _coaExecTick syncs the display step AFTER advancing the clock', ti !== -1 && adv !== -1 && crs !== -1 && crs > adv);
    // per-tick scenario redraw guarded by !_crossed (snapshot already redrew on a cross)
    assert('T-9  per-tick redraw guarded by !_crossed', /if \(!_crossed\) _triggerScenarioRedraw\(\); syncMarkers\(\);/.test(ff));
    // _renderSnapshotAtStep: redraw wrapper THEN applyState in snapshot mode + skipUnitPositioning
    var ri = ff.indexOf('function _renderSnapshotAtStep');
    var rb = ff.slice(ri, ri + 500);
    assert('T-10 _renderSnapshotAtStep redraws then applyState(snapshot,skipUnitPositioning)', /_triggerScenarioRedraw\(\)/.test(rb) && /applyState\(_stateFromStep\(scenario, idx\), scenario, \{ skipUnitPositioning: true, snapshot: true \}\)/.test(rb));
    // debounce: early-return when the derived step equals the last displayed step
    var yi = ff.indexOf('function _syncDisplayStepToClock');
    var yb = ff.slice(yi, yi + 1000);
    assert('T-11 debounce: early-return when found.index === display_step', /found\.index === _coaExec\.clock\.display_step\) return false/.test(yb));
    assert('T-12 fires rmooz:run-step-changed on a cross', /rmooz:run-step-changed/.test(yb));
    assert('T-13 sync is gated to the committed run (_coaExec.active)', /if \(!_coaExec \|\| !_coaExec\.active \|\| !_coaExec\.clock\) return false/.test(yb));
    // run-panel readout + public pause seam
    assert('T-14 run panel shows the Snapshot step readout', ff.indexOf('Snapshot step:') !== -1 && /esc\(_snapshotStepLabel\(ex\)\)/.test(ff));
    assert('T-15 exposes pauseCommittedRun on the public API', /pauseCommittedRun: function \(\) \{ return _pauseCommittedCoa\(\); \}/.test(ff));
    // boundary safety: the new helpers do not mutate window.units / scenario / steps
    var scanEnd = ff.indexOf('function _journalRunTickMoves', si);
    assert('T-16 boundary: C2 helpers do not mutate window.units / scenario / steps',
        scanEnd !== -1 && !/window\.units|scenarioRef\.[\w.]+\s*=[^=]|\.steps\s*=[^=]/.test(ff.slice(si, scanEnd)));
})();

console.log('\n--- 3. adjudicator-map.js: snapshot=instant + Cesium skip + ownership handoff ---');
(function () {
    var map = src('UI_MOdified/client/wargame/adjudicator-map.js');
    assert('T-1  opts.snapshot forces the instant path (isForward=false)', /const isForward = opts\.snapshot \? false : \(stepIdx > lastAppliedStepIndex\);/.test(map));
    assert('T-2  Cesium re-sync skipped in snapshot mode', /if \(!opts\.snapshot && window\.AppCesiumView && window\.AppCesiumView\.isVisible\)/.test(map));
    assert('T-3  ownership guard: NON-snapshot applyState during a PLAYING run pauses the run',
        /if \(!opts\.snapshot && runClock && runClock\.playing && window\.RmoozFreeFightDemo && typeof window\.RmoozFreeFightDemo\.pauseCommittedRun === 'function'\)/.test(map) &&
        /window\.RmoozFreeFightDemo\.pauseCommittedRun\(\)/.test(map));
    // default (non-snapshot) behaviour intact: the forward/instant logic still exists for normal callers
    assert('T-4  default forward logic intact for normal callers', /stepIdx > lastAppliedStepIndex/.test(map) && /const instant = !isForward;/.test(map));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
