/* ============================================================================
 * movement-playback.js — RMOOZ PR-MOVE1: continuous movement + playback clock
 * ----------------------------------------------------------------------------
 * Direction reset 2026-06-01 ([[project_rmooz_direction_reset]]): make movement
 * feel like a real scenario / like CMO — units GLIDE along their course over
 * time, instead of teleporting between per-step snapshots.
 *
 * WHY THIS APPROACH: the renderer positions W3 units by INTEGER step
 * (applyStepProgress moves markers only when the step index changes; fractional
 * progress does not interpolate unit positions — verified). Rather than rewire
 * the computed red/blue position models, this controller tweens between the
 * renderer's OWN integer-step positions:
 *   per segment k → k+1:
 *     1. applyStepProgress(k+1,0) → snapshot every marker's "arrival" position
 *     2. applyStepProgress(k,0)   → snapshot "departure" position + leave the
 *        renderer's visuals (attrition/pins/trails/phase-line) at step k
 *     3. over wall-clock, setLatLng(lerp(depart, arrive, frac)) every frame
 *     4. on arrival, applyStepProgress(k+1,0) snaps visuals to the new step
 * Steps 1–2 run synchronously in one tick → no visible flicker. The tween
 * exactly honors W3's movement story (armor pushes, arty hangs back, …) because
 * the endpoints ARE the renderer's computed positions.
 *
 * SAFETY (must not break Wargame 3):
 *   - Calls ONLY public AppAdjudicatorMap.applyStepProgress / getScenarioMarkers
 *     / isScenarioDrawn. Does NOT modify adjudicator-map, does NOT call applyState
 *     (HUD still owns server-driven state), does NOT mutate the scenario.
 *   - Runs only while playing; idle otherwise. No-op if map/scenario not ready.
 *   - With playback off, the app behaves exactly as before.
 * ========================================================================== */
