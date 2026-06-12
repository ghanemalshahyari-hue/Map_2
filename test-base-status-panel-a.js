#!/usr/bin/env node
/*
 * BASE-STATUS-A: Step 1 Base Status Panel checks.
 * Headless browser-ish test: no server, no scenario execution, no unit placement.
 */
'use strict';

var path = require('path');

var elements = {};
function makeEl(tag) {
    return {
        tagName: tag,
        id: '',
        className: '',
        innerHTML: '',
        textContent: '',
        children: [],
        attrs: {},
        style: {},
        appendChild: function (el) {
            this.children.push(el);
            if (el.id) elements[el.id] = el;
            return el;
        },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        getAttribute: function (k) { return this.attrs[k]; },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function (name, fn) { this['on' + name] = fn; },
        querySelector: function (sel) {
            if (sel === '.bsp-close') return { addEventListener: function () {} };
            return null;
        },
    };
}
global.document = {
    body: makeEl('body'),
    head: makeEl('head'),
    createElement: makeEl,
    getElementById: function (id) { return elements[id] || null; },
};
global.window = {};
global.window.document = global.document;

require(path.join(__dirname, 'UI_MOdified/client/shell/base-status-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/placement-candidates-panel.js'));

var BasePanel = global.window.RmoozBaseStatusPanel;
var PlacementPanel = global.window.RmoozPlacementPanel;

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}

function base(en, ar, side, type, lat, lon) {
    return {
        id: side + '-' + en.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
        side: side,
        base_name_en: en,
        base_name_ar: ar,
        site_type: type,
        lat: lat,
        lon: lon,
        needs_review: true,
        exact_unit_position: false,
        source_type: 'ai_candidate_from_external_llm',
        source: { type: 'external_json', file: 'Iran_Qatar_step1_updated_red_blue_trial.json', confidence: 'low' },
    };
}
function candidateFromBase(b) {
    return {
        mention: b.base_name_en,
        base_name_en: b.base_name_en,
        base_name_ar: b.base_name_ar,
        side: b.side,
        site_type: b.site_type,
        placement_type: 'base_location_anchor',
        lat: b.lat,
        lon: b.lon,
        coordinate_format: 'base_anchor',
        ao_check: 'inside',
        exact_unit_position: false,
        needs_review: true,
        confidence: 'medium',
        source_type: 'ai_candidate_from_external_llm',
        warnings: ['base_known_exact_unit_position_unknown'],
        source: b.source,
    };
}
function unit(side, baseName, platform, count, typeAr) {
    return {
        side: side,
        base_name_en: baseName,
        platform: platform,
        estimated_count: count,
        type_ar: typeAr || 'طائرة',
        needs_review: true,
        exact_unit_position: false,
        source_type: 'ai_candidate_from_external_llm',
        warnings: ['ai_information_requires_review'],
    };
}

var hamedan = base('Hamedan', 'همدان', 'RED', 'air_base', 35.2116, 48.6534);
var bandar = base('Bandar Abbas', 'بندر عباس', 'RED', 'naval_base', 27.1961, 56.2878);
var chabahar = base('Chabahar', 'چابهار', 'RED', 'naval_base', 25.2928, 60.6497);
var blue = base('Blue Trial Base 1', 'مرساة زرقاء 1', 'BLUE', 'friendly_trial_anchor', 24.81, 51.21);
var payload = {
    documents: [{ filename: 'Iran_Qatar_step1_updated_red_blue_trial.json' }],
    brief: {
        operational_brief: {
            task_assembly: { doctrine_upload_required: true },
            enemy: { units: [] },
            friendly: { units: [] },
            courses_of_action: [],
            enemy_bases: [hamedan, bandar, chabahar],
            friendly_trial_bases: [blue],
            proposed_units: [
                unit('RED', 'Hamedan', 'F-14A Tomcat', 12, 'مقاتلة'),
                unit('RED', 'Hamedan', 'F-4E Phantom II', 8, 'مقاتلة / هجوم'),
                unit('RED', 'Bandar Abbas', 'P-3F Orion', 3, 'دورية بحرية'),
                unit('RED', 'Bandar Abbas', 'C-130H', 2, 'نقل'),
                unit('RED', 'Bandar Abbas', 'Unlisted Platform X', 1, 'غير معروف'),
                unit('RED', 'Chabahar', 'AB-212', 4, 'مروحية'),
                unit('BLUE', 'Blue Trial Base 1', 'Mohajer-6', 2, 'مسيرة'),
            ],
            missing_information: ['Bandar Abbas: catalog link missing'],
        },
    },
};

console.log('BASE-STATUS-A - Step 1 Base Status Panel');

ok('exposes common Selected Object Panel API',
    typeof global.window.openSelectedObjectPanel === 'function' &&
    BasePanel && typeof BasePanel.open === 'function' && typeof BasePanel.normalizePlatform === 'function');
ok('unknown platform normalizes to unknown/catalog required path',
    BasePanel.normalizePlatform({ platform: 'Unlisted Platform X' }).symbol_category === 'unknown');

