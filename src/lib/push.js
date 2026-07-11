/**
 * push.js — client-side Web Push subscription flow.
 *
 * Requires VITE_VAPID_PUBLIC_KEY (safe to expose — it's the public half of
 * the VAPID keypair) and the PWA service worker to already be registered
 * (handled automatically by vite-plugin-pwa's injected register script).
 */

import { savePushSubscription } from './db'

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// Web Push wants the VAPID public key as a Uint8Array, not the base64url
// string the API gives us.
function urlBase64ToUint8Array(base64String) {
  const padding    = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64     = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData    = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/**
 * Requests notification permission (if not already decided) and subscribes
 * this browser to push, saving the subscription against userId.
 * Returns { ok: true } or { ok: false, reason }.
 */
export async function enablePushNotifications(userId) {
  if (!isPushSupported()) return { ok: false, reason: 'not_supported' }

  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: permission }
  }

  const vapidKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()
  if (!vapidKey) return { ok: false, reason: 'not_configured' }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
  }

  const json = subscription.toJSON()
  const { error } = await savePushSubscription({
    user_id:     userId,
    endpoint:    json.endpoint,
    keys_p256dh: json.keys.p256dh,
    keys_auth:   json.keys.auth,
  })
  if (error) return { ok: false, reason: error.message }

  return { ok: true }
}
