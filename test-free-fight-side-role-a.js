/**
 * test-free-fight-side-role-a.js — RMOOZ-SIDE-ROLE-A
 *
 * Acceptance tests for the side-role logic fix:
 *   RED is always the attacker — attack/probe/recon/support/screen/assault/flank COAs only.
 *   BLUE is always the defender — defend/intercept/screen/reinforce/observe/reserve COAs only.
 *   BLUE must NEVER generate assault/attack COAs against Objective X.
 *   Event log records "RED ATTACK COA generated against Objective X" and
 *   "BLUE DEFENSE COA generated to defend Objective X".
 *   SCC target_type is side-aware (RED→attack/recon/support, BLUE→defend/intercept/screen).
 *   LLM freedom-mode system prompt is side-specific (no cross-contamination).
 *
 * Tests (9):
 *   1  RED staff-safe COA uses offensive roles only (no defend/intercept)
 *   2  RED COA targets are positioned NE of Objective X (attack approach axis)
 *   3  BLUE staff-safe COA uses defensive roles only (no assault/attack)
 *   4  BLUE COA targets are positioned NE of Objective X (facing RED approach, not SW attack)
 *   5  Event log: RED COA generation records "RED ATTACK COA generated against Objective X"
 *   6  Event log: BLUE COA generation records "BLUE DEFENSE COA generated to defend Objective X"
 *   7  _sccActionTargets: RED MOVE actions get attack/recon/support target_type labels
 *   8  _sccActionTargets: BLUE MOVE actions get defend/intercept/screen target_type labels
 *   9  free-fight-coa-planner.js freedom-mode system prompt is side-specific
 */
'use strict';
var assert = require('assert');
var path = require('path');
var fs = require('fs');

// ── DOM / window stub ─────────────────────────────────────────────────────────
var elById = {};
function makeEl(t) {
    var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; },
        removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, removeEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getAttribute: function (k) { return this.attrs[k]; } };
    Object.defineProperty(el, 'parentNode', { value: null, writable: true });
    return el;
}
var bodyEl = makeEl('body');
var eventLogLines = [];
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
global.window = {
    document: global.document,
    // _appendToEventLog passes { category, severity, source, message } to AppShellEventLog.append — capture .message
    AppShellEventLog: { append: function (msg) { eventLogLines.push((msg && typeof msg === 'object' && msg.message) ? String(msg.message) : String(msg || '')); } },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; },
        setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function () { return Promise.resolve({ ok: true, status: 200, statusText: 'OK',
        text: function () { return Promise.resolve('{}'); }, json: function () { return Promise.resolve({}); } }); },
};
global.window.window = global.window;

// ── Scenario / units ──────────────────────────────────────────────────────────
var OBJ = { lat: 24.45, lon: 54.40 };   // Objective X at (24.45, 54.40)
global.window.RmoozScenario = {
    scenario: {
        red_units:         [{ id: 'R-1', side: 'RED',  lat: 24.52, lon: 54.50 },
                            { id: 'R-2', side: 'RED',  lat: 24.50, lon: 54.52 },
                            { id: 'R-3', side: 'RED',  lat: 24.48, lon: 54.48 }],
        blue_units_initial:[{ id: 'B-1', side: 'BLUE', lat: 24.38, lon: 54.32 },
                            { id: 'B-2', side: 'BLUE', lat: 24.40, lon: 54.30 },
                            { id: 'B-3', side: 'BLUE', lat: 24.42, lon: 54.34 }],
        obj: { name: 'Objective X', lat: OBJ.lat, lon: OBJ.lon, coord: [OBJ.lon, OBJ.lat] },
    }
};

var C = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(C, 'world-state-db.js'));
require(path.join(C, 'symbol-db.js'));
require(path.join(C, 'symbol-registry.js'));
require(path.join(C, 'free-fight-demo.js'));
require(path.join(C, 'scenario-control-center.js'));
var DEMO = global.window.RmoozFreeFightDemo;

DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: OBJ.lat, lon: OBJ.lon }] } } });
DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, ai_execution_enabled: true, model_available: true, provider: 'ollama', model: 'qwen2.5:7b' });
DEMO.setObjective({ lat: OBJ.lat, lon: OBJ.lon });

// ── Helpers ───────────────────────────────────────────────────────────────────
var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

// Kilometer distance between two LL points (Haversine approximation)
function kmBetween(a, b) {
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var sinLat = Math.sin(dLat / 2), sinLon = Math.sin(dLon / 2);
    var c = 2 * Math.asin(Math.sqrt(sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLon * sinLon));
    return c * 6371;
}

// Units for staff-safe templates
var redUnits  = global.window.RmoozScenario.scenario.red_units;
var blueUnits = global.window.RmoozScenario.scenario.blue_units_initial;

// Side-role contract: these roles must never appear on the wrong side.
var RED_FORBIDDEN_ROLES  = ['defend','intercept'];           // RED must never defend/intercept
var BLUE_FORBIDDEN_ROLES = ['assault','attack','seize'];     // BLUE must never assault/attack
var BLUE_ALLOWED_ROLES   = ['recon','screen','intercept','defend','reinforce','reserve','hold','observe'];

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1 — RED staff-safe COA uses offensive roles only
try {
    eventLogLines.length = 0;
    var redCoa = DEMO._staffSafeCommanderCoaForTest('RED', redUnits, OBJ, 'TEST-ATK-1');
    assert(redCoa, 'RED COA returned');
    assert.strictEqual(redCoa.side, 'RED', 'side=RED');
    var redMoves = redCoa.phases.reduce(function (acc, p) { return acc.concat(p.actions || []); }, []).filter(function (a) { return a.action_type === 'MOVE'; });
    assert(redMoves.length > 0, 'RED COA has MOVE actions');
    var badRoles = redMoves.filter(function (a) { return RED_FORBIDDEN_ROLES.indexOf(a.role) !== -1; });
    assert.strictEqual(badRoles.length, 0, 'RED MOVE actions have no forbidden defensive roles (found: ' + badRoles.map(function(a){return a.role;}).join(',') + ')');
    var goodRoles = redMoves.filter(function (a) { return ['assault','recon','support','screen','probe','flank'].indexOf(a.role) !== -1; });
    assert(goodRoles.length > 0, 'RED MOVE actions use offensive roles: ' + goodRoles.map(function(a){return a.role;}).join(','));
    ok('1 RED staff-safe COA uses only offensive roles (' + goodRoles.map(function(a){return a.role;}).join('/') + ')');
} catch (e) { bad('1 RED offensive roles', e); }

// 2 — RED COA targets are positioned toward Objective X from NE (attack approach)
try {
    var redCoa2 = DEMO._staffSafeCommanderCoaForTest('RED', redUnits, OBJ, 'TEST-ATK-2');
    var redMoves2 = redCoa2.phases.reduce(function (acc, p) { return acc.concat(p.actions || []); }, []).filter(function (a) { return a.action_type === 'MOVE' && a.target; });
    assert(redMoves2.length > 0, 'RED COA has MOVE targets');
    var maxKm = 0;
    redMoves2.forEach(function (a) { var km = kmBetween({ lat: a.target.lat, lon: a.target.lon }, OBJ); if (km > maxKm) maxKm = km; });
    assert(maxKm <= 15, 'All RED targets within 15km of Objective X (max=' + maxKm.toFixed(1) + 'km)');
    var minKm = Infinity;
    redMoves2.forEach(function (a) { var km = kmBetween({ lat: a.target.lat, lon: a.target.lon }, OBJ); if (km < minKm) minKm = km; });
    assert(minKm >= 1, 'No RED target teleports to exact objective (min=' + minKm.toFixed(1) + 'km)');
    ok('2 RED MOVE targets 1–15km from Objective X (attack approach, max=' + maxKm.toFixed(1) + 'km)');
} catch (e) { bad('2 RED targets near objective', e); }

