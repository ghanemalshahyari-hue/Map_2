#!/usr/bin/env node
/*
 * MULTI-COUNTRY-A — coalition Step 1 ORBAT import.
 * Review / map / demo foundation only: no final scenario units, no tasking,
 * no COA, no combat adjudication, no weapon/sensor simulation.
 *
 * Uses نظام المعركة(1).xlsx when present (env RMOOZ_MULTICOUNTRY_XLSX or
 * devtools/fixtures/multi-country/); otherwise a faithful generated fixture
 * with the same structure (7 country sheets × Air/Naval/Land bases).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

// ── DOM stub (mirrors test-base-status-panel-a.js) ───────────────────────
const elements = {};
function makeEl(tag) {
    return {
        tagName: tag, id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {},
        appendChild: function (el) { this.children.push(el); if (el.id) elements[el.id] = el; return el; },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function (name, fn) { this['on' + name] = fn; },
        querySelector: function (sel) { if (sel === '.bsp-close') return { addEventListener: function () {} }; return null; },
    };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {};
global.window.document = global.document;

const AI = path.join(__dirname, '..', 'server', 'ai');
const CLIENT = path.join(__dirname, '..', 'client', 'shell');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'base-status-panel.js'));
require(path.join(CLIENT, 'placement-candidates-panel.js'));
require(path.join(CLIENT, 'doc-understanding-review.js'));

const XLSX = require(path.join(AI, 'xlsx-text.js'));
const MC = require(path.join(AI, 'multi-country-orbat.js'));
const BRIEF = require(path.join(AI, 'operational-brief.js'));
const BRIDGE = require(path.join(__dirname, '..', 'server', 'wargame-sim-bridge.js'));
const FIXTURE = require(path.join(__dirname, '..', 'devtools', 'fixtures', 'multi-country', 'make-fixture.js'));

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log('  [PASS] ' + name); passed++; } catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; } }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── Resolve the workbook (real file preferred, else fixture) ─────────────
function resolveWorkbookBuffer() {
    const candidates = [
        process.env.RMOOZ_MULTICOUNTRY_XLSX,
        path.join(__dirname, '..', 'devtools', 'fixtures', 'multi-country', 'نظام المعركة(1).xlsx'),
        path.join(__dirname, '..', 'devtools', 'fixtures', 'multi-country', 'battle-system-fixture.xlsx'),
        path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'نظام المعركة(1).xlsx'),
    ].filter(Boolean);
    for (let i = 0; i < candidates.length; i++) {
        try { if (fs.existsSync(candidates[i])) return { buf: fs.readFileSync(candidates[i]), src: candidates[i] }; } catch (_) {}
    }
    return { buf: FIXTURE.buildFixtureWorkbookBuffer(), src: '(generated fixture)' };
}

const wb = resolveWorkbookBuffer();
console.log('\nMULTI-COUNTRY-A coalition Step 1 ORBAT\n  workbook: ' + wb.src + '\n');

const BLUE_KEYS = ['uae', 'qatar', 'bahrain', 'kuwait', 'oman', 'ksa'];

// ── 1. Dependency-free XLSX reader ───────────────────────────────────────
const parsed = XLSX.extractWorkbook(wb.buf);
test('xlsx reader extracts one sheet per country', () => {
    assert(parsed.sheets.length === 7, 'expected 7 sheets, got ' + parsed.sheets.length);
    const names = parsed.sheets.map(s => s.name);
    ['Iran', 'UAE', 'Qatar', 'Bahrain', 'Kuwait', 'Oman', 'KSA'].forEach(n => assert(names.indexOf(n) !== -1, 'missing sheet ' + n));
});
test('xlsx reader round-trips numeric coordinates + strings', () => {
    const iran = parsed.sheets.find(s => s.name === 'Iran');
    const flat = iran.rows.map(r => r.join('|')).join('\n');
    assert(/Bandar Abbas AB/.test(flat), 'Bandar Abbas AB row present');
    assert(/27\.21/.test(flat) && /56\.38/.test(flat), 'coordinates round-tripped');
    assert(/F-14A Tomcat/.test(flat), 'platform line present');
});

// ── 2. Build the coalition brief from the workbook ───────────────────────
const built = MC.buildBriefFromMultiCountry({ sheets: parsed.sheets }, { file: 'نظام المعركة(1).xlsx' });
const ob = built.brief.operational_brief;
function country(key) { return (ob.countries || []).find(c => c.country_key === key); }

test('Iran detected as RED', () => {
    const iran = country('iran');
    assert(iran, 'Iran country present');
    assert(iran.side === 'RED', 'Iran side RED, got ' + iran.side);
});
test('UAE/Qatar/Bahrain/Kuwait/Oman/KSA detected as BLUE', () => {
    BLUE_KEYS.forEach(k => { const c = country(k); assert(c, k + ' present'); assert(c.side === 'BLUE', k + ' side BLUE, got ' + (c && c.side)); });
});
test('coalition model: RED 1 country, BLUE 6, two coalitions', () => {
    assert(ob.coalition_totals.RED.countries === 1, 'RED 1 country');
    assert(ob.coalition_totals.BLUE.countries === 6, 'BLUE 6 countries, got ' + ob.coalition_totals.BLUE.countries);
    assert(ob.coalitions.length === 2, 'two coalitions');
    const blue = ob.coalitions.find(c => c.side === 'BLUE');
    assert(blue && blue.participants.length === 6, 'BLUE coalition lists 6 participants');
});
test('air + naval + land bases extracted for every country', () => {
    (ob.countries || []).forEach(c => {
        assert(c.base_counts.air > 0, c.country_key + ' has air bases');
        assert(c.base_counts.naval > 0, c.country_key + ' has naval bases');
        assert(c.base_counts.land > 0, c.country_key + ' has land bases');
    });
    const types = new Set((ob.country_bases || []).map(b => b.site_type));
    assert(types.has('air_base') && types.has('naval_base') && types.has('land_base'), 'all three site types present');
});
test('proposed_units > 0 for each country with data', () => {
    (ob.countries || []).forEach(c => assert(c.proposed_unit_count > 0, c.country_key + ' proposed_unit_count > 0'));
    assert(ob.proposed_units.length > 0, 'total proposed_units > 0');
});
test('placement_candidates > 0 (one map anchor per based-with-coords)', () => {
    assert(ob.placement_candidates.length > 0, 'placement_candidates present');
    assert(ob.placement_candidates.length >= ob.country_bases.filter(b => b.lat != null).length, 'anchor per coord base');
});
test('exact_unit_position is false on every unit / base / anchor', () => {
    assert(ob.proposed_units.every(u => u.exact_unit_position === false), 'units exact_unit_position false');
    assert(ob.placement_candidates.every(c => c.exact_unit_position === false), 'candidates exact_unit_position false');
    assert(ob.country_bases.every(b => b.exact_unit_position === false), 'bases exact_unit_position false');
});
test('everything is review-only (needs_review:true)', () => {
    assert(ob.proposed_units.every(u => u.needs_review === true), 'units need review');
    assert(ob.country_bases.every(b => b.needs_review === true), 'bases need review');
    assert(ob.placement_candidates.every(c => c.needs_review === true), 'candidates need review');
});
test('no final scenario units created', () => {
    assert(ob.enemy.units.length === 0 && ob.friendly.units.length === 0, 'enemy/friendly units empty');
    assert(built.brief.red_units === undefined && built.brief.blue_units_initial === undefined, 'no scenario unit arrays');
});
test('no final tasking / no COA objects', () => {
    assert(ob.courses_of_action.length === 0, 'no courses_of_action');
    assert((ob.country_orbats || []).every(o => o.proposed_units.every(u => u.exact_unit_position === false)), 'orbat units review-only');
});
test('RED enemy_bases projection mirrors Iran bases only', () => {
    assert(ob.enemy_bases.length > 0, 'enemy_bases present');
    assert(ob.enemy_bases.every(b => b.side === 'RED'), 'enemy_bases all RED');
    const iran = country('iran');
    assert(ob.enemy_bases.length === iran.base_counts.total, 'enemy_bases === Iran base total');
});

// ── 3. Side assignment + override ────────────────────────────────────────
test('default side map + Arabic names + operator override', () => {
    assert(MC.sideForCountry('إيران') === 'RED', 'Arabic Iran → RED');
    assert(MC.sideForCountry('Qatar') === 'BLUE', 'Qatar default BLUE');
    assert(MC.sideForCountry('السعودية') === 'BLUE', 'Arabic KSA → BLUE');
    assert(MC.sideForCountry('Qatar', { qatar: 'RED' }) === 'RED', 'override Qatar → RED');
    assert(MC.sideForCountry('Atlantis') === 'UNKNOWN', 'unknown country → UNKNOWN');
});

// ── 4. understandingFromBrief coalition rollup ───────────────────────────
const understanding = BRIEF.understandingFromBrief(BRIEF.normalizeBrief(built.brief));
test('understanding labels it Coalition Step 1 ORBAT with rollup', () => {
    assert(understanding.set_label_en === 'Coalition Step 1 ORBAT', 'label, got ' + understanding.set_label_en);
    assert(understanding.coalition, 'coalition rollup present');
    assert(understanding.coalition.red_country_count === 1, 'rollup RED 1');
    assert(understanding.coalition.blue_country_count === 6, 'rollup BLUE 6');
});
test('normalizeBrief preserves the coalition layer', () => {
    const nb = BRIEF.normalizeBrief(built.brief).operational_brief;
    assert(nb.coalitions.length === 2 && nb.countries.length === 7, 'coalitions/countries survive normalize');
    assert(nb.country_bases.length === ob.country_bases.length, 'country_bases survive normalize');
});

// ── 5. Review UI rollup (additive; no Accept/Reject) ─────────────────────
test('Review UI renders countries / RED & BLUE counts / coalition totals', () => {
    const payload = { brief: built.brief, documents: built.brief.documents, understanding };
    const container = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    global.window.RmoozDocReview.render(container, payload, {});
    const html = container.innerHTML;
    assert(/Coalition ORBAT/.test(html), 'coalition section rendered');
    assert(/Countries detected/.test(html), 'countries detected label');
    assert(/RED countries/.test(html) && /BLUE countries/.test(html), 'side country counts');
    assert(/Iran/.test(html), 'Iran rendered');
    assert(html.indexOf('Accept') === -1 && html.indexOf('Reject') === -1, 'no Accept/Reject controls');
});

// ── 6. Base Status Card shows country (read-only) ────────────────────────
test('Base Status Card surfaces country + review-only badge', () => {
    const anchor = ob.placement_candidates.find(c => c.country_key === 'iran') || ob.placement_candidates[0];
    global.window.RmoozBaseStatusPanel.open(anchor, { brief: built.brief, documents: built.brief.documents });
    const panel = global.document.getElementById('step1-base-status-panel');
    assert(panel, 'panel created');
    const html = panel.innerHTML;
    assert(/Country/.test(html), 'Country label present');
    assert(html.indexOf(anchor.country) !== -1, 'country value present');
    assert(/Review only/.test(html) && /exact_unit_position:false/.test(html), 'review-only badges present');
});

// ── 7. Live analyze route: Excel (base64) + JSON ─────────────────────────
function postAnalyze(body) {
    return new Promise((resolve, reject) => {
        const req = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')]);
        req.method = 'POST'; req.url = '/api/wargame-sim/analyze';
        const res = { statusCode: 0, headers: {}, writeHead: function (code, h) { this.statusCode = code; this.headers = h || {}; }, end: function (t) { try { resolve({ status: this.statusCode, body: JSON.parse(t) }); } catch (e) { reject(e); } } };
        const handled = BRIDGE.handle(req, res, {
            url: new URL('http://local.test/api/wargame-sim/analyze'), pathname: '/api/wargame-sim/analyze', method: 'POST',
            sendJson: function (r, code, obj) { r.writeHead(code, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(obj)); },
        });
        if (!handled) reject(new Error('analyze route not handled'));
    });
}

async function asyncTests() {
    const r1 = await postAnalyze({ workbook_base64: wb.buf.toString('base64'), filename: 'نظام المعركة(1).xlsx' });
    assert(r1.status === 200 && r1.body.ok, 'xlsx analyze ok');
    assert(r1.body.kind === 'multi_country_step1', 'xlsx analyze kind, got ' + r1.body.kind);
    assert(r1.body.understanding.set_label_en === 'Coalition Step 1 ORBAT', 'xlsx analyze label');
    assert(r1.body.understanding.coalition.blue_country_count === 6, 'xlsx analyze BLUE 6');
    assert(r1.body.brief.operational_brief.proposed_units.every(u => u.exact_unit_position === false), 'xlsx route units review-only');
    assert(r1.body.brief.operational_brief.courses_of_action.length === 0, 'xlsx route no COA');
    console.log('  [PASS] live analyze route parses .xlsx (base64) → multi_country_step1');
    passed++;

    const jsonInput = {
        countries: [
            { name: 'Iran', air_bases: [{ name_ar: 'قاعدة تجريب', name_en: 'Trial AB', lat: 27, lon: 56, units: [{ platform: 'F-4', estimated_count: 4, type_ar: 'مقاتلة' }] }], naval_bases: [], land_bases: [] },
            { name: 'Qatar', air_bases: [{ name_ar: 'العديد', name_en: 'Al Udeid', lat: 25.1, lon: 51.3, units: [{ platform: 'Rafale', estimated_count: 12 }] }], naval_bases: [], land_bases: [] },
        ],
    };
    assert(BRIEF.classifyJsonInput(jsonInput) === 'multi_country_step1', 'classify JSON countries[]');
    const r2 = await postAnalyze(jsonInput);
    assert(r2.status === 200 && r2.body.kind === 'multi_country_step1', 'JSON analyze kind');
    const oc = r2.body.brief.operational_brief;
    assert(oc.countries.find(c => c.country_key === 'iran').side === 'RED', 'JSON Iran RED');
    assert(oc.countries.find(c => c.country_key === 'qatar').side === 'BLUE', 'JSON Qatar BLUE');
    console.log('  [PASS] live analyze route parses per-country JSON → multi_country_step1');
    passed++;
}

asyncTests().then(() => {
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}).catch(e => {
    console.log('  [FAIL] live analyze route: ' + e.message);
    failed++;
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
});
