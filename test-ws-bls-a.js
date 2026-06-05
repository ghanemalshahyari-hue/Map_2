/* test-ws-bls-a.js — PR-WS-BLS-A: BLS ownership inversion (presence rule).
 *
 * WS-BLS-A moves authority for BLS status from the authored state.bls_status
 * into World State via a DERIVATIONS rule (key: bls_status).
 * Rule: CONTESTED if any live, non-off-map RED unit is within BLS_RADIUS_NM
 * of the BLS coord; STAGED otherwise. No balance formula, no SECURE/DENIED.
 *
 * Asserts:
 *   1.  computeBlsStatus + BLS_RADIUS_NM are exported.
 *   2.  Parity gate: degraded scenario → null (renderer falls back to authored).
 *   3.  Parity gate: no live units → null.
 *   4.  Parity gate: no BLS coords → null.
 *   5.  CONTESTED when RED unit within BLS_RADIUS_NM.
 *   6.  STAGED when RED unit outside BLS_RADIUS_NM.
 *   7.  STAGED when only BLUE units present (no RED).
 *   8.  STAGED when RED is DESTROYED (excluded from check).
 *   9.  STAGED when RED is off_map (excluded from check).
 *  10.  Multiple BLS — each resolves independently.
 *  11.  DERIVATIONS includes bls_status, runs after balance_summary.
 *  12.  W3 scenario: STAGED at step 0, CONTESTED by step 5 (reactive).
 *  13.  W3 full replay: no exceptions thrown; status flips deterministically.
 *  14.  No mutation of the input ws object.
 *  15.  No forbidden side effects (fetch / journal / window.units mutation).
 * Run: node test-ws-bls-a.js
 */
