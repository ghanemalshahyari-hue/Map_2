#!/usr/bin/env node
/*
 * ARABIC-RTL-IMPORT-REGRESSION-A
 *
 * Guards Arabic/RTL after IMPORT-SCENARIO-JSON-LOSS-FIX-A:
 *  A. Arabic data survives the Step 1 JSON import client path (parse → clone → post).
 *  B. Base Status: Arabic base/unit names display intact; Arabic unit attaches by
 *     assigned_base_id AND by Arabic-name fallback; orphan shows in the bilingual
 *     "Unassigned / needs base review" section; id-first matching didn't break it.
 *  C. i18n: the relabeled Legacy/Full Scenario JSON card no longer carries the STALE
 *     Arabic/English strings; EN dict matches the app.html default; Arabic intact.
 *  D. RTL: dynamic mixed EN/AR containers carry dir="auto".
 */
'use strict';

var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..', '..');               // repo root (scripts/ is under UI_MOdified)
var CLIENT = path.join(__dirname, '..', 'client');         // UI_MOdified/client
function read(p) { return fs.readFileSync(p, 'utf8'); }

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}

console.log('ARABIC-RTL-IMPORT-REGRESSION-A');

// Arabic fixtures
var AR_BASE = 'قاعدة بندر عباس الجوية';
var AR_FIGHTER = 'إف-14 توم كات';
var AR_TANK = 'دبابة تي-72';
var AR_ORPHAN_BASE = 'قاعدة مجهولة';

// ── A. Arabic data survives the JSON import client path ──
(function () {
    var raw = { countries: [{ name: 'إيران', country_key: 'iran',
        air_bases: [{ name_ar: AR_BASE, name_en: 'Bandar Abbas AB', lat: 27.2, lon: 56.3,
            units: [{ platform: AR_FIGHTER, type_ar: 'مقاتلة', estimated_count: 24 }] }] }] };
    var text = JSON.stringify(raw);                          // file.text()
    var parsed = JSON.parse(text);                           // JSON.parse(text)
    var analyzeBody = JSON.parse(JSON.stringify(parsed));    // wizard clones before POST
    ok('Arabic country name survives parse→clone', analyzeBody.countries[0].name === 'إيران');
    ok('Arabic base name survives parse→clone', analyzeBody.countries[0].air_bases[0].name_ar === AR_BASE);
    ok('Arabic platform name survives parse→clone', analyzeBody.countries[0].air_bases[0].units[0].platform === AR_FIGHTER);
    ok('no \\u escaping / mojibake in cloned Arabic', /قاعدة/.test(JSON.stringify(analyzeBody)) && !/\\u0/.test(JSON.stringify(analyzeBody)));
})();

