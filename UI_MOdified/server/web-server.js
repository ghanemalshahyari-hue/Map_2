/**
 * Static file server + simple LAN-only chat API (Node.js built-ins only)
 * Run from project root: node server/web-server.js  OR  npm run serve
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    // Units feature (and tile server) require better-sqlite3; keep server usable even if missing.
    Database = null;
}

const PORT = Number.parseInt(process.env.PORT, 10) || 8000;
/** Project root — env var (set by Electron) or parent of server/ */
const ROOT       = process.env.RMOOZ_ROOT_DIR    || path.join(__dirname, '..');
/** Client app directory */
const CLIENT_DIR = process.env.RMOOZ_CLIENT_DIR  || path.join(__dirname, '..', 'client');
/** Writable data directory */
const DATA_DIR   = process.env.RMOOZ_DATA_DIR    || path.join(ROOT, 'data');
/** Writable uploads directory */
const UPLOAD_DIR = process.env.RMOOZ_UPLOADS_DIR || path.join(ROOT, 'uploads');
/** Maps directory (MBTiles + maps.json) */
const MAPS_DIR   = process.env.RMOOZ_MAPS_DIR   || path.join(ROOT, 'maps');

const CHAT_FILE          = path.join(DATA_DIR, 'chat-messages.json');
const CHAT_USERS_FILE    = path.join(DATA_DIR, 'chat-users.json');
const CHAT_GROUPS_FILE   = path.join(DATA_DIR, 'chat-groups.json');
const CHAT_PRESENCE_FILE = path.join(DATA_DIR, 'chat-presence.json');
const PUBLIC_CHAT_ROOM = 'default-ops-room';
const CHAT_PRESENCE_MAX_MS = 90 * 1000;

// Ensure writable directories exist on first launch
try { fs.mkdirSync(DATA_DIR,   { recursive: true }); } catch {}
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}

const appData = require('./app-data');
const ollama       = require('./ai/ollama-client');
const aiProvider   = require('./ai/ai-provider');
const redTeam      = require('./ai/red-team-agent');
const adjudicator  = require('./ai/adjudicator-agent');
const scenarios    = require('./ai/scenario-loader');
const mcRunner     = require('./ai/monte-carlo-runner');
const feedbackStore = require('./ai/feedback-store');
const lessonStore   = require('./ai/lesson-store');
const reportBuilder = require('./ai/report-builder');
const { renderReportHtml } = require('./ai/report-render');
const coaAgent     = require('./ai/coa-agent');
if (Database) {
    try {
        appData.initAppData({ Database, dataDir: DATA_DIR, legacyUnitsFile: process.env.RMOOZ_UNITS_DB_FILE || path.join(DATA_DIR, 'units.db') });
    } catch (e) {
        console.error('\n  WARNING: better-sqlite3 native binding failed to load.');
        console.error('  Auth/units/plans features will be disabled (static pages still work).');
        console.error('  Fix:  rmdir /s /q node_modules && npm install --ignore-scripts');
        console.error('  Underlying error:', e && e.message ? e.message : e, '\n');
    }
}

// -------------------- Scenario file-watcher + SSE bus --------------------
// fs.watch fires multiple events per write (rename + change pairs, sometimes
// duplicated by the editor's atomic-write dance). We coalesce by file name
// with a short debounce so subscribers see one event per "settle".
const scenarioSubscribers = new Set();
function publishScenarioEvent(evt, data) {
    const payload = JSON.stringify(data);
    for (const sub of scenarioSubscribers) {
        try { sub(evt, payload); } catch (_) { /* sub will clean itself up */ }
    }
}
(function initScenarioWatcher() {
    const dir = path.join(DATA_DIR, 'scenarios');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const pending = new Map(); // name → timeout id
    try {
        fs.watch(dir, { persistent: false }, (evType, fname) => {
            if (!fname || !/\.json$/i.test(fname)) return;
            const name = String(fname).replace(/\.json$/i, '');
            if (pending.has(name)) clearTimeout(pending.get(name));
            pending.set(name, setTimeout(() => {
                pending.delete(name);
                // Drop the scenario-loader cache so the next GET re-reads from disk.
                try { scenarios.clearCache(); } catch (_) {}
                publishScenarioEvent('scenario-changed', {
                    name,
                    ts:   Date.now(),
                    evt:  evType,
                });
            }, 200));
        });
        console.log(`[scenario-watcher] watching ${dir}`);
    } catch (e) {
        console.warn(`[scenario-watcher] could not watch ${dir}: ${e.message || e}`);
    }
})();

// -------------------- Unified app DB (units + auth + chat + plans meta) --------------------
const UNITS_DB_FILE = process.env.RMOOZ_UNITS_DB_FILE || path.join(DATA_DIR, 'units.db');
function initUnitsDb() {
    return appData.getDb();
}

// Auth gate for state-changing endpoints. Returns the authenticated user or
// `null` (after writing a 401 to res). Use as:
//
//     const user = requireAuthenticatedUser(req, res);
//     if (!user) return;
//
// We deliberately do NOT distinguish "no cookie" from "expired/invalid
// cookie" in the response body — both surface the same 401 so the
// response can't be used as an account-existence oracle.
function requireAuthenticatedUser(req, res) {
    const user = appData.getSessionUser(req);
    if (!user) {
        sendJson(res, 401, { error: 'Authentication required' });
        return null;
    }
    return user;
}

function nowIso() {
    return new Date().toISOString();
}

function genId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'u-' + Date.now().toString(36) + '-' + crypto.randomBytes(12).toString('hex');
}

function toBoolish(v) {
    const s = String(v ?? '').trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on';
}

function toIntOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
}

function normalizeText(v, maxLen = 300) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

const UNITS_LEVEL_LABELS = {
    0: 'Army',
    1: 'Land Force',
    2: 'Brigade',
    3: 'Battalion',
    4: 'Company',
};

function codePrefixForLevel(level) {
    switch (level) {
        case 0: return 'ARMY';
        case 1: return 'LF';
        case 2: return 'BDE';
        case 3: return 'BN';
        case 4: return 'CO';
        default: return 'U';
    }
}

function generateUnitCode(db, level) {
    const prefix = codePrefixForLevel(level);
    // short random suffix, collision-resistant with uniqueness check loop
    for (let i = 0; i < 15; i++) {
        const suffix = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 chars
        const code = `${prefix}-${suffix}`;
        const existing = db.prepare('SELECT id FROM units WHERE code=? LIMIT 1').get(code);
        if (!existing) return code;
    }
    // fallback: include timestamp if we had very bad luck
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

const MIME = {
    '.html' : 'text/html; charset=utf-8',
    '.js'   : 'application/javascript',
    '.css'  : 'text/css',
    '.json' : 'application/json',
    '.geojson': 'application/geo+json',
    '.png'  : 'image/png',
    '.jpg'  : 'image/jpeg',
    '.jpeg' : 'image/jpeg',
    '.svg'  : 'image/svg+xml',
    '.ico'  : 'image/x-icon',
    '.woff' : 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf'  : 'font/ttf',
    '.mbtiles': 'application/octet-stream',
};

function readAllMessages() {
    if (appData.getDb()) return appData.readAllMessagesDb();
    try {
        const buf = fs.readFileSync(CHAT_FILE, 'utf8');
        const data = JSON.parse(buf);
        if (Array.isArray(data)) return data;
        return Array.isArray(data.messages) ? data.messages : [];
    } catch {
        return [];
    }
}

function writeAllMessages(messages) {
    if (appData.getDb()) return appData.writeAllMessagesDb(messages);
    // JSON fallback: write via temp+rename so a crash mid-write doesn't
    // corrupt the file. Still racy across multiple processes, but safe
    // for this single-process server.
    try {
        appData.atomicWriteFile(CHAT_FILE, JSON.stringify(messages, null, 2));
    } catch (err) {
        console.warn('[chat] failed to persist messages:', err && err.message ? err.message : err);
    }
}

function sendJson(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function readJsonBody(req, opts = {}) {
    const maxBytes = opts.maxBytes ?? 200000; // 200KB
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > maxBytes) {
                try { req.destroy(); } catch {}
                reject(Object.assign(new Error('Body too large'), { code: 'BODY_TOO_LARGE' }));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(Object.assign(new Error('Invalid JSON'), { code: 'INVALID_JSON' }));
            }
        });
        req.on('error', reject);
    });
}

function ensureUploadsDir() {
    try {
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
    } catch {
        // ignore
    }
}

const COOKIE_NAME = 'nato-chat-id';

function safeDecodeURIComponent(s) {
    try {
        return decodeURIComponent(s || '');
    } catch {
        return String(s || '');
    }
}

function parseCookies(req) {
    const raw = req.headers.cookie || '';
    const out = {};
    raw.split(';').forEach(p => {
        const part = p.trim();
        if (!part) return;
        const eq = part.indexOf('=');
        if (eq === -1) return;
        const k = safeDecodeURIComponent(part.slice(0, eq).trim());
        const v = safeDecodeURIComponent(part.slice(eq + 1).trim());
        if (k) out[k] = v;
    });
    return out;
}

function normalizeMemberId(x) {
    return String(x == null ? '' : x).trim();
}

