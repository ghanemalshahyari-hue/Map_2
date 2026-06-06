# Offline Image Transfer Checklist

This checklist guides saving the Docker image on the build machine and loading it
on the offline deployment machine — with no internet required on the target.

---

## On the build (internet-connected) machine

### 1 — Build the image

From `UI_MOdified/`:
```powershell
docker compose -f Offline_Deployment/docker-compose.offline.yml `
               --env-file Offline_Deployment/.env.offline.example build
```
- [ ] Build succeeds — no error in final step
- [ ] `docker images rmooz-offline` shows the image

### 2 — Export model metadata (optional but recommended)

```powershell
.\Offline_Deployment\scripts\export-ollama-model-info.ps1 -Model qwen2.5:7b
```
- [ ] `Offline_Deployment/ollama_model_info/model-list.txt` written
- [ ] `qwen2.5:7b` appears in the list

### 3 — Save the image tar

```powershell
.\Offline_Deployment\scripts\save-offline-image.ps1
```
- [ ] `Offline_Deployment/dist/rmooz-offline.tar` created
- [ ] Size is reasonable (check: `(Get-Item Offline_Deployment/dist/rmooz-offline.tar).Length / 1GB` GB)

### 4 — Prepare the transfer package

Copy the following to a USB drive, internal file share, or secure transfer medium:

| Item | Path | Required? |
|------|------|-----------|
| Docker image | `Offline_Deployment/dist/rmooz-offline.tar` | **Yes** |
| Compose file | `Offline_Deployment/docker-compose.offline.yml` | **Yes** |
| Env template | `Offline_Deployment/.env.offline.example` | **Yes** |
| Load script | `Offline_Deployment/scripts/load-offline-image.ps1` | **Yes** |
| Run script | `Offline_Deployment/scripts/run-offline-compose.ps1` | Recommended |
| Map data | `Offline_Deployment/map_data/` | If tiles available |
| Runtime dirs | `Offline_Deployment/TestingAI_Runtime/` | Yes (for WarGamingGEN) |
| Docs | `Offline_Deployment/docs/` | Recommended |
| Ollama model | `%USERPROFILE%\.ollama\models\` or `.tar.gz` export | If WarGamingGEN needed |

**Do NOT copy** (security / size):
- `Offline_Deployment/.env.offline` (contains site SESSION_SECRET)
- `node_modules/`
- `.git/`

### 5 — Transfer Ollama model (if WarGamingGEN needed)

```powershell
# Windows — archive model blobs and manifests
$src = "$env:USERPROFILE\.ollama"
& 7z a ollama-qwen2.5-7b.7z "$src\models\blobs" "$src\models\manifests"
```
- [ ] Ollama model archive created and included in transfer

---

## On the offline (target) machine

### 1 — Prerequisites

- [ ] Docker Engine installed (`docker --version`)
- [ ] `docker compose` v2 available (`docker compose version`)
- [ ] Ollama installed (if simulation needed): `ollama --version`

### 2 — Load the Docker image

```powershell
.\Offline_Deployment\scripts\load-offline-image.ps1
```
- [ ] Image loaded: `docker images rmooz-offline` shows the image

### 3 — Load Ollama model (if WarGamingGEN needed)

```powershell
# Extract the transferred archive
7z x ollama-qwen2.5-7b.7z -o"$env:USERPROFILE\.ollama" -y

# Verify
ollama list
# Must show: qwen2.5:7b

# Smoke test
ollama run qwen2.5:7b "reply with only OK"
# Expected: OK
```
- [ ] `ollama list` shows `qwen2.5:7b`
- [ ] `ollama run` responds correctly

### 4 — Configure the environment

```powershell
cp Offline_Deployment/.env.offline.example Offline_Deployment/.env.offline
# Edit the file:
```

Required settings for this site:
- [ ] `LDAP_SERVER=<offline-ldap-ip>` — set to site LDAP server
- [ ] `LDAP_DOMAIN=<offline-domain>` — set to site AD domain
- [ ] `SESSION_SECRET=<random-hex>` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Verify LDAP before starting:
```powershell
.\Offline_Deployment\scripts\test-ldap-connectivity.ps1 -LdapServer <ldap-ip> -LdapPort 389
```
- [ ] LDAP connectivity confirmed

### 5 — Test LDAP bind (operator verification)

```powershell
LDAP_SERVER=<ip> LDAP_DOMAIN=<domain> node scripts/test-ldap-bind-interactive.js
# (from UI_MOdified/ if Node.js is available on the machine)
```
- [ ] Bind test PASS

### 6 — Start the container

```powershell
docker compose `
  -f Offline_Deployment/docker-compose.offline.yml `
  --env-file Offline_Deployment/.env.offline `
  up -d
```
- [ ] Container starts: `docker ps` shows `rmooz-offline` as `running`
- [ ] No crash loop in logs: `docker logs rmooz-offline --tail 20`

### 7 — Verify all endpoints

```powershell
# Login page (must be 200)
Invoke-WebRequest http://localhost:5006/ -UseBasicParsing | Select-Object StatusCode

# Auth check (must be 401 — unauthenticated)
Invoke-WebRequest http://localhost:5006/api/auth/me -UseBasicParsing | Select-Object StatusCode

# LDAP health (must be 200, reachable: false is OK if LDAP_SERVER placeholder)
Invoke-WebRequest http://localhost:5006/api/auth/ldap-health -UseBasicParsing | Select-Object Content

# Map config (must be 200)
Invoke-WebRequest http://localhost:5006/api/offline/map-config -UseBasicParsing | Select-Object Content
```
- [ ] `GET /` → 200
- [ ] `GET /api/auth/me` → 401
- [ ] `GET /api/auth/ldap-health` → 200
- [ ] `GET /api/offline/map-config` → 200

### 8 — Verify container internals

```powershell
# Python venv
docker exec rmooz-offline /opt/rmooz-venv/bin/python --version
# Expected: Python 3.11.x

# Python can import WarGamingGEN deps
docker exec rmooz-offline /opt/rmooz-venv/bin/python -c "import openai; print(openai.__version__)"

# TestingAI present
docker exec rmooz-offline sh -c "test -d /app/TestingAI/WarGamingGEN/src && echo OK"

# Offline map data mount
docker exec rmooz-offline sh -c "test -d /app/offline_map_data && echo OK"

# No runtime npm/pip (confirms no internet required at startup)
docker exec rmooz-offline sh -c "! pgrep npm >/dev/null && echo 'npm not running'"
docker exec rmooz-offline sh -c "! pgrep pip >/dev/null && echo 'pip not running'"
```
- [ ] Python 3.11 available
- [ ] openai importable
- [ ] TestingAI/WarGamingGEN present
- [ ] offline_map_data exists
- [ ] No runtime npm/pip

### 9 — Login test

Open `http://<server-ip>:5006/` in a browser.

- [ ] Login page renders with Arabic/English text
- [ ] No "Use domain account number" hint visible until `LDAP_DOMAIN` is set
- [ ] Login with employee number works after real `LDAP_SERVER` is set in `.env.offline`

### 10 — Completed

- [ ] All checks above passed
- [ ] `.env.offline` backed up securely (contains SESSION_SECRET)
- [ ] Deployment recorded in the operations log

---

## Troubleshooting

See `Offline_Deployment/docs/troubleshooting.md` for all common issues.

- LDAP unreachable: §11 in troubleshooting
- Wrong domain: §12
- UPN mismatch: §13
- Port 5006 blocked: §6
- `api/offline/map-config` returns 404: rebuild image (Dockerfile must copy offline_app/server/web-server.js)
