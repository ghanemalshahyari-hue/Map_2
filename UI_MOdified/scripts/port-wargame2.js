#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const W2_DIR = path.join(ROOT, 'Wargame2');
const OUT_DIR = path.join(ROOT, 'data', 'scenarios');
const OUT_FILE = path.join(OUT_DIR, 'wargame2-brega.json');

const PIPELINE_ROUTE = [
    [19.6091, 30.4102],
    [19.6064, 30.3963],
    [19.7163, 30.2585],
    [19.8173, 29.8705],
    [19.8831, 29.7740],
    [19.8126, 29.4964],
    [19.8145, 29.4575],
    [19.8141, 29.2898],
    [19.8234, 29.1452],
    [19.8175, 29.1246],
    [19.8144, 29.0667],
    [19.7948, 29.0027],
    [19.7798, 28.9833],
    [19.7810, 28.9384516],
    [19.7701, 28.9162],
];

const OBJ_NASSER = {
    name: 'OBJ NASSER-95',
    coord: [19.842646921904134, 29.614712418731745],
    target_depth_km: 95,
    radius_km: 5.0,
    carver: 37,
};

const RED_UNITS = [
    { uid: 'RED_401RECON', label: '401 Recon', echelon: 'battalion', bls: 'BLS-3', appear: 1,  role: 'Recon' },
    { uid: 'RED_41MECH',   label: '41 Mech',   echelon: 'brigade',   bls: 'BLS-1', appear: 3,  role: 'Fixing' },
    { uid: 'RED_42MECH',   label: '42 Mech',   echelon: 'brigade',   bls: 'BLS-2', appear: 3,  role: 'Support' },
    { uid: 'RED_43MECH',   label: '43 Mech',   echelon: 'brigade',   bls: 'BLS-3', appear: 3,  role: 'Main effort' },
    { uid: 'RED_44ARMD',   label: '44 Armd',   echelon: 'brigade',   bls: 'BLS-4', appear: 3,  role: 'Eastern fixing' },
    { uid: 'RED_9MID',     label: '9 MID',     echelon: 'division',  bls: 'BLS-3', appear: 6,  role: 'Follow-on' },
    { uid: 'RED_1AD',      label: '1 AD',      echelon: 'division',  bls: 'BLS-3', appear: 8,  role: 'Exploitation' },
    { uid: 'RED_45ARTY',   label: '45 Arty',   echelon: 'support',   bls: 'BLS-2', appear: 3,  role: 'Fire support' },
    { uid: 'RED_405EW',    label: '405 EW',    echelon: 'support',   bls: 'BLS-2', appear: 1,  role: 'EW' },
    { uid: 'RED_406CHEM',  label: '406 CBRN',  echelon: 'support',   bls: 'BLS-2', appear: 6,  role: 'CBRN defense' },
    { uid: 'RED_USV',      label: 'USV x24',   echelon: 'support',   bls: 'BLS-3', appear: 1,  role: 'Explosive USVs' },
];

const BLUE_LOSS_GROUPS = [
    [],
    [],
    [],
    ['c112', 'c113'],
    ['c121', 'c122', 'c123'],
    ['c211', 'c212'],
    ['c131', 'c132'],
    ['c221', 'c222', 'c231'],
    ['c232', 'c311', 'c312'],
    ['c321', 'c322'],
    ['p31c', 'c323'],
    ['p32c', 'c333'],
];

const RED_LOSSES_CUMULATIVE = [0, 0, 0, 0, 1, 2, 2, 3, 4, 5, 6, 6];

const RED_DEGRADED = [
    [],
    [],
    [],
    [],
    ['RED_44ARMD'],
    ['RED_44ARMD', 'RED_42MECH'],
    ['RED_44ARMD', 'RED_42MECH'],
    ['RED_44ARMD', 'RED_42MECH', 'RED_9MID'],
    ['RED_44ARMD', 'RED_42MECH', 'RED_9MID'],
    ['RED_43MECH', 'RED_9MID', 'RED_1AD'],
    ['RED_43MECH', 'RED_9MID', 'RED_1AD'],
    ['RED_43MECH', 'RED_9MID', 'RED_1AD'],
];

