from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Literal

from app.database import get_db
from app.models import Post, Analysis
from app.schemas import (
    PostResponse,
    PostDetail,
    PostStatusUpdate,
    AnalysisResponse,
    ContributorReplyResponse,
)
from app.services.llm_analyzer import analyzer

router = APIRouter(prefix="/api/posts", tags=["posts"])


@router.get("", response_model=list[PostResponse])
def list_posts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: str | None = None,
    sentiment: Literal["positive", "neutral", "negative"] | None = None,
    subreddit: str | None = None,
    sort_by: Literal["created_utc", "scraped_at", "score"] = "created_utc",
    sort_order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
):
    """List posts with filtering and pagination."""
    query = db.query(Post)

    # Apply filters
    if status:
        query = query.filter(Post.status == status)
    if subreddit:
        query = query.filter(Post.subreddit == subreddit)

    # Filter by sentiment requires joining with analyses
    if sentiment:
        subquery = (
            db.query(Analysis.post_id)
            .filter(Analysis.sentiment == sentiment)
            .distinct()
            .subquery()
        )
        query = query.filter(Post.id.in_(subquery))

    # Apply sorting
    sort_column = getattr(Post, sort_by)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)

    # Execute with pagination
    posts = query.offset(skip).limit(limit).all()

    # Build response with latest sentiment info
    result = []
    for post in posts:
        post_dict = {
            "id": post.id,
            "subreddit": post.subreddit,
            "title": post.title,
            "body": post.body,
            "author": post.author,
            "url": post.url,
            "score": post.score,
            "num_comments": post.num_comments,
            "created_utc": post.created_utc,
            "scraped_at": post.scraped_at,
            "status": post.status,
            "latest_sentiment": None,
            "latest_sentiment_score": None,
            "has_contributor_reply": len(post.contributor_replies) > 0,
        }

        if post.latest_analysis:
            post_dict["latest_sentiment"] = post.latest_analysis.sentiment
            post_dict["latest_sentiment_score"] = post.latest_analysis.sentiment_score

        result.append(PostResponse(**post_dict))

    return result


@router.get("/{post_id}", response_model=PostDetail)
def get_post(post_id: str, db: Session = Depends(get_db)):
    """Get detailed information about a specific post."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Build contributor replies response
    replies = []
    for reply in post.contributor_replies:
        replies.append(
            ContributorReplyResponse(
                id=reply.id,
                contributor_name=reply.contributor.name,
                contributor_handle=reply.contributor.reddit_handle,
                comment_id=reply.comment_id,
                replied_at=reply.replied_at,
            )
        )

    return PostDetail(
        id=post.id,
        subreddit=post.subreddit,
        title=post.title,
        body=post.body,
        author=post.author,
        url=post.url,
        score=post.score,
        num_comments=post.num_comments,
        created_utc=post.created_utc,
        scraped_at=post.scraped_at,
        status=post.status,
        latest_sentiment=post.latest_analysis.sentiment if post.latest_analysis else None,
        latest_sentiment_score=post.latest_analysis.sentiment_score if post.latest_analysis else None,
        has_contributor_reply=len(post.contributor_replies) > 0,
        analyses=[AnalysisResponse.model_validate(a) for a in post.analyses],
        contributor_replies=replies,
    )


@router.patch("/{post_id}/status", response_model=PostResponse)
def update_post_status(
    post_id: str,
    status_update: PostStatusUpdate,
    db: Session = Depends(get_db),
):
    """Update a post's status."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post.status = status_update.status
    db.commit()
    db.refresh(post)

    return PostResponse(
        id=post.id,
        subreddit=post.subreddit,
        title=post.title,
        body=post.body,
        author=post.author,
        url=post.url,
        score=post.score,
        num_comments=post.num_comments,
        created_utc=post.created_utc,
        scraped_at=post.scraped_at,
        status=post.status,
        latest_sentiment=post.latest_analysis.sentiment if post.latest_analysis else None,
        latest_sentiment_score=post.latest_analysis.sentiment_score if post.latest_analysis else None,
        has_contributor_reply=len(post.contributor_replies) > 0,
    )


@router.get("/{post_id}/analysis", response_model=list[AnalysisResponse])
def get_post_analyses(post_id: str, db: Session = Depends(get_db)):
    """Get all analyses for a post."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    return [AnalysisResponse.model_validate(a) for a in post.analyses]


@router.post("/{post_id}/analyze", response_model=AnalysisResponse)
async def analyze_post(post_id: str, db: Session = Depends(get_db)):
    """Trigger LLM analysis for a specific post."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    analysis = await analyzer.analyze_post(db, post)
    if not analysis:
        raise HTTPException(status_code=500, detail="Analysis failed")

    return AnalysisResponse.model_validate(analysis)
