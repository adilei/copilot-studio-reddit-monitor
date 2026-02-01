# Readers Feature Specification

## Overview

**Goal**: Allow "readers" - users who can view all content but cannot perform write operations.

**Key Design Decision**: Use existing `contributors` table with `reddit_handle` made nullable. A user is a "reader" if they have `microsoft_alias` but no `reddit_handle`.

## Data Model

| Field | Contributor | Reader |
|-------|-------------|--------|
| `name` | Required | Required |
| `reddit_handle` | Required | NULL |
| `microsoft_alias` | Optional | Required |

**Conversion**: Add/remove `reddit_handle` to convert between reader ↔ contributor.

---

## Permission Matrix

### Read Operations (Both Reader & Contributor)

| Page | Action | Reader | Contributor |
|------|--------|--------|-------------|
| Dashboard | View stats | ✓ | ✓ |
| Posts List | View posts | ✓ | ✓ |
| Post Detail | View post content | ✓ | ✓ |
| Contributors | View list | ✓ | ✓ |
| Analytics | View charts | ✓ | ✓ |
| Themes (Clustering) | View themes | ✓ | ✓ |
| Theme Detail | View theme | ✓ | ✓ |
| Product Areas | View list | ✓ | ✓ |

### Write Operations (Contributor Only)

| Page | Action | Reader | Contributor | UI Element |
|------|--------|--------|-------------|------------|
| Post Detail | Checkout post | ✗ (disabled) | ✓ | "Checkout to handle" button |
| Post Detail | Release post | ✗ (disabled) | ✓ | "Release" button |
| Post Detail | Resolve post | ✗ (disabled) | ✓ | "Mark as Done" button |
| Post Detail | Unresolve post | ✗ (disabled) | ✓ | "Reopen" button |
| Post Detail | Analyze post | ✗ (disabled) | ✓ | "Analyze" button |
| Clustering | Run incremental | ✗ (disabled) | ✓ | "Analyze New Posts" button |
| Clustering | Run full | ✗ (disabled) | ✓ | "Re-analyze All" button |
| Clustering | Analyze (empty state) | ✗ (disabled) | ✓ | "Analyze Posts" button |
| Theme Detail | Edit theme | ✗ (disabled) | ✓ | "Edit" button |
| Contributors | Add contributor | ✗ (disabled)* | ✓ | "Add Contributor" button |
| Contributors | Add reader | ✗ (disabled)* | ✓ | "Add Reader" button |
| Contributors | Delete user | ✗ (disabled)* | ✓ | Trash icon button |
| Product Areas | Create area | ✗ (disabled) | ✓ | "Add Product Area" button |
| Product Areas | Edit area | ✗ (disabled) | ✓ | Edit button |
| Product Areas | Delete area | ✗ (disabled) | ✓ | Delete button |

*Note: When auth is disabled (local dev), contributor management is allowed for all users.

---

## Backend API Protection

### Protected Endpoints (require `require_contributor_write` dependency)

| Router | Endpoint | Method |
|--------|----------|--------|
| posts.py | `/api/posts/{id}/checkout` | POST |
| posts.py | `/api/posts/{id}/release` | POST |
| posts.py | `/api/posts/{id}/resolve` | POST |
| posts.py | `/api/posts/{id}/unresolve` | POST |
| posts.py | `/api/posts/{id}/analyze` | POST |
| contributors.py | `/api/contributors` | POST |
| contributors.py | `/api/contributors/readers` | POST |
| contributors.py | `/api/contributors/{id}` | PUT |
| contributors.py | `/api/contributors/{id}` | DELETE |
| contributors.py | `/api/contributors/{id}/activate` | POST |
| scraper.py | `/api/scrape` | POST |
| scraper.py | `/api/scrape/analyze-all` | POST |
| clustering.py | `/api/clustering/run` | POST |
| clustering.py | `/api/clustering/themes/{id}` | PUT |
| clustering.py | `/api/clustering/recalculate-severity` | POST |

### Response for Readers on Protected Endpoints