function membersIncludes(members, cid) {
    const c = normalizeMemberId(cid);
    if (!c || !Array.isArray(members)) return false;
    return members.some(m => normalizeMemberId(m) === c);
}

function membersRemove(members, cid) {
    const c = normalizeMemberId(cid);
    if (!Array.isArray(members)) return [];
    return members.filter(m => normalizeMemberId(m) !== c);
}

function readChatUsers() {
    if (appData.getDb()) return appData.readChatUsersDb();
    try {
        const buf = fs.readFileSync(CHAT_USERS_FILE, 'utf8');
        const d = JSON.parse(buf);
        return typeof d === 'object' && d !== null ? d : {};
    } catch {
        return {};
    }
}

function writeChatUsers(data) {
    if (appData.getDb()) return appData.writeChatUsersDb(data);
    try {
        appData.atomicWriteFile(CHAT_USERS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.warn('[chat] failed to persist chat-users:', err && err.message ? err.message : err);
    }
}

function readChatPresence() {
    if (appData.getDb()) return appData.readChatPresenceDb();
    try {
        const buf = fs.readFileSync(CHAT_PRESENCE_FILE, 'utf8');
        const d = JSON.parse(buf);
        return d && typeof d === 'object' && d !== null ? d : {};
    } catch {
        return {};
    }
}

function writeChatPresence(data) {
    if (appData.getDb()) return appData.writeChatPresenceDb(data);
    try {
        appData.atomicWriteFile(CHAT_PRESENCE_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.warn('[chat] failed to persist presence:', err && err.message ? err.message : err);
    }
}

function pruneStaleChatPresence(presence, maxAgeMs) {
    const cut = Date.now() - maxAgeMs;
    for (const rid of Object.keys(presence)) {
        const room = presence[rid];
        if (!room || typeof room !== 'object') {
            delete presence[rid];
            continue;
        }
        for (const cookieId of Object.keys(room)) {
            const ent = room[cookieId];
            const t = ent && ent.at ? new Date(ent.at).getTime() : 0;
            if (!t || t < cut) delete room[cookieId];
        }
        if (Object.keys(room).length === 0) delete presence[rid];
    }
}

function readChatGroupsStore() {
    if (appData.getDb()) return appData.readChatGroupsStoreDb();
    try {
        const buf = fs.readFileSync(CHAT_GROUPS_FILE, 'utf8');
        const d = JSON.parse(buf);
        return d && typeof d.groups === 'object' ? d : { groups: {} };
    } catch {
        return { groups: {} };
    }
}

function writeChatGroupsStore(store) {
    if (appData.getDb()) return appData.writeChatGroupsStoreDb(store);
    try {
        appData.atomicWriteFile(CHAT_GROUPS_FILE, JSON.stringify(store, null, 2));
    } catch (err) {
        console.warn('[chat] failed to persist groups:', err && err.message ? err.message : err);
    }
}

function findGroupByRoomId(store, roomId) {
    const rid = String(roomId || '').trim();
    if (!rid) return null;
    if (store.groups[rid]) return store.groups[rid];
    for (const key of Object.keys(store.groups)) {
        const g = store.groups[key];
        if (g && normalizeMemberId(g.id) === rid) return g;
    }
    return null;
}

function storageKeyForGroup(store, g) {
    if (!g) return null;
    const found = Object.keys(store.groups).find(key => store.groups[key] === g);
    return found || null;
}

function findGroupByInviteCode(store, code) {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return null;
    for (const id of Object.keys(store.groups)) {
        const g = store.groups[id];
        if (g && String(g.inviteCode || '').toLowerCase() === c) return g;
    }
    return null;
}

function normalizeInviteCodeInput(raw) {
    return String(raw || '').trim();
}

function isValidCustomInviteCode(code) {
    const c = normalizeInviteCodeInput(code);
    if (c.length < 3 || c.length > 40) return false;
    return /^[A-Za-z0-9_-]+$/.test(c);
}

function clientMayAccessRoom(store, roomId, clientCookieId) {
    if (!clientCookieId) return false;
    if (roomId === PUBLIC_CHAT_ROOM) return true;
    const g = findGroupByRoomId(store, roomId);
    if (!g) return false;
    return membersIncludes(g.members, clientCookieId);
}

function getOrCreateClientCookieId(req) {
    const cookies = parseCookies(req);
    let cid = normalizeMemberId(cookies[COOKIE_NAME]);
    const isNew = !cid;
    if (!cid) {
        cid = 'u-' + Date.now().toString(36) + '-' + crypto.randomBytes(9).toString('base64url').replace(/=/g, '');
    }
    return { cid, isNew };
}

function setCookieHeader(cid) {
    return COOKIE_NAME + '=' + encodeURIComponent(cid) + '; Path=/; Max-Age=31536000; SameSite=Lax';
}

const INVITE_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateInviteCode() {
    let s = '';
    for (let i = 0; i < 8; i++) {
        s += INVITE_CODE_CHARS[crypto.randomInt(INVITE_CODE_CHARS.length)];
    }
    return s;
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }

    if (appData.handleAuthApi(req, res, pathname, req.method, sendJson, readJsonBody)) return;
    if (appData.handlePlansApi(req, res, url, pathname, req.method, sendJson, readJsonBody)) return;
    if (appData.handlePrefsApi(req, res, pathname, req.method, sendJson, readJsonBody)) return;

    // --- Local Ollama gateway (Chunk 08): browser never talks to Ollama
    // directly — it goes through these endpoints so we keep one bottleneck
    // for auth, validation, prompt-shaping, and audit logging. ---
    if (pathname === '/api/ai/health' && req.method === 'GET') {
        aiProvider.getStatus()
            .then(r => sendJson(res, r.available && r.available.length ? 200 : 503, {
                ok: r.available && r.available.length > 0,
                available: r.available || [],
                defaultResolved: r.defaultResolved || null,
                providers: r.providers || {},
                error: r.available && r.available.length ? null : 'no AI provider available',
            }))
            .catch(e => sendJson(res, 500, { ok: false, error: e.message || String(e) }));
        return;
    }
    // Combined provider status (Ollama + Claude). Lets the HUD show a
    // provider pill (available / default / errors) so the operator knows
    // which backend will handle a request. Returns 200 even when one
    // provider is down — `available` lists what's currently usable.
    if (pathname === '/api/ai/provider/status' && req.method === 'GET') {
        aiProvider.getStatus()
            .then(r => sendJson(res, 200, { ok: true, ...r }))
            .catch(e => sendJson(res, 500, { ok: false, error: e.message || String(e) }));
        return;
    }
    // COA generator — produces 3-5 candidate Courses of Action for the
    // commander given a scenario, current state, and a short intent.
    // Body: { scenarioName, currentState?, commanderIntent?, constraints?,
    //         provider?, model?, timeoutMs? }
    // Returns: { ok, plans: [...], meta }
    if (pathname === '/api/ai/coa' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 1_000_000 }).then(async (body) => {
            body = body || {};
            const scenarioName = body.scenarioName || scenarios.DEFAULT_NAME;
            const scenario = scenarios.loadScenario(scenarioName);
            return coaAgent.generateCoaSet({
                scenario,
                currentState:    body.currentState    || null,
                commanderIntent: body.commanderIntent || null,
                constraints:     body.constraints     || null,
                provider:        body.provider        || null,
                model:           body.model           || null,
                timeoutMs:       body.timeoutMs       || null,
            });
        }).then(r => {
            // 200 on partial success (plans present even if some dropped);
            // 502 only when no plans at all could be extracted. Caller can
            // inspect meta.errors / meta.validationDropped for soft issues.
            const status = (r.ok || (r.plans && r.plans.length)) ? 200 : 502;
            sendJson(res, status, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }
    if (pathname === '/api/ai/generate' && req.method === 'POST') {
        readJsonBody(req).then(body => {
            return ollama.generate(body || {});
        }).then(r => {
            sendJson(res, r.ok ? 200 : 502, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }
    if (pathname === '/api/ai/chat' && req.method === 'POST') {
        readJsonBody(req).then(body => {
            return ollama.chat(body || {});
        }).then(r => {
            sendJson(res, r.ok ? 200 : 502, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }
    // Chunk 09: red-team proposal endpoint. Body: { snapshot, turn, model? }.
    // Snapshot can be either the stringified GeoJSON from captureSnapshot()
    // or the parsed object — the agent handles both.
    if (pathname === '/api/ai/red-team/propose' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 2_000_000 }).then(body => {
            return redTeam.propose({ ...(body || {}), side: 'red' });
        }).then(r => {
            sendJson(res, r.ok ? 200 : 502, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }
    // Blue counter-reaction — same agent, opposite perspective. Used for
    // الفعل ورد الفعل: after Red moves, Blue commander reacts.
    if (pathname === '/api/ai/blue-team/propose' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 2_000_000 }).then(body => {
            return redTeam.propose({ ...(body || {}), side: 'blue' });
        }).then(r => {
            sendJson(res, r.ok ? 200 : 502, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }

    // List available wargame scenarios. The HUD model/scenario picker uses
    // this to populate its dropdown.
    if (pathname === '/api/ai/scenarios' && req.method === 'GET') {
        try {
            sendJson(res, 200, { ok: true, scenarios: scenarios.listScenarios(), default: scenarios.DEFAULT_NAME });
        } catch (e) {
            sendJson(res, 500, { ok: false, error: e.message || String(e) });
        }
        return;
    }

    // Load a single scenario JSON (BLS coords, OBJ, pipeline, Red OOB, etc.)
    // The HUD's map-overlay uses this to draw the scenario on the Leaflet map.
    if (pathname.startsWith('/api/ai/scenario/') && req.method === 'GET') {
        const name = pathname.slice('/api/ai/scenario/'.length);
        try {
            const data = scenarios.loadScenario(name);
            res.setHeader('Cache-Control', 'no-store');
            sendJson(res, 200, { ok: true, scenario: data });
        } catch (e) {
            sendJson(res, 404, { ok: false, error: e.message || String(e) });
        }
        return;
    }

    // Upload + ingest a raw GeoJSON wargame bundle (e.g. `all_phases.geojson`).
    // The body is the raw GeoJSON FeatureCollection; the scenario name is
    // taken from `?name=` (querystring) or the FC's `properties.operation_name`.
    // Routes through the same porter as `node scripts/port-wargame.js` so the
    // resulting `data/scenarios/<name>.json` is interchangeable with the CLI
    // workflow. The watcher (T4) then re-invalidates the scenario cache and
    // pushes a `scenario-changed` SSE event so open HUDs auto-reload.
    if (pathname === '/api/scenario/import' && req.method === 'POST') {
        // 25 MB cap — `all_phases.geojson` for Wargame3 is ≈ 1.6 MB, so this
        // is several orders of magnitude of headroom but still bounded.
        readJsonBody(req, { maxBytes: 25_000_000 }).then((body) => {
            const queryName = (url.searchParams.get('name') || '').trim();
            const fcName    = body && body.properties && typeof body.properties.operation_name === 'string'
                ? body.properties.operation_name.trim() : '';
            const rawName   = queryName || fcName || 'imported';
            // Mirror the porter's filename sanitisation so the HTTP path and
            // CLI path produce the same on-disk name.
            const safeName  = rawName
                .toLowerCase()
                .replace(/[^a-z0-9._-]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 64) || 'imported';

            const porter = require('../scripts/port-wargame.js');
            // Accept either a single FeatureCollection (all_phases bundle) or
            // an array of per-step FeatureCollections (what a folder scan
            // would yield) wrapped as `{ steps: [...] }`.
            const input = Array.isArray(body && body.steps) ? body.steps : body;
            const scenario = porter.buildScenarioFromGeoJson(input, { name: safeName });
            // Honour the caller's name choice in the on-disk filename too.
            scenario.name = safeName;
            const outFile  = porter.writeScenario(scenario);

            // Drop the cache so the very next GET re-validates from disk.
            try { scenarios.clearCache(); } catch (_) {}

            sendJson(res, 200, {
                ok: true,
                name: safeName,
                file: outFile,
                steps: (scenario.steps || []).length,
                red_units: (scenario.red_units || []).length,
                blue_units: (scenario.blue_units_initial || []).length,
            });
        }).catch((e) => {
            const code = e && e.code === 'BODY_TOO_LARGE' ? 413
                        : e && e.code === 'INVALID_JSON'   ? 400
                        : 400;
            sendJson(res, code, { ok: false, error: e.message || String(e) });
        });
        return;
    }

    // SSE channel for live scenario reload. The HUD subscribes on boot and
    // re-fetches whenever a scenario JSON changes on disk (either via the
    // import endpoint above or `node scripts/port-wargame.js` from the CLI).
    if (pathname === '/api/scenario/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type':     'text/event-stream',
            'Cache-Control':    'no-cache',
            'Connection':       'keep-alive',
            'X-Accel-Buffering':'no',
        });
        res.write(`retry: 5000\n`);
        res.write(`event: open\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
        const heartbeat = setInterval(() => {
            if (!res.writableEnded) {
                try { res.write(`: ping ${Date.now()}\n\n`); } catch (_) {}
            }
        }, 15000);
        const sub = (evt, payload) => {
            if (res.writableEnded) return;
            try { res.write(`event: ${evt}\ndata: ${payload}\n\n`); } catch (_) {}
        };
        scenarioSubscribers.add(sub);
        const cleanup = () => {
            scenarioSubscribers.delete(sub);
            clearInterval(heartbeat);
        };
        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }

    // Legacy single-step AI adjudication (boundary plan: shim route).
    //
    // Originally this route returned the LLM-produced state directly,
    // mutating combat state without any operator gate. After Step 1 of
    // the AI/sim boundary plan, it routes through adjudicateStepHeadless
    // which does propose + auto-commit in-process — same wire shape,
    // but every state change now passes through the commit journal with
    // source='legacy-shim' provenance. New clients should call
    // /api/sim/propose + /api/sim/commit instead; this route is
    // preserved unchanged-on-the-wire until Step 2 ships the approval UI.
    if (pathname === '/api/ai/adjudicate' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 2_000_000 }).then(async (body) => {
            body = body || {};
            const scenarioName = body.scenarioName || scenarios.DEFAULT_NAME;
            const scenario = scenarios.loadScenario(scenarioName);
            const runId = body.runId || body.run_id || `legacy-shim-${scenarioName}`;
            return adjudicator.adjudicateStepHeadless({
                scenario,
                stepIndex:    body.stepIndex,
                prevState:    body.prevState   || null,
                trialId:      body.trialId     || 'manual',
                trialSeed:    body.trialSeed   != null ? body.trialSeed : null,
                trialHintId:  Number.isInteger(body.trialHintId) ? body.trialHintId : 0,
                coaParams:    body.coaParams   || null,
                model:        body.model       || null,
                timeoutMs:    body.timeoutMs   || null,
                mockMode:     body.mockMode === true,
                approvedActions: body.approvedActions || null,
                provider:     body.provider    || null,
                runId,
                headless:     { reason: 'legacy-shim' },
            });
        }).then(r => {
            // Even on fallback we return 200 — the client always gets a
            // playable `state`. The `ok` flag and `validation.fallback`
            // tell the UI whether to badge the step.
            sendJson(res, 200, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }

    // ── AI/Sim boundary contract — propose + commit (plan Step 1) ────
    //
    // POST /api/sim/propose
    //   body:    { scenarioName, stepIndex, prevState?, runId?, trialId?,
    //              trialSeed?, trialHintId?, coaParams?, model?, timeoutMs?,
    //              mockMode?, approvedActions?, provider? }
    //   returns: Proposal (proposal_id, projected_state, projected_validation,
    //            proposed_actions[], rationale, narrative_*, source).
    //            NO state is mutated; nothing is written to disk.
    //
    // POST /api/sim/commit
    //   body:    { proposal_id, accepted_action_ids: string[] | 'ALL',
    //              rejected_action_ids?, operator_id?, headless?, mods? }
    //   returns: { ok, committed_state, journal_seq, post_state_hash }
    //   Writes one journal row per action (accepted or rejected) to
    //   data/journal/<runId>.jsonl. This is the ONLY durable state-
    //   mutation path in the system.
    if (pathname === '/api/sim/propose' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 2_000_000 }).then(async (body) => {
            body = body || {};
            const scenarioName = body.scenarioName || scenarios.DEFAULT_NAME;
            const scenario = scenarios.loadScenario(scenarioName);
            const runId = body.runId || body.run_id || `manual-${scenarioName}`;
            const proposal = await adjudicator.proposeStep({
                scenario,
                stepIndex:    body.stepIndex,
                prevState:    body.prevState   || null,
                trialId:      body.trialId     || 'manual',
                trialSeed:    body.trialSeed   != null ? body.trialSeed : null,
                trialHintId:  Number.isInteger(body.trialHintId) ? body.trialHintId : 0,
                coaParams:    body.coaParams   || null,
                model:        body.model       || null,
                timeoutMs:    body.timeoutMs   || null,
                mockMode:     body.mockMode === true,
                approvedActions: body.approvedActions || null,
                provider:     body.provider    || null,
                runId,
            });
            // Strip the internal _producer field before sending over the
            // wire — raw LLM I/O is server-side state, not part of the
            // public Proposal contract.
            const { _producer, ...wireProposal } = proposal;
            return wireProposal;
        }).then(p => sendJson(res, 200, p))
          .catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }

    if (pathname === '/api/sim/commit' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 200_000 }).then(async (body) => {
            body = body || {};
            const r = adjudicator.commitStep(body);
            // Don't ship producer artifacts on the commit response either.
            const { _producer, ...wire } = r;
            return wire;
        }).then(r => sendJson(res, 200, r))
          .catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }

    // POST /api/sim/decide — DIRECT WS3 decision commit (deterministic engine).
    //   body:    { scenarioName?, stepIndex?, decisions:[{type,...}] | decision,
    //              operator_id? | headless:{reason}, runId?, mods? }
    //   returns: { ok, committed_state (World State), effects, journal_seq,
    //              prev_state_hash, post_state_hash, run_id }
    //   Derives World State (WS1+DB1+DET1), applies the operator's WS3
    //   decision(s) via WS3, and writes durable journal row(s) — the
    //   deterministic-sim commit path (distinct from the LLM /commit above).
    if (pathname === '/api/sim/decide' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 200_000 }).then(async (body) => {
            body = body || {};
            const scenarioName = body.scenarioName || scenarios.DEFAULT_NAME;
            const scenario = scenarios.loadScenario(scenarioName);
            return adjudicator.commitDecisions({
                scenario,
                scenarioName,
                stepIndex:   body.stepIndex,
                decisions:   body.decisions || (body.decision ? [body.decision] : []),
                operator_id: body.operator_id || null,
                headless:    body.headless || null,
                runId:       body.runId || null,
                mods:        body.mods || null,
                engineOpts:  body.engineOpts || null,
            });
        }).then(r => sendJson(res, 200, r))
          .catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }

    // Operator feedback on an adjudicated step (item #9). Append-only.
    // Body: { scenarioName, stepIndex, decision: 'accept'|'reject'|'note',
    //         trialId?, coaParams?, provider?, model?, note? }.
    if (pathname === '/api/ai/feedback' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 32_000 }).then(body => {
            const r = feedbackStore.append(body || {});
            sendJson(res, r.ok ? 200 : 400, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }

    // Read aggregated feedback counts for the priors / HUD. Optional
    // querystring filter: ?scenario=NAME&posture=X&reserve_hr=N&ageMs=...
    if (pathname === '/api/ai/feedback/summary' && req.method === 'GET') {
        try {
            const url = new URL('http://x' + req.url);
            const scenarioName = url.searchParams.get('scenario') || scenarios.DEFAULT_NAME;
            const posture      = url.searchParams.get('posture');
            const reserveHr    = url.searchParams.get('reserve_hr');
            const ageMs        = Number(url.searchParams.get('ageMs')) || 0;
            const coaParams = (posture || reserveHr)
                ? { posture: posture || undefined, reserve_commit_hour: reserveHr != null ? Number(reserveHr) : undefined }
                : null;
            const counts = feedbackStore.countByScenarioCoa({ scenarioName, coaParams, ageMs });
            sendJson(res, 200, { ok: true, scenarioName, coaParams, counts });
        } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message || String(e) });
        }
        return;
    }

    // AAR lessons (item #5). POST to create, GET to list.
    if (pathname === '/api/ai/lessons' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 32_000 }).then(body => {
            const r = lessonStore.append(body || {});
            sendJson(res, r.ok ? 200 : 400, r);
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }
    if (pathname === '/api/ai/lessons' && req.method === 'GET') {
        try {
            const url = new URL('http://x' + req.url);
            const scenarioName = url.searchParams.get('scenario') || '';
            const limit = Number(url.searchParams.get('limit')) || 20;
            const lessons = scenarioName
                ? lessonStore.listByScenario(scenarioName, limit)
                : lessonStore.listRecent(limit);
            sendJson(res, 200, { ok: true, lessons });
        } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message || String(e) });
        }
        return;
    }

    // Comparison report (item #12). Three-column comparison of a scenario:
    // baseline / live AI (trial-000 of an MC run) / MC distribution. Default
    // run is the most-recent completed MC for the named scenario.
    //   GET /api/ai/report.html?scenario=NAME[&runId=RUNID]   (rendered HTML)
    //   GET /api/ai/report.json?scenario=NAME[&runId=RUNID]   (raw data)
    if ((pathname === '/api/ai/report.html' || pathname === '/api/ai/report.json') && req.method === 'GET') {
        try {
            const url = new URL('http://x' + req.url);
            const scenarioName = url.searchParams.get('scenario') || scenarios.DEFAULT_NAME;
            const runId        = url.searchParams.get('runId') || null;
            const report = reportBuilder.buildReport({ scenarioName, runId });
            if (pathname === '/api/ai/report.json') {
                sendJson(res, 200, { ok: true, report });
            } else {
                const html = renderReportHtml(report);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(html);
            }
        } catch (e) {
            const msg = e && e.message || String(e);
            if (pathname === '/api/ai/report.json') {
                sendJson(res, 400, { ok: false, error: msg });
            } else {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!doctype html><meta charset=utf-8><title>Report error</title><pre style="color:#b22;padding:20px;">Report error: ${msg.replace(/</g,'&lt;')}</pre>`);
            }
        }
        return;
    }

    // Monte Carlo: start a batch. Returns immediately with a runId; the
    // runner walks N trials in the background. Subscribe to events via SSE.
    if (pathname === '/api/ai/mc/start' && req.method === 'POST') {
        readJsonBody(req, { maxBytes: 100_000 }).then(body => {
            body = body || {};
            const { runId, dir } = mcRunner.startBatch({
                scenarioName: body.scenarioName,
                trials:       body.trials,
                parallelism:  body.parallelism,
                coaParams:    body.coaParams,
                model:        body.model,
                timeoutMs:    body.timeoutMs,
                mockMode:     body.mockMode === true,
                provider:     body.provider || null,
            });
            sendJson(res, 200, { ok: true, runId, dir });
        }).catch(e => sendJson(res, 400, { ok: false, error: e.message || String(e) }));
        return;
    }

    // Monte Carlo: subscribe to a run's progress events via SSE.
    if (pathname.startsWith('/api/ai/mc/') && pathname.endsWith('/events') && req.method === 'GET') {
        const runId = pathname.slice('/api/ai/mc/'.length, -('/events'.length));
        res.writeHead(200, {
            'Content-Type':    'text/event-stream',
            'Cache-Control':   'no-cache',
            'Connection':      'keep-alive',
            'X-Accel-Buffering':'no',
        });
        res.write(`retry: 5000\n`);
        res.write(`event: open\ndata: ${JSON.stringify({ runId })}\n\n`);
        const heartbeat = setInterval(() => {
            if (!res.writableEnded) {
                try { res.write(`: ping ${Date.now()}\n\n`); } catch (_) {}
            }
        }, 15000);
        let unsubscribe = null;
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            clearInterval(heartbeat);
            if (unsubscribe) unsubscribe();
        };

        unsubscribe = mcRunner.subscribe(runId, (evt, data) => {
            try {
                res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`);
                if (evt === 'done') {
                    // Server-side close after final event so the client knows.
                    setTimeout(() => {
                        cleanup();
                        if (!res.writableEnded) res.end();
                    }, 50);
                }
            } catch (_) { /* socket may have closed */ }
        });
        if (!unsubscribe) {
            res.write(`event: error\ndata: ${JSON.stringify({ msg: 'unknown runId', runId })}\n\n`);
            cleanup();
            res.end();
            return;
        }
        req.on('close', cleanup);
        return;
    }

    // Monte Carlo: cancel an in-flight run.
    if (pathname.startsWith('/api/ai/mc/') && pathname.endsWith('/cancel') && req.method === 'POST') {
        const runId = pathname.slice('/api/ai/mc/'.length, -('/cancel'.length));
        sendJson(res, 200, mcRunner.cancel(runId));
        return;
    }

    // Monte Carlo: read the in-memory or on-disk aggregate.
    if (pathname.startsWith('/api/ai/mc/') && pathname.endsWith('/aggregate') && req.method === 'GET') {
        const runId = pathname.slice('/api/ai/mc/'.length, -('/aggregate'.length));
        const summary = mcRunner.getRunSummary(runId);
        if (!summary) { sendJson(res, 404, { ok: false, error: 'unknown runId' }); return; }
        sendJson(res, 200, { ok: true, summary });
        return;
    }

    // --- Chat API: messages (private group rooms require membership) ---
    if (pathname === '/api/chat/messages') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        const cookieHeaders = () => (isNew ? { 'Set-Cookie': setCookieHeader(cid) } : {});

        if (req.method === 'GET') {
            const roomId = url.searchParams.get('roomId') || PUBLIC_CHAT_ROOM;
            const store = readChatGroupsStore();
            if (!clientMayAccessRoom(store, roomId, cid)) {
                res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', ...cookieHeaders() });
                res.end(JSON.stringify({ error: 'Room access denied' }));
                return;
            }
            const all = readAllMessages();
            const filtered = all.filter(m => (m.roomId || PUBLIC_CHAT_ROOM) === roomId);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...cookieHeaders() });
            res.end(JSON.stringify(filtered));
            return;
        }
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
            req.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(body || '{}');
                } catch {
                    return sendJson(res, 400, { error: 'Invalid JSON' });
                }
                const roomId = parsed.roomId || PUBLIC_CHAT_ROOM;
                const store = readChatGroupsStore();
                if (!clientMayAccessRoom(store, roomId, cid)) {
                    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', ...cookieHeaders() });
                    res.end(JSON.stringify({ error: 'Room access denied' }));
                    return;
                }
                const now = new Date().toISOString();
                const msg = {
                    id: String(Date.now()) + '-' + Math.random().toString(36).slice(2),
                    roomId,
                    userId: parsed.userId || 'unknown',
                    userName: parsed.userName || parsed.userId || 'Unknown',
                    role: parsed.role || '',
                    text: parsed.text || '',
                    timestamp: now
                };
                if (appData.getDb()) {
                    appData.appendMessageDb(msg);
                } else {
                    const all = readAllMessages();
                    all.push(msg);
                    writeAllMessages(all);
                }
                res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', ...cookieHeaders() });
                res.end(JSON.stringify(msg));
            });
            return;
        }
        res.writeHead(405); res.end(); return;
    }

    // --- Chat API: file upload ---
    if (pathname === '/api/chat/upload' && req.method === 'POST') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        const roomId = url.searchParams.get('roomId') || PUBLIC_CHAT_ROOM;
        const store = readChatGroupsStore();
        if (!clientMayAccessRoom(store, roomId, cid)) {
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            res.writeHead(403, h);
            res.end(JSON.stringify({ error: 'Room access denied' }));
            return;
        }
        ensureUploadsDir();
        const rawName = url.searchParams.get('filename') || 'file';
        const safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
        const baseName = Date.now() + '_' + Math.random().toString(36).slice(2) + '_' + safeName;
        const filePath = path.join(UPLOAD_DIR, baseName);

        const ws = fs.createWriteStream(filePath);
        req.pipe(ws);
        ws.on('finish', () => {
            const publicUrl = `/uploads/${encodeURIComponent(baseName)}`;
            const headers = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) headers['Set-Cookie'] = setCookieHeader(cid);
            res.writeHead(201, headers);
            res.end(JSON.stringify({ url: publicUrl, roomId }));
        });
        ws.on('error', () => {
            res.writeHead(500); res.end('Upload error');
        });
        return;
    }

    // --- Chat API: list private groups for this browser (cookie) ---
    if (pathname === '/api/chat/groups/mine' && req.method === 'GET') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        const store = readChatGroupsStore();
        const list = [];
        for (const id of Object.keys(store.groups)) {
            const g = store.groups[id];
            if (g && membersIncludes(g.members, cid)) {
                list.push({
                    id: g.id,
                    name: g.name || 'Group',
                    isCreator: !g.createdBy || normalizeMemberId(g.createdBy) === normalizeMemberId(cid)
                });
            }
        }
        const h = { 'Content-Type': 'application/json; charset=utf-8' };
        if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
        res.writeHead(200, h);
        res.end(JSON.stringify({ groups: list }));
        return;
    }

    // --- Chat API: create private group (creator is first member) ---
    if (pathname === '/api/chat/groups/create' && req.method === 'POST') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 1e4) req.destroy(); });
        req.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
            const name = String(parsed.name || '').trim() || 'Private group';
            const groupId = 'grp-' + crypto.randomBytes(16).toString('hex');
            const inviteCode = generateInviteCode();
            const created = {
                id: groupId,
                name,
                inviteCode,
                members: [cid],
                createdBy: cid,
                createdAt: new Date().toISOString()
            };
            // Atomic insert via SQLite transaction (DB path) or in-process
            // synchronous read-modify-write of the JSON file (fallback).
            if (appData.getDb()) {
                appData.updateChatGroupsAtomic((store) => {
                    store.groups[groupId] = created;
                });
            } else {
                const store = readChatGroupsStore();
                store.groups[groupId] = created;
                writeChatGroupsStore(store);
            }
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            res.writeHead(201, h);
            res.end(JSON.stringify({ groupId, name, inviteCode }));
        });
        return;
    }

    // --- Chat API: join private group by invite code ---
    if (pathname === '/api/chat/groups/join' && req.method === 'POST') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 1e4) req.destroy(); });
        req.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            // The mutator returns either { id, name } on success or null
            // when the invite code didn't match — that signal flows back
            // out so the route can pick the right HTTP status.
            const apply = (store) => {
                const g = findGroupByInviteCode(store, parsed.inviteCode);
                if (!g) return null;
                if (!Array.isArray(g.members)) g.members = [];
                if (!membersIncludes(g.members, cid)) g.members.push(cid);
                return { id: g.id, name: g.name };
            };
            let result;
            if (appData.getDb()) {
                result = appData.updateChatGroupsAtomic(apply);
            } else {
                const store = readChatGroupsStore();
                result = apply(store);
                if (result) writeChatGroupsStore(store);
            }
            if (!result) {
                res.writeHead(404, h);
                res.end(JSON.stringify({ error: 'Invalid invite code' }));
                return;
            }
            res.writeHead(200, h);
            res.end(JSON.stringify({ groupId: result.id, name: result.name }));
        });
        return;
    }

    // --- Chat API: invite code for a group (members only) ---
    if (pathname === '/api/chat/groups/invite' && req.method === 'GET') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        const groupId = url.searchParams.get('groupId') || '';
        const store = readChatGroupsStore();
        const g = findGroupByRoomId(store, groupId);
        const h = { 'Content-Type': 'application/json; charset=utf-8' };
        if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
        if (!g || groupId === PUBLIC_CHAT_ROOM) {
            res.writeHead(404, h);
            res.end(JSON.stringify({ error: 'Group not found' }));
            return;
        }
        if (!membersIncludes(g.members, cid)) {
            res.writeHead(403, h);
            res.end(JSON.stringify({ error: 'Not a member of this group' }));
            return;
        }
        res.writeHead(200, h);
        res.end(JSON.stringify({ groupId: g.id, name: g.name, inviteCode: g.inviteCode || '' }));
        return;
    }

    // --- Chat API: set custom invite code (members only; must be unique case-insensitive) ---
    if (pathname === '/api/chat/groups/invite-code' && req.method === 'POST') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 1e4) req.destroy(); });
        req.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
            const groupId = String(parsed.groupId || '').trim();
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            const newCode = normalizeInviteCodeInput(parsed.inviteCode);
            if (!isValidCustomInviteCode(newCode)) {
                res.writeHead(400, h);
                res.end(JSON.stringify({ error: 'Invite code must be 3–40 characters (letters, numbers, _ or - only)' }));
                return;
            }
            // The validations (group exists, member, uniqueness) and the
            // mutation must all happen inside the same transaction, otherwise
            // two members can race the uniqueness check and end up with two
            // groups holding the same custom code.
            const apply = (store) => {
                const g = findGroupByRoomId(store, groupId);
                if (!g || groupId === PUBLIC_CHAT_ROOM) return { error: 'Group not found', status: 404 };
                if (!membersIncludes(g.members, cid)) return { error: 'Not a member of this group', status: 403 };
                const taken = findGroupByInviteCode(store, newCode);
                if (taken && normalizeMemberId(taken.id) !== normalizeMemberId(g.id)) {
                    return { error: 'That invite code is already used by another group', status: 409 };
                }
                g.inviteCode = newCode;
                return { ok: true, id: g.id, inviteCode: g.inviteCode };
            };
            let result;
            if (appData.getDb()) {
                result = appData.updateChatGroupsAtomic(apply);
            } else {
                const store = readChatGroupsStore();
                result = apply(store);
                if (result && result.ok) writeChatGroupsStore(store);
            }
            if (result && result.error) {
                res.writeHead(result.status, h);
                res.end(JSON.stringify({ error: result.error }));
                return;
            }
            res.writeHead(200, h);
            res.end(JSON.stringify({ groupId: result.id, inviteCode: result.inviteCode }));
        });
        return;
    }

    // --- Chat API: leave a group (removes you; deletes group if last member) ---
    if (pathname === '/api/chat/groups/leave' && req.method === 'POST') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 1e4) req.destroy(); });
        req.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
            const groupId = String(parsed.groupId || '').trim();
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            const apply = (store) => {
                const g = findGroupByRoomId(store, groupId);
                if (!g || groupId === PUBLIC_CHAT_ROOM) return { error: 'Group not found', status: 404 };
                if (!membersIncludes(g.members, cid)) return { error: 'Not a member of this group', status: 403 };
                g.members = membersRemove(g.members, cid);
                const groupDeleted = g.members.length === 0;
                if (groupDeleted) {
                    const sk = storageKeyForGroup(store, g) || groupId;
                    delete store.groups[sk];
                }
                return { ok: true, groupDeleted };
            };
            let result;
            if (appData.getDb()) {
                result = appData.updateChatGroupsAtomic(apply);
            } else {
                const store = readChatGroupsStore();
                result = apply(store);
                if (result && result.ok) writeChatGroupsStore(store);
            }
            if (result && result.error) {
                res.writeHead(result.status, h);
                res.end(JSON.stringify({ error: result.error }));
                return;
            }
            res.writeHead(200, h);
            res.end(JSON.stringify({ ok: true, groupDeleted: !!result.groupDeleted }));
        });
        return;
    }

    // --- Chat API: delete group for everyone (creator only) ---
    if (pathname === '/api/chat/groups/delete' && req.method === 'POST') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 1e4) req.destroy(); });
        req.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
            const groupId = String(parsed.groupId || '').trim();
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            const apply = (store) => {
                const g = findGroupByRoomId(store, groupId);
                if (!g || groupId === PUBLIC_CHAT_ROOM) return { error: 'Group not found', status: 404 };
                if (g.createdBy && normalizeMemberId(g.createdBy) !== normalizeMemberId(cid)) {
                    return { error: 'Only the group creator can delete it', status: 403 };
                }
                const delKey = storageKeyForGroup(store, g) || groupId;
                delete store.groups[delKey];
                return { ok: true };
            };
            let result;
            if (appData.getDb()) {
                result = appData.updateChatGroupsAtomic(apply);
            } else {
                const store = readChatGroupsStore();
                result = apply(store);
                if (result && result.ok) writeChatGroupsStore(store);
            }
            if (result && result.error) {
                res.writeHead(result.status, h);
                res.end(JSON.stringify({ error: result.error }));
                return;
            }
            res.writeHead(200, h);
            res.end(JSON.stringify({ ok: true }));
        });
        return;
    }

    // --- Chat API: lightweight presence (who has this room open; cookie-keyed) ---
    if (pathname === '/api/chat/presence' && req.method === 'POST') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 1e4) req.destroy(); });
        req.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
            const roomId = String(parsed.roomId || '').trim() || PUBLIC_CHAT_ROOM;
            const store = readChatGroupsStore();
            if (!clientMayAccessRoom(store, roomId, cid)) {
                const h = { 'Content-Type': 'application/json; charset=utf-8' };
                if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
                res.writeHead(403, h);
                res.end(JSON.stringify({ error: 'Room access denied' }));
                return;
            }
            const users = readChatUsers();
            const u = users[cid] || {};
            const name = String(parsed.name || u.name || '').trim() || 'Unknown';
            // DB path: one IMMEDIATE transaction prunes stale rows AND
            // upserts the current ping. JSON fallback keeps the older
            // read-modify-write but rides on the atomic temp+rename file
            // write so it's at least crash-safe.
            if (appData.getDb()) {
                appData.recordPresenceDb(roomId, cid, name, CHAT_PRESENCE_MAX_MS);
            } else {
                const presence = readChatPresence();
                if (!presence[roomId] || typeof presence[roomId] !== 'object') presence[roomId] = {};
                presence[roomId][cid] = { name, at: new Date().toISOString() };
                pruneStaleChatPresence(presence, CHAT_PRESENCE_MAX_MS);
                writeChatPresence(presence);
            }
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            res.writeHead(200, h);
            res.end(JSON.stringify({ ok: true }));
        });
        return;
    }

    // --- Chat API: room member list (private = group roster; public = active + chat history) ---
    if (pathname === '/api/chat/rooms/members' && req.method === 'GET') {
        const { cid, isNew } = getOrCreateClientCookieId(req);
        const roomId = String(url.searchParams.get('roomId') || '').trim() || PUBLIC_CHAT_ROOM;
        const store = readChatGroupsStore();
        const hBase = { 'Content-Type': 'application/json; charset=utf-8' };
        if (isNew) hBase['Set-Cookie'] = setCookieHeader(cid);
        if (!clientMayAccessRoom(store, roomId, cid)) {
            res.writeHead(403, hBase);
            res.end(JSON.stringify({ error: 'Room access denied' }));
            return;
        }
        const users = readChatUsers();
        // Prune stale rows directly (single SQL DELETE in DB mode), then
        // re-read for display. No read-modify-write needed.
        if (appData.getDb()) {
            appData.prunePresenceDb(CHAT_PRESENCE_MAX_MS);
        }
        const presence = readChatPresence();
        if (!appData.getDb()) {
            pruneStaleChatPresence(presence, CHAT_PRESENCE_MAX_MS);
            writeChatPresence(presence);
        }
        const roomP = presence[roomId] || {};
        const g = findGroupByRoomId(store, roomId);
        const isPrivateGroup = !!(g && roomId.startsWith('grp-'));

        if (isPrivateGroup) {
            const members = (g.members || []).map(cookieId => {
                const u = users[cookieId] || {};
                const pr = roomP[cookieId];
                const online = !!(pr && (Date.now() - new Date(pr.at).getTime() < CHAT_PRESENCE_MAX_MS));
                return {
                    name: (String(u.name || '').trim() || 'Unknown'),
                    userId: String(u.id || cookieId),
                    role: u.role || '',
                    isCreator: normalizeMemberId(g.createdBy) === normalizeMemberId(cookieId),
                    online
                };
            });
            members.sort((a, b) => a.name.localeCompare(b.name));
            res.writeHead(200, hBase);
            res.end(JSON.stringify({
                roomId,
                isPrivateGroup: true,
                presenceTtlSec: Math.round(CHAT_PRESENCE_MAX_MS / 1000),
                members
            }));
            return;
        }

        const addedUserIds = new Set();
        const members = [];
        for (const cookieId of Object.keys(roomP)) {
            const pr = roomP[cookieId];
            if (Date.now() - new Date(pr.at).getTime() >= CHAT_PRESENCE_MAX_MS) continue;
            const u = users[cookieId] || {};
            const userId = String(u.id || cookieId);
            members.push({
                name: (String(pr.name || u.name || '').trim() || 'Unknown'),
                userId,
                role: u.role || '',
                isCreator: false,
                online: true
            });
            addedUserIds.add(userId);
        }
        const all = readAllMessages();
        for (const m of all) {
            if ((m.roomId || PUBLIC_CHAT_ROOM) !== roomId) continue;
            const uid = String(m.userId || 'unknown');
            if (addedUserIds.has(uid)) continue;
            addedUserIds.add(uid);
            members.push({
                name: (String(m.userName || uid).trim() || uid),
                userId: uid,
                role: m.role || '',
                isCreator: false,
                online: false
            });
        }
        members.sort((a, b) => a.name.localeCompare(b.name));
        res.writeHead(200, hBase);
        res.end(JSON.stringify({
            roomId,
            isPrivateGroup: false,
            presenceTtlSec: Math.round(CHAT_PRESENCE_MAX_MS / 1000),
            members
        }));
        return;
    }

    // --- Chat API: user identity (cookie + chat-users map; logged-in user from session when present) ---
    if (pathname === '/api/chat/me') {
        const { cid } = getOrCreateClientCookieId(req);
        const meHeaders = {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': setCookieHeader(cid)
        };

        if (req.method === 'GET') {
            const su = appData.getSessionUser(req);
            if (su) {
                res.writeHead(200, meHeaders);
                res.end(JSON.stringify({ id: su.id, name: su.displayName || su.username, role: su.role || 'planner' }));
                return;
            }
            const users = readChatUsers();
            const user = users[cid];
            if (user && (user.name || user.id)) {
                res.writeHead(200, meHeaders);
                res.end(JSON.stringify({ id: user.id || cid, name: user.name || 'Unknown', role: user.role || 'planner' }));
            } else {
                res.writeHead(200, meHeaders);
                res.end(JSON.stringify({ id: cid, name: '', role: 'planner' }));
            }
            return;
        }
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; if (body.length > 1e4) req.destroy(); });
            req.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
                const su = appData.getSessionUser(req);
                const db = appData.getDb();
                if (su && db && parsed.name) {
                    const nm = String(parsed.name || '').trim();
                    if (nm) {
                        try {
                            db.prepare('UPDATE users SET display_name=?, updated_at=? WHERE id=?').run(nm, nowIso(), su.id);
                        } catch (_) {}
                    }
                }
                // Read existing entry only to preserve missing fields, then
                // upsert THIS client's row. In DB mode that's a single
                // INSERT OR REPLACE — no DELETE-then-reinsert-everyone, so
                // a concurrent identity update from a different browser
                // can't lose this one.
                const users = readChatUsers();
                const merged = {
                    id: parsed.id || users[cid]?.id || cid,
                    name: String(parsed.name || users[cid]?.name || 'Planner 1').trim() || 'Planner 1',
                    role: parsed.role || users[cid]?.role || 'planner'
                };
                if (appData.getDb()) {
                    appData.upsertChatUserDb(cid, merged);
                } else {
                    users[cid] = merged;
                    writeChatUsers(users);
                }
                res.writeHead(200, meHeaders);
                res.end(JSON.stringify(merged));
            });
            return;
        }
        res.writeHead(405); res.end(); return;
    }

    // --- Units API (SQLite) ---
    if (pathname === '/api/units/tree' && req.method === 'GET') {
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const includeDeleted = toBoolish(url.searchParams.get('includeDeleted'));
        const rows = db.prepare(
            includeDeleted
                ? 'SELECT * FROM units ORDER BY level ASC, name ASC'
                : 'SELECT * FROM units WHERE deleted_at IS NULL ORDER BY level ASC, name ASC'
        ).all();
        const byId = new Map(rows.map(r => [r.id, r]));
        const childrenMap = new Map();
        for (const r of rows) {
            const pid = r.parent_id || null;
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid).push(r);
        }
        function nodeFor(r) {
            const kids = childrenMap.get(r.id) || [];
            return {
                id: r.id,
                code: r.code,
                name: r.name,
                level: r.level,
                levelLabel: UNITS_LEVEL_LABELS[r.level] || String(r.level),
                parentId: r.parent_id || null,
                sidc: r.sidc || null,
                unitType: r.unit_type || null,
                side: r.side || 'friendly',
                lat: (r.lat == null ? null : Number(r.lat)),
                lng: (r.lng == null ? null : Number(r.lng)),
                placedAt: r.placed_at || null,
                deletedAt: r.deleted_at || null,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                children: kids.map(nodeFor),
            };
        }
        const roots = (childrenMap.get(null) || []).filter(r => !r.parent_id || !byId.has(r.parent_id)).map(nodeFor);
        sendJson(res, 200, { roots, units: rows });
        return;
    }

    if (pathname.startsWith('/api/units/') && req.method === 'GET' && pathname.endsWith('/children')) {
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const parts = pathname.split('/').filter(Boolean); // api, units, :id, children
        const id = parts[2];
        const depth = Math.max(1, toIntOrNull(url.searchParams.get('depth')) || 1);
        const includeDeleted = toBoolish(url.searchParams.get('includeDeleted'));
        const root = db.prepare('SELECT * FROM units WHERE id=?').get(id);
        if (!root || (!includeDeleted && root.deleted_at)) { sendJson(res, 404, { error: 'Unit not found' }); return; }
        const rows = db.prepare(includeDeleted ? 'SELECT * FROM units' : 'SELECT * FROM units WHERE deleted_at IS NULL').all();
        const childrenMap = new Map();
        for (const r of rows) {
            const pid = r.parent_id || null;
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid).push(r);
        }
        const out = [];
        function walk(pid, d) {
            if (d <= 0) return;
            const kids = childrenMap.get(pid) || [];
            for (const k of kids) {
                out.push(k);
                walk(k.id, d - 1);
            }
        }
        walk(id, depth);
        sendJson(res, 200, { unit: root, depth, children: out });
        return;
    }

    if (pathname === '/api/units/search' && req.method === 'GET') {
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const q = normalizeText(url.searchParams.get('q'), 200) || '';
        const includeDeleted = toBoolish(url.searchParams.get('includeDeleted'));
        if (!q) { sendJson(res, 200, { q: '', results: [] }); return; }
        const like = '%' + q + '%';
        const stmt = db.prepare(
            includeDeleted
                ? "SELECT * FROM units WHERE code LIKE ? OR name LIKE ? ORDER BY level ASC, name ASC LIMIT 200"
                : "SELECT * FROM units WHERE deleted_at IS NULL AND (code LIKE ? OR name LIKE ?) ORDER BY level ASC, name ASC LIMIT 200"
        );
        const results = stmt.all(like, like);
        sendJson(res, 200, { q, results });
        return;
    }

    if (pathname === '/api/units/code-check' && req.method === 'GET') {
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const raw = normalizeText(url.searchParams.get('code'), 80);
        const code = raw ? raw.trim() : '';
        const excludeId = normalizeText(url.searchParams.get('excludeId'), 80);
        if (!code) { sendJson(res, 200, { code: '', available: false, reason: 'empty' }); return; }
        const row = db.prepare('SELECT id FROM units WHERE code=? LIMIT 1').get(code);
        if (!row) { sendJson(res, 200, { code, available: true }); return; }
        if (excludeId && row.id === excludeId) { sendJson(res, 200, { code, available: true, existingId: row.id }); return; }
        sendJson(res, 200, { code, available: false, existingId: row.id });
        return;
    }

    if (pathname === '/api/units' && req.method === 'POST') {
        if (!requireAuthenticatedUser(req, res)) return;
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        readJsonBody(req).then(body => {
            let code = normalizeText(body.code, 80);
            const name = normalizeText(body.name, 200);
            const level = toIntOrNull(body.level);
            const parentId = normalizeText(body.parentId, 80);
            const sidc = normalizeText(body.sidc, 60);
            const unitType = normalizeText(body.unitType, 120);
            const VALID_SIDES = ['friendly', 'hostile', 'neutral', 'unknown'];
            let side = VALID_SIDES.includes(body.side) ? body.side : 'friendly';
            if (!name) return sendJson(res, 400, { error: 'name is required' });
            if (level == null || level < 0 || level > 4) return sendJson(res, 400, { error: 'level must be 0..4' });
            if (!parentId && level !== 0) return sendJson(res, 400, { error: 'root units must be level 0 (Army)' });

            let parent = null;
            if (parentId) {
                parent = db.prepare('SELECT * FROM units WHERE id=?').get(parentId);
                if (!parent || parent.deleted_at) return sendJson(res, 400, { error: 'parentId not found' });
                if ((parent.level + 1) !== level) return sendJson(res, 400, { error: 'child level must be parent level + 1' });
                // Always inherit affiliation from parent — child cannot differ from its army
                if (VALID_SIDES.includes(parent.side)) side = parent.side;
            }

            if (!code) {
                code = generateUnitCode(db, level);
            } else {
                const existing = db.prepare('SELECT id FROM units WHERE code=? LIMIT 1').get(code);
                if (existing) return sendJson(res, 409, { error: 'code must be unique' });
            }

            const id = genId();
            const t = nowIso();
            try {
                db.prepare(
                    'INSERT INTO units (id, code, name, level, parent_id, sidc, unit_type, side, deleted_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
                ).run(id, code, name, level, parentId || null, sidc, unitType, side, null, t, t);
                const row = db.prepare('SELECT * FROM units WHERE id=?').get(id);
                sendJson(res, 201, row);
            } catch (e) {
                if (String(e && e.message || '').toLowerCase().includes('unique')) {
                    return sendJson(res, 409, { error: 'code must be unique' });
                }
                sendJson(res, 500, { error: 'Failed to create unit' });
            }
        }).catch(err => {
            sendJson(res, err && err.code === 'INVALID_JSON' ? 400 : 500, { error: err && err.code === 'INVALID_JSON' ? 'Invalid JSON' : 'Request failed' });
        });
        return;
    }

    if (pathname.startsWith('/api/units/') && req.method === 'PATCH') {
        if (!requireAuthenticatedUser(req, res)) return;
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const parts = pathname.split('/').filter(Boolean); // api, units, :id
        const id = parts[2];
        readJsonBody(req).then(body => {
            const existing = db.prepare('SELECT * FROM units WHERE id=?').get(id);
            if (!existing) return sendJson(res, 404, { error: 'Unit not found' });

            const name = body.name !== undefined ? normalizeText(body.name, 200) : undefined;
            const code = body.code !== undefined ? normalizeText(body.code, 80) : undefined;
            const level = body.level !== undefined ? toIntOrNull(body.level) : undefined;
            const sidc = body.sidc !== undefined ? normalizeText(body.sidc, 60) : undefined;
            const unitType = body.unitType !== undefined ? normalizeText(body.unitType, 120) : undefined;
            const VALID_SIDES_P = ['friendly', 'hostile', 'neutral', 'unknown'];
            const side = body.side !== undefined ? (VALID_SIDES_P.includes(body.side) ? body.side : existing.side) : undefined;

            if (code !== undefined && !code) return sendJson(res, 400, { error: 'code cannot be empty' });
            if (name !== undefined && !name) return sendJson(res, 400, { error: 'name cannot be empty' });
            if (level !== undefined && (level == null || level < 0 || level > 4)) return sendJson(res, 400, { error: 'level must be 0..4' });
            if (code !== undefined) {
                const existingCode = db.prepare('SELECT id FROM units WHERE code=? LIMIT 1').get(code);
                if (existingCode && existingCode.id !== id) return sendJson(res, 409, { error: 'code must be unique' });
            }

            // If changing level, validate against parent/children (strict +1 rule)
            if (level !== undefined) {
                if (!existing.parent_id && level !== 0) return sendJson(res, 400, { error: 'root units must be level 0 (Army)' });
                if (existing.parent_id) {
                    const parent = db.prepare('SELECT * FROM units WHERE id=?').get(existing.parent_id);
                    if (!parent || parent.deleted_at) return sendJson(res, 400, { error: 'parentId not found' });
                    if ((parent.level + 1) !== level) return sendJson(res, 400, { error: 'child level must be parent level + 1' });
                }
                const kids = db.prepare('SELECT * FROM units WHERE parent_id=? AND deleted_at IS NULL').all(existing.id);
                for (const k of kids) {
                    if (k.level !== (level + 1)) return sendJson(res, 400, { error: 'cannot change level: child levels would be invalid' });
                }
            }

            const sets = [];
            const vals = [];
            function setCol(col, v) { sets.push(col + '=?'); vals.push(v); }
            if (code !== undefined) setCol('code', code);
            if (name !== undefined) setCol('name', name);
            if (level !== undefined) setCol('level', level);
            if (sidc !== undefined) setCol('sidc', sidc);
            if (unitType !== undefined) setCol('unit_type', unitType);
            if (side !== undefined) setCol('side', side);
            setCol('updated_at', nowIso());
            if (sets.length === 0) return sendJson(res, 200, existing);

            try {
                db.prepare('UPDATE units SET ' + sets.join(', ') + ' WHERE id=?').run(...vals, id);
                const row = db.prepare('SELECT * FROM units WHERE id=?').get(id);
                sendJson(res, 200, row);
            } catch (e) {
                if (String(e && e.message || '').toLowerCase().includes('unique')) {
                    return sendJson(res, 409, { error: 'code must be unique' });
                }
                sendJson(res, 500, { error: 'Failed to update unit' });
            }
        }).catch(err => {
            sendJson(res, err && err.code === 'INVALID_JSON' ? 400 : 500, { error: err && err.code === 'INVALID_JSON' ? 'Invalid JSON' : 'Request failed' });
        });
        return;
    }

    if (pathname.startsWith('/api/units/') && req.method === 'POST' && pathname.endsWith('/move')) {
        if (!requireAuthenticatedUser(req, res)) return;
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const parts = pathname.split('/').filter(Boolean); // api, units, :id, move
        const id = parts[2];
        readJsonBody(req).then(body => {
            const newParentId = normalizeText(body.newParentId, 80);
            const unit = db.prepare('SELECT * FROM units WHERE id=?').get(id);
            if (!unit || unit.deleted_at) return sendJson(res, 404, { error: 'Unit not found' });
            if (!newParentId) return sendJson(res, 400, { error: 'newParentId is required' });
            const parent = db.prepare('SELECT * FROM units WHERE id=?').get(newParentId);
            if (!parent || parent.deleted_at) return sendJson(res, 400, { error: 'newParentId not found' });
            if ((parent.level + 1) !== unit.level) return sendJson(res, 400, { error: 'unit level must be parent level + 1' });

            // cycle check: walk up parent chain from newParentId
            let cur = parent;
            const seen = new Set();
            while (cur) {
                if (cur.id === unit.id) return sendJson(res, 400, { error: 'move would create a cycle' });
                if (seen.has(cur.id)) break;
                seen.add(cur.id);
                if (!cur.parent_id) break;
                cur = db.prepare('SELECT * FROM units WHERE id=?').get(cur.parent_id);
            }

            db.prepare('UPDATE units SET parent_id=?, updated_at=? WHERE id=?').run(newParentId, nowIso(), id);
            const row = db.prepare('SELECT * FROM units WHERE id=?').get(id);
            sendJson(res, 200, row);
        }).catch(err => {
            sendJson(res, err && err.code === 'INVALID_JSON' ? 400 : 500, { error: err && err.code === 'INVALID_JSON' ? 'Invalid JSON' : 'Request failed' });
        });
        return;
    }

    if (pathname.startsWith('/api/units/') && req.method === 'POST' && pathname.endsWith('/place')) {
        if (!requireAuthenticatedUser(req, res)) return;
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const parts = pathname.split('/').filter(Boolean); // api, units, :id, place
        const id = parts[2];
        readJsonBody(req).then(body => {
            const lat = Number(body.lat);
            const lng = Number(body.lng);
            if (!Number.isFinite(lat) || lat < -90 || lat > 90) return sendJson(res, 400, { error: 'lat must be a number in [-90, 90]' });
            if (!Number.isFinite(lng) || lng < -180 || lng > 180) return sendJson(res, 400, { error: 'lng must be a number in [-180, 180]' });
            const unit = db.prepare('SELECT * FROM units WHERE id=?').get(id);
            if (!unit || unit.deleted_at) return sendJson(res, 404, { error: 'Unit not found' });
            const t = nowIso();
            db.prepare('UPDATE units SET lat=?, lng=?, placed_at=?, updated_at=? WHERE id=?').run(lat, lng, t, t, id);
            const row = db.prepare('SELECT * FROM units WHERE id=?').get(id);
            sendJson(res, 200, row);
        }).catch(err => {
            sendJson(res, err && err.code === 'INVALID_JSON' ? 400 : 500, { error: err && err.code === 'INVALID_JSON' ? 'Invalid JSON' : 'Request failed' });
        });
        return;
    }

    if (pathname.startsWith('/api/units/') && req.method === 'POST' && pathname.endsWith('/unplace')) {
        if (!requireAuthenticatedUser(req, res)) return;
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const parts = pathname.split('/').filter(Boolean); // api, units, :id, unplace
        const id = parts[2];
        const unit = db.prepare('SELECT * FROM units WHERE id=?').get(id);
        if (!unit) { sendJson(res, 404, { error: 'Unit not found' }); return; }
        const t = nowIso();
        db.prepare('UPDATE units SET lat=NULL, lng=NULL, placed_at=NULL, updated_at=? WHERE id=?').run(t, id);
        const row = db.prepare('SELECT * FROM units WHERE id=?').get(id);
        sendJson(res, 200, row);
        return;
    }

    if (pathname.startsWith('/api/units/') && req.method === 'POST' && pathname.endsWith('/delete')) {
        if (!requireAuthenticatedUser(req, res)) return;
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const parts = pathname.split('/').filter(Boolean); // api, units, :id, delete
        const id = parts[2];
        const unit = db.prepare('SELECT * FROM units WHERE id=?').get(id);
        if (!unit || unit.deleted_at) { sendJson(res, 404, { error: 'Unit not found' }); return; }

        const all = db.prepare('SELECT id, parent_id FROM units').all();
        const childMap = new Map();
        for (const r of all) {
            const pid = r.parent_id || null;
            if (!childMap.has(pid)) childMap.set(pid, []);
            childMap.get(pid).push(r.id);
        }
        const toDelete = [];
        (function walk(curId) {
            toDelete.push(curId);
            const kids = childMap.get(curId) || [];
            for (const k of kids) walk(k);
        })(id);

        const t = nowIso();
        const stmt = db.prepare('UPDATE units SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL');
        const tx = db.transaction(() => {
            for (const uid of toDelete) stmt.run(t, t, uid);
        });
        tx();
        sendJson(res, 200, { id, deletedAt: t, affected: toDelete.length });
        return;
    }

    if (pathname.startsWith('/api/units/') && req.method === 'POST' && pathname.endsWith('/restore')) {
        if (!requireAuthenticatedUser(req, res)) return;
        const db = initUnitsDb();
        if (!db) { sendJson(res, 500, { error: 'Units DB unavailable' }); return; }
        const parts = pathname.split('/').filter(Boolean); // api, units, :id, restore
        const id = parts[2];
        const unit = db.prepare('SELECT * FROM units WHERE id=?').get(id);
        if (!unit) { sendJson(res, 404, { error: 'Unit not found' }); return; }

        // restore just this node (children remain as-is; if they were deleted by cascade, restore them too)
        const all = db.prepare('SELECT id, parent_id FROM units').all();
        const childMap = new Map();
        for (const r of all) {
            const pid = r.parent_id || null;
            if (!childMap.has(pid)) childMap.set(pid, []);
            childMap.get(pid).push(r.id);
        }
        const toRestore = [];
        (function walk(curId) {
            toRestore.push(curId);
            const kids = childMap.get(curId) || [];
            for (const k of kids) walk(k);
        })(id);

        const t = nowIso();
        const stmt = db.prepare('UPDATE units SET deleted_at=NULL, updated_at=? WHERE id=?');
        const tx = db.transaction(() => {
            for (const uid of toRestore) stmt.run(t, uid);
        });
        tx();
        const row = db.prepare('SELECT * FROM units WHERE id=?').get(id);
        sendJson(res, 200, { unit: row, affected: toRestore.length });
        return;
    }

    // --- Static files (including /uploads and /maps) ---
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
    }

    let urlPath = decodeURIComponent(pathname);
    if (urlPath === '/') urlPath = '/index.html';
    if (urlPath === '/app') urlPath = '/app.html';

    // When packaged, /uploads and /maps live outside the asar (in %APPDATA%\rmooz\).
    // Route these explicitly before the generic ROOT fallback.
    let filePath;
    if (urlPath.startsWith('/uploads/')) {
        const candidate = path.join(UPLOAD_DIR, path.basename(urlPath));
        if (candidate.startsWith(UPLOAD_DIR)) filePath = candidate;
    } else if (urlPath.startsWith('/maps/')) {
        const candidate = path.join(MAPS_DIR, urlPath.slice('/maps/'.length));
        if (candidate.startsWith(MAPS_DIR)) filePath = candidate;
    }

    if (!filePath) {
        // App HTML/CSS/JS live in client/; lib, assets, vendor stay at project root.
        // Try client/ first; if not found there, fall back to project root.
        const clientFilePath = path.join(CLIENT_DIR, urlPath);
        const rootFilePath   = path.join(ROOT, urlPath);

        if (clientFilePath.startsWith(CLIENT_DIR) && fs.existsSync(clientFilePath)) {
            filePath = clientFilePath;
        } else if (rootFilePath.startsWith(ROOT)) {
            filePath = rootFilePath;
        } else {
            res.writeHead(403); res.end(); return;
        }
    }

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath).toLowerCase();
        const headers = {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            // Development app: always serve the latest JS/CSS/HTML so UI behavior
            // changes are visible on a normal refresh during interactive debugging.
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        };
        // Force download for /uploads/ files so they save to disk instead of opening
        if (urlPath.startsWith('/uploads/')) {
            const filename = path.basename(urlPath);
            headers['Content-Disposition'] = 'attachment; filename="' + filename.replace(/"/g, '\\"') + '"';
        }
        res.writeHead(200, headers);
        res.end(data);
    });
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error('Port ' + PORT + ' is already in use. Stop the other process (e.g. lsof -ti :' + PORT + ' | xargs kill) or set PORT=8001 before starting.');
    } else {
        console.error(err);
    }
    process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
    const base = 'http://localhost:' + PORT;
    console.log('Web server running at ' + base + ' (LAN accessible)');
    console.log('  Open workspace: ' + base + '/app.html');
    console.log('  Landing page:   ' + base + '/');
});
