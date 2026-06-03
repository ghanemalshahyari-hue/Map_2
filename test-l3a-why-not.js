/* test-l3a-why-not.js — L3-A-1: ENGAGE "Why-Not" action feasibility evaluator
 *
 * Contract: L3-A-SPECIFICATION.md. SUCCESS CONDITION: ENGAGE Why-Not findings
 * must NEVER diverge from the engagement engine's (ENG1) own reasons.
 *
 * SCOPE (locked): action.type='ENGAGE' only. No UI, no ATTACK_OBJECTIVE, no L3.5
 * alternatives, no scoring, no simulation, no mutation, no new thresholds.
 *
 * Run: node test-l3a-why-not.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const WS  = require(path.join(ROOT, 'world-state.js'));        // for shared _nmBetween
const ENG = require(path.join(ROOT, 'engagement.js'));          // the engine = source of truth
const AF  = require(path.join(ROOT, 'action-feasibility.js'));  // unit under test

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
function codes(list) { return (list || []).map(b => b.code).sort(); }
function uniq(a) { return Array.from(new Set(a)).sort(); }

/* ---- builders -------------------------------------------------------------
 * Weapon: { id, class, mount, wra? }. Magazine: { mount, stock:{ <class>: n } }.
 * FC channel: a sensor with class 'fire_control'. long_range_sam is NON-autonomous. */
function shooter(opts) {
    opts = opts || {};
    return {
        uid: 'U1', side: 'BLUE', domain: 'ground', position: [19.0, 30.0],
        weapons: opts.weapons || [{ id: 'sam', class: 'long_range_sam', mount: 'm1' }],
        magazines: opts.magazines || [{ mount: 'm1', stock: { long_range_sam: 4 } }],
        sensors: opts.sensors || [{ id: 'fc', class: 'fire_control', channels: 1 }]
    };
}
function target(latOffset, domain) {
    return { uid: 'T1', side: 'RED', domain: domain || 'air', position: [19.0, 30.0 + (latOffset || 0.1)] };
}
function makeWs(sh, tg, contacts) {
    return { degraded: false, units: [sh, tg], derived: { contacts: contacts || [] } };
}
const DETECTED = [{ detected_by_side: 'BLUE', target_uid: 'T1' }];
const ENGAGE = { type: 'ENGAGE', actor_uid: 'U1', target_uid: 'T1' };

// Ground truth straight from the engine, for the never-diverge cross-check.
function engineTruth(ws) {
    const recs = ENG.computeEngagements(ws, ws.derived.contacts) || [];
    const pair = recs.filter(r => r.shooter === 'U1' && r.target === 'T1');
    return {
        engaged: pair.some(r => r.status === 'engaged'),
        reasons: uniq(pair.filter(r => r.status === 'blocked' && r.reason).map(r => r.reason)),
        count: pair.length
    };
}
// blockers that claim to be ENG1 reasons (source 'engagement', excluding the no-record label)
function engineClaimedCodes(finding) {
    return uniq(finding.blockers
        .filter(b => b.source === 'engagement' && b.code !== 'no_engagement_solution')
        .map(b => b.code));
}

console.log('L3-A-1 — ENGAGE Why-Not evaluator');
console.log('');

/* ========== 1. THE FIVE ENG1 OUTCOMES (engaged + 4 blocked reasons) ========== */
console.log('ENG1 OUTCOMES (1:1 with the engine)');

// engaged (in range, detected, ammo, channel)
(function () {
    const ws = makeWs(shooter(), target(0.1), DETECTED);
    const f = AF.evaluateAction(ws, ENGAGE);
    const truth = engineTruth(ws);
    ok('engaged → verdict feasible', f.verdict === 'feasible');
    ok('engaged → no blockers', f.blockers.length === 0);
    ok('engaged → engine agrees (engaged record exists)', truth.engaged === true);
})();

// out_of_range (target far)
(function () {
    const ws = makeWs(shooter(), target(2.0), DETECTED);  // ~120 nm > 80 nm
    const f = AF.evaluateAction(ws, ENGAGE);
    ok('out_of_range → blocked', f.verdict === 'blocked');
    ok('out_of_range → blocker code', codes(f.blockers).indexOf('out_of_range') >= 0);
    ok('out_of_range → matches engine', JSON.stringify(engineClaimedCodes(f)) === JSON.stringify(engineTruth(ws).reasons));
})();

