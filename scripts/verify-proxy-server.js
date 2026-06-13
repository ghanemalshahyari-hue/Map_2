#!/usr/bin/env node
/**
 * scripts/verify-proxy-server.js — browser-verify proxy for the REAL app.
 *
 * Why: UI_MOdified/server/web-server.js gates /api/auth/me on a real session,
 * so the full app.html reload-loops on the dev box (no logged-in operator).
 * scripts/verify-server.js stubs auth but returns {} for all other APIs, which
 * is fine for visual-only checks but cannot drive flows that need real API data
 * (e.g. POST /api/wargame-sim/analyze → a real Operational Brief).
 *
 * This proxy stubs ONLY GET /api/auth/me → 200 {canned operator} and forwards
 * EVERYTHING else (static /client/*, /shell/*, /lib/*, /app.html, and all other
 * /api/*) verbatim to the real web-server on TARGET. The Free Fight AI-Lite flow
 * then runs in the genuine app.html with the genuine pushed wiring + real briefs.
 *
 * Read-only verification aid; NOT part of the app or the offline image.
 * Listens on PORT (default 8003); proxies to TARGET (default http://localhost:8002).
 */
'use strict';

const http = require('http');

const PORT = Number.parseInt(process.env.PORT, 10) || 8003;
const TARGET = process.env.TARGET || 'http://localhost:8002';
const t = new URL(TARGET);

const server = http.createServer((req, res) => {
    // Stub auth so the client's runInitialLoad does not redirect to "/".
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/auth/me') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ id: 'verify-operator', name: 'Verify Operator', operator_id: 'verify-operator', roles: ['operator'], authenticated: true }));
        return;
    }
    // Proxy everything else to the real web-server, preserving method/headers/body.
    const opts = { hostname: t.hostname, port: t.port, path: req.url, method: req.method, headers: req.headers };
    opts.headers.host = t.host;
    const up = http.request(opts, (ur) => {
        // Force fresh JS/HTML so my committed ?v=ff-card-fix wiring loads, not a cache.
        const h = Object.assign({}, ur.headers, { 'cache-control': 'no-store, no-cache, must-revalidate' });
        res.writeHead(ur.statusCode || 502, h);
        ur.pipe(res);
    });
    up.on('error', (e) => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('proxy error: ' + e.message); });
    req.pipe(up);
});

server.listen(PORT, () => console.log('verify-proxy on ' + PORT + ' -> ' + TARGET));
