#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = process.env.RMOOZ_APP_DB_FILE || path.join(DATA_DIR, 'app.db');

const RESET = process.argv.includes('--reset');

const ECHELON_BY_LEVEL = { 0: '23', 1: '22', 2: '18', 3: '16', 4: '15' };
const IDENTITY_BY_SIDE = { friendly: '3', hostile: '6', neutral: '4', unknown: '1' };
const SET_BY_DOMAIN    = { Land: '10', Air: '01', Naval: '30', Special: '15' };
const PREFIX_BY_LEVEL  = { 0: 'ARMY', 1: 'LF', 2: 'BDE', 3: 'BN', 4: 'CO' };

const ARMY_NAMES = ['1st Combined Army', '2nd Combined Army', '3rd Combined Army', '4th Combined Army'];
const ARMY_SIDES = ['friendly', 'hostile', 'neutral', 'unknown'];
const FORCES = [
    { name: 'Air Force',                domain: 'Air'     },
    { name: 'Land Force',               domain: 'Land'    },
    { name: 'Naval Force',              domain: 'Naval'   },
    { name: 'Special Operations Force', domain: 'Special' },
];
const COMPANY_NAMES = ['Alpha Company', 'Bravo Company', 'Charlie Company', 'Delta Company'];

function nowIso() { return new Date().toISOString(); }
function genId() {
    return crypto.randomUUID ? crypto.randomUUID()
        : 'u-' + Date.now().toString(36) + '-' + crypto.randomBytes(12).toString('hex');
}

function buildSidc({ side, domain, level }) {
    const identity = IDENTITY_BY_SIDE[side] || '3';
    const set      = SET_BY_DOMAIN[domain]  || '10';
    const echelon  = ECHELON_BY_LEVEL[level] ?? '00';
    return '10' + '0' + identity + set + '0' + '0' + echelon + '000000' + '00' + '00';
}

function ensureSchema(db) {
    const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='units'"
    ).get();
    if (row) return;
    console.log('[seed] units table missing — bootstrapping via app-data.initAppData');
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
    const appData = require(path.join(ROOT, 'server', 'app-data'));
    appData.initAppData({ Database, dataDir: DATA_DIR });
}

function main() {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
    const db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    ensureSchema(db);

    const liveCount = db.prepare(
        'SELECT COUNT(*) AS n FROM units WHERE deleted_at IS NULL'
    ).get().n;

    if (liveCount > 0 && !RESET) {
        console.error(
            `[seed] units table is not empty (${liveCount} live rows). ` +
            `Pass --reset to wipe and reseed.`
        );
        process.exit(1);
    }

    const insert = db.prepare(
        'INSERT INTO units (id, code, name, level, parent_id, sidc, unit_type, side, ' +
        'deleted_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );

    let counters = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    function nextCode(level) {
        counters[level] += 1;
        const seq = counters[level].toString(36).toUpperCase().padStart(4, '0');
        return `${PREFIX_BY_LEVEL[level]}-${seq}`;
    }

    let inserted = 0;
    function add({ name, level, parentId, side, domain, unitType }) {
        const id = genId();
        const t = nowIso();
        const sidc = buildSidc({ side, domain, level });
        insert.run(id, nextCode(level), name, level, parentId, sidc, unitType, side, null, t, t);
        inserted += 1;
        return id;
    }

    const tx = db.transaction(() => {
        if (RESET) {
            const before = db.prepare('SELECT COUNT(*) AS n FROM units').get().n;
            db.exec('DELETE FROM units');
            console.log(`[seed] --reset wiped ${before} rows`);
        }

        for (let a = 0; a < ARMY_NAMES.length; a++) {
            const side = ARMY_SIDES[a];
            const armyId = add({
                name: ARMY_NAMES[a], level: 0, parentId: null,
                side, domain: 'Land', unitType: 'Army',
            });

            for (const force of FORCES) {
                const forceId = add({
                    name: force.name, level: 1, parentId: armyId,
                    side, domain: force.domain, unitType: force.domain,
                });

                for (let b = 1; b <= 3; b++) {
                    const brigadeId = add({
                        name: `${ordinal(b)} Brigade`, level: 2, parentId: forceId,
                        side, domain: force.domain, unitType: force.domain,
                    });

                    for (let n = 1; n <= 4; n++) {
                        const battalionId = add({
                            name: `${ordinal(n)} Battalion`, level: 3, parentId: brigadeId,
                            side, domain: force.domain, unitType: force.domain,
                        });

                        for (const coName of COMPANY_NAMES) {
                            add({
                                name: coName, level: 4, parentId: battalionId,
                                side, domain: force.domain, unitType: force.domain,
                            });
                        }
                    }
                }
            }
        }
    });

    tx();

    const counts = db.prepare(
        'SELECT level, COUNT(*) AS n FROM units WHERE deleted_at IS NULL GROUP BY level ORDER BY level'
    ).all();
    console.log(`[seed] inserted ${inserted} rows into ${DB_FILE}`);
    for (const r of counts) console.log(`        level ${r.level}: ${r.n}`);
    db.close();
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

main();
