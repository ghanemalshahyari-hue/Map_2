#!/usr/bin/env node
/*
 * FREEFIGHT-BLUE-WARNING-ROE-A
 * BLUE must warn / alert / escalate ROE when RED enters its zones — not silently
 * move like a plain planner. No kill logic / unit removal.
 *
 *  §1  RED outside warning zone → alert_state WATCH
 *  §2  RED inside warning zone → WARNING + trigger red_entered_warning_zone
 *  §3  RED inside defended zone → ALERT
 *  §4  RED inside engagement zone → ENGAGEMENT_READY
 *  §5  BLUE plan recommends Intercept/Forward Defense when RED enters defended zone
 *  §6  Commander assessment mentions warning/alert + ROE
 *  §7  Loop event log contains BLUE WARNING / BLUE ALERT
 *  §8  Client renders the BLUE Warning / ROE block
 *  §9  No unit kill/removal occurs (counts preserved)
 * §10  Scenario-generic: arbitrary objective + arbitrary RED/BLUE unit IDs
 * §11  buildBlueReactionIntent produces warning_actions + event_log, no kill verbs
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

var T = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-situation-triggers.js'));
var P = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

function u(id, side, lat, lon) { return { uid: id, side: side, lat: lat, lon: lon, coord: [lon, lat] }; }
// A defended objective + a spread of BLUE units around it, all outside the warning zone.
function blueRing(prefix, objLat, objLon) {
    return [
        u(prefix + '-1', 'BLUE', objLat + 0.6, objLon + 0.6),
        u(prefix + '-2', 'BLUE', objLat - 0.6, objLon + 0.5),
        u(prefix + '-3', 'BLUE', objLat + 0.5, objLon - 0.6),
        u(prefix + '-4', 'BLUE', objLat - 0.5, objLon - 0.5),
        u(prefix + '-5', 'BLUE', objLat + 0.7, objLon - 0.4),
    ];
}

// ── §1 WATCH (RED far) ───────────────────────────────────────────────────────
console.log('\n§1  RED outside warning zone → WATCH');
var OBJ = [{ lat: 24.33, lon: 54.66, name: 'Objective X' }];
var blue = blueRing('B', 24.33, 54.66);
var redFar = [u('R-1', 'RED', 24.33 + 0.9, 54.66 + 0.9)]; // ~1.27° away, outside 0.35
var sFar = T.evaluateFreeFightSituation(redFar.concat(blue), OBJ, { active_side: 'BLUE' });
ok('§1 alert_state WATCH', sFar.alert_state === 'WATCH', sFar.alert_state);
ok('§1 roe_state HOLD', sFar.roe_state === 'HOLD');
ok('§1 not inside warning zone', sFar.red_inside_blue_warning_zone === false);

// ── §2 WARNING (RED in warning zone only) ────────────────────────────────────
console.log('\n§2  RED inside warning zone → WARNING + trigger');
var redWarn = [u('R-15', 'RED', 24.33 + 0.28, 54.66 + 0.0)]; // 0.28° → inside 0.35, outside 0.20
var sWarn = T.evaluateFreeFightSituation(redWarn.concat(blue), OBJ, { active_side: 'BLUE' });
ok('§2 alert_state WARNING', sWarn.alert_state === 'WARNING', sWarn.alert_state + ' deg=' + sWarn.nearest_red_to_objective_deg);
ok('§2 roe_state WARN', sWarn.roe_state === 'WARN');
ok('§2 trigger red_entered_warning_zone present', sWarn.triggers.some(function (t) { return t.code === 'red_entered_warning_zone'; }));
ok('§2 not in defended zone', sWarn.red_inside_blue_defended_zone === false);
ok('§2 nearest_red_uid is R-15', sWarn.nearest_red_uid === 'R-15');

// ── §3 ALERT (defended zone) ─────────────────────────────────────────────────
console.log('\n§3  RED inside defended zone → ALERT');
var redDef = [u('R-15', 'RED', 24.33 + 0.15, 54.66 + 0.0)]; // 0.15° → inside 0.20, outside 0.10
var sDef = T.evaluateFreeFightSituation(redDef.concat(blue), OBJ, { active_side: 'BLUE' });
ok('§3 alert_state ALERT', sDef.alert_state === 'ALERT', sDef.alert_state + ' deg=' + sDef.nearest_red_to_objective_deg);
ok('§3 roe_state INTERCEPT', sDef.roe_state === 'INTERCEPT');
ok('§3 trigger red_entered_defended_zone present', sDef.triggers.some(function (t) { return t.code === 'red_entered_defended_zone'; }));
ok('§3 not in engagement zone', sDef.red_inside_engagement_zone === false);

// ── §4 ENGAGEMENT_READY ──────────────────────────────────────────────────────
console.log('\n§4  RED inside engagement zone → ENGAGEMENT_READY');
var redEng = [u('R-15', 'RED', 24.33 + 0.06, 54.66 + 0.0)]; // 0.06° → inside 0.10
var sEng = T.evaluateFreeFightSituation(redEng.concat(blue), OBJ, { active_side: 'BLUE' });
ok('§4 alert_state ENGAGEMENT_READY', sEng.alert_state === 'ENGAGEMENT_READY', sEng.alert_state);
ok('§4 roe_state ENGAGE_IF_HOSTILE', sEng.roe_state === 'ENGAGE_IF_HOSTILE');
ok('§4 all three triggers present (escalation)', sEng.triggers.length === 3);

// ── §5 BLUE plan recommends intercept/forward defense in defended zone ────────
console.log('\n§5  BLUE plan recommends intercept / forward defense when RED in defended zone');
(async function () {
    var plan = await P.planCoas(redDef.concat(blue), OBJ, { active_side: 'BLUE', turn_number: 2 }, { preferSide: 'BLUE', useLlm: false });
    var rec = plan.coas.filter(function (c) { return c.recommended; })[0];
    ok('§5 a recommended COA exists', !!rec);
    ok('§5 recommended is intercept or forward defense', rec && /intercept|forward defense|block/i.test(rec.title), rec && rec.title);
    ok('§5 plan.situation_state attached with ALERT', plan.situation_state && plan.situation_state.alert_state === 'ALERT');
    ok('§5 recommended COA carries warning_actions', rec && Array.isArray(rec.warning_actions) && rec.warning_actions.length > 0);
    ok('§5 recommended COA carries alert_state + roe_state', rec && rec.alert_state === 'ALERT' && rec.roe_state === 'INTERCEPT');

    // ── §6 commander assessment ──────────────────────────────────────────────
    console.log('\n§6  Commander assessment mentions warning/alert + ROE');
    ok('§6 assessment mentions BLUE Warning / ROE', /BLUE Warning \/ ROE/.test(plan.commander_assessment));
    ok('§6 assessment names the alert state', /Alert:\s*ALERT/.test(plan.commander_assessment));
    ok('§6 assessment names ROE', /ROE:\s*INTERCEPT/.test(plan.commander_assessment));
    ok('§6 assessment includes a trigger line', /Trigger:/.test(plan.commander_assessment));

    // ── §9 no unit kill/removal ──────────────────────────────────────────────
    console.log('\n§9  No unit kill / removal occurs');
    var before = redDef.concat(blue);
    var totalActions = plan.coas[0].phases.reduce(function (s, ph) { return s + ph.actions.length; }, 0);
    ok('§9 COA covers all BLUE units (none removed)', totalActions === blue.length, totalActions + ' vs ' + blue.length);
    ok('§9 input RED+BLUE arrays unchanged length', before.length === redDef.length + blue.length);
    var srcT = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-situation-triggers.js'), 'utf8');
    // Check for actual removal/kill CODE (not the disclaimer comments that say "no kill logic").
    var codeOnly = srcT.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok('§9 triggers module has no removal/kill code', !/\.splice\(|removeUnit|destroyUnit|\.pop\(\)|killUnit/i.test(codeOnly));

    // ── §10 scenario-generic ─────────────────────────────────────────────────
    console.log('\n§10  Scenario-generic: arbitrary objective + unit IDs');
    var OBJ2 = [{ lat: -10.5, lon: 130.25, name: 'TARGET-ZULU' }];
    var blue2 = blueRing('FRIENDLY', -10.5, 130.25);
    var red2 = [u('HOSTILE-77', 'RED', -10.5 + 0.12, 130.25)];
    var plan2 = await P.planCoas(red2.concat(blue2), OBJ2, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    ok('§10 alert ALERT for the arbitrary scenario', plan2.situation_state.alert_state === 'ALERT', plan2.situation_state.alert_state);
    ok('§10 nearest_red is HOSTILE-77', plan2.situation_state.nearest_red_uid === 'HOSTILE-77');
    ok('§10 objective name carried through', plan2.situation_state.objective.name === 'TARGET-ZULU');
    ok('§10 no hardcoded draft/attack_objective in triggers source', !/draft-\d|attack_objective/.test(srcT));

    // ── §11 buildBlueReactionIntent ──────────────────────────────────────────
    console.log('\n§11  buildBlueReactionIntent: warning_actions + event_log, no kill verbs');
    var intent = T.buildBlueReactionIntent(sDef);
    ok('§11 warning_actions non-empty', Array.isArray(intent.warning_actions) && intent.warning_actions.length > 0);
    ok('§11 event_log has BLUE WARNING', intent.event_log.some(function (e) { return /BLUE WARNING/.test(e); }));
    ok('§11 event_log has BLUE ALERT', intent.event_log.some(function (e) { return /BLUE ALERT/.test(e); }));
    ok('§11 no kill/destroy verbs in actions/log',
        !/\bkill\b|\bdestroy\b|\beliminate\b/i.test(intent.warning_actions.concat(intent.event_log).join(' ')));
    ok('§11 WATCH intent has no warning event log', T.buildBlueReactionIntent(sFar).event_log.length === 0);

    await runClientChecks();
    finish();
})();

// ── §7 + §8 client: event log + UI block (mock harness) ──────────────────────
async function runClientChecks() {
    // §7 loop event log contains BLUE WARNING / BLUE ALERT (drive the real loop)
    console.log('\n§7  Loop event log contains BLUE WARNING / BLUE ALERT');
    var H = loadClientHarness();
    // BLUE acting, RED in defended zone → expect warning + alert event-log lines
    var scen = { red_units: [u('R-15', 'RED', 24.48, 54.66)], blue_units_initial: blueRing('B', 24.33, 54.66),
                 obj: { name: 'Objective X', coord: [54.66, 24.33] } };
    H.mountScenario(scen, { lat: 24.33, lon: 54.66 });
    H.DEMO._setActiveSideForTest('BLUE');
    var body = H.DEMO._buildLoopRequestBodyForTest();
    var plan = await P.planCoas(body.units, body.objectives, { active_side: 'BLUE', turn_number: 1 }, { preferSide: 'BLUE', useLlm: false });
    H.eventLog.length = 0;
    H.DEMO._runTurnCoreForTest(plan, 0);
    await flush();
    ok('§7 BLUE WARNING logged', H.eventLog.some(function (e) { return /BLUE WARNING/.test(e.message || ''); }));
    ok('§7 BLUE ALERT logged', H.eventLog.some(function (e) { return /BLUE ALERT/.test(e.message || ''); }));
    ok('§7 turn still recorded', H.DEMO._getLoopStateForTest().turn === 1);

    // §8 UI renders BLUE Warning / ROE block
    console.log('\n§8  Client renders the BLUE Warning / ROE block');
    H.DEMO._repaintForTest();
    var bodyHtml = H.bodyEl.querySelector('[data-ff="body"]') ? H.bodyEl.querySelector('[data-ff="body"]').innerHTML : '';
    var cmdr = H.elById['rmooz-free-fight-commander-panel'];
    var cmdrHtml = cmdr ? cmdr.innerHTML : '';
    ok('§8 COA card has BLUE Warning / ROE block', /data-ff-roe="block"/.test(bodyHtml) || /data-ff-roe="block"/.test(cmdrHtml));
    ok('§8 block shows Alert + ROE labels', /BLUE Warning \/ ROE/.test(bodyHtml + cmdrHtml) && /Alert:/.test(bodyHtml + cmdrHtml) && /ROE:/.test(bodyHtml + cmdrHtml));
    ok('§8 block names the trigger', /Trigger:/.test(bodyHtml + cmdrHtml));
    // source guard: client renders situation fields
    var srcC = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
    ok('§8 client has _blueWarningRoeHtml', /_blueWarningRoeHtml/.test(srcC));
    ok('§8 client appends blue_reaction_intent.event_log', /blue_reaction_intent[\s\S]{0,120}event_log/.test(srcC));
}

function finish() {
    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
}

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
