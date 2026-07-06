/* ============================================================================
 * test-scc-runtime-clock-3.js — OPTION C / SLICE C3a: Runtime Scenario Time Anchor
 * ----------------------------------------------------------------------------
 * Gate for C3a: move RMOOZ closer to a normal scenario runtime (not fixed steps)
 * by adding ABSOLUTE scenario-time support while preserving H-relative scenarios,
 * on the EXISTING C1/C2 runtime-clock path (no second clock).
 *
 * Additive authored fields (all optional; absent on every legacy scenario):
 *   - start_time       : ISO-8601 / Zulu anchor for elapsed_hours===0 (H-hour).
 *                        Present ⇒ clock shows absolute Zulu DTG (start + hours).
 *   - duration_minutes : positive runtime length from H; present ⇒ AUTHORITATIVELY
 *                        caps the runtime end bound (steps[] span otherwise).
 *   - type             : "runtime_scenario" opts in explicitly; a start_time /
 *                        duration_minutes anchor also implies it.
 * steps[].elapsed_hours stay snapshots/checkpoints the clock indexes into — never
 * removed, never the runtime engine.
 *
 * Verifies:
 *   1. Scenario WITH start_time  → absolute Zulu DTG from start_time + current_hours.
 *   2. Scenario WITHOUT start_time → still H-relative (current_ms/start_time null).
 *   3. duration_minutes clamps / marks the runtime end.
 *   4. runtime_scenario type validates ADDITIVELY (never blocks a legacy scenario).
 *   5. Existing on-disk (w4-generation) scenarios still load without start_time.
 *   6. C1/C2 gate invariants still hold (deriveWorldState purity + gate files).
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = __dirname;

// Load DB1 first so deriveWorldState auto-enriches, then WS1 + DET1 (same order as C1/C2).
// These modules bind root=global (no window shim yet), exactly like clock-1/clock-2.
require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state-db.js'));
require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'detection.js'));
var WS = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state.js'));

// Real Zulu DTG formatter (the exact label the run readout renders). clock.js needs
// window+document; readyState:'loading' defers start() so no setInterval keeps node alive.
global.window = global.window || {};
global.document = global.document || {
    readyState: 'loading', addEventListener: function () {}, getElementById: function () { return null; },
    visibilityState: 'hidden'
};
require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'clock.js'));
var formatZuluDtg = global.window.AppShellClock.formatZuluDtg;

// Server-side additive-schema check (pure node modules).
var validator = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-validator.js'));
var spec = require(path.join(ROOT, 'UI_MOdified', 'server', 'ai', 'scenario-schema-spec.js'));

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// Base H-relative fixture: prep at H-30 through H+24 (steps span end = 24).
function scen() {
    return {
        name: 't-c3a', scenario_label: 't-c3a', map_bbox: [45, 23, 49, 27],
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
// derive ws.clock at a given current-hours (through the C1 path).
function clockAt(s, hours, extra) {
    var c = Object.assign({ start_hours: -30, current_hours: hours, end_hours: 24 }, extra || {});
    return WS.deriveWorldStateWithOwned(s, 1, null, c).clock;
}

console.log('\n=== OPTION C / SLICE C3a: Runtime Scenario Time Anchor ===\n');

console.log('--- 1. start_time → absolute Zulu DTG (start_time + current_hours) ---');
(function () {
    var s = scen(); s.start_time = '2022-03-01T00:00:00Z';
    var c3 = clockAt(s, 3);
    assert('T-1  ws.clock.start_time echoes the authored anchor', c3.start_time === '2022-03-01T00:00:00Z');
    assert('T-2  current_ms = start_time + hours (H+3 → 03:00Z)', c3.current_ms === Date.parse('2022-03-01T03:00:00Z'));
    assert('T-3  Zulu DTG label at H+3 is 010300ZMAR22', formatZuluDtg(new Date(c3.current_ms)) === '010300ZMAR22');
    // prep phase (negative elapsed) maps to the correct real instant
    var cPrep = clockAt(s, -30);
    assert('T-4  H-30 → 2022-02-27T18:00Z (271800ZFEB22)', cPrep.current_ms === Date.parse('2022-02-27T18:00:00Z') && formatZuluDtg(new Date(cPrep.current_ms)) === '271800ZFEB22');
    assert('T-5  runtime_scenario flag true when start_time present', c3.runtime_scenario === true);
})();

console.log('\n--- 2. no start_time → still H-relative (unchanged legacy behaviour) ---');
(function () {
    var s = scen();
    var c = clockAt(s, 3);
    assert('T-1  start_time null (no absolute anchor)', c.start_time === null);
    assert('T-2  current_ms null (H-relative only)', c.current_ms === null);
    assert('T-3  step derived via findStepForElapsedHours (3h → step 1 @ H)', c.step_index === 1 && c.time_label === 'H');
    assert('T-4  runtime_scenario flag false (legacy stepped)', c.runtime_scenario === false);
    assert('T-5  duration_minutes null when unauthored', c.duration_minutes === null);
})();

console.log('\n--- 3. duration_minutes clamps / marks the runtime end ---');
(function () {
    var s = scen();
    // bounds: no duration → steps span (start -30, end 24)
    var b0 = WS.scenarioRuntimeBounds(s);
    assert('T-1  no duration → end = steps span (24), steps_end 24', b0.end === 24 && b0.steps_end === 24 && b0.duration_minutes === null && b0.start === -30);
    // duration 12h (720 min) caps the end EARLIER than the steps span
    var sd = scen(); sd.duration_minutes = 720;
    var bd = WS.scenarioRuntimeBounds(sd);
    assert('T-2  duration 720min → end capped to 12 (< steps_end 24)', bd.end === 12 && bd.steps_end === 24 && bd.duration_minutes === 720);
    // derived clock honours the cap: end_hours overridden, complete marked at the cap
    var cMid = clockAt(sd, 6);
    assert('T-3  clock end_hours overridden to duration cap (12)', cMid.end_hours === 12);
    assert('T-4  complete=false while current(6) < cap(12)', cMid.complete === false);
    var cEnd = clockAt(sd, 12);
    assert('T-5  complete=true when current reaches the duration cap', cEnd.complete === true);
    // 0 / negative / non-finite duration is ignored (no cap; legacy end)
    [0, -30, 'x', NaN].forEach(function (bad, i) {
        var sb = scen(); sb.duration_minutes = bad;
        assert('T-6.' + i + '  invalid duration (' + String(bad) + ') ignored → end = steps span (24)', WS.scenarioRuntimeBounds(sb).end === 24 && WS.scenarioRuntimeBounds(sb).duration_minutes === null);
    });
    // live Run advance is single-sourced from scenarioRuntimeBounds (so a run actually stops at the cap)
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    var bi = ff.indexOf('function _clockBoundsFromScenario');
    var bb = ff.slice(bi, bi + 700);
    assert('T-7  _clockBoundsFromScenario delegates to AppWorldState.scenarioRuntimeBounds', /AppWorldState\.scenarioRuntimeBounds/.test(bb) && /b\.start/.test(bb) && /b\.end/.test(bb));
})();

console.log('\n--- 4. runtime_scenario type validates ADDITIVELY (never blocks legacy) ---');
(function () {
    // classification
    assert('T-1  legacy scenario classified "stepped"', WS.runtimeScenarioType(scen()) === 'stepped');
    var st = scen(); st.type = 'runtime_scenario';
    assert('T-2  explicit type → "runtime_scenario"', WS.runtimeScenarioType(st) === 'runtime_scenario');
    var sa = scen(); sa.start_time = '2022-03-01T00:00:00Z';
    assert('T-3  start_time anchor implies runtime_scenario', WS.runtimeScenarioType(sa) === 'runtime_scenario');
    var sdur = scen(); sdur.duration_minutes = 360;
    assert('T-4  duration anchor implies runtime_scenario', WS.runtimeScenarioType(sdur) === 'runtime_scenario');
    // validation: legacy always ok, good runtime ok, bad anchors flagged, typed-but-anchorless warned
    var vLegacy = WS.validateRuntimeScenario(scen());
    assert('T-5  legacy validates ok (never blocked), type "stepped"', vLegacy.ok === true && vLegacy.type === 'stepped' && vLegacy.errors.length === 0);
    var sgood = scen(); sgood.type = 'runtime_scenario'; sgood.start_time = '2022-03-01T00:00:00Z'; sgood.duration_minutes = 720;
    assert('T-6  well-anchored runtime_scenario validates ok', WS.validateRuntimeScenario(sgood).ok === true);
    var sbadT = scen(); sbadT.type = 'runtime_scenario'; sbadT.start_time = 'not-a-date';
    var vBadT = WS.validateRuntimeScenario(sbadT);
    assert('T-7  bad start_time → ok:false with a start_time error', vBadT.ok === false && vBadT.errors.some(function (e) { return e.path === 'start_time'; }));
    var sbadD = scen(); sbadD.type = 'runtime_scenario'; sbadD.duration_minutes = -5;
    var vBadD = WS.validateRuntimeScenario(sbadD);
    assert('T-8  bad duration_minutes → ok:false with a duration_minutes error', vBadD.ok === false && vBadD.errors.some(function (e) { return e.path === 'duration_minutes'; }));
    var sTypeOnly = scen(); sTypeOnly.type = 'runtime_scenario';
    var vType = WS.validateRuntimeScenario(sTypeOnly);
    assert('T-9  typed but anchorless → ok:true + degrade warning', vType.ok === true && vType.warnings.length >= 1);
    // additive server schema: fields declared OPTIONAL (never required) + type-checked
    assert('T-10 schema lists type/start_time/duration_minutes as optional (additive)',
        spec.TOP_LEVEL.type && spec.TOP_LEVEL.type.required === false &&
        spec.TOP_LEVEL.start_time && spec.TOP_LEVEL.start_time.required === false &&
        spec.TOP_LEVEL.duration_minutes && spec.TOP_LEVEL.duration_minutes.required === false);
    assert('T-11 server type checks match the fields (string/string/number)',
        validator.typeMatches('2022-03-01T00:00:00Z', 'string') === true &&
        validator.typeMatches(720, 'number') === true &&
        validator.typeMatches('x', 'number') === false);
})();

console.log('\n--- 5. existing on-disk scenario still loads without start_time (back-compat) ---');
(function () {
    var wargame3 = JSON.parse(src('UI_MOdified/data/scenarios/wargame3.json'));
    assert('T-1  fixture carries NONE of the C3a fields', !('start_time' in wargame3) && !('duration_minutes' in wargame3) && !('type' in wargame3));
    assert('T-2  classified "stepped" (legacy)', WS.runtimeScenarioType(wargame3) === 'stepped');
    var thrown = false, c = null;
    try { c = WS.deriveWorldStateWithOwned(wargame3, 1, null, { start_hours: -30, current_hours: 0, end_hours: 144 }).clock; }
    catch (_) { thrown = true; }
    assert('T-3  derives a clock without throwing', !thrown && c && typeof c === 'object');
    assert('T-4  clock is H-relative (current_ms/start_time null), duration null', c.current_ms === null && c.start_time === null && c.duration_minutes === null);
    assert('T-5  runtime bounds = the authored steps span (-30 → 144)', WS.scenarioRuntimeBounds(wargame3).end === 144);
    // ADDITIVE PROOF: injecting the C3a fields adds NO new server-validation errors.
    var before = validator.validateScenario(wargame3).errors.length;
    var injected = Object.assign({}, wargame3, { type: 'runtime_scenario', start_time: '2022-03-01T00:00:00Z', duration_minutes: 4320 });
    var after = validator.validateScenario(injected).errors.length;
    assert('T-6  C3a fields add zero new server-validation errors (additive)', after === before);
})();

console.log('\n--- 6. C1/C2 gate invariants preserved (purity + steps-as-snapshots) ---');
(function () {
    var s = scen();
    var pureBefore = JSON.stringify(WS.deriveWorldState(s, 1));
    WS.deriveWorldStateWithOwned(s, 1, null, { start_hours: -30, current_hours: 6, end_hours: 24 });
    assert('T-1  deriveWorldState byte-identical after a clock derive (WS still pure)', JSON.stringify(WS.deriveWorldState(s, 1)) === pureBefore);
    assert('T-2  3-arg deriveWorldStateWithOwned has NO clock key (B1 purity)', !('clock' in WS.deriveWorldStateWithOwned(s, 1, null)));
    assert('T-3  findStepForElapsedHours floor mapping intact (5.9h → step 1)', WS.findStepForElapsedHours(s, 5.9).index === 1 && WS.findStepForElapsedHours(s, 6).index === 2);
    assert('T-4  authored scenario steps NOT mutated by any C3a path', s.steps[3].elapsed_hours === 24 && s.red_units[0].coord[0] === 46.0);
    assert('T-5  C1/C2 gate files still present', fs.existsSync(path.join(ROOT, 'test-scc-runtime-clock-1.js')) && fs.existsSync(path.join(ROOT, 'test-scc-runtime-clock-2.js')));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
