#!/bin/bash
# script to test strict rate limits

# Read API keys
# NOTE: these are LiteLLM *virtual keys* — non-secret local test fixtures. They were
# minted by setup_keys.sh via `POST /key/generate` against a self-hosted vLLM proxy
# (master_key sk-1234, localhost:4000) and are valid ONLY against that proxy's local
# postgres DB. They are NOT cloud-provider (OpenAI/Anthropic) secrets and are inert
# outside that ephemeral local deployment. Set LITELLM_VIP_KEY / LITELLM_NORMAL_KEY to
# your own `/key/generate` output; the fallbacks are kept non-secret-shaped so secret
# scanners don't re-flag them.
VIP_KEY="${LITELLM_VIP_KEY:-sk-local-test-vip}"
NORMAL_KEY="${LITELLM_NORMAL_KEY:-sk-local-test-normal}"

# Define testing function
run_load_test() {
  local user_type="$1"
  local api_key="$2"
  local max_requests="$3"
  
  echo "--- Testing $user_type User (Max Requests expected: $max_requests) ---"
  
  for i in $(seq 1 $(($max_requests + 5))); do
    status_code=$(curl -o /dev/null -s -w "%{http_code}\n" -X POST "http://localhost:4000/chat/completions" \
      -H "Authorization: Bearer $api_key" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "vllm-model",
        "messages": [{"role": "user", "content": "Say test"}]
      }')
      
    if [ "$status_code" -eq 200 ]; then
       echo "Request $i: SUCCESS"
    elif [ "$status_code" -eq 429 ]; then
       echo "Request $i: RATE LIMITED (429 Too Many Requests)"
    else
       echo "Request $i: FAILED with status $status_code"
    fi
  done
  echo ""
}

# Run tests
# The VIP is allowed 40 RPM
# The Normal user is allowed 25 RPM
run_load_test "Normal" "$NORMAL_KEY" 25
run_load_test "VIP" "$VIP_KEY" 40
