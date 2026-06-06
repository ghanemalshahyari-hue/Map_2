/**
 * Unified app SQLite (auth, plans metadata, prefs, chat) + units in one file.
 * Plan bodies live as GeoJSON files under DATA_DIR/users/<userId>/plans/<planId>.geojson
 * (legacy .json files are auto-migrated to .geojson at startup and on first write).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const planMigrate = require('../client/plan-migrate.js');

const SESSION_COOKIE = 'rmooz_session';
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
// Canonical empty plan — a valid GeoJSON FeatureCollection (v3). All new
// plans are written to disk in this shape with the .geojson extension.
const EMPTY_PLAN_JSON = JSON.stringify({
    type: 'FeatureCollection',
    app: { version: 3, appName: 'tactical-map' },
    __layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, active: true }],
    __folders: [],
    features: []
}, null, 2);

let _db = null;
let _dataDir = null;
let _legacyUnitsPath = null;

function nowIso() {
    return new Date().toISOString();
}

function genId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'u-' + Date.now().toString(36) + '-' + crypto.randomBytes(12).toString('hex');
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored || typeof stored !== 'string' || !stored.startsWith('scrypt:')) return false;
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    try {
        const h = crypto.scryptSync(String(password), salt, 64).toString('hex');
        if (hash.length !== h.length) return false;
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(h, 'hex'));
    } catch {
        return false;
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
        const k = decodeURIComponent(part.slice(0, eq).trim());
        const v = decodeURIComponent(part.slice(eq + 1).trim());
        if (k) out[k] = v;
    });
    return out;
}

function sessionCookieHeader(sessionId, maxAgeSec = SESSION_MAX_AGE_SEC) {
    return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Max-Age=${maxAgeSec}; SameSite=Lax`;
}

function clearSessionCookieHeader() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`;
}

function planDirForUser(userId) {
    const safe = String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) throw new Error('invalid user');
    const dir = path.join(_dataDir, 'users', safe, 'plans');
    return dir;
}

// Canonical storage path uses .geojson. Reads fall back to legacy .json for
// files that haven't been migrated yet (migrateLegacyPlanFiles handles bulk
// rename at startup; the PUT handler also rewrites to .geojson on first save).
function planFilePath(userId, planId) {
    const pid = String(planId || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!pid) throw new Error('invalid plan');
    return path.join(planDirForUser(userId), pid + '.geojson');
}

function legacyPlanFilePath(userId, planId) {
    const pid = String(planId || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!pid) throw new Error('invalid plan');
    return path.join(planDirForUser(userId), pid + '.json');
}

// Return whichever of the two plan-file paths exists, preferring the modern
// .geojson. Used by GET / DELETE paths that need to find the current file.
function resolvePlanFilePath(userId, planId) {
    const modern = planFilePath(userId, planId);
    if (fs.existsSync(modern)) return modern;
    const legacy = legacyPlanFilePath(userId, planId);
    if (fs.existsSync(legacy)) return legacy;
    return modern; // caller handles ENOENT
}

function atomicWriteFile(filePath, contents) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp.' + process.pid + '.' + Date.now();
    fs.writeFileSync(tmp, contents, 'utf8');
    fs.renameSync(tmp, filePath);
}

function migrateLegacyUnits(db) {
    const legacy = _legacyUnitsPath;
    if (!legacy || !fs.existsSync(legacy)) return;
    const cnt = db.prepare('SELECT COUNT(*) AS c FROM units').get();
    if (cnt && cnt.c > 0) return;
    let other;
    try {
        const Database = require('better-sqlite3');
        other = new Database(legacy, { readonly: true });
    } catch {
        return;
    }
    try {
        const rows = other.prepare('SELECT * FROM units').all();
        const ins = db.prepare(
            'INSERT OR REPLACE INTO units (id, code, name, level, parent_id, sidc, unit_type, size, deleted_at, created_at, updated_at, side) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        const tx = db.transaction(() => {
            for (const r of rows) {
                ins.run(
                    r.id, r.code, r.name, r.level, r.parent_id || null, r.sidc || null, r.unit_type || null,
                    r.size || null, r.deleted_at || null, r.created_at, r.updated_at, r.side != null ? r.side : 'friendly'
                );
            }
        });
        tx();
    } finally {
        try { other.close(); } catch {}
    }
}

function migrateLegacyChatFromFiles(db, dataDir) {
    const has = db.prepare("SELECT COUNT(*) AS c FROM chat_messages").get();
    if (has && has.c > 0) return;

    const CHAT_FILE = path.join(dataDir, 'chat-messages.json');
    const CHAT_USERS_FILE = path.join(dataDir, 'chat-users.json');
    const CHAT_GROUPS_FILE = path.join(dataDir, 'chat-groups.json');
    const CHAT_PRESENCE_FILE = path.join(dataDir, 'chat-presence.json');

    try {
        const buf = fs.readFileSync(CHAT_FILE, 'utf8');
        const data = JSON.parse(buf);
        const messages = Array.isArray(data) ? data : (data.messages || []);
        const insM = db.prepare(
            'INSERT OR IGNORE INTO chat_messages (id, room_id, user_id, user_name, role, text, timestamp, extra_json) VALUES (?,?,?,?,?,?,?,?)'
        );
        const tx = db.transaction(() => {
            for (const m of messages) {
                insM.run(
                    m.id || genId(),
                    m.roomId || 'default-ops-room',
                    m.userId || null,
                    m.userName || null,
                    m.role || null,
                    String(m.text || ''),
                    m.timestamp || nowIso(),
                    null
                );
            }
        });
        tx();
    } catch {}

    try {
        const users = JSON.parse(fs.readFileSync(CHAT_USERS_FILE, 'utf8'));
        const insU = db.prepare('INSERT OR REPLACE INTO chat_users_map (client_id, user_json) VALUES (?,?)');
        const tx = db.transaction(() => {
            for (const cid of Object.keys(users || {})) {
                insU.run(cid, JSON.stringify(users[cid]));
            }
        });
        tx();
    } catch {}

    try {
        const store = JSON.parse(fs.readFileSync(CHAT_GROUPS_FILE, 'utf8'));
        const groups = (store && store.groups) || {};
        const insG = db.prepare('INSERT OR REPLACE INTO chat_groups (storage_key, payload_json) VALUES (?,?)');
        const tx = db.transaction(() => {
            for (const sk of Object.keys(groups)) {
                insG.run(sk, JSON.stringify(groups[sk]));
            }
        });
        tx();
    } catch {}

    try {
        const presence = JSON.parse(fs.readFileSync(CHAT_PRESENCE_FILE, 'utf8'));
        const insP = db.prepare('INSERT OR REPLACE INTO chat_presence_rows (room_id, client_id, name, at) VALUES (?,?,?,?)');
        const tx = db.transaction(() => {
            for (const rid of Object.keys(presence || {})) {
                const room = presence[rid] || {};
                for (const cid of Object.keys(room)) {
                    const ent = room[cid] || {};
                    insP.run(rid, cid, ent.name || '', ent.at || nowIso());
                }
            }
        });
        tx();
    } catch {}
}

function createSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            role TEXT DEFAULT 'planner',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id);

        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id TEXT PRIMARY KEY,
            json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

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
            updated_at TEXT NOT NULL,
            side TEXT NULL DEFAULT 'friendly'
        );
        CREATE INDEX IF NOT EXISTS idx_units_parent ON units(parent_id);
        CREATE INDEX IF NOT EXISTS idx_units_level ON units(level);
        CREATE INDEX IF NOT EXISTS idx_units_deleted ON units(deleted_at);

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            user_id TEXT,
            user_name TEXT,
            role TEXT,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            extra_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id);

        CREATE TABLE IF NOT EXISTS chat_groups (
            storage_key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_users_map (
            client_id TEXT PRIMARY KEY,
            user_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_presence_rows (
            room_id TEXT NOT NULL,
            client_id TEXT NOT NULL,
            name TEXT,
            at TEXT NOT NULL,
            PRIMARY KEY (room_id, client_id)
        );

        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
    try { db.exec(`ALTER TABLE units ADD COLUMN side TEXT NULL DEFAULT 'friendly'`); } catch (_) {}
    try { db.exec(`ALTER TABLE units ADD COLUMN lat REAL NULL`); } catch (_) {}
    try { db.exec(`ALTER TABLE units ADD COLUMN lng REAL NULL`); } catch (_) {}
    try { db.exec(`ALTER TABLE units ADD COLUMN placed_at TEXT NULL`); } catch (_) {}
}

// Generate a URL-safe random password. 16 bytes of base64url ≈ 128 bits of
// entropy. We strip + / = so the password copies cleanly out of a text file
// without shell-escaping headaches.
function generateBootstrapPassword() {
    return crypto.randomBytes(16).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Write the one-time bootstrap password to DATA_DIR/BOOTSTRAP_PASSWORD.txt
// with mode 0600 (owner-only on POSIX; on Windows ACLs from the parent dir
// apply). We deliberately do NOT print the password to stdout — log capture
// systems (systemd journal, Docker, Electron debug log) would otherwise
// retain admin credentials in cleartext indefinitely.
function writeBootstrapPasswordFile(password) {
    const filePath = path.join(_dataDir, 'BOOTSTRAP_PASSWORD.txt');
    const body =
        '# rmooz first-time bootstrap administrator password\r\n' +
        '#\r\n' +
        '# Username: admin\r\n' +
        '# Password: ' + password + '\r\n' +
        '#\r\n' +
        '# Log in once with these credentials, change the password from the\r\n' +
        '# Users panel, then DELETE THIS FILE. To skip random generation on\r\n' +
        '# the next first-run, set the RMOOZ_BOOTSTRAP_PASSWORD env var\r\n' +
        '# before starting the server.\r\n';
    // Two-step write: open with O_CREAT|O_EXCL|O_WRONLY at 0600 so the file is
    // never world-readable even briefly. If something already wrote the file
    // (e.g. previous failed bootstrap), refuse rather than overwrite.
    const fd = fs.openSync(filePath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    try {
        fs.writeSync(fd, body);
    } finally {
        fs.closeSync(fd);
    }
    // Belt and braces — re-apply 0600 in case umask widened it on creation.
    try { fs.chmodSync(filePath, 0o600); } catch (_) { /* Windows: no-op */ }
    return filePath;
}

