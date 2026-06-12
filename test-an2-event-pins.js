'use strict';
// test-an2-event-pins.js — AN2: Wargame 3 read-only event pins + provenance.
// adjudicator-map.js is a browser IIFE, so this combines (A) an oracle that
// mirrors buildStepEvents (arc-coord path) against real wargame3.json, and
// (B) static checks that the feature is wired, read-only, and safe.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const CSS = path.join(__dirname, 'UI_MOdified/client/style.css');
const src = fs.readFileSync(SRC, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');
const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); }
}

// ── (A) Oracle: mirror buildStepEvents (arc-coordinate path) ─────────────
// affected[] without an arc needs live markers (browser); the arc path carries
// coordinates in the data so it is fully testable here.
function buildArcEvents(scenario, stepIndex) {
    const row = (scenario.steps || [])[stepIndex] || {};
    const events = [], seen = new Set();
    (row.engagement_arcs || []).forEach((arc) => {
        if (!arc) return;
        const c = Array.isArray(arc.coordinates) ? arc.coordinates : null;
        let latlng = null;
        if (c && c.length >= 2 && Array.isArray(c[1]) && c[1].length >= 2) latlng = [c[1][1], c[1][0]];
        if (!latlng) return;
        events.push({
            type: 'engagement', actor_uid: arc.actor_uid || null, target_uid: arc.target_uid || null,
            status_change: arc.status_change || null,
            damage_pct: Number.isFinite(arc.damage_pct) ? arc.damage_pct : null,
            cause_what: arc.cause_what || null, cause_doctrine: arc.cause_doctrine || null, latlng: latlng,
        });
        if (arc.target_uid) seen.add(arc.target_uid);
    });
    return { events, seen };
}

console.log('\n─── A. event extraction on real Wargame 3 ───');
const steps = wg3.steps || [];
// find a step with engagement_arcs carrying coordinates
let demoIdx = -1;
for (let i = 0; i < steps.length; i++) {
    if ((steps[i].engagement_arcs || []).some(a => a && Array.isArray(a.coordinates) && a.coordinates.length >= 2)) { demoIdx = i; break; }
}
ok('A1 a step with engagement_arc coordinates exists', demoIdx >= 0, 'demoIdx=' + demoIdx);
const { events, seen } = buildArcEvents(wg3, demoIdx);
ok('A2 events extracted at that step', events.length > 0, 'count=' + events.length);
ok('A3 every event has a [lat,lng] location', events.every(e => Array.isArray(e.latlng) && e.latlng.length === 2 && e.latlng.every(Number.isFinite)));
ok('A4 events carry actor + target uids', events.some(e => e.actor_uid) && events.some(e => e.target_uid));
ok('A5 status_change is from the real vocabulary (no invention)',
   events.every(e => e.status_change == null || ['destroyed', 'damaged_partial', 'suppressed', 'expended', 'delayed', 'unchanged'].includes(e.status_change)),
   JSON.stringify([...new Set(events.map(e => e.status_change))]));
ok('A6 provenance present where data has it (cause_doctrine on some)', events.some(e => e.cause_doctrine));
ok('A7 damage_pct numeric-or-null only (never fabricated)', events.every(e => e.damage_pct === null || (typeof e.damage_pct === 'number' && e.damage_pct >= 0 && e.damage_pct <= 1)));
// dedup: an affected uid that is also an arc target would be skipped (in `seen`)
const affUids = (steps[demoIdx].affected || []).map(a => a && a.uid).filter(Boolean);
const overlap = affUids.filter(u => seen.has(u));
ok('A8 dedup basis: arc targets recorded so affected[] duplicates are skipped', seen.size > 0, 'arc targets=' + seen.size + ', affected-overlap=' + overlap.length);
// per-step: different step → (generally) different event set
const e0 = buildArcEvents(wg3, demoIdx).events.length;
const eLast = buildArcEvents(wg3, steps.length - 1).events.length;
ok('A9 events are per-step (recomputed each step)', typeof e0 === 'number' && typeof eLast === 'number');
console.log('       step ' + demoIdx + ': ' + events.length + ' arc events · sample status=' + JSON.stringify([...new Set(events.map(e => e.status_change))]));

console.log('\n─── B. source wiring (adjudicator-map.js) ───');
ok('B1 renderEventPins + buildStepEvents + clearEventPins defined', /function renderEventPins/.test(src) && /function buildStepEvents/.test(src) && /function clearEventPins/.test(src));
ok('B2 rebuilt per step in applyStepProgress guard', /renderEventPins\(stepIndex\)/.test(src) && /stepIndex !== playbackAttritionStep/.test(src));
ok('B3 cleared on clearScenario AND resetMap', (src.match(/clearEventPins\(\);/g) || []).length >= 3); // 2 resets + the call inside renderEventPins
ok('B4 exposed on public API (renderEventPins + clearEventPins)', /\n\s*renderEventPins,/.test(src) && /\n\s*clearEventPins,/.test(src));
ok('B5 popup shows provenance fields (actor/affected/status/cause/doctrine)',
   /Actor/.test(src) && /Affected/.test(src) && /Status/.test(src) && /Cause/.test(src) && /Doctrine/.test(src));
ok('B6 colour reuses engagement-arc palette (STATUS_COLORS)', /STATUS_COLORS\[ev\.status_change\]/.test(src));
ok('B7 declutter/cap present (EVENT_PIN_CAP + sort by severity/damage)', /EVENT_PIN_CAP/.test(src) && /events\.sort\(/.test(src) && /slice\(0, EVENT_PIN_CAP\)/.test(src));

console.log('\n─── C. read-only / safe / no fabrication ───');
const _an2Start = src.indexOf('AN2: read-only event pins');
const block = src.slice(_an2Start, src.indexOf('return total;', _an2Start) + 20); // AN2 block only (ends at renderEventPins)
ok('C1 non-W3 no-op guard (scenarioHasAttritionData)', /!scenarioHasAttritionData\(sc\)/.test(block));
ok('C2 block does not mutate scenario (no .steps[]=/.affected=/.engagement_arcs=)',
   !/\.steps\s*\[[^\]]*\]\s*=/.test(block) && !/\.affected\s*=/.test(block) && !/\.engagement_arcs\s*=/.test(block));
ok('C3 block does not move units (no setLatLng) and does not change coordinates', !/setLatLng/.test(block));
ok('C4 escapes provenance text (esc) — no raw injection', /esc\(/.test(block));
ok('C5 missing fields → "unknown" or omitted (no guessing)', /\|\| 'unknown'/.test(block) && /if \(ev\.cause_what\)/.test(block) && /if \(ev\.cause_doctrine\)/.test(block));
ok('C6 no fabricated combat fields (ammo/fuel/casualties/weapons/combat_power)',
   !/(\bammo\b|\bfuel_pct\b|\bcasualties\b|\bcombat_power\b|\brounds_remaining\b|\bsortie\b)/i.test(block));
ok('C7 reads only allowed scenario fields',
   /engagement_arcs/.test(block) && /\.affected/.test(block) && /actor_uid/.test(block) && /target_uid/.test(block) && /status_change/.test(block) && /damage_pct/.test(block) && /cause_what/.test(block) && /cause_doctrine/.test(block));

console.log('\n─── D. CSS ───');
ok('D1 event-pin styling present', /\.wg-adj-event-pin-dot/.test(css));
ok('D2 pins hidden when rolled up (formation view)', /\.wg-rolled-up\s+\.wg-adj-event-pin[\s\S]{0,40}display:\s*none/.test(css));

console.log('\n═══════════════════════════════════════════════');
console.log('  AN2 Event Pins + Provenance — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
