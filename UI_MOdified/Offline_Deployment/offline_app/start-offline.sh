#!/bin/sh
# start-offline.sh — start both tile-server (port 8080) and web-server (port 5006)
# Used as CMD in Offline_Deployment/Dockerfile.offline
#
# tile-server serves MBTiles from /app/maps/ at http://0.0.0.0:8080
# web-server serves the app + API at http://0.0.0.0:5006

set -e

echo "[start-offline] Starting RMOOZ offline stack"
echo "  Tile server  : port ${RMOOZ_TILE_PORT:-8080} (MBTiles from /app/maps/)"
echo "  Web server   : port ${PORT:-5006}"
echo "  DEM path     : ${DEM_PATH:-not configured}"
echo "  Ollama host  : ${OLLAMA_HOST:-not configured}"
echo ""

# Start tile server in background
node server/tile-server.js &
TILE_PID=$!

# Trap SIGTERM so both processes stop cleanly
trap "echo '[start-offline] Stopping...'; kill $TILE_PID 2>/dev/null; exit 0" TERM INT

# Start web server in foreground (container stays alive while this runs)
node server/web-server.js

# If web server exits, kill tile server and propagate exit code
RESULT=$?
kill $TILE_PID 2>/dev/null
exit $RESULT