function ensureBootstrapUser(db) {
    const username = 'admin';
    const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
    if (existing) return;
    const id = genId();
    const t = nowIso();

    // Source of truth for the password:
    //   1. RMOOZ_BOOTSTRAP_PASSWORD env var (operator-supplied) — silent.
    //   2. Otherwise, a freshly generated random password — written to a
    //      0600 file so the operator can read it once, then delete it.
    // The previous default ('admin') is removed: shipping a known credential
    // means any LAN reachable copy of rmooz is one guess away from admin.
    const envPassword = process.env.RMOOZ_BOOTSTRAP_PASSWORD;
    const password = envPassword && String(envPassword).length > 0
        ? String(envPassword)
        : generateBootstrapPassword();

    db.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run(id, username, hashPassword(password), 'Administrator', 'planner', t, t);

    if (envPassword) {
        console.log('[app-data] Created bootstrap user "' + username + '" using RMOOZ_BOOTSTRAP_PASSWORD env var.');
        return;
    }
    try {
        const filePath = writeBootstrapPasswordFile(password);
        console.log('[app-data] Created bootstrap user "' + username + '". One-time password written to ' + filePath + ' (read it, change the password in the Users panel, then DELETE that file).');
    } catch (err) {
        // Last-resort fallback: if the file can't be written, the operator has
        // no way to log in. Print to stderr (not stdout) with a clear warning,
        // and DROP the bootstrap user we just created so the next start can
        // try again — better than leaving an unknown-password admin account.
        try {
            db.prepare('DELETE FROM users WHERE id=?').run(id);
        } catch (_) { /* ignore — we'll surface the original error */ }
        console.error('[app-data] FAILED to write bootstrap password file at ' + path.join(_dataDir, 'BOOTSTRAP_PASSWORD.txt') + ': ' + (err && err.message ? err.message : err));
        console.error('[app-data] Bootstrap user not created. Set RMOOZ_BOOTSTRAP_PASSWORD and restart, or fix the data dir permissions.');
    }
}

