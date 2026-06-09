# Build the complete RMOOZ offline transfer package.
#
# Run from UI_MOdified/ after building the image:
#   .\Offline_Deployment\scripts\create-offline-transfer-bundle.ps1
#   .\Offline_Deployment\scripts\create-offline-transfer-bundle.ps1 -SkipImage
#
# Output:
#   Offline_Deployment/dist/bundle/

param(
    [string]$Tag = "rmooz-offline:latest",
    [string]$OutDir = "Offline_Deployment/dist",
    [switch]$SkipImage
)

$ErrorActionPreference = "Stop"

$BundleDir = "$OutDir/bundle"
$ImageTar = "$OutDir/rmooz-offline.tar"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $BundleDir | Out-Null

Write-Host ""
Write-Host "===================================================="
Write-Host "  RMOOZ Offline Transfer Bundle"
Write-Host "===================================================="
Write-Host "  Output : $BundleDir"
Write-Host "===================================================="
Write-Host ""

if ($SkipImage -and (Test-Path $ImageTar)) {
    Write-Host "  [SKIP] Image tar exists: $ImageTar"
} else {
    Write-Host "  Saving Docker image '$Tag' -> $ImageTar ..."
    $start = Get-Date
    & docker save -o $ImageTar $Tag
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker save failed"
        exit 1
    }
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    $sizeMB = [int]((Get-Item $ImageTar).Length / 1MB)
    Write-Host "  [OK]  Saved ${sizeMB} MB in ${elapsed}s"
}

if (Test-Path $ImageTar) {
    Copy-Item $ImageTar "$BundleDir/rmooz-offline.tar" -Force
    Write-Host "  [OK]  Copied image tar into bundle"
}

Copy-Item "Offline_Deployment/docker-compose.offline.yml" "$BundleDir/docker-compose.offline.yml" -Force
# Host-networking fallback compose — used only if the container cannot reach
# LiteLLM on the default bridge network (diag-litellm.py shows DNS/route failure).
if (Test-Path "Offline_Deployment/docker-compose.hostnet.offline.yml") {
    Copy-Item "Offline_Deployment/docker-compose.hostnet.offline.yml" "$BundleDir/docker-compose.hostnet.offline.yml" -Force
}
Copy-Item "Offline_Deployment/.env.offline.example" "$BundleDir/.env.offline.example" -Force
# SECURITY: the REAL .env.offline (API key, secrets) is intentionally NEVER bundled.
# The operator creates it on the offline server from .env.offline.example. If a stale
# copy is present in the bundle dir from an older run, remove it so it can't ship.
if (Test-Path "$BundleDir/.env.offline") { Remove-Item -Force "$BundleDir/.env.offline" }
Write-Host "  [OK]  Copied compose + .env.offline.example (real .env.offline excluded by design)"

function Copy-TreeIfPresent {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$Label
    )
    if (Test-Path $Source) {
        if (Test-Path $Destination) {
            Remove-Item -Recurse -Force -LiteralPath $Destination
        }
        Copy-Item $Source $Destination -Recurse -Force
        Get-ChildItem -Recurse -Path $Destination -Filter ".gitkeep" -ErrorAction SilentlyContinue | Remove-Item -Force
        $files = Get-ChildItem -Recurse -Path $Destination -File -ErrorAction SilentlyContinue
        $sum = ($files | Measure-Object Length -Sum).Sum
        $mb = if ($sum) { [math]::Round($sum / 1MB, 1) } else { 0 }
        Write-Host "  [OK]  $Label -> $Destination ($($files.Count) files, ${mb} MB)"
    } else {
        Write-Host "  [WARN] Missing $Label source: $Source"
    }
}

Copy-TreeIfPresent "Offline_Deployment/map_data" "$BundleDir/map_data" "map_data"
Copy-TreeIfPresent "Offline_Deployment/data_runtime" "$BundleDir/data_runtime" "data_runtime"
Get-ChildItem -Path "$BundleDir/data_runtime" -File -Filter "app.db*" -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-TreeIfPresent "Offline_Deployment/TestingAI_Runtime" "$BundleDir/TestingAI_Runtime" "TestingAI_Runtime"
Copy-TreeIfPresent "Offline_Deployment/docs" "$BundleDir/docs" "docs"
# OFFLINE-LITELLM-CA-1: copy the certs/ placeholder so operators know where to put the CA cert.
# The real certificate (*.crt, *.pem, *.key) is gitignored and never committed.
Copy-TreeIfPresent "Offline_Deployment/certs" "$BundleDir/certs" "certs (CA cert placeholder)"

$scriptDst = "$BundleDir/scripts"
New-Item -ItemType Directory -Force -Path $scriptDst | Out-Null
foreach ($s in @(
    "load-offline-image.ps1",
    "run-offline-compose.ps1",
    "test-offline-compose.ps1",
    "save-offline-image.ps1",
    "create-offline-transfer-bundle.ps1",
    "prepare-map-bundle.ps1"
)) {
    $src = "Offline_Deployment/scripts/$s"
    if (Test-Path $src) {
        Copy-Item $src "$scriptDst/$s" -Force
    }
}
Write-Host "  [OK]  Copied scripts"

Write-Host ""
Write-Host "  Bundle complete:"
Get-ChildItem -Recurse -Path $BundleDir -File |
    Sort-Object FullName |
    ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 1)
        $rel = $_.FullName.Replace((Resolve-Path $BundleDir).Path + "\", "")
        Write-Host "    $rel ($mb MB)"
    }
Write-Host ""
Write-Host "  Transfer only this folder:"
Write-Host "    $BundleDir"
Write-Host ""
