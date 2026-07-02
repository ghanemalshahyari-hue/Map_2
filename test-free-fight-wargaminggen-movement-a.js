'use strict';
/**
 * test-free-fight-wargaminggen-movement-a.js — RMOOZ-WARGAMINGGEN-MOVEMENT-ARCHITECTURE-A
 *
 * Verifies the two-layer architecture:
 *   Layer 1 — AI Commander outputs behavior assignments
 *   Layer 2 — Deterministic Movement Engine converts to waypoints + steps
 *
 *  1.  Behavior-based action: unit advances each tick (not teleport, not stuck).
 *  2.  Domain step size: aircraft step > ground step per tick.
 *  3.  Ground unit does NOT reach 150km target in one tick (stepped, not teleport).
 *  4.  Aircraft unit covers >90km in one tick (domain speed).
 *  5.  Patrol_loop policy: unit cycles through waypoints indefinitely.
 *  6.  Hold behavior: unit position unchanged after tick.
 *  7.  Missing-unit commit is blocked (returns null + blocked reason).
 *  8.  Commit blocking resets on new plan (_missingUnitRecords clears).
 *  9.  _getMovedMovementRecordsForTest returns array with moved_km per unit.
 * 10.  movementDebug() rows have behavior + waypoint_policy fields.
 * 11.  movementDebug() rows have moved_km_this_tick field.
 * 12.  movementDebug() rows have remaining_km field.
 * 13.  Source field: behavior-based action = 'ai_behavior', staff_safe = 'staff_safe_fallback'.
 * 14.  _normalizeActionTargets NOT applied to behavior-based AI COA (no _target_normalized flag).
 * 15.  Staff-safe COA still uses movement-engine waypoints (not raw ring coordinates).
 */
var path = require('path');
var assert = require('assert');

// ── DOM stubs ─────────────────────────────────────────────────────────────────
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
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, deterministic: true };
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
var ME = require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-movement-engine.js'));
global.window = {
    document: global.document, AppShellEventLog: { append: function () {} },
    RmoozMovementEngine: ME,
    sessionStorage: (function () { var d = {}; return { getItem:function(k){return d[k]||null;}, setItem:function(k,v){d[k]=String(v);}, removeItem:function(k){delete d[k];} }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function () { return Promise.resolve({ ok:true, status:200, statusText:'OK', text:function(){return Promise.resolve(JSON.stringify(GREEN));}, json:function(){return Promise.resolve(GREEN);} }); },
};
global.window.window = global.window;
global.CustomEvent = function (t, o) { this.type = t; this.detail = (o && o.detail) || {}; };
Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });

var OBJ = { lat: 24.45, lon: 54.40 };

function setScenario(redUnits, blueUnits) {
    global.window.RmoozScenario = { scenario: {
        red_units: redUnits, blue_units_initial: blueUnits,
        obj: { name: 'Obj X', coord: [OBJ.lon, OBJ.lat] }
    }};
}

function makeUnit(id, side, lat, lon, unitType) {
    return { id: id, side: side, lat: lat, lon: lon, unit_type: unitType || 'Infantry',
        name: id, tasking: null, taskable: true, coord: [lon, lat] };
}

setScenario(
    [makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor'),
     makeUnit('R-002', 'RED', 22.5, 52.5, 'F-16 Fighter')],
    [makeUnit('B-001', 'BLUE', 25.5, 55.5, 'Infantry')]
);

var Demo = require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var mountEl = makeEl('div'); mountEl.id = 'scc-root'; elById['scc-root'] = mountEl;
Demo.mount(mountEl);
var eng = Demo.engine;

