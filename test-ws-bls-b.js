/* test-ws-bls-b.js — PR-WS-BLS-B: BLS control ownership (simple model).
 *
 * WS-BLS-B upgrades BLS status from a presence-only rule (Red here = CONTESTED)
 * to a CONTROL model: STAGED (empty) / SECURED (Red only) / DENIED (Blue only) /
 * CONTESTED (both fighting). This is a TEMPORARY, EXPLAINABLE ownership model.
 * Future MTH1 may replace it with a richer control-score formula.
 *
 * Uses existing BLS_RADIUS_NM (10 nm) and parity gates. No force-ratio thresholds.
 *
 * Asserts:
 *   1.  computeBlsStatusB is exported.
 *   2.  Parity gate: degraded scenario → null (authored fallback).
 *   3.  Parity gate: no live units → null.
 *   4.  Parity gate: no BLS coords → null.
 *   5.  STAGED when no units near BLS.
 *   6.  SECURED when RED only near BLS.
 *   7.  DENIED when BLUE only near BLS.
 *   8.  CONTESTED when both RED and BLUE near BLS.
 *   9.  STAGED when RED is DESTROYED (excluded).
 *  10.  STAGED when RED is off_map (excluded).
 *  11.  STAGED when BLUE is DESTROYED (excluded).
 *  12.  STAGED when BLUE is off_map (excluded).
 *  13.  Multiple BLS resolve independently.
 *  14.  W3 scenario: STAGED → SECURED → CONTESTED (control arc).
 *  15.  No mutation of input ws object.
 *  16.  No forbidden side effects (fetch / journal / window.units mutation).
 * Run: node test-ws-bls-b.js
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

console.log('PR-WS-BLS-B — BLS control ownership (simple model)');

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
// A BLUE unit exactly at the BLS.
function blueAt(lon, lat, opts) {
    return Object.assign({ side: 'BLUE', position: [lon, lat], status: null, off_map: false }, opts || {});
}
// A position offset by ~1 degree north — ~60 nm away.
const FAR_NORTH = [19.12, 31.6];
const ON_BEACH  = [19.12, 30.536];

/* 1. Export -------------------------------------------------------------- */
ok('computeBlsStatusB is exported', typeof WS.computeBlsStatusB === 'function');

/* 2. Parity gate: degraded scenario --------------------------------------- */
ok('degraded ws → null (authored fallback)',
   WS.computeBlsStatusB(wsStub([redAt(...ON_BEACH)], true)) === null);

/* 3. Parity gate: no live units ------------------------------------------ */
ok('no units → null',
   WS.computeBlsStatusB(wsStub([], false)) === null);
ok('null units array → null',
   WS.computeBlsStatusB({ degraded: false, lines: { bls: [{ id: 'BLS-1', position: [19.12, 30.5] }] }, units: null }) === null);

/* 4. Parity gate: no BLS ------------------------------------------------- */
ok('no BLS entries → null',
   WS.computeBlsStatusB({ degraded: false, lines: { bls: [] }, units: [redAt(...ON_BEACH)] }) === null);
ok('BLS without position → skipped (null result)',
   WS.computeBlsStatusB({ degraded: false, lines: { bls: [{ id: 'BLS-X' }] }, units: [redAt(...ON_BEACH)] }) === null);

/* 5. STAGED: no units near BLS ------------------------------------------- */
const empty = WS.computeBlsStatusB(wsStub([]));
ok('no units anywhere → null (parity gate)', empty === null);

const farAway = WS.computeBlsStatusB(wsStub([redAt(...FAR_NORTH), blueAt(...FAR_NORTH)]));
ok('RED + BLUE far away → BLS-1 is STAGED', farAway && farAway['BLS-1'] === 'STAGED');

/* 6. SECURED: RED only near BLS ------------------------------------------ */
const redOnly = WS.computeBlsStatusB(wsStub([redAt(...ON_BEACH)]));
ok('RED at BLS, no BLUE → BLS-1 is SECURED', redOnly && redOnly['BLS-1'] === 'SECURED');

const redNearBlueAway = WS.computeBlsStatusB(wsStub([
    redAt(...ON_BEACH),
    blueAt(...FAR_NORTH)
]));
ok('RED at BLS, BLUE far away → BLS-1 is SECURED', redNearBlueAway && redNearBlueAway['BLS-1'] === 'SECURED');

