/**
 * MDMP external adapter — MDMP-EXTERNAL-1 / G-2 (build contract:
 * docs/coa-wargame-design.md, owner rulings D1–D10 of 2026-06-11).
 *
 * Maps the other app's MDMP-stage JSON (steps 1–5, detected by
 * operational-brief.detectMdmp) into the canonical Operational Brief:
 *
 *   step 3 (coa_development)  → courses_of_action[] (2 BLUE COAs) +
 *                               force_comparison (9 categories, qualitative,
 *                               strengths/weaknesses ×5 functions)
 *   step 4 (coa_analysis)     → courses_of_action[].wargame_turns[] — the
 *                               action → reaction → counteraction triads of
 *                               the staff wargame (7 event families ×2 COAs),
 *                               Most_likely_enemy_action → RED ML COA (D3),
 *                               expected_enemy_reaction per COA
 *   step 5 (coa_comparison)   → per-COA evaluation (5 criteria) +
 *                               coa_recommendation (rationale only —
 *                               decided_by is OPERATOR-ONLY, never AI)
 *   step 1 / staff brief      → mission / intent / constraints / assumptions /
 *                               timeline / AO / side summaries
 *
 * Hard rules honored:
 *   • PLACEHOLDER SCRUBBING — template values (`<نص>`, `…`, `"..."`,
 *     `يصدر لاحقاً`) are treated as MISSING, recorded in missing_information,
 *     and never copied into brief content (no-invention).
 *   • CITATIONS — every populated field records { file, keys[] } so the
 *     review screen and WHITE rulings can point back at the source.
 *   • Everything emitted is ai_assisted + needs_review + confidence:'low'
 *     (L6); white_decision/result on every turn start EMPTY (pending the
 *     G-5 wargame; D2 — no silent adjudication).
 *   • Suffix families: `<k>` = COA 1; `<k>2` / `<k>_2` / `<k>_c2` = COA 2.
 *
 * Entry point: adaptMdmpBundle(entries) — entries: [{ filename, data }].
 * Deterministic, no LLM, no I/O.
 */
'use strict';

const BRIEF = require('./operational-brief');

// ── Placeholder scrubbing ───────────────────────────────────────────
// External templates mark unfilled fields with angle brackets, ellipses or
// "issued later". Anything matching is MISSING, never content.
function isPlaceholder(s) {
    if (typeof s !== 'string') return true;
    const t = s.trim();
    if (!t) return true;
    if (/^[.…]{1,4}$/.test(t)) return true;                       // "...", "…"
    if (t.startsWith('…') || t.startsWith('...')) return true;     // "…generated text…"
    if (t.startsWith('<') && t.endsWith('>')) return true;         // "<نص>"
    if (t.startsWith('<') && t.indexOf('>') !== -1 && t.length < 120) return true;
    if (t.startsWith('يصدر لاحق')) return true;                    // "issued later"
    return false;
}
// value(): scrubbed read. Returns the trimmed string or null when missing.
function val(obj, key) {
    const v = obj ? obj[key] : undefined;
    if (typeof v !== 'string' || isPlaceholder(v)) return null;
    return normalizePlatformText(v.trim());
}

function clone(o) {
    return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}

function normalizePlatformText(value) {
    if (typeof value === 'string') return value.replace(/\b(?:figter|fighter)\b/gi, 'مقاتلة / طائرة');
    if (Array.isArray(value)) return value.map(normalizePlatformText);
    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach(k => { out[k] = normalizePlatformText(value[k]); });
        return out;
    }
    return value;
}

function rawStructuredValue(obj, key) {
    const v = obj ? obj[key] : undefined;
    if (typeof v === 'string') return isPlaceholder(v) ? null : normalizePlatformText(v.trim());
    if (Array.isArray(v)) return normalizePlatformText(v);
    if (v && typeof v === 'object') return normalizePlatformText(clone(v));
    return null;
}

function aiReviewSource(file, key) {
    return {
        source_type: 'ai_candidate_from_external_llm',
        needs_review: true,
        source: { file, key },
    };
}

function defaultTaskAssembly() {
    return {
        summary: 'يصدر لاحقاً',
        supporting_tasks: [],
        commander_review_required: true,
        tasking_status: 'needs_review',
    };
}

function buildTaskAssembly(data, file) {
    const raw = rawStructuredValue(data, 'task_assembly');
    if (!raw) {
        return Object.assign(defaultTaskAssembly(), aiReviewSource(file, 'task_assembly'));
    }
    const out = (raw && typeof raw === 'object' && !Array.isArray(raw))
        ? Object.assign(defaultTaskAssembly(), raw)
        : Object.assign(defaultTaskAssembly(), { summary: String(raw) });
    if (!Array.isArray(out.supporting_tasks)) out.supporting_tasks = [];
    out.commander_review_required = true;
    out.tasking_status = out.tasking_status || 'needs_review';
    return Object.assign(out, aiReviewSource(file, 'task_assembly'));
}

function buildUnitsDuty(data, file) {
    const raw = rawStructuredValue(data, 'Units_Duty');
    if (!raw) return null;
    const out = (raw && typeof raw === 'object' && !Array.isArray(raw))
        ? raw
        : { summary: String(raw), duties: [] };
    return Object.assign(out, aiReviewSource(file, 'Units_Duty'));
}

function addMissing(state, item) {
    if (state.missing_information.indexOf(item) === -1) state.missing_information.push(item);
}

function addPlacementCandidatesFromText(text, file, key, state) {
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) return;
    const decimal = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/g;
    let m;
    while ((m = decimal.exec(raw))) {
        const lat = Number(m[1]), lon = Number(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            state.placement_candidates.push({
                mention: m[0], coordinate_format: 'decimal',
                lat, lon, placement_type: 'coordinate_candidate',
                exact_unit_position: false, needs_review: true, confidence: 'low',
                source_type: 'ai_candidate_from_external_llm',
                source: { type: 'external_json', file, key, origin: 'mdmp_step1', confidence: 'low' },
                warnings: ['coordinate_requires_location_intelligence_review'],
            });
        }
    }
    const mgrs = /\b(?:\d{1,2}\s*)?[A-Z]{1,3}\s+[A-Z]{1,3}\s+\d{3,}\s+\d{3,}\b|\b\d{1,2}\s*[A-Z]{1,3}\s*[A-Z]{0,2}\s*\d{3,}\s*\d{3,}\b/gi;
    while ((m = mgrs.exec(raw))) {
        state.placement_candidates.push({
            mention: m[0], coordinate_format: 'mgrs_candidate',
            lat: null, lon: null, placement_type: 'coordinate_candidate',
            exact_unit_position: false, needs_review: true, confidence: 'low',
            source_type: 'ai_candidate_from_external_llm',
            source: { type: 'external_json', file, key, origin: 'mdmp_step1', confidence: 'low' },
            warnings: ['mgrs_not_converted', 'coordinate_requires_location_intelligence_review'],
        });
    }
}

