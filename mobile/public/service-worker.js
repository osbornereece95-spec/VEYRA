const CACHE_NAME = "veyra-shell-v1";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["/", "/manifest.json", "/icon.png"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (await caches.match("/")) ||
          new Response("VEYRA is offline. Please reconnect to the internet.", {
            headers: { "Content-Type": "text/plain" }
          });
      })
    );
    return;
  }

  if (url.pathname.startsWith("/_expo/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        const network = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        return cached || network;
      })
    );
  }
});


// VEYRA_PUSH_NOTIFICATION_HANDLERS
self.addEventListener("push", event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const options = {
    body: payload.body || "You have a new update.",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: payload.tag || "veyra-notification",
    renotify: false,
    data: {
      url: payload.url || "/",
      category: payload.category || "account"
    }
  };

  event.waitUntil(
    self.registration.showNotification(
      payload.title || "VEYRA",
      options
    )
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil((async () => {
    let destination;

    try {
      destination = new URL(
        event.notification.data?.url || "/",
        self.location.origin
      );
    } catch (error) {
      destination = new URL("/", self.location.origin);
    }

    if (destination.origin !== self.location.origin) {
      destination = new URL("/", self.location.origin);
    }

    const allowedTabs = ["Events", "Profile"];
    const requestedTab = destination.searchParams.get("veyra_tab");

    if (requestedTab && !allowedTabs.includes(requestedTab)) {
      destination.searchParams.delete("veyra_tab");
    }

    const destinationUrl = destination.href;
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        if ("navigate" in client) {
          await client.navigate(destinationUrl);
        }
        return client.focus();
      }
    }

    return self.clients.openWindow(destinationUrl);
  })());
});
