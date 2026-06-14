#!/usr/bin/env node
/*
 * STEP1-EXCEL-JSON-BASE-ASSIGNMENT-A
 *
 * Regression for the assignment-loss bug: when a multi-country coalition JSON
 * (converted from Excel / Battle-System) uses name_en / name_ar for base names
 * instead of base_name_en / base_name_ar, units lose their base linkage and
 * fall into "Global Unassigned" regardless of whether coordinates are present.
 *
 * Root causes fixed in buildMultiCountryStep1 (multi-country-orbat.js):
 *   1. Read b.name_en || b.base_name_en  (and name_ar variant) so base names
 *      survive into nameMatches tokens.
 *   2. Stamp assigned_base_id: baseObj.id on every unit so baseIdMatches
 *      fires even when both names and coordinates are absent.
 *   3. Carry id + base_id on placement_candidate anchors so baseIdMatches
 *      works from the anchor side too.
 *
 * Test fixture shape matches gcc_iran_step1_full_from_battle_system_excel:
 *   - countries[].name  (not base_name_en on bases)
 *   - air_bases[].name_en / name_ar  (Excel uses name_en, not base_name_en)
 *   - One base WITH coordinates   → coordMatches + nameMatches + baseIdMatches
 *   - One base WITHOUT coordinates → nameMatches + baseIdMatches (no coord fallback)
 *   - Units nested under bases with no assigned_base_id in the source JSON
 *   - A separate country with no base assignments (units must stay Global Unassigned)
 */
'use strict';

var path = require('path');
var MULTICOUNTRY = require(path.join(__dirname, 'UI_MOdified/server/ai/multi-country-orbat.js'));

// ── DOM stub (base-status-panel needs document.createElement etc.) ──────────
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

require(path.join(__dirname, 'UI_MOdified/client/shell/world-state-db.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/symbol-db.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/base-status-panel.js'));
var BSP = global.window.RmoozBaseStatusPanel;

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

console.log('STEP1-EXCEL-JSON-BASE-ASSIGNMENT-A');

// ── Fixture: gcc_iran_step1_full_from_battle_system_excel shape ──────────────
// Uses name_en / name_ar on bases (not base_name_en / base_name_ar).
// Iran → RED; UAE → BLUE. One Iran base has coords; one has none.
var EXCEL_FIXTURE = {
    countries: [
        {
            name: 'Iran',
            air_bases: [
                {
                    name_ar: 'قاعدة بندر عباس الجوية',
                    name_en: 'Bandar Abbas AB',
                    lat: 27.21, lon: 56.38,
                    units: [
                        { platform: 'F-14A Tomcat',  estimated_count: 24, type_ar: 'مقاتلة' },
                        { platform: 'F-4E Phantom',  estimated_count: 16, type_ar: 'مقاتلة' },
                    ],
                },
            ],
            land_bases: [
                {
                    name_ar: 'قاعدة شيراز البرية',
                    name_en: 'Shiraz Land Base',
                    // NO coordinates — this is the no-coord regression case
                    units: [
                        { platform: 'S-300 SAM',     estimated_count: 4,  type_ar: 'دفاع جوي' },
                        { platform: 'Shahed-136 UAV', estimated_count: 20, type_ar: 'طائرة مسيرة' },
                    ],
                },
            ],
        },
        {
            name: 'UAE',
            air_bases: [
                {
                    name_ar: 'قاعدة الظفرة الجوية',
                    name_en: 'Al Dhafra AB',
                    lat: 24.25, lon: 54.55,
                    units: [
                        { platform: 'F-16E Block 60', estimated_count: 24, type_ar: 'مقاتلة' },
                    ],
                },
            ],
        },
    ],
};

// ── Section 1: buildMultiCountryStep1 output audit ──────────────────────────
console.log('\n§1  buildMultiCountryStep1 — unit/anchor shape audit');

var result = MULTICOUNTRY.buildBriefFromMultiCountry(EXCEL_FIXTURE, { file: 'gcc_iran_step1_full_from_battle_system_excel' });
var ob = result.brief.operational_brief;

ok('proposed_units count = 5', ob.proposed_units.length === 5);
ok('placement_candidates count = 2 (only coord bases)', ob.placement_candidates.length === 2);
ok('country_bases count = 3 (all bases incl. no-coord)', ob.country_bases.length === 3);

// Unit name fields must be populated (was empty before fix)
var tomcat = ob.proposed_units.find(function (u) { return u.platform === 'F-14A Tomcat'; });
ok('T1: F-14A Tomcat base_name_en populated', !!tomcat && tomcat.base_name_en === 'Bandar Abbas AB');
ok('T1: F-14A Tomcat assigned_base_id present', !!tomcat && typeof tomcat.assigned_base_id === 'string' && tomcat.assigned_base_id.length > 0);

var sam = ob.proposed_units.find(function (u) { return u.platform === 'S-300 SAM'; });
ok('T2: S-300 SAM (no-coord base) base_name_en populated', !!sam && sam.base_name_en === 'Shiraz Land Base');
ok('T2: S-300 SAM assigned_base_id present', !!sam && typeof sam.assigned_base_id === 'string' && sam.assigned_base_id.length > 0);

// Placement candidate must carry id + base_id
var bandarAnchor = ob.placement_candidates.find(function (a) { return /bandar/i.test(a.base_name_en || a.mention || ''); });
ok('T3: Bandar Abbas anchor has id field', !!bandarAnchor && typeof bandarAnchor.id === 'string' && bandarAnchor.id.length > 0);
ok('T3: Bandar Abbas anchor base_id === id', !!bandarAnchor && bandarAnchor.base_id === bandarAnchor.id);

