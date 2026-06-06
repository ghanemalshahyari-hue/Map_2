# 1. Transfer — what to copy from Mac

## What to transfer

| Source (Mac path) | Target (Linux path) | Approx. size | Required? |
|---|---|---:|---|
| `/Users/hextechkraken/Desktop/TestingAI/DecisionMakingSteps_TRANSFER/` (exclude `venv/` + `venv_mac/`) | `~/wargame/DecisionMakingSteps_TRANSFER/` | **2.2 GB** | ✅ Required |
| `/Users/hextechkraken/Desktop/TestingAI/WarGameGenerator/` (exclude `viewer/`) | `~/wargame/WarGameGenerator/` | **~970 MB** | ✅ Required |
| `/Users/hextechkraken/Desktop/TestingAI/Linux_Handoff/` | `~/wargame/Linux_Handoff/` | < 1 MB | ✅ Required |
| `/Users/hextechkraken/Desktop/TestingAI/apik.rtf` (the OpenAI API key file) | `~/wargame/apik.rtf` | < 1 KB | ⚠️ Only if using OpenAI cloud LLM |
| `/Users/hextechkraken/Desktop/TestingAI/WarGameViz/` | — | 100 MB | ❌ DO NOT — Unity 3D viz, out of scope |

**Total transfer**: roughly **3.2 GB**. On a USB 3.0 stick: ~30 sec to copy. Over scp/rsync at 100 Mbps: ~5 min.

## Method 1 — rsync (recommended if both machines are on the same network)

From the Linux box:

```bash
# Adjust IP / username to match your Mac
MAC_USER=hextechkraken
MAC_HOST=192.168.1.123              # your Mac's LAN IP — get it from System Settings → Network on Mac
SRC=/Users/$MAC_USER/Desktop/TestingAI

mkdir -p ~/wargame

# DecisionMakingSteps_TRANSFER — skip both venv dirs
rsync -avh --progress \
  --exclude='venv/' --exclude='venv_mac/' \
  --exclude='__pycache__/' --exclude='*.pyc' \
  $MAC_USER@$MAC_HOST:$SRC/DecisionMakingSteps_TRANSFER/ \
  ~/wargame/DecisionMakingSteps_TRANSFER/

# WarGameGenerator — skip viewer dir (Cesium HTML, not needed) + venvs + Unity meta files + run audit dirs (start fresh)
rsync -avh --progress \
  --exclude='viewer/' \
  --exclude='venv/' --exclude='venv_mac/' \
  --exclude='__pycache__/' --exclude='*.pyc' \
  --exclude='tests/full_run_audit/' --exclude='tests/one_phase_audit/' \
  --exclude='tests/smoke_audit/' \
  $MAC_USER@$MAC_HOST:$SRC/WarGameGenerator/ \
  ~/wargame/WarGameGenerator/

# Linux handoff docs (this folder)
rsync -avh --progress \
  $MAC_USER@$MAC_HOST:$SRC/Linux_Handoff/ \
  ~/wargame/Linux_Handoff/

# Optional — only if using OpenAI cloud:
rsync -avh --progress \
  $MAC_USER@$MAC_HOST:$SRC/apik.rtf \
  ~/wargame/apik.rtf
```

On the Mac, you'll need to enable Remote Login first:
- **System Settings** → **General** → **Sharing** → toggle on **Remote Login**

## Method 2 — scp over USB / direct cable (if no LAN)

Easier: use a USB drive.

On Mac:
```bash
SRC=/Users/hextechkraken/Desktop/TestingAI
USB=/Volumes/MyUSB

rsync -avh --progress \
  --exclude='venv/' --exclude='venv_mac/' --exclude='__pycache__/' \
  $SRC/DecisionMakingSteps_TRANSFER/ \
  $USB/DecisionMakingSteps_TRANSFER/

rsync -avh --progress \
  --exclude='viewer/' --exclude='venv/' --exclude='venv_mac/' --exclude='__pycache__/' \
  --exclude='tests/full_run_audit/' --exclude='tests/one_phase_audit/' \
  --exclude='tests/smoke_audit/' \
  $SRC/WarGameGenerator/ \
  $USB/WarGameGenerator/

cp -R $SRC/Linux_Handoff/ $USB/Linux_Handoff/
cp $SRC/apik.rtf $USB/ 2>/dev/null
```

On Linux:
```bash
USB=/media/$USER/MyUSB                # or wherever it auto-mounts; check `lsblk`
mkdir -p ~/wargame
cp -R $USB/DecisionMakingSteps_TRANSFER ~/wargame/
cp -R $USB/WarGameGenerator ~/wargame/
cp -R $USB/Linux_Handoff ~/wargame/
cp $USB/apik.rtf ~/wargame/ 2>/dev/null
```

## Verify the transfer

After transfer, on the Linux box:

```bash
cd ~/wargame

# Should each show non-zero file counts:
echo "DMS files:"        ; find DecisionMakingSteps_TRANSFER -type f | wc -l
echo "WGG files:"        ; find WarGameGenerator -type f | wc -l
echo "Handoff files:"    ; find Linux_Handoff -type f | wc -l

# Critical files that MUST be present:
ls -la WarGameGenerator/.env                          # if .env is missing, copy it from Mac later
ls -la WarGameGenerator/inputs/scenario.json
ls -la WarGameGenerator/inputs/forces/red_team.docx
ls -la WarGameGenerator/inputs/forces/blue_team.docx
ls -la DecisionMakingSteps_TRANSFER/inputs/doctrine/Doctrines.md       # doctrine corpus lives in DMS, not WGG
ls -la DecisionMakingSteps_TRANSFER/inputs/doctrine/WarReferences.md
ls -la DecisionMakingSteps_TRANSFER/docker-compose.yml
ls -la DecisionMakingSteps_TRANSFER/graph/retrieval

# Size sanity:
du -sh DecisionMakingSteps_TRANSFER  # expect ~2.2 GB
du -sh WarGameGenerator               # expect ~970 MB (mostly inputs/gis/elevation/libya_dem.tif)
```

If any of the critical files are missing, re-run the rsync. Don't proceed to `2_SETUP.md` until everything's present.

## What NOT to transfer

- `venv/` and `venv_mac/` — these have Mac-compiled Python wheels that won't work on Linux. We'll create fresh ones during setup.
- `__pycache__/` — Python bytecode cache, rebuilt automatically
- `WarGameViz/` — Unity project, out of scope
- `viewer/` (inside WarGameGenerator) — Cesium-based 2D viewer we don't need
- `tests/full_run_audit/` and similar — audit dirs from prior Mac runs, start fresh

When transfer is verified, proceed to `2_SETUP.md`.
