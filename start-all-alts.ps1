# Start all three RMOOZ alts in the background.
# Each alt logs to <alt>\smoke.log (stdout) and <alt>\smoke.log.err (stderr).
# PIDs are stored in <alt>\smoke.pid so stop-all-alts.ps1 can clean up.

$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $node)) {
  Write-Host "node.exe not found at $node" -ForegroundColor Red
  exit 1
}

$base = $PSScriptRoot
$alts = @(
  @{ name="alt-1"; port=8001 },
  @{ name="alt-2"; port=8002 },
  @{ name="alt-3"; port=8003 }
)

foreach ($a in $alts) {
  $dir = Join-Path $base $a.name
  $log = Join-Path $dir "smoke.log"
  if (-not (Test-Path $dir)) {
    Write-Host "skip $($a.name): not found" -ForegroundColor Yellow
    continue
  }
  $proc = Start-Process -FilePath $node `
    -ArgumentList "server\web-server.js" `
    -WorkingDirectory $dir `
    -RedirectStandardOutput $log `
    -RedirectStandardError "$log.err" `
    -PassThru -WindowStyle Hidden
  Set-Content -Path (Join-Path $dir "smoke.pid") -Value $proc.Id
  Write-Host ("started {0,-6} on http://localhost:{1}/  (PID {2})" -f $a.name, $a.port, $proc.Id) -ForegroundColor Green
}

Write-Host ""
Write-Host "Open these in your browser:" -ForegroundColor Cyan
Write-Host "  Alt 1 (Tactical)        http://localhost:8001/"
Write-Host "  Alt 2 (Defense-Tech)    http://localhost:8002/"
Write-Host "  Alt 3 (Ops Console)     http://localhost:8003/"
Write-Host ""
Write-Host "To stop: .\stop-all-alts.ps1" -ForegroundColor Cyan
