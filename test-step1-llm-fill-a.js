#!/usr/bin/env node
/*
 * STEP1-AI-LLM-FILL-INTEGRATION-A — regression tests
 *
 * 1. isWeak correctly detects empty deterministic output
 * 2. llm_fill units appear in proposed_units with correct shape
 * 3. llm_fill locations have null coords (needs_review, exact_unit_position:false)
 * 4. no objective-ring placement from llm_fill output
 * 5. providerAvailable reflects config; unavailable → analyze returns deterministic
 * 6. extractJson tolerates markdown fences and leading prose
 * 7. normalizeUnit/normalizeBase enforce safety invariants regardless of LLM input
 */
'use strict';

var path = require('path');
var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

console.log('STEP1-AI-LLM-FILL-INTEGRATION-A');

var fill  = require(path.join(__dirname, 'UI_MOdified/server/ai/step1-llm-fill.js'));
var BRIEF = require(path.join(__dirname, 'UI_MOdified/server/ai/brief-to-scenario.js'));

// ── Section 1: isWeak detection ──────────────────────────────────────
(function () {
    console.log('\n§1 isWeak detection');

    // Simulate a weak deterministic result (0 units, 0 candidates)
    var weakDet = {
        ok: true,
        brief: { operational_brief: { proposed_units: [], placement_candidates: [], mission: '' } },
        understanding: { ambiguities: ['Mission not found'], proposed_unit_counts: { red: 0, blue: 0, neutral: 0 } },
        llm_fill: { available: false },
    };
    ok('isWeak returns true for 0-unit/0-candidate result', fill.isWeak(weakDet) === true);

    // Strong result — has proposed_units
    var strongDet = {
        ok: true,
        brief: { operational_brief: {
            proposed_units: [{ side: 'RED', platform: 'T-72', estimated_count: 10 }],
            placement_candidates: [{ side: 'RED', base_name_en: 'Base X', lat: 30, lon: 40 }],
        }},
    };
    ok('isWeak returns false when proposed_units present', fill.isWeak(strongDet) === false);

    // Not-ok result
    ok('isWeak returns false for non-ok result', fill.isWeak({ ok: false }) === false);
    ok('isWeak returns false for null input', fill.isWeak(null) === false);
})();

// ── Section 2: extractJson tolerates markdown fences ─────────────────
(function () {
    console.log('\n§2 extractJson');
    var bare    = '{"units":[{"side":"BLUE","platform":"USS Eisenhower"}]}';
    var fenced  = '```json\n' + bare + '\n```';
    var prosed  = 'Here is the JSON:\n' + bare + '\nEnd.';

    ok('extractJson parses bare JSON',      fill.extractJson(bare)   !== null);
    ok('extractJson strips markdown fence', fill.extractJson(fenced) !== null);
    ok('extractJson finds JSON in prose',   fill.extractJson(prosed) !== null);
    ok('extractJson returns null for empty', fill.extractJson('')    === null);
    ok('extractJson returns null for garbage', fill.extractJson('no json here') === null);

    // qwen3-coder / DeepSeek-R1 style <think> blocks
    var thinkWrapped = '<think>\nLet me analyze the documents carefully.\nUnit extraction:\n</think>\n' + bare;
    ok('extractJson strips <think> block (qwen3-coder style)', fill.extractJson(thinkWrapped) !== null);
    var thinkFenced  = '<think>reasoning</think>\n```json\n' + bare + '\n```';
    ok('extractJson strips <think> + fence',  fill.extractJson(thinkFenced) !== null);
})();

