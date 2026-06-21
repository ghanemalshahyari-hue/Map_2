'use strict';
/* verify-opencode-key.js — validate an opencode.ai Zen (OpenAI-compatible) key.
 * Reads the key from env OPENCODE_TEST_KEY (NEVER hardcode/commit it). Hits
 * /models + a tiny geocode /chat/completions. No scenario data is sent.
 * Run: OPENCODE_TEST_KEY=sk-... node scripts/verify-opencode-key.js
 */
const https = require('https');
const KEY = process.env.OPENCODE_TEST_KEY || '';
const HOST = process.env.OPENCODE_TEST_HOST || 'opencode.ai';
const BASE = process.env.OPENCODE_TEST_BASE || '/zen/v1';
function call(method, p, body) {
    return new Promise((resolve) => {
        const data = body ? Buffer.from(JSON.stringify(body)) : null;
        const req = https.request({
            hostname: HOST, path: BASE + p, method: method,
            headers: Object.assign({ 'Authorization': 'Bearer ' + KEY, 'Accept': 'application/json', 'User-Agent': 'rmooz-keytest/1.0' }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
            timeout: 30000,
        }, res => { const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { const t = Buffer.concat(ch).toString(); let j = null; try { j = JSON.parse(t); } catch (_) {} resolve({ status: res.statusCode, json: j, text: t.slice(0, 400) }); }); });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', e => resolve({ status: 0, error: e.message }));
        if (data) req.write(data); req.end();
    });
}
(async () => {
    if (!KEY) { console.log('No key in OPENCODE_TEST_KEY env.'); process.exit(1); }
    console.log('\n═══ opencode.ai Zen key test ═══');
    console.log('endpoint https://' + HOST + BASE + ' · key …' + KEY.slice(-4) + ' (len ' + KEY.length + ')\n');

    console.log('[1] GET ' + BASE + '/models');
    const m = await call('GET', '/models');
    console.log('  HTTP ' + m.status + (m.error ? ' · ' + m.error : ''));
    let models = [];
    if (m.json) { models = (m.json.data || m.json.models || []).map(x => (x && (x.id || x.name)) || x).filter(Boolean); console.log('  ' + models.length + ' models: ' + (models.slice(0, 24).join(', ') || '(none)')); }
    else if (m.status) console.log('  body: ' + m.text);

    const pick = models.find(x => /haiku/i.test(x)) || models.find(x => /claude/i.test(x)) || models.find(x => /(gpt|qwen|mini|small|flash)/i.test(x)) || models[0] || 'claude-opus-4-7';
    console.log('\n[2] POST ' + BASE + '/chat/completions · model=' + pick + ' · trivial geocode probe');
    const c = await call('POST', '/chat/completions', { model: pick, messages: [{ role: 'user', content: 'Return ONLY JSON {"lat":<number>,"lon":<number>} for Mehrabad Airport, Tehran. No prose.' }], max_tokens: 80, temperature: 0.1, stream: false });
    console.log('  HTTP ' + c.status + (c.error ? ' · ' + c.error : ''));
    if (c.json) { const txt = (c.json.choices && c.json.choices[0] && c.json.choices[0].message && c.json.choices[0].message.content) || JSON.stringify(c.json).slice(0, 240); console.log('  reply: ' + txt); }
    else if (c.status) console.log('  body: ' + c.text);

    const okModels = m.status >= 200 && m.status < 300;
    const okChat = c.status >= 200 && c.status < 300;
    console.log('\n' + (okChat ? '✅ KEY WORKS — chat completion succeeded (usable as a cloud provider)'
        : okModels ? '⚠ key lists models but chat failed — see [2] status/body'
        : '❌ key/endpoint did NOT work — see status/body above') + '\n');
    process.exit(okChat ? 0 : 1);
})();
