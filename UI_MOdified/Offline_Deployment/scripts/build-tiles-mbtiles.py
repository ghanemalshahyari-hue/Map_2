#!/usr/bin/env python3
"""
build-tiles-mbtiles.py — Download XYZ map tiles for a bounding box + zoom range
into a standards-compliant MBTiles file (the same format the offline tile-server
reads). This is the *acquisition* step that prepare-map-bundle.ps1 lacks (that
script only COPIES an existing .mbtiles).

Run on an INTERNET-CONNECTED prep machine, NEVER on the air-gapped box.

Use it to give the offline deployment the SAME map you see online (e.g. the
OpenStreetMap base layer) at full zoom — but only for the operation Area of
Interest, and only from a tile source you are allowed to bulk-download.

    ┌────────────────────────────────────────────────────────────────────┐
    │  IMPORTANT — tile-source policy                                      │
    │  The public OpenStreetMap servers (tile.openstreetmap.org) PROHIBIT  │
    │  bulk/offline downloading and will ban the IP. Point --url at a      │
    │  source you are licensed for (e.g. your MapTiler key URL, your own   │
    │  self-hosted renderer, or a commercial provider). You own the ToS.   │
    └────────────────────────────────────────────────────────────────────┘

Example (against your OWN tile server / licensed source — NOT public OSM):
    python build-tiles-mbtiles.py \
        --bbox 19.5,30.0,20.6,31.2 \
        --minzoom 0 --maxzoom 16 \
        --url "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=YOUR_KEY" \
        --name benghazi_streets --format png \
        --attribution "© MapTiler © OpenStreetMap contributors" \
        --out ../map_data/base/benghazi_streets.mbtiles

Then register + stage it (see docs/full-zoom-map-guide.md) and rebuild the image.

The output MBTiles uses the TMS row scheme + a metadata table, exactly like the
existing satellite-2017-11-02_asia_gcc-states.mbtiles, so the tile-server and the
new /services/<name>.json endpoint serve it (and its real maxzoom) unchanged.
"""

import argparse, math, os, sqlite3, sys, time, urllib.request, urllib.error

def lonlat_to_xyz(lon, lat, z):
    """Slippy-map tile (x, y) for a lon/lat at zoom z (XYZ scheme)."""
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(max(-85.05112878, min(85.05112878, lat)))
    y = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))

def tile_ranges(bbox, z):
    """(x0,x1,y0,y1) inclusive tile range covering bbox at zoom z."""
    minlon, minlat, maxlon, maxlat = bbox
    x0, y0 = lonlat_to_xyz(minlon, maxlat, z)   # top-left (min lon, max lat)
    x1, y1 = lonlat_to_xyz(maxlon, minlat, z)   # bottom-right
    return min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)

def estimate_total(bbox, zmin, zmax):
    total = 0
    for z in range(zmin, zmax + 1):
        x0, x1, y0, y1 = tile_ranges(bbox, z)
        total += (x1 - x0 + 1) * (y1 - y0 + 1)
    return total

def init_mbtiles(conn, name, fmt, bbox, zmin, zmax, attribution):
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS metadata (name text, value text)")
    c.execute("""CREATE TABLE IF NOT EXISTS tiles
                 (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)""")
    c.execute("""CREATE UNIQUE INDEX IF NOT EXISTS tile_index
                 ON tiles (zoom_level, tile_column, tile_row)""")
    cx = (bbox[0] + bbox[2]) / 2.0
    cy = (bbox[1] + bbox[3]) / 2.0
    meta = {
        "name": name, "format": fmt, "type": "baselayer", "version": "1.0",
        "minzoom": str(zmin), "maxzoom": str(zmax),
        "bounds": ",".join(str(v) for v in bbox),
        "center": f"{cx},{cy},{zmax}",
        "scheme": "tms", "profile": "mercator",
        "attribution": attribution or "",
        "description": f"{name} — AO extract built by build-tiles-mbtiles.py",
        "generator": "build-tiles-mbtiles.py",
    }
    for k, v in meta.items():
        c.execute("INSERT INTO metadata (name, value) VALUES (?, ?)", (k, v))
    conn.commit()

def have_tile(conn, z, x, tms_y):
    r = conn.execute("SELECT 1 FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
                     (z, x, tms_y)).fetchone()
    return r is not None

