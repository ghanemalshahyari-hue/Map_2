#!/usr/bin/env node
'use strict';
/**
 * SYMBOL-FIX-1 — domain controls the synthesized symbol set.
 *
 * Ports a synthetic W3-shape all_phases bundle through the REAL public porter
 * (buildScenarioFromGeoJson) and asserts the SIDC symbol-set digits (positions
 * 5-6) for naval/air/ground units whose Arabic name starts with a formation
 * word. Domain must win the symbol set; the formation word must not pull a
 * naval/air unit onto the LAND set. No scenario names / unit IDs / coordinates
 * are hardcoded into production — only test fixtures here.
 *
 * Run:  node scripts/test-symbol-fix-1-domain-wins.js
 */
const assert = require('assert');
const path = require('path');
const PORTER = require(path.join(__dirname, '..', 'scripts', 'port-wargame.js'));

const SS_AIR = '01', SS_LAND = '10', SS_SEA = '30', SS_SUB = '35';

// Build one W3-shape unit feature (phase-tagged so the porter splits it).
function unit(uid, side, domain, type, echelon, name_ar) {
    return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [20.0, 30.0] },
        properties: {
            kind: 'unit', phase: 0, uid, side, domain, type, echelon, name_ar,
            current_strength: 1.0, initial_strength: 1.0,
        },
    };
}

// Arabic fixtures (formation-word heads + a ship/air head for the fallback).
const LIWA   = 'لواء';        // brigade (formation word)
const QIYADA = 'قيادة';       // command (formation word)
const KATIBA = 'كتيبة';       // battalion (formation word)
const FRIGATE_HEAD = 'فرقاطات'; // "frigates" (ship head)

// Each case: [uid, side, domain, type, echelon, name_ar, expectedSet, desc]
const CASES = [
    ['U-naval-liwa',   'RED',  'naval',  'landing_ship', 'bde', LIWA + ' الإبرار البحري',   SS_SEA,  '1. naval + لواء + landing_ship → sea'],
    ['U-naval-qiyada', 'RED',  'naval',  'naval_unit',   'bde', QIYADA + ' الأسطول',         SS_SEA,  '2. naval + قيادة + naval_unit → sea'],
    ['U-air-liwa',     'RED',  'air',    'strike',       'bde', LIWA + ' الطيران الهجومي',   SS_AIR,  '3. air + لواء + strike → air'],
    ['U-air-uav',      'RED',  'air',    'uav_isr',      'coy', 'وحدة الاستطلاع',            SS_AIR,  '4. air + uav_isr (no air-head name) → air'],
    ['U-ground-katiba','BLUE', 'ground', 'mech_inf',     'bn',  KATIBA + ' المشاة الآلية',   SS_LAND, '5. ground + كتيبة → land'],
    ['U-nodom-ship',   'RED',  '',       'naval_unit',   'bde', FRIGATE_HEAD,                 SS_SEA,  '6a. missing domain + ship-head → sea (fallback)'],
    ['U-nodom-katiba', 'RED',  '',       'arty',         'bn',  KATIBA + ' المدفعية',         SS_LAND, '6b. missing domain + كتيبة → land (fallback)'],
];

function buildBundle() {
    const feats = [
        // An objective so buildW3Scenario has obj context (not strictly required).
        { type: 'Feature', geometry: { type: 'Point', coordinates: [20.1, 30.1] },
          properties: { kind: 'objective', phase: 0, id: 'OBJ-X', name_en: 'Obj', name_ar: 'هدف' } },
    ];
    for (const c of CASES) feats.push(unit(c[0], c[1], c[2], c[3], c[4], c[5]));
    return { type: 'FeatureCollection',
             properties: { version: 2, operation_name: 'symbol-fix-1-test' },
             features: feats };
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS', name); passed++; }
    else { console.error('  FAIL', name, '—', detail); failed++; }
}

console.log('\nSYMBOL-FIX-1 — domain controls synthesized symbol set');

const scenario = PORTER.buildScenarioFromGeoJson(buildBundle(), { name: 'symbol-fix-1-test' });
const byUid = {};
for (const u of scenario.red_units || []) byUid[u.uid] = u;
for (const u of scenario.blue_units_initial || []) byUid[u.unit_uid || u.uid] = u;

function setOf(sidc) { return (sidc && sidc.length >= 6) ? sidc.slice(4, 6) : null; }
function affOf(sidc) { return (sidc && sidc.length >= 4) ? sidc[3] : null; }
function echOf(sidc) { return (sidc && sidc.length >= 10) ? sidc.slice(8, 10) : null; }

for (const [uid, side, , , echelon, , expectedSet, desc] of CASES) {
    const u = byUid[uid];
    if (!u) { check(desc, false, 'unit not found in ported scenario (filtered?)'); continue; }
    const got = setOf(u.sidc);
    check(desc, got === expectedSet, `expected set ${expectedSet}, got ${got} (sidc=${u.sidc})`);
}

// Affiliation + echelon preserved (acceptance): RED→6, BLUE→3; brigade amp 18, bn 16, coy 15.
console.log('\nSYMBOL-FIX-1 — affiliation + echelon preserved');
const AMP = { bde: '18', bn: '16', coy: '15' };
for (const [uid, side, , , echelon] of CASES) {
    const u = byUid[uid];
    if (!u) continue;
    const expectAff = side === 'RED' ? '6' : '3';
    check(`${uid}: affiliation ${expectAff}`, affOf(u.sidc) === expectAff, `got ${affOf(u.sidc)} (sidc=${u.sidc})`);
    if (AMP[echelon]) check(`${uid}: echelon amp ${AMP[echelon]}`, echOf(u.sidc) === AMP[echelon], `got ${echOf(u.sidc)} (sidc=${u.sidc})`);
}

// Regression guard: the specific old bug (naval/air + formation word → land) is gone.
console.log('\nSYMBOL-FIX-1 — regression guard');
check('no naval/air unit resolved to LAND set', (function () {
    for (const [uid, , domain] of CASES) {
        const u = byUid[uid];
        if (!u) continue;
        if ((domain === 'naval' || domain === 'air') && setOf(u.sidc) === SS_LAND) return false;
    }
    return true;
})(), 'a naval/air unit still has land symbol set');

// Production code must not hardcode scenario IDs / coords in pickSymbolSet.
const SRC = require('fs').readFileSync(path.join(__dirname, '..', 'scripts', 'port-wargame.js'), 'utf8');
const fnStart = SRC.indexOf('function pickSymbolSet');
const fnBlock = SRC.slice(fnStart, fnStart + 1600);
check('pickSymbolSet has no hardcoded scenario id / coords', (function () {
    for (const lit of ['wargame3', 'gulf_of_sidra', '19.55', '29.74', '20.63', '30.98']) {
        if (fnBlock.indexOf(lit) !== -1) return false;
    }
    return true;
})(), 'pickSymbolSet contains a hardcoded scenario id or coordinate');

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-symbol-fix-1-domain-wins — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
