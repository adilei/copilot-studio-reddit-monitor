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

### Sentiment Analysis
- Prompt is optimized for Copilot Studio context
- Key distinction: polite help requests = NEUTRAL, not negative
- Only frustrated/angry posts = NEGATIVE
- Analysis does NOT downgrade "handled" status

### Post Status Flow
- `pending` → Post scraped, awaiting analysis
- `analyzed` → LLM has analyzed the post
- `handled` → Microsoft contributor has replied (protected from downgrade)

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

### Posts
- `GET /api/posts` - List posts (supports status, sentiment, subreddit filters)
- `GET /api/posts/{id}` - Get post details with analyses
- `PATCH /api/posts/{id}/status` - Update post status
- `POST /api/posts/{id}/analyze` - Trigger analysis for single post

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

## Database Schema
SQLite database at `backend/data/reddit_monitor.db`

Tables:
- `posts` - Reddit posts (id is Reddit post ID)
- `analyses` - LLM analysis results (multiple per post possible)
- `contributors` - Microsoft contributor handles to track
- `contributor_replies` - Tracks when contributors reply to posts

## Background Jobs
APScheduler runs:
- Scrape job: Every hour
- Analysis job: Every 5 minutes (analyzes pending posts)

## Adding Tests for New Features
When adding a new feature, add corresponding E2E tests **immediately**:
1. Create test cases in the relevant spec file (or new file for new pages)
2. Test the happy path and edge cases
3. **For any UI feature with links/navigation, verify links work before committing** - click through to ensure routes resolve correctly
4. Run `npm test` to verify all tests pass before committing

**Important**: When adding clickable elements (links, buttons that navigate), always test that the destination route exists and renders correctly. Don't assume links work - verify them in the browser or with E2E tests.

See `docs/UI_TEST_PLAN.md` for comprehensive manual testing checklist.
