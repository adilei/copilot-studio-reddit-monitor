"""FastAPI authentication dependencies."""

import logging
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.contributor import Contributor
from app.auth.token_validator import validate_token

logger = logging.getLogger(__name__)

# Bearer token security scheme
bearer_scheme = HTTPBearer(auto_error=False)


def extract_alias_from_upn(upn: str | None) -> str | None:
    """Extract alias from UPN (e.g., 'johndoe@microsoft.com' -> 'johndoe')."""
    if not upn:
        return None
    return upn.split("@")[0].lower()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """
    Validate the Bearer token and return user claims.

    Returns claims dict if auth is disabled or token is valid.
    Raises 401 if token is missing or invalid.
    """
    settings = get_settings()

    # If auth is disabled, return a placeholder
    if not settings.auth_enabled:
        return {"auth_disabled": True}

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = await validate_token(credentials.credentials)
        logger.debug(f"Authenticated user: {claims.get('preferred_username')}")
        return claims
    except ValueError as e:
        logger.warning(f"Token validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any] | None:
    """
    Like get_current_user but returns None if no token provided (when auth is enabled).
    Useful for endpoints that work differently when authenticated vs anonymous.
    """
    settings = get_settings()

    if not settings.auth_enabled:
        return {"auth_disabled": True}

    if not credentials:
        return None

    try:
        return await validate_token(credentials.credentials)
    except ValueError:
        return None


async def require_contributor(
    claims: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Contributor:
    """
    Require the authenticated user to be a registered contributor.

    Matches user's UPN to contributor's microsoft_alias.
    Returns the Contributor if found.
    Raises 403 if not a contributor.
    """
    settings = get_settings()

    # If auth is disabled, return None (caller should handle this)
    if not settings.auth_enabled or claims.get("auth_disabled"):
        # Return a placeholder - endpoints need to handle auth_disabled case
        return None  # type: ignore

    # Get UPN from token
    upn = claims.get("preferred_username") or claims.get("email")
    alias = extract_alias_from_upn(upn)

    if not alias:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot determine user identity from token",
        )

    # Look up contributor by alias
    contributor = (
        db.query(Contributor)
        .filter(Contributor.microsoft_alias == alias)
        .filter(Contributor.active == True)
        .first()
    )

    if not contributor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{alias}' is not a registered contributor",
        )

    return contributor


async def require_service_principal(
    claims: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Require the token to be from a service principal (client credentials flow).

    Service principal tokens have 'oid' but no 'preferred_username'.
    Raises 403 if not a service principal token.
    """
    settings = get_settings()

    if not settings.auth_enabled or claims.get("auth_disabled"):
        return claims

    # Service principal tokens have these characteristics:
    # - Has 'oid' (object ID of the service principal)
    # - Has 'azp' or 'appid' (the client ID)
    # - Does NOT have 'preferred_username' or has idtyp='app'
    is_app_token = (
        claims.get("idtyp") == "app"
        or (claims.get("oid") and not claims.get("preferred_username"))
    )

    if not is_app_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires service principal authentication",
        )

    return claims


async def require_registered_user(
    claims: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Contributor | None:
    """
    Require the authenticated user to be registered (contributor or reader).

    Any user with a matching microsoft_alias is allowed.
    Raises 403 if user is not registered.
    """
    settings = get_settings()

    # If auth is disabled, allow access
    if not settings.auth_enabled or claims.get("auth_disabled"):
        return None

    # Get UPN from token
    upn = claims.get("preferred_username") or claims.get("email")
    alias = extract_alias_from_upn(upn)

    if not alias:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot determine user identity from token",
        )

    # Look up user by alias
    user = (
        db.query(Contributor)
        .filter(Contributor.microsoft_alias == alias)
        .filter(Contributor.active == True)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{alias}' is not registered. Contact an admin for access.",
        )

    return user


async def require_contributor_write(
    claims: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Contributor | None:
    """
    Require the authenticated user to be a contributor with write access.

    A contributor has write access if they have a reddit_handle.
    Users with only microsoft_alias (no reddit_handle) are "readers" and cannot write.

    Returns the Contributor if found and has write access.
    Raises 403 if user is a reader (no reddit_handle).
    """
    settings = get_settings()

    # If auth is disabled, return None (caller should handle this)
    if not settings.auth_enabled or claims.get("auth_disabled"):
        return None

    # Get UPN from token
    upn = claims.get("preferred_username") or claims.get("email")
    alias = extract_alias_from_upn(upn)

    if not alias:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot determine user identity from token",
        )

    # Look up contributor by alias
    contributor = (
        db.query(Contributor)
        .filter(Contributor.microsoft_alias == alias)
        .filter(Contributor.active == True)
        .first()
    )

    if not contributor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{alias}' is not a registered contributor",
        )

    # Check if user is a reader (no reddit_handle)
    if not contributor.reddit_handle:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Readers cannot perform this action. Contact an admin to upgrade your access.",
        )

    return contributor
