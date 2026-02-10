# Deployment Plan: PWA + Notifications + Responsive UI

**Branch**: `pwa-notifications-responsive`
**Target**: EMEA (mcs-social-api-emea / mcs-social-web)

---

## What's Being Deployed

| Component | Changes |
|-----------|---------|
| **Backend** | 3 new DB tables, 9 new API endpoints, notification service, new scheduler job, pywebpush dependency |
| **Frontend** | PWA manifest + service worker, notification bell + preferences, responsive mobile layout |
| **Config** | 3 new env vars (VAPID keys) — optional for initial deploy |

---

## Pre-Deployment Checklist

### 1. Generate VAPID Keys (optional — push won't work without them, but everything else will)

```bash
cd backend && source venv/bin/activate
python -c "
from py_vapid import Vapid
v = Vapid()
v.generate_keys()
print('VAPID_PRIVATE_KEY:')
print(v.private_pem().decode())
print()
print('VAPID_PUBLIC_KEY:')
print(v.public_key)
"
```

Save both values — you'll need them for Azure App Settings.

### 2. Verify Branch is Clean

```bash
git log main..HEAD --oneline
# Should show 3 commits:
# - Add PWA support, notification system, and responsive mobile UI
# - Make notification polling resilient to expired auth tokens
# - Fix push notification API URL mismatches
```

---

## Database Migration

**Risk: LOW** — All changes are additive (new tables only). No modifications to existing tables.

### New Tables Created Automatically on Startup:

| Table | Purpose |
|-------|---------|
| `notification_preferences` | Per-user notification settings (boiling, negative, product areas, push) |
| `notifications` | Generated notification records (type, title, read status) |
| `push_subscriptions` | Web Push endpoint registrations |

**How it works**: `init_db()` calls `Base.metadata.create_all()` which creates any tables that don't exist yet. The notification models are imported in `database.py` line 37. No `run_migrations()` changes needed — these are entirely new tables.

**Verification after deploy**:
```bash
# SSH into App Service or use Kudu console
sqlite3 /home/data/reddit_monitor.db ".tables"
# Should include: notification_preferences, notifications, push_subscriptions
```

---

## Deployment Steps

### Step 1: Deploy Backend

```bash
./scripts/deploy-emea.sh --backend
```

This will:
- Package backend code into deploy.zip
- Upload to Azure App Service
- Oryx runs `pip install -r requirements.txt` (installs pywebpush, py-vapid)
- App restarts → `init_db()` creates the 3 new tables
- New scheduler job (notification generation every 5 min) starts automatically

### Step 2: Set VAPID Environment Variables (if using push)

```bash
az webapp config appsettings set \
  --resource-group mcs-social-rg \
  --name mcs-social-api-emea \
  --settings \
    VAPID_PRIVATE_KEY="<paste private key>" \
    VAPID_PUBLIC_KEY="<paste public key>" \
    VAPID_CLAIMS_EMAIL="mailto:admin@microsoft.com"
```

**Note**: If you skip this, push notifications won't send but everything else (in-app bell, preferences, polling) works fine. You can add keys later.

### Step 3: Verify Backend

```bash
# Health check
curl https://mcs-social-api-emea.azurewebsites.net/api/health

# Notification endpoints
curl https://mcs-social-api-emea.azurewebsites.net/api/notifications/vapid-public-key

# Check tables exist (via Kudu or SSH)
# sqlite3 /home/data/reddit_monitor.db ".tables"
```

### Step 4: Deploy Frontend

```bash
./scripts/deploy-emea.sh --frontend
```

This will:
- Set `NEXT_PUBLIC_*` env vars
- Run `npm run build` (bakes in API URL)
- Deploy static files to Azure Static Web Apps

### Step 5: Verify Frontend

