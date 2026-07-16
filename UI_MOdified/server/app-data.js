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

// Proxy trust gate: by default this server trusts NOTHING from the client
// about its own network position — `X-Forwarded-Proto/Host/For` are
// ordinary, fully client-controllable request headers. A direct (non-proxied)
// client could otherwise send `X-Forwarded-Proto: https` to flip cookie mode,
// `X-Forwarded-Host` to confuse the CSRF origin check, or `X-Forwarded-For`
// to pick its own rate-limit identity (and so dodge/frame other clients).
// Only honor them when the operator explicitly says a trusted reverse proxy
// sits in front (RMOOZ_TRUST_PROXY=1) — never by default.
function trustProxyEnabled() {
    return String(process.env.RMOOZ_TRUST_PROXY || '') === '1';
}
function forwardedHeader(req, name) {
    if (!trustProxyEnabled()) return null;
    const v = req && req.headers && req.headers[name];
    return v ? String(v) : null;
}

// In-memory fixed-window rate limit for login/register — this is a single
// local server process (no multi-instance/clustered deployment), so
// per-process memory is a real and simple enough store; no Redis needed.
// Keyed by client IP; separate windows per endpoint so a burst of registers
// doesn't also lock out login attempts from the same address (buckets are
// fully independent — a login success never touches the register bucket,
// or vice versa; a hit only ever increments its own `${bucket}:${ip}` entry).
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const _rateLimitState = new Map(); // `${bucket}:${ip}` -> { count, windowStart }
function checkRateLimit(bucket, ip) {
    const key = bucket + ':' + (ip || 'unknown');
    const now = Date.now();
    const entry = _rateLimitState.get(key);
    if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
        _rateLimitState.set(key, { count: 1, windowStart: now });
        return { allowed: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return { allowed: entry.count <= RATE_LIMIT_MAX_ATTEMPTS, retryAfterSec };
}
// Unbounded-growth guard: without this, every distinct IP that ever hits
// login/register leaves a Map entry forever (a real memory leak on a
// long-lived server, and a trivial way to bloat memory by hitting the
// endpoint from many source addresses). Sweep entries whose window closed
// a while ago on an interval, not on every request. `.unref()` so this
// timer never keeps a test process (or the real server) alive by itself.
const _rateLimitSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _rateLimitState) {
        if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS * 2) _rateLimitState.delete(key);
    }
}, RATE_LIMIT_WINDOW_MS);
if (_rateLimitSweep.unref) _rateLimitSweep.unref();

function clientIp(req) {
    const forwarded = forwardedHeader(req, 'x-forwarded-for');
    if (forwarded) {
        // Standard form: "client, proxy1, proxy2, ..." — the first entry is
        // the original client as seen by the nearest trusted hop.
        const first = forwarded.split(',')[0].trim();
        if (first) return first;
    }
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}
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

