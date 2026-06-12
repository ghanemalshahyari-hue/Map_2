# Viewer vendoring — offline VM deployment

The viewer (`viewer/index.html`) currently loads CesiumJS from the official CDN
(`https://cesium.com/downloads/cesiumjs/releases/1.122/...`). That's fine while
developing online. For the offline VM, vendor it locally — instructions below.

## Step 1 — Download Cesium release

On a machine with internet:

```bash
cd viewer/vendor
curl -L -O https://cesium.com/downloads/cesiumjs/releases/1.122/Cesium-1.122.zip
unzip Cesium-1.122.zip -d cesium-1.122
rm Cesium-1.122.zip
```

After this, you'll have:

```
viewer/vendor/cesium-1.122/
├── Build/Cesium/
│   ├── Cesium.js
│   ├── Widgets/widgets.css
│   ├── Workers/
│   ├── Assets/
│   └── ...
└── ...
```

## Step 2 — Swap CDN URLs to local paths

Edit `viewer/index.html`:

```html
<!-- BEFORE (CDN) -->
<script src="https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium/Cesium.js"></script>
<link  href="https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium/Widgets/widgets.css" rel="stylesheet">

<!-- AFTER (local) -->
<script src="vendor/cesium-1.122/Build/Cesium/Cesium.js"></script>
<link  href="vendor/cesium-1.122/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
```

Cesium auto-discovers its Workers/ and Assets/ relative to where Cesium.js was loaded from.

## Step 3 — OSM tile cache (optional, for fully air-gapped use)

OSM tiles also come from the internet by default. For fully offline use, either:

### Option A — Pre-download OSM tiles for the AO

Use `mokutile` or similar to scrape tiles in the bbox:

```bash
# Example for our AO (Libya — Gulf of Sidra)
pip install osmtogeojson
# Or fetch tiles via a tile server cache
```

Then in `viewer/main.js`, change the imagery provider:

```javascript
// BEFORE
imageryProvider: new Cesium.UrlTemplateImageryProvider({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  ...
}),

// AFTER (local tiles)
imageryProvider: new Cesium.UrlTemplateImageryProvider({
  url: 'tiles/{z}/{x}/{y}.png',     // relative path to your local cache
  ...
}),
```

### Option B — Use the bundled satellite_base.jpeg as a single rectangle

If you don't want a tile server, you can show your `inputs/gis/imagery/satellite_base.jpeg`
as a single georeferenced rectangle for the AO bbox. Edit `main.js`:

```javascript
viewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
  url: '../inputs/gis/imagery/satellite_base.jpeg',
  rectangle: Cesium.Rectangle.fromDegrees(
    bbox[0], bbox[1], bbox[2], bbox[3]
  ),
}));
```

This covers only the AO bbox — outside it the globe will be black, but for an
ops-focused viewer that's fine.

## Step 4 — Verify

After vendoring:

```bash
# Open viewer/index.html in a browser
# Open the browser console — should see "WarGame viewer ready. Phases: 17"
# No requests should go to cesium.com or tile.openstreetmap.org
```

Use the browser's Network tab (filter "third-party") to confirm everything's local.

## Bundle size reference

| Component | Size (Cesium 1.122) |
|---|---|
| Build/Cesium/Cesium.js | ~5 MB |
| Build/Cesium/Workers/ | ~3 MB |
| Build/Cesium/Assets/ (textures, etc.) | ~5 MB |
| **Total local vendor** | **~13 MB** |
| Pre-cached OSM tiles for our AO at zoom 8-12 | ~30-100 MB |
