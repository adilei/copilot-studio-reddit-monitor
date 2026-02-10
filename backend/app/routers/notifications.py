"""Notification API endpoints."""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user_optional, extract_alias_from_upn
from app.config import get_settings
from app.database import get_db
from app.models.contributor import Contributor
from app.models.notification import Notification, NotificationPreference, PushSubscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# --- Pydantic schemas ---

class NotificationOut(BaseModel):
    id: int
    post_id: str
    notification_type: str
    title: str
    product_area_name: str | None
    created_at: str
    read_at: str | None

    class Config:
        from_attributes = True


class UnreadCountOut(BaseModel):
    unread_count: int


class PreferencesOut(BaseModel):
    boiling_enabled: bool
    negative_enabled: bool
    product_areas: list[int]
    push_enabled: bool


class PreferencesUpdate(BaseModel):
    boiling_enabled: bool | None = None
    negative_enabled: bool | None = None
    product_areas: list[int] | None = None
    push_enabled: bool | None = None


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


# --- Helper ---

def _resolve_contributor(
    claims: dict[str, Any] | None,
    contributor_id: int | None,
    db: Session,
) -> Contributor | None:
    """Resolve contributor from auth claims or fallback to contributor_id param."""
    # Try resolving from token claims
    if claims and not claims.get("auth_disabled"):
        upn = claims.get("preferred_username") or claims.get("email")
        alias = extract_alias_from_upn(upn)
        if alias:
            contributor = (
                db.query(Contributor)
                .filter(Contributor.microsoft_alias == alias, Contributor.active == True)
                .first()
            )
            if contributor:
                return contributor

    # Fallback to contributor_id param
    if contributor_id:
        return db.query(Contributor).filter(Contributor.id == contributor_id).first()

    return None


# --- Endpoints ---

@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, le=200),
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        return []

    query = db.query(Notification).filter(Notification.contributor_id == contributor.id)
    if unread_only:
        query = query.filter(Notification.read_at == None)
    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()

    return [
        NotificationOut(
            id=n.id,
            post_id=n.post_id,
            notification_type=n.notification_type,
            title=n.title,
            product_area_name=n.product_area_name,
            created_at=n.created_at.isoformat() if n.created_at else "",
            read_at=n.read_at.isoformat() if n.read_at else None,
        )
        for n in notifications
    ]


@router.get("/unread-count", response_model=UnreadCountOut)
async def get_unread_count(
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        return UnreadCountOut(unread_count=0)

    count = (
        db.query(Notification)
        .filter(
            Notification.contributor_id == contributor.id,
            Notification.read_at == None,
        )
        .count()
    )
    return UnreadCountOut(unread_count=count)


@router.post("/read-all")
async def mark_all_read(
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        return {"updated": 0}

    now = datetime.utcnow()
    updated = (
        db.query(Notification)
        .filter(
            Notification.contributor_id == contributor.id,
            Notification.read_at == None,
        )
        .update({"read_at": now})
    )
    db.commit()
    return {"updated": updated}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: int,
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.contributor_id == contributor.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.read_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/preferences", response_model=PreferencesOut)
async def get_preferences(
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        return PreferencesOut(
            boiling_enabled=True,
            negative_enabled=True,
            product_areas=[],
            push_enabled=False,
        )

    prefs = (
        db.query(NotificationPreference)
        .filter(NotificationPreference.contributor_id == contributor.id)
        .first()
    )
    if not prefs:
        # Create default preferences
        prefs = NotificationPreference(contributor_id=contributor.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    return PreferencesOut(
        boiling_enabled=prefs.boiling_enabled,
        negative_enabled=prefs.negative_enabled,
        product_areas=prefs.product_areas or [],
        push_enabled=prefs.push_enabled,
    )


@router.put("/preferences", response_model=PreferencesOut)
async def update_preferences(
    data: PreferencesUpdate,
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    prefs = (
        db.query(NotificationPreference)
        .filter(NotificationPreference.contributor_id == contributor.id)
        .first()
    )
    if not prefs:
        prefs = NotificationPreference(contributor_id=contributor.id)
        db.add(prefs)

    if data.boiling_enabled is not None:
        prefs.boiling_enabled = data.boiling_enabled
    if data.negative_enabled is not None:
        prefs.negative_enabled = data.negative_enabled
    if data.product_areas is not None:
        prefs.product_areas = data.product_areas
    if data.push_enabled is not None:
        prefs.push_enabled = data.push_enabled

    prefs.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(prefs)

    return PreferencesOut(
        boiling_enabled=prefs.boiling_enabled,
        negative_enabled=prefs.negative_enabled,
        product_areas=prefs.product_areas or [],
        push_enabled=prefs.push_enabled,
    )


@router.post("/push-subscribe")
async def push_subscribe(
    data: PushSubscribeRequest,
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    # Upsert: update if endpoint exists, otherwise create
    existing = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == data.endpoint)
        .first()
    )
    if existing:
        existing.contributor_id = contributor.id
        existing.p256dh = data.p256dh
        existing.auth = data.auth
    else:
        sub = PushSubscription(
            contributor_id=contributor.id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
        )
        db.add(sub)

    db.commit()
    return {"ok": True}


@router.delete("/push-subscribe")
async def push_unsubscribe(
    endpoint: str = Query(...),
    contributor_id: int | None = Query(default=None),
    claims: dict[str, Any] | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    contributor = _resolve_contributor(claims, contributor_id, db)
    if not contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    deleted = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == endpoint,
            PushSubscription.contributor_id == contributor.id,
        )
        .delete()
    )
    db.commit()
    return {"deleted": deleted}


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    settings = get_settings()
    return {"vapid_public_key": settings.vapid_public_key}