// Timing-side-channel mitigation: when the username doesn't exist, `login`
// used to short-circuit before ever calling scryptSync, making "no such
// user" measurably faster than "wrong password" — an enumeration oracle on
// top of the (already-honest) `409 Username taken` register response. This
// runs a real scrypt computation against a fixed dummy hash so the two
// cases take comparable time, without needing a real user row.
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(24).toString('hex'));
function verifyPasswordAgainstDummy(password) {
    verifyPassword(password, DUMMY_PASSWORD_HASH);
    return false;
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

// Environment-aware Secure flag. Default deployment is offline/LAN plain
// HTTP (this app's primary target — CLAUDE.md's own launch config runs it
// unencrypted); forcing `Secure` there would make the cookie silently stop
// being sent at all and break every session. Only add it when we have a
// positive signal we're actually behind TLS: an explicit operator opt-in
// (`RMOOZ_FORCE_SECURE_COOKIE=1`, for a real HTTPS deployment) or a
// `X-Forwarded-Proto: https` header — but ONLY when RMOOZ_TRUST_PROXY=1 is
// also set, otherwise a direct (non-proxied) client could send that header
// itself. (Spoofing this specific header only breaks the spoofer's own
// cookie delivery over their own plain-HTTP connection, not a real
// exploit — but treating it as trusted-by-default is still the wrong
// default, so it stays behind the same explicit gate as the other two.)
function isSecureContext(req) {
    if (String(process.env.RMOOZ_FORCE_SECURE_COOKIE || '') === '1') return true;
    const proto = forwardedHeader(req, 'x-forwarded-proto');
    if (proto && proto.toLowerCase() === 'https') return true;
    return false;
}

function sessionCookieHeader(sessionId, req, maxAgeSec = SESSION_MAX_AGE_SEC) {
    const secure = isSecureContext(req) ? '; Secure' : '';
    return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

function clearSessionCookieHeader(req) {
    const secure = isSecureContext(req) ? '; Secure' : '';
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${secure}`;
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

        -- Command-authority backbone (Batch B): Team/Cell/Operator/Units
        -- assignment + scenario approval lifecycle. 'team' is a plain label,
        -- not its own table — it carries no attributes here.
        CREATE TABLE IF NOT EXISTS command_cells (
            id         TEXT PRIMARY KEY,
            team       TEXT NOT NULL,
            name       TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS command_assignments (
            id            TEXT PRIMARY KEY,
            cell_id       TEXT NOT NULL,
            operator_id   TEXT NOT NULL,
            scenario_name TEXT NULL,
            unit_id       TEXT NULL,
            cell_role     TEXT NOT NULL DEFAULT 'operator'
                          CHECK (cell_role IN ('commander','operator','observer')),
            created_at    TEXT NOT NULL,
            created_by    TEXT NOT NULL,
            FOREIGN KEY (cell_id)     REFERENCES command_cells(id),
            FOREIGN KEY (operator_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_cmd_assign_scenario ON command_assignments(scenario_name);
        CREATE INDEX IF NOT EXISTS idx_cmd_assign_operator ON command_assignments(operator_id);

        CREATE TABLE IF NOT EXISTS scenario_lifecycle (
            scenario_name TEXT PRIMARY KEY,
            status        TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','in_review','approved','rejected','activated')),
            author_id     TEXT NULL,
            submitted_by  TEXT NULL, submitted_at  TEXT NULL,
            reviewed_by   TEXT NULL, reviewed_at   TEXT NULL,
            approved_by   TEXT NULL, approved_at   TEXT NULL,
            rejected_by   TEXT NULL, rejected_at   TEXT NULL, reject_reason TEXT NULL,
            activated_by  TEXT NULL, activated_at  TEXT NULL,
            updated_at    TEXT NOT NULL
        );

        -- Batch D Slice 1: immutable scenario revisions. Append-only — a row
        -- is NEVER updated or deleted once written. scenario_lifecycle above
        -- tracks CURRENT approval state only; this table is the authoritative
        -- content history POST /api/scenarios writes to on every real change
        -- (content-hash-identical resaves are a no-op, no new row). The live
        -- data/scenarios/<name>.json file remains a mirror of the latest
        -- revision so every existing reader keeps working unmodified.
        CREATE TABLE IF NOT EXISTS scenario_revisions (
            id              TEXT PRIMARY KEY,
            scenario_name   TEXT NOT NULL,
            revision_number INTEGER NOT NULL,
            content_hash    TEXT NOT NULL,
            content_json    TEXT NOT NULL,
            created_by      TEXT NULL,
            created_at      TEXT NOT NULL,
            source          TEXT NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual','ai','template','import','clone','restore','legacy'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_rev_unique ON scenario_revisions(scenario_name, revision_number);
        CREATE INDEX IF NOT EXISTS idx_scenario_rev_name ON scenario_revisions(scenario_name);
    `);
    try { db.exec(`ALTER TABLE units ADD COLUMN side TEXT NULL DEFAULT 'friendly'`); } catch (_) {}
    try { db.exec(`ALTER TABLE units ADD COLUMN lat REAL NULL`); } catch (_) {}
    try { db.exec(`ALTER TABLE units ADD COLUMN lng REAL NULL`); } catch (_) {}
    try { db.exec(`ALTER TABLE units ADD COLUMN placed_at TEXT NULL`); } catch (_) {}
    // Batch D Slice 2: bind approval/activation to the EXACT scenario_revisions
    // row that was reviewed, not just "whatever's on disk now" — approve/
    // activate record the revision_number in force at that moment.
    try { db.exec(`ALTER TABLE scenario_lifecycle ADD COLUMN approved_revision INTEGER NULL`); } catch (_) {}
    try { db.exec(`ALTER TABLE scenario_lifecycle ADD COLUMN activated_revision INTEGER NULL`); } catch (_) {}
    // Batch D Slice 4/5: generic "what this revision was based on" reference —
    // the restored-from revision number (restore) or the source scenario name
    // (clone). Reused rather than adding two single-purpose columns.
    try { db.exec(`ALTER TABLE scenario_revisions ADD COLUMN source_ref TEXT NULL`); } catch (_) {}
    migrateArchivedStatus(db);
    migrateLegacyRevisionSource(db);
}

// Batch D Slice 5: adds the 'archived' status. SQLite has no ALTER TABLE ...
// ALTER COLUMN / DROP CONSTRAINT, so widening a CHECK constraint on an
// existing table means recreating it — copy rows into a new table with the
// widened constraint, drop the old one, rename. Idempotent: checks the
// live schema text for 'archived' first and no-ops if already migrated.
// Archive/restore-from-archive never touch scenario_revisions — archiving is
// reversible bookkeeping on scenario_lifecycle only, not a content change.
function migrateArchivedStatus(db) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='scenario_lifecycle'").get();
    if (!row || !row.sql || row.sql.indexOf("'archived'") !== -1) return;
    const tx = db.transaction(() => {
        db.exec(`
            CREATE TABLE scenario_lifecycle_new (
                scenario_name TEXT PRIMARY KEY,
                status        TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','in_review','approved','rejected','activated','archived')),
                author_id     TEXT NULL,
                submitted_by  TEXT NULL, submitted_at  TEXT NULL,
                reviewed_by   TEXT NULL, reviewed_at   TEXT NULL,
                approved_by   TEXT NULL, approved_at   TEXT NULL, approved_revision INTEGER NULL,
                rejected_by   TEXT NULL, rejected_at   TEXT NULL, reject_reason TEXT NULL,
                activated_by  TEXT NULL, activated_at  TEXT NULL, activated_revision INTEGER NULL,
                archived_by   TEXT NULL, archived_at   TEXT NULL, pre_archive_status TEXT NULL,
                updated_at    TEXT NOT NULL
            );
        `);
        db.exec(`
            INSERT INTO scenario_lifecycle_new (
                scenario_name, status, author_id, submitted_by, submitted_at, reviewed_by, reviewed_at,
                approved_by, approved_at, approved_revision, rejected_by, rejected_at, reject_reason,
                activated_by, activated_at, activated_revision, updated_at
            )
            SELECT scenario_name, status, author_id, submitted_by, submitted_at, reviewed_by, reviewed_at,
                   approved_by, approved_at, approved_revision, rejected_by, rejected_at, reject_reason,
                   activated_by, activated_at, activated_revision, updated_at
            FROM scenario_lifecycle;
        `);
        db.exec(`DROP TABLE scenario_lifecycle;`);
        db.exec(`ALTER TABLE scenario_lifecycle_new RENAME TO scenario_lifecycle;`);
    });
    tx();
}

