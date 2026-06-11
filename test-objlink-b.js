/* test-objlink-b.js — OBJLINK-B static checks (no server, no UI, no mutation).
 * Verifies ws.derived.unit_objective_links: per-unit objective(INFERRED) / BLS(DECLARED)
 * / route link records, derived from wargame3.json. Run: node test-objlink-b.js */
'use strict';
const path = require('path');
const WS = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state.js'));
const w3 = require(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('OBJLINK-B — derive unit objective/BLS/route links');

const STEP = 2;                                  // PRE-H step; RED units have routes + bls "BLS-1"
const redUids  = (w3.red_units || []).map(u => u.unit_uid || u.uid);
const blueUids = (w3.blue_units_initial || []).map(u => u.unit_uid || u.uid);

/* ---- mutation guard (test 7): snapshot BEFORE derive ---- */
const beforeScenario = JSON.stringify(w3);
const beforeUnit0    = JSON.stringify(w3.red_units[0]);
const beforeStep     = JSON.stringify(w3.steps[STEP]);

const ws    = WS.deriveWorldState(w3, STEP);
const links = ws.derived && ws.derived.unit_objective_links;
const blsBaselineExpected = (w3.steps[STEP].bls_status_baseline || {})['BLS-1'];

ok('ws.derived.unit_objective_links is an object', links && typeof links === 'object' && !Array.isArray(links));

/* 1. 70 RED units produce link records with bls_id = "BLS-1" */
const redLinks = redUids.map(uid => links[uid]).filter(Boolean);
ok('70 RED units have a link record', redLinks.length === 70 && redUids.length === 70);
ok('every RED link has bls_id = "BLS-1"', redLinks.length > 0 && redLinks.every(l => l.bls_id === 'BLS-1'));
ok('every RED link side = RED', redLinks.every(l => l.side === 'RED'));

/* 2. RED bls_status matches the current step.bls_status_baseline["BLS-1"] */
ok('step ' + STEP + ' bls_status_baseline["BLS-1"] is defined (' + JSON.stringify(blsBaselineExpected) + ')',
   blsBaselineExpected != null);
ok('every RED link.bls_status === step.bls_status_baseline["BLS-1"]',
   redLinks.every(l => l.bls_status === blsBaselineExpected));
ok('RED BLS is DECLARED (bls_confidence = "declared")',
   redLinks.every(l => l.bls_confidence === 'declared'));

/* 3. Objective id/status present but marked INFERRED, not declared/assigned */
const r0 = redLinks[0];
ok('objective_id present on RED link', !!r0.objective_id);
ok('objective_id == ws.objectives[0].id (parity, not invented)', r0.objective_id === ws.objectives[0].id);
ok('objective_status field present on link', 'objective_status' in r0);
ok('objective_status == step.objective_status_baseline (parity)',
   r0.objective_status === ((ws.objectives[0] && ws.objectives[0].status != null) ? ws.objectives[0].status : null));
ok('objective link confidence = "inferred"', r0.confidence === 'inferred');
ok('confidence is NOT "declared" and NOT "assigned"', r0.confidence !== 'declared' && r0.confidence !== 'assigned');
ok('link_basis never claims assigned objective',
   redLinks.every(l => l.link_basis !== 'assigned' && l.link_basis !== 'assigned_objective'));
ok('link_basis is "scenario_single_objective" for RED (single obj + route context)',
   redLinks.every(l => l.link_basis === 'scenario_single_objective'));

/* 4. Route summary exists where course exists */
const routed = redLinks.filter(l => l.route);
ok('at least one RED link has a route summary', routed.length > 0);
ok('route summary shape = { points, from, to }', routed.every(l =>
   typeof l.route.points === 'number' && l.route.points > 0 &&
   Array.isArray(l.route.from) && l.route.from.length >= 2 &&
   Array.isArray(l.route.to)   && l.route.to.length   >= 2));
// honesty cross-check: route summary agrees with the unit's kinematics.course
const sampleUnit = ws.units.find(u => u.uid === routed[0].uid);
ok('route.points == kinematics.course length (no fabrication)',
   routed[0].route.points === sampleUnit.kinematics.course.length);

/* 5. BLUE units with no bls do not crash; null bls_id / no BLS row data */
const blueLinks = blueUids.map(uid => links[uid]).filter(Boolean);
ok('BLUE units produced link records (no crash)', blueLinks.length > 0);
ok('BLUE links have bls_id === null (no authored BLS)', blueLinks.every(l => l.bls_id === null));
ok('BLUE links have bls_status === null and bls_confidence === null',
   blueLinks.every(l => l.bls_status === null && l.bls_confidence === null));

/* 6. Non-actor / null cases are safe */
ok('computeUnitObjectiveLinks({}) returns {} without throwing',
   (() => { try { const r = WS.computeUnitObjectiveLinks({}); return r && typeof r === 'object' && Object.keys(r).length === 0; } catch (_) { return false; } })());
ok('off-map / no-course units are null-safe (route null, no throw)',
   ws.units.filter(u => u.off_map).every(u => { const l = links[u.uid]; return !l || l.route === null; }));
// no objective => no objective link
const noObjScn = { schema_variant: 'rmooz', steps: [{ phase: 'P0' }], red_units: [{ uid: 'X1', side: 'RED', coord: [10, 20] }] };
const wsNoObj = WS.deriveWorldState(noObjScn, 0);
const xLink = wsNoObj.derived.unit_objective_links['X1'];
ok('no objective => objective_id null + confidence null + link_basis null',
   xLink && xLink.objective_id === null && xLink.confidence === null && xLink.link_basis === null);
ok('unit with no uid is skipped (null-safe)',
   (() => { try { const r = WS.computeUnitObjectiveLinks({ units: [{ side: 'RED' }, null], meta: {} }); return Object.keys(r).length === 0; } catch (_) { return false; } })());

/* 7. No mutation of scenario units or steps */
ok('scenario object unchanged after derive (deep)', JSON.stringify(w3) === beforeScenario);
ok('red_units[0] unchanged (no .bls / field mutation)', JSON.stringify(w3.red_units[0]) === beforeUnit0);
ok('steps[' + STEP + '] unchanged (bls_status_baseline intact)', JSON.stringify(w3.steps[STEP]) === beforeStep);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
