/* ============================================================================
 * test-remove-legacy-adjudication-ui-1.js
 * C3e gate: legacy adjudication runner is not normal operator UI.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HTML = read('UI_MOdified/client/app.html');
const SCC = read('UI_MOdified/client/shell/scenario-control-center.js');
const HUD = read('UI_MOdified/client/wargame/adjudicator-hud.js');
const TURN = read('UI_MOdified/client/turn-engine.js');
const RAIL = read('UI_MOdified/client/tool-rail.js');

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

function hasHiddenGate(tag, marker) {
    return !!tag &&
        /\bhidden\b/i.test(tag) &&
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

console.log('\n=== C3e remove legacy adjudication UI gate ===\n');

const wargameButton = tagByDataTool(HTML, 'wargame');
const wargamePanel = tagById(HTML, 'wargame-panel');

ok('A1 legacy wargame rail entry is hidden and developer-only',
    hasHiddenGate(wargameButton, 'legacy-wargame') && /tabindex="-1"/i.test(wargameButton));
ok('A2 legacy wargame panel is hidden, inert, and developer-only',
    hasHiddenGate(wargamePanel, 'legacy-wargame') && /\binert\b/i.test(wargamePanel));
ok('A3 compatibility wg-* ids remain available only inside the hidden panel',
    HTML.includes('id="wg-init"') &&
    HTML.includes('id="wg-next"') &&
    HTML.includes('id="wg-reset"') &&
    HTML.indexOf('id="wargame-panel"') < HTML.indexOf('id="wg-next"'));
ok('A4 screenshot strings are gone from shipped HTML',
    !HTML.includes('Legacy Snapshot Adjudication') &&
    !HTML.includes('Next snapshot') &&
    !HTML.includes('Run trial'));
ok('A5 adjudicator HUD template no longer contains the old visible title/buttons',
    !HUD.includes('Legacy Snapshot Adjudication') &&
    !HUD.includes('Next snapshot') &&
    !HUD.includes('Run trial') &&
    HUD.includes('Developer Legacy Diagnostics') &&
    HUD.includes('Advance internal frame') &&
    HUD.includes('Run internal sequence'));
ok('A6 adjudicator HUD refuses to mount while the legacy host is hidden',
    HUD.includes("closest('[data-dev-only=\"legacy-wargame\"]')") &&
    HUD.includes("legacyHost.hasAttribute('hidden')") &&
    HUD.includes('return;'));
ok('A7 turn-engine fallback cannot create a normal floating legacy HUD',
    TURN.includes('function legacyDiagnosticsEnabled()') &&
    TURN.includes("classList.contains('rmooz-dev-legacy-open')") &&
    TURN.includes('if (!legacyDiagnosticsEnabled()) return null;') &&
    TURN.includes('if (!el) return null;'));
ok('A8 tool rail refuses hidden legacy wargame selection',
    RAIL.includes('wargameBtn.hidden') &&
    RAIL.includes('wargameBtn.getAttribute(\'aria-hidden\') === \'true\''));

const panel5 = bodyOfFunction(SCC, 'panel5Run');
ok('B1 SCC remains the visible runtime run surface',
    panel5.includes("kv('Scenario time'") &&
    panel5.includes("kv('Runtime state'") &&
    panel5.includes("kv('Speed'") &&
    panel5.includes("kv('Next runtime event'"));
ok('B2 SCC still exposes Play/Pause/Stop runtime controls',
    panel5.includes("'scc-run'") &&
    panel5.includes("'scc-pause'") &&
    panel5.includes("'scc-stop'"));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
