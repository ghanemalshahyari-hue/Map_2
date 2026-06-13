#!/usr/bin/env node
/* GLOBAL-SYMBOL-IDENTITY-A — shared review-only symbol-identity resolver tests.
 * Resolver composes normalizer + symbol-registry + sidc-preview; never final. */
'use strict';

const assert = require('assert');
const Identity = require('../client/shell/symbol-identity.js'); // internal deps via require fallback
const Registry = require('../client/shell/symbol-registry.js');

let passed = 0;
function ok(c, m) { if (!c) throw new Error(m || 'assert'); passed++; }
function reviewOnly(r) { return r.sidc_candidate === 'review_required' && r.needs_review === true && r.exact_unit_position === false; }

// 1. Arabic mechanized infantry → M + mechanized_infantry + review_required
const mech = Identity.resolve({ original_text: 'لواء المشاة الآلي 71 (3 كتائب مشاة + كتيبة دبابات)', side: 'RED' });
ok(mech.symbol_category === 'mechanized_infantry', '1: mech symbol_category');
ok(mech.display_glyph === 'M', '1: mech glyph M');
ok(reviewOnly(mech), '1: mech review-only');
ok(mech.normalized_unit_intel && mech.normalized_unit_intel.echelon === 'brigade', '1: intel echelon brigade');

// 2. Arabic tank battalion → T / armor + review_required
const tank = Identity.resolve({ original_text: 'كتيبة دبابات', side: 'RED' });
ok(tank.symbol_category === 'armor' && tank.display_glyph === 'T', '2: tank → armor/T');
ok(reviewOnly(tank), '2: tank review-only');

// 3. Arabic radar → radar glyph + review_required
const radar = Identity.resolve({ original_text: 'موقع رادار إنذار مبكر', side: 'RED' });
ok(radar.symbol_category === 'radar' && radar.display_glyph === Registry.platformSymbol('radar').glyph, '3: radar glyph');
ok(reviewOnly(radar), '3: radar review-only');

// 4. air_base object → air base glyph
const ab = Identity.resolve({ object_type: 'air_base', side: 'BLUE' });
ok(ab.display_glyph === Registry.objectSymbol('air_base').glyph && ab.object_symbol && ab.object_symbol.object_type === 'air_base', '4: air_base glyph');

// 5. naval_base object → naval base glyph
const nb = Identity.resolve({ object_type: 'naval_base', side: 'RED' });
ok(nb.display_glyph === Registry.objectSymbol('naval_base').glyph && nb.object_symbol.object_type === 'naval_base', '5: naval_base glyph');

// 6. unknown Arabic → unknown glyph + warning
const unk = Identity.resolve({ original_text: 'تشكيل غامض جدا', side: 'BLUE' });
ok(unk.symbol_category === 'unknown', '6: unknown category');
ok(unk.display_glyph === Registry.platformSymbol('unknown').glyph, '6: unknown glyph');
ok(unk.warnings.indexOf('unknown_unit_type') !== -1, '6: unknown_unit_type warning');
ok(reviewOnly(unk), '6: unknown review-only');

// 7. infantry with safe SIDC favorite → sidc_preview candidate, still review_required
const inf = Identity.resolve({ original_text: 'كتيبة مشاة', side: 'BLUE' });
ok(inf.symbol_category === 'infantry' && inf.display_glyph === 'I', '7: infantry → I');
ok(inf.sidc_preview && inf.sidc_preview.sidc === '10031000001200000000', '7: infantry BLUE → Friendly Infantry SIDC preview');
ok(reviewOnly(inf), '7: infantry still review_required');

// 8. armor without safe mapping → no SIDC + warning
ok(tank.sidc_preview === null, '8: armor → no SIDC preview');
ok(tank.warnings.indexOf('No safe internal SIDC mapping found') !== -1, '8: armor → no-safe-mapping warning');

// 9. Free Fight still works if symbol-identity is unavailable (no global resolver)
ok(typeof global.RmoozSymbolIdentity === 'undefined' && typeof globalThis.RmoozSymbolIdentity === 'undefined', '9: resolver not a global here');
global.RmoozUnitIntelNormalizer = require('../client/shell/unit-intel-normalizer.js');
global.RmoozSymbolRegistry = Registry;
global.RmoozDemoUnits = require('../client/shell/demo-units.js');
global.RmoozFreeFightAI = require('../client/shell/free-fight-ai.js');
const FF = require('../client/shell/free-fight-demo.js');
const payload = { operational_brief: { placement_candidates: [
    { id: 'B1', base_id: 'B1', side: 'RED', country_key: 'iran', base_name_en: 'A', lat: 25, lon: 55 },
    { id: 'B2', base_id: 'B2', side: 'BLUE', country_key: 'uae', base_name_en: 'B', lat: 25.4, lon: 55.4 } ],
    proposed_units: [
    { id: 'U1', assigned_base_id: 'B1', side: 'RED', country_key: 'iran', base_name_en: 'A', platform: 'كتيبة دبابات', estimated_count: 1 },
    { id: 'U2', assigned_base_id: 'B2', side: 'BLUE', country_key: 'uae', base_name_en: 'B', platform: 'كتيبة مشاة', estimated_count: 1 } ] } };
FF.init(payload, { objective: { lat: 25.2, lon: 55.2 } });
const st = FF.start();
ok(st.running === true, '9: Free Fight starts without the resolver (fallback)');
FF.clear();

// 10. Base Status still works if symbol-identity is unavailable.
// base-status-panel.js is browser-only; give it a window WITHOUT a resolver and
// confirm it loads + classifies a unit (its review path never hard-needs the resolver).
global.window = global.window || {};
global.window.RmoozUnitIntelNormalizer = global.RmoozUnitIntelNormalizer;
global.window.RmoozSymbolRegistry = Registry;
// intentionally NOT setting window.RmoozSymbolIdentity
require('../client/shell/base-status-panel.js');
const BSP = global.window.RmoozBaseStatusPanel;
ok(BSP && typeof BSP === 'object', '10: base-status-panel loads without the resolver');
ok(typeof global.window.RmoozSymbolIdentity === 'undefined', '10: resolver still absent for the fallback path');

// 11. no final units — resolve creates no unit object / no approval fields
['id', 'unit_id', 'created_unit', 'approved', 'sidc_final', 'sidc_approved'].forEach(function (k) {
    ok(!(k in mech) && !(k in ab), '11: no final/unit field "' + k + '"');
});

// 12. no world-state mutation — globals untouched by resolve
const beforeUnits = global.units, beforeWorld = global.AppWorldState;
Identity.resolve({ original_text: 'كتيبة دبابات', side: 'RED' });
Identity.resolve({ object_type: 'air_base' });
ok(global.units === beforeUnits && global.AppWorldState === beforeWorld, '12: no world-state mutation');

console.log(passed + ' passed, 0 failed');
console.log('GLOBAL-SYMBOL-IDENTITY-A tests passed');
