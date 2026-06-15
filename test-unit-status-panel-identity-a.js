/**
 * test-unit-status-panel-identity-a.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A (v2)
 *
 * Loads the REAL unit-status-panel.js against a minimal DOM stub and proves the panel
 * renders the v2 identity: hero = displayName (real platform/capability, NEVER the raw
 * code or synthetic key), canonical-id row = canonicalId, code row = tacticalCode, type
 * never degrades to UNIT, DB-Lite named platform upgrades the name, authored identity wins.
 */
'use strict';
var assert = require('assert');
var path = require('path');

// ── Minimal DOM stub ──────────────────────────────────────────────────
function fakeEl() {
    return {
        textContent: '', innerHTML: '', value: '', id: '',
        style: {}, className: '', dataset: {},
        classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
        setAttribute: function () {}, getAttribute: function () { return null; }, removeAttribute: function () {},
        appendChild: function () {}, removeChild: function () {}, replaceWith: function () {},
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return makeList([]); },
        cloneNode: function () { return fakeEl(); }, parentNode: null,
    };
}
function makeList(arr) { arr.forEach = Array.prototype.forEach.bind(arr); return arr; }
var els = {};
global.document = {
    readyState: 'complete',
    getElementById: function (id) { if (!els[id]) { els[id] = fakeEl(); els[id].id = id; } return els[id]; },
    createElement: function () { return fakeEl(); },
    addEventListener: function () {}, removeEventListener: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return makeList([]); },
};
global.window = global;
global.t = function () { return null; };
// DB-Lite stub: a named platform ONLY for fighters; generic/none otherwise.
global.AppWorldStateDB = {
    enrichUnit: function (u) { return Object.assign({}, u); },
    classifyKind: function () { return 'unknown'; },
    capabilityFor: function (u) { return (u && u.role === 'fighter') ? { label: 'F-16C Fighting Falcon' } : null; },
};

var R = require(path.join(__dirname, 'UI_MOdified/client/shared/unit-identity-resolver.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/unit-status-panel.js'));
var PANEL = global.AppUnitStatusPanel;

var pass = 0;
function ok(name, fn) { fn(); pass++; console.log('  ✓ ' + name); }
function txt(id) { return (els[id] && els[id].textContent) || ''; }
function html(id) { return (els[id] && els[id].innerHTML) || ''; }

console.log('\nRMOOZ-UNIT-IDENTITY-CONTRACT-A — Unit Status panel (v2)\n');

// ── §1 wiring ──────────────────────────────────────────────────────────
console.log('§1 panel wiring');
ok('panel API + resolver-backed displayUnitName', function () {
    assert.strictEqual(typeof PANEL.populatePanel, 'function');
    assert.strictEqual(PANEL.displayUnitName({ uid: 'R-047', label: 'fires-47', role: 'fires' }),
        R.resolveUnitIdentity({ uid: 'R-047', label: 'fires-47', role: 'fires' }).displayName);
});

// ── §2 real-data unit (uid=R-047, label=fires-47, role=fires) ─────────
console.log('§2 fires unit render');
ok('hero = real capability name, NOT R-047 / fires-47 (cases 6/7)', function () {
    var u = R.normalizeSelectedUnit({ uid: 'R-047', label: 'fires-47', role: 'fires', domain: 'ground' }, { side: 'hostile', scenario: true });
    PANEL.populatePanel(u, Date.now());
    var hero = txt('unit-label');
    assert.strictEqual(hero, 'Rocket Artillery Battery');
    assert.notStrictEqual(hero, 'R-047');
    assert.notStrictEqual(hero, 'fires-47');
    assert.strictEqual(txt('usp-fuelammo-name'), hero, 'fuel/ammo name == hero');
    assert.strictEqual(txt('usp-fuel-unit-name'), hero, 'fuel-section name == hero');
});
ok('canonical-id row = fires-47; code row = R-047 (tacticalCode)', function () {
    assert.strictEqual(txt('unit-uid'), 'fires-47', 'canonicalId in id row');
    assert.strictEqual(txt('usp-code'), 'R-047', 'tacticalCode in code row');
});
ok('platform/type row never degrades to bare UNIT', function () {
    var pt = txt('usp-platform-type');
    assert.ok(/Rocket Artillery Battery|Fires/.test(pt), 'got: ' + pt);
    assert.ok(!/\bUNIT\b/.test(pt) && !/\(default\)/i.test(pt), 'degraded: ' + pt);
});
ok('identity-source row flags the type-derived name for review', function () {
    var h = html('usp-identity-source');
    assert.ok(/Identity/i.test(h));
    assert.ok(/review/i.test(h), 'review chip missing: ' + h);
});

