/* ============================================================================
 * cmo-wargame-evidence-package.js - RMOOZ-CMO-WARGAME-EVIDENCE-PACKAGE-1
 * ----------------------------------------------------------------------------
 * Read-only CMO war-game evidence package builder. Bundles the after-action
 * debrief, run instrumentation evidence, unresolved blockers, recommendations,
 * validation metadata, and export-ready text/JSON into one operator handoff.
 * It never starts, pauses, releases, mutates doctrine/combat state, calls a
 * backend route, writes a database, or stores browser-persistent state.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CMO_WARGAME_EVIDENCE_PACKAGE_VERSION = '1.0.0-rmooz-cmo-wargame-evidence-package-1';

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function safeKey(v) { return String(v == null ? 'unknown' : v).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'; }
    function releaseInterpretationObject(debrief) {
        var rel = obj(debrief).release_interpretation;
        return rel && typeof rel === 'object' ? rel : {};
    }
    function releaseInterpretationText(debrief) {
        var rel = obj(debrief).release_interpretation;
        if (typeof rel === 'string') return rel || 'not release-grade evidence';
        var rich = releaseInterpretationObject(debrief);
        return rich.label || rich.key || obj(debrief).release_interpretation_text || 'not release-grade evidence';
    }
    function releaseInterpretationKey(debrief) {
        var rel = obj(debrief).release_interpretation;
        if (typeof rel === 'string') return safeKey(rel);
        return releaseInterpretationObject(debrief).key || safeKey(releaseInterpretationText(debrief));
    }
    function outcomeSeverity(outcome) {
        outcome = obj(outcome);
        return outcome.severity || outcome.status || 'warn';
    }
    function localApi(globalName, moduleName) {
        if (root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            try { return require('./' + moduleName); } catch (_) {}
        }
        return null;
    }
    function aarApi() { return localApi('RmoozCmoWarGameAfterActionDebrief', 'cmo-wargame-after-action-debrief.js'); }
    function runApi() { return localApi('RmoozCmoWarGameRunInstrumentation', 'cmo-wargame-run-instrumentation.js'); }

    function isDebrief(input) {
        return !!(input && typeof input === 'object' && input.outcome && input.recommendations && input.timeline);
    }
    function buildDebrief(input, opts) {
        opts = opts || {};
        if (opts.debrief && isDebrief(opts.debrief)) return opts.debrief;
        if (isDebrief(input)) return input;
        var AAR = aarApi();
        if (AAR && typeof AAR.buildDebrief === 'function') return AAR.buildDebrief(input || null, opts);
        return {
            version: 'fallback-cmo-aar',
            generated_at: opts.generated_at || new Date().toISOString(),
            scenario_fingerprint: opts.fingerprint || 'unknown',
            outcome: { key: 'unknown', label: 'Unknown', severity: 'warn' },
            release_interpretation: 'not release-grade evidence',
            run_mode: { key: 'blocked', label: 'Blocked', allowed: false },
            control_center: { state: 'unknown', state_label: 'Unknown' },
            timeline: [],
            evidence_changes: [],
            unresolved_items: [],
            recommendations: [],
            after_action_checklist: [],
            instrumentation_summary: {},
            read_only: true
        };
    }
    function manifestFor(debrief, opts) {
        opts = opts || {};
        var fp = debrief.scenario_fingerprint || opts.fingerprint || 'unknown';
        var outcome = obj(debrief.outcome).key || 'unknown';
        var runMode = obj(debrief.run_mode).key || 'unknown';
        var generated = opts.generated_at || debrief.generated_at || new Date().toISOString();
        return {
            package_type: 'cmo_wargame_evidence_package',
            version: CMO_WARGAME_EVIDENCE_PACKAGE_VERSION,
            package_id: 'cmo-aar-' + safeKey(fp) + '-' + safeKey(outcome) + '-' + safeKey(runMode),
            scenario_fingerprint: fp,
            outcome: outcome,
            run_mode: runMode,
            generated_at: generated,
            source: 'CMO war-game after-action debrief',
            read_only: true
        };
    }
    function counts(debrief) {
        return {
            evidence_changes: arr(debrief.evidence_changes).length,
            unresolved_items: arr(debrief.unresolved_items).length,
            recommendations: arr(debrief.recommendations).length,
            after_action_items: arr(debrief.after_action_checklist).length,
            timeline_items: arr(debrief.timeline).length
        };
    }
    function readiness(debrief) {
        var outcome = obj(debrief.outcome);
        var interp = releaseInterpretationText(debrief);
        var interpKey = releaseInterpretationKey(debrief);
        var severity = outcomeSeverity(outcome);
        var releaseCandidate = interpKey === 'release_grade_candidate' || /release-grade evidence candidate/i.test(interp);
        var trainingOnly = interpKey === 'training_only_evidence' || /training-only/i.test(interp);
        var unresolved = arr(debrief.unresolved_items).length;
        return {
            release_grade_candidate: releaseCandidate && unresolved === 0,
            training_only: trainingOnly,
            needs_review: unresolved > 0 || severity === 'warn',
            blocked: severity === 'fail',
            release_interpretation: interp,
            read_only: true
        };
    }
    function buildSections(debrief) {
        return [
            { key: 'outcome', label: 'Outcome', items: [obj(debrief.outcome).label || obj(debrief.outcome).key || 'Unknown', releaseInterpretationText(debrief)], read_only: true },
            { key: 'timeline', label: 'Run timeline', items: arr(debrief.timeline).map(function (t) { return (t.label || t.key || 'Step') + ': ' + (t.value || t.detail || ''); }), read_only: true },
            { key: 'evidence_changes', label: 'Evidence changes', items: arr(debrief.evidence_changes).map(function (c) { return (c.label || c.key || 'Change') + ': ' + c.previous + ' -> ' + c.current; }), read_only: true },
            { key: 'unresolved', label: 'Unresolved blockers / warnings', items: arr(debrief.unresolved_items).map(function (u) { return '[' + (u.status || 'warn') + '] ' + (u.label || u.key || 'Item') + (u.detail ? ': ' + u.detail : ''); }), read_only: true },
            { key: 'recommendations', label: 'Recommendations', items: arr(debrief.recommendations).map(function (r) { return r.label || String(r); }), read_only: true },
            { key: 'after_action', label: 'After-action checklist', items: arr(debrief.after_action_checklist).map(function (a) { return a.label || String(a); }), read_only: true }
        ];
    }
    function buildHandoffChecklist(pkg) {
        pkg = obj(pkg);
        var r = obj(pkg.readiness);
        var c = obj(pkg.counts);
        return [
            { key: 'package_valid', label: 'Package has manifest, debrief, sections, and summary.', status: pkg.manifest ? 'pass' : 'fail', read_only: true },
            { key: 'release_interpretation', label: 'Release interpretation reviewed: ' + (r.release_interpretation || 'unknown'), status: r.blocked ? 'fail' : (r.needs_review ? 'warn' : 'pass'), read_only: true },
            { key: 'evidence_changes_reviewed', label: c.evidence_changes + ' evidence change(s) included for review.', status: c.evidence_changes ? 'warn' : 'pass', read_only: true },
            { key: 'unresolved_reviewed', label: c.unresolved_items + ' unresolved blocker/warning item(s).', status: c.unresolved_items ? 'fail' : 'pass', read_only: true },
            { key: 'recommendations_present', label: c.recommendations + ' recommendation(s) included.', status: c.recommendations ? 'pass' : 'warn', read_only: true },
            { key: 'read_only', label: 'Read-only package; no state mutation or release action.', status: 'pass', read_only: true }
        ];
    }

    function buildPackage(runOrDebrief, opts) {
        opts = opts || {};
        var debrief = buildDebrief(runOrDebrief, opts);
        var manifest = manifestFor(debrief, opts);
        var pkg = {
            version: CMO_WARGAME_EVIDENCE_PACKAGE_VERSION,
            manifest: manifest,
            scenario_fingerprint: manifest.scenario_fingerprint,
            debrief: debrief,
            readiness: readiness(debrief),
            counts: counts(debrief),
            sections: buildSections(debrief),
            source: 'CMO War-Game AAR Evidence Package',
            read_only: true
        };
        pkg.handoff_checklist = buildHandoffChecklist(pkg);
        pkg.summary = buildSummary(pkg);
        return pkg;
    }
    function buildSummary(pkg) {
        pkg = obj(pkg);
        var d = obj(pkg.debrief);
        var m = obj(pkg.manifest);
        var r = obj(pkg.readiness);
        var c = obj(pkg.counts);
        return {
            package_id: m.package_id || 'unknown',
            scenario_fingerprint: m.scenario_fingerprint || pkg.scenario_fingerprint || 'unknown',
            outcome: obj(d.outcome).label || obj(d.outcome).key || 'Unknown',
            release_interpretation: r.release_interpretation || releaseInterpretationText(d),
            release_grade_candidate: !!r.release_grade_candidate,
            training_only: !!r.training_only,
            needs_review: !!r.needs_review,
            blocked: !!r.blocked,
            evidence_changes: c.evidence_changes || 0,
            unresolved_items: c.unresolved_items || 0,
            recommendations: c.recommendations || 0,
            read_only: true
        };
    }
    function validatePackage(pkgOrJson, opts) {
        opts = opts || {};
        var pkg = pkgOrJson;
        var warnings = [];
        if (typeof pkgOrJson === 'string') {
            try { pkg = JSON.parse(pkgOrJson); } catch (e) {
                return { valid: false, status: 'invalid_json', warnings: ['Package JSON could not be parsed.'], read_only: true };
            }
        }
        pkg = obj(pkg);
        if (pkg.version !== CMO_WARGAME_EVIDENCE_PACKAGE_VERSION) warnings.push('Unexpected package version.');
        if (!pkg.manifest || obj(pkg.manifest).package_type !== 'cmo_wargame_evidence_package') warnings.push('Missing or invalid package manifest.');
        if (!pkg.debrief) warnings.push('Missing after-action debrief.');
        if (!arr(pkg.sections).length) warnings.push('No evidence sections included.');
        if (pkg.read_only !== true) warnings.push('Package is not marked read-only.');
        var fp = obj(pkg.manifest).scenario_fingerprint || pkg.scenario_fingerprint || 'unknown';
        var current = opts.current_fingerprint || opts.fingerprint || null;
        var match = !current || String(current) === String(fp);
        if (!match) warnings.push('Scenario fingerprint mismatch.');
        return {
            valid: warnings.length === 0,
            status: warnings.length ? 'needs_review' : 'valid',
            scenario_fingerprint: fp,
            current_fingerprint: current,
            fingerprint_match: match,
            warnings: warnings,
            read_only: true
        };
    }
    function comparePackages(current, previous) {
        current = obj(current && current.version ? current : buildPackage(current || null));
        previous = obj(previous && previous.version ? previous : buildPackage(previous || null));
        var cs = obj(current.summary);
        var ps = obj(previous.summary);
        var keys = ['outcome', 'release_interpretation', 'release_grade_candidate', 'training_only', 'needs_review', 'blocked', 'evidence_changes', 'unresolved_items', 'recommendations'];
        var changes = keys.filter(function (key) { return String(cs[key]) !== String(ps[key]); }).map(function (key) {
            return { key: key, label: key.replace(/_/g, ' '), previous: ps[key], current: cs[key], read_only: true };
        });
        return { changed: !!changes.length, changes: changes, read_only: true };
    }
    function toJson(pkg) { return JSON.stringify(pkg && pkg.version ? pkg : buildPackage(pkg || null), null, 2); }
    function summaryText(pkg) {
        pkg = pkg && pkg.version ? pkg : buildPackage(pkg || null);
        var s = obj(pkg.summary);
        var lines = [
            'CMO War-Game Evidence Package',
            '',
            'Package: ' + (s.package_id || 'unknown'),
            'Scenario fingerprint: ' + (s.scenario_fingerprint || 'unknown'),
            'Outcome: ' + (s.outcome || 'Unknown'),
            'Release interpretation: ' + (s.release_interpretation || 'not release-grade evidence'),
            'Release-grade candidate: ' + (s.release_grade_candidate ? 'yes' : 'no'),
            'Training-only: ' + (s.training_only ? 'yes' : 'no'),
            'Needs review: ' + (s.needs_review ? 'yes' : 'no'),
            'Evidence changes: ' + (s.evidence_changes || 0),
            'Unresolved items: ' + (s.unresolved_items || 0),
            '',
            'Handoff checklist:'
        ];
        arr(pkg.handoff_checklist).forEach(function (item) { lines.push('- [' + String(item.status || '').toUpperCase() + '] ' + item.label); });
        lines.push('');
        lines.push('Read-only package. It does not run, pause, release, mutate doctrine, mutate combat state, call a backend, or write storage.');
        return lines.join('\n');
    }
    function renderPackageHtml(pkg) {
        pkg = pkg && pkg.version ? pkg : buildPackage(pkg || null);
        var s = obj(pkg.summary);
        var html = '<div class="cmo-wargame-evidence-package cmo-wargame-evidence-package--' + (s.blocked ? 'blocked' : (s.needs_review ? 'review' : 'ready')) + '">' +
            '<div class="cmo-wargame-evidence-package-header">' +
                '<span>CMO War-Game Evidence Package</span>' +
                '<span dir="rtl">حزمة أدلة اختبار المناورة</span>' +
                '<strong>' + esc(s.outcome || 'Unknown') + '</strong>' +
            '</div>' +
            '<dl class="cmo-wargame-evidence-package-meta">' +
                '<div><dt>Package</dt><dd><code>' + esc(s.package_id || 'unknown') + '</code></dd></div>' +
                '<div><dt>Fingerprint</dt><dd><code>' + esc(s.scenario_fingerprint || 'unknown') + '</code></dd></div>' +
                '<div><dt>Release interpretation</dt><dd>' + esc(s.release_interpretation || '') + '</dd></div>' +
                '<div><dt>Unresolved</dt><dd>' + esc(s.unresolved_items || 0) + '</dd></div>' +
            '</dl><div class="cmo-wargame-evidence-package-sections">';
        arr(pkg.sections).forEach(function (section) {
            html += '<section><h4>' + esc(section.label || section.key) + '</h4><ul>';
            arr(section.items).forEach(function (item) { html += '<li>' + esc(item) + '</li>'; });
            if (!arr(section.items).length) html += '<li>None.</li>';
            html += '</ul></section>';
        });
        html += '</div><div class="cmo-wargame-evidence-package-handoff"><strong>Handoff checklist</strong><ul>';
        arr(pkg.handoff_checklist).forEach(function (item) { html += '<li class="cmo-wargame-evidence-package--' + esc(item.status || 'warn') + '">' + esc(item.label) + '</li>'; });
        html += '</ul></div><div class="cmo-wargame-evidence-package-source">Source: ' + esc(pkg.source || '') + '. Read-only.</div></div>';
        return html;
    }

    var api = {
        CMO_WARGAME_EVIDENCE_PACKAGE_VERSION: CMO_WARGAME_EVIDENCE_PACKAGE_VERSION,
        buildPackage: buildPackage,
        buildSummary: buildSummary,
        buildHandoffChecklist: buildHandoffChecklist,
        validatePackage: validatePackage,
        comparePackages: comparePackages,
        summaryText: summaryText,
        toJson: toJson,
        renderPackageHtml: renderPackageHtml
    };

    root.RmoozCmoWarGameEvidencePackage = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
