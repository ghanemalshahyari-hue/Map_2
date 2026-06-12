# RMOOZ — Offline Deployment

This folder contains all assets required to deploy RMOOZ in an offline (air-gapped / intranet)
environment using Docker.

---

## Purpose

This folder is for **packaging and deployment only**. It does not replace or modify the main
application source tree (`UI_MOdified/`). All original app files remain untouched.

---

## ⚠ Architecture — main app is untouched

> **LDAP code lives only inside `Offline_Deployment/offline_app/` — the main RMOOZ app
> is never modified for LDAP.**
>
> The normal app (`UI_MOdified/`) runs with its original SQLite local login. It can be
> tested and developed without any LDAP dependency or env vars.
>
> The Docker image for the offline deployment is built by overlaying the LDAP files
> from `offline_app/` on top of the clean main app source:
>
> ```
> Main app (clean)  +  offline_app/ overlay  =  Docker image with LDAP
> ```
>
> See [`offline_app/README.md`](offline_app/README.md) for the overlay details.
> See [`test-offline-isolation-0.js`](../test-offline-isolation-0.js) to verify the isolation.

---

## ⚠ Scope warning — read before deploying

> **Offline image is not only the RMOOZ Node app.**
>
> A complete offline deployment must also address:
>
> | Component | Status | Notes |
> |-----------|--------|-------|
> | LDAP authentication | Ready | Configure `LDAP_SERVER` / `LDAP_DOMAIN` per site |
> | Offline map tiles (MBTiles) | Ready | Operator must supply `.mbtiles` files in the maps volume |
> | Google Fonts (`app.html`) | **Fixed in offline_app** ✅ | CDN removed in `offline_app/client/app.html` only; main app keeps CDN (online mode) |
| Map tiles | **Configurable** | No local tiles required to start; set `FALLBACK_TILE_URL` for internal tile server, or leave blank for "unavailable" message |
> | WarGamingGEN + Python 3.11 | Conditional | Disabled by default (`RMOOZ_ALLOW_SIM_RUN=0`); requires Python venv and LLM service if enabled |
> | Local LLM inference (Ollama) | Conditional | Required only when `RMOOZ_ALLOW_SIM_RUN=1`; runs on host or Compose sidecar |
> | Qdrant vector DB | Optional | SmartSearch doctrine retrieval; Markdown fallback exists; not required for Phase 1 |
>
> The Dockerfile in this folder covers the **Node app + LDAP + tiles** layer only.
> See [`docs/integration/offline-image-0-runtime-inventory-and-packaging-plan.md`](../docs/integration/offline-image-0-runtime-inventory-and-packaging-plan.md)
> for the full runtime inventory and multi-phase packaging plan.

---

## What is in this folder

| File / Directory | Purpose |
|-----------------|---------|
| `.env.offline.example` | Environment variable template — copy to `.env.offline` and fill in |
| `Dockerfile.offline` | Docker image build file for the RMOOZ web server |
| `docker-compose.offline.yml` | Compose file for single-host offline deployment |
| `scripts/` | Connectivity + LDAP bind smoke-test scripts (host and container side) |
| `docs/` | Step-by-step deployment checklist, LDAP guide, and troubleshooting |

---

## Target Configuration

| Property | Value |
|----------|-------|
| App port | **5006** |
| Auth backend | LDAP (configurable via `LDAP_SERVER`, `LDAP_DOMAIN`) |
| Offline tiles | Enabled via `OFFLINE_TILES=1` and mounted `.mbtiles` files |
| Internet dependency | **None** — all dependencies resolved at image build time |
| LDAP dependency | Internal network only — `LDAP_SERVER` must be reachable from the container |

---

## Quick Start

1. Copy the environment template:
   ```
   cp .env.offline.example .env.offline
   ```

2. Edit `.env.offline` — set `LDAP_DOMAIN`, `SESSION_SECRET`, and tile paths.

3. Build and start:
   ```
   docker compose -f docker-compose.offline.yml --env-file .env.offline up -d
   ```

4. Open the app:
   ```
   http://<server-ip>:5006/
   ```

