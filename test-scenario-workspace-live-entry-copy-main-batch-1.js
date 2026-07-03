'use strict';

/*
 * RMOOZ cleanup gate: Scenario Workspace entry copy must present the live path.
 *
 * This is main-app only and does not touch offline.
 */

var fs = require('fs');
var path = require('path');

var appFile = path.join(__dirname, 'UI_MOdified', 'client', 'app.html');
var i18nFile = path.join(__dirname, 'UI_MOdified', 'client', 'i18n.js');
var workspaceFile = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'scenario-workspace.js');
var editFile = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'scenario-edit-mode.js');
var controlFile = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js');
var railFile = path.join(__dirname, 'UI_MOdified', 'client', 'tool-rail.js');
var demoFile = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'demo-scenario-preview.js');

var app = fs.readFileSync(appFile, 'utf8');
var i18n = fs.readFileSync(i18nFile, 'utf8');
var workspace = fs.readFileSync(workspaceFile, 'utf8');
var edit = fs.readFileSync(editFile, 'utf8');
var control = fs.readFileSync(controlFile, 'utf8');
var rail = fs.readFileSync(railFile, 'utf8');
var demo = fs.readFileSync(demoFile, 'utf8');

var passed = 0;
var failed = 0;
function assert(label, cond) {
    if (cond) { console.log('PASS ' + label); passed += 1; }
    else { console.error('FAIL ' + label); failed += 1; }
}

function around(source, needle, before, after) {
    var idx = source.indexOf(needle);
    if (idx < 0) return '';
    return source.slice(Math.max(0, idx - (before || 400)), idx + (after || 400));
}

function immediateCommentBeforeScript(scriptName) {
    var tag = '<script src="shell/' + scriptName;
    var scriptIdx = app.indexOf(tag);
    if (scriptIdx < 0) return '';
    var open = app.lastIndexOf('<!--', scriptIdx);
    if (open < 0) return '';
    var close = app.indexOf('-->', open);
    if (close < 0 || close > scriptIdx) return '';
    return app.slice(open, close + 3);
}

