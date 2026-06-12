# Offline Deployment Checklist

This checklist guides a complete offline deployment of RMOOZ on a Docker host with LDAP
authentication. Follow each step in order. Tick each item before moving to the next.

---

## Prerequisites

- [ ] Docker Engine installed on the target host (Docker 24+ recommended)
- [ ] `docker compose` (v2 plugin) available: `docker compose version`
- [ ] `.mbtiles` file(s) for offline tile serving are available (optional — app works without)
- [ ] Host can build the Docker image, OR the pre-built image tar has been loaded:
      ```
      docker load < rmooz-offline.tar
      ```
- [ ] Build machine had internet access for `docker build` (downloads apt, pip, npm packages)

### Ollama / WarGamingGEN — confirm before proceeding (if simulation is needed)

> **Note:** Setting `RMOOZ_OLLAMA_MODEL=qwen2.5:7b` only *selects* the model — it does not
> bundle the weights. The model must already be present in Ollama on the offline machine.
> No API key or password is required for local Ollama.

**On the preparation (online) machine:**

- [ ] Confirm model is available: `ollama list`  — must show `qwen2.5:7b`
- [ ] Record model metadata:
      ```powershell
      .\Offline_Deployment\scripts\export-ollama-model-info.ps1 -Model qwen2.5:7b
      ```
- [ ] Transfer `%USERPROFILE%\.ollama\models\` (Windows) or `~/.ollama/models/` (Linux)
      to the offline machine. See `docs/offline-ollama-model-package-guide.md` for options.

**On the offline machine:**

- [ ] Ollama is installed and running (`ollama serve` or tray app)
- [ ] Model is visible: `ollama list` — must show `qwen2.5:7b`
- [ ] Model responds: `ollama run qwen2.5:7b "Reply with only OK"` — must print `OK`
- [ ] `OLLAMA_HOST` in `.env.offline` points to the running Ollama:
      - Docker Desktop (Windows/Mac): `http://host.docker.internal:11434`
      - Linux without Docker Desktop: `http://172.17.0.1:11434` or host LAN IP

### Build the image (on internet-connected machine)

From `UI_MOdified/`:
```bash
docker compose -f Offline_Deployment/docker-compose.offline.yml \
               --env-file Offline_Deployment/.env.offline.example build
```
Or via script: `.\Offline_Deployment\scripts\build-offline-image.ps1`

- [ ] Build succeeds (no error in final step)
- [ ] `docker images rmooz-offline` shows the image

### Offline LDAP server — confirm before proceeding

- [ ] **LDAP server IP or hostname** confirmed with the site AD team
      (e.g. `10.10.10.5`, `ldap.intranet.local`)
- [ ] **LDAP port** confirmed — `389` (plain LDAP) or `636` (LDAPS)
- [ ] **AD domain suffix (UPN suffix)** confirmed — this becomes `LDAP_DOMAIN`
      (e.g. `sss.dir`, `corp.example.mil`)
- [ ] **Test account** exists with a known password (the tester knows it; it is NOT
      stored in any file or documented anywhere)
- [ ] Docker container can reach `LDAP_SERVER:LDAP_PORT` — confirm after container start
      (see Step 7)
- [ ] The target host is on the same network segment as the LDAP server

---

## Step 1 — Prepare the environment file

1. Navigate to the `Offline_Deployment` directory:
   ```
   cd UI_MOdified/Offline_Deployment
   ```

2. Copy the example env file:
   ```
   cp .env.offline.example .env.offline
   ```

3. Edit `.env.offline`:
   - [ ] Set `LDAP_SERVER` to the **offline LDAP server** for this site (no default — required)
   - [ ] Set `LDAP_PORT` to `389` (plain) or `636` (LDAPS) as confirmed with AD team
   - [ ] Set `LDAP_DOMAIN` to the correct AD UPN suffix for this site
   - [ ] Replace `SESSION_SECRET` with a strong random value:
         ```
         node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
         ```
   - [ ] Set `OFFLINE_TILES=1` (already the default)
   - [ ] Leave `TILE_URL` blank for local tile serving
   - [ ] **Do NOT** add any password to this file

