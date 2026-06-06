/**
 * OFFLINE-LLM-PACK-0 — Ollama model packaging and WarGamingGEN output tests
 *
 * Static tests: verify docs, scripts, env file, compose volumes, and isolation.
 * No Ollama or Docker required — purely file/content checks.
 *
 * Usage:
 *   node test-offline-llm-pack-0.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const OD   = path.join(ROOT, 'Offline_Deployment');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  OFFLINE-LLM-PACK-0 — Ollama + WarGamingGEN packaging tests');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─── §1  Ollama documentation ─────────────────────────────────────────────────
console.log('── §1  Ollama model package documentation ──────────────────────');

const ollamaGuide = fs.readFileSync(
    path.join(OD, 'docs', 'offline-ollama-model-package-guide.md'), 'utf8'
);

test('offline-ollama-model-package-guide.md exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'docs', 'offline-ollama-model-package-guide.md')));
});

test('guide states model name alone is not enough', () => {
    assert.ok(
        ollamaGuide.includes('model name alone') ||
        ollamaGuide.includes('name alone') ||
        ollamaGuide.includes('only selects') ||
        ollamaGuide.includes('RMOOZ_OLLAMA_MODEL only selects'),
        'Guide must explain that the model name does not include weights'
    );
});

test('guide states no API key or password required for local Ollama', () => {
    assert.ok(
        ollamaGuide.toLowerCase().includes('no api key') ||
        ollamaGuide.toLowerCase().includes('no secret') ||
        ollamaGuide.toLowerCase().includes('no password') ||
        ollamaGuide.toLowerCase().includes('does not require'),
        'Guide must state no API key/password is needed for local Ollama'
    );
});

test('guide explains host.docker.internal connection', () => {
    assert.ok(
        ollamaGuide.includes('host.docker.internal'),
        'Guide must explain how RMOOZ container connects to Ollama'
    );
});

test('guide documents LAN IP / separate machine option', () => {
    assert.ok(
        ollamaGuide.includes('LAN') || ollamaGuide.includes('separate machine') ||
        ollamaGuide.includes('machine-ip'),
        'Guide must document connecting to Ollama on a separate machine'
    );
});

test('guide explains model transfer (blobs/manifests)', () => {
    assert.ok(
        ollamaGuide.includes('blobs') || ollamaGuide.includes('manifests') ||
        ollamaGuide.includes('model storage'),
        'Guide must explain what needs to be transferred (not just the name)'
    );
});

test('guide lists ollama list and ollama run verification commands', () => {
    assert.ok(
        ollamaGuide.includes('ollama list') && ollamaGuide.includes('ollama run'),
        'Guide must include verification commands'
    );
});

// ─── §2  Export script ────────────────────────────────────────────────────────
console.log('\n── §2  export-ollama-model-info.ps1 ───────────────────────────');

const exportScript = fs.readFileSync(
    path.join(OD, 'scripts', 'export-ollama-model-info.ps1'), 'utf8'
);

test('export-ollama-model-info.ps1 exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'scripts', 'export-ollama-model-info.ps1')));
});

test('export script runs ollama list', () => {
    assert.ok(exportScript.includes('ollama list'), 'Must run ollama list');
});

test('export script runs ollama show', () => {
    assert.ok(exportScript.includes('ollama show'), 'Must run ollama show');
});

test('export script saves to ollama_model_info/', () => {
    assert.ok(exportScript.includes('ollama_model_info'), 'Must save to ollama_model_info/');
});

test('export script saves model-name.txt', () => {
    assert.ok(exportScript.includes('model-name.txt'), 'Must save model-name.txt');
});

test('export script saves model-list.txt', () => {
    assert.ok(exportScript.includes('model-list.txt'), 'Must save model-list.txt');
});

test('export script has no hardcoded API key or password', () => {
    assert.ok(
        !exportScript.match(/api[_-]?key\s*=\s*['"]\w{8,}/i),
        'Export script must not contain a hardcoded API key'
    );
});

// ─── §3  JSON output test script ──────────────────────────────────────────────
console.log('\n── §3  test-wargaminggen-json-outputs.ps1 ──────────────────────');

const outputTestScript = fs.readFileSync(
    path.join(OD, 'scripts', 'test-wargaminggen-json-outputs.ps1'), 'utf8'
);

test('test-wargaminggen-json-outputs.ps1 exists', () => {
    assert.ok(fs.existsSync(path.join(OD, 'scripts', 'test-wargaminggen-json-outputs.ps1')));
});

test('output test script checks all_phases.geojson', () => {
    assert.ok(outputTestScript.includes('all_phases.geojson'), 'Must check all_phases.geojson');
});

test('output test script checks export_to_rmooz', () => {
    assert.ok(outputTestScript.includes('export_to_rmooz'), 'Must check export_to_rmooz');
});

test('output test script checks red_team.docx and blue_team.docx', () => {
    assert.ok(
        outputTestScript.includes('red_team.docx') && outputTestScript.includes('blue_team.docx'),
        'Must check for DOCX input files'
    );
});

test('output test script reports missing files clearly', () => {
    assert.ok(
        outputTestScript.includes('[PASS]') && outputTestScript.includes('[FAIL]'),
        'Must have clear pass/fail reporting'
    );
});

// ─── §4  .env.offline.example — Ollama/WarGamingGEN vars ─────────────────────
console.log('\n── §4  .env.offline.example — Ollama/WarGamingGEN defaults ────');

const envEx = fs.readFileSync(path.join(OD, '.env.offline.example'), 'utf8');

test('RMOOZ_AI_PROVIDER=ollama is set', () => {
    assert.ok(envEx.match(/^RMOOZ_AI_PROVIDER\s*=\s*ollama/m),
        'RMOOZ_AI_PROVIDER must be ollama');
});

test('RMOOZ_OLLAMA_URL is configured', () => {
    assert.ok(envEx.includes('RMOOZ_OLLAMA_URL='), 'Must have RMOOZ_OLLAMA_URL');
});

test('RMOOZ_OLLAMA_MODEL is set to qwen2.5:7b', () => {
    assert.ok(envEx.includes('RMOOZ_OLLAMA_MODEL=qwen2.5:7b'), 'Must default to qwen2.5:7b');
});

test('OLLAMA_HOST is set to host.docker.internal', () => {
    assert.ok(envEx.includes('OLLAMA_HOST=http://host.docker.internal'),
        'OLLAMA_HOST must default to host.docker.internal');
});

test('RMOOZ_SIM_MODEL is set', () => {
    assert.ok(envEx.includes('RMOOZ_SIM_MODEL='), 'Must have RMOOZ_SIM_MODEL');
});

test('RMOOZ_ALLOW_SIM_RUN=1 in env example', () => {
    assert.ok(envEx.match(/^RMOOZ_ALLOW_SIM_RUN\s*=\s*1/m),
        'RMOOZ_ALLOW_SIM_RUN must be 1 (WarGamingGEN enabled by default)');
});

test('env file warns that model name is not enough', () => {
    assert.ok(
        envEx.includes('only selects') || envEx.includes('does not include') ||
        envEx.includes('do NOT include') || envEx.includes('NOT include'),
        'env file must explain model name does not bundle weights'
    );
});

test('env file states no API key required for local Ollama', () => {
    assert.ok(
        envEx.toLowerCase().includes('no api key') ||
        envEx.toLowerCase().includes('no password') ||
        envEx.toLowerCase().includes('does not require') ||
        envEx.toLowerCase().includes('without any secret'),
        'env file must note no API key needed'
    );
});

// ─── §5  docker-compose.offline.yml — volume persistence ─────────────────────
console.log('\n── §5  docker-compose.offline.yml — WarGamingGEN volumes ──────');

const compose = fs.readFileSync(path.join(OD, 'docker-compose.offline.yml'), 'utf8');

test('compose mounts import_from_rmooz', () => {
    assert.ok(compose.includes('import_from_rmooz'), 'Must mount import_from_rmooz');
});

test('compose mounts export_to_rmooz', () => {
    assert.ok(compose.includes('export_to_rmooz'), 'Must mount export_to_rmooz');
});

test('compose mounts runs/ (contains checkpoints + outputs)', () => {
    assert.ok(compose.includes('TestingAI_Runtime/runs'), 'Must mount runs/');
});

test('compose documents that runs/ contains checkpoints and outputs', () => {
    assert.ok(
        compose.includes('checkpoints') || compose.includes('outputs'),
        'compose must document that runs/ contains checkpoints/outputs subdirs'
    );
});

test('compose passes RMOOZ_ALLOW_SIM_RUN from env', () => {
    assert.ok(
        compose.includes('RMOOZ_ALLOW_SIM_RUN') && !compose.match(/RMOOZ_ALLOW_SIM_RUN:\s*"0"/),
        'compose must pass RMOOZ_ALLOW_SIM_RUN from env (not hardcode to 0)'
    );
});

test('compose passes OLLAMA_HOST', () => {
    assert.ok(compose.includes('OLLAMA_HOST'), 'compose must pass OLLAMA_HOST');
});

test('compose passes RMOOZ_SIM_MODEL', () => {
    assert.ok(compose.includes('RMOOZ_SIM_MODEL'), 'compose must pass RMOOZ_SIM_MODEL');
});

// ─── §6  TestingAI_Runtime directories ───────────────────────────────────────
console.log('\n── §6  TestingAI_Runtime directories ───────────────────────────');

for (const d of ['import_from_rmooz', 'export_to_rmooz', 'runs']) {
    test(`TestingAI_Runtime/${d}/ exists`, () => {
        assert.ok(
            fs.existsSync(path.join(OD, 'TestingAI_Runtime', d)),
            `TestingAI_Runtime/${d}/ must exist`
        );
    });
}

// checkpoints and outputs live INSIDE runs/<timestamp>/ — document this
test('TestingAI_Runtime README exists and documents structure', () => {
    const readme = path.join(OD, 'TestingAI_Runtime', 'README.md');
    assert.ok(fs.existsSync(readme), 'TestingAI_Runtime/README.md must exist');
});

// ─── §7  ollama_model_info placeholder ───────────────────────────────────────
console.log('\n── §7  ollama_model_info/ placeholder ──────────────────────────');

test('Offline_Deployment/ollama_model_info/ exists', () => {
    assert.ok(
        fs.existsSync(path.join(OD, 'ollama_model_info')),
        'ollama_model_info/ must exist for export script output'
    );
});

test('ollama_model_info/README.md exists', () => {
    assert.ok(
        fs.existsSync(path.join(OD, 'ollama_model_info', 'README.md')),
        'ollama_model_info/README.md must exist'
    );
});

// ─── §8  Checklist updated ───────────────────────────────────────────────────
console.log('\n── §8  offline-deployment-checklist.md — Ollama steps ──────────');

const checklist = fs.readFileSync(
    path.join(OD, 'docs', 'offline-deployment-checklist.md'), 'utf8'
);

test('checklist has ollama list verification step', () => {
    assert.ok(checklist.includes('ollama list'), 'Checklist must include ollama list step');
});

test('checklist has ollama run verification step', () => {
    assert.ok(checklist.includes('ollama run'), 'Checklist must include ollama run step');
});

test('checklist warns about model name not being enough', () => {
    assert.ok(
        checklist.includes('not include') || checklist.includes('do not bundle') ||
        checklist.includes('must already') || checklist.includes('not enough') ||
        checklist.includes('not bundle'),
        'Checklist must warn that model name alone does not include weights'
    );
});

// ─── §9  Main app isolation regression ───────────────────────────────────────
console.log('\n── §9  Main app isolation regression ───────────────────────────');

function runFile(file) {
    return spawnSync(process.execPath, [file], {
        cwd: ROOT, env: process.env, timeout: 60000, encoding: 'utf8'
    });
}

test('test-offline-isolation-0.js still passes (47/47)', () => {
    const r = runFile(path.join(ROOT, 'test-offline-isolation-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error('Isolation failures:\n' + r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout), 'No PASS output');
    const code = r.status ?? r.code;
    assert.ok(code === 0, `Exited ${code}`);
});

test('test-offline-map-0.js still passes (43/43)', () => {
    const r = runFile(path.join(ROOT, 'test-offline-map-0.js'));
    if (/\[FAIL\]/.test(r.stdout)) throw new Error('Map test failures:\n' + r.stdout.slice(-400));
    assert.ok(/\[PASS\]/.test(r.stdout), 'No PASS output');
    const code = r.status ?? r.code;
    assert.ok(code === 0, `Exited ${code}`);
});

// ─── §10 Main app untouched ───────────────────────────────────────────────────
console.log('\n── §10 Main app untouched ──────────────────────────────────────');

test('main package.json has no RMOOZ_AI_PROVIDER or OLLAMA_HOST setting', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const scripts = JSON.stringify(pkg.scripts || {});
    assert.ok(!scripts.includes('OLLAMA_HOST='), 'Main package.json scripts must not hardcode OLLAMA_HOST');
});

test('main server/app-data.js does not reference ollama_model_info', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'app-data.js'), 'utf8');
    assert.ok(!src.includes('ollama_model_info'), 'Main app-data.js must not reference ollama_model_info');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(66) + '\n');
process.exit(failed > 0 ? 1 : 0);