function firstText(obj, keys) {
    for (const k of keys) {
        const v = obj && obj[k];
        if (typeof v === 'string' && !isPlaceholder(v)) return normalizePlatformText(v.trim());
    }
    return null;
}

function firstNumber(obj, keys) {
    for (const k of keys) {
        const v = obj && obj[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
}

function baseCoords(base) {
    const lat = firstNumber(base, ['lat', 'latitude', 'y']);
    const lon = firstNumber(base, ['lon', 'lng', 'longitude', 'x']);
    if (lat !== null && lon !== null) return { lat, lon };
    const c = base && (base.coordinates || base.coord || base.location);
    if (Array.isArray(c) && c.length >= 2) {
        const a = Number(c[0]), b = Number(c[1]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
            return Math.abs(a) <= 90 ? { lat: a, lon: b } : { lat: b, lon: a };
        }
    }
    if (c && typeof c === 'object') return baseCoords(c);
    return { lat: null, lon: null };
}

function baseCode(ar, en) {
    const s = String(en || ar || '');
    if (/hamedan|hamadan/i.test(s) || s.indexOf('\u0647\u0645\u062f\u0627\u0646') !== -1) return 'HAMEDAN';
    if (/chabahar/i.test(s) || s.indexOf('\u062c\u0627\u0628\u0647\u0627\u0631') !== -1) return 'CHABAHAR';
    if (/bandar\s*abbas/i.test(s) || s.indexOf('\u0628\u0646\u062f\u0631') !== -1) return 'BANDARABBAS';
    const ascii = s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    return (ascii[ascii.length - 1] || 'BASE').slice(0, 18);
}

function platformCode(platform) {
    const p = String(platform || '');
    if (/F\s*-\s*14A/i.test(p)) return 'F14A';
    if (/F\s*-\s*14/i.test(p)) return 'F14';
    if (/F\s*-\s*4/i.test(p)) return 'F4';
    const ascii = p.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 14);
    return ascii || 'UNIT';
}

function typeArForUnit(unit, platform) {
    const t = firstText(unit, ['type_ar', 'type', 'platform_type']);
    if (t) return t;
    if (/\b(?:figter|fighter)\b|F\s*-\s*(?:14|4)/i.test(String(platform || ''))) return '\u0645\u0642\u0627\u062a\u0644\u0629 / \u0637\u0627\u0626\u0631\u0629';
    return '\u0648\u062d\u062f\u0629';
}

function addEnemyAirBases(data, file, state) {
    const rawEnemy = rawStructuredValue(data, 'enemy_forces');
    if (rawEnemy && typeof rawEnemy === 'object' && !Array.isArray(rawEnemy) && !state.enemy_forces) {
        state.enemy_forces = rawEnemy;
    }
    const bases = rawEnemy && typeof rawEnemy === 'object' && Array.isArray(rawEnemy.air_bases) ? rawEnemy.air_bases : [];
    bases.forEach((base, bi) => {
        if (!base || typeof base !== 'object') return;
        const baseNameAr = firstText(base, ['base_name_ar', 'name_ar', 'base_ar', 'name']) || '';
        const baseNameEn = firstText(base, ['base_name_en', 'name_en', 'base_en']) || '';
        const coords = baseCoords(base);
        const code = baseCode(baseNameAr, baseNameEn);
        const baseObj = Object.assign({
            id: 'RED-BASE-' + code,
            side: 'RED',
            country: firstText(base, ['country']) || '\u0625\u064a\u0631\u0627\u0646',
            base_name_ar: baseNameAr,
            base_name_en: baseNameEn,
            site_type: firstText(base, ['site_type', 'type', 'location_type']) || 'airbase',
            lat: coords.lat,
            lon: coords.lon,
            exact_unit_position: false,
            needs_review: true,
            confidence: (coords.lat !== null && coords.lon !== null) ? 'medium' : 'low',
            warning: 'base_known_exact_unit_position_unknown',
            warnings: ['base_known_exact_unit_position_unknown'],
            source_type: 'ai_candidate_from_external_llm',
        }, { source: { type: 'external_json', file, key: 'enemy_forces.air_bases[' + bi + ']', origin: 'mdmp_step1', confidence: 'low' } });
        state.enemy_bases.push(baseObj);
        if (coords.lat === null || coords.lon === null) addMissing(state, 'enemy_forces.air_bases[' + bi + '].coordinates');
        else {
            state.placement_candidates.push({
                mention: baseNameAr || baseNameEn || ('enemy air base ' + (bi + 1)),
                coordinate_format: 'base_anchor',
                lat: coords.lat,
                lon: coords.lon,
                placement_type: 'base_location_anchor',
                side: 'RED',
                base_name_ar: baseNameAr,
                base_name_en: baseNameEn,
                site_type: firstText(base, ['site_type', 'type', 'location_type']) || 'airbase',
                exact_unit_position: false,
                needs_review: true,
                confidence: 'medium',
                source_type: 'ai_candidate_from_external_llm',
                source: { type: 'external_json', file, key: 'enemy_forces.air_bases[' + bi + ']', origin: 'mdmp_step1', confidence: 'low' },
                warnings: ['base_known_exact_unit_position_unknown', 'coordinate_requires_location_intelligence_review'],
            });
        }
        const units = Array.isArray(base.units) ? base.units : [];
        units.forEach((unit, ui) => {
            if (!unit || typeof unit !== 'object') return;
            const platform = firstText(unit, ['platform', 'name', 'unit', 'aircraft']) || 'unknown';
            const estimated = firstNumber(unit, ['estimated_count', 'count', 'quantity']);
            if (estimated === null) addMissing(state, 'enemy_forces.air_bases[' + bi + '].units[' + ui + '].estimated_count');
            state.proposed_units.push({
                id: 'RED-' + platformCode(platform) + '-' + code,
                side: 'RED',
                country: firstText(base, ['country']) || '\u0625\u064a\u0631\u0627\u0646',
                base_name_ar: baseNameAr,
                base_name_en: baseNameEn,
                lat: coords.lat,
                lon: coords.lon,
                platform: platform,
                type_ar: typeArForUnit(unit, platform),
                estimated_count: estimated,
                source_type: 'ai_candidate_from_external_llm',
                needs_review: true,
                confidence: (coords.lat !== null && coords.lon !== null && estimated !== null) ? 'medium' : 'low',
                exact_unit_position: false,
                warning: 'base_known_exact_unit_position_unknown',
                warnings: ['base_known_exact_unit_position_unknown', 'ai_information_requires_review'],
                source: { type: 'external_json', file, key: 'enemy_forces.air_bases[' + bi + '].units[' + ui + ']', origin: 'mdmp_step1', confidence: 'low' },
            });
        });
    });
}

const STAFF2_SECTIONS = {
    intel_summary: ['Terrain', 'Weather', 'First_light', 'Last_light', 'Moon',
        'Effect_of_Weather_and_Terrain_on_Operations', 'Composition', 'Deployments',
        'Force_Coverage', 'Morale', 'Training', 'Recent_and_Ongoing_Activities',
        'Enemy_Tactics_in_Exposure_Operations_Phase1_Preparation',
        'Enemy_Tactics_in_Exposure_Operations_Phase2_Preparation',
        'Enemy_Tactics_in_Exposure_Operations_Phase3_Main_Attack',
        'Intentions_and_Objectives', 'Counter_Intelligence_Observations', 'Conclusions'],
    enemy_capabilities: ['Enemy_Capabilities'],
    operations: ['join_op_mission', 'Join_op_purp', 'joint_ops_how', 'joint_ops_desired_end',
        'Exc_command_mission', 'Exc_command_purp', 'Exc_command_main_mission',
        'joint_ops_desired_end2', 'Land_component_force', 'Attached_units',
        'Force_Composition', 'Training_Readiness_Level', 'Combat_Effectiveness',
        'Operational_Conclusions'],
    hr: ['Force_Cover', 'Combat_Morale', 'Reinforcements', 'Projected_Casualties',
        'Control_and_Coordination', 'Prisoners_of_War', 'Civilian_Users',
        'Civilian_Prisoners_and_Detainees', 'Human_Force_Conclusions'],
    logistics: ['Logistical_Rations', 'Logistical_sustainment', 'Fuel', 'ammunition',
        'Spare_parts', 'Engineering_materiel', 'Transportation', 'Maintenance',
        'Field_Hospitals', 'Supply_Conclusions'],
};

const STAFF2_FILE_SECTION = {
    AAAA: 'intel_summary',
    BBBB: 'enemy_capabilities',
    CCCC: 'operations',
    DDDD: 'hr',
    EEEE: 'logistics',
};

const STAFF2_MISSING_LABEL = {
    intel_summary: 'Intel Summary',
    enemy_capabilities: 'Enemy Capabilities',
    operations: 'Operations',
    hr: 'HR',
    logistics: 'Logistics',
};

function newStaffBrief2(file) {
    return {
        sections: {
            intel_summary: {},
            enemy_capabilities: {},
            operations: {},
            hr: {},
            logistics: {},
        },
        external_step: 2,
        package_type: 'Staff_Brief_2',
        raw_external_json: { files: [] },
        duplicate_key_warnings: [],
        conflicts: [],
        missing_information: [],
        source_type: 'ai_candidate_from_external_llm',
        needs_review: true,
        source: { file, key: 'Staff_Brief_2' },
    };
}

function addStaff2Field(staff, sectionName, key, value, file, sourceKey) {
    if (value == null) return;
    const section = staff.sections[sectionName];
    if (!section) return;
    if (Object.prototype.hasOwnProperty.call(section, key)) {
        const old = section[key] && section[key].value;
        if (JSON.stringify(old) !== JSON.stringify(value)) {
            staff.duplicate_key_warnings.push({
                key,
                section: sectionName,
                kept: old,
                ignored: value,
                source_type: 'ai_candidate_from_external_llm',
                needs_review: true,
                source: { file, key: sourceKey || key },
            });
        }
        return;
    }
    section[key] = {
        value,
        source_type: 'ai_candidate_from_external_llm',
        needs_review: true,
        source: { file, key: sourceKey || key },
    };
}

function mapStaff2Object(staff, obj, file, prefix, onlySection) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    const sectionsRoot = obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections) ? obj.sections : obj;
    Object.keys(STAFF2_SECTIONS).forEach(sectionName => {
        if (onlySection && sectionName !== onlySection) return;
        const nested = sectionsRoot[sectionName];
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
            Object.keys(nested).forEach(k => {
                const raw = rawStructuredValue(nested, k);
                if (raw != null) addStaff2Field(staff, sectionName, k, raw, file, (prefix ? prefix + '.' : '') + sectionName + '.' + k);
            });
        }
    });
    Object.keys(STAFF2_SECTIONS).forEach(sectionName => {
        if (onlySection && sectionName !== onlySection) return;
        STAFF2_SECTIONS[sectionName].forEach(k => {
            const raw = rawStructuredValue(obj, k);
            if (raw != null) addStaff2Field(staff, sectionName, k, raw, file, (prefix ? prefix + '.' : '') + k);
        });
    });
}

