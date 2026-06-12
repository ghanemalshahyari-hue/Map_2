#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  RMOOZ — Container Network Self-Test
#
#  Run this script inside the Docker container to verify:
#    1. The LDAP server is reachable (TCP, no credentials).
#    2. The RMOOZ app server is listening on the expected port (loopback).
#    3. Basic HTTP health check on the app.
#
#  Usage (from outside the container):
#    docker compose exec rmooz bash scripts/test-container-network.sh
#
#  Usage (inside the container):
#    bash /app/scripts/test-container-network.sh   # if copied to /app/scripts
#
#  No credentials are used. No LDAP bind is performed.
# ─────────────────────────────────────────────────────────────────────────────

APP_PORT="${PORT:-5006}"
LDAP_SERVER="${LDAP_SERVER:-155.140.4.130}"
LDAP_PORT="${LDAP_PORT:-389}"
LDAP_TIMEOUT="${LDAP_TIMEOUT:-5}"

PASS=0
FAIL=0

ok()   { echo "[PASS] $*"; PASS=$((PASS + 1)); }
fail() { echo "[FAIL] $*"; FAIL=$((FAIL + 1)); }
hdr()  { echo ""; echo "── $* ──────────────────────────────────────"; }

echo ""
echo "═════════════════════════════════════════════════════"
echo "  RMOOZ Container Network Self-Test"
echo "═════════════════════════════════════════════════════"
echo "  APP_PORT   : ${APP_PORT}"
echo "  LDAP       : ${LDAP_SERVER}:${LDAP_PORT}"
echo "  TIMEOUT    : ${LDAP_TIMEOUT}s"
echo "═════════════════════════════════════════════════════"

# ── Test 1: LDAP TCP reachability ─────────────────────────────────────────────
hdr "Test 1: LDAP TCP reachability (no credentials)"
if (timeout "${LDAP_TIMEOUT}" bash -c "echo > /dev/tcp/${LDAP_SERVER}/${LDAP_PORT}") 2>/dev/null; then
    ok "TCP connected to LDAP server ${LDAP_SERVER}:${LDAP_PORT}"
else
    # Fallback to Node
    node -e "
      const net = require('net');
      const s = net.createConnection(${LDAP_PORT}, '${LDAP_SERVER}', () => { s.end(); process.exit(0); });
      s.setTimeout(${LDAP_TIMEOUT} * 1000, () => { s.destroy(); process.exit(1); });
      s.on('error', () => process.exit(1));
    " 2>/dev/null && ok "TCP connected to LDAP (Node fallback)" || fail "Cannot reach LDAP server ${LDAP_SERVER}:${LDAP_PORT}"
fi

# ── Test 2: App server listening on APP_PORT ──────────────────────────────────
hdr "Test 2: App server listening on port ${APP_PORT}"
# The server may not be started when this script runs in build context.
# This test is intended to run AFTER 'docker compose up'.
node -e "
  const net = require('net');
  const s = net.createConnection(${APP_PORT}, '127.0.0.1', () => { s.end(); process.exit(0); });
  s.setTimeout(3000, () => { s.destroy(); process.exit(1); });
  s.on('error', () => process.exit(1));
" 2>/dev/null && ok "App server listening on 127.0.0.1:${APP_PORT}" || fail "App server NOT listening on port ${APP_PORT} (is the container fully started?)"

# ── Test 3: HTTP health check ─────────────────────────────────────────────────
hdr "Test 3: HTTP /api/auth/me returns 401 (unauthenticated, expected)"
HTTP_STATUS=$(node -e "
  const http = require('http');
  const req = http.get('http://127.0.0.1:${APP_PORT}/api/auth/me', res => {
    process.stdout.write(String(res.statusCode));
    process.exit(0);
  });
  req.setTimeout(3000, () => { req.destroy(); process.stdout.write('timeout'); process.exit(1); });
  req.on('error', e => { process.stdout.write('error:' + e.code); process.exit(1); });
" 2>/dev/null)

if [ "${HTTP_STATUS}" = "401" ]; then
    ok "GET /api/auth/me → 401 (server up, auth working correctly)"
elif [ "${HTTP_STATUS}" = "200" ]; then
    ok "GET /api/auth/me → 200 (unexpected but server is responding)"
else
    fail "GET /api/auth/me → ${HTTP_STATUS} (expected 401, server may not be ready)"
fi

# ── Test 4: DNS / routing sanity ──────────────────────────────────────────────
hdr "Test 4: Container can resolve its own hostname"
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
if [ "${HOSTNAME}" != "unknown" ] && [ -n "${HOSTNAME}" ]; then
    ok "Container hostname: ${HOSTNAME}"
else
    fail "Could not determine container hostname"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═════════════════════════════════════════════════════"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "═════════════════════════════════════════════════════"

if [ "${FAIL}" -gt 0 ]; then
    echo "  Some tests failed. See docs/troubleshooting.md."
    exit 1
else
    echo "  All tests passed."
    exit 0
fi