/* 7. DENIED: BLUE only near BLS ------------------------------------------ */
const blueOnly = WS.computeBlsStatusB(wsStub([blueAt(...ON_BEACH)]));
ok('BLUE at BLS, no RED → BLS-1 is DENIED', blueOnly && blueOnly['BLS-1'] === 'DENIED');

const blueNearRedAway = WS.computeBlsStatusB(wsStub([
    blueAt(...ON_BEACH),
    redAt(...FAR_NORTH)
]));
ok('BLUE at BLS, RED far away → BLS-1 is DENIED', blueNearRedAway && blueNearRedAway['BLS-1'] === 'DENIED');

/* 8. CONTESTED: both RED and BLUE near BLS ------------------------------ */
const bothNear = WS.computeBlsStatusB(wsStub([
    redAt(...ON_BEACH),
    blueAt(...ON_BEACH)
]));
ok('RED at BLS + BLUE at BLS → BLS-1 is CONTESTED', bothNear && bothNear['BLS-1'] === 'CONTESTED');

const redNearBlueSomewhatNear = WS.computeBlsStatusB(wsStub([
    redAt(...ON_BEACH),
    blueAt(19.12, 30.6)  // slightly offset from RED (still within radius)
]));
ok('RED + BLUE both within radius → BLS-1 is CONTESTED', redNearBlueSomewhatNear && redNearBlueSomewhatNear['BLS-1'] === 'CONTESTED');

/* 9. STAGED: RED is DESTROYED -------------------------------------------- */
const redDestroyed = WS.computeBlsStatusB(wsStub([
    redAt(...ON_BEACH, { status: 'DESTROYED' })
]));
ok('DESTROYED RED (only unit) near BLS → BLS-1 is STAGED', redDestroyed && redDestroyed['BLS-1'] === 'STAGED');

const redDestroyedBluePresent = WS.computeBlsStatusB(wsStub([
    redAt(...ON_BEACH, { status: 'DESTROYED' }),
    blueAt(...ON_BEACH)
]));
ok('DESTROYED RED + BLUE at BLS → BLS-1 is DENIED (BLUE only counts)', redDestroyedBluePresent && redDestroyedBluePresent['BLS-1'] === 'DENIED');

/* 10. STAGED: RED is off_map -------------------------------------------- */
const redOffmap = WS.computeBlsStatusB(wsStub([
    redAt(...ON_BEACH, { off_map: true })
]));
ok('off_map RED (only unit) near BLS → BLS-1 is STAGED', redOffmap && redOffmap['BLS-1'] === 'STAGED');

const redOfmapBluePresent = WS.computeBlsStatusB(wsStub([
    redAt(...ON_BEACH, { off_map: true }),
    blueAt(...ON_BEACH)
]));
ok('off_map RED + BLUE at BLS → BLS-1 is DENIED (BLUE only counts)', redOfmapBluePresent && redOfmapBluePresent['BLS-1'] === 'DENIED');

/* 11. STAGED: BLUE is DESTROYED ------------------------------------------- */
const blueDestroyed = WS.computeBlsStatusB(wsStub([
    blueAt(...ON_BEACH, { status: 'DESTROYED' })
]));
ok('DESTROYED BLUE (only unit) near BLS → BLS-1 is STAGED', blueDestroyed && blueDestroyed['BLS-1'] === 'STAGED');

const blueDestroyedRedPresent = WS.computeBlsStatusB(wsStub([
    blueAt(...ON_BEACH, { status: 'DESTROYED' }),
    redAt(...ON_BEACH)
]));
ok('DESTROYED BLUE + RED at BLS → BLS-1 is SECURED (RED only counts)', blueDestroyedRedPresent && blueDestroyedRedPresent['BLS-1'] === 'SECURED');

/* 12. STAGED: BLUE is off_map -------------------------------------------- */
const blueOffmap = WS.computeBlsStatusB(wsStub([
    blueAt(...ON_BEACH, { off_map: true })
]));
ok('off_map BLUE (only unit) near BLS → BLS-1 is STAGED', blueOffmap && blueOffmap['BLS-1'] === 'STAGED');

const blueOfmapRedPresent = WS.computeBlsStatusB(wsStub([
    blueAt(...ON_BEACH, { off_map: true }),
    redAt(...ON_BEACH)
]));
ok('off_map BLUE + RED at BLS → BLS-1 is SECURED (RED only counts)', blueOfmapRedPresent && blueOfmapRedPresent['BLS-1'] === 'SECURED');