function rebuildStaff2Conflicts(staff) {
    const seen = {};
    Object.keys(staff.sections).forEach(sectionName => {
        Object.keys(staff.sections[sectionName]).forEach(k => {
            const item = staff.sections[sectionName][k];
            const serialized = JSON.stringify(item && item.value);
            if (!seen[k]) seen[k] = [];
            seen[k].push({ section: sectionName, value: item && item.value, serialized });
        });
    });
    staff.conflicts = [];
    Object.keys(seen).forEach(k => {
        const vals = Array.from(new Set(seen[k].map(x => x.serialized)));
        if (seen[k].length > 1 && vals.length > 1) {
            staff.conflicts.push({
                key: k,
                type: 'duplicate_key_different_values_across_sections',
                entries: seen[k],
                needs_review: true,
                source_type: 'ai_candidate_from_external_llm',
            });
        }
    });
}

function mapStaffBrief2(data, file, state) {
    const staff = state.staff_brief_2 || newStaffBrief2(file);
    staff.raw_external_json.files.push({ file, data: clone(data) });
    const fileStem = String(file || '').replace(/\.[^.]+$/, '').toUpperCase();
    const onlySection = STAFF2_FILE_SECTION[fileStem] || null;
    const wrapped = rawStructuredValue(data, 'Staff_Brief_2') || rawStructuredValue(data, 'staff_brief_2');
    if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) mapStaff2Object(staff, wrapped, file, 'Staff_Brief_2', onlySection);
    mapStaff2Object(staff, data, file, '', onlySection);
    rebuildStaff2Conflicts(staff);
    staff.missing_information = [];
    state.missing_information = state.missing_information.filter(m => String(m).indexOf('Staff Brief 2 missing section: ') !== 0);
    Object.keys(staff.sections).forEach(sectionName => {
        if (!Object.keys(staff.sections[sectionName]).length) {
            const missKey = 'Staff Brief 2 missing section: ' + STAFF2_MISSING_LABEL[sectionName];
            if (staff.missing_information.indexOf(missKey) === -1) staff.missing_information.push(missKey);
            addMissing(state, missKey);
        }
    });
    state.staff_brief_2 = staff;
    if (!state.external_raw.staff_brief_2) state.external_raw.staff_brief_2 = { files: [] };
    state.external_raw.staff_brief_2.files.push({ file, data: clone(data) });
    if (!state.enemy_summary && staff.sections.enemy_capabilities.Enemy_Capabilities) {
        state.enemy_summary = { text: String(staff.sections.enemy_capabilities.Enemy_Capabilities.value), file, key: 'Enemy_Capabilities' };
    }
    if (staff.sections.enemy_capabilities.Enemy_Capabilities) {
        state.enemy_capabilities.push({
            text: String(staff.sections.enemy_capabilities.Enemy_Capabilities.value),
            source_type: 'ai_candidate_from_external_llm',
            needs_review: true,
            source: { file, key: 'Enemy_Capabilities' },
        });
    }
}

