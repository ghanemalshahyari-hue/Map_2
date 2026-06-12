/* shell/scenario-runner.js
 * ───────────────────────────────────────────────────────────────────────────
 * Canonical scenario RUN dispatcher + the single client-side PREVIEW playback
 * engine for RMOOZ.
 *
 * WHY THIS EXISTS
 * The same scenario (especially Wargame 3) animated differently depending on
 * which button was pressed, because several synthetic "play / step / start"
 * controls each owned their OWN timer and step model:
 *   • workspace ▶ Play / nav  (its own setInterval)
 *   • bottom transport bar     (a SECOND setInterval) — and it ALSO woke the
 *                              movement-playback rAF tween, so one click ran
 *                              two engines racing on the same step cursor.
 *   • turn-engine "Start"      (applyStepProgress, hard-capped at 11 steps).
 * They wrote one shared cursor (window.RmoozScenario.stepIndex) from three
 * uncoordinated writers. This module is the ONE engine they now share:
 *   • a single timer (no competing intervals / rAF loops),
 *   • scenario-length-aware (reads RmoozScenario.scenario.steps.length — no
 *     hard-coded ceiling),
 *   • one step cursor (window.RmoozScenario.stepIndex),
 *   • one render seam: the registered preview renderer (the workspace's
 *     goToStep, which moves markers via AppAdjudicatorMap.applyStepProgress and
 *     repaints the step-aware cards). When no renderer is registered it falls
 *     back to a minimal renderer (move markers + write the cursor) so a drawn
 *     scenario still animates consistently without the workspace panel.
 *
 * MODES (runScenarioCanonical):
 *   • 'preview' — THIS client engine. Read-only: it only moves marker positions
 *     and the step cursor. It is NOT adjudicated (no losses / force-ratio /
 *     server outcomes). Used by Play / step / transport / turn-engine Start.
 *   • 'live'    — DELEGATED to the registered live runner (the server-adjudicated
 *     Wargame HUD: Run trial / Next step → applyState). This module never calls
 *     the server itself; it only routes. That keeps the locked AI/sim boundary
 *     intact (the scenario-workspace flow stays client-side).
 *
 * Read-only by design: no scenario mutation, no backend, no storage. The only
 * write is window.RmoozScenario.stepIndex (via the renderer), the one allowed
 * write that already existed.
 * ───────────────────────────────────────────────────────────────────────────
 */