'use strict';
const path = require('path');
const fs   = require('fs');
const ROOT = __dirname;
const WS   = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
const w3   = require(path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'));
const WS_JS = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('PR-WS-BLS-A — BLS ownership inversion (presence rule)');

/* helpers ----------------------------------------------------------------- */
// BLS-1 sits at [19.12, 30.536]. Build a minimal ws with one BLS and units.
function wsStub(units, degraded) {
    return {
        degraded: !!degraded,
        lines: { bls: [{ id: 'BLS-1', position: [19.12, 30.536] }] },
        units: units || []
    };
}
// A RED unit exactly at the BLS (0 nm away).
function redAt(lon, lat, opts) {
    return Object.assign({ side: 'RED', position: [lon, lat], status: null, off_map: false }, opts || {});
}
// A position offset by ~1 degree north — ~60 nm away.
const FAR_NORTH = [19.12, 31.6];
const ON_BEACH  = [19.12, 30.536];

/* 1. Exports -------------------------------------------------------------- */
ok('computeBlsStatus is exported', typeof WS.computeBlsStatus === 'function');
ok('BLS_RADIUS_NM is exported',    typeof WS.BLS_RADIUS_NM === 'number' && WS.BLS_RADIUS_NM > 0);

/* 2. Parity gate: degraded scenario --------------------------------------- */
ok('degraded ws → null (authored fallback)',
   WS.computeBlsStatus(wsStub([redAt(...ON_BEACH)], true)) === null);

/* 3. Parity gate: no live units ------------------------------------------ */
ok('no units → null',
   WS.computeBlsStatus(wsStub([], false)) === null);
ok('null units array → null',
   WS.computeBlsStatus({ degraded: false, lines: { bls: [{ id: 'BLS-1', position: [19.12, 30.5] }] }, units: null }) === null);

/* 4. Parity gate: no BLS ------------------------------------------------- */
ok('no BLS entries → null',
   WS.computeBlsStatus({ degraded: false, lines: { bls: [] }, units: [redAt(...ON_BEACH)] }) === null);
ok('BLS without position → skipped (null result)',
   WS.computeBlsStatus({ degraded: false, lines: { bls: [{ id: 'BLS-X' }] }, units: [redAt(...ON_BEACH)] }) === null);

/* 5. CONTESTED: RED within radius ---------------------------------------- */
const contested = WS.computeBlsStatus(wsStub([redAt(...ON_BEACH)]));
ok('RED at BLS → result is a non-null object',   contested !== null && typeof contested === 'object');
ok('RED at BLS → BLS-1 is CONTESTED',            contested && contested['BLS-1'] === 'CONTESTED');

/* 6. STAGED: RED outside radius ------------------------------------------ */
const staged = WS.computeBlsStatus(wsStub([redAt(...FAR_NORTH)]));
ok('RED far away → BLS-1 is STAGED',             staged && staged['BLS-1'] === 'STAGED');

/* 7. STAGED: only BLUE units --------------------------------------------- */
const blueOnly = WS.computeBlsStatus(wsStub([
    { side: 'BLUE', position: ON_BEACH, status: null, off_map: false }
]));
ok('only BLUE near BLS → BLS-1 is STAGED',       blueOnly && blueOnly['BLS-1'] === 'STAGED');

/* 8. STAGED: RED is DESTROYED -------------------------------------------- */
const destroyed = WS.computeBlsStatus(wsStub([redAt(...ON_BEACH, { status: 'DESTROYED' })]));
ok('DESTROYED RED near BLS → BLS-1 is STAGED',   destroyed && destroyed['BLS-1'] === 'STAGED');

/* 9. STAGED: RED is off_map ---------------------------------------------- */
const offmap = WS.computeBlsStatus(wsStub([redAt(...ON_BEACH, { off_map: true })]));
ok('off_map RED near BLS → BLS-1 is STAGED',     offmap && offmap['BLS-1'] === 'STAGED');

/* 10. Multiple BLS: independent resolution -------------------------------- */
const twoBls = WS.computeBlsStatus({
    degraded: false,
    lines: { bls: [
        { id: 'BLS-1', position: [19.12, 30.536] },
        { id: 'BLS-2', position: [19.50, 30.536] },  // ~20 nm east of BLS-1
    ]},
    units: [redAt(...ON_BEACH)]  // only near BLS-1
});
ok('multi-BLS: BLS-1 CONTESTED, BLS-2 STAGED independently',
   twoBls && twoBls['BLS-1'] === 'CONTESTED' && twoBls['BLS-2'] === 'STAGED');

/* 11. DERIVATIONS registry ----------------------------------------------- */
const keys = Object.keys(WS.DERIVATIONS);
ok('DERIVATIONS includes bls_status',               keys.includes('bls_status'));
ok('bls_status runs AFTER balance_summary',         keys.indexOf('balance_summary') < keys.indexOf('bls_status'));
ok('bls_status runs BEFORE objective_status_display', keys.indexOf('bls_status') < keys.indexOf('objective_status_display'));

/* 12. W3 scenario: reactive STAGED → CONTESTED ---------------------------- */
const ws0 = WS.deriveWorldState(w3, 0);
const ws5 = WS.deriveWorldState(w3, 5);
ok('W3 step 0: BLS-1 STAGED (no red near beach)',
   ws0.derived.bls_status && ws0.derived.bls_status['BLS-1'] === 'STAGED');
ok('W3 step 5: BLS-1 CONTESTED (red units at beach)',
   ws5.derived.bls_status && ws5.derived.bls_status['BLS-1'] === 'CONTESTED');

/* 13. W3 full replay: no exceptions, status present at each step ---------- */
let allPresent = true, exceptions = 0, lastStatus = null, sawContest = false, sawStaged = false;
for (let i = 0; i < w3.steps.length; i++) {
    try {
        const ws = WS.deriveWorldState(w3, i);
        if (!ws.derived.bls_status) allPresent = false;
        const s = ws.derived.bls_status && ws.derived.bls_status['BLS-1'];
        if (s === 'CONTESTED') sawContest = true;
        if (s === 'STAGED')    sawStaged  = true;
    } catch (_) { exceptions++; }
}
ok('W3 full replay: bls_status present at every step', allPresent);
ok('W3 full replay: 0 exceptions',                     exceptions === 0);
ok('W3 replay: CONTESTED appears (Red closes in)',      sawContest);
ok('W3 replay: STAGED appears (Red offshore/inland)',   sawStaged);

/* 14. No mutation of input ----------------------------------------------- */
const inputWs = wsStub([redAt(...ON_BEACH)]);
const frozen  = JSON.stringify(inputWs);
WS.computeBlsStatus(inputWs);
ok('computeBlsStatus does not mutate its input', JSON.stringify(inputWs) === frozen);

// applyDerivations path also must not clobber bls array
const wsForDeriv = WS.deriveWorldState(w3, 5);
const blsArrBefore = JSON.stringify(wsForDeriv.lines.bls);
WS.applyDerivations(wsForDeriv);
ok('applyDerivations does not mutate ws.lines.bls entries', JSON.stringify(wsForDeriv.lines.bls) === blsArrBefore);

/* 15. No forbidden side effects ------------------------------------------ */
ok('no fetch / journal / window.units mutation in world-state.js',
   !/fetch\(|\/api\/sim\/|appendCommit|window\.units\s*=/.test(WS_JS));
ok('computeBlsStatus defined in world-state.js (not inlined elsewhere)',
   /function\s+computeBlsStatus\b/.test(WS_JS));

console.log(`\nPR-WS-BLS-A: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