> **Security note:** `.env.offline` contains `SESSION_SECRET`. Never commit it to version
> control. No user password or LDAP bind credential belongs in this file.

---

## Step 2 — Place offline tile files

- [ ] Copy `.mbtiles` file(s) into the `maps/` directory (project root: `UI_MOdified/maps/`).
- [ ] The tile server reads all `.mbtiles` files in that directory at startup.
- [ ] If using a Docker volume, copy the files into the volume after first start:
      ```
      docker compose -f docker-compose.offline.yml cp ../maps/<file>.mbtiles rmooz:/app/maps/
      ```

---

## Step 3 — Test host → LDAP connectivity

Before building the image, confirm the host can reach the LDAP server:

**Windows host:**
```powershell
# Uses LDAP_SERVER and LDAP_PORT from .env.offline, or pass directly:
.\scripts\test-ldap-connectivity.ps1 -LdapServer <your-ldap-ip> -LdapPort 389
```
Expected: `[PASS] TCP connection to <LDAP_SERVER>:389 succeeded.`

**Linux host:**
```bash
LDAP_SERVER=<your-ldap-ip> LDAP_PORT=389 bash scripts/test-ldap-connectivity.sh
```

- [ ] LDAP connectivity confirmed from the host (TCP test passes)
- [ ] The LDAP IP and port match what is in `.env.offline`

If this fails, do NOT proceed. Fix the network route or firewall rule first.
See [`troubleshooting.md`](troubleshooting.md) §1 "Container cannot reach LDAP".

---

## Step 3B — Verify LDAP bind from the host (recommended)

Run the interactive bind smoke-test before building the Docker image. This confirms that
a real user credential can authenticate against the offline LDAP server using the same
logic as the RMOOZ login route.

> **Password rule:** The test asks for a password interactively. The password is never
> stored, echoed, or logged. Type it once at the prompt — it goes nowhere else.

```bash
# From UI_MOdified/ — LDAP env vars must be set (set them or source .env.offline):
export LDAP_SERVER=<your-ldap-ip>
export LDAP_DOMAIN=<your-domain>
npm run test:ldap-bind
```

Follow the prompts:
1. Type the employee number of a known test account (e.g. `s1234567`).
2. Type the account's Windows/domain password at the hidden prompt.

Expected on success:
```
  Result        : PASS — bind succeeded
  employeeNumber: s1234567
  displayName   : <name from AD>
  title         : <title from AD>
```

- [ ] Bind test returns `PASS`
- [ ] `displayName` and `title` are populated (confirms AD attributes are set)
- [ ] Operator confirms the test account password is known only to them — not stored anywhere

If the bind test fails, diagnose with:
- Reason `invalid_credentials` → wrong `LDAP_DOMAIN` or wrong password — see §12/§13 in troubleshooting
- Reason `network_error` → LDAP server not reachable — repeat Step 3 tests

---

## Step 4 — Build the Docker image

From the `UI_MOdified/` directory (the build context):

```bash
docker compose -f Offline_Deployment/docker-compose.offline.yml build
```

Or with explicit tag:
```bash
docker build -f Offline_Deployment/Dockerfile.offline -t rmooz-offline:latest .
```

- [ ] Build completes without errors
- [ ] `better-sqlite3` native binding compiled successfully (look for `node-gyp` output)
- [ ] Image size is reasonable (~300–500 MB including node_modules)

---

## Step 5 — Start the container

```bash
docker compose -f Offline_Deployment/docker-compose.offline.yml --env-file Offline_Deployment/.env.offline up -d
```

- [ ] Container starts: `docker compose ps` shows `rmooz-offline` as `running`
- [ ] No crash-loop: `docker compose logs rmooz-offline --tail 30`
- [ ] Server log shows: `Web server running at http://127.0.0.1:5006`

