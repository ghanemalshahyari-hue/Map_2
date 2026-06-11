/**
 * Operation templates — DOC-UNDERSTANDING-1 / Phase F.
 *
 * A small, deterministic registry that shapes how a reviewed Operational
 * Brief becomes a DRAFT RMOOZ scenario: the phase skeleton, which side is
 * attacker/defender, the per-side role cycle, and how draft unit positions
 * are laid out relative to the operator-set objective. NO coordinates are
 * baked here — geometry is expressed as bearings/offsets the generator
 * applies around the objective, and every placement is flagged draft.
 *
 * In this app RED = enemy, BLUE = friendly.
 *
 * Placement schemes (consumed by brief-to-scenario.js):
 *   'ring'   — units on a small circle around the objective (defenders).
 *   'axis'   — units along an approach line offset from the objective toward
 *              `bearing_deg` (attackers staging in from sea/flank).
 */
'use strict';

const TEMPLATES = Object.freeze({
    amphibious_landing: {
        id: 'amphibious_landing', name_ar: 'عملية إبرار', name_en: 'Amphibious Landing',
        phases: [
            { index: 0, kind: 'preparation_recon', name_ar: 'التحضير والاستطلاع', name_en: 'Preparation / Recon' },
            { index: 1, kind: 'approach_movement', name_ar: 'الاقتراب والحركة',    name_en: 'Approach / Movement' },
            { index: 2, kind: 'landing',           name_ar: 'الإبرار',              name_en: 'Landing' },
            { index: 3, kind: 'secure_expand',     name_ar: 'التأمين والتوسيع',     name_en: 'Secure / Expand' },
        ],
        attacker_side: 'red', defender_side: 'blue',
        red_scheme: 'axis', blue_scheme: 'ring',
        bearing_deg: 180,          // attacker approaches from seaward (south); a draft default
        bls_count: 2,
        red_roles:  ['marine', 'marine', 'armor', 'recon', 'engineer', 'fires'],
        blue_roles: ['infantry', 'infantry', 'coastal_defense', 'air_defense', 'armor', 'reserve'],
        target_depth_km: 5, carver: 30,
    },
    attack_objective: {
        id: 'attack_objective', name_ar: 'هجوم على هدف', name_en: 'Attack Objective',
        phases: [
            { index: 0, kind: 'shaping',     name_ar: 'التمهيد',   name_en: 'Shaping' },
            { index: 1, kind: 'approach',    name_ar: 'الاقتراب',  name_en: 'Approach' },
            { index: 2, kind: 'assault',     name_ar: 'الاقتحام',  name_en: 'Assault' },
            { index: 3, kind: 'consolidate', name_ar: 'التثبيت',   name_en: 'Consolidate' },
        ],
        attacker_side: 'red', defender_side: 'blue',
        red_scheme: 'axis', blue_scheme: 'ring',
        bearing_deg: 270,
        bls_count: 1,
        red_roles:  ['armor', 'mech_infantry', 'infantry', 'recon', 'fires', 'engineer'],
        blue_roles: ['infantry', 'infantry', 'anti_tank', 'air_defense', 'reserve'],
        target_depth_km: 8, carver: 35,
    },
    defend_objective: {
        id: 'defend_objective', name_ar: 'دفاع عن هدف', name_en: 'Defend Objective',
        phases: [
            { index: 0, kind: 'prepare_defense', name_ar: 'إعداد الدفاع',   name_en: 'Prepare Defense' },
            { index: 1, kind: 'shaping',         name_ar: 'التمهيد',         name_en: 'Shaping' },
            { index: 2, kind: 'defend',          name_ar: 'الدفاع',          name_en: 'Defend' },
            { index: 3, kind: 'counterattack',   name_ar: 'الهجوم المضاد',   name_en: 'Counterattack' },
        ],
        attacker_side: 'red', defender_side: 'blue',
        red_scheme: 'axis', blue_scheme: 'ring',
        bearing_deg: 90,
        bls_count: 1,
        red_roles:  ['armor', 'mech_infantry', 'infantry', 'fires'],
        blue_roles: ['infantry', 'infantry', 'anti_tank', 'air_defense', 'engineer', 'reserve'],
        target_depth_km: 6, carver: 25,
    },
    reconnaissance: {
        id: 'reconnaissance', name_ar: 'استطلاع', name_en: 'Reconnaissance',
        phases: [
            { index: 0, kind: 'insertion',    name_ar: 'الإدخال',   name_en: 'Insertion' },
            { index: 1, kind: 'observation',  name_ar: 'المراقبة',  name_en: 'Observation' },
            { index: 2, kind: 'reporting',    name_ar: 'الإبلاغ',   name_en: 'Reporting' },
            { index: 3, kind: 'exfiltration', name_ar: 'الإخلاء',   name_en: 'Exfiltration' },
        ],
        attacker_side: 'blue', defender_side: 'red',     // friendly recon is the acting force
        red_scheme: 'ring', blue_scheme: 'axis',
        bearing_deg: 0,
        bls_count: 1,
        red_roles:  ['infantry', 'air_defense', 'armor'],
        blue_roles: ['recon', 'recon', 'sof', 'uav'],
        target_depth_km: 10, carver: 15,
    },
    air_defense: {
        id: 'air_defense', name_ar: 'دفاع جوي', name_en: 'Air Defense',
        phases: [
            { index: 0, kind: 'deployment',  name_ar: 'الانتشار', name_en: 'Deployment' },
            { index: 1, kind: 'detection',   name_ar: 'الكشف',     name_en: 'Detection' },
            { index: 2, kind: 'engagement',  name_ar: 'الاشتباك',  name_en: 'Engagement' },
            { index: 3, kind: 'sustainment', name_ar: 'الإدامة',   name_en: 'Sustainment' },
        ],
        attacker_side: 'red', defender_side: 'blue',     // friendly AD defends; red is the air threat
        red_scheme: 'axis', blue_scheme: 'ring',
        bearing_deg: 45,
        bls_count: 1,
        red_roles:  ['aircraft', 'cruise_missile', 'uav'],
        blue_roles: ['sam_battery', 'sam_battery', 'radar', 'short_range_ad', 'c2'],
        target_depth_km: 12, carver: 10,
    },
});