const STEP_AR = [
    'وضع ابتدائي: الدفاع الأزرق داخل منطقة العمليات، والقوة البرمائية الحمراء في التجميع البحري.',
    'بدء المرحلة الأولى: استطلاع 401، الزوارق المسيّرة المتفجرة، والحرب الإلكترونية يفتحون صورة الإبرار.',
    'تأكيد ممرات الخروج: BLS-3 هو أفضل مخرج، وBLS-2 مقيد بقرب السبخات/الأراضي الرطبة.',
    'نزول الموجة الثقيلة من فرقة المشاة الآلية الرابعة على أربع نقاط شاطئية مصححة، مع بقاء BLS-4 محدوداً كمخرج خارجي.',
    'رأس شاطئ ضحل: BLS-1 وBLS-3 يعملان، وBLS-2 محدود، وBLS-4 صالح للتثبيت لا للعبور الثقيل.',
    'هجوم مضاد أزرق مبكر يضرب رأس الشاطئ قبل اكتمال منطقة الإسناد والصيانة القتالية.',
    'دخول فرقة المشاة الآلية التاسعة يتأخر بسبب اختناق الشاطئ ومحدودية قدرة BLS-4 الخارجية.',
    'اندفاع نحو خط الصحراء المفتوحة، لكن التقدم لا يبلغ كامل خط 40-50 كم في الموعد المخطط.',
    'بدء استثمار الفرقة المدرعة الأولى عبر BLS-3، مع اعتماد خطر على ممر خروج رئيسي واحد.',
    'احتياط أزرق يضرب ممر الاستثمار قبل وصول الأحمر إلى نطاق الهدف الحاسم.',
    'ذروة عملياتية حمراء عند حافة نطاق 80-100 كم دون قدرة كافية على حشد القوة عند الهدف.',
    'الفصل النهائي: الأحمر يحتفظ برأس شاطئ ويهدد محور الأنابيب، لكن الهدف ناصر يبقى غير محتل.',
];

const BLS_CAPACITY = {
    'BLS-1': 'Limited',
    'BLS-2': 'Medium',
    'BLS-3': 'High',
    'BLS-4': 'Limited',
};

const BLS_NOMINAL_THROUGHPUT = {
    'BLS-1': 0.8,
    'BLS-2': 0.6,
    'BLS-3': 1.2,
    'BLS-4': 0.5,
};

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function unique(list) {
    const seen = new Set();
    const out = [];
    for (const x of list) {
        if (!seen.has(x)) { seen.add(x); out.push(x); }
    }
    return out;
}

function cumulativeLossUids(stepIndex) {
    const out = [];
    for (let i = 0; i <= stepIndex; i++) {
        for (const id of BLUE_LOSS_GROUPS[i]) out.push(`BLUE_${id}`);
    }
    return unique(out);
}

function buildBlsTemplate(blsSelection) {
    const features = blsSelection.features.filter(f =>
        f && f.properties && f.properties.selected === true);
    if (features.length !== 4) {
        throw new Error(`expected 4 selected BLS features, got ${features.length}`);
    }
    features.sort((a, b) => {
        const an = a.properties.name || '';
        const bn = b.properties.name || '';
        return an.localeCompare(bn);
    });
    return features.map(f => {
        const p = f.properties;
        return {
            name: p.name,
            coord: f.geometry.coordinates,
            role: p.role,
            capacity: BLS_CAPACITY[p.name] || 'Medium',
            throughput: p.throughput_factor,
            nominal_throughput: BLS_NOMINAL_THROUGHPUT[p.name],
            terrain_friction: p.terrain_friction,
            score: p.score,
            nearest_blue_uid: p.nearest_blue_uid,
            nearest_blue_km: p.nearest_blue_km,
        };
    });
}

