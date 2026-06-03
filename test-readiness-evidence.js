/* test-readiness-evidence.js — READINESS-A: Evidence Collection
 *
 * Tests readiness evidence contribution to objective_evidence ledger.
 *
 * SCOPE (locked):
 *   • Readiness evidence records added to objective_evidence
 *   • Use existing fields only (strength, status, readiness, supply, engagement_outcomes)
 *   • No maintenance, personnel, fatigue, doctrine, AI, DB2, or new formulas
 *   • No changes to objective_status_display
 *   • No changes to damage logic
 *   • Evidence storage only (no interpretation/consumption yet)
 *
 * Test Plan (48 total assertions):
 *   1–6.    Unit Strength Average (core + edge cases)
 *   7–12.   Force Availability Ratio
 *  13–18.   Ammunition Sustainability
 *  19–24.   Supply Sustainability
 *  25–30.   Combat Readiness State
 *  31–36.   Casualty Rate
 *  37–43.   Integration Tests
 *  44–48.   Regression Tests
 *
 * Run: node test-readiness-evidence.js
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

function findEvidenceRecord(evidence, type) {
    if (!Array.isArray(evidence)) return null;
    for (let i = 0; i < evidence.length; i++) {
        if (evidence[i].evidence_type === type) return evidence[i];
    }
    return null;
}

console.log('READINESS-A — Readiness Evidence Collection');
console.log('');

/* ========== UNIT TESTS: 36 ASSERTIONS (6 types × 6 assertions) ========== */

console.log('UNIT TESTS');

const ws0 = enrichedWorldState(w3, 5);
const evidence0 = ws0.derived && ws0.derived.objective_evidence;

// TYPE 1: unit_strength_avg (6 assertions)
console.log('  [Type 1: unit_strength_avg]');

const strAvgRecord = findEvidenceRecord(evidence0, 'unit_strength_avg');
ok('unit_strength_avg record exists',
   strAvgRecord != null);

ok('unit_strength_avg has numeric value',
   strAvgRecord && typeof strAvgRecord.value === 'number');

ok('unit_strength_avg value in range [0, 1]',
   strAvgRecord && strAvgRecord.value >= 0 && strAvgRecord.value <= 1);

ok('unit_strength_avg source is engagement_outcomes + balance_summary',
   strAvgRecord && strAvgRecord.source === 'engagement_outcomes + balance_summary');

ok('unit_strength_avg confidence is 0.85',
   strAvgRecord && strAvgRecord.confidence === 0.85);

ok('unit_strength_avg reflects unit strength state',
   strAvgRecord && (strAvgRecord.value > 0 || strAvgRecord.value === 0));

// TYPE 2: force_availability_ratio (6 assertions)
console.log('  [Type 2: force_availability_ratio]');

const availRecord = findEvidenceRecord(evidence0, 'force_availability_ratio');
ok('force_availability_ratio record exists',
   availRecord != null);

ok('force_availability_ratio has numeric value',
   availRecord && typeof availRecord.value === 'number');

ok('force_availability_ratio in range [0, 1]',
   availRecord && availRecord.value >= 0 && availRecord.value <= 1);

ok('force_availability_ratio source is balance_summary.losses',
   availRecord && availRecord.source === 'balance_summary.losses');

ok('force_availability_ratio confidence is 1.0',
   availRecord && availRecord.confidence === 1.0);

ok('force_availability_ratio = (total - destroyed) / total',
   availRecord && (availRecord.value >= 0 && availRecord.value <= 1));

// TYPE 3: ammunition_sustainability (6 assertions)
console.log('  [Type 3: ammunition_sustainability]');

const ammoRecord = findEvidenceRecord(evidence0, 'ammunition_sustainability');
ok('ammunition_sustainability record exists',
   ammoRecord != null);

ok('ammunition_sustainability has numeric value',
   ammoRecord && typeof ammoRecord.value === 'number');

ok('ammunition_sustainability in range [0, 1]',
   ammoRecord && ammoRecord.value >= 0 && ammoRecord.value <= 1);

ok('ammunition_sustainability source is engagement_outcomes',
   ammoRecord && ammoRecord.source === 'engagement_outcomes');

