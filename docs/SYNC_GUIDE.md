# Sync Guide

Documentation for syncing data between local development and Azure EMEA.

## Overview

With Azure main being deprecated, EMEA is the primary deployment. Local development scrapes Reddit and syncs to EMEA.

| Environment | URL | Auth |
|-------------|-----|------|
| EMEA (primary) | https://mcs-social-api-emea.azurewebsites.net | Azure AD |
| Local | http://localhost:8000 | None |

## Scripts

### Daily Sync (`scripts/daily_sync.py`)

The main script for daily operations. Run this to keep EMEA up to date.

```bash
cd backend
source venv/bin/activate

# Full sync
python scripts/daily_sync.py --token YOUR_EMEA_TOKEN

# Dry run (scrapes locally, doesn't push to EMEA)
python scripts/daily_sync.py --token YOUR_EMEA_TOKEN --dry-run

# Sync more history
python scripts/daily_sync.py --token YOUR_EMEA_TOKEN --since-hours 72
```

**What it does:**
1. Fetches contributors from EMEA → adds missing ones to local DB
2. Scrapes Reddit locally (posts + contributor replies)
3. Syncs new posts and replies to EMEA

### Export to Remote (`scripts/export_to_remote.py`)

Push local data to any remote instance.

```bash
# Sync all data
python scripts/export_to_remote.py https://remote.example.com --token TOKEN

# Only recent posts
python scripts/export_to_remote.py https://remote.example.com --since 2025-01-19T00:00:00

# Full override (replace all remote data)
python scripts/export_to_remote.py https://remote.example.com --override

# Dry run
python scripts/export_to_remote.py https://remote.example.com --dry-run
```

### Sync Status (`scripts/sync_status.py`)

One-off script to sync checkout status from main to EMEA. Used during migration.

```bash
python scripts/sync_status.py --token YOUR_EMEA_TOKEN --dry-run
python scripts/sync_status.py --token YOUR_EMEA_TOKEN
```

### GitHub Actions Scraper (`scripts/github_scrape.py`)

Runs in GitHub Actions to scrape Reddit (avoids Microsoft IP blocks).

**Workflow:** `.github/workflows/scrape-reddit.yml`
**Schedule:** Every 6 hours (0:00, 6:00, 12:00, 18:00 UTC)

## API Endpoint

### POST `/api/sync`

Receives data from other instances. Used by all sync scripts.

```json
{
  "mode": "sync",  // or "override"
  "posts": [...],
  "contributors": [...],  // optional
  "contributor_replies": [...],  // optional
  "source_scraped_at": "2025-01-30T12:00:00Z"
}
```

**Modes:**
- `sync` - Upsert (add new, update existing)
- `override` - Delete all, then insert

## Getting an EMEA Token

1. Go to EMEA frontend: https://thankful-tree-0325e0003.1.azurestaticapps.net
2. Sign in with Microsoft account
3. Open browser DevTools → Network tab
4. Make any API request (e.g., refresh posts)
5. Find request to `mcs-social-api-emea.azurewebsites.net`
6. Copy the `Authorization: Bearer ...` header value

Tokens expire after ~1 hour.

## What Gets Synced

| Data | Synced | Notes |
|------|--------|-------|
| Posts | Yes | Basic post data (title, body, author, etc.) |
| Contributors | Yes | Name, reddit handle, role, active status |
| Contributor replies | Yes | Which contributors replied to which posts |
| Checkout status | No* | Use `sync_status.py` for one-off migration |
| Resolved status | No | EMEA-only feature |
| Analyses | No | Each environment runs its own LLM analysis |
| Pain themes | No | Each environment runs its own clustering |

## Typical Daily Workflow

```bash
# 1. Get fresh EMEA token (see above)

# 2. Run daily sync
cd backend
source venv/bin/activate
python scripts/daily_sync.py --token "eyJ..."

# 3. Check EMEA dashboard for new posts
```

## Troubleshooting

### "401 Unauthorized"
Token expired. Get a new one from the browser.

### "Post not found" errors during sync
Contributor replies reference posts that don't exist in destination. Run sync twice, or use `--since-hours` with a larger window.

### Reddit 403/429 errors
Reddit is blocking requests. Wait 5+ minutes, or use GitHub Actions scraper instead.
