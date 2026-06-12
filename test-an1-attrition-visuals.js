'use strict';
// test-an1-attrition-visuals.js — AN1: Wargame 3 per-unit attrition visuals.
// adjudicator-map.js is a browser IIFE (window-bound), so this test combines:
//   (A) an ORACLE that replicates the documented mapping/cumulative algorithm
//       and validates its behaviour against the REAL wargame3.json, and
//   (B) STATIC checks that the source is wired + safe (no scenario mutation,
//       no fabricated combat fields, non-W3 no-op, reuses existing renderer).
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const src = fs.readFileSync(SRC, 'utf8');
const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); }
}

// ── (A) Oracle: mirror the documented mapping + cumulative algorithm ─────
const ACTIVE = 'active', DEGRADED = 'degraded', DESTROYED = 'destroyed';
function attritionStatusOf(sc) {
    if (!sc || typeof sc !== 'string') return null;
    const s = sc.toLowerCase();
    if (s === 'unchanged') return null;
    if (s.indexOf('destroy') !== -1 || s === 'killed' || s === 'sunk') return DESTROYED;
    return DEGRADED;
}
function computeStepAttrition(scenario, stepIndex) {
    const status = new Map();
    const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
    const upTo = Math.min(stepIndex, steps.length - 1);
    const consume = (uid, sc) => {
        if (!uid) return;
        const mapped = attritionStatusOf(sc);
        if (!mapped) return;
        if (status.get(uid) === DESTROYED) return;       // terminal
        status.set(uid, mapped === DESTROYED ? DESTROYED : DEGRADED);
    };
    for (let i = 0; i <= upTo; i++) {
        const row = steps[i] || {};
        (row.affected || []).forEach(a => a && consume(a.uid, a.status_change));
        (row.engagement_arcs || []).forEach(arc => arc && consume(arc.target_uid, arc.status_change));
    }
    return status;
}

console.log('\n─── A. status mapping (honest, no invention) ───');
ok('A1 destroyed → DESTROYED', attritionStatusOf('destroyed') === DESTROYED);
ok('A2 damaged_partial → DEGRADED', attritionStatusOf('damaged_partial') === DEGRADED);
ok('A3 suppressed → DEGRADED (conservative affected)', attritionStatusOf('suppressed') === DEGRADED);
ok('A4 expended → DEGRADED (conservative affected)', attritionStatusOf('expended') === DEGRADED);
ok('A5 delayed → DEGRADED (conservative affected)', attritionStatusOf('delayed') === DEGRADED);
ok('A6 unchanged → no change (active)', attritionStatusOf('unchanged') === null);
ok('A7 missing/empty → no change (no guessing)', attritionStatusOf('') === null && attritionStatusOf(undefined) === null);

console.log('\n─── B. cumulative behaviour on real Wargame 3 ───');
const steps = wg3.steps || [];
const N = steps.length;
// all affected/target uids resolve to a real unit (so markers will be found)
const unitUids = new Set([
    ...(wg3.red_units || []).map(u => u.uid),
    ...(wg3.blue_units_initial || []).map(u => u.unit_uid || u.uid),
].filter(Boolean));
const allEngagedUids = new Set();
steps.forEach(s => {
    (s.affected || []).forEach(a => a && a.uid && allEngagedUids.add(a.uid));
    (s.engagement_arcs || []).forEach(a => a && a.target_uid && allEngagedUids.add(a.target_uid));
});
const unresolved = [...allEngagedUids].filter(u => !unitUids.has(u));
ok('B1 every affected/target uid resolves to a placed unit', unresolved.length === 0, 'unresolved: ' + unresolved.slice(0, 5).join(','));

// cumulative size (degraded ∪ destroyed) is monotonic non-decreasing
let monotonic = true, prevSize = -1;
for (let i = 0; i < N; i++) {
    const sz = computeStepAttrition(wg3, i).size;
    if (sz < prevSize) monotonic = false;
    prevSize = sz;
}
ok('B2 cumulative affected count never decreases stepping forward', monotonic);

