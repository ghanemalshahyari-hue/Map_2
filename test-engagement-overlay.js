'use strict';
// test-engagement-overlay.js — ENG1 live firing solutions on the adjudicator map.
//
// Wires the orphaned engagement.js engine (computeEngagements) into the live map
// so the operator sees WHO CURRENTLY HAS A VALID SHOT at whom — a detection-gated,
// WRA/range/ammo/fire-control-gated firing picture. Reuses the SAME enriched units
// + contacts the DET1 overlay feeds (shell/world-state-db.js → shell/detection.js),
// then runs shell/engagement.js. These are COMPUTED firing solutions, distinct from
// the scenario's authored engagement_arcs (adjudicated kill outcomes).
//
// Two-part check (no server, no DOM):
//   • BEHAVIOUR — enrich units (real AppWorldStateDB), run real computeContacts +
//     computeEngagements, and assert the firing picture: in-range detected target
//     is engaged with a salvo Pk; detected-but-out-of-range is blocked; undetected
//     yields no record; WRA hold blocks; weaponless/own-side never shoot.
//   • SOURCE    — grep adjudicator-map.js + cesium-view.js + adjudicator-hud.js +
//     app.html for OFF-by-default, read-only, no fabrication, toggle + API,
//     per-step wiring, and 2D/3D lock-step.
const fs   = require('fs');
const path = require('path');
const MAP  = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const CES  = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/cesium-view.js'), 'utf8');
const HUD  = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-hud.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');
const DET  = require('./UI_MOdified/client/shell/detection.js');
const ENG  = require('./UI_MOdified/client/shell/engagement.js');
const DB1  = require('./UI_MOdified/client/shell/world-state-db.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }

// Mirror the map's pipeline: enrich (catalog) → contacts (DET1) → engagements (ENG1).
function engagementsFor(rawUnits) {
    const units = rawUnits.map((u) => DB1.enrichUnit(u));
    const contacts = DET.computeContacts({ units });
    return ENG.computeEngagements({ units }, contacts);
}
const RED_AD  = (pos, extra) => Object.assign({ uid: 'RED_AD',  side: 'red',  role: 'sam_s300', domain: 'ground', position: pos }, extra || {});
const BLUE_AC = (pos)        => ({ uid: 'BLUE_AC', side: 'blue', role: 'fighter', domain: 'air', position: pos });

console.log('\n─── A. in-range, detected target → engaged with a salvo Pk ───');
const near = engagementsFor([RED_AD([10.0, 32.0]), BLUE_AC([10.3, 32.0])]);
const shot = near.find((r) => r.status === 'engaged' && r.side === 'red' && r.target === 'BLUE_AC');
ok('A1 Red air-defense engages the nearby Blue aircraft', !!shot, JSON.stringify(near));
ok('A2 the shot has a salvo Pk in (0,1]', !!shot && shot.pk_kill > 0 && shot.pk_kill <= 1, shot && shot.pk_kill);
ok('A3 the shot reports salvo + rounds remaining', !!shot && shot.salvo > 0 && Number.isFinite(shot.rounds_remaining));
ok('A4 weaponless aircraft never shoots back (no blue engaged record)',
   !near.some((r) => r.status === 'engaged' && r.side === 'blue'));

console.log('\n─── B. detection + range + WRA gating (every non-shot is explained) ───');
// Detected (firm) but beyond the weapon's effective range → blocked out_of_range.
const midNm = 80; const dLon = midNm / (60 * Math.cos(32 * Math.PI / 180));
const mid = engagementsFor([RED_AD([10.0, 32.0]), BLUE_AC([10.0 + dLon, 32.0])]);
const oor = mid.find((r) => r.side === 'red' && r.target === 'BLUE_AC');
ok('B1 detected-but-far target is blocked, reason out_of_range', !!oor && oor.status === 'blocked' && oor.reason === 'out_of_range', JSON.stringify(mid));
ok('B2 nothing is "engaged" at that range', !mid.some((r) => r.status === 'engaged'));
// Undetected (far beyond sensor reach) → no engagement record at all (detection-gated).
const far = engagementsFor([RED_AD([10.0, 32.0]), BLUE_AC([25.0, 32.0])]);
ok('B3 undetected target yields no engagement record', far.length === 0, JSON.stringify(far));
// WRA hold blocks a shot that would otherwise fire.
const held = engagementsFor([
    RED_AD([10.0, 32.0], { weapons: [{ id: 'sam', class: 'long_range_sam', mount: 'm1', wra: { hold: true } }] }),
    BLUE_AC([10.3, 32.0]),
]);
const holdRec = held.find((r) => r.side === 'red' && r.target === 'BLUE_AC');
ok('B4 weapons-hold blocks the shot, reason weapons_hold', !!holdRec && holdRec.status === 'blocked' && holdRec.reason === 'weapons_hold', JSON.stringify(held));

console.log('\n─── C. own-side + generic gating ───');
const sameSide = engagementsFor([RED_AD([10.0, 32.0]), { uid: 'RED_AC', side: 'red', role: 'fighter', domain: 'air', position: [10.3, 32.0] }]);
ok('C1 same-side units never engage each other', !sameSide.some((r) => r.status === 'engaged'), JSON.stringify(sameSide));
const generic = engagementsFor([{ uid: 'RED_X', side: 'red', role: 'liaison_det', domain: '', position: [10.0, 32.0] }, BLUE_AC([10.3, 32.0])]);
ok('C2 generic (weaponless) unit produces no engagements', generic.length === 0, JSON.stringify(generic));

// The 2D renderer block only (compute/clear/render engagements, before clearScenario).
const fn = MAP.slice(MAP.indexOf('function computeEngagementRecords'), MAP.indexOf('function clearScenario'));

console.log('\n─── D. 2D adjudicator-map.js — engine-driven, off, read-only ───');
ok('D1 calls the real engagement engine', /AppEngagement[\s\S]*computeEngagements/.test(fn));
ok('D2 detection-gated: feeds computeEngagements the DET1 contacts', /computeContacts[\s\S]*computeEngagements/.test(fn));
ok('D3 OFF by default', /let engagementsEnabled = false/.test(MAP));
ok('D4 no-op when toggle off', /if \(!engagementsEnabled[^\n]*\) return;/.test(fn));
ok('D5 draws only the "engaged" candidates (firing solutions)', /r\.status !== 'engaged'\) continue;/.test(fn));
ok('D6 read-only: no scenario mutation, no setLatLng, no fetch/storage',
   !/setLatLng/.test(fn) && !/_step_coords\s*=/.test(fn) && !/\bfetch\(|localStorage|sessionStorage/.test(fn));
ok('D7 no fabricated combat-state fields (ammo/fuel/readiness/combat_power/sortie)',
   !/(\bammo\b|\bfuel\b|\breadiness\b|\bcombat_power\b|\bsortie)/i.test(fn));
ok('D8 lines ride a non-interactive, dedicated pane',
   /ENGAGEMENTS_PANE/.test(fn) && /rmoozEngagementsPane/.test(MAP));
ok('D9 toggle + setter + visibility + getter on the public API',
   /toggleEngagements:/.test(MAP) && /setEngagements:/.test(MAP)
   && /isEngagementsVisible:/.test(MAP) && /getEngagements:/.test(MAP));
ok('D10 wired into the per-step pipeline (after contacts)', /renderEngagements\(state\);/.test(MAP));
ok('D11 reset on clearScenario', /engagementLines = \[\];/.test(MAP));
ok('D12 detection + engagement engines + catalog loaded in app.html',
   /shell\/detection\.js/.test(HTML) && /shell\/engagement\.js/.test(HTML) && /shell\/world-state-db\.js/.test(HTML));

console.log('\n─── E. HUD toggle button ───');
ok('E1 firing-solutions button exists', /id="wg-adj-eng-btn"/.test(HUD));
ok('E2 click drives the map toggle (single source of truth)',
   /wg-adj-eng-btn'\)/.test(HUD) && /toggleEngagements\(\)/.test(HUD));

console.log('\n─── F. Cesium 3D parity (keep-3d-in-sync) ───');
ok('F1 render + clear defined in cesium-view.js',
   /function renderEngagements\(state\)/.test(CES) && /function clearEngagements\(\)/.test(CES));
ok('F2 3D reuses the 2D engine result (no independent engagement model)',
   /isEngagementsVisible\(\)/.test(CES) && /getEngagements\(state\)/.test(CES));
ok('F3 ground-clamped lines, cleared each applyState',
   /clampToGround:\s*true/.test(CES) && /clearEngagements\(\);/.test(CES));
ok('F4 2D toggle refreshes the 3D view when visible',
   /AppCesiumView[\s\S]*renderEngagements/.test(MAP));

console.log('\n═══════════════════════════════════════════════');
console.log('  Engagement Overlay (ENG1) — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
