/**
 * RMOOZ — LDAP Bind Smoke Test (operator tool)
 *
 * Purpose:
 *   Verify that a real user credential can bind to the configured LDAP server
 *   using exactly the same module and logic as the RMOOZ login route.
 *
 * Usage:
 *   npm run test:ldap-bind
 *   OR: node scripts/test-ldap-bind-interactive.js
 *
 * Required env vars (set in shell or via .env.offline before running):
 *   LDAP_SERVER   — IP or hostname of the LDAP server
 *   LDAP_PORT     — Port (default 389)
 *   LDAP_DOMAIN   — AD UPN suffix (default sss.dir)
 *   LDAP_TIMEOUT  — Seconds (default 5)
 *   LDAP_USE_SSL  — 0 or 1 (default 0)
 *
 * Password handling guarantee:
 *   - Password is prompted interactively with echo suppressed.
 *   - Password is NEVER accepted from command-line arguments.
 *   - Password is NEVER written to any file, log, or environment variable.
 *   - Password is NEVER printed to stdout or stderr.
 *   - Password variable goes out of scope after the bind attempt completes.
 */
'use strict';

const readline = require('readline');
const path     = require('path');

// Uses the same module as the login route — single source of truth for LDAP logic.
const ldapAuth = require(path.join(__dirname, '..', 'server', 'auth', 'ldap-auth'));

// ─── Guard: reject any password-like CLI arguments ───────────────────────────
// Prevents accidental shell-history exposure if someone tries --password=xxx.
const FORBIDDEN_ARGV_PATTERNS = [
    /^--?pass(word)?=/i,
    /^--?pw=/i,
    /^--?secret=/i,
    /^--?credential=/i
];
for (const arg of process.argv.slice(2)) {
    if (FORBIDDEN_ARGV_PATTERNS.some(re => re.test(arg))) {
        console.error('\n[ERROR] Do not pass passwords as command-line arguments.');
        console.error('        Shell history stores every command — passwords in argv are visible to others.');
        console.error('        Run the script interactively: npm run test:ldap-bind\n');
        process.exit(1);
    }
}

// ─── Config validation ────────────────────────────────────────────────────────

function validateAndPrintConfig() {
    let config;
    try {
        config = ldapAuth.getLdapConfig();
    } catch (e) {
        console.error('\n[ERROR] LDAP configuration incomplete.');
        console.error(`        ${e.message}`);
        console.error('');
        console.error('        Set the required environment variables and retry:');
        console.error('          LDAP_SERVER=<offline-ldap-ip>  LDAP_DOMAIN=<domain>  npm run test:ldap-bind');
        console.error('');
        console.error('        Or source your .env.offline first:');
        console.error('          export $(grep -v "^#" Offline_Deployment/.env.offline | xargs)');
        console.error('          npm run test:ldap-bind\n');
        process.exit(1);
    }

    const ssl = config.useSsl ? 'LDAPS/TLS (port ' + config.port + ')' : 'plain LDAP (port ' + config.port + ', no TLS)';
    console.log('');
    console.log('┌─ LDAP Configuration ──────────────────────────────────────────┐');
    console.log('│  Server  : ' + config.server);
    console.log('│  Port    : ' + config.port + '  (' + ssl + ')');
    console.log('│  Domain  : ' + config.domain);
    console.log('│  Timeout : ' + config.timeout + 's');
    console.log('└───────────────────────────────────────────────────────────────┘');
    console.log('');
    return config;
}

// ─── Interactive prompts ──────────────────────────────────────────────────────

/** Prompt for a line of text (echoed). */
function promptLine(question) {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input:    process.stdin,
            output:   process.stdout,
            terminal: true
        });
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

/**
 * Prompt for a password with echo completely suppressed.
 *
 * TTY mode   — uses raw mode; characters are read one at a time, never echoed.
 * Non-TTY    — stdin is a pipe (e.g. test harness); read a line without echo.
 *
 * The returned string is the password. It is never printed anywhere.
 */
