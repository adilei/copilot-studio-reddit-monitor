# Copilot Studio Reddit Monitor

## Project Overview
A system that monitors Reddit posts about Microsoft Copilot Studio, analyzes sentiment using LLMs (Ollama), and tracks Microsoft contributor engagement.

## Tech Stack
- **Backend**: Python FastAPI + SQLAlchemy (SQLite)
- **Frontend**: Next.js 14 + React + TypeScript + shadcn/ui + Tailwind
- **LLM**: Ollama (local, using llama3.2 model)
- **Scheduler**: APScheduler for background jobs

## Running Locally

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
# Runs on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000 (or 3001/3002 if ports in use)
```

### Ollama (required for sentiment analysis)
```bash
ollama serve
# Make sure llama3.2 model is pulled: ollama pull llama3.2
```

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

## Important Notes

### Filter Implementation
The posts page filter must synchronize URL params before loading data. Using `useSearchParams` in useEffect with direct API calls to prevent race conditions.

### "Last 24 Hours" vs "Today"
Changed from date-based ("today") to duration-based ("last 24 hours") because users may be in different timezones than UTC timestamps.

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
