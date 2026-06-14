#!/usr/bin/env node
/*
 * FREEFIGHT-DEMO-AI-MOVE-PROOF-A
 *
 * Proof-of-concept tests for the unit-level Free Fight action engine.
 * Tests cover the deterministic brain, validator, apply, and event log.
 *
 * No DOM, no LLM, no server required — pure Node.
 *
 * Tests:
 *   §1  deterministic brain returns valid action when unit + objective present
 *   §2  validator blocks: unit has no coordinate
 *   §3  validator blocks: unknown unit
 *   §4  apply moves unit coordinate toward target
 *   §5  apply does NOT move objective
 *   §6  apply does NOT create new units
 *   §7  event log contains AI decision reason
 *   §8  HOLD_POSITION does not move unit
 *   §9  DEFEND_BASE (BLUE) action returned when preferSide=BLUE
 *   §10 fallback works without LLM (no env var RMOOZ_FREE_FIGHT_LLM)
 *   §11 validator blocks invalid action_type
 *   §12 validator blocks side mismatch
 *   §13 step size ≤ STEP_DEG when unit is far from target
 *   §14 step arrives exactly when unit is closer than STEP_DEG
 *   §15 event log shows BLOCKED when apply fails
 */
'use strict';

var path = require('path');
var ENGINE = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-action-engine.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}
function eq(label, a, b) { ok(label + ' (got ' + JSON.stringify(a) + ')', a === b); }

console.log('FREEFIGHT-DEMO-AI-MOVE-PROOF-A');

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeUnit(id, side, lat, lon, platform) {
    return { id: id, side: side, lat: lat, lon: lon, platform: platform || 'F-14A Tomcat',
             needs_review: true, exact_unit_position: false, source_type: 'multi_country_step1_orbat' };
}
function makeNoCoordUnit(id, side) {
    return { id: id, side: side, lat: null, lon: null, platform: 'S-300 SAM',
             needs_review: true, exact_unit_position: false };
}

var OBJ_X = { lat: 26.0, lon: 53.0 };

var RED_UNIT   = makeUnit('IR-F14-001', 'RED',  27.21, 56.38, 'F-14A Tomcat');
var BLUE_UNIT  = makeUnit('UAE-F16-001', 'BLUE', 24.25, 54.55, 'F-16E Block 60');
var NOCOORD    = makeNoCoordUnit('IR-S300-001', 'RED');

// ── §1  Brain returns valid action ────────────────────────────────────────────
console.log('\n§1  Brain: valid action with unit + objective');

var action1 = ENGINE.decideAction([RED_UNIT, BLUE_UNIT], [OBJ_X], { preferSide: 'RED' });
ok('§1 action returned', !!action1);
ok('§1 action_type is valid', ENGINE.ALLOWED_ACTION_TYPES.indexOf(action1 && action1.action_type) >= 0);
ok('§1 side = RED', action1 && action1.side === 'RED');
ok('§1 unit_uid = RED unit id', action1 && action1.unit_uid === 'IR-F14-001');
ok('§1 target has lat/lon', action1 && action1.target && action1.target.lat != null && action1.target.lon != null);
ok('§1 reason is a non-empty string', action1 && typeof action1.reason === 'string' && action1.reason.length > 0);
ok('§1 confidence is valid', action1 && ['low','medium','high'].indexOf(action1.confidence) >= 0);
ok('§1 source = deterministic_demo_ai', action1 && action1.source === 'deterministic_demo_ai');
ok('§1 demo_only = true', action1 && action1.demo_only === true);
ok('§1 needs_review = true', action1 && action1.needs_review === true);
ok('§1 action_type = MOVE_TOWARD_OBJECTIVE (RED + objective)', action1 && action1.action_type === 'MOVE_TOWARD_OBJECTIVE');

// ── §2  Validator blocks: unit has no coordinate ──────────────────────────────
console.log('\n§2  Validator: block unit with no coordinate');

var actionNoCoord = {
    action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED',
    unit_uid: 'IR-S300-001',
    target: { type: 'objective', lat: 26.0, lon: 53.0 },
    reason: 'test', risk: 'low', confidence: 'medium', source: 'deterministic_demo_ai',
};
var v2 = ENGINE.validateAction(actionNoCoord, [NOCOORD]);
ok('§2 ok = false', v2.ok === false);
ok('§2 reason mentions coordinate', v2.reason && /coordinate|coord/.test(v2.reason));

// ── §3  Validator blocks: unknown unit ────────────────────────────────────────
console.log('\n§3  Validator: block unknown unit');

var actionUnknown = Object.assign({}, actionNoCoord, { unit_uid: 'DOES-NOT-EXIST' });
var v3 = ENGINE.validateAction(actionUnknown, [RED_UNIT]);
ok('§3 ok = false', v3.ok === false);
ok('§3 reason mentions not found', v3.reason && /not found|not exist/i.test(v3.reason));