// weapons_hold
(function () {
    const sh = shooter({ weapons: [{ id: 'sam', class: 'long_range_sam', mount: 'm1', wra: { hold: true } }] });
    const ws = makeWs(sh, target(0.1), DETECTED);
    const f = AF.evaluateAction(ws, ENGAGE);
    ok('weapons_hold → blocked', f.verdict === 'blocked');
    ok('weapons_hold → blocker code', codes(f.blockers).indexOf('weapons_hold') >= 0);
    ok('weapons_hold → matches engine', JSON.stringify(engineClaimedCodes(f)) === JSON.stringify(engineTruth(ws).reasons));
})();

// winchester (empty magazine)
(function () {
    const sh = shooter({ magazines: [{ mount: 'm1', stock: { long_range_sam: 0 } }] });
    const ws = makeWs(sh, target(0.1), DETECTED);
    const f = AF.evaluateAction(ws, ENGAGE);
    ok('winchester → blocked', f.verdict === 'blocked');
    ok('winchester → blocker code', codes(f.blockers).indexOf('winchester') >= 0);
    ok('winchester → matches engine', JSON.stringify(engineClaimedCodes(f)) === JSON.stringify(engineTruth(ws).reasons));
})();

// no_fire_control_channel (non-autonomous weapon, no FC sensor)
(function () {
    const sh = shooter({ sensors: [] });
    const ws = makeWs(sh, target(0.1), DETECTED);
    const f = AF.evaluateAction(ws, ENGAGE);
    ok('no_fire_control_channel → blocked', f.verdict === 'blocked');
    ok('no_fire_control_channel → blocker code', codes(f.blockers).indexOf('no_fire_control_channel') >= 0);
    ok('no_fire_control_channel → matches engine', JSON.stringify(engineClaimedCodes(f)) === JSON.stringify(engineTruth(ws).reasons));
})();

/* ========== 2. NO-RECORD CASES (detection gate / no solution) ========== */
console.log('');
console.log('NO-RECORD CASES');

// undetected (no contact for the target → engine emits no record)
(function () {
    const ws = makeWs(shooter(), target(0.1), []);  // not detected
    const f = AF.evaluateAction(ws, ENGAGE);
    const truth = engineTruth(ws);
    ok('undetected → blocked', f.verdict === 'blocked');
    ok('undetected → blocker code', codes(f.blockers).indexOf('undetected') >= 0);
    ok('undetected → source is detection', f.blockers[0].source === 'detection');
    ok('undetected → engine emitted no record (faithful)', truth.count === 0);
})();

// no_engagement_solution (detected, but weapon domain ≠ target domain → no record)
(function () {
    const sh = shooter({ weapons: [{ id: 'asm', class: 'anti_ship', mount: 'm1' }],
                          magazines: [{ mount: 'm1', stock: { anti_ship: 4 } }] });   // vs:['sea']
    const ws = makeWs(sh, target(0.1, 'air'), DETECTED);                               // target is air
    const f = AF.evaluateAction(ws, ENGAGE);
    ok('no_engagement_solution → blocked', f.verdict === 'blocked');
    ok('no_engagement_solution → blocker code', codes(f.blockers).indexOf('no_engagement_solution') >= 0);
    ok('no_engagement_solution → engine emitted no record', engineTruth(ws).count === 0);
})();

/* ========== 3. MULTI-WEAPON (feasible wins; multi-reason dedup) ========== */
console.log('');
console.log('MULTI-WEAPON');

// one weapon engaged + one winchester → action FEASIBLE, no blockers (don't list winchester)
(function () {
    const sh = shooter({
        weapons:   [{ id: 'a', class: 'long_range_sam', mount: 'm1' },
                    { id: 'b', class: 'long_range_sam', mount: 'm2' }],
        magazines: [{ mount: 'm1', stock: { long_range_sam: 4 } },
                    { mount: 'm2', stock: { long_range_sam: 0 } }],
        sensors:   [{ id: 'fc', class: 'fire_control', channels: 2 }]
    });
    const ws = makeWs(sh, target(0.1), DETECTED);
    const f = AF.evaluateAction(ws, ENGAGE);
    ok('feasible wins over a winchester weapon', f.verdict === 'feasible');
    ok('feasible → no blockers listed', f.blockers.length === 0);
    ok('engine agrees an engaged record exists', engineTruth(ws).engaged === true);
})();

