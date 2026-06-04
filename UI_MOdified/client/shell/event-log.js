/**
 * Operational shell — Event Log.
 *
 * PR-4 introduced the panel as a static placeholder.
 * PR-6 connects it to a small local shell event bus. The Event Log
 * now receives safe UI/system events through `AppShellEventLog.append(event)`
 * and via subscriptions to a *closed* set of shell-only events:
 *
 *     rmooz:view-side-changed        (side-picker.js, PR-1)
 *     rmooz:unit-selected            (units-map.js,   PR-2/3)
 *     rmooz:unit-deselected          (units-map.js,   PR-2/3)
 *     rmooz:timeline-ui-action       (timeline.js,    PR-5/6 — UI only)
 *     internal collapse / expand     (this module)
 *
 * This is intentionally NOT a journal subscriber. There is no
 * sim/AI/scenario hookup, no backend POST, no localStorage row write,
 * no journal file write. Categories accepted by `append()` are
 * locked to the closed set { SYSTEM, OPERATOR, UI } — combat,
 * detection, engagement, casualty, weapon, sensor, fog-of-war, ROE,
 * AI-recommendation events cannot reach the log through this surface.
 *
 * Public bridge:
 *   window.AppShellEventLog.append(event)   – add a row (in-memory)
 *   window.AppShellEventLog.getRows()       – read a copy of the rows
 *   window.AppShellEventLog.clear()         – wipe rows (used for tests)
 *   window.AppShellEventLog.rerender()      – manual re-render
 *   window.AppShellEventLog.setCollapsed()  – legacy collapse setter
 *   window.AppShellEventLog.isCollapsed()
 *   window.AppShellEventLog.SEVERITY        – { INFO, NOTICE, WARNING, CRITICAL }
 *   window.AppShellEventLog.CATEGORY        – { SYSTEM, OPERATOR, UI, ... }
 *   window.AppShellEventLog.ALLOWED_CATEGORIES – the closed set above
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'rmooz.eventLog.collapsed';
    const MAX_ROWS    = 100;                          // PR-6: keep tail bounded; oldest drops

    // Severity tokens — closed set. Lowercased class suffix matches the
    // CSS chips in style.css.
    const SEVERITY = {
        INFO:     'info',
        NOTICE:   'notice',
        WARNING:  'warning',
        CRITICAL: 'critical',
    };
    const SEVERITY_SET = new Set(Object.values(SEVERITY));

    // Category tokens — broader vocabulary kept for forward compat
    // (CSS already styles each cat color). PR-6 only ACCEPTS the
    // ALLOWED_CATEGORIES subset through append().
    const CATEGORY = {
        SYSTEM:   'SYSTEM',
        OPERATOR: 'OPERATOR',
        UI:       'UI',
        SCENARIO: 'SCENARIO',
        AI:       'AI',
        SIM:      'SIM',
        WARNING:  'WARNING',
    };
    const ALLOWED_CATEGORIES = new Set([
        CATEGORY.SYSTEM,
        CATEGORY.OPERATOR,
        CATEGORY.UI,
    ]);

    // ── Helpers ────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    function tr(key, fallback, args) {
        if (typeof window.t === 'function' && key) {
            const v = args && args.length
                ? window.t(key, ...args)
                : window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    function formatDtg(d) {
        if (window.AppShellClock && typeof window.AppShellClock.formatZuluDtg === 'function') {
            try { return window.AppShellClock.formatZuluDtg(d); } catch (_) { /* fall through */ }
        }
        return d.toISOString();
    }

    let rows = [];

    // ── Append API (PR-6) ──────────────────────────────────────────
    // Validates the event shape, enforces the closed category set,
    // adds Zulu DTG when missing, prepends to the rows array (newest
    // first), trims to MAX_ROWS (oldest drops from the END), then
    // re-renders. Returns the row object that was inserted, or null
    // if the event was rejected.
    //
    // PR-6 invariants:
    //   - in-memory only (no fetch, no file write, no DB write)
    //   - closed category set (combat / sensor / AI events cannot
    //     reach the log through this surface)
    //   - never throws (silent rejection on invalid input)
    function append(evt) {
        if (!evt || typeof evt !== 'object') return null;

        // Category gate — the only event-source filter in this PR.
        const cat = String(evt.category || '').toUpperCase();
        if (!ALLOWED_CATEGORIES.has(cat)) {
            // Stay quiet in production. Useful breadcrumb during dev.
            try { console.warn('[event-log] rejected category', evt.category); } catch (_) {}
            return null;
        }
        const sev = String(evt.severity || '').toLowerCase();
        if (!SEVERITY_SET.has(sev)) {
            try { console.warn('[event-log] rejected severity', evt.severity); } catch (_) {}
            return null;
        }

        const msgKey      = (typeof evt.messageKey === 'string' && evt.messageKey) ? evt.messageKey : null;
        const msgArgs     = Array.isArray(evt.messageArgs) ? evt.messageArgs.slice() : [];
        const msgFallback = typeof evt.message === 'string' ? evt.message : '';
        if (!msgKey && !msgFallback) {
            try { console.warn('[event-log] rejected: no message and no messageKey'); } catch (_) {}
            return null;
        }

        const row = {
            time:        (typeof evt.time === 'string' && evt.time) ? evt.time : formatDtg(new Date()),
            severity:    sev,
            category:    cat,
            source:      String(evt.source || '').slice(0, 40) || 'shell',
            msgKey:      msgKey,
            msgArgs:     msgArgs,
            msgFallback: msgFallback,
            // payload is captured but NEVER rendered or persisted.
            // Kept on the row only so future PRs can read structured
            // detail (unit-id, side label, button id, etc.) without
            // changing the contract. Strings only — defensive copy.
            payload:     (evt.payload && typeof evt.payload === 'object') ? safePayload(evt.payload) : null,
        };

        rows.unshift(row);
        if (rows.length > MAX_ROWS) rows.length = MAX_ROWS;

        renderRows();
        return row;
    }

    function safePayload(p) {
        // One-level shallow copy with primitive values only — no nested
        // objects, no function references, no DOM nodes. Defensive: keeps
        // the row payload from accidentally retaining map/units/state.
        const out = {};
        for (const k of Object.keys(p)) {
            const v = p[k];
            if (v == null) out[k] = null;
            else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
            // skip anything else (objects, arrays, fns)
        }
        return out;
    }

    function clear() { rows = []; renderRows(); }

    // ── Render ─────────────────────────────────────────────────────
    function renderRows() {
        const tbody = $('event-log-rows');
        if (!tbody) return;
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        if (!rows.length) {
            const empty = $('event-log-empty');
            if (empty) empty.removeAttribute('hidden');
            return;
        }
        const empty = $('event-log-empty');
        if (empty) empty.setAttribute('hidden', '');

        const frag = document.createDocumentFragment();
        for (const r of rows) {
            const tr_ = document.createElement('tr');
            tr_.setAttribute('data-cat', r.category);
            tr_.setAttribute('data-sev', r.severity);

            const tdT = document.createElement('td');
            tdT.className = 'elog-time';
            tdT.setAttribute('dir', 'ltr');
            tdT.textContent = r.time;
            tr_.appendChild(tdT);

            const tdS = document.createElement('td');
            tdS.className = 'elog-severity';
            const chip = document.createElement('span');
            chip.className = `elog-sev elog-sev--${r.severity}`;
            chip.textContent = tr('elog-sev-' + r.severity, r.severity.toUpperCase());
            tdS.appendChild(chip);
            tr_.appendChild(tdS);

            const tdC = document.createElement('td');
            tdC.className = 'elog-category';
            tdC.textContent = tr('elog-cat-' + r.category.toLowerCase(), r.category);
            tr_.appendChild(tdC);

            const tdSrc = document.createElement('td');
            tdSrc.className = 'elog-source';
            tdSrc.setAttribute('dir', 'ltr');
            tdSrc.textContent = r.source;
            tr_.appendChild(tdSrc);

            const tdM = document.createElement('td');
            tdM.className = 'elog-message';
            // PR-6: resolve deferred i18n args at render time so a
            // language switch re-localizes parameters that come from
            // the i18n dictionary (e.g. side label "BLUE"/"عرض أزرق",
            // phase label "Phase 1"/"المرحلة 1"). An arg is treated as
            // deferred when it's an object with `.key`. Plain strings
            // (unit names, speed numbers, etc.) pass through unchanged.
            const resolvedArgs = (r.msgArgs || []).map(a => {
                if (a && typeof a === 'object' && typeof a.key === 'string') {
                    return tr(a.key, (a.fallback != null ? String(a.fallback) : ''));
                }
                return a;
            });
            tdM.textContent = tr(r.msgKey, r.msgFallback, resolvedArgs);
            tr_.appendChild(tdM);

            frag.appendChild(tr_);
        }
        tbody.appendChild(frag);
    }

    // ── Collapse / expand ──────────────────────────────────────────
    function isCollapsed() {
        return $('event-log')?.classList.contains('event-log--collapsed') || false;
    }

    function setCollapsed(collapsed, opts) {
        const panel = $('event-log');
        const btn   = $('event-log-toggle');
        if (!panel) return;
        const wasCollapsed = panel.classList.contains('event-log--collapsed');
        if (collapsed) panel.classList.add('event-log--collapsed');
        else           panel.classList.remove('event-log--collapsed');
        if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (!opts || opts.persist !== false) {
            try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (_) { /* ignore quota */ }
        }
        const invalidate = () => {
            try { window.map?.invalidateSize?.(); } catch (_) { /* ignore */ }
        };
        setTimeout(invalidate, 220);

        // PR-6: log the user-driven collapse/expand transition. The
        // initial-paint call (persist:false) and no-op re-sets are
        // suppressed so the log isn't spammed at startup.
        if (opts && opts.suppressLog === true) return;
        if (wasCollapsed === !!collapsed) return;
        if (!opts || opts.persist !== false) {
            append({
                severity:   SEVERITY.INFO,
                category:   CATEGORY.UI,
                source:     'event-log',
                messageKey: collapsed ? 'elog-evt-elog-collapsed' : 'elog-evt-elog-expanded',
                message:    collapsed ? 'Event Log collapsed' : 'Event Log expanded',
            });
        }
    }

    function toggleCollapsed() {
        setCollapsed(!isCollapsed());
    }

    function readPersistedCollapsed() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            if (v === '1') return true;
            if (v === '0') return false;
        } catch (_) { /* ignore */ }
        return false;
    }

    // ── Language change re-render ──────────────────────────────────
    function bindLanguageChain() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { renderRows(); } catch (_) { /* don't break chain */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    function bindToggle() {
        const btn = $('event-log-toggle');
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleCollapsed();
        });
    }

    // ── Safe shell event subscribers (PR-6) ────────────────────────
    // Each handler reads ONLY what's in the event detail; no DOM
    // queries against scenario/AI/units state, no map calls, no
    // backend lookups. Severity stays at INFO/NOTICE — we never
    // synthesize WARNING/CRITICAL here (those belong to real
    // operational signals from later PRs).
    function sideLabelKey(side) {
        const s = String(side || '').toUpperCase();
        if (s === 'BLUE') return 'side-picker-blue';
        if (s === 'RED')  return 'side-picker-red';
        if (s === 'GOD')  return 'side-picker-god';
        return null;
    }
    function sideLabel(side) {
        // Side codes (BLUE / RED / GOD) are NATO-style identifiers and
        // stay as literal uppercase tokens in the event log — same as
        // they appear on the side-picker pill and elsewhere in the
        // operational shell. No translation; same string under EN/AR.
        return String(side || '').toUpperCase() || '—';
    }
    function sideLabelArg(side) {
        // Plain string arg — does not need deferred i18n resolution
        // because the value is locale-neutral.
        return sideLabel(side);
    }

    function bindShellEvents() {
        // Side change
        document.addEventListener('rmooz:view-side-changed', (e) => {
            const side = e && e.detail && e.detail.side;
            append({
                severity:    SEVERITY.NOTICE,
                category:    CATEGORY.OPERATOR,
                source:      'side-picker',
                messageKey:  'elog-evt-side-changed',
                messageArgs: [sideLabelArg(side)],
                message:     `Operational view changed to ${String(side || '').toUpperCase()}`,
                payload:     { side: String(side || '').toUpperCase() },
            });
        });

        // Unit selected
        document.addEventListener('rmooz:unit-selected', (e) => {
            const u = e && e.detail && e.detail.unit;
            if (!u) return;
            const name = (u.name && String(u.name).trim()) || tr('up-unknown-name', 'Unnamed unit');
            append({
                severity:    SEVERITY.NOTICE,
                category:    CATEGORY.OPERATOR,
                source:      'units-map',
                messageKey:  'elog-evt-unit-selected',
                messageArgs: [name],
                message:     `Unit selected: ${name}`,
                payload:     { name, side: u.side || null },
            });
        });

        // Unit deselected
        document.addEventListener('rmooz:unit-deselected', () => {
            append({
                severity:   SEVERITY.INFO,
                category:   CATEGORY.OPERATOR,
                source:     'units-map',
                messageKey: 'elog-evt-unit-deselected',
                message:    'Unit deselected',
            });
        });

        // Timeline UI actions — UI-only (never simulation)
        document.addEventListener('rmooz:timeline-ui-action', (e) => {
            const d = (e && e.detail) || {};
            const action = String(d.action || '').toLowerCase();
            const value  = d.value;

            // Map each action onto an i18n key + EN fallback. Anything
            // not in this whitelist is ignored (so a future actor
            // can't smuggle in non-UI semantics).
            const TABLE = {
                'play':           ['elog-evt-tl-play',         'Timeline: Play'],
                'pause':          ['elog-evt-tl-pause',        'Timeline: Pause'],
                'step-back':      ['elog-evt-tl-step-back',    'Timeline: Step Back'],
                'step-forward':   ['elog-evt-tl-step-forward', 'Timeline: Step Forward'],
                'speed-changed':  ['elog-evt-tl-speed',        'Timeline: Speed x{0}'],
                'phase-changed':  ['elog-evt-tl-phase',        'Timeline: Phase {0}'],
            };
            const entry = TABLE[action];
            if (!entry) return;

            let args = [];
            if (action === 'speed-changed') {
                args = [String(value || '1')];
            } else if (action === 'phase-changed') {
                // Resolve phase id → deferred i18n arg so language switch
                // re-localizes the phase name.
                const ID = String(value || 'start');
                const phaseKey = (
                    ID === 'phase1' ? 'tl-phase-1' :
                    ID === 'phase2' ? 'tl-phase-2' :
                    ID === 'end'    ? 'tl-phase-end' :
                                      'tl-phase-start'
                );
                const phaseFallback = ID.toUpperCase();
                args = [{ key: phaseKey, fallback: phaseFallback }];
            }

            // Build the EN fallback by substituting {0}. The arg may be a
            // deferred i18n token (object with `.fallback`); use its
            // English fallback so the EN fallback string is sensible.
            const fbArg0 = (args[0] && typeof args[0] === 'object' && args[0].fallback != null)
                ? String(args[0].fallback)
                : (args[0] != null ? String(args[0]) : '');
            const fb = entry[1].replace('{0}', fbArg0);

            append({
                severity:    SEVERITY.INFO,
                category:    CATEGORY.UI,
                source:      'timeline',
                messageKey:  entry[0],
                messageArgs: args,
                message:     fb,
                payload:     { action, value: value == null ? null : String(value) },
            });
        });
    }

    // ── Init ───────────────────────────────────────────────────────
    function init() {
        if (!$('event-log')) return;

        // Seed a single "shell ready" row via the new append() path so
        // the same code path renders both startup and live events. The
        // PR-4 placeholder set is replaced; the brief explicitly allows
        // either keeping or replacing the placeholders. Choosing
        // replacement keeps the log honest — every visible row is a
        // real shell event.
        rows = [];
        append({
            severity:   SEVERITY.INFO,
            category:   CATEGORY.SYSTEM,
            source:     'shell',
            messageKey: 'elog-evt-shell-ready',
            message:    'Operational shell ready',
        });
        const initialSide = (window.AppShellSidePicker && window.AppShellSidePicker.getSide)
            ? window.AppShellSidePicker.getSide()
            : 'BLUE';
        append({
            severity:    SEVERITY.INFO,
            category:    CATEGORY.OPERATOR,
            source:      'side-picker',
            messageKey:  'elog-evt-side-initial',
            messageArgs: [sideLabelArg(initialSide)],
            message:     `Operational view: ${initialSide}`,
            payload:     { side: initialSide },
        });

        bindToggle();
        bindLanguageChain();
        bindShellEvents();
        // Apply persisted collapsed state without logging the no-op
        // transition (suppressLog) and without re-persisting it.
        setCollapsed(readPersistedCollapsed(), { persist: false, suppressLog: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellEventLog = {
        append,
        getRows:           () => rows.slice(),
        clear,
        rerender:          renderRows,
        setCollapsed,
        isCollapsed,
        SEVERITY:          Object.assign({}, SEVERITY),
        CATEGORY:          Object.assign({}, CATEGORY),
        ALLOWED_CATEGORIES: new Set(ALLOWED_CATEGORIES),
        MAX_ROWS,
    };
})();
