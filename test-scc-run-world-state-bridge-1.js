/* ============================================================================
 * test-scc-run-world-state-bridge-1.js — SCC-REAL-STATE-A
 * ----------------------------------------------------------------------------
 * Gate for slice 1: a committed Scenario Control Center run routes its per-tick
 * real moves through World State (WS3) and onto the live map — the operator's
 * decision now changes the single source of truth, not just the symbolic layer.
 * Verifies: (1) the records->MOVE-decisions->moved-positions contract the bridge
 * relies on (via the real WS3 engine), (2) WS3 is loaded, (3) the map updater +
 * (4) the free-fight bridge exist, are gated, and stay inside the AI/sim boundary
 * (no window.units/scenario mutation, no backend call).
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = __dirname;
var WS3 = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state-transition.js'));

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('\n=== SCC-REAL-STATE-A: committed run -> World State -> live map ===\n');

console.log('--- 1. WS3 transform: engine records -> MOVE decisions -> moved World State ---');
(function () {
    var ws = { units: [
        { uid: 'BLUE-1', side: 'blue', position: [46.0, 24.0], strength: 1 },
        { uid: 'RED-1',  side: 'red',  position: [46.5, 24.5], strength: 1 }
    ] };
    // Mirror exactly how the bridge builds decisions from _movedMovementRecords (to = {lat,lon}).
    var records = [
        { uid: 'BLUE-1', to: { lat: 24.10, lon: 46.10 } },
        { uid: 'RED-1',  to: { lat: 24.40, lon: 46.40 } },
        { uid: 'GHOST',  to: { lat: 0, lon: 0 } }        // not in WS -> WS3 no-ops it
    ];
    var decisions = records.filter(function (r) {
        return r && r.uid && r.to && isFinite(+r.to.lon) && isFinite(+r.to.lat);
    }).map(function (r) { return { type: 'MOVE', actor: r.uid, to: [+r.to.lon, +r.to.lat] }; });
    assert('T-1  builds MOVE decisions ([lon,lat]) from records', decisions.length === 3 && decisions[0].type === 'MOVE' && decisions[0].to[0] === 46.10 && decisions[0].to[1] === 24.10);

    var res = WS3.applyDecisions(ws, decisions);
    var nw = res.worldState;
    function u(uid) { return nw.units.filter(function (x) { return x.uid === uid; })[0]; }
    assert('T-2  BLUE-1 moved to its decision target', u('BLUE-1').position[0] === 46.10 && u('BLUE-1').position[1] === 24.10);
    assert('T-3  RED-1 moved to its decision target', u('RED-1').position[0] === 46.40 && u('RED-1').position[1] === 24.40);
    assert('T-4  input World State not mutated (WS3 is pure)', ws.units[0].position[0] === 46.0 && ws.units[0].position[1] === 24.0);
    assert('T-5  deltas map back to moved units by uid', (function () {
        var byUid = {}; nw.units.forEach(function (x) { if (x && x.uid) byUid[x.uid] = x; });
        return decisions.map(function (d) { return byUid[d.actor]; }).filter(Boolean).length === 2;
    })());
    assert('T-6  explainable effects returned', Array.isArray(res.effects) && res.effects.filter(function (e) { return e.type === 'move'; }).length === 2);
})();

console.log('\n--- 2. WS3 is loaded in the live app ---');
(function () {
    var app = src('UI_MOdified/client/app.html');
    assert('T-1  app.html loads world-state-transition.js', app.indexOf('shell/world-state-transition.js') !== -1);
    assert('T-2  WS3 loaded after WS1 (dependency order)', app.indexOf('shell/world-state.js') < app.indexOf('shell/world-state-transition.js'));
})();

console.log('\n--- 3. map updater applyWorldStateUnitDeltas: present, exported, boundary-safe ---');
(function () {
    var map = src('UI_MOdified/client/wargame/adjudicator-map.js');
    assert('T-1  defines applyWorldStateUnitDeltas', map.indexOf('function applyWorldStateUnitDeltas') !== -1);
    assert('T-2  exported in public API', map.indexOf('applyWorldStateUnitDeltas,') !== -1);
    var i = map.indexOf('function applyWorldStateUnitDeltas');
    var body = map.slice(i, i + 1500);
    assert('T-3  moves the real marker (setLatLng)', body.indexOf('setLatLng') !== -1);
    assert('T-4  restyles via renderMarkerByStatus', body.indexOf('renderMarkerByStatus') !== -1);
    assert('T-5  updates only internal unitRegistry', body.indexOf('unitRegistry[') !== -1);
    assert('T-6  no window.units / scenario mutation', !/window\.units|scenarioRef\.[\w.]+\s*=[^=]|\.steps\s*=[^=]/.test(body));
    assert('T-7  no backend call', !/fetch\s*\(|\/api\//.test(body));
})();

console.log('\n--- 4. free-fight bridge: present, gated to committed run, boundary-safe ---');
(function () {
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    assert('T-1  defines _applyRunMovesToWorldState', ff.indexOf('function _applyRunMovesToWorldState') !== -1);
    assert('T-2  invoked after the tick builds moved records', ff.indexOf('_applyRunMovesToWorldState(_movedMovementRecords)') !== -1);
    var i = ff.indexOf('function _applyRunMovesToWorldState');
    var body = ff.slice(i, i + 1800);
    assert('T-3  gated to the committed run (_coaExec.active)', body.indexOf('_coaExec') !== -1 && body.indexOf('.active') !== -1);
    assert('T-4  builds MOVE decisions', body.indexOf("type: 'MOVE'") !== -1);
    assert('T-5  routes through World State (WS3 applyDecisions)', body.indexOf('AppWorldStateTransition') !== -1 && body.indexOf('applyDecisions') !== -1);
    assert('T-6  reflects on the live map (applyWorldStateUnitDeltas)', body.indexOf('applyWorldStateUnitDeltas') !== -1);
    assert('T-7  no window.units / scenario mutation', !/window\.units|scenarioRef\.[\w.]+\s*=[^=]|\.steps\s*=[^=]/.test(body));
    assert('T-8  no backend call in the bridge', !/fetch\s*\(|\/api\//.test(body));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
