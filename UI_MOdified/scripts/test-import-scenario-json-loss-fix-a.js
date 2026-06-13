#!/usr/bin/env node
/*
 * IMPORT-SCENARIO-JSON-LOSS-FIX-A
 * Verifies the Step 1 JSON understanding path and Base Status id matching.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WIZ = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'), 'utf8');
const WS = fs.readFileSync(path.join(ROOT, 'client', 'shell', 'scenario-workspace.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'client', 'app.html'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

console.log('\nIMPORT-SCENARIO-JSON-LOSS-FIX-A\n');

test('Import Scenario wizard exposes Step 1 / operational JSON input', function () {
    assert(WIZ.indexOf('id="wg-wz-json"') !== -1, 'wg-wz-json input missing');
    assert(WIZ.indexOf('Choose Step 1 JSON') !== -1, 'Step 1 JSON label missing');
    assert(WIZ.indexOf('does not require steps[]') !== -1, 'steps[] exemption copy missing');
});

test('Step 1 JSON path posts parsed object to /api/wargame-sim/analyze', function () {
    assert(WIZ.indexOf('st.jsonImport') !== -1, 'json import state missing');
    assert(WIZ.indexOf("api('POST', '/api/wargame-sim/analyze', analyzeBody)") !== -1, 'analyze POST missing');
    assert(WIZ.indexOf('source_payload') !== -1, 'source_payload diagnostics missing');
    assert(WIZ.indexOf('loadLiveScenarioFromJson(st.jsonImport') === -1, 'json import must not call live scenario loader');
});

test('MDMP bundle path remains separate', function () {
    assert(WIZ.indexOf('{ bundle: st.mdmpFiles }') !== -1, 'MDMP bundle path missing');
    assert(WIZ.indexOf('id="wg-wz-mdmp"') !== -1, 'MDMP input missing');
});

test('Live Scenario JSON remains full-scenario steps[] loader with warning', function () {
    assert(APP.indexOf('Legacy / Full Scenario JSON') !== -1, 'legacy/full scenario label missing');
    assert(APP.indexOf('expects a full RMOOZ scenario with steps[]') !== -1, 'steps[] subtitle missing');
    assert(WS.indexOf('STEPS_MISSING_OR_EMPTY') !== -1, 'steps[] validator missing');
    assert(WS.indexOf('Use Review AI Understanding for Step 1 / operational JSON') !== -1, 'helpful Step 1 warning missing');
});

// DOM stub for base-status-panel.js
const elements = {};
function makeEl(tag) {
    return {
        tagName: tag, id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {},
        appendChild: function (el) { this.children.push(el); if (el.id) elements[el.id] = el; return el; },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function () {},
        querySelector: function (sel) { if (sel === '.bsp-close') return { addEventListener: function () {} }; return null; },
    };
}
global.document = {
    body: makeEl('body'),
    head: makeEl('head'),
    createElement: makeEl,
    getElementById: function (id) { return elements[id] || null; },
};
global.window = { document: global.document };

require(path.join(ROOT, 'client', 'shell', 'base-status-panel.js'));
const BSP = global.window.RmoozBaseStatusPanel;

function anchor(id, name) {
    return { id: id, base_id: id, side: 'BLUE', country_key: 'uae', country: 'UAE', base_name_en: name, site_type: 'air_base', lat: 24.2, lon: 54.5, needs_review: true, exact_unit_position: false };
}
function unit(fields) {
    return Object.assign({ side: 'BLUE', country_key: 'uae', platform: 'F-16E', estimated_count: 1, needs_review: true, exact_unit_position: false }, fields || {});
}

test('proposed_units with assigned_base_id attach to Base Status anchor', function () {
    const payload = { brief: { operational_brief: { proposed_units: [unit({ id: 'U-assigned', assigned_base_id: 'B1' })], placement_candidates: [anchor('B1', 'Different Name')], country_bases: [anchor('B1', 'Different Name')] } } };
    BSP.open(anchor('B1', 'Different Name'), payload);
    const html = global.document.getElementById('step1-base-status-panel').innerHTML;
    assert(/F-16E/.test(html), 'assigned_base_id unit not shown');
    assert(/Proposed units count<\/span><b>1/.test(html), 'assigned_base_id unit not counted');
});

test('proposed_units with base_id attach to Base Status anchor', function () {
    const payload = { brief: { operational_brief: { proposed_units: [unit({ id: 'U-base', base_id: 'B2', platform: 'Rafale' })], placement_candidates: [anchor('B2', 'Anchor Two')], country_bases: [anchor('B2', 'Anchor Two')] } } };
    BSP.open(anchor('B2', 'Anchor Two'), payload);
    const html = global.document.getElementById('step1-base-status-panel').innerHTML;
    assert(/Rafale/.test(html), 'base_id unit not shown');
    assert(/Proposed units count<\/span><b>1/.test(html), 'base_id unit not counted');
});

test('unmatched proposed_units appear under Unassigned / needs base review', function () {
    const payload = { brief: { operational_brief: { proposed_units: [unit({ id: 'U-orphan', assigned_base_id: 'NOPE', platform: 'Mirage 2000' })], placement_candidates: [anchor('B3', 'Anchor Three')], country_bases: [anchor('B3', 'Anchor Three')] } } };
    BSP.open(anchor('B3', 'Anchor Three'), payload);
    const html = global.document.getElementById('step1-base-status-panel').innerHTML;
    assert(/Unassigned \/ needs base review/.test(html), 'unassigned section missing');
    assert(/Mirage 2000/.test(html), 'orphaned unit not displayed');
});

test('Base Status creates no actual unit markers or exact positions', function () {
    assert(typeof global.window.units === 'undefined', 'window.units should not be created');
    assert(!/exact_unit_position:\s*true/.test(WIZ), 'wizard must not mark proposed_units exact');
    assert(!/proposed_units[\s\S]{0,120}L\.marker/.test(WIZ), 'wizard must not create markers from proposed_units');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
