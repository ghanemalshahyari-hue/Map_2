'use strict';
// test-coverage-rings.js — CMO-style coverage/threat rings, DB-driven.
//
// Radii come from the SAME range model the sim engine uses — the RMOOZ DB-Lite
// (shell/detection.js sensor_class[].ref_range_nm + shell/engagement.js
// weapon_class[].max_range_nm) — NOT invented per-domain/echelon numbers.
// Capability classification (role/domain → sensors[]/weapons[]) comes from the
// committed DB-Lite catalog (shell/world-state-db.js → AppWorldStateDB), the
// SAME classifier the detection/engagement engines use — NOT a parallel role
// table in the renderer. Resolution: explicit km → declared components →
// catalog enrichment → DB range by class.
//
// Two-part check (no server, no DOM):
//   • BEHAVIOUR — replicate the DB-driven coverageRingRadiiKm (enriching via the
//     real AppWorldStateDB) and assert it returns the DB's km (nm×1.852); and
//     that the in-file fallback mirror equals the LIVE DB.
//   • SOURCE    — grep adjudicator-map.js + cesium-view.js + adjudicator-hud.js
//     to assert global (no w3-rich gate), OFF by default, DB-sourced via the
//     catalog (no parallel role table), no fabricated combat fields, toggle +
//     API, and 2D/3D lock-step.
const fs   = require('fs');
const path = require('path');
const MAP = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const CES = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/cesium-view.js'), 'utf8');
const HUD = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-hud.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');
const DET = require('./UI_MOdified/client/shell/detection.js');
const ENG = require('./UI_MOdified/client/shell/engagement.js');
const DB1 = require('./UI_MOdified/client/shell/world-state-db.js');
global.window = global.window || {};
global.window.AppWorldStateDB = DB1;   // the renderer reads it off window

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }
function eq(name, got, want) { ok(name + ' (=' + want + ')', got === want, 'got ' + got); }

// ── Replicated DB-driven model — MUST mirror adjudicator-map.js ──────────────
const NM_TO_KM = 1.852;
const SDB = DET.DEFAULT_DB.sensor_class;     // live DB
const WDB = ENG.DEFAULT_WPN_DB.weapon_class; // live DB
function ringEnrich(ud) {
    if (global.window.AppWorldStateDB && typeof global.window.AppWorldStateDB.enrichUnit === 'function') {
        try { return global.window.AppWorldStateDB.enrichUnit(ud) || ud; } catch (_) { return ud; }
    }
    return ud;
}
function coverageRingRadiiKm(ud) {
    ud = ud || {};
    let sensorKm = Number.isFinite(ud.sensor_range_km) ? ud.sensor_range_km : null;
    let weaponKm = Number.isFinite(ud.weapon_range_km) ? ud.weapon_range_km
                 : (Number.isFinite(ud.threat_range_km) ? ud.threat_range_km : null);
    let sensorClass = null, weaponClass = null;
    const eu = (sensorKm === null || weaponKm === null) ? ringEnrich(ud) : ud;
    if (sensorKm === null && Array.isArray(eu.sensors) && eu.sensors.length) {
        let best = 0, bestCls = null;
        for (const s of eu.sensors) {
            const cls = s && s.class;
            const nm = (s && Number.isFinite(s.ref_range_nm) && s.ref_range_nm)
                    || (cls && SDB[cls] && SDB[cls].ref_range_nm) || 0;
            if (nm > best) { best = nm; bestCls = cls || bestCls; }
        }
        if (best > 0) { sensorKm = best * NM_TO_KM; sensorClass = bestCls; }
    }
    if (weaponKm === null && Array.isArray(eu.weapons) && eu.weapons.length) {
        let best = 0, bestCls = null;
        for (const w of eu.weapons) {
            const cls = w && w.class;
            const nm = (cls && WDB[cls] && WDB[cls].max_range_nm) || 0;
            if (nm > best) { best = nm; bestCls = cls; }
        }
        if (best > 0) { weaponKm = best * NM_TO_KM; weaponClass = bestCls; }
    }
    const r = (v) => (v == null ? 0 : Math.max(0, Math.round(v)));
    return { sensorKm: r(sensorKm), threatKm: r(weaponKm), sensorClass, weaponClass };
}
const km = (nm) => Math.round(nm * NM_TO_KM);

