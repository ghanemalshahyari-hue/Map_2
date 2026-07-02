const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MAIN_APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
const OFFLINE_APP = path.join(ROOT, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'app.html');
const MAIN_SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
const OFFLINE_SHELL = path.join(ROOT, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell');
const INVENTORY = path.join(ROOT, 'APP_INVENTORY.md');
const HANDOFF = path.join(ROOT, 'UI_MOdified', 'docs', 'cmo-evidence-demo-handoff.md');
const RUNBOOK = path.join(ROOT, 'UI_MOdified', 'docs', 'cmo-evidence-demo-runbook.md');
const KNOWN = path.join(ROOT, 'UI_MOdified', 'KNOWN_ISSUES.md');

const CMO_SCRIPTS = [
  'cmo-evidence-labels.js',
  'cmo-evidence-timeline.js',
  'contact-evidence.js',
  'engagement-evidence.js',
  'decision-chain-evidence.js',
  'cmo-evidence-recommendations.js',
  'cmo-recommendation-drilldown.js',
  'cmo-evidence-readiness-matrix.js',
  'cmo-evidence-alerts.js',
  'cmo-evidence-quality-gate.js',
  'cmo-evidence-coverage.js',
  'cmo-blocker-remediation.js',
  'cmo-alternative-shooters.js',
  'cmo-commander-brief.js',
  'cmo-force-evidence-feed.js',
  'cmo-force-evidence-report.js',
  'evidence-map-overlays.js',
  'cmo-evidence-export.js',
  'unit-status-panel.js'
];

const SCENARIO_QA_SCRIPTS = [
  'scenario-evidence-completeness.js',
  'scenario-evidence-normalizer.js',
  'objective-x-evidence-health.js',
  'scenario-evidence-review-queue.js',
  'scenario-evidence-repair-planner.js'
];

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok - ' + name);
  } catch (err) {
    console.error('not ok - ' + name);
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function git(args) {
  return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function scriptNames(html) {
  const names = [];
  const re = /<script[^>]+src=["']shell\/([^"']+?\.js)(?:\?[^"']*)?["'][^>]*>/g;
  let m;
  while ((m = re.exec(html))) names.push(m[1]);
  return names;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const mainHtml = read(MAIN_APP);
const offlineHtml = read(OFFLINE_APP);
const inventory = read(INVENTORY);
const handoff = read(HANDOFF);
const runbook = read(RUNBOOK);
const known = read(KNOWN);
const docs = [inventory, handoff, runbook, known].join('\n');
const mainScripts = scriptNames(mainHtml);
const offlineScripts = scriptNames(offlineHtml);
const expectedEvidenceScripts = CMO_SCRIPTS.concat(SCENARIO_QA_SCRIPTS);

test('APP_INVENTORY mentions current CMO, actionability, and Scenario-QA stack', () => {
  [
    'RMOOZ-AUDIT-APP-1',
    'CMO-1   Engagement Evidence',
    'CMO-16  Evidence Recommendations',
    'CMO Actionability Batch',
    'scenario-evidence v1',
    'scenario-evidence v2',
    'scenario-evidence v3',
    'Scenario Evidence Completeness',
    'Scenario Evidence Review Queue',
    'Scenario Evidence Repair Planner'
  ].forEach((needle) => assert.ok(inventory.includes(needle), 'inventory missing ' + needle));
});

test('main and offline app.html contain expected CMO and Scenario-QA scripts', () => {
  expectedEvidenceScripts.forEach((script) => {
    assert.ok(mainScripts.includes(script), 'main app missing ' + script);
    assert.ok(offlineScripts.includes(script), 'offline app missing ' + script);
  });
});

test('expected evidence script files exist in main and offline static trees', () => {
  expectedEvidenceScripts.forEach((script) => {
    assert.ok(fs.existsSync(path.join(MAIN_SHELL, script)), 'main shell file missing ' + script);
    assert.ok(fs.existsSync(path.join(OFFLINE_SHELL, script)), 'offline shell file missing ' + script);
  });
});

test('every shared main/offline shell module is byte-identical (OFFLINE-PARITY-D6)', () => {
  // The offline app shell is a subset of main: any shell/*.js present in BOTH
  // trees must be byte-identical, or the offline build can silently demo
  // different behavior. This gate closes Drift D6 (scenario-import-wizard.js
  // had drifted ~407 lines because no gate compared file *content*).
  const offlineFiles = fs.readdirSync(OFFLINE_SHELL).filter((f) => f.endsWith('.js'));
  const shared = offlineFiles.filter((f) => fs.existsSync(path.join(MAIN_SHELL, f)));
  assert.ok(shared.length > 0, 'expected shared shell modules');
  const drifted = shared.filter((f) => read(path.join(MAIN_SHELL, f)) !== read(path.join(OFFLINE_SHELL, f)));
  assert.deepStrictEqual(drifted, [], 'offline shell modules drifted from main: ' + drifted.join(', '));
  // scenario-import-wizard.js is the specific D6 regression — assert it is covered.
  assert.ok(shared.includes('scenario-import-wizard.js'), 'scenario-import-wizard.js must be parity-checked');
});

test('main and offline evidence script order matches for the audited modules', () => {
  const mainOrder = expectedEvidenceScripts.map((s) => mainScripts.indexOf(s));
  const offlineOrder = expectedEvidenceScripts.map((s) => offlineScripts.indexOf(s));
  mainOrder.forEach((idx, i) => assert.ok(idx >= 0 && idx === mainScripts.indexOf(expectedEvidenceScripts[i])));
  offlineOrder.forEach((idx, i) => assert.ok(idx >= 0 && idx === offlineScripts.indexOf(expectedEvidenceScripts[i])));
  assert.deepStrictEqual(
    expectedEvidenceScripts.filter((s) => mainScripts.includes(s)),
    expectedEvidenceScripts.filter((s) => offlineScripts.includes(s))
  );
  assert.ok(mainScripts.indexOf('cmo-evidence-labels.js') < mainScripts.indexOf('decision-chain-evidence.js'));
  assert.ok(mainScripts.indexOf('decision-chain-evidence.js') < mainScripts.indexOf('cmo-evidence-recommendations.js'));
  assert.ok(mainScripts.indexOf('scenario-evidence-repair-planner.js') < mainScripts.indexOf('unit-status-panel.js'));
});

test('release docs document env-file compose command, LAN URL, and public NAT issue', () => {
  const compose = 'docker compose --env-file UI_MOdified/Offline_Deployment/.env.offline -f UI_MOdified/Offline_Deployment/docker-compose.offline.yml up -d';
  [inventory, handoff, runbook, known].forEach((doc) => assert.ok(doc.includes(compose), 'doc missing canonical compose command'));
  assert.ok(docs.includes('http://172.16.29.157:8640'), 'docs missing LAN demo URL');
  assert.ok(docs.includes('155.140.70.51:8640'), 'docs missing public endpoint note');
  assert.ok(docs.includes('network/admin-side') || docs.includes('network/admin'), 'docs missing network/admin classification');
});

test('runtime user plan GeoJSON files stay untracked', () => {
  const tracked = git(['ls-files', 'UI_MOdified/data/users/**/*.geojson'])
    .split(/\r?\n/)
    .filter(Boolean);
  assert.deepStrictEqual(tracked, [], 'tracked runtime user plan files: ' + tracked.join(', '));
  assert.ok(
    read(path.join(ROOT, '.gitignore')).includes('UI_MOdified/data/users/*/plans/*.geojson'),
    '.gitignore must ignore runtime user plan GeoJSON files'
  );
});

test('current release tags and baselines are documented', () => {
  ['cmo-evidence-v13', 'cmo-evidence-rc1', 'cmo-evidence-v14', 'cmo-evidence-readability-v1'].forEach((tag) => {
    assert.ok(docs.includes(tag), 'docs missing ' + tag);
  });
});

test('active client/offline/server code does not restore stage-doc or Red/Blue DOCX staging UI', () => {
  const activeFiles = [
    ...walk(path.join(ROOT, 'UI_MOdified', 'client')).filter((f) => /\.(js|html|css)$/.test(f)),
    ...walk(path.join(ROOT, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client')).filter((f) => /\.(js|html|css)$/.test(f)),
    ...walk(path.join(ROOT, 'UI_MOdified', 'server')).filter((f) => /\.js$/.test(f))
  ];
  const haystack = activeFiles.map((f) => read(f)).join('\n');
  [
    '/api/wargame-sim/stage-doc',
    'SLOT_FILE',
    'docs.red',
    'docs.blue',
    'DOCX hash',
    'Red/Blue DOCX'
  ].forEach((needle) => assert.ok(!haystack.includes(needle), 'active code revived ' + needle));
});

test('audited evidence modules remain read-only and route-free', () => {
  const moduleFiles = expectedEvidenceScripts
    .filter((script) => script !== 'unit-status-panel.js')
    .map((script) => path.join(MAIN_SHELL, script));
  const source = moduleFiles.map((f) => read(f)).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.ok(!/fetch\s*\(/.test(source), 'evidence modules must not fetch');
  assert.ok(!/XMLHttpRequest/.test(source), 'evidence modules must not use XHR');
  assert.ok(!/\/api\//.test(source), 'evidence modules must not add backend route calls');
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire|approved-actions/.test(source), 'evidence modules must not mutate actions/combat');
  assert.ok(!/applyDoctrine|commitDoctrine|updateDoctrine|setDoctrine|\/doctrine/.test(source), 'evidence modules must not mutate doctrine');
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' app inventory audit checks');
}
