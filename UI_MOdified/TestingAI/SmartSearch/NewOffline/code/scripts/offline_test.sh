#!/usr/bin/env bash
# offline_test.sh — run every check that proves the dms_app stack works
# without internet.  Designed to be the FIRST thing you run after pulling
# the ethernet cable.
#
# Total runtime: ~60-120 sec (depends on LLM cold-start in LM Studio).
# Exits non-zero if anything fails.
#
# Usage:
#   ./scripts/offline_test.sh
#
# What it does NOT cover:
#   - Full Phase 1 ingestion (slow on CPU; rerun manually if you want it)
#   - Full Phase 3 .docx generation (slow on CPU; rerun manually if you want it)
# Both are exercised by smaller targeted probes here.

set -u
cd "$(dirname "$0")/.."

GREEN=$'\033[1;32m'
RED=$'\033[1;31m'
YELLOW=$'\033[1;33m'
DIM=$'\033[2m'
RESET=$'\033[0m'

PASS=0
FAIL=0
SKIP=0

heading() {
    printf "\n${YELLOW}── %s ──${RESET}\n" "$1"
}
ok()   { printf "  ${GREEN}✓${RESET} %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  ${RED}✗${RESET} %s\n" "$1"; FAIL=$((FAIL+1)); }
skip() { printf "  ${DIM}–${RESET} %s\n" "$1"; SKIP=$((SKIP+1)); }

run_check() {
    local name="$1"; shift
    local out
    if out=$("$@" 2>&1); then
        ok "$name"
        [ -n "${VERBOSE:-}" ] && printf "${DIM}%s${RESET}\n" "$out" | sed 's/^/      /'
    else
        fail "$name"
        printf "${DIM}%s${RESET}\n" "$out" | sed 's/^/      /' | head -8
    fi
}

# =============================================================================
# 0. ENVIRONMENT
# =============================================================================
heading "0. environment"

if ping -c1 -W1 8.8.8.8 >/dev/null 2>&1; then
    skip "ethernet appears CONNECTED — this script is meant for offline testing (continuing anyway)"
else
    ok "ethernet is DISCONNECTED (8.8.8.8 unreachable) — true offline test"
fi

if curl -s --max-time 2 https://huggingface.co >/dev/null 2>&1; then
    skip "huggingface.co reachable — pipeline shouldn't need it but you're not fully offline"
else
    ok "huggingface.co unreachable — fully offline"
fi

# =============================================================================
# 1. CONTAINERS HEALTHY
# =============================================================================
heading "1. containers"

if docker ps --format '{{.Names}}' | grep -q '^dms_qdrant$'; then
    ok "dms_qdrant is up"
else
    fail "dms_qdrant is not running — start with: docker compose up -d qdrant"
fi

if docker ps --format '{{.Names}}' | grep -q '^infinity-reranker$'; then
    ok "infinity-reranker is up"
else
    fail "infinity-reranker is not running — start with: docker start infinity-reranker"
fi

# Bail early if the model servers aren't even there
if [ "$FAIL" -gt 0 ]; then
    printf "\n${RED}FATAL: containers not running, stopping.${RESET}\n"
    exit 1
fi

# =============================================================================
# 2. SERVICE ENDPOINTS REACHABLE FROM HOST
# =============================================================================
heading "2. host-side endpoint reachability"

run_check "qdrant readyz" curl -sf --max-time 3 http://localhost:6333/readyz
run_check "infinity /models" bash -c 'curl -sf --max-time 3 http://localhost:7997/models | grep -q "bge-reranker"'
run_check "lm-studio /models" bash -c 'curl -sf --max-time 3 http://localhost:1234/v1/models | grep -q "qwen"'

# =============================================================================
# 3. ENDPOINT REACHABILITY FROM INSIDE dms_app
# =============================================================================
heading "3. dms_app container probes"

