from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
import asyncio
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

        # Add analysis job - runs every 5 minutes to analyze pending posts
        self.scheduler.add_job(
            self._run_analysis_job,
            trigger=IntervalTrigger(minutes=5),
            id="analyze_pending",
            name="Analyze Pending Posts",
            replace_existing=True,
        )

        # Add notification job - runs every 5 minutes to generate notifications
        self.scheduler.add_job(
            self._run_notification_job,
            trigger=IntervalTrigger(minutes=5),
            id="generate_notifications",
            name="Generate Notifications",
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
        """Execute the scraping job, then run incremental clustering."""
        logger.info("Running scheduled scrape job")

        db = SessionLocal()
        try:
            posts_count = scraper.scrape(db, time_range="day")
            logger.info(f"Scheduled scrape completed: {posts_count} new posts")
        except Exception as e:
            logger.error(f"Scheduled scrape failed: {str(e)}")
        finally:
            db.close()

        # Run incremental clustering to assign new posts to themes
        self._run_clustering_job()

    def _run_analysis_job(self):
        """Analyze posts without analyses in batches."""
        from app.services.llm_analyzer import analyzer
        from app.models import Post, Analysis

        db = SessionLocal()
        try:
            # Get posts without any analysis
            posts_with_analyses = db.query(Analysis.post_id).distinct().subquery()
            pending = db.query(Post).filter(
                ~Post.id.in_(posts_with_analyses)
            ).order_by(Post.created_utc.desc()).limit(10).all()

            if not pending:
                return

            logger.info(f"Analyzing {len(pending)} posts without analysis")
            for post in pending:
                try:
                    asyncio.run(analyzer.analyze_post(db, post))
                except Exception as e:
                    logger.error(f"Failed to analyze {post.id}: {e}")

        except Exception as e:
            logger.error(f"Analysis job failed: {str(e)}")
        finally:
            db.close()

    def _run_notification_job(self):
        """Generate notifications for users based on their preferences."""
        from app.services.notification_service import generate_notifications
        db = SessionLocal()
        try:
            count = generate_notifications(db)
            if count > 0:
                logger.info(f"Notification job: created {count} notifications")
        except Exception as e:
            logger.error(f"Notification job failed: {str(e)}")
        finally:
            db.close()

    def _run_clustering_job(self):
        """Run incremental clustering to assign new posts to themes."""
        from app.services.clustering_service import clustering_service
        from app.models import ClusteringRun

        db = SessionLocal()
        try:
            # Create clustering run record
            clustering_run = ClusteringRun(
                run_type="incremental",
                status="running",
            )
            db.add(clustering_run)
            db.commit()
            db.refresh(clustering_run)

            # Run clustering
            asyncio.run(clustering_service.run_clustering(clustering_run.id, "incremental"))
            logger.info("Scheduled incremental clustering completed")

        except Exception as e:
            logger.error(f"Scheduled clustering failed: {str(e)}")
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
