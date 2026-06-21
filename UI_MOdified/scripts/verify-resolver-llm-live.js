'use strict';
/* verify-resolver-llm-live.js — LIVE proof of the resolver LLM-fallback rung.
 * Enables the GATED cloud (operator-authorized) via .env's OPENROUTER_API_KEY,
 * picks a model, and geocodes a real sample of the GCC-vs-Iran file's unresolved
 * named bases. Proves: provider-agnostic routing + every LLM coord is
 * candidate/needs_review/NOT-exact with source local_llm|gated_cloud_llm + provenance.
 * Run: node scripts/verify-resolver-llm-live.js
 */
const path = require('path'); const fs = require('fs');
// 1) provider select. DEFAULT = LOCAL-FIRST (Ollama). VERIFY_CLOUD=1 → operator-
//    authorized gated cloud (OpenRouter; KEY comes from .env). process.env wins over .env.
process.env.RMOOZ_ALLOW_SIM_RUN = '1';
var VP = (process.env.VERIFY_PROVIDER || (process.env.VERIFY_CLOUD === '1' ? 'openrouter' : 'ollama')).toLowerCase();
if (VP === 'openrouter') {
    process.env.RMOOZ_ALLOW_CLOUD_AI = '1';
    process.env.RMOOZ_LLM_PROVIDER = 'openrouter';
} else if (VP === 'zen' || VP === 'opencode') {
    process.env.RMOOZ_ALLOW_CLOUD_AI = '1';
    process.env.RMOOZ_LLM_PROVIDER = 'zen';
    process.env.OPENCODE_ZEN_URL = process.env.OPENCODE_ZEN_URL || 'https://opencode.ai/zen/v1';
    process.env.RMOOZ_ZEN_MODEL = process.env.RMOOZ_ZEN_MODEL || 'qwen3.6-plus-free';
    // OPENCODE_ZEN_API_KEY MUST be supplied via the command env (never committed).
} else {
    process.env.RMOOZ_ALLOW_CLOUD_AI = '0';
    process.env.RMOOZ_LLM_PROVIDER = 'ollama';
    process.env.RMOOZ_LLM_MODEL_GEOCODE = process.env.RMOOZ_LLM_MODEL_GEOCODE || 'qwen2.5:7b';
}
// 2) load .env to obtain OPENROUTER_API_KEY (fills gaps; does NOT override the above).
try { require(path.join(__dirname, '..', 'server', 'load-dotenv')).loadDotEnv(path.join(__dirname, '..', '.env')); }
catch (e) { console.log('[dotenv] warn:', e.message); }
// 3) require modules AFTER the key is in process.env.
const LLM = require(path.join(__dirname, '..', 'server', 'ai', 'llm-runtime-config.js'));
const OR = require(path.join(__dirname, '..', 'server', 'ai', 'openrouter-client.js'));
const L = require(path.join(__dirname, '..', 'server', 'ai', 'location-intelligence.js'));
const FILE = process.env.STEP1_FILE || 'C:/Users/ADMIN/Downloads/GCC_vs_Iran_step1_multicountry_freefight_trial.json';

function humanize(id) {
    const parts = String(id).split('-'); if (parts.length < 3) return { name: id, country: null, side: null };
    let mid = parts.slice(2); if (/^\d+$/.test(mid[mid.length - 1])) mid = mid.slice(0, -1);
    const name = mid.map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
    return { name: name, country: parts[1], side: parts[0] };
}

