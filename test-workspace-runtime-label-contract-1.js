/* ============================================================================
 * test-workspace-runtime-label-contract-1.js
 * Workspace contract: authored-frame navigation is hidden developer UI.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HTML = read('UI_MOdified/client/app.html');
const I18N = read('UI_MOdified/client/i18n.js');
const WORKSPACE = read('UI_MOdified/client/shell/scenario-workspace.js');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function tagById(html, id) {
    const re = new RegExp('<[^>]+id="' + id + '"[^>]*>', 'i');
    const m = html.match(re);
    return m ? m[0] : '';
}

function tagByDataGroup(html, group) {
    const re = new RegExp('<section[^>]+data-sw-group="' + group + '"[^>]*>', 'i');
    const m = html.match(re);
    return m ? m[0] : '';
}

console.log('\n=== Scenario Workspace runtime label contract gate ===\n');

const clockGroup = tagByDataGroup(HTML, 'clock');
ok('A1 workspace authored-frame group is hidden, inert, and developer-only',
    /\bhidden\b/i.test(clockGroup) &&
    /\binert\b/i.test(clockGroup) &&
    /aria-hidden="true"/i.test(clockGroup) &&
    /data-dev-only="authored-frame-review"/i.test(clockGroup));
ok('A2 compatibility nav ids remain present inside the hidden group',
    HTML.includes('id="spt-card"') &&
    HTML.includes('id="spt-phase-list"') &&
    HTML.includes('id="sw-nav-card"') &&
    HTML.includes('id="sw-nav-play"') &&
    HTML.includes('id="sw-nav-speed"'));
ok('A3 hidden group uses internal frame language',
    HTML.includes('Internal authored-frame review') &&
    HTML.includes('Internal authored frames') &&
    HTML.includes('Internal Frame Navigator') &&
    HTML.includes('Previous frame') &&
    HTML.includes('Next frame'));
ok('A4 old visible step/snapshot labels are absent from shipped workspace HTML/i18n',
    !HTML.includes('Step review navigation') &&
    !HTML.includes('Live Step Review Navigator') &&
    !HTML.includes('Next snapshot') &&
    !I18N.includes('Step review navigation') &&
    !I18N.includes('Next snapshot'));
ok('A5 source-review labels replace Step 1/Step 2 confirmation copy',
    HTML.includes('Source review complete') &&
    HTML.includes('Decision gate complete') &&
    I18N.includes("'sw-conf-step1-label':     'Source review complete'") &&
    I18N.includes("'sw-conf-step2-label':     'Decision gate complete'"));

ok('B1 workspace still registers preview renderer for internal compatibility',
    WORKSPACE.includes('window.AppScenarioRunner.registerPreviewRenderer(goToStep)'));
ok('B2 workspace preview playback still uses preview runner only',
    WORKSPACE.includes('window.AppScenarioRunner.play()') &&
    WORKSPACE.includes('window.AppScenarioRunner.pause()'));
ok('B3 workspace does not call C3b runtime scenario controls',
    !/(runScenarioContinuous|runScenario\s*\(|_setScenarioClockPlaying|scenarioClockLabel|runClock\.playing)/.test(WORKSPACE));
ok('B4 authored steps and phase_table stay internal data paths',
    WORKSPACE.includes('Array.isArray(sc.phase_table)') &&
    WORKSPACE.includes('Array.isArray(sc.steps)'));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
