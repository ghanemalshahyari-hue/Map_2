#!/usr/bin/env node
/**
 * One-shot Zen-path validator for Sub-chunk 1A (Zen branch).
 *
 * Calls adjudicateStep twice with the same scenario step. Through Zen
 * we don't get Anthropic prompt caching, so the second call won't be
 * dramatically faster — but quality and schema validation are still
 * proven, and elapsed_ms will be much lower than Ollama on CPU.
 *
 * Usage (bash):
 *   export OPENCODE_ZEN_API_KEY="..."
 *   export RMOOZ_ZEN_MODEL="anthropic/claude-opus-4-5"   # check your dashboard
 *   cd UI_MOdified
 *   node scripts/test-zen.js
 *
 * Exits 0 on success, 1 on any failure with a diagnostic message.
 */

'use strict';

const adj        = require('../server/ai/adjudicator-agent');
const scn        = require('../server/ai/scenario-loader');
const zenClient  = require('../server/ai/zen-client');
const aiProvider = require('../server/ai/ai-provider');
const cfg        = require('../server/ai/ai-config');

function divider(label) {
    console.log('');
    console.log('=== ' + label + ' ===');
}

async function main() {
    divider('Pre-flight');
    console.log('zen configured:    ', zenClient.isConfigured());
    if (!zenClient.isConfigured()) {
        console.error('');
        console.error('FAIL: OPENCODE_ZEN_API_KEY is not set.');
        console.error('  Set it in your shell first:');
        console.error('    export OPENCODE_ZEN_API_KEY="..."');
        console.error('  Optional model override (check your Zen dashboard for the right ID):');
        console.error('    export RMOOZ_ZEN_MODEL="anthropic/claude-opus-4-5"');
        process.exit(1);
    }
    console.log('zen URL:           ', cfg.zen.url);
    console.log('zen default model: ', cfg.zen.defaultModel);
    console.log('default provider:  ', aiProvider.configuredDefault());

    divider('Health probe (GET /v1/models)');
    const ping = await zenClient.ping();
    console.log('ping.ok:           ', ping.ok);
    if (!ping.ok) {
        console.error('');
        console.error('FAIL: Zen health probe rejected. Error:', ping.error);
        console.error('');
        console.error('Common causes:');
        console.error('  - OPENCODE_ZEN_API_KEY wrong/expired (401)');
        console.error('  - OPENCODE_ZEN_URL wrong (try https://opencode.ai/zen/v1)');
        console.error('  - Network/firewall blocks opencode.ai');
        process.exit(1);
    }
    console.log('models found:      ', ping.modelsTotal);
    if (ping.models && ping.models.length) {
        console.log('first 10 models:');
        ping.models.slice(0, 10).forEach(m => console.log('  - ' + m));
        console.log('');
        // Help the user pick the right model ID — flag whether our configured
        // default appears in the list.
        const hasConfigured = ping.models.includes(cfg.zen.defaultModel);
        console.log(hasConfigured
            ? `  ✓ Configured model "${cfg.zen.defaultModel}" found in Zen catalog`
            : `  ⚠ Configured model "${cfg.zen.defaultModel}" NOT found in catalog.\n` +
              `    Pick one of the IDs above and re-run with: export RMOOZ_ZEN_MODEL="<id>"`);
    }

    const scenario = scn.getDefaultScenario();

    divider('Call 1 (no cache through Zen, latency = baseline)');
    const t1 = Date.now();
    const r1 = await adj.adjudicateStep({ scenario, stepIndex: 1, provider: 'zen' });
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

    if (!r1.ok) {
        console.error('');
        console.error('FAIL: Call 1 did not succeed.');
        console.error('  Check the error message above. Most likely causes:');
        console.error('   - Model id ("' + cfg.zen.defaultModel + '") not accepted by Zen.');
        console.error('     Try another id from the catalog above:');
        console.error('       export RMOOZ_ZEN_MODEL="<id>"');
        console.error('   - Schema validation failed (model output rejected — could be a less');
        console.error('     capable model that doesn\'t follow the doctrine prompt as strictly).');
        process.exit(1);
    }

    divider('Call 2 (still no cache through Zen; sanity-check repeatability)');
    const t2 = Date.now();
    const r2 = await adj.adjudicateStep({ scenario, stepIndex: 1, provider: 'zen' });
    const ms2 = Date.now() - t2;
    console.log('elapsed_ms:        ', ms2);
    console.log('schema_ok:         ', r2.validation && r2.validation.schema_ok);

    divider('narrative_en (English condensation)');
    console.log(r1.state && r1.state.narrative_en || '(empty)');

    divider('narrative_ar (Arabic primary)');
    console.log(r1.state && r1.state.narrative_ar || '(empty)');

    divider('Summary');
    console.log('Call 1 latency:    ', ms1, 'ms');
    console.log('Call 2 latency:    ', ms2, 'ms');
    console.log('Schema validation: ', (r1.validation && r1.validation.schema_ok) ? 'PASS ✓' : 'FAIL');
    console.log('Both calls ok:     ', (r1.ok && r2.ok) ? 'YES ✓' : 'NO');
    console.log('');
    console.log('Sub-chunk 1A (Zen path): ' + ((r1.ok && r2.ok && r1.validation && r1.validation.schema_ok) ? '✓ PASS' : '✗ NEEDS INVESTIGATION'));
}

main().catch((e) => {
    console.error('');
    console.error('UNCAUGHT:', e && (e.stack || e.message) || e);
    process.exit(1);
});
