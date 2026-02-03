# Clustering Page Controls Spec

## Problem

The current "Settings" section on the clustering page has UX issues:

1. **Misleading terminology** - "Settings" implies multiple configurable options, but we only have one: minimum post threshold
2. **Wrong icon** - The cog/gear icon suggests app-wide settings, not a simple filter
3. **Missing sorting** - Users can't sort themes by post count or severity, making it hard to find the most impactful themes

## Proposed Solution

Replace the collapsible "Settings" panel with inline controls that feel like filters/view options rather than settings.

## UI Design

### Current Layout
```
┌─────────────────────────────────────────────────────────────┐
│ [Filter by product area ▼]    ⚙️ Settings    36 themes, 207 posts │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Minimum posts per theme: [  2  ▼]                       │ │
│ │ (Hiding 17 themes with fewer posts)                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Proposed Layout
```
┌─────────────────────────────────────────────────────────────┐
│ [Filter by product area ▼]   [Sort: Severity ▼]   [Min posts: 2 ▼] │
│                                                                     │
│ 36 themes, 207 posts (hiding 17 below threshold)                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Components

1. **Product Area Filter** (existing)
   - Multi-select dropdown
   - No changes needed

2. **Sort Dropdown** (new)
   - Icon: ArrowUpDown or ListOrdered from lucide-react
   - Label: "Sort: [current]"
   - Options:
     - **Severity** (default) - highest severity first
     - **Post count** - most posts first
     - **Newest** - most recently created themes first
     - **Name** - alphabetical A-Z

3. **Min Posts Dropdown** (redesigned)
   - Icon: Filter or Layers from lucide-react (or no icon)
   - Label: "Min posts: [value]"
   - Options: 1, 2, 3, 5, 10 (same as current)
   - Compact inline style matching Sort dropdown

4. **Stats Row** (simplified)
   - Format: "X themes, Y posts"
   - When filtering: "X themes, Y posts (hiding Z below threshold)"
   - Remove the separate collapsible panel

## Behavior

### Sorting
- Default sort: Severity (descending), then name (ascending) for ties
- Sort is applied client-side (no API changes)
- Sort preference persisted in localStorage

### Threshold Filter
- Same behavior as current
- Persisted in localStorage (already implemented)

### localStorage Schema
```typescript
// Key: 'clustering_view_options'
{
  minPostCount: 2,      // existing, renamed from clustering_settings
  sortBy: 'severity'    // new
}
```

### Sort Logic
```typescript
const sortedThemes = [...visibleThemes].sort((a, b) => {
  switch (sortBy) {
    case 'severity':
      // Primary: severity desc, Secondary: name asc
      if (b.severity !== a.severity) return b.severity - a.severity
      return a.name.localeCompare(b.name)
    case 'post_count':
      // Primary: post_count desc, Secondary: severity desc
      if (b.post_count !== a.post_count) return b.post_count - a.post_count
      return b.severity - a.severity
    case 'newest':
      // Primary: created_at desc
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    case 'name':
      // Primary: name asc
      return a.name.localeCompare(b.name)
  }
})
```

## Visual Style

All three dropdowns should have consistent styling:
- Same height and padding
- Muted/secondary button variant
- Compact text (text-sm)
- No heavy borders or backgrounds
- Aligned horizontally with consistent spacing

Example using shadcn Select:
```tsx
<Select value={sortBy} onValueChange={setSortBy}>
  <SelectTrigger className="w-[160px] h-9">
    <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
    <span className="text-muted-foreground">Sort:</span>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="severity">Severity</SelectItem>
    <SelectItem value="post_count">Post count</SelectItem>
    <SelectItem value="newest">Newest</SelectItem>
    <SelectItem value="name">Name</SelectItem>
  </SelectContent>
</Select>
```

## Migration

1. Remove `settingsOpen` state (no more collapsible panel)
2. Rename localStorage key from `clustering_settings` to `clustering_view_options`
3. Migrate existing `minPostCount` value on first load
4. Add `sortBy` with default 'severity'

## Test Cases

### Sorting Tests
1. **Default sort is severity** - themes appear highest severity first
2. **Sort by post count** - themes with most posts appear first
3. **Sort by newest** - most recently created themes first
4. **Sort by name** - alphabetical order
5. **Sort persists across reload** - localStorage preserves choice

### Threshold Tests (existing, update selectors)
1. Dropdown shows current threshold value
2. Changing threshold filters themes
3. Stats show hidden count when filtering
4. Threshold persists across reload

### Layout Tests
1. All three controls visible on page load
2. Controls align horizontally
3. Stats row shows correct counts

## Files to Modify

- `frontend/src/app/clustering/page.tsx` - Replace settings panel with inline controls
- `frontend/e2e/clustering.spec.ts` - Update tests for new UI

## Out of Scope

- Server-side sorting (keep client-side for simplicity)
- Additional filter options (severity filter, date range)
- Saved view presets
