# LDAP Configuration Guide

This document explains how LDAP authentication works in the RMOOZ offline deployment,
how to configure it, and how to change it for a different Active Directory domain.

---

## Overview

RMOOZ replaces its built-in SQLite username/password system with **Active Directory LDAP
authentication** in the offline deployment. Users authenticate with their existing Windows
domain credentials — no separate RMOOZ account is needed.

---

## How the Login Flow Works

1. The user opens `http://<server>:5006/` — the RMOOZ login page.
2. The user enters their **employee number** (e.g. `s1234567`) and their **Windows/domain
   password**.
3. The user does **NOT** type the domain (e.g. `@sss.dir`) — the app adds it automatically
   using the `LDAP_DOMAIN` environment variable for that deployment.
4. The RMOOZ backend:
   - Sanitises the username (lowercase, strips any accidental `@domain` suffix).
   - Builds the **User Principal Name (UPN)**: `s1234567@<LDAP_DOMAIN>`.
   - Opens a TCP connection to `LDAP_SERVER:LDAP_PORT`.
   - Performs a **simple bind** using the UPN and the user's password.
   - If the bind succeeds, searches for the user's attributes.
   - Creates a server-side session and returns a session cookie.
5. The browser redirects to `home.html`.

**The user's password is never stored anywhere** — it is used only for the LDAP bind and
discarded immediately after.

---

## Environment Variables

