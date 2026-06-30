const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shellDir = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
const labelsPath = path.join(shellDir, 'cmo-evidence-labels.js');
const engagementPath = path.join(shellDir, 'engagement-evidence.js');
const contactPath = path.join(shellDir, 'contact-evidence.js');
const decisionPath = path.join(shellDir, 'decision-chain-evidence.js');
const overlayPath = path.join(shellDir, 'evidence-map-overlays.js');

const source = [
  labelsPath,
  engagementPath,
  contactPath,
  decisionPath,
  overlayPath,
].map((p) => fs.readFileSync(p, 'utf8')).join('\n');

const Labels = require(labelsPath);
const EE = require(engagementPath);
const CE = require(contactPath);
const DC = require(decisionPath);
const EMO = require(overlayPath);

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

function outOfRangeWorldState() {
  return {
    derived: {
      contacts_by_unit: {
        BLUE_LOCK: {
          by_unit: 'BLUE_LOCK',
          target_uid: 'RED_LOCK',
          confidence: 'firm',
          last_seen: 8,
          range_nm: 42,
          max_range_nm: 100
        }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_LOCK',
        target: 'RED_LOCK',
        weapon: 'sam-lock',
        status: 'blocked',
        reason: 'out_of_range',
        range_nm: 42,
        max_range_nm: 30
      }],
      units_by_uid: {
        RED_LOCK: { uid: 'RED_LOCK', lat: 30.4, lng: 35.4 }
      }
    }
  };
}

function readyWorldState() {
  return {
    derived: {
      contacts_by_unit: {
        BLUE_READY: {
          by_unit: 'BLUE_READY',
          target_uid: 'RED_READY',
          confidence: 'firm',
          last_seen: 9,
          range_nm: 20,
          max_range_nm: 100
        }
      },
      engagement_outcomes: [{
        shooter: 'BLUE_READY',
        target: 'RED_READY',
        weapon: 'sam-ready',
        status: 'engaged',
        range_nm: 20,
        max_range_nm: 45
      }],
      units_by_uid: {
        RED_READY: { uid: 'RED_READY', lat: 30.2, lng: 35.2 }
      }
    }
  };
}

test('out_of_range reason and Arabic label agree across panel, chain, and overlay', () => {
  const ws = outOfRangeWorldState();
  const expectedCode = 'out_of_range';
  const expectedAr = Labels.reasonLabel(expectedCode, 'ar');

  const engagement = EE.getUnitEngagementWhyNot(ws, 'BLUE_LOCK');
  const engagementHtml = EE.renderEngagementEvidenceHtml(engagement, { lang: 'ar' });
  const decision = DC.getUnitDecisionChainEvidence(ws, 'BLUE_LOCK');
  const decisionHtml = DC.renderDecisionChainEvidenceHtml(decision, { lang: 'ar' });
  const overlay = EMO.buildOverlayState(ws, { uid: 'BLUE_LOCK', lat: 30, lng: 35 });

  assert.strictEqual(engagement.reason_code, expectedCode);
  assert.strictEqual(decision.blocking_reason_code, expectedCode);
  assert.strictEqual(overlay.reason_code, expectedCode);
  assert.ok(engagementHtml.includes(expectedCode));
  assert.ok(decisionHtml.includes(expectedCode));
  assert.ok(overlay.tooltip_html.includes(expectedCode));
  assert.ok(engagementHtml.includes(expectedAr));
  assert.ok(decisionHtml.includes(expectedAr));
  assert.strictEqual(overlay.reason_label_ar, expectedAr);
  assert.ok(overlay.tooltip_html.includes(expectedAr));
});

test('ready state stays ready in chain and overlay without blocked tooltip', () => {
  const ws = readyWorldState();
  const decision = DC.getUnitDecisionChainEvidence(ws, 'BLUE_READY');
  const overlay = EMO.buildOverlayState(ws, { uid: 'BLUE_READY', lat: 30, lng: 35 });

  assert.strictEqual(decision.final_status, 'Ready');
  assert.strictEqual(overlay.status, 'Ready');
  assert.strictEqual(overlay.reason_code, null);
  assert.ok(!overlay.tooltip_html.includes('Blocked:'));
  assert.ok(!overlay.tooltip_html.includes('out_of_range'));
});

test('missing evidence is unknown safely across contact, chain, and overlay', () => {
  const ws = { derived: {} };
  const contact = CE.getUnitContactEvidence(ws, 'BLUE_MISSING');
  const contactHtml = CE.renderContactEvidenceHtml(contact, { lang: 'ar' });
  const decision = DC.getUnitDecisionChainEvidence(ws, 'BLUE_MISSING');
  const decisionHtml = DC.renderDecisionChainEvidenceHtml(decision, { lang: 'ar' });
  const overlay = EMO.buildOverlayState(ws, { uid: 'BLUE_MISSING', lat: 30, lng: 35 });

  assert.strictEqual(contact.detection_status, 'Unknown');
  assert.strictEqual(contact.reason_code, 'no_contact_evidence');
  assert.strictEqual(decision.final_status, 'Unknown');
  assert.strictEqual(overlay.status, 'Unknown');
  assert.doesNotThrow(() => EMO.renderOverlay(overlay, null));
  assert.ok(contactHtml.includes('no_contact_evidence'));
  assert.ok(decisionHtml.includes('no_contact_evidence') || decisionHtml.includes('no_engagement_evidence'));
  assert.ok(overlay.tooltip_html.includes('no_contact_evidence') || overlay.tooltip_html.includes('no_engagement_evidence'));
});

test('CMO evidence lock modules have no backend or mutation path', () => {
  assert.ok(!/fetch\s*\(/.test(source));
  assert.ok(!/XMLHttpRequest/.test(source));
  assert.ok(!/\/api\//.test(source));
  assert.ok(!/computeContacts/.test(source));
  assert.ok(!/computeEngagements/.test(source));
  assert.ok(!/approved-actions/.test(source));
  assert.ok(!/applyAction|commitAction|executeAction|autoFire|auto-fire/.test(source));
});

if (process.exitCode) {
  console.error('failed');
} else {
  console.log('passed ' + passed + ' CMO evidence consistency checks');
}
