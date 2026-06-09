'use strict';
/**
 * test-ui-unit-1-c.js — UI-Unit-1-C: Commander Panel DB1 data-source behavior
 *
 * Verifies:
 *   1. D5 integrity — ME catalog files deleted, no AppMiddleEastPlatform reference
 *   2. DB1 enrichment — sensors/weapons/magazines filled from catalog when absent
 *   3. DB1 source labels — named platform vs generic role labels
 *   4. Magazine stock formatting — object format { weapon_class: count }
 *   5. platform_id lookup — named catalog entries returned correctly
 *   6. All 18 ME-derived catalog entries present with labels
 *   7. platform_id normalization — hyphens → underscores
 *   8. Keyword classification shortcuts
 *   9. No duplicate s300 entry (already covered by sam_s300)
 *  10. panel code uses AppWorldStateDB exclusively for capability data
 */

const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;

// ── Minimal browser shim for loading world-state-db.js in Node ──
function makeSandbox() {
    const win = {};
    win.window = win;
    return win;
}

function loadModule(win, relPath) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    // Wrap in a function that receives `window` as parameter so the IIFE
    // (function(root){...})(window) binds to our sandbox.
    const fn = new Function('window', src);  // eslint-disable-line no-new-func
    fn(win);
}

// ── Test harness ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function ok(label, condition, detail) {
    if (condition) {
        passed++;
    } else {
        failed++;
        failures.push('FAIL: ' + label + (detail ? '  (' + detail + ')' : ''));
    }
}

// ── Load world-state-db.js ────────────────────────────────────────
const sandbox = makeSandbox();
loadModule(sandbox, 'UI_MOdified/client/shell/world-state-db.js');
const db = sandbox.AppWorldStateDB;

if (!db) {
    console.error('FATAL: AppWorldStateDB did not load. Aborting.');
    process.exit(1);
}

// ══════════════════════════════════════════════════════════════════
// Suite 1: D5 integrity — ME catalog files must not exist
// ══════════════════════════════════════════════════════════════════
const meLoaderPath   = path.join(ROOT, 'UI_MOdified/client/shell/middle-east-platform-loader.js');
const mePlatformsPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');

ok('D5-1: middle-east-platform-loader.js deleted', !fs.existsSync(meLoaderPath));
ok('D5-2: data/db/middle-east/platforms.json deleted', !fs.existsSync(mePlatformsPath));

// ══════════════════════════════════════════════════════════════════
// Suite 2: panel source code — no ME catalog references remain
// ══════════════════════════════════════════════════════════════════
const panelSrc = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');

ok('D5-3: no AppMiddleEastPlatform in panel',        !panelSrc.includes('AppMiddleEastPlatform'));
ok('D5-4: no AppMiddleEastPlatformLoader in panel',  !panelSrc.includes('AppMiddleEastPlatformLoader'));
// D5-5: no functional call to the ME loader API (doc comment may mention the name — that is fine)
ok('D5-5: no AppMiddleEastPlatformLoader.* call in panel',
    !/AppMiddleEastPlatformLoader\s*\./.test(panelSrc));
ok('D5-6: panel uses AppWorldStateDB',               panelSrc.includes('AppWorldStateDB'));
ok('D5-7: panel calls enrichUnit',                   panelSrc.includes('enrichUnit'));
ok('D5-8: panel calls capabilityFor',                panelSrc.includes('capabilityFor'));
ok('D5-9: panel calls classifyKind',                 panelSrc.includes('classifyKind'));
ok('D5-10: panel has formatMagStock function',       panelSrc.includes('formatMagStock'));

// ══════════════════════════════════════════════════════════════════
// Suite 3: DB1 metadata
// ══════════════════════════════════════════════════════════════════
ok('DB1-VER: DB_VERSION is 1.1.0-d5', db.DB_VERSION === '1.1.0-d5',
    'got: ' + db.DB_VERSION);

const catalogKeys = Object.keys(db.CAPABILITY_CATALOG);
ok('DB1-COUNT: catalog has 29 entries', catalogKeys.length === 29,
    'got: ' + catalogKeys.length + ' — ' + catalogKeys.join(', '));

// ══════════════════════════════════════════════════════════════════
// Suite 4: DB1 enrichment behavior
// ══════════════════════════════════════════════════════════════════

// Unit with no sensors/weapons → DB1 fills them
const emptyAD = { uid: 'u1', role: 'air_defense' };
const enrichedAD = db.enrichUnit(emptyAD);
ok('ENRICH-1: enrichUnit fills sensors for air_defense',
    Array.isArray(enrichedAD.sensors) && enrichedAD.sensors.length > 0,
    'sensors: ' + JSON.stringify(enrichedAD.sensors));
