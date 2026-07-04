/* ============================================================================
 * test-scc-runtime-clock-1.js — OPTION C / SLICE C1
 * ----------------------------------------------------------------------------
 * Gate for C1: the committed Run advances a SCENARIO RUNTIME CLOCK (current_time)
 * and World State carries it as a live value; steps become snapshots the clock
 * indexes into (findStepForElapsedHours). Time model = H-relative hours from
 * steps[].elapsed_hours (NO scenario schema change).
 *   - world-state.js: new findStepForElapsedHours(scenario, hours) (floor: the
 *     authored step in effect at a time) + deriveWorldStateWithOwned's 4th `clock`
 *     arg attaches a transient ws.clock. The pure deriveWorldState(scenario, step)
 *     stays byte-identical (all WS1/DET1/ENG1/B1 tests keep passing) and the
 *     authored scenario is never mutated (boundary).
 *   - free-fight-demo.js: _coaExec.clock seeded on commit from the elapsed-hours
 *     span; advanced per tick in _coaExecTick (speed-scaled via _clockSpeedMult,
 *     clamped to end_hours); playing wired to Run/Pause; published via the map's
 *     setRunClock; cleared on reset/replan; re-published on restore.
 *   - adjudicator-map.js: setRunClock override; applyState derives WITH the clock
 *     (4th arg) when either owned positions OR a clock is present; runClockLabel()
 *     reads the LIVE runClock (H-relative or absolute Zulu DTG). Internal-only.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = __dirname;
// Load DB1 first so deriveWorldState auto-enriches (contacts derivable), then WS1 + DET1.
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
        name: 't-c1', scenario_label: 't-c1', map_bbox: [45, 23, 49, 27],
        obj: { name: 'O', coord: [47, 25], target_depth_km: 50, carver: 20 },
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        red_units: [{ uid: 'R1', label: 'R1', bls: 'BLS-1', appear: 0, role: 'S-300 PKS', domain: 'ground', coord: [46.0, 24.0] }],
        blue_units_initial: [{ unit_uid: 'B1', base_id: 'B1', role: 'fighter', domain: 'air', coord: [47.0, 25.0] }],
        steps: [
            { index: 0, time_label: 'H-30', elapsed_hours: -30, phase: 'PREP' },
            { index: 1, time_label: 'H', elapsed_hours: 0, phase: 'EXEC' },
            { index: 2, time_label: 'H+6', elapsed_hours: 6, phase: 'STRIKE' },
            { index: 3, time_label: 'H+24', elapsed_hours: 24, phase: 'CONSOL' }
        ]
    };
}

console.log('\n=== OPTION C / SLICE C1: scenario runtime clock (time drives the committed Run) ===\n');

console.log('--- 1. findStepForElapsedHours: floor mapping (steps become snapshots of time) ---');
(function () {
    var s = scen();
    assert('T-1  API exposes findStepForElapsedHours', typeof WS.findStepForElapsedHours === 'function');
    assert('T-2  before the first step floors to step 0', WS.findStepForElapsedHours(s, -40).index === 0);
    assert('T-3  exact step time returns that step (-30 → 0)', WS.findStepForElapsedHours(s, -30).index === 0);
    assert('T-4  between steps floors to the earlier (3h → step 1 @ H)', WS.findStepForElapsedHours(s, 3).index === 1 && WS.findStepForElapsedHours(s, 3).time_label === 'H');
    assert('T-5  exact later step (6h → step 2 @ H+6)', WS.findStepForElapsedHours(s, 6).index === 2 && WS.findStepForElapsedHours(s, 6).time_label === 'H+6');
    assert('T-6  beyond the last step clamps to the last (999 → step 3)', WS.findStepForElapsedHours(s, 999).index === 3);
    assert('T-7  non-finite hours falls back to step 0 (no throw)', WS.findStepForElapsedHours(s, NaN).index === 0);
    assert('T-8  empty scenario is safe (index 0, null label)', WS.findStepForElapsedHours({}, 5).index === 0);
})();

console.log('\n--- 2. deriveWorldStateWithOwned clock arg: attaches ws.clock, stays pure ---');
(function () {
    var s = scen();
    var pureBefore = JSON.stringify(WS.deriveWorldState(s, 1));
    var clock = { start_hours: -30, current_hours: 3, end_hours: 24, playing: true, speed: 5 };
    var ws = WS.deriveWorldStateWithOwned(s, 1, null, clock);
    assert('T-1  ws.clock attached when a clock is passed', ws.clock && typeof ws.clock === 'object');
    assert('T-2  ws.clock carries start/current/end hours', ws.clock.start_hours === -30 && ws.clock.current_hours === 3 && ws.clock.end_hours === 24);
    assert('T-3  ws.clock.step_index derived via findStepForElapsedHours (3h → step 1)', ws.clock.step_index === 1 && ws.clock.time_label === 'H');
    assert('T-4  ws.clock echoes playing + speed', ws.clock.playing === true && ws.clock.speed === 5);
    assert('T-5  no start_time → current_ms is null (H-relative only)', ws.clock.current_ms === null && ws.clock.start_time === null);
    assert('T-6  complete=false while current < end', ws.clock.complete === false);

    var pureAfter = JSON.stringify(WS.deriveWorldState(s, 1));
    assert('T-7  pure deriveWorldState byte-identical before/after (purity)', pureBefore === pureAfter);
    assert('T-8  3-arg call (no clock) === pure deriveWorldState (B1 purity preserved)', JSON.stringify(WS.deriveWorldStateWithOwned(s, 1, null)) === pureAfter);
    assert('T-9  no ws.clock when clock omitted', !('clock' in WS.deriveWorldStateWithOwned(s, 1, null)));
    assert('T-10 boundary: authored scenario steps NOT mutated', s.steps[2].elapsed_hours === 6 && s.red_units[0].coord[0] === 46.0);

    // clock coexists with owned positions (both overlays apply, derivations coherent)
    var owned = { R1: { position: [46.5, 24.5] } };
    var ws2 = WS.deriveWorldStateWithOwned(s, 1, owned, clock);
    var r1 = ws2.units.filter(function (u) { return u.uid === 'R1'; })[0];
    assert('T-11 owned position + clock coexist', ws2.owned_positions_applied === true && ws2.clock && JSON.stringify(r1.position) === JSON.stringify([46.5, 24.5]));

    // complete flag when current reaches end
    var doneClock = { start_hours: -30, current_hours: 24, end_hours: 24, playing: false, speed: 1 };
    assert('T-12 complete=true when current >= end', WS.deriveWorldStateWithOwned(s, 3, null, doneClock).clock.complete === true);

    // start_time present → absolute Zulu epoch
    var s2 = scen(); s2.start_time = '2022-03-01T00:00:00Z';
    var ws3 = WS.deriveWorldStateWithOwned(s2, 1, null, { start_hours: 0, current_hours: 3, end_hours: 24 });
    assert('T-13 start_time present → current_ms = start + hours (H+3 → 03:00Z)', ws3.clock.current_ms === Date.parse('2022-03-01T03:00:00Z'));
})();

console.log('\n--- 3. free-fight-demo.js: clock seed + advance + speed + play/pause + publish, boundary-safe ---');
(function () {
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    assert('T-1  defines the clock helpers', /var COA_CLOCK_HOURS_PER_TICK/.test(ff) && /var FF_CLOCK_SPEED_MULT/.test(ff) &&
        ff.indexOf('function _clockSpeedMult') !== -1 && ff.indexOf('function _advanceScenarioClock') !== -1 &&
        ff.indexOf('function _publishRunClock') !== -1 && ff.indexOf('function _clockBoundsFromScenario') !== -1);
    assert('T-2  clock seeded on commit from the elapsed-hours span', /_clockBoundsFromScenario\(\)/.test(ff) &&
        /_coaExec\.clock = \{ start_hours: _clkB\.start, current_hours: _clkB\.start, end_hours: _clkB\.end/.test(ff));
    // advanced in the tick, AFTER ticks++ (so it counts a real executed tick)
    var ti = ff.indexOf('function _coaExecTick() {');
    var tks = ff.indexOf('_coaExec.ticks++; _coaExec.updated_at = _nowISO();', ti);
    var adv = ff.indexOf('_advanceScenarioClock()', tks);
    assert('T-3  _coaExecTick advances the clock after ticks++', ti !== -1 && tks !== -1 && adv !== -1 && adv > tks);
    // advance math: speed-scaled + clamped to end
    var ai = ff.indexOf('function _advanceScenarioClock');
    var abody = ff.slice(ai, ai + 700);
    assert('T-4  advance is speed-scaled (COA_CLOCK_HOURS_PER_TICK * c.speed)', /COA_CLOCK_HOURS_PER_TICK \* c\.speed/.test(abody));
    assert('T-5  advance clamps to end_hours (Math.min)', /Math\.min\(\+c\.end_hours,/.test(abody));
    assert('T-6  speed comes from the existing FF speed presets', /_clockSpeedMult\(\)/.test(abody) && /FF_CLOCK_SPEED_MULT\[_freeFightSpeed\]/.test(ff));
    // play/pause wired to the existing Run/Pause controls
    assert('T-7  Run sets clock playing = true', /_coaExec\.clock\.playing = true;/.test(ff));
    assert('T-8  Pause sets clock playing = false', /_coaExec\.clock\.playing = false;/.test(ff));
    // publish gated to an active run; cleared on reset/replan; re-published on restore
    assert('T-9  publish gated to an active run (clears to null otherwise)', /setRunClock\(\(_coaExec && _coaExec\.active && _coaExec\.clock\) \|\| null\)/.test(ff));
    assert('T-10 cleared on reset + replan, re-published on restore', (function () {
        var r = ff.indexOf('function _resetCoaExec'); var rp = ff.indexOf('_generateCoaPlan();   // the single LLM call'); var rs = ff.indexOf('function _restoreCoaExec');
        return ff.slice(r, r + 400).indexOf('_publishRunClock()') !== -1 &&
            ff.slice(Math.max(0, rp - 300), rp).indexOf('_publishRunClock()') !== -1 &&
            ff.slice(rs, rs + 700).indexOf('_publishRunClock()') !== -1;
    })());
    assert('T-11 live scenario-time readout in the run status panel', ff.indexOf('Scenario time:') !== -1 && ff.indexOf('_scenarioClockLabel(ex)') !== -1);
    assert('T-12 boundary: clock helpers do not mutate window.units / scenario / steps',
        !/window\.units|scenarioRef\.[\w.]+\s*=[^=]|\.steps\s*=[^=]/.test(ff.slice(ai, ai + 900)));
})();

console.log('\n--- 4. adjudicator-map.js: setRunClock override + applyState clock derive + label, boundary-safe ---');
(function () {
    var map = src('UI_MOdified/client/wargame/adjudicator-map.js');
    assert('T-1  defines setRunClock + runClockLabel + _formatHrel', map.indexOf('function setRunClock') !== -1 && map.indexOf('function runClockLabel') !== -1 && map.indexOf('function _formatHrel') !== -1);
    assert('T-2  exports setRunClock + getRunClock + runClockLabel', /setRunClock,/.test(map) && /getRunClock: \(\) => runClock,/.test(map) && /runClockLabel,/.test(map));
    assert('T-3  applyState derives WITH the clock (4th arg) when owned OR clock present',
        /\(ownedRunPositions \|\| runClock\) && typeof window\.AppWorldState\.deriveWorldStateWithOwned === 'function'/.test(map) &&
        map.indexOf('deriveWorldStateWithOwned(lastAppliedScenario, stepIdx, ownedRunPositions, runClock)') !== -1);
    var si = map.indexOf('function setRunClock');
    var sbody = map.slice(si, si + 300);
    assert('T-4  setRunClock stores an internal override only (finite current_hours or null)',
        /runClock = \(clock && typeof clock === 'object' && isFinite\(\+clock\.current_hours\)\)/.test(sbody) && !/window\.units|scenarioRef\.[\w.]+\s*=[^=]/.test(sbody));
    var li = map.indexOf('function runClockLabel');
    var lbody = map.slice(li, li + 700);
    assert('T-5  runClockLabel reads the LIVE runClock (not lastWorldState.clock)', /const c = runClock;/.test(lbody));
    assert('T-6  runClockLabel uses AppShellClock.formatZuluDtg when start_time present, else H-relative', /AppShellClock\.formatZuluDtg/.test(lbody) && /_formatHrel/.test(lbody));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
