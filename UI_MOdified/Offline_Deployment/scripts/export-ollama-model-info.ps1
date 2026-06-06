# ─────────────────────────────────────────────────────────────────────────────
#  export-ollama-model-info.ps1 — Capture Ollama model metadata before transfer
#
#  Run on the PREPARATION (online) machine before transferring model to offline site.
#  Saves model info (NOT weights) to Offline_Deployment/ollama_model_info/.
#
#  Usage (from UI_MOdified/):
#    .\Offline_Deployment\scripts\export-ollama-model-info.ps1
#    .\Offline_Deployment\scripts\export-ollama-model-info.ps1 -Model qwen2.5:7b
#
#  No API keys or passwords required. Local Ollama runs without any secret.
# ─────────────────────────────────────────────────────────────────────────────
param(
    [string]$Model     = $env:RMOOZ_OLLAMA_MODEL,
    [string]$OutputDir = "Offline_Deployment/ollama_model_info"
)

$ErrorActionPreference = "Stop"

# ── Resolve model name ────────────────────────────────────────────────────────
if (-not $Model) {
    # Try to read from .env.offline or .env.offline.example
    foreach ($envFile in @("Offline_Deployment/.env.offline", "Offline_Deployment/.env.offline.example")) {
        if (Test-Path $envFile) {
            $line = Get-Content $envFile | Where-Object { $_ -match '^RMOOZ_OLLAMA_MODEL\s*=' }
            if ($line) {
                $Model = ($line -split '=', 2)[1].Trim()
                Write-Host "  Using model from ${envFile}: $Model"
                break
            }
        }
    }
}

if (-not $Model) {
    $Model = "qwen2.5:7b"
    Write-Host "  No model specified — using default: $Model"
}

Write-Host ""
Write-Host "═════════════════════════════════════════════════════"
Write-Host "  RMOOZ — Ollama Model Info Export"
Write-Host "═════════════════════════════════════════════════════"
Write-Host "  Model    : $Model"
Write-Host "  Output   : $OutputDir"
Write-Host "═════════════════════════════════════════════════════"
Write-Host ""

# ── Create output directory ───────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# ── Save model name ───────────────────────────────────────────────────────────
Set-Content -Path "$OutputDir/model-name.txt" -Value $Model -Encoding utf8
Write-Host "  Saved: model-name.txt"

# ── Check Ollama is running ───────────────────────────────────────────────────
$ollamaOk = $false
try {
    $ping = Invoke-WebRequest -Uri "http://localhost:11434/" -TimeoutSec 3 -UseBasicParsing
    $ollamaOk = ($ping.StatusCode -lt 500)
} catch {
    Write-Warning "  Ollama not reachable at localhost:11434 — is Ollama running?"
    Write-Warning "  Start Ollama and re-run this script."
}

# ── ollama list ───────────────────────────────────────────────────────────────
Write-Host "  Running: ollama list ..."
try {
    $listOut = & ollama list 2>&1
    Set-Content -Path "$OutputDir/model-list.txt" -Value ($listOut | Out-String) -Encoding utf8
    Write-Host "  Saved: model-list.txt"

    # Check if our model appears in the list
    if ($listOut | Select-String -Pattern ($Model -replace ":", "\:") -Quiet) {
        Write-Host "  [OK] '$Model' found in ollama list" -ForegroundColor Green
    } else {
        Write-Warning "  '$Model' not found in ollama list. Pull it first: ollama pull $Model"
    }
} catch {
    Write-Warning "  ollama list failed: $($_.Exception.Message)"
    Set-Content -Path "$OutputDir/model-list.txt" -Value "ERROR: $($_.Exception.Message)" -Encoding utf8
}

# ── ollama show ───────────────────────────────────────────────────────────────
Write-Host "  Running: ollama show $Model ..."
try {
    $showOut = & ollama show $Model 2>&1
    Set-Content -Path "$OutputDir/model-show.txt" -Value ($showOut | Out-String) -Encoding utf8
    Write-Host "  Saved: model-show.txt"
} catch {
    Write-Warning "  ollama show failed: $($_.Exception.Message)"
    Set-Content -Path "$OutputDir/model-show.txt" -Value "ERROR: $($_.Exception.Message)" -Encoding utf8
}

# ── ollama show --modelfile ───────────────────────────────────────────────────
Write-Host "  Running: ollama show $Model --modelfile ..."
try {
    $mfOut = & ollama show $Model --modelfile 2>&1
    Set-Content -Path "$OutputDir/model-modelfile.txt" -Value ($mfOut | Out-String) -Encoding utf8
    Write-Host "  Saved: model-modelfile.txt"
} catch {
    # Older Ollama versions may not support --modelfile
    Write-Warning "  ollama show --modelfile failed (may not be supported by this Ollama version)"
    Set-Content -Path "$OutputDir/model-modelfile.txt" -Value "NOT SUPPORTED" -Encoding utf8
}

# ── Summary ───────────────────────────────────────────────────────────────────
$exportTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Set-Content -Path "$OutputDir/export-info.txt" -Encoding utf8 -Value @"
Exported: $exportTime
Model:    $Model
Host:     $env:COMPUTERNAME
Ollama:   $(& ollama --version 2>&1 | Select-Object -First 1)
"@

Write-Host ""
Write-Host "  Export complete. Files in: $OutputDir"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "   1. Transfer model storage to offline machine (see docs/offline-ollama-model-package-guide.md)"
Write-Host "   2. On offline machine: ollama list   — verify model appears"
Write-Host "   3. On offline machine: ollama run $Model 'test'   — verify it responds"
Write-Host "   4. Start RMOOZ container with RMOOZ_ALLOW_SIM_RUN=1"
Write-Host ""
