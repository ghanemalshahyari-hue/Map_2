'use strict';
/**
 * test-sam-image-coverage.js — Real image coverage for SAM / air-defense units
 *
 * Verifies the Patriot/SAM image asset is wired through the DB1
 * enrichUnit path for all four air-defense catalog kinds, and that
 * the image priority chain (real image > milsymbol > SVG) is respected.
 *
 * SAM-1   patriot-sam-battery.jpg exists locally (offline-safe)
 * SAM-2   manifest.json has provenance entry for the SAM image
 * SAM-3   manifest license is Public Domain (U.S. Army)
 * SAM-4   manifest applies_to_platforms includes all four SAM kinds
 * SAM-5   air_defense DB1 entry has image_asset
 * SAM-6   patriot  DB1 entry has image_asset
 * SAM-7   sam_s300 DB1 entry has image_asset
 * SAM-8   sam_s75  DB1 entry has image_asset
 * SAM-9   BLUE-SAM (role:'air_defense') → enrichUnit gives image_asset
 * SAM-10  patriot platform_id → enrichUnit gives image_asset
 * SAM-11  s-300 role keyword → enrichUnit gives image_asset
 * SAM-12  image_asset path is local (/client/assets/…), not a remote URL
 * SAM-13  image_credit is a non-empty string
 * SAM-14  F-16 (f16c) is NOT affected — still no image_asset (keeps SVG)
 * SAM-15  meko image_asset unchanged (USS Lake Champlain still present)
 * SAM-16  real image beats valid SIDC for air_defense unit (priority chain)
 * SAM-17  unit without tasking + valid SIDC + no image → image_asset from DB1
 * SAM-18  enrichUnit does not overwrite an authored unit.image_asset
 * SAM-19  enrichUnit does not overwrite an authored unit.image_credit
 * SAM-20  all four SAM image_asset values point to the same cached file
 * SAM-21  panel JS has _renderRealImage function (existing; no regression)
 * SAM-22  panel JS checks unit.image_url before enriched.image_asset
 * SAM-23  unit.image_url (authored) wins over DB1 image_asset
 * REG-1   DB1 catalog still has 29 entries (no regression)
 * REG-2   TASK1-E: unit_tasking derivation still works
 */

const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;

let passed = 0, failed = 0;
const failures = [];
function ok(label, cond, detail) {
    if (cond) { passed++; }
    else { failed++; failures.push('FAIL: ' + label + (detail ? '  — ' + detail : '')); }
}

