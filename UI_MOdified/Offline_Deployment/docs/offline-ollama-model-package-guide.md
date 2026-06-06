# Offline Ollama Model Package Guide

This guide explains what Ollama needs to run WarGamingGEN offline, and how to
prepare the model for an isolated deployment site where no internet is available.

---

## Critical: model name alone is not enough

Setting `RMOOZ_OLLAMA_MODEL=qwen2.5:7b` or `RMOOZ_SIM_MODEL=qwen2.5:7b` in `.env.offline`
**only selects which model to call**. The model weights and metadata must already exist
on the offline machine's Ollama installation.

If Ollama cannot find the model locally, WarGamingGEN will fail with:
```
Error: model not found: qwen2.5:7b
```

There is **no automatic download** in an offline environment — that is the point.

---

## What Ollama needs to run a model

| Component | Location (default Windows) | Required |
|-----------|---------------------------|---------|
| Model manifest (JSON) | `%USERPROFILE%\.ollama\models\manifests\registry.ollama.ai\library\<name>\<tag>` | Yes |
| Model weights/blobs | `%USERPROFILE%\.ollama\models\blobs\sha256-*` | Yes |
| Modelfile / template | Embedded in manifest | Usually yes |
| Parameters | Embedded in manifest | Usually yes |
| Local Ollama server | `ollama serve` running on the machine | Yes |

On Linux the default path is `~/.ollama/models/`.

---

## No secrets required for local Ollama

Local Ollama needs **no API key, no password, and no account**. It runs entirely
on the offline machine.

```dotenv
# Correct — no secret needed
OLLAMA_HOST=http://host.docker.internal:11434
RMOOZ_OLLAMA_URL=http://host.docker.internal:11434
RMOOZ_OLLAMA_MODEL=qwen2.5:7b
```

Do **not** add `OLLAMA_API_KEY` or any credential. Local Ollama does not require one.

---

## How RMOOZ connects to Ollama

The Docker container connects to Ollama using `OLLAMA_HOST` / `RMOOZ_OLLAMA_URL`:

| Scenario | OLLAMA_HOST value |
|----------|------------------|
| Ollama on the **Docker host** (Windows/Mac Docker Desktop) | `http://host.docker.internal:11434` |
| Ollama on the **Docker host** (Linux without Docker Desktop) | `http://172.17.0.1:11434` (host bridge IP) |
| Ollama on a **separate machine** on the same LAN | `http://<machine-ip>:11434` |
| Ollama as a **Docker Compose sidecar** | `http://ollama:11434` (service name) |

Change `OLLAMA_HOST` in `.env.offline` without rebuilding the Docker image.

---

## Option A — Ollama already installed on offline machine (recommended)

The simplest approach: install Ollama on the deployment machine and pull the model
**before** the machine goes offline.

**Steps on the online/preparation machine:**
```powershell
# 1. Verify the model is available
ollama list
# Expected output includes: qwen2.5:7b   ...

# 2. Record model details for verification
ollama show qwen2.5:7b
ollama show qwen2.5:7b --modelfile

# 3. Note the model storage path
# Windows: %USERPROFILE%\.ollama\
# Linux:   ~/.ollama/
```

**Steps on the offline machine:**
```powershell
# 1. Install Ollama (offline installer if available, or pre-installed)
# 2. Transfer model storage from the preparation machine (see Option B below for details)
# 3. Start Ollama
ollama serve &   # Linux / background
# Windows: Ollama runs as a tray application / service

# 4. Verify model is available
ollama list
# Must show: qwen2.5:7b   ...

# 5. Quick smoke test
ollama run qwen2.5:7b "Reply with only the word: OK"
# Expected: OK
```

---

## Option B — Transfer the Ollama model storage directory

If the offline machine already has Ollama installed but the model needs to be transferred:

**From the preparation machine:**
```powershell
# Windows — archive the model blobs and manifests
$src = "$env:USERPROFILE\.ollama"
Compress-Archive -Path "$src\models\blobs", "$src\models\manifests" `
                 -DestinationPath ollama-qwen2.5-7b-models.zip
```

```bash
# Linux
tar -czf ollama-qwen2.5-7b-models.tar.gz \
    ~/.ollama/models/blobs \
    ~/.ollama/models/manifests
```

**On the offline machine:**
```powershell
# Windows — extract to the same path
Expand-Archive -Path ollama-qwen2.5-7b-models.zip `
               -DestinationPath "$env:USERPROFILE\.ollama" -Force
```

```bash
# Linux
tar -xzf ollama-qwen2.5-7b-models.tar.gz -C ~/
```

Then verify:
```
ollama list
# Should show qwen2.5:7b
```

---

## Model sizes (approximate)

| Model | Disk space | RAM needed |
|-------|-----------|-----------|
| `qwen2.5:3b` | ~2.0 GB | ~4 GB |
| `qwen2.5:7b` | ~4.7 GB | ~8 GB |
| `qwen2.5:14b` | ~9.0 GB | ~16 GB |
| `qwen2.5:32b` | ~19 GB | ~32 GB |

`qwen2.5:7b` is the recommended balance of quality and resource usage for WarGamingGEN.

---

## Exporting model metadata for verification

Run the export script before transfer to capture what model is being packaged:

```powershell
# From UI_MOdified/:
.\Offline_Deployment\scripts\export-ollama-model-info.ps1 -Model qwen2.5:7b
```

This saves model metadata (not weights) to `Offline_Deployment/ollama_model_info/`.
Compare the saved info on the offline machine to confirm the model transferred correctly.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: model not found` | Model not pulled on offline machine | `ollama list` to verify; transfer model storage |
| `connection refused` on port 11434 | Ollama not running | Start Ollama: `ollama serve` (Linux) or open Ollama app (Windows) |
| `OLLAMA_HOST` cannot be reached from container | Wrong host address | Use `host.docker.internal` for Docker Desktop; use host IP for Linux Docker |
| Generation starts then dies | Not enough RAM | Use smaller model (`qwen2.5:3b`) or add swap space |
| `LLM_LOCAL_FORCE_FALLBACK` error | WarGamingGEN config mismatch | Confirm RMOOZ server uses `LLM_LOCAL_FORCE_FALLBACK=1` in bridge env |

---

## Related files

| File | Purpose |
|------|---------|
| `Offline_Deployment/.env.offline.example` | Set `RMOOZ_OLLAMA_MODEL`, `OLLAMA_HOST` |
| `Offline_Deployment/scripts/export-ollama-model-info.ps1` | Capture model metadata before transfer |
| `Offline_Deployment/docs/offline-deployment-checklist.md` | Step-by-step Ollama verification checklist |
| `Offline_Deployment/TestingAI_Runtime/` | Persistent WarGamingGEN output volumes |
