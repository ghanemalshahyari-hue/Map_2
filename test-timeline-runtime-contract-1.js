/* ============================================================================
 * test-timeline-runtime-contract-1.js
 * Timeline contract: hidden unless wired to the real runtime clock.
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

function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

console.log('\n=== Timeline runtime contract gate ===\n');

const strip = tagById(HTML, 'timeline-strip');
ok('A1 timeline strip is hidden, inert, and developer-only',
    /\bhidden\b/i.test(strip) &&
    /\binert\b/i.test(strip) &&
    /aria-hidden="true"/i.test(strip) &&
    /data-dev-only="timeline-preview"/i.test(strip));
ok('A2 hidden timeline copy is developer/frame language',
    HTML.includes('Developer Timeline') &&
    HTML.includes('Previous frame') &&
    HTML.includes('Next frame') &&
    HTML.includes('Frame Time') &&
    HTML.includes('Frame Group'));
ok('A3 old preview snapshot labels are absent from HTML/i18n/event fallback',
    !HTML.includes('Next snapshot') &&
    !I18N.includes('Next snapshot') &&
    !EVENT_LOG.includes('Next snapshot'));
ok('A4 timeline ids are preserved for future wiring',
    HTML.includes('id="tl-play"') &&
    HTML.includes('id="tl-pause"') &&
    HTML.includes('id="tl-step-forward"') &&
    HTML.includes('id="tl-scenario-time"'));

const timelineCode = cleanSource(TIMELINE);
ok('B1 timeline controller dispatches UI action events only',
    TIMELINE.includes('rmooz:timeline-ui-action') &&
    TIMELINE.includes('detail: { action'));
ok('B2 timeline bridge exposes getState only, not runtime setters',
    /window\.AppShellTimeline\s*=\s*\{\s*getState[\s\S]*Deliberately NOT exposed/.test(TIMELINE));
ok('B3 timeline.js does not call scenario runtime controls',
    !/(runScenarioContinuous|runScenario\s*\(|pauseScenario|stopScenario|_setScenarioClockPlaying|runClock\.playing)/.test(timelineCode));
ok('B4 preview runner remains documented as read-only/non-adjudicated',
    RUNNER.includes("'preview'") &&
    RUNNER.includes('Read-only') &&
    RUNNER.includes('It is NOT adjudicated'));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
