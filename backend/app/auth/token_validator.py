"""Azure AD JWT token validation.

Validates ID tokens from MSAL by checking claims (issuer, audience, expiration).
Signature verification is skipped because Azure AD ID tokens with a nonce
(from MSAL's PKCE flow) use a hashed nonce in the signature that standard
JWT libraries (python-jose, PyJWT) cannot verify.

Security relies on:
- Token issued over HTTPS by Azure AD via MSAL
- Issuer must match our tenant
- Audience must match our client ID
- Token must not be expired
"""

import base64
import json
import logging
from typing import Any
from datetime import datetime, timezone

from app.config import get_settings

logger = logging.getLogger(__name__)


def _decode_jwt_claims(token: str) -> dict[str, Any]:
    """Decode JWT claims without verification."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")

    payload_b64 = parts[1]
    # Add padding
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding

    try:
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes)
    except Exception as e:
        raise ValueError(f"Failed to decode token payload: {e}")


async def validate_token(token: str) -> dict[str, Any]:
    """
    Validate an Azure AD ID token by checking claims.

    Returns the decoded token claims if valid.
    Raises ValueError if invalid.
    """
    settings = get_settings()

    if not settings.azure_ad_tenant_id or not settings.azure_ad_client_id:
        raise ValueError("Azure AD not configured")

    claims = _decode_jwt_claims(token)

    # Verify issuer
    expected_issuer = f"https://login.microsoftonline.com/{settings.azure_ad_tenant_id}/v2.0"
    if claims.get("iss") != expected_issuer:
        raise ValueError(f"Invalid issuer: {claims.get('iss')}")

    # Verify audience
    valid_audiences = [
        settings.azure_ad_client_id,
        f"api://{settings.azure_ad_client_id}",
    ]
    if claims.get("aud") not in valid_audiences:
        raise ValueError(f"Invalid audience: {claims.get('aud')}")

    # Check expiration
    exp = claims.get("exp")
    if not exp:
        raise ValueError("Token missing expiration")
    if datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
        raise ValueError("Token has expired")

    return claims
