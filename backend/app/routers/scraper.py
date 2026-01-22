from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
import asyncio

from app.database import get_db, SessionLocal
from app.schemas import ScrapeRequest, ScrapeStatus
from app.services.reddit_scraper import scraper
from app.models import Post
from app.models.post import PostStatus

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
    )


def run_analyze_all():
    """Background task to analyze all pending posts."""
    from app.services.llm_analyzer import analyzer

    db = SessionLocal()
    try:
        pending = db.query(Post).filter(
            Post.status == PostStatus.PENDING.value
        ).all()

        for post in pending:
            try:
                asyncio.run(analyzer.analyze_post(db, post))
            except Exception as e:
                print(f"Failed to analyze {post.id}: {e}")
    finally:
        db.close()


@router.post("/analyze-all")
def trigger_analyze_all(background_tasks: BackgroundTasks):
    """Analyze all pending posts."""
    background_tasks.add_task(run_analyze_all)
    return {"message": "Analysis started for all pending posts"}
