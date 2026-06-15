/**
 * test-platform-identity-enrichment-a.js — RMOOZ-PLATFORM-IDENTITY-ENRICHMENT-A
 *
 * The platform-display precedence chain + provenance:
 *   F-16 → "F-16 Fighting Falcon" (not "Fighter Aircraft"); Tomcat/F-14 → "F-14 Tomcat";
 *   S-300 → "S-300 SAM Battery"; bare "fires" → "Rocket Artillery Battery" + generic/review;
 *   never invent an exact platform; honest provenance.
 */
'use strict';
var assert = require('assert');
var path = require('path');
var E = require(path.join(__dirname, 'UI_MOdified/client/shared/platform-identity-enrichment.js'));

var pass = 0;
function ok(n, fn) { fn(); pass++; console.log('  ✓ ' + n); }

console.log('\nRMOOZ-PLATFORM-IDENTITY-ENRICHMENT-A\n');

// ── §1 module shape ───────────────────────────────────────────────────
console.log('§1 module shape');
ok('exports catalog, matcher, enrichPlatform, capability labels', function () {
    assert.ok(Array.isArray(E.PLATFORM_CATALOG) && E.PLATFORM_CATALOG.length > 10);
    assert.strictEqual(typeof E.matchPlatformMention, 'function');
    assert.strictEqual(typeof E.enrichPlatform, 'function');
    assert.strictEqual(E.CAPABILITY_LABELS.fires, 'Rocket Artillery Battery');
});

// ── §2 mention matcher ────────────────────────────────────────────────
console.log('§2 platform mention matcher');
ok('F-16 / Tomcat / S-300 / embedded mentions match; role words do not', function () {
    assert.strictEqual(E.matchPlatformMention('F-16').display, 'F-16 Fighting Falcon');
    assert.strictEqual(E.matchPlatformMention('Tomcat').display, 'F-14 Tomcat');
    assert.strictEqual(E.matchPlatformMention('F-14').display, 'F-14 Tomcat');
    assert.strictEqual(E.matchPlatformMention('S-300').display, 'S-300 SAM Battery');
    assert.strictEqual(E.matchPlatformMention('1x F-16C squadron').display, 'F-16 Fighting Falcon');
    assert.strictEqual(E.matchPlatformMention('S-300 battery deployed').display, 'S-300 SAM Battery');
    // bare role words must NOT match a platform
    ['fighter', 'fires', 'sam', 'armor', 'radar', 'infantry'].forEach(function (r) {
        assert.strictEqual(E.matchPlatformMention(r), null, r + ' wrongly matched a platform');
    });
    // synthetic role-index labels must not match
    assert.strictEqual(E.matchPlatformMention('fighter-20'), null);
    assert.strictEqual(E.matchPlatformMention('sam-9'), null);
});

// ── §3 the 5 spec examples ────────────────────────────────────────────
console.log('§3 spec examples');
ok('document says F-16 → F-16 Fighting Falcon, not Fighter Aircraft', function () {
    var r = E.enrichPlatform({ role: 'fighter', platform: 'F-16' }, { role: 'fighter' });
    assert.ok(/F-16 Fighting Falcon/.test(r.label), 'got: ' + r.label);
    assert.notStrictEqual(r.label, 'Fighter Aircraft');
    assert.strictEqual(r.provenance, 'authored');
    assert.strictEqual(r.generic, false);
});
ok('Tomcat / F-14 → F-14 Tomcat', function () {
    assert.strictEqual(E.enrichPlatform({ role: 'fighter', platform: 'Tomcat' }, { role: 'fighter' }).label, 'F-14 Tomcat');
    assert.strictEqual(E.enrichPlatform({ role: 'fighter', name: 'F-14 squadron' }, { role: 'fighter' }).label, 'F-14 Tomcat');
});
ok('S-300 → S-300 SAM Battery', function () {
    var r = E.enrichPlatform({ role: 'sam', platform: 'S-300' }, { role: 'sam' });
    assert.strictEqual(r.label, 'S-300 SAM Battery');
    assert.strictEqual(r.provenance, 'authored');
});
ok('only "fires" → Rocket Artillery Battery + generic/review', function () {
    var r = E.enrichPlatform({ role: 'fires' }, { role: 'fires' });
    assert.strictEqual(r.label, 'Rocket Artillery Battery');
    assert.strictEqual(r.provenance, 'generic_fallback');
    assert.strictEqual(r.generic, true);
    assert.strictEqual(r.review, true);
});
ok('only "fighter" → Fighter Aircraft generic (NO invented F-16)', function () {
    var r = E.enrichPlatform({ role: 'fighter' }, { role: 'fighter' });
    assert.strictEqual(r.label, 'Fighter Aircraft');
    assert.strictEqual(r.provenance, 'generic_fallback');
    assert.ok(!/F-16|F-14|Falcon|Tomcat/.test(r.label), 'invented an exact platform: ' + r.label);
});

// ── §4 precedence + provenance ────────────────────────────────────────
console.log('§4 precedence + provenance');
ok('authored beats DB-Lite beats document beats catalog beats generic', function () {
    // authored wins over everything
    var a = E.enrichPlatform({ role: 'fighter', platform: 'F-15' }, { role: 'fighter', dbLitePlatform: 'F-16 Fighting Falcon', documentEquipment: 'Tomcat', catalogPlatform: 'Rafale' });
    assert.strictEqual(a.label, 'F-15 Eagle');
    assert.strictEqual(a.provenance, 'authored');
    // DB-Lite exact (no authored)
    var b = E.enrichPlatform({ role: 'fighter' }, { role: 'fighter', dbLitePlatform: 'F-16C Fighting Falcon', documentEquipment: 'Tomcat' });
    assert.strictEqual(b.provenance, 'db_lite_exact');
    assert.ok(/Fighting Falcon/.test(b.label));
    // document extracted (no authored, no DB-Lite)
    var c = E.enrichPlatform({ role: 'sam', document_equipment: 'S-300 launchers reported' }, { role: 'sam' });
    assert.strictEqual(c.provenance, 'document_extracted');
    assert.strictEqual(c.label, 'S-300 SAM Battery');
    assert.strictEqual(c.confidence, 'medium');
    // catalog mapping (caller-supplied)
    var d = E.enrichPlatform({ role: 'armor' }, { role: 'armor', catalogPlatform: 'T-72' });
    assert.strictEqual(d.provenance, 'catalog');
    assert.strictEqual(d.label, 'T-72 Main Battle Tank');
});
ok('never invents: thin armor/radar/sam units fall back to generic, flagged', function () {
    ['armor', 'radar', 'sam', 'infantry', 'recon'].forEach(function (role) {
        var r = E.enrichPlatform({ role: role }, { role: role });
        assert.strictEqual(r.provenance, 'generic_fallback', role);
        assert.strictEqual(r.generic, true);
        assert.strictEqual(r.label, E.CAPABILITY_LABELS[role]);
    });
});

console.log('\n✅ ' + pass + ' assertions passed (test-platform-identity-enrichment-a.js)\n');
