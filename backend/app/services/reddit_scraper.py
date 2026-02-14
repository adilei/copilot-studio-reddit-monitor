import httpx
import asyncio
from datetime import datetime, timezone
from typing import Literal
import logging
import time

from sqlalchemy.orm import Session
from app.config import get_settings
from app.models import Post, Contributor, ContributorReply, Analysis

logger = logging.getLogger(__name__)

# Retry configuration for rate limiting
MAX_RETRIES = 3
BASE_DELAY = 15  # seconds (retry sequence: 15s, 30s, 60s)


def _request_with_retry(client: httpx.Client, method: str, url: str, **kwargs) -> httpx.Response:
    """
    Make an HTTP request with retry on 429 (rate limit) using exponential backoff.
    Backoff sequence: 5s, 10s, 20s (then gives up)
    """
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = client.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < MAX_RETRIES:
                delay = BASE_DELAY * (2 ** attempt)
                logger.warning(
                    f"Rate limited (429) on {url}. "
                    f"Retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})..."
                )
                time.sleep(delay)
            else:
                raise


class RedditScraper:
    """Reddit scraper using public JSON API - fetches latest posts from r/CopilotStudio."""

    def __init__(self):
        self.settings = get_settings()
        self.is_running = False
        self.last_run: datetime | None = None
        self.posts_scraped = 0
        self.errors: list[str] = []
        self.base_url = "https://www.reddit.com"
        self.headers = {"User-Agent": self.settings.reddit_user_agent}
        self.subreddit = "CopilotStudio"
        # Sync tracking
        self.last_synced_at: datetime | None = None
        self.last_sync_source_scraped_at: datetime | None = None
        self.last_sync_posts: int = 0

    def scrape(
        self,
        db: Session,
        time_range: Literal["day", "week", "month", "all"] = "week",
        subreddits: list[str] | None = None,  # ignored, kept for API compat
        queries: list[str] | None = None,  # ignored, kept for API compat
    ) -> int:
        """
        Scrape latest posts from r/CopilotStudio.
        Returns the number of new posts scraped.
        """
        if self.is_running:
            logger.warning("Scraper is already running")
            return 0

        self.is_running = True
        self.errors = []
        self.posts_scraped = 0

        try:
            self._scrape_new_posts(db)
            self._check_all_contributor_replies(db)
            db.commit()

            # Analyze new posts
            self._analyze_pending_posts(db)

            self.last_run = datetime.now(timezone.utc)
            db.commit()

        except Exception as e:
            logger.error(f"Scraper error: {str(e)}")
            self.errors.append(str(e))
            db.rollback()
        finally:
            self.is_running = False

        return self.posts_scraped

    def _scrape_new_posts(self, db: Session):
        """Fetch newest posts from r/CopilotStudio."""
        logger.info(f"Fetching new posts from r/{self.subreddit}")

        after = None
        total_fetched = 0
        max_posts = 200  # Safety limit

        while total_fetched < max_posts:
            try:
                url = f"{self.base_url}/r/{self.subreddit}/new.json"
                params = {"limit": 100}
                if after:
                    params["after"] = after

                with httpx.Client(headers=self.headers, timeout=30) as client:
                    response = _request_with_retry(client, "GET", url, params=params)
                    data = response.json()

                children = data.get("data", {}).get("children", [])
                if not children:
                    break

                for post_data in children:
                    self._save_post(db, post_data["data"])
                    total_fetched += 1

                # Get the "after" token for pagination
                after = data.get("data", {}).get("after")
                if not after:
                    break

                time.sleep(1)  # Rate limiting

            except Exception as e:
                logger.error(f"Error fetching posts: {str(e)}")
                self.errors.append(str(e))
                break

        logger.info(f"Fetched {total_fetched} posts, {self.posts_scraped} new")

    def _save_post(self, db: Session, post_data: dict) -> bool:
        """Save a Reddit post to the database. Returns True if new."""
        post_id = post_data.get("id")
        if not post_id:
            return False

        # Check if already exists in DB
        existing = db.query(Post).filter(Post.id == post_id).first()
        if existing:
            # Update score and comments
            existing.score = post_data.get("score", 0)
            existing.num_comments = post_data.get("num_comments", 0)
            return False

        # Create new post
        post = Post(
            id=post_id,
            subreddit=post_data.get("subreddit", self.subreddit),
            title=post_data.get("title", ""),
            body=post_data.get("selftext") or None,
            author=post_data.get("author", "[deleted]"),
            url=f"https://reddit.com{post_data.get('permalink', '')}",
            score=post_data.get("score", 0),
            num_comments=post_data.get("num_comments", 0),
            created_utc=datetime.fromtimestamp(post_data.get("created_utc", 0), tz=timezone.utc),
        )

        db.add(post)
        self.posts_scraped += 1
        logger.info(f"Saved new post: {post.title[:50]}...")
        return True

    def _check_all_contributor_replies(self, db: Session):
        """Check recent posts for contributor replies."""
        contributors = db.query(Contributor).filter(
            Contributor.active == True,
            Contributor.reddit_handle.isnot(None)
        ).all()
        if not contributors:
            logger.info("No active contributors to check")
            return

        contributor_handles = {c.reddit_handle.lower(): c for c in contributors}
        logger.info(f"Checking replies from {len(contributors)} contributors")

        # Check recent posts that aren't already resolved or have a contributor reply
        posts_with_replies = db.query(ContributorReply.post_id).distinct().subquery()
        posts = db.query(Post).filter(
            Post.resolved == 0,
            ~Post.id.in_(posts_with_replies),
        ).order_by(Post.created_utc.desc()).limit(75).all()
        logger.info(f"Checking {len(posts)} unhandled posts for replies")

        delay = 2  # seconds between requests
        dropped_posts = []
        for post in posts:
            rate_limited = self._check_post_replies(db, post, contributor_handles)
            if rate_limited:
                dropped_posts.append(post)
                logger.warning("Rate limited - cooling down for 60s before continuing")
                time.sleep(60)
                delay = 4  # slower pace after hitting a rate limit
            else:
                time.sleep(delay)

        # Retry dropped posts after a longer cooldown
        if dropped_posts:
            logger.info(f"Retrying {len(dropped_posts)} dropped posts after 120s cooldown")
            time.sleep(120)
            for post in dropped_posts:
                rate_limited = self._check_post_replies(db, post, contributor_handles)
                if rate_limited:
                    logger.warning(f"Post {post.id} still rate limited after retry, skipping")
                time.sleep(5)

    def _analyze_pending_posts(self, db: Session):
        """Analyze posts that haven't been analyzed yet."""
        from app.services.llm_analyzer import analyzer

        # Get posts without any analysis
        posts_with_analyses = db.query(Analysis.post_id).distinct().subquery()
        pending_posts = db.query(Post).filter(
            ~Post.id.in_(posts_with_analyses)
        ).order_by(Post.created_utc.desc()).limit(20).all()

        if not pending_posts:
            logger.info("No pending posts to analyze")
            return

        logger.info(f"Analyzing {len(pending_posts)} pending posts")

        for post in pending_posts:
            try:
                # Run async analyzer in sync context
                asyncio.run(analyzer.analyze_post(db, post))
                logger.info(f"Analyzed post: {post.id}")
            except Exception as e:
                logger.error(f"Failed to analyze post {post.id}: {str(e)}")

    def _check_post_replies(self, db: Session, post: Post, contributor_handles: dict) -> bool:
        """Check a single post for contributor replies. Returns True if rate-limited."""
        try:
            url = f"{self.base_url}/comments/{post.id}.json"
            params = {"depth": 10, "limit": 500}

            with httpx.Client(headers=self.headers, timeout=30) as client:
                response = _request_with_retry(client, "GET", url, params=params)
                data = response.json()

            if len(data) < 2:
                return False

            comments = data[1].get("data", {}).get("children", [])
            self._check_comments_recursive(db, post, comments, contributor_handles)
            return False

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.error(f"Rate limited checking replies for post {post.id}")
                return True
            logger.error(f"Error checking replies for post {post.id}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Error checking replies for post {post.id}: {str(e)}")
            return False

    def check_contributor_replies(self, db: Session, post_id: str):
        """Check a specific post for replies from known contributors."""
        contributors = db.query(Contributor).filter(
            Contributor.active == True,
            Contributor.reddit_handle.isnot(None)
        ).all()
        if not contributors:
            return

        contributor_handles = {c.reddit_handle.lower(): c for c in contributors}

        post = db.query(Post).filter(Post.id == post_id).first()
        if not post:
            return

        try:
            url = f"{self.base_url}/comments/{post_id}.json"
            params = {"depth": 10, "limit": 500}

            with httpx.Client(headers=self.headers, timeout=30) as client:
                response = _request_with_retry(client, "GET", url, params=params)
                data = response.json()

            if len(data) < 2:
                return

            comments = data[1].get("data", {}).get("children", [])
            self._check_comments_recursive(db, post, comments, contributor_handles)
            db.commit()

        except Exception as e:
            logger.error(f"Error checking replies for post {post_id}: {str(e)}")

    def _check_comments_recursive(self, db: Session, post: Post, comments: list, contributor_handles: dict):
        """Recursively check comments for contributor replies."""
        for comment_data in comments:
            if comment_data.get("kind") != "t1":
                continue

            comment = comment_data.get("data", {})
            author = comment.get("author", "").lower()

            if author in contributor_handles:
                contributor = contributor_handles[author]
                comment_id = comment.get("id")

                existing_reply = db.query(ContributorReply).filter(
                    ContributorReply.comment_id == comment_id
                ).first()

                if not existing_reply:
                    reply = ContributorReply(
                        post_id=post.id,
                        contributor_id=contributor.id,
                        comment_id=comment_id,
                        replied_at=datetime.fromtimestamp(
                            comment.get("created_utc", 0), tz=timezone.utc
                        ),
                    )
                    db.add(reply)
                    logger.info(f"Found reply from {contributor.name} on post {post.id}")

            # Check nested replies
            replies = comment.get("replies")
            if replies and isinstance(replies, dict):
                nested = replies.get("data", {}).get("children", [])
                self._check_comments_recursive(db, post, nested, contributor_handles)

    def get_status(self) -> dict:
        """Get current scraper status."""
        return {
            "is_running": self.is_running,
            "last_run": self.last_run,
            "posts_scraped": self.posts_scraped,
            "errors": self.errors,
            # Sync info
            "last_synced_at": self.last_synced_at,
            "last_sync_source_scraped_at": self.last_sync_source_scraped_at,
            "last_sync_posts": self.last_sync_posts,
        }


# Global scraper instance
scraper = RedditScraper()
