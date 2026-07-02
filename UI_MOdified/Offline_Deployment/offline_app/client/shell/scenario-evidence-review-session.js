/* ============================================================================
 * scenario-evidence-review-session.js - RMOOZ-QA-51..57 review-session pack
 * ----------------------------------------------------------------------------
 * Browser-local persistence for manual scenario-evidence review status.
 * Stores operator review metadata only. It never mutates scenario truth,
 * world state, doctrine, combat state, backend routes, or a database.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_REVIEW_SESSION_VERSION = '1.0.0-rmooz-qa-51';
    var STORAGE_PREFIX = 'rmooz.scenarioEvidenceReviewSession.';
    var memoryStore = {};

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }

    function stableStringify(value) {
        if (value == null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        return '{' + Object.keys(value).sort().map(function (k) {
            return JSON.stringify(k) + ':' + stableStringify(value[k]);
        }).join(',') + '}';
    }

    function hashString(text) {
        var h = 2166136261;
        text = String(text == null ? '' : text);
        for (var i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
        }
        return ('00000000' + (h >>> 0).toString(16)).slice(-8);
    }

    function unitsOf(ws) {
        ws = obj(ws);
        return arr(ws.units || ws.all_units || []).concat(arr(ws.red_units), arr(ws.blue_units));
    }

    function scenarioSignature(ws) {
        ws = obj(ws);
        var objective = obj(ws.objective || ws.objective_x || ws.ObjectiveX);
        return {
            scenario_id: ws.scenario_id || ws.id || ws.name || null,
            objective: objective.id || objective.name || objective.uid || null,
            unit_count: unitsOf(ws).length,
            units: unitsOf(ws).map(function (u) {
                u = obj(u);
                return {
                    uid: u.uid || u.id || u.unit_uid || null,
                    side: u.side || u.team || null,
                    role: u.role || u.type || u.domain || null,
                    lat: u.lat == null ? u.latitude : u.lat,
                    lng: u.lng == null ? u.longitude : u.lng
                };
            }).sort(function (a, b) {
                return String(a.uid || '').localeCompare(String(b.uid || ''));
            })
        };
    }

    function computeFingerprint(worldStateOrFingerprint, opts) {
        opts = opts || {};
        if (opts.fingerprint) return String(opts.fingerprint);
        if (typeof worldStateOrFingerprint === 'string') return worldStateOrFingerprint;
        if (typeof worldStateOrFingerprint === 'function') {
            try { worldStateOrFingerprint = worldStateOrFingerprint(); } catch (_) { worldStateOrFingerprint = null; }
        }
        return 'scenario-' + hashString(stableStringify(scenarioSignature(worldStateOrFingerprint)));
    }

    function storageKey(fingerprint) {
        return STORAGE_PREFIX + String(fingerprint || 'unknown');
    }

    function storage() {
        try {
            if (root.localStorage && typeof root.localStorage.getItem === 'function') return root.localStorage;
        } catch (_) {}
        return null;
    }

    function readRaw(key) {
        var s = storage();
        if (s) {
            try { return s.getItem(key); } catch (_) {}
        }
        return memoryStore[key] || null;
    }

    function writeRaw(key, value) {
        var s = storage();
        if (s) {
            try { s.setItem(key, value); return true; } catch (_) {}
        }
        memoryStore[key] = value;
        return true;
    }

    function removeRaw(key) {
        var s = storage();
        if (s) {
            try { s.removeItem(key); } catch (_) {}
        }
        delete memoryStore[key];
        return true;
    }

    function defaultSession(fingerprint, opts) {
        opts = opts || {};
        return {
            version: SCENARIO_EVIDENCE_REVIEW_SESSION_VERSION,
            scenario_fingerprint: String(fingerprint || 'unknown'),
            original_scenario_fingerprint: String(opts.original_fingerprint || fingerprint || 'unknown'),
            created_at: opts.generated_at || new Date().toISOString(),
            updated_at: opts.generated_at || new Date().toISOString(),
            imported_at: opts.imported_at || null,
            stale: !!opts.stale,
            records: [],
            source: 'Browser-local scenario evidence review session',
            read_only: true
        };
    }

    function normalizeRecord(rec) {
        rec = obj(rec);
        return {
            issue_id: String(rec.issue_id || ((rec.uid || 'force') + '|' + (rec.reason || rec.code || 'unknown'))),
            uid: rec.uid || null,
            label: rec.label || rec.unit_label || rec.uid || null,
            side: rec.side || null,
            code: rec.code || rec.reason || 'unknown',
            status: rec.status || rec.manual_status || 'needs_review',
            note: rec.note || rec.manual_note || '',
            timestamp: rec.timestamp || rec.manual_timestamp || null
        };
    }

    function loadSession(fingerprint) {
        var fp = String(fingerprint || 'unknown');
        var raw = readRaw(storageKey(fp));
        if (!raw) return defaultSession(fp);
        try {
            var parsed = JSON.parse(raw);
            parsed.records = arr(parsed.records).map(normalizeRecord);
            parsed.scenario_fingerprint = parsed.scenario_fingerprint || fp;
            parsed.original_scenario_fingerprint = parsed.original_scenario_fingerprint || parsed.scenario_fingerprint;
            parsed.read_only = true;
            parsed.stale = parsed.original_scenario_fingerprint !== fp || !!parsed.stale;
            return parsed;
        } catch (_) {
            return defaultSession(fp);
        }
    }

    function saveSession(session) {
        session = obj(session);
        var fp = String(session.scenario_fingerprint || 'unknown');
        var out = Object.assign(defaultSession(fp), session, {
            scenario_fingerprint: fp,
            records: arr(session.records).map(normalizeRecord),
            updated_at: session.updated_at || new Date().toISOString(),
            read_only: true
        });
        out.stale = out.original_scenario_fingerprint !== out.scenario_fingerprint || !!out.stale;
        writeRaw(storageKey(fp), JSON.stringify(out));
        return out;
    }

    function saveRecords(fingerprint, records, opts) {
        opts = opts || {};
        var session = loadSession(fingerprint);
        session.records = arr(records).map(normalizeRecord);
        session.updated_at = opts.generated_at || new Date().toISOString();
        if (opts.original_fingerprint) session.original_scenario_fingerprint = opts.original_fingerprint;
        return saveSession(session);
    }

    function clearSession(fingerprint) {
        removeRaw(storageKey(fingerprint || 'unknown'));
        return defaultSession(fingerprint || 'unknown');
    }

    function counts(records) {
        var c = { total: arr(records).length, needs_review: 0, reviewed: 0, deferred: 0, fixed_externally: 0 };
        arr(records).forEach(function (r) {
            var s = normalizeRecord(r).status;
            if (c[s] == null) c.needs_review++;
            else c[s]++;
        });
        return c;
    }

    function exportSession(worldStateOrFingerprint, opts) {
        opts = opts || {};
        var fp = computeFingerprint(worldStateOrFingerprint, opts);
        var session = opts.session || loadSession(fp);
        return {
            version: SCENARIO_EVIDENCE_REVIEW_SESSION_VERSION,
            exported_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: fp,
            original_scenario_fingerprint: session.original_scenario_fingerprint || fp,
            stale: !!session.stale || (session.original_scenario_fingerprint && session.original_scenario_fingerprint !== fp),
            counts: counts(session.records),
            records: arr(session.records).map(normalizeRecord),
            source: 'Browser-local manual evidence review session',
            read_only: true
        };
    }

    function importSession(payload, opts) {
        opts = opts || {};
        if (typeof payload === 'string') payload = JSON.parse(payload);
        payload = obj(payload);
        var currentFp = computeFingerprint(opts.current_fingerprint || opts.world_state || payload.scenario_fingerprint || 'unknown', opts);
        var originalFp = String(payload.scenario_fingerprint || payload.original_scenario_fingerprint || currentFp);
        var session = defaultSession(currentFp, {
            original_fingerprint: originalFp,
            imported_at: opts.generated_at || new Date().toISOString(),
            stale: originalFp !== currentFp,
            generated_at: payload.exported_at || payload.generated_at
        });
        session.records = arr(payload.records || obj(payload.summary).records || payload.stored_records).map(normalizeRecord);
        session.updated_at = opts.generated_at || new Date().toISOString();
        return saveSession(session);
    }

    var api = {
        SCENARIO_EVIDENCE_REVIEW_SESSION_VERSION: SCENARIO_EVIDENCE_REVIEW_SESSION_VERSION,
        STORAGE_PREFIX: STORAGE_PREFIX,
        computeFingerprint: computeFingerprint,
        storageKey: storageKey,
        loadSession: loadSession,
        saveSession: saveSession,
        saveRecords: saveRecords,
        clearSession: clearSession,
        exportSession: exportSession,
        importSession: importSession,
        counts: counts
    };

    root.RmoozScenarioEvidenceReviewSession = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
