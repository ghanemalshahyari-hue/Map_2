/**
 * verify-edit-mode-map-placement-1.js
 *
 * Real-browser (Playwright) proof for Edit Mode map-click unit placement,
 * driven end-to-end through the REPAIRED app.js call site — NOT by calling
 * AppEditMode.placeUnitFromMap() directly (that direct-call proof lives in the
 * static test-edit-mode-map-placement-1.js).
 *
 * Owner multi-role review, correction #3: prove symbol-selection → map click →
 * app.js onMapClick → draft mutation actually works in the real shell, and that
 * NO operator-layer marker / live unit is created.
 *
 * The click itself is dispatched via Leaflet's own event system
 * (window.map.fire('click', {latlng, originalEvent})) rather than a synthetic
 * pixel because, in Edit Mode, the Scenario Workspace panel widens
 * (`sw-editmode-wide`, ~1200px) and OVERLAYS the map — a literal page.mouse
 * click cannot reach the map tiles while the wide editor is open (verified by
 * hit-testing; flagged to the owner as a separate reachability concern). The
 * fire() still enters the SAME app.js `map.on('click', onMapClick)` handler a
 * real click triggers, so the repaired call site is genuinely exercised — this
 * does not bypass it, and does not inject into the draft. The Edit-Mode-OFF
 * fallback case DOES use a literal page.mouse click (the map is reachable then).
 *
 * Spawns the REAL web-server.js (real auth) on a random port + temp data dir.
 *   node verify-edit-mode-map-placement-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT          = __dirname;
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT          = 8950 + Math.floor(Math.random() * 400);
const DATA_DIR      = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-map-placement-'));
const BOOTSTRAP_PW  = 'bootstrap-verify-pw-map-placement';
const BASE_URL      = 'http://127.0.0.1:' + PORT;

const SIDC_HOSTILE = '10061000001211000000'; // identity 6 → red
const SIDC_FRIEND  = '10031000001200000000'; // identity 3 → blue
const SIDC_NEUTRAL = '10041000001200000000'; // identity 4 → ambiguous

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

function httpGet(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(BASE_URL + urlPath, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
}
function waitForServer(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 15000);
    return new Promise((resolve, reject) => {
        (function tick() {
            httpGet('/api/ai/scenarios')
                .then((s) => { if (s === 200) resolve(); else throw new Error('bad status ' + s); })
                .catch(() => { if (Date.now() > deadline) reject(new Error('server did not come up')); else setTimeout(tick, 150); });
        })();
    });
}

console.log('[setup] booting web-server.js on port ' + PORT);
const server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_DATA_DIR: DATA_DIR, RMOOZ_BOOTSTRAP_PASSWORD: BOOTSTRAP_PW }),
    stdio: ['ignore', 'pipe', 'pipe']
});
let serverErr = '';
server.stderr.on('data', (b) => { serverErr += b.toString(); });
server.stdout.on('data', () => {});
function teardown() {
    try { server.kill(); } catch (_) {}
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
}
process.on('exit', teardown);

// ── shared page helpers ───────────────────────────────────────────────────
async function enterEditMode(page) {
    await page.locator('[title*="Live Scenario Workspace"]').first().click();
    await page.waitForTimeout(400);
    // toggle ON only if not already on
    const isOn = await page.evaluate(() => !!(window.AppEditMode && window.AppEditMode.isOn && window.AppEditMode.isOn()));
    if (!isOn) { await page.locator('#sw-editmode-toggle').click(); await page.waitForTimeout(400); }
    return page.evaluate(() => !!(window.AppEditMode && window.AppEditMode.isOn()));
}
async function gotoStep(page, titleRe) {
    return page.evaluate((reSrc) => {
        const re = new RegExp(reSrc, 'i');
        const items = Array.from(document.querySelectorAll('.sw-step-item'));
        const idx = items.findIndex(el => re.test(el.textContent || ''));
        if (idx < 0) return false;
        items[idx].click();
        return true;
    }, titleRe.source);
}
async function clickButtonByText(page, textRe) {
    return page.evaluate((reSrc) => {
        const re = new RegExp(reSrc, 'i');
        const btn = Array.from(document.querySelectorAll('button')).find(b => re.test(b.textContent || ''));
        if (!btn) return false;
        btn.click();
        return true;
    }, textRe.source);
}
async function activateSymbolTool(page, sidc) {
    await page.locator('[data-tool="symbol"]').click();
    await page.waitForTimeout(200);
    await page.evaluate((s) => {
        const man = document.getElementById('sidc-manual');
        if (man) { man.value = s; man.dispatchEvent(new Event('input', { bubbles: true })); }
    }, sidc);
}
// Fire a click through Leaflet's real event dispatch → app.js onMapClick.
async function fireMapClick(page, lat, lng) {
    return page.evaluate(([la, lo]) => {
        const L = window.L, map = window.map;
        const latlng = L.latLng(la, lo);
        const pt = map.latLngToContainerPoint(latlng);
        map.fire('click', {
            latlng: latlng,
            layerPoint: map.latLngToLayerPoint(latlng),
            containerPoint: pt,
            originalEvent: { clientX: pt.x, clientY: pt.y, target: map.getContainer() }
        });
        return true;
    }, [lat, lng]);
}
function snapshot(page) {
    return page.evaluate(() => {
        const d = (window.AppEditMode && window.AppEditMode.getDraft && window.AppEditMode.getDraft()) || {};
        const status = document.getElementById('sw-editmode-status');
        return {
            red: (d.red_units || []).length,
            blue: (d.blue_units_initial || []).length,
            redUnit: (d.red_units || [])[(d.red_units || []).length - 1] || null,
            markers: document.querySelectorAll('.custom-nato-marker').length,
            liveUnits: Array.isArray(window.units) ? window.units.length : (window.units ? -1 : 0),
            status: status ? (status.textContent || '') : ''
        };
    });
}

(async function run() {
    let browser;
    try {
        await waitForServer(15000);
        console.log('[setup] server up');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        const jsErrors = [];
        page.on('pageerror', (e) => jsErrors.push(e.message));

        // ── login ────────────────────────────────────────────────────────
        console.log('\n[login] real bootstrap admin');
        await page.goto(BASE_URL + '/app.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);
        await page.locator('input[type="text"]').first().fill('admin');
        await page.locator('input[type="password"]').first().fill(BOOTSTRAP_PW);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(1500);
        ok(await page.locator('.leaflet-container, #map').first().isVisible().catch(() => false), 'app shell + map loaded');

        ok(await enterEditMode(page), 'Edit Mode ON (fresh draft — no bases yet)');

        // ── C. no same-side base → rejected (run first, on the fresh draft) ─
        console.log('\n[C] no same-side base → rejected (no dangling base_id)');
        await activateSymbolTool(page, SIDC_HOSTILE);
        const beforeC = await snapshot(page);
        await fireMapClick(page, 5, 5);
        await page.waitForTimeout(200);
        const afterC = await snapshot(page);
        ok(afterC.red === beforeC.red, 'no RED unit created when no RED base exists');
        ok(/base/i.test(afterC.status), 'the missing-base reason was surfaced', afterC.status);

        // ── A. happy path: hostile symbol → one RED draft unit, no marker ──
        console.log('\n[A] Edit Mode + symbol tool + map click → draft RED unit (via app.js handler)');
        ok(await gotoStep(page, /Geometry/), 'navigated to Forces Geometry step');
        await page.waitForTimeout(200);
        ok(await clickButtonByText(page, /Add BLS/), 'clicked "Add BLS" (creates a RED base)');
        await page.waitForTimeout(200);
        await activateSymbolTool(page, SIDC_HOSTILE);
        const before = await snapshot(page);
        await fireMapClick(page, 10.5, 10.5);
        await page.waitForTimeout(200);
        const afterA = await snapshot(page);
        ok(afterA.red === before.red + 1, 'exactly one RED draft unit was added', 'before=' + before.red + ' after=' + afterA.red);
        ok(afterA.redUnit && afterA.redUnit.bls === 'BLS-1', 'unit auto-linked to the real RED base BLS-1', afterA.redUnit && afterA.redUnit.bls);
        ok(afterA.redUnit && afterA.redUnit.coord[0] === 10.5 && afterA.redUnit.coord[1] === 10.5, 'unit carries the clicked coord');
        ok(afterA.markers === before.markers, 'NO operator-layer marker was created', 'before=' + before.markers + ' after=' + afterA.markers);
        ok(afterA.liveUnits === before.liveUnits, 'NO live unit (window.units) was created');
        // the unit shows in the real OOB editor surface (step 10 — unique English label)
        await gotoStep(page, /Forces \(OOB\)/);
        await page.waitForTimeout(200);
        const oobRows = await page.evaluate(() => document.querySelectorAll('.sw-forces-row').length);
        ok(oobRows === 1, 'exactly one unit row renders in the OOB tree', 'rows=' + oobRows);

        // ── B. ambiguous affiliation → nothing created, status surfaced ────
        console.log('\n[B] ambiguous (neutral) SIDC → no unit, ambiguity surfaced');
        await gotoStep(page, /Geometry/); // move off OOB so status is fresh
        await activateSymbolTool(page, SIDC_NEUTRAL);
        const beforeB = await snapshot(page);
        await fireMapClick(page, 10.6, 10.6);
        await page.waitForTimeout(200);
        const afterB = await snapshot(page);
        ok(afterB.red === beforeB.red && afterB.blue === beforeB.blue, 'ambiguous SIDC created no unit (not silently Blue)');
        ok(/ambiguous/i.test(afterB.status), 'ambiguity was surfaced to the operator', afterB.status);
        ok(afterB.markers === beforeB.markers, 'ambiguous click created no operator marker');

        // ── D. Edit Mode OFF → a real map click makes a normal marker ──────
        console.log('\n[D] Edit Mode OFF → real map click produces the normal operator marker');
        // Real DOM click on the real toggle control (bypasses Playwright's
        // visibility gate — the wide edit panel can push it out of the actionable
        // box, but it is the real button firing the real handler).
        await page.evaluate(() => { var b = document.getElementById('sw-editmode-toggle'); if (b) b.click(); });
        await page.waitForTimeout(300);
        ok(!(await page.evaluate(() => window.AppEditMode.isOn())), 'Edit Mode OFF');
        // close the workspace panel so the map is reachable by a literal click
        await page.evaluate(() => {
            const p = document.getElementById('scenario-workspace-panel');
            if (p) p.style.display = 'none';
        });
        await activateSymbolTool(page, SIDC_HOSTILE);
        // find a literally-clickable map pixel
        const clickPt = await page.evaluate(() => {
            const cands = [[300, 400], [400, 300], [250, 500], [500, 450], [200, 350]];
            for (const [x, y] of cands) {
                const el = document.elementFromPoint(x, y);
                if (el && el.closest && el.closest('#map, .leaflet-container')) return { x, y };
            }
            return null;
        });
        ok(!!clickPt, 'found a clickable map pixel with Edit Mode off', JSON.stringify(clickPt));
        const markersBeforeD = await page.evaluate(() => document.querySelectorAll('.custom-nato-marker').length);
        if (clickPt) { await page.mouse.click(clickPt.x, clickPt.y); await page.waitForTimeout(300); }
        const markersAfterD = await page.evaluate(() => document.querySelectorAll('.custom-nato-marker').length);
        ok(markersAfterD === markersBeforeD + 1, 'a real click created exactly one operator marker (fallback intact)', 'before=' + markersBeforeD + ' after=' + markersAfterD);

        // ── no JS errors across the whole flow ─────────────────────────────
        console.log('\n[E] no uncaught JS errors across the whole flow');
        ok(jsErrors.length === 0, 'zero pageerror events', jsErrors.slice(0, 3).join(' | '));

        console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
        await browser.close();
        teardown();
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.log('FAIL — harness error: ' + (e && e.message));
        if (serverErr) console.log('  server stderr:', serverErr.slice(0, 800));
        try { if (browser) await browser.close(); } catch (_) {}
        teardown();
        process.exit(1);
    }
})();
