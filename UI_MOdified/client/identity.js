/**
 * Per-browser user identity resolution.
 * Runs immediately on script load (before DOMContentLoaded) so that
 * CHAT_CONFIG.currentUser is populated before app.js starts.
 * Requires config.js to be loaded first.
 */
(function () {
    'use strict';

    // Local alias — mutating this object also mutates window.AppConfig.CHAT_CONFIG.currentUser
    const CHAT_CONFIG = window.AppConfig.CHAT_CONFIG;

    /**
     * Resolve identity from: URL params → localStorage → sessionStorage → default.
     * Writes the resolved identity back into CHAT_CONFIG.currentUser and persists it.
     */
    function applyUserIdentity() {
        const STORAGE_KEY = 'nato-chat-user';
        const params = new URLSearchParams(window.location.search);
        const fromUrl = {
            id:   params.get('id')   || params.get('userId'),
            name: params.get('name') || params.get('user'),
            role: params.get('role') || ''
        };
        let stored = null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
            if (raw) stored = JSON.parse(raw);
        } catch {}
        const id   = fromUrl.id   || stored?.id   || ('user-' + Math.random().toString(36).slice(2, 10));
        const name = fromUrl.name || (stored?.name && String(stored.name).trim()) || CHAT_CONFIG.currentUser.name;
        const role = fromUrl.role || stored?.role  || CHAT_CONFIG.currentUser.role;
        CHAT_CONFIG.currentUser = { id, name, role };
        const toSave = { id, name, role };
        try {
            localStorage.setItem(STORAGE_KEY,    JSON.stringify(toSave));
            sessionStorage.setItem(STORAGE_KEY,  JSON.stringify(toSave));
        } catch {}
    }

    // Run immediately — must happen before DOMContentLoaded fires
    applyUserIdentity();

    function getCurrentUserRole() {
        return CHAT_CONFIG.currentUser.role;
    }

    function isChatGloballyEnabled() {
        return !!CHAT_CONFIG.enabled;
    }

    function isChatOnline() {
        return typeof navigator !== 'undefined' && navigator.onLine;
    }

    window.AppIdentity = {
        applyUserIdentity,
        getCurrentUserRole,
        isChatGloballyEnabled,
        isChatOnline,
    };
})();
