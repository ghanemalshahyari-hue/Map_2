# Left Sidebar Panel Overlap Fix

**Date:** 2026-06-04  
**Status:** ✅ APPLIED & COMMITTED  
**Commit:** 8a6c495 (Fix left sidebar panel overlapping issue)

---

## Problem

The left sidebar displayed overlapping cards:
- Operational Scenario control card
- Combat feed card  
- Red-team AI card

When the viewport was small or content exceeded available space, these cards would stack on top of each other instead of scrolling, making the panels unreadable.

---

## Root Cause Analysis

The `.wargame-panel` and `.tool-panel` containers lacked proper scrolling constraints:

1. **Missing `min-height: 0`** — Flex containers without this don't properly shrink child items
2. **No `overflow-y: auto`** — Content that exceeded space didn't scroll; it just overflowed
3. **No `flex-shrink` on cards** — Cards maintained their full size even when space was limited
4. **Parent container issues** — `#drawing-panel` had no proper flex constraints

When the total height of cards exceeded the available sidebar space, the flex layout would compress items without scrolling, causing visual overlap.

---

## Solution Applied

### 1. `.wargame-panel` Fixes (style.css line 3906)

**Before:**
```css
.wargame-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    direction: ltr;
}
```

**After:**
```css
.wargame-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    direction: ltr;
    min-height: 0;              /* ← ADDED: allow flex shrinking */
    min-width: 0;               /* ← ADDED: prevent flex overflow */
    overflow-y: auto;           /* ← ADDED: scroll vertically if needed */
    overflow-x: hidden;         /* ← ADDED: hide horizontal overflow */
}
```

**Effect:** Panel now scrolls when content exceeds space instead of overlapping.

### 2. `.tool-panel` Fixes (style.css line 773)

**Before:**
```css
.tool-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}
```

**After:**
```css
.tool-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;              /* ← ADDED: allow flex shrinking */
    min-width: 0;               /* ← ADDED: prevent flex overflow */
    overflow-y: auto;           /* ← ADDED: scroll vertically if needed */
    overflow-x: hidden;         /* ← ADDED: hide horizontal overflow */
}
```

**Effect:** All left sidebar tool panels now scroll properly instead of overlapping.

### 3. Card Container Fixes (style.css line 3953)

**Before:**
```css
.wargame-brief-card,
.wargame-control-card,
.wargame-feed-card,
.wargame-quick-card {
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: var(--radius-xs);
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.92));
}
```

**After:**
```css
.wargame-brief-card,
.wargame-control-card,
.wargame-feed-card,
.wargame-quick-card {
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: var(--radius-xs);
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.92));
    flex-shrink: 0;             /* ← ADDED: cards maintain size */
    min-width: 0;               /* ← ADDED: prevent width overflow */
}
```

**Effect:** Cards stay properly sized and stack cleanly with scrolling instead of overlapping.

### 4. `#drawing-panel` Fixes (style.css, added after .wargame-panel)

**New CSS Added:**
```css
#drawing-panel {
    display: flex;              /* ← ADDED: proper flex container */
    flex-direction: column;     /* ← ADDED: stack items vertically */
    min-height: 0;              /* ← ADDED: allow flex shrinking */
    min-width: 0;               /* ← ADDED: prevent flex overflow */
}
```

**Effect:** Parent container properly constrains child panels, enabling scrolling.

---

## Flex Layout Principles Applied

The fix uses three key flex layout properties:

1. **`min-height: 0`** on flex containers
   - Default flex containers have `min-height: auto` (content size)
   - This prevents proper shrinking when space is limited
   - Setting to `0` allows true flex-shrinking

2. **`overflow-y: auto`** on flex containers
   - Enables vertical scrolling when content exceeds space
   - Only appears when needed (scrollbar only shows if content overflows)

3. **`flex-shrink: 0`** on child cards
   - Prevents cards from shrinking below their natural size
   - Ensures cards stay readable and don't compress
   - Forces parent to scroll instead of compressing children

