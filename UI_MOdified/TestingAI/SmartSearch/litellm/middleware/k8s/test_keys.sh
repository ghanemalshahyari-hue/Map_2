#!/bin/bash

# Configuration
LITELLM_URL="http://localhost:4000" # Change this to the K8s NodePort/LoadBalancer IP if testing from outside
MASTER_KEY="sk-1234"

echo "Waiting for LiteLLM to be ready..."
sleep 2

echo "Generating Test Key 1 (No Limits)..."
TEST_REQ_1=$(curl -s -X POST "${LITELLM_URL}/key/generate" \
  -H "Authorization: Bearer ${MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "models": ["vllm-model", "Qwen3-235B-Instruct-2507"],
    "aliases": {"user": "test_user_1"}
  }')
TEST_KEY_1=$(echo "$TEST_REQ_1" | grep -o '"key":"[^"]*' | grep -o '[^"]*$')
echo "Test Key 1 Created: $TEST_KEY_1"

echo ""
echo "Generating Test Key 2 (No Limits)..."
TEST_REQ_2=$(curl -s -X POST "${LITELLM_URL}/key/generate" \
  -H "Authorization: Bearer ${MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "models": ["vllm-model", "Qwen/Qwen3-4B-Instruct-2507-FP8"],
    "aliases": {"user": "test_user_2"}
  }')
TEST_KEY_2=$(echo "$TEST_REQ_2" | grep -o '"key":"[^"]*' | grep -o '[^"]*$')
echo "Test Key 2 Created: $TEST_KEY_2"

echo ""
echo "========================================="
echo "Setup Complete."
echo "Your API Keys (No Quotas):"
echo "Test 1: $TEST_KEY_1"
echo "Test 2: $TEST_KEY_2"
echo "========================================="
