#!/usr/bin/env python3
"""
Daily sync script: scrape Reddit locally and sync to EMEA.

This script:
1. Fetches contributors from EMEA and adds any missing ones locally
2. Scrapes Reddit locally (posts + contributor replies)
3. Syncs new posts and contributor replies to EMEA

Usage:
    python scripts/daily_sync.py --token YOUR_EMEA_TOKEN
    python scripts/daily_sync.py --token YOUR_TOKEN --dry-run
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Add parent directory for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Post, Contributor, ContributorReply
from app.services.reddit_scraper import scraper

# Configuration
EMEA_URL = "https://mcs-social-api-emea.azurewebsites.net"
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


def sync_contributors_from_emea(db, headers: dict) -> int:
    """Fetch contributors from EMEA and add any missing ones locally."""
    log("Fetching contributors from EMEA...")

    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{EMEA_URL}/api/contributors", headers=headers)
        resp.raise_for_status()
        emea_contributors = resp.json()

    log(f"  Found {len(emea_contributors)} contributors on EMEA")

    # Get local contributors (only those with reddit handles)
    local_handles = {c.reddit_handle.lower() for c in db.query(Contributor).all() if c.reddit_handle}

    added = 0
    for ec in emea_contributors:
        # Skip readers (no reddit handle)
        if not ec.get("reddit_handle"):
            continue
        handle_lower = ec["reddit_handle"].lower()
        if handle_lower not in local_handles:
            contributor = Contributor(
                name=ec["name"],
                reddit_handle=ec["reddit_handle"],
                role=ec.get("role"),
                active=ec.get("active", True),
            )
            db.add(contributor)
            added += 1
            log(f"  + Added contributor: {ec['reddit_handle']}")

    if added:
        db.commit()

    log(f"  Added {added} new contributors locally")
    return added


def run_local_scrape(db) -> tuple[int, int]:
    """Run the local Reddit scraper."""
    log("Running local Reddit scrape...")

    # Count posts before
    posts_before = db.query(Post).count()
    replies_before = db.query(ContributorReply).count()

    # Run scraper
    scraper.scrape(db)

    # Count after
    posts_after = db.query(Post).count()
    replies_after = db.query(ContributorReply).count()

    new_posts = posts_after - posts_before
    new_replies = replies_after - replies_before

    log(f"  Scraped {new_posts} new posts, {new_replies} new replies")
    return new_posts, new_replies


def sync_to_emea(db, headers: dict, since_hours: int = 48) -> dict:
    """Sync recent posts and replies to EMEA."""
    log(f"Syncing data to EMEA (last {since_hours} hours)...")

    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    # Get recent posts
    posts = db.query(Post).filter(
        (Post.created_utc >= cutoff) | (Post.scraped_at >= cutoff)
    ).all()

    posts_data = [
        {
            "id": p.id,
            "subreddit": p.subreddit,
            "title": p.title,
            "body": p.body,
            "author": p.author,
            "url": p.url,
            "score": p.score,
            "num_comments": p.num_comments,
            "created_utc": p.created_utc.isoformat() if p.created_utc else None,
            "scraped_at": p.scraped_at.isoformat() if p.scraped_at else None,
        }
        for p in posts
    ]

    # Get recent replies
    replies = db.query(ContributorReply).join(Contributor).filter(
        ContributorReply.replied_at >= cutoff
    ).all()

    replies_data = [
        {
            "post_id": r.post_id,
            "contributor_handle": r.contributor.reddit_handle,
            "comment_id": r.comment_id,
            "replied_at": r.replied_at.isoformat() if r.replied_at else None,
        }
        for r in replies
    ]

    # Also get post IDs for replies (to ensure they're synced)
    reply_post_ids = {r.post_id for r in replies}
    extra_posts = db.query(Post).filter(Post.id.in_(reply_post_ids)).all()
    for p in extra_posts:
        if not any(pd["id"] == p.id for pd in posts_data):
            posts_data.append({
                "id": p.id,
                "subreddit": p.subreddit,
                "title": p.title,
                "body": p.body,
                "author": p.author,
                "url": p.url,
                "score": p.score,
                "num_comments": p.num_comments,
                "created_utc": p.created_utc.isoformat() if p.created_utc else None,
                "scraped_at": p.scraped_at.isoformat() if p.scraped_at else None,
            })

    log(f"  Syncing {len(posts_data)} posts, {len(replies_data)} replies")

    # Build payload
    payload = {
        "mode": "sync",
        "posts": posts_data,
        "contributor_replies": replies_data,
        "source_scraped_at": scraper.last_run.isoformat() if scraper.last_run else datetime.now(timezone.utc).isoformat(),
    }

    # Send to EMEA
    with httpx.Client(timeout=60) as client:
        resp = client.post(f"{EMEA_URL}/api/sync", json=payload, headers=headers)
        resp.raise_for_status()
        result = resp.json()

    log(f"  Posts created: {result.get('posts_created', 0)}, updated: {result.get('posts_updated', 0)}")
    log(f"  Replies created: {result.get('replies_created', 0)}")
    if result.get("errors"):
        for err in result["errors"][:5]:
            log(f"  Warning: {err}")

    return result


def main():
    parser = argparse.ArgumentParser(description="Daily sync: scrape locally, sync to EMEA")
    parser.add_argument("--token", required=True, help="Bearer token for EMEA API")
    parser.add_argument("--dry-run", action="store_true", help="Skip actual sync to EMEA")
    parser.add_argument("--since-hours", type=int, default=48, help="Sync data from last N hours (default: 48)")
    args = parser.parse_args()

    headers = {"Authorization": f"Bearer {args.token}"}

    log("=== Daily Sync Starting ===")

    db = get_db_session()

    sync_result = None

    try:
        # 1. Sync contributors from EMEA
        contributors_added = sync_contributors_from_emea(db, headers)

        # 2. Run local scrape
        new_posts, new_replies = run_local_scrape(db)

        # 3. Sync to EMEA
        if args.dry_run:
            log("DRY RUN - skipping sync to EMEA")
        else:
            sync_result = sync_to_emea(db, headers, since_hours=args.since_hours)

        # Summary
        log("")
        log("=== Summary ===")
        log(f"  Contributors added locally:  {contributors_added}")
        log(f"  New posts from Reddit:       {new_posts}")
        log(f"  New replies from Reddit:     {new_replies}")
        if sync_result:
            log(f"  Posts synced to EMEA:        {sync_result.get('posts_created', 0)} new, {sync_result.get('posts_updated', 0)} updated")
            log(f"  Replies synced to EMEA:      {sync_result.get('replies_created', 0)}")
        log("===============")
        log("")
        log("=== Daily Sync Complete ===")

    except httpx.HTTPStatusError as e:
        log(f"ERROR: HTTP {e.response.status_code} - {e.response.text[:200]}")
        sys.exit(1)
    except Exception as e:
        log(f"ERROR: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
