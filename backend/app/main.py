from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.database import init_db
from app.routers import (
    posts_router,
    contributors_router,
    analytics_router,
    scraper_router,
    sync_router,
    product_areas_router,
    clustering_router,
    auth_router,
    notifications_router,
)
from app.services.scheduler import scheduler_service
from app.services.reddit_scraper import scraper

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting Copilot Studio Reddit Monitor...")
    init_db()
    # Load persisted scraper state from DB
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        scraper.load_state(db)
    finally:
        db.close()
    scheduler_service.start()
    logger.info("Application started successfully")

    yield

    # Shutdown
    logger.info("Shutting down...")
    scheduler_service.stop()


app = FastAPI(
    title="Copilot Studio Reddit Monitor",
    description="Monitor Reddit for Copilot Studio discussions and analyze sentiment",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
# Allow configuration via environment variable for Azure deployment
allowed_origins_str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002"
)
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(posts_router)
app.include_router(contributors_router)
app.include_router(analytics_router)
app.include_router(scraper_router)
app.include_router(sync_router)
app.include_router(product_areas_router)
app.include_router(clustering_router)
app.include_router(notifications_router)


@app.get("/")
def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Copilot Studio Reddit Monitor",
        "version": "1.0.0",
    }


@app.get("/api/health")
def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "scheduler_running": scheduler_service.is_running,
    }


@app.get("/api/config")
def get_config():
    """Get public configuration (no auth required)."""
    from app.config import get_settings
    settings = get_settings()
    return {
        "auth_enabled": settings.auth_enabled,
    }


@app.get("/api/scheduler/status")
def get_scheduler_status():
    """Get scheduled job status including next run times."""
    from app.config import get_settings
    settings = get_settings()

    jobs = []
    if scheduler_service.is_running:
        for job in scheduler_service.scheduler.get_jobs():
            interval_seconds = None
            if hasattr(job.trigger, "interval"):
                interval_seconds = int(job.trigger.interval.total_seconds())
            jobs.append({
                "id": job.id,
                "name": job.name,
                "interval_seconds": interval_seconds,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            })

    return {
        "scheduler_running": scheduler_service.is_running,
        "scrape_source": settings.scrape_source,
        "jobs": jobs,
    }
