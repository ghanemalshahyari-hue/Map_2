```bash
kubectl exec -i <postgres-pod-name> -- psql -U litellm -d litellm -c "SELECT COUNT(*) FROM \"LiteLLM_SpendLogs\";"
```

After your LiteLLM service has been running and users have made requests with their generated keys, you can query the PostgreSQL database directly to study their usage patterns (tokens per minute, request latency, etc.). This allows you to make informed decisions about what quotas to enforce later.

## Steps to Study Usage Data

1. **Find your Postgres Pod Name:**
   Find the exact name of the PostgreSQL pod running in your namespace.
   ```bash
   kubectl get pods -n <your-namespace>
   ```

2. **Execute into the Pod and Open `psql`:**
   Connect to the interactive PostgreSQL terminal as the `litellm` user.
   ```bash
   kubectl exec -it <postgres-pod-name> -n <your-namespace> -- psql -U litellm -d litellm
   ```

3. **Run Analytics Queries:**
   Once inside the `psql` shell (`litellm=#`), you can run standard SQL queries against the `LiteLLM_SpendLogs` table.

### Useful Queries for Studying Quotas

**1. See the latest 10 requests (to understand what columns are available):**
```sql
SELECT request_id, api_key, model, prompt_tokens, completion_tokens, total_tokens, "endTime", request_tags 
FROM "LiteLLM_SpendLogs" 
ORDER BY "endTime" DESC 
LIMIT 10;
```

**2. See total usage aggregated by each API Key (to find heavy users):**
*Note: Depending on your LiteLLM version, the `user` alias might be stored in the `request_tags` JSON column or linked via a separate table. The `api_key` hash is always available.*

```sql
SELECT 
    api_key, 
    COUNT(*) as total_requests, 
    SUM(total_tokens) as total_tokens_used 
FROM "LiteLLM_SpendLogs" 
GROUP BY api_key 
ORDER BY total_tokens_used DESC;
```

**3. Study "Tokens Per Minute" for a specific model (to see throughput spikes):**
This helps determine if users are sending too many requests at the exact same time, which could overwhelm the 21 `max_num_seqs`.

```sql
SELECT 
    date_trunc('minute', "endTime") as minute_bucket,
    COUNT(*) as requests_in_minute,
    SUM(total_tokens) as tokens_in_minute
FROM "LiteLLM_SpendLogs"
WHERE model = 'vllm-model'
GROUP BY minute_bucket
ORDER BY minute_bucket DESC
LIMIT 20;
```

**4. Check average latency/request duration:**
Are large token requests stalling the queue?
```sql
SELECT 
    api_key,
    AVG(EXTRACT(EPOCH FROM ("endTime" - "startTime"))) as avg_latency_seconds,
    MAX(EXTRACT(EPOCH FROM ("endTime" - "startTime"))) as max_latency_seconds
FROM "LiteLLM_SpendLogs"
GROUP BY api_key;
```

4. **Exit the Database:**
   ```sql
   \q
   ```

---
**Tip:** If you prefer not to type SQL manually, you can run single commands from outside the pod directly to extract reports:
```bash
kubectl exec -i <postgres-pod-name> -- psql -U litellm -d litellm -c "SELECT COUNT(*) FROM \"LiteLLM_SpendLogs\";"
```