// Batch D (checkpoint retrofit): adds the 'legacy' revision source — used
// when backfilling revision 1 for scenario files that predate the revisions
// system (see scenario-revisions-store.js::backfillLegacyRevisions()), so
// that provenance stays honest (never mislabeled as 'manual'/'ai'/etc.).
// Same recreate-and-copy approach as migrateArchivedStatus, for the same
// SQLite ALTER-CHECK-constraint limitation.
function migrateLegacyRevisionSource(db) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='scenario_revisions'").get();
    if (!row || !row.sql || row.sql.indexOf("'legacy'") !== -1) return;
    const tx = db.transaction(() => {
        db.exec(`
            CREATE TABLE scenario_revisions_new (
                id              TEXT PRIMARY KEY,
                scenario_name   TEXT NOT NULL,
                revision_number INTEGER NOT NULL,
                content_hash    TEXT NOT NULL,
                content_json    TEXT NOT NULL,
                created_by      TEXT NULL,
                created_at      TEXT NOT NULL,
                source          TEXT NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('manual','ai','template','import','clone','restore','legacy')),
                source_ref      TEXT NULL
            );
        `);
        db.exec(`
            INSERT INTO scenario_revisions_new (id, scenario_name, revision_number, content_hash, content_json, created_by, created_at, source, source_ref)
            SELECT id, scenario_name, revision_number, content_hash, content_json, created_by, created_at, source, source_ref FROM scenario_revisions;
        `);
        db.exec(`DROP TABLE scenario_revisions;`);
        db.exec(`ALTER TABLE scenario_revisions_new RENAME TO scenario_revisions;`);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_rev_unique ON scenario_revisions(scenario_name, revision_number);`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_scenario_rev_name ON scenario_revisions(scenario_name);`);
    });
    tx();
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
function bootstrapPasswordFilePath() {
    return path.join(_dataDir, 'BOOTSTRAP_PASSWORD.txt');
}

