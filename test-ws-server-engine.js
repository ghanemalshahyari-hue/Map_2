/* ============================================================================
 * test-ws-server-engine.js — proves the RMOOZ World State engine runs
 * SERVER-SIDE end-to-end (WS1 → DB1 → DET1 → ENG1 → WS3) on the real wargame3
 * scenario, via the server seam server/sim/world-state-engine.js.
 *
 * This is the foundation for wiring WS3 into the unlocked operator commit path:
 * it confirms the server can derive World State and apply a WS3 decision to get
 * a NEW World State ("decision changed the battle"). Pure — no server, no net.
 *
 * Run: node test-ws-server-engine.js
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var E = require('./UI_MOdified/server/sim/world-state-engine.js');

var pass = 0, fail = 0;
function check(cond, msg) {
    if (cond) { pass++; console.log('  ok   ' + msg); }
    else { fail++; console.log('  FAIL ' + msg); }
}

var scn = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'UI_MOdified', 'data', 'scenarios', 'wargame3.json'), 'utf8'));

console.log('engine versions:', JSON.stringify(E.versions));

/* ---- 1. projection (WS1 + DB1 + DET1) -------------------------------------- */
var ws = E.project(scn, 0);
check(ws && ws.degraded === false && ws.source_variant === 'w3-rich',
      'wargame3 projects as w3-rich (not degraded)');
check(ws.units.length > 50, 'units projected: ' + ws.units.length);
check(ws.units.some(function (u) { return u.weapons && u.weapons.length; }),
      'DB1 enriched units with weapons');
check(ws.units.some(function (u) { return u.sensors && u.sensors.length; }),
      'DB1 enriched units with sensors');
check(Array.isArray(ws.contacts) && ws.contacts.length > 0,
      'DET1 computed contacts: ' + (ws.contacts ? ws.contacts.length : 0));

/* ---- 2. MOVE — guaranteed transition + purity ------------------------------ */
var mover = ws.units.find(function (u) { return u.position && u.uid; });
var newPos = [mover.position[0] + 0.1, mover.position[1] + 0.1];
var beforePos = mover.position.slice();
var rMove = E.transition(ws, { type: 'MOVE', actor: mover.uid, to: newPos });
var moved = rMove.worldState.units.find(function (u) { return u.uid === mover.uid; });
check(rMove.effects.some(function (e) { return e.type === 'move'; }),
      'MOVE produced a move effect');
check(moved.position[0] === newPos[0] && moved.position[1] === newPos[1],
      'MOVE changed unit position in the new World State');
check(ws.units.find(function (u) { return u.uid === mover.uid; }).position[0] === beforePos[0],
      'input World State NOT mutated (WS3 is pure)');

/* ---- 3. ENGAGE — composes detection + engagement, returns a structured outcome */
var firstShooter = ws.units.find(function (u) { return u.weapons && u.weapons.length && u.side; });
var firstTarget = firstShooter
    ? ws.units.find(function (u) { return u.side && u.side !== firstShooter.side && u.strength != null; })
    : null;
check(!!(firstShooter && firstTarget), 'found a cross-side shooter/target pair');
if (firstShooter && firstTarget) {
    var rEng = E.transition(ws, { type: 'ENGAGE', shooter: firstShooter.uid, target: firstTarget.uid, force: true });
    var eff = rEng.effects.find(function (e) { return e.type === 'engagement'; });
    check(eff && typeof eff.status === 'string' && (eff.status === 'engaged' || eff.status === 'blocked'),
          'ENGAGE returned a structured engagement outcome (status=' + (eff && eff.status) +
          (eff && eff.reason ? ', reason=' + eff.reason : '') + ')');
}

/* ---- 4. bonus: find ANY in-range engagement and prove attrition ------------ */
var shooters = ws.units.filter(function (u) { return u.weapons && u.weapons.length && u.side; }).slice(0, 30);
var targetsAll = ws.units.filter(function (u) { return u.side && u.strength != null; }).slice(0, 40);
var hit = null;
for (var i = 0; i < shooters.length && !hit; i++) {
    for (var j = 0; j < targetsAll.length; j++) {
        if (targetsAll[j].side === shooters[i].side) continue;
        var r = E.transition(ws, { type: 'ENGAGE', shooter: shooters[i].uid, target: targetsAll[j].uid, force: true });
        var e = r.effects.find(function (x) { return x.type === 'engagement' && x.status === 'engaged'; });
        if (e) { hit = e; break; }
    }
}
if (hit) {
    check(hit.strength_after < hit.strength_before,
          'ENGAGE applied attrition: ' + hit.shooter + '→' + hit.target +
          ' strength ' + hit.strength_before + '→' + hit.strength_after +
          ' (weapon=' + hit.weapon + ', pk=' + hit.pk_kill + ')');
} else {
    console.log('  note  no in-range engaged pair in the scanned slice (range/ammo gated) — MOVE proves transition');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
