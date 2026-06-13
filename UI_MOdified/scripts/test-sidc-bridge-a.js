#!/usr/bin/env node
/* SIDC-BRIDGE-A — review-only SIDC preview bridge tests.
 * Verifies: safe candidate ONLY from app favorites (infantry), null+warning
 * elsewhere, never a final SIDC, no units, no world-state, milsymbol-optional,
 * category glyphs still the fallback. */
'use strict';

const assert = require('assert');
const Normalizer = require('../client/shell/unit-intel-normalizer.js');
const Registry = require('../client/shell/symbol-registry.js');
const Sidc = require('../client/shell/sidc-preview.js');

let passed = 0;
function ok(c, m) { if (!c) throw new Error(m || 'assert'); passed++; }
function isReviewOnly(r) {
    return r.sidc_candidate === 'review_required' && r.needs_review === true && r.exact_unit_position === false;
}
function candidateOrSafeWarning(r) {
    if (r.sidc_preview_candidate) {
        return r.sidc_preview_candidate.source === 'internal_app_symbology_mapping'
            && /^(low|medium|high)$/.test(r.sidc_preview_candidate.confidence)
            && isReviewOnly(r);
    }
    return r.warnings.indexOf('No safe internal SIDC mapping found') !== -1 && isReviewOnly(r);
}
function preview(text, side) {
    const n = Normalizer.normalizeUnitText(text);
    return Sidc.previewFor({ symbol_category: n.symbol_category, echelon: n.echelon, side: side });
}

// 1. mechanized infantry brigade → candidate OR safe no-mapping warning (review-only)
const mech = preview('لواء المشاة الآلي 71 (3 كتائب مشاة + كتيبة دبابات)', 'RED');
ok(candidateOrSafeWarning(mech), '1: mech inf brigade is candidate-or-safe-warning, review-only');

// 2. tank battalion (armor)
ok(candidateOrSafeWarning(preview('كتيبة دبابات', 'RED')), '2: tank battalion safe outcome');

// 3. air defense battery
ok(candidateOrSafeWarning(preview('بطارية صواريخ أرض جو', 'BLUE')), '3: air defense battery safe outcome');

// 4. radar site
ok(candidateOrSafeWarning(preview('موقع رادار إنذار مبكر', 'RED')), '4: radar site safe outcome');

// 5. unknown Arabic → no SIDC + warning
const unk = preview('تشكيل غير واضح', 'BLUE');
ok(unk.sidc_preview_candidate === null, '5: unknown → no SIDC candidate');
ok(unk.warnings.indexOf('No safe internal SIDC mapping found') !== -1, '5: unknown → warning');
ok(isReviewOnly(unk), '5: unknown → review-only');

// Positive proof: infantry maps to the app favorite by side (still review-only).
const infB = preview('كتيبة مشاة', 'BLUE');
ok(infB.sidc_preview_candidate && infB.sidc_preview_candidate.sidc === '10031000001200000000', 'inf BLUE → Friendly Infantry favorite');
ok(infB.sidc_preview_candidate.matched_favorite === 'Friendly Infantry' && isReviewOnly(infB), 'inf BLUE candidate is review-only');
const infR = preview('كتيبة مشاة', 'RED');
ok(infR.sidc_preview_candidate && infR.sidc_preview_candidate.sidc === '10033500001200000000', 'inf RED → Hostile Infantry favorite');
const infU = Sidc.previewFor({ symbol_category: 'infantry', echelon: 'company', side: null });
ok(infU.sidc_preview_candidate && infU.sidc_preview_candidate.sidc === '10037000001200000000', 'inf no-side → Unknown Infantry favorite');
ok(infU.sidc_preview_candidate.confidence === 'low', 'unknown affiliation → low confidence');

// 6. no final SIDC approval — never a final/approved field; always review_required
[mech, unk, infB, infR].forEach(function (r) {
    ok(r.sidc_candidate === 'review_required', '6: sidc_candidate stays review_required');
    ok(!('sidc_final' in r) && !('approved' in r) && !('sidc_approved' in r), '6: no final/approved fields');
});

// 7. no final units — the bridge returns a plain preview object, creates no unit
ok(!('id' in infB) && !('unit_id' in infB) && !('created_unit' in infB), '7: no unit object created');

// 8. no world-state mutation — globals untouched by previewFor
const beforeUnits = global.units, beforeWorld = global.AppWorldState;
Sidc.previewFor({ symbol_category: 'infantry', side: 'BLUE' });
ok(global.units === beforeUnits && global.AppWorldState === beforeWorld, '8: no world-state mutation');

// 9. milsymbol optional — no ms → previewSvg returns null (no throw); stub ms → string
ok(typeof global.ms === 'undefined', '9: milsymbol absent in Node by default');
ok(Sidc.previewSvg('10031000001200000000') === null, '9: previewSvg null when milsymbol unavailable');
global.ms = { Symbol: function (s) { this.s = s; return this; } };
global.ms.Symbol.prototype = { asSVG: function () { return '<svg data-sidc="' + this.s + '"></svg>'; } };
const svg = Sidc.previewSvg('10031000001200000000');
ok(typeof svg === 'string' && svg.indexOf('<svg') === 0, '9: previewSvg renders when milsymbol present');
delete global.ms;

// 10. category glyph fallback still works (bridge does not replace the glyph system)
const armorGlyph = Registry.platformSymbol('armor');
ok(armorGlyph && armorGlyph.glyph && armorGlyph.symbol_source === 'registry', '10: armor category glyph still resolves');
const tankPrev = preview('كتيبة دبابات', 'RED');
ok(Registry.platformSymbol('armor').glyph === armorGlyph.glyph, '10: glyph unchanged regardless of SIDC preview outcome');
ok(tankPrev.symbol_category === 'armor', '10: armor still categorized for its glyph');

console.log(passed + ' passed, 0 failed');
console.log('SIDC-BRIDGE-A tests passed');
