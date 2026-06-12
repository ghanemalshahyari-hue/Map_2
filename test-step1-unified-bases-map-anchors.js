#!/usr/bin/env node
/*
 * STEP1-C: unified Step 1 bases + map anchors for the updated Qatar/Iran trial.
 */
'use strict';

const path = require('path');
const { Readable } = require('stream');
global.window = {};

const ADAPTER = require(path.join(__dirname, 'UI_MOdified/server/ai/mdmp-external-adapter'));
const B = require(path.join(__dirname, 'UI_MOdified/server/ai/operational-brief'));
const BRIDGE = require(path.join(__dirname, 'UI_MOdified/server/wargame-sim-bridge'));
require(path.join(__dirname, 'UI_MOdified/client/shell/doc-understanding-review.js'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function base(i, type) {
    return {
        base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u062a\u062c\u0631\u064a\u0628 ' + i,
        base_name_en: (i === 4 ? 'Bandar Abbas' : (i === 5 ? 'Konarak / Chabahar' : 'Trial Base ' + i)),
        lat: 25 + (i / 100),
        lon: 50 + (i / 100),
        site_type: type,
        country: '\u0625\u064a\u0631\u0627\u0646',
        units: [{ platform: 'Fallback-' + i, estimated_count: 1, type_ar: 'fighter' }],
    };
}
function proposed(side, i) {
    return {
        id: side + '-PROPOSED-' + i,
        side,
        platform: side === 'RED' ? 'RED Platform ' + i : 'BLUE Trial Platform ' + i,
        estimated_count: i,
        base_name_en: side === 'RED' ? 'Trial Base ' + ((i % 32) + 1) : 'Blue Trial Base ' + ((i % 3) + 1),
        lat: side === 'RED' ? 26 + (i / 1000) : 24 + (i / 1000),
        lon: side === 'RED' ? 51 + (i / 1000) : 52 + (i / 1000),
    };
}

const redBases = [];
for (let i = 1; i <= 32; i++) {
    redBases.push(base(i, i <= 18 ? 'air_base' : (i <= 25 ? 'naval_base' : 'land_base')));
}
const friendlyTrials = [1, 2, 3].map(i => ({
    base_name_ar: '\u0645\u0631\u0633\u0627\u0629 \u062a\u062c\u0631\u064a\u0628 \u0632\u0631\u0642\u0627\u0621 ' + i,
    base_name_en: 'Blue Trial Base ' + i,
    lat: 24.8 + (i / 100),
    lon: 51.2 + (i / 100),
}));
const proposedUnits = [];
for (let i = 1; i <= 75; i++) proposedUnits.push(proposed('RED', i));
for (let i = 1; i <= 7; i++) proposedUnits.push(proposed('BLUE', i));

const UPDATED_STEP1 = {
    task_assembly: { summary: '\u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0648\u0627\u062c\u0628', supporting_tasks: [] },
    Units_Duty: '\u0648\u0627\u062c\u0628\u0627\u062a \u062a\u062c\u0631\u064a\u0628\u064a\u0629',
    doctrine_upload_required: true,
    doctrine_sources: ['pending_upload'],
    enemy_forces: {
        bases: redBases,
        air_bases: [base(91, 'air_base')],
        naval_bases: [base(92, 'naval_base')],
        land_bases: [base(93, 'land_base')],
    },
    friendly_forces: {
        trial_bases: friendlyTrials,
    },
    proposed_units: proposedUnits,
    placement_candidates: [{
        mention: 'operator supplied anchor',
        lat: 25.5,
        lon: 51.5,
        side: 'RED',
        site_type: 'air_base',
    }],
};

function adapt(data) {
    return ADAPTER.adaptMdmpBundle([{ filename: 'Iran_Qatar_step1_updated_red_blue_trial.json', data }]).brief;
}

function postPlacement(body) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(body), 'utf8');
        const req = Readable.from([payload]);
        req.method = 'POST';
        req.url = '/api/wargame-sim/placement';
        const res = {
            statusCode: 0,
            headers: {},
            writeHead: function (code, headers) { this.statusCode = code; this.headers = headers || {}; },
            end: function (text) {
                try { resolve({ status: this.statusCode, body: JSON.parse(text) }); }
                catch (e) { reject(e); }
            },
        };
        const handled = BRIDGE.handle(req, res, {
            url: new URL('http://local.test/api/wargame-sim/placement'),
            pathname: '/api/wargame-sim/placement',
            method: 'POST',
            sendJson: function (r, code, obj) {
                r.writeHead(code, { 'Content-Type': 'application/json' });
                r.end(JSON.stringify(obj));
            },
        });
        if (!handled) reject(new Error('placement route not handled'));
    });
}

console.log('\nSTEP1-C unified bases and anchors\n');

