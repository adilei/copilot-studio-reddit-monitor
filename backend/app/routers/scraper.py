from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
import asyncio

from app.database import get_db, SessionLocal
from app.schemas import ScrapeRequest, ScrapeStatus
from app.services.reddit_scraper import scraper
from app.models import Post, Analysis

router = APIRouter(prefix="/api/scrape", tags=["scraper"])


def run_scrape(
    time_range: str,
    subreddits: list[str] | None,
    queries: list[str] | None,
):
    """Background task to run the scraper."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        scraper.scrape(
            db=db,
            time_range=time_range,
            subreddits=subreddits,
            queries=queries,
        )
    finally:
        db.close()


@router.post("", response_model=ScrapeStatus)
def trigger_scrape(
    request: ScrapeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger a manual scrape operation."""
    if scraper.is_running:
        return ScrapeStatus(
            is_running=True,
            last_run=scraper.last_run,
            posts_scraped=scraper.posts_scraped,
            errors=["Scraper is already running"],
        )

    # Run in background
    background_tasks.add_task(
        run_scrape,
        time_range=request.time_range,
        subreddits=request.subreddits,
        queries=request.queries,
    )

    return ScrapeStatus(
        is_running=True,
        last_run=scraper.last_run,
        posts_scraped=0,
        errors=[],
    )


@router.get("/status", response_model=ScrapeStatus)
def get_scrape_status():
    """Get the current scraper status."""
    status = scraper.get_status()
    return ScrapeStatus(
        is_running=status["is_running"],
        last_run=status["last_run"],
        posts_scraped=status["posts_scraped"],
        errors=status["errors"],
        last_synced_at=status["last_synced_at"],
        last_sync_source_scraped_at=status["last_sync_source_scraped_at"],
        last_sync_posts=status["last_sync_posts"],
    )


def run_analyze_all(reanalyze: bool = False):
    """Background task to analyze posts."""
    from app.services.llm_analyzer import analyzer

    db = SessionLocal()
    try:
        if reanalyze:
            # Re-analyze all posts regardless of status
            posts = db.query(Post).all()
        else:
            # Get posts without any analysis
            posts_with_analyses = db.query(Analysis.post_id).distinct().subquery()
            posts = db.query(Post).filter(
                ~Post.id.in_(posts_with_analyses)
            ).all()

        print(f"Analyzing {len(posts)} posts (reanalyze={reanalyze})")

        for post in posts:
            try:
                asyncio.run(analyzer.analyze_post(db, post))
            except Exception as e:
                print(f"Failed to analyze {post.id}: {e}")
    finally:
        db.close()


@router.post("/analyze-all")
def trigger_analyze_all(
    background_tasks: BackgroundTasks,
    reanalyze: bool = False,
):
    """Analyze posts. Set reanalyze=true to re-run analysis on all posts."""
    background_tasks.add_task(run_analyze_all, reanalyze=reanalyze)
    if reanalyze:
        return {"message": "Re-analysis started for ALL posts"}
    return {"message": "Analysis started for unanalyzed posts"}
