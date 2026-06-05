/* test-doctrine-evidence.js — DOCTRINE-A: Doctrine Evidence Collection
 *
 * Verifies the doctrine evidence contributor (computeDoctrineEvidence) per the
 * contract in DOCTRINE-A-SPECIFICATION.md.
 *
 * SCOPE (locked) — SOURCE layer only:
 *   • 9 doctrine evidence types appended to objective_evidence ledger
 *   • Use existing fields only (doctrine_tags, echelon, posture, role) + ws.doctrine
 *   • No ROE/WRA/targeting/engagement behavior, no scoring, no consumption
 *   • No change to objective_status_display or engagement outcomes
 *   • Evidence storage + display only
 *
 * Test Plan (~96 assertions):
 *   Core (9 types) — both DEFAULT (W3, no doctrine) and AUTHORED branches
 *   Integration — shape, no weights, parity gate, no mutation, determinism
 *   Regression — steps 0..N, degraded scenario, empty force
 *
 * Run: node test-doctrine-evidence.js
 */
'use strict';
const path = require('path');
const ROOT = __dirname;
const DB1  = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state-db.js'));
const DET  = require(path.join(ROOT, 'UI_MOdified/client/shell/detection.js'));
const WS   = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
const w3   = require(path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name); }
}

const DOCTRINE_TYPES = [
    'unit_doctrine_tags', 'unit_echelon_level', 'unit_posture_state',
    'side_weapons_control_status', 'side_emcon_status', 'side_engage_ambiguous',
    'unit_doctrine_inheritance_scope', 'objective_doctrine_priority',
    'doctrine_compliance_summary'
];

function enrichedWorldState(scenario, stepIndex) {
    return DB1.enrichWorldState(WS.deriveWorldState(scenario, stepIndex));
}
function findRec(evidence, type) {
    if (!Array.isArray(evidence)) return null;
    for (let i = 0; i < evidence.length; i++) if (evidence[i].evidence_type === type) return evidence[i];
    return null;
}
function inRange01(x) { return typeof x === 'number' && x >= 0 && x <= 1; }

console.log('DOCTRINE-A — Doctrine Evidence Collection');
console.log('');

/* ============================================================================
 * PART A — INTEGRATION VIA REAL W3 (enriched, default doctrine path)
 * ========================================================================== */
console.log('PART A: Integration via real Wargame 3 (no authored doctrine → defaults)');
const wsA = enrichedWorldState(w3, 5);
const evA = (wsA.derived && wsA.derived.objective_evidence) || [];

ok('A1 objective_evidence ledger is a non-empty array', Array.isArray(evA) && evA.length > 0);
ok('A2 all 9 doctrine types present in ledger',
   DOCTRINE_TYPES.every(t => findRec(evA, t) !== null));
ok('A3 doctrine records carry the same objId as combat records',
   (function () {
       const combat = findRec(evA, 'force_ratio') || findRec(evA, 'casualty_rate');
       const doc = findRec(evA, 'unit_doctrine_tags');
       return combat && doc && combat.objective_id === doc.objective_id;
   })());
ok('A4 ws.doctrine projected onto snapshot (empty for W3)',
   wsA.doctrine && typeof wsA.doctrine === 'object');
ok('A5 BLUE units carry posture slot (null for W3)',
   wsA.units.some(u => u.side === 'BLUE') &&
   wsA.units.filter(u => u.side === 'BLUE').every(u => 'posture' in u));

/* ============================================================================
 * PART B — CORE TYPE TESTS (direct, both branches via exported fn)
 * ========================================================================== */
console.log('');
console.log('CORE TYPE TESTS (computeDoctrineEvidence direct)');

// Synthetic snapshots: default (no doctrine) vs authored.
const blueUnitsDefault = [
    { side: 'BLUE', echelon: 'battalion', doctrine_tags: ['IADS', 'air_defense'] },
    { side: 'BLUE', echelon: 'battalion', doctrine_tags: ['maneuver'] },
    { side: 'BLUE', echelon: 'company',   doctrine_tags: ['sea_control'] },
    { side: 'RED',  echelon: 'division',  doctrine_tags: ['maneuver'] },
    { side: 'BLUE', echelon: 'company', off_map: true, doctrine_tags: ['x'] } // excluded (off_map)
];
const wsDefault = { units: blueUnitsDefault, doctrine: {}, objectives: [{ id: 'alpha' }] };
const recsDefault = WS.computeDoctrineEvidence(wsDefault, 'alpha', 3);

