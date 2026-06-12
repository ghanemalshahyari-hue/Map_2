#!/bin/bash
# script to test strict rate limits

# Read API keys
VIP_KEY="sk-GV74IHMrVvq6jnnc1GAMDg"
NORMAL_KEY="sk-P02hAGGrCDE3CsDytLrB_Q" 

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
