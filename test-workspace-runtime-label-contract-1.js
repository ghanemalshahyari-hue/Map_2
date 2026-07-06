/* ============================================================================
 * test-workspace-runtime-label-contract-1.js
 * Scenario Workspace Runtime Label Contract Gate
 * ----------------------------------------------------------------------------
 * The workspace step navigator may review/playback snapshots, but it must not
 * read like the primary scenario runtime Play. Static gate only; does not touch
 * offline or DB-Lite.
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

function around(source, needle, before, after) {
    const idx = source.indexOf(needle);
    if (idx < 0) return '';
    return source.slice(Math.max(0, idx - (before || 500)), idx + (after || 500));
}

function tagById(html, id) {
    const re = new RegExp('<button[^>]*id="' + id + '"[^>]*>', 'i');
    const m = html.match(re);
    return m ? m[0] : '';
}

console.log('\n=== Scenario Workspace runtime label contract gate ===\n');

console.log('--- SW-1: live step navigator copy distinguishes preview playback from runtime Play ---');
ok('T-1 nav region still exists with compatibility ids',
    HTML.includes('id="sw-nav-card"') &&
    HTML.includes('id="sw-nav-play"') &&
    HTML.includes('id="sw-nav-speed"'));
ok('T-2 section label is step review navigation',
    HTML.includes('data-i18n="sw-live-nav-section-label">Step review navigation'));
ok('T-3 warning points runtime Play to Scenario Control Center',
    HTML.includes('These controls review snapshots; runtime Play stays in Scenario Control Center.'));
ok('T-4 navigator title says Live Step Review Navigator',
    HTML.includes('data-i18n="sw-nav-title">Live Step Review Navigator'));
ok('T-5 helper explains pointer review, not runtime clock ownership',
    HTML.includes('Step review playback changes the active live step pointer; Scenario Control Center remains the runtime Play.'));
ok('T-6 play button is labelled Preview',
    HTML.includes('data-i18n="sw-nav-play">▶ Preview</button>'));
ok('T-7 speed label is Playback speed',
    HTML.includes('data-i18n="sw-nav-speed-label">Playback speed</label>'));

console.log('\n--- SW-1B: phase_table checkpoints are review snapshots, not runtime progress ---');
ok('T-1 old Scenario Phase Timeline title removed from active workspace copy',
    !HTML.includes('Scenario Phase Timeline') &&
    !I18N.includes('Scenario Phase Timeline') &&
    !WORKSPACE.includes('Scenario Phase Timeline'));
ok('T-2 checkpoint card keeps compatibility ids but is collapsed review UI',
    /<details[^>]+id="spt-card"/i.test(HTML) &&
    HTML.includes('id="spt-phase-list"') &&
    !/<details[^>]+id="spt-card"[^>]+\bopen\b/i.test(HTML));
ok('T-3 checkpoint group points runtime Play back to Scenario Control Center',
    HTML.includes('data-i18n="swg-clock-title">Review &amp; Snapshot Checkpoints') &&
    HTML.includes('Runtime Play stays in Scenario Control Center.') &&
    I18N.includes("'spt-title':                     'Review checkpoints'"));
ok('T-4 live header labels active package position as review/authored context',
    WORKSPACE.includes("tx('sw-live-review-checkpoint-prefix', 'Review checkpoint')") &&
    WORKSPACE.includes("tx('sw-live-authored-phase-prefix', 'Authored phase')"));

console.log('\n--- SW-2: snapshot controls keep ids but use snapshot labels ---');
ok('T-1 jump buttons preserve ids and use snapshot titles',
    tagById(HTML, 'sw-nav-first').includes('id="sw-nav-first"') &&
    tagById(HTML, 'sw-nav-first').includes('title="First snapshot"') &&
    tagById(HTML, 'sw-nav-last').includes('id="sw-nav-last"') &&
    tagById(HTML, 'sw-nav-last').includes('title="Final snapshot"'));
ok('T-2 previous/next nav buttons preserve ids and snapshot aria labels',
    tagById(HTML, 'sw-nav-prev').includes('id="sw-nav-prev"') &&
    tagById(HTML, 'sw-nav-prev').includes('aria-label="Previous snapshot"') &&
    tagById(HTML, 'sw-nav-next').includes('id="sw-nav-next"') &&
    tagById(HTML, 'sw-nav-next').includes('aria-label="Next snapshot"'));
ok('T-3 inspection controls preserve ids and are explicitly inspection snapshots',
    tagById(HTML, 'sw-wt-ctrl-prev').includes('id="sw-wt-ctrl-prev"') &&
    tagById(HTML, 'sw-wt-ctrl-prev').includes('Previous inspection snapshot') &&
    tagById(HTML, 'sw-wt-ctrl-next').includes('id="sw-wt-ctrl-next"') &&
    tagById(HTML, 'sw-wt-ctrl-next').includes('Next inspection snapshot'));
ok('T-4 inspection subheader says snapshot without changing active live step',
    HTML.includes('Inspect another snapshot without changing the active live scenario step.'));

console.log('\n--- SW-3: i18n and JS fallbacks use preview language ---');
[
    "'sw-live-nav-section-label':   'Step review navigation'",
    "'sw-live-nav-warning-note':    'These controls review snapshots; runtime Play stays in Scenario Control Center.'",
    "'sw-nav-title':              'Live Step Review Navigator'",
    "'sw-nav-live-helper':        'Step review playback changes the active live step pointer; Scenario Control Center remains the runtime Play.'",
    "'sw-nav-first':              'First snapshot'",
    "'sw-nav-last':               'Final snapshot'",
    "'sw-nav-play':               '▶ Preview'",
    "'sw-nav-pause':              '⏸ Pause preview'",
    "'sw-nav-speed-label':        'Playback speed'"
].forEach((needle) => ok('T-copy  ' + needle, I18N.includes(needle)));
ok('T-10 paintPlayButton fallback uses Preview/Pause preview',
    WORKSPACE.includes("tx('sw-nav-pause', '⏸ Pause preview')") &&
    WORKSPACE.includes("tx('sw-nav-play',  '▶ Preview')"));
ok('T-11 old focused play/speed labels removed from app/i18n/workspace fallbacks',
    !HTML.includes('data-i18n="sw-nav-play">▶ Play</button>') &&
    !I18N.includes("'sw-nav-play':               '▶ Play'") &&
    !I18N.includes("'sw-nav-speed-label':        'Speed'") &&
    !WORKSPACE.includes("tx('sw-nav-play',  '▶ Play')"));

console.log('\n--- SW-4: behavior boundaries are preserved ---');
ok('T-1 workspace still registers goToStep as preview renderer',
    WORKSPACE.includes('window.AppScenarioRunner.registerPreviewRenderer(goToStep)'));
ok('T-2 workspace preview playback still calls preview runner play/pause',
    WORKSPACE.includes('window.AppScenarioRunner.play()') &&
    WORKSPACE.includes('window.AppScenarioRunner.pause()'));
ok('T-3 workspace does not call C3b runtime scenario run controls',
    !/(runScenarioContinuous|runScenario\s*\(|_setScenarioClockPlaying|scenarioClockLabel|runClock\.playing)/.test(WORKSPACE));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
