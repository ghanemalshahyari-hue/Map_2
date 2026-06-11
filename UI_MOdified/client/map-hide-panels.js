/**
 * FILE: map-hide-panels.js
 * Auto-hide all side bars and the bottom dock when the user clicks on the
 * map. This gives the operator an unobstructed, near-full-screen view for
 * map interaction. The user can still re-open each panel through its
 * existing control:
 *   - Left context panel  → peek chevron (#context-panel-peek)
 *   - Right chat sidebar  → header chat toggle  (#chat-toggle-btn)
 *   - Bottom ORBAT dock   → tool-rail "Units" button / dock open API
 *   - Ops/Intel panel     → tool-rail wargame button
 *   - Auto-draw controls  → Auto Draw button
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

    function hideOpsIntelPanel() {
        const panel = document.getElementById('ops-intel-panel');
        if (!panel || !panel.classList.contains('is-visible')) return;
        panel.classList.remove('is-visible');
        panel.setAttribute('aria-hidden', 'true');
    }

    function hideAutoFlankControls() {
        // Respect the free-draw workflow: while it is mid-flow (placing circles,
        // drawing the frontline, or choosing flank distances) a map click must
        // NOT dismiss the flank panel. The click that completes the frontline is
        // itself a map click — hiding here made the battalion/brigade Draw cards
        // vanish the instant they appeared. Idle-time dismissal is owned by
        // free_draw_signature.js's own document-level handler.
        const stage = window.freeDrawSignatureStage;
        if (stage && stage !== 'idle') return;
        const controls = document.getElementById('auto-flank-controls');
        if (!controls || controls.style.display === 'none') return;
        controls.style.display = 'none';
    }

    function hideAllPanels() {
        hideContextPanel();
        hideChatSidebar();
        hideOrbatDock();
        hideOpsIntelPanel();
        hideAutoFlankControls();
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

    // P3: expose a small API so the scenario "present" flow can trigger the same
    // clean map view a map click produces. Every panel stays re-openable via its
    // existing control (context peek chevron, Units button, chat toggle, etc.).
    window.AppMapHidePanels = { hideAll: hideAllPanels, hideContext: hideContextPanel };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachWhenMapReady);
    } else {
        attachWhenMapReady();
    }
})();