function scriptCount(scriptName) {
    var re = new RegExp('<script\\s+src="shell/' + scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    var m = app.match(re);
    return m ? m.length : 0;
}

console.log('\n=== RMOOZ Scenario Workspace live entry copy gate ===\n');

var entry = around(app, 'data-tool="scenario-workspace"', 250, 450);
assert('tool rail Scenario Workspace title is live', entry.indexOf('Live Scenario Workspace') >= 0);
assert('tool rail Scenario Workspace title is not read-only', !/read-only workspace/i.test(entry));

var strip = around(app, 'sw-live-workspace-notice', 350, 350);
assert('workspace status strip uses live notice key', strip.indexOf('data-i18n="sw-live-workspace-notice"') >= 0);
assert('workspace status strip points to Scenario Control Center', strip.indexOf('Scenario Control Center') >= 0);
assert('workspace status strip no longer says mutation disabled', strip.indexOf('Scenario mutation is disabled') < 0);
assert('workspace strip uses status/check icon, not lock path', strip.indexOf('M7 11V7') < 0 && strip.indexOf('<circle cx="12" cy="12" r="9"') >= 0);

assert('EN i18n live workspace notice present', i18n.indexOf("'sw-live-workspace-notice':  'Live workspace.") >= 0);
assert('EN i18n live workflow summary present', i18n.indexOf("'sw-live-workflow-summary':  'Live path:") >= 0);
assert('EN i18n live commit summary present', i18n.indexOf("'sw-live-commit-summary':    'AI proposal Accept/Reject uses live commit'") >= 0);
assert('old read-only notice key removed from app and i18n', (app + i18n).indexOf('sw-readonly-notice') < 0);
assert('old mutation-disabled invariant removed from app and i18n', (app + i18n).indexOf('sw-mutation-disabled') < 0);
assert('old AI proposes-only invariant removed from app and i18n', (app + i18n).indexOf('sw-ai-propose-only') < 0);

var briefing = around(app, 'sw-briefing-hdr-sub', 150, 250);
assert('briefing subcopy presents live overview', briefing.indexOf('Live operational overview') >= 0);
assert('briefing subcopy points edits to Edit Mode', briefing.indexOf('Edit Mode') >= 0);

var sourcePanel = around(app, 'sw-src-panel-subtitle', 250, 450);
assert('source panel copy includes live scenario loading', sourcePanel.indexOf('Load a live scenario') >= 0);
assert('source panel copy no longer says preview-only no scenario change', sourcePanel.indexOf('Preview only') < 0 && sourcePanel.indexOf('no scenario change') < 0);

assert('live scenario import title is not legacy', app.indexOf('Full Scenario JSON — Load Live Scenario') >= 0);
assert('live scenario import fallback points to Import Scenario', app.indexOf('Use Import Scenario for Step 1 / operational JSON') >= 0);
assert('runtime import blocked message points to Import Scenario', workspace.indexOf('Use Import Scenario for Step 1 / operational JSON') >= 0);
assert('runtime import blocked message no longer points to Review AI Understanding', workspace.indexOf('Review AI Understanding') < 0);

var previewControls = around(app, 'scenarioWorkspace.previewControlsSubheaderKicker', 150, 450);
assert('live walkthrough relabels visible preview controls as step inspection', previewControls.indexOf('Step Inspection') >= 0);
assert('visible inspection copy says active live step is unchanged', previewControls.indexOf('without changing the active live scenario step') >= 0);
assert('i18n relabels visible preview controls as step inspection', i18n.indexOf("'scenarioWorkspace.previewControlsSubheaderKicker': 'Step Inspection'") >= 0);

assert('tool-rail fallback says live workspace', rail.indexOf('Live Scenario Workspace — load, edit, and control scenarios') >= 0);
assert('tool-rail fallback no longer says read-only workspace', rail.indexOf('Scenario overview — read-only workspace') < 0);
assert('scenario-workspace module header says live path', workspace.indexOf('Scenario Workspace Shell (live path)') >= 0);
assert('scenario-workspace module header no longer says shell read-only', workspace.indexOf('Scenario Workspace Shell (read-only)') < 0);
assert('Edit Mode script remains loaded exactly once', scriptCount('scenario-edit-mode.js') === 1);
assert('Scenario Control Center script remains loaded exactly once', scriptCount('scenario-control-center.js') === 1);
assert('scenario-edit-mode source still mounts into workspace panel', edit.indexOf("var PANEL_ID   = 'scenario-workspace-panel';") >= 0);
assert('scenario-control-center source still exports rebuild marker', control.indexOf('RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF') >= 0);

var commitComment = immediateCommentBeforeScript('ai-proposal-commit-bridge.js');
assert('commit bridge load comment describes live commit path', commitComment.indexOf('/api/sim/commit') >= 0 && commitComment.indexOf('ACCEPT/REJECT') >= 0);
assert('commit bridge load comment is not dry-run', !/DRY-RUN|NEVER calls \/api\/sim\/commit|dryrun-ok/i.test(commitComment));
assert('commit bridge script remains loaded', scriptCount('ai-proposal-commit-bridge.js') === 1);

var workspaceComment = immediateCommentBeforeScript('scenario-workspace.js');
assert('scenario-workspace load comment describes live workspace host', workspaceComment.indexOf('live scenario workspace') >= 0);
assert('scenario-workspace load comment keeps previews secondary', workspaceComment.indexOf('developer-only preview helpers') >= 0);
assert('scenario-workspace load comment is not read-only-only', workspaceComment.indexOf('Scenario Workspace Shell (read-only)') < 0);

var demoComment = immediateCommentBeforeScript('demo-scenario-preview.js');
assert('demo preview load comment marks retired shim', /retired[\s\S]*compatibility shim only/i.test(demoComment));
assert('demo preview load comment does not present active AI preview', demoComment.indexOf('AI Decision-Making Scenario Preview') < 0);
assert('demo preview shim still has no fetch', !/\bfetch\s*\(/.test(demo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
assert('demo preview shim still has no Leaflet preview layer', !/layerGroup\s*\(|L\.marker\s*\(|L\.polyline\s*\(/.test(demo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));

var checkedSources = app + '\n' + i18n + '\n' + rail + '\n' + workspace;
[
    'Scenario overview — read-only workspace',
    'Read-only workspace. Scenario mutation is disabled.',
    'AI proposes only — Operator approves',
    'Preview only — no scenario change.',
    'Legacy / Full Scenario JSON',
    'Review AI Understanding'
].forEach(function (oldText) {
    assert('old main-workspace copy removed: ' + oldText, checkedSources.indexOf(oldText) < 0);
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