const blueUnitsAuthored = [
    { side: 'BLUE', echelon: 'battalion', posture: 'hold', doctrine_tags: ['IADS'] },
    { side: 'BLUE', echelon: 'battalion', posture: 'hold', doctrine_tags: ['maneuver'] },
    { side: 'BLUE', echelon: 'battalion', posture: 'active', doctrine_tags: ['air'] }
];
const wsAuthored = {
    units: blueUnitsAuthored,
    doctrine: {
        weapon_control_status: { air: 'HOLD', surface: 'FREE', subsurface: 'TIGHT' },
        emcon: 'emcon-silent',
        engage_ambiguous: true
    },
    objectives: [{ id: 'bravo', doctrine_priority: 'tertiary' }]
};
const recsAuthored = WS.computeDoctrineEvidence(wsAuthored, 'bravo', 7);

function dRec(recs, type) { return findRec(recs, type); }

// --- Type 1: unit_doctrine_tags ---
console.log('  [Type 1: unit_doctrine_tags]');
const t1 = dRec(recsDefault, 'unit_doctrine_tags');
ok('T1 record exists', !!t1);
ok('T1 value is array', Array.isArray(t1.value));
ok('T1 aggregates unique BLUE tags (sorted, off_map excluded)',
   JSON.stringify(t1.value) === JSON.stringify(['IADS', 'air_defense', 'maneuver', 'sea_control']));
ok('T1 excludes RED-only/off_map tags', t1.value.indexOf('x') < 0);
ok('T1 source correct', t1.source === 'ws.units[].doctrine_tags');
ok('T1 confidence 0.95 when tags present', t1.confidence === 0.95);

// --- Type 2: unit_echelon_level ---
console.log('  [Type 2: unit_echelon_level]');
const t2 = dRec(recsDefault, 'unit_echelon_level');
ok('T2 record exists', !!t2);
ok('T2 value is dominant echelon string', t2.value === 'battalion'); // 2 battalion > 1 company
ok('T2 source correct', t2.source === 'ws.units[].echelon');
ok('T2 confidence 0.95', t2.confidence === 0.95);
const t2none = dRec(WS.computeDoctrineEvidence({ units: [{ side: 'BLUE' }], doctrine: {}, objectives: [{ id: 'x' }] }, 'x', 0), 'unit_echelon_level');
ok('T2 null echelon → value null', t2none.value === null);
ok('T2 confidence 0.5 when no echelon', t2none.confidence === 0.5);

// --- Type 3: unit_posture_state ---
console.log('  [Type 3: unit_posture_state]');
const t3d = dRec(recsDefault, 'unit_posture_state');
ok('T3 record exists', !!t3d);
ok('T3 unauthored posture → majority active', t3d.value === 'active');
ok('T3 confidence 0.5 when unauthored', t3d.confidence === 0.5);
const t3a = dRec(recsAuthored, 'unit_posture_state');
ok('T3 authored majority posture (hold)', t3a.value === 'hold'); // 2 hold > 1 active
ok('T3 confidence 0.85 when authored', t3a.confidence === 0.85);
ok('T3 value is valid posture enum', ['active', 'defensive', 'hold', 'retire'].indexOf(t3a.value) >= 0);

// --- Type 4: side_weapons_control_status ---
console.log('  [Type 4: side_weapons_control_status]');
const t4d = dRec(recsDefault, 'side_weapons_control_status');
ok('T4 record exists', !!t4d);
ok('T4 value has air/surface/subsurface', t4d.value && 'air' in t4d.value && 'surface' in t4d.value && 'subsurface' in t4d.value);
ok('T4 each domain is FREE|TIGHT|HOLD',
   ['FREE', 'TIGHT', 'HOLD'].indexOf(t4d.value.air) >= 0 &&
   ['FREE', 'TIGHT', 'HOLD'].indexOf(t4d.value.surface) >= 0 &&
   ['FREE', 'TIGHT', 'HOLD'].indexOf(t4d.value.subsurface) >= 0);
ok('T4 default is liberal {air:FREE,surface:FREE,subsurface:HOLD}',
   t4d.value.air === 'FREE' && t4d.value.surface === 'FREE' && t4d.value.subsurface === 'HOLD');
ok('T4 default confidence 0.5', t4d.confidence === 0.5);
ok('T4 default source tagged "(default ...)"', /default/.test(t4d.source));
const t4a = dRec(recsAuthored, 'side_weapons_control_status');
ok('T4 authored values pass through', t4a.value.air === 'HOLD' && t4a.value.surface === 'FREE' && t4a.value.subsurface === 'TIGHT');
ok('T4 authored confidence 0.95', t4a.confidence === 0.95);
ok('T4 asymmetry allowed (different per domain)', t4a.value.air !== t4a.value.surface);

