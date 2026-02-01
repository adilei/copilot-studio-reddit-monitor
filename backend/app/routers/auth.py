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
    user_type: str | None = None  # "contributor" or "reader"
    is_reader: bool = False


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(
    claims: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserResponse:
    """
    Get current authenticated user info.

    Returns user claims and linked contributor/reader (if any).
    """
    # Auth disabled case
    if claims.get("auth_disabled"):
        return CurrentUserResponse(authenticated=False)

    email = claims.get("preferred_username") or claims.get("email")
    name = claims.get("name")
    alias = extract_alias_from_upn(email)

    # Try to find linked contributor/reader
    contributor_id = None
    contributor_name = None
    user_type = None
    is_reader = False

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
            user_type = contributor.user_type
            is_reader = contributor.is_reader

    return CurrentUserResponse(
        authenticated=True,
        email=email,
        name=name,
        alias=alias,
        contributor_id=contributor_id,
        contributor_name=contributor_name,
        user_type=user_type,
        is_reader=is_reader,
    )