test('canonical enemy_forces.bases drives RED bases and preserves top-level proposed units', () => {
    const brief = adapt(UPDATED_STEP1);
    const ob = brief.operational_brief;
    assert(ob.enemy_bases.length === 32, '32 RED bases from canonical bases');
    assert(ob.friendly_trial_bases.length === 3, '3 BLUE trial bases');
    assert(ob.proposed_units.length === 82, 'top-level proposed_units preserved');
    assert(ob.proposed_units.filter(u => u.side === 'RED').length === 75, 'RED 75 proposed units');
    assert(ob.proposed_units.filter(u => u.side === 'BLUE').length === 7, 'BLUE 7 proposed units');
    assert(ob.proposed_units.every(u => u.needs_review === true), 'proposed units need review');
    assert(ob.proposed_units.every(u => u.exact_unit_position === false), 'proposed units not exact placement');
    assert(ob.enemy.units.length === 0 && ob.friendly.units.length === 0, 'no final unit placement');
    assert(ob.courses_of_action.every(c => c.unit_tasking.length === 0), 'no final tasking');
});

test('all base types create review/map anchors only', () => {
    const ob = adapt(UPDATED_STEP1).operational_brief;
    const redTypes = new Set(ob.enemy_bases.map(b => b.site_type));
    assert(redTypes.has('air_base') && redTypes.has('naval_base') && redTypes.has('land_base'), 'RED base types');
    assert(ob.friendly_trial_bases.every(b => b.site_type === 'friendly_trial_anchor'), 'BLUE trial anchor type');
    assert(ob.placement_candidates.length >= 36, 'top-level plus base anchors');
    assert(ob.placement_candidates.every(c => c.exact_unit_position === false), 'all map anchors exact_unit_position false');
    assert(ob.placement_candidates.some(c => c.mention === 'operator supplied anchor'), 'top-level placement candidate preserved');
    assert(ob.placement_candidates.some(c => c.side === 'BLUE' && c.site_type === 'friendly_trial_anchor'), 'BLUE trial map anchor');
});

test('fallback uses air_bases + naval_bases + land_bases when bases is missing', () => {
    const fallback = Object.assign({}, UPDATED_STEP1, {
        proposed_units: [],
        enemy_forces: {
            air_bases: [base(1, 'air_base'), base(2, 'air_base')],
            naval_bases: [base(3, 'naval_base')],
            land_bases: [base(4, 'land_base')],
        },
    });
    const ob = adapt(fallback).operational_brief;
    assert(ob.enemy_bases.length === 4, 'fallback base count');
    assert(ob.enemy_bases.some(b => b.site_type === 'air_base'), 'fallback air_base');
    assert(ob.enemy_bases.some(b => b.site_type === 'naval_base'), 'fallback naval_base');
    assert(ob.enemy_bases.some(b => b.site_type === 'land_base'), 'fallback land_base');
    assert(ob.proposed_units.length === 4, 'fallback creates proposed units from base.units');
});

test('Review UI shows RED/BLUE proposed counts and base counts', () => {
    const brief = adapt(UPDATED_STEP1);
    const payload = { brief, documents: brief.documents, understanding: B.understandingFromBrief(B.normalizeBrief(brief)) };
    const container = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    window.RmoozDocReview.render(container, payload, {});
    const html = container.innerHTML;
    assert(html.indexOf('BLUE 7 / RED 75 / NEUTRAL 0') !== -1, 'proposed unit counts render');
    assert(html.indexOf('RED bases') !== -1 && html.indexOf('<b>32</b>') !== -1, 'RED base count renders');
    assert(html.indexOf('BLUE trial bases') !== -1 && html.indexOf('<b>3</b>') !== -1, 'BLUE trial base count renders');
    assert(html.indexOf('Bandar Abbas') !== -1 && html.indexOf('Konarak / Chabahar') !== -1, 'named bases render');
    assert(html.indexOf('Accept') === -1 && html.indexOf('Reject') === -1, 'no Accept/Reject controls');
});

async function asyncTests() {
    const brief = adapt(UPDATED_STEP1);
    const response = await postPlacement({ brief });
    assert(response.status === 200 && response.body.ok, 'placement endpoint returns ok');
    const candidates = response.body.placement_candidates || [];
    assert(candidates.some(c => c.mention === 'operator supplied anchor'), 'endpoint preserves top-level candidate');
    assert(candidates.some(c => c.side === 'BLUE' && c.site_type === 'friendly_trial_anchor'), 'endpoint returns BLUE trial anchors for map');
    assert(candidates.some(c => c.side === 'RED' && c.site_type === 'naval_base'), 'endpoint returns RED naval anchor for map');
    assert(candidates.every(c => c.exact_unit_position === false), 'endpoint anchors are not exact unit positions');
    console.log('  [PASS] placement endpoint returns Step 1 map anchors only');
    passed++;
}

asyncTests().then(function () {
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}).catch(function (e) {
    console.log('  [FAIL] placement endpoint returns Step 1 map anchors only: ' + e.message);
    failed++;
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
});