// all blocked, two distinct reasons → both surfaced, deduped, == engine reasons
(function () {
    const sh = shooter({
        weapons:   [{ id: 'a', class: 'medium_sam',     mount: 'm1' },   // 30 nm
                    { id: 'b', class: 'long_range_sam', mount: 'm2' }],  // 80 nm, empty
        magazines: [{ mount: 'm1', stock: { medium_sam: 4 } },
                    { mount: 'm2', stock: { long_range_sam: 0 } }],
        sensors:   [{ id: 'fc', class: 'fire_control', channels: 2 }]
    });
    const ws = makeWs(sh, target(0.8), DETECTED);  // ~48 nm: >30 (A out_of_range), <80 (B in range but empty)
    const f = AF.evaluateAction(ws, ENGAGE);
    const truth = engineTruth(ws);
    ok('multi-reason → blocked', f.verdict === 'blocked');
    ok('multi-reason → distinct codes == engine reasons (NEVER DIVERGE)',
       JSON.stringify(engineClaimedCodes(f)) === JSON.stringify(truth.reasons));
    ok('multi-reason → engine had ≥2 reasons', truth.reasons.length >= 2);
    ok('multi-reason → deduped (no repeats)', codes(f.blockers).length === uniq(codes(f.blockers)).length);
})();

/* ========== 4. SCHEMA / FALLBACKS / PARITY ========== */
console.log('');
console.log('SCHEMA / FALLBACKS / PARITY');

// unknown_unit
(function () {
    const ws = makeWs(shooter(), target(0.1), DETECTED);
    const f = AF.evaluateAction(ws, { type: 'ENGAGE', actor_uid: 'U1', target_uid: 'NOPE' });
    ok('unknown_unit → blocked', f.verdict === 'blocked');
    ok('unknown_unit → code', codes(f.blockers).indexOf('unknown_unit') >= 0);
    ok('unknown_unit → source world_state', f.blockers[0].source === 'world_state');
})();

// finding shape: exactly the 5 keys; inverse NEVER present (L3.5 hook stays empty)
(function () {
    const ws = makeWs(shooter(), target(2.0), DETECTED);
    const f = AF.evaluateAction(ws, ENGAGE);
    ok('shape: exact keys', JSON.stringify(Object.keys(f).sort()) ===
       JSON.stringify(['action', 'blockers', 'evidence_gaps', 'risks', 'verdict']));
    ok('shape: no inverse/alternatives populated (L3.5 reserved)',
       f.blockers.every(b => !('inverse' in b) && !('alternatives' in b)));
    ok('shape: risks empty for ENGAGE slice', Array.isArray(f.risks) && f.risks.length === 0);
    ok('shape: action echoed', f.action.type === 'ENGAGE' && f.action.actor_uid === 'U1');
})();

// verdict rule: blocked iff blockers
(function () {
    const wsF = makeWs(shooter(), target(0.1), DETECTED);
    const wsB = makeWs(shooter(), target(2.0), DETECTED);
    ok('verdict rule: feasible ⇒ 0 blockers', AF.evaluateAction(wsF, ENGAGE).blockers.length === 0);
    ok('verdict rule: blocked ⇒ ≥1 blocker', AF.evaluateAction(wsB, ENGAGE).blockers.length >= 1);
})();

// unsupported type and degraded → null (slice scope + parity gate)
(function () {
    ok('unsupported action type → null', AF.evaluateAction(makeWs(shooter(), target(0.1), DETECTED), { type: 'MOVE' }) === null);
    ok('degraded ws → null', AF.evaluateAction({ degraded: true, units: [], derived: {} }, ENGAGE) === null);
    ok('missing ws → null', AF.evaluateAction(null, ENGAGE) === null);
})();

// purity: evaluateAction must not mutate ws
(function () {
    const ws = makeWs(shooter(), target(0.1), DETECTED);
    const before = JSON.stringify(ws);
    AF.evaluateAction(ws, ENGAGE);
    AF.evaluateAction(ws, ENGAGE);
    ok('purity: ws unchanged after evaluation', JSON.stringify(ws) === before);
})();

/* ========== 5. L3-A-2: ATTACK_OBJECTIVE (consumes existing state) ========== */
console.log('');
console.log('ATTACK_OBJECTIVE (L3-A-2)');

