const CACHE_NAME = "cs-monitor-v1";
const STATIC_URLS = ["/", "/posts", "/clustering", "/contributors", "/analytics", "/product-areas"];

// Install: cache static pages
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // API calls: network only (don't cache dynamic data)
  if (url.pathname.startsWith("/api")) return;

  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Pages: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notification handler
self.addEventListener("push", (event) => {
  let data = { type: "notification", title: "New notification" };
  try {
    data = event.data.json();
  } catch (e) {
    // Use defaults
  }

  const typeLabels = {
    boiling: "Boiling Post",
    negative: "Negative Sentiment",
    product_area: "Product Area Alert",
  };

  const title = typeLabels[data.type] || "CS Monitor";
  const options = {
    body: data.title,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: `/posts/detail?id=${data.post_id}` },
    tag: `notification-${data.post_id}`,
  };

  if (data.product_area) {
    options.body += ` (${data.product_area})`;
  }

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Update app badge if supported
      if (navigator.setAppBadge) {
        return self.registration.getNotifications().then((notifications) => {
          navigator.setAppBadge(notifications.length);
        });
      }
    })
  );
});

// Notification click: open/focus the app at the post URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(targetUrl);
    })
  );
});