function promptPasswordSilent(question) {
    return new Promise(resolve => {
        process.stdout.write(question);

        if (process.stdin.isTTY) {
            // ── Real terminal — raw mode gives us per-keypress control ────────
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');

            let pw = '';

            function onKey(char) {
                switch (char) {
                    case '\r':
                    case '\n':
                        // Enter — accept password
                        process.stdin.setRawMode(false);
                        process.stdin.pause();
                        process.stdin.removeListener('data', onKey);
                        process.stdout.write('\n');
                        resolve(pw);
                        break;

                    case '\x7f':
                    case '\b':
                        // Backspace — silently remove last char (no visual feedback)
                        if (pw.length > 0) pw = pw.slice(0, -1);
                        break;

                    case '\x03':
                        // Ctrl+C — abort cleanly
                        process.stdin.setRawMode(false);
                        process.stdout.write('\n[Cancelled]\n');
                        process.exit(130);
                        break;

                    default:
                        // Printable char — accumulate, never echo
                        if (char.charCodeAt(0) >= 32) pw += char;
                }
            }

            process.stdin.on('data', onKey);
        } else {
            // ── Piped / non-TTY — read one line without mirroring ─────────────
            const rl = readline.createInterface({
                input:    process.stdin,
                output:   null,    // null output → no echo
                terminal: false
            });
            rl.once('line', line => {
                rl.close();
                process.stdout.write('\n');
                resolve(line);
            });
        }
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  RMOOZ — LDAP Bind Smoke Test');
    console.log('  Operator verification tool. Password is never stored or logged.');
    console.log('═══════════════════════════════════════════════════════════════');

    // Step 1: Validate LDAP config (exit fast if LDAP_SERVER not set)
    validateAndPrintConfig();

    // Step 2: Prompt for employee number
    const rawUsername = await promptLine('  Employee number (e.g. s1234567): ');
    const employeeNumber = ldapAuth.normaliseUsername(rawUsername);

    if (!employeeNumber) {
        console.error('\n[FAIL] Invalid username format.');
        console.error('       Enter only the employee number (e.g. s1234567), without @domain.\n');
        process.exit(1);
    }

    const upn = ldapAuth.buildUpn(employeeNumber);
    console.log('');
    console.log('  Normalised to: ' + employeeNumber);
    console.log('  Will bind as:  ' + upn);
    console.log('');

    // Step 3: Prompt for password (silent — never echoed, never logged)
    const password = await promptPasswordSilent('  Password (input hidden): ');

    if (!password) {
        console.error('\n[FAIL] Password cannot be empty.\n');
        process.exit(1);
    }

    // Step 4: Attempt LDAP bind via the same module the login route uses
    console.log('  Attempting bind…');
    console.log('');

    let result;
    try {
        result = await ldapAuth.authenticateLdapUser(employeeNumber, password);
    } catch (e) {
        // Never include password in error output
        console.error('[ERROR] Unexpected error during bind: ' + (e.code || e.message || 'unknown'));
        process.exit(2);
    }
    // Password is now out of scope — no further reference to it

    console.log('─'.repeat(63));

    if (result.ok) {
        const u = result.user;
        console.log('  Result        : PASS — bind succeeded');
        console.log('  employeeNumber: ' + u.employeeNumber);
        console.log('  UPN           : ' + u.upn);
        console.log('  displayName   : ' + (u.displayName && u.displayName !== u.employeeNumber
                                            ? u.displayName : '(not returned by LDAP)'));
        console.log('  title         : ' + (u.title ? u.title : '(not set in AD)'));
        console.log('─'.repeat(63));
        console.log('');
        console.log('  LDAP authentication is working correctly.');
        console.log('  This account will be able to log into RMOOZ.');
        console.log('');
        process.exit(0);
    } else {
        const HINTS = {
            invalid_credentials:
                'Wrong password, account does not exist under this LDAP_DOMAIN, or account locked.',
            network_error:
                'Cannot reach LDAP_SERVER. Check LDAP_SERVER value, network path, and firewall.',
            config_error:
                'LDAP module not available or LDAP_SERVER not configured.'
        };
        console.log('  Result : FAIL');
        console.log('  Reason : ' + result.reason);
        console.log('  Hint   : ' + (HINTS[result.reason] || 'Unknown error.'));
        console.log('─'.repeat(63));
        console.log('');
        console.log('  See docs/integration/ldap-auth-3-interactive-bind-test.md for troubleshooting.');
        console.log('');
        process.exit(1);
    }
}

main().catch(err => {
    // Safety net — never print anything that could contain the password
    console.error('\n[ERROR] Fatal: ' + (err.code || err.message || 'unknown error') + '\n');
    process.exit(2);
});
