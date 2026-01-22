from app.routers.posts import router as posts_router
from app.routers.contributors import router as contributors_router
from app.routers.analytics import router as analytics_router
from app.routers.scraper import router as scraper_router

__all__ = ["posts_router", "contributors_router", "analytics_router", "scraper_router"]