// COA-2 suffix families: <k>2 (step3), <k>_2 (step4), <k>_c2 (step5).
function coaKeyName(obj, base, idx) {
    if (idx === 0) return (obj && base in obj) ? base : null;
    for (const k of [base + '2', base + '_2', base + '_c2']) {
        if (obj && k in obj) return k;
    }
    return null;
}
// Scrubbed read of a COA-indexed key; returns { value, key } (key = the
// actual source key name, for citations).
function coaVal(obj, base, idx) {
    const k = coaKeyName(obj, base, idx);
    if (!k) return { value: null, key: null };
    return { value: val(obj, k), key: k };
}

// ── COA scaffold (D9 — every locked field present even when empty) ──
function newCoa(id, side, name, nameEn) {
    return {
        id, side,
        name, name_en: nameEn,
        intent: null,
        phases: [],
        unit_tasking: [],            // filled by G-4 (Unit Tasking Mode)
        wargame_turns: [],
        expected_enemy_reaction: null,
        counteraction: null,
        risks: [],
        assumptions: [],
        missing_information: [],
        confidence: 'low',
        needs_review: true,
        ai_assisted: true,
        source_citations: [],
        // non-locked extras the panel renders when present:
        fires: [], summary: null, task_organization: null,
        own_forces_summary: null, support_elements: {}, evaluation: null,
        status: 'proposed',
    };
}
function cite(target, file, keys) {
    const ks = keys.filter(Boolean);
    if (!ks.length) return;
    const existing = target.source_citations.find(c => c.file === file);
    if (existing) {
        for (const k of ks) if (existing.keys.indexOf(k) === -1) existing.keys.push(k);
    } else {
        target.source_citations.push({ file, keys: ks });
    }
}
function miss(target, what) {
    if (target.missing_information.indexOf(what) === -1) target.missing_information.push(what);
}

// ── step 3 — COA development ────────────────────────────────────────
const FORCE_CATEGORIES = [
    ['infantry_battalions', 'Infantry_Battalion_total_our',            'Infantry_Battalion_total_enemy'],
    ['armor',               'Units_of_Tanks_armor_total_our',          'Units_of_Tanks_armor_total_enemy'],
    ['reconnaissance',      'Reconnaissance_units_total_our',          'Reconnaissance_units_total_enemy'],
    ['anti_armor',          'Units_of_armor_resistance_total_our',     'Units_of_armor_resistance_total_enemy'],
    ['helicopters',         'Helicopter_units_total_our',              'Helicopter_units_total_enemy'],
    ['mortars',             'mortar_fire_total_our_forces',            'mortar_fire_total_enemy_forces'],
    ['medium_artillery',    'medium_artillery_fire_total_our_forces',  'medium_artillery_fire_total_enemy_forces'],
    ['engineering',         'Engineering_units_total_our_forces',      'Engineering_units_total_enemy_forces'],
    ['air_defense',         'Air_defense_our_forces',                  'Air_defense_enemy_forces'],
];
const SW_FUNCTIONS = ['maneuverability', 'firepower', 'protection', 'leadership', 'information'];

function sideCount(obj, key) {
    const v = obj ? obj[key] : null;
    if (!v || typeof v !== 'object') return null;
    return {
        count: Number.isFinite(v.count) ? v.count : 0,
        unit_type: typeof v.unit_type === 'string' ? v.unit_type : null,
        weight: Number.isFinite(v.weight) ? v.weight : 0,
    };
}

