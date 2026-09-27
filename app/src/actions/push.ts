/**
 * Real phone notifications (Web Push), so iPhones get them too, even with bubl closed.
 *
 * - getPushKey: the app's public VAPID key, which the phone needs to subscribe.
 * - savePushSubscription / removePushSubscription: this phone's subscription.
 * - pushNearby: "You drifted into a bubble", pushed back to the caller's own
 *   phones after the server checks they really are inside it. Preview info only
 *   (kind and place name), never sealed content.
 * - pushToUser: used by notify() for loves, waves, matches and messages.
 *
 * Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in DeepSpace secrets; without
 * them every push quietly does nothing.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { nearbyNotice } from '../bubl/lib/notifications'
import { checkPop } from '../bubl/lib/pop'
import type { Bubble, Pop } from '../bubl/types'
import { isPushEndpoint, sendWebPush, type PushSubscriptionKeys, type VapidKeys } from '../server/webpush'

type SubscriptionRow = PushSubscriptionKeys & { userId: string }
type BubbleRow = Omit<Bubble, 'id' | 'createdAt'>

/** What the service worker shows (public/sw.js). */
export interface PushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
}

const DEFAULT_SUBJECT = 'https://bubl-divhacks.app.space'
const MAX_SUBSCRIPTIONS_PER_USER = 10

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const base64Url = (v: unknown, length: number): v is string => typeof v === 'string' && v.length === length && /^[A-Za-z0-9_-]+$/.test(v)

export function vapidFrom(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || DEFAULT_SUBJECT }
}

/** Pushes to every phone the user subscribed. Never throws; drops dead subscriptions. */
export async function pushToUser(tools: ActionTools, env: Env, userId: string, payload: PushPayload): Promise<number> {
  const vapid = vapidFrom(env)
  if (!vapid) return 0
  try {
    const subs = await tools.query<SubscriptionRow>('pushSubscriptions', { where: { userId }, limit: MAX_SUBSCRIPTIONS_PER_USER })
    if (!subs.success) return 0
    const results = await Promise.all(
      subs.data.records.map(async (row) => {
        const res = await sendWebPush(vapid, row.data, payload).catch(() => ({ ok: false as const, gone: false, status: -1 }))
        if (!res.ok && res.gone) await tools.remove('pushSubscriptions', row.recordId)
        if (!res.ok && !res.gone) console.warn(`[push] push service answered ${res.status}`)
        return res.ok
      }),
    )
    return results.filter(Boolean).length
  } catch (err) {
    console.warn(`[push] could not push: ${err instanceof Error ? err.message : 'unknown error'}`)
    return 0
  }
}

export const getPushKey: ActionHandler<Env> = async ({ env }) => {
  const vapid = vapidFrom(env)
  if (!vapid) return { success: false, error: 'Push notifications are not set up' }
  return { success: true, data: { publicKey: vapid.publicKey } }
}

/** Params: `{ endpoint, p256dh, auth }` from PushSubscription.toJSON(). One row per endpoint. */
export const savePushSubscription: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { endpoint, p256dh, auth } = params
  if (!nonEmptyString(endpoint) || !isPushEndpoint(endpoint)) return { success: false, error: 'Not a browser push endpoint' }
  if (!base64Url(p256dh, 87) || !base64Url(auth, 22)) return { success: false, error: 'Invalid subscription keys' }

  const existing = await tools.query<SubscriptionRow>('pushSubscriptions', { where: { endpoint }, limit: 1 })
  const row = existing.success ? existing.data.records[0] : undefined
  if (row) {
    // Same phone, maybe a different account now: it belongs to whoever subscribed last.
    const updated = await tools.update('pushSubscriptions', row.recordId, { userId, p256dh, auth })
    if (!updated.success) return updated
  } else {
    const created = await tools.create('pushSubscriptions', { userId, endpoint, p256dh, auth })
    if (!created.success) return created
  }
  return { success: true, data: { saved: true } }
}

export const removePushSubscription: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { endpoint } = params
  if (!nonEmptyString(endpoint)) return { success: false, error: 'endpoint is required' }
  const removed = await tools.deleteWhere('pushSubscriptions', { endpoint, userId }, 10)
  if (!removed.success) return removed
  return { success: true, data: { removed: removed.data.deleted } }
}

/** Params: `{ bubbleId, lat, lng }`. Pushes only if the caller is inside a bubble they haven't popped or written. */
export const pushNearby: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const { bubbleId, lat, lng } = params
  if (!nonEmptyString(bubbleId) || !isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return { success: false, error: 'bubbleId, lat and lng are required' }
  }
  const got = await tools.get<BubbleRow>('bubbles', bubbleId)
  if (!got.success) return { success: false, error: 'Bubble not found' }
  const bubble = got.data.record.data
  if (bubble.authorId === userId || !checkPop(bubble, { lat, lng }).ok) return { success: true, data: { pushed: 0 } }

  const popped = await tools.query<Pick<Pop, 'userId'>>('pops', { where: { userId, bubbleId }, limit: 1 })
  if (popped.success && popped.data.records.length > 0) return { success: true, data: { pushed: 0 } }

  const pushed = await pushToUser(tools, env, userId, {
    ...nearbyNotice(bubble),
    url: `/home?bubble=${encodeURIComponent(bubbleId)}`,
    tag: bubbleId,
  })
  return { success: true, data: { pushed } }
}
