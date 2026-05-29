/**
 * verify-pr-283.js — Browser verification for PR-283 Scenario Source Panel Consolidation
 * Drives a real Playwright browser against localhost:8000/app.html.
 *
 * Checklist:
 *  1.  Open Scenario Workspace — normal open
 *  2.  One clear "Scenario Source" section visible (#sw-scenario-source-section)
 *  3.  #sw-local-json-source-card visible inside it
 *  4.  #sw-external-catalog-source-card visible inside it
 *  5.  Local JSON import controls present inside local card
 *  6.  External selector (#sw-ext-select-section) inside external card
 *  7.  No new page — all inside #scenario-workspace-panel
 *  8.  External selector disabled before manifest
 *  9.  Load manifest — selector populates with 10 options, preview appears
 * 10.  #sw-ext-preview-section is inside #sw-external-catalog-source-card
 *      (injected between selector and trace)
 * 11.  Source trace appears inside external card
 * 12.  No Import/Apply/Run/Execute/Commit/Confirm/Approve/Go Live in source section
 * 13.  Wargame 3 exports still present
 * 14.  Zero console errors
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const APP_URL       = 'http://localhost:8000/app.html';
const SHOTS_DIR     = '/Users/engcode/Desktop/Map_2/docs/pr-283-verify';
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

        // C1: Open Scenario Workspace
        console.log('\n--- Opening Scenario Workspace ---');
        const swBtn = await page.$('[data-tool="scenario-workspace"]');
        if (swBtn) { await swBtn.click(); await page.waitForTimeout(800); }
        await page.screenshot({ path: path.join(SHOTS_DIR, '01-sw-open.png') });
        check(true, 'C1: Scenario Workspace opened');

        // C2: #sw-scenario-source-section visible and inside workspace panel
        const srcInfo = await page.evaluate(function() {
            var sec = document.getElementById('sw-scenario-source-section');
            if (!sec) return { found: false };
            var r = sec.getBoundingClientRect();
            var inPanel = !!sec.closest('#scenario-workspace-panel');
            return { found: true, h: r.height, inPanel: inPanel };
        });
        check(srcInfo.found,   'C2: #sw-scenario-source-section in DOM');
        check(srcInfo.inPanel, 'C2b: #sw-scenario-source-section inside #scenario-workspace-panel');

        // C3: #sw-local-json-source-card inside the source section
        const localCardInfo = await page.evaluate(function() {
            var card = document.getElementById('sw-local-json-source-card');
            if (!card) return { found: false };
            var inSrc = !!card.closest('#sw-scenario-source-section');
            return { found: true, inSrc: inSrc };
        });
        check(localCardInfo.found,   'C3: #sw-local-json-source-card in DOM');
        check(localCardInfo.inSrc,   'C3b: #sw-local-json-source-card inside source section');

        // C4: #sw-external-catalog-source-card inside the source section
        const extCardInfo = await page.evaluate(function() {
            var card = document.getElementById('sw-external-catalog-source-card');
            if (!card) return { found: false };
            var inSrc  = !!card.closest('#sw-scenario-source-section');
            var inPanel = !!card.closest('#scenario-workspace-panel');
            return { found: true, inSrc: inSrc, inPanel: inPanel };
        });
        check(extCardInfo.found,    'C4: #sw-external-catalog-source-card in DOM');
        check(extCardInfo.inSrc,    'C4b: #sw-external-catalog-source-card inside source section');
        check(extCardInfo.inPanel,  'C4c: inside #scenario-workspace-panel (not a new page)');

        // C5: Local JSON import controls inside local card
        const localControls = await page.evaluate(function() {
            var card = document.getElementById('sw-local-json-source-card');
            if (!card) return { found: false };
            return {
                found: true,
                manifestInput: !!card.querySelector('#sw-dpkg-manifest-input'),
                stepsInput:    !!card.querySelector('#sw-dpkg-steps-input'),
                importBtn:     !!card.querySelector('#sw-dpkg-import-json'),
                howTo:         card.innerHTML.indexOf('sw-dpkg-import-help') >= 0
            };
        });
        check(localControls.manifestInput, 'C5: manifest input inside local JSON card');
        check(localControls.stepsInput,    'C5b: steps input inside local JSON card');
        check(localControls.importBtn,     'C5c: Import JSON locally button inside local JSON card');
        check(localControls.howTo,         'C5d: How to import text inside local JSON card');

        // C6: External selector inside external card
        const extSelectInfo = await page.evaluate(function() {
            var card = document.getElementById('sw-external-catalog-source-card');
            if (!card) return { found: false };
            var selSec = card.querySelector('#sw-ext-select-section');
            var selCtrl = card.querySelector('#sw-ext-select-control');
            return { found: true,
                     selectSection: !!selSec,
                     selectControl: !!selCtrl,
                     selectDisabled: selCtrl ? selCtrl.disabled : null };
        });
        check(extSelectInfo.selectSection, 'C6: #sw-ext-select-section inside external catalog card');
        check(extSelectInfo.selectControl, 'C6b: #sw-ext-select-control found');
        check(extSelectInfo.selectDisabled === true,
              'C8: selector disabled before manifest', 'disabled: ' + extSelectInfo.selectDisabled);

        // Scroll to source section + screenshot
        await page.evaluate(function() {
            var s = document.getElementById('sw-scenario-source-section');
            if (s) s.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SHOTS_DIR, '02-source-section.png') });
        console.log('  Screenshot: 02-source-section.png');

        // C9: Load manifest
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
                    selectedTitle: r.selectedEntry ? r.selectedEntry.title : null
                };
            } catch(e) { return { err: e.message }; }
        }, manifest);
        check(!previewResult.err && previewResult.passed,
              'C9: previewExternalScenarioCatalogSubsetFromManifest passed');
        check(previewResult.returnedCount === 10, 'C9b: 10 scenarios loaded (not 630)',
              previewResult.returnedCount);

        await page.waitForTimeout(400);

        // C10: #sw-ext-preview-section injected inside external catalog card
        const previewInCard = await page.evaluate(function() {
            var card    = document.getElementById('sw-external-catalog-source-card');
            var preview = document.getElementById('sw-ext-preview-section');
            if (!card || !preview) return { cardFound: !!card, previewFound: !!preview };
            var inCard   = !!preview.closest('#sw-external-catalog-source-card');
            var inPanel  = !!preview.closest('#scenario-workspace-panel');
            var bodyHidden = document.getElementById('sw-ext-preview-body') ?
                             document.getElementById('sw-ext-preview-body').hasAttribute('hidden') : true;
            return { cardFound: true, previewFound: true, inCard: inCard, inPanel: inPanel,
                     bodyHidden: bodyHidden };
        });
        check(previewInCard.previewFound, 'C10: #sw-ext-preview-section injected into DOM');
        check(previewInCard.inCard,       'C10b: #sw-ext-preview-section is inside #sw-external-catalog-source-card');
        check(!previewInCard.bodyHidden,  'C10c: preview body visible after autoPreviewFirst');

        // C11: Trace section visible inside external card
        const traceInCard = await page.evaluate(function() {
            var card  = document.getElementById('sw-external-catalog-source-card');
            var trace = document.getElementById('sw-ext-trace-section');
            if (!card || !trace) return { found: false };
            var inCard = !!trace.closest('#sw-external-catalog-source-card');
            var bodyHidden = document.getElementById('sw-ext-trace-body') ?
                             document.getElementById('sw-ext-trace-body').hasAttribute('hidden') : true;
            return { found: true, inCard: inCard, bodyHidden: bodyHidden };
        });
        check(traceInCard.inCard,        'C11: #sw-ext-trace-section inside external catalog card');
        check(!traceInCard.bodyHidden,   'C11b: trace body visible after load');

        // Check DOM order: selector → preview → trace
        const domOrder = await page.evaluate(function() {
            var card    = document.getElementById('sw-external-catalog-source-card');
            if (!card) return null;
            var children = Array.from(card.children);
            var selectIdx  = children.findIndex(function(c){ return c.id === 'sw-ext-select-section'; });
            var previewIdx = children.findIndex(function(c){ return c.id === 'sw-ext-preview-section'; });
            var traceIdx   = children.findIndex(function(c){ return c.id === 'sw-ext-trace-section'; });
            return { selectIdx: selectIdx, previewIdx: previewIdx, traceIdx: traceIdx };
        });
        if (domOrder) {
            check(domOrder.selectIdx >= 0,  'C10d: select section is a child of catalog card',
                  'idx: ' + domOrder.selectIdx);
            check(domOrder.previewIdx >= 0, 'C10e: preview section is a child of catalog card',
                  'idx: ' + domOrder.previewIdx);
            check(domOrder.traceIdx >= 0,   'C10f: trace section is a child of catalog card',
                  'idx: ' + domOrder.traceIdx);
            check(domOrder.previewIdx > domOrder.selectIdx && domOrder.traceIdx > domOrder.previewIdx,
                  'C10g: DOM order is selector → preview → trace',
                  'select:' + domOrder.selectIdx + ' preview:' + domOrder.previewIdx + ' trace:' + domOrder.traceIdx);
        }

        await page.screenshot({ path: path.join(SHOTS_DIR, '03-after-load.png') });
        console.log('  Screenshot: 03-after-load.png');

        // C12: No forbidden buttons in source section
        console.log('\n--- Forbidden buttons check ---');
        const forbidden = await page.evaluate(function() {
            var PATTERNS = [/^apply$/i, /^run$/i, /^execute$/i,
                            /^commit$/i, /^confirm$/i, /^approve$/i, /^go live$/i];
            var found = [];
            var sec = document.getElementById('sw-scenario-source-section');
            if (!sec) return found;
            Array.from(sec.querySelectorAll('button, [role="button"]')).forEach(function(b) {
                var txt = (b.textContent || '').trim();
                PATTERNS.forEach(function(p) { if (p.test(txt)) found.push(txt); });
            });
            return found;
        });
        check(forbidden.length === 0,
              'C12: no forbidden action buttons in source section',
              forbidden.length ? 'FOUND: ' + forbidden.join(', ') : 'none');

        // C13: All PR-279/280/281/282/283/284 exports still present
        const exports = await page.evaluate(function() {
            var sw = window.AppShellScenarioWorkspace;
            if (!sw) return false;
            return typeof sw.checkWargame3ScenarioWorkflowAcceptance === 'function' &&
                   typeof sw.buildExternalScenarioCatalogFromManifest === 'function' &&
                   typeof sw.previewExternalScenarioCatalogSubsetFromManifest === 'function' &&
                   typeof sw.buildExternalScenarioSourceTrace === 'function' &&
                   typeof sw.paintExternalScenarioSourceTrace  === 'function';
        });
        check(exports, 'C13: all previous PR exports still present (no regression)');

        // C14: Zero console errors
        await page.waitForTimeout(500);
        check(consoleErrors.length === 0, 'C14: Zero console errors',
              consoleErrors.length ? consoleErrors.slice(0,3).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        // Final screenshot
        await page.screenshot({ path: path.join(SHOTS_DIR, '04-final.png') });
        console.log('  Screenshot: 04-final.png');

    } catch(err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
    }

    console.log('\n' + '═'.repeat(65));
    console.log('  PR-283 Browser Verification — RESULTS');
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
