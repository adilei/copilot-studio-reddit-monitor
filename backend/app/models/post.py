from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


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

    # Checkout fields
    checked_out_by = Column(Integer, ForeignKey("contributors.id"), nullable=True)
    checked_out_at = Column(DateTime, nullable=True)

    # Relationships
    analyses = relationship("Analysis", back_populates="post", cascade="all, delete-orphan")
    contributor_replies = relationship("ContributorReply", back_populates="post", cascade="all, delete-orphan")
    checked_out_contributor = relationship("Contributor", foreign_keys=[checked_out_by])

    @property
    def is_analyzed(self):
        """Whether this post has been analyzed."""
        return len(self.analyses) > 0

    @property
    def latest_analysis(self):
        """Get the most recent analysis for this post."""
        if self.analyses:
            return max(self.analyses, key=lambda a: a.analyzed_at)
        return None
