#!/usr/bin/env bash
# scripts/smoke_step1.sh
# =======================
# Phase 3 v1 (MDMP Step 1) operational commands in one place.
#
# Written 2026-04-22 as part of the §18 C17 scope-cut landing.
#
# Usage:
#     bash scripts/smoke_step1.sh preflight         # stack status only
#     bash scripts/smoke_step1.sh rebuild           # drop + re-ingest doctrine
#     bash scripts/smoke_step1.sh smoke-json        # JSON-path smoke (no LLM)
#     bash scripts/smoke_step1.sh smoke-prompt      # prompt-path smoke (extractor + drafter)
#     bash scripts/smoke_step1.sh all               # preflight + smoke-json + smoke-prompt
#     bash scripts/smoke_step1.sh rebuild-and-smoke # destructive: rebuild then both smokes
#     bash scripts/smoke_step1.sh gate-test         # verify v1-scope gate drops OPORD/Staff
#
# Every subcommand is idempotent except `rebuild` (which deletes
# the ingest__doctrine__bgem3 collection before re-ingesting) and
# `rebuild-and-smoke` (same).
#
# Rule: do NOT run `rebuild` while another process is using Qdrant —
# the DELETE interrupts in-flight searches. The smoke subcommands
# are safe to re-run any time.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PY="${PY:-venv/bin/python}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION="${COLLECTION:-ingest__doctrine__bgem3}"

preflight() {
    echo "== preflight =="
    colima status 2>&1 | head -1 || echo "colima: NOT RUNNING — start with \`colima start\`"
    docker ps --filter "name=qdrant" --format "qdrant: {{.Status}}" | head -1
    curl -s "${QDRANT_URL}/readyz" || echo "qdrant: NOT READY"
    echo
    echo "== collections =="
    curl -s "${QDRANT_URL}/collections" | "${PY}" -c "
import sys, json
d = json.load(sys.stdin).get('result', {})
for c in d.get('collections', []):
    print(f\"  {c['name']}\")
"
    echo
    echo "== doctrine collection state (if exists) =="
    curl -s "${QDRANT_URL}/collections/${COLLECTION}" | "${PY}" -c "
import sys, json
r = json.load(sys.stdin).get('result')
if r is None:
    print('  (not present)')
else:
    print(f\"  points_count: {r.get('points_count')}, status: {r.get('status')}\")
" 2>&1 || true
    echo
    echo "== source_doc facet (if populated) =="
    curl -s -X POST "${QDRANT_URL}/collections/${COLLECTION}/facet" \
        -H 'Content-Type: application/json' \
        -d '{"key":"source_doc","exact":true}' | "${PY}" -c "
import sys, json
try:
    hits = json.load(sys.stdin).get('result', {}).get('hits', [])
except Exception:
    hits = []
for h in hits:
    print(f\"  {h['value']}: {h['count']}\")
" 2>&1 || true
}

rebuild() {
    echo "== dropping ${COLLECTION} =="
    curl -s -X DELETE "${QDRANT_URL}/collections/${COLLECTION}"
    echo
    echo "== running main.py =="
    "${PY}" main.py
    echo
    echo "== post-ingest state =="
    preflight
}

smoke_json() {
    echo "== JSON-path smoke (no LLM, exercises renderer + retrieval) =="
    "${PY}" scripts/generate_documents.py \
        --inputs-json data/phase3_inputs.example.json \
        --docs time_analysis initial_planning_guidance \
        --run-id step1_rebuild_smoke
}

smoke_prompt() {
    echo "== prompt-path smoke (extractor LLM + drafter + critique) =="
    "${PY}" scripts/generate_documents.py \
        --prompt data/phase3_prompt.example.txt \
        --docs initial_planning_guidance \
        --run-id step1_prompt_smoke
}

gate_test() {
    echo "== v1-scope gate test (expect OPORD + Staff to skip) =="
    "${PY}" scripts/generate_documents.py \
        --inputs-json data/phase3_inputs.example.json \
        --docs operation_order staff_estimate time_analysis initial_planning_guidance \
        --run-id step1_gate_test
}

case "${1:-all}" in
    preflight)          preflight ;;
    rebuild)            rebuild ;;
    smoke-json)         smoke_json ;;
    smoke-prompt)       smoke_prompt ;;
    gate-test)          gate_test ;;
    all)                preflight; smoke_json; smoke_prompt ;;
    rebuild-and-smoke)  rebuild; smoke_json; smoke_prompt ;;
    *)
        echo "unknown subcommand: $1"
        echo "valid: preflight | rebuild | smoke-json | smoke-prompt | gate-test | all | rebuild-and-smoke"
        exit 2
        ;;
esac
