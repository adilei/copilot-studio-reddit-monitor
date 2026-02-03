# Clustering Page Settings Spec

## Overview

Add a settings section to the clustering/themes page that allows users to adjust display preferences, starting with a minimum post count threshold to hide low-volume themes.

## User Story

As a PM reviewing themes, I want to hide themes with only 1-2 posts so I can focus on recurring issues that affect multiple users.

## UI Design

### Settings Section

Location: Below the header, above the filter row (collapsible)

```
┌─────────────────────────────────────────────────────────────┐
│ Themes                                                       │
│ Recurring issues discovered from Reddit posts                │
│                                          [Refresh] [Analyze] │
├─────────────────────────────────────────────────────────────┤
│ ⚙️ Settings                                          [Hide]  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Minimum posts per theme: [  2  ▼]                       │ │
│ │ (Hiding 17 themes with fewer posts)                     │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [Filter by product area ▼]              36 themes, 207 posts │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **Settings Toggle Button**
   - Icon: Gear (⚙️) or Settings icon from lucide-react
   - Label: "Settings"
   - Clicking toggles visibility of settings panel
   - State persisted in localStorage

2. **Settings Panel** (collapsible)
   - Background: Subtle card/border to distinguish from main content
   - Contains adjustable settings

3. **Minimum Posts Threshold**
   - Label: "Minimum posts per theme"
   - Input: Dropdown/Select with options: 1, 2, 3, 5, 10
   - Default: 2 (hide single-post themes)
   - Helper text: Shows count of hidden themes (e.g., "Hiding 17 themes with fewer posts")

## Behavior

### Filtering Logic

1. Threshold applies client-side (no API changes needed)
2. Themes with `post_count < threshold` are hidden from the list
3. Stats update to reflect visible themes only
4. Product area filter counts update to reflect visible themes only
5. "Unclustered posts" count is NOT affected by threshold

### Persistence

- Settings stored in localStorage under key `clustering_settings`
- Format: `{ minPostCount: 2 }`
- Loaded on page mount
- Saved immediately on change

### Edge Cases

1. If threshold hides all themes, show empty state: "No themes match current settings"
2. URL product_area_ids filter applies AFTER threshold filter
3. Theme counts in product area dropdown reflect post-threshold filtering

## Implementation

### State

```typescript
const [settings, setSettings] = useState({
  minPostCount: 2,
})
const [settingsOpen, setSettingsOpen] = useState(false)
```

### Filtered Themes

```typescript
const visibleThemes = themes.filter(t => t.post_count >= settings.minPostCount)
const hiddenCount = themes.length - visibleThemes.length
```

### localStorage

```typescript
// Load on mount
useEffect(() => {
  const saved = localStorage.getItem('clustering_settings')
  if (saved) {
    setSettings(JSON.parse(saved))
  }
}, [])

// Save on change
useEffect(() => {
  localStorage.setItem('clustering_settings', JSON.stringify(settings))
}, [settings])
```

## Test Cases

### Settings Panel Tests

1. **Settings toggle works**
   - Click settings button → panel opens
   - Click again → panel closes

2. **Default threshold is 2**
   - On fresh load (no localStorage), threshold should be 2

3. **Threshold dropdown has correct options**
   - Options: 1, 2, 3, 5, 10

4. **Changing threshold filters themes**
   - Set threshold to 5 → only themes with 5+ posts visible
   - Set threshold to 1 → all themes visible

5. **Hidden count displays correctly**
   - Shows "Hiding X themes with fewer posts"
   - Count updates when threshold changes

6. **Settings persist across page reload**
   - Set threshold to 5
   - Reload page
   - Threshold should still be 5

### Integration Tests

7. **Stats reflect filtered themes**
   - "X themes" count should only count visible themes
   - "Y posts" count should sum only visible theme posts

8. **Product area filter works with threshold**
   - Apply both threshold and product area filter
   - Only themes matching BOTH criteria shown

9. **Empty state when all filtered**
   - Set threshold to 100 (higher than any theme)
   - Should show "No themes match current settings"

## Files to Modify

- `frontend/src/app/clustering/page.tsx` - Add settings UI and filtering logic
- `frontend/e2e/clustering.spec.ts` - Add settings tests

## Future Enhancements (Out of Scope)

- Severity filter (show only Critical/High themes)
- Sort options (by post count, severity, recency)
- Save settings per-user (requires backend)
