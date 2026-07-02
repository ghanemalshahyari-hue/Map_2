/* ============================================================================
 * scenario-evidence-release-hud.js - RMOOZ-QA-108/109/110 release status HUD
 * ----------------------------------------------------------------------------
 * Top-level, read-only release-status chip shown near the workspace header so the
 * operator can see the evidence release verdict without opening the Scenario
 * Evidence drawer. Clicking the chip asks the host to open the drawer at the
 * Evidence Release Gate. It never mutates scenario/world-state truth, doctrine,
 * combat state, backend routes, or a database — it only reflects the release gate.
 * ========================================================================== */
(function (root) {
    'use strict';

    var SCENARIO_EVIDENCE_RELEASE_HUD_VERSION = '1.0.0-rmooz-qa-108';

    var STATUS_META = {
        ready_for_release:   { label_en: 'Ready for Release',   label_ar: 'جاهز للاعتماد', cls: 'ready' },
        ready_with_warnings: { label_en: 'Ready with Warnings', label_ar: 'جاهز مع تنبيهات', cls: 'warnings' },
        not_ready:           { label_en: 'Not Ready',           label_ar: 'غير جاهز', cls: 'not-ready' },
        incomplete:          { label_en: 'Incomplete',          label_ar: 'غير مكتمل', cls: 'incomplete' }
    };

    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function statusMeta(code) { return STATUS_META[code] || STATUS_META.incomplete; }

    function buildChip(gate) {
        gate = obj(gate);
        var meta = statusMeta(gate.status);
        return {
            status: gate.status || 'incomplete',
            label_en: gate.status_label_en || meta.label_en,
            label_ar: gate.status_label_ar || meta.label_ar,
            cls: meta.cls,
            releasable: !!gate.releasable,
            scenario_fingerprint: gate.scenario_fingerprint || null
        };
    }

    function renderChipHtml(chipOrGate) {
        var chip = (chipOrGate && chipOrGate.cls && chipOrGate.label_en) ? chipOrGate : buildChip(chipOrGate);
        return '<button type="button" class="release-hud-chip release-hud-chip--' + esc(chip.cls) + '"' +
            ' data-release-hud-open' +
            ' aria-label="Evidence release: ' + esc(chip.label_en) + ' — open the release gate">' +
            '<span class="release-hud-key">' +
                '<span class="release-hud-key-en">Evidence Release</span>' +
                '<span class="release-hud-key-ar" dir="rtl">بوابة الأدلة</span>' +
            '</span>' +
            '<span class="release-hud-val">' +
                '<strong class="release-hud-status">' + esc(chip.label_en) + '</strong>' +
                // label_ar is already entity-encoded upstream (release-gate STATUS_META);
                // inject as-is like the other panels — esc() would double-encode it.
                '<span class="release-hud-status-ar" dir="rtl">' + (chip.label_ar || '') + '</span>' +
            '</span>' +
            '</button>';
    }

    // QA-108/109/110: render the chip into a mount and wire the open callback.
    function update(mount, gateOrChip, opts) {
        opts = opts || {};
        if (!mount) return null;
        var chip = buildChip(gateOrChip && gateOrChip.cls ? null : gateOrChip);
        if (gateOrChip && gateOrChip.cls && gateOrChip.label_en) chip = gateOrChip;
        mount.innerHTML = renderChipHtml(chip);
        mount.removeAttribute('hidden');
        var btn = mount.querySelector('[data-release-hud-open]');
        if (btn && typeof opts.onOpen === 'function') {
            btn.addEventListener('click', function (ev) {
                if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                opts.onOpen(chip);
            });
        }
        return chip;
    }

    function hide(mount) {
        if (!mount) return;
        mount.innerHTML = '';
        mount.setAttribute('hidden', '');
    }

    var api = {
        SCENARIO_EVIDENCE_RELEASE_HUD_VERSION: SCENARIO_EVIDENCE_RELEASE_HUD_VERSION,
        STATUS_META: STATUS_META,
        buildChip: buildChip,
        renderChipHtml: renderChipHtml,
        update: update,
        hide: hide
    };

    root.RmoozScenarioEvidenceReleaseHud = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
