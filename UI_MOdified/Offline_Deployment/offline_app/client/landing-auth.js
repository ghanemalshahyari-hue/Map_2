/**
 * Root landing page (/) — sign in, then redirect to workspace (e.g. app.html).
 * Self-contained i18n so we don't have to pull in the full app i18n bundle.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'rmooz-lang';

    const STRINGS = {
        en: {
            title: 'Sign in',
            username: 'Username',
            password: 'Password',
            pass_hint: 'At least 4 characters',
            login: 'Login',
            register: 'Register',
            ldap_mode_hint: 'Use your domain account number (e.g. s1234567)',
            lang_btn: 'عربي',
            lang_title: 'Switch to Arabic',
            err_missing_user: 'Please enter a username',
            err_missing_pass: 'Please enter a password',
            err_missing_both: 'Enter username and password',
            err_short_user: 'Username must be at least 2 characters',
            err_short_pass: 'Password must be at least 4 characters',
            err_login_failed: 'Login failed',
            err_register_failed: 'Could not create account',
            err_bad_credentials: 'Wrong username or password',
            err_username_taken: 'That username is already taken',
            err_invalid_username: 'Username is not valid',
            err_password_short: 'Password must be at least 4 characters',
            err_network: 'Could not reach the server — check your connection',
            err_no_api: 'No API at this address (404). Open the app from the rmooz Node server — usually http://127.0.0.1:8000/ or the same host serving this page — not Live Server or another static-only host.',
            success_registered: 'Account created — signing you in…',
            working: 'Working…',
        },
        ar: {
            title: 'تسجيل الدخول',
            username: 'اسم المستخدم',
            password: 'كلمة المرور',
            pass_hint: '4 أحرف على الأقل',
            login: 'دخول',
            register: 'إنشاء حساب',
            ldap_mode_hint: 'أدخل رقم موظفك (مثال: s1234567)',
            lang_btn: 'English',
            lang_title: 'التبديل إلى الإنجليزية',
            err_missing_user: 'يرجى إدخال اسم المستخدم',
            err_missing_pass: 'يرجى إدخال كلمة المرور',
            err_missing_both: 'أدخل اسم المستخدم وكلمة المرور',
            err_short_user: 'اسم المستخدم يجب ألا يقل عن حرفين',
            err_short_pass: 'كلمة المرور يجب ألا تقل عن 4 أحرف',
            err_login_failed: 'فشل تسجيل الدخول',
            err_register_failed: 'تعذّر إنشاء الحساب',
            err_bad_credentials: 'اسم المستخدم أو كلمة المرور غير صحيحة',
            err_username_taken: 'اسم المستخدم مستخدم بالفعل',
            err_invalid_username: 'اسم المستخدم غير صالح',
            err_password_short: 'كلمة المرور يجب ألا تقل عن 4 أحرف',
            err_network: 'تعذّر الوصول إلى الخادم — تحقق من الاتصال',
            err_no_api: 'لا توجد واجهة API على هذا العنوان (404). شغّل التطبيق من خادم rmooz Node — عادةً http://127.0.0.1:8000/ أو من نفس المضيف الذي يقدّم هذه الصفحة — وليس Live Server.',
            success_registered: 'تم إنشاء الحساب — جاري تسجيل الدخول…',
            working: 'جاري التنفيذ…',
        }
    };

    function getLang() {
        const saved = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
        if (saved === 'en' || saved === 'ar') return saved;
        return 'en';
    }

    let lang = getLang();
    let _authBackend = 'local'; // updated by initAuthMode() once /api/auth/config responds

    function t(key) {
        return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    }

    function setLang(next) {
        if (next !== 'en' && next !== 'ar') return;
        lang = next;
        try { localStorage.setItem(STORAGE_KEY, next); } catch {}
        applyLang();
    }

    function applyLang() {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        const set = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
        set('rmooz-landing-title', 'textContent', t('title'));
        set('rmooz-landing-user-label', 'textContent', t('username'));
        set('rmooz-landing-pass-label', 'textContent', t('password'));
        set('rmooz-landing-pass-hint', 'textContent', t('pass_hint'));
        set('rmooz-landing-submit', 'textContent', t('login'));
        set('rmooz-landing-register', 'textContent', t('register'));
        const lb = document.getElementById('rmooz-landing-lang');
        if (lb) { lb.textContent = t('lang_btn'); lb.title = t('lang_title'); }
        document.title = lang === 'ar' ? 'rmooz — تسجيل الدخول' : 'rmooz — Sign in';
        // Re-translate LDAP hint if already shown (language switch while form is visible)
        const ldapHint = document.getElementById('rmooz-ldap-mode-hint');
        if (ldapHint && _authBackend === 'ldap') ldapHint.textContent = t('ldap_mode_hint');
    }

    const isHttpOrigin = /^https?:$/i.test(window.location.protocol || '');

    function apiUrl(path) {
        const p = (path && path.charAt(0) === '/') ? path : '/' + String(path || '');
        return (window.location && window.location.origin ? window.location.origin : '') + p;
    }

    const DEFAULT_NEXT = 'home.html';   // PR1: land on the RMOOZ launch hub by default (deep links to /app.html still honored via ?next=)

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

    function resolveClientUrl(target) {
        try {
            return new URL(target || DEFAULT_NEXT, window.location.href).toString();
        } catch {
            return target || DEFAULT_NEXT;
        }
    }

    function el(id) {
        return document.getElementById(id);
    }

    function setMsg(text, kind) {
        const e = el('rmooz-landing-err');
        if (!e) return;
        e.textContent = text || '';
        e.classList.remove('is-error', 'is-success');
        if (text && kind) e.classList.add('is-' + kind);
    }
    const setErr = (m) => setMsg(m, 'error');
    const setSuccess = (m) => setMsg(m, 'success');
    const clearMsg = () => setMsg('');

    // Map server error strings (English from app-data.js) to friendly localized keys.
    function friendlyServerError(raw, fallbackKey) {
        const s = String(raw || '').trim();
        const lc = s.toLowerCase();
        if (lc === 'invalid credentials') return t('err_bad_credentials');
        if (lc === 'username taken')      return t('err_username_taken');
        if (lc === 'invalid username')    return t('err_invalid_username');
        if (lc === 'password too short')  return t('err_password_short');
        // Surface other server messages verbatim if they look like a real sentence; otherwise fallback.
        if (s && s.length <= 200 && /[a-z؀-ۿ]/i.test(s)) return s;
        return t(fallbackKey);
    }

    async function readApiError(res, fallbackKey) {
        const status = res.status;
        const txt = await res.text().catch(() => '');
        if (!txt) {
            if (status === 404) return t('err_no_api');
            return t(fallbackKey);
        }
        try {
            const j = JSON.parse(txt);
            if (j && typeof j.error === 'string' && j.error.trim()) {
                return friendlyServerError(j.error, fallbackKey);
            }
        } catch (_) { /* ignore */ }
        const s = txt.trim();
        if (status === 404 && (s === 'Not found' || s === 'Cannot GET /api/auth/login')) {
            return t('err_no_api');
        }
        return friendlyServerError(s, fallbackKey);
    }

    async function fetchAuthMe() {
        try {
            const r = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
            if (r.status === 200) return r.json();
        } catch (_) { /* ignore */ }
        return null;
    }

    function goNext() {
        window.location.assign(resolveClientUrl(getNextTarget()));
    }

    function readCreds() {
        const u = (el('rmooz-landing-user')?.value || '').trim();
        const p = el('rmooz-landing-pass')?.value || '';
        return { u, p };
    }

    function validate(u, p) {
        if (!u && !p) return t('err_missing_both');
        if (!u) return t('err_missing_user');
        if (!p) return t('err_missing_pass');
        if (u.length < 2) return t('err_short_user');
        if (p.length < 4) return t('err_short_pass');
        return null;
    }

    function setBusy(busy) {
        const submit = el('rmooz-landing-submit');
        const register = el('rmooz-landing-register');
        [submit, register].forEach(b => {
            if (!b) return;
            b.disabled = !!busy;
            if (busy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
        });
    }

    // Fetch auth mode from the server and adjust the form for LDAP accounts.
    // Non-blocking — a failure here only means the hint is not shown.
    async function initAuthMode() {
        try {
            const r = await fetch(apiUrl('/api/auth/config'), { credentials: 'include' });
            if (!r.ok) return;
            const cfg = await r.json();
            if (!cfg || cfg.authBackend !== 'ldap') return;

            _authBackend = 'ldap';

            // Show the LDAP hint paragraph and translate it
            const hint = el('rmooz-ldap-mode-hint');
            if (hint) {
                hint.textContent = t('ldap_mode_hint');
                hint.style.display = '';
            }

            // Adjust username input placeholder (only when field is empty)
            const userInput = el('rmooz-landing-user');
            if (userInput && !userInput.value) userInput.placeholder = 's1234567';

            // Hide the Register button — registration is disabled in LDAP mode
            const regBtn = el('rmooz-landing-register');
            if (regBtn) regBtn.style.display = 'none';
        } catch (_) {
            // Non-critical — silently skip if /api/auth/config is unavailable
        }
    }

    let inFlight = false;

    async function doLogin() {
        if (inFlight) return;
        clearMsg();
        const { u, p } = readCreds();
        const v = validate(u, p);
        if (v) { setErr(v); return; }
        inFlight = true; setBusy(true);
        try {
            const r = await fetch(apiUrl('/api/auth/login'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u, password: p })
            });
            if (!r.ok) {
                setErr(await readApiError(r, 'err_login_failed'));
                return;
            }
            goNext();
        } catch {
            setErr(t('err_network'));
        } finally {
            inFlight = false; setBusy(false);
        }
    }

    async function doRegister() {
        if (inFlight) return;
        clearMsg();
        const { u, p } = readCreds();
        const v = validate(u, p);
        if (v) { setErr(v); return; }
        inFlight = true; setBusy(true);
        try {
            const r = await fetch(apiUrl('/api/auth/register'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u, password: p, displayName: u })
            });
            if (!r.ok) {
                setErr(await readApiError(r, 'err_register_failed'));
                return;
            }
            setSuccess(t('success_registered'));
        } catch {
            setErr(t('err_network'));
            return;
        } finally {
            inFlight = false; setBusy(false);
        }
        // Auto-login immediately after successful register.
        await doLogin();
    }

    async function init() {
        applyLang();
        if (!isHttpOrigin) return;

        const me = await fetchAuthMe();
        if (me) {
            goNext();
            return;
        }

        // Detect auth mode and adjust form labels/visibility (non-blocking)
        initAuthMode();

        const onInput = () => { if (!inFlight) clearMsg(); };
        el('rmooz-landing-user')?.addEventListener('input', onInput);
        el('rmooz-landing-pass')?.addEventListener('input', onInput);

        // Native form submit handles Enter-to-submit in any field.
        el('rmooz-landing-auth')?.addEventListener('submit', (ev) => {
            ev.preventDefault();
            doLogin();
        });
        el('rmooz-landing-submit')?.addEventListener('click', (ev) => {
            // Prevent double-handling — the form's submit will fire too.
            ev.preventDefault();
            doLogin();
        });
        el('rmooz-landing-register')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            doRegister();
        });
        el('rmooz-landing-lang')?.addEventListener('click', () => {
            setLang(lang === 'ar' ? 'en' : 'ar');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