global.window.openSelectedObjectPanel({
    object_kind: 'base',
    source: 'step1_external_app',
    review_only: true,
    exact_unit_position: false,
    data: { anchor: candidateFromBase(hamedan), payload: payload },
});
var panel = elements['unit-status-panel'];
ok('clicking/opening Hamedan renders common Selected Object panel', panel && /Hamedan/.test(panel.innerHTML));
ok('panel object_kind is base', panel && panel.getAttribute('data-object-kind') === 'base');
ok('Hamedan table includes fighter categories', /F-14A Tomcat/.test(panel.innerHTML) && /air_fighter/.test(panel.innerHTML));
ok('Hamedan remains review-only and exact false', /Review only/.test(panel.innerHTML) && /exact_unit_position:false/.test(panel.innerHTML));

global.window.openSelectedObjectPanel({ object_kind: 'base', source: 'step1_external_app', review_only: true, exact_unit_position: false, data: { anchor: candidateFromBase(bandar), payload: payload } });
ok('Bandar Abbas opens grouped platform panel', /Bandar Abbas/.test(panel.innerHTML) && /P-3F Orion/.test(panel.innerHTML) && /C-130H/.test(panel.innerHTML));
ok('Bandar Abbas proposed unit table count matches data',
    (panel.innerHTML.match(/<tr>/g) || []).length - 1 === 3);
ok('Bandar Abbas unknown platform does not crash and shows catalog required',
    /Unlisted Platform X/.test(panel.innerHTML) && /unknown/.test(panel.innerHTML) && /Catalog required/.test(panel.innerHTML));
ok('Bandar Abbas evidence shows source and doctrine warning', /source file: Iran_Qatar/.test(panel.innerHTML) && /Doctrine required warning: true/.test(panel.innerHTML));

global.window.openSelectedObjectPanel({ object_kind: 'base', source: 'step1_external_app', review_only: true, exact_unit_position: false, data: { anchor: candidateFromBase(chabahar), payload: payload } });
ok('Chabahar opens panel with helicopter category', /Chabahar/.test(panel.innerHTML) && /AB-212/.test(panel.innerHTML) && /helicopter/.test(panel.innerHTML));

global.window.openSelectedObjectPanel({ object_kind: 'base', source: 'step1_external_app', review_only: true, exact_unit_position: false, data: { anchor: candidateFromBase(blue), payload: payload } });
ok('BLUE trial base shows BLUE side', /Blue Trial Base 1/.test(panel.innerHTML) && />BLUE</.test(panel.innerHTML));

global.window.openSelectedObjectPanel({ object_kind: 'infrastructure', data: {} });
ok('infrastructure object kind renders pending placeholder',
    panel.getAttribute('data-object-kind') === 'infrastructure' && /Infrastructure status support pending/.test(panel.innerHTML));
global.window.openSelectedObjectPanel({ object_kind: 'unknown', data: {} });
ok('unknown object_kind does not crash',
    panel.getAttribute('data-object-kind') === 'unknown' && /Selected object support pending/.test(panel.innerHTML));

var unitBranch = { populated: false, opened: false, rehydrated: false };
global.window.AppUnitStatusPanel = {
    rehydratePanelControls: function () { unitBranch.rehydrated = true; },
    populatePanel: function (unitData) { unitBranch.populated = unitData && unitData.id === 'U-1'; },
    openPanel: function () { unitBranch.opened = true; },
};
global.window.openSelectedObjectPanel({ object_kind: 'unit', data: { id: 'U-1', label: 'Existing unit' } });
ok('existing selected unit panel path is routed through AppUnitStatusPanel',
    unitBranch.rehydrated && unitBranch.populated && unitBranch.opened);

var fakeLayer = null;
var clicked = false;
global.window.openSelectedObjectPanel = function (selection) {
    clicked = selection && selection.object_kind === 'base' &&
        selection.source === 'step1_external_app' &&
        selection.review_only === true &&
        selection.exact_unit_position === false &&
        selection.data && selection.data.anchor && selection.data.anchor.base_name_en === 'Bandar Abbas';
};
global.window.L = {
    divIcon: function (opts) { return opts; },
    marker: function () {
        return {
            _rmoozStep1PlacementAnchor: false,
            _rmoozReviewOnly: false,
            _rmoozExactUnitPosition: null,
            on: function (eventName, fn) { if (eventName === 'click') this.click = fn; return this; },
            bindPopup: function (html) { this.popup = html; return this; },
        };
    },
    layerGroup: function () {
        fakeLayer = {
            layers: [],
            addTo: function () { return this; },
            clearLayers: function () { this.layers = []; },
            addLayer: function (layer) { this.layers.push(layer); },
        };
        return fakeLayer;
    },
};
global.window.map = {};
PlacementPanel.render({ innerHTML: '' }, {
    brief: payload.brief,
    placement: { placement_candidates: [candidateFromBase(bandar)] },
});
if (fakeLayer && fakeLayer.layers[0] && fakeLayer.layers[0].click) fakeLayer.layers[0].click();
ok('clicking placement marker opens common Selected Object panel', clicked === true);
ok('map marker remains review-only and not exact unit position',
    fakeLayer && fakeLayer.layers[0]._rmoozReviewOnly === true && fakeLayer.layers[0]._rmoozExactUnitPosition === false);
ok('no final scenario units or tasking created by panel payload',
    payload.brief.operational_brief.enemy.units.length === 0 &&
    payload.brief.operational_brief.friendly.units.length === 0 &&
    payload.brief.operational_brief.courses_of_action.length === 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
