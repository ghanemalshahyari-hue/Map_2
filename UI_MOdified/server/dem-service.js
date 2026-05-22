/**
 * Libya DEM service.
 *
 * Reads libya_demx5.tif (uncompressed Float32 GeoTIFF, elevation × 5).
 * Exposes:
 *   getElevation(lon, lat)      → metres (real) or null outside coverage
 *   renderTile(z, x, y)         → PNG Buffer (hillshade + colormap) or null
 *   getMeta()                   → coverage bounding box + pixel scale
 *
 * File must exist at DEM_PATH (override via env DEM_PATH).
 * Rendered tiles are cached on disk at data/dem-tiles/{z}/{x}/{y}.png
 * so first render is slow but subsequent requests are instant.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── File constants ──────────────────────────────────────────────────────────
const DEM_PATH = process.env.DEM_PATH ||
    'C:\\Users\\ADMIN\\Desktop\\libya_demx5.tif';

const W          = 25304;
const H          = 18906;
const WEST       = 4.73303;
const NORTH      = 37.68393;
const PIX_X      = 0.0008333326746759407;   // °/px longitude
const PIX_Y      = 0.0008333349201311752;   // °/px latitude
const EAST       = WEST  + W * PIX_X;       // ~25.82°E
const SOUTH      = NORTH - H * PIX_Y;       // ~21.93°N
const ELEV_SCALE = 5;
const NODATA_MIN = -1e30;

// Regular stride: no strip-offset table needed
const DATA_OFFSET = 151650;   // byte offset of first pixel
const ROW_STRIDE  = W * 4;    // 101216

const CACHE_DIR = path.join(__dirname, '..', 'data', 'dem-tiles');

// ── File descriptor (opened lazily, kept open) ──────────────────────────────
let _fd = null;
function fd() {
    if (_fd !== null) return _fd;
    if (!fs.existsSync(DEM_PATH)) return null;
    _fd = fs.openSync(DEM_PATH, 'r');
    console.log('[dem] Opened', DEM_PATH);
    return _fd;
}

// ── Coordinate helpers ──────────────────────────────────────────────────────
function lonToPx(lon) { return (lon - WEST)  / PIX_X; }
function latToPy(lat) { return (NORTH - lat) / PIX_Y; }

// ── Raw float read ──────────────────────────────────────────────────────────
function readRaw(px, py) {
    const f = fd();
    if (!f || px < 0 || px >= W || py < 0 || py >= H) return null;
    const buf = Buffer.alloc(4);
    fs.readSync(f, buf, 0, 4, DATA_OFFSET + py * ROW_STRIDE + px * 4);
    const v = buf.readFloatLE(0);
    return v < NODATA_MIN ? null : v;
}

// ── Public: point elevation ─────────────────────────────────────────────────
function getElevation(lon, lat) {
    const raw = readRaw(Math.round(lonToPx(lon)), Math.round(latToPy(lat)));
    return raw === null ? null : raw / ELEV_SCALE;
}

// ── Region reader (bilinear, row-subsampled for large areas) ────────────────
function readRegion(west, north, east, south, outW, outH) {
    const f = fd();
    if (!f) return null;

    const sx0 = Math.max(0, Math.floor(lonToPx(west)));
    const sy0 = Math.max(0, Math.floor(latToPy(north)));
    const sx1 = Math.min(W - 1, Math.ceil(lonToPx(east)));
    const sy1 = Math.min(H - 1, Math.ceil(latToPy(south)));
    if (sx0 >= sx1 || sy0 >= sy1) return null;

    const srcW = sx1 - sx0;
    const srcH = sy1 - sy0;

    // Subsample rows so no tile ever needs > 600 file reads (keeps < 1s even
    // at zoom-7 where srcH can be ~15 000)
    const step     = Math.max(1, Math.ceil(srcH / 600));
    const effSrcH  = Math.ceil(srcH / step);

    const src    = new Float32Array(srcW * effSrcH);
    const rowBuf = Buffer.alloc(srcW * 4);

    for (let ry = 0; ry < effSrcH; ry++) {
        const py = sy0 + ry * step;
        fs.readSync(f, rowBuf, 0, srcW * 4, DATA_OFFSET + py * ROW_STRIDE + sx0 * 4);
        for (let rx = 0; rx < srcW; rx++) {
            src[ry * srcW + rx] = rowBuf.readFloatLE(rx * 4);
        }
    }

    // Bilinear resample to outW × outH
    const out = new Float32Array(outW * outH);
    for (let oy = 0; oy < outH; oy++) {
        const sry = (oy + 0.5) * (effSrcH / outH) - 0.5;
        const y0  = Math.max(0, Math.floor(sry));
        const y1  = Math.min(effSrcH - 1, y0 + 1);
        const fy  = sry - y0;
        for (let ox = 0; ox < outW; ox++) {
            const srx = (ox + 0.5) * (srcW / outW) - 0.5;
            const x0  = Math.max(0, Math.floor(srx));
            const x1  = Math.min(srcW - 1, x0 + 1);
            const fx  = srx - x0;
            out[oy * outW + ox] =
                src[y0*srcW+x0]*(1-fx)*(1-fy) + src[y0*srcW+x1]*fx*(1-fy) +
                src[y1*srcW+x0]*(1-fx)*fy      + src[y1*srcW+x1]*fx*fy;
        }
    }
    return out;
}

// ── Elevation colormap (real metres) ───────────────────────────────────────
const STOPS = [
    [    0, [26,  58,  92]],   // water / sea level
    [  100, [45, 102,  45]],   // coastal lowlands
    [  400, [200, 165,  60]],  // low desert
    [  800, [176, 120,  50]],  // mid desert
    [ 1200, [144,  88,  56]],  // foothills
    [ 2000, [168, 140, 112]],  // highlands
    [ 2500, [210, 196, 180]],  // high peaks
];
function elevToRgb(m) {
    for (let i = STOPS.length - 2; i >= 0; i--) {
        if (m >= STOPS[i][0]) {
            const t = Math.min(1, (m - STOPS[i][0]) / (STOPS[i+1][0] - STOPS[i][0]));
            return STOPS[i][1].map((c, j) => Math.round(c + t * (STOPS[i+1][1][j] - c)));
        }
    }
    return STOPS[0][1];
}

// ── CRC32 for PNG chunks ────────────────────────────────────────────────────
const _crcTbl = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = _crcTbl[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Minimal RGBA PNG encoder ────────────────────────────────────────────────
function buildPng(rgba, w, h) {
    function chunk(type, data) {
        const tb = Buffer.from(type, 'ascii');
        const b  = Buffer.alloc(12 + data.length);
        b.writeUInt32BE(data.length, 0);
        tb.copy(b, 4);
        data.copy(b, 8);
        b.writeUInt32BE(crc32(Buffer.concat([tb, data])), 8 + data.length);
        return b;
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8]=8; ihdr[9]=6; // 8-bit RGBA

    // Raw scanlines (filter byte = 0)
    const raw = Buffer.alloc((4 * w + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (4*w+1)] = 0;
        for (let x = 0; x < w; x++) {
            const si = (y*w+x)*4, di = y*(4*w+1)+1+x*4;
            raw[di]=rgba[si]; raw[di+1]=rgba[si+1]; raw[di+2]=rgba[si+2]; raw[di+3]=rgba[si+3];
        }
    }

    return Buffer.concat([
        Buffer.from([137,80,78,71,13,10,26,10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// ── Web-Mercator tile bounds ────────────────────────────────────────────────
function tileBounds(z, x, y) {
    const n = Math.pow(2, z);
    return {
        west:  x / n * 360 - 180,
        east:  (x+1) / n * 360 - 180,
        north: Math.atan(Math.sinh(Math.PI*(1 - 2*y/n)))     * 180/Math.PI,
        south: Math.atan(Math.sinh(Math.PI*(1 - 2*(y+1)/n))) * 180/Math.PI,
    };
}

// ── Tile renderer ───────────────────────────────────────────────────────────
function renderTile(z, x, y, size = 256) {
    z=+z; x=+x; y=+y;
    const b = tileBounds(z, x, y);
    if (b.east < WEST || b.west > EAST || b.north < SOUTH || b.south > NORTH) return null;

    // Disk cache
    const cp = path.join(CACHE_DIR, String(z), String(x), `${y}.png`);
    if (fs.existsSync(cp)) return fs.readFileSync(cp);

    // Read with 1px padding for hillshade gradient
    const padLon = PIX_X * (b.east - b.west) / size;
    const padLat = PIX_Y * (b.north - b.south) / size;
    const elev = readRegion(
        b.west - padLon, b.north + padLat,
        b.east + padLon, b.south - padLat,
        size + 2, size + 2
    );
    if (!elev) return null;

    const S = size + 2;
    const rgba = Buffer.alloc(size * size * 4);

    for (let oy = 0; oy < size; oy++) {
        for (let ox = 0; ox < size; ox++) {
            const i = (oy+1)*S + (ox+1);
            const raw = elev[i];
            if (raw < NODATA_MIN * 0.5) continue; // transparent

            const m = raw / ELEV_SCALE;
            const [r, g, b2] = elevToRgb(m);

            // Hillshade: sun from NW at 45°
            const dx = (elev[i+1]   - elev[i-1])   / (ELEV_SCALE * 2);
            const dy = (elev[i+S]   - elev[i-S])   / (ELEV_SCALE * 2);
            const shade = Math.max(0.35, Math.min(1.25,
                1.0 + (-dx * 0.45 - dy * 0.3) / Math.sqrt(dx*dx + dy*dy + 1)
            ));

            const pi = (oy * size + ox) * 4;
            rgba[pi]   = Math.min(255, Math.round(r  * shade));
            rgba[pi+1] = Math.min(255, Math.round(g  * shade));
            rgba[pi+2] = Math.min(255, Math.round(b2 * shade));
            rgba[pi+3] = 210; // semi-transparent so OSM base shows through
        }
    }

    const png = buildPng(rgba, size, size);

    try {
        fs.mkdirSync(path.dirname(cp), { recursive: true });
        fs.writeFileSync(cp, png);
    } catch (_) {}

    return png;
}

module.exports = {
    getElevation,
    renderTile,
    tileBounds,
    getMeta: () => ({
        west: WEST, east: EAST, north: NORTH, south: SOUTH,
        pixelX: PIX_X, pixelY: PIX_Y,
        elevScale: ELEV_SCALE,
        width: W, height: H,
    }),
    isAvailable: () => fs.existsSync(DEM_PATH),
};
