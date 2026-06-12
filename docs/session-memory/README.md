# Session memory mirror

A point-in-time **mirror of Claude Code's local memory** for this project, committed so a fresh
machine still has the cross-session "why" (locked decisions, feedback, deferred items, audit
history). It pairs with `CLAUDE.md` (auto-loaded) → `APP_INVENTORY.md` (the "what") → this folder
(the "why").

- **Source of truth is the live dir**, not this mirror:
  `~/.claude/projects/-Users-engcode-Desktop-Map-2/memory/`.
  Edit memory there (or let Claude manage it). This folder is a copy — don't hand-edit it.
- `MEMORY.md` here is the index; the other `*.md` files are the individual notes it links.
- Snapshot taken **2026-05-31**. Re-mirror whenever memory changes (command below).

## Rehydrate on a new machine

The live memory dir is machine-local and git-ignored, so it won't exist after a fresh clone.
To restore it, copy these files into the project's memory dir under `~/.claude`:

```bash
# Run from the repo root. Claude Code keys the memory dir off the repo's absolute path
# (each "/" becomes "-"), so this computes the right destination for THIS machine:
DEST="$HOME/.claude/projects/$(pwd | sed 's#/#-#g')/memory"
mkdir -p "$DEST"
cp docs/session-memory/*.md "$DEST"/          # excludes nothing but this README's content is harmless
rm -f "$DEST/README.md"                        # the live dir doesn't need this README
```

If `~/.claude/projects/` already has a folder for this repo with a slightly different name, use
that one instead (the auto-computed name assumes the simple `/`→`-` rule).

Even without rehydrating, `CLAUDE.md` points here, so Claude will read these notes on demand.

## Re-mirror after memory changes

```bash
cp "$HOME/.claude/projects/$(pwd | sed 's#/#-#g')/memory/"*.md docs/session-memory/
```