function mapStep3(data, file, state) {
    // Force comparison — structured counts pass through verbatim (zeros are
    // faithful source data, not invention).
    const categories = [];
    for (const [key, ourK, enemyK] of FORCE_CATEGORIES) {
        const our = sideCount(data, ourK), enemy = sideCount(data, enemyK);
        if (our || enemy) categories.push({ key, our, enemy, source_keys: [ourK, enemyK] });
    }
    const sw = {};
    for (const fn of SW_FUNCTIONS) {
        const e = data['Strengths_and_weaknesses_of_the_enemy_in_terms_of_' + fn];
        const o = data['Strengths_and_weaknesses_of_our_forces_in_terms_of_' + fn];
        const pick = x => (x && typeof x === 'object')
            ? { strengths: (typeof x.Strengths === 'string' && !isPlaceholder(x.Strengths)) ? x.Strengths.trim() : null,
                weaknesses: (typeof x.weaknesses === 'string' && !isPlaceholder(x.weaknesses)) ? x.weaknesses.trim() : null }
            : null;
        const our = pick(o), enemy = pick(e);
        if (our || enemy) sw[fn] = { our, enemy };
    }
    if (categories.length || Object.keys(sw).length) {
        state.force_comparison = {
            categories,
            qualitative: {
                training:          { our: val(data, 'The_level_of_training_in_our_forces'), enemy: val(data, 'Level_of_training_of_enemy_forces') },
                morale:            { our: val(data, 'The_morale_of_our_forces'),            enemy: val(data, 'Enemy_forces_morale') },
                combat_experience: { our: val(data, 'Combat_experience_of_our_forces'),     enemy: val(data, 'Combat_experience_of_enemy_forces') },
                technology:        { our: val(data, 'The_level_of_technology_in_our_forces'), enemy: val(data, 'The_level_of_technology_of_the_enemy_forces') },
                command_center:    { our: val(data, 'Our_forces_command_center'),           enemy: val(data, 'Enemy_forces_command_center') },
                doctrine:          { our: val(data, 'The_combat_doctrine_of_our_forces'),   enemy: val(data, 'The_combat_doctrine_of_enemy_forces') },
                air_situation: val(data, 'The_air_situation'),
                firepower_inference: val(data, 'Inference_of_firepower_of_the_forces'),
                deception: val(data, 'Comparison_of_superiority_of_forces_with_Deception_and_camouflage'),
                mobility_superiority: val(data, 'Percentage_of_superiority_of_forces_with_Mobility'),
            },
            strengths_weaknesses: sw,
            source: { file },
        };
    }
    const ourSummary = val(data, 'Our_available_forces');
    if (ourSummary) state.friendly_summary = state.friendly_summary || { text: ourSummary, file, key: 'Our_available_forces' };
    const enemySummary = val(data, 'Enemy_forces_available');
    if (enemySummary) state.enemy_summary = state.enemy_summary || { text: enemySummary, file, key: 'Enemy_forces_available' };

    // Two BLUE COAs.
    for (let idx = 0; idx < 2; idx++) {
        const coa = state.blue[idx];
        // Intent block exists only on COA 1 in this producer's schema.
        for (const [field, base] of [['intent', 'task'], ['commander_intent', 'commander_intent'],
                                     ['main_duties', 'main_duties'], ['desired_end_state', 'desired_end_state'],
                                     ['critical_operations', 'critical_operations']]) {
            const { value, key } = coaVal(data, base, idx);
            if (value) {
                if (field === 'intent') coa.intent = value;
                else coa[field] = value;
                cite(coa, file, [key]);
            } else if (idx === 0 && field === 'intent') {
                miss(coa, 'intent (task) — placeholder/absent in ' + file);
            }
        }
        // Phases: prep + three maneuver phases.
        const prep = coaVal(data, 'Boot_operations', idx);
        if (prep.value) { coa.phases.push({ index: 0, kind: 'preparation', label: prep.value }); cite(coa, file, [prep.key]); }
        ['phose_one', 'phose_two', 'phose_three'].forEach((base, i) => {
            const { value, key } = coaVal(data, base, idx);
            if (value) { coa.phases.push({ index: i + 1, kind: 'maneuver', label: value }); cite(coa, file, [key]); }
            else miss(coa, 'maneuver phase ' + (i + 1) + ' — placeholder/absent in ' + file);
        });
        // Fires.
        const art = coaVal(data, 'Artillery', idx);
        if (art.value) { coa.fires.push({ index: 0, label: art.value }); cite(coa, file, [art.key]); }
        ['Artillery_fires_phose_one', 'Artillery_fires_phose_two', 'Artillery_fires_phose_three'].forEach((base, i) => {
            const { value, key } = coaVal(data, base, idx);
            if (value) { coa.fires.push({ index: i + 1, label: value }); cite(coa, file, [key]); }
        });
        // Sustainment + risk.
        const sus = coaVal(data, 'Operations_and_maintenance', idx);
        if (sus.value) { coa.support_elements.sustainment = sus.value; cite(coa, file, [sus.key]); }
        const risk = coaVal(data, 'Acceptance_of_packaging_risk', idx);
        if (risk.value) { coa.risks.push({ text: risk.value, source: file }); cite(coa, file, [risk.key]); }
        else miss(coa, 'risk acceptance — placeholder/absent in ' + file);
    }
    // COA-1-section support elements.
    const coa1 = state.blue[0];
    for (const [k, label] of [['Reserve', 'reserve'], ['Mobilization_leadership', 'mobilization_leadership'],
                              ['Close_air_support', 'close_air_support'],
                              ['Intelligence_reconnaissance_and_surveillance', 'isr']]) {
        const v = val(data, k);
        if (v) { coa1.support_elements[label] = v; cite(coa1, file, [k]); }
    }
}

