/**
 * OBJ-C: Objective Evidence Panel
 *
 * Displays objective_evidence ledger in a read-only panel.
 * Pure passthrough of ws.derived.objective_evidence — NO calculations, NO new fields.
 *
 * Listens for rmooz:objective-selected event and renders evidence grouped by type:
 * - Combat Evidence (force_ratio, blue_destroyed_count, etc.)
 * - Readiness Evidence (unit_strength_avg, force_availability, etc.)
 * - Control / BLS (bls_control_count, bls_contested_count)
 * - Contacts (contact_confidence_summary)
 * - Doctrine (placeholder for future DOCTRINE-A)
 * - System (debug info, collapsed)
 */

(function() {
    'use strict';

    var api = {
        renderObjectiveEvidence: renderObjectiveEvidence,
        hideObjectiveEvidence: hideObjectiveEvidence
    };

    // Export
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.AppObjectiveEvidencePanel = api;

    /**
     * Evidence grouping schema (must match OBJ-C-PLANNING.md)
     */
    var EVIDENCE_GROUPS = {
        combat: {
            label: 'Combat Assessment',
            i18nKey: 'evidence-group-combat',
            types: [
                'force_ratio',
                'blue_destroyed_count',
                'blue_intact_ratio',
                'red_company_equivalent'
            ]
        },
        readiness: {
            label: 'Force Readiness',
            i18nKey: 'evidence-group-readiness',
            types: [
                'unit_strength_avg',
                'force_availability_ratio',
                'ammunition_sustainability',
                'supply_sustainability',
                'combat_readiness_state',
                'casualty_rate'
            ]
        },
        control: {
            label: 'Area Control',
            i18nKey: 'evidence-group-control',
            types: [
                'bls_control_count',
                'bls_contested_count'
            ]
        },
        contacts: {
            label: 'Situational Awareness',
            i18nKey: 'evidence-group-contacts',
            types: [
                'contact_confidence_summary'
            ]
        },
        doctrine: {
            label: 'Doctrine',
            i18nKey: 'evidence-group-doctrine',
            types: [
                // Future: DOCTRINE-A will add types here
            ]
        },
        system: {
            label: 'System',
            i18nKey: 'evidence-group-system',
            types: [
                'evidence_record_count',
                'last_derivation_step',
                'confidence_average',
                'ledger_complete',
                'degraded_scenario'
            ]
        }
    };

    /**
     * Evidence type labels (i18n keys)
     * Maps evidence_type to display label key
     */
    var EVIDENCE_LABELS = {
        'force_ratio': { label: 'Force Ratio', key: 'evidence-force-ratio' },
        'blue_destroyed_count': { label: 'Blue Destroyed', key: 'evidence-blue-destroyed' },
        'blue_intact_ratio': { label: 'Blue Intact', key: 'evidence-blue-intact' },
        'red_company_equivalent': { label: 'Red Losses (CE)', key: 'evidence-red-losses' },
        'unit_strength_avg': { label: 'Strength Average', key: 'evidence-unit-strength' },
        'force_availability_ratio': { label: 'Force Availability', key: 'evidence-force-avail' },
        'ammunition_sustainability': { label: 'Ammunition', key: 'evidence-ammo' },
        'supply_sustainability': { label: 'Supply', key: 'evidence-supply' },
        'combat_readiness_state': { label: 'Readiness State', key: 'evidence-readiness' },
        'casualty_rate': { label: 'Casualty Rate', key: 'evidence-casualty' },
        'bls_control_count': { label: 'BLS Controlled', key: 'evidence-bls-control' },
        'bls_contested_count': { label: 'BLS Contested', key: 'evidence-bls-contested' },
        'contact_confidence_summary': { label: 'Contacts', key: 'evidence-contacts' },
        'engagement_outcomes_total': { label: 'Engagements', key: 'evidence-engagements' },
        'engagement_effectiveness_ratio': { label: 'Engagement Success', key: 'evidence-engagement-success' },
        'evidence_record_count': { label: 'Evidence Records', key: 'evidence-record-count' },
        'last_derivation_step': { label: 'Last Derivation Step', key: 'evidence-last-step' },
        'confidence_average': { label: 'Confidence Average', key: 'evidence-confidence-avg' },
        'ledger_complete': { label: 'Ledger Complete', key: 'evidence-ledger-complete' },
        'degraded_scenario': { label: 'Degraded Scenario', key: 'evidence-degraded' }
    };

    /**
     * Helper: Convert confidence value to dots (●●● / ●● / ●)
     */
    function confidenceDots(confidence) {
        if (confidence == null) return '●';
        if (confidence >= 0.9) return '●●●';
        if (confidence >= 0.75) return '●●';
        return '●';
    }

    /**
     * Helper: Format evidence value for display
     */
    function formatValue(value, type) {
        if (value == null) return '—';
        if (typeof value === 'number') {
            // For percentages and ratios
            if (type.includes('ratio') || type.includes('availability') || type.includes('sustainability')) {
                if (value <= 1) {
                    return Math.round(value * 100) + '%';
                }
            }
            // Round to 2 decimals
            return Math.round(value * 100) / 100;
        }
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        if (typeof value === 'object') {
            // For contact_confidence_summary and similar
            return JSON.stringify(value);
        }
        return String(value);
    }

    /**
     * Main render function: Display objective evidence
     */
    function renderObjectiveEvidence(ws, objectiveId, stepIndex) {
        if (!ws || !ws.derived || !ws.derived.objective_evidence) {
            hideObjectiveEvidence();
            return;
        }

        var evidence = ws.derived.objective_evidence;
        if (!Array.isArray(evidence) || evidence.length === 0) {
            hideObjectiveEvidence();
            return;
        }

        var panelEl = document.getElementById('objective-evidence-panel');
        if (!panelEl) {
            hideObjectiveEvidence();
            return;
        }

        // Build HTML content
        var html = '';

        // Header
        var obj = (ws.objectives && ws.objectives[0]) || {};
        var objName = obj.name || 'Objective';
        var objStatus = (ws.derived && ws.derived.objective_status_display) || 'UNKNOWN';

        html += '<header class="oep-header">';
        html += '  <span class="oep-eyebrow" data-i18n="oep-eyebrow">OBJECTIVE</span>';
        html += '  <h2 class="oep-title">' + escapeHtml(objName) + '</h2>';
        html += '  <p class="oep-status oep-status-' + objStatus.toLowerCase() + '">' + objStatus + '</p>';
        html += '</header>';

        // Groups
        html += '<div class="oep-groups">';

        for (var groupKey in EVIDENCE_GROUPS) {
            var group = EVIDENCE_GROUPS[groupKey];
            var groupEvidence = evidence.filter(function(r) {
                return group.types.indexOf(r.evidence_type) >= 0;
            });

            // Group header
            html += '<section class="oep-group oep-group-' + groupKey + '">';
            html += '  <h3 class="oep-group-title" data-i18n="' + group.i18nKey + '">' + group.label + '</h3>';

            if (groupEvidence.length === 0) {
                html += '  <p class="oep-empty" data-i18n="evidence-group-empty">Not available</p>';
            } else {
                html += '  <dl class="oep-evidence-list">';

                for (var i = 0; i < groupEvidence.length; i++) {
                    var rec = groupEvidence[i];
                    var label = EVIDENCE_LABELS[rec.evidence_type] || { label: rec.evidence_type, key: '' };
                    var value = formatValue(rec.value, rec.evidence_type);
                    var dots = confidenceDots(rec.confidence);

                    html += '    <div class="oep-evidence-item">';
                    html += '      <dt data-i18n="' + label.key + '">' + label.label + '</dt>';
                    html += '      <dd>';
                    html += '        <span class="oep-value">' + escapeHtml(String(value)) + '</span>';
                    html += '        <span class="oep-dots" title="Confidence: ' + Math.round((rec.confidence || 0.5) * 100) + '%">' + dots + '</span>';
                    html += '      </dd>';
                    html += '      <dd class="oep-source" data-i18n="evidence-source">Source: ' + escapeHtml(rec.source || 'unknown') + '</dd>';
                    html += '    </div>';
                }

                html += '  </dl>';
            }

            html += '</section>';
        }

        html += '</div>';

        // Render
        panelEl.innerHTML = html;
        panelEl.classList.remove('oep-hidden');

        // Apply i18n if available
        if (typeof window.applyI18nToElement === 'function') {
            window.applyI18nToElement(panelEl);
        }
    }

    /**
     * Hide objective evidence panel
     */
    function hideObjectiveEvidence() {
        var panelEl = document.getElementById('objective-evidence-panel');
        if (panelEl) {
            panelEl.classList.add('oep-hidden');
            panelEl.innerHTML = '';
        }
    }

    /**
     * HTML escape utility
     */
    function escapeHtml(text) {
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(c) { return map[c]; });
    }

    /**
     * Listen for objective selection event
     */
    document.addEventListener('rmooz:objective-selected', function(e) {
        var detail = e.detail || {};
        var stepIndex = detail.step_index || 0;

        // Derive world state at this step
        if (typeof window.AppWorldState !== 'undefined' &&
            typeof window.AppWorldState.deriveWorldState === 'function' &&
            typeof window.RmoozScenario !== 'undefined' &&
            window.RmoozScenario.scenario) {

            var ws = window.AppWorldState.deriveWorldState(window.RmoozScenario.scenario, stepIndex);

            // If DB1 enrichment available, apply it
            if (typeof window.AppWorldStateDB !== 'undefined' &&
                typeof window.AppWorldStateDB.enrichWorldState === 'function') {
                ws = window.AppWorldStateDB.enrichWorldState(ws);
            }

            renderObjectiveEvidence(ws, detail.objective_id, stepIndex);
        } else {
            hideObjectiveEvidence();
        }
    });

    /**
     * Hide panel when selection clears (e.g., clicking on empty map)
     */
    if (typeof window !== 'undefined' && window.document) {
        window.document.addEventListener('rmooz:selection-cleared', hideObjectiveEvidence);
    }

})();
