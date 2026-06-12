# LDAP-AUTH-2 — Login Wiring

**Status:** Complete  
**Branch:** `claude/relaxed-buck-a5476f`  
**Date:** 2026-06-06  
**Depends on:** LDAP-AUTH-1 (`server/auth/ldap-auth.js`, ldapjs installed)

---

## What this slice delivers

The existing RMOOZ login page is now connected to LDAP when `RMOOZ_AUTH_BACKEND=ldap`.  
Local SQLite login is **completely unchanged** when the variable is unset or set to `local`.

| Component | Change |
|-----------|--------|
| `server/app-data.js` | Schema migration, LDAP login branch, config endpoint, registration block, enriched `/me` |
| `client/index.html` | LDAP hint paragraph (hidden by default) |
| `client/landing-auth.js` | `initAuthMode()`, bilingual hint strings, register button hidden in LDAP mode |
| `test-ldap-auth-2-login-wire.js` | **New** — 25-test suite |
| `docs/integration/ldap-auth-2-login-wiring.md` | **New** — this document |

---

## Offline deployment note

`LDAP_SERVER` and `LDAP_DOMAIN` are **site-specific**. Every offline deployment sets
them to the LDAP infrastructure at that site:

```dotenv
# Site A — example
LDAP_SERVER=10.10.10.5
LDAP_DOMAIN=sss.dir

# Site B — a different site
LDAP_SERVER=192.168.50.10
LDAP_DOMAIN=ops.example.mil
```

No IP address is hardcoded in source code. The `LDAP_DOMAIN_DEFAULT` constant in
`server/auth/ldap-auth.js` is only used when `LDAP_DOMAIN` env is absent — in a real
deployment, the env var always overrides it.

The user's password is entered at login time through the browser form. It is:
- Never stored in `.env.offline`, the database, or any log file
- Never baked into the Docker image
- Used only for the LDAP bind call and discarded immediately afterward
- Not visible in `docker inspect`, `docker history`, or container environment exports

---

## Toggle

```dotenv
# .env or Offline_Deployment/.env.offline

# Use LDAP for all logins:
RMOOZ_AUTH_BACKEND=ldap

# Use local SQLite passwords (default when unset):
RMOOZ_AUTH_BACKEND=local
```

Restart the server after changing this value. No code rebuild required.

---

## Login flow (LDAP mode)

```
Browser                   RMOOZ server              Active Directory
   │                          │                           │
   │  POST /api/auth/login     │                           │
   │  { username: "s1234567",  │                           │
   │    password: "..." }      │                           │
   │──────────────────────────►│                           │
   │                           │  normaliseUsername()      │
   │                           │  → "s1234567"             │
   │                           │  buildUpn()               │
   │                           │  → "s1234567@sss.dir"     │
   │                           │                           │
   │                           │  ldap.bind(upn, pass)    │
   │                           │──────────────────────────►│
   │                           │                           │  verify
   │                           │◄──────────────────────────│  credentials
   │                           │                           │
   │                           │  ldap.search(displayName, title …)
   │                           │──────────────────────────►│
   │                           │◄──────────────────────────│
   │                           │                           │
   │                           │  upsert users row         │
   │                           │  INSERT sessions row      │
   │                           │  Set-Cookie: rmooz_session│
   │◄──────────────────────────│                           │
   │  { employeeNumber,        │                           │
   │    upn, displayName,      │                           │
   │    title, authBackend }   │                           │
   │                           │                           │
   │  redirect → home.html     │                           │
```

The user's password is used only for the LDAP bind. It is never:
- Stored anywhere (not in SQLite, not in memory after the bind returns)
- Logged (not in any `console.*` call)
- Returned in any response
- Placed in a URL query string

---

## Database changes

### Migration (LDAP-AUTH-2)

Three additive columns are added to the `users` table on every startup. The migration is
idempotent — each `ALTER TABLE` is caught silently if the column already exists.

```sql
ALTER TABLE users ADD COLUMN auth_backend TEXT DEFAULT 'local';
ALTER TABLE users ADD COLUMN upn          TEXT;
ALTER TABLE users ADD COLUMN title        TEXT;
```

### LDAP user rows

LDAP users receive a lightweight local row so the session system (which joins `sessions`
to `users`) can resolve the session. The row:

- `username` = employee number (`s1234567`)
- `password_hash` = `'ldap:managed'` — a sentinel that `verifyPassword()` never matches
  (it checks for the `scrypt:` prefix), preventing local-auth bypass
- `display_name` = LDAP `displayName` (or `cn`)
- `title` = LDAP `title`
- `upn` = full UPN (`s1234567@sss.dir`)
- `auth_backend` = `'ldap'`
- `role` = `'planner'` (group mapping is a future task)

The row is **upserted on every login** so display name and title stay current with LDAP.

---

## API changes

### POST /api/auth/login

