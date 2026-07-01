/* ============================================================================
 * cmo-evidence-export.js - RMOOZ-CMO-6 evidence after-action snapshot
 * ----------------------------------------------------------------------------
 * Read-only client export of the evidence already shown in the selected-unit
 * panel and map overlay. It collects CMO-1..5 outputs into JSON and a compact
 * commander-readable summary. No backend routes, state writes, or combat edits.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_EVIDENCE_EXPORT_VERSION = '1.0.0-rmooz-cmo-6';

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function localApi(globalName, moduleName) {
        if (root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            try { return require('./' + moduleName); } catch (_) {}
        }
        return null;
    }

    function labelsApi() { return localApi('AppCmoEvidenceLabels', 'cmo-evidence-labels.js'); }
    function engagementApi() { return localApi('AppEngagementEvidence', 'engagement-evidence.js'); }
    function contactApi() { return localApi('AppContactEvidence', 'contact-evidence.js'); }
    function decisionApi() { return localApi('AppDecisionChainEvidence', 'decision-chain-evidence.js'); }
    function overlayApi() { return localApi('AppEvidenceMapOverlays', 'evidence-map-overlays.js'); }
    function timelineApi() { return localApi('RmoozCmoEvidenceTimeline', 'cmo-evidence-timeline.js'); }

    function uidOf(unit) {
        unit = obj(unit);
        return unit.uid || unit.id || unit.unit_uid || unit.unitId || null;
    }

    function displayUnitName(unit, uid) {
        unit = obj(unit);
        return unit.label || unit.name || unit.displayName || unit.display_name ||
            unit.platformLabel || unit.platform_name || uid || 'Unknown unit';
    }

    function reasonLabel(code, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.reasonLabel === 'function') {
            try { return labels.reasonLabel(code || 'unknown_reason', lang || 'en'); } catch (_) {}
        }
        return code || 'unknown_reason';
    }

    function statusLabel(status, lang) {
        var labels = labelsApi();
        if (labels && typeof labels.statusLabel === 'function') {
            try { return labels.statusLabel(status || 'Unknown', lang || 'en'); } catch (_) {}
        }
        return status || 'Unknown';
    }

    function pick(source, keys) {
        source = obj(source);
        var out = {};
        arr(keys).forEach(function (k) {
            if (source[k] !== undefined && source[k] !== null) out[k] = source[k];
        });
        return out;
    }

    function compactRecord(record) {
        return pick(record, [
            'can_engage', 'reason_code', 'source', 'shooter', 'target', 'target_uid',
            'weapon', 'status', 'range_nm', 'max_range_nm', 'detection_status',
            'by_unit', 'by_sensor', 'sensor_source', 'confidence', 'classification',
            'last_seen', 'method', 'step_index'
        ]);
    }

    function compactEngagement(ev) {
        ev = obj(ev);
        return {
            can_engage: !!ev.can_engage,
            reason_code: ev.reason_code || null,
            reason_label_en: ev.reason_code ? reasonLabel(ev.reason_code, 'en') : reasonLabel('can_engage', 'en'),
            reason_label_ar: ev.reason_code ? reasonLabel(ev.reason_code, 'ar') : reasonLabel('can_engage', 'ar'),
            target_uid: ev.target_uid || null,
            weapon: ev.weapon || null,
            range_nm: ev.range_nm == null ? null : ev.range_nm,
            max_range_nm: ev.max_range_nm == null ? null : ev.max_range_nm,
            source: ev.source || 'Adjudicator evidence',
            records: arr(ev.records).map(compactRecord)
        };
    }

    function compactContact(ev) {
        ev = obj(ev);
        return {
            detection_status: ev.detection_status || 'Unknown',
            reason_code: ev.reason_code || 'no_contact_evidence',
            reason_label_en: reasonLabel(ev.reason_code || 'no_contact_evidence', 'en'),
            reason_label_ar: reasonLabel(ev.reason_code || 'no_contact_evidence', 'ar'),
            target_uid: ev.target_uid || null,
            last_seen: ev.last_seen == null ? null : ev.last_seen,
            confidence: ev.confidence || 'Unknown',
            sensor_source: ev.sensor_source || 'Unknown',
            classification: ev.classification || null,
            range_nm: ev.range_nm == null ? null : ev.range_nm,
            max_range_nm: ev.max_range_nm == null ? null : ev.max_range_nm,
            source: ev.source || 'World-state derived evidence',
            records: arr(ev.records).map(compactRecord)
        };
    }

    function compactDecision(ev) {
        ev = obj(ev);
        return {
            final_status: ev.final_status || 'Unknown',
            final_status_label_ar: statusLabel(ev.final_status || 'Unknown', 'ar'),
            can_engage: !!ev.can_engage,
            blocking_reason_code: ev.blocking_reason_code || null,
            blocking_reason_label_en: ev.blocking_reason_code ? reasonLabel(ev.blocking_reason_code, 'en') : 'None',
            blocking_reason_label_ar: ev.blocking_reason_code ? reasonLabel(ev.blocking_reason_code, 'ar') : 'None',
            source: ev.source || 'Contact + engagement derived evidence',
            steps: arr(ev.steps).map(function (s) {
                return pick(s, ['key', 'label', 'label_ar', 'status', 'reason_code', 'detail']);
            })
        };
    }

    function compactOverlay(state) {
        state = obj(state);
        return {
            status: state.status || 'Unknown',
            reason_code: state.reason_code || null,
            reason_label_ar: state.reason_label_ar || (state.reason_code ? reasonLabel(state.reason_code, 'ar') : reasonLabel('ready', 'ar')),
            target_uid: state.target_uid || null,
            weapon_range_meters: state.weapon_range_meters == null ? null : state.weapon_range_meters,
            sensor_range_meters: state.sensor_range_meters == null ? null : state.sensor_range_meters,
            has_target_line: !!state.target_line,
            source: state.source || 'Contact + engagement derived evidence'
        };
    }

    function compactTimeline(events) {
        return arr(events).map(function (event) {
            return pick(event, [
                'timestamp', 'type', 'status', 'reason_code', 'reason_label_ar',
                'target', 'target_uid', 'weapon', 'sensor', 'confidence', 'source', 'detail', 'tick'
            ]);
        });
    }

    function sourceList(snapshot) {
        var seen = {};
        var out = [];
        [snapshot.engagement, snapshot.contact, snapshot.decision_chain, snapshot.overlay].forEach(function (part) {
            var source = part && part.source;
            if (source && !seen[source]) {
                seen[source] = true;
                out.push(source);
            }
        });
        return out;
    }

    function buildSnapshot(worldStateOrProvider, unit, opts) {
        opts = opts || {};
        var ws = (typeof worldStateOrProvider === 'function') ? worldStateOrProvider() : worldStateOrProvider;
        var uid = opts.uid || uidOf(unit);
        var EE = engagementApi();
        var CE = contactApi();
        var DC = decisionApi();
        var EMO = overlayApi();
        var TL = timelineApi();

        var engagement = EE && typeof EE.getUnitEngagementWhyNot === 'function'
            ? EE.getUnitEngagementWhyNot(ws, uid)
            : { can_engage: false, reason_code: 'no_engagement_evidence', records: [] };
        var contact = CE && typeof CE.getUnitContactEvidence === 'function'
            ? CE.getUnitContactEvidence(ws, uid)
            : { detection_status: 'Unknown', reason_code: 'no_contact_evidence', records: [] };
        var decision = DC && typeof DC.getUnitDecisionChainEvidence === 'function'
            ? DC.getUnitDecisionChainEvidence(ws, uid)
            : { final_status: 'Unknown', blocking_reason_code: 'unknown_reason', steps: [] };
        var overlay = EMO && typeof EMO.buildOverlayState === 'function'
            ? EMO.buildOverlayState(ws, unit || { uid: uid }, { uid: uid })
            : { status: decision.final_status || 'Unknown', reason_code: decision.blocking_reason_code || null };
        var timeline = TL && typeof TL.get === 'function' ? TL.get(uid) : [];
        var blockingCode = decision.blocking_reason_code || overlay.reason_code || engagement.reason_code || contact.reason_code || null;

        var snapshot = {
            version: CMO_EVIDENCE_EXPORT_VERSION,
            generated_at: opts.generated_at || new Date().toISOString(),
            selected_unit: {
                uid: uid || null,
                label: displayUnitName(unit, uid),
                side: obj(unit).side || obj(unit).team || null,
                domain: obj(unit).domain || null,
                role: obj(unit).role || null
            },
            final_status: decision.final_status || overlay.status || 'Unknown',
            blocking_reason: {
                code: blockingCode,
                label_en: blockingCode ? reasonLabel(blockingCode, 'en') : 'None',
                label_ar: blockingCode ? reasonLabel(blockingCode, 'ar') : 'None'
            },
            engagement: compactEngagement(engagement),
            contact: compactContact(contact),
            decision_chain: compactDecision(decision),
            overlay: compactOverlay(overlay),
            timeline: compactTimeline(timeline)
        };
        snapshot.sources = sourceList(snapshot);
        return snapshot;
    }

    function buildSummary(snapshot) {
        snapshot = obj(snapshot);
        var unit = obj(snapshot.selected_unit);
        var engagement = obj(snapshot.engagement);
        var contact = obj(snapshot.contact);
        var decision = obj(snapshot.decision_chain);
        var blocking = obj(snapshot.blocking_reason);
        var timeline = arr(snapshot.timeline);
        var lines = [
            'Evidence Snapshot',
            'Unit: ' + (unit.label || unit.uid || 'Unknown unit'),
            'Final status: ' + (snapshot.final_status || decision.final_status || 'Unknown'),
            'Blocking reason: ' + (blocking.code || 'None'),
            'Arabic reason: ' + (blocking.label_ar || 'None'),
            'Target: ' + (engagement.target_uid || contact.target_uid || obj(snapshot.overlay).target_uid || 'Unknown'),
            'Weapon: ' + (engagement.weapon || 'Unknown'),
            'Contact status: ' + (contact.detection_status || 'Unknown'),
            'Overlay status: ' + (obj(snapshot.overlay).status || 'Unknown'),
            'Decision source: ' + (decision.source || 'Contact + engagement derived evidence'),
            'Timeline: ' + timeline.length + ' evidence events recorded',
            'Generated: ' + (snapshot.generated_at || 'Unknown')
        ];
        return lines.join('\n');
    }

    function toJson(snapshot) {
        return JSON.stringify(snapshot || {}, null, 2);
    }

    function copyText(text) {
        if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== 'function') {
            return Promise.resolve(false);
        }
        return root.navigator.clipboard.writeText(String(text == null ? '' : text)).then(function () { return true; });
    }

    function copyJson(snapshot) { return copyText(toJson(snapshot)); }
    function copySummary(snapshot) { return copyText(buildSummary(snapshot)); }

    function downloadJson(snapshot, filename) {
        if (!root.document || typeof root.Blob !== 'function' || !root.URL || typeof root.URL.createObjectURL !== 'function') {
            return false;
        }
        var blob = new root.Blob([toJson(snapshot)], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob);
        var a = root.document.createElement('a');
        a.href = url;
        a.download = filename || ('rmooz-evidence-' + (obj(snapshot.selected_unit).uid || 'unit') + '.json');
        root.document.body.appendChild(a);
        a.click();
        root.document.body.removeChild(a);
        setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
        return true;
    }

    function renderExportHtml(snapshot) {
        var summary = buildSummary(snapshot);
        return '<div class="usp-export-actions">' +
            '<button type="button" class="usp-export-btn" data-cmo-export-action="json">Copy JSON</button>' +
            '<button type="button" class="usp-export-btn" data-cmo-export-action="summary">Copy Summary</button>' +
            '<button type="button" class="usp-export-btn" data-cmo-export-action="download">Download JSON</button>' +
            '</div>' +
            '<pre class="usp-export-summary">' + esc(summary) + '</pre>';
    }

    var api = {
        CMO_EVIDENCE_EXPORT_VERSION: CMO_EVIDENCE_EXPORT_VERSION,
        buildSnapshot: buildSnapshot,
        buildSummary: buildSummary,
        toJson: toJson,
        copyJson: copyJson,
        copySummary: copySummary,
        downloadJson: downloadJson,
        renderExportHtml: renderExportHtml
    };

    root.RmoozCmoEvidenceExport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