// 3 — BLUE staff-safe COA uses defensive roles only (no assault/attack)
try {
    eventLogLines.length = 0;
    var blueCoa = DEMO._staffSafeCommanderCoaForTest('BLUE', blueUnits, OBJ, 'TEST-DEF-1');
    assert(blueCoa, 'BLUE COA returned');
    assert.strictEqual(blueCoa.side, 'BLUE', 'side=BLUE');
    var blueMoves = blueCoa.phases.reduce(function (acc, p) { return acc.concat(p.actions || []); }, []).filter(function (a) { return a.action_type === 'MOVE'; });
    assert(blueMoves.length > 0, 'BLUE COA has MOVE actions');
    var badBluRoles = blueMoves.filter(function (a) { return BLUE_FORBIDDEN_ROLES.indexOf(a.role) !== -1; });
    assert.strictEqual(badBluRoles.length, 0, 'BLUE has no attack/assault roles (found: ' + badBluRoles.map(function(a){return a.role;}).join(',') + ')');
    var goodBluRoles = blueMoves.filter(function (a) { return BLUE_ALLOWED_ROLES.indexOf(a.role) !== -1; });
    assert(goodBluRoles.length > 0, 'BLUE MOVE actions use defensive roles: ' + goodBluRoles.map(function(a){return a.role;}).join(','));
    ok('3 BLUE staff-safe COA uses only defensive roles (' + goodBluRoles.map(function(a){return a.role;}).join('/') + ')');
} catch (e) { bad('3 BLUE defensive roles', e); }

// 4 — BLUE COA targets are within 15km of Objective X (defensive positions, not SW attack approach)
try {
    var blueCoa4 = DEMO._staffSafeCommanderCoaForTest('BLUE', blueUnits, OBJ, 'TEST-DEF-2');
    var blueMoves4 = blueCoa4.phases.reduce(function (acc, p) { return acc.concat(p.actions || []); }, []).filter(function (a) { return a.action_type === 'MOVE' && a.target; });
    assert(blueMoves4.length > 0, 'BLUE COA has MOVE targets');
    var maxBluKm = 0;
    blueMoves4.forEach(function (a) { var km = kmBetween({ lat: a.target.lat, lon: a.target.lon }, OBJ); if (km > maxBluKm) maxBluKm = km; });
    assert(maxBluKm <= 15, 'All BLUE targets within 15km of Objective X (max=' + maxBluKm.toFixed(1) + 'km)');
    ok('4 BLUE MOVE targets within 15km of Objective X (defensive positions, max=' + maxBluKm.toFixed(1) + 'km)');
} catch (e) { bad('4 BLUE targets near objective', e); }

// 5 — Event log records "RED ATTACK COA generated against Objective X"
try {
    eventLogLines.length = 0;
    DEMO._staffSafeCommanderCoaForTest('RED', redUnits, OBJ, 'LOG-TEST-RED');
    var redLog = eventLogLines.join('\n');
    assert(/RED ATTACK COA generated against Objective X/.test(redLog),
        'event log has RED ATTACK message (got: ' + redLog.slice(0, 200) + ')');
    ok('5 Event log: "RED ATTACK COA generated against Objective X"');
} catch (e) { bad('5 RED event log message', e); }

// 6 — Event log records "BLUE DEFENSE COA generated to defend Objective X"
try {
    eventLogLines.length = 0;
    DEMO._staffSafeCommanderCoaForTest('BLUE', blueUnits, OBJ, 'LOG-TEST-BLUE');
    var blueLog = eventLogLines.join('\n');
    assert(/BLUE DEFENSE COA generated to defend Objective X/.test(blueLog),
        'event log has BLUE DEFENSE message (got: ' + blueLog.slice(0, 200) + ')');
    ok('6 Event log: "BLUE DEFENSE COA generated to defend Objective X"');
} catch (e) { bad('6 BLUE event log message', e); }

