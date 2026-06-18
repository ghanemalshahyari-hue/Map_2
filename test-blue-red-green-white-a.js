/**
 * test-blue-red-green-white-a.js — RMOOZ-BLUE-RED-GREEN-WHITE-A
 *
 * GREEN = a deterministic neutral-world layer (civilians/infra/collateral/host-nation), NO LLM, NO
 * mutation. The summarizer is an OPTIONAL small-model role that is OFF by default and never plans.
 *
 * Acceptance:
 *  1 green-world: high-density urban + forces near objective → high collateral/population; deterministic + llm_used:false
 *  2 green-world: open/desert + dispersed forces → low; roads open; no-terrain → roads unknown
 *  3 green-world: host_nation surfaced; neutral_reaction_score bounded 0..100; identical input → identical output
 *  4 summarizer OFF by default → deterministic note, llm_called:false, the LLM is NEVER invoked
 *  5 summarizer ON (RMOOZ_LLM_SUMMARIZER=1 + RMOOZ_ALLOW_SIM_RUN=1) → calls the (injected) model, source:'llm'
 *  6 summarizer ON but model errors → deterministic fallback (still ok)
 *  7 'summarizer' task model resolves RMOOZ_LLM_MODEL_SUMMARIZER (small model)
 *  8 launcher defaults RMOOZ_LLM_MODEL=qwen3-coder:latest (one main planner, Ready out-of-box)
 */
'use strict';
var assert = require('assert');
var path = require('path');
var fs = require('fs');
var AI = path.join(__dirname, 'UI_MOdified', 'server', 'ai');
var GREEN = require(path.join(AI, 'green-world.js'));
var SUMM = require(path.join(AI, 'green-summarizer.js'));
var LLM_CFG = require(path.join(AI, 'llm-runtime-config.js'));

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

function mkUnits(n, side, lat, lon, spread) { var u = []; for (var i = 0; i < n; i++) u.push({ id: side[0] + '-' + (i + 1), side: side, lat: lat + i * spread, lon: lon + i * spread }); return u; }
var OBJ = { lat: 24.45, lon: 54.40 };

