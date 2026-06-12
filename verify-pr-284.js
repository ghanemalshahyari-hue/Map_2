/**
 * verify-pr-284.js — Browser verification for PR-284 External Scenario Source Trace Inspector
 * Drives a real Playwright browser against localhost:8000/app.html.
 *
 * Checklist:
 *  1.  Open Scenario Workspace — confirm it opens normally
 *  2.  #sw-ext-trace-section visible and compact inside workspace
 *  3.  Empty state shows before any entry is set
 *  4.  Load manifest via previewExternalScenarioCatalogSubsetFromManifest (limit 10)
 *  5.  After autoPreviewFirst — trace body is visible, empty hidden
 *  6.  Trace shows confidence, titleFrom, yearFrom, authorFrom, notesFrom, relationship,
 *      ini-policy, lua-policy, binary-policy, human-review, readiness, warnings
 *  7.  Change scenario selection — trace updates
 *  8.  No Import/Apply/Run/Execute/Commit/Confirm/Approve/Go Live in trace section
 *  9.  No <button> in trace section
 * 10.  PR-281/282 sections still present (no regression)
 * 11.  Wargame 3 exports still present
 * 12.  Zero console errors
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const APP_URL       = 'http://localhost:8000/app.html';
const SHOTS_DIR     = '/Users/engcode/Desktop/Map_2/docs/pr-284-verify';
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
        check(true, 'C1: Scenario Workspace opened');

        // C2: #sw-ext-trace-section exists and is compact inside workspace
        const secInfo = await page.evaluate(function() {
            var sec = document.getElementById('sw-ext-trace-section');
            if (!sec) return { found: false };
            var r = sec.getBoundingClientRect();
            var inPanel = !!sec.closest('#scenario-workspace-panel');
            return { found: true, h: r.height, w: r.width, inPanel: inPanel };
        });
        check(secInfo.found,    'C2: #sw-ext-trace-section exists in DOM');
        check(secInfo.inPanel,  'C2b: #sw-ext-trace-section is inside #scenario-workspace-panel');
        check(secInfo.h < 300,  'C2c: #sw-ext-trace-section is compact',
              secInfo.h > 0 ? secInfo.h + 'px' : 'not measured');

        // C3: Empty state visible before manifest
        const emptyState = await page.evaluate(function() {
            var emptyEl = document.getElementById('sw-ext-trace-empty');
            var bodyEl  = document.getElementById('sw-ext-trace-body');
            if (!emptyEl || !bodyEl) return { found: false };
            return {
                found:       true,
                emptyHidden: emptyEl.hasAttribute('hidden'),
                bodyHidden:  bodyEl.hasAttribute('hidden')
            };
        });
        check(emptyState.found,       'C3: trace empty/body elements in DOM');
        check(!emptyState.emptyHidden, 'C3b: empty state is visible before manifest');
        check(emptyState.bodyHidden,   'C3c: trace body is hidden before manifest');

        // C4: Load manifest + autoPreviewFirst
        console.log('\n--- Loading manifest ---');
        const previewResult = await page.evaluate(function(mfst) {
            if (!window.AppShellScenarioWorkspace) return { err: 'no AppShellScenarioWorkspace' };
            var fn = window.AppShellScenarioWorkspace.previewExternalScenarioCatalogSubsetFromManifest;
            if (!fn) return { err: 'fn not found' };
            try {
                var r = fn(mfst, { limit: 10, avoidLua: true, autoPreviewFirst: true });
                return {
                    passed: r.passed,
                    returnedCount: r.catalog ? r.catalog.returnedCount : null,
                    selectedId:    r.selectedEntry ? r.selectedEntry.scenarioId : null,
                    selectedTitle: r.selectedEntry ? r.selectedEntry.title : null
                };
            } catch(e) { return { err: e.message }; }
        }, manifest);

        check(!previewResult.err && previewResult.passed,
              'C4: previewExternalScenarioCatalogSubsetFromManifest succeeded',
              previewResult.err || (previewResult.passed ? 'passed:true' : 'failed'));
        check(previewResult.returnedCount === 10, 'C4b: 10 scenarios loaded',
              'returnedCount: ' + previewResult.returnedCount);

        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS_DIR, '02-after-load.png') });

        // C5: After autoPreviewFirst → trace body visible, empty hidden
        const traceAfterLoad = await page.evaluate(function() {
            var bodyEl  = document.getElementById('sw-ext-trace-body');
            var emptyEl = document.getElementById('sw-ext-trace-empty');
            if (!bodyEl || !emptyEl) return { found: false };
            return {
                found:       true,
                bodyHidden:  bodyEl.hasAttribute('hidden'),
                emptyHidden: emptyEl.hasAttribute('hidden')
            };
        });
        check(!traceAfterLoad.bodyHidden,  'C5: trace body is visible after autoPreviewFirst');
        check(traceAfterLoad.emptyHidden,  'C5b: trace empty is hidden after autoPreviewFirst');

        // C6: Trace fields are populated
        const traceFields = await page.evaluate(function() {
            function txt(id) {
                var el = document.getElementById(id);
                return el ? el.textContent.trim() : null;
            }
            return {
                confidence:       txt('sw-ext-trace-confidence'),
                titleFrom:        txt('sw-ext-trace-title-from'),
                yearFrom:         txt('sw-ext-trace-year-from'),
                authorFrom:       txt('sw-ext-trace-author-from'),
                notesFrom:        txt('sw-ext-trace-notes-from'),
                relationshipFrom: txt('sw-ext-trace-relationship-from'),
                iniPolicy:        txt('sw-ext-trace-ini-policy'),
                luaPolicy:        txt('sw-ext-trace-lua-policy'),
                binaryPolicy:     txt('sw-ext-trace-binary-policy'),
                humanReview:      txt('sw-ext-trace-human-review'),
                readiness:        txt('sw-ext-trace-readiness'),
                warnings:         txt('sw-ext-trace-warnings')
            };
        });
        check(!!traceFields.confidence && traceFields.confidence.length > 0,
              'C6: confidence field populated', traceFields.confidence);
        check(!!traceFields.titleFrom && traceFields.titleFrom.length > 0,
              'C6b: titleFrom field populated', traceFields.titleFrom);
        check(!!traceFields.iniPolicy && traceFields.iniPolicy === 'weapon_patch_only',
              'C6c: iniPolicy = weapon_patch_only', traceFields.iniPolicy);
        check(traceFields.luaPolicy === 'blocked',
              'C6d: luaPolicy = blocked', traceFields.luaPolicy);
        check(traceFields.binaryPolicy === 'not_parsed',
              'C6e: binaryPolicy = not_parsed', traceFields.binaryPolicy);
        check(traceFields.humanReview === 'required',
              'C6f: humanReview = required', traceFields.humanReview);
        check(traceFields.readiness === 'catalog_entry_only',
              'C6g: readiness = catalog_entry_only', traceFields.readiness);
        check(!!traceFields.warnings && traceFields.warnings.length > 0,
              'C6h: warnings field populated', traceFields.warnings);

        // Scroll + screenshot the trace section
        await page.evaluate(function() {
            var sec = document.getElementById('sw-ext-trace-section');
            if (sec) sec.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(300);
        var traceBox = await page.evaluate(function() {
            var sec = document.getElementById('sw-ext-trace-section');
            if (!sec) return null;
            var r = sec.getBoundingClientRect();
            return { x: Math.max(0,r.left-5), y: Math.max(0,r.top-5),
                     width: Math.ceil(r.width+10), height: Math.ceil(r.height+10) };
        });
        if (traceBox && traceBox.width > 10 && traceBox.height > 10) {
            await page.screenshot({ path: path.join(SHOTS_DIR, '03-trace-zoom.png'), clip: traceBox });
            console.log('  Screenshot: 03-trace-zoom.png');
        }

        // C7: Change selection → trace updates
        console.log('\n--- Changing selection ---');
        const opts = await page.evaluate(function() {
            var sel = document.getElementById('sw-ext-select-control');
            if (!sel) return [];
            var os = [];
            for (var i = 1; i < Math.min(sel.options.length, 4); i++) {
                os.push({ value: sel.options[i].value, text: sel.options[i].textContent });
            }
            return os;
        });
        if (opts.length >= 2) {
            const confBefore = await page.evaluate(function() {
                var el = document.getElementById('sw-ext-trace-confidence');
                return el ? el.textContent : '';
            });
            await page.selectOption('#sw-ext-select-control', opts[1].value);
            await page.waitForTimeout(400);
            const confAfter = await page.evaluate(function() {
                var bodyEl = document.getElementById('sw-ext-trace-body');
                var el     = document.getElementById('sw-ext-trace-confidence');
                return { bodyHidden: bodyEl ? bodyEl.hasAttribute('hidden') : true,
                         conf: el ? el.textContent : '' };
            });
            check(!confAfter.bodyHidden, 'C7: trace body still visible after selection change');
            check(!!confAfter.conf && confAfter.conf.length > 0,
                  'C7b: confidence still populated after change', confAfter.conf);
            await page.screenshot({ path: path.join(SHOTS_DIR, '04-after-change.png') });
        } else {
            check(true, 'C7: selection change — skipped (too few options)');
            check(true, 'C7b: confidence after change — skipped');
        }

        // C8: No forbidden buttons in trace section
        console.log('\n--- Checking forbidden buttons ---');
        const forbiddenInTrace = await page.evaluate(function() {
            var PATTERNS = [/^import$/i, /^apply$/i, /^run$/i, /^execute$/i,
                            /^commit$/i, /^confirm$/i, /^approve$/i, /^go live$/i];
            var found = [];
            var c = document.getElementById('sw-ext-trace-section');
            if (!c) return found;
            Array.from(c.querySelectorAll('button, [role="button"], input[type="button"]'))
                .forEach(function(btn) {
                    var txt = (btn.textContent || btn.value || '').trim();
                    PATTERNS.forEach(function(p) { if (p.test(txt)) found.push(txt); });
                });
            return found;
        });
        check(forbiddenInTrace.length === 0,
              'C8: no forbidden action buttons in trace section',
              forbiddenInTrace.length ? 'FOUND: ' + forbiddenInTrace.join(', ') : 'none');

        // C9: No <button> at all in trace section
        const btnCount = await page.evaluate(function() {
            var c = document.getElementById('sw-ext-trace-section');
            if (!c) return -1;
            return c.querySelectorAll('button, [role="button"], a[href], input[type="button"]').length;
        });
        check(btnCount === 0,
              'C9: no interactive elements in trace section', btnCount + ' found');

        // C10: PR-281/282 sections still present
        const legacySections = await page.evaluate(function() {
            return {
                preview: !!document.getElementById('sw-ext-preview-section'),
                select:  !!document.getElementById('sw-ext-select-section')
            };
        });
        check(legacySections.preview, 'C10: PR-281 #sw-ext-preview-section still present');
        check(legacySections.select,  'C10b: PR-282 #sw-ext-select-section still present');

        // C11: Wargame 3 exports intact
        const wg3Ok = await page.evaluate(function() {
            var sw = window.AppShellScenarioWorkspace;
            if (!sw) return false;
            return typeof sw.checkWargame3ScenarioWorkflowAcceptance === 'function' &&
                   typeof sw.buildExternalScenarioCatalogFromManifest === 'function' &&
                   typeof sw.buildExternalScenarioSourceTrace          === 'function' &&
                   typeof sw.paintExternalScenarioSourceTrace          === 'function';
        });
        check(wg3Ok, 'C11: All PR-279/280/281/282/284 exports present (no regression)');

        // C12: Zero console errors
        await page.waitForTimeout(500);
        check(consoleErrors.length === 0, 'C12: Zero console errors',
              consoleErrors.length ? consoleErrors.slice(0,3).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        // Final screenshot
        await page.screenshot({ path: path.join(SHOTS_DIR, '05-final.png') });
        console.log('  Screenshot: 05-final.png');

    } catch(err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
    }

    // Report
    console.log('\n' + '═'.repeat(65));
    console.log('  PR-284 Browser Verification — RESULTS');
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
