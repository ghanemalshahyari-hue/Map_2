# Graph Report - MAP_2  (2026-06-10)

## Corpus Check
- 4157 files · ~12,251,988 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1666 nodes · 3516 edges · 76 communities (72 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a7fa4e97`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]

## God Nodes (most connected - your core abstractions)
1. `tx()` - 71 edges
2. `init()` - 45 edges
3. `getScenario()` - 38 edges
4. `handle()` - 31 edges
5. `removeLayer()` - 30 edges
6. `normalizeCatkArrowParams()` - 30 edges
7. `getActiveStepIndex()` - 27 edges
8. `addToActiveLayer()` - 26 edges
9. `goToStep()` - 24 edges
10. `scheduleSaveToStorage()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `handle()` --calls--> `sendJson()`  [INFERRED]
  UI_MOdified/server/wargame-sim-bridge.js → UI_MOdified/Offline_Deployment/offline_app/server/web-server.js
- `mount()` --calls--> `start()`  [INFERRED]
  UI_MOdified/client/shell/scenario-import-wizard.js → UI_MOdified/client/shell/native-scenario-loader.js
- `handle()` --calls--> `buildLlmChildEnv()`  [EXTRACTED]
  UI_MOdified/server/wargame-sim-bridge.js → UI_MOdified/Offline_Deployment/offline_app/server/wargame-sim-bridge.js

## Import Cycles
- None detected.

## Communities (76 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (11): assert, COMPOSE, ENV_EXAMPLE, envEx, fs, MAIN_BRIDGE, mainSrc, offline (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.17
Nodes (10): dataDir, { execFileSync }, failures, fixtures, fs, localDir, now, os (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (22): allPhasesPathIn(), cfg(), countStepGeojson(), crypto, exists(), fs, handle(), inspectRun() (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (46): activateFreeDrawSignature(), activateScallopedDrawingMode(), applyFdTranslations(), attachFlankCardSelection(), callFlank(), cancelFreeDrawWorkflow(), cleanupSketch(), clearCirclePlacementPreview() (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.32
Nodes (13): clickSidebarTab(), loadWarGameEngine(), setGeoTool(), setMode(), setOpsIntelVisible(), setVisibleSections(), showDrawingSection(), switchTool() (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (44): _capitalise(), closePanel(), collapsePanel(), enrichUnitForDisplay(), expandPanel(), extractDeltasForUnit(), formatMagStock(), _formatReadiness() (+36 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (24): allSources, appHtml, appJsPos, bridge, CLIENT, dc, envEx, failures (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (9): adaptServerProposal(), buildSafeContext(), getContract(), getEventLog(), getInbox(), logRow(), requestProposal(), setServiceEnabled() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (21): assert, compose, containerIsUp(), DEM_DEST, dockerfile, envEx, fs, http (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (8): `ca-chain.crt` — server-certificate trust, Exporting the CA certificate on Windows, How it is used, `rmooz-client.crt` / `rmooz-client.key` — OPTIONAL mTLS client cert, RMOOZ Offline Certificates — OFFLINE-LITELLM-CA-1 / OFFLINE-LITELLM-MTLS-1, Verify after container restart, What does NOT go here / must NEVER be committed, When do I need each file?

### Community 10 - "Community 10"
Cohesion: 0.38
Nodes (6): fs, getMapConfig(), handleOfflineMapConfigApi(), isMapDataDirConfigured(), path, VALID_MODES

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (11): APP_HTML, dbSrc, ELOG_JS, failures, fs, PANEL_JS, panelHtmlEnd, panelHtmlStart (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (44): AMP_BY_ECHELON, buildPhaseTable(), buildScenarioFromFolder(), buildScenarioFromGeoJson(), buildSidc(), buildW3Scenario(), buildW4Scenario(), deriveBbox() (+36 more)

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (4): defaults, merged, overlay, path

### Community 15 - "Community 15"
Cohesion: 0.17
Nodes (31): bindOperationalScenarioGenerate(), clearRememberedScenario(), consumeLaunchParam(), getRememberedScenario(), handleEditorIntent(), handleHelpIntent(), handleLaunchIntent(), handleLayersIntent() (+23 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (11): bridge, failures, fs, i18n, loader, localBr, mainHtml, OFF (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.02
Nodes (63): addEmblemMarkerEdgeHighlight(), addSelectionHighlightsForElement(), bestIntersectionOnOpenPolyline(), bindMinefieldResizeHandles(), boundaryPathForward(), buildRectangleAutoFlankZoneRings(), centroid(), clipPolygonByObstacles() (+55 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (24): airCap, authoredRcs, authoredReadiness, authoredSupply, authoredTags, authoredUnit, catalogKeys, emptyAD (+16 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (34): _comment, _format, _generated, images, patriot-sam-battery.jpg, uss-lake-champlain-cvs39.jpg, offline_note, applies_to_platforms (+26 more)

### Community 21 - "Community 21"
Cohesion: 0.73
Nodes (5): capabilityFor(), classifyKind(), clone(), enrichUnit(), enrichWorldState()

### Community 22 - "Community 22"
Cohesion: 0.07
Nodes (27): 10. Add Campaign-Level Adjudication, 11. Change Outputs To Dynamic Action/Plan Records, 1. Add Persistent Campaign Plan Schemas, 2. Add Initial Plan And Revision Methods To Each Agent, 3. Replace Fixed `scenario.phases` Loop With Dynamic Turns, 4. Reduce `scenario.json` To Mission/Environment, Not Step Script, 5. Store Plan History In Checkpoints, 6. Replace Fixed 8 Components With Dynamic Action Lists (+19 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (14): ⚠ Architecture — main app is untouched, Current image status (OFFLINE-IMAGE-1B), LDAP Authentication, Map Source Configuration, Offline Tiles (legacy MBTiles), Purpose, Quick Start, Related (+6 more)

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (7): Host cleanup when deploying a NEW bundle over an OLD install, Linux host (bash) — run from `Offline_Deployment/`, Verify the running container is clean, What is PRESERVED (never deleted by this cleanup), What is REFRESHED / CLEARED (stale, safe to remove), Why this exists, Windows host (PowerShell) — run from `UI_MOdified\Offline_Deployment\`

### Community 25 - "Community 25"
Cohesion: 0.08
Nodes (61): BRIEF, buildLlmChildEnv(), buildMinimalScenario(), cfg(), cleanEnvPath(), computeFreshness(), computeSimProgress(), computeSources() (+53 more)

### Community 26 - "Community 26"
Cohesion: 0.04
Nodes (28): adjudicator, aiProvider, appData, CHAT_FILE, CHAT_GROUPS_FILE, CHAT_PRESENCE_FILE, CHAT_USERS_FILE, coaAgent (+20 more)

### Community 27 - "Community 27"
Cohesion: 0.24
Nodes (17): DoctrinalConfig, _get(), _get_bool(), _get_float(), _get_int(), LLMConfig, load_doctrinal_config(), load_llm_config() (+9 more)

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (7): clientMayAccessRoom(), findGroupByRoomId(), getOrCreateClientCookieId(), membersIncludes(), membersRemove(), normalizeMemberId(), parseCookies()

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (22): applyDecision(), applyDerivations(), arr(), bearing(), clampStep(), clone(), computeBalanceSummary(), computeBlsStatus() (+14 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (47): catkApplyArrowParamsToData(), catkArrowEditHandleLatLngs(), catkArrowGeometryPx(), catkArrowOverlayLatLngs(), catkArrowParamsFromNeckDragSession(), catkArrowParamsFromTipAndTailCursor(), catkArrowParamsFromTipCursor(), catkArrowParamsWithTailFromCursor() (+39 more)

### Community 34 - "Community 34"
Cohesion: 0.07
Nodes (50): addMinefieldDecorations(), addRangeCircleToMarker(), addRangeSectorToMarker(), afterGeoPrimaryKmEdit(), applyGeoObstacleAwareLineHatch(), applyGeoPathFill(), applyGeoPrimaryKmFromPopup(), applyGeoShapeStyle() (+42 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (41): addAttackArrows(), addFrontLines(), addLayerToFolder(), addPolylineFeatures(), addSlots(), addSymbolUnits(), addToActiveLayer(), applyImportedDisplayNameProps() (+33 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (24): activateDrawingModeFromTopBar(), activateEraserMode(), activateFreehandDrawMode(), activatePanInspectMode(), activateTextBoxMode(), beginMapDrawPointerCapture(), getClientXY(), getGeoSelectedTool() (+16 more)

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (18): areAnyCircleXRingsOverlapping(), autoDrawCircleXFlankLines(), buildCatkVectorHeadIconHtml(), buildReadonlyTmgMarker(), ensureObstaclePolygonsLoaded(), findClosestCircleXCenter(), frontlineCoversAllCircles(), getCircleXCenters() (+10 more)

### Community 38 - "Community 38"
Cohesion: 0.12
Nodes (19): createMultiSegmentTmgGroupSelectionBox(), createPlainLineEndpointHandles(), createTmgSelectionBox(), findOpenPolylineChainMatchingBeforeState(), findPolylinesForEraseRedo(), getMultiSegmentTmgGroupAabbLatLngs(), getPolylineFlatLatLngs(), getPolylineFlatRingAndSetter() (+11 more)

### Community 39 - "Community 39"
Cohesion: 0.10
Nodes (32): addScallopedFrontLineFromChordPairs(), applyCatkMultiPointStyle(), applyTmgStyle(), attachCatkGroupEvents(), cancelLineDrawing(), catkArrowGroupStylePayload(), catkDeriveArrowParamsFromLegacyPoints(), catkHitPolylineOptions() (+24 more)

### Community 40 - "Community 40"
Cohesion: 0.08
Nodes (32): addAutoFlankEchelonMarkers(), bindDistanceWaypointLabelTooltip(), buildCatkTailPopupContent(), buildLinePopupContent(), catkPopupStylePayload(), distanceWaypointLabelTooltipHtml(), escapeHtml(), finishDeferredUiInit() (+24 more)

### Community 41 - "Community 41"
Cohesion: 0.20
Nodes (14): applyLayerTemplate(), buildFolderMoveOptions(), captureTemplateFromLayer(), captureTemplateFromSelection(), createLayerRowElement(), createLayerTemplateId(), getFolderForLayer(), getLayerDisplayName() (+6 more)

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (25): applyZoomScaledStrokeToPolyline(), cancelGeoDrawing(), cleanupElementDecorations(), clearCatkPreviewAdornments(), clearGeoPlacementPreview(), clearGeoRadiusGuide(), createRectangleCorners(), createTmgResizeHandle() (+17 more)

### Community 43 - "Community 43"
Cohesion: 0.21
Nodes (15): bendLatLngSegmentAroundObstacles(), clipLatLngSegmentAvoidObstacles(), collectMapGeoObstaclePolygons(), collectOuterCrossingEvents(), expandScallopedControlPointsToChordPairs(), getRoutingObstaclePolygons(), latLngAlongSegment(), obstacleOuterRingToLatLngArray() (+7 more)

### Community 44 - "Community 44"
Cohesion: 0.05
Nodes (53): buildExternalScenarioCatalogFromManifest(), buildExternalScenarioSourceTrace(), buildLiveOobUnitIndex(), buildLiveStepInvolvedUnits(), buildSingleExternalScenarioCatalogEntry(), buildW3PreviewFromLoadedScenario(), buildWargame3PreviewUnitScopeSummary(), checkScenarioHealth() (+45 more)

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (10): addCurrentSidcToFavorites(), applyFavoriteSidc(), getSidcMetadataLabel(), getSymbolPopupDisplayName(), loadSidcFavorites(), pullSidcFromManualInput(), renderTopFavoritesPanel(), saveSidcFavorites() (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.30
Nodes (12): bindCatkTailPopupHandlers(), bindCoordEditorEvents(), bindDrawingRotateControls(), bindFeatureDisplayNameInput(), bindGeoPopupHandlers(), bindLinePopupHandlers(), bindMapPopupCloseButton(), bindSingleTmgPopupHandlers() (+4 more)

### Community 47 - "Community 47"
Cohesion: 0.09
Nodes (66): _buildW3EventLog(), computeStepActivity(), computeStepAttrition(), computeUnitComposition(), _drpEffectTypeLabel(), _drpFormatWarnings(), getActiveStep(), getActiveStepIndex() (+58 more)

### Community 48 - "Community 48"
Cohesion: 0.39
Nodes (8): estimate_total(), have_tile(), init_mbtiles(), lonlat_to_xyz(), main(), Slippy-map tile (x, y) for a lon/lat at zoom z (XYZ scheme)., (x0,x1,y0,y1) inclusive tile range covering bbox at zoom z., tile_ranges()

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (12): B, BLUE, blueBytes, blueText, C, DIR, { extractDocxText }, fs (+4 more)

### Community 50 - "Community 50"
Cohesion: 0.25
Nodes (7): Full-zoom offline map — guide, Step 1 — pick the Area of Interest and a tile source, Step 2 — build the MBTiles (on an internet-connected prep machine), Step 3 — register it, Step 4 — get it onto the offline machine, Step 5 — verify on the offline machine, The situation

### Community 51 - "Community 51"
Cohesion: 0.07
Nodes (36): adaptDecisionPackageFixture(), assertJsonFileSafe(), buildDecisionFixture(), buildDecisionPackageSample(), buildImportedSourceSummary(), buildImportedStepDetail(), buildImportedStepListRows(), buildImportedStepSummary() (+28 more)

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (25): applyWargame3DecisionOptionsFixtureOverlay(), buildW3ScenarioWorkflowStateFromSession(), buildWargame3DecisionOptionsPreviewData(), buildWargame3OperatorSelectionDryRunRecord(), buildWargame3ScenarioReviewSessionState(), checkWargame3ScenarioWorkflowAcceptance(), _clearW3CoaReviewRecord(), _getW3CoaReviewRecordForStep() (+17 more)

### Community 53 - "Community 53"
Cohesion: 0.19
Nodes (21): adaptWargame3ToFixture(), auditWargame3MapPreviewCoverage(), auditWargame3MovementTrailCoverage(), auditWargame3StepCoordinateDeltas(), buildScenarioStepPreview(), _buildW3JumpOptions(), buildWargame3MapPreviewReadinessReport(), buildWargame3PreviewMapFocusBounds() (+13 more)

### Community 54 - "Community 54"
Cohesion: 0.21
Nodes (17): buildApplyCandidate(), buildApplyConfirmation(), buildDryRunConfirmation(), buildLiveUnitsSnapshot(), buildStagingProposal(), isApplyCandidateSafe(), isApplyConfirmationSafe(), isDryRunConfirmationSafe() (+9 more)

### Community 55 - "Community 55"
Cohesion: 0.25
Nodes (7): failures, fs, makeTaskingLabelFn(), path, simulateCellOrders(), SW_JS, WS_JS

### Community 56 - "Community 56"
Cohesion: 0.12
Nodes (15): APP_HTML, dbSrc, failures, fs, PANEL_JS, panelEnd, panelStart, path (+7 more)

### Community 57 - "Community 57"
Cohesion: 0.06
Nodes (48): anyPresent(), classifyDocument(), countPresent(), detectLanguage(), detectSideHeadings(), detectTeam(), ENEMY_MARKERS, FRIENDLY_MARKERS (+40 more)

### Community 58 - "Community 58"
Cohesion: 0.42
Nodes (12): clearLiveOperatorSelection(), clearLiveStepStatus(), extractLiveDecisionOptions(), getActiveLiveStepContext(), getLiveStepKey(), _initLiveDecisionActionCard(), isLiveStepStatusValue(), _liveOpAppendEvent() (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (18): adjSchema, COUNT_BOUNDS, SHAPES, TOP_LEVEL, adjSchema, isBbox(), isCoord(), isFiniteNum() (+10 more)

### Community 60 - "Community 60"
Cohesion: 0.22
Nodes (11): buildScenarioOverlay(), clearScenarioOverlay(), ensureScenarioOverlay(), importSelectedFolderScenarioJson(), loadLiveScenarioFromJson(), maybeDrawLiveScenarioOnMap(), paintOverlayToggleButton(), paintScenarioOverlay() (+3 more)

### Community 61 - "Community 61"
Cohesion: 0.18
Nodes (9): APP_HTML, failures, fs, I18N_JS, PANEL_JS, panelEnd, panelStart, path (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.20
Nodes (8): APP_HTML, dbSrc, failures, fs, PANEL_JS, path, sandbox, wsSrc

### Community 63 - "Community 63"
Cohesion: 0.20
Nodes (8): APP_HTML, failures, fs, I18N_JS, PANEL_JS, panelEnd, panelStart, path

### Community 64 - "Community 64"
Cohesion: 0.25
Nodes (6): app, dbs, express, fs, path, tileListener

### Community 65 - "Community 65"
Cohesion: 0.25
Nodes (6): app, dbs, express, fs, path, tileListener

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (8): ASSET_DIR, failures, fs, MANIFEST, PANEL_JS, path, SAM_PATH, sandbox

### Community 67 - "Community 67"
Cohesion: 0.21
Nodes (13): clearSelection(), clearSelectionHighlights(), getSelectionBounds(), getSelectionHighlightPathOptions(), getSelectionRotateHandleLatLng(), positionSelectionToolbar(), removeSelectionAreaAnchorHandle(), removeSelectionAreaRotateHandle() (+5 more)

### Community 68 - "Community 68"
Cohesion: 0.60
Nodes (5): _bindTimelineTransport(), _swPlayIntervalMs(), _swStartPlay(), _swStepCount(), _swStopPlay()

### Community 69 - "Community 69"
Cohesion: 1.00
Nodes (3): Path, _looks_like_smart_search_repo(), _resolve_smart_search_repo_path()

### Community 73 - "Community 73"
Cohesion: 0.13
Nodes (8): baseScn(), BOX, FAR, mkSteps(), norm, path, PT, validator

### Community 74 - "Community 74"
Cohesion: 0.22
Nodes (14): aggKey(), AR_ADHVA, AR_HQ, AR_OBJ, buildContext(), buildReferencedSet(), classify(), haversineKm() (+6 more)

### Community 75 - "Community 75"
Cohesion: 0.13
Nodes (14): A. Client shell — operational modules (`UI_MOdified/client/shell/`), 🎯 ACTIVE BUILD ROADMAP — RMOOZ Direction Reset (2026-06-01), APP_INVENTORY — RMOOZ / CMO feature map, B. Wargame / adjudicator visualization (`UI_MOdified/client/wargame/`), C. Server — AI agents + sim boundary (`UI_MOdified/server/ai/`, `server/sim/`), D. Cross-cutting client (`UI_MOdified/client/`), ⚠️ DRIFT — code vs. documented decisions (confirm before relying on memory), E. Server REST API surface (`UI_MOdified/server/web-server.js`) (+6 more)

### Community 76 - "Community 76"
Cohesion: 0.19
Nodes (10): baseScenario(), blueUnits(), BOX, mkSteps(), neutralUnits(), path, PT, redUnits() (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.25
Nodes (5): C, MIXED_AR, path, WARNO_AR, WARNO_BOTH_SIDES

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (4): B, C, MIXED_ORDER, path

## Knowledge Gaps
- **397 isolated node(s):** `path`, `fs`, `B`, `{ extractDocxText }`, `C` (+392 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Path` connect `Community 69` to `Community 64`, `Community 65`, `Community 66`, `Community 73`, `Community 76`, `Community 77`, `Community 78`, `Community 49`, `Community 55`, `Community 56`, `Community 25`, `Community 26`, `Community 27`, `Community 61`, `Community 62`, `Community 63`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `load_llm_config()` connect `Community 27` to `Community 69`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `tx()` connect `Community 47` to `Community 44`, `Community 51`, `Community 52`, `Community 53`, `Community 54`, `Community 58`, `Community 60`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `path`, `fs`, `B` to the rest of the system?**
  _401 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09869375907111756 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.09250693802035152 - nodes in this community are weakly interconnected._