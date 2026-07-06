/* ============================================================================
 * test-runtime-surface-no-step-execution-1.js
 * C3d Runtime Surface Purge / Step UI Demotion Gate
 * ----------------------------------------------------------------------------
 * Primary scenario execution must read as continuous runtime time. Authored
 * steps/phases remain for review snapshots, AAR evidence, and diagnostics only.
 * Static gate plus child-process checks for the existing C3b/C4 runtime tests.
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
const TIMELINE = read('UI_MOdified/client/shell/timeline.js');
const WS = read('UI_MOdified/client/shell/world-state.js');
const LEGACY_HUD = read('UI_MOdified/client/wargame/adjudicator-hud.js');
const UNIT_STATUS = read('UI_MOdified/client/shell/unit-status-panel.js');
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

function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
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
const visiblePrimaryRun = cleanSource(panel5 + '\n' + operatorStatus);
const forbiddenFixedSequence = /\bP[0-3]\s+(?:PRE-STRIKE|STRIKE-?1|ASSESS|COMPLETE)\b|Operation timeline|Scenario Phase Timeline/i;

console.log('\n=== C3d runtime surface no-step execution gate ===\n');

console.log('--- 1. Primary SCC/run surfaces are clock/state/speed, not fixed-step progress ---');
ok('T-1 SCC run panel function exists', panel5.length > 0);
ok('T-2 SCC primary run panel shows Scenario time',
    panel5.includes("kv('Scenario time'"));
ok('T-3 SCC primary run panel shows runtime state and speed',
    panel5.includes("kv('Runtime state'") && panel5.includes("kv('Speed'"));
ok('T-4 SCC primary run panel can show next runtime event status when available',
    panel5.includes("kv('Next runtime event'"));
ok('T-5 SCC primary readout does not expose Turn as primary state',
    !panel5.includes("kv('Turn") && !panel5.includes('Turn (internal)'));
ok('T-6 SCC primary readout does not expose COA Phase as runtime progress',
    !panel5.includes("kv('Phase'") && !panel5.includes('>Phase:<'));
ok('T-7 SCC primary readout does not contain operation timeline/P0-P3 sequence copy',
    !forbiddenFixedSequence.test(panel5));
ok('T-8 SCC keeps authored turn/phase data only under collapsed Review checkpoints',
    panel5.includes('reviewCheckpointsHtml(scn, ex)') &&
    SCC.includes('data-scc="review-checkpoints"') &&
    SCC.includes('Review checkpoints') &&
    SCC.includes('Internal turn') &&
    SCC.includes('COA review phase'));

console.log('\n--- 2. Free Fight operator status follows the same primary runtime language ---');
ok('T-1 operator status function exists', operatorStatus.length > 0);
ok('T-2 operator status shows Scenario time, Runtime state, and Speed',
    operatorStatus.includes('Scenario time:') &&
    operatorStatus.includes('Runtime state:') &&
    operatorStatus.includes('Speed:'));
ok('T-3 operator status does not render Phase/Snapshot step as primary rows',
    !operatorStatus.includes('Phase:</span>') &&
    !operatorStatus.includes('Snapshot step:</span>'));
ok('T-4 operator status demotes authored progress to Review checkpoints',
    operatorStatus.includes('_operatorReviewCheckpointsHtml(ex)') &&
    FF.includes('<details data-ff-op="review-checkpoints"') &&
    FF.includes('Review checkpoints') &&
    FF.includes('Snapshot pointer:'));
ok('T-5 visible primary run source contains no fixed P0/P1/P2/P3 execution sequence',
    !forbiddenFixedSequence.test(visiblePrimaryRun));

console.log('\n--- 3. Workspace phase UI is review/snapshot, not primary scenario execution ---');
ok('T-1 old Scenario Phase Timeline title is removed from active app/i18n/workspace source',
    !HTML.includes('Scenario Phase Timeline') &&
    !I18N.includes('Scenario Phase Timeline') &&
    !WORKSPACE.includes('Scenario Phase Timeline'));
ok('T-2 phase_table rendering is retained under Review checkpoints',
    HTML.includes('data-i18n="spt-title">Review checkpoints') &&
    I18N.includes("'spt-title':                     'Review checkpoints'") &&
    WORKSPACE.includes('phase_table') &&
    WORKSPACE.includes('Review checkpoints'));
ok('T-3 review checkpoint card is collapsed by default and keeps the compatible id',
    /<details[^>]+id="spt-card"/i.test(HTML) &&
    !/<details[^>]+id="spt-card"[^>]+\bopen\b/i.test(HTML));
ok('T-4 workspace group copy no longer says Clock & Phases/live step navigation',
    !HTML.includes('Clock &amp; Phases') &&
    !HTML.includes('Scenario clock, phases, and live step navigation.') &&
    I18N.includes("'swg-clock-title':           'Review & Snapshot Checkpoints'") &&
    I18N.includes('Runtime Play stays in Scenario Control Center'));
ok('T-5 live header labels active steps as review checkpoints',
    WORKSPACE.includes("tx('sw-live-review-checkpoint-prefix', 'Review checkpoint')") &&
    WORKSPACE.includes("tx('sw-live-authored-phase-prefix', 'Authored phase')"));
ok('T-6 authored steps[] and phase_table data paths were not removed',
    WS.includes('findStepForElapsedHours') &&
    WORKSPACE.includes('Array.isArray(sc.phase_table)') &&
    WORKSPACE.includes('Array.isArray(sc.steps)'));

console.log('\n--- 4. Timeline and workspace transport remain review/preview only ---');
ok('T-1 bottom timeline title and play control are review/preview',
    HTML.includes('data-i18n="tl-title">Review Timeline</span>') &&
    HTML.includes('data-i18n="tl-play">Preview playback'));
ok('T-2 bottom timeline is not wired to scenario runtime Play',
    TIMELINE.includes('rmooz:timeline-ui-action') &&
    !/(runScenarioContinuous|runScenario\s*\(|pauseScenario|stopScenario|_setScenarioClockPlaying)/.test(cleanSource(TIMELINE)));
ok('T-3 workspace Play/Step wording remains review/preview',
    HTML.includes('data-i18n="sw-live-nav-section-label">Step review navigation') &&
    HTML.includes('These controls review snapshots; runtime Play stays in Scenario Control Center.') &&
    HTML.includes('data-i18n="sw-nav-play">') &&
    I18N.includes("'sw-nav-play':               '▶ Preview'"));
ok('T-4 legacy Wargame remains Legacy/Diagnostic',
    HTML.includes('wg-legacy-banner') &&
    HTML.includes('wargame-mode-chip">Legacy') &&
    I18N.includes("'tool-wargame': 'Operational Scenario (Legacy)'"));

console.log('\n--- 5. Legacy/diagnostic surfaces do not leak step timeline language as primary run UI ---');
ok('T-1 legacy adjudicator HUD removed exact Operation timeline label',
    !LEGACY_HUD.includes('Operation timeline') &&
    LEGACY_HUD.includes('Legacy review checkpoints'));
ok('T-2 legacy adjudicator checkpoint strip is collapsed diagnostic UI',
    /<details[^>]+id="wg-adj-timeline"/i.test(LEGACY_HUD) &&
    LEGACY_HUD.includes('diagnostic snapshots') &&
    LEGACY_HUD.includes('Scenario runtime is controlled by Scenario Control Center time'));
ok('T-3 legacy adjudicator primary controls use snapshot language',
    LEGACY_HUD.includes('Next snapshot') &&
    LEGACY_HUD.includes('Snapshot&nbsp;pace') &&
    !LEGACY_HUD.includes('Next step') &&
    !LEGACY_HUD.includes('Step&nbsp;pace') &&
    !LEGACY_HUD.includes('Was this step right?'));
ok('T-4 unit status tasking labels authored progress as review checkpoints',
    UNIT_STATUS.includes('Review checkpoint') &&
    !UNIT_STATUS.includes("+ 'Step '") &&
    !UNIT_STATUS.includes("stepLabel = 'Step "));
ok('T-5 CMO run instrumentation labels step/turn/phase as diagnostics or review',
    CMO_RUN.includes('CMO War-Game Run Diagnostics') &&
    CMO_RUN.includes('Operator review checkpoint') &&
    CMO_RUN.includes('Internal turn / actor') &&
    CMO_RUN.includes('Review phase') &&
    !CMO_RUN.includes('CMO War-Game Live Run') &&
    !CMO_RUN.includes('<dt>Phase</dt>'));
ok('T-6 CMO AAR/evidence package labels timelines as AAR review',
    CMO_AAR.includes('AAR review timeline') &&
    CMO_PACKAGE.includes('AAR review timeline') &&
    !CMO_AAR.includes('<strong>Run timeline</strong>') &&
    !CMO_PACKAGE.includes("label: 'Run timeline'"));

console.log('\n--- 6. Existing continuous runtime and C4 runtime-event gates still pass ---');
[
    'test-continuous-runtime-play-model-1.js',
    'test-scc-runtime-clock-3.js',
    'test-runtime-events-evaluator-1.js',
    'test-runtime-events-integration-1.js',
    'test-runtime-event-effects-contract-1.js'
].forEach((rel) => ok('T-pass  ' + rel, runNodeTest(rel)));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
