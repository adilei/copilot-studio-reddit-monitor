import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Analysis, Contributor
from app.models.notification import Notification, NotificationPreference, PushSubscription

logger = logging.getLogger(__name__)


def generate_notifications(db: Session) -> int:
    """Generate notifications for contributors based on their preferences.

    Checks posts analyzed in the last 10 minutes and creates notifications
    for matching preferences. Returns count of notifications created.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=10)

    # Get latest analysis per post (analyzed in last 10 min)
    latest_analysis_ids = (
        db.query(func.max(Analysis.id))
        .filter(Analysis.analyzed_at >= cutoff)
        .group_by(Analysis.post_id)
        .subquery()
    )
    recent_analyses = (
        db.query(Analysis)
        .filter(Analysis.id.in_(latest_analysis_ids))
        .all()
    )

    if not recent_analyses:
        return 0

    # Get all contributors with preferences
    prefs_list = db.query(NotificationPreference).all()
    if not prefs_list:
        return 0

    prefs_by_contributor = {p.contributor_id: p for p in prefs_list}
    contributor_ids = list(prefs_by_contributor.keys())

    # Get active contributors
    active_contributors = (
        db.query(Contributor)
        .filter(Contributor.id.in_(contributor_ids), Contributor.active == True)
        .all()
    )

    created_count = 0

    for contributor in active_contributors:
        prefs = prefs_by_contributor.get(contributor.id)
        if not prefs:
            continue

        for analysis in recent_analyses:
            # Check if notification already exists for this contributor+post
            existing = (
                db.query(Notification)
                .filter(
                    Notification.contributor_id == contributor.id,
                    Notification.post_id == analysis.post_id,
                )
                .first()
            )
            if existing:
                continue

            # Determine notification type based on preferences
            notification_type = None
            product_area_name = None

            if prefs.boiling_enabled and analysis.is_warning:
                notification_type = "boiling"
            elif prefs.negative_enabled and analysis.sentiment == "negative":
                notification_type = "negative"
            elif prefs.product_areas and analysis.product_area_id:
                area_ids = prefs.product_areas if isinstance(prefs.product_areas, list) else []
                if analysis.product_area_id in area_ids:
                    notification_type = "product_area"
                    if analysis.product_area:
                        product_area_name = analysis.product_area.name

            if not notification_type:
                continue

            # Get post title
            post_title = analysis.post.title if analysis.post else "Unknown post"

            notification = Notification(
                contributor_id=contributor.id,
                post_id=analysis.post_id,
                notification_type=notification_type,
                title=post_title,
                product_area_name=product_area_name,
            )
            db.add(notification)
            created_count += 1

            # Send push notification to all subscriptions for this contributor
            subscriptions = (
                db.query(PushSubscription)
                .filter(PushSubscription.contributor_id == contributor.id)
                .all()
            )
            for sub in subscriptions:
                _send_push(db, sub, notification)

    db.commit()
    if created_count > 0:
        logger.info(f"Generated {created_count} notifications")
    return created_count


def _send_push(db: Session, subscription: PushSubscription, notification: Notification):
    """Send a Web Push notification. Removes stale subscriptions on 404/410."""
    settings = get_settings()
    if not settings.vapid_private_key or not settings.vapid_public_key:
        return

    try:
        from pywebpush import webpush, WebPushException

        payload = json.dumps({
            "type": notification.notification_type,
            "title": notification.title,
            "post_id": notification.post_id,
            "product_area": notification.product_area_name,
        })

        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_claims_email},
        )
    except Exception as e:
        error_str = str(e)
        # Remove stale subscriptions
        if "410" in error_str or "404" in error_str:
            logger.info(f"Removing stale push subscription {subscription.endpoint[:50]}...")
            db.delete(subscription)
        else:
            logger.warning(f"Push send failed: {error_str}")