def main():
    ap = argparse.ArgumentParser(description="Download XYZ tiles for a bbox+zoom range into an MBTiles file.")
    ap.add_argument("--bbox", required=True, help="minlon,minlat,maxlon,maxlat")
    ap.add_argument("--minzoom", type=int, default=0)
    ap.add_argument("--maxzoom", type=int, required=True)
    ap.add_argument("--url", required=True, help="Tile URL template with {z}/{x}/{y} (XYZ). You own its ToS.")
    ap.add_argument("--out", required=True, help="Output .mbtiles path")
    ap.add_argument("--name", default=None, help="Tileset name (default: out filename stem)")
    ap.add_argument("--format", default="png", choices=["png", "jpg", "jpeg", "webp"])
    ap.add_argument("--attribution", default="")
    ap.add_argument("--rate", type=float, default=5.0, help="Max requests/sec (politeness). Default 5.")
    ap.add_argument("--timeout", type=float, default=20.0)
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--user-agent", default="RMOOZ-offline-tile-builder/1.0")
    ap.add_argument("--max-tiles", type=int, default=2_000_000,
                    help="Safety cap; refuse if the bbox+zoom would exceed this. Default 2M.")
    ap.add_argument("--yes", action="store_true", help="Skip the size-confirmation prompt.")
    args = ap.parse_args()

    try:
        bbox = [float(v) for v in args.bbox.split(",")]
        assert len(bbox) == 4 and bbox[0] < bbox[2] and bbox[1] < bbox[3]
    except Exception:
        print("ERROR: --bbox must be minlon,minlat,maxlon,maxlat (lon -180..180, lat -90..90)", file=sys.stderr)
        return 2

    name = args.name or os.path.splitext(os.path.basename(args.out))[0]
    fmt = "jpg" if args.format == "jpeg" else args.format

    total = estimate_total(bbox, args.minzoom, args.maxzoom)
    print(f"  tileset    : {name}")
    print(f"  bbox       : {bbox}")
    print(f"  zoom       : {args.minzoom}..{args.maxzoom}")
    print(f"  est. tiles : {total:,}")
    if total > args.max_tiles:
        print(f"\nREFUSING: {total:,} tiles exceeds --max-tiles ({args.max_tiles:,}).", file=sys.stderr)
        print("Reduce the bbox (use the AO, not the whole region) or lower --maxzoom.", file=sys.stderr)
        return 3
    approx_mb = total * 0.02  # ~20 KB/tile rough
    print(f"  est. size  : ~{approx_mb:,.0f} MB (rough)")
    if not args.yes and total > 50_000:
        try:
            if input("  Proceed? [y/N] ").strip().lower() not in ("y", "yes"):
                print("  aborted."); return 0
        except EOFError:
            print("  non-interactive + >50k tiles: pass --yes to proceed."); return 4

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    conn = sqlite3.connect(args.out)
    init_mbtiles(conn, name, fmt, bbox, args.minzoom, args.maxzoom, args.attribution)

    min_interval = 1.0 / args.rate if args.rate > 0 else 0.0
    done = skipped = failed = 0
    last = 0.0
    for z in range(args.minzoom, args.maxzoom + 1):
        x0, x1, y0, y1 = tile_ranges(bbox, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                tms_y = (2 ** z - 1) - y
                if have_tile(conn, z, x, tms_y):
                    skipped += 1
                    continue
                url = args.url.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
                data = None
                for attempt in range(args.retries):
                    dt = time.monotonic() - last
                    if dt < min_interval:
                        time.sleep(min_interval - dt)
                    last = time.monotonic()
                    try:
                        req = urllib.request.Request(url, headers={"User-Agent": args.user_agent})
                        with urllib.request.urlopen(req, timeout=args.timeout) as resp:
                            data = resp.read()
                        break
                    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
                        if attempt == args.retries - 1:
                            print(f"  FAIL z{z}/{x}/{y}: {e}", file=sys.stderr)
                        else:
                            time.sleep(0.5 * (attempt + 1))
                if data:
                    conn.execute("INSERT OR REPLACE INTO tiles VALUES (?,?,?,?)",
                                 (z, x, tms_y, sqlite3.Binary(data)))
                    done += 1
                    if done % 200 == 0:
                        conn.commit()
                        print(f"  …{done:,}/{total:,} downloaded (z{z})")
                else:
                    failed += 1
        conn.commit()
        print(f"  z{z} complete.")
    conn.commit()
    conn.close()
    print(f"\n  DONE: {done:,} downloaded, {skipped:,} already present, {failed:,} failed -> {args.out}")
    if failed:
        print(f"  NOTE: {failed:,} tiles failed (often legitimately-absent tiles over water/desert). Re-run to resume.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