---

## Step 6 — Test app on port 5006

From the host browser or curl:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5006/
```
Expected: `200` (login page HTML)

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5006/api/auth/me
```
Expected: `401` (unauthenticated — correct)

- [ ] App is accessible on port 5006
- [ ] Login page loads in browser at `http://<server-ip>:5006/`

---

## Step 7 — Test LDAP connectivity from inside the container

```bash
docker compose -f Offline_Deployment/docker-compose.offline.yml exec rmooz \
  bash /path/to/scripts/test-ldap-connectivity.sh
```

Or use the full container network self-test:
```bash
docker compose exec rmooz bash scripts/test-container-network.sh
```

- [ ] `[PASS] TCP connected to LDAP server <LDAP_SERVER>:<LDAP_PORT>`
- [ ] `[PASS] App server listening on 127.0.0.1:5006`
- [ ] `[PASS] GET /api/auth/me → 401`

---

## Step 8 — Test login with employee number

> **LDAP-AUTH-2 is complete.** The login route is wired to LDAP when
> `RMOOZ_AUTH_BACKEND=ldap`. Use a real test account for this step.

1. Open `http://<server-ip>:5006/` in a browser.
2. Enter **employee number only** (e.g. `s1234567`) — no `@domain` suffix.
3. Enter the **Windows/domain password** for that account.
   - This password is known only to the tester.
   - It is not stored anywhere in the deployment.
4. Click Login.

- [ ] The login hint "Use your domain account number" is visible on the page
- [ ] Login succeeds (no "Invalid credentials" error)
- [ ] Browser redirects to `home.html`
- [ ] The displayed name matches the user's Active Directory `displayName`

---

## Step 9 — Verify displayName and title

After login, confirm the LDAP attributes are returned correctly:

```bash
# With a valid session cookie from step 8:
curl -s -b "rmooz_session=<sid>" http://localhost:5006/api/auth/me
```

Expected response fields:
```json
{
  "employeeNumber": "s1234567",
  "upn": "s1234567@<LDAP_DOMAIN>",
  "displayName": "<name from Active Directory>",
  "title": "<title from Active Directory>",
  "authBackend": "ldap"
}
```

- [ ] `displayName` is the user's full name from AD
- [ ] `title` is the user's job title from AD (empty string is acceptable if unset in AD)
- [ ] `employeeNumber` matches what was typed
- [ ] `authBackend` is `"ldap"`
- [ ] Response does NOT contain a `password` field

---

## Step 10 — Verify offline tiles

1. In the browser, open the map view.
2. Pan and zoom around the map area.
3. Confirm tiles load without any requests to an external tile provider.

Check container network logs:
```bash
docker compose exec rmooz node -e "require('http').get('http://127.0.0.1:8080/services/', r => console.log(r.statusCode)).on('error', e => console.error(e.message))"
```

- [ ] Map tiles load from local `.mbtiles` files
- [ ] No requests to `tile.openstreetmap.org` or any public CDN (check browser DevTools Network)

---

## Step 11 — Verify no external internet dependency

With the container running and the host network set to offline / disconnected from the
internet (while keeping the LDAP route active):

- [ ] App login page loads
- [ ] LDAP authentication works
- [ ] Map tiles load
- [ ] No JavaScript console errors about failed CDN loads (all JS/CSS must be vendored locally)
- [ ] AI features fail gracefully with a clear message (expected when `ANTHROPIC_API_KEY` is unset)

---

## Completed

- [ ] All steps above checked
- [ ] `.env.offline` backed up securely (it contains `SESSION_SECRET`)
- [ ] `data/BOOTSTRAP_PASSWORD.txt` confirmed absent (should not exist in LDAP mode)
- [ ] Deployment documented in your operations log

---

*See [`troubleshooting.md`](troubleshooting.md) if any step fails.*