console.log('\n─── A. radii are the DB-Lite ranges (nm→km), via the DB1 catalog ───');
// air_defense kind: long_range_3d sensor + long_range_sam weapon
const s300 = coverageRingRadiiKm({ role: 'sam_s300', domain: 'ground' });
eq('A1 SAM (air_defense) sensor = long_range_3d (200nm)', s300.sensorKm, km(SDB.long_range_3d.ref_range_nm));
eq('A1 SAM (air_defense) weapon = long_range_sam (80nm)', s300.threatKm, km(WDB.long_range_sam.max_range_nm));
eq('A1 sensor class tagged', s300.sensorClass, 'long_range_3d');
eq('A1 weapon class tagged', s300.weaponClass, 'long_range_sam');
ok('A1 classified by the catalog as air_defense', DB1.classifyKind({ role: 'sam_s300', domain: 'ground' }) === 'air_defense');
// ground_maneuver kind: surface_search sensor + gun weapon
const arty = coverageRingRadiiKm({ role: 'artillery_bn', domain: 'ground' });
eq('A2 ground unit weapon = gun (12nm)', arty.threatKm, km(WDB.gun.max_range_nm));
eq('A2 ground unit sensor = surface_search (60nm)', arty.sensorKm, km(SDB.surface_search.ref_range_nm));
// naval_combatant kind: air_search sensor + medium_sam (longest of medium_sam/point_defense)
const corv = coverageRingRadiiKm({ role: 'corvette', domain: 'naval' });
eq('A3 naval unit weapon = medium_sam (30nm, longest mounted)', corv.threatKm, km(WDB.medium_sam.max_range_nm));
eq('A3 naval unit sensor = air_search (160nm)', corv.sensorKm, km(SDB.air_search.ref_range_nm));
// air_unit kind: multifunction sensor, no weapon ring
const air = coverageRingRadiiKm({ role: 'fighter', domain: 'air' });
eq('A4 air unit sensor = multifunction (150nm)', air.sensorKm, km(SDB.multifunction.ref_range_nm));
eq('A4 air unit has no weapon ring', air.threatKm, 0);
// generic kind (no role keyword, no domain): catalog gives empty components → no rings, nothing invented
const unknown = coverageRingRadiiKm({ role: 'liaison_det', domain: '' });
ok('A5 unclassifiable unit → generic → no rings (no fabrication)', unknown.sensorKm === 0 && unknown.threatKm === 0);
ok('A5 catalog classifies it generic', DB1.classifyKind({ role: 'liaison_det', domain: '' }) === 'generic');

console.log('\n─── B. data-resolution precedence ───');
const explicit = coverageRingRadiiKm({ role: 'sam_s300', sensor_range_km: 42, weapon_range_km: 17 });
eq('B1 explicit sensor_range_km wins over catalog', explicit.sensorKm, 42);
eq('B1 explicit weapon_range_km wins over catalog', explicit.threatKm, 17);
// authored components must survive enrichment (enrichUnit never overwrites them)
const comp = coverageRingRadiiKm({ role: 'artillery_bn', domain: 'ground',
    sensors: [{ class: 'air_search' }], weapons: [{ class: 'long_range_sam' }] });
eq('B2 authored sensor wins over catalog default (air_search 160nm)', comp.sensorKm, km(SDB.air_search.ref_range_nm));
eq('B2 authored weapon wins over catalog default (long_range_sam 80nm)', comp.threatKm, km(WDB.long_range_sam.max_range_nm));
const multi = coverageRingRadiiKm({ weapons: [{ class: 'gun' }, { class: 'long_range_sam' }] });
eq('B3 multi-weapon unit uses the LONGEST range', multi.threatKm, km(WDB.long_range_sam.max_range_nm));

console.log('\n─── C. the in-file fallback mirror equals the LIVE DB ───');
function parseMirror(re, key) {
    const out = {};
    const block = MAP.slice(MAP.indexOf('RING_' + key + '_DB_FALLBACK'), MAP.indexOf('RING_' + key + '_DB_FALLBACK') + 600);
    const rx = new RegExp('(\\w+):\\s*\\{\\s*' + re + ':\\s*(\\d+)', 'g');
    let m; while ((m = rx.exec(block))) out[m[1]] = +m[2];
    return out;
}
const sMirror = parseMirror('ref_range_nm', 'SENSOR');
const wMirror = parseMirror('max_range_nm', 'WEAPON');
let sOk = true; for (const k in SDB) if (sMirror[k] !== SDB[k].ref_range_nm) sOk = false;
let wOk = true; for (const k in WDB) if (wMirror[k] !== WDB[k].max_range_nm) wOk = false;
ok('C1 sensor fallback mirror matches detection.js DEFAULT_DB', sOk, JSON.stringify(sMirror));
ok('C2 weapon fallback mirror matches engagement.js DEFAULT_WPN_DB', wOk, JSON.stringify(wMirror));

