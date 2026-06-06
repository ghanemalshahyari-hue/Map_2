# ─────────────────────────────────────────────────────────────────────────────
#  test-wargaminggen-json-outputs.ps1 — Verify WarGamingGEN output files
#
#  Run AFTER a wargame generation has completed.
#  Checks both the host-side TestingAI_Runtime/ mounts and (if container is up)
#  the container-side /app/TestingAI/ paths.
#
#  Usage (from UI_MOdified/):
#    .\Offline_Deployment\scripts\test-wargaminggen-json-outputs.ps1
#    .\Offline_Deployment\scripts\test-wargaminggen-json-outputs.ps1 -HostOnly
# ─────────────────────────────────────────────────────────────────────────────
param(
    [string]$RuntimeDir   = "Offline_Deployment/TestingAI_Runtime",
    [string]$ContainerName = "rmooz-offline",
    [switch]$HostOnly      # Skip container checks
)

$ErrorActionPreference = "SilentlyContinue"
$pass = 0; $fail = 0; $warn = 0

function ok($msg)   { Write-Host "  [PASS] $msg" -ForegroundColor Green;  $script:pass++ }
function fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $script:fail++ }
function warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:warn++ }
function info($msg) { Write-Host "         $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "══════════════════════════════════════════════════════"
Write-Host "  WarGamingGEN JSON/GeoJSON Output Verification"
Write-Host "══════════════════════════════════════════════════════"
Write-Host ""

# ── §1  Host-side volume mount directories ────────────────────────────────────
Write-Host "── §1  Host-side runtime directories ──────────────────"

$dirs = @(
    @{ Path = "$RuntimeDir/import_from_rmooz"; Desc = "DOCX input staging" },
    @{ Path = "$RuntimeDir/export_to_rmooz";   Desc = "GeoJSON/report output" },
    @{ Path = "$RuntimeDir/runs";              Desc = "Per-run checkpoints + outputs" }
)

foreach ($d in $dirs) {
    if (Test-Path $d.Path) {
        ok "$($d.Path)/ exists ($($d.Desc))"
    } else {
        fail "$($d.Path)/ does not exist — run docker compose up first"
    }
}

# ── §2  Input files ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "── §2  Input DOCX files ────────────────────────────────"

$importDir = "$RuntimeDir/import_from_rmooz"
$redTeam  = "$importDir/forces/red_team.docx"
$blueTeam = "$importDir/forces/blue_team.docx"

if (Test-Path $redTeam)  { ok "red_team.docx present in import_from_rmooz/forces/" }
else { warn "red_team.docx not found — generation requires this file"; info "Place it at: $redTeam" }

if (Test-Path $blueTeam) { ok "blue_team.docx present in import_from_rmooz/forces/" }
else { warn "blue_team.docx not found — generation requires this file"; info "Place it at: $blueTeam" }

# ── §3  Export outputs ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "── §3  export_to_rmooz/ output files ──────────────────"

$exportDir = "$RuntimeDir/export_to_rmooz"

# Find the latest run folder
$latestRun = Get-ChildItem -Path $exportDir -Directory -ErrorAction SilentlyContinue |
             Sort-Object Name -Descending | Select-Object -First 1

if ($latestRun) {
    ok "Latest run folder: $($latestRun.Name)"

    $expectedFiles = @(
        @{ Name = "manifest.json";        Required = $true  },
        @{ Name = "wargame_report.md";    Required = $false },
        @{ Name = "wargameschedule.csv";  Required = $false }
    )

    foreach ($f in $expectedFiles) {
        $fpath = Join-Path $latestRun.FullName $f.Name
        if (Test-Path $fpath) {
            ok "$($f.Name) exists in latest run"
        } elseif ($f.Required) {
            fail "$($f.Name) MISSING from latest run (required)"
        } else {
            warn "$($f.Name) not found in latest run (optional)"
        }
    }

    # Check GeoJSON
    $geoDir = Join-Path $latestRun.FullName "geojson"
    if (Test-Path $geoDir) {
        $geoFiles = Get-ChildItem -Path $geoDir -Filter "*.geojson" -ErrorAction SilentlyContinue
        if ($geoFiles.Count -gt 0) {
            ok "GeoJSON files found: $($geoFiles.Count) file(s) in geojson/"
            $allPhases = Join-Path $geoDir "all_phases.geojson"
            if (Test-Path $allPhases) { ok "all_phases.geojson exists" }
            else { warn "all_phases.geojson not found (may not be generated yet)" }
        } else {
            warn "geojson/ directory empty — generation may not have completed"
        }
    } else {
        warn "geojson/ subdirectory not found in latest run"
    }
} else {
    warn "No run folders found in export_to_rmooz/ — run generation first"
    info "After running a scenario: docker compose exec rmooz node ... (via RMOOZ UI)"
}

# ── §4  Runs directory ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "── §4  runs/ checkpoint + output files ────────────────"

$runsDir = "$RuntimeDir/runs"
$latestRunLocal = Get-ChildItem -Path $runsDir -Directory -ErrorAction SilentlyContinue |
                  Sort-Object Name -Descending | Select-Object -First 1

if ($latestRunLocal) {
    ok "Latest local run: $($latestRunLocal.Name)"

    $cpDir = Join-Path $latestRunLocal.FullName "checkpoints"
    $outDir = Join-Path $latestRunLocal.FullName "outputs"

    if (Test-Path $cpDir) {
        $cpFiles = Get-ChildItem -Path $cpDir -Filter "phase*.json" -ErrorAction SilentlyContinue
        ok "checkpoints/ exists — $($cpFiles.Count) phase file(s)"
    } else {
        warn "checkpoints/ not found in run dir (created during generation)"
    }

    if (Test-Path $outDir) {
        ok "outputs/ exists in run dir"
    } else {
        warn "outputs/ not found in run dir (created at end of generation)"
    }
} else {
    warn "No run folders in runs/ — no generation has completed yet"
}

# ── §5  Container-side check ──────────────────────────────────────────────────
if (-not $HostOnly) {
    Write-Host ""
    Write-Host "── §5  Container-side paths ────────────────────────────"

    $containerUp = $false
    try {
        $status = & docker inspect $ContainerName --format "{{.State.Status}}" 2>&1
        $containerUp = ($status -eq "running")
    } catch {}

    if (-not $containerUp) {
        Write-Host "  [SKIP] Container '$ContainerName' not running — skipping container checks"
    } else {
        $containerChecks = @(
            "/app/TestingAI/WarGamingGEN/src",
            "/app/TestingAI/import_from_rmooz",
            "/app/TestingAI/export_to_rmooz",
            "/app/TestingAI/WarGamingGEN/runs",
            "/opt/rmooz-venv/bin/python"
        )

        foreach ($cpath in $containerChecks) {
            $result = & docker exec $ContainerName sh -c "test -e '$cpath' && echo ok" 2>&1
            if ($result -eq "ok") { ok "$cpath exists in container" }
            else { fail "$cpath MISSING in container" }
        }

        # Check Python can import WarGamingGEN deps
        $pyCheck = & docker exec $ContainerName sh -c "/opt/rmooz-venv/bin/python -c 'import openai; print(openai.__version__)'" 2>&1
        if ($pyCheck -match "^\d+\.\d+") {
            ok "Python openai importable: $pyCheck"
        } else {
            fail "Python openai import failed: $pyCheck"
        }
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════"
Write-Host "  Results: $pass passed, $warn warnings, $fail failed" -ForegroundColor $(
    if ($fail -gt 0) { "Red" } elseif ($warn -gt 0) { "Yellow" } else { "Green" }
)
Write-Host "══════════════════════════════════════════════════════"
Write-Host ""

if ($fail -gt 0) { exit 1 }
exit 0