(async () => {
    console.log('\n═══ RESOLVER LLM FALLBACK — LIVE (gated cloud, operator-authorized) ═══\n');
    console.log('[gates] allow_sim_run=' + process.env.RMOOZ_ALLOW_SIM_RUN + ' allow_cloud=' + process.env.RMOOZ_ALLOW_CLOUD_AI);
    console.log('[provider] ' + LLM.getProvider() + ' | openrouterReady=' + LLM.openrouterReady() + ' | keyConfigured=' + OR.isConfigured() + ' | keyFormatOK=' + OR.keyLooksValid());
    const prov = LLM.getProvider();
    if (prov === 'openrouter') {
        if (!LLM.openrouterReady()) { console.log('\nCLOUD requested but NOT READY — aborting (check OPENROUTER_API_KEY + flags).'); process.exit(1); }
        let slug = (process.env.RMOOZ_OPENROUTER_MODEL || '').trim();
        if (!slug) {
            const models = (await OR.listModels()).map(m => String(m).replace(/^~+/, '').trim()).filter(m => /^[\w.\/-]+$/.test(m));
            console.log('[models] ' + models.length + ' clean slugs in the OpenRouter catalog');
            slug = models.find(m => /^anthropic\/claude-(3\.5-haiku|haiku-4|sonnet-4)/i.test(m))
                || models.find(m => /^anthropic\/claude.*(haiku|sonnet)/i.test(m))
                || models.find(m => /^qwen\/qwen3/i.test(m))
                || models[0];
        }
        slug = String(slug).replace(/^~+/, '').trim();
        process.env.RMOOZ_OPENROUTER_MODEL = slug;
        console.log('[model] cloud(openrouter) ' + slug);
    } else if (prov === 'zen' || prov === 'opencode') {
        console.log('[model] cloud(opencode.ai/zen) ' + (process.env.RMOOZ_ZEN_MODEL || '(default)') + ' · key …' + String(process.env.OPENCODE_ZEN_API_KEY || '').slice(-4));
    } else {
        console.log('[model] LOCAL ' + (process.env.VERIFY_LOCAL_MODEL || 'qwen2.5:7b') + '  (provider ' + prov + ', forced via ctx.model)');
    }

    const file = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    function baseIds(ff) { const out = []; ['air_bases', 'naval_bases', 'land_bases', 'bases'].forEach(k => (ff && ff[k] || []).forEach(b => { if (b && b.id) out.push(b.id); })); return out; }
    const sample = baseIds(file.enemy_forces).slice(0, 4).concat(baseIds(file.friendly_forces).slice(0, 4)).map(humanize);
    console.log('[sample] ' + sample.length + ' real named bases from the file:\n   ' + sample.map(s => s.name + ' (' + s.country + ')').join('\n   '));

    const cands = sample.map(s => { const c = L.resolveMention({ text: s.name }, {})[0]; c.country = s.country; c.side = s.side; return c; });
    console.log('\n[pre-LLM] unresolved (null coord): ' + cands.filter(c => c.lat == null).length + '/' + cands.length + '  (gazetteer/fuzzy/MGRS all missed → LLM rung)');

    const t0 = Date.now();
    const localModel = LLM.getProvider() === 'ollama' ? (process.env.VERIFY_LOCAL_MODEL || 'qwen2.5:7b') : undefined;
    const { candidates, report } = await L.resolveUnresolvedWithLlm(cands, { limit: sample.length, model: localModel });
    console.log('[done] ' + (Date.now() - t0) + 'ms · provider=' + report.provider + ' model=' + report.model + ' source=' + report.source);
    console.log('[report] attempted=' + report.attempted + ' resolved=' + report.resolved + ' unresolved=' + report.unresolved + ' blocked=' + report.blocked + '\n');
    if (report.resolved === 0 && report.items[0]) console.log('[diag] first item reason: ' + JSON.stringify(report.items[0]) + '\n');
    candidates.forEach(c => {
        if (typeof c.lat === 'number') console.log('  ✓ ' + c.mention + ' → ' + c.lat.toFixed(3) + ', ' + c.lon.toFixed(3) + '  [' + c.source.origin + ' · conf=' + c.confidence + ' · exact=' + c.exact_unit_position + ' · review=' + c.needs_review + ']');
        else console.log('  ⊘ ' + c.mention + ' → unresolved');
    });

    const placed = candidates.filter(c => typeof c.lat === 'number');
    const bad = placed.filter(c => c.exact_unit_position !== false || c.needs_review !== true || !/_llm$/.test(c.source.origin) || c.coord_status !== 'candidate');
    console.log('\nGUARDRAILS: ' + (bad.length === 0
        ? '✅ all ' + placed.length + ' LLM coords are coord_status=candidate, needs_review=true, exact=false, source=local_llm|gated_cloud_llm'
        : '❌ ' + bad.length + ' candidate(s) violated the guardrails'));
    process.exit(bad.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