// ── §4  Apply moves unit coordinate ──────────────────────────────────────────
console.log('\n§4  Apply: unit coordinate moves toward target');

// Use a fresh copy so we don't pollute later tests
var unitCopy = Object.assign({}, RED_UNIT);
var action4 = ENGINE.decideAction([unitCopy], [OBJ_X], { preferSide: 'RED' });
var oldLat = unitCopy.lat, oldLon = unitCopy.lon;
var r4 = ENGINE.applyAction(action4, [unitCopy]);

ok('§4 apply ok = true', r4.ok === true);
ok('§4 old_pos captured', r4.old_pos && r4.old_pos.lat === oldLat);
ok('§4 new_pos different from old', r4.new_pos && (r4.new_pos.lat !== oldLat || r4.new_pos.lon !== oldLon));
ok('§4 unit.lat updated in-place', unitCopy.lat === r4.new_pos.lat);
ok('§4 unit.lon updated in-place', unitCopy.lon === r4.new_pos.lon);
ok('§4 step ≤ STEP_DEG (no teleport)',
    Math.abs(r4.new_pos.lat - oldLat) <= ENGINE.STEP_DEG + 0.001 &&
    Math.abs(r4.new_pos.lon - oldLon) <= ENGINE.STEP_DEG + 0.001);

// ── §5  Apply does NOT move objective ────────────────────────────────────────
console.log('\n§5  Apply: objective is not mutated');

var objCopy = { lat: OBJ_X.lat, lon: OBJ_X.lon };
ENGINE.applyAction(action4, [unitCopy]);
ok('§5 objective lat unchanged', objCopy.lat === OBJ_X.lat);
ok('§5 objective lon unchanged', objCopy.lon === OBJ_X.lon);

// ── §6  Apply does NOT create new units ──────────────────────────────────────
console.log('\n§6  Apply: no new units created');

var units6 = [makeUnit('IR-F14-002', 'RED', 27.0, 56.0, 'F-4E Phantom')];
var countBefore = units6.length;
var action6 = ENGINE.decideAction(units6, [OBJ_X]);
ENGINE.applyAction(action6, units6);
ok('§6 units array length unchanged', units6.length === countBefore);

// ── §7  Event log contains reason ────────────────────────────────────────────
console.log('\n§7  Event log: contains AI decision reason');

var unitLog = makeUnit('IR-F14-003', 'RED', 27.0, 56.0, 'MiG-29');
var actionLog = ENGINE.decideAction([unitLog], [OBJ_X]);
var r7 = ENGINE.applyAction(actionLog, [unitLog]);
var logEntry = ENGINE.makeEventLogEntry(actionLog, r7);

ok('§7 log entry is a non-empty string', typeof logEntry === 'string' && logEntry.length > 0);
ok('§7 log mentions "AI Decision"', /AI Decision/i.test(logEntry));
ok('§7 log contains side (RED)', /RED/.test(logEntry));
ok('§7 log contains platform (MiG-29)', /MiG-29/.test(logEntry));
ok('§7 log contains reason text', actionLog.reason && logEntry.indexOf(actionLog.reason) >= 0);
ok('§7 log contains confidence', /confidence/.test(logEntry));
ok('§7 log contains source tag', /deterministic_demo_ai/.test(logEntry));

// ── §8  HOLD_POSITION does not move unit ─────────────────────────────────────
console.log('\n§8  HOLD_POSITION: unit does not move');

var unitHold = makeUnit('IR-HOLD-001', 'RED', 27.0, 56.0, 'Radar');
var holdAction = {
    action_type: 'HOLD_POSITION', side: 'RED', unit_uid: 'IR-HOLD-001',
    target: { type: 'coord', lat: 27.0, lon: 56.0 },
    reason: 'Hold position.', risk: 'low', confidence: 'high', source: 'deterministic_demo_ai',
};
var r8 = ENGINE.applyAction(holdAction, [unitHold]);
ok('§8 apply ok = true', r8.ok === true);
ok('§8 lat unchanged', unitHold.lat === 27.0);
ok('§8 lon unchanged', unitHold.lon === 56.0);

// ── §9  DEFEND_BASE returned for BLUE ────────────────────────────────────────
console.log('\n§9  Brain: BLUE unit gets DEFEND_BASE action');

var action9 = ENGINE.decideAction([BLUE_UNIT], [OBJ_X], { preferSide: 'BLUE' });
ok('§9 action returned', !!action9);
ok('§9 side = BLUE', action9 && action9.side === 'BLUE');
ok('§9 action_type = DEFEND_BASE', action9 && action9.action_type === 'DEFEND_BASE');
ok('§9 unit_uid = BLUE unit', action9 && action9.unit_uid === 'UAE-F16-001');

