/*
 * shell-safe-area.js — RMOOZ app-shell safe-area measurer.
 *
 * Publishes the usable CONTENT BAND of the app shell as CSS variables on <html>:
 *   --rmooz-shell-top-safe     distance from the viewport top to the top of the content band
 *   --rmooz-shell-bottom-safe  distance from the viewport bottom to the bottom of the content band
 *
 * The shell is a STATIC flex column: classification-top + header  /  .workspace (the content band)
 * /  #timeline-strip + #event-log (~200px) + .app-statusbar + classification-bottom. Fixed
 * right-side drawers (Object Status Card, Selected Unit Panel) that pin to top:0/height:100vh run
 * BEHIND the header and (especially) the event-log. By bounding them to these variables they sit
 * inside the band instead of the raw viewport — top below the header, bottom above the footer stack.
 *
 * We measure the live content container (.workspace / main / #map) rather than summing guessed bar
 * heights (the event log is easy to miss). Fallback: top-chrome bottom edge + the topmost
 * bottom-chrome element's top edge. A small gap insets the panels slightly from the chrome.
 *
 * Layout-only, read-only: no app/scenario state, no network, no mutation. Recomputes on resize.
 * Pure measurement otherwise — never throws in headless/Node.
 *
 * API (window.RmoozShellSafeArea / module.exports):
 *   measure() -> { top, bottom } px (and sets the two CSS vars), or null if unmeasurable.
 */
(function (root) {
    'use strict';

    var GAP = 6; // small visual inset from the header / footer
    var TOP_DEFAULT = 74;    // header (52) + top classification bar (22) — fallback only
    var BOTTOM_DEFAULT = 96; // fallback only; the live measurement is the real value

    function rectOf(sel) {
        if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null;
        var el = document.querySelector(sel);
        if (!el || typeof el.getBoundingClientRect !== 'function') return null;
        var r = el.getBoundingClientRect();
        if (!r || !isFinite(r.top) || !isFinite(r.bottom)) return null;
        return r;
    }

    function computeBand() {
        var vh = (typeof window !== 'undefined' && Number(window.innerHeight)) || 0;
        if (!vh) return null;
        // Primary: the operational content band (the flex child between the chrome).
        var band = rectOf('.workspace') || rectOf('main') || rectOf('#map');
        if (band && band.height > 0) {
            return { top: band.top, bottom: vh - band.bottom, vh: vh };
        }
        // Fallback: bottom edge of the top chrome + top edge of the topmost bottom-chrome element.
        var hdr = rectOf('.app-header') || rectOf('header');
        var clsTop = rectOf('.classification-bar--top');
        var top = Math.max(hdr ? hdr.bottom : 0, clsTop ? clsTop.bottom : 0);
        var bottomTops = [];
        ['#timeline-strip', '#event-log', '.app-statusbar', '.classification-bar--bottom'].forEach(function (s) {
            var r = rectOf(s);
            if (r && r.top > top) bottomTops.push(r.top);
        });
        if (top <= 0 && !bottomTops.length) return null;
        var bottom = bottomTops.length ? vh - Math.min.apply(null, bottomTops) : 0;
        return { top: top, bottom: bottom, vh: vh };
    }

    function setVar(name, px) {
        var de = (typeof document !== 'undefined') && document.documentElement;
        if (de && de.style && typeof de.style.setProperty === 'function') {
            de.style.setProperty(name, px + 'px');
        }
    }

    function measure() {
        var band = computeBand();
        if (!band) return null;
        var top = Math.max(0, Math.round(band.top)) + GAP;
        var bottom = Math.max(0, Math.round(band.bottom)) + GAP;
        setVar('--rmooz-shell-top-safe', top);
        setVar('--rmooz-shell-bottom-safe', bottom);
        return { top: top, bottom: bottom };
    }

    // Recompute on viewport changes; an initial pass once the shell exists.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', function () { try { measure(); } catch (_) {} });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', function () { try { measure(); } catch (_) {} });
    }
    try { measure(); } catch (_) {}

    var api = { measure: measure, GAP: GAP, TOP_DEFAULT: TOP_DEFAULT, BOTTOM_DEFAULT: BOTTOM_DEFAULT };
    root.RmoozShellSafeArea = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
