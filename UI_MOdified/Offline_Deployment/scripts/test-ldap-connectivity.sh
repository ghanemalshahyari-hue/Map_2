#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  RMOOZ — LDAP Connectivity Test (Linux / Container)
#
#  Run this script inside the Docker container (or on a Linux host) to confirm
#  that the LDAP server is reachable on port 389 over TCP.
#
#  Usage (inside container):
#    docker compose exec rmooz bash scripts/test-ldap-connectivity.sh
#
#  Usage (on Linux host):
#    bash Offline_Deployment/scripts/test-ldap-connectivity.sh
#
#  Optional env overrides:
#    LDAP_SERVER=155.140.4.130 LDAP_PORT=389 bash test-ldap-connectivity.sh
#
#  No credentials are used or required. This is a TCP-only reachability test.
# ─────────────────────────────────────────────────────────────────────────────

LDAP_SERVER="${LDAP_SERVER:-155.140.4.130}"
LDAP_PORT="${LDAP_PORT:-389}"
TIMEOUT="${LDAP_TIMEOUT:-5}"

echo ""
echo "─────────────────────────────────────────────────────"
echo "  RMOOZ LDAP Connectivity Test (Linux/Container)"
echo "─────────────────────────────────────────────────────"
echo "  Target : ${LDAP_SERVER}:${LDAP_PORT}"
echo "  Timeout: ${TIMEOUT}s"
echo "─────────────────────────────────────────────────────"
echo ""

pass() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*"; }
info() { echo "       $*"; }

# ── Method 1: nc (netcat) ─────────────────────────────────────────────────────
if command -v nc >/dev/null 2>&1; then
    echo "Testing with nc (netcat)..."
    if nc -z -w "${TIMEOUT}" "${LDAP_SERVER}" "${LDAP_PORT}" 2>/dev/null; then
        pass "nc: TCP connection to ${LDAP_SERVER}:${LDAP_PORT} succeeded."
        echo ""
        echo "Result: LDAP server is reachable."
        exit 0
    else
        fail "nc: TCP connection to ${LDAP_SERVER}:${LDAP_PORT} failed."
    fi
fi

# ── Method 2: bash /dev/tcp ───────────────────────────────────────────────────
echo "Testing with bash /dev/tcp fallback..."
if (timeout "${TIMEOUT}" bash -c "echo > /dev/tcp/${LDAP_SERVER}/${LDAP_PORT}") 2>/dev/null; then
    pass "bash /dev/tcp: connected to ${LDAP_SERVER}:${LDAP_PORT}."
    echo ""
    echo "Result: LDAP server is reachable."
    exit 0
else
    fail "bash /dev/tcp: could not connect to ${LDAP_SERVER}:${LDAP_PORT}."
fi

# ── Method 3: Node.js TCP (always available in the container) ─────────────────
echo "Testing with Node.js TCP fallback..."
node -e "
  const net = require('net');
  const timeout = parseInt(process.env.LDAP_TIMEOUT || '5') * 1000;
  const s = net.createConnection(${LDAP_PORT}, '${LDAP_SERVER}', () => {
    console.log('[PASS] Node: TCP connection to ${LDAP_SERVER}:${LDAP_PORT} succeeded.');
    s.end();
    process.exit(0);
  });
  s.setTimeout(timeout, () => {
    console.error('[FAIL] Node: connection timed out after ' + timeout + 'ms.');
    s.destroy();
    process.exit(1);
  });
  s.on('error', e => {
    console.error('[FAIL] Node: ' + e.message);
    process.exit(1);
  });
" && {
    echo ""
    echo "Result: LDAP server is reachable."
    exit 0
}

# ── All methods failed ────────────────────────────────────────────────────────
echo ""
echo "Result: LDAP server is NOT reachable."
echo ""
echo "Troubleshooting:"
echo "  1. Confirm LDAP_SERVER=${LDAP_SERVER} and LDAP_PORT=${LDAP_PORT} in .env.offline"
echo "  2. If running inside Docker: is the container on the correct network?"
echo "     - Default bridge should route through host's routing table."
echo "     - Try: docker compose exec rmooz node -e \"require('net').createConnection(389,'155.140.4.130',()=>{console.log('OK');process.exit(0)}).on('error',e=>{console.error(e.message);process.exit(1)})\""
echo "  3. Check that port 389 is not blocked by a container/host firewall rule."
echo "  4. See docs/troubleshooting.md for more steps."
echo ""
exit 1