// --- Type 5: side_emcon_status ---
console.log('  [Type 5: side_emcon_status]');
const t5d = dRec(recsDefault, 'side_emcon_status');
ok('T5 record exists', !!t5d);
ok('T5 default active', t5d.value === 'active');
ok('T5 default confidence 0.5', t5d.confidence === 0.5);
const t5a = dRec(recsAuthored, 'side_emcon_status');
ok('T5 authored value passes through', t5a.value === 'emcon-silent');
ok('T5 authored confidence 0.9', t5a.confidence === 0.9);
ok('T5 value is string', typeof t5a.value === 'string');

// --- Type 6: side_engage_ambiguous ---
console.log('  [Type 6: side_engage_ambiguous]');
const t6d = dRec(recsDefault, 'side_engage_ambiguous');
ok('T6 record exists', !!t6d);
ok('T6 default false (conservative)', t6d.value === false);
ok('T6 default confidence 0.5', t6d.confidence === 0.5);
const t6a = dRec(recsAuthored, 'side_engage_ambiguous');
ok('T6 authored true passes through', t6a.value === true);
ok('T6 value is boolean', typeof t6a.value === 'boolean');
ok('T6 authored confidence 0.95', t6a.confidence === 0.95);

// --- Type 7: unit_doctrine_inheritance_scope ---
console.log('  [Type 7: unit_doctrine_inheritance_scope]');
const t7 = dRec(recsDefault, 'unit_doctrine_inheritance_scope');
ok('T7 record exists', !!t7);
ok('T7 inferred scope = side', t7.value === 'side');
ok('T7 value is valid enum', ['side', 'mission', 'unit'].indexOf(t7.value) >= 0);
ok('T7 confidence 0.8 (inferred)', t7.confidence === 0.8);
ok('T7 source notes inference', /inferred/.test(t7.source));

// --- Type 8: objective_doctrine_priority ---
console.log('  [Type 8: objective_doctrine_priority]');
const t8d = dRec(recsDefault, 'objective_doctrine_priority');
ok('T8 record exists', !!t8d);
ok('T8 default first objective = primary', t8d.value === 'primary');
ok('T8 confidence 0.7', t8d.confidence === 0.7);
const t8a = dRec(recsAuthored, 'objective_doctrine_priority');
ok('T8 authored priority passes through', t8a.value === 'tertiary');
ok('T8 value is valid enum', ['primary', 'secondary', 'tertiary', 'hold'].indexOf(t8a.value) >= 0);

// --- Type 9: doctrine_compliance_summary ---
console.log('  [Type 9: doctrine_compliance_summary]');
const t9d = dRec(recsDefault, 'doctrine_compliance_summary');
ok('T9 record exists', !!t9d);
ok('T9 has compliant/non_compliant/constraints keys',
   t9d.value && 'compliant_unit_count' in t9d.value && 'non_compliant_unit_count' in t9d.value && 'doctrine_constraints_active' in t9d.value);
ok('T9 compliant count = BLUE non-offmap units (3)', t9d.value.compliant_unit_count === 3);
ok('T9 non_compliant = 0 (no enforcement)', t9d.value.non_compliant_unit_count === 0);
ok('T9 default constraints reflect liberal WCS (subsurface HOLD only)',
   JSON.stringify(t9d.value.doctrine_constraints_active) === JSON.stringify(['WCS_subsurface_HOLD']));
ok('T9 confidence 0.75', t9d.confidence === 0.75);
const t9a = dRec(recsAuthored, 'doctrine_compliance_summary');
ok('T9 authored constraints list active rules (WCS air/sub + EMCON + posture hold)',
   t9a.value.doctrine_constraints_active.indexOf('WCS_air_HOLD') >= 0 &&
   t9a.value.doctrine_constraints_active.indexOf('EMCON_emcon-silent') >= 0 &&
   t9a.value.doctrine_constraints_active.indexOf('POSTURE_hold') >= 0);

/* ============================================================================
 * INTEGRATION TESTS
 * ========================================================================== */
console.log('');
console.log('INTEGRATION TESTS');
const allDoc = recsAuthored;
ok('I1 every doctrine record has objective_id', allDoc.every(r => r.objective_id === 'bravo'));
ok('I2 every doctrine record has step_index', allDoc.every(r => r.step_index === 7));
ok('I3 every confidence in [0,1]', allDoc.every(r => inRange01(r.confidence)));
ok('I4 exact 6-field record shape (no extra keys)',
   allDoc.every(r => Object.keys(r).sort().join(',') === 'confidence,evidence_type,objective_id,source,step_index,value'));