// ── step 4 — COA analysis (the staff wargame) ───────────────────────
// Seven event families, each an action/reaction/counteraction triad.
const TURN_FAMILIES = [
    { trigger_en: 'Exposure in assembly areas',            trigger_ar: 'الانكشاف في مناطق التجمع',
      acting: 'exposure_in_acting_assembly_area', reaction: 'exposure_in_reaction_assembly_area', counter: 'exposure_in_counter_action_assembly_area' },
    { trigger_en: 'Movement from assembly to formation',   trigger_ar: 'الحركة من التجمع إلى التشكيل',
      acting: 'movement_from_assembly_to_acting_form', reaction: 'movement_from_assembly_to_reaction_form', counter: 'movement_from_assembly_to_counter_action_form' },
    { trigger_en: 'Contact with security forces',          trigger_ar: 'التماس مع قوات الأمن',
      acting: 'contact_with_security_forces_acting_area', reaction: 'contact_with_security_forces_reaction_area', counter: 'contact_with_security_forces_counter_action_area' },
    { trigger_en: 'Crossing LD & breaching minefields',    trigger_ar: 'عبور خط الانطلاق وفتح الثغرات',
      acting: 'crossing_LD_and_breaching_mines_acting', reaction: 'crossing_LD_and_breaching_mines_reaction', counter: 'crossing_LD_and_breaching_mines_counter_action' },
    { trigger_en: 'Combat on objectives — phase 1',        trigger_ar: 'القتال على الأهداف — المرحلة الأولى',
      acting: 'combat_on_objectives_acting_phase1', reaction: 'combat_on_objectives_reaction_phase1', counter: 'combat_on_objectives_counter_action_phase1' },
    { trigger_en: 'Combat on objectives — phase 2',        trigger_ar: 'القتال على الأهداف — المرحلة الثانية',
      acting: 'combat_on_objectives_acting_phase2', reaction: 'combat_on_objectives_reaction_phase2', counter: 'combat_on_objectives_counter_action_phase2' },
    { trigger_en: 'Transition to defense',                 trigger_ar: 'التحول إلى الدفاع',
      acting: 'transition_to_defense_acting', reaction: 'transition_to_defense_reaction', counter: 'transition_to_defense_counter_action' },
];

function mapStep4(data, file, state) {
    for (let idx = 0; idx < 2; idx++) {
        const coa = state.blue[idx];
        // Phases from the possible-operation narrative (enrich when step 3 absent).
        ['possible_operation_phase1', 'possible_operation_phase2', 'possible_operation_phase3'].forEach((base, i) => {
            const { value, key } = coaVal(data, base, idx);
            if (value && !coa.phases.some(p => p.index === i + 1)) {
                coa.phases.push({ index: i + 1, kind: 'maneuver', label: value });
                cite(coa, file, [key]);
            }
        });
        // Wargame turns — only when at least one beat carries real content.
        TURN_FAMILIES.forEach((fam, t) => {
            const a = coaVal(data, fam.acting, idx);
            const r = coaVal(data, fam.reaction, idx);
            const c = coaVal(data, fam.counter, idx);
            if (!a.value && !r.value && !c.value) {
                miss(coa, 'wargame turn "' + fam.trigger_en + '" — all beats placeholder/absent in ' + file);
                return;
            }
            const turn = {
                turn_id: coa.id + '-t' + (t + 1),
                phase_index: t,
                trigger: { en: fam.trigger_en, ar: fam.trigger_ar },
                action:        { side: 'BLUE', units: [], what: a.value, why: null },
                reaction:      { side: 'RED',  units: [], what: r.value, why: null },
                counteraction: { side: 'BLUE', units: [], what: c.value, why: null },
                // D2 — adjudication is NEVER pre-filled by the adapter; the
                // wargame engine (G-5) + WHITE fill these.
                white_decision: { decision: null, decided_by: null, rule_cards_fired: [], rationale: null, journal_ref: null },
                result: { effects: [], state_delta: null, narrative_ar: null, narrative_en: null },
                affected_units: [],
                status: 'proposed',
                ai_assisted: true, needs_review: true, confidence: 'low',
                source_citations: [{ file, keys: [a.key, r.key, c.key].filter(Boolean) }],
            };
            coa.wargame_turns.push(turn);
            cite(coa, file, [a.key, r.key, c.key]);
        });
        // Expected enemy reaction + COA-level counteraction summary.
        const ml = coaVal(data, 'Most_likely_enemy_action', idx);
        if (ml.value) {
            coa.expected_enemy_reaction = ml.value;
            cite(coa, file, [ml.key]);
            if (!state.red_ml) state.red_ml = { text: ml.value, file, key: ml.key };
        } else {
            miss(coa, 'most likely enemy action — placeholder/absent in ' + file);
        }
        if (!coa.counteraction) {
            const firstCounter = coa.wargame_turns.map(t => t.counteraction.what).find(Boolean);
            if (firstCounter) coa.counteraction = firstCounter;
        }
        const own = coaVal(data, 'our_forces', idx);
        if (own.value) { coa.own_forces_summary = own.value; cite(coa, file, [own.key]); }
    }
    const torg = val(data, 'task_organization');
    if (torg) { state.blue[0].task_organization = torg; cite(state.blue[0], file, ['task_organization']); }
    const enemyAvail = val(data, 'Enemy_forces_available') || val(data, 'Enemy_forces_available_2');
    if (enemyAvail && !state.enemy_summary) state.enemy_summary = { text: enemyAvail, file, key: 'Enemy_forces_available' };
}

// ── step 5 — COA comparison ─────────────────────────────────────────
const EVAL_CRITERIA = [
    ['attacking_cog',   'strengths_attacking_cog',   'weaknesses_attacking_cog'],
    ['fire_support',    'strengths_fire_support',    'weaknesses_fire_support'],
    ['command_control', 'strengths_command_control', 'weaknesses_command_control'],
    ['protection',      'strengths_protection',      'weaknesses_protection'],
    ['admin_support',   'strengths_admin_support',   'weaknesses_admin_support'],
];

function mapStep5(data, file, state) {
    for (let idx = 0; idx < 2; idx++) {
        const coa = state.blue[idx];
        const summary = coaVal(data, 'possible_operation_' + (idx + 1), 0);   // exact keys, no family
        if (summary.value) { coa.summary = summary.value; cite(coa, file, ['possible_operation_' + (idx + 1)]); }
        const criteria = {};
        let any = false;
        for (const [name, sBase, wBase] of EVAL_CRITERIA) {
            const s = coaVal(data, sBase, idx);
            const w = coaVal(data, wBase, idx);
            if (s.value || w.value) {
                criteria[name] = { strengths: s.value, weaknesses: w.value };
                cite(coa, file, [s.key, w.key]);
                any = true;
            }
        }
        const conclusion = val(data, idx === 0 ? 'conclusions_c1' : 'conclusions_c2');
        if (any || conclusion) {
            coa.evaluation = { criteria, conclusion: conclusion || null, source: file };
            if (conclusion) cite(coa, file, [idx === 0 ? 'conclusions_c1' : 'conclusions_c2']);
        } else {
            miss(coa, 'evaluation criteria — placeholder/absent in ' + file);
        }
    }
    const overall = val(data, 'overall_comparison_conclusion');
    if (overall) {
        // decided_by is OPERATOR-ONLY (D9): the adapter records rationale,
        // never a decision.
        state.recommendation = { recommended_id: null, rationale: overall, decided_by: null, source: { file, key: 'overall_comparison_conclusion' } };
    }
}

