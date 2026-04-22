/**
 * Server-backed auth, plans (JSON files + API), and preferences when served over http(s).
 * file:// opens skip this — localStorage plan only.
 */
(function () {
    'use strict';

    const isHttpOrigin = /^https?:$/i.test(window.location.protocol || '');

    // Session cookie is host-scoped: http://127.0.0.1:8000 and http://localhost:8000 do not share it.
    // Use localhost as the canonical dev URL (matches the server banner). Redirect loopback only.
    if (isHttpOrigin) {
        const host = window.location.hostname;
        if (host === '127.0.0.1' || host === '::1' || host === '[::1]') {
            try {
                const next = new URL(window.location.href);
                next.hostname = 'localhost';
                if (next.href !== window.location.href) {
                    window.location.replace(next.href);
                }
            } catch (_) { /* ignore */ }
        }
    }

    /** Same-origin API URL (explicit origin so login/session always match the page host, e.g. localhost:8000). */
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
            prefs.theme = localStorage.getItem(THEME_KEY) || 'dark';
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

    function updatePlanSelect(plans) {
        const sel = el('server-plan-select');
        if (!sel) return;
        sel.innerHTML = '';
        (plans || []).forEach((p) => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name || p.id;
            if (p.id === activePlanId) o.selected = true;
            sel.appendChild(o);
        });
    }

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
            const name = prompt('New plan name', 'New plan');
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

    function savePlanPayload(jsonStr) {
        if (!isHttpOrigin || !activePlanId) return Promise.resolve();
        return fetch(apiUrl('/api/plans/' + encodeURIComponent(activePlanId)), {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: jsonStr
        }).then((r) => {
            if (!r.ok) console.warn('Plan save failed', r.status);
        });
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
        savePlanPayload
    };
})();
