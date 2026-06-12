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

// DB1 + SYMBOL-DB-B categorizer load BEFORE the panel (which delegates systems lookup to it).
require(path.join(__dirname, 'UI_MOdified/client/shell/world-state-db.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/symbol-db.js'));
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

ok('exposes Base Status Panel API', BasePanel && typeof BasePanel.open === 'function' && typeof BasePanel.normalizePlatform === 'function');
ok('unknown platform normalizes to unknown/catalog required path',
    BasePanel.normalizePlatform({ platform: 'Unlisted Platform X' }).symbol_category === 'unknown');

BasePanel.open(candidateFromBase(hamedan), payload);
var panel = elements['step1-base-status-panel'];
ok('clicking/opening Hamedan renders Base Status Panel', panel && /Hamedan/.test(panel.innerHTML));
ok('Hamedan table includes fighter categories', /F-14A Tomcat/.test(panel.innerHTML) && /air_fighter/.test(panel.innerHTML));
ok('Hamedan remains review-only and exact false', /Review only/.test(panel.innerHTML) && /exact_unit_position:false/.test(panel.innerHTML));

BasePanel.open(candidateFromBase(bandar), payload);
ok('Bandar Abbas opens grouped platform panel', /Bandar Abbas/.test(panel.innerHTML) && /P-3F Orion/.test(panel.innerHTML) && /C-130H/.test(panel.innerHTML));
ok('Bandar Abbas proposed unit table count matches data',
    (panel.innerHTML.match(/bsp-u-row/g) || []).length === 3);
ok('Bandar Abbas unknown platform does not crash and shows catalog required',
    /Unlisted Platform X/.test(panel.innerHTML) && /unknown/.test(panel.innerHTML) && /Catalog required/.test(panel.innerHTML));
ok('Bandar Abbas evidence shows source and doctrine warning', /source file: Iran_Qatar/.test(panel.innerHTML) && /Doctrine required warning: true/.test(panel.innerHTML));

BasePanel.open(candidateFromBase(chabahar), payload);
ok('Chabahar opens panel with helicopter category', /Chabahar/.test(panel.innerHTML) && /AB-212/.test(panel.innerHTML) && /helicopter/.test(panel.innerHTML));

BasePanel.open(candidateFromBase(blue), payload);
ok('BLUE trial base shows BLUE side', /Blue Trial Base 1/.test(panel.innerHTML) && />BLUE</.test(panel.innerHTML));

// ── SYMBOL-DB-C: full SYMBOL-DB-B enrichment surfaced per proposed unit (reused, not re-derived) ──
var tabriz = base('Tabriz', 'تبریز', 'RED', 'air_base', 38.13, 46.23);
var symPayload = { documents: [{ filename: 'sym.json' }], brief: { operational_brief: {
    task_assembly: {}, enemy: { units: [] }, friendly: { units: [] }, courses_of_action: [],
    enemy_bases: [tabriz], friendly_trial_bases: [],
    proposed_units: [ unit('RED', 'Tabriz', 'f16c', 6, 'مقاتلة'), unit('RED', 'Tabriz', 'F-14A Tomcat', 12, 'مقاتلة') ],
    missing_information: [] } } };
BasePanel.open(candidateFromBase(tabriz), symPayload);
// symPayload = one MATCHED unit (f16c, DB1 systems) + one catalog-MISSING unit (F-14A, no DB1 systems).
var f16cat = global.window.AppWorldStateDB.CAPABILITY_CATALOG.f16c;
var f16SysCount = f16cat.sensors.length + f16cat.weapons.length + f16cat.magazines.length;
var enrF16 = BasePanel.normalizePlatform({ platform: 'f16c' });
var sensorTok = (enrF16.sensors[0] && (enrF16.sensors[0].label || enrF16.sensors[0].class)) || '';
ok('SYMBOL-DB-C: matched platform surfaces its DB1 sensor in the card', sensorTok.length > 0 && panel.innerHTML.indexOf(sensorTok) !== -1);
ok('SYMBOL-DB-C: catalog_match_status (matched) + confidence% shown', /bsp-cat-matched/.test(panel.innerHTML) && /\d+%/.test(panel.innerHTML));
ok('SYMBOL-DB-C: platform_class (f16c) + capability_summary surfaced',
    /Platform class/.test(panel.innerHTML) && /f16c/.test(panel.innerHTML) && enrF16.capability_summary.length > 0 && panel.innerHTML.indexOf(enrF16.capability_summary) !== -1);
// NO-INVENT (panel-level): the panel renders EXACTLY DB1's f16c system chips and NONE for the catalog-missing F-14A.
// (the catalog-missing unit contributes zero .bsp-syschip), so total rendered chips == f16c's DB1 system count.
var renderedChips = (panel.innerHTML.match(/bsp-syschip/g) || []).length;
ok('SYMBOL-DB-C: panel renders EXACTLY DB1 systems for the matched unit, none invented / none for missing',
    f16SysCount > 0 && renderedChips === f16SysCount);
ok('SYMBOL-DB-C: every DB1 f16c sensor (label|class) is surfaced in the card',
    f16cat.sensors.every(function (s) { return panel.innerHTML.indexOf(s.label || s.class) !== -1; }));