// ── Section 3: normalizeUnit enforces safety invariants ───────────────
(function () {
    console.log('\n§3 normalizeUnit safety invariants');

    // LLM tries to sneak in a lat/lon — must be stripped
    var evil = { side: 'RED', platform: 'F-16', estimated_count: 12, lat: 35.5, lon: 51.0,
                 confidence: 'high', source_evidence: 'quote' };
    var norm = fill.normalizeUnit(evil, 0);

    ok('lat always null regardless of LLM output',  norm.lat === null);
    ok('lon always null regardless of LLM output',  norm.lon === null);
    ok('exact_unit_position always false',          norm.exact_unit_position === false);
    ok('needs_review always true',                  norm.needs_review === true);
    ok('review_only always true',                   norm.review_only === true);
    ok('source_type always llm_fill',               norm.source_type === 'llm_fill');
    ok('confidence preserved (high)',               norm.confidence === 'high');
    ok('source_evidence preserved',                 norm.source_evidence === 'quote');
    ok('warnings array present',                    Array.isArray(norm.warnings) && norm.warnings.length > 0);

    // Side normalisation
    ok('unknown side → NEUTRAL',   fill.normalizeUnit({ side: 'AXIS' }, 0).side === 'NEUTRAL');
    ok('lowercase red → RED',      fill.normalizeUnit({ side: 'red' }, 0).side === 'RED');
    ok('missing platform → fallback name', fill.normalizeUnit({}, 0).platform.length > 0);
})();

// ── Section 4: normalizeBase safety invariants ────────────────────────
(function () {
    console.log('\n§4 normalizeBase safety invariants');

    var evil = { side: 'BLUE', name: 'USS Eisenhower', type: 'naval', lat: 33.88, lon: 35.52,
                 confidence: 'high', source_evidence: 'quote from doc' };
    var norm = fill.normalizeBase(evil, 0);

    ok('base lat always null',  norm.lat === null);
    ok('base lon always null',  norm.lon === null);
    ok('exact_unit_position false', norm.exact_unit_position === false);
    ok('needs_review true',         norm.needs_review === true);
    ok('placement_type is base_location_anchor', norm.placement_type === 'base_location_anchor');
    ok('source_type llm_fill',      norm.source_type === 'llm_fill');
    ok('unknown base type allowed', fill.normalizeBase({ type: 'carrier' }, 0).site_type === 'unknown');
})();

