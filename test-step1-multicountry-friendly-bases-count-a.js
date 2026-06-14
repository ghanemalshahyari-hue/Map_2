#!/usr/bin/env node
/*
 * STEP1-MULTICOUNTRY-FRIENDLY-BASES-COUNT-A
 *
 * Regression for "Friendly: 0" when a multi-country Excel-derived import
 * (gcc_iran_step1_full_from_battle_system_excel) has BLUE bases.
 *
 * Root cause: doc-understanding-review.js:
 *   • enemyBases(p)        read ob.enemy_bases / enemy_forces.*_bases  ✓
 *   • friendlyTrialBases(p) read ob.friendly_trial_bases / friendly_forces.trial_bases only
 *
 * buildMultiCountryStep1 puts BLUE GCC/coalition bases in ob.country_bases (not
 * friendly_trial_bases), so the review header always showed Friendly: 0.
 *
 * Fix: collectReviewBases(p) reads all six source arrays (enemy_bases,
 * friendly_trial_bases, enemy_forces.*, friendly_forces.*, country_bases,
 * placement_candidates), deduplicates by id/name, and returns { red, blue }.
 * enemyBases / friendlyTrialBases become thin wrappers.
 *
 * Tests:
 *   §1  Multi-country Excel fixture → Enemy > 0, Friendly > 0 in summary
 *   §2  BLUE country_bases appear under Friendly Bases (BLUE), not Enemy Bases (RED)
 *   §3  RED country_bases appear under Enemy Bases (RED)
 *   §4  placement_candidates (only source) still counted if sided
 *   §5  Deduplication: same base in both country_bases and placement_candidates → counted once
 *   §6  Existing friendly_trial_bases / enemy_bases still work (backward compat)
 *   §7  Full GCC/Iran buildBriefFromMultiCountry fixture end-to-end
 */
'use strict';

var path = require('path');

// ── DOM stub ─────────────────────────────────────────────────────────────────
var elements = {};
function makeEl(tag) {
    return {
        tagName: tag, id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {},
        appendChild: function (el) { this.children.push(el); if (el.id) elements[el.id] = el; return el; },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function () {},
        querySelector: function (sel) {
            if (sel === '.bsp-close') return { addEventListener: function () {} };
            return null;
        },
    };
}
global.document = {
    body: makeEl('body'), head: makeEl('head'),
    createElement: makeEl,
    getElementById: function (id) { return elements[id] || null; },
};
global.window = {};
global.window.document = global.document;

var CLIENT = path.join(__dirname, 'UI_MOdified/client/shell');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'base-status-panel.js'));
require(path.join(CLIENT, 'doc-understanding-review.js'));
var REVIEW = global.window.RmoozDocReview;

