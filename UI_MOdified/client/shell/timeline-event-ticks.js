/**
 * Operational shell — Timeline Event Ticks (VIS1, read-only).
 *
 * Renders a thin per-step tick track directly under the timeline transport
 * (#timeline-strip), marking the steps that carry events (engagement_arcs /
 * affected) and highlighting the current step. PURE VISUALIZATION:
 *   - Reads ONLY window.RmoozScenario.{scenario.steps, stepIndex}.
 *   - NEVER mutates the scenario, stepIndex, map, or any backend; no clicks
 *     that change state (matches the read-only-surface philosophy).
 *   - One <span.tl-tick> per step; steps with events get .has-events; the
 *     current step gets .is-current. Per-segment tooltip via i18n.
 *   - Reconciles on a light dirty-checked poll + rmooz:playback-tick, so it
 *     tracks both manual step-nav and playback without a dedicated event
 *     (none exists). Dirty-check keeps it cheap — rebuild only on scenario
 *     change, re-highlight only on step change.
 *
 * VIS1 ground-truth: the on-map phase label (SITREP) and the before/after
 * step-compare already exist — this is the only missing VIS1 piece.
 *
 * Bridge: window.AppShellTimelineEventTicks { refresh, getState }
 */
(function () {
    'use strict';

    var TRACK_ID = 'tl-event-ticks';
    var POLL_MS  = 500;

    var track         = null;
    var lastSig       = null;   // scenario identity + step count
    var lastStepIndex = -1;

    function t(key, fallback) {
        if (typeof window.t === 'function') {
            var v = window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    // Read-only view of the live scenario slot, or null when none is loaded.
    function slot() {
        var s = window.RmoozScenario;
        if (!s || typeof s !== 'object') return null;
        var scn = s.scenario;
        if (!scn || !Array.isArray(scn.steps) || !scn.steps.length) return null;
        return { scn: scn, steps: scn.steps, stepIndex: (typeof s.stepIndex === 'number' ? s.stepIndex : 0) };
    }

    function eventsForStep(step) {
        if (!step || typeof step !== 'object') return 0;
        var a = Array.isArray(step.engagement_arcs) ? step.engagement_arcs.length : 0;
        var b = Array.isArray(step.affected) ? step.affected.length : 0;
        return a + b;
    }

    function ensureTrack() {
        if (track && document.body && document.body.contains(track)) return track;
        var strip = document.getElementById('timeline-strip');
        if (!strip) return null;
        track = document.createElement('div');
        track.id = TRACK_ID;
        track.className = 'tl-event-ticks is-empty';
        track.setAttribute('role', 'group');
        track.setAttribute('aria-label', t('tl-ticks-aria', 'Timeline events by step'));
        strip.insertAdjacentElement('afterend', track);
        return track;
    }

    function sigOf(s) {
        var id = (s.scn.scenario_id || s.scn.scenario_label || s.scn.name || '');
        return id + '::' + s.steps.length;
    }

    function buildTicks(s) {
        var el = ensureTrack();
        if (!el) return;
        while (el.firstChild) el.removeChild(el.firstChild);
        el.setAttribute('aria-label', t('tl-ticks-aria', 'Timeline events by step'));
        var n = s.steps.length;
        for (var i = 0; i < n; i++) {
            var count = eventsForStep(s.steps[i]);
            var seg = document.createElement('span');
            seg.className = 'tl-tick' + (count > 0 ? ' has-events' : '');
            seg.setAttribute('data-step', String(i));
            if (count > 0) seg.setAttribute('data-count', String(count));
            var phase = (s.steps[i] && s.steps[i].phase) ? (' · ' + s.steps[i].phase) : '';
            var label = (count > 0)
                ? t('tl-ticks-step-events', 'Step {n}: {c} event(s)')
                : t('tl-ticks-step-none', 'Step {n}: no events');
            label = label.replace('{n}', String(i + 1)).replace('{c}', String(count));
            seg.title = label + phase;
            el.appendChild(seg);
        }
    }

    function highlight(idx) {
        if (!track) return;
        var prev = track.querySelector('.tl-tick.is-current');
        if (prev) prev.classList.remove('is-current');
        var cur = track.querySelector('.tl-tick[data-step="' + idx + '"]');
        if (cur) cur.classList.add('is-current');
    }

    function reconcile() {
        var el = ensureTrack();
        if (!el) return;
        var s = slot();
        if (!s) {
            if (lastSig !== null) { while (el.firstChild) el.removeChild(el.firstChild); }
            el.classList.add('is-empty');
            lastSig = null; lastStepIndex = -1;
            return;
        }
        el.classList.remove('is-empty');
        var sig = sigOf(s);
        if (sig !== lastSig) { buildTicks(s); lastSig = sig; lastStepIndex = -1; }
        if (s.stepIndex !== lastStepIndex) { highlight(s.stepIndex); lastStepIndex = s.stepIndex; }
    }

    function init() {
        if (!document.getElementById('timeline-strip')) return;
        ensureTrack();
        reconcile();
        // Snappy during playback; the poll covers manual step-nav + scenario
        // load (no dedicated step-change event exists). Dirty-checked = cheap.
        document.addEventListener('rmooz:playback-tick', function () { try { reconcile(); } catch (_) {} });
        setInterval(function () { try { reconcile(); } catch (_) {} }, POLL_MS);
        // Repaint tooltips/aria on EN<->AR switch.
        var prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { lastSig = null; lastStepIndex = -1; reconcile(); } catch (_) {}
            if (typeof prev === 'function') { try { prev(lang); } catch (_) {} }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellTimelineEventTicks = {
        refresh: function () { try { lastSig = null; lastStepIndex = -1; reconcile(); } catch (_) {} },
        getState: function () {
            var s = slot();
            return {
                steps:      s ? s.steps.length : 0,
                stepIndex:  s ? s.stepIndex : null,
                eventSteps: s ? s.steps.filter(function (st) { return eventsForStep(st) > 0; }).length : 0
            };
        }
    };
})();
