/* ============================================================================
 * test-scc-run-position-ownership-1.js — OPTION B / SLICE B1
 * ----------------------------------------------------------------------------
 * Gate for B1: the committed Run OWNS unit position across step navigation.
 *   - world-state.js: new deriveWorldStateWithOwned(scenario, step, owned) overlays
 *     owned positions + RE-DERIVES (contacts/balance/etc coherent), while the pure
 *     deriveWorldState(scenario, step) stays byte-identical (all WS1/DET1/ENG1 tests
 *     keep passing) and the authored scenario is never mutated (boundary).
 *   - free-fight-demo.js: the committed-run tick accumulates _coaExec.owned_positions
 *     and publishes them; cleared on reset/replan; re-published on restore.
 *   - adjudicator-map.js: setOwnedRunPositions override; applyState derives WITH owned
 *     positions; the red + blue marker loops let owned positions win over the baseline.
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
        name: 't-b1', scenario_label: 't-b1', map_bbox: [45, 23, 49, 27],
        obj: { name: 'O', coord: [47, 25], target_depth_km: 50, carver: 20 },
        pipeline: [[46, 24], [47, 25]],
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        red_units: [{ uid: 'R1', label: 'R1', bls: 'BLS-1', appear: 0, role: 'S-300 PKS', domain: 'ground', coord: [46.0, 24.0] }],
        blue_units_base_ids: ['B1'],
        blue_units_initial: [{ unit_uid: 'B1', base_id: 'B1', role: 'fighter', domain: 'air', coord: [47.0, 25.0] }],
        phase_table: [{ index: 0, time_label: 'H', elapsed_hours: 0, phase: 'P' }],
        steps: [{ index: 0, time_label: 'H', elapsed_hours: 0, phase: 'P' }]
    };
}
function posOf(ws, uid) { var u = (ws.units || []).filter(function (x) { return x.uid === uid; })[0]; return u && u.position; }

console.log('\n=== OPTION B / SLICE B1: committed Run owns position across step navigation ===\n');

console.log('--- 1. deriveWorldStateWithOwned: overlay + re-derive, pure form untouched, scenario safe ---');
(function () {
    var scenario = scen();
    var owned = { R1: { position: [46.5, 24.5], status: 'DEGRADED', strength: 0.7 } };
    assert('T-1  API exposes deriveWorldStateWithOwned', typeof WS.deriveWorldStateWithOwned === 'function');

    var baseBefore = JSON.stringify(WS.deriveWorldState(scenario, 0));
    var wsOwned = WS.deriveWorldStateWithOwned(scenario, 0, owned);
    assert('T-2  owned position overlaid onto the unit', JSON.stringify(posOf(wsOwned, 'R1')) === JSON.stringify([46.5, 24.5]));
    assert('T-3  owned status/strength overlaid', (function () { var u = wsOwned.units.filter(function (x) { return x.uid === 'R1'; })[0]; return u && u.status === 'DEGRADED' && u.strength === 0.7; })());
    assert('T-4  owned_positions_applied flag set', wsOwned.owned_positions_applied === true);
    assert('T-5  derivations re-run against owned positions (derived present)', wsOwned.derived && ('contacts' in wsOwned.derived));

    var baseAfter = JSON.stringify(WS.deriveWorldState(scenario, 0));
    assert('T-6  pure deriveWorldState is byte-identical before/after the overlay call (purity)', baseBefore === baseAfter);
    assert('T-7  no-owned deriveWorldStateWithOwned === pure deriveWorldState', JSON.stringify(WS.deriveWorldStateWithOwned(scenario, 0, null)) === baseAfter);
    assert('T-8  boundary: authored scenario coords NOT mutated', scenario.red_units[0].coord[0] === 46.0 && scenario.red_units[0].coord[1] === 24.0);
})();

console.log('\n--- 2. free-fight-demo.js: accumulate + publish + clear + re-publish, boundary-safe ---');
(function () {
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    assert('T-1  defines _accumulateOwnedPositions + _publishOwnedPositions',
        ff.indexOf('function _accumulateOwnedPositions') !== -1 && ff.indexOf('function _publishOwnedPositions') !== -1);
    // called in the committed-run tick, after the durable per-tick journal
    var ti = ff.indexOf('function _coaExecTick() {');
    var jCall = ff.indexOf('_journalRunTickMoves(_movedMovementRecords)', ti);
    var aCall = ff.indexOf('_accumulateOwnedPositions(_movedMovementRecords)', ti);
    assert('T-2  _coaExecTick accumulates owned positions after journaling the tick', ti !== -1 && jCall !== -1 && aCall !== -1 && aCall > jCall);

    var ai = ff.indexOf('function _accumulateOwnedPositions');
    var abody = ff.slice(ai, ai + 900);
    assert('T-3  accumulate is gated to the committed operator run (_coaExec.active)', /_coaExec\.active/.test(abody));
    assert('T-4  accumulates owned_positions as { position:[lon,lat] }', /_coaExec\.owned_positions/.test(abody) && /position:\s*\[\+r\.to\.lon,\s*\+r\.to\.lat\]/.test(abody));
    assert('T-5  publishes via the map setter setOwnedRunPositions', ff.indexOf('setOwnedRunPositions') !== -1);
    assert('T-6  publish is gated to an active run (clears to null otherwise)', /setOwnedRunPositions\(\(_coaExec && _coaExec\.active && _coaExec\.owned_positions\) \|\| null\)/.test(ff));
    // Scoped to the actual _resetCoaExec / _replanCoa function bodies (robust to later insertions like C1's
    // sibling _publishRunClock lines) — still asserts each path clears the owned-position override.
    assert('T-7  cleared on run reset (_resetCoaExec) + replan (_replanCoa)', (function () {
        var ri = ff.indexOf('function _resetCoaExec');
        var rpFn = ff.indexOf('function _replanCoa'); var rp = ff.indexOf('_generateCoaPlan();   // the single LLM call', rpFn);
        return ff.slice(ri, ri + 300).indexOf('_publishOwnedPositions()') !== -1 && rpFn !== -1 && rp !== -1 && ff.slice(rpFn, rp).indexOf('_publishOwnedPositions()') !== -1;
    })());
    assert('T-8  re-published on restore (_restoreCoaExec)', (function () { var i = ff.indexOf('function _restoreCoaExec'); return ff.slice(i, i + 600).indexOf('_publishOwnedPositions()') !== -1; })());
    // Scoped to exactly the two B1 helper bodies (_accumulateOwnedPositions + _publishOwnedPositions),
    // ending at _publishOwnedPositions' last statement — so the assertion isn't tripped by the word
    // "window.units" appearing in a NEIGHBOURING helper's boundary-note comment (e.g. C1's clock helpers).
    assert('T-9  boundary: helpers do not mutate window.units / scenario / steps', (function () {
        var b1End = ff.indexOf('MAP.setOwnedRunPositions((_coaExec && _coaExec.active && _coaExec.owned_positions) || null)', ai);
        return b1End !== -1 && !/window\.units|scenarioRef\.[\w.]+\s*=[^=]|\.steps\s*=[^=]/.test(ff.slice(ai, b1End + 120));
    })());
})();

console.log('\n--- 3. adjudicator-map.js: setter + applyState owned-derive + marker overrides, boundary-safe ---');
(function () {
    var map = src('UI_MOdified/client/wargame/adjudicator-map.js');
    assert('T-1  defines setOwnedRunPositions + _ownedPosFor', map.indexOf('function setOwnedRunPositions') !== -1 && map.indexOf('function _ownedPosFor') !== -1);
    assert('T-2  exports setOwnedRunPositions in the public API', /setOwnedRunPositions,/.test(map));
    // C1 extended the overlay derive to a 4th `clock` arg + an "owned OR clock" condition (still strict).
    assert('T-3  applyState derives WITH owned positions when present (C1: + runClock 4th arg)', /\(ownedRunPositions \|\| runClock\) && typeof window\.AppWorldState\.deriveWorldStateWithOwned === 'function'/.test(map) && map.indexOf('deriveWorldStateWithOwned(lastAppliedScenario, stepIdx, ownedRunPositions, runClock)') !== -1);
    assert('T-4  red marker loop lets the owned position win', map.indexOf('const _ownRed = _ownedPosFor(meta.uid)') !== -1 && map.indexOf('if (_ownRed) lonLat = _ownRed;') !== -1);
    assert('T-5  blue marker loop lets the owned position win', map.indexOf('const _ownBlue = _ownedPosFor(meta.uid)') !== -1 && map.indexOf('if (_ownBlue) lonLat = _ownBlue;') !== -1);
    var si = map.indexOf('function setOwnedRunPositions');
    var sbody = map.slice(si, si + 500);
    assert('T-6  setter stores an internal override map only (no window.units / scenario mutation)',
        /ownedRunPositions =/.test(sbody) && !/window\.units|scenarioRef\.[\w.]+\s*=[^=]/.test(sbody));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
