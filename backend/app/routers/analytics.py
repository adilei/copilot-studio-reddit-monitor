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

    # Posts scraped in last 24 hours
    last_24h = datetime.utcnow() - timedelta(hours=24)
    posts_last_24h = (
        db.query(func.count(Post.id))
        .filter(Post.scraped_at >= last_24h)
        .scalar()
        or 0
    )

    # Analyzed count (posts with at least one analysis)
    posts_with_analyses = db.query(Analysis.post_id).distinct().subquery()
    analyzed_count = (
        db.query(func.count(Post.id))
        .filter(Post.id.in_(posts_with_analyses))
        .scalar()
        or 0
    )
    not_analyzed_count = total_posts - analyzed_count

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

    # Has reply count (posts with at least one contributor reply)
    posts_with_replies = db.query(ContributorReply.post_id).distinct().subquery()
    has_reply_count = (
        db.query(func.count(Post.id))
        .filter(Post.id.in_(posts_with_replies))
        .scalar()
        or 0
    )

    # Top subreddit
    top_subreddit_result = (
        db.query(Post.subreddit, func.count(Post.id).label("count"))
        .group_by(Post.subreddit)
        .order_by(func.count(Post.id).desc())
        .first()
    )
    top_subreddit = top_subreddit_result[0] if top_subreddit_result else None

    # Warning count - posts where latest analysis has is_warning=True
    # Get latest analysis for each post and count those with is_warning
    latest_analysis = (
        db.query(
            Analysis.post_id,
            func.max(Analysis.id).label("max_id")
        )
        .group_by(Analysis.post_id)
        .subquery()
    )
    warning_count = (
        db.query(func.count(func.distinct(Analysis.post_id)))
        .join(latest_analysis, Analysis.id == latest_analysis.c.max_id)
        .filter(Analysis.is_warning == True)
        .scalar()
        or 0
    )

    return OverviewStats(
        total_posts=total_posts,
        posts_last_24h=posts_last_24h,
        negative_percentage=round(negative_percentage, 1),
        analyzed_count=analyzed_count,
        not_analyzed_count=not_analyzed_count,
        has_reply_count=has_reply_count,
        warning_count=warning_count,
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
    """Get post counts by analysis and reply status."""
    total_posts = db.query(func.count(Post.id)).scalar() or 0

    # Posts with analyses
    posts_with_analyses = db.query(Analysis.post_id).distinct().subquery()
    analyzed_count = (
        db.query(func.count(Post.id))
        .filter(Post.id.in_(posts_with_analyses))
        .scalar()
        or 0
    )

    # Posts with replies
    posts_with_replies = db.query(ContributorReply.post_id).distinct().subquery()
    has_reply_count = (
        db.query(func.count(Post.id))
        .filter(Post.id.in_(posts_with_replies))
        .scalar()
        or 0
    )

    return [
        {"status": "analyzed", "count": analyzed_count},
        {"status": "not_analyzed", "count": total_posts - analyzed_count},
        {"status": "has_reply", "count": has_reply_count},
        {"status": "no_reply", "count": total_posts - has_reply_count},
    ]


@router.get("/warnings")
def get_warnings(
    limit: int = Query(10, ge=1, le=50),
    without_reply: bool = Query(False, description="Only show posts without MS reply"),
    db: Session = Depends(get_db),
):
    """Get posts with warning flag (is_warning=True)."""
    # Subquery to get the latest analysis ID for each post
    latest_analysis = (
        db.query(
            Analysis.post_id,
            func.max(Analysis.id).label("max_id")
        )
        .group_by(Analysis.post_id)
        .subquery()
    )

    # Get posts where latest analysis has is_warning=True
    warning_post_ids = (
        db.query(Analysis.post_id)
        .join(latest_analysis, Analysis.id == latest_analysis.c.max_id)
        .filter(Analysis.is_warning == True)
        .subquery()
    )

    query = db.query(Post).filter(Post.id.in_(warning_post_ids))

    # Optionally filter to posts without replies
    if without_reply:
        posts_with_replies = db.query(ContributorReply.post_id).distinct().subquery()
        query = query.filter(~Post.id.in_(posts_with_replies))

    posts = query.order_by(Post.created_utc.desc()).limit(limit).all()

    # Build response with summary info for the tile
    result = []
    for post in posts:
        latest = post.latest_analysis
        result.append({
            "id": post.id,
            "title": post.title,
            "author": post.author,
            "created_utc": post.created_utc,
            "is_analyzed": post.is_analyzed,
            "has_contributor_reply": len(post.contributor_replies) > 0,
            "sentiment": latest.sentiment if latest else None,
            "summary": latest.summary if latest else None,
        })

    return result
