#!/usr/bin/env node
/**
 * scripts/verify-server.js — local browser-verify stub server.
 *
 * Why this exists: UI_MOdified/server/web-server.js gates `/api/auth/me` on a
 * real session; without one, client/server-sync.js's runInitialLoad redirects
 * to "/" and the app reload-loops (see
 * docs/session-memory/reference_browser_verify_static_server.md).
 *
 * This stub serves UI_MOdified/ as static files (so /client/* and /data/*.json
 * work) and stubs `GET /api/auth/me` → 200 with a canned operator. All other
 * /api/* return 200 {} — fine for the visual-only verification flows.
 *
 * Cache headers are no-store so edited JS/HTML/CSS load fresh — same trap the
 * reference doc warned about (stale cached scenario-workspace.js).
 *
 * Listens on PORT env var (default 8001).
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = Number.parseInt(process.env.PORT, 10) || 8001;
const ROOT = path.join(__dirname, '..', 'UI_MOdified');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.ico':  'image/x-icon',
    '.map':  'application/json; charset=utf-8',
    '.woff':  'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':  'font/ttf'
};

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
    });
    res.end(JSON.stringify(body));
}

function sendStatic(req, res, fsPath) {
    fs.stat(fsPath, (err, st) => {
        if (err || !st.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + req.url);
            return;
        }
        const ext  = path.extname(fsPath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type':  mime,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma':        'no-cache',
            'Content-Length': st.size
        });
        fs.createReadStream(fsPath).pipe(res);
    });
}

const server = http.createServer((req, res) => {
    const u = url.parse(req.url, true);
    let p = decodeURIComponent(u.pathname || '/');

    // Auth stub — only /me is checked by runInitialLoad.
    if (p === '/api/auth/me' && req.method === 'GET') {
        return sendJson(res, 200, {
            id: 'verify-operator',
            username: 'verify',
            name: 'Verify Operator',
            role: 'planner'
        });
    }
    // Permissive stub for the rest of /api/* — verification doesn't need data.
    if (p.startsWith('/api/')) return sendJson(res, 200, {});

    // Root → app.html (the page under test).
    if (p === '/' || p === '') p = '/app.html';
    // The real server serves /app.html from UI_MOdified/client/app.html and
    // /<asset> from the same dir. Mirror that resolution.
    const candidates = [
        path.join(ROOT, 'client', p.replace(/^\//, '')),
        path.join(ROOT, p.replace(/^\//, ''))
    ];
    (function tryNext(i) {
        if (i >= candidates.length) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + p);
            return;
        }
        fs.stat(candidates[i], (err, st) => {
            if (!err && st.isFile()) return sendStatic(req, res, candidates[i]);
            tryNext(i + 1);
        });
    })(0);
});

server.on('error', err => {
    if (err && err.code === 'EADDRINUSE') {
        console.error('[verify-server] Port ' + PORT + ' is already in use. Set PORT to another value.');
        process.exit(1);
    }
    console.error('[verify-server]', err);
    process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('[verify-server] Listening on http://127.0.0.1:' + PORT + ' — serving ' + ROOT);
});