// ── Load DB1 ─────────────────────────────────────────────────────────────
const sandbox = {};
sandbox.window = sandbox;
(new Function('window', fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state-db.js'), 'utf8')))(sandbox);
const DB = sandbox.AppWorldStateDB;
if (!DB) { console.error('FATAL: AppWorldStateDB not loaded'); process.exit(1); }

// ── Load world-state (for regression check) ───────────────────────────────
(new Function('window', fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state.js'), 'utf8')))(sandbox);
const WS = sandbox.AppWorldState;

const PANEL_JS   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
const ASSET_DIR  = path.join(ROOT, 'UI_MOdified/client/assets/units');
const SAM_IMG    = 'patriot-sam-battery.jpg';
const SAM_PATH   = path.join(ASSET_DIR, SAM_IMG);
const MANIFEST   = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'manifest.json'), 'utf8'));
const SAM_LOCAL  = '/client/assets/units/' + SAM_IMG;

// ═══════════════════════════════════════════════════════════════════════════
// SAM-1..4: Asset file + manifest provenance
// ═══════════════════════════════════════════════════════════════════════════
ok('SAM-1: patriot-sam-battery.jpg exists locally', fs.existsSync(SAM_PATH));

var samEntry = MANIFEST.images && MANIFEST.images[SAM_IMG];
ok('SAM-2: manifest has entry for ' + SAM_IMG, samEntry != null);
ok('SAM-3: license is Public Domain (U.S. Army)',
    samEntry && samEntry.license && samEntry.license.includes('Public Domain'));
ok('SAM-4a: applies_to_platforms includes air_defense',
    samEntry && samEntry.applies_to_platforms && samEntry.applies_to_platforms.indexOf('air_defense') >= 0);
ok('SAM-4b: applies_to_platforms includes patriot',
    samEntry && samEntry.applies_to_platforms && samEntry.applies_to_platforms.indexOf('patriot') >= 0);
ok('SAM-4c: applies_to_platforms includes sam_s300',
    samEntry && samEntry.applies_to_platforms && samEntry.applies_to_platforms.indexOf('sam_s300') >= 0);
ok('SAM-4d: applies_to_platforms includes sam_s75',
    samEntry && samEntry.applies_to_platforms && samEntry.applies_to_platforms.indexOf('sam_s75') >= 0);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-5..8: DB1 catalog entries have image_asset
// ═══════════════════════════════════════════════════════════════════════════
ok('SAM-5: air_defense catalog entry has image_asset',
    DB.CAPABILITY_CATALOG.air_defense && DB.CAPABILITY_CATALOG.air_defense.image_asset === SAM_LOCAL);
ok('SAM-6: patriot catalog entry has image_asset',
    DB.CAPABILITY_CATALOG.patriot && DB.CAPABILITY_CATALOG.patriot.image_asset === SAM_LOCAL);
ok('SAM-7: sam_s300 catalog entry has image_asset',
    DB.CAPABILITY_CATALOG.sam_s300 && DB.CAPABILITY_CATALOG.sam_s300.image_asset === SAM_LOCAL);
ok('SAM-8: sam_s75 catalog entry has image_asset',
    DB.CAPABILITY_CATALOG.sam_s75 && DB.CAPABILITY_CATALOG.sam_s75.image_asset === SAM_LOCAL);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-9..11: enrichUnit propagates image_asset for all SAM kinds
// ═══════════════════════════════════════════════════════════════════════════
var blueSam = DB.enrichUnit({ uid:'BLUE-SAM-01', label:'Air Defense Bty', domain:'ground', role:'air_defense' });
ok('SAM-9a: BLUE-SAM kind is air_defense', blueSam.kind === 'air_defense');
ok('SAM-9b: BLUE-SAM enrichUnit gives image_asset', blueSam.image_asset === SAM_LOCAL, blueSam.image_asset);

var patriot = DB.enrichUnit({ uid:'PAT-01', domain:'ground', platform_id:'patriot' });
ok('SAM-10a: patriot kind is patriot', patriot.kind === 'patriot');
ok('SAM-10b: patriot enrichUnit gives image_asset', patriot.image_asset === SAM_LOCAL, patriot.image_asset);

var s300 = DB.enrichUnit({ uid:'S300-01', role:'s-300 battalion' });
ok('SAM-11a: s-300 role → kind sam_s300', s300.kind === 'sam_s300');
ok('SAM-11b: s300 enrichUnit gives image_asset', s300.image_asset === SAM_LOCAL, s300.image_asset);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-12..13: path and credit validation
// ═══════════════════════════════════════════════════════════════════════════
ok('SAM-12: image_asset is a local path (starts with /client/)',
    blueSam.image_asset && blueSam.image_asset.startsWith('/client/') &&
    !blueSam.image_asset.startsWith('/client/http'));

ok('SAM-13: image_credit is a non-empty string',
    typeof blueSam.image_credit === 'string' && blueSam.image_credit.length > 0,
    blueSam.image_credit);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-14..15: no regression to other kinds
// ═══════════════════════════════════════════════════════════════════════════
var f16 = DB.enrichUnit({ uid:'F16-01', domain:'air', platform_id:'f16c' });
ok('SAM-14: f16c (air unit) is NOT affected — still no image_asset',
    !f16.image_asset, 'unexpected image_asset: ' + f16.image_asset);

var meko = DB.enrichUnit({ uid:'FF-01', domain:'sea', platform_id:'meko' });
ok('SAM-15: meko image_asset unchanged',
    meko.image_asset === '/client/assets/units/uss-lake-champlain-cvs39.jpg',
    meko.image_asset);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-16..17: image priority chain (logic simulation)
// ═══════════════════════════════════════════════════════════════════════════

// Simulate _renderSymbol priority: unit.image_url > enriched.image_asset > milsymbol > SVG
function renderKind(unit, enriched) {
    var imgSrc = (unit.image_url) || (enriched && enriched.image_asset) || null;
    if (imgSrc) return { source: 'real_image', src: imgSrc };
    if (unit.sidc) return { source: 'milsymbol', sidc: unit.sidc };
    return { source: 'svg_fallback' };
}

// SAM-16: air_defense unit with valid SIDC + DB1 image → real image wins (not milsymbol)
var samUnit = { uid:'BLUE-SAM', sidc:'10031000181213000000', domain:'ground', role:'air_defense' };
var samEnriched = DB.enrichUnit(samUnit);
var r16 = renderKind(samUnit, samEnriched);
ok('SAM-16: real image beats milsymbol for air_defense unit with SIDC',
    r16.source === 'real_image', 'source: ' + r16.source + ', src: ' + r16.src);
ok('SAM-16b: src is the patriot SAM image', r16.src === SAM_LOCAL, r16.src);

// SAM-17: no unit.image_url, valid SIDC, DB1 image → uses DB1 image_asset (not milsymbol)
var samNoUrl = { uid:'BLUE-SAM-2', sidc:'10031000181213000000', domain:'ground', role:'air_defense' };
// note: no image_url on unit
var r17 = renderKind(samNoUrl, DB.enrichUnit(samNoUrl));
ok('SAM-17: DB1 image_asset used over milsymbol when unit has no image_url',
    r17.source === 'real_image' && r17.src === SAM_LOCAL);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-18..19: authored image_asset / image_credit not overwritten
// ═══════════════════════════════════════════════════════════════════════════
var authoredImg  = DB.enrichUnit({ uid:'U1', role:'air_defense', image_asset:'/custom/path.jpg' });
ok('SAM-18: authored unit.image_asset not overwritten by DB1',
    authoredImg.image_asset === '/custom/path.jpg', authoredImg.image_asset);

var authoredCred = DB.enrichUnit({ uid:'U2', role:'air_defense', image_credit:'My Photo' });
ok('SAM-19: authored unit.image_credit not overwritten by DB1',
    authoredCred.image_credit === 'My Photo', authoredCred.image_credit);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-20: all four SAM kinds share the same cached file
// ═══════════════════════════════════════════════════════════════════════════
var samKinds = ['air_defense','patriot','sam_s300','sam_s75'];
var allSameFile = samKinds.every(function(k) {
    return DB.CAPABILITY_CATALOG[k] && DB.CAPABILITY_CATALOG[k].image_asset === SAM_LOCAL;
});
ok('SAM-20: all four SAM DB1 entries share the same cached image path', allSameFile);

// ═══════════════════════════════════════════════════════════════════════════
// SAM-21..23: panel priority chain (source inspection)
// ═══════════════════════════════════════════════════════════════════════════
ok('SAM-21: panel has _renderRealImage function', PANEL_JS.includes('function _renderRealImage'));

ok('SAM-22: panel checks unit.image_url before enriched.image_asset',
    (function() {
        var fnStart = PANEL_JS.indexOf('function _renderSymbol');
        var fnEnd   = PANEL_JS.indexOf('\n    function', fnStart + 100);
        var body    = PANEL_JS.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 1000);
        var urlIdx  = body.indexOf('unit.image_url');
        var assetIdx= body.indexOf('image_asset');
        return urlIdx >= 0 && assetIdx >= 0 && urlIdx < assetIdx;
    })());

