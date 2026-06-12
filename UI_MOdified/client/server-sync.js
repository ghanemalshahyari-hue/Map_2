/**
 * Server-backed auth, plans (JSON files + API), and preferences when served over http(s).
 * file:// opens skip this — localStorage plan only.
 */
(function () {
    'use strict';

    const isHttpOrigin = /^https?:$/i.test(window.location.protocol || '');

    // Session cookies are host-scoped, so we keep the current loopback host
    // instead of forcing 127.0.0.1 -> localhost. On some workstations a
    // different process may be bound on localhost/IPv6, and rewriting the host
    // silently sends the app to the wrong API server.

    /** Same-origin API URL (explicit origin so login/session always match the page host). */
    function apiUrl(path) {
        const p = (path && path.charAt(0) === '/') ? path : '/' + String(path || '');
        return (window.location && window.location.origin ? window.location.origin : '') + p;
    }

    const THEME_KEY = 'nato-map-planner-theme';
    const COORD_SYSTEM_KEY = 'nato-map-planner-coord-system';
    const DIST_KEY = 'rmooz-distance-unit-primary';
    const SIDC_FAV_KEY = 'nato-sidc-favorites';
    const LAYER_TPL_KEY = 'nato-layer-template-favorites';
    const FD_FORM_KEY = 'fd-default-formation';

    let activePlanId = null;
    let savePlanTimer = null;
    let savePrefsTimer = null;

    function el(id) { return document.getElementById(id); }

    function applyPrefsObject(prefs) {
        if (!prefs || typeof prefs !== 'object') return;
        try {
            if (prefs.theme && (prefs.theme === 'dark' || prefs.theme === 'light')) {
                localStorage.setItem(THEME_KEY, prefs.theme);
            }
            if (prefs.lang && (prefs.lang === 'en' || prefs.lang === 'ar') && typeof window.setLanguage === 'function') {
                window.setLanguage(prefs.lang);
            }
            if (prefs.distanceUnit === 'nm' || prefs.distanceUnit === 'km') {
                localStorage.setItem(DIST_KEY, prefs.distanceUnit === 'nm' ? 'nm' : 'km');
            }
            if (prefs.coordSystem && ['wgs84', 'dms', 'utm', 'mgrs'].includes(prefs.coordSystem)) {
                localStorage.setItem(COORD_SYSTEM_KEY, prefs.coordSystem);
            }
            if (prefs.sidcFavorites != null) {
                localStorage.setItem(SIDC_FAV_KEY, typeof prefs.sidcFavorites === 'string' ? prefs.sidcFavorites : JSON.stringify(prefs.sidcFavorites));
            }
            if (prefs.layerTemplateFavorites != null) {
                localStorage.setItem(LAYER_TPL_KEY, typeof prefs.layerTemplateFavorites === 'string' ? prefs.layerTemplateFavorites : JSON.stringify(prefs.layerTemplateFavorites));
            }
            if (prefs.fdDefaultFormation != null) {
                localStorage.setItem(FD_FORM_KEY, String(prefs.fdDefaultFormation));
            }
            if (prefs.activePlanId) activePlanId = prefs.activePlanId;
        } catch (e) {
            console.warn('applyPrefsObject', e);
        }
    }

    function collectPrefsFromLocalStorage() {
        const prefs = {};
        try {
            prefs.theme = localStorage.getItem(THEME_KEY) || 'light';
            prefs.lang = typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'en';
            prefs.distanceUnit = localStorage.getItem(DIST_KEY) === 'nm' ? 'nm' : 'km';
            prefs.coordSystem = localStorage.getItem(COORD_SYSTEM_KEY) || 'wgs84';
            const sf = localStorage.getItem(SIDC_FAV_KEY);
            if (sf) prefs.sidcFavorites = JSON.parse(sf);
            const lt = localStorage.getItem(LAYER_TPL_KEY);
            if (lt) prefs.layerTemplateFavorites = JSON.parse(lt);
            const fd = localStorage.getItem(FD_FORM_KEY);
            if (fd) prefs.fdDefaultFormation = fd;
            prefs.activePlanId = activePlanId;
        } catch (e) {
            console.warn('collectPrefsFromLocalStorage', e);
        }
        return prefs;
    }

    function schedulePushPreferences() {
        if (!isHttpOrigin) return;
        clearTimeout(savePrefsTimer);
        savePrefsTimer = setTimeout(() => {
            fetch(apiUrl('/api/me/preferences'), {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(collectPrefsFromLocalStorage())
            }).catch(() => {});
        }, 600);
    }

    async function fetchAuthMe() {
        const r = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
        if (r.status === 200) return r.json();
        return null;
    }

    async function pullPreferences() {
        const r = await fetch(apiUrl('/api/me/preferences'), { credentials: 'include' });
        if (r.status !== 200) return;
        const txt = await r.text();
        let prefs = {};
        try { prefs = JSON.parse(txt || '{}'); } catch { return; }
        applyPrefsObject(prefs);
    }

    async function pushPreferencesNow() {
        await fetch(apiUrl('/api/me/preferences'), {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectPrefsFromLocalStorage())
        });
    }

    let cachedPlans = [];

    function displayPlanName(name) {
        if (!name) return name;
        const t = window.t;
        if (typeof t !== 'function') return name;
        if (name === 'My plan') return t('default-plan-name');
        if (name === 'New plan') return t('new-plan-default-name');
        return name;
    }

    function updatePlanSelect(plans) {
        const sel = el('server-plan-select');
        if (!sel) return;
        if (plans) cachedPlans = plans;
        sel.innerHTML = '';
        (cachedPlans || []).forEach((p) => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = displayPlanName(p.name) || p.id;
            if (p.id === activePlanId) o.selected = true;
            sel.appendChild(o);
        });
    }

    (function chainLangChange() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { updatePlanSelect(); } catch (_) {}
            // Re-paint the save-status pill in the new language. If it's idle
            // (hidden), this is a no-op; otherwise it picks up the translated string.
            try {
                if (planSaveState && planSaveState !== 'idle') {
                    setPlanSaveStatus(planSaveState);
                }
            } catch (_) {}
            if (typeof prev === 'function') prev(lang);
        };
    })();

    async function loadPlanById(planId, importLayersData) {
        const r = await fetch(apiUrl('/api/plans/' + encodeURIComponent(planId)), { credentials: 'include' });
        if (!r.ok) throw new Error('Failed to load plan');
        const txt = await r.text();
        importLayersData(txt, true);
        activePlanId = planId;
        await pushPreferencesNow();
    }

    async function runInitialLoad(importLayersData, scheduleSaveToStorage) {
        if (!isHttpOrigin) return;

        let me = await fetchAuthMe();
        if (!me) {
            const returnTo = (window.location.pathname || '/') + (window.location.search || '');
            window.location.replace('/?next=' + encodeURIComponent(returnTo));
            return;
        }

        const bar = el('server-account-bar');
        if (bar) bar.classList.remove('hidden');

        await pullPreferences();

        const pr = await fetch(apiUrl('/api/me/preferences'), { credentials: 'include' }).then((r) => r.text()).then((t) => {
            try { return JSON.parse(t || '{}'); } catch { return {}; }
        });
        if (pr.activePlanId) activePlanId = pr.activePlanId;

        const listR = await fetch(apiUrl('/api/plans'), { credentials: 'include' });
        let plans = [];
        if (listR.ok) {
            const lj = await listR.json();
            plans = lj.plans || [];
        }
        updatePlanSelect(plans);

        let planId = activePlanId && plans.some((p) => p.id === activePlanId) ? activePlanId : null;
        if (!planId && plans.length) planId = plans[0].id;
        if (!planId) {
            const cr = await fetch(apiUrl('/api/plans'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'My plan' })
            });
            if (cr.ok) {
                const cj = await cr.json();
                planId = cj.id;
                plans = [{ id: cj.id, name: cj.name, updatedAt: cj.updatedAt }];
                updatePlanSelect(plans);
            }
        }
        if (!planId) throw new Error('No plan');
        await loadPlanById(planId, importLayersData);
        wireHeader(importLayersData, scheduleSaveToStorage);
    }

    let headerWired = false;
    function wireHeader(importLayersData, scheduleSaveToStorage) {
        if (headerWired) return;
        headerWired = true;
        el('server-plan-select')?.addEventListener('change', async (e) => {
            const id = e.target?.value;
            if (!id || id === activePlanId) return;
            try {
                await loadPlanById(id, importLayersData);
                if (typeof scheduleSaveToStorage === 'function') scheduleSaveToStorage();
                renderLayersListSafe();
            } catch (err) {
                console.error(err);
            }
        });
        el('server-new-plan-btn')?.addEventListener('click', async () => {
            const t = window.t;
            const promptLabel = (typeof t === 'function') ? t('new-plan-prompt') : 'New plan name';
            const promptDefault = (typeof t === 'function') ? t('new-plan-default-name') : 'New plan';
            const name = prompt(promptLabel, promptDefault);
            if (name == null) return;
            const r = await fetch(apiUrl('/api/plans'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() || 'New plan' })
            });
            if (!r.ok) return;
            const j = await r.json();
            const listR = await fetch(apiUrl('/api/plans'), { credentials: 'include' });
            const lj = await listR.json();
            updatePlanSelect(lj.plans || []);
            await loadPlanById(j.id, importLayersData);
            renderLayersListSafe();
        });
        el('server-logout-btn')?.addEventListener('click', async () => {
            await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
            activePlanId = null;
            el('server-account-bar')?.classList.add('hidden');
            window.location.reload();
        });
    }

    function renderLayersListSafe() {
        try {
            if (typeof window.renderLayersListFromServer === 'function') {
                window.renderLayersListFromServer();
            }
        } catch (_) {}
    }

    // One-shot banner: when a protected fetch returns 401 the user's session
    // has expired while they were working. We surface this instead of letting
    // saves silently fail — otherwise the next page reload loses changes.
    let sessionExpiredShown = false;
    function notifySessionExpired() {
        if (sessionExpiredShown) return;
        sessionExpiredShown = true;
        const t = (typeof window.t === 'function') ? window.t : (k) => k;
        const txtMsg     = t('session-expired-msg') !== 'session-expired-msg'
            ? t('session-expired-msg')
            : 'Your session has expired — sign in again to keep saving changes.';
        const txtSignIn  = t('session-expired-signin') !== 'session-expired-signin'
            ? t('session-expired-signin')
            : 'Sign in';
        const txtDismiss = t('dialog-cancel') !== 'dialog-cancel'
            ? t('dialog-cancel')
            : 'Dismiss';

        const bar = document.createElement('div');
        bar.id = 'rmooz-session-expired-bar';
        bar.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:100001',
            'background:#7c1d1d', 'color:#fff',
            'padding:10px 16px', 'display:flex', 'gap:12px',
            'align-items:center', 'justify-content:center',
            'font:13px/1.4 system-ui,sans-serif',
            'box-shadow:0 2px 8px rgba(0,0,0,0.45)'
        ].join(';');
        const msg = document.createElement('span');
        msg.textContent = txtMsg;
        const signIn = document.createElement('button');
        signIn.type = 'button';
        signIn.textContent = txtSignIn;
        signIn.style.cssText = 'padding:6px 14px;background:#fff;color:#7c1d1d;border:none;border-radius:4px;font-weight:600;cursor:pointer;';
        signIn.addEventListener('click', () => {
            const ret = (window.location.pathname || '/') + (window.location.search || '');
            window.location.assign('/?next=' + encodeURIComponent(ret));
        });
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.textContent = txtDismiss;
        dismiss.style.cssText = 'padding:6px 14px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.6);border-radius:4px;cursor:pointer;';
        dismiss.addEventListener('click', () => { try { bar.remove(); } catch (_) {} });
        bar.appendChild(msg);
        bar.appendChild(signIn);
        bar.appendChild(dismiss);
        document.body.appendChild(bar);
    }

    // ── Plan save state indicator ───────────────────────────────────
    // Drives the small pill next to #server-plan-select so users have a
    // visible signal that their work is being persisted.
    //   'idle'   → hidden
    //   'saving' → blue dot, "Saving…"
    //   'saved'  → green dot, "Saved" (auto-fades after 2 s)
    //   'error'  → red dot, "Save failed" (stays until next save attempt)
    let planSaveState = 'idle';
    let planSaveFadeTimer = null;
    function tx(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }
    function setPlanSaveStatus(state) {
        planSaveState = state;
        const pill = el('plan-save-status');
        if (!pill) return;
        pill.classList.remove(
            'plan-save-status--hidden',
            'plan-save-status--saving',
            'plan-save-status--saved',
            'plan-save-status--error'
        );
        if (planSaveFadeTimer) { clearTimeout(planSaveFadeTimer); planSaveFadeTimer = null; }
        if (state === 'saving') {
            pill.textContent = tx('plan-status-saving', 'Saving…');
            pill.classList.add('plan-save-status--saving');
        } else if (state === 'saved') {
            pill.textContent = tx('plan-status-saved', 'Saved');
            pill.classList.add('plan-save-status--saved');
            // Fade back to idle after 2 s — the green dot served its purpose;
            // we don't want a permanent badge taking up header real estate.
            planSaveFadeTimer = setTimeout(() => {
                if (planSaveState === 'saved') setPlanSaveStatus('idle');
            }, 2000);
        } else if (state === 'error') {
            pill.textContent = tx('plan-status-error', 'Save failed');
            pill.classList.add('plan-save-status--error');
        } else {
            pill.textContent = '';
            pill.classList.add('plan-save-status--hidden');
        }
    }

    function savePlanPayload(jsonStr) {
        if (!isHttpOrigin || !activePlanId) return Promise.resolve();
        const init = {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: jsonStr
        };
        // keepalive lets the request finish even if the page is unloading
        // (e.g. user hits DELETE then F5). Browsers cap keepalive bodies at
        // ~64KB; fall back to a normal fetch for larger plans.
        if (typeof jsonStr === 'string' && jsonStr.length <= 60 * 1024) {
            init.keepalive = true;
        }
        setPlanSaveStatus('saving');
        return fetch(apiUrl('/api/plans/' + encodeURIComponent(activePlanId)), init).then((r) => {
            if (!r.ok) {
                if (r.status === 401) notifySessionExpired();
                else notifyPlanSaveError(r.status);
                console.warn('Plan save failed', r.status);
                setPlanSaveStatus('error');
            } else {
                setPlanSaveStatus('saved');
            }
        }).catch((err) => {
            console.warn('Plan save error', err && err.message ? err.message : err);
            // Network failure (server down, offline). Don't spam — one toast per outage.
            notifyPlanSaveError('network');
            setPlanSaveStatus('error');
        });
    }

    // Coalesce repeated plan-save failures into a single toast so a flaky
    // network or a downed server doesn't flood the screen with notifications
    // (auto-save triggers every ~400 ms while the user works).
    let lastPlanSaveErrorAt = 0;
    function notifyPlanSaveError(kind) {
        if (!window.rmoozToast) return;
        const now = Date.now();
        if (now - lastPlanSaveErrorAt < 8000) return;
        lastPlanSaveErrorAt = now;
        const t = (typeof window.t === 'function') ? window.t : (k) => k;
        const key = kind === 'network' ? 'plan-save-network-error' : 'plan-save-error';
        const fallback = kind === 'network'
            ? "Can't reach the server — your changes aren't being saved."
            : 'Save failed — your changes may not be stored on the server.';
        const msg = t(key) !== key ? t(key) : fallback;
        window.rmoozToast(msg, 'error', { durationMs: 6000 });
    }

    function scheduleSavePlan(exportLayersData) {
        if (!isHttpOrigin || !activePlanId) return;
        clearTimeout(savePlanTimer);
        savePlanTimer = setTimeout(() => {
            try {
                const payload = exportLayersData();
                savePlanPayload(payload);
            } catch (e) {
                console.warn(e);
            }
        }, 400);
    }

    window.rmoozServerSync = {
        isHttpOrigin,
        get activePlanId() { return activePlanId; },
        set activePlanId(v) { activePlanId = v; },
        runInitialLoad,
        scheduleSavePlan,
        schedulePushPreferences,
        pushPreferencesNow,
        pullPreferences,
        wireHeader,
        savePlanPayload,
        notifySessionExpired
    };
})();