/**
 * @param {{ Database: import('better-sqlite3'), dataDir: string, legacyUnitsFile?: string }} opts
 */
// LDAP-AUTH-2: additive column migration for LDAP user fields.
// Each ALTER TABLE is idempotent — SQLite throws "duplicate column" if it already exists,
// which we catch silently. Safe to run on every startup.
function migrateUsersTableV2(db) {
    try { db.exec("ALTER TABLE users ADD COLUMN auth_backend TEXT DEFAULT 'local'"); } catch {}
    try { db.exec('ALTER TABLE users ADD COLUMN upn TEXT'); } catch {}
    try { db.exec('ALTER TABLE users ADD COLUMN title TEXT'); } catch {}
}

function initAppData(opts) {
    const Database = opts.Database;
    if (!Database) return null;
    _dataDir = opts.dataDir;
    _legacyUnitsPath = opts.legacyUnitsFile || path.join(_dataDir, 'units.db');
    const appDbFile = process.env.RMOOZ_APP_DB_FILE || path.join(_dataDir, 'app.db');
    try {
        fs.mkdirSync(_dataDir, { recursive: true });
    } catch {}
    _db = new Database(appDbFile);
    _db.pragma('journal_mode = WAL');
    createSchema(_db);
    migrateUsersTableV2(_db);
    migrateLegacyUnits(_db);
    migrateLegacyChatFromFiles(_db, _dataDir);
    ensureBootstrapUser(_db);
    migrateLegacyPlanFiles();
    return _db;
}

// One-shot startup migration: every DATA_DIR/users/<uid>/plans/*.json is
// renamed to .geojson, and v2 content (the legacy `{version:2,layers:...}`
// shape) is upgraded in place to a v3 GeoJSON FeatureCollection. Safe to
// re-run — files already ending in .geojson are skipped.
function migrateLegacyPlanFiles() {
    if (!_dataDir) return;
    const usersDir = path.join(_dataDir, 'users');
    let userDirs;
    try { userDirs = fs.readdirSync(usersDir, { withFileTypes: true }); }
    catch { return; }
    let renamed = 0, upgraded = 0;
    for (const ent of userDirs) {
        if (!ent.isDirectory()) continue;
        const plansDir = path.join(usersDir, ent.name, 'plans');
        let files;
        try { files = fs.readdirSync(plansDir); }
        catch { continue; }
        for (const name of files) {
            if (!name.endsWith('.json')) continue;
            const srcPath = path.join(plansDir, name);
            const dstPath = path.join(plansDir, name.slice(0, -5) + '.geojson');
            // If both exist (unlikely), prefer the already-migrated .geojson
            // and drop the legacy twin.
            if (fs.existsSync(dstPath)) {
                try { fs.unlinkSync(srcPath); } catch {}
                continue;
            }
            let txt;
            try { txt = fs.readFileSync(srcPath, 'utf8'); }
            catch { continue; }
            let parsed;
            try { parsed = JSON.parse(txt); }
            catch {
                // Unparsable file — rename to preserve data, don't touch content.
                try { fs.renameSync(srcPath, dstPath); renamed++; }
                catch {}
                continue;
            }
            let out;
            if (planMigrate.isV3FeatureCollection(parsed)) {
                out = parsed;
            } else if (planMigrate.isV2Plan(parsed)) {
                try { out = planMigrate.migrateV2PlanToV3(parsed); upgraded++; }
                catch { out = parsed; }
            } else {
                out = parsed; // unknown shape — keep as-is, just change extension
            }
            try {
                atomicWriteFile(dstPath, JSON.stringify(out, null, 2));
                fs.unlinkSync(srcPath);
                renamed++;
            } catch {}
        }
    }
    if (renamed > 0) {
        // Log only when work actually happened so repeat boots stay quiet.
        console.log(`[plan-migrate] Renamed ${renamed} .json plan file(s) to .geojson (${upgraded} upgraded from v2 content).`);
    }
}

