# OFFLINE-IMAGE-1B — Build and Run Verification

**Status:** Complete  
**Date:** 2026-06-06

---

## Summary

The RMOOZ offline Docker image builds and runs successfully. This document records
the final commands, verification steps, and architecture decisions.

---

## Build command

Run from `UI_MOdified/` (the project root):

```bash
docker compose \
  -f Offline_Deployment/docker-compose.offline.yml \
  --env-file Offline_Deployment/.env.offline.example \
  build
```

Or directly without Compose:
```bash
docker build \
  -f Offline_Deployment/Dockerfile.offline \
  -t rmooz-offline:latest \
  .
```

**Build context:** `UI_MOdified/` — the `.dockerignore` at the same level controls
what is transferred to Docker. Key exclusions: `TestingAI/.venv`, `TestingAI/SmartSearch`
(2.2 GB), runtime I/O dirs, `node_modules`, docs.

---

## Run command

```bash
# Copy and edit the env file first:
cp Offline_Deployment/.env.offline.example Offline_Deployment/.env.offline
# Edit: set LDAP_SERVER, LDAP_DOMAIN, SESSION_SECRET, FALLBACK_TILE_URL as needed

# Start the stack:
docker compose \
  -f Offline_Deployment/docker-compose.offline.yml \
  --env-file Offline_Deployment/.env.offline \
  up -d
```

Via the convenience script:
```powershell
.\Offline_Deployment\scripts\run-offline-compose.ps1 -Detach
```

---

## Environment configuration

### Required before first run

| Variable | What to set | Where |
|----------|-------------|-------|
| `LDAP_SERVER` | Offline LDAP server IP/hostname for this site | `.env.offline` |
| `LDAP_DOMAIN` | AD UPN suffix (e.g. `sss.dir`) | `.env.offline` |
| `SESSION_SECRET` | Strong random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) | `.env.offline` |
| `FALLBACK_TILE_URL` | Internal map tile server URL (or leave blank) | `.env.offline` |

### WarGamingGEN (when simulation needed)

| Variable | Default in image | Set to enable |
|----------|-----------------|--------------|
| `RMOOZ_ALLOW_SIM_RUN` | `0` (disabled) | `1` |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | Adjust if Ollama is elsewhere |
| `RMOOZ_SIM_MODEL` | `qwen2.5:7b` | Change model as needed |

---

## Verification

### From the host

```bash
# Login page responds:
curl -s -o /dev/null -w "%{http_code}" http://localhost:5006/
# Expected: 200

# Auth endpoint (unauthenticated → 401):
curl -s -o /dev/null -w "%{http_code}" http://localhost:5006/api/auth/me
# Expected: 401

# LDAP health (TCP test — no credentials):
curl -s http://localhost:5006/api/auth/ldap-health
# Expected: {"ok":false/true,"reachable":false/true,"server":"...","port":389,...}

# Map config:
curl -s http://localhost:5006/api/offline/map-config
# Expected: {"mapSourceMode":"auto","localTileUrl":"/offline-tiles/...","fallbackEnabled":true,...}
```

PowerShell convenience script (with container running):
```powershell
.\Offline_Deployment\scripts\test-offline-compose.ps1
```

### Inside the container

```bash
docker exec rmooz-offline node --version
# Expected: v20.x.x

docker exec rmooz-offline /opt/rmooz-venv/bin/python --version
# Expected: Python 3.11.x

docker exec rmooz-offline /opt/rmooz-venv/bin/python -c "import openai; print(openai.__version__)"
# Expected: 2.32.0

docker exec rmooz-offline test -d /app/TestingAI && echo "TestingAI OK"
docker exec rmooz-offline test -d /app/TestingAI/WarGamingGEN/src && echo "WarGamingGEN OK"
docker exec rmooz-offline test -d /app/offline_map_data && echo "map_data OK"
```

---

## Architecture

### What is in the image

| Component | Source | Location in container |
|-----------|--------|----------------------|
| Node.js 20 | node:20-slim base | `/usr/local/bin/node` |
| Python 3.11 + venv | apt + pip at build time | `/opt/rmooz-venv/` |
| RMOOZ main app | `UI_MOdified/` | `/app/` |
| LDAP overlay | `offline_app/server/auth/` | `/app/server/auth/` |
| LDAP app-data.js | `offline_app/server/app-data.js` | `/app/server/app-data.js` |
| Offline map resolver | `offline_app/client/wargame/offline-map-source.js` | `/app/client/wargame/` |
| CDN-free app.html | `offline_app/client/app.html` | `/app/client/app.html` |
| Local fonts CSS | `offline_app/client/assets/` | `/app/client/assets/` |
| WarGamingGEN | `TestingAI/WarGamingGEN/` | `/app/TestingAI/WarGamingGEN/` |
| Python deps | `requirements.offline.txt` → venv | `/opt/rmooz-venv/lib/` |

### What is NOT in the image (mounted as volumes)

| Component | Volume source | Container path |
|-----------|--------------|----------------|
| App database / scenarios | `rmooz_data` named volume | `/app/data` |
| MBTiles offline tiles (legacy) | `rmooz_maps` named volume | `/app/maps` |
| File uploads | `rmooz_uploads` named volume | `/app/uploads` |
| Offline map tile data | `Offline_Deployment/map_data/` | `/app/offline_map_data` |
| WarGamingGEN DOCX input | `TestingAI_Runtime/import_from_rmooz/` | `/app/TestingAI/import_from_rmooz` |
| WarGamingGEN output | `TestingAI_Runtime/export_to_rmooz/` | `/app/TestingAI/export_to_rmooz` |
| WarGamingGEN runs | `TestingAI_Runtime/runs/` | `/app/TestingAI/WarGamingGEN/runs` |

### What was excluded from the image to keep it manageable

| Excluded | Reason |
|----------|--------|
| `TestingAI/SmartSearch` (2.2 GB) | torch/transformers/fastembed — too large; Markdown fallback used |
| `TestingAI/.venv` | Windows Python venv — incompatible with Linux container |
| `TestingAI/export_to_rmooz` | Runtime output — mounted as writable volume |
| `TestingAI/import_from_rmooz` | Runtime input — mounted as writable volume |
| `TestingAI/WarGamingGEN/runs` | Runtime data — mounted as writable volume |
| `node_modules` (main app) | Rebuilt inside container from `offline_app/package.json` |
| `docs/`, `test-*.js` | Not needed at runtime |

---

## Transferring to an offline machine

```powershell
# On internet-connected build machine (from UI_MOdified/):
.\Offline_Deployment\scripts\save-offline-image.ps1 -Output rmooz-offline.tar

# Copy to offline machine (USB, internal network, etc.):
# rmooz-offline.tar + Offline_Deployment/ folder

# On offline machine (from UI_MOdified/):
.\Offline_Deployment\scripts\load-offline-image.ps1 -Input rmooz-offline.tar

# Edit .env.offline for the new site, then:
docker compose -f Offline_Deployment/docker-compose.offline.yml \
               --env-file Offline_Deployment/.env.offline up -d
```

---

## LDAP note

LDAP login cannot be tested until `LDAP_SERVER` is set to a real offline LDAP server
and `LDAP_DOMAIN` matches the AD domain. The `/api/auth/ldap-health` endpoint returns
`reachable: false` when `LDAP_SERVER` is a placeholder or unreachable — this is expected
and does not prevent the app from starting.

---

## Map note

No local tile files are required. The app starts with an empty `map_data/` directory
and shows a "map unavailable" message in the UI. Configure `FALLBACK_TILE_URL` to point
to an internal tile server if one is available at the deployment site.