- **Status**: 403 Forbidden
- **Body**: `{"detail": "Readers cannot perform this action. Contact an admin to upgrade your access."}`

---

## Frontend Components

### Permission Hook

**File**: `frontend/src/lib/permissions.ts`

```typescript
function useCanPerformActions(): {
  canPerformActions: boolean;
  reason: string | null;
}
```

Logic:
- When auth enabled: Check `user.isReader` from auth context
- When auth disabled: Check `contributor?.reddit_handle === null` from contributor context

### UI Behavior for Disabled Actions

1. Button should have `disabled` attribute
2. Button should have `title` attribute with permission reason (for tooltip)
3. If no button shown, display text explaining why (e.g., "Select a contributor to...")

### Contributor Selector

**File**: `frontend/src/components/ContributorSelector.tsx`

Behavior:
- When auth enabled + user is reader: Show static "Reader" badge (no dropdown)
- When auth enabled + user is contributor: Show static name (no dropdown)
- When auth disabled: Show dropdown with grouped sections:
  - "Contributors" section (users with reddit_handle)
  - "Readers" section (users without reddit_handle)

---

## Test Cases

### E2E Tests Required

#### Reader Permissions - View Access
- [ ] Reader can view dashboard
- [ ] Reader can view posts list
- [ ] Reader can view post detail
- [ ] Reader can view contributors page
- [ ] Reader can view analytics page
- [ ] Reader can view themes page

#### Reader Permissions - Write Access Denied
- [ ] Reader cannot checkout a post (button disabled)
- [ ] Reader cannot resolve a post (button disabled)
- [ ] Reader cannot analyze a post (button disabled)
- [ ] Reader cannot run clustering analysis (buttons disabled)
- [ ] Reader cannot edit theme (button disabled)
- [ ] Reader sees permission message instead of action buttons

#### Contributor Permissions - Write Access Allowed (Control Group)
- [ ] Contributor can access analyze button (enabled)
- [ ] Contributor can access resolve button (enabled)

#### UI Display
- [ ] Reader badge shows in contributors list
- [ ] Sidebar shows reader name when selected
- [ ] Dropdown shows both contributors and readers

### Backend Tests Required

- [ ] Reader gets 403 on POST /api/posts/{id}/checkout
- [ ] Reader gets 403 on POST /api/posts/{id}/analyze
- [ ] Reader gets 403 on POST /api/clustering/run
- [ ] Reader gets 403 on POST /api/contributors
- [ ] Contributor can POST to all protected endpoints
- [ ] Self-demotion protection: contributor cannot remove own reddit_handle

---

## Files Modified

### Backend
- `backend/app/models/contributor.py` - nullable reddit_handle, user_type property
- `backend/app/auth/dependencies.py` - require_contributor_write function
- `backend/app/schemas/schemas.py` - optional reddit_handle, ReaderCreate schema
- `backend/app/routers/posts.py` - protect 5 endpoints
- `backend/app/routers/contributors.py` - protect endpoints, add readers endpoint
- `backend/app/routers/scraper.py` - protect 2 endpoints
- `backend/app/routers/clustering.py` - protect 3 endpoints
- `backend/app/routers/auth.py` - add user_type to /me response
- `backend/app/database.py` - migration for nullable reddit_handle

### Frontend
- `frontend/src/lib/auth-context.tsx` - isReader in AuthUser
- `frontend/src/lib/api.ts` - includeReaders param, createReader function
- `frontend/src/lib/contributor-context.tsx` - isReader exposure
- `frontend/src/lib/permissions.ts` - NEW: useCanPerformActions hook
- `frontend/src/components/ContributorSelector.tsx` - reader badge, grouped dropdown
- `frontend/src/components/ContributorList.tsx` - readers section, permission checks
- `frontend/src/app/posts/detail/page.tsx` - disable action buttons
- `frontend/src/app/clustering/page.tsx` - disable clustering buttons
- `frontend/src/app/clustering/theme/page.tsx` - disable edit button
- `frontend/src/app/contributors/page.tsx` - load readers

### Tests
- `frontend/e2e/readers.spec.ts` - NEW: reader workflow tests
