#!/usr/bin/env node
/*
 * FREEFIGHT-BLUE-THREAT-AWARE-MOVEMENT-A
 * BLUE must move to INTERCEPT/BLOCK the RED axis, not crowd its own objective —
 * and zero/tiny movement must not be counted as "moved".
 *
 *  §1  BLUE COA target is NOT always the objective (intercept point used)
 *  §2  Intercept point lies between nearest RED and the objective (~0.55 from RED)
 *  §3  BLUE recommends Intercept/Block RED Axis when RED is close
 *  §4  No RED threat → recommends Hold & Screen
 *  §5  BLUE units visibly move when not already at the intercept point
 *  §6  Zero/tiny movement (< epsilon) is NOT counted as moved (held)
 *  §7  Event log distinguishes moved vs already-in-position
 *  §8  Event log says BLUE INTERCEPT when BLUE blocks the RED axis
 *  §9  Works with arbitrary unit IDs / arbitrary scenario (no hardcoding)
 * §10  Map proof: moved BLUE units end closer to the RED→objective axis than they started
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

var P = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));
var T = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-situation-triggers.js'));

function u(id, side, lat, lon) { return { uid: id, side: side, lat: lat, lon: lon, coord: [lon, lat] }; }
function dist(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return Math.sqrt(dx * dx + dy * dy); }

(async function main() {
    var OBJ = [{ lat: 24.33, lon: 54.66, name: 'Objective X' }];
    // RED is NORTH of the objective and inside the defended zone (0.17° away).
    var redClose = [u('R-15', 'RED', 24.50, 54.66)];
    // BLUE units sit AROUND the objective (so "move to objective" would be ~zero).
    var blue = [u('B-1', 'BLUE', 24.31, 54.66), u('B-2', 'BLUE', 24.33, 54.68), u('B-3', 'BLUE', 24.30, 54.63),
                u('B-4', 'BLUE', 24.34, 54.69), u('B-5', 'BLUE', 24.29, 54.70), u('B-6', 'BLUE', 24.36, 54.62)];

    var plan = await P.planCoas(redClose.concat(blue), OBJ, { active_side: 'BLUE', turn_number: 2 }, { preferSide: 'BLUE', useLlm: false });
    var rec = plan.coas.filter(function (c) { return c.recommended; })[0];

    // ── §1 target not always the objective ───────────────────────────────────
    console.log('\n§1  BLUE COA target is not always the objective');
    var interceptAct = rec.phases[0].actions.filter(function (a) { return a.role === 'intercept'; })[0];
    ok('§1 a recommended COA exists', !!rec);
    ok('§1 intercept action exists', !!interceptAct);
    ok('§1 intercept target is NOT the objective coord',
        interceptAct && !(interceptAct.target.lat === 24.33 && interceptAct.target.lon === 54.66),
        interceptAct && JSON.stringify(interceptAct.target));

    // ── §2 intercept point between RED and objective ─────────────────────────
    console.log('\n§2  Intercept point lies between nearest RED and the objective');
    var ip = rec.intercept_point;
    ok('§2 intercept_point present + on_red_axis', ip && ip.on_red_axis === true);
    // RED lat 24.50, OBJ lat 24.33 → expect ~24.50 + (24.33-24.50)*0.55 = 24.4065
    ok('§2 intercept lat between RED(24.50) and OBJ(24.33)', ip && ip.lat < 24.50 && ip.lat > 24.33, ip && ip.lat);
    ok('§2 intercept lat ≈ 0.55 from RED toward OBJ', ip && Math.abs(ip.lat - 24.4065) < 0.01, ip && ip.lat);

    // ── §3 recommends intercept/block when RED close ─────────────────────────
    console.log('\n§3  BLUE recommends Intercept / Block RED Axis when RED is close');
    ok('§3 recommended title is intercept/block', /intercept|block/i.test(rec.title), rec.title);
    ok('§3 situation alert is ALERT (defended zone)', plan.situation_state.alert_state === 'ALERT', plan.situation_state.alert_state);

    // ── §4 no threat → hold & screen ─────────────────────────────────────────
    console.log('\n§4  No RED threat near objective → recommends Hold & Screen');
    var redFar = [u('R-9', 'RED', 26.5, 56.6)]; // ~3°+ away
    var plan4 = await P.planCoas(redFar.concat(blue), OBJ, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    var rec4 = plan4.coas.filter(function (c) { return c.recommended; })[0];
    ok('§4 WATCH alert when RED far', plan4.situation_state.alert_state === 'WATCH');
    ok('§4 recommends Hold & Screen', /hold|screen/i.test(rec4.title), rec4.title);

    // ── §5 + §6 + §10 client movement (moved vs held) ────────────────────────
    var H = loadClientHarness();
    // Scenario where SOME BLUE units must move to the intercept point and one is
    // already there (already-in-position).
    var blockLat = 24.4065, blockLon = 54.66;
    var scenBlue = [
        u('B-1', 'BLUE', 24.31, 54.66),  // ~0.10° from block → moves
        u('B-2', 'BLUE', 24.33, 54.70),  // moves
        u('B-3', 'BLUE', 24.29, 54.55),  // moves
        u('B-far', 'BLUE', 24.31, 54.90),// moves
        u('B-here', 'BLUE', blockLat, blockLon), // already at the block point → held
    ];
    var scen = { red_units: [u('R-15', 'RED', 24.50, 54.66)], blue_units_initial: scenBlue, obj: { name: 'Objective X', coord: [54.66, 24.33] } };
    H.mountScenario(scen, { lat: 24.33, lon: 54.66 });
    H.DEMO._setActiveSideForTest('BLUE');
    var body = H.DEMO._buildLoopRequestBodyForTest();
    var bluePlan = await P.planCoas(body.units, body.objectives, { active_side: 'BLUE', turn_number: 1 }, { preferSide: 'BLUE', useLlm: false });

    // capture BLUE start positions
    var beforePos = {};
    scen.blue_units_initial.forEach(function (b) { beforePos[b.uid] = b.coord.slice(); });
    var redLL = { lat: 24.50, lon: 54.66 }, objLL = { lat: 24.33, lon: 54.66 };
    function distToAxisProxy(c) { return dist({ lat: c[1], lon: c[0] }, { lat: 24.4065, lon: 54.66 }); } // distance to block point

    H.eventLog.length = 0;
    H.DEMO._runTurnCoreForTest(bluePlan, 0); // instant apply
    await flush();

    var moved = H.DEMO._getCoaMovedUnitsForTest();
    var held = H.DEMO._getCoaHeldCountForTest();

    console.log('\n§5  BLUE units visibly move when not already at the intercept point');
    ok('§5 at least 2 BLUE units visibly moved', moved.length >= 2, 'moved=' + moved.length);
    var movedUids = moved.map(function (m) { return m.unit.uid || m.unit.id; });
    var someActuallyMoved = scen.blue_units_initial.some(function (b) {
        var a = beforePos[b.uid], n = b.coord;
        return (Math.abs(a[0] - n[0]) > 0.003 || Math.abs(a[1] - n[1]) > 0.003);
    });
    ok('§5 some BLUE coords changed on the map', someActuallyMoved);

    console.log('\n§6  Zero/tiny movement (< epsilon) is NOT counted as moved');
    ok('§6 at least one unit is held (already in position)', held >= 1, 'held=' + held);
    ok('§6 the already-at-block unit is NOT in moved set', movedUids.indexOf('B-here') === -1);
    ok('§6 moved + held ≤ intercept+screen selection', (moved.length + held) <= bluePlan.coas.find(function(c){return c.recommended;}).units_selected_count + 1);

    console.log('\n§7  Event log distinguishes moved vs already-in-position');
    var turnLine = H.eventLog.map(function (e) { return e.message || ''; }).filter(function (m) { return /AI Commander Turn/.test(m); })[0] || '';
    ok('§7 turn line mentions "units moved"', /units moved/.test(turnLine), turnLine);
    ok('§7 turn line mentions "already in position"', /already in position/.test(turnLine), turnLine);

    console.log('\n§8  Event log says BLUE INTERCEPT when BLUE blocks the RED axis');
    ok('§8 BLUE INTERCEPT logged', H.eventLog.some(function (e) { return /BLUE INTERCEPT:/.test(e.message || ''); }));
    ok('§8 BLUE INTERCEPT names the objective', H.eventLog.some(function (e) { return /BLUE INTERCEPT:.*Objective X/.test(e.message || ''); }));

    console.log('\n§10  Map proof: moved BLUE units end closer to the RED→objective block point');
    var closerCount = 0;
    scen.blue_units_initial.forEach(function (b) {
        if (b.uid === 'B-here') return;
        var before = beforePos[b.uid], after = b.coord;
        if (distToAxisProxy(after) < distToAxisProxy(before) - 1e-9) closerCount++;
    });
    ok('§10 at least 2 moved units ended closer to the block point', closerCount >= 2, 'closer=' + closerCount);

    // ── §9 arbitrary IDs / no hardcoding ─────────────────────────────────────
    console.log('\n§9  Works with arbitrary unit IDs / no hardcoded scenario');
    var OBJ2 = [{ lat: -33.9, lon: 18.4, name: 'CAPE-OBJ' }];
    var red2 = [u('ENEMY-ALPHA', 'RED', -33.72, 18.4)];
    var blue2 = [u('DEF-1', 'BLUE', -33.95, 18.4), u('DEF-2', 'BLUE', -33.9, 18.5), u('DEF-3', 'BLUE', -33.88, 18.3), u('DEF-4', 'BLUE', -33.92, 18.45)];
    var plan9 = await P.planCoas(red2.concat(blue2), OBJ2, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    var rec9 = plan9.coas.filter(function (c) { return c.recommended; })[0];
    ok('§9 intercept recommended for arbitrary scenario', /intercept|block/i.test(rec9.title));
    ok('§9 intercept_point between ENEMY-ALPHA and CAPE-OBJ', rec9.intercept_point && rec9.intercept_point.lat < -33.72 && rec9.intercept_point.lat > -33.9, rec9.intercept_point && rec9.intercept_point.lat);
    ok('§9 nearest_red is ENEMY-ALPHA', plan9.situation_state.nearest_red_uid === 'ENEMY-ALPHA');
    var srcP = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'), 'utf8');
    ok('§9 no hardcoded draft/attack_objective/specific-uid in planner BLUE logic',
        !/draft-\d|attack_objective/.test(srcP) && !/['"][RB]-0\d\d['"]/.test(srcP));

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();

// ── minimal client harness ───────────────────────────────────────────────────
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
            querySelector: function (sel) {
                var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
                if (mff) { if (this.attrs['data-ff'] === mff[1]) return this; for (var i=0;i<this.children.length;i++){var r=this.children[i].querySelector(sel);if(r)return r;} return null; }
                return { addEventListener: function () {}, style: { cssText: '' }, textContent: '', value: '', checked: false };
            } };
    }
    var bodyEl = makeEl('body');
    global.sessionStorage = { _data: {}, getItem: function (k) { return this._data[k] != null ? this._data[k] : null; }, setItem: function (k, v) { this._data[k] = String(v); }, removeItem: function (k) { delete this._data[k]; } };
    var eventLog = [];
    global.window = {
        innerWidth: 1280, innerHeight: 800,
        document: { body: bodyEl, head: makeEl('head'), createElement: function (t) { return makeEl(t); }, getElementById: function (id) { return elById[id] || null; }, dispatchEvent: function () {}, addEventListener: function () {} },
        addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
        RmoozScenario: null, AppAdjudicatorMap: { drawScenario: function () {} }, AppShellEventLog: { append: function (e) { eventLog.push(e); } },
        setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, clearInterval: function () {},
        fetch: function () { return Promise.resolve({ ok: true, text: function () { return Promise.resolve('{}'); }, json: function () { return Promise.resolve({}); } }); },
    };
    var stub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; } };
    global.window.L = { layerGroup: function () { return { addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; } }; }, marker: function () { return Object.assign({}, stub); }, divIcon: function () { return {}; }, circleMarker: function () { return Object.assign({}, stub); }, polyline: function () { return Object.assign({}, stub); } };
    global.window.map = { hasLayer: function () { return false; }, removeLayer: function () {}, addLayer: function () {}, on: function () {}, off: function () {}, panTo: function () {}, fitBounds: function () {} };
    global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
    global.window.RmoozFreeFightAI = null;
    require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
    require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
    var DEMO = global.window.RmoozFreeFightDemo;
    function mountScenario(scenario, objLL) {
        global.window.RmoozScenario = { scenario: scenario };
        var payload = { brief: { operational_brief: { proposed_units: [], objectives: [{ label: scenario.obj.name, lat: objLL.lat, lon: objLL.lon }], placement_candidates: [{ type: 'base', lat: objLL.lat, lon: objLL.lon, name: 'AB' }] } } };
        DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(payload);
    }
    return { DEMO: DEMO, elById: elById, bodyEl: bodyEl, eventLog: eventLog, mountScenario: mountScenario };
}
