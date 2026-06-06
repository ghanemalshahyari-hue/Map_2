# LDAP-OFFLINE-AUTH-0 — RMOOZ Login & Offline Docker Readiness Audit

**Date:** 2026-06-06  
**Branch:** `claude/relaxed-buck-a5476f`  
**Scope:** Read-only audit — no files modified, no packages installed.  
**Objective:** Prepare for LDAP authentication in the offline MAP_2 Docker deployment.

---

## Acceptance Checklist

| # | Criterion | Result |
|---|-----------|--------|
| 1 | How current login works | ✅ See §1 |
| 2 | What files need to change | ✅ See §11 |
| 3 | Where LDAP config should live | ✅ See §4 |
| 4 | How Docker port 5006 should be configured | ✅ See §8 |
| 5 | Whether the backend can reach LDAP from container | ✅ See §9 |
| 6 | What packages/dependencies are required | ✅ See §5 |
| 7 | Exact implementation plan LDAP-AUTH-1 through LDAP-AUTH-5 | ✅ See §11 |

---

## §1 — Current Login System

### 1.1 Login Page

**File:** `client/index.html` (the root `/` landing page)  
**Type:** Bilingual RTL/LTR (Arabic + English) HTML form  

The page presents two inputs (`username`, `password`) and two buttons (`Login`, `Register`).  
It loads a single auth script: `client/landing-auth.js`.

No separate `login.html` or `signin.html` exists — the root `index.html` IS the login page.

### 1.2 Client Auth Script

**File:** `client/landing-auth.js` (~333 lines)

Key behaviours:
- `fetchAuthMe()` — calls `GET /api/auth/me` on page load; if a valid session exists, skips the form and redirects immediately via `goNext()`.
- `doLogin()` — `POST /api/auth/login` with `{ username, password }` as JSON, `credentials: 'include'`.
- `doRegister()` — `POST /api/auth/register` with the same body.
- `goNext()` — redirects to `home.html` (PR1 launch hub) by default, or to `?next=<path>` if present in the query string.
- Validation: min 2 chars username, min 4 chars password (client-side only; server validates independently).
- No password is stored in `localStorage` or `sessionStorage` — credentials only transit the POST body, never stored client-side.

**Default redirect target after login:** `home.html`

### 1.3 Auth API Endpoints

