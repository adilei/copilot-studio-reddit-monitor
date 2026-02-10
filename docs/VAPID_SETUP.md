# VAPID Keys Setup Guide

VAPID (Voluntary Application Server Identification) keys are required for Web Push notifications. Without them, the notification bell and in-app polling still work, but native OS push notifications (the ones that pop up on your phone/desktop even when the app is closed) won't be sent.

## Quick Start

### 1. Generate Keys

```bash
cd backend
source venv/bin/activate   # or: source .venv/bin/activate

python -c "
from py_vapid import Vapid
v = Vapid()
v.generate_keys()
print('=== VAPID_PRIVATE_KEY ===')
print(v.private_pem().decode())
print('=== VAPID_PUBLIC_KEY ===')
print(v.public_key)
"
```

This outputs two values:
- **Private key** — a multi-line PEM string starting with `-----BEGIN EC PRIVATE KEY-----`
- **Public key** — a base64url-encoded string (one line)

### 2. Configure Locally

Add to `backend/.env`:

```env
VAPID_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIPa...
-----END EC PRIVATE KEY-----"
VAPID_PUBLIC_KEY="BNx7..."
VAPID_CLAIMS_EMAIL="mailto:your-email@microsoft.com"
```

### 3. Configure on Azure

```bash
az webapp config appsettings set \
  --resource-group mcs-social-rg \
  --name mcs-social-api-emea \
  --settings \
    VAPID_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIPa...
-----END EC PRIVATE KEY-----" \
    VAPID_PUBLIC_KEY="BNx7..." \
    VAPID_CLAIMS_EMAIL="mailto:admin@microsoft.com"
```

**Important**: The private key is multi-line. Azure App Settings handles this fine — paste the full PEM including the BEGIN/END lines.

### 4. Restart the Backend

After setting the keys, restart the app service:

```bash
az webapp restart --resource-group mcs-social-rg --name mcs-social-api-emea
```

### 5. Verify

```bash
curl https://mcs-social-api-emea.azurewebsites.net/api/notifications/vapid-public-key
# Should return: {"vapid_public_key":"BNx7..."}
# If empty string, keys aren't configured yet
```

---

## How Push Notifications Work

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │────>│   Backend    │────>│  Push Service    │
│  (Browser)   │     │  (FastAPI)   │     │ (Google/Mozilla) │
│              │<────│              │     │                  │
│  Bell badge  │     │  Generates   │     │  Delivers push   │
│  polls every │     │  notifs +    │     │  to browser/OS   │
│  2 minutes   │     │  sends push  │     │                  │
└─────────────┘     └──────────────┘     └─────────────────┘
```

1. **User enables push** in the notification preferences dialog
2. **Browser** requests permission, then creates a push subscription with Google/Mozilla's push service
3. **Frontend** sends the subscription (endpoint + keys) to `POST /api/notifications/push-subscribe`
4. **Backend** stores the subscription in the `push_subscriptions` table
5. **Every 5 minutes**, the notification job checks for new analyzed posts matching user preferences
6. **For each match**, backend sends a Web Push message via `pywebpush` using the VAPID private key
7. **Push service** delivers the message to the user's browser/OS
8. **Service worker** (`sw.js`) receives the push event and shows a native notification

---

## What Works Without VAPID Keys

| Feature | Without VAPID | With VAPID |
|---------|--------------|------------|
| Bell icon with unread count | Yes | Yes |
| Notification popover list | Yes | Yes |
| Mark read / Mark all read | Yes | Yes |
| Notification preferences | Yes | Yes |
| In-app polling (every 2 min) | Yes | Yes |
| Native OS push notifications | No | Yes |
| Background notifications (app closed) | No | Yes |
| App badge on home screen icon | No | Yes |

---

## Key Management

### Backup Your Keys

VAPID keys are a cryptographic keypair. If you lose the private key:
- All existing push subscriptions become invalid
- Users must re-enable push in their preferences
- No data is lost — just push delivery breaks until users re-subscribe

**Recommendation**: Store keys in Azure Key Vault or a secure password manager.

### Key Rotation

If you need to rotate keys (compromise, expiry):
1. Generate new keys
2. Update Azure App Settings
3. Restart backend
4. Users will get a push error on next delivery → stale subscriptions auto-removed
5. Users re-enable push in preferences → new subscriptions created with new keys

No manual cleanup needed — the backend automatically removes subscriptions that return 404/410.

---

## Installing the App (PWA)

### Android (Chrome)

1. Open the app URL in Chrome
2. Chrome shows an "Install app" banner at the bottom — tap **Install**
3. If no banner: tap the **three-dot menu** (top right) → **Install app** or **Add to Home Screen**
4. The app icon appears on your home screen
5. Open the app → bell icon → gear → **Enable push** → allow notifications when prompted

### iOS (Safari)

1. Open the app URL in **Safari** (not Chrome — iOS requires Safari for PWA)
2. Tap the **Share** button (square with arrow at the bottom)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add** in the top right
5. Open the app from home screen
6. **Note**: iOS push notifications require iOS 16.4+ and the app must be opened from the home screen icon (not Safari)

### Desktop (Chrome / Edge)

1. Open the app URL
2. Look for the **install icon** in the address bar (monitor with down arrow)
3. Click **Install**
4. Or: three-dot menu → **Install Copilot Studio Social Monitor**

### Enabling Push Notifications

After installing:
1. Open the app
2. Click the **bell icon** in the header
3. Click the **gear icon** to open notification preferences
4. Click **Enable** under "Push notifications"
5. **Allow** when the browser asks for notification permission
6. Done — you'll receive native notifications for boiling posts, negative sentiment, and selected product areas

---

## Troubleshooting

### Push not arriving

1. **Check keys are set**: `curl .../api/notifications/vapid-public-key` — should return non-empty key
2. **Check subscription exists**: Look in `push_subscriptions` table for the user
3. **Check notification was generated**: Look in `notifications` table for recent entries
4. **Check browser permissions**: Settings → Notifications → ensure site is allowed
5. **Check service worker**: DevTools → Application → Service Workers → should show `sw.js`

### "Enable push" button doesn't work

- Browser must support Push API (Chrome, Firefox, Edge — not Safari on macOS < Ventura)
- Page must be served over HTTPS (or localhost)
- User must grant notification permission when prompted

### Test push delivery manually

```bash
cd backend
source venv/bin/activate
python scripts/test_notifications.py --contributor-id 1 --type boiling --title "Test push notification"
```

This creates a notification and attempts to send push to all of the contributor's subscriptions.
