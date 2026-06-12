# prepare-map-bundle.ps1 - Stage map files for the offline Docker deployment
#
# Run from UI_MOdified/ BEFORE building the Docker image.
# Copies local map files into Offline_Deployment/map_data/ so they are
# available via docker-compose volume mounts.
#
# Usage:
#   .\Offline_Deployment\scripts\prepare-map-bundle.ps1
#   .\Offline_Deployment\scripts\prepare-map-bundle.ps1 -SkipDEM
#
# What it does:
#   1. Copies satellite MBTiles  -> map_data/base/  (tile-server reads from here)
#   2. Copies Libya DEM .tif     -> map_data/dem/   (Cesium terrain + /api/dem/*)
#   3. Creates maps.json         -> map_data/base/  (registers MBTiles with tile server)
#
# Does NOT download from the internet. Does NOT modify the main app.

param(
    [switch]$SkipDEM,     # skip the 1.8 GB DEM copy (tiles still work, 3D terrain flat)
    [switch]$SkipMBTiles  # skip the 2.3 GB MBTiles copy
)

$ErrorActionPreference = "Stop"

$Root    = Get-Location
$MapsDir = "Offline_Deployment/map_data/base"
$DemDir  = "Offline_Deployment/map_data/dem"

Write-Host ""
Write-Host "====================================================="
Write-Host "  RMOOZ Offline Map Bundle Preparation"
Write-Host "====================================================="
Write-Host ""

New-Item -ItemType Directory -Force -Path $MapsDir | Out-Null
New-Item -ItemType Directory -Force -Path $DemDir  | Out-Null

# ── 1. MBTiles satellite map ──────────────────────────────────────────────────
$srcMBTiles = "maps/satellite-2017-11-02_asia_gcc-states.mbtiles"
$dstMBTiles = "$MapsDir/satellite-2017-11-02_asia_gcc-states.mbtiles"

if ($SkipMBTiles) {
    Write-Host "  [SKIP] MBTiles copy skipped (-SkipMBTiles)"
} elseif (Test-Path $srcMBTiles) {
    $sizeMB = [int]((Get-Item $srcMBTiles).Length / 1MB)
    Write-Host "  Copying MBTiles: $srcMBTiles ($sizeMB MB) ..."
    $start = Get-Date
    Copy-Item $srcMBTiles $dstMBTiles -Force
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    Write-Host "  [OK] -> $dstMBTiles  (${elapsed}s)"
} else {
    Write-Warning "  MBTiles not found: $srcMBTiles"
    Write-Warning "  The satellite map tile layer will be unavailable."
}

# ── 2. maps.json: register MBTiles with the tile server ──────────────────────
$mapsJsonContent = '{"mbtiles":["satellite-2017-11-02_asia_gcc-states.mbtiles"],"tileServer":"http://localhost:8080"}'
Set-Content -Path "$MapsDir/maps.json" -Value $mapsJsonContent -Encoding utf8 -NoNewline
Write-Host "  [OK] Created: $MapsDir/maps.json"
Write-Host "       tileServer: http://localhost:8080"
Write-Host "       mbtiles: satellite-2017-11-02_asia_gcc-states.mbtiles"

# ── 3. Libya DEM elevation file ───────────────────────────────────────────────
$demCandidates = @(
    "$env:USERPROFILE\Desktop\libya_demx5.tif",
    "TestingAI\_archive\source_data\geo\libya_demx5.tif",
    "TestingAI\WarGamingGEN\inputs\gis\elevation\libya_demx5.tif"
)
$dstDEM = "$DemDir/libya_demx5.tif"

Write-Host ""

if ($SkipDEM) {
    Write-Host "  [SKIP] DEM copy skipped (-SkipDEM)"
    Write-Host "         3D terrain will be flat. 2D satellite tiles still work."
} else {
    $srcDEM = $null
    foreach ($candidate in $demCandidates) {
        if (Test-Path $candidate) {
            $srcDEM = $candidate
            break
        }
    }

    if ($null -ne $srcDEM) {
        $sizeMB = [int]((Get-Item $srcDEM).Length / 1MB)
        Write-Host "  Copying DEM: $srcDEM ($sizeMB MB) ..."
        Write-Host "  (This may take several minutes - 1.8 GB file)"
        $start = Get-Date
        Copy-Item $srcDEM $dstDEM -Force
        $elapsed = [int]((Get-Date) - $start).TotalSeconds
        Write-Host "  [OK] -> $dstDEM  (${elapsed}s)"
    } else {
        Write-Warning "  Libya DEM not found in any of these locations:"
        foreach ($c in $demCandidates) { Write-Host "    $c" }
        Write-Warning "  3D terrain will be flat. 2D satellite tiles still work."
        Write-Warning "  Copy the file to Offline_Deployment/map_data/dem/libya_demx5.tif manually."
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "====================================================="
Write-Host "  Preparation complete. map_data/ contents:"
Get-ChildItem -Recurse -Path "Offline_Deployment/map_data" -File |
    Where-Object { $_.Name -ne ".gitkeep" } |
    ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 1)
        $rel = $_.FullName.Replace($Root.Path.ToString() + "\", "")
        Write-Host "    $rel  ($mb MB)"
    }
Write-Host ""
Write-Host "  Next: rebuild the Docker image:"
Write-Host "  docker compose -f Offline_Deployment/docker-compose.offline.yml build"
Write-Host ""
