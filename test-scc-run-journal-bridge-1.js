/* ============================================================================
 * test-scc-run-journal-bridge-1.js — SCC-REAL-STATE-C (Option A)
 * ----------------------------------------------------------------------------
 * Gate for Option A: a committed Scenario Control Center Run now DURABLY journals
 * each tick's real moves through the sanctioned deterministic decision path
 * (POST /api/sim/decide -> commitDecisions -> one durable journal row per MOVE).
 * Completes "decision -> movement -> durable effect": Slice 1 moves the live map,
 * Slice 2 journals the commit act, this journals what changed each tick.
 * Verifies: (1) free-fight-demo.js defines _journalRunTickMoves and _coaExecTick
 * calls it (after the Slice-1 map bridge, same _movedMovementRecords); (2) it POSTs
 * /api/sim/decide with MOVE decisions + operator_id + a RUN_TICK marker; (3) it is
 * gated (active run + typeof fetch), fire-and-forget, and boundary-safe (no
 * window.units/scenario mutation, not /api/sim/commit); (4) WS3 turns those MOVE
 * decisions into moved positions; (5) the server contract it relies on is intact.
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

console.log('\n=== SCC-REAL-STATE-C: committed Run tick -> durable journal (/api/sim/decide) ===\n');

console.log('--- 1. free-fight-demo.js: per-tick run-journal helper present, called, boundary-safe ---');
(function () {
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    assert('T-1  defines _journalRunTickMoves', ff.indexOf('function _journalRunTickMoves') !== -1);

    // _coaExecTick must call it, AFTER the Slice-1 map bridge, on the same records.
    var ti = ff.indexOf('function _coaExecTick() {');
    var mapCall = ff.indexOf('_applyRunMovesToWorldState(_movedMovementRecords)', ti);
    var jCall   = ff.indexOf('_journalRunTickMoves(_movedMovementRecords)', ti);
    assert('T-2  _coaExecTick calls _journalRunTickMoves after the map bridge', ti !== -1 && mapCall !== -1 && jCall !== -1 && jCall > mapCall);

    var i = ff.indexOf('function _journalRunTickMoves');
    var body = ff.slice(i, i + 2400);
    assert('T-3  POSTs the sanctioned deterministic path /api/sim/decide', body.indexOf('/api/sim/decide') !== -1);
    assert('T-4  builds MOVE decisions ([lon,lat])', body.indexOf("type: 'MOVE'") !== -1 && /to:\s*\[\+r\.to\.lon,\s*\+r\.to\.lat\]/.test(body));
    assert('T-5  carries operator_id', body.indexOf('operator_id') !== -1 && body.indexOf('CHAT_CONFIG') !== -1);
    assert('T-6  durable run marker (RUN_TICK + coa_id + scc-run runId)',
        body.indexOf("kind: 'RUN_TICK'") !== -1 && /coa_id:\s*coaId/.test(body) && body.indexOf("'scc-run-'") !== -1);
    assert('T-7  gated to the committed operator run (_coaExec.active)', /_coaExec\.active/.test(body));
    assert('T-8  inert without fetch (typeof fetch guard)', /typeof\s+w\.fetch\s*!==\s*'function'/.test(body));
    assert('T-9  boundary: no window.units / scenario / steps mutation',
        !/window\.units|scenarioRef\.[\w.]+\s*=[^=]|\.scenario\s*=[^=]|\.steps\s*=[^=]/.test(body));
    assert('T-10 uses the deterministic path, NOT the LLM /api/sim/commit', body.indexOf('/api/sim/commit') === -1);
    assert('T-11 fire-and-forget (has a .catch so it never blocks the tick)', body.indexOf('.catch(') !== -1);

    // Slice-1 bridge stays backend-free (regression guard on the map path itself).
    var bi = ff.indexOf('function _applyRunMovesToWorldState');
    var bbody = ff.slice(bi, bi + 1800);
    assert('T-12 Slice-1 map bridge is still backend-free (no /api/ in its body)', !/fetch\s*\(|\/api\//.test(bbody));
})();

console.log('\n--- 2. WS3 turns the journaled MOVE decisions into moved positions ---');
(function () {
    var ws = { units: [{ uid: 'BLUE-1', side: 'blue', position: [46.0, 24.0], strength: 1 }] };
    var records = [{ uid: 'BLUE-1', to: { lat: 24.25, lon: 46.25 } }];
    var decisions = records.filter(function (r) { return r && r.uid && r.to && isFinite(+r.to.lon) && isFinite(+r.to.lat); })
        .map(function (r) { return { type: 'MOVE', actor: r.uid, to: [+r.to.lon, +r.to.lat] }; });
    assert('T-1  builds one MOVE decision ([lon,lat])', decisions.length === 1 && decisions[0].to[0] === 46.25 && decisions[0].to[1] === 24.25);
    var res = WS3.applyDecisions(ws, decisions);
    var u = res.worldState.units[0];
    assert('T-2  WS3 moves the unit to the decision target', u.position[0] === 46.25 && u.position[1] === 24.25);
    assert('T-3  input World State not mutated (pure)', ws.units[0].position[0] === 46.0);
})();

console.log('\n--- 3. server contract the run journal relies on is intact ---');
(function () {
    var agent = src('UI_MOdified/server/ai/adjudicator-agent.js');
    var web   = src('UI_MOdified/server/web-server.js');
    var ci = agent.indexOf('function commitDecisions');
    var cbody = agent.slice(ci, ci + 2800);
    assert('T-1  commitDecisions requires operator_id (intent, R2)', cbody.indexOf('operator_id') !== -1);
    assert('T-2  commitDecisions writes one durable journal row per decision', /decisions\.forEach/.test(cbody) && /appendCommit/.test(cbody));
    assert('T-3  it forwards mods (RUN_TICK marker lands durably)', /mods:\s*body\.mods\s*\|\|\s*null/.test(cbody));
    assert('T-4  web-server routes POST /api/sim/decide -> commitDecisions',
        /'\/api\/sim\/decide'\s*&&\s*req\.method\s*===\s*'POST'/.test(web) && /commitDecisions\(/.test(web));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
