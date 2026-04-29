# Stop all alts started by start-all-alts.ps1
# Reads each <alt>\smoke.pid and stops that PID.

$base = $PSScriptRoot
foreach ($name in @("alt-1","alt-2","alt-3")) {
  $pidFile = Join-Path $base "$name\smoke.pid"
  if (Test-Path $pidFile) {
    $altPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($altPid) {
      try {
        Stop-Process -Id $altPid -Force -ErrorAction Stop
        Write-Host "stopped $name (PID $altPid)" -ForegroundColor Green
      } catch {
        Write-Host "could not stop $name (PID $altPid): $($_.Exception.Message)" -ForegroundColor Yellow
      }
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
  } else {
    Write-Host "${name}: no smoke.pid file" -ForegroundColor DarkGray
  }
}
