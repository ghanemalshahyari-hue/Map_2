/**
 * verify-canonical-workflow-1.js — RMOOZ-TEST-GATE-P1-BROWSER-1
 *
 * The `test:browser` canonical-workflow gate: a self-contained Playwright
 * check that the real login → app-shell entry path works end-to-end in an
 * actual browser, against the REAL server (not the auth-stubbed verify
 * server) — this specifically exercises this session's Batch A auth/session
 * work (real credential check, real session cookie, real redirect-to-login
 * when unauthenticated) rather than assuming a stub.
 *
 * SCOPE (honest, not overstated): this is a smoke-level gate — real login,
 * app-shell loads, Scenario Workspace panel opens, zero console errors. It
 * does NOT yet drive the full Prepare→Review→Commit→Run journey (that needs
 * deeper UI exploration of the SCC panel structure than this pass covers) —
 * a genuine gap, tracked as follow-up, not silently claimed as covered.
 *
 * Spawns UI_MOdified/server/web-server.js itself (real auth, not the stub),
 * on a random port + temp data dir, so this runs unattended in one command.
 *
 *   node verify-canonical-workflow-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT          = __dirname;
const SERVER_SCRIPT  = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT           = 8550 + Math.floor(Math.random() * 400);
const DATA_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-canonical-workflow-'));
const BOOTSTRAP_PW   = 'bootstrap-verify-pw-canonical';
const BASE_URL       = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

function httpGet(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(BASE_URL + urlPath, (res) => {
            res.resume();
            resolve(res.statusCode);
        }).on('error', reject);
    });
}

function waitForServer(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 15000);
    return new Promise((resolve, reject) => {
        (function tick() {
            httpGet('/api/ai/scenarios')
                .then((status) => { if (status === 200) resolve(); else throw new Error('bad status ' + status); })
                .catch(() => {
                    if (Date.now() > deadline) reject(new Error('server did not come up'));
                    else setTimeout(tick, 150);
                });
        })();
    });
}

console.log('[setup] booting web-server.js on port ' + PORT + ' with DATA_DIR=' + DATA_DIR);
const server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: Object.assign({}, process.env, {
        PORT: String(PORT),
        RMOOZ_DATA_DIR: DATA_DIR,
        RMOOZ_BOOTSTRAP_PASSWORD: BOOTSTRAP_PW
    }),
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

(async function run() {
    let browser;
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        // Browser console error TEXT never includes the failing URL (a
        // generic, unlocalized "Failed to load resource" message) — so the
        // only reliable way to tell an EXPECTED failure (the client's own
        // pre-login GET /api/auth/me check, which 401s by design before the
        // user has authenticated) from a real one is to inspect the actual
        // HTTP responses, not the console text.
        const unexpectedFailures = [];
        page.on('response', (res) => {
            if (res.status() < 400) return;
            if (res.url().endsWith('/api/auth/me') && res.status() === 401) return; // expected pre-login check
            unexpectedFailures.push(res.status() + ' ' + res.url());
        });
        page.on('pageerror', (err) => unexpectedFailures.push('[pageerror] ' + err.message));

        // ── 1. Unauthenticated app.html redirects to (or shows) the login gate ──
        console.log('\n[1] Real login gate (no auth stub)');
        await page.goto(BASE_URL + '/app.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        const loginVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
        ok(loginVisible, 'a real login form (password field) is shown before authenticating');

        // ── 2. Real credential submission, real session cookie ────────────
        console.log('\n[2] Real login with the bootstrap admin account');
        const userField = page.locator('input[type="text"]').first();
        const passField = page.locator('input[type="password"]').first();
        await userField.fill('admin');
        await passField.fill(BOOTSTRAP_PW);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(1500);

        const cookies = await context.cookies();
        const sessionCookie = cookies.find(c => c.name === 'rmooz_session');
        ok(!!sessionCookie, 'a real rmooz_session cookie was set after login');
        ok(!!sessionCookie && sessionCookie.httpOnly, 'session cookie is HttpOnly');
        ok(!!sessionCookie && sessionCookie.sameSite === 'Lax', 'session cookie is SameSite=Lax');

        // ── 3. App shell actually loads (not still on the login screen) ───
        console.log('\n[3] App shell loads after authentication');
        const stillOnLogin = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
        ok(!stillOnLogin, 'login form is gone — authenticated view is showing');

        const mapVisible = await page.locator('.leaflet-container, #map').first().isVisible().catch(() => false);
        ok(mapVisible, 'the map shell rendered');

        // ── 4. Scenario Workspace panel opens ──────────────────────────────
        console.log('\n[4] Scenario Workspace opens from the authenticated shell');
        // The button's visible text is just "Scenario" — its full name lives
        // in the `title` tooltip attribute, not the ARIA accessible name.
        const workspaceButton = page.locator('[title*="Live Scenario Workspace"]').first();
        let workspaceButtonVisible = false;
        try {
            await workspaceButton.waitFor({ state: 'visible', timeout: 8000 });
            workspaceButtonVisible = true;
        } catch (_) { workspaceButtonVisible = false; }
        ok(workspaceButtonVisible, 'the "Live Scenario Workspace" tool-rail button is present');
        if (workspaceButtonVisible) {
            await workspaceButton.click();
            await page.waitForTimeout(800);
            const panelHeading = await page.getByRole('heading', { name: /Scenario/i }).first().isVisible().catch(() => false);
            ok(panelHeading, 'the Scenario Workspace panel opened');
        }

        // ── 5. Zero unexpected failures across the whole flow ──────────────
        console.log('\n[5] No unexpected failed requests or JS errors across login + workspace open');
        ok(unexpectedFailures.length === 0, 'zero unexpected failures', unexpectedFailures.slice(0, 5).join(' | '));

        console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
        await browser.close();
        teardown();
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.log('FAIL — harness error: ' + (e && e.message));
        if (serverErr) console.log('  server stderr:', serverErr.slice(0, 1000));
        try { if (browser) await browser.close(); } catch (_) {}
        teardown();
        process.exit(1);
    }
})();
