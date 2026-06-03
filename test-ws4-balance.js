/* test-ws4-balance.js — PR-WS4 Balance (no server).
 *
 * WS4-Balance completes the ownership inversion for objective status: force
 * ratio + losses are now COMPUTED from World State units (via the DERIVATIONS
 * pattern) instead of mirrored from `state`. The objective rule reads the
 * computed evidence with the `state` mirror as a parity fallback. Echelon
 * weights live behind getUnitOperationalWeight() so DB2 can swap the source.
 *
 * Asserts:
 *   1. getUnitOperationalWeight is a helper (not inlined) returning the weights.
 *   2. computeBalanceSummary derives FR + losses from units (pure).
 *   3. DERIVATIONS runs balance_summary BEFORE objective_status_display.
 *   4. W3 replay parity: objective display unchanged across all steps; 0 CAPTURED.
 *   5. CAPTURED re-litigation works off COMPUTED balance.
 *   6. Mirror fallback == WS2.5 behavior when balance_summary absent.
 *   7. No mutation/fetch/journal.
 * Run: node test-ws4-balance.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = __dirname;
const WS = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
const w3 = require(path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'));
const WS_JS = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('PR-WS4 — Balance computed from World State units');

/* 1. Weight helper (swappable for DB2) ----------------------------------- */
ok('getUnitOperationalWeight is exported', typeof WS.getUnitOperationalWeight === 'function');
ok('weight: division=9', WS.getUnitOperationalWeight({ echelon: 'division' }) === 9);
ok('weight: battalion=1', WS.getUnitOperationalWeight({ echelon: 'battalion' }) === 1);
ok('weight: company≈0.33', WS.getUnitOperationalWeight({ echelon: 'company' }) === 0.33);
ok('weight: unknown → default 1', WS.getUnitOperationalWeight({ echelon: 'zzz' }) === 1 && WS.getUnitOperationalWeight({}) === 1);
ok('weights are NOT hard-coded inside computeBalanceSummary (helper used)',
   /getUnitOperationalWeight\(/.test(WS_JS) &&
   /function\s+computeBalanceSummary[\s\S]*?getUnitOperationalWeight\(/.test(WS_JS));

/* 2. computeBalanceSummary derives FR + losses (pure) -------------------- */
const stub = { units: [
    { side: 'RED',  echelon: 'division', strength: 1.0, status: null },   // 9
    { side: 'RED',  echelon: 'brigade',  strength: 0.5, status: null },   // live 1.5, attrition 1.5
    { side: 'BLUE', echelon: 'brigade',  strength: 1.0, status: null },   // 3
    { side: 'BLUE', echelon: 'battalion',strength: 0,   status: 'DESTROYED' }, // destroyed
] };
const before = JSON.stringify(stub);
const bal = WS.computeBalanceSummary(stub);
ok('input not mutated', JSON.stringify(stub) === before);
// redForce = 9 + 1.5 = 10.5 ; blueForce = 3 (battalion destroyed → 0) ; FR = 3.5
ok('force_ratio_value computed from unit weights', bal.force_ratio_value === 3.5);
ok('losses.blue_destroyed counts destroyed blue', bal.losses.blue_destroyed === 1);
ok('losses.blue_total counts blue units', bal.losses.blue_total === 2);
ok('losses.red_company_equivalent from attrition·weight', bal.losses.red_company_equivalent === 1.5);
ok('empty units → nulls (rule falls back to mirror)',
   (() => { const r = WS.computeBalanceSummary({ units: [] }); return r.force_ratio_value === null && r.losses === null; })());

/* 3. DERIVATIONS ordering ------------------------------------------------ */
const keys = Object.keys(WS.DERIVATIONS);
ok('DERIVATIONS includes balance_summary + objective_status_display', keys.indexOf('balance_summary') !== -1 && keys.indexOf('objective_status_display') !== -1);
ok('balance_summary runs BEFORE objective_status_display', keys.indexOf('balance_summary') < keys.indexOf('objective_status_display'));

/* 4. W3 replay parity ---------------------------------------------------- */
let parity = true, captured = 0;
for (let i = 0; i < w3.steps.length; i++) {
    const ws = WS.deriveWorldState(w3, i);
    const raw = w3.steps[i].objective_status_baseline || 'DORMANT';
    if (w3.steps[i].objective_status_baseline === 'CAPTURED') captured++;
    // computed balance present, but non-CAPTURED → pass-through == raw (unchanged)
    if (ws.derived.objective_status_display !== raw) parity = false;
    if (!ws.derived.balance_summary) parity = false;
}
ok('objective_status_display unchanged (== raw status) across all 17 W3 steps', parity);
ok('W3 has 0 CAPTURED baseline steps (why computed evidence is a structural no-op)', captured === 0);
ok('balance_summary is populated on the live snapshot', !!WS.deriveWorldState(w3, 8).derived.balance_summary);

/* 5. CAPTURED re-litigation off COMPUTED balance ------------------------- */
// Build a CAPTURED snapshot whose UNITS show Blue intact → evidence overrules → DENIED.
function capturedWs(units) {
    const ws = { units, derived: { objective_status: 'CAPTURED' }, balance: {} };
    WS.applyDerivations(ws);
    return ws;
}
const intact = capturedWs([
    { side: 'RED', echelon: 'battalion', strength: 0.2, status: null },   // weak red
    { side: 'BLUE', echelon: 'division', strength: 1.0, status: null },   // strong, intact blue
]);
ok('CAPTURED + computed FR<2 / blue intact → DENIED', intact.derived.objective_status_display === 'DENIED');
const redHolds = capturedWs([
    { side: 'RED', echelon: 'division', strength: 1.0, status: null },
    { side: 'BLUE', echelon: 'battalion', strength: 0, status: 'DESTROYED' },
    { side: 'BLUE', echelon: 'battalion', strength: 0, status: 'DESTROYED' },
]);
ok('CAPTURED + computed FR high + blue gutted → CAPTURED holds', redHolds.derived.objective_status_display === 'CAPTURED');

/* 6. Mirror fallback == WS2.5 when balance_summary absent ----------------- */
// No units → balance_summary nulls → rule reads ws.balance mirror (string FR + losses).
function mirrorOnly(objective_status, fr, losses) {
    const ws = { units: [], derived: { objective_status }, balance: { force_ratio: fr, losses } };
    WS.applyDerivations(ws);
    return ws.derived.objective_status_display;
}
ok('fallback: CAPTURED + mirror "1.5:1" → DENIED', mirrorOnly('CAPTURED', '1.5:1', { blue_destroyed: 20, blue_total: 39 }) === 'DENIED');
ok('fallback: CAPTURED + mirror "below decisive" → DENIED', mirrorOnly('CAPTURED', 'below decisive', { blue_destroyed: 20, blue_total: 39 }) === 'DENIED');
ok('fallback: CAPTURED + decisive mirror + blue bloodied + red ok → CAPTURED',
   mirrorOnly('CAPTURED', '5:1', { blue_destroyed: 20, blue_total: 39, red_company_equivalent: 0 }) === 'CAPTURED');
ok('fallback: non-CAPTURED passes through', mirrorOnly('CONTESTED', '', {}) === 'CONTESTED');

/* 7. Boundary ------------------------------------------------------------ */
ok('no mutation/fetch/journal in the balance layer',
   !/fetch\(|\/api\/sim\/|appendCommit|window\.units\s*=/.test(WS_JS));

console.log(`\nPR-WS4: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
