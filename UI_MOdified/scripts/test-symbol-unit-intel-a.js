#!/usr/bin/env node
/* SYMBOL-UNIT-INTEL-A regression tests. */
'use strict';

const assert = require('assert');
const Normalizer = require('../client/shell/unit-intel-normalizer.js');
const Registry = require('../client/shell/symbol-registry.js');
global.RmoozUnitIntelNormalizer = Normalizer;
global.RmoozSymbolRegistry = Registry;
const DemoUnits = require('../client/shell/demo-units.js');
global.RmoozDemoUnits = DemoUnits;
global.RmoozFreeFightAI = require('../client/shell/free-fight-ai.js');
const FreeFight = require('../client/shell/free-fight-demo.js');

function eq(actual, expected, msg) { assert.strictEqual(actual, expected, msg); }
function ok(value, msg) { assert.ok(value, msg); }

function dominant(counts) {
  let best = 'unknown';
  let n = -1;
  Object.keys(counts || {}).forEach((k) => {
    if (counts[k] > n) { best = k; n = counts[k]; }
  });
  return best;
}

const mech = Normalizer.normalizeUnitText('لواء المشاة الآلي 71 (3 كتائب مشاة + كتيبة دبابات)');
eq(mech.echelon, 'brigade', 'Arabic mechanized infantry brigade echelon');
eq(mech.unit_type, 'mechanized_infantry', 'Arabic mechanized infantry type');
eq(mech.unit_number, '71', 'Arabic mechanized infantry unit number');
eq(mech.composition.length, 2, 'Arabic mechanized infantry composition length');
eq(mech.composition[0].count, 3, 'Arabic infantry battalion count');
eq(mech.composition[0].echelon, 'battalion', 'Arabic infantry battalion echelon');
eq(mech.composition[0].unit_type, 'infantry', 'Arabic infantry battalion type');
eq(mech.composition[1].count, 1, 'Arabic tank battalion count');
eq(mech.composition[1].unit_type, 'tank', 'Arabic tank battalion type');
eq(mech.needs_review, true, 'Arabic mechanized infantry remains review-only');

const tank = Normalizer.normalizeUnitText('كتيبة دبابات');
eq(tank.echelon, 'battalion', 'Arabic tank battalion echelon');
eq(tank.unit_type, 'tank', 'Arabic tank battalion type');
eq(tank.symbol_category, 'armor', 'Arabic tank battalion symbol category');

const airDef = Normalizer.normalizeUnitText('بطارية صواريخ أرض جو');
eq(airDef.echelon, 'battery', 'Arabic air defense battery echelon');
eq(airDef.unit_type, 'surface_to_air_missile', 'Arabic air defense battery type');
eq(airDef.symbol_category, 'air_defense', 'Arabic air defense symbol category');

const radar = Normalizer.normalizeUnitText('موقع رادار إنذار مبكر');
eq(radar.unit_type, 'radar', 'Arabic radar site type');
eq(radar.symbol_category, 'radar', 'Arabic radar site symbol category');

const enMech = Normalizer.normalizeUnitText('71st Mechanized Infantry Brigade');
eq(enMech.echelon, 'brigade', 'English mechanized brigade echelon');
eq(enMech.unit_type, 'mechanized_infantry', 'English mechanized brigade type');
eq(enMech.symbol_category, 'mechanized_infantry', 'English mechanized brigade symbol category');

const unknown = Normalizer.normalizeUnitText('تشكيل غير واضح');
eq(unknown.symbol_category, 'unknown', 'Unknown Arabic falls back safely');
eq(unknown.needs_review, true, 'Unknown Arabic remains review-only');
eq(unknown.exact_unit_position, false, 'Unknown Arabic has no exact unit position');
ok(unknown.warnings.includes('unknown_unit_type'), 'Unknown Arabic warns');

const payload = {
  operational_brief: {
    placement_candidates: [
      { id: 'B1', base_id: 'B1', side: 'RED', country: 'Iran', country_key: 'iran', base_name_en: 'Base A', lat: 25, lon: 55 },
      { id: 'B2', base_id: 'B2', side: 'BLUE', country: 'UAE', country_key: 'uae', base_name_en: 'Base B', lat: 25.4, lon: 55.4 },
    ],
    proposed_units: [
      { id: 'U1', assigned_base_id: 'B1', side: 'RED', country: 'Iran', country_key: 'iran', base_name_en: 'Base A', platform: 'لواء المشاة الآلي 71 (3 كتائب مشاة + كتيبة دبابات)', estimated_count: 1 },
      { id: 'U2', assigned_base_id: 'B2', side: 'BLUE', country: 'UAE', country_key: 'uae', base_name_en: 'Base B', platform: 'Air Defense Battery', estimated_count: 1 },
    ],
  },
};
const groups = DemoUnits.buildGroupsFromAnchors(payload);
const red = groups.find((g) => g.side === 'RED');
ok(red, 'Free Fight RED group exists');
eq(red.category_counts.mechanized_infantry, 1, 'Free Fight category count uses normalized category');
eq(red.unit_intel_summary.dominant_symbol_category, 'mechanized_infantry', 'Free Fight summary keeps dominant symbol');
const sym = Registry.platformSymbol(dominant(red.category_counts));
eq(sym.symbol_category, 'mechanized_infantry', 'Free Fight marker resolves normalized category symbol');
ok(sym.glyph && sym.glyph !== '?' && sym.symbol_source === 'registry', 'Free Fight marker is not generic dot/unknown');

FreeFight.init(payload, { objective: { lat: 25.2, lon: 55.2 } });
let st = FreeFight.start();
eq(st.running, true, 'movement still starts');
FreeFight.step();
ok(FreeFight.getState().progress > 0, 'movement advances');
st = FreeFight.reset();
eq(st.progress, 0, 'reset works: progress returns to zero');
FreeFight.getGroups().forEach((g) => {
  eq(g.current.lat, g.anchor.lat, 'reset works: current lat returns to anchor');
  eq(g.current.lon, g.anchor.lon, 'reset works: current lon returns to anchor');
});
FreeFight.clear();

groups.forEach((g) => {
  eq(g.demo_only, true, 'No final units: group demo_only');
  eq(g.review_only, true, 'No final units: group review_only');
  eq(g.exact_unit_position === true, false, 'No exact unit positions on demo group');
});

const beforeUnits = global.units;
const beforeWorld = global.AppWorldState;
DemoUnits.buildGroupsFromAnchors(payload);
eq(global.units, beforeUnits, 'No world-state mutation: units global unchanged');
eq(global.AppWorldState, beforeWorld, 'No world-state mutation: AppWorldState global unchanged');

[mech, tank, airDef, radar, enMech, unknown].forEach((u) => {
  eq(u.sidc_candidate, 'review_required', 'No final SIDC without review');
  eq(u.sidc_confidence, 'review_required', 'SIDC confidence is review-required');
});

console.log('SYMBOL-UNIT-INTEL-A tests passed');