ok('ENRICH-2: enrichUnit fills weapons for air_defense',
    Array.isArray(enrichedAD.weapons) && enrichedAD.weapons.length > 0);
ok('ENRICH-3: enrichUnit fills magazines for air_defense',
    Array.isArray(enrichedAD.magazines) && enrichedAD.magazines.length > 0);
ok('ENRICH-4: enrichUnit sets rcs_class',  enrichedAD.rcs_class != null);
ok('ENRICH-5: enrichUnit sets readiness',  enrichedAD.readiness != null);
ok('ENRICH-6: enrichUnit sets supply',     enrichedAD.supply != null);
ok('ENRICH-7: enrichUnit sets kind',       typeof enrichedAD.kind === 'string');

// Unit with authored sensors → DB1 does NOT overwrite them
const authoredUnit = {
    uid: 'u2', role: 'air_defense',
    sensors: [{ id: 'custom_radar', type: 'custom', class: 'custom' }]
};
const enrichedAuthored = db.enrichUnit(authoredUnit);
ok('ENRICH-8: authored sensors not overwritten',
    enrichedAuthored.sensors.length === 1 && enrichedAuthored.sensors[0].id === 'custom_radar');

// platform_id lookup → named catalog entry
const f16Unit = { uid: 'u3', platform_id: 'f16c' };
const f16Enriched = db.enrichUnit(f16Unit);
ok('ENRICH-9:  f16c platform_id → kind f16c',    f16Enriched.kind === 'f16c');
ok('ENRICH-10: f16c sensors include apg68',
    f16Enriched.sensors.some(s => s.id === 'apg68'),
    JSON.stringify(f16Enriched.sensors.map(s => s.id)));
ok('ENRICH-11: f16c weapons include aim120',
    f16Enriched.weapons.some(w => w.id === 'aim120'),
    JSON.stringify(f16Enriched.weapons.map(w => w.id)));
ok('ENRICH-12: f16c weapons have labels',
    f16Enriched.weapons.every(w => typeof w.label === 'string' && w.label.length > 0));
ok('ENRICH-13: f16c sensors have labels',
    f16Enriched.sensors.every(s => typeof s.label === 'string' && s.label.length > 0));

// Sensor emcon field preserved
ok('ENRICH-14: f16c APG-68 has emcon field',
    f16Enriched.sensors.some(s => s.id === 'apg68' && s.emcon != null));

// ══════════════════════════════════════════════════════════════════
// Suite 5: capabilityFor — named vs generic labels
// ══════════════════════════════════════════════════════════════════
const f16Cap = db.capabilityFor({ platform_id: 'f16c' });
ok('CAP-1: capabilityFor f16c returns object', f16Cap != null && typeof f16Cap === 'object');
ok('CAP-2: f16c capability has label',
    typeof f16Cap.label === 'string' && f16Cap.label.includes('F-16'),
    'got: ' + f16Cap.label);

const mig29Cap = db.capabilityFor({ platform_id: 'mig29' });
ok('CAP-3: mig29 capability has label with MiG',
    mig29Cap && mig29Cap.label && mig29Cap.label.includes('MiG'),
    'got: ' + (mig29Cap && mig29Cap.label));

const patricap = db.capabilityFor({ role: 'patriot battery' });
ok('CAP-4: patriot capability has label',
    patricap && patricap.label && patricap.label.includes('Patriot'),
    'got: ' + (patricap && patricap.label));

// Generic roles have no label
const genericCap = db.capabilityFor({ role: 'armored brigade', domain: 'ground' });
ok('CAP-5: ground_maneuver generic has no label', !genericCap.label);

const airCap = db.capabilityFor({ role: 'fighter squadron', domain: 'air' });
ok('CAP-6: air_unit generic has no label', !airCap.label);

// ══════════════════════════════════════════════════════════════════
// Suite 6: Magazine stock formatting (pure function; tested inline)
// ══════════════════════════════════════════════════════════════════
function formatMagStock(stock) {
    if (stock == null) return '';
    if (typeof stock === 'number') return String(Math.round(stock));
    if (typeof stock === 'object') {
        return Object.entries(stock)
            .map(function (kv) { return kv[0].replace(/_/g, ' ') + ': ' + kv[1]; })
            .join(', ');
    }
    return String(stock);
}

