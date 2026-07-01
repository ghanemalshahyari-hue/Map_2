const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const clientDir = path.join(rootDir, 'UI_MOdified', 'client');
const shellDir = path.join(clientDir, 'shell');
const offlineClientDir = path.join(rootDir, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client');
const offlineShellDir = path.join(offlineClientDir, 'shell');

const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const engagementPath = path.join(shellDir, 'engagement-evidence.js');
const contactPath = path.join(shellDir, 'contact-evidence.js');
const decisionPath = path.join(shellDir, 'decision-chain-evidence.js');
const overlayPath = path.join(shellDir, 'evidence-map-overlays.js');
const timelinePath = path.join(shellDir, 'cmo-evidence-timeline.js');
const matrixPath = path.join(shellDir, 'cmo-evidence-readiness-matrix.js');
const alertsPath = path.join(shellDir, 'cmo-evidence-alerts.js');
const feedPath = path.join(shellDir, 'cmo-force-evidence-feed.js');
const exportPath = path.join(shellDir, 'cmo-evidence-export.js');
const reportPath = path.join(shellDir, 'cmo-force-evidence-report.js');
const panelPath = path.join(shellDir, 'unit-status-panel.js');
const appHtmlPath = path.join(clientDir, 'app.html');

const source = [
  exportPath,
  reportPath,
  panelPath,
].map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const Labels = require(labelsPath);
require(engagementPath);
require(contactPath);
require(decisionPath);
require(overlayPath);
const Timeline = require(timelinePath);
const Matrix = require(matrixPath);
require(alertsPath);
const Feed = require(feedPath);
const Exporter = require(exportPath);
const Report = require(reportPath);

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

function worldState() {
  return {
    derived: {
      units_by_uid: {
        BLUE_PRINT: { uid: 'BLUE_PRINT', label: 'BLUE-IFV-03', side: 'blue', lat: 30, lng: 35 },
        BLUE_READY: { uid: 'BLUE_READY', label: 'BLUE-TANK-01', side: 'blue', lat: 30.1, lng: 35.1 },
        RED_PRINT: { uid: 'RED_PRINT', label: 'RED-ARMOR-01', side: 'red', lat: 30.4, lng: 35.4 }
      },
      contacts_by_unit: {
        BLUE_PRINT: { by_unit: 'BLUE_PRINT', target_uid: 'RED_PRINT', confidence: 'firm', range_nm: 42, max_range_nm: 80 },
        BLUE_READY: { by_unit: 'BLUE_READY', target_uid: 'RED_PRINT', confidence: 'firm', range_nm: 12, max_range_nm: 80 }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_PRINT',
        target: 'RED_PRINT',
        weapon: '30mm cannon',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 42,
        max_range_nm: 30
      }, {
        shooter: 'BLUE_READY',
        target: 'RED_PRINT',
        weapon: 'tank-gun',
        status: 'engaged',
        range_nm: 12,
        max_range_nm: 40
      }]
    }
  };
}

function fixedSnapshot() {
  Timeline.clear();
  Timeline.record('BLUE_PRINT', {
    type: 'blocking_reason_changed',
    status: 'Blocked',
    reason_code: 'out_of_range',
    reason_label_ar: Labels.reasonLabel('out_of_range', 'ar'),
    timestamp: '2026-07-01T08:00:01.000Z',
    source: 'decision-chain',
    target: 'RED_PRINT',
    weapon: '30mm cannon'
  }, { force: true });
  return Exporter.buildSnapshot(worldState(), {
    uid: 'BLUE_PRINT',
    label: 'BLUE-IFV-03',
    side: 'blue',
    domain: 'ground',
    role: 'ifv',
    lat: 30,
    lng: 35
  }, { generated_at: '2026-07-01T08:00:00.000Z' });
}

function fixedReport() {
  Feed.clear();
  const ws = worldState();
  const matrix = Matrix.buildMatrix(ws, { generated_at: '2026-07-01T08:00:00.000Z' });
  Feed.observeMatrix(matrix, { force: true });
  return Report.buildReport(ws, {
    matrix,
    selected_unit: { uid: 'BLUE_PRINT', label: 'BLUE-IFV-03', side: 'blue' },
    generated_at: '2026-07-01T08:00:02.000Z'
  });
}

