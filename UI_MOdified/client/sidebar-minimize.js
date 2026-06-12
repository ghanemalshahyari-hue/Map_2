/**
 * FILE: sidebar-minimize.js
 * Minimize/peek control for the left context panel — mirrors the ORBAT
 * dock's minimize behavior. Sliding the panel away gives the map the
 * full width; a small chevron tab hugs the inner edge of the rail and
 * brings the panel back when clicked.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'rmooz.contextPanel.minimized';

    function $(id) { return document.getElementById(id); }

    function notifyMapResize() {
        // Leaflet caches container size; nudge it after the CSS transition.
        setTimeout(() => {
            try { window.map?.invalidateSize?.(); } catch (_) {}
        }, 260);
    }

    function minimize(panel, peek) {
        panel.classList.add('is-minimized');
        panel.setAttribute('aria-hidden', 'true');
        peek.classList.remove('hidden');
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
        notifyMapResize();
    }

    function restore(panel, peek) {
        panel.classList.remove('is-minimized');
        panel.setAttribute('aria-hidden', 'false');
        peek.classList.add('hidden');
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        notifyMapResize();
    }

    function init() {
        const panel = $('context-panel');
        const minBtn = $('context-panel-minimize');
        const peek = $('context-panel-peek');
        if (!panel || !minBtn || !peek) return;

        minBtn.addEventListener('click', () => minimize(panel, peek));
        peek.addEventListener('click', () => restore(panel, peek));

        // Auto-restore the panel whenever the user picks a tool from the
        // left rail — they need to see the tool's options.
        document.querySelectorAll('.tool-rail-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (panel.classList.contains('is-minimized')) {
                    restore(panel, peek);
                }
            });
        });

        // Restore prior state across reloads.
        let wasMinimized = false;
        try { wasMinimized = localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) {}
        if (wasMinimized) {
            // Skip the slide animation on initial load — just be in the
            // minimized state. Adding the class without transition would
            // still animate, so disable transitions for one frame.
            const prev = panel.style.transition;
            panel.style.transition = 'none';
            panel.classList.add('is-minimized');
            panel.setAttribute('aria-hidden', 'true');
            peek.classList.remove('hidden');
            requestAnimationFrame(() => { panel.style.transition = prev; });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
