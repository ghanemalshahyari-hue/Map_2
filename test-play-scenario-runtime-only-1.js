/* ============================================================================
 * test-play-scenario-runtime-only-1.js
 * Play Scenario contract: SCC runtime controls are the only scenario-run path.
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
const TIMELINE = read('UI_MOdified/client/shell/timeline.js');
const EVENT_LOG = read('UI_MOdified/client/shell/event-log.js');

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

function baseScenario(extra) {
    return Object.assign({
        name: 'play-scenario-runtime-only',
        scenario_label: 'Play Scenario Runtime Only',
        obj: { name: 'Objective', coord: [46, 24] },
        bls_template: [{ name: 'BLS-1', coord: [46, 24] }],
        red_units: [],
        blue_units_base_ids: [],
        blue_units_initial: [],
        phase_table: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'START' },
            { index: 1, time_label: 'H+24', elapsed_hours: 24, phase: 'END' }
        ],
        steps: [
            { index: 0, time_label: 'H', elapsed_hours: 0, phase: 'START' },
            { index: 1, time_label: 'H+24', elapsed_hours: 24, phase: 'END' }
        ]
    }, extra || {});
}

function installGlobals(scenario) {
    global.AppRuntimeEvents = global.AppRuntimeEvents || require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));
    global.AppShellEventLog = { append() {} };
    global.AppWorldState = { findStepForElapsedHours() { return { index: 0, elapsed_hours: 0, time_label: 'H' }; } };
    global.AppAdjudicatorMap = {
        setRunClock(clock) { this.clock = clock; },
        runClockLabel() { return null; },
        getWorldState() { return { units: [] }; }
    };
    global.RmoozScenario = { scenario };
    global.units = [];
    delete global.fetch;
}

function commitClock(scenario) {
    installGlobals(scenario);
    const FF_MOD = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'));
    FF_MOD._resetCoaExecForTest();
    FF_MOD._setCoaPlanForTest({
        ok: true,
        plan_source: 'play-scenario-runtime-only',
        coas: [{
            plan_id: 'PLAY-RUNTIME',
            side: 'BLUE',
            title: 'Runtime clock contract',
            phases: [{ name: 'runtime', actions: [] }]
        }]
    });
    const ex = FF_MOD._commitCoaForTest(0);
    return ex && ex.clock;
}

console.log('\n=== Play scenario runtime-only contract ===\n');

const panel5 = bodyOfFunction(SCC, 'panel5Run');
const operatorStatus = bodyOfFunction(FF, '_operatorStatusLine');
const normalUiText = stripComments([HTML, I18N, SCC, FF, TIMELINE, EVENT_LOG].join('\n'));
const timelineTag = tagById(HTML, 'timeline-strip');
const timelinePlay = tagById(HTML, 'tl-play');
const timelineCode = stripComments(TIMELINE);
const bannedSnapshotStatus = new RegExp('Snapshot\\s+' + 'step', 'i');
const bannedRunTrial = new RegExp('Run\\s+' + 'trial', 'i');
const bannedNextSnapshot = new RegExp('Next\\s+' + 'snapshot', 'i');
const bannedReviewTimeline = new RegExp('Review\\s+' + 'timeline', 'i');
const bannedOperationTimeline = new RegExp('Operation\\s+' + 'timeline', 'i');

ok('A1 normal runtime UI has no old snapshot-status leak',
    !bannedSnapshotStatus.test(normalUiText));
ok('A2 normal runtime UI has no old trial/snapshot controls',
    !bannedRunTrial.test(normalUiText) && !bannedNextSnapshot.test(normalUiText));
ok('A3 normal runtime UI has no old timeline-run wording',
    !bannedReviewTimeline.test(normalUiText) && !bannedOperationTimeline.test(normalUiText));

ok('B1 SCC exposes the only primary scenario run action',
    panel5.includes("'scc-run'") &&
    panel5.includes('Run Scenario') &&
    panel5.includes("'scc-pause'") &&
    panel5.includes("'scc-stop'"));
ok('B2 SCC runtime readout uses scenario-time fields',
    panel5.includes("kv('Scenario time'") &&
    panel5.includes("kv('Runtime state'") &&
    panel5.includes("kv('Speed'") &&
    panel5.includes("kv('Duration / remaining'") &&
    panel5.includes("kv('Next runtime event'") &&
    panel5.includes('runtimeDecisionPointsHtml(eng)'));
ok('B3 Free Fight operator status has no authored checkpoint/status line',
    operatorStatus.includes('Scenario time:') &&
    operatorStatus.includes('Runtime state:') &&
    operatorStatus.includes('Speed:') &&
    !operatorStatus.includes('Snapshot ' + 'step') &&
    !operatorStatus.includes('Frame pointer') &&
    !operatorStatus.includes('_operatorReviewCheckpointsHtml'));

ok('C1 bottom timeline transport is hidden, inert, and developer-only',
    hiddenDev(timelineTag, 'timeline-preview'));
ok('C2 timeline play button is preview transport, not scenario Play',
    /title="Preview playback"/i.test(timelinePlay) &&
    !/title="Play Scenario"/i.test(timelinePlay) &&
    !/(runScenarioContinuous|runScenario|pauseScenario|stopScenario|_setScenarioClockPlaying)/.test(timelineCode));
ok('C3 timeline event-log copy is developer-preview copy',
    EVENT_LOG.includes('Developer transport: Preview playback') &&
    EVENT_LOG.includes('Developer transport: Previous frame') &&
    !EVENT_LOG.includes('Review ' + 'timeline: Previous ' + 'snapshot'));

let clock = commitClock(baseScenario({ duration_minutes: 90 }));
ok('D1 duration_minutes is honored before authored elapsed-hours fallback',
    clock && clock.start_hours === 0 && clock.end_hours === 1.5 && clock.duration_hours === 1.5);

clock = commitClock(baseScenario({ runtime_scenario: { start_hours: 2, duration_minutes: 30 } }));
ok('D2 runtime_scenario.duration_minutes is honored with runtime start_hours',
    clock && clock.start_hours === 2 && clock.end_hours === 2.5 && clock.duration_hours === 0.5);

clock = commitClock(baseScenario());
ok('D3 steps elapsed-hours fallback only applies with no explicit duration',
    clock && clock.start_hours === 0 && clock.end_hours === 24 && clock.duration_hours === 24 &&
    /var dur = _runtimeDurationHours\(scn\);/.test(FF) &&
    /dur != null/.test(FF));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
