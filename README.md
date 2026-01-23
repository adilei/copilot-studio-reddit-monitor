# Copilot Studio Reddit Monitor

A full-stack application to monitor Reddit discussions about Microsoft Copilot Studio, analyze sentiment using LLMs, and track Microsoft contributor engagement.

![Dashboard](docs/screenshots/dashboard.png)

## Features

### Dashboard Overview
Real-time monitoring of Reddit activity with key metrics:
- **Total Posts** - All scraped posts from r/CopilotStudio
- **Negative Sentiment** - Percentage of posts with negative sentiment, plus warning count for escalation-worthy posts
- **Handled** - Posts that have received a Microsoft contributor response
- **Pending** - Posts awaiting LLM analysis
- **Scraper Status** - Live scraping status and last run time

### Posts Management
Browse, filter, and manage all scraped Reddit posts:

![Posts List](docs/screenshots/posts-list.png)

- Filter by **status** (Pending, Analyzed, Handled)
- Filter by **sentiment** (Positive, Neutral, Negative)
- **Search** posts by title or content
- Posts with **warning flags** automatically appear at the top
- View sentiment badges, status, Reddit score, and comment count

### Warning Detection
The LLM analyzer automatically detects escalation-worthy posts that need immediate attention:

![Negative Posts with Warnings](docs/screenshots/posts-negative.png)

Warning triggers include:
- Users expressing intent to quit or switch to competitors
- Loss of faith/confidence in the product ("I've lost faith", "time to call it quits")
- Hostile or derogatory language toward the product
- Deadline pressure combined with reliability concerns
- Users citing other frustrated community members as validation

Warning posts display a **⚠ badge** and are always sorted to the top of the list.

### Post Detail View
Deep dive into individual posts with full analysis:

![Post Detail](docs/screenshots/post-detail.png)

- Complete post text from Reddit
- Sentiment analysis with confidence score
- Key issues identified by LLM
- Status management (Pending → Analyzed → Handled)
- Microsoft contributor response tracking
- Re-analyze button for fresh LLM analysis
- Direct link to original Reddit post

### Contributors Management
Track Microsoft employees who respond to Reddit posts:

![Contributors](docs/screenshots/contributors.png)

- Add/remove contributors by Reddit handle
- Automatic detection when contributors reply to posts
- Posts auto-marked as "Handled" when a contributor responds
- Reply count tracking per contributor

### Analytics Dashboard
Visualize sentiment trends and engagement metrics:

![Analytics](docs/screenshots/analytics.png)

- **Sentiment Trends** - Line chart showing positive/neutral/negative over time (7-90 days)
- **Subreddit Breakdown** - Post distribution by source
- **Status Distribution** - Pending/Analyzed/Handled breakdown
- **Contributor Leaderboard** - Most active responders

## Tech Stack

### Backend
- **FastAPI** - Python web framework
- **SQLAlchemy** - ORM with SQLite (local) / Azure SQL (production)
- **LLM Support** - Ollama (local) or Azure OpenAI (production)
- **APScheduler** - Background job scheduling

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - React component library
- **Recharts** - Data visualization

### Testing
- **Playwright** - End-to-end testing with screenshot capture on failure

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- **LLM Provider** (one of the following):
  - Ollama with llama3.2 model (for local development)
  - Azure OpenAI (for production) - any chat completion model

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run the server
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

### LLM Setup

**Option 1: Ollama (Local Development)**
```bash
# Pull the model
ollama pull llama3.2

# Ollama runs automatically on localhost:11434
```

**Option 2: Azure OpenAI (Production)**
```env
# Set in backend/.env
LLM_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=your-deployment-name  # e.g., gpt-4o, gpt-4o-mini, gpt-4
```

### Access the App
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Project Structure

```
copilot-studio-reddit-monitor/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── config.py            # Settings & env vars
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models/              # Database models
│   │   ├── routers/             # API endpoints
│   │   ├── schemas/             # Pydantic models
│   │   └── services/
│   │       ├── reddit_scraper.py  # Reddit scraping logic
│   │       └── llm_analyzer.py    # Sentiment analysis
│   ├── migrations/              # Database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js pages
│   │   ├── components/          # React components
│   │   └── lib/                 # API client & utils
│   ├── e2e/                     # Playwright tests
│   └── package.json
└── docs/
    └── screenshots/             # App screenshots
```

## API Endpoints

### Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List posts (with filtering) |
| `GET` | `/api/posts/{id}` | Get post details |
| `PATCH` | `/api/posts/{id}/status` | Update post status |
| `POST` | `/api/posts/{id}/analyze` | Trigger LLM analysis |

### Scraper
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scrape` | Trigger manual scrape |
| `GET` | `/api/scrape/status` | Get scraper status |

### Contributors
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/contributors` | List contributors |
| `POST` | `/api/contributors` | Add contributor |
| `DELETE` | `/api/contributors/{id}` | Remove contributor |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/overview` | Dashboard stats |
| `GET` | `/api/analytics/sentiment` | Sentiment trends |
| `GET` | `/api/analytics/subreddits` | Subreddit breakdown |
| `GET` | `/api/analytics/status-breakdown` | Status counts |

## Testing

### Run E2E Tests

```bash
cd frontend

# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific test file
npx playwright test e2e/posts.spec.ts
```

Screenshots are automatically captured on test failures.

### Take Documentation Screenshots

```bash
cd frontend
npx tsx scripts/take-screenshots.ts
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDDIT_USER_AGENT` | User agent for Reddit API | `CopilotStudioMonitor/1.0` |
| `LLM_PROVIDER` | LLM provider (`ollama` or `azure`) | `ollama` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model name | `llama3.2` |
| `DATABASE_URL` | Database connection string | `sqlite:///./data/reddit_monitor.db` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint | - |
| `AZURE_OPENAI_KEY` | Azure OpenAI API key | - |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI deployment name | - |

## Azure Deployment

For production deployment to Azure:

- **Backend**: Azure App Service (Python) or Azure Container Apps
- **Frontend**: Azure Static Web Apps
- **Database**: Azure SQL Database
- **LLM**: Azure OpenAI Service
- **Scheduler**: Azure Functions with Timer trigger

## Usage Workflow

1. **Scrape Reddit** - Click "Scrape Now" on dashboard or wait for auto-scrape
2. **Review Posts** - Browse posts list, use filters to find relevant discussions
3. **Check Warnings** - Warning posts appear at top, indicating users who need attention
4. **Analyze Posts** - Click "Analyze" to run LLM sentiment analysis
5. **Track Contributors** - Add Microsoft team members' Reddit handles
6. **Monitor Trends** - Use Analytics to track sentiment over time

## License

MIT
