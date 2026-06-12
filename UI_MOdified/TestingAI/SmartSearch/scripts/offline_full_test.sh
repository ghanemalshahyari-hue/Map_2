#!/usr/bin/env bash
# offline_full_test.sh — full end-to-end offline test on a tiny corpus.
#
# Prints live progress so you always see what's happening.  Long-blocking
# LLM calls show a heartbeat with elapsed seconds so you can tell the
# difference between "working" and "hung".
#
# Total runtime offline: ~3-15 minutes (mostly LM Studio LLM time).
#
# Usage:
#   ./scripts/offline_full_test.sh
#   KEEP_INPUTS=1 ./scripts/offline_full_test.sh     # don't swap PDFs aside

set -u
cd "$(dirname "$0")/.."

GREEN=$'\033[1;32m'
RED=$'\033[1;31m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[1;36m'
DIM=$'\033[2m'
RESET=$'\033[0m'

PASS=0
FAIL=0
SKIP=0
SCRIPT_START=$(date +%s)

TOTAL_STEPS=5
STEP=0

step() {
    STEP=$((STEP+1))
    local elapsed=$(( $(date +%s) - SCRIPT_START ))
    printf "\n${CYAN}━━━ STEP %d/%d (T+%ds) — %s ━━━${RESET}\n" "$STEP" "$TOTAL_STEPS" "$elapsed" "$1"
}
ok()    { printf "  ${GREEN}✓${RESET} %s\n" "$1"; PASS=$((PASS+1)); }
fail()  { printf "  ${RED}✗${RESET} %s\n" "$1"; FAIL=$((FAIL+1)); }
skip()  { printf "  ${DIM}–${RESET} %s\n" "$1"; SKIP=$((SKIP+1)); }
note()  { printf "    ${DIM}%s${RESET}\n" "$1"; }
log()   { printf "    ${DIM}%s${RESET}\n" "$1"; }

# Run a long command, streaming its output into the terminal AND a log file.
# Also runs a background heartbeat that prints elapsed seconds every 10s.
# Usage:  run_with_progress <step-name> <log-path> -- <cmd…>
run_with_progress() {
    local label="$1"; shift
    local logfile="$1"; shift
    [ "$1" = "--" ] && shift
    local start=$(date +%s)

    # Heartbeat: prints elapsed time every 10s, killed when command finishes.
    (
        while :; do
            sleep 10
            local elapsed=$(( $(date +%s) - start ))
            local mm=$((elapsed/60))
            local ss=$((elapsed%60))
            printf "    ${YELLOW}♥${RESET} ${DIM}%s — %dm%02ds elapsed…${RESET}\n" "$label" "$mm" "$ss"
        done
    ) &
    local hb_pid=$!
    # Make sure the heartbeat dies if THIS shell dies.
    trap "kill $hb_pid 2>/dev/null" RETURN

    # Run the command, mirror to log + terminal (indented).
    # Capture exit code via PIPESTATUS without enabling set -e (the script
    # uses fail-counter guards, NOT errexit — turning on set -e here would
    # leak into the rest of the script and exit on any false [ ] test).
    "$@" 2>&1 | tee "$logfile" | sed "s/^/    ${DIM}│${RESET} /"
    local rc=${PIPESTATUS[0]}

    kill "$hb_pid" 2>/dev/null
    wait "$hb_pid" 2>/dev/null

    local elapsed=$(( $(date +%s) - start ))
    printf "    ${DIM}└─ exit=%d, elapsed=%ds${RESET}\n" "$rc" "$elapsed"
    return "$rc"
}

