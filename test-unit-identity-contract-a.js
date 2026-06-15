/**
 * test-unit-identity-contract-a.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A (v2 contract)
 *
 * Standalone (no server). Identity model (owner ruling 2026-06-15):
 *   internalKey/uid = system key (R-047, kept) · canonicalId = stable authored id
 *   (fires-47) · tacticalCode = R-047 · displayName = real platform/capability name
 *   (NEVER the raw code or synthetic key) · type never degrades to UNIT/generic.
 */
'use strict';
var assert = require('assert');
var path = require('path');

var R = require(path.join(__dirname, 'UI_MOdified/client/shared/unit-identity-resolver.js'));
var resolve = R.resolveUnitIdentity;
var normalize = R.normalizeSelectedUnit;
var displayName = R.displayUnitName;
var forLlm = R.unitIdentityForLlm;

var pass = 0;
function ok(name, fn) { fn(); pass++; console.log('  ✓ ' + name); }

console.log('\nRMOOZ-UNIT-IDENTITY-CONTRACT-A (v2)\n');

// ── §1 module shape ───────────────────────────────────────────────────
console.log('§1 module shape');
ok('exports the 4 contract functions + v2 version', function () {
    ['resolveUnitIdentity', 'normalizeSelectedUnit', 'displayUnitName', 'unitIdentityForLlm']
        .forEach(function (k) { assert.strictEqual(typeof R[k], 'function', k); });
    assert.strictEqual(R.VERSION, 'rmooz-unit-identity/2.0');
});

// ── §2 THE owner-specified input (item 4) ─────────────────────────────
console.log('§2 owner item-4 input');
ok('{ uid:fires-47, id:fires-47, side:red, type:fires, name:R-047 } resolves correctly', function () {
    var id = resolve({ uid: 'fires-47', id: 'fires-47', side: 'red', type: 'fires', name: 'R-047' });
    assert.strictEqual(id.canonicalId, 'fires-47', 'canonicalId');
    assert.strictEqual(id.internalKey, 'fires-47', 'internalKey (uid field is fires-47 here)');
    assert.strictEqual(id.uid, 'fires-47');
    assert.strictEqual(id.tacticalCode, 'R-047', 'R-047 (code-like name) → tacticalCode');
    assert.notStrictEqual(id.displayName, 'R-047', 'displayName must NOT be the raw code');
    assert.notStrictEqual(id.displayName, 'fires-47', 'displayName must NOT be the synthetic key');
    assert.strictEqual(id.displayName, 'Rocket Artillery Battery', 'fires → capability name');
    assert.strictEqual(id.typeLabel, 'Fires', 'type must not degrade to UNIT/generic');
    assert.strictEqual(id.side_normalized, 'RED');
});

// ── §3 the REAL scenario data shape (uid=R-047, label=fires-47) ───────
console.log('§3 real data: uid=R-047, label=fires-47');
ok('canonicalId=fires-47 (label), internalKey/uid=R-047 (kept), tacticalCode=R-047', function () {
    var id = resolve({ uid: 'R-047', label: 'fires-47', role: 'fires', side: 'red' });
    assert.strictEqual(id.internalKey, 'R-047', 'system key kept as R-047 (no sim change)');
    assert.strictEqual(id.uid, 'R-047');
    assert.strictEqual(id.canonicalId, 'fires-47', 'authored role-index key → canonicalId');
    assert.strictEqual(id.tacticalCode, 'R-047', 'R-code → tacticalCode');
    assert.strictEqual(id.displayName, 'Rocket Artillery Battery', 'real capability name, not a code/key');
    assert.notStrictEqual(id.displayName, 'R-047');
    assert.notStrictEqual(id.displayName, 'fires-47');
});
ok('display/type do NOT degrade to UNIT/generic for assorted roles', function () {
    var armor = resolve({ uid: 'R-001', label: 'armor-1', role: 'armor', side: 'red' });
    assert.strictEqual(armor.typeLabel, 'Armor');
    assert.strictEqual(armor.displayName, 'Armored / Tank Unit');
    var uav = resolve({ uid: 'R-003', label: 'uav-3', role: 'uav', side: 'red' });
    assert.strictEqual(uav.displayName, 'Unmanned Aerial Vehicle');
    var sam = resolve({ uid: 'R-009', label: 'sam-9', role: 'sam', side: 'red' });
    assert.strictEqual(sam.displayName, 'Surface-to-Air Missile Battery');
    // None may degrade to the bare placeholder forms.
    [armor, uav, sam].forEach(function (id) {
        assert.ok(!/^(unit|generic)$/i.test(id.displayName), 'bare degraded name: ' + id.displayName);
        assert.ok(!/\(default\)/i.test(id.displayName), 'default placeholder: ' + id.displayName);
        assert.ok(!/^(unit|generic)$/i.test(id.typeLabel || ''), 'bare type: ' + id.typeLabel);
    });
});

