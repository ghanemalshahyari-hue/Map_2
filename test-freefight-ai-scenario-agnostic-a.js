#!/usr/bin/env node
/*
 * FREEFIGHT-AI-SCENARIO-AGNOSTIC-A
 * Proves the COA planner + continuous loop carry NO scenario-specific assumptions,
 * follow whatever units/objective they are given, and display BLUE defensive roles.
 *
 *  §1  Planner is scenario-agnostic: COA unit_uids are a subset of the supplied units
 *  §2  Two different scenarios → COAs reference only their own units (no leakage)
 *  §3  BLUE role_breakdown surfaces reinforce / intercept / defend
 *  §4  RED role_breakdown surfaces assault / support / recon (attack roles)
 *  §5  role_breakdown sums to the action count for BLUE COAs (no dropped roles)
 *  §6  No hardcoded draft name / scenario-specific UID in planner source
 *  §7  No hardcoded draft name / scenario-specific UID in client loop source
 *  §8  Client role display covers BLUE roles (FF_ROLE_DISPLAY_ORDER + _orderedRoleKeys)
 *  §9  Trail colour map covers reinforce / intercept / defend
 * §10  Loop request body is derived from the loaded scenario (two scenarios → different units/objective)
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }

var PLANNER = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

function mkUnits(prefix, side, n, baseLat, baseLon) {
    var u = [];
    for (var i = 0; i < n; i++) {
        var lat = baseLat + i * 0.013, lon = baseLon + i * 0.013;
        u.push({ uid: prefix + '-' + String(i + 1).padStart(3, '0'), side: side, lat: lat, lon: lon, coord: [lon, lat] });
    }
    return u;
}
function allUidsIn(plan) {
    var s = {};
    (plan.coas || []).forEach(function (c) { (c.phases || []).forEach(function (ph) { (ph.actions || []).forEach(function (a) { s[a.unit_uid] = 1; }); }); });
    return Object.keys(s);
}

(async function main() {
    // ── §1 + §2 scenario-agnostic, no leakage ────────────────────────────────
    console.log('\n§1  Planner COA unit_uids are a subset of supplied units');
    var scenA = { red: mkUnits('AAA', 'RED', 10, 30.0, 50.0), obj: [{ lat: 30.4, lon: 50.4, name: 'Obj-A' }] };
    var scenB = { red: mkUnits('ZZZ', 'RED', 7, 12.0, 44.0), obj: [{ lat: 12.3, lon: 44.3, name: 'Obj-B' }] };
    var planA = await PLANNER.planCoas(scenA.red, scenA.obj, { active_side: 'RED' }, { useLlm: false });
    var planB = await PLANNER.planCoas(scenB.red, scenB.obj, { active_side: 'RED' }, { useLlm: false });
    var idsA = allUidsIn(planA), idsB = allUidsIn(planB);
    var setA = scenA.red.map(function (u) { return u.uid; });
    var setB = scenB.red.map(function (u) { return u.uid; });
    ok('§1 all COA uids exist in scenario A units', idsA.every(function (id) { return setA.indexOf(id) !== -1; }), idsA.join(','));
    ok('§1 every uid starts with AAA- (scenario A prefix)', idsA.every(function (id) { return /^AAA-/.test(id); }));

    console.log('\n§2  Two scenarios → COAs reference only their own units (no leakage)');
    ok('§2 scenario B uids all in scenario B', idsB.every(function (id) { return setB.indexOf(id) !== -1; }));
    ok('§2 no AAA ids leak into scenario B plan', idsB.every(function (id) { return id.indexOf('AAA') === -1; }));
    ok('§2 objective_id follows the supplied objective', planB.coas[0].objective_id === 'Obj-B', planB.coas[0].objective_id);

    // ── §3 BLUE defensive roles ──────────────────────────────────────────────
    console.log('\n§3  BLUE role_breakdown surfaces reinforce / intercept / defend');
    var blue = mkUnits('BLU', 'BLUE', 14, 31.0, 51.0);
    var planBlue = await PLANNER.planCoas(blue, scenA.obj, { active_side: 'BLUE' }, { useLlm: false });
    ok('§3 active_side echoed as BLUE', planBlue.active_side === 'BLUE');
    var allRoles = {};
    planBlue.coas.forEach(function (c) { Object.keys(c.role_breakdown || {}).forEach(function (r) { if (c.role_breakdown[r] > 0) allRoles[r] = (allRoles[r] || 0) + c.role_breakdown[r]; }); });
    ok('§3 reinforce present across BLUE COAs', (allRoles.reinforce || 0) > 0, JSON.stringify(allRoles));
    ok('§3 intercept present across BLUE COAs', (allRoles.intercept || 0) > 0);
    ok('§3 defend present across BLUE COAs', (allRoles.defend || 0) > 0);
    ok('§3 BLUE COAs do NOT use attack-only "assault" role', (allRoles.assault || 0) === 0);

    // ── §4 RED attack roles ──────────────────────────────────────────────────
    console.log('\n§4  RED role_breakdown surfaces assault / support / recon');
    var redRoles = {};
    planA.coas.forEach(function (c) { Object.keys(c.role_breakdown || {}).forEach(function (r) { if (c.role_breakdown[r] > 0) redRoles[r] = (redRoles[r] || 0) + c.role_breakdown[r]; }); });
    ok('§4 assault present in RED COAs', (redRoles.assault || 0) > 0, JSON.stringify(redRoles));
    ok('§4 support present in RED COAs', (redRoles.support || 0) > 0);
    ok('§4 recon present in RED COAs', (redRoles.recon || 0) > 0);

    // ── §5 role_breakdown sums to action count (no dropped defensive roles) ───
    console.log('\n§5  BLUE role_breakdown sums to action count (no roles dropped)');
    ok('§5 each BLUE COA role sum equals its action count',
        planBlue.coas.every(function (c) {
            var sum = Object.keys(c.role_breakdown).reduce(function (s, k) { return s + c.role_breakdown[k]; }, 0);
            var acts = (c.phases || []).reduce(function (s, ph) { return s + (ph.actions || []).length; }, 0);
            return sum === acts;
        }));

    // ── §6 + §7 no hardcoding ────────────────────────────────────────────────
    console.log('\n§6  No hardcoded draft name / scenario UID in planner source');
    var plannerSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'), 'utf8');
    ok('§6 no "draft-NN" literal in planner', !/draft-\d/.test(plannerSrc));
    ok('§6 no "attack_objective" literal in planner', !/attack_objective/.test(plannerSrc));
    ok('§6 no scenario-specific R-0NN/B-0NN uid literal in planner', !/['"][RB]-0\d\d['"]/.test(plannerSrc));

    console.log('\n§7  No hardcoded draft name / scenario UID in client loop source');
    var clientSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
    ok('§7 no "draft-NN" literal in client', !/draft-\d/.test(clientSrc));
    ok('§7 no "attack_objective" literal in client', !/attack_objective/.test(clientSrc));
    ok('§7 no scenario-specific R-0NN/B-0NN uid literal in client', !/['"][RB]-0\d\d['"]/.test(clientSrc));
    ok('§7 loop reads units from RmoozScenario.scenario (generic)', /RmoozScenario\s*&&\s*\w+\.RmoozScenario\.scenario|RmoozScenario\.scenario/.test(clientSrc));

    // ── §8 client role display covers BLUE roles ─────────────────────────────
    console.log('\n§8  Client role display covers BLUE defensive roles');
    ok('§8 FF_ROLE_DISPLAY_ORDER includes reinforce', /FF_ROLE_DISPLAY_ORDER[\s\S]{0,160}reinforce/.test(clientSrc));
    ok('§8 FF_ROLE_DISPLAY_ORDER includes intercept', /FF_ROLE_DISPLAY_ORDER[\s\S]{0,160}intercept/.test(clientSrc));
    ok('§8 FF_ROLE_DISPLAY_ORDER includes defend', /FF_ROLE_DISPLAY_ORDER[\s\S]{0,160}defend/.test(clientSrc));
    // RMOOZ-...-AG: the roleLine / Units-block "uses _orderedRoleKeys" assertions referenced the deleted old
    // COA-card renderer; the role-ORDER engine (FF_ROLE_DISPLAY_ORDER) is asserted above. [[retired-by-AG]]

    // ── §9 trail colours cover defensive roles ───────────────────────────────
    console.log('\n§9  Trail colour map covers reinforce / intercept / defend');
    ok('§9 ROLE_COLORS has reinforce', /ROLE_COLORS\s*=\s*\{[\s\S]{0,200}reinforce/.test(clientSrc));
    ok('§9 ROLE_COLORS has intercept', /ROLE_COLORS\s*=\s*\{[\s\S]{0,200}intercept/.test(clientSrc));
    ok('§9 ROLE_COLORS has defend', /ROLE_COLORS\s*=\s*\{[\s\S]{0,200}defend/.test(clientSrc));

    // ── §10 loop request body derived from loaded scenario ───────────────────
    console.log('\n§10  Loop request body derives from the loaded scenario (two scenarios differ)');
    // load the client in a tiny harness to drive _buildLoopRequestBodyForTest with two scenarios
    var DEMO = loadClientHarness();
    DEMO._mountScenario({ red_units: mkUnits('S1R', 'RED', 6, 20.0, 40.0), blue_units_initial: mkUnits('S1B', 'BLUE', 4, 20.5, 40.5), obj: { name: 'Obj-1', coord: [40.4, 20.4] } }, { lat: 20.4, lon: 40.4 });
    var body1 = DEMO._buildLoopRequestBodyForTest();
    DEMO._mountScenario({ red_units: mkUnits('S2R', 'RED', 9, 60.0, 10.0), blue_units_initial: mkUnits('S2B', 'BLUE', 5, 60.5, 10.5), obj: { name: 'Obj-2', coord: [10.7, 60.7] } }, { lat: 60.7, lon: 10.7 });
    var body2 = DEMO._buildLoopRequestBodyForTest();
    var ids1 = body1.units.map(function (u) { return u.id; });
    var ids2 = body2.units.map(function (u) { return u.id; });
    ok('§10 scenario 1 units carry S1 prefixes', ids1.every(function (id) { return /^S1[RB]-/.test(id); }), ids1.join(','));
    ok('§10 scenario 2 units carry S2 prefixes', ids2.every(function (id) { return /^S2[RB]-/.test(id); }));
    ok('§10 no scenario-1 unit leaks into scenario-2 body', ids2.every(function (id) { return id.indexOf('S1') === -1; }));
    ok('§10 unit counts differ (10 vs 14)', body1.units.length === 10 && body2.units.length === 14, body1.units.length + ' / ' + body2.units.length);
    ok('§10 objective follows the scenario', body1.objectives[0] && body2.objectives[0] && (body1.objectives[0].lat !== body2.objectives[0].lat));
    // Each loop objective must match its OWN scenario's obj coord (GeoJSON [lon,lat]),
    // proving no stale objective leaks across scenario loads.
    ok('§10 scenario-1 objective === its own obj (lat 20.4)', body1.objectives[0] && Math.abs(body1.objectives[0].lat - 20.4) < 1e-9, JSON.stringify(body1.objectives[0]));
    ok('§10 scenario-2 objective === its own obj (lat 60.7)', body2.objectives[0] && Math.abs(body2.objectives[0].lat - 60.7) < 1e-9, JSON.stringify(body2.objectives[0]));

    // §11  Loaded-scenario objective wins over a stale persisted Objective X ─────
    console.log('\n§11  Loaded-scenario objective wins over a stale operator-placed Objective X');
    // Place an operator Objective X (persists across clear), then load a NEW scenario
    DEMO.setObjective({ lat: 5.0, lon: 5.0 }); // stale placed objective
    DEMO._mountScenario({ red_units: mkUnits('S3R', 'RED', 6, 70.0, 20.0), blue_units_initial: [], obj: { name: 'Obj-3', coord: [20.9, 70.9] } }, { lat: 70.9, lon: 20.9 });
    var body3 = DEMO._buildLoopRequestBodyForTest();
    ok('§11 objective is the loaded scenario obj (lat 70.9), not the stale placed 5.0',
        body3.objectives[0] && Math.abs(body3.objectives[0].lat - 70.9) < 1e-9, JSON.stringify(body3.objectives[0]));

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();

// ── minimal client harness (DOM/map/fetch stubs) ─────────────────────────────
function loadClientHarness() {
    var elById = {};
    function makeEl(tag) {
        return { tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: { cssText: '' }, parentNode: null, disabled: false, _listeners: {},
            appendChild: function (c) { c.parentNode = this; this.children.push(c); if (c.id) elById[c.id] = c; return c; },
            removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); },
            insertBefore: function (c) { this.children.push(c); return c; },
            setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
            getAttribute: function (k) { return this.attrs[k] != null ? this.attrs[k] : null; },
            removeAttribute: function () {}, hasAttribute: function (k) { return this.attrs[k] != null; },
            addEventListener: function () {}, removeEventListener: function () {}, setPointerCapture: function () {},
            querySelectorAll: function () { return []; },
            querySelector: function () { return { addEventListener: function () {}, style: { cssText: '' }, textContent: '', value: '', checked: false }; } };
    }
    var bodyEl = makeEl('body');
    global.sessionStorage = { _data: {}, getItem: function (k) { return this._data[k] != null ? this._data[k] : null; }, setItem: function (k, v) { this._data[k] = String(v); }, removeItem: function (k) { delete this._data[k]; } };
    global.window = {
        innerWidth: 1280, innerHeight: 800,
        document: { body: bodyEl, head: makeEl('head'), createElement: function (t) { return makeEl(t); }, getElementById: function (id) { return elById[id] || null; }, dispatchEvent: function () {}, addEventListener: function () {} },
        addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
        RmoozScenario: null, AppAdjudicatorMap: { drawScenario: function () {} }, AppShellEventLog: { append: function () {} },
        setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, clearInterval: function () {},
        fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({ ok: false }); } }); },
    };
    var stub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; } };
    global.window.L = { layerGroup: function () { return { addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; } }; }, marker: function () { return Object.assign({}, stub); }, divIcon: function () { return {}; }, circleMarker: function () { return Object.assign({}, stub); }, polyline: function () { return Object.assign({}, stub); } };
    global.window.map = { hasLayer: function () { return false; }, removeLayer: function () {}, addLayer: function () {}, on: function () {}, off: function () {}, panTo: function () {} };
    global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
    global.window.RmoozFreeFightAI = null;
    require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
    require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
    var DEMO = global.window.RmoozFreeFightDemo;
    DEMO._mountScenario = function (scenario, objLL) {
        global.window.RmoozScenario = { scenario: scenario };
        var payload = { brief: { operational_brief: { proposed_units: [], objectives: [{ label: scenario.obj.name, lat: objLL.lat, lon: objLL.lon }], placement_candidates: [{ type: 'base', lat: objLL.lat, lon: objLL.lon, name: 'AB' }] } } };
        DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(payload);
    };
    return DEMO;
}
