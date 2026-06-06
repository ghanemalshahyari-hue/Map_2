# Export the Docker image to a .tar for offline transfer.
#
# Run from UI_MOdified/:
#   .\Offline_Deployment\scripts\save-offline-image.ps1
#   .\Offline_Deployment\scripts\save-offline-image.ps1 -Tag rmooz-offline:latest
#
# Output:
#   Offline_Deployment/dist/rmooz-offline.tar

param(
    [string]$Tag = "rmooz-offline:latest",
    [string]$OutDir = "Offline_Deployment/dist"
)

$ErrorActionPreference = "Stop"

$OutFile = Join-Path $OutDir "rmooz-offline.tar"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host ""
Write-Host "===================================================="
Write-Host "  RMOOZ Offline Image - Save for Transfer"
Write-Host "===================================================="
Write-Host "  Image  : $Tag"
Write-Host "  Output : $OutFile"
Write-Host "===================================================="
Write-Host ""

$check = & docker image inspect $Tag 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Image '$Tag' not found. Build it first:`n  docker compose -f Offline_Deployment/docker-compose.offline.yml build"
    exit 1
}

Write-Host "  Saving image (this may take several minutes for large images)..."
$start = Get-Date

& docker save -o $OutFile $Tag
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker save failed."
    exit $LASTEXITCODE
}

$elapsed = [int]((Get-Date) - $start).TotalSeconds
$sizeMB = [int]((Get-Item $OutFile).Length / 1MB)

Write-Host ""
Write-Host "  Saved: $OutFile"
Write-Host "  Size : ~${sizeMB} MB"
Write-Host "  Time : ${elapsed}s"
Write-Host ""
Write-Host "  Transfer checklist:"
Write-Host "   1. Copy $OutFile to the offline machine"
Write-Host "   2. Copy Offline_Deployment/ folder"
Write-Host "   3. On offline machine: run load-offline-image.ps1"
Write-Host "   4. Edit Offline_Deployment/.env.offline with site LDAP_SERVER, LDAP_DOMAIN, SESSION_SECRET"
Write-Host "   5. Confirm Ollama is running: ollama list"
Write-Host "   6. docker compose -f Offline_Deployment/docker-compose.offline.yml up -d"
Write-Host ""