| Mode | Behaviour |
|------|-----------|
| `local` (default) | Unchanged — lookup by username, verify scrypt hash |
| `ldap` | `normaliseUsername` → `authenticateLdapUser` → upsert user → create session |

**LDAP mode response (200):**
```json
{
  "id":             "uuid",
  "username":       "s1234567",
  "employeeNumber": "s1234567",
  "upn":            "s1234567@sss.dir",
  "displayName":    "Ali Hassan",
  "title":          "Senior Engineer",
  "role":           "planner",
  "authBackend":    "ldap"
}
```

**Error codes:**
- `401` — wrong password, invalid username format, or unknown account
- `503` — LDAP server unreachable or module not configured
- `400` — malformed request body

### POST /api/auth/register

Returns `405` when `RMOOZ_AUTH_BACKEND=ldap`:
```json
{ "error": "Registration is disabled when LDAP authentication is active." }
```

### GET /api/auth/me

Now returns enriched fields for LDAP sessions:
```json
{
  "id":             "uuid",
  "username":       "s1234567",
  "name":           "Ali Hassan",
  "displayName":    "Ali Hassan",
  "role":           "planner",
  "authBackend":    "ldap",
  "upn":            "s1234567@sss.dir",
  "title":          "Senior Engineer",
  "employeeNumber": "s1234567"
}
```

For local sessions, `authBackend` is `"local"` and `upn`/`title`/`employeeNumber` are absent.

### GET /api/auth/config  *(new)*

Public endpoint — no session required. Used by the frontend to detect auth mode.

```json
{ "authBackend": "local" }
```
or
```json
{ "authBackend": "ldap" }
```

Does **not** expose `LDAP_SERVER`, `LDAP_DOMAIN`, or any other internal config.

### POST /api/auth/logout

Unchanged — deletes the session row and clears the cookie. Works identically for local
and LDAP sessions.

---

## Frontend changes

### LDAP mode detection

On page load, `landing-auth.js` calls `GET /api/auth/config`. If `authBackend === 'ldap'`:

1. The LDAP hint paragraph (`#rmooz-ldap-mode-hint`) is shown:
   - **English:** "Use your domain account number (e.g. s1234567)"
   - **Arabic:** "أدخل رقم موظفك (مثال: s1234567)"
2. The username input placeholder changes to `s1234567`.
3. The Register button is hidden (registration disabled in LDAP mode).

In local mode the page is identical to before — no hint, Register button visible.

### No domain entry required

The user types only `s1234567`. The `@LDAP_DOMAIN` suffix is added by the backend.  
The frontend never references `LDAP_SERVER`, `LDAP_DOMAIN`, or the AD IP address.

### Language switch

`applyLang()` re-translates the hint text when the user switches language, so the hint
stays correct if it is visible.

---

## Running the tests

```bash
cd UI_MOdified

# Auth-1 regression check (no server needed):
LDAP_SERVER=10.0.0.1 node test-ldap-auth-1.js

# Auth-2 static + network (main server must be in local mode on port 8000):
npm run serve &
node test-ldap-auth-2-login-wire.js

# Auth-2 with live LDAP credentials (skipped tests become active):
LDAP_TEST_USER=s1234567 LDAP_TEST_PASS=<windows-pass> \
  node test-ldap-auth-2-login-wire.js
```

Expected: `45 passed, 0 failed` (auth-1) and `25 passed, 0 failed` (auth-2).

---

## Offline_Deployment notes

In `Offline_Deployment/.env.offline`, `RMOOZ_AUTH_BACKEND=ldap` is already set.
No further changes to Offline_Deployment files are needed.

When deploying:
- `RMOOZ_AUTH_BACKEND=ldap` activates the LDAP login path.
- Omitting it (or `=local`) keeps local SQLite passwords — useful for emergency fallback
  on a non-LDAP machine.

---

## Files changed in this slice

| File | Change |
|------|--------|
| `server/app-data.js` | Added `migrateUsersTableV2`, updated `getSessionUser`, added `/api/auth/config`, LDAP login branch, register block, enriched `/me` handler |
| `client/index.html` | Added `#rmooz-ldap-mode-hint` paragraph (hidden by default) |
| `client/landing-auth.js` | Added `ldap_mode_hint` strings, `_authBackend` state, `initAuthMode()`, language-switch re-translation |
| `test-ldap-auth-2-login-wire.js` | **Created** — 25-test suite |
| `docs/integration/ldap-auth-2-login-wiring.md` | **Created** — this document |

**Not changed:** `server/web-server.js`, `server/auth/ldap-auth.js`, session cookie mechanics,
logout handler, any scenario/WarGamingGEN files.

---

## Next step: LDAP-AUTH-3

LDAP-AUTH-3 will add:
- `GET /api/auth/ldap-health` response already exists (AUTH-1).
- Operator smoke-test script `scripts/test-ldap-bind.js` — manual LDAP bind + attribute fetch.
- Playwright E2E verify script `verify-ldap-auth.js` covering the full login → home flow.
