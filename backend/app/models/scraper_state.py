from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime

from app.database import Base


class ScraperState(Base):
    """Persists scraper status across restarts. Single row, id=1."""
    __tablename__ = "scraper_state"

    id = Column(Integer, primary_key=True, default=1)
    last_run = Column(DateTime)
    posts_scraped = Column(Integer, default=0)
    last_synced_at = Column(DateTime)
    last_sync_source_scraped_at = Column(DateTime)
    last_sync_posts = Column(Integer, default=0)
