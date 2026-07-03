'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var file = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'demo-scenario-preview.js');
var source = fs.readFileSync(file, 'utf8');
var stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
var passed = 0;
var failed = 0;
function assert(label, cond) {
    if (cond) { console.log('PASS ' + label); passed += 1; }
    else { console.error('FAIL ' + label); failed += 1; }
}

console.log('\n=== RMOOZ demo preview retirement and workspace entry gate ===\n');

var strip = {
    attrs: {},
    innerHTML: 'old workspace notice',
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k] || null; }
};
var documentStub = {
    readyState: 'complete',
    querySelector: function (sel) { return sel === '.sw-readonly-strip' ? strip : null; },
    addEventListener: function () {}
};
var sandbox = { window: {}, document: documentStub, Promise: Promise, Object: Object };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: file });
var api = sandbox.window.RmoozDemoPreview;

assert('compat bridge is exported', !!api && typeof api === 'object');
assert('build remains callable', typeof api.build === 'function');
assert('clear remains callable', typeof api.clear === 'function');
assert('isActive always false', api.isActive() === false);
assert('step count always zero', api.getStepCount() === 0);
assert('retirement code is exposed', api.RETIRED && api.RETIRED.code === 'legacy_ai_decision_scenario_preview_retired');
assert('no fetch call remains', !/\bfetch\s*\(/.test(stripped));
assert('no Leaflet layer creation remains', !/layerGroup\s*\(|L\.marker\s*\(|L\.polyline\s*\(/.test(stripped));
assert('no old preview panel id remains', !/rmooz-demo-preview-panel/.test(stripped));
assert('no map layer write remains', !/window\.map|addTo\s*\(|removeLayer\s*\(/.test(stripped));
assert('live entry polish API is exposed', typeof api.installLiveWorkspaceEntryCopy === 'function');
assert('workspace strip is marked live', strip.attrs['data-workspace-mode'] === 'live');
assert('workspace strip points to Edit Mode', /Edit Mode/.test(strip.innerHTML));
assert('workspace strip points to Scenario Control Center', /Scenario Control Center/.test(strip.innerHTML));

api.build({}).then(function (result) {
    assert('runtime build returns retired result', result && result.disabled === true && result.retired === true);
    assert('runtime build does not return preview payload', !result.preview && !result.steps);
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
    if (failed) process.exit(1);
}).catch(function (err) {
    console.error('FAIL build promise rejected: ' + err.message);
    process.exit(1);
});
