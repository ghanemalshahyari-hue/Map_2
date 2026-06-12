#!/bin/bash
# Minimal VIP vs Normal priority test

URL="http://localhost:4000"
KEY="sk-1234"  # Master key for testing — swap with generated keys if needed

echo "Flooding 15 normal requests in background..."
for i in $(seq 1 15); do
  curl -s -X POST "$URL/chat/completions" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"vllm-model","messages":[{"role":"user","content":"Count from 1 to 100."}],"max_tokens":200}' \
    > /dev/null &
done

sleep 1
echo "Firing VIP request now..."
START=$(date +%s%3N)
REPLY=$(curl -s -X POST "$URL/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"vllm-model","messages":[{"role":"user","content":"Say hi in 3 words."}],"tags":["vip"],"max_tokens":10}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])" 2>/dev/null)
ELAPSED=$(($(date +%s%3N) - START))

echo "VIP reply: '$REPLY' — took ${ELAPSED}ms"
wait
echo "Done."
