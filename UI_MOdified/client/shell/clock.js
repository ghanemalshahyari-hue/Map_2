/**
 * Operational shell — Zulu DTG + local clock.
 *
 * PR-1 (Operational Shell Foundation). No behavior dependencies; pure
 * presentation. Writes into footer status-bar elements by id:
 *   #clock-zulu-dtg   → DDHHMM[Z]MMMYY    e.g. 261432ZMAY26
 *   #clock-local      → HH:MM:SS          24-hour, local timezone
 *
 * CPU saver: the 1-second interval is cleared on visibilitychange when
 * the tab is hidden and re-armed when it becomes visible.
 *
 * Bridge name: window.AppShellClock (idempotent — re-importing the
 * module clears the previous interval before starting a new one).
 */
(function () {
    'use strict';

    const MONTHS_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function formatZuluDtg(d) {
        // Standard military DTG: DDHHMM[Z]MMMYY
        const dd  = pad2(d.getUTCDate());
        const hh  = pad2(d.getUTCHours());
        const mm  = pad2(d.getUTCMinutes());
        const mon = MONTHS_UPPER[d.getUTCMonth()];
        const yy  = pad2(d.getUTCFullYear() % 100);
        return `${dd}${hh}${mm}Z${mon}${yy}`;
    }

    function formatLocal(d) {
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    }

    function tick() {
        const now = new Date();
        const zEl = document.getElementById('clock-zulu-dtg');
        const lEl = document.getElementById('clock-local');
        if (zEl) zEl.textContent = formatZuluDtg(now);
        if (lEl) lEl.textContent = formatLocal(now);
    }

    let intervalId = null;
    function start() {
        if (intervalId != null) return;   // already running
        tick();
        intervalId = setInterval(tick, 1000);
    }
    function stop() {
        if (intervalId == null) return;
        clearInterval(intervalId);
        intervalId = null;
    }

    // Idempotent: if a previous module instance is still running (hot
    // reload, re-import via dev tools), clear before starting.
    if (window.AppShellClock && typeof window.AppShellClock.stop === 'function') {
        try { window.AppShellClock.stop(); } catch (_) { /* ignore */ }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') start();
        else stop();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.AppShellClock = {
        start,
        stop,
        tickNow: tick,
        formatZuluDtg,
        formatLocal,
    };
})();
