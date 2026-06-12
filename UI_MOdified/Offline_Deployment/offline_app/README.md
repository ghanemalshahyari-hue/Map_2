# offline_app — LDAP overlay for offline Docker deployment

This directory contains **only the files that differ from the main RMOOZ app** for the
offline/LDAP Docker build. It is not a standalone app — it is an overlay applied on top
of the main app source during the Docker image build.

---

## What is in this directory

| Path | Purpose |
|------|---------|
| `server/auth/ldap-auth.js` | LDAP bind + attribute fetch module (ldapjs) |
| `server/app-data.js` | Modified version of main `server/app-data.js` — adds LDAP login branch, schema migration, `/api/auth/config`, `/api/auth/ldap-health`, registration block |
| `client/index.html` | Modified version — adds `#rmooz-ldap-mode-hint` element |
| `client/landing-auth.js` | Modified version — adds `initAuthMode()` and LDAP hint strings |
| `package.json` | Modified version — includes `ldapjs ^3.0.7` and `test:ldap-bind` script |
| `scripts/test-ldap-bind-interactive.js` | Interactive LDAP bind smoke-test tool (operator use only) |
| `test-ldap-auth-1.js` | LDAP module unit tests |
| `test-ldap-auth-2-login-wire.js` | Login wire-up tests (LDAP mode) |
| `test-ldap-auth-3-interactive-script.js` | Interactive bind script verification + regression |

**The main RMOOZ app (`UI_MOdified/`) is NOT modified.** It keeps its original
SQLite-based local login with no LDAP dependency.

---

## How the Docker build works

The `Offline_Deployment/Dockerfile.offline` uses a two-stage copy strategy:

```
1. COPY main app source → /app/          (clean, no LDAP)
2. COPY offline_app/server/ → /app/server/   (overlays LDAP server files)
   COPY offline_app/client/ → /app/client/   (overlays LDAP client files)
   COPY offline_app/package.json → /app/      (includes ldapjs)
3. npm ci --omit=dev                      (installs ldapjs inside container)
```

The result is a Docker image that has the full RMOOZ app plus LDAP authentication.

---

## Running the LDAP tests

From this directory (`Offline_Deployment/offline_app/`):

```bash
# Install dependencies first (requires ldapjs)
npm install

# LDAP module unit tests (no server needed):
LDAP_SERVER=10.0.0.1 LDAP_TIMEOUT=1 node test-ldap-auth-1.js

# Login wire-up tests (start server first):
node ../../server/web-server.js &   # start the LDAP-modified server
node test-ldap-auth-2-login-wire.js

# Interactive bind script tests:
node test-ldap-auth-3-interactive-script.js

# Interactive LDAP bind smoke-test (operator tool):
LDAP_SERVER=<ip> LDAP_DOMAIN=<domain> node scripts/test-ldap-bind-interactive.js
# Or via npm: npm run test:ldap-bind (requires npm install in this directory)
```

> Note: The LDAP-modified server (`server/app-data.js` from this overlay + main
> `server/web-server.js`) must be started from the main app root with
> `RMOOZ_AUTH_BACKEND=ldap` and the appropriate LDAP env vars for the network
> tests to fully pass.

---

## What this directory does NOT contain

- The full client JS library bundle (`lib/`, `vendor/`)
- Static assets (`assets/`)
- Maps or data files
- node_modules (run `npm install` from this directory if needed for local test runs)
- Any credential, password, or secret

---

## Relationship to main app

```
UI_MOdified/                         ← Main app (no LDAP)
  server/app-data.js                 ← Original: local SQLite auth only
  client/index.html                  ← Original: no LDAP hint
  client/landing-auth.js             ← Original: no initAuthMode
  package.json                       ← Original: no ldapjs

Offline_Deployment/offline_app/      ← LDAP overlay (this directory)
  server/app-data.js                 ← Modified: adds LDAP login branch
  client/index.html                  ← Modified: adds LDAP hint element
  client/landing-auth.js             ← Modified: adds initAuthMode
  package.json                       ← Modified: adds ldapjs
```

The Docker image merges both: main app base + offline_app overlay = offline LDAP image.
