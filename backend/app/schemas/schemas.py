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
    status: str
    latest_sentiment: str | None = None
    latest_sentiment_score: float | None = None
    has_contributor_reply: bool = False

    class Config:
        from_attributes = True


class PostDetail(PostResponse):
    analyses: list[AnalysisResponse] = []
    contributor_replies: list[ContributorReplyResponse] = []

    class Config:
        from_attributes = True


class PostStatusUpdate(BaseModel):
    status: Literal["pending", "analyzed", "handled"]


# Analysis schemas
class AnalysisBase(BaseModel):
    summary: str
    sentiment: Literal["positive", "neutral", "negative"]
    sentiment_score: float | None = None
    key_issues: list[str] | None = None


# Contributor schemas
class ContributorBase(BaseModel):
    name: str
    reddit_handle: str
    role: str | None = None


class ContributorCreate(ContributorBase):
    pass


class ContributorResponse(ContributorBase):
    id: int
    active: bool
    created_at: datetime
    reply_count: int = 0

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


# Analytics schemas
class OverviewStats(BaseModel):
    total_posts: int
    posts_today: int
    negative_percentage: float
    handled_percentage: float
    pending_count: int
    top_subreddit: str | None = None


class SentimentTrend(BaseModel):
    date: str
    positive: int
    neutral: int
    negative: int
    average_score: float