// rewind: status keys at step k are a subset of step k+1 (restore is correct)
let rewindOk = true;
for (let i = 0; i < N - 1; i++) {
    const a = computeStepAttrition(wg3, i), b = computeStepAttrition(wg3, i + 1);
    for (const uid of a.keys()) if (!b.has(uid)) rewindOk = false;
}
ok('B3 step k attrition ⊆ step k+1 (rewind restores cleanly)', rewindOk);

// DESTROYED is terminal: once destroyed at step k, destroyed at all later steps
let terminal = true;
for (let i = 0; i < N; i++) {
    const m = computeStepAttrition(wg3, i);
    for (const [uid, st] of m) {
        if (st === DESTROYED) {
            for (let j = i; j < N; j++) {
                if (computeStepAttrition(wg3, j).get(uid) !== DESTROYED) terminal = false;
            }
        }
    }
}
ok('B4 DESTROYED is terminal (never downgraded later)', terminal);

const last = computeStepAttrition(wg3, N - 1);
const destroyedCount = [...last.values()].filter(s => s === DESTROYED).length;
const degradedCount = [...last.values()].filter(s => s === DEGRADED).length;
ok('B5 final step shows real attrition (some affected units)', last.size > 0, 'size=' + last.size);
ok('B6 final step includes destroyed unit(s) from data', destroyedCount >= 1, 'destroyed=' + destroyedCount);
console.log('       (final step: ' + degradedCount + ' degraded, ' + destroyedCount + ' destroyed, ' + last.size + ' total affected of ' + unitUids.size + ' units)');

// step 0 (pre-engagement) should be light/empty relative to the final step
ok('B7 attrition grows from step 0 to final', computeStepAttrition(wg3, 0).size <= last.size);

console.log('\n─── C. source wiring (adjudicator-map.js) ───');
ok('C1 applyStepAttrition() defined', /function applyStepAttrition\s*\(/.test(src));
ok('C2 computeStepAttrition() defined + cumulative from step 0', /function computeStepAttrition/.test(src) && /for \(let i = 0; i <= upTo/.test(src));
ok('C3 hooked into applyStepProgress, guarded by step-index change', /stepIndex !== playbackAttritionStep/.test(src) && /applyStepAttrition\(stepIndex\)/.test(src));
ok('C4 reuses existing renderMarkerByStatus (same look as HUD path)', /renderMarkerByStatus\(m, st\)/.test(src));
ok('C5 reset in clearScenario AND resetMap', (src.match(/playbackAttritionStep = -1/g) || []).length >= 3); // decl + 2 resets
ok('C6 exposed on window.AppAdjudicatorMap', /\n\s*applyStepAttrition,/.test(src));

console.log('\n─── D. safety: no mutation / no invented combat data ───');
ok('D1 non-W3 no-op guard (scenarioHasAttritionData)', /function scenarioHasAttritionData/.test(src) && /!scenarioHasAttritionData\(sc\)/.test(src));
// render-state is stashed on the MARKER (m._attrition), never on scenario data
ok('D2 render-state on marker only (m._attrition), not scenario', /m\._attrition\s*=/.test(src));
// the attrition block must not assign into the scenario steps/affected arrays
const block = src.slice(src.indexOf('AN1: per-step per-unit attrition'), src.indexOf('HQ-damage propagation'));
ok('D3 attrition block does NOT mutate scenario.steps/affected/engagement_arcs',
   !/\.steps\s*\[[^\]]*\]\s*=/.test(block) && !/\.affected\s*=/.test(block) && !/\.engagement_arcs\s*=/.test(block));
ok('D4 attrition block does NOT change unit coordinates (no setLatLng)', !/setLatLng/.test(block));
ok('D5 no fabricated combat fields (ammo/fuel/casualties/weapons/combat_power)',
   !/(\bammo\b|\bfuel_pct\b|\bcasualties\b|\bcombat_power\b|\brounds_remaining\b)/i.test(block));
ok('D6 reads only existing scenario fields (affected/engagement_arcs/status_change/damage_pct)',
   /\.affected/.test(block) && /\.engagement_arcs/.test(block) && /status_change/.test(block) && /damage_pct/.test(block));

console.log('\n═══════════════════════════════════════════════');
console.log('  AN1 Per-Unit Attrition Visuals — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
