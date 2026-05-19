/**
 * One-shot utility: set (or create) the "admin" account with a known password.
 *
 *   node scripts/set-admin-password.js [password]
 *
 * Defaults to "admin123" if no argument is given. The hash format matches what
 * server/app-data.js uses (scrypt:<salt-hex>:<hash-hex>) so the resulting row
 * authenticates through the regular /api/auth/login flow without any other
 * changes.
 *
 * Run from the UI_MOdified directory so the relative paths resolve, or set
 * RMOOZ_APP_DB_FILE / RMOOZ_DATA_DIR to point elsewhere.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const ROOT     = path.resolve(__dirname, '..');
const DATA_DIR = process.env.RMOOZ_DATA_DIR    || path.join(ROOT, 'data');
const DB_FILE  = process.env.RMOOZ_APP_DB_FILE || path.join(DATA_DIR, 'app.db');

const USERNAME = 'admin';
const PASSWORD = process.argv[2] || 'admin123';

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
}

function nowIso() { return new Date().toISOString(); }

function randomId() { return 'usr-' + crypto.randomBytes(8).toString('hex'); }

const db = new Database(DB_FILE);
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(USERNAME);
const pwHash = hashPassword(PASSWORD);
const t = nowIso();

if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(pwHash, t, existing.id);
    console.log(`[set-admin-password] Updated existing admin (id=${existing.id}).`);
} else {
    const id = randomId();
    db.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run(id, USERNAME, pwHash, 'Administrator', 'planner', t, t);
    console.log(`[set-admin-password] Created admin (id=${id}).`);
}

console.log(`[set-admin-password] Username: ${USERNAME}`);
console.log(`[set-admin-password] Password: ${PASSWORD}`);
console.log(`[set-admin-password] DB file:  ${DB_FILE}`);

db.close();