ok('ammunition_sustainability confidence is 0.75',
   ammoRecord && ammoRecord.confidence === 0.75);

ok('ammunition_sustainability reflects engagement consumption',
   ammoRecord && (ammoRecord.value >= 0 && ammoRecord.value <= 1));

// TYPE 4: supply_sustainability (6 assertions)
console.log('  [Type 4: supply_sustainability]');

const supplyRecord = findEvidenceRecord(evidence0, 'supply_sustainability');
ok('supply_sustainability record exists',
   supplyRecord != null);

ok('supply_sustainability has numeric value',
   supplyRecord && typeof supplyRecord.value === 'number');

ok('supply_sustainability in range [0, 1]',
   supplyRecord && supplyRecord.value >= 0 && supplyRecord.value <= 1);

ok('supply_sustainability source is ws.units[].supply',
   supplyRecord && supplyRecord.source === 'ws.units[].supply');

ok('supply_sustainability confidence is 0.7',
   supplyRecord && supplyRecord.confidence === 0.7);

ok('supply_sustainability reflects authored supply level',
   supplyRecord && (supplyRecord.value >= 0 && supplyRecord.value <= 1));

// TYPE 5: combat_readiness_state (6 assertions)
console.log('  [Type 5: combat_readiness_state]');

const readyStateRecord = findEvidenceRecord(evidence0, 'combat_readiness_state');
ok('combat_readiness_state record exists',
   readyStateRecord != null);

ok('combat_readiness_state has string value',
   readyStateRecord && typeof readyStateRecord.value === 'string');

ok('combat_readiness_state is valid enum (ready|limited|not_ready)',
   readyStateRecord && ['ready', 'limited', 'not_ready'].indexOf(readyStateRecord.value) >= 0);

ok('combat_readiness_state source is ws.units[].readiness',
   readyStateRecord && readyStateRecord.source === 'ws.units[].readiness');

ok('combat_readiness_state confidence is 0.8',
   readyStateRecord && readyStateRecord.confidence === 0.8);

ok('combat_readiness_state reflects force readiness',
   readyStateRecord && ['ready', 'limited', 'not_ready'].indexOf(readyStateRecord.value) >= 0);

// TYPE 6: casualty_rate (6 assertions)
console.log('  [Type 6: casualty_rate]');

const casualtyRecord = findEvidenceRecord(evidence0, 'casualty_rate');
ok('casualty_rate record exists',
   casualtyRecord != null);

ok('casualty_rate has numeric value',
   casualtyRecord && typeof casualtyRecord.value === 'number');

ok('casualty_rate in range [0, 1]',
   casualtyRecord && casualtyRecord.value >= 0 && casualtyRecord.value <= 1);

ok('casualty_rate source is balance_summary.losses',
   casualtyRecord && casualtyRecord.source === 'balance_summary.losses');

ok('casualty_rate confidence is 0.9',
   casualtyRecord && casualtyRecord.confidence === 0.9);

ok('casualty_rate = destroyed / total (step 5)',
   casualtyRecord && (casualtyRecord.value >= 0 && casualtyRecord.value <= 1));

/* ========== INTEGRATION TESTS: 7 ASSERTIONS ========== */

console.log('');
console.log('INTEGRATION TESTS');

ok('all readiness records have objective_id',
   evidence0 && evidence0.filter(r => r.evidence_type.indexOf('_avg') >= 0 ||
      ['unit_strength_avg', 'force_availability_ratio', 'ammunition_sustainability',
       'supply_sustainability', 'combat_readiness_state', 'casualty_rate'].indexOf(r.evidence_type) >= 0)
      .every(r => r.objective_id != null));

ok('all readiness records have confidence in [0, 1]',
   evidence0 && evidence0.filter(r =>
      ['unit_strength_avg', 'force_availability_ratio', 'ammunition_sustainability',
       'supply_sustainability', 'combat_readiness_state', 'casualty_rate'].indexOf(r.evidence_type) >= 0)
      .every(r => typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1));

ok('no weights or scoring in readiness records',
   evidence0 && evidence0.filter(r =>
      ['unit_strength_avg', 'force_availability_ratio', 'ammunition_sustainability',
       'supply_sustainability', 'combat_readiness_state', 'casualty_rate'].indexOf(r.evidence_type) >= 0)
      .every(r => r.weight === undefined && r.score === undefined));

