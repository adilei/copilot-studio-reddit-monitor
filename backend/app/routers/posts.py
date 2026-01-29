from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Literal
from datetime import datetime

from app.database import get_db
from app.models import Post, Analysis, Contributor
from app.schemas import (
    PostResponse,
    PostDetail,
    PostCheckoutRequest,
    PostReleaseRequest,
    AnalysisResponse,
    ContributorReplyResponse,
)
from app.services.llm_analyzer import analyzer
from app.auth import get_current_user

router = APIRouter(
    prefix="/api/posts",
    tags=["posts"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[PostResponse])
def list_posts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    analyzed: bool | None = None,
    sentiment: Literal["positive", "neutral", "negative"] | None = None,
    search: str | None = None,
    sort_by: Literal["created_utc", "scraped_at", "score"] = "created_utc",
    sort_order: Literal["asc", "desc"] = "desc",
    checked_out_by: int | None = None,
    available_only: bool = False,
    has_reply: bool | None = None,
    db: Session = Depends(get_db),
):
    """List posts with filtering and pagination."""
    query = db.query(Post)

    # Apply filters
    if analyzed is not None:
        # Filter by whether post has any analyses
        if analyzed:
            posts_with_analyses = db.query(Analysis.post_id).distinct().subquery()
            query = query.filter(Post.id.in_(posts_with_analyses))
        else:
            posts_with_analyses = db.query(Analysis.post_id).distinct().subquery()
            query = query.filter(~Post.id.in_(posts_with_analyses))
    if has_reply is not None:
        # Import here to avoid circular imports
        from app.models import ContributorReply
        if has_reply:
            posts_with_replies = db.query(ContributorReply.post_id).distinct().subquery()
            query = query.filter(Post.id.in_(posts_with_replies))
        else:
            posts_with_replies = db.query(ContributorReply.post_id).distinct().subquery()
            query = query.filter(~Post.id.in_(posts_with_replies))
    if checked_out_by:
        query = query.filter(Post.checked_out_by == checked_out_by)
    if available_only:
        query = query.filter(Post.checked_out_by == None)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Post.title.ilike(search_term)) | (Post.body.ilike(search_term))
        )

    # Filter by sentiment - use latest analysis only
    if sentiment:
        # Subquery to get the latest analysis ID for each post
        latest_analysis = (
            db.query(
                Analysis.post_id,
                func.max(Analysis.id).label("max_id")
            )
            .group_by(Analysis.post_id)
            .subquery()
        )
        # Get post IDs where latest analysis matches the sentiment
        matching_posts = (
            db.query(Analysis.post_id)
            .join(latest_analysis, Analysis.id == latest_analysis.c.max_id)
            .filter(Analysis.sentiment == sentiment)
            .subquery()
        )
        query = query.filter(Post.id.in_(matching_posts))

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
            "is_analyzed": post.is_analyzed,
            "latest_sentiment": None,
            "latest_sentiment_score": None,
            "is_warning": False,
            "has_contributor_reply": len(post.contributor_replies) > 0,
            "checked_out_by": post.checked_out_by,
            "checked_out_by_name": post.checked_out_contributor.name if post.checked_out_contributor else None,
            "checked_out_at": post.checked_out_at,
        }

        if post.latest_analysis:
            post_dict["latest_sentiment"] = post.latest_analysis.sentiment
            post_dict["latest_sentiment_score"] = post.latest_analysis.sentiment_score
            post_dict["is_warning"] = post.latest_analysis.is_warning or False

        result.append(PostResponse(**post_dict))

    # Sort warnings to the top
    result.sort(key=lambda p: (not p.is_warning,))

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
        is_analyzed=post.is_analyzed,
        latest_sentiment=post.latest_analysis.sentiment if post.latest_analysis else None,
        latest_sentiment_score=post.latest_analysis.sentiment_score if post.latest_analysis else None,
        is_warning=post.latest_analysis.is_warning if post.latest_analysis else False,
        has_contributor_reply=len(post.contributor_replies) > 0,
        checked_out_by=post.checked_out_by,
        checked_out_by_name=post.checked_out_contributor.name if post.checked_out_contributor else None,
        checked_out_at=post.checked_out_at,
        analyses=[AnalysisResponse.model_validate(a) for a in post.analyses],
        contributor_replies=replies,
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


@router.post("/{post_id}/checkout", response_model=PostResponse)
def checkout_post(
    post_id: str,
    checkout_request: PostCheckoutRequest,
    db: Session = Depends(get_db),
):
    """Checkout a post for handling."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Check if contributor exists
    contributor = db.query(Contributor).filter(Contributor.id == checkout_request.contributor_id).first()
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    # Check if already checked out by someone else
    if post.checked_out_by and post.checked_out_by != checkout_request.contributor_id:
        raise HTTPException(
            status_code=409,
            detail=f"Post already checked out by {post.checked_out_contributor.name}"
        )

    # Checkout the post
    post.checked_out_by = checkout_request.contributor_id
    post.checked_out_at = datetime.utcnow()
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
        is_analyzed=post.is_analyzed,
        latest_sentiment=post.latest_analysis.sentiment if post.latest_analysis else None,
        latest_sentiment_score=post.latest_analysis.sentiment_score if post.latest_analysis else None,
        is_warning=post.latest_analysis.is_warning if post.latest_analysis else False,
        has_contributor_reply=len(post.contributor_replies) > 0,
        checked_out_by=post.checked_out_by,
        checked_out_by_name=post.checked_out_contributor.name if post.checked_out_contributor else None,
        checked_out_at=post.checked_out_at,
    )


@router.post("/{post_id}/release", response_model=PostResponse)
def release_post(
    post_id: str,
    release_request: PostReleaseRequest,
    db: Session = Depends(get_db),
):
    """Release a checked out post."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Check if the post is checked out
    if not post.checked_out_by:
        raise HTTPException(status_code=400, detail="Post is not checked out")

    # Only the contributor who checked it out can release it
    if post.checked_out_by != release_request.contributor_id:
        raise HTTPException(
            status_code=403,
            detail="Only the contributor who checked out the post can release it"
        )

    # Release the post
    post.checked_out_by = None
    post.checked_out_at = None
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
        is_analyzed=post.is_analyzed,
        latest_sentiment=post.latest_analysis.sentiment if post.latest_analysis else None,
        latest_sentiment_score=post.latest_analysis.sentiment_score if post.latest_analysis else None,
        is_warning=post.latest_analysis.is_warning if post.latest_analysis else False,
        has_contributor_reply=len(post.contributor_replies) > 0,
        checked_out_by=post.checked_out_by,
        checked_out_by_name=None,
        checked_out_at=post.checked_out_at,
    )
