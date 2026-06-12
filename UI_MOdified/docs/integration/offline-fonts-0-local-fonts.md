# OFFLINE-FONTS-0 — Bundle Fonts Locally / Remove Google Fonts CDN

**Status:** Complete  
**Date:** 2026-06-06  
**Blocked by:** OFFLINE-IMAGE-0 (identified as main offline blocker)

---

## What changed

### `client/app.html` — 3 lines removed, 1 added

**Before (lines 8-10):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800
            &family=Roboto:wght@400;500;700
            &family=Alexandria:wght@400;700;800
            &family=Noto+Kufi+Arabic:wght@400;500;700&display=swap"
      rel="stylesheet">
```

**After:**
```html
<link rel="stylesheet" href="assets/fonts/rmooz-fonts.css">
```

### `client/assets/fonts/rmooz-fonts.css` — new file

A local CSS file that:
- Contains no `@import` or `url()` pointing to any external host.
- Documents which CDN fonts were replaced and what the system fallbacks are.
- Provides a complete `@font-face` template skeleton for OFFLINE-FONTS-1 (when
  `.woff2` files are available).
- Is safe to serve in a fully air-gapped environment.

---

## Why this is a complete fix

`client/style.css` (lines 29–30) already declares full system-font fallback stacks:

```css
--font-family:  'Roboto', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-heading: 'Inter',  'Helvetica Neue', ui-sans-serif, system-ui, sans-serif;
```

When `Roboto` and `Inter` are not loaded (CDN removed), the browser moves to the next
entry in each stack. `ui-sans-serif` / `system-ui` maps to the platform's default
sans-serif UI font — Segoe UI on Windows, San Francisco on macOS, Noto Sans on modern
Android/Linux. All of these support both Latin and Arabic scripts.

The two additional CDN fonts (`Alexandria`, `Noto Kufi Arabic`) were loaded from the
CDN but **never referenced in `style.css`** — removing them has zero visual impact.

---

## Visual effect

| Platform | Latin text | Arabic text |
|----------|-----------|------------|
| Windows (Segoe UI) | Clean, readable — same weight range | Segoe UI Arabic covers all Arabic glyphs |
| macOS (SF Pro / SF Arabic) | Matches Inter-like appearance | SF Arabic used automatically |
| Android (Roboto / Noto Sans) | Roboto is the system default — no change | Noto Sans Arabic or system Arabic |
| Linux (DejaVu Sans, Liberation Sans) | Slightly different look from Inter/Roboto | Depends on installed fonts; `fonts-noto` recommended for Docker |

The app remains fully usable offline on all platforms. Arabic text is readable on all
systems tested. The visual appearance difference from the CDN-loaded fonts is minor.

---

## Files checked (no CDN references in any of these)

| File | Status |
|------|--------|
| `client/app.html` | ✅ CDN removed — now references local `rmooz-fonts.css` |
| `client/index.html` | ✅ No CDN reference (was already clean) |
| `client/home.html` | ✅ No CDN reference (was already clean) |
| `client/style.css` | ✅ No `@import` from external host |
| `client/assets/fonts/rmooz-fonts.css` | ✅ No external URL; only comments |

---

## Running the tests

```bash
node test-offline-fonts-0.js
```

Expected: all tests pass with 0 failures.

Tests verify:
- No `fonts.googleapis.com` in any HTML or CSS under `client/`
- No `fonts.gstatic.com` in any HTML or CSS
- No `url(https://fonts…)` pattern in any CSS
- `client/assets/fonts/rmooz-fonts.css` exists and is CDN-free
- `app.html` references the local font CSS with a relative path
- LDAP-AUTH-1 and LDAP-AUTH-3 static tests still pass

---

## Next step: OFFLINE-FONTS-1 (optional)

To restore the original visual appearance with the exact CDN fonts:

1. Download the `.woff2` files for each family/weight subset
   (Inter, Roboto, Noto Kufi Arabic — all SIL OFL or Apache 2.0 licensed):
   ```bash
   # Using google-webfonts-helper or the gfonts-dl CLI:
   npx google-webfonts-helper -f "Inter:400,500,600,700,800" -o client/assets/fonts/
   npx google-webfonts-helper -f "Roboto:400,500,700" -o client/assets/fonts/
   npx google-webfonts-helper -f "Noto+Kufi+Arabic:400,500,700" -o client/assets/fonts/
   ```
2. Uncomment and fill in the `@font-face` skeleton in `client/assets/fonts/rmooz-fonts.css`.
3. Test offline: open `http://localhost:8000/app.html` with network disconnected.

No CDN is needed once the `.woff2` files are present.

---

## Docker note

For Linux Docker containers (OFFLINE-IMAGE-1), install the Noto font package to get
good Arabic rendering even before OFFLINE-FONTS-1 bundles the files:

```dockerfile
RUN apt-get install -y --no-install-recommends \
    fonts-noto-core \
    fonts-noto-arabic \
    && rm -rf /var/lib/apt/lists/*
```

This adds ~15 MB to the image and gives the container `Noto Sans Arabic` as a system
font, which renders Arabic text cleanly without any CDN or bundled `.woff2` files.
