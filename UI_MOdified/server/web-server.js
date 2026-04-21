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

const PORT = 8000;
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

// -------------------- Units DB (SQLite) --------------------
const UNITS_DB_FILE = process.env.RMOOZ_UNITS_DB_FILE || path.join(DATA_DIR, 'units.db');
let unitsDb = null;

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

function initUnitsDb() {
    if (!Database) return null;
    if (unitsDb) return unitsDb;
    try {
        unitsDb = new Database(UNITS_DB_FILE);
        unitsDb.pragma('journal_mode = WAL');
        unitsDb.exec(`
            CREATE TABLE IF NOT EXISTS units (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 4),
                parent_id TEXT NULL,
                sidc TEXT NULL,
                unit_type TEXT NULL,
                size TEXT NULL,
                deleted_at TEXT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_units_parent  ON units(parent_id);
            CREATE INDEX IF NOT EXISTS idx_units_level   ON units(level);
            CREATE INDEX IF NOT EXISTS idx_units_deleted ON units(deleted_at);
        `);
        // Safe migration: add side column if it doesn't exist yet
        try { unitsDb.exec(`ALTER TABLE units ADD COLUMN side TEXT NULL DEFAULT 'friendly'`); } catch (_) {}
        return unitsDb;
    } catch (e) {
        unitsDb = null;
        return null;
    }
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
    try {
        fs.writeFileSync(CHAT_FILE, JSON.stringify(messages, null, 2), 'utf8');
    } catch {
        // ignore write errors in this minimal server
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
    try {
        const buf = fs.readFileSync(CHAT_USERS_FILE, 'utf8');
        const d = JSON.parse(buf);
        return typeof d === 'object' && d !== null ? d : {};
    } catch {
        return {};
    }
}

function writeChatUsers(data) {
    try {
        fs.writeFileSync(CHAT_USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch {}
}

function readChatPresence() {
    try {
        const buf = fs.readFileSync(CHAT_PRESENCE_FILE, 'utf8');
        const d = JSON.parse(buf);
        return d && typeof d === 'object' && d !== null ? d : {};
    } catch {
        return {};
    }
}

function writeChatPresence(data) {
    try {
        fs.writeFileSync(CHAT_PRESENCE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch {}
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
    try {
        const buf = fs.readFileSync(CHAT_GROUPS_FILE, 'utf8');
        const d = JSON.parse(buf);
        return d && typeof d.groups === 'object' ? d : { groups: {} };
    } catch {
        return { groups: {} };
    }
}

function writeChatGroupsStore(store) {
    try {
        fs.writeFileSync(CHAT_GROUPS_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch {}
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
    const pathname = url.pathname;

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
                const all = readAllMessages();
                all.push(msg);
                writeAllMessages(all);
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
            const store = readChatGroupsStore();
            const groupId = 'grp-' + crypto.randomBytes(16).toString('hex');
            const inviteCode = generateInviteCode();
            store.groups[groupId] = {
                id: groupId,
                name,
                inviteCode,
                members: [cid],
                createdBy: cid,
                createdAt: new Date().toISOString()
            };
            writeChatGroupsStore(store);
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
            const store = readChatGroupsStore();
            const g = findGroupByInviteCode(store, parsed.inviteCode);
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            if (!g) {
                res.writeHead(404, h);
                res.end(JSON.stringify({ error: 'Invalid invite code' }));
                return;
            }
            if (!Array.isArray(g.members)) g.members = [];
            if (!membersIncludes(g.members, cid)) g.members.push(cid);
            writeChatGroupsStore(store);
            res.writeHead(200, h);
            res.end(JSON.stringify({ groupId: g.id, name: g.name }));
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
            const newCode = normalizeInviteCodeInput(parsed.inviteCode);
            if (!isValidCustomInviteCode(newCode)) {
                res.writeHead(400, h);
                res.end(JSON.stringify({ error: 'Invite code must be 3–40 characters (letters, numbers, _ or - only)' }));
                return;
            }
            const taken = findGroupByInviteCode(store, newCode);
            if (taken && normalizeMemberId(taken.id) !== normalizeMemberId(g.id)) {
                res.writeHead(409, h);
                res.end(JSON.stringify({ error: 'That invite code is already used by another group' }));
                return;
            }
            g.inviteCode = newCode;
            writeChatGroupsStore(store);
            res.writeHead(200, h);
            res.end(JSON.stringify({ groupId: g.id, inviteCode: g.inviteCode }));
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
            g.members = membersRemove(g.members, cid);
            const groupDeleted = g.members.length === 0;
            if (groupDeleted) {
                const sk = storageKeyForGroup(store, g) || groupId;
                delete store.groups[sk];
            }
            writeChatGroupsStore(store);
            res.writeHead(200, h);
            res.end(JSON.stringify({ ok: true, groupDeleted }));
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
            const store = readChatGroupsStore();
            const g = findGroupByRoomId(store, groupId);
            const h = { 'Content-Type': 'application/json; charset=utf-8' };
            if (isNew) h['Set-Cookie'] = setCookieHeader(cid);
            if (!g || groupId === PUBLIC_CHAT_ROOM) {
                res.writeHead(404, h);
                res.end(JSON.stringify({ error: 'Group not found' }));
                return;
            }
            if (g.createdBy && normalizeMemberId(g.createdBy) !== normalizeMemberId(cid)) {
                res.writeHead(403, h);
                res.end(JSON.stringify({ error: 'Only the group creator can delete it' }));
                return;
            }
            const delKey = storageKeyForGroup(store, g) || groupId;
            delete store.groups[delKey];
            writeChatGroupsStore(store);
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
            const presence = readChatPresence();
            if (!presence[roomId] || typeof presence[roomId] !== 'object') presence[roomId] = {};
            presence[roomId][cid] = { name, at: new Date().toISOString() };
            pruneStaleChatPresence(presence, CHAT_PRESENCE_MAX_MS);
            writeChatPresence(presence);
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
        const presence = readChatPresence();
        pruneStaleChatPresence(presence, CHAT_PRESENCE_MAX_MS);
        writeChatPresence(presence);
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

    // --- Chat API: user identity (cookie + chat-users.json) ---
    if (pathname === '/api/chat/me') {
        const { cid } = getOrCreateClientCookieId(req);
        const meHeaders = {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': setCookieHeader(cid)
        };

        if (req.method === 'GET') {
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
                const users = readChatUsers();
                users[cid] = {
                    id: parsed.id || users[cid]?.id || cid,
                    name: String(parsed.name || users[cid]?.name || 'Planner 1').trim() || 'Planner 1',
                    role: parsed.role || users[cid]?.role || 'planner'
                };
                writeChatUsers(users);
                res.writeHead(200, meHeaders);
                res.end(JSON.stringify(users[cid]));
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

    if (pathname.startsWith('/api/units/') && req.method === 'POST' && pathname.endsWith('/delete')) {
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
    let urlPath = decodeURIComponent(url.pathname);
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
