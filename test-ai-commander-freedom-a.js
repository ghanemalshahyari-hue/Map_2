/**
 * test-ai-commander-freedom-a.js — RMOOZ-AI-COMMANDER-FREEDOM-A
 *
 * The 9 spec acceptance tests, at the planner + validator level:
 *  1 same scenario → different COA families across runs (variation enabled)
 *  2 recon → recon behavior (standoff), not attack
 *  3 delay → delay behavior (shaping)
 *  4 flank → different route/axis than direct attack
 *  5 withdraw → moves away from threat
 *  6 validator accepts valid non-attack COAs
 *  7 validator rejects only invalid structure/physics
 *  8 terrain/country context present in the AI prompt/payload
 *  9 COA output carries the AI tactical reasoning the event log surfaces
 */
'use strict';
var assert = require('assert');
var path = require('path');
var P = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));
var TC = require(path.join(__dirname, 'UI_MOdified/server/ai/rmooz-ai-tool-contract.js'));

var pass = 0;
function ok(n, fn) { fn(); pass++; console.log('  ✓ ' + n); }
function dist(a, b) { return Math.hypot(a.lon - b.lon, a.lat - b.lat); }

var UNITS = [
    { uid: 'B-1', side: 'BLUE', role: 'fighter', lat: 24.30, lon: 54.30, coord: [54.30, 24.30] },
    { uid: 'B-2', side: 'BLUE', role: 'armor', lat: 24.34, lon: 54.40, coord: [54.40, 24.34] },
    { uid: 'B-3', side: 'BLUE', role: 'infantry', lat: 24.38, lon: 54.44, coord: [54.44, 24.38] },
    { uid: 'R-1', side: 'RED', role: 'armor', lat: 24.50, lon: 54.58, coord: [54.58, 24.50] },
];
var OBJ = [{ lat: 24.50, lon: 54.30, name: 'Abu Dhabi' }];
function plan(mode, seed, extraCtx) {
    return P.planCoas(UNITS, OBJ, Object.assign({ active_side: 'BLUE', commander_mode: mode, variation_seed: seed }, extraCtx || {}),
        { preferSide: 'BLUE', useLlm: false, commander_mode: mode });
}
function recFamily(p) { var c = p.coas.find(function (x) { return x.recommended; }); return c && c.coa_family; }
function coaByFamily(p, fam) { return p.coas.find(function (c) { return c.coa_family === fam; }); }
function leadActions(coa, type) { return coa.phases[0].actions.filter(function (a) { return a.action_type === type; }); }
function unitPos(uid) { var u = UNITS.find(function (x) { return x.uid === uid; }); return { lat: u.lat, lon: u.lon }; }