function readBootstrapPasswordFile() {
    const filePath = bootstrapPasswordFilePath();
    let body;
    try {
        body = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        if (err && err.code === 'ENOENT') return null;
        throw err;
    }
    const match = body.match(/^# Password:\s*([^\r\n]+)\r?$/m);
    const password = match && match[1] ? match[1].trim() : '';
    if (!password) {
        const err = new Error('existing bootstrap password file is missing a usable "# Password:" line');
        err.code = 'RMOOZ_BOOTSTRAP_PASSWORD_FILE_INVALID';
        throw err;
    }
    return { filePath, password };
}

function writeBootstrapPasswordFile(password) {
    const filePath = bootstrapPasswordFilePath();
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
    const existing = db.prepare('SELECT id, role FROM users WHERE username=?').get(username);
    if (existing) {
        // Corrective fixup: the bootstrap account was previously seeded with
        // role 'planner' (a bug — the fixed username 'admin' is only ever
        // this bootstrap account, so it's always safe to correct its role).
        if (existing.role !== 'admin') {
            db.prepare('UPDATE users SET role=?, updated_at=? WHERE id=?').run('admin', nowIso(), existing.id);
        }
        return;
    }
    const id = genId();
    const t = nowIso();

    // Source of truth for the password:
    //   1. RMOOZ_BOOTSTRAP_PASSWORD env var (operator-supplied) — silent.
    //   2. Otherwise, a freshly generated random password — written to a
    //      0600 file so the operator can read it once, then delete it.
    // The previous default ('admin') is removed: shipping a known credential
    // means any LAN reachable copy of rmooz is one guess away from admin.
    const envPassword = process.env.RMOOZ_BOOTSTRAP_PASSWORD;
    let reusedPasswordFile = null;
    let password = '';
    if (envPassword && String(envPassword).length > 0) {
        password = String(envPassword);
    } else {
        try {
            reusedPasswordFile = readBootstrapPasswordFile();
        } catch (err) {
            console.error('[app-data] FAILED to read existing bootstrap password file at ' + bootstrapPasswordFilePath() + ': ' + (err && err.message ? err.message : err));
            console.error('[app-data] Bootstrap user not created. Delete the stale file, set RMOOZ_BOOTSTRAP_PASSWORD and restart, or fix the data dir permissions.');
            return;
        }
        password = reusedPasswordFile ? reusedPasswordFile.password : generateBootstrapPassword();
    }

    db.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run(id, username, hashPassword(password), 'Administrator', 'admin', t, t);

    if (envPassword) {
        console.log('[app-data] Created bootstrap user "' + username + '" using RMOOZ_BOOTSTRAP_PASSWORD env var.');
        return;
    }
    if (reusedPasswordFile) {
        console.log('[app-data] Re-created bootstrap user "' + username + '" using the existing one-time password file at ' + reusedPasswordFile.filePath + ' (read it, log in once, change the password in the Users panel, then DELETE that file).');
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
        console.error('[app-data] FAILED to write bootstrap password file at ' + bootstrapPasswordFilePath() + ': ' + (err && err.message ? err.message : err));
        console.error('[app-data] Bootstrap user not created. Set RMOOZ_BOOTSTRAP_PASSWORD and restart, or fix the data dir permissions.');
    }
}

/**
 * @param {{ Database: import('better-sqlite3'), dataDir: string, legacyUnitsFile?: string }} opts
 */
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

// Expired session rows are already unusable (getSessionUser checks
// expires_at > now), but nothing ever deleted them — the table would grow
// forever. Swept opportunistically on login/logout (both already touch the
// sessions table), not on a timer — this is a low-traffic local server, a
// cron/interval would be more machinery than the problem needs.
function cleanupExpiredSessions(db) {
    try { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()); } catch {}
}