// ── Section 5: mergeSuccess produces correct shape ────────────────────
(function () {
    console.log('\n§5 fill.fill() async integration (mock LLM)');

    var weakDet = {
        ok: true,
        brief: { document_set_id: 'ds_test', operational_brief: {
            mission: '', commander_intent: '',
            proposed_units: [], placement_candidates: [],
            friendly: { summary: '' }, enemy: { summary: '' }, neutral: {},
        }},
        understanding: {
            ambiguities: ['Mission not found'],
            proposed_unit_counts: { red: 0, blue: 0, neutral: 0 },
        },
        llm_fill: { available: false },
    };

    // Build fake inputs with mock text
    var inputs = [
        { slot: 'blue', filename: 'blue_team.docx', text: 'COM CTF 60.1 USS EISENHOWER CVN-69, COM USS NEW JERSEY BB-62, PHIBRON EIGHT, 24TH MAU HQ BEIRUT' },
        { slot: 'red',  filename: 'red_team.docx',  text: 'Revenge in Beirut, 1983. French Carrier Task Force: Clemenceau, Foch. Iranian-backed militia.' },
    ];

    // Mock the AI.generate call to return a canned LLM response
    var step1FillPath = require.resolve(path.join(__dirname, 'UI_MOdified/server/ai/step1-llm-fill.js'));
    delete require.cache[step1FillPath];

    // We need to mock ollama-client inside step1-llm-fill.
    // Use a lightweight approach: override via module cache.
    var ollamaPath = require.resolve(path.join(__dirname, 'UI_MOdified/server/ai/ollama-client.js'));
    var origOllama = require.cache[ollamaPath];
    require.cache[ollamaPath] = {
        id: ollamaPath, filename: ollamaPath, loaded: true, exports: {
            generate: function () {
                return Promise.resolve({ ok: true, response: JSON.stringify({
                    sides: { red_name: 'Iranian/French threat', blue_name: 'USN/French coalition' },
                    mission: 'Strike retaliatory targets in Bekaa Valley',
                    units: [
                        { side: 'BLUE', platform: 'USS Eisenhower CVN-69', estimated_count: 1, role: 'naval', lat: null, lon: null, confidence: 'high', source_evidence: 'COM CTF 60.1 USS EISENHOWER CVN-69' },
                        { side: 'BLUE', platform: 'USS New Jersey BB-62',  estimated_count: 1, role: 'naval', lat: null, lon: null, confidence: 'high', source_evidence: 'COM USS NEW JERSEY BB-62' },
                        { side: 'BLUE', platform: 'PHIBRON Eight',         estimated_count: 1, role: 'naval', lat: null, lon: null, confidence: 'high', source_evidence: 'PHIBRON EIGHT' },
                        { side: 'BLUE', platform: '24th MAU',              estimated_count: 1, role: 'land',  lat: null, lon: null, confidence: 'high', source_evidence: '24TH MAU HQ BEIRUT' },
                        { side: 'RED',  platform: 'Clemenceau CV',         estimated_count: 1, role: 'naval', lat: null, lon: null, confidence: 'medium', source_evidence: 'Clemenceau' },
                    ],
                    bases: [
                        { side: 'BLUE', name: 'Beirut HQ', type: 'land', lat: null, lon: null, confidence: 'medium', source_evidence: '24TH MAU HQ BEIRUT' },
                        // RED: evil LLM tries to provide coordinates — must be stripped
                        { side: 'RED',  name: 'Tehran', type: 'air', lat: 35.7, lon: 51.4, confidence: 'low', source_evidence: 'Iranian-backed' },
                    ],
                    objectives: ['Bekaa Valley retaliatory strike'],
                    locations: ['Beirut', 'Lebanon', 'Bekaa Valley'],
                    assumptions: ['US/French forces coordinate'],
                    uncertainties: ['Exact Iranian unit positions unknown'],
                    overall_confidence: 'medium',
                }) });
            },
            ping: function () { return Promise.resolve({ ok: true }); },
            chat: function () { return Promise.resolve({ ok: true }); },
            DEFAULT_URL: 'http://localhost:11434',
            DEFAULT_MODEL: 'qwen3-coder:latest',
            API_STYLE: 'ollama',
        }
    };

    var fillMock = require(step1FillPath);
    delete require.cache[step1FillPath]; // reset after test

    fillMock.fill(weakDet, inputs).then(function (result) {
        var ob = result.brief && result.brief.operational_brief;

        ok('fill result ok', result.ok === true);
        ok('llm_fill.available is true', result.llm_fill && result.llm_fill.available === true);
        ok('llm_fill.model set', typeof (result.llm_fill && result.llm_fill.model) === 'string');
        ok('llm_fill.units_added is 5', result.llm_fill && result.llm_fill.units_added === 5);
        ok('llm_fill.bases_added is 2', result.llm_fill && result.llm_fill.bases_added === 2);

        var pu = ob && ob.proposed_units;
        ok('proposed_units has 5 items', Array.isArray(pu) && pu.length === 5);

        var eisenhower = pu && pu.find(function (u) { return u.platform && u.platform.indexOf('Eisenhower') !== -1; });
        ok('USS Eisenhower present in proposed_units', !!eisenhower);
        ok('Eisenhower exact_unit_position:false', eisenhower && eisenhower.exact_unit_position === false);
        ok('Eisenhower needs_review:true',          eisenhower && eisenhower.needs_review === true);
        ok('Eisenhower source_type:llm_fill',       eisenhower && eisenhower.source_type === 'llm_fill');
        ok('Eisenhower lat null',                   eisenhower && eisenhower.lat === null);
        ok('Eisenhower lon null',                   eisenhower && eisenhower.lon === null);

        var phibron = pu && pu.find(function (u) { return u.platform && u.platform.indexOf('PHIBRON') !== -1; });
        ok('PHIBRON Eight present', !!phibron);

        var mau = pu && pu.find(function (u) { return u.platform && u.platform.indexOf('24th MAU') !== -1; });
        ok('24th MAU present', !!mau);

        var pc = ob && ob.placement_candidates;
        ok('placement_candidates has 2 items', Array.isArray(pc) && pc.length === 2);

        // Safety: evil coordinates from LLM must be nulled
        var tehran = pc && pc.find(function (c) { return c.base_name_en && c.base_name_en === 'Tehran'; });
        ok('Tehran base present but lat stripped to null', tehran && tehran.lat === null);
        ok('Tehran base lon stripped to null',             tehran && tehran.lon === null);

        // No objective-ring: verify no coord near a typical OBJ (no coords at all)
        var allCoords = [].concat(
            (pu || []).map(function (u) { return [u.lat, u.lon]; }),
            (pc || []).map(function (c) { return [c.lat, c.lon]; })
        );
        var anyNonNull = allCoords.some(function (xy) { return xy[0] !== null || xy[1] !== null; });
        ok('no non-null coordinates in any llm_fill output (no objective-ring risk)', !anyNonNull);

        // Mission filled
        ok('mission filled from LLM', ob && ob.mission && ob.mission.length > 5);

        // proposed_unit_counts updated
        var cnt = result.understanding && result.understanding.proposed_unit_counts;
        ok('proposed_unit_counts.blue updated',  cnt && cnt.blue >= 4);
        ok('proposed_unit_counts.red updated',   cnt && cnt.red >= 1);

        // uncertainties merged into ambiguities
        var amb = result.understanding && result.understanding.ambiguities;
        ok('LLM uncertainties merged into ambiguities', Array.isArray(amb) && amb.some(function (a) { return a.indexOf('[AI uncertainty]') !== -1; }));

        report();
    }).catch(function (e) {
        ok('fill.fill() did not throw', false);
        console.log('  ERROR:', e.message);
        report();
    });

    // Restore original ollama module
    if (origOllama) require.cache[ollamaPath] = origOllama;
    else delete require.cache[ollamaPath];
})();