// Build a ws whose derived state mirrors the real ledger (OBJ-A/B + READINESS-A + DOCTRINE-A).
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
    if (!o.noLedger && !ev.length) push('force_ratio', 1.5);  // ensure a non-empty ledger
    return {
        degraded: false,
        units: o.units || [],
        objectives: o.objectives !== undefined ? o.objectives : [{ id: 'OBJ', name: 'Obj', position: [19, 30] }],
        derived: {
            objective_status_display: o.status || 'DORMANT',
            objective_evidence: o.noLedger ? [] : ev,
            contacts: o.wsContacts || []
        }
    };
}
const ATTACK = (extra) => Object.assign({ type: 'attack_objective', objectiveId: 'OBJ' }, extra || {});

// --- blockers (clear existing-state gaps) ---
(function () {
    const f = AF.evaluateAction(objWs({ status: 'CAPTURED' }), ATTACK());
    ok('captured → blocked', f.verdict === 'blocked');
    ok('captured → objective_already_captured', codes(f.blockers).indexOf('objective_already_captured') >= 0);
})();
(function () {
    const f = AF.evaluateAction(objWs({}), ATTACK({ objectiveId: 'NOPE' }));
    ok('unknown objective → unknown_objective', codes(f.blockers).indexOf('unknown_objective') >= 0);
    ok('unknown objective → blocked', f.verdict === 'blocked');
})();
(function () {
    const f = AF.evaluateAction(objWs({ units: [] }), ATTACK({ actorUid: 'GHOST' }));
    ok('unknown actor → unknown_unit', codes(f.blockers).indexOf('unknown_unit') >= 0);
})();
(function () {
    const f = AF.evaluateAction(objWs({ noLedger: true }), ATTACK());
    ok('no ledger → objective_evidence_missing', codes(f.blockers).indexOf('objective_evidence_missing') >= 0);
})();
(function () {
    const f = AF.evaluateAction(objWs({ objectives: [{ id: 'OBJ', name: 'Obj' }] }), ATTACK());  // no position
    ok('objective without position → objective_not_actionable', codes(f.blockers).indexOf('objective_not_actionable') >= 0);
})();
(function () {
    const ws = objWs({ units: [{ uid: 'B1', side: 'BLUE', readiness: 'not_ready' }] });
    const f = AF.evaluateAction(ws, ATTACK({ actorUid: 'B1' }));
    ok('actor not_ready → readiness_unavailable (blocker)', codes(f.blockers).indexOf('readiness_unavailable') >= 0);
})();

// --- risks (reuse existing categoricals; NEVER DIVERGE from status_display) ---
(function () {
    const f = AF.evaluateAction(objWs({ status: 'CONTESTED' }), ATTACK());
    ok('CONTESTED status → objective_contested risk', codes(f.risks).indexOf('objective_contested') >= 0);
    ok('CONTESTED → feasible_with_risk (no blockers)', f.verdict === 'feasible_with_risk');
})();
(function () {
    const f = AF.evaluateAction(objWs({ status: 'THREATENED' }), ATTACK());
    ok('THREATENED status → objective_threatened risk', codes(f.risks).indexOf('objective_threatened') >= 0);
})();
(function () {
    // never-diverge: contested/threatened risk presence must track objective_status_display
    ['DORMANT', 'THREATENED', 'CONTESTED', 'DENIED', 'CAPTURED'].forEach(function (st) {
        const f = AF.evaluateAction(objWs({ status: st }), ATTACK());
        const hasContested = codes(f.risks).indexOf('objective_contested') >= 0;
        const hasThreatened = codes(f.risks).indexOf('objective_threatened') >= 0;
        ok('status ' + st + ': contested-risk iff CONTESTED/DENIED', hasContested === (st === 'CONTESTED' || st === 'DENIED'));
        ok('status ' + st + ': threatened-risk iff THREATENED', hasThreatened === (st === 'THREATENED'));
    });
})();
(function () {
    const f = AF.evaluateAction(objWs({ readiness: 'limited' }), ATTACK());
    ok('readiness limited → readiness_degraded risk', codes(f.risks).indexOf('readiness_degraded') >= 0);
})();
(function () {
    const lo = AF.evaluateAction(objWs({ supply: 0.3 }), ATTACK());
    const hi = AF.evaluateAction(objWs({ supply: 0.9 }), ATTACK());
    ok('supply 0.3 (< neutral 0.5) → supply_limited risk', codes(lo.risks).indexOf('supply_limited') >= 0);
    ok('supply 0.9 → no supply_limited risk', codes(hi.risks).indexOf('supply_limited') < 0);
})();
(function () {
    const unresolved = AF.evaluateAction(objWs({ contacts: { total: 3, firm: 1, probable: 1, possible: 1 } }), ATTACK());
    const resolved   = AF.evaluateAction(objWs({ contacts: { total: 2, firm: 2, probable: 0, possible: 0 } }), ATTACK());
    ok('non-firm contacts → contact_unresolved risk', codes(unresolved.risks).indexOf('contact_unresolved') >= 0);
    ok('all-firm contacts → no contact_unresolved', codes(resolved.risks).indexOf('contact_unresolved') < 0);
})();
(function () {
    const f = AF.evaluateAction(objWs({ wcs: { air: 'HOLD', surface: 'FREE', subsurface: 'HOLD' } }), ATTACK());
    ok('WCS air HOLD → doctrine_caution risk', codes(f.risks).indexOf('doctrine_caution') >= 0);
    const def = AF.evaluateAction(objWs({ wcs: { air: 'FREE', surface: 'FREE', subsurface: 'HOLD' } }), ATTACK());
    ok('default subsurface HOLD alone → NO doctrine_caution (not a false alarm)', codes(def.risks).indexOf('doctrine_caution') < 0);
})();

