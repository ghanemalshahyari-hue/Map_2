/**
 * MBTiles tile server - uses better-sqlite3 to read from disk (supports large files, e.g. 25GB+).
 * Run from project root: node server/tile-server.js  OR  npm run start
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');

let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n  ERROR: better-sqlite3 not installed. Run: npm install\n');
    process.exit(1);
}

const app      = express();
/** maps/ folder — env var (set by Electron) or project-root default */
const MAPS_DIR = process.env.RMOOZ_MAPS_DIR || path.join(__dirname, '..', 'maps');
const PORT     = parseInt(process.env.TILE_SERVER_PORT, 10) || 8080;

// Allow the web page (port 8000) to call this server
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    next();
});

const dbs = {};  // tileset name → { db, format }

function loadAll() {
    if (!fs.existsSync(MAPS_DIR)) {
        console.warn('  WARNING: maps/ folder not found at', MAPS_DIR);
        return;
    }

    const files = fs.readdirSync(MAPS_DIR).filter(f => f.toLowerCase().endsWith('.mbtiles'));

    if (files.length === 0) {
        console.warn('\n  WARNING: No .mbtiles files found in maps/');
        console.warn('  Copy your .mbtiles file into the maps/ folder.\n');
        return;
    }

    for (const filename of files) {
        const filepath = path.join(MAPS_DIR, filename);
        const name     = filename.replace(/\.mbtiles$/i, '');
        const sizeMB   = (fs.statSync(filepath).size / (1024 * 1024)).toFixed(1);
        console.log('  Loading:', filename, '(' + sizeMB + ' MB)...');
        try {
            const db = new Database(filepath, { readonly: true });
            // Read the full metadata table so we can expose real minzoom/maxzoom
            // (used by the client to set maxNativeZoom → overzoom instead of blank
            // tiles when zooming past the data ceiling).
            const meta = {};
            try { for (const r of db.prepare('SELECT name, value FROM metadata').all()) meta[r.name] = r.value; } catch (_) {}
            const fmt = (meta.format) || 'png';
            let minzoom = parseInt(meta.minzoom, 10);
            let maxzoom = parseInt(meta.maxzoom, 10);
            if (!Number.isFinite(maxzoom)) { try { maxzoom = db.prepare('SELECT MAX(zoom_level) z FROM tiles').get().z; } catch (_) {} }
            if (!Number.isFinite(minzoom)) { try { minzoom = db.prepare('SELECT MIN(zoom_level) z FROM tiles').get().z; } catch (_) {} }
            dbs[name] = { db, format: fmt, minzoom, maxzoom, bounds: meta.bounds || null, attribution: meta.attribution || null };
            console.log('  Loaded :', name, '(format:', fmt, '| zoom', minzoom + '..' + maxzoom + ')');
        } catch (e) {
            console.error('  FAILED :', filename, '-', e.message);
        }
    }
}

// TileJSON-ish metadata: lets the client read the tileset's real maxzoom and set
// Leaflet maxNativeZoom, so zooming past the data ceiling upscales (overzoom)
// instead of requesting non-existent tiles and showing blank/grey.
app.get('/services/:tileset.json', (req, res) => {
    const entry = dbs[req.params.tileset];
    if (!entry) { res.status(404).json({ error: 'unknown tileset' }); return; }
    res.json({
        tilejson: '2.2.0',
        name:     req.params.tileset,
        format:   entry.format,
        scheme:   'xyz',
        minzoom:  Number.isFinite(entry.minzoom) ? entry.minzoom : 0,
        maxzoom:  Number.isFinite(entry.maxzoom) ? entry.maxzoom : 22,
        bounds:   entry.bounds ? entry.bounds.split(',').map(Number) : undefined,
        attribution: entry.attribution || undefined,
    });
});

app.get('/services/:tileset/:z/:x/:y.:fmt', (req, res) => {
    const { tileset, z, x, y } = req.params;
    const entry = dbs[tileset];
    if (!entry) { res.status(404).send(); return; }

    try {
        const maxY = Math.pow(2, parseInt(z, 10)) - 1;
        const tmsY = maxY - parseInt(y, 10);
        const row = entry.db.prepare(
            'SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?'
        ).get(parseInt(z), parseInt(x), tmsY);

        if (row && row.tile_data) {
            const fmt = (entry.format || 'png').toLowerCase();
            res.set('Content-Type', fmt === 'jpg' || fmt === 'jpeg' ? 'image/jpeg' : 'image/png');
            res.send(Buffer.from(row.tile_data));
        } else {
            res.status(404).send();
        }
    } catch (e) {
        res.status(500).send();
    }
});

loadAll();
const tileListener = app.listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('  Tile server running at http://127.0.0.1:' + PORT);
    console.log('  Tilesets ready:', Object.keys(dbs).join(', ') || '(none - check maps/ folder)');
    console.log('  (Supports large files - reads from disk, no size limit)');
    console.log('');
});
tileListener.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error('Port ' + PORT + ' is already in use. Stop the other tile server (e.g. lsof -ti tcp:' + PORT + ' | xargs kill) or change PORT in server/tile-server.js.');
    } else {
        console.error(err);
    }
    process.exit(1);
});
