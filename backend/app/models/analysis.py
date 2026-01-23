from sqlalchemy import Column, String, Text, Integer, Float, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(String, ForeignKey("posts.id"), nullable=False, index=True)
    summary = Column(Text, nullable=False)
    sentiment = Column(String, nullable=False)  # positive, neutral, negative
    sentiment_score = Column(Float)  # -1.0 to 1.0
    key_issues = Column(JSON)  # Array of identified issues
    is_warning = Column(Boolean, default=False)  # Escalation flag for hostile/quitting users
    analyzed_at = Column(DateTime, default=datetime.utcnow)
    model_used = Column(String)  # ollama/llama3 or azure/gpt-4

    # Relationships
    post = relationship("Post", back_populates="analyses")
