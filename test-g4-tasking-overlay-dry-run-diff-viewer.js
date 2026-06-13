#!/usr/bin/env node
/*
 * G-4-E: read-only tasking overlay dry-run diff viewer.
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
        failures.push(label + (detail ? ' - ' + detail : ''));
        console.log('  [FAIL] ' + label + (detail ? ' - ' + detail : ''));
    }
}

console.log('\nG-4-E - Overlay dry-run diff viewer\n');

const APP_HTML = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
const PANEL_JS = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');

const panelStart = APP_HTML.indexOf('id="unit-status-panel"');
const panelEnd = APP_HTML.indexOf('<!-- OBJ-C:', panelStart);
const panelHtml = panelStart >= 0 && panelEnd > panelStart
    ? APP_HTML.slice(panelStart, panelEnd) : '';
const rendererStart = PANEL_JS.indexOf('function _populateTaskingOverlayDryRunDiff');
const rendererEnd = PANEL_JS.indexOf('/**\n     * Show/hide a single tasking detail row.', rendererStart);
const renderer = rendererStart >= 0 && rendererEnd > rendererStart
    ? PANEL_JS.slice(rendererStart, rendererEnd) : '';

ok('dry-run diff row exists in unit status panel',
    panelHtml.includes('id="usp-tasking-diff-row"') &&
    panelHtml.includes('id="usp-tasking-diff"'));
ok('dry-run diff label is display-only text',
    panelHtml.includes('Dry-run Diff'));
ok('dry-run diff row has read-only CSS classes',
    panelHtml.includes('usp-tasking-diff-row') &&
    APP_HTML.includes('.usp-tasking-diff-row') &&
    APP_HTML.includes('.usp-tasking-diff-val'));

ok('panel exposes dry-run diff accessor',
    PANEL_JS.includes('function _getUnitTaskingOverlayDryRunDiff'));
ok('accessor reads only derived dry-run diff slots',
    PANEL_JS.includes('derived.unit_tasking_overlay_dry_run_diff') &&
    PANEL_JS.includes('derived.tasking_overlay_dry_run_diff'));
ok('accessor supports map and array diff shapes without mutation',
    PANEL_JS.includes('Array.isArray(src)') &&
    PANEL_JS.includes('if (src[uid]) return src[uid]'));
ok('panel does not build or approve dry-run diffs',
    !PANEL_JS.includes('buildDryRunDiff') &&
    !PANEL_JS.includes('approveCandidate'));

ok('populateAssignment passes overlay diff into tasking details',
    PANEL_JS.includes('var overlayDiff = _getUnitTaskingOverlayDryRunDiff(uid)') &&
    PANEL_JS.includes('_populateTaskingDetails(tasking, overlayPreview, overlayDiff)'));
ok('tasking detail block can render diff without baseline tasking',
    PANEL_JS.includes('if (!tasking && !overlayPreview && !overlayDiff)') &&
    PANEL_JS.includes('overlayDiff ||'));

ok('renderer shows required metadata flags',
    renderer.includes('read_only:true') &&
    renderer.includes('overlay_only:true') &&
    renderer.includes('baseline_mutation:false'));
ok('renderer uses before and after values',
    renderer.includes('var before = diff.before || {}') &&
    renderer.includes('var after = diff.after || {}') &&
    PANEL_JS.includes('function _formatTaskingDiffLine'));
ok('renderer whitelists allowed tasking fields',
    PANEL_JS.includes('var _G4_TASKING_DIFF_FIELDS = [') &&
    PANEL_JS.includes("'action_component'") &&
    PANEL_JS.includes("'action_what'") &&
    PANEL_JS.includes("'action_why'") &&
    PANEL_JS.includes("'action_intended_effect'") &&
    PANEL_JS.includes("'action_doctrine_cited'"));
ok('renderer includes step_index and phase references only',
    renderer.includes("'step_index: '") &&
    renderer.includes("'phase: '"));
ok('renderer does not iterate arbitrary changes or unknown fields',
    !renderer.includes('diff.changes') &&
    !renderer.includes('Object.keys(diff)') &&
    !renderer.includes('Object.keys(before)') &&
    !renderer.includes('Object.keys(after)'));
ok('renderer warns on forbidden fields without showing values',
    PANEL_JS.includes('function _forbiddenTaskingDiffWarnings') &&
    PANEL_JS.includes("text.indexOf('forbidden_field:') === 0") &&
    renderer.includes('Forbidden-field warnings:'));

ok('no edit controls added to panel HTML',
    !/id=["'][^"']*(?:edit|approve|apply|save|commit)[^"']*["']/i.test(panelHtml));
ok('no approve/apply button text added to panel HTML',
    !/button[^>]*>[^<]*(?:Approve|Apply|Commit|Save)/i.test(panelHtml));
ok('no persistence or backend calls added to panel JS',
    !/localStorage|sessionStorage|fetch\(|XMLHttpRequest/.test(PANEL_JS));
ok('no baseline unit tasking mutation in panel JS',
    !/ws\.derived\.unit_tasking\s*=/.test(PANEL_JS));
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