(function () {
    'use strict';

    var _timer = null;
    var _playing = false;
    var _speedMs = 2000;
    var _previewRenderer = null; // fn(stepIndex) — registered by the workspace (goToStep)
    var _liveRunner = null;      // fn({startStep,sourceButton}) — registered by the HUD (runOneTrial)
    var _bound = false;

    function _doc() { return (typeof document !== 'undefined') ? document : null; }
    function _win() { return (typeof window !== 'undefined') ? window : null; }
    function _scenario() {
        var w = _win();
        return (w && w.RmoozScenario && w.RmoozScenario.scenario) || null;
    }
    function stepCount() {
        var s = _scenario();
        return (s && Array.isArray(s.steps)) ? s.steps.length : 0;
    }
    function curStep() {
        var w = _win();
        var i = w && w.RmoozScenario ? Number(w.RmoozScenario.stepIndex) : 0;
        return isFinite(i) ? i : 0;
    }

    function _emit(name, detail) {
        var d = _doc();
        if (!d || typeof d.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
        try {
            var payload = { event: name };
            if (detail) { for (var k in detail) { if (Object.prototype.hasOwnProperty.call(detail, k)) payload[k] = detail[k]; } }
            d.dispatchEvent(new CustomEvent('rmooz:scenario-run', { detail: payload }));
        } catch (_) { /* no-op */ }
    }

    // Render step N through the registered preview renderer (the workspace's
    // goToStep). Clamps to [0, stepCount-1]. Minimal fallback when unregistered.
    function _renderPreview(i) {
        var n = stepCount();
        var idx = Math.max(0, Math.min(n ? n - 1 : 0, i | 0));
        if (typeof _previewRenderer === 'function') {
            try { _previewRenderer(idx); } catch (_) { /* no-op */ }
        } else {
            var w = _win();
            if (w && w.RmoozScenario) w.RmoozScenario.stepIndex = idx;
            try {
                if (w && w.AppAdjudicatorMap && typeof w.AppAdjudicatorMap.applyStepProgress === 'function') {
                    w.AppAdjudicatorMap.applyStepProgress(idx, 1);
                }
            } catch (_) { /* no-op */ }
        }
        return idx;
    }

    function pause() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        if (_playing) { _playing = false; _emit('pause', { stepIndex: curStep() }); }
    }

    function seek(i) {
        pause();
        var idx = _renderPreview(i);
        _emit('seek', { stepIndex: idx, stepCount: stepCount() });
        return idx;
    }

    function stepBy(d) { return seek(curStep() + (d | 0)); }

    function setSpeed(ms) {
        var v = Number(ms);
        if (isFinite(v) && v > 0) {
            _speedMs = Math.max(60, Math.round(v));
            if (_playing) { if (_timer) { clearInterval(_timer); _timer = null; } _spin(); }
        }
        return _speedMs;
    }

    function _spin() {
        _timer = setInterval(function () {
            var n = stepCount();
            var cur = curStep();
            if (!n || cur >= n - 1) { pause(); _emit('ended', { stepIndex: cur }); return; }
            _renderPreview(cur + 1);
            var now = curStep();
            _emit('step', { stepIndex: now, stepCount: n });
            if (now >= n - 1) { pause(); _emit('ended', { stepIndex: now }); }
        }, _speedMs);
    }

    function play() {
        var n = stepCount();
        if (!n) return false;
        if (curStep() >= n - 1) return false; // already at last step
        pause();                              // single-timer guarantee
        _playing = true;
        _emit('play', { stepIndex: curStep(), stepCount: n });
        _spin();
        return true;
    }

    function toggle() { return _playing ? (pause(), false) : play(); }

    // ── The canonical dispatcher ──────────────────────────────────────────────
    function runScenarioCanonical(opts) {
        opts = opts || {};
        var mode = (opts.mode === 'live') ? 'live' : 'preview';
        var start = (typeof opts.startStep === 'number' && isFinite(opts.startStep)) ? (opts.startStep | 0) : curStep();
        if (mode === 'live') {
            if (typeof _liveRunner === 'function') {
                _emit('live-run', { startStep: start, sourceButton: opts.sourceButton || null });
                try { _liveRunner({ startStep: start, sourceButton: opts.sourceButton || null }); } catch (_) { /* no-op */ }
                return { mode: 'live', startStep: start, dispatched: true };
            }
            // Do NOT silently fall back to preview — preview is not adjudicated,
            // and pretending it is would re-introduce the inconsistency.
            _emit('live-unavailable', { startStep: start });
            return { mode: 'live', startStep: start, dispatched: false };
        }
        seek(start);
        if (opts.autoplay !== false) play();
        return { mode: 'preview', startStep: start, dispatched: true };
    }

    // Single bottom-transport listener. Replaces the workspace + movement-playback
    // listeners (which both fired on one click and raced). Those two now defer to
    // this module when present (they check window.AppScenarioRunner).
    function _onTransport(e) {
        var action = e && e.detail && e.detail.action;
        var value = e && e.detail && e.detail.value;
        if (!stepCount()) return; // only drive a loaded scenario
        switch (action) {
            case 'play': play(); break;
            case 'pause': pause(); break;
            case 'step-forward': stepBy(1); break;
            case 'step-back': stepBy(-1); break;
            case 'speed-changed': {
                var sp = parseFloat(value);
                if (isFinite(sp) && sp > 0) setSpeed(2000 / sp); // transport value is a multiplier
                break;
            }
            default: break;
        }
    }

    function _bindTransport() {
        var d = _doc();
        if (d && !_bound) { d.addEventListener('rmooz:timeline-ui-action', _onTransport); _bound = true; }
    }

    var API = {
        runScenarioCanonical: runScenarioCanonical,
        play: play,
        pause: pause,
        toggle: toggle,
        seek: seek,
        stepBy: stepBy,
        setSpeed: setSpeed,
        isPlaying: function () { return _playing; },
        curStep: curStep,
        stepCount: stepCount,
        registerPreviewRenderer: function (fn) { if (typeof fn === 'function') _previewRenderer = fn; },
        registerLiveRunner: function (fn) { if (typeof fn === 'function') _liveRunner = fn; },
        hasLiveRunner: function () { return typeof _liveRunner === 'function'; },
        isBound: function () { return _bound; },
        _bindTransport: _bindTransport,
        _onTransport: _onTransport // test hook
    };

    if (typeof window !== 'undefined') { window.AppScenarioRunner = API; _bindTransport(); }
    if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})();
