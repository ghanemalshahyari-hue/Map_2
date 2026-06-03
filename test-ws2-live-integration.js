/* test-ws2-live-integration.js — PR-WS2 static + behavioral checks (no server).
 *
 * WS2 = connect the orphaned World State substrate (WS1) to the live client and
 * route ONE render field (objective status) through it as a parity proof.
 * World State MIRRORS `state` for now (ownership stays with `state`); WS4 inverts.
 *
 * This test asserts:
 *   1. WS1 is loaded in app.html, before adjudicator-map.js.
 *   2. adjudicator-map.js wires the seam (declare/derive/reconcile/read/expose).
 *   3. PARITY: the WS1 snapshot agrees with the W3 scenario baseline per step.
 *   4. Reconciliation is a no-op: snapshot carries the LIVE `state` value verbatim.
 *   5. Degraded (non-W3) scenarios project without throwing.
 *   6. The render read is guarded (falls back to state.* when WS absent).
 * Run: node test-ws2-live-integration.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APP_HTML = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
const MAP_JS = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const WS = require(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'));
const w3 = require(path.join(ROOT, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('PR-WS2 — World State Live Integration (parity proof: objective status)');

/* 1. WS1 loaded in app.html, BEFORE the map ------------------------------- */
const wsTagIdx = APP_HTML.indexOf('shell/world-state.js');
const mapTagIdx = APP_HTML.indexOf('wargame/adjudicator-map.js');
ok('app.html loads shell/world-state.js', wsTagIdx !== -1);
ok('world-state.js loads BEFORE adjudicator-map.js', wsTagIdx !== -1 && mapTagIdx !== -1 && wsTagIdx < mapTagIdx);
// world-state-db (DB1) must still load before the map too (unchanged)
ok('world-state-db.js still loaded before the map',
   APP_HTML.indexOf('shell/world-state-db.js') !== -1 && APP_HTML.indexOf('shell/world-state-db.js') < mapTagIdx);

/* 2. adjudicator-map.js wires the seam ------------------------------------ */
ok('declares lastWorldState', /let\s+lastWorldState\s*=\s*null/.test(MAP_JS));
ok('derives via AppWorldState.deriveWorldState', /window\.AppWorldState\s*&&[\s\S]*?deriveWorldState\(/.test(MAP_JS));
ok('reconciles objective_status from live state',
   /ws\.derived\.objective_status\s*=\s*state\.objective_status/.test(MAP_JS));
ok('derive is guarded by try/catch (null fallback)',
   /try\s*\{[\s\S]*?deriveWorldState\([\s\S]*?\}\s*catch\s*\(_\)\s*\{\s*lastWorldState\s*=\s*null/.test(MAP_JS));
ok('deriveDisplayOutcome reads objective status from World State',
   /const\s+ws\s*=\s*\(lastWorldState\s*&&\s*state\s*===\s*lastAppliedState\)[\s\S]*?ws\.derived\.objective_status/.test(MAP_JS));
ok('exposes getWorldState() on the public API', /getWorldState:\s*\(\)\s*=>\s*lastWorldState/.test(MAP_JS));

/* 3. PARITY — WS1 snapshot agrees with the scenario baseline every step ---- */
let parityStatus = true, parityMeta = true, parityObj = true;
const objCoord = w3.obj && w3.obj.coord;
for (let i = 0; i < w3.steps.length; i++) {
    const ws = WS.deriveWorldState(w3, i);
    const s = w3.steps[i];
    if (ws.derived.objective_status !== (s.objective_status_baseline || null)) parityStatus = false;
    if (ws.meta.step_index !== i || ws.meta.time_label !== (s.time_label || null) || ws.meta.phase !== (s.phase || null)) parityMeta = false;
    if (objCoord && (!ws.objectives[0] || ws.objectives[0].position !== objCoord && JSON.stringify(ws.objectives[0].position) !== JSON.stringify(objCoord))) parityObj = false;
}
ok(`objective_status parity across all ${w3.steps.length} W3 steps`, parityStatus);
ok('meta (step_index/time_label/phase) tracks the live step every step', parityMeta);
ok('objective position == scenario.obj.coord every step', parityObj);

/* 4. Reconciliation is a NO-OP — snapshot carries the LIVE state value ----- */
// Replicate the applyState reconciliation against a synthetic live state whose
// objective_status DIFFERS from the baseline (simulating an LLM-adjudicated run).
function reconcile(ws, state) {
    if (state.objective_status) {
        ws.derived = ws.derived || {};
        ws.derived.objective_status = state.objective_status;
        if (ws.objectives && ws.objectives[0]) ws.objectives[0].status = state.objective_status;
    }
    return ws;
}
const baselineStep = w3.steps.findIndex(s => s.objective_status_baseline);
const wsLive = reconcile(WS.deriveWorldState(w3, Math.max(0, baselineStep)), { objective_status: 'CAPTURED' });
ok('reconciled snapshot reflects the LIVE state value, not the baseline',
   wsLive.derived.objective_status === 'CAPTURED');
ok('reconciled objectives[0].status mirrors derived.objective_status',
   wsLive.objectives[0].status === 'CAPTURED');
// And when the live value EQUALS the baseline (default W3 playback), it is identical.
const i3 = Math.max(0, baselineStep);
const wsSame = reconcile(WS.deriveWorldState(w3, i3), { objective_status: w3.steps[i3].objective_status_baseline });
ok('default playback (state==baseline) → snapshot value identical to baseline',
   wsSame.derived.objective_status === w3.steps[i3].objective_status_baseline);

/* 5. Degraded (non-W3) projects without throwing -------------------------- */
let degradedOk = true, degraded;
try {
    const dp = require(path.join(ROOT, 'UI_MOdified/data/scenarios/dp-test-001.json'));
    degraded = WS.deriveWorldState(dp, 0);
} catch (_) { degradedOk = false; }
ok('non-W3 scenario derives without throwing', degradedOk && !!degraded);
ok('non-W3 snapshot flagged degraded', degradedOk && degraded.degraded === true);

/* 6. Render read is GUARDED — legacy fallback present --------------------- */
// WS2.5 relocated the rule into World State; deriveDisplayOutcome now returns the
// WS-computed value and keeps the inline rule (starting at this line) as the
// WS-absent fallback. Assert that legacy fallback line still exists.
ok('deriveDisplayOutcome keeps state.objective_status fallback',
   /const\s+status\s*=\s*state\.objective_status\s*\|\|\s*'DORMANT'/.test(MAP_JS));

console.log(`\nPR-WS2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