// ── §3 authored unit (real name wins, no review chip) ─────────────────
console.log('§3 authored unit');
ok('authored name_en is the hero; no review chip', function () {
    var u = R.normalizeSelectedUnit({ unit_uid: 'BLUE_adf', base_id: 'AB-204', role: 'air_defense', name_en: 'Liwa Air Defense Bn', domain: 'air_defense', coord: [54.2, 24.5] }, { side: 'friendly', scenario: true, live_lat: 24.5, live_lng: 54.2 });
    PANEL.populatePanel(u, Date.now());
    assert.strictEqual(txt('unit-label'), 'Liwa Air Defense Bn');
    assert.ok(!/review/i.test(html('usp-identity-source')), 'authored unit must not show review chip');
    assert.strictEqual(txt('unit-uid'), 'BLUE_adf', 'canonicalId');
});

// ── §4 DB-Lite NAMED platform upgrades the display name ───────────────
console.log('§4 DB-Lite named platform');
ok('fighter with a DB-Lite named entry → hero = F-16C Fighting Falcon', function () {
    var u = R.normalizeSelectedUnit({ uid: 'R-020', label: 'fighter-20', role: 'fighter', domain: 'air' }, { side: 'hostile', scenario: true });
    PANEL.populatePanel(u, Date.now());
    assert.strictEqual(txt('unit-label'), 'F-16C Fighting Falcon', 'DB-Lite specific platform used');
    assert.ok(/F-16C Fighting Falcon/.test(txt('usp-platform-type')));
});
ok('DB-Lite does NOT override an authored scenario name', function () {
    var u = R.normalizeSelectedUnit({ uid: 'R-021', label: 'fighter-21', role: 'fighter', name_en: 'Red Eagle Sqn', domain: 'air' }, { side: 'hostile', scenario: true });
    PANEL.populatePanel(u, Date.now());
    assert.strictEqual(txt('unit-label'), 'Red Eagle Sqn', 'authored identity wins over DB-Lite');
});

// ── §5 panel ↔ AI identity consistency + no hardcoding ────────────────
console.log('§5 consistency + hygiene');
ok('panel hero == unitIdentityForLlm.display_name for the same unit', function () {
    var raw = { uid: 'R-047', label: 'fires-47', role: 'fires', domain: 'ground' };
    PANEL.populatePanel(R.normalizeSelectedUnit(raw, { side: 'hostile' }), Date.now());
    assert.strictEqual(txt('unit-label'), R.unitIdentityForLlm(raw).display_name);
});
ok('panel source: no hardcoded R-047 / fires-47 / draft; delegates to resolver', function () {
    var fs = require('fs');
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
    assert.ok(!/R-047/.test(src), 'R-047 leaked');
    assert.ok(!/fires-47/.test(src), 'fires-47 leaked');
    assert.ok(!/attack_objective_draft/.test(src), 'draft name leaked');
    assert.ok(/RmoozUnitIdentity/.test(src), 'must reference RmoozUnitIdentity');
    assert.ok(/usp-identity-source/.test(src), 'must render identity-source row');
});

console.log('\n✅ ' + pass + ' assertions passed (test-unit-status-panel-identity-a.js)\n');
