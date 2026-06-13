#!/usr/bin/env node
/*
 * MULTI-COUNTRY-DEMO-A — demo movement from Step 1 coalition anchors.
 * Demo movement only: no final tasking, no COA, no adjudication, no weapons
 * effects, no damage, no doctrine decision, no world-state mutation.
 *
 * Uses GCC_vs_Iran_step1_multicountry_freefight_trial_LITE.json (real file via
 * env RMOOZ_MULTICOUNTRY_DEMO_JSON, else the devtools fixture).
 */
'use strict';

const path = require('path');
const fs = require('fs');

// ── DOM stub (mirrors test-base-status-panel-a.js) ───────────────────────
const elements = {};
function makeEl(tag) {
    return {
        tagName: tag, id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {},
        appendChild: function (el) { this.children.push(el); if (el.id) elements[el.id] = el; return el; },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function (n, fn) { this['on' + n] = fn; },
        querySelector: function (sel) { if (sel === '.bsp-close') return { addEventListener: function () {} }; return null; },
    };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {};
global.window.document = global.document;

const CLIENT = path.join(__dirname, '..', 'client', 'shell');
const AI = path.join(__dirname, '..', 'server', 'ai');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'base-status-panel.js'));
require(path.join(CLIENT, 'placement-candidates-panel.js'));
require(path.join(CLIENT, 'demo-units.js'));
require(path.join(CLIENT, 'demo-movement.js'));
require(path.join(CLIENT, 'doc-understanding-review.js'));

const MC = require(path.join(AI, 'multi-country-orbat.js'));
const BRIEF = require(path.join(AI, 'operational-brief.js'));
const DEMO_UNITS = global.window.RmoozDemoUnits;
const MOVE = global.window.RmoozDemoMovement;
const BASEPANEL = global.window.RmoozBaseStatusPanel;

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log('  [PASS] ' + name); passed++; } catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; } }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function approx(a, b) { return Math.abs(Number(a) - Number(b)) < 1e-9; }

function loadLite() {
    const candidates = [
        process.env.RMOOZ_MULTICOUNTRY_DEMO_JSON,
        path.join(__dirname, '..', 'devtools', 'fixtures', 'multi-country', 'GCC_vs_Iran_step1_multicountry_freefight_trial_LITE.json'),
    ].filter(Boolean);
    for (let i = 0; i < candidates.length; i++) {
        try { if (fs.existsSync(candidates[i])) return { json: JSON.parse(fs.readFileSync(candidates[i], 'utf8')), src: candidates[i] }; } catch (_) {}
    }
    throw new Error('LITE fixture not found');
}

const lite = loadLite();
console.log('\nMULTI-COUNTRY-DEMO-A demo movement\n  input: ' + lite.src + '\n');

const built = MC.buildBriefFromMultiCountry(lite.json, { file: 'GCC_vs_Iran_step1_multicountry_freefight_trial_LITE.json' });
const brief = built.brief;
const ob = brief.operational_brief;
const payload = { brief: brief, documents: brief.documents, understanding: BRIEF.understandingFromBrief(BRIEF.normalizeBrief(brief)) };

test('LITE classifies as multi_country_step1', () => {
    assert(BRIEF.classifyJsonInput(lite.json) === 'multi_country_step1', 'classify multi_country_step1');
});
test('LITE detects BLUE countries = 6, RED = 1', () => {
    assert(ob.coalition_totals.BLUE.countries === 6, 'BLUE 6, got ' + ob.coalition_totals.BLUE.countries);
    assert(ob.coalition_totals.RED.countries === 1, 'RED 1, got ' + ob.coalition_totals.RED.countries);
    assert(payload.understanding.coalition.blue_country_count === 6 && payload.understanding.coalition.red_country_count === 1, 'rollup counts');
});
test('per-country base + proposed counts present', () => {
    ob.countries.forEach(c => { assert(c.base_counts.total > 0, c.country_key + ' bases'); assert(c.proposed_unit_count > 0, c.country_key + ' proposed'); });
});
test('proposed_units > 0 and review-only (external_excel_orbat_candidate)', () => {
    assert(ob.proposed_units.length > 0, 'proposed_units present');
    assert(ob.proposed_units.every(u => u.needs_review === true && u.exact_unit_position === false), 'review-only flags');
    assert(ob.proposed_units.every(u => u.source_type === 'external_excel_orbat_candidate'), 'source_type external_excel_orbat_candidate');
});
test('placement_candidates > 0', () => { assert(ob.placement_candidates.length > 0, 'placement candidates'); });