// Unit assigned_base_id must match the anchor's id
ok('T4: F-14A assigned_base_id matches Bandar Abbas anchor id', !!tomcat && !!bandarAnchor && tomcat.assigned_base_id === bandarAnchor.id);

// S-300 (no-coord base) assigned_base_id must match the country_base id
var shirazBase = ob.country_bases.find(function (b) { return /shiraz/i.test(b.base_name_en || ''); });
ok('T5: S-300 assigned_base_id matches Shiraz country_base id', !!sam && !!shirazBase && sam.assigned_base_id === shirazBase.id);

// UAE unit
var f16 = ob.proposed_units.find(function (u) { return /F-16E/.test(u.platform || ''); });
ok('T6: F-16E base_name_en populated', !!f16 && f16.base_name_en === 'Al Dhafra AB');
ok('T6: F-16E side = BLUE', !!f16 && f16.side === 'BLUE');

// ── Section 2: BSP matching — units appear under their base, NOT in Global Unassigned ──
console.log('\n§2  BSP matching — Bandar Abbas AB (with coords)');

// Build the BSP payload as the server would deliver it
var PAYLOAD = { brief: result.brief };

// Open BSP on the Bandar Abbas anchor
BSP.open(bandarAnchor, PAYLOAD);
var panel = elements['step1-base-status-panel'];
ok('BSP opens for Bandar Abbas anchor', !!panel);

// F-14A and F-4E must appear under the Proposed Units section (not in Global Unassigned)
var html = panel ? panel.innerHTML : '';
function proposedSection(h) {
    var s = h.indexOf('Proposed Units');
    if (s < 0) return '';
    var rest = h.slice(s);
    var end = rest.indexOf('Global Unassigned');
    if (end < 0) end = rest.indexOf('Capability Summary');
    return end >= 0 ? rest.slice(0, end) : rest;
}
function unassignedSection(h) {
    var m = h.match(/<details class="bsp-unassigned-details">([\s\S]*?)<\/details><\/section>/);
    return m ? m[1] : '';
}
function rowCount(fragment) { return (fragment.match(/bsp-u-row/g) || []).length; }

ok('F-14A Tomcat in Proposed Units (Bandar Abbas)', /F-14A Tomcat/.test(proposedSection(html)));
ok('F-4E Phantom in Proposed Units (Bandar Abbas)', /F-4E Phantom/.test(proposedSection(html)));
ok('F-14A NOT in Global Unassigned (Bandar Abbas)', !/F-14A Tomcat/.test(unassignedSection(html)));
ok('exactly 2 proposed rows under Bandar Abbas', rowCount(proposedSection(html)) === 2);

// UAE unit must not appear here (different side/country)
ok('F-16E Block 60 NOT under Bandar Abbas', !/F-16E/.test(proposedSection(html)));

// S-300 (different base) must not appear in Proposed Units for Bandar Abbas
ok('S-300 NOT in Bandar Abbas Proposed Units', !/S-300 SAM/.test(proposedSection(html)));

console.log('\n§3  BSP matching — Shiraz Land Base (NO coordinates)');

// Find the Shiraz country_base (it has no placement_candidate → no map marker,
// but allBases() includes it). Open BSP using the country_base object as anchor.
BSP.open(shirazBase, PAYLOAD);
var panel2 = elements['step1-base-status-panel'];
var html2 = panel2 ? panel2.innerHTML : '';

ok('BSP opens for Shiraz base', !!panel2 && /Shiraz/.test(html2));
ok('S-300 SAM in Proposed Units (Shiraz)', /S-300 SAM/.test(proposedSection(html2)));
ok('Shahed-136 UAV in Proposed Units (Shiraz)', /Shahed-136 UAV/.test(proposedSection(html2)));
ok('S-300 NOT in Global Unassigned (Shiraz)', !/S-300 SAM/.test(unassignedSection(html2)));
ok('exactly 2 proposed rows under Shiraz (no-coord base)', rowCount(proposedSection(html2)) === 2);

// F-14A (different base) must not appear here
ok('F-14A NOT in Shiraz Proposed Units', !/F-14A Tomcat/.test(proposedSection(html2)));

console.log('\n§4  BSP matching — Al Dhafra AB (UAE, BLUE side)');

var dhafraAnchor = ob.placement_candidates.find(function (a) { return /dhafra/i.test(a.base_name_en || a.mention || ''); });
BSP.open(dhafraAnchor, PAYLOAD);
var panel3 = elements['step1-base-status-panel'];
var html3 = panel3 ? panel3.innerHTML : '';

ok('BSP opens for Al Dhafra AB', !!panel3 && /Dhafra/.test(html3));
ok('F-16E Block 60 in Proposed Units (Al Dhafra)', /F-16E Block 60/.test(proposedSection(html3)));
ok('F-16E NOT in Global Unassigned (Al Dhafra)', !/F-16E Block 60/.test(unassignedSection(html3)));
ok('Iran units NOT under Al Dhafra (side guard)', !/F-14A/.test(proposedSection(html3)));

console.log('\n§5  Global Unassigned check — no phantom spillover');

// Open Bandar Abbas again to confirm Global Unassigned is empty (all 2 units matched)
BSP.open(bandarAnchor, PAYLOAD);
var html5 = panel ? panel.innerHTML : '';
ok('Global Unassigned section absent or empty for fully-assigned base (Bandar Abbas)',
    unassignedSection(html5) === '' || rowCount(unassignedSection(html5)) === 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
