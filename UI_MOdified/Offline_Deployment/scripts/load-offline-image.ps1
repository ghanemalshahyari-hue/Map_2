# ─────────────────────────────────────────────────────────────────────────────
#  load-offline-image.ps1 — Load the RMOOZ Docker image on the offline machine
#
#  Run from the project root (where Offline_Deployment/ lives):
#    .\Offline_Deployment\scripts\load-offline-image.ps1
#    .\Offline_Deployment\scripts\load-offline-image.ps1 -Input Offline_Deployment/dist/rmooz-offline.tar
#
#  Then start the stack:
#    docker compose -f Offline_Deployment/docker-compose.offline.yml ^
#                   --env-file Offline_Deployment/.env.offline up -d
# ─────────────────────────────────────────────────────────────────────────────
param(
    [string]$Input = "Offline_Deployment/dist/rmooz-offline.tar"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Input)) {
    Write-Error "Image tar not found: $Input`nCopy the .tar from the preparation machine first."
    exit 1
}

$sizeMB = [int]((Get-Item $Input).Length / 1MB)
Write-Host ""
Write-Host "═════════════════════════════════════════════════════"
Write-Host "  RMOOZ Offline Image — Load on Offline Machine"
Write-Host "═════════════════════════════════════════════════════"
Write-Host "  Input : $Input ($sizeMB MB)"
Write-Host "═════════════════════════════════════════════════════"
Write-Host ""
Write-Host "  Loading image (may take several minutes)..."

$start = Get-Date
& docker load -i $Input
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker load failed (exit $LASTEXITCODE)."
    exit $LASTEXITCODE
}

$elapsed = [int]((Get-Date) - $start).TotalSeconds
Write-Host ""
Write-Host "  Loaded in ${elapsed}s."
Write-Host ""
Write-Host "  Next steps:"
Write-Host "   1. Copy Offline_Deployment/.env.offline.example → Offline_Deployment/.env.offline"
Write-Host "   2. Set LDAP_SERVER, LDAP_DOMAIN, SESSION_SECRET in .env.offline"
Write-Host "   3. Confirm Ollama is running: ollama list → must show qwen2.5:7b"
Write-Host "   4. Confirm Ollama responds:   ollama run qwen2.5:7b 'reply OK'"
Write-Host "   5. Start the stack:"
Write-Host "      docker compose -f Offline_Deployment/docker-compose.offline.yml --env-file Offline_Deployment/.env.offline up -d"
Write-Host "   6. Test: curl http://localhost:5006/api/auth/me  → expect 401"
Write-Host "   7. Test: curl http://localhost:5006/api/offline/map-config  → expect 200"
Write-Host ""
& docker images rmooz-offline
Write-Host ""