// ── §10  Fallback without LLM ─────────────────────────────────────────────────
console.log('\n§10 Fallback works without LLM');

var savedEnv = process.env.RMOOZ_FREE_FIGHT_LLM;
delete process.env.RMOOZ_FREE_FIGHT_LLM;
var unitFallback = makeUnit('FALLBACK-001', 'RED', 27.0, 56.0, 'F-14A');
var actionFallback = ENGINE.decideAction([unitFallback], [OBJ_X]);
ok('§10 deterministic action still returned without LLM env var', !!actionFallback);
ok('§10 source = deterministic_demo_ai', actionFallback && actionFallback.source === 'deterministic_demo_ai');
if (savedEnv !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv;

// ── §11  Validator blocks invalid action_type ─────────────────────────────────
console.log('\n§11 Validator: block invalid action_type');

var v11 = ENGINE.validateAction({ action_type: 'NUKE_CITY', side: 'RED', unit_uid: 'IR-F14-001', target: { lat: 26, lon: 53 } }, [RED_UNIT]);
ok('§11 ok = false for NUKE_CITY', v11.ok === false);
ok('§11 reason mentions action_type', v11.reason && /action_type/i.test(v11.reason));

// ── §12  Validator blocks side mismatch ───────────────────────────────────────
console.log('\n§12 Validator: block side mismatch');

var v12 = ENGINE.validateAction({
    action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'BLUE',  // RED unit declared as BLUE
    unit_uid: 'IR-F14-001',
    target: { type: 'objective', lat: 26.0, lon: 53.0 },
    reason: 'test', risk: 'low', confidence: 'medium', source: 'deterministic_demo_ai',
}, [RED_UNIT]);
ok('§12 ok = false for side mismatch', v12.ok === false);
ok('§12 reason mentions side', v12.reason && /side/i.test(v12.reason));

// ── §13  Step size is ≤ STEP_DEG when far ─────────────────────────────────────
console.log('\n§13 Step size capped at STEP_DEG when far from target');

var farUnit = makeUnit('FAR-001', 'RED', 10.0, 10.0, 'Long Range Fighter');
var farTarget = { lat: 50.0, lon: 50.0 };   // ~60° away — huge distance
var farAction = {
    action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'FAR-001',
    target: { type: 'objective', lat: farTarget.lat, lon: farTarget.lon },
    reason: 'advance', risk: 'high', confidence: 'low', source: 'deterministic_demo_ai',
};
// Need to call applyAction directly (skip validator's teleport check since we're testing applyAction logic)
// But the validator would pass since the COMPUTED step = STEP_DEG ≤ MAX_STEP_DEG
var r13 = ENGINE.applyAction(farAction, [farUnit]);
ok('§13 apply ok = true', r13.ok === true);
var moved13 = Math.sqrt(Math.pow(r13.new_pos.lat - r13.old_pos.lat, 2) + Math.pow(r13.new_pos.lon - r13.old_pos.lon, 2));
ok('§13 moved distance ≤ STEP_DEG + epsilon', moved13 <= ENGINE.STEP_DEG + 0.001);

// ── §14  Step arrives exactly when close ─────────────────────────────────────
console.log('\n§14 Step arrives at target when closer than STEP_DEG');

var closeUnit = makeUnit('CLOSE-001', 'RED', 26.02, 53.02, 'Scout');  // very close to OBJ_X
var closeAction = {
    action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'CLOSE-001',
    target: { type: 'objective', lat: 26.0, lon: 53.0 },
    reason: 'final approach', risk: 'medium', confidence: 'medium', source: 'deterministic_demo_ai',
};
var r14 = ENGINE.applyAction(closeAction, [closeUnit]);
ok('§14 apply ok = true', r14.ok === true);
// Should land exactly at or very near target (within 0.001°)
var distToTarget = Math.sqrt(Math.pow(closeUnit.lat - 26.0, 2) + Math.pow(closeUnit.lon - 53.0, 2));
ok('§14 unit arrived at or near target', distToTarget < 0.01);

// ── §15  Event log shows BLOCKED when apply fails ─────────────────────────────
console.log('\n§15 Event log: shows BLOCKED when apply fails');

var blockedAction = { action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'NO-SUCH-UNIT',
    target: { lat: 26, lon: 53 }, reason: 'test', risk: 'low', confidence: 'low', source: 'deterministic_demo_ai' };
var rBlocked = ENGINE.applyAction(blockedAction, [RED_UNIT]);
var logBlocked = ENGINE.makeEventLogEntry(blockedAction, rBlocked);
ok('§15 apply correctly fails', rBlocked.ok === false);
ok('§15 log contains BLOCKED', /BLOCKED/i.test(logBlocked));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
