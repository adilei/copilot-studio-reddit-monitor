# Azure AD Authentication Implementation Plan

## Overview

Add Azure AD authentication to the Copilot Studio Reddit Monitor app with:
- App registration for MSAL authentication (delegated tokens for UI)
- Service principal authentication for sync endpoint (client credentials flow)
- **Authorization via UPN matching** - user's email/UPN is matched against `microsoft_alias` in contributors table
- Auto-select contributor based on logged-in user

## Authorization Strategy

**No app roles needed.** Instead of configuring roles in Azure AD, authorization is handled by matching the authenticated user's UPN against contributor records in the database:

1. User authenticates via Azure AD → token contains `preferred_username` (UPN)
2. Backend extracts alias from UPN (e.g., `johndoe@microsoft.com` → `johndoe`)
3. Backend looks up contributor by `microsoft_alias` field
4. If found → user is authorized; if not → 403 Forbidden

This keeps authorization management in the app's database rather than Azure AD.

## Auth Enforcement

**Protected app pattern** - all content requires authentication.

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | Blocks UI until authenticated. Shows login screen if no valid session. Attaches Bearer token to all API calls. |
| **Backend** | Validates token on every request (defense in depth). Returns 401 if missing/invalid, 403 if not authorized. |

```
User visits app
       ↓
   MSAL: authenticated?
      /        \
    No          Yes
     ↓            ↓
  Login        Show app
  screen       (token in all API calls)
     ↓               ↓
  "Sign in"    API validates token
     ↓          /          \
  Azure AD   Valid        Invalid
  redirect     ↓             ↓
     ↓       200 OK      401/403
  Back with token
     ↓
  Show app
```

## Authentication Strategy

| Client | Flow | Token Type |
|--------|------|------------|
| Frontend (UI) | MSAL interactive login | Delegated (user context) |
| Sync script | Client credentials | Service principal (app context) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                           │
│  MsalProvider → AuthContext → ContributorContext (auto-linked)  │
│                         ↓                                        │
│         api.ts (Authorization: Bearer <delegated-token>)         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                            │
│  JWT Validation → Extract UPN → Lookup contributor by alias      │
│                                                                  │
│  Dependencies:                                                   │
│  - get_current_user() → validates token, returns user claims     │
│  - require_contributor() → matches UPN to contributor record     │
│  - require_service_principal() → requires app token (sync)       │
└─────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────┐
│              Sync Script (export_to_remote.py)                   │
│       ClientCredentialFlow → Bearer <service-principal-token>    │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Azure AD App Registration

1. Create App Registration in Azure Portal
   - Name: `Copilot Studio Reddit Monitor`
   - Account type: Single tenant (Microsoft only)
   - Redirect URIs (SPA): `http://localhost:3000`, production URL

2. Configure API permissions:
   - `Microsoft Graph > User.Read, email, openid, profile`

3. Expose an API:
   - Application ID URI: `api://<client-id>`
   - Scope: `api://<client-id>/access_as_user`

4. Create client secret (for service principal / sync script):
   - Certificates & secrets → New client secret
   - Record the secret value (shown only once)

5. Record values:
   - `AZURE_AD_CLIENT_ID`
   - `AZURE_AD_TENANT_ID`
   - `AZURE_AD_CLIENT_SECRET` (for sync script only)

## Phase 2: Backend Changes

### Files to Create

**`backend/app/auth/__init__.py`**
- Exports: `get_current_user`, `require_contributor`, `require_service_principal`, `CurrentUser`

**`backend/app/auth/token_validator.py`**
- Validates Azure AD JWT tokens
- Fetches and caches JWKS from Azure AD
- Uses `python-jose` for JWT decoding

**`backend/app/auth/dependencies.py`**
- `get_current_user()` - Returns user or raises 401 (supports both delegated and app tokens)
- `require_contributor()` - Requires linked contributor or raises 403 (delegated only)
- `require_service_principal()` - Requires app token or raises 403 (for sync endpoint)
- `extract_alias_from_email()` - Gets alias from email prefix

**`backend/app/routers/auth.py`**
- `GET /api/auth/me` - Get current user info
- `GET /api/auth/me/contributor` - Get linked contributor

### Files to Modify

**`backend/app/models/contributor.py`**
- Add: `microsoft_alias = Column(String, unique=True, nullable=True, index=True)`

**`backend/app/schemas/schemas.py`**
- Add `microsoft_alias` to ContributorBase
- Add `CurrentUser` schema

**`backend/app/config.py`**
- Add: `azure_ad_tenant_id`, `azure_ad_client_id`, `azure_ad_audience`, `auth_enabled`

**`backend/requirements.txt`**
- Add: `python-jose[cryptography]==3.3.0`, `cachetools==5.3.2`

