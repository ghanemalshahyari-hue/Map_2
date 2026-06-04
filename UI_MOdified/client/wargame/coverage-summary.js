/**
 * Coverage Summary Panel — Coverage Composition Analysis
 *
 * Provides a read-only summary of air-defense coverage units in the loaded scenario.
 * Groups units by category (SAM, AAA, Radar) and shows approximate ranges.
 * Designed to help operators understand coverage composition without engagement simulation.
 *
 * Exports:
 *   window.AppCoverageSummary.gatherCoverageData(scenario)
 *   window.AppCoverageSummary.renderPanel(scenario)
 */
(function () {
    'use strict';

    // Category definitions for grouping
    const CATEGORIES = {
        SAM: {
            label: 'Surface-to-Air Missiles (SAM)',
            icon: '▲',
            roles: ['air_defense_sam']
        },
        AAA: {
            label: 'Anti-Aircraft Artillery (AAA)',
            icon: '◆',
            roles: ['point_defense_aaa']
        },
        RADAR: {
            label: 'Early Warning & Radar',
            icon: '◎',
            roles: ['early_warning_radar']
        }
    };

    /**
     * Gather coverage data from scenario.
     * Returns: { unitsByCategory, totals, allUnits }
     */
    function gatherCoverageData(scenario) {
        if (!scenario || !Array.isArray(scenario.red_units)) {
            return { unitsByCategory: {}, totals: {}, allUnits: [] };
        }

        const unitsByCategory = {};
        Object.keys(CATEGORIES).forEach(key => {
            unitsByCategory[key] = [];
        });

        const allUnits = [];

        // Filter to coverage units (those with coverage fields OR AD roles)
        scenario.red_units.forEach(unit => {
            if (!unit.role) return;

            const hasCoverageFields = Number.isFinite(unit.weapon_range_km) ||
                                      Number.isFinite(unit.sensor_range_km);
            const isAdRole = Object.values(CATEGORIES)
                .some(cat => cat.roles.includes(unit.role));

            if (!hasCoverageFields && !isAdRole) return;

            // Categorize
            let category = null;
            for (const [key, cat] of Object.entries(CATEGORIES)) {
                if (cat.roles.includes(unit.role)) {
                    category = key;
                    break;
                }
            }
            if (!category) return;

            const coverageUnit = {
                uid: unit.uid || 'unknown',
                label: unit.label || 'Unnamed',
                role: unit.role || '?',
                side: 'RED',
                weapon_range_km: Number.isFinite(unit.weapon_range_km) ? unit.weapon_range_km : null,
                sensor_range_km: Number.isFinite(unit.sensor_range_km) ? unit.sensor_range_km : null,
                bls: unit.bls || null,
                category: category,
                coverage_role: unit.coverage_role || null,
                strength: unit.strength || 0
            };

            unitsByCategory[category].push(coverageUnit);
            allUnits.push(coverageUnit);
        });

        const totals = {
            SAM: unitsByCategory.SAM.length,
            AAA: unitsByCategory.AAA.length,
            RADAR: unitsByCategory.RADAR.length,
            TOTAL: allUnits.length
        };

        return { unitsByCategory, totals, allUnits };
    }

    /**
     * Render coverage summary panel HTML.
     */
    function renderPanel(scenario) {
        const data = gatherCoverageData(scenario);
        if (data.allUnits.length === 0) {
            return '<div class="coverage-summary-empty"><p>No air-defense units with coverage data.</p></div>';
        }

        let html = '<section class="coverage-summary-panel">';

        // Header
        html += '<div class="coverage-summary-header">';
        html += '<h3 class="coverage-summary-title">📡 Air-Defense Coverage</h3>';
        html += '<div class="coverage-summary-stats">';
        html += '<span class="coverage-stat">' + data.totals.SAM + ' SAM</span>';
        html += '<span class="coverage-stat">' + data.totals.AAA + ' AAA</span>';
        html += '<span class="coverage-stat">' + data.totals.RADAR + ' Radar</span>';
        html += '</div>';
        html += '</div>';

        // Advisory
        html += '<div class="coverage-summary-advisory">';
        html += '<small><strong>Note:</strong> Approximate planning overlay only. Not engagement simulation.</small>';
        html += '</div>';

        // Units by category
        for (const [catKey, category] of Object.entries(CATEGORIES)) {
            const units = data.unitsByCategory[catKey] || [];
            if (units.length === 0) continue;

            html += '<div class="coverage-category">';
            html += '<h4 class="coverage-category-title">' + category.icon + ' ' + category.label + ' (' + units.length + ')</h4>';
            html += '<div class="coverage-units-list">';

            units.forEach(u => {
                html += '<div class="coverage-unit-card">';
                html += '<div class="coverage-unit-header">';
                html += '<span class="coverage-unit-label">' + escapeHtml(u.label) + '</span>';
                if (u.bls) {
                    html += '<span class="coverage-unit-base" title="Base">' + escapeHtml(u.bls) + '</span>';
                }
                html += '</div>';

                html += '<div class="coverage-unit-ranges">';
                if (u.weapon_range_km !== null) {
                    html += '<div class="coverage-range weapon">';
                    html += '<span class="range-label">Weapon:</span>';
                    html += '<span class="range-value">' + u.weapon_range_km + ' km</span>';
                    html += '</div>';
                }
                if (u.sensor_range_km !== null) {
                    html += '<div class="coverage-range sensor">';
                    html += '<span class="range-label">Sensor:</span>';
                    html += '<span class="range-value">' + u.sensor_range_km + ' km</span>';
                    html += '</div>';
                }
                html += '</div>';

                if (u.coverage_role) {
                    html += '<div class="coverage-unit-role">' + escapeHtml(u.coverage_role) + '</div>';
                }
                html += '</div>';
            });

            html += '</div>';
            html += '</div>';
        }

        // Total summary
        html += '<div class="coverage-summary-footer">';
        html += '<div class="coverage-total">';
        html += '<strong>Total rings:</strong> ' + data.allUnits.length + ' units';
        if (data.allUnits.some(u => u.weapon_range_km !== null)) {
            html += ', weapon envelopes enabled';
        }
        if (data.allUnits.some(u => u.sensor_range_km !== null)) {
            html += ', sensor coverage enabled';
        }
        html += '</div>';
        html += '<small class="coverage-help">Toggle "Coverage rings" in HUD to show/hide on map</small>';
        html += '</div>';

        html += '</section>';

        return html;
    }

    /**
     * Simple HTML escaping.
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Export
    window.AppCoverageSummary = {
        gatherCoverageData: gatherCoverageData,
        renderPanel: renderPanel
    };
})();
