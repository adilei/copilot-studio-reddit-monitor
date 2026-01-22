# Copilot Studio Reddit Monitor

Monitor Reddit for Copilot Studio discussions, analyze sentiment using LLMs, and track Microsoft contributor engagement.

## Features

- **Reddit Scraping**: Automatically scrape relevant subreddits for Copilot Studio discussions
- **Sentiment Analysis**: Analyze posts using Ollama (local) or Azure OpenAI
- **Contributor Tracking**: Track Microsoft team member responses
- **Dashboard**: Real-time overview of posts, sentiment, and engagement
- **Analytics**: Visualize sentiment trends and contributor activity

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Reddit API credentials ([create app](https://www.reddit.com/prefs/apps))
- Ollama (optional, for local LLM analysis)

### Setup

1. **Clone and configure**:
   ```bash
   cd ~/projects/copilot-studio-reddit-monitor

   # Backend setup
   cd backend
   cp .env.example .env
   # Edit .env with your Reddit API credentials
   ```

2. **Install dependencies**:
   ```bash
   # Backend
   cd backend
   python -m venv venv
   source venv/bin/activate  # or `venv\Scripts\activate` on Windows
   pip install -r requirements.txt

   # Frontend
   cd ../frontend
   npm install
   ```

3. **Start the services**:
   ```bash
   # Terminal 1: Backend
   cd backend
   uvicorn app.main:app --reload

   # Terminal 2: Frontend
   cd frontend
   npm run dev

   # Terminal 3: Ollama (optional)
   ollama run llama3.2
   ```

4. **Access the app**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Docker Setup

```bash
# Copy and configure environment
cp backend/.env.example .env

# Start all services
docker-compose up -d
```

## Configuration

Environment variables (set in `backend/.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `REDDIT_CLIENT_ID` | Reddit app client ID | Required |
| `REDDIT_CLIENT_SECRET` | Reddit app secret | Required |
| `REDDIT_USER_AGENT` | User agent for Reddit API | `CopilotStudioMonitor/1.0` |
| `LLM_PROVIDER` | LLM provider (`ollama` or `azure`) | `ollama` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model name | `llama3.2` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint | - |
| `AZURE_OPENAI_KEY` | Azure OpenAI API key | - |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI deployment name | `gpt-4o` |
| `SCRAPE_INTERVAL_HOURS` | Auto-scrape interval | `1` |
| `TARGET_SUBREDDITS` | Subreddits to monitor | `MicrosoftCopilot,PowerPlatform,mspowerplatform` |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scrape` | Trigger manual scrape |
| `GET` | `/api/scrape/status` | Get scraper status |
| `GET` | `/api/posts` | List posts (filterable) |
| `GET` | `/api/posts/{id}` | Get post details |
| `PATCH` | `/api/posts/{id}/status` | Update post status |
| `POST` | `/api/posts/{id}/analyze` | Analyze post sentiment |
| `GET` | `/api/contributors` | List contributors |
| `POST` | `/api/contributors` | Add contributor |
| `GET` | `/api/analytics/overview` | Dashboard stats |
| `GET` | `/api/analytics/sentiment` | Sentiment trends |

## Project Structure

```
copilot-studio-reddit-monitor/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point
│   │   ├── config.py         # Settings
│   │   ├── database.py       # SQLite setup
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Business logic
│   │   └── routers/          # API routes
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js pages
│   │   ├── components/       # React components
│   │   └── lib/              # Utilities & API client
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Usage

1. **Scrape Reddit**: Click "Scrape Now" on the dashboard or wait for auto-scrape
2. **Analyze Posts**: Click "Analyze" on any post to get AI sentiment analysis
3. **Add Contributors**: Add Microsoft team members' Reddit handles to track responses
4. **Monitor Analytics**: View sentiment trends and engagement metrics

## Azure Deployment

For production deployment to Azure:

- **Backend**: Azure App Service or Container Apps
- **Frontend**: Azure Static Web Apps
- **Database**: Azure SQL Database
- **LLM**: Azure OpenAI Service
- **Scheduler**: Azure Functions with Timer trigger