(async function () {
    console.log('\nRMOOZ-AI-COMMANDER-FREEDOM-A — AI commander freedom\n');

    // ── §1 variation across runs ──────────────────────────────────────
    console.log('§1 COA-family variation across runs (spec test 1)');
    var hv = [];
    for (var s = 0; s < 3; s++) hv.push(recFamily(await plan('high_variation', s)));
    ok('high_variation rotates the recommended family across seeds', function () {
        var uniq = hv.filter(function (v, i) { return hv.indexOf(v) === i; });
        assert.ok(uniq.length >= 2, 'expected ≥2 distinct families across seeds, got ' + JSON.stringify(hv));
    });

    var freeP = await plan('free', 1);
    ok('free mode always offers all 3 archetypes', function () {
        var fams = freeP.coas.map(function (c) { return c.coa_family; });
        ['cautious_recon', 'maneuver_deception', 'direct_action'].forEach(function (f) {
            assert.ok(fams.indexOf(f) >= 0, 'missing archetype ' + f);
        });
    });

    // ── §2 recon behavior ─────────────────────────────────────────────
    console.log('§2 recon behaves like recon, not attack (spec test 2)');
    ok('cautious COA uses recon and stands off the objective/threat', function () {
        var c = coaByFamily(freeP, 'cautious_recon');
        var recons = leadActions(c, 'recon');
        assert.ok(recons.length >= 1, 'no recon actions in cautious COA');
        // recon target must not be the same as a direct attack on the objective
        var direct = coaByFamily(freeP, 'direct_action').phases[0].actions[0];
        assert.ok(dist(recons[0].target, direct.target) > 0.001, 'recon == attack target');
        assert.ok(dist(recons[0].target, { lat: OBJ[0].lat, lon: OBJ[0].lon }) > 0.03, 'recon drove onto the objective');
    });

    // ── §3 delay behavior ─────────────────────────────────────────────
    console.log('§3 delay shapes (spec test 3)');
    ok('maneuver COA contains a shaping/delay or flank action distinct from attack', function () {
        var c = coaByFamily(freeP, 'maneuver_deception');
        var acts = c.phases[0].actions.map(function (a) { return a.action_type; });
        assert.ok(acts.indexOf('flank') >= 0 || acts.indexOf('delay') >= 0 || acts.indexOf('deceive') >= 0,
            'maneuver COA has no maneuver action: ' + acts.join(','));
    });

    // ── §4 flank: different axis ───────────────────────────────────────
    console.log('§4 flank uses a different axis (spec test 5)');
    ok('flank action target diverges from the direct attack axis', function () {
        var c = coaByFamily(freeP, 'maneuver_deception');
        var flank = c.phases[0].actions.find(function (a) { return a.action_type === 'flank'; });
        assert.ok(flank, 'no flank action');
        var direct = coaByFamily(freeP, 'direct_action').phases[0].actions.find(function (a) { return a.unit_uid === flank.unit_uid; });
        if (direct) assert.ok(dist(flank.target, direct.target) > 0.01, 'flank target equals direct attack target for the same unit');
    });

    // ── §5 withdraw: away from threat ──────────────────────────────────
    console.log('§5 withdraw moves away (spec test 6)');
    ok('a withdraw action increases distance from the RED threat', function () {
        // build a withdraw-heavy plan by asking the library directly through the planner's
        // diverse builder (cautious archetype includes avoid_contact; use the library for withdraw)
        var LIB = require(path.join(__dirname, 'UI_MOdified/server/ai/tactical-action-library.js'));
        var enemy = { lat: 24.50, lon: 54.58 };
        var g = LIB.computeActionGeometry('withdraw', unitPos('B-3'), { nearestEnemy: enemy, objective: { lat: OBJ[0].lat, lon: OBJ[0].lon } });
        assert.ok(dist(g.target, enemy) > dist(unitPos('B-3'), enemy), 'withdraw did not increase distance');
    });

    // ── §6 validator accepts valid non-attack COAs ─────────────────────
    console.log('§6 validator accepts valid non-attack COAs (spec test 6)');
    ok('a recon/flank/withdraw COA validates as accepted (structure/physics ok)', function () {
        var decision = {
            selected_coa_family: 'cautious_recon',
            unit_assignments: [
                { unit_uid: 'B-1', action_type: 'recon', target: { lat: 24.34, lon: 54.33 } },
                { unit_uid: 'B-2', action_type: 'flank', target: { lat: 24.36, lon: 54.42 } },
                { unit_uid: 'B-3', action_type: 'withdraw', target: { lat: 24.36, lon: 54.46 } },
            ],
        };
        var v = TC.validateCommanderCoaTool({ decision: decision, units: UNITS, objectives: OBJ, allowed_unit_ids: ['B-1', 'B-2', 'B-3'] }).data;
        assert.strictEqual(v.accepted, true, 'non-attack COA rejected: ' + JSON.stringify(v.violations));
        assert.strictEqual(v.checks, 'structure_physics_only');
    });

    // ── §7 validator rejects only structure/physics ───────────────────
    console.log('§7 validator rejects only invalid structure/physics (spec test 7)');
    ok('teleport + invented id + kill are rejected; tactical creativity is not', function () {
        var teleport = TC.validateCommanderCoaTool({ decision: { selected_coa_family: 'x', unit_assignments: [{ unit_uid: 'B-1', action_type: 'flank', target: { lat: 27.0, lon: 57.0 } }] }, units: UNITS, allowed_unit_ids: ['B-1'] }).data;
        assert.strictEqual(teleport.accepted, false);
        assert.ok(teleport.violations.some(function (x) { return x.code === 'teleport_guard'; }));
        var ghost = TC.validateCommanderCoaTool({ decision: { selected_coa_family: 'x', unit_assignments: [{ unit_uid: 'GHOST', action_type: 'recon' }] }, units: UNITS, allowed_unit_ids: ['B-1'] }).data;
        assert.ok(ghost.violations.some(function (x) { return x.code === 'invented_unit_id'; }));
        var kill = TC.validateCommanderCoaTool({ decision: { selected_coa_family: 'x', unit_assignments: [{ unit_uid: 'B-1', action_type: 'destroy' }] }, units: UNITS, allowed_unit_ids: ['B-1'] }).data;
        assert.ok(kill.violations.some(function (x) { return x.code === 'kill_action_blocked'; }));
        // creativity NOT rejected:
        ['recon', 'delay', 'deceive', 'flank', 'withdraw', 'screen', 'probe', 'observe'].forEach(function (act) {
            var v = TC.validateCommanderCoaTool({ decision: { selected_coa_family: 'free', unit_assignments: [{ unit_uid: 'B-1', action_type: act, target: { lat: 24.33, lon: 54.31 } }] }, units: UNITS, allowed_unit_ids: ['B-1'] }).data;
            assert.strictEqual(v.accepted, true, act + ' was wrongly rejected');
        });
    });

    // ── §8 terrain/country context present in the AI prompt/payload ────
    console.log('§8 terrain/country context in the AI prompt (spec test 8)');
    await (async function () {
        var captured = null;
        var fakeProvider = { generate: function (req) { captured = req; return Promise.resolve({ ok: false, error: 'capture-only' }); } };
        var fakeIntel = { terrain: { summary: 'coastal/urban' }, zone_state: { owner_country: 'UAE', zone_type: 'sovereign' }, contact_picture: { nearest_threats: [] }, roe_state: 'warn', alert_state: 'WARNING' };
        await P._callLlmForTest(UNITS.filter(function (u) { return u.side === 'BLUE'; }), OBJ,
            { active_side: 'BLUE', commander_mode: 'free', _intel: fakeIntel, previous_coa_families: ['direct_action'] },
            { allowed_unit_ids: ['B-1', 'B-2', 'B-3'] }, fakeProvider);
        assert.ok(captured, 'provider was not called');
        ok('prompt carries terrain + sovereign zone + the 16 tactical actions + freedom instruction', function () {
            assert.ok(/terrain_zone_context/.test(captured.prompt), 'no terrain_zone_context in prompt');
            assert.ok(/UAE|sovereign|coastal/.test(captured.prompt), 'no country/terrain detail in prompt');
            assert.ok(/allowed_tactical_actions/.test(captured.prompt) && /recon/.test(captured.prompt) && /deceive/.test(captured.prompt), 'no tactical action vocabulary in prompt');
            assert.ok(/free-thinking|freely choose|different/i.test(captured.system), 'system prompt lacks freedom instruction');
            assert.ok(captured.options && captured.options.temperature >= 0.4, 'free mode should raise temperature, got ' + (captured.options && captured.options.temperature));
        });
    })();

    // ── §9 COA carries reasoning the event log surfaces ────────────────
    console.log('§9 COA actions carry tactical reasoning (spec test 9)');
    ok('each action exposes behavior + deciding_factor for the event log', function () {
        var c = coaByFamily(freeP, 'cautious_recon');
        var a = c.phases[0].actions[0];
        assert.ok(a.behavior && a.behavior.length > 0, 'no behavior text');
        assert.ok(a.deciding_factor && a.deciding_factor.length > 0, 'no deciding_factor');
        assert.ok(a.reason && a.reason.length > 0, 'no reason');
    });

    console.log('\n✅ ' + pass + ' assertions passed (test-ai-commander-freedom-a.js)\n');
})().catch(function (e) { console.error('\n✗ FAILED:', e && e.message, '\n', e && e.stack); process.exit(1); });