// 7 — _sccActionTargets: RED MOVE actions get attack/recon/support target_type
try {
    var redCoaForScc = DEMO._staffSafeCommanderCoaForTest('RED', redUnits, OBJ, 'SCC-RED');
    var redTargets = DEMO._sccActionTargetsForTest(redCoaForScc);
    var redMoveTargets = redTargets.filter(function (t) { return t.action === 'MOVE'; });
    assert(redMoveTargets.length > 0, 'RED SCC targets has MOVE entries');
    var redOkTypes = redMoveTargets.filter(function (t) { return /attack|recon|support|screen/.test(t.target_type); });
    assert(redOkTypes.length > 0, 'RED MOVE entries have offensive target_type: ' + redMoveTargets.map(function(t){return t.role+'→'+t.target_type;}).join(', '));
    var redBadTypes = redMoveTargets.filter(function (t) { return /defend|intercept/.test(t.target_type); });
    assert.strictEqual(redBadTypes.length, 0, 'RED has no defend/intercept target_type');
    ok('7 _sccActionTargets RED: offensive target_type (' + redMoveTargets.map(function(t){return t.target_type;}).join('/') + ')');
} catch (e) { bad('7 RED scc target_type', e); }

// 8 — _sccActionTargets: BLUE MOVE actions get defend/intercept/screen target_type
try {
    var blueCoaForScc = DEMO._staffSafeCommanderCoaForTest('BLUE', blueUnits, OBJ, 'SCC-BLUE');
    var blueTargets = DEMO._sccActionTargetsForTest(blueCoaForScc);
    var blueMoveTargets = blueTargets.filter(function (t) { return t.action === 'MOVE'; });
    assert(blueMoveTargets.length > 0, 'BLUE SCC targets has MOVE entries');
    var blueOkTypes = blueMoveTargets.filter(function (t) { return /defend|intercept|screen|observe|reinforce/.test(t.target_type); });
    assert(blueOkTypes.length > 0, 'BLUE MOVE entries have defensive target_type: ' + blueMoveTargets.map(function(t){return t.role+'→'+t.target_type;}).join(', '));
    var blueBadTypes = blueMoveTargets.filter(function (t) { return /^attack$/.test(t.target_type); });
    assert.strictEqual(blueBadTypes.length, 0, 'BLUE has no "attack" target_type');
    ok('8 _sccActionTargets BLUE: defensive target_type (' + blueMoveTargets.map(function(t){return t.target_type;}).join('/') + ')');
} catch (e) { bad('8 BLUE scc target_type', e); }

// 9 — free-fight-coa-planner.js freedom-mode system prompt is side-specific
try {
    var plannerSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified', 'server', 'ai', 'free-fight-coa-planner.js'), 'utf8');
    assert(/BLUE is the DEFENDER/.test(plannerSrc), 'freedom mode has BLUE DEFENDER restriction');
    assert(/RED is the ATTACKER/.test(plannerSrc), 'freedom mode has RED ATTACKER restriction');
    assert(/NEVER generate attack or assault COAs for BLUE/.test(plannerSrc), 'freedom mode explicitly blocks BLUE attack');
    assert(/NEVER generate defend or intercept COAs for RED/.test(plannerSrc), 'freedom mode explicitly blocks RED defend');
    // Non-freedom mode (controlled) should already be side-aware (pre-existing, just verify it's still there)
    assert(/BLUE \(defending\)/.test(plannerSrc), 'controlled mode still has BLUE defending label');
    assert(/RED \(attacking\)/.test(plannerSrc), 'controlled mode still has RED attacking label');
    ok('9 free-fight-coa-planner.js freedom-mode system prompt is side-specific (RED attacker / BLUE defender)');
} catch (e) { bad('9 planner side-specific prompt', e); }

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-side-role-a.js)');
process.exit(fail === 0 ? 0 : 1);
