#!/bin/bash

# Execute into the local Docker PostgreSQL container and run a query
CONTAINER_NAME=$(docker ps -qf "name=middleware-postgres-1")
if [ -z "$CONTAINER_NAME" ]; then
  CONTAINER_NAME=$(docker ps -qf "name=postgres")
fi

if [ -z "$CONTAINER_NAME" ]; then
    echo "Could not find running Postgres container."
    exit 1
fi

echo "Found Postgres container: $CONTAINER_NAME"

echo "Running query to see top 5 recent spend logs..."
docker exec -i "$CONTAINER_NAME" psql -U litellm -d litellm -c "SELECT request_id, call_type, api_key, model, prompt_tokens, completion_tokens, total_tokens, spend, \"endTime\" FROM \"LiteLLM_SpendLogs\" ORDER BY \"endTime\" DESC LIMIT 5;"

echo ""
echo "Running query to see usage aggregated by API Key alias (if it exists)..."
docker exec -i "$CONTAINER_NAME" psql -U litellm -d litellm -c "SELECT api_key, COUNT(*) as request_count, SUM(total_tokens) as total_tokens_used, SUM(spend) as total_spent FROM \"LiteLLM_SpendLogs\" GROUP BY api_key ORDER BY total_tokens_used DESC;"
