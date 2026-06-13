#!/usr/bin/env node
/**
 * GIS-TERRAIN-1 / T-4A-V — regenerate sample-placement-terrain.json for the
 * placement-panel terrain verify harness (verify-placement-terrain.html).
 *
 * Runs the REAL G-3B resolver with the REAL T-4A opt-in (includeTerrain:true)
 * over the browser-acceptance mentions (Bandar Abbas, Chah Bahar, one explicit
 * coordinate) so the harness renders production candidate payloads — terrain
 * blocks included (DEM-less machines produce the degraded blocks live).
 *
 *   node UI_MOdified/devtools/fixtures/doc-understanding/make-sample-placement-terrain.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const LI = require(path.join(__dirname, '..', '..', '..', 'server', 'ai', 'location-intelligence'));
const PM = require(path.join(__dirname, '..', '..', '..', 'server', 'ai', 'planning-model'));

const model = LI.enrichPlanningModelLocations(PM.emptyPlanningModel(), {
    mentions: ['قاعدة بندر عباس', 'قاعدة شاه بهار', '29.74, 19.55'],
    ao: [50.0, 20.0, 62.0, 30.0],                  // bbox putting Chabahar inside, OBJ coord outside
    includeTerrain: true,                          // T-4A
});

const payload = {
    ok: true,
    placement: {
        placement_candidates: model.placement_candidates,
        missing_information: model.missing_information,
        conflicts: model.conflicts,
    },
};

const dest = path.join(__dirname, 'sample-placement-terrain.json');
fs.writeFileSync(dest, JSON.stringify(payload, null, 2));
console.log('wrote', dest,
    '· candidates=' + payload.placement.placement_candidates.length,
    '· withTerrain=' + payload.placement.placement_candidates.filter(c => c.terrain).length);
