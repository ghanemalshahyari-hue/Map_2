/**
 * Static file server + simple LAN-only chat API (Node.js built-ins only)
 * Run from project root: node server/web-server.js  OR  npm run serve
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

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

http.createServer((req, res) => {
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
}).listen(PORT, '0.0.0.0', () => {
    console.log('Web server running at http://localhost:' + PORT + ' (LAN accessible)');
});