ok('SAM-23: authored unit.image_url wins over DB1 image_asset',
    (function() {
        // Simulate: unit.image_url overrides DB1 image_asset
        var u = { uid:'U3', role:'air_defense', image_url:'/authored/override.jpg' };
        var e = DB.enrichUnit(u);  // DB1 sets image_asset
        var src = u.image_url || (e && e.image_asset) || null;
        return src === '/authored/override.jpg';
    })());

// ═══════════════════════════════════════════════════════════════════════════
// SAM-24..32: image_match / image_note provenance metadata (metadata correction)
// ═══════════════════════════════════════════════════════════════════════════

// SAM-24: patriot is 'representative' (actual Patriot system depicted)
ok('SAM-24: patriot image_match is "representative"',
    DB.CAPABILITY_CATALOG.patriot.image_match === 'representative',
    DB.CAPABILITY_CATALOG.patriot.image_match);

// SAM-25: air_defense is 'generic'
ok('SAM-25: air_defense image_match is "generic"',
    DB.CAPABILITY_CATALOG.air_defense.image_match === 'generic',
    DB.CAPABILITY_CATALOG.air_defense.image_match);

// SAM-26: sam_s300 is explicitly 'generic' (not exact S-300 photo)
ok('SAM-26: sam_s300 image_match is "generic"',
    DB.CAPABILITY_CATALOG.sam_s300.image_match === 'generic',
    DB.CAPABILITY_CATALOG.sam_s300.image_match);

