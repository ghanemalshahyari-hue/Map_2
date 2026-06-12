# ─────────────────────────────────────────────────────────────────────────────
#  test-offline-compose.ps1 — Runtime verification of the running offline container
#
#  Run AFTER docker compose up (container must be running on port 5006):
#    .\Offline_Deployment\scripts\test-offline-compose.ps1
# ─────────────────────────────────────────────────────────────────────────────
param(
    [string]$Host = "localhost",
    [int]   $Port = 5006
)

$ErrorActionPreference = "SilentlyContinue"
$base  = "http://${Host}:${Port}"
$pass  = 0
$fail  = 0

function ok($name)   { Write-Host "  [PASS] $name" -ForegroundColor Green; $script:pass++ }
function fail($name, $msg) { Write-Host "  [FAIL] $name : $msg" -ForegroundColor Red; $script:fail++ }
function info($msg)  { Write-Host "         $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "══════════════════════════════════════════════════════"
Write-Host "  RMOOZ Offline Container Runtime Verification"
Write-Host "  Target: $base"
Write-Host "══════════════════════════════════════════════════════"
Write-Host ""

# ── 1. App responds on port 5006 ─────────────────────────────────────────────
Write-Host "── Host-side HTTP checks ───────────────────────────────"
try {
    $r = Invoke-WebRequest -Uri "$base/" -TimeoutSec 5 -UseBasicParsing
    if ($r.StatusCode -eq 200) { ok "GET / returns 200 (login page)" }
    else { fail "GET /" "Status $($r.StatusCode)" }
} catch { fail "GET /" $_.Exception.Message }

try {
    $r = Invoke-WebRequest -Uri "$base/api/auth/me" -TimeoutSec 5 -UseBasicParsing
    if ($r.StatusCode -eq 401) { ok "GET /api/auth/me returns 401 (unauthenticated — correct)" }
    else { fail "GET /api/auth/me" "Expected 401, got $($r.StatusCode)" }
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) { ok "GET /api/auth/me returns 401" }
    else { fail "GET /api/auth/me" $_.Exception.Message }
}

try {
    $r = Invoke-WebRequest -Uri "$base/api/auth/ldap-health" -TimeoutSec 10 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
        $body = $r.Content | ConvertFrom-Json
        ok "GET /api/auth/ldap-health returns 200"
        info "reachable=$($body.reachable)  server=$($body.server)"
    } else { fail "GET /api/auth/ldap-health" "Status $($r.StatusCode)" }
} catch { fail "GET /api/auth/ldap-health" $_.Exception.Message }

try {
    $r = Invoke-WebRequest -Uri "$base/api/offline/map-config" -TimeoutSec 5 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
        $body = $r.Content | ConvertFrom-Json
        ok "GET /api/offline/map-config returns 200"
        info "mapSourceMode=$($body.mapSourceMode)  fallbackEnabled=$($body.fallbackEnabled)"
    } else { fail "GET /api/offline/map-config" "Status $($r.StatusCode)" }
} catch { fail "GET /api/offline/map-config" $_.Exception.Message }

# ── 2. Container internal checks via docker exec ──────────────────────────────
Write-Host ""
Write-Host "── Container internal checks ───────────────────────────"

$cname = "rmooz-offline"

function dockerExec($cmd) {
    $result = & docker exec $cname sh -c $cmd 2>&1
    return $result, $LASTEXITCODE
}

$checks = @(
    @{ Name = "node exists at /usr/local/bin/node";   Cmd = "node --version" },
    @{ Name = "python venv at /opt/rmooz-venv/bin/python"; Cmd = "/opt/rmooz-venv/bin/python --version" },
    @{ Name = "/app/TestingAI exists";               Cmd = "test -d /app/TestingAI && echo ok" },
    @{ Name = "WarGamingGEN src exists";              Cmd = "test -d /app/TestingAI/WarGamingGEN/src && echo ok" },
    @{ Name = "/app/offline_map_data exists";         Cmd = "test -d /app/offline_map_data && echo ok" },
    @{ Name = "Python can import openai";             Cmd = "/opt/rmooz-venv/bin/python -c 'import openai; print(openai.__version__)'" },
    @{ Name = "Python can import pydantic";           Cmd = "/opt/rmooz-venv/bin/python -c 'import pydantic; print(pydantic.__version__)'" },
    @{ Name = "Python can import docx";              Cmd = "/opt/rmooz-venv/bin/python -c 'import docx; print(\"ok\")'" },
    @{ Name = "no npm install at startup (npm not running)"; Cmd = "! pgrep npm > /dev/null 2>&1 && echo ok || echo running" },
    @{ Name = "no pip install at startup (pip not running)"; Cmd = "! pgrep pip > /dev/null 2>&1 && echo ok || echo running" }
)

foreach ($c in $checks) {
    $out, $code = dockerExec $c.Cmd
    if ($code -eq 0 -and $out -match "ok|[0-9]\.[0-9]") {
        ok $c.Name
        if ($out -notmatch "^ok$") { info $out }
    } else {
        fail $c.Name ($out -join " ")
    }
}

# ── Summary ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════"
Write-Host "  Results: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Yellow" })
Write-Host "══════════════════════════════════════════════════════"
Write-Host ""

exit $fail
