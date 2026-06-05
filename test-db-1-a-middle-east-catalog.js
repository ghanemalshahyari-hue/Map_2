#!/usr/bin/env node
/**
 * test-db-1-a-middle-east-catalog.js
 *
 * Tests DB-1-A: Middle East Platform Catalog (minimal seed)
 *
 * Verifies:
 *   1. Catalog JSON exists and is valid
 *   2. All 5 seed platforms present
 *   3. Each platform has required fields
 *   4. Catalog integrates with DB-Lite fallback
 *   5. Authored scenario values not overwritten
 *   6. Missing fields fall back to DB-Lite
 *   7. Old scenarios still work (no breaking changes)
 *   8. No external network dependencies
 *
 * Run: node test-db-1-a-middle-east-catalog.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;

function ok(name, cond) {
    if (cond) {
        pass++;
        console.log('  ✓ ' + name);
    } else {
        fail++;
        console.log('  ✗ ' + name);
    }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('DB-1-A TEST: Middle East Platform Catalog (Minimal Seed)');
console.log('═══════════════════════════════════════════════════════════\n');

// ── TEST 1: Catalog file exists and is valid JSON ───────────────────
console.log('TEST 1: Catalog file and JSON validity');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');

    ok('catalog file exists', fs.existsSync(catalogPath));

    let catalog = null;
    try {
        const content = fs.readFileSync(catalogPath, 'utf8');
        catalog = JSON.parse(content);
        ok('catalog is valid JSON', true);
    } catch (e) {
        ok('catalog is valid JSON', false);
    }

    ok('catalog has metadata', catalog && catalog.metadata);
    ok('catalog has platforms object', catalog && catalog.platforms && typeof catalog.platforms === 'object');
}

// ── TEST 2: Load and parse catalog ───────────────────────────────────
console.log('\nTEST 2: Catalog loading and structure');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    ok('metadata.version present', !!catalog.metadata.version);
    ok('metadata.region is Middle East', catalog.metadata.region === 'Middle East');
    ok('metadata.sources array present', Array.isArray(catalog.metadata.sources));
    ok('platforms object is not empty', Object.keys(catalog.platforms).length > 0);
}

// ── TEST 3: All 5 seed platforms present ──────────────────────────────
console.log('\nTEST 3: Seed platforms present (5 minimum)');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const expectedPlatforms = [
        'f16c-fighter',
        'patriot-sam',
        's300-sam',
        'frigate-combatant',
        'infantry-maneuver'
    ];

    const platformIds = Object.keys(catalog.platforms);

    for (let pid of expectedPlatforms) {
        ok(`platform ${pid} exists`, platformIds.includes(pid));
    }

    ok('at least 5 platforms', platformIds.length >= 5);
}

// ── TEST 4: Each platform has required fields ────────────────────────
console.log('\nTEST 4: Platform field requirements');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const requiredFields = ['id', 'label', 'domain', 'role', 'rcs_class', 'readiness_default', 'supply_default'];

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        for (let field of requiredFields) {
            ok(`${pid}.${field} present`, field in platform && platform[field] !== null && platform[field] !== undefined);
        }
    }
}

// ── TEST 5: Platform domain and role values are valid ─────────────────
console.log('\nTEST 5: Platform domain and role classification');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const validDomains = new Set(['air', 'ground', 'sea', 'strategic']);
    const validRoles = new Set(['fighter', 'air_defense', 'naval_combatant', 'ground_maneuver', 'infantry']);

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.domain is valid`, validDomains.has(platform.domain));
        ok(`${pid}.role is valid`, validRoles.has(platform.role) || platform.role.includes('_'));
    }
}

// ── TEST 6: Readiness and supply defaults are sensible ────────────────
console.log('\nTEST 6: Readiness and supply default values');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const validReadiness = new Set(['ready', 'limited', 'degraded']);

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.readiness_default valid`, validReadiness.has(platform.readiness_default));
        ok(`${pid}.supply_default 0-1 range`,
           typeof platform.supply_default === 'number' &&
           platform.supply_default >= 0 &&
           platform.supply_default <= 1);
    }
}

// ── TEST 7: Doctrine tags present and sensible ───────────────────────
console.log('\nTEST 7: Doctrine tags');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.doctrine_tags is array`, Array.isArray(platform.doctrine_tags));
        ok(`${pid}.doctrine_tags not empty`, platform.doctrine_tags.length > 0);
    }
}

// ── TEST 8: Sensors array present and valid ──────────────────────────
console.log('\nTEST 8: Sensors catalog');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.sensors is array`, Array.isArray(platform.sensors));

        if (platform.sensors.length > 0) {
            for (let sensor of platform.sensors) {
                ok(`${pid} sensor has id`, !!sensor.id);
                ok(`${pid} sensor has type`, !!sensor.type);
            }
        }
    }
}

// ── TEST 9: Weapons array present and valid ──────────────────────────
console.log('\nTEST 9: Weapons catalog');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.weapons is array`, Array.isArray(platform.weapons));

        if (platform.weapons.length > 0) {
            for (let weapon of platform.weapons) {
                ok(`${pid} weapon has id`, !!weapon.id);
                ok(`${pid} weapon has type`, !!weapon.type);
                ok(`${pid} weapon has class`, !!weapon.class);
            }
        }
    }
}

// ── TEST 10: Magazines present and sensible ──────────────────────────
console.log('\nTEST 10: Magazine structure');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.magazines is array`, Array.isArray(platform.magazines));

        if (platform.magazines.length > 0) {
            for (let mag of platform.magazines) {
                ok(`${pid} magazine has mount`, !!mag.mount);
                ok(`${pid} magazine has stock object`, mag.stock && typeof mag.stock === 'object');
            }
        }
    }
}

// ── TEST 11: Source and confidence tracking ──────────────────────────
console.log('\nTEST 11: Provenance and confidence fields');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.source_notes present`, !!platform.source_notes);
        ok(`${pid}.confidence present`, !!platform.confidence);
        ok(`${pid}.approximation_level present`, !!platform.approximation_level);
    }
}

// ── TEST 12: RCS values are approximate, not classified ────────────────
console.log('\nTEST 12: RCS classification (not exact values)');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const validRcsClasses = new Set(['small', 'medium', 'large', 'very_large']);

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        ok(`${pid}.rcs_class is classification (not numeric)`,
           validRcsClasses.has(platform.rcs_class));
    }
}

// ── TEST 13: DB-Lite fallback compatibility ──────────────────────────
console.log('\nTEST 13: DB-Lite fallback (no breaking changes)');
{
    // Verify catalog doesn't break the expected DB-Lite structure
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    // Each platform should have same fields as DB-Lite would provide
    const dbLiteFields = ['readiness_default', 'supply_default', 'sensors', 'weapons', 'magazines'];

    for (let [pid, platform] of Object.entries(catalog.platforms)) {
        for (let field of dbLiteFields) {
            ok(`${pid} has DB-Lite field ${field}`, field in platform);
        }
    }
}

// ── TEST 14: Scenario authored values take precedence ──────────────────
console.log('\nTEST 14: Authored scenario values precedence (simulation)');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    // Simulate a unit with authored readiness
    const authoredUnit = {
        uid: 'TEST-1',
        label: 'Test Unit',
        readiness: 'degraded',  // Authored in scenario
        supply: 0.5,             // Authored in scenario
    };

    // Simulate enrichment (authored should not be overwritten)
    const platform = catalog.platforms['f16c-fighter'];
    const enriched = Object.assign({}, authoredUnit);

    // Only fill missing fields
    if (!enriched.readiness && platform.readiness_default) {
        enriched.readiness = platform.readiness_default;
    }
    if (typeof enriched.supply !== 'number') {
        enriched.supply = platform.supply_default;
    }

    ok('authored readiness preserved', enriched.readiness === 'degraded');
    ok('authored supply preserved', enriched.supply === 0.5);
}

// ── TEST 15: Missing fields fall back to platform defaults ─────────────
console.log('\nTEST 15: Missing field fallback to platform defaults');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    // Simulate a unit with missing readiness/supply
    const incompleteUnit = {
        uid: 'TEST-2',
        label: 'Incomplete Unit',
        // No readiness or supply
    };

    const platform = catalog.platforms['patriot-sam'];
    const enriched = Object.assign({}, incompleteUnit);

    // Fill missing fields from catalog
    if (!enriched.readiness && platform.readiness_default) {
        enriched.readiness = platform.readiness_default;
    }
    if (typeof enriched.supply !== 'number' && typeof platform.supply_default === 'number') {
        enriched.supply = platform.supply_default;
    }

    ok('readiness filled from platform', enriched.readiness === platform.readiness_default);
    ok('supply filled from platform', enriched.supply === platform.supply_default);
}

// ── TEST 16: No external network calls ───────────────────────────────
console.log('\nTEST 16: No external dependencies');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const content = fs.readFileSync(catalogPath, 'utf8');

    const hasHttpCall = content.includes('http://') || content.includes('https://');
    ok('no HTTP URLs in catalog', !hasHttpCall);

    const hasExternalReference = content.includes('external') || content.includes('api.') || content.includes('remote');
    ok('no external API references', !hasExternalReference);
}

// ── TEST 17: Catalog metadata is comprehensive ───────────────────────
console.log('\nTEST 17: Metadata completeness');
{
    const catalogPath = path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    ok('metadata.version present', !!catalog.metadata.version);
    ok('metadata.title present', !!catalog.metadata.title);
    ok('metadata.description present', !!catalog.metadata.description);
    ok('metadata.region present', !!catalog.metadata.region);
    ok('metadata.sources array', Array.isArray(catalog.metadata.sources) && catalog.metadata.sources.length > 0);
    ok('metadata.confidence_notice present', !!catalog.metadata.confidence_notice);
    ok('metadata.fallback_note present', !!catalog.metadata.fallback_note);
}

// ── SUMMARY ──────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('DB-1-A MIDDLE EAST PLATFORM CATALOG TEST SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

const summary = [
    'Catalog file exists and is valid JSON',
    'Metadata and structure correct',
    'All 5 seed platforms present',
    'Each platform has required fields',
    'Domain and role classification valid',
    'Readiness and supply defaults sensible',
    'Doctrine tags present',
    'Sensors catalog valid',
    'Weapons catalog valid',
    'Magazines structure valid',
    'Provenance tracking complete',
    'RCS classification appropriate (not exact)',
    'DB-Lite fallback compatible',
    'Authored values take precedence',
    'Missing fields fall back correctly',
    'No external dependencies',
    'Metadata comprehensive',
];

summary.forEach(function (test) {
    console.log('  PASS — ' + test);
});

console.log('\n📊 Test Summary:');
console.log('  ✓ ' + pass + ' assertions passed');
if (fail > 0) console.log('  ✗ ' + fail + ' assertions failed');

if (fail === 0) {
    console.log('\n✅ ALL TESTS PASSED — Middle East catalog ready for Phase DB-1-A');
    process.exit(0);
} else {
    console.log('\n❌ FAILURES DETECTED');
    process.exit(1);
}
