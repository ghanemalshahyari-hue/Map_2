/* ============================================================================
 * test-runtime-surface-no-step-execution-1.js
 * Aggregate gate: normal run surfaces expose runtime time only.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SCC = read('UI_MOdified/client/shell/scenario-control-center.js');
const FF = read('UI_MOdified/client/shell/free-fight-demo.js');
const HTML = read('UI_MOdified/client/app.html');
const I18N = read('UI_MOdified/client/i18n.js');
const WORKSPACE = read('UI_MOdified/client/shell/scenario-workspace.js');
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

function runNodeTest(rel) {
    const result = childProcess.spawnSync(process.execPath, [path.join(ROOT, rel)], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    if (result.status !== 0) {
        console.error('\n--- ' + rel + ' stdout ---\n' + (result.stdout || '').trim());
        console.error('\n--- ' + rel + ' stderr ---\n' + (result.stderr || '').trim());
    }
    return result.status === 0;
}

const panel5 = bodyOfFunction(SCC, 'panel5Run');
const operatorStatus = bodyOfFunction(FF, '_operatorStatusLine');

console.log('\n=== Runtime surface no-step execution gate ===\n');

ok('A1 SCC run panel shows Scenario time, Runtime state, Speed, and Next runtime event',
    panel5.includes("kv('Scenario time'") &&
    panel5.includes("kv('Runtime state'") &&
    panel5.includes("kv('Speed'") &&
    panel5.includes("kv('Next runtime event'"));
ok('A2 SCC run panel does not render authored checkpoint/phase rows',
    !panel5.includes('reviewCheckpointsHtml(scn, ex)') &&
    !panel5.includes("kv('Turn") &&
    !panel5.includes("kv('Phase'"));
ok('A3 Free Fight operator status follows runtime language',
    operatorStatus.includes('Scenario time:') &&
    operatorStatus.includes('Runtime state:') &&
    operatorStatus.includes('Speed:') &&
    !operatorStatus.includes('_operatorReviewCheckpointsHtml(ex)'));

ok('B1 legacy runner entry points are hidden developer-only',
    /data-tool="wargame"[^>]*hidden[^>]*data-dev-only="legacy-wargame"/i.test(HTML) &&
    /id="wargame-panel"[^>]*hidden[^>]*inert[^>]*data-dev-only="legacy-wargame"/i.test(HTML));
ok('B2 bottom timeline and workspace compatibility nav are hidden developer-only',
    /id="timeline-strip"[^>]*hidden[^>]*inert[^>]*data-dev-only="timeline-preview"/i.test(HTML) &&
    /data-sw-group="clock"[^>]*hidden[^>]*inert[^>]*data-dev-only="authored-frame-review"/i.test(HTML));
ok('B3 exact old visible strings are absent from app/i18n/HUD',
    !HTML.includes('Legacy Snapshot Adjudication') &&
    !HTML.includes('Next snapshot') &&
    !HTML.includes('Run trial') &&
    !I18N.includes('Next snapshot') &&
    !HUD.includes('Legacy Snapshot Adjudication'));
ok('B4 unit status and CMO surfaces use runtime context language',
    !UNIT.includes('Review checkpoint') &&
    !CMO_RUN.includes('Operator review checkpoint') &&
    !CMO_RUN.includes('Internal turn') &&
    !CMO_RUN.includes('Review phase') &&
    !CMO_AAR.includes('Operator review checkpoint') &&
    !CMO_AAR.includes('Internal turn') &&
    !CMO_AAR.includes('Review phase') &&
    CMO_PACKAGE.includes('AAR runtime timeline'));

ok('C1 internal authored data compatibility remains intact',
    WS.includes('findStepForElapsedHours') &&
    WORKSPACE.includes('Array.isArray(sc.phase_table)') &&
    WORKSPACE.includes('Array.isArray(sc.steps)'));
ok('C2 normal replacement language is present',
    HTML.includes('Event Log') &&
    SCC.includes('Scenario time') &&
    SCC.includes('Runtime state') &&
    SCC.includes('Speed') &&
    SCC.includes('Next runtime event'));

console.log('\n--- Existing runtime gates ---');
[
    'test-remove-legacy-adjudication-ui-1.js',
    'test-no-visible-step-model-1.js',
    'test-continuous-runtime-play-model-1.js',
    'test-scc-runtime-clock-3.js',
    'test-runtime-events-evaluator-1.js',
    'test-runtime-events-integration-1.js',
    'test-runtime-event-effects-contract-1.js'
].forEach((rel) => ok('T-pass  ' + rel, runNodeTest(rel)));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
