#!/usr/bin/env node
/**
 * fetch-cmo-captions.js
 *
 * Reads docs/cmo-pgatcomb-playlist-inventory.md, finds all rows with status
 * `failed` or `pending`, downloads English auto-generated subtitles via yt-dlp,
 * saves them to docs/cmo-captions/<videoId>.txt (plain text, no timestamps),
 * and updates the inventory status to `read` or `failed`.
 *
 * Usage:
 *   node scripts/fetch-cmo-captions.js [--limit N] [--delay MS]
 *
 * Options:
 *   --limit N    Only attempt N videos this run (default: all pending)
 *   --delay MS   Milliseconds between fetches (default: 3000)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_PATH = path.join(ROOT, 'docs', 'cmo-pgatcomb-playlist-inventory.md');
const CAPTIONS_DIR = path.join(ROOT, 'docs', 'cmo-captions');
const TMP_DIR = path.join(ROOT, 'docs', 'cmo-captions', '_tmp');

// --- CLI args ---
const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const delayArg = args.indexOf('--delay');
const LIMIT = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : Infinity;
const DELAY_MS = delayArg !== -1 ? parseInt(args[delayArg + 1], 10) : 3000;

// --- Setup dirs ---
fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// --- Parse inventory ---
const inventoryRaw = fs.readFileSync(INVENTORY_PATH, 'utf8');
const lines = inventoryRaw.split('\n');

// Table rows look like: | N | `status` | Category | Title | <url> |
const ROW_RE = /^\|\s*(\d+)\s*\|\s*`(failed|pending|timeout)`\s*\|([^|]*)\|([^|]*)\|[^<]*<(https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]+))>\s*\|/;

const toFetch = [];
for (const line of lines) {
  const m = ROW_RE.exec(line);
  if (!m) continue;
  toFetch.push({ num: m[1], status: m[2], category: m[3].trim(), title: m[4].trim(), url: m[5], videoId: m[6] });
}

console.log(`Found ${toFetch.length} videos to fetch (limit: ${LIMIT === Infinity ? 'none' : LIMIT}, delay: ${DELAY_MS}ms)\n`);

const results = { read: 0, failed: 0, skipped: 0 };

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function vttToPlainText(vttContent) {
  // Strip WEBVTT header, timestamps, and deduplicate lines
  const lines = vttContent.split('\n');
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t === 'WEBVTT' || /^NOTE/.test(t) || /^\d+$/.test(t) || /-->/.test(t) || /^Kind:/.test(t) || /^Language:/.test(t)) continue;
    // Strip HTML tags (like <c>, <00:00:00.000>)
    const clean = t.replace(/<[^>]+>/g, '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.join('\n');
}

async function fetchOne(video, index) {
  const { videoId, title, url } = video;
  const outPrefix = path.join(TMP_DIR, videoId);
  const txtPath = path.join(CAPTIONS_DIR, `${videoId}.txt`);

  // Already fetched
  if (fs.existsSync(txtPath)) {
    console.log(`[${index}] SKIP (already exists) ${videoId} — ${title}`);
    results.skipped++;
    return 'read';
  }

  console.log(`[${index}] Fetching ${videoId} — ${title}`);

  const result = spawnSync('yt-dlp', [
    '--write-auto-sub',
    '--skip-download',
    '--sub-lang', 'en',
    '--convert-subs', 'vtt',
    '--no-playlist',
    '--js-runtimes', 'node:C:\\Program Files\\nodejs\\node.exe',
    '--remote-components', 'ejs:github',
    '-o', outPrefix,
    url
  ], { encoding: 'utf8', timeout: 60000 });

  if (result.status !== 0) {
    const errOut = (result.stderr || '') + (result.stdout || '');
    if (/private video/i.test(errOut) || /Video unavailable/i.test(errOut)) {
      console.log(`  ✗ Private / unavailable — skipping permanently`);
      results.failed++;
      return 'failed';
    }
    console.log(`  ✗ yt-dlp failed (exit ${result.status})`);
    if (errOut) console.log('  ', errOut.slice(0, 300));
    results.failed++;
    return 'failed';
  }

  // Find the downloaded .vtt file
  const vttFiles = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(videoId) && f.endsWith('.vtt'));
  if (vttFiles.length === 0) {
    console.log(`  ✗ No VTT file found (captions may not be available)`);
    results.failed++;
    return 'failed';
  }

  const vttPath = path.join(TMP_DIR, vttFiles[0]);
  const vttContent = fs.readFileSync(vttPath, 'utf8');
  const plain = vttToPlainText(vttContent);

  if (!plain.trim()) {
    console.log(`  ✗ Empty transcript after parsing`);
    fs.unlinkSync(vttPath);
    results.failed++;
    return 'failed';
  }

  // Save plain text
  const header = `# ${title}\nVideo: ${url}\nVideo ID: ${videoId}\n\n`;
  fs.writeFileSync(txtPath, header + plain, 'utf8');
  fs.unlinkSync(vttPath);

  const wordCount = plain.split(/\s+/).length;
  console.log(`  ✓ Saved (${wordCount} words)`);
  results.read++;
  return 'read';
}

function updateInventory(videoId, newStatus) {
  const current = fs.readFileSync(INVENTORY_PATH, 'utf8');
  // Replace the status cell for this videoId's row
  const updated = current.replace(
    new RegExp(`(\\|\\s*\\d+\\s*\\|\\s*)\`(failed|pending|timeout)\`(\\s*\\|[^|]*\\|[^|]*\\|[^<]*<https://www\\.youtube\\.com/watch\\?v=${videoId}>)`),
    `$1\`${newStatus}\`$3`
  );
  if (updated !== current) {
    fs.writeFileSync(INVENTORY_PATH, updated, 'utf8');
  }
}

function updateInventoryHeader(successCount, total) {
  let content = fs.readFileSync(INVENTORY_PATH, 'utf8');
  // Update "Captions successfully read" count
  const currentReadMatch = content.match(/Captions successfully read[^:]*:\s*(\d+)/);
  const currentPendingMatch = content.match(/Not read yet[^:]*:\s*(\d+)/);
  if (currentReadMatch) {
    const oldRead = parseInt(currentReadMatch[1], 10);
    content = content.replace(
      /Captions successfully read[^:]*:\s*\d+/,
      `Captions successfully read and saved locally: ${oldRead + successCount}`
    );
  }
  if (currentPendingMatch) {
    const oldPending = parseInt(currentPendingMatch[1], 10);
    content = content.replace(
      /Not read yet[^:]*:\s*\d+/,
      `Not read yet / blocked / pending: ${Math.max(0, oldPending - successCount)}`
    );
  }
  fs.writeFileSync(INVENTORY_PATH, content, 'utf8');
}

(async () => {
  const batch = toFetch.slice(0, LIMIT === Infinity ? toFetch.length : LIMIT);

  for (let i = 0; i < batch.length; i++) {
    const video = batch[i];
    const status = await fetchOne(video, i + 1);
    updateInventory(video.videoId, status);

    if (i < batch.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Update header counts
  updateInventoryHeader(results.read, batch.length);

  // Clean up tmp dir if empty
  try {
    const remaining = fs.readdirSync(TMP_DIR);
    if (remaining.length === 0) fs.rmdirSync(TMP_DIR);
  } catch {}

  console.log(`\nDone. Read: ${results.read} | Failed: ${results.failed} | Skipped: ${results.skipped}`);
  console.log(`Captions saved to: docs/cmo-captions/`);
})();