var MULTICOUNTRY = require(path.join(__dirname, 'UI_MOdified/server/ai/multi-country-orbat.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderToHtml(payload) {
    var container = makeEl('div');
    container.innerHTML = '';
    REVIEW.render(container, payload, {});
    // Collect innerHTML from all children
    return container.children.map(function (ch) { return ch.innerHTML || ''; }).join('\n') + (container.innerHTML || '');
}

// ── Payload builders ──────────────────────────────────────────────────────────
function makeOb(fields) {
    return { brief: { operational_brief: Object.assign({ proposed_units: [], placement_candidates: [], country_bases: [] }, fields) } };
}

function base(id, side, nameEn, opts) {
    opts = opts || {};
    return Object.assign({ id: id, base_id: id, side: side, base_name_en: nameEn, country_key: opts.country_key || null, site_type: opts.site_type || 'air_base', lat: opts.lat !== undefined ? opts.lat : null, lon: opts.lon !== undefined ? opts.lon : null, needs_review: true, source_type: opts.source_type || 'multi_country_step1_orbat' }, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('STEP1-MULTICOUNTRY-FRIENDLY-BASES-COUNT-A');

// ── §1  Multi-country Excel fixture → summary counts ─────────────────────────
console.log('\n§1  Summary chip counts with country_bases (RED + BLUE)');

var p1 = makeOb({
    country_bases: [
        base('IR-BND', 'RED',  'Bandar Abbas AB',  { site_type: 'air_base',  lat: 27.21, lon: 56.38 }),
        base('IR-SHZ', 'RED',  'Shiraz Land Base', { site_type: 'land_base' }),
        base('UAE-DHF', 'BLUE', 'Al Dhafra AB',    { site_type: 'air_base',  lat: 24.25, lon: 54.55 }),
        base('KSA-TBK', 'BLUE', 'Tabuk AB',        { site_type: 'air_base',  lat: 28.37, lon: 36.62 }),
    ],
    enemy_bases: [
        base('IR-BND', 'RED', 'Bandar Abbas AB', { site_type: 'air_base', lat: 27.21, lon: 56.38 }),
        base('IR-SHZ', 'RED', 'Shiraz Land Base', { site_type: 'land_base' }),
    ],
});
var html1 = renderToHtml(p1);

// Summary chips: Enemy: 2, Friendly: 2
ok('§1 Enemy chip = 2', /Enemy.*<b>2<\/b>/.test(html1));
ok('§1 Friendly chip = 2', /Friendly.*<b>2<\/b>/.test(html1));
// Section header: both sides → "Bases Review"
ok('§1 section label is "Bases Review" when both sides present', /Bases Review/.test(html1));
// Chips in the section: Enemy: 2 and Friendly: 2
ok('§1 Enemy count chip in section', /Enemy.*<b>2<\/b>/.test(html1));
ok('§1 Friendly count chip in section', /Friendly.*<b>2<\/b>/.test(html1));

// ── §2  BLUE country_bases appear under Friendly Bases, NOT Enemy Bases ───────
console.log('\n§2  BLUE country_bases → Friendly Bases section only');

var p2 = makeOb({
    country_bases: [
        base('UAE-DHF', 'BLUE', 'Al Dhafra AB', { site_type: 'air_base', lat: 24.25, lon: 54.55 }),
    ],
});
var html2 = renderToHtml(p2);

ok('§2 "Friendly Bases (BLUE)" section present', /Friendly Bases \(BLUE\)/.test(html2));
ok('§2 Al Dhafra appears in the HTML', /Al Dhafra AB/.test(html2));
// Must NOT appear under Enemy Bases heading
var enemySectionIdx = html2.indexOf('Enemy Bases (RED)');
var dhafraIdx = html2.indexOf('Al Dhafra AB');
ok('§2 Al Dhafra NOT inside Enemy Bases (RED) section',
    enemySectionIdx < 0 || dhafraIdx < enemySectionIdx || dhafraIdx > html2.indexOf('Friendly Bases (BLUE)'));
ok('§2 section label is "Friendly Bases" when only BLUE present', /Friendly Bases/.test(html2) && !/Friendly Anchors/.test(html2));

// ── §3  RED country_bases appear under Enemy Bases ────────────────────────────
console.log('\n§3  RED country_bases → Enemy Bases section');

var p3 = makeOb({
    country_bases: [
        base('IR-BND', 'RED', 'Bandar Abbas AB', { site_type: 'air_base', lat: 27.21, lon: 56.38 }),
    ],
});
var html3 = renderToHtml(p3);

ok('§3 "Enemy Bases (RED)" section present', /Enemy Bases \(RED\)/.test(html3));
ok('§3 Bandar Abbas appears in the HTML', /Bandar Abbas AB/.test(html3));
ok('§3 section label is "Enemy Bases" when only RED present', /Enemy Bases/.test(html3));

// ── §4  placement_candidates (only source) are counted ────────────────────────
console.log('\n§4  placement_candidates as the only base source');

var p4 = makeOb({
    placement_candidates: [
        base('UAE-DHF-PC', 'BLUE', 'Al Dhafra AB', { site_type: 'air_base', lat: 24.25, lon: 54.55, source_type: 'multi_country_step1_orbat' }),
        base('IR-BND-PC',  'RED',  'Bandar Abbas AB', { site_type: 'air_base', lat: 27.21, lon: 56.38, source_type: 'multi_country_step1_orbat' }),
    ],
});
var html4 = renderToHtml(p4);

ok('§4 Enemy chip > 0 from placement_candidates', /Enemy.*<b>1<\/b>/.test(html4));
ok('§4 Friendly chip > 0 from placement_candidates', /Friendly.*<b>1<\/b>/.test(html4));

// ── §5  Deduplication: same base in country_bases and placement_candidates ────
console.log('\n§5  Deduplication across country_bases and placement_candidates');

var SHARED_ID = 'UAE-DHF-SHARED';
var p5 = makeOb({
    country_bases: [
        base(SHARED_ID, 'BLUE', 'Al Dhafra AB', { site_type: 'air_base', lat: 24.25, lon: 54.55 }),
    ],
    placement_candidates: [
        // same id — must NOT add a second entry
        base(SHARED_ID, 'BLUE', 'Al Dhafra AB', { site_type: 'air_base', lat: 24.25, lon: 54.55 }),
    ],
});
var html5 = renderToHtml(p5);
// Friendly chip should be 1 (not 2)
ok('§5 BLUE base counted once despite appearing in both country_bases and placement_candidates',
    /Friendly.*<b>1<\/b>/.test(html5));

// Also deduplicate by name when no stable id
var p5b = makeOb({
    country_bases: [
        { base_name_en: 'Bandar Abbas AB', side: 'RED', site_type: 'air_base', lat: 27.21, lon: 56.38, needs_review: true, source_type: 'multi_country_step1_orbat' },
    ],
    enemy_bases: [
        { base_name_en: 'Bandar Abbas AB', side: 'RED', site_type: 'air_base', lat: 27.21, lon: 56.38, needs_review: true, source_type: 'multi_country_step1_orbat' },
    ],
});
var html5b = renderToHtml(p5b);
ok('§5b RED base deduped across country_bases and enemy_bases (name-based key)',
    /Enemy.*<b>1<\/b>/.test(html5b));

// ── §6  Backward compat: legacy friendly_trial_bases / enemy_bases ────────────
console.log('\n§6  Backward compat — friendly_trial_bases and enemy_bases still work');

var p6 = makeOb({
    enemy_bases: [
        base('LEGACY-RED', 'RED', 'Legacy Enemy Base', { site_type: 'air_base', lat: 10.0, lon: 44.0 }),
    ],
    friendly_trial_bases: [
        base('LEGACY-BLUE', 'BLUE', 'Legacy Friendly Anchor', { site_type: 'friendly_trial_anchor' }),
    ],
});
var html6 = renderToHtml(p6);
ok('§6 legacy enemy_bases still counted as Enemy', /Enemy.*<b>1<\/b>/.test(html6));
ok('§6 legacy friendly_trial_bases still counted as Friendly', /Friendly.*<b>1<\/b>/.test(html6));
ok('§6 "Legacy Enemy Base" appears in HTML', /Legacy Enemy Base/.test(html6));
ok('§6 "Legacy Friendly Anchor" appears in HTML', /Legacy Friendly Anchor/.test(html6));

// ── §7  Full buildBriefFromMultiCountry end-to-end ────────────────────────────
console.log('\n§7  buildBriefFromMultiCountry end-to-end (gcc_iran_step1 shape)');

var GCC_FIXTURE = {
    countries: [
        {
            name: 'Iran',
            air_bases: [
                { name_ar: 'قاعدة بندر عباس الجوية', name_en: 'Bandar Abbas AB', lat: 27.21, lon: 56.38,
                  units: [{ platform: 'F-14A Tomcat', estimated_count: 24, type_ar: 'مقاتلة' }] },
            ],
            land_bases: [
                { name_ar: 'قاعدة شيراز البرية', name_en: 'Shiraz Land Base',
                  units: [{ platform: 'S-300 SAM', estimated_count: 4, type_ar: 'دفاع جوي' }] },
            ],
        },
        {
            name: 'UAE',
            air_bases: [
                { name_ar: 'قاعدة الظفرة الجوية', name_en: 'Al Dhafra AB', lat: 24.25, lon: 54.55,
                  units: [{ platform: 'F-16E Block 60', estimated_count: 24, type_ar: 'مقاتلة' }] },
            ],
        },
        {
            name: 'Saudi Arabia',
            air_bases: [
                { name_ar: 'قاعدة تبوك الجوية', name_en: 'Tabuk AB', lat: 28.37, lon: 36.62,
                  units: [{ platform: 'F-15SA', estimated_count: 24, type_ar: 'مقاتلة' }] },
            ],
        },
    ],
};

var result = MULTICOUNTRY.buildBriefFromMultiCountry(GCC_FIXTURE, { file: 'gcc_iran_step1_full_from_battle_system_excel' });
var htmlE2E = renderToHtml(result);

// Iran = RED (2 bases), UAE + KSA = BLUE (2 bases)
ok('§7 enemy_bases has Iran entries', result.brief.operational_brief.enemy_bases.length >= 1);
ok('§7 country_bases has BLUE entries', result.brief.operational_brief.country_bases.filter(function (b) { return b.side === 'BLUE'; }).length >= 1);
ok('§7 Enemy chip > 0', /Enemy.*<b>[1-9]\d*<\/b>/.test(htmlE2E));
ok('§7 Friendly chip > 0', /Friendly.*<b>[1-9]\d*<\/b>/.test(htmlE2E));
ok('§7 "Bases Review" section present (both sides)', /Bases Review/.test(htmlE2E));
ok('§7 "Friendly Bases (BLUE)" subsection present', /Friendly Bases \(BLUE\)/.test(htmlE2E));
ok('§7 "Enemy Bases (RED)" subsection present', /Enemy Bases \(RED\)/.test(htmlE2E));
ok('§7 Al Dhafra AB appears under Friendly', /Al Dhafra AB/.test(htmlE2E));
ok('§7 Bandar Abbas AB appears under Enemy', /Bandar Abbas AB/.test(htmlE2E));
// "Friendly Anchors" label must be gone
ok('§7 old "Friendly Anchors" label not present', !/Friendly Anchors/.test(htmlE2E));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