function installPrintDom() {
  let host = null;
  const body = {
    attrs: {},
    appendChild(node) { host = node; return node; },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; }
  };
  const document = {
    body,
    getElementById(id) { return host && host.id === id ? host : null; },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        id: '',
        className: '',
        innerHTML: ''
      };
    }
  };
  let printCount = 0;
  global.document = document;
  global.print = () => { printCount += 1; };
  global.addEventListener = () => {};
  global.setTimeout = (fn) => { fn(); return 1; };
  return {
    get host() { return host; },
    get printCount() { return printCount; },
    cleanup() {
      delete global.document;
      delete global.print;
      delete global.addEventListener;
      delete global.setTimeout;
    }
  };
}

test('unit snapshot renders print button and printable evidence layout', () => {
  const snapshot = fixedSnapshot();
  const html = Exporter.renderExportHtml(snapshot);
  const printHtml = Exporter.buildPrintableSnapshotHtml(snapshot);
  assert.ok(html.includes('Print Unit Snapshot'));
  assert.ok(html.includes('data-cmo-export-action="print"'));
  assert.ok(printHtml.includes('RMOOZ CMO Evidence'));
  assert.ok(printHtml.includes('Selected-unit Evidence Snapshot'));
  assert.ok(printHtml.includes('BLUE-IFV-03'));
  assert.ok(printHtml.includes('out_of_range'));
  assert.ok(printHtml.includes(Labels.reasonLabel('out_of_range', 'ar')));
  assert.ok(printHtml.includes('Decision Chain'));
  assert.ok(printHtml.includes('Evidence Timeline'));
  assert.ok(printHtml.includes('Read-only evidence snapshot'));
});

test('force report renders print button and printable force layout', () => {
  const report = fixedReport();
  const html = Report.renderReportHtml(report);
  const printHtml = Report.buildPrintableReportHtml(report);
  assert.ok(html.includes('Print Force Report'));
  assert.ok(html.includes('data-cmo-force-report-action="print"'));
  assert.ok(printHtml.includes('Force Evidence Report'));
  assert.ok(printHtml.includes('Evidence Quality'));
  assert.ok(printHtml.includes('Ready'));
  assert.ok(printHtml.includes('Blocked'));
  assert.ok(printHtml.includes('Unknown'));
  assert.ok(printHtml.includes('No-contact'));
  assert.ok(printHtml.includes('Top Blockers'));
  assert.ok(printHtml.includes('Readiness Matrix'));
  assert.ok(printHtml.includes('Force Events'));
  assert.ok(printHtml.includes('Read-only force evidence report'));
});

test('browser print path creates print root and calls window print only', () => {
  const dom = installPrintDom();
  try {
    assert.strictEqual(Exporter.printSnapshot(fixedSnapshot()), true);
    assert.strictEqual(dom.printCount, 1);
    assert.ok(dom.host);
    assert.strictEqual(dom.host.id, 'cmo-print-root');
    assert.ok(dom.host.innerHTML.includes('Selected-unit Evidence Snapshot'));
    assert.strictEqual(Report.printReport(fixedReport()), true);
    assert.strictEqual(dom.printCount, 2);
    assert.ok(dom.host.innerHTML.includes('Force Evidence Report'));
  } finally {
    dom.cleanup();
  }
});

test('print CSS isolates report only when evidence print mode is active', () => {
  assert.ok(appHtml.includes('.cmo-print-root'));
  assert.ok(appHtml.includes('@media print'));
  assert.ok(appHtml.includes('body[data-cmo-print-mode="evidence"] > *:not(#cmo-print-root)'));
  assert.ok(appHtml.includes('body[data-cmo-print-mode="evidence"] #cmo-print-root'));
  assert.ok(appHtml.includes('.cmo-print-disclaimer'));
});

test('main and offline static paths both include print controls and CSS', () => {
  const offlineExport = fs.readFileSync(path.join(offlineShellDir, 'cmo-evidence-export.js'), 'utf8');
  const offlineReport = fs.readFileSync(path.join(offlineShellDir, 'cmo-force-evidence-report.js'), 'utf8');
  const offlineAppHtml = fs.readFileSync(path.join(offlineClientDir, 'app.html'), 'utf8');
  assert.ok(offlineExport.includes('Print Unit Snapshot'));
  assert.ok(offlineReport.includes('Print Force Report'));
  assert.ok(offlineAppHtml.includes('body[data-cmo-print-mode="evidence"]'));
  assert.strictEqual(offlineExport, fs.readFileSync(exportPath, 'utf8'));
  assert.strictEqual(offlineReport, fs.readFileSync(reportPath, 'utf8'));
});

test('print layout remains read-only with no backend, PDF service, or combat mutation', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
  assert.ok(!/jspdf|puppeteer|printToPDF|PDFDocument|html2pdf/i.test(source));
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(source));
  assert.ok(!/doctrine.*=|weapons_hold\s*=/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO evidence print layout UI checks');
}