1. Open https://thankful-tree-0325e0003.1.azurestaticapps.net
2. Check bell icon appears in header
3. Check hamburger menu on mobile viewport (DevTools → Toggle Device Toolbar)
4. Check `/manifest.json` loads (PWA installable)
5. Check DevTools → Application → Service Workers → `sw.js` registered

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New tables fail to create | Very Low | Backend errors on notification endpoints | Tables auto-created by SQLAlchemy; verify via `.tables` |
| pywebpush install fails | Very Low | Push notifications don't send | App still works; push is optional |
| VAPID keys misconfigured | Low | Push fails silently | Keys optional; app degrades gracefully |
| Service worker caches stale content | Low | Users see old UI | SW uses network-first for pages; cache busted on new deploy |
| Responsive CSS breaks desktop | Very Low | Layout issues | Tested at both 390px and 1280px with Playwright |
| Notification polling overloads DB | Very Low | Slow queries | Polls every 2 min per user, simple indexed queries |
| Existing functionality breaks | None | N/A | All changes are additive — no existing tables, endpoints, or UI modified destructively |

---

## Rollback Strategy

### If Backend Issues

```bash
# Redeploy main branch
git checkout main
./scripts/deploy-emea.sh --backend
```

The 3 new tables will remain in the DB but are harmless — no existing code references them. They'll be silently ignored until the feature is redeployed.

### If Frontend Issues

```bash
# Redeploy main branch frontend
git checkout main
./scripts/deploy-emea.sh --frontend
```

The service worker may remain cached in users' browsers. It will be replaced on next visit since the new deploy produces different asset hashes.

### If Push Notifications Cause Issues

```bash
# Just remove VAPID keys — disables push without redeploying
az webapp config appsettings delete \
  --resource-group mcs-social-rg \
  --name mcs-social-api-emea \
  --setting-names VAPID_PRIVATE_KEY VAPID_PUBLIC_KEY
```

### Nuclear Option (full rollback)

```bash
# 1. Redeploy both from main
git checkout main
./scripts/deploy-emea.sh

# 2. Remove VAPID keys
az webapp config appsettings delete \
  --resource-group mcs-social-rg \
  --name mcs-social-api-emea \
  --setting-names VAPID_PRIVATE_KEY VAPID_PUBLIC_KEY VAPID_CLAIMS_EMAIL

# 3. Clean up orphaned tables (optional — they're harmless)
# sqlite3 /home/data/reddit_monitor.db "DROP TABLE IF EXISTS notifications; DROP TABLE IF EXISTS notification_preferences; DROP TABLE IF EXISTS push_subscriptions;"
```

---

## Post-Deployment Testing

```bash
# 1. Backend health
curl -s https://mcs-social-api-emea.azurewebsites.net/api/health

# 2. VAPID key endpoint
curl -s https://mcs-social-api-emea.azurewebsites.net/api/notifications/vapid-public-key

# 3. Notification preferences (with auth token)
curl -s -H "Authorization: Bearer <token>" \
  https://mcs-social-api-emea.azurewebsites.net/api/notifications/preferences

# 4. Unread count
curl -s -H "Authorization: Bearer <token>" \
  https://mcs-social-api-emea.azurewebsites.net/api/notifications/unread-count

# 5. PWA manifest
curl -s https://thankful-tree-0325e0003.1.azurestaticapps.net/manifest.json
```

### Manual Testing

1. Sign in → bell icon visible in header
2. Click bell → empty "No notifications yet" (expected on fresh deploy)
3. Click gear → preferences dialog opens
4. Toggle "Boiling posts" and "Negative sentiment" → save
5. On mobile: hamburger menu → drawer slides in → navigate between pages
6. In DevTools → Application → check "Manifest" and "Service Workers" tabs
7. Wait for next analysis batch → notifications should appear in bell

---

## Timeline

| Step | Duration | Notes |
|------|----------|-------|
| Generate VAPID keys | 1 min | One-time setup |
| Deploy backend | 3-5 min | Includes pip install |
| Set VAPID env vars | 1 min | Optional |
| Verify backend | 2 min | curl + table check |
| Deploy frontend | 3-5 min | Includes npm build |
| Verify frontend | 5 min | Manual testing |
| **Total** | **~15-20 min** | |
