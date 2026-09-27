/**
 * You tab: myPopped, myDropped, removePopped and deleteDropped. All of them only
 * ever read or change the caller's own data.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isExpired } from '../bubl/lib/pop'
import { deleteStoredMedia } from '../server/media-routes'
import type { Bubble, DroppedItem, Pop, PoppedItem } from '../bubl/types'

type BubbleRow = Omit<Bubble, 'id' | 'createdAt'>
type PopRow = Omit<Pop, 'id'>

/** Bubbles the caller has popped, newest pop first. */
export const myPopped: ActionHandler<Env> = async ({ userId, tools }) => {
  const pops = await tools.query<PopRow>('pops', { where: { userId }, orderBy: 'poppedAt', orderDir: 'desc', limit: 500 })
  if (!pops.success) return pops

  const items = await Promise.all(
    pops.data.records.map(async (p): Promise<PoppedItem | undefined> => {
      const bubble = await tools.get<BubbleRow>('bubbles', p.data.bubbleId)
      if (!bubble.success) return undefined
      const b = bubble.data.record.data
      return {
        bubbleId: p.data.bubbleId,
        title: b.title,
        category: b.category,
        placeName: b.placeName,
        poppedAt: p.data.poppedAt,
        loved: Boolean(p.data.loved),
      }
    }),
  )
  return { success: true, data: items.filter((i): i is PoppedItem => i !== undefined) }
}

/** Live bubbles the caller dropped, newest first, with how many others popped each. */
export const myDropped: ActionHandler<Env> = async ({ userId, tools }) => {
  const mine = await tools.query<BubbleRow>('bubbles', { where: { authorId: userId, status: 'live' }, limit: 500 })
  if (!mine.success) return mine

  const items = await Promise.all(
    mine.data.records.map(async (r): Promise<DroppedItem> => {
      const pops = await tools.query<PopRow>('pops', { where: { bubbleId: r.recordId }, limit: 1000 })
      const popCount = pops.success ? pops.data.records.filter((p) => p.data.userId !== userId).length : 0
      return {
        bubbleId: r.recordId,
        title: r.data.title,
        category: r.data.category,
        placeName: r.data.placeName,
        createdAt: r.createdAt,
        expiresAt: r.data.expiresAt,
        status: isExpired(r.data.expiresAt) ? 'expired' : 'floating',
        popCount,
      }
    }),
  )
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { success: true, data: items }
}

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
export const isSeedBubble = (id: string) => id.startsWith('seed-')

/** Deletes every match of `where`, a batch at a time. Callers scope `where` to rows they may delete. */
async function drain(tools: ActionTools, collection: string, where: Record<string, unknown>) {
  for (;;) {
    const res = await tools.deleteWhere(collection, where, 500)
    if (!res.success) return res
    if (res.data.deleted < 500) return { success: true as const }
  }
}

/** Takes a popped bubble off the caller's list by removing their pop. They'd have to walk back to pop it again. */
export const removePopped: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { bubbleId } = params
  if (!nonEmptyString(bubbleId)) return { success: false, error: 'bubbleId is required' }
  const removed = await drain(tools, 'pops', { userId, bubbleId })
  if (!removed.success) return removed
  return { success: true, data: { removed: true } }
}

/** Deletes a bubble the caller dropped, with its map preview, pops and media. Seeded demo bubbles stay. */
export const deleteDropped: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const { bubbleId } = params
  if (!nonEmptyString(bubbleId)) return { success: false, error: 'bubbleId is required' }
  if (isSeedBubble(bubbleId)) return { success: false, error: 'Demo bubbles can’t be deleted' }

  const got = await tools.get<BubbleRow>('bubbles', bubbleId)
  if (!got.success) return { success: false, error: 'Bubble not found' }
  if (got.data.record.data.authorId !== userId) return { success: false, error: 'Only your own bubbles can be deleted' }

  const media = await tools.query<{ storageKey: string }>('media_uploads', { where: { bubbleId }, limit: 50 })
  if (media.success) {
    for (const m of media.data.records) {
      await deleteStoredMedia(env, m.data.storageKey)
      await tools.remove('media_uploads', m.recordId)
    }
  }
  const pops = await drain(tools, 'pops', { bubbleId })
  if (!pops.success) return pops
  const preview = await tools.remove('bubble_previews', bubbleId)
  if (!preview.success) console.warn(`[deleteDropped] preview not removed: ${preview.error}`)
  const bubble = await tools.remove('bubbles', bubbleId)
  if (!bubble.success) return bubble
  return { success: true, data: { deleted: true } }
}
