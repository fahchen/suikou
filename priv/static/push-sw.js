// Web Push handlers, imported into the Workbox-generated sw.js via
// `workbox.importScripts` (see assets/vite.config.ts). Kept as a hand-written
// static file rather than a bundled entry so the tuned generateSW app-shell
// config stays untouched — this only layers push/notificationclick on top.
//
// Served with no-cache (endpoint.ex) so a changed handler reaches installed
// PWAs on the next service-worker update instead of being pinned to HTTP cache.

self.addEventListener("push", (event) => {
  // Payload is the JSON Suikou.Push encodes: { title, body, url }. Guard against
  // a contentless push (some services send one to wake the worker).
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }

  const title = data.title || "Suikou"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // The review URL to open on click, and a stable tag so repeated pings for
      // the same review collapse instead of stacking.
      data: { url: data.url || "/" },
      tag: data.url || "suikou",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })

      // Already showing the target review: focus it. Navigating would reload the
      // page and throw away scroll position and any draft the human is typing.
      const onTarget = windows.find((client) => client.url === url)
      if (onTarget) return onTarget.focus()

      // Some other Suikou window (usually the board): steer it to the review
      // rather than opening a second one. An installed PWA has a single window,
      // so opening another is what makes a duplicate appear in the browser.
      for (const client of windows) {
        try {
          await client.focus()
          return await client.navigate(url)
        } catch {
          // navigate() rejects for a client this worker doesn't control yet;
          // fall through to opening a window.
          break
        }
      }

      if (self.clients.openWindow) return self.clients.openWindow(url)
    })(),
  )
})
