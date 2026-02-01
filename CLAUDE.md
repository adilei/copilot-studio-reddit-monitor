# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
A system that monitors Reddit posts about Microsoft Copilot Studio, analyzes sentiment using LLMs (Ollama or Azure OpenAI), and tracks Microsoft contributor engagement.

## Tech Stack
- **Backend**: Python FastAPI + SQLAlchemy (SQLite)
- **Frontend**: Next.js 14 + React + TypeScript + shadcn/ui + Tailwind
- **LLM**: Ollama (local) or Azure OpenAI (production)
- **Scheduler**: APScheduler for background jobs

## Running Locally

### Backend
```bash
cd backend

# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate

uvicorn app.main:app --reload
# Runs on http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000 (or 3001/3002 if ports in use)
```

### Ollama (required for local sentiment analysis)
```bash
ollama serve
# Make sure llama3.2 model is pulled: ollama pull llama3.2
```

## Build and Lint

```bash
# Frontend build
cd frontend && npm run build

# Frontend lint
cd frontend && npm run lint
```

## Testing

### E2E Tests (Playwright)
**Prerequisites**: Backend must be running on localhost:8000, frontend on localhost:3000.

```bash
cd frontend

# Run all tests (headless)
npm test

# Run a single test file
npx playwright test e2e/posts.spec.ts

# Run a specific test by name
npx playwright test -g "should filter posts by status"

# Run with UI for debugging
npm run test:ui

# Run with browser visible
npm run test:headed
```

### Backend Tests
```bash
cd backend
pytest
pytest tests/test_specific.py -v  # Run single file
```

### Frontend Test Files
- `e2e/dashboard.spec.ts` - Dashboard loading, stats cards, navigation
- `e2e/posts.spec.ts` - Post filtering, URL params, dropdown filters
- `e2e/post-detail.spec.ts` - Post detail page, analysis display
- `e2e/contributors.spec.ts` - Contributors CRUD, analytics page

## Key Architecture Decisions

### Reddit Scraping
- Uses public JSON API (no authentication required): `https://www.reddit.com/r/CopilotStudio/new.json`
- Only scrapes r/CopilotStudio (not search-based)
- Checks for contributor replies in comments
- Auto-triggers sentiment analysis after scraping
- **GitHub Actions scraper**: Runs every 6 hours from GitHub Actions to avoid Microsoft IP blocks (see below)

### Sentiment Analysis
- Prompt is optimized for Copilot Studio context
- Key distinction: polite help requests = NEUTRAL, not negative
- Only frustrated/angry posts = NEGATIVE
- Analysis does NOT downgrade "handled" status

### Post Data Model (Orthogonal Dimensions)
Posts have four independent state dimensions:
1. **Analysis** (automatic): `is_analyzed` - computed from whether analyses exist
2. **Checkout** (manual): `checked_out_by` - contributor claiming the post to work on
3. **MS Response** (automatic): `has_contributor_reply` - detected from comment scraping
4. **Resolution** (manual): `resolved` - contributor marks post as "done" (vetted/no action needed)

These are intentionally orthogonal - a post can be checked out but already have a response, or be resolved without an MS reply if a community response was sufficient.

## Important Implementation Notes

### Filter Implementation
The posts page filter must synchronize URL params before loading data. Using `useSearchParams` in useEffect with direct API calls to prevent race conditions.

### "Last 24 Hours" vs "Today"
Uses duration-based ("last 24 hours") instead of date-based ("today") because users may be in different timezones than UTC timestamps.

### Sentiment Filter Bug Fix
When filtering by sentiment, must use latest analysis only (posts can have multiple analyses). Implementation uses subquery with `func.max(Analysis.id)`.

### CORS Configuration
Backend allows origins: localhost:3000, 3001, 3002, and 127.0.0.1 variants (Next.js picks available port).

## API Endpoints

### Sync (for remote data transfer)
- `POST /api/sync` - Receive posts/contributors/replies from another instance
  - Modes: `sync` (upsert) or `override` (delete all, then insert)
  - Does NOT scrape Reddit - only receives data from other servers
  - Use `export_to_remote.py` script to push data from source to destination