// ── Demo conversion layer ────────────────────────────────────────────────
const conv = DEMO_UNITS.buildDemoUnits(payload);
test('demo_units created from proposed_units (1:1), demo_only/review_only/movement_status', () => {
    assert(conv.demo_units.length === ob.proposed_units.length, 'demo_units count == proposed_units');
    assert(conv.demo_units.length > 0, 'demo_units present');
    assert(conv.demo_units.every(d => d.demo_only === true && d.review_only === true && d.movement_status === 'demo'), 'demo flags');
    assert(conv.demo_units.every(d => d.source_proposed_unit_id), 'source_proposed_unit_id set');
    assert(conv.demo_units.every(d => d.exact_unit_position === false && d.needs_review === true), 'exact_unit_position false / needs_review');
    assert(conv.demo_units.every(d => d.approved === undefined), 'never marked approved');
});
test('demo_units categorized into the 9 demo buckets', () => {
    const ok = conv.demo_units.every(d => DEMO_UNITS.BUCKETS.indexOf(d.symbol_category) !== -1);
    assert(ok, 'every demo_unit category is a known bucket');
    // air fighters present (Iran F-14 etc.), naval present (corvette/frigate), ground present (SAM)
    const cats = new Set(conv.demo_units.map(d => d.symbol_category));
    assert(cats.has('air_fighter'), 'air_fighter bucket populated');
    assert(cats.has('naval_surface'), 'naval_surface bucket populated');
    assert(cats.has('ground_unit'), 'ground_unit bucket populated');
});
test('NO final scenario units created by the demo layer', () => {
    assert(ob.enemy.units.length === 0 && ob.friendly.units.length === 0, 'no final enemy/friendly units');
    assert(brief.red_units === undefined && brief.blue_units_initial === undefined, 'no scenario unit arrays');
    assert(typeof global.window.units === 'undefined', 'window.units not created');
});

// ── Demo movement controller ─────────────────────────────────────────────
test('init builds groups + selects 3 BLUE / 2 RED sample + objective', () => {
    const st = MOVE.init(payload);
    assert(st.demo_unit_count === conv.demo_units.length, 'demo_unit_count matches');
    assert(st.group_count === 5, 'sample group_count 5, got ' + st.group_count);
    assert(st.sample_blue === 3 && st.sample_red === 2, 'sample 3 BLUE / 2 RED, got ' + st.sample_blue + '/' + st.sample_red);
    assert(st.objective && Number.isFinite(st.objective.lat) && Number.isFinite(st.objective.lon), 'objective centroid computed');
});
test('demo movement starts and updates positions (toward objective)', () => {
    MOVE.reset();
    const before = MOVE.getGroups().map(g => ({ lat: g.current.lat, lon: g.current.lon }));
    MOVE.start();
    MOVE.step(); MOVE.step();
    const after = MOVE.getGroups();
    let moved = 0;
    after.forEach((g, i) => { if (!approx(g.current.lat, before[i].lat) || !approx(g.current.lon, before[i].lon)) moved++; });
    assert(moved === after.length, 'all sample groups moved, moved=' + moved + '/' + after.length);
    assert(MOVE.getState().progress > 0, 'progress advanced');
});
test('reset returns demo groups to their base anchors', () => {
    MOVE.start(); MOVE.step(); MOVE.step(); MOVE.step();
    MOVE.reset();
    const st = MOVE.getState();
    assert(st.progress === 0 && st.running === false, 'reset state');
    assert(MOVE.getGroups().every(g => approx(g.current.lat, g.anchor.lat) && approx(g.current.lon, g.anchor.lon)), 'current == anchor after reset');
});
test('exact_unit_position remains false on demo groups + units after movement', () => {
    MOVE.start(); MOVE.step();
    assert(MOVE.getDemoUnits().every(d => d.exact_unit_position === false), 'demo units stay exact_unit_position:false');
    assert(MOVE.getState().review_only === true && MOVE.getState().demo_only === true, 'state stays demo/review only');
    MOVE.reset();
});

// ── Base Status Panel still works ────────────────────────────────────────
test('Base Status Panel still opens from a coalition anchor (shows country)', () => {
    const anchor = ob.placement_candidates.find(c => c.country_key === 'iran') || ob.placement_candidates[0];
    BASEPANEL.open(anchor, payload);
    const panel = global.document.getElementById('step1-base-status-panel');
    assert(panel, 'panel created');
    assert(/Country/.test(panel.innerHTML) && panel.innerHTML.indexOf(anchor.country) !== -1, 'country shown');
    assert(/Review only/.test(panel.innerHTML), 'review-only badge');
});

test('Review screen offers a Demo Movement entry for coalition briefs', () => {
    const container = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    global.window.RmoozDocReview.render(container, payload, {});
    assert(/data-act="demo-movement"/.test(container.innerHTML), 'demo-movement button present');
    assert(/Demo Movement/.test(container.innerHTML), 'demo movement label present');
    assert(container.innerHTML.indexOf('Accept') === -1 && container.innerHTML.indexOf('Reject') === -1, 'still no Accept/Reject');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
