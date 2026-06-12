# Troubleshooting — RMOOZ Offline Deployment

Common issues and their solutions. Start with the section that matches your symptom.

---

## 1 — Container cannot reach LDAP server

**Symptom:** Login returns `"Authentication service unavailable"` (503), or the connectivity
test script reports `[FAIL]`.

**Diagnostic — replace `<LDAP_SERVER>` and `<LDAP_PORT>` with your `.env.offline` values:**
```bash
# From inside the container
docker compose exec rmooz node -e "
  const net = require('net');
  const server = process.env.LDAP_SERVER || '<your-ldap-ip>';
  const port   = parseInt(process.env.LDAP_PORT || '389');
  const s = net.createConnection(port, server, () => {
    console.log('OK — TCP connected to', server + ':' + port);
    s.end();
  });
  s.setTimeout(5000, () => { console.error('TIMEOUT'); process.exit(1); });
  s.on('error', e => { console.error('ERROR:', e.message); process.exit(1); });
"
```

**Possible causes and fixes:**

| Cause | Fix |
|-------|-----|
| `LDAP_SERVER` not set or wrong IP/hostname | Confirm `LDAP_SERVER` in `.env.offline` matches the offline site's LDAP server |
| Host firewall blocks port 389 outbound | Allow outbound TCP `LDAP_PORT` on the host firewall |
| Container is on an isolated Docker network | Use `network_mode: host` in docker-compose (last resort) or add correct routing |
| LDAP server is down at the offline site | Contact the AD team to confirm the server is running |
| VPN / split-tunnel on host | Container routes through the host; ensure VPN routes the LDAP subnet |
| Docker Desktop (Windows) NAT issue | Use `host.docker.internal` as `LDAP_SERVER` if LDAP is on the host machine |

**Quick test from host (Windows):**
```powershell
# Replace values with your .env.offline LDAP_SERVER / LDAP_PORT
Test-NetConnection <LDAP_SERVER> -Port 389
```
If this fails, the issue is at the host network level, not Docker.

---

## 2 — Wrong LDAP_DOMAIN

**Symptom:** Login returns `"Invalid credentials"` even though the password is correct.
The LDAP bind is reaching the server but failing with error code `49` (invalidCredentials).

**Diagnostic:**
- Check the server log for: `[ldap-auth] bind failed for s1234567: 49 - invalidCredentials`
- Verify the UPN format: the user's AD account UPN should be `s1234567@<domain>`.

**Fix:**
1. Confirm the correct domain with the AD team.
   Example: it may be `sss.dir`, `sss.local`, `sss.example.com`, or a flat NetBIOS name.
2. Update `.env.offline`:
   ```
   LDAP_DOMAIN=correct.domain.here
   ```
3. Restart the container:
   ```
   docker compose -f docker-compose.offline.yml restart
   ```

**Check:** Try logging in again. If still failing, ask the AD team to confirm the user's
`userPrincipalName` attribute in Active Directory.

---

## 3 — Login fails but network connectivity is confirmed

**Symptom:** The TCP connectivity test passes (port 389 is reachable), but login still
returns `"Invalid credentials"`.

**Possible causes:**

| Cause | Diagnostic | Fix |
|-------|------------|-----|
| Wrong password | Ask the user to reset their Windows password and retry | — |
| Account locked / disabled in AD | Check AD Users & Computers or ask the AD team | Unlock in AD |
| Wrong `LDAP_DOMAIN` | See §2 above | Fix `LDAP_DOMAIN` |
| User's UPN suffix is different | Check the user's `userPrincipalName` in AD | Set `LDAP_DOMAIN` to their actual UPN suffix |
| `RMOOZ_AUTH_BACKEND` not set to `ldap` | Check `.env.offline` | Set `RMOOZ_AUTH_BACKEND=ldap` and restart |

**Server log check:**
```bash
docker compose logs rmooz-offline | grep ldap-auth
```

---

## 4 — displayName is missing or empty

**Symptom:** Login succeeds but the user's name shows as their employee number (e.g.
`s1234567`) instead of their full name.

**Cause:** The `displayName` attribute is empty or not set in Active Directory for that
user, or it is stored under a different attribute name.

**Diagnostic:** Ask the AD team to confirm the attribute name and value for the user in AD.

**Fallback chain in the code:**
1. `displayName` (preferred)
2. `cn` (common name — usually the full name)
3. Username / employee number (last resort)

**Fix:** Ask the AD team to populate `displayName` for the affected user(s) in AD.

---

## 5 — title is missing or empty

**Symptom:** Login succeeds but the user's job title is blank in the UI.

**Cause:** The `title` attribute is not set in Active Directory for that user.

**Fix:** Ask the AD team to populate the `title` attribute for the affected user(s) in AD.
This is an optional attribute and the app functions correctly without it.

---

## 6 — Port 5006 is blocked or unreachable from the browser

**Symptom:** Browser cannot reach `http://<server-ip>:5006/`. Connection refused or timeout.

**Diagnostic:**
```bash
# On the Docker host
netstat -tlnp | grep 5006     # Linux
# or
docker compose ps             # should show "0.0.0.0:5006->5006/tcp"
```

