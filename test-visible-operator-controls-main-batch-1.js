'use strict';
/**
 * test-visible-operator-controls-main-batch-1.js
 *
 * Guards the main app operator surface after the accepted live Scenario Workspace
 * copy batch:
 * - retired Wargame-panel scenario generation shortcut is not visible
 * - mock/preview cards are collapsed under Advanced / Developer Diagnostics
 * - detailed COA mode buttons are behind Advanced planning controls
 * - live Import Scenario wizard controls are not hidden by the legacy CSS rule
 */
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

var app  = read(path.join('UI_MOdified', 'client', 'app.html'));
var i18n = read(path.join('UI_MOdified', 'client', 'i18n.js'));
var ws   = read(path.join('UI_MOdified', 'client', 'shell', 'scenario-workspace.js'));
var scc  = read(path.join('UI_MOdified', 'client', 'shell', 'scenario-control-center.js'));

var pass = 0;
var fail = 0;
function check(ok, name, detail) {
    if (ok) {
        pass++;
        console.log('  OK ' + name);
    } else {
        fail++;
        console.log('  FAIL ' + name + (detail ? ' -- ' + detail : ''));
    }
}

function sliceBetween(src, startNeedle, endNeedle) {
    var start = src.indexOf(startNeedle);
    if (start < 0) return '';
    var end = src.indexOf(endNeedle, start + startNeedle.length);
    if (end < 0) end = src.length;
    return src.slice(start, end);
}

console.log('\nVisible operator controls main batch gate');

var wgTagMatch = app.match(/<div class="wargame-brief-card" id="wg-ai-gen-card"[^>]*>/);
check(!!wgTagMatch, 'T1: retired Wargame AI-generation card still has a compatibility DOM node');
check(!!wgTagMatch && /\bhidden\b/.test(wgTagMatch[0]),
    'T2: retired Wargame AI-generation card is hidden in markup');
check(/#wg-ai-gen-card\s*\{\s*display\s*:\s*none\s*!important;\s*\}/.test(app),
    'T3: retired Wargame AI-generation card is hidden by CSS too');

var legacyCss = sliceBetween(app, 'RMOOZ-LEGACY-OPERATOR-PATH-REMOVAL', '.sw-edit-btn');
check(legacyCss.indexOf('#wg-wz-start,') < 0 &&
      legacyCss.indexOf('#wg-wz-setup,') < 0 &&
      legacyCss.indexOf('#wg-wz-mdmp-row,') < 0,
    'T4: legacy CSS rule does not hide or restyle live Import Scenario wizard controls');

var secondaryHdr = sliceBetween(app, 'id="sw-secondary-cards"', 'id="sw-secondary-cards-body"');
check(secondaryHdr.indexOf('aria-label="Advanced developer diagnostics"') >= 0,
    'T5: collapsed mock/preview bucket is explicitly Advanced developer diagnostics');
check(secondaryHdr.indexOf('Advanced / Developer Diagnostics') >= 0,
    'T6: collapsed mock/preview bucket title is not operator-primary wording');
check(secondaryHdr.indexOf('Show advanced diagnostics') >= 0,
    'T7: collapsed mock/preview bucket toggle is Advanced-labelled');
check(secondaryHdr.indexOf('Secondary / Placeholder Tools') < 0 &&
      secondaryHdr.indexOf('Show secondary tools') < 0,
    'T8: old secondary/placeholder visible copy is gone from the bucket header');
check(/<div id="sw-secondary-cards-body"[^>]*hidden/.test(app),
    'T9: mock/preview bucket body stays collapsed by default');

check(i18n.indexOf("'sw-secondary-cards-title':        'Advanced / Developer Diagnostics'") >= 0,
    'T10: EN i18n title names Advanced / Developer Diagnostics');
check(i18n.indexOf("'sw-secondary-cards-toggle-show':  'Show advanced diagnostics'") >= 0 &&
      i18n.indexOf("'sw-secondary-cards-toggle-hide':  'Hide advanced diagnostics'") >= 0,
    'T11: EN i18n toggle copy uses advanced diagnostics');
check(i18n.indexOf("'sw-secondary-cards-title':        'Secondary / Placeholder Tools'") < 0 &&
      i18n.indexOf("'sw-secondary-cards-toggle-show':  'Show secondary tools'") < 0,
    'T12: old EN secondary/placeholder i18n copy is removed');
check(ws.indexOf("'Show advanced diagnostics'") >= 0 &&
      ws.indexOf("'Hide advanced diagnostics'") >= 0 &&
      ws.indexOf("'Show secondary tools'") < 0 &&
      ws.indexOf("'Hide secondary tools'") < 0,
    'T13: Scenario Workspace toggle fallbacks match Advanced diagnostics copy');

var panel2 = sliceBetween(scc, 'function panel2Prepare', 'function targetTable');
check(panel2.indexOf('data-scc="advanced-planning-controls"') >= 0,
    'T14: SCC advanced planning controls disclosure exists');
check(panel2.indexOf('Advanced planning controls') >= 0,
    'T15: SCC detailed COA controls are labelled Advanced');
check(/var _advancedControls[\s\S]*_strictBtn[\s\S]*scc-prepare-staffsafe/.test(panel2),
    'T16: strict AI-only and Staff-Safe buttons live inside the Advanced controls block');
check(/inner = _planErrHtml[\s\S]*_smartBtn[\s\S]*_advancedControls/.test(panel2),
    'T17: primary SCC path renders smart Prepare COA before the Advanced controls bucket');

console.log('');
console.log((fail === 0 ? 'PASS' : 'FAIL') + ' ' + pass + ' passed, ' + fail + ' failed (test-visible-operator-controls-main-batch-1.js)');
process.exit(fail ? 1 : 0);
