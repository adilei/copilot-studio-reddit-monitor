from pydantic import BaseModel
from datetime import datetime
from typing import Literal


class SyncPostData(BaseModel):
    """Post data for syncing."""
    id: str  # Reddit post ID
    subreddit: str
    title: str
    body: str | None = None
    author: str
    url: str
    score: int = 0
    num_comments: int = 0
    created_utc: datetime
    scraped_at: datetime | None = None


class SyncContributorData(BaseModel):
    """Contributor data for syncing."""
    name: str
    reddit_handle: str  # unique identifier
    role: str | None = None
    active: bool = True


class SyncContributorReplyData(BaseModel):
    """Contributor reply data for syncing."""
    post_id: str
    contributor_handle: str  # reference by handle, not ID
    comment_id: str
    replied_at: datetime


class SyncRequest(BaseModel):
    """Request payload for sync endpoint."""
    mode: Literal["sync", "override"] = "sync"
    source_scraped_at: datetime | None = None  # When source system last scraped
    posts: list[SyncPostData]
    contributors: list[SyncContributorData] | None = None
    contributor_replies: list[SyncContributorReplyData] | None = None


class SyncResponse(BaseModel):
    """Response from sync endpoint."""
    success: bool
    mode: str
    posts_created: int
    posts_updated: int
    posts_deleted: int = 0
    contributors_created: int = 0
    contributors_updated: int = 0
    replies_created: int = 0
    synced_at: datetime  # timestamp of when sync completed
    errors: list[str] = []
