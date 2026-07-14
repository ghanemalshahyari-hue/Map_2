/* ============================================================================
 * test-ui-clickability-hidden-overlays-1.js
 * ----------------------------------------------------------------------------
 * Static UI clickability contract:
 * - Developer-only timeline/legacy compatibility cards must not render as
 *   visible inert surfaces over the live workspace.
 * - Objective X remains an intentional click target that opens a closeable
 *   read-only evidence panel.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const C_HTML  = 'UI_MOdified/client/app.html';
const C_STYLE = 'UI_MOdified/client/style.css';
const C_MAP   = 'UI_MOdified/client/wargame/adjudicator-map.js';
const C_OEP   = 'UI_MOdified/client/shell/objective-evidence-panel.js';

const html  = read(C_HTML);
const style = read(C_STYLE);
const map   = read(C_MAP);
const oep   = read(C_OEP);

let passed = 0;
let failed = 0;
function ok(name, cond) {
    if (cond) { passed++; console.log('  PASS  ' + name); }
    else { failed++; console.log('  FAIL  ' + name); }
}

ok('A1 style.css is cache-busted for the hidden clickability contract',
    /href="style\.css\?v=103-click-contract"/.test(html));

ok('A2 hidden and dev-only inert surfaces are forced out of layout',
    /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/.test(style) &&
    /\[data-dev-only\]\[hidden\]\s*,\s*\[data-dev-only\]\[inert\]\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/.test(style));

ok('B1 developer timeline strip is hidden, aria-hidden, inert, and dev-only',
    /id="timeline-strip"[^>]*class="timeline-strip"[^>]*hidden[^>]*aria-hidden="true"[^>]*inert[^>]*data-dev-only="timeline-preview"/.test(html));

ok('B2 authored-frame timeline card is inside a hidden inert dev-only section',
    /data-sw-group="clock"[^>]*aria-label="Internal authored-frame review"[^>]*hidden[^>]*aria-hidden="true"[^>]*inert[^>]*data-dev-only="authored-frame-review"[\s\S]*id="spt-card"/.test(html));

ok('B3 legacy wargame rail and panel remain hidden inert developer surfaces',
    /data-tool="wargame"[^>]*hidden[^>]*aria-hidden="true"[^>]*data-dev-only="legacy-wargame"/.test(html) &&
    /id="wargame-panel"[^>]*hidden[^>]*aria-hidden="true"[^>]*inert[^>]*data-dev-only="legacy-wargame"/.test(html));

ok('C1 Objective X marker dispatches objective-selected on click',
    /objMarker\.on\('click'[\s\S]*rmooz:objective-selected/.test(map));

ok('C2 Objective X marker advertises clickability in cursor/class',
    map.includes("_objEl.style.cursor = 'pointer'") &&
    map.includes("classList.add('rmooz-objective-clickable')"));

ok('C3 objective evidence panel starts hidden and hidden means display none important',
    /class="oep-panel oep-hidden"[^>]*id="objective-evidence-panel"/.test(html) &&
    /\.oep-hidden\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/.test(html));

ok('C4 objective evidence render opens the panel and wires close X',
    oep.includes("panelEl.classList.remove('oep-hidden')") &&
    /querySelector\('\.oep-close'\)[\s\S]*addEventListener\('click',\s*hideObjectiveEvidence\)/.test(oep));

ok('C5 objective evidence close path removes content and hides panel',
    /function hideObjectiveEvidence\(\)[\s\S]*classList\.add\('oep-hidden'\)[\s\S]*innerHTML\s*=\s*''/.test(oep));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
