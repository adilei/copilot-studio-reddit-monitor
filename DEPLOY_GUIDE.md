# Azure Deployment Guide - Copilot Studio Reddit Monitor

This guide documents the complete Azure deployment process, including all issues encountered and their solutions. Use this guide for future deployments.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Azure Resources Required](#azure-resources-required)
3. [Pre-Deployment Code Changes](#pre-deployment-code-changes)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Environment Variables Reference](#environment-variables-reference)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Deployment Commands Quick Reference](#deployment-commands-quick-reference)

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│     Azure Static Web Apps (Free tier)       │
│     Next.js Static Export                   │
│     URL: *.azurestaticapps.net              │
└─────────────────┬───────────────────────────┘
                  │ HTTPS API calls
                  ▼
┌─────────────────────────────────────────────┐
│     Azure App Service (B1 tier)             │
│     Python 3.12 + FastAPI + Gunicorn        │
│     SQLite at /home/data/                   │
│     APScheduler (in-process)                │
│     URL: *.azurewebsites.net                │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│     Azure OpenAI                            │
│     Model: gpt-5.2-chat (or gpt-4o)         │
└─────────────────────────────────────────────┘
```

### Key Design Decisions

- **Frontend uses Static Export**: Azure Static Web Apps free tier works best with static files. Dynamic SSR requires paid tiers or different hosting.
- **Query parameter routing for post detail**: Instead of `/posts/[id]`, we use `/posts/detail?id=xxx` which is compatible with static export (the route is static, only the query param is dynamic).
- **SQLite persisted at `/home/data/`**: Azure App Service persists the `/home` directory across restarts.
- **Always On enabled**: Required for APScheduler to run background jobs continuously.

---

## Azure Resources Required

Create these resources in the Azure Portal before deployment:

### 1. Resource Group

| Setting | Value |
|---------|-------|
| Name | `mcs-social-monitor-rg` (or your choice) |
| Region | Same as your Azure OpenAI resource |

### 2. Azure App Service (Backend)

**Portal → App Services → Create → Web App**

| Setting | Value |
|---------|-------|
| Name | `mcs-social-api` (or your choice) |
| Publish | Code |
| Runtime stack | Python 3.12 |
| Operating System | Linux |
| Pricing plan | B1 Basic (~$13/month) |
| Region | Same as resource group |

**After creation, configure in Portal:**

1. **Configuration → General settings:**
   - Startup Command: `gunicorn -w 2 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0`
   - Always On: **Yes** (critical for scheduler)

2. **Configuration → Application settings:** (see [Environment Variables](#environment-variables-reference))

### 3. Azure Static Web Apps (Frontend)

**Portal → Static Web Apps → Create**

| Setting | Value |
|---------|-------|
| Name | `mcs-social-monitor` (or your choice) |
| Plan type | Free |
| Region | Any (content is distributed globally) |
| Source | Other (for CLI deployment) |

### 4. Azure OpenAI (if not existing)

| Setting | Value |
|---------|-------|
| Name | Your choice |
| Model deployment | gpt-4o, gpt-5.2-chat, or similar |

---

## Pre-Deployment Code Changes

These changes must be made to the codebase before deploying to Azure.

### 1. Backend: Externalize CORS Origins

**File:** `backend/app/main.py`

**Change:** Replace hardcoded CORS origins with environment variable.

```python
# Add at top of file
import os

# Replace the CORS middleware section with:
# CORS middleware for frontend
# Allow configuration via environment variable for Azure deployment
allowed_origins_str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002"
)
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Why:** Allows configuring CORS for the Azure frontend URL without code changes.

### 2. Backend: Handle Absolute Database Paths

**File:** `backend/app/database.py`

**Change:** Update database directory creation to handle Azure's absolute path.

```python
# Replace the directory creation section with:
# Ensure database directory exists (handles both relative and absolute paths)
db_url = settings.database_url
if db_url.startswith("sqlite:///"):
    db_path = db_url.replace("sqlite:///", "")
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
```

**Why:** Azure uses absolute path `/home/data/reddit_monitor.db`. The original code only created relative `data/` directory.

### 3. Backend: Add Gunicorn

**File:** `backend/requirements.txt`

**Add:**
```
gunicorn==21.2.0
```

**Why:** Azure App Service for Python uses Gunicorn as the production WSGI server.

### 4. Frontend: Configure Static Export

**File:** `frontend/next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
}

module.exports = nextConfig
```

**Why:**
- `output: 'export'` - Generates static HTML files for Azure Static Web Apps
- `images: { unoptimized: true }` - Next.js Image Optimization requires a server
- `trailingSlash: true` - Ensures proper routing on static hosts

### 5. Frontend: Post Detail Page with Query Parameters

Static export cannot handle dynamic routes like `/posts/[id]` without pre-generating all paths at build time. Instead, we use a query parameter approach:

**Structure:** `/posts/detail?id=xxx` instead of `/posts/[id]`

**File:** `frontend/src/app/posts/detail/page.tsx`

```tsx
"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

export default function PostDetailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PostDetailContent />
    </Suspense>
  )
}

function PostDetailContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  // Fetch and render post data client-side
}
```

**Why this works:**
- The route `/posts/detail` is static (no dynamic segment like `[id]`)
- Query parameters (`?id=xxx`) are read client-side at runtime
- No `generateStaticParams` needed
- Full post detail functionality is preserved

### 6. Frontend: Update PostCard Links

**File:** `frontend/src/components/PostCard.tsx`

**Change:** Update post title to link to the detail page with query parameter.

```tsx
import Link from "next/link"

// Use this:
<Link href={`/posts/detail?id=${post.id}`}>
  <CardTitle className="...">
    {post.title}
  </CardTitle>
</Link>
```

**Why:** Links to the in-app detail page while maintaining static export compatibility.

### 7. Frontend: Add Suspense Boundary for useSearchParams

**File:** `frontend/src/app/posts/page.tsx`

**Change:** Wrap the component using `useSearchParams` in a Suspense boundary.

```tsx
"use client"

import { useEffect, useState, useCallback, useRef, Suspense } from "react"
// ... other imports

export default function PostsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <PostsContent />
    </Suspense>
  )
}

function PostsContent() {
  const searchParams = useSearchParams()
  // ... rest of the original component code
}
```

**Why:** Next.js 14 requires `useSearchParams()` to be wrapped in Suspense for static generation.

---

## Backend Deployment

### Step 1: Set Environment Variables

```bash
az webapp config appsettings set \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --settings \
    LLM_PROVIDER=azure \
    AZURE_OPENAI_ENDPOINT="https://YOUR-OPENAI-RESOURCE.openai.azure.com/" \
    AZURE_OPENAI_KEY="YOUR-KEY" \
    AZURE_OPENAI_DEPLOYMENT="YOUR-DEPLOYMENT-NAME" \
    DATABASE_URL="sqlite:////home/data/reddit_monitor.db" \
    REDDIT_USER_AGENT="CopilotStudioMonitor/1.0" \
    ALLOWED_ORIGINS="https://YOUR-FRONTEND.azurestaticapps.net" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

**Critical settings:**
- `DATABASE_URL`: Note the 4 slashes (`////`) - three for SQLite prefix, one for absolute path
- `SCM_DO_BUILD_DURING_DEPLOYMENT=true`: Tells Azure to run `pip install` during deployment
- `ALLOWED_ORIGINS`: Must match your Static Web App URL exactly

### Step 2: Configure Startup Command

```bash
az webapp config set \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --startup-file "gunicorn -w 2 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0" \
  --always-on true
```

**Important:** Do NOT specify a port (like `--bind 0.0.0.0:8000`). Azure provides the PORT environment variable and expects the app to bind to it. Gunicorn without a port specification defaults to the PORT env var.

### Step 3: Create Deployment ZIP (Use WSL/Linux)

**Critical:** Windows-created ZIP files may fail to extract on Azure Linux. Use WSL or a Unix-compatible zip tool.

```bash
# From WSL or Linux terminal
cd /mnt/c/path/to/copilot-studio-reddit-monitor/backend

# Remove old ZIP if exists
rm -f deploy.zip

# Create ZIP with proper Unix format
zip -r deploy.zip app migrations requirements.txt
```

**Do NOT include:**
- `.env` file (secrets are in Azure settings)
- `data/` folder (database)
- `__pycache__/` folders
- `.venv/` folder

### Step 4: Deploy to Azure

```bash
az webapp deployment source config-zip \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --src deploy.zip
```

This will:
1. Upload the ZIP
2. Run Oryx build (installs requirements.txt)
3. Start the application

**Expected output:** Build successful, site starting...

### Step 5: Verify Backend

```bash
curl https://YOUR-APP.azurewebsites.net/api/health
```

**Expected response:**
```json
{"status":"healthy","scheduler_running":true}
```

---

## Frontend Deployment

### Step 1: Set API URL Environment Variable

The `NEXT_PUBLIC_API_URL` is baked into the build, so set it before building:

```bash
# Windows CMD
set NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.azurewebsites.net

# PowerShell
$env:NEXT_PUBLIC_API_URL="https://YOUR-BACKEND.azurewebsites.net"

# Linux/Mac
export NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.azurewebsites.net
```

### Step 2: Install Dependencies and Build

```bash
cd frontend
npm install
npm run build
```

**Expected output:** Static pages generated in `out/` folder.

### Step 3: Get Static Web App Deployment Token

```bash
az staticwebapp secrets list \
  --name mcs-social-monitor \
  --resource-group mcs-social-monitor-rg \
  --query "properties.apiKey" -o tsv
```

Save this token for deployment.

### Step 4: Install SWA CLI (if not installed)

```bash
npm install -g @azure/static-web-apps-cli
```

### Step 5: Deploy Static Files

```bash
cd frontend
npx swa deploy out --deployment-token "YOUR-TOKEN" --env production
```

**Expected output:** `Project deployed to https://YOUR-SITE.azurestaticapps.net`

### Step 6: Verify Frontend

Open `https://YOUR-SITE.azurestaticapps.net` in a browser. The dashboard should load and fetch data from the backend API.

---

## Environment Variables Reference

### Backend (Azure App Service)

| Variable | Value | Description |
|----------|-------|-------------|
| `LLM_PROVIDER` | `azure` | Use Azure OpenAI instead of Ollama |
| `AZURE_OPENAI_ENDPOINT` | `https://xxx.openai.azure.com/` | Your Azure OpenAI endpoint (no path suffix) |
| `AZURE_OPENAI_KEY` | `xxx` | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-5.2-chat` | Your model deployment name |
| `DATABASE_URL` | `sqlite:////home/data/reddit_monitor.db` | SQLite path (4 slashes!) |
| `REDDIT_USER_AGENT` | `CopilotStudioMonitor/1.0` | User agent for Reddit API |
| `ALLOWED_ORIGINS` | `https://xxx.azurestaticapps.net` | Frontend URL for CORS |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Enable pip install during deploy |

### Frontend (Build-time)

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://xxx.azurewebsites.net` | Backend API URL (set before build) |

---

## Troubleshooting Guide

### Issue: ZIP Deployment Fails with "Extract zip" Error

**Cause:** ZIP created on Windows has incompatible format.

**Solution:** Create ZIP using WSL or Linux:
```bash
wsl bash -c "cd /mnt/c/path/to/backend && rm -f deploy.zip && zip -r deploy.zip app migrations requirements.txt"
```

### Issue: "ModuleNotFoundError: No module named 'uvicorn'"

**Cause:** `SCM_DO_BUILD_DURING_DEPLOYMENT` not set, so pip install didn't run.

**Solution:**
```bash
az webapp config appsettings set \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
```
Then redeploy.

### Issue: Container Exits with Code 1 Immediately

**Cause:** Usually startup command issue or missing dependencies.

**Solution:**
1. Enable logging: `az webapp log config --resource-group RG --name APP --docker-container-logging filesystem`
2. Check logs: `az webapp log download --resource-group RG --name APP --log-file logs.zip`
3. Look in `LogFiles/*_default_docker.log` for Python errors

### Issue: "Page /posts/[id] is missing generateStaticParams()"

**Cause:** Static export cannot handle dynamic routes like `/posts/[id]`.

**Solution:** Use query parameter routing instead. Create `/posts/detail/page.tsx` and use URLs like `/posts/detail?id=xxx`. See section 5 above.

### Issue: "useSearchParams() should be wrapped in a suspense boundary"

**Cause:** Next.js 14 requires Suspense for useSearchParams in static generation.

**Solution:** Wrap component using useSearchParams in `<Suspense>`:
```tsx
export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ComponentUsingSearchParams />
    </Suspense>
  )
}
```

### Issue: CORS Errors in Browser Console

**Cause:** `ALLOWED_ORIGINS` doesn't match frontend URL exactly.

**Solution:** Ensure the origin matches exactly (including `https://` and no trailing slash):
```bash
az webapp config appsettings set \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --settings ALLOWED_ORIGINS="https://gray-mushroom-0dfd18903.1.azurestaticapps.net"
```

### Issue: Scheduler Not Running

**Cause:** "Always On" not enabled (app sleeps after inactivity).

**Solution:**
```bash
az webapp config set \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --always-on true
```

---

## Deployment Commands Quick Reference

```bash
# ===== BACKEND =====

# Set environment variables
az webapp config appsettings set \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --settings \
    LLM_PROVIDER=azure \
    AZURE_OPENAI_ENDPOINT="https://YOUR-RESOURCE.openai.azure.com/" \
    AZURE_OPENAI_KEY="YOUR-KEY" \
    AZURE_OPENAI_DEPLOYMENT="gpt-5.2-chat" \
    DATABASE_URL="sqlite:////home/data/reddit_monitor.db" \
    REDDIT_USER_AGENT="CopilotStudioMonitor/1.0" \
    ALLOWED_ORIGINS="https://YOUR-FRONTEND.azurestaticapps.net" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true

# Set startup command
az webapp config set \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --startup-file "gunicorn -w 2 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0" \
  --always-on true

# Create ZIP (from WSL)
wsl bash -c "cd /mnt/c/path/to/backend && rm -f deploy.zip && zip -r deploy.zip app migrations requirements.txt"

# Deploy backend
az webapp deployment source config-zip \
  --resource-group mcs-social-monitor-rg \
  --name mcs-social-api \
  --src backend/deploy.zip

# Verify backend
curl https://mcs-social-api-xxx.azurewebsites.net/api/health

# ===== FRONTEND =====

# Build (set API URL first)
cd frontend
set NEXT_PUBLIC_API_URL=https://mcs-social-api-xxx.azurewebsites.net
npm run build

# Get deployment token
az staticwebapp secrets list \
  --name mcs-social-monitor \
  --resource-group mcs-social-monitor-rg \
  --query "properties.apiKey" -o tsv

# Deploy frontend
npx swa deploy out --deployment-token "TOKEN" --env production

# ===== USEFUL COMMANDS =====

# View backend logs
az webapp log tail --resource-group mcs-social-monitor-rg --name mcs-social-api

# Restart backend
az webapp restart --resource-group mcs-social-monitor-rg --name mcs-social-api

# List all settings
az webapp config appsettings list --resource-group mcs-social-monitor-rg --name mcs-social-api
```

---

## Current Deployment Details

| Resource | Name | URL |
|----------|------|-----|
| Resource Group | `mcs-social-monitor-rg` | - |
| Backend (App Service) | `mcs-social-api` | https://mcs-social-api-amafe4bmc8b5cnf9.swedencentral-01.azurewebsites.net |
| Frontend (Static Web App) | `mcs-social-monitor` | https://gray-mushroom-0dfd18903.1.azurestaticapps.net |
| Azure OpenAI | `mcs-sociallistener-oai` | Deployment: `gpt-5.2-chat` |

---

## Cost Estimate

| Resource | Tier | Monthly Cost |
|----------|------|--------------|
| App Service | B1 Basic | ~$13 |
| Static Web Apps | Free | $0 |
| Azure OpenAI | Pay-per-use | Variable |
| **Total** | | **~$13 + OpenAI usage** |
