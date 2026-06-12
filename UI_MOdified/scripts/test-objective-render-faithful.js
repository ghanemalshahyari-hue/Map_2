#!/usr/bin/env node
'use strict';
/**
 * Client-faithful-render verification (PREGEN-CONTROL-2).
 *
 * The RMOOZ client must render what the GeoJSON says — it must NOT fake-retarget
 * engagement vectors at the objective. This ports a synthetic all_phases bundle
 * whose objective sits far from the units, and asserts:
 *   - scenario.obj.coord comes from the objective FEATURE (not a hardcoded coord)
 *   - engagement arc endpoints come from UNIT positions (stay unit-to-unit)
 *   - no arc endpoint is snapped to the objective coordinate
 *
 * This is a verification-only test — there is no client-side retargeting logic to
 * exercise; the fix lives in the generator (objective-relative force placement).
 *
 * Run:  node scripts/test-objective-render-faithful.js
 */
const assert = require('assert');
const path = require('path');
const PORTER = require(path.join(__dirname, '..', 'scripts', 'port-wargame.js'));

const OBJ = [21.14, 31.17];          // objective — deliberately far from the units
const RED_POS = [20.10, 32.40];      // red actor unit position
const BLUE_POS = [20.80, 31.55];     // blue target unit position

function unitFeature(uid, side, coord, phase) {
    return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coord },
        properties: {
            kind: 'unit', uid: uid, side: side, domain: 'ground',
            type: 'mech_brigade', name_ar: uid, echelon: 'bde', phase: phase,
            current_strength: 1.0, initial_strength: 1.0, destroyed: false,
        },
    };
}

function build() {
    const features = [];
    // Two phases so the porter builds a per-step structure.
    for (let p = 0; p < 2; p++) {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: OBJ },
            properties: { kind: 'objective', id: 'OBJ-X', name_en: 'Objective X',
                          name_ar: 'X', phase: p, depth_km_from_coast: 90.1 },
        });
        features.push(unitFeature('R1', 'RED', RED_POS, p));
        features.push(unitFeature('B1', 'BLUE', BLUE_POS, p));
        // Engagement arc: RED R1 → BLUE B1, endpoints at the UNIT positions.
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [RED_POS, BLUE_POS] },
            properties: { kind: 'engagement_arc', phase: p,
                          cause_actor: 'R1', target_uid: 'B1',
                          actor_side: 'RED', target_side: 'BLUE',
                          status_change: 'damaged_partial' },
        });
    }
    return { type: 'FeatureCollection',
             properties: { version: 2, operation_name: 'render-faithful-test' },
             features: features };
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS', name); passed++; }
    else { console.error('  FAIL', name, '—', detail); failed++; }
}

console.log('\nPREGEN-CONTROL-2 — client renders objective + vectors faithfully');

const scenario = PORTER.buildScenarioFromGeoJson(build(), { name: 'render-faithful-test' });

// 1) Objective comes from the objective FEATURE, not a hardcoded coordinate.
const oc = scenario.obj && scenario.obj.coord;
check('objective coord taken from GeoJSON feature',
      Array.isArray(oc) && Math.abs(oc[0] - OBJ[0]) < 1e-6 && Math.abs(oc[1] - OBJ[1]) < 1e-6,
      JSON.stringify(oc));

// 2) Engagement arcs are present and remain unit-to-unit.
let arcs = [];
for (const s of scenario.steps || []) {
    if (Array.isArray(s.engagement_arcs)) arcs = arcs.concat(s.engagement_arcs);
}
check('engagement arcs ported', arcs.length > 0, 'no arcs');
const a = arcs[0] || {};
check('arc stays unit-to-unit (R1 → B1)',
      a.actor_uid === 'R1' && a.target_uid === 'B1',
      JSON.stringify({ actor: a.actor_uid, target: a.target_uid }));

// 3) Arc endpoints reflect UNIT positions — NOT the objective.
const ec = a.coordinates || [];
function isObj(pt) { return pt && Math.abs(pt[0] - OBJ[0]) < 1e-6 && Math.abs(pt[1] - OBJ[1]) < 1e-6; }
check('arc actor endpoint is NOT the objective', !isObj(ec[0]), JSON.stringify(ec[0]));
check('arc target endpoint is NOT the objective', !isObj(ec[1]), JSON.stringify(ec[1]));
check('arc endpoints match the unit positions from the data',
      ec[0] && ec[1] &&
      Math.abs(ec[0][0] - RED_POS[0]) < 1e-6 && Math.abs(ec[0][1] - RED_POS[1]) < 1e-6 &&
      Math.abs(ec[1][0] - BLUE_POS[0]) < 1e-6 && Math.abs(ec[1][1] - BLUE_POS[1]) < 1e-6,
      JSON.stringify(ec));

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-objective-render-faithful — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