5. Log in with your employee number (e.g. `s1234567`) and your Windows/domain password.

See [`docs/offline-deployment-checklist.md`](docs/offline-deployment-checklist.md) for the full
step-by-step procedure.

### Verify LDAP before deploying

Before building the Docker image, confirm that user credentials can actually bind to the
offline LDAP server:

```bash
# From UI_MOdified/ — set env vars first (or source .env.offline):
export LDAP_SERVER=<offline-ldap-ip>
export LDAP_DOMAIN=<offline-domain>
npm run test:ldap-bind
# → prompts for employee number and password interactively
# → password is never echoed or stored
```

The tool uses the same LDAP module as the login route, so a PASS here means login
will also work once the container is running.

---

## LDAP Authentication

Users enter their **employee number only** (e.g. `s1234567`). The backend appends
`@LDAP_DOMAIN` automatically — the user does not type the domain. The password is the
standard Windows/domain password.

The domain is **not hardcoded**. Change `LDAP_DOMAIN` in `.env.offline` if the
deployment moves to a different Active Directory domain.

See [`docs/ldap-configuration-guide.md`](docs/ldap-configuration-guide.md) for details.

---

## Map Source Configuration

RMOOZ offline deployment supports three map source modes — **no local tiles are required
to start**:

| Mode | What happens |
|------|-------------|
| Local tiles present in `map_data/` | Map loads from local tile package |
| No local tiles + `FALLBACK_TILE_URL` set | Map loads from internal site tile server |
| Neither configured | App starts; map area shows "map unavailable" |

**Important:** `FALLBACK_TILE_URL` must be an **internal network** URL. Do not use
public tile services (OSM, Google, etc.) — that defeats the purpose of offline deployment.

Key environment variables:
```dotenv
MAP_SOURCE_MODE=auto        # auto | local | fallback
FALLBACK_TILE_URL=http://<internal-server>/tiles/{z}/{x}/{y}.png
MAP_FALLBACK_ENABLED=1      # 0 to disable fallback entirely
```

See [`docs/offline-map-data-guide.md`](docs/offline-map-data-guide.md) for full details.

---

## Current image status (OFFLINE-IMAGE-1B)

The Docker image `rmooz-offline:latest` is built and verified:

| Check | Status |
|-------|--------|
| Image builds (`docker compose build`) | ✅ |
| Container starts, port 5006 responds | ✅ |
| `GET /` → 200 (login page) | ✅ |
| `GET /api/auth/me` → 401 (unauthenticated) | ✅ |
| `GET /api/auth/ldap-health` → 200 (reachable: false) | ✅ confirmed from inside container |
| Python at `/opt/rmooz-venv/bin/python` | ✅ |
| `/app/TestingAI/WarGamingGEN/src` exists | ✅ |
| `/app/offline_map_data` exists | ✅ |
| `GET /api/offline/map-config` | ⏳ 404 until `offline_app/server/web-server.js` is wired |

**Restart Docker Desktop from the Windows GUI if the Docker daemon crashes.**

---

## Offline Tiles (legacy MBTiles)

Place `.mbtiles` files in the `maps/` directory (relative to the project root, or set
`RMOOZ_MAPS_DIR` in `.env.offline`). The tile server reads them at startup.

No internet connection is required for map tile serving once the `.mbtiles` files are present.

---

## What this folder does NOT contain

- No application source code modifications.
- No LDAP implementation (that lives in `server/auth/ldap-auth.js` once built).
- No scenario or simulation files.
- No TestingAI / WarGamingGEN configuration.

---

## Related

- Audit: [`docs/integration/ldap-offline-auth-0-audit.md`](../docs/integration/ldap-offline-auth-0-audit.md)
- App entry point: [`server/web-server.js`](../server/web-server.js)
- Environment template (main): [`.env.example`](../.env.example)
- **Upgrading over an old install (clear stale mounted host dirt):**
  [`docs/host-cleanup-on-upgrade.md`](docs/host-cleanup-on-upgrade.md)
- Troubleshooting: [`docs/troubleshooting.md`](docs/troubleshooting.md)
