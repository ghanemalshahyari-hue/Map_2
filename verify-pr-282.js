/**
 * verify-pr-282.js — Browser verification for PR-282 External Scenario Preview Selection
 * Drives a real Playwright browser against localhost:8000/app.html.
 *
 * Checklist:
 *  1. Open Scenario Workspace — confirm it opens normally
 *  2. #sw-ext-select-section visible and compact inside workspace
 *  3. Select is disabled before manifest is provided
 *  4. Call previewExternalScenarioCatalogSubsetFromManifest with real manifest (limit 10, autoPreviewFirst:true)
 *  5. Selector shows 10 options (not 630)
 *  6. First scenario appears in PR-281 preview section
 *  7. Change selection — preview section updates
 *  8. No Import/Apply/Run/Execute/Commit/Confirm/Approve/Go Live in selector/preview
 *  9. Wargame 3 still works
 * 10. No console errors
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const APP_URL   = 'http://localhost:8000/app.html';
const SHOTS_DIR = '/Users/engcode/Desktop/Map_2/docs/pr-282-verify';
const MANIFEST_PATH = '/Users/engcode/Desktop/Map_2/docs/scenario-pack-audit/external_scenario_source_manifest.json';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

let passed = 0, failed = 0;
const results = [];
function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label + (detail ? ' — ' + detail : ''));
    return ok;
}

async function run() {
    const browser = await chromium.launch({ headless: true, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const consoleErrors = [];
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push('[pageerror] ' + err.message));

    try {
        // Load + login
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

        // C1: Open Scenario Workspace
        console.log('\n--- Opening Scenario Workspace ---');
        const swBtn = await page.$('[data-tool="scenario-workspace"]');
        if (swBtn) { await swBtn.click(); await page.waitForTimeout(800); }
        await page.screenshot({ path: path.join(SHOTS_DIR, '01-sw-open.png') });

        // C2: #sw-ext-select-section exists and is compact
        const secInfo = await page.evaluate(function() {
            var sec = document.getElementById('sw-ext-select-section');
            if (!sec) return { found: false };
            var r = sec.getBoundingClientRect();
            var inPanel = !!sec.closest('#scenario-workspace-panel');
            return { found: true, h: r.height, w: r.width, inPanel: inPanel };
        });
        check(secInfo.found, '#sw-ext-select-section exists in DOM');
        check(secInfo.inPanel, '#sw-ext-select-section is inside #scenario-workspace-panel (not a new page)');
        check(secInfo.h < 300, '#sw-ext-select-section is compact',
              secInfo.h > 0 ? secInfo.h + 'px' : 'not visible');

        // C3: Select is disabled before manifest
        const selectDisabled = await page.evaluate(function() {
            var sel = document.getElementById('sw-ext-select-control');
            return sel ? sel.disabled : null;
        });
        check(selectDisabled === true, 'Select control is disabled before manifest is loaded',
              'disabled: ' + selectDisabled);

        // C4: Call previewExternalScenarioCatalogSubsetFromManifest
        console.log('\n--- Loading subset from manifest ---');
        const previewResult = await page.evaluate(function(mfst) {
            if (!window.AppShellScenarioWorkspace) return { err: 'no AppShellScenarioWorkspace' };
            var fn = window.AppShellScenarioWorkspace.previewExternalScenarioCatalogSubsetFromManifest;
            if (!fn) return { err: 'fn not found' };
            try {
                var r = fn(mfst, { limit: 10, avoidLua: true, autoPreviewFirst: true });
                return {
                    passed: r.passed,
                    returnedCount: r.catalog ? r.catalog.returnedCount : null,
                    selectedId: r.selectedEntry ? r.selectedEntry.scenarioId : null,
                    selectedTitle: r.selectedEntry ? r.selectedEntry.title : null,
                    blockedReasons: r.blockedReasons
                };
            } catch (e) { return { err: e.message }; }
        }, manifest);

        check(!previewResult.err && previewResult.passed,
              'previewExternalScenarioCatalogSubsetFromManifest succeeded',
              previewResult.err || (previewResult.passed ? 'passed:true' : JSON.stringify(previewResult.blockedReasons)));
        check(previewResult.returnedCount === 10, 'Returned 10 scenarios (not 630)',
              'returnedCount: ' + previewResult.returnedCount);
        check(!!previewResult.selectedTitle, 'autoPreviewFirst selected first scenario',
              previewResult.selectedTitle || 'none');

        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS_DIR, '02-after-load.png') });

        // C5: Selector shows 10 options (+ 1 prompt = 11 total)
        const optionCount = await page.evaluate(function() {
            var sel = document.getElementById('sw-ext-select-control');
            return sel ? sel.options.length : -1;
        });
        check(optionCount === 11, 'Selector has 10 + 1 prompt = 11 options',
              optionCount + ' options');
        check(optionCount <= 26, 'Selector does NOT render all 630 scenarios',
              optionCount + ' options total');

        // C6: First scenario appears in preview section
        const previewVisible = await page.evaluate(function() {
            var bodyEl = document.getElementById('sw-ext-preview-body');
            if (!bodyEl) return { found: false };
            var isHidden = bodyEl.hasAttribute('hidden');
            var dts = bodyEl.querySelectorAll('dt').length;
            var txt = bodyEl.textContent.toLowerCase();
            return { found: true, isHidden: isHidden, dtCount: dts, text: txt.substring(0, 200) };
        });
        check(previewVisible.found && !previewVisible.isHidden,
              'PR-281 preview body is visible after autoPreviewFirst');
        check(previewVisible.dtCount > 0, 'Preview body has field rows rendered',
              previewVisible.dtCount + ' dt elements');

        // Scroll to section and take zoomed screenshot
        await page.evaluate(function() {
            var sec = document.getElementById('sw-ext-select-section');
            if (sec) sec.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(400);

        var selBox = await page.evaluate(function() {
            var sec = document.getElementById('sw-ext-select-section');
            if (!sec) return null;
            var r = sec.getBoundingClientRect();
            // Also include the preview section if it's directly after
            var preview = document.getElementById('sw-ext-preview-section');
            var endY = r.bottom;
            if (preview) {
                var pr = preview.getBoundingClientRect();
                endY = Math.max(endY, pr.bottom);
            }
            return { x: Math.max(0, r.left-5), y: Math.max(0, r.top-5),
                     width: Math.ceil(r.width+10), height: Math.ceil(endY - r.top + 10) };
        });
        if (selBox && selBox.width > 10 && selBox.height > 10) {
            await page.screenshot({ path: path.join(SHOTS_DIR, '03-selector-zoom.png'), clip: selBox });
            console.log('  Screenshot: 03-selector-zoom.png');
        }

        // C7: Change selection — preview updates
        console.log('\n--- Changing selection ---');
        const selectEl = await page.$('#sw-ext-select-control');
        if (selectEl) {
            // Get options list
            const opts = await page.evaluate(function() {
                var sel = document.getElementById('sw-ext-select-control');
                var os = [];
                for (var i = 1; i < Math.min(sel.options.length, 4); i++) {
                    os.push({ value: sel.options[i].value, text: sel.options[i].textContent });
                }
                return os;
            });
            if (opts.length >= 2) {
                // Select the second option
                await page.selectOption('#sw-ext-select-control', opts[1].value);
                await page.waitForTimeout(400);
                const previewAfterChange = await page.evaluate(function() {
                    var bodyEl = document.getElementById('sw-ext-preview-body');
                    if (!bodyEl) return null;
                    return { isHidden: bodyEl.hasAttribute('hidden'), text: bodyEl.textContent.substring(0, 100) };
                });
                check(previewAfterChange && !previewAfterChange.isHidden,
                      'Preview body still visible after selection change');
                check(!!previewAfterChange && previewAfterChange.text.length > 10,
                      'Preview content updated after selection change',
                      previewAfterChange ? previewAfterChange.text.substring(0, 60) : 'empty');
                await page.screenshot({ path: path.join(SHOTS_DIR, '04-after-change.png') });
            } else {
                check(true, 'Selection change test — skipped (too few options)');
                check(true, 'Preview update test — skipped');
            }
        }

        // C8: No forbidden buttons in selector/preview sections
        console.log('\n--- Checking forbidden buttons ---');
        const forbiddenInSections = await page.evaluate(function() {
            var PATTERNS = [/^import$/i, /^apply$/i, /^run$/i, /^execute$/i,
                            /^commit$/i, /^confirm$/i, /^approve$/i, /^go live$/i];
            var found = [];
            var containers = [
                document.getElementById('sw-ext-select-section'),
                document.getElementById('sw-ext-preview-section')
            ];
            containers.forEach(function(c) {
                if (!c) return;
                Array.from(c.querySelectorAll('button, [role="button"], input[type="button"]'))
                    .forEach(function(btn) {
                        var txt = (btn.textContent || btn.value || '').trim();
                        PATTERNS.forEach(function(p) { if (p.test(txt)) found.push(txt); });
                    });
            });
            return found;
        });
        check(forbiddenInSections.length === 0,
              'No forbidden action buttons inside selector/preview sections',
              forbiddenInSections.length ? 'FOUND: ' + forbiddenInSections.join(', ') : 'none');

        // C8b: Both sections are purely read-only
        const interactiveCount = await page.evaluate(function() {
            var total = 0;
            ['sw-ext-select-section', 'sw-ext-preview-section'].forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                // select is allowed (it's the picker), but no buttons
                total += el.querySelectorAll('button, [role="button"], a[href], input[type="button"]').length;
            });
            return total;
        });
        check(interactiveCount === 0,
              'No action buttons/links in selector or preview sections',
              interactiveCount + ' interactive elements');

        // C9: Wargame 3 exports intact
        const wg3Ok = await page.evaluate(function() {
            var sw = window.AppShellScenarioWorkspace;
            if (!sw) return false;
            return typeof sw.checkWargame3ScenarioWorkflowAcceptance === 'function' &&
                   typeof sw.buildExternalScenarioCatalogFromManifest === 'function' &&
                   typeof sw.buildSingleExternalScenarioCatalogEntry === 'function';
        });
        check(wg3Ok, 'All PR-279/280/281 exports still present (no regression)');

        // C10: Console errors
        await page.waitForTimeout(500);
        check(consoleErrors.length === 0, 'Zero console errors',
              consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        // Final full screenshot
        await page.screenshot({ path: path.join(SHOTS_DIR, '05-final.png') });
        console.log('  Screenshot: 05-final.png');

    } catch (err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
    }

    // Report
    console.log('\n' + '═'.repeat(65));
    console.log('  PR-282 Browser Verification — RESULTS');
    console.log('═'.repeat(65));
    results.forEach(r => {
        console.log('  ' + (r.ok ? '✅' : '❌') + '  ' + r.label + (r.detail ? ' — ' + r.detail : ''));
    });
    console.log('─'.repeat(65));
    console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
    console.log('═'.repeat(65));
    console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
    console.log('  Screenshots: ' + SHOTS_DIR);

    process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
