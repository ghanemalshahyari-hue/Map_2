#!/usr/bin/env python3
"""Simple MBTiles tile server - no npm/Node required. Uses Python's built-in sqlite3.
Run from project root: python server/tile-server.py
"""
import http.server
import sqlite3
import urllib.parse
import os

PORT = 8080
# maps/ folder lives at the project root (parent of server/)
MAPS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'maps')

_format_cache = {}

def get_tile_format(tileset):
    if tileset in _format_cache:
        return _format_cache[tileset]
    tile_path = os.path.join(MAPS_DIR, tileset + '.mbtiles')
    fmt = 'png'
    try:
        conn = sqlite3.connect(tile_path)
        cur = conn.cursor()
        cur.execute("SELECT value FROM metadata WHERE name='format'")
        row = cur.fetchone()
        if row and row[0]:
            fmt = str(row[0]).lower()
        conn.close()
    except Exception:
        pass
    _format_cache[tileset] = fmt
    return fmt

def get_tile(tileset, z, x, y):
    tile_path = os.path.join(MAPS_DIR, tileset + '.mbtiles')
    if not os.path.exists(tile_path):
        return None
    try:
        conn = sqlite3.connect(tile_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        max_y = (1 << int(z)) - 1
        tms_y = max_y - int(y)
        cur.execute(
            'SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?',
            (int(z), int(x), tms_y)
        )
        row = cur.fetchone()
        conn.close()
        return row['tile_data'] if row else None
    except Exception:
        return None

class TileHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parts = self.path.strip('/').split('/')
        if len(parts) >= 5 and parts[0] == 'services':
            tileset, z, x, y_ext = parts[1], parts[2], parts[3], parts[4]
            y = y_ext.rsplit('.', 1)[0] if '.' in y_ext else y_ext
            data = get_tile(tileset, z, x, y)
            if data:
                fmt = get_tile_format(tileset)
                ctype = 'image/jpeg' if fmt in ('jpg', 'jpeg') else (
                    'image/webp' if fmt == 'webp' else 'image/png'
                )
                self.send_response(200)
                self.send_header('Content-Type', ctype)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
                return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass

def main():
    # Run with the project root as cwd so relative imports stay consistent
    project_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    os.chdir(project_root)
    mbtiles = [f[:-9] for f in os.listdir(MAPS_DIR) if f.endswith('.mbtiles')]
    print('\nMBTiles tile server at http://localhost:%d' % PORT)
    print('Tilesets:', ', '.join(mbtiles) or '(none)')
    print('\nRun start-server.bat in another window, then open http://localhost:8000\n')
    server = http.server.HTTPServer(('', PORT), TileHandler)
    server.serve_forever()

if __name__ == '__main__':
    main()
