(function () {
    'use strict';

    const MAX_ACTIVITY = 6;
    const activity = [];
    let mapBound = false;

    function el(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const node = el(id);
        if (node) node.textContent = value;
    }

    function nowStamp() {
        const d = new Date();
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function addActivity(text) {
        if (!text) return;
        activity.unshift({ time: nowStamp(), text: String(text) });
        activity.splice(MAX_ACTIVITY);
        renderActivity();
    }

    function renderActivity() {
        const list = el('ops-activity-list');
        if (!list) return;
        setText('ops-activity-count', String(activity.length));
        if (!activity.length) {
            list.innerHTML = '<div class="ops-activity-empty">Waiting for activity.</div>';
            return;
        }
        list.innerHTML = activity.map(item =>
            `<div class="ops-activity-item"><span class="ops-activity-time">${escapeHtml(item.time)}</span>${escapeHtml(item.text)}</div>`
        ).join('');
    }

    function setAlert(kind, title, body) {
        const card = el('ops-alert-card');
        if (card) {
            card.classList.toggle('is-warning', kind === 'warning');
            card.classList.toggle('is-contact', kind === 'contact');
        }
        setText('ops-alert-title', title || 'No active contact');
        setText('ops-alert-body', body || 'War-game events and unit changes will appear here.');
    }

    function parseSelectionCount() {
        const src = el('selection-count');
        const text = src ? (src.textContent || '') : '';
        const match = text.match(/\d+/);
        return match ? Number.parseInt(match[0], 10) || 0 : 0;
    }

    function updateSelection() {
        const count = parseSelectionCount();
        setText('ops-selection-count', String(count));
        if (count > 0) {
            setText('ops-feature-name', count === 1 ? '1 map item selected' : `${count} map items selected`);
            setText('ops-feature-kind', 'Selection');
            setText('ops-feature-side', 'Mixed');
        } else {
            setText('ops-feature-name', 'No selection');
            setText('ops-feature-kind', 'Map idle');
            setText('ops-feature-side', 'Unknown');
        }
    }

    function updateMapMetrics() {
        const map = window.map;
        if (!map || typeof map.getCenter !== 'function') return;
        const center = map.getCenter();
        const zoom = typeof map.getZoom === 'function' ? map.getZoom() : '--';
        setText('ops-map-center', `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
        setText('ops-map-zoom', String(zoom));
    }

    function affiliationDigit(sidc) {
        return sidc && typeof sidc === 'string' && sidc.length >= 4 ? sidc[3] : '';
    }

    function classifyElement(item) {
        const element = item && (item.element || item);
        const sidc = element && (element._sidc || element.options?.sidc || element._tmgData?.sidc);
        const aff = affiliationDigit(sidc);
        if (aff === '3') return 'friendly';
        if (aff === '6') return 'hostile';
        const side = String(element?._unitSide || element?._side || element?._tmgData?.side || '').toLowerCase();
        if (side.includes('friendly') || side.includes('blue')) return 'friendly';
        if (side.includes('hostile') || side.includes('enemy') || side.includes('red')) return 'hostile';
        return 'other';
    }

    function updateLayerPosture() {
        const fn = window.getAllLayerElements;
        const items = typeof fn === 'function' ? fn() : [];
        let friendly = 0;
        let hostile = 0;
        let other = 0;
        for (const item of items) {
            const cls = classifyElement(item);
            if (cls === 'friendly') friendly++;
            else if (cls === 'hostile') hostile++;
            else other++;
        }
        setText('ops-element-count', String(items.length));
        setText('ops-layer-count', String(items.length));
        setText('ops-friendly-count', String(friendly));
        setText('ops-hostile-count', String(hostile));
        setText('ops-other-count', String(other));
    }

    function updateWarGameState() {
        const api = window.AppTurnEngine;
        if (!api || typeof api.state !== 'function') return;
        const st = api.state();
        if (!st) return;
        if (st.contact) {
            setAlert('contact', `Contact: ${st.contact.enemy} -> ${st.contact.friendly}`, `${st.contact.km} km separation. Resolve contact before continuing.`);
        } else if (st.stopped) {
            setAlert('warning', 'War game stopped', 'The current movement reached its stop condition.');
        } else {
            setAlert('ok', `Turn ${st.turn} ready`, `${st.unitCount} hostile and ${st.friendlies} friendly units tracked.`);
        }
    }

    function bindMapWhenReady() {
        if (mapBound || !window.map || typeof window.map.on !== 'function') return;
        mapBound = true;
        window.map.on('moveend zoomend', updateMapMetrics);
        updateMapMetrics();
    }

    function initSelectionObserver() {
        const src = el('selection-count');
        if (!src || typeof MutationObserver !== 'function') return;
        const obs = new MutationObserver(() => {
            updateSelection();
            const count = parseSelectionCount();
            if (count > 0) addActivity(count === 1 ? '1 item selected' : `${count} items selected`);
        });
        obs.observe(src, { childList: true, characterData: true, subtree: true });
    }

    function initEvents() {
        document.addEventListener('wargame:turn-ended', event => {
            const d = event.detail || {};
            if (d.contact) {
                setAlert('contact', `Contact: ${d.contact.enemy} -> ${d.contact.friendly}`, `${d.contact.km} km separation on turn ${d.turn}.`);
                addActivity(`Turn ${d.turn}: contact ${d.contact.enemy} -> ${d.contact.friendly}`);
            } else {
                setAlert(d.stopped ? 'warning' : 'ok', `Turn ${d.turn} complete`, `Advanced ${Number(d.advancedKm || 0).toFixed(1)} km.`);
                addActivity(`Turn ${d.turn} resolved`);
            }
            updateWarGameState();
        });

        document.addEventListener('units:placed', event => {
            addActivity(`Unit placed${event.detail?.unitId ? ': ' + event.detail.unitId : ''}`);
            updateLayerPosture();
        });
        document.addEventListener('units:removed', event => {
            addActivity(`Unit removed${event.detail?.unitId ? ': ' + event.detail.unitId : ''}`);
            updateLayerPosture();
        });
        document.addEventListener('units:placement-cancelled', () => addActivity('Unit placement cancelled'));
    }

    function refresh() {
        bindMapWhenReady();
        updateSelection();
        updateMapMetrics();
        updateLayerPosture();
        updateWarGameState();
    }

    function init() {
        if (!el('ops-intel-panel')) return;
        initEvents();
        initSelectionObserver();
        refresh();
        addActivity('Operations panel online');
        window.setInterval(refresh, 2500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
