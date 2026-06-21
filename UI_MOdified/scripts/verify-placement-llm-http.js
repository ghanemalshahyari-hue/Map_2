'use strict';
/* verify-placement-llm-http.js — validate the /placement resolveLlm opt-in over HTTP
 * against the running local-LLM server. Sets a loadable local model first, then asks
 * the resolver to LLM-geocode 2 real base names. Run: node scripts/verify-placement-llm-http.js
 */
const http = require('http');
const PORT = parseInt(process.env.BASE_PORT || '8022', 10);
function req(method, p, obj) {
    return new Promise((resolve, reject) => {
        const data = obj ? Buffer.from(JSON.stringify(obj)) : null;
        const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': data.length } : {}) }, res => {
            const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { let j; try { j = JSON.parse(Buffer.concat(ch).toString()); } catch (e) { j = { __raw: Buffer.concat(ch).toString().slice(0, 200) }; } j.__status = res.statusCode; resolve(j); });
        });
        r.on('error', reject); if (data) r.write(data); r.end();
    });
}
(async () => {
    console.log('\n═══ HTTP /placement + resolveLlm  (server :' + PORT + ') ═══\n');
    const sel = await req('POST', '/api/ai/model/select', { model: 'qwen2.5:7b', provider: 'ollama' });
    console.log('[model/select] HTTP ' + sel.__status + ' ' + JSON.stringify(sel).slice(0, 160));
    const body = { mentions: [{ text: 'Mehrabad Tehran' }, { text: 'Al Dhafra Air Base' }], resolveLlm: true, llmLimit: 2 };
    const t0 = Date.now();
    const pl = await req('POST', '/api/wargame-sim/placement', body);
    console.log('[placement] HTTP ' + pl.__status + ' · count=' + pl.count + ' · ' + (Date.now() - t0) + 'ms');
    console.log('[llm_resolution] ' + JSON.stringify(pl.llm_resolution));
    (pl.placement_candidates || []).forEach(c => {
        console.log('  ' + (typeof c.lat === 'number' ? '✓' : '⊘') + ' ' + c.mention + ' → lat=' + c.lat + ' lon=' + c.lon
            + ' [origin=' + (c.source && c.source.origin) + ' review=' + c.needs_review + ' exact=' + c.exact_unit_position + ' coord_status=' + c.coord_status + ']'
            + (c.llm_provenance ? (' model=' + c.llm_provenance.model) : ''));
    });
    process.exit(0);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