**Possible causes:**

| Cause | Fix |
|-------|-----|
| Container not running | `docker compose up -d` |
| Port mapping wrong in docker-compose | Confirm `ports: - "5006:5006"` in `docker-compose.offline.yml` |
| Host firewall blocks 5006 | Allow inbound TCP 5006 on the host firewall |
| Wrong `PORT` in `.env.offline` | Set `PORT=5006` and restart |
| Browser using HTTPS | Use `http://` not `https://` — the app does not serve TLS |

**Quick test:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5006/
```
Expected: `200`. If you get `connection refused`, the container is not listening.

---

## 7 — Old Node.js server is still running on the host

**Symptom:** Port 5006 (or 8000) is already in use. Docker fails to bind the port, or
the wrong server is responding.

**Diagnostic:**
```bash
# Linux
netstat -tlnp | grep -E "5006|8000"
lsof -i :5006

# Windows PowerShell
netstat -ano | findstr "5006"
```

**Fix (Windows):**
```powershell
# Find the process using port 5006
$proc = (netstat -ano | findstr "5006").Trim().Split()[-1]
# Stop it (replace <PID> with the actual process ID)
Stop-Process -Id <PID> -Force
```

**Fix (Linux):**
```bash
kill $(lsof -ti :5006)
```

---

## 8 — Wrong TestingAI path / WarGamingGEN errors

**Symptom:** Server log shows `RMOOZ_TESTINGAI_DIR` errors or Python path errors at startup.

**Note:** In the offline Docker deployment, `RMOOZ_ALLOW_SIM_RUN` is set to `0` in
`docker-compose.offline.yml`. WarGamingGEN is **disabled** by default in Docker.

**Fix:** Confirm `RMOOZ_ALLOW_SIM_RUN=0` in `.env.offline`. If simulation is genuinely
needed in the Docker environment, the WarGamingGEN Python environment must be available
inside the container — this is a separate and significant engineering task outside the
scope of this offline deployment.

Do not point `RMOOZ_TESTINGAI_DIR` at the Windows host path
(`C:\Users\ADMIN\Desktop\MAP_2\UI_MOdified\TestingAI`). It is not accessible from inside
the Linux container.

---

## 9 — Docker build fails — better-sqlite3 native module

**Symptom:** `npm ci` fails during Docker build with a `node-gyp` error.

**Cause:** `better-sqlite3` requires a C++ compile during `npm install`.

**Fix:** The `Dockerfile.offline` includes `python3`, `make`, `g++` in the build step.
If the build still fails:

1. Confirm the base image is `node:20-slim` (Debian-based, not Alpine).
   - Alpine requires `apk add python3 make g++` instead.
2. Check internet access during build:
   - The `apt-get update` step requires internet access at build time.
   - If building in an air-gapped environment, use a pre-pulled Node image with build
     tools included, or build with a Docker buildx cache.
3. Re-run with verbose output:
   ```bash
   docker build --progress=plain -f Offline_Deployment/Dockerfile.offline -t rmooz-offline:latest .
   ```

---

## 10 — Login page shows "No API at this address (404)"

**Symptom:** After opening `http://<server>:5006/`, attempting to log in shows
`No API at this address (404)`.