### Posts
- `GET /api/posts` - List posts (supports analyzed, sentiment, has_reply, checkout, resolved filters)
- `GET /api/posts/{id}` - Get post details with analyses
- `POST /api/posts/{id}/analyze` - Trigger analysis for single post
- `POST /api/posts/{id}/checkout` - Checkout post for a contributor
- `POST /api/posts/{id}/release` - Release checkout on a post
- `POST /api/posts/{id}/resolve` - Mark post as done/vetted
- `POST /api/posts/{id}/unresolve` - Reopen a resolved post

### Scraper
- `POST /api/scrape` - Trigger manual scrape
- `GET /api/scrape/status` - Get scraper status
- `POST /api/scrape/analyze-all` - Analyze all pending posts

### Contributors
- `GET /api/contributors` - List contributors
- `POST /api/contributors` - Add contributor
- `DELETE /api/contributors/{id}` - Remove contributor

### Analytics
- `GET /api/analytics/overview` - Dashboard stats
- `GET /api/analytics/sentiment` - Sentiment trends over time

### Product Areas
- `GET /api/product-areas` - List product areas
- `POST /api/product-areas` - Create product area
- `PUT /api/product-areas/{id}` - Update product area
- `DELETE /api/product-areas/{id}` - Deactivate product area (soft delete)

### Clustering
- `POST /api/clustering/run` - Trigger clustering (full or incremental)
- `GET /api/clustering/status` - Get latest clustering run status
- `GET /api/clustering/themes` - List discovered pain themes
- `GET /api/clustering/themes/{id}` - Get theme with associated posts
- `PUT /api/clustering/themes/{id}` - Update theme (name, severity, product area)
- `GET /api/clustering/heatmap` - Get heatmap data (product area x theme x post count)

## Database Schema
SQLite database at `backend/data/reddit_monitor.db`

Tables:
- `posts` - Reddit posts (id is Reddit post ID)
- `analyses` - LLM analysis results (multiple per post possible)
- `contributors` - Microsoft contributor handles to track
- `contributor_replies` - Tracks when contributors reply to posts
- `product_areas` - Predefined product categories (seeded with 12 defaults)
- `pain_themes` - LLM-discovered pain themes linked to product areas
- `post_theme_mappings` - Links posts to discovered themes (many-to-many)
- `clustering_runs` - Audit trail for clustering operations

## Background Jobs
APScheduler runs:
- Scrape job: Every hour
- Analysis job: Every 5 minutes (analyzes pending posts)
- Clustering job: Every 6 hours (incremental clustering to assign new posts to themes)

## Development Workflow

