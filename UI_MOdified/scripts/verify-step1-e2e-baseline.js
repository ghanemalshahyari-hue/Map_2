'use strict';
/* verify-step1-e2e-baseline.js — BASELINE (read-only) for the real GCC-vs-Iran Step-1 file.
 * Runs the file AS-IS through /analyze + /placement and reports what the pipeline produces.
 * No app code is changed. Server: BASE_PORT (default 8022, the local-LLM verify server).
 * Run: node UI_MOdified/scripts/verify-step1-e2e-baseline.js
 */
const http = require('http'); const fs = require('fs');
const PORT = parseInt(process.env.BASE_PORT || '8022', 10);
const FILE = process.env.STEP1_FILE || 'C:/Users/ADMIN/Downloads/GCC_vs_Iran_step1_multicountry_freefight_trial.json';
function post(p, obj) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(obj));
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { const b = Buffer.concat(ch).toString('utf8'); let j; try { j = JSON.parse(b); } catch (e) { j = { __parseError: e.message, __raw: b.slice(0, 300) }; } j.__status = res.statusCode; resolve(j); });
    });
    r.on('error', reject); r.write(data); r.end();
  });
}
const hasCoord = o => o && typeof o.lat === 'number' && typeof o.lon === 'number' && !(o.lat === 0 && o.lon === 0);
function tally(arr, fn) { const m = {}; arr.forEach(x => { const k = fn(x) || '(none)'; m[k] = (m[k] || 0) + 1; }); return m; }

(async () => {
  const file = JSON.parse(fs.readFileSync(FILE, 'utf8'));

  console.log('\n══════ 1) IMPORT / ANALYZE ══════');
  const an = await post('/api/wargame-sim/analyze', file);
  console.log('  HTTP', an.__status, '| ok=', an.ok, '| kind=', an.kind, '| requires_review=', an.requires_review, '| confidence=', an.confidence);
  console.log('  llm_fill:', JSON.stringify(an.llm_fill || null));
  console.log('  analyze keys:', JSON.stringify(Object.keys(an)));
  if (an.report) console.log('  report:', JSON.stringify(an.report).slice(0, 600));
  const brief = an.brief || {};
  const ob = brief.operational_brief || brief;
  console.log('  brief keys:', JSON.stringify(Object.keys(brief).slice(0, 30)));
  console.log('  brief.proposed_units:', Array.isArray(ob.proposed_units) ? ob.proposed_units.length : '(none)');
  console.log('  brief.placement_candidates:', Array.isArray(ob.placement_candidates) ? ob.placement_candidates.length : '(none)');

  console.log('\n══════ 2) PLACEMENT / RESOLVER REVIEW ══════');
  const pl = await post('/api/wargame-sim/placement', { brief });
  console.log('  HTTP', pl.__status, '| ok=', pl.ok, '| count=', pl.count);
  if (pl.error) console.log('  ERROR:', pl.error);
  const cands = pl.placement_candidates || [];
  console.log('  candidates returned:', cands.length, '| withCoord:', cands.filter(hasCoord).length, '| NULL coord:', cands.filter(c => !hasCoord(c)).length);
  console.log('  by source.origin :', JSON.stringify(tally(cands, c => c.source && (c.source.origin || c.source.type))));
  console.log('  by coord_status  :', JSON.stringify(tally(cands, c => c.coord_status || c.placement_type)));
  console.log('  by coordinate_fmt:', JSON.stringify(tally(cands, c => c.coordinate_format)));
  console.log('  by needs_review  :', JSON.stringify(tally(cands, c => String(c.needs_review))));
  console.log('  by source (local_llm/gazetteer/etc):', JSON.stringify(tally(cands, c => c.source && c.source.origin)));
  console.log('  missing_information:', (pl.missing_information || []).length, JSON.stringify((pl.missing_information || []).slice(0, 8)));
  const failed = cands.filter(c => !hasCoord(c)).map(c => c.name_en || c.normalized_name || c.mention || c.name || c.id);
  console.log('  UNRESOLVED (null-coord) names — sample:', JSON.stringify(failed.slice(0, 20)));

  console.log('\n══════ 3) NAMED-PLACE RESOLUTION GAP (the 200 bases) ══════');
  function baseNames(ff) { const out = []; ['bases', 'air_bases', 'naval_bases', 'land_bases'].forEach(k => (ff && ff[k] || []).forEach(b => out.push({ name: b.name_en || b.name || b.name_ar || b.id, hasCoord: hasCoord(b) }))); return out; }
  const red = baseNames(file.enemy_forces), blue = baseNames(file.friendly_forces);
  console.log('  RED bases:', red.length, 'withCoord', red.filter(b => b.hasCoord).length);
  console.log('  BLUE bases:', blue.length, 'withCoord', blue.filter(b => b.hasCoord).length);
  // are these base names anywhere in the resolved candidate set?
  const candNames = new Set(cands.map(c => String(c.name_en || c.normalized_name || c.mention || c.name || '').toLowerCase()));
  const matched = red.concat(blue).filter(b => candNames.has(String(b.name).toLowerCase())).length;
  console.log('  base names matched to a returned candidate by name:', matched, '/', red.length + blue.length);

  console.log('\n(baseline complete — no code changed)\n');
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
