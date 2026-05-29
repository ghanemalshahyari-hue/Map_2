/**
 * Operational shell — Timeline / Transport placeholder.
 *
 * PR-5 (Timeline / Transport Placeholder). UI foundation only. The
 * buttons flip local CSS state inside #timeline-strip; nothing
 * outside the strip changes. There is intentionally NO event
 * dispatch, NO journal hookup, NO sim/AI/scenario call, NO map
 * mutation — the bridge exposes only readers (getState) and a
 * rerender hook for language change.
 *
 * Behaviors implemented in this PR:
 *   - Play / Pause are mutually exclusive `.is-active` toggles.
 *     Default state: Play active, Pause inactive (matches the
 *     "ready to run" idle look — but nothing actually runs).
 *   - Step Back / Step Forward add `.is-pulsed` for ~120 ms, then
 *     remove it. No state changes outside the button.
 *   - Speed (x1 / x4 / x30) is a single-select segmented group.
 *     Default: x1.
 *   - Phase (start / phase1 / phase2 / end) is a single-select
 *     segmented group. Default: start.
 *   - Scenario time is the static placeholder "H+00:00". The clock
 *     module is NOT wired to it.
 *   - Re-renders on language change (status pill + labels).
 *   - Idempotent on hot reload (the bridge is replaced each load).
 *
 * Future PRs will wire transport events to the journal/sim tick;
 * the DOM (#tl-play, #tl-pause, #tl-step-back, #tl-step-forward,
 * #tl-speed-group, #tl-phase-group, #tl-scenario-time, #tl-status)
 * is already in place — no further markup changes required.
 *
 * Bridge: window.AppShellTimeline
 */
(function () {
    'use strict';

    const PULSE_MS = 120;

    // ── Helpers ────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    // ── UI-only event bus (PR-6) ───────────────────────────────────
    // Dispatched on each transport / speed / phase click. The event
    // name explicitly contains `-ui-action` so any future subscriber
    // can see at a glance that this is a UI signal, NOT a simulation
    // tick / journal entry / AI prompt. The shell event log is the
    // only consumer in PR-6. No sim/AI/scenario module is wired here.
    //
    // detail shape: { action: <string>, value?: <string> }
    //   action ∈ { 'play', 'pause', 'step-back', 'step-forward',
    //              'speed-changed', 'phase-changed' }
    //   value  = optional context (the new speed string, the new phase id)
    function dispatchUiAction(action, value) {
        try {
            document.dispatchEvent(new CustomEvent('rmooz:timeline-ui-action', {
                detail: { action, value: (value == null ? null : String(value)) }
            }));
        } catch (_) { /* never throw out of a click handler */ }
    }

    // ── Play / Pause mutual exclusion ─────────────────────────────
    function setPlayState(playing) {
        const playBtn  = $('tl-play');
        const pauseBtn = $('tl-pause');
        if (!playBtn || !pauseBtn) return;
        if (playing) {
            playBtn.classList.add('is-active');
            pauseBtn.classList.remove('is-active');
            playBtn.setAttribute('aria-pressed', 'true');
            pauseBtn.setAttribute('aria-pressed', 'false');
        } else {
            playBtn.classList.remove('is-active');
            pauseBtn.classList.add('is-active');
            playBtn.setAttribute('aria-pressed', 'false');
            pauseBtn.setAttribute('aria-pressed', 'true');
        }
    }
    function isPlaying() {
        const playBtn = $('tl-play');
        return playBtn ? playBtn.classList.contains('is-active') : true;
    }

    // ── Step Back / Step Forward pulse ────────────────────────────
    function pulseButton(btn) {
        if (!btn) return;
        btn.classList.add('is-pulsed');
        // Use setTimeout — animation frame would be too fast for the
        // human eye on a single tick.
        setTimeout(() => {
            try { btn.classList.remove('is-pulsed'); } catch (_) { /* ignore */ }
        }, PULSE_MS);
    }

    // ── Segmented group (speed + phase) ───────────────────────────
    function activateSeg(groupEl, btn) {
        if (!groupEl || !btn) return;
        const siblings = groupEl.querySelectorAll('.timeline-seg-btn');
        for (const s of siblings) {
            const on = (s === btn);
            s.classList.toggle('is-active', on);
            s.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }
    function currentSegValue(groupEl, attr) {
        if (!groupEl) return null;
        const active = groupEl.querySelector('.timeline-seg-btn.is-active');
        return active ? active.getAttribute(attr) : null;
    }

    // ── State readers (no setters into anything sim-facing) ───────
    function getState() {
        return {
            playing: isPlaying(),
            speed:   currentSegValue($('tl-speed-group'), 'data-tl-speed'),
            phase:   currentSegValue($('tl-phase-group'), 'data-tl-phase'),
            scenarioTime: $('tl-scenario-time')?.textContent || null,
        };
    }

    // ── Wiring ────────────────────────────────────────────────────
    function bindTransport() {
        const playBtn  = $('tl-play');
        const pauseBtn = $('tl-pause');
        const back     = $('tl-step-back');
        const fwd      = $('tl-step-forward');

        playBtn?.addEventListener('click', () => { setPlayState(true);  dispatchUiAction('play'); });
        pauseBtn?.addEventListener('click', () => { setPlayState(false); dispatchUiAction('pause'); });
        back?.addEventListener('click', () => { pulseButton(back); dispatchUiAction('step-back'); });
        fwd?.addEventListener('click',  () => { pulseButton(fwd);  dispatchUiAction('step-forward'); });
    }

    function bindSegmented(groupId, actionName, valueAttr) {
        const group = $(groupId);
        if (!group) return;
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.timeline-seg-btn');
            if (!btn || !group.contains(btn)) return;
            activateSeg(group, btn);
            dispatchUiAction(actionName, btn.getAttribute(valueAttr));
        });
    }

    function bindLanguageChain() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            // i18n.applyLanguage already updates text via data-i18n, so we
            // only need to ensure the status pill is restored if a future
            // PR changes it. Currently a no-op repaint.
            try {
                // Nothing dynamic to repaint yet — placeholders only.
                // Future PRs that mutate #tl-status / #tl-scenario-time
                // will repaint here.
                void $('tl-status');
            } catch (_) { /* don't break chain */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    function init() {
        if (!$('timeline-strip')) return;
        bindTransport();
        bindSegmented('tl-speed-group', 'speed-changed', 'data-tl-speed');
        bindSegmented('tl-phase-group', 'phase-changed', 'data-tl-phase');
        bindLanguageChain();
        // Default visual state — Play active, x1, start phase. Matches
        // the markup defaults; this is a defensive re-apply so a future
        // markup tweak can't desync the controller.
        setPlayState(true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellTimeline = {
        getState,
        // Deliberately NOT exposed: setPhase, setSpeed, tick, play, pause.
        // These belong to the future journal-backed transport. Keeping
        // the bridge read-only avoids accidental wiring into PR-5.
    };
})();
