'use strict';
// test-detection-contacts.js — DET1 live sensor contacts on the adjudicator map.
//
// Wires the orphaned detection.js engine (computeContacts) into the live map so
// each side's sensor picture appears/fades as units move. The capabilities a
// unit "has" (sensors[]/rcs_class) come from the SAME DB-Lite catalog the
// coverage rings use (shell/world-state-db.js → AppWorldStateDB), feeding the
// SAME range model (shell/detection.js DEFAULT_DB) — never invented per overlay.
//
// Two-part check (no server, no DOM):
//   • BEHAVIOUR — enrich units via the real AppWorldStateDB, run the real
//     AppDetection.computeContacts, and assert the contacts that fall out:
//     in-range air target is seen by both sides; far units see nothing; own
//     side is never a contact; the catalog gives an air_defense unit a radar.
//   • SOURCE    — grep adjudicator-map.js + cesium-view.js + adjudicator-hud.js
//     + app.html to assert OFF by default, read-only (no mutation), no
//     fabricated combat fields, toggle + API, per-step wiring, and 2D/3D lock-step.
const fs   = require('fs');
const path = require('path');
const MAP  = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const CES  = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/cesium-view.js'), 'utf8');
const HUD  = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-hud.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');
const DET  = require('./UI_MOdified/client/shell/detection.js');
const DB1  = require('./UI_MOdified/client/shell/world-state-db.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }

// Mirror the map's buildDetectionUnits → computeContacts pipeline (enrich via
// the real catalog, then run the real engine).
function contactsFor(rawUnits) {
    const units = rawUnits.map((u) => DB1.enrichUnit(u));
    return DET.computeContacts({ units });
}

console.log('\n─── A. detection.js fires on enriched units (the live picture) ───');
// Red air-defense (long_range_3d radar) vs a nearby Blue aircraft (high → over
// the radar horizon). Both should hold a firm contact on each other.
const near = contactsFor([
    { uid: 'RED_AD',  side: 'red',  role: 'sam_s300', domain: 'ground' },
    { uid: 'BLUE_AC', side: 'blue', role: 'fighter',  domain: 'air' },
].map((u, i) => Object.assign(u, { position: i === 0 ? [10.0, 32.0] : [10.3, 32.0] })));
const redSeesBlue = near.find((c) => c.detected_by_side === 'red' && c.target_uid === 'BLUE_AC');
const blueSeesRed = near.find((c) => c.detected_by_side === 'blue' && c.target_uid === 'RED_AD');
ok('A1 Red air-defense holds a contact on the nearby Blue aircraft', !!redSeesBlue, JSON.stringify(near));
ok('A2 Blue aircraft holds a contact on the Red air-defense', !!blueSeesRed);
ok('A3 a firm contact exists at close range', near.some((c) => c.confidence === 'firm'), JSON.stringify(near.map((c) => c.confidence)));
ok('A4 contacts carry a method (radar/esm)', near.every((c) => c.method === 'radar' || c.method === 'esm'));

console.log('\n─── B. range + EMCON + own-side gating ───');
// Far apart → nothing detected (range beyond effective detection range).
const far = contactsFor([
    { uid: 'RED_AD',  side: 'red',  role: 'sam_s300', domain: 'ground', position: [10.0, 32.0] },
    { uid: 'BLUE_AC', side: 'blue', role: 'fighter',  domain: 'air',    position: [25.0, 32.0] },
]);
ok('B1 units far apart hold NO contact', far.length === 0, JSON.stringify(far));
// Two units on the SAME side, close together → never a contact (own side).
const sameSide = contactsFor([
    { uid: 'RED_AD',  side: 'red', role: 'sam_s300', domain: 'ground', position: [10.0, 32.0] },
    { uid: 'RED_AC',  side: 'red', role: 'fighter',  domain: 'air',    position: [10.3, 32.0] },
]);
ok('B2 same-side units are never contacts', sameSide.length === 0, JSON.stringify(sameSide));
// A generic (unclassifiable) unit gets no sensors from the catalog → it holds
// no contacts; nothing is invented for it.
const generic = contactsFor([
    { uid: 'RED_X',   side: 'red',  role: 'liaison_det', domain: '',  position: [10.0, 32.0] },
    { uid: 'BLUE_AC', side: 'blue', role: 'fighter', domain: 'air',   position: [10.3, 32.0] },
]);
ok('B3 generic (sensorless) unit holds no contacts', !generic.some((c) => c.detected_by_side === 'red'),
   JSON.stringify(generic));

console.log('\n─── C. capabilities come from the catalog, not the overlay ───');
ok('C1 catalog classifies an SAM as air_defense', DB1.classifyKind({ role: 'sam_s300', domain: 'ground' }) === 'air_defense');
const ad = DB1.enrichUnit({ role: 'sam_s300', domain: 'ground' });
ok('C2 enrichment gives it a long_range_3d radar', (ad.sensors || []).some((s) => s.class === 'long_range_3d'));
ok('C3 detection.js DB-Lite knows that sensor class', !!DET.DEFAULT_DB.sensor_class.long_range_3d);

// The 2D renderer block only (build/clear/render contacts, before clearScenario).
const fn = MAP.slice(MAP.indexOf('function buildDetectionUnits'), MAP.indexOf('function clearScenario'));

console.log('\n─── D. 2D adjudicator-map.js — engine-driven, off, read-only ───');
ok('D1 calls the real detection engine', /AppDetection[\s\S]*computeContacts/.test(fn));
ok('D2 enriches units via the committed DB1 catalog (AppWorldStateDB.enrichUnit)',
   /AppWorldStateDB[\s\S]*enrichUnit/.test(fn));
ok('D3 OFF by default', /let detectionContactsEnabled = false/.test(MAP));
ok('D4 no-op when toggle off', /if \(!detectionContactsEnabled[^\n]*\) return;/.test(fn));
ok('D5 feeds the engine [lon, lat] (not [lat, lon])', /position:\s*\[ll\.lng,\s*ll\.lat\]/.test(fn));
ok('D6 skips not-yet-appeared + destroyed units (no ghost contacts)',
   /stepIndex < \(meta\.appear \|\| 0\)/.test(fn) && /UNIT_STATUS\.DESTROYED/.test(fn));
ok('D7 read-only: no scenario mutation, no setLatLng, no fetch/storage',
   !/setLatLng/.test(fn) && !/_step_coords\s*=/.test(fn) && !/\bfetch\(|localStorage|sessionStorage/.test(fn));
ok('D8 no fabricated combat-state fields (ammo/fuel/readiness/combat_power/sortie)',
   !/(\bammo\b|\bfuel\b|\breadiness\b|\bcombat_power\b|\bsortie)/i.test(fn));
ok('D9 confidence drives the visual (firm vs tentative)', /c\.confidence === 'firm'/.test(fn));
ok('D10 contacts ride a non-interactive, dedicated pane',
   /CONTACTS_PANE/.test(fn) && /rmoozContactsPane/.test(MAP) && /pointerEvents = 'none'/.test(MAP));
ok('D11 toggle + setter + visibility + getter on the public API',
   /toggleDetectionContacts:/.test(MAP) && /setDetectionContacts:/.test(MAP)
   && /isDetectionContactsVisible:/.test(MAP) && /getDetectionContacts:/.test(MAP));
ok('D12 wired into the per-step pipeline (after rings)', /renderDetectionContacts\(state\);/.test(MAP));
ok('D13 reset on clearScenario', /detectionContacts = \[\];/.test(MAP));
ok('D14 detection engine + capability catalog loaded in app.html',
   /shell\/detection\.js/.test(HTML) && /shell\/world-state-db\.js/.test(HTML));

console.log('\n─── E. HUD toggle button ───');
ok('E1 contacts button exists', /id="wg-adj-contacts-btn"/.test(HUD));
ok('E2 click drives the map toggle (single source of truth)',
   /wg-adj-contacts-btn'\)/.test(HUD) && /toggleDetectionContacts\(\)/.test(HUD));

console.log('\n─── F. Cesium 3D parity (keep-3d-in-sync) ───');
ok('F1 render + clear defined in cesium-view.js',
   /function renderDetectionContacts\(state\)/.test(CES) && /function clearDetectionContacts\(\)/.test(CES));
ok('F2 3D reuses the 2D engine result (no independent detection model)',
   /isDetectionContactsVisible\(\)/.test(CES) && /getDetectionContacts\(state\)/.test(CES));
ok('F3 ground-clamped points, cleared each applyState',
   /CLAMP_TO_GROUND/.test(CES) && /clearDetectionContacts\(\);/.test(CES));
ok('F4 2D toggle refreshes the 3D view when visible',
   /AppCesiumView[\s\S]*renderDetectionContacts/.test(MAP));

console.log('\n═══════════════════════════════════════════════');
console.log('  Detection Contacts (DET1) — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