function getSessionUser(req) {
    const db = getDb();
    if (!db) return null;
    const cookies = parseCookies(req);
    const sid = cookies[SESSION_COOKIE];
    if (!sid) return null;
    const row = db.prepare(`
        SELECT u.id AS user_id, u.username, u.display_name, u.role
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?
    `).get(sid, Date.now());
    if (!row) return null;
    return {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role || 'planner'
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
    const db = getDb();
    if (!db) { sendJson(res, 500, { error: 'Database unavailable' }); return true; }

    if (pathname === '/api/auth/register' && method === 'POST') {
        const registerLimit = checkRateLimit('register', clientIp(req));
        if (!registerLimit.allowed) {
            res.setHeader('Retry-After', String(registerLimit.retryAfterSec));
            sendJson(res, 429, { error: 'Too many attempts — try again later', retryAfterSec: registerLimit.retryAfterSec });
            return true;
        }
        readJsonBody(req, { maxBytes: 16000 }).then(body => {
            const username = String(body.username || '').trim().toLowerCase();
            const password = String(body.password || '');
            const displayName = String(body.displayName || body.username || '').trim() || username;
            if (username.length < 2 || username.length > 64) return sendJson(res, 400, { error: 'Invalid username' });
            if (password.length < 4) return sendJson(res, 400, { error: 'Password too short' });
            const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
            // NOTE (accepted, documented tradeoff — not obscured): this 409
            // does confirm username existence. Registration UX inherently
            // needs to tell the user their chosen name is taken so they can
            // pick another; avoiding that would require an out-of-scope
            // email-confirmation-based flow. Login below stays fully
            // ambiguous, which is the classic enumeration attack surface.
            if (exists) return sendJson(res, 409, { error: 'Username taken' });
            const id = genId();
            const t = nowIso();
            // Role is never client-supplied — self-registration always gets the
            // baseline role. Elevated roles are assigned out-of-band (DB edit /
            // RMOOZ_ROADMAP_ADMINS-style env override), never via this request.
            db.prepare(
                'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
            ).run(id, username, hashPassword(password), displayName, 'planner', t, t);
            sendJson(res, 201, { id, username, displayName });
        }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
        return true;
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
        const loginLimit = checkRateLimit('login', clientIp(req));
        if (!loginLimit.allowed) {
            res.setHeader('Retry-After', String(loginLimit.retryAfterSec));
            sendJson(res, 429, { error: 'Too many attempts — try again later', retryAfterSec: loginLimit.retryAfterSec });
            return true;
        }
        readJsonBody(req, { maxBytes: 16000 }).then(body => {
            const username = String(body.username || '').trim().toLowerCase();
            const password = String(body.password || '');
            const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
            // Timing-side-channel mitigation: run a real scrypt computation
            // on the unknown-user path too, so "no such user" and "wrong
            // password" take comparable time (see verifyPasswordAgainstDummy).
            const authOk = user ? verifyPassword(password, user.password_hash) : verifyPasswordAgainstDummy(password);
            if (!user || !authOk) {
                return sendJson(res, 401, { error: 'Invalid credentials' });
            }
            cleanupExpiredSessions(db);
            // Session rotation: if this request already carried a session
            // cookie (stale login, or a fixation attempt), invalidate it —
            // the cookie we're about to issue is always a fresh random ID
            // regardless, but this also cleans up the old row rather than
            // leaving it live alongside the new one.
            const presented = parseCookies(req)[SESSION_COOKIE];
            if (presented) { try { db.prepare('DELETE FROM sessions WHERE id=?').run(presented); } catch {} }
            const sid = genId();
            const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
            const t = nowIso();
            db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)').run(sid, user.id, exp, t);
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Set-Cookie': sessionCookieHeader(sid, req)
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
        cleanupExpiredSessions(db);
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': clearSessionCookieHeader(req)
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
        sendJson(res, 200, { id: u.id, username: u.username, name: u.displayName || u.username, role: u.role });
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
    handlePlansApi,
    handlePrefsApi,
    planFilePath,
    atomicWriteFile,
    EMPTY_PLAN_JSON,
    trustProxyEnabled,
    forwardedHeader
};