function getDb() {
    return _db;
}

function getSessionUser(req) {
    const db = getDb();
    if (!db) return null;
    const cookies = parseCookies(req);
    const sid = cookies[SESSION_COOKIE];
    if (!sid) return null;
    const row = db.prepare(`
        SELECT u.id AS user_id, u.username, u.display_name, u.role,
               u.auth_backend, u.upn, u.title
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?
    `).get(sid, Date.now());
    if (!row) return null;
    return {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role || 'planner',
        authBackend: row.auth_backend || 'local',
        upn: row.upn || null,
        title: row.title || null
    };
}

function readAllMessagesDb() {
    const db = getDb();
    if (!db) return [];
    const rows = db.prepare(
        'SELECT id, room_id AS roomId, user_id AS userId, user_name AS userName, role, text, timestamp FROM chat_messages ORDER BY timestamp ASC'
    ).all();
    return rows.map(r => ({
        id: r.id,
        roomId: r.roomId || 'default-ops-room',
        userId: r.userId || 'unknown',
        userName: r.userName || r.userId || 'Unknown',
        role: r.role || '',
        text: r.text || '',
        timestamp: r.timestamp
    }));
}

function writeAllMessagesDb(messages) {
    const db = getDb();
    if (!db) return;
    const del = db.prepare('DELETE FROM chat_messages');
    const ins = db.prepare(
        'INSERT INTO chat_messages (id, room_id, user_id, user_name, role, text, timestamp, extra_json) VALUES (?,?,?,?,?,?,?,NULL)'
    );
    const tx = db.transaction(() => {
        del.run();
        for (const m of messages) {
            ins.run(
                m.id || genId(),
                m.roomId || 'default-ops-room',
                m.userId || null,
                m.userName || null,
                m.role || null,
                m.text || '',
                m.timestamp || nowIso()
            );
        }
    });
    tx.immediate();
}

function appendMessageDb(msg) {
    const db = getDb();
    if (!db) return;
    db.prepare(
        'INSERT INTO chat_messages (id, room_id, user_id, user_name, role, text, timestamp, extra_json) VALUES (?,?,?,?,?,?,?,NULL)'
    ).run(
        msg.id || genId(),
        msg.roomId || 'default-ops-room',
        msg.userId || null,
        msg.userName || null,
        msg.role || null,
        msg.text || '',
        msg.timestamp || nowIso()
    );
}

function readChatUsersDb() {
    const db = getDb();
    if (!db) return {};
    const rows = db.prepare('SELECT client_id, user_json FROM chat_users_map').all();
    const out = {};
    for (const r of rows) {
        try { out[r.client_id] = JSON.parse(r.user_json); } catch { out[r.client_id] = {}; }
    }
    return out;
}

function writeChatUsersDb(data) {
    const db = getDb();
    if (!db) return;
    const ins = db.prepare('INSERT OR REPLACE INTO chat_users_map (client_id, user_json) VALUES (?,?)');
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM chat_users_map').run();
        for (const k of Object.keys(data || {})) {
            ins.run(k, JSON.stringify(data[k]));
        }
    });
    tx.immediate();
}

function readChatPresenceDb() {
    const db = getDb();
    if (!db) return {};
    const rows = db.prepare('SELECT room_id, client_id, name, at FROM chat_presence_rows').all();
    const presence = {};
    for (const r of rows) {
        if (!presence[r.room_id]) presence[r.room_id] = {};
        presence[r.room_id][r.client_id] = { name: r.name || '', at: r.at };
    }
    return presence;
}

function writeChatPresenceDb(data) {
    const db = getDb();
    if (!db) return;
    const ins = db.prepare('INSERT OR REPLACE INTO chat_presence_rows (room_id, client_id, name, at) VALUES (?,?,?,?)');
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM chat_presence_rows').run();
        for (const rid of Object.keys(data || {})) {
            const room = data[rid] || {};
            for (const cid of Object.keys(room)) {
                const ent = room[cid] || {};
                ins.run(rid, cid, ent.name || '', ent.at || nowIso());
            }
        }
    });
    tx.immediate();
}

