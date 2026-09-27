/**
 * You tab: myPopped and myDropped. Both only ever return the caller's own data.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isExpired } from '../bubl/lib/pop'
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
