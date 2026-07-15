/**
 * Scenario starter-template registry (Batch B Slice 10).
 *
 * Read-only, no auth-mutation concerns — same class as scenario-loader.js's
 * GET /api/ai/scenarios / /api/ai/scenario/:name (no requireAuthenticatedUser
 * gate there either). A tiny in-file registry, not a filesystem scan, so the
 * available templates are explicit and reviewable in a diff.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

const REGISTRY = [
    {
        id: 'sahil-corridor',
        label: 'Sahil Corridor — Coastal Corridor Defense (CMO playbook sample)',
        file: path.join(REPO_ROOT, 'docs', 'cmo-functional-rules', 'sample-sahil-corridor.json')
    },
    {
        id: 'blank-coastal-ao',
        label: 'Blank Coastal AO (starter template)',
        file: path.join(__dirname, 'scenario-templates', 'blank-coastal-ao.json')
    }
];

function listTemplates() {
    return REGISTRY.map((t) => ({ id: t.id, label: t.label }));
}

function loadTemplate(id) {
    const entry = REGISTRY.find((t) => t.id === id);
    if (!entry) throw new Error('unknown template: ' + id);
    const raw = fs.readFileSync(entry.file, 'utf8');
    return JSON.parse(raw);
}

module.exports = { listTemplates, loadTemplate, REGISTRY };