ok('SYMBOL-DB-C: every DB1 f16c weapon (class) is surfaced in the card',
    f16cat.weapons.every(function (w) { return panel.innerHTML.indexOf(w.class || w.id) !== -1; }));
// per-unit Catalog-required banner (.bsp-catreq) + .bsp-u-missing flag appear for EXACTLY the 1 catalog-missing unit
// (not from the static Systems/Capability tab, which uses .bsp-tab-body, and not from the always-present header chip).
ok('SYMBOL-DB-C: per-unit Catalog-required banner shown for exactly the 1 catalog-missing unit',
    (panel.innerHTML.match(/bsp-catreq/g) || []).length === 1 && (panel.innerHTML.match(/bsp-u-missing/g) || []).length === 1);
ok('SYMBOL-DB-C: catalog-missing unit (F-14A) lists its empty systems in unknown_fields',
    /F-14A Tomcat/.test(panel.innerHTML) && /Unknown fields/.test(panel.innerHTML) && /sensors, weapons, magazines/.test(panel.innerHTML));

// The live content-band MEASUREMENT now lives in shell-safe-area.js (publishes the CSS vars
// the card binds to) and is covered by test-shell-safe-area.js. The card no longer sets inline
// geometry — it positions purely via --rmooz-shell-top-safe / --rmooz-shell-bottom-safe.

var fakeLayer = null;
var clicked = false;
global.window.RmoozBaseStatusPanel.open = function (anchor) { clicked = anchor && anchor.base_name_en === 'Bandar Abbas'; };
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
ok('clicking placement marker opens Base Status Panel', clicked === true);
ok('map marker remains review-only and not exact unit position',
    fakeLayer && fakeLayer.layers[0]._rmoozReviewOnly === true && fakeLayer.layers[0]._rmoozExactUnitPosition === false);
ok('no final scenario units or tasking created by panel payload',
    payload.brief.operational_brief.enemy.units.length === 0 &&
    payload.brief.operational_brief.friendly.units.length === 0 &&
    payload.brief.operational_brief.courses_of_action.length === 0);

// ── SYMBOL-DB-B integration: panel delegates systems lookup to the categorizer ──
var npF16 = BasePanel.normalizePlatform({ platform: 'f16c' });
ok('SYMBOL-DB-B: known platform -> panel shows catalog matched + real systems',
    npF16.catalog_match_status === 'matched' && npF16.sensors.length > 0);
var npUnknown = BasePanel.normalizePlatform({ platform: 'Unlisted Platform X' });
ok('SYMBOL-DB-B: unknown platform -> no invented systems (sensors empty), still unknown',
    npUnknown.symbol_category === 'unknown' && npUnknown.sensors.length === 0 && npUnknown.weapons.length === 0);
var npHelo = BasePanel.normalizePlatform({ platform: 'AB-212' });
ok('SYMBOL-DB-B: category-only platform unchanged (helicopter, no invented systems)',
    npHelo.symbol_category === 'helicopter' && npHelo.sensors.length === 0);

// ── LAYOUT REGRESSION (fix: keep object status card above playback footer) ──
var styleEl = global.document.getElementById('step1-base-status-style');
var css = (styleEl && styleEl.textContent) || '';
ok('layout: card injects its stylesheet', css.length > 0);
var panelRule = (css.match(/\.step1-base-status-panel\{[^}]*\}/) || [''])[0];
var bodyRule = (css.match(/\.bsp-body\{[^}]*\}/) || [''])[0];
ok('layout: card is NOT full-viewport height (no height:100vh under the bars)', panelRule.indexOf('height:100vh') === -1);
ok('layout: card is bounded to the shell bottom safe-area var', /bottom:var\(--rmooz-shell-bottom-safe/.test(panelRule));
ok('layout: card is bounded to the shell top safe-area var', /top:var\(--rmooz-shell-top-safe/.test(panelRule));
ok('layout: card max-height is clamped to the content band (calc 100vh - top - bottom)',
    /max-height:calc\(100vh - var\(--rmooz-shell-top-safe/.test(panelRule));
ok('layout: OUTER card clips (overflow:hidden) so it cannot pass behind chrome', /overflow:hidden/.test(panelRule));
ok('layout: card is a flex column (header fixed + scrolling body)', /display:flex/.test(panelRule) && /flex-direction:column/.test(panelRule));
ok('layout: INNER body scrolls (overflow-y:auto + min-height:0)', /overflow-y:auto/.test(bodyRule) && /min-height:0/.test(bodyRule));
ok('layout: card keeps its z-index (940, no stacking creep)', /z-index:940/.test(panelRule));
ok('layout: proposed-units table min-width reduced for the panel (600, not 680)',
    /\.bsp-table\{[^}]*min-width:600px/.test(css) && css.indexOf('min-width:680px') === -1);
ok('layout: warning cells wrap long Arabic/English text (word-break)', /word-break:break-word/.test(css));
ok('layout: render wraps content in the scrolling .bsp-body', /<div class="bsp-body">/.test(panel.innerHTML));
ok('layout: open did not throw with the shared measurer wired (panel rendered)', /Review only/.test(panel.innerHTML) && panel.innerHTML.length > 200);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
