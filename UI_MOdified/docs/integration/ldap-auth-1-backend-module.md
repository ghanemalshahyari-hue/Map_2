# LDAP-AUTH-1 — Backend LDAP Module

**Status:** Complete  
**Branch:** `claude/relaxed-buck-a5476f`  
**Date:** 2026-06-06

---

## What this slice delivers

- **`server/auth/ldap-auth.js`** — LDAP bind + attribute fetch module (ldapjs 3.0.7).
- **`GET /api/auth/ldap-health`** — safe TCP-only health endpoint (no credentials, no session required).
- **`ldapjs ^3.0.7`** added to `package.json` dependencies.
- **`test-ldap-auth-1.js`** — 45-test suite (static + network).

The existing `POST /api/auth/login` route is **not changed**. Local SQLite auth continues to work exactly as before. LDAP-AUTH-2 will wire the login route.

---

## Environment variables

All LDAP configuration is driven by environment variables. No values are hardcoded in source code. The only built-in default is `LDAP_DOMAIN=sss.dir` (the `LDAP_DOMAIN_DEFAULT` constant), which is overridden by the env var at runtime.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RMOOZ_AUTH_BACKEND` | No | `local` | Set to `ldap` to activate LDAP auth (wired in AUTH-2) |
| `LDAP_SERVER` | **Yes (for LDAP)** | — | IP or hostname of the Active Directory server |
| `LDAP_PORT` | No | `389` | LDAP port (use `636` for LDAPS) |
| `LDAP_DOMAIN` | No | `sss.dir` | AD domain suffix appended to employee number |
| `LDAP_TIMEOUT` | No | `5` | TCP connect + operation timeout in seconds |
| `LDAP_USE_SSL` | No | `0` | `1` = LDAPS (port 636). `0` = plain LDAP |

**Change the domain:** set `LDAP_DOMAIN=new.domain` in `.env.offline` and restart. No code change is needed.

---

## Username transformation

```
User types:      s1234567          (or S1234567, or s1234567@sss.dir)
                     │
              normaliseUsername()
                     │
employeeNumber:  s1234567          (lowercase, domain stripped, validated)
                     │
              buildUpn() / "@" + LDAP_DOMAIN
                     │
UPN bound to:    s1234567@sss.dir  (sent to LDAP — never logged with password)
```

### Accepted username formats
- `s1234567` — canonical
- `S1234567` — uppercase (lowercased automatically)
- `s1234567@sss.dir` — domain suffix stripped then re-appended from env
- `  s1234567  ` — whitespace trimmed

### Rejected (returns `null`)
- Empty string, non-string, numbers
- Starts with a digit (`1234567`)
- Contains spaces (`s 1234567`)
- Contains special characters (`s1234567!`, `s/admin`)
- Longer than 64 characters

---

## Module API

All functions are exported from `server/auth/ldap-auth.js`.

### `getLdapConfig()`
Reads the five env vars and returns a config object. Throws `{ code: 'LDAP_CONFIG_ERROR' }` if `LDAP_SERVER` is not set.

```javascript
const { getLdapConfig } = require('./auth/ldap-auth');
const cfg = getLdapConfig();
// { server, port, domain, timeout, useSsl }
```

### `normaliseUsername(raw)`
Pure function. Returns the normalised employee number string, or `null` for invalid input.

```javascript
normaliseUsername('S1234567@sss.dir')  // → 's1234567'
normaliseUsername('bad input!')        // → null
```

### `buildUpn(employeeNumber)`
Appends `@LDAP_DOMAIN` (reads env fresh each call).

```javascript
// LDAP_DOMAIN=corp.example
buildUpn('s1234567')  // → 's1234567@corp.example'
```

### `checkTcpReachability()`
TCP-only connectivity probe. Uses Node's built-in `net` module. **Does not require ldapjs.** Safe for the health endpoint.

```javascript
const result = await checkTcpReachability();
// { reachable: true, latencyMs: 12 }
// { reachable: false, latencyMs: 5002, error: 'ETIMEDOUT', code: 'ETIMEDOUT' }
```

### `authenticateLdapUser(rawUsername, rawPassword)`
Performs LDAP simple bind then searches for display attributes. Used by the login route (AUTH-2).

```javascript
const result = await authenticateLdapUser('s1234567', 'windows-password');
// Success:
// { ok: true, user: { employeeNumber, upn, displayName, title } }
// Failure:
// { ok: false, reason: 'invalid_credentials' | 'network_error' | 'config_error' }
```

**Security contract:**
- The password is never logged, stored, or returned.
- Bind failure (wrong password) and unknown account both return `'invalid_credentials'` — no oracle.
- The client is always unbound after each call.

---

## Health endpoint

```
GET /api/auth/ldap-health
```

No session cookie required. Tests TCP connectivity only — no LDAP bind, no credentials.

### Response shape

```json
{
  "ok":             true,
  "reachable":      true,
  "server":         "155.140.4.130",
  "port":           389,
  "domain":         "sss.dir",
  "timeoutSeconds": 5,
  "latencyMs":      14
}
```

When unreachable:
```json
{
  "ok":             false,
  "reachable":      false,
  "server":         "155.140.4.130",
  "port":           389,
  "domain":         "sss.dir",
  "timeoutSeconds": 5,
  "latencyMs":      5002,
  "error":          "Connection timed out"
}
```

When `LDAP_SERVER` is not configured:
```json
{
  "ok":             false,
  "reachable":      false,
  "server":         "",
  "port":           389,
  "domain":         "sss.dir",
  "timeoutSeconds": 5,
  "error":          "LDAP_SERVER is not configured"
}
```

### Test it

```bash
# From the host (no session cookie needed):
curl http://localhost:8000/api/auth/ldap-health

