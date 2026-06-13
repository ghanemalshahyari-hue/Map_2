#!/usr/bin/env node
/*
 * SYMBOL-DB-B — RMOOZ symbol mapping registry for Step 1 anchors.
 * Review/display only: no final units, no tasking, no movement, no combat.
 */
'use strict';

var path = require('path');

// ── DOM stub (mirrors test-base-status-panel-a.js) ───────────────────────
var elements = {};
function makeEl(t) {
    return {
        tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e.id) elements[e.id] = e; return e; },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {},
        querySelector: function (s) { return s === '.bsp-close' ? { addEventListener: function () {} } : null; },
    };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {}; global.window.document = global.document;

var CLIENT = path.join(__dirname, '..', 'client', 'shell');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'base-status-panel.js'));

var REG = require(path.join(CLIENT, 'symbol-registry.js'));
var BP = global.window.RmoozBaseStatusPanel;

var passed = 0, failed = 0;
function test(n, fn) { try { fn(); console.log('  [PASS] ' + n); passed++; } catch (e) { console.log('  [FAIL] ' + n + ': ' + e.message); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

console.log('\nSYMBOL-DB-B symbol registry\n');

var REQUIRED_OBJECTS = ['air_base', 'naval_base', 'land_base', 'friendly_trial_anchor', 'base_facility', 'airport', 'port', 'radar_site', 'air_defense_site', 'logistics_node', 'hq', 'objective', 'infrastructure', 'unknown'];
var REQUIRED_PLATFORMS = ['air_fighter', 'air_attack', 'air_transport', 'maritime_patrol', 'helicopter', 'uav', 'naval_surface', 'submarine', 'ground_unit', 'air_defense', 'radar', 'logistics', 'unknown'];

test('every required object symbol exists with a non-generic glyph', function () {
    REQUIRED_OBJECTS.forEach(function (t) {
        var s = REG.objectSymbol(t);
        assert(s && s.glyph && s.glyph !== 'B', t + ' has a glyph that is not generic B');
        assert(s.label_en && s.label_ar, t + ' has bilingual labels');
        if (t !== 'unknown') assert(s.symbol_source === 'registry' && !s.fallback, t + ' resolves from registry');
    });
});
test('every required platform symbol exists', function () {
    REQUIRED_PLATFORMS.forEach(function (c) {
        var s = REG.platformSymbol(c);
        assert(s && s.glyph && s.label_en, c + ' has a symbol');
        if (c !== 'unknown') assert(s.symbol_source === 'registry' && s.symbol_category === c, c + ' resolves from registry');
    });
});
test('air_base no longer uses generic B (uses an air symbol)', function () {
    var s = REG.resolveBaseSymbol({ site_type: 'air_base' });
    assert(s.object_type === 'air_base', 'air_base resolved');
    assert(s.glyph !== 'B', 'glyph is not B');
    assert(REG.iconHtml(s, { side: 'RED' }).indexOf('>B<') === -1, 'icon html has no bare B glyph');
});
test('naval_base uses a naval/base symbol', function () {
    var s = REG.resolveBaseSymbol({ base_type: 'naval_base' });
    assert(s.object_type === 'naval_base' && s.glyph !== 'B', 'naval_base resolved, not B');
});
test('land_base uses a land/facility symbol', function () {
    var s = REG.resolveBaseSymbol({ anchor_type: 'land_base' });
    assert(s.object_type === 'land_base' && s.glyph !== 'B', 'land_base resolved, not B');
});
test('type field is read from any of site_type/base_type/anchor_type/placement_type', function () {
    assert(REG.resolveBaseSymbol({ placement_type: 'air_base' }).object_type === 'air_base', 'placement_type=air_base');
    assert(REG.resolveBaseSymbol({ anchor_type: 'naval_base' }).object_type === 'naval_base', 'anchor_type=naval_base');
    // specialized sites
    assert(REG.resolveBaseSymbol({ site_type: 'radar_site' }).object_type === 'radar_site', 'radar_site');
    assert(REG.resolveBaseSymbol({ site_type: 'SAM site' }).object_type === 'air_defense_site', 'SAM → air_defense_site');
    assert(REG.resolveBaseSymbol({ site_type: 'HQ' }).object_type === 'hq', 'HQ');
});
test('unknown base does not crash and uses a fallback (base_facility or unknown)', function () {
    var sBase = REG.resolveBaseSymbol({ site_type: 'totally_unmapped_thing', base_name_en: 'Mystery Base' });
    assert(sBase.fallback === true, 'base-ish unmapped → fallback');
    assert(sBase.object_type === 'base_facility', 'base-ish unmapped → base_facility');
    assert(sBase.warning, 'fallback carries a warning');
    var sUnk = REG.resolveBaseSymbol({ type: 'zzz' });
    assert(sUnk.fallback === true && sUnk.object_type === 'unknown', 'truly unknown → unknown fallback');
    assert(REG.resolveBaseSymbol(null).object_type === 'unknown', 'null input does not crash');
    assert(REG.resolveBaseSymbol({}).fallback === true, 'empty input → fallback');
});
test('iconHtml renders the registry glyph, never a bare B / infantry', function () {
    var s = REG.resolveBaseSymbol({ site_type: 'air_base' });
    var html = REG.iconHtml(s, { side: 'BLUE' });
    assert(html.indexOf(s.glyph) !== -1, 'html contains the glyph');
    assert(html.indexOf('>B<') === -1, 'no bare B');
});

// ── Base Status Panel: symbol metadata + grouped aircraft (no per-aircraft markers) ──
function anchor() {
    return { base_name_en: 'Al Dhafra AB', base_name_ar: 'قاعدة الظفرة', side: 'BLUE', country: 'الإمارات', site_type: 'air_base', lat: 24.25, lon: 54.55, exact_unit_position: false, needs_review: true, review_only: true, source_type: 'external_orbat_candidate' };
}
function unit(p) { return { side: 'BLUE', country: 'الإمارات', base_name_en: 'Al Dhafra AB', lat: 24.25, lon: 54.55, platform: p, estimated_count: 6, type_ar: 'مقاتلة', needs_review: true, exact_unit_position: false }; }
var payload = { brief: { operational_brief: {
    proposed_units: [unit('F-16E Block 60'), unit('Mirage 2000-9'), unit('AH-64 Apache')],
    placement_candidates: [anchor()], enemy_bases: [], friendly_trial_bases: [], country_bases: [anchor()],
} } };

test('Base Status Panel shows symbol metadata (object_type / symbol_source / glyph)', function () {
    BP.open(anchor(), payload);
    var panel = global.document.getElementById('step1-base-status-panel');
    assert(panel, 'panel created');
    var h = panel.innerHTML;
    assert(/Symbol/.test(h) && /object_type/.test(h), 'Symbol section + object_type');
    assert(/symbol_source/.test(h) && /catalog_match_status/.test(h), 'symbol_source + catalog_match_status rows');
    assert(/air_base/.test(h), 'object_type air_base shown');
    assert(h.indexOf('exact_unit_position:false') !== -1, 'still review-only / exact_unit_position:false');
});
test('proposed aircraft stay GROUPED under the base (one panel, no per-aircraft markers)', function () {
    BP.open(anchor(), payload);
    var h = global.document.getElementById('step1-base-status-panel').innerHTML;
    assert(/F-16E Block 60/.test(h) && /Mirage 2000-9/.test(h) && /AH-64 Apache/.test(h), 'all 3 platforms listed under the one base');
    assert(/Proposed Units/.test(h), 'grouped Proposed Units table present');
});
test('registry creates no scenario units / no mutation', function () {
    assert(typeof global.window.units === 'undefined', 'no window.units');
    assert(payload.brief.operational_brief.proposed_units.every(function (u) { return u.exact_unit_position === false; }), 'units stay exact_unit_position:false');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
