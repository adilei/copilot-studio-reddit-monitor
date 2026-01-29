"""Azure AD JWT token validation."""

import logging
from typing import Any
from datetime import datetime, timezone

import httpx
from jose import jwt, JWTError
from cachetools import TTLCache

from app.config import get_settings

logger = logging.getLogger(__name__)

# Cache JWKS for 24 hours
_jwks_cache: TTLCache = TTLCache(maxsize=1, ttl=86400)


async def get_jwks(tenant_id: str) -> dict[str, Any]:
    """Fetch and cache JWKS from Azure AD."""
    cache_key = f"jwks_{tenant_id}"

    if cache_key in _jwks_cache:
        return _jwks_cache[cache_key]

    jwks_url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"

    async with httpx.AsyncClient() as client:
        response = await client.get(jwks_url)
        response.raise_for_status()
        jwks = response.json()

    _jwks_cache[cache_key] = jwks
    return jwks


def get_signing_key(jwks: dict[str, Any], kid: str) -> dict[str, Any] | None:
    """Find the signing key matching the token's kid."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def validate_token(token: str) -> dict[str, Any]:
    """
    Validate an Azure AD JWT token.

    Returns the decoded token claims if valid.
    Raises ValueError if invalid.
    """
    settings = get_settings()

    if not settings.azure_ad_tenant_id or not settings.azure_ad_client_id:
        raise ValueError("Azure AD not configured")

    # Decode header to get kid
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise ValueError(f"Invalid token header: {e}")

    kid = unverified_header.get("kid")
    if not kid:
        raise ValueError("Token missing kid in header")

    # Get JWKS and find signing key
    jwks = await get_jwks(settings.azure_ad_tenant_id)
    signing_key = get_signing_key(jwks, kid)

    if not signing_key:
        # Key might have rotated, clear cache and retry
        _jwks_cache.clear()
        jwks = await get_jwks(settings.azure_ad_tenant_id)
        signing_key = get_signing_key(jwks, kid)

        if not signing_key:
            raise ValueError(f"Unable to find signing key for kid: {kid}")

    # Validate token
    try:
        # Azure AD tokens use RS256
        # Decode without audience validation first, then check manually
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.azure_ad_client_id,
            issuer=f"https://login.microsoftonline.com/{settings.azure_ad_tenant_id}/v2.0",
            options={"verify_aud": False},  # We'll verify manually
        )

        # Manually verify audience (can be client ID or api://<client-id>)
        valid_audiences = [
            settings.azure_ad_client_id,
            f"api://{settings.azure_ad_client_id}",
        ]
        token_aud = claims.get("aud")
        if token_aud not in valid_audiences:
            raise ValueError(f"Invalid audience: {token_aud}")

        # Check expiration (jose does this, but let's be explicit)
        exp = claims.get("exp")
        if exp and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
            raise ValueError("Token has expired")

        return claims

    except JWTError as e:
        raise ValueError(f"Token validation failed: {e}")
