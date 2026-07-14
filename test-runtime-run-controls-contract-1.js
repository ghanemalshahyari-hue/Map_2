/* ============================================================================
 * test-runtime-run-controls-contract-1.js
 * Runtime run controls contract: primary Run is the SCC runtime clock.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const SCC = read('UI_MOdified/client/shell/scenario-control-center.js');
const FF = read('UI_MOdified/client/shell/free-fight-demo.js');
const MAP = read('UI_MOdified/client/wargame/adjudicator-map.js');
const HTML = read('UI_MOdified/client/app.html');
const I18N = read('UI_MOdified/client/i18n.js');
const WS = read('UI_MOdified/client/shell/world-state.js');
const TURN = read('UI_MOdified/client/turn-engine.js');
const RAIL = read('UI_MOdified/client/tool-rail.js');
const STYLE = read('UI_MOdified/client/style.css');

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

function tagByDataTool(html, tool) {
    const re = new RegExp('<button[^>]+data-tool="' + tool + '"[^>]*>', 'i');
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
        else if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(open, i + 1);
        }
    }
    return '';
}

const panel5 = bodyOfFunction(SCC, 'panel5Run');
const wargameButton = tagByDataTool(HTML, 'wargame');
const wargamePanel = tagById(HTML, 'wargame-panel');

console.log('\n=== Runtime run controls contract gate ===\n');

ok('A1 SCC exposes primary runtime Run action',
    panel5.includes("'scc-run'") && panel5.includes('Run Scenario'));
ok('A2 SCC runtime readout shows Scenario time, Runtime state, Speed, and Next runtime event',
    panel5.includes("kv('Scenario time'") &&
    panel5.includes("kv('Runtime state'") &&
    panel5.includes("kv('Speed'") &&
    panel5.includes("kv('Next runtime event'"));
ok('A3 SCC time is sourced from World-State clock plumbing',
    SCC.includes('scenarioClockLabel') &&
    /scenarioClockLabel:\s*function/.test(FF) &&
    FF.includes('_scenarioClockLabel') &&
    FF.includes('runClockLabel'));
ok('A4 SCC primary readout does not expose authored Turn/Phase rows',
    !panel5.includes("kv('Turn") &&
    !panel5.includes("kv('Phase'") &&
    !panel5.includes('reviewCheckpointsHtml(scn, ex)'));
ok('A5 SCC exposes Pause and Stop controls for the same runtime clock',
    panel5.includes("'scc-pause'") && panel5.includes("'scc-stop'"));

ok('B1 manual map apply still pauses a playing committed run',
    MAP.includes('pauseCommittedRun') &&
    MAP.includes('runClock') &&
    MAP.includes('opts.snapshot'));

ok('C1 legacy wargame rail entry is hidden from normal operators',
    /\bhidden\b/i.test(wargameButton) &&
    /aria-hidden="true"/i.test(wargameButton) &&
    /data-dev-only="legacy-wargame"/i.test(wargameButton));
ok('C2 legacy wargame panel is hidden, inert, and developer-only',
    /\bhidden\b/i.test(wargamePanel) &&
    /\binert\b/i.test(wargamePanel) &&
    /aria-hidden="true"/i.test(wargamePanel) &&
    /data-dev-only="legacy-wargame"/i.test(wargamePanel));
ok('C3 legacy fallback HUD requires explicit developer class',
    TURN.includes('function legacyDiagnosticsEnabled()') &&
    TURN.includes("classList.contains('rmooz-dev-legacy-open')"));
ok('C4 exact legacy visible button/title strings are not shipped as normal copy',
    !HTML.includes('Legacy Snapshot Adjudication') &&
    !HTML.includes('Run trial'));

ok('D1 compatibility DOM ids are preserved inside hidden legacy panel',
    HTML.includes('id="wg-init"') &&
    HTML.includes('id="wg-next"') &&
    HTML.includes('id="wg-reset"') &&
    HTML.includes('id="wargame-hud"'));
ok('D2 turn-engine.js is retained but gated',
    exists('UI_MOdified/client/turn-engine.js') &&
    TURN.includes('if (!legacyDiagnosticsEnabled()) return null;'));
ok('D3 authored steps remain internal clock compatibility',
    WS.includes('findStepForElapsedHours'));

/* ── E. Legacy fixed-step surface not presented as a scenario RUN ──────────── */
ok('E1 tool tooltip no longer frames the legacy HUD as a scenario run',
    !I18N.includes('Run an operational scenario'));
ok('E2 legacy step control renamed away from "Next Turn"',
    !I18N.includes("'wg-btn-next': 'Next Turn'") &&
    I18N.includes("'wg-btn-next': 'Next snapshot'"));
ok('E3 wargame mode chip is Legacy/Diagnostic, not "Turn-based"',
    !HTML.includes('wargame-mode-chip">Turn-based') &&
    HTML.includes('wargame-mode-chip">Legacy'));
ok('E4 legacy panel carries an explicit "not the scenario run" banner',
    HTML.includes('wg-legacy-banner'));
ok('E5 tool label marks the surface Legacy',
    I18N.includes("'tool-wargame': 'Operational Scenario (Legacy)'"));
ok('E6 legacy wargame rail button and panel are hidden developer-only surfaces',
    /data-tool="wargame"[\s\S]*hidden[\s\S]*data-dev-only="legacy-wargame"/.test(HTML) &&
    /id="wargame-panel"[\s\S]*hidden[\s\S]*data-dev-only="legacy-wargame"/.test(HTML) &&
    /(^|\n)\s*\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/.test(STYLE));
ok('E7 legacy wargame tool activation routes to live Scenario Workspace',
    /tool\s*===\s*['"]wargame['"][\s\S]*scenario-workspace/.test(RAIL) &&
    RAIL.includes("'scenario-workspace'"));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
