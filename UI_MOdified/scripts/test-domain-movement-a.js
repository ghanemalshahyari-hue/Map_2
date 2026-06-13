#!/usr/bin/env node
/* DOMAIN-AWARE-MOVEMENT-A — review-only domain route-shape tests.
 * Ships route to a coastal approach (not straight inland); support holds;
 * air/ground go direct; unknown is schematic+warned. Demo-only, never final. */
'use strict';

const assert = require('assert');
const DM = require('../client/shell/domain-movement.js');

let passed = 0;
function ok(c, m) { if (!c) throw new Error(m || 'assert'); passed++; }
function reviewOnly(r) { return r.demo_only === true && r.review_only === true && r.needs_review === true && r.exact_route === false; }

// Anchors: a coastal naval base near the sea + inland land/air bases.
const COAST = { id: 'N1', side: 'RED', site_type: 'naval_base', lat: 25.0, lon: 56.5 };
const LAND = { id: 'L1', side: 'RED', site_type: 'land_base', lat: 27.0, lon: 54.0 };
const AIR = { id: 'A1', side: 'RED', site_type: 'air_base', lat: 27.2, lon: 54.2 };
const ANCHORS = [COAST, LAND, AIR];
const INLAND_OBJ = { lat: 27.1, lon: 53.8 };          // near the land bases, far from the coast
const navalGroup = { symbol_category: 'naval_surface', anchor: { lat: 24.6, lon: 56.9 } };

// 1. naval_surface to inland objective → naval_to_coast
const nav = DM.buildDemoRoute(navalGroup, INLAND_OBJ, ANCHORS);
ok(nav.route_type === 'naval_to_coast', '1: naval → naval_to_coast');
ok(nav.movement_domain === 'naval', '1: domain naval');
ok(reviewOnly(nav), '1: naval review-only');

// 2. naval route includes a coastal approach waypoint == the naval anchor
const coast = DM.findCoastalApproachPoint(navalGroup, INLAND_OBJ, ANCHORS);
ok(coast && coast.lat === COAST.lat && coast.lon === COAST.lon, '2: coastal approach = nearest naval anchor');
const approach = nav.waypoints[nav.waypoints.length - 1];
ok(approach.lat === COAST.lat && approach.lng === COAST.lon && approach.phase === 'approach', '2: terminal waypoint is the coastal approach');
ok(!nav.waypoints.some(function (w) { return w.lat === INLAND_OBJ.lat && w.lng === INLAND_OBJ.lon; }), '2: naval route does NOT terminate at the inland objective');

// 3. naval with NO coastal anchor → safe fallback + warning
const navNoCoast = DM.buildDemoRoute(navalGroup, INLAND_OBJ, [LAND, AIR]);
ok(navNoCoast.route_type === 'naval_to_coast', '3: naval stays naval_to_coast on fallback');
ok(navNoCoast.warnings.indexOf('No coastal approach point found; naval route is schematic only') !== -1, '3: fallback warning present');
ok(reviewOnly(navNoCoast), '3: fallback review-only');

// 4. air_fighter → air_direct
const air = DM.buildDemoRoute({ symbol_category: 'air_fighter', anchor: { lat: 27.2, lon: 54.2 } }, INLAND_OBJ, ANCHORS);
ok(air.route_type === 'air_direct' && air.movement_domain === 'air', '4: air_fighter → air_direct');
ok(air.waypoints[air.waypoints.length - 1].lat === INLAND_OBJ.lat, '4: air goes direct to objective');

// 5. mechanized_infantry → ground_direct
const ground = DM.buildDemoRoute({ symbol_category: 'mechanized_infantry', anchor: { lat: 27.0, lon: 54.0 } }, INLAND_OBJ, ANCHORS);
ok(ground.route_type === 'ground_direct' && ground.movement_domain === 'ground', '5: mech inf → ground_direct');

