/* test-ws2_5-derived-objective-status.js — PR-WS2.5 (no server).
 *
 * WS2.5 relocates the objective-status evidence rule from the renderer into the
 * World State layer as a GENERIC derived-field rule (Inputs → Rule → Output),
 * read by the renderer. World State owns the derivation; no new formula, no
 * mutation, no decisions. This test asserts:
 *   1. The relocated rule is byte-for-byte equivalent to the original renderer
 *      rule across a matrix of inputs (incl. all CAPTURED re-litigation edges).
 *   2. deriveWorldState self-computes derived.objective_status_display.
 *   3. W3 per-step parity: display == baseline for every step (no regression).
 *   4. Live-projection parity: projecting adjudicated inputs + applyDerivations
 *      reproduces the original rule's output.
 *   5. The pattern is generic (DERIVATIONS registry + applyDerivations runner).
 *   6. Static wiring in world-state.js + adjudicator-map.js; no mutation/fetch.
 * Run: node test-ws2_5-derived-objective-status.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const WS = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
const w3 = require(path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'));
const MAP_JS = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const WS_JS  = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('PR-WS2.5 — Derived Objective Status (rule relocated into World State)');

/* ---- REFERENCE: the ORIGINAL renderer rule, verbatim (the parity oracle) -- */
function refParseFr(s) { if (typeof s !== 'string') return null; const m = s.match(/^(\d{1,2}(?:\.\d)?):1/); return m ? Number(m[1]) : null; }
function refRule(objective_status, force_ratio, lc) {
    const status = objective_status || 'DORMANT';
    if (status !== 'CAPTURED') return status;
    const fr = String(force_ratio || '');
    lc = lc || {};
    const blueLost = Number(lc.blue_destroyed) || 0;
    const blueTotal = Number(lc.blue_total) || 39;
    const redCoyEq = Number(lc.red_company_equivalent) || 0;
    const frBlocks = /\b(below\s+decisive|not\s+engaged|N\/A)\b/i.test(fr);
    const frNum = refParseFr(fr);
    const frNumBlocks = (frNum !== null && frNum < 2);
    const blueIntact = (blueLost / blueTotal) < 0.25;
    const redSpent = redCoyEq > 6;
    if (frBlocks || frNumBlocks || blueIntact || redSpent) return 'DENIED';
    return status;
}
// Run the WS rule via a snapshot stub.
function wsRule(objective_status, force_ratio, lc) {
    return WS.computeObjectiveStatusDisplay({ derived: { objective_status }, balance: { force_ratio, losses: lc } });
}

/* 1. Function equivalence matrix ----------------------------------------- */
const STATUSES = ['CAPTURED', 'DENIED', 'CONTESTED', 'THREATENED', 'DORMANT', null];
const FRS = ['5:1', '3:1', '1.5:1', '1.9:1', '2:1', 'below decisive', 'not engaged', 'N/A', '', null];
const LOSSES = [
    { blue_destroyed: 0, blue_total: 39, red_company_equivalent: 0 },   // blue intact
    { blue_destroyed: 20, blue_total: 39, red_company_equivalent: 0 },  // blue heavy
    { blue_destroyed: 20, blue_total: 39, red_company_equivalent: 8 },  // red spent
    {},                                                                 // empty → defaults
    null
];
let matchAll = true, cells = 0;
for (const st of STATUSES) for (const fr of FRS) for (const lc of LOSSES) {
    cells++;
    if (refRule(st, fr, lc) !== wsRule(st, fr, lc)) { matchAll = false; }
}
ok(`WS rule == original rule across ${cells} input combinations`, matchAll);
// Spot the key CAPTURED edges explicitly.
ok('CAPTURED + FR 1.5:1 → DENIED', wsRule('CAPTURED', '1.5:1', {blue_destroyed:20,blue_total:39,red_company_equivalent:0}) === 'DENIED');
ok('CAPTURED + blue intact → DENIED', wsRule('CAPTURED', '5:1', {blue_destroyed:0,blue_total:39}) === 'DENIED');
ok('CAPTURED + red spent → DENIED', wsRule('CAPTURED', '5:1', {blue_destroyed:20,blue_total:39,red_company_equivalent:8}) === 'DENIED');
ok('CAPTURED + decisive FR + blue bloodied + red not spent → CAPTURED',
   wsRule('CAPTURED', '5:1', {blue_destroyed:20,blue_total:39,red_company_equivalent:0}) === 'CAPTURED');
