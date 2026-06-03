/* test-l35a-alternatives.js — L3.5-A: Feasible Alternatives generator
 *
 * generateFeasibleAlternatives(ws, action, finding) inverts the L3-A finding into
 * read-only feasible-alternative OPTIONS. SCOPE (locked): ATTACK_OBJECTIVE only;
 * no simulation, no ranking/scoring, not 'recommendations', no mutation, no UI.
 * Each alternative is derived from codes the finding already produced (never
 * invented): basedOn ⊆ finding codes.
 *
 * Run: node test-l35a-alternatives.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(ROOT, 'world-state.js'));
require(path.join(ROOT, 'engagement.js'));
const AF = require(path.join(ROOT, 'action-feasibility.js'));

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
function ids(r) { return (r.alternatives || []).map(a => a.id).sort(); }
function byId(r, id) { return (r.alternatives || []).find(a => a.id === id); }

// Reuse the L3-A-2 synthetic-ledger builder so the finding is real (not faked).
function objWs(o) {
    o = o || {};
    const ev = [];
    const push = (t, v) => ev.push({ objective_id: 'OBJ', evidence_type: t, value: v, source: 'x', confidence: 1, step_index: 0 });
    if (o.bls_contested != null) push('bls_contested_count', o.bls_contested);
    if (o.readiness != null)     push('combat_readiness_state', o.readiness);
    if (o.supply != null)        push('supply_sustainability', o.supply);
    if (o.contacts !== undefined) push('contact_confidence_summary', o.contacts);
    if (o.wcs != null)           push('side_weapons_control_status', o.wcs);
    if (o.posture != null)       push('unit_posture_state', o.posture);
    if (!o.noLedger && !ev.length) push('force_ratio', 1.5);
    return {
        degraded: false,
        units: o.units || [],
        objectives: o.objectives !== undefined ? o.objectives : [{ id: 'OBJ', name: 'Obj', position: [19, 30] }],
        derived: { objective_status_display: o.status || 'DORMANT', objective_evidence: o.noLedger ? [] : ev, contacts: o.wsContacts || [] }
    };
}
const ATTACK = (extra) => Object.assign({ type: 'attack_objective', objectiveId: 'OBJ' }, extra || {});
const ALT_KEYS = ['id', 'label', 'reason', 'basedOn', 'requiredCapabilities', 'limits', 'readOnly'].sort();

console.log('L3.5-A — Feasible Alternatives generator');
console.log('');

/* ========== 1. EMPTY when nothing to address ========== */
console.log('EMPTY CASES');
(function () {
    // feasible (DORMANT, ready, good supply, firm contacts, FREE doctrine) → no alternatives
    const ws = objWs({ status: 'DORMANT', readiness: 'ready', supply: 0.9,
                       contacts: { total: 2, firm: 2, probable: 0, possible: 0 },
                       wcs: { air: 'FREE', surface: 'FREE', subsurface: 'HOLD' } });
    const r = AF.generateFeasibleAlternatives(ws, ATTACK());
    ok('feasible state → empty alternatives', r.alternatives.length === 0);
})();
(function () {
    // isolate the structural blocker: clean state otherwise, so only objective_already_captured fires
    const r = AF.generateFeasibleAlternatives(objWs({ status: 'CAPTURED', readiness: 'ready', supply: 0.9,
        contacts: { total: 2, firm: 2, probable: 0, possible: 0 }, wcs: { air: 'FREE', surface: 'FREE', subsurface: 'HOLD' } }), ATTACK());
    ok('already_captured (data/structural) → empty (no tactical inverse)', r.alternatives.length === 0);
})();
(function () {
    const r = AF.generateFeasibleAlternatives(objWs({}), ATTACK({ objectiveId: 'NOPE' }));
    ok('unknown_objective → empty', r.alternatives.length === 0);
})();
(function () {
    const r = AF.generateFeasibleAlternatives(objWs({ noLedger: true }), ATTACK());
    ok('evidence_missing → empty', r.alternatives.length === 0);
})();

/* ========== 2. RISK → ALTERNATIVE inversions ========== */
console.log('');
console.log('INVERSIONS');
(function () {
    const r = AF.generateFeasibleAlternatives(objWs({ supply: 0.3 }), ATTACK());
    ok('supply_limited → resupply', ids(r).indexOf('resupply') >= 0);
    ok('resupply basedOn supply_limited', byId(r, 'resupply').basedOn.indexOf('supply_limited') >= 0);
})();
(function () {
    const r = AF.generateFeasibleAlternatives(objWs({ readiness: 'limited' }), ATTACK());
    ok('readiness_degraded → restore_readiness', ids(r).indexOf('restore_readiness') >= 0);
})();
(function () {
    const ws = objWs({ units: [{ uid: 'B1', side: 'BLUE', readiness: 'not_ready' }] });
    const r = AF.generateFeasibleAlternatives(ws, ATTACK({ actorUid: 'B1' }));
    ok('readiness_unavailable (blocker) → restore_readiness', ids(r).indexOf('restore_readiness') >= 0);
})();
(function () {
    const r = AF.generateFeasibleAlternatives(objWs({ contacts: { total: 3, firm: 1, probable: 1, possible: 1 } }), ATTACK());
    ok('contact_unresolved → resolve_contacts', ids(r).indexOf('resolve_contacts') >= 0);
})();
(function () {
    const r = AF.generateFeasibleAlternatives(objWs({ wcs: { air: 'HOLD', surface: 'FREE', subsurface: 'HOLD' } }), ATTACK());
    ok('doctrine_caution → review_doctrine', ids(r).indexOf('review_doctrine') >= 0);
})();
(function () {
    // engagement_pressure: RED has a firing solution on a BLUE unit
    const redShooter = { uid: 'E1', side: 'RED', domain: 'ground', position: [19.0, 30.0],
        weapons: [{ id: 'sam', class: 'long_range_sam', mount: 'm1' }],
        magazines: [{ mount: 'm1', stock: { long_range_sam: 4 } }],
        sensors: [{ id: 'fc', class: 'fire_control', channels: 1 }] };
    const blueTgt = { uid: 'B9', side: 'BLUE', domain: 'air', position: [19.0, 30.1] };
    const ws = objWs({ units: [redShooter, blueTgt], wsContacts: [{ detected_by_side: 'RED', target_uid: 'B9' }] });
    const r = AF.generateFeasibleAlternatives(ws, ATTACK());
    ok('engagement_pressure → reduce_engagement_pressure', ids(r).indexOf('reduce_engagement_pressure') >= 0);
})();
(function () {
    // objective_contested + objective_threatened both → ONE improve_objective_state (deduped), basedOn both
    const r = AF.generateFeasibleAlternatives(objWs({ status: 'THREATENED', bls_contested: 2 }), ATTACK());
    const a = byId(r, 'improve_objective_state');
    ok('contested+threatened → improve_objective_state present', !!a);
    ok('improve_objective_state deduped (single entry)', ids(r).filter(x => x === 'improve_objective_state').length === 1);
    ok('improve_objective_state basedOn both codes',
       a.basedOn.indexOf('objective_contested') >= 0 && a.basedOn.indexOf('objective_threatened') >= 0);
})();

