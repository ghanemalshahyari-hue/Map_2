#!/usr/bin/env node
/*
 * shell-safe-area.js checks — the app-shell content-band measurer.
 * No server, no scenario, no mutation. Pure measurement + CSS-var publishing.
 *
 * Regression guard for the bug: the card/unit panel ran behind the top header and the
 * bottom chrome (timeline strip + 200px event log + status footer + classification bars).
 * Here we prove the published band keeps a panel's top >= header bottom and bottom <= footer top.
 */
'use strict';

var path = require('path');
var fs = require('fs');

// Stubs MUST exist before require (the module measures once on load + registers listeners).
var VARS = {};
var QS = function () { return null; };
global.window = { innerHeight: 797, addEventListener: function () {} };
global.document = {
    querySelector: function (sel) { return QS(sel); },
    addEventListener: function () {},
    documentElement: { style: { setProperty: function (k, v) { VARS[k] = v; } } }
};

var SSA = require(path.join(__dirname, 'UI_MOdified/client/shell/shell-safe-area.js'));

var passed = 0, failed = 0;
function ok(label, cond) { if (cond) { passed++; console.log('  [PASS] ' + label); } else { failed++; console.log('  [FAIL] ' + label); } }
function el(top, bottom) { return { getBoundingClientRect: function () { return { top: top, bottom: bottom, height: bottom - top }; } }; }

console.log('shell-safe-area — app-shell content-band measurer\n');

// Real shell geometry (measured from the running app): classification-top 22 + header 52 => band top 74;
// workspace [74,511]; below it timeline-strip(36)+event-log(200)+statusbar(28)+classification(22) => band bottom 286.
var WORKSPACE = el(74, 511); // top 74, bottom 511, in a 797 viewport
var VH = 797, GAP = 6;

ok('exposes measure()', typeof SSA.measure === 'function');

/* ---- PRIMARY: anchor to the .workspace content band ---- */
VARS = {};
QS = function (sel) { return sel === '.workspace' ? WORKSPACE : null; };
var band = SSA.measure();
ok('workspace path: returns {top,bottom}', band && typeof band.top === 'number' && typeof band.bottom === 'number');
ok('top safe = workspace.top + gap (74+6=80)', band.top === 74 + GAP);
ok('bottom safe = vh - workspace.bottom + gap (797-511+6=292)', band.bottom === (VH - 511) + GAP);
ok('publishes --rmooz-shell-top-safe', VARS['--rmooz-shell-top-safe'] === '80px');
ok('publishes --rmooz-shell-bottom-safe', VARS['--rmooz-shell-bottom-safe'] === '292px');

/* ---- the BUG-FIX bounding invariant (user acceptance #8) ---- */
var headerBottom = 74, footerTop = 511; // top of the bottom-chrome stack (timeline strip)
var cardTop = band.top;                  // 80
var cardBottomEdge = VH - band.bottom;   // 797 - 292 = 505
ok('REGRESSION: card top (' + cardTop + ') >= header bottom (' + headerBottom + ')', cardTop >= headerBottom);
ok('REGRESSION: card bottom (' + cardBottomEdge + ') <= footer top (' + footerTop + ')', cardBottomEdge <= footerTop);

/* ---- FALLBACK: no content container, derive from chrome edges (incl. the 200px event log) ---- */
VARS = {};
QS = function (sel) {
    if (sel === '.app-header') return el(22, 74);        // header bottom = 74
    if (sel === '.classification-bar--top') return el(0, 22);
    if (sel === '#timeline-strip') return el(511, 547);  // topmost bottom-chrome element
    if (sel === '#event-log') return el(547, 747);
    if (sel === '.app-statusbar') return el(747, 775);
    if (sel === '.classification-bar--bottom') return el(775, 797);
    return null; // .workspace / main / #map absent
};
var fb = SSA.measure();
ok('fallback path: top = header bottom + gap (80)', fb.top === 74 + GAP);
ok('fallback path: bottom = vh - earliest bottom-chrome top + gap (797-511+6=292)', fb.bottom === (VH - 511) + GAP);

/* ---- headless / unmeasurable -> null, no throw, no vars ---- */
VARS = {};
QS = function () { return null; };
var none = SSA.measure();
ok('unmeasurable shell -> measure() returns null (no throw)', none === null);
ok('unmeasurable shell -> no vars published (CSS defaults apply)', Object.keys(VARS).length === 0);

/* ---- never throws when querySelector itself is missing (true headless) ---- */
var savedQ = global.document.querySelector;
delete global.document.querySelector;
var threw = false;
try { SSA.measure(); } catch (_) { threw = true; }
global.document.querySelector = savedQ;
ok('no querySelector -> measure() does not throw', threw === false);

/* ---- app.html: the Selected Unit Panel is bound to the same shell safe-area ---- */
var appHtml = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.html'), 'utf8');
var uspRule = (appHtml.match(/\.unit-status-panel\s*\{[^}]*\}/) || [''])[0];
ok('unit panel: bound to --rmooz-shell-top-safe', /top:\s*var\(--rmooz-shell-top-safe/.test(uspRule));
ok('unit panel: bound to --rmooz-shell-bottom-safe', /bottom:\s*var\(--rmooz-shell-bottom-safe/.test(uspRule));
ok('unit panel: max-height clamped to the content band', /max-height:\s*calc\(100vh - var\(--rmooz-shell-top-safe/.test(uspRule));
ok('unit panel: no longer top:0 / height:100vh (was the bug)', !/top:\s*0\b/.test(uspRule) && uspRule.indexOf('height: 100vh') === -1);
var uspBody = (appHtml.match(/\.usp-body\s*\{[^}]*\}/) || [''])[0];
ok('unit panel: real scroll body .usp-body scrolls internally (overflow-y:auto + min-height:0)',
    /overflow-y:\s*auto/.test(uspBody) && /min-height:\s*0/.test(uspBody));

/* ---- self-check: no nondeterminism / network in the source ---- */
var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/shell-safe-area.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok('source has no Date.now()/Math.random()', !/Date\.now\s*\(/.test(src) && !/Math\.random\s*\(/.test(src));
ok('source has no network/fetch calls', !/\bfetch\s*\(|XMLHttpRequest|require\(['"](https?|net)['"]\)/.test(src));

console.log('\n' + (failed ? '[FAIL] ' : '[OK]  ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