ok('MAG-1: object format { long_range_sam: 32 }',
    formatMagStock({ long_range_sam: 32 }) === 'long range sam: 32',
    'got: ' + formatMagStock({ long_range_sam: 32 }));
ok('MAG-2: object format { gun: 600 }',
    formatMagStock({ gun: 600 }) === 'gun: 600');
ok('MAG-3: number format 500',
    formatMagStock(500) === '500');
ok('MAG-4: null → empty string',
    formatMagStock(null) === '');
ok('MAG-5: multi-class object { gun: 600, missile: 4 }',
    formatMagStock({ gun: 600, missile: 4 }) === 'gun: 600, missile: 4');
ok('MAG-6: DB1 magazine format is object not number',
    typeof db.CAPABILITY_CATALOG.f16c.magazines[0].stock === 'object',
    'type: ' + typeof db.CAPABILITY_CATALOG.f16c.magazines[0].stock);

// ══════════════════════════════════════════════════════════════════
// Suite 7: All 18 ME-derived entries — presence, label, doctrine_tags
// ══════════════════════════════════════════════════════════════════
const ME_DERIVED = [
    'f16c', 'mig29', 'f15e', 'mirage2000', 'gripen', 'tornado', 'awacs',
    'patriot', 'tor_aads', 'mistral', 's1_aaa',
    'meko', 'corvette', 'patrol_boat',
    'infantry_bn', 'armor_company', 'mlrs', 'logistics'
];

ME_DERIVED.forEach(key => {
    const entry = db.CAPABILITY_CATALOG[key];
    ok('ME-' + key + ': entry exists in CAPABILITY_CATALOG',
        entry != null, 'key: ' + key);
    if (entry) {
        ok('ME-' + key + ': has label string',
            typeof entry.label === 'string' && entry.label.length > 0,
            'label: ' + entry.label);
        ok('ME-' + key + ': has doctrine_tags array',
            Array.isArray(entry.doctrine_tags));
        ok('ME-' + key + ': has sensors array',
            Array.isArray(entry.sensors));
        ok('ME-' + key + ': has weapons array',
            Array.isArray(entry.weapons));
        ok('ME-' + key + ': has magazines array',
            Array.isArray(entry.magazines));
    }
});

// ══════════════════════════════════════════════════════════════════
// Suite 8: No duplicate s300 entry — sam_s300 covers it
// ══════════════════════════════════════════════════════════════════
ok('DUP-1: sam_s300 entry exists (Phase 5D-1)',
    db.CAPABILITY_CATALOG['sam_s300'] != null);
ok('DUP-2: no separate s300 key (would duplicate sam_s300)',
    db.CAPABILITY_CATALOG['s300'] == null);
ok('DUP-3: s-300 role keyword → sam_s300 kind',
    db.classifyKind({ role: 's-300 battalion' }) === 'sam_s300');
ok('DUP-4: s300 role keyword → sam_s300 kind',
    db.classifyKind({ role: 's300 system' }) === 'sam_s300');

// ══════════════════════════════════════════════════════════════════
// Suite 9: platform_id normalization — hyphen → underscore
// ══════════════════════════════════════════════════════════════════
ok('NORM-1: platform_id "tor-aads" (hyphen) → tor_aads',
    db.classifyKind({ platform_id: 'tor-aads' }) === 'tor_aads',
    'got: ' + db.classifyKind({ platform_id: 'tor-aads' }));
ok('NORM-2: platform_id "patrol-boat" → patrol_boat',
    db.classifyKind({ platform_id: 'patrol-boat' }) === 'patrol_boat');
ok('NORM-3: platform_id "infantry-bn" → infantry_bn',
    db.classifyKind({ platform_id: 'infantry-bn' }) === 'infantry_bn');
ok('NORM-4: platform_id "armor-company" → armor_company',
    db.classifyKind({ platform_id: 'armor-company' }) === 'armor_company');
ok('NORM-5: platform_id "f16c" (no hyphen) → f16c',
    db.classifyKind({ platform_id: 'f16c' }) === 'f16c');

// ══════════════════════════════════════════════════════════════════
// Suite 10: Keyword classification shortcuts
// ══════════════════════════════════════════════════════════════════
ok('KW-1: role "F-16 squadron" → f16c',
    db.classifyKind({ role: 'F-16 squadron' }) === 'f16c');
ok('KW-2: role "mig-29 fighter" → mig29',
    db.classifyKind({ role: 'mig-29 fighter' }) === 'mig29');
ok('KW-3: role "patriot battery" → patriot',
    db.classifyKind({ role: 'patriot battery' }) === 'patriot');