// engagement_pressure: must track ENG1's own output (never diverge)
(function () {
    // RED shooter with a firing solution on a BLUE unit → ENG1 emits an engaged RED record
    const redShooter = { uid: 'E1', side: 'RED', domain: 'ground', position: [19.0, 30.0],
        weapons: [{ id: 'sam', class: 'long_range_sam', mount: 'm1' }],
        magazines: [{ mount: 'm1', stock: { long_range_sam: 4 } }],
        sensors: [{ id: 'fc', class: 'fire_control', channels: 1 }] };
    const blueTgt = { uid: 'B9', side: 'BLUE', domain: 'air', position: [19.0, 30.1] };
    const blueActor = { uid: 'B1', side: 'BLUE', domain: 'ground', position: [19.0, 30.0], readiness: 'ready' };
    const ws = objWs({ units: [redShooter, blueTgt, blueActor],
                       wsContacts: [{ detected_by_side: 'RED', target_uid: 'B9' }] });
    const f = AF.evaluateAction(ws, ATTACK({ actorUid: 'B1' }));
    const engRecs = ENG.computeEngagements(ws, ws.derived.contacts) || [];
    const enemyEngaged = engRecs.some(r => r.status === 'engaged' && r.side !== 'BLUE');
    ok('engagement_pressure tracks ENG1 (enemy has a solution)', enemyEngaged === true);
    ok('engagement_pressure risk present when ENG1 says so', codes(f.risks).indexOf('engagement_pressure') >= 0);
})();

// clean feasible: DORMANT, ready, strong supply, firm contacts, FREE doctrine → no blockers, no risks
(function () {
    const ws = objWs({ status: 'DORMANT', readiness: 'ready', supply: 0.9,
                       contacts: { total: 2, firm: 2, probable: 0, possible: 0 },
                       wcs: { air: 'FREE', surface: 'FREE', subsurface: 'HOLD' },
                       units: [{ uid: 'B1', side: 'BLUE', readiness: 'ready', supply: 0.9 }] });
    const f = AF.evaluateAction(ws, ATTACK({ actorUid: 'B1' }));
    ok('clean state → feasible', f.verdict === 'feasible');
    ok('clean state → no blockers', f.blockers.length === 0);
    ok('clean state → no risks', f.risks.length === 0);
})();

// schema + purity for ATTACK_OBJECTIVE
(function () {
    const ws = objWs({ status: 'CONTESTED' });
    const before = JSON.stringify(ws);
    const f = AF.evaluateAction(ws, ATTACK());
    ok('AO shape: exact keys', JSON.stringify(Object.keys(f).sort()) ===
       JSON.stringify(['action', 'blockers', 'evidence_gaps', 'risks', 'verdict']));
    ok('AO: no inverse populated (L3.5 reserved)', f.risks.concat(f.blockers).every(x => !('inverse' in x)));
    ok('AO: verdict rule (risk, no blocker → feasible_with_risk)', f.verdict === 'feasible_with_risk');
    ok('AO purity: ws unchanged', JSON.stringify(ws) === before);
    ok('AO: action echoed', f.action.type === 'ATTACK_OBJECTIVE' && f.action.objective_id === 'OBJ');
})();

console.log('');
console.log('L3-A (ENGAGE + ATTACK_OBJECTIVE): ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
