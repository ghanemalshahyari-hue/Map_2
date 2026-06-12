# LiteLLM Stack — Portable Backup

Snapshot of a working **LiteLLM proxy + Postgres + Redis** middleware that fronts a local **vLLM** server running `Qwen/Qwen3-4B-Instruct-2507-FP8`. Created on `2026-05-04` from `/home/pheonix0104/Desktop/next_level/middleware/`.

This folder is meant to be portable: copy it onto another Linux machine with Docker + an NVIDIA GPU, follow the **Restore** section, and the stack comes back up exactly as it was — same DB, same generated API keys, same configuration.

---

## What's in this folder

```
litellm/
├── README.md                 ← this file
├── middleware/               ← full source tree (compose files, config, scripts)
│   ├── Dockerfile            ← builds the offline-capable litellm image
│   ├── tiktoken_cache/       ← pre-downloaded BPE file baked into the image
│   ├── litellm-compose.yml
│   ├── postgres-compose.yml
│   ├── redis-compose.yml
│   ├── litellm_config.yaml   ← model routes, master key, redis/postgres URLs
│   ├── setup_keys.sh         ← (re)generates 1 VIP key + 20 normal keys
│   ├── reset.sh              ← `docker compose down -v` for all three stacks
│   ├── run-docker.sh         ← `docker compose up -d` for all three stacks
│   ├── k8s/                  ← Kubernetes manifests (alternative deployment)
│   └── test_*.{sh,py}        ← smoke tests for limits, TPM, VIP routing
├── litellm-image.tar         ← `docker save` of the custom `litellm:latest` image
│                                (offline-capable, with tiktoken cache baked in)
├── postgres_data.tar.gz      ← snapshot of the `middleware_postgres_data` volume
│                                (LiteLLM virtual keys, spend logs, user table)
└── redis_data.tar.gz         ← snapshot of the `middleware_redis_data` volume
                                 (essentially empty — redis is used as cache only)
```

### Not included (intentional)

| Item | Why | How to obtain on the new machine |
|---|---|---|
| Qwen FP8 model weights (~5 GB) | Will re-download on the new machine | First `vllm serve` run pulls from HuggingFace |
| `postgres:15`, `redis:7-alpine`, `nvcr.io/nvidia/vllm:26.02-py3` base images | Public, cheap to re-pull | `docker pull` on first run |

---

## Architecture

```
                ┌─────────────────────────────────────────┐
                │  Client (curl / OpenAI SDK / etc.)      │
                │  Authorization: Bearer <virtual-key>    │
                └──────────────────┬──────────────────────┘
                                   │ POST /v1/chat/completions
                                   ▼  http://<host>:4000
                ┌─────────────────────────────────────────┐
                │  LiteLLM proxy  (container: litellm:latest)
                │  - validates virtual key
                │  - enforces TPM limits per key
                │  - tag-based routing (vip vs default)
                │  - caches via Redis
                │  - logs spend to Postgres
                └──┬───────────────┬─────────────┬────────┘
                   │               │             │
                   ▼               ▼             ▼
            Postgres:5433     Redis:6379     vLLM:8000
            (litellm DB)      (transaction   (OpenAI-compatible
                              buffer +cache)  server, GPU)
```

All four containers run on **`network_mode: host`** for the litellm container and the standard published ports (5433, 6379, 8000) for the rest. That means LiteLLM reaches Postgres/Redis/vLLM via `localhost`, so this setup expects everything to live on a single host.

### Models exposed by LiteLLM

`litellm_config.yaml` defines two routes that share the same name `vllm-model`:

| Tag | Behavior |
|---|---|
| (default — no tag on the request) | Goes to the un-tagged route. Used by normal users. |
| `vip` | Activated when the request includes `"tags": ["vip"]`. Routed first when tag-based filtering picks. |

Both routes ultimately hit `http://localhost:8000/v1` (the vLLM server) using model id `Qwen/Qwen3-4B-Instruct-2507-FP8`. Tag filtering is on (`enable_tag_filtering: True`), routing strategy is `usage-based-routing`.

### Keys (created by `setup_keys.sh`)

| Key | Alias | Limit |
|---|---|---|
| 1× VIP key | `ai_user` | 100,000 TPM |
| 20× normal keys | `ai_user_1` … `ai_user_20` | 2,000 TPM each |

Master key (admin / management API): **`sk-1234`** — defined in `litellm_config.yaml` and `litellm-compose.yml`. Change before exposing publicly.

---

## Restore (on the new machine)

Prereqs: Docker, docker compose v2, an NVIDIA GPU, `nvidia-container-toolkit` for vLLM.

### 1. Drop the source tree somewhere persistent

```bash
mkdir -p ~/next_level && cp -r /media/.../litellm/middleware ~/next_level/
chmod +x ~/next_level/middleware/*.sh
cd ~/next_level/middleware
```

> Why `chmod`: this folder lived on exfat, which doesn't store unix perms, so the `+x` bit on the shell scripts was lost in transit.

### 2. Load the litellm image

```bash
docker load -i /media/.../litellm/litellm-image.tar
```

This restores the custom `litellm:latest` image (built on `ghcr.io/berriai/litellm-non_root:v1.83.7-stable.patch.1` with the offline `tiktoken_cache/` baked in, so the proxy never tries to fetch the BPE file at runtime).

> Fallback if the tar is missing or you want to rebuild fresh:
> `docker build -f Dockerfile -t litellm:latest .` (run from the `middleware/` dir).

