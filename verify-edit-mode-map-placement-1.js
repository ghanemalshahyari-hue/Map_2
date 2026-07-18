/**
 * verify-edit-mode-map-placement-1.js
 *
 * Real-browser (Playwright) proof for Edit Mode map-click unit placement,
 * driven end-to-end through the REPAIRED app.js call site with a LITERAL
 * page.mouse click on the map (not a scripted Leaflet event).
 *
 * Owner multi-role review #3 asked for a real click; a follow-up review found
 * the wide edit panel (`sw-editmode-wide`) overlaid the whole map, so a literal
 * click couldn't reach the tiles. Fix: activating the symbol tool in Edit Mode
 * now collapses the panel to a strip (`sw-editmode-picking`) so the map is
 * reachable (scenario-edit-mode.js::setMapPlacementMode, driven from app.js's
 * mode-change handler). This test asserts that collapse AND performs a genuine
 * mouse click to place a unit.
 *
 * Cases:
 *   collapse — symbol tool in Edit Mode collapses the panel; a map pixel that
 *              was panel-covered becomes reachable.
 *   C — no same-side base yet: a real click is rejected (no dangling unit).
 *   A — after adding a RED base: a real click creates exactly one RED draft
 *       unit (linked to the base), NO operator marker, NO live unit; the unit
 *       shows in the OOB editor.
 *   B — ambiguous (neutral) SIDC: a real click creates nothing, ambiguity shown.
 *   D — Edit Mode OFF: a real click makes the normal operator marker.
 *
 * Spawns the REAL web-server.js (real auth).  node verify-edit-mode-map-placement-1.js
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
const SIDC_NEUTRAL = '10041000001211000000'; // identity 4 → ambiguous (valid function code so the picker accepts it)

// Candidate on-map pixels (left/centre of the 1280-wide viewport; the collapsed
// edit strip sits on the right edge, so these stay clear of it).
const MAP_PIXELS = [[600, 400], [650, 350], [560, 450], [700, 320], [520, 500]];

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

// ── page helpers ───────────────────────────────────────────────────────────
async function enterEditMode(page) {
    await page.locator('[title*="Live Scenario Workspace"]').first().click();
    await page.waitForTimeout(400);
    const isOn = await page.evaluate(() => !!(window.AppEditMode && window.AppEditMode.isOn && window.AppEditMode.isOn()));
    if (!isOn) { await page.locator('#sw-editmode-toggle').click(); await page.waitForTimeout(400); }
    return page.evaluate(() => !!(window.AppEditMode && window.AppEditMode.isOn()));
}
async function activateTool(page, tool) {
    await page.locator(`[data-tool="${tool}"]`).click();
    await page.waitForTimeout(250);
}
async function setSidc(page, sidc) {
    await page.evaluate((s) => {
        const man = document.getElementById('sidc-manual');
        if (man) { man.value = s; man.dispatchEvent(new Event('input', { bubbles: true })); }
    }, sidc);
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
async function panelCollapsed(page) {
    return page.evaluate(() => {
        const p = document.getElementById('scenario-workspace-panel');
        return !!(p && p.classList.contains('sw-editmode-picking'));
    });
}
// A genuine mouse click on the first clickable on-map pixel from `candidates`.
// Distinct candidate regions are used per case so a click never lands on a unit
// a previous case rendered on the map. Returns the pixel, or null.
async function realMapClick(page, candidates) {
    const cands = candidates || MAP_PIXELS;
    const pt = await page.evaluate((cs) => {
        for (const [x, y] of cs) {
            const el = document.elementFromPoint(x, y);
            if (el && el.closest && el.closest('#map, .leaflet-container')) return { x, y };
        }
        return null;
    }, cands);
    if (!pt) return null;
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(300);
    return pt;
}
// Well-separated on-map click regions (all left of the ~280px right-edge strip).
const PIX_C = [[600, 400], [620, 420]];             // no-base rejection
const PIX_A = [[600, 400], [620, 420]];             // places a RED unit here
const PIX_B = [[760, 320], [740, 300], [780, 340]]; // ambiguous — away from A's unit
const PIX_D = [[820, 520], [760, 560], [880, 480], [700, 580]]; // edit-off marker — lower-centre-right map, clear of A's unit at ~(600,400)
function snapshot(page) {
    return page.evaluate(() => {
        const d = (window.AppEditMode && window.AppEditMode.getDraft && window.AppEditMode.getDraft()) || {};
        const status = document.getElementById('sw-editmode-status');
        return {
            red: (d.red_units || []).length,
            blue: (d.blue_units_initial || []).length,
            redUnit: (d.red_units || [])[(d.red_units || []).length - 1] || null,
            // Only COMMITTED operator markers — exclude the crosshair placement
            // preview (class "custom-nato-marker placement-preview"), which exists
            // whenever the symbol tool is active and is not a placed unit.
            markers: document.querySelectorAll('.custom-nato-marker:not(.placement-preview)').length,
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

        console.log('\n[login] real bootstrap admin');
        await page.goto(BASE_URL + '/app.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);
        await page.locator('input[type="text"]').first().fill('admin');
        await page.locator('input[type="password"]').first().fill(BOOTSTRAP_PW);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(1500);
        ok(await page.locator('.leaflet-container, #map').first().isVisible().catch(() => false), 'app shell + map loaded');

        ok(await enterEditMode(page), 'Edit Mode ON (fresh draft — no bases yet)');

        // ── collapse: symbol tool makes the map reachable ─────────────────
        console.log('\n[collapse] symbol tool collapses the wide panel so the map is reachable');
        const coveredBefore = await page.evaluate((cands) => {
            const [x, y] = cands[0];
            const el = document.elementFromPoint(x, y);
            return !(el && el.closest && el.closest('#map, .leaflet-container'));
        }, MAP_PIXELS);
        ok(coveredBefore, 'a map pixel is panel-covered before activating the symbol tool');
        await activateTool(page, 'symbol');
        await setSidc(page, SIDC_HOSTILE);
        ok(await panelCollapsed(page), 'panel collapsed to the strip (sw-editmode-picking) with symbol tool active');
        const reachable = await page.evaluate((cands) => cands.some(([x, y]) => {
            const el = document.elementFromPoint(x, y);
            return el && el.closest && el.closest('#map, .leaflet-container');
        }), MAP_PIXELS);
        ok(reachable, 'a map pixel is now reachable by a literal click');

        // ── C. no same-side base → real click rejected ────────────────────
        console.log('\n[C] no same-side base → real click creates nothing');
        const beforeC = await snapshot(page);
        const ptC = await realMapClick(page, PIX_C);
        ok(!!ptC, 'performed a literal mouse click on the map', JSON.stringify(ptC));
        const afterC = await snapshot(page);
        ok(afterC.red === beforeC.red, 'no RED unit created when no RED base exists');
        ok(/base/i.test(afterC.status), 'the missing-base reason was surfaced', afterC.status);
        ok(afterC.markers === beforeC.markers, 'no operator marker created');

        // ── A. add a base, then a real click creates one RED draft unit ───
        console.log('\n[A] add RED base → real map click creates one RED draft unit');
        await activateTool(page, 'select');                 // restore the editor form
        ok(!(await panelCollapsed(page)), 'panel restored when leaving the symbol tool');
        ok(await gotoStep(page, /Geometry/), 'navigated to Forces Geometry step');
        await page.waitForTimeout(200);
        ok(await clickButtonByText(page, /Add BLS/), 'clicked "Add BLS" (creates a RED base)');
        await page.waitForTimeout(200);
        await activateTool(page, 'symbol');
        await setSidc(page, SIDC_HOSTILE);
        ok(await panelCollapsed(page), 'panel collapsed again for placement');
        const beforeA = await snapshot(page);
        const ptA = await realMapClick(page, PIX_A);
        ok(!!ptA, 'performed a literal mouse click on the map', JSON.stringify(ptA));
        const afterA = await snapshot(page);
        ok(afterA.red === beforeA.red + 1, 'exactly one RED draft unit was added by a real click',
            'before=' + beforeA.red + ' after=' + afterA.red);
        ok(afterA.redUnit && afterA.redUnit.bls === 'BLS-1', 'unit auto-linked to the real RED base BLS-1',
            afterA.redUnit && afterA.redUnit.bls);
        ok(afterA.markers === beforeA.markers, 'NO operator-layer marker was created');
        ok(afterA.liveUnits === beforeA.liveUnits, 'NO live unit (window.units) was created');
        await activateTool(page, 'select');                 // restore to read the OOB tree
        await gotoStep(page, /Forces \(OOB\)/);
        await page.waitForTimeout(200);
        const oobRows = await page.evaluate(() => document.querySelectorAll('.sw-forces-row').length);
        ok(oobRows === 1, 'exactly one unit row renders in the OOB tree', 'rows=' + oobRows);

        // ── B. ambiguous SIDC → real click creates nothing ────────────────
        console.log('\n[B] ambiguous (neutral) SIDC → real click creates nothing');
        await activateTool(page, 'symbol');
        await setSidc(page, SIDC_NEUTRAL);
        ok(await panelCollapsed(page), 'panel collapsed for the ambiguous-placement click');
        const beforeB = await snapshot(page);
        const ptB = await realMapClick(page, PIX_B);
        ok(!!ptB, 'performed a literal mouse click on empty map (away from the placed unit)', JSON.stringify(ptB));
        const afterB = await snapshot(page);
        ok(afterB.red === beforeB.red && afterB.blue === beforeB.blue, 'ambiguous SIDC created no unit (not silently Blue)');
        ok(/ambiguous/i.test(afterB.status), 'ambiguity was surfaced', afterB.status);
        ok(afterB.markers === beforeB.markers, 'no operator marker created');

        // ── D. Edit Mode OFF → real click makes a normal marker ───────────
        console.log('\n[D] Edit Mode OFF → real map click produces the normal operator marker');
        await page.evaluate(() => { const b = document.getElementById('sw-editmode-toggle'); if (b) b.click(); });
        await page.waitForTimeout(300);
        ok(!(await page.evaluate(() => window.AppEditMode.isOn())), 'Edit Mode OFF');
        await page.evaluate(() => { const p = document.getElementById('scenario-workspace-panel'); if (p) p.style.display = 'none'; });
        // Force a clean transition INTO symbol mode (re-clicking an already-active
        // tool would toggle it off), so the click lands in symbol-placement mode.
        await activateTool(page, 'select');
        await activateTool(page, 'symbol');
        await setSidc(page, SIDC_HOSTILE);
        const markersBeforeD = await page.evaluate(() => document.querySelectorAll(String.raw`.custom-nato-marker:not(.placement-preview)`).length);
        const ptD = await realMapClick(page, PIX_D);
        ok(!!ptD, 'performed a literal mouse click with Edit Mode off');
        const markersAfterD = await page.evaluate(() => document.querySelectorAll(String.raw`.custom-nato-marker:not(.placement-preview)`).length);
        ok(markersAfterD === markersBeforeD + 1, 'a real click created exactly one operator marker (fallback intact)',
            'before=' + markersBeforeD + ' after=' + markersAfterD);

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
