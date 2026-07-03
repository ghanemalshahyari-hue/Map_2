/* ============================================================================
 * test-cmo-wargame-scc-guide-main-1.js
 * CMO-WARGAME-SCC-GUIDE-1 - Main SCC Guide Button Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate. It verifies Scenario Control Center exposes a visible
 * CMO Test Guide button that reuses the existing Scenario Evidence CMO target.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SCC_PATH = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js');
var RUNBOOK = path.join(ROOT, 'UI_MOdified', 'docs', 'cmo-evidence-demo-runbook.md');
var INVENTORY = path.join(ROOT, 'APP_INVENTORY.md');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function freshRequire(file) {
    delete require.cache[require.resolve(file)];
    return require(file);
}

console.log('\n=== CMO-WARGAME-SCC-GUIDE-1 Main Gate ===\n');

console.log('--- SCC-GUIDE-1: visible SCC guide affordance ---');
(function () {
    var scc = src(SCC_PATH);
    assert('T-1  SCC header contains CMO Test Guide label', scc.indexOf('CMO Test Guide') !== -1);
    assert('T-2  SCC header button has dedicated scc-cmo-guide action', scc.indexOf('data-act="scc-cmo-guide"') !== -1);
    assert('T-3  guide button opens Scenario Evidence CMO target', scc.indexOf("openScenarioEvidenceTarget('cmo')") !== -1);
    assert('T-4  SCC bind registers the guide action', scc.indexOf("bindFn('scc-cmo-guide'") !== -1);
})();

console.log('\n--- SCC-GUIDE-2: click delegates to Unit Status CMO target ---');
(function () {
    var opened = [];
    global.window = {
        RmoozFreeFightDemo: { engine: {} },
        AppUnitStatusPanel: {
            openScenarioEvidenceTarget: function (target) { opened.push(target); }
        }
    };
    var SCC = freshRequire(SCC_PATH);
    var handlers = {};
    SCC.bind(function (act, fn) { handlers[act] = fn; });
    assert('T-1  bind exposes scc-cmo-guide handler', typeof handlers['scc-cmo-guide'] === 'function');
    handlers['scc-cmo-guide']();
    assert('T-2  handler opens CMO target exactly once', opened.length === 1 && opened[0] === 'cmo');
    delete global.window;
})();

console.log('\n--- SCC-GUIDE-3: docs and strict boundary ---');
(function () {
    var scc = src(SCC_PATH);
    var runbook = src(RUNBOOK);
    var inventory = src(INVENTORY);
    var guideSnippet = scc.slice(scc.indexOf('function btnGuide'), scc.indexOf('function flowHtml'));
    assert('T-1  runbook tells operators to use the SCC CMO Test Guide', runbook.indexOf('CMO Test Guide') !== -1);
    assert('T-2  inventory records the guide as display/navigation only', inventory.indexOf('CMO Test Guide') !== -1 && inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);
    [
        ['no fetch/network route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no storage/database write', /localStorage\s*\.|indexedDB|openDatabase/i],
        ['no combat/action/doctrine mutation API', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no DOCX staging revival', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|\.docx/i]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(guideSnippet)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
