// Web Push on this phone: once notifications are allowed, subscribe through the
// service worker (public/sw.js) and save the subscription on the server, which
// then sends real notifications (src/actions/push.ts), even with bubl closed.
// iPhones need this: they don't show notifications a page creates itself.

import { getAuthToken } from 'deepspace'
import { AUTH_OFFLINE } from './authActions'

let active = false
let endpoint: string | null = null

/** True once this phone's push subscription is saved: the server sends its notifications. */
export const pushActive = () => active

async function call<T>(name: string, params: object = {}): Promise<T | null> {
  try {
    const token = await getAuthToken().catch(() => null)
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      keepalive: true, // still delivered if the app is being closed
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T }
    return res.ok && body.success ? (body.data ?? null) : null
  } catch {
    return null
  }
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!current) return false
  const bytes = new Uint8Array(current)
  return bytes.length === wanted.length && bytes.every((b, i) => b === wanted[i])
}

/** Subscribe this phone (no-op until notifications are allowed). Safe to call on every app start. */
export async function setupPush(): Promise<boolean> {
  if (AUTH_OFFLINE || typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  try {
    await navigator.serviceWorker.register('/sw.js')
    const registration = await navigator.serviceWorker.ready
    const key = await call<{ publicKey: string }>('getPushKey')
    if (!key) return false
    const serverKey = keyBytes(key.publicKey)

    let subscription = await registration.pushManager.getSubscription()
    // A subscription made with another key (e.g. keys were rotated) can't be reused.
    if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
      await subscription.unsubscribe()
      subscription = null
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey })

    const json = subscription.toJSON()
    active = Boolean(await call('savePushSubscription', { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }))
    endpoint = active ? (json.endpoint ?? null) : null
    if (active) reportAppOpen(document.visibilityState === 'visible')
    return active
  } catch {
    return false
  }
}

/** Stop pushes to this phone: unsubscribe and forget the subscription on the server. */
export async function disablePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await call('removePushSubscription', { endpoint: subscription.endpoint })
      await subscription.unsubscribe()
    }
  } catch {
    // Nothing to undo.
  }
  active = false
  endpoint = null
}

/** Tell the server whether bubl is on screen here: while it is, nothing is pushed (the in-app banner shows instead). */
export function reportAppOpen(open: boolean) {
  if (active && endpoint) void call('setAppOpen', { endpoint, open })
}

/** Ask the server to push "You drifted into a bubble" to this phone (it checks you're really there). */
export function requestNearbyPush(bubbleId: string, you: { lat: number; lng: number }) {
  // On screen, the in-app banner already says it.
  if (active && document.visibilityState !== 'visible') void call('pushNearby', { bubbleId, lat: you.lat, lng: you.lng })
}
