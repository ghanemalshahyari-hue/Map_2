# LDAP-OFFLINE-2B — Offline LDAP Server Configuration and Credential Handling

**Status:** Complete  
**Date:** 2026-06-06  
**Depends on:** LDAP-AUTH-1, LDAP-AUTH-2

---

## Purpose

This document clarifies the design intent behind RMOOZ LDAP authentication for offline
(Docker) deployments:

1. The LDAP server is site-owned infrastructure — not a single fixed IP.
2. Passwords are entered by users at login time only — never stored anywhere.
3. The same Docker image works at any site by changing env vars alone.

---

## The offline LDAP server

RMOOZ does not bundle an LDAP server. The offline deployment **requires** an Active
Directory server reachable from the Docker container at that site.

```
┌────────────────────────────────────────────────────────────────┐
│  Offline site network                                          │
│                                                                │
│   ┌──────────────────┐        TCP port 389/636                 │
│   │  RMOOZ container  │ ─────────────────────────────────────► │
│   │  (Docker)         │                          ┌────────┐    │
│   └──────────────────┘                           │  AD /  │    │
│                                                  │  LDAP  │    │
│   ┌────────────────────────────────────────────► │ server │    │
│   │  Browser (operator/user)                     └────────┘    │
│   │  http://<rmooz-host>:5006/                                 │
│   │  → enters employee number + password                       │
└────────────────────────────────────────────────────────────────┘
```

The LDAP server IP, port, and AD domain are configured per site in `.env.offline`.
No value is hardcoded in the application source code.

---

## Credential handling — complete guarantee

| Where | Password stored? | Notes |
|-------|-----------------|-------|
| `.env.offline` | **No** | Only server address and domain are stored here |
| Docker image | **No** | Image contains no credentials |
| `docker inspect` / env export | **No** | No `LDAP_PASS` or similar variable |
| Application database (`app.db`) | **No** | LDAP users have `password_hash = 'ldap:managed'` (sentinel only) |
| Server logs | **No** | Log lines reference LDAP error codes, never the password value |
| API responses | **No** | No response body contains a `password` field |
| Browser `localStorage` | **No** | Session is cookie-based; password is never cached client-side |

**The only path a password travels:**

```
User keyboard
  → HTTPS POST /api/auth/login body { username, password }
    → server reads password from request body
      → ldapjs client.bind(upn, password)
        → LDAP server verifies
      → bind result returned
    → password variable goes out of scope
  → password is gone
```

---

## Site configuration workflow

### Before deploying to a new site

1. Get from the site AD team:
   - LDAP server IP or hostname
   - LDAP port (usually 389; sometimes 636 for LDAPS)
   - AD domain UPN suffix (e.g. `sss.dir`, `corp.example.mil`)
   - One test account (employee number + password — known only to the tester)

2. Fill in `.env.offline`:
   ```dotenv
   LDAP_SERVER=<site-ldap-ip>
   LDAP_PORT=389
   LDAP_DOMAIN=<site-domain>
   ```

3. Run TCP connectivity test **before** starting the container:
   ```powershell
   # Windows host
   Test-NetConnection <LDAP_SERVER> -Port <LDAP_PORT>
   ```
   ```bash
   # Linux host
   LDAP_SERVER=<ip> LDAP_PORT=389 bash Offline_Deployment/scripts/test-ldap-connectivity.sh
   ```

4. Start the container and verify login with the test account.

5. Verify `/api/auth/me` returns `displayName` and `title` from AD.

### Moving to a different site

Only `.env.offline` changes are needed — no Docker rebuild:

```dotenv
# Change these two values for the new site
LDAP_SERVER=<new-site-ldap-ip>
LDAP_DOMAIN=<new-site-domain>
```

Restart the container:
```bash
docker compose -f Offline_Deployment/docker-compose.offline.yml restart
```

---

## What was updated in this task

### `.env.offline.example`
- `LDAP_SERVER` changed from `155.140.4.130` to `<offline-ldap-ip-or-hostname>`
- `LDAP_DOMAIN` changed from `sss.dir` to `<offline-domain>`
- Added password-policy block explaining what does and does not belong in this file
- Added step-by-step comments for each LDAP variable
- `155.140.4.130` kept only as a commented example, not the default

### `Offline_Deployment/docs/ldap-configuration-guide.md`
- Added **"Offline LDAP Server"** section with site-specific examples
- Updated environment variable table: `LDAP_SERVER` now shows "— (required per site)"
- Added `> Site-specific values` callout box
- Fixed username format table to show `<LDAP_DOMAIN>` instead of a hardcoded domain
- Updated LDAPS recommendation to not reference a specific IP
- Updated health endpoint example to use `<LDAP_SERVER>` placeholder
- Added bind smoke-test documentation (interactive password prompt for LDAP-AUTH-3)

### `Offline_Deployment/docs/offline-deployment-checklist.md`
- Added **"Offline LDAP server — confirm before proceeding"** section under Prerequisites
- Updated Step 1 to set `LDAP_SERVER` and `LDAP_DOMAIN` per-site instead of confirming hardcoded IP
- Added password-policy note to Step 1
- Updated Step 3 expected output to use `<LDAP_SERVER>` placeholders
- Updated Step 7 checklist items to use placeholders
- Updated Step 8 (login test) to note LDAP-AUTH-2 is complete, add displayName check
- Updated Step 9 response to show `authBackend: "ldap"` and confirm no `password` field

### `Offline_Deployment/docs/troubleshooting.md`
- Updated §1 diagnostic to use `process.env.LDAP_SERVER` instead of hardcoded IP
- Updated §3 to remove stale "LDAP-AUTH-2 pending" row
- Added 6 new sections: §11–§16 covering offline-specific failure modes

### `docs/integration/ldap-auth-2-login-wiring.md`
- Added **"Offline deployment note"** section at the top
- Confirmed `LDAP_SERVER` is never hardcoded
- Clarified the full password lifecycle (entered → used → discarded)

### `test-ldap-auth-2-login-wire.js`
- Updated usage comment to use `<offline-ldap-ip>` placeholder
- Removed hardcoded `'155.140.4.130'` default from spawned server env
  (now requires `LDAP_SERVER` to be set in env for network tests)

---

## Files NOT changed

- `server/auth/ldap-auth.js` — already correct; `LDAP_DOMAIN_DEFAULT = 'sss.dir'` is
  the env-fallback constant, only used when `LDAP_DOMAIN` is absent
- `server/app-data.js` — no credential handling changes needed
- `client/landing-auth.js` — does not reference `LDAP_SERVER` or any IP
- All scenario, simulation, and WarGamingGEN files — untouched

---

## Bind test script requirements (LDAP-AUTH-3)

The operator smoke-test script `scripts/test-ldap-bind.js` must be implemented in
LDAP-AUTH-3 with these constraints:

- **Interactive password prompt by default** — password is never in shell history
- Non-interactive mode via `LDAP_TEST_PASS` env var (for CI only)
- No `--password <value>` CLI argument (visible in `ps aux`)
- Preferred interface:
  ```
  node scripts/test-ldap-bind.js --user s1234567
  Enter password: ████████  (hidden input)
  [PASS] Bind succeeded. displayName: Ali Hassan, title: Senior Engineer
  ```
- On failure: print LDAP error code, not password
- Exit 0 on success, 1 on failure

---

## Test results

Both existing test suites pass after this task's changes:

```
node test-ldap-auth-1.js          →  45 passed, 0 failed
node test-ldap-auth-2-login-wire.js  →  25 passed, 0 failed
```