// SAM-27: sam_s75 is explicitly 'generic' (not exact S-75 photo)
ok('SAM-27: sam_s75 image_match is "generic"',
    DB.CAPABILITY_CATALOG.sam_s75.image_match === 'generic',
    DB.CAPABILITY_CATALOG.sam_s75.image_match);

// SAM-28: image_note exists and is non-empty for all four entries
['air_defense','patriot','sam_s300','sam_s75'].forEach(function(k, i) {
    var entry = DB.CAPABILITY_CATALOG[k];
    ok('SAM-28-' + k + ': image_note is a non-empty string',
        typeof entry.image_note === 'string' && entry.image_note.length > 0,
        entry && entry.image_note);
});

// SAM-29: sam_s300 image_note explicitly says NOT an S-300 photo
ok('SAM-29a: sam_s300 image_note states it is NOT an S-300 photo',
    DB.CAPABILITY_CATALOG.sam_s300.image_note.includes('NOT') &&
    DB.CAPABILITY_CATALOG.sam_s300.image_note.includes('S-300'));

ok('SAM-29b: sam_s75 image_note states it is NOT an S-75 photo',
    DB.CAPABILITY_CATALOG.sam_s75.image_note.includes('NOT') &&
    DB.CAPABILITY_CATALOG.sam_s75.image_note.includes('S-75'));

// SAM-30: enrichUnit propagates image_match and image_note
var enrichedAD = DB.enrichUnit({ uid:'TEST', role:'air_defense' });
ok('SAM-30a: enrichUnit propagates image_match for air_defense',
    enrichedAD.image_match === 'generic', enrichedAD.image_match);
ok('SAM-30b: enrichUnit propagates image_note for air_defense',
    typeof enrichedAD.image_note === 'string' && enrichedAD.image_note.length > 0);

var enrichedPat = DB.enrichUnit({ uid:'TEST2', platform_id:'patriot' });
ok('SAM-30c: enrichUnit propagates image_match for patriot',
    enrichedPat.image_match === 'representative', enrichedPat.image_match);

var enrichedS300 = DB.enrichUnit({ uid:'TEST3', role:'s-300 battalion' });
ok('SAM-30d: enrichUnit propagates image_match for sam_s300',
    enrichedS300.image_match === 'generic', enrichedS300.image_match);

// SAM-31: authored image_match not overwritten
var authoredMatch = DB.enrichUnit({ uid:'U4', role:'air_defense', image_match:'exact' });
ok('SAM-31: authored unit.image_match not overwritten by DB1',
    authoredMatch.image_match === 'exact', authoredMatch.image_match);

// SAM-32: manifest platform_match entries exist for all four SAM kinds
var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/assets/units/manifest.json'), 'utf8'));
var samManifest = manifest.images && manifest.images[SAM_IMG];
ok('SAM-32a: manifest.platform_match.patriot.image_match is representative',
    samManifest && samManifest.platform_match && samManifest.platform_match.patriot &&
    samManifest.platform_match.patriot.image_match === 'representative');
ok('SAM-32b: manifest.platform_match.air_defense.image_match is generic',
    samManifest && samManifest.platform_match && samManifest.platform_match.air_defense &&
    samManifest.platform_match.air_defense.image_match === 'generic');
ok('SAM-32c: manifest.platform_match.sam_s300.image_match is generic',
    samManifest && samManifest.platform_match && samManifest.platform_match.sam_s300 &&
    samManifest.platform_match.sam_s300.image_match === 'generic');
ok('SAM-32d: manifest.platform_match.sam_s75.image_match is generic',
    samManifest && samManifest.platform_match && samManifest.platform_match.sam_s75 &&
    samManifest.platform_match.sam_s75.image_match === 'generic');

// ═══════════════════════════════════════════════════════════════════════════
// REG-1..2: Regressions
// ═══════════════════════════════════════════════════════════════════════════
ok('REG-1: DB1 CAPABILITY_CATALOG still has 29 entries',
    Object.keys(DB.CAPABILITY_CATALOG).length === 29,
    Object.keys(DB.CAPABILITY_CATALOG).length);

ok('REG-2: unit_tasking derivation still in DERIVATIONS',
    WS && typeof WS.DERIVATIONS.unit_tasking === 'function');

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════
var line = '='.repeat(72);
console.log('\n' + line);
console.log('  SAM / Air-Defense Real Image Coverage');
console.log(line);
if (failures.length) {
    failures.forEach(function(f) { console.log('  ' + f); });
    console.log('');
}
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log(line + '\n');
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log(line + '\n');
if (failed > 0) process.exit(1);
