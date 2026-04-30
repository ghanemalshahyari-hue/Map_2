/**
 * FILE: map-hide-panels.js
 * Auto-hide all side bars and the bottom dock when the user clicks on the
 * map. This gives the operator an unobstructed, near-full-screen view for
 * map interaction. The user can still re-open each panel through its
 * existing control:
 *   - Left context panel  → peek chevron (#context-panel-peek)
 *   - Right chat sidebar  → header chat toggle  (#chat-toggle-btn)
 *   - Bottom ORBAT dock   → tool-rail "Units" button / dock open API
 */
(function () {
    'use strict';

    function hideContextPanel() {
        const panel = document.getElementById('context-panel');
        const peek  = document.getElementById('context-panel-peek');
        if (!panel || panel.classList.contains('is-minimized')) return;
        panel.classList.add('is-minimized');
        panel.setAttribute('aria-hidden', 'true');
        if (peek) peek.classList.remove('hidden');
        try { localStorage.setItem('rmooz.contextPanel.minimized', '1'); } catch (_) {}
        // Let the CSS transition finish, then nudge Leaflet so the map
        // viewport tracks the new visible width.
        setTimeout(() => {
            try { window.map?.invalidateSize?.(); } catch (_) {}
        }, 260);
    }

    function hideChatSidebar() {
        const chat = document.getElementById('chat-sidebar');
        if (!chat || chat.classList.contains('collapsed')) return;
        // Prefer the existing close button — it carries any ancillary
        // state-cleanup logic registered in chat.js.
        const closeBtn = document.getElementById('chat-close-btn');
        if (closeBtn) {
            closeBtn.click();
        } else {
            chat.classList.add('collapsed');
        }
        const toggleBtn = document.getElementById('chat-toggle-btn');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    }

    function hideOrbatDock() {
        const dock = document.getElementById('orbat-dock');
        if (!dock || dock.classList.contains('hidden')) return;
        const closeBtn = document.getElementById('orbat-dock-close');
        if (closeBtn) {
            closeBtn.click();
        } else {
            dock.classList.add('hidden');
            dock.setAttribute('aria-hidden', 'true');
        }
    }

    function hideAllPanels() {
        hideContextPanel();
        hideChatSidebar();
        hideOrbatDock();
    }

    // Wait for Leaflet's map instance to exist (set up by app.js as window.map),
    // then attach the click handler. Polling is short and stops as soon as the
    // map is ready.
    function attachWhenMapReady() {
        const start = Date.now();
        const TIMEOUT_MS = 15000;

        function tick() {
            const m = window.map;
            if (m && typeof m.on === 'function') {
                // Leaflet's `click` only fires for true click events on the
                // map canvas — drag, dblclick and tool-internal handlers
                // do NOT raise it, so this won't interrupt drawing flows.
                m.on('click', hideAllPanels);
                return;
            }
            if (Date.now() - start > TIMEOUT_MS) return;
            setTimeout(tick, 120);
        }
        tick();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachWhenMapReady);
    } else {
        attachWhenMapReady();
    }
})();