ok('I5 no weight/score keys anywhere',
   allDoc.every(r => !/weight|score|rank|priority_value/.test(JSON.stringify(Object.keys(r)))));
ok('I6 all emitted types are in the DOCTRINE_TYPES set', allDoc.every(r => DOCTRINE_TYPES.indexOf(r.evidence_type) >= 0));

// Parity gate: doctrine evidence must not change objective_status_display.
const statusWith = WS.computeObjectiveStatusDisplay(wsA);
const wsNoDoctrine = { ws_version: wsA.ws_version, derived: {} };
for (const k in wsA.derived) wsNoDoctrine.derived[k] = wsA.derived[k];
wsNoDoctrine.derived.objective_evidence = evA.filter(r => DOCTRINE_TYPES.indexOf(r.evidence_type) < 0);
wsNoDoctrine.balance = wsA.balance;
const statusWithout = WS.computeObjectiveStatusDisplay(wsNoDoctrine);
ok('I7 objective_status_display identical with vs without doctrine evidence (parity)',
   statusWith === statusWithout);

// No mutation of input units / doctrine.
const unitsSnapshot = JSON.stringify(blueUnitsAuthored);
const doctrineSnapshot = JSON.stringify(wsAuthored.doctrine);
WS.computeDoctrineEvidence(wsAuthored, 'bravo', 7);
ok('I8 does not mutate input units', JSON.stringify(blueUnitsAuthored) === unitsSnapshot);
ok('I9 does not mutate input doctrine', JSON.stringify(wsAuthored.doctrine) === doctrineSnapshot);

// Determinism.
const run1 = JSON.stringify(WS.computeDoctrineEvidence(wsAuthored, 'bravo', 7));
const run2 = JSON.stringify(WS.computeDoctrineEvidence(wsAuthored, 'bravo', 7));
ok('I10 deterministic (same ws → same records)', run1 === run2);

/* ============================================================================
 * REGRESSION TESTS
 * ========================================================================== */
console.log('');
console.log('REGRESSION TESTS');
let allStepsHaveDoctrine = true, tagsStable = null, tagsConsistent = true;
const stepCount = wsA.meta ? wsA.meta.step_count : 8;
for (let s = 0; s < stepCount; s++) {
    const ws = enrichedWorldState(w3, s);
    const ev = (ws.derived && ws.derived.objective_evidence) || [];
    const tagsRec = findRec(ev, 'unit_doctrine_tags');
    const wcsRec = findRec(ev, 'side_weapons_control_status');
    if (!tagsRec || !wcsRec) allStepsHaveDoctrine = false;
    if (tagsRec) {
        const j = JSON.stringify(tagsRec.value);
        if (tagsStable === null) tagsStable = j;
        else if (j !== tagsStable) tagsConsistent = false;
    }
}
ok('R1 every W3 step emits doctrine evidence', allStepsHaveDoctrine);
ok('R2 doctrine tags stable across steps (no per-step drift)', tagsConsistent);

// Degraded scenario → no doctrine evidence (parity gate inherited from objective_evidence).
const degraded = { schema_variant: 'plain', steps: [{}], obj: { name: 'z' } };
const wsDeg = WS.deriveWorldState(degraded, 0);
const evDeg = wsDeg.derived && wsDeg.derived.objective_evidence;
ok('R3 degraded scenario → objective_evidence null (no doctrine fabricated)', evDeg == null || evDeg === null);

// Empty BLUE force → unit-level types omitted; side-level still emitted.
const recsEmpty = WS.computeDoctrineEvidence({ units: [{ side: 'RED', echelon: 'division' }], doctrine: {}, objectives: [{ id: 'q' }] }, 'q', 0);
ok('R4 empty BLUE force → unit_doctrine_tags omitted', findRec(recsEmpty, 'unit_doctrine_tags') === null);
ok('R5 empty BLUE force → side-level WCS still emitted', findRec(recsEmpty, 'side_weapons_control_status') !== null);
ok('R6 empty BLUE force → objective priority still emitted', findRec(recsEmpty, 'objective_doctrine_priority') !== null);
ok('R7 W3 step 0 and step 5 both produce all 9 doctrine types',
   (function () {
       const e0 = (enrichedWorldState(w3, 0).derived || {}).objective_evidence || [];
       const e5 = (enrichedWorldState(w3, 5).derived || {}).objective_evidence || [];
       return DOCTRINE_TYPES.every(t => findRec(e0, t) && findRec(e5, t));
   })());

console.log('');
console.log('DOCTRINE-A: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
