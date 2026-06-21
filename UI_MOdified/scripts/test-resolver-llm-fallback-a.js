'use strict';
/* test-resolver-llm-fallback-a.js — RMOOZ-RESOLVER-LLM-FALLBACK-A
 * Rung order + guardrails for the location resolver (fuzzy / MGRS / LLM fallback).
 * The LLM provider is MOCKED (no network). Run: node scripts/test-resolver-llm-fallback-a.js
 */
const assert = require('assert');
const path = require('path');
const L = require(path.join(__dirname, '..', 'server', 'ai', 'location-intelligence.js'));
const G = require(path.join(__dirname, '..', 'server', 'ai', 'llm-geocode.js'));
let pass = 0, fail = 0;
function test(n, fn) { try { fn(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + ' — ' + e.message); fail++; } }
async function atest(n, fn) { try { await fn(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + ' — ' + e.message); fail++; } }

(async () => {
  console.log('\n═══ RMOOZ-RESOLVER-LLM-FALLBACK-A ═══\n');

  console.log('1) Rung 2 — fuzzy gazetteer near-match');
  test('misspelled "Bandar Abas" → fuzzy hit, needs_review, NOT exact', () => {
    const c = L.resolveMention({ text: 'Bandar Abas' }, {})[0];
    assert.strictEqual(c.placement_type, 'fuzzy_match');
    assert.ok(typeof c.lat === 'number' && typeof c.lon === 'number', 'has gazetteer coord');
    assert.strictEqual(c.exact_unit_position, false);
    assert.strictEqual(c.needs_review, true);
    assert.ok(c.warnings.indexOf('fuzzy_gazetteer_match') !== -1);
  });
  test('unrelated text does NOT fuzzy-match (no wild guess)', () => {
    assert.strictEqual(L.fuzzyGazetteer('totally unrelated place xyz'), null);
  });

  console.log('\n2) Rung 3 — MGRS conversion (graceful when lib absent)');
  test('mgrsToLatLon returns null OR a valid {lat,lon}', () => {
    const r = L.mgrsToLatLon('38SMB4488');
    assert.ok(r === null || (typeof r.lat === 'number' && typeof r.lon === 'number'));
  });

  console.log('\n3) Rung 4 — LLM fallback guardrails (mocked provider)');
  const realFn = G.geocodeNamedPlace;
  await atest('LOCAL hit → coord_status candidate · source local_llm · needs_review · NOT exact · provenance', async () => {
    G.geocodeNamedPlace = async () => ({ ok: true, lat: 24.25, lon: 54.55, confidence: 'medium', reasoning: 'near Abu Dhabi', source: 'local_llm', provider: 'ollama', model: 'qwen2.5:7b', raw: '{...}' });
    const { candidates, report } = await L.resolveUnresolvedWithLlm(L.resolveMention({ text: 'Al Dhafra Air Base' }, {}), { limit: 5 });
    const c = candidates[0];
    assert.strictEqual(c.coord_status, 'candidate');
    assert.strictEqual(c.source.origin, 'local_llm');
    assert.strictEqual(c.exact_unit_position, false);
    assert.strictEqual(c.needs_review, true);
    assert.ok(c.lat === 24.25 && c.lon === 54.55);
    assert.ok(c.llm_provenance && c.llm_provenance.model === 'qwen2.5:7b', 'provenance carries model');
    assert.ok(c.warnings.indexOf('not_source_verified') !== -1);
    assert.strictEqual(report.resolved, 1);
  });
  await atest('GATED CLOUD hit → source gated_cloud_llm, still NOT exact', async () => {
    G.geocodeNamedPlace = async () => ({ ok: true, lat: 1, lon: 2, confidence: 'high', source: 'gated_cloud_llm', provider: 'openrouter', model: 'x', raw: '' });
    const { candidates } = await L.resolveUnresolvedWithLlm(L.resolveMention({ text: 'Some Base' }, {}), { limit: 1 });
    assert.strictEqual(candidates[0].source.origin, 'gated_cloud_llm');
    assert.strictEqual(candidates[0].exact_unit_position, false);
    assert.strictEqual(candidates[0].needs_review, true);
  });
  await atest('BLOCKED provider → stays unresolved (null coord), report.blocked', async () => {
    G.geocodeNamedPlace = async () => ({ ok: false, reason: 'provider_blocked_local_only', provider: 'zen' });
    const { candidates, report } = await L.resolveUnresolvedWithLlm(L.resolveMention({ text: 'Blocked Base' }, {}), { limit: 1 });
    assert.strictEqual(candidates[0].lat, null);
    assert.strictEqual(report.blocked, true);
    assert.ok(candidates[0].warnings.indexOf('llm_could_not_resolve') !== -1);
  });
  await atest('model answers "no_coordinate" → NOT placed (no silent guessing)', async () => {
    G.geocodeNamedPlace = async () => ({ ok: false, reason: 'no_coordinate', provider: 'ollama', model: 'm' });
    const { candidates, report } = await L.resolveUnresolvedWithLlm(L.resolveMention({ text: 'Unknown XYZ' }, {}), { limit: 1 });
    assert.strictEqual(candidates[0].lat, null);
    assert.strictEqual(report.resolved, 0);
  });
  await atest('candidates that ALREADY have coords are never re-resolved', async () => {
    let called = 0; G.geocodeNamedPlace = async () => { called++; return { ok: true, lat: 9, lon: 9, source: 'local_llm' }; };
    const { report } = await L.resolveUnresolvedWithLlm([{ mention: 'x', lat: 10, lon: 20, placement_type: 'known_base' }], { limit: 5 });
    assert.strictEqual(called, 0);
    assert.strictEqual(report.attempted, 0);
  });
  G.geocodeNamedPlace = realFn;

  console.log('\n4) llm-geocode prompt (no network)');
  test('buildPrompt embeds the name + JSON/lat instruction', () => {
    const p = G.buildPrompt('Al Dhafra Air Base', { country: 'UAE' });
    assert.ok(/Al Dhafra Air Base/.test(p) && /JSON/.test(p) && /lat/.test(p) && /UAE/.test(p));
  });

  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail === 0 ? 0 : 1);
})();