function readChatGroupsStoreDb() {
    const db = getDb();
    if (!db) return { groups: {} };
    const rows = db.prepare('SELECT storage_key, payload_json FROM chat_groups').all();
    const groups = {};
    for (const r of rows) {
        try { groups[r.storage_key] = JSON.parse(r.payload_json); } catch {}
    }
    return { groups };
}

function writeChatGroupsStoreDb(store) {
    const db = getDb();
    if (!db) return;
    const ins = db.prepare('INSERT OR REPLACE INTO chat_groups (storage_key, payload_json) VALUES (?,?)');
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM chat_groups').run();
        for (const sk of Object.keys(store.groups || {})) {
            ins.run(sk, JSON.stringify(store.groups[sk]));
        }
    });
    tx.immediate();
}

// ── Atomic chat read-modify-write helpers ──────────────────────────────
//
// Why these exist: every route that mutates groups / users / presence
// previously did `read → modify in JS → writeAll`. Even though Node is
// single-threaded today and better-sqlite3 calls are synchronous (so the
// read and the write run in the same microtask), there are two real ways
// for that pattern to lose data:
//
//   1. Anyone adds an `await` between the read and the write — a future
//      refactor, or moving to a different DB driver — and concurrent
//      requests start interleaving.
//   2. The server is run multi-process (cluster, multiple Electron
//      windows sharing app.db, etc.) and two writers race at the OS
//      level on the same SQLite file.
//
// The fix is to do the read AND the write inside one IMMEDIATE
// transaction. BEGIN IMMEDIATE acquires the SQLite write lock up front,
// so concurrent transactions serialize on it instead of overwriting
// each other.

// Run a read-modify-write of the full chat_groups store inside one
// IMMEDIATE transaction. The mutator receives a fresh `{ groups }`
// object read inside the transaction; whatever it leaves in `store`
// is what gets persisted. The mutator's return value is forwarded to
// the caller, so it can signal "not found" / "permission denied" /
// the new group id, etc.
function updateChatGroupsAtomic(mutator) {
    const db = getDb();
    if (!db) return null;
    const tx = db.transaction(() => {
        const rows = db.prepare('SELECT storage_key, payload_json FROM chat_groups').all();
        const store = { groups: {} };
        for (const r of rows) {
            try { store.groups[r.storage_key] = JSON.parse(r.payload_json); } catch { /* skip corrupt */ }
        }
        const ret = mutator(store);
        // Diff would be nicer, but the table is tiny and DELETE+INSERT
        // inside the same transaction is still atomic to outside readers.
        db.prepare('DELETE FROM chat_groups').run();
        const ins = db.prepare('INSERT OR REPLACE INTO chat_groups (storage_key, payload_json) VALUES (?,?)');
        for (const sk of Object.keys(store.groups || {})) {
            ins.run(sk, JSON.stringify(store.groups[sk]));
        }
        return ret;
    });
    return tx.immediate();
}

// Record a presence ping for one client in one room. Optional maxAgeMs
// triggers a stale-row prune in the same transaction so presence stays
// bounded without a separate maintenance call.
function recordPresenceDb(roomId, clientId, name, maxAgeMs) {
    const db = getDb();
    if (!db) return false;
    const rid = String(roomId || '');
    const cid = String(clientId || '');
    if (!rid || !cid) return false;
    const tx = db.transaction(() => {
        if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
            const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
            db.prepare('DELETE FROM chat_presence_rows WHERE at < ?').run(cutoff);
        }
        db.prepare(
            'INSERT OR REPLACE INTO chat_presence_rows (room_id, client_id, name, at) VALUES (?,?,?,?)'
        ).run(rid, cid, String(name || ''), nowIso());
    });
    tx.immediate();
    return true;
}

// Drop presence rows older than maxAgeMs. Single DELETE — atomic by
// itself; expose it so the members endpoint can trim stale presence
// without a read-modify-write.
function prunePresenceDb(maxAgeMs) {
    const db = getDb();
    if (!db) return 0;
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return 0;
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const r = db.prepare('DELETE FROM chat_presence_rows WHERE at < ?').run(cutoff);
    return r.changes || 0;
}

// Upsert one chat-user row. Single INSERT OR REPLACE — atomic.
function upsertChatUserDb(clientId, userObj) {
    const db = getDb();
    if (!db) return false;
    const cid = String(clientId || '');
    if (!cid) return false;
    db.prepare(
        'INSERT OR REPLACE INTO chat_users_map (client_id, user_json) VALUES (?,?)'
    ).run(cid, JSON.stringify(userObj || {}));
    return true;
}

