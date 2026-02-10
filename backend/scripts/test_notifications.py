"""Test notification generation and push delivery.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/test_notifications.py --contributor-id 1

This script:
1. Creates a test notification for the given contributor
2. Sends a Web Push notification to all of their subscriptions (if VAPID keys configured)
3. Prints the notification details

To test the full flow:
1. Start the backend: uvicorn app.main:app --reload
2. Start the frontend: cd frontend && npm run dev
3. Open the app, select a contributor, open notification preferences
4. Enable push notifications (grants browser permission + saves push subscription)
5. Run this script to send a test push notification
"""

import argparse
import json
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, init_db
from app.models.contributor import Contributor
from app.models.notification import Notification, NotificationPreference, PushSubscription
from app.config import get_settings


def main():
    parser = argparse.ArgumentParser(description="Test notification generation")
    parser.add_argument("--contributor-id", type=int, required=True, help="Contributor ID to notify")
    parser.add_argument("--post-id", type=str, default="test_post_123", help="Post ID (default: test_post_123)")
    parser.add_argument("--type", choices=["boiling", "negative", "product_area"], default="boiling", help="Notification type")
    parser.add_argument("--title", type=str, default="Test notification - please ignore", help="Notification title")
    args = parser.parse_args()

    init_db()
    db = SessionLocal()

    try:
        # Verify contributor exists
        contributor = db.query(Contributor).filter(Contributor.id == args.contributor_id).first()
        if not contributor:
            print(f"Contributor {args.contributor_id} not found")
            return

        print(f"Contributor: {contributor.name} (id={contributor.id})")

        # Check preferences
        prefs = db.query(NotificationPreference).filter(
            NotificationPreference.contributor_id == contributor.id
        ).first()
        if prefs:
            print(f"Preferences: boiling={prefs.boiling_enabled}, negative={prefs.negative_enabled}, push={prefs.push_enabled}")
        else:
            print("No preferences found (defaults apply)")

        # Create notification
        notification = Notification(
            contributor_id=contributor.id,
            post_id=args.post_id,
            notification_type=args.type,
            title=args.title,
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        print(f"\nCreated notification #{notification.id}: type={args.type}, title='{args.title}'")

        # Try push
        subscriptions = db.query(PushSubscription).filter(
            PushSubscription.contributor_id == contributor.id
        ).all()

        if not subscriptions:
            print("\nNo push subscriptions found for this contributor.")
            print("To test push: open the app, enable push in notification preferences, then re-run this script.")
            return

        settings = get_settings()
        if not settings.vapid_private_key:
            print("\nVAPID_PRIVATE_KEY not set. Push notifications won't be sent.")
            print("Generate VAPID keys with: python -c \"from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('Private:', v.private_pem().decode()); print('Public:', v.public_key)\"")
            return

        print(f"\nSending push to {len(subscriptions)} subscription(s)...")
        from pywebpush import webpush

        for sub in subscriptions:
            try:
                payload = json.dumps({
                    "type": args.type,
                    "title": args.title,
                    "post_id": args.post_id,
                })
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_claims_email},
                )
                print(f"  Push sent to {sub.endpoint[:60]}...")
            except Exception as e:
                print(f"  Push failed: {e}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
