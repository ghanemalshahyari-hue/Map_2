/**
 * test-unit-status-panel-identity-a.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A
 *
 * Loads the REAL unit-status-panel.js against a minimal DOM stub and proves the panel
 * derives names through the shared identity resolver: hero title, fuel/ammo name, UID
 * row, platform-type, and the identity-source/synthetic-warning row are all consistent
 * with resolveUnitIdentity().
 */
'use strict';
var assert = require('assert');
var path = require('path');

// ── Minimal DOM stub (panel touches getElementById/createElement/querySelectorAll) ──
function fakeEl() {
    var el = {
        textContent: '', innerHTML: '', value: '', id: '',
        style: {}, className: '',
        dataset: {},
        classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
        setAttribute: function () {}, getAttribute: function () { return null; }, removeAttribute: function () {},
        appendChild: function () {}, removeChild: function () {}, replaceWith: function () {},
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return makeList([]); },
        cloneNode: function () { return fakeEl(); },
        parentNode: null,
    };
    return el;
}
function makeList(arr) { arr.forEach = Array.prototype.forEach.bind(arr); return arr; }
var els = {};
global.document = {
    readyState: 'complete',
    getElementById: function (id) { if (!els[id]) { els[id] = fakeEl(); els[id].id = id; } return els[id]; },
    createElement: function () { return fakeEl(); },
    addEventListener: function () {},
    removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return makeList([]); },
};
global.window = global;        // so the modules' `root`/`window` is this global
global.t = function () { return null; }; // i18n returns falsy → fallback strings used

// Load the resolver FIRST (attaches window.RmoozUnitIdentity), then the panel.
var R = require(path.join(__dirname, 'UI_MOdified/client/shared/unit-identity-resolver.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/unit-status-panel.js'));
var PANEL = global.AppUnitStatusPanel;

var pass = 0;
function ok(name, fn) { fn(); pass++; console.log('  ✓ ' + name); }
function txt(id) { return (els[id] && els[id].textContent) || ''; }
function html(id) { return (els[id] && els[id].innerHTML) || ''; }

console.log('\nRMOOZ-UNIT-IDENTITY-CONTRACT-A — Unit Status panel\n');

// ── §1 panel loaded + exposes resolver-backed displayUnitName ─────────
console.log('§1 panel wiring');
ok('panel module exposes API', function () {
    assert.strictEqual(typeof PANEL.populatePanel, 'function');
    assert.strictEqual(typeof PANEL.displayUnitName, 'function');
});
ok('panel displayUnitName == shared resolver display_name', function () {
    var u = { uid: 'R-047', role: 'fires', label: 'fires-47' };
    assert.strictEqual(PANEL.displayUnitName(u), R.resolveUnitIdentity(u).display_name);
    assert.strictEqual(PANEL.displayUnitName(u), 'fires-47');
});

// ── §2 synthetic unit (R-047 / fires-47) ──────────────────────────────
console.log('§2 synthetic unit render');
ok('hero, fuel/ammo, and fuel-section names all match (case 7)', function () {
    var u = R.normalizeSelectedUnit({ uid: 'R-047', role: 'fires', label: 'fires-47', domain: 'ground' }, { side: 'hostile', scenario: true });
    PANEL.populatePanel(u, Date.now());
    var hero = txt('unit-label');
    assert.strictEqual(hero, 'fires-47');
    assert.strictEqual(txt('usp-fuelammo-name'), hero, 'fuel/ammo name must equal hero');
    assert.strictEqual(txt('usp-fuel-unit-name'), hero, 'fuel-section name must equal hero');
});
ok('UID row shows R-047, NOT the display name (case 2 of live verify)', function () {
    assert.strictEqual(txt('unit-uid'), 'R-047');
});
ok('platform-type shows "requires review" not a generic platform truth', function () {
    assert.ok(/requires review/i.test(txt('usp-platform-type')), 'got: ' + txt('usp-platform-type'));
});
ok('identity-source row flags synthetic name for review', function () {
    var h = html('usp-identity-source');
    assert.ok(/Identity/i.test(h), 'identity key missing: ' + h);
    assert.ok(/requires review/i.test(h), 'review chip missing: ' + h);
});

// ── §3 authored unit (real name + platform) ───────────────────────────
console.log('§3 authored unit render');
ok('hero uses authored name; identity row shows scenario name, no warning', function () {
    var u = R.normalizeSelectedUnit({ unit_uid: 'B-1', role: 'fighter', name_en: 'Desert Falcon Sqn', platform: 'F-16', domain: 'air' }, { side: 'friendly', scenario: true });
    PANEL.populatePanel(u, Date.now());
    assert.strictEqual(txt('unit-label'), 'Desert Falcon Sqn');
    assert.strictEqual(txt('usp-fuelammo-name'), 'Desert Falcon Sqn');
    var h = html('usp-identity-source');
    assert.ok(!/requires review/i.test(h), 'authored unit must NOT show review chip: ' + h);
});
ok('authored platform shown in platform-type (not "requires review")', function () {
    assert.ok(/F-16/.test(txt('usp-platform-type')), 'got: ' + txt('usp-platform-type'));
    assert.ok(!/requires review/i.test(txt('usp-platform-type')));
});

// ── §4 panel name == AI identity resolver name (case 6) ───────────────
console.log('§4 panel ↔ AI identity consistency');
ok('panel hero == unitIdentityForLlm.display_name for same unit', function () {
    var raw = { uid: 'R-047', role: 'fires', label: 'fires-47', domain: 'ground' };
    PANEL.populatePanel(R.normalizeSelectedUnit(raw, { side: 'hostile' }), Date.now());
    assert.strictEqual(txt('unit-label'), R.unitIdentityForLlm(raw).display_name);
});

// ── §5 no hardcoded scenario specifics in panel source ────────────────
console.log('§5 no hardcoding');
ok('panel source has no hardcoded R-047 / fires-47 / draft name', function () {
    var fs = require('fs');
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
    assert.ok(!/R-047/.test(src), 'R-047 leaked into panel source');
    assert.ok(!/fires-47/.test(src), 'fires-47 leaked into panel source');
    assert.ok(!/attack_objective_draft/.test(src), 'draft name leaked into panel source');
});
ok('panel delegates to the shared resolver', function () {
    var fs = require('fs');
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
    assert.ok(/RmoozUnitIdentity/.test(src), 'panel must reference RmoozUnitIdentity');
    assert.ok(/usp-identity-source/.test(src), 'panel must render the identity-source row');
});

console.log('\n✅ ' + pass + ' assertions passed (test-unit-status-panel-identity-a.js)\n');
