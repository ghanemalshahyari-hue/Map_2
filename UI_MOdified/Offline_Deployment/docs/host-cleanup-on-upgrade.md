# Host cleanup when deploying a NEW bundle over an OLD install

## Why this exists

The offline image is **clean** (no real endpoint, org name, deployment IP, API key, or
Windows dev path is baked in). But the compose file **bind-mounts several host
directories** into the container:

| Host path (under `Offline_Deployment/`) | Container path | Carries operator data? |
|---|---|---|
| `certs/`                              | `/app/certs`                         | CA / client certs + a README |
| `TestingAI_Runtime/runs/`             | `/app/TestingAI/WarGamingGEN/runs`   | per-run checkpoints + logs |
| `TestingAI_Runtime/export_to_rmooz/`  | `/app/TestingAI/export_to_rmooz`     | generated GeoJSON staging |
| `TestingAI_Runtime/import_from_rmooz/`| `/app/TestingAI/import_from_rmooz`   | uploaded DOCX staging |
| `data_runtime/`                       | `/app/data`                          | **scenarios + journal + users (KEEP)** |
| `map_data/`                           | `/app/maps`, `/app/dem_data`, …      | **satellite tiles + DEM (KEEP)** |

When you copy a **new** bundle over an install that was first set up from an **older**
bundle, these mounted host folders are **not** replaced by the new image. So a security
scan **inside the running container** can still surface stale strings that live on the
host, even though the image itself is clean — e.g.:

- `/app/certs/README.md` — an **old** copy of the cert README (old CA filename / host
  example / server IP) left from a previous bundle.
- `/app/TestingAI/WarGamingGEN/runs/<old-run>/error.log` — a stale generation log that
  recorded the real LiteLLM endpoint during an earlier failed run.

The fix is a **host-side cleanup**, run once on the deployment server before (or right
after) `docker compose up`. It refreshes the stale mounted files **without touching any
operator secret or data**.

---

## What is PRESERVED (never deleted by this cleanup)

- `Offline_Deployment/.env.offline` — operator secrets / endpoint config
- `Offline_Deployment/certs/*.crt`, `*.pem`, `*.key` — the real CA + optional client cert
- `Offline_Deployment/map_data/**` — satellite MBTiles + DEM (large, hard to re-stage)
- `Offline_Deployment/data_runtime/**` — scenarios, journal, users, SQLite

## What is REFRESHED / CLEARED (stale, safe to remove)

- `Offline_Deployment/certs/README.md` — replaced with the clean copy shipped in the new bundle
- `Offline_Deployment/TestingAI_Runtime/runs/*` — old generation runs (resumable
  checkpoints + the stale `error.log`). Clearing these only loses the ability to *resume*
  an old run; finished scenarios already live in `data_runtime/scenarios`.
- `Offline_Deployment/TestingAI_Runtime/export_to_rmooz/*` and `import_from_rmooz/*` —
  old generation staging (optional; clear if you want a clean slate)

---

## Windows host (PowerShell) — run from `UI_MOdified\Offline_Deployment\`

```powershell
# 0. Stop the stack so nothing is writing while we clean.
docker compose -f docker-compose.offline.yml down

# 1. Refresh the cert README. It holds NO secrets, so the simplest safe action is
#    to delete the stale one — the real *.crt/*.pem/*.key files are left untouched:
Remove-Item -Path ".\certs\README.md" -Force -ErrorAction SilentlyContinue
#    Or, to keep the up-to-date docs, copy the CLEAN README from the newly extracted
#    bundle. Point $BundleRoot at wherever you unpacked the new transfer bundle:
# $BundleRoot = "D:\rmooz-bundle"     # <-- adjust to your extract location
# Copy-Item -Path "$BundleRoot\Offline_Deployment\certs\README.md" `
#           -Destination ".\certs\README.md" -Force

# 2. Clear stale WarGamingGEN runs (old error.log lived here). KEEPS the runs/ folder.
if (Test-Path ".\TestingAI_Runtime\runs") {
    Get-ChildItem ".\TestingAI_Runtime\runs" -Force | Remove-Item -Recurse -Force -Confirm:$false
}

# 3. (Optional) Clear old generation staging.
foreach ($d in @(".\TestingAI_Runtime\export_to_rmooz", ".\TestingAI_Runtime\import_from_rmooz")) {
    if (Test-Path $d) { Get-ChildItem $d -Force | Remove-Item -Recurse -Force -Confirm:$false }
}

# 4. Bring the stack back up.
docker compose -f docker-compose.offline.yml --env-file .env.offline up -d
```

## Linux host (bash) — run from `Offline_Deployment/`

```bash
docker compose -f docker-compose.offline.yml down

# 1. Refresh the cert README from the new bundle's clean copy (keep real certs/keys).
cp -f "$NEW_BUNDLE/Offline_Deployment/certs/README.md" ./certs/README.md   # adjust path

# 2. Clear stale runs (keeps the runs/ dir, drops old error.log + checkpoints).
rm -rf ./TestingAI_Runtime/runs/*

# 3. (Optional) clear old staging.
rm -rf ./TestingAI_Runtime/export_to_rmooz/* ./TestingAI_Runtime/import_from_rmooz/*

docker compose -f docker-compose.offline.yml --env-file .env.offline up -d
```

> **Note — never run `rm -rf` on `data_runtime/`, `map_data/`, `certs/*.crt|*.pem|*.key`,
> or `.env.offline`.** Those hold operator scenarios, the map package, the real CA/client
> certificates, and the endpoint secrets respectively.

---

## Verify the running container is clean

After `up -d`, confirm the live container has no stale strings. Supply the patterns
from your own security policy at runtime via `$PATTERNS` (kept out of this file on
purpose, so the doc itself never contains the very strings you scan for). Use a
pipe-separated regex — e.g. a former dev username, an old host name, an old IP, the
old org name, and a Windows user-path prefix:

```bash
PATTERNS='<former-dev-username>|<old-host>|<old-ip>|<old-org-name>|<windows-user-path-prefix>'
docker exec rmooz-offline sh -lc \
  "grep -RIlE \"$PATTERNS\" /app 2>/dev/null | grep -v '/app/certs/' || echo CLEAN"
```

The only path allowed to contain a site-specific local name is the operator-mounted CA
certificate under `/app/certs/` (the cert's own subject/issuer), which is expected and
never written by RMOOZ.
