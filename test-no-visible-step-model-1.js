/* ============================================================================
 * test-no-visible-step-model-1.js
 * C3e gate: normal operator UI presents runtime time, not authored steps.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HTML = read('UI_MOdified/client/app.html');
const I18N = read('UI_MOdified/client/i18n.js');
const SCC = read('UI_MOdified/client/shell/scenario-control-center.js');
const FF = read('UI_MOdified/client/shell/free-fight-demo.js');
const WORKSPACE = read('UI_MOdified/client/shell/scenario-workspace.js');
const TIMELINE = read('UI_MOdified/client/shell/timeline.js');
const WS = read('UI_MOdified/client/shell/world-state.js');
const UNIT = read('UI_MOdified/client/shell/unit-status-panel.js');
const HUD = read('UI_MOdified/client/wargame/adjudicator-hud.js');
const CMO_RUN = read('UI_MOdified/client/shell/cmo-wargame-run-instrumentation.js');
const CMO_AAR = read('UI_MOdified/client/shell/cmo-wargame-after-action-debrief.js');
const CMO_PACKAGE = read('UI_MOdified/client/shell/cmo-wargame-evidence-package.js');

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

function hiddenDev(tag, marker) {
    return !!tag &&
        /\bhidden\b/i.test(tag) &&
        /\binert\b/i.test(tag) &&
        /aria-hidden="true"/i.test(tag) &&
        new RegExp('data-dev-only="' + marker + '"', 'i').test(tag);
}

function bodyOfFunction(source, name) {
    const idx = source.indexOf('function ' + name + '(');
    if (idx < 0) return '';
    const open = source.indexOf('{', idx);
    if (open < 0) return '';
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(open, i + 1);
        }
    }
    return '';
}

function stripComments(text) {
    return String(text || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

console.log('\n=== C3e no visible step model gate ===\n');

const panel5 = bodyOfFunction(SCC, 'panel5Run');
const operatorStatus = bodyOfFunction(FF, '_operatorStatusLine');

ok('A1 SCC run panel exists and leads with runtime clock fields',
    panel5.includes("kv('Scenario time'") &&
    panel5.includes("kv('Runtime state'") &&
    panel5.includes("kv('Speed'") &&
    panel5.includes("kv('Next runtime event'"));
ok('A2 SCC run panel does not render the authored progress helper',
    !panel5.includes('reviewCheckpointsHtml(scn, ex)'));
ok('A3 Free Fight operator status shows runtime clock fields',
    operatorStatus.includes('Scenario time:') &&
    operatorStatus.includes('Runtime state:') &&
    operatorStatus.includes('Speed:'));
ok('A4 Free Fight operator status does not append authored checkpoint UI',
    !operatorStatus.includes('_operatorReviewCheckpointsHtml(ex)'));

ok('B1 legacy adjudication panel is hidden developer-only',
    hiddenDev(tagById(HTML, 'wargame-panel'), 'legacy-wargame'));
ok('B2 workspace authored-frame navigator group is hidden developer-only',
    hiddenDev(tagByDataGroup(HTML, 'clock'), 'authored-frame-review'));
ok('B3 bottom timeline strip is hidden developer-only until wired to runtime clock',
    hiddenDev(tagById(HTML, 'timeline-strip'), 'timeline-preview'));
ok('B4 hidden compatibility controls use frame language, not snapshot buttons',
    HTML.includes('Internal Frame Navigator') &&
    HTML.includes('Previous frame') &&
    HTML.includes('Next frame') &&
    HTML.includes('Developer Timeline') &&
    !stripComments(HTML).includes('Next snapshot'));

const visibleStatic = stripComments([
    HTML,
    I18N,
    SCC,
    FF,
    UNIT,
    HUD,
    CMO_RUN,
    CMO_AAR,
    CMO_PACKAGE
].join('\n'));

ok('C1 exact legacy runner title/buttons are absent from normal static UI',
    !visibleStatic.includes('Legacy Snapshot Adjudication') &&
    !visibleStatic.includes('Next snapshot') &&
    !visibleStatic.includes('Run trial'));
ok('C2 old checkpoint labels are not rendered by normal runtime surfaces',
    !panel5.includes('Review checkpoints') &&
    !operatorStatus.includes('Review checkpoints') &&
    !UNIT.includes('Review checkpoint') &&
    !CMO_RUN.includes('Operator review checkpoint') &&
    !CMO_AAR.includes('Operator review checkpoint'));
ok('C3 old phase/turn labels are not normal CMO readout labels',
    !CMO_RUN.includes('Internal turn') &&
    !CMO_RUN.includes('Review phase') &&
    !CMO_AAR.includes('Internal turn') &&
    !CMO_AAR.includes('Review phase') &&
    CMO_PACKAGE.includes('AAR runtime timeline'));
ok('C4 timeline controller remains non-runtime and hidden',
    TIMELINE.includes('rmooz:timeline-ui-action') &&
    !/(runScenarioContinuous|pauseScenario|stopScenario|_setScenarioClockPlaying)/.test(stripComments(TIMELINE)));

ok('D1 internal authored data compatibility remains intact',
    WS.includes('findStepForElapsedHours') &&
    WORKSPACE.includes('Array.isArray(sc.phase_table)') &&
    WORKSPACE.includes('Array.isArray(sc.steps)'));
ok('D2 normal runtime replacement language exists',
    visibleStatic.includes('Scenario time') &&
    visibleStatic.includes('Runtime state') &&
    visibleStatic.includes('Speed') &&
    visibleStatic.includes('Next runtime event'));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