**Cause:** The browser is opening the login page from a static file server (e.g. VS Code
Live Server, file://) instead of the RMOOZ Node server. The API routes only exist on
the Node server.

**Fix:** Always access the app via `http://<server>:5006/` — the Node server URL.
Never open `client/index.html` directly from the filesystem.

---

## 11 — Offline LDAP server unreachable from container

**Symptom:** Login returns 503. TCP test from host passes but TCP test from inside the
container fails.

**Cause:** The Docker container's network namespace uses a different routing path from
the host. A firewall rule may allow the host but block the container's bridge address.

**Diagnostics:**
```bash
# Step 1 — Verify LDAP_SERVER is set in the container environment
docker compose exec rmooz printenv | grep LDAP

# Step 2 — TCP test from inside container (Node, always available)
docker compose exec rmooz node -e "
  const net = require('net');
  const s = net.createConnection(
    parseInt(process.env.LDAP_PORT||'389'),
    process.env.LDAP_SERVER,
    () => { console.log('REACHABLE'); s.end(); process.exit(0); }
  );
  s.setTimeout(5000, () => { console.error('TIMEOUT'); process.exit(1); });
  s.on('error', e => { console.error('UNREACHABLE:', e.message); process.exit(1); });
"

# Step 3 — Check the container's default route
docker compose exec rmooz ip route 2>/dev/null || docker compose exec rmooz route -n
```

**Fixes (try in order):**
1. Add the LDAP server subnet to the Docker host's routing table.
2. Use `network_mode: host` in `docker-compose.offline.yml` as a last resort
   (the container shares the host's network namespace — no NAT).
3. Confirm with the site's network team that the host IP is allowed to reach
   `LDAP_SERVER:LDAP_PORT` and that the Docker bridge address is not blocked.

---

## 12 — Wrong offline LDAP_DOMAIN

**Symptom:** Login returns `"Invalid credentials"` immediately with a fast response
(not a timeout), even though the password is definitely correct for another application.

**Cause:** The `LDAP_DOMAIN` in `.env.offline` does not match the Active Directory UPN
suffix for this offline domain. The backend builds `s1234567@<wrong-domain>` and the AD
server rejects the bind.

**Diagnostic:**
- Ask the AD team: "What is the `userPrincipalName` suffix for user `s1234567`?"
- If AD returns `s1234567@corp.internal`, then `LDAP_DOMAIN=corp.internal`.
- Check server logs: `docker compose logs rmooz-offline | grep -i ldap`

**Fix:**
```dotenv
# .env.offline
LDAP_DOMAIN=correct.domain.here
```
Restart the container after the change.

---

## 13 — User exists in AD but UPN format differs

**Symptom:** The user can log into Windows with the same password but RMOOZ returns
`"Invalid credentials"`.

**Cause:** The user's `userPrincipalName` in Active Directory uses a non-standard suffix
(e.g. `s1234567@sss.local` when `LDAP_DOMAIN=sss.dir`), or the account uses a legacy
format (e.g. `sss\s1234567` — NTLM, not UPN).

**Diagnostic:** Ask the AD team to look up the user's exact `userPrincipalName` attribute.

**Fix options:**
- Update `LDAP_DOMAIN` to match the user's UPN suffix (affects all users — confirm with AD team).
- Ask the AD team to set a consistent UPN suffix across all accounts.
- For a single affected user, ask the AD team to change their UPN suffix to match `LDAP_DOMAIN`.

**Note:** RMOOZ uses simple bind with UPN format only. NTLM / Kerberos / SAML are not
supported in this version.

---

## 14 — Login works on Windows host but fails inside the container

**Symptom:** You can verify LDAP credentials manually from the host (e.g. using
`Test-NetConnection` or LDAP browser) but the app inside Docker returns 503 or 401.

**Possible causes:**

| Cause | Diagnostic | Fix |
|-------|------------|-----|
| Container uses different DNS — hostname not resolved | `docker compose exec rmooz nslookup <LDAP_SERVER>` | Use IP address instead of hostname, or add DNS to compose |
| `LDAP_SERVER` env var not loaded into container | `docker compose exec rmooz printenv LDAP_SERVER` | Confirm `--env-file .env.offline` in compose command |
| TLS certificate mismatch (`LDAP_USE_SSL=1`) | Check container logs for TLS error | Disable SSL temporarily (`LDAP_USE_SSL=0`) or add cert to trust store |
| Different clock skew (Kerberos not used here but AD can reject stale requests) | Check container time vs AD server | Sync container time: `docker compose exec rmooz date` |

---

## 15 — Password expired / must change at next login

**Symptom:** Login returns `"Invalid credentials"` (401) even though the credentials
worked before.

**Cause:** Active Directory enforces a password expiry policy. When a password has
expired (or is flagged "must change at next login"), the LDAP simple bind returns error
code `49` (invalidCredentials) even if the typed password was correct at bind time.

**Diagnostic:** The user should be able to tell if their Windows login also fails.

**Fix:** The user must change their Windows/domain password first:
- Log into a domain-joined machine with the old password and change it via Windows.
- Or ask the AD administrator to reset the password and disable "must change at next login".

**Note:** RMOOZ cannot prompt for a new password through the LDAP simple bind protocol.
This is a limitation of simple LDAP authentication.

---

## 16 — AD blocks simple bind on port 389

**Symptom:** Login returns 503 immediately. TCP connects fine (port 389 is open) but
the LDAP bind fails with a policy error rather than invalidCredentials.

**Cause:** Some Active Directory configurations enforce LDAP signing or channel binding
policy, which blocks unauthenticated or unsigned simple-bind operations on port 389.

**Diagnostic:** Server logs will show an LDAP error code other than `49`.

**Fix options (discuss with AD team):**
1. **LDAPS on port 636** — set `LDAP_PORT=636` and `LDAP_USE_SSL=1` in `.env.offline`.
   Requires the AD server to have an SSL certificate configured. Most production AD servers
   support this.
2. **StartTLS on port 389** — requires a code change in `server/auth/ldap-auth.js`
   to call `client.starttls()` before bind. Document this requirement for LDAP-AUTH-3.
3. **AD policy change** — the AD team can relax the signing policy for the offline domain
   controller. Not always possible; depends on site security policy.

---

## Collecting Logs

```bash
# All container logs
docker compose -f Offline_Deployment/docker-compose.offline.yml logs --tail 100

# Follow logs in real time
docker compose -f Offline_Deployment/docker-compose.offline.yml logs -f

# Save logs to file
docker compose -f Offline_Deployment/docker-compose.offline.yml logs > rmooz-debug.log
```

---

## Related Documents

- [`offline-deployment-checklist.md`](offline-deployment-checklist.md) — step-by-step deploy
- [`ldap-configuration-guide.md`](ldap-configuration-guide.md) — LDAP env vars and domain setup
- [`../docs/integration/ldap-offline-auth-0-audit.md`](../docs/integration/ldap-offline-auth-0-audit.md) — full auth audit