// the 2D renderer/lookup block only
const fn = MAP.slice(MAP.indexOf('const NM_TO_KM'), MAP.indexOf('function clearScenario'));

console.log('\n─── D. 2D adjudicator-map.js — global, off, DB-sourced, no fabrication ───');
ok('D1 reads ranges off the live DB modules',
   /window\.AppDetection.*DEFAULT_DB.*sensor_class/s.test(fn) && /window\.AppEngagement.*DEFAULT_WPN_DB.*weapon_class/s.test(fn));
ok('D2 nm→km conversion (NM_TO_KM = 1.852)', /const NM_TO_KM = 1\.852/.test(fn));
ok('D3 classification via the committed DB1 catalog (AppWorldStateDB.enrichUnit)',
   /AppWorldStateDB[\s\S]*enrichUnit/.test(fn));
ok('D4 NO parallel role/domain/echelon radius model in the renderer',
   !/RING_ROLE_CLASS/.test(MAP) && !/RING_DOMAIN_BASE/.test(MAP) && !/RING_ECHELON_SCALE/.test(MAP));
ok('D5 OFF by default', /let coverageRingsEnabled = false/.test(MAP));
ok('D6 global/data-based — no w3-rich schema gate in the renderer',
   !/schema_variant\s*[!=]==?\s*['"]w3-rich/.test(fn));
ok('D7 no-op when toggle off', /if \(!coverageRingsEnabled[^\n]*\) return;/.test(fn));
ok('D8 tooltip shows DB provenance (the resolved class)',
   /weaponClass \? ` \[\$\{weaponClass\}\]`/.test(MAP) && /sensorClass \? ` \[\$\{sensorClass\}\]`/.test(MAP));
ok('D9 skips not-yet-appeared + destroyed units',
   /stepIndex < \(meta\.appear \|\| 0\)/.test(MAP) && /UNIT_STATUS\.DESTROYED/.test(MAP));
ok('D10 read-only: no scenario mutation, no setLatLng, no fetch/storage',
   !/setLatLng/.test(fn) && !/_step_coords\s*=/.test(fn) && !/\bfetch\(|localStorage|sessionStorage/.test(fn));
ok('D11 no fabricated combat-state fields (ammo/fuel/readiness/combat_power/sortie)',
   !/(\bammo\b|\bfuel\b|\breadiness\b|\bcombat_power\b|\bsortie)/i.test(fn));
ok('D12 toggle + setter + visibility on the public API',
   /toggleCoverageRings:/.test(MAP) && /setCoverageRings:/.test(MAP) && /isCoverageRingsVisible:/.test(MAP));
ok('D13 wired into the per-step pipeline', /renderCoverageRings\(state\);/.test(MAP));
ok('D14 DB-Lite range modules + capability catalog loaded before the map in app.html',
   /shell\/detection\.js/.test(HTML) && /shell\/engagement\.js/.test(HTML) && /shell\/world-state-db\.js/.test(HTML));

console.log('\n─── E. HUD toggle button ───');
ok('E1 rings button exists', /id="wg-adj-rings-btn"/.test(HUD));
ok('E2 click drives the map toggle (single source of truth)',
   /wg-adj-rings-btn'\)\.addEventListener/.test(HUD) && /toggleCoverageRings\(\)/.test(HUD));

console.log('\n─── F. Cesium 3D parity (keep-3d-in-sync) ───');
ok('F1 render + clear defined in cesium-view.js',
   /function renderCoverageRings\(state\)/.test(CES) && /function clearCoverageRings\(\)/.test(CES));
ok('F2 3D driven by the 2D toggle + the 2D DB lookup (no independent model)',
   /isCoverageRingsVisible\(\)/.test(CES) && /coverageRingRadiiKm\(ud\)/.test(CES));
ok('F3 reuses 2D marker position + unit-data for exact parity',
   /getScenarioMarkers/.test(CES) && /m\._unitData/.test(CES));
ok('F4 ground-clamped ellipses, cleared each applyState',
   /ellipse:/.test(CES) && /CLAMP_TO_GROUND/.test(CES) && /clearCoverageRings\(\);/.test(CES));
ok('F5 2D toggle refreshes the 3D view when visible',
   /window\.AppCesiumView\.renderCoverageRings\(lastAppliedState\)/.test(MAP));

console.log('\n═══════════════════════════════════════════════');
console.log('  Coverage Rings (DB-driven) — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
