# ─────────────────────────────────────────────────────────────────────────────
#  run-offline-compose.ps1 — Start the RMOOZ offline Docker Compose stack
#
#  Run from UI_MOdified/ directory:
#    .\Offline_Deployment\scripts\run-offline-compose.ps1
#
#  Prerequisites:
#    • Offline_Deployment/.env.offline must exist (copy from .env.offline.example)
#    • Docker image must be built (run build-offline-image.ps1 first)
# ─────────────────────────────────────────────────────────────────────────────
param(
    [switch]$Detach,           # Run in background (-d)
    [switch]$Build,            # Force rebuild before starting
    [string]$EnvFile = "Offline_Deployment/.env.offline"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "Offline_Deployment/docker-compose.offline.yml")) {
    Write-Error "Run this script from UI_MOdified/ (the project root)."
    exit 1
}

if (-not (Test-Path $EnvFile)) {
    Write-Warning ".env.offline not found at $EnvFile"
    Write-Warning "Copy Offline_Deployment/.env.offline.example to $EnvFile and fill in site values."
    Write-Host "Using .env.offline.example for this run (LDAP will not connect to a real server)."
    $EnvFile = "Offline_Deployment/.env.offline.example"
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════"
Write-Host "  RMOOZ Offline Compose Start"
Write-Host "═══════════════════════════════════════════════════════"
Write-Host "  Compose file: Offline_Deployment/docker-compose.offline.yml"
Write-Host "  Env file    : $EnvFile"
Write-Host "═══════════════════════════════════════════════════════"
Write-Host ""

$composeArgs = @(
    "compose",
    "-f", "Offline_Deployment/docker-compose.offline.yml",
    "--env-file", $EnvFile,
    "up"
)

if ($Build)  { $composeArgs += "--build" }
if ($Detach) { $composeArgs += "-d" }

Write-Host "Running: docker $($composeArgs -join ' ')"
Write-Host ""

& docker @composeArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose up failed (exit code $LASTEXITCODE)."
    exit $LASTEXITCODE
}