function extractStepBaseline(stepJson, stepIndex) {
    const md = stepJson.metadata || {};
    const blueDestroyed = cumulativeLossUids(stepIndex);
    const redLossesCum = RED_LOSSES_CUMULATIVE[stepIndex];
    const degradedNow = RED_DEGRADED[stepIndex] || [];

    const redStrengthBaseline = {};
    for (const u of RED_UNITS) {
        redStrengthBaseline[u.uid] = degradedNow.includes(u.uid) ? 0.7 : 1.0;
    }

    return {
        index: stepIndex,
        time_label: md.time_label,
        elapsed_hours: md.elapsed_hours,
        phase: md.phase,
        phase_line_km_baseline: md.phase_line_km,
        objective_status_baseline: md.objective_status,
        decision_point_baseline: md.decision_point,
        force_ratio_baseline: md.force_ratio,
        ew_effect_baseline: md.ew_effect,
        mobility_state_baseline: md.mobility_state,
        logistics_state_baseline: md.logistics_state,
        narrative_en_fallback: md.narrative_en || '',
        narrative_ar_fallback: STEP_AR[stepIndex] || '',
        bls_status_baseline: md.bls_status,
        blue_destroyed_baseline: blueDestroyed,
        blue_destroyed_count_baseline: blueDestroyed.length,
        red_losses_cumulative_baseline: redLossesCum,
        red_degraded_baseline: degradedNow,
        red_strength_baseline: redStrengthBaseline,
        red_active_markers_baseline: md.red_active_markers,
    };
}