// 6. radar → support_hold, does NOT move to objective
const radar = DM.buildDemoRoute({ symbol_category: 'radar', anchor: { lat: 26.0, lon: 55.0 } }, INLAND_OBJ, ANCHORS);
ok(radar.route_type === 'support_hold' && radar.movement_domain === 'support', '6: radar → support_hold');
ok(radar.waypoints.length === 1 && radar.waypoints[0].lat === 26.0 && radar.waypoints[0].lng === 55.0, '6: radar holds at anchor');
ok(!radar.waypoints.some(function (w) { return w.lat === INLAND_OBJ.lat && w.lng === INLAND_OBJ.lon; }), '6: radar does not move to objective');

// 7. air_defense → support_hold
const ad = DM.buildDemoRoute({ symbol_category: 'air_defense', anchor: { lat: 26.1, lon: 55.1 } }, INLAND_OBJ, ANCHORS);
ok(ad.route_type === 'support_hold', '7: air_defense → support_hold');
ok(ad.warnings.indexOf('Support unit holds position unless commander assigns relocation') !== -1, '7: support hold note');

// 8. unknown → unknown_direct with warning
const unk = DM.buildDemoRoute({ symbol_category: 'unknown', anchor: { lat: 26, lon: 55 } }, INLAND_OBJ, ANCHORS);
ok(unk.route_type === 'unknown_direct' && unk.movement_domain === 'unknown', '8: unknown → unknown_direct');
ok(unk.warnings.indexOf('Unknown movement domain; using schematic direct demo route') !== -1, '8: unknown warning');

// 11. no final route (exact_route:false, no approved/final fields) + 13. demo/review-only on all
[nav, navNoCoast, air, ground, radar, ad, unk].forEach(function (r) {
    ok(r.exact_route === false && !('approved' in r) && !('final_route' in r), '11: no final/approved route');
    ok(r.demo_only === true && r.review_only === true && r.needs_review === true, '13: demo_only/review_only output');
});

// 12. no world-state mutation
const bU = global.units, bW = global.AppWorldState;
DM.buildDemoRoute(navalGroup, INLAND_OBJ, ANCHORS);
ok(global.units === bU && global.AppWorldState === bW, '12: no world-state mutation');

// 9 + 10. Free Fight still starts; reset/clear still work (domain routing via require fallback)
global.RmoozUnitIntelNormalizer = require('../client/shell/unit-intel-normalizer.js');
global.RmoozSymbolRegistry = require('../client/shell/symbol-registry.js');
global.RmoozDemoUnits = require('../client/shell/demo-units.js');
global.RmoozFreeFightAI = require('../client/shell/free-fight-ai.js');
const FF = require('../client/shell/free-fight-demo.js');
const payload = { operational_brief: {
    placement_candidates: [
        { id: 'B1', base_id: 'B1', side: 'RED', country_key: 'red', base_name_en: 'Naval', site_type: 'naval_base', lat: 24.6, lon: 56.9 },
        { id: 'B2', base_id: 'B2', side: 'BLUE', country_key: 'blue', base_name_en: 'Air', site_type: 'air_base', lat: 27.2, lon: 54.2 } ],
    proposed_units: [
        { id: 'U1', assigned_base_id: 'B1', side: 'RED', country_key: 'red', base_name_en: 'Naval', platform: 'Frigate', estimated_count: 1 },
        { id: 'U2', assigned_base_id: 'B2', side: 'BLUE', country_key: 'blue', base_name_en: 'Air', platform: 'F-16', estimated_count: 1 } ] } };
FF.init(payload, { objective: { lat: 27.1, lon: 53.8 } });
let st = FF.start();
ok(st.running === true, '9: Free Fight movement still starts (domain-aware)');
FF.step();
ok(FF.getState().progress > 0, '9: movement advances');
const navGrp = FF.getGroups().filter(function (g) { return g.movement_domain === 'naval'; })[0];
if (navGrp) ok(navGrp.route_type === 'naval_to_coast', '9: naval demo group routed to coast in Free Fight');
st = FF.reset();
ok(st.progress === 0, '10: reset works');
FF.clear();
ok(FF.getGroups().length === 0, '10: clear works');

console.log(passed + ' passed, 0 failed');
console.log('DOMAIN-AWARE-MOVEMENT-A tests passed');
