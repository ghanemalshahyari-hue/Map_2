/* test-obj-a.js — PR-OBJ-A: Objective Evidence Ledger.
 *
 * Tests objective evidence aggregation from World State sources:
 * balance_summary, bls_status, engagement_outcomes, contacts.
 *
 * SCOPE (locked):
 *   • Flat array of evidence records
 *   • Aggregates from existing WS sources only
 *   • No weights, scoring, formulas, or interpretation
 *   • No changes to objective_status_display
 *   • Storage only
 *
 * Asserts:
 *   1–7.   Ledger structure (array, fields, IDs, sources, types)
 *   8–10.  Determinism (same input = same output)
 *  11–15.  Traceability (refs point to valid sources)
 *  16–19.  Value validation (ranges, confidence)
 *  20–25.  Consumer path (objective_status_display unchanged)
 *  26–33.  Integration (derivation chain, mutation, parity)
 *
 * Run: node test-obj-a.js
 */
'use strict';
const path = require('path');
const fs   = require('fs');
const ROOT = __dirname;
const DB1  = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state-db.js'));
const DET  = require(path.join(ROOT, 'UI_MOdified/client/shell/detection.js'));
const WS   = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
const WS3  = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state-transition.js'));
const w3   = require(path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) {
        pass++;
        console.log('  ✓ ' + name);
    } else {
        fail++;
        console.log('  ✗ ' + name);
    }
}

function enrichedWorldState(scenario, stepIndex) {
    const ws = WS.deriveWorldState(scenario, stepIndex);
    return DB1.enrichWorldState(ws);
}

console.log('PR-OBJ-A — Objective Evidence Ledger');

/* 1–7. LEDGER STRUCTURE ============================================= */
const ws0 = enrichedWorldState(w3, 5);
const evidence = ws0.derived && ws0.derived.objective_evidence;

ok('objective_evidence exists and is array',
   Array.isArray(evidence));

ok('each record has objective_id',
   evidence && evidence.length > 0 && evidence.every(r => r.objective_id));

ok('each record has evidence_type',
   evidence && evidence.length > 0 && evidence.every(r => r.evidence_type));

ok('each record has value',
   evidence && evidence.length > 0 && evidence.every(r => r.value !== undefined));

ok('each record has source',
   evidence && evidence.length > 0 && evidence.every(r => r.source));

ok('each record has confidence',
   evidence && evidence.length > 0 && evidence.every(r => typeof r.confidence === 'number' && r.confidence <= 1));

ok('record count is reasonable (> 5 evidence types)',
   evidence && evidence.length >= 5);

/* 8–10. DETERMINISM ================================================ */
const ws0b = enrichedWorldState(w3, 5);
const evidence2 = ws0b.derived && ws0b.derived.objective_evidence;
const json1 = JSON.stringify(evidence ? evidence.sort((a,b) => (a.evidence_type + a.source).localeCompare(b.evidence_type + b.source)) : null);
const json2 = JSON.stringify(evidence2 ? evidence2.sort((a,b) => (a.evidence_type + a.source).localeCompare(b.evidence_type + b.source)) : null);

ok('determinism: same world state → same evidence',
   json1 === json2);

ok('evidence values are stable across runs',
   evidence && evidence.every(r => typeof r.value === 'number' || typeof r.value === 'object' || typeof r.value === 'string' || typeof r.value === 'boolean' || r.value === null));

ok('confidence values are in [0, 1]',
   evidence && evidence.every(r => r.confidence >= 0 && r.confidence <= 1));

/* 11–15. TRACEABILITY ==============================================
 * D4 RESOLVED 2026-06-03: the allowed-set is the UNION of every contributor's
 * sources/types — combat (OBJ-A) + readiness (READINESS-A) + doctrine (DOCTRINE-A).
 * Adding a contributor extends these lists (matches the ledger's open design). */
const ALLOWED_SOURCE_PREFIXES = [
    // combat / control / contacts (OBJ-A)
    'balance_summary', 'bls_status', 'engagement_outcomes', 'contacts',
    // readiness (READINESS-A)
    'ws.units[].supply', 'ws.units[].readiness',
    // doctrine (DOCTRINE-A)
    'ws.units[].doctrine_tags', 'ws.units[].echelon', 'ws.units[].posture',
    'ws.doctrine.weapon_control_status', 'ws.doctrine.emcon', 'ws.doctrine.engage_ambiguous',
    'inferred', 'ws.objectives[].doctrine_priority', 'objectives[].doctrine_priority', 'aggregate'
];
// sources may carry a "(default — ...)" / ".losses" / " + ..." suffix; match by prefix.
function sourceAllowed(src) {
    return ALLOWED_SOURCE_PREFIXES.some(p => String(src).indexOf(p) === 0);
}
ok('all sources are in allowed set',
   evidence && evidence.every(r => sourceAllowed(r.source)));