# Always restore the user's PDFs even if we crash.
# CRITICAL: the backup MUST live OUTSIDE inputs/ — main.py walks every
# sub-folder of inputs/ and would try to ingest the backed-up PDFs too.
INPUTS_BACKUP="$(pwd)/.smoketest_pdfs_backup"
SMOKE_DOC="scripts/_smoketest_doc.md"
restore() {
    if [ -d "$INPUTS_BACKUP" ] && [ -z "${KEEP_INPUTS:-}" ]; then
        printf "\n${DIM}restoring inputs/operationalfiles/${RESET}\n"
        mkdir -p inputs/operationalfiles
        mv "$INPUTS_BACKUP"/* inputs/operationalfiles/ 2>/dev/null || true
        rmdir "$INPUTS_BACKUP" 2>/dev/null || true
    fi
}
trap restore EXIT INT TERM

# =============================================================================
# STEP 1 — environment + local services
# =============================================================================
step "environment + local services"

if ping -c1 -W1 8.8.8.8 >/dev/null 2>&1; then
    skip "ethernet appears CONNECTED — meant for AFTER you pull the wire (continuing anyway)"
else
    ok "8.8.8.8 unreachable — ethernet is disconnected"
fi
if curl -s --max-time 2 https://huggingface.co >/dev/null 2>&1; then
    skip "huggingface.co reachable — pipeline doesn't need it but you're not fully offline"
else
    ok "huggingface.co unreachable — fully offline"
fi

if docker ps --format '{{.Names}}' | grep -q '^dms_qdrant$'; then ok "dms_qdrant up"
else note "starting dms_qdrant"; docker compose up -d qdrant >/dev/null 2>&1 && ok "dms_qdrant started" || fail "dms_qdrant failed to start"; fi
if docker ps --format '{{.Names}}' | grep -q '^infinity-reranker$'; then ok "infinity-reranker up"
else note "starting infinity-reranker"; docker start infinity-reranker >/dev/null 2>&1 && ok "infinity-reranker started" || fail "infinity-reranker failed to start"; fi
if [ "$FAIL" -gt 0 ]; then printf "\n${RED}FATAL: containers not running${RESET}\n"; exit 1; fi

curl -sf --max-time 3 http://localhost:6333/readyz                            >/dev/null && ok "qdrant /readyz"            || fail "qdrant unreachable"
curl -sf --max-time 3 http://localhost:7997/models | grep -q "bge-reranker"   >/dev/null && ok "infinity reranker loaded"  || fail "infinity not serving bge-reranker"
curl -sf --max-time 3 http://localhost:1234/v1/models | grep -q "qwen"        >/dev/null && ok "lm-studio LLM (qwen)"      || fail "lm-studio LLM not loaded"
curl -sf --max-time 3 http://localhost:1234/v1/models | grep -q "bge-m3"      >/dev/null && ok "lm-studio embedder bge-m3" || fail "lm-studio embedder not loaded"
[ "$FAIL" -gt 0 ] && { printf "\n${RED}FATAL: model servers not ready${RESET}\n"; exit 1; }

# =============================================================================
# STEP 2 — endpoint probes from inside dms_app
# =============================================================================
step "dms_app container probes (embedder, reranker, LLM)"

note "running 4 probes inside the container — should take ~15-30s"
probe_log="output/_probe.log"; mkdir -p output
run_with_progress "endpoint probes" "$probe_log" -- \
docker compose run --rm --no-deps app bash -c '
set -e
echo "[probe 2a] embedder"
python -m graph.shared.embedders probe "MDMP staff coordination" 2>&1 | tail -6
echo "[probe 2b] reranker"
python -m graph.retrieval.rerank "MDMP staff coordination" "Staff officers coordinate within mission command framework." "The cat sat on the mat." 2>&1 | tail -6
echo "[probe 2c] llm-factory"
python -m graph.shared.llm_factory 2>&1 | tail -8
echo "[probe 2d] llm-roundtrip"
python -c "
import os
from openai import OpenAI
c = OpenAI(base_url=os.environ[\"LLM_BASE_URL\"], api_key=os.environ[\"LLM_API_KEY\"])
r = c.responses.create(model=os.environ[\"LLM_MODEL\"], input=\"Reply with the single english word: ok\", max_output_tokens=2048)
print(\"LLM_OUTPUT=\" + repr((r.output_text or \"\").strip()[:60]))
"' || true

probe_output=$(cat "$probe_log")
echo "$probe_output" | grep -q "vector dim         : 1024" && ok "embedder returns 1024-dim L2-normalised vector" || fail "embedder probe failed"
echo "$probe_output" | grep -q "rank 1.*Staff officers"     && ok "reranker top-ranks the relevant doc"            || fail "reranker probe failed"
echo "$probe_output" | grep -q "Responses API  : ON"        && ok "LLM factory resolves Responses API"             || fail "LLM factory failed"
echo "$probe_output" | grep -qi "LLM_OUTPUT="                && ok "LLM round-trip OK ($(echo "$probe_output" | grep "LLM_OUTPUT=" | head -1 | tr -d '\r' | sed 's/^ *//;s/ *$//'))" || fail "LLM round-trip failed"
[ "$FAIL" -gt 0 ] && { printf "\n${RED}FATAL: probes failed${RESET}\n"; exit 1; }

# =============================================================================
# STEP 3 — fresh ingest state
# =============================================================================
step "fresh ingest state"

if [ -z "${KEEP_INPUTS:-}" ]; then
    [ -f "$SMOKE_DOC" ] || { fail "$SMOKE_DOC missing"; exit 1; }
    note "moving inputs/operationalfiles/* aside to $INPUTS_BACKUP"
    mkdir -p "$INPUTS_BACKUP"
    if compgen -G "inputs/operationalfiles/*" >/dev/null; then
        mv inputs/operationalfiles/* "$INPUTS_BACKUP"/ 2>/dev/null || true
    fi
    note "dropping smoketest doc into inputs/operationalfiles/smoketest_mdmp.md"
    cp "$SMOKE_DOC" "inputs/operationalfiles/smoketest_mdmp.md"
    ok "tiny corpus prepared (1 file, $(wc -c < "$SMOKE_DOC") bytes)"
else
    skip "KEEP_INPUTS=1 — using existing inputs/operationalfiles/"
fi

note "wiping output/ + output_docs/ + qdrant_storage volume"
docker run --rm -v "$(pwd)/output:/o" -v "$(pwd)/output_docs:/od" busybox:1.37 sh -c 'rm -rf /o/* /od/*' >/dev/null 2>&1 || true
docker compose down >/dev/null 2>&1 || true
docker volume rm decisionmakingsteps_transfer_qdrant_storage qdrant_storage >/dev/null 2>&1 || true
docker compose up -d qdrant >/dev/null 2>&1 || { fail "could not restart qdrant after volume wipe"; exit 1; }
for i in $(seq 1 15); do curl -sf --max-time 1 http://localhost:6333/readyz >/dev/null 2>&1 && break; sleep 1; done
ok "fresh qdrant ready (0 collections)"

# =============================================================================
# STEP 4 — Phase 1 ingestion (live streaming)
# =============================================================================
step "Phase 1 ingestion (live output below — line per stage)"
note "expected stages: initialpages_convert → check_documents (LLM gate) → convert_document → chunk_document → enrich_chunks → embed_chunks → upsert_to_qdrant"
note "tiny .txt should ingest in ~30-90s on CPU"

run_with_progress "Phase 1 main.py" "output/_ingest.log" -- \
docker compose run --rm app python main.py
ingest_exit=$?

if [ "$ingest_exit" -eq 0 ]; then ok "main.py exited 0"
else fail "main.py exited $ingest_exit"; tail -30 output/_ingest.log | sed 's/^/      /'; exit 1; fi

if grep -q "Accepted : 1" output/_ingest.log; then
    ok "Phase 1 LLM gate accepted the smoketest doc"
else
    n=$(grep "Accepted :" output/_ingest.log | tail -1 | awk '{print $NF}' || echo 0)
    [ "${n:-0}" -gt 0 ] 2>/dev/null && ok "Phase 1 accepted ${n} doc(s)" || fail "no docs accepted by gate"
fi

# main.py runs every doc inside a try/except (skip-and-log) and ALWAYS
# returns exit 0 — even when every stage failed.  Inspect the final
# Status: line, plus the chunk count, to detect silent failures.
status_line=$(grep -E "^\s+\[result\]\s+Status\s+:" output/_ingest.log | tail -1 | awk '{print $NF}' || echo unknown)
chunks=$(grep -E "^\s+\[result\]\s+Chunks\s+:" output/_ingest.log | tail -1 | awk '{print $NF}' || echo 0)
if [ "$status_line" = "ok" ]; then
    ok "Phase 1 result Status=ok with ${chunks} chunks"
elif [ "$status_line" = "partial" ] && [ "${chunks:-0}" -gt 0 ] 2>/dev/null; then
    ok "Phase 1 result Status=partial with ${chunks} chunks (some non-fatal warnings)"
else
    fail "Phase 1 result Status=${status_line} chunks=${chunks} — see output/_ingest.log"
    grep -E "^\s+ERROR" output/_ingest.log | head -5 | sed 's/^/      /'
fi

points=$(curl -s -X POST http://localhost:6333/collections/ingest__operationalfiles__bgem3/points/count -H "Content-Type: application/json" -d '{}' 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('count',0))" 2>/dev/null || echo 0)
[ "$points" -gt 0 ] && ok "Qdrant has $points points" || fail "Qdrant collection is empty"

# =============================================================================
# STEP 5 — Phase 2 retrieval
# =============================================================================
step "Phase 2 retrieval against the freshly-ingested collection"

run_with_progress "Phase 2 search()" "output/_retrieval.log" -- \
docker compose run --rm --no-deps app bash -c '
python -c "
from dotenv import load_dotenv; load_dotenv()
from graph.retrieval.search import search
from graph.retrieval.schema import SearchRequest
res = search(SearchRequest(
    collection=\"ingest__operationalfiles__bgem3\",
    query=\"What is the 1/3-2/3 rule and what does it mean for time management?\",
    top_k_out=3,
))
hits = res.hits if hasattr(res,\"hits\") else res
print(f\"HIT_COUNT={len(hits)}\")
for i,h in enumerate(hits[:3],1):
    score = getattr(h,\"rerank_score\", getattr(h,\"score\", None))
    print(f\"  {i}. score={score:+.3f} {h.source_doc[:35]} | {h.text[:90].replace(chr(10),\" \")}\")
"' || true

if grep -q "HIT_COUNT=" output/_retrieval.log; then
    n=$(grep -oE "HIT_COUNT=[0-9]+" output/_retrieval.log | cut -d= -f2)
    [ "$n" -gt 0 ] && ok "$n hits returned with rerank scores" || fail "0 hits returned"
else
    fail "retrieval crashed"; tail -15 output/_retrieval.log | sed 's/^/      /'
fi

# Phase 3 generation step intentionally omitted — slow on CPU (3-15min on
# Qwen3-4B), and the model wiring it would exercise is already proven by
# step 2 (LLM round-trip) + step 4 (LLM-driven Phase 1 gate) + step 5
# (embedder + reranker + Qdrant via search()).  Re-add by running:
#   docker compose run --rm app python scripts/generate_documents.py …
# manually whenever you actually need a .docx.

# =============================================================================
# SUMMARY
# =============================================================================
total_elapsed=$(( $(date +%s) - SCRIPT_START ))
mm=$((total_elapsed/60)); ss=$((total_elapsed%60))
printf "\n${CYAN}━━━ summary ━━━${RESET}\n"
printf "  passed:  %d\n" "$PASS"
printf "  failed:  %d\n" "$FAIL"
[ "$SKIP" -gt 0 ] && printf "  skipped: %d\n" "$SKIP"
printf "  total elapsed: %dm%02ds\n" "$mm" "$ss"

if [ "$FAIL" -eq 0 ]; then
    printf "\n${GREEN}✓ OFFLINE TEST PASSED — probes + ingestion + retrieval all work without internet${RESET}\n\n"
    printf "  logs:\n"
    printf "    output/_probe.log\n"
    printf "    output/_ingest.log\n"
    printf "    output/_retrieval.log\n\n"
    exit 0
else
    printf "\n${RED}✗ %d check(s) failed — see above${RESET}\n\n" "$FAIL"
    exit 1
fi