// ── §4 authored real names + DB-Lite specific platform win ────────────
console.log('§4 authored / DB-Lite specific names');
ok('authored name_en becomes displayName', function () {
    var id = resolve({ unit_uid: 'BLUE_adf', base_id: 'AB-204', role: 'air_defense', name_en: 'Liwa Air Defense Bn' }, { side: 'friendly' });
    assert.strictEqual(id.displayName, 'Liwa Air Defense Bn');
    assert.strictEqual(id.internalKey, 'BLUE_adf');
    assert.strictEqual(id.canonicalId, 'BLUE_adf');
    assert.strictEqual(id.side_normalized, 'BLUE');
});
ok('DB-Lite specific platform label (injected) becomes displayName + platformLabel', function () {
    var id = resolve({ uid: 'R-047', label: 'fires-47', role: 'fires' }, { platformLabel: 'BM-21 Grad' });
    assert.strictEqual(id.platformLabel, 'BM-21 Grad');
    assert.strictEqual(id.displayName, 'BM-21 Grad');
});

// ── §5 DB-Lite does NOT overwrite explicit scenario identity ──────────
console.log('§5 DB-Lite must not override authored identity');
ok('authored name beats an injected DB-Lite label', function () {
    var id = resolve(
        { uid: 'R-047', label: 'fires-47', role: 'fires', name_en: 'Northern Rocket Group' },
        { platformLabel: 'Generic SAM (default)', classLabel: 'ground_unit (default)' });
    assert.strictEqual(id.displayName, 'Northern Rocket Group', 'authored identity must win');
    assert.strictEqual(id.source.display_name_source, 'name_en');
});

// ── §6 stale copy resolves from canonical scenario lookup ─────────────
console.log('§6 stale-copy canonical reconciliation');
ok('degraded marker copy re-resolves identity from the scenario', function () {
    var scenario = { red_units: [{ uid: 'R-047', label: 'fires-47', role: 'fires', domain: 'ground', sidc: '100610...' }] };
    // A stale copy that lost label/role/domain but kept the system key + live coords.
    var stale = { uid: 'R-047', lat: 24.41, lng: 54.31 };
    var id = resolve(stale, { scenario: scenario, side: 'red' });
    assert.strictEqual(id.canonicalId, 'fires-47', 'recovered authored key');
    assert.strictEqual(id.role, 'fires', 'recovered role');
    assert.strictEqual(id.displayName, 'Rocket Artillery Battery', 'recovered capability name');
    assert.strictEqual(id.typeLabel, 'Fires');
    assert.ok(id.warnings.indexOf('resolved_from_canonical') >= 0);
});
ok('canonicalUnits array lookup also works', function () {
    var id = resolve({ uid: 'R-001' }, { canonicalUnits: [{ uid: 'R-001', label: 'armor-1', role: 'armor' }] });
    assert.strictEqual(id.canonicalId, 'armor-1');
    assert.strictEqual(id.displayName, 'Armored / Tank Unit');
});