(function () {
    'use strict';

    var BASE_STEP_MS = 4000;                 // wall-clock per segment at x1
    var SPEED = { '1': 1, '4': 4, '30': 30 };

    var playing = false, segStart = 0, frac = 0, speedMult = 1;
    var rafId = null, lastTs = null;
    var markers = [];                        // captured marker objects (stable refs)
    var depart = [], arrive = [];            // [lat,lng] per marker for current segment

    function scn() { return (window.RmoozScenario && window.RmoozScenario.scenario) || null; }
    function stepCount() { var s = scn(); return (s && Array.isArray(s.steps)) ? s.steps.length : 0; }
    function maxSegStart() { return Math.max(0, stepCount() - 2); }   // last k with a k→k+1 segment
    function stepDurationMs() { return BASE_STEP_MS / (SPEED[String(speedMult)] || 1); }
    function MAP() { return window.AppAdjudicatorMap; }
    function mapReady() {
        var m = MAP();
        return !!(m && typeof m.applyStepProgress === 'function' &&
                  typeof m.getScenarioMarkers === 'function' &&
                  (typeof m.isScenarioDrawn !== 'function' || m.isScenarioDrawn()));
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function emit(name, detail) { try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (_) {} }
    function publishStep(i) { if (window.RmoozScenario) window.RmoozScenario.stepIndex = i; }

    function captureMarkers() {
        var mk = MAP().getScenarioMarkers() || { red: [], blue: [] };
        markers = (mk.red || []).concat(mk.blue || []);
    }
    function snapshot() {
        return markers.map(function (m) { try { var p = m.getLatLng(); return [p.lat, p.lng]; } catch (_) { return null; } });
    }
    // Build depart/arrive endpoints for segment k → k+1 (synchronous: no flicker).
    function computeSegment(k) {
        var m = MAP();
        try { m.applyStepProgress(k + 1, 0); } catch (_) {}
        arrive = snapshot();
        try { m.applyStepProgress(k, 0); } catch (_) {}   // leaves visuals at departing step k
        depart = snapshot();
        renderFrac(0);
    }
    function renderFrac(t) {
        for (var i = 0; i < markers.length; i++) {
            var a = depart[i], b = arrive[i];
            if (!a || !b) continue;
            try { markers[i].setLatLng([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); } catch (_) {}
        }
    }

    function frame(ts) {
        if (!playing) { rafId = null; return; }
        if (lastTs == null) lastTs = ts;
        var dt = ts - lastTs; lastTs = ts;
        frac += dt / stepDurationMs();

        while (frac >= 1) {
            frac -= 1;
            if (segStart >= maxSegStart()) {              // arrived at the final step
                renderFrac(1);
                try { MAP().applyStepProgress(maxSegStart() + 1, 0); } catch (_) {}
                publishStep(maxSegStart() + 1);
                frac = 1; pause(true); return;
            }
            segStart += 1;
            publishStep(segStart);
            computeSegment(segStart);                     // next segment endpoints + visuals→segStart
        }
        renderFrac(frac);
        emit('rmooz:playback-tick', { step: segStart, progress: +frac.toFixed(3) });
        rafId = requestAnimationFrame(frame);
    }

    /* ---- controls --------------------------------------------------------- */
    function play() {
        if (playing) return;
        if (stepCount() < 2 || !mapReady()) return;
        captureMarkers();
        var cur = (window.RmoozScenario && Number.isFinite(window.RmoozScenario.stepIndex))
                  ? window.RmoozScenario.stepIndex : 0;
        if (cur >= maxSegStart() + 1) cur = 0;            // at the end → restart
        segStart = Math.max(0, Math.min(maxSegStart(), cur));
        frac = 0; lastTs = null;
        computeSegment(segStart);
        playing = true; syncButtons();
        emit('rmooz:playback-state-changed', { playing: true, step: segStart });
        rafId = requestAnimationFrame(frame);
    }
    function pause(reachedEnd) {
        if (!playing && !reachedEnd) return;
        playing = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        lastTs = null; syncButtons();
        emit('rmooz:playback-state-changed', { playing: false, step: segStart, ended: !!reachedEnd });
    }
    function setStep(idx) {
        var n = stepCount(); var i = Math.max(0, Math.min(n ? n - 1 : 0, idx | 0));
        segStart = Math.min(maxSegStart(), i); frac = 0; lastTs = null;
        publishStep(i);
        try { if (mapReady()) MAP().applyStepProgress(i, 0); } catch (_) {}
    }
    function setSpeed(mult) { if (SPEED[String(mult)]) speedMult = Number(mult); }

    function syncButtons() {
        var p = document.getElementById('tl-play'), q = document.getElementById('tl-pause');
        if (p) { p.classList.toggle('is-active', playing);  p.setAttribute('aria-pressed', String(playing)); }
        if (q) { q.classList.toggle('is-active', !playing); q.setAttribute('aria-pressed', String(!playing)); }
    }

    /* ---- wire to the existing transport bar ------------------------------- */
    document.addEventListener('rmooz:timeline-ui-action', function (e) {
        // The canonical runner (shell/scenario-runner.js) owns the bottom
        // transport when present — it is the single preview engine. Defer to it
        // so one Play click never runs this rAF tween AND the runner's timer at
        // the same time (the old multi-engine race on RmoozScenario.stepIndex).
        if (window.AppScenarioRunner) return;
        var d = (e && e.detail) || {};
        if (d.action === 'play') play();
        else if (d.action === 'pause') pause();
        else if (d.action === 'speed-changed') setSpeed(d.value);
    });

    /* ======================================================================
     * Step-transition glide — the universal fix.
     * The HUD renders EVERY step via AppAdjudicatorMap.applyState(); by default
     * markers snap to the new step's coords. We wrap applyState so that on a
     * normal +1 step advance (Next button / auto-adjudicate) the markers TWEEN
     * from their previous positions to the new ones — gliding no matter which
     * control triggered the step. Big jumps (scrub/reset) and transport playback
     * snap as before. If rAF never runs, it simply rests at the new positions —
     * i.e. it can never be worse than today's snap.
     * ==================================================================== */
    var STEP_GLIDE_MS = 700;
    var lastAppliedStep = null, stepAnimRaf = null;

    function muid(m) {
        return (m && ((m._wgRedMeta && m._wgRedMeta.uid) || (m._wgBlueMeta && m._wgBlueMeta.uid))) || null;
    }
    function snapPos() {                                  // uid → [lat,lng], robust to marker recreation
        var mk = MAP().getScenarioMarkers() || { red: [], blue: [] };
        var out = {};
        mk.red.concat(mk.blue).forEach(function (m) {
            var id = muid(m); if (!id) return;
            try { var p = m.getLatLng(); out[id] = [p.lat, p.lng]; } catch (_) {}
        });
        return out;
    }
    function glideBetween(before, after, dur) {
        if (stepAnimRaf) { cancelAnimationFrame(stepAnimRaf); stepAnimRaf = null; }
        var t0 = null;
        function step(ts) {
            if (t0 == null) t0 = ts;
            var k = Math.min(1, (ts - t0) / dur);
            var mk = MAP().getScenarioMarkers() || { red: [], blue: [] };
            mk.red.concat(mk.blue).forEach(function (m) {
                var id = muid(m); if (!id) return;
                var a = before[id], b = after[id]; if (!a || !b) return;
                try { m.setLatLng([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); } catch (_) {}
            });
            stepAnimRaf = (k < 1) ? requestAnimationFrame(step) : null;
        }
        stepAnimRaf = requestAnimationFrame(step);
    }
    function installStepGlide() {
        var m = MAP();
        if (!m || typeof m.applyState !== 'function' || m.__moveGlideWrapped) return;
        var orig = m.applyState;
        m.applyState = function (state) {
            var newStep = (state && Number.isFinite(state.step_index)) ? state.step_index : null;
            var doAnim = !playing && STEP_GLIDE_MS > 0 &&
                         lastAppliedStep != null && newStep != null && newStep === lastAppliedStep + 1;
            var before = doAnim ? snapPos() : null;
            var r = orig.apply(this, arguments);          // original snaps markers + all visuals
            if (doAnim) { try { glideBetween(before, snapPos(), STEP_GLIDE_MS); } catch (_) {} }
            if (newStep != null) lastAppliedStep = newStep;
            return r;
        };
        m.__moveGlideWrapped = true;
    }
    // Install as soon as the map module is present (and again on DOM ready as a safety net).
    installStepGlide();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installStepGlide, { once: true });
    }

    window.AppMovementPlayback = {
        play: play, pause: pause, toggle: function () { playing ? pause() : play(); },
        setStep: setStep, getStep: function () { return segStart; },
        setSpeed: setSpeed, isPlaying: function () { return playing; },
        getProgress: function () { return frac; },
        // expose for tuning / debugging the step-transition glide
        setGlideMs: function (ms) { STEP_GLIDE_MS = Math.max(0, ms | 0); },
        _installStepGlide: installStepGlide
    };
})();
