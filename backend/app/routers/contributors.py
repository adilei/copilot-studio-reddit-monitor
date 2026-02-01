from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Contributor, ContributorReply, Post
from app.schemas import ContributorCreate, ContributorResponse, ReaderCreate
from app.auth import get_current_user, require_contributor_write

router = APIRouter(
    prefix="/api/contributors",
    tags=["contributors"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[ContributorResponse])
def list_contributors(
    include_inactive: bool = False,
    include_readers: bool = False,
    db: Session = Depends(get_db),
):
    """List all contributors. By default, excludes readers (users with no reddit_handle)."""
    query = db.query(Contributor)
    if not include_inactive:
        query = query.filter(Contributor.active == True)
    if not include_readers:
        # Only return users with reddit_handle (contributors, not readers)
        query = query.filter(Contributor.reddit_handle != None)

    contributors = query.all()

    # Get reply counts
    reply_counts = dict(
        db.query(ContributorReply.contributor_id, func.count(ContributorReply.id))
        .group_by(ContributorReply.contributor_id)
        .all()
    )

    result = []
    for contrib in contributors:
        result.append(
            ContributorResponse(
                id=contrib.id,
                name=contrib.name,
                reddit_handle=contrib.reddit_handle,
                microsoft_alias=contrib.microsoft_alias,
                role=contrib.role,
                active=contrib.active,
                created_at=contrib.created_at,
                reply_count=reply_counts.get(contrib.id, 0),
                user_type=contrib.user_type,
            )
        )

    return result


@router.post("", response_model=ContributorResponse)
def create_contributor(
    contributor: ContributorCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Add a new contributor. Requires contributor access."""
    # Check for existing handle
    existing = (
        db.query(Contributor)
        .filter(Contributor.reddit_handle == contributor.reddit_handle)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Contributor with this handle already exists"
        )

    # Check for existing alias if provided
    if contributor.microsoft_alias:
        existing_alias = (
            db.query(Contributor)
            .filter(Contributor.microsoft_alias == contributor.microsoft_alias)
            .first()
        )
        if existing_alias:
            raise HTTPException(
                status_code=400, detail="User with this Microsoft alias already exists"
            )

    db_contributor = Contributor(
        name=contributor.name,
        reddit_handle=contributor.reddit_handle,
        microsoft_alias=contributor.microsoft_alias,
        role=contributor.role,
    )
    db.add(db_contributor)
    db.commit()
    db.refresh(db_contributor)

    return ContributorResponse(
        id=db_contributor.id,
        name=db_contributor.name,
        reddit_handle=db_contributor.reddit_handle,
        microsoft_alias=db_contributor.microsoft_alias,
        role=db_contributor.role,
        active=db_contributor.active,
        created_at=db_contributor.created_at,
        reply_count=0,
        user_type=db_contributor.user_type,
    )


@router.post("/readers", response_model=ContributorResponse)
def create_reader(
    reader: ReaderCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Add a new reader (view-only user). Requires contributor access."""
    # Check for existing alias
    existing = (
        db.query(Contributor)
        .filter(Contributor.microsoft_alias == reader.microsoft_alias)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="User with this Microsoft alias already exists"
        )

    db_reader = Contributor(
        name=reader.name,
        reddit_handle=None,  # Readers have no reddit handle
        microsoft_alias=reader.microsoft_alias,
        role=reader.role,
    )
    db.add(db_reader)
    db.commit()
    db.refresh(db_reader)

    return ContributorResponse(
        id=db_reader.id,
        name=db_reader.name,
        reddit_handle=db_reader.reddit_handle,
        microsoft_alias=db_reader.microsoft_alias,
        role=db_reader.role,
        active=db_reader.active,
        created_at=db_reader.created_at,
        reply_count=0,
        user_type=db_reader.user_type,
    )


@router.get("/{contributor_id}", response_model=ContributorResponse)
def get_contributor(contributor_id: int, db: Session = Depends(get_db)):
    """Get a specific contributor or reader."""
    contributor = db.query(Contributor).filter(Contributor.id == contributor_id).first()
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    reply_count = (
        db.query(func.count(ContributorReply.id))
        .filter(ContributorReply.contributor_id == contributor_id)
        .scalar()
    )

    return ContributorResponse(
        id=contributor.id,
        name=contributor.name,
        reddit_handle=contributor.reddit_handle,
        microsoft_alias=contributor.microsoft_alias,
        role=contributor.role,
        active=contributor.active,
        created_at=contributor.created_at,
        reply_count=reply_count,
        user_type=contributor.user_type,
    )


@router.patch("/{contributor_id}", response_model=ContributorResponse)
def update_contributor(
    contributor_id: int,
    updates: ContributorCreate,
    db: Session = Depends(get_db),
    current_contributor: Contributor | None = Depends(require_contributor_write),
):
    """Update a contributor. Requires contributor access."""
    contributor = db.query(Contributor).filter(Contributor.id == contributor_id).first()
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    # Prevent contributors from demoting themselves to reader
    # (This would lock them out of write operations)
    if current_contributor and current_contributor.id == contributor_id:
        if contributor.reddit_handle and not updates.reddit_handle:
            raise HTTPException(
                status_code=400,
                detail="You cannot remove your own reddit handle. This would convert you to a reader and lock you out."
            )

    # Check for duplicate reddit_handle if being changed
    if updates.reddit_handle and updates.reddit_handle != contributor.reddit_handle:
        existing = (
            db.query(Contributor)
            .filter(Contributor.reddit_handle == updates.reddit_handle)
            .filter(Contributor.id != contributor_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=400, detail="Another user with this reddit handle already exists"
            )

    # Check for duplicate microsoft_alias if being changed
    if updates.microsoft_alias and updates.microsoft_alias != contributor.microsoft_alias:
        existing = (
            db.query(Contributor)
            .filter(Contributor.microsoft_alias == updates.microsoft_alias)
            .filter(Contributor.id != contributor_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=400, detail="Another user with this Microsoft alias already exists"
            )

    contributor.name = updates.name
    contributor.reddit_handle = updates.reddit_handle
    contributor.role = updates.role
    contributor.microsoft_alias = updates.microsoft_alias
    db.commit()
    db.refresh(contributor)

    reply_count = (
        db.query(func.count(ContributorReply.id))
        .filter(ContributorReply.contributor_id == contributor_id)
        .scalar()
    )

    return ContributorResponse(
        id=contributor.id,
        name=contributor.name,
        reddit_handle=contributor.reddit_handle,
        microsoft_alias=contributor.microsoft_alias,
        role=contributor.role,
        active=contributor.active,
        created_at=contributor.created_at,
        reply_count=reply_count,
        user_type=contributor.user_type,
    )


@router.delete("/{contributor_id}")
def delete_contributor(
    contributor_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Deactivate a contributor or reader (soft delete). Requires contributor access."""
    contributor = db.query(Contributor).filter(Contributor.id == contributor_id).first()
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    contributor.active = False
    db.commit()

    return {"message": "User deactivated"}


@router.post("/{contributor_id}/activate")
def activate_contributor(
    contributor_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Reactivate a deactivated contributor or reader. Requires contributor access."""
    contributor = db.query(Contributor).filter(Contributor.id == contributor_id).first()
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    contributor.active = True
    db.commit()

    return {"message": "User activated"}


@router.get("/{contributor_id}/activity")
def get_contributor_activity(
    contributor_id: int,
    days: int = Query(90, ge=7, le=365),
    db: Session = Depends(get_db),
):
    """Get contributor reply activity over time."""
    contributor = db.query(Contributor).filter(Contributor.id == contributor_id).first()
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    start_date = datetime.utcnow() - timedelta(days=days)

    # Get daily reply counts
    daily_counts = (
        db.query(
            func.date(ContributorReply.replied_at).label("date"),
            func.count(ContributorReply.id).label("count"),
        )
        .filter(ContributorReply.contributor_id == contributor_id)
        .filter(ContributorReply.replied_at >= start_date)
        .group_by(func.date(ContributorReply.replied_at))
        .order_by(func.date(ContributorReply.replied_at))
        .all()
    )

    # Get summary stats
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    replies_today = (
        db.query(func.count(ContributorReply.id))
        .filter(ContributorReply.contributor_id == contributor_id)
        .filter(ContributorReply.replied_at >= day_ago)
        .scalar() or 0
    )
    replies_week = (
        db.query(func.count(ContributorReply.id))
        .filter(ContributorReply.contributor_id == contributor_id)
        .filter(ContributorReply.replied_at >= week_ago)
        .scalar() or 0
    )
    replies_month = (
        db.query(func.count(ContributorReply.id))
        .filter(ContributorReply.contributor_id == contributor_id)
        .filter(ContributorReply.replied_at >= month_ago)
        .scalar() or 0
    )
    replies_total = (
        db.query(func.count(ContributorReply.id))
        .filter(ContributorReply.contributor_id == contributor_id)
        .scalar() or 0
    )

    # Get recent posts they replied to
    recent_replies = (
        db.query(ContributorReply, Post)
        .join(Post, ContributorReply.post_id == Post.id)
        .filter(ContributorReply.contributor_id == contributor_id)
        .order_by(ContributorReply.replied_at.desc())
        .limit(10)
        .all()
    )

    recent_posts = [
        {
            "post_id": post.id,
            "title": post.title,
            "replied_at": reply.replied_at.isoformat(),
        }
        for reply, post in recent_replies
    ]

    return {
        "contributor": {
            "id": contributor.id,
            "name": contributor.name,
            "reddit_handle": contributor.reddit_handle,
        },
        "activity": [
            {"date": str(row.date), "count": row.count}
            for row in daily_counts
        ],
        "summary": {
            "replies_today": replies_today,
            "replies_week": replies_week,
            "replies_month": replies_month,
            "replies_total": replies_total,
        },
        "recent_posts": recent_posts,
    }
