'use strict';

/*
 * RMOOZ cleanup gate: legacy AI Decision-Making Scenario Preview must stay retired.
 *
 * This is main-app only and does not touch offline.
 */

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

console.log('\n=== RMOOZ legacy demo scenario preview retirement gate ===\n');

var sandbox = { window: {}, Promise: Promise, Object: Object };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: file });
var api = sandbox.window.RmoozDemoPreview;

assert('legacy preview module still exports compatibility bridge', !!api && typeof api === 'object');
assert('build remains callable for old callers', typeof api.build === 'function');
assert('clear remains callable for old callers', typeof api.clear === 'function');
assert('isActive always false', api.isActive() === false);
assert('step count always zero', api.getStepCount() === 0);
assert('retirement code is exposed', api.RETIRED && api.RETIRED.code === 'legacy_ai_decision_scenario_preview_retired');
assert('no fetch call remains', !/\bfetch\s*\(/.test(stripped));
assert('no Leaflet layer creation remains', !/layerGroup\s*\(|L\.marker\s*\(|L\.polyline\s*\(/.test(stripped));
assert('no preview DOM panel remains', !/rmooz-demo-preview-panel|document\.createElement\s*\(\s*['"]div['"]\s*\)/.test(stripped));
assert('no map mutation/removal remains', !/window\.map|addTo\s*\(|removeLayer\s*\(/.test(stripped));

api.build({}).then(function (result) {
    assert('runtime build returns retired disabled result', result && result.disabled === true && result.retired === true);
    assert('runtime build does not return preview steps', !result.preview && !result.steps);
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
    if (failed) process.exit(1);
}).catch(function (err) {
    console.error('FAIL build promise rejected: ' + err.message);
    process.exit(1);
});
