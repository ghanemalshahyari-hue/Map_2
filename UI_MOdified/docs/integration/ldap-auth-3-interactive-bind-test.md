# LDAP-AUTH-3 — Interactive LDAP Bind Smoke Test

**Status:** Complete  
**Date:** 2026-06-06  
**Depends on:** LDAP-AUTH-1 (`server/auth/ldap-auth.js`), LDAP-AUTH-2 (login wired)

---

## Purpose

`scripts/test-ldap-bind-interactive.js` is an **operator verification tool** — run it
before or after a deployment to confirm that a real user credential can bind to the
configured LDAP server using the same module and logic as the RMOOZ login route.

This is not a unit test and is not run in CI. It is a human-in-the-loop tool for
deployment validation.

---

## Password guarantee

| What | Guaranteed |
|------|-----------|
| Password accepted from CLI arguments (`--password=…`) | **Never** — script exits with error if attempted |
| Password echoed to terminal | **Never** — raw TTY mode suppresses echo |
| Password written to any file | **Never** |
| Password written to any log | **Never** |
| Password included in any error message | **Never** — errors reference only LDAP error codes |
| Password stored in environment variables | **Never** |
| Password visible in shell history | **Never** — only `npm run test:ldap-bind` is recorded |

---

## Usage

### Prerequisites

Set environment variables for the target offline LDAP server:

```bash
# Option A — export in the current shell
export LDAP_SERVER=10.10.10.5
export LDAP_PORT=389
export LDAP_DOMAIN=sss.dir
export LDAP_TIMEOUT=5

# Option B — source your .env.offline (Linux/macOS)
export $(grep -v '^#' Offline_Deployment/.env.offline | xargs)

# Option B — PowerShell (Windows)
foreach ($line in (Get-Content Offline_Deployment\.env.offline | Where-Object { $_ -notmatch '^#' -and $_ -ne '' })) {
    $k, $v = $line -split '=', 2
    Set-Variable -Name $k -Value $v -Scope Process
    [System.Environment]::SetEnvironmentVariable($k, $v)
}
```

### Run

```bash
# From UI_MOdified/ directory:
npm run test:ldap-bind
```

Or directly:
```bash
node scripts/test-ldap-bind-interactive.js
```

### Example session

```
═══════════════════════════════════════════════════════════════
  RMOOZ — LDAP Bind Smoke Test
  Operator verification tool. Password is never stored or logged.
═══════════════════════════════════════════════════════════════

┌─ LDAP Configuration ──────────────────────────────────────────┐
│  Server  : 10.10.10.5
│  Port    : 389  (plain LDAP (port 389, no TLS))
│  Domain  : sss.dir
│  Timeout : 5s
└───────────────────────────────────────────────────────────────┘

  Employee number (e.g. s1234567): s1234567

  Normalised to: s1234567
  Will bind as:  s1234567@sss.dir

  Password (input hidden): [nothing visible typed here]
  Attempting bind…

───────────────────────────────────────────────────────────────
  Result        : PASS — bind succeeded
  employeeNumber: s1234567
  UPN           : s1234567@sss.dir
  displayName   : Ali Hassan
  title         : Senior Engineer
───────────────────────────────────────────────────────────────

  LDAP authentication is working correctly.
  This account will be able to log into RMOOZ.
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Bind succeeded — LDAP is working |
| `1` | Bind failed (wrong credentials, bad domain, account locked) |
| `1` | Invalid username format |
| `2` | Config error (LDAP_SERVER not set) or unexpected fatal error |
| `130` | Operator pressed Ctrl+C |

---

## FAIL reasons and fixes

| Reason | Likely cause | Fix |
|--------|-------------|-----|
| `invalid_credentials` | Wrong password, or `LDAP_DOMAIN` doesn't match account's UPN suffix | Confirm domain with AD team; try `LDAP_DOMAIN=<correct.domain>` |
| `network_error` | LDAP server unreachable, firewall blocking port, wrong IP | Run TCP test first: `.\Offline_Deployment\scripts\test-ldap-connectivity.ps1` |
| `config_error` | `LDAP_SERVER` env var not set, or ldapjs not installed | Set `LDAP_SERVER`; run `npm install` |

See also: [`Offline_Deployment/docs/troubleshooting.md`](../../Offline_Deployment/docs/troubleshooting.md)

---

## Technical design

### Uses the same module as login

The script imports `server/auth/ldap-auth.js` directly:

```javascript
const ldapAuth = require('../server/auth/ldap-auth');
```

This guarantees that a successful bind smoke-test proves the login route will also work —
they share identical normalisation, UPN construction, bind logic, and attribute fetch.

### No external packages needed

Password masking uses Node's built-in TTY raw mode (`process.stdin.setRawMode(true)`):
- Characters are read one at a time.
- Nothing is written back to the terminal (completely silent, no asterisks).
- Ctrl+C exits cleanly with code 130.
- Backspace removes the last character silently.
- Non-TTY environments (piped input for test harnesses) use `readline` without output.

### CLI argument guard

The script inspects `process.argv` at startup and exits immediately if any argument
matches a `--password`, `--pass`, `--pw`, or `--secret` pattern. This prevents accidental
shell-history exposure.

---

## When to run this tool

| Scenario | When |
|----------|------|
| First deployment at a new site | After setting `LDAP_SERVER` and `LDAP_DOMAIN`, before building Docker |
| Moving to a different AD domain | After updating `LDAP_DOMAIN` in `.env.offline` |
| Troubleshooting login failures | Isolate LDAP from the web server to see raw bind result |
| Confirming a test account exists | Before Step 8 of the deployment checklist |
| Verifying `displayName`/`title` are set in AD | Result shows what RMOOZ will display |

---

## Files

| File | Description |
|------|-------------|
| `scripts/test-ldap-bind-interactive.js` | The tool itself |
| `test-ldap-auth-3-interactive-script.js` | Static verification tests (source audit + regression) |
| `server/auth/ldap-auth.js` | Shared LDAP module |
| `Offline_Deployment/.env.offline.example` | Where to set `LDAP_SERVER` / `LDAP_DOMAIN` |