# From inside the Docker container (after AUTH-4):
docker compose exec rmooz node -e "
  require('http').get('http://127.0.0.1:5006/api/auth/ldap-health', r => {
    let d=''; r.on('data',c=>d+=c); r.on('end',()=>console.log(JSON.parse(d)));
  });
"
```

---

## Running the tests

```bash
# Static tests only (no server needed):
cd UI_MOdified
LDAP_SERVER=10.0.0.1 node test-ldap-auth-1.js

# Full suite (static + network — server must be running):
npm run serve &     # or: LDAP_SERVER=... node server/web-server.js
LDAP_SERVER=155.140.4.130 LDAP_DOMAIN=sss.dir LDAP_TIMEOUT=2 node test-ldap-auth-1.js
```

Expected output: `45 passed, 0 failed`.

The `LDAP_TIMEOUT` is used to derive the HTTP timeout in the network tests
(`(LDAP_TIMEOUT + 3) * 1000 ms`). Set it lower for faster local test cycles.

---

## Docker / offline note

In the Docker deployment, all LDAP vars are injected via `docker-compose.offline.yml` from `.env.offline`:

```yaml
environment:
  LDAP_SERVER:  "${LDAP_SERVER:-155.140.4.130}"
  LDAP_PORT:    "${LDAP_PORT:-389}"
  LDAP_DOMAIN:  "${LDAP_DOMAIN:-sss.dir}"
  LDAP_TIMEOUT: "${LDAP_TIMEOUT:-5}"
  LDAP_USE_SSL: "${LDAP_USE_SSL:-0}"
```

The `LDAP_DOMAIN` default in `Offline_Deployment/docker-compose.offline.yml` can be overridden by the operator without touching any code — set `LDAP_DOMAIN=new.domain` in `.env.offline`.

The `checkTcpReachability()` function (and therefore the health endpoint) works inside Docker immediately — it uses `net.Socket`, not ldapjs. Verify connectivity with:

```bash
docker compose exec rmooz node -e "
  require('http').get('http://127.0.0.1:5006/api/auth/ldap-health', r => {
    let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ const b=JSON.parse(d); console.log('reachable:', b.reachable, 'latency:', b.latencyMs+'ms'); });
  });
"
```

---

## LDAP 389 security warning

Port 389 (plain LDAP) transmits the bind password in cleartext. This is acceptable in the isolated offline intranet deployment (MAP_2) because the network is not internet-facing. It mirrors the existing working pattern from other apps in the same environment.

**Recommendation for future hardening:** confirm whether `155.140.4.130:636` (LDAPS) is available with the AD team, then set `LDAP_PORT=636` and `LDAP_USE_SSL=1` in `.env.offline`. The `authenticateLdapUser` function already reads `useSsl` and constructs `ldaps://` URLs when `LDAP_USE_SSL=1` — no code change needed.

---

## Files changed in this slice

| File | Change |
|------|--------|
| `server/auth/ldap-auth.js` | **Created** — LDAP module |
| `server/app-data.js` | Added `GET /api/auth/ldap-health` handler (lines 737–790) |
| `package.json` | Added `ldapjs ^3.0.7` to dependencies |
| `test-ldap-auth-1.js` | **Created** — 45-test suite |
| `docs/integration/ldap-auth-1-backend-module.md` | **Created** — this document |

**Not changed:** `server/web-server.js`, `client/landing-auth.js`, `client/index.html`, the login/register/logout/me route handlers in `server/app-data.js`, any scenario or WarGamingGEN files.

---

## Next step: LDAP-AUTH-2

LDAP-AUTH-2 will wire the login route:

1. Detect `RMOOZ_AUTH_BACKEND=ldap` in `handleAuthApi` → `POST /api/auth/login`.
2. Call `authenticateLdapUser(username, password)` instead of local scrypt verify.
3. On success: upsert a local `users` row (no `password_hash`), create session, return `{ employeeNumber, upn, displayName, title }`.
4. Disable `POST /api/auth/register` when LDAP is active (return 405).
5. Update `.env.offline.example` to document `RMOOZ_AUTH_BACKEND=ldap`.