// ── step 1 / staff brief — situation & guidance fields ──────────────
function mapPlanning(data, file, state) {
    const detectedStep1 = BRIEF.getExternalStep1Root ? BRIEF.getExternalStep1Root(data) : null;
    data = (detectedStep1 && detectedStep1.root) || data;
    state.seen_planning = true;
    if (!state.task_assembly) {
        state.task_assembly = buildTaskAssembly(data, file);
        if (!rawStructuredValue(data, 'task_assembly')) addMissing(state, 'task_assembly');
    }
    if ('doctrine_upload_required' in data && state.doctrine_upload_required === null) {
        state.doctrine_upload_required = !!data.doctrine_upload_required;
    }
    const doctrineSources = rawStructuredValue(data, 'doctrine_sources');
    if (Array.isArray(doctrineSources) && !state.doctrine_sources.length) state.doctrine_sources = doctrineSources;
    const doctrinePolicy = val(data, 'doctrine_application_policy');
    if (doctrinePolicy && !state.doctrine_application_policy) state.doctrine_application_policy = doctrinePolicy;
    const unitsDuty = buildUnitsDuty(data, file);
    if (unitsDuty && !state.units_duty) state.units_duty = unitsDuty;
    else if (!unitsDuty) addMissing(state, 'Units_Duty');

    state.mission = state.mission || (function () {
        for (const k of ['join_op_mission', 'GROUND_COMPONENT_MISSION', 'Exc_command_mission']) {
            const v = val(data, k);
            if (v) return { text: v, file, key: k };
        }
        return null;
    })();
    const intentParts = ['Join_op_purp', 'joint_ops_how', 'joint_ops_desired_end']
        .map(k => ({ k, v: val(data, k) })).filter(x => x.v);
    if (intentParts.length && !state.intent) {
        state.intent = { text: intentParts.map(x => x.v).join(' — '), file, keys: intentParts.map(x => x.k) };
    }
    for (const [k, type] of [['ROE', 'roe'], ['Risk_assy', 'risk']]) {
        const v = val(data, k);
        if (v) state.constraints.push({ text: v, type, source: { file, key: k } });
    }
    const assume = val(data, 'Operational_Assumptions');
    if (assume) state.assumptions.push({ text: assume, source: { file, key: 'Operational_Assumptions' } });
    for (const k of ['Timings', 'date_time', 'time_zone']) {
        const v = val(data, k);
        if (v) state.timeline.push({ label: k, text: v, source: { file, key: k } });
    }
    const ao = {};
    for (const k of ['operations_area', 'area_interest', 'Assembly_Area', 'Maps']) {
        const v = val(data, k);
        if (v) ao[k] = v;
        if (v) addPlacementCandidatesFromText(v, file, k, state);
    }
    if (Object.keys(ao).length) state.area = Object.assign(state.area || {}, ao, { source_file: file });
    addPlacementCandidatesFromText(JSON.stringify(state.task_assembly || ''), file, 'task_assembly', state);
    addPlacementCandidatesFromText(JSON.stringify(state.units_duty || ''), file, 'Units_Duty', state);
    const ff = val(data, 'friendly_forces');
    if (ff && !state.friendly_summary) state.friendly_summary = { text: ff, file, key: 'friendly_forces' };
    const ef = val(data, 'enemy_forces');
    if (ef && !state.enemy_summary) state.enemy_summary = { text: ef, file, key: 'enemy_forces' };
    addEnemyAirBases(data, file, state);
    const cap = val(data, 'Enemy_Capabilities');
    if (cap) state.enemy_capabilities.push({ text: cap, source: { file, key: 'Enemy_Capabilities' } });
}

