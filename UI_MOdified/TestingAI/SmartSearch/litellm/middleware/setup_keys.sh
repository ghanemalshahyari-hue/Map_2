#!/bin/bash

# Configuration
LITELLM_URL="http://localhost:4000"
MASTER_KEY="sk-1234"
MODEL="Qwen/Qwen3-4B-Instruct-2507-FP8"

echo "Waiting for LiteLLM to be ready..."
sleep 5

echo "========================================="
echo "Generating API Keys for LiteLLM..."
echo "========================================="

# 1. Generate VIP User (ai_user)
echo "Generating VIP Key (ai_user) with 100,000 TPM limit..."
VIP_REQ=$(curl -s -X POST "${LITELLM_URL}/key/generate" \
  -H "Authorization: Bearer ${MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "models": ["'"$MODEL"'"],
    "aliases": {"user": "ai_user"},
    "tpm_limit": 100000
  }')
VIP_KEY=$(echo "$VIP_REQ" | grep -o '"key":"[^"]*' | grep -o '[^"]*$')
echo "✅ VIP Key (ai_user): $VIP_KEY"
echo ""

# Store all normal keys to print at the end
NORMAL_KEYS=""

# 2. Generate 20 Normal Users (ai_user_1 to ai_user_20)
echo "Generating 20 Normal Keys with 2,000 TPM limit..."
for i in {1..20}; do
  USER_ALIAS="ai_user_${i}"
  
  REQ=$(curl -s -X POST "${LITELLM_URL}/key/generate" \
    -H "Authorization: Bearer ${MASTER_KEY}" \
    -H "Content-Type: application/json" \
    -d '{
      "models": ["'"$MODEL"'"],
      "aliases": {"user": "'"$USER_ALIAS"'"},
      "tpm_limit": 2000
    }')
    
  KEY=$(echo "$REQ" | grep -o '"key":"[^"]*' | grep -o '[^"]*$')
  echo "✅ Created $USER_ALIAS: $KEY"
  
  # Append to summary list
  NORMAL_KEYS="${NORMAL_KEYS}${USER_ALIAS}: ${KEY}\n"
done

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo "VIP User:"
echo "ai_user (100k TPM): $VIP_KEY"
echo "-----------------------------------------"
echo "Normal Users (2k TPM):"
echo -e "$NORMAL_KEYS"
echo "========================================="
