/* ============================================================================
 * test-timeline-runtime-contract-1.js
 * Timeline Runtime Contract Gate
 * ----------------------------------------------------------------------------
 * Owner rule: Primary Play is the runtime clock. The bottom timeline strip may
 * remain as review/playback UI, but it must not pretend to be scenario Play.
 * Static gate only; does not touch offline or DB-Lite.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HTML = read('UI_MOdified/client/app.html');
const I18N = read('UI_MOdified/client/i18n.js');
const TIMELINE = read('UI_MOdified/client/shell/timeline.js');
const EVENT_LOG = read('UI_MOdified/client/shell/event-log.js');
const RUNNER = read('UI_MOdified/client/shell/scenario-runner.js');
const MOVEMENT = read('UI_MOdified/client/wargame/movement-playback.js');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function tagById(html, id) {
    const re = new RegExp('<button[^>]*id="' + id + '"[^>]*>', 'i');
    const m = html.match(re);
    return m ? m[0] : '';
}

function bodyOfFunction(source, name) {
    const idx = source.indexOf('function ' + name + '(');
    if (idx < 0) return '';
    const open = source.indexOf('{', idx);
    if (open < 0) return '';
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') {
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

console.log('\n=== Timeline runtime contract gate ===\n');

console.log('--- TL-1: visible strip is review/preview, not scenario run ---');
ok('T-1 toolbar aria label marks preview-only review transport',
    HTML.includes('aria-label="Review timeline transport (preview only)"'));
ok('T-2 title says Review Timeline',
    HTML.includes('data-i18n="tl-title">Review Timeline</span>'));
ok('T-3 play control says Preview playback',
    HTML.includes('title="Preview playback"') && HTML.includes('data-i18n="tl-play">Preview playback'));
ok('T-4 pause control says Pause preview',
    HTML.includes('title="Pause preview"') && HTML.includes('data-i18n="tl-pause">Pause preview'));
ok('T-5 step controls are snapshots, not scenario steps',
    HTML.includes('title="Previous snapshot"') && HTML.includes('title="Next snapshot"'));
ok('T-6 speed/time/phase labels are review/playback labels',
    HTML.includes('Playback speed') && HTML.includes('Review Time') && HTML.includes('Review Phase'));
ok('T-7 status points primary run to Scenario Control Center',
    HTML.includes('Review timeline only - scenario run is controlled by Scenario Control Center'));

console.log('\n--- TL-2: default state does not show timeline Play as active ---');
const playTag = tagById(HTML, 'tl-play');
const pauseTag = tagById(HTML, 'tl-pause');
ok('T-1 tl-play id is preserved',
    playTag.indexOf('id="tl-play"') !== -1);
ok('T-2 tl-play is not active by default',
    !/\bis-active\b/.test(playTag) && playTag.includes('aria-pressed="false"'));
ok('T-3 tl-pause is active by default',
    /\bis-active\b/.test(pauseTag) && pauseTag.includes('aria-pressed="true"'));
ok('T-4 timeline controller reapplies paused preview default',
    TIMELINE.includes('setPlayState(false);'));
ok('T-5 missing DOM fallback is not playing',
    /return\s+playBtn\s*\?\s*playBtn\.classList\.contains\('is-active'\)\s*:\s*false/.test(TIMELINE));

console.log('\n--- TL-3: i18n and event-log copy do not imply scenario Play ---');
[
    "'tl-title':                    'Review Timeline'",
    "'tl-play':                     'Preview playback'",
    "'tl-pause':                    'Pause preview'",
    "'tl-step-back':                'Previous snapshot'",
    "'tl-step-forward':             'Next snapshot'",
    "'tl-speed':                    'Playback speed'",
    "'tl-scenario-time':            'Review Time'",
    "'tl-phase':                    'Review Phase'",
    "'elog-evt-tl-play':            'Review timeline: Preview playback'",
    "'elog-evt-tl-pause':           'Review timeline: Pause preview'"
].forEach((needle) => ok('T-copy  ' + needle, I18N.includes(needle)));
ok('T-11 event-log fallback also uses review/preview labels',
    EVENT_LOG.includes('Review timeline: Preview playback') &&
    EVENT_LOG.includes('Review timeline: Pause preview'));
ok('T-12 old EN timeline run labels removed from i18n/event fallback',
    !I18N.includes("'tl-title':                    'Timeline'") &&
    !I18N.includes("'tl-play':                     'Play'") &&
    !EVENT_LOG.includes('Timeline: Play'));

console.log('\n--- TL-4: bottom timeline remains non-runtime UI ---');
const timelineCode = cleanSource(TIMELINE);
ok('T-1 timeline.js dispatches UI action events only',
    TIMELINE.includes('rmooz:timeline-ui-action') && TIMELINE.includes('detail: { action'));
ok('T-2 timeline bridge exposes getState only, not runtime setters',
    /window\.AppShellTimeline\s*=\s*\{\s*getState[\s\S]*Deliberately NOT exposed/.test(TIMELINE));
ok('T-3 timeline.js does not call scenario runtime controls',
    !/(runScenarioContinuous|runScenario\s*\(|pauseScenario|stopScenario|_setScenarioClockPlaying|runClock\.playing)/.test(timelineCode));

console.log('\n--- TL-5: existing consumers are preview/fallback engines, not C3b runtime clock ---');
const transportBody = bodyOfFunction(RUNNER, '_onTransport');
ok('T-1 scenario-runner transport body uses preview timer verbs',
    transportBody.includes('case \'play\': play();') &&
    transportBody.includes('case \'pause\': pause();') &&
    transportBody.includes('case \'step-forward\': stepBy(1);'));
ok('T-2 scenario-runner transport body does not request live runtime mode',
    transportBody.indexOf("mode: 'live'") === -1 &&
    transportBody.indexOf('runScenarioCanonical') === -1);
ok('T-3 movement-playback defers when canonical preview runner exists',
    MOVEMENT.includes('if (window.AppScenarioRunner) return;'));
ok('T-4 scenario-runner documents preview as read-only/not adjudicated',
    RUNNER.includes("'preview'") && RUNNER.includes('Read-only') && RUNNER.includes('It is NOT adjudicated'));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
