/**
 * Scenario starter-template registry (Batch B Slice 10; Batch D Slice 5 adds
 * operator-saved templates).
 *
 * Read-only for the static registry — same class as scenario-loader.js's
 * GET /api/ai/scenarios / /api/ai/scenario/:name (no requireAuthenticatedUser
 * gate there either). A tiny in-file registry, not a filesystem scan, so the
 * curated set is explicit and reviewable in a diff.
 *
 * Batch D Slice 5 ("Save as Template") adds a SECOND, DYNAMIC source: JSON
 * files under DATA_DIR/scenario-templates/ (operator-writable, unlike the
 * static REGISTRY which ships with the app source). listTemplates()/
 * loadTemplate() merge both — this is the ONE template registry the app
 * reads from, not a parallel store.
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

function dataDir() { return process.env.RMOOZ_DATA_DIR || path.join(__dirname, '..', '..', 'data'); }
function dynamicTemplatesDir() { return path.join(dataDir(), 'scenario-templates'); }

// Dynamic (operator-saved) templates carry their label alongside the content
// in a small sidecar `<id>.meta.json` — keeps the template's own scenario
// JSON exactly loadable as-is (no injected non-scenario fields).
function listDynamicTemplates() {
    const dir = dynamicTemplatesDir();
    let files;
    try { files = fs.readdirSync(dir); } catch (_) { return []; }
    return files
        .filter((f) => f.endsWith('.meta.json'))
        .map((f) => {
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                return { id: meta.id, label: meta.label, saved_by: meta.saved_by, saved_at: meta.saved_at, source: 'dynamic' };
            } catch (_) { return null; }
        })
        .filter(Boolean);
}

function listTemplates() {
    return REGISTRY.map((t) => ({ id: t.id, label: t.label, source: 'static' })).concat(listDynamicTemplates());
}

function loadTemplate(id) {
    const entry = REGISTRY.find((t) => t.id === id);
    if (entry) {
        const raw = fs.readFileSync(entry.file, 'utf8');
        return JSON.parse(raw);
    }
    const dynamicFile = path.join(dynamicTemplatesDir(), id + '.json');
    try {
        return JSON.parse(fs.readFileSync(dynamicFile, 'utf8'));
    } catch (_) {
        throw new Error('unknown template: ' + id);
    }
}

// Save the CURRENT scenario content as a new reusable template. `label` is
// operator-supplied (shown in the template picker); `id` is derived from the
// scenario's own name plus a short random suffix so repeated saves from the
// same source scenario don't collide.
function saveAsTemplate(scenarioContent, label, user) {
    if (!label || typeof label !== 'string' || !label.trim()) {
        throw new Error('label is required to save a template');
    }
    const dir = dynamicTemplatesDir();
    fs.mkdirSync(dir, { recursive: true });
    const baseName = (scenarioContent && typeof scenarioContent.name === 'string' && scenarioContent.name.trim())
        ? scenarioContent.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
        : 'template';
    const suffix = require('crypto').randomBytes(4).toString('hex');
    const id = 'tmpl-' + baseName + '-' + suffix;
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(scenarioContent, null, 2), 'utf8');
    const meta = { id, label: label.trim(), saved_by: (user && (user.username || user.id)) || null, saved_at: now };
    fs.writeFileSync(path.join(dir, id + '.meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    return meta;
}

module.exports = { listTemplates, loadTemplate, saveAsTemplate, REGISTRY };
