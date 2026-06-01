/* test-ws3-transition.js — PR-WS3 static checks (no server).
 * Verifies the state-transition loop: MOVE, EMCON-changes-detection, ENGAGE
 * (detection-gated, applies attrition + magazine decrement), RESUPPLY, purity,
 * explainable effects, and the "my decision changed the battle" narrative.
 * Run: node test-ws3-transition.js */
'use strict';
const path = require('path');
const WS3 = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state-transition.js'));
const DET = require(path.join(__dirname, 'UI_MOdified/client/shell/detection.js'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('PR-WS3 — State Transition Engine (decision → new world state)');

function near(lon, lat, dNm, brg) {
    var dLat = (dNm / 60) * Math.cos((brg || 0) * Math.PI / 180);
    var dLon = (dNm / 60) * Math.sin((brg || 0) * Math.PI / 180) / Math.cos(lat * Math.PI / 180);
    return [lon + dLon, lat + dLat];
}
const base = [19, 30];
function world(emcon) {
    return { units: [
        { uid: 'RED-DDG', side: 'RED', domain: 'sea', position: base,
          sensors: [{ id: 's1', type: 'radar', class: 'long_range_3d', emcon: emcon || 'active' },
                    { id: 'fc', class: 'fire_control', subtype: 'fire_control', channels: 2, emcon: emcon || 'active' }],
          weapons: [{ id: 'w1', type: 'sam_lr', class: 'long_range_sam', mount: 'm1', wra: { mode: 'max', salvo: 2 } }],
          magazines: [{ mount: 'm1', stock: { sam_lr: 8 } }], strength: 1 },
        { uid: 'BLU-AIR', side: 'BLUE', domain: 'air', position: near(base[0], base[1], 40, 90),
          rcs_class: 'medium', sensors: [], weapons: [], magazines: [], strength: 1 }
    ] };
}

/* 1. MOVE changes position + records prev/heading + an explainable effect */
let r = WS3.applyDecision(world(), { type: 'MOVE', actor: 'BLU-AIR', to: near(base[0], base[1], 30, 90) });
let air = r.worldState.units.find(u => u.uid === 'BLU-AIR');
ok('MOVE updates position', air.position[0] !== world().units[1].position[0]);
ok('MOVE records prev + effect', air.kinematics.prev && r.effects.some(e => e.type === 'move'));

/* 2. THE NARRATIVE: turning EMCON ON reveals contacts (decision changes the battle) */
let silent = WS3.applyDecision(world('silent'), { type: 'NOTE' });   // radar silent → recompute contacts
let cSilent = (silent.worldState.contacts || []).length;
let lit = WS3.applyDecision(world('silent'), { type: 'SET_EMCON', actor: 'RED-DDG', value: 'active' });
let cLit = (lit.worldState.contacts || []).length;
ok('EMCON silent → no contacts', cSilent === 0);
ok('SET_EMCON active → contacts appear (decision changed detection)', cLit > cSilent);
ok('EMCON effect is explainable', lit.effects.some(e => e.type === 'emcon' && e.value === 'active'));

/* 3. ENGAGE (detected, in range) → attrition + magazine decrement + explainable */
let eng = WS3.applyDecision(world(), { type: 'ENGAGE', shooter: 'RED-DDG', target: 'BLU-AIR' });
let engEff = eng.effects.find(e => e.type === 'engagement');
let tgt = eng.worldState.units.find(u => u.uid === 'BLU-AIR');
let ddg = eng.worldState.units.find(u => u.uid === 'RED-DDG');
ok('ENGAGE resolves as engaged', engEff && engEff.status === 'engaged');
ok('ENGAGE reduces target strength', tgt.strength < 1 && engEff.strength_after < engEff.strength_before);
ok('ENGAGE decrements shooter magazine (8 → 6)', ddg.magazines[0].stock.sam_lr === 6);
ok('ENGAGE effect carries pk_kill + before/after (auditable)',
   engEff.pk_kill > 0 && 'strength_before' in engEff && 'strength_after' in engEff);

/* 4. ENGAGE blocked when target NOT detected (radar silent) */
let engND = WS3.applyDecision(world('silent'), { type: 'ENGAGE', shooter: 'RED-DDG', target: 'BLU-AIR' });
let ndEff = engND.effects.find(e => e.type === 'engagement');
ok('ENGAGE without detection → blocked no_detection', ndEff && ndEff.status === 'blocked' && ndEff.reason === 'no_detection');

/* 5. repeated ENGAGE can DESTROY the target (loop: new state → new decision) */
let w = world();
for (let i = 0; i < 6 && !w.units.find(u => u.uid === 'BLU-AIR' && u.status === 'DESTROYED'); i++) {
    w = WS3.applyDecision(w, { type: 'ENGAGE', shooter: 'RED-DDG', target: 'BLU-AIR' }).worldState;
}
ok('repeated ENGAGE eventually DESTROYS target', w.units.find(u => u.uid === 'BLU-AIR').status === 'DESTROYED');

/* 6. RESUPPLY raises supply (clamped) */
let rs = WS3.applyDecision(world(), { type: 'RESUPPLY', actor: 'RED-DDG', value: 0.4 });
let dr = rs.worldState.units.find(u => u.uid === 'RED-DDG');
ok('RESUPPLY bumps supply (clamped ≤1)', dr.supply != null && dr.supply <= 1 && dr.supply > 0);

/* 7. purity — input world state not mutated */
let src = world();
let snap = JSON.stringify(src);
WS3.applyDecision(src, { type: 'ENGAGE', shooter: 'RED-DDG', target: 'BLU-AIR' });
ok('input world state not mutated', JSON.stringify(src) === snap);

/* 8. decisions log appended + robustness */
ok('decision appended to ws.decisions', eng.worldState.decisions.length >= 1);
ok('empty / null input does not throw',
   (() => { try { WS3.applyDecision({}, { type: 'NOTE' }); WS3.applyDecision(null, null); return true; } catch (_) { return false; } })());

console.log(`\nPR-WS3: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
