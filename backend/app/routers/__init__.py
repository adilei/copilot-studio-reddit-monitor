from app.routers.posts import router as posts_router
from app.routers.contributors import router as contributors_router
from app.routers.analytics import router as analytics_router
from app.routers.scraper import router as scraper_router
from app.routers.sync import router as sync_router
from app.routers.product_areas import router as product_areas_router
from app.routers.clustering import router as clustering_router

__all__ = [
    "posts_router",
    "contributors_router",
    "analytics_router",
    "scraper_router",
    "sync_router",
    "product_areas_router",
    "clustering_router",
]
