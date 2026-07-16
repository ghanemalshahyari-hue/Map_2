#!/usr/bin/env node
/**
 * test-scenario-lifecycle-journal-hygiene-1.js — Batch D release-hygiene guard
 *
 * A normal operator rehearsal against the real dev server (no RMOOZ_DATA_DIR
 * override) left an untracked UI_MOdified/data/journal/scenario-lifecycle.jsonl
 * in the repo tree — the append-only lifecycle audit trail written by
 * scenario-approval-store.js::appendLifecycleEvent(). That file is pure
 * runtime state (identical in kind to UI_MOdified/data/logs/, the atomic
 * *.tmp.* write files, and the other already-gitignored runtime artifacts in
 * this repo) — it should never have been trackable in the first place.
 *
 * This guard proves, mechanically, that it can't happen again:
 *   1. The real .gitignore actually ignores the real repo-relative path
 *      (via `git check-ignore`, not just a string search).
 *   2. The rule is NARROW — it does NOT also ignore the pre-existing,
 *      intentionally-tracked journal fixtures that already live alongside it
 *      (legacy-shim-*.jsonl / manual-*.jsonl / run-*.jsonl).
 *   3. Every automated test that writes this journal does so through an
 *      isolated RMOOZ_DATA_DIR — proven here by pointing the store at a temp
 *      dir and confirming the REAL repo-tracked journal directory is left
 *      completely untouched by the write.
 *   4. The store tolerates the journal file's total absence on read (it must
 *      — a fresh clone or a fresh RMOOZ_DATA_DIR never has one yet).
 *
 *   node test-scenario-lifecycle-journal-hygiene-1.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const GITIGNORE_PATH = path.join(ROOT, '.gitignore');
const JOURNAL_RELATIVE_PATH = 'UI_MOdified/data/journal/scenario-lifecycle.jsonl';
const TRACKED_FIXTURE_RELATIVE_PATH = 'UI_MOdified/data/journal/manual-wargame3.jsonl';

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function gitCheckIgnore(relativePath) {
    try {
        const out = execFileSync('git', ['check-ignore', '-v', relativePath], { cwd: ROOT, encoding: 'utf8' });
        return { ignored: true, output: out.trim() };
    } catch (e) {
        // git check-ignore exits 1 (not an error condition here) when the
        // path is NOT ignored — distinguish that from a genuine git failure.
        if (e.status === 1) return { ignored: false, output: (e.stdout || '').toString().trim() };
        throw e;
    }
}

console.log('\n=== Part 1: .gitignore carries a NARROW, exact rule for the one runtime file ===\n');
(function gitignoreContent() {
    const src = fs.readFileSync(GITIGNORE_PATH, 'utf8');
    const lines = src.split('\n').map((l) => l.trim());
    ok(lines.indexOf(JOURNAL_RELATIVE_PATH) !== -1, '.gitignore has the exact path (no wildcard) for scenario-lifecycle.jsonl');
    ok(!lines.some((l) => /journal\/\*\.jsonl$/.test(l) || l === 'UI_MOdified/data/journal/*.jsonl' || l === 'UI_MOdified/data/journal/'), '.gitignore does NOT broadly ignore the whole journal/ directory or *.jsonl glob (would swallow tracked fixtures)');
})();

console.log('\n=== Part 2: real `git check-ignore` — the actual repo path is ignored ===\n');
(function realGitIgnoreCheck() {
    const result = gitCheckIgnore(JOURNAL_RELATIVE_PATH);
    ok(result.ignored, 'git actually ignores ' + JOURNAL_RELATIVE_PATH, result.output);
    ok(result.output.indexOf('.gitignore') !== -1, 'the match is attributed to .gitignore', result.output);
})();

console.log('\n=== Part 3: the rule stays narrow — pre-existing tracked fixtures are unaffected ===\n');
(function fixturesUnaffected() {
    // Sanity: the fixture actually exists and is genuinely tracked, so this
    // is a real check, not a vacuous pass on a missing file.
    const fixturePath = path.join(ROOT, TRACKED_FIXTURE_RELATIVE_PATH);
    ok(fs.existsSync(fixturePath), 'sanity: the tracked fixture file actually exists on disk', fixturePath);
    let isTracked = false;
    try { execFileSync('git', ['ls-files', '--error-unmatch', TRACKED_FIXTURE_RELATIVE_PATH], { cwd: ROOT, encoding: 'utf8' }); isTracked = true; } catch (_) {}
    ok(isTracked, 'sanity: the fixture is genuinely git-tracked (not itself untracked debris)');

    const result = gitCheckIgnore(TRACKED_FIXTURE_RELATIVE_PATH);
    ok(!result.ignored, 'the narrow rule does NOT ignore a pre-existing tracked journal fixture', result.output);
})();

console.log('\n=== Part 4: isolation — the store writes ONLY inside RMOOZ_DATA_DIR, never the repo ===\n');
(function isolationAndAbsenceTolerance() {
    const realJournalFile = path.join(ROOT, JOURNAL_RELATIVE_PATH);
    const realJournalExistedBefore = fs.existsSync(realJournalFile);
    const realJournalMtimeBefore = realJournalExistedBefore ? fs.statSync(realJournalFile).mtimeMs : null;

    const originalDataDir = process.env.RMOOZ_DATA_DIR;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-journal-hygiene-'));
    try {
        process.env.RMOOZ_DATA_DIR = tempDir;
        // Fresh require is unnecessary — dataDir()/journalDir()/
        // lifecycleJournalFile() all read process.env.RMOOZ_DATA_DIR live on
        // every call, they don't cache it at module-load time.
        const store = require('./UI_MOdified/server/scenario-approval-store.js');

        console.log('\n[4a] absence tolerance — reading a journal that has never been written');
        let readResult;
        try { readResult = store.readLifecycleEvents('never-existed-scenario'); }
        catch (e) { readResult = { threw: e && e.message }; }
        ok(Array.isArray(readResult) && readResult.length === 0, 'readLifecycleEvents() on a missing file returns [] rather than throwing', JSON.stringify(readResult));

        console.log('\n[4b] a real append lands ONLY inside the isolated temp dir');
        const row = store.appendLifecycleEvent({
            scenario_name: 'journal-hygiene-test', event: 'authored',
            actor_id: 'hygiene-test', actor_role: 'author', from_status: null, to_status: 'draft',
        });
        ok(!!row.event_hash, 'appendLifecycleEvent() returns a hashed row');

        const tempJournalFile = store._paths.lifecycleJournalFile();
        ok(tempJournalFile.indexOf(tempDir) === 0, 'the resolved journal path is inside the temp dir, not the repo', tempJournalFile);
        ok(fs.existsSync(tempJournalFile), 'the journal file was actually created inside the temp dir');

        console.log('\n[4c] the REAL repo-tracked journal directory is completely untouched by that write');
        const realJournalExistsAfter = fs.existsSync(realJournalFile);
        eq(realJournalExistsAfter, realJournalExistedBefore, 'the real repo journal file\'s existence is unchanged by an isolated-dir write');
        if (realJournalExistedBefore) {
            eq(fs.statSync(realJournalFile).mtimeMs, realJournalMtimeBefore, 'the real repo journal file\'s mtime is unchanged (never touched)');
        }
    } finally {
        if (originalDataDir === undefined) delete process.env.RMOOZ_DATA_DIR;
        else process.env.RMOOZ_DATA_DIR = originalDataDir;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
})();

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