All LDAP configuration is driven by environment variables. Change them in `.env.offline`
and restart the container — no code change is needed.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RMOOZ_AUTH_BACKEND` | No | `local` | Set to `ldap` to use LDAP. `local` keeps SQLite auth. |
| `LDAP_SERVER` | **Yes (for LDAP)** | — | IP or hostname of the offline LDAP/AD server at this site. No default — must be set per deployment. |
| `LDAP_PORT` | No | `389` | LDAP port. `389` = plain LDAP. `636` = LDAPS (set `LDAP_USE_SSL=1` too). |
| `LDAP_DOMAIN` | No | `sss.dir` | AD UPN suffix appended to the employee number. Change per site. |
| `LDAP_TIMEOUT` | No | `5` | TCP connect + bind timeout in seconds. |
| `LDAP_USE_SSL` | No | `0` | `0` = plain LDAP. `1` = LDAPS on port 636. |

> **Site-specific values:** `LDAP_SERVER` and `LDAP_DOMAIN` differ at every deployment site.
> Set them in `.env.offline` before starting the container. The same Docker image works
> at any site — no rebuild required.

---

## Offline LDAP Server

Each deployment site must provide an LDAP/Active Directory server reachable from the
RMOOZ Docker container. The server is **not bundled with RMOOZ** — it is an existing
infrastructure component at the site.

**Checklist for the offline LDAP server:**
- Confirm the server IP or hostname (e.g. `10.10.10.5`, `ldap.intranet.local`)
- Confirm the LDAP port (`389` for plain LDAP, `636` for LDAPS)
- Confirm the Active Directory UPN suffix (e.g. `sss.dir`, `corp.example.mil`)
- Confirm at least one test account exists with a known password
- Confirm the container can reach the LDAP server (TCP test below)

**Example configuration for a site with LDAP at `10.10.10.5` and domain `sss.dir`:**

```dotenv
LDAP_SERVER=10.10.10.5
LDAP_PORT=389
LDAP_DOMAIN=sss.dir
```

**To move to a different site** (e.g. a new domain `ops.example.mil` at `192.168.50.10`):

```dotenv
LDAP_SERVER=192.168.50.10
LDAP_PORT=389
LDAP_DOMAIN=ops.example.mil
```

No code change is needed. Restart the container after editing `.env.offline`.

---

## Username Format

| What the user types | What the backend sends to LDAP |
|---------------------|-------------------------------|
| `s1234567` | `s1234567@<LDAP_DOMAIN>` |
| `s1234567@sss.dir` (accidental) | `s1234567@<LDAP_DOMAIN>` (domain stripped then re-added from env) |
| `S1234567` (uppercase) | `s1234567@<LDAP_DOMAIN>` (lowercased automatically) |

The app enforces this format automatically. Users should be told to enter only their
employee number — never `@domain`.

---

## Changing the LDAP Domain

To deploy to a different Active Directory domain (e.g. `example.mil`):

1. Edit `.env.offline`:
   ```
   LDAP_DOMAIN=example.mil
   ```
2. Restart the container:
   ```
   docker compose -f docker-compose.offline.yml restart
   ```

No code change is required. The domain is never hardcoded in any source file.

---

## Attributes Fetched from Active Directory

After a successful bind, RMOOZ searches for the following attributes:

| Priority | LDAP Attribute | Used as | Notes |
|----------|----------------|---------|-------|
| Required | `displayName` | Display name shown in the UI | Fallback to `cn` if absent |
| Required | `title` | Job title | Empty string if absent |
| Required | `sAMAccountName` | Employee number (login key) | Should match what the user typed |
| Optional | `employeeNumber` | Override `sAMAccountName` if present | AD-specific field |
| Future | `department` | Department label | Not returned in API v1 |
| Future | `mail` | Email address | Not returned in API v1 |
| Future | `thumbnailPhoto` | Avatar image | Not returned in API v1 |

---

## Authorization Model

**Current:** Any valid LDAP user can log in. No group check is performed.

All authenticated users receive the `planner` role in RMOOZ.

**Future (not yet implemented):** Group-based authorization using the `memberOf` attribute
could map AD groups to RMOOZ roles (`admin`, `planner`, `viewer`). This is not part of the
current scope.

---

## LDAP Protocol — Security Notes

### Current: Plain LDAP (port 389, no encryption)

The current configuration uses plain LDAP on port 389. The user's password is transmitted
**in plaintext** between the RMOOZ server and the LDAP server on the internal network.

This is acceptable in the current intranet / offline deployment because:
- Both servers are on the same isolated internal network.
- There is no public internet exposure.
- This mirrors the pattern used by other apps in the same environment.

### Future Recommendation: LDAPS or StartTLS

For higher security, the LDAP connection should be encrypted:

| Option | Port | How to enable |
|--------|------|---------------|
| LDAPS (SSL) | 636 | Set `LDAP_PORT=636` and `LDAP_USE_SSL=1` in `.env.offline` |
| StartTLS | 389 | Requires code change (call `client.starttls()` in `ldap-auth.js`) |

Contact the AD team at the deployment site to confirm whether LDAPS on port `636` is
available before enabling `LDAP_USE_SSL=1`.

---

## No Local Fallback in LDAP Mode

When `RMOOZ_AUTH_BACKEND=ldap`:
- The `POST /api/auth/register` endpoint is **disabled** (returns 405).
- The bootstrap `admin` user's SQLite password is irrelevant — LDAP is the only gate.
- If the LDAP server is unreachable, login returns `503 Authentication service unavailable`.
- There is **no local backdoor admin account** by design.

If you need an emergency local login while LDAP is unavailable, set
`RMOOZ_AUTH_BACKEND=local` in `.env.offline` and restart. The bootstrap password
is in `data/BOOTSTRAP_PASSWORD.txt` (if it was generated on first run).

---

## Testing LDAP Configuration

**From the Windows host:**
```powershell
.\scripts\test-ldap-connectivity.ps1
```

**From inside the container:**
```bash
docker compose exec rmooz bash scripts/test-ldap-connectivity.sh
```

**Health endpoint (no session required):**
```bash
curl -s http://localhost:5006/api/auth/ldap-health
# Expected when LDAP is reachable:
#   { "ok": true, "reachable": true, "server": "<LDAP_SERVER>", "port": 389, "latencyMs": ... }
# Expected when LDAP is unreachable:
#   { "ok": false, "reachable": false, "server": "<LDAP_SERVER>", "error": "..." }
```

**Interactive LDAP bind smoke-test (uses the same module as the login route):**

```bash
# Set env vars for this site (or source .env.offline first):
export LDAP_SERVER=<offline-ldap-ip>
export LDAP_DOMAIN=<offline-domain>

# Run from UI_MOdified/:
npm run test:ldap-bind
```

The script prompts for employee number and password interactively.
Password input is fully silent — nothing is echoed, logged, or stored.

```
  Employee number (e.g. s1234567): s1234567
  Will bind as:  s1234567@sss.dir

  Password (input hidden):
  Attempting bind…

  Result        : PASS — bind succeeded
  employeeNumber: s1234567
  displayName   : Ali Hassan
  title         : Senior Engineer
```

Do **not** pass the password as a command-line argument — the script will exit with an
error if you try (`--password=...`, `--pw=...`, etc. are all blocked).

See [`../../docs/integration/ldap-auth-3-interactive-bind-test.md`](../../docs/integration/ldap-auth-3-interactive-bind-test.md)
for full usage, exit codes, and troubleshooting.

```
# Previously shown placeholder (remove if present in older docs):
# node scripts/test-ldap-bind.js
```
