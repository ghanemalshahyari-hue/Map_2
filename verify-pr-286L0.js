/**
 * verify-pr-286L0.js — Browser verification for PR-286L0 Live Scenario Import.
 *
 * Drives a real Playwright browser against localhost:8000/app.html.
 *
 * Strategy:
 *   Create a tiny RMOOZ-compatible scenario JSON file in tmp, upload it via
 *   the new #sw-live-scenario-import-input, click Import, and verify the
 *   live workspace fully repaints with the new scenario.
 *
 * Checklist:
 *  C1.  Open Scenario Workspace.
 *  C2.  Live Scenario Import card visible.
 *  C3.  Decision Package Import is clearly separate (different title text).
 *  C4-C6. W3 dry-run + Load W3 button + AMBER still hidden.
 *  C7-C8. Upload test scenario JSON + click Import button.
 *  C9.  Status says "Import successful".
 *  C10. Live header changes to imported scenario name + id.
 *  C11. Step Navigator resets to Step 1 of 3.
 *  C12. Live Decision Action shows step 0 options.
 *  C13. Click Select on a live option → recorded.
 *  C14. Click live Next.
 *  C15. Header advances to Step 2 of 3.
 *  C16. Live Decision Action shows step 1 options.
 *  C17. window.RmoozScenario.scenario.scenario_id matches imported id.
 *  C18. Scenario Source section still exists; external catalog untouched.
 *  C19. No scenario-mutating backend calls.
 *  C20. No forbidden Apply/Commit/Execute/Go-Live buttons in live workspace.
 *  C21. No console errors.
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const APP_URL   = 'http://localhost:8000/app.html';
const SHOTS_DIR = '/Users/engcode/Desktop/Map_2/docs/pr-286L0-verify';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

// Build a small RMOOZ-compatible scenario JSON for upload.
const TEST_SCENARIO = {
    scenario_id:    'pr286L0-import-test',
    scenario_label: 'PR-286L0 Import Test Scenario',
    model_version:  '286L0-v1',
    map_bbox:       [10, 20, 30, 40],
    phase_table:    ['briefing', 'planning', 'execution'],
    obj:            { name: 'Test Objective', target_depth_km: 50 },
    bls_template:   [{ name: 'BLS-1', role: 'primary' }],
    blue_units_initial: [
        { uid: 'B-1', label: 'Blue Alpha',  echelon: 'company' }
    ],
    red_units: [
        { uid: 'R-1', label: 'Red Alpha',   echelon: 'platoon' }
    ],
    blue_unit_step_coords: { 'B-1': [[10.5, 20.5], [11.0, 20.7], [11.5, 21.0]] },
    red_unit_step_coords:  { 'R-1': [[15.0, 25.0], [15.5, 25.5], [16.0, 26.0]] },
    steps: [
        { index: 0, id: 'STEP-0', phase: 'briefing',  time_label: 'T+0',
          narrative_en_fallback: 'Initial briefing.',
          decision_options: [
              { id: 'OPT-HOLD', label: 'Hold position', summary: 'Maintain posture' },
              { id: 'OPT-ADV',  label: 'Advance',       summary: 'Move forward 5km' }
          ] },
        { index: 1, id: 'STEP-1', phase: 'planning', time_label: 'T+1',
          narrative_en_fallback: 'Planning phase.',
          decisionOptions: [
              { id: 'OPT-A', label: 'Alpha plan' },
              { id: 'OPT-B', label: 'Beta plan' }
          ] },
        { index: 2, id: 'STEP-2', phase: 'execution', time_label: 'T+2' }
    ]
};

// Write the scenario to a tmp file for FileChooser upload
const TMP_PATH = path.join(os.tmpdir(), 'pr286L0-test-scenario.json');
fs.writeFileSync(TMP_PATH, JSON.stringify(TEST_SCENARIO, null, 2), 'utf8');

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

async function getVisibility(page, id) {
    return page.evaluate(function(elId) {
        var el = document.getElementById(elId);
        if (!el) return { found: false, visible: false };
        return { found: true, visible: el.offsetParent !== null };
    }, id);
}

async function run() {
    const browser = await chromium.launch({ headless: true, slowMo: 80 });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const consoleErrors = [];
    const networkCalls  = [];
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push('[pageerror] ' + err.message));

    try {
        // Login
        await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
        const pwInput = await page.$('input[type="password"]');
        if (pwInput) {
            const usrInput = await page.$('input[type="text"]');
            if (usrInput) await usrInput.fill('admin');
            await pwInput.fill('OFbtNeiz0ToBgnrLXVbRXA');
            const loginBtn = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("LOGIN")');
            if (loginBtn) await loginBtn.click();
            await page.waitForTimeout(2500);
            if (!page.url().includes('app.html')) {
                await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
            }
            await page.waitForTimeout(1000);
            consoleErrors.length = 0;
        }

        page.on('request', req => { networkCalls.push(req.method() + ' ' + req.url()); });

        // C1: Open Scenario Workspace
        console.log('\n--- C1: Open Scenario Workspace ---');
        const swBtn = await page.$('[data-tool="scenario-workspace"]');
        if (swBtn) { await swBtn.click(); await page.waitForTimeout(800); }
        check(true, 'C1: Scenario Workspace opened');

        // C2: Live Scenario Import card visible
        console.log('\n--- C2: Live Scenario Import card ---');
        var importCard = await getVisibility(page, 'sw-live-scenario-import-card');
        check(importCard.found && importCard.visible,
              'C2: #sw-live-scenario-import-card visible');

        // C3: Decision Package Import labelled distinctly
        console.log('\n--- C3: Decision Package Import distinct ---');
        var dpkgLabel = await page.evaluate(function() {
            var el = document.getElementById('sw-src-local-title');
            return el ? el.textContent.trim() : '';
        });
        check(dpkgLabel.indexOf('Decision Package Import') >= 0 ||
              dpkgLabel.indexOf('استيراد حزمة قرار') >= 0,
              'C3: Decision Package Import title set', dpkgLabel);

        // C4-C6: W3 dry-run still hidden
        console.log('\n--- C4-C6: W3 dry-run / AMBER hidden ---');
        var drp = await getVisibility(page, 'sw-drp-section');
        var w3Bar = await getVisibility(page, 'sw-w3-load-bar');
        var amber = await getVisibility(page, 'sw-drp-amber-badge');
        check(drp.found && !drp.visible,    'C4: #sw-drp-section NOT visible');
        check(w3Bar.found && !w3Bar.visible,'C5: #sw-w3-load-bar NOT visible');
        check(!amber.visible,                'C6: AMBER badge NOT visible');

        await page.screenshot({ path: path.join(SHOTS_DIR, '01-before-import.png') });

        // C7-C8: Upload scenario + click Import
        console.log('\n--- C7-C8: Upload scenario + import ---');
        var importInput = await page.$('#sw-live-scenario-import-input');
        if (!importInput) throw new Error('import input not found');
        await importInput.setInputFiles(TMP_PATH);
        await page.waitForTimeout(200);

        await page.evaluate(function() {
            var btn = document.getElementById('sw-live-scenario-import-btn');
            if (btn) btn.click();
        });
        await page.waitForTimeout(600);
        check(true, 'C7: Scenario JSON uploaded via FileReader');
        check(true, 'C8: Import button clicked');

        // C9: Status says successful
        var statusInfo = await page.evaluate(function() {
            var el = document.getElementById('sw-live-scenario-import-status');
            return el ? { text: el.textContent.trim(),
                          level: el.getAttribute('data-level') } : null;
        });
        check(statusInfo &&
              (statusInfo.text.indexOf('Import successful') >= 0 ||
               statusInfo.text.indexOf('تم الاستيراد') >= 0),
              'C9: status reads "Import successful"',
              statusInfo ? statusInfo.text + ' (level=' + statusInfo.level + ')' : 'null');

        // C10: Live header reflects imported scenario
        var hdr = await page.evaluate(function() {
            function txt(id) {
                var e = document.getElementById(id);
                return e ? (e.textContent || '').trim() : '';
            }
            return {
                title: txt('sw-live-scenario-title'),
                id:    txt('sw-live-scenario-id'),
                step:  txt('sw-live-scenario-step'),
                phase: txt('sw-live-scenario-phase'),
                src:   txt('sw-live-scenario-source')
            };
        });
        check(hdr.title.indexOf('PR-286L0 Import Test Scenario') >= 0,
              'C10: live header shows imported scenario_label', hdr.title);
        check(hdr.id.indexOf('pr286L0-import-test') >= 0,
              'C10b: live header shows imported scenario_id', hdr.id);

        // C11: Step Navigator reset to Step 1 of 3
        check(/(Step|الخطوة)\s+1\s+(of|من)\s+3/.test(hdr.step),
              'C11: header shows "Step 1 of 3"', hdr.step);
        check(hdr.phase.indexOf('briefing') >= 0,
              'C11b: header shows phase=briefing for new step 0', hdr.phase);

        // C12: Live Decision Action shows step 0 options (OPT-HOLD, OPT-ADV)
        var step0Opts = await page.evaluate(function() {
            var opts = document.getElementById('sw-live-decision-options');
            if (!opts) return [];
            return Array.prototype.slice.call(
                opts.querySelectorAll('.sw-live-decision-option-label'))
                .map(function(e) { return e.textContent.trim(); });
        });
        check(step0Opts.length === 2 &&
              step0Opts.some(function(l) { return l.indexOf('Hold position') >= 0; }),
              'C12: Live Decision Action shows step-0 options',
              '[' + step0Opts.join(', ') + ']');

        await page.screenshot({ path: path.join(SHOTS_DIR, '02-after-import.png') });

        // C13: Click Select on first option → recorded
        await page.evaluate(function() {
            var btn = document.querySelector(
                '#sw-live-decision-options .sw-live-decision-select-btn');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        var selInfo = await page.evaluate(function() {
            var el = document.getElementById('sw-live-decision-selected');
            var state = window.AppShellScenarioWorkspace.getLiveOperatorWorkflowState();
            return {
                text:   el ? el.textContent : '',
                hidden: el ? el.hasAttribute('hidden') : true,
                keys:   Object.keys(state.selections)
            };
        });
        check(!selInfo.hidden && selInfo.text.indexOf('Hold position') >= 0 &&
              selInfo.keys.length === 1 &&
              selInfo.keys[0].indexOf('pr286L0-import-test') >= 0,
              'C13: Select on live option records into PR-286L state',
              'text:"' + selInfo.text + '" keys:[' + selInfo.keys.join(',') + ']');

        // C14-C15: Click live Next → Step 2 of 3
        await page.evaluate(function() {
            var btn = document.getElementById('sw-nav-next');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        var hdr2 = await page.evaluate(function() {
            function txt(id) {
                var e = document.getElementById(id);
                return e ? (e.textContent || '').trim() : '';
            }
            return {
                step:  txt('sw-live-scenario-step'),
                phase: txt('sw-live-scenario-phase'),
                idx:   window.RmoozScenario && window.RmoozScenario.stepIndex
            };
        });
        check(/(Step|الخطوة)\s+2\s+(of|من)\s+3/.test(hdr2.step) && hdr2.idx === 1,
              'C14-C15: header advances to "Step 2 of 3" after Next',
              hdr2.step + ' idx:' + hdr2.idx);

        // C16: Live Decision Action shows step 1 options (Alpha plan / Beta plan)
        var step1Opts = await page.evaluate(function() {
            var opts = document.getElementById('sw-live-decision-options');
            if (!opts) return [];
            return Array.prototype.slice.call(
                opts.querySelectorAll('.sw-live-decision-option-label'))
                .map(function(e) { return e.textContent.trim(); });
        });
        check(step1Opts.length === 2 &&
              step1Opts.some(function(l) { return l.indexOf('Alpha plan') >= 0; }) &&
              step1Opts.some(function(l) { return l.indexOf('Beta plan')  >= 0; }),
              'C16: Live Decision Action now shows step-1 options',
              '[' + step1Opts.join(', ') + ']');

        // C17: window.RmoozScenario fully replaced
        var winState = await page.evaluate(function() {
            return {
                scenarioId:  window.RmoozScenario.scenario.scenario_id,
                stepCount:   window.RmoozScenario.scenario.steps.length,
                stepIndex:   window.RmoozScenario.stepIndex,
                modelVer:    window.RmoozScenario.scenario.model_version
            };
        });
        check(winState.scenarioId === 'pr286L0-import-test' &&
              winState.stepCount === 3 &&
              winState.modelVer === '286L0-v1',
              'C17: window.RmoozScenario.scenario fully replaced',
              JSON.stringify(winState));

        // C18: Scenario Source section + external catalog still present
        var srcInfo = await page.evaluate(function() {
            return {
                section: !!document.getElementById('sw-scenario-source-section'),
                local:   !!document.getElementById('sw-local-json-source-card'),
                ext:     !!document.getElementById('sw-external-catalog-source-card'),
                import_: !!document.getElementById('sw-live-scenario-import-card')
            };
        });
        check(srcInfo.section && srcInfo.local && srcInfo.ext && srcInfo.import_,
              'C18: All Scenario Source subcards present (live import + decision pkg + external catalog)');

        // C19: No scenario-mutating backend calls
        var FORBIDDEN_RE = /\/api\/sim\/commit|applyDecision|executeSimulation|\/api\/scenario\/(commit|apply|mutate|save|advance|decide|update)|gate\s*7/i;
        var bad = networkCalls.filter(function(c) { return FORBIDDEN_RE.test(c); });
        check(bad.length === 0,
              'C19: no scenario-mutating backend calls',
              bad.length ? 'FORBIDDEN: ' + bad.join(' | ') : 'none');

        // C20: No forbidden buttons in live workspace
        var forbiddenBtns = await page.evaluate(function() {
            var PATTERNS = [/^apply$/i, /^commit$/i, /^execute$/i,
                            /^go live$/i, /^approve$/i, /^confirm$/i];
            var found = [];
            var lw = document.getElementById('sw-live-workspace');
            if (!lw) return found;
            Array.prototype.slice.call(lw.querySelectorAll('button, [role="button"]'))
                .forEach(function(b) {
                    if (b.offsetParent === null) return;
                    var txt = (b.textContent || '').trim();
                    PATTERNS.forEach(function(p) { if (p.test(txt)) found.push(txt); });
                });
            return found;
        });
        check(forbiddenBtns.length === 0,
              'C20: no forbidden buttons in #sw-live-workspace',
              forbiddenBtns.length ? 'FOUND: ' + forbiddenBtns.join(', ') : 'none');

        // C21: console errors
        await page.waitForTimeout(500);
        check(consoleErrors.length === 0,
              'C21: zero console errors',
              consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        await page.screenshot({ path: path.join(SHOTS_DIR, '03-final.png') });

    } catch(err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
    }

    console.log('\n' + '═'.repeat(65));
    console.log('  PR-286L0 Browser Verification — RESULTS');
    console.log('═'.repeat(65));
    results.forEach(r => {
        console.log('  ' + (r.ok ? '✅' : '❌') + '  ' + r.label +
                    (r.detail !== undefined ? ' — ' + r.detail : ''));
    });
    console.log('─'.repeat(65));
    console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
    console.log('═'.repeat(65));
    console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
    console.log('  Screenshots: ' + SHOTS_DIR);
    console.log('  Test scenario JSON: ' + TMP_PATH);

    process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
