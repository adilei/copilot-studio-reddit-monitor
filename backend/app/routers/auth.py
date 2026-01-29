"""Authentication routes."""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, extract_alias_from_upn
from app.models.contributor import Contributor

router = APIRouter(prefix="/api/auth", tags=["auth"])


class CurrentUserResponse(BaseModel):
    """Response for /api/auth/me endpoint."""

    authenticated: bool
    email: str | None = None
    name: str | None = None
    alias: str | None = None
    contributor_id: int | None = None
    contributor_name: str | None = None


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(
    claims: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserResponse:
    """
    Get current authenticated user info.

    Returns user claims and linked contributor (if any).
    """
    # Auth disabled case
    if claims.get("auth_disabled"):
        return CurrentUserResponse(authenticated=False)

    email = claims.get("preferred_username") or claims.get("email")
    name = claims.get("name")
    alias = extract_alias_from_upn(email)

    # Try to find linked contributor
    contributor_id = None
    contributor_name = None

    if alias:
        contributor = (
            db.query(Contributor)
            .filter(Contributor.microsoft_alias == alias)
            .filter(Contributor.active == True)
            .first()
        )
        if contributor:
            contributor_id = contributor.id
            contributor_name = contributor.name

    return CurrentUserResponse(
        authenticated=True,
        email=email,
        name=name,
        alias=alias,
        contributor_id=contributor_id,
        contributor_name=contributor_name,
    )
