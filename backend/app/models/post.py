from sqlalchemy import Column, String, Text, Integer, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.database import Base


class PostStatus(str, enum.Enum):
    PENDING = "pending"
    ANALYZED = "analyzed"
    HANDLED = "handled"
    ANSWERED = "answered"


class Post(Base):
    __tablename__ = "posts"

    id = Column(String, primary_key=True)  # Reddit post ID
    subreddit = Column(String, nullable=False, index=True)
    title = Column(Text, nullable=False)
    body = Column(Text)
    author = Column(String, nullable=False, index=True)
    url = Column(String, nullable=False)
    score = Column(Integer, default=0)
    num_comments = Column(Integer, default=0)
    created_utc = Column(DateTime, nullable=False, index=True)
    scraped_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default=PostStatus.PENDING.value, index=True)

    # Relationships
    analyses = relationship("Analysis", back_populates="post", cascade="all, delete-orphan")
    contributor_replies = relationship("ContributorReply", back_populates="post", cascade="all, delete-orphan")

    @property
    def latest_analysis(self):
        """Get the most recent analysis for this post."""
        if self.analyses:
            return max(self.analyses, key=lambda a: a.analyzed_at)
        return None
