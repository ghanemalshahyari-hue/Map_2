# ollama_model_info — Model Metadata Export

This directory is populated by running:

```powershell
.\Offline_Deployment\scripts\export-ollama-model-info.ps1 -Model qwen2.5:7b
```

## Files written

| File | Contents |
|------|---------|
| `model-name.txt` | Model name/tag that was exported |
| `model-list.txt` | Output of `ollama list` |
| `model-show.txt` | Output of `ollama show <model>` |
| `model-modelfile.txt` | Output of `ollama show <model> --modelfile` |
| `export-info.txt` | Export timestamp and host info |

## What this is for

These files capture the **model metadata** (not the weights) so you can:
- Verify the correct model version was prepared
- Compare metadata between the preparation machine and the offline machine
- Confirm the model tag/digest matches after transfer

## What is NOT here

- Model weights / blobs (too large for git — stored in `~/.ollama/models/blobs/`)
- API keys or passwords (not needed for local Ollama)

## Git ignore

The actual exported `.txt` files are gitignored (they are machine-specific).
Only this README is committed. Run the export script to generate the files locally.
