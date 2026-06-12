#!/usr/bin/env bash
# start.sh
# =========
# One-command bring-up for the DecisionMakingSteps project:
#
#   1. Preflight  — confirm .env, venv, streamlit, and docker CLI exist.
#   2. Runtime    — start colima + the qdrant Docker container if they are
#                   not already running; wait for Qdrant's /readyz.
#   3. Ingestion  — run `python main.py` (idempotent; the per-stage sha256
#                   cache gate skips unchanged documents, so re-running is
#                   cheap when nothing has changed).
#   4. UI         — launch the Streamlit retrieval UI.
#
# THE PROMPT THAT CONTROLS INGESTION
# ----------------------------------
# The per-document LLM gate (check_documents) uses
# SUFFICIENCY_CHECK_PROMPT defined in:
#
#     graph/prompts.py
#
# Edit that file to change which documents the gate accepts or rejects.
# After editing, re-run this script — the ingestion pass will use the new
# prompt automatically.
#
# USAGE
# -----
#     ./start.sh                  # full bring-up + ingest + UI
#     SKIP_INGEST=1 ./start.sh    # skip ingestion, just open the UI
#     UI_PORT=8510 ./start.sh     # launch the UI on a different port
#     NO_UI=1 ./start.sh          # ingest only, do not launch the UI
#     BOOTSTRAP=1 ./start.sh      # (first-time setup) create venv and
#                                 #   pip install -r requirements.txt
#                                 #   before anything else
#
# The script is safe to re-run: every step short-circuits when it sees
# the thing it wanted is already in place.  Closing your laptop and
# re-running this script brings the whole stack back up — colima,
# qdrant, ingestion, UI — in one command.
# =========================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PY="$REPO_ROOT/venv/bin/python"
VENV_STREAMLIT="$REPO_ROOT/venv/bin/streamlit"
PROMPTS_FILE="$REPO_ROOT/graph/prompts.py"
MAIN_PY="$REPO_ROOT/main.py"
UI_PY="$REPO_ROOT/ui/app.py"
UI_PORT="${UI_PORT:-8501}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_CONTAINER_NAME="${QDRANT_CONTAINER_NAME:-qdrant}"
QDRANT_IMAGE="${QDRANT_IMAGE:-qdrant/qdrant:latest}"
QDRANT_VOLUME="${QDRANT_VOLUME:-qdrant_storage}"

cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Pretty-printing
# ---------------------------------------------------------------------------
# Only emit colour when stdout is a TTY; otherwise pipe-safe plain text.
if [[ -t 1 ]]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'; C_DIM=$'\033[2m';   C_RESET=$'\033[0m'
else
  C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_DIM=""; C_RESET=""
fi

banner() { printf "\n%s==== %s ====%s\n" "$C_BOLD" "$*" "$C_RESET"; }
ok()     { printf "  %s[ok]%s %s\n"    "$C_GREEN"  "$C_RESET" "$*"; }
info()   { printf "  %s[info]%s %s\n"  "$C_DIM"    "$C_RESET" "$*"; }
warn()   { printf "  %s[warn]%s %s\n"  "$C_YELLOW" "$C_RESET" "$*"; }
die()    { printf "  %s[error]%s %s\n" "$C_RED"    "$C_RESET" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Step 0 — optional bootstrap (first-time setup)
# ---------------------------------------------------------------------------
# BOOTSTRAP=1 creates venv and installs requirements.txt before the
# rest of the script runs.  Skip it on every subsequent run.

if [[ -n "${BOOTSTRAP:-}" ]]; then
  banner "Bootstrap"
  if [[ ! -x "$VENV_PY" ]]; then
    if ! command -v python3.12 >/dev/null 2>&1; then
      die "python3.12 not found on PATH — install it first (brew install python@3.12)"
    fi
    info "creating venv at $REPO_ROOT/venv ..."
    python3.12 -m venv "$REPO_ROOT/venv"
    ok "venv created"
  else
    ok "venv already exists"
  fi
  info "pip install -r requirements.txt ..."
  "$VENV_PY" -m pip install --upgrade pip >/dev/null
  "$VENV_PY" -m pip install -r "$REPO_ROOT/requirements.txt"
  ok "dependencies installed"
fi

# ---------------------------------------------------------------------------
# Step 1 — preflight
# ---------------------------------------------------------------------------
banner "Preflight"

[[ -f "$REPO_ROOT/.env" ]] \
  || die ".env missing at $REPO_ROOT/.env — create it with OPENAI_API_KEY (any OpenAI-compatible endpoint, e.g. LM Studio) and any overrides."
[[ -x "$VENV_PY" ]] \
  || die "venv missing at $REPO_ROOT/venv — run: BOOTSTRAP=1 ./start.sh  (one-time)"
[[ -x "$VENV_STREAMLIT" ]] \
  || die "streamlit missing in venv — run: BOOTSTRAP=1 ./start.sh  (one-time)"
[[ -f "$MAIN_PY" ]]   || die "missing $MAIN_PY (repo may be incomplete)"
[[ -f "$UI_PY" ]]     || die "missing $UI_PY (repo may be incomplete)"
ok ".env, venv, streamlit, entry points present"

info "Ingestion prompt (edit to change what the LLM gate accepts):"
printf "      %s%s%s\n" "$C_BOLD" "$PROMPTS_FILE" "$C_RESET"
info "  constant: SUFFICIENCY_CHECK_PROMPT  (see graph/nodes/check_documents.py for usage)"

# ---------------------------------------------------------------------------
# Step 2 — colima + docker + qdrant
# ---------------------------------------------------------------------------
banner "Container runtime + Qdrant"

if command -v colima >/dev/null 2>&1; then
  if colima status >/dev/null 2>&1; then
    ok "colima already running"
  else
    info "starting colima ..."
    colima start >/dev/null
    ok "colima started"
  fi
else
  warn "colima not found on PATH — assuming Docker Desktop or another docker provider is available"
fi

if ! command -v docker >/dev/null 2>&1; then
  die "docker CLI not found on PATH"
fi
if ! docker ps >/dev/null 2>&1; then
  die "docker daemon not responding — start Docker Desktop or colima first"
fi
ok "docker daemon responding"

if docker ps --format '{{.Names}}' | grep -Fxq "$QDRANT_CONTAINER_NAME"; then
  ok "qdrant container already running"
elif docker ps -a --format '{{.Names}}' | grep -Fxq "$QDRANT_CONTAINER_NAME"; then
  info "starting existing qdrant container ..."
  docker start "$QDRANT_CONTAINER_NAME" >/dev/null
  ok "qdrant container started"
else
  info "creating + starting qdrant container ..."
  docker run -d --name "$QDRANT_CONTAINER_NAME" \
    -p 6333:6333 -p 6334:6334 \
    -v "$QDRANT_VOLUME":/qdrant/storage \
    "$QDRANT_IMAGE" >/dev/null
  ok "qdrant container created"
fi

info "waiting for Qdrant at $QDRANT_URL/readyz ..."
for i in $(seq 1 30); do
  if curl -sf -o /dev/null "$QDRANT_URL/readyz"; then
    ok "Qdrant ready"
    break
  fi
  sleep 1
done
curl -sf -o /dev/null "$QDRANT_URL/readyz" \
  || die "Qdrant did not become ready in 30s (check: docker logs $QDRANT_CONTAINER_NAME)"

# ---------------------------------------------------------------------------
# Step 3 — ingestion
# ---------------------------------------------------------------------------
banner "Ingestion"

if [[ -n "${SKIP_INGEST:-}" ]]; then
  info "SKIP_INGEST is set — skipping the ingestion pass"
else
  # Count folders under inputs/ without requiring bash 4+ arrays semantics.
  folder_count=$(find "$REPO_ROOT/inputs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$folder_count" -eq 0 ]]; then
    warn "no folders under inputs/ — skipping ingestion"
    warn "  drop a folder of documents at inputs/<folder_name>/ and re-run this script"
  else
    info "found $folder_count folder(s) under inputs/:"
    find "$REPO_ROOT/inputs" -mindepth 1 -maxdepth 1 -type d | while read -r d; do
      info "  - $(basename "$d")"
    done
    info "running main.py (per-stage sha256 cache gate skips unchanged documents)"
    echo
    "$VENV_PY" "$MAIN_PY"
    ok "ingestion pass finished"
  fi
fi

# ---------------------------------------------------------------------------
# Step 4 — launch the UI
# ---------------------------------------------------------------------------
banner "Streamlit UI"

if [[ -n "${NO_UI:-}" ]]; then
  info "NO_UI is set — not launching the UI"
  info "to launch it later:  streamlit run ui/app.py"
  exit 0
fi

# Fail fast if the port is already in use (something else is listening).
if lsof -sTCP:LISTEN -iTCP:"$UI_PORT" >/dev/null 2>&1; then
  warn "port $UI_PORT is already in use"
  warn "  either open it in your browser, or relaunch with: UI_PORT=8510 ./start.sh"
  exit 0
fi

printf "\n%s=== READY ===%s\n" "$C_BOLD$C_GREEN" "$C_RESET"
printf "  UI        : %shttp://localhost:%s%s\n" "$C_BOLD" "$UI_PORT" "$C_RESET"
printf "  Dashboard : %shttp://localhost:6333/dashboard%s  (Qdrant admin)\n" "$C_BOLD" "$C_RESET"
printf "  Prompt    : %s%s%s\n" "$C_BOLD" "$PROMPTS_FILE" "$C_RESET"
printf "              edit SUFFICIENCY_CHECK_PROMPT, then re-run ./start.sh\n"
printf "  Stop UI   : Ctrl+C in this terminal\n"
printf "  Stop all  : pkill -f 'streamlit run'  &&  docker stop %s  &&  colima stop\n\n" \
  "$QDRANT_CONTAINER_NAME"

exec "$VENV_STREAMLIT" run "$UI_PY" \
  --server.port "$UI_PORT" \
  --browser.gatherUsageStats false
