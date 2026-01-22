from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Contributor(Base):
    __tablename__ = "contributors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    reddit_handle = Column(String, unique=True, nullable=False, index=True)
    role = Column(String)  # PM, Engineer, etc.
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    replies = relationship("ContributorReply", back_populates="contributor", cascade="all, delete-orphan")


class ContributorReply(Base):
    __tablename__ = "contributor_replies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(String, ForeignKey("posts.id"), nullable=False, index=True)
    contributor_id = Column(Integer, ForeignKey("contributors.id"), nullable=False)
    comment_id = Column(String, nullable=False)  # Reddit comment ID
    replied_at = Column(DateTime, nullable=False)
    detected_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    post = relationship("Post", back_populates="contributor_replies")
    contributor = relationship("Contributor", back_populates="replies")
