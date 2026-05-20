/**
 * Red-team AI controller (Chunk 09 from wargame-vision.html).
 *
 * Thin client wrapper around the local Ollama gateway. Each turn the
 * controller will: capture a snapshot of the plan, send it + the turn
 * context to the AI, parse the proposed Red actions, validate them
 * server-side, and present them to the operator for approve / reject.
 *
 * This first iteration only wires up the gateway smoke test. The
 * action-proposal pipeline is the next chunk.
 *
 * Public surface: window.AppRedTeam = { health, generate, chat }
 */
(function () {
    'use strict';

    async function jsonFetch(path, init) {
        const res = await fetch(path, init);
        let body;
        try { body = await res.json(); }
        catch { body = { ok: false, error: `HTTP ${res.status} (non-JSON response)` }; }
        if (!res.ok && typeof body === 'object' && body) body.ok = false;
        return body;
    }

    async function health() {
        return jsonFetch('/api/ai/health');
    }

    async function generate({ model, prompt, system, format, options, timeoutMs } = {}) {
        return jsonFetch('/api/ai/generate', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model, prompt, system, format, options, timeoutMs }),
        });
    }

    async function chat({ model, messages, format, options, timeoutMs } = {}) {
        return jsonFetch('/api/ai/chat', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model, messages, format, options, timeoutMs }),
        });
    }

    async function propose({ snapshot, units, turn, model, timeoutMs, side } = {}) {
        const route = side === 'blue' ? '/api/ai/blue-team/propose' : '/api/ai/red-team/propose';
        return jsonFetch(route, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ snapshot, units, turn, model, timeoutMs }),
        });
    }

    // ── Smoke-test UI binding ──────────────────────────────────────────
    // These two buttons live inside the wargame panel and let the operator
    // verify the gateway works before any real Red-AI turn happens.
    function byId(id) { return document.getElementById(id); }
    function setStatus(text, kind) {
        const pill = byId('wg-ai-status-pill');
        const box  = byId('wg-ai-status');
        if (box) box.textContent = text || '';
        if (pill) {
            pill.classList.remove('is-idle', 'is-active', 'is-error', 'is-ok');
            if (kind === 'ok')         { pill.classList.add('is-ok');     pill.textContent = 'Connected'; }
            else if (kind === 'busy')  { pill.classList.add('is-active'); pill.textContent = 'Working…'; }
            else if (kind === 'error') { pill.classList.add('is-error');  pill.textContent = 'Error'; }
            else                       { pill.classList.add('is-idle');   pill.textContent = 'Unchecked'; }
        }
    }
    function setModels(models) {
        const el = byId('wg-ai-models');
        if (!el) return;
        if (!models || !models.length) { el.style.display = 'none'; el.textContent = ''; return; }
        el.style.display = '';
        el.textContent = 'Installed models: ' + models.join(', ');
    }

    async function runHealthCheck() {
        setStatus('Pinging Ollama…', 'busy');
        setModels(null);
        const r = await health();
        if (r.ok) {
            const list = Array.isArray(r.models) ? r.models : [];
            setStatus(`Ollama reachable at ${r.url}. ${list.length} model${list.length === 1 ? '' : 's'} installed.`, 'ok');
            setModels(list);
        } else {
            setStatus(r.error || 'Health check failed.', 'error');
        }
    }

    async function runTestPrompt() {
        setStatus('Asking the model — this can take a few seconds the first time…', 'busy');
        const r = await generate({
            // The "thinking" field gpt-oss returns is hidden chain-of-thought,
            // so we ask for a short visible answer and budget enough tokens
            // for the model to finish its internal reasoning first.
            system:  'You are a war-game adversary briefing assistant. Be concise.',
            prompt:  'In one sentence, what does "advance to contact" mean in military doctrine?',
            options: { num_predict: 400, temperature: 0.2 },
            timeoutMs: 60000,
        });
        if (r.ok) {
            const text = (r.response || '').trim();
            const thinking = (r.raw && r.raw.thinking) ? ' (model also used hidden reasoning tokens)' : '';
            setStatus(text ? `Reply: ${text}${thinking}` : 'Model produced no visible output — try increasing num_predict.', text ? 'ok' : 'error');
        } else {
            setStatus(r.error || 'Generate failed.', 'error');
        }
    }

    // ── Proposal rendering ────────────────────────────────────────────
    // The vision-doc mockup calls for each proposed action to be shown as
    // a card with a green ✓ Execute and a red ✗ Reject button; rejected
    // moves stay visible so the operator can see what the AI tried.
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function formatTo(a) {
        if (Array.isArray(a.to) && a.to.length === 2) {
            return `→ [${a.to[0].toFixed(4)}, ${a.to[1].toFixed(4)}]`;
        }
        if (a.target) return `→ ${escapeHtml(a.target)}`;
        return '';
    }
    function renderProposals(result) {
        const wrap = byId('wg-ai-proposals');
        if (!wrap) return;
        if (!result || !result.ok) {
            wrap.innerHTML = `<div class="wargame-feed-empty">Red AI did not return proposals. ${escapeHtml(result && result.error || '')}</div>`;
            return;
        }
        if (result.empty) {
            wrap.innerHTML = `<div class="wargame-feed-empty">${escapeHtml(result.reason || 'No actions proposed this turn.')}</div>`;
            return;
        }
        const rationale = result.rationale
            ? `<div class="wg-ai-rationale">Intent: ${escapeHtml(result.rationale)}</div>`
            : '';
        const counts = result.counts
            ? (() => {
                const c = result.counts;
                const sent = (c.sentFriendly != null || c.sentHostile != null)
                    ? ` · sent ${c.sentFriendly || 0}+${c.sentHostile || 0} to AI`
                    : '';
                const skipped = c.skipped ? ` · ${c.skipped} non-point skipped` : '';
                return `<div class="wg-ai-counts">${c.friendly} friendly · ${c.hostile} hostile${sent}${skipped}</div>`;
            })()
            : '';
        const cards = (result.actions || []).map(a => {
            const valid = a.validation && a.validation.ok;
            const errs = (a.validation && a.validation.errors || []).map(e => `<li>${escapeHtml(e)}</li>`).join('');
            const statusBadge = valid
                ? '<span class="wg-ai-badge ok">✓ valid</span>'
                : '<span class="wg-ai-badge err">⚠ rejected</span>';
            return `
                <div class="wg-ai-proposal ${valid ? 'is-valid' : 'is-invalid'}" data-action-idx="${a.idx}">
                    <div class="wg-ai-proposal-head">
                        <span class="wg-ai-action-type">${escapeHtml(a.type)}</span>
                        <span class="wg-ai-action-unit">${escapeHtml(a.unitId || '(no unit)')}</span>
                        <span class="wg-ai-action-target">${escapeHtml(formatTo(a))}</span>
                        ${statusBadge}
                    </div>
                    <div class="wg-ai-proposal-reason">${escapeHtml(a.reason || '(no reason given)')}</div>
                    ${errs ? `<ul class="wg-ai-proposal-errs">${errs}</ul>` : ''}
                    <div class="wg-ai-proposal-actions">
                        <button type="button" class="wg-ai-exec" data-idx="${a.idx}" ${valid ? '' : 'disabled title="cannot execute: failed validation"'}>✓ Execute</button>
                        <button type="button" class="wg-ai-reject" data-idx="${a.idx}">✗ Reject</button>
                    </div>
                </div>`;
        }).join('');
        wrap.innerHTML = `${rationale}${counts}${cards || '<div class="wargame-feed-empty">No actions proposed.</div>'}`;

        // Execute: look up the cached action by idx and mutate the live map.
        // MOVE animates the marker to the new coords, ENGAGE flashes both
        // attacker and target and logs to the combat feed, HOLD just logs.
        wrap.querySelectorAll('.wg-ai-exec').forEach(btn => {
            btn.addEventListener('click', async () => {
                const card = btn.closest('.wg-ai-proposal');
                if (!card) return;
                const action = actionByIdx.get(String(btn.dataset.idx));
                btn.disabled = true;
                btn.textContent = '… executing';
                const ok = await executeAction(action);
                card.classList.add(ok ? 'is-executed' : 'is-invalid');
                btn.textContent = ok ? '✓ Executed' : '✗ Failed';
            });
        });
        wrap.querySelectorAll('.wg-ai-reject').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.wg-ai-proposal');
                if (!card) return;
                card.classList.add('is-rejected');
                btn.disabled = true;
                btn.textContent = '✗ Rejected';
            });
        });
    }

    // Cache: AI-visible unit id → live Leaflet marker. Refreshed on every
    // scan so Execute can look up which marker to move when the operator
    // approves an action. Keys must match exactly what we send to the AI.
    const markerById = new Map();
    // Cache: last full result so Execute can find the action by index even
    // after re-render. Keys: action.idx → action object.
    const actionByIdx = new Map();
    // Side of the most recent proposal request — captured here so
    // executeAction() can stamp the right side onto AppApprovedActions
    // without re-reading the DOM card class. Set inside runPropose().
    let lastProposalSide = 'red';

    // Scan the live Leaflet map for every unit-bearing marker. We do this
    // the same way turn-engine.js does — that's the source of truth for
    // what's actually on the battlefield (and matches the Enemy/Friendly
    // counters in the wargame panel). Covers all three placement paths:
    // AppUnitsMap drag-place, formation members, and imported features.
    function scanMapForUnits() {
        markerById.clear();
        const out = [];
        if (!window.map || typeof window.map.eachLayer !== 'function' || !window.L) return out;
        const affiliation = (sidc) => {
            if (typeof sidc !== 'string' || sidc.length < 4) return null;
            const d = sidc[3];
            return d === '3' ? 'friendly' : d === '6' ? 'hostile' : d === '4' ? 'neutral' : d === '1' ? 'unknown' : null;
        };
        let synth = 0;
        window.map.eachLayer(layer => {
            if (!(layer instanceof window.L.Marker)) return;
            const sidc = layer._sidc || (layer._unitData && layer._unitData.sidc);
            const side = affiliation(sidc);
            if (side !== 'friendly' && side !== 'hostile') return;
            const ll = layer.getLatLng ? layer.getLatLng() : null;
            if (!ll) return;
            const d  = layer._unitData || {};
            const id = layer._unitId || d.id || d.code
                    || (layer._tmgData && (layer._tmgData.id || layer._tmgData.code))
                    || `m-${synth++}`;
            const name = d.name || d.code
                    || (layer._tmgData && (layer._tmgData.name || layer._tmgData.code))
                    || id;
            markerById.set(id, layer);
            out.push({ id, name, code: d.code || '', sidc, side, lat: ll.lat, lng: ll.lng });
        });
        return out;
    }

    // ── Action execution ─────────────────────────────────────────────────
    // Move the Red marker on the map (animated) when MOVE is approved;
    // flash the target + log a combat-feed entry when ENGAGE is approved;
    // log-only for HOLD. Persisting these back to the server's units DB
    // is intentionally deferred — wargame moves are simulated, not saved.
    function animateMarker(marker, toLat, toLng, durationMs) {
        const from = marker.getLatLng();
        const t0 = performance.now();
        const dur = durationMs || 800;
        return new Promise(resolve => {
            function step(now) {
                const t = Math.min(1, (now - t0) / dur);
                const e = t * (2 - t); // easeOutQuad
                marker.setLatLng([
                    from.lat + (toLat - from.lat) * e,
                    from.lng + (toLng - from.lng) * e,
                ]);
                if (t < 1) requestAnimationFrame(step);
                else resolve();
            }
            requestAnimationFrame(step);
        });
    }

    function flashMarker(marker, kind) {
        const el = marker.getElement && marker.getElement();
        if (!el) return;
        const cls = kind === 'target' ? 'wg-ai-flash-target' : 'wg-ai-flash-mover';
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 1400);
    }

    function logFeed(text, kind) {
        const feed = byId('wg-combat-feed');
        const count = byId('wg-feed-count');
        if (!feed) return;
        if (feed.classList.contains('wargame-feed-empty')) {
            feed.classList.remove('wargame-feed-empty');
            feed.innerHTML = '';
        }
        const stamp = new Date().toTimeString().slice(0, 8);
        const line = document.createElement('div');
        line.className = 'wg-ai-feed-line wg-ai-feed-' + (kind || 'info');
        line.textContent = `[${stamp}] ${text}`;
        feed.prepend(line);
        if (count) count.textContent = String(parseInt(count.textContent || '0', 10) + 1);
    }

    // Distance-based hit probability for ENGAGE. Validation already rejects
    // attacks >30 km; within range, closer = more likely to land. Curve
    // chosen to keep stakes meaningful at all ranges: ~90% close, ~25% far.
    function hitProbability(km) {
        const t = Math.max(0, Math.min(1, km / 30));
        return 0.9 - 0.65 * t;
    }
    function haversineKm(a, b) {
        const R = 6371;
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const la1  = toRad(a.lat), la2 = toRad(b.lat);
        const x = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
    }

    // Fade a marker out over ~600ms then remove it from the map. Tweens
    // the icon DOM's opacity directly so the marker's draggable state etc.
    // doesn't matter — the element just disappears.
    function destroyMarker(marker) {
        return new Promise(resolve => {
            const el = marker.getElement && marker.getElement();
            const t0 = performance.now();
            const dur = 600;
            function step(now) {
                const t = Math.min(1, (now - t0) / dur);
                if (el) el.style.opacity = String(1 - t);
                if (t < 1) requestAnimationFrame(step);
                else {
                    try { window.map && window.map.removeLayer(marker); } catch (_) {}
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    // Record an executed action under the next adjudicate step so the
    // adjudicator prompt sees it as a PROPOSED ACTION (todo item #7).
    // adjudicator-hud.js publishes getNextStepIndex() on AppAdjudicator
    // so we don't have to peek at its module-private trial.
    function recordApproved(action, side) {
        if (!window.AppApprovedActions) return;
        let nextStep = 1;
        try {
            const fn = window.AppAdjudicator && window.AppAdjudicator.getNextStepIndex;
            if (typeof fn === 'function') {
                const n = fn();
                if (Number.isInteger(n) && n >= 1 && n <= 11) nextStep = n;
            }
        } catch (_) { /* ignore */ }
        window.AppApprovedActions.add(nextStep, side, action);
    }

    async function executeAction(action) {
        if (!action) return false;
        const marker = markerById.get(action.unitId);
        if (!marker) {
            logFeed(`MISSING ${action.unitId} — not on the map`, 'error');
            return false;
        }
        const type = String(action.type || '').toUpperCase();
        if (type === 'MOVE' && Array.isArray(action.to) && action.to.length === 2) {
            const [lng, lat] = action.to;
            flashMarker(marker, 'mover');
            await animateMarker(marker, lat, lng);
            logFeed(`MOVE ${action.unitId} → [${lng.toFixed(4)}, ${lat.toFixed(4)}]`, 'move');
            recordApproved(action, lastProposalSide);
            return true;
        }
        if (type === 'ENGAGE') {
            const target = markerById.get(action.target);
            if (!target) {
                flashMarker(marker, 'mover');
                logFeed(`ENGAGE ${action.unitId} → ${action.target} (target not on map)`, 'error');
                return true;
            }
            const a = marker.getLatLng();
            const b = target.getLatLng();
            const km = haversineKm({lat:a.lat,lng:a.lng}, {lat:b.lat,lng:b.lng});
            const pHit = hitProbability(km);
            const hit = Math.random() < pHit;
            flashMarker(marker, 'mover');
            flashMarker(target, 'target');
            if (hit) {
                logFeed(`ENGAGE ${action.unitId} → ${action.target}: HIT at ${km.toFixed(1)} km (p=${pHit.toFixed(2)}) — target destroyed`, 'engage');
                markerById.delete(action.target);
                await destroyMarker(target);
            } else {
                logFeed(`ENGAGE ${action.unitId} → ${action.target}: MISS at ${km.toFixed(1)} km (p=${pHit.toFixed(2)})`, 'engage');
            }
            recordApproved(action, lastProposalSide);
            return true;
        }
        if (type === 'HOLD') {
            flashMarker(marker, 'mover');
            logFeed(`HOLD ${action.unitId}`, 'hold');
            recordApproved(action, lastProposalSide);
            return true;
        }
        logFeed(`UNKNOWN action type "${action.type}"`, 'error');
        return false;
    }

    // Auto-execute every valid action sequentially. Sequential (not parallel)
    // so the combat feed reads in order and ENGAGE casualties show up before
    // any follow-up MOVE that might depend on the geometry.
    async function executeAllValid(result) {
        if (!result || !Array.isArray(result.actions)) return;
        for (const a of result.actions) {
            if (a.validation && a.validation.ok) await executeAction(a);
        }
    }

    async function runPropose(side) {
        const which = side === 'blue' ? 'blue' : 'red';
        lastProposalSide = which;
        setStatus(which === 'blue' ? 'Asking Blue AI for counter-moves…' : 'Asking Red AI for reactive moves…', 'busy');
        // Scan the live map: covers AppUnitsMap-placed, formation members,
        // and imported markers in one pass. AppUnitsMap.listPlacedUnits()
        // would miss everything that wasn't drag-placed via the Units tool.
        let units = scanMapForUnits();
        if (!units.length && window.AppUnitsMap && typeof window.AppUnitsMap.listPlacedUnits === 'function') {
            try { units = window.AppUnitsMap.listPlacedUnits() || []; }
            catch (e) { console.warn('[red-team] listPlacedUnits fallback failed', e); }
        }
        let snapshot = null;
        if (window.AppWarGame && typeof window.AppWarGame.captureSnapshot === 'function') {
            try { snapshot = window.AppWarGame.captureSnapshot(); }
            catch (e) { console.warn('[red-team] captureSnapshot failed', e); }
        }
        const turn = (window.AppTurnEngine && window.AppTurnEngine.state && window.AppTurnEngine.state.turn) || 0;
        const r = await propose({ snapshot, units, turn, side: which });
        // Cache the action objects so Execute clicks can look up by idx —
        // the buttons only carry data-idx, not the full action payload.
        actionByIdx.clear();
        if (r.ok && Array.isArray(r.actions)) {
            for (const a of r.actions) actionByIdx.set(String(a.idx), a);
        }
        if (r.ok) {
            const n = (r.actions || []).length;
            const valid = (r.actions || []).filter(a => a.validation && a.validation.ok).length;
            const label = which === 'blue' ? 'Blue AI' : 'Red AI';
            setStatus(r.empty
                ? (r.reason || `No ${which} actions proposed.`)
                : `${label} proposed ${n} action${n === 1 ? '' : 's'} (${valid} valid). Review below.`,
                r.empty ? 'idle' : 'ok');
        } else {
            const label = which === 'blue' ? 'Blue AI' : 'Red AI';
            setStatus(r.error || `${label} call failed.`, 'error');
        }
        renderProposals(r);
        // Auto-execute: if the operator opted in, run every valid action
        // immediately. Rejected actions still show on screen so the human
        // can see what the model tried (per the vision-doc mockup).
        const autoEx = byId('wg-ai-auto-execute');
        if (autoEx && autoEx.checked) await executeAllValid(r);
    }

    function bind() {
        const testBtn       = byId('wg-ai-test-btn');
        const pingBtn       = byId('wg-ai-ping-btn');
        const proposeBtn    = byId('wg-ai-propose-btn');
        const proposeBlueBtn= byId('wg-ai-propose-blue-btn');
        if (testBtn)        testBtn.addEventListener('click', runHealthCheck);
        if (pingBtn)        pingBtn.addEventListener('click', runTestPrompt);
        if (proposeBtn)     proposeBtn.addEventListener('click',     () => runPropose('red'));
        if (proposeBlueBtn) proposeBlueBtn.addEventListener('click', () => runPropose('blue'));

        // Listen for the turn-engine's end-of-Blue-phase signal. If the
        // operator enabled auto-after-turn, fire Red AI without them having
        // to click. We guard against re-entrancy with a single in-flight
        // flag so spamming Next Turn doesn't queue multiple Ollama calls.
        let inFlight = false;
        document.addEventListener('wargame:turn-ended', async () => {
            const auto = byId('wg-ai-auto-after-turn');
            if (!auto || !auto.checked) return;
            if (inFlight) return;
            inFlight = true;
            try { await runPropose('red'); }
            finally { inFlight = false; }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    window.AppRedTeam = { health, generate, chat, propose, runHealthCheck, runTestPrompt, runPropose };
})();