function handleAuthApi(req, res, pathname, method, sendJson, readJsonBody) {
    if (!pathname.startsWith('/api/auth/')) return false;

    // ── LDAP health endpoint — TCP-only, no credentials, no db required ──────
    // GET /api/auth/ldap-health
    // Returns: { ok, reachable, server, port, domain, timeoutSeconds, latencyMs? }
    // Does NOT require a session cookie. Does NOT perform an LDAP bind.
    if (pathname === '/api/auth/ldap-health' && method === 'GET') {
        let ldapAuth;
        try {
            ldapAuth = require('./auth/ldap-auth');
        } catch (_) {
            sendJson(res, 500, { ok: false, error: 'LDAP module not available' });
            return true;
        }

        let config;
        try {
            config = ldapAuth.getLdapConfig();
        } catch (e) {
            // LDAP_SERVER not configured — still return 200 with reachable: false
            sendJson(res, 200, {
                ok: false,
                reachable: false,
                server: process.env.LDAP_SERVER || '',
                port: Math.abs(parseInt(process.env.LDAP_PORT || '389', 10)) || 389,
                domain: (process.env.LDAP_DOMAIN || 'sss.dir').trim(),
                timeoutSeconds: Math.abs(parseInt(process.env.LDAP_TIMEOUT || '5', 10)) || 5,
                error: 'LDAP_SERVER is not configured'
            });
            return true;
        }

        ldapAuth.checkTcpReachability()
            .then(result => {
                const body = {
                    ok:             result.reachable,
                    reachable:      result.reachable,
                    server:         config.server,
                    port:           config.port,
                    domain:         config.domain,
                    timeoutSeconds: config.timeout,
                    latencyMs:      typeof result.latencyMs === 'number' ? result.latencyMs : null
                };
                if (!result.reachable && result.error) body.error = result.error;
                sendJson(res, 200, body);
            })
            .catch(() => {
                sendJson(res, 200, {
                    ok:             false,
                    reachable:      false,
                    server:         config.server,
                    port:           config.port,
                    domain:         config.domain,
                    timeoutSeconds: config.timeout,
                    latencyMs:      null,
                    error:          'Health check encountered an unexpected error'
                });
            });
        return true;
    }

    // ── Auth config endpoint — public, no db required ────────────────────────
    // GET /api/auth/config → { authBackend: "local"|"ldap" }
    // Does NOT expose LDAP_SERVER, credentials, or internal config.
    if (pathname === '/api/auth/config' && method === 'GET') {
        sendJson(res, 200, {
            authBackend: process.env.RMOOZ_AUTH_BACKEND === 'ldap' ? 'ldap' : 'local'
        });
        return true;
    }

    const db = getDb();
    if (!db) { sendJson(res, 500, { error: 'Database unavailable' }); return true; }

    if (pathname === '/api/auth/register' && method === 'POST') {
        // Registration is not meaningful when LDAP manages all identities.
        if (process.env.RMOOZ_AUTH_BACKEND === 'ldap') {
            sendJson(res, 405, { error: 'Registration is disabled when LDAP authentication is active.' });
            return true;
        }
        readJsonBody(req, { maxBytes: 16000 }).then(body => {
            const username = String(body.username || '').trim().toLowerCase();
            const password = String(body.password || '');
            const displayName = String(body.displayName || body.username || '').trim() || username;
            if (username.length < 2 || username.length > 64) return sendJson(res, 400, { error: 'Invalid username' });
            if (password.length < 4) return sendJson(res, 400, { error: 'Password too short' });
            const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
            if (exists) return sendJson(res, 409, { error: 'Username taken' });
            const id = genId();
            const t = nowIso();
            db.prepare(
                'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
            ).run(id, username, hashPassword(password), displayName, body.role || 'planner', t, t);
            sendJson(res, 201, { id, username, displayName });
        }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
        return true;
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
        readJsonBody(req, { maxBytes: 16000 }).then(body => {
            const rawUsername = String(body.username || '');
            const password    = String(body.password || '');

            // ── LDAP authentication path ──────────────────────────────────────
            if (process.env.RMOOZ_AUTH_BACKEND === 'ldap') {
                let ldapAuth;
                try { ldapAuth = require('./auth/ldap-auth'); }
                catch (_) { return sendJson(res, 503, { error: 'Authentication service unavailable' }); }

                const employeeNumber = ldapAuth.normaliseUsername(rawUsername);
                if (!employeeNumber || !password) {
                    return sendJson(res, 401, { error: 'Invalid credentials' });
                }

                ldapAuth.authenticateLdapUser(employeeNumber, password)
                    .then(result => {
                        if (!result.ok) {
                            const svcErr = result.reason === 'config_error' || result.reason === 'network_error';
                            return sendJson(res, svcErr ? 503 : 401, {
                                error: svcErr ? 'Authentication service unavailable' : 'Invalid credentials'
                            });
                        }
                        const { employeeNumber: en, upn, displayName, title } = result.user;
                        const t = nowIso();

                        // Upsert a lightweight local user row. The session system requires a
                        // users.id reference; LDAP users carry 'ldap:managed' as password_hash
                        // so verifyPassword() never matches them in local-auth mode.
                        let userId;
                        const existing = db.prepare('SELECT id FROM users WHERE username=?').get(en);
                        if (existing) {
                            userId = existing.id;
                            db.prepare(
                                'UPDATE users SET display_name=?, upn=?, title=?, auth_backend=?, updated_at=? WHERE id=?'
                            ).run(displayName, upn, title, 'ldap', t, userId);
                        } else {
                            userId = genId();
                            db.prepare(
                                'INSERT INTO users (id, username, password_hash, display_name, role, auth_backend, upn, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
                            ).run(userId, en, 'ldap:managed', displayName, 'planner', 'ldap', upn, title, t, t);
                        }

                        const sid = genId();
                        const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
                        db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)').run(sid, userId, exp, t);
                        res.writeHead(200, {
                            'Content-Type': 'application/json; charset=utf-8',
                            'Set-Cookie': sessionCookieHeader(sid)
                        });
                        res.end(JSON.stringify({
                            id: userId,
                            username: en,
                            employeeNumber: en,
                            upn,
                            displayName,
                            title,
                            role: 'planner',
                            authBackend: 'ldap'
                        }));
                    })
                    .catch(() => sendJson(res, 503, { error: 'Authentication service unavailable' }));
                return; // end of LDAP path — async continuation above handles the response
            }

            // ── Local (SQLite) authentication path — unchanged ────────────────
            const username = rawUsername.trim().toLowerCase();
            const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
            if (!user || !verifyPassword(password, user.password_hash)) {
                return sendJson(res, 401, { error: 'Invalid credentials' });
            }
            const sid = genId();
            const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
            const t = nowIso();
            db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)').run(sid, user.id, exp, t);
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Set-Cookie': sessionCookieHeader(sid)
            });
            res.end(JSON.stringify({
                id: user.id,
                username: user.username,
                displayName: user.display_name || user.username,
                role: user.role || 'planner'
            }));
        }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
        return true;
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
        const cookies = parseCookies(req);
        const sid = cookies[SESSION_COOKIE];
        if (sid) {
            try { db.prepare('DELETE FROM sessions WHERE id=?').run(sid); } catch {}
        }
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': clearSessionCookieHeader()
        });
        res.end(JSON.stringify({ ok: true }));
        return true;
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
        const u = getSessionUser(req);
        if (!u) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return true;
        }
        const meResp = {
            id:          u.id,
            username:    u.username,
            name:        u.displayName || u.username,
            displayName: u.displayName || u.username,
            role:        u.role,
            authBackend: u.authBackend || 'local'
        };
        if (u.upn)         meResp.upn           = u.upn;
        if (u.title)       meResp.title         = u.title;
        if (u.authBackend === 'ldap') meResp.employeeNumber = u.username;
        sendJson(res, 200, meResp);
        return true;
    }

    return false;
}

