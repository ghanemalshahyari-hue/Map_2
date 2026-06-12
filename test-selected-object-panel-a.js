#!/usr/bin/env node
/*
 * SELECTED-OBJECT-A: common selected object panel dispatcher checks.
 * No server, no map writes, no unit placement.
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
    dispatchEvent: function (evt) { this.lastEvent = evt; },
};
global.window = { document: global.document };

var delegatedUnit = null;
global.window.AppUnitStatusPanel = {
    populatePanel: function (unit) { delegatedUnit = unit; },
    openPanel: function () { this.opened = true; },
};

require(path.join(__dirname, 'UI_MOdified/client/shell/base-status-panel.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}

function base(en) {
    return {
        base_name_en: en,
        base_name_ar: 'همدان',
        side: 'RED',
        site_type: 'air_base',
        lat: 35.2116,
        lon: 48.6534,
        exact_unit_position: false,
        needs_review: true,
        warnings: ['base_known_exact_unit_position_unknown'],
        source_type: 'ai_candidate_from_external_llm',
    };
}
function unit(baseName, platform) {
    return {
        side: 'RED',
        base_name_en: baseName,
        platform: platform,
        estimated_count: 2,
        type_ar: 'مقاتلة',
        needs_review: true,
        exact_unit_position: false,
    };
}

var payload = {
    brief: {
        operational_brief: {
            task_assembly: { doctrine_upload_required: true },
            enemy: { units: [] },
            friendly: { units: [] },
            courses_of_action: [],
            enemy_bases: [base('Hamedan')],
            friendly_trial_bases: [],
            proposed_units: [unit('Hamedan', 'F-14A Tomcat')],
            missing_information: ['Hamedan: catalog link missing'],
        },
    },
    documents: [{ filename: 'step1.json' }],
};

console.log('SELECTED-OBJECT-A - common selected object panel');

ok('exposes window.openSelectedObjectPanel', typeof window.openSelectedObjectPanel === 'function');

window.openSelectedObjectPanel({
    object_kind: 'base',
    source: 'step1_external_app',
    review_only: true,
    exact_unit_position: false,
    data: base('Hamedan'),
    payload: payload,
});
var panel = elements['step1-base-status-panel'];
ok('clicking Hamedan opens common selected object panel', panel && /Hamedan/.test(panel.innerHTML));
ok('panel object_kind is base', panel && panel.attrs['data-object-kind'] === 'base');
ok('proposed units display', /F-14A Tomcat/.test(panel.innerHTML));
ok('exact_unit_position remains false', panel && panel.attrs['data-exact-unit-position'] === 'false' && /exact_unit_position:false/.test(panel.innerHTML));

window.openSelectedObjectPanel({ object_kind: 'infrastructure', data: { name: 'Bridge' } });
ok('infrastructure pending placeholder renders', /Infrastructure status support pending/.test(panel.innerHTML));

ok('unknown object_kind does not crash', (function () {
    try {
        window.openSelectedObjectPanel({ object_kind: 'unknown_kind', data: {} });
        return /Unsupported selected object type/.test(panel.innerHTML);
    } catch (_) {
        return false;
    }
})());

window.openSelectedObjectPanel({ object_kind: 'unit', data: { label: 'Unit A', uid: 'U-A' } });
ok('unit object delegates to existing unit panel path', delegatedUnit && delegatedUnit.uid === 'U-A' && window.AppUnitStatusPanel.opened === true);
ok('no final units created', payload.brief.operational_brief.enemy.units.length === 0 && payload.brief.operational_brief.friendly.units.length === 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