**`backend/app/routers/posts.py`**
- Add `get_current_user` to read endpoints
- Add `require_contributor` to checkout/release

**`backend/app/main.py`**
- Include auth router

### Endpoint Protection

| Endpoint | Protection | Notes |
|----------|------------|-------|
| `GET /health` | Public | Health check only |
| `GET /api/posts`, analytics | `get_current_user` | All read endpoints require auth |
| `POST /api/posts/{id}/checkout` | `require_contributor` | Must be linked contributor |
| `POST /api/posts/{id}/release` | `require_contributor` | Must be linked contributor |
| `POST /api/contributors` | `require_contributor` | Only contributors can add new |
| `POST /api/scrape` | `require_contributor` | Only contributors can trigger |
| `POST /api/sync` | `require_service_principal` | Service principal only (client credentials) |

## Phase 3: Frontend Changes

### Files to Create

**`frontend/src/lib/msal-config.ts`**
- MSAL configuration with client ID, tenant ID
- Login request scopes
- PublicClientApplication instance

**`frontend/src/lib/auth-context.tsx`**
- `AuthProvider` - wraps MsalProvider
- `useAuth()` hook - returns `user`, `isAuthenticated`, `login`, `logout`, `getAccessToken`
- Fetches `/api/auth/me` after login to get contributor link

### Files to Modify

**`frontend/package.json`**
- Add: `@azure/msal-browser`, `@azure/msal-react`

**`frontend/src/components/Providers.tsx`**
- Wrap with `MsalProvider` and `AuthProvider`

**`frontend/src/lib/api.ts`**
- Add `setTokenGetter()` function
- Inject Bearer token in all API calls

**`frontend/src/lib/contributor-context.tsx`**
- Auto-select contributor based on `user.contributorId`
- Set up token getter for API

**`frontend/src/components/Header.tsx`**
- Add login/logout button
- Show user email when authenticated
- Show "Linked" badge when auto-linked

### Environment Variables

```
# frontend/.env.local
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=<client-id>
NEXT_PUBLIC_AZURE_AD_TENANT_ID=<tenant-id>

# backend/.env
AZURE_AD_CLIENT_ID=<client-id>
AZURE_AD_TENANT_ID=<tenant-id>
AZURE_AD_AUDIENCE=api://<client-id>
AUTH_ENABLED=true

# For sync script (export_to_remote.py)
AZURE_AD_CLIENT_SECRET=<client-secret>  # Service principal secret
```

### Sync Script Changes

**`backend/scripts/export_to_remote.py`**
- Add MSAL client credentials flow to acquire token
- Send `Authorization: Bearer <token>` header with sync requests
- Uses same client ID but with client secret (service principal)

## Phase 4: Database Migration

```sql
ALTER TABLE contributors ADD COLUMN microsoft_alias VARCHAR UNIQUE;
CREATE INDEX ix_contributors_microsoft_alias ON contributors(microsoft_alias);
```

Populate for existing contributors (manual or script).

## Phase 5: Deployment

1. Create App Registration
2. Deploy backend with `AUTH_ENABLED=false` (test mode)
3. Deploy frontend with MSAL config
4. Test login flow
5. Enable auth: `AUTH_ENABLED=true`
6. Update EMEA deployment env vars

## Verification

1. **Login flow**: Click "Sign in with Microsoft" → redirects to Azure AD → returns with token
2. **Auto-link**: User with matching `microsoft_alias` sees contributor auto-selected
3. **API protection**: Unauthenticated requests to protected endpoints return 401
4. **Contributor check**: Non-contributor users get 403 on checkout/release
5. **Token refresh**: Tokens refresh silently before expiry
6. **Sync script**: `export_to_remote.py` acquires service principal token and syncs successfully
7. **Sync protection**: Delegated tokens cannot access `/api/sync` (403)

## Files Summary

### Backend (Create)
- `backend/app/auth/__init__.py`
- `backend/app/auth/token_validator.py`
- `backend/app/auth/dependencies.py`
- `backend/app/routers/auth.py`
- `backend/migrations/add_microsoft_alias.py`

### Backend (Modify)
- `backend/app/models/contributor.py`
- `backend/app/schemas/schemas.py`
- `backend/app/config.py`
- `backend/requirements.txt`
- `backend/app/routers/posts.py`
- `backend/app/routers/contributors.py`
- `backend/app/routers/scraper.py`
- `backend/app/routers/sync.py` - Add service principal requirement
- `backend/app/main.py`
- `backend/scripts/export_to_remote.py` - Add MSAL client credentials auth

### Frontend (Create)
- `frontend/src/lib/msal-config.ts`
- `frontend/src/lib/auth-context.tsx`

### Frontend (Modify)
- `frontend/package.json`
- `frontend/src/components/Providers.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/contributor-context.tsx`
- `frontend/src/components/Header.tsx`