function readBodyText(req, maxBytes) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > maxBytes) {
                try { req.destroy(); } catch {}
                reject(Object.assign(new Error('Body too large'), { code: 'BODY_TOO_LARGE' }));
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function handlePlansApi(req, res, url, pathname, method, sendJson, readJsonBody) {
    const isPlansRoute = pathname === '/api/plans' || pathname.startsWith('/api/plans/');
    if (!isPlansRoute) return false;

    const user = getSessionUser(req);
    if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return true;
    }
    const db = getDb();
    if (!db) { sendJson(res, 500, { error: 'Database unavailable' }); return true; }

    const plansPrefix = '/api/plans/';
    if (pathname === '/api/plans' && method === 'GET') {
        const rows = db.prepare('SELECT id, name, updated_at AS updatedAt FROM plans WHERE user_id=? ORDER BY updated_at DESC').all(user.id);
        sendJson(res, 200, { plans: rows });
        return true;
    }
    if (pathname === '/api/plans' && method === 'POST') {
        readJsonBody(req, { maxBytes: 4000 }).then(body => {
            const name = String(body.name || 'New plan').trim().slice(0, 200) || 'New plan';
            const id = genId();
            const t = nowIso();
            db.prepare('INSERT INTO plans (id, user_id, name, updated_at) VALUES (?,?,?,?)').run(id, user.id, name, t);
            try {
                atomicWriteFile(planFilePath(user.id, id), EMPTY_PLAN_JSON);
            } catch (e) {
                db.prepare('DELETE FROM plans WHERE id=?').run(id);
                return sendJson(res, 500, { error: 'Failed to create plan file' });
            }
            sendJson(res, 201, { id, name, updatedAt: t });
        }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
        return true;
    }

    if (pathname.startsWith(plansPrefix)) {
        const planId = pathname.slice(plansPrefix.length).split('/')[0];
        if (!planId) return false;
        const row = db.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').get(planId, user.id);
        if (!row) {
            sendJson(res, 404, { error: 'Plan not found' });
            return true;
        }
        const sub = pathname.slice(plansPrefix.length + planId.length);

        if (method === 'GET' && sub === '') {
            // Resolve to the modern .geojson path first; fall back to the legacy
            // .json file for plans that predate the format migration.
            const fp = resolvePlanFilePath(user.id, planId);
            try {
                const txt = fs.readFileSync(fp, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/geo+json; charset=utf-8' });
                res.end(txt);
            } catch {
                sendJson(res, 404, { error: 'Plan file missing' });
            }
            return true;
        }
        if (method === 'PUT' && sub === '') {
            readBodyText(req, 50 * 1024 * 1024).then(rawStr => {
                let parsed;
                try { parsed = JSON.parse(rawStr || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
                // Accept either v3 (extended GeoJSON FeatureCollection) or v2
                // (legacy). Always write v3 to disk — if a cached client sends
                // v2 we upgrade it before persisting, so the on-disk format
                // stays canonical GeoJSON regardless of who writes.
                let toWrite;
                if (planMigrate.isV3FeatureCollection(parsed)) {
                    toWrite = parsed;
                } else if (planMigrate.isV2Plan(parsed)) {
                    try { toWrite = planMigrate.migrateV2PlanToV3(parsed); }
                    catch { return sendJson(res, 400, { error: 'Failed to upgrade legacy payload' }); }
                } else {
                    return sendJson(res, 400, { error: 'Invalid plan format' });
                }
                const t = nowIso();
                try {
                    atomicWriteFile(planFilePath(user.id, planId), JSON.stringify(toWrite, null, 2));
                    // Clean up a lingering .json twin from the first write after
                    // migration. Best-effort: swallow ENOENT silently.
                    try { fs.unlinkSync(legacyPlanFilePath(user.id, planId)); } catch {}
                    db.prepare('UPDATE plans SET updated_at=? WHERE id=?').run(t, planId);
                } catch {
                    return sendJson(res, 500, { error: 'Failed to save plan' });
                }
                sendJson(res, 200, { ok: true, updatedAt: t });
            }).catch(err => {
                if (err && err.code === 'BODY_TOO_LARGE') sendJson(res, 413, { error: 'Plan too large' });
                else sendJson(res, 400, { error: 'Invalid body' });
            });
            return true;
        }
        if (method === 'PATCH' && sub === '') {
            readJsonBody(req, { maxBytes: 4000 }).then(body => {
                const name = String(body.name || '').trim().slice(0, 200);
                if (!name) return sendJson(res, 400, { error: 'name required' });
                const t = nowIso();
                db.prepare('UPDATE plans SET name=?, updated_at=? WHERE id=?').run(name, t, planId);
                sendJson(res, 200, { id: planId, name, updatedAt: t });
            }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
            return true;
        }
        if (method === 'DELETE' && sub === '') {
            // Remove both the modern .geojson and any lingering legacy .json.
            try { fs.unlinkSync(planFilePath(user.id, planId)); } catch {}
            try { fs.unlinkSync(legacyPlanFilePath(user.id, planId)); } catch {}
            db.prepare('DELETE FROM plans WHERE id=?').run(planId);
            sendJson(res, 200, { ok: true });
            return true;
        }
    }
    return false;
}

function handlePrefsApi(req, res, pathname, method, sendJson, readJsonBody) {
    if (pathname !== '/api/me/preferences') return false;
    const user = getSessionUser(req);
    if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return true;
    }
    const db = getDb();
    if (!db) { sendJson(res, 500, { error: 'Database unavailable' }); return true; }

    if (method === 'GET') {
        const row = db.prepare('SELECT json FROM user_preferences WHERE user_id=?').get(user.id);
        const json = row && row.json ? row.json : '{}';
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(json);
        return true;
    }
    if (method === 'PUT') {
        readJsonBody(req, { maxBytes: 500000 }).then(body => {
            const t = nowIso();
            const str = JSON.stringify(body && typeof body === 'object' ? body : {});
            db.prepare(
                'INSERT INTO user_preferences (user_id, json, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at'
            ).run(user.id, str, t);
            sendJson(res, 200, { ok: true });
        }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
        return true;
    }
    return false;
}

// ─── OFFLINE-IMAGE-1: /api/offline/* routes ────────────────────────────────
// Offline-only API handlers. These routes are not in the main app.
// web-server.js must call appData.handleOfflineApi(req, res) before its own
// routes for offline endpoints to be reachable. See offline-map-config.js.
let _offlineMapConfig = null;
function _getOfflineMapConfig() {
    if (!_offlineMapConfig) {
        try { _offlineMapConfig = require('./offline-map-config'); } catch { _offlineMapConfig = null; }
    }
    return _offlineMapConfig;
}

function handleOfflineApi(req, res) {
    if (!req.url || !req.url.includes('/api/offline/')) return false;
    const omc = _getOfflineMapConfig();
    if (omc && omc.handleOfflineMapConfigApi(req, res)) return true;
    return false;
}

module.exports = {
    initAppData,
    getDb,
    getSessionUser,
    SESSION_COOKIE,
    readAllMessagesDb,
    writeAllMessagesDb,
    appendMessageDb,
    readBodyText,
    readChatUsersDb,
    writeChatUsersDb,
    readChatPresenceDb,
    writeChatPresenceDb,
    readChatGroupsStoreDb,
    writeChatGroupsStoreDb,
    updateChatGroupsAtomic,
    recordPresenceDb,
    prunePresenceDb,
    upsertChatUserDb,
    handleAuthApi,
    handleOfflineApi,
    handlePlansApi,
    handlePrefsApi,
    planFilePath,
    atomicWriteFile,
    EMPTY_PLAN_JSON
};
