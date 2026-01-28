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
)
from app.services.scheduler import scheduler_service

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
app.include_router(posts_router)
app.include_router(contributors_router)
app.include_router(analytics_router)
app.include_router(scraper_router)
app.include_router(sync_router)
app.include_router(product_areas_router)
app.include_router(clustering_router)


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
