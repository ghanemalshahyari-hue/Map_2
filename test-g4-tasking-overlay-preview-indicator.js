#!/usr/bin/env node
/*
 * G-4-D: read-only tasking overlay preview indicator.
 *
 * Static regression checks for Selected Unit / Object Status Card display.
 * No browser, no backend, no persistence, no mutation.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, cond, detail) {
    if (cond) {
        passed++;
        console.log('  [PASS] ' + label);
    } else {
        failed++;
        failures.push(label + (detail ? ' — ' + detail : ''));
        console.log('  [FAIL] ' + label + (detail ? ' — ' + detail : ''));
    }
}

console.log('\nG-4-D — Overlay preview indicator\n');

const APP_HTML = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
const PANEL_JS = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');

const panelStart = APP_HTML.indexOf('id="unit-status-panel"');
const panelEnd = APP_HTML.indexOf('<!-- OBJ-C:', panelStart);
const panelHtml = panelStart >= 0 && panelEnd > panelStart
    ? APP_HTML.slice(panelStart, panelEnd) : '';

ok('indicator row exists in unit status panel',
    panelHtml.includes('id="usp-tasking-overlay-row"') &&
    panelHtml.includes('id="usp-tasking-overlay"'));
ok('indicator label is display-only overlay preview text',
    panelHtml.includes('Overlay Preview'));
ok('indicator has read-only CSS class',
    panelHtml.includes('usp-tasking-overlay-row') &&
    APP_HTML.includes('.usp-tasking-overlay-row') &&
    APP_HTML.includes('.usp-tasking-overlay-val'));

ok('panel exposes overlay preview accessor',
    PANEL_JS.includes('function _getUnitTaskingOverlayPreview'));
ok('accessor reads only derived.unit_tasking_overlay_preview',
    PANEL_JS.includes('ws.derived.unit_tasking_overlay_preview') &&
    !/ws\.derived\.unit_tasking\s*=/.test(PANEL_JS));
ok('populateAssignment passes overlay preview into tasking details',
    PANEL_JS.includes('var overlayPreview = _getUnitTaskingOverlayPreview(uid)') &&
    PANEL_JS.includes('_populateTaskingDetails(tasking, overlayPreview, overlayDiff)'));
ok('tasking detail block can show overlay-only indicator',
    PANEL_JS.includes('if (!tasking && !overlayPreview && !overlayDiff)') &&
    PANEL_JS.includes('overlayPreview ||'));
ok('indicator text includes exact availability message',
    PANEL_JS.includes('Overlay preview available'));
ok('indicator text includes source label g4_tasking_overlay fallback',
    PANEL_JS.includes("source.kind || 'g4_tasking_overlay'"));
ok('indicator text includes baseline_mutation:false',
    PANEL_JS.includes('baseline_mutation:') &&
    PANEL_JS.includes("? 'false'"));
ok('indicator text includes read_only and overlay_only flags',
    PANEL_JS.includes('read_only:true') &&
    PANEL_JS.includes('overlay_only:true'));

ok('no edit controls added to panel HTML',
    !/id=[\"'][^\"']*(?:edit|approve|apply|save|commit)[^\"']*[\"']/i.test(panelHtml));
ok('no approve/apply button text added to panel HTML',
    !/button[^>]*>[^<]*(?:Approve|Apply|Commit|Save)/i.test(panelHtml));
ok('no persistence or backend calls added to panel JS',
    !/localStorage|sessionStorage|fetch\(|XMLHttpRequest/.test(PANEL_JS));
ok('no imported source or live scenario mutation strings added',
    !/imported_json\s*=|source_json\s*=|live_scenario\s*=/.test(PANEL_JS));
ok('no movement/readiness/placement mutation path added',
    !/movement_order\s*=|readiness\s*=|posture\s*=|placement\s*=/.test(PANEL_JS));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
}
process.exit(failed ? 1 : 0);
