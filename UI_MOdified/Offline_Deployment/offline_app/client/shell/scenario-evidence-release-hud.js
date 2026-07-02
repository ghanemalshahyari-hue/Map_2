/* ============================================================================
 * scenario-evidence-release-hud.js - RMOOZ-QA-108/109/110 + Batch 13 status HUD
 * ----------------------------------------------------------------------------
 * Top-level, read-only scenario-status chip cluster shown near the workspace
 * header so the operator can see release, closeout, coverage, and handoff
 * readiness without opening the Scenario Evidence drawer. Clicking a chip asks
 * the host to open the drawer at the matching evidence section. It never mutates
 * scenario/world-state truth, doctrine, combat state, backend routes, or a
 * database - it only reflects browser-local evidence status surfaces.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_RELEASE_HUD_VERSION = '1.1.0-rmooz-qa-batch-13';

    var RELEASE_STATUS_META = {
        ready_for_release:   { label_en: 'Ready for Release',   label_ar: 'جاهز للاعتماد', cls: 'ready' },
        ready_with_warnings: { label_en: 'Ready with Warnings', label_ar: 'جاهز مع تنبيهات', cls: 'warnings' },
        not_ready:           { label_en: 'Not Ready',           label_ar: 'غير جاهز', cls: 'not-ready' },
        incomplete:          { label_en: 'Incomplete',          label_ar: 'غير مكتمل', cls: 'incomplete' }
    };

    var CLOSEOUT_STATUS_META = {
        ready_for_handoff:     { label_en: 'Ready for Handoff',     label_ar: '&#1580;&#1575;&#1607;&#1586; &#1604;&#1604;&#1578;&#1587;&#1604;&#1610;&#1605;', cls: 'ready' },
        needs_review:          { label_en: 'Needs Review',          label_ar: '&#1610;&#1581;&#1578;&#1575;&#1580; &#1605;&#1585;&#1575;&#1580;&#1593;&#1577;', cls: 'not-ready' },
        ready_with_exceptions: { label_en: 'Ready with Exceptions', label_ar: '&#1580;&#1575;&#1607;&#1586; &#1605;&#1593; &#1575;&#1587;&#1578;&#1579;&#1606;&#1575;&#1569;&#1575;&#1578;', cls: 'warnings' },
        incomplete:            { label_en: 'Incomplete',            label_ar: '&#1594;&#1610;&#1585; &#1605;&#1603;&#1578;&#1605;&#1604;', cls: 'incomplete' }
    };

    var HANDOFF_STATUS_META = {
        accepted:               { label_en: 'Accepted',               label_ar: '&#1605;&#1602;&#1576;&#1608;&#1604;', cls: 'ready' },
        accepted_with_warnings: { label_en: 'Accepted with Warnings', label_ar: '&#1605;&#1602;&#1576;&#1608;&#1604; &#1605;&#1593; &#1578;&#1581;&#1584;&#1610;&#1585;&#1575;&#1578;', cls: 'warnings' },
        rejected:               { label_en: 'Rejected',               label_ar: '&#1605;&#1585;&#1601;&#1608;&#1590;', cls: 'not-ready' },
        pending:                { label_en: 'Pending Decision',       label_ar: '&#1576;&#1575;&#1606;&#1578;&#1592;&#1575;&#1585; &#1575;&#1604;&#1602;&#1585;&#1575;&#1585;', cls: 'incomplete' }
    };

    var CHIP_META = {
        release:  { key_en: 'Release',  key_ar: '&#1575;&#1604;&#1575;&#1593;&#1578;&#1605;&#1575;&#1583;', legacy_en: 'Evidence Release', legacy_ar: '&#1576;&#1608;&#1575;&#1576;&#1577; &#1575;&#1604;&#1571;&#1583;&#1604;&#1577;' },
        closeout: { key_en: 'Closeout', key_ar: '&#1575;&#1604;&#1573;&#1594;&#1604;&#1575;&#1602;' },
        coverage: { key_en: 'Coverage', key_ar: '&#1575;&#1604;&#1578;&#1594;&#1591;&#1610;&#1577;' },
        handoff:  { key_en: 'Handoff',  key_ar: '&#1575;&#1604;&#1578;&#1587;&#1604;&#1610;&#1605;' }
    };

    var RELEASE_UNICODE_AR = {
        ready_for_release: 'جاهز للاعتماد',
        ready_with_warnings: 'جاهز مع تنبيهات',
        not_ready: 'غير جاهز',
        incomplete: 'غير مكتمل'
    };

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function releaseStatusMeta(code) { return RELEASE_STATUS_META[code] || RELEASE_STATUS_META.incomplete; }
    function closeoutStatusMeta(code) { return CLOSEOUT_STATUS_META[code] || CLOSEOUT_STATUS_META.incomplete; }
    function handoffStatusMeta(code) { return HANDOFF_STATUS_META[code] || HANDOFF_STATUS_META.pending; }

    function buildChip(gate) {
        return buildReleaseChip(gate);
    }

    function buildReleaseChip(gate) {
        gate = obj(gate);
        var meta = releaseStatusMeta(gate.status);
        return {
            target: 'release',
            status: gate.status || 'incomplete',
            label_en: gate.status_label_en || meta.label_en,
            label_ar: gate.status_label_ar || meta.label_ar,
            cls: meta.cls,
            releasable: !!gate.releasable,
            scenario_fingerprint: gate.scenario_fingerprint || null
        };
    }

    function buildCloseoutChip(closeout) {
        closeout = obj(closeout);
        var meta = closeoutStatusMeta(closeout.status);
        return {
            target: 'closeout',
            status: closeout.status || 'incomplete',
            label_en: closeout.status_label_en || meta.label_en,
            label_ar: closeout.status_label_ar || meta.label_ar,
            cls: meta.cls
        };
    }

    function buildCoverageChip(coverage) {
        coverage = obj(coverage);
        var pct = Number(coverage.coverage_pct);
        if (!isFinite(pct)) pct = 0;
        var verdict = obj(coverage.verdict);
        var cls = coverage.total ? (pct >= 80 ? 'ready' : (pct >= 50 ? 'warnings' : 'not-ready')) : 'incomplete';
        return {
            target: 'coverage',
            status: String(pct),
            label_en: String(pct) + '%',
            label_ar: verdict.label_ar || '',
            cls: cls,
            coverage_pct: pct,
            verdict_label_en: verdict.label_en || ''
        };
    }

    function buildHandoffChip(acceptance) {
        acceptance = obj(acceptance);
        var meta = handoffStatusMeta(acceptance.decision);
        return {
            target: 'handoff',
            status: acceptance.decision || 'pending',
            label_en: acceptance.decision_label_en || meta.label_en,
            label_ar: acceptance.decision_label_ar || meta.label_ar,
            cls: meta.cls
        };
    }

    function normalizeClusterInput(input) {
        input = obj(input);
        if (input.release_gate || input.closeout || input.coverage || input.acceptance) return input;
        return { release_gate: input };
    }

    function buildCluster(input) {
        var src = normalizeClusterInput(input);
        var chips = {
            release: buildReleaseChip(src.release_gate),
            closeout: buildCloseoutChip(src.closeout),
            coverage: buildCoverageChip(src.coverage),
            handoff: buildHandoffChip(src.acceptance)
        };
        return {
            release: chips.release,
            closeout: chips.closeout,
            coverage: chips.coverage,
            handoff: chips.handoff,
            chips: [chips.release, chips.closeout, chips.coverage, chips.handoff]
        };
    }

    function renderChipHtml(chipOrGate) {
        var chip = (chipOrGate && chipOrGate.cls && chipOrGate.label_en) ? chipOrGate : buildReleaseChip(chipOrGate);
        var target = chip.target || 'release';
        var meta = CHIP_META[target] || CHIP_META.release;
        var legacy = meta.legacy_en || meta.legacy_ar
            ? '<span class="release-hud-legacy" hidden>' + esc(meta.legacy_en || '') + ' ' + (meta.legacy_ar || '') + '</span>'
            : '';
        if (target === 'release') {
            legacy += '<span class="release-hud-legacy-ar" hidden>بوابة الأدلة ' + (RELEASE_UNICODE_AR[chip.status] || '') + '</span>';
        }
        return '<button type="button" class="release-hud-chip release-hud-chip--' + esc(chip.cls) + ' release-hud-chip--' + esc(target) + '"' +
            ' data-scenario-status-open="' + esc(target) + '"' +
            (target === 'release' ? ' data-release-hud-open' : '') +
            ' aria-label="' + esc(meta.legacy_en || meta.key_en) + ': ' + esc(chip.label_en) + ' - open Scenario Evidence">' +
            '<span class="release-hud-key">' +
                '<span class="release-hud-key-en">' + esc(meta.key_en) + '</span>' +
                '<span class="release-hud-key-ar" dir="rtl">' + (meta.key_ar || '') + '</span>' +
            '</span>' +
            '<span class="release-hud-val">' +
                '<strong class="release-hud-status">' + esc(chip.label_en) + '</strong>' +
                '<span class="release-hud-status-ar" dir="rtl">' + (chip.label_ar || '') + '</span>' +
            '</span>' +
            legacy +
            '</button>';
    }

    function renderClusterHtml(clusterOrInput) {
        var cluster = clusterOrInput && clusterOrInput.chips ? clusterOrInput : buildCluster(clusterOrInput);
        return '<div class="release-hud-cluster" data-scenario-status-hud>' +
            cluster.chips.map(renderChipHtml).join('') +
            '</div>';
    }

    function update(mount, statusInput, opts) {
        opts = opts || {};
        if (!mount) return null;
        var cluster = statusInput && statusInput.chips ? statusInput : buildCluster(statusInput);
        mount.innerHTML = renderClusterHtml(cluster);
        mount.removeAttribute('hidden');
        var buttons = mount.querySelectorAll
            ? mount.querySelectorAll('[data-scenario-status-open]')
            : (mount.querySelector ? [mount.querySelector('[data-release-hud-open]')].filter(Boolean) : []);
        Array.prototype.forEach.call(buttons, function (btn) {
            btn.addEventListener('click', function (ev) {
                if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                var target = btn.getAttribute ? (btn.getAttribute('data-scenario-status-open') || 'release') : 'release';
                var chip = cluster[target] || cluster.release;
                if (typeof opts.onOpenTarget === 'function') opts.onOpenTarget(target, chip);
                else if (target === 'release' && typeof opts.onOpen === 'function') opts.onOpen(chip);
            });
        });
        return cluster.release;
    }

    function hide(mount) {
        if (!mount) return;
        mount.innerHTML = '';
        mount.setAttribute('hidden', '');
    }

    var api = {
        SCENARIO_EVIDENCE_RELEASE_HUD_VERSION: SCENARIO_EVIDENCE_RELEASE_HUD_VERSION,
        STATUS_META: RELEASE_STATUS_META,
        RELEASE_STATUS_META: RELEASE_STATUS_META,
        CLOSEOUT_STATUS_META: CLOSEOUT_STATUS_META,
        HANDOFF_STATUS_META: HANDOFF_STATUS_META,
        CHIP_META: CHIP_META,
        buildChip: buildChip,
        buildReleaseChip: buildReleaseChip,
        buildCloseoutChip: buildCloseoutChip,
        buildCoverageChip: buildCoverageChip,
        buildHandoffChip: buildHandoffChip,
        buildCluster: buildCluster,
        renderChipHtml: renderChipHtml,
        renderClusterHtml: renderClusterHtml,
        update: update,
        hide: hide
    };

    root.RmoozScenarioEvidenceReleaseHud = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
