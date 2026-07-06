/* ============================================================================
 * test-continuous-runtime-play-model-1.js — OPTION C / SLICE C3b
 * ----------------------------------------------------------------------------
 * Owner ruling: STOP treating steps[] as the scenario play engine.
 *   Play = continuous scenario TIME.  Step = review/snapshot only.
 * CMO-like: Play starts the runtime clock from scenario start; the clock runs
 * through the scenario span (or duration_minutes); speed (x1/x5/x15/fire) scales
 * clock progression; Pause freezes; Resume continues; Stop/Reset returns to start;
 * at the end bound the runtime is marked complete and the clock stops.
 *
 * Built on the EXISTING C1/C2/C3a clock — NO second clock. steps[] are NOT
 * deleted; AAR/evidence/review snapshots stay. This gate asserts:
 *   1. A pure, single-source runtime state + progression model exists
 *      (advanceRuntimeClock / runtimeClockState / resetRuntimeClock).
 *   2. Speed scales clock progression (not fixed-step jumps).
 *   3. Pause freezes the clock; Resume continues it.
 *   4. Stop/Reset returns the clock to scenario start.
 *   5. duration_minutes clamps the runtime end; else max steps[].elapsed_hours.
 *   6. At the end bound → complete, clock stops.
 *   7. Primary Play advances the clock (not fixed steps); the readout is TIME.
 *   8. Step/snapshot controls are review-only, not primary play controls.
 *   9. Manual snapshot scrub pauses a playing runtime (C2 ownership guard).
 *  10. C1/C2 gate invariants still hold.
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

function playingClock(over) {
    return Object.assign({ start_hours: 0, current_hours: 0, end_hours: 100, speed: 1, playing: true, paused: false, completed: false }, over || {});
}

console.log('\n=== OPTION C / SLICE C3b: Continuous Runtime Play Model ===\n');

console.log('--- 1. pure runtime play model exists (single source; no 2nd clock) ---');
(function () {
    assert('T-1  advanceRuntimeClock exported', typeof WS.advanceRuntimeClock === 'function');
    assert('T-2  runtimeClockState exported', typeof WS.runtimeClockState === 'function');
    assert('T-3  resetRuntimeClock exported', typeof WS.resetRuntimeClock === 'function');
})();

console.log('\n--- 2. speed scales CLOCK progression (Play advances TIME, not step numbers) ---');
(function () {
    var a1 = WS.advanceRuntimeClock(playingClock({ speed: 1 }), 0.25);
    assert('T-1  x1: +0.25h per tick', Math.abs(a1.current_hours - 0.25) < 1e-9);
    var a5 = WS.advanceRuntimeClock(playingClock({ speed: 5 }), 0.25);
    assert('T-2  x5: 5× the x1 progression (+1.25h)', Math.abs(a5.current_hours - 1.25) < 1e-9);
    var a15 = WS.advanceRuntimeClock(playingClock({ speed: 15 }), 0.25);
    assert('T-3  x15: 15× the x1 progression (+3.75h)', Math.abs(a15.current_hours - 3.75) < 1e-9);
    assert('T-4  higher speed strictly advances more', a15.current_hours > a5.current_hours && a5.current_hours > a1.current_hours);
    // the step index does NOT drive progression — the clock does (current_hours moves continuously)
    assert('T-5  progression is continuous hours, not integer step jumps', a1.current_hours !== Math.round(a1.current_hours));
})();

console.log('\n--- 3. Pause freezes the clock; Resume continues it ---');
(function () {
    // paused → no advance even if playing flag lingers
    var paused = WS.advanceRuntimeClock(playingClock({ current_hours: 10, paused: true }), 0.25);
    assert('T-1  paused clock does NOT advance', paused.current_hours === 10);
    // not playing → no advance
    var stopped = WS.advanceRuntimeClock(playingClock({ current_hours: 10, playing: false }), 0.25);
    assert('T-2  non-playing clock does NOT advance', stopped.current_hours === 10);
    // resume (playing true, paused false) → advances again from where it froze
    var resumed = WS.advanceRuntimeClock(playingClock({ current_hours: 10, playing: true, paused: false, speed: 1 }), 0.25);
    assert('T-3  resumed clock continues from the frozen time (10 → 10.25)', Math.abs(resumed.current_hours - 10.25) < 1e-9);
})();

console.log('\n--- 4. Stop/Reset returns the clock to scenario start ---');
(function () {
    var reset = WS.resetRuntimeClock(playingClock({ start_hours: -30, current_hours: 12, end_hours: 24, playing: true, paused: false, completed: true }));
    assert('T-1  current returns to start_hours', reset.current_hours === -30 && reset.start_hours === -30);
    assert('T-2  reset is stopped (not playing/paused/complete)', reset.playing === false && reset.paused === false && reset.completed === false);
    assert('T-3  runtimeClockState of a reset clock is "stopped"', WS.runtimeClockState(reset) === 'stopped');
})();

console.log('\n--- 5. duration_minutes clamps the runtime end; else max steps[].elapsed_hours ---');
(function () {
    var steps = [{ index: 0, elapsed_hours: -30 }, { index: 1, elapsed_hours: 0 }, { index: 2, elapsed_hours: 24 }];
    var noDur = WS.scenarioRuntimeBounds({ steps: steps });
    assert('T-1  no duration → end = max steps[].elapsed_hours (24)', noDur.end === 24);
    var dur = WS.scenarioRuntimeBounds({ steps: steps, duration_minutes: 360 });
    assert('T-2  duration 360min → end capped to 6 (< steps span 24)', dur.end === 6 && dur.steps_end === 24);
    // advancing a playing clock seeded to the duration cap clamps + completes AT the cap
    var atCap = WS.advanceRuntimeClock(playingClock({ current_hours: 5.9, end_hours: 6, speed: 1 }), 0.25);
    assert('T-3  advance clamps to the end bound (never overshoots)', atCap.current_hours === 6);
    assert('T-4  reaching the bound marks completed + stops the clock', atCap.completed === true && atCap.playing === false);
})();

console.log('\n--- 6. runtime state machine: stopped / playing / paused / complete ---');
(function () {
    assert('T-1  playing', WS.runtimeClockState(playingClock()) === 'playing');
    assert('T-2  paused', WS.runtimeClockState(playingClock({ playing: false, paused: true })) === 'paused');
    assert('T-3  stopped (fresh at start)', WS.runtimeClockState(playingClock({ playing: false, paused: false })) === 'stopped');
    assert('T-4  complete via flag', WS.runtimeClockState(playingClock({ completed: true })) === 'complete');
    assert('T-5  complete via current>=end (end>start)', WS.runtimeClockState(playingClock({ current_hours: 100, end_hours: 100 })) === 'complete');
    // a degenerate empty span (end==start) is NOT falsely "complete"
    assert('T-6  empty span (end==start) is stopped, not complete', WS.runtimeClockState({ start_hours: 0, current_hours: 0, end_hours: 0, playing: false }) === 'stopped');
})();

console.log('\n--- 7. free-fight-demo: Play advances the CLOCK; state synced across all run paths ---');
(function () {
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    // clock seeded with the explicit runtime-state fields
    assert('T-1  clock seed carries paused:false + completed:false', /_coaExec\.clock = \{[^}]*paused: false, completed: false/.test(ff));
    // the single advance delegates to the pure world-state reducer (no second clock)
    assert('T-2  _advanceScenarioClock delegates to AppWorldState.advanceRuntimeClock', /advanceRuntimeClock\(c, COA_CLOCK_HOURS_PER_TICK\)/.test(ff));
    // committed Run / Pause set truthful playing+paused
    assert('T-3  _runCommittedCoa: playing=true, paused=false', ff.indexOf('_coaExec.clock.playing = true; _coaExec.clock.paused = false;') !== -1);
    assert('T-4  _pauseCommittedCoa: playing=false, paused=true', ff.indexOf('_coaExec.clock.playing = false; _coaExec.clock.paused = true;') !== -1);
    // SCC scenario Play/Pause also freeze/unfreeze the clock (state stays truthful)
    var ps = ff.indexOf('function _pauseScenario');
    assert('T-5  _pauseScenario freezes the clock (playing=false, paused=true)', ps !== -1 && /_coaExec\.clock\.playing = false; _coaExec\.clock\.paused = true;/.test(ff.slice(ps, ps + 500)));
    var rs = ff.indexOf('function _runScenario()');
    assert('T-6  _runScenario unfreezes the clock (playing=true, paused=false)', rs !== -1 && /_coaExec\.clock\.playing = true; _coaExec\.clock\.paused = false;/.test(ff.slice(rs, rs + 3200)));
    // Stop returns the clock to scenario start
    var st = ff.indexOf('function _stopScenario()');
    assert('T-7  _stopScenario resets the clock to start (resetRuntimeClock)', st !== -1 && /resetRuntimeClock/.test(ff.slice(st, st + 700)));
    // public runtime API
    assert('T-8  exposes runtimeState + runtimeSnapshot + setRuntimeSpeed', /runtimeState:/.test(ff) && /runtimeSnapshot:/.test(ff) && /setRuntimeSpeed:/.test(ff));
    // normalized speed presets scale the clock
    assert('T-9  speed presets normalized (x1/x5/x15/fire) drive the clock', /FF_CLOCK_SPEED_MULT = \{ x1: 1, x5: 5, x15: 15, fire: 30/.test(ff) && /FF_CLOCK_SPEED_MULT\[_freeFightSpeed\]/.test(ff));
})();

console.log('\n--- 8. UI: primary readout is TIME; steps are review-only, not the run engine ---');
(function () {
    var scc = src('UI_MOdified/client/shell/scenario-control-center.js');
    var i18n = src('UI_MOdified/client/i18n.js');
    var html = src('UI_MOdified/client/app.html');
    // primary readout leads with Scenario time, not Turn/Step
    assert('T-1  SCC primary readout shows "Scenario time"', scc.includes("kv('Scenario time'"));
    assert('T-2  SCC does NOT lead with a bare "Turn" primary headline', !scc.includes("kv('Turn', String(scn.scenario_turn)"));
    // optional secondary "Snapshot in effect" readout (steps as review only)
    assert('T-3  SCC surfaces snapshot as SECONDARY "Snapshot in effect"', scc.includes('Snapshot in effect'));
    // primary Play button binds to the time-based run, not a step-advance
    assert('T-4  scc-run binds to runScenario/runScenarioContinuous (time), not a step jump', /bindFn\('scc-run',[\s\S]*?runScenario/.test(scc));
    // legacy fixed-step surface is marked review/diagnostic, relabelled to snapshot vocabulary
    assert('T-5  legacy step control relabelled "Next snapshot"', i18n.includes("'wg-btn-next': 'Next snapshot'"));
    assert('T-6  legacy HUD chip is Legacy/Diagnostic + carries the not-the-run banner', html.includes('wargame-mode-chip">Legacy') && html.includes('wg-legacy-banner'));
})();

console.log('\n--- 9. manual snapshot scrub pauses a playing runtime (C2 ownership guard) ---');
(function () {
    var map = src('UI_MOdified/client/wargame/adjudicator-map.js');
    assert('T-1  non-snapshot applyState while the run is PLAYING pauses the run',
        /if \(!opts\.snapshot && runClock && runClock\.playing && window\.RmoozFreeFightDemo && typeof window\.RmoozFreeFightDemo\.pauseCommittedRun === 'function'\)/.test(map) &&
        /window\.RmoozFreeFightDemo\.pauseCommittedRun\(\)/.test(map));
})();

console.log('\n--- 10. C1/C2 gate invariants preserved ---');
(function () {
    var s = { name: 't', map_bbox: [45, 23, 49, 27], obj: { name: 'O', coord: [47, 25], target_depth_km: 50, carver: 20 },
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        red_units: [{ uid: 'R1', label: 'R1', bls: 'BLS-1', appear: 0, role: 'S-300 PKS', domain: 'ground', coord: [46, 24] }],
        blue_units_initial: [{ unit_uid: 'B1', base_id: 'B1', role: 'fighter', domain: 'air', coord: [47, 25] }],
        steps: [{ index: 0, time_label: 'H', elapsed_hours: 0, phase: 'EXEC' }, { index: 1, time_label: 'H+6', elapsed_hours: 6, phase: 'STRIKE' }] };
    var pureBefore = JSON.stringify(WS.deriveWorldState(s, 1));
    WS.deriveWorldStateWithOwned(s, 1, null, { start_hours: 0, current_hours: 3, end_hours: 6 });
    assert('T-1  deriveWorldState byte-identical (WS still pure)', JSON.stringify(WS.deriveWorldState(s, 1)) === pureBefore);
    assert('T-2  findStepForElapsedHours still floors correctly (5.9h → step 0)', WS.findStepForElapsedHours(s, 5.9).index === 0);
    assert('T-3  C1/C2/C3a gate files present', ['test-scc-runtime-clock-1.js', 'test-scc-runtime-clock-2.js', 'test-scc-runtime-clock-3.js'].every(function (f) { return fs.existsSync(path.join(ROOT, f)); }));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
