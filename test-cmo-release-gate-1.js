const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const mainClientDir = path.join(rootDir, 'UI_MOdified', 'client');
const mainShellDir = path.join(mainClientDir, 'shell');
const offlineClientDir = path.join(rootDir, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client');
const offlineShellDir = path.join(offlineClientDir, 'shell');
const mainAppPath = path.join(mainClientDir, 'app.html');
const offlineAppPath = path.join(offlineClientDir, 'app.html');
const composePath = path.join(rootDir, 'UI_MOdified', 'Offline_Deployment', 'docker-compose.offline.yml');
const envPath = path.join(rootDir, 'UI_MOdified', 'Offline_Deployment', '.env.offline');

const cmoScripts = [
  'cmo-evidence-labels.js',
  'engagement-evidence.js',
  'contact-evidence.js',
  'decision-chain-evidence.js',
  'cmo-evidence-recommendations.js',
  'evidence-map-overlays.js',
  'cmo-evidence-timeline.js',
  'cmo-evidence-readiness-matrix.js',
  'cmo-evidence-alerts.js',
  'cmo-evidence-quality-gate.js',
  'cmo-force-evidence-feed.js',
  'cmo-force-evidence-report.js',
  'cmo-evidence-export.js'
];

const panelSections = [
  'usp-evidence-quality-block',
  'usp-evidence-alerts-block',
  'usp-evidence-matrix-block',
  'usp-force-feed-block',
  'usp-contact-evidence-block',
  'usp-engagement-evidence-block',
  'usp-chain-evidence-block',
  'usp-evidence-recommendations-block',
  'usp-evidence-timeline-block',
  'usp-evidence-export-block',
  'usp-force-report-block'
];

const mainApp = fs.readFileSync(mainAppPath, 'utf8');
const offlineApp = fs.readFileSync(offlineAppPath, 'utf8');
const compose = fs.readFileSync(composePath, 'utf8');
const envOffline = fs.readFileSync(envPath, 'utf8');

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

function readShell(file) {
  return fs.readFileSync(path.join(mainShellDir, file), 'utf8');
}

test('all CMO evidence scripts exist in main and offline app.html', () => {
  cmoScripts.forEach((file) => {
    assert.ok(fs.existsSync(path.join(mainShellDir, file)), 'missing main script file ' + file);
    assert.ok(fs.existsSync(path.join(offlineShellDir, file)), 'missing offline script file ' + file);
    assert.ok(mainApp.includes('shell/' + file), 'missing main app include ' + file);
    assert.ok(offlineApp.includes('shell/' + file), 'missing offline app include ' + file);
  });
});

test('quality, matrix, drilldown, export, and report sections exist in both shells', () => {
  panelSections.forEach((id) => {
    assert.ok(mainApp.includes('id="' + id + '"'), 'missing main section ' + id);
    assert.ok(offlineApp.includes('id="' + id + '"'), 'missing offline section ' + id);
  });
  assert.ok(readShell('cmo-evidence-quality-gate.js').includes('bindQualityInteractions'));
  assert.ok(readShell('cmo-evidence-readiness-matrix.js').includes('bindMatrixInteractions'));
  assert.ok(readShell('cmo-evidence-alerts.js').includes('bindAlertInteractions'));
});

test('print controls and print CSS are included in main and offline artifacts', () => {
  const mainExport = readShell('cmo-evidence-export.js');
  const mainReport = readShell('cmo-force-evidence-report.js');
  const offlineExport = fs.readFileSync(path.join(offlineShellDir, 'cmo-evidence-export.js'), 'utf8');
  const offlineReport = fs.readFileSync(path.join(offlineShellDir, 'cmo-force-evidence-report.js'), 'utf8');
  [mainExport, offlineExport].forEach((source) => {
    assert.ok(source.includes('Print Unit Snapshot'));
    assert.ok(source.includes('data-cmo-export-action="print"'));
    assert.ok(source.includes('buildPrintableSnapshotHtml'));
  });
  [mainReport, offlineReport].forEach((source) => {
    assert.ok(source.includes('Print Force Report'));
    assert.ok(source.includes('data-cmo-force-report-action="print"'));
    assert.ok(source.includes('buildPrintableReportHtml'));
  });
  [mainApp, offlineApp].forEach((html) => {
    assert.ok(html.includes('body[data-cmo-print-mode="evidence"] > *:not(#cmo-print-root)'));
    assert.ok(html.includes('.cmo-print-disclaimer'));
  });
});

test('force report and unit snapshot include read-only print disclaimers', () => {
  const unitExport = readShell('cmo-evidence-export.js');
  const forceReport = readShell('cmo-force-evidence-report.js');
  assert.ok(unitExport.includes('Read-only evidence snapshot'));
  assert.ok(unitExport.includes('does not authorize fire'));
  assert.ok(unitExport.includes('mutate doctrine'));
  assert.ok(forceReport.includes('Read-only force evidence report'));
  assert.ok(forceReport.includes('does not authorize fire'));
  assert.ok(forceReport.includes('change scenario state'));
});

test('release candidate uses documented offline env path for 8640 runtime', () => {
  assert.ok(compose.includes('--env-file Offline_Deployment/.env.offline'));
  assert.ok(compose.includes('${WEB_PUBLIC_PORT:-5006}:5006'));
  assert.ok(compose.includes('RMOOZ_TILE_PROXY_MODE: "${RMOOZ_TILE_PROXY_MODE:-web}"'));
  assert.ok(/^WEB_PUBLIC_PORT=8640$/m.test(envOffline));
  assert.ok(/^WEB_PUBLIC_BASE_URL=http:\/\/155\.140\.70\.51:8640$/m.test(envOffline));
});

test('CMO release modules require no backend route and add no combat mutation path', () => {
  const combined = cmoScripts
    .filter((file) => file !== 'cmo-evidence-labels.js')
    .map(readShell)
    .join('\n');
  assert.ok(!/fetch\s*\(/.test(combined));
  assert.ok(!/XMLHttpRequest/.test(combined));
  assert.ok(!/\/api\//.test(combined));
  assert.ok(!/computeContacts/.test(combined));
  assert.ok(!/computeEngagements/.test(combined));
  assert.ok(!/approved-actions/.test(combined));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(combined));
  assert.ok(!/doctrine.*=|weapons_hold\s*=/.test(combined));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO release gate checks');
}