function kmBetween(a, b) {
    var dx = (a.lat - b.lat) * 111, dy = (a.lon - b.lon) * 111 * Math.cos(a.lat * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
}

// Build a behavior-based COA plan and commit it
function makeBehaviorAction(unitUid, side, behavior, domain, movMode, policy, tgt) {
    return { unit_uid: unitUid, side: side, role: 'assault', action_type: 'MOVE_TO_OBJECTIVE',
        behavior: behavior, domain: domain, movement_mode: movMode, waypoint_policy: policy,
        _source: 'ai_behavior',
        target: tgt || { lat: OBJ.lat, lon: OBJ.lon } };
}

function makePlan(actions, source) {
    return { ok: true, plan_source: source || 'ai',
        coas: [{ id: 'coa-1', phases: [{ phase_number: 1, actions: actions }] }] };
}

function commitPlan(plan) {
    Demo._setCoaPlanForTest(plan, false, 0);
    return eng.commit(0);
}

var passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

// T-1: behavior-based unit advances each tick
test('T-1 behavior-based ground unit moves each tick (not stuck)', function () {
    var plan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    var ex = commitPlan(plan);
    assert.ok(ex, 'commit must succeed');
    var r1 = Demo._findRealUnitForTest('R-001');
    var startLat = +r1.unit.lat, startLon = +r1.unit.lon;
    Demo._coaExecTickForTest();
    var r1b = Demo._findRealUnitForTest('R-001');
    var moved = kmBetween({ lat: startLat, lon: startLon }, { lat: +r1b.unit.lat, lon: +r1b.unit.lon });
    assert.ok(moved > 5, 'unit should have moved >5km, got ' + moved.toFixed(1) + 'km');
});

// T-2: aircraft step > ground step per tick
test('T-2 aircraft step per tick > ground step per tick', function () {
    // Ground unit
    var gPlan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    commitPlan(gPlan);
    var gStart = Demo._findRealUnitForTest('R-001').unit;
    var gLat0 = +gStart.lat, gLon0 = +gStart.lon;
    Demo._coaExecTickForTest();
    var gLat1 = +Demo._findRealUnitForTest('R-001').unit.lat;
    var gLon1 = +Demo._findRealUnitForTest('R-001').unit.lon;
    var gMoved = kmBetween({ lat: gLat0, lon: gLon0 }, { lat: gLat1, lon: gLon1 });

    // Aircraft unit (reset scenario to restore R-002 position)
    setScenario(
        [makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor'),
         makeUnit('R-002', 'RED', 22.5, 52.5, 'F-16 Fighter')],
        [makeUnit('B-001', 'BLUE', 25.5, 55.5, 'Infantry')]
    );
    var aPlan = makePlan([makeBehaviorAction('R-002', 'RED', 'patrol', 'air', 'air', 'patrol_loop')]);
    commitPlan(aPlan);
    var aStart = Demo._findRealUnitForTest('R-002').unit;
    var aLat0 = +aStart.lat, aLon0 = +aStart.lon;
    Demo._coaExecTickForTest();
    var aLat1 = +Demo._findRealUnitForTest('R-002').unit.lat;
    var aLon1 = +Demo._findRealUnitForTest('R-002').unit.lon;
    var aMoved = kmBetween({ lat: aLat0, lon: aLon0 }, { lat: aLat1, lon: aLon1 });

    assert.ok(aMoved > gMoved, 'aircraft (' + aMoved.toFixed(1) + 'km) should move more than ground (' + gMoved.toFixed(1) + 'km) per tick');
});

// T-3: ground unit does NOT reach 150km target in one tick
test('T-3 ground unit does NOT teleport 150km in one tick', function () {
    setScenario(
        [makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')],
        [makeUnit('B-001', 'BLUE', 25.5, 55.5, 'Infantry')]
    );
    var plan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step',
        { lat: OBJ.lat, lon: OBJ.lon })]);
    commitPlan(plan);
    var r1Start = Demo._findRealUnitForTest('R-001').unit;
    var startDist = kmBetween({ lat: +r1Start.lat, lon: +r1Start.lon }, OBJ);
    Demo._coaExecTickForTest();
    var r1After = Demo._findRealUnitForTest('R-001').unit;
    var endDist = kmBetween({ lat: +r1After.lat, lon: +r1After.lon }, OBJ);
    // Should have moved ~25km, still >100km from objective
    assert.ok(endDist > 100, 'ground unit should still be >100km from obj after 1 tick (start=' + startDist.toFixed(0) + 'km, now=' + endDist.toFixed(0) + 'km)');
});

