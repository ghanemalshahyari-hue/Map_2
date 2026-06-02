/* test-ws1-world-state.js — PR-WS1 static checks (no server).
 * Validates the World State projection + component shape + kinematics + pure
 * transition, and that W3 parity holds. Run: node test-ws1-world-state.js */
'use strict';
const path = require('path');
const WS = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state.js'));
const w3 = require(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('PR-WS1 — World State Engine (projection + component model)');

/* 1. W3-rich projection */
const ws = WS.deriveWorldState(w3, 2);
ok('returns an object with ws_version', ws && ws.ws_version === WS.WS_VERSION);
ok('not degraded for w3-rich', ws.degraded === false);
ok('meta carries phase/time/elapsed', !!ws.meta.phase && !!ws.meta.time_label && ws.meta.elapsed_hours !== undefined);
ok('meta.step_index clamped to 2', ws.meta.step_index === 2);
ok('region.bbox present', Array.isArray(ws.region.bbox) && ws.region.bbox.length === 4);
ok('at least one objective projected', ws.objectives.length >= 1);
ok('objective carries status + position', !!ws.objectives[0].position && 'status' in ws.objectives[0]);
ok('units projected (red+blue+offmap)', ws.units.length >= w3.red_units.length + w3.blue_units_initial.length);

/* 2. W3 PARITY — projection must agree with scenario baseline (no fabrication) */
ok('objective status == steps[2].objective_status_baseline',
   ws.derived.objective_status === w3.steps[2].objective_status_baseline);
ok('phase_line_km == steps[2].phase_line_km_baseline',
   ws.lines.phase_line_km === (typeof w3.steps[2].phase_line_km_baseline === 'number' ? w3.steps[2].phase_line_km_baseline : null));
ok('meta.phase == steps[2].phase', ws.meta.phase === w3.steps[2].phase);

/* 3. Component shape present on every unit (empty for W3) */
const u0 = ws.units.find(u => !u.off_map);
ok('unit has component slots sensors/weapons/magazines',
   Array.isArray(u0.sensors) && Array.isArray(u0.weapons) && Array.isArray(u0.magazines));
ok('W3 unit components are empty (no DB-Lite yet)',
   u0.sensors.length === 0 && u0.weapons.length === 0 && u0.magazines.length === 0);
ok('unit carries domain/role/echelon from scenario',
   'domain' in u0 && 'role' in u0 && 'echelon' in u0);

/* 4. Kinematics present (for PR-MOVE1) */
ok('unit has kinematics {prev,course,heading,speed_kn}',
   u0.kinematics && 'prev' in u0.kinematics && Array.isArray(u0.kinematics.course)
   && 'heading' in u0.kinematics && 'speed_kn' in u0.kinematics);
const moved = ws.units.find(u => u.kinematics && u.kinematics.speed_kn != null);
ok('at least one unit has a derived speed (moving)', !!moved);

/* 5. contacts seam + activity echo */
ok('contacts[] seam exists (empty until PR-DET1)', Array.isArray(ws.contacts));
ok('activity echoes actors/affected/engagement_arcs',
   ws.activity && Array.isArray(ws.activity.actors) && Array.isArray(ws.activity.engagement_arcs));

/* 6. Degraded (non-W3) projection */
const mini = { scenario_id: 'mini', name: 'Mini', map_bbox: [0,0,1,1],
    obj: { name: 'OBJ-1', coord: [0.5,0.5] },
    red_units: [{ uid: 'R1', role: 'inf', domain: 'ground', coord: [0.2,0.2] }],
    blue_units_initial: [{ unit_uid: 'B1', base_id: 'B1', coord: [0.8,0.8] }],
    steps: [{ index: 0, time_label: 'H+0', elapsed_hours: 0, phase: 'PHASE 1' }] };
const wsm = WS.deriveWorldState(mini, 0);
ok('degraded flag true for non-w3', wsm.degraded === true);
ok('degraded still projects units + objective + phase',
   wsm.units.length === 2 && wsm.objectives.length === 1 && wsm.meta.phase === 'PHASE 1');

/* 7. applyDecision is PURE + transitions work */
const before = JSON.stringify(ws);
const next = WS.applyDecision(ws, { type: 'UNIT_MOVE', target_uid: u0.uid, value: [u0.position[0]+0.1, u0.position[1]] });
ok('input state NOT mutated (pure)', JSON.stringify(ws) === before);
ok('decision recorded on next state', next.decisions.length === ws.decisions.length + 1);
const movedU = next.units.find(u => u.uid === u0.uid);
ok('UNIT_MOVE updated position', movedU.position[0] === u0.position[0] + 0.1);
const nx2 = WS.applyDecision(ws, { type: 'SUPPLY_DELTA', target_uid: u0.uid, value: -0.3 });
ok('SUPPLY_DELTA clamps into [0,1]', (() => { const v = nx2.units.find(u=>u.uid===u0.uid).supply; return v >= 0 && v <= 1; })());

/* 8. robustness */
ok('empty input does not throw', (() => { try { WS.deriveWorldState({}, 0); WS.deriveWorldState(null, 5); return true; } catch (_) { return false; } })());

console.log(`\nPR-WS1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