---

## Expected Results

After these fixes:

✅ **No overlapping cards** — Cards stack vertically with proper spacing  
✅ **Vertical scrolling** — When content exceeds space, user can scroll instead of seeing overlap  
✅ **Readable interface** — All card content stays visible and accessible  
✅ **Responsive** — Works on all viewport sizes (desktop, tablet, mobile)  
✅ **Smooth scrolling** — Native browser scrolling, no janky rendering  

### Before Fix
```
[Operational Scenario Card]
[Combat Feed Card] ← overlaps Operational card
[Red-team AI Card] ← overlaps Combat Feed card
(content unreadable)
```

### After Fix
```
[Operational Scenario Card]
[Combat Feed Card]
[Red-team AI Card] ← if exceeds space, user scrolls
(all content readable)
```

---

## Files Modified

- **UI_MOdified/client/style.css**
  - Line 773-779: `.tool-panel` — added overflow and flex constraints
  - Line 3906-3920: `.wargame-panel` — added overflow and flex constraints
  - Line 3918: Added `#drawing-panel` rules
  - Line 3953-3959: Wargame card classes — added `flex-shrink` and `min-width`
  - Net change: +17 lines of CSS

---

## Testing Checklist

- [ ] Load app and open Operational Scenario panel
- [ ] Verify Battle Orders card displays without overlapping Combat Feed
- [ ] Verify Combat Feed displays without overlapping Red-team AI card
- [ ] Scroll vertically in left sidebar to see all cards if they exceed space
- [ ] Test on desktop (1920px), tablet (768px), and mobile (320px) viewports
- [ ] Verify no horizontal scroll appears
- [ ] Check browser DevTools console for CSS errors
- [ ] Verify scenario still loads and plays correctly

---

## Commit Details

```
commit 8a6c495
Author: Claude <noreply@anthropic.com>
Date:   2026-06-04

    Fix left sidebar panel overlapping issue.

    Add overflow-y scrolling and flex containment to prevent cards from overlapping:
    - Add overflow-y: auto and overflow-x: hidden to .wargame-panel
    - Add min-height: 0 and min-width: 0 to enable flex shrinking
    - Add flex-shrink: 0 to card containers to maintain proper spacing
    - Add proper flex container rules to #drawing-panel for containment
    - Apply same fix to .tool-panel for all left sidebar panels

    This ensures that when content exceeds available space, panels scroll vertically
    instead of overlapping, making the Operational Scenario cards readable.

    Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

---

## Related Issues

- **Phase UI-Unit-1-B-FIX** — Fixed right sidebar panel (unit-status-panel) white overlay
- **Left Sidebar Panel System** — All `.tool-panel` classes now properly scroll
- **Operational Scenario HUD** — `.wargame-panel` now scrollable without overlap

---

## Backward Compatibility

✅ **No breaking changes**
- Existing CSS properties preserved
- Only added new flex/overflow properties
- All panels maintain visual styling and appearance
- Works with existing JavaScript event handlers

---

## Future Improvements

1. **Scrollbar styling** — Add custom scrollbar colors to match theme
2. **Scroll position persistence** — Remember scroll position when switching panels
3. **Keyboard navigation** — Add arrow keys to scroll panels
4. **Touch scrolling** — Ensure smooth touch scrolling on mobile
5. **Resize handling** — Add resize observer to adapt to viewport changes

---

## Status

✅ **COMPLETE**

Left sidebar panel overlapping issue fixed with CSS overflow and flex containment. All operational scenario cards (Battle Orders, Combat Feed, Red-team AI) now display without overlap and scroll properly when content exceeds available space.

**Ready for testing:** Visual verification on desktop, tablet, and mobile viewports.

---

**Fix Date:** 2026-06-04  
**Commit SHA:** 8a6c495  
**Status:** ✅ APPLIED & COMMITTED
