"""Add mock warning posts for testing the warnings tile."""
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timedelta
from app.database import SessionLocal, engine, Base
from app.models import Post, Analysis

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

MOCK_WARNING_POSTS = [
    {
        "id": "mock_warning_1",
        "subreddit": "CopilotStudio",
        "title": "Switching to Power Virtual Agents competitor - Copilot Studio is too buggy",
        "body": "After 3 months of constant crashes and broken deployments, I'm moving my team to Dialogflow. The Microsoft support has been unhelpful and we can't afford more downtime.",
        "author": "frustrated_dev_2024",
        "url": "https://reddit.com/r/CopilotStudio/comments/mock_warning_1",
        "score": 45,
        "num_comments": 23,
        "created_utc": datetime.utcnow() - timedelta(hours=2),
        "status": "analyzed",
        "analysis": {
            "summary": "User is abandoning Copilot Studio due to stability issues and moving to a competitor (Dialogflow). Cites poor support experience.",
            "sentiment": "negative",
            "sentiment_score": -0.85,
            "is_warning": True,
            "key_issues": ["stability", "crashes", "competitor migration", "support quality"],
        }
    },
    {
        "id": "mock_warning_2",
        "subreddit": "CopilotStudio",
        "title": "This is absolutely unacceptable - lost all my work AGAIN",
        "body": "For the THIRD time this month, Copilot Studio has lost my topic configurations. No backup, no recovery option. This is enterprise software? What a joke. Management is questioning why we chose this over alternatives.",
        "author": "angry_architect",
        "url": "https://reddit.com/r/CopilotStudio/comments/mock_warning_2",
        "score": 67,
        "num_comments": 31,
        "created_utc": datetime.utcnow() - timedelta(hours=5),
        "status": "analyzed",
        "analysis": {
            "summary": "Hostile user experiencing repeated data loss. Management questioning platform choice. High risk of churn.",
            "sentiment": "negative",
            "sentiment_score": -0.92,
            "is_warning": True,
            "key_issues": ["data loss", "reliability", "enterprise readiness", "management escalation"],
        }
    },
    {
        "id": "mock_warning_3",
        "subreddit": "CopilotStudio",
        "title": "Honest question: is anyone actually using this in production?",
        "body": "I've been evaluating Copilot Studio for 2 months and I'm starting to think we should cut our losses. The documentation is outdated, features don't work as advertised, and the community seems to have the same issues. Considering AWS Lex instead.",
        "author": "tech_lead_sarah",
        "url": "https://reddit.com/r/CopilotStudio/comments/mock_warning_3",
        "score": 89,
        "num_comments": 56,
        "created_utc": datetime.utcnow() - timedelta(hours=8),
        "status": "analyzed",
        "analysis": {
            "summary": "Potential customer in evaluation phase considering abandoning for AWS Lex. Cites documentation and feature issues.",
            "sentiment": "negative",
            "sentiment_score": -0.65,
            "is_warning": True,
            "key_issues": ["evaluation failure", "documentation", "competitor consideration", "feature gaps"],
        }
    },
    {
        "id": "mock_warning_4",
        "subreddit": "CopilotStudio",
        "title": "Warning to others: billing issues and zero support response",
        "body": "We've been charged incorrectly for 3 months straight. Support tickets go unanswered for weeks. I've escalated to our Microsoft account team but still nothing. Posting here as a last resort before we involve legal.",
        "author": "enterprise_pm",
        "url": "https://reddit.com/r/CopilotStudio/comments/mock_warning_4",
        "score": 112,
        "num_comments": 78,
        "created_utc": datetime.utcnow() - timedelta(hours=12),
        "status": "analyzed",
        "analysis": {
            "summary": "Enterprise customer with billing disputes and support escalation. Mentions potential legal action. Critical situation.",
            "sentiment": "negative",
            "sentiment_score": -0.95,
            "is_warning": True,
            "key_issues": ["billing", "support unresponsive", "legal threat", "enterprise escalation"],
        }
    },
]


def main():
    db = SessionLocal()
    try:
        added = 0
        for post_data in MOCK_WARNING_POSTS:
            # Check if post already exists
            existing = db.query(Post).filter(Post.id == post_data["id"]).first()
            if existing:
                print(f"Post {post_data['id']} already exists, skipping")
                continue

            # Create post
            analysis_data = post_data.pop("analysis")
            post = Post(**post_data)
            db.add(post)
            db.flush()  # Get post ID

            # Create analysis
            analysis = Analysis(
                post_id=post.id,
                summary=analysis_data["summary"],
                sentiment=analysis_data["sentiment"],
                sentiment_score=analysis_data["sentiment_score"],
                is_warning=analysis_data["is_warning"],
                key_issues=analysis_data["key_issues"],
                model_used="mock_data",
                analyzed_at=datetime.utcnow(),
            )
            db.add(analysis)
            added += 1
            print(f"Added: {post.title[:50]}...")

        db.commit()
        print(f"\nDone! Added {added} mock warning posts.")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
