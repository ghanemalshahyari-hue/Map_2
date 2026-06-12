#!/usr/bin/env bash
# Start tile server (8080) + web server (8000) and open the workspace in your browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/UI_MOdified"
cd "$APP_DIR"

if [[ ! -d node_modules ]]; then
  echo "First run: installing dependencies in UI_MOdified..."
  npm install
fi

echo ""
echo "Starting rmooz (tile server :8080 + web :8000)..."
echo "When ready, open: http://localhost:8000/app.html"
echo "Press Ctrl+C to stop both servers."
echo ""

cleanup() {
  trap - INT TERM
  kill "${TILE_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

node server/tile-server.js &
TILE_PID=$!
node server/web-server.js &
WEB_PID=$!

sleep 2
if command -v open >/dev/null 2>&1; then
  open "http://localhost:8000/app.html" || true
fi

wait
