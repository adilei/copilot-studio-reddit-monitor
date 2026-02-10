from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    contributor_id = Column(Integer, ForeignKey("contributors.id"), nullable=False, unique=True, index=True)
    boiling_enabled = Column(Boolean, default=True)
    negative_enabled = Column(Boolean, default=True)
    product_areas = Column(JSON, default=list)  # Array of product area IDs
    push_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contributor = relationship("Contributor")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    contributor_id = Column(Integer, ForeignKey("contributors.id"), nullable=False, index=True)
    post_id = Column(String, ForeignKey("posts.id"), nullable=False)
    notification_type = Column(String, nullable=False)  # 'boiling', 'negative', 'product_area'
    title = Column(String, nullable=False)  # Cached post title
    product_area_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)

    contributor = relationship("Contributor")
    post = relationship("Post")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    contributor_id = Column(Integer, ForeignKey("contributors.id"), nullable=False, index=True)
    endpoint = Column(String, nullable=False, unique=True)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    contributor = relationship("Contributor")
