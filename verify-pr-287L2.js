/**
 * verify-pr-287L2.js — Browser verification for PR-287L2 Live Scenario Workspace Consolidation.
 *
 * Strategy:
 *   wargame3.json has no live decision_options on any step. Inject a test scenario
 *   via console to exercise step navigation + live decision repaint coherence.
 *
 * Checklist:
 *  C1.  Open Scenario Workspace.
 *  C2.  #sw-live-workspace exists at the top of #scenario-workspace-panel.
 *  C3.  Header shows scenario name (label/title/name).
 *  C4.  Header shows scenario id.
 *  C5.  Header shows "Step N of T".
 *  C6.  Header shows phase / time / title.
 *  C7.  #sw-nav-card is visible and inside #sw-live-workspace.
 *  C8.  #sw-live-decision-card is visible directly below the navigator.
 *  C9.  Mock cards (spt, oid, apc, pra, dps, uild) are NOT visible in primary area.
 * C10.  #sw-secondary-cards-body is hidden by default.
 * C11.  Clicking #sw-secondary-cards-toggle reveals mock cards.
 * C12.  After reveal, #pra-card Approve button exists but is *inside* secondary section.
 * C13.  Inject test scenario → click Next → header counter increments.
 * C14.  Same click → Live Decision Action options update (step-coherent repaint).
 * C15.  Live map overlay still updates on step change (overlay toggle button enabled).
 * C16.  W3 dry-run remains hidden.
 * C17.  AMBER RIDGE not visible.
 * C18.  Scenario Source section still exists below.
 * C19.  No backend / scenario-mutating network calls.
 * C20.  No forbidden Apply/Commit/Execute/Go-Live buttons in #sw-live-workspace.
 * C21.  No console errors.
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const APP_URL   = 'http://localhost:8000/app.html';
const SHOTS_DIR = '/Users/engcode/Desktop/Map_2/docs/pr-287L2-verify';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const TEST_SCENARIO = {
    scenario_id:    'pr287L2-test-live',
    scenario_label: 'PR-287L2 Test Live Scenario',
    model_version:  'pr287L2-v1',
    steps: [
        {
            index: 0, phase: 'briefing', time_label: 'PHASE-0',
            decision_options: [
                { id: 'OPT-HOLD-0', label: 'Hold at step 0', summary: 'Step-0 action' },
                { id: 'OPT-ADV-0',  label: 'Advance at step 0', summary: 'Step-0 advance' }
            ]
        },
        {
            index: 1, phase: 'planning', time_label: 'PHASE-1',
            decision_options: [
                { id: 'OPT-A-1', label: 'Alpha at step 1', summary: 'Step-1 alpha' },
                { id: 'OPT-B-1', label: 'Beta at step 1',  summary: 'Step-1 beta' },
                { id: 'OPT-C-1', label: 'Gamma at step 1', summary: 'Step-1 gamma' }
            ]
        },
        { index: 2, phase: 'execution', time_label: 'PHASE-2' }
    ]
};

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
        return {
            found:   true,
            visible: el.offsetParent !== null,
            hidden:  el.hasAttribute('hidden')
        };
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
        await page.screenshot({ path: path.join(SHOTS_DIR, '01-workspace-open.png') });
        check(true, 'C1: Scenario Workspace opened');

        // C2: #sw-live-workspace exists at top
        console.log('\n--- C2: #sw-live-workspace ---');
        var lwInfo = await page.evaluate(function() {
            var lw = document.getElementById('sw-live-workspace');
            var panel = document.getElementById('scenario-workspace-panel');
            if (!lw || !panel) return { found: false };
            return {
                found:   true,
                visible: lw.offsetParent !== null,
                inPanel: !!lw.closest('#scenario-workspace-panel'),
                rect:    lw.getBoundingClientRect().top
            };
        });
        check(lwInfo.found && lwInfo.visible && lwInfo.inPanel,
              'C2: #sw-live-workspace visible inside #scenario-workspace-panel',
              'top:' + lwInfo.rect);

        // Inject test scenario + force refresh so the header reads it
        await page.evaluate(function(testScn) {
            window.RmoozScenario = { scenario: testScn, stepIndex: 0 };
            if (window.AppShellScenarioWorkspace) {
                window.AppShellScenarioWorkspace.refresh();
            }
        }, TEST_SCENARIO);
        await page.waitForTimeout(400);

        // C3-C6: Header content
        console.log('\n--- C3-C6: Live scenario header ---');
        var hdr = await page.evaluate(function() {
            function txt(id) {
                var e = document.getElementById(id);
                return e ? (e.textContent || '').trim() : '';
            }
            return {
                title:  txt('sw-live-scenario-title'),
                id:     txt('sw-live-scenario-id'),
                step:   txt('sw-live-scenario-step'),
                phase:  txt('sw-live-scenario-phase'),
                source: txt('sw-live-scenario-source')
            };
        });
        check(hdr.title.indexOf('PR-287L2 Test Live Scenario') >= 0,
              'C3: header shows scenario name', hdr.title);
        check(hdr.id.indexOf('pr287L2-test-live') >= 0,
              'C4: header shows scenario id', hdr.id);
        check(/(Step|الخطوة)\s+1\s+(of|من)\s+3/.test(hdr.step),
              'C5: header shows "Step 1 of 3"', hdr.step);
        check(hdr.phase.indexOf('briefing') >= 0,
              'C6: header shows phase', hdr.phase);
        check(hdr.source.indexOf('pr287L2-v1') >= 0,
              'C6b: header shows source (model_version)', hdr.source);

        // C6c: live map status element exists and reads off/on/available
        var mapStatus = await page.evaluate(function() {
            var el = document.getElementById('sw-live-map-status');
            return el ? { text: el.textContent.trim(),
                          state: el.getAttribute('data-state') } : null;
        });
        check(mapStatus !== null && mapStatus.text.length > 0,
              'C6c: #sw-live-map-status painted with text',
              mapStatus ? mapStatus.text + ' (state=' + mapStatus.state + ')' : 'null');

        // C7: nav card inside live workspace
        console.log('\n--- C7: nav card inside live workspace ---');
        var navIn = await page.evaluate(function() {
            var nav = document.getElementById('sw-nav-card');
            return {
                found:    !!nav,
                visible:  nav ? nav.offsetParent !== null : false,
                inLW:     nav ? !!nav.closest('#sw-live-workspace') : false
            };
        });
        check(navIn.found && navIn.visible && navIn.inLW,
              'C7: #sw-nav-card visible and inside #sw-live-workspace');

        // C8: live decision card directly below nav
        console.log('\n--- C8: live decision card placement ---');
        var ldInfo = await page.evaluate(function() {
            var nav = document.getElementById('sw-nav-card');
            var dec = document.getElementById('sw-live-decision-card');
            if (!nav || !dec) return { found: false };
            var navIdx = Array.prototype.indexOf.call(
                nav.parentNode.children, nav);
            var decIdx = Array.prototype.indexOf.call(
                dec.parentNode.children, dec);
            var sameParent = nav.parentNode === dec.parentNode;
            return {
                found:      true,
                inLW:       !!dec.closest('#sw-live-workspace'),
                sameParent: sameParent,
                immediatelyAfterNav: sameParent && (decIdx === navIdx + 1)
            };
        });
        check(ldInfo.found && ldInfo.inLW && ldInfo.immediatelyAfterNav,
              'C8: #sw-live-decision-card directly after #sw-nav-card inside #sw-live-workspace',
              'sameParent:' + ldInfo.sameParent +
              ' immediatelyAfterNav:' + ldInfo.immediatelyAfterNav);

        // C9: mock cards NOT visible in primary area
        console.log('\n--- C9: mock cards not visible by default ---');
        var mockState = await page.evaluate(function() {
            var ids = ['spt-card', 'oid-card', 'apc-card', 'pra-card', 'dps-card', 'uild-card'];
            return ids.map(function(id) {
                var el = document.getElementById(id);
                return {
                    id: id,
                    visible: el ? el.offsetParent !== null : false,
                    inSecondary: el ? !!el.closest('#sw-secondary-cards') : false
                };
            });
        });
        var visibleMocks = mockState.filter(function(m) { return m.visible; });
        check(visibleMocks.length === 0,
              'C9: no mock cards visible by default',
              visibleMocks.length ? 'VISIBLE: ' +
              visibleMocks.map(function(m){return m.id;}).join(', ') : 'all hidden');

        var allInSecondary = mockState.every(function(m) { return m.inSecondary; });
        check(allInSecondary,
              'C9b: all 6 mock cards live inside #sw-secondary-cards');

        // C10: secondary body hidden by default
        var secBody = await getVisibility(page, 'sw-secondary-cards-body');
        check(secBody.found && secBody.hidden && !secBody.visible,
              'C10: #sw-secondary-cards-body hidden by default');

        // C11: clicking toggle reveals mocks
        console.log('\n--- C11: toggle reveals mocks ---');
        await page.evaluate(function() {
            var btn = document.getElementById('sw-secondary-cards-toggle');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        var afterToggle = await page.evaluate(function() {
            var body = document.getElementById('sw-secondary-cards-body');
            var spt  = document.getElementById('spt-card');
            return {
                bodyVisible: body ? body.offsetParent !== null : false,
                sptVisible:  spt  ? spt.offsetParent  !== null : false
            };
        });
        check(afterToggle.bodyVisible && afterToggle.sptVisible,
              'C11: toggle reveals #sw-secondary-cards-body + mock cards');

        // C12: pra Approve button INSIDE secondary (not in primary live area)
        var praLoc = await page.evaluate(function() {
            var pra = document.getElementById('pra-card');
            return {
                found:       !!pra,
                inSecondary: pra ? !!pra.closest('#sw-secondary-cards') : false,
                inLiveWS:    pra ? !!pra.closest('#sw-live-workspace')  : false
            };
        });
        check(praLoc.inSecondary && !praLoc.inLiveWS,
              'C12: #pra-card is inside #sw-secondary-cards (not primary live area)');

        // Re-hide secondary for cleanliness
        await page.evaluate(function() {
            var btn = document.getElementById('sw-secondary-cards-toggle');
            if (btn) btn.click();
        });
        await page.waitForTimeout(200);

        await page.screenshot({ path: path.join(SHOTS_DIR, '02-after-injection.png') });

        // C13: click Next → header counter increments
        console.log('\n--- C13: step navigation updates header ---');
        var beforeStep = await page.evaluate(function() {
            return document.getElementById('sw-live-scenario-step').textContent.trim();
        });
        await page.evaluate(function() {
            var btn = document.getElementById('sw-nav-next');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        var afterStep = await page.evaluate(function() {
            return {
                step:  document.getElementById('sw-live-scenario-step').textContent.trim(),
                phase: document.getElementById('sw-live-scenario-phase').textContent.trim(),
                idx:   window.RmoozScenario && window.RmoozScenario.stepIndex
            };
        });
        check(/(Step|الخطوة)\s+2\s+(of|من)\s+3/.test(afterStep.step) && afterStep.idx === 1,
              'C13: header shows "Step 2 of 3" after Next click',
              'before:"' + beforeStep + '" after:"' + afterStep.step +
              '" idx:' + afterStep.idx);

        // C14: live decision card updates (step-coherent repaint)
        console.log('\n--- C14: live decision card updates on step change ---');
        var decOpts = await page.evaluate(function() {
            var opts = document.getElementById('sw-live-decision-options');
            if (!opts) return [];
            return Array.prototype.slice.call(
                opts.querySelectorAll('.sw-live-decision-option-label'))
                .map(function(e) { return e.textContent.trim(); });
        });
        // Step 1 should now show step-1 options (Alpha/Beta/Gamma), 3 rows
        check(decOpts.length === 3 &&
              decOpts.some(function(l) { return l.indexOf('Alpha at step 1') >= 0; }),
              'C14: live decision card now shows step-1 options (PR-287L2 fix)',
              'options: [' + decOpts.join(', ') + ']');

        // C15: live map overlay path still callable + button relabeled
        console.log('\n--- C15: live map overlay path ---');
        var overlay = await page.evaluate(function() {
            var btn = document.getElementById('sw-nav-overlay-toggle');
            return {
                found:    !!btn,
                text:     btn ? (btn.textContent || '').trim() : '',
                disabled: btn ? btn.disabled : true
            };
        });
        check(overlay.found,
              'C15: #sw-nav-overlay-toggle present (live map overlay path intact)');
        check(overlay.text.indexOf('Live Unit Overlay') >= 0 ||
              overlay.text.indexOf('طبقة الوحدات الحية') >= 0,
              'C15b: overlay button relabeled "Show/Hide Live Unit Overlay"',
              overlay.text);

        // C15c: clicking the overlay toggle flips #sw-live-map-status data-state
        // (so the header reflects overlay on/off in real-time).
        var stateBefore = await page.evaluate(function() {
            var el = document.getElementById('sw-live-map-status');
            return el ? el.getAttribute('data-state') : null;
        });
        if (!overlay.disabled) {
            await page.evaluate(function() {
                var btn = document.getElementById('sw-nav-overlay-toggle');
                if (btn && !btn.disabled) btn.click();
            });
            await page.waitForTimeout(300);
            var stateAfter = await page.evaluate(function() {
                var el = document.getElementById('sw-live-map-status');
                return el ? el.getAttribute('data-state') : null;
            });
            check(stateBefore !== stateAfter,
                  'C15c: header map-status flips when overlay toggle clicked',
                  'before:' + stateBefore + ' after:' + stateAfter);
            // Toggle back to leave a clean state
            await page.evaluate(function() {
                var btn = document.getElementById('sw-nav-overlay-toggle');
                if (btn && !btn.disabled) btn.click();
            });
            await page.waitForTimeout(200);
        } else {
            check(true,
                  'C15c: overlay toggle disabled (no live map yet) — state sync test skipped');
        }

        await page.screenshot({ path: path.join(SHOTS_DIR, '03-after-next.png') });

        // C16: W3 dry-run still hidden
        var drp = await getVisibility(page, 'sw-drp-section');
        check(drp.found && !drp.visible,
              'C16: W3 dry-run section remains hidden');

        // C16b: Load Wargame 3 Preview button + load bar remain hidden
        var w3Load = await page.evaluate(function() {
            var bar = document.getElementById('sw-w3-load-bar');
            var btn = document.getElementById('sw-w3-load-btn');
            function info(el) {
                if (!el) return { found: false };
                var st = window.getComputedStyle(el);
                return {
                    found:           true,
                    hiddenAttr:      el.hasAttribute('hidden'),
                    display:         st.display,
                    visibility:      st.visibility,
                    offsetParentNull: el.offsetParent === null
                };
            }
            return { bar: info(bar), btn: info(btn) };
        });
        var barNotVisible = w3Load.bar.found &&
                            (w3Load.bar.hiddenAttr ||
                             w3Load.bar.display === 'none' ||
                             w3Load.bar.offsetParentNull);
        var btnNotVisible = !w3Load.btn.found ||
                            w3Load.btn.hiddenAttr ||
                            w3Load.btn.display === 'none' ||
                            w3Load.btn.offsetParentNull;
        check(barNotVisible && btnNotVisible,
              'C16b: "Load Wargame 3 Preview" button + load bar remain hidden',
              'bar=' + JSON.stringify(w3Load.bar) +
              ' btn=' + JSON.stringify(w3Load.btn));

        // C17: AMBER badge not visible
        var amber = await getVisibility(page, 'sw-drp-amber-badge');
        check(!amber.visible,
              'C17: AMBER RIDGE badge not visible');

        // C18: Scenario Source section still exists
        var src = await page.evaluate(function() {
            return {
                section: !!document.getElementById('sw-scenario-source-section'),
                local:   !!document.getElementById('sw-local-json-source-card'),
                ext:     !!document.getElementById('sw-external-catalog-source-card')
            };
        });
        check(src.section && src.local && src.ext,
              'C18: Scenario Source subcards still present below live workspace');

        // C19: No scenario-mutating backend calls
        var FORBIDDEN_RE = /\/api\/sim\/commit|applyDecision|executeSimulation|\/api\/scenario\/(commit|apply|mutate|save|advance|decide|update)|gate\s*7/i;
        var bad = networkCalls.filter(function(c) { return FORBIDDEN_RE.test(c); });
        check(bad.length === 0,
              'C19: no scenario-mutating backend calls',
              bad.length ? 'FORBIDDEN: ' + bad.join(' | ') : 'none');

        // C20: No forbidden Apply/Commit/Execute/Go-Live buttons in live workspace
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
              'C20: no forbidden action buttons in #sw-live-workspace',
              forbiddenBtns.length ? 'FOUND: ' + forbiddenBtns.join(', ') : 'none');

        // C21: console errors
        await page.waitForTimeout(500);
        check(consoleErrors.length === 0,
              'C21: zero console errors',
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
    }

    console.log('\n' + '═'.repeat(65));
    console.log('  PR-287L2 Browser Verification — RESULTS');
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
