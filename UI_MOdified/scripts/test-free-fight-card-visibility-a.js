#!/usr/bin/env node
/*
 * FREE-FIGHT-CARD-VISIBILITY — the Free Fight card must SHOW without an Objective X;
 * Objective X only ENABLES Start AI Free Fight. (Fixes the canFreeFight deadlock.)
 * Demo/review-only: no final units, no world-state mutation.
 */
'use strict';

var path = require('path'), fs = require('fs');

var elements = {};
function makeEl(t) {
    return { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e.id) elements[e.id] = e; return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, querySelector: function () { return null; } };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {}; global.window.document = global.document;

var CLIENT = path.join(__dirname, '..', 'client', 'shell'), AI_DIR = path.join(__dirname, '..', 'server', 'ai');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'base-status-panel.js'));
require(path.join(CLIENT, 'placement-candidates-panel.js'));
require(path.join(CLIENT, 'demo-units.js'));
require(path.join(CLIENT, 'free-fight-ai.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
require(path.join(CLIENT, 'doc-understanding-review.js'));

var MC = require(path.join(AI_DIR, 'multi-country-orbat.js'));
var FF = global.window.RmoozFreeFightDemo;

var passed = 0, failed = 0;
function test(n, fn) { try { fn(); console.log('  [PASS] ' + n); passed++; } catch (e) { console.log('  [FAIL] ' + n + ': ' + e.message); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

function reviewHtml(payload) {
    var c = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    global.window.RmoozDocReview.render(c, payload, {});
    return c.innerHTML;
}
function hasCard(payload) { return /data-act="free-fight"/.test(reviewHtml(payload)); }
function briefOf(input) { return MC.buildBriefFromMultiCountry(input, { file: 'card-test' }).brief; }
function gulf(name, n) { var a = []; for (var i = 0; i < n; i++) a.push({ name_en: name + ' AB ' + i, lat: 25 + i * 0.3, lon: 53 + i * 0.3, units: [{ platform: 'F-16', estimated_count: 8 }] }); return { name: name, air_bases: a }; }

var LITE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'devtools', 'fixtures', 'multi-country', 'GCC_vs_Iran_step1_multicountry_freefight_trial_LITE.json'), 'utf8'));
var UAE_IRAN = { countries: [gulf('Iran', 2), gulf('UAE', 2)] };
var QATAR_IRAN = { countries: [gulf('Iran', 2), gulf('Qatar', 2)] };

console.log('\nFREE-FIGHT-CARD-VISIBILITY\n');

test('card SHOWS without Objective X when units + anchors exist (GCC / UAE_Iran / Iran_Qatar)', function () {
    [['GCC', LITE], ['UAE_Iran', UAE_IRAN], ['Iran_Qatar', QATAR_IRAN]].forEach(function (pair) {
        var brief = briefOf(pair[1]);
        var ob = brief.operational_brief;
        assert(ob.objectives.length === 0, pair[0] + ' brief has NO objective (objective placed in-demo)');
        assert(ob.proposed_units.length > 0 && ob.placement_candidates.length > 0, pair[0] + ' has units + anchors');
        assert(hasCard({ brief: brief }), pair[0] + ' Free Fight card visible WITHOUT objective');
    });
});
test('card HIDDEN when units present but NO anchor/base source', function () {
    var p = { brief: { operational_brief: { proposed_units: [{ side: 'RED', platform: 'X' }], placement_candidates: [], enemy_bases: [], friendly_trial_bases: [], country_bases: [], coalitions: [], countries: [] } }, understanding: {} };
    assert(!hasCard(p), 'units-only-without-anchors → no card (units AND anchor rule)');
});
test('card HIDDEN for an empty brief; SHOWN with enemy_bases only', function () {
    var empty = { brief: { operational_brief: { proposed_units: [], placement_candidates: [], enemy_bases: [], friendly_trial_bases: [], country_bases: [], coalitions: [], countries: [] } }, understanding: {} };
    assert(!hasCard(empty), 'empty brief → no card');
    var withBase = { brief: { operational_brief: { proposed_units: [{ side: 'RED' }], enemy_bases: [{ side: 'RED', site_type: 'air_base' }], placement_candidates: [], friendly_trial_bases: [], country_bases: [], coalitions: [], countries: [] } }, understanding: {} };
    assert(hasCard(withBase), 'units + enemy_bases → card shows');
});
test('debug line carries the required fields', function () {
    var h = reviewHtml({ brief: briefOf(LITE) });
    ['kind=', 'has_coalition=', 'has_objective=', 'proposed_units_count=', 'placement_candidates_count=', 'base_count=', 'free_fight_card_visible=', 'start_enabled='].forEach(function (f) {
        assert(h.indexOf(f) !== -1, 'debug field ' + f);
    });
});
test('Start is DISABLED before Objective X, ENABLED after (can_start)', function () {
    var brief = briefOf(UAE_IRAN);
    var st0 = FF.init({ brief: brief });
    assert(st0.objective_set === false, 'no objective from a Step 1 brief');
    assert(st0.can_start === false, 'can_start false before Objective X');
    assert(st0.all_groups > 0, 'anchors exist (groups available)');
    var st1 = FF.setObjective({ lat: 26, lon: 55 });
    assert(st1.objective_set === true, 'objective placed');
    assert(st1.can_start === true, 'can_start true after Objective X');
    assert(st1.red_groups + st1.blue_groups > 0, 'at least one RED/BLUE group');
    FF.clear();
});
test('no anchors: card may show (data exists) but can_start stays false', function () {
    var brief = briefOf({ countries: [{ name: 'Iran', air_bases: [{ name_en: 'NoCoord', units: [{ platform: 'F-14', estimated_count: 2 }] }] }] });
    assert(hasCard({ brief: brief }), 'country_bases present → card shows');
    FF.init({ brief: brief }); FF.setObjective({ lat: 27, lon: 56 });
    assert(FF.getState().can_start === false, 'no usable anchors → cannot start even with objective');
    assert(FF.getState().has_anchors === false, 'has_anchors false');
    FF.clear();
});
test('safety: no final units / no world-state after a full run', function () {
    var brief = briefOf(LITE);
    FF.init({ brief: brief }); FF.setObjective({ lat: 26, lon: 54 }); FF.start(); FF.step();
    assert(FF.getGroups().every(function (g) { return g.exact_unit_position === false && g.demo_only === true; }), 'groups demo_only / exact false');
    assert(brief.operational_brief.enemy.units.length === 0 && brief.operational_brief.friendly.units.length === 0, 'no final units');
    assert(brief.red_units === undefined && typeof global.window.units === 'undefined', 'no scenario units / no world-state');
    FF.clear();
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
