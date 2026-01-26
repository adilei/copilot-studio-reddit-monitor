#!/usr/bin/env python3
"""
Export local database data and POST it to a remote Reddit Monitor instance.

Usage:
    # Sync all data to remote
    python scripts/export_to_remote.py https://remote.example.com

    # Only posts from last week
    python scripts/export_to_remote.py https://remote.example.com --since 2025-01-19T00:00:00

    # Full override (replace all remote data)
    python scripts/export_to_remote.py https://remote.example.com --override

    # Dry run (print payload without sending)
    python scripts/export_to_remote.py https://remote.example.com --dry-run
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Post, Contributor, ContributorReply
from app.services.reddit_scraper import scraper


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export local DB data and sync to a remote Reddit Monitor instance"
    )
    parser.add_argument(
        "remote_url",
        help="Base URL of the remote API (e.g., https://remote.example.com)",
    )
    parser.add_argument(
        "--since",
        type=str,
        help="Only export posts created after this timestamp (ISO format, e.g., 2025-01-19T00:00:00)",
    )
    parser.add_argument(
        "--override",
        action="store_true",
        help="Use override mode (replace all remote data)",
    )
    parser.add_argument(
        "--no-contributors",
        action="store_true",
        help="Exclude contributors from export",
    )
    parser.add_argument(
        "--no-replies",
        action="store_true",
        help="Exclude contributor replies from export",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print payload without sending",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="Request timeout in seconds (default: 60)",
    )
    return parser.parse_args()


def get_db_session():
    """Create a database session using the same DB as the app."""
    db_path = Path(__file__).parent.parent / "data" / "reddit_monitor.db"
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        sys.exit(1)

    engine = create_engine(f"sqlite:///{db_path}")
    Session = sessionmaker(bind=engine)
    return Session()


def export_posts(db, since: datetime | None = None) -> list[dict]:
    """Export posts from the database."""
    query = db.query(Post)
    if since:
        query = query.filter(Post.created_utc >= since)

    posts = query.order_by(Post.created_utc.desc()).all()

    return [
        {
            "id": post.id,
            "subreddit": post.subreddit,
            "title": post.title,
            "body": post.body,
            "author": post.author,
            "url": post.url,
            "score": post.score,
            "num_comments": post.num_comments,
            "created_utc": post.created_utc.isoformat() if post.created_utc else None,
            "scraped_at": post.scraped_at.isoformat() if post.scraped_at else None,
        }
        for post in posts
    ]


def export_contributors(db) -> list[dict]:
    """Export contributors from the database."""
    contributors = db.query(Contributor).all()

    return [
        {
            "name": contrib.name,
            "reddit_handle": contrib.reddit_handle,
            "role": contrib.role,
            "active": contrib.active,
        }
        for contrib in contributors
    ]


def export_replies(db, post_ids: set[str] | None = None) -> list[dict]:
    """Export contributor replies from the database."""
    query = db.query(ContributorReply).join(Contributor)

    if post_ids:
        query = query.filter(ContributorReply.post_id.in_(post_ids))

    replies = query.all()

    return [
        {
            "post_id": reply.post_id,
            "contributor_handle": reply.contributor.reddit_handle,
            "comment_id": reply.comment_id,
            "replied_at": reply.replied_at.isoformat() if reply.replied_at else None,
        }
        for reply in replies
    ]


def main():
    args = parse_args()

    # Parse since timestamp if provided
    since = None
    if args.since:
        try:
            since = datetime.fromisoformat(args.since)
            if since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
        except ValueError:
            print(f"Error: Invalid timestamp format: {args.since}")
            print("Expected ISO format, e.g., 2025-01-19T00:00:00")
            sys.exit(1)

    # Get database session
    db = get_db_session()

    try:
        # Export data
        print("Exporting data from local database...")

        posts = export_posts(db, since)
        print(f"  Posts: {len(posts)}")

        contributors = None
        if not args.no_contributors:
            contributors = export_contributors(db)
            print(f"  Contributors: {len(contributors)}")

        replies = None
        if not args.no_replies:
            post_ids = {p["id"] for p in posts} if since else None
            replies = export_replies(db, post_ids)
            print(f"  Contributor replies: {len(replies)}")

        # Build payload
        payload = {
            "mode": "override" if args.override else "sync",
            "posts": posts,
        }

        # Include source_scraped_at from local scraper
        if scraper.last_run:
            payload["source_scraped_at"] = scraper.last_run.isoformat()

        if contributors is not None:
            payload["contributors"] = contributors

        if replies is not None:
            payload["contributor_replies"] = replies

        # Dry run - print payload
        if args.dry_run:
            print("\n--- DRY RUN ---")
            print(f"Would POST to: {args.remote_url}/api/sync")
            print(f"Mode: {payload['mode']}")
            print(f"Posts: {len(posts)}")
            if contributors is not None:
                print(f"Contributors: {len(contributors)}")
            if replies is not None:
                print(f"Contributor replies: {len(replies)}")
            print("\nPayload preview (first 2 posts):")
            preview = {**payload, "posts": posts[:2]}
            print(json.dumps(preview, indent=2, default=str))
            return

        # Send to remote
        url = f"{args.remote_url.rstrip('/')}/api/sync"
        print(f"\nSending to {url}...")

        with httpx.Client(timeout=args.timeout) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()

        print("\n--- Sync completed ---")
        print(f"Success: {result.get('success')}")
        print(f"Mode: {result.get('mode')}")
        print(f"Posts created: {result.get('posts_created')}")
        print(f"Posts updated: {result.get('posts_updated')}")
        if result.get('posts_deleted'):
            print(f"Posts deleted: {result.get('posts_deleted')}")
        if result.get('contributors_created'):
            print(f"Contributors created: {result.get('contributors_created')}")
        if result.get('contributors_updated'):
            print(f"Contributors updated: {result.get('contributors_updated')}")
        if result.get('replies_created'):
            print(f"Replies created: {result.get('replies_created')}")
        print(f"Synced at: {result.get('synced_at')}")

        if result.get('errors'):
            print(f"\nWarnings/Errors:")
            for error in result['errors']:
                print(f"  - {error}")

    except httpx.HTTPStatusError as e:
        print(f"Error: HTTP {e.response.status_code}")
        try:
            detail = e.response.json().get('detail', e.response.text)
            print(f"Detail: {detail}")
        except Exception:
            print(f"Response: {e.response.text}")
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Error: Failed to connect to {args.remote_url}")
        print(f"Detail: {str(e)}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
