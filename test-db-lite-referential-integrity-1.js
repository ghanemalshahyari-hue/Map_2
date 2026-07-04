/* ============================================================================
 * test-db-lite-referential-integrity-1.js — DB-COMPLETE (2026-07-04)
 * ----------------------------------------------------------------------------
 * Guards the DB-Lite triangle (world-state-db.js CATALOG ↔ detection.js sensor
 * classes ↔ engagement.js weapon classes). The scenario-import pilot exposed
 * that the D5 fold-in added air/naval platforms whose sensor/weapon CLASSES were
 * never defined in the engines, so they silently resolved to 0 range. This test:
 *   1. asserts every class a catalog platform references is DEFINED in the engine
 *      tables (referential integrity — would have caught the D5 drift),
 *   2. asserts the newly-added platforms exist + classify from real role strings,
 *   3. asserts the f16c keyword fix ("F-16C …" now classifies), and
 *   4. asserts enriched new-platform units resolve NON-ZERO ranges.
 * ========================================================================== */
'use strict';

var path = require('path');
var ROOT = __dirname;
var db  = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'world-state-db.js'));
var det = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'detection.js'));
var eng = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'engagement.js'));

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}

var SENSOR = new Set(Object.keys(det.DEFAULT_DB.sensor_class));
var RCS    = new Set(Object.keys(det.DEFAULT_DB.rcs_class));
var WPN    = new Set(Object.keys(eng.DEFAULT_WPN_DB.weapon_class));

console.log('\n=== DB-COMPLETE: DB-Lite referential integrity + new platforms ===\n');

console.log('--- 1. every catalog-referenced class is defined in the engine tables ---');
(function () {
    var badS = [], badW = [], badR = [];
    Object.keys(db.CAPABILITY_CATALOG).forEach(function (k) {
        var cap = db.CAPABILITY_CATALOG[k];
        (cap.sensors || []).forEach(function (s) { if (s.class && !SENSOR.has(s.class)) badS.push(k + '.' + s.class); });
        (cap.weapons || []).forEach(function (w) { if (w.class && !WPN.has(w.class)) badW.push(k + '.' + w.class); });
        if (cap.rcs_class && !RCS.has(cap.rcs_class)) badR.push(k + '.' + cap.rcs_class);
    });
    assert('T-1  no unresolved sensor.class refs (' + (badS.join(', ') || 'clean') + ')', badS.length === 0);
    assert('T-2  no unresolved weapon.class refs (' + (badW.join(', ') || 'clean') + ')', badW.length === 0);
    assert('T-3  no unresolved rcs_class refs (' + (badR.join(', ') || 'clean') + ')', badR.length === 0);
})();

console.log('\n--- 2. new platforms exist ---');
(function () {
    ['attack_submarine', 'maritime_patrol', 'f14', 'f4_phantom', 'f5_tiger'].forEach(function (k) {
        assert('T  catalog has ' + k, !!db.CAPABILITY_CATALOG[k]);
    });
})();

console.log('\n--- 3. classifyKind: real role strings resolve (incl. the f16c fix) ---');
(function () {
    var cases = [
        ['F-16C Fighting Falcon', 'f16c'],   // the fix — previously fell to air_unit
        ['F-14A Tomcat',          'f14'],
        ['F-4E Phantom II',       'f4_phantom'],
        ['F-5E Tiger II',         'f5_tiger'],
        ['Victor III SSN',        'attack_submarine'],
        ['Akula SSN',             'attack_submarine'],
        ['Tu-142 Bear-F MPA',     'maritime_patrol'],
        ['P-8 Poseidon',          'maritime_patrol'],
        // regression: existing keywords still resolve
        ['F-15E Strike Eagle',    'f15e'],
        ['S-300 PKS',             'sam_s300'],
        ['MEKO Frigate',          'meko']
    ];
    cases.forEach(function (c) {
        var k = db.classifyKind({ role: c[0] });
        assert('T  "' + c[0] + '" -> ' + c[1] + (k === c[1] ? '' : ' (got ' + k + ')'), k === c[1]);
    });
})();

console.log('\n--- 4. enriched new-platform units resolve NON-ZERO ranges ---');
(function () {
    function maxWpnRange(unit) {
        var u = db.enrichUnit(unit);
        return (u.weapons || []).reduce(function (m, w) {
            var d = eng.DEFAULT_WPN_DB.weapon_class[w.class];
            return Math.max(m, (d && d.max_range_nm) || 0);
        }, 0);
    }
    function maxSensorRange(unit) {
        var u = db.enrichUnit(unit);
        return (u.sensors || []).reduce(function (m, s) {
            var d = det.DEFAULT_DB.sensor_class[s.class];
            return Math.max(m, (d && d.ref_range_nm) || 0);
        }, 0);
    }
    assert('T-1  submarine has a real torpedo range', maxWpnRange({ role: 'Victor III SSN' }) >= 10);
    assert('T-2  submarine has a real passive-sonar range', maxSensorRange({ role: 'Victor III SSN' }) >= 20);
    assert('T-3  F-14 has a real long-range AAM (Phoenix ~80nm)', maxWpnRange({ role: 'F-14A Tomcat' }) >= 60);
    assert('T-4  MPA has a real search/sonobuoy range', maxSensorRange({ role: 'Tu-142 Bear-F MPA' }) >= 15);
    // regression: an existing D5 aircraft now resolves a real AAM range (was 0 before this fix)
    assert('T-5  F-16C now resolves a real AAM range (was 0)', maxWpnRange({ role: 'F-16C Fighting Falcon' }) >= 30);
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