All handlers live in `server/app-data.js` → `handleAuthApi()` (line 735).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/login` | Verify local password → create session → Set-Cookie |
| `POST` | `/api/auth/register` | Create local user (hashed password) |
| `POST` | `/api/auth/logout` | Delete session row → clear cookie |
| `GET`  | `/api/auth/me` | Validate session cookie → return user object |

### 1.4 Current User/Password Store

**No `users.json`.** All users live in a SQLite database at `data/app.db`.

**Schema** (`server/app-data.js`, lines 226–259):
```sql
CREATE TABLE users (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- "scrypt:<salt>:<hash>"
    display_name TEXT,
    role         TEXT DEFAULT 'planner',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,         -- opaque UUID
    user_id     TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,         -- Unix ms
    created_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Password hashing:** `crypto.scryptSync(password, salt_16bytes, 64)` — modern, GPU-resistant. Comparison via `crypto.timingSafeEqual`.

**Bootstrap user:** On first run, if no `admin` user exists, one is created with a randomly generated password written to `data/BOOTSTRAP_PASSWORD.txt` (mode 0600). Configurable via `RMOOZ_BOOTSTRAP_PASSWORD` env var.

### 1.5 Session / Cookie

| Property | Value |
|----------|-------|
| Cookie name | `rmooz_session` |
| Storage | SQLite `sessions` table |
| Max-age | 7 days (604 800 s) |
| HttpOnly | Yes |
| SameSite | Lax |
| Transport | Cookie header only — never in URL or response body |

**`getSessionUser(req)`** (app-data.js line 487): parses cookie → `SELECT … FROM sessions JOIN users WHERE s.id=? AND s.expires_at > Date.now()` → returns `{ id, username, displayName, role }` or `null`.

### 1.6 Protected Routes

Mutation-only routes are gated by `requireAuthenticatedUser(req, res)` (web-server.js line 118):

```
POST/PATCH/DELETE  /api/units/*
POST               /api/plans, PUT /api/plans/:id, DELETE /api/plans/:id
GET/POST           /api/me/preferences
```

Read-only / public routes (no auth required):
```
GET /api/units/tree, /api/units/search, /api/units/:id/children
GET /api/ai/*   (most AI endpoints)
GET /api/scenario/*
GET /api/chat/* (chat uses its own presence cookie)
GET /           (login page)
GET /app.html, /home.html (static — client checks session before showing sensitive UI)
```

**`app.html` itself is served as a static file without a server-side auth gate**, meaning the HTML is accessible unauthenticated. The client-side JS calls `GET /api/auth/me` on startup and handles the 401 redirect. For the LDAP migration this behaviour does not need to change (server-side auth on API calls is already enforced).

---

## §2 — Backend Server

**Main entrypoint:** `UI_MOdified/server/web-server.js` (2106 lines, raw Node.js `http` — no Express in the web server itself)

```
Note: `express` IS in package.json but it is only used by tile-server.js.
      web-server.js uses the raw `http` module exclusively.
```

### 2.1 Port Configuration

```javascript
// web-server.js line 17
const PORT = Number.parseInt(process.env.PORT, 10) || 8000;

// web-server.js line 2099
server.listen(PORT, '0.0.0.0', () => { … });
```

**The server already reads `PORT` from the environment and already binds to `0.0.0.0`.** Setting `PORT=5006` before starting (or in Docker `ENV PORT=5006`) is all that is needed. No code change required for the port.

### 2.2 Auth / Session Middleware

- No third-party session library (no `express-session`, no `passport`, no JWT).
- Pure hand-rolled cookie + SQLite model.
- `requireAuthenticatedUser()` is a thin wrapper around `getSessionUser()`.
- Adding LDAP: the session creation path in `handleAuthApi / /api/auth/login` is the only place that needs to change. Everything downstream (cookie issuance, session lookup, logout) stays the same.

### 2.3 Tile Server

**File:** `server/tile-server.js`  
**Port:** hardcoded `8080` (uses Express + `better-sqlite3` against `.mbtiles` files in `maps/`)  
**Binds:** `127.0.0.1` — loopback only by default (for Docker, this will need to be `0.0.0.0` or the web-server must proxy tile requests).

---

## §3 — Docker / Offline Setup

### 3.1 Dockerfile — main RMOOZ app

**Does not exist.** There is no `Dockerfile` or `docker-compose.yml` for the main RMOOZ web application.

Dockerfiles found are **only** for `TestingAI/SmartSearch` sub-projects and must not be used or modified for this task.

A new `Dockerfile` and `docker-compose.yml` must be authored as part of **LDAP-AUTH-4**.

### 3.2 `.env` / `.env.example`

**File:** `UI_MOdified/.env.example` (106 lines)  
Contains: Anthropic API key, model selection, WarGamingGEN paths, AI provider selection.  
**Does NOT contain:** `PORT`, `OFFLINE_TILES`, `TILE_URL`, or any LDAP variables.

An LDAP block must be added to `.env.example` as part of **LDAP-AUTH-1**.

### 3.3 `package.json` Scripts

```json
"serve": "set RMOOZ_ALLOW_SIM_RUN=1&& ... && node server/web-server.js",
"web":   "(same as serve)",
"start": "node server/tile-server.js",
"app":   "concurrently \"npm run start\" \"npm run serve\""
```

For Docker, the start command should be `node server/web-server.js` (not the npm scripts, since they use Windows `set` syntax). The `PORT` env var must be passed in instead.

### 3.4 Persistent Data Directories

The server auto-creates these from env vars or defaults relative to the project root:

| Variable | Default | Purpose |
|----------|---------|---------|
| `RMOOZ_DATA_DIR` | `<root>/data` | SQLite DBs, scenarios, journal |
| `RMOOZ_UPLOADS_DIR` | `<root>/uploads` | File uploads |
| `RMOOZ_MAPS_DIR` | `<root>/maps` | `.mbtiles` tile files |

All three should be Docker volumes for persistence.

### 3.5 Offline Tile Config

The tile server reads `.mbtiles` files from `RMOOZ_MAPS_DIR` at startup. There is no `OFFLINE_TILES` toggle env var in the codebase — tile serving is always on as long as `.mbtiles` files are present in the maps directory. No code change needed to enable offline tiles; just mount the maps volume.

The web server client code references tile URLs. For Docker, the tile server must be reachable from the browser. Options:
1. Expose tile-server port `8080` alongside port `5006`.
2. Or add a reverse-proxy pass in web-server.js for `/tiles/*` (simpler for Docker-only deployment).

---

## §4 — Environment Config

### 4.1 Where Config Lives

All environment is read at startup directly via `process.env.*` — there is no config loader, no `.env` auto-load (no `dotenv`). The operator must export variables before starting or inject them via Docker `ENV` / `env_file`.

### 4.2 Best Place to Add LDAP Variables

Add to **`UI_MOdified/.env.example`** under a new `── LDAP Authentication ──` section (documentation only — `.env.example` is committed; actual `.env` is gitignored). The server code will read them in `server/app-data.js` at the top of the `handleAuthApi` login path (or via a new `server/auth/ldap-auth.js` module).

### 4.3 Proposed LDAP Env Variables

```dotenv
# ── LDAP Authentication ────────────────────────────────────────────
# Set RMOOZ_AUTH_BACKEND=ldap to replace local password auth with LDAP bind.
# When unset or set to "local" the existing SQLite auth is used (default).
RMOOZ_AUTH_BACKEND=ldap

# LDAP server address (internal network — must be reachable from container).
LDAP_SERVER=155.140.4.130
LDAP_PORT=389

# Domain suffix — appended to employee number: s1234567 → s1234567@sss.dir
# Operator can change this without touching code.
LDAP_DOMAIN=sss.dir

# Timeout in seconds for LDAP bind attempt.
LDAP_TIMEOUT=5

# Set to 1 to use LDAPS (port 636). 0 = plain LDAP (StartTLS not yet enabled).
LDAP_USE_SSL=0
```

The `RMOOZ_AUTH_BACKEND` flag lets the operator switch between LDAP and local auth without code changes — useful for fallback testing.

---

## §5 — Node LDAP Package Recommendation

### Candidates

| Package | Style | Native bindings | Notes |
|---------|-------|-----------------|-------|
| `ldapjs` v3 | Callback + Promise wrappers | No — pure JS | Most widely used; works on Node 18+; no native compile needed in Docker |
| `ldapts` | async/await, TypeScript | No — pure JS | Cleaner API; slightly newer; also Docker-safe |
| `activedirectory2` | High-level AD helper | No | Wraps ldapjs; too much abstraction for this use |

**Recommendation: `ldapjs` v3**

Reasons:
1. Pure JavaScript — no native bindings, no `node-gyp` compile step in Docker.
2. `better-sqlite3` already requires native bindings; keeping LDAP pure-JS reduces Docker complexity.
3. Battle-tested against Active Directory (LDAP) environments.
4. Supports simple bind (username + password) out of the box.
5. Supports attribute fetch (displayName, title, etc.) after bind.

**Package change needed for Docker:**
```json
"ldapjs": "^3.0.7"
```
Add to `dependencies` in `UI_MOdified/package.json` during **LDAP-AUTH-1**.

Do not install yet — this is approved as part of LDAP-AUTH-1 implementation.

---

## §6 — LDAP Authentication Flow Design

### 6.1 POST /api/auth/login — LDAP Path

```
Client sends: POST /api/auth/login
              { "username": "s1234567", "password": "..." }

Server (new LDAP path):
  1. Parse body — read username and password strings.
  2. Sanitise username:
       - trim whitespace
       - lowercase
       - strip any "@domain" suffix if the user accidentally typed one
       - validate format: must match /^[a-z0-9][a-z0-9._-]{0,63}$/i
         (reject empty, spaces, path chars)
  3. Build UPN: upn = username + "@" + process.env.LDAP_DOMAIN
  4. Attempt LDAP bind:
       - host: LDAP_SERVER, port: LDAP_PORT, timeout: LDAP_TIMEOUT * 1000
       - SSL: false (LDAP_USE_SSL=0)
       - client.bind(upn, password)  ← plain bind, no anonymous search needed
  5. On bind SUCCESS:
       a. Search LDAP for the user's attributes (displayName, title, employeeNumber).
          Base DN derived from domain: e.g. DC=sss,DC=dir
          Filter: (userPrincipalName=<upn>)  OR  (sAMAccountName=<username>)
       b. Extract: displayName (or cn), title, employeeNumber (or sAMAccountName).
       c. Upsert a local users row (INSERT OR REPLACE) keyed on username:
            id = genId() on first seen, else existing id
            username = sanitised employee number
            display_name = ldap.displayName || username
            role = 'planner'  (no group mapping yet)
            password_hash = NULL or placeholder — never used for LDAP users
       d. Create session (existing flow):
            INSERT INTO sessions (id, user_id, expires_at, …)
            Set-Cookie: rmooz_session=<sid>; HttpOnly; SameSite=Lax; …
       e. Return 200:
            { employeeNumber: "s1234567",
              upn: "s1234567@sss.dir",
              displayName: "...",
              title: "..." }
  6. On bind FAILURE (wrong password / unknown user / timeout):
       - Log: "[ldap-auth] bind failed for <username>: <error code>" — NO PASSWORD IN LOG.
       - Return 401: { "error": "Invalid credentials" }
         (same generic message as local auth — no oracle leakage)
  7. On LDAP server unreachable:
       - Return 503: { "error": "Authentication service unavailable" }
```

### 6.2 Username Sanitisation

```javascript
function sanitiseLdapUsername(raw) {
    let u = String(raw || '').trim().toLowerCase();
    // Strip domain suffix if user typed "s1234567@sss.dir"
    const atIdx = u.indexOf('@');
    if (atIdx !== -1) u = u.slice(0, atIdx);
    // Validate: allow letters, digits, dot, dash, underscore; 1-64 chars
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(u)) return null;
    return u;
}
```

### 6.3 LDAP Attributes to Fetch

After a successful bind, search for:

| LDAP attribute | Maps to | Required |
|----------------|---------|----------|
| `displayName` | `displayName` | Yes (fallback: `cn`) |
| `title` | `title` | Yes (fallback: empty string) |
| `sAMAccountName` | `employeeNumber` | Yes (equals the username portion) |
| `employeeNumber` | `employeeNumber` (override) | Optional — use if present |
| `department` | `department` | Optional (not returned in API v1) |
| `mail` | `mail` | Optional (not returned in API v1) |
| `thumbnailPhoto` | `photo` | Optional — later |

---

## §7 — Session / Logout Flow Design

No changes needed to the session cookie mechanism or the logout route. They are already correctly designed:

### 7.1 GET /api/auth/me

Current implementation (app-data.js line 799) is already correct and stays unchanged:
```
→ validate rmooz_session cookie against sessions JOIN users
→ 200 { id, username, name, role }    (username = employeeNumber for LDAP users)
→ 401 { error: "Unauthorized" }
```
For LDAP users the `username` column stores the employee number (e.g. `s1234567`) and `name` stores the LDAP `displayName`. The response shape is identical to local-auth users — no client changes needed.

### 7.2 POST /api/auth/logout

Existing implementation (app-data.js line 785) is unchanged:
```
DELETE FROM sessions WHERE id=<sid>
Set-Cookie: rmooz_session=; Max-Age=0
200 { ok: true }
```

### 7.3 Security Rules (must be enforced in LDAP-AUTH-2)

- Password MUST NOT appear in any log line, not even as `***`.
- Password MUST NOT be stored anywhere (not SQLite, not memory after bind completes).
- Error responses MUST use the same generic message (`Invalid credentials`) for wrong password AND unknown user — no oracle.
- `username` in logs is the employee number only (no domain suffix, no password).
- The LDAP bind password travels only in the ldapjs bind call — never in a URL, query string, or header visible in application logs.

---

## §8 — Docker / Offline Requirements

### 8.1 Dockerfile (to be authored in LDAP-AUTH-4)

```dockerfile
FROM node:20-slim

# System deps for better-sqlite3 native binding
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (including ldapjs once approved)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app source
COPY client/   ./client/
COPY server/   ./server/
COPY data/     ./data/
COPY maps/     ./maps/
# (or mount data/ and maps/ as volumes — see below)

# Runtime env (overridden by docker-compose or --env-file)
ENV PORT=5006 \
    RMOOZ_AUTH_BACKEND=ldap \
    LDAP_SERVER=155.140.4.130 \
    LDAP_PORT=389 \
    LDAP_DOMAIN=sss.dir \
    LDAP_TIMEOUT=5 \
    LDAP_USE_SSL=0

EXPOSE 5006

CMD ["node", "server/web-server.js"]
```

**Important:** `better-sqlite3` requires a native build. The `python3 make g++` layer is mandatory. When `ldapjs` is added (pure JS), it needs no extra build deps.

### 8.2 docker-compose.yml (to be authored in LDAP-AUTH-4)

```yaml
version: "3.9"
services:
  rmooz:
    build: .
    ports:
      - "5006:5006"
    environment:
      PORT: "5006"
      RMOOZ_AUTH_BACKEND: "ldap"
      LDAP_SERVER: "155.140.4.130"
      LDAP_PORT: "389"
      LDAP_DOMAIN: "${LDAP_DOMAIN:-sss.dir}"   # overridable
      LDAP_TIMEOUT: "5"
      LDAP_USE_SSL: "0"
      RMOOZ_ALLOW_SIM_RUN: "0"                 # disable WarGamingGEN in Docker
    volumes:
      - rmooz_data:/app/data
      - rmooz_maps:/app/maps
      - rmooz_uploads:/app/uploads
    restart: unless-stopped
    # Container must reach 155.140.4.130:389 — no extra network config needed
    # if the host's network is accessible (default bridge mode).

volumes:
  rmooz_data:
  rmooz_maps:
  rmooz_uploads:
```

### 8.3 Port 5006 — Why No Code Change Is Needed

`server/web-server.js` already reads `process.env.PORT` (line 17) and already binds to `0.0.0.0` (line 2099). Setting `PORT=5006` in the Docker environment is sufficient.

### 8.4 Tile Server in Docker

The tile server (`tile-server.js`) currently binds to `127.0.0.1:8080` — loopback only. For Docker, either:
- Option A: Change tile-server to bind `0.0.0.0` and expose `8080` alongside `5006` in docker-compose.
- Option B (recommended): Add tile proxy in `web-server.js` so `/tiles/*` is proxied to `127.0.0.1:8080` internally, and only `5006` is exposed to the host.

Defer this decision to **LDAP-AUTH-4** — tile serving is independent of auth.

### 8.5 LDAP Container Network

The Docker container must be able to reach `155.140.4.130:389`. With the default Docker `bridge` network the container routes through the host — if the host can reach the LDAP server, the container can too. No special `--network` flag needed unless the host is on a VPN or split-tunnel. Verify with the smoke-test commands in §9.

---

## §9 — LDAP Network Test Plan

### 9.1 From the Host (Windows)

```powershell
# Test TCP connectivity to LDAP server
Test-NetConnection 155.140.4.130 -Port 389

# Expected: TcpTestSucceeded : True
# If False: firewall or routing issue between this host and the LDAP server
```

### 9.2 From Inside the Docker Container

```bash
# After docker-compose up, exec into the container:
docker compose exec rmooz bash

# Option A — netcat (if installed)
nc -zv 155.140.4.130 389

# Option B — Node one-liner (always available in the container)
node -e "
  const net = require('net');
  const s = net.createConnection(389, '155.140.4.130', () => {
    console.log('LDAP TCP OK'); s.end();
  });
  s.on('error', e => { console.error('LDAP TCP FAIL:', e.message); process.exit(1); });
  s.setTimeout(5000, () => { console.error('LDAP TCP TIMEOUT'); process.exit(1); });
"
```

### 9.3 Diagnostic API Endpoint (LDAP-AUTH-3)

Add `GET /api/auth/ldap-health` — a safe diagnostic that:
- Attempts a TCP connection to `LDAP_SERVER:LDAP_PORT` (no credentials).
- Returns `{ ldap: "reachable", server: "<host>", port: <port> }` or `{ ldap: "unreachable", error: "..." }`.
- **Does not** accept credentials, perform a bind, or expose any LDAP data.
- Protected by `requireAuthenticatedUser` so only logged-in operators can call it.

```
GET /api/auth/ldap-health
Authorization: (session cookie)
→ 200 { ldap: "reachable", server: "155.140.4.130", port: 389 }
→ 200 { ldap: "unreachable", error: "ETIMEDOUT" }
```

### 9.4 ldapjs Smoke Test Script (LDAP-AUTH-1 deliverable)

A standalone non-HTTP script `scripts/test-ldap-bind.js`:
```
node scripts/test-ldap-bind.js --user s1234567 --password <pw>
```
- Reads LDAP config from env vars.
- Attempts bind + attribute fetch.
- Prints result. Exits 0 on success, 1 on failure.
- **Used only by operators for deployment verification.** Never called by the server at runtime.
- Password accepted only via `--password` arg or `LDAP_TEST_PASSWORD` env var — never hardcoded.

---

## §10 — Risk Notes

### 10.1 Unencrypted LDAP (port 389)

LDAP on port 389 without StartTLS transmits the bind password in plaintext over the network. This mirrors the existing working app pattern and is acceptable **only** because:
- The deployment is an isolated intranet (MAP_2 offline environment).
- The LDAP server at 155.140.4.130 is an internal AD server.
- No public internet exposure.

**Future recommendation:** Enable StartTLS (`ldapjs` supports it via `client.starttls()`) or switch to LDAPS on port 636 when the AD team confirms availability. Add `LDAP_USE_STARTTLS=1` env var at that point.

### 10.2 No Local Fallback Admin

With `RMOOZ_AUTH_BACKEND=ldap`, the local SQLite password check is bypassed. If the LDAP server is unreachable the app returns `503`. There is no local admin backdoor by design (matching the brief's "no local fallback unless user approves later").

If a fallback is needed later, add `RMOOZ_AUTH_FALLBACK_USER` + `RMOOZ_AUTH_FALLBACK_HASH` env vars — the login handler checks LDAP first, falls back to the env-var credential only if LDAP is unreachable.

### 10.3 `better-sqlite3` Native Binding in Docker

`better-sqlite3` compiles a native `.node` binding. The Docker image must include build tools (`python3`, `make`, `g++`) or use a pre-built image that already has the binding compiled for the target platform. If targeting ARM (e.g. Raspberry Pi), set `--platform linux/amd64` or rebuild for ARM.

### 10.4 `RMOOZ_BOOTSTRAP_PASSWORD` in Docker

With LDAP auth active, the bootstrap `admin` SQLite user is irrelevant. However, `initAppData()` still calls `ensureBootstrapUser()`, which writes `data/BOOTSTRAP_PASSWORD.txt` if no admin row exists. Set `RMOOZ_BOOTSTRAP_PASSWORD=disabled` in Docker to suppress this (the bootstrap user will be created with that literal password and the file will not be written — it's unusable since LDAP is the auth path).

### 10.5 Register Endpoint

`POST /api/auth/register` creates local users. With LDAP active, this endpoint should be disabled (return `405 Method Not Allowed` or `501 Not Implemented`) to prevent local account creation that bypasses LDAP. Wire the `RMOOZ_AUTH_BACKEND` check to reject register calls when set to `ldap`.

---

## §11 — Implementation Plan

### LDAP-AUTH-1 — Add LDAP module + env config (no UI changes)

**Files to create:**
- `server/auth/ldap-auth.js` — new module

**Files to modify:**
- `package.json` — add `"ldapjs": "^3.0.7"` to `dependencies`
- `.env.example` — add LDAP block (§4.3)
- `server/app-data.js` — `handleAuthApi` login path: check `RMOOZ_AUTH_BACKEND`

**`server/auth/ldap-auth.js` responsibilities:**
```
exports.bindAndFetch(username, password) → Promise<{ employeeNumber, upn, displayName, title }>
  - sanitiseLdapUsername()
  - create ldapjs client with LDAP_SERVER / LDAP_PORT / LDAP_TIMEOUT
  - client.bind(upn, password)
  - client.search(baseDN, filter, attributes)
  - client.unbind()
  - return user object OR throw LdapAuthError / LdapUnavailableError
```

**Modified login route (app-data.js):**
```javascript
if (process.env.RMOOZ_AUTH_BACKEND === 'ldap') {
    // LDAP path
    const ldapAuth = require('./auth/ldap-auth');
    ldapAuth.bindAndFetch(username, password)
        .then(ldapUser => {
            // upsert users row, create session, set cookie, respond 200
        })
        .catch(err => {
            if (err.code === 'LDAP_UNAVAILABLE') return sendJson(res, 503, { error: 'Authentication service unavailable' });
            return sendJson(res, 401, { error: 'Invalid credentials' });
        });
} else {
    // existing local path (unchanged)
}
```

**Deliverables:** `server/auth/ldap-auth.js`, `scripts/test-ldap-bind.js`, updated `package.json` + `.env.example`.

---

### LDAP-AUTH-2 — Wire login route + disable register

**Files to modify:**
- `server/app-data.js` — replace login handler body with LDAP path, disable register when LDAP active

**Key changes:**
1. Login: call `ldapAuth.bindAndFetch()`, upsert local user row (no password hash), create session.
2. Register: if `RMOOZ_AUTH_BACKEND === 'ldap'` → return `{ error: 'Registration disabled' }` 405.
3. `GET /api/auth/me` → unchanged (session cookie lookup only).
4. `POST /api/auth/logout` → unchanged.

**Security checklist for this phase:**
- [ ] No password in any `console.log` or `console.error` call.
- [ ] Bind error messages logged only as LDAP error code (e.g. `49 - invalidCredentials`), never with password.
- [ ] Generic `Invalid credentials` returned for both wrong-password and unknown-user.
- [ ] `ldapjs` client destroyed/unbound after each auth attempt (no connection reuse that could leak state).

---

### LDAP-AUTH-3 — Health endpoint + smoke test script

**Files to create:**
- `scripts/test-ldap-bind.js` (standalone operator tool)

**Files to modify:**
- `server/app-data.js` → add `GET /api/auth/ldap-health` handler

**`/api/auth/ldap-health`:**
```
- requireAuthenticatedUser (returns 401 if no session)
- TCP connect to LDAP_SERVER:LDAP_PORT (no bind, no credentials)
- Timeout: LDAP_TIMEOUT seconds
- 200 { ldap: "reachable"|"unreachable", server, port, latencyMs }
```

---

### LDAP-AUTH-4 — Docker packaging

**Files to create:**
- `UI_MOdified/Dockerfile`
- `UI_MOdified/docker-compose.yml`
- `UI_MOdified/.dockerignore`

**`.dockerignore`:**
```
node_modules/
.env
data/BOOTSTRAP_PASSWORD.txt
docs/
*.md
TestingAI/
```

**Checklist:**
- [ ] `PORT=5006` default in `ENV`
- [ ] `expose 5006:5006` in docker-compose
- [ ] All four LDAP vars in `environment` block, `LDAP_DOMAIN` overridable via `${LDAP_DOMAIN:-sss.dir}`
- [ ] `rmooz_data`, `rmooz_maps`, `rmooz_uploads` as named volumes
- [ ] Build includes `python3 make g++` for `better-sqlite3`
- [ ] `RMOOZ_BOOTSTRAP_PASSWORD=disabled` to suppress password file
- [ ] `RMOOZ_ALLOW_SIM_RUN=0` to disable WarGamingGEN
- [ ] Verify `server.listen(PORT, '0.0.0.0')` — already correct, no change needed
- [ ] Tile server options (Option A or B from §8.4) decided before this phase

---

### LDAP-AUTH-5 — End-to-end verification

**Test matrix:**

| Test | Expected |
|------|----------|
| `Test-NetConnection 155.140.4.130 -Port 389` from host | `TcpTestSucceeded: True` |
| LDAP TCP test from inside container (§9.2) | `LDAP TCP OK` |
| `POST /api/auth/login` with valid employee number + correct password | `200` + session cookie + `{ employeeNumber, upn, displayName, title }` |
| `POST /api/auth/login` with wrong password | `401 Invalid credentials` |
| `POST /api/auth/login` with unknown employee number | `401 Invalid credentials` (same message — no oracle) |
| `GET /api/auth/me` with valid session | `200` with user object |
| `GET /api/auth/me` with no cookie | `401` |
| `POST /api/auth/logout` | `200`, cookie cleared |
| `POST /api/auth/register` with LDAP backend active | `405` |
| `GET /api/auth/ldap-health` (logged in) | `200 { ldap: "reachable" }` |
| `GET /api/auth/ldap-health` (not logged in) | `401` |
| Browser: open `http://<host>:5006/` → login with employee number | Redirects to `home.html` |
| Browser: `displayName` shown in UI header/chat presence | Correct LDAP display name |

**Playwright verify script:** `verify-ldap-auth.js` — automates the browser test matrix above, output screenshots to `docs/ldap-auth-verify/`.

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `package.json` | Add `ldapjs` dependency | AUTH-1 |
| `.env.example` | Add LDAP block | AUTH-1 |
| `server/auth/ldap-auth.js` | **Create** — LDAP bind + fetch module | AUTH-1 |
| `scripts/test-ldap-bind.js` | **Create** — operator smoke-test tool | AUTH-3 |
| `server/app-data.js` | Modify login + disable register | AUTH-2 |
| `server/app-data.js` | Add `/api/auth/ldap-health` handler | AUTH-3 |
| `Dockerfile` | **Create** | AUTH-4 |
| `docker-compose.yml` | **Create** | AUTH-4 |
| `.dockerignore` | **Create** | AUTH-4 |
| `verify-ldap-auth.js` | **Create** — Playwright E2E | AUTH-5 |

**Files NOT touched:**
- `client/landing-auth.js` — no change needed (login form already sends `{ username, password }`)
- `client/index.html` — no change needed (label update "Employee Number" is optional UX polish)
- `server/web-server.js` — no change needed (port already env-driven, `0.0.0.0` already bound)
- `server/tile-server.js` — separate concern; tile port decision deferred to AUTH-4
- Anything under `TestingAI/` — explicitly out of scope

---

*Audit complete. No files were modified. Proceed to LDAP-AUTH-1 when approved.*
