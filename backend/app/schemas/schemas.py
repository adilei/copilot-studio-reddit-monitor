from pydantic import BaseModel
from datetime import datetime
from typing import Literal


# Post schemas
class PostBase(BaseModel):
    id: str
    subreddit: str
    title: str
    body: str | None = None
    author: str
    url: str
    score: int = 0
    num_comments: int = 0
    created_utc: datetime


class PostCreate(PostBase):
    pass


class AnalysisResponse(BaseModel):
    id: int
    post_id: str
    summary: str
    sentiment: Literal["positive", "neutral", "negative"]
    is_warning: bool = False
    sentiment_score: float | None = None
    key_issues: list[str] | None = None
    analyzed_at: datetime
    model_used: str | None = None

    class Config:
        from_attributes = True


class ContributorReplyResponse(BaseModel):
    id: int
    contributor_name: str
    contributor_handle: str
    comment_id: str
    replied_at: datetime

    class Config:
        from_attributes = True


class PostResponse(PostBase):
    scraped_at: datetime
    is_analyzed: bool = False
    latest_sentiment: str | None = None
    latest_sentiment_score: float | None = None
    is_warning: bool = False
    has_contributor_reply: bool = False
    checked_out_by: int | None = None
    checked_out_by_name: str | None = None
    checked_out_at: datetime | None = None
    resolved: bool = False
    resolved_at: datetime | None = None
    resolved_by: int | None = None
    resolved_by_name: str | None = None

    class Config:
        from_attributes = True


class PostDetail(PostResponse):
    analyses: list[AnalysisResponse] = []
    contributor_replies: list[ContributorReplyResponse] = []

    class Config:
        from_attributes = True


class PostCheckoutRequest(BaseModel):
    contributor_id: int


class PostReleaseRequest(BaseModel):
    contributor_id: int


class PostResolveRequest(BaseModel):
    contributor_id: int


class PostUnresolveRequest(BaseModel):
    contributor_id: int


# Analysis schemas
class AnalysisBase(BaseModel):
    summary: str
    sentiment: Literal["positive", "neutral", "negative"]
    is_warning: bool = False
    sentiment_score: float | None = None
    key_issues: list[str] | None = None


# Contributor schemas
class ContributorBase(BaseModel):
    name: str
    reddit_handle: str | None = None  # Nullable for readers
    microsoft_alias: str | None = None  # e.g., 'johndoe' from johndoe@microsoft.com
    role: str | None = None


class ContributorCreate(ContributorBase):
    """Create a contributor (requires reddit_handle)."""
    reddit_handle: str  # Required for contributors


class ReaderCreate(BaseModel):
    """Create a reader (no reddit_handle, requires microsoft_alias)."""
    name: str
    microsoft_alias: str  # Required for readers
    role: str | None = None


class ContributorResponse(ContributorBase):
    id: int
    active: bool
    created_at: datetime
    reply_count: int = 0
    user_type: str = "contributor"  # "contributor" or "reader"

    class Config:
        from_attributes = True


# Scraper schemas
class ScrapeRequest(BaseModel):
    time_range: Literal["day", "week", "month", "all"] = "week"
    subreddits: list[str] | None = None  # Use defaults if None
    queries: list[str] | None = None  # Use defaults if None


class ScrapeStatus(BaseModel):
    is_running: bool
    last_run: datetime | None = None
    posts_scraped: int = 0
    errors: list[str] = []
    # Sync info (for destination servers receiving synced data)
    last_synced_at: datetime | None = None
    last_sync_source_scraped_at: datetime | None = None
    last_sync_posts: int = 0


# Analytics schemas
class OverviewStats(BaseModel):
    total_posts: int
    posts_last_24h: int
    negative_percentage: float
    analyzed_count: int
    not_analyzed_count: int
    handled_count: int = 0
    warning_count: int = 0
    in_progress_count: int = 0
    awaiting_pickup_count: int = 0
    unhandled_negative_count: int = 0
    top_subreddit: str | None = None


class SentimentTrend(BaseModel):
    date: str
    positive: int
    neutral: int
    negative: int
    average_score: float
