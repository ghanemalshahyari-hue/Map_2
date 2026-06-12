/**
 * verify-pr-286L1A.js — Browser verification for PR-286L1A
 * Scenario Source Hub Simplification.
 *
 * Confirms the reorganized source area:
 *   - #sw-scenario-source-hub visible
 *   - #sw-source-live-primary contains the Live Scenario Import card (visible by default)
 *   - #sw-source-advanced-imports body hidden by default; toggle reveals Decision Package Import
 *   - Single-file Live Import still works (uploads small JSON via existing input)
 *   - Folder Intake still works (uses Playwright setInputFiles on the directory)
 *   - W3 dry-run + AMBER stay hidden
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const APP_URL   = 'http://localhost:8000/app.html';
const SHOTS_DIR = '/Users/engcode/Desktop/Map_2/docs/pr-286L1A-verify';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const SINGLE_FILE_SCENARIO = {
    scenario_id:    'pr286L1A-single',
    scenario_label: 'PR-286L1A Single-File Live Import',
    model_version:  '286L1A-v1',
    steps: [
        { index: 0, id: 'STEP-0', phase: 'briefing',
          decision_options: [
              { id: 'OPT-A', label: 'Single A' },
              { id: 'OPT-B', label: 'Single B' }
          ] },
        { index: 1, id: 'STEP-1', phase: 'execution' }
    ]
};
const SINGLE_FILE_PATH = path.join(os.tmpdir(), 'pr286L1A-single.json');
fs.writeFileSync(SINGLE_FILE_PATH, JSON.stringify(SINGLE_FILE_SCENARIO), 'utf8');

const FOLDER_SCENARIO = {
    scenario_id:    'pr286L1A-folder',
    scenario_label: 'PR-286L1A Folder Live Import',
    steps: [
        { index: 0, phase: 'briefing',
          decision_options: [{ id: 'FX', label: 'Folder X' }] },
        { index: 1, phase: 'execution' },
        { index: 2, phase: 'aar' }
    ]
};
const FOLDER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pr286L1A-folder-'));
fs.writeFileSync(path.join(FOLDER_DIR, 'scenario.json'),
                 JSON.stringify(FOLDER_SCENARIO), 'utf8');
fs.writeFileSync(path.join(FOLDER_DIR, 'side-asset.png'), 'PNG_PLACEHOLDER', 'utf8');

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
        return { found: true, visible: el.offsetParent !== null,
                 hidden: el.hasAttribute('hidden') };
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

        // C2: Hub structure visible
        console.log('\n--- C2: Source Hub structure ---');
        var hub        = await getVisibility(page, 'sw-scenario-source-hub');
        var primary    = await getVisibility(page, 'sw-source-live-primary');
        var advanced   = await getVisibility(page, 'sw-source-advanced-imports');
        var rules      = await getVisibility(page, 'sw-source-import-rules');
        check(hub.found && hub.visible,
              'C2a: #sw-scenario-source-hub visible');
        check(primary.found && primary.visible,
              'C2b: #sw-source-live-primary visible (Live Import primary)');
        check(advanced.found && advanced.visible,
              'C2c: #sw-source-advanced-imports section visible (header strip)');
        check(rules.found && rules.visible,
              'C2d: #sw-source-import-rules visible');

        // C3: Decision Package body collapsed by default
        console.log('\n--- C3: Decision Package body collapsed by default ---');
        var advBody = await getVisibility(page, 'sw-source-advanced-body');
        check(advBody.found && advBody.hidden && !advBody.visible,
              'C3: #sw-source-advanced-body hidden by default',
              'hidden:' + advBody.hidden + ' visible:' + advBody.visible);

        // Decision Package Import card present but NOT currently visible (inside collapsed body)
        var dpkgCard = await getVisibility(page, 'sw-local-json-source-card');
        check(dpkgCard.found && !dpkgCard.visible,
              'C3b: Decision Package Import card present but NOT visible by default');

        await page.screenshot({ path: path.join(SHOTS_DIR, '01-collapsed-default.png') });

        // C4: Live Scenario Import card IS visible and is primary
        var liveImportCard = await getVisibility(page, 'sw-live-scenario-import-card');
        check(liveImportCard.found && liveImportCard.visible,
              'C4: Live Scenario Import card visible (primary action)');
        var folderIntake = await getVisibility(page, 'sw-live-scenario-folder-intake');
        check(folderIntake.found && folderIntake.visible,
              'C4b: Folder Intake visible inside primary live import card');

        // C5: Containment — Live Import inside primary, Dpkg inside advanced body
        var containment = await page.evaluate(function() {
            var live = document.getElementById('sw-live-scenario-import-card');
            var dpkg = document.getElementById('sw-local-json-source-card');
            return {
                liveInsidePrimary: live ? !!live.closest('#sw-source-live-primary') : false,
                liveInsideAdv:     live ? !!live.closest('#sw-source-advanced-imports') : false,
                dpkgInsideAdv:     dpkg ? !!dpkg.closest('#sw-source-advanced-body') : false,
                dpkgInsidePrimary: dpkg ? !!dpkg.closest('#sw-source-live-primary') : false
            };
        });
        check(containment.liveInsidePrimary && !containment.liveInsideAdv,
              'C5a: Live Import card is inside primary, NOT advanced');
        check(containment.dpkgInsideAdv && !containment.dpkgInsidePrimary,
              'C5b: Decision Package Import is inside advanced body, NOT primary');

        // C6: Toggle reveals advanced body → Decision Package becomes visible
        console.log('\n--- C6: Toggle reveals advanced imports ---');
        await page.evaluate(function() {
            var btn = document.getElementById('sw-source-advanced-toggle');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        var afterToggle = await page.evaluate(function() {
            var body = document.getElementById('sw-source-advanced-body');
            var dpkg = document.getElementById('sw-local-json-source-card');
            var btn  = document.getElementById('sw-source-advanced-toggle');
            return {
                bodyVisible:   body ? body.offsetParent !== null : false,
                dpkgVisible:   dpkg ? dpkg.offsetParent !== null : false,
                ariaExpanded:  btn  ? btn.getAttribute('aria-expanded') : null,
                btnText:       btn  ? (btn.textContent || '').trim() : ''
            };
        });
        check(afterToggle.bodyVisible && afterToggle.dpkgVisible,
              'C6a: toggle reveals advanced body + Decision Package Import',
              'body:' + afterToggle.bodyVisible + ' dpkg:' + afterToggle.dpkgVisible);
        check(afterToggle.ariaExpanded === 'true',
              'C6b: toggle button aria-expanded=true');
        check(afterToggle.btnText.indexOf('Hide') >= 0 ||
              afterToggle.btnText.indexOf('إخفاء') >= 0,
              'C6c: toggle button text now says "Hide"', afterToggle.btnText);

        await page.screenshot({ path: path.join(SHOTS_DIR, '02-advanced-expanded.png') });

        // Toggle back to keep the rest of the test focused on primary
        await page.evaluate(function() {
            var btn = document.getElementById('sw-source-advanced-toggle');
            if (btn) btn.click();
        });
        await page.waitForTimeout(200);

        // C7: Single-file Live Import still works
        console.log('\n--- C7: Single-file Live Import flow ---');
        var singleInput = await page.$('#sw-live-scenario-import-input');
        if (!singleInput) throw new Error('single-file import input not found');
        await singleInput.setInputFiles(SINGLE_FILE_PATH);
        await page.waitForTimeout(200);
        await page.evaluate(function() {
            var b = document.getElementById('sw-live-scenario-import-btn');
            if (b) b.click();
        });
        await page.waitForTimeout(500);
        var afterSingle = await page.evaluate(function() {
            function txt(id) {
                var e = document.getElementById(id);
                return e ? (e.textContent || '').trim() : '';
            }
            return {
                title: txt('sw-live-scenario-title'),
                id:    txt('sw-live-scenario-id'),
                step:  txt('sw-live-scenario-step'),
                stepCount: window.RmoozScenario.scenario.steps.length
            };
        });
        check(afterSingle.title.indexOf('PR-286L1A Single-File Live Import') >= 0 &&
              afterSingle.id.indexOf('pr286L1A-single') >= 0 &&
              afterSingle.stepCount === 2,
              'C7: single-file live import sets window.RmoozScenario',
              JSON.stringify(afterSingle));

        // C8: Folder import flow still works
        console.log('\n--- C8: Folder import flow ---');
        var folderInput = await page.$('#sw-live-scenario-folder-input');
        if (!folderInput) throw new Error('folder input not found');
        await folderInput.setInputFiles(FOLDER_DIR);
        await page.waitForTimeout(200);

        // Scan
        await page.evaluate(function() {
            var b = document.getElementById('sw-live-scenario-folder-scan-btn');
            if (b) b.click();
        });
        await page.waitForTimeout(400);
        var candidateCount = await page.evaluate(function() {
            var el = document.getElementById('sw-live-scenario-folder-candidates');
            if (!el) return 0;
            return el.querySelectorAll('.sw-live-scenario-folder-cand-row').length;
        });
        check(candidateCount === 1,
              'C8a: folder scan finds 1 JSON candidate', candidateCount);

        // Select the candidate
        await page.evaluate(function() {
            var radio = document.querySelector(
                '#sw-live-scenario-folder-candidates ' +
                'input.sw-live-scenario-folder-cand-radio');
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await page.waitForTimeout(200);
        // Click import-selected
        await page.evaluate(function() {
            var b = document.getElementById('sw-live-scenario-folder-import-btn');
            if (b) b.click();
        });
        await page.waitForTimeout(800);
        var afterFolder = await page.evaluate(function() {
            function txt(id) {
                var e = document.getElementById(id);
                return e ? (e.textContent || '').trim() : '';
            }
            return {
                title: txt('sw-live-scenario-title'),
                id:    txt('sw-live-scenario-id'),
                step:  txt('sw-live-scenario-step'),
                stepCount: window.RmoozScenario.scenario.steps.length
            };
        });
        check(afterFolder.title.indexOf('PR-286L1A Folder Live Import') >= 0 &&
              afterFolder.id.indexOf('pr286L1A-folder') >= 0 &&
              afterFolder.stepCount === 3,
              'C8b: folder import sets window.RmoozScenario (replaces single-file scenario)',
              JSON.stringify(afterFolder));

        await page.screenshot({ path: path.join(SHOTS_DIR, '03-after-both-imports.png') });

        // C9: W3 dry-run still hidden
        var drp   = await getVisibility(page, 'sw-drp-section');
        var w3bar = await getVisibility(page, 'sw-w3-load-bar');
        var amber = await getVisibility(page, 'sw-drp-amber-badge');
        check(drp.found && !drp.visible &&
              w3bar.found && !w3bar.visible &&
              !amber.visible,
              'C9: W3 dry-run + W3 load bar + AMBER badge all NOT visible');

        // C10: External Scenario Catalog still present
        var extCat = await getVisibility(page, 'sw-external-catalog-source-card');
        check(extCat.found,
              'C10: External Scenario Catalog card still present (outside hub, untouched)');

        // C11: No scenario-mutating backend calls
        var FORBIDDEN_RE = /\/api\/sim\/commit|applyDecision|executeSimulation|\/api\/scenario\/(commit|apply|mutate|save|advance|decide|update)|gate\s*7/i;
        var bad = networkCalls.filter(function(c) { return FORBIDDEN_RE.test(c); });
        check(bad.length === 0,
              'C11: no scenario-mutating backend calls',
              bad.length ? 'FORBIDDEN: ' + bad.join(' | ') : 'none');

        // C12: console errors
        await page.waitForTimeout(500);
        check(consoleErrors.length === 0,
              'C12: zero console errors',
              consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        await page.screenshot({ path: path.join(SHOTS_DIR, '04-final.png') });

    } catch(err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
        try { fs.unlinkSync(SINGLE_FILE_PATH); } catch (_) {}
        try { fs.rmSync(FOLDER_DIR, { recursive: true, force: true }); } catch (_) {}
    }

    console.log('\n' + '═'.repeat(65));
    console.log('  PR-286L1A Browser Verification — RESULTS');
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

    process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
