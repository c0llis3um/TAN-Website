import { precacheAndRoute } from 'workbox-precaching'

// injectManifest strategy — vite-plugin-pwa replaces this with the real
// build asset list at build time.
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Push notifications ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'DeFi Tanda', body: event.data.text() }
  }

  const { title = 'DeFi Tanda', body = '', url = '/app', podId } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: podId ? `/app/pod/${podId}` : url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/app'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      for (const client of clients) {
        if ('navigate' in client && 'focus' in client) return client.focus().then(() => client.navigate(targetUrl))
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
