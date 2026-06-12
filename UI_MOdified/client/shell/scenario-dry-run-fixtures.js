// ── PR-210: Scenario Dry-Run Fixtures ────────────────────────────────────────
// Static data only. No functions that mutate anything. No DOM access.
// No map access. No window.units access. No window.RmoozScenario access.
// No app wiring. No script tag added to app.html in this PR.
// Source: docs/pr-210-scenario-dry-run-fixture-shape.md
// Consumed by: PR-211 (buildScenarioStepPreview — not yet implemented).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

(function () {

    // ── Shared safety block ───────────────────────────────────────────────────
    // All fixture objects and step objects carry this block.
    // All flags are hard-locked. The PR-211 builder must verify this block
    // before consuming any fixture object.

    var FIXTURE_SAFETY = Object.freeze({
        dryRunOnly:              true,
        previewOnly:             true,
        liveMutationAllowed:     false,
        backendCommitAllowed:    false,
        mapMutationAllowed:      false,
        unitMutationAllowed:     false,
        scenarioMutationAllowed: false
    });


    // ── Exercise AMBER RIDGE ─────────────────────────────────────────────────
    // Fictional training scenario. Non-sensitive. Generic.
    // Blue recon force conducts movement to contact toward a suspected
    // enemy blocking position. Blue chooses between hold, probe, and bypass.
    // 4 steps. 4 friendly units. 3 enemy units. 2 objectives.
    //
    // Intentional missing-data cases (for warning path testing):
    //   BLU-HQ-01       — startLocation is null  (MISSING_COORDINATE)
    //   RED-MOB-01      — startLocation is null  (MISSING_COORDINATE)
    //   Step 2          — selectedDecision null  (MISSING_FIELD)
    //   Step 2          — expectedResult null    (MISSING_FIELD)
    //   Step 3          — enemyCounterActions [] (INCOMPLETE_FIELD)
    //   Step 3          — OBJ-FORD reference     (AMBIGUOUS_OBJECTIVE)

    var AMBER_RIDGE_UNITS = Object.freeze([
        Object.freeze({
            uid:           'BLU-RECON-01',
            name:          '1st Recon Platoon',
            side:          'friendly',
            type:          'recon',
            echelon:       'platoon',
            role:          'main_effort',
            startLocation: Object.freeze({
                description: 'Grid AMBER-A — forward assembly area',
                lat:         null,
                lng:         null
            }),
            aliases:       Object.freeze(['Recon 1', '1 Recon Pl', 'BLU-RECON']),
            readOnly:      true
        }),
        Object.freeze({
            uid:           'BLU-INF-01',
            name:          'Alpha Company 1st Platoon',
            side:          'friendly',
            type:          'infantry',
            echelon:       'platoon',
            role:          'supporting_effort',
            startLocation: Object.freeze({
                description: 'Grid AMBER-B — main body forming-up point',
                lat:         null,
                lng:         null
            }),
            aliases:       Object.freeze(['1 Pl', 'A Coy 1 Pl', 'BLU-INF']),
            readOnly:      true
        }),
        Object.freeze({
            uid:           'BLU-FST-01',
            name:          'Mortar Section',
            side:          'friendly',
            type:          'fire_support',
            echelon:       'team',
            role:          'fire_support',
            startLocation: Object.freeze({
                description: 'Grid AMBER-B — co-located with 1st Platoon',
                lat:         null,
                lng:         null
            }),
            aliases:       Object.freeze(['FST', 'Mortars', 'Fire Support Team']),
            readOnly:      true
        }),
        Object.freeze({
            uid:           'BLU-HQ-01',
            name:          'Alpha Company HQ',
            side:          'friendly',
            type:          'command',
            echelon:       'company',
            role:          'command',
            startLocation: null, // INTENTIONAL: null — must generate MISSING_COORDINATE warning
            aliases:       Object.freeze(['A Coy HQ', 'Coy HQ', 'BLU-HQ']),
            readOnly:      true
        }),
        Object.freeze({
            uid:           'RED-DEF-01',
            name:          'Enemy Blocking Force',
            side:          'enemy',
            type:          'infantry',
            echelon:       'platoon',
            role:          'defend',
            startLocation: Object.freeze({
                description: 'Vicinity OBJ RIDGE — prepared defensive positions',
                lat:         null,
                lng:         null
            }),
            aliases:       Object.freeze(['Enemy Pl', 'RED-DEF', 'Blocking Force']),
            readOnly:      true
        }),
        Object.freeze({
            uid:           'RED-OBS-01',
            name:          'Enemy Forward Observer',
            side:          'enemy',
            type:          'observer',
            echelon:       'team',
            role:          'observe',
            startLocation: Object.freeze({
                description: 'High ground north of RIDGE — observation post',
                lat:         null,
                lng:         null
            }),
            aliases:       Object.freeze(['Enemy OBS', 'RED-OBS', 'FO Team']),
            readOnly:      true
        }),
        Object.freeze({
            uid:           'RED-MOB-01',
            name:          'Enemy Mobile Reserve',
            side:          'enemy',
            type:          'motorised',
            echelon:       'platoon',
            role:          'counter-attack',
            startLocation: null, // INTENTIONAL: null — must generate MISSING_COORDINATE warning
            aliases:       Object.freeze(['Enemy Reserve', 'RED-MOB', 'Mobile Pl']),
            readOnly:      true
        })
    ]);


    var AMBER_RIDGE_OBJECTIVES = Object.freeze([
        Object.freeze({
            objectiveId:   'OBJ-RIDGE',
            name:          'OBJ RIDGE',
            type:          'seize',
            location:      Object.freeze({
                description: 'High-ground feature designated RIDGE — dominant terrain',
                lat:         null,
                lng:         null
            }),
            desiredEffect: 'Neutralise enemy blocking force; secure dominant high-ground feature to allow main body to advance',
            readOnly:      true
        }),
        Object.freeze({
            objectiveId:   'OBJ-FORD',
            name:          'OBJ FORD',
            type:          'secure',
            location:      Object.freeze({
                description: 'Eastern stream crossing designated FORD — bypass route',
                lat:         null,
                lng:         null
            }),
            desiredEffect: 'Secure stream crossing to enable eastern bypass of enemy position at RIDGE',
            readOnly:      true
        })
    ]);


    var AMBER_RIDGE_STEPS = Object.freeze([

        // ── Step 1 — Movement to Contact ─────────────────────────────────────
        // Preview-complete. No intentional missing data.
        // Expected: all fields display without warnings.

        Object.freeze({
            step_id:   'AMBER-STEP-01',
            stepIndex: 0,
            title:     'Movement to Contact',
            situation: 'Alpha Company has orders to identify and fix a suspected enemy blocking position ' +
                       'on high ground at RIDGE. 1st Recon Platoon moves forward on the axis of advance. ' +
                       'Enemy strength and exact disposition are unknown. Red OBS-01 has been reported ' +
                       'at a high-ground observation post north of RIDGE.',
            selectedDecision:   'Conduct deliberate reconnaissance toward OBJ RIDGE. Recon Platoon leads. ' +
                                '1st Platoon follows at 400m interval. Mortar section establishes firing position ' +
                                'at AMBER-B.',
            friendlyActions: Object.freeze([
                Object.freeze({ uid: 'BLU-RECON-01', action: 'Advance cautiously toward OBJ RIDGE. Report contact immediately. Do not engage without orders.' }),
                Object.freeze({ uid: 'BLU-INF-01',   action: 'Follow Recon Platoon at 400m interval. Maintain comms. Halt on Recon contact report.' }),
                Object.freeze({ uid: 'BLU-FST-01',   action: 'Establish mortar firing position at AMBER-B. Register OBJ RIDGE as target reference point.' })
            ]),
            enemyCounterActions: Object.freeze([
                Object.freeze({ uid: 'RED-OBS-01', counterAction: 'Enemy observer reports Blue movement. Blocking force at RIDGE goes to alert.' })
            ]),
            unitsReferenced:     Object.freeze(['BLU-RECON-01', 'BLU-INF-01', 'BLU-FST-01', 'RED-OBS-01']),
            objectivesReferenced:Object.freeze(['OBJ-RIDGE']),
            expectedResult:      'Recon Platoon reaches observation distance of OBJ RIDGE. Enemy position identified. ' +
                                 'Strength and orientation reported to Company HQ. No engagement. Blue forces undetected or detected but not engaged.',
            missingDataExpected: Object.freeze([]),
            safety:              FIXTURE_SAFETY
        }),

        // ── Step 2 — Contact Made ─────────────────────────────────────────────
        // Intentionally missing: selectedDecision, expectedResult.
        // Expected: step displayed with "Missing data" label; two warnings generated.

        Object.freeze({
            step_id:   'AMBER-STEP-02',
            stepIndex: 1,
            title:     'Contact Made — Decision Required',
            situation: 'Recon Platoon reports direct observation of enemy defensive positions at OBJ RIDGE. ' +
                       'Enemy strength estimated at one platoon in prepared positions. Red OBS-01 has observed ' +
                       'Blue Recon movement and has likely reported. Enemy Mobile Reserve (RED-MOB-01) location unknown.',
            selectedDecision:   null, // INTENTIONAL: null — must generate MISSING_FIELD warning
            friendlyActions: Object.freeze([
                Object.freeze({ uid: 'BLU-RECON-01', action: 'Hold current position. Report full contact report to Company HQ. Maintain observation.' }),
                Object.freeze({ uid: 'BLU-INF-01',   action: 'Halt at 400m interval. Await orders from Company HQ.' })
            ]),
            enemyCounterActions: Object.freeze([
                Object.freeze({ uid: 'RED-DEF-01', counterAction: 'Enemy blocking force remains in prepared positions. Observed but not yet engaging.' }),
                Object.freeze({ uid: 'RED-OBS-01', counterAction: 'Enemy observer continues to report Blue positions.' })
            ]),
            unitsReferenced:     Object.freeze(['BLU-RECON-01', 'BLU-INF-01', 'RED-DEF-01', 'RED-OBS-01', 'RED-MOB-01']),
            objectivesReferenced:Object.freeze(['OBJ-RIDGE']),
            expectedResult:      null, // INTENTIONAL: null — must generate MISSING_FIELD warning
            missingDataExpected: Object.freeze(['selectedDecision', 'expectedResult']),
            safety:              FIXTURE_SAFETY
        }),

        // ── Step 3 — Bypass Decision ──────────────────────────────────────────
        // Intentionally: enemyCounterActions is empty; OBJ-FORD reference is
        // present but this step concerns the bypass route only (ambiguous because
        // OBJ-FORD is not the primary objective for the phase — operator review needed).
        // Expected: partial preview; two warnings generated.

        Object.freeze({
            step_id:   'AMBER-STEP-03',
            stepIndex: 2,
            title:     'Bypass East via OBJ FORD',
            situation: 'Company Commander decides direct assault on OBJ RIDGE is not viable given unknown ' +
                       'enemy reserve position. Eastern bypass via OBJ FORD is assessed as the lower-risk option. ' +
                       'Recon Platoon redirected to reconnoitre FORD crossing. Enemy reserve position (RED-MOB-01) ' +
                       'remains unlocated.',
            selectedDecision:   'Bypass OBJ RIDGE to the east. Recon Platoon leads to OBJ FORD. 1st Platoon follows. ' +
                                'Mortar section displaces forward to cover the bypass route. Company HQ moves to ' +
                                'command post at AMBER-C.',
            friendlyActions: Object.freeze([
                Object.freeze({ uid: 'BLU-RECON-01', action: 'Break contact with RIDGE observation position. Move east to reconnoitre OBJ FORD crossing.' }),
                Object.freeze({ uid: 'BLU-INF-01',   action: 'Prepare to move east on Recon clearance of OBJ FORD.' }),
                Object.freeze({ uid: 'BLU-FST-01',   action: 'Displace to intermediate firing position. Maintain registration on OBJ RIDGE and cover bypass route.' }),
                Object.freeze({ uid: 'BLU-HQ-01',    action: 'Move to command post AMBER-C. Coordinate bypass and report phase change to higher.' })
            ]),
            enemyCounterActions: Object.freeze([]), // INTENTIONAL: empty — must generate INCOMPLETE_FIELD warning
            unitsReferenced:     Object.freeze(['BLU-RECON-01', 'BLU-INF-01', 'BLU-FST-01', 'BLU-HQ-01', 'RED-MOB-01']),
            objectivesReferenced:Object.freeze(['OBJ-FORD']), // INTENTIONAL: OBJ-FORD only; not primary phase objective — ambiguous reference
            expectedResult:      'Recon Platoon clears OBJ FORD crossing. Blue main body begins east bypass. ' +
                                 'Enemy blocking force at RIDGE not engaged. Enemy reserve position still unlocated — risk noted.',
            missingDataExpected: Object.freeze(['enemyCounterActions', 'objectivesReferenced_ambiguous']),
            safety:              FIXTURE_SAFETY
        }),

        // ── Step 4 — Consolidation at FORD ────────────────────────────────────
        // Preview-complete structurally. BLU-HQ-01 has null startLocation
        // which will generate a coordinate warning — non-blocking.
        // Expected: all structural fields shown; one coordinate warning for BLU-HQ-01.

        Object.freeze({
            step_id:   'AMBER-STEP-04',
            stepIndex: 3,
            title:     'Consolidation at OBJ FORD',
            situation: 'Blue force has completed eastern bypass. Recon Platoon and 1st Platoon are at OBJ FORD. ' +
                       'Enemy blocking force at RIDGE has not pursued. Enemy mobile reserve remains unlocated. ' +
                       'Company HQ is en route to AMBER-C but location is not confirmed.',
            selectedDecision:   'Consolidate at OBJ FORD. Establish hasty defensive position. Report phase 1 complete to higher. ' +
                                'Await orders before advancing beyond FORD.',
            friendlyActions: Object.freeze([
                Object.freeze({ uid: 'BLU-RECON-01', action: 'Establish observation post east of FORD. Watch for enemy reserve approach.' }),
                Object.freeze({ uid: 'BLU-INF-01',   action: 'Occupy and consolidate OBJ FORD. Establish all-round defence.' }),
                Object.freeze({ uid: 'BLU-FST-01',   action: 'Establish final firing position covering OBJ FORD approaches. Register enemy reserve likely approach routes.' }),
                Object.freeze({ uid: 'BLU-HQ-01',    action: 'Confirm arrival at AMBER-C. Send phase 1 complete report to higher.' }) // BLU-HQ-01 has null startLocation
            ]),
            enemyCounterActions: Object.freeze([
                Object.freeze({ uid: 'RED-DEF-01', counterAction: 'Enemy blocking force remains at RIDGE. No pursuit observed.' }),
                Object.freeze({ uid: 'RED-MOB-01', counterAction: 'Enemy reserve — location unknown. May move to counter Blue position at FORD.' })
            ]),
            unitsReferenced:     Object.freeze(['BLU-RECON-01', 'BLU-INF-01', 'BLU-FST-01', 'BLU-HQ-01', 'RED-DEF-01', 'RED-MOB-01']),
            objectivesReferenced:Object.freeze(['OBJ-FORD']),
            expectedResult:      'Alpha Company consolidated at OBJ FORD. Hasty defence established. Phase 1 complete report sent. ' +
                                 'Enemy blocking force fixed at RIDGE. Enemy reserve still unlocated — watch state maintained.',
            missingDataExpected: Object.freeze(['BLU-HQ-01.startLocation']), // coordinate warning expected, non-blocking
            safety:              FIXTURE_SAFETY
        })

    ]); // AMBER_RIDGE_STEPS


    // ── Expected warnings (test assertions for PR-213) ────────────────────────

    var AMBER_RIDGE_EXPECTED_WARNINGS = Object.freeze([
        Object.freeze({ stepId: 'AMBER-STEP-01', field: 'BLU-HQ-01.startLocation',  warningType: 'MISSING_COORDINATE',  note: 'BLU-HQ-01 not referenced in Step 1 but unit is in fixture — warning fires if resolver scans all units' }),
        Object.freeze({ stepId: 'AMBER-STEP-02', field: 'selectedDecision',          warningType: 'MISSING_FIELD',       note: 'null selectedDecision must produce warning and "Missing data" label' }),
        Object.freeze({ stepId: 'AMBER-STEP-02', field: 'expectedResult',            warningType: 'MISSING_FIELD',       note: 'null expectedResult must produce warning and prevent "preview-complete" status' }),
        Object.freeze({ stepId: 'AMBER-STEP-03', field: 'enemyCounterActions',       warningType: 'INCOMPLETE_FIELD',    note: 'empty array must produce warning — counter-action field exists but is empty' }),
        Object.freeze({ stepId: 'AMBER-STEP-03', field: 'objectivesReferenced',      warningType: 'AMBIGUOUS_OBJECTIVE', note: 'OBJ-FORD referenced but is not primary phase objective — requires review label' }),
        Object.freeze({ stepId: 'AMBER-STEP-04', field: 'BLU-HQ-01.startLocation',  warningType: 'MISSING_COORDINATE',  note: 'BLU-HQ-01 referenced in Step 4 actions; null startLocation triggers coordinate warning — non-blocking' })
    ]);


    // ── Expected preview results (test assertions for PR-213) ─────────────────

    var AMBER_RIDGE_EXPECTED_PREVIEW_RESULTS = Object.freeze([
        Object.freeze({
            stepId:          'AMBER-STEP-01',
            previewComplete: true,
            notes:           'All required fields present. No warnings. Step displays fully.'
        }),
        Object.freeze({
            stepId:          'AMBER-STEP-02',
            previewComplete: false,
            notes:           'selectedDecision and expectedResult null. Step marked Not Ready. Two warnings shown. No data guessed.'
        }),
        Object.freeze({
            stepId:          'AMBER-STEP-03',
            previewComplete: false,
            notes:           'Partial preview. Counter-action empty, OBJ-FORD reference ambiguous. Step marked Requires Review. Two warnings shown.'
        }),
        Object.freeze({
            stepId:          'AMBER-STEP-04',
            previewComplete: true,
            notes:           'All structural fields present. One non-blocking coordinate warning for BLU-HQ-01. Step considered preview-complete.'
        })
    ]);


    // ── Fixture assembly ──────────────────────────────────────────────────────

    var AMBER_RIDGE = Object.freeze({
        fixtureId:              'fixture-amber-ridge-v1',
        fixtureName:            'Exercise AMBER RIDGE',
        description:            'Fictional training scenario. Blue recon force conducts movement to contact ' +
                                'toward a suspected enemy blocking position. Tests RMOOZ step parsing, ' +
                                'unit resolution, missing-data warnings, and read-only preview behaviour.',
        sourceType:             'dry_run_fixture',
        readOnly:               true,
        liveMutationAllowed:    false,
        packageId:              'pkg-amber-ridge-v1',
        packageName:            'Exercise AMBER RIDGE — Phase 1',
        units:                  AMBER_RIDGE_UNITS,
        objectives:             AMBER_RIDGE_OBJECTIVES,
        steps:                  AMBER_RIDGE_STEPS,
        expectedWarnings:       AMBER_RIDGE_EXPECTED_WARNINGS,
        expectedPreviewResults: AMBER_RIDGE_EXPECTED_PREVIEW_RESULTS,
        safety:                 FIXTURE_SAFETY
    });


    // ── Public exposure ───────────────────────────────────────────────────────
    // Exposed on window for console access and for PR-211 builder.
    // No script tag added to app.html in this PR — that is deferred to PR-211 or PR-212.
    // All data is static and frozen. No mutation is possible through this API.

    window.RmoozDryRunFixtures = Object.freeze({
        AMBER_RIDGE: AMBER_RIDGE,
        FIXTURE_SAFETY: FIXTURE_SAFETY
    });

})();
