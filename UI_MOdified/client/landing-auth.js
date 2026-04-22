/**
 * Root landing page (/) — sign in, then redirect to workspace (e.g. app.html).
 */
(function () {
    'use strict';

    const isHttpOrigin = /^https?:$/i.test(window.location.protocol || '');

    if (isHttpOrigin) {
        const host = window.location.hostname;
        if (host === '127.0.0.1' || host === '::1' || host === '[::1]') {
            try {
                const next = new URL(window.location.href);
                next.hostname = 'localhost';
                if (next.href !== window.location.href) {
                    window.location.replace(next.href);
                    return;
                }
            } catch (_) { /* ignore */ }
        }
    }

    function apiUrl(path) {
        const p = (path && path.charAt(0) === '/') ? path : '/' + String(path || '');
        return (window.location && window.location.origin ? window.location.origin : '') + p;
    }

    const DEFAULT_NEXT = 'app.html';

    function sanitizeNext(raw) {
        const d = DEFAULT_NEXT;
        if (!raw || typeof raw !== 'string') return d;
        let s = raw.trim();
        if (!s || s.length > 256) return d;
        try {
            s = decodeURIComponent(s);
        } catch {
            return d;
        }
        s = s.trim();
        if (!s) return d;
        if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return d;
        if (s.startsWith('//')) return d;
        if (s.includes('..') || s.includes('\\')) return d;
        if (s.startsWith('/')) {
            try {
                const u = new URL(s, window.location.origin);
                if (u.origin !== window.location.origin) return d;
                if (u.pathname.includes('..')) return d;
                if (u.pathname === '/' && !u.search) return d;
                return u.pathname + (u.search || '');
            } catch {
                return d;
            }
        }
        if (/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/.test(s)) return s;
        if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
        return d;
    }

    function getNextTarget() {
        let q = '';
        try {
            q = new URL(window.location.href).searchParams.get('next') || '';
        } catch (_) {}
        return sanitizeNext(q);
    }

    function el(id) {
        return document.getElementById(id);
    }

    function setErr(msg) {
        const e = el('rmooz-landing-err');
        if (e) e.textContent = msg || '';
    }

    async function readApiError(res, fallback) {
        const status = res.status;
        const t = await res.text().catch(() => '');
        if (!t) {
            if (status === 404) {
                return 'No API at this address (404). Open the app from the rmooz Node server, e.g. http://localhost:8000/ — not Live Server or another static-only host.';
            }
            return fallback;
        }
        try {
            const j = JSON.parse(t);
            if (j && typeof j.error === 'string' && j.error.trim()) return j.error.trim();
        } catch (_) { /* ignore */ }
        const s = t.trim();
        if (status === 404 && (s === 'Not found' || s === 'Cannot GET /api/auth/login')) {
            return 'No API at this address (404). Start the app with: npm run serve (or node server/web-server.js) and sign in at http://localhost:8000/ — same host as the API.';
        }
        return s.length <= 200 ? s : fallback;
    }

    async function fetchAuthMe() {
        const r = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
        if (r.status === 200) return r.json();
        return null;
    }

    function goNext() {
        let target = getNextTarget();
        if (!target.startsWith('/')) {
            try {
                target = new URL(target, window.location.origin + '/').pathname;
            } catch {
                target = '/' + DEFAULT_NEXT;
            }
        }
        window.location.assign(target);
    }

    async function init() {
        if (!isHttpOrigin) return;

        const me = await fetchAuthMe();
        if (me) {
            goNext();
            return;
        }

        const err = () => setErr('');
        el('rmooz-landing-user')?.addEventListener('input', err);
        el('rmooz-landing-pass')?.addEventListener('input', err);

        el('rmooz-landing-submit')?.addEventListener('click', async () => {
            setErr('');
            const u = el('rmooz-landing-user')?.value?.trim();
            const p = el('rmooz-landing-pass')?.value || '';
            if (!u || !p) {
                setErr('Enter username and password');
                return;
            }
            try {
                const r = await fetch(apiUrl('/api/auth/login'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                if (!r.ok) {
                    setErr(await readApiError(r, 'Login failed'));
                    return;
                }
                goNext();
            } catch {
                setErr('Network error');
            }
        });

        el('rmooz-landing-register')?.addEventListener('click', async () => {
            setErr('');
            const u = el('rmooz-landing-user')?.value?.trim();
            const p = el('rmooz-landing-pass')?.value || '';
            if (!u || !p) {
                setErr('Enter username and password');
                return;
            }
            try {
                const r = await fetch(apiUrl('/api/auth/register'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p, displayName: u })
                });
                if (!r.ok) {
                    setErr(await readApiError(r, 'Register failed'));
                    return;
                }
                el('rmooz-landing-submit')?.click();
            } catch {
                setErr('Network error');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
