#!/usr/bin/env node
/**
 * classify-cmo-inventory.js
 *
 * Reorganizes docs/cmo-pgatcomb-playlist-inventory.md from a flat playlist-ordered
 * table into one grouped by RMOOZ-aligned FUNCTIONAL BUCKET and tagged with a
 * relevance PRIORITY (P0=core domain ... P3=blocked/non-actionable).
 *
 * It is deterministic and idempotent: it re-parses the original row data from the
 * existing table (each row carries #, status, CMO category, title, url), classifies
 * each row, and rewrites the whole document (header + legend + grouped tables).
 *
 * RMOOZ is a ground/amphibious operational ADJUDICATION app (read-only review
 * surface). Priority reflects how much a CMO tutorial informs RMOOZ's real domain
 * model (BLS_STATUS, phase_line_km, force_ratio, EW_BANDS, OBJECTIVE_STATUS,
 * BLUE_ACTION_VALUES — see server/ai/adjudicator-schema.js), NOT how good the
 * tutorial is.
 *
 * Usage: node scripts/classify-cmo-inventory.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_PATH = path.join(ROOT, 'docs', 'cmo-pgatcomb-playlist-inventory.md');

// --- Bucket definitions (display order = priority order) -------------------
const BUCKETS = {
  scenario:  { title: 'Scenario Authoring & Structure', prio: 'P0', maps: 'Scenario foundation, editor/event-editor concepts, areas, objectives, unit creation/placement, quick battles — informs RMOOZ scenario structure & OOB.' },
  ground:    { title: 'Ground & Movement Operations',   prio: 'P0', maps: 'Phase lines, advance, ground units, formations, grouping, map layers, LOS — informs phase_line_km, force composition, movement.' },
  doctrine:  { title: 'Doctrine & Adjudication',        prio: 'P0', maps: 'Doctrine/posture, proficiency, OODA, targeting priority, ROE (concept-level) — informs the adjudication logic.' },
  logistics: { title: 'Logistics & Basing',             prio: 'P1', maps: 'Throughput/logistics state: refueling, cargo, munitions, magazines, airfields — partially maps to BLS throughput/logistics_state.' },
  terrain:   { title: 'Terrain & Environment',          prio: 'P1', maps: 'Terrain/land cover, weather (rain/cloud/ice) effects — partially maps to terrain_note & BLS terrain_friction (weather absent in RMOOZ).' },
  sensors:   { title: 'Sensors / EW / IADS',            prio: 'P2', maps: 'RMOOZ models only a broad theater EW_BANDS scale; radar/ESM/EMCON/jamming/IADS detail is out-of-domain reference.' },
  strike:    { title: 'Strike & Weapons',               prio: 'P2', maps: 'Missiles, bombing, SEAD, PGMs, mines, point defense — tactical air/naval employment; out-of-domain for RMOOZ.' },
  naval:     { title: 'Naval & Subsurface',             prio: 'P2', maps: 'ASW, submarines, sonar, torpedoes, carrier ops — out-of-domain for a ground/amphibious model.' },
  tactics:   { title: 'General Tactics & Employment',   prio: 'P2', maps: 'General air/naval tactics & mission employment not tied to a RMOOZ field — out-of-domain reference.' },
  ui:        { title: 'Game UI & Meta',                 prio: 'P3', maps: 'CMO-specific UI, hotkeys, patch/version notes, database tips, performance — not actionable for RMOOZ (which has its own UI).' },
  scripting: { title: 'Scripting / Automation (Lua)',   prio: 'P3', maps: 'Lua scripting/automation. Lua is permanently BLOCKED in RMOOZ — reference only.' },
  unfetched: { title: 'Unfetchable',                    prio: 'P3', maps: 'Captions could not be retrieved (private / no captions / bot-challenge).' },
};
const BUCKET_ORDER = ['scenario','ground','doctrine','logistics','terrain','sensors','strike','naval','tactics','ui','scripting','unfetched'];

// --- Classification ---------------------------------------------------------
function classify(row) {
  const t = row.title.toLowerCase();
  const cat = row.category;

  // 1. Unfetchable wins outright.
  if (row.status === 'failed') return 'unfetched';

  // 2. Lua / scripting automation (Lua permanently blocked in RMOOZ).
  if (/\blua\b|bing chat ai/.test(t) || cat === 'Scripting/Automation') return 'scripting';

  // 3. Game UI / meta / patch-notes (CMO-specific, not RMOOZ-actionable).
  if (/installing betas|useful hotkeys|keyboard camera|tacview|database search|reading database|database entir|message log|improving performance|f-16 variants|rate of fire|\(rof\)|\brof\b|personal map profile|icon size|time step and popup|working with ice/.test(t)) return 'ui';
  if (/\b(version|beta|update|updates|changes|patch)\b/.test(t) && /\d{3,4}\.\d|\bv?\d{3,4}\b|installing|tiny update/.test(t) && !/missile|bomb|radar|sonar|torpedo|detection|burnout/.test(t)) return 'ui';

  // 4. Scenario authoring & structure (P0 core domain).
  if (cat === 'Scenario/Mission Builder' ||
      /scenario editor|event editor|building a mission|quick batt|creating (units|large ground units)|area creation|editing unit properties|making airfields|environment zone|reference point|designing.*scenario|making a.*scenario|cold war scenario|coin scenario|default scenario features|openstreetmap|annoying|workflow|strike plan workflow|formation editor/.test(t)) {
    return 'scenario';
  }

  // 5. Doctrine & adjudication (P0).
  if (cat === 'Doctrine/Adjudication' ||
      /doctrine|\bwra\b|proficiency|ooda|targeting priority|salvo size|collective responsibility|rules of engagement|\broe\b/.test(t)) {
    return 'doctrine';
  }

  // 6. Logistics & basing (P1).
  if (cat === 'Logistics/Basing' ||
      /refuel|cargo|munition|magazine|loadout|tanker|ferry|rearm|running out of gas|out of gas|disabling an airfield|against airfields|airfield/.test(t)) {
    return 'logistics';
  }

  // 7. Naval & subsurface (P2) — before sensors/strike so sonar/torpedo win.
  if (cat === 'Naval/Subsurface' ||
      /torpedo|sonar|submarine|\basw\b|anti-submarine|diesel electric|\bdds\b|carrier battlegroup|ship screening|shallow water/.test(t)) {
    return 'naval';
  }

  // 8. Terrain & environment (P1).
  if (/land cover|terrain mask|helicopter terrain|\brain\b|cloud cover|\bice\b|best los|best line of sight|determining a point in terrain/.test(t)) {
    return 'terrain';
  }

  // 9. Ground & movement operations (P0).
  if (cat === 'Map/Movement' ||
      /ground unit|formation|grouping|moving and attacking|movement|map setting|\blayers\b|indirect fire|ground targets|line of sight|\blos\b|move,? pause|relative.*reference point|altitude/.test(t)) {
    return 'ground';
  }

  // 10. Sensors / EW / IADS (P2).
  if (cat === 'Sensors/IADS/EW' ||
      /radar|\besm\b|\becm\b|\bdecm\b|\boecm\b|jam(ming)?|emcon|iads|\bsam\b|electronic|\bsensor|detection|\biff\b|recon|chaff|flare|countermeasure|early warning|\bsead\b|\bdead\b|comms jamming|decoy/.test(t)) {
    return 'sensors';
  }

  // 11. Strike & weapons (P2) — incl. mines.
  if (cat === 'Strike/Weapons' || cat === 'Mines' ||
      /missile|bomb|\bstrike\b|\bpgm\b|munition types|warhead|nuclear|laser|microwave|c-ram|rocket|\bgun\b|stealth|point defense|mine|salvo|airstrike|air to ground|air-to-ground|ballistic|\bhgv|asat|emp weapon/.test(t)) {
    return 'strike';
  }

  // 12. Fallback: general tactics & employment (P2).
  return 'tactics';
}

// --- Parse existing rows ----------------------------------------------------
const raw = fs.readFileSync(INVENTORY_PATH, 'utf8');
const ROW_RE = /^\|\s*(\d+)\s*\|\s*`(read|failed|pending|timeout)`\s*\|([^|]*)\|([^|]*)\|\s*<(https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]+))>\s*\|/;

const rows = [];
for (const line of raw.split('\n')) {
  const m = ROW_RE.exec(line);
  if (!m) continue;
  rows.push({
    num: parseInt(m[1], 10),
    status: m[2],
    category: m[3].trim(),
    title: m[4].trim(),
    url: m[5],
    videoId: m[6],
  });
}

if (rows.length !== 287) {
  console.error(`WARNING: expected 287 rows, parsed ${rows.length}. Aborting to avoid data loss.`);
  process.exit(1);
}

// --- Classify & tally -------------------------------------------------------
const byBucket = {};
for (const key of BUCKET_ORDER) byBucket[key] = [];
for (const row of rows) {
  row.bucket = classify(row);
  byBucket[row.bucket].push(row);
}

const totalRead = rows.filter(r => r.status === 'read').length;
const totalFailed = rows.filter(r => r.status === 'failed').length;

// --- Build the regenerated document ----------------------------------------
const lines = [];
lines.push('# P Gatcomb CMO Tutorial Playlist Inventory');
lines.push('');
lines.push('Index + planning aid over the P Gatcomb *Command: Modern Operations* (CMO) tutorial');
lines.push('playlist. Captions are stored as plain text in [`cmo-captions/`](cmo-captions/) (one');
lines.push('`<videoId>.txt` per video); this file does not contain transcript text.');
lines.push('');
lines.push(`- Playlist videos: ${rows.length}`);
lines.push(`- Captions read & saved locally: ${totalRead}`);
lines.push(`- Unfetchable: ${totalFailed} (private video, no published captions, and one bot-challenge / impersonation-gated video)`);
lines.push('');
lines.push('**Status:** `read` = English captions fetched & saved to `cmo-captions/`; `failed` =');
lines.push('caption retrieval not possible (private / no captions / access-gated).');
lines.push('');
lines.push('## How this is organized');
lines.push('');
lines.push('Rows are grouped by **functional bucket** and tagged with a **RMOOZ-relevance priority**.');
lines.push('RMOOZ is a ground/amphibious operational *adjudication* app and a read-only review surface');
lines.push('(see [`cmo-scenario-editor-application.md`](cmo-scenario-editor-application.md)). Priority');
lines.push('reflects how much a tutorial informs RMOOZ\'s real domain model (`BLS_STATUS`,');
lines.push('`phase_line_km`, `force_ratio`, `EW_BANDS`, `OBJECTIVE_STATUS`, `BLUE_ACTION_VALUES` —');
lines.push('`server/ai/adjudicator-schema.js`), **not** how good the tutorial is.');
lines.push('');
lines.push('- **P0 — Core domain.** Directly informs RMOOZ mechanics (scenario structure, ground/amphibious movement, doctrine/adjudication concepts).');
lines.push('- **P1 — Adjacent.** Partially maps (logistics/throughput, terrain/environment).');
lines.push('- **P2 — Out-of-domain reference.** Tactical air/naval/strike/sensor detail RMOOZ does not model. Context, not a feature backlog.');
lines.push('- **P3 — Blocked / non-actionable.** Lua (permanently blocked), CMO-specific UI/meta, and unfetchable videos.');
lines.push('');

// Summary table of buckets + counts.
lines.push('### Bucket summary');
lines.push('');
lines.push('| Priority | Bucket | Videos | Maps to RMOOZ |');
lines.push('| --- | --- | ---: | --- |');
for (const key of BUCKET_ORDER) {
  const b = BUCKETS[key];
  const n = byBucket[key].length;
  if (n === 0) continue;
  lines.push(`| ${b.prio} | ${b.title} | ${n} | ${b.maps} |`);
}
lines.push('');

// Grouped detail tables.
for (const key of BUCKET_ORDER) {
  const b = BUCKETS[key];
  const group = byBucket[key];
  if (group.length === 0) continue;
  lines.push(`## ${b.prio} — ${b.title} (${group.length})`);
  lines.push('');
  lines.push(`${b.maps}`);
  lines.push('');
  lines.push('| # | Status | CMO Category | Title | Link |');
  lines.push('| ---: | --- | --- | --- | --- |');
  // Keep stable playlist order within each bucket.
  group.sort((a, c) => a.num - c.num);
  for (const r of group) {
    lines.push(`| ${r.num} | \`${r.status}\` | ${r.category} | ${r.title} | <${r.url}> |`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('*Generated by `scripts/classify-cmo-inventory.js` (deterministic, idempotent). Re-run after');
lines.push('the playlist grows or captions change.*');
lines.push('');

fs.writeFileSync(INVENTORY_PATH, lines.join('\n'), 'utf8');

// --- Report -----------------------------------------------------------------
console.log(`${rows.length} rows classified (read: ${totalRead}, failed: ${totalFailed})`);
console.log('Per-bucket counts:');
let sum = 0;
for (const key of BUCKET_ORDER) {
  const n = byBucket[key].length;
  sum += n;
  console.log(`  ${BUCKETS[key].prio}  ${BUCKETS[key].title.padEnd(34)} ${n}`);
}
console.log(`  ${'='.repeat(2)}  ${'TOTAL'.padEnd(34)} ${sum}`);
console.log(`\nWrote ${INVENTORY_PATH}`);