### 3. Recreate the docker volumes from the backup tarballs

```bash
# Postgres
docker volume create middleware_postgres_data
docker run --rm \
  -v middleware_postgres_data:/d \
  -v /media/.../litellm:/backup \
  alpine tar xzf /backup/postgres_data.tar.gz -C /d

# Redis (optional — it's just cache)
docker volume create middleware_redis_data
docker run --rm \
  -v middleware_redis_data:/d \
  -v /media/.../litellm:/backup \
  alpine tar xzf /backup/redis_data.tar.gz -C /d
```

> Replace `/media/.../litellm` with wherever this folder is mounted on the new machine.

### 4. Start vLLM (separate terminal, separate lifecycle)

```bash
# From wherever you keep your vllm launcher, equivalent of run-vllm.sh:
export LATEST_VLLM_VERSION=26.02-py3
docker pull nvcr.io/nvidia/vllm:${LATEST_VLLM_VERSION}
docker run -it --gpus all -p 8000:8000 --ipc=host --name vllm \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  nvcr.io/nvidia/vllm:${LATEST_VLLM_VERSION} \
  vllm serve "Qwen/Qwen3-4B-Instruct-2507-FP8" --gpu-memory-utilization 0.6
```

> The `-v ~/.cache/huggingface:/root/.cache/huggingface` line was **missing** in the original `run-vllm.sh` — without it the model re-downloads every time the container is recreated. Add it.
>
> First run downloads ~5 GB from HuggingFace.

### 5. Start the LiteLLM stack

```bash
cd ~/next_level/middleware
./run-docker.sh           # equivalent to: docker compose up -d for postgres, redis, litellm
```

Once `docker ps` shows all three healthy, hit `http://localhost:4000/health` to confirm LiteLLM sees the vLLM backend.

### 6. Sanity check (uses an existing key from the restored DB)

```bash
# List all keys in the DB:
./test_db_queries.sh

# Quick generation test (replace <key> with one from the list):
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"vllm-model","messages":[{"role":"user","content":"hi"}]}'
```

If the keys from the snapshot were nuked or you want a fresh set, run `./setup_keys.sh` and copy the output somewhere safe.

---

## Daily operations

| Want to… | Command |
|---|---|
| Start everything | `./run-docker.sh` |
| Stop everything (preserves data) | `docker compose -f postgres-compose.yml stop && docker compose -f redis-compose.yml stop && docker compose -f litellm-compose.yml stop` |
| **Wipe everything** (deletes volumes!) | `./reset.sh` |
| Tail litellm logs | `docker logs -f middleware-litellm-1` |
| Inspect virtual keys / spend | `./test_db_queries.sh` |
| Test TPM rate-limiting | `python3 test_tpm.py` or `./test_limits.sh` |
| Test VIP tag routing | `./test_vip.sh` |
| Regenerate the 21 keys | `./setup_keys.sh` |

Endpoints:

- LiteLLM proxy: `http://localhost:4000/v1` (OpenAI-compatible)
- LiteLLM admin UI / management: `http://localhost:4000` with `Authorization: Bearer sk-1234`
- vLLM raw: `http://localhost:8000/v1` (do **not** expose; let LiteLLM be the gateway)
- Postgres: `localhost:5433`, db `litellm`, user `litellm`, password `litellm`
- Redis: `localhost:6379`

---

## Gotchas / footguns

- **`network_mode: host` on litellm** — only works on Linux. macOS / Windows Docker Desktop will silently break LiteLLM↔Postgres/Redis/vLLM connectivity. On those, switch to a bridge network and use container names.
- **Master key `sk-1234`** is hardcoded in `litellm_config.yaml` and as `LITELLM_MASTER_KEY` in `litellm-compose.yml`. Change both if this ever leaves a lab environment.
- **Tiktoken offline** is what `Dockerfile` is for. If you ever rebuild against a newer base image and tiktoken changes its expected cache filename (the SHA1 in `tiktoken_cache/`), regenerate it from the URL in the Dockerfile comment.
- **Postgres tarball is a raw volume snapshot, not a `pg_dump`.** It only restores cleanly into the same major version (`postgres:15`). Don't restore into 16+.
- **exfat backups lose unix perms** — always `chmod +x *.sh` after restoring this folder.
- **Tag routing requires the client to send `"tags": ["vip"]`** in the request body. LiteLLM's OpenAI-compatibility passes that through. See `test_vip.sh` for the exact request shape.

---

## For Claude (other machine)

If you're an AI assistant reading this on another computer:

- The user transferred this folder from a working setup — they didn't write it from scratch. Trust the source files in `middleware/` over assumptions.
- The original project lived at `/home/pheonix0104/Desktop/next_level/`. The companion `vllm/` folder there only contained a launcher script (`run-vllm.sh`); the model itself was downloaded by the running container into its HuggingFace cache.
- `litellm:latest` is a **custom local image** built from `middleware/Dockerfile` — `docker pull litellm:latest` will not give you the right thing.
- The `k8s/` folder is an *alternative* deployment path (Kubernetes), not required for the docker-compose flow described above. Ignore unless the user asks about it.
- If `setup_keys.sh` is run a second time on a non-empty DB, it appends 21 more keys instead of replacing — the LiteLLM API has no upsert by alias. To start clean: `./reset.sh && ./run-docker.sh && ./setup_keys.sh`.