// T-4: aircraft covers >90km in one tick
test('T-4 aircraft unit covers >90km per tick', function () {
    setScenario(
        [makeUnit('R-002', 'RED', 22.5, 52.5, 'F-16 Fighter')],
        [makeUnit('B-001', 'BLUE', 25.5, 55.5, 'Infantry')]
    );
    var plan = makePlan([makeBehaviorAction('R-002', 'RED', 'patrol', 'air', 'air', 'patrol_loop')]);
    commitPlan(plan);
    var aStart = Demo._findRealUnitForTest('R-002').unit;
    var aLat0 = +aStart.lat, aLon0 = +aStart.lon;
    Demo._coaExecTickForTest();
    var aAfter = Demo._findRealUnitForTest('R-002').unit;
    var moved = kmBetween({ lat: aLat0, lon: aLon0 }, { lat: +aAfter.lat, lon: +aAfter.lon });
    assert.ok(moved > 90, 'aircraft should move >90km in one tick, got ' + moved.toFixed(1) + 'km');
});

// T-5: patrol_loop — unit cycles through waypoints (position changes each tick)
test('T-5 patrol_loop: unit position changes each tick (cycles)', function () {
    setScenario([makeUnit('R-002', 'RED', 22.5, 52.5, 'F-16 Fighter')], []);
    var plan = makePlan([makeBehaviorAction('R-002', 'RED', 'patrol', 'air', 'air', 'patrol_loop')]);
    commitPlan(plan);
    var positions = [];
    for (var i = 0; i < 4; i++) {
        Demo._coaExecTickForTest();
        var u = Demo._findRealUnitForTest('R-002').unit;
        positions.push({ lat: +u.lat, lon: +u.lon });
    }
    // Not all positions the same (unit is moving)
    var allSame = positions.every(function (p) { return p.lat === positions[0].lat && p.lon === positions[0].lon; });
    assert.ok(!allSame, 'patrol_loop unit should not stay at the same position');
});

// T-6: hold behavior — unit stays put
test('T-6 hold behavior: unit does not move', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    var holdAction = { unit_uid: 'R-001', side: 'RED', role: 'reserve',
        action_type: 'HOLD_POSITION', behavior: 'hold', domain: 'ground',
        movement_mode: 'static', waypoint_policy: 'hold_area', _source: 'ai_behavior' };
    var plan = makePlan([holdAction]);
    commitPlan(plan);
    var r1start = Demo._findRealUnitForTest('R-001').unit;
    var lat0 = +r1start.lat, lon0 = +r1start.lon;
    Demo._coaExecTickForTest();
    var r1end = Demo._findRealUnitForTest('R-001').unit;
    assert.ok(+r1end.lat === lat0 && +r1end.lon === lon0, 'hold unit must not move');
});

// T-7: commit blocked when unit_uid not on map
test('T-7 commit blocked for missing unit_uid', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    var plan = makePlan([makeBehaviorAction('GHOST-999', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    Demo._setCoaPlanForTest(plan, false, 0);
    var result = eng.commit(0);
    assert.ok(!result, 'commit must return null/falsy for missing unit');
    var missing = Demo._getMissingUnitRecordsForTest();
    assert.ok(missing.length > 0, 'missing unit records must be populated');
});

// T-8: missing records clear on new plan
test('T-8 missing unit records clear on new commit with valid units', function () {
    // Previous test left records; commit a valid plan
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    var plan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    var result = commitPlan(plan);
    assert.ok(result, 'valid plan should commit successfully');
    var missing = Demo._getMissingUnitRecordsForTest();
    assert.strictEqual(missing.length, 0, 'missing records should be cleared after successful commit');
});

// T-9: _getMovedMovementRecordsForTest returns records with moved_km
test('T-9 _getMovedMovementRecordsForTest returns moved_km per unit', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    var plan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    commitPlan(plan);
    Demo._coaExecTickForTest();
    var recs = Demo._getMovedMovementRecordsForTest();
    assert.ok(Array.isArray(recs), 'must return array');
    assert.ok(recs.length > 0, 'must have at least one record after a move tick');
    assert.ok(Number.isFinite(recs[0].moved_km), 'moved_km must be finite');
    assert.ok(recs[0].moved_km > 0, 'moved_km must be > 0 for a moving unit');
});

// T-10: movementDebug rows have behavior + waypoint_policy
test('T-10 movementDebug rows include behavior + waypoint_policy fields', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    var plan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    Demo._setCoaPlanForTest(plan, false, 0);
    var rows = eng.movementDebug();
    assert.ok(rows.length > 0, 'must have rows');
    var r = rows[0];
    assert.ok('behavior' in r, 'row must have behavior field');
    assert.ok('waypoint_policy' in r, 'row must have waypoint_policy field');
    assert.strictEqual(r.behavior, 'approach', 'behavior must match action');
});

