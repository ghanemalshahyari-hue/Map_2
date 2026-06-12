/* test-det1-detection.js — PR-DET1 static checks (no server).
 * Verifies the detection formulas (radar horizon, RCS range scaling, EMCON,
 * ESM passive), the contact computation on a seeded component scenario, purity,
 * and graceful degrade for W3 units that carry no sensors yet.
 * Run: node test-det1-detection.js */
'use strict';
const path = require('path');
const WS  = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state.js'));
const DET = require(path.join(__dirname, 'UI_MOdified/client/shell/detection.js'));
const w3  = require(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }
function approx(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }

console.log('PR-DET1 — detection rules (radar horizon + RCS + EMCON)');

/* 1. Radar horizon formula: 1.23(√h1+√h2), h in ft */
ok('radar horizon air(30000)+sea(60) ≈ 222.6 nm',
   approx(DET.radarHorizonNm(30000, 60), 1.23 * (Math.sqrt(30000) + Math.sqrt(60)), 1e-6));
ok('horizon grows with altitude', DET.radarHorizonNm(40000, 60) > DET.radarHorizonNm(10000, 60));

/* 2. RCS range scaling: range ∝ σ^¼ */
ok('σ = σ_ref → range = ref', approx(DET.rcsDetectRangeNm(200, 5, 5), 200, 1e-6));
ok('σ = 16·σ_ref → range ×2 (16^¼=2)', approx(DET.rcsDetectRangeNm(200, 80, 5), 400, 1e-6));
ok('stealth (tiny σ) → much shorter range',
   DET.rcsDetectRangeNm(200, 0.05, 5) < 0.5 * DET.rcsDetectRangeNm(200, 100, 5));

/* helper: build a minimal World-State-shaped scenario with component units */
function unit(uid, side, domain, pos, extra) {
    return Object.assign({ uid, side, domain, position: pos, sensors: [], weapons: [], magazines: [] }, extra || {});
}
function near(lon, lat, dNm, brg) { // offset ~dNm along bearing (rough, regional)
    var dLat = (dNm / 60) * Math.cos((brg || 0) * Math.PI / 180);
    var dLon = (dNm / 60) * Math.sin((brg || 0) * Math.PI / 180) / Math.cos(lat * Math.PI / 180);
    return [lon + dLon, lat + dLat];
}

const base = [19.0, 30.0];
const ddg = unit('RED-DDG-1', 'RED', 'sea', base, {
    sensors: [{ id: 's1', type: 'radar', class: 'long_range_3d', emcon: 'active' },
              { id: 'e1', type: 'esm', class: 'esm_intercept', emcon: 'active' }]
});
const airClose = unit('BLU-AIR-CLOSE', 'BLUE', 'air', near(base[0], base[1], 120, 90), { rcs_class: 'medium' });
const airFar   = unit('BLU-AIR-FAR',   'BLUE', 'air', near(base[0], base[1], 400, 90), { rcs_class: 'medium' });
const stealth  = unit('BLU-STEALTH',   'BLUE', 'air', near(base[0], base[1], 120, 90), { rcs_class: 'stealth' });
const wsSeed = { units: [ddg, airClose, airFar, stealth] };

/* 3. core detection */
const contacts = DET.computeContacts(wsSeed);
const det = uid => contacts.find(c => c.target_uid === uid && c.detected_by_side === 'RED');
ok('detects a medium-RCS air target in range', !!det('BLU-AIR-CLOSE'));
ok('does NOT detect the same-class target far beyond range', !det('BLU-AIR-FAR'));
ok('stealth target at same range NOT detected by radar (or only weakly)',
   !det('BLU-STEALTH') || det('BLU-STEALTH').max_range_nm < det('BLU-AIR-CLOSE').max_range_nm);
ok('contact carries range + max_range + method + confidence',
   (() => { const c = det('BLU-AIR-CLOSE'); return c && c.range_nm >= 0 && c.max_range_nm > 0 && c.method === 'radar' && c.confidence; })());
ok('no self/own-side contacts', !contacts.some(c => c.target_uid === 'RED-DDG-1'));

/* 4. EMCON: silent radar cannot detect */
const ddgSilent = JSON.parse(JSON.stringify(ddg));
ddgSilent.sensors[0].emcon = 'silent';
const cSilent = DET.computeContacts({ units: [ddgSilent, airClose] });
ok('EMCON silent radar → no radar contact',
   !cSilent.some(c => c.method === 'radar'));

/* 5. ESM passive: detect an EMITTING enemy radar (target carries its own radar) */
// 210 nm: beyond the emitter's own 200 nm radar range, within ESM's 1.5× (300)
// AND within the ~220 nm radar horizon (air ESM @30k ft vs ground emitter).
const redEmitter = unit('RED-EWR', 'RED', 'ground', near(base[0], base[1], 210, 90), {
    sensors: [{ id: 'r', type: 'radar', class: 'long_range_3d', emcon: 'active' }]
});
const blueEsm = unit('BLU-ESM', 'BLUE', 'air', base, {
    sensors: [{ id: 'e', type: 'esm', class: 'esm_intercept', emcon: 'active' }]
});
const cEsm = DET.computeContacts({ units: [redEmitter, blueEsm] });
ok('ESM detects emitting radar beyond its own radar range (1.5×)',
   cEsm.some(c => c.detected_by_side === 'BLUE' && c.target_uid === 'RED-EWR' && c.method === 'esm'));

/* 6. purity */
const snapshot = JSON.stringify(wsSeed);
DET.computeContacts(wsSeed);
ok('input world state not mutated', JSON.stringify(wsSeed) === snapshot);

/* 7. graceful degrade — real W3 units have no sensors yet → no fabricated contacts */
const wsW3 = WS.deriveWorldState(w3, 5);
const cW3 = DET.computeContacts(wsW3);
ok('W3 (no sensor components) → zero contacts, no fabrication', cW3.length === 0);
ok('empty / null input does not throw',
   (() => { try { DET.computeContacts({}); DET.computeContacts(null); return true; } catch (_) { return false; } })());

console.log(`\nPR-DET1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
