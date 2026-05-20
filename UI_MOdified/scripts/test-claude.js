#!/usr/bin/env node
/**
 * One-shot Claude-path validator for Sub-chunk 1A.
 *
 * Calls adjudicateStep twice with the same scenario step; the first call
 * warms the prompt cache, the second should hit it. Prints timings,
 * provider, cache usage, validation outcome, and the bilingual narrative
 * so you can verify quality and the latency win in one go.
 *
 * Usage (bash):
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   cd UI_MOdified
 *   node scripts/test-claude.js
 *
 * Exits 0 on success, 1 on any failure with a diagnostic message.
 */

'use strict';

const adj        = require('../server/ai/adjudicator-agent');
const scn        = require('../server/ai/scenario-loader');
const claude     = require('../server/ai/claude-client');
const aiProvider = require('../server/ai/ai-provider');
const cfg        = require('../server/ai/ai-config');

function divider(label) {
    console.log('');
    console.log('=== ' + label + ' ===');
}

async function main() {
    divider('Pre-flight');
    console.log('claude configured:', claude.isConfigured());
    if (!claude.isConfigured()) {
        console.error('');
        console.error('FAIL: ANTHROPIC_API_KEY is not set.');
        console.error('  Set it in your shell first:');
        console.error('    export ANTHROPIC_API_KEY="sk-ant-..."');
        console.error('  Anthropic keys ALWAYS start with sk-ant-. Get one at:');
        console.error('    https://console.anthropic.com/settings/keys');
        process.exit(1);
    }
    console.log('claude default model:', cfg.claude.defaultModel);
    console.log('default provider:    ', aiProvider.configuredDefault());

    divider('Health probe (1 token, ~$0.0001)');
    const ping = await claude.ping();
    console.log('ping.ok:', ping.ok);
    if (!ping.ok) {
        console.error('');
        console.error('FAIL: Claude health probe rejected. Error:', ping.error);
        console.error('');
        console.error('Common causes:');
        console.error('  - Key is wrong/expired (Anthropic returns 401)');
        console.error('  - Key is for a different provider (OpenAI keys start with sk-,');
        console.error('    not sk-ant-, and cannot reach the Anthropic API)');
        console.error('  - Network/firewall blocks api.anthropic.com');
        console.error('  - Model id "' + cfg.claude.defaultModel + '" not available on your account.');
        console.error('    Try setting RMOOZ_CLAUDE_MODEL=claude-sonnet-4-6 and re-run.');
        process.exit(1);
    }
    console.log('probe id:', ping.probeId);

    const scenario = scn.getDefaultScenario();

    divider('Call 1 (cache miss expected; first run writes the cache)');
    const t1 = Date.now();
    const r1 = await adj.adjudicateStep({ scenario, stepIndex: 1, provider: 'claude' });
    const ms1 = Date.now() - t1;
    console.log('elapsed_ms:        ', ms1);
    console.log('ok:                ', r1.ok);
    console.log('provider:          ', r1.meta && r1.meta.provider);
    console.log('model:             ', r1.meta && r1.meta.model);
    console.log('schema_ok:         ', r1.validation && r1.validation.schema_ok);
    console.log('fallback:          ', (r1.validation && r1.validation.fallback) || '(none — live result)');
    if (r1.validation && r1.validation.error) {
        console.log('error:             ', r1.validation.error);
    }
    console.log('cacheCreateTokens: ', r1.meta && r1.meta.cacheCreationTokens, '(>0 means cache being written)');
    console.log('cacheReadTokens:   ', r1.meta && r1.meta.cacheReadTokens, '(=0 expected on first call)');

    if (!r1.ok) {
        console.error('');
        console.error('FAIL: Call 1 did not succeed.');
        console.error('  Check the error message above. Most likely the API rejected the call');
        console.error('  (key/model issue) or the model output failed schema validation.');
        process.exit(1);
    }

    divider('Call 2 (cache hit expected)');
    const t2 = Date.now();
    const r2 = await adj.adjudicateStep({ scenario, stepIndex: 1, provider: 'claude' });
    const ms2 = Date.now() - t2;
    const hit = (r2.meta && r2.meta.cacheReadTokens) > 0;
    console.log('elapsed_ms:        ', ms2, ms2 < ms1 ? '(faster than call 1 ✓)' : '(not faster)');
    console.log('cacheCreateTokens: ', r2.meta && r2.meta.cacheCreationTokens, '(=0 expected)');
    console.log('cacheReadTokens:   ', r2.meta && r2.meta.cacheReadTokens, hit ? '<-- CACHE HIT ✓' : '<-- no hit (investigate)');

    divider('narrative_en (English condensation)');
    console.log(r1.state && r1.state.narrative_en || '(empty)');

    divider('narrative_ar (Arabic primary)');
    console.log(r1.state && r1.state.narrative_ar || '(empty)');

    divider('Summary');
    console.log('Call 1 latency:    ', ms1, 'ms');
    console.log('Call 2 latency:    ', ms2, 'ms', '(delta', (ms1 - ms2), 'ms)');
    console.log('Cache hit proven:  ', hit ? 'YES ✓' : 'NO — check anthropic-beta header or SDK version');
    console.log('Schema validation: ', (r1.validation && r1.validation.schema_ok) ? 'PASS ✓' : 'FAIL');
    console.log('');
    console.log('Sub-chunk 1A end-to-end: ' + ((r1.ok && r2.ok && hit) ? '✓ PASS' : '✗ NEEDS INVESTIGATION'));
}

main().catch((e) => {
    console.error('');
    console.error('UNCAUGHT:', e && (e.stack || e.message) || e);
    process.exit(1);
});
