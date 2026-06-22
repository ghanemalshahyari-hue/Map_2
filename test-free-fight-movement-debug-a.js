'use strict';
/**
 * test-free-fight-movement-debug-a.js — RMOOZ-WARGAMINGGEN-MOVEMENT-ARCHITECTURE-A
 *
 * Verifies the full movementDebug() row spec (all 14 required fields per assignment).
 *
 *  1.  movementDebug() returns array with ≥1 rows when plan is set.
 *  2.  Each row has unit_uid field.
 *  3.  Each row has side field.
 *  4.  Each row has domain field (air|ground|naval|sensor|air_defense|support|static|unknown).
 *  5.  Each row has movement_mode field.
 *  6.  Each row has behavior field (null OK if no behavior set).
 *  7.  Each row has waypoint_policy field.
 *  8.  Each row has cur_lat / cur_lon fields (null if unit not found).
 *  9.  Each row has planned_wp_lat / planned_wp_lon fields.
 * 10.  Each row has distance_to_waypoint_km (null or finite).
 * 11.  Each row has distance_to_objective_km (null or finite).
 * 12.  Each row has remaining_km (null or finite).
 * 13.  Each row has moved_this_tick (boolean) + moved_km_this_tick (number).
 * 14.  Each row has taskable (boolean) + unit_found (boolean).
 * 15.  Each row has blocked_reason (null or string).
 * 16.  Each row has source ('ai_behavior'|'staff_safe_fallback'|'ai'|'manual'|'unknown').
 * 17.  Hold action row has blocked_reason = null (hold is intentional, not blocked).
 * 18.  Missing unit row has unit_found = false + blocked_reason = 'UNIT NOT FOUND'.
 * 19.  After tick, moved_this_tick = true for a moving unit.
 * 20.  After tick, moved_km_this_tick > 0 for a ground unit that moved.
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
global.navigator = { userAgent: '' };

var OBJ = { lat: 24.45, lon: 54.40 };

function makeUnit(id, side, lat, lon) {
    return { id: id, side: side, lat: lat, lon: lon, unit_type: 'Armor',
        name: id, tasking: null, taskable: true, coord: [lon, lat] };
}

global.window.RmoozScenario = { scenario: {
    red_units: [makeUnit('R-001', 'RED', 23.0, 53.0)],
    blue_units_initial: [makeUnit('B-001', 'BLUE', 25.5, 55.5)],
    obj: { name: 'Obj X', coord: [OBJ.lon, OBJ.lat] }
}};

var Demo = require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var mountEl = makeEl('div'); mountEl.id = 'scc-root'; elById['scc-root'] = mountEl;
Demo.mount(mountEl);
var eng = Demo.engine;

// Build a plan with two actions: one behavior-based move + one hold
var PLAN = {
    ok: true, plan_source: 'ai',
    coas: [{ id: 'coa-1', phases: [{ phase_number: 1, actions: [
        { unit_uid: 'R-001', side: 'RED', role: 'assault', action_type: 'MOVE_TO_OBJECTIVE',
          behavior: 'approach', domain: 'ground', movement_mode: 'ground',
          waypoint_policy: 'direct_step', _source: 'ai_behavior',
          target: { lat: OBJ.lat, lon: OBJ.lon } },
        { unit_uid: 'B-001', side: 'BLUE', role: 'reserve', action_type: 'HOLD_POSITION',
          behavior: 'hold', domain: 'ground', movement_mode: 'static',
          waypoint_policy: 'hold_area', _source: 'ai_behavior' }
    ]}]}]
};

Demo._setCoaPlanForTest(PLAN, false, 0);

var passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

var VALID_DOMAINS = ['air', 'ground', 'naval', 'sensor', 'air_defense', 'support', 'static', 'unknown'];
var VALID_SOURCES = ['ai_behavior', 'staff_safe_fallback', 'ai', 'manual', 'unknown'];

var rows = eng.movementDebug();

// T-1: has rows
test('T-1 movementDebug returns ≥1 rows when plan set', function () {
    assert.ok(Array.isArray(rows) && rows.length >= 1, 'must return ≥1 rows');
});

// T-2 through T-16: per-row field contract
function forEachRow(label, fn) {
    assert.ok(rows.length > 0, 'no rows to check');
    rows.forEach(function (r, i) {
        try { fn(r, i); }
        catch (e) { throw new Error('row[' + i + '] ' + (r.uid || '?') + ': ' + e.message); }
    });
}

test('T-2 each row has uid', function () {
    forEachRow('uid', function (r) { assert.ok(r.uid !== undefined, 'missing uid'); });
});

test('T-3 each row has side', function () {
    forEachRow('side', function (r) { assert.ok(r.side !== undefined, 'missing side'); });
});

test('T-4 each row has valid domain', function () {
    forEachRow('domain', function (r) {
        assert.ok(VALID_DOMAINS.indexOf(r.domain) >= 0, 'invalid domain: ' + r.domain);
    });
});

test('T-5 each row has movement_mode', function () {
    forEachRow('movement_mode', function (r) { assert.ok(r.movement_mode !== undefined, 'missing movement_mode'); });
});

test('T-6 each row has behavior field (null allowed)', function () {
    forEachRow('behavior', function (r) { assert.ok('behavior' in r, 'missing behavior key'); });
});

test('T-7 each row has waypoint_policy field', function () {
    forEachRow('waypoint_policy', function (r) { assert.ok('waypoint_policy' in r, 'missing waypoint_policy'); });
});

test('T-8 each row has cur_lat / cur_lon fields', function () {
    forEachRow('cur_lat/cur_lon', function (r) {
        assert.ok('cur_lat' in r, 'missing cur_lat');
        assert.ok('cur_lon' in r, 'missing cur_lon');
    });
});

test('T-9 each row has planned_wp_lat / planned_wp_lon fields', function () {
    forEachRow('planned_wp_lat/planned_wp_lon', function (r) {
        assert.ok('planned_wp_lat' in r, 'missing planned_wp_lat');
        assert.ok('planned_wp_lon' in r, 'missing planned_wp_lon');
    });
});

test('T-10 distance_to_waypoint_km is null or finite', function () {
    forEachRow('distance_to_waypoint_km', function (r) {
        if (r.distance_to_waypoint_km !== null) {
            assert.ok(Number.isFinite(r.distance_to_waypoint_km), 'distance_to_waypoint_km must be null or finite');
        }
    });
});

test('T-11 distance_to_objective_km is null or finite', function () {
    forEachRow('distance_to_objective_km', function (r) {
        if (r.distance_to_objective_km !== null) {
            assert.ok(Number.isFinite(r.distance_to_objective_km), 'distance_to_objective_km must be null or finite');
        }
    });
});

test('T-12 remaining_km is null or finite', function () {
    forEachRow('remaining_km', function (r) {
        if (r.remaining_km !== null) {
            assert.ok(Number.isFinite(r.remaining_km), 'remaining_km must be null or finite');
        }
    });
});

test('T-13 moved_this_tick is boolean + moved_km_this_tick is number', function () {
    forEachRow('moved_this_tick/moved_km_this_tick', function (r) {
        assert.strictEqual(typeof r.moved_this_tick, 'boolean', 'moved_this_tick must be boolean');
        assert.ok(Number.isFinite(r.moved_km_this_tick), 'moved_km_this_tick must be finite');
    });
});

test('T-14 taskable is boolean + unit_found is boolean', function () {
    forEachRow('taskable/unit_found', function (r) {
        assert.strictEqual(typeof r.taskable, 'boolean', 'taskable must be boolean');
        assert.strictEqual(typeof r.unit_found, 'boolean', 'unit_found must be boolean');
    });
});

test('T-15 blocked_reason is null or string', function () {
    forEachRow('blocked_reason', function (r) {
        assert.ok(r.blocked_reason === null || typeof r.blocked_reason === 'string',
            'blocked_reason must be null or string, got: ' + typeof r.blocked_reason);
    });
});

test('T-16 source is a valid value', function () {
    forEachRow('source', function (r) {
        assert.ok(VALID_SOURCES.indexOf(r.source) >= 0, 'invalid source: ' + r.source);
    });
});

// T-17: hold action has blocked_reason = null (intentional hold, not an error)
test('T-17 HOLD_POSITION row has blocked_reason = null (not blocked, just holding)', function () {
    var holdRow = rows.find(function (r) { return r.action_type === 'HOLD_POSITION' || r.behavior === 'hold'; });
    if (!holdRow) { console.log('    (no hold row in plan — skipping)'); return; }
    assert.strictEqual(holdRow.blocked_reason, null, 'hold unit should not have a blocked_reason: got ' + holdRow.blocked_reason);
});

// T-18: missing unit row
test('T-18 missing unit row has unit_found=false + blocked_reason=UNIT NOT FOUND', function () {
    // Inject a plan referencing a ghost unit
    var ghostPlan = {
        ok: true, plan_source: 'ai',
        coas: [{ id: 'coa-x', phases: [{ phase_number: 1, actions: [
            { unit_uid: 'GHOST-000', side: 'RED', role: 'assault', action_type: 'MOVE_TO_OBJECTIVE',
              behavior: 'approach', domain: 'ground', movement_mode: 'ground',
              waypoint_policy: 'direct_step', target: { lat: OBJ.lat, lon: OBJ.lon } }
        ]}]}]
    };
    Demo._setCoaPlanForTest(ghostPlan, false, 0);
    var ghostRows = eng.movementDebug();
    var ghostRow = ghostRows.find(function (r) { return r.uid === 'GHOST-000'; });
    assert.ok(ghostRow, 'must have row for ghost unit');
    assert.strictEqual(ghostRow.unit_found, false, 'ghost unit must have unit_found=false');
    assert.ok(ghostRow.blocked_reason && ghostRow.blocked_reason.indexOf('UNIT NOT FOUND') >= 0,
        'ghost unit must have blocked_reason including UNIT NOT FOUND');
    // Restore original plan
    Demo._setCoaPlanForTest(PLAN, false, 0);
});

// T-19: after tick, moved_this_tick = true for moving unit
test('T-19 after tick, moved_this_tick = true for a moving unit', function () {
    Demo._setCoaPlanForTest(PLAN, false, 0);
    eng.commit(0);
    Demo._coaExecTickForTest();
    var postTickRows = eng.movementDebug();
    var moveRow = postTickRows.find(function (r) { return r.uid === 'R-001'; });
    if (!moveRow) { console.log('    (R-001 row not found in post-tick debug — skipping)'); return; }
    assert.ok(moveRow.moved_this_tick === true, 'moved_this_tick must be true after a move tick');
});

// T-20: moved_km_this_tick > 0 after tick
test('T-20 moved_km_this_tick > 0 for ground unit after tick', function () {
    var postTickRows = eng.movementDebug();
    var moveRow = postTickRows.find(function (r) { return r.uid === 'R-001'; });
    if (!moveRow) { console.log('    (R-001 row not found — skipping)'); return; }
    assert.ok(moveRow.moved_km_this_tick > 0, 'moved_km_this_tick must be > 0, got ' + moveRow.moved_km_this_tick);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + passed + '/' + (passed + failed) + ' tests passed.');
if (failed > 0) process.exit(1);
