# ─────────────────────────────────────────────────────────────────────────────
#  RMOOZ — LDAP Connectivity Test (Host / Windows)
#
#  Run this script on the Windows host BEFORE deploying Docker to confirm that
#  the machine can reach the LDAP server on port 389.
#
#  Usage:
#    .\test-ldap-connectivity.ps1
#
#  Optional overrides:
#    .\test-ldap-connectivity.ps1 -LdapServer 155.140.4.130 -LdapPort 389
#
#  No credentials are used or required. This is a TCP-only reachability test.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [string]$LdapServer = "155.140.4.130",
    [int]$LdapPort      = 389,
    [int]$TimeoutMs     = 5000
)

Write-Host ""
Write-Host "─────────────────────────────────────────────────────"
Write-Host "  RMOOZ LDAP Connectivity Test"
Write-Host "─────────────────────────────────────────────────────"
Write-Host "  Target : $LdapServer : $LdapPort"
Write-Host "  Timeout: $TimeoutMs ms"
Write-Host "─────────────────────────────────────────────────────"
Write-Host ""

# ── Test-NetConnection (preferred) ────────────────────────────────────────────
try {
    $result = Test-NetConnection -ComputerName $LdapServer -Port $LdapPort -WarningAction SilentlyContinue
    if ($result.TcpTestSucceeded) {
        Write-Host "[PASS] TCP connection to ${LdapServer}:${LdapPort} succeeded." -ForegroundColor Green
        Write-Host "       PingSucceeded : $($result.PingSucceeded)"
        Write-Host "       RemoteAddress : $($result.RemoteAddress)"
        Write-Host ""
        Write-Host "Result: LDAP server is reachable from this host."
        Write-Host "        The Docker container (using default bridge network) should"
        Write-Host "        also be able to reach it via the host's routing table."
        exit 0
    } else {
        Write-Host "[FAIL] TCP connection to ${LdapServer}:${LdapPort} failed." -ForegroundColor Red
    }
} catch {
    Write-Host "[WARN] Test-NetConnection failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ── Fallback: raw TCP socket ──────────────────────────────────────────────────
Write-Host "       Trying raw socket fallback..."
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $async = $tcp.BeginConnect($LdapServer, $LdapPort, $null, $null)
    $wait = $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
    if ($wait -and $tcp.Connected) {
        $tcp.Close()
        Write-Host "[PASS] Raw socket connected to ${LdapServer}:${LdapPort}." -ForegroundColor Green
        Write-Host ""
        Write-Host "Result: LDAP server is reachable from this host."
        exit 0
    } else {
        $tcp.Close()
        Write-Host "[FAIL] Raw socket timed out or connection refused." -ForegroundColor Red
    }
} catch {
    Write-Host "[FAIL] Raw socket error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Result: LDAP server is NOT reachable from this host." -ForegroundColor Red
Write-Host ""
Write-Host "Troubleshooting:"
Write-Host "  1. Confirm the server IP/port: LDAP_SERVER=$LdapServer, LDAP_PORT=$LdapPort"
Write-Host "  2. Check the host firewall (Windows Defender / corporate firewall)."
Write-Host "  3. Check that the host is on the correct network/VLAN."
Write-Host "  4. Ping the LDAP server: ping $LdapServer"
Write-Host "  5. See docs/troubleshooting.md for more steps."
Write-Host ""
exit 1
