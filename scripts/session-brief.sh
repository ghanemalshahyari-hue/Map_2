#!/usr/bin/env bash
# session-brief.sh — cheap SessionStart orientation for RMOOZ/CMO.
#
# Emits a one-line "session brief" (branch, uncommitted count, and how stale
# APP_INVENTORY.md is) as SessionStart hook JSON so Claude sees it before the
# first message. Reads the AUDIT_SHA marker on line 1 of APP_INVENTORY.md and
# counts commits since. Must stay fast (<1s) and must never break the session.
#
# Wired via .claude/settings.json -> hooks.SessionStart. Safe to run by hand:
#   bash scripts/session-brief.sh   ->   prints the JSON it would inject.

set -uo pipefail

emit() {
  # $1 = plain message. Keep it free of double-quotes and backslashes so this
  # manual JSON stays valid (emoji / UTF-8 are fine inside a JSON string).
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$1"
  exit 0
}

# Resolve repo root: prefer the harness-provided dir, else the script's parent.
ROOT="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)" || ROOT="$PWD"
fi
cd "$ROOT" 2>/dev/null || true

INV="$ROOT/APP_INVENTORY.md"

# Not a git repo? Still give a useful brief.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -f "$INV" ]; then
    emit "RMOOZ session brief — (not a git repo) · consult APP_INVENTORY.md before building."
  fi
  emit "RMOOZ session brief — (not a git repo) · no APP_INVENTORY.md found; run /audit-app to create the app map."
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
[ -z "$DIRTY" ] && DIRTY=0

BASE="RMOOZ session brief — branch: ${BRANCH} · ${DIRTY} uncommitted file(s)"

# No inventory yet -> tell Claude to bootstrap one.
if [ ! -f "$INV" ]; then
  emit "${BASE} · APP_INVENTORY.md not found — run /audit-app to create the app map."
fi

# Pull the audited SHA from the line-1 marker: <!-- AUDIT_SHA: <hex> -->
SHA="$(grep -m1 -oE 'AUDIT_SHA: [0-9a-f]{7,40}' "$INV" 2>/dev/null | awk '{print $2}')"

if [ -z "$SHA" ]; then
  emit "${BASE} · APP_INVENTORY.md has no AUDIT_SHA stamp — run /audit-app to refresh it."
fi

SHORT="${SHA:0:7}"

# Is the audited commit in this history? If so, count commits since.
if git cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  SINCE="$(git rev-list --count "${SHA}..HEAD" 2>/dev/null || echo 0)"
  [ -z "$SINCE" ] && SINCE=0
  if [ "$SINCE" -gt 0 ]; then
    emit "${BASE} · APP_INVENTORY.md last audited ${SHORT}; ${SINCE} commit(s) since. WARNING: map may be stale — per CLAUDE.md, offer to run /audit-app before substantial work."
  fi
  emit "${BASE} · APP_INVENTORY.md is fresh (audited ${SHORT}). Consult it before building."
fi

# SHA recorded but not reachable (rebased / different branch).
emit "${BASE} · APP_INVENTORY.md audited at ${SHORT} (not in current history — rebased?). Consider /audit-app to re-stamp."