const DEFAULT_TEMPLATE = 'attack_objective';

// Pick a template id from an explicit choice, else infer from the brief's
// operation type / mission text, else the safe default.
const AR_AMPHIB = ['إبرار', 'إنزال', 'برمائي', 'amphib', 'landing'];
const AR_DEFEND = ['دفاع', 'defend', 'defence', 'defense'];
const AR_RECON  = ['استطلاع', 'recon', 'reconnaissance', 'scout'];
const AR_AD     = ['دفاع جوي', 'air defense', 'air defence', 'sam', 'مضاد للطائرات'];
const AR_ATTACK = ['هجوم', 'attack', 'offensive', 'assault'];

function inferTemplateId(brief) {
    var hay = '';
    try {
        var ob = (brief && brief.operational_brief) || brief || {};
        hay = [ob.mission, ob.commander_intent,
               (ob.enemy && ob.enemy.summary), (ob.friendly && ob.friendly.summary),
               brief && brief.set_type, brief && brief.operation_type].filter(Boolean).join(' ').toLowerCase();
    } catch (_) { hay = ''; }
    var has = function (list) { for (var i = 0; i < list.length; i++) { if (hay.indexOf(String(list[i]).toLowerCase()) !== -1) return true; } return false; };
    if (has(AR_AD))     return 'air_defense';        // check AD before generic defend
    if (has(AR_AMPHIB)) return 'amphibious_landing';
    if (has(AR_RECON))  return 'reconnaissance';
    if (has(AR_DEFEND)) return 'defend_objective';
    if (has(AR_ATTACK)) return 'attack_objective';
    return DEFAULT_TEMPLATE;
}

function getTemplate(id) {
    return TEMPLATES[id] || null;
}
function listTemplates() {
    return Object.keys(TEMPLATES).map(function (k) {
        return { id: k, name_ar: TEMPLATES[k].name_ar, name_en: TEMPLATES[k].name_en, phases: TEMPLATES[k].phases.length };
    });
}

module.exports = { TEMPLATES, DEFAULT_TEMPLATE, getTemplate, listTemplates, inferTemplateId };
