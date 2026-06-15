/**
 * test-unit-identity-contract-a.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A
 *
 * Standalone (no server). Validates the shared unit-identity resolver contract:
 * canonical id, synthetic-vs-authored display name, role-is-not-a-platform,
 * raw preservation, side normalization, and the LLM-facing identity block.
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

console.log('\nRMOOZ-UNIT-IDENTITY-CONTRACT-A\n');

// ── §1 Exports + version ──────────────────────────────────────────────
console.log('§1 module shape');
ok('exports the 4 contract functions', function () {
    ['resolveUnitIdentity', 'normalizeSelectedUnit', 'displayUnitName', 'unitIdentityForLlm']
        .forEach(function (k) { assert.strictEqual(typeof R[k], 'function', k); });
});
ok('carries a contract version', function () {
    assert.ok(/^rmooz-unit-identity\//.test(R.VERSION));
});

// ── §2 Authored names win (rule 4) ────────────────────────────────────
console.log('§2 authored display names');
ok('name_en is used as display name (high confidence)', function () {
    var id = resolve({ uid: 'B1', role: 'fighter', name_en: 'Desert Falcon Sqn', label: 'fighter-1' });
    assert.strictEqual(id.display_name, 'Desert Falcon Sqn');
    assert.strictEqual(id.source.display_name_source, 'name_en');
    assert.strictEqual(id.confidence, 'high');
    assert.deepStrictEqual(id.warnings, []);
});
ok('authored platform becomes display + platform_name', function () {
    var id = resolve({ uid: 'B2', role: 'fighter', platform: 'F-15 Eagle' });
    assert.strictEqual(id.platform_name, 'F-15 Eagle');
    assert.strictEqual(id.source.platform_source, 'platform');
    assert.strictEqual(id.display_name, 'F-15 Eagle');
    assert.strictEqual(id.source.display_name_source, 'platform');
});
ok('name_ar used when no latin authored name', function () {
    var id = resolve({ uid: 'B3', role: 'armor', name_ar: 'كتيبة الدبابات' });
    assert.strictEqual(id.display_name, 'كتيبة الدبابات');
    assert.strictEqual(id.source.display_name_source, 'name_ar');
});

// ── §3 Synthetic / low-confidence (rule 6) ────────────────────────────
console.log('§3 synthetic display names');
ok('label "fires-47" + uid "R-047" → synthetic, low confidence', function () {
    var id = resolve({ uid: 'R-047', role: 'fires', label: 'fires-47' });
    assert.strictEqual(id.display_name, 'fires-47');         // displayed
    assert.strictEqual(id.uid, 'R-047');                     // but uid kept
    assert.strictEqual(id.confidence, 'low');
    assert.deepStrictEqual(id.warnings, ['synthetic_display_name']);
    assert.strictEqual(id.source.display_name_source, 'label_synthetic');
});
ok('synthetic detector matches role-index patterns only', function () {
    assert.strictEqual(R._isSyntheticName('fires-47', 'fires'), true);
    assert.strictEqual(R._isSyntheticName('armor_3', 'armor'), true);
    assert.strictEqual(R._isSyntheticName('infantry 12', null), true);  // role-token prefix
    assert.strictEqual(R._isSyntheticName('R-047', 'fires'), false);    // uid/code, not synthetic
    assert.strictEqual(R._isSyntheticName('BLUE_lc', 'recon'), false);  // no trailing digits
    assert.strictEqual(R._isSyntheticName('Tomcat-1', 'fighter'), false); // real name prefix
});
ok('uid-only unit falls back to uid as low-confidence synthetic', function () {
    var id = resolve({ uid: 'X9', role: 'recon' });
    assert.strictEqual(id.display_name, 'X9');
    assert.strictEqual(id.confidence, 'low');
    assert.ok(id.warnings.indexOf('synthetic_display_name') >= 0);
});

// ── §4 Role is NOT a platform (rule 5) ────────────────────────────────
console.log('§4 role is not a platform');
ok('role-only "fires" never becomes platform_name', function () {
    var id = resolve({ uid: 'R-047', role: 'fires', platform: 'fires', label: 'fires-47' });
    assert.strictEqual(id.platform_name, 'unknown');
    assert.strictEqual(id.source.platform_source, 'none');
});
ok('generic "UNIT"/"unit_type" is rejected as platform', function () {
    var id = resolve({ uid: 'R-1', role: 'armor', unit_type: 'UNIT' });
    assert.strictEqual(id.platform_name, 'unknown');
});
ok('role-only detector', function () {
    assert.strictEqual(R._isRoleOnly('fires', 'fires'), true);
    assert.strictEqual(R._isRoleOnly('UNIT', 'armor'), true);
    assert.strictEqual(R._isRoleOnly('F-15 Eagle', 'fighter'), false);
});

// ── §5 Canonical id (rule 3) ──────────────────────────────────────────
console.log('§5 canonical id normalization');
ok('uid/unit_uid/id all resolve to one stable value', function () {
    var a = resolve({ uid: 'R-047', role: 'fires' });
    assert.strictEqual(a.uid, 'R-047');
    assert.strictEqual(a.unit_uid, 'R-047');
    assert.strictEqual(a.id, 'R-047');
    var b = resolve({ unit_uid: 'BLUE_lc', role: 'recon' });
    assert.strictEqual(b.uid, 'BLUE_lc');
    assert.strictEqual(b.unit_uid, 'BLUE_lc');
    assert.strictEqual(b.id, 'BLUE_lc');
    assert.strictEqual(b.source.identity_source, 'unit_uid');
});

// ── §6 Side normalization ─────────────────────────────────────────────
console.log('§6 side / affiliation');
ok('hostile → RED, friendly → BLUE', function () {
    assert.strictEqual(resolve({ uid: 'a' }, { side: 'hostile' }).side_normalized, 'RED');
    assert.strictEqual(resolve({ uid: 'b' }, { side: 'friendly' }).side_normalized, 'BLUE');
    assert.strictEqual(resolve({ uid: 'c', side: 'RED' }).affiliation, 'hostile');
    assert.strictEqual(resolve({ uid: 'd', side: 'BLUE' }).affiliation, 'friendly');
});

// ── §7 Raw preservation + no mutation (rules 1, 2) ────────────────────
console.log('§7 normalizeSelectedUnit preserves raw, no mutation');
ok('marker _unitData preserves full raw fields', function () {
    var raw = {
        uid: 'R-047', role: 'fires', label: 'fires-47', sidc: '10061000151303000000',
        domain: 'ground', echelon: 'battalion', country: 'UAE', bls: 'BLS-1',
        sensors: ['eo'], weapons: ['155mm'], coord: [54.3, 24.4],
    };
    var frozen = JSON.stringify(raw);
    var out = normalize(raw, { side: 'hostile', live_lat: 24.41, live_lng: 54.31, scenario: true });
    // raw untouched
    assert.strictEqual(JSON.stringify(raw), frozen, 'raw must not mutate');
    // original fields preserved on the copy
    assert.deepStrictEqual(out.sensors, ['eo']);
    assert.deepStrictEqual(out.weapons, ['155mm']);
    assert.strictEqual(out.bls, 'BLS-1');
    assert.strictEqual(out.country, 'UAE');
    assert.strictEqual(out.sidc, '10061000151303000000');
    // normalized overlays
    assert.strictEqual(out.uid, 'R-047');
    assert.strictEqual(out.side, 'hostile');
    assert.strictEqual(out.lat, 24.41);
    assert.strictEqual(out.lng, 54.31);
    assert.strictEqual(out._scenario, true);
    // identity attached
    assert.ok(out.identity && out.identity.display_name === 'fires-47');
    assert.ok(out.unit_identity && out.unit_identity.uid === 'R-047');
});

// ── §8 displayUnitName is the same everywhere ─────────────────────────
console.log('§8 displayUnitName consistency');
ok('panel hero name == resolver display name', function () {
    var raw = { uid: 'R-047', role: 'fires', label: 'fires-47' };
    var fromResolve = resolve(raw).display_name;
    var fromHelper = displayName(raw);
    var fromNormalized = displayName(normalize(raw, { side: 'hostile' }));
    assert.strictEqual(fromHelper, fromResolve);
    assert.strictEqual(fromNormalized, fromResolve);
    assert.strictEqual(fromHelper, 'fires-47');
});
ok('displayUnitName reuses an already-resolved identity', function () {
    var n = normalize({ uid: 'B2', platform: 'F-15 Eagle', role: 'fighter' }, {});
    assert.strictEqual(displayName(n), 'F-15 Eagle');
});

// ── §9 LLM identity block ─────────────────────────────────────────────
console.log('§9 unitIdentityForLlm');
ok('LLM block carries id, synthetic warning, platform unknown', function () {
    var llm = forLlm({ uid: 'R-047', role: 'fires', domain: 'ground', label: 'fires-47' });
    assert.strictEqual(llm.uid, 'R-047');
    assert.strictEqual(llm.display_name, 'fires-47');
    assert.strictEqual(llm.role, 'fires');
    assert.strictEqual(llm.domain, 'ground');
    assert.strictEqual(llm.platform_name, 'unknown');           // NOT "fires"
    assert.strictEqual(llm.identity_confidence, 'low');
    assert.strictEqual(llm.warning, 'synthetic_display_name');
});
ok('LLM block for an authored platform has no warning', function () {
    var llm = forLlm({ uid: 'B2', role: 'fighter', domain: 'air', platform: 'F-15 Eagle' });
    assert.strictEqual(llm.platform_name, 'F-15 Eagle');
    assert.strictEqual(llm.warning, null);
    assert.strictEqual(llm.identity_confidence, 'high');
});

// ── §10 Red + Blue both normalize; arbitrary scenario ─────────────────
console.log('§10 red + blue + arbitrary scenario');
ok('blue unit with base_id resolves cleanly', function () {
    var id = resolve({ unit_uid: 'BLUE_lc', base_id: 'AB-001', role: 'air_defense', name_en: 'Liwa Air Defense' }, { side: 'friendly' });
    assert.strictEqual(id.uid, 'BLUE_lc');
    assert.strictEqual(id.code, 'AB-001');
    assert.strictEqual(id.display_name, 'Liwa Air Defense');
    assert.strictEqual(id.side_normalized, 'BLUE');
});
ok('arbitrary scenario unit (unknown fields) does not throw', function () {
    var id = resolve({ some_id: 'zzz', weird: true });
    assert.ok(id);                       // no throw
    assert.strictEqual(id.uid, null);    // no canonical id
    assert.ok(id.warnings.indexOf('no_stable_id') >= 0);
});
ok('null / non-object input is safe', function () {
    assert.strictEqual(resolve(null).display_name, '—');
    assert.strictEqual(displayName(undefined), '—');
});

console.log('\n✅ ' + pass + ' assertions passed (test-unit-identity-contract-a.js)\n');
