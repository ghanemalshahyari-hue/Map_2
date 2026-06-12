# RMOOZ — three design alternatives

Three forked copies of the working app (`UI_MOdified/`), each shipping a
different visual identity. The original app is **not** modified; deleting
any alt folder is safe.

| Folder | Direction | Inspired by | Port (web / tiles) |
|--------|-----------|-------------|--------------------|
| `alt-1/` | **Tactical** — pure black, monospace numerics, top + bottom classification banner. | ATAK / WinTAK | **8001** / 8081 |
| `alt-2/` | **Defense-Tech** — glassmorphism, electric blue → purple gradient, command bar (Ctrl+K). | Anduril Lattice / Palantir Foundry | **8002** / 8082 |
| `alt-3/` | **Operations Console** — amber accent, dense top utility bar + bottom status bar. | Palantir Gotham | **8003** / 8083 |

## Start one at a time

```powershell
cd alt-1
"C:\Program Files\nodejs\node.exe" server\web-server.js
# → http://localhost:8001/
```

…or `alt-2` (port 8002), or `alt-3` (port 8003).

## Start all three at once

```powershell
.\start-all-alts.ps1
```

Opens three background `node` processes (one per alt), then prints each URL.
Run `.\stop-all-alts.ps1` to stop them.

## Disk layout

Each alt is ~19 MB of source code. Two heavy folders are NTFS junctions
back to `UI_MOdified/`, so each alt does **not** duplicate them:

| Path                | What | Size | Type |
|---------------------|------|------|------|
| `<alt>/node_modules`| npm deps | ~730 MB | junction → UI_MOdified |
| `<alt>/maps`        | offline MBTiles | ~2.3 GB | junction → UI_MOdified |
| `<alt>/data`        | per-alt users / plans | grows as you use it | own folder |
| `<alt>/uploads`     | per-alt uploads | grows as you use it | own folder |

If you delete `UI_MOdified/node_modules`, all three alts break. To make
any one alt fully independent, delete its `node_modules` junction and
run `npm install` inside it.

## What's actually different in each alt

Every alt keeps the **complete original app** plus:

1. A new `client/style-alt.css` (override layer — loads after `style.css`,
   redefines color tokens, fonts, radii, and adds classification-banner styles).
2. A new `client/alt-shell.js` (injects header chips / utility bars at runtime).
3. ~3 lines of patching in `client/app.html` and `client/index.html` (link the alt CSS, add classification banner DOM).
4. Per-alt port (`server/web-server.js`, `server/tile-server.js`) so all alts can run simultaneously alongside the original.

The original `style.css`, `app.js`, and the entire panel module system are
untouched, so all functionality (drawing, units, ORBAT, chat, layers,
offline tiles, etc.) keeps working in every alt.

See `alt-1/README.md`, `alt-2/README.md`, `alt-3/README.md` for per-alt detail.
