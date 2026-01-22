from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
import logging

from app.config import get_settings
from app.database import SessionLocal
from app.services.reddit_scraper import scraper

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self):
        self.settings = get_settings()
        self.scheduler = BackgroundScheduler()
        self._is_started = False

    def start(self):
        """Start the scheduler with configured jobs."""
        if self._is_started:
            logger.warning("Scheduler already started")
            return

        # Add scraping job
        self.scheduler.add_job(
            self._run_scrape_job,
            trigger=IntervalTrigger(hours=self.settings.scrape_interval_hours),
            id="reddit_scrape",
            name="Reddit Scrape Job",
            replace_existing=True,
        )

        self.scheduler.start()
        self._is_started = True
        logger.info(
            f"Scheduler started with scrape interval: {self.settings.scrape_interval_hours}h"
        )

    def stop(self):
        """Stop the scheduler."""
        if self._is_started:
            self.scheduler.shutdown()
            self._is_started = False
            logger.info("Scheduler stopped")

    def _run_scrape_job(self):
        """Execute the scraping job."""
        logger.info("Running scheduled scrape job")

        db = SessionLocal()
        try:
            posts_count = scraper.scrape(db, time_range="day")
            logger.info(f"Scheduled scrape completed: {posts_count} new posts")
        except Exception as e:
            logger.error(f"Scheduled scrape failed: {str(e)}")
        finally:
            db.close()

    def trigger_scrape(self):
        """Manually trigger a scrape job."""
        self.scheduler.add_job(
            self._run_scrape_job,
            id="manual_scrape",
            name="Manual Scrape",
            replace_existing=True,
        )

    @property
    def is_running(self) -> bool:
        return self._is_started


# Global scheduler instance
scheduler_service = SchedulerService()