// ── §7 detectors ──────────────────────────────────────────────────────
console.log('§7 detectors');
ok('tactical-code vs role-index discrimination', function () {
    assert.strictEqual(R._looksLikeTacticalCode('R-047'), true);
    assert.strictEqual(R._looksLikeTacticalCode('B-012'), true);
    assert.strictEqual(R._looksLikeTacticalCode('fires-47'), false); // role-index, not a code
    assert.strictEqual(R._looksLikeTacticalCode('BLUE_lc'), false);
    assert.strictEqual(R._isRoleIndexKey('fires-47', 'fires'), true);
    assert.strictEqual(R._isRoleIndexKey('armor_3', null), true);
    assert.strictEqual(R._isRoleIndexKey('R-047', 'fires'), false);
});

// ── §8 normalizeSelectedUnit: preserve raw, keep system key, no mutate ──
console.log('§8 normalizeSelectedUnit');
ok('marker _unitData keeps system key R-047, preserves raw, attaches identity', function () {
    var raw = { uid: 'R-047', label: 'fires-47', role: 'fires', sidc: '10061000151303000000', domain: 'ground', sensors: ['eo'], coord: [54.3, 24.4] };
    var frozen = JSON.stringify(raw);
    var out = normalize(raw, { side: 'hostile', live_lat: 24.41, live_lng: 54.31, scenario: true });
    assert.strictEqual(JSON.stringify(raw), frozen, 'raw must not mutate');
    assert.deepStrictEqual(out.sensors, ['eo']);
    assert.strictEqual(out.sidc, '10061000151303000000');
    assert.strictEqual(out.uid, 'R-047', 'system key kept');
    assert.strictEqual(out.id, 'R-047');
    assert.strictEqual(out.name, 'Rocket Artillery Battery', 'display name overlaid');
    assert.strictEqual(out.canonical_id, 'fires-47');
    assert.strictEqual(out.tactical_code, 'R-047');
    assert.strictEqual(out.lat, 24.41);
    assert.ok(out.identity && out.identity.canonicalId === 'fires-47');
});

// ── §9 displayUnitName consistency ────────────────────────────────────
console.log('§9 displayUnitName');
ok('panel/marker/AI all yield the same display name', function () {
    var raw = { uid: 'R-047', label: 'fires-47', role: 'fires' };
    var a = resolve(raw).displayName;
    assert.strictEqual(displayName(raw), a);
    assert.strictEqual(displayName(normalize(raw, { side: 'red' })), a);
    assert.strictEqual(forLlm(raw).display_name, a);
    assert.strictEqual(a, 'Rocket Artillery Battery');
});

// ── §10 LLM block keeps the linking uid + real platform ───────────────
console.log('§10 unitIdentityForLlm');
ok('LLM block: uid=R-047 (linking), canonical=fires-47, real display, platform unknown', function () {
    var llm = forLlm({ uid: 'R-047', label: 'fires-47', role: 'fires', domain: 'ground' });
    assert.strictEqual(llm.uid, 'R-047', 'keep system key for engine linking');
    assert.strictEqual(llm.canonical_id, 'fires-47');
    assert.strictEqual(llm.tactical_code, 'R-047');
    assert.strictEqual(llm.display_name, 'Rocket Artillery Battery');
    assert.strictEqual(llm.platform_name, 'unknown');     // no exact platform claimed
    assert.strictEqual(llm.role, 'fires');
    assert.strictEqual(llm.domain, 'ground');
});

// ── §11 safety ─────────────────────────────────────────────────────────
console.log('§11 safety');
ok('null / non-object input is safe', function () {
    assert.strictEqual(resolve(null).displayName, '—');
    assert.strictEqual(displayName(undefined), '—');
    assert.ok(resolve({}).warnings.indexOf('no_internal_key') >= 0);
});

console.log('\n✅ ' + pass + ' assertions passed (test-unit-identity-contract-a.js)\n');
