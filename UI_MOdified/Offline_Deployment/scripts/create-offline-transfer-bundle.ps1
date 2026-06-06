# ─────────────────────────────────────────────────────────────────────────────
#  create-offline-transfer-bundle.ps1 — Build the complete offline transfer package
#
#  Creates everything the offline machine needs to run RMOOZ without internet.
#  Run from UI_MOdified/ after:
#    1. .\Offline_Deployment\scripts\prepare-map-bundle.ps1
#    2. docker compose ... build  (image built)
#
#  Output: Offline_Deployment/dist/
#    rmooz-offline.tar               — Docker image
#    bundle/                         — Everything else for the offline machine
#      docker-compose.offline.yml
#      .env.offline.example
#      map_data/                     — MBTiles + DEM + maps.json
#      TestingAI_Runtime/            — WarGamingGEN I/O dirs
#      docs/                         — Operator guides
#      scripts/load-offline-image.ps1
#      scripts/run-offline-compose.ps1
#      scripts/test-offline-compose.ps1
#
#  IMPORTANT: map_data/ is NOT inside the Docker image tar.
#  It is mounted as a volume at runtime. The operator must copy the
#  bundle/ folder alongside the .tar file.
# ─────────────────────────────────────────────────────────────────────────────
param(
    [string]$Tag     = "rmooz-offline:latest",
    [string]$OutDir  = "Offline_Deployment/dist",
    [switch]$SkipImage  # skip docker save (image .tar already exists)
)

$ErrorActionPreference = "Stop"

$BundleDir = "$OutDir/bundle"
New-Item -ItemType Directory -Force -Path $OutDir   | Out-Null
New-Item -ItemType Directory -Force -Path $BundleDir | Out-Null

Write-Host ""
Write-Host "═════════════════════════════════════════════════════════════"
Write-Host "  RMOOZ Offline Transfer Bundle"
Write-Host "═════════════════════════════════════════════════════════════"
Write-Host "  Output : $OutDir"
Write-Host "═════════════════════════════════════════════════════════════"
Write-Host ""

# ── 1. Docker image tar ───────────────────────────────────────────────────────
$imageTar = "$OutDir/rmooz-offline.tar"
if ($SkipImage -and (Test-Path $imageTar)) {
    Write-Host "  [SKIP] Image tar exists: $imageTar"
} else {
    Write-Host "  Saving Docker image '$Tag' → $imageTar ..."
    $start = Get-Date
    & docker save -o $imageTar $Tag
    if ($LASTEXITCODE -ne 0) { Write-Error "docker save failed"; exit 1 }
    $elapsed  = [int]((Get-Date) - $start).TotalSeconds
    $sizeMB   = [int]((Get-Item $imageTar).Length / 1MB)
    Write-Host "  [OK]  Saved ${sizeMB} MB in ${elapsed}s"
}

# ── 2. Compose and env files ──────────────────────────────────────────────────
Copy-Item "Offline_Deployment/docker-compose.offline.yml" "$BundleDir/docker-compose.offline.yml" -Force
Copy-Item "Offline_Deployment/.env.offline.example"       "$BundleDir/.env.offline.example" -Force
Write-Host "  [OK]  Copied docker-compose.offline.yml and .env.offline.example"

# ── 3. map_data ───────────────────────────────────────────────────────────────
Write-Host "  Copying map_data/ (may take time for large files)..."
$mapSrc = "Offline_Deployment/map_data"
$mapDst = "$BundleDir/map_data"
if (Test-Path $mapSrc) {
    # Copy everything except .gitkeep
    Copy-Item $mapSrc $mapDst -Recurse -Force
    # Remove .gitkeep files (cosmetic)
    Get-ChildItem -Recurse -Path $mapDst -Filter ".gitkeep" | Remove-Item -Force
    $mapFiles = Get-ChildItem -Recurse -Path $mapDst -File
    $mapMB = [int](($mapFiles | Measure-Object Length -Sum).Sum / 1MB)
    Write-Host "  [OK]  map_data/ → $mapDst  ($($mapFiles.Count) files, ${mapMB} MB)"
}

# ── 4. TestingAI_Runtime ──────────────────────────────────────────────────────
$taiSrc = "Offline_Deployment/TestingAI_Runtime"
$taiDst = "$BundleDir/TestingAI_Runtime"
if (Test-Path $taiSrc) {
    Copy-Item $taiSrc $taiDst -Recurse -Force
    Write-Host "  [OK]  TestingAI_Runtime/ → $taiDst"
}

# ── 5. Docs ───────────────────────────────────────────────────────────────────
$docsSrc = "Offline_Deployment/docs"
$docsDst = "$BundleDir/docs"
if (Test-Path $docsSrc) {
    Copy-Item $docsSrc $docsDst -Recurse -Force
    Write-Host "  [OK]  docs/ → $docsDst"
}

# ── 6. Key scripts ────────────────────────────────────────────────────────────
$scriptDst = "$BundleDir/scripts"
New-Item -ItemType Directory -Force -Path $scriptDst | Out-Null
foreach ($s in @("load-offline-image.ps1", "run-offline-compose.ps1", "test-offline-compose.ps1")) {
    $src = "Offline_Deployment/scripts/$s"
    if (Test-Path $src) {
        Copy-Item $src "$scriptDst/$s" -Force
    }
}
Write-Host "  [OK]  Scripts → $scriptDst"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═════════════════════════════════════════════════════════════"
Write-Host "  Bundle complete. Contents of ${OutDir}:"
Get-ChildItem -Recurse -Path $OutDir -File |
    Where-Object { $_.Name -ne ".gitkeep" } |
    ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 1)
        $rel = $_.FullName.Replace((Resolve-Path $OutDir).Path + "\", "")
        Write-Host "    $rel  ($mb MB)"
    }
Write-Host ""
Write-Host "  Instructions for offline machine:"
Write-Host "  1. Copy $OutDir/ to offline machine"
Write-Host "  2. Run: .\scripts\load-offline-image.ps1 -Input rmooz-offline.tar"
Write-Host "  3. cp bundle\.env.offline.example bundle\.env.offline"
Write-Host "  4. Edit .env.offline: set LDAP_SERVER, LDAP_DOMAIN, SESSION_SECRET"
Write-Host "  5. docker compose -f bundle\docker-compose.offline.yml --env-file bundle\.env.offline up -d"
Write-Host "  6. Test: curl http://localhost:5006/  and  http://localhost:8080/services/"
Write-Host ""