/* ========== 3. SHAPE / CONTRACT ========== */
console.log('');
console.log('SHAPE / CONTRACT');
(function () {
    const r = AF.generateFeasibleAlternatives(objWs({ supply: 0.3, readiness: 'limited' }), ATTACK());
    ok('return has alternatives[]', Array.isArray(r.alternatives));
    const a = r.alternatives[0];
    ok('alternative has exact keys', JSON.stringify(Object.keys(a).sort()) === JSON.stringify(ALT_KEYS));
    ok('every alternative readOnly:true', r.alternatives.every(x => x.readOnly === true));
    ok('basedOn is a non-empty array', r.alternatives.every(x => Array.isArray(x.basedOn) && x.basedOn.length > 0));
    ok('requiredCapabilities is an array', r.alternatives.every(x => Array.isArray(x.requiredCapabilities)));
    ok('limits is a non-empty array', r.alternatives.every(x => Array.isArray(x.limits) && x.limits.length > 0));
    ok('NO score/rank/priority field (not a ranking)',
       r.alternatives.every(x => !('score' in x) && !('rank' in x) && !('priority' in x)));
    ok('label is not recommendation wording (no "should"/"recommend")',
       r.alternatives.every(x => !/should|recommend/i.test(x.label + ' ' + x.reason)));
})();
(function () {
    // basedOn ⊆ finding codes (never invents a basis not in the finding)
    const ws = objWs({ status: 'CONTESTED', supply: 0.3 });
    const f = AF.evaluateAction(ws, ATTACK());
    const findingCodes = [].concat(f.blockers, f.risks, f.evidence_gaps).map(x => x.code);
    const r = AF.generateFeasibleAlternatives(ws, ATTACK(), f);
    const allBasedOn = r.alternatives.reduce((acc, a) => acc.concat(a.basedOn), []);
    ok('basedOn ⊆ finding codes (never diverges from L3-A)', allBasedOn.every(c => findingCodes.indexOf(c) >= 0));
})();

/* ========== 4. SCOPE / PARITY / PURITY ========== */
console.log('');
console.log('SCOPE / PARITY / PURITY');
(function () {
    ok('ENGAGE action → empty (L3.5-A is ATTACK_OBJECTIVE only)',
       AF.generateFeasibleAlternatives(objWs({}), { type: 'ENGAGE', actor_uid: 'U1', target_uid: 'T1' }).alternatives.length === 0);
    ok('degraded ws → empty', AF.generateFeasibleAlternatives({ degraded: true }, ATTACK()).alternatives.length === 0);
    ok('missing ws → empty', AF.generateFeasibleAlternatives(null, ATTACK()).alternatives.length === 0);
})();
(function () {
    // consumes a passed finding identically to computing it internally
    const ws = objWs({ status: 'THREATENED', supply: 0.3 });
    const f = AF.evaluateAction(ws, ATTACK());
    const withFinding = AF.generateFeasibleAlternatives(ws, ATTACK(), f);
    const without    = AF.generateFeasibleAlternatives(ws, ATTACK());
    ok('same result whether finding is passed or computed', JSON.stringify(withFinding) === JSON.stringify(without));
})();
(function () {
    const ws = objWs({ status: 'CONTESTED', supply: 0.3, readiness: 'limited' });
    const before = JSON.stringify(ws);
    AF.generateFeasibleAlternatives(ws, ATTACK());
    AF.generateFeasibleAlternatives(ws, ATTACK());
    ok('purity: ws unchanged', JSON.stringify(ws) === before);
})();
(function () {
    // determinism + stable (non-ranked) order
    const ws = objWs({ status: 'THREATENED', supply: 0.3, readiness: 'limited', contacts: { total: 1, firm: 0, probable: 1, possible: 0 } });
    const a = JSON.stringify(AF.generateFeasibleAlternatives(ws, ATTACK()));
    const b = JSON.stringify(AF.generateFeasibleAlternatives(ws, ATTACK()));
    ok('deterministic (same ws → same output)', a === b);
})();

console.log('');
console.log('L3.5-A: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
