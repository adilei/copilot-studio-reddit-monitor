from sqlalchemy import Column, String, Text, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class ProductArea(Base):
    """Predefined product areas for categorizing pain themes."""
    __tablename__ = "product_areas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    pain_themes = relationship("PainTheme", back_populates="product_area", cascade="all, delete-orphan")


class PainTheme(Base):
    """LLM-discovered pain themes linked to product areas."""
    __tablename__ = "pain_themes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    severity = Column(Integer, default=3)  # 1-5 scale
    product_area_id = Column(Integer, ForeignKey("product_areas.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    clustering_run_id = Column(Integer, ForeignKey("clustering_runs.id"), nullable=True)

    # Relationships
    product_area = relationship("ProductArea", back_populates="pain_themes")
    post_mappings = relationship("PostThemeMapping", back_populates="theme", cascade="all, delete-orphan")
    clustering_run = relationship("ClusteringRun", back_populates="themes")

    @property
    def post_count(self):
        """Number of posts associated with this theme."""
        return len(self.post_mappings)


class PostThemeMapping(Base):
    """Maps posts to discovered pain themes."""
    __tablename__ = "post_theme_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(String, ForeignKey("posts.id"), nullable=False)
    theme_id = Column(Integer, ForeignKey("pain_themes.id"), nullable=False)
    confidence = Column(Float, default=1.0)  # 0-1 scale
    assigned_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    post = relationship("Post", backref="theme_mappings")
    theme = relationship("PainTheme", back_populates="post_mappings")


class ClusteringRun(Base):
    """Audit trail for clustering operations."""
    __tablename__ = "clustering_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, default="running")  # running, completed, failed
    run_type = Column(String, default="incremental")  # full, incremental
    posts_processed = Column(Integer, default=0)
    themes_created = Column(Integer, default=0)
    themes_updated = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    # Relationships
    themes = relationship("PainTheme", back_populates="clustering_run")