### Issue-Based Feature Development
Before implementing significant features or data model changes:
1. **Create GitHub issue(s)** to document the spec and rationale
2. **Label appropriately** (enhancement, bug, etc.)
3. **Implement** the feature on a branch
4. **Create PR** linking to the issue(s)
5. **Future work** should be tracked as separate issues (e.g., #4 for resolution tracking)

This ensures features are discussed/documented before code is written, and provides traceability.

### Adding Tests for New Features
When adding a new feature, add corresponding E2E tests **immediately**:
1. Create test cases in the relevant spec file (or new file for new pages)
2. Test the happy path and edge cases
3. **For any UI feature with links/navigation, verify links work before committing** - click through to ensure routes resolve correctly
4. Run `npm test` to verify all tests pass before committing

**Important**: When adding clickable elements (links, buttons that navigate), always test that the destination route exists and renders correctly. Don't assume links work - verify them in the browser or with E2E tests.

### Running Tests After Changes
**CRITICAL**: After making ANY frontend or backend changes that affect the UI:
1. Run `npx playwright test` in the frontend directory
2. Fix any failing tests before committing
3. Tests should be workflow-focused (test user journeys) not label-focused (testing specific text strings that may change)

This prevents regressions and catches issues early. Test failures often reveal mismatched expectations between old tests and new UI.

See `docs/UI_TEST_PLAN.md` for comprehensive manual testing checklist.

## Important Notes

### Reddit Scraping Rate Limits
- Reddit blocks requests with bot-like User-Agents (403 Blocked)
- Using browser-like User-Agent in config.py to avoid blocks
- Too many requests in quick succession triggers 429 Too Many Requests
- Wait 5+ minutes between scrape attempts if rate limited

### Remote Sync Feature (PR #6, #7)

See `docs/SYNC_GUIDE.md` for complete sync documentation including daily workflows and scripts.

- Scrape button removed from Dashboard - scraping via API/scheduler only
- `POST /api/sync` receives data from other instances (server-to-server)
- `python scripts/export_to_remote.py <url>` pushes local data to remote
- Dashboard shows "Data Freshness" with both scrape time and sync time
- Destination servers display when they received data AND when source scraped it
- **Known issue**: On fresh sync, contributor replies may fail with "Post not found" because replies are processed before posts are committed. Workaround: run sync twice.

### Virtual Environment
- Backend venv is at `backend/venv/` (not `.venv`)

### Pain Point Clustering Feature
- LLM analyzes posts in batches (~20 posts) to discover recurring themes
- Two-level hierarchy: Product Areas (predefined) → Pain Themes (LLM-discovered)
- Heatmap visualization: size = post count, color = severity (1-5)
- Two run types: "full" (re-cluster all posts) and "incremental" (assign new posts to existing themes)
- Scheduled incremental clustering runs every 6 hours
- `key_issues` was removed from sentiment analysis (made redundant by clustering)
- Product areas seeded on first startup with 12 Copilot Studio categories

### Azure Deployment

See `DEPLOY_GUIDE.md` for complete deployment documentation including:
- Resource setup and configuration
- Backend/frontend deployment commands
- Managed identity authentication for Azure OpenAI
- Azure AD authentication setup
- SQLite schema migrations
- Static Web App environments (preview vs production)
- Troubleshooting guide

**EMEA Deployment (January 2026):**
| Component | URL |
|-----------|-----|
| Frontend | https://thankful-tree-0325e0003.1.azurestaticapps.net |
| Backend | https://mcs-social-api-emea.azurewebsites.net |
| API Docs | https://mcs-social-api-emea.azurewebsites.net/docs |

**Quick tips:**
- SQLAlchemy `create_all()` won't add columns to existing tables—use `run_migrations()` in `database.py`
- Next.js `NEXT_PUBLIC_*` vars must be set at BUILD time, not via Azure app settings
- SWA CLI defaults to preview environment; use `--env production` for prod deploys
- Deploy auth to new env: set `AUTH_ENABLED=false` first, configure aliases via API, then enable

### GitHub Actions Scraper

Reddit blocks requests from Microsoft/corporate IP ranges (403 errors). GitHub Actions runners have non-Microsoft IPs and are used as an interim solution.

**Workflows:**
- `.github/workflows/test-reddit.yml` - Manual test to verify Reddit access from GitHub Actions
- `.github/workflows/scrape-reddit.yml` - Scheduled scraper (every 6 hours)

**Setup - GitHub Secrets required:**
```
AZURE_PRIMARY_URL=https://mcs-social-api-amafe4bmc8b5cnf9.swedencentral-01.azurewebsites.net
AZURE_EMEA_URL=https://mcs-social-api-emea.azurewebsites.net
```

To configure:
1. Go to repo → Settings → Secrets and variables → Actions
2. Add both secrets with the Azure backend URLs

**How it works:**
1. GitHub Actions runs on schedule (0:00, 6:00, 12:00, 18:00 UTC)
2. `backend/scripts/github_scrape.py` scrapes Reddit public JSON API
3. Script POSTs scraped posts to both Azure endpoints via `/api/sync`
4. Azure backends analyze posts and check for contributor replies

**Manual trigger:**
- Go to Actions tab → "Scrape Reddit" or "Test Reddit Access" → Run workflow