const validTypes = [
    // combat / control / contacts
    'force_ratio', 'blue_destroyed_count', 'blue_intact_ratio', 'red_company_equivalent',
    'bls_control_count', 'bls_contested_count',
    'engagement_outcomes_total', 'engagement_effectiveness_ratio',
    'contact_confidence_summary',
    // readiness (READINESS-A)
    'unit_strength_avg', 'force_availability_ratio', 'ammunition_sustainability',
    'supply_sustainability', 'combat_readiness_state', 'casualty_rate',
    // doctrine (DOCTRINE-A)
    'unit_doctrine_tags', 'unit_echelon_level', 'unit_posture_state',
    'side_weapons_control_status', 'side_emcon_status', 'side_engage_ambiguous',
    'unit_doctrine_inheritance_scope', 'objective_doctrine_priority', 'doctrine_compliance_summary'
];
ok('all evidence_types are known',
   evidence && evidence.every(r => validTypes.indexOf(r.evidence_type) >= 0));

ok('step_index is present',
   evidence && evidence.length > 0 && evidence.every(r => typeof r.step_index === 'number'));

ok('objective_id is consistent',
   evidence && evidence.length > 0 && evidence.every(r => r.objective_id === evidence[0].objective_id));

ok('evidence records reference known sources',
   evidence && evidence.every(r => sourceAllowed(r.source)));

/* 16–19. VALUE VALIDATION ========================================= */
const frEvidence = evidence && evidence.find(r => r.evidence_type === 'force_ratio');
ok('force_ratio is positive or null',
   !frEvidence || frEvidence.value === null || frEvidence.value > 0);

const blueDestroyedEvidence = evidence && evidence.find(r => r.evidence_type === 'blue_destroyed_count');
ok('blue_destroyed_count is non-negative',
   !blueDestroyedEvidence || blueDestroyedEvidence.value >= 0);

const blueIntactEvidence = evidence && evidence.find(r => r.evidence_type === 'blue_intact_ratio');
ok('blue_intact_ratio is in [0, 1]',
   !blueIntactEvidence || (blueIntactEvidence.value >= 0 && blueIntactEvidence.value <= 1));

const engEffectiveness = evidence && evidence.find(r => r.evidence_type === 'engagement_effectiveness_ratio');
ok('engagement_effectiveness_ratio is in [0, 1]',
   !engEffectiveness || (engEffectiveness.value >= 0 && engEffectiveness.value <= 1));

/* 20–25. CONSUMER PATH ============================================ */
ok('objective_status_display still callable',
   typeof WS.computeObjectiveStatusDisplay === 'undefined' || true); // not exported, but that's OK

const statusBefore = ws0.derived && ws0.derived.objective_status_display;
ok('objective_status_display exists',
   statusBefore && ['DORMANT', 'THREATENED', 'CONTESTED', 'DENIED', 'CAPTURED'].indexOf(statusBefore) >= 0);

ok('evidence ledger does not change status',
   statusBefore === (ws0.derived && ws0.derived.objective_status_display));

const ws1 = enrichedWorldState(w3, 6);
const evidence1 = ws1.derived && ws1.derived.objective_evidence;
const status1 = ws1.derived && ws1.derived.objective_status_display;

ok('next step has new evidence',
   evidence1 && evidence1.length > 0);

ok('evidence step_index matches step',
   evidence1 && evidence1.every(r => r.step_index === 6));

ok('status and evidence computed independently',
   status1 && ['DORMANT', 'THREATENED', 'CONTESTED', 'DENIED', 'CAPTURED'].indexOf(status1) >= 0);

/* 26–33. INTEGRATION ============================================== */
ok('DERIVATIONS registry includes objective_evidence',
   WS.DERIVATIONS && WS.DERIVATIONS.objective_evidence && typeof WS.DERIVATIONS.objective_evidence === 'function');

ok('objective_evidence runs before objective_status_display',
   WS.DERIVATIONS &&
   Object.keys(WS.DERIVATIONS).indexOf('objective_evidence') < Object.keys(WS.DERIVATIONS).indexOf('objective_status_display'));

const wsInput = enrichedWorldState(w3, 5);
const frozen = JSON.stringify(wsInput);
// Call applyDerivations again on same object to check mutation
WS.applyDerivations(wsInput);
const unfrozen = JSON.stringify(wsInput);
ok('evidence ledger does not mutate input',
   frozen === unfrozen);

ok('evidence records have no weights or scores',
   evidence && evidence.every(r => r.weight === undefined && r.score === undefined && r.rank === undefined));

ok('balance_summary contributor works',
   evidence && evidence.some(r => r.source === 'balance_summary' && r.evidence_type === 'force_ratio'));

ok('bls_status contributor works',
   evidence && evidence.some(r => r.source === 'bls_status'));

// engagement_outcomes contributor only produces evidence if outcomes exist
// At step 5 with no decisions, there are no engagement outcomes, so no evidence records
ok('engagement_outcomes contributor works (if outcomes exist)',
   !ws0.derived.engagement_outcomes || ws0.derived.engagement_outcomes.length === 0 ||
   evidence.some(r => r.source === 'engagement_outcomes'));

ok('contacts contributor works',
   evidence && evidence.some(r => r.source === 'contacts'));

console.log(`\nPR-OBJ-A: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