ok('non-CAPTURED passes through (CONTESTED)', wsRule('CONTESTED', '1:1', {}) === 'CONTESTED');

/* 2. deriveWorldState self-computes the display field --------------------- */
const ws0 = WS.deriveWorldState(w3, 0);
ok('snapshot carries derived.objective_status_display', ws0.derived && 'objective_status_display' in ws0.derived);
ok('snapshot exposes the rule inputs (balance.force_ratio + balance.losses)',
   ws0.balance && 'force_ratio' in ws0.balance && ws0.balance.losses && 'blue_destroyed' in ws0.balance.losses);

/* 3. W3 per-step parity --------------------------------------------------- */
let stepParity = true, capturedSeen = 0;
for (let i = 0; i < w3.steps.length; i++) {
    const ws = WS.deriveWorldState(w3, i);
    const raw = w3.steps[i].objective_status_baseline || null;
    if (raw === 'CAPTURED') capturedSeen++;
    // display must equal the original rule applied to the SAME projected inputs
    const expected = refRule(ws.derived.objective_status, ws.balance.force_ratio, ws.balance.losses);
    if (ws.derived.objective_status_display !== expected) stepParity = false;
}
ok(`objective_status_display == original-rule output for all ${w3.steps.length} W3 steps`, stepParity);
console.log(`    (note: ${capturedSeen} W3 baseline step(s) are CAPTURED; rest pass through)`);

/* 4. Live-projection parity (adjudicated inputs) -------------------------- */
// Simulate the applyState projection: a CAPTURED state contradicted by evidence.
const wsLive = WS.deriveWorldState(w3, 0);
wsLive.derived.objective_status = 'CAPTURED';
wsLive.balance.force_ratio = '1.5:1';
wsLive.balance.losses = { blue_destroyed: 0, blue_total: 39, red_company_equivalent: 0 };
WS.applyDerivations(wsLive);
ok('applyDerivations recomputes display from projected live inputs',
   wsLive.derived.objective_status_display === refRule('CAPTURED', '1.5:1', { blue_destroyed: 0, blue_total: 39, red_company_equivalent: 0 }));
ok('  → that value is DENIED (evidence overrules)', wsLive.derived.objective_status_display === 'DENIED');

/* 5. Generic pattern ------------------------------------------------------ */
ok('DERIVATIONS registry exists with the objective rule',
   WS.DERIVATIONS && typeof WS.DERIVATIONS.objective_status_display === 'function');
ok('applyDerivations runs every registered rule into ws.derived', (() => {
    const stub = { derived: { objective_status: 'CONTESTED' }, balance: {} };
    const out = WS.applyDerivations(stub);
    return out.derived.objective_status_display === 'CONTESTED';
})());
ok('applyDerivations is pure-ish (no throw on minimal snapshot)',
   (() => { try { WS.applyDerivations({}); WS.applyDerivations(null); return true; } catch (_) { return false; } })());

/* 6. Static wiring + boundary -------------------------------------------- */
ok('world-state.js defines computeObjectiveStatusDisplay', /function\s+computeObjectiveStatusDisplay\s*\(/.test(WS_JS));
ok('world-state.js DERIVATIONS table present', /var\s+DERIVATIONS\s*=\s*\{[\s\S]*?objective_status_display/.test(WS_JS));
ok('deriveWorldState calls applyDerivations', /applyDerivations\(ws\)\s*;\s*\n\s*return ws/.test(WS_JS));
ok('map projects force_ratio + losses then calls applyDerivations',
   /ws\.balance\.force_ratio\s*=\s*state\.force_ratio[\s\S]*?applyDerivations\(ws\)/.test(MAP_JS));
ok('map deriveDisplayOutcome reads objective_status_display',
   /ws\.derived\.objective_status_display\)\s*\{\s*\n\s*return ws\.derived\.objective_status_display/.test(MAP_JS));
ok('no mutation/fetch/journal added in the WS rule layer',
   !/fetch\(|\/api\/sim\/|appendCommit|window\.units\s*=/.test(WS_JS.split('deriveWorldState')[1] || WS_JS));

console.log(`\nPR-WS2.5: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