// ── Bundle entry point ──────────────────────────────────────────────
// entries: [{ filename, data }] — data already parsed (JSONC handled upstream).
function adaptMdmpBundle(entries) {
    const list = (Array.isArray(entries) ? entries : []).filter(e => e && e.data && typeof e.data === 'object');
    const state = {
        blue: [
            newCoa('coa-blue-1', 'BLUE', 'العمل الممكن الأول', 'COA 1'),
            newCoa('coa-blue-2', 'BLUE', 'العمل الممكن الثاني', 'COA 2'),
        ],
        red_ml: null, recommendation: null, force_comparison: null,
        mission: null, intent: null, friendly_summary: null, enemy_summary: null,
        constraints: [], assumptions: [], timeline: [], area: null, enemy_capabilities: [],
        task_assembly: null, units_duty: null, placement_candidates: [], missing_information: [], seen_planning: false,
        doctrine_upload_required: null, doctrine_sources: [], doctrine_application_policy: null,
        enemy_forces: null, enemy_bases: [], proposed_units: [],
        staff_brief_2: null, external_raw: {},
        files: [], steps: [],
    };

    for (const e of list) {
        const det = BRIEF.detectMdmp(e.data);
        const file = e.filename || '(unnamed)';
        const fileStem = String(file).replace(/\.[^.]+$/, '').toUpperCase();
        const step = det.is ? det.step : (STAFF2_FILE_SECTION[fileStem] ? 'staff_brief_2' : 'unknown');
        state.files.push({ filename: file, mdmp_step: step, matched_keys: det.is ? det.matched : [] });
        if (det.is) state.steps.push(step);
        if (step === 'coa_development') mapStep3(e.data, file, state);
        else if (step === 'coa_analysis') mapStep4(e.data, file, state);
        else if (step === 'coa_comparison') mapStep5(e.data, file, state);
        else if (step === 'planning_guidance') mapPlanning(e.data, file, state);
        else if (step === 'staff_brief' || step === 'staff_brief_2') mapStaffBrief2(e.data, file, state);
    }

    // Assemble the brief.
    const brief = BRIEF.emptyBrief();
    const ob = brief.operational_brief;
    brief.document_set_id = 'ds_mdmp_' + BRIEF.sha256(JSON.stringify(state.files)).slice(0, 12);
    brief.set_type = 'mdmp_external';
    brief.documents = state.files.map(f => ({
        filename: f.filename, slots: [], hash: null,
        detected_type: 'mdmp_external', mdmp_step: f.mdmp_step,
        type_label_ar: 'ملف مرحلة من تطبيق خارجي (MDMP)', type_label_en: 'External MDMP-stage file (' + f.mdmp_step + ')',
        language: 'ar', confidence: 0.6,
    }));

    if (state.mission) { ob.mission = state.mission.text; ob.source_citations.push({ field: 'mission', file: state.mission.file, keys: [state.mission.key] }); }
    if (state.intent) { ob.commander_intent = state.intent.text; ob.source_citations.push({ field: 'commander_intent', file: state.intent.file, keys: state.intent.keys }); }
    if (state.friendly_summary) { ob.friendly.summary = state.friendly_summary.text; ob.source_citations.push({ field: 'friendly.summary', file: state.friendly_summary.file, keys: [state.friendly_summary.key] }); }
    if (state.enemy_summary) { ob.enemy.summary = state.enemy_summary.text; ob.source_citations.push({ field: 'enemy.summary', file: state.enemy_summary.file, keys: [state.enemy_summary.key] }); }
    if (state.enemy_capabilities.length) ob.enemy.assessed_capabilities = state.enemy_capabilities;
    ob.constraints = state.constraints;
    ob.assumptions = state.assumptions;
    ob.timeline = state.timeline;
    ob.missing_information = state.missing_information;
    if (state.seen_planning) {
        ob.task_assembly = state.task_assembly || Object.assign(defaultTaskAssembly(), {
            doctrine_upload_required: true,
            doctrine_sources: [],
            doctrine_application_policy: 'operator_uploaded_doctrine_required_before_final_tasking',
            source_type: 'ai_candidate_from_external_llm',
            needs_review: true,
        });
        if (state.doctrine_upload_required !== null) ob.task_assembly.doctrine_upload_required = state.doctrine_upload_required;
        else if (!('doctrine_upload_required' in ob.task_assembly)) ob.task_assembly.doctrine_upload_required = true;
        if (state.doctrine_sources.length) ob.task_assembly.doctrine_sources = state.doctrine_sources;
        else if (!Array.isArray(ob.task_assembly.doctrine_sources)) ob.task_assembly.doctrine_sources = [];
        if (state.doctrine_application_policy) ob.task_assembly.doctrine_application_policy = state.doctrine_application_policy;
        if (!ob.task_assembly.doctrine_application_policy) {
            ob.task_assembly.doctrine_application_policy = 'operator_uploaded_doctrine_required_before_final_tasking';
        }
        ob.units_duty = state.units_duty;
        ob.placement_candidates = state.placement_candidates;
        ob.enemy_forces = state.enemy_forces;
        ob.enemy_bases = state.enemy_bases;
        ob.proposed_units = state.proposed_units;
    }
    if (state.area) ob.area_of_operations = state.area;
    if (state.force_comparison) ob.force_comparison = state.force_comparison;
    if (state.staff_brief_2) {
        if (state.seen_planning) {
            state.staff_brief_2.step1_linkage = {
                task_assembly: !!ob.task_assembly,
                proposed_units: ob.proposed_units.length,
                doctrine_upload_required: !!(ob.task_assembly && ob.task_assembly.doctrine_upload_required),
                placement_candidates: ob.placement_candidates.length,
                needs_review: true,
                source_type: 'ai_candidate_from_external_llm',
            };
        }
        ob.staff_brief_2 = state.staff_brief_2;
    }
    if (Object.keys(state.external_raw).length) ob.external_raw = state.external_raw;

    // COAs: 2 BLUE always (even if empty — the operator sees what's missing),
    // + RED most-likely when the source carried it. RED most-dangerous is
    // NEVER invented (D3) — Generate More produces it later.
    const coas = state.blue.slice();
    if (state.red_ml) {
        const red = newCoa('coa-red-ml', 'RED', 'العمل الأكثر احتمالاً للعدو', 'Enemy Most Likely COA');
        red.intent = state.red_ml.text;
        cite(red, state.red_ml.file, [state.red_ml.key]);
        miss(red, 'Enemy Most Dangerous COA not provided by source — use Generate More (D3: RED default = ML + MD).');
        coas.push(red);
    }
    ob.courses_of_action = coas;
    if (state.recommendation) ob.coa_recommendation = state.recommendation;

    // Brief-level ambiguities: per-COA gaps roll up so the review screen's
    // single funnel shows them.
    const ambiguities = [];
    for (const m of state.missing_information) ambiguities.push('[step1] ' + m);
    for (const c of coas) {
        for (const m of c.missing_information) ambiguities.push('[' + c.id + '] ' + m);
    }
    if (!state.mission) ambiguities.push('Mission not found in the bundle (or placeholder-only).');
    if (!state.steps.includes('coa_analysis')) ambiguities.push('No step-4 (COA analysis) file in the bundle — wargame turns are empty.');
    if (!state.steps.includes('coa_comparison')) ambiguities.push('No step-5 (COA comparison) file — no evaluation/recommendation.');
    ob.ambiguities = ambiguities;

    const report = {
        files: state.files,
        steps_present: Array.from(new Set(state.steps)),
        coas: coas.map(c => ({
            id: c.id, side: c.side, name: c.name,
            phases: c.phases.length, turns: c.wargame_turns.length,
            has_evaluation: !!c.evaluation, missing: c.missing_information.length,
            citations: c.source_citations.length,
        })),
        force_comparison_categories: state.force_comparison ? state.force_comparison.categories.length : 0,
        recommendation_present: !!state.recommendation,
        scrubbed_note: 'placeholder template values were treated as missing (no-invention)',
    };

    return { brief, report };
}

module.exports = {
    adaptMdmpBundle,
    // exposed for tests:
    isPlaceholder,
    TURN_FAMILIES,
    FORCE_CATEGORIES,
};
