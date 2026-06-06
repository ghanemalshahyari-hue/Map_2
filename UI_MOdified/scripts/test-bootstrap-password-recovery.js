#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const appData = require('../server/app-data');

function verifyPassword(password, stored) {
    if (!stored || typeof stored !== 'string' || !stored.startsWith('scrypt:')) return false;
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    try {
        const computed = crypto.scryptSync(String(password), salt, 64).toString('hex');
        if (hash.length !== computed.length) return false;
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
    } catch {
        return false;
    }
}

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-bootstrap-recovery-'));
const PASSWORD_FILE = path.join(DATA_DIR, 'BOOTSTRAP_PASSWORD.txt');
const PASSWORD = 'recover-existing-bootstrap-password';
const PASSWORD_BODY =
    '# rmooz first-time bootstrap administrator password\r\n' +
    '#\r\n' +
    '# Username: admin\r\n' +
    '# Password: ' + PASSWORD + '\r\n' +
    '#\r\n' +
    '# Log in once with these credentials, change the password from the\r\n' +
    '# Users panel, then DELETE THIS FILE. To skip random generation on\r\n' +
    '# the next first-run, set the RMOOZ_BOOTSTRAP_PASSWORD env var\r\n' +
    '# before starting the server.\r\n';

delete process.env.RMOOZ_BOOTSTRAP_PASSWORD;
fs.writeFileSync(PASSWORD_FILE, PASSWORD_BODY, { mode: 0o600 });

let db = null;
try {
    db = appData.initAppData({ Database, dataDir: DATA_DIR });
    const admin = db.prepare('SELECT username, password_hash FROM users WHERE username=?').get('admin');
    assert(admin, 'expected admin user to be created');
    assert(verifyPassword(PASSWORD, admin.password_hash), 'expected admin password hash to match existing bootstrap file');
    assert.strictEqual(fs.readFileSync(PASSWORD_FILE, 'utf8'), PASSWORD_BODY, 'expected bootstrap password file to stay unchanged');
    console.log('OK - bootstrap password recovery reused existing BOOTSTRAP_PASSWORD.txt');
} catch (err) {
    console.error('FAIL - bootstrap password recovery:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
} finally {
    try {
        if (db) db.close();
    } catch (_) {}
    try {
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
}