/* 13. Multiple BLS: independent resolution -------------------------------- */
const twoBls = WS.computeBlsStatusB({
    degraded: false,
    lines: { bls: [
        { id: 'BLS-1', position: [19.12, 30.536] },  // RED only
        { id: 'BLS-2', position: [19.50, 30.536] },  // BLUE only (~20 nm east)
    ]},
    units: [
        redAt(19.12, 30.536),   // at BLS-1
        blueAt(19.50, 30.536)   // at BLS-2
    ]
});
ok('multi-BLS: BLS-1 SECURED, BLS-2 DENIED independently',
   twoBls && twoBls['BLS-1'] === 'SECURED' && twoBls['BLS-2'] === 'DENIED');

// Three BLS far apart (≥40nm each) with units positioned to test all 3 statuses
const threeBlsArc = WS.computeBlsStatusB({
    degraded: false,
    lines: { bls: [
        { id: 'BLS-A', position: [19.00, 30.5] },  // BLUE only
        { id: 'BLS-B', position: [19.90, 30.5] },  // both RED and BLUE
        { id: 'BLS-C', position: [20.80, 30.5] },  // RED only
    ]},
    units: [
        redAt(19.90, 30.5),     // at BLS-B
        redAt(20.80, 30.5),     // at BLS-C
        blueAt(19.00, 30.5),    // at BLS-A
        blueAt(19.95, 30.5)     // near BLS-B (within 10nm, same position as RED)
    ]
});
ok('three BLS arc: DENIED, CONTESTED, SECURED resolve correctly',
   threeBlsArc && threeBlsArc['BLS-A'] === 'DENIED' &&
   threeBlsArc['BLS-B'] === 'CONTESTED' &&
   threeBlsArc['BLS-C'] === 'SECURED');

/* 14. W3 scenario: STAGED → SECURED → CONTESTED arc ----------------------- */
// W3 step 0: RED offshore (far), BLUE onshore (far away from RED).
const ws0 = WS.deriveWorldState(w3, 0);
ok('W3 step 0: BLS-1 STAGED (no units near beach)',
   ws0.derived.bls_status && ws0.derived.bls_status['BLS-1'] === 'STAGED');

// W3 step 3-4: RED enters BLS radius (~10nm). BLUE is at ~10.4nm (just outside 10nm).
// Control framing: RED within radius, BLUE outside → SECURED.
const ws3 = WS.deriveWorldState(w3, 3);
ok('W3 step 3: BLS-1 SECURED (RED within radius, BLUE just outside)',
   ws3.derived.bls_status && ws3.derived.bls_status['BLS-1'] === 'SECURED');

// W3 step 5+: RED and BLUE both near BLS.
// Expected: CONTESTED (both fighting).
const ws5 = WS.deriveWorldState(w3, 5);
ok('W3 step 5: BLS-1 CONTESTED (RED and BLUE both near beach)',
   ws5.derived.bls_status && ws5.derived.bls_status['BLS-1'] === 'CONTESTED');

// Later steps: RED inland, BLUE remains or leaves.
// Expected: may revert to STAGED if both move away, or DENIED if BLUE holds and RED is inland.
const ws12 = WS.deriveWorldState(w3, 12);
const s12 = ws12.derived.bls_status && ws12.derived.bls_status['BLS-1'];
ok('W3 step 12: BLS-1 is a valid control state (any of STAGED/SECURED/DENIED/CONTESTED)',
   ['STAGED', 'SECURED', 'DENIED', 'CONTESTED'].includes(s12));

/* 15. No mutation of input ----------------------------------------------- */
const inputWs = wsStub([redAt(...ON_BEACH), blueAt(...ON_BEACH)]);
const frozen  = JSON.stringify(inputWs);
WS.computeBlsStatusB(inputWs);
ok('computeBlsStatusB does not mutate its input', JSON.stringify(inputWs) === frozen);

/* 16. No forbidden side effects ------------------------------------------ */
ok('no fetch / journal / window.units mutation in world-state.js',
   !/fetch\(|\/api\/sim\/|appendCommit|window\.units\s*=/.test(WS_JS));
ok('computeBlsStatusB defined in world-state.js',
   /function\s+computeBlsStatusB\b/.test(WS_JS));

console.log(`\nPR-WS-BLS-B: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
