/**
 * ROADMAP-4 — Safe Roadmap Persistence tests
 *
 * Proves, with no live server/DB, every property the owner asked for:
 *   1. A normal (non-admin) user can READ only.
 *   2. An admin can UPDATE.
 *   3. Writes are ATOMIC (temp + rename; no partial files).
 *   4. The audit log gains one line PER change.
 *   5. Any disallowed `status` is rejected.
 *   6. Any unsafe `item_id` is rejected.
 *   7. No effect on scenario/simulation files (isolation).
 * Plus the locked hard-limits (no sim/scenario/map/Event-Log/storage/WebSocket/
 * AI-exec/commit) on BOTH the server module and the client page.
 *
 * Strategy: the store's core logic depends only on fs/path + an injected user
 * resolver, so we exercise it directly against a temp DATA_DIR and via the HTTP
 * handler with stubbed sendJson/readJsonBody/getUser.
 *
 * Usage: node test-roadmap-4.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const ROOT   = __dirname;
const store  = require('./server/roadmap-store');

const storeSrc = fs.readFileSync(path.join(ROOT, 'server', 'roadmap-store.js'), 'utf8');
const pageSrc  = fs.readFileSync(path.join(ROOT, 'client', 'roadmap-page.js'), 'utf8');
const webSrc   = fs.readFileSync(path.join(ROOT, 'server', 'web-server.js'), 'utf8');
// store source with comments stripped — documented prohibitions in the header
// must not read as actual usage.
const storeCode = storeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ── async-capable test runner ────────────────────────────────────────────────
let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

// ── helpers ───────────────────────────────────────────────────────────────────
let _n = 0;
const _dirs = [];
function setTempData() {
    const dir = path.join(os.tmpdir(), 'rmooz-rm4-' + process.pid + '-' + (_n++));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(dir, { recursive: true });
    process.env.RMOOZ_DATA_DIR = dir;
    _dirs.push(dir);
    return dir;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const statusPath = () => store._paths.statusFile();
const auditPath  = () => store._paths.auditFile();
const readStatusFile = () => JSON.parse(fs.readFileSync(statusPath(), 'utf8'));
const auditLines = () => fs.existsSync(auditPath())
    ? fs.readFileSync(auditPath(), 'utf8').split('\n').filter(Boolean) : [];

const ADMIN      = { id: 1, username: 'admin', role: 'planner' };  // admin via username allowlist
const ROLE_ADMIN = { id: 3, username: 'carol', role: 'admin'   };  // admin via role
const NORMAL     = { id: 2, username: 'bob',   role: 'planner' };  // ordinary authed user

// Drive the HTTP handler hermetically; resolves with {status, payload} when sendJson fires.
function callHandler(method, user, body) {
    return new Promise((resolve) => {
        const captured = { status: 0, payload: null };
        const sendJson = (res, status, payload) => { captured.status = status; captured.payload = payload; resolve(captured); };
        const readJsonBody = () => Promise.resolve(body || {});
        const handled = store.handleRoadmapApi({}, {}, '/api/roadmap/status', method, sendJson, readJsonBody, () => user);
        if (!handled) { captured.status = -1; resolve(captured); }
    });
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  ROADMAP-4 — safe roadmap persistence tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Admin gate ───────────────────────────────────────────────────────────
console.log('── §1  Admin gate (configurable, server-side) ──────────────────');

test('isRoadmapAdmin: default allows "admin", denies ordinary users', () => {
    delete process.env.RMOOZ_ROADMAP_ADMINS;
    assert.strictEqual(store.isRoadmapAdmin(ADMIN), true,  'admin username allowed');
    assert.strictEqual(store.isRoadmapAdmin(NORMAL), false, 'ordinary user denied');
    assert.strictEqual(store.isRoadmapAdmin(null), false,  'null denied');
});
test('isRoadmapAdmin: role==="admin" is honored (forward-compatible)', () => {
    assert.strictEqual(store.isRoadmapAdmin(ROLE_ADMIN), true);
});
test('isRoadmapAdmin: RMOOZ_ROADMAP_ADMINS overrides the allowlist', () => {
    process.env.RMOOZ_ROADMAP_ADMINS = 'alice, bob';
    assert.strictEqual(store.isRoadmapAdmin(NORMAL), true,  'bob now allowed via env');
    assert.strictEqual(store.isRoadmapAdmin(ADMIN), false, 'admin no longer in list');
    delete process.env.RMOOZ_ROADMAP_ADMINS;
});

// ─── §2  Normal user READS only ; admin UPDATES ──────────────────────────────
console.log('\n── §2  Read-only for users · update for admin ──────────────────');

test('PROOF 1 — normal user GET → 200 with can_edit:false', async () => {
    setTempData();
    const r = await callHandler('GET', NORMAL);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.payload.can_edit, false, 'ordinary user cannot edit');
    assert.deepStrictEqual(r.payload.statuses, {}, 'empty overrides on a fresh store');
});
test('PROOF 1 — normal user POST → 403 and NOTHING is written', async () => {
    setTempData();
    const r = await callHandler('POST', NORMAL, { item_id: 'world-state', status: 'completed' });
    assert.strictEqual(r.status, 403, 'forbidden');
    assert.ok(!fs.existsSync(statusPath()), 'no status file written by a non-admin');
    assert.ok(!fs.existsSync(auditPath()),  'no audit line written by a non-admin');
});
test('PROOF 1 — unauthenticated GET/POST → 401', async () => {
    setTempData();
    assert.strictEqual((await callHandler('GET',  null)).status, 401);
    assert.strictEqual((await callHandler('POST', null, { item_id: 'world-state', status: 'completed' })).status, 401);
    assert.ok(!fs.existsSync(statusPath()), 'unauth writes nothing');
});
test('PROOF 2 — admin POST → 200 and the override is persisted', async () => {
    setTempData();
    const r = await callHandler('POST', ADMIN, { item_id: 'world-state', status: 'in_progress' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.payload.ok, true);
    const f = readStatusFile();
    assert.strictEqual(f.statuses['world-state'], 'in_progress', 'override saved');
    assert.strictEqual(f.updated_by, 'admin', 'records who changed it');
    assert.strictEqual(f.schema, store.SCHEMA, 'schema stamped');
});
test('PROOF 2 — admin-by-role can also update', async () => {
    setTempData();
    const r = await callHandler('POST', ROLE_ADMIN, { item_id: 'adjudicator', status: 'completed' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(readStatusFile().updated_by, 'carol');
});
test('shared visibility — an admin write is visible to a normal reader', async () => {
    setTempData();
    await callHandler('POST', ADMIN, { item_id: 'detection-engagement', status: 'completed' });
    const r = await callHandler('GET', NORMAL);
    assert.strictEqual(r.payload.statuses['detection-engagement'], 'completed', 'one canonical roadmap for everyone');
    assert.strictEqual(r.payload.can_edit, false);
});

// ─── §3  Atomic writes ────────────────────────────────────────────────────────
console.log('\n── §3  Atomic writes ───────────────────────────────────────────');

test('PROOF 3 — write leaves no partial/temp file behind', async () => {
    const dir = setTempData();
    await callHandler('POST', ADMIN, { item_id: 'map-2d', status: 'completed' });
    const stray = fs.readdirSync(dir).filter(n => n.indexOf('.tmp') !== -1);
    assert.strictEqual(stray.length, 0, 'no leftover .tmp files: ' + stray.join(','));
    assert.ok(fs.existsSync(statusPath()), 'final file present');
});
test('PROOF 3 — source uses temp-file + renameSync (atomic swap)', () => {
    assert.ok(/\.tmp\./.test(storeSrc), 'writes to a temp path first');
    assert.ok(/renameSync\s*\(/.test(storeSrc), 'atomically renames into place');
    assert.ok(/writeFileSync\s*\(\s*tmp/.test(storeSrc), 'writes the temp file, not the target directly');
});
test('corrupt status file → backed up to .bak, treated as empty (never extended)', () => {
    const dir = setTempData();
    fs.writeFileSync(statusPath(), '{ this is : not json', 'utf8');
    const st = store.readState();
    assert.deepStrictEqual(st.statuses, {}, 'corrupt file read as empty overrides');
    assert.ok(fs.existsSync(statusPath() + '.bak'), 'corrupt file preserved as .bak');
});

// ─── §4  Audit log ──────────────────────────────────────────────────────────--
console.log('\n── §4  Audit log — one line per change ─────────────────────────');

test('PROOF 4 — each accepted change appends exactly one audit line', async () => {
    setTempData();
    await callHandler('POST', ADMIN, { item_id: 'map-2d',      status: 'completed'   });
    await callHandler('POST', ADMIN, { item_id: 'world-state', status: 'in_progress' });
    const lines = auditLines();
    assert.strictEqual(lines.length, 2, 'two changes → two lines');
    const row = JSON.parse(lines[1]);
    assert.deepStrictEqual(Object.keys(row).sort(), ['actor', 'from', 'item_id', 'to', 'ts']);
    assert.strictEqual(row.actor, 'admin');
    assert.strictEqual(row.item_id, 'world-state');
    assert.strictEqual(row.to, 'in_progress');
});
test('PROOF 4 — records the from→to transition', async () => {
    setTempData();
    await callHandler('POST', ADMIN, { item_id: 'map-2d', status: 'next'      });
    await callHandler('POST', ADMIN, { item_id: 'map-2d', status: 'completed' });
    const last = JSON.parse(auditLines()[1]);
    assert.strictEqual(last.from, 'next');
    assert.strictEqual(last.to, 'completed');
});
test('a no-op (same status) writes no new audit line', async () => {
    setTempData();
    await callHandler('POST', ADMIN, { item_id: 'map-2d', status: 'completed' });
    const r = await callHandler('POST', ADMIN, { item_id: 'map-2d', status: 'completed' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.payload.noop, true, 'reported as a no-op');
    assert.strictEqual(auditLines().length, 1, 'still one line — no churn');
});

// ─── §5  Reject bad status ────────────────────────────────────────────────────
console.log('\n── §5  Reject disallowed status ────────────────────────────────');

test('PROOF 5 — invalid status → 400 and no write', async () => {
    for (const bad of ['bogus', 'COMPLETED', 'done', '', 'in progress']) {
        setTempData();
        const r = await callHandler('POST', ADMIN, { item_id: 'map-2d', status: bad });
        assert.strictEqual(r.status, 400, 'rejected: ' + JSON.stringify(bad));
        assert.ok(!fs.existsSync(statusPath()), 'no write for bad status: ' + JSON.stringify(bad));
    }
});
test('PROOF 5 — only the four canonical statuses are allowed', () => {
    assert.deepStrictEqual(store.VALID_STATUS.slice().sort(),
        ['completed', 'in_progress', 'next', 'pending'].sort());
    setTempData();
    for (const ok of store.VALID_STATUS) {
        assert.doesNotThrow(() => store.applyChange({ user: ADMIN, item_id: 'map-2d', status: ok }));
    }
});

// ─── §6  Reject unsafe item_id ────────────────────────────────────────────────
console.log('\n── §6  Reject unsafe item_id ───────────────────────────────────');

test('PROOF 6 — unsafe / malformed item_id → 400 and no write', async () => {
    const bad = ['../escape', 'a/b', 'a b', 'UPPER', 'under_score', 'dot.id', '<x>', '', 'x'.repeat(65), '..'];
    for (const id of bad) {
        setTempData();
        const r = await callHandler('POST', ADMIN, { item_id: id, status: 'completed' });
        assert.strictEqual(r.status, 400, 'rejected id: ' + JSON.stringify(id));
        assert.ok(!fs.existsSync(statusPath()), 'no write for unsafe id: ' + JSON.stringify(id));
    }
});
test('PROOF 6 — the id pattern is strict (lowercase/digits/hyphen, ≤64)', () => {
    assert.ok(store.ITEM_ID_RE.test('world-state'));
    assert.ok(!store.ITEM_ID_RE.test('World-State'));
    assert.ok(!store.ITEM_ID_RE.test('a'.repeat(65)));
    assert.ok(!store.ITEM_ID_RE.test('../x'));
});

// ─── §7  Isolation from scenario / simulation ────────────────────────────────
console.log('\n── §7  Isolation from scenario/sim (PROOF 7) ───────────────────');

test('PROOF 7 — a write creates ONLY the two roadmap files in DATA_DIR', async () => {
    const dir = setTempData();
    await callHandler('POST', ADMIN, { item_id: 'world-state', status: 'completed' });
    const entries = fs.readdirSync(dir).sort();
    const allowed = ['roadmap-status.json', 'roadmap-status-audit.jsonl'];
    entries.forEach(e => assert.ok(allowed.indexOf(e) !== -1, 'unexpected file created: ' + e));
    assert.ok(entries.indexOf('roadmap-status.json') !== -1, 'status file present');
    // No scenarios/journal/mc-runs/units artifacts whatsoever.
    assert.ok(!entries.some(e => /scenario|journal|mc-?run|unit|world|sim/i.test(e)), 'no scenario/sim artifacts');
});
test('PROOF 7 — store imports ONLY fs / path / ./app-data (nothing from ai or sim)', () => {
    const reqs = storeSrc.match(/require\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
    assert.ok(reqs.length > 0, 'has requires');
    reqs.forEach(r => assert.ok(/'(fs|path|\.\/app-data)'|"(fs|path|\.\/app-data)"/.test(r),
        'unexpected require: ' + r));
    assert.ok(!/require\([^)]*(\/ai\/|\/sim\/|adjudicat|journal|world-state|scenario)/i.test(storeSrc),
        'no ai/sim/journal/scenario require');
});
test('PROOF 7 — store calls no sim/commit/journal/AI-exec API (code, not comments)', () => {
    assert.ok(!/\/api\/sim/.test(storeCode), 'no /api/sim');
    assert.ok(!/commitStep|commitDecisions|appendCommit|adjudicat/i.test(storeCode), 'no commit/adjudicate/journal');
    assert.ok(!/window\.units|window\.map|world[_-]?state/i.test(storeCode), 'no World State / unit / map mutation');
    assert.ok(!/localStorage|sessionStorage|WebSocket|dispatchEvent/.test(storeCode), 'no storage/WebSocket/event dispatch');
});

// ─── §8  HARD LIMITS on the client page (locked) ─────────────────────────────
console.log('\n── §8  Client page — locked hard limits ────────────────────────');

test('client fetches ONLY /api/roadmap/status (the two approved endpoints)', () => {
    const calls = pageSrc.match(/fetch\s*\(\s*['"]([^'"]+)['"]/g) || [];
    assert.ok(calls.length >= 2, 'page now talks to its endpoint (GET + POST)');
    calls.forEach(c => assert.ok(/\/api\/roadmap\/status/.test(c), 'unexpected fetch target: ' + c));
});
test('client references no other /api/ route (no /api/sim, etc.)', () => {
    const apis = pageSrc.match(/\/api\/[a-z0-9/_-]+/gi) || [];
    apis.forEach(a => assert.ok(/^\/api\/roadmap\/status/.test(a), 'unexpected API: ' + a));
    assert.ok(!/\/api\/sim\b/.test(pageSrc), 'no /api/sim/*');
});
test('client uses no XHR / WebSocket / storage', () => {
    assert.ok(!/new\s+XMLHttpRequest|XMLHttpRequest\s*\(/.test(pageSrc), 'no XHR');
    assert.ok(!/new\s+WebSocket|WebSocket\s*\(/.test(pageSrc), 'no WebSocket');
    assert.ok(!/localStorage\s*[.\[]|sessionStorage\s*[.\[]/.test(pageSrc), 'no localStorage/sessionStorage');
});
test('client performs no scenario/map/unit/Event-Log/commit mutation', () => {
    assert.ok(!/window\.units\s*=|window\.map\s*=|window\.lines\s*=/.test(pageSrc), 'no global state writes');
    assert.ok(!/\baddEvent\s*\(|appendMessage\s*\(|eventLog\s*[.\[]/.test(pageSrc), 'no Event Log writes');
    assert.ok(!/loadScenario\s*\(|saveScenario\s*\(|commitSim\s*\(|adjudicate\s*\(/i.test(pageSrc), 'no scenario/commit calls');
    assert.ok(!/dispatchEvent\s*\([^)]*rmooz:/.test(pageSrc), 'no rmooz:* mutation events');
    assert.ok(!/applyResolution|executeCoa|go[_-]?live/i.test(pageSrc), 'no apply/commit/go-live controls');
});
test('client gates the editor on server-decided can_edit', () => {
    assert.ok(/can_edit/.test(pageSrc), 'reads can_edit from the server');
    assert.ok(/if\s*\(\s*canEdit\s*\)/.test(pageSrc), 'editor renders only when canEdit');
    assert.ok(/roadmap-editor-readonly/.test(pageSrc), 'non-admins get a read-only notice');
});
test('client degrades gracefully when the server is unreachable (offline fallback)', () => {
    assert.ok(/\.catch\(function\s*\(\)\s*\{\s*canEdit\s*=\s*false/.test(pageSrc),
        'GET failure → read-only with code defaults');
});

// ─── §9  Stable item ids + server wiring ─────────────────────────────────────
console.log('\n── §9  Stable item ids + server wiring ─────────────────────────');

test('every roadmap item carries a stable id (the persistence key)', () => {
    const ids = pageSrc.match(/\{\s*id:\s*'[a-z0-9-]+',\s*t:/g) || [];
    assert.strictEqual(ids.length, 22, 'all 22 items have a stable id, found ' + ids.length);
    ['map-2d', 'world-state', 'adjudicator', 'event-log', 'scalable-platform']
        .forEach(id => assert.ok(pageSrc.includes("id: '" + id + "'"), 'expected id: ' + id));
});
test('web-server requires roadmap-store and dispatches it before the static fallback', () => {
    assert.ok(/require\(['"]\.\/roadmap-store['"]\)/.test(webSrc), 'requires ./roadmap-store');
    assert.ok(/roadmapStore\.handleRoadmapApi\(/.test(webSrc), 'dispatches handleRoadmapApi');
    const iRoadmap = webSrc.indexOf('roadmapStore.handleRoadmapApi(');
    const iPrefs   = webSrc.indexOf('handlePrefsApi(');
    assert.ok(iPrefs !== -1 && iRoadmap > iPrefs, 'grouped with the API handlers (before static serving)');
});
test('known route, wrong method → 405', async () => {
    setTempData();
    const r = await callHandler('DELETE', ADMIN);
    assert.strictEqual(r.status, 405);
});

// ─── run ──────────────────────────────────────────────────────────────────────
(async function run() {
    for (const t of queue) {
        try { await t.fn(); console.log(`  [PASS] ${t.name}`); passed++; }
        catch (e) { console.log(`  [FAIL] ${t.name}: ${e.message}`); failed++; }
    }
    for (const d of _dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
    console.log('\n' + '═'.repeat(66));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(66) + '\n');
    process.exit(failed > 0 ? 1 : 0);
})();
