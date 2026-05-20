#!/usr/bin/env node
/**
 * One-shot Ollama-path validator for Sub-chunk 1A (Ollama branch).
 *
 * Runs a single adjudication step through the local Ollama backend. No
 * API keys, no network beyond localhost. If Ollama isn't running, the
 * script prints a clear "start ollama serve" hint and exits.
 *
 * Usage (bash):
 *   ollama serve                                  # in one terminal
 *   ollama pull llama3.2:1b                       # if no model pulled yet
 *   cd UI_MOdified
 *   node scripts/test-ollama.js                   # in another terminal
 *
 *   # Optional model override:
 *   RMOOZ_OLLAMA_MODEL=gpt-oss:20b node scripts/test-ollama.js
 *
 * Exits 0 on success, 1 on any failure with a diagnostic message.
 */

'use strict';

const adj          = require('../server/ai/adjudicator-agent');
const scn          = require('../server/ai/scenario-loader');
const ollamaClient = require('../server/ai/ollama-client');
const aiProvider   = require('../server/ai/ai-provider');
const cfg          = require('../server/ai/ai-config');

function divider(label) {
    console.log('');
    console.log('=== ' + label + ' ===');
}

async function main() {
    divider('Pre-flight');
    console.log('ollama URL:        ', cfg.url);
    console.log('default model:     ', cfg.defaultModel);
    console.log('apiStyle:          ', cfg.apiStyle);
    console.log('default provider:  ', aiProvider.configuredDefault());

    divider('Health probe (GET /api/tags — list installed models)');
    const ping = await ollamaClient.ping();
    console.log('ping.ok:           ', ping.ok);
    if (!ping.ok) {
        console.error('');
        console.error('FAIL: Ollama health probe rejected. Error:', ping.error);
        console.error('');
        console.error('Common causes:');
        console.error('  - Ollama not running. Start it in another terminal:');
        console.error('      ollama serve');
        console.error('  - Different host/port. Override with:');
        console.error('      export RMOOZ_OLLAMA_URL="http://192.168.1.42:11434"');
        process.exit(1);
    }
    const models = ping.models || [];
    console.log('models installed:  ', models.length);
    if (models.length === 0) {
        console.error('');
        console.error('FAIL: Ollama is running but no models are pulled.');
        console.error('  Pull a small one first (1.3 GB, fast for testing):');
        console.error('      ollama pull llama3.2:1b');
        console.error('  Or a heavier model for better doctrine adherence (~14 GB):');
        console.error('      ollama pull gpt-oss:20b');
        process.exit(1);
    }
    console.log('first 10 models:');
    models.slice(0, 10).forEach(m => console.log('  - ' + m));
    const hasDefault = models.includes(cfg.defaultModel);
    console.log('');
    console.log(hasDefault
        ? `  ✓ Configured default "${cfg.defaultModel}" is installed`
        : `  ⚠ Configured default "${cfg.defaultModel}" not installed.\n` +
          `    Either run "ollama pull ${cfg.defaultModel}" OR set RMOOZ_OLLAMA_MODEL\n` +
          `    to one of the installed models above and re-run.`);

    const scenario = scn.getDefaultScenario();

    divider('Call 1 (Ollama, llama3.2:1b ≈ 30-90s on CPU; bigger models = slower)');
    const t1 = Date.now();
    const r1 = await adj.adjudicateStep({ scenario, stepIndex: 1, provider: 'ollama' });
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
    if (r1.validation && r1.validation.schema_errors) {
        console.log('schema_errors:     ', JSON.stringify(r1.validation.schema_errors.slice(0, 3), null, 2));
    }

    if (!r1.ok) {
        console.error('');
        console.error('FAIL: Call 1 did not succeed.');
        console.error('  With small models (e.g. llama3.2:1b) the doctrine prompt is hard');
        console.error('  to follow perfectly. The validator may reject malformed JSON.');
        console.error('');
        console.error('  Options:');
        console.error('   1. Pull a stronger model and re-run:');
        console.error('        ollama pull gpt-oss:20b');
        console.error('        RMOOZ_OLLAMA_MODEL=gpt-oss:20b node scripts/test-ollama.js');
        console.error('   2. Sub-chunk 1A is provider-agnostic — the wiring is proven. We can');
        console.error('      proceed to 1B even if the local model produces validator failures,');
        console.error('      because the COA generator will work the same way regardless of which');
        console.error('      backend you eventually use.');
        process.exit(1);
    }

    divider('narrative_en (English condensation)');
    console.log(r1.state && r1.state.narrative_en || '(empty)');

    divider('narrative_ar (Arabic primary)');
    console.log(r1.state && r1.state.narrative_ar || '(empty)');

    divider('Summary');
    console.log('Call latency:      ', ms1, 'ms');
    console.log('Schema validation: ', (r1.validation && r1.validation.schema_ok) ? 'PASS ✓' : 'FAIL');
    console.log('Live (not fallback):', r1.ok ? 'YES ✓' : 'NO (used scenario baseline)');
    console.log('');
    console.log('Sub-chunk 1A (Ollama path): ' + ((r1.ok && r1.validation && r1.validation.schema_ok) ? '✓ PASS' : '✗ NEEDS INVESTIGATION'));
}

main().catch((e) => {
    console.error('');
    console.error('UNCAUGHT:', e && (e.stack || e.message) || e);
    process.exit(1);
});
