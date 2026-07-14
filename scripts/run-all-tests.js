#!/usr/bin/env node
/**
 * scripts/run-all-tests.js — unified main-app test/release gate.
 *
 * Runs every root-level `test-*.js` static check (no server required) as a
 * separate child process, in parallel with a concurrency cap, and reports a
 * single pass/fail summary. This does NOT run the `verify-*.js` Playwright
 * scripts (those need a live server + browser — see CLAUDE.md's "Tests"
 * section) or anything under UI_MOdified/scripts or Offline_Deployment.
 *
 * Exit code is 0 only if every test file exited 0.
 *
 *   node scripts/run-all-tests.js
 *   node scripts/run-all-tests.js --filter doctrine   (substring filter on filename)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONCURRENCY = 8;

const filterArgIdx = process.argv.indexOf('--filter');
const filter = filterArgIdx !== -1 ? process.argv[filterArgIdx + 1] : null;

const files = fs.readdirSync(ROOT)
    .filter(f => /^test-.*\.js$/i.test(f))
    .filter(f => !filter || f.includes(filter))
    .sort();

if (!files.length) {
    console.error('No test-*.js files found at repo root' + (filter ? ` matching "${filter}"` : ''));
    process.exit(1);
}

console.log(`[run-all-tests] ${files.length} test file(s), concurrency=${CONCURRENCY}\n`);

function runOne(file) {
    return new Promise((resolve) => {
        const started = Date.now();
        const child = spawn(process.execPath, [path.join(ROOT, file)], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        child.on('close', (code) => {
            resolve({ file, code, out, ms: Date.now() - started });
        });
        child.on('error', (err) => {
            resolve({ file, code: -1, out: String(err && err.message || err), ms: Date.now() - started });
        });
    });
}

async function run() {
    const results = [];
    let idx = 0;
    async function worker() {
        while (idx < files.length) {
            const file = files[idx++];
            const r = await runOne(file);
            results.push(r);
            const status = r.code === 0 ? 'PASS' : 'FAIL';
            console.log(`  ${status}  ${file}  (${r.ms}ms)`);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    const failed = results.filter(r => r.code !== 0).sort((a, b) => a.file.localeCompare(b.file));
    const passed = results.length - failed.length;

    console.log(`\n=== ${passed}/${results.length} test files passed ===`);
    if (failed.length) {
        console.log(`\n${failed.length} FAILING file(s):\n`);
        for (const f of failed) {
            console.log(`--- ${f.file} (exit ${f.code}) ---`);
            console.log(f.out.trim().split('\n').slice(-15).join('\n'));
            console.log('');
        }
    }
    process.exit(failed.length ? 1 : 0);
}

run();
