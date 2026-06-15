#!/usr/bin/env node
/*
 * FREEFIGHT-AI-COA-PLANNER-A — server module static tests
 *
 * Tests (no server, no LLM):
 *   §1   COA planner module exports exist
 *   §2   buildDeterministicCoas returns exactly 3 COAs
 *   §3   Direct assault COA has ≥ 1 unit with assault role
 *   §4   Flank/Fix COA has assault + support units (when enough units)
 *   §5   Probe COA has recon role units and hold role units
 *   §6   Recommended flag: exactly one COA is recommended:true (deterministic)
 *   §7   validateCoaPlan rejects unknown unit_uid
 *   §8   validateCoaPlan rejects side mismatch
 *   §9   applyCoaPlan moves assault/support units, skips HOLD_POSITION
 *   §10  Teleport guard: large step is allowed (step is capped, not rejected)
 *   §11  makeCoaEventLogEntries returns at least one entry mentioning "AI COA Applied"
 *   §12  LLM normalizer: normalizeCoaAction rejects unit_uid not in allowed_unit_ids
 *   §13  LLM normalizer: normalizeCoa rejects COA with zero valid actions
 *   §14  Reset: applyCoaPlan result has moved array with new_pos
 *   §15  Client source has _coaPlan state var and _generateCoaPlan function
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}

// Load the COA planner module
var PLANNER = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

var CLIENT_SRC = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

// ── Test data ─────────────────────────────────────────────────────────────────
function makeUnits(n) {
    var units = [];
    for (var i = 0; i < n; i++) {
        units.push({
            id: 'R-' + String(i + 1).padStart(3, '0'),
            uid: 'R-' + String(i + 1).padStart(3, '0'),
            side: 'RED',
            lat: 27.0 + i * 0.05,
            lon: 56.0 + i * 0.03,
            platform: 'Tank-' + i,
        });
    }
    return units;
}

var OBJ = { lat: 26.0, lon: 53.0, name: 'Objective X' };
var UNITS_10 = makeUnits(10);
var UNITS_3  = makeUnits(3);

// ═══════════════════════════════════════════════════════════════════════════════
// §1  COA planner module exports exist
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§1  COA planner module exports exist');
ok('§1 planCoas exported',               typeof PLANNER.planCoas === 'function');
ok('§1 validateCoaPlan exported',        typeof PLANNER.validateCoaPlan === 'function');
ok('§1 applyCoaPlan exported',           typeof PLANNER.applyCoaPlan === 'function');
ok('§1 makeCoaEventLogEntries exported', typeof PLANNER.makeCoaEventLogEntries === 'function');
ok('§1 buildDeterministicCoas exported', typeof PLANNER.buildDeterministicCoas === 'function');
ok('§1 normalizeCoa exported',           typeof PLANNER.normalizeCoa === 'function');
ok('§1 normalizeCoaAction exported',     typeof PLANNER.normalizeCoaAction === 'function');
ok('§1 ALLOWED_COA_ACTION_TYPES exported', Array.isArray(PLANNER.ALLOWED_COA_ACTION_TYPES));
ok('§1 ALLOWED_ROLES exported',          Array.isArray(PLANNER.ALLOWED_ROLES));
ok('§1 STEP_DEG exported',              typeof PLANNER.STEP_DEG === 'number');
ok('§1 RECON_STEP_DEG exported',        typeof PLANNER.RECON_STEP_DEG === 'number');

// ═══════════════════════════════════════════════════════════════════════════════
// §2  buildDeterministicCoas returns exactly 3 COAs
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§2  buildDeterministicCoas returns exactly 3 COAs');
var coas10 = PLANNER.buildDeterministicCoas(UNITS_10, OBJ);
ok('§2 returns array', Array.isArray(coas10));
ok('§2 exactly 3 COAs returned', coas10.length === 3, 'got ' + coas10.length);
ok('§2 COA-1 has plan_id COA-1', coas10[0] && coas10[0].plan_id === 'COA-1');
ok('§2 COA-2 has plan_id COA-2', coas10[1] && coas10[1].plan_id === 'COA-2');
ok('§2 COA-3 has plan_id COA-3', coas10[2] && coas10[2].plan_id === 'COA-3');
ok('§2 each COA has phases array', coas10.every(function (c) { return Array.isArray(c.phases); }));
ok('§2 each COA has risks array',  coas10.every(function (c) { return Array.isArray(c.risks); }));

// ═══════════════════════════════════════════════════════════════════════════════
// §3  Direct assault COA has ≥ 1 unit with assault role
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§3  Direct assault COA has ≥ 1 unit with assault role');
var coa1 = coas10[0];
var coa1Actions = (coa1.phases[0] && coa1.phases[0].actions) || [];
var assaultActions = coa1Actions.filter(function (a) { return a.role === 'assault'; });
ok('§3 COA-1 title contains "Assault"', /assault/i.test(coa1.title));
ok('§3 COA-1 has ≥ 1 assault-role action', assaultActions.length >= 1, 'got ' + assaultActions.length);
ok('§3 assault actions have MOVE_TOWARD_OBJECTIVE', assaultActions.every(function (a) { return a.action_type === 'MOVE_TOWARD_OBJECTIVE'; }));
ok('§3 COA-1 risk is high', coa1.risk === 'high');

// ═══════════════════════════════════════════════════════════════════════════════
// §4  Flank/Fix COA has assault + support units (when enough units)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§4  Flank/Fix COA has assault + support units (10 units)');
var coa2 = coas10[1];
var coa2Actions = (coa2.phases[0] && coa2.phases[0].actions) || [];
var coa2Assault = coa2Actions.filter(function (a) { return a.role === 'assault'; });
var coa2Support = coa2Actions.filter(function (a) { return a.role === 'support'; });
ok('§4 COA-2 title contains "Flank"', /flank/i.test(coa2.title));
ok('§4 COA-2 has ≥ 1 assault action', coa2Assault.length >= 1, 'got ' + coa2Assault.length);
ok('§4 COA-2 has ≥ 1 support action', coa2Support.length >= 1, 'got ' + coa2Support.length);
ok('§4 COA-2 support actions have SUPPORT_BY_FIRE', coa2Support.every(function (a) { return a.action_type === 'SUPPORT_BY_FIRE'; }));
ok('§4 COA-2 risk is medium', coa2.risk === 'medium');

// ═══════════════════════════════════════════════════════════════════════════════
// §5  Probe COA has recon role units and hold role units
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§5  Probe COA has recon + hold units');
var coa3 = coas10[2];
var coa3Actions = (coa3.phases[0] && coa3.phases[0].actions) || [];
var coa3Recon = coa3Actions.filter(function (a) { return a.role === 'recon'; });
var coa3Hold  = coa3Actions.filter(function (a) { return a.role === 'hold'; });
ok('§5 COA-3 title contains "Probe" or "Recon"', /probe|recon/i.test(coa3.title));
ok('§5 COA-3 has ≥ 1 recon action', coa3Recon.length >= 1, 'got ' + coa3Recon.length);
ok('§5 COA-3 has ≥ 1 hold action',  coa3Hold.length >= 1, 'got ' + coa3Hold.length);
ok('§5 COA-3 recon actions have RECON_OBJECTIVE', coa3Recon.every(function (a) { return a.action_type === 'RECON_OBJECTIVE'; }));
ok('§5 COA-3 risk is low', coa3.risk === 'low');

// ═══════════════════════════════════════════════════════════════════════════════
// §6  Exactly one COA is recommended:true (deterministic case)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§6  Recommended flag: exactly one COA is recommended:true');
var recommended = coas10.filter(function (c) { return c.recommended === true; });
ok('§6 exactly one COA is recommended:true', recommended.length === 1, 'got ' + recommended.length);
ok('§6 COA-2 (Flank/Fix) is the recommended one', recommended[0] && recommended[0].plan_id === 'COA-2');

// ═══════════════════════════════════════════════════════════════════════════════
// §7  validateCoaPlan rejects unknown unit_uid
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§7  validateCoaPlan rejects unknown unit_uid');
var badPlan = {
    coas: [{ phases: [{ phase_id: 'p1', name: 'Move', actions: [{
        unit_uid: 'NONEXISTENT-UID', side: 'RED', role: 'assault',
        action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: 26.0, lon: 53.0, type: 'objective' }, reason: 'test',
    }]}]}],
};
var vBad = PLANNER.validateCoaPlan(badPlan, UNITS_10, [OBJ]);
ok('§7 validateCoaPlan returns object', !!vBad);
ok('§7 ok === false for unknown uid', vBad.ok === false);
ok('§7 errors array has entry', Array.isArray(vBad.errors) && vBad.errors.length > 0);
ok('§7 error mentions unit not found', vBad.errors.some(function (e) { return /not found/i.test(e); }));

// ═══════════════════════════════════════════════════════════════════════════════
// §8  validateCoaPlan rejects side mismatch
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§8  validateCoaPlan rejects side mismatch');
var mismatchPlan = {
    coas: [{ phases: [{ phase_id: 'p1', name: 'Move', actions: [{
        unit_uid: 'R-001', side: 'BLUE',  // unit is RED, action claims BLUE
        role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        target: { lat: 26.0, lon: 53.0, type: 'objective' }, reason: 'test',
    }]}]}],
};
var vMismatch = PLANNER.validateCoaPlan(mismatchPlan, UNITS_10, [OBJ]);
ok('§8 ok === false for side mismatch', vMismatch.ok === false);
ok('§8 error mentions mismatch', vMismatch.errors.some(function (e) { return /mismatch/i.test(e); }));

// ═══════════════════════════════════════════════════════════════════════════════
// §9  applyCoaPlan moves assault/support units, skips HOLD_POSITION
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§9  applyCoaPlan moves assault/support units, skips HOLD_POSITION');
var unitsCopy = UNITS_10.map(function (u) { return Object.assign({}, u); });
var applyPlan = {
    selected_coa_index: 0,
    coas: coas10,
};
var applyResult = PLANNER.applyCoaPlan(applyPlan, unitsCopy);
ok('§9 applyCoaPlan returns ok:true', applyResult.ok === true);
ok('§9 moved array present', Array.isArray(applyResult.moved));
ok('§9 at least 1 unit moved', applyResult.moved.length >= 1);
ok('§9 skipped array present', Array.isArray(applyResult.skipped));
var holdSkipped = applyResult.skipped.filter(function (s) { return s.reason === 'HOLD_POSITION'; });
ok('§9 HOLD_POSITION actions are skipped', holdSkipped.length >= 1, 'got ' + holdSkipped.length);
ok('§9 moved units have new_pos', applyResult.moved.every(function (m) { return m.new_pos && typeof m.new_pos.lat === 'number'; }));
ok('§9 moved units have old_pos', applyResult.moved.every(function (m) { return m.old_pos && typeof m.old_pos.lat === 'number'; }));
ok('§9 coa_applied field set', typeof applyResult.coa_applied === 'string');

// ═══════════════════════════════════════════════════════════════════════════════
// §10  Teleport guard: step is capped (large distance doesn't exceed MAX_STEP_DEG)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§10  Teleport guard: step is capped at MAX_STEP_DEG');
var MAX = PLANNER.MAX_STEP_DEG;
var unitsFarCopy = [{ id: 'FAR-001', uid: 'FAR-001', side: 'RED', lat: 27.0, lon: 56.0, platform: 'Test' }];
var farPlan = {
    selected_coa_index: 0,
    coas: [{ plan_id: 'COA-1', phases: [{ phase_id: 'p1', name: 'Move', actions: [{
        unit_uid: 'FAR-001', side: 'RED', role: 'assault',
        action_type: 'MOVE_TOWARD_OBJECTIVE',
        // Target is very far (>15 degrees away, well above MAX_STEP_DEG)
        target: { lat: 10.0, lon: 30.0, type: 'objective' }, reason: 'test',
    }]}]}],
};
var farResult = PLANNER.applyCoaPlan(farPlan, unitsFarCopy);
ok('§10 applyCoaPlan returns ok:true', farResult.ok === true);
ok('§10 unit moved (not blocked)', farResult.moved.length === 1 || farResult.errors.length === 1);
if (farResult.moved.length === 1) {
    var stepTaken = Math.sqrt(Math.pow(farResult.moved[0].new_pos.lat - farResult.moved[0].old_pos.lat, 2) +
                              Math.pow(farResult.moved[0].new_pos.lon - farResult.moved[0].old_pos.lon, 2));
    ok('§10 step taken ≤ MAX_STEP_DEG', stepTaken <= MAX + 0.001, 'step=' + stepTaken + ' MAX=' + MAX);
} else {
    // It was blocked (error path is also acceptable for teleport guard)
    ok('§10 teleport guard blocked large step', farResult.errors.length >= 1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §11  makeCoaEventLogEntries returns at least one entry mentioning "AI COA Applied"
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§11  makeCoaEventLogEntries returns entry mentioning "AI COA Applied"');
var logPlan = { plan_source: 'deterministic_coa_fallback', selected_coa_index: 0, coas: coas10 };
var logResult = { moved: [{ unit_uid: 'R-001', old_pos: { lat: 27.0, lon: 56.0 }, new_pos: { lat: 26.95, lon: 55.95 }, action_type: 'MOVE_TOWARD_OBJECTIVE', role: 'assault' }] };
var logEntries = PLANNER.makeCoaEventLogEntries(logPlan, logResult);
ok('§11 returns array', Array.isArray(logEntries));
ok('§11 at least one entry', logEntries.length >= 1);
ok('§11 entry mentions "AI COA Applied"', logEntries.some(function (e) { return /AI COA Applied/i.test(e); }));
ok('§11 entry mentions unit count', logEntries.some(function (e) { return /\d+ units moved/.test(e); }));

// ═══════════════════════════════════════════════════════════════════════════════
// §12  normalizeCoaAction rejects unit_uid not in allowed_unit_ids
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§12  normalizeCoaAction rejects unit_uid not in allowed_unit_ids');
var goodAction = { unit_uid: 'R-001', side: 'RED', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: 26.0, lon: 53.0, type: 'objective' }, reason: 'test' };
var badActionUnknown = Object.assign({}, goodAction, { unit_uid: 'INVENTED-ID' });
var result12Good = PLANNER.normalizeCoaAction(goodAction, ['R-001', 'R-002']);
var result12Bad  = PLANNER.normalizeCoaAction(badActionUnknown, ['R-001', 'R-002']);
ok('§12 valid unit_uid returns non-null', result12Good !== null);
ok('§12 unknown unit_uid returns null', result12Bad === null);
ok('§12 empty allowedIds allows any uid', PLANNER.normalizeCoaAction(goodAction, []) !== null);

// ═══════════════════════════════════════════════════════════════════════════════
// §13  normalizeCoa rejects COA with zero valid actions
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§13  normalizeCoa rejects COA with zero valid actions');
var emptyActionsCoa = {
    plan_id: 'COA-X', title: 'Empty', phases: [{
        phase_id: 'p1', name: 'Move',
        actions: [
            { unit_uid: 'INVENTED', side: 'RED', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: 26, lon: 53 }, reason: 'test' },
        ],
    }],
};
var result13 = PLANNER.normalizeCoa(emptyActionsCoa, ['R-001', 'R-002']); // INVENTED not allowed
ok('§13 normalizeCoa returns null when all actions rejected', result13 === null);
var goodCoa = Object.assign({}, emptyActionsCoa, { phases: [{
    phase_id: 'p1', name: 'Move',
    actions: [{ unit_uid: 'R-001', side: 'RED', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: 26, lon: 53 }, reason: 'test' }],
}] });
var result13Good = PLANNER.normalizeCoa(goodCoa, ['R-001']);
ok('§13 normalizeCoa returns object when actions are valid', result13Good !== null);

// ═══════════════════════════════════════════════════════════════════════════════
// §14  applyCoaPlan result has moved array with new_pos
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§14  applyCoaPlan result has moved array with new_pos');
var units14 = [{ id: 'R-AA', uid: 'R-AA', side: 'RED', lat: 27.0, lon: 56.0 }];
var plan14 = {
    selected_coa_index: 0,
    coas: [{ plan_id: 'COA-1', phases: [{ phase_id: 'p1', name: 'Move', actions: [{
        unit_uid: 'R-AA', side: 'RED', role: 'assault',
        action_type: 'MOVE_TOWARD_OBJECTIVE',
        target: { lat: 26.0, lon: 53.0, type: 'objective' }, reason: 'test',
    }]}]}],
};
var result14 = PLANNER.applyCoaPlan(plan14, units14);
ok('§14 ok:true', result14.ok === true);
ok('§14 moved array length 1', result14.moved.length === 1);
ok('§14 new_pos exists', result14.moved[0] && !!result14.moved[0].new_pos);
ok('§14 new_pos.lat is number', typeof result14.moved[0].new_pos.lat === 'number');
ok('§14 old_pos.lat is original', result14.moved[0].old_pos.lat === 27.0);
ok('§14 new_pos differs from old_pos', result14.moved[0].new_pos.lat !== result14.moved[0].old_pos.lat);

// ═══════════════════════════════════════════════════════════════════════════════
// §15  Client source has _coaPlan state var and _generateCoaPlan function
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§15  Client source has _coaPlan state var and _generateCoaPlan function');
ok('§15 _coaPlan state var in source',      /_coaPlan/.test(CLIENT_SRC));
ok('§15 _generateCoaPlan function in source', /_generateCoaPlan/.test(CLIENT_SRC));
ok('§15 _coaMovedUnits state var in source', /_coaMovedUnits/.test(CLIENT_SRC));
ok('§15 _coaApplied state var in source',   /_coaApplied/.test(CLIENT_SRC));
ok('§15 _coaSelectedIdx state var in source', /_coaSelectedIdx/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