function buildScenario() {
    if (!fs.existsSync(W2_DIR)) {
        throw new Error(`Wargame2 directory not found: ${W2_DIR}`);
    }

    const blsSelection = readJson(path.join(W2_DIR, 'bls_selection.geojson'));
    const blsTemplate = buildBlsTemplate(blsSelection);

    const step00 = readJson(path.join(W2_DIR, 'step00.geojson'));

    // Area-of-operations boundaries — MultiPolygons with the autoFlank
    // metadata (brigade-rear / battalion-left / battalion-right). The
    // step00.geojson also contains a long tail of terrain MultiPolygons
    // (landuse / water); those have no autoFlank metadata, so we skip them.
    const aoBoundaries = step00.features
        .filter(f => f.geometry && (f.geometry.type === 'MultiPolygon' || f.geometry.type === 'Polygon')
                  && f.properties && f.properties.app && f.properties.app.autoFlank
                  && f.properties.app.autoFlank.areaRole)
        .map(f => {
            const meta = f.properties.app.autoFlank;
            return {
                type: f.geometry.type,
                coordinates: f.geometry.coordinates,
                role: meta.areaRole,
                tag:  meta.tag || null,
                lengthKm: meta.lengthKm || null,
            };
        });

    const bluePoints = step00.features
        .filter(f => f.properties && f.properties.side === 'BLUE' && f.geometry && f.geometry.type === 'Point')
        .map(f => ({
            unit_uid: f.properties.unit_uid,
            base_id:  (f.properties.unit_uid || '').replace(/^BLUE_/, ''),
            echelon:  f.properties.echelon,
            sidc:     f.properties.sidc || null,
            coord:    f.geometry.coordinates,
            posture:  f.properties.posture || null,
        }));
    if (bluePoints.length !== 39) {
        throw new Error(`expected 39 Blue point features in step00, got ${bluePoints.length}`);
    }

    const redPoints = step00.features
        .filter(f => f.properties && f.properties.side === 'RED' && f.geometry && f.geometry.type === 'Point')
        .map(f => ({
            unit_uid: f.properties.unit_uid,
            coord:    f.geometry.coordinates,
        }));
    const redCoordsByUid = Object.fromEntries(redPoints.map(r => [r.unit_uid, r.coord]));

    // Merge step00 coords into RED_UNITS
    const redUnitsWithCoords = RED_UNITS.map(u => ({
        ...u,
        coord: redCoordsByUid[u.uid] || null,
    }));

    const steps = [];
    for (let i = 0; i < 12; i++) {
        const stepFile = path.join(W2_DIR, `step${String(i).padStart(2, '0')}.geojson`);
        const stepJson = readJson(stepFile);
        steps.push(extractStepBaseline(stepJson, i));
    }

    const blueUnits = [
        ...['lc'],
        ...['b1c', 'b2c', 'b3c'],
        ...['p11c', 'p12c', 'p13c', 'p21c', 'p22c', 'p23c', 'p31c', 'p32c', 'p33c'],
        ...[
            'c111', 'c112', 'c113',
            'c121', 'c122', 'c123',
            'c131', 'c132', 'c133',
            'c211', 'c212', 'c213',
            'c221', 'c222',
            'c231', 'c232', 'c233',
            'c311', 'c312', 'c313',
            'c321', 'c322', 'c323',
            'c331', 'c332', 'c333',
        ],
    ];
    if (blueUnits.length !== 39) {
        throw new Error(`expected 39 Blue base ids, got ${blueUnits.length}`);
    }

    return {
        name: 'wargame2-brega',
        model_version: 'brega-wargame2-gis-v1.0',
        scenario_label: 'Brega-Ajdabiya GIS-informed amphibious assault',
        map_bbox: [19.12, 29.50, 20.02, 30.56],
        obj: OBJ_NASSER,
        pipeline: PIPELINE_ROUTE,
        red_units: redUnitsWithCoords,
        blue_units_base_ids: blueUnits,
        blue_units_initial: bluePoints,
        blue_units_source: 'nato-map-layers.geojson',
        ao_boundaries: aoBoundaries,
        bls_template: blsTemplate,
        nominal_throughput: BLS_NOMINAL_THROUGHPUT,
        phase_table: [
            { index: 0,  time_label: 'D-3h',   elapsed_hours: -3,  phase: 'PRE-H' },
            { index: 1,  time_label: 'H-Hour', elapsed_hours: 0,   phase: 'PHASE 1' },
            { index: 2,  time_label: 'H+2',    elapsed_hours: 2,   phase: 'PHASE 1' },
            { index: 3,  time_label: 'H+6',    elapsed_hours: 6,   phase: 'PHASE 2A' },
            { index: 4,  time_label: 'H+12',   elapsed_hours: 12,  phase: 'PHASE 2A' },
            { index: 5,  time_label: 'H+24',   elapsed_hours: 24,  phase: 'PHASE 2A' },
            { index: 6,  time_label: 'H+36',   elapsed_hours: 36,  phase: 'PHASE 2B' },
            { index: 7,  time_label: 'H+48',   elapsed_hours: 48,  phase: 'PHASE 2B' },
            { index: 8,  time_label: 'H+72',   elapsed_hours: 72,  phase: 'PHASE 3' },
            { index: 9,  time_label: 'H+96',   elapsed_hours: 96,  phase: 'PHASE 3' },
            { index: 10, time_label: 'H+120',  elapsed_hours: 120, phase: 'PHASE 3' },
            { index: 11, time_label: 'H+144',  elapsed_hours: 144, phase: 'RESOLUTION' },
        ],
        throughput_ceilings_km: { H24: 12, H48: 25, H96: 60, H144: 100 },
        terrain_note: 'BLS-4 permanently LIMITED (sabkha-bound). Only BLS-3 has an unconstrained exit corridor.',
        steps,
        ported_at: new Date().toISOString(),
        ported_from: 'UI_MOdified/Wargame2/{wargame.py, build_report_ar.py, step00..11.geojson, bls_selection.geojson}',
    };
}

function main() {
    const scenario = buildScenario();
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(scenario, null, 2) + '\n', 'utf8');

    const cum11 = cumulativeLossUids(11);
    console.log(`Wrote ${OUT_FILE}`);
    console.log(`  steps:            12`);
    console.log(`  red_units:        ${scenario.red_units.length}`);
    console.log(`  blue_units:       ${scenario.blue_units_base_ids.length}`);
    console.log(`  bls_template:     ${scenario.bls_template.length}`);
    console.log(`  pipeline pts:     ${scenario.pipeline.length}`);
    console.log(`  cumulative blue destroyed at step 11: ${cum11.length}`);
    console.log(`  final phase_line_km baseline:         ${scenario.steps[11].phase_line_km_baseline}`);
    console.log(`  final objective_status baseline:      ${scenario.steps[11].objective_status_baseline}`);
}

if (require.main === module) {
    try { main(); }
    catch (err) {
        console.error('ERROR:', err.message);
        process.exit(1);
    }
}

module.exports = { buildScenario };
