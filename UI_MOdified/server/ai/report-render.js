/**
 * HTML renderer for the comparison report (item #12).
 *
 * Pure string assembly — no template engine, no client-side JS. Printable,
 * shareable, and works without the dev server (save-as-HTML produces a
 * stand-alone artifact). Renders a report object produced by
 * report-builder.buildReport().
 *
 * Kept separate from web-server.js so the route stays a thin wrapper and
 * a CLI / batch generator can reuse the same render.
 */

'use strict';

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderReportHtml(report) {
    const sc = report.scenario || {};
    const coa = report.coa || {};
    const runMeta = report.runId
        ? `Run <code>${escapeHtml(report.runId)}</code> · ${escapeHtml(report.provider || 'provider?')} · ${escapeHtml(report.model || 'model?')} · ${report.trialsCompleted}/${report.trialsRequested} trials · ${report.runDurationMs ? Math.round(report.runDurationMs / 1000) + 's' : 'duration?'}`
        : '<em>No completed MC run for this scenario yet — showing baseline only.</em>';

    // Terminal comparison card.
    const baseT = report.baselineTerm || {};
    const liveT = report.liveTerm || {};
    const mcT   = report.mcTerm || null;
    const fmtStat = (s, unit) => {
        if (!s) return '—';
        const u = unit ? ` ${unit}` : '';
        return `${s.median != null ? s.median.toFixed(1) : '?'}${u} <span style="color:#888">(p25 ${s.p25 != null ? s.p25.toFixed(1) : '?'}, p75 ${s.p75 != null ? s.p75.toFixed(1) : '?'}, n ${s.n})</span>`;
    };
    const outcomePctStr = mcT
        ? Object.entries(mcT.outcomePct || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}%`).join(', ') || '(no completed trials)'
        : '—';
    const fallbackStr = mcT
        ? `${(mcT.fallback_steps && mcT.fallback_steps.mean) ? mcT.fallback_steps.mean.toFixed(1) : '0'} steps/trial · ${Object.entries(mcT.fallback_reasons || {}).map(([k, v]) => `${v}×${k}`).join(', ') || 'none'}`
        : '—';

    // Trajectory rows.
    const trajRows = [];
    const trajLen = Array.isArray(report.baselineRows) ? report.baselineRows.length : 0;
    for (let i = 0; i < trajLen; i++) {
        const b = report.baselineRows[i] || {};
        const l = report.liveRows[i] || null;
        const time = escapeHtml(b.time_label || `step ${i}`);
        const phase = escapeHtml(b.phase || '');
        const bls = (row) => row ? escapeHtml(row.bls_compact || '') : '<span style="color:#888">(no data)</span>';
        const obj = (row) => row ? escapeHtml(row.objective_status || '') : '—';
        const pl  = (row) => row && row.phase_line_km != null ? `${row.phase_line_km} km` : '—';
        const bd  = (row) => row && row.blue_destroyed != null ? row.blue_destroyed : '—';
        trajRows.push(`
            <tr>
                <td>${i}</td>
                <td>${time}</td>
                <td><small>${phase}</small></td>
                <td>${obj(b)}<br><small style="color:#888">${pl(b)} · blue ${bd(b)}</small><br><small style="color:#aaa">${bls(b)}</small></td>
                <td>${obj(l)}<br><small style="color:#888">${pl(l)} · blue ${bd(l)}</small><br><small style="color:#aaa">${bls(l)}</small></td>
            </tr>
        `);
    }

    const priorsBlock = report.priors ? `
        <h2>Learned priors (as of now)</h2>
        <table>
            <tr><th>Trials sampled</th><td>${report.priors.trialsSampled} (across ${report.priors.runsSampled} run(s))</td></tr>
            <tr><th>Outcome %</th><td>${Object.entries(report.priors.outcomePct || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}%`).join(', ') || '—'}</td></tr>
            <tr><th>Final PL (km)</th><td>${fmtStat(report.priors.finalPhaseLineKm, 'km')}</td></tr>
            <tr><th>Blue destroyed</th><td>${fmtStat(report.priors.finalBlueDestroyed, 'of 39')}</td></tr>
            <tr><th>Red coy-eq losses</th><td>${fmtStat(report.priors.finalRedCoyEqLosses)}</td></tr>
            <tr><th>Schema-OK rate</th><td>${report.priors.schemaOkRate}%</td></tr>
            <tr><th>Top failure modes</th><td>${(report.priors.fallbackReasonsTop || []).map(r => `${r.count}×${r.reason}`).join(', ') || '—'}</td></tr>
            ${report.priors.operatorFeedback ? `<tr><th>Operator feedback</th><td>${report.priors.operatorFeedback.operatorAcceptPct != null ? report.priors.operatorFeedback.operatorAcceptPct + '% accept of ' + (report.priors.operatorFeedback.accept + report.priors.operatorFeedback.reject) + ' graded' : (report.priors.operatorFeedback.note + ' note(s)')}</td></tr>` : ''}
        </table>
    ` : '<h2>Learned priors</h2><p><em>No matching past trials yet.</em></p>';

    const runPicker = (report.availableRunIds || []).length > 1
        ? `<div class="picker">
            <strong>Other runs for ${escapeHtml(sc.name)}:</strong>
            ${report.availableRunIds.filter(r => r !== report.runId).slice(0, 8).map(r =>
                `<a href="/api/ai/report.html?scenario=${encodeURIComponent(sc.name)}&runId=${encodeURIComponent(r)}"><code>${escapeHtml(r)}</code></a>`
            ).join(' · ')}
           </div>`
        : '';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Comparison report — ${escapeHtml(sc.name || 'scenario')}</title>
<style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color:#222; background:#fafafa; margin:0; padding:24px; line-height:1.4; }
    h1 { margin:0 0 4px; color:#1a3050; }
    h2 { margin-top:28px; border-bottom:2px solid #e0e6ee; padding-bottom:4px; color:#1a3050; }
    .meta { color:#666; font-size:13px; margin-bottom:18px; }
    .meta code { background:#eef1f5; padding:1px 5px; border-radius:3px; font-size:12px; }
    .meta em { color:#a85; }
    table { border-collapse:collapse; width:100%; background:#fff; margin-top:8px; }
    th, td { border:1px solid #d8dde4; padding:6px 10px; text-align:left; vertical-align:top; font-size:13px; }
    th { background:#eef1f5; font-weight:600; }
    .cmp { width:100%; }
    .cmp th:first-child, .cmp td:first-child { width:8%; }
    .cmp th:nth-child(2), .cmp td:nth-child(2) { width:8%; }
    .cmp th:nth-child(3), .cmp td:nth-child(3) { width:10%; }
    .term { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
    .term .card { background:#fff; border:1px solid #d8dde4; border-radius:6px; padding:12px 14px; }
    .term .card h3 { margin:0 0 6px; font-size:14px; color:#1a3050; }
    .term .card .big { font-size:18px; font-weight:600; color:#234; margin:4px 0; }
    .term .card small { color:#777; }
    .pill { display:inline-block; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:600; }
    .pill.CAPTURED  { background:#fde0e0; color:#922; }
    .pill.DENIED    { background:#dde7f5; color:#247; }
    .pill.THREATENED{ background:#fce6c8; color:#a52; }
    .pill.CONTESTED { background:#fce6c8; color:#a52; }
    .pill.DORMANT   { background:#e5e8ed; color:#557; }
    .picker { margin-top:14px; font-size:12px; color:#555; }
    .picker a { color:#247; text-decoration:none; margin-right:8px; }
    .picker a:hover { text-decoration:underline; }
    .footer { margin-top:32px; color:#999; font-size:11px; }
    code { font-family:'Consolas', monospace; font-size:12px; }
    @media print {
        body { background:#fff; padding:0; }
        .picker { display:none; }
    }
</style>
</head>
<body>
<h1>${escapeHtml(sc.label || sc.name || 'scenario')}</h1>
<div class="meta">
    <div>Scenario: <code>${escapeHtml(sc.name)}</code></div>
    <div>COA: ${coa.posture ? `<code>posture=${escapeHtml(coa.posture)}, reserve_hr=${escapeHtml(coa.reserve_commit_hour)}, axis=${escapeHtml(coa.main_effort_axis || 'BLS-3')}</code>` : '<em>(not recorded)</em>'}</div>
    <div>${runMeta}</div>
    <div>Generated ${escapeHtml(report.generatedAt)}</div>
    ${sc.terrain_note ? `<div style="margin-top:6px;color:#a85;">&#9888; ${escapeHtml(sc.terrain_note)}</div>` : ''}
</div>

<h2>Terminal outcome comparison</h2>
<div class="term">
    <div class="card">
        <h3>Baseline (scenario)</h3>
        <div class="big">
            <span class="pill ${escapeHtml(baseT.objective_status || '')}">${escapeHtml(baseT.objective_status || '—')}</span>
        </div>
        <div>PL ${baseT.phase_line_km != null ? baseT.phase_line_km + ' km' : '—'} · Blue ${baseT.blue_destroyed != null ? baseT.blue_destroyed : '—'}/39 · Red ${baseT.red_coy_eq_losses != null ? baseT.red_coy_eq_losses : '—'} coy-eq</div>
        <small>Deterministic replay from the scenario's final step *_baseline fields.</small>
    </div>
    <div class="card">
        <h3>Live AI (trial 0)</h3>
        <div class="big">
            <span class="pill ${escapeHtml(liveT.objective_status || '')}">${escapeHtml(liveT.objective_status || '—')}</span>
        </div>
        <div>PL ${liveT.phase_line_km != null ? liveT.phase_line_km + ' km' : '—'} · Blue ${liveT.blue_destroyed != null ? liveT.blue_destroyed : '—'}/39 · Red ${liveT.red_coy_eq_losses != null ? liveT.red_coy_eq_losses : '—'} coy-eq</div>
        <small>First trial of the chosen MC run. LLM-driven, conditioned on LEARNED PRIORS.</small>
    </div>
    <div class="card">
        <h3>Monte Carlo distribution</h3>
        ${mcT ? `
            <div class="big">${escapeHtml(outcomePctStr)}</div>
            <div>PL ${fmtStat(mcT.phase_line_km, 'km')}</div>
            <div>Blue destroyed ${fmtStat(mcT.blue_destroyed, 'of 39')}</div>
            <div>Red coy-eq ${fmtStat(mcT.red_coy_eq_losses)}</div>
            <div><small>Fallback: ${escapeHtml(fallbackStr)}</small></div>
        ` : '<em>No MC data.</em>'}
    </div>
</div>

<h2>Step-by-step trajectory</h2>
<table class="cmp">
    <thead>
        <tr>
            <th>Step</th>
            <th>Time</th>
            <th>Phase</th>
            <th>Baseline</th>
            <th>Live AI (trial 0)</th>
        </tr>
    </thead>
    <tbody>
        ${trajRows.join('\n')}
    </tbody>
</table>

${priorsBlock}

${runPicker}

<div class="footer">
    Generated by /api/ai/report.html · raw data at <code>/api/ai/report.json?scenario=${encodeURIComponent(sc.name)}${report.runId ? '&runId=' + encodeURIComponent(report.runId) : ''}</code>
</div>
</body>
</html>
`;
}

module.exports = { renderReportHtml, escapeHtml };