probe_output=$(docker compose run --rm --no-deps app bash -c '
set -e
echo "--- 3a embedder ---"
python -m graph.shared.embedders probe "تحليل الوقت" 2>&1 | tail -6
echo "--- 3b reranker ---"
python -m graph.retrieval.rerank "MDMP staff coordination" "Staff officers coordinate within mission command framework." "The cat sat on the mat." 2>&1 | tail -6
echo "--- 3c llm factory ---"
python -m graph.shared.llm_factory 2>&1 | tail -8
echo "--- 3d llm round-trip ---"
python -c "
import os
from openai import OpenAI
c = OpenAI(base_url=os.environ[\"LLM_BASE_URL\"], api_key=os.environ[\"LLM_API_KEY\"])
r = c.responses.create(model=os.environ[\"LLM_MODEL\"], input=\"Reply with the single english word: ok\", max_output_tokens=2048)
out = (r.output_text or \"\").strip()
print(\"LLM_OUTPUT=\" + repr(out[:120]))
"
' 2>&1)

if echo "$probe_output" | grep -q "vector dim         : 1024"; then
    ok "embedder returns 1024-dim L2-normalised vector"
else
    fail "embedder probe failed"
    echo "$probe_output" | grep -A4 "3a embedder" | sed 's/^/      /'
fi

if echo "$probe_output" | grep -q "rank 1.*Staff officers"; then
    ok "reranker top-ranks the relevant document"
else
    fail "reranker probe failed"
    echo "$probe_output" | grep -A4 "3b reranker" | sed 's/^/      /'
fi

if echo "$probe_output" | grep -q "Responses API  : ON"; then
    ok "LLM factory resolves Responses API endpoint"
else
    fail "LLM factory failed"
    echo "$probe_output" | grep -A4 "3c llm factory" | sed 's/^/      /'
fi

if echo "$probe_output" | grep -qi "LLM_OUTPUT="; then
    ok "LLM round-trip via OpenAI SDK ($(echo "$probe_output" | grep "LLM_OUTPUT=" | head -1))"
else
    fail "LLM round-trip failed"
    echo "$probe_output" | grep -A4 "3d llm" | sed 's/^/      /'
fi

# =============================================================================
# 4. PHASE 2 RETRIEVAL — EMBEDDER + QDRANT + RERANKER, END-TO-END
# =============================================================================
heading "4. Phase 2 retrieval against real corpus"

retrieval_output=$(docker compose run --rm --no-deps app bash -c '
python -c "
from dotenv import load_dotenv; load_dotenv()
from graph.retrieval.search import search
from graph.retrieval.schema import SearchRequest
res = search(SearchRequest(
    collection=\"ingest__operationalfiles__bgem3\",
    query=\"What does MDMP staff coordination involve?\",
    top_k_out=5,
))
hits = res.hits if hasattr(res,\"hits\") else res
print(f\"HIT_COUNT={len(hits)}\")
for i,h in enumerate(hits[:5],1):
    score = getattr(h,\"rerank_score\", getattr(h,\"score\", None))
    print(f\"  {i}. score={score:+.3f} {h.source_doc[:35]} | {h.text[:80].replace(chr(10),\" \")}\")
"
' 2>&1)

if echo "$retrieval_output" | grep -q "HIT_COUNT=5"; then
    ok "5 hits returned from ingest__operationalfiles__bgem3"
    echo "$retrieval_output" | grep -E "^  [0-9]" | sed 's/^/      /'
else
    fail "retrieval failed"
    echo "$retrieval_output" | tail -20 | sed 's/^/      /'
fi

# =============================================================================
# 5. OFFLINE ARCHITECTURE SMOKES (pure code, no network)
# =============================================================================
heading "5. offline architecture smokes"

arch_output=$(docker compose run --rm --no-deps app bash -c '
ok=0; fail=0
for cmd in \
    "python -m graph.generation.template_loader" \
    "python -m graph.generation.evidence" \
    "python -m graph.generation.cache" \
    "python -m graph.generation.coverage" \
    "python -m graph.generation.section_drafter" \
    "python -m graph.generation.critique" \
    "python scripts/tiered_retrieval_smoke.py"; do
    if eval "$cmd" >/dev/null 2>&1; then ok=$((ok+1)); else fail=$((fail+1)); fi
done
echo "ARCH_OK=$ok ARCH_FAIL=$fail"
' 2>&1)

if echo "$arch_output" | grep -q "ARCH_FAIL=0"; then
    counts=$(echo "$arch_output" | grep -oE "ARCH_OK=[0-9]+ ARCH_FAIL=[0-9]+")
    ok "all 7 offline smokes pass ($counts)"
else
    fail "some offline smokes failed"
    echo "$arch_output" | tail -10 | sed 's/^/      /'
fi

# =============================================================================
# SUMMARY
# =============================================================================
heading "summary"
printf "  passed:  %d\n" "$PASS"
printf "  failed:  %d\n" "$FAIL"
[ "$SKIP" -gt 0 ] && printf "  skipped: %d\n" "$SKIP"

if [ "$FAIL" -eq 0 ]; then
    printf "\n${GREEN}✓ all offline checks passed — pipeline works without internet${RESET}\n\n"
    exit 0
else
    printf "\n${RED}✗ %d check(s) failed — see above${RESET}\n\n" "$FAIL"
    exit 1
fi