ok('KW-4: role "mlrs battery" → mlrs',
    db.classifyKind({ role: 'mlrs battery' }) === 'mlrs');
ok('KW-5: role "mirage-2000 squadron" → mirage2000',
    db.classifyKind({ role: 'mirage-2000 squadron' }) === 'mirage2000');
ok('KW-6: role "gripen fighter" → gripen',
    db.classifyKind({ role: 'gripen fighter' }) === 'gripen');
ok('KW-7: role "awacs unit" → awacs',
    db.classifyKind({ role: 'awacs unit' }) === 'awacs');
ok('KW-8: role "skyshield aaa" → s1_aaa',
    db.classifyKind({ role: 'skyshield aaa' }) === 's1_aaa');
ok('KW-9: role "meko frigate unit" → meko',
    db.classifyKind({ role: 'meko frigate unit' }) === 'meko');
// Generic fallbacks still work
ok('KW-10: role "armored brigade" → ground_maneuver (not armor_company)',
    db.classifyKind({ role: 'armored brigade', domain: 'ground' }) === 'ground_maneuver');
ok('KW-11: role "naval_base" domain strategic → ew_site',
    db.classifyKind({ role: 'naval_base', domain: 'strategic' }) === 'ew_site');

// ══════════════════════════════════════════════════════════════════
// Suite 11: enrichUnit never overwrites authored fields
// ══════════════════════════════════════════════════════════════════
const authoredReadiness = db.enrichUnit({ uid: 'u10', role: 'air_defense', readiness: 'not_ready' });
ok('AUTH-1: authored readiness preserved', authoredReadiness.readiness === 'not_ready');

const authoredSupply = db.enrichUnit({ uid: 'u11', role: 'naval_combatant', supply: 0.3 });
ok('AUTH-2: authored supply preserved', authoredSupply.supply === 0.3);

const authoredRcs = db.enrichUnit({ uid: 'u12', role: 'air_unit', rcs_class: 'very_small' });
ok('AUTH-3: authored rcs_class preserved', authoredRcs.rcs_class === 'very_small');

const authoredTags = db.enrichUnit({ uid: 'u13', role: 'ground_maneuver', doctrine_tags: ['custom'] });
ok('AUTH-4: authored doctrine_tags preserved',
    JSON.stringify(authoredTags.doctrine_tags) === '["custom"]');

// ══════════════════════════════════════════════════════════════════
// Suite 12: DB1 source labels via capabilityFor (simulates getDataSource logic)
// ══════════════════════════════════════════════════════════════════
function simulateGetDataSource(unit, field) {
    if (unit[field] !== undefined && unit[field] !== null) return 'Scenario Baseline';
    const cap = db.capabilityFor(unit);
    if (cap && cap[field] !== undefined) {
        if (cap.label) return 'DB-Lite — ' + cap.label;
        const kind = db.classifyKind(unit);
        return 'DB-Lite — ' + kind + ' (default)';
    }
    return 'DB-Lite Default';
}

ok('SRC-1: authored readiness → "Scenario Baseline"',
    simulateGetDataSource({ readiness: 'ready' }, 'readiness') === 'Scenario Baseline');
ok('SRC-2: no readiness + f16c platform_id → label in source',
    simulateGetDataSource({ platform_id: 'f16c' }, 'readiness').includes('F-16'),
    'got: ' + simulateGetDataSource({ platform_id: 'f16c' }, 'readiness'));
ok('SRC-3: no readiness + generic role → kind in source',
    simulateGetDataSource({ role: 'air_defense' }, 'readiness').includes('air_defense') ||
    simulateGetDataSource({ role: 'air_defense' }, 'readiness').includes('default'),
    'got: ' + simulateGetDataSource({ role: 'air_defense' }, 'readiness'));
ok('SRC-4: named patriot platform → Patriot in source label',
    simulateGetDataSource({ platform_id: 'patriot' }, 'readiness').includes('Patriot'),
    'got: ' + simulateGetDataSource({ platform_id: 'patriot' }, 'readiness'));

// ══════════════════════════════════════════════════════════════════
// Report
// ══════════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('  UI-Unit-1-C Test Results — Commander Panel DB1 data-source behavior');
console.log('═══════════════════════════════════════════════════════════════════════');
if (failures.length) {
    failures.forEach(f => console.log('  ' + f));
    console.log('');
}
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═══════════════════════════════════════════════════════════════════════\n');
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('═══════════════════════════════════════════════════════════════════════\n');
if (failed > 0) process.exit(1);