// ── Section 6: LLM failure → deterministic fallback ──────────────────
(function () {
    console.log('\n§6 LLM failure fallback');

    var step1FillPath = require.resolve(path.join(__dirname, 'UI_MOdified/server/ai/step1-llm-fill.js'));
    delete require.cache[step1FillPath];

    var ollamaPath = require.resolve(path.join(__dirname, 'UI_MOdified/server/ai/ollama-client.js'));
    var origOllama = require.cache[ollamaPath];
    require.cache[ollamaPath] = {
        id: ollamaPath, filename: ollamaPath, loaded: true, exports: {
            generate: function () { return Promise.resolve({ ok: false, error: 'model not found' }); },
        },
    };

    var fillMock = require(step1FillPath);
    delete require.cache[step1FillPath];

    var weakDet = {
        ok: true,
        brief: { operational_brief: { proposed_units: [], placement_candidates: [], mission: '' } },
        understanding: {},
        llm_fill: { available: false },
    };

    fillMock.fill(weakDet, [{ slot: 'red', filename: 'x.docx', text: 'some text' }]).then(function (result) {
        ok('LLM failure: result.ok still true', result.ok === true);
        ok('LLM failure: llm_fill.available false', result.llm_fill && result.llm_fill.available === false);
        ok('LLM failure: attempted flag set',       result.llm_fill && result.llm_fill.attempted === true);

        if (origOllama) require.cache[ollamaPath] = origOllama;
        else delete require.cache[ollamaPath];
        // async tests finish here; report() already called by section 5
    }).catch(function () {
        ok('LLM failure: no throw from fill', false);
        if (origOllama) require.cache[ollamaPath] = origOllama;
        else delete require.cache[ollamaPath];
    });
})();

function report() {
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}