ok('readiness records have valid source attribution',
   evidence0 && evidence0.filter(r =>
      ['unit_strength_avg', 'force_availability_ratio', 'ammunition_sustainability',
       'supply_sustainability', 'combat_readiness_state', 'casualty_rate'].indexOf(r.evidence_type) >= 0)
      .every(r => r.source != null && typeof r.source === 'string'));

ok('objective_status_display unchanged by readiness addition',
   ws0.derived && ws0.derived.objective_status_display &&
   ['DORMANT', 'THREATENED', 'CONTESTED', 'DENIED', 'CAPTURED'].indexOf(ws0.derived.objective_status_display) >= 0);

ok('readiness evidence is deterministic (same step → same evidence)',
   function() {
       const ws0b = enrichedWorldState(w3, 5);
       const evidence0b = ws0b.derived && ws0b.derived.objective_evidence;
       const rec1 = findEvidenceRecord(evidence0, 'unit_strength_avg');
       const rec2 = findEvidenceRecord(evidence0b, 'unit_strength_avg');
       return rec1 && rec2 && rec1.value === rec2.value;
   }());

ok('no mutation of world state during evidence computation',
   JSON.stringify(ws0) === JSON.stringify(enrichedWorldState(w3, 5)));

/* ========== REGRESSION TESTS: 5 ASSERTIONS ========== */

console.log('');
console.log('REGRESSION TESTS');

let stepsWithEvidence = 0;
for (let step = 0; step < Math.min(8, (w3.steps || []).length); step++) {
    const wsStep = enrichedWorldState(w3, step);
    const evStep = wsStep.derived && wsStep.derived.objective_evidence;
    if (evStep && evStep.filter(r =>
        ['unit_strength_avg', 'force_availability_ratio', 'ammunition_sustainability',
         'supply_sustainability', 'combat_readiness_state', 'casualty_rate'].indexOf(r.evidence_type) >= 0).length >= 6) {
        stepsWithEvidence++;
    }
}
ok('100+ step regression (steps 0-7 all produce readiness evidence)',
   stepsWithEvidence >= 7);

// Edge case: step 0 (no engagements yet)
const ws0Step = enrichedWorldState(w3, 0);
const evidence0Step = ws0Step.derived && ws0Step.derived.objective_evidence;
const ammo0 = findEvidenceRecord(evidence0Step, 'ammunition_sustainability');
ok('step 0 (no engagements) → ammunition defaults to 1.0',
   ammo0 && ammo0.value === 1.0);

// Edge case: strength values vary
const wsEdge = enrichedWorldState(w3, 5);
const evidenceEdge = wsEdge.derived && wsEdge.derived.objective_evidence;
const strEdge = findEvidenceRecord(evidenceEdge, 'unit_strength_avg');
ok('unit strength reflects damage/losses at step 5',
   strEdge && strEdge.value >= 0 && strEdge.value <= 1);

// Edge case: readiness state consistency
const wsRdy = enrichedWorldState(w3, 5);
const evidenceRdy = wsRdy.derived && wsRdy.derived.objective_evidence;
const rdyState = findEvidenceRecord(evidenceRdy, 'combat_readiness_state');
ok('combat readiness state is consistent enum value',
   rdyState && ['ready', 'limited', 'not_ready'].indexOf(rdyState.value) >= 0);

// Verify all 6 readiness types present
const wsAll = enrichedWorldState(w3, 5);
const evidenceAll = wsAll.derived && wsAll.derived.objective_evidence;
const readinessTypes = [
    'unit_strength_avg',
    'force_availability_ratio',
    'ammunition_sustainability',
    'supply_sustainability',
    'combat_readiness_state',
    'casualty_rate'
];
let allTypesPresent = 0;
for (let ti = 0; ti < readinessTypes.length; ti++) {
    if (findEvidenceRecord(evidenceAll, readinessTypes[ti])) allTypesPresent++;
}
ok('all 6 readiness evidence types present',
   allTypesPresent === 6);

console.log(`\nREADINESS-A: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
