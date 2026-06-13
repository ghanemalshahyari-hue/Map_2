#!/usr/bin/env node
/*
 * SYMBOL-DB-B: proposed-unit platform categorizer checks.
 * No server, no scenario execution, no unit placement. Pure module test.
 *
 * Core guarantee under test: NO INVENTION. sensors/weapons/magazines are either
 * empty (-> Catalog required / needs_review) or a byte-for-byte clone of the DB1
 * capability catalog entry for the resolved key. Nothing is fabricated.
 */
'use strict';

var path = require('path');
var fs = require('fs');

// DB1 first so window.AppWorldStateDB / global.AppWorldStateDB is available, then SYMBOL-DB-B.
var DB = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state-db.js'));
var SDB = require(path.join(__dirname, 'UI_MOdified/client/shell/symbol-db.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function catEntry(key) { return (DB.CAPABILITY_CATALOG && DB.CAPABILITY_CATALOG[key]) || {}; }

console.log('SYMBOL-DB-B — proposed unit platform categorizer\n');

/* ---- API surface ---- */
ok('module exposes categorize/classify/lookupSystems/enrichProposedUnits',
    typeof SDB.categorize === 'function' && typeof SDB.classify === 'function' &&
    typeof SDB.lookupSystems === 'function' && typeof SDB.enrichProposedUnits === 'function');
ok('CATALOG_REQUIRED is the AR/EN sentinel', /Catalog required/.test(SDB.CATALOG_REQUIRED) && /يحتاج/.test(SDB.CATALOG_REQUIRED));
ok('DB1 catalog wired in (lookupSystems sees a catalog)', SDB.lookupSystems({ platform: 'f16c' }).key === 'f16c');

/* ---- classify ladder (SYMBOL-DB-A parity) ---- */
ok('classify F-14 -> air_fighter/category_only', SDB.classify('F-14A Tomcat').symbol_category === 'air_fighter' && SDB.classify('F-14A Tomcat').status === 'category_only');
ok('classify F-4 -> ambiguous with candidates', SDB.classify('F-4 Phantom').status === 'ambiguous' && eq(SDB.classify('F-4 Phantom').candidates, ['air_fighter', 'air_attack']));
ok('classify unknown -> unknown', SDB.classify('Unlisted Platform X').symbol_category === 'unknown');

/* ---- MATCHED: named platform pulls real systems from DB1, nothing invented ---- */
var matched = SDB.categorize({ platform: 'f16c', name: 'Aggressor Sqn' });
ok('named platform -> catalog_match_status matched', matched.catalog_match_status === 'matched');
ok('matched confidence high (>=0.9)', matched.catalog_confidence >= 0.9);
ok('matched sensors are non-empty', matched.sensors.length > 0);
ok('matched sensors EXACTLY equal the DB1 f16c catalog entry (not fabricated)', eq(matched.sensors, catEntry('f16c').sensors));
ok('matched weapons EXACTLY equal the DB1 f16c catalog entry', eq(matched.weapons, catEntry('f16c').weapons));
ok('matched magazines EXACTLY equal the DB1 f16c catalog entry', eq(matched.magazines, catEntry('f16c').magazines));
ok('matched platform_class falls back to DB1 key when symbol unknown', matched.platform_class === 'f16c' || matched.platform_class === 'air_fighter');

/* ---- ROLE_CLASS: generic role profile, flagged for verification ---- */
var roleC = SDB.categorize({ platform: 'SAM site', role: 'air defense' });
ok('generic role -> catalog_match_status role_class', roleC.catalog_match_status === 'role_class');
ok('role_class systems come from DB1 air_defense (not fabricated)', eq(roleC.sensors, catEntry('air_defense').sensors) && eq(roleC.weapons, catEntry('air_defense').weapons));
ok('role_class summary flags it must be verified', /verify/i.test(roleC.capability_summary));
ok('role_class symbol_category still classified (air_defense)', roleC.symbol_category === 'air_defense');

/* ---- CATEGORY_ONLY: category known, NO systems -> Catalog required, no invention ---- */
var catOnly = SDB.categorize({ platform: 'F-14A Tomcat', type_ar: 'مقاتلة' });
ok('F-14 (no DB1 entry) -> category_only', catOnly.catalog_match_status === 'category_only');
ok('category_only symbol_category air_fighter', catOnly.symbol_category === 'air_fighter');
ok('category_only invents NO systems (all empty)', catOnly.sensors.length === 0 && catOnly.weapons.length === 0 && catOnly.magazines.length === 0);
ok('category_only lists missing systems in unknown_fields', catOnly.unknown_fields.indexOf('sensors') !== -1 && catOnly.unknown_fields.indexOf('weapons') !== -1 && catOnly.unknown_fields.indexOf('magazines') !== -1);
ok('category_only summary carries Catalog required', /Catalog required/.test(catOnly.capability_summary));

/* ---- UNKNOWN: no category, no systems -> Catalog required / needs_review ---- */
var unk = SDB.categorize({ platform: 'Unlisted Platform X' });
ok('unknown platform -> catalog_match_status unknown', unk.catalog_match_status === 'unknown');
ok('unknown invents NO systems', unk.sensors.length === 0 && unk.weapons.length === 0 && unk.magazines.length === 0);
ok('unknown summary === Catalog required sentinel', unk.capability_summary === SDB.CATALOG_REQUIRED);
ok('unknown flags platform + all systems in unknown_fields', unk.unknown_fields.indexOf('platform') !== -1 && unk.unknown_fields.indexOf('sensors') !== -1);

/* ---- DECLARED precedence: operator-supplied systems win ---- */
var decl = SDB.categorize({ platform: 'Unlisted Platform X', sensors: [{ id: 'op_radar', type: 'radar' }] });
ok('operator-declared systems -> catalog_match_status declared', decl.catalog_match_status === 'declared');
ok('declared keeps the operator sensors verbatim', eq(decl.sensors, [{ id: 'op_radar', type: 'radar' }]));
ok('declared confidence high', decl.catalog_confidence >= 0.9);

/* ---- NO-INVENT INVARIANT across a mixed batch ---- */
var batch = SDB.enrichProposedUnits([
    { platform: 'f16c' }, { platform: 'F-14A Tomcat' }, { platform: 'Unlisted Platform X' },
    { platform: 'SAM site', role: 'air defense' }, { platform: 'C-130H' }, { role: 'naval frigate' }
]);
var invariantHolds = batch.every(function (r) {
    if (r.catalog_match_status === 'declared') return true; // operator-owned
    var c = catEntry(r.catalog_key);
    var sOk = r.sensors.length === 0 || eq(r.sensors, c.sensors || []);
    var wOk = r.weapons.length === 0 || eq(r.weapons, c.weapons || []);
    var mOk = r.magazines.length === 0 || eq(r.magazines, c.magazines || []);
    return sOk && wOk && mOk;
});
ok('NO-INVENT: every systems array is empty OR exactly a DB1 catalog entry', invariantHolds);
ok('every enriched unit is needs_review:true (review-only)', batch.every(function (r) { return r.needs_review === true; }));
ok('enrichProposedUnits maps 1:1', batch.length === 6);

/* ---- determinism + read-only ---- */
ok('categorize is deterministic (same input -> same output)', eq(SDB.categorize({ platform: 'f16c' }), SDB.categorize({ platform: 'f16c' })));
var inUnit = { platform: 'f16c' };
var inSnap = JSON.stringify(inUnit);
SDB.categorize(inUnit);
ok('categorize does not mutate the input unit', JSON.stringify(inUnit) === inSnap);

/* ---- self-check: no nondeterminism / no network / no LLM in the source ---- */
var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/symbol-db.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok('source has no Date.now() call', !/Date\.now\s*\(/.test(src));
ok('source has no Math.random() call', !/Math\.random\s*\(/.test(src));
ok('source has no network/LLM calls', !/\bfetch\s*\(|require\(['"](https?|net)['"]\)|XMLHttpRequest/.test(src));

console.log('\n' + (failed ? '[FAIL] ' : '[OK]  ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
