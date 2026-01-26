from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Post, Contributor, ContributorReply
from app.schemas import SyncRequest, SyncResponse
from app.services.reddit_scraper import scraper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
def sync_data(request: SyncRequest, db: Session = Depends(get_db)):
    """
    Sync posts, contributors, and contributor replies from a remote source.

    Modes:
    - sync: Add new records, update existing by ID (default)
    - override: Delete all existing posts/replies, then insert new data

    Process order: contributors -> posts -> contributor replies
    """
    errors: list[str] = []
    posts_created = 0
    posts_updated = 0
    posts_deleted = 0
    contributors_created = 0
    contributors_updated = 0
    replies_created = 0

    try:
        # In override mode, delete existing data first
        if request.mode == "override":
            # Delete in reverse order due to foreign key constraints
            deleted_replies = db.query(ContributorReply).delete()
            posts_deleted = db.query(Post).delete()
            logger.info(f"Override mode: deleted {posts_deleted} posts and {deleted_replies} replies")

        # 1. Process contributors first (for FK resolution)
        contributor_map: dict[str, Contributor] = {}  # handle -> Contributor

        if request.contributors:
            for contrib_data in request.contributors:
                handle_lower = contrib_data.reddit_handle.lower()
                existing = db.query(Contributor).filter(
                    Contributor.reddit_handle.ilike(contrib_data.reddit_handle)
                ).first()

                if existing:
                    # Update existing contributor
                    existing.name = contrib_data.name
                    existing.role = contrib_data.role
                    existing.active = contrib_data.active
                    contributor_map[handle_lower] = existing
                    contributors_updated += 1
                else:
                    # Create new contributor
                    contributor = Contributor(
                        name=contrib_data.name,
                        reddit_handle=contrib_data.reddit_handle,
                        role=contrib_data.role,
                        active=contrib_data.active,
                    )
                    db.add(contributor)
                    db.flush()  # Get the ID
                    contributor_map[handle_lower] = contributor
                    contributors_created += 1

        # Build map of existing contributors for reply processing
        all_contributors = db.query(Contributor).all()
        for c in all_contributors:
            contributor_map[c.reddit_handle.lower()] = c

        # 2. Process posts
        for post_data in request.posts:
            existing = db.query(Post).filter(Post.id == post_data.id).first()

            if existing:
                # Update existing post
                existing.subreddit = post_data.subreddit
                existing.title = post_data.title
                existing.body = post_data.body
                existing.author = post_data.author
                existing.url = post_data.url
                existing.score = post_data.score
                existing.num_comments = post_data.num_comments
                existing.created_utc = post_data.created_utc
                if post_data.scraped_at:
                    existing.scraped_at = post_data.scraped_at
                posts_updated += 1
            else:
                # Create new post
                post = Post(
                    id=post_data.id,
                    subreddit=post_data.subreddit,
                    title=post_data.title,
                    body=post_data.body,
                    author=post_data.author,
                    url=post_data.url,
                    score=post_data.score,
                    num_comments=post_data.num_comments,
                    created_utc=post_data.created_utc,
                    scraped_at=post_data.scraped_at or datetime.now(timezone.utc),
                )
                db.add(post)
                posts_created += 1

        # 3. Process contributor replies
        if request.contributor_replies:
            for reply_data in request.contributor_replies:
                # Look up contributor by handle
                handle_lower = reply_data.contributor_handle.lower()
                contributor = contributor_map.get(handle_lower)

                if not contributor:
                    errors.append(f"Contributor '{reply_data.contributor_handle}' not found for reply {reply_data.comment_id}")
                    continue

                # Check if post exists
                post_exists = db.query(Post).filter(Post.id == reply_data.post_id).first()
                if not post_exists:
                    errors.append(f"Post '{reply_data.post_id}' not found for reply {reply_data.comment_id}")
                    continue

                # Check for existing reply by comment_id
                existing_reply = db.query(ContributorReply).filter(
                    ContributorReply.comment_id == reply_data.comment_id
                ).first()

                if not existing_reply:
                    reply = ContributorReply(
                        post_id=reply_data.post_id,
                        contributor_id=contributor.id,
                        comment_id=reply_data.comment_id,
                        replied_at=reply_data.replied_at,
                    )
                    db.add(reply)
                    replies_created += 1

        db.commit()

        # Update scraper sync status
        synced_at = datetime.now(timezone.utc)
        scraper.last_synced_at = synced_at
        scraper.last_sync_posts = posts_created + posts_updated
        if request.source_scraped_at:
            scraper.last_sync_source_scraped_at = request.source_scraped_at
            # Also update last_run so the UI shows when data was actually scraped
            scraper.last_run = request.source_scraped_at
            scraper.posts_scraped = posts_created + posts_updated
        logger.info(f"Updated scraper status: synced_at={synced_at}, source_scraped_at={request.source_scraped_at}")

        logger.info(
            f"Sync completed: mode={request.mode}, "
            f"posts_created={posts_created}, posts_updated={posts_updated}, "
            f"posts_deleted={posts_deleted}, contributors_created={contributors_created}, "
            f"contributors_updated={contributors_updated}, replies_created={replies_created}"
        )

        return SyncResponse(
            success=True,
            mode=request.mode,
            posts_created=posts_created,
            posts_updated=posts_updated,
            posts_deleted=posts_deleted,
            contributors_created=contributors_created,
            contributors_updated=contributors_updated,
            replies_created=replies_created,
            synced_at=synced_at,
            errors=errors,
        )

    except Exception as e:
        db.rollback()
        logger.error(f"Sync failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