// ── B. Base Status: Arabic display + matching + Unassigned (DOM stub) ──
(function () {
    var elements = {};
    function makeEl(tag) {
        return { tagName: tag, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
            appendChild: function (el) { this.children.push(el); if (el.id) elements[el.id] = el; return el; },
            setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
            removeAttribute: function (k) { delete this.attrs[k]; },
            hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
            addEventListener: function () {}, querySelector: function (s) { return s === '.bsp-close' ? { addEventListener: function () {} } : null; } };
    }
    global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
    global.window = {}; global.window.document = global.document;
    require(path.join(CLIENT, 'shell/world-state-db.js'));
    require(path.join(CLIENT, 'shell/symbol-db.js'));
    require(path.join(CLIENT, 'shell/base-status-panel.js'));
    var BP = global.window.RmoozBaseStatusPanel;

    var anchor = { base_id: 'IR-AB-1', id: 'IR-AB-1', side: 'RED', country_key: 'iran', country: 'إيران',
        base_name_ar: AR_BASE, base_name_en: 'Bandar Abbas AB', site_type: 'air_base', lat: 27.2, lon: 56.3,
        source: { type: 'external_json', file: 'iran.json' } };
    var matchedById = { side: 'RED', country_key: 'iran', assigned_base_id: 'IR-AB-1', base_name_ar: AR_BASE,
        platform: AR_FIGHTER, type_ar: 'مقاتلة', estimated_count: 24, needs_review: true, exact_unit_position: false };
    var matchedByName = { side: 'RED', country_key: 'iran', base_name_ar: AR_BASE,   // NO id → Arabic-name fallback
        platform: 'سو-24', type_ar: 'قاذفة', estimated_count: 10, needs_review: true, exact_unit_position: false };
    var orphan = { side: 'RED', country_key: 'iran', base_name_ar: AR_ORPHAN_BASE, assigned_base_id: 'IR-XX-9',
        platform: AR_TANK, type_ar: 'مدرعات', estimated_count: 5, needs_review: true, exact_unit_position: false };
    var payload = { documents: [{ filename: 'iran.json' }], brief: { operational_brief: {
        task_assembly: {}, enemy: { units: [] }, friendly: { units: [] }, courses_of_action: [],
        enemy_bases: [anchor], friendly_trial_bases: [],
        proposed_units: [matchedById, matchedByName, orphan], missing_information: [] } } };

    BP.open(anchor, payload);
    var panel = elements['step1-base-status-panel'];
    var html = panel ? panel.innerHTML : '';
    ok('Base Status renders the Arabic base name intact', /قاعدة بندر عباس الجوية/.test(html) && !/\\u0/.test(html));
    ok('Arabic unit matched by assigned_base_id appears under the base', new RegExp(AR_FIGHTER).test(html));
    ok('Arabic unit matched by NAME fallback (no id) appears under the base', /سو-24/.test(html));
    ok('orphan Arabic unit appears in the Unassigned section', new RegExp(AR_TANK).test(html));
    ok('Unassigned section header is bilingual (Arabic present)', /غير مُسندة/.test(html));
    ok('Unassigned section has dir="auto"', /Unassigned \/ needs base review[\s\S]{0,40}/.test(html) && /dir="auto"[^>]*>Unassigned/.test(html));

    var T = BP._test;
    ok('id-first matching: Arabic unit attaches by assigned_base_id', T.unitBelongsToAnchor(matchedById, anchor, anchor) === true);
    ok('Arabic-name fallback still matches (id-first did NOT break it)', T.unitBelongsToAnchor(matchedByName, anchor, anchor) === true);
    var un = T.unassignedUnits(payload);
    ok('unassignedUnits returns the orphan only', un.length === 1 && un[0].platform === AR_TANK);

    try { delete global.window; delete global.document; } catch (_) {}
})();

// ── C. i18n: relabeled Legacy/Full Scenario JSON card — no stale strings, EN matches app.html ──
(function () {
    var i18n = read(path.join(CLIENT, 'i18n.js'));
    var appHtml = read(path.join(CLIENT, 'app.html'));
    ok('i18n EN updated to the new Legacy/Full Scenario JSON label', i18n.indexOf('Legacy / Full Scenario JSON — Load full RMOOZ scenario JSON') !== -1);
    ok('i18n AR re-translated to the new meaning', i18n.indexOf('JSON سيناريو كامل / قديم — تحميل سيناريو RMOOZ كامل') !== -1);
    ok('STALE English label removed', i18n.indexOf('Preview Live Scenario JSON — Read-only Cards Only') === -1);
    ok('STALE Arabic label removed', i18n.indexOf('معاينة JSON السيناريو الحي — البطاقات للقراءة فقط') === -1);
    ok('app.html default + i18n EN now agree (relabel takes effect)', appHtml.indexOf('Legacy / Full Scenario JSON — Load full RMOOZ scenario JSON') !== -1);
    // no broken encoding in the new Arabic entries
    ok('new Arabic i18n entries are real UTF-8 (no mojibake markers)', !/Ø[-ÿ]/.test('JSON سيناريو كامل / قديم — تحميل سيناريو RMOOZ كامل'));
})();

// ── D. RTL: dynamic mixed EN/AR containers carry dir="auto" ──
(function () {
    var wiz = read(path.join(CLIENT, 'shell/scenario-import-wizard.js'));
    var bsp = read(path.join(CLIENT, 'shell/base-status-panel.js'));
    var wsp = read(path.join(CLIENT, 'shell/scenario-workspace.js'));
    ok('wizard Step1-JSON filename span has dir="auto"', /id="wg-wz-json-name" dir="auto"/.test(wiz));
    ok('wizard Step1-JSON title/helper divs are bilingual + dir="auto"', /dir="auto">Step 1 \/ operational JSON/.test(wiz) && /JSON الخطوة 1 \/ العملياتي/.test(wiz));
    ok('base-status Unassigned header is bilingual', /غير مُسندة \/ تحتاج مراجعة قاعدة/.test(bsp));
    ok('scenario-workspace legacy summary is bilingual + summaryEl dir="auto"',
        /يتوقّع هذا المُحمِّل سيناريو RMOOZ/.test(wsp) && /summaryEl\.setAttribute\('dir', 'auto'\)/.test(wsp));
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