(async function () {
    // 1 — urban + forces near objective → high.
    try {
        var a = GREEN.assessNeutralWorld({
            units: mkUnits(6, 'RED', 24.451, 54.401, 0.001).concat(mkUnits(4, 'BLUE', 24.452, 54.402, 0.001)),
            objective: OBJ,
            terrain: { terrain_class: 'urban', route_cost: 0.42, choke: { lat: 24.46, lon: 54.41 }, owner_country: 'Atropia' },
        });
        assert(a.population_band === 'high', 'urban → high population, got ' + a.population_band);
        assert(a.collateral_risk.band === 'high' || a.collateral_risk.score >= 60, 'high collateral, got ' + a.collateral_risk.score);
        assert(a.units_near_objective > 0, 'forces near objective counted');
        assert(a.road_status.status === 'constrained', 'choke/high route_cost → constrained roads');
        assert(a.deterministic === true && a.llm_used === false && a.provenance.engine === 'deterministic', 'deterministic, no LLM');
        ok('green-world: urban + forces near objective → high collateral/population, no LLM');
    } catch (e) { bad('green-world high', e); }

    // 2 — open/desert + dispersed → low; no-terrain → roads unknown.
    try {
        var lo = GREEN.assessNeutralWorld({
            units: mkUnits(5, 'RED', 20.0, 50.0, 0.5), objective: OBJ,
            terrain: { terrain_class: 'desert', route_cost: 0.1 },
        });
        assert(lo.population_band === 'low', 'desert → low population');
        assert(lo.collateral_risk.band === 'low', 'low collateral');
        assert(lo.road_status.status === 'open', 'low route_cost → open roads');
        var noT = GREEN.assessNeutralWorld({ units: mkUnits(3, 'RED', 24.45, 54.40, 0.01), objective: OBJ });
        assert(noT.road_status.status === 'unknown' && noT.provenance.roads === 'absent', 'no terrain → roads unknown/absent');
        ok('green-world: open/desert → low; no-terrain → roads unknown');
    } catch (e) { bad('green-world low/unknown', e); }

    // 3 — host nation + bounded score + determinism.
    try {
        var inp = { units: mkUnits(8, 'RED', 24.451, 54.401, 0.001), objective: OBJ, terrain: { terrain_class: 'urban', owner_country: 'Donovia', route_cost: 0.5 } };
        var x = GREEN.assessNeutralWorld(inp), y = GREEN.assessNeutralWorld(inp);
        assert(x.host_nation === 'Donovia', 'host_nation surfaced');
        assert(x.neutral_reaction_score >= 0 && x.neutral_reaction_score <= 100, 'reaction score bounded');
        assert(JSON.stringify(x) === JSON.stringify(y), 'identical input → identical output (deterministic)');
        ok('green-world: host_nation + bounded reaction score + deterministic output');
    } catch (e) { bad('green-world determinism', e); }

    var assessment = { notes: ['Collateral risk high (78/100).', 'Movement: roads constrained.'] };

    // 4 — summarizer OFF by default → deterministic, LLM never called.
    try {
        delete process.env.RMOOZ_LLM_SUMMARIZER; delete process.env.RMOOZ_ALLOW_SIM_RUN;
        var called = 0; var gen = function () { called++; return Promise.resolve({ ok: true, response: 'LLM note' }); };
        var r = await SUMM.summarize(assessment, { _generate: gen, kind: 'civilian reaction' });
        assert(r.source === 'deterministic' && r.llm_called === false, 'OFF → deterministic, llm_called false');
        assert(called === 0, 'the LLM is NEVER invoked when disabled');
        assert(/Collateral risk high/.test(r.note), 'deterministic note from struct.notes');
        ok('summarizer OFF by default → deterministic note, LLM never invoked');
    } catch (e) { bad('summarizer off', e); }

    // 5 — summarizer ON → calls the (injected) model.
    try {
        process.env.RMOOZ_LLM_SUMMARIZER = '1'; process.env.RMOOZ_ALLOW_SIM_RUN = '1';
        var called = 0; var gen = function (a) { called++; assert(/at most two short sentences/i.test(a.prompt), 'short-note prompt'); assert(a.options && a.options.num_predict <= 300, 'small output cap'); return Promise.resolve({ ok: true, response: 'Civilians clustered near the objective; collateral risk is high.' }); };
        var r = await SUMM.summarize(assessment, { _generate: gen });
        assert(called === 1 && r.source === 'llm' && r.llm_called === true, 'ON → LLM path used');
        assert(/Civilians clustered/.test(r.note), 'note comes from the model');
        ok('summarizer ON (both gates) → small-model note, never planning');
    } catch (e) { bad('summarizer on', e); }

    // 6 — summarizer ON but model errors → deterministic fallback.
    try {
        process.env.RMOOZ_LLM_SUMMARIZER = '1'; process.env.RMOOZ_ALLOW_SIM_RUN = '1';
        var gen = function () { return Promise.reject(new Error('model down')); };
        var r = await SUMM.summarize(assessment, { _generate: gen });
        assert(r.ok === true && r.source === 'deterministic', 'model error → deterministic fallback');
        ok('summarizer ON but model error → deterministic fallback (offline-safe)');
    } catch (e) { bad('summarizer fallback', e); }

    // 7 — 'summarizer' task resolves the small-model override.
    try {
        process.env.RMOOZ_LLM_MODEL_SUMMARIZER = 'llama3.2:3b';
        assert(LLM_CFG.getModel('summarizer') === 'llama3.2:3b', 'RMOOZ_LLM_MODEL_SUMMARIZER honored');
        delete process.env.RMOOZ_LLM_MODEL_SUMMARIZER;
        ok("'summarizer' task model resolves RMOOZ_LLM_MODEL_SUMMARIZER");
    } catch (e) { bad('summarizer task model', e); }

    // 8 — launcher defaults the main planner model.
    try {
        var launcher = fs.readFileSync(path.join(__dirname, 'UI_MOdified', 'scripts', 'run-rmooz-app.js'), 'utf8');
        assert(/setDefault\('RMOOZ_LLM_MODEL',\s*'qwen3-coder:latest'\)/.test(launcher), 'launcher defaults RMOOZ_LLM_MODEL=qwen3-coder:latest');
        ok('launcher defaults RMOOZ_LLM_MODEL=qwen3-coder:latest (one main planner, Ready out-of-box)');
    } catch (e) { bad('launcher default model', e); }

    // cleanup env
    delete process.env.RMOOZ_LLM_SUMMARIZER; delete process.env.RMOOZ_ALLOW_SIM_RUN;
    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-blue-red-green-white-a.js)');
    process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
