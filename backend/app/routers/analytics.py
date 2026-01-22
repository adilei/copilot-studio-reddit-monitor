from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Post, Analysis, ContributorReply
from app.schemas import OverviewStats, SentimentTrend

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview", response_model=OverviewStats)
def get_overview_stats(db: Session = Depends(get_db)):
    """Get dashboard overview statistics."""
    # Total posts
    total_posts = db.query(func.count(Post.id)).scalar() or 0

    # Posts today
    today = datetime.utcnow().date()
    posts_today = (
        db.query(func.count(Post.id))
        .filter(func.date(Post.scraped_at) == today)
        .scalar()
        or 0
    )

    # Pending count
    pending_count = (
        db.query(func.count(Post.id)).filter(Post.status == "pending").scalar() or 0
    )

    # Sentiment breakdown (from latest analyses)
    sentiment_counts = (
        db.query(
            Analysis.sentiment,
            func.count(func.distinct(Analysis.post_id)),
        )
        .group_by(Analysis.sentiment)
        .all()
    )

    sentiment_dict = {s: c for s, c in sentiment_counts}
    analyzed_total = sum(sentiment_dict.values()) if sentiment_dict else 0
    negative_count = sentiment_dict.get("negative", 0)
    negative_percentage = (
        (negative_count / analyzed_total * 100) if analyzed_total > 0 else 0
    )

    # Handled percentage
    handled_count = (
        db.query(func.count(Post.id))
        .filter(Post.status == "handled")
        .scalar()
        or 0
    )
    handled_percentage = (handled_count / total_posts * 100) if total_posts > 0 else 0

    # Top subreddit
    top_subreddit_result = (
        db.query(Post.subreddit, func.count(Post.id).label("count"))
        .group_by(Post.subreddit)
        .order_by(func.count(Post.id).desc())
        .first()
    )
    top_subreddit = top_subreddit_result[0] if top_subreddit_result else None

    return OverviewStats(
        total_posts=total_posts,
        posts_today=posts_today,
        negative_percentage=round(negative_percentage, 1),
        handled_percentage=round(handled_percentage, 1),
        pending_count=pending_count,
        top_subreddit=top_subreddit,
    )


@router.get("/sentiment", response_model=list[SentimentTrend])
def get_sentiment_trends(
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db),
):
    """Get sentiment trends over time."""
    start_date = datetime.utcnow() - timedelta(days=days)

    # Get daily sentiment counts
    results = (
        db.query(
            func.date(Analysis.analyzed_at).label("date"),
            func.sum(case((Analysis.sentiment == "positive", 1), else_=0)).label(
                "positive"
            ),
            func.sum(case((Analysis.sentiment == "neutral", 1), else_=0)).label(
                "neutral"
            ),
            func.sum(case((Analysis.sentiment == "negative", 1), else_=0)).label(
                "negative"
            ),
            func.avg(Analysis.sentiment_score).label("average_score"),
        )
        .filter(Analysis.analyzed_at >= start_date)
        .group_by(func.date(Analysis.analyzed_at))
        .order_by(func.date(Analysis.analyzed_at))
        .all()
    )

    return [
        SentimentTrend(
            date=str(r.date),
            positive=r.positive or 0,
            neutral=r.neutral or 0,
            negative=r.negative or 0,
            average_score=round(r.average_score or 0, 2),
        )
        for r in results
    ]


@router.get("/subreddits")
def get_subreddit_stats(db: Session = Depends(get_db)):
    """Get post counts by subreddit."""
    results = (
        db.query(
            Post.subreddit,
            func.count(Post.id).label("count"),
        )
        .group_by(Post.subreddit)
        .order_by(func.count(Post.id).desc())
        .all()
    )

    return [{"subreddit": r.subreddit, "count": r.count} for r in results]


@router.get("/contributors/leaderboard")
def get_contributor_leaderboard(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Get top contributors by reply count."""
    from app.models import Contributor

    results = (
        db.query(
            Contributor.name,
            Contributor.reddit_handle,
            Contributor.role,
            func.count(ContributorReply.id).label("reply_count"),
        )
        .join(ContributorReply)
        .filter(Contributor.active == True)
        .group_by(Contributor.id)
        .order_by(func.count(ContributorReply.id).desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "name": r.name,
            "reddit_handle": r.reddit_handle,
            "role": r.role,
            "reply_count": r.reply_count,
        }
        for r in results
    ]


@router.get("/status-breakdown")
def get_status_breakdown(db: Session = Depends(get_db)):
    """Get post counts by status."""
    results = (
        db.query(
            Post.status,
            func.count(Post.id).label("count"),
        )
        .group_by(Post.status)
        .all()
    )

    return [{"status": r.status, "count": r.count} for r in results]