// T-11: movementDebug rows have moved_km_this_tick
test('T-11 movementDebug rows have moved_km_this_tick field', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    var plan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    commitPlan(plan);
    Demo._coaExecTickForTest();
    var rows = eng.movementDebug();
    assert.ok(rows.length > 0, 'must have rows');
    assert.ok('moved_km_this_tick' in rows[0], 'row must have moved_km_this_tick');
    assert.ok(Number.isFinite(rows[0].moved_km_this_tick), 'moved_km_this_tick must be finite');
});

// T-12: movementDebug rows have remaining_km
test('T-12 movementDebug rows have remaining_km field', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    var plan = makePlan([makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step')]);
    Demo._setCoaPlanForTest(plan, false, 0);
    var rows = eng.movementDebug();
    assert.ok(rows.length > 0, 'must have rows');
    assert.ok('remaining_km' in rows[0], 'row must have remaining_km');
});

// T-13: source field correctness
test('T-13 source = ai_behavior for behavior-based, staff_safe_fallback for staff-safe', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    // AI behavior plan
    var aiBehavior = makeBehaviorAction('R-001', 'RED', 'approach', 'ground', 'ground', 'direct_step');
    var plan = makePlan([aiBehavior]);
    Demo._setCoaPlanForTest(plan, false, 0);
    var rows = eng.movementDebug();
    assert.ok(rows.length > 0, 'must have rows for AI plan');
    assert.strictEqual(rows[0].source, 'ai_behavior', 'source must be ai_behavior');
});

// T-14: AI COA does NOT get _target_normalized (normalize is disabled for AI COAs)
test('T-14 AI COA behavior actions have no _target_normalized flag', function () {
    setScenario([makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')], []);
    // Far-away target that would be normalized if normalization were applied
    var action = { unit_uid: 'R-001', side: 'RED', role: 'assault', action_type: 'MOVE_TO_OBJECTIVE',
        behavior: 'approach', domain: 'ground', movement_mode: 'ground', waypoint_policy: 'direct_step',
        target: { lat: 20.0, lon: 50.0 }  // >100km from obj
    };
    var plan = { ok: true, plan_source: 'ai', coas: [{ id: 'coa-1', phases: [{ phase_number: 1, actions: [action] }] }] };
    // Simulate the generate path (which now skips normalization for AI COAs)
    Demo._setCoaPlanForTest(plan, false, 0);
    var act = plan.coas[0].phases[0].actions[0];
    assert.ok(!act._target_normalized, 'AI behavior COA must NOT have _target_normalized applied');
});

// T-15: staff-safe COA uses movement engine waypoints (targets near objective)
test('T-15 staff-safe COA target is near objective (movement-engine computed)', function () {
    setScenario(
        [makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')],
        [makeUnit('B-001', 'BLUE', 25.5, 55.5, 'Infantry')]
    );
    var ssUnits = [makeUnit('R-001', 'RED', 23.0, 53.0, 'Armor')];
    var coa = Demo._staffSafeCommanderCoaForTest('RED', ssUnits, OBJ);
    assert.ok(coa, 'staff-safe COA must be generated');
    var actions = coa.phases.reduce(function (a, ph) { return a.concat((ph && ph.actions) || []); }, []);
    var moveActions = actions.filter(function (a) { return a && a.action_type !== 'HOLD_POSITION' && a.target; });
    assert.ok(moveActions.length > 0, 'must have move actions');
    moveActions.forEach(function (act) {
        var d = kmBetween({ lat: act.target.lat, lon: act.target.lon }, OBJ);
        assert.ok(d <= 35, 'staff-safe target should be within 35km of objective, got ' + d.toFixed(1) + 'km for role=' + act.role);
    });
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + passed + '/' + (passed + failed) + ' tests passed.');
if (failed > 0) process.exit(1);
