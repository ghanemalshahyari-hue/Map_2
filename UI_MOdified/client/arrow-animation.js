/**
 * arrow-animation.js — SVG path animation primitives for the Maneuver Arrow.
 *
 * Three independent effects, all backed by one shared requestAnimationFrame
 * loop so dozens of arrows on screen still cost one rAF callback per frame:
 *
 *   - startFlow(pathEl, opts)     marching-dash flow (tail to tip), tokenised
 *   - playDrawOn(pathEl, ms, cb)  snake-in stroke reveal, one-shot
 *   - playHeadPulse(pathEl, ms)   bright tracer that rides the path once
 *
 * Honours prefers-reduced-motion: flow stops, draw-on collapses to instant,
 * pulse is skipped. The play-on-turn glide still runs because it carries
 * semantic information (where units are going), not decoration.
 *
 * Bridge name: window.AppArrowAnim
 */
(function () {
    'use strict';

    const reducedMotion = (() => {
        try {
            return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (_) { return false; }
    })();

    // ── Shared rAF ticker ────────────────────────────────────────────
    const flowEntries = new Map();      // token -> { el, dashArray, speedPxPerSec, offset }
    const oneShots    = new Set();      // tween entries advanced once per frame
    let rafId = null;
    let lastT = 0;
    let nextToken = 1;

    function ensureTicker() {
        if (rafId !== null) return;
        lastT = performance.now();
        const tick = (t) => {
            const dt = Math.min(64, t - lastT);   // clamp big gaps (tab restore)
            lastT = t;
            // Flow dashes
            for (const entry of flowEntries.values()) {
                if (!entry.el || !entry.el.isConnected) continue;
                entry.offset = (entry.offset - entry.speedPxPerSec * dt / 1000);
                // keep within a sane range so floats don't explode over time
                if (entry.offset < -1e6) entry.offset += 1e6;
                entry.el.setAttribute('stroke-dashoffset', entry.offset.toFixed(2));
            }
            // One-shot tweens
            for (const tween of [...oneShots]) {
                if (!tween.el || !tween.el.isConnected) { oneShots.delete(tween); continue; }
                const k = Math.min(1, (t - tween.start) / tween.duration);
                tween.apply(k);
                if (k >= 1) {
                    if (typeof tween.onDone === 'function') {
                        try { tween.onDone(); } catch (_) {}
                    }
                    oneShots.delete(tween);
                }
            }
            if (flowEntries.size === 0 && oneShots.size === 0) {
                rafId = null;
                return;
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    }

    // ── Public: flow dashes ──────────────────────────────────────────
    function startFlow(pathEl, opts) {
        if (!pathEl) return null;
        if (reducedMotion) return null;
        const dashArray = (opts && opts.dashArray) || '14 10';
        const speed = (opts && Number.isFinite(opts.speedPxPerSec)) ? opts.speedPxPerSec : 60;
        pathEl.setAttribute('stroke-dasharray', dashArray);
        pathEl.setAttribute('stroke-dashoffset', '0');
        const token = nextToken++;
        flowEntries.set(token, {
            el: pathEl,
            dashArray,
            speedPxPerSec: speed,
            offset: 0,
        });
        ensureTicker();
        return token;
    }

    function stopFlow(token) {
        if (token == null) return;
        const entry = flowEntries.get(token);
        if (entry && entry.el) {
            // Clear the dash so the path renders solid again. Caller may set its
            // own dashArray afterwards (e.g. flank lines keep a static dash).
            entry.el.removeAttribute('stroke-dasharray');
            entry.el.removeAttribute('stroke-dashoffset');
        }
        flowEntries.delete(token);
    }

    // ── Public: draw-on (snake-in) ───────────────────────────────────
    function playDrawOn(pathEl, durationMs, onDone) {
        if (!pathEl) return;
        let total = 0;
        try { total = pathEl.getTotalLength?.() || 0; } catch (_) { total = 0; }
        if (!total) { if (typeof onDone === 'function') onDone(); return; }
        if (reducedMotion || !durationMs || durationMs < 16) {
            pathEl.setAttribute('stroke-dasharray', total.toFixed(2) + ' ' + total.toFixed(2));
            pathEl.setAttribute('stroke-dashoffset', '0');
            if (typeof onDone === 'function') onDone();
            return;
        }
        pathEl.setAttribute('stroke-dasharray', total.toFixed(2) + ' ' + total.toFixed(2));
        pathEl.setAttribute('stroke-dashoffset', total.toFixed(2));
        const tween = {
            el: pathEl,
            start: performance.now(),
            duration: durationMs,
            apply: (k) => {
                // ease-out cubic so the tip lands gently
                const e = 1 - Math.pow(1 - k, 3);
                pathEl.setAttribute('stroke-dashoffset', (total * (1 - e)).toFixed(2));
            },
            onDone,
        };
        oneShots.add(tween);
        ensureTicker();
    }

    // ── Public: head tracer pulse ────────────────────────────────────
    // Animates a separate short dash riding the path once. The caller passes
    // the *same* path element used for the spine; we toggle a clone class so
    // we don't trample the constant flow dashes. We achieve "rides the path"
    // by animating stroke-dashoffset with a single short dash and gap = total.
    function playHeadPulse(pathEl, durationMs) {
        if (!pathEl) return;
        if (reducedMotion) return;
        let total = 0;
        try { total = pathEl.getTotalLength?.() || 0; } catch (_) { total = 0; }
        if (!total) return;
        const tracer = pathEl.cloneNode(false);
        // Tracer overlay: 8px bright dash, gap covers the rest of the path
        tracer.removeAttribute('marker-end');
        tracer.removeAttribute('marker-start');
        tracer.classList.add('maneuver-arrow-head-pulse');
        tracer.setAttribute('stroke-dasharray', '12 ' + total.toFixed(2));
        tracer.setAttribute('stroke-dashoffset', total.toFixed(2));
        pathEl.parentNode.insertBefore(tracer, pathEl.nextSibling);
        const tween = {
            el: tracer,
            start: performance.now(),
            duration: durationMs,
            apply: (k) => {
                tracer.setAttribute('stroke-dashoffset', (total * (1 - k) - 12).toFixed(2));
            },
            onDone: () => {
                try { tracer.parentNode.removeChild(tracer); } catch (_) {}
            },
        };
        oneShots.add(tween);
        ensureTicker();
    }

    window.AppArrowAnim = {
        startFlow,
        stopFlow,
        playDrawOn,
        playHeadPulse,
        get reducedMotion() { return reducedMotion; },
    };
})();
