# ─────────────────────────────────────────────────────────────────────────────
#  build-offline-image.ps1 — Build the RMOOZ offline Docker image
#
#  Run from UI_MOdified/ directory:
#    .\Offline_Deployment\scripts\build-offline-image.ps1
#
#  Or with a custom tag:
#    .\Offline_Deployment\scripts\build-offline-image.ps1 -Tag rmooz-offline:1.0
# ─────────────────────────────────────────────────────────────────────────────
param(
    [string]$Tag      = "rmooz-offline:latest",
    [string]$Platform = "",          # e.g. "linux/amd64" for cross-build
    [switch]$NoCache
)

$ErrorActionPreference = "Stop"

# Confirm we are in the correct directory (UI_MOdified/)
if (-not (Test-Path "Offline_Deployment/Dockerfile.offline")) {
    Write-Error "Run this script from UI_MOdified/ (the project root). File not found: Offline_Deployment/Dockerfile.offline"
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════"
Write-Host "  RMOOZ Offline Image Build"
Write-Host "═══════════════════════════════════════════════════════"
Write-Host "  Tag      : $Tag"
Write-Host "  Context  : $(Get-Location)"
Write-Host "  Dockerfile: Offline_Deployment/Dockerfile.offline"
Write-Host "═══════════════════════════════════════════════════════"
Write-Host ""

$buildArgs = @(
    "build",
    "-f", "Offline_Deployment/Dockerfile.offline",
    "-t", $Tag
)

if ($Platform) { $buildArgs += @("--platform", $Platform) }
if ($NoCache)  { $buildArgs += "--no-cache" }
$buildArgs += "."

Write-Host "Running: docker $($buildArgs -join ' ')"
Write-Host ""

$start = Get-Date
& docker @buildArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed (exit code $LASTEXITCODE)."
    exit $LASTEXITCODE
}

$elapsed = [int]((Get-Date) - $start).TotalSeconds
Write-Host ""
Write-Host "  Build completed in ${elapsed}s. Image: $Tag"
Write-Host ""
