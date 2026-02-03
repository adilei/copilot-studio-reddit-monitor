#!/usr/bin/env python3
"""
Backfill product area classification for existing posts.

This script re-analyzes posts to classify them into product areas.
It only processes posts whose latest analysis doesn't have a product_area_id.

Usage:
    python scripts/backfill_product_areas.py --limit 20   # Test with 20 posts
    python scripts/backfill_product_areas.py              # All posts without product_area_id
    python scripts/backfill_product_areas.py --force      # Re-analyze ALL posts
"""

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add parent directory for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from app.models import Post, Analysis
from app.services.llm_analyzer import analyzer

# Configuration
DB_PATH = Path(__file__).parent.parent / "data" / "reddit_monitor.db"


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def get_db_session():
    if not DB_PATH.exists():
        log(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)
    engine = create_engine(f"sqlite:///{DB_PATH}")
    return sessionmaker(bind=engine)()


def get_posts_needing_classification(db, limit: int | None = None, force: bool = False) -> list[Post]:
    """Get posts that need product area classification.

    If force=False, only returns posts whose latest analysis lacks product_area_id.
    If force=True, returns all analyzed posts.
    """
    if force:
        # Re-analyze all posts that have at least one analysis
        query = (
            db.query(Post)
            .join(Analysis)
            .distinct()
            .order_by(Post.created_utc.desc())
        )
    else:
        # Find posts whose latest analysis doesn't have product_area_id
        # Subquery for max analysis ID per post
        latest_analysis_subq = (
            db.query(Analysis.post_id, func.max(Analysis.id).label("max_id"))
            .group_by(Analysis.post_id)
            .subquery()
        )

        # Get posts where latest analysis has no product_area_id
        query = (
            db.query(Post)
            .join(Analysis, Post.id == Analysis.post_id)
            .join(latest_analysis_subq, Analysis.id == latest_analysis_subq.c.max_id)
            .filter(Analysis.product_area_id == None)  # noqa: E711
            .order_by(Post.created_utc.desc())
        )

    if limit:
        query = query.limit(limit)

    return query.all()


async def backfill_post(db, post: Post) -> bool:
    """Re-analyze a single post to classify its product area.

    Returns True if successful, False otherwise.
    """
    try:
        analysis = await analyzer.analyze_post(db, post)
        if analysis:
            log(f"  Post {post.id}: product_area_id={analysis.product_area_id}")
            return True
        else:
            log(f"  Post {post.id}: FAILED to analyze")
            return False
    except Exception as e:
        log(f"  Post {post.id}: ERROR - {e}")
        return False


async def run_backfill(db, posts: list[Post]) -> tuple[int, int]:
    """Run backfill for all posts sequentially.

    Returns (success_count, failure_count).
    """
    success = 0
    failure = 0

    for i, post in enumerate(posts, 1):
        log(f"[{i}/{len(posts)}] Processing: {post.title[:60]}...")
        if await backfill_post(db, post):
            success += 1
        else:
            failure += 1

        # Small delay between requests to avoid rate limiting
        if i < len(posts):
            await asyncio.sleep(0.5)

    return success, failure


def main():
    parser = argparse.ArgumentParser(description="Backfill product area classification for posts")
    parser.add_argument("--limit", type=int, help="Limit number of posts to process")
    parser.add_argument("--force", action="store_true", help="Re-analyze ALL posts, not just those missing product_area_id")
    parser.add_argument("--dry-run", action="store_true", help="Show posts to process without actually analyzing")
    args = parser.parse_args()

    log("=== Product Area Backfill Starting ===")

    db = get_db_session()

    try:
        # Get posts needing classification
        posts = get_posts_needing_classification(db, limit=args.limit, force=args.force)

        log(f"Found {len(posts)} posts to process")

        if not posts:
            log("No posts to process. Exiting.")
            return

        if args.dry_run:
            log("DRY RUN - showing first 10 posts:")
            for post in posts[:10]:
                log(f"  - {post.id}: {post.title[:60]}")
            if len(posts) > 10:
                log(f"  ... and {len(posts) - 10} more")
            return

        # Run backfill
        success, failure = asyncio.run(run_backfill(db, posts))

        # Summary
        log("")
        log("=== Summary ===")
        log(f"  Total posts:    {len(posts)}")
        log(f"  Successful:     {success}")
        log(f"  Failed:         {failure}")
        log("===============")
        log("")
        log("=== Backfill Complete ===")

    except Exception as e:
        log(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
